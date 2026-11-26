// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{once,EventEmitter}=require('node:events');
const {Settings}=require('../services/settings.cjs'),{Runtime}=require('../services/runtime.cjs'),{Reader}=require('../services/reader.cjs');
const {stopOwned,trackStop}=require('../core/owned-exit.cjs'),{libraryOnly}=require('../core/library-mode.cjs');
const {HookNative}=require('../core/hook-native.cjs'),{GalNative}=require('../core/gal-native.cjs');
const {UnityTextPath}=require('../core/text-paths-unity.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'library-only-'));fs.mkdirSync(path.join(root,'logs'));const settings=new Settings(root);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,settings};}
const tick=()=>new Promise(r=>setImmediate(r));
async function child(t,delay=60,gate=null){const onEnd=gate?`const fs=require('node:fs');const f=${JSON.stringify(gate)};const check=()=>{if(fs.existsSync(f))process.exit(0);};check();setInterval(check,10);`:`setTimeout(()=>process.exit(0),${delay});`;const p=spawn(process.execPath,['-e',`process.stdin.resume();process.stdin.on('end',()=>{${onEnd}});console.log('ready');`],{windowsHide:true,stdio:['pipe','pipe','pipe']});t.after(()=>{if(p.exitCode===null&&p.signalCode===null)p.kill();});await once(p.stdout,'data');return p;}
test('library mode is explicit, global, three-language and preserves saved reader/library preferences',t=>{
 const {root,settings}=fixture(t);assert.equal(libraryOnly(root),false);assert.equal(settings.read('library').libraryOnly,false);
 const file=settings.file('library.json');fs.writeFileSync(file,JSON.stringify({custom:'keep',libraryOnly:'true'}));assert.equal(libraryOnly(root),false);
 const gal=settings.file('gal-preferences.json');fs.writeFileSync(gal,'{"hookProfile":"embed","bindEnabled":true}');
 const field=settings.get().fields.find(f=>f.scope==='library'&&f.key==='libraryOnly');for(const lang of ['zh','ja','en'])assert(field.label[lang]);
 settings.save({scope:'library',values:{libraryOnly:true}});assert.equal(libraryOnly(root),true);assert.equal(JSON.parse(fs.readFileSync(file)).custom,'keep');assert.equal(fs.readFileSync(gal,'utf8'),'{"hookProfile":"embed","bindEnabled":true}');
 assert.throws(()=>settings.save({scope:'library',values:{libraryOnly:'true'}}),/SETTINGS_INVALID_VALUE/);
 settings.save({scope:'library',values:{libraryOnly:false}});assert.equal(libraryOnly(root),false);
 fs.writeFileSync(file,'broken');assert.throws(()=>libraryOnly(root),/LIBRARY_MODE_UNAVAILABLE/);
});
test('enabled mode blocks actual runtime attach/message/invoke, prepare, binding and late ready events',async t=>{
 const {root,settings}=fixture(t);settings.save({scope:'library',values:{libraryOnly:true}});const events=[],r=new Runtime(root,(...args)=>events.push(args));
 r.prepareGame('C:/game.exe');r.bindLaunched(42);assert.equal(r.pendingGame,undefined);assert.equal(r.reader,undefined);
 for(const action of ['reader_attach','reader_message','reader_invoke']){const result=await r.call({action});assert.equal(result.libraryOnly,true);}
 await r.call({action:'reader_health',phase:'ready'});assert.equal(r.readerStatus().ready,false);assert.equal(r.readerStatus().libraryOnly,true);r.emit('reader-event',{type:'call',method:'deliverBackfill'});assert.equal(events.length,0);
});
test('setting change awaits teardown, invalidates callbacks and reports failure instead of fake completion',async t=>{
 const {root,settings}=fixture(t),events=[],r=new Runtime(root,(...args)=>events.push(args));assert.equal(r.libraryOnly(),false);
 let release;const old=new Reader(r);old.gal={send(){},stop:()=>new Promise(resolve=>{release=resolve;})};r.reader=old;
 settings.save({scope:'library',values:{libraryOnly:true}});let done=false;const save=r.settingsSaved({scope:'library',values:{libraryOnly:true}}).then(()=>{done=true;});await tick();assert.equal(done,false);assert.equal(old.active(),false);
 old.emit('reader-event',{type:'call',method:'deliverBackfill'});old.event({type:'hookEmbedRequest'});assert.equal(events.filter(x=>x[1]?.method==='deliverBackfill').length,0);release();await save;assert.equal(r.reader,null);
 r.reader={stop:async()=>{throw Error('READER_STOP_INCOMPLETE');}};await assert.rejects(r.settingsSaved({scope:'library',values:{libraryOnly:true},libraryOnlyBefore:false}),/READER_STOP_INCOMPLETE/);assert.equal(r.readerStatus().error,'READER_STOP_INCOMPLETE');await assert.rejects(r.settingsSaved({scope:'library',values:{libraryOnly:true},libraryOnlyBefore:true}),/READER_STOP_INCOMPLETE/);
});
test('late attachment waiting on an earlier stop cannot attach after enabling library mode',async t=>{
 const {root,settings}=fixture(t),r=new Runtime(root);let release,attached=0;r.reader={stopping:new Promise(resolve=>{release=resolve;}),attach(){attached++;}};
 const pending=r.call({action:'reader_attach'});await tick();settings.save({scope:'library',values:{libraryOnly:true}});r.libraryOnlyState=undefined;release();assert.equal((await pending).libraryOnly,true);assert.equal(attached,0);
});
test('saving unchanged full-page library values does not stop or reopen the reader',async t=>{
 const {root,settings}=fixture(t),r=new Runtime(root);let stops=0;r.stopReading=async()=>{stops++;};
 for(const value of [false,true]){settings.save({scope:'library',values:{libraryOnly:value}});r.libraryOnlyState=undefined;const before=r.libraryOnly();await r.settingsSaved({scope:'library',values:{libraryOnly:value,autoSeries:false},libraryOnlyBefore:before});assert.equal(stops,0);}
});
test('global shutdown keeps the reader failure while still stopping every other owned subsystem',async t=>{
 const {root}=fixture(t),r=new Runtime(root),calls=[];
 r.stopReading=async()=>{calls.push('reader');throw Error('READER_STOP_INCOMPLETE');};r.ankiRunner={stop:async()=>calls.push('anki')};r.gameEnrichment={stop:()=>calls.push('metadata')};r.gameReviews={stop:()=>calls.push('reviews')};
 r.localLearning={stop(){calls.push('learning');throw Error('SECONDARY_FAILURE');}};r.modelStore={jobs:{a:{},b:{}},cancel:id=>calls.push('model-'+id)};r.localEngine={cancel:()=>calls.push('local-cancel'),stop:async()=>calls.push('local-stop')};r.serviceManager={stop:async()=>calls.push('services')};
 await assert.rejects(r.stop(),/READER_STOP_INCOMPLETE/);for(const task of ['reader','anki','metadata','reviews','learning','model-a','model-b','local-cancel','local-stop','services'])assert(calls.includes(task),task);assert.equal(r.stopped,true);
});

test('Unity stopped sessions reject late drawing and intent updates until delayed socket close',async t=>{
 const socket=()=>Object.assign(new EventEmitter(),{destroyed:false,writes:[],write(text){this.writes.push(text);},end(text){this.writes.push(text);},destroy(){}});
 const old=new UnityTextPath(),s=socket();old.sock=s;let closedServer=false;
 old.server={listening:true,close(callback){closedServer=true;callback();}};
 old.drawConfig({roles:true,embed:true});old.drawEmbed('合成台詞',{zh:'synthetic'});old.hide(true);old.want('before');
 assert(s.writes.some(line=>line.startsWith('EMB ')));assert(s.writes.some(line=>line.startsWith('DRAW roles=1')));
 let done=false;const stop=old.stop().then(()=>{done=true;});t.after(()=>s.emit('close'));
 const writesAtStop=s.writes.length;assert.match(s.writes.at(-1),/HIDE 0\nDRAW roles=0 embed=0 zh=0/);
 old.drawConfig({roles:true,embed:true});old.drawEmbed('遅い合成台詞',{zh:'late'});old.hide(true);old.want('late');old.push();
 assert.deepEqual(s.writes.slice(writesAtStop),[]);assert.equal(old.on,false);assert.deepEqual(old.drawCfg,{roles:false,embed:false,zh:false});assert.equal(old.embeds.size,0);assert.equal(old.wanted,'before');
 await tick();assert.equal(done,false);assert.equal(closedServer,false);s.emit('close');await stop;assert.equal(closedServer,true);
 const fresh=new UnityTextPath(),next=socket();fresh.sock=next;fresh.drawConfig({roles:true,embed:true});fresh.drawEmbed('新しい合成台詞',{zh:'new'});fresh.hide(true);fresh.want('new');
 assert(next.writes.some(line=>line.startsWith('DRAW roles=1 embed=1')));assert(next.writes.some(line=>line.startsWith('EMB ')));assert.equal(fresh.on,true);assert.equal(fresh.wanted,'new');
 const freshStop=fresh.stop();next.emit('close');await freshStop;
});

test('stopReading waits for every owned cleanup before exposing the first rejection',async t=>{
 for(const syncThrow of [false,true]){
  const {root}=fixture(t),r=new Runtime(root),first=Error('READER_STOP_INCOMPLETE first');let release,pathStarted=false,settled=false;
  const reader={stop:()=>{if(syncThrow)throw first;return Promise.reject(first);}};
  const slow={stop:()=>{pathStarted=true;return new Promise(resolve=>{release=resolve;});}},second={stop:()=>Promise.reject(Error('secondary'))};
  r.reader=reader;r.textPaths=new Set([slow,second]);
  const stop=r.stopReading().then(()=>{settled=true;return null;},error=>{settled=true;return error;});
  assert.equal(pathStarted,true);
  await tick();const before={pathStarted,settled};release?.();const result=await stop;
  assert.deepEqual(before,{pathStarted:true,settled:false});assert.equal(result,first);assert.equal(r.readerError,'READER_STOP_INCOMPLETE');assert.equal(r.reader,reader);assert.equal(r.textPaths.size,2);
 }
});
test('owned teardown waits for the real child exit and deduplicates concurrent callers',async t=>{
 const {root}=fixture(t),gate=path.join(root,'release-owned'),p=await child(t,0,gate);let requests=0,done=false;const a=stopOwned(p,()=>{requests++;p.stdin.end();});const b=stopOwned(p,()=>requests++);assert.equal(a,b);a.then(()=>{done=true;});await tick();assert.equal(done,false);fs.writeFileSync(gate,'1');await a;assert.equal(requests,1);assert.equal(p.exitCode,0);
});
test('timeout, kill failure and forced termination cannot be reported as graceful teardown',async t=>{
 const external=await child(t,1),fake=new EventEmitter();fake.pid=123;fake.exitCode=null;fake.signalCode=null;let kills=0;fake.kill=()=>{kills++;return false;};
 await assert.rejects(stopOwned(fake,()=>{},{graceMs:10,killMs:10}),/READER_STOP_INCOMPLETE/);assert.equal(kills,1);assert.equal(external.exitCode,null);
 const owned=await child(t,1);await assert.rejects(stopOwned(owned,()=>{},{graceMs:15,killMs:1000}),/READER_STOP_INCOMPLETE/);assert.notEqual(owned.signalCode,null);external.stdin.end();await once(external,'exit');
});
test('HookBridge and GalWindowBridge actual owned helpers both finish before Reader.stop resolves',async t=>{
 const {root}=fixture(t),gate=path.join(root,'release-hook'),hookChild=await child(t,0,gate),galChild=await child(t,20);
 const hook=Object.assign(Object.create(HookNative.prototype),{process:hookChild,islandSources:new Map(),pageReset(){},notify(){},send(m){hookChild.stdin.write(JSON.stringify(m)+'\n');}});
 const gal=Object.assign(Object.create(GalNative.prototype),{process:galChild,hooks:hook,controller:{},styleSync:{stop(){}},send(m){galChild.stdin.write(JSON.stringify(m)+'\n');}});
 const reader=new Reader({root,folder:path.join(root,'data/config'),emit(){}});reader.gal=gal;let done=false;const stop=reader.stop().then(()=>{done=true;});await once(galChild,'exit');assert.equal(done,false);assert.equal(hookChild.exitCode,null);fs.writeFileSync(gate,'1');await stop;assert.equal(hookChild.exitCode,0);assert.equal(hook.disposed,true);
});
test('the UI reader helper skips opening/waiting when disabled, and rechecks a toggle during open',async()=>{
 const {openPlayReader}=await import('../web/library-mode.js');let opened=0,waited=0,off=true;const api=async()=>({libraryOnly:off}),invoke=async()=>{opened++;off=true;},wait=async()=>waited++;
 assert.equal(await openPlayReader({api,invoke,wait}),false);assert.equal(opened,0);off=false;assert.equal(await openPlayReader({api,invoke,wait}),false);assert.equal(opened,1);assert.equal(waited,0);
 assert.equal(await openPlayReader({api:async()=>({}),invoke:async()=>opened++,wait}),true);assert.equal(waited,1);
});
test('a delayed launch bind cannot resume after disable, even when the user subsequently enables reading',()=>{
 const timers=[],method=Runtime.prototype.bindLaunched.toString();let off=false;const bind=vm.runInNewContext('({'+method+'}).bindLaunched',{setTimeout:fn=>{timers.push(fn);return {unref(){}};}}),sent=[];
 const runtime={libraryOnly:()=>off,reader:{gal:{hooks:{},send:m=>sent.push(m)}}};bind.call(runtime,42);assert.equal(runtime.reader.gal.hooks.launchedPid,42);assert.equal(timers.length,1);
 off=true;runtime.bindGeneration=1;off=false;timers.shift()();assert.equal(sent.length,0);assert.equal(timers.length,0);
});
test('a queued Japanese conversion rechecks the mode when its timer actually runs',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../services/japanese-auto-run.cjs'),'utf8'),timers=[];let off=false,runs=0;
 const context={module:{exports:{}},require:name=>name==='node:path'?path:name.endsWith('library-mode.cjs')?{libraryOnly:()=>off}:name.endsWith('japanese-restore-options.cjs')?{forExecutable:()=>({})}:name.endsWith('japanese-auto.cjs')?{read:()=>({games:{}}),run:()=>{runs++;return {};}}:{append(){}},setTimeout:fn=>{timers.push(fn);return {unref(){}};},Date};vm.runInNewContext(source,context);
 assert.equal(context.module.exports.considerLibrary('root',[{id:'g',executable:'H:/fake.exe'}]),1);off=true;timers.shift()();assert.equal(runs,0);assert.equal(context.module.exports._internal.queue().length,0);
});
test('a late translated response cannot draw through a captured compositor or return a frontend reply',async t=>{
 const {root}=fixture(t),reader=new Reader({root,folder:path.join(root,'data/config'),emit(){}});let release,drawn=0;
 reader.gal={preferences:{furigana:false},compositor:{text(){drawn++;}},send(){},stop(){}};reader.requestOptions=()=>({});reader.targetLanguage=()=> 'zh';reader.translate=()=>new Promise(resolve=>{release=resolve;});
 const pending=reader.message({type:'translate',text:'test',id:1});await tick();await reader.stop();release('translated');assert.equal((await pending).replies.length,0);assert.equal(drawn,0);
});
test('web teardown awaits strict restore and new-document script removal, and propagates restore failure',async()=>{
 const {WebTextPath}=require('../core/text-paths-web.cjs');let release,closed=0;const calls=[],p=new WebTextPath({port:1}),c={scriptIds:['one','two'],close(){closed++;},send:async(method,args)=>{calls.push([method,args]);if(method==='Runtime.evaluate')await new Promise(r=>{release=r;});return {};}};p.pages.set('p',c);let done=false;const stop=p.stop().then(()=>{done=true;});await tick();assert.equal(done,false);release();await stop;assert.equal(closed,1);assert.deepEqual(calls.filter(c=>c[0].startsWith('Page.')).map(c=>c[1].identifier),['one','two']);assert.match(calls[0][1].expression,/hide\(false\)/);assert.match(calls[0][1].expression,/roles:false,embed:false/);
 const bad=new WebTextPath({port:1});bad.pages.set('p',{close(){},send:async()=>{throw Error('no restore acknowledgement');}});await assert.rejects(bad.stop(),/READER_STOP_INCOMPLETE/);
});
test('a CDP connection completing after stop cannot inject document scripts',async()=>{
 const {WebTextPath}=require('../core/text-paths-web.cjs');const Old=global.WebSocket;let socket,opened=0;const calls=[];
 class FakeSocket{constructor(){socket=this;}send(raw){const m=JSON.parse(raw);calls.push(m.method);queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:m.id,result:{}})}));}close(){this.onclose?.();}}
 global.WebSocket=FakeSocket;try{const p=new WebTextPath({port:1}),attaching=p.attachPage({id:'p',webSocketDebuggerUrl:'ws://fake'});const stopped=p.stop();socket.onopen();await assert.rejects(attaching,/READER_DISABLED/);await stopped;assert(!calls.some(m=>m.startsWith('Page.')));assert.equal(p.pages.size,0);}finally{global.WebSocket=Old;}
});
test('library mode overrides compositor/env early injection and skips JP work before any game inspection',async t=>{
 const {root,settings}=fixture(t);settings.save({scope:'library',values:{libraryOnly:true}});const old=process.env.MEGULIT_GLYPH_MODE;process.env.MEGULIT_GLYPH_MODE='blank';try{assert.equal(require('../core/glyph-dots.cjs').mode(root),'');assert.equal(await require('../core/text-paths-launch.cjs').prepare({root,exe:'missing.exe',enabled:true}),null);}finally{if(old===undefined)delete process.env.MEGULIT_GLYPH_MODE;else process.env.MEGULIT_GLYPH_MODE=old;}
 const jp=require('../services/japanese-auto-run.cjs');assert.equal(jp.considerLibrary(root,[{id:'x',executable:'bad.exe'}]),0);assert.equal(jp.beforeLaunch(root,'x','not-a-game').disabled,true);
});
function launchHarness(mode,existing,{stopError=false}={}){
 const calls=[],source=fs.readFileSync(path.join(__dirname,'../services/bridge.cjs'),'utf8'),body=source.slice(source.indexOf('async function launch('),source.indexOf('\nfunction deleteWord'));
 const game={id:'g',executable:'H:/fake/中文版.exe',original:'{"library":{}}'},db={prepare(sql){return {get(){return sql.includes('SELECT original')?{original:'{}'}:game;},run(){calls.push('db-update');}};}};
 const modules={
  '../core/library-mode.cjs':{libraryOnly:()=>mode},'../core/profiles/index.cjs':require('../core/profiles/index.cjs'),'./import-source.cjs':{backfill(){},targetOf:()=>''},
  './background-games.cjs':{foreground:async()=>calls.push('foreground'),unmute:async()=>calls.push('unmute')},
  './embedded-japanese-jobs.cjs':require('../services/embedded-japanese-jobs.cjs'),
  '../core/steam-owned.cjs':{launchAppid:()=>'',partOf:()=>null},'./game-language.cjs':{originalExecutable:()=>{calls.push('jp-check');return {blocked:false};}},
  '../core/drm-wrap.cjs':{plan:()=>null},'./locale-launch.cjs':{requiresAdministrator:()=>false},
  './fata-wheel.cjs':require('../services/fata-wheel.cjs'),'./original-engines/krkr-lang.cjs':require('../services/original-engines/krkr-lang.cjs'),
  './shared-adaptation.cjs':{importFor(){}},'./japanese-restore-options.cjs':{forExecutable:()=>({})},
  '../core/japanese-restore.cjs':{repairNameColumns:()=>{calls.push('jp-repair');return {};},repairShared:()=>({}),_internal:{yurisPlan:()=>null}},
  './japanese-auto-run.cjs':{beforeLaunch:()=>calls.push('jp-auto')},'../core/japanese-auto.cjs':{launchResult(){}},
  '../core/directplay.cjs':{prepare:()=>({copied:[],declined:[],missing:[]})},'../core/windows-features.cjs':{prepareDotnet:()=>[],watch:()=>({stop(){}})},
  './game-process.cjs':{gameProcesses:async()=>[{pid:42}],gameProcess:async()=>existing?'focused':'absent'},
  './game-readiness.cjs':{waitForVisibleGame:async()=>({pid:42}),startProcess:async()=>{calls.push('launch');return {pid:42};}},
  '../core/text-paths-launch.cjs':{prepare:async options=>{if(options.enabled)calls.push('text-path');return null;}},
  '../core/glyph-dots.cjs':{earlyStart:()=>{calls.push('early');return null;},wanted:()=>false},'../core/locale-emulator.cjs':{x86:()=>false}
 };
 const context={root:'H:/fake-root',path,fs:{existsSync:()=>true,mkdirSync(){},appendFileSync(){},readFileSync:()=>'{"ownTextOutput":true}'},require(name){if(!modules[name])throw Error('unmocked '+name);return modules[name];},markLaunch(){},neededFeature:new Map(),process:{env:{}},setTimeout:()=>({unref(){}}),setInterval:()=>({unref(){}}),clearInterval(){},Date,console};
 vm.createContext(context);vm.runInContext(body+';globalThis.launch=launch',context);return {calls,run:()=>context.launch(db,'g',{stopReading:async()=>{calls.push('reader-stop');if(stopError)throw Error('READER_STOP_INCOMPLETE');},prepareGame:()=>calls.push('prepare'),bindLaunched:()=>calls.push('bind')})};
}
test('actual launch flow in library mode retains foreground cleanup, readiness and audio for new/existing games',async()=>{
 for(const existing of [false,true]){const h=launchHarness(true,existing);const result=await h.run();assert.equal(result.action,existing?'focused':'launched');assert.equal(h.calls[0],'foreground');assert(h.calls.includes('reader-stop'));assert(h.calls.includes('unmute'));assert(!h.calls.includes('jp-check'));assert(!h.calls.includes('jp-repair'));assert(!h.calls.includes('jp-auto'));assert(!h.calls.includes('text-path'));assert.doesNotThrow(()=>require('../services/embedded-japanese-jobs.cjs').assertLaunchSafe('H:/fake'));}
 const h=launchHarness(false,true);await h.run();assert(h.calls.includes('jp-check'));assert(h.calls.includes('jp-repair'));assert(h.calls.includes('jp-auto'));
});
test('a previously incomplete reader shutdown pauses library-only launch after cold cleanup',async()=>{
 const h=launchHarness(true,false,{stopError:true});await assert.rejects(h.run(),/READER_STOP_INCOMPLETE/);assert.equal(h.calls[0],'foreground');assert(!h.calls.includes('launch'));assert(!h.calls.includes('jp-auto'));assert.doesNotThrow(()=>require('../services/embedded-japanese-jobs.cjs').assertLaunchSafe('H:/fake'));
});
