// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 (user: the 日文原版与语言环境 dialog's buttons were dead, then every click fired at once): the service runs
   requests on one thread, and the zero-latency script work (the patch search walks every folder next to the game and reads
   each candidate's scripts; an import reads and lines up a whole script) ran on it. A search over E:\GAL held every other
   request for many seconds: the game page stayed blank, the dialog did not open, and clicks piled up. That work now runs in
   a worker thread with its own database handle; the service only waits for the answer. */
const {Worker,isMainThread,workerData,parentPort}=require('node:worker_threads');
const TASKS=new Set(['status','importPatch','importOriginal','autoPatch']);

function call(root,task,args){
 const ot=require('./original-text.cjs'),db=require('./store.cjs').openStore(root);
 return Promise.resolve().then(()=>ot[task](root,db,...args)).finally(()=>{try{db.close();}catch{}});
}
const plain=value=>value===undefined?null:JSON.parse(JSON.stringify(value));
const codeOf=error=>{const text=String(error?.message||error||'');return /^[A-Z][A-Z0-9_]+$/.test(text)?text:'SERVICE_FAILED';};

// Runs ot[task](root, db, ...args) off the service thread; resolves with its result, rejects with its error code.
function run(root,task,args=[],{inline=false}={}){
 if(!TASKS.has(task))return Promise.reject(Error('INVALID_TEXT_SOURCE_TASK'));
 if(inline||process.env.MEGULIT_TEXT_SOURCE_INLINE)return call(root,task,args).then(plain);
 return new Promise((resolve,reject)=>{
  let worker;try{worker=new Worker(__filename,{workerData:{root,task,args}});}catch{call(root,task,args).then(v=>resolve(plain(v)),reject);return;}
  let settled=false;const finish=(fn,value)=>{if(!settled){settled=true;fn(value);}};
  worker.once('message',m=>m?.ok?finish(resolve,m.value):finish(reject,Error(m?.error||'SERVICE_FAILED')));
  worker.once('error',error=>finish(reject,Error(codeOf(error))));
  worker.once('exit',()=>finish(reject,Error('SERVICE_FAILED')));
 });
}

if(!isMainThread&&workerData?.task&&TASKS.has(workerData.task)){
 call(workerData.root,workerData.task,workerData.args||[]).then(value=>parentPort.postMessage({ok:true,value:plain(value)}),error=>parentPort.postMessage({ok:false,error:codeOf(error)}));
}
module.exports={run,TASKS};
