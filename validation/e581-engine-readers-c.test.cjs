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

/* ---- QLIE --------------------------------------------------------------------------------------------------------------- */
const QS=['@bg,file:bg01','^face,ミナ','【ミナ】','「おはよう、[rb,兄,にい]さん」','％voice,v001','ナレーション行[n]二行目','mina,ミナ,「今日はいい天気だね」','^select,学校へ行く,家に帰る','\\wait'].join('\r\n');
const QZ=['@bg,file:bg01','^face,米娜','【米娜】','“早上好，[rb,哥,ge]哥”','％voice,v001','旁白行[n]第二行','mina,米娜,“今天天气真好”','^select,去学校,回家','\\wait'].join('\r\n');
const QL=['「おはよう、兄さん」','ナレーション行\n二行目','「今日はいい天気だね」','学校へ行く','家に帰る'];
test('QLIE: .s grammar (names, name,message lines, choices, ruby, [n]); UTF-16 scripts',()=>{
 const r=qlie.parse(F.sjis(QS));assert.deepEqual(r.lines,QL);assert.ok(r.anchors.includes('【ミナ】'));
 assert.deepEqual(qlie.parse(Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(QS,'utf16le')])).lines,QL);
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
