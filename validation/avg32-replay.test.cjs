// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 涙 ～流星のザドル～ (AVG32), live hook recording (helpers/avg32-replay/namida-live.jsonl, LunaHook
   HBN4*0@20060:AVG3216D.EXE under Locale Emulator) replayed through HookNative, and every shown line paired with the
   script lines the AVG32 reader gives for the same scene. */
const test=require('node:test'),assert=require('node:assert'),path=require('node:path');
const {replay}=require('./helpers/hook-replay.cjs'),avg32=require('../services/original-engines/avg32.cjs'),{Matcher}=require('../services/original-text.cjs');
// Shift-JIS bytes of the few characters the synthetic scene uses.
const SJ={'【':[0x81,0x79],'】':[0x81,0x7a],'「':[0x81,0x75],'」':[0x81,0x76],'女':[0x8f,0x97],'の':[0x82,0xcc],'声':[0x90,0xba],'ん':[0x82,0xf1],'ぐ':[0x82,0xae],'ぅ':[0x82,0xa3],'ッ':[0x83,0x62]};
const b=s=>Buffer.from([...s].flatMap(c=>SJ[c]));
test('AVG32: half-width text inside a line (00 FE "!!" 00 FF) stays in the line',()=>{
 const scene=Buffer.concat([Buffer.from([1,0xff]),b('【女の声】「んぐぅッ'),Buffer.from([0,0xfe,0x21,0x21,0,0xff]),b('」'),Buffer.from([0,1])]);
 assert.deepEqual(avg32.parse(scene).lines,['【女の声】「んぐぅッ!!」']);
});
test('original-text Matcher: a narration line after the first of a joined text is not cut as a speaker',()=>{
 const lines=['　◆　名前の設定　◆','あなたの現在の名前は『春日　光一』、','自分自身のことを『オレ』と呼んでいます。','変更しますか？'];
 const r=new Matcher(lines,lines).match('　◆　名前の設定　◆あなたの現在の名前は『春日　光一』、自分自身のことを『オレ』と呼んでいます。変更しますか？');
 assert.equal(r.status,'exact');assert.deepEqual(r.indices,[0,1,2,3]);
});
test('涙 live replay: every hooked line is shown, speakers split, and pairs with the script',()=>{
 const r=replay(path.join(__dirname,'helpers','avg32-replay','namida-live.jsonl'),{name:'AVG3216D'});
 const shown=[],seen=new Set();for(const e of r.events){if(!e.hookSequence||seen.has(e.hookSequence))continue;seen.add(e.hookSequence);shown.push(e);}
 assert.equal(shown.length,4);
 assert.deepEqual(shown.map(e=>e.hookSpeaker),['','女の声','光一','']);
 const script=['　　　　　　　　◆　名前の設定　◆','あなたの現在の名前は『春日　光一』、','自分自身のことを『オレ』と呼んでいます。','変更しますか？','【女の声】「──んッ──ぅむ‥‥んぐぅッ!!」','【光一】「‥‥変態じゃん‥‥」','けど、許しを乞わずにはいられないのは、彼女が女であることの、何物でもない証拠と言える。'];
 const m=new Matcher(script,script);
 for(const e of shown){const x=m.match((e.hookSpeaker?'【'+e.hookSpeaker+'】':'')+e.hookSource);assert.ok(x.status==='exact'||x.status==='high',e.hookSource);}
});
