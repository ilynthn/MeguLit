// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E590 Seraph / Seraphim (Assemblage, Fantom; also Archangel: ~60 company releases, the last in 2012). Format references
   (read, not copied): GARbro ArcFormats/Seraphim/ArcSCN.cs (morkt, MIT); the engine is recognised the way LunaHook does
   (ArchPac.Dat + ScnPac.Dat + Voice0.dat).
     ScnPac.dat   i32 count, then count + 1 u32 offsets (the last is the file size); entry i is [offset i, offset i + 1)
                  (Archangel: u32 first-entry offset = 4 x count, then a u32 size table, entries run one after the other)
     entry        u32 head: 1 followed by a zlib stream (0x78 at +4) = zlib; a head below 4 or with a high byte is stored (or zlib
                  when its first byte is 0x78, then packed again); anything else is a packed script: u32 unpacked size, then
                  control bytes: bit 7 set = reference ((ctl << 3 | lo >> 5) & 0x3FF) + 1 back, (lo & 0x1F) + 1 long, else
                  ctl + 1 literal bytes
   The script grammar itself has no public description: the unpacked scripts are read with the generic Japanese-text scan
   (kit.decodeRuns, which also reads a GBK patch), so lines are approximate and pairing with a patch is by position. */
const kit=require('./kit.cjs'),path=require('node:path');
const pad=i=>String(i).padStart(5,'0');

function list(file){if(!/^scnpac\.dat$/i.test(path.basename(file)))return null;const fsz=kit.size(file),h=kit.head(file,8);if(fsz<8)return null;
 const count=h.readInt32LE(0);
 if(count>0&&count<0x100000&&4*(count+1)+4<=fsz){const t=kit.readAt(file,4,4*(count+1)),offs=[];let ok=t.readUInt32LE(0)>=4+4*(count+1);
  for(let i=0;i<=count&&ok;i++){const o=t.readUInt32LE(i*4);if(i&&o<offs[i-1]||o>fsz)ok=false;offs.push(o);}
  if(ok)return offs.slice(0,count).map((o,i)=>({name:pad(i),offset:o,size:offs[i+1]-o}));}
 /* Archangel: the first u32 is where the data starts, the index is sizes */
 const first=h.readUInt32LE(0),n=first/4;if(first<8||first>=fsz||!Number.isInteger(n)||n>0x100000)return null;
 const t=kit.readAt(file,4,first-4),out=[];let off=first;
 for(let i=0;i<n-1;i++){const sz=t.readUInt32LE(i*4);if(!sz||off+4+sz>fsz)return null;out.push({name:pad(i),offset:off+4,size:sz});off+=sz;}
 return out.length?out:null;}

function lz(src){if(src.length<4)throw new Error('short');const n=src.readInt32LE(0);if(n<0||n>256<<20)throw new Error('size');const out=Buffer.alloc(n);let o=0,p=4;
 while(o<n){if(p>=src.length)throw new Error('eof');const c=src[p++];
  if(c&0x80){const lo=src[p++],off=(((c<<3)|(lo>>5))&0x3ff)+1,cnt=(lo&0x1f)+1;if(off>o)throw new Error('ref');for(let k=0;k<cnt&&o<n;k++,o++)out[o]=out[o-off];}
  else{const cnt=c+1;if(p+cnt>src.length)throw new Error('eof');src.copy(out,o,p,p+cnt);o+=cnt;p+=cnt;}}
 return out;}
function read(file,e){const raw=kit.readAt(file,e.offset,e.size);if(raw.length<4)return raw;const sig=raw.readUInt32LE(0);
 if(sig===1&&raw[4]===0x78){try{return kit.inflate(raw.subarray(4));}catch{return raw;}}
 if(sig<4||(sig&0xff000000)){if((sig&0xff)!==0x78)return raw;let z;try{z=kit.inflate(raw);}catch{return raw;}try{return lz(z);}catch{return z;}}
 try{return lz(raw);}catch{return raw;}}
const engine=kit.engine({id:'seraph',hint:'ScnPac.dat',archives:{name:/^scnpac\.dat$/i,list,read},parse:buf=>({lines:kit.decodeRuns(buf),anchors:[]}),test:()=>false});
engine.heuristic=true;
module.exports={engine,list,read,lz};
