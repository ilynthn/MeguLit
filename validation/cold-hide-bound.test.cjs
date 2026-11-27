// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 千恋＊万花（千恋万花）and ファタモルガーナの館（海市蜃楼之馆）cold runs: the KiriKiri hook reported every line drawn
   visible (hidden=0) and the screenshots showed the original, while the installed app hides both. No cold run ever had
   'replacement=True': core hides only for a bound reader window (core/hook-native.cjs state.bound, else 'disable
   reason=reader-unbound') and the cold runner never said it was bound. The runner now binds like a played game
   (services/cold-test-run.cjs hookSetup), keeps whether the hide was on (run.json hideOn), and the adapter's cold stage says
   when it was off instead of taking leak as a hide result (tools/megulit-adapter/cold.cjs). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {HookNative}=require('../core/hook-native.cjs');

function fakeHelper(script){const sent=[],args=[];const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();
 child.stdin.on('data',b=>{for(const l of String(b).split('\n').filter(Boolean)){sent.push(l);if(l==='kill')setImmediate(()=>{child.stdout.write(JSON.stringify({type:'ended',why:'killed'})+'\n');child.stdout.end();child.emit('exit',0);});}});
 child.kill=()=>{};setImmediate(()=>script(m=>child.stdout.write(JSON.stringify(m)+'\n')));return {spawn:(f,a)=>{args.push(...a);return child;},sent,args};}
const until=async(cond,ms=10000)=>{const end=Date.now()+ms;while(!cond()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return cond();};

/* the real kernel, with its bridge process stubbed: what it sends the bridge is what the game gets */
let kernel=null;
class Kernel extends HookNative{constructor(layout,onEvent){super(layout,onEvent,()=>{throw Error('no bridge in a test');},()=>Date.now());this.trace=()=>{};this.bridge=[];this.send=m=>this.bridge.push(m);kernel=this;}
 start(t){this.process={};this.pid=t.pid;this.started=t.started;}}

test('a cold run hides the game\'s original like a played game: core sends the bridge enable, never reader-unbound',async()=>{
 const R=require('../services/cold-test-run.cjs');const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cold-hide-'));
 const h=fakeHelper(emit=>{emit({type:'started',pid:4242,started:'1'});emit({type:'window',hwnd:'77',pid:4242,started:'1',w:1280,h:720});});
 const p=R.runOne({exe:'C:/g/SenrenBanka.exe',runDir:path.join(dir,'run'),budgetMs:600000},{spawn:h.spawn,helper:'ColdDesk.exe',Hook:Kernel,layout:{native:dir,hook:dir},tick:5});
 let res;try{assert.ok(await until(()=>kernel&&kernel.bridge.length>0),'the kernel was configured');
  assert.ok(await until(()=>kernel.bridge.some(m=>m.type==='enable')),'bridge got: '+kernel.bridge.map(m=>m.type+(m.reason?':'+m.reason:'')).join(','));
  assert.ok(!kernel.bridge.some(m=>m.type==='disable'&&m.reason==='reader-unbound'));}
 finally{R.stopActive();res=await p;fs.rmSync(dir,{recursive:true,force:true});}
 assert.equal(res.hideOn,true,'the run says the hide was on');});

test('the cold stage: a run whose hide was off says so, and its leak is no hide result',()=>{const A=require('../tools/megulit-adapter/cold.cjs');
 const card={ok:true,errors:[],result:{lines:40,scores:{row:1,stable:1,clean:1,clear:1,choice:1,pair:1,leak:0},applies:{row:true,stable:true,clean:true,clear:true,choice:true,pair:true,leak:true},detail:{leakObservation:{observed:true,checked:0,native:true,read:false}}}};
 const cold={verdict:'pass',why:'',lines:40,measured:[],restored:true,near:0.2},diff={ok:true,mode:'hide',cost:0,over:[]};
 const on=A.judge({cold:{...cold},diff,card});assert.equal(on.checks.hidden.measured,true);assert.equal(on.checks.hidden.ok,false,'a hide that was on and leaked fails');
 const off=A.judge({cold:{...cold,hideOff:true},diff,card});assert.equal(off.checks.hidden.measured,false);assert.match(off.checks.hidden.detail,/隐藏没打开/);});

/* 千恋＊万花, visible run (the owner away): the game opened full screen; once it was the top window Windows reported a full-screen
   app and the run stopped after 5 s. On the hidden desktop a full-screen app is still the user playing: the run stops */
async function fullscreenRun(visible){const R=require('../services/cold-test-run.cjs');const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cold-full-'));
 class Hook{constructor(){}configure(){}tick(){}stop(){}drawLog(){}}
 const h=fakeHelper(emit=>{emit({type:'started',pid:7,started:'1'});emit({type:'window',hwnd:'9',w:1920,h:1080});setTimeout(()=>emit({type:'fullscreen',on:true}),30);});
 const p=R.runOne({exe:'C:/g/SenrenBanka.exe',runDir:path.join(dir,'run'),budgetMs:600000,visible},{spawn:h.spawn,helper:'ColdDesk.exe',Hook,layout:{native:dir},tick:5});
 await new Promise(r=>setTimeout(r,400));R.stopActive();const res=await p;fs.rmSync(dir,{recursive:true,force:true});return res;}
test('visible run: the game\'s own full screen does not stop the run',async()=>{const r=await fullscreenRun(true);assert.notEqual(r.end,'fullscreen');assert.notEqual(r.stopped,'fullscreen');});
test('hidden desktop: a full-screen app (the user playing) still stops the run',async()=>{const r=await fullscreenRun(false);assert.equal(r.end,'fullscreen');});

/* ファタモルガーナの館 prologue: 'choice options filtered 2 -> 0' was counted as a choice; the driver answered it with Down + Enter and
   a click, the game opened its config screen and the run stalled there */
test('only options the kernel found on the screen are a choice for the driver, never its candidates',async()=>{const R=require('../services/cold-test-run.cjs');
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cold-choice-'));let H=null;
 class Hook{constructor(){H=this.constructor;}configure(){}tick(){}stop(){}drawLog(){}}
 const h=fakeHelper(emit=>{emit({type:'started',pid:7,started:'1'});emit({type:'window',hwnd:'9',w:800,h:600});});
 const p=R.runOne({exe:'C:/g/fata_jp.exe',runDir:path.join(dir,'run'),budgetMs:600000},{spawn:h.spawn,helper:'ColdDesk.exe',Hook,layout:{native:dir},tick:5});
 await until(()=>H&&typeof H.traceTap==='function');
 H.traceTap('2026-11-27T00:18:42.178Z choice options filtered 2 -> 0');H.traceTap('2026-11-27T00:46:19.443Z choice options filtered 4 -> 1');
 H.traceTap('2026-11-27T00:52:44.203Z choice options filtered 5 -> 2');H.traceTap('2026-11-27T00:53:00.000Z choice ocr partial found=1 boxes=[]');H.traceTap('2026-11-26T21:12:43.111Z choice ocr all found=3 boxes=[]');
 H.traceTap('2026-11-26T21:24:39.757Z choice ocr partial found=2 boxes=[["……本当は、お優しい方なのかしら",467,196,816,218],["……本当に、几帳面な方なのね",524,283,638,304]] missed=[]');
 R.stopActive();const res=await p;fs.rmSync(dir,{recursive:true,force:true});
 assert.equal(res.choices,2,'only options the kernel found on the screen count (オルフレール real choice), never the candidates or the filter count');});
