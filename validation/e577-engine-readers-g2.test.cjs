'use strict';
/* E577–E579 NeXAS, Malie, ShiinaRio: readers built from public specs, tested on synthetic game folders
   (validation/helpers/engine-fixtures-g2.cjs). Each builds a Japanese game and a Chinese patch and checks 1:1 pairing.
   The Malie ciphers are also checked against vectors produced by GARbro's own ArcFormats.dll (1.5.44). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-g2.cjs')};
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs'),kit=require('../services/original-engines/kit.cjs');
const nexas=require('../services/original-engines/nexas.cjs'),malie=require('../services/original-engines/malie.cjs'),shiina=require('../services/original-engines/shiinario.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e577-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

test('kit: static Huffman in both bit orders, zstd / zlib by header, a PE resource',()=>{
 const data=Buffer.from('ababcabcdabcde'.repeat(20)+'あ','utf8');
 assert.deepEqual(kit.huffman(F.huffman(data),data.length),data);
 assert.deepEqual(kit.huffman(F.huffman(data,{order:'dword-msb'}),data.length,{order:'dword-msb'}),data);
 assert.deepEqual(kit.unpackAny(require('node:zlib').deflateSync(data)),data);
 if(typeof require('node:zlib').zstdCompressSync==='function')assert.deepEqual(kit.unpackAny(require('node:zlib').zstdCompressSync(data)),data);
 assert.equal(kit.unpackAny(Buffer.from('plain text')),null);
 assert.ok(kit.peResource(process.execPath,16)?.length>0,'node.exe has a version resource');assert.equal(kit.peResource(process.execPath,'EXEC'),null);
});

/* ---- NeXAS ------------------------------------------------------------------------------------------------------ */
const NJA=['','bg01','九条','@vkir0001「おはよう、@r兄@にい@さん」@k','朝の光が差し込む。@n静かな朝だ。','@hKujo_0100105@t0100行こう','教室へ行く','se_door'];
const NZH=['','bg01','九条','@vkir0001“早上好，@r哥@にい@哥”@k','晨光照了进来。@n安静的早晨。','@hKujo_0100105@t0100走吧','去教室','se_door'];
test('NeXAS: .bin string table in the three layouts, @ codes, speakers',()=>{
 const want=['九条','「おはよう、兄さん」','朝の光が差し込む。\n静かな朝だ。','行こう','教室へ行く'];
 for(const layout of ['v1','v2']){const r=nexas.parse(F.nexasBin(NJA,{layout,names:[2]}));assert.deepEqual(r.lines,want,layout);assert.deepEqual(r.anchors,['bg01','se_door']);assert.deepEqual(r.speakers,['九条']);}
 assert.deepEqual(nexas.parse(F.nexasBin(NJA,{layout:'ver',names:[2]})).lines,want);
 assert.deepEqual(nexas.parse(Buffer.from('not a script at all, just some bytes')).lines,[]);
});
test('NeXAS: script.pac (Huffman index, zlib / zstd / plain entries; old index) is recognised, update.pac overrides, a GBK patch pairs',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'script.pac':F.nexasPac({'a01.bin':F.nexasBin(NJA,{names:[2]}),'a02.bin':F.nexasBin(['','二本目のテキストです。'])},{type:4}),
  'update.pac':F.nexasPac({'a02.bin':F.nexasBin(['','更新された二本目です。'])},{type:7,index:'old'}),'thumbnail.pac':F.nexasPac({'t.png':Buffer.from('PNG')},{type:0}),'game.exe':'MZ'});
 F.writeTree(patch,{'script.pac':F.nexasPac({'a01.bin':F.nexasBin(NZH,{names:[2],enc:F.gbk}),'a02.bin':F.nexasBin(['','更新的第二本。'],{enc:F.gbk})},{type:4})});
 assert.equal(library.engineOf(game)?.name,'NeXAS');assert.equal(scenes.detect(game),'nexas');
 const own=scenes.read('nexas',game);assert.deepEqual(own.map(s=>s.name),['a01.bin','a02.bin']);assert.deepEqual(own[1].lines,['更新された二本目です。']);
 const zh=scenes.ENGINES.nexas.archives(patch).map(s=>nexas.parse(s.read()));
 assert.deepEqual(own.map(s=>s.lines.length),zh.map(s=>s.lines.length));assert.equal(zh[0].lines[1],'“早上好，哥哥”');
 /* Softpal's "PAC " archives are not NeXAS */
 const sp=path.join(game,'data.pac');fs.writeFileSync(sp,Buffer.concat([Buffer.from('PAC '),Buffer.alloc(64)]));assert.equal(nexas.list(sp),null);
});

/* ---- Malie ------------------------------------------------------------------------------------------------------ */
test('Malie: Camellia and CFI blocks match GARbro ArcFormats.dll; every exported scheme loads',()=>{
 const mk=()=>{const b=Buffer.alloc(64);for(let i=0;i<64;i++)b[i]=(i*37+11)&255;return b;};
 /* GARbro 1.5.44: new Camellia(key bytes).DecryptBlock(0x1230 + i, buf, i) and new CfiDecryptor(key, rot).DecryptBlock(...) */
 let b=mk();malie.camellia('7675682836697734683241407a412d35')(b,0x1230);
 assert.equal(b.toString('hex'),'c197eb4b0e9da34d5b2b0d0c603bd55e728afc5302455e1cf46c96bba8c3a3fde9fbb4aca3fff81fded7e777d58f0955f4436ff2311e99db5c0c367840f90bfd');
 const k=Buffer.alloc(32);for(let i=0;i<32;i++)k[i]=(0xa0+i*3)&255;b=mk();malie.cfi(k.toString('hex'),[1011250797,943941430,1114191147,1126839654])(b,0x1230);
 assert.equal(b.toString('hex'),'ff8d176cf7f73c7168e5a1346917a0d13b05c3077f472576ad60c9616474b5aca8d8a845465584e52ac0905d3dcb3248aa6330405aca2ce611456e4af47cff10');
 const raw=require('../services/original-engines/malie-schemes.json').schemes;assert.ok(Object.keys(raw).length>=40);assert.equal(malie.schemes().length,Object.keys(raw).length);
});
const MJA=['\x07\x08v_rin0001\0「行こう、\x07\x01兄\nにい\0さん」\x07\x04','朝の光が差し込む。\n静かな朝だ。','\x07\x0c1\0、目を覚ませ。','　'];
const MZH=['\x07\x08v_rin0001\0“走吧，\x07\x01哥\nにい\0哥”\x07\x04','晨光照了进来。\n安静的早晨。','\x07\x0c1\0，醒醒。','　'];
test('Malie: EXEC message table in order, voice / ruby / name codes; header walk and tail search',()=>{
 const want=['「行こう、兄さん」','朝の光が差し込む。\n静かな朝だ。','、目を覚ませ。'];
 assert.deepEqual(malie.parse(F.malieExec(MJA)).lines,want);
 /* a build whose header this reader does not know: the table that ends the file is found anyway */
 assert.deepEqual(malie.parse(Buffer.concat([Buffer.from([9,9,9,9,0,0,0,0x80]),F.malieExec(MJA).subarray(4)])).lines,want);
 assert.deepEqual(malie.parse(Buffer.alloc(100,1)).lines,[]);
});
test('Malie: an encrypted data.dat (LIBP, a known title key) is recognised and read; a plain LIB patch pairs',t=>{
 const schemes=require('../services/original-engines/malie-schemes.json').schemes,[title,s]=Object.entries(schemes).find(([,v])=>v.cipher==='camellia');
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'data/data.dat':F.malieLibp({'system/exec.dat':F.malieExec(MJA),'system/config.txt':Buffer.from('x'),'bg/bg01.mgf':Buffer.alloc(3000,7)},{key:s.key,align:s.align}),'game.exe':'MZ'});
 F.writeTree(patch,{'data/patch.lib':F.malieLib({'exec.dat':F.malieExec(MZH)})});
 assert.equal(malie.index(path.join(game,'data','data.dat')).scheme,title);
 assert.equal(library.engineOf(game)?.name,'Malie');assert.equal(scenes.detect(game),'malie');
 const own=scenes.read('malie',game);assert.equal(own.length,1);assert.equal(own[0].lines[1],'朝の光が差し込む。\n静かな朝だ。');
 const zh=scenes.ENGINES.malie.archives(patch).map(x=>malie.parse(x.read()));assert.equal(zh[0].lines.length,own[0].lines.length);assert.equal(zh[0].lines[0],'“走吧，哥哥”');
 /* a key no scheme knows: the archive is not opened */
 const other=path.join(game,'data','data2.dat');fs.writeFileSync(other,F.malieLibp({'exec.dat':F.malieExec(MJA)},{key:'00112233445566778899aabbccddeeff'}));assert.equal(malie.index(other),null);
});
test('Malie: an adapter pack carries a new title key (params malie-scheme)',t=>{
 const packs=require('../services/adapter-packs.cjs'),key='00112233445566778899aabbccddeeff',orig=packs.params;
 t.after(()=>{packs.params=orig;});const value={title:'New Title',cipher:'camellia',key,align:1024};const list=[{value,pack:'t'}];packs.params=target=>target==='malie-scheme'?list:[];
 const game=tmp(t);F.writeTree(game,{'data.dat':F.malieLibp({'exec.dat':F.malieExec(MJA)},{key,align:1024})});
 assert.equal(malie.index(path.join(game,'data.dat')).scheme,'New Title');assert.equal(scenes.read('malie',game)[0].lines.length,3);
 assert.ok(packs.CAPABILITIES.includes('params:malie-scheme'));
});

/* ---- ShiinaRio -------------------------------------------------------------------------------------------------- */
const SJA=';【第一話】\r\n$L_BG,b\\bg01,0\r\n$VOICE,v\\kir0001,0,0,0\r\n【霧子】\r\n「おはよう」\r\n朝の光が差し込む。\r\n\r\n①ありがとう①\r\n';
const SZH=';【第一話】\r\n$L_BG,b\\bg01,0\r\n$VOICE,v\\kir0001,0,0,0\r\n【雾子】\r\n“早上好”\r\n晨光照了进来。\r\n\r\n①谢谢①\r\n';
test('ShiinaRio: YH1 / YPK / YLZ entries (with and without the KM XOR), scenario TXT grammar',()=>{
 const text=F.sjis(SJA);
 for(const tag of ['YPK','YLZ','YH1'])for(const km of [false,true])assert.deepEqual(shiina.unpackEntry(F.warcEntry(text,tag,{km})),text,tag+(km?' km':''));
 const r=shiina.parse(text);assert.deepEqual(r.lines,['霧子','「おはよう」','朝の光が差し込む。','①ありがとう①']);assert.deepEqual(r.anchors,['$L_BG,b\\bg01,0','$VOICE,v\\kir0001,0,0,0']);
 assert.deepEqual(shiina.parse(Buffer.from([0,1,2,3,4,5,6,7,8,9,1,2,3,4,5,6,7,8])).lines,[]);
});
test('ShiinaRio: WARC 1.1 read here; a keyed WARC goes through the GARbro cache; a GBK patch pairs',t=>{
 const game=tmp(t),patch=tmp(t),cache=tmp(t);const prev=process.env.MEGULIT_GARBRO_CACHE;process.env.MEGULIT_GARBRO_CACHE=cache;t.after(()=>{if(prev===undefined)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=prev;});
 F.writeTree(game,{'GAME_T.WAR':F.warc11({'S001.TXT':F.warcEntry(F.sjis(SJA),'YLZ',{km:true}),'S002.TXT':F.warcEntry(F.sjis('二話目の始まり。\r\n'),'YH1')}),'GAME_S.WAR':F.warc11({'START.SCN':F.warcEntry(Buffer.from([1,0,0x10,0x41,0]),'YPK')}),'GAME.EXE':'MZ'});
 F.writeTree(patch,{'GAME_T.WAR':F.warc11({'S001.TXT':F.warcEntry(F.gbk(SZH),'YPK'),'S002.TXT':F.warcEntry(F.gbk('第二话的开始。\r\n'),'YPK')})});
 assert.equal(library.engineOf(game)?.name,'ShiinaRio');assert.equal(scenes.detect(game),'shiinario');
 const own=scenes.read('shiinario',game);assert.deepEqual(own.map(s=>s.name),['GAME_T.WAR/S001.TXT','GAME_T.WAR/S002.TXT']);
 const zh=scenes.ENGINES.shiinario.archives(patch).map(s=>shiina.parse(s.read()));assert.deepEqual(own.map(s=>s.lines.length),zh.map(s=>s.lines.length));assert.equal(zh[0].lines[1],'“早上好”');
 /* WARC 1.7: GARbro's scheme database opened it before (its done.json in the cache): the TXT it wrote is parsed here */
 const keyed=tmp(t),war=path.join(keyed,'SAGA_T.WAR');fs.writeFileSync(war,F.warcKeyed(7));fs.writeFileSync(path.join(keyed,'SAGA.EXE'),'MZ');
 const garbro=require('../services/original-engines/garbro.cjs'),dir=garbro.cacheDir(war);fs.mkdirSync(path.join(dir,'scn'),{recursive:true});fs.writeFileSync(path.join(dir,'scn','S001.TXT'),F.sjis(SJA));
 fs.writeFileSync(path.join(dir,'done.json'),JSON.stringify({archive:war,files:['scn\\S001.TXT'],version:garbro.version()}));
 assert.equal(shiina.list(war),null);assert.equal(shiina.header(war).version,170);
 const viaGarbro=scenes.read('shiinario',keyed);assert.equal(viaGarbro.length,1);assert.deepEqual(viaGarbro[0].lines,['霧子','「おはよう」','朝の光が差し込む。','①ありがとう①']);
});
