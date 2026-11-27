// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 アイキス3 sexy (NeXAS): the first choice 「１・ちょっと教えて欲しい」 / 「２・当然みんなの事はちゃんと知ってる」 is drawn
   by GetGlyphOutline in the dialogue font (ＭＳ ゴシック 30 px) right after the line 「そうじゃない、ちょっと教えて欲しいというなら１を。…」;
   the glyph hide kept every character it had hidden in that line hidden, so the options came out blank (live run, ocr-11.png) and
   the reader's choice OCR found nothing. The NeXAS engine layer turns on hide.glyphAfterLine, the kernel hands it to HookBridge,
   HookBridge tells the font DLL (AFTERLINE on), and GlyphMatch then leaves glyphs after the whole line alone. The matcher itself is
   tested by native/fontprobe/selftest/match.cpp (run-match.cmd, CI native self-tests). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../core/profiles/index.cjs'),{HookNative}=require('../core/hook-native.cjs');
const bp=p=>HookNative.prototype.bridgeProfile.call({profile:p});
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('NeXAS games hand glyphAfterLine to HookBridge; other engines keep the kernel rule',()=>{
 const nexas=P.profileFor({engine:'nexas',exe:'D:/games/aikiss3/Aikiss3.exe',title:'アイキス3 sexy'});
 assert.equal(nexas.hide.glyphAfterLine,true);assert.equal(bp(nexas).glyphAfterLine,true);
 assert.deepEqual(bp(nexas).stripCodes,nexas.source.stripCodes);
 const strip=s=>nexas.source.stripCodes.reduce((t,r)=>t.replace(new RegExp(r,'g'),(m,...g)=>typeof g[0]==='string'?g[0]:''),s);
 assert.equal(strip('色々なことがありました。@t0650ありましたね……？」@k'),'色々なことがありました。ありましたね……？」','the codes the glyph hide lost its place on');
 assert.equal(strip('@r漢字@かんじ@の@vAYA_0001声'),'漢字の声','ruby keeps its base, voice codes go');
 for(const p of [P.profileFor({}),P.profileFor({engine:'kirikiri',exe:'D:/x/other.exe',title:'other'}),P.profileFor({engine:'yuris',exe:'D:/x/y.exe',title:'y'})]){
  assert.equal(p.hide.glyphAfterLine,false);assert.equal('glyphAfterLine' in bp(p),false);assert.deepEqual(p.source.stripCodes,[]);assert.equal('stripCodes' in bp(p),false);}});

test('the bridge sends AFTERLINE to the font DLL and the DLL sets the matcher from it',()=>{
 const cs=read('native/HookBridge.cs');
 assert.match(cs,/ProfileGlyphAfterLine=d!=null&&d\.TryGetValue\("glyphAfterLine",out av\)/);
 assert.match(cs,/if\(ProfileGlyphAfterLine\)w\.WriteLine\("AFTERLINE on"\)/,'sent again on every control connection');
 assert.ok(cs.includes('text=StripCodes(text);'),'the selected line is stripped before the glyph hide and the reader see it');
 assert.ok(cs.includes('if(!StripCodesSelfTest())'),'checked by --self-test');
 assert.ok(read('native/fontprobe/FontProbe.cpp').includes('l == "AFTERLINE off") { Hide.AfterLineNew = l == "AFTERLINE on"'));
 assert.match(read('native/fontprobe/GlyphMatch.h'),/\(hidden\.count\(c\) && !done\)/);});
