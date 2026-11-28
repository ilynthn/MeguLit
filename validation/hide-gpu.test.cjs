// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Hide layer 4, the "fake GPU" (docs/hide-layers.md, owner 2026-11-14: MeguLit draws all game text). MeguLitGpu<bit>.dll
   leaves the glyph quads of the dialogue line out of Direct3D 9 draws and GDI blits, after learning where the line is
   drawn; it never writes game memory, buffers or textures. Native self-test: native/gpuhide/selftest/run.cmd. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('learner is API-independent and its generic match hides only inside the learned area while armed',()=>{
 const g=read('native/gpuhide/GlyphQuads.h');
 assert.doesNotMatch(g+read('native/gpuhide/CmvsBodyStrategy.h'),/#include <windows\.h>|d3d9/i,'no Windows / Direct3D in the decision core or the CMVS strategy');
 assert.doesNotMatch(g,/kirikiri|krkr|siglus|bgi|yuris|bruns|unity|renpy|leaf|clannad|dustmania/i,'no engine or game names');
 assert.match(g,/armedUntil = now \+ 60000/,'a line stays armed 60 s after the last push');
 assert.match(g,/sameAtlas = rtW == areaW && rtH == areaH && LearnedAtlas\(tex\)/,'learned atlas on every target of the learned size (pages drawn twice into a shadow buffer)');
 assert.match(g,/bool LearnedAtlas\(void \*tex\) const \{ return atlases\.count\(GroupKey\(nullptr, tex\)\) > 0;/,'atlas membership is checked by texture');
 assert.match(g,/sheet = freshTex && LineSized\(tw, th\)/,'line-sized glyph sheets: only textures first drawn with this line');
 assert.match(g,/const bool hide = startup \? .* :\s+learned && armed && !readOnly && glyphSize && \(sameAtlas \|\| sheet \|\| redraw\) &&\s+cx >= area\.x0 && cx <= area\.x1 && cy >= area\.y0 && cy <= area\.y1;/,'generic hiding requires an armed match inside the learned area');
 assert.match(g,/bool redraw = \(int\)\(redrawUntil - now\) > 0 && rtW == areaW && rtH == areaH;/,'a page redraw only on a target of the learned size, for RedrawMs');
 assert.match(g,/on >= 1 && on \* 10 >= in \* 6/,'an atlas is learned only when its quads line up with the glyphs (never a UI sheet under the text)');
 assert.match(g,/if \(a\.size\(\) == n\) return &a; if \(b\.size\(\) == n\) return &b;/,'learns only when the glyph count equals the characters');
 assert.match(g,/bool Blanks\(const std::vector<Rect> &r, std::vector<Rect> &keep\) const/,'blank glyphs drawn for spaces are matched and dropped from the rects');
 assert.match(g,/ToMe_CHARS engine=gpu line=/,'reports rectangles in the text-architecture record');});

test('DLL never writes game data: dropped quads are draws not made, buffers are only read',()=>{
 const c=read('native/gpuhide/GpuHide.cpp');
 assert.match(c,/MH_CreateHook/,'functions hooked in place (per-device interface tables on Windows 10/11)');
 assert.match(c,/D3DCREATE_MULTITHREADED : 0/,'multithreaded device classes covered');
 assert.match(c,/SafeCopy\(&s\.data\[p\.off\], p\.ptr, size\)/,'vertex / index data copied into a shadow at Unlock');
 assert.doesNotMatch(c,/memcpy\(p\.ptr|WriteProcessMemory|VirtualProtect/,'nothing written into game buffers or code tables');
 assert.match(c,/CloseHandle\(p\);\s+\{ Guard g; Learner\.Off\(\); Trace\.Off\(\);[\s\S]*?LittlecheeseSetMode\(0\);/,'HookBridge gone: disarm the generic and retained-bitmap paths');
 assert.match(c,/MeguLitGpu version=1/,'version marker');
 assert.match(c,/ib == Buffers\.end\(\) && v\.vbStride && pt == D3DPT_TRIANGLELIST && prims == 2 && nv == 4/,'a 4-vertex quad is decoded without its index buffer (static buffer filled before injection: Danganronpa)');
 assert.match(c,/Hook<94>\(vt\[94\], HSetVSConstF\)/,'vertex-shader constants shadowed for diagnostics (pure devices cannot read them back)');
 const d=read('native/gpuhide/GpuHide11.h');
 assert.match(d,/D3D11CreateDeviceAndSwapChain/);assert.match(d,/c->IAGetInputLayout\(&l\)/,'pipeline state read with the context getters (state set before the DLL arrived)');
 assert.match(d,/L\.uv = \(int\)Ctx\.vbStride - 8/,'input layout made before the DLL arrived is guessed');
 assert.doesNotMatch(read('native/gpuhide/build.cmd'),/d3d11\.lib/,'the DLL never imports d3d11.dll (a D3D9 game must not load it)');
 assert.match(c,/HMODULE d = SystemModule\(L"d3d9\.dll"\)/,'throwaway devices only through the system d3d9.dll (WHITE ALBUM2 ships a wrapper d3d9.dll; using it crashed the game)');
 assert.match(c,/DeclInfo ParseDecl\(IDirect3DVertexDeclaration9 \*x\)/,'vertex declarations decoded (MAGES atlas draws)');
 const gl=read('native/gpuhide/GpuHideGL.h');
 assert.match(gl,/#define glGetIntegerv pglGetIntegerv/,'OpenGL is never imported (a Direct3D game must not load opengl32.dll)');
 assert.match(gl,/static void GlResolve\(\)/,'driver buffer functions resolved in the render thread');
 assert.match(gl,/s\.find\("pos"\)/,'program attributes found by name');});

test('HookBridge loads the layer, arms it for glyph-fallback streams and treats a hit like the GDI hide',()=>{
 const b=read('native/HookBridge.cs'),l=read('native/GpuHideLayer.cs'),i=read('native/HookInjector.cs'),s=read('native/Build-HookBridge.ps1');
 assert.match(b,/public static partial class HookBridge/);
 assert.match(b,/GpuHide\(bit,loader,args\);/);
 /* while the skip key is held no line arms the layer (the game shows its own fast-forward); otherwise the line goes to GpuLine */
 assert.match(b,/static void GlyphLine\(string text\)\{FlushFit\(\);[^\n]*?if\(HookTarget\.ChineseText\)\{GlyphOff\(\);return;\}if\(SkipHeld\)\{GlyphOff\(\);return;\}(\/\*[^*]*\*\/[^\n]*?GlyphOff\(\);return;\})?GpuLine\(text\);/);
 assert.match(b,/static void GlyphOff\(\)\{GpuDisarm\(\);/);
 assert.match(s,/'GpuHideLayer\.cs'/);
 assert.match(i,/"MeguLitGpu64\.dll"/);assert.match(i,/"MeguLitGpu32\.dll"/);
 for(const m of ['GpuCapabilities()','GpuArm(string streamId,string line)','GpuDisarm()','GpuReadOnly(bool on)','event Action<string,int,int,int> GpuHit'])assert.ok(l.includes(m),'orchestrator interface: '+m);
 assert.match(l,/GdiHideHit\("gpu "/,'hide-only only after a confirmed hit');
 assert.match(l,/type="hookChars",line=s/,'ToMe_CHARS passed on like the engine paths');
 assert.match(l,/if\(!GpuCanaryArm\(\)\)return;/,'crash canary checked before the DLL is loaded');
 assert.match(l,/if\(GpuCanaryCrash\(code\)\)\{e\["off"\]=true;/,'an exception exit (not a forced kill, 0xFFFFFFFF) turns layer 4 off for that game');
 assert.match(l,/public static void GpuCanaryReset\(\)/,'turning it on again is the user\'s call');
 assert.match(b,/if\(!GpuCanarySelfTest\(\)\)\{Console\.Error\.WriteLine\("FAIL gpu hide crash canary"\);return 3;\}/,'canary file logic runs in HookBridge --self-test (arm, crash 0xC0000005 refuses, reset)');});

test('built, self-tested and shipped like every native binary',()=>{
 const nb=JSON.parse(read('native/native-builds.json')).find(e=>e.name==='gpuhide');
 assert.ok(nb,'native-builds.json entry');assert.deepStrictEqual(nb.outputs,['native/MeguLitGpu32.dll','native/MeguLitGpu64.dll']);
 assert.equal(nb.marker,'MeguLitGpu version=1');assert.equal(nb.ci,true);assert.deepStrictEqual(nb.selftests,['native/gpuhide/selftest/run.cmd']);
 const r=read('Release.ps1');assert.match(r,/'native\/MeguLitGpu32\.dll','native\/MeguLitGpu64\.dll'/);assert.match(r,/'native\/MeguLitGpu64\.dll','MeguLitGpu version=1'/);
 const h=read('native/gpuhide/selftest/host.cpp');
 for(const m of ['d3d9-up','d3d9-vb','d3d9-ivb','d3d9-decl','d3d11','gl','gl-ff','gdi'])assert.ok(read('native/gpuhide/selftest/run.cmd').includes(m),'self-test mode '+m);
 assert.match(h,/dialogue glyphs %s \(%d\/8 white\), name kept \(%d\/3\), scene and box frame kept/,'pixels: line gone, name and scene kept');
 assert.ok(read('docs/hide-layers.md').includes('GpuArm(string streamId, string line)'),'interface documented');});

test('text marks: the game draws a row of 「・」, same count, codes kept, canary-gated',()=>{
 const p=read('native/EmbedTextPolicy.cs'),h=read('native/HookBridge.cs'),l=read('native/GpuHideLayer.cs'),m=read('native/megulithook/MeguLitMarks.h'),y=read('native/megulithook/Yuris.cpp'),t=read('native/megulithook/texthook.cc');
 assert.match(p,/public static string Mark\(string value\) \{ Marking = true; try \{ return Hide\(value\); \}/,'Mark = Hide rules with marks instead of blanks');
 assert.match(p,/\? "\\uFF65" : "\\u30FB"/,'half-width 「･」, full-width 「・」');
 assert.match(h,/EmbedTextPolicy\.Mark\("今日はいい天気だね。\\n明日もABC？"\);if\(mk!="・・・・・・・・・・\\n・・・･･･・"/,'self-test: count and line breaks kept');
 assert.match(l,/if\(on&&GpuCanaryOff\(\)!=""\)/,'refused for a game the crash canary turned off');
 assert.match(l,/code>=0xC0000000u&&code<=0xC0FFFFFFu/,'a forced kill (0xFFFFFFFF) is not a crash');
 assert.match(m,/\(hp\.type & \(DATA_INDIRECT \| USING_STRING \| EMBED_ABLE\)\) \|\| hp\.text_fun/,'per-character argument hooks only');
 assert.match(m,/if \(c < 0x80 \|\| c == 0x3000/,'ASCII codes and blanks untouched');
 assert.match(t,/MeguLitMarks::Mark\(hp, plpdatain\)/,'wired after the GDI hide feed, only for the selected stream');
 assert.match(y,/text = BlankInPlace\(src, n, hp->codepage, marks\);/,'YU-RIS lines with codes are marked in place from the raw bytes');
 assert.match(y,/out\.append\("\\x81\\x45"\)/,'cp932 「・」');
 assert.match(l,/OpenExisting\("Local\\\\MeguLitCompositorBeat-"\+Pid/,'host reads the compositor heartbeat');
 assert.match(h,/MarksMode&&MarksLive\(\)\?EmbedTextPolicy\.Mark\(text\):EmbedTextPolicy\.Hide\(text\)/,'write-back marks only while the compositor presents; plain hide otherwise');
 assert.match(l,/presenting==1&&tick!=0&&now>=tick&&now-tick<=1000;else live=now-\(ulong\)MarksSince<=20000/,'fresh beat (1 s) or 20 s grace before the first beat');
 assert.match(m,/L"Local\\\\MeguLitCompositorBeat-%lu"/,'hook DLL reads the heartbeat too');
 assert.match(m,/if \(WaitForSingleObject\(Event, 0\) != WAIT_OBJECT_0\)\s+return false;\s+return BeatLive\(\);/,'per-character marks gated by the heartbeat');
 assert.match(m,/MeguLit_MARKS off compositor heartbeat stale/,'lapse reported');
 assert.ok(fs.existsSync(path.join(root,'docs/text-architecture-marks.md')),'mark shape documented for the compositor');});
