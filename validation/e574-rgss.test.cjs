'use strict';
/* E574 RPG Maker XP / VX / VX Ace: RGSSAD v1 and v3 archives, Ruby Marshal data, messages through the MV reader */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./helpers/engine-fixtures.cjs'),R=require('./helpers/engine-fixtures-rgss.cjs');
const rgss=require('../services/original-engines/rgss.cjs'),scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e574-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

const vxMap=(say,choices)=>R.map([[[R.cmd(101,['Actor1',0,0,2]),R.cmd(401,[say[0]]),R.cmd(401,[say[1]]),R.cmd(102,[choices,1]),R.cmd(101,['',0,0,2]),R.cmd(401,['\\N[1]は笑った。'])]]]);
const actors=names=>[null,...names.map((n,i)=>new R.RObj('RPG::Actor',{id:i+1,name:n}))];
const common=line=>[null,new R.RObj('RPG::CommonEvent',{id:1,name:'ce',list:[R.cmd(101,['',0,0,2]),R.cmd(401,[line]),R.cmd(0,[])]})];

test('Marshal: fixnums, strings with encoding, symbols and links, hashes with integer keys',()=>{
 const v=rgss.plain(rgss.marshal(R.marshal([1,-3,300,70000,'日本語',new R.RObj('X',{a:'b'}),new R.RObj('X',{a:'c'}),new R.RHash([[2,'two'],[5,'five']])])));
 assert.deepEqual(v.slice(0,5),[1,-3,300,70000,'日本語']);assert.equal(v[5].__class,'X');assert.equal(v[6].a,'c');assert.equal(v[7][5],'five');
});
test('RGSSAD v1 (XP/VX) and v3 (VX Ace): index and data decrypt',()=>{
 for(const make of [R.rgssadV1,R.rgssadV3]){const d=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e574a-'));const f=path.join(d,'Game.rgss3a');
  fs.writeFileSync(f,make({'Data\\Map001.rvdata2':Buffer.from('hello world, odd len'),'Graphics\\a.png':Buffer.from('PNG')}));
  const l=rgss.list(f);assert.deepEqual(l.map(e=>e.name),['Data/Map001.rvdata2','Graphics/a.png']);assert.equal(rgss.read(f,l[0]).toString(),'hello world, odd len');fs.rmSync(d,{recursive:true,force:true});}
});
test('VX Ace game (Game.rgss3a): messages, choices, \\N[n] names; recognised; a Chinese Data folder pairs by key',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'Game.rgss3a':R.rgssadV3({'Data\\Map001.rvdata2':R.marshal(vxMap(['「おはよう」','今日も晴れだ。'],['はい','いいえ'])),'Data\\Actors.rvdata2':R.marshal(actors(['エリック'])),'Data\\CommonEvents.rvdata2':R.marshal(common('共通の台詞'))}),'Game.exe':'MZ','Game.ini':'[Game]\nRTP=RPGVXAce'});
 F.writeTree(patch,{'Data/Map001.rvdata2':R.marshal(vxMap(['“早上好”','今天也是晴天。'],['是','否'])),'Data/Actors.rvdata2':R.marshal(actors(['艾瑞克']))});
 assert.equal(library.engineOf(game)?.name,'RPG Maker VX/XP');assert.equal(scenes.detect(game),'rgss');
 const base=scenes.read('rgss',game);assert.deepEqual(base.map(s=>s.name),['CommonEvents.rvdata2','Map001.rvdata2']);
 const map=base[1];assert.deepEqual(map.lines,['「おはよう」\n今日も晴れだ。','はい','いいえ','エリックは笑った。']);
 const out=scenes.ENGINES.rgss.patchLines(base,{dirs:[patch,path.join(patch,'Data')],files:new Map()});
 assert.deepEqual(out[1].lines,['“早上好”\n今天也是晴天。','是','否','艾瑞克は笑った。'.replace('艾瑞克は笑った。','艾瑞克は笑った。')]);assert.equal(out[1].patched,true);
});
test('XP game (Game.rgssad, Ruby 1.8 strings): 101 carries the first row',t=>{
 const xpMap=R.map([[[R.cmd(101,['一行目']),R.cmd(401,['二行目']),R.cmd(102,[['東','西'],2])]]]);
 const game=tmp(t);F.writeTree(game,{'Game.rgssad':R.rgssadV1({'Data\\Map002.rxdata':R.marshal(xpMap,{ace:false})}),'Game.exe':'MZ'});
 assert.equal(scenes.detect(game),'rgss');assert.deepEqual(scenes.read('rgss',game)[0].lines,['一行目\n二行目','東','西']);
 /* a loose Data folder (a developer build or an unpacked game) reads the same way */
 const loose=tmp(t);F.writeTree(loose,{'Data/Map002.rxdata':R.marshal(xpMap,{ace:false}),'Game.exe':'MZ'});assert.deepEqual(scenes.read('rgss',loose)[0].lines,['一行目\n二行目','東','西']);
});
