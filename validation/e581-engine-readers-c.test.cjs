'use strict';
/* E581–E584 QLIE, Entis GLS, AliceSoft System 3.x, Marble: readers built from public specs, tested on synthetic game
   folders (validation/helpers/engine-fixtures-c.cjs). Each builds a Japanese game and a Chinese patch and checks 1:1
   pairing, plus the per-title key paths (exe resources, key files, recovered keys). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-c.cjs')};
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs'),kit=require('../services/original-engines/kit.cjs');
const qlie=require('../services/original-engines/qlie.cjs'),entis=require('../services/original-engines/entis.cjs'),alice=require('../services/original-engines/alicesoft.cjs'),marble=require('../services/original-engines/marble.cjs');
const garbro=require('../services/original-engines/garbro.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e580-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

/* ---- kit additions ------------------------------------------------------------------------------------------------------ */
test('kit: peResource finds RCDATA by name and number, encodeSjis inverts the decoder, xorKeyByColumns recovers a key',t=>{
 const dir=tmp(t),exe=path.join(dir,'game.exe'),bad=path.join(dir,'bad.exe');
 fs.writeFileSync(exe,F.pe([{type:10,name:'RESKEY',data:Buffer.from('secret-key')},{type:10,name:7,data:Buffer.from('seven')},{type:'TEXT',name:'ABOUT',data:Buffer.from('hi')}]));fs.writeFileSync(bad,'nope');
 assert.equal(kit.peResource(exe,10,'RESKEY').toString(),'secret-key');assert.equal(kit.peResource(exe,10,'reskey').toString(),'secret-key');
 assert.equal(kit.peResource(exe,10,7).toString(),'seven');assert.equal(kit.peResource(exe,'TEXT','ABOUT').toString(),'hi');assert.equal(kit.peResource(exe,10,'NONE'),null);assert.equal(kit.peResource(bad,10,1),null);
 assert.equal(new TextDecoder('shift_jis').decode(kit.encodeSjis('女教師ゆうこ1968')),'女教師ゆうこ1968');assert.equal(kit.encodeSjis('\u{1F600}'),null);
 const plain=F.marbleScript(Array.from({length:120},(_,i)=>['@bg'+i,'>ミナ','「今日はとても静かな朝だね。」','窓の外では小鳥が鳴いている。','そう言って彼女は笑った。'][i%5]));
 const key=kit.encodeSjis('秘密の鍵-0101');const c=kit.xorKeyByColumns(kit.xor(plain,key));assert.equal(c[0].period,key.length);assert.deepEqual(c[0].key,key);
});

// The fixture has one type, one name and one language, each at the first entry of its directory.
function resourceLeaf(rsrc){
 const first=dir=>rsrc.readUInt32LE(dir+20)&0x7fffffff;
 return first(first(first(0)));
}

test('kit: peResource reads a directory inside a section and data before the directory',t=>{
 const exe=path.join(tmp(t),'merged-resource.exe'),data=Buffer.from('resource before the directory');
 const original=F.pe([{type:'TEXT',name:'ABOUT',data}]),opt=0x40+24,sec=opt+224;
 const raw=0x200,va=0x1000,rootOffset=0x100,dataOffset=0x20;
 const image=Buffer.concat([original.subarray(0,raw),Buffer.alloc(0x400)]);
 original.copy(image,raw+rootOffset,raw);
 image.writeUInt32LE(va+rootOffset,opt+96+16);
 image.write('.rdata',sec,'latin1');image.writeUInt32LE(0x400,sec+8);image.writeUInt32LE(0x400,sec+16);
 const rsrc=image.subarray(raw+rootOffset);
 rsrc.writeUInt32LE(va+dataOffset,resourceLeaf(rsrc));data.copy(image,raw+dataOffset);
 fs.writeFileSync(exe,image);
 assert.deepEqual(kit.peResource(exe,'text','about'),data);
 assert.deepEqual(kit.peResource(exe,'TEXT'),data);
});

test('kit: peResource maps a payload RVA through the section table',t=>{
 const exe=path.join(tmp(t),'split-resource.exe'),data=Buffer.from('resource in the data section');
 const original=F.pe([{type:10,name:7,data}]),opt=0x40+24,sec=opt+224+40;
 const dataVa=0x3000,dataOffset=0x24,raw=original.length;
 const image=Buffer.concat([original,Buffer.alloc(0x200)]);
 image.writeUInt16LE(2,0x40+6);image.writeUInt32LE(0x4000,opt+56);
 image.write('.data',sec,'latin1');image.writeUInt32LE(dataOffset+data.length,sec+8);
 image.writeUInt32LE(dataVa,sec+12);image.writeUInt32LE(0x200,sec+16);image.writeUInt32LE(raw,sec+20);
 image.writeUInt32LE(0x40000040,sec+36);
 const rsrc=image.subarray(0x200,raw);
 rsrc.writeUInt32LE(dataVa+dataOffset,resourceLeaf(rsrc));data.copy(image,raw+dataOffset);
 fs.writeFileSync(exe,image);
 assert.deepEqual(kit.peResource(exe,10,7),data);
});

test('kit: peResource keeps the available bytes of a truncated section-start resource',t=>{
 const exe=path.join(tmp(t),'partial-resource.exe'),data=Buffer.from('partly present');
 const image=F.pe([{type:10,name:7,data}]),rsrc=image.subarray(0x200);
 const offset=0x200+rsrc.readUInt32LE(resourceLeaf(rsrc))-0x1000;
 fs.writeFileSync(exe,image.subarray(0,offset+6));
 assert.deepEqual(kit.peResource(exe,10,7),data.subarray(0,6));
});

test('kit: peResource retains the section-start read limit for a large resource section',t=>{
 const exe=path.join(tmp(t),'large-resource.exe'),data=Buffer.from('before and after the read limit');
 const image=F.pe([{type:10,name:7,data}]),opt=0x40+24,sec=opt+224;
 const raw=0x200,va=0x1000,limit=64<<20,offset=limit-6,rawSize=limit+0x200;
 image.writeUInt32LE(va+limit+0x1000,opt+56);image.writeUInt32LE(rawSize,opt+96+20);
 image.writeUInt32LE(rawSize,sec+8);image.writeUInt32LE(rawSize,sec+16);
 const rsrc=image.subarray(raw);
 rsrc.writeUInt32LE(va+offset,resourceLeaf(rsrc));
 const fd=fs.openSync(exe,'w');
 try{fs.writeSync(fd,image);fs.writeSync(fd,data,0,data.length,raw+offset);fs.ftruncateSync(fd,raw+rawSize);}
 finally{fs.closeSync(fd);}
 assert.deepEqual(kit.peResource(exe,10,7),data.subarray(0,6));
});

/* ---- QLIE --------------------------------------------------------------------------------------------------------------- */
const QS=['@bg,file:bg01','^face,ミナ','【ミナ】','「おはよう、[rb,兄,にい]さん」','％voice,v001','ナレーション行[n]二行目','mina,ミナ,「今日はいい天気だね」','^select,学校へ行く,家に帰る','\\wait'].join('\r\n');
const QZ=['@bg,file:bg01','^face,米娜','【米娜】','“早上好，[rb,哥,ge]哥”','％voice,v001','旁白行[n]第二行','mina,米娜,“今天天气真好”','^select,去学校,回家','\\wait'].join('\r\n');
const QL=['「おはよう、兄さん」','ナレーション行\n二行目','「今日はいい天気だね」','学校へ行く','家に帰る'];
test('QLIE: .s grammar (names, name,message lines, choices, ruby, [n]); UTF-16 scripts',()=>{
 const r=qlie.parse(F.sjis(QS));assert.deepEqual(r.lines,QL);assert.ok(r.anchors.includes('【ミナ】'));
 assert.deepEqual(qlie.parse(Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(QS,'utf16le')])).lines,QL);
});
test('QLIE: UTF-16LE BOM is honoured even when a Japanese-only script contains no NUL bytes',t=>{
 const nulFree=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('「二つ目」','utf16le')]);
 assert.equal(nulFree.includes(0),false,'fixture must contain no NUL bytes');
 assert.deepEqual(qlie.parse(nulFree).lines,['「二つ目」']);
 assert.deepEqual(qlie.parse(Buffer.from([0xff,0xfe])),{lines:[],anchors:[]});
 assert.deepEqual(qlie.parse(Buffer.from('「二つ目」\r\n','utf16le')).lines,['「二つ目」']);
 assert.deepEqual(qlie.parse(F.sjis('「二つ目」')).lines,['「二つ目」']);
 assert.deepEqual(qlie.parse(F.gbk('“第二个”')).lines,['“第二个”']);
 const dir=tmp(t);
 F.writeTree(dir,{'GameData/data0.pack':F.qliePack({'s001.s':nulFree},{version:'3.1'}),'game.exe':'MZ'});
 assert.deepEqual(scenes.read('qlie',dir)[0].lines,['「二つ目」']);
 // resolveGameKey() also decodes probe scripts via text(): a 3.0 keyed pack with a NUL-free BOM UTF-16LE script
 const keyFile=Buffer.from(Array.from({length:256},(_,i)=>(i*17+5)&255)),gameKey=Buffer.from(Array.from({length:256},(_,i)=>(i*31+9)&255));
 const kdir=tmp(t);
 const nulFreeKana=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('「おはよう、ございます」','utf16le')]);
 assert.equal(nulFreeKana.includes(0),false);
 F.writeTree(kdir,{'GameData/data0.pack':F.qliePack({'s001.s':nulFreeKana},{version:'3.0',keyFile,gameKey}),'game.exe':F.pe([{type:10,name:'RESKEY',data:keyFile},{type:10,name:'TFORM1',data:F.tform(gameKey)}])});
 assert.deepEqual(scenes.read('qlie',kdir)[0].lines,['「おはよう、ございます」']);
});
test('QLIE: 1PC byte-pair compression',()=>{const p=Buffer.from('xxABxxABAB yy');assert.deepEqual(qlie.unpack(F.qliePc(p)),p);assert.equal(qlie.unpack(Buffer.from('nope')),null);});
for(const version of ['1.0','2.0','3.0','3.1'])test(`QLIE: pack ${version} lists, decrypts and reads (packed entry too)`,t=>{
 const dir=tmp(t);F.writeTree(dir,{'GameData/data0.pack':F.qliePack({'scenario/s001.s':F.sjis(QS),'scenario/s002.s':F.sjis('「二つ目」'),'sys/a.png':Buffer.alloc(40,1)},{version,packed:new Set(['scenario/s002.s'])}),'game.exe':'MZ'});
 const l=qlie.list(path.join(dir,'GameData/data0.pack'));assert.deepEqual(l.map(e=>e.name).sort(),['scenario/s001.s','scenario/s002.s','sys/a.png']);
 const r=scenes.read('qlie',dir);assert.deepEqual(r.map(s=>s.name),['s001.s','s002.s']);assert.deepEqual(r[0].lines,QL);assert.deepEqual(r[1].lines,['「二つ目」']);
});
test('QLIE: 3.0 with key.fkey (Mersenne Twister cipher) and the exe game key from TFORM1; 3.1 with pack_keyfile',t=>{
 const keyFile=Buffer.from(Array.from({length:256},(_,i)=>(i*29+7)&255)),gameKey=Buffer.from(Array.from({length:256},(_,i)=>(i*13+101)&255));
 const a=tmp(t);F.writeTree(a,{'GameData/data0.pack':F.qliePack({'s001.s':F.sjis(QS)},{version:'3.0',keyFile}),'GameData/key.fkey':keyFile,'game.exe':'MZ'});
 assert.deepEqual(scenes.read('qlie',a)[0].lines,QL);
 const b=tmp(t);F.writeTree(b,{'GameData/data0.pack':F.qliePack({'s001.s':F.sjis(QS)},{version:'3.0',keyFile,gameKey}),'game.exe':F.pe([{type:10,name:'RESKEY',data:keyFile},{type:10,name:'TFORM1',data:F.tform(gameKey)}])});
 assert.deepEqual(scenes.read('qlie',b)[0].lines,QL,'key file from RESKEY, game key from IconKeyImage');
 const c=tmp(t);F.writeTree(c,{'GameData/data0.pack':F.qliePack({'s001.s':F.sjis(QS)},{version:'3.1',keyFile,method:2,packKeyfile:Buffer.from(Array.from({length:200},(_,i)=>(i*7+3)&255))}),'GameData/key.fkey':keyFile,'game.exe':'MZ'});
 assert.deepEqual(scenes.read('qlie',c).find(s=>s.name==='s001.s').lines,QL);
});
test('QLIE: a game folder is recognised and read, and a GBK patch pairs 1:1',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'GameData/data0.pack':F.qliePack({'s001.s':F.sjis(QS)},{version:'3.1'}),'GameData/data1.pack':F.qliePack({'bg.png':Buffer.alloc(64)},{version:'3.1'}),'game.exe':'MZ'});
 F.writeTree(patch,{'GameData/data0.pack':F.qliePack({'s001.s':F.gbk(QZ)},{version:'3.1'})});
 assert.equal(library.engineOf(game)?.name,'QLIE');assert.equal(scenes.detect(game),'qlie');
 const ja=scenes.read('qlie',game)[0],zh=qlie.parse(scenes.ENGINES.qlie.archives(patch)[0].read());
 assert.equal(zh.lines.length,ja.lines.length);assert.equal(zh.lines[0],'“早上好，哥哥”');assert.equal(zh.lines[4],'回家');
});
test('QLIE: 3.0 resolveGameKey re-evaluates when qlie-key adapter packs or key.fkey change in the same process',t=>{
 const packs=require('../services/adapter-packs.cjs'),origParams=packs.params;
 t.after(()=>{packs.params=origParams;});
 const keyFile=Buffer.from(Array.from({length:256},(_,i)=>(i*29+7)&255));
 const badKeyFile=Buffer.from(Array.from({length:256},(_,i)=>(i*31+3)&255));
 const keyA=Buffer.from(Array.from({length:256},(_,i)=>(i*17+43)&255));
 const keyB=Buffer.from(Array.from({length:256},(_,i)=>(i*23+89)&255));
 const badExeKey=Buffer.from(Array.from({length:256},(_,i)=>(i*7+19)&255));
 const dir=tmp(t);
 F.writeTree(dir,{
  'GameData/data0.pack':F.qliePack({'s001.s':F.sjis(QS)},{version:'3.0',keyFile,gameKey:keyA}),
  'GameData/key.fkey':keyFile,
  'game.exe':F.pe([{type:10,name:'TFORM1',data:F.tform(badExeKey)}]),
 });
 /* 1. Wrong adapter pack key + wrong exe key fails to decode Japanese */
 packs.params=target=>target==='qlie-key'?[{value:{gameKey:keyB.toString('hex')}}]:[];
 assert.notDeepEqual(scenes.read('qlie',dir)[0].lines,QL);
 /* 2. Replacing the pack (same count = 1) with the right gameKey immediately decodes QL */
 packs.params=target=>target==='qlie-key'?[{value:{gameKey:keyA.toString('hex')}}]:[];
 assert.deepEqual(scenes.read('qlie',dir)[0].lines,QL);
 /* 3. Removing the adapter pack must invalidate the previously adopted ctx.gameKey */
 packs.params=()=>[];
 assert.notDeepEqual(scenes.read('qlie',dir)[0].lines,QL);
 /* 4. Re-adding the right pack decodes QL again */
 packs.params=target=>target==='qlie-key'?[{value:{gameKey:keyA.toString('hex')}}]:[];
 assert.deepEqual(scenes.read('qlie',dir)[0].lines,QL);
 /* 5. Replacing external key.fkey with same-size bytes at a different millisecond within the same second invalidates list() cache */
 const kfPath=path.join(dir,'GameData','key.fkey');
 const tSec=1700000000000;
 fs.utimesSync(kfPath,new Date(tSec+100),new Date(tSec+100));
 assert.deepEqual(scenes.read('qlie',dir)[0].lines,QL);
 fs.writeFileSync(kfPath,badKeyFile);
 fs.utimesSync(kfPath,new Date(tSec+600),new Date(tSec+600));
 assert.notDeepEqual(scenes.read('qlie',dir)[0].lines,QL);
 fs.writeFileSync(kfPath,keyFile);
 fs.utimesSync(kfPath,new Date(tSec+900),new Date(tSec+900));
 assert.deepEqual(scenes.read('qlie',dir)[0].lines,QL);
 /* 6. When adapter-pack fingerprint is unchanged, repeated reads reuse ctx.gameKey without re-scanning exe via kit.peResource */
 const origPe=kit.peResource;
 let peCalls=0;
 kit.peResource=(...a)=>{peCalls++;return origPe(...a);};
 try{
  const samePack=[{value:{gameKey:keyA.toString('hex')}}];
  packs.params=target=>target==='qlie-key'?samePack:[];
  assert.deepEqual(scenes.read('qlie',dir)[0].lines,QL);
  peCalls=0;
  assert.deepEqual(scenes.read('qlie',dir)[0].lines,QL);
  assert.equal(peCalls,0,'cached resolveGameKey should not re-scan exe resources');
 }finally{kit.peResource=origPe;}
 /* 7. Replacing ../DLL/key.fkey relative to GameData/*.pack also invalidates list() cache */
 const dir2=tmp(t);
 F.writeTree(dir2,{
  'GameData/data0.pack':F.qliePack({'s001.s':F.sjis(QS)},{version:'3.0',keyFile,gameKey:keyA}),
  'DLL/key.fkey':keyFile,
  'game.exe':'MZ',
 });
 const dllKf=path.join(dir2,'DLL','key.fkey');
 packs.params=target=>target==='qlie-key'?[{value:{gameKey:keyA.toString('hex')}}]:[];
 fs.utimesSync(dllKf,new Date(tSec+100),new Date(tSec+100));
 assert.deepEqual(scenes.read('qlie',dir2)[0].lines,QL);
 fs.writeFileSync(dllKf,badKeyFile);
 fs.utimesSync(dllKf,new Date(tSec+600),new Date(tSec+600));
 assert.notDeepEqual(scenes.read('qlie',dir2)[0].lines,QL);
 fs.writeFileSync(dllKf,keyFile);
 fs.utimesSync(dllKf,new Date(tSec+900),new Date(tSec+900));
 assert.deepEqual(scenes.read('qlie',dir2)[0].lines,QL);
});

/* ---- Entis -------------------------------------------------------------------------------------------------------------- */
const talk=(name,parts)=>[['s',name],['s','v001'],['call','Talk',2],...parts.flatMap(p=>[['s',p],['call','Mess',1]])];
const CJ=[['call','ClearScreen',0],...talk('ミナ',['「おはよう」','続きの文']),['call','WaitKey',0],...talk('地の文',['静かな朝だった。']),['call','WaitKey',0],
 ['s','学校へ'],['i',0],['call','AddSelect',2],['s','家へ'],['i',1],['call','AddSelect',2],['call','Select',0]];
const CZ=[['call','ClearScreen',0],...talk('米娜',['“早上好”','后续文字']),['call','WaitKey',0],...talk('地の文',['安静的早晨。']),['call','WaitKey',0],
 ['s','去学校'],['i',0],['call','AddSelect',2],['s','回家'],['i',1],['call','AddSelect',2],['call','Select',0]];
const EL=['「おはよう」続きの文','静かな朝だった。','学校へ','家へ'];
test('Entis: Cotopha image lines (Talk / Mess / AddSelect), inline and conststr literals',()=>{
 assert.deepEqual(entis.parse(F.csx(CJ)).lines,EL);assert.deepEqual(entis.parse(F.csx(CJ,{pooled:['「おはよう」','学校へ','Mess']})).lines,EL);
 assert.deepEqual(entis.parse(F.csx(CJ)).anchors,['ミナ','地の文']);assert.deepEqual(entis.parse(Buffer.from('Entis\x1a not an image')).lines,[]);
});
/* ヨスガノソラ / ハルカナソラ: the .noa archives hold only images and sound, the script image is system\yosuga.csx */
test('Entis: a script image in system\\ next to the exe is read',t=>{
 const game=tmp(t);
 F.writeTree(game,{'data1.noa':F.noa({'bg.eri':Buffer.alloc(50)}),'voice.noa':F.noa({'v001.mio':Buffer.alloc(50)}),'system/yosuga.csx':F.csx(CJ),'system/title.noa':F.noa({'title.eri':Buffer.alloc(50)}),'yosuga.exe':'MZ'});
 assert.equal(scenes.detect(game),'entis');
 assert.deepEqual(scenes.read('entis',game).map(s=>[s.name,s.lines]),[['yosuga.csx',EL]]);
});
test('Entis: BSHF round trip, ERISA-N decoder survives arbitrary input',()=>{
 const p=Buffer.from('Entis\x1a'.padEnd(96,'x'));assert.deepEqual(entis.bshf(entis.bshf(p,'pass',true),'pass'),p);assert.notDeepEqual(entis.bshf(p,'pass',true),p);
 for(let s=1;s<6;s++){const junk=Buffer.from(Array.from({length:600},(_,i)=>(i*s*31+s)&255));try{const o=entis.nemesis(junk,256);assert.ok(o.length<=256);}catch(e){assert.match(e.message,/ERISA_N/);}}
});
test('Entis: .noa (folder, BSHF entry, probe password) is recognised and read; a patch pairs 1:1',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'data.noa':F.noa({'script/main.csx':F.csx(CJ),'script/sub.csx':F.csx(talk('ミナ',['二本目']))}),'image.noa':F.noa({'bg.eri':Buffer.alloc(50)}),'game.exe':'MZ'});
 F.writeTree(patch,{'data.noa':F.noa({'script/main.csx':F.csx(CZ),'script/sub.csx':F.csx(talk('米娜',['第二本']))})});
 assert.equal(library.engineOf(game)?.name,'Entis / Cotopha');assert.equal(scenes.detect(game),'entis');
 const ja=scenes.read('entis',game),zh=scenes.ENGINES.entis.archives(patch).map(s=>entis.parse(s.read()));
 assert.deepEqual(ja.map(s=>s.name),['main.csx','sub.csx']);assert.deepEqual(ja[0].lines,EL);assert.equal(zh[0].lines.length,ja[0].lines.length);assert.equal(zh[0].lines[2],'去学校');
 /* BSHF entries need the archive password: listed, unreadable without one, read with the right one */
 const enc=F.noa({'main.csx':F.csx(CJ)},{password:'cotopha',encrypt:new Set(['main.csx'])}),f=path.join(game,'enc.noa');fs.writeFileSync(f,enc);
 const e=entis.listNoa(f)[0];assert.equal(e.code,0x40000000);assert.throws(()=>entis.readNoa(f,e,null),/ENTIS_PASSWORD/);assert.deepEqual(entis.parse(entis.readNoa(f,e,'cotopha')).lines,EL);
});
test('Entis: password probe validates against an encrypted .csx Cotopha header instead of the first binary asset',t=>{
 const packs=require('../services/adapter-packs.cjs'),orig=packs.params;
 t.after(()=>{packs.params=orig;});
 const fakeBin=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(56,0)]);
 const csxBuf=F.csx(CJ);
 /* case 1: first encrypted entry is a binary image (not Entis\x1a and fails plausible); right password still opens main.csx */
 packs.params=target=>target==='entis-key'?[{value:{archive:'data.noa',password:'cotopha'}}]:[];
 const g1=tmp(t);F.writeTree(g1,{'data.noa':F.noa({'aaa.png':fakeBin,'script/main.csx':csxBuf},{password:'cotopha',encrypt:new Set(['aaa.png','script/main.csx'])}),'game.exe':'MZ'});
 assert.deepEqual(scenes.read('entis',g1).map(s=>[s.name,s.lines]),[['main.csx',EL]]);
 /* case 2: wrong password makes the first binary asset look like ASCII text (passing plausible), but csx validation rejects it and picks the real key */
 const decoyPlain=entis.bshf(entis.bshf(Buffer.alloc(64,0x41),'wrong-pw',true),'cotopha',false);
 packs.params=target=>target==='entis-key'?[{value:{archive:'data.noa',password:'wrong-pw'}},{value:{archive:'data.noa',password:'cotopha'}}]:[];
 const g2=tmp(t);F.writeTree(g2,{'data.noa':F.noa({'aaa.dat':decoyPlain,'script/main.csx':csxBuf},{password:'cotopha',encrypt:new Set(['aaa.dat','script/main.csx'])}),'game.exe':'MZ'});
 assert.deepEqual(scenes.read('entis',g2).map(s=>[s.name,s.lines]),[['main.csx',EL]]);
 /* case 3: encrypted .csx that is not a Cotopha image falls back to the first encrypted entry; a wrong password that only decrypts an Entis\x1a magic is rejected */
 const txtBuf=Buffer.from('script note line\r\n'.repeat(16),'utf8');
 const nonCotopha=Buffer.concat([Buffer.from('Entis\x1a\0\0','latin1'),Buffer.alloc(8),Buffer.from('ERISA-Archive file'.padEnd(48,' '),'latin1')]);
 const g3=tmp(t);
 packs.params=target=>target==='entis-key'?[{value:{archive:'data.noa',password:'cotopha'}}]:[];
 F.writeTree(g3,{'data.noa':F.noa({'script/a.csx':nonCotopha,'script/main.csx':csxBuf},{password:'cotopha',encrypt:new Set(['script/a.csx','script/main.csx'])}),'game.exe':'MZ'});
 assert.deepEqual(scenes.read('entis',g3).map(s=>[s.name,s.lines]),[['a.csx',[]],['main.csx',EL]]);
 const decoyEntis=entis.bshf(entis.bshf(nonCotopha,'wrong-entis',true),'cotopha',false);
 packs.params=target=>target==='entis-key'?[{value:{archive:'data.noa',password:'wrong-entis'}},{value:{archive:'data.noa',password:'cotopha'}}]:[];
 const g4=tmp(t);F.writeTree(g4,{'data.noa':F.noa({'a.txt':txtBuf,'script/a.csx':decoyEntis,'script/main.csx':csxBuf},{password:'cotopha',encrypt:new Set(['a.txt','script/a.csx','script/main.csx'])}),'game.exe':'MZ'});
 assert.deepEqual(scenes.read('entis',g4).map(s=>[s.name,s.lines]),[['a.csx',[]],['main.csx',EL]]);
 /* case 4: tiny (<0x40) .csx is skipped in favor of a full .csx; corrupt filehdr len (<0x44) and truncated .csx fall back cleanly */
 packs.params=target=>target==='entis-key'?[{value:{archive:'data.noa',password:'cotopha'}}]:[];
 const g5=tmp(t);F.writeTree(g5,{'data.noa':F.noa({'aaa.png':fakeBin,'script/tiny.csx':Buffer.alloc(32,0),'script/main.csx':csxBuf},{password:'cotopha',encrypt:new Set(['aaa.png','script/tiny.csx','script/main.csx'])}),'game.exe':'MZ'});
 assert.deepEqual(scenes.read('entis',g5).map(s=>[s.name,s.lines]),[['main.csx',EL],['tiny.csx',[]]]);
 const findHdr=(buf,nth)=>{let at=-1;for(let k=0;k<=nth;k++)at=buf.indexOf('filehdr\0',at+1,'latin1');return at;};
 const fakeCsxHead=Buffer.concat([Buffer.from('Entis\x1a\0\0','latin1'),Buffer.alloc(8),Buffer.from('Cotopha Image file'.padEnd(48,' '),'latin1')]);
 const decoyShort=entis.bshf(entis.bshf(fakeCsxHead,'wrong-len',true),'cotopha',false);
 const g6=tmp(t),noaShort=F.noa({'a.txt':txtBuf,'script/bad.csx':decoyShort,'script/main.csx':csxBuf},{password:'cotopha',encrypt:new Set(['a.txt','script/bad.csx','script/main.csx'])});
 noaShort.writeBigUInt64LE(0x20n,findHdr(noaShort,1)+8);
 packs.params=target=>target==='entis-key'?[{value:{archive:'data.noa',password:'wrong-len'}},{value:{archive:'data.noa',password:'cotopha'}}]:[];
 F.writeTree(g6,{'data.noa':noaShort,'game.exe':'MZ'});
 assert.deepEqual(scenes.read('entis',g6).map(s=>[s.name,s.lines]),[['bad.csx',[]],['main.csx',EL]]);
 const g7=tmp(t),noaTrunc=F.noa({'a.txt':txtBuf,'script/trunc.csx':csxBuf},{password:'cotopha',encrypt:new Set(['a.txt','script/trunc.csx'])});
 packs.params=target=>target==='entis-key'?[{value:{archive:'data.noa',password:'cotopha'}}]:[];
 F.writeTree(g7,{'data.noa':noaTrunc.subarray(0,findHdr(noaTrunc,1)+0x30),'game.exe':'MZ'});
 assert.deepEqual(scenes.read('entis',g7).map(s=>[s.name,s.lines]),[['trunc.csx',[]]]);
});

/* ---- AliceSoft System 3.x ----------------------------------------------------------------------------------------------- */
const B=s=>Buffer.from(s,'latin1');
/* compacted hiragana: 0xB1 0xB2 = あい */
const page1=[B('!'),Buffer.from([0x81]),F.expr(1),'ランス',F.R,'「よう、',Buffer.from([0xb1,0xb2]),'」',F.A,
 B('G'),Buffer.from([0]),F.expr(3),'静かな朝だ。',F.A,B('LC'),F.expr(1),F.expr(2),B('cg01:'),
 B('{'),F.expr(1),F.u32(0),B('$'),F.u32(0x100),'戦う',B('$'),B('$'),F.u32(0x120),'逃げる',B('$'),B(']'),
 '名前データ',Buffer.from([0]),B('/!'),'メッセージ命令',Buffer.from([0]),F.A,B('@'),F.u32(0)];
const page1zh=[B('!'),Buffer.from([0x81]),F.expr(1),'兰斯',F.R,'“哟，',Buffer.from([0xb1,0xb2]),'”',F.A,B('G'),Buffer.from([0]),F.expr(3),'安静的早晨。',F.A,B('LC'),F.expr(1),F.expr(2),B('cg01:'),
 B('{'),F.expr(1),F.u32(0),B('$'),F.u32(0x100),'战斗',B('$'),B('$'),F.u32(0x120),'逃跑',B('$'),B(']'),'名前データ',Buffer.from([0]),B('/!'),'消息命令',Buffer.from([0]),F.A,B('@'),F.u32(0)];
const AL=['ランス\n「よう、あい」','静かな朝だ。','戦う','逃げる','メッセージ命令'];
test('AliceSoft: SCO walk — messages per page, R breaks, compacted kana, menu items, /! strings, data strings skipped',()=>{
 assert.deepEqual(alice.parse(F.sco(page1)).lines,AL);
 /* an unknown command resyncs instead of ending the page */
 assert.deepEqual(alice.parse(F.sco([Buffer.from([0x01,0x02]),...page1])).lines,AL);
 assert.deepEqual(alice.parse(Buffer.from('S351 too short')).lines,[]);
});
test('AliceSoft: ZU-marked UTF-8 SCO decodes message runs, inline choices, and /! strings as UTF-8',t=>{
 const U=s=>Buffer.from(s,'utf8');
 const utf8Page=F.sco([B('ZU\x41\x7f'),U('ランス'),F.R,U('「よう、冒険だ」'),F.A,
  B('{'),F.expr(1),F.u32(0),B('$'),F.u32(0x100),U('戦う'),B('$'),B('$'),F.u32(0x120),U('逃げる'),B('$'),B(']'),
  B('/!'),U('メッセージ命令'),Buffer.from([0]),F.A]);
 const want=['ランス\n「よう、冒険だ」','戦う','逃げる','メッセージ命令'];
 /* call scoLines directly (not via module-level lastOpts) to verify walk()'s default ZU auto-detection */
 assert.deepEqual(alice.scoLines(utf8Page),want);
 /* invalid UTF-8 lead byte must stop before a non-continuation command byte (A = page break) instead of swallowing it */
 const badLead=F.sco([B('ZU\x41\x7f'),U('あい'),Buffer.from([0xe3]),F.A,U('次'),F.A]);
 assert.deepEqual(alice.scoLines(badLead),['あい\ufffd','次']);
 /* truncated UTF-8 sequence at EOF must stop at buffer end without reading past length */
 const truncRun=Buffer.concat([U('あい'),Buffer.from([0xe3,0x81])]);
 assert.deepEqual(alice.messageRun(truncRun,0,true),['あい\ufffd',8,8]);
 assert.deepEqual(alice.scoLines(F.sco([B('ZU\x41\x7f'),truncRun])),['あい\ufffd']);
 const game=tmp(t);F.writeTree(game,{'RanceSA.ALD':F.ald([{name:'01.SCO',volume:1,data:utf8Page}]),'System3.exe':'MZ'});
 assert.deepEqual(scenes.read('alicesoft',game)[0].lines,want);
});
test('AliceSoft: System 3.9 messages by id from System39.ain (rotated AINI)',()=>{
 const ain=F.ain39(['最初の台詞','二番目の台詞']),a=alice.readAin39(ain);assert.equal(a.messages.length,2);
 const pg=F.sco([B('/'),Buffer.from([0x7c]),F.u32(1),F.A,B('/'),Buffer.from([0x7c]),F.u32(0),F.A],{version:'S380'});
 assert.deepEqual(alice.scoLines(pg,{ain:a}),['二番目の台詞','最初の台詞']);assert.deepEqual(alice.parse(ain).lines,['最初の台詞','二番目の台詞']);
});
test('AliceSoft: xxxSA.ALD game folder is System 3.x, read page by page; a GBK-free patch pairs; System4 folders skip GARbro for .afa',t=>{
 const game=tmp(t),patch=tmp(t),sys4=tmp(t);
 const entries=[{name:'01.SCO',volume:1,data:F.sco(page1)},{name:'02.SCO',volume:1,data:F.sco(['二ページ目',F.A])}];
 F.writeTree(game,{'RanceSA.ALD':F.ald(entries),'RanceGA.ALD':F.ald([{name:'cg.qnt',volume:1,data:Buffer.alloc(300)}]),'System3.exe':'MZ'});
 F.writeTree(patch,{'RanceSA.ALD':F.ald([{name:'01.SCO',volume:1,data:F.sco(page1zh.map(p=>typeof p==='string'&&/[兰哟斗逃安静消]/.test(p)?F.gbk(p):p))},{name:'02.SCO',volume:1,data:F.sco([F.gbk('第二页'),F.A])}])});
 assert.equal(library.engineOf(game)?.name,'System 3.x (AliceSoft)');assert.equal(scenes.detect(game),'alicesoft');
 const ja=scenes.read('alicesoft',game);assert.deepEqual(ja.map(s=>s.name),['01.SCO','02.SCO']);assert.deepEqual(ja[0].lines,AL);assert.deepEqual(ja[1].lines,['二ページ目']);
 const zh=scenes.ENGINES.alicesoft.archives(patch).map(s=>alice.parse(s.read()));assert.equal(zh[0].lines.length,ja[0].lines.length);
 /* System4: script is the .ain; .afa / .ald archives are listed but never handed to GARbro */
 F.writeTree(sys4,{'Rance01.ain':Buffer.from('AI2\0xxxxxxxxxxxx'),'Rance01CG.afa':F.afa({'cg/a.qnt':Buffer.alloc(30000,1)}),'Rance01WA.ald':Buffer.alloc(30000),'Rance01.exe':'MZ'});
 assert.equal(library.engineOf(sys4)?.name,'System4 (AliceSoft)');assert.deepEqual(alice.listAfa(path.join(sys4,'Rance01CG.afa')).map(e=>e.name),['cg/a.qnt']);
 assert.equal(garbro.archives(sys4).length,0);assert.equal(scenes.readable('alicesoft',sys4),false);
});

/* ---- Marble ------------------------------------------------------------------------------------------------------------- */
const MS=['@bg01','*label','>ミナ','「おはよう、今日も早いね」','\\w','窓の外では雨が降っている。','>カナ','「傘を持っていこう」'];
const MZ=['@bg01','*label','>米娜','“早上好，今天也很早呢”','\\w','窗外正在下雨。','>卡娜','“带上伞吧”'];
const ML=['「おはよう、今日も早いね」','窓の外では雨が降っている。','「傘を持っていこう」'];
test('Marble: NUL-separated strings, > speakers and @ * \\ commands',()=>{const r=marble.parse(F.marbleScript(MS));assert.deepEqual(r.lines,ML);assert.ok(r.anchors.includes('>ミナ'));});
test('Marble: both index layouts; negated, known-key and unknown-key scripts all open',t=>{
 const long=Array.from({length:40},()=>MS).flat(),dir=tmp(t);
 const neg=marble.negate(F.marbleScript(MS)),known=kit.xor(F.marbleScript(long),kit.encodeSjis('女教師ゆうこ1968')),unknown=kit.xor(F.marbleScript(long),kit.encodeSjis('ﾃｽﾄ用の合言葉-2026'));
 for(const [n,buf,layout] of [['a',neg,'len'],['b',known,'fixed16'],['c',unknown,'len']]){const f=path.join(dir,n+'_data.mbl');fs.writeFileSync(f,F.mbl({'s001.s':buf,'s002.s':buf},{layout}));
  const l=marble.list(f);assert.deepEqual(l.map(e=>e.name),['s001.s','s002.s'],n);assert.deepEqual(marble.parse(marble.decode(f,l[0])).lines.slice(0,3),ML,n);}
});
test('Marble: mg_data.mbl folder is recognised and read; a GBK patch (mg_data2) pairs 1:1',t=>{
 const game=tmp(t),patch=tmp(t);const script=Array.from({length:30},()=>MS).flat(),zh=Array.from({length:30},()=>MZ).flat();const key=kit.encodeSjis('MAYURI');
 F.writeTree(game,{'mg_data.mbl':F.mbl({'s001.s':kit.xor(F.marbleScript(script),key),'cfg.txt':Buffer.from('x')}),'mg_gra.mbl':Buffer.alloc(64),'marble.exe':'MZ'});
 F.writeTree(patch,{'mg_data.mbl':F.mbl({'s001.s':kit.xor(F.marbleScript(zh,F.gbk),key)})});
 assert.equal(library.engineOf(game)?.name,'Marble');assert.equal(scenes.detect(game),'marble');
 const ja=scenes.read('marble',game)[0],tr=marble.parse(scenes.ENGINES.marble.archives(patch)[0].read());
 assert.equal(ja.lines.length,90);assert.equal(tr.lines.length,ja.lines.length);assert.equal(tr.lines[1],'窗外正在下雨。');
});
test('Marble: opened() cache invalidates when adapter-pack marble-key is added, replaced, or removed without changing the .mbl file',t=>{
 const packs=require('../services/adapter-packs.cjs'),orig=packs.params;t.after(()=>{packs.params=orig;});
 const dir=tmp(t),script=Array.from({length:30},()=>MS).flat(),plain=F.marbleScript(script);
 const keyHex=Buffer.from(Array.from({length:73},(_,i)=>(i*37+19)&255)),wrongHex=Buffer.from(Array.from({length:73},(_,i)=>(i*13+7)&255));
 const mblFile=path.join(dir,'mg_data.mbl');
 F.writeTree(dir,{'mg_data.mbl':F.mbl({'s001.s':kit.xor(plain,keyHex)}),'marble.exe':'MZ'});
 const entries=marble.list(mblFile);
 /* 1. No pack key yet: >64-byte key cannot be cracked by column analysis, so cache records cipher:null */
 packs.params=()=>[];
 assert.equal(scenes.read('marble',dir).length,0);
 /* 2. Wrong pack key (count 1) still fails */
 const wrong=[{value:{title:'Wrong',hex:wrongHex.toString('hex')},pack:'p@1'}];
 packs.params=target=>target==='marble-key'?wrong:[];
 assert.equal(scenes.read('marble',dir).length,0);
 /* 3. Replacing with the right key (same count 1, same file size & mtime) must invalidate cache and decrypt */
 const right=[{value:{title:'Right',hex:keyHex.toString('hex')},pack:'p@2'}];
 packs.params=target=>target==='marble-key'?right:[];
 const got=scenes.read('marble',dir);
 assert.equal(got.length,1);assert.deepEqual(got[0].lines.slice(0,3),ML);
 assert.deepEqual(marble.parse(marble.decode(mblFile,entries[0])).lines.slice(0,3),ML);
 /* 4. Removing the pack key must also invalidate the cached cipher */
 packs.params=()=>[];
 assert.equal(scenes.read('marble',dir).length,0);
 /* 5. Same check with a cp932 text key ({key}) */
 const dir2=tmp(t),textKey='長い合言葉テスト零壱弐参四五六七八九十甲乙丙丁戊己庚辛壬癸春夏秋冬東西南北青龍白虎朱雀玄武';
 F.writeTree(dir2,{'mg_data.mbl':F.mbl({'s001.s':kit.xor(plain,kit.encodeSjis(textKey))}),'marble.exe':'MZ'});
 assert.equal(scenes.read('marble',dir2).length,0);
 const byText=[{value:{title:'TextKey',key:textKey},pack:'p@3'}];
 packs.params=target=>target==='marble-key'?byText:[];
 assert.deepEqual(scenes.read('marble',dir2)[0].lines.slice(0,3),ML);
 /* 6. decode() reuses cached cipher so reading a 100-entry archive calls params() O(1) times, not per entry */
 const dir3=tmp(t),many={};for(let i=0;i<100;i++)many['s'+String(i).padStart(3,'0')+'.s']=plain;
 F.writeTree(dir3,{'mg_data.mbl':F.mbl(many),'marble.exe':'MZ'});
 let calls=0;const empty=[];
 packs.params=target=>{if(target==='marble-key')calls++;return empty;};
 assert.equal(scenes.read('marble',dir3).length,100);
 assert.ok(calls<=2,'first read should check marble-key once, got '+calls);
 calls=0;
 assert.equal(scenes.read('marble',dir3).length,100);
 assert.ok(calls<=2,'cached read should check marble-key once, got '+calls);
});
test('Entis: noaList() cache invalidates when adapter-pack entis-key is added, replaced, narrowed by archive, or removed without changing the .noa file',t=>{
 const packs=require('../services/adapter-packs.cjs'),orig=packs.params;t.after(()=>{packs.params=orig;});
 const dir=tmp(t),enc=F.noa({'main.csx':F.csx(CJ)},{password:'cotopha',encrypt:new Set(['main.csx'])});
 F.writeTree(dir,{'enc.noa':enc,'game.exe':'MZ'});
 /* 1. No pack password yet: cache records undefined password, main.csx reads 0 lines */
 packs.params=()=>[];
 assert.deepEqual(scenes.read('entis',dir).map(s=>[s.name,s.lines]),[['main.csx',[]]]);
 /* 2. Wrong pack password (count 1) still reads 0 lines */
 const wrong=[{value:{password:'wrong-pw'},pack:'e@1'}];
 packs.params=target=>target==='entis-key'?wrong:[];
 assert.deepEqual(scenes.read('entis',dir).map(s=>[s.name,s.lines]),[['main.csx',[]]]);
 /* 3. Replacing with the right password (same count 1, same file size & mtime) must invalidate cache and decrypt */
 const right=[{value:{password:'cotopha'},pack:'e@2'}];
 packs.params=target=>target==='entis-key'?right:[];
 assert.deepEqual(scenes.read('entis',dir).map(s=>[s.name,s.lines]),[['main.csx',EL]]);
 /* 4. Narrowing archive to another filename (same password, same count 1) must invalidate cache */
 const otherArc=[{value:{archive:'other.noa',password:'cotopha'},pack:'e@3'}];
 packs.params=target=>target==='entis-key'?otherArc:[];
 assert.deepEqual(scenes.read('entis',dir).map(s=>[s.name,s.lines]),[['main.csx',[]]]);
 /* 5. Matching archive restores reading; removing the pack invalidates again */
 const matchArc=[{value:{archive:'ENC.NOA',password:'cotopha'},pack:'e@4'}];
 packs.params=target=>target==='entis-key'?matchArc:[];
 assert.deepEqual(scenes.read('entis',dir).map(s=>[s.name,s.lines]),[['main.csx',EL]]);
 packs.params=()=>[];
 assert.deepEqual(scenes.read('entis',dir).map(s=>[s.name,s.lines]),[['main.csx',[]]]);
});
