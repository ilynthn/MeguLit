// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-20 (user, CHAOS;CHILD: 「游戏的一句话经常被 MeguLit 拆成两句」, 「禁止复读」). Replay of the MAGES text stream recorded live
// (new game, opening narration, then Ctrl-skip into the first dialogue scenes; hook-diagnostics aux MAGES_text): besides
// the line just added, the stream sends the page so far again ("…。 発生は、突然だった。"), the page plus the new line,
// and single earlier lines again; one sentence is also typed out over two clicks ("…取り出して、" then "妙な音が響いた。").
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const os=require('node:os'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {PageText,key,tail}=require('../core/page-text.cjs');
const {HookNative}=require('../core/hook-native.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

/* the live stream (text as the hook sent it: strings of one page joined by a space or nothing, speaker tags inline) */
const A='西暦２００９年１１月６日。午後１０時２８分。 ',B='発生は、突然だった。 ',C='Ｍ７．８。最大震度７の局地的直下型大地震。 ',D='この天災は、東京を代表する繁華街の一つである渋谷を一晩で無価値にした。 ';
const E='流行を創り出していた高層建造物はその役目を諦めたように倒壊し、黒い火災は仲間を求めて勢いを広げ続け、混乱した人たちは集団心理から恐怖を扇動され、そしてそれら全てがあらゆる命を奪っていった。 ';
const CHEESE='チーズを切ろうと包丁を取り出して、',SOUND='妙な音が響いた。';
const LIVE=[B,A+B,C,B,C,D,C+D,E];

function hook(){let now=1000;const out=[];const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>out.push(m),()=>{},()=>now);
 h.trace=()=>{};h.send=()=>{};h.state={...h.state,hookActive:true,receivedText:true};
 const feed=(t,dt=1500)=>{now+=dt;h.emitSource(t,'live');};
 const shown=()=>out.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>({text:m.hookSource,continues:m.hookSourceContinues||0}));
 const pages=()=>out.filter(m=>m.type==='hookPage').map(m=>m.same);
 return {feed,shown,pages};}

test('opening narration: every line once, the page drawn again and earlier lines again are not new lines',()=>{
 const {feed,shown}=hook();for(const t of LIVE)feed(t);
 assert.deepEqual(shown().map(s=>key(s.text)),[B,C,D,E].map(key));
});

test('the page plus a new line gives the new line only',()=>{
 const p=new PageText();let now=0;const go=t=>{now+=1000;const r=p.take(t,now);if(!r.drop)p.shown(r.text,r.text,now);return r;};
 go(C);go(D);const r=go(C+D+E);
 assert.equal(key(r.text),key(E));assert.equal(r.page,2);assert.equal(p.pages,true);
 /* skip burst: page lines joined without a space, a speaker tag between */
 const q=new PageText();q.shown('けれど、今は違う。','けれど、今は違う。',1);
 const s=q.take('けれど、今は違う。【大谷】「＠ちゃんにも、たまには本当のことが書かれてるもんだ」',2);
 assert.equal(s.text,'【大谷】「＠ちゃんにも、たまには本当のことが書かれてるもんだ」');
});

test('a sentence typed out over two clicks is one sentence, shown once',()=>{
 const {feed,shown}=hook();feed(CHEESE);feed(SOUND);feed(SOUND,300);feed(CHEESE+SOUND);
 const s=shown();
 assert.deepEqual(s.map(x=>x.text),[CHEESE,CHEESE+SOUND]);
 assert.equal(s[1].continues,CHEESE.length);
});

test('lines that end a sentence or a date are never joined to the next',()=>{
 const {feed,shown}=hook();feed('２０１５年９月７日（日）夜');feed('「はい、ではいつも通り３分くらい募集をかけるんで、適当によろです」');feed('狙い通りだ。');
 assert.deepEqual(shown().map(x=>x.continues),[0,0,0]);
});

test('a short real repeat is still a line (not taken for a redraw)',()=>{
 const current=new PageText();current.shown('「……」','「……」',0);
 assert.equal(current.take('「……」',400).drop,'current line again');
 assert.equal(current.take('「……」',1200).text,'「……」');
 const p=new PageText();p.shown('「……」','「……」',0);p.shown('「何？」','「何？」',1000);
 assert.equal(p.take('「……」',400000).text,'「……」');
});

test('tail keeps the original spacing after the page',()=>{assert.equal(tail('ああああ。 【名】「いい」',5),'【名】「いい」');});

test('reader: game rows break the line and centre it; a continuation keeps its place; backlog grows the open entry',()=>{
 const tp=read('web/reader/modules/text-place.js');
 assert.match(tp,/function gameRows\(boxes, size, map, leftEdge = null\)/);assert.match(tp,/megulit-row-br/);assert.match(tp,/megulit-anchor-center/);
 assert.match(tp,/hookSourceContinues\) > 0\)\) anchorFrom/);
 assert.match(read('web/reader/modules/v4.js'),/b\.hookSourceContinues=Number\(m\.hookSourceContinues\)\|\|0/);
 assert.match(read('web/reader/modules/backlog.js'),/\[、，,\]\$\/\.test\(String\(last\.src\)\.trim\(\)\)&&norm\(text\)\.startsWith\(norm\(last\.src\)\)/);
});

test('page turns: the resend of a page ends it; lines in between stay on one page (reader hookPage same)',()=>{
 let now=1000;const out=[];const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>out.push(m),()=>{},()=>now);
 h.trace=()=>{};h.send=()=>{};h.state={...h.state,hookActive:true,receivedText:true};
 for(const t of [A,B,A+B,C,D,C+D,E]){now+=1500;h.emitSource(t,'live');}
 /* no report before the stream sent a page again (an ADV game never gets one); then the page turns with every resend */
 assert.deepEqual(out.filter(m=>m.type==='hookPage').map(m=>m.same),[false,true,false]);
});

test('an ADV stream (no page ever sent again) gets no page reports',()=>{
 let now=1000;const out=[];const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>out.push(m),()=>{},()=>now);
 h.trace=()=>{};h.send=()=>{};h.state={...h.state,hookActive:true,receivedText:true};
 for(const t of ['「おはよう」','今日はいい天気だ。','「そうだね」']){now+=1500;h.emitSource(t,'live');}
 assert.equal(out.filter(m=>m.type==='hookPage').length,0);
});

test('redrawing a single ADV line never keeps the previous line on screen',()=>{
 const {feed,shown,pages}=hook();
 for(const [text,delay] of [[A,1500],[A,1500],['「何？」',1500],['「何？」',300],[B,1500],[C,1500]])feed(text,delay);
 assert.deepEqual(shown().map(line=>key(line.text)),[A,'「何？」',B,C].map(key));
 assert.deepEqual(pages(),[]);
});

test('a buffered ADV line with one old line as a prefix still shows only the new line',()=>{
 const {feed,shown,pages}=hook();
 for(const text of [A,A+B,C,D])feed(text);
 assert.deepEqual(shown().map(line=>key(line.text)),[A,B,C,D].map(key));
 assert.deepEqual(pages(),[]);
});

test('redrawing the current line or replaying it with the next line still clears a confirmed NVL page',()=>{
 const {feed,shown,pages}=hook();
 const F='朝を迎える準備が整った。',G='新しい一日が始まる。';
 for(const text of [A,B,A+B,C,D,D,E,E+F,G])feed(text);
 assert.deepEqual(shown().map(line=>key(line.text)),[A,B,C,D,E,F,G].map(key));
 assert.deepEqual(pages(),[false,true,false,false,true]);
});

test('redrawing the line before the current one does not clear a confirmed NVL page',()=>{
 const {feed,shown,pages}=hook();
 for(const text of [A,B,A+B,C,D,C,E])feed(text);
 assert.deepEqual(shown().map(line=>key(line.text)),[A,B,C,D,E].map(key));
 assert.deepEqual(pages(),[false,true,true]);
});

test('the recorded NVL page with an unseen earlier line still proves paging',()=>{
 const {feed,shown,pages}=hook();
 for(const text of [B,A+B,C,D])feed(text);
 assert.deepEqual(shown().map(line=>key(line.text)),[B,C,D].map(key));
 assert.deepEqual(pages(),[false,true]);
});

for(const [name,pid,started,sameProcess] of [
 ['a different PID',102,'1234567890123',false],
 ['the same PID with a new start time',101,'1234567890124',false],
 ['a reconnect to the same process',101,'1234567890123',true],
])test(`NVL evidence stays with its process: ${name}`,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-page-'));
 for(const file of ['HookBridge.exe','LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(dir,file),'');
 let now=1000,child,spawns=0;
 const out=[];
 const spawn=()=>{
  const bridge=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stdin:new PassThrough()});
  bridge.stdin.on('finish',()=>{
   bridge.stdout.end();
   if(bridge.exitCode==null){bridge.exitCode=0;bridge.emit('exit',0,null);}
  });
  child=bridge;
  spawns++;
  return bridge;
 };
 const h=new HookNative({native:dir,hook:dir,logs:dir},m=>out.push(m),spawn,()=>now);
 h.trace=()=>{};
 t.after(async()=>{await h.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const bind=(pid,started)=>h.configure({hookAutoStart:true,bindEnabled:true,hookProfile:'read'},
  {gameProcessId:pid,gameStarted:started,gameHwnd:'123',processName:'Game',bound:true});
 const feed=text=>{now+=1500;h.emitSource(text,'live');};
 const pages=()=>out.filter(m=>m.type==='hookPage').map(m=>m.same);

 bind(101,'1234567890123');
 for(const text of [A,B,A+B,C])feed(text);
 h.auxPage({text:B+'\n'+C});
 feed(D);
 assert.deepEqual(pages(),[false,true]);
 assert.equal(h.pageText.cap(now),40);

 if(sameProcess){
  child.stdin.end();
  child.exitCode=1;child.emit('exit',1,null);
  now+=1000;
  h.tick();
 }else{
  bind(pid,started);
  assert.equal(spawns,1);
  await h.stopPending;
  h.tick();
 }
 assert.equal(spawns,2);
 out.length=0;
 const lines=[E,'近所を散歩してくる。','夕方までには帰ろう。'];
 for(const text of lines)feed(text);
 assert.deepEqual(out.filter(m=>m.hookSource).map(m=>key(m.hookSource)),lines.map(key));
 assert.deepEqual(pages(),sameProcess?[true,true,true]:[]);
 assert.equal(h.pageText.cap(now),sameProcess?40:6);
});

test('translation rows follow the Japanese rows: breaks after the punctuation nearest to each row end, never inside a word',()=>{
 const s=read('web/reader/modules/text-place.js');const a=s.indexOf('  const CN_PUNCT');const b=s.indexOf('  b.textPlaceCnSplit');
 const {cnSplit,jpWeight}=new Function(s.slice(a,b)+';return {cnSplit,jpWeight};')();
 const rows=['流行を創り出していた高層建造物はその役目を諦めたように','倒壊し、黒い火災は仲間を求めて勢いを広げ続け、','混乱した人たちは集団心理から恐怖を扇動され、','そしてそれら全てがあらゆる命を奪っていった。'];
 const w=rows.map(r=>[...r].reduce((x,c)=>x+jpWeight(c),0)),tot=w.reduce((x,y)=>x+y);let acc=0;const sh=w.slice(0,-1).map(v=>(acc+=v)/tot);
 const t='曾经引领潮流的高层建筑仿佛放弃了自身使命般倒塌，黑色的火灾不断蔓延势力、仿佛在寻找同伴，陷入混乱的人们在群体心理的煽动下心生恐惧，而这一切夺走了无数生命。';
 const cut=(t,br)=>{const o=[];let p=0;for(const i of [...br,t.length]){o.push(t.slice(p,i));p=i;}return o;};
 assert.deepEqual(cut(t,cnSplit(t,sh)),['曾经引领潮流的高层建筑仿佛放弃了自身使命般倒塌，','黑色的火灾不断蔓延势力、仿佛在寻找同伴，','陷入混乱的人们在群体心理的煽动下心生恐惧，','而这一切夺走了无数生命。']);
 const u='这场天灾在一夜之间将东京代表性繁华街区之一的涩谷变得一文不值。';
 assert.deepEqual(cut(u,cnSplit(u,[.72])),['这场天灾在一夜之间将东京代表性繁华街区之一的','涩谷变得一文不值。']);
 // #1122: never split closing punctuation onto its own line or orphan the last character on a new line
 assert.deepEqual(cut('“等会儿一起去吃午饭吧。”',cnSplit('“等会儿一起去吃午饭吧。”',[.6])),['“等会儿一起去吃午饭吧。”']);
 assert.deepEqual(cut('‘这样真的好吗？’',cnSplit('‘这样真的好吗？’',[.7])),['‘这样真的','好吗？’']);
 assert.deepEqual(cut('今天真是太开心了，嗯。',cnSplit('今天真是太开心了，嗯。',[.75])),['今天真是太开心了，嗯。']);
 assert.deepEqual(cut('其实早就已经决定好了啊。',cnSplit('其实早就已经决定好了啊。',[.8])),['其实早就已经决定好了啊。']);
 // A genuine 2-row sentence with a closing quote still breaks at the middle comma rather than splitting 。”
 assert.deepEqual(cut('“等会儿下课以后，我们一起去吃午饭吧。”',cnSplit('“等会儿下课以后，我们一起去吃午饭吧。”',[.85])),['“等会儿下课以后，','我们一起去吃午饭吧。”']);
});
