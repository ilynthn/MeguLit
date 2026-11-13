// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E667 (2026-11-14, user: 为什么不能不适配就替换 — only 7 of 54 library games could hide their text, each through a per-engine
   writable hook). Engine-agnostic fallback: every engine ends in a few drawing paths, so MeguLitFont<bit>.dll (already
   loaded into every bound game for the font probe) leaves the game's own drawing of the current line out there:
   GetGlyphOutlineA/W -> blank glyph with the same metrics, TextOut/ExtTextOut A/W (glyph indices too), GdipDrawString /
   GdipDrawDriverString, ID2D1RenderTarget::DrawText / DrawTextLayout -> not drawn. HookBridge pushes each line of the
   selected stream when that stream cannot write back (the streams the GDI hide probes); the stream becomes hide-only
   only after the DLL reports a hidden draw; a glyph-cache report undoes it and is remembered per game.
   Native self-tests: native/fontprobe/selftest/run-match.cmd (decisions) and run-hide.cmd (DLL, off-screen DIB). */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('decision core is pure (no Windows), generic (no engine or game names) and self-tested',()=>{
 const g=read('native/fontprobe/GlyphMatch.h');
 assert.doesNotMatch(g,/#include <windows\.h>/);
 assert.doesNotMatch(g,/kirikiri|krkr|siglus|bgi|yuris|bruns|unity|renpy|clannad/i,'no engine or game names');
 assert.match(g,/static constexpr uint32_t ArmedFor = 60000/,'a line hides nothing once pushes stop for 60 s');
 assert.match(g,/bool hide = dk && \(pos >= 0 \|\| hidden\.count\(c\)\);/,'glyphs: in-order run of the line AND the dialogue font');
 assert.match(g,/if \(hit && !dk && KnowsKey\(\) && drawn\.size\(\) < 4\)\s*hit = false;/,'short strings in another font stay');
 assert.match(g,/Report\("ToMe_GLYPHHIDE cache seq="/,'glyph cache detected and reported');
 const m=read('native/fontprobe/selftest/match.cpp');
 for(const s of ['same characters in a menu size: never hidden','characters not in the line, dialogue font: never hidden','glyph cache: two lines leaving out already hidden characters -> cache report','no glyph cache: every line rasterised in full -> no cache report'])assert.ok(m.includes(s),s);
 assert.ok(fs.existsSync(path.join(__dirname,'..','native/fontprobe/selftest/run-match.cmd')));});

test('DLL: every covered path asks the matcher only while a line is pushed, and keeps layout',()=>{
 const c=read('native/fontprobe/FontProbe.cpp');
 assert.match(c,/#include "GlyphMatch\.h"/);
 assert.match(c,/L"\\\\\\\\\.\\\\pipe\\\\MeguLitFontCtl-%lu"/,'control pipe per game process');
 assert.match(c,/CloseHandle\(p\); Command\("OFF"\);/,'HookBridge gone: nothing stays hidden');
 for(const fn of ['HExtTextOutW','HExtTextOutA','HTextOutW','HTextOutA'])assert.match(c,new RegExp('BOOL WINAPI '+fn+'\\([^)]*\\) \\{[^\\n]*\\n[^\\n]*\\n if \\(HideOn && s'),fn);
 assert.match(c,/bool hide = HideOn && c && c < 0x10000 && HideGlyph\(/,'GetGlyphOutlineW');
 assert.match(c,/DWORD r = OGetGlyphOutlineW\(dc, c, f, gm, n, b, m\);\s*if \(hide && r != GDI_ERROR && b && n\) BlankGlyph\(f, b, r < n \? r : n\);\s*return r;/,'original call first: metrics and size unchanged, only pixels blanked');
 assert.match(c,/if \(\(o & ETO_OPAQUE\) && r\) OExtTextOutW\(dc, x, y, ETO_OPAQUE/,'opaque background kept');
 assert.match(c,/TA_UPDATECP/,'current position kept');
 assert.match(c,/HideText\(std::wstring\(s, len\), face, "gdip"\)\) return 0;/,'GdipDrawString');
 assert.match(c,/flags & 1/,'GdipDrawDriverString only with characters (CmapLookup)');
 assert.match(c,/vt\[27\], \(void \*\)&HDrawText/);assert.match(c,/vt\[28\], \(void \*\)&HDrawTextLayout/);
 assert.match(c,/vt\[18\], \(void \*\)&HCreateTextLayout/);
 assert.doesNotMatch(c,/kirikiri|krkr|siglus|yuris|bruns|renpy|clannad/i,'no engine or game names');
 const b=read('native/fontprobe/build.cmd');assert.match(b,/MEGULIT_FONT_OUT/,'test builds go to a temp folder');
 const h=read('native/fontprobe/selftest/hidehost.cpp');
 for(const s of ['GetGlyphOutlineW, dialogue font, the line again: every glyph blank','blank glyph keeps its metrics','the same character in the menu size: drawn','GdipDrawString of the line: not drawn','ID2D1RenderTarget::DrawTextLayout of the line: not drawn','after OFF: the line\'s glyph is drawn again'])assert.ok(h.includes(s),s);
 assert.doesNotMatch(h,/CreateWindow/,'self-test never opens a window');});

test('HookBridge: pushes only for a selected stream that cannot write back, with replacement on or while the reader probes (E578)',()=>{
 const b=read('native/HookBridge.cs');
 assert.ok(b.includes('static bool GlyphWanted(){lock(Gate){Candidate c;return !GlyphCached&&Enabled&&(ReplacementEnabled||ProbeWanted)&&Selected!=""&&Candidates.TryGetValue(Selected,out c)&&c.gdiProbe;}}'));
 assert.ok(b.includes('Diagnostic("source id="+tp.Key()+" chars="+text.Length);GlyphLine(text);'),'pushed before the reader gets the line');
 assert.ok(b.includes('static bool GdiProbeable(Candidate c){return c!=null&&!c.embed&&'),'never when an engine-specific embed hook exists');
 assert.ok(b.includes('replacement disabled; reason="+reason+"; selected="+Selected);GlyphOff();'),'switching hiding off stops it at once');
 assert.ok(b.includes('GlyphOff();'),'');
 assert.match(b,/embed-guard disabled writeback "\+c\.name\+" role "\+c\.role\+": "\+reason\);GlyphOff\(\);/,'unsafe report stops it');
 assert.ok(b.includes('else if(line.StartsWith("ToMe_GLYPHHIDE ",StringComparison.Ordinal))GlyphReport(line.Substring(15));'));
 assert.ok(b.includes('c.glyphHide=true;fresh=true;}}GdiHideHit("glyph "+s.Substring(4));'),'hide-only only after a reported hidden draw');
 assert.ok(b.includes('c.glyphHide=false;c.embed=false;c.hideOnly=false;List();'),'glyph cache: back to read-only');
 assert.ok(b.includes('GlyphSave(new Dictionary<string,object>{{"cached",true}'),'glyph cache remembered for the game');
 assert.ok(b.includes('"glyph-hide",Path.GetFileName(GlyphFile)'),'per game, next to the stream memory');});

test('front end: glyph hide status reaches the reader state; a hide-only stream makes MeguLit draw the line',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const h=Object.create(HookNative.prototype);const traces=[],sent=[];
 Object.assign(h,{state:{},trace:s=>traces.push(s),notify(v){this.state={...this.state,...v};}});
 h.glyphHide({type:'hookGlyphHide',state:'key',face:'MS Gothic',size:28});
 assert.deepEqual(h.state.hookGlyphFont,{face:'MS Gothic',size:28});assert.equal(h.state.hookGlyphHide,'learning');
 h.glyphHide({type:'hookGlyphHide',state:'hit',path:'ggo',size:28});assert.equal(h.state.hookGlyphHide,'hit');assert.equal(h.state.hookGlyphPath,'ggo');
 h.glyphHide({type:'hookGlyphHide',state:'cached'});assert.equal(h.state.hookGlyphHide,'cached');
 h.glyphHide({type:'hookGlyphHide',state:'bogus'});assert.equal(h.state.hookGlyphHide,'cached','unknown states ignored');
 assert.ok(traces.some(t=>t==='glyph hide hit ggo 28px'));
 Object.assign(h,{process:{},enabled:true,state:{hookThreads:[{id:'s',name:'AnyEngine',selected:true,embeddable:true,hideOnly:true}]},preferences:{embedTranslation:true},flowPage:false,send:m=>sent.push(m.mode)});
 h.syncEmbedMode();assert.deepEqual(sent,['hide'],'hide-only: MeguLit draws Japanese/translation in place');});
