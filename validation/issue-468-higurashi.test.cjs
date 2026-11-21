'use strict';
/* #468 ひぐらしのなく頃に解 (Unity, whole-page NVL, TextController.SetText): the hooked text always wins, every piece reaches the
   reader once and fast, and an OCR reading of the page the hook already gave is never a line (「最高潮」 read as 「最咼潮」).
   higurashi.jsonl: live HookBridge recording (ひぐらし 奉, same TextController). higurashi-ocr.jsonl: its first page plus what the
   art scan reads from that page 6 s later (two OCR glyph errors) and a picture card nothing hooked carries. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {replay}=require('./helpers/hook-replay.cjs'),{latency}=require('./helpers/unity-replay/latency.cjs'),{HookNative}=require('../core/hook-native.cjs');
const dir=path.join(__dirname,'helpers','unity-replay'),EXE='HigurashiEp01.exe';
const shown=r=>{const out=[];for(const e of r.events)if(e&&typeof e.hookSource==='string'&&e.hookSource&&e.hookSource!==out[out.length-1]?.text)out.push({text:e.hookSource,engine:e.hookSourceEngine});return out;};

test('comma pieces are never lost: each joins the rest of its sentence',()=>{
 const out=shown(replay(path.join(dir,'higurashi.jsonl'),{name:EXE})).map(l=>l.text);
 for(const s of ['どうせ引き裂かれるなら、身を引き裂かされる方がはるかにマシだと思った。','自分に言い聞かせるような、そんな涙声が…もうたまらなく馬鹿馬鹿しくて…。','なのに、…彼女のそれはまだ聞こえる気がする。','彼女に、俺のために流す涙がないのなら、俺にだって。'])
  assert.ok(out.includes(s),'missing '+s);
 /* a line once: no full line is shown twice */
 const full=out.filter(l=>/[。？！…]$/.test(l));assert.equal(new Set(full).size,full.length,'repeated line');
});

test('latency: every hooked piece is on the reader within 400 ms (skip bursts aside)',()=>{
 const o=latency(path.join(dir,'higurashi.jsonl'),EXE);
 const lost=o.filter(x=>x.ms==null).map(x=>x.text);
 assert.deepEqual(lost,['それなのに…痛み、目を潤ませてしまうのは…どうして？'],'only the line inside a 1 ms skip burst is passed over');
 for(const x of o)if(x.ms!=null)assert.ok(x.ms<=400,x.text+' '+x.ms+' ms');
});

test('an OCR reading of the hooked page never becomes a line; a picture card still does',()=>{
 const r=replay(path.join(dir,'higurashi-ocr.jsonl'),{name:EXE});
 const ocr=r.traces.filter(t=>/^ocr line "/.test(t));
 assert.ok(!ocr.some(t=>/浄かに|験がしい/.test(t)),'OCR page taken: '+ocr.join(' | '));
 assert.ok(r.traces.some(t=>/ocr line refused \(text the hook already gave\)/.test(t)),'refusal traced');
 assert.ok(ocr.some(t=>t.includes('昭和五十八年')),'picture card read');
});

test('hookOverlap tolerates OCR glyph errors and ignores unrelated text',()=>{
 const now=1e6,recent=[{key:'その瞬間が最高潮だった。',at:now-1000}];
 assert.ok(HookNative.hookOverlap('その瞬間が最咼潮だった。',recent,now)>=0.5);
 assert.ok(HookNative.hookOverlap('昭和五十八年、初夏',recent,now)<0.5);
 assert.equal(HookNative.hookOverlap('その瞬間が最咼潮だった。',[{key:'その瞬間が最高潮だった。',at:now-700000}],now),0,'older than ten minutes');
});

test('a game read by OCR at runtime is a probe problem even when the static probe said ok',()=>{
 const fs=require('node:fs'),os=require('node:os'),probe=require('../services/adapter-probe.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'m468-'));
 try{
  fs.mkdirSync(path.join(root,'data','adapter-probe'),{recursive:true});
  fs.writeFileSync(probe.fileOf(root),JSON.stringify({version:1,results:{g1:{step:'ok',title:'ひぐらし'},g2:{step:'ok',title:'other'}}}));
  assert.deepEqual(probe.problems(root),[]);
  assert.equal(probe.markRuntime(root,'g1','ocr-fallback','reader lines came from OCR'),true);
  assert.equal(probe.markRuntime(root,'g1','ocr-fallback'),false,'once');
  assert.deepEqual(probe.problems(root).map(p=>[p.id,p.step]),[['g1','ocr-fallback']]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a bridge that keeps failing on the same game process is given up on with a clear state; a new process starts over',()=>{
 /* live5.raw.jsonl (rig, 2026-11-20): after the first bridge was killed every new one ended with 「LunaHook 未连接当前游戏」, exit 1, for 20 minutes */
 const {EventEmitter}=require('node:events'),fs=require('node:fs'),os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m468b-'));for(const n of ['HookBridge.exe'])fs.writeFileSync(path.join(dir,n),'');const hook=path.join(dir,'hook');fs.mkdirSync(hook);for(const n of ['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(hook,n),'');
 let now=1e6,spawns=0;const events=[];
 const fake=()=>{spawns++;const c=new EventEmitter();const {PassThrough}=require('node:stream');c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{};c.pid=1;setImmediate(()=>c.emit('exit',1));return c;};
 const h=new HookNative({native:dir,hook,logs:dir},m=>events.push(m),fake,()=>now);clearInterval(h.timer);h.trace=()=>{};
 const prefs={hookAutoStart:true,bindEnabled:true,hookProfile:'embed',maskMode:'hook'};
 const run=async(pid,rounds)=>{for(let i=0;i<rounds;i++){h.configure(prefs,{gameProcessId:pid,gameHwnd:'123',processName:'Game',gameStarted:'63930742521'+pid,bound:true});await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));now+=60000;h.tick();}};
 return (async()=>{
  try{
   h.spawn=fake;/* process.kill(pid,0) is only checked for the real spawn */
   await run(process.pid,20);
   assert.equal(spawns,6,'six tries, then no more');
   assert.ok(events.some(e=>e.hookGaveUp===true&&/已停止重连/.test(e.hookMessage||'')),'clear state');
   await run(process.ppid||process.pid+1,2);
   assert.ok(spawns>6,'a new game process is tried again');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 })();
});

test('NVL page: another stream holding the page makes the lines stack, a turned page resets, a line once',()=>{
 /* higurashi-page.jsonl: the recorded TextController lines, each followed 40 ms later by the page as TMP holds it
    (hookPageText, the shape seen live: lines with <#FFFFFFxx> fade tags, blank padding); the page turns before 「でも…薄々は気付いてる。」 */
 const r=replay(path.join(dir,'higurashi-page.jsonl'),{name:EXE});
 const pages=r.events.filter(e=>e&&e.type==='hookPage');
 assert.equal(pages.filter(p=>p.same===true&&!p.reset).length,6,'every line after the first of each page joins it, from the first page on: '+JSON.stringify(pages));
 const reset=pages.findIndex(p=>p.reset===true);assert.ok(reset>0,'the turned page is reported');
 const srcs=shown(r).map(l=>l.text);
 const turnAt=r.events.indexOf(pages[reset]),before=r.events.slice(0,turnAt).filter(e=>typeof e?.hookSource==='string'&&e.hookSource).map(e=>e.hookSource);
 assert.equal(before.at(-1),'でも…薄々は気付いてる。','reset follows the first line of the new page');
 assert.equal(pages.filter(p=>p.reset).length,1,'one reset per turn');
 const full=srcs.filter(l=>/[。…]$/.test(l));assert.equal(new Set(full).size,full.length,'no line twice');
 const fs=require('node:fs');const reader=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','hook-reader.js'),'utf8');
 assert.match(reader,/b\.hookPage=m=>\{[^]*?if\(m&&m\.reset===true\)\{b\.hookPageReset\(\);return;\}/,'the reader clears its page on the reset');
});

test('font size: the home-page value (text-defaults) wins over a stale live-session size when the work has no saved settings',()=>{
 /* rig 2026-11-20: Alt+T 29 (live session, gal-preferences.json) then the home settings page 34 (text-defaults.json); the
    next bind must show 34, the value set last. A work's own saved Alt+T settings still win over the preset (E215). */
 const fs=require('node:fs'),os=require('node:os'),{Settings}=require('../services/settings.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'m468s-'));
 try{
  const cfg=path.join(root,'data','config');fs.mkdirSync(cfg,{recursive:true});
  fs.writeFileSync(path.join(cfg,'gal-preferences.json'),JSON.stringify({translationSize:29,japaneseSize:30}));
  const s=new Settings(root);s.save({scope:'text',values:{translationSize:34}});
  assert.equal(s.read('text').translationSize,34);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
