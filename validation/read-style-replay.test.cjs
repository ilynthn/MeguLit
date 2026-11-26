// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Read / unread styles, replayed without a game (validation/helpers/read-style-replay/*.jsonl, one JSON object per row):
     meta    what the recording is (engine, kind synthetic|live, game)
     line    a raw engine record as the game side wrote it (ToMe_KRKR / ToMe_RENPY begin|end ... [color=] [paint=] [text=]),
             parsed like native/HookBridge.cs PageInfo and routed through the real HookNative
     source  the hook text of the sentence
     status  a reader status message (hookSourceRead + hookSourceReadOrigin; with text it also carries that sentence)
     sample  the game's own pixels for the sentence on screen (core/line-pixels.cjs result)
     expect  what the reader paints now: color (#rrggbb / #rrggbbaa, null = no override), edge (null = the saved outline)
     gline / gcolor  a blank-glyph line and the colour of its draw (GDI text colour, brush, or the GPU glyph trace), as HookBridge emits them
     dread   the game's own read flag for a line, carried by its record; a status row with hookSourceRead + origin engine and no text is the same flag as a separate note
     expectPos live recordings: the game's pixel colour of that step (pixel), which the colour handed to the reader must match
     expectNot a colour the reader must not show now
   A live recording is replayed by the same driver. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {HookNative}=require('../core/hook-native.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),dir=path.join(__dirname,'helpers','read-style-replay');
const pageInfo=s=>{const m=/^ToMe_(KRKR|RENPY) (begin|end) line=(\d+) same=([01]) nvl=([01]) x0=(-?\d+) y0=(-?\d+) x1=(-?\d+) y1=(-?\d+) size=(\d+) sw=(\d+) sh=(\d+) n=(\d+)(?: color=([0-9a-f]{6}))?(?: paint=([0-9a-fes:,.\-]{1,120}))?(?: text=(.*))?$/.exec(s);if(!m)return null;
 return {type:'hookEngineLine',engine:m[1].toLowerCase(),phase:m[2],line:+m[3],same:m[4]==='1',nvl:m[5]==='1',x0:+m[6],y0:+m[7],x1:+m[8],y1:+m[9],size:+m[10],sw:+m[11],sh:+m[12],count:+m[13],color:m[14]?'#'+m[14]:null,paint:m[15]||null,text:(m[16]||'').replace(/\x1f/g,'\n')};};
function reader(t,prefs={}){
 t.mock.timers.enable({apis:['setTimeout']});
 const classes=new Set(),vars=new Map(),preferences={textColor:'#fffaf2',readTextColor:'',autoGameStyle:true,...prefs};
 const document={documentElement:{style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)}},head:{append(){}},
  body:{classList:{toggle(c,on){on?classes.add(c):classes.delete(c);},contains:c=>classes.has(c)}},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
 const b={galStatus(){},galPreferences:()=>preferences,galLayoutInfo:()=>({clientWidth:1280,clientHeight:720}),previewGalPosition(){}};
 const window={__tomoyoChinese:b,devicePixelRatio:1,__tomoyoTranslateRequest(){}};
 const ctx={window,document,MutationObserver:class{observe(){}},getComputedStyle:()=>({getPropertyValue:()=>'',fontSize:'28px'}),Date,setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(read('web/reader/modules/game-style.js'),ctx);window.TomoyoGameStyle=ctx.TomoyoGameStyle;
 for(const f of ['island-source','hook-reader','text-position'])vm.runInContext(read('web/reader/modules/'+f+'.js'),ctx);
 let now=100000,lastPos=null;const route=m=>{if(m.type==='hookTextPos'){if(m.color||m.style)lastPos=m;b.textPosition(m);}else if(m.type==='lineStyleSample')b.lineStyleSample(m);else b.galStatus(m);};
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-read-style-log'},route,()=>{},()=>now);hook.trace=()=>{};hook.send=()=>{};t.after(()=>hook.stop());
 const paint=()=>({color:classes.has('tome-line-color')?vars.get('--tomoyo-gal-line-color'):null,edge:classes.has('tome-line-edge')?vars.get('--tomoyo-gal-line-edge'):null});
 return {b,window,classes,paint,
  play(row){
   if(row.t==='line'){const m=pageInfo(row.raw);assert.ok(m,'unparsed engine record: '+row.raw);hook.pageLine(m);}
   else if(row.t==='source'){now+=1000;hook.source({text:row.text,sourceName:'KiriKiriZ',origin:'live'},'');}
   else if(row.t==='status'){const {t:_,text,...m}=row;now+=1000;if(typeof text==='string')route({...m,hookSource:text,hookSequence:Math.round(now/1000)});else route(m);}
   else if(row.t==='dread')b.lineReadDrawn(row.text,row.read); /* ToMe_CHARS read=: the game's own read flag for that line */
   else if(row.t==='drawn')b.lineColorDrawn(row.text,row.color); /* ToMe_CHARS color: the engine side read its own glyphs */
   else if(row.t==='gline'){hook.glyphDots({type:'hookGlyphDots',state:'line',seq:row.seq,text:row.text});hook.glyphColorFlush();} /* blank-glyph line announced (ToMe_GLYPHDOT line) */
   else if(row.t==='gcolor')hook.glyphColor({type:'hookGlyphColor',seq:row.seq,color:row.color,alpha:row.alpha,src:row.src}); /* its draw colour (ToMe_GLYPHDOT color / ToMe_GLYPHCOL) */
   else if(row.t==='sample')route({type:'lineStyleSample',sourceToken:window.TomeIslandSource.token(row.text),style:row.style});
   else if(row.t==='expect'){const p=paint();assert.equal(p.color,row.color,'fill of line '+row.line);assert.equal(p.edge,row.edge,'outline of line '+row.line);if(typeof row.readClass==='boolean')assert.equal(classes.has('tome-line-read'),row.readClass,'read class of line '+row.line);return 1;}
   else if(row.t==='expectPos'){/* live recordings: the colour the reader is given for the sentence equals the game's pixels of that step */
    assert.ok(lastPos,'no draw colour reached the reader for '+row.shot);const h=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),x=h(lastPos.style?.fill||lastPos.color),y=h(row.pixel),d=Math.abs(x[0]-y[0])+Math.abs(x[1]-y[1])+Math.abs(x[2]-y[2]);
    assert.ok(d<=48,row.shot+' '+row.text+': reader '+(lastPos.style?.fill||lastPos.color)+' vs game pixels '+row.pixel);if(lastPos.style)assert.equal(lastPos.style.fill,lastPos.color);return 1;}
   else if(row.t==='expectNot'){assert.notEqual(paint().color,row.color,'line '+row.line+' must not show '+row.color);}
   return 0;}};
}
const fixtures=fs.readdirSync(dir).filter(f=>f.endsWith('.jsonl')).sort();
const rowsOf=f=>read(path.join('validation','helpers','read-style-replay',f)).split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
for(const f of fixtures)test('read-style replay: '+f,t=>{const rows=rowsOf(f),meta=rows[0],r=reader(t,meta.prefs||{});let checked=0;for(const row of rows.slice(1))checked+=r.play(row);assert.ok(checked>=(meta.min||20),'at least '+(meta.min||20)+' sentences are checked ('+checked+')');});
test('the four cases are present: colour switch, no distinction, dimming, flag + pixels',()=>{for(const n of ['colour-read-to-unread','no-distinction','no-evidence','dim-read-to-unread','flag-and-pixels'])assert.ok(fixtures.includes(n+'.jsonl'),n);});
test('furigana and the base text read the same per-line variables',()=>{const css=read('web/reader/modules/gal.js');
 assert.ok(css.includes('.megulit-ruby-base[data-tomoyo-reading]::before { -webkit-text-fill-color:var(--tomoyo-gal-color'));
 assert.ok(css.includes('body.tome-line-edge .sentence-window:not(.tome-island-page) { --tomoyo-jp-stroke-color:var(--tomoyo-gal-line-edge); --tomoyo-ruby-stroke-color:var(--tomoyo-gal-line-edge); --tomoyo-cn-stroke-color:var(--tomoyo-gal-line-edge); }'));});
test('a read sample never paints an unread sentence and the memory ends with the game session',t=>{const r=reader(t);
 r.play({t:'status',hookSourceRead:true,hookSourceReadOrigin:'engine',text:'既読の一行目の文章です。'});r.play({t:'sample',text:'既読の一行目の文章です。',style:{fill:'#b0e2ff',alpha:.5,edge:'#102030',edgeAlpha:1}});
 assert.deepEqual(r.paint(),{color:'#b0e2ff80',edge:'#102030'});
 r.play({t:'status',hookSourceRead:false,hookSourceReadOrigin:'engine',text:'未読の二行目の文章です。'});assert.deepEqual(r.paint(),{color:null,edge:null},'no unread sample yet: the saved colours, not the read one');
 r.play({t:'status',hookSourceRead:true,hookSourceReadOrigin:'engine',text:'既読の三行目の文章です。'});assert.deepEqual(r.paint(),{color:'#b0e2ff80',edge:'#102030'},'same state: last reliable sample');
 r.play({t:'status',hookSourceRead:true,hookSourceReadOrigin:'tome-history',text:'履歴だけが既読と言う文章です。'});assert.equal(r.paint().color,null,'the reader\'s own history is not the game\'s read state');
 r.b.galStatus({type:'gameClosed'});r.play({t:'status',hookSourceRead:true,hookSourceReadOrigin:'engine',text:'次の起動の既読の文章です。'});assert.equal(r.paint().color,null);});
test('paint field: malformed or absent parts are dropped, never guessed',()=>{
 assert.deepEqual(HookNative.paint('f:ffff00ff'),{fill:'#ffff00',alpha:1});assert.equal(HookNative.paint('f:ffff00'),null);assert.equal(HookNative.paint('e:000000ff:2'),null);assert.equal(HookNative.paint('f:ffff00ff,x:1'),null);
 assert.deepEqual(HookNative.paint('f:ffffff80,e:00000000:2'),{fill:'#ffffff',alpha:.502},'an outline at opacity 0 was not drawn');});
/* Per-sentence pixel samples (core/game-style-sync.cjs lineStyle): a stand-in helper answers like native/GameStyleProbe.exe. */
function pixelRig(t){const os=require('node:os'),{PassThrough}=require('node:stream'),{GameStyleSync}=require('../core/game-style-sync.cjs'),islandSource=require('../core/island-source.js');
 const native=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-line-pixels-'));fs.writeFileSync(path.join(native,'GameStyleProbe.exe'),'');t.after(()=>fs.rmSync(native,{recursive:true,force:true}));
 const requests=[],events=[],stdout=new PassThrough();const child={stdin:{write:l=>requests.push(JSON.parse(l)),on(){},end(){}},stdout,on(){},kill(){}};
 const sync=new GameStyleSync({native,config:null},m=>events.push(m),()=>child);sync.lineDelay=0;sync.configure({autoGameStyle:true},{bound:true,gameHwnd:'100',gameProcessId:7,gameStarted:1});t.after(()=>sync.stop());
 const wait=()=>new Promise(r=>setTimeout(r,15)),answer=(id,style)=>{stdout.write(JSON.stringify({id,result:style?{valid:true,style}:{valid:false,reason:'source not found'}})+'\n');return wait();};
 return {sync,requests,events,wait,answer,token:s=>islandSource.token(s),samples:()=>events.filter(m=>m.type==='lineStyleSample')};}
test('pixel sample: each sentence is measured for itself from the game window and never from the reader layer',async t=>{const r=pixelRig(t);
 assert.equal(r.sync.lineStyle('既に読んだ台詞がここに表示されています。'),true);await r.wait();
 assert.equal(r.requests.length,1);assert.equal(r.requests[0].captureMode,undefined,'the game window alone, not the visible screen with MeguLit over it');assert.equal(r.requests[0].source,'既に読んだ台詞がここに表示されています。');
 await r.answer(r.requests[0].id,{textColor:'#FFE080',textEdgeColor:'#101010'});
 assert.deepEqual(r.samples().map(m=>({token:m.sourceToken,style:m.style})),[{token:r.token('既に読んだ台詞がここに表示されています。'),style:{fill:'#ffe080',alpha:1}}],'the fill only: a measured edge may be a drop shadow');
 /* the next sentence starts while the previous answer is still out: the late answer is dropped, the new one is its own */
 r.sync.lineStyle('まだ読んでいない台詞がここに表示されています。');await r.wait();const first=r.requests.at(-1);
 r.sync.lineStyle('さらに次の未読の台詞がここに表示されています。');await r.answer(first.id,{textColor:'#ffffff'});
 assert.equal(r.samples().length,1,'an answer for an earlier sentence never paints the current one');});
test('pixel sample: a sentence the game does not draw gives no sample, and draw-call evidence switches sampling off',async t=>{const r=pixelRig(t);
 r.sync.lineStyle('隠された台詞はゲームの画面にありません。');await r.wait();await r.answer(r.requests[0].id,null);await new Promise(x=>setTimeout(x,950));
 assert.equal(r.requests.length,2,'one more look while the sentence may still be typing');await r.answer(r.requests[1].id,null);await new Promise(x=>setTimeout(x,950));
 assert.equal(r.requests.length,2);assert.equal(r.samples().length,0,'nothing is guessed');
 r.sync.evidence();assert.equal(r.sync.lineStyle('エンジンが描画色を報告している台詞です。'),false);assert.equal(r.sync.lineStyle('履歴から戻った台詞です。',false),false);
 r.sync.lineEvidenceAt=0;r.sync.lineStyle('グラデーションの台詞がここに表示されています。');await r.wait();await r.answer(r.requests.at(-1).id,{textColor:'#ffffff',textGradient:true,textGradientTop:'#ffffff',textGradientBottom:'#88aaff'});
 assert.equal(r.samples().length,0,'a gradient is left to the saved gradient style');});
test('one pixel slot: glyph colours and window samples share it, an early one waits, a late one never replaces the current',t=>{const r=reader(t);
 r.play({t:'status',text:'既に読んだ台詞がここにあります。'});r.b.lineColorDrawn('既に読んだ台詞がここにあります。','#f7f77b');assert.equal(r.paint().color,'#f7f77b','glyph colour from the engine side');
 r.b.lineColorDrawn('次に出てくる未読の台詞です。','#ffffff');assert.equal(r.paint().color,'#f7f77b','the next sentence\'s glyphs do not recolour the current one');
 r.play({t:'status',text:'次に出てくる未読の台詞です。'});assert.equal(r.paint().color,'#ffffff','and are there when its source arrives');
 r.play({t:'sample',text:'既に読んだ台詞がここにあります。',style:{fill:'#f7f77b',alpha:1}});assert.equal(r.paint().color,'#ffffff','a late window sample for the earlier sentence is ignored');
 r.play({t:'status',text:'三つ目の台詞には何も届きません。'});assert.equal(r.paint().color,null,'nothing carried over to a sentence with no evidence');});
/* Evidence while MeguLit hides the dialogue: nothing of the game's text is on screen then, so the colour must come from where
   hiding cannot reach it. */
test('hidden dialogue still has colour evidence: draw arguments, the text layer buffer, the pre-hide computed style',()=>{
 const TP=require('../core/text-paths.cjs'),krkr=read('native/krkrtext/script.inc'),web=read('core/text-paths-web.cjs');
 const line=TP.formatChars({engine:'web',line:3,hidden:true,sw:1280,sh:720,viewport:[0,0,1280,720],rects:[[1,2,3,4]],text:'既読',color:'f7f77b'}),m=TP.parseChars?TP.parseChars(line):null;
 assert.ok(line.includes(' color=f7f77b text='),'the record carries the colour while hidden=1');if(m)assert.equal(m.color,'#f7f77b');
 assert.equal(TP.formatChars({engine:'web',line:3,hidden:true,sw:1,sh:1,rects:[],text:'x',color:'red'}).includes('color='),false,'only a real colour is written');
 /* KiriKiri KAG: the arguments are copied before the opacity is forced to 0 */
 const copy=krkr.indexOf('d.assign(args);st.drawArgs=d;'),force=krkr.indexOf('a[4]=0;a[6]=0;st.hid++;');assert.ok(copy>0&&force>copy,'draw arguments are kept before hiding changes them');
 /* KiriKiri TextRender: hiding is the layer\'s opacity, the sampled pixels are the layer\'s own buffer */
 assert.ok(krkr.includes('T.opacity=0')&&krkr.includes('T.getMainPixel(x,y)'));
 /* web: the hide rule is lifted for one synchronous read and put back */
 const g=web.slice(web.indexOf('function gameColor'));assert.ok(g.indexOf("removeAttribute('data-megulit-hide')")<g.indexOf('getComputedStyle')&&g.indexOf('getComputedStyle')<g.indexOf("setAttribute('data-megulit-hide','')"));});
test('opacity rule: animated opacity is never painted, settled opacity is, the paint field says which',()=>{
 assert.equal(HookNative.paint('f:ffffff32,a:1').animated,true);assert.equal(HookNative.paint('f:ffffff80').animated,undefined);
 const ctx={};vm.createContext(ctx);vm.runInContext(read('web/reader/modules/game-style.js'),ctx);const gs=ctx.TomoyoGameStyle,p={autoGameStyle:true,textColor:'#fffaf2'};
 assert.equal(gs.linePaint(p,'',"",{fill:'#ffffff',alpha:.2,animated:true}).color,'#ffffff');assert.equal(gs.linePaint(p,'','',{fill:'#ffffff',alpha:.5}).color,'#ffffff80');
 const s=read('native/krkrtext/script.inc');assert.ok(s.includes("return op<255?s+',a:1':s;")&&s.includes('this.drawLo==this.drawOp')&&s.includes('r.lo==r.op'),'the engine side settles a sub-opaque opacity only when every draw had it and nothing moved for three ticks');});
test('draw-colour evidence of blank-glyph lines is wired end to end: font DLL, bridge, node',()=>{
 const font=read('native/fontprobe/FontProbe.cpp'),bridge=read('native/HookBridge.cs'),node=read('core/hook-native.cjs');
 for(const call of ['ColorOfDc(seq, dc)','ColorOfGdipBrush(seq, brush)','ColorOfGdipBrush(seq, br)','ColorOfD2DBrush(seq, "d2d", brush)','ColorOfD2DBrush(seq, "run", brush)'])assert.ok(font.includes(call),call);
 assert.ok(font.includes('"ToMe_GLYPHDOT color seq=%ld rgb=%06x a=%02x src=%s"')&&bridge.includes(String.raw`^color seq=(\d{1,9}) rgb=([0-9a-f]{6}) a=([0-9a-f]{2}) src=(\w{1,8})$`));
 assert.ok(node.includes("if(m.type==='hookGlyphColor'){this.glyphColor(m);return;}")&&node.includes("this.glyphDots(m);this.glyphColorFlush();"));});
test('draw-colour evidence of GPU-hidden lines is wired end to end: glyph trace, D3D9 decode, bridge',()=>{
 const trace=read('native/gpuhide/GlyphTrace.h'),gpu=read('native/gpuhide/GpuHide.cpp'),layer=read('native/GpuHideLayer.cs');
 assert.ok(trace.includes('"ToMe_GLYPHCOL line=%u rgb=%06x a=%02x n=%d of=%d"')&&layer.includes(String.raw`^ToMe_GLYPHCOL line=(\d{1,9}) rgb=([0-9a-f]{6}) a=([0-9a-f]{2}) n=(\d{1,4}) of=(\d{1,4})$`));
 assert.ok(gpu.includes('Trace.Write(tex, k.x, k.y, k.w, k.h, k.whole, read, rgb, GetTickCount())')&&gpu.includes('g.col = x.col; g.hasCol = x.hasCol;'));
 /* the tint never searches the written image: a bounded number of texel reads under the glyph's own coverage */
 const tint=trace.slice(trace.indexOf('static uint32_t Tint'),trace.indexOf('template <class R> void Write'));assert.ok(tint.includes('n < 8')&&!/for \(int y/.test(tint));});
test('a screen line reported with its own colour paints that sentence in the single-line reader (CatSystem2 layout)',t=>{const r=reader(t),tok=s=>r.window.TomeIslandSource.token(s);
 const pos=(text,color)=>r.b.textPosition({type:'hookTextPos',engine:'cs2_screen_v2',line:1,token:tok(text),x0:230,y0:160,x1:800,y1:190,size:28,color});
 r.play({t:'status',text:'既に読んだ台詞がここにあります。'});pos('既に読んだ台詞がここにあります。','#b0e2ff');assert.equal(r.paint().color,'#b0e2ff');
 pos('次に出てくる未読の台詞です。','#ffffff');assert.equal(r.paint().color,'#b0e2ff',"the next line's colour waits for its sentence");
 r.play({t:'status',text:'次に出てくる未読の台詞です。'});assert.equal(r.paint().color,'#ffffff');
 r.play({t:'status',text:'色の報告が無い台詞です。'});assert.equal(r.paint().color,null);});
test('the KiriKiri script never calls a bare global inside its state-bound functions (Math reads as void there)',()=>{
 /* live 死に逝く君 2026-11-19: every re-sample threw "(void) から Object へ型を変換できません" at Math.abs; the colour of the first sample stayed, the refinement never ran */
 const code=read('native/krkrtext/script.inc').split(/\r?\n/).filter(l=>!/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.equal(/(^|[^.\w])Math\./.test(code),false,'use plain arithmetic or global.Math');});
test('the engine read flag is wired: bridge note, node status, record field',()=>{
 const bridge=read('native/HookBridge.cs'),node=read('core/hook-native.cjs'),TP=require('../core/text-paths.cjs');
 assert.ok(bridge.includes('line=="ToMe_KRKR read v=0"||line=="ToMe_KRKR read v=1"')&&bridge.includes('type="hookEngineRead"'));
 assert.ok(node.includes("this.emit({hookSourceRead:m.read,hookSourceReadOrigin:'engine'})"));
 const rec=TP.parseChars(TP.formatChars({engine:'krkr',line:3,hidden:true,sw:1280,sh:720,rects:[[1,2,3,4]],text:'あ',color:'#eedefe',read:true}));assert.equal(rec.read,true);assert.equal(rec.color,'#eedefe');
 assert.equal(TP.parseChars('ToMe_CHARS engine=krkr line=3 hidden=1 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=1 rects=1,2,3,4 text=あ').read,undefined,'records without the field are as before');});
test('the KiriKiri script fits the compiler: every raw literal piece and the whole concatenated literal',()=>{
 /* MSVC: one string literal piece holds 16,380 bytes (8,190 UTF-16 units of a wide literal), the concatenated literal 65,535 bytes (32,767 units).
    Over the first the build fails with C2026 and the self-test then passes against the previous DLLs (67d07978). */
 const pieces=[...read('native/krkrtext/script.inc').matchAll(/LR"MGLT\(([\s\S]*?)\)MGLT"/g)].map(m=>m[1].length);
 assert.ok(pieces.length>=5);assert.ok(Math.max(...pieces)<=8190,'largest piece '+Math.max(...pieces)+' units');
 const total=pieces.reduce((a,b)=>a+b,0);
 /* engine-draw 2026-11-21: the pieces are separate literals joined at run time (KrkrText.cpp ScriptParts), so only a piece has a limit */
 const cpp=read('native/krkrtext/KrkrText.cpp');assert.ok(cpp.includes('const wchar_t *const ScriptParts[] = {')&&cpp.includes('for (const wchar_t *p : ScriptParts) ScriptText += p;'),'pieces joined at run time');
 assert.ok(!/\)MGLT" LR"MGLT\(/.test(read('native/krkrtext/script.inc')),'no piece concatenated at compile time');assert.ok(total<200000,'whole script '+total+' units');});
test('an engine-side hidden confirmation keeps the line in the game: the glyph colour has something to read',()=>{const hb=read('native/HookBridge.cs');
 /* live 千恋＊万花 hide mode: lines were written back hidden (no GDI glyph proof), TextRender drew nothing, no colour; 死に逝く君 kept its lines and its colours */
 assert.ok(hb.includes('line.IndexOf(" hidden=1 ",StringComparison.Ordinal)>0)EngineHideProof(label);'),'ToMe_CHARS hidden=1 is the proof');
 const ok=hb.slice(hb.indexOf('public static bool GlyphAllOk(string text){'));assert.ok(ok.indexOf('if(EngineAllOk(text))return true;')>0&&ok.indexOf('if(EngineAllOk(text))return true;')<ok.indexOf('if(GlyphCached)'),'checked before the GDI-only reasons to write back');
 assert.ok(hb.includes('if(want)Interlocked.Increment(ref EngineHideOn);else Interlocked.Decrement(ref EngineHideOn);')&&hb.includes('if(!EngineAllSelfTest())'));});
test('pass-through by engine confirmation can be taken back: unconfirmed lines return to write-back hidden, menus are not on this path',()=>{const hb=read('native/HookBridge.cs'),s=read('native/krkrtext/script.inc');
 assert.ok(hb.includes('if(++EngineUnconfirmed>=ProfileUnconfirmed){EngineHideProven=false;EngineTrialFailed=true;')&&/ProfileUnconfirmed=2/.test(hb),'two unconfirmed lines in a row end it for the run (hide.engineTrial.unconfirmedLines, kernel 2)');
 assert.ok(hb.includes('if(Volatile.Read(ref EngineHideOn)>0&&!SkipHeld&&!EngineSameClick(text,now)){'),'counted only while the engine hide is on and the skip key is up; the texts of one click, their repeats and typewriter steps are one line');
 /* the dialogue-only ownership gate of the engine hide is untouched (4e2bd3f8 / E980): a renderer bound to no layer is the dialogue's only while KAG writes to that message layer */
 assert.ok(s.includes("return typeof inst.textLayer=='undefined' && L===this.kag.current;"));});
/* 2026-11-19 (user: calibrating 千恋＊万花 in hide mode, the screenshots had no game text in the dialogue box; log 05:56:10-05:56:20Z: write-back off,
   engine hide event reset, three sentences rendered by TextRender with lit glyphs, and still nothing on screen). The KiriKiri text layer
   functions are run as they are written in native/krkrtext/script.inc (TJS2 read as JavaScript: void -> undefined, isvalid -> true). */
const trScript=()=>{
 const s=read('native/krkrtext/script.inc'),a=s.indexOf('st.shown=function(L){'),b=s.indexOf('st.trDone=function(inst){');
 assert.ok(a>=0&&b>a);
 const js=s.slice(a,b).replace(/ incontextof st;/g,';').replace(/isvalid (?:this\.trT|c)/g,'true')
  .replace(/typeof ([\w.]+)==['"]Object['"]/g,'typeof $1==="object"')
  .replace(/(fore|ms)\.count/g,'$1.length').replace(/\bvoid\b/g,'undefined').replace(/%\[\]/g,'({})')
  .replace(/\)MGLT",? LR"MGLT\(/g,'').replace(/\bint\(/g,'Math.trunc(');
 return ()=>{
  const T={opacity:255},L={visible:true,textLayer:T},sent=[];
  const st={kag:{current:L,fore:{messages:[L]}},trOwner:L,trRec:[0,100001,' sw=1280 sh=720 text=fixture'],
   trKey:'',on:false,screen:()=>[1280,720],hideOn(){return this.on;},report:l=>sent.push(l)};
  new Function('st',js)(st);
  return {T,L,st,sent,tick:()=>st.trHide()};
 };
};
test('the TextRender control flag gives a blanked Senren line to the clickable reader',()=>{
 const r=trScript()();r.st.on=true;
 r.st.cfg={embed:true};r.tick();assert.equal(r.T.opacity,255,'the old embed setting left the game layer visible');
 r.st.cfg.embed=false;r.tick();assert.equal(r.T.opacity,0);assert.match(r.sent.at(-1),/line=100001 hidden=1/);
});
test('preflight with the engine hide: the text layer is visible again whatever the game did to it while it was hidden',()=>{const rig=trScript();
 {const r=rig();r.st.on=true;r.tick();assert.equal(r.T.opacity,0);r.tick();r.st.on=false;r.tick();assert.equal(r.T.opacity,255,'plain case');assert.deepEqual(r.sent.map(l=>/hidden=(\d)/.exec(l)[1]),['1','0'],'the record follows the state');}
 /* a scene change: the game takes its text window away (opacity 0), MeguLit starts hiding in that moment, the game brings the window back */
 {const r=rig();r.T.opacity=0;r.st.on=true;r.tick();r.T.opacity=255;r.tick();assert.equal(r.T.opacity,0,'still hidden while MeguLit asks');r.tick();
  r.st.on=false;r.tick();assert.equal(r.T.opacity,255,'the original is on screen for the calibration, not left at the 0 that was there when hiding began');}
 /* the game fades its text in while it is hidden */
 {const r=rig();r.T.opacity=0;r.st.on=true;r.tick();for(const v of [64,128,192,255]){r.T.opacity=v;r.tick();assert.equal(r.T.opacity,0);}r.st.on=false;r.tick();assert.equal(r.T.opacity,255);}
 /* a game that keeps its text half transparent gets that value back, and hiding again after the preflight works the same */
 {const r=rig();r.T.opacity=200;for(let i=0;i<3;i++){r.st.on=true;r.tick();assert.equal(r.T.opacity,0);r.st.on=false;r.tick();assert.equal(r.T.opacity,200);}}
 /* a text window the game itself keeps away stays away: MeguLit does not show what the game hid */
 {const r=rig();r.T.opacity=0;r.st.on=true;r.tick();r.tick();r.st.on=false;r.tick();assert.equal(r.T.opacity,0);}});
test('TextRender restores opacity and clears the stale snapshot when ownership changes',()=>{
 const rig=trScript();
 for(const release of [r=>{r.st.kag.fore.messages=[];},r=>{r.L.parent={visible:false};},r=>{r.L.numLinks=1;}]){
  const r=rig();r.st.on=true;r.tick();assert.equal(r.T.opacity,0);
  release(r);r.tick();
  assert.equal(r.T.opacity,255);assert.equal(r.st.trRec,undefined);
  assert.match(r.sent.at(-1),/hidden=0 .* n=0 /);
 }
});
test('every layer that hides the game text gives way in one place, and the pass-through counts clicks',()=>{const hb=read('native/HookBridge.cs');
 const down=hb.slice(hb.indexOf('static string LayersGiveWay(string reason){'),hb.indexOf('public static bool GiveWaySelfTest(){'));
 for(const part of ['ReplacementEnabled=false;','h.Reset();','EnginePassConfirmed=true;','GlyphOff();','Diagnostic("hide layers give way ("+reason+"): "+state);'])assert.ok(down.includes(part),part);
 assert.ok(hb.slice(hb.indexOf('static void GlyphOff(){')).startsWith('static void GlyphOff(){GpuDisarm();'),'the font layer and the GPU layer go down together');
 const de=hb.slice(hb.indexOf('static void Deactivate(string reason){'));assert.ok(de.slice(0,de.indexOf('\n')).includes('LayersGiveWay(reason);'),'the preflight (disable) ends there');
 assert.ok(hb.includes('if(!GiveWaySelfTest()){')&&hb.includes('if(LayersGiveWay("self-test")!="write-back=off engine=off glyph=off gpu=off"||ReplacementEnabled||ev.WaitOne(0))return false;'));
 /* live log: proven 05:55:15.50, taken back 05:55:16.35 by the scene label and the name of the same click */
 assert.ok(hb.includes('if(!EngineAllOk("■自動車（車内／走行）")||!EngineAllOk("【運転手】")||!EngineAllOk("【運転手】")||!EngineAllOk("台詞"+i+"。"))return false;EngineHideProof("self-test");'));
 assert.ok(hb.includes('if((now-EngineBatchAt).TotalMilliseconds<ProfileClickMs){')&&hb.includes('ProfileClickMs=EngineBatchMs;'));});
