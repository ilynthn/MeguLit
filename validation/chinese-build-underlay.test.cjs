// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// S9 (2026-11-19, 27 probes of Chinese builds): a translation laid over the Japanese release in the same folder, or one
// that replaced the script archive and kept the Japanese one in a backup folder, still has the Japanese script. The
// game runs the Chinese lines; the Japanese lines under them are adopted as the original by themselves.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const ot=require('../services/original-text.cjs'),scenes=require('../services/original-engines/scenes.cjs'),xp3=require('../services/original-engines/xp3.cjs'),bgi=require('../services/original-engines/bgi.cjs'),sampler=require('../services/align-sample.cjs');
const base=fs.existsSync('H:\\MeguLit-Work')?path.join('H:\\MeguLit-Work','tmp'):os.tmpdir();fs.mkdirSync(base,{recursive:true});
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
function writeXp3(file,entries){const datas=[],index=[];let at=11+8;
 for(const [name,content] of entries){const data=Buffer.from(content),n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([u32(0),u64(data.length),u64(data.length),u16(name.length),n])),chunk('segm',Buffer.concat([u32(0),u64(at),u64(data.length),u64(data.length)])),chunk('adlr',u32(0))])));datas.push(data);at+=data.length;}
 const idx=Buffer.concat(index);fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...datas,Buffer.from([0]),u64(idx.length),idx]));}
function writePf8(file,entries){const names=entries.map(([n])=>Buffer.from(n,'utf8'));let size=4;for(const n of names)size+=4+n.length+12;
 let offset=7+size;const parts=[u32(entries.length)],datas=[];
 entries.forEach(([,content],i)=>{const d=Buffer.from(content);parts.push(u32(names[i].length),names[i],u32(0),u32(offset),u32(d.length));datas.push(d);offset+=d.length;});
 const index=Buffer.concat(parts),key=crypto.createHash('sha1').update(index).digest();for(const d of datas)for(let i=0;i<d.length;i++)d[i]^=key[i%20];
 fs.writeFileSync(file,Buffer.concat([Buffer.from('pf8','latin1'),u32(index.length),index,...datas]));}
const JA=['おはよう、今日はいい天気だね。','そうだね、散歩に行こうか。','公園まで歩いて十分くらいかな。','途中でパンを買っていこう。','あの店のパンはとても美味しいんだ。','楽しみだね、早く行こう！'];
const ZH=['早上好，今天天气真好。','是啊，去散步吧。','走到公园大概十分钟吧。','路上买点面包吧。','那家店的面包非常好吃。','真期待，快走吧！'];
const ks=lines=>Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('*start\r\n@bg storage="room"\r\n'+lines.map(t=>t+'[p]\r\n').join('')+'@s\r\n','utf16le')]);
const ast=lines=>Buffer.from('astver = 2.0\nast = {\n\tblock_00000 = {\n'+lines.map((t,i)=>'\t\t{"print", "'+t+'", id="l'+i+'"},\n').join('')+'\t},\n}\n','utf8');
function game(build){const dir=fs.mkdtempSync(path.join(base,'megulit-under-'));build(dir);fs.writeFileSync(path.join(dir,'game.exe'),'MZ');return {dir,exe:path.join(dir,'game.exe'),root:fs.mkdtempSync(path.join(base,'megulit-under-root-'))};}

test('KiriKiri: a Chinese patch.xp3 over the Japanese data.xp3 adopts the Japanese scene under it',()=>{
 const g=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(JA)]]);writeXp3(path.join(dir,'patch.xp3'),[['scenario/a.ks',ks(ZH)]]);});
 assert.deepEqual(scenes.read('kirikiri',g.dir).flatMap(s=>s.lines),ZH);
 assert.deepEqual(scenes.ENGINES.kirikiri.originalLines(g.dir),JA);
 const s=ot.scanRunning(g.root,'k',g.exe);assert.ok(s.original?.index,JSON.stringify(s));assert.equal(s.original.auto,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(s.original.index,'utf8')).lines,JA);
});

test('KiriKiri: no Japanese layer under the patch: nothing adopted',()=>{
 const g=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(ZH)]]);});
 assert.equal(scenes.ENGINES.kirikiri.originalLines(g.dir),null);
 const s=ot.scanRunning(g.root,'k',g.exe);assert.notEqual(s.status,'ready');assert.ok(!s.original);
});

test('Artemis: a Chinese root.pfs.010 over the Japanese root.pfs adopts the Japanese scene under it',()=>{
 const g=game(dir=>{writePf8(path.join(dir,'root.pfs'),[['script\\a.ast',ast(JA)]]);writePf8(path.join(dir,'root.pfs.010'),[['script\\a.ast',ast(ZH)]]);});
 assert.deepEqual(scenes.read('artemis',g.dir).flatMap(s=>s.lines),ZH);
 assert.deepEqual(scenes.ENGINES.artemis.originalLines(g.dir),JA);
});

test('backup folder: a translation that replaced data.xp3 and kept the Japanese one in backup/ is imported by itself',()=>{
 const g=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(ZH)]]);fs.mkdirSync(path.join(dir,'backup','原版'),{recursive:true});writeXp3(path.join(dir,'backup','原版','data.xp3'),[['scenario/a.ks',ks(JA)]]);});
 assert.equal(ot.backupOriginal(g.dir,'kirikiri','game'),null,'too few lines for a release');
 const many=game(dir=>{const ja=[],zh=[];for(let i=0;i<12;i++){ja.push(...JA);zh.push(...ZH);}writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(zh)]]);fs.mkdirSync(path.join(dir,'backup','原版'),{recursive:true});writeXp3(path.join(dir,'backup','原版','data.xp3'),[['scenario/a.ks',ks(ja)]]);});
 assert.equal(ot.backupOriginal(many.dir,'kirikiri','game'),path.join(many.dir,'backup','原版'));
 const s=ot.scanRunning(many.root,'b',many.exe);assert.equal(s.original?.backup,true,JSON.stringify(s));assert.equal(s.original.dir,path.join(many.dir,'backup','原版'));
});

test('alignLines: a sound effect the translation added is left out, the rest of an uneven run pairs',()=>{
 const run=[{name:'s',lines:['v01','莉莎','「呐－那边的大哥哥，和我一起化作星光吧ー」','这家伙。','非要用这么麻烦的说法么。','咚','v02']}];
 const jp=[{name:'s',lines:['v01','リサ','「ねー、そこのおにーさん、わたしと光ろーよー」','やれやれだ。','やっかいを起こさなきゃいいが。','v02']}];
 assert.deepEqual(bgi.alignLines(run,jp),['v01','リサ','「ねー、そこのおにーさん、わたしと光ろーよー」','やれやれだ。','やっかいを起こさなきゃいいが。','','v02']);
 const c=sampler.census(['咚','这家伙。'],['','']);assert.deepEqual(c.reasons,{'no-japanese-line':1});assert.equal(c.total,1);assert.deepEqual(c.added,{count:1,sound:1,line:0,rewritten:0});
});

test('alignLines: a voiced block the Japanese lacks, a speaker name in katakana and a rewritten line are told apart; census keeps them out of unpaired',()=>{
 const run=[{name:'s',lines:['v01','梅尔特','「了解－盛谢惠顾了哦?」','喀啷喀啷','门铃响起。','喧哗瞬间安静下来。','v02','凯伊姆','「真豪奢啊」','v03','「羽化病吗」','这下子就更麻烦了。','被《羽狩》看到的话，钱也就会被揣进他们的腰包了。','v04']}];
 const jp=[{name:'s',lines:['v01','メルト','「りょーかい。毎度どうも♪」','入り口の扉が開いた。','喧噪が瞬時に静まる。','v03','「羽つきか」','《羽つき》は《羽化病》という伝染病に冒された人間の通称だ。','感染拡大を防ぐため、国が《羽狩り》を設立した。','奴らの仕事は、罹患者を《羽狩り》が保護することだ。','v04']}];
 const out=bgi.alignLines(run,jp);
 assert.deepEqual(out.slice(1,6),['メルト','「りょーかい。毎度どうも♪」','','入り口の扉が開いた。','喧噪が瞬時に静まる。']);
 assert.deepEqual(out.added,[7,8]);assert.deepEqual(out.rewritten,[11,12]);
 const c=sampler.census(run[0].lines,out,out.added,out.rewritten);assert.equal(c.unpaired,0);assert.deepEqual(c.added,{count:5,sound:1,line:2,rewritten:2});
});

test('probe: a Chinese patch over the Japanese release reads as Japanese (original: layer); a plain Chinese build says whether it can be restored',()=>{
 const {probeGame}=require('../services/adapter-probe-core.cjs');const ja=[],zh=[];for(let i=0;i<12;i++){ja.push(...JA);zh.push(...ZH);}
 const g=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(ja)]]);writeXp3(path.join(dir,'patch.xp3'),[['scenario/a.ks',ks(zh)]]);});
 const r=probeGame({dir:g.dir,executable:g.exe,title:'t'},{budgetMs:30000});assert.equal(r.step,'ok',JSON.stringify(r.engines));assert.equal(r.original,'layer');assert.equal(r.japaneseLines,ja.length);
 const c=game(dir=>{writeXp3(path.join(dir,'data.xp3'),[['scenario/a.ks',ks(zh)]]);});
 const q=probeGame({dir:c.dir,executable:c.exe,title:'t'},{budgetMs:30000});assert.equal(q.step,'chinese-build');assert.equal(q.original,null);assert.equal(typeof q.restore,'string');
});

function writeTree(dir,files){for(const [rel,data] of Object.entries(files)){const full=path.join(dir,rel);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,data);}}

test('QLIE: Chinese overlay packs (GameData/data9.pack + root data6.pack) over Japanese GameData/data6.pack adopt the underlying Japanese scenes',()=>{
 const F=require('./helpers/engine-fixtures-c.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja1=[],zh1=[],zhRoot=[],ja2=[];for(let i=0;i<10;i++){ja1.push(...JA);zh1.push(...ZH);zhRoot.push(...ZH.map(l=>l+'（修正）'));}for(let i=0;i<2;i++)ja2.push(...JA);
 const sFile=lines=>lines.join('\r\n')+'\r\n';
 const g=game(dir=>{
  writeTree(dir,{
   'GameData/data6.pack':F.qliePack({'scenario/s01.s':F.sjis(sFile(ja1)),'scenario/s02.s':F.sjis(sFile(ja2))},{version:'3.1'}),
   'GameData/data8.pack':Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]),
   'GameData/data9.pack':F.qliePack({'scenario/s01.s':F.gbk(sFile(zh1))},{version:'3.1'}),
   'data6.pack':F.qliePack({'scenario/s01.s':F.gbk(sFile(zhRoot))},{version:'3.1'}),
   'UnInstallData.pack':Buffer.from('not-a-qlie-pack-header'),
  });
 });
 const running=scenes.read('qlie',g.dir).flatMap(s=>s.lines);
 assert.deepEqual(running,[...zhRoot,...ja2]);
 assert.deepEqual(scenes.ENGINES.qlie.originalLines(g.dir),[...ja1,...ja2]);
 const r=probeGame({dir:g.dir,executable:g.exe,title:'t'},{budgetMs:30000});
 assert.equal(r.step,'ok',JSON.stringify(r.engines));
 assert.equal(r.detail,'qlie');
 assert.equal(r.original,'layer');
 assert.equal(r.japaneseLines,ja1.length+ja2.length);
 const s=ot.scanRunning(g.root,'q',g.exe);
 assert.ok(s.original?.index,JSON.stringify(s));
 assert.equal(s.original.auto,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(s.original.index,'utf8')).lines,[...ja1,...ja2]);
});

test('QLIE: GameData/data7.pack over data0.pack, loose scenario/*.s over data0.pack, and GameData/gamedata dedup adopt underlying Japanese',()=>{
 const F=require('./helpers/engine-fixtures-c.cjs'),qlie=require('../services/original-engines/qlie.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja=[],zh=[];for(let i=0;i<10;i++){ja.push(...JA);zh.push(...ZH);}
 const sFile=lines=>lines.join('\r\n')+'\r\n';
 const gTwo=game(dir=>{
  writeTree(dir,{
   'GameData/data0.pack':F.qliePack({'s01.s':F.sjis(sFile(ja))},{version:'3.1'}),
   'GameData/data7.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'}),
  });
 });
 assert.deepEqual(scenes.read('qlie',gTwo.dir).flatMap(s=>s.lines),zh);
 assert.deepEqual(scenes.ENGINES.qlie.originalLines(gTwo.dir),ja);
 const rTwo=probeGame({dir:gTwo.dir,executable:gTwo.exe,title:'t'},{budgetMs:30000});
 assert.equal(rTwo.step,'ok',JSON.stringify(rTwo.engines));assert.equal(rTwo.original,'layer');assert.equal(rTwo.japaneseLines,ja.length);
 const deduped=qlie._internal.dedupFiles([path.join(gTwo.dir,'GameData','data0.pack'),path.join(gTwo.dir,'gamedata','data0.pack')]);
 if(process.platform==='win32')assert.equal(deduped.length,1);
 const gLoose=game(dir=>{
  writeTree(dir,{
   'GameData/data0.pack':F.qliePack({'s01.s':F.sjis(sFile(ja))},{version:'3.1'}),
   'GameData/scenario/s01.s':F.gbk(sFile(zh)),
  });
 });
 assert.deepEqual(scenes.read('qlie',gLoose.dir).flatMap(s=>s.lines),zh);
 assert.deepEqual(scenes.ENGINES.qlie.originalLines(gLoose.dir),ja);
 const gScript=game(dir=>{
  writeTree(dir,{
   'GameData/data0.pack':F.qliePack({'s01.s':F.sjis(sFile(ja))},{version:'3.1'}),
   'GameData/script/s01.s':F.gbk(sFile(zh)),
  });
 });
 assert.deepEqual(scenes.read('qlie',gScript.dir).flatMap(s=>s.lines),zh);
 assert.deepEqual(scenes.ENGINES.qlie.originalLines(gScript.dir),ja);
 const gCase=game(dir=>{
  writeTree(dir,{
   'GameData/data0.pack':F.qliePack({'S01.S':F.sjis(sFile(ja))},{version:'3.1'}),
   'GameData/data7.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'}),
  });
 });
 assert.deepEqual(scenes.read('qlie',gCase.dir).flatMap(s=>s.lines),zh);
 assert.deepEqual(scenes.ENGINES.qlie.originalLines(gCase.dir),ja);
});

test('QLIE: single Chinese pack, Chinese-over-Chinese packs, and plain Japanese pack do not mis-adopt originals',()=>{
 const F=require('./helpers/engine-fixtures-c.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja=[],zh=[];for(let i=0;i<10;i++){ja.push(...JA);zh.push(...ZH);}
 const sFile=lines=>lines.join('\r\n')+'\r\n';
 const singleZh=game(dir=>{writeTree(dir,{'GameData/data0.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'})});});
 assert.equal(scenes.ENGINES.qlie.originalLines(singleZh.dir),null);
 const r1=probeGame({dir:singleZh.dir,executable:singleZh.exe,title:'t'},{budgetMs:30000});
 assert.equal(r1.step,'chinese-build');assert.equal(r1.original,null);
 const s1=ot.scanRunning(singleZh.root,'q1',singleZh.exe);assert.notEqual(s1.status,'ready');assert.ok(!s1.original);
 const zhOverZh=game(dir=>{
  writeTree(dir,{
   'GameData/data6.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'}),
   'GameData/data9.pack':F.qliePack({'s01.s':F.gbk(sFile(zh))},{version:'3.1'}),
  });
 });
 assert.equal(scenes.ENGINES.qlie.originalLines(zhOverZh.dir),null);
 const r2=probeGame({dir:zhOverZh.dir,executable:zhOverZh.exe,title:'t'},{budgetMs:30000});
 assert.equal(r2.step,'chinese-build');assert.equal(r2.original,null);
 const plainJa=game(dir=>{writeTree(dir,{'GameData/data0.pack':F.qliePack({'s01.s':F.sjis(sFile(ja))},{version:'3.1'})});});
 assert.equal(scenes.ENGINES.qlie.originalLines(plainJa.dir),null);
 const r3=probeGame({dir:plainJa.dir,executable:plainJa.exe,title:'t'},{budgetMs:30000});
 assert.equal(r3.step,'ok');assert.equal(r3.original,null);assert.equal(r3.japaneseLines,ja.length);
});

function makeAi6Arc(files,sjis){
 const F=require('./helpers/engine-fixtures-a.cjs');
 const names=Object.keys(files),idx=[],datas=[];let off=4+names.length*0x110;
 const u32be=v=>{const b=Buffer.alloc(4);b.writeUInt32BE(v>>>0);return b;};
 for(const n of names){
  const nb=Buffer.alloc(0x104),raw=sjis(n);let key=(raw.length+1)&255;
  for(let j=0;j<raw.length;j++){nb[j]=(raw[j]+key)&255;key=(key-1)&255;}
  const packed=F.lzssLiterals(files[n]);
  idx.push(nb,u32be(packed.length),u32be(files[n].length),u32be(off));datas.push(packed);off+=packed.length;
 }
 return Buffer.concat([u32(names.length),...idx,...datas]);
}
function makeAi6Mes(lines,enc){
 const parts=[];
 for(const l of lines){parts.push(Buffer.from([0x0a]),enc(l),Buffer.from([0]));}
 parts.push(Buffer.from([0x01]));
 return Buffer.concat([u32(1),u32(0),...parts]);
}
function makeSys4Ain(lines,enc,{functions=['main','scene_a','scene_b'],mt=false}={}){
 const zlib=require('node:zlib');
 const tbl=(tag,items)=>Buffer.concat([Buffer.from(tag,'latin1'),u32(items.length),...items.flatMap(b=>[b,Buffer.from([0])])]);
 const body=Buffer.concat([Buffer.from('VERS','latin1'),u32(6),tbl('MSG0',lines.map(enc)),tbl('FNAM',functions.map(f=>Buffer.from(f,'latin1')))]);
 if(mt)return ot._ain.mtXor(body,0x5D3E3);
 const packed=zlib.deflateSync(body),head=Buffer.alloc(16);
 head.write('AI2\0',0,'latin1');head.writeUInt32LE(body.length,8);head.writeUInt32LE(packed.length,12);
 return Buffer.concat([head,packed]);
}

test('Silky backup .bak: bakup/mes.arc.bak and sibling mes.arc.bak are adopted without entering normal scenes()',()=>{
 const F=require('./helpers/engine-fixtures.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja=[],zh=[];for(let i=0;i<12;i++){ja.push(...JA);zh.push(...ZH);}
 const jaArc=makeAi6Arc({'a01.mes':makeAi6Mes(ja,F.sjis)},F.sjis);
 const zhArc=makeAi6Arc({'a01.mes':makeAi6Mes(zh,F.gbk)},F.sjis);
 // #869 layout: root mes.arc (zh) + bakup/mes.arc (zh) + bakup/mes.arc.bak (ja)
 const gSub=game(dir=>{
  fs.writeFileSync(path.join(dir,'mes.arc'),zhArc);
  fs.mkdirSync(path.join(dir,'bakup'),{recursive:true});
  fs.writeFileSync(path.join(dir,'bakup','mes.arc'),zhArc);
  fs.writeFileSync(path.join(dir,'bakup','mes.arc.bak'),jaArc);
 });
 assert.deepEqual(scenes.read('silky',gSub.dir).flatMap(s=>s.lines),zh,'normal scenes() must not read .bak');
 assert.equal(ot.backupOriginal(gSub.dir,'silky','game'),path.join(gSub.dir,'bakup','mes.arc.bak'));
 const rSub=probeGame({dir:gSub.dir,executable:gSub.exe,title:'t'},{budgetMs:30000});
 assert.equal(rSub.step,'ok',JSON.stringify(rSub.engines));
 assert.equal(rSub.detail,'silky');
 assert.equal(rSub.original,'backup');
 assert.equal(rSub.japaneseLines,ja.length);
 const sSub=ot.scanRunning(gSub.root,'s1',gSub.exe);
 assert.equal(sSub.status,'ready',JSON.stringify(sSub));
 assert.equal(sSub.original?.backup,true);
 assert.equal(sSub.original?.file,path.join(gSub.dir,'bakup','mes.arc.bak'));
 // Same-folder mes.arc.bak layout
 const gSib=game(dir=>{
  fs.writeFileSync(path.join(dir,'mes.arc'),zhArc);
  fs.writeFileSync(path.join(dir,'mes.arc.bak'),jaArc);
 });
 assert.deepEqual(scenes.read('silky',gSib.dir).flatMap(s=>s.lines),zh,'sibling .bak must not enter normal scenes()');
 assert.equal(ot.backupOriginal(gSib.dir,'silky','game'),path.join(gSib.dir,'mes.arc.bak'));
 const rSib=probeGame({dir:gSib.dir,executable:gSib.exe,title:'t'},{budgetMs:30000});
 assert.equal(rSib.step,'ok',JSON.stringify(rSib.engines));
 assert.equal(rSib.original,'backup');
 assert.equal(rSib.japaneseLines,ja.length);
 const sSib=ot.scanRunning(gSib.root,'s2',gSib.exe);
 assert.equal(sSib.status,'ready',JSON.stringify(sSib));
 assert.equal(sSib.original?.executable,'','single-file backup must not record the Chinese build exe as original.executable');
 // Empty/corrupt .bak is rejected by locateBackup instead of crashing downstream
 const emptyBak=path.join(gSib.dir,'empty.arc.bak');fs.writeFileSync(emptyBak,Buffer.alloc(0));
 assert.equal(ot.locateBackup('silky',emptyBak,'game'),null);
});

test('System4 backup .bak (#901 layout): sibling <stem>.bak with AI2 header is adopted while non-AIN .bak files are ignored',()=>{
 const F=require('./helpers/engine-fixtures.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja=[],zh=[];for(let i=0;i<12;i++){ja.push(...JA);zh.push(...ZH);}
 const g=game(dir=>{
  fs.writeFileSync(path.join(dir,'アアア００.ain'),makeSys4Ain(zh,F.gbk));
  fs.writeFileSync(path.join(dir,'アアア００.bak'),makeSys4Ain(ja,F.sjis));
  fs.writeFileSync(path.join(dir,'Rance02.bak'),Buffer.from('MZ\x90\x00\x03\x00\x00\x00not-an-ain'));
  fs.writeFileSync(path.join(dir,'アアア００GA.bak'),Buffer.from([0x15,0,0,0xca,1,0,0x89,6,0,0,0,0]));
  fs.writeFileSync(path.join(dir,'Rance02.exe'),'MZ');
 });
 const exe=path.join(g.dir,'Rance02.exe');
 assert.equal(ot.ADAPTERS.system4.locate(g.dir,'Rance02')?.target,path.join(g.dir,'アアア００.ain'));
 assert.equal(ot.backupOriginal(g.dir,'system4','Rance02'),path.join(g.dir,'アアア００.bak'));
 const r=probeGame({dir:g.dir,executable:exe,title:'t'},{budgetMs:30000});
 assert.equal(r.step,'ok',JSON.stringify(r.engines));
 assert.equal(r.detail,'system4');
 assert.equal(r.original,'backup');
 assert.equal(r.japaneseLines,ja.length);
 const s=ot.scanRunning(g.root,'s4bak',exe);
 assert.equal(s.status,'ready',JSON.stringify(s));
 assert.equal(s.original?.backup,true);
 assert.equal(s.original?.file,path.join(g.dir,'アアア００.bak'));
});

test('System4 sibling .ain (#904 layout): another valid Japanese .ain in the same folder is adopted over a larger Chinese .ain',()=>{
 const F=require('./helpers/engine-fixtures.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja=[],zh=[];for(let i=0;i<12;i++){ja.push(...JA);zh.push(...ZH);}
 // Pad Chinese lines so AliceCN.ain is strictly larger than SengokuRance.ain (like #904)
 const zhBig=zh.map(l=>l+'，补充说明文字确保中文脚本文件大于日文原版。');
 const g=game(dir=>{
  fs.writeFileSync(path.join(dir,'AliceCN.ain'),makeSys4Ain(zhBig,F.gbk,{mt:true}));
  fs.writeFileSync(path.join(dir,'SengokuRance.ain'),makeSys4Ain(ja,F.sjis,{mt:true}));
  fs.writeFileSync(path.join(dir,'AltCN.ain'),makeSys4Ain(zh,F.gbk,{mt:true}));
  fs.writeFileSync(path.join(dir,'System39.ain'),Buffer.from('AINI\x00\x00\x00\x00dummy'));
 });
 assert.equal(ot.ADAPTERS.system4.locate(g.dir,'game')?.target,path.join(g.dir,'AliceCN.ain'));
 assert.equal(ot.backupOriginal(g.dir,'system4','game'),path.join(g.dir,'SengokuRance.ain'));
 const r=probeGame({dir:g.dir,executable:g.exe,title:'t'},{budgetMs:30000});
 assert.equal(r.step,'ok',JSON.stringify(r.engines));
 assert.equal(r.detail,'system4');
 assert.equal(r.original,'backup');
 assert.equal(r.japaneseLines,ja.length);
 const s=ot.scanRunning(g.root,'s4sib',g.exe);
 assert.equal(s.status,'ready',JSON.stringify(s));
 assert.equal(s.original?.backup,true);
 assert.equal(s.original?.file,path.join(g.dir,'SengokuRance.ain'));
});

test('backupOriginal rejects Chinese backups, unrelated-game backups, and leaves plain single-archive games unchanged',()=>{
 const F=require('./helpers/engine-fixtures.cjs'),{probeGame}=require('../services/adapter-probe-core.cjs');
 const ja=[],zh=[];for(let i=0;i<12;i++){ja.push(...JA);zh.push(...ZH);}
 // Silky: Chinese .bak and unrelated-game Japanese .bak (different scene names)
 const zhArc=makeAi6Arc({'a01.mes':makeAi6Mes(zh,F.gbk)},F.sjis);
 const otherJaArc=makeAi6Arc({'unrelated_game_99.mes':makeAi6Mes(ja,F.sjis)},F.sjis);
 const gSilkyBad=game(dir=>{
  fs.writeFileSync(path.join(dir,'mes.arc'),zhArc);
  fs.mkdirSync(path.join(dir,'bakup'),{recursive:true});
  fs.writeFileSync(path.join(dir,'bakup','mes.arc.bak'),zhArc);
  fs.writeFileSync(path.join(dir,'mes.arc.bak'),otherJaArc);
 });
 assert.equal(ot.backupOriginal(gSilkyBad.dir,'silky','game'),null);
 const rSilkyBad=probeGame({dir:gSilkyBad.dir,executable:gSilkyBad.exe,title:'t'},{budgetMs:30000});
 assert.equal(rSilkyBad.step,'chinese-build');assert.equal(rSilkyBad.original,null);
 // System4: single Chinese .ain (#906 layout), unrelated-game Japanese .ain (different FNAM), and mismatched-size .ain (3x lines)
 const gS4Bad=game(dir=>{
  fs.writeFileSync(path.join(dir,'Rance03.exe'),'MZ');
  fs.writeFileSync(path.join(dir,'Rance03.ain'),makeSys4Ain(zh,F.gbk,{functions:['r03_main','r03_battle']}));
  fs.writeFileSync(path.join(dir,'OtherCN.ain'),makeSys4Ain(zh,F.gbk,{functions:['r03_main','r03_battle']}));
  fs.writeFileSync(path.join(dir,'OtherGame.ain'),makeSys4Ain(ja,F.sjis,{functions:['totally_other_fn1','totally_other_fn2']}));
  fs.writeFileSync(path.join(dir,'WrongSize.ain'),makeSys4Ain([...ja,...ja,...ja],F.sjis,{functions:['r03_main','r03_battle']}));
 });
 const r03Exe=path.join(gS4Bad.dir,'Rance03.exe');
 assert.equal(ot.backupOriginal(gS4Bad.dir,'system4','Rance03'),null);
 const rS4Bad=probeGame({dir:gS4Bad.dir,executable:r03Exe,title:'t'},{budgetMs:30000});
 assert.equal(rS4Bad.step,'chinese-build');assert.equal(rS4Bad.original,null);
 // System4: empty FNAM tables must not match even when message counts match
 const gS4NoFn=game(dir=>{
  fs.writeFileSync(path.join(dir,'GameA.exe'),'MZ');
  fs.writeFileSync(path.join(dir,'GameA.ain'),makeSys4Ain(zh,F.gbk,{functions:[]}));
  fs.writeFileSync(path.join(dir,'GameA.bak'),makeSys4Ain(ja,F.sjis,{functions:[]}));
  fs.writeFileSync(path.join(dir,'UnrelatedB.ain'),makeSys4Ain(ja,F.sjis,{functions:[]}));
 });
 assert.equal(ot.backupOriginal(gS4NoFn.dir,'system4','GameA'),null);
 // CE-1: two different games sharing 100 stdlib functions, main + FD, and same game different version must all be rejected
 const stdlib=Array.from({length:100},(_,i)=>'SACT2_fn'+i);
 const gS4SharedLib=game(dir=>{
  fs.writeFileSync(path.join(dir,'GameA.exe'),'MZ');
  fs.writeFileSync(path.join(dir,'GameA.ain'),makeSys4Ain(zh,F.gbk,{functions:[...stdlib,...Array.from({length:40},(_,i)=>'gameA_'+i)]}));
  fs.writeFileSync(path.join(dir,'GameB.ain'),makeSys4Ain(ja,F.sjis,{functions:[...stdlib,...Array.from({length:40},(_,i)=>'gameB_'+i)]}));
 });
 assert.equal(ot.backupOriginal(gS4SharedLib.dir,'system4','GameA'),null);
 assert.equal(probeGame({dir:gS4SharedLib.dir,executable:path.join(gS4SharedLib.dir,'GameA.exe'),title:'t'},{budgetMs:30000}).step,'chinese-build');
 const gS4Fd=game(dir=>{
  fs.writeFileSync(path.join(dir,'Main.exe'),'MZ');
  fs.writeFileSync(path.join(dir,'Main.ain'),makeSys4Ain(zh,F.gbk,{functions:[...stdlib,'main_ep1','main_ep2']}));
  fs.mkdirSync(path.join(dir,'omake_fd'),{recursive:true});
  fs.writeFileSync(path.join(dir,'omake_fd','MainFD.ain'),makeSys4Ain(ja.slice(0,66),F.sjis,{functions:[...stdlib,'main_ep1','fd_extra']}));
 });
 assert.equal(ot.backupOriginal(gS4Fd.dir,'system4','Main'),null);
 assert.equal(probeGame({dir:gS4Fd.dir,executable:path.join(gS4Fd.dir,'Main.exe'),title:'t'},{budgetMs:30000}).step,'chinese-build');
 const zh150=[...zh,...zh,...ZH]; // 150 lines vs 120 lines
 const ja120=[...ja,...ja.slice(0,48)];
 const gS4Ver=game(dir=>{
  fs.writeFileSync(path.join(dir,'Title.exe'),'MZ');
  fs.writeFileSync(path.join(dir,'Title.ain'),makeSys4Ain(zh150,F.gbk,{functions:['main','scene_a','scene_b']}));
  fs.writeFileSync(path.join(dir,'Title_v10.ain'),makeSys4Ain(ja120,F.sjis,{functions:['main','scene_a','scene_b']}));
 });
 assert.equal(ot.backupOriginal(gS4Ver.dir,'system4','Title'),null);
 assert.equal(probeGame({dir:gS4Ver.dir,executable:path.join(gS4Ver.dir,'Title.exe'),title:'t'},{budgetMs:30000}).step,'chinese-build');
 // CE-2: scenesMatch requires overlapping at least half of running scenes (20 running vs 1 matching in .bak is rejected)
 const gSilky20=game(dir=>{
  const runFiles={};for(let i=1;i<=20;i++)runFiles['s'+String(i).padStart(2,'0')+'.mes']=makeAi6Mes(ZH,F.gbk);
  fs.writeFileSync(path.join(dir,'mes.arc'),makeAi6Arc(runFiles,F.sjis));
  fs.writeFileSync(path.join(dir,'mes.arc.bak'),makeAi6Arc({'s01.mes':makeAi6Mes(ja,F.sjis)},F.sjis));
 });
 assert.equal(ot.backupOriginal(gSilky20.dir,'silky','game'),null);
 const rSilky20=probeGame({dir:gSilky20.dir,executable:gSilky20.exe,title:'t'},{budgetMs:30000});
 assert.equal(rSilky20.step,'chinese-build');assert.equal(rSilky20.original,null);
 // CE-3: ADAPTERS.silky.read and readScript(locateBackup) return identical lines, sizes, structure; non-whitelisted sort:false engine (iga) is not accepted as .bak
 const gSilkyEq=game(dir=>{
  const arc=makeAi6Arc({'z_scene.mes':makeAi6Mes(JA.slice(0,3),F.sjis),'a_scene.mes':makeAi6Mes(JA.slice(3,5),F.sjis)},F.sjis);
  fs.writeFileSync(path.join(dir,'mes.arc'),arc);
  fs.writeFileSync(path.join(dir,'mes.arc.bak'),arc);
 });
 const silkyRun=ot.ADAPTERS.silky.read(gSilkyEq.dir);
 const silkyBak=ot.readScript(ot.locateBackup('silky',path.join(gSilkyEq.dir,'mes.arc.bak'),'game'));
 assert.deepEqual(silkyBak.lines,silkyRun.lines);
 assert.deepEqual(silkyBak.sizes,silkyRun.sizes);
 assert.deepEqual(silkyBak.structure,silkyRun.structure);
 const igaScene=lines=>Buffer.concat(lines.map(t=>{const b=Buffer.concat([F.sjis(t),Buffer.from([0])]);return Buffer.concat([Buffer.from([4,0,b.length]),b]);}));
 const makePackdat=entries=>{
  const hdr=Buffer.alloc(16);hdr.write('PACKDAT.',0,'latin1');hdr.writeUInt32LE(entries.length,8);hdr.writeUInt32LE(entries.length,12);
  let off=16+entries.length*48;const idx=[],datas=[];
  for(const [name,raw] of entries){
   const e=Buffer.alloc(48);e.write(name,0,'latin1');e.writeUInt32LE(off,32);e.writeUInt32LE(raw.length,40);e.writeUInt32LE(raw.length,44);
   const enc=Buffer.from(raw);for(let i=0;i<enc.length;i++)enc[i]^=0xff;
   idx.push(e);datas.push(enc);off+=enc.length;
  }
  return Buffer.concat([hdr,...idx,...datas]);
 };
 const gIga=game(dir=>{
  const arc=makePackdat([['z_scene.s',igaScene(ja.slice(0,60))],['a_scene.s',igaScene(ja.slice(60))]]);
  fs.writeFileSync(path.join(dir,'script.dat'),arc);
  fs.writeFileSync(path.join(dir,'script.dat.bak'),arc);
 });
 assert.equal(ot.locateBackup('iga',path.join(gIga.dir,'script.dat.bak'),'game'),null);
 assert.equal(ot.backupOriginal(gIga.dir,'iga','game'),null);
 // Auto-import state pollution guard: unreliable file-based .bak or system4 .ain/.bak must leave status and brief() untouched
 const gUnrelSilky=game(dir=>{
  fs.writeFileSync(path.join(dir,'mes.arc'),makeAi6Arc({'a01.mes':makeAi6Mes(zh,F.gbk)},F.sjis));
  // Same scene name, different line count & mismatched prose -> backupOriginal finds it, but alignment.reliable is false
  const jaMismatch=Array.from({length:ja.length+15},(_,i)=>'「まったく関係ない別の文章'+i+'ですよ」');
  fs.writeFileSync(path.join(dir,'mes.arc.bak'),makeAi6Arc({'a01.mes':makeAi6Mes(jaMismatch,F.sjis)},F.sjis));
 });
 assert.equal(ot.backupOriginal(gUnrelSilky.dir,'silky','game'),path.join(gUnrelSilky.dir,'mes.arc.bak'));
 const sUnrelSilky=ot.scanRunning(gUnrelSilky.root,'us1',gUnrelSilky.exe);
 assert.equal(sUnrelSilky.status,'chinese-only',JSON.stringify(sUnrelSilky));
 assert.ok(!sUnrelSilky.original);
 assert.equal(ot.brief(gUnrelSilky.root,'us1'),'needs-japanese');
 const gUnrelS4=game(dir=>{
  // Same structure (same FNAM + same message count), >5% kept Japanese lines that disagree -> awaiting-original, alignment.reliable is false
  const zhWithKept=[...zh.slice(0,-15),...Array.from({length:15},(_,i)=>'「残った別の日本語セリフ'+i+'」')];
  fs.writeFileSync(path.join(dir,'BadKeep.exe'),'MZ');
  fs.writeFileSync(path.join(dir,'BadKeep.ain'),makeSys4Ain(zhWithKept,F.gbk));
  fs.writeFileSync(path.join(dir,'BadKeep.bak'),makeSys4Ain(ja,F.sjis));
 });
 const badKeepExe=path.join(gUnrelS4.dir,'BadKeep.exe');
 assert.equal(ot.backupOriginal(gUnrelS4.dir,'system4','BadKeep'),path.join(gUnrelS4.dir,'BadKeep.bak'));
 const sUnrelS4=ot.scanRunning(gUnrelS4.root,'us2',badKeepExe);
 assert.equal(sUnrelS4.status,'awaiting-original',JSON.stringify(sUnrelS4));
 assert.ok(!sUnrelS4.original);
 assert.equal(ot.brief(gUnrelS4.root,'us2'),'needs-japanese');
 // M06: two different .bak files must yield distinct original fingerprints
 const jaAlt=ja.map((l,i)=>i===0?'「別の日の挨拶だよ、今日は晴れだね」':l);
 const gFp1=game(dir=>{
  fs.writeFileSync(path.join(dir,'mes.arc'),makeAi6Arc({'a01.mes':makeAi6Mes(zh,F.gbk)},F.sjis));
  fs.writeFileSync(path.join(dir,'mes.arc.bak'),makeAi6Arc({'a01.mes':makeAi6Mes(ja,F.sjis)},F.sjis));
 });
 const gFp2=game(dir=>{
  fs.writeFileSync(path.join(dir,'mes.arc'),makeAi6Arc({'a01.mes':makeAi6Mes(zh,F.gbk)},F.sjis));
  fs.writeFileSync(path.join(dir,'mes.arc.bak'),makeAi6Arc({'a01.mes':makeAi6Mes(jaAlt,F.sjis)},F.sjis));
 });
 const sFp1=ot.scanRunning(gFp1.root,'fp1',gFp1.exe);
 const sFp2=ot.scanRunning(gFp2.root,'fp2',gFp2.exe);
 assert.equal(sFp1.status,'ready');assert.equal(sFp2.status,'ready');
 assert.notEqual(sFp1.original.sha256,sFp2.original.sha256);
 assert.notEqual(sFp1.original.sha256,sFp1.runtime.sha256);
 // Plain single-archive Japanese games stay unchanged
 const gSilkyJa=game(dir=>{fs.writeFileSync(path.join(dir,'mes.arc'),makeAi6Arc({'a01.mes':makeAi6Mes(ja,F.sjis)},F.sjis));});
 const rSilkyJa=probeGame({dir:gSilkyJa.dir,executable:gSilkyJa.exe,title:'t'},{budgetMs:30000});
 assert.equal(rSilkyJa.step,'ok');assert.equal(rSilkyJa.original,null);assert.equal(rSilkyJa.japaneseLines,ja.length);
 const gS4Ja=game(dir=>{fs.writeFileSync(path.join(dir,'Rance03.ain'),makeSys4Ain(ja,F.sjis));});
 const rS4Ja=probeGame({dir:gS4Ja.dir,executable:gS4Ja.exe,title:'t'},{budgetMs:30000});
 assert.equal(rS4Ja.step,'ok');assert.equal(rS4Ja.original,null);assert.equal(rS4Ja.japaneseLines,ja.length);
});

test('readAin cache invalidates when the same .ain path is rewritten in place with identical byte size',()=>{
 const F=require('./helpers/engine-fixtures.cjs');
 const lines1=['「あいうえお」','「さしすせそ」'];
 const lines2=['「かきくけこ」','「たちつてと」'];
 const buf1=makeSys4Ain(lines1,F.sjis,{mt:true});
 const buf2=makeSys4Ain(lines2,F.sjis,{mt:true});
 assert.equal(buf1.length,buf2.length);
 const g=game(dir=>{fs.writeFileSync(path.join(dir,'live.ain'),buf1);});
 const ainFile=path.join(g.dir,'live.ain');
 const t0=Math.floor(Date.now()/1000);
 fs.utimesSync(ainFile,t0,t0);
 const r1=ot.readAin(ainFile);
 assert.deepEqual(r1.lines,lines1);
 fs.writeFileSync(ainFile,buf2);
 fs.utimesSync(ainFile,t0+2,t0+2);
 const r2=ot.readAin(ainFile);
 assert.deepEqual(r2.lines,lines2);
});
