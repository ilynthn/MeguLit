// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana prefetch stops when switching internal views and is superseded when a new prefetch list starts',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-pref-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startWeb();
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;
 await browser.send('Page.navigate',{url:origin+'/index.html'});

 const out=await browser.evaluate(`(async()=>{
  const {mountKana}=await import('/kana/kana.js');
  const wav='UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(fn,ms=3000)=>{
   const end=Date.now()+ms;
   while(Date.now()<end){const v=fn();if(v)return v;await wait(15);}
   throw new Error('TIMEOUT');
  };

  async function mountGojuon(prefs){
   document.body.innerHTML='<div id="host"></div>';
   const host=document.getElementById('host');
   const calls=[];
   const pending=[];
   let holdFirst=true;
   const api=async(action,req)=>{
    if(action==='kana_progress')return {mastery:{},boxes:{},runs:[],applied:[],lessons:{},prefs};
    if(action==='kana_game_words')return {words:{}};
    if(action==='kana_speak'){
     calls.push(req.text);
     if(holdFirst){
      holdFirst=false;
      return new Promise(r=>pending.push(()=>r({data:wav})));
     }
     return {data:wav};
    }
    return {};
   };
   const handle=await mountKana(host,{api,start:'gojuon'});
   const shadow=host.querySelector('.kana-host').shadowRoot;
   return {host,shadow,calls,pending,handle};
  }

  // Case 1: enter gojuon -> switch to yoon (unrecorded, starts prefetch) -> click back to index -> old yoon prefetch must stop
  const c1=await mountGojuon({volume:0.4,voice:'female'});
  c1.shadow.querySelector('#cat button[data-v="yoon"]').click();
  await waitFor(()=>c1.pending.length===1);
  c1.shadow.querySelector('a.back').click();
  await waitFor(()=>c1.shadow.querySelector('.v-index'));
  c1.pending.shift()();
  await wait(80);
  const c1Calls=[...c1.calls];
  c1.handle.stop();

  // Case 2: enter gojuon -> switch to yoon (starts prefetch) -> switch back to seion (all recorded, new prefetch supersedes old yoon list)
  const c2=await mountGojuon({volume:0.4,voice:'female'});
  c2.shadow.querySelector('#cat button[data-v="yoon"]').click();
  await waitFor(()=>c2.pending.length===1);
  c2.shadow.querySelector('#cat button[data-v="seion"]').click();
  await wait(20);
  c2.pending.shift()();
  await wait(80);
  const c2Calls=[...c2.calls];
  c2.handle.stop();

  // Case 3: staying on yoon view allows prefetch to continue through multiple unrecorded kana
  const c3=await mountGojuon({volume:0.4,voice:'female'});
  c3.shadow.querySelector('#cat button[data-v="yoon"]').click();
  await waitFor(()=>c3.pending.length===1);
  c3.pending.shift()();
  await waitFor(()=>c3.calls.length>=5);
  const c3Count=c3.calls.length;
  c3.handle.stop();

  return {c1Calls,c2Calls,c3Count};
 })()`);

 assert.deepEqual(out.c1Calls,['きゃ'],'leaving gojuon back to kana index must cancel remaining yoon prefetch calls');
 assert.deepEqual(out.c2Calls,['きゃ'],'switching from yoon to seion must supersede remaining yoon prefetch calls');
 assert.ok(out.c3Count>=5,'staying on yoon view must still prefetch its kana normally');
});
