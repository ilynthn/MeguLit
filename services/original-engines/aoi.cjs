// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E662 SystemAoi (SofthouseChara: BUNNYBLACK, 忍流, ウィザーズクライマー): script archives *.box, as in GARbro (morkt, MIT:
   Aoi/ArcBOX.cs):
   AOIB   "AOIB" + version ("OX4 " / "OX5 " / "OX6\0" / "OX7\0" / "X10" / "X12"), i32 count at 8. Version > 5: index from
          0x10, 0x18 each (name[0x10], u32 offset, u32 size); 4 and 5: u32 offsets from 0xC, sizes from the next one.
          Entries are XOR'd with one byte per version (VERSION_KEY)
   AOIMY  "AOIMY01\0", i32be count at 8, index from 0x10 (name[0x10], u32be offset, u32be size); every byte XOR'd with
          a key made from its own file offset (keyAt)
   AOIMY  UTF-16 "AOIMY01\0", i32be count at 0x10, index from 0x18 (UTF-16 name[0x20], u32be offset, u32be size), plain
   The script bytecode has no public description: the generic scan reads the text (半成品). Resources are *.vfs. */
const kit=require('./kit.cjs');
const VERSION_KEY={4:0xad,5:0xad,6:0xb4,7:0xb4,10:0xb2,12:0xa5};
function keyAt(offset){const o=offset>>>0,C=0x5cc8e9d7;
 const shl=(v,n)=>n>=32?0:(v<<n)>>>0,shr=(v,n)=>n>=32?0:v>>>n;
 const v1=(((o-C)>>>0)+shr(0xa3371629,(o&15)+1)-shl(C,31-(o&15)))>>>0;
 const v3=shl(v1,31-((o>>>4)&15)),v4=shr(v1,((o>>>4)&15)+1);
 const t5=((o-C)+v3+v4)>>>0;const v5=((o-C)+shl(t5,31-((o>>>8)&15))+shr(t5,((o>>>8)&15)+1))>>>0;
 const v6=((o-C)+shl(v5,31-((o>>>12)&15))+shr(v5,((o>>>12)&15)+1))>>>0;
 const v7=((o-C)+shl(v6,31-((o>>>16)&15))+shr(v6,((o>>>16)&15)+1))>>>0;
 const v8=(o>>>20)&15,t9=((o-C)+shl(v7,31-v8)+shr(v7,v8+1))>>>0;
 const v9=((o-C)+shl(t9,31-((o>>>24)&15))+shr(t9,((o>>>24)&15)+1))>>>0;
 return shr((((o-C)+shl(v9,31-(o>>>28))+shr(v9,(o>>>28)+1))>>>0),o&15)&255;}
function list(file){const sz=kit.size(file);if(sz<0x20)return null;const h=kit.readAt(file,0,0x20),tag=h.toString('latin1',0,4);
 const fixed=(b,at,len)=>{const nb=b.subarray(at,at+len),z=nb.indexOf(0);return kit.cname(nb);};
 const ok=e=>e.offset+e.size<=sz&&e.size>=0;
 if(tag==='AOIB'){const v=h.toString('latin1',4,8);const version=v.startsWith('X10')?10:v.startsWith('X12')?12:v==='OX7\0'?7:v==='OX6\0'?6:v==='OX5 '?5:v==='OX4 '?4:0;if(!version)return null;
  const count=h.readInt32LE(8);if(count<=0||count>100000)return null;const key=VERSION_KEY[version],out=[];
  if(version>5){const idx=kit.readAt(file,0x10,count*0x18);if(idx.length<count*0x18)return null;
   for(let i=0;i<count;i++){const e={name:fixed(idx,i*0x18,0x10),offset:idx.readUInt32LE(i*0x18+0x10),size:idx.readUInt32LE(i*0x18+0x14),key};if(!e.name||!ok(e))return null;out.push(e);}}
  else{const idx=kit.readAt(file,0xc,count*4+4);const base=require('node:path').basename(file).replace(/\.[^.]+$/,'');
   for(let i=0;i<count;i++){const offset=idx.readUInt32LE(i*4),next=i+1===count?sz:idx.readUInt32LE(i*4+4);const e={name:base+'#'+String(i).padStart(2,'0')+'.evt',offset,size:next-offset,key};if(!ok(e))return null;out.push(e);}}
  return out;}
 if(h.toString('latin1',0,8)==='AOIMY01\0'){const count=h.readInt32BE(8);if(count<=0||count>100000)return null;const idx=kit.readAt(file,0x10,count*0x18),out=[];if(idx.length<count*0x18)return null;
  for(let i=0;i<count;i++){const e={name:fixed(idx,i*0x18,0x10),offset:idx.readUInt32BE(i*0x18+0x10),size:idx.readUInt32BE(i*0x18+0x14),byOffset:true};if(!e.name||!ok(e))return null;out.push(e);}return out;}
 if(h.toString('utf16le',0,16)==='AOIMY01\0'){const count=h.readInt32BE(0x10);if(count<=0||count>100000)return null;const idx=kit.readAt(file,0x18,count*0x28),out=[];if(idx.length<count*0x28)return null;
  for(let i=0;i<count;i++){let n=0;const nb=idx.subarray(i*0x28,i*0x28+0x20);while(n<0x20&&(nb[n]||nb[n+1]))n+=2;if(!n)return null;
   const e={name:nb.toString('utf16le',0,n),offset:idx.readUInt32BE(i*0x28+0x20),size:idx.readUInt32BE(i*0x28+0x24)};if(!ok(e))return null;out.push(e);}return out;}
 return null;}
function read(file,e){const b=Buffer.from(kit.readAt(file,e.offset,e.size));if(e.key!==undefined)for(let i=0;i<b.length;i++)b[i]^=e.key;else if(e.byOffset)for(let i=0;i<b.length;i++)b[i]^=keyAt(e.offset+i);return b;}
const engine=kit.engine({id:'aoi',hint:'*.box（AOIB / AOIMY）',archives:{name:/\.box$/i,list,read,sort:false},parse:buf=>({lines:kit.decodeRuns(buf),anchors:[]}),test:()=>false});
module.exports={engine,list,read,keyAt,VERSION_KEY};
