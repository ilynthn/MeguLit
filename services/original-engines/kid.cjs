// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E663 KID engine (Ever17, Remember11, Memories Off PC): "LNK\0" *.dat archives, as in GARbro (morkt, MIT: Kid/ArcDAT.cs)
   and e17p (dsp2003, GPL-2.0+): i32 count at 4, index from 0x10, 32 bytes each (u32 offset from the end of the index,
   u32 size << 1 | packed, name[0x18]); a packed entry starts "lnd\0", u32 unpacked size at 8, data from 0x10 in the LND
   run coding (lnd()). script.dat holds the *.scr scenes; their bytecode is only partly known (e17p tokenizer), so the
   text comes from the generic scan (半成品). Remember11's AFS archives go through GARbro. */
const kit=require('./kit.cjs');
function lnd(src,unpacked,at=0){const out=Buffer.alloc(unpacked);let s=at,d=0;
 while(d<unpacked&&s<src.length){const ctl=src[s++];
  if(ctl&0x80){if(ctl&0x40){let n=(ctl&0x1f)+2;if(ctl&0x20)n+=src[s++]<<5;n=Math.min(n,unpacked-d);const v=src[s++];out.fill(v,d,d+n);d+=n;}
   else{const n=Math.min(((ctl>>2)&0xf)+2,unpacked-d),off=((ctl&3)<<8)+src[s++]+1;if(off>d)break;for(let k=0;k<n;k++,d++)out[d]=out[d-off];}}
  else if(ctl&0x40){const len=Math.min((ctl&0x3f)+2,unpacked-d);const rep=src[s++];src.copy(out,d,s,s+len);s+=len;d+=len;let n=Math.min(rep*len,unpacked-d);for(let k=0;k<n;k++,d++)out[d]=out[d-len];}
  else{let n=(ctl&0x1f)+1;if(ctl&0x20)n+=src[s++]<<5;n=Math.min(n,unpacked-d,src.length-s);src.copy(out,d,s,s+n);s+=n;d+=n;}}
 return out.subarray(0,d);}
function list(file){const sz=kit.size(file);if(sz<0x10)return null;const h=kit.readAt(file,0,0x10);if(h.toString('latin1',0,4)!=='LNK\0')return null;
 const count=h.readInt32LE(4);if(count<=0||count>100000)return null;const idx=kit.readAt(file,0x10,count*32);if(idx.length<count*32)return null;const base=0x10+count*32,out=[];
 for(let i=0;i<count;i++){const offset=base+idx.readUInt32LE(i*32),raw=idx.readUInt32LE(i*32+4),nb=idx.subarray(i*32+8,i*32+32),z=nb.indexOf(0);const name=kit.cname(nb).trim();
  if(!name)return null;const e={name,offset,size:raw>>>1,packed:!!(raw&1)};if(e.offset+e.size>sz)return null;out.push(e);}
 return out;}
function read(file,e){const b=kit.readAt(file,e.offset,e.size);if(e.packed&&b.length>=0x10&&b.toString('latin1',0,4)==='lnd\0')return lnd(b,b.readUInt32LE(8),0x10);return b;}
const scripts=file=>{const l=list(file);if(!l)return null;const s=l.filter(e=>/\.(scr|txt|bin)$/i.test(e.name));return s.length?s:null;};
const engine=kit.engine({id:'kid',hint:'script.dat（LNK，*.scr）',archives:{name:/\.dat$/i,list:scripts,read},parse:buf=>({lines:kit.decodeRuns(buf),anchors:[]}),test:()=>false});
module.exports={engine,list,read,lnd};
