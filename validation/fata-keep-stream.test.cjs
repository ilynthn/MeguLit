// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 ファタモルガーナの館（海市蜃楼之馆）cold runs: a fresh session left Krkr2wcs during the prologue (that stream has no
   dialogue there) for the per-glyph KiriKiri1, the main story then came on KiriKiri1 and the KAG page hide never ran: the original
   showed on screen. The installed app kept Krkr2wcs only because its session file remembered it. The game seed now pins the stream
   (source.keepStream), the kernel hands it to HookBridge, and HookBridge never leaves a kept stream for a rival with more lines
   (KeepStreamSelfTest in HookBridge --self-test). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../core/profiles/index.cjs'),Seed=require('../core/profiles/seed.cjs'),{HookNative}=require('../core/hook-native.cjs');
const FATA='17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42';
const fata=sha=>P.profileFor({exe:'D:/games/fata/fata_jp.exe',exeSha256:sha,engine:'kirikiri',title:'ファタモルガーナの館'});
const bp=p=>HookNative.prototype.bridgeProfile.call({profile:p});

test('ファタ keeps Krkr2wcs: the seed pins it and HookBridge gets it',()=>{
 assert.deepEqual(Seed.load().errors,[]);
 const p=fata(FATA);assert.equal(p.gameKey,'fata-morgana');
 assert.deepEqual(p.source.keepStream,['^Krkr2wcs$']);assert.deepEqual(bp(p).keepStream,['^Krkr2wcs$']);
 const keep=p.source.keepStream.map(s=>new RegExp(s));
 assert.ok(keep.some(r=>r.test('Krkr2wcs')));for(const name of ['KiriKiri1','KiriKiri2','tTVPNativeBaseBitmap::DrawText','Krkr2wcsX'])assert.ok(!keep.some(r=>r.test(name)),name);});

test('other games keep the kernel default: the selected stream may be left',()=>{
 for(const p of [P.profileFor({}),P.profileFor({engine:'kirikiri',exe:'D:/x/other.exe',title:'other'})]){assert.deepEqual(p.source.keepStream||[],[]);assert.equal('keepStream' in bp(p),false);}});

test('HookBridge reads the list and the dialogue-rival switch passes a kept stream by',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.match(cs,/ProfileKeepStream=d!=null&&d\.TryGetValue\("keepStream",out av\)\?AutoSelectSkipFrom\(av\)/);
 assert.match(cs,/TotalSeconds>=3&&!KeepStream\(cur\.name\)&&!SameHookNewContext\(cur,rv\)/);
 assert.match(cs,/if\(!KeepStreamSelfTest\(\)\)/,'checked by --self-test');});
