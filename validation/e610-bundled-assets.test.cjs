'use strict';
/* E610 F1 bundled-asset family (webbundle.cjs): Twine, WebGAL, Monogatari, RenJS, Narrat, ink, Bitsy, GB Studio, GDevelop,
   Construct, Decker, Cocos2d, LÖVE, Corona / Solar2D, Defold, Visual Novel Maker and the generic HTML5 / Electron / NW.js
   reader, on synthetic folders (validation/helpers/engine-fixtures-bundled.cjs). Each builds a Japanese game and a Chinese
   patch with the same entries and checks the lines pair 1:1, loose and packed (app.asar / package.nw / .love). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./helpers/engine-fixtures-bundled.cjs');
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs'),wb=require('../services/original-engines/webbundle.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e610-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const linesOf=(id,dir)=>scenes.read(id,dir).flatMap(s=>s.lines);
const J=F.T.ja;
/* the Japanese lines each engine must give, in scene order then line order */
const WANT={twine:[J[0],J[1],J[2],J[3]],webgal:[J[2],J[1],J[0],J[3],J[2],J[0],J[2]],monogatari:[J[1],J[0],J[2],J[3]],renjs:[J[1],J[0],J[3]],narrat:[J[1],J[0],J[3]],ink:[J[0],J[1]],
 bitsy:[J[0]+'\n'+J[1],J[2]],gbstudio:[J[0],J[1],J[2]],gdevelop:[J[0],J[1]],construct:[J[0],J[1]],decker:[J[0]+'\n'+J[1]],cocos:[J[0],J[1],J[2]],solar2d:[J[0],J[1]],html5:[J[0],J[1],J[2]]};

for(const [id,spec] of Object.entries(F.SPEC)){
 test(`${spec.name}: detected, read loose and in app.asar, a Chinese patch pairs 1:1`,t=>{
  const game=tmp(t),patch=tmp(t),packed=tmp(t);
  F.writeTree(game,spec.files('ja'));F.writeTree(patch,spec.files('zh'));
  assert.equal(library.engineOf(game)?.name,spec.name,'engine name');
  assert.equal(scenes.detect(game),id,'reader');
  const flat=linesOf(id,game);
  assert.deepEqual([...flat].sort(),[...WANT[id]].sort(),spec.name+' lines');
  const zh=scenes.ENGINES[id].archives(patch).map(s=>scenes.ENGINES[id].parse(s.read()));
  assert.equal(zh.flatMap(s=>s.lines).length,flat.length,'patch line count');
  assert.ok(zh.flatMap(s=>s.lines).some(l=>l.includes('早上好')||l.includes('晨光')),'patch has the Chinese');
  F.writeTree(packed,{'resources/app.asar':F.asar(spec.files('ja')),'Game.exe':'MZ','package.json':'{}'});
  assert.deepEqual(linesOf(id,packed),flat,'asar lines');
 });
}
test('LÖVE: .love zip beside love.dll / appended to the exe, a GBK Lua patch pairs',t=>{
 const game=tmp(t),exe=tmp(t),patch=tmp(t),enc=s=>Buffer.from(s,'utf8');
 F.writeTree(game,{'game.love':F.zip(F.love('ja',enc)),'love.dll':'x','Game.exe':'MZ'});
 F.writeTree(patch,{'text.lua':F.love('zh',F.gbk)['text.lua']});
 F.writeTree(exe,{'Game.exe':F.zip(F.love('ja',enc),{prefix:Buffer.from('MZ'.repeat(40))}),'love.dll':'x'});
 for(const d of [game,exe]){assert.equal(library.engineOf(d)?.name,'LÖVE');assert.equal(scenes.detect(d),'love');assert.deepEqual(linesOf('love',d),J.slice(0,3));}
 const zh=scenes.ENGINES.love.archives(patch).map(s=>scenes.ENGINES.love.parse(s.read()));assert.deepEqual(zh[0].lines,F.T.zh.slice(0,3));
});
test('Visual Novel Maker: package.nw with MZ-format data, speaker from Actors, patch pairs',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'package.nw':F.zip(F.vnmaker('ja')),'Game.exe':'MZ','nw.dll':'x'});F.writeTree(patch,{'data/Map001.json':F.vnmaker('zh')['data/Map001.json']});
 assert.equal(library.engineOf(game)?.name,'Visual Novel Maker');assert.equal(scenes.detect(game),'vnmaker');
 const map=scenes.read('vnmaker',game).find(s=>/map001/i.test(s.name));
 assert.deepEqual(map.lines,[J[0]+'\n'+J[1],J[2],J[3]]);assert.equal(map.speakers[0],'恵');
 const zh=scenes.ENGINES.vnmaker.archives(patch).map(s=>scenes.ENGINES.vnmaker.parse(s.read()));assert.equal(zh[0].lines.length,3);assert.equal(zh[0].lines[1],'去教室');
});
test('Defold / Corona .car: detected, UTF-8 runs read; a GB Studio web export with only a ROM is detected, not read',t=>{
 const d=tmp(t);F.writeTree(d,{'game.arcd':Buffer.concat([Buffer.alloc(32),Buffer.from('\0'+J[0]+'\0\0'+J[1]+'\0','utf8')]),'Game.exe':'MZ'});
 assert.equal(library.engineOf(d)?.name,'Defold');assert.equal(scenes.detect(d),'defold');assert.deepEqual(linesOf('defold',d),J.slice(0,2));
 const c=tmp(t);F.writeTree(c,{'resource.car':Buffer.from('rcar\0'+J[0]+'\0','utf8'),'Game.exe':'MZ'});assert.equal(library.engineOf(c)?.name,'Corona / Solar2D');
 const g=tmp(t);F.writeTree(g,{'index.html':'<html>','game.gb':Buffer.alloc(0x200),'gbs.js':'//'});assert.equal(library.engineOf(g)?.name,'GB Studio');assert.equal(scenes.detect(g),null);
});
test('Twine macros and links are cut; the HTML5 reader ignores vendor libraries',t=>{
 const r=wb.KINDS.twine(('<tw-storydata><tw-passagedata name="a" tags="">&lt;&lt;link "進む" "b"&gt;&gt;&lt;&lt;if $x &gt; 1&gt;&gt;ある&lt;&lt;endif&gt;&gt;\n(set: $a to 1)[[図書館->lib]]\nplain ascii</tw-passagedata></tw-storydata>'));
 assert.deepEqual(r.lines,['進むある','図書館']);assert.deepEqual(r.anchors,['a']);
 const d=tmp(t);F.writeTree(d,F.SPEC.html5.files('ja'));assert.ok(!scenes.ENGINES.html5.scenes(d).some(s=>/jquery/i.test(s.name)));
});
test('a plain game folder is not mistaken for a web bundle',t=>{
 const d=tmp(t);F.writeTree(d,{'Game.exe':'MZ','readme.txt':'日本語のテキスト','data.dat':'x'});
 assert.equal(wb.probe(d,'html5'),false);assert.equal(scenes.ENGINES.html5.scenes(d).length,0);
});
