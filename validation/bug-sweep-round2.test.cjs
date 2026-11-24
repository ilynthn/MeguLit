'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('unity font download that stalls ends in error so it can be retried',async t=>{
 const {UnityFont}=require('../core/unity-font.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-uf-'));const old=global.fetch;
 const realWait=setTimeout;/* taken before the mock: real file I/O needs real time to finish between mocked ticks */
 t.mock.timers.enable({apis:['setTimeout']});
 global.fetch=async(url,opt)=>({ok:true,status:200,headers:new Map(),body:(async function*(){yield Buffer.alloc(4);await new Promise((_,rej)=>opt.signal.addEventListener('abort',()=>rej(Error('stalled'))));})()});
 try{const u=new UnityFont(root);u.download();for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  assert.equal(u.state.state,'downloading');
  /* 2026-11-19 core/fast-download.cjs: 15 s without data drops the connection; a source that sent something gets two more tries */
  /* 2026-11-24: a fixed number of setImmediate turns raced the real file I/O and failed on busy CI runners. Wait on
     the state instead, bounded by real time, and keep advancing the mocked clock while the download is in progress */
  const until=Date.now()+20000;let mocked=0;
  while(u.state.state==='downloading'&&Date.now()<until){await new Promise(r=>realWait(r,1));t.mock.timers.tick(5000);mocked+=5000;}
  assert.equal(u.state.state,'error','still '+u.state.state+' after '+mocked/1000+' mocked seconds');assert.equal(fs.existsSync(path.join(root,'cache','unity-font.zip')),false);}
 finally{t.mock.timers.reset();global.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});

test('japanese restore refuses to write when the running-game check itself fails',()=>{
 const cp=require('node:child_process'),old=cp.execFileSync;cp.execFileSync=()=>{throw Error('timeout');};
 try{const jr=require('../core/japanese-restore.cjs');assert.throws(()=>jr._internal.gameRunning(os.tmpdir()),/PROCESS_QUERY_FAILED/);}
 finally{cp.execFileSync=old;}
});

test('marquee hover handlers are replaced, not stacked, on every setup',()=>{
 const s=read('web/grimoire.js');
 assert.match(s,/host\._mqAbort\?\.abort\(\);const life=host\._mqAbort=new AbortController\(\);/);
 assert.match(s,/a\.play\(\);\},\{signal:life\.signal\}\);/);
});
