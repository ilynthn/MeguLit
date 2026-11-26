// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path'),{fork,spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const background=require('./background-games.cjs');

/* The main process owns ColdDesk. A worker exit cannot release the save/launch barrier. */
function runInWorker(opts,{forker=fork,spawner=spawn,stopTimeoutMs=12000,onState=()=>{}}={}){
 let worker=null,helper=null,workerReady=false,workerClosed=false,helperClosed=true,cleanupSafe=true,finished=false,stopping=false,nativeStopSent=false,result=null,failure=null;
 let resolveRun,resolveClosed,reapWorker=null;const run=new Promise(r=>resolveRun=r),closed=new Promise(r=>resolveClosed=r);
 const error=code=>Object.assign(Error(code),{code});
 const send=m=>{if(worker&&!workerClosed)try{const ready=worker.send(m,e=>{helper?.stdout?.resume?.();if(e&&!workerClosed){failure=String(e.message||e);nativeStop();}});if(ready===false)helper?.stdout?.pause?.();}catch(e){failure=String(e.message||e);nativeStop();}};
 const nativeStop=()=>{if(helper&&!helperClosed&&!nativeStopSent){nativeStopSent=true;try{if(!helper.stdin.destroyed&&!helper.stdin.writableEnded)helper.stdin.end('kill\n');}catch{}}};
 const state=patch=>{try{onState({at:new Date().toISOString(),helperAlive:!!helper&&!helperClosed,workerAlive:!!worker&&!workerClosed,...patch});}catch(e){failure='cleanup journal: '+String(e.message||e);nativeStop();}};
 function finish(){
  if(finished||!workerClosed||!helperClosed)return;
  finished=true;clearTimeout(budget);clearTimeout(reapWorker);
  if(worker?.pid&&!workerReady){cleanupSafe=false;failure=failure||'COLD_WORKER_PROTOCOL_UNCONFIRMED';}
  const safe=cleanupSafe;
  if(safe)untrack();
  resolveClosed(safe&&!failure);resolveRun({...result,end:result?.end||(failure?'helper-error':'worker-exit'),cleanupConfirmed:safe,stopped:result?.stopped||(stopping?'foreground':''),errors:[...(result?.errors||[]),...(failure?[failure]:[])]});
 }
 function requestStop(){stopping=true;nativeStop();send({stop:'foreground'});}
 const untrack=background.track(opts.exe,async()=>{
  if(finished){if(!cleanupSafe||failure)throw error('COLD_CLEANUP_UNCONFIRMED');return;}
  requestStop();let timer;
  try{const safe=await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>{state({state:helperClosed?'closed-unconfirmed':'alive-unconfirmed'});reject(error('COLD_STOP_TIMEOUT'));},stopTimeoutMs);})]);if(!safe)throw error('COLD_CLEANUP_UNCONFIRMED');}
  finally{clearTimeout(timer);}
 });
 const budget=setTimeout(()=>{failure='COLD_RUN_TIMEOUT';requestStop();},(opts.budgetMs||360000)+90000);budget.unref?.();
 try{worker=forker(path.join(__dirname,'cold-test-worker.cjs'),[],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});}
 catch(e){failure=String(e?.message||e);workerClosed=true;finish();return run;}
 worker.on('message',m=>{
  if(m?.type==='cold-worker-ready'&&m.protocol===1){workerReady=true;return;}
  if(m?.type==='cold-native-spawn'){
   if(!workerReady){failure='COLD_WORKER_PROTOCOL_UNCONFIRMED';requestStop();return;}
   if(helper||stopping){send({type:'cold-native-error',error:'cold run cancelled before spawn'});return;}
   helperClosed=false;cleanupSafe=false;
   try{const file=require('./cold-test-run.cjs').helperPath(opts.root);if(!file)throw Error('ColdDesk unavailable');
    helper=spawner(file,['run',opts.exe,'--seconds',String(Math.ceil((opts.budgetMs||360000)/1000)+20),'--parent-pid',String(process.pid),...(opts.ignoreInput===true?['--ignore-input']:[]),...(opts.visible===true?['--visible']:[]),...(opts.localeEmulator?.path&&opts.localeEmulator?.guid?['--locale-emulator',opts.localeEmulator.path,'--le-guid',opts.localeEmulator.guid]:[])],{windowsHide:true,stdio:['pipe','pipe','ignore']});}
   catch(e){helperClosed=true;cleanupSafe=true;failure=String(e?.message||e);send({type:'cold-native-error',error:failure});send({type:'cold-native-close',code:-1,signal:null});requestStop();finish();return;}
   helper.stdin.on?.('error',e=>{failure=String(e?.message||e);requestStop();});
   helper.stdout.on?.('error',e=>{failure=String(e?.message||e);requestStop();});
   createInterface({input:helper.stdout}).on('line',line=>{let event;try{event=JSON.parse(line);}catch{}
    if(event?.type==='owner')state({state:'active',owner:{pid:event.pid,started:String(event.started||'')}});
    if(event?.type==='started')state({state:'active',game:{pid:event.pid,started:String(event.started||'')}});
    if(event?.type==='cleanup')cleanupSafe=event.safe===true;
    send({type:'cold-native-data',data:line+'\n'});
   });
   helper.on('error',e=>{if(!helper.pid)cleanupSafe=true;failure=String(e?.message||e);send({type:'cold-native-error',error:failure});requestStop();});
   helper.on('close',(code,signal)=>{helperClosed=true;if(code!==0||signal){if(helper.pid)cleanupSafe=false;failure=failure||'COLD_HELPER_ABNORMAL_EXIT';}state({state:cleanupSafe?'confirmed':'closed-unconfirmed',helperPid:helper.pid||null,exitCode:code,signal});send({type:'cold-native-close',code,signal});if(!workerClosed){reapWorker=setTimeout(()=>{if(!workerClosed)try{worker.kill();}catch{}},2000);reapWorker.unref?.();}finish();});
  }else if(m?.type==='cold-native-write'){if(helper&&!helperClosed&&!stopping&&!nativeStopSent)try{helper.stdin.write(String(m.data||''));}catch{requestStop();}}
  else if(m?.type==='cold-native-stop')nativeStop();
  else if(m?.type==='cold-result'){result=m.result||{};if(!helperClosed)requestStop();}
 });
 worker.on('error',e=>{failure=String(e?.message||e);requestStop();});
 worker.on('exit',()=>{workerClosed=true;nativeStop();finish();});
 /* A failed fork can emit close without exit. */
 worker.on('close',()=>{workerClosed=true;nativeStop();finish();});
 worker.on('disconnect',()=>{nativeStop();});
 send(opts);return run;
}
module.exports={runInWorker};
