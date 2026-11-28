// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 (owner, 1.4.26: 现在游戏库刷新要等特别久) the refresh button waited for VNDB: the scan asked VNDB for every folder
   game one name at a time (and downloaded each cover) before it answered, so a library of 54 games on a 300 ms line took 37 s to
   refresh and 77 s to come up the first time. The scan now answers after a pass that asks nothing on the network; VNDB checks,
   names and covers follow in the background, a few at a time, and the answers are kept, so the next refresh asks only for new names.
   Runs the real service on a fake library of folder games with a slow network (validation/helpers/slow-network.cjs). */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const GAMES=24,LATENCY=1000;
/* the time the refresh button may turn: a scan, then the library list (home). A scan that waits for one VNDB answer per game
   cannot come in under this on a 1 s line. */
const REFRESH_LIMIT=6000;

function service(root,log){
 const child=spawn(process.execPath,[path.join(__dirname,'..','services','server.cjs')],{windowsHide:true,stdio:['pipe','pipe','ignore'],
  env:{...process.env,MEGULIT_ROOT:root,NODE_OPTIONS:`--require "${path.join(__dirname,'helpers','slow-network.cjs').split(path.sep).join('/')}"`,SLOW_NETWORK_MS:String(LATENCY),SLOW_NETWORK_LOG:log}});
 let next=1,buf='',closed=null;const waits=new Map(),events=[];
 child.once('close',()=>{closed=Error('SERVICE_CLOSED');for(const w of waits.values())w.reject(closed);waits.clear();});
 child.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}
  if(m.event){events.push({event:m.event,data:m.data,at:Date.now()});continue;}const w=waits.get(m.id);if(w){waits.delete(m.id);m.ok?w.resolve(m.data):w.reject(Error(m.error));}}});
 const call=request=>new Promise((resolve,reject)=>{if(closed)return reject(closed);const id=next++;waits.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,request})+'\n');});
 /* a call that has to answer within ms; the service is not waited for past that */
 const within=(ms,request)=>Promise.race([call(request),new Promise((_,reject)=>setTimeout(()=>reject(Error(`${request.action} took longer than ${ms} ms`)),ms).unref())]);
 return {call,within,events,stop:async()=>{await Promise.race([call({action:'__shutdown'}).catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);child.kill();}};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('a refresh answers before the VNDB lookups, which then fill in names and covers and are not asked again',{timeout:240000},async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-refresh-speed-')),root=path.join(temp,'root'),games=path.join(temp,'games'),log=path.join(temp,'net.json');
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300}));
 /* folders as people keep them: "[date][brand] title DL版", three engines, and a tool folder that is no game */
 const exe=n=>{const b=Buffer.alloc(400000+n);b.write('MZ');return b;},kinds=[['data.xp3','game.exe'],['Scene.pck','SiglusEngine.exe'],['sysgrp.arc','BGI.exe']];
 for(let n=0;n<GAMES;n++){const dir=path.join(games,`[2020${String(n).padStart(2,'0')}][brand] 作品${n} DL版`);fs.mkdirSync(dir,{recursive:true});const [data,program]=kinds[n%3];fs.writeFileSync(path.join(dir,data),'x');fs.writeFileSync(path.join(dir,program),exe(n));}
 fs.mkdirSync(path.join(games,'tools'));fs.writeFileSync(path.join(games,'tools','Tool.exe'),exe(1));
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({folders:[games],steamPath:'',setupDone:true}));
 const svc=service(root,log);t.after(()=>svc.stop());
 /* the scan's own VNDB name lookups (the details enrichment a refresh also restarts searches on its own, with its own cache) */
 const searches=()=>{try{return JSON.parse(fs.readFileSync(log,'utf8'))['vndb:scan']||0;}catch{return 0;}};
 const refresh=async startup=>{const at=Date.now();await svc.within(REFRESH_LIMIT,{action:'library_scan',...(startup?{startup:true}:{})});const home=await svc.within(REFRESH_LIMIT,{action:'home'});return {ms:Date.now()-at,home};};

 // the first scan lists every game of a known engine at once, under its folder name
 let r=await refresh(true);
 assert.ok(r.ms<REFRESH_LIMIT,`first scan ${r.ms} ms`);assert.equal(r.home.games.length,GAMES);
 // a manual refresh while the lookups still run answers at once too
 r=await refresh(false);assert.ok(r.ms<REFRESH_LIMIT,`refresh ${r.ms} ms`);assert.equal(r.home.games.length,GAMES);

 // the lookups then name every game after its work and bring its cover, and the page is told to reload its list
 const named=home=>home.games.filter(g=>/^作品\d+$/.test(g.title)&&g.cover).length;
 let home=null;for(const until=Date.now()+180000;Date.now()<until;await sleep(1000)){home=await svc.call({action:'home'});if(named(home)===GAMES)break;}
 assert.equal(named(home),GAMES,'VNDB names and covers: '+JSON.stringify(home.games.slice(0,3).map(g=>[g.title,!!g.cover])));
 assert.ok(svc.events.some(e=>e.event==='library-updated'&&e.data?.scan),'the page is told the library changed');
 assert.ok(!home.games.some(g=>/tools/.test(g.title)),'a folder VNDB does not know is not listed');

 // once known, a refresh asks VNDB for no name again
 for(let quiet=0,last=-1;quiet<5;await sleep(1000)){const s=searches();quiet=s===last?quiet+1:0;last=s;}
 const before=searches();r=await refresh(false);
 assert.ok(r.ms<REFRESH_LIMIT,`refresh ${r.ms} ms`);await sleep(4000);
 assert.equal(searches()-before,0,'the scan looks up no name it found before');
 assert.equal(r.home.games.filter(g=>/^作品\d+$/.test(g.title)).length,GAMES,'and the list keeps the work names');
});
