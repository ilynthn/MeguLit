// E520 (user: a game that embedded before must replace its first line after a restart, no warm-up lines, no reload).
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {HookControl}=require('../core/hook-control.cjs');
const {Matcher}=require('../services/original-text.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function host(over={}){
 const sent=[],configured=[];
 const h={state:{bound:true,coverEnabled:true,gameProcessId:7,gameStarted:'1700000000000'},preferences:{hookProfile:'embed',hookHide:true,hookAutoStart:true,autoGameStyle:true,hookFast:true},
  hooks:{preflight:true,enabled:true,remembered:null,state:{hookThreads:[]},configure(){configured.push(h.hooks.preflight);},trace(){}},
  styleSync:{latest:null,status(){},request(){},begin(){}},send:m=>sent.push(m),save(p){h.preferences=p;},notify(){},onEvent(){},...over};
 return {h,sent,configured};
}

test('remembered stream: preflight off and hiding switched on before the first line',()=>{
 const {h,configured}=host();const c=new HookControl(h);c.plan='embed';c.running=true;
 h.hooks.remembered={name:'EmbedKiriKiri',code:'E@1:a.exe'};
 assert.equal(c.remembered(),true);
 assert.equal(h.hooks.preflight,false);assert.deepEqual(configured,[false]);
 c.source('「おはよう、今日もいい天気だね」');
 assert.ok(!c.styleCalibration,'no automatic style calibration on the first line');
 assert.equal(h.hooks.preflight,false);
 assert.equal(c.stage,'hidden');
});

test('remembered stream: start() and modeChanged() never bring the baseline back',()=>{
 const {h}=host();const c=new HookControl(h);c.running=true;h.hooks.remembered={name:'x',code:'E'};
 h.hooks.state.hookThreads=[{id:'1',embeddable:true}];
 c.start('embed',false);assert.equal(h.hooks.preflight,false);assert.ok(!c.styleCalibration);
 c.baseline=false;c.modeChanged();assert.equal(h.hooks.preflight,false);
});

test('no memory: the existing warm-up still applies (first time a game is embedded)',()=>{
 const {h}=host();const c=new HookControl(h);c.plan='embed';c.running=true;
 h.hooks.state.hookThreads=[{id:'1',embeddable:true}];
 c.start('embed',true);assert.equal(c.styleCalibration,true);assert.equal(h.hooks.preflight,true);
});

test('read plan or hiding switched off: memory does not force hiding',()=>{
 for(const [plan,hide] of [['read',true],['embed',false]]){const {h}=host();h.preferences.hookHide=hide;const c=new HookControl(h);c.plan=plan;c.running=true;h.hooks.remembered={name:'x',code:'E'};assert.equal(c.remembered(),false);assert.equal(h.hooks.preflight,true);}
});

test('matcher: a repeated line with identical text everywhere resolves without a reading position',()=>{
 const m=new Matcher(['はい','いいえ','はい','終わり'],['はい','いいえ','はい','終わり']);
 const r=m.match('はい');assert.equal(r.status,'high');assert.equal(r.method,'same-text');assert.equal(r.japanese,'はい');assert.equal(m.last,-1);
 const p=new Matcher(['はい','x','はい'],['好','x','是']);assert.equal(p.match('はい').status,'uncertain','different translations stay uncertain');
});

test('bridge: memory loaded in read-only starts and announced; relocated code accepted',()=>{
 const s=read('native/HookBridge.cs');
 assert.match(s,/if\(Resume==null\)try\{string mf=MemoryFile\(\)/);
 assert.match(s,/type="hookMemory"/);
 assert.match(s,/\|\|FromMemory&&!KnownIsland&&MagesAddress==0/);
 const n=read('core/hook-native.cjs');assert.match(n,/m\.type==='hookMemory'/);assert.match(n,/this\.remembered=null;this\.identity=identity/);
 assert.match(read('core/gal-native.cjs'),/hooks\.onRemembered=\(\)=>this\.controller\.remembered\(\)/);
});
