// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal's replay driver (2026-11-21; was tools/reader-replay/driver.cjs, owner: 「做到真实 DOM 级别的验收回放」). One child
   process per run (core/layout.cjs reads MEGULIT_ROOT once). What runs is the code the player's PC runs:
     services/runtime.cjs -> services/reader.cjs -> core/gal-native.cjs -> core/hook-native.cjs (+ overlay placement, engine-draw)
     -> 'reader-event' -> web/reader/index.html with every module of web/reader/module-list.js, in a hidden reader
        (services/cardinal/cdp.cjs: headless Edge, no window, the priority of this process)
   Faked only at the process / OS edge: the two native bridges (GalWindowBridge, HookBridge: their stdout lines are the timeline's
   records, their stdin is captured), the program path of the game pid, the translation provider (a fixed Chinese text: no network,
   no API budget), the tokenizer runtime (absent). Nothing in between is stubbed. The relay is off: nothing is fetched or reported
   from inside a replay, and the copied settings have both upload switches off.
   Models (scenario.models, default on, for timelines rebuilt from logs; a tape of the bridges' own records sets models:false, it
   already carries what the game did):
     MODEL the KiriKiri script reports a dialogue line hidden=1 while core has the hide enabled (scenario.adaptiveHidden=false: off)
     MODEL at a click the game clears its message layer when the next line starts a new page; the script's clearSent reports it
           (tools/reader-replay/krkr-model.cjs, read from native/krkrtext; a repository-only file, never needed by a tape)
   Usage: node driver.cjs <scenario.json> <out.json>
     env MEGULIT_REPLAY_DATA  a data folder (config/ is copied: the player's or the fixture's settings; secrets never)
         MEGULIT_REPLAY_WORK  where the temporary root goes; MEGULIT_REPLAY_KEEP keeps it
         MEGULIT_CARDINAL_LOW=1  this process (and the browser it starts) runs below normal priority */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
if(process.env.MEGULIT_CARDINAL_LOW==='1')try{os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
const REPO=path.join(__dirname,'..','..');
const [scenarioFile,outFile]=process.argv.slice(2);
const scenario=JSON.parse(fs.readFileSync(scenarioFile,'utf8'));
const models=scenario.models!==false;
async function drive(){
fs.mkdirSync(process.env.MEGULIT_REPLAY_WORK||path.join(os.tmpdir(),'megulit-replay'),{recursive:true});
const work=fs.mkdtempSync(path.join(process.env.MEGULIT_REPLAY_WORK||path.join(os.tmpdir(),'megulit-replay'),'run-'));
const root=path.join(work,'root');
/* ---- a MeguLit root with the player's settings (no secrets, no learning database) ---- */
const FILE_MAX=16*1024*1024;
function copy(from,to){if(!fs.existsSync(from))return;const st=fs.statSync(from);if(st.isDirectory()){fs.mkdirSync(to,{recursive:true});for(const f of fs.readdirSync(from))copy(path.join(from,f),path.join(to,f));}else if(st.size<=FILE_MAX){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}}
const data=process.env.MEGULIT_REPLAY_DATA||'';
fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
if(scenario.sessionIdentity){
 try{await require('./identity.cjs').copyData(scenario.sessionIdentity,{data,destination:path.join(root,'data'),game:scenario.game});}
 catch(error){const out={work,deferred:true,errors:[require('./identity.cjs').reasonCode(error)],samples:[],cleanupComplete:true};try{fs.rmSync(work,{recursive:true,force:true});}catch{out.cleanupComplete=false;out.cleanupFailure={reason:'identity-rejection-cleanup',processClosed:false};}fs.writeFileSync(outFile,JSON.stringify(out));return;}
}else{
if(data){if(fs.existsSync(path.join(data,'config')))for(const f of fs.readdirSync(path.join(data,'config')))if(!/secrets|account|backup|\.tmp$/i.test(f))copy(path.join(data,'config',f),path.join(root,'data','config',f));
 for(const f of ['preferences.json','ui-state.json','window-state.json'])copy(path.join(data,f),path.join(root,'data',f));
 /* the relay's answer for this exe (the shared / official layer the session ran with) */
 if(/^[0-9a-f]{64}$/.test(String(scenario.game?.sha||'')))copy(path.join(data,'The Seed',scenario.game.sha+'.json'),path.join(root,'data','The Seed',scenario.game.sha+'.json'));}
}
/* no relay from inside a replay: a saved relay address (data/config/online.json relayUrl) would win over MEGULIT_RELAY_BASE=off */
{const f=path.join(root,'data','config','online.json');if(fs.existsSync(f))try{const v=JSON.parse(fs.readFileSync(f,'utf8'))||{};delete v.relayUrl;fs.writeFileSync(f,JSON.stringify(v,null,2));}catch{fs.rmSync(f,{force:true});}}
{const f=path.join(root,'data','config','library.json');let lib={};try{lib=JSON.parse(fs.readFileSync(f,'utf8'))||{};}catch{}fs.writeFileSync(f,JSON.stringify({...lib,autoProfileShare:false,runtimeSampleShare:false},null,2));}
for(const [k,v] of Object.entries(scenario.galPreferences||{})){const f=path.join(root,'data','config','gal-preferences.json');const g=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};g[k]=v;fs.writeFileSync(f,JSON.stringify(g,null,2));}
for(const n of ['GalWindowBridge.exe','HookBridge.exe'])copy(path.join(__dirname,'stub.txt'),path.join(root,'native',n));
for(const n of ['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])copy(path.join(__dirname,'stub.txt'),path.join(root,'runtime','hook',n));
fs.mkdirSync(path.join(root,'logs'),{recursive:true});
process.env.MEGULIT_ROOT=root;process.env.MEGULIT_RELAY_BASE='off';process.env.MEGULIT_CARDINAL_REPLAY='1';process.env.TEMP=process.env.TMP=path.join(work,'tmp');fs.mkdirSync(process.env.TEMP,{recursive:true});
/* ---- OS edge ---- */
const fonts=require(path.join(REPO,'core','game-fonts.cjs'));fonts.exePath=async()=>scenario.game.exe;
const providers=require(path.join(REPO,'core','providers.cjs'));
providers.createTranslationService=()=>({setKey(){},hasKey(){return true;},observeSource(){},clearContext(){},lookup:async()=>null,translate:async text=>(scenario.translations||{})[text]||('中文：'+text)});
let measureTime=null;const stamp=()=>measureTime?measureTime():performance.now();
function fakeProc(name){const p=new EventEmitter();p.stdout=new PassThrough();p.stdin=new PassThrough();p.exitCode=null;p.pid=90000+Math.floor(Math.random()*999);p.kill=()=>{p.exitCode=0;p.emit('exit',0);};p.sent=[];let buf='';
 p.stdin.on('data',d=>{buf+=String(d);let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);try{p.sent.push({at:stamp(),m:JSON.parse(line)});}catch{}}});
 p.line=o=>p.stdout.write(JSON.stringify(o)+'\n');p.name=name;return p;}
const gwb=fakeProc('GalWindowBridge');let hookSpawned=0;
/* HookBridge: a new process per start (core/hook-native.cjs start), the newest one gets the timeline's lines. Like the real bridge it
   says it is alive every second (hookHeartbeat). With models on it also follows core's hide switch (see the MODEL above) */
const hbs=[];let hideOn=false;const hbAll={sent:[]};const hidden=require('../../core/cardinal/native-hide.cjs').collector({modeled:models});
/* the game side of a non-KiriKiri engine (tools/reader-replay/engine-models.cjs): sees what core sends the bridge */
let engineModel=null;
function newHook(){const p=fakeProc('HookBridge');p.stdin.on('data',()=>{for(const x of p.sent.splice(0)){hbAll.sent.push(x);try{engineModel?.sent(x.m);}catch{}if(x.m.type==='enable')hideOn=true;if(x.m.type==='disable')hideOn=false;}});
 p.beat=setInterval(()=>{if(p.exitCode===null)p.line({type:'hookHeartbeat',hookActive:true,processAttached:true,streamSelected:true,receivedText:true,replacementState:'callback-acknowledged'});},1000);p.beat.unref?.();
 p.kill=()=>{clearInterval(p.beat);p.exitCode=0;p.emit('exit',0);};p.stdin.on('finish',()=>{});hbs.push(p);return p;}
const hb={line:o=>{const p=hbs.at(-1);if(!p||p.exitCode!==null)return;
  if(o.type==='hookChars'&&models&&scenario.adaptiveHidden!==false&&/ hidden=[01] /.test(o.line)&&!/ role=(?!line)/.test(o.line))o={...o,line:o.line.replace(/ hidden=[01] /,' hidden='+(hideOn?1:0)+' ')};
  if(o.type==='hookChars')hidden.report(o.line,hideOn);
  p.line(o);},get sent(){return hbAll.sent;}};
const events=[];const offers=[];let lastOffer='';
const {Runtime}=require(path.join(REPO,'services','runtime.cjs'));
let page=null;const early=[];
const runtime=new Runtime(root,(channel,payload)=>{if(channel!=='reader-event')return;events.push({at:stamp(),m:payload});
 /* the options core offered the reader (hookChoices), once per new set */
 /* core/hook-native.cjs notify({hookChoices:{items:[{text,x0,y0,x1,y1}],sw,sh,at,unboxed}}) or {hookChoices:null} */
 if(payload&&Object.prototype.hasOwnProperty.call(payload,'hookChoices')){const c=payload.hookChoices,items=Array.isArray(c)?c:Array.isArray(c?.items)?c.items:[];const k=JSON.stringify(items.map(x=>x?.text??x));if(k!==lastOffer&&offers.length&&offers.at(-1).until==null)offers.at(-1).until=stamp();if(items.length&&k!==lastOffer)offers.push({at:stamp(),n:items.length,texts:items.map(x=>String(x?.text??x).slice(0,4000)),until:null});lastOffer=items.length?k:'';}
 if(page)page.evaluate(m=>window.__replayEvent(m),payload).catch(()=>{});else early.push(payload);});
runtime.spawnReaderNative=()=>gwb;
/* the tokenizer runtime is absent here and never installed (no pip / dictionary download from a replay): requests fail like an uninstalled one */
const replayLearning={installed:()=>false,status:require(path.join(REPO,'core','learning-native.cjs')).LocalLearning.prototype.status,
 request:async()=>{throw Error('LEARNING_NOT_INSTALLED');},readings:{resolve:t=>t},adaptResult:r=>r,progress:{stage:'idle'}};
runtime.learning=()=>replayLearning;
const bridge=require(path.join(REPO,'services','bridge.cjs'));
async function service(request){
 if(request.action==='reader_attach'){const r=await runtime.call(request);const h=runtime.reader?.gal?.hooks;if(h){h.spawn=()=>{hookSpawned++;return newHook();};}return r;}
 try{return await bridge.dispatch(request,runtime);}catch(e){if(/reader_|ui_state|home|preserve_ui/.test(request.action))throw e;return null;}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};
/* the app's two schemes: tauri.localhost = the web folder, ipc.localhost = nothing (the reader's invoke goes through the binding);
   every other request is refused (a replay never reaches the network) */
function serve(url){let u;try{u=new URL(url);}catch{return 'abort';}if(/^(data|blob|about):/.test(url))return null;
 if(u.host==='tauri.localhost'){const f=path.join(REPO,'web',decodeURIComponent(u.pathname));if(fs.existsSync(f)&&fs.statSync(f).isFile())return {status:200,body:fs.readFileSync(f),headers:{'content-type':TYPES[path.extname(f)]||'application/octet-stream'}};
  if(path.basename(f)==='local-font.js')return {status:200,body:'/* generated by tools/prepare-reader.cjs: no optional local font */',headers:{'content-type':'text/javascript'}};return {status:404,body:''};}
 if(u.host==='ipc.localhost')return {status:200,body:'null',headers:{'content-type':'application/json','Tauri-Response':'ok'}};
 return 'abort';}
return (async()=>{
 const out={work,models,errors:[],console:[],samples:[],sourceEpisodes:[],marks:[],hookSpawned:0,gwbSent:[],hbSent:[],events:[],control:[],choiceOffers:[],screenChoices:[],hidden:{lines:0,visible:0},krkr:{clears:0,choice:[],cfg:null}};let krkr=null,lastLine=null,browser=null;
 const modelCall=fn=>{try{fn();}catch(e){out.krkr.error=String(e?.message||e).slice(0,300);krkr=false;}};
 let disposal=null,stopRequested=false;
 const finish=()=>{if(disposal)return disposal;disposal=(async()=>{
  try{runtime.reader?.gal?.stop?.();}catch{}try{runtime.reader?.stop?.();}catch{}
  await browser?.close().catch(error=>{out.errors.push('browser cleanup: '+String(error?.message||error).slice(0,400));out.cleanupFailure=error.cleanupFailure||{browserPid:browser?.pid||null,processClosed:false,reason:String(error?.message||error)};});
  if(!process.env.MEGULIT_REPLAY_KEEP&&!out.cleanupFailure)try{fs.rmSync(work,{recursive:true,force:true});}catch(error){out.cleanupFailure={profile:work,processClosed:true,reason:'driver-work-cleanup: '+error.message};}
  out.cleanupComplete=!out.cleanupFailure;
  fs.writeFileSync(outFile,JSON.stringify(out,null,1));
  process.exit(0);
 })();return disposal;};
 process.on('message',message=>{if(message?.type!=='cardinal-stop')return;stopRequested=true;out.interrupted=true;if(browser)void finish().catch(error=>{process.stderr.write('cardinal stop cleanup: '+String(error));process.exit(1);});});
 try{
  browser=await require('./cdp.cjs').launch({viewport:scenario.viewport||{width:1920,height:1080}});
  if(stopRequested)throw Error('replay interrupted before reader setup');
  page=browser.page;
  page.route(url=>{const r=serve(url);if(r&&r!=='abort'&&r.status>=400&&out.console.length<200)out.console.push('http '+r.status+' '+url.slice(0,160));return r;});
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&out.console.length<200)out.console.push(m.type()+': '+m.text().slice(0,300));});
  page.on('pageerror',e=>out.errors.push(String(e.stack||e).slice(0,600)));
  await page.exposeFunction('__replayInvoke',async json=>{const {cmd,args}=JSON.parse(json);try{
    if(cmd==='service')return JSON.stringify({ok:await service(args.request)});
    if(cmd==='reader_connect')return JSON.stringify({ok:await service({action:'reader_attach',pid:process.pid,hwnd:'1234'})});
    return JSON.stringify({ok:null});}catch(e){return JSON.stringify({error:String(e&&e.message||e)});}});
  await page.addInitScript(()=>{const cbs=new Map();let n=1;
   const internal={transformCallback(fn){const id=n++;cbs.set(id,fn);return id;},unregisterCallback(id){cbs.delete(id);},runCallback(id,v){cbs.get(id)?.(v);},callbacks:cbs,
    invoke:async(cmd,args={})=>{if(cmd==='plugin:event|listen'){window.__replayHandler=args.handler;return 1;}const r=JSON.parse(await window.__replayInvoke(JSON.stringify({cmd,args})));if(r.error)throw Error(r.error);return r.ok;}};
   Object.defineProperty(window,'__TAURI_INTERNALS__',{value:internal,configurable:true});
   window.__replayEvent=m=>{const id=window.__replayHandler;if(id)cbs.get(id)?.({payload:m});};});
  await page.goto('http://tauri.localhost/reader/index.html');
  try{await page.waitForFunction(()=>window.__TOME_READER_READY__===true,null,{timeout:30000});}catch(e){out.errors.push('not ready: '+await page.evaluate(()=>document.querySelector('#reader-status')?.textContent).catch(()=>'?'));const f=path.join(root,'logs','reader-startup.log');if(fs.existsSync(f))out.errors.push(fs.readFileSync(f,'utf8').slice(-1500));throw e;}
  for(const m of early.splice(0))await page.evaluate(m=>window.__replayEvent(m),m).catch(()=>{});
  await page.addScriptTag({path:path.join(REPO,'web','reader','replay-probe.js')});
  /* ---- the timeline: bridge lines at their recorded times (gaps over maxGap shortened) ---- */
  const Timing=require('../../core/cardinal/timing.cjs'),timing=Timing.recorder({sampleMs:scenario.sampleEvery}),elapsed=timing.elapsed,t0=timing.origin;out.t0=timing.wallOrigin;measureTime=()=>t0+elapsed();let clock=0;const maxGap=scenario.maxGap||2500;
  let prevT=null,sampling=!!scenario.sampleEvery;
  const hits=()=>(gwb.sent.filter(x=>x.m.type==='hitRegions').at(-1)?.m.regions)||[];
  /* a sampler beside the timeline: what the page shows every sampleEvery ms (flashes between two marks) */
  /* how late the replay ran (a busy PC stretches it and the scores would blame the reader): each step's start past its time, each sample's gap past sampleEvery */

  const sampler=(async()=>{while(sampling){const s=await page.evaluate(()=>window.__replayProbe()).catch(()=>null);const at=timing.sample(!!s&&typeof s==='object'&&!Array.isArray(s)&&!s.error);if(s){s.mark='tick';s.watch=true;s.at=at;s.hitRegions=hits();s.src=s.hookSource;out.samples.push(s);}await sleep(scenario.sampleEvery);}})();
  /* scenario.attachSettleMs: the reader settles (its profile, the hide route) after the attach before the first line, as on the player's
     PC where the reader is up long before the game says anything */
  let settled=!scenario.attachSettleMs,identityChecked=false;
  for(const [stepIndex,step] of scenario.steps.entries()){
   if(!settled&&step.hb?.type==='hookSource'){settled=true;clock+=scenario.attachSettleMs;}
   if(step.t!=null){if(prevT!=null){const gap=Math.min(maxGap,Math.max(0,step.t-prevT));clock+=gap;}prevT=step.t;let wait=clock-elapsed();while(wait>0){await sleep(wait);wait=clock-elapsed();}timing.step(stepIndex,clock);}
   if(scenario.sessionIdentity&&!identityChecked&&step.hb?.type==='hookSource'){identityChecked=true;if(!require('./identity.cjs').profileMatches(scenario.sessionIdentity,runtime.reader?.gal?.profile)){sampling=false;await sampler;out.deferred=true;out.errors.push('CARDINAL_IDENTITY_PROFILE');return;}}
   /* 2026-11-26 the game-side model by engine: KiriKiri's script (models on: a timeline from logs), YU-RIS, BGI, or the generic one
      that models nothing (a tape of any other engine; a KiriKiri tape, whose bridge records are the game side already) */
   if(step.gwb?.type==='bound'&&!engineModel&&!krkr){const E=require(path.join(REPO,'tools','reader-replay','engine-models.cjs'));let kind=E.pick({engine:scenario.game?.engine,threads:scenario.steps.find(x=>x.hb?.type==='hookThreads')?.hb.hookThreads});if(kind==='generic'&&models)kind='krkr';
    if(kind==='krkr'&&!models)kind='generic';if(kind!=='krkr')try{engineModel=new E.MODELS[kind]({pid:step.gwb.gameProcessId,tmp:process.env.TEMP});}catch(e){out.modelError=String(e?.message||e).slice(0,300);engineModel=new E.MODELS.generic({pid:step.gwb.gameProcessId,tmp:process.env.TEMP});}}
   if(step.gwb){if(models&&step.gwb.type==='bound'&&!krkr&&!engineModel&&fs.existsSync(path.join(REPO,'native','krkrtext','script.inc')))try{const {KrkrModel}=require(path.join(REPO,'tools','reader-replay','krkr-model.cjs'));krkr=new KrkrModel({pid:step.gwb.gameProcessId,tmp:process.env.TEMP});}catch(e){out.krkr.error=String(e.message||e);krkr=false;}
    /* MODEL (labelled): the game clears its message layer at the click ([cm]); the script's own clearSent reports it when the control file says #clearline */
    /* 2026-11-26 a model that throws (a script.inc the rewrite cannot run) is switched off and named in out.krkr.error; the replay goes on */
    if(step.gwb.type==='readerInput'&&krkr&&lastLine&&step.pageClear!==false)modelCall(()=>{krkr.tick();const n=krkr.reports.length;krkr.st.clearSent(lastLine);for(const r of krkr.reports.slice(n))hb.line({type:'hookChars',line:r});out.krkr.clears+=krkr.reports.length-n;});
    gwb.line(step.gwb);if(step.gwb.type==='bound'&&scenario.sessionIdentity){await sleep(0);const context=scenario.sessionIdentity.context;runtime.reader?.applyGameProfile(scenario.game.exe,{title:context.title,original:JSON.stringify({library:{engine:context.engine,vndbId:context.vndb}})});}}
   if(step.hb&&engineModel){try{if(step.hb.type==='hookThreads')engineModel.threads(step.hb.hookThreads);if(step.hb.type==='hookSource')engineModel.line(step.hb.text);}catch(e){out.modelError=String(e?.message||e).slice(0,300);}}
   if(step.hb){if(step.hb.type==='hookSource')out.sourceEpisodes.push({step:stepIndex,line:step.line,text:step.hb.text,at:elapsed()});hb.line(step.hb);if(step.hb.type==='hookChars'){const m=/ line=(\d+) hidden=\d sw=(\d+) sh=(\d+) .* n=(\d+) /.exec(step.hb.line);if(m&&!/ role=(?!line)/.test(step.hb.line)&&+m[4]>0)lastLine={line:+m[1],sentLine:+m[1],sw:+m[2],sh:+m[3]};}}
   /* options the game showed (core/cardinal/timeline.cjs screenRow): only noted, never fed to the reader */
   if(step.screenChoice)out.screenChoices.push({step:stepIndex,at:elapsed(),texts:step.screenChoice.texts,span:Number.isFinite(step.screenChoice.until)?Math.max(0,step.screenChoice.until-step.t):null});
   if(step.choicePage&&krkr)modelCall(()=>{krkr.tick();out.krkr.choice.push({mark:step.choicePage,frame:step.frame||'選択肢',ui:krkr.st.uiDraw({parent:{frameGraphic:step.frame||'選択肢',height:400}}),cfg:JSON.parse(JSON.stringify(krkr.st.cfg,(k,v)=>v instanceof RegExp?String(v):v))});});
   if(step.page)await page.evaluate(typeof step.page==="string"?"("+step.page+")()":step.page).catch(e=>out.errors.push('step page: '+e.message));
   if(step.mark){await sleep(step.settle??150);const s=await page.evaluate(()=>window.__replayProbe()).catch(e=>({error:e.message}));s.mark=step.mark;s.at=elapsed();s.hitRegions=hits();out.samples.push(s);}
   if(step.watch){const until=elapsed()+step.watch;while(elapsed()<until){const s=await page.evaluate(()=>window.__replayProbe()).catch(e=>({error:e.message}));s.mark=step.mark||('watch:'+step.watchName);s.at=elapsed();s.watch=true;s.hitRegions=hits();out.samples.push(s);await sleep(step.every||80);}}
   if(step.control){const dir=path.join(process.env.TEMP,'MeguLit','draw');await sleep(120);const files=fs.existsSync(dir)?fs.readdirSync(dir):[];out.control.push({mark:step.control,files:files.map(f=>({name:f,text:fs.readFileSync(path.join(dir,f)).slice(2).toString('utf16le')}))});}
  }
  /* the last line stays on screen a moment, so it is measured like the others */
  if(scenario.tailMs)await sleep(scenario.tailMs);
  sampling=false;await sampler;out.timing=timing.finish();measureTime=null;out.lag=Timing.statistics(out.timing.steps,out.timing.probes,scenario.sampleEvery).lag;
  if(scenario.sessionIdentity&&!require('./identity.cjs').profileMatches(scenario.sessionIdentity,runtime.reader?.gal?.profile)){out.deferred=true;out.errors.push('CARDINAL_IDENTITY_PROFILE');return;}
  {const dir=path.join(process.env.TEMP,'MeguLit','draw');const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^\d+\.txt$/.test(f)):[];out.control.push({mark:'end',files:files.map(f=>({name:f,text:fs.readFileSync(path.join(dir,f)).slice(2).toString('utf16le')}))});}
  out.model=engineModel?engineModel.summary():krkr?{name:'krkr',label:'KiriKiri 模型',cfg:{...krkr.st.cfg},bad:out.krkr.error?[out.krkr.error]:[]}:krkr===false?{name:'krkr',label:'KiriKiri 模型（出错已关）',bad:[String(out.krkr.error||'')]}:{name:'generic',label:'通用模型',bad:[]};if(out.modelError)out.model.bad=[...(out.model.bad||[]),'model error: '+out.modelError];
  if(krkr)modelCall(()=>{krkr.tick();out.krkr.cfg=JSON.parse(JSON.stringify(krkr.st.cfg,(k,v)=>v instanceof RegExp?String(v):v));out.krkr.ctl=krkr.ctl;});
  out.hookSpawned=hookSpawned;out.gwbSent=gwb.sent.filter(x=>x.m.type!=='hitRegions').slice(-200).map(x=>x.m);out.hbSent=hb.sent.map(x=>({at:x.at-t0,...x.m})).filter(m=>m.type!=='source');
  out.events=events.map(e=>({at:e.at-t0,type:e.m.type,keys:Object.keys(e.m).slice(0,12)})).slice(-400);

  out.choiceOffers=offers.map(c=>({at:c.at-t0,n:c.n,texts:c.texts,until:c.until==null?null:c.until-t0}));out.hidden=hidden.snapshot();
  out.hookEvents=[];for(const f of ['hook-events.log.previous','hook-events.log.1','hook-events.log']){const x=path.join(root,'logs',f);if(fs.existsSync(x))out.hookEvents.push(...fs.readFileSync(x,'utf8').split(/\r?\n/).filter(l=>l&&!/Z (chain|translation|choice aux|art text located) /.test(l)));}
  out.readerHost=fs.existsSync(path.join(root,'logs','reader-host.log'))?fs.readFileSync(path.join(root,'logs','reader-host.log'),'utf8').split('\n').filter(l=>!/"hostFrame"/.test(l)).slice(-200):[];
 }catch(e){out.errors.push('driver: '+String(e.stack||e).slice(0,800));if(e.cleanupFailure)out.cleanupFailure=e.cleanupFailure;}
 finally{await finish();}

})();

}
drive().catch(()=>{fs.writeFileSync(outFile,JSON.stringify({errors:['driver bootstrap failed'],samples:[],cleanupFailure:{reason:'driver-bootstrap-failed',processClosed:false}}));process.exitCode=1;});
