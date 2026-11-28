// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const relay=require('./relay-config.cjs');
const receiver=require('./torch-receive.cjs');
const auto=require('../core/auto-profile.cjs');
const wait=require('node:timers/promises').setTimeout;
const fs=require('node:fs'),path=require('node:path');
/* 2026-11-29 (the relay's free 100k requests a day ran out; The Seed's socket and change log were ~18% of them):
   - the change-log cursor is kept in data/cache/seed-live.json, so a restart asks only for what is new;
   - an idle socket is renewed every 3–4 h instead of every 25–35 min;
   - failed reconnects back off up to 15 min instead of 1 min;
   - while the relay's daily quota is spent (services/relay-gate.cjs) nothing is tried until it resets. */
const RENEW_MIN=180,RENEW_SPREAD=60,MAX_DELAY=15*60000;
const cursorFile=root=>root?path.join(root,'data','cache','seed-live.json'):'';
function loadCursor(root){try{const n=JSON.parse(fs.readFileSync(cursorFile(root),'utf8')).cursor;return Number.isSafeInteger(n)&&n>0?n:0;}catch{return 0;}}
function saveCursor(root,cursor){const f=cursorFile(root);if(!f)return;try{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify({cursor}));}catch{}}
function quotaSpent(){try{return require('./relay-gate.cjs').quotaSpent();}catch{return false;}}

async function reconcile(root,rows,signal){
 const wanted=new Set(rows.map(r=>r.game_key));
 const db=require('./store.cjs').openStore(root);
 let games;
 try{games=db.prepare("SELECT id,executable FROM games WHERE removed_at IS NULL AND executable!=''").all();}finally{db.close();}
 for(const game of games){
  signal.throwIfAborted();
  const key=await auto.exeKey(root,game.executable);
  if(!wanted.has(key))continue;
  const state=await receiver.receive(root,game.id,{signal,fresh:true,liveSync:true});
  if(['TORCH_INSTALL_FAILED','TORCH_RELAY_UNAVAILABLE','TORCH_DEFERRED'].includes(state.code))throw Error(state.code);
 }
}

function subscribe(root,{base,Socket=globalThis.WebSocket,fetcher=fetch,apply=reconcile,onReplay}={}){
 if(!Socket||process.env.MEGULIT_OFFLINE==='1'||process.env.MEGULIT_CARDINAL_REPLAY==='1')return;
 const bases=base?[base]:relay.seedBases(root,'receive');
 if(!bases.length)return;
 const owner=new AbortController();
 const fallbackAfter=new Map();
 let cursor=loadCursor(root);
 async function replay(base,signal){
  let more;
  do{
   const res=await fetcher(base+'/api/torch-release/changes?after='+cursor,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),redirect:'error',cache:'no-store'});
   if(!res.ok)throw Error('changes unavailable');
   const {changes}=await receiver.body(res);
   if(!Array.isArray(changes)||changes.length>128)throw Error('invalid changes');
   let end=cursor;
   for(const row of changes){
    if(!Number.isSafeInteger(row.seq)||row.seq<=end||!/^[a-f0-9]{64}$/.test(row.game_key))throw Error('invalid revision');
    end=row.seq;
   }
   if(changes.length)await apply(root,changes,signal);
   signal.throwIfAborted();if(end!==cursor)saveCursor(root,end);cursor=end;more=changes.length===128;
   onReplay?.({base,cursor,changes,more});
  }while(more);
 }
 async function run(){
  let delay=1000,attempt=0;
  while(!owner.signal.aborted){
   if(quotaSpent()){await wait(10*60000,null,{signal:owner.signal,ref:false}).catch(()=>{});continue;}
   const base=bases[attempt++%bases.length];
   const connection=new AbortController(),signal=AbortSignal.any([owner.signal,connection.signal]);
   let socket,work,dirty=false,opened=false;
   try{
    socket=new Socket(base.replace(/^http/,'ws')+'/api/torch-release/events');
    const closed=new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
    let timeout=setTimeout(()=>connection.abort(),15000);
    async function drain(){
     while(dirty&&!signal.aborted){
      dirty=false;
      await replay(base,signal);
      delay=1000;
     }
    }
    function wake(){
     dirty=true;
     if(!work)work=drain().catch(()=>connection.abort()).finally(()=>{work=null;if(dirty&&!signal.aborted)wake();});
    }
    socket.onopen=()=>{
     opened=true;
     clearTimeout(timeout);
     // Renew an idle transport so an undetected broken proxy or lost broadcast can recover.
     timeout=setTimeout(()=>connection.abort(),(RENEW_MIN+Math.random()*RENEW_SPREAD)*60000);
     wake();
    };
    socket.onmessage=e=>{if(e.data==='changed')wake();};
    socket.onerror=socket.onclose=()=>connection.abort();
    await closed;clearTimeout(timeout);
   }finally{connection.abort();socket?.close(1000,'reconnect');await work;}
   // Some mirrors serve the change log over HTTPS but refuse WebSocket upgrades.
   if(!opened&&!owner.signal.aborted&&Date.now()>=(fallbackAfter.get(base)||0)){
    fallbackAfter.set(base,Date.now()+60000);
    await replay(base,owner.signal).catch(()=>{});
   }
   if(!owner.signal.aborted)await wait(delay,null,{signal:owner.signal,ref:false});
   delay=Math.min(delay*2,MAX_DELAY);
  }
 }
 const done=run().catch(e=>{if(!owner.signal.aborted)console.error('Seed subscription stopped',e.message);});
 return ()=>{owner.abort();return done;};
}
module.exports={subscribe};
