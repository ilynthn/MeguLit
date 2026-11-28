'use strict';
// "Reconnect" must really reconnect (user, 2026-11-09): when another program holds AnkiConnect's port, close it;
// when AnkiConnect still does not answer, close Anki and start it cold. Anki and MeguLit are never treated as blockers.
const test=require('node:test'),assert=require('node:assert/strict');
const {AnkiProcess,isAnki,portOf}=require('../core/anki-process.cjs');

function rig({owners,onlineAfterKill=true,ankiRunning=false}){
 const killed=[],calls=[];let online=false;
 const runner=new AnkiProcess({
  config:()=>({ankiUrl:'http://127.0.0.1:8765'}),
  anki:{call:async()=>{if(!online)throw Error('ANKI_PORT_TAKEN');return 6;}},
  windowControl:async mode=>{calls.push(mode);return 1;},
  portOwners:async()=>owners.filter(o=>!killed.includes(o.pid)),
  killer:pid=>{killed.push(pid);if(onlineAfterKill&&!owners.some(o=>!killed.includes(o.pid)&&!isAnki(o)))online=true;return true;},
  running:()=>ankiRunning,ankiPids:()=>[],wait:async()=>{}
 });
 runner.start=async()=>{calls.push('start');online=true;return {running:true,started:true};};
 return {runner,killed,calls};
}

test('a program squatting on the port is closed and Anki answers without a restart',async()=>{
 const {runner,killed,calls}=rig({owners:[{pid:30456,name:'python',path:'F:\\Python\\python.exe'},{pid:35056,name:'pythonw',path:'C:\\Users\\u\\AppData\\Local\\AnkiProgramFiles\\.venv\\Scripts\\pythonw.exe'}]});
 const r=await runner.repair();
 assert.deepEqual(killed,[30456]);assert.equal(r.running,true);assert.deepEqual(r.killed,['python']);assert.ok(!calls.includes('start'));
});

test('when AnkiConnect still does not answer, Anki is closed normally and cold-started',async()=>{
 const {runner,killed,calls}=rig({owners:[{pid:35056,name:'pythonw',path:'C:\\Users\\u\\AppData\\Local\\AnkiProgramFiles\\python\\pythonw.exe'}],onlineAfterKill:false});
 const r=await runner.repair();
 assert.deepEqual(killed,[]);assert.deepEqual(calls,['close','start']);assert.equal(r.restarted,true);assert.equal(r.running,true);
});

test('an already connected Anki is left alone',async()=>{
 const {runner,killed,calls}=rig({owners:[]});runner.anki={call:async()=>6};
 assert.deepEqual(await runner.repair(),{running:true,repaired:false});assert.deepEqual(killed,[]);assert.deepEqual(calls,[]);
});

test('Anki processes are recognised by name or by Anki 25 venv path; the port comes from the configured URL',()=>{
 assert.ok(isAnki({name:'anki',path:''}));assert.ok(isAnki({name:'ankiw',path:''}));
 assert.ok(isAnki({name:'pythonw',path:'C:\\Users\\u\\AppData\\Local\\AnkiProgramFiles\\.venv\\Scripts\\pythonw.exe'}));
 assert.ok(!isAnki({name:'python',path:'F:\\Python.etc\\Python\\python.exe'}));
 assert.equal(portOf('http://127.0.0.1:8765'),8765);assert.equal(portOf('http://localhost:9000/'),9000);assert.equal(portOf('bad url'),8765);
});

test('repair never force-kills Anki when WM_CLOSE leaves it open; it restores windows and reports ANKI_CLOSE_REQUIRED',async()=>{
 const killed=[],calls=[];let watchKilled=0;
 const runner=new AnkiProcess({
  config:()=>({ankiUrl:'http://127.0.0.1:8765'}),
  anki:{call:async()=>{throw Error('ANKI_OFFLINE');}},
  windowControl:async mode=>{calls.push(mode);return 1;},
  portOwners:async()=>[{pid:35056,name:'anki',path:'C:\\Anki\\anki.exe'}],
  killer:pid=>{killed.push(pid);return true;},
  running:()=>true,
  ankiPids:()=>[35056],
  wait:async()=>{},
  watcher:()=>({kill:()=>{watchKilled++;}})
 });
 runner.watch(30000);
 runner.start=async()=>{calls.push('start');return {running:true,started:true};};
 await assert.rejects(runner.repair({hide:true}),/ANKI_CLOSE_REQUIRED/);
 assert.deepEqual(killed,[],'Anki processes must never be force-killed');
 assert.deepEqual(calls,['close','show']);
 assert.equal(watchKilled,1,'hide watcher is stopped before showing Anki');
 assert.equal(runner.hidden,false);
});

test('repair cold-restarts Anki even while an earlier start() is still polling',async()=>{
 const {EventEmitter}=require('node:events');
 let ankiRunning=true,online=false,spawns=0;const calls=[];
 const runner=new AnkiProcess({
  config:()=>({ankiUrl:'http://127.0.0.1:8765',ankiPath:'C:\\Anki\\anki.exe'}),
  anki:{call:async()=>{if(!online)throw Error('ANKI_OFFLINE');return 6;}},
  windowControl:async mode=>{calls.push(mode);if(mode==='close')ankiRunning=false;return 1;},
  portOwners:async()=>[],
  killer:()=>true,
  running:()=>ankiRunning,
  ankiPids:()=>[],
  wait:async()=>{await new Promise(z=>setTimeout(z,5));},
  spawner:()=>{spawns++;ankiRunning=true;online=true;const e=new EventEmitter();queueMicrotask(()=>e.emit('spawn'));return e;}
 });
 runner.find=()=>'C:\\Anki\\anki.exe';
 const autoStart=runner.start({hide:true}).then(value=>({value}),error=>({error}));
 await new Promise(z=>setTimeout(z,15));
 const repaired=await runner.repair({hide:false});
 const prior=await autoStart;
 assert.match(prior.error?.message||'',/ANKI_OFFLINE/);
 assert.equal(spawns,1,'repair must spawn a fresh Anki instead of reusing the pre-close start()');
 assert.equal(repaired.running,true);
 assert.equal(repaired.started,true);
 assert.equal(repaired.repaired,true);
 assert.equal(repaired.restarted,true);
 assert.ok(calls.includes('close'));

 // Even if Anki exited on its own during an earlier start() poll, repair still cold-starts a fresh Anki.
 ankiRunning=true;online=false;spawns=0;calls.length=0;
 const staleStart=runner.start({hide:true}).then(value=>({value}),error=>({error}));
 await new Promise(z=>setTimeout(z,15));
 ankiRunning=false;
 const restartedAfterExit=await runner.repair({hide:false});
 const staleRes=await staleStart;
 assert.match(staleRes.error?.message||'',/ANKI_OFFLINE/);
 assert.equal(spawns,1,'repair spawns Anki when previous process exited mid-poll');
 assert.equal(restartedAfterExit.running,true);
 assert.equal(restartedAfterExit.restarted,false);
});

test('review page shows localized messages for ANKI_CLOSE_REQUIRED',async t=>{
 const messages={
  zh:/Anki 尚未关闭/,
  ja:/Anki を閉じられませんでした/,
  en:/Anki stayed open/
 };
 const noop=()=>{};
 const document={documentElement:{lang:''},addEventListener:noop,removeEventListener:noop};
 const globals={document,window:{addEventListener:noop,removeEventListener:noop},addEventListener:noop,
  localStorage:{getItem:()=>null},MeguHud:require('../web/hud-drag.js'),MeguAnkiHud:require('../web/anki-hud-model.js')};
 for(const [name,value] of Object.entries(globals)){
  const prev=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{if(prev)Object.defineProperty(globalThis,name,prev);else delete globalThis[name];});
 }
 t.mock.method(globalThis,'setInterval',()=>1);
 t.mock.method(globalThis,'clearInterval',noop);
 const {renderAnkiReview}=await import('../web/anki-review.js');
 for(const [lang,pattern] of Object.entries(messages)){
  document.documentElement.lang=lang;
  const connectBtn={setAttribute:noop};
  const elements={'[data-connect]':connectBtn,'[data-launch]':{},'[data-reconnect]':{},'[data-install-ask]':null};
  const querySelector=s=>elements[s]||null;
  const landing={matches:()=>true,classList:{add:noop,remove:noop},removeAttribute:noop,querySelector};
  const target={firstElementChild:landing,querySelector,querySelectorAll:()=>[connectBtn]};
  landing.parentElement=target;
  const toasts=[];
  const api=async action=>{
   if(action==='anki_status')return {connected:false,reason:'ANKI_PORT_TAKEN'};
   if(action==='anki_repair')throw Error('ANKI_CLOSE_REQUIRED');
   return {};
  };
  await renderAnkiReview({target,api,text:{ankiOffline:'off',ankiOfflineHint:'offline',reconnect:'reconnect',ankiFailed:'failed'},esc:String,isCurrent:()=>true,toast:m=>toasts.push(m),quiet:true});
  await connectBtn.onclick({currentTarget:connectBtn});
  assert.ok(toasts.some(m=>pattern.test(m)),`expected ${lang} toast matching ${pattern}, got ${JSON.stringify(toasts)}`);
 }
});
