// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 tools/megulit-adapter/cold.cjs (the cold stage of MeguLit-Adapter, formerly tools/adapt-auto.cjs) without a game: arguments, folder triage (Switch / disc image / no exe), exe + engine lookup on a
   temp KiriKiri-shaped folder, the one-run lock, and judge(): the cold self-check + Cardinal scores → pass / fail / inconclusive,
   where anything not measured stays inconclusive. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const A=require('../tools/megulit-adapter/cold.cjs');
/* the cold runner ticks on real timers: wait for what a test expects instead of a fixed time (a busy machine runs it late) */
const until=async(cond,ms=10000)=>{const end=Date.now()+ms;while(!cond()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return cond();};
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'adapt-auto-'));
const put=(f,size=16)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.alloc(size));};

const COLD={verdict:'pass',why:'',lines:40,measured:['hideVisible','dropRate','repeatRate'],restored:true,near:0.2};
const DIFF={ok:true,mode:'hide',cost:0,over:[]};
const CARD=(scores={},applies={})=>({ok:true,errors:[],result:{lines:40,scores:{row:1,stable:1,clean:1,clear:1,choice:1,pair:1,leak:1,...scores},applies:{row:true,stable:true,clean:true,clear:true,choice:true,pair:true,leak:true,...applies},detail:{leakObservation:{observed:true,checked:0,native:false,read:false}}}});

test('arguments: folder, --exe, --out, --budget-min',()=>{
 const o=A.parseArgs(['node','x','D:\\g','--exe','a\\b.exe','--out','F:\\o','--budget-min','4']);
 assert.deepEqual([o.dir,o.exe,o.out,o.budgetMin],['D:\\g','a\\b.exe','F:\\o',4]);
 assert.throws(()=>A.parseArgs(['node','x']),/usage/);
 assert.throws(()=>A.parseArgs(['node','x','d','--budget-min','0']),/budget/);
 assert.throws(()=>A.parseArgs(['node','x','d','--bogus']),/unknown/);});

test('title and output names from the download folder',()=>{
 assert.equal(A.titleOf('E:\\gal\\[GAME][PC-JP] トリック･オア･アリス'),'トリック･オア･アリス');
 assert.equal(A.titleOf('E:\\gal\\[GAME]『黒と金の開かない鍵。』'),'黒と金の開かない鍵。');
 assert.equal(A.safeName('a:b?c. '),'a_b_c');});

test('triage: Switch titles and disc images are inconclusive with a reason',()=>{const d=tmp();
 const sw=path.join(d,'[GAME]Garden[01009DB022BC6000][1.0.0]');put(path.join(sw,'game.nsp'));
 assert.match(A.unsupported(sw),/Switch/);
 const disc=path.join(d,'disc');put(path.join(disc,'game.bin'));put(path.join(disc,'game.cue'));
 assert.match(A.unsupported(disc),/光盘镜像/);
 const none=path.join(d,'none');put(path.join(none,'readme.txt'));
 assert.match(A.unsupported(none),/没有 exe/);
 const j=A.judge({unsupported:A.unsupported(sw)});assert.equal(j.verdict,'inconclusive');assert.match(j.reasons[0],/Switch/);});

test('locate: the main exe one level down and the engine from the library registry; --exe wins',()=>{const d=tmp();
 const g=path.join(d,'[GAME]x','x');put(path.join(g,'orfre.exe'),300000);put(path.join(g,'data.xp3'),5000);put(path.join(g,'unins000.exe'),300000);
 assert.equal(A.unsupported(path.join(d,'[GAME]x')),'');
 const l=A.locate(path.join(d,'[GAME]x'));assert.equal(path.basename(l.exe),'orfre.exe');assert.equal(l.engine,'kirikiri');
 assert.equal(path.basename(A.locate(path.join(d,'[GAME]x'),'x\\unins000.exe').exe),'unins000.exe');
 assert.throws(()=>A.locate(path.join(d,'[GAME]x'),'nope.exe'),/not found/);});

test('lock: one run at a time; a dead holder is taken over',()=>{const d=tmp(),f=path.join(d,'l.lock');
 const r=A.lock(f);assert.ok(r);assert.equal(A.lock(f),null);r();
 fs.writeFileSync(f,'999999');const r2=A.lock(f);assert.ok(r2,'stale pid');r2();});

test('judge: everything measured and over the gate is pass',()=>{const j=A.judge({cold:COLD,diff:DIFF,card:CARD()});
 assert.equal(j.verdict,'pass');assert.deepEqual(Object.keys(j.checks),['hidden','replaced','choice']);assert.ok(Object.values(j.checks).every(c=>c.ok===true));});

test('judge: not measured is never pass',()=>{
 assert.equal(A.judge({cold:COLD,diff:DIFF,card:CARD({},{choice:false})}).verdict,'inconclusive','no choice reached');
 assert.match(A.judge({cold:COLD,diff:DIFF,card:CARD({},{choice:false})}).reasons.join(' '),/没推进到选项/);
 assert.equal(A.judge({cold:{...COLD,measured:['dropRate']},diff:DIFF,card:CARD()}).verdict,'pass','no cold-run hideVisible needed: Cardinal observed the hide');
 {const c=CARD();c.result.detail.leakObservation.observed=false;assert.equal(A.judge({cold:COLD,diff:DIFF,card:c}).verdict,'inconclusive','Cardinal did not observe the hide');}
 assert.equal(A.judge({cold:COLD,diff:DIFF,card:null}).verdict,'inconclusive');
 assert.equal(A.judge({cold:COLD,diff:DIFF,card:{ok:false,why:'x'}}).verdict,'inconclusive');
 assert.equal(A.judge({cold:COLD,diff:{ok:false,why:'x'},card:CARD()}).verdict,'inconclusive');
 assert.equal(A.judge({cold:COLD,diff:DIFF,card:{...CARD(),errors:['boom']}}).verdict,'inconclusive');
 assert.equal(A.judge({cold:COLD,diff:DIFF,card:{...CARD(),result:{...CARD().result,lines:0}}}).verdict,'inconclusive');
 assert.equal(A.judge({}).verdict,'inconclusive');});

test('judge: the cold test decides first',()=>{
 for(const v of ['blocked','skipped','inconclusive'])assert.equal(A.judge({cold:{...COLD,verdict:v,why:'no-lines'},diff:DIFF,card:CARD()}).verdict,'inconclusive',v);
 assert.equal(A.judge({cold:{...COLD,restored:false},diff:DIFF,card:CARD()}).verdict,'inconclusive','saves not restored');
 const f=A.judge({cold:{...COLD,verdict:'fail',why:'hideVisible'},diff:DIFF,card:CARD()});assert.equal(f.verdict,'fail');
 assert.equal(A.judge({cold:{...COLD,verdict:'fail'},diff:{ok:false},card:null}).verdict,'fail','a failed self-check stays a fail without the rest');
 assert.equal(A.judge({cold:{...COLD,verdict:'edge',near:0.9},diff:DIFF,card:CARD()}).verdict,'pass');});

test('judge: a measured check under the gate is fail',()=>{
 assert.equal(A.judge({cold:COLD,diff:DIFF,card:CARD({leak:0.5})}).verdict,'fail');
 assert.equal(A.judge({cold:COLD,diff:DIFF,card:CARD({pair:0.2})}).verdict,'fail');
 assert.equal(A.judge({cold:COLD,diff:DIFF,card:CARD({choice:0})}).verdict,'fail');
 assert.equal(A.judge({cold:COLD,diff:{...DIFF,mode:'read',over:['hideVisible']},card:CARD()}).verdict,'fail');});

test('exit codes: 0 pass, 1 fail, 2 inconclusive',()=>{assert.deepEqual(A.EXIT,{pass:0,fail:1,inconclusive:2});});

test('run: a Switch folder writes result.json without touching the game folder',async()=>{const d=tmp();
 const sw=path.join(d,'[GAME]Garden[01009DB022BC6000]');put(path.join(sw,'game.nsp'));const out=path.join(d,'out');
 const before=fs.readdirSync(sw);const r=await A.run({dir:sw,out,budgetMin:1,app:''},{log:()=>{}});
 assert.equal(r.verdict,'inconclusive');const j=JSON.parse(fs.readFileSync(path.join(out,'result.json'),'utf8'));
 for(const k of ['verdict','engine','gameKey','reasons','artifacts'])assert.ok(k in j,k);
 assert.deepEqual(fs.readdirSync(sw),before);
 await assert.rejects(A.run({dir:sw,out:path.join(sw,'o'),budgetMin:1},{log:()=>{}}),/inside the game folder/);});

/* ---- the cold-test pieces adapt-auto switched on (2026-11-26) ---------------------------------------------------------- */
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
function fakeHelper(script){const sent=[],args=[];const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();
 child.stdin.on('data',b=>{for(const l of String(b).split('\n').filter(Boolean)){sent.push(l);if(l==='kill')setImmediate(()=>{child.stdout.write(JSON.stringify({type:'ended',why:'killed'})+'\n');child.stdout.end();child.emit('exit',0);});
  if(l.startsWith('shot '))child.stdout.write(JSON.stringify({type:'shot',ok:true,path:l.split(' ').slice(2).join(' '),w:1280,h:720,black:false})+'\n');}});
 child.kill=()=>{};setImmediate(()=>script(m=>child.stdout.write(JSON.stringify(m)+'\n')));return {spawn:(f,a)=>{args.push(...a);return child;},sent,args};}
class FakeHook{constructor(layout){this.layout=layout;FakeHook.last=this;}configure(p,s){this.state=s;}tick(){}stop(){}drawLog(){}}

test('ocrItems: rough OCR of 「はじめから」 and 「決定」 become buttons; 「続きから」 never',()=>{const R=require('../services/cold-test-run.cjs');
 const items=R.ocrItems([{text:'は し め 力 、 ら',x:318,y:94,w:64,h:11},{text:'続 吉 力 、 ら',x:325,y:144,w:56,h:12},{text:'決 定',x:40,y:440,w:60,h:20},{text:'New Game',x:1,y:1,w:0,h:5}]);
 assert.deepEqual(items.map(i=>[i.text,i.x,i.y]),[['はじめから',318,94],['決定',40,440]]);
 assert.deepEqual(R.ocrItems(null),[]);});

test('driver: a confirm button is clicked once lines stop; never while lines come',()=>{const {Driver}=require('../core/cold-test/drive.cjs');
 const d=new Driver({confirmAfter:1000,advanceEvery:100000,ctrlEvery:100000,stallMs:60000});const ok={role:'button',text:'決定',x:40,y:440,w:60,h:20};
 d.next({t:0,window:{w:1280,h:720}});d.next({t:100,window:{w:1280,h:720},lines:1});
 assert.ok(!d.next({t:500,window:{w:1280,h:720},lines:1,menu:[ok]}).some(a=>a.do==='click'),'too soon');
 assert.deepEqual(d.next({t:1300,window:{w:1280,h:720},lines:1,menu:[ok]}),[{do:'click',x:70,y:450,watch:'confirm'}]);});

test('runOne: switches reach ColdDesk; the hook gets the window owner (Locale Emulator) and the name without .exe',async()=>{const R=require('../services/cold-test-run.cjs');const dir=tmp();
 const h=fakeHelper(emit=>{emit({type:'started',pid:100,started:'1'});emit({type:'window',hwnd:'77',pid:200,started:'2',w:1280,h:720});setTimeout(()=>emit({type:'exited'}),60);});
 const r=await R.runOne({exe:'C:/g/orfre.exe',runDir:path.join(dir,'run'),budgetMs:60000,ignoreInput:true,visible:true,localeEmulator:{path:'C:/le/LEProc.exe',guid:'g-1'}},{spawn:h.spawn,helper:'ColdDesk.exe',Hook:FakeHook,layout:{native:dir},tick:10});
 for(const a of ['--ignore-input','--visible','--locale-emulator','C:/le/LEProc.exe','--le-guid','g-1'])assert.ok(h.args.includes(a),a);
 assert.equal(FakeHook.last.state.gameProcessId,200);assert.equal(FakeHook.last.state.gameStarted,'2');assert.equal(FakeHook.last.state.processName,'orfre');assert.equal(r.launcherPid,100);
 const h2=fakeHelper(emit=>{emit({type:'started',pid:1,started:'1'});emit({type:'window',hwnd:'7',w:10,h:10});setTimeout(()=>emit({type:'exited'}),30);});
 await R.runOne({exe:'C:/g/x.exe',runDir:path.join(dir,'run2'),budgetMs:60000},{spawn:h2.spawn,helper:'ColdDesk.exe',Hook:FakeHook,layout:{native:dir},tick:10});
 assert.ok(!h2.args.some(a=>/^--(ignore-input|visible|locale-emulator)$/.test(a)),'defaults unchanged');});

test('runOne ocrMenu: a full-size picture goes to OCR and its start button is clicked',async()=>{const R=require('../services/cold-test-run.cjs');const dir=tmp();let t=0;
 const h=fakeHelper(emit=>{emit({type:'started',pid:5,started:'1'});emit({type:'window',hwnd:'9',w:1280,h:720});});
 const p=R.runOne({exe:'C:/g/orfre.exe',runDir:path.join(dir,'run'),budgetMs:60000,ocrMenu:true},{spawn:h.spawn,helper:'ColdDesk.exe',Hook:FakeHook,layout:{native:dir},tick:5,now:()=>t+=400,
  ocr:async()=>[{text:'は し め 力 、 ら',x:318,y:94,w:64,h:11}],driver:{introEvery:1e9,introMs:1e9}});
 try{await until(()=>h.sent.includes('click 350 100'));
  assert.ok(h.sent.some(l=>/^shot 1280 .*ocr-1\.png$/.test(l)),'full-width OCR picture');assert.ok(h.sent.includes('click 350 100'),h.sent.join('|'));}
 finally{require('../services/cold-test-run.cjs').stopActive();await p;}});

test('ocrItems: a name entry keeps the default name — 「決定」 one button step left of 「デフォルト」',()=>{const R=require('../services/cold-test-run.cjs');
 const L=[{text:'主 人 公 の 名 前 を 入 力 し て く だ さ い',x:168,y:250,w:350,h:19},{text:'デ フ ォ ノ レ ト',x:294,y:451,w:97,h:17}];
 const [a]=R.ocrItems(L);assert.equal(a.text,'決定');assert.equal(a.estimated,true);assert.equal(Math.round(a.x+a.w/2),149,'twice the label width');
 const [b]=R.ocrItems([...L,{text:'タ イ ト ル , ペ',x:489,y:447,w:94,h:16}]);assert.equal(Math.round(b.x+b.w/2),149,'the step to 「タイトルへ」');
 assert.deepEqual(R.ocrItems([L[1]]),[],'「デフォルト」 alone (a config screen) is not a name entry');
 assert.deepEqual(R.ocrItems([{text:'は い',x:1,y:1,w:9,h:9}]).length,0,'「はい」 alone is never clicked');
 assert.equal(R.ocrItems([{text:'よ ろ し い で す か',x:1,y:1,w:9,h:9},{text:'は い',x:5,y:50,w:20,h:10}])[0].text,'決定');});

test('krkr-model: st.ctl runs with the script\'s st.ctlOff (Cardinal KiriKiri replays)',()=>{const {KrkrModel}=require('../tools/reader-replay/krkr-model.cjs');
 const m=new KrkrModel({pid:4294967290,tmp:tmp()});assert.equal(typeof m.st.ctlOff,'function');assert.deepEqual(m.tick(),{roles:0,embed:0,zh:1},'no control file: off');});

test('budget: the whole game in --budget-min (default 10); --seed-out',()=>{
 const o=A.parseArgs(['node','x','d']);assert.equal(o.budgetMin,10);assert.equal(o.seedOut,'');
 assert.equal(A.parseArgs(['node','x','d','--seed-out','F:\s']).seedOut,'F:\s');});

test('stuckOf: names the step a person has to look at',()=>{const c={verdict:'inconclusive',lines:1};
 assert.equal(A.stuckOf({cold:{...c,lines:20},run:{end:'enough'}}),'');
 assert.match(A.stuckOf({cold:{verdict:'blocked',why:'no-save-place'}}),/没开始：no-save-place/);
 assert.match(A.stuckOf({cold:{...c,lines:0},run:{end:'no-lines'}}),/标题菜单/);
 assert.match(A.stuckOf({cold:{...c,lines:0},run:{end:'no-lines',ocrStart:'はしめから'}}),/开场后没有台词/);
 assert.match(A.stuckOf({cold:c,run:{end:'black',black:true}}),/黑屏/);
 assert.match(A.stuckOf({cold:c,run:{end:'stalled',ocrText:'主人公の名前を入力してください デフォルト'}}),/改名画面/);
 assert.match(A.stuckOf({cold:c,run:{end:'stalled'},diag:{auxNoise:3,auxSample:'DrawText: 私私',selected:'KiriKiri2',kagWait:true}}),/钩子没命中正文.*KiriKiri2.*krkr wait kag/);
 assert.match(A.stuckOf({cold:c,run:{end:'stalled'},engine:{route:'engine-draw',hook:'yuris-draw',hits:0}}),/yuris-draw 画字签名/);});

test('engineHook: KiriKiri takes the krkr route; a signature engine is scanned; others stay on the kernel',()=>{
 assert.equal(A.engineHook({engine:'kirikiri',exe:'nope.exe'}).route,'krkr');
 const y=A.engineHook({engine:'yuris',exe:path.join(tmp(),'none.exe')});assert.equal(y.hook,'yuris-draw');assert.equal(y.hits,0);
 assert.equal(A.engineHook({engine:'renpy',exe:'x'}).route,'kernel');});

test('hookDiagnostics: injected hooks, dropped dialogue, the selected stream, cut to the run',()=>{const root=tmp();fs.mkdirSync(path.join(root,'logs'));
 fs.writeFileSync(path.join(root,'logs','hook-diagnostics.log'),['2026-11-26T06:00:00.0000000Z info 0 注入钩子: KiriKiri1 005240D0','2026-11-26T06:23:43.5970284Z info 0 注入钩子: EmbedKrkr2 005E3389',
  '2026-11-26T06:23:45.0137487Z krkr wait kag','2026-11-26T06:24:10.0151891Z auto-select KiriKiri2 (first dialogue stream of 3)','2026-11-26T06:24:37.2574944Z aux noise tTVPNativeBaseBitmap::DrawText "私私もも"'].join('\n'));
 const d=A.hookDiagnostics(root,{startedAt:'2026-11-26T06:23:43Z',endedAt:'2026-11-26T06:24:56Z'},path.join(root,'cut.log'));
 assert.deepEqual(d,{injected:['EmbedKrkr2'],auxNoise:1,auxSample:'tTVPNativeBaseBitmap::DrawText: 私私もも',kagWait:true,selected:'KiriKiri2',lunaEngine:''});
 assert.equal(fs.readFileSync(path.join(root,'cut.log'),'utf8').split('\n').filter(Boolean).length,4,'only the run\'s lines');});

test('writeSeed: a verified seed entry in The Seed layout, checked by core/profiles/seed.cjs',()=>{const DM=require('../tools/diff-maker/index.cjs');const d=tmp();
 const m=DM.make(path.join(__dirname,'helpers','diff-maker','probes','senren-banka'));const [dir]=DM.write(m,{out:path.join(d,'diff')});
 const seed=A.writeSeed(dir,{engine:m.probe.engine,title:'千恋＊万花',exeName:m.probe.exe.name,exeSha:m.probe.exe.sha256,gameKey:m.key},path.join(d,'seed'));
 const g=JSON.parse(fs.readFileSync(path.join(seed,'game.json'),'utf8'));assert.equal(g.status,'verified');assert.equal(g.seedFormat,1);assert.deepEqual(g.builds,[m.probe.exe.sha256]);
 assert.ok(!g.settings.calibrate,'no local calibration in a seed');assert.ok(fs.existsSync(path.join(seed,'versions',m.probe.exe.sha256+'.json')));
 assert.ok(seed.startsWith(path.join(d,'seed',m.probe.engine)));});

test('driver afterChoice / skip:false: no held Ctrl at reading pace; ends a few lines after the first choice',()=>{const {Driver,VK}=require('../core/cold-test/drive.cjs');
 const d=new Driver({skip:false,afterChoice:2,advanceEvery:1e9,stallMs:1e9});d.next({t:0,window:{w:10,h:10}});
 assert.ok(!d.next({t:10,window:{w:10,h:10},lines:1}).some(a=>a.vk===VK.ctrl),'no Ctrl');
 d.next({t:20,window:{w:10,h:10},lines:3,choices:1});assert.equal(d.next({t:30,window:{w:10,h:10},lines:4,choices:1}).length,0);
 assert.deepEqual(d.next({t:40,window:{w:10,h:10},lines:5,choices:1}),[{do:'end',why:'choice'}]);
 const o=A.parseArgs(['node','x','d']);assert.equal(o.skip,false,'reading pace by default');assert.equal(A.parseArgs(['node','x','d','--skip']).skip,true);});

test('driver slowLines: reading pace, then Ctrl until the first choice, then reading pace for the choice and afterChoice lines',()=>{const {Driver,VK}=require('../core/cold-test/drive.cjs');
 const d=new Driver({skip:false,slowLines:3,afterChoice:2,advanceEvery:1e9,stallMs:1e9,ctrlEvery:1e9,shotLines:[]});const W={w:10,h:10};d.next({t:0,window:W});
 assert.ok(!d.next({t:10,window:W,lines:1}).some(a=>a.vk===VK.ctrl),'slow first');
 const f=d.next({t:20,window:W,lines:3});assert.deepEqual(f,[{do:'phase',name:'fast'},{do:'keydown',vk:VK.ctrl}]);
 const c=d.next({t:30,window:W,lines:40,choices:1});assert.deepEqual(c.slice(0,2),[{do:'keyup',vk:VK.ctrl},{do:'phase',name:'choice'}]);
 assert.ok(!d.next({t:40,window:W,lines:41,choices:1}).some(a=>a.do==='keydown'),'no Ctrl after the choice');
 assert.deepEqual(d.next({t:50,window:W,lines:42,choices:1}),[{do:'end',why:'choice'}]);});

test('choiceItems: OCR rows that are pieces of the hook\'s option text, topmost first; nothing without that text',()=>{const R=require('../services/cold-test-run.cjs');
 const aux='……本当は、お優しい方なのかしら……本当に、几帳面な方なのね';
 const L=[{text:'私 の こ と な ん て 、',x:10,y:500,w:200,h:20},{text:'・ 本 当 に 、 几 帳 面 な 方 な の ね',x:523,y:283,w:268,h:21},{text:'・ ・ ・ 本 当 は 。 お 憂 し い 方 な の か し ら',x:466,y:196,w:349,h:22}];
 const c=R.choiceItems(L,aux);assert.deepEqual(c.map(o=>o.y),[196,283]);assert.equal(c[0].role,'choice');assert.equal(c[0].text,'・・・本当は。お憂しい方なのかしら');
 assert.deepEqual(R.choiceItems(L,''),[]);assert.deepEqual(R.choiceItems([{text:'村 人',x:1,y:1,w:5,h:5}],aux),[]);});

test('runOne: the hook\'s choice aux trace (no timestamp) and OCR rows make a choice the driver answers',async()=>{const R=require('../services/cold-test-run.cjs');const dir=tmp();let t=0;
 const h=fakeHelper(emit=>{emit({type:'started',pid:5,started:'1'});emit({type:'window',hwnd:'9',w:1280,h:720});});
 class Hook{configure(){Hook.traceTap?.('source chars=10 sequence=1');}tick(){}stop(){}drawLog(){}}
 const p=R.runOne({exe:'C:/g/orfre.exe',runDir:path.join(dir,'run'),budgetMs:600000,ocrMenu:true},{spawn:h.spawn,helper:'ColdDesk.exe',Hook,layout:{native:dir},tick:5,now:()=>t+=400,
  ocr:async()=>{Hook.traceTap('choice aux KiriKiri1 role=0 added=[] text="……本当は、お優しい方なのかしら……本当に、几帳面な方なのね"');return [{text:'・ 本 当 は 、 お 優 し い 方 な の か し ら',x:466,y:196,w:349,h:22},{text:'・ 本 当 に 、 几 帳 面 な 方 な の ね',x:523,y:283,w:268,h:21}];},
  driver:{introEvery:1e9,advanceEvery:1e9,stallMs:1e9,shotLines:[]}});

let r;try{await until(()=>h.sent.includes('click 641 207'));}finally{R.stopActive();r=await p;}
 assert.ok(r.choices>=1,'a choice');assert.ok(h.sent.includes('click 641 207'),h.sent.filter(l=>l.startsWith('click')).join('|'));});

test('driver: a choice is answered by Down + Enter after Ctrl is released, then hover + click twice',()=>{const {Driver,VK}=require('../core/cold-test/drive.cjs');
 const d=new Driver({skip:false,slowLines:1,afterChoice:5,advanceEvery:1e9,stallMs:1e9,ctrlEvery:1e9,shotLines:[],choiceSequence:true});const W={w:10,h:10},opt={role:'choice',text:'A',x:400,y:300,w:200,h:40};
 d.next({t:0,window:W});d.next({t:10,window:W,lines:1});
 const seen=a=>JSON.stringify(a);const c=d.next({t:100,window:W,lines:2,choices:1,menu:[opt]});assert.ok(seen(c).includes('"keyup"'));
 assert.deepEqual(d.next({t:1000,window:W,lines:2,choices:1,menu:[opt]}),[],'waits for fast-forward to end');
 assert.deepEqual(d.next({t:1700,window:W,lines:2,choices:1,menu:[opt]}),[{do:'phase',name:'choice-try-1'},{do:'key',vk:VK.down},{do:'key',vk:VK.enter}],'keyboard first');
 assert.deepEqual(d.next({t:2000,window:W,lines:2,choices:1,menu:[opt]}),[]);
 assert.deepEqual(d.next({t:4800,window:W,lines:2,choices:1,menu:[opt]}),[{do:'phase',name:'choice-try-2'},{do:'move',x:500,y:320}]);
 assert.deepEqual(d.next({t:5000,window:W,lines:2,choices:1,menu:[opt]}),[],'hovering');
 assert.deepEqual(d.next({t:5200,window:W,lines:2,choices:1,menu:[opt]}),[{do:'click',x:500,y:320}]);
 assert.deepEqual(d.next({t:5300,window:W,lines:3,choices:1,menu:[opt]}),[{do:'phase',name:'choice-done',try:2}]);});

test('driver readEvery: without Ctrl the game is advanced at reading pace; with Ctrl at advanceEvery',()=>{const {Driver}=require('../core/cold-test/drive.cjs');
 const d=new Driver({skip:false,slowLines:100,readEvery:1500,advanceEvery:450,stallMs:1e9,shotLines:[]});const W={w:10,h:10};d.next({t:0,window:W});d.next({t:10,window:W,lines:1});
 assert.equal(d.next({t:500,window:W,lines:1}).length,0,'not after 450 ms');assert.equal(d.next({t:1600,window:W,lines:1}).length,1,'after 1.5 s');});

test('runOne hideProbe: a selected read-only stream with text gets the hide probe; its hide-only confirmation is kept with its time',async()=>{const R=require('../services/cold-test-run.cjs');const dir=tmp();const probes=[];
 const h=fakeHelper(emit=>{emit({type:'started',pid:5,started:'1'});emit({type:'window',hwnd:'9',w:10,h:10});setTimeout(()=>emit({type:'exited'}),80);});
 class Hook{constructor(l,on){this.on=on;}configure(){this.on({type:'hook',hookThreads:[{id:'a',name:'KiriKiri2',selected:true,sample:'台詞',embeddable:false}]});setTimeout(()=>this.on({type:'hook',hookThreads:[{id:'a',name:'KiriKiri2',selected:true,sample:'台詞',embeddable:true,hideOnly:true}]}),20);}
  probeHide(on){probes.push(on);this.probing=on;}tick(){}stop(){}drawLog(){}}
 const r=await R.runOne({exe:'C:/g/orfre.exe',runDir:path.join(dir,'run'),budgetMs:60000,hideProbe:true},{spawn:h.spawn,helper:'ColdDesk.exe',Hook,layout:{native:dir},tick:10});
 assert.deepEqual(probes,[true]);assert.equal(r.hideConfirmed.length,1);assert.equal(r.hideConfirmed[0].name,'KiriKiri2');
 const h2=fakeHelper(emit=>{emit({type:'started',pid:5,started:'1'});emit({type:'window',hwnd:'9',w:10,h:10});setTimeout(()=>emit({type:'exited'}),40);});probes.length=0;
 await R.runOne({exe:'C:/g/x.exe',runDir:path.join(dir,'run2'),budgetMs:60000},{spawn:h2.spawn,helper:'ColdDesk.exe',Hook,layout:{native:dir},tick:10});assert.deepEqual(probes,[],'off unless asked');});

test('driver readQuietMs: without Ctrl the next click waits for 600 ms without game text and 1 s since the last one',()=>{const {Driver}=require('../core/cold-test/drive.cjs');
 const d=new Driver({skip:false,slowLines:100,readQuietMs:600,readMinMs:1000,stallMs:1e9,shotLines:[]});const W={w:10,h:10};d.next({t:0,window:W});d.next({t:10,window:W,lines:1,quietMs:0});
 assert.equal(d.next({t:2000,window:W,lines:1,quietMs:100}).length,0,'still drawing');
 assert.equal(d.next({t:2100,window:W,lines:1,quietMs:700}).length,1,'quiet: click');
 assert.equal(d.next({t:2600,window:W,lines:1,quietMs:5000}).length,0,'less than 1 s since the last click');
 assert.equal(d.next({t:3200,window:W,lines:1,quietMs:5000}).length,1);});

test('driver choiceQuietMs: the first try waits until fast-forward stopped drawing',()=>{const {Driver,VK}=require('../core/cold-test/drive.cjs');
 const d=new Driver({skip:false,slowLines:1,afterChoice:5,advanceEvery:1e9,stallMs:1e9,ctrlEvery:1e9,shotLines:[],choiceSequence:true,choiceQuietMs:1500});const W={w:10,h:10},opt={role:'choice',text:'A',x:400,y:300,w:200,h:40};
 d.next({t:0,window:W});d.next({t:10,window:W,lines:1});d.next({t:100,window:W,lines:2,choices:1,menu:[opt]});
 assert.deepEqual(d.next({t:3000,window:W,lines:2,choices:1,menu:[opt],quietMs:200}),[],'still drawing');
 assert.deepEqual(d.next({t:4000,window:W,lines:2,choices:1,menu:[opt],quietMs:1600}),[{do:'phase',name:'choice-try-1'},{do:'key',vk:VK.down},{do:'key',vk:VK.enter}]);});

test('run: stage records (core/yui-run.cjs) say where a run stopped',async()=>{const d=tmp();
 const sw=path.join(d,'[GAME]Garden[01009DB022BC6000]');put(path.join(sw,'game.nsp'));const out=path.join(d,'out');
 const r=await A.run({dir:sw,out,budgetMin:1,app:''},{log:()=>{}});const y=require('../core/yui-run.cjs').read(out);
 assert.equal(r.artifacts.yui,path.join(out,'yui-run.log'));assert.equal(y.kind,'megulit-adapter');assert.equal(y.state,'failed');assert.equal(y.failed.stage,'verdict-inconclusive');assert.match(y.failed.reason,/Switch/);
 assert.ok(y.events.some(e=>e.stage==='triage'));});

test('locateAnswer: the options the kernel wants located get the OCR rows that are theirs; GalWindowBridge\'s answer shape',()=>{const R=require('../services/cold-test-run.cjs');
 const a=R.locateAnswer([{text:'・ ・ ・ 本 当 は 。 お 憂 し い 方 な の か し ら',x:466,y:196,w:349,h:22},{text:'・ 本 当 に 、 几 帳 面 な 方 な の ね',x:523,y:283,w:268,h:21}],['……本当は、お優しい方なのかしら','……本当に、几帳面な方なのね'],{w:1280,h:720});
 assert.equal(a.type,'hookChoiceBoxes');assert.equal(a.status,'ok');assert.deepEqual(a.items.map(i=>[i.text,i.x0,i.y0,i.x1,i.y1]),[['……本当は、お優しい方なのかしら',466,196,815,218],['……本当に、几帳面な方なのね',523,283,791,304]]);assert.deepEqual([a.sw,a.sh],[1280,720]);
 assert.equal(R.locateAnswer([{text:'村 人',x:1,y:1,w:5,h:5}],['……本当は、お優しい方なのかしら'],{w:10,h:10}),null);});

test('driver: a start item on screen is still clicked when a system text counted as the first line',()=>{const {Driver}=require('../core/cold-test/drive.cjs');
 const d=new Driver({confirmAfter:1000,advanceEvery:1e9,stallMs:1e9,ctrlEvery:1e9,shotLines:[]});const W={w:10,h:10},start={role:'button',text:'はじめから',x:100,y:200,w:100,h:30};
 d.next({t:0,window:W});d.next({t:10,window:W,lines:1});assert.ok(!d.next({t:500,window:W,lines:1,menu:[start]}).some(a=>a.do==='click'),'too soon');
 assert.deepEqual(d.next({t:1200,window:W,lines:1,menu:[start]}),[{do:'click',x:150,y:215,watch:'start'}]);
 const late=new Driver({confirmAfter:1000,advanceEvery:1e9,stallMs:1e9,ctrlEvery:1e9,shotLines:[]});late.next({t:0,window:W});late.next({t:10,window:W,lines:10});assert.ok(!late.next({t:2000,window:W,lines:10,menu:[start]}).some(a=>a.do==='click'),'not once the story runs');});
test('hook DLL: a DrawSkip build anywhere in the worktrees beats a GDI-hide-only one; this checkout first on a tie; no marker is never used',()=>{const d=tmp();
 const dll=(dir,body,ms)=>{const f=path.join(d,dir,'MeguLitHook32.dll');fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,body);if(ms)fs.utimesSync(f,ms/1000,ms/1000);return path.join(d,dir);};
 const own=dll('own','x MeguLit_GDIHIDE armed version=2 x',Date.now()),other=dll('other','MeguLit_GDIHIDE armed version=2 MeguLit_DRAWSKIP ready addr=',Date.now()-3600e3),foreign=dll('foreign','MeguLit_DRAWSKIP ready addr=');
 const a=A.pickHookDll('MeguLitHook32.dll',[own,foreign,other]);assert.equal(a.src,path.join(other,'MeguLitHook32.dll'));assert.equal(a.drawSkip,true);
 const own2=dll('own2','MeguLit_GDIHIDE armed version=2 MeguLit_DRAWSKIP ready addr= own',Date.now()-7200e3);
 assert.equal(A.pickHookDll('MeguLitHook32.dll',[own2,other]).src,path.join(own2,'MeguLitHook32.dll'),'this checkout (first dir) wins a tie even when older');
 assert.equal(A.pickHookDll('MeguLitHook32.dll',[foreign]),null,'a DLL without the hook version marker is never used');
 const root=path.join(d,'app');const used=A.useCheckoutHook(root,[own,other]);
 assert.equal(used['MeguLitHook32.dll'].drawSkip,true);assert.equal(used['MeguLitHook64.dll'].src,'install');
 for(const sub of [['native','megulithook'],['runtime','megulithook']])assert.match(fs.readFileSync(path.join(root,...sub,'MeguLitHook32.dll'),'utf8'),/MeguLit_DRAWSKIP ready/);
 assert.ok(A.hookDirs().some(x=>/native[\\/]megulithook$/.test(x)),'this checkout and its worktrees are searched');});

test('driver readPerCharMs: a long line that came whole gets 45 ms a character before the next click (Monochrome Empire)',()=>{const {Driver}=require('../core/cold-test/drive.cjs');
 const d=new Driver({skip:false,slowLines:100,readQuietMs:600,readMinMs:1000,readPerCharMs:45,stallMs:1e9,shotLines:[]});const W={w:10,h:10};d.next({t:0,window:W});d.next({t:10,window:W,lines:1,quietMs:0});
 assert.equal(d.next({t:2000,window:W,lines:1,quietMs:1200,lineChars:54,lineAgeMs:1200}).length,0,'54 characters: 2.4 s');
 assert.equal(d.next({t:3300,window:W,lines:1,quietMs:2500,lineChars:54,lineAgeMs:2500}).length,1);
 assert.equal(d.next({t:4400,window:W,lines:2,quietMs:700,lineChars:10,lineAgeMs:700}).length,1,'a short line: readMinMs and the quiet decide');
 const e=new Driver({skip:false,slowLines:100,readQuietMs:600,readMinMs:1000,stallMs:1e9,shotLines:[]});e.next({t:0,window:W});e.next({t:10,window:W,lines:1,quietMs:0});
 assert.equal(e.next({t:2000,window:W,lines:1,quietMs:1200,lineChars:54,lineAgeMs:1200}).length,1,'without readPerCharMs as before');});

test('coldTest: the per-character wait is for engines that hand lines over whole (YU-RIS), not KiriKiri',()=>{const src=fs.readFileSync(path.join(__dirname,'..','tools','megulit-adapter','cold.cjs'),'utf8');
 assert.match(src,/const WHOLE_LINE=new Set\(\['yuris'\]\);/);assert.match(src,/readPerCharMs:WHOLE_LINE\.has\(loc\.engine\)\?45:0/);});

test('stuckOf: a black capture on the visible desktop is the capture, not a hidden-desktop render failure (ISLAND drew its title)',()=>{
 const black={cold:{verdict:'inconclusive',lines:0,end:'black'},run:{end:'black'}};
 assert.match(A.stuckOf({...black,visible:true}),/客户区截图截不到/);assert.match(A.stuckOf(black),/隐藏桌面画不出画面/);});

test('cold test Steam check: a Steam emulator build runs without the Steam client (千恋＊万花 copy: SteamEmu folder, no Valve in steam_api.dll); a real one still needs it',()=>{
 const C=require('../services/cold-test.cjs');const mk=(dll,extra)=>{const d=tmp();fs.writeFileSync(path.join(d,'game.exe'),'MZ');fs.writeFileSync(path.join(d,'steam_api.dll'),dll);if(extra)fs.mkdirSync(path.join(d,extra));return path.join(d,'game.exe');};
 assert.equal(C.steamOf({exe:mk('MZ emu build')}),null,'no Valve name');
 assert.equal(C.steamOf({exe:mk(Buffer.concat([Buffer.from('MZ'),Buffer.from('Valve Corporation','utf16le')]),'SteamEmu')}),null,'SteamEmu folder');
 const real=C.steamOf({exe:mk(Buffer.concat([Buffer.from('MZ'),Buffer.from('Valve Corporation','utf16le')])),steamAppId:'1144400'});assert.equal(real.appid,'1144400','a genuine steam_api still goes through Steam');});

test('ocrItems: a title menu with no start word gets its topmost row (ファタモルガーナの館); a menu that starts with continue or config, or loose text, does not',()=>{
 const R=require('../services/cold-test-run.cjs');const row=(text,y,x=600)=>({text,x,y,w:180,h:30});
 const fata=['館の扉を開く','記を辿る','調整を行う','情報頁','別メニュー'].map((t,i)=>row(t,400+i*50));
 const got=R.ocrItems(fata);assert.equal(got.length,1);assert.equal(got[0].text,'はじめから');assert.equal(got[0].ocr,'館の扉を開く');assert.equal(got[0].guessed,true);
 assert.deepEqual(R.ocrItems([row('続きから',400),row('環境設定',450),row('終了',500)]),[]);
 assert.deepEqual(R.ocrItems([row('システム設定',400),row('おまけ',450),row('終了',500)]),[]);
 assert.deepEqual(R.ocrItems([row('今日はいい天気',400,100),row('だね',400,900)]),[],'not a column');
 assert.equal(R.ocrItems([row('はじめから',400),row('つづきから',450)])[0].ocr,'はじめから','a start word wins as before');});

test('ocrItems / driver: a Chinese title menu starts (千恋＊万花 Steam copy in Simplified Chinese: 新游戏, read by Japanese OCR as *新游双)',()=>{
 const R=require('../services/cold-test-run.cjs');const row=(text,y)=>({text,x:600,y,w:180,h:30});
 assert.equal(R.ocrItems([row('*新游双',400),row('读取存档',450)])[0]?.text,'はじめから');assert.equal(R.ocrItems([row('新游戏',400)])[0]?.text,'はじめから');
 assert.deepEqual(R.ocrItems([row('新游',400)]).filter(i=>!i.guessed),[],'two characters are not enough');});

test('a visible run whose game lay under other windows says so (ISLAND / ファタ / 千恋＊万花 under the bottom guard); a hidden run is unchanged',()=>{
 const st={cold:{verdict:'inconclusive',lines:0,end:'no-lines'},run:{end:'no-lines',covered:5}};
 assert.match(A.stuckOf({...st,visible:true}),/被别的窗口挡住（5 张/);assert.doesNotMatch(A.stuckOf(st),/挡住/);
 const src=fs.readFileSync(path.join(__dirname,'..','native','ColdDesk.cs'),'utf8');assert.match(src,/covered=OnUserDesktop&&!GameOnTop\(w,h\)/);});
