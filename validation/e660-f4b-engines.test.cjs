'use strict';
/* E660–E665 F4b proprietary engines: Circus (adv32) and Whale complete; DDSystem, SystemAoi and KID archive layer + generic
   scan; fingerprints for the engines only GARbro knows. Synthetic game folders (validation/helpers/engine-fixtures-f4b.cjs),
   each a Japanese game plus a Chinese (GBK) patch, paired 1:1. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-f4b.cjs')};
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
const E=n=>require('../services/original-engines/'+n+'.cjs');
const circus=E('circus'),whale=E('whale'),dds=E('ddsystem'),aoi=E('aoi'),kid=E('kid');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e660-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const pairs=(own,zh)=>{assert.equal(zh.length,own.length);return own.map((o,i)=>[o,zh[i]]);};

/* ---- Circus ------------------------------------------------------------------------------------------------------- */
const CJA=[{cmd:'BG01',name:'ことり',say:'「おはよう」'},{say:'朝の｛光／ひかり｝が差し込む。'},{plain:'教室へ行く'},{name:'ことり',say:'ありがとう。'}];
const CZH=[{cmd:'BG01',name:'小鸟',say:'“早上好”'},{say:'晨光照了进来。'},{plain:'去教室'},{name:'小鸟',say:'谢谢。'}];
test('Circus: MES opcode tables (old and head1 == 3 layouts), encrypted text, speaker, ruby; PCK / DAT archives; AdvData fingerprint',t=>{
 for(const newer of [false,true]){const r=circus.parse(F.mes(CJA,{newer}));assert.equal(r.version,'dc3dd');
  assert.deepEqual(r.lines,['ことり','「おはよう」','朝の光が差し込む。','教室へ行く','ことり','ありがとう。']);assert.deepEqual(r.ruby[2],[['光','ひかり']]);assert.ok(r.anchors.includes('BG01'));}
 assert.equal(circus.header(Buffer.alloc(40,7)),null);assert.deepEqual(circus.parse(Buffer.alloc(40,7)).lines,[]);
 const ja=F.mes(CJA),d=tmp(t);
 fs.writeFileSync(path.join(d,'a.pck'),F.pck({'s001.mes':ja,'s002.mes':F.mes([{say:'二本目。'}])}));assert.deepEqual(circus.pckList(path.join(d,'a.pck')).map(e=>e.name),['s001.mes','s002.mes']);
 for(const nl of [0x24,0x30,0x3c]){fs.writeFileSync(path.join(d,'b.dat'),F.circusDat({'s001.mes':ja,'s002.mes':F.mes([{say:'二本目。'}])},nl));assert.deepEqual(circus.datList(path.join(d,'b.dat')).map(e=>e.name),['s001.mes','s002.mes'],'name length '+nl);}
 const game=tmp(t);F.writeTree(game,{'AdvData/MES.pck':F.pck({'s001.mes':ja,'s002.mes':F.mes([{say:'二本目。'}])}),'AdvData/GRP.pck':F.pck({'bg01.crx':Buffer.from('CRXG')}),'dc3.exe':'MZ'});
 assert.equal(library.engineOf(game)?.name,'Circus (adv32)');assert.equal(scenes.detect(game),'circus');
 const own=scenes.read('circus',game);assert.deepEqual(own.map(s=>s.name),['s001.mes','s002.mes']);assert.equal(own[0].lines.length,6);
 /* loose AdvData\MES\*.mes is found too */
 const g2=tmp(t);F.writeTree(g2,{'AdvData/MES/s001.mes':ja,'game.exe':'MZ'});assert.equal(library.engineOf(g2)?.name,'Circus (adv32)');assert.equal(scenes.read('circus',g2)[0].lines.length,6);
 const patch=tmp(t);F.writeTree(patch,{'AdvData/MES/s001.mes':F.mes(CZH,{enc:F.gbk})});
 const zh=scenes.ENGINES.circus.archives(patch).map(s=>circus.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[0],'小鸟');assert.equal(zh[0].lines[3],'去教室');
});

/* ---- Whale -------------------------------------------------------------------------------------------------------- */
const WJA=['ひなた','おはよう、朝だよ。','静かな午後だった。[n]風が吹く。','電話が鳴る。','教室へ行く','屋上へ行く','どうしよう'];
const WZH=['向日葵','早上好，天亮了。','那是个安静的午后。[n]风吹过。','电话响了。','去教室','去屋顶','怎么办'];
test('Whale: hashed .dat index, script key recovered from the zlib stream, 【name】「text」 / SELECT / MS.HS grammar',t=>{
 const want=['ひなた','おはよう、朝だよ。','静かな午後だった。\n風が吹く。','電話が鳴る。','教室へ行く','屋上へ行く','（どうしよう）'];
 assert.deepEqual(whale.parse(F.whaleScript(WJA)).lines,want);
 const game=tmp(t);F.writeTree(game,{'script.dat':F.whaleDat([F.whaleScript(WJA),F.whaleScript(['ひなた','二本目。','終わり。','電話。','はい','いいえ','うん'])]),'graph.dat':F.whaleDat([],{extra:4}),'game.exe':'MZ'});
 const l=whale.list(path.join(game,'script.dat'));assert.deepEqual(l.map(e=>e.type),[1,1,2,2]);
 assert.equal(library.engineOf(game)?.name,'Whale');assert.equal(scenes.detect(game),'whale');
 const own=scenes.read('whale',game);assert.deepEqual(own.map(s=>s.name),['0002.txt','0003.txt']);assert.deepEqual(own[0].lines,want);
 /* a patched archive (another title key) pairs by entry order */
 const patch=tmp(t);F.writeTree(patch,{'script.dat':F.whaleDat([F.whaleScript(WZH,F.gbk),F.whaleScript(['向日葵','第二个。','结束。','电话。','是','否','嗯'],F.gbk)],{K:0x0badf00d})});
 const zh=scenes.ENGINES.whale.archives(patch).map(s=>whale.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[1],'早上好，天亮了。');
});

/* ---- generic-scan readers ----------------------------------------------------------------------------------------- */
const GJA=['「おはよう」と彼女は言った。','静かな午後だった。','ありがとう。'],GZH=['“早上好”她说。','那是个安静的午后。','谢谢。'];
test('DDSystem: DDP2 index, SHS-packed and stored entries, HXB key from the length; DDSx scripts only, generic scan',t=>{
 const plain=F.body(GJA);assert.deepEqual(dds.shs(F.shsLiteral(plain),plain.length),plain);
 const h=F.hxb(plain);assert.deepEqual(dds.decryptHxb(h).subarray(0x10),plain);
 /* a back reference: "ab" then copy 6 at distance 2 */
 assert.equal(dds.shs(Buffer.from([1,0x61,0x62,0x80|(3<<5),1]),8).toString('latin1'),'ababab'+'ab');
 const game=tmp(t);F.writeTree(game,{'data.dat':F.ddp2([{data:Buffer.from('TGA.....'),pack:false},{data:F.hxb(F.body(GJA)),pack:true},{data:F.hxb(F.body(['二本目です。'])),pack:false}]),'game.exe':'MZ'});
 assert.equal(library.engineOf(game)?.name,'DDSystem');assert.equal(scenes.detect(game),'ddsystem');
 const own=scenes.read('ddsystem',game);assert.deepEqual(own.map(s=>s.name),['data#00001','data#00002']);assert.deepEqual(own[0].lines,GJA);
 const patch=tmp(t);F.writeTree(patch,{'data.dat':F.ddp2([{data:Buffer.from('TGA.....')},{data:F.hxb(F.body(GZH,F.gbk)),pack:true},{data:F.hxb(F.body(['第二个。'],F.gbk))}])});
 const zh=scenes.ENGINES.ddsystem.archives(patch).map(s=>scenes.ENGINES.ddsystem.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[2],'谢谢。');
});
test('SystemAoi: AOIB .box (version XOR), AOIMY offset key; generic scan',t=>{
 for(const o of [0,1,0x37,0x123456,0xfedcba98])assert.ok(aoi.keyAt(o)>=0&&aoi.keyAt(o)<256);
 const game=tmp(t);F.writeTree(game,{'script.box':F.aoiBox({'s001':F.body(GJA),'s002':F.body(['二本目です。'])}),'game.exe':'MZ'});
 assert.deepEqual(aoi.list(path.join(game,'script.box')).map(e=>e.name),['s001','s002']);
 assert.equal(library.engineOf(game)?.name,'SystemAoi');assert.equal(scenes.detect(game),'aoi');
 const own=scenes.read('aoi',game);assert.deepEqual(own[0].lines,GJA);
 const patch=tmp(t);F.writeTree(patch,{'script.box':F.aoiBox({'s001':F.body(GZH,F.gbk),'s002':F.body(['第二个。'],F.gbk)})});
 const zh=scenes.ENGINES.aoi.archives(patch).map(s=>scenes.ENGINES.aoi.parse(s.read()));pairs(own[0].lines,zh[0].lines);
});
test('KID: LNK script.dat, lnd-packed entries; generic scan',t=>{
 const plain=F.body(GJA);assert.deepEqual(kid.lnd(F.lndPack(plain),plain.length,0x10),plain);
 assert.equal(kid.lnd(Buffer.from([0xc0|3,0x41]),5).toString('latin1'),'AAAAA');
 const game=tmp(t);F.writeTree(game,{'script.dat':F.lnk({'s001.scr':F.body(GJA),'s002.scr':F.body(['二本目です。']),'bg.cps':Buffer.from('CPS')},{pack:['s001.scr']}),'game.exe':'MZ'});
 assert.equal(library.engineOf(game)?.name,'KID Engine');assert.equal(scenes.detect(game),'kid');
 const own=scenes.read('kid',game);assert.deepEqual(own.map(s=>s.name),['s001.scr','s002.scr']);assert.deepEqual(own[0].lines,GJA);
 const patch=tmp(t);F.writeTree(patch,{'script.dat':F.lnk({'s001.scr':F.body(GZH,F.gbk),'s002.scr':F.body(['第二个。'],F.gbk)})});
 const zh=scenes.ENGINES.kid.archives(patch).map(s=>scenes.ENGINES.kid.parse(s.read()));pairs(own[0].lines,zh[0].lines);
});

/* ---- fingerprints only ------------------------------------------------------------------------------------------ */
test('F4b fingerprints: engines named from their GARbro archive signatures',t=>{
 const cases=[['AZ System',{'data.arc':'ARC\x1a....'}],['A98SYS (Active Soft)',{'data.pak':'ADPACK32....'}],['ARCGameEngine (Eushully)',{'sys4ini.bin':'S4IC','GRP.alf':'x'}],
  ['FW-EDITOR (Frontwing)',{'data.bin':'LIB_PACKDATA0000....'}],['F&C (ADVWin32 / ADVWIN / AGSI)',{'mc.mrg':'MRG\0....'}],['GSD',{'data.bin':'LSDARC V.100'}],
  ['BlueGale',{'data.snn':'x','data.inx':'x'}],['CRIware (CPK / AFS)',{'data.cpk':'CPK ....'}]];
 for(const [name,files] of cases){const g=tmp(t);const tree={'game.exe':'MZ'};for(const [k,v] of Object.entries(files))tree[k]=Buffer.from(v,'latin1');F.writeTree(g,tree);assert.equal(library.engineOf(g)?.name,name);}
 /* a folder of unrelated .dat files is none of them */
 const g=tmp(t);F.writeTree(g,{'game.exe':'MZ','data.dat':Buffer.alloc(200,0x33),'other.dat':Buffer.alloc(300,0x10)});const n=library.engineOf(g)?.name;
 assert.ok(!['Whale','DDSystem','KID Engine','Circus (adv32)'].includes(n),n);
});
