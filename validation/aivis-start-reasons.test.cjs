// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 (1.4.26 QQ group report): the guide said the voice pack was ✓ 已就绪, 读取已安装声音 said only 操作失败，请重试 and the
   voice list stayed empty. Their speech-engine.log: AivisSpeech asked huggingface.co about the BERT files on every start, the
   host was blocked ("Connection to huggingface.co timed out", 5/5 retries), port 10101 never opened, MeguLit gave up after
   180 s and marked the GPU unusable on the way. These tests drive the real Services start loop with a fake engine process,
   the real service bridge (services/server.cjs) and the real settings page in headless Edge. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),readline=require('node:readline'),{spawn}=require('node:child_process');
const {Services}=require('../core/services.cjs');

// Reduced from the reporter's speech-engine.log.
const HUB_TIMEOUT=[
 '[2026/11/28 09:12:01.118] INFO:     Loading BERT model and tokenizer...',
 "[2026/11/28 09:12:11.140] WARNING:  'Connection to huggingface.co timed out. (connect timeout=10)' thrown while requesting HEAD https://huggingface.co/tsukumijima/deberta-v2-large-japanese-char-wwm-onnx/resolve/main/spiece.model",
 '[2026/11/28 09:12:11.141] WARNING:  Retrying in 1s [Retry 5/5].',
].join('\n')+'\n';

/* engine(args, env, write) decides what one fake AivisSpeech start does: 'ready', 'exit' (dies) or 'hang' (never answers) */
function rig(t,engine,{portOpen=false,gpu=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-aivis-reasons-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const exe=path.join(root,'run.exe');fs.writeFileSync(exe,'');
 fs.mkdirSync(path.join(root,'logs'));fs.mkdirSync(path.join(root,'cache'));
 const starts=[],envs=[];let ready=false;
 const services=new Services(root,{exe,prepare:async()=>{},killTree:async()=>{},portOpen:async()=>portOpen,startWaitMs:1500,
  fetch:async url=>{if(url.endsWith('/version'))return {ok:ready};throw Error('unexpected request '+url);},
  spawn(_exe,args,options){
   const child=new EventEmitter();starts.push(args.at(-1));envs.push(options.env||{});
   const what=engine(args.at(-1),options.env||process.env,text=>fs.writeSync(options.stdio[1],text));
   if(what==='ready')ready=true;else if(what==='exit')queueMicrotask(()=>child.emit('exit',1));
   return child;
  }});
 t.after(()=>services.stop());
 const log=()=>fs.readFileSync(path.join(root,'logs','speech-engine.log'),'utf8');
 return {services,starts,envs,log,gpu,marker:path.join(root,'cache','speech-gpu-unavailable')};
}

test('engine not running: the start is offline, so a blocked huggingface.co no longer keeps it from coming up',async t=>{
 // Like the reporter's engine: with Hugging Face reachable only offline mode avoids the hang.
 const {services,starts,envs,marker}=rig(t,(mode,env,write)=>{
  if(env.HF_HUB_OFFLINE==='1'&&env.TRANSFORMERS_OFFLINE==='1')return 'ready';write(HUB_TIMEOUT);return 'exit';});
 await services.ensureSpeech();
 assert.deepEqual(starts,['--use_gpu'],'one start on the GPU is enough');
 assert.equal(envs[0].HF_HUB_OFFLINE,'1');
 assert.equal(fs.existsSync(marker),false,'the GPU is not marked unusable');
 const status=await services.status();
 assert.equal(status.running,true);assert.equal(status.error,null);
});

test('a start that still hangs on huggingface.co says so, keeps the GPU and does not retry on the CPU',async t=>{
 const {services,starts,marker,log}=rig(t,(mode,env,write)=>{write(HUB_TIMEOUT);return 'exit';});
 await assert.rejects(services.ensureSpeech(),error=>error.code==='SPEECH_HUB_UNREACHABLE'&&/huggingface\.co/.test(error.message));
 assert.deepEqual(starts,['--use_gpu']);
 assert.equal(fs.existsSync(marker),false);
 assert.match(log(),/\[MeguLit\] speech start failed: SPEECH_HUB_UNREACHABLE/,'the reason reaches speech-engine.log (feedback package)');
 const status=await services.status();
 assert.equal(status.running,false);assert.equal(status.error,'SPEECH_HUB_UNREACHABLE','not ready, with the reason');
});

test('start timeout: an engine that never answers ends with SPEECH_START_TIMEOUT after both modes, logged',{timeout:20000},async t=>{
 const {services,starts,log}=rig(t,()=>'hang');
 await assert.rejects(services.ensureSpeech(),{code:'SPEECH_START_TIMEOUT'});
 assert.deepEqual(starts,['--use_gpu','--no-use_gpu']);
 assert.match(log(),/speech start failed: SPEECH_START_TIMEOUT/);
});

test('GPU failure falls back to the CPU and reports the CPU mode',async t=>{
 const {services,starts,marker,log}=rig(t,(mode,env,write)=>{if(mode==='--use_gpu'){write('onnxruntime CUDAExecutionProvider: CUDA failure 100: no CUDA-capable device\n');return 'exit';}return 'ready';});
 await services.ensureSpeech();
 assert.deepEqual(starts,['--use_gpu','--no-use_gpu']);
 assert.equal(fs.existsSync(marker),true);
 assert.match(log(),/did not start on the GPU; retrying on the CPU/);
 assert.equal((await services.status()).mode,'--no-use_gpu');
});

test('port 10101 held by another program: no engine is spawned and the reason is SPEECH_PORT_BUSY',async t=>{
 const {services,starts}=rig(t,()=>'ready',{portOpen:true});
 await assert.rejects(services.ensureSpeech(),{code:'SPEECH_PORT_BUSY'});
 assert.deepEqual(starts,[]);
});

test('the service bridge passes the speech reason to the page instead of SERVICE_FAILED; speech_status is not ready',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-aivis-bridge-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:150}));
 require('../services/store.cjs').openStore(root).close();
 const child=spawn(process.execPath,[path.resolve(__dirname,'../services/server.cjs')],{env:{...process.env,TOME_FINAL_ROOT:root,MEGULIT_ROOT:root},windowsHide:true,stdio:['pipe','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill();});
 const pending=new Map();let id=0;readline.createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}pending.get(m.id)?.(m);pending.delete(m.id);});
 const request=(action,values={})=>new Promise((resolve,reject)=>{const serial=++id,timer=setTimeout(()=>{pending.delete(serial);reject(Error('service timeout '+action));},15000);
  pending.set(serial,r=>{clearTimeout(timer);resolve(r);});child.stdin.write(JSON.stringify({id:serial,request:{action,...values}})+'\n');});
 // A configured engine address with nothing listening (port 9): the start fails at once, with a reason.
 assert.equal((await request('settings_save',{scope:'speech',values:{aivisUrl:'http://127.0.0.1:9'}})).ok,true);
 const reply=await request('speakers');
 assert.equal(reply.ok,false);assert.equal(reply.error,'SPEECH_REMOTE_UNREACHABLE');
 const status=await request('speech_status');
 assert.equal(status.ok,true);assert.equal(status.data.running,false);assert.equal(status.data.error,'SPEECH_REMOTE_UNREACHABLE');
 await request('__shutdown');
});

const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
test('settings page: a failed read names the reason, a CPU fallback is shown, a good read fills the voices; the guide is not ✓ 已就绪 while the engine is down',{skip:!hasEdge},async t=>{
 const {startEdge,startWeb}=require('./library-views-perf.cjs'),{Settings}=require('../services/settings.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-aivis-page-'));let server,browser;
 t.after(async()=>{await browser?.stop();server?.close();await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});});
 server=await startWeb();browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;
 await browser.send('Page.navigate',{url:origin+'/settings.js'});
 const base=new Settings(root).get();
 const res=await browser.evaluate(`(async()=>{
  const {renderSettings}=await import('/settings.js');const tick=()=>new Promise(r=>setTimeout(r,60));
  const speakers=[{name:'まお',styles:[{id:888753760,name:'ノーマル'}]}];
  async function mount(answer,status,section='speech'){
   document.body.innerHTML='<main></main>';const main=document.querySelector('main'),data=structuredClone(${JSON.stringify(base)});data.values.speech.aivisSpeaker=888753760;
   const api=async name=>{if(name==='settings_get')return data;if(name==='speakers_cached')return [];if(name==='speakers')return answer();if(name==='speech_status')return status;
    if(name==='pack_status')return {packs:[{id:'voice',installed:true},{id:'reading',installed:true}]};if(name==='reader_message')return {replies:[{method:'v4Deliver',args:[0,{voices:[]},'']}]};return {};};
   await renderSettings({main,section,api,locale:'zh',esc:String,toast:()=>{},heading:()=>'<div class="page-tools"></div>',text:{settings:'设置',serviceFailed:'失败'},isCurrent:()=>true,onSaved:async()=>{}});await tick();return main;}
  const read=async main=>{main.querySelector('[data-refresh]').click();await tick();await tick();const f=main.querySelector('.speech-feedback');
   return {text:f.textContent,state:f.dataset.state||'',voices:[...main.querySelectorAll('[data-voice] option')].map(o=>o.textContent)};};
  const down={running:false,error:'SPEECH_HUB_UNREACHABLE'};
  const hub=await read(await mount(()=>{throw 'SPEECH_HUB_UNREACHABLE';},down));
  const timeout=await read(await mount(()=>{throw Error('SPEECH_START_TIMEOUT');},down));
  const unknown=await read(await mount(()=>{throw Error('SERVICE_FAILED');},down));
  const cpu=await read(await mount(()=>speakers,{running:true,mode:'--no-use_gpu',error:null}));
  const ok=await read(await mount(()=>speakers,{running:true,mode:'--use_gpu',error:null}));
  const chip=async status=>{const main=await mount(()=>speakers,status);return main.querySelector('[data-guide-ready="voice"]')?.textContent||'';};
  return {hub,timeout,unknown,cpu,ok,chipDown:await chip(down),chipIdle:await chip({running:false,error:null}),chipUp:await chip({running:true,mode:'--use_gpu',error:null})};
 })()`);
 assert.match(res.hub.text,/huggingface\.co/);assert.equal(res.hub.state,'error');assert.doesNotMatch(res.hub.text,/操作失败/);
 assert.match(res.timeout.text,/没能启动.*重新启动/);
 assert.match(res.unknown.text,/重新启动语音引擎/,'an unnamed failure still says what to do next');
 assert.deepEqual(res.cpu.voices,['まお']);assert.match(res.cpu.text,/已改用 CPU/);
 assert.deepEqual(res.ok.voices,['まお']);assert.equal(res.ok.text,'');assert.equal(res.ok.state,'');
 assert.match(res.chipDown,/没能启动/);assert.doesNotMatch(res.chipDown,/已就绪/);
 assert.match(res.chipIdle,/已安装/);assert.doesNotMatch(res.chipIdle,/已就绪/);
 assert.equal(res.chipUp,'已就绪');
});
