// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 ハミダシクリエイティブ（常轨脱离Creative, Artemis, D3D9 + FreeType）: the original stayed on screen. The line is rasterised on
   the CPU, so GDI / GPU glyph hides saw nothing; the Artemis2 hook was read-only (the writable EmbedArtemis pattern is not in this
   build). With Artemis2 made writable (native/megulithook/Artemis.cpp) the hook turned out to be the layout call, one glyph or one
   ruby base per call: Hide's label rule passed every kanji / katakana piece back and only the hiragana went blank (half the line
   visible). The Artemis engine diff now names Artemis2 in source.embedGlyphPieces, the kernel hands it to HookBridge, and HookBridge
   blanks every short piece of such a stream (GlyphPieceSelfTest in HookBridge --self-test checks the replies). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../core/profiles/index.cjs'),{HookNative}=require('../core/hook-native.cjs');
const bp=p=>HookNative.prototype.bridgeProfile.call({profile:p});

test('an Artemis game hands Artemis2 to HookBridge as a glyph-piece stream',()=>{
 const p=P.profileFor({engine:'artemis',exe:'D:/games/hamidashi/hamidashi.exe',title:'ハミダシクリエイティブ'});
 assert.deepEqual(p.source.embedGlyphPieces,['^Artemis2$']);assert.deepEqual(bp(p).embedGlyphPieces,['^Artemis2$']);
 const pieces=p.source.embedGlyphPieces.map(s=>new RegExp(s));
 assert.ok(pieces.some(r=>r.test('Artemis2')));for(const name of ['EmbedArtemis','Artemis2x','KiriKiri1','YU-RIS2'])assert.ok(!pieces.some(r=>r.test(name)),name);});

test('every other engine keeps the kernel default: short pieces follow the label rule',()=>{
 for(const p of [P.profileFor({}),P.profileFor({engine:'kirikiri',exe:'D:/x/other.exe',title:'other'}),P.profileFor({engine:'yuris',exe:'D:/x/y.exe',title:'y'})]){
  assert.deepEqual(p.source.embedGlyphPieces||[],[]);assert.equal('embedGlyphPieces' in bp(p),false);}});

test('the hook engine makes Artemis2 writable, HookBridge reads the list and checks the replies in --self-test',()=>{
 const art=fs.readFileSync(path.join(__dirname,'..','native','megulithook','Artemis.cpp'),'utf8');
 assert.match(art,/hp\.type = USING_STRING \| NO_CONTEXT \| USING_SPLIT \| EMBED_ABLE \| EMBED_AFTER_NEW;\s*hp\.split = regoffset\(ecx\);\s*hp\.filter_fun = Utf8TypeChecker;\s*return NewHook\(hp, "Artemis2"\);/,'writable, one stream per text layer object');
 assert.match(fs.readFileSync(path.join(__dirname,'..','native','megulithook','build-x86.cmd'),'utf8'),/for %%F in \(Artemis\.cpp /,'the x86 build copies the changed engine file');
 const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.match(cs,/ProfileGlyphPieces=d!=null&&d\.TryGetValue\("embedGlyphPieces",out av\)\?AutoSelectSkipFrom\(av\)/);
 assert.match(cs,/string piece=GlyphPieceReply\(candidate\.name,text,SkipHeld\|\|EngineDialogHidden\)/);
 assert.match(cs,/if\(!GlyphPieceSelfTest\(\)\)/,'checked by --self-test');});
