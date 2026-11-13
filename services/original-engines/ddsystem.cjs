// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E661 DDSystem (Daisy2 / PIL / SLASH: フランス少女, 絶対階級学園, 三国恋戦記): *.dat archives "DDP2" / "DDP3", as in GARbro
   (morkt, MIT: DDSystem/ArcDDP.cs, SHSystem/ArcHXP.cs ShsCompression):
   DDP2  u32 count at 4; index from 0x20, 16 bytes each: u32 offset, u32 unpacked, u32 packed (0 = stored), u32
   DDP3  u32 count at 4 hash buckets from 0x20 (i32 size, i32 offset); a bucket holds entries u8 length, u32 offset,
         u32 unpacked, u32 packed, 4 bytes, name (length - 17 bytes)
   SHS   byte codes: < 0x20 literal run (0x1D: n + 0x1E, 0x1E: u16be + 0x11E, 0x1F: u32be, else code + 1); else a back
         reference (see shs()) of count + 3 bytes at distance + 1
   Scripts start "DDSx"; "DDSxHXB" ones are XOR'd from 0x10 with a dword key made from their length (bytes 8–10 BE).
   The HXB bytecode has no public description, so the text comes from the generic scan (kit.decodeRuns): 半成品. */
const path=require('node:path');
const kit=require('./kit.cjs');

function shs(src,unpacked){const out=Buffer.alloc(unpacked);let s=0,d=0;const u8=()=>{if(s>=src.length)throw Error('SHS_END');return src[s++];};
 const u16=()=>(u8()<<8)|u8(),u32=()=>((u8()<<24)|(u8()<<16)|(u8()<<8)|u8())>>>0;
 try{while(d<unpacked){let ctl=u8(),count;
  if(ctl<32){count=ctl===0x1d?u8()+0x1e:ctl===0x1e?u16()+0x11e:ctl===0x1f?u32():ctl+1;count=Math.min(count,unpacked-d);if(s+count>src.length)count=src.length-s;src.copy(out,d,s,s+count);s+=count;d+=count;if(s>=src.length&&d<unpacked)break;continue;}
  let offset;if(!(ctl&0x80)){if((ctl&0x60)===0x20){offset=(ctl>>2)&7;count=ctl&3;}else{offset=u8();if((ctl&0x60)===0x40)count=(ctl&0x1f)+4;else{offset|=(ctl&0x1f)<<8;ctl=u8();count=ctl===0xfe?u16()+0x102:ctl===0xff?u32():ctl+4;}}}
  else{count=(ctl>>5)&3;offset=((ctl&0x1f)<<8)|u8();}
  count+=3;offset++;count=Math.min(count,unpacked-d);if(offset>d)break;for(let k=0;k<count;k++,d++)out[d]=out[d-offset];}}catch{}
 return out.subarray(0,d);}
function hxbKey(len){const k=Math.imul(((len<<5)^0xa5),(len+0x6f349))^0x34a9b129;const b=Buffer.alloc(4);b.writeInt32LE(k|0);return b;}
function decryptHxb(data){if(data.length<=16||data.toString('latin1',0,7)!=='DDSxHXB')return data;const len=(data[8]<<16)|(data[9]<<8)|data[10];if(len!==data.length)return data;
 const k=hxbKey(len),out=Buffer.from(data);for(let i=0x10;i<out.length;i++)out[i]^=k[i&3];return out;}

function list(file){const sz=kit.size(file);if(sz<0x30)return null;const h=kit.readAt(file,0,0x20),magic=h.toString('latin1',0,4);if(magic!=='DDP2'&&magic!=='DDP3')return null;
 const count=h.readInt32LE(4);if(count<=0||count>200000)return null;const base=path.basename(file).replace(/\.[^.]+$/,'');const out=[];
 if(magic==='DDP2'){const idx=kit.readAt(file,0x20,count*16);if(idx.length<count*16)return null;
  for(let i=0;i<count;i++){const offset=idx.readUInt32LE(i*16),unpacked=idx.readUInt32LE(i*16+4),packed=idx.readUInt32LE(i*16+8),size=packed||unpacked;
   if(offset+size>sz)return null;out.push({name:base+'#'+String(i).padStart(5,'0'),offset,size,unpacked,packed:!!packed});}
  return out;}
 const bk=kit.readAt(file,0x20,count*8);if(bk.length<count*8)return null;
 for(let i=0;i<count;i++){const size=bk.readInt32LE(i*8),at=bk.readInt32LE(i*8+4);if(!size)continue;if(at<0||at+size>sz)return null;const sec=kit.readAt(file,at,size);let p=0;
  while(p<sec.length){const n=sec[p];if(n<17||p+n>sec.length)break;const offset=sec.readUInt32LE(p+1),unpacked=sec.readUInt32LE(p+5),packed=sec.readUInt32LE(p+9),sz2=packed||unpacked;
   const nb=sec.subarray(p+17,p+n),z=nb.indexOf(0),name=kit.cname(nb);if(offset+sz2>sz)return null;out.push({name,offset,size:sz2,unpacked,packed:!!packed});p+=n;}}
 return out.length?out:null;}
function read(file,e){const raw=kit.readAt(file,e.offset,e.size);return decryptHxb(e.packed?shs(raw,e.unpacked):raw);}
function isScript(file,e){try{const raw=kit.readAt(file,e.offset,Math.min(e.size,0x20));const h=e.packed?shs(raw,4):raw;return h.toString('latin1',0,4)==='DDSx';}catch{return false;}}
const scriptList=file=>{const l=list(file);if(!l)return null;const s=l.filter(e=>isScript(file,e));return s.length?s:null;};
const engine=kit.engine({id:'ddsystem',hint:'*.dat（DDP2 / DDP3，DDSx 剧本）',archives:{name:/\.dat$/i,list:scriptList,read,sort:false},parse:buf=>({lines:kit.decodeRuns(buf),anchors:[]}),test:()=>false});
const isArchive=f=>!!list(f);
module.exports={engine,list,read,shs,decryptHxb,hxbKey,isArchive};
