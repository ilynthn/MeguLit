// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 官方多语言同目录 (owner, 2026-11-28: 汉化和日文在一个文件夹里的类型非常常见，一定要做好): an official multilingual KiriKiri
   release keeps one archive per language beside the shared data.xp3 and one launcher per language. ファタモルガーナの館 names
   them data_jp.xp3 / data_zh.xp3 (handled since E414); other releases use another base or separator (scenario_ja.xp3 +
   scenario_chs.xp3, data-jp.xp3 + data-sc.xp3, datajp.xp3 + datacn.xp3). Zero-latency translation pairs them by itself. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ot=require('../services/original-text.cjs'),xp3=require('../services/original-engines/xp3.cjs'),krkrLang=require('../services/original-engines/krkr-lang.cjs');

const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);
function writeXp3(file,entries){const datas=[],index=[];let at=11+8;
 for(const [name,content] of entries){const data=Buffer.from(content),n=Buffer.from(name,'utf16le');
  index.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([u32(0),u64(data.length),u64(data.length),u16(name.length),n])),chunk('segm',Buffer.concat([u32(0),u64(at),u64(data.length),u64(data.length)])),chunk('adlr',u32(0))])));
  datas.push(data);at+=data.length;}
 const idx=Buffer.concat(index);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(at),...datas,Buffer.from([0]),u64(idx.length),idx]));}
const utf16=t=>Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(t,'utf16le')]);
const JA=['長い距離、お疲れでしたでしょう。','ちゃあんとネリーが、代わりをしてあげるから。','扉の向こうには、誰もいなかった。','あなたは、この館の主なのですか？','窓の外では、雨が降り続いている。','そう言って、彼女は微笑んだ。'];
const ZH=['赶了这么多路，您应该很累了吧。','因为奈莉可以代替她。','门的另一边，谁也不在。','您是这座宅邸的主人吗？','窗外，雨一直下个不停。','她这么说着，微笑了。'];
const ks=lines=>utf16('*start\r\n@bg storage="hall"\r\n'+lines.map((t,i)=>t+'[p]\r\n*scenario_'+String(i).padStart(8,'0')+'-0000-0000-0000-000000000000|\r\n[cm]\r\n').join('')+'@s\r\n');
function release(names,{launchers=['game_jp.exe','game_cn.exe','game_en.exe']}={}){
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'krkr-lang-')),game=path.join(top,'game');fs.mkdirSync(game);
 for(const l of launchers)fs.writeFileSync(path.join(game,l),'MZ');
 writeXp3(path.join(game,'data.xp3'),[['startup.tjs',utf16('Scripts.execStorage("first.ks");')]]);
 writeXp3(path.join(game,names.ja),[['scenario/first.ks',ks(JA)]]);writeXp3(path.join(game,names.zh),[['scenario/first.ks',ks(ZH)]]);
 for(const x of names.startup||[])writeXp3(path.join(game,x),[['Initialize.tjs',utf16('x')],['startup.tjs',utf16('x')]]);
 if(names.en)writeXp3(path.join(game,names.en),[['scenario/first.ks',ks(JA.map(()=>'An English line.'))]]);
 const exe=path.join(game,launchers[0]),{DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 return {top,game,exe,db,data:path.join(top,'data')};}

async function pairs(names,opts){const r=release(names,opts);
 try{
  const s=ot.scanRunning(r.data,'1',r.exe);assert.strictEqual(s.runtime.engine,'kirikiri-lang',names.ja);assert.strictEqual(s.status,'native-japanese');
  const a=await ot.autoPatch(r.data,r.db,'1',{drives:false,force:true});assert.ok(a.found,names.ja+' '+JSON.stringify(a));
  assert.strictEqual(ot.status(r.data,r.db,'1').patchStatus,'ready');
  const p=ot.provider(r.data,r.exe);
  assert.strictEqual(p.resolve('窓の外では、雨が降り続いている。').translation,'窗外，雨一直下个不停。');
  assert.strictEqual(p.resolve('そう言って、彼女は微笑んだ。').translation,'她这么说着，微笑了。');
 }finally{fs.rmSync(r.top,{recursive:true,force:true});}}

test('官方多语言同目录: data_jp.xp3 + data_zh.xp3 (ファタモルガーナの館) pairs by itself',()=>pairs({ja:'data_jp.xp3',zh:'data_zh.xp3',en:'data_en.xp3'},{launchers:['fata_jp.exe','fata_cn.exe','fata_en.exe']}));
test('官方多语言同目录: scenario_ja.xp3 + scenario_chs.xp3',()=>pairs({ja:'scenario_ja.xp3',zh:'scenario_chs.xp3',en:'scenario_en.xp3'}));
test('官方多语言同目录: data-jp.xp3 + data-sc.xp3',()=>pairs({ja:'data-jp.xp3',zh:'data-sc.xp3'}));
test('官方多语言同目录: datajp.xp3 + datacn.xp3, beside dtjp.xp3 / dtcn.xp3 that hold only startup scripts',()=>pairs({ja:'datajp.xp3',zh:'datacn.xp3',startup:['dtjp.xp3','dtcn.xp3']}));

test('a language-tagged archive without scenes or without a Chinese sibling is no multilingual release',()=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'krkr-lang-no-'));
 try{
  writeXp3(path.join(top,'dtjp.xp3'),[['startup.tjs',utf16('x')]]);writeXp3(path.join(top,'dtcn.xp3'),[['startup.tjs',utf16('x')]]);
  assert.strictEqual(krkrLang.archives(top),null,'startup archives only');
  writeXp3(path.join(top,'voice_ja.xp3'),[['scenario/first.ks',ks(JA)]]);
  assert.strictEqual(krkrLang.archives(top),null,'no Chinese archive of the same base');
  writeXp3(path.join(top,'patch_cn.xp3'),[['scenario/first.ks',ks(ZH)]]);
  assert.strictEqual(krkrLang.archives(top),null,'patch*.xp3 is an update, not a language base');
 }finally{fs.rmSync(top,{recursive:true,force:true});}
});
