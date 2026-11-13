// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E602 the JS side of tools/warc-vectors.ps1: the same pseudo-random inputs through shiinario-crypt.cjs, hashed the same
   way, so each value can be compared with GARbro's (warc-vectors.json). Keep the two in step. */
const crypto=require('node:crypto');
const C=require('../../services/original-engines/shiinario-crypt.cjs');

const gen=(seed,n)=>{const b=Buffer.alloc(n);let x=seed>>>0;for(let i=0;i<n;i++){x=(Math.imul(x,1103515245)+12345)>>>0;b[i]=(x>>>16)&255;}return b;};
const hash=b=>crypto.createHash('sha256').update(Buffer.isBuffer(b)?b:Buffer.concat(b)).digest('hex');
const f64=v=>{const b=Buffer.alloc(8);b.writeDoubleLE(v);return b;},u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};

function helpers(scheme){
 const d130=C.decoder(130,scheme),d120=C.decoder(120,scheme),h1=[],tok=[],h2=[],h2old=[];
 for(let a=-128;a<256;a++)h1.push(f64(C.helper1(a)));
 for(let a=-128;a<256;a++)for(let b=-128;b<256;b++){const t=C.token(a,b);tok.push(f64(t));const seed=(Math.imul((a&0x1ff)<<9|(b&0x1ff),2654435761)+1)>>>0;
  if(a<128&&b<128){d130.rand=seed;h2.push(u32(d130.helper2(t)),u32(d130.rand));}
  if(a>=0&&b>=0){d120.rand=seed;h2old.push(u32(d120.helper2(t)),u32(d120.rand));}}
 const src=gen(3,4096),h3=[];for(let i=0;i<4096;i+=4)h3.push(u32(C.helper3(src.readUInt32LE(i))));for(let k=0;k<256;k++)h3.push(u32(C.helper3(Math.imul(k,0x01010101)>>>0)));
 return {helper1:hash(h1),token:hash(tok),helper2:hash(h2),helper2v120:hash(h2old),helper3:hash(h3)};}

const VERSIONS=[120,130,140,150,160,170],LENGTHS=[2,3,4,0x7f,0x80,0x81,0x84,0x100,0x3ff,0x400,0x401,0x1000,0x2345];
const seedOf=(ver,len,k)=>(ver*7919+len*31+k)>>>0;
/* {v120 … v170, extra?, all}: Decrypt / Encrypt / DecryptIndex / Decrypt2 per WARC version, the ExtraCrypt */
function scheme(s){
 const r={},all=[];
 for(const ver of VERSIONS){const dec=C.decoder(ver,s),parts=[];
  for(const len of LENGTHS)for(let k=0;k<3;k++){
   const data=gen(seedOf(ver,len,k),len+8);dec.decrypt(data,8,len);parts.push(data);
   const enc=gen(seedOf(ver,len,k)^0x55,len+8);dec.encrypt(enc,8,len);parts.push(enc);}
  const idx=gen(seedOf(ver,0,9),dec.maxIndexLength);dec.decryptIndex((0x12345678^ver)>>>0,idx);parts.push(idx.subarray(0,0x1400),idx.subarray(idx.length-0x40));
  for(const len of [0x3ff,0x400,0x1000]){const data=gen(seedOf(ver,len,7),len+8);dec.decrypt2(data,8,len);parts.push(data);}
  const b=Buffer.concat(parts);r['v'+ver]=hash(b);all.push(b);}
 if(s.extra){const parts=[];
  for(const flags of [0x202,0x204,0x206])for(const len of [0xff,0x100,0x1ff,0x200,0x201,0x203,0x3ff,0x400,0x1234])for(let k=0;k<4;k++){
   const at=k===3?0x2100:8,data=gen(seedOf(flags,len,k),at+len+(k===3?0x20000:0));
   if(k>0&&len>=0x10){data[at]=0x8d;data[at+1]=0x95;data[at+2]=0x8e;data[at+3]=0x71;const count=k===1?40:90;data[at+8]=count;data[at+9]=0;data[at+10]=0;data[at+11]=0;}
   let tag='ok';try{s.extra.decrypt(data,at,len,flags);}catch(e){if(!(e instanceof C.Fault))throw e;tag='throw';}
   parts.push(Buffer.from(tag),data);
   if(k===0){const enc=gen(seedOf(flags,len,5),len+8);tag='ok';try{s.extra.encrypt(enc,8,len,(flags^0x300)>>>0);}catch(e){if(!(e instanceof C.Fault))throw e;tag='throw';}parts.push(Buffer.from(tag),enc);}}
  const b=Buffer.concat(parts);r.extra=hash(b);all.push(b);}
 r.all=hash(all);return r;}

/* "<count>:<sha256>" of the range decoder's output, as WarcVec.Range */
function range(input,max=1<<20){const out=C.rangeDecode(input,input.length,max);const b=out||Buffer.alloc(0);return b.length+':'+hash(b);}

module.exports={gen,hash,helpers,scheme,range};
