// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E572 AST script engine (シャクナゲ, Red Label, DisAbel, Muscadet, Applemint, eants …; ~141 company releases, the last
   in 2013). Archive layout as in GARbro ArcFormats/ArcAST.cs (morkt, MIT); files have no extension:
     "ARC1" | "ARC2", i32 count, then per entry {u32 offset, u32 unpacked size, u8 name length, name (cp932; XOR 0xFF in
     ARC2)}; an entry's packed size runs to the next entry's offset (the last one to the end of the file). In ARC2 a
     packed entry is LZSS (4 KB window, frame filled with 0xFF) then XOR 0xFF, an unpacked one is XOR 0xFF.
   No description of the scenario files themselves is public. Until a real game shows their grammar, script-looking
   entries (by name: no media extension) are read with the generic text scan the GARbro fallback uses (Shift-JIS runs
   with kana): lines are approximate and pairing with a patch is by position only. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');
const sj=kit.SJIS;
function list(file){let fd;try{fd=fs.openSync(file,'r');}catch{return null;}
 try{const size=fs.fstatSync(fd).size,h=Buffer.alloc(8);if(fs.readSync(fd,h,0,8,0)<8)return null;const sig=h.toString('latin1',0,4);if(sig!=='ARC1'&&sig!=='ARC2')return null;
  const v2=sig==='ARC2',count=h.readInt32LE(4);if(count<=0||count>100000)return null;
  const idx=Buffer.alloc(Math.min(size-8,count*(9+260)));fs.readSync(fd,idx,0,idx.length,8);const raw=[];let p=0;
  for(let i=0;i<count;i++){if(p+9>idx.length)return null;const offset=idx.readUInt32LE(p),unpacked=idx.readUInt32LE(p+4),n=idx[p+8];if(p+9+n>idx.length)return null;
   const nb=Buffer.from(idx.subarray(p+9,p+9+n));if(v2)for(let k=0;k<n;k++)nb[k]^=0xff;raw.push({name:sj.decode(nb),offset,unpacked});p+=9+n;}
  const out=[];for(let i=0;i<raw.length;i++){const e=raw[i];if(!e.offset||e.offset>=size)continue;const next=i+1<raw.length?raw[i+1].offset:size;
   const packed=next===0?e.unpacked:next>=e.offset?next-e.offset:-1;if(packed<0||e.offset+packed>size)return null;out.push({name:e.name,offset:e.offset,size:packed,unpacked:e.unpacked,v2});}
  return out;}finally{fs.closeSync(fd);}}
/* E573 LZSS and the text scan come from kit.cjs (GARbro LzssStream variant: window filled with 0xFF) */
const lzss=(src,size)=>kit.lzss(src,size,{fill:0xff});
function read(file,e){const b=kit.readAt(file,e.offset,e.size);
 if(!e.v2)return b;const d=e.size!==e.unpacked?lzss(b,e.unpacked):Buffer.from(b);for(let i=0;i<d.length;i++)d[i]^=0xff;return d;}
const MEDIA=/\.(png|bmp|jpe?g|ogg|wav|mp3|avi|mpe?g|wmv|ttf|otf|ani|cur|ico)$/i;
const isArc=file=>/^ARC[12]$/.test(kit.head(file,4).toString('latin1'));
function archives(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}
 /* extension-less files only, as GARbro opens them: CsWare's .arc archives start "ARC2" too */
 return names.filter(n=>!/\./.test(n)).map(n=>path.join(dir,n)).filter(f=>{try{return fs.statSync(f).isFile()&&isArc(f);}catch{return false;}});}
function scenes(dir){const out=[];for(const a of archives(dir)){const l=list(a);if(!l)continue;for(const e of l)if(!MEDIA.test(e.name))out.push({name:path.basename(a)+'/'+e.name,read:()=>read(a,e)});}return out.sort((a,b)=>a.name.localeCompare(b.name));}
const parse=buf=>({lines:kit.decodeRuns(Buffer.isBuffer(buf)?buf:Buffer.from(buf)),anchors:[]});
const engine={id:'ast',hint:'无扩展名 ARC1/ARC2 归档',scenes,archives:scenes,sources:archives,parse,test:()=>false,heuristic:true};
module.exports={engine,list,read,lzss,parse};
