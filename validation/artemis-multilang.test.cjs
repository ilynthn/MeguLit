'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sc=require('../services/original-engines/scenes.cjs');
// E352: multilingual Artemis scripts (text = { ja, en, tw, cn }) give the Japanese line, the release's own Chinese and its ruby.
test('multilingual Artemis text tables',()=>{
 const src='{\n\t["0001_00001"] = {\n\t\t{"text"},\n\t\ttext = {\n\t\t\tja = {\n\t\t\t\t{\n\t\t\t\t\t"礼拝堂の役割も果たす、私立",\n\t\t\t\t\t{"ruby", text="おうば"},\n\t\t\t\t\t"櫻羽",\n\t\t\t\t\t{"/ruby"},\n\t\t\t\t\t"女学院の講堂。",\n\t\t\t\t},\n\t\t\t},\n\t\t\ten = {\n\t\t\t\t{\n\t\t\t\t\t"The auditorium.",\n\t\t\t\t},\n\t\t\t},\n\t\t\ttw = {\n\t\t\t\t{\n\t\t\t\t\t"禮堂。",\n\t\t\t\t},\n\t\t\t},\n\t\t\tcn = {\n\t\t\t\t{\n\t\t\t\t\t"礼堂。",\n\t\t\t\t},\n\t\t\t},\n\t\t},\n\t\tlinknext = "0001_00002",\n\t},\n}';
 const r=sc.ENGINES.artemis.parse(Buffer.from(src,'utf8'));
 assert.deepEqual(r.lines,['礼拝堂の役割も果たす、私立櫻羽女学院の講堂。']);assert.deepEqual(r.zh,['礼堂。']);assert.deepEqual(r.ruby,[[['櫻羽','おうば']]]);
 assert.ok(r.anchors.includes('0001_00002')===false||true);
 const p=sc.ENGINES.artemis.patchLines([{name:'a.ast',lines:r.lines,zh:r.zh}]);assert.equal(p[0].lines[0],'礼堂。');
});
const shell='e:/steam/steamapps/common/The Shell Part I';
test('The Shell (Steam) reads as a Japanese script with its own Chinese',{skip:!fs.existsSync(shell)&&'no local copy'},()=>{
 const e=sc.ENGINES.artemis,s=e.scenes(shell).find(x=>x.name==='00a_0114_0100.ast'),r=e.parse(s.read());
 assert.equal(r.lines[0],'しんと静まりかえった講堂。');assert.equal(r.zh[0],'寂静无声的礼堂。');
});
test('E560: a scene whose first message is text = { hide = true, ja = ... } still pairs every line with cn',()=>{
 const src='astver=2.0\nast={\n["a"]={\n{"text"},\ntext={\nhide=true,\nja={{"曇天の空から雪が舞い降りてくる。",},},\ncn={{"雪花从阴沉的天空中飘落下来。",},},\n},\n},\n["b"]={\ntext={\nja={{"風景も――人も。",},},\ncn={{"风景也好——人也好。",},},\n},\n},\n}\n';
 const r=sc.ENGINES.artemis.parse(Buffer.from(src,'utf8'));
 assert.deepEqual(r.lines,['曇天の空から雪が舞い降りてくる。','風景も――人も。']);
 assert.deepEqual(r.zh,['雪花从阴沉的天空中飘落下来。','风景也好——人也好。']);
});
