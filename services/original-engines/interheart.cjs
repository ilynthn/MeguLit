// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E591 Interheart / Candy Soft FPK (Interheart, Candy Soft: ~33 company releases). Format references (read, not copied): GARbro
   ArcFormats/Interheart/ArcFPK.cs + ArcFPK2.cs (morkt, MIT).
     *.fpk       no magic: i32 count; entries {u32 offset, u32 size, char name[0x10 or 0x18]} (0x10 tried first), data after the
                 index. A count with bit 31 set means the index sits at the end: [i32 count | 0x80000000][data][index][u32 key]
                 [u32 index offset], entries {u32 offset, u32 size, 4 unused bytes, char name[0x18]}, the index XOR-ed with the
                 4 key bytes repeated. "FPK 2.00": u32 count at 0x1C, entries from 0x20 of 0x20 bytes {u32 offset, u32 size,
                 char name[0x18]}, names starting with "/" are folders
     payload     "ZLC2" streams (possibly layered): u32 unpacked size, then control bytes MSB first: 1 = a reference (b0 |
                 (b1 & 0xF0) << 4 back, 0 = 4096; (b1 & 0x0F) + 3 long), 0 = literal
   The script grammar has no public description: *.scr / *.spt / *.txt entries are read with the generic Japanese-text scan
   (kit.decodeRuns, also GBK patches), so lines are approximate and pairing with a patch is by position. */
const kit=require('./kit.cjs');
const nameOf=b=>{const z=b.indexOf(0);return kit.cname(b);};
const okName=n=>n.trim().length>0&&!/[\x00-\x1f]/.test(n);

function plain(file,count,nameSize,fsz){const rec=8+nameSize,idx=kit.readAt(file,4,rec*count);if(idx.length<rec*count)return null;const data=4+rec*count,out=[];
 for(let i=0;i<count;i++){const p=i*rec,name=nameOf(idx.subarray(p+8,p+rec)),offset=idx.readUInt32LE(p),size=idx.readUInt32LE(p+4);if(!okName(name)||offset<data||offset+size>fsz)return null;out.push({name,offset,size});}
 return out;}
function encrypted(file,count,fsz){const t=kit.tail(file,8);if(t.length<8)return null;const key=t.subarray(0,4),at=t.readUInt32LE(4);if(at<4||at>=fsz-8)return null;
 const rec=12+0x18,idx=kit.readAt(file,at,count*rec);if(idx.length<count*rec)return null;for(let i=0;i<idx.length;i++)idx[i]^=key[i&3];const out=[];
 for(let i=0;i<count;i++){const p=i*rec,name=nameOf(idx.subarray(p+8+4,p+8+4+0x18)),offset=idx.readUInt32LE(p),size=idx.readUInt32LE(p+4);if(!okName(name)||offset+size>fsz)return null;out.push({name,offset,size});}
 return out;}
function fpk2(file,fsz){const h=kit.head(file,0x20);if(h.toString('latin1',0,8)!=='FPK 2.00')return null;const count=h.readInt32LE(0x1c);if(count<=0||count>200000)return null;
 const idx=kit.readAt(file,0x20,count*0x20);if(idx.length<count*0x20)return null;const out=[];
 for(let i=0;i<count;i++){const p=i*0x20,name=nameOf(idx.subarray(p+8,p+0x20));if(name.startsWith('/'))continue;const offset=idx.readUInt32LE(p),size=idx.readUInt32LE(p+4);if(offset+size>fsz)return null;out.push({name,offset,size});}
 return out;}
function all(file){const fsz=kit.size(file);if(fsz<0x10)return null;const h=kit.head(file,0x20);
 if(h.toString('latin1',0,4)==='FPK ')return fpk2(file,fsz);
 const c=h.readInt32LE(0);if(c<0){const n=c&0x7fffffff;return n>0&&n<200000?encrypted(file,n,fsz):null;}
 if(c<=0||c>200000||4+(8+0x10)*c>fsz)return null;return plain(file,c,0x10,fsz)||plain(file,c,0x18,fsz);}
const SCRIPT=/\.(scr|spt|txt)$/i;
function list(file){const a=all(file);const s=(a||[]).filter(e=>SCRIPT.test(e.name));return s.length?s:null;}
const isArchive=file=>{try{return !!all(file);}catch{return false;}};

/* E577 ZLC2 is the distance-back LZ shared with SiglusEngine (kit.lzDistance): flags MSB first, 1 = reference */
const ZLC2_TOKEN=(b0,b1)=>({dist:(b0|(b1&0xf0)<<4)||4096,len:(b1&0x0f)+3});
function zlc2(src){if(src.length<8||src.toString('latin1',0,4)!=='ZLC2')return src;const n=src.readUInt32LE(4);if(n>256<<20)return src;
 return kit.lzDistance(src,n,{at:8,msb:true,refIsOne:true,token:ZLC2_TOKEN});}
function read(file,e){let b=kit.readAt(file,e.offset,e.size);for(let i=0;i<4&&b.length>8&&b.toString('latin1',0,4)==='ZLC2';i++)b=zlc2(b);return b;}
const engine=kit.engine({id:'interheart',hint:'*.fpk（*.scr / *.spt）',archives:{name:/\.fpk$/i,list,read},parse:buf=>({lines:kit.decodeRuns(buf),anchors:[]}),test:()=>false});
engine.heuristic=true;
module.exports={engine,list,read,zlc2,isArchive,all};
