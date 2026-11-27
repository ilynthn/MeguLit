// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 tools/megulit-adapter/live.cjs: the live check's input goes to the game's own window only (ColdDesk.exe "attach <pid>",
   PostMessage), never the real mouse or keyboard; pictures are of one window (services/window-shot.cjs). Several agents run games
   on one desktop at once, and a real click landed on another agent's window. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {attach,VK}=require('../tools/megulit-adapter/live.cjs');

/* a stand-in for ColdDesk.exe attach: it answers every command the way the helper does */
function fakeColdDesk(){const sent=[],args=[];const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();
 const emit=m=>child.stdout.write(JSON.stringify(m)+'\n');
 child.stdin.on('data',b=>{for(const l of String(b).split('\n').filter(Boolean)){sent.push(l);const p=l.split(' ');
  if(p[0]==='kill'){emit({type:'ended',why:'input closed'});continue;}
  if(p[0]==='windows')emit({type:'windows',pid:+p[1],list:[{hwnd:'2439350',cls:'Tauri Window',title:'MeguLit tools',x:0,y:0,w:1920,h:1079}]});
  emit({type:'done',what:p[0]});}});
 setImmediate(()=>emit({type:'window',hwnd:'19150368',pid:4242,w:804,h:604,title:'ファタモルガーナの館'}));
 return {spawn:(exe,a)=>{args.push(exe,...a);return child;},sent,args};}

test('attach: the helper is started on the game pid, clicks and keys go to it as window messages',async()=>{const h=fakeColdDesk();
 const g=await attach(4242,{exe:'ColdDesk.exe',spawnFn:h.spawn});
 assert.deepEqual(h.args,['ColdDesk.exe','attach','4242']);assert.equal(g.window.hwnd,'19150368');
 assert.equal((await g.click(680.4,330.6)).type,'done');assert.equal((await g.key(VK.enter)).type,'done');
 assert.deepEqual(h.sent,['click 680 331','key 13']);
 const wins=await g.windows(72052);assert.equal(wins[0].title,'MeguLit tools');
 g.close();assert.equal(h.sent.at(-1),'kill');});

test('the helper itself never touches the real mouse, the keyboard or the z-order in attach mode',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'..','native','ColdDesk.cs'),'utf8');
 const a=cs.indexOf('static int Attach(');const body=cs.slice(a,cs.indexOf('Emit("{\\"type\\":\\"ended\\",\\"why\\":\\"input closed\\"}")',a));
 assert.ok(a>0,'attach mode exists');
 for(const real of ['SetCursorPos','SendInput','mouse_event','keybd_event','Raise(','SetForegroundWindow','SetWindowPos'])assert.ok(!body.includes(real),real+' in attach mode');
 assert.match(cs,/if\(a\[0\]=="attach"&&a\.Length>1\)return Attach\(a\);/);});

/* toChoice: advance until the MeguLit under test logs a choice, with window messages only */
const {toChoice,choiceSignal}=require('../tools/megulit-adapter/live.cjs');
function fakeGame(script){const sent=[];let log='';const g={sent,
 key:async vk=>{sent.push('key '+vk);log+=script('key',sent.length)||'';return {type:'done'};},
 click:async(x,y)=>{sent.push('click '+x+' '+y);log+=script('click',sent.length)||'';return {type:'done'};},
 shot:async file=>{sent.push('shot '+path.basename(file));return {ok:true};},
 windows:async()=>[{hwnd:'7',title:'MeguLit tools'}],wshot:async(h,file)=>{sent.push('wshot '+h+' '+path.basename(file));return {ok:true};}};
 const fsx={statSync:()=>({size:Buffer.byteLength(log)}),openSync:()=>1,closeSync:()=>{},readSync:(fd,b,o,n,from)=>Buffer.from(log).copy(b,0,from,from+n)};
 return {g,fsx};}
const fast={sleep:async()=>{},stepMs:0,settleMs:0};

test('toChoice stops when the kernel places options or leaves a choice frame line, and shoots the game and the reader',async()=>{
 const {g,fsx}=fakeGame((k,n)=>n<5?'t source chars=12\n':n===5?'t choice frame line left to the choice layer "選択肢……おはよう……"\n':'');
 const r=await toChoice(g,{hookLog:'hook-events.log',fsx,...fast,shotDir:'out',readerPid:42});
 assert.equal(r.steps,5);assert.equal(r.signal.kind,'frame');
 assert.deepEqual(g.sent.slice(-2),['shot choice-game.png','wshot 7 choice-reader.png']);
 assert.equal(choiceSignal('x choice placed [["正直に言う",1,2,3,4]]').kind,'placed');});

test('toChoice: "choice candidates too few" after an ordinary line does not end the advance (ファタモルガーナの館 prologue)',async()=>{
 const {g,fsx}=fakeGame((k,n)=>n===3?'t choice candidates too few n=1\n':'t source chars=9\n');
 const r=await toChoice(g,{hookLog:'h',fsx,...fast,max:10});
 assert.equal(r.signal,null);assert.equal(r.steps,10);});

test('toChoice switches to the next way of advancing when the hook log stops growing (Enter stopped working, clicks did)',async()=>{
 /* Enter reads lines for 3 steps, then nothing; clicks read again and reach the choice */
 let clicks=0;const {g,fsx}=fakeGame((k,n)=>{if(k==='key')return n<=3?'t source chars=9\n':'';clicks++;return clicks===4?'t choice placed [["A",1,1,2,2],["B",1,3,2,4]]\n':'t source chars=9\n';});
 const r=await toChoice(g,{hookLog:'h',fsx,...fast,advance:['enter',{x:400,y:300}],stallSteps:4,max:50});
 assert.equal(r.signal.kind,'placed');assert.equal(r.switched,1);
 assert.deepEqual(g.sent.slice(0,8),['key 13','key 13','key 13','key 13','key 13','key 13','key 13','click 400 300']);});

test('toChoice ends on a known option text given as until',async()=>{
 const {g,fsx}=fakeGame((k,n)=>n===2?'t choice locate round=0 options=["正直に言う誤魔化す"]\n':'');
 const r=await toChoice(g,{hookLog:'h',fsx,...fast,until:/choice locate round=0 options=\["正直に言う/});
 assert.equal(r.signal.kind,'extra');assert.equal(r.steps,2);});

/* node tools/megulit-adapter.cjs choice <game pid> --megulit <root> --out <dir>: the live check's choice step */
const {parseAdvance,parseChoiceArgs,choiceMain}=require('../tools/megulit-adapter/live.cjs');
test('choice: --advance is parsed, and without it Enter comes first, then a click in the middle of the game window',()=>{
 assert.deepEqual(parseAdvance('786,442;enter'),[{x:786,y:442},'enter']);
 assert.deepEqual(parseAdvance('',{w:804,h:604}),['enter',{x:402,y:302}]);
 assert.throws(()=>parseAdvance('middle'),/--advance/);
 assert.throws(()=>parseChoiceArgs(['123','--out','o']),/usage/);});

test('choice: ColdDesk comes from the MeguLit under test, its hook log is watched, choice.json is written, exit 0 with a signal',async()=>{
 const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'live-choice-'));
 try{const root=path.join(tmp,'megulit'),out=path.join(tmp,'out');fs.mkdirSync(path.join(root,'logs'),{recursive:true});
  const hook=path.join(root,'logs','hook-events.log');fs.writeFileSync(hook,'old choice placed [] before the run\n');
  let built='',attached=null;const sent=[];
  const g={window:{w:800,h:600},key:async vk=>{sent.push('key '+vk);fs.appendFileSync(hook,sent.length===3?'t choice placed [["A",1,1,2,2],["B",1,3,2,4]]\n':'t source chars=5\n');return {type:'done'};},
   click:async()=>({type:'done'}),shot:async()=>({ok:true}),windows:async()=>[],wshot:async()=>({ok:true}),close:()=>sent.push('close')};
  const code=await choiceMain(['4242','--megulit',root,'--out',out,'--step-ms','0'],{attachFn:async(pid,o)=>{attached={pid,exe:o.exe};return g;},build:r=>{built=r;return path.join(r,'native','ColdDesk.exe');},log:()=>{}});
  assert.equal(code,0);assert.equal(built,root);assert.deepEqual(attached,{pid:4242,exe:path.join(root,'native','ColdDesk.exe')});
  const r=JSON.parse(fs.readFileSync(path.join(out,'choice.json'),'utf8'));assert.equal(r.signal.kind,'placed');assert.equal(r.steps,3);
  assert.deepEqual(sent,['key 13','key 13','key 13','close']);}
 finally{fs.rmSync(tmp,{recursive:true,force:true});}});

test('choice: without --advance the engine row decides; CatSystem2 advances by keys only (ISLAND ignores posted clicks), KiriKiri falls back to a click',async()=>{
 const Engines=require('../tools/megulit-adapter/engines.cjs');
 assert.deepEqual(Engines.capabilities('catsystem2').live.advance,['enter']);
 assert.deepEqual(parseAdvance(Engines.capabilities('KiriKiri').live.advance,{w:804,h:604}),['enter',{x:402,y:302}]);
 assert.equal(Engines.capabilities('nosuchengine').live,undefined);
 const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'live-choice-'));
 try{const root=path.join(tmp,'m');fs.mkdirSync(path.join(root,'logs'),{recursive:true});const hook=path.join(root,'logs','hook-events.log');fs.writeFileSync(hook,'');
  const sent=[];const g={window:{w:1280,h:720},key:async vk=>{sent.push('key '+vk);return {type:'done'};},click:async(x,y)=>{sent.push('click '+x+' '+y);return {type:'done'};},shot:async()=>({}),windows:async()=>[],wshot:async()=>({}),close:()=>{}};
  await choiceMain(['1','--megulit',root,'--out',path.join(tmp,'o'),'--engine','catsystem2','--max','20','--step-ms','0'],{attachFn:async()=>g,build:()=>'cd.exe',log:()=>{}});
  assert.equal(sent.length,20);assert.ok(sent.every(x=>x==='key 13'),'CatSystem2: no click is ever sent');
  sent.length=0;
  await choiceMain(['1','--megulit',root,'--out',path.join(tmp,'o'),'--engine','kirikiri','--max','20','--step-ms','0'],{attachFn:async()=>g,build:()=>'cd.exe',log:()=>{}});
  assert.ok(sent.includes('click 640 360'),'KiriKiri: a stalled Enter turns into a click in the middle');}
 finally{fs.rmSync(tmp,{recursive:true,force:true});}});
