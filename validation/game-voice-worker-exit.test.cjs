// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const wt=require('node:worker_threads');

test('game-voice worker exit without message settles queue, avoids duplicate finish, and clears refreshing set',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-gv-worker-'));
 const gameDir1=path.join(root,'game1'),gameDir2=path.join(root,'game2');
 fs.mkdirSync(gameDir1,{recursive:true});fs.mkdirSync(gameDir2,{recursive:true});
 const exe1=path.join(gameDir1,'g1.exe'),exe2=path.join(gameDir2,'g2.exe');
 fs.writeFileSync(exe1,'');fs.writeFileSync(exe2,'');

 const OrigWorker=wt.Worker;
 const bg=require('../services/background-games.cjs'),origIdle=bg.idle;
 bg.idle=async()=>true;
 const spawned=[];
 const modes=['exit-only','message-then-exit','exit-only','exit-only'];
 wt.Worker=class FakeWorker extends EventEmitter{
  constructor(file,opts){
   super();
   this.file=file;this.opts=opts;
   const mode=modes.shift()||'exit-only';
   spawned.push({start:opts.workerData.start,mode});
   setImmediate(()=>{
    if(mode==='message-then-exit'){
     this.emit('message',{g:{dir:opts.workerData.start}});
     this.emit('exit',0);
    }else{
     this.emit('exit',1);
    }
   });
  }
  unref(){}
 };

 const gvPath=require.resolve('../services/game-voice.cjs');
 delete require.cache[gvPath];
 const gv=require('../services/game-voice.cjs');
 t.after(()=>{
  wt.Worker=OrigWorker;
  bg.idle=origIdle;
  delete require.cache[gvPath];
  fs.rmSync(root,{recursive:true,force:true});
 });

 // 1. Worker exiting abnormally without emitting message/error must settle ensureScanned and release scanBusy for the next job
 const p1=gv.ensureScanned(root,exe1);
 const p2=gv.ensureScanned(root,exe2);
 const settled=await Promise.race([
  Promise.all([p1,p2]),
  new Promise((_,rej)=>setTimeout(()=>rej(new Error('SCAN_QUEUE_DEADLOCK')),1500))
 ]);
 assert.deepEqual(settled,[false,true],'first exit-only scan must settle false and unblock second scan');
 assert.equal(spawned.length,2,'second queued scan must start after first worker exits');

 // 2. Stale v1 entry triggers refresh() via find(); after worker exits without updating, 10 consecutive lookups spawn only 1 scan (10 min cooldown), and a lookup after cooldown retries
 const cacheDir=path.join(root,'data','voice-cache');
 fs.mkdirSync(cacheDir,{recursive:true});
 const gKey=gv.gameKey(gameDir1),lineKey=gv.keyOf('テスト台詞');
 fs.writeFileSync(path.join(cacheDir,'lines.json'),JSON.stringify({
  schema:1,
  games:{[gKey]:{v:1,dir:gameDir1,engine:'kirikiri',scanned:0}},
  lines:{[lineKey]:[gKey,'v001']}
 }));
 gv._reset();
 const origNow=Date.now;
 let fakeNow=1_700_000_000_000;
 Date.now=()=>fakeNow;
 t.after(()=>{Date.now=origNow;});
 assert.equal(gv.find(root,'テスト台詞'),null);
 await new Promise(r=>setTimeout(r,80));
 assert.equal(spawned.length,3,'first stale find() must schedule one background refresh');
 for(let i=0;i<10;i++){
  assert.equal(gv.find(root,'テスト台詞'),null);
  await new Promise(r=>setTimeout(r,5));
 }
 await new Promise(r=>setTimeout(r,50));
 assert.equal(spawned.length,3,'10 lookups within 10-minute cooldown after failed scan must not spawn another worker');
 fakeNow+=10*60*1000+1;
 assert.equal(gv.find(root,'テスト台詞'),null);
 await new Promise(r=>setTimeout(r,80));
 assert.equal(spawned.length,4,'lookup after 10-minute cooldown must be allowed to retry refresh');
});
