// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 tools/adapt-auto.cjs without a game: arguments, folder triage (Switch / disc image / no exe), exe + engine lookup on a
   temp KiriKiri-shaped folder, the one-run lock, and judge(): the cold self-check + Cardinal scores → pass / fail / inconclusive,
   where anything not measured stays inconclusive. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const A=require('../tools/adapt-auto.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'adapt-auto-'));
const put=(f,size=16)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.alloc(size));};

const COLD={verdict:'pass',why:'',lines:40,measured:['hideVisible','dropRate','repeatRate'],restored:true,near:0.2};
const DIFF={ok:true,mode:'hide',cost:0,over:[]};
const CARD=(scores={},applies={})=>({ok:true,errors:[],result:{lines:40,scores:{row:1,stable:1,clean:1,clear:1,choice:1,pair:1,leak:1,...scores},applies:{row:true,stable:true,clean:true,clear:true,choice:true,pair:true,leak:true,...applies}}});

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
 assert.equal(A.judge({cold:{...COLD,measured:['dropRate']},diff:DIFF,card:CARD()}).verdict,'inconclusive','no hide measurement');
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
 assert.deepEqual(d.next({t:1300,window:{w:1280,h:720},lines:1,menu:[ok]}),[{do:'click',x:70,y:450}]);});

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
 await new Promise(r=>setTimeout(r,400));h.sent.push('');const r=await Promise.race([p,new Promise(r=>setTimeout(()=>r(null),50))]);void r;
 assert.ok(h.sent.some(l=>/^shot 1280 .*ocr-1\.jpg$/.test(l)),'full-width OCR picture');assert.ok(h.sent.includes('click 350 100'),h.sent.join('|'));
 require('../services/cold-test-run.cjs').stopActive();await p;});
