// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Text architecture part 1, glyph dots (2026-11-14, docs/text-architecture.md): MeguLit draws every dialogue line itself.
   MeguLitFont<bit>.dll serves, in MODE dot, a dot glyph with the original metrics for every matched dialogue character
   (a 3x3 / 2x2 full-coverage square at the black box top-left) and reports each served dot once per line, so the capture
   compositor can find, erase and replace them. MODE blank (version 2) stays the default and the fallback.
   Native self-tests: native/fontprobe/selftest/run-dots.cmd (x86 + x64, PNG per API, exact dot count and positions). */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('spec: docs/text-architecture.md publishes the dot geometry, records, events and a change log',()=>{
 const d=read('docs/text-architecture.md');
 for(const s of ['## ① Glyph dots','## Changes to this document','| 1    | 2026-11-14 |','ToMe_GLYPHDOT line seq=<n> text=<line>','ToMe_GLYPHDOT dots seq=<n> path=<ggo|text|gdip|d2d|run> list=<dot>;<dot>;...','`<dot>` = `i:u:h:b:a:x:y:s:k:px:py:space`','### Placement (`MODE blank`, spec 3)','ToMe_GLYPHDOT cache seq=<n>','"type":"hookGlyphDots"','{"type":"glyphMode","mode":"dot"}','"all":true','MEGULIT_GLYPH_ALL=1','MEGULIT_GLYPH_MODE=dot','run-dots.cmd'])assert.ok(d.includes(s),s);
 assert.match(d,/\*\*Side\*\* `s` \(spec 2\) = 2 px when the cell height/);});

test('DLL: dot mode keeps metrics, draws one square per character, reports every dot; blank mode unchanged',()=>{
 const c=read('native/fontprobe/FontProbe.cpp');
 assert.match(c,/#define MEGULIT_FONT_VERSION 3/);assert.ok(c.includes('MeguLitFontVersionTag[] = "MeguLitFont version=3"'));
 assert.ok(c.includes('bool report = true, paint = l.rfind("MODE dot", 0) == 0;')&&c.includes('Hide.StopOnCache = !report;'),'MODE command (dot, blank = place, blind variants); every mode reports');
 assert.ok(c.includes('" modes=blank,dot,place records=4"'),'ready answers the modes and the record version');
 assert.ok(c.includes('bool DotsBlocked() { return DotMode && PaintDots && !DotsLive(); }'),'the heartbeat gate is for dots only');
 assert.ok(c.includes('if (win && GetDCOrgEx(dc, &org))')&&c.includes('ScreenToClient(root, &s)')&&c.includes('sprintf_s(w.sp, "m%dx%d"'),'GDI cell origin: window DC to top-level client, memory DC with its size');
 assert.ok(c.includes('PlaceLogical(dc, pen, top - rise)')&&c.includes('PlaceTarget(rt, pen + ox, at.y - asc - oy)')&&c.includes('__uuidof(ID2D1HwndRenderTarget)'),'positions for ExtTextOut (lpDx) and DrawGlyphRun');
 assert.ok(c.includes('int DotSide(int cellHeight) { return cellHeight < 12 ? 2 : (std::max)(3, (cellHeight + 5) / 10); }'),'dot side as in the spec (2)');
 assert.match(c,/if \(!b \|\| !n \|\| \(f & 0x0f\) == GGO_METRICS\) return r;/,'size queries and metrics untouched in dot mode');
 assert.match(c,/BYTE full = kind == GGO_GRAY2_BITMAP \? 4 : kind == GGO_GRAY4_BITMAP \? 16 : 64;/,'full coverage per gray format');
 assert.match(c,/h->dwType = TT_POLYGON_TYPE; h->pfxStart = pt\(x0, y0\);/,'outline: square contour from the black box top-left');
 assert.ok(c.includes('return DotMode ? Dotted(dc, x, y, o, r, text, glyphs, n, dx, sv, seq) : Skipped(dc, x, y, o, r, text, glyphs, n);'),'strings: dots or left out');
 assert.ok(c.includes('if (lf.lfEscapement || lf.lfOrientation || lf.lfFaceName[0] == L\'@\''),'vertical fonts fall back to blank');
 assert.ok(c.includes('run = HookAt(vt[29], (void *)&HDrawGlyphRun, (void **)&ODrawGlyphRun);'),'ID2D1RenderTarget::DrawGlyphRun hooked');
 assert.ok(c.includes('if (paint) Gp.SetSmoothing(g, 3 /* SmoothingModeNone */);'),'GDI+ dots are crisp squares');
 assert.ok(c.includes('l == "MODE dot-blind"'));assert.doesNotMatch(c,/if \(!r && BlindMode/,'font/pipe proof never hides unpushed title or menu text');
 assert.ok(c.includes('rt->SetAntialiasMode(D2D1_ANTIALIAS_MODE_ALIASED);'),'Direct2D dots are crisp squares');
 assert.match(c,/Send\("ToMe_GLYPHDOT line seq=" \+ std::to_string\(seq\) \+ " text=" \+ Utf8\(text\)\)/);
 assert.match(c,/Send\("ToMe_GLYPHDOT dots seq=" \+ std::to_string\(DotSeq\) \+ " path=" \+ DotPath \+ " list=" \+ DotBuf\)/);
 assert.ok(c.includes('sprintf_s(e, "%s%d:%04x:%d:%d:%d:%d:%d:%d:%c:%d:%d:%s"'),'dot record i:u:h:b:a:x:y:s:k:px:py:space');
 assert.ok(c.includes('if (DotSeen.size() < 1024 && DotSeen.insert(key).second)'),'each dot once per line');
 assert.doesNotMatch(c,/kirikiri|krkr|siglus|yuris|bruns|renpy|clannad/i,'no engine or game names');
 const g=read('native/fontprobe/GlyphMatch.h');
 assert.ok(g.includes('Report("ToMe_GLYPHDOT cache seq="'),'dot mode reports a glyph cache and goes on');
 assert.ok(g.includes('inline std::vector<int> Locate('));
 const m=read('native/fontprobe/selftest/match.cpp');
 for(const s of ['dots: per-glyph walk serves index i, kind d','dots: a whole string maps each character to its index in the line','dots: a glyph cache is reported (ToMe_GLYPHDOT cache) and dots go on'])assert.ok(m.includes(s),s);
 const h=read('native/fontprobe/selftest/dothost.cpp');
 for(const s of ['"ggo-gray8"','"ggo-native"','"ggo-bezier"','"ggo-mono"','Dots("textouta-sjis"','Dots("exttextoutw-glyphindex"','Dots("drawtextw"','Dots("gdip-drawstring"','Dots("gdip-drawdriverstring"','Dots("d2d-drawtext"','Dots("d2d-drawtextlayout"','Dots("d2d-drawglyphrun"','dot glyph keeps the original metrics and buffer size','nothing else','every index once','unmatched glyphs under the dialogue font stay real in blind mode','blind: the same text in another size is drawn normally'])assert.ok(h.includes(s),s);
 assert.doesNotMatch(h,/ShowWindow|SW_SHOW/,'self-test never shows a window');assert.ok(h.includes('WS_POPUP, -32000, -32000'),'the placement window stays hidden and off screen');
 for(const s of ['"place textoutw: no ink (blank glyphs)"','"place exttextoutw lpDx: no ink"','"place d2d drawglyphrun: no ink"','"place-blind: unmatched title/menu text keeps its ink"','cells(l, 50 + X0, 30 + Y0, NULL), "c"'])assert.ok(h.includes(s),s);
 assert.ok(c.includes('L"Local\\\\MeguLitCompositorBeat-%lu"')&&c.includes('BeatGrace = 20000, BeatFresh = 1000')&&c.includes('if (DotsBlocked()) return false;')&&c.includes('ToMe_GLYPHDOT status needs-relaunch served='),'heartbeat gate: grace, freshness, real glyphs on lapse, relaunch notice');
 assert.ok(read('native/fontprobe/selftest/dothost.cpp').includes('heartbeat presenting=0: real glyph at once'));
 const l=read('native/fontprobe/Launch.cpp');assert.ok(l.includes('CREATE_SUSPENDED')&&l.includes('MeguLitFontReady-%lu')&&l.includes('ResumeThread(pi.hThread);'),'launcher: suspended start, waits for hooks, always resumes');
 assert.ok(c.includes('GetEnvironmentVariableW(L"MEGULIT_GLYPH_MODE"')&&c.includes('swprintf_s(ready, L"MeguLitFontReady-%lu"'),'DLL: starting mode from the environment, ready event');
 assert.ok(read('native/fontprobe/selftest/run-dots.cmd').includes('earlyhost.exe')||read('native/fontprobe/selftest/run-dots.cmd').includes('early.exe'),'early-injection self-test wired');
 const nb=JSON.parse(read('native/native-builds.json')).find(e=>e.name==='fontprobe');
 assert.ok(nb.selftests.includes('native/fontprobe/selftest/run-dots.cmd'),'run-dots wired into Build.ps1 and CI');assert.equal(nb.marker,'MeguLitFont version=3');assert.ok(nb.outputs.includes('native/MeguLitLaunch32.exe')&&nb.outputs.includes('native/MeguLitLaunch64.exe'));assert.equal(nb.ci,true);});

test('HookBridge: MODE on connect and on change, LunaHook GDI hide off for dot streams, dots forwarded',()=>{
 const b=read('native/HookBridge.cs');
 assert.ok(b.includes('w.WriteLine(GlyphModeLine());')&&b.includes('static string GlyphModeLine(){return GlyphBlind?"MODE "+GlyphMode+"-blind":"MODE "+GlyphMode;}'),'mode sent on every control connection');
 assert.ok(b.includes('static string GlyphMode=GlyphModeName(Environment.GetEnvironmentVariable("MEGULIT_GLYPH_MODE"));'),'blank by default, dot on request');
 assert.ok(b.includes('if(f.Length==12&&f[11]!="-")list.Add(new{')&&b.includes('at=new{x=px,y=py,space=f[11]}'),'cell origin forwarded when known');
 assert.ok(b.includes('static string GlyphModeName(string m){return m=="dot"?"dot":"blank";}'),'blank reports too (place = blank)');
 assert.ok(b.includes('else if(type=="glyphMode"){object mv,av,bv;GlyphAll=d.TryGetValue("all",out av)&&Convert.ToBoolean(av);GlyphBlind=d.TryGetValue("blind",out bv)&&Convert.ToBoolean(bv);GlyphModeSet('));
 assert.ok(b.includes('static bool DotsOwn(Candidate c){return c!=null&&c.gdiProbe&&!GlyphCannotBlank();}')&&b.includes('static bool GlyphCannotBlank(){return GlyphPassLeaked||GlyphCached||GlyphAllFailed||')&&b.includes('public static bool GlyphAllOk(string text){')&&b.includes('&&!SameHookNewContext(cur,rv)&&!EngineDialogueSibling(cur,rv)&&')&&b.includes('static bool EngineDialogueSibling(Candidate cur,Candidate sib){return cur!=null&&sib!=null&&cur.role==1&&sib.role==0&&cur.code!=null&&cur.code==sib.code&&cur.tp.addr==sib.tp.addr;}')&&b.includes('if(!GdiFontSeen){GlyphAllNote("no GDI glyphs seen from this game yet");return false;}')&&b.includes('if(!GlyphAllSelfTest()){Console.Error.WriteLine("FAIL glyph pass-through')/* 1.4.9 regression (SoftPal: nothing hid the original): pass-through only with a proven hide layer */&&b.includes('if(GlyphAll&&Selected!=""&&tp.Key()==Selected&&GlyphAllOk(text)){GlyphLine(text);GlyphDrain(8);try{Luna_EmbedCallback(tp,text,text);}')&&b.includes('lock(Gate){ReceivedText=true;ReplacementCallback=true;}RememberStream();'));
 assert.ok(b.includes('on=(ReplacementEnabled||ProbeWanted)&&(!DotsOwn(c)||YurisGdiOwn(Selected));')&&b.includes('if(key==Selected)return Armed(c)&&(ReplacementEnabled||ProbeWanted&&c.gdiProbe)&&(!DotsOwn(c)||YurisGdiOwn(key));'),'probe never arms the GDI hide in dot mode, except the folded YU-RIS2 TextOutA stream the DLL hides itself (yuris-repeat-fold.test.cjs)');
 assert.ok(b.includes('static bool YurisGdiOwn(string key){Candidate c;return key!=null&&YurisFolded(key)&&Candidates.TryGetValue(key,out c)&&c.name=="YU-RIS2";}'),'that exception is one named stream, only once its repeats were folded');
 const onConnect=b.slice(b.indexOf('static void OnConnect('),b.indexOf('static void OnDisconnect('));
 assert.match(onConnect,/if\(Selected!=""\)MarkEmbedDirty\(Selected\);\s*\}\s*FlushEmbedSync\(\);/,'nor does a reconnect');
 assert.ok(b.includes('else if(line.StartsWith("ToMe_GLYPHDOT ",StringComparison.Ordinal))GlyphDots(line.Substring(14));'));
 assert.ok(b.includes('Emit(new{type="hookGlyphDots",state="dots",seq='));});

test('front end: hookGlyphDots builds the current line table per seq and is re-emitted',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const h=Object.create(HookNative.prototype);const out=[],sent=[];
 Object.assign(h,{state:{},trace(){},emit:m=>out.push(m),send:m=>sent.push(m)});
 h.glyphDots({type:'hookGlyphDots',state:'line',seq:3,text:'吾輩は猫'});
 h.glyphDots({type:'hookGlyphDots',state:'dots',seq:3,path:'ggo',dots:[{i:0,ch:'吾',h:28,b:24,a:28,x:1,y:2,s:3,k:'d'},{i:1,ch:'輩',h:28,b:24,a:28,x:1,y:1,s:3,k:'d'}]});
 h.glyphDots({type:'hookGlyphDots',state:'dots',seq:3,path:'ggo',dots:[{i:1,ch:'輩',h:28,b:24,a:28,x:1,y:1,s:3,k:'d'},{i:2,ch:'は',h:28,b:24,a:28,x:3,y:2,s:3,k:'d'}]});
 assert.equal(h.state.hookGlyphDots.text,'吾輩は猫');assert.deepEqual(h.state.hookGlyphDots.dots.map(d=>d.i),[0,1,2],'merged, no duplicates');
 h.glyphDots({type:'hookGlyphDots',state:'dots',seq:4,path:'text',dots:[{i:0,ch:'次',h:28,b:24,a:28,x:0,y:0,s:3,k:'d'}]});
 assert.equal(h.state.hookGlyphDots.seq,4);assert.deepEqual(h.state.hookGlyphDots.dots.map(d=>d.ch),['次'],'a new seq starts a new table');
 h.glyphDots({type:'hookGlyphDots',state:'cached'});assert.equal(h.state.hookGlyphDots.cached,true);
 h.glyphDots({type:'hookGlyphDots',state:'dots',seq:4,dots:[{i:'x',ch:1,k:'z'}]});assert.equal(h.state.hookGlyphDots.dots.length,1,'malformed dots ignored');
 assert.equal(out.filter(m=>m.type==='hookGlyphDots').length,6,'every event re-emitted');
 h.glyphDots({type:'hookGlyphDots',state:'dots',seq:4,path:'ggo',dots:[{i:-1,ch:'雨',h:28,b:24,a:28,x:0,y:0,s:3,k:'b'},{i:-1,ch:'だ',h:28,b:24,a:28,x:0,y:0,s:3,k:'b'}]});
 h.glyphDots({type:'hookGlyphDots',state:'line',seq:5,text:'今日は雨だ'});
 assert.deepEqual(h.state.hookGlyphDots.dots.filter(d=>d.k==='b').map(d=>[d.i,d.ch]),[[3,'雨'],[4,'だ']],'blind dots of the previous seq mapped to the next line by reading order');
 h.glyphDots({type:'hookGlyphDots',state:'dots',seq:5,path:'text',dots:[{i:0,ch:'今',h:28,b:24,a:28,x:0,y:0,s:0,k:'d',at:{x:120,y:40,space:'c'}},{i:1,ch:'日',h:28,b:24,a:28,x:0,y:0,s:0,k:'d',at:{x:1,y:2,space:'evil'}}]});
 const placed=h.state.hookGlyphDots.dots.filter(d=>d.k==='d');assert.deepEqual(placed.find(d=>d.i===0).at,{x:120,y:40,space:'c'},'cell origin kept');assert.equal(placed.find(d=>d.i===1).at,undefined,'unknown space dropped');
 h.setGlyphMode('dot');h.setGlyphMode('weird');assert.deepEqual(sent,[{type:'glyphMode',mode:'blank'},{type:'glyphMode',mode:'blank'}],'dot glyphs are retired (owner 2026-11-21): always blank');});
