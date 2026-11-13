'use strict';
/* E620–E629 the F2 plain-text script family: one grammar-profile reader (services/original-engines/plaintext.cjs +
   plaintext-profiles.json), tested on synthetic game folders (validation/helpers/engine-fixtures-f2.cjs). Each engine:
   the library names it, scenes.detect picks the reader, the Japanese game and a Chinese (GBK) patch pair 1:1. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./helpers/engine-fixtures-f2.cjs');
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs'),registry=require('../services/original-engines/registry.cjs');
const pt=require('../services/original-engines/plaintext.cjs'),packs=require('../services/adapter-packs.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e620-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

const EXPECT={
 suika2:['ひなた','「おはよう」\n朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ひなた','ありがとう。'],
 nvlist:['ひなた','「おはよう」','朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ありがとう。'],
 vnds:['ひなた','「おはよう」','朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ありがとう。'],
 pymo:['ひなた','「おはよう」\n朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ひなた','ありがとう。'],
 pywright:['ひなた','「おはよう」\n朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ありがとう。'],
 airnovel:['ひなた','「おはよう」','朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ありがとう。'],
 instead:['ひなた','「おはよう」\n朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ありがとう。']};
const NAMES={suika2:'Suika 2','suika2-loose':'Suika 2','suika2-obf':'Suika 2',airnovel:'AIRNovel',nvlist:'NVList',vnds:'VNDS',pymo:'pymo',pywright:'PyWright',instead:'INSTEAD'};
const ENC={suika2:F.utf8,'suika2-loose':F.sjis,'suika2-obf':F.utf8,airnovel:F.utf8,nvlist:F.utf8,vnds:F.sjis,pymo:F.sjis,pywright:F.utf8,instead:F.utf8};

for(const key of Object.keys(NAMES)){const id=key.replace(/-(loose|obf)$/,'');
 test(`${NAMES[key]} (${key}): fingerprint, reader, Japanese lines in order, GBK patch pairs 1:1`,t=>{
  const game=F.writeTree(tmp(t),F.games[key](ENC[key],F.scripts[id](F.JA)));
  assert.equal(library.engineOf(game)?.name,NAMES[key]);assert.deepEqual(registry.readersFor(game),['plaintext']);
  assert.equal(scenes.detect(game),'plaintext');
  const own=scenes.read('plaintext',game);assert.equal(own.length,1);assert.deepEqual(own[0].lines,EXPECT[id]);
  const patch=F.writeTree(tmp(t),F.patches[key](F.scripts[id](F.ZH)));
  const overlay=new Map(scenes.ENGINES.plaintext.archives(patch).map(s=>[s.name.toLowerCase(),s.read()]));assert.equal(overlay.size,1);
  const zh=scenes.read('plaintext',game,overlay);assert.equal(zh[0].patched,true);
  assert.equal(zh[0].lines.length,own[0].lines.length,'1:1 pairing');assert.ok(zh[0].lines.includes('谢谢。'));assert.ok(zh[0].lines.includes('去屋顶'));
  assert.equal(zh[0].lines.indexOf('谢谢。'),own[0].lines.indexOf('ありがとう。'));
 });}

test('profiles are data: every one compiles, has an engine name, a status and a fingerprint or scan; names are unique',()=>{
 const seen=new Set();for(const p of pt.RAW.profiles){assert.ok(p.id&&p.engine&&['完整','半成品','需实物'].includes(p.status),p.id);assert.ok(!seen.has(p.engine),p.engine);seen.add(p.engine);
  assert.ok(p.match,'fingerprint: '+p.id);assert.ok(pt.PROFILES[p.id]);assert.deepEqual(registry.READERS[p.engine],p.detectOnly?[]:['plaintext']);}
 const names=registry.ENGINES.map(e=>e.name);for(const n of seen)assert.equal(names.filter(x=>x===n).length,1,n);
});

test('Suika 2: data01.arc index is read; an obfuscated archive (2.x) is recognised but not read; junk folders are not claimed',t=>{
 const arc=F.suikaArc({'txt/a.txt':Buffer.from('テスト'),'cg/x.png':Buffer.from('P')});const d=tmp(t);fs.writeFileSync(path.join(d,'data01.arc'),arc);
 assert.deepEqual(pt.tableList(pt.PROFILES.suika2,path.join(d,'data01.arc')).map(e=>e.name),['txt/a.txt','cg/x.png']);
 /* the 2.x stream starts with the key's low byte; a build key MeguLit does not know is recognised, not read */
 assert.equal(pt.suikaXor(Buffer.alloc(1),'cafef00dabadbeef',pt.suikaSeed('cafef00dabadbeef',0))[0],0xef);
 assert.deepEqual(pt.suikaList(path.join(d,'data01.arc'),['cafef00dabadbeef']),null);
 const ob=F.suikaArcObf({'txt/a.txt':Buffer.from('テスト')},'0123456789abcdef');const o=tmp(t);fs.writeFileSync(path.join(o,'data01.arc'),ob);
 assert.equal(library.engineOf(o)?.name,'Suika 2');assert.deepEqual(scenes.ENGINES.plaintext.scenes(o),[]);
 const junk=F.writeTree(tmp(t),{'readme.txt':'hello','script/a.txt':'x','main.lua':'print(1)'});assert.equal(pt.profileOf(junk),null);assert.deepEqual(scenes.ENGINES.plaintext.scenes(junk),[]);
});

test('a buffer read elsewhere is matched to its profile by content; unknown text goes to the generic kana scan',()=>{
 assert.deepEqual(pt.parse(F.sjis(F.scripts.pymo(F.JA))).lines,EXPECT.pymo);
 assert.deepEqual(pt.parse(F.utf8(F.scripts.vnds(F.JA))).lines,EXPECT.vnds);
 assert.deepEqual(pt.parse(Buffer.alloc(32,7)).lines,[]);
});

test('profiles that fit an adapter-pack grammar convert to a valid grammar:lines pack',()=>{
 const asPack=(id,g)=>{const pack={schema:packs.SCHEMA,format:packs.FORMAT,id:'f2-'+id,version:1,minApp:'1.0.0',requires:[],match:{files:[{path:'x.txt'}]},source:{container:'loose',files:['*.txt']},grammar:g};pack.requires=packs.needs(pack);return pack;};
 for(const p of pt.RAW.profiles){const g=pt.packGrammar(p.id);if(g)assert.equal(packs.validate(asPack(p.id,g)).ok,true,p.id);}
 /* a new engine of the simple kind (comment, @command / *label anchors, one say rule): the pack reads it as the profile does */
 const simple={id:'demo',engine:'Demo',status:'半成品',match:{has:'^demo\\.exe$'},comment:'^//',anchor:'^[@*]',bare:false,say:[{re:'^>\\s*(.+)$',text:1}],strip:['\\[[^\\]]*\\]']};
 const g=pt.packGrammar(simple),pack=asPack('demo',g);assert.equal(packs.validate(pack).ok,true,JSON.stringify(packs.validate(pack)));
 const src=F.sjis('// c\n@bg 1\n*lbl\n> 「おはよう」[w]\n地の文は無視\n> ありがとう。\n');
 assert.deepEqual(packs.parse(pack,src).lines,pt.parseWith(pt.compile(simple),src).lines);assert.deepEqual(packs.parse(pack,src).lines,['「おはよう」','ありがとう。']);
});

test('Kaleido ADV Workshop: encrypted M2 PSB pairs are recognised (no reader until a real game gives the key)',t=>{
 const d=F.writeTree(tmp(t),{'game.exe':'MZ','scenario_info.psb.m':Buffer.alloc(32,1),'scenario_body.bin':Buffer.alloc(64,2)});
 assert.equal(library.engineOf(d)?.name,'Kaleido ADV Workshop');assert.deepEqual(registry.readersFor(d),[]);assert.deepEqual(scenes.ENGINES.plaintext.scenes(d),[]);
});
