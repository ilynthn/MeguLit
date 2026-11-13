'use strict';
/* E585–E591 Tmr-Hiro, NekoSDK, Ikura GDL, ExHIBIT, EAGLS (record-stream family) and Seraph, Interheart FPK (archive layer + generic
   scan): readers built from public specs on the shared kit, tested on synthetic game folders (validation/helpers/engine-fixtures-e.cjs).
   Each builds a Japanese game and a Chinese (GBK) patch and checks 1:1 pairing. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-e.cjs')};
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
const E=n=>require('../services/original-engines/'+n+'.cjs');
const tmr=E('tmrhiro'),neko=E('nekosdk'),ikura=E('ikura'),exhibit=E('exhibit'),eagls=E('eagls'),seraph=E('seraph'),inter=E('interheart');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e585-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const pairs=(own,zh)=>{assert.equal(zh.length,own.length);return own.map((o,i)=>[o,zh[i]]);};

/* ---- Tmr-Hiro ------------------------------------------------------------------------------------------------- */
const tmrScript=(enc,L)=>F.srp([F.HEADER,F.tmrMsg(L[0],{enc,name:L[1]}),F.tmrMsg(L[2],{enc}),F.tmrChoice([[L[3],'lbl_a'],[L[4],'lbl_b']],enc),F.tmrMsg(L[5],{enc,name:L[1],voice:'v001'})]);
const TJA=['「おはよう」\\n朝の光が差し込む。','ひなた','静かな午後だった。','教室へ行く','屋上へ行く','ありがとう。'],TZH=['“早上好”\\n晨光照了进来。','向日葵','那是个安静的午后。','去教室','去屋顶','谢谢。'];
test('Tmr-Hiro: srp.pac index (v1 u32 and v2 i64 offsets), nibble-swapped records, "name,text" / choices in order',t=>{
 const ja=tmrScript(F.sjis,TJA);
 const d=tmp(t);for(const version of [1,2]){const f=path.join(d,'srp'+version+'.pac');fs.writeFileSync(f,F.tmrPac({'s001':ja,'s002':tmrScript(F.sjis,['別の話。','ひなた','本当に？','はい','いいえ','ええ。'])},{version}));
  const l=tmr.list(f);assert.deepEqual(l.map(e=>e.name),['s001.srp','s002.srp']);}
 const game=tmp(t);fs.writeFileSync(path.join(game,'srp.pac'),F.tmrPac({'s001':ja},{version:1}));fs.writeFileSync(path.join(game,'grd.pac'),Buffer.alloc(64,1));
 assert.equal(library.engineOf(game)?.name,'Tmr-Hiro ADV');assert.equal(scenes.detect(game),'tmrhiro');
 const own=scenes.read('tmrhiro',game);assert.equal(own.length,1);
 assert.deepEqual(own[0].lines,['ひなた','「おはよう」\n朝の光が差し込む。','静かな午後だった。','教室へ行く','屋上へ行く','ひなた','ありがとう。']);
 const patch=tmp(t);fs.mkdirSync(path.join(patch,'srp'));fs.writeFileSync(path.join(patch,'srp','s001.srp'),tmrScript(F.gbk,TZH));
 const zh=scenes.ENGINES.tmrhiro.archives(patch).map(s=>tmr.parse(s.read()));assert.equal(zh.length,1);
 pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[0],'向日葵');assert.equal(zh[0].lines[3],'去教室');
 assert.deepEqual(tmr.parse(Buffer.alloc(40,7)).lines,[]);
});

/* ---- NekoSDK -------------------------------------------------------------------------------------------------- */
const NJA=[{name:'ひなた',say:'「おはよう」\r\n朝の光が差し込む。'},{say:'静かな午後だった。'},{name:'ひなた',say:'ありがとう。'}],NZH=[{name:'向日葵',say:'“早上好”\r\n晨光照了进来。'},{say:'那是个安静的午后。'},{name:'向日葵',say:'谢谢。'}];
test('NekoSDK: NEKOPACK4 .pak (checksum-keyed index, rolling-key zlib members) and the 0xCACACA .dat; ADVSCRIPT2 display commands only',t=>{
 const ja=F.advscript2(NJA),game=tmp(t);
 assert.deepEqual(neko.parse(ja).lines,['ひなた','「おはよう」\n朝の光が差し込む。','静かな午後だった。','ひなた','ありがとう。']);
 assert.deepEqual(neko.parse(F.advscript2(NJA,{nulInLen:false})).lines,neko.parse(ja).lines);
 F.writeTree(game,{'script.pak':F.nekoPak({'a01.txt':ja,'a02.txt':F.advscript2([{say:'二本目。'}]),'bg.png':Buffer.from('PNG')}),'game.exe':'MZ'});
 const l=neko.pakList(path.join(game,'script.pak'));assert.deepEqual(l.map(e=>e.name),['a01.txt','a02.txt','bg.png']);assert.equal(neko.pakRead(path.join(game,'script.pak'),l[0]).toString('hex'),ja.toString('hex'));
 assert.equal(library.engineOf(game)?.name,'NekoSDK');assert.equal(scenes.detect(game),'nekosdk');
 const own=scenes.read('nekosdk',game);assert.deepEqual(own.map(s=>s.name),['a01.txt','a02.txt']);assert.equal(own[0].lines.length,5);
 /* the .dat flavour, one entry LZSS-packed */
 const g2=tmp(t);F.writeTree(g2,{'data.dat':F.nekoDat({'a01.txt':ja,'a02.txt':F.advscript2([{say:'二本目。'}])},{packed:['a02.txt']}),'game.exe':'MZ'});
 assert.equal(library.engineOf(g2)?.name,'NekoSDK');const own2=scenes.read('nekosdk',g2);assert.deepEqual(own2.map(s=>s.lines.length),[5,1]);
 /* a GBK patch: loose .txt next to the game */
 const patch=tmp(t);F.writeTree(patch,{'a01.txt':F.advscript2(NZH,{enc:F.gbk})});
 const zh=scenes.ENGINES.nekosdk.archives(patch).map(s=>neko.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[0],'向日葵');
});

/* ---- Ikura GDL ------------------------------------------------------------------------------------------------ */
const IJA=['「おはよう」と彼女は言った。','静かな午後だった。','ありがとう。'],IZH=['“早上好”她说。','那是个安静的午后。','谢谢。'];
const isfOf=(enc,L,o)=>F.isf([[0x01,Buffer.from([1,0])],F.pm(L[0],{enc,name:3,voice:'v001'}),[0x84,Buffer.from([0,0,0,0])],F.pm(L[1],{enc}),F.pm(L[2],{enc})],o);
test('Ikura GDL: SM2MPX10 and DRS archives, ISF version transforms, PM 0xFF text lines in order; SECRETFILTER titles are reported',t=>{
 for(const version of [0x9795,0xd197,0xce89])assert.deepEqual(ikura.parse(isfOf(F.sjis,IJA,{version})).lines,IJA,'version '+version.toString(16));
 /* a record over 127 bytes uses the two-byte length */
 assert.equal(ikura.parse(F.isf([F.pm('あ'.repeat(90))])).lines[0],'あ'.repeat(90));
 const game=tmp(t);F.writeTree(game,{SCR:F.mpx({'s001.isf':isfOf(F.sjis,IJA),'bg.bin':Buffer.alloc(40,3)}),OLD:F.drs({'S002.ISF':isfOf(F.sjis,IJA),'X.BIN':Buffer.alloc(30)}),'game.exe':'MZ'});
 assert.equal(library.engineOf(game)?.name,'Ikura GDL');assert.equal(scenes.detect(game),'ikura');
 const own=scenes.read('ikura',game);assert.deepEqual(own.map(s=>s.name),['s001.isf','s002.isf']);assert.deepEqual(own[0].lines,IJA);assert.deepEqual(own[1].lines,IJA);
 const patch=tmp(t);F.writeTree(patch,{'s001.isf':isfOf(F.gbk,IZH)});
 const zh=scenes.ENGINES.ikura.archives(patch).map(s=>ikura.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[2],'谢谢。');
 const locked=tmp(t);F.writeTree(locked,{SCR:F.mpx({'s001.isf':isfOf(F.sjis,IJA,{secret:true})}),'game.exe':'MZ'});
 assert.equal(scenes.detect(locked),null);assert.equal(scenes.unsupportedReason(locked)?.code,'IKURA_SECRET');
});

/* ---- ExHIBIT -------------------------------------------------------------------------------------------------- */
const rldOf=(enc,L,o)=>F.rld([F.rldSay('記述',L[0],enc),F.rldSay('ひなた',L[1],enc),{op:0x0c,ints:[],strs:[enc('1 第一章')]},F.rldChoice([L[2],L[3]],enc),F.rldSay('*',L[4],enc)],{...o,enc});
const RJA=['「おはよう」\n朝の光。','《漢字:かんじ》を読む。','教室へ行く','屋上へ行く','ありがとう。'],RZH=['“早上好”\n晨光。','读《汉字:かんじ》。','去教室','去屋顶','谢谢。'];
test('ExHIBIT: rld instruction words, plain and seed-encrypted scripts, speaker + line + choices in order, unknown seeds reported',t=>{
 const plain=exhibit.parse(rldOf(F.sjis,RJA,{}));
 assert.deepEqual(plain.lines,['記述','「おはよう」\n朝の光。','ひなた','漢字を読む。','教室へ行く','屋上へ行く','ありがとう。']);
 assert.deepEqual(exhibit.parse(rldOf(F.sjis,RJA,{seed:0xAD2B78EA})).lines,plain.lines);
 assert.deepEqual(exhibit.parse(rldOf(F.sjis,RJA,{seed:0x2A17122A})).lines,plain.lines);
 assert.deepEqual(exhibit.parse(Buffer.from('\0DLRxxxxnot a script at all........')).lines,[]);
 const game=tmp(t);F.writeTree(game,{'rld/rld001.rld':rldOf(F.sjis,RJA,{}),'rld/rld002.rld':rldOf(F.sjis,RJA,{seed:0xC9E849B1}),'game.exe':'MZ'});
 assert.equal(library.engineOf(game)?.name,'ExHIBIT');assert.equal(scenes.detect(game),'exhibit');
 const own=scenes.read('exhibit',game);assert.deepEqual(own.map(s=>s.lines.length),[7,7]);
 const patch=tmp(t);F.writeTree(patch,{'rld001.rld':rldOf(F.gbk,RZH,{})});
 const zh=scenes.ENGINES.exhibit.archives(patch).map(s=>exhibit.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[4],'去教室');
 const locked=tmp(t);F.writeTree(locked,{'rld/rld001.rld':rldOf(F.sjis,RJA,{seed:0x13572468}),'game.exe':'MZ'});
 assert.equal(scenes.detect(locked),null);assert.equal(scenes.unsupportedReason(locked)?.code,'EXHIBIT_SEED');
});

/* ---- EAGLS ---------------------------------------------------------------------------------------------------- */
const AJA=['$start','#ひなた','&1"「おはよう」"','"朝の光が差し込む。"','Set(1,"abc")','"静かな午後だった。"'],AZH=['$start','#向日葵','&1"“早上好”"','"晨光照了进来。"','Set(1,"abc")','"那是个安静的午后。"'];
test('EAGLS: SCPACK.idx (stock key, a solved custom key, long entries), every-second-byte EAGLS_SYSTEM data cipher, #speaker and quoted literals',t=>{
 const ja=F.eaglsDat(AJA);
 assert.deepEqual(eagls.parse(ja).lines,['ひなた','「おはよう」','朝の光が差し込む。','静かな午後だった。']);
 assert.deepEqual(eagls.parse(F.eaglsDat(AJA,{encrypt:false})).lines,eagls.parse(ja).lines);
 assert.deepEqual(eagls.parse(Buffer.alloc(4000)).lines,[]);
 for(const [label,opts] of [['stock key',{}],['custom key',{key:'my-own-key-123!'}],['long entries',{long:true}]]){
  const game=tmp(t),{pak,idx}=F.scpack({'a001.dat':ja,'a002.dat':F.eaglsDat(['"二本目だよ。"']),'c001.gr':Buffer.from('BM..')},opts);
  F.writeTree(game,{'Script/SCPACK.pak':pak,'Script/SCPACK.idx':idx,'game.exe':'MZ'});
  const l=eagls.list(path.join(game,'Script','SCPACK.pak'));assert.deepEqual(l.map(e=>e.name),['a001.dat','a002.dat','c001.gr'],label);
  assert.equal(library.engineOf(game)?.name,'EAGLS');assert.equal(scenes.detect(game),'eagls',label);
  const own=scenes.read('eagls',game);assert.deepEqual(own.map(s=>s.lines.length),[4,1],label);
 }
 const game=tmp(t),{pak,idx}=F.scpack({'a001.dat':ja});F.writeTree(game,{'Script/SCPACK.pak':pak,'Script/SCPACK.idx':idx});
 const patch=tmp(t);F.writeTree(patch,{'Script/a001.dat':F.eaglsDat(AZH,{enc:F.gbk})});
 const own=scenes.read('eagls',game)[0],zh=scenes.ENGINES.eagls.archives(patch).map(s=>eagls.parse(s.read()));pairs(own.lines,zh[0].lines);assert.equal(zh[0].lines[0],'向日葵');assert.equal(zh[0].lines[3],'那是个安静的午后。');
});

/* ---- Seraph --------------------------------------------------------------------------------------------------- */
const SJA=['「おはよう」と彼女は言った。','静かな午後だった。','窓の外では雨が降っている。','ありがとう、本当に。'],SZH=['“早上好”她说。','那是个安静的午后。','窗外正下着雨。','谢谢，真的。'];
const sText=(enc,L)=>enc(L.join('\r\n')+'\r\n');
test('Seraph: ScnPac.dat offset table, stored / LZ / zlib entries, generic scan of the unpacked scripts (archive layer only)',t=>{
 const e0=sText(F.sjis,SJA),e1=F.lzPack(sText(F.sjis,SJA)),e2=Buffer.concat([Buffer.from([1,0,0,0]),require('node:zlib').deflateSync(sText(F.sjis,SJA))]);
 const game=tmp(t);F.writeTree(game,{'ScnPac.dat':F.scnpac([e0,e1,e2]),'ArchPac.dat':Buffer.alloc(32),'Voice0.dat':Buffer.alloc(32),'game.exe':'MZ'});
 assert.equal(library.engineOf(game)?.name,'Seraph');assert.equal(scenes.detect(game),'seraph');
 const own=scenes.read('seraph',game);assert.equal(own.length,3);for(const s of own)assert.deepEqual(s.lines,SJA);
 assert.deepEqual(seraph.list(path.join(game,'ScnPac.dat')).map(e=>e.name),['00000','00001','00002']);
 const patch=tmp(t);F.writeTree(patch,{'ScnPac.dat':F.scnpac([sText(F.gbk,SZH)])});
 const zh=scenes.ENGINES.seraph.archives(patch).map(s=>scenes.ENGINES.seraph.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[3],'谢谢，真的。');
});

/* ---- Interheart FPK ------------------------------------------------------------------------------------------- */
test('Interheart FPK: plain index (0x10 names), encrypted tail index, FPK 2.00, ZLC2 payloads; generic scan of the scripts (archive layer only)',t=>{
 const text=sText(F.sjis,SJA),packed=F.zlc2(text);
 const files={'s001.scr':packed,'s002.spt':text,'a.ogg':Buffer.from('OggS')};
 for(const [label,build] of [['plain',()=>F.fpk(files)],['long names',()=>F.fpk(files,{nameSize:0x18})],['encrypted',()=>F.fpk(files,{encrypted:true})],['2.00',()=>F.fpk2(files)]]){
  const game=tmp(t);F.writeTree(game,{'script.fpk':build(),'game.exe':'MZ'});
  assert.equal(library.engineOf(game)?.name,'Interheart (FPK)',label);assert.equal(scenes.detect(game),'interheart',label);
  const own=scenes.read('interheart',game);assert.deepEqual(own.map(s=>s.name),['s001.scr','s002.spt'],label);for(const s of own)assert.deepEqual(s.lines,SJA,label);}
 const patch=tmp(t);F.writeTree(patch,{'script.fpk':F.fpk({'s001.scr':F.zlc2(sText(F.gbk,SZH))})});
 const own=[...SJA],zh=scenes.ENGINES.interheart.archives(patch).map(s=>scenes.ENGINES.interheart.parse(s.read()));pairs(own,zh[0].lines);assert.equal(zh[0].lines[1],'那是个安静的午后。');
 /* a ZLC2 reference: "abc" then a copy of 3 bytes from 3 back */
 assert.equal(inter.zlc2(Buffer.concat([Buffer.from('ZLC2','latin1'),Buffer.from([6,0,0,0]),Buffer.from([0x10,0x61,0x62,0x63,0x03,0x00])])).toString('latin1'),'abcabc');
});
