// SPDX-License-Identifier: GPL-3.0-or-later
/* #146 / #148 (WHITE ALBUM2, AQUAPLUS Leaf hook, v1.4.8; strings copied from the user's hook-events.log) and #147 */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {ChoiceCapture}=require('../core/choice-capture.cjs');
const {cleanSource}=require('../core/hook-native.cjs');

test('#146 numbered options glued in one string become one candidate each, in order',()=>{
 assert.deepStrictEqual(ChoiceCapture.pieces('１．電話をかける２．メールを送る').map(p=>p.line),['電話をかける','メールを送る']);
 let t=1000;const c=new ChoiceCapture(()=>t);c.noteDialogue('だから俺は、彼女の求めに応じなくちゃならない。');
 /* the dialogue stream itself carried the hovered option 「２．メールを送る」 */
 c.add('１．電話をかける２．メールを送る','２．メールを送る','');
 assert.deepStrictEqual(c.options(),['電話をかける','メールを送る']);
 assert.deepStrictEqual(c.order,['電話をかける','メールを送る']);
});
test('#146 numbers inside ordinary text are not cut',()=>{
 for(const s of ['第1話は2.5倍','1.5倍の速さ','３．１４の話'])assert.strictEqual(ChoiceCapture.pieces(s).length,1,s);
 /* not starting at 1, or out of order */
 assert.strictEqual(ChoiceCapture.pieces('２．メールを送る').length,1);
 assert.strictEqual(ChoiceCapture.pieces('２．あ３．い').length,1);
});
test('#148 one-letter engine tags around Japanese are unwrapped (<F16…>)',()=>{
 assert.strictEqual(cleanSource('<F16「やぁ…北原君かぃ？\n><F16元気にやってるかなぁぁぁ…？」>'),'「やぁ…北原君かぃ？\n元気にやってるかなぁぁぁ…？」');
 assert.strictEqual(cleanSource('「あ………ああっ！」<F16「馬鹿、そこでトチるな」>「あ、あいつ」'),'「あ………ああっ！」「馬鹿、そこでトチるな」「あ、あいつ」');
 assert.strictEqual(cleanSource('<R華奢|きゃしゃ>な体'),'華奢な体');
});
test('#148 ASCII markup and plain angle brackets stay',()=>{
 for(const s of ['a<b>c','x<br>y','C3と<5>','<html>','1<2>0'])assert.strictEqual(cleanSource(s),s);
});
test('#147 the manual sentence filter explains how to save a sentence',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','sentences-page.js'),'utf8');
 assert.match(src,/howManual:'[^']*收藏句子/);assert.match(src,/filter==='manual'\?/);
});
test('#149 older Innocent Grey PACKDAT script.dat (殻ノ少女) is read like script.iga',()=>{
 const {list,parse,engine}=require('../services/original-engines/iga.cjs');const os=require('os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'packdat-'));
 /* one scene: 00 04 00 <len> "＃冬子" and a line, both cp932 */
 const name=Buffer.from([0x81,0x94,0x93,0x7e,0x8e,0x71,0]);/* ＃冬子 */
 const line=Buffer.from([0x81,0x75,0x82,0xa0,0x82,0xc8,0x82,0xbd,0x82,0xcd,0x81,0x48,0x81,0x76,0]);/* 「あなたは？」 */
 const op=b=>{const n=b.length+(4-b.length%4)%4;return Buffer.concat([Buffer.from([0x00,0x04,0x00,n]),b,Buffer.alloc(n-b.length)]);};
 const scene=Buffer.concat([op(name),op(line)]),stored=Buffer.from(scene.map(x=>x^0xff));
 const head=Buffer.alloc(16+48);head.write('PACKDAT.',0,'latin1');head.writeUInt32LE(1,8);head.writeUInt32LE(1,12);head.write('00_0000.s',16,'latin1');
 head.writeUInt32LE(64,48);head.writeUInt32LE(0x20000000,52);head.writeUInt32LE(stored.length,56);head.writeUInt32LE(stored.length,60);
 fs.writeFileSync(path.join(dir,'script.dat'),Buffer.concat([head,stored]));
 const scenes=engine.scenes(dir);assert.strictEqual(scenes.length,1);assert.strictEqual(scenes[0].name,'00_0000.s');
 const r=parse(scenes[0].read());assert.deepStrictEqual(r.lines,['冬子','「あなたは？」']);
 assert.strictEqual(list(path.join(dir,'nothing.dat')),null);
 fs.rmSync(dir,{recursive:true,force:true});
});
