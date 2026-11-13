// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E602 ShiinaRio WARC 1.2–1.7 decryption in JS (shiinario-crypt.cjs), checked against GARbro 1.5.44's ArcFormats.dll:
   warc-vectors.json is what tools/warc-vectors.ps1 got from GARbro's own Decoder, range coder and WarOpener. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-g2.cjs')};
const W=require('./helpers/warc-vectors.cjs'),V=require('./helpers/warc-vectors.json'),OPEN=require('./helpers/warc-open-fixtures.cjs');
const C=require('../services/original-engines/shiinario-crypt.cjs'),shiina=require('../services/original-engines/shiinario.cjs'),scenes=require('../services/original-engines/scenes.cjs');
const JSON_SCHEMES=require('../services/original-engines/shiinario-schemes.json');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e602-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const all=()=>shiina.schemes();

test('scheme data: every GARbro title loads, SharedData / CommonImages resolve, each ShiinaImage matches its SHA-256',()=>{
 const c=C.loadSchemes(JSON_SCHEMES);assert.deepEqual(c.errors,[]);assert.equal(c.schemes.length,127);
 for(const s of c.schemes){assert.equal(s.cryptKey.length,64,s.name);assert.equal(s.region.length,9216,s.name);assert.ok(s.image.length>0,s.name);}
 assert.equal(c.schemes.filter(s=>s.extra).length,35);
 assert.ok(Object.keys(JSON_SCHEMES.GameMap).length>=90);assert.equal(JSON_SCHEMES.GameMap['aoj.EXE'],'Ao no Juuai');
});

test('helpers match GARbro over their whole domain: Si(a), the acos token of every byte pair, the gamma draws, the float mix',()=>{
 assert.deepEqual(W.helpers(all().list.find(s=>s.name==='ShiinaRio v2.34 and older')),V.helpers);
});

test('Decrypt / Encrypt / DecryptIndex / Decrypt2 / ExtraCrypt match GARbro byte for byte for all 127 schemes, WARC 1.2–1.7',()=>{
 const bad=[];for(const s of C.loadSchemes(JSON_SCHEMES).schemes)if(W.scheme(s).all!==V.schemes[s.name])bad.push(s.name);
 assert.deepEqual(bad,[]);assert.equal(Object.keys(V.schemes).length,127);
});

test('the 1.2–1.6 index range coder decodes as GARbro\'s Kogado CRangeCoder (encoded, raw, cut-off input); encode round-trips',()=>{
 const inputs=require('./helpers/warc-range-inputs.cjs')();
 for(const [name,b] of Object.entries(inputs))assert.equal(W.range(b),V.range[name+'.bin'],name);
 for(const d of [Buffer.alloc(0),Buffer.from('x'),W.gen(9,70000).map(v=>v&15)])assert.deepEqual(C.rangeDecode(C.rangeEncode(d)),d);
});

test('archives GARbro opened: the reader finds each title (game-map .exe, or by trying) and every entry comes out as GARbro\'s',t=>{
 const root=tmp(t),built=OPEN.build(root,n=>all().byName.get(n));assert.equal(built.length,42);
 const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');let n=0;
 for(const a of built){const arc=shiina.open(a.war);assert.ok(arc,a.key);assert.equal(arc.scheme,a.scheme,a.key);
  const want=V.open[a.key];assert.equal(typeof want,'object',a.key);assert.equal(arc.entries.length,Object.keys(want).length,a.key);
  for(const e of arc.entries){const got=shiina.read(a.war,e);assert.equal(hash(got),want[e.name],a.key+' '+e.name);n++;
   const f=a.files[e.name];if(f.tag)assert.deepEqual(got,f.data,a.key+' '+e.name);}}
 assert.equal(n,252);
});

const SJA=';【第一話】\r\n$L_BG,b\\bg01,0\r\n$VOICE,v\\kir0001,0,0,0\r\n【霧子】\r\n「おはよう」\r\n朝の光が差し込む。\r\n\r\n①ありがとう①\r\n';
test('a keyed *_T.WAR in a game folder is read here: no GARbro job, lines as from WARC 1.1',t=>{
 const game=tmp(t),cache=tmp(t),prev=process.env.MEGULIT_GARBRO_CACHE;process.env.MEGULIT_GARBRO_CACHE=cache;t.after(()=>{if(prev===undefined)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=prev;});
 const s=all().byName.get('Shojo Mama'),text=F.sjis(SJA);
 F.writeTree(game,{'SHOJOMAMA.EXE':'MZ','SM_T.WAR':F.warcEncrypted({'S001.TXT':{data:Buffer.concat([text,Buffer.from(';'+'x'.repeat(0x500)+'\r\n')]),tag:'YPK'},'S002.TXT':{data:F.sjis('二話目の始まり。\r\n'),tag:'YLZ'}},{version:7,scheme:s})});
 assert.equal(scenes.detect(game),'shiinario');
 const own=scenes.read('shiinario',game);assert.deepEqual(own.map(x=>x.name),['SM_T.WAR/S001.TXT','SM_T.WAR/S002.TXT']);
 assert.deepEqual(own[0].lines,['霧子','「おはよう」','朝の光が差し込む。','①ありがとう①']);assert.deepEqual(own[1].lines,['二話目の始まり。']);
 assert.deepEqual(fs.readdirSync(cache),[]);
 /* a 1.6 archive with no .exe beside it: found by trying every scheme (titles with the very same keys, as Ao no Juuai and
    "ShiinaRio v2.34 and older", read alike) */
 const other=tmp(t);F.writeTree(other,{'X_T.WAR':F.warcEncrypted({'S001.TXT':{data:Buffer.concat([text,Buffer.from(';'+'y'.repeat(0x500)+'\r\n')]),tag:'YPK'}},{version:6,scheme:all().byName.get('Intruder')})});
 assert.equal(shiina.open(path.join(other,'X_T.WAR')).scheme,'Intruder');assert.equal(scenes.read('shiinario',other)[0].lines[1],'「おはよう」');
});

test('an adapter pack brings a title GARbro 1.5.44 does not know (params warc-scheme), shipped data named by "@" / Common',t=>{
 const packs=require('../services/adapter-packs.cjs'),orig=packs.params;t.after(()=>{packs.params=orig;});
 const tail=W.gen(77,5000),key=W.gen(78,64),value={Name:'New Title',OriginalTitle:'新作',Version:2500,EntryNameSize:32,CryptKey:key.toString('hex'),
  HelperKey:['0x12345678','0x9ABCDEF0','0x0','0x0','0x0'],Region:'@Region1',DecodeBin:'@DecodeBin1',
  ShiinaImage:{Common:'Image2',CommonLength:33438,Tail:tail.toString('base64')},ExtraCrypt:{$type:'MakiFesCrypt',Seed:123456789,DecodeTable:'@DecodeTable2'},GameMap:['NEWGAME.exe']};
 const scheme=C.loadSchemes(JSON_SCHEMES).parse(value),game=tmp(t),war=path.join(game,'NG_T.WAR');
 fs.writeFileSync(war,F.warcEncrypted({'S001.TXT':{data:Buffer.concat([F.sjis(SJA),Buffer.from(';'+'z'.repeat(0x500)+'\r\n')]),tag:'YPK'}},{version:7,scheme}));
 packs.params=()=>[];assert.equal(shiina.open(war),null);
 const list=[{value,pack:'t'}];packs.params=target=>target==='warc-scheme'?list:[];fs.utimesSync(war,new Date(),new Date(Date.now()+5000));
 assert.equal(shiina.open(war).scheme,'New Title');assert.equal(scenes.read('shiinario',game)[0].lines[0],'霧子');
 assert.ok(shiina.candidates(path.join(game,'x')).list.length>=128);
 assert.ok(packs.CAPABILITIES.includes('params:warc-scheme'));
 const schema=require('../docs/adapter-pack.schema.json');assert.ok(JSON.stringify(schema).includes('"warc-scheme"'));assert.ok(JSON.stringify(schema).includes('"params:warc-scheme"'));
});
