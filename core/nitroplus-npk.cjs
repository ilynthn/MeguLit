// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E409 Nitroplus archives for the Steam Saya port (user 2026-11-11).
//   NPK2  N4 engine (Saya_Steam.exe): "NPK2", u32 2, 16-byte IV, u32 count, u32 index size, then the AES-256-CBC
//         (PKCS7) index. Entry: u8 flag, u16 name length, UTF-8 name, u32 size, SHA-256 of the data, u32 segment count,
//         segments of {i64 offset, u32 stored size, u32 size, u32 unpacked size}. Every segment is encrypted on its own
//         with the header IV and holds up to 64 KiB of data, raw-deflated when size < unpacked size. Layout as GARbro's
//         NpkOpener; the per-game key comes from GARbro's scheme database (crskycode fork, "The Song of Saya").
//   PAK   the 2003 engine (saya.exe): u32 2, u32 count, u32 index size, u32 packed index size, 0x104-byte name,
//         zlib index at 0x114: {u32 name length, Shift-JIS name, u32 offset, u32 size, u32 size, u32 packed, u32 packed size}.
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');

const KEYS={saya:Buffer.from('763a14338b0dac040accfc13851cfacbb20b000b01f868486b460f8c34d42a96','hex')};
const SEGMENT=65536;

function aes(decrypt,key,iv,data){const c=(decrypt?crypto.createDecipheriv:crypto.createCipheriv)('aes-256-cbc',key,iv);return Buffer.concat([c.update(data),c.final()]);}

function isNpk2(buf){return buf.length>=0x20&&buf.toString('latin1',0,4)==='NPK2';}
function readNpk(buf,key=KEYS.saya){
 if(!isNpk2(buf))throw Error('NPK_NOT_NPK2');
 const iv=Buffer.from(buf.subarray(8,24)),count=buf.readInt32LE(0x18),size=buf.readUInt32LE(0x1c);
 if(count<0||count>100000||0x20+size>buf.length)throw Error('NPK_HEADER');
 let idx;try{idx=aes(true,key,iv,buf.subarray(0x20,0x20+size));}catch{throw Error('NPK_KEY');}
 const entries=npkIndex(idx,count,buf.length);
 return {buf,key,iv,version:buf.readUInt32LE(4),entries};}
/* E580 the decrypted index -> entries; shared with the script reader (services/original-engines/npk.cjs) */
function npkIndex(idx,count,fileSize=Infinity){let o=0;const entries=[];
 for(let i=0;i<count;i++){
  const flag=idx[o++],nl=idx.readUInt16LE(o);o+=2;if(!nl||o+nl>idx.length)throw Error('NPK_INDEX');
  const name=idx.toString('utf8',o,o+nl);o+=nl;const length=idx.readUInt32LE(o);o+=4;const hash=Buffer.from(idx.subarray(o,o+32));o+=32;
  const n=idx.readInt32LE(o);o+=4;const segments=[];
  for(let j=0;j<n;j++){segments.push({offset:Number(idx.readBigInt64LE(o)),stored:idx.readUInt32LE(o+8),size:idx.readUInt32LE(o+12),unpacked:idx.readUInt32LE(o+16)});o+=20;}
  for(const s of segments)if(s.offset+s.stored>fileSize)throw Error('NPK_INDEX');
  entries.push({flag,name,length,hash,segments});}
 return entries;}
function npkData(arc,entry){
 return Buffer.concat(entry.segments.map(s=>{const plain=aes(true,arc.key,arc.iv,arc.buf.subarray(s.offset,s.offset+s.stored)).subarray(0,s.size);return s.size<s.unpacked?zlib.inflateRawSync(plain):plain;}));}

// Writes a new archive: entries whose data is given are packed again, the rest keep their encrypted segments as they are.
function writeNpk(arc,replace=new Map()){
 const parts=[],items=arc.entries.map(e=>{
  const data=replace.get(e.name);
  if(!data)return {e,length:e.length,hash:e.hash,segments:e.segments.map(s=>({...s,bytes:arc.buf.subarray(s.offset,s.offset+s.stored)}))};
  const segments=[];for(let at=0;at<data.length;at+=SEGMENT){const chunk=data.subarray(at,at+SEGMENT);let body=zlib.deflateRawSync(chunk,{level:9});if(body.length>=chunk.length)body=chunk;
   const bytes=aes(false,arc.key,arc.iv,body);segments.push({size:body.length,unpacked:chunk.length,stored:bytes.length,bytes});}
  return {e,length:data.length,hash:crypto.createHash('sha256').update(data).digest(),segments};});
 const indexSize=plain=>aes(false,arc.key,arc.iv,plain).length;
 const build=base=>{let at=base;const rows=[];
  for(const it of items){const name=Buffer.from(it.e.name,'utf8'),head=Buffer.alloc(3+name.length+4+32+4);let o=0;head[o++]=it.e.flag;head.writeUInt16LE(name.length,o);o+=2;name.copy(head,o);o+=name.length;head.writeUInt32LE(it.length,o);o+=4;it.hash.copy(head,o);o+=32;head.writeInt32LE(it.segments.length,o);rows.push(head);
   for(const s of it.segments){const seg=Buffer.alloc(20);seg.writeBigInt64LE(BigInt(at),0);seg.writeUInt32LE(s.stored,8);seg.writeUInt32LE(s.size,12);seg.writeUInt32LE(s.unpacked,16);rows.push(seg);s.at=at;at+=s.stored;}}
  return Buffer.concat(rows);};
 // The index size depends only on the entry layout, so a first pass with placeholder offsets fixes the data start.
 const first=build(0),start=0x20+indexSize(first),index=aes(false,arc.key,arc.iv,build(start));
 const header=Buffer.alloc(0x20);header.write('NPK2',0,'latin1');header.writeUInt32LE(arc.version,4);arc.iv.copy(header,8);header.writeInt32LE(items.length,0x18);header.writeUInt32LE(index.length,0x1c);
 parts.push(header,index);for(const it of items)for(const s of it.segments)parts.push(s.bytes);
 return Buffer.concat(parts);}

function isPak(buf){return buf.length>0x114&&buf.readUInt32LE(0)===2&&buf.readUInt32LE(12)>0&&buf[0x114]===0x78;}
function readPak(buf){
 if(!isPak(buf))throw Error('PAK_FORMAT');
 const count=buf.readUInt32LE(4),packed=buf.readUInt32LE(12),idx=zlib.inflateSync(buf.subarray(0x114,0x114+packed)),base=0x114+packed,sj=new TextDecoder('shift_jis'),out=[];let o=0;
 for(let i=0;i<count;i++){const l=idx.readUInt32LE(o);o+=4;const raw=idx.subarray(o,o+l);o+=l;
  const off=idx.readUInt32LE(o),size=idx.readUInt32LE(o+4),isPacked=idx.readUInt32LE(o+12),psize=idx.readUInt32LE(o+16);o+=20;
  /* Shift-JIS 0x5C is the path separator here, not a yen sign */
  const name=raw.toString('latin1').split('\\').map(p=>sj.decode(Buffer.from(p,'latin1'))).join('/');
  out.push({name,read:()=>{const d=buf.subarray(base+off,base+off+(isPacked?psize:size));return isPacked?zlib.inflateSync(d):Buffer.from(d);}});}
 return out;}

// New archives from scratch (tests, and files the port adds): {name: Buffer}.
function createNpk(files,{key=KEYS.saya,iv=crypto.randomBytes(16)}={}){
 const entries=Object.keys(files).map(name=>({flag:0,name,length:0,hash:Buffer.alloc(32),segments:[]}));
 return writeNpk({buf:Buffer.alloc(0),key,iv,version:2,entries},new Map(Object.entries(files)));}
function createPak(files,tag='SAYA'){
 const rows=[],bodies=[];let off=0;
 /* ASCII names only; folders are written with the engine's backslash */
 for(const [name,data] of Object.entries(files)){const n=Buffer.from(name.split('/').join(String.fromCharCode(92)),'latin1');
  const body=zlib.deflateSync(data),row=Buffer.alloc(4+n.length+20);row.writeUInt32LE(n.length,0);n.copy(row,4);let o=4+n.length;
  row.writeUInt32LE(off,o);row.writeUInt32LE(data.length,o+4);row.writeUInt32LE(data.length,o+8);row.writeUInt32LE(1,o+12);row.writeUInt32LE(body.length,o+16);rows.push(row);bodies.push(body);off+=body.length;}
 const raw=Buffer.concat(rows),idx=zlib.deflateSync(raw),head=Buffer.alloc(0x114);
 head.writeUInt32LE(2,0);head.writeUInt32LE(rows.length,4);head.writeUInt32LE(raw.length,8);head.writeUInt32LE(idx.length,12);head.write(tag,0x14,'latin1');
 return Buffer.concat([head,idx,...bodies]);}
module.exports={npkIndex,KEYS,isNpk2,readNpk,npkData,writeNpk,createNpk,isPak,readPak,createPak};
