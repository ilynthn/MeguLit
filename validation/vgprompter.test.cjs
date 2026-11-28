'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const vgp=require('../services/original-engines/vgprompter.cjs'),scenes=require('../services/original-engines/scenes.cjs');
// E403: the Lines_<code> MonoBehaviour is a list of labels, each with line hashes and the lines of one language.
function str(s){const b=Buffer.from(s,'utf8'),pad=(4-(b.length&3))&3,h=Buffer.alloc(4);h.writeUInt32LE(b.length);return Buffer.concat([h,b,Buffer.alloc(pad)]);}
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function linesObject(name,labels){const parts=[Buffer.alloc(28),str(name),u32(labels.length)];
 for(const l of labels){parts.push(str(l.name),u32(l.lines.length),...l.lines.map((_,k)=>u32(l.hash+k)),u32(l.lines.length),...l.lines.map(str));}
 return Buffer.concat(parts);}
test('VGPrompter Lines table and markup',()=>{
 const d=linesObject('Lines_ja',[{name:'ch1_main',hash:100,lines:['「やっほー、[player]君！」','<i>ここ</i>は<br>文芸部']},{name:'nm1',hash:500,lines:['「よし」']}]);
 const t=vgp._internal.labels(d);
 assert.deepEqual(t.map(l=>l.name),['ch1_main','nm1']);assert.deepEqual(t[0].hashes,[100,101]);
 const r=vgp.parse(Buffer.from(JSON.stringify({lines:t[0].lines,zh:['又见面了，[player]！','']})));
 assert.deepEqual(r.lines,['「やっほー、[player]君！」','ここは\n文芸部']);assert.deepEqual(r.zh,['又见面了，[player]！','']);
});
test('XOR 0x28 language bundles',()=>{
 const plain=Buffer.from('UnityFS\0rest');const enc=Buffer.from(plain.map(b=>b^0x28));
 assert.equal(vgp._internal.decrypt(enc).toString('latin1',0,7),'UnityFS');assert.equal(vgp._internal.decrypt(plain),plain);
});
const game='e:/steam/steamapps/common/Doki Doki Literature Club Plus';
test('Doki Doki Literature Club Plus! (Steam): Japanese scenario with the release Chinese',{skip:!require('./helpers/installed.cjs').installed(game)&&'no local copy'},()=>{
 assert.equal(scenes.detect(game),'vgprompter');
 const list=scenes.read('vgprompter',game);assert.ok(list.length>200);
 const ch1=list.find(s=>s.name==='ch1_main');assert.equal(ch1.lines[1],'「やっほー、[player]君！」');assert.equal(ch1.zh[1],'又见面了，[player]！');
 assert.ok(list.reduce((n,s)=>n+s.lines.length,0)>15000);
});
