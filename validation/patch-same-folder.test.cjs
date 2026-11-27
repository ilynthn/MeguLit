// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Zero-latency translation finds a Chinese translation that sits in the game's own folder (user, 2026-11-28: "汉化包就在
   文件夹里说不能选和游戏一样的目录，选中了汉化版 exe 却又说没有汉化包"). OZMAFIA!! (夜鸮汉化): the Japanese release is untouched
   (ozmafia.exe, pac\ysbin.ypf, the official Japanese pac\update1.ypf); ozmafia_cn.exe loads mai.dll, which serves Chinese
   scripts from mai\ysbin written in Shift-JIS with the characters Shift-JIS lacks in borrowed codes (table: mai\word.mai). */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const ot=require('../services/original-text.cjs'),xp3=require('../services/original-engines/xp3.cjs');

// ---- YU-RIS fixtures ----------------------------------------------------------------------------------------------
const SJ=new TextDecoder('shift_jis'),sjisMap=new Map();
for(let a=0x81;a<=0xfc;a++)for(let b=0x40;b<=0xfc;b++){if(b===0x7f)continue;const ch=SJ.decode(Buffer.from([a,b]));if(ch.length===1&&ch!=='�'&&!sjisMap.has(ch))sjisMap.set(ch,a<<8|b);}
const KEY=[0xd3,0x6f,0xac,0x96];
function ystb(lines){const code=[],args=[],res=[];let off=0;
 const arg=(type,data)=>{const a=Buffer.alloc(12);a.writeUInt16LE(type,2);a.writeUInt32LE(data.length,4);a.writeUInt32LE(off,8);off+=data.length;args.push(a);res.push(data);};
 lines.forEach((t,i)=>{code.push(Buffer.from([29,1,0,0]));arg(3,Buffer.from('M\x08\x00"es.SND"V'+i,'latin1'));code.push(Buffer.from([91,1,0,0]));arg(0,t);});
 const segs=[Buffer.concat(code),Buffer.concat(args),Buffer.concat(res),Buffer.alloc(code.length*4)].map(s=>{const x=Buffer.from(s);for(let i=0;i<x.length;i++)x[i]^=KEY[i&3];return x;});
 const head=Buffer.alloc(32);head.write('YSTB',0,'latin1');head.writeUInt32LE(0x1c2,4);head.writeUInt32LE(code.length,8);segs.forEach((s,k)=>head.writeUInt32LE(s.length,12+k*4));
 return Buffer.concat([head,...segs]);}
function ypf(files){const entries=[],datas=[];let index=0;for(const [name] of files)index+=4+1+name.length+18;let off=32+index;
 for(const [name,data] of files){const packed=zlib.deflateSync(data),n=Buffer.from(name,'latin1'),e=Buffer.alloc(4+1+n.length+18);
  e[4]=n.length^0xff;n.forEach((c,i)=>{e[5+i]=c^0xff;});const p=5+n.length;e[p+1]=1;e.writeUInt32LE(data.length,p+2);e.writeUInt32LE(packed.length,p+6);e.writeUInt32LE(off,p+10);off+=packed.length;entries.push(e);datas.push(packed);}
 const head=Buffer.alloc(32);head.write('YPF\0',0,'latin1');head.writeUInt32LE(450,4);head.writeUInt32LE(files.length,8);head.writeUInt32LE(index,12);
 return Buffer.concat([head,...entries,...datas]);}
const sjis=t=>Buffer.concat(Array.from(t,ch=>{const c=ch.charCodeAt(0);if(c<0x80)return Buffer.from([c]);const k=sjisMap.get(ch);return Buffer.from([k>>8,k&255]);}));
/* What the translation group's tool writes: word.mai flags every character the translation uses; the ones Shift-JIS
   lacks take the free two-byte codes in order (lead 81-9F, E0-EF; trail 40-7E, 80-9E, A0-FC), skipping the codes of the
   characters kept as themselves. */
function maiPatch(lines){const word=Buffer.alloc(0x10000);for(const t of lines)for(const ch of t)word[ch.charCodeAt(0)]=1;
 const used=new Set();for(let u=0x80;u<0x10000;u++)if(word[u]&&sjisMap.has(String.fromCharCode(u)))used.add(sjisMap.get(String.fromCharCode(u)));
 const free=[];for(const [a,z] of [[0x81,0xa0],[0xe0,0xf0]])for(let h=a;h<z;h++)for(const [l0,l1] of [[0x40,0x7f],[0x80,0x9f],[0xa0,0xfd]])for(let l=l0;l<l1;l++)if(!used.has(h<<8|l))free.push(h<<8|l);
 const borrowed=new Map();let i=0;for(let u=0x80;u<0x10000;u++)if(word[u]&&!sjisMap.has(String.fromCharCode(u)))borrowed.set(String.fromCharCode(u),free[i++]);
 const encode=t=>Buffer.concat(Array.from(t,ch=>{const c=ch.charCodeAt(0);if(c<0x80)return Buffer.from([c]);const k=sjisMap.get(ch)??borrowed.get(ch);return Buffer.from([k>>8,k&255]);}));
 return {word,encode,borrowed};}
function put(dir,files){for(const [rel,data] of Object.entries(files)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}}
function library(exe){const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);return db;}

const JA=['フーカ「いいお天気……」','洗濯物を干し終えた。','空は高く、澄んだ青がどこまでも続いている。','フーカ「家族の証……？」','アクセル「ここにいればいい」','そう言って、彼は笑った。'];
// 这 / 们 / 说 / 气 / 证 are not in Shift-JIS; the speaker's katakana name stays in front as the running line has it.
const ZH=['フーカ「天气真好……」','晾完了衣服。','天空遥不可及，澄澈的蔚蓝向天际延伸。','フーカ「家族证明……？」','アクセル「待在这里就好」','他这么说着，笑了。'];
function ozmafia(){const top=fs.mkdtempSync(path.join(os.tmpdir(),'oz-same-')),game=path.join(top,'OZMAFIA!!');
 const m=maiPatch(ZH);assert.ok(m.borrowed.has('这')&&m.borrowed.has('证'),'the fixture uses borrowed codes');
 // The official Japanese update replaces the scene with a revised Japanese one: it is the running script, not a patch.
 put(game,{'ozmafia.exe':'MZ','ozmafia_cn.exe':'MZ cn','mai.dll':'MZ mai',
  'pac/ysbin.ypf':ypf([['ysbin\\yst00000.ybn',ystb([])],['ysbin\\yst00108.ybn',ystb(JA.map(t=>sjis(t.replace('。','')) ))]]),
  'pac/update1.ypf':ypf([['ysbin\\yst00108.ybn',ystb(JA.map(sjis))]]),
  'mai/word.mai':m.word,'mai/ysbin/yst00108.ybn':ystb(ZH.map(m.encode))});
 return {top,game,exe:path.join(game,'ozmafia.exe'),data:path.join(top,'data')};}

test('YU-RIS (OZMAFIA!! 夜鸮汉化): the Chinese overlay in the game folder is found by itself, borrowed codes decoded',async()=>{
 const {top,game,exe,data}=ozmafia(),db=library(exe);
 try{
  const s=ot.scanRunning(data,'1',exe);assert.strictEqual(s.runtime.engine,'yuris');assert.strictEqual(s.status,'native-japanese');
  const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});
  assert.ok(r.found,'the game folder holds the translation: '+JSON.stringify(r));
  assert.strictEqual(ot.status(data,db,'1').patchStatus,'ready');
  const p=ot.provider(data,exe);
  assert.strictEqual(p.resolve('空は高く、澄んだ青がどこまでも続いている。').translation,'天空遥不可及，澄澈的蔚蓝向天际延伸。');
  assert.strictEqual(p.resolve('そう言って、彼は笑った。').translation,'他这么说着，笑了。','这 comes from a borrowed code');
  assert.strictEqual(p.resolve('フーカ「家族の証……？」').translation,'フーカ「家族证明……？」','a line led by the speaker\'s katakana name is translated, not kept Japanese');
 }finally{fs.rmSync(top,{recursive:true,force:true});}
});

test('YU-RIS: picking the _cn launcher or the game folder itself imports the overlay; the official update is never the patch',()=>{
 const {top,game,exe,data}=ozmafia(),db=library(exe);
 try{
  assert.strictEqual(ot.importPatch(data,db,'1',path.join(game,'ozmafia_cn.exe')).patchStatus,'ready','the Chinese launcher stands for its folder');
  ot.clearPatch(data,'1');
  assert.strictEqual(ot.importPatch(data,db,'1',game).patchStatus,'ready','the game folder can be picked');
  fs.rmSync(path.join(game,'mai'),{recursive:true});
  assert.throws(()=>ot.importPatch(data,db,'1',game),/PATCH_IS_RUNNING_COPY/,'only the Japanese release left: its own update1.ypf is no translation');
 }finally{fs.rmSync(top,{recursive:true,force:true});}
});

// ---- KiriKiri fixtures --------------------------------------------------------------------------------------------
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
function writeXp3(file,entries){const datas=[],index=[];let at=11+8;
 for(const [name,content] of entries){const data=Buffer.from(content),n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([u32(0),u64(data.length),u64(data.length),u16(name.length),n])),chunk('segm',Buffer.concat([u32(0),u64(at),u64(data.length),u64(data.length)])),chunk('adlr',u32(0))])));
  datas.push(data);at+=data.length;}
 const idx=Buffer.concat(index);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...datas,Buffer.from([0]),u64(idx.length),idx]));}
const ksJa='*start\r\n@bg storage="room"\r\n[name text="ハル"]\r\nおはよう、今日はいい天気だね。[p]\r\n@se storage="door"\r\nそうだね、散歩に行こうか。[p]\r\n@wait time=200\r\n@bgm storage="bgm01"\r\n*end\r\n@jump storage="next.ks"\r\n@s\r\n';
const ksZh=ksJa.replace('おはよう、今日はいい天気だね。','早上好，今天天气真好。').replace('そうだね、散歩に行こうか。','是啊，去散步吧。');
const utf16=t=>Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(t,'utf16le')]);

test('KiriKiri: a Chinese xp3 in a folder inside the game folder: found by itself, and by picking the game folder or the _chs launcher',async()=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'krkr-same-')),game=path.join(top,'game'),data=path.join(top,'data'),exe=path.join(game,'game.exe');
 try{
  put(game,{'game.exe':'MZ','game_chs.exe':'MZ chs','scenario/first.ks':utf16(ksJa)});writeXp3(path.join(game,'汉化','patch.xp3'),[['scenario/first.ks',utf16(ksZh)]]);
  const db=library(exe);assert.strictEqual(ot.scanRunning(data,'1',exe).status,'native-japanese');
  const r=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(r.found,JSON.stringify(r));
  assert.strictEqual(ot.provider(data,exe).resolve('そうだね、散歩に行こうか。').translation,'是啊，去散步吧。');
  ot.clearPatch(data,'1');assert.strictEqual(ot.importPatch(data,db,'1',game).patchStatus,'ready','the game folder');
  ot.clearPatch(data,'1');assert.strictEqual(ot.importPatch(data,db,'1',path.join(game,'game_chs.exe')).patchStatus,'ready','the Chinese launcher');
 }finally{fs.rmSync(top,{recursive:true,force:true});}
});

test('a game folder with only the game\'s own scripts says so instead of "pick another folder" (zh)',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','game-language.js'),'utf8');
 const zh=/PATCH_IS_RUNNING_COPY:'([^']*)'/.exec(src)[1];
 assert.match(zh,/没找到汉化脚本/);assert.doesNotMatch(zh,/选的是游戏自己的文件夹/);
});

// ---- MeguLit-Adapter: the pairing is part of the adaptation -------------------------------------------------------
const Pairing=require('../tools/megulit-adapter/pairing.cjs'),Check=require('../tools/megulit-adapter/checkpoints.cjs');
test('MeguLit-Adapter: a translation beside the game is paired by MeguLit\'s own search, or the adaptation stops',async()=>{
 const {top,game,exe}=ozmafia();
 try{
  put(game,{'unins000.exe':'MZ','汉化/readme.txt':'x'});
  const hints=Pairing.chineseHints(game,exe);
  assert.deepStrictEqual(hints,['汉化启动程序 ozmafia_cn.exe','汉化文件夹 汉化\\','外挂汉化码表 mai\\word.mai']);
  assert.strictEqual(Pairing.need(hints,{step:'ok'}),true);
  const p=await Pairing.check({exe});assert.strictEqual(p.status,'ready',JSON.stringify(p));assert.ok(p.paired>=5);
  const ask=pairing=>Check.questions({identity:{vndb:'v7833',cn:'-',release:'x'},pairing}).map(q=>q.id);
  assert.ok(!ask({hints,...p}).includes('pairing'),'paired: nothing to ask');
  assert.ok(ask({hints,status:'unreliable',error:''}).includes('pairing'),'not paired: the adaptation is not ready');
  assert.ok(!ask({hints:[],status:'none'}).includes('pairing'),'no translation with the game: nothing to ask');
  assert.deepStrictEqual(Pairing.chineseHints(path.join(top,'nowhere'),exe),[]);
 }finally{fs.rmSync(top,{recursive:true,force:true});}
});
