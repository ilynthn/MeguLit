// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 source no-draw for KiriKiri without KAG3 (オルフレール). The hook DLL (native/megulithook/MeguLitDrawSkip.h, self-test
   selftest/drawskip.cpp) hands a switched-on layer DrawText an empty text; HookBridge locks the dialogue contexts behind the no-KAG
   gate and counts what was not drawn (DrawSkipSelfTest, run by native/Build-HookBridge.ps1). Here: the wire between them, the count
   reaching the cold run's run.json and MeguLit-Adapter's result, and the checkout's own hook DLL being the one MeguLit-Adapter runs. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const SRC=read('native/HookBridge.cs'),SKIP=read('native/megulithook/MeguLitDrawSkip.h'),KRKR=read('native/megulithook/KiriKiri.cpp'),HOOK=read('native/megulithook/texthook.cc');

test('hook DLL: the KiriKiri layer DrawText registers, Send runs the skip for a stream that cannot write back, the build copies both',()=>{
 assert.match(KRKR,/if \(NewHook\(hp, "tTVPNativeBaseBitmap::DrawText"\)\)\s*MeguLitDrawSkip::Register\(addr, KrkrDrawSelf, KrkrDrawEmpty\);/);
 assert.match(KRKR,/stack\[9\] = \(uintptr_t\)&KrkrEmptyText;/,'the text argument the hook reads is the one emptied');
 assert.match(HOOK,/if \(!\(hp\.type & EMBED_ABLE\)\)\s*MeguLitDrawSkip::Run\(\(uintptr_t\)address, context, check_embed_able\(tp\)\);/);
 const x86=read('native/megulithook/build-x86.cmd'),x64=read('native/megulithook/build-x64.cmd');
 assert.match(x86,/copy \/y "%~dp0KiriKiri\.cpp" "[^"]*\\engine32\\KiriKiri\.cpp"/);assert.match(x86,/MeguLitDrawSkip\.h/);assert.match(x64,/MeguLitDrawSkip\.h/);
 assert.match(read('native/megulithook/selftest/run.cmd'),/run-drawskip\.cmd/,'the native self-test runs it');});

test('wire: what the DLL logs is what the bridge parses',()=>{
 assert.match(SKIP,/Msg::Log\("MeguLit_DRAWSKIP ready addr=%llx"/);assert.match(SKIP,/Msg::Log\("MeguLit_DRAWSKIP hit n=%ld /);
 assert.match(SRC,/StartsWith\("MeguLit_DRAWSKIP ready",StringComparison\.Ordinal\)\)DrawSkipReady\(s\)/);
 assert.match(SRC,/StartsWith\("MeguLit_DRAWSKIP hit",StringComparison\.Ordinal\)\)DrawSkipHit\(s\)/);
 assert.match(SRC,/if\(!DrawSkipSelfTest\(\)\)throw/,'--self-test covers the parsing, the match and the gate');});

test('bridge: only behind the no-KAG gate, a locked dialogue context is switched on while the original is to be hidden',()=>{
 assert.match(SRC,/static bool DrawSkippable\(Candidate c\)\{[^}]*DrawSkipAddrs\.Contains\(c\.tp\.addr\)[^]*?return KrkrNoKag\(\);\}/);
 assert.match(SRC,/if\(body\)return DrawSkipWant\(true,DrawSkippable\(c\),HookTarget\.ChineseText,ReplacementEnabled,ProbeWanted\);/);
 assert.match(SRC,/locked=DrawBodySeen\(tp\.Key\(\),text\);/,'every no-KAG piece is checked against the dialogue');
 assert.match(SRC,/drawSkipped=item\.Key==Selected\?Interlocked\.Read\(ref DrawSkipped\):0/,'the count is listed on the selected stream');
 assert.match(read('core/hook-native.cjs'),/Number\(t\.drawSkipped\)>0\?\{drawSkipped:Math\.floor\(Number\(t\.drawSkipped\)\)\}:\{\}/,'the kernel keeps the count');});

test('cold run: the largest draw skip count of the selected stream lands in run.json',async()=>{const R=require('../services/cold-test-run.cjs');
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'krkr-nodraw-'));
 const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};
 child.stdin.on('data',b=>{if(String(b).includes('kill'))setImmediate(()=>{child.stdout.end();child.emit('exit',0);});});
 const sel=n=>({hookThreads:[{id:'52c3a7:0:1c',name:'KiriKiri2',selected:true,hideOnly:true,drawSkipped:n},{id:'538f14:0:90',name:'tTVPNativeBaseBitmap::DrawText',selected:false}]});
 class Hook{constructor(layout,emit){this.emit=emit;}configure(){this.emit(sel(12));this.emit(sel(340));this.emit(sel(0));}tick(){}stop(){}}
 setImmediate(()=>{child.stdout.write(JSON.stringify({type:'started',pid:7,started:'1'})+'\n');child.stdout.write(JSON.stringify({type:'window',hwnd:'9',w:10,h:10})+'\n');setTimeout(()=>child.stdout.write(JSON.stringify({type:'exited'})+'\n'),40);});
 const r=await R.runOne({exe:'C:/g/orfre.exe',runDir:path.join(dir,'run'),budgetMs:60000},{spawn:()=>child,helper:'ColdDesk.exe',Hook,layout:{native:dir},tick:10});
 assert.equal(r.drawSkipped,340);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'run','run.json'),'utf8')).drawSkipped,340);
 assert.ok((r.hideConfirmed||[]).some(x=>x.id==='52c3a7:0:1c'),'the hide-only stream is a hide confirmation as before');});

test('MeguLit-Adapter cold stage: the result carries the count, and the checkout\'s marked hook DLL replaces the install copy',()=>{const A=read('tools/megulit-adapter/cold.cjs');
 assert.match(A,/skipped:runInfo\?\.drawSkipped\|\|0/);
 assert.match(A,/buildColdDesk\(root\);buildHookBridge\(root\);useCheckoutHook\(root,hookDirs\(\),app\);/);
 assert.match(A,/const HOOK_MARK='MeguLit_GDIHIDE armed version=2'/);assert.match(A,/if\(buf\.indexOf\(HOOK_MARK\)<0\)return;/,'an unmarked DLL is never used (validation/megulit-adapter-cold.test.cjs: which build wins)');});
