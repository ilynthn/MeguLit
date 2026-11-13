// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 synthetic "running game" for the runtime harvest tests. Nothing here is a real game or engine.

   game(root): a folder with Game.exe and data/scene.rhp, an archive in a made-up format ("RHPK") no reader knows:
     "RHPK" u32 version, u32 index offset, u32 index size; entries at 16..; the index at the end, records of
     {u32 offset, u32 size, u32 unpacked, char name[20]} (32 bytes) — index and entries both Blowfish-ECB (little-endian
     words) under a key the folder never holds. The offline probe can open none of it.
   memory(g): what that game would hold while it runs, as the regions native/RuntimeHarvest.exe streams:
     image Game.exe (32-bit): .text with the TEA delta and code that references the index slot and the dispatch table,
       .rdata with the Blowfish pi table, Camellia sigma, a 64-entry dispatch table into .text, the pass phrase, a TEA key
       .data with pointers to the index table and the Blowfish context on the heap
     heap: the Blowfish context (state of the pass phrase), a Camellia-128 key schedule, the decrypted index table with a
       count field before it, a decoded bytecode script (opcode 0x10, u8 length, Shift-JIS text, NUL) and decoys: plain
       Japanese lines and English prose that must never come out of the harvest.
   heapBlob(g): the heap part alone as one buffer (the native end-to-end test holds it in a child process). */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fx=require('./adapter-fixtures.cjs');
const S=require('../../services/runtime-harvest-scan.cjs');
const PASS='MeguKey2026';
const ENGLISH=['The quick brown fox jumps over the lazy dog, and then it runs away.','Please tell me what you think about this story before we go home.'];
const JP_LINES=[...fx.LINES,'今夜は月がとても綺麗ですね','あなたのことをずっと待っていました'];
const CAMELLIA_KEY=Buffer.from('0123456789abcdeffedcba9876543210','hex');
const TEA_KEY=Buffer.from('a1b2c3d4e5f60718293a4b5c6d7e8f90','hex');

function bfEncrypt(buf,state){/* ECB, little-endian words, tail left as is */const w=new Uint32Array(1042);for(let i=0;i<1042;i++)w[i]=state.readUInt32LE(i*4);const out=Buffer.from(buf);
 for(let i=0;i+8<=out.length;i+=8){S._internal.bfEncrypt(w,0,18,out.readUInt32LE(i),out.readUInt32LE(i+4));out.writeUInt32LE(S._internal.BF[0],i);out.writeUInt32LE(S._internal.BF[1],i+4);}return out;}
const pad8=b=>Buffer.concat([b,Buffer.alloc((8-b.length%8)%8)]);
function teaEncryptBlock(v0,v1,k){let sum=0;for(let i=0;i<32;i++){sum=(sum+0x9e3779b9)>>>0;v0=(v0+((((v1<<4)+k[0])^(v1+sum)^((v1>>>5)+k[1]))>>>0))>>>0;v1=(v1+((((v0<<4)+k[2])^(v0+sum)^((v0>>>5)+k[3]))>>>0))>>>0;}return [v0,v1];}
function teaEncrypt(buf,key){const k=[0,1,2,3].map(i=>key.readUInt32LE(i*4)),out=Buffer.from(buf);for(let i=0;i+8<=out.length;i+=8){const [a,b]=teaEncryptBlock(out.readUInt32LE(i),out.readUInt32LE(i+4),k);out.writeUInt32LE(a,i);out.writeUInt32LE(b,i+4);}return out;}

function game(root,name='Runtime Locked Game',scenes=20){
 const dir=path.join(root,'games',name);fs.mkdirSync(path.join(dir,'data'),{recursive:true});
 const exe=path.join(dir,'Game.exe');const body=Buffer.alloc(8192);for(let i=0;i<body.length;i++)body[i]=(i*13+name.length)&255;fs.writeFileSync(exe,body);
 const state=S.blowfishState(Buffer.from(PASS));
 const files=[];for(let i=0;i<scenes;i++)files.push(['scene'+i+'.txt',fx.scene(i)]);files.push(['bg01.png',Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),crypto.randomBytes(600)])]);
 let at=16;const records=[],bodies=[];
 for(const [n,raw] of files){const enc=bfEncrypt(pad8(raw),state);records.push({name:n,offset:at,size:enc.length,unpacked:raw.length});bodies.push(enc);at+=enc.length;}
 const index=Buffer.alloc(records.length*32);records.forEach((r,i)=>{index.writeUInt32LE(r.offset,i*32);index.writeUInt32LE(r.size,i*32+4);index.writeUInt32LE(r.unpacked,i*32+8);index.write(r.name,i*32+12,'latin1');});
 const head=Buffer.alloc(16);head.write('RHPK',0,'latin1');head.writeUInt32LE(1,4);head.writeUInt32LE(at,8);head.writeUInt32LE(index.length,12);
 const archive=Buffer.concat([head,...bodies,bfEncrypt(index,state)]);fs.writeFileSync(path.join(dir,'data','scene.rhp'),archive);
 return {dir,exe,archive:path.join(dir,'data','scene.rhp'),archiveSize:archive.length,records,index,state,lines:scenes*6,scenes};}

/* the decoded bytecode of a scene: 0x11 name / 0x10 text, u8 byte length, Shift-JIS, NUL, then a 4-byte argument */
function bytecode(n=80){const parts=[Buffer.from('SCB1'),Buffer.alloc(12)];for(let i=0;i<n;i++){const line=JP_LINES[i%JP_LINES.length];const t=fx.sjis(i%5===0?'めぐみん':line);
 parts.push(Buffer.from([i%5===0?0x11:0x10,t.length]),t,Buffer.from([0,2,0,0,i&255]));}return Buffer.concat(parts);}
function camelliaSchedule(){const KL=[0,1,2,3].map(i=>CAMELLIA_KEY.readUInt32BE(i*4)),KA=[0x1a2b3c4d,0x5e6f7081,0x92a3b4c5,0xd6e7f809];
 const rows=[KL,KA,S.rot128(KL,15),S.rot128(KA,15),S.rot128(KA,30),S.rot128(KL,45),S.rot128(KA,45),S.rot128(KL,60),S.rot128(KA,60),S.rot128(KL,77),S.rot128(KL,94),S.rot128(KA,94),S.rot128(KL,111),S.rot128(KA,111)];
 const b=Buffer.alloc(rows.length*16);rows.forEach((r,i)=>r.forEach((v,k)=>b.writeUInt32LE(v>>>0,i*16+k*4)));return b;}
function decoys(){return Buffer.concat([...JP_LINES.map(l=>Buffer.concat([fx.sjis(l),Buffer.alloc(2)])),...JP_LINES.map(l=>Buffer.concat([Buffer.from(l,'utf16le'),Buffer.alloc(2)])),...ENGLISH.map(e=>Buffer.from(e+'\0','latin1'))]);}

const HEAP=0x02000000;
/* the heap blob and where things sit in it */
function heapBlob(g){const parts=[],at={};let size=0;const put=(name,b,align=16)=>{const padN=(align-size%align)%align;if(padN){parts.push(Buffer.alloc(padN,0));size+=padN;}at[name]=size;parts.push(b);size+=b.length;};
 put('pad',Buffer.alloc(256,0));
 put('bfctx',Buffer.concat([Buffer.from([1,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0]),g.state]));
 put('cam',camelliaSchedule());
 put('count',Buffer.from(Uint32Array.of(g.records.length,32,0,0).buffer));at.index=size;parts.push(g.index);size+=g.index.length;
 put('decoy',decoys());
 put('script',Buffer.concat([bytecode(),Buffer.alloc(4096,0)]),4096);
 put('decoy2',decoys());
 put('tail',Buffer.alloc(4096,0),4096);
 return {blob:Buffer.concat(parts),at};}

function memory(g){
 const BASE=0x400000,TEXT=BASE+0x1000,RDATA=BASE+0x11000,DATA=BASE+0x21000;
 const heap=heapBlob(g),H=HEAP;
 const text=Buffer.alloc(0x10000,0x90);/* nop sled with a few instructions */
 const rdata=Buffer.alloc(0x10000,0),data=Buffer.alloc(0x1000,0);
 /* .rdata: pi table, Camellia sigma, dispatch table, pass phrase, TEA key */
 for(const [i,v] of [0x243f6a88,0x85a308d3,0x13198a2e,0x03707344].entries())rdata.writeUInt32LE(v,0x100+i*4);
 rdata.writeUInt32BE(0xa09e667f,0x200);rdata.writeUInt32BE(0x3bcc908b,0x204);
 for(let i=0;i<64;i++)rdata.writeUInt32LE(TEXT+0x400+i*0x40,0x1000+i*4);
 rdata.write(PASS+'\0',0x3000,'latin1');TEA_KEY.copy(rdata,0x3100);
 /* .data: pointers to heap objects */
 data.writeUInt32LE(H+heap.at.index,0x10);data.writeUInt32LE(H+heap.at.bfctx,0x20);
 /* .text: mov ecx,[slot] ; push table ; mov eax,0x9e3779b9 */
 Buffer.from([0x55,0x8b,0xec,0x8b,0x0d]).copy(text,0x100);text.writeUInt32LE(DATA+0x10,0x105);Buffer.from([0x85,0xc9,0x74,0x10]).copy(text,0x109);
 Buffer.from([0x56,0x57,0x51,0x68]).copy(text,0x200);text.writeUInt32LE(RDATA+0x1000,0x204);Buffer.from([0xe8,0,0,0,0]).copy(text,0x208);
 Buffer.from([0xb8,0xb9,0x79,0x37,0x9e]).copy(text,0x300);
 const header={v:1,pid:1234,bits:32,modules:[{name:'Game.exe',base:'0x'+BASE.toString(16),size:0x30000},{name:'ゲーム用.dll',base:'0x10000000',size:0x1000}],
  regions:[{base:'0x'+TEXT.toString(16),size:text.length,protect:0x20,type:0x1000000},{base:'0x'+RDATA.toString(16),size:rdata.length,protect:0x02,type:0x1000000},{base:'0x'+DATA.toString(16),size:data.length,protect:0x04,type:0x1000000},{base:'0x'+H.toString(16),size:heap.blob.length,protect:0x04,type:0x20000}]};
 const regions=[{base:TEXT,bytes:text,index:0},{base:RDATA,bytes:rdata,index:1},{base:DATA,bytes:data,index:2},{base:H,bytes:heap.blob,index:3}];
 return {header,regions,heap,addresses:{TEXT,RDATA,DATA,H}};}

/* a stream exactly as RuntimeHarvest.exe writes it */
function stream(mem){const parts=[Buffer.from(JSON.stringify(mem.header)+'\n')];
 for(const r of mem.regions)for(let at=0;at<r.bytes.length;at+=1<<20){const data=r.bytes.subarray(at,Math.min(r.bytes.length,at+(1<<20)));const h=Buffer.alloc(24);h.write('MLRH',0,'latin1');h[4]=1;h.writeBigUInt64LE(BigInt(r.base+at),8);h.writeUInt32LE(data.length,16);h.writeUInt32LE(r.index,20);parts.push(h,data);}
 const sum=Buffer.from(JSON.stringify({read:1,regions:mem.regions.length,ms:1,stop:'done'}));const h=Buffer.alloc(24);h.write('MLRH',0,'latin1');h[4]=2;h.writeUInt32LE(sum.length,16);parts.push(h,sum);
 return Buffer.concat(parts);}

/* known plaintext the runtime-dump DLL would have saved: a TEA-encrypted file and an xor-encrypted one in the folder */
function dumpPairs(dir){const p1=fx.scene(1),c1=teaEncrypt(pad8(p1),TEA_KEY);const key=Buffer.from('4d6567754c6974','hex');const p2=fx.scene(2),c2=Buffer.from(p2.map((x,i)=>x^key[i%key.length]));
 fs.writeFileSync(path.join(dir,'tea.dat'),c1);fs.writeFileSync(path.join(dir,'xor.dat'),c2);
 return [{plain:pad8(p1),cipher:c1,offset:0,source:'tea.dat'},{plain:p2,cipher:c2,offset:0,source:'xor.dat'}];}

module.exports={game,memory,heapBlob,stream,bytecode,dumpPairs,teaEncrypt,bfEncrypt,pad8,PASS,ENGLISH,JP_LINES,CAMELLIA_KEY,TEA_KEY,HEAP};
