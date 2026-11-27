// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const crypto=require('node:crypto');
const xp3=require('../services/original-engines/xp3.cjs');
const cx=require('../services/original-engines/cx-filter.cjs');
const {buildPsb}=require('./helpers/psb-writer.cjs');

const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const chunk=(tag,body)=>Buffer.concat([Buffer.from(tag,'latin1'),u64(body.length),body]);

function encodeHxIndex(entries){
 // HxIndex format: 0x81 <i32be dirCount*2> [0x03 <i32be 8> <8B dirHash>, 0x81 <i32be entryCount*2> [0x03 <i32be 32> <32B nameHash>, 0x81 <i32be 2> [0x04 <i64be id>, 0x04 <i64be key>]]]
 const parts=[Buffer.from([0x81,0,0,0,2,0x03,0,0,0,8]),Buffer.alloc(8,0x11)];
 const arrHead=Buffer.alloc(5);arrHead[0]=0x81;arrHead.writeInt32BE(entries.length*2,1);parts.push(arrHead);
 for(const e of entries){
  const item=Buffer.alloc(1+4+32+5+1+8+1+8);let p=0;
  item[p++]=0x03;item.writeInt32BE(32,p);p+=4;p+=32;
  item[p++]=0x81;item.writeInt32BE(2,p);p+=4;
  item[p++]=0x04;item.writeBigUInt64BE(BigInt.asUintN(64,BigInt(e.id)),p);p+=8;
  item[p++]=0x04;item.writeBigUInt64BE(BigInt.asUintN(64,BigInt(e.key)),p);p+=8;
  parts.push(item);
 }
 return Buffer.concat(parts);
}

function fakeUnicodeName(id){
 let h=Number(BigInt(id)&0xffffffffn)>>>0,s='';
 for(;;){s+=String.fromCharCode((h&0x3fff)+0x5000);h>>>=14;if(!h)break;}
 return s;
}

function writeHxXp3(file,scheme,keyPair,entries){
 // Encrypt each entry payload with cx.hxEncrypt / filter (symmetric XOR!)
 const parts=[];let pos=19;const fileChunks=[];
 const idxItems=[];
 for(const e of entries){
  const raw=Buffer.from(e.data);
  const enc=Buffer.from(raw);
  const dec=cx.hxEntryDecryptor(scheme,e.id,e.key);
  dec(0,enc);
  const packed=zlib.deflateSync(enc);
  const dataOff=pos;parts.push(packed);pos+=packed.length;
  const uname=fakeUnicodeName(e.id);
  const nm=Buffer.from(uname,'utf16le');
  const info=Buffer.concat([Buffer.from([1,0,0,0]),u64(raw.length),u64(packed.length),Buffer.from([uname.length,0]),nm]);
  const segm=Buffer.concat([Buffer.from([1,0,0,0]),u64(dataOff),u64(raw.length),u64(packed.length)]);
  const adlr=Buffer.alloc(4);adlr.writeUInt32LE(e.adlr>>>0,0);
  fileChunks.push(chunk('File',Buffer.concat([chunk('info',info),chunk('segm',segm),chunk('adlr',adlr)])));
  idxItems.push({id:e.id,key:e.key});
 }
 const plainHx=Buffer.concat([Buffer.alloc(4),zlib.deflateSync(encodeHxIndex(idxItems))]);
 const encHx=cx.hxChacha(keyPair[0],keyPair[1],plainHx);
 const hxBlob=Buffer.concat([Buffer.alloc(16,0xaa),encHx]);
 const hxOff=pos;parts.push(hxBlob);pos+=hxBlob.length;
 const hxMeta=Buffer.alloc(14);hxMeta.writeBigUInt64LE(BigInt(hxOff),0);hxMeta.writeUInt32LE(hxBlob.length,8);hxMeta.writeUInt16LE(0,12);
 const idx=Buffer.concat([chunk('Hxv4',hxMeta),...fileChunks]);
 const idxAt=pos;
 fs.writeFileSync(file,Buffer.concat([xp3.MAGIC,u64(idxAt),...parts,Buffer.from([0]),u64(idx.length),idx]));
}

test('HxCrypt schemes exist in cx-schemes.json and decrypt synthetic Hxv4 PSB scenes',()=>{
 const stella=cx.schemes().find(s=>s.type==='HxCrypt'&&s.titles?.some(t=>t.includes('Stella')));
 assert.ok(stella,'Café Stella [Steam] HxCrypt scheme loaded');
 assert.ok(Array.isArray(stella.indexKeys)&&stella.indexKeys.length>=1);
 assert.ok(typeof stella.filterKey==='string'&&stella.filterKey.length===16);

 const row=(ja,zh)=>[null,null,[[null,ja],[null,'Hello.'],[null,zh],[null,zh]]];
 const doc1=buildPsb({name:'001.ks',scenes:[{label:'a',texts:[row('「おはよう。」','「早上好。」'),row('「今日もいい天気だね。」','「今天天气也真好呢。」'),row('「そうだね。」','「是啊。」'),row('「出かけようか。」','「出门吧。」')]}]});
 const doc2=buildPsb({name:'002.ks',scenes:[{label:'b',texts:[row('「ただいま。」','「我回来了。」'),row('「おかえりなさい。」','「欢迎回来。」'),row('「お茶にする？」','「要喝茶吗？」'),row('「いただくよ。」','「那就喝吧。」')]}]});

 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hxcrypt-'));
 const oldGarbro=process.env.MEGULIT_GARBRO_ROOT;
 process.env.MEGULIT_GARBRO_ROOT=path.join(tmp,'nogarbro');
 try{
  const game=path.join(tmp,'game');fs.mkdirSync(game);
  writeHxXp3(path.join(game,'scn.xp3'),stella,stella.indexKeys[0],[
   {id:1n,key:0x123456789abcdef0n,adlr:0x11111111,data:doc1},
   {id:0x100000002n,key:0x0fedcba987654321n,adlr:0x22222222,data:doc2},
  ]);
  const probe=require('../services/adapter-probe-core.cjs').probeGame({dir:game,executable:''});
  assert.equal(probe.detected,'kirikiri-cx');
  assert.equal(probe.step,'ok');
  assert.equal(probe.lines,8);
  assert.equal(probe.japaneseLines,8);

  const engine=require('../services/original-engines/scenes.cjs').ENGINES['kirikiri-cx'];
  const parsed=engine.scenes(game).map(s=>engine.parse(s.read()));
  assert.equal(parsed[0].lines[0],'「おはよう。」');
  assert.equal(parsed[0].zh[0],'「早上好。」');
  assert.equal(parsed[1].lines[0],'「ただいま。」');

  // Partial-offset decryption matches full-buffer decryption for both randomType 0 and 1
  for(const rt of [0,1]){
   const sch={...stella,randomType:rt};
   const full=Buffer.alloc(4096,0x5a);cx.hxEntryDecryptor(sch,1n,0x9988776655443322n)(0,full);
   const part=Buffer.alloc(4096,0x5a);
   const d=cx.hxEntryDecryptor(sch,1n,0x9988776655443322n);
   d(0,part,0,700);d(700,part,700,3396);
   assert.deepEqual(part,full,'split read matches for randomType '+rt);
  }
 }finally{
  if(oldGarbro===undefined)delete process.env.MEGULIT_GARBRO_ROOT;else process.env.MEGULIT_GARBRO_ROOT=oldGarbro;
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});

test('cold run skips Hxv4 games that cx-filter already decrypts statically',()=>{
 const stella=cx.schemes().find(s=>s.type==='HxCrypt'&&s.titles?.some(t=>t.includes('Stella')));
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hxcold-skip-'));
 try{
  const root=path.join(tmp,'root'),game=path.join(tmp,'game');fs.mkdirSync(root);fs.mkdirSync(game);
  const pe=Buffer.alloc(512);pe.write('MZ',0,'latin1');pe.writeUInt32LE(0x80,0x3c);pe.write('PE\0\0',0x80,'latin1');pe.writeUInt16LE(0x14c,0x84);
  fs.writeFileSync(path.join(game,'game.exe'),pe);
  const row=ja=>[null,null,[[null,ja]]];
  const doc=buildPsb({name:'001.ks',scenes:[{label:'a',texts:[row('「おはよう。」'),row('「今日も暑いね。」')]}]});
  writeHxXp3(path.join(game,'scn.xp3'),stella,stella.indexKeys[0],[
   {id:1n,key:0x1122334455667788n,adlr:0x33333333,data:doc},
   {id:2n,key:0x8877665544332211n,adlr:0x44444444,data:doc},
  ]);
  const cold=require('../services/kirikiri-cold.cjs');
  assert.equal(cold.consider(root,{id:'g1',executable:path.join(game,'game.exe')}),false);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('a new HxCrypt profile retries only its empty scene cache',t=>{
 const profile=cx.schemes().find(s=>s.titles?.includes('lapla.exe (2025 Windows DL)'));
 assert.ok(profile,'the 2025 Hxv4 profile is bundled');
 const stella=cx.schemes().find(s=>s.type==='HxCrypt'&&s.titles?.some(title=>title.includes('Stella')));

 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hx-cache-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 t.mock.method(os,'tmpdir',()=>tmp);
 const cacheDir=path.join(tmp,'megulit-cx');
 fs.mkdirSync(cacheDir);
 const scenes=require('../services/original-engines/scenes.cjs');

 function seedCache(name,scheme,docs,count=2){
  const dir=path.join(tmp,name);
  fs.mkdirSync(dir);
  const file=path.join(dir,'data.xp3');
  const entries=['「おはよう。」','「おかえりなさい。」'].slice(0,count).map((ja,i)=>({
   id:BigInt(i+1)|(i?0x100000000n:0n),key:BigInt(1234+i),adlr:i,
   data:buildPsb({name:i+'.ks',scenes:[{texts:[[null,null,[[null,ja]]]]}]}),
  }));
  writeHxXp3(file,scheme,scheme.indexKeys[0],entries);
  const {size,mtimeMs}=fs.statSync(file);
  const hash=crypto.createHash('sha256').update(file.toLowerCase()+'|'+size+'|'+mtimeMs+'|8').digest('hex');
  const cache=path.join(cacheDir,hash.slice(0,24)+'.json');
  const previous=JSON.stringify({schema:1,file,docs});
  fs.writeFileSync(cache,previous);
  return {dir,file,cache,previous};
 }

 const empty=seedCache('empty',profile,[]);
 assert.equal(scenes.cxPrepareSync(empty.dir,{deadline:Date.now()+10000}),1);
 assert.deepEqual(scenes.read('kirikiri-cx',empty.dir).flatMap(s=>s.lines),['「おはよう。」','「おかえりなさい。」']);
 assert.equal(scenes.cxPrepareSync(empty.dir),0);
 assert.equal(fs.readFileSync(empty.cache,'utf8'),empty.previous);

 const working=seedCache('working',profile,[{entry:'cached.ks',scenes:[{rows:[['「また明日。」']]}]}]);
 assert.equal(scenes.cxPrepareSync(working.dir),0);
 assert.deepEqual(scenes.read('kirikiri-cx',working.dir).flatMap(s=>s.lines),['「また明日。」']);
 assert.equal(fs.readFileSync(working.cache,'utf8'),working.previous);

 const unrelated=seedCache('unrelated',stella,[]);
 assert.equal(scenes.cxPrepareSync(unrelated.dir),0);
 assert.deepEqual(scenes.read('kirikiri-cx',unrelated.dir),[]);

 // An index that matches the profile can still yield no scenes.
 const incomplete=seedCache('incomplete',profile,[],1);
 const other=path.join(incomplete.dir,'late.xp3');
 fs.copyFileSync(empty.file,other);
 const engine=scenes.ENGINES['kirikiri-cx'];
 const checks=[];
 const getRevision=cx.hxCacheRevision;
 t.mock.method(cx,'hxCacheRevision',file=>{
  checks.push(scenes.withCxProbe(()=>engine.scenes(incomplete.dir).length));
  return getRevision(file);
 });
 assert.equal(scenes.cxPrepareSync(incomplete.dir,{deadline:Date.now()-1}),0);
 assert.deepEqual(checks,[],'an expired probe does not inspect old caches');
 assert.equal(scenes.cxPrepareSync(incomplete.dir),2);
 assert.deepEqual(checks,[2],'the missing cache is built before retrying the empty cache');
 assert.ok(engine.sources(incomplete.dir).includes(incomplete.cache),'an empty retry keeps the previous fingerprint source');
 assert.equal(scenes.cxPrepareSync(incomplete.dir),0,'an empty retry stays cached');
});

test('the 2025 HxCrypt profile matches native entry streams with either open flag',()=>{
 const profile=cx.schemes().find(s=>s.titles?.includes('lapla.exe (2025 Windows DL)'));
 assert.ok(profile,'the 2025 Hxv4 profile is bundled');
 // xp3-brute 0.3.7 native filter applied to synthetic bytes across the prefix, split and boundary offsets.
 const vectors=[
  [1n,0x123456789abcdef0n,'fd853a27ef6d93cc960dbc229c8763d914b7d8a505f8f22bb6152dd4b83166b8'],
  [0x100000002n,0x0fedcba987654321n,'ff7d5ecfd5c7a4bc9002583abfa6fe23c7b0557c27a0b5ab4e8d45443706af4d'],
 ];
 for(const [id,key,expected] of vectors){
  const bytes=Buffer.alloc(70000,0x5a);
  cx.hxEntryDecryptor(profile,id,key)(0,bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected);
 }
});
