// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E581 QLIE (Warp: ensemble, Hulotte, Eushully's later titles, SAGA PLANETS before Siglus, Alcot sister brands …).
   Format references (read, not copied): GARbro ArcFormats/Qlie (ArcQLIE.cs, Encryption.cs, QlieMersenneTwister.cs, morkt,
   MIT) for the pack, VNTextPatch QlieScript.cs (arcusmaximus, MIT) for the script grammar.
     GameData/*.pack  footer at end-0x1C: "FilePackVer" X "." Y, count (i32), index offset (i64). Entries: u16 name
                      length, name (cp932, UTF-16LE in 3.1), offset i64, size, unpacked, packed flag, encryption, [hash]
     names            1.0 / 2.0 / 3.0: byte XOR ((k+1) ^ key) + k + 1; 3.1: UTF-16 XOR from a 16-bit hash
     data             1.0 / 2.0 and 3.0 without a key file: the MMX qword chain (0xA73C5F9D, 0xCE24F523, 0xFEC9753E) keyed
                      by the length and the pack key (a hash of the 0x100 bytes at end-0x41C, so per archive, static).
                      3.0 with key.fkey: a 64-word Mersenne Twister seeded from the name and length, its state XORed with
                      key.fkey and the title's game key (exe resource TFORM1 IconKeyImage, else a probe-supplied key).
                      3.1: two table generators (methods 1 / 2), method 2 mixes key.fkey or the pack's own pack_keyfile.
                      "1PC\xFF" entries are QLIE's byte-pair compression.
     *.s              plain text, Shift-JIS (UTF-16LE when it holds NUL). @ ^ \ ％ lines are commands; 【name】 lines are
                      speakers; name,message lines (the \w+,name,text form); ^select,a,b,c lists choices; [n] is a break.
   Per-title parameter: only a 3.0 pack with key.fkey whose exe has no IconKeyImage needs the game key; it comes from an
   adapter pack (params target "qlie-key": {gameKey: hex of 256 bytes, keyFile?: hex}). Every candidate is tried and the
   one whose scripts decode to Japanese is kept. Built on kit.cjs (E573). */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');

/* ---- 64-bit MMX lanes on [lo, hi] uint32 pairs -------------------------------------------------------------------- */
const q=(lo,hi)=>[lo>>>0,hi>>>0],qx=(a,b)=>[(a[0]^b[0])>>>0,(a[1]^b[1])>>>0];
const addD=(a,b)=>[(a[0]+b[0])>>>0,(a[1]+b[1])>>>0];
const addW32=(x,y)=>((((x&0xffff)+(y&0xffff))&0xffff)|((((x>>>16)+(y>>>16))&0xffff)<<16))>>>0;
const addW=(a,b)=>[addW32(a[0],b[0]),addW32(a[1],b[1])];
const addB32=(x,y)=>{let r=0;for(let s=0;s<32;s+=8)r|=(((x>>>s)+(y>>>s))&255)<<s;return r>>>0;};
const addB=(a,b)=>[addB32(a[0],b[0]),addB32(a[1],b[1])];
const sllD=(a,n)=>[(a[0]<<n)>>>0,(a[1]<<n)>>>0],srlD=(a,n)=>[a[0]>>>n,a[1]>>>n],or=(a,b)=>[(a[0]|b[0])>>>0,(a[1]|b[1])>>>0];
const rdQ=(b,o)=>[b.readUInt32LE(o),b.readUInt32LE(o+4)],wrQ=(b,o,v)=>{b.writeUInt32LE(v[0],o);b.writeUInt32LE(v[1],o+4);};

/* ---- QLIE's Mersenne Twister (64 words, M 39, its own tempering masks and pairing quirk) -------------------------- */
class Mt{constructor(seed){this.mt=new Uint32Array(64);this.mt[0]=seed>>>0;for(let i=1;i<64;i++){const p=this.mt[i-1];this.mt[i]=(Math.imul(0x6611BC19,(p^(p>>>30))>>>0)+i)>>>0;}this.i=64;}
 xorState(buf){const n=Math.min(buf.length>>>2,64);for(let i=0;i<n;i++)this.mt[i]^=buf.readUInt32LE(i*4);}
 rand(){const mt=this.mt,mag=v=>v&1?0x9908B0DF:0;if(this.i>=64){let k;
   for(k=0;k<25;k++){const y=(mt[k]&0x80000000)|((mt[k+1]&0x7fffffff)>>>1);mt[k]=mt[k+39]^y^mag(mt[k+1]);}
   for(;k<63;k++){const y=(mt[k]&0x80000000)|((mt[k+1]&0x7fffffff)>>>1);mt[k]=mt[k-25]^y^mag(mt[k+1]);}
   const y=(mt[63]&0x80000000)|((mt[0]&0x7fffffff)>>>1);mt[63]=mt[38]^y^mag(mt[62]);this.i=0;}
  let y=mt[this.i++];y^=y>>>11;y=(y^((y<<7)&0x9C4F88E3))>>>0;y=(y^((y<<15)&0xE7F70000))>>>0;y^=y>>>18;return y>>>0;}
 rand64(){const lo=this.rand();return q(lo,this.rand());}}

/* ---- the two families of entry cipher; every one runs either way (enc = true encrypts, for fixtures) -------------- */
/* the shared feedback step of 3.0-key and 3.1: d = data ^ h; h = paddw(pslld(paddb(h, plain) ^ plain, 1), plain) */
function feedback(buf,len,next,start,enc){let h=start;for(let o=0;o+8<=len;o+=8){const t=next(o>>>3);h=addD(qx(h,t),t);const v=rdQ(buf,o),d=qx(v,h),plain=enc?v:d;wrQ(buf,o,d);h=addW(sllD(qx(addB(h,plain),plain),1),plain);}}
/* 1.0 / 2.0 / 3.0 without key: hash = paddd(hash, C) ^ x; plain = data ^ hash; x = plain */
function chain(buf,len,x32,enc=false){let h=q(0xA73C5F9D,0xA73C5F9D),x=q(x32,x32);const C=q(0xCE24F523,0xCE24F523);
 for(let o=0;o+8<=len;o+=8){h=qx(addD(h,C),x);const v=rdQ(buf,o),d=qx(v,h);wrQ(buf,o,d);x=enc?v:d;}}
const u=n=>n>>>0,mul=(a,b)=>Math.imul(a,b)>>>0;
function v3Seed(rawName,len,arcKey){let hash=0x85F532,seed=0x33F641;for(let i=0;i<rawName.length;i++){hash=u(hash+mul(i&255,rawName[i]));seed=u(seed^hash);}
 seed=u(seed+u(arcKey^u(mul(7,len&0xFFFFFF)+len+hash+u(hash^len^0x8F32DC))));return mul(9,seed&0xFFFFFF);}
function v3KeyDecrypt(buf,len,{rawName,arcKey,keyFile,gameKey},enc=false){if(len<8)return;let seed=v3Seed(rawName,len,arcKey);if(gameKey)seed=u(seed^0x453A);
 const mt=new Mt(seed);if(keyFile)mt.xorState(keyFile);if(gameKey)mt.xorState(gameKey);const table=[];for(let i=0;i<16;i++)table.push(mt.rand64());for(let i=0;i<9;i++)mt.rand();
 const h=mt.rand64();let t=mt.rand()&0xF;feedback(buf,len,()=>{const v=table[t];t=(t+1)&0xF;return v;},h,enc);}
function genTable(n,seed,key=0x8DF21431){const out=[];let s=BigInt(seed>>>0);const K=BigInt(key>>>0),M=0xffffffffn;for(let i=0;i<n;i++){const x=K*(s^K);s=((x>>32n)+x)&M;out.push(Number(s));}return out;}
function keyData(keyFile){const k=Buffer.alloc(0x400);for(let i=0;i<0x100;i++){const h=i%3?Math.imul(i+7,-(i+3)):Math.imul(i+7,i+3);k.writeInt32LE(h|0,i*4);}
 if(keyFile&&keyFile.length>=128){let a=keyFile[49]%73+128;const l=keyFile[79]%7+7;for(let i=0;i<0x400;i++){a=(a+l)%keyFile.length;k[i]^=keyFile[a];}}return k;}
function nameHash(name,h0,s0){let hash=h0,seed=s0;for(let i=0;i<name.length;i++){hash=u(hash+u(name.charCodeAt(i)<<(i&7)));seed=u(seed^hash);}return {hash,seed};}
function v31Decrypt(buf,len,{name,method,arcKey,keyFile},enc=false){if(!method||len<8)return;
 if(method===1){let {hash,seed}=nameHash(name,0x85F532,0x33F641);seed=u(seed+u(arcKey^u(mul(7,len&0xFFFFFF)+len+hash+u(hash^len^0x8F32DC))));seed=mul(9,seed&0xFFFFFF);
  const t=genTable(0x20,seed);let k=2*(t[0xD]&0xF);feedback(buf,len,()=>{const v=q(t[k],t[k+1]);k=(k+2)&0x1F;return v;},q(t[6],t[7]),enc);return;}
 let {hash,seed}=nameHash(name,0x86F7E2,0x4437F1);seed=u(seed+u(arcKey^u(mul(13,len&0xFFFFFF)+len+hash+u(hash^len^0x56E213))));seed=mul(13,seed&0xFFFFFF);
 const t=genTable(0x20,seed,0x8A77F473),kd=keyData(keyFile);let k=(8*(t[8]&0xD))&0x7F;
 feedback(buf,len,()=>{const i=2*(k&0xF),v=qx(q(t[i],t[i+1]),rdQ(kd,8*k));k=(k+1)&0x7F;return v;},q(t[6],t[7]),enc);}

/* ---- hashes and names --------------------------------------------------------------------------------------------- */
function hash30(d){let h=q(0,0),k=q(0,0);const C=q(0x03070307,0x03070307);for(let o=0;o+8<=d.length;o+=8){h=addW(h,C);k=addW(k,qx(rdQ(d,o),h));}return u(k[0]^k[1]);}
function hash31(d){let h=q(0,0),k=q(0,0);const C=q(0xA35793A7,0xA35793A7);for(let o=0;o+8<=d.length;o+=8){h=addW(h,C);k=addW(k,qx(rdQ(d,o),h));k=or(sllD(k,3),srlD(k,29));}
 const s=v=>(v&0xffff)<<16>>16;return u(Math.imul(s(k[0]),s(k[1]))+Math.imul(s(k[0]>>>16),s(k[1]>>>16)));}
function nameXor(b,key){for(let k=0;k<b.length;k++)b[k]^=(((k+1)^key)+k+1)&255;return b;}
function nameXor31(b,nameKey){const cc=b.length>>>1;let hash=(Math.imul(cc,cc)^cc)^0x3E13^(nameKey>>16)^nameKey;hash&=0xFFFF;let key=hash;
 for(let i=0;i<cc;i++){key=(hash+i+Math.imul(8,key))|0;b[i*2]^=key&255;b[i*2+1]^=(key>>>8)&255;}return b;}

/* ---- the pack ----------------------------------------------------------------------------------------------------- */
function footer(file){const t=kit.tail(file,0x1C);if(t.length<0x1C||t.toString('latin1',0,11)!=='FilePackVer'||t[0xC]!==0x2e)return null;
 return {major:t[0xB]-48,minor:t[0xD]-48,count:t.readInt32LE(0x10),index:Number(t.readBigInt64LE(0x14)),size:kit.size(file)};}
/* the pack's own key: hash of the 0x100 bytes at end-0x41C (3.x) */
const arcKeyOf=(file,f)=>f.major<3?0:((f.minor===1?hash31:hash30)(kit.readAt(file,f.size-0x41C,0x100))&0x0FFFFFFF)>>>0;
/* encoders the index may use: v1 layout (no hash) and v2 layout (with hash), as GARbro tries for 1.0 */
function parseIndex(idx,f,{unicode,withHash,nameKeyV2,nameKey,arcKey}){const out=[];let p=0;
 for(let i=0;i<f.count;i++){if(p+2>idx.length)return null;let n=idx.readUInt16LE(p);p+=2;if(n>0x100)return null;if(unicode)n*=2;if(p+n+24>idx.length)return null;
  const raw=Buffer.from(idx.subarray(p,p+n));p+=n;let name;
  if(unicode)name=nameXor31(raw,nameKey).toString('utf16le');else{nameXor(raw,nameKeyV2?n+(nameKey^0x3E):(nameKey^0x3E));name=kit.SJIS.decode(raw);}
  const offset=Number(idx.readBigInt64LE(p)),size=idx.readUInt32LE(p+8),unpacked=idx.readUInt32LE(p+12),packed=idx.readInt32LE(p+16)!==0,method=idx.readInt32LE(p+20);p+=24;if(withHash)p+=4;
  if(offset<0||offset+size>f.size)return null;out.push({name:name.replace(/\\/g,'/'),rawName:raw,offset,size,unpacked,packed,method,arcKey});}
 return out;}
/* key.fkey beside / above the pack (and DLL\), else the RESKEY resource of an exe one folder up */
function keyFileFor(file){const d=path.dirname(file);for(const rel of ['.','..','../DLL','DLL']){const f=path.join(d,rel,'key.fkey');if(kit.isFile(f))try{return fs.readFileSync(f);}catch{}}
 for(const ed of [path.join(d,'..'),d])for(const n of kit.names(ed))if(/\.exe$/i.test(n)){const r=kit.peResource(path.join(ed,n),10,'RESKEY');if(r)return r;}return null;}
/* the 3.0 game key the exe carries: TFORM1 (a Delphi form) holds IconKeyImage whose Picture.Data starts "\x05TIcon" */
function gameKeyFromExe(file){const d=path.dirname(file);for(const ed of [path.join(d,'..'),d])for(const n of kit.names(ed))if(/\.exe$/i.test(n)){
 const f=kit.peResource(path.join(ed,n),10,'TFORM1');if(!f||f.toString('latin1',0,4)!=='TPF0')continue;const at=f.indexOf('IconKeyImage','latin1');if(at<0)continue;
 const ic=f.indexOf(Buffer.from('\x05TIcon','latin1'),at);if(ic>=0&&ic+0x106<=f.length)return Buffer.from(f.subarray(ic+6,ic+0x106));}return null;}
/* per-title game keys: qlie-schemes.json, then an adapter pack's "qlie-key" params */
const SCHEMES=require('./qlie-schemes.json');
function packKeys(){let extra=[];try{extra=require('../adapter-packs.cjs').params('qlie-key').map(p=>p.value);}catch{}return [...extra,...Object.entries(SCHEMES).filter(([k])=>k[0]!=='_').map(([,v])=>v)].filter(v=>v&&/^[0-9a-f]{512}$/i.test(String(v.gameKey||'')));}

const memo=new Map();
/* list(file) -> entries (each knows how to read itself) or null */
function list(file){const f=footer(file);if(!f||f.count<=0||f.count>500000||f.index<0||f.index>=f.size)return null;const st=kit.size(file)+':'+(fs.statSync(file).mtimeMs|0);
 const m=memo.get(file);if(m&&m.st===st)return m.list;let idx;try{idx=kit.readAt(file,f.index,f.size-0x1C-f.index);}catch{return null;}
 const arcKey=arcKeyOf(file,f),tries=f.major===1?[{v:1,withHash:false,nameKeyV2:false},{v:2,withHash:false,nameKeyV2:true},{v:2,withHash:true,nameKeyV2:true}]
  :f.major===2?[{v:2,withHash:true,nameKeyV2:true}]:f.major===3?[{v:3,withHash:true,nameKeyV2:true,unicode:f.minor===1}]:[];
 let out=null,mode=null;for(const t of tries){out=parseIndex(idx,f,{...t,nameKey:t.v===3?arcKey:0xC4,arcKey});if(out&&out.length&&out.every(e=>e.name&&!/[\0-\x1f]/.test(e.name))){mode=t;break;}out=null;}
 if(!out)return null;let keyFile=f.major===3?keyFileFor(file):null;const ctx={file,f,mode,arcKey,keyFile0:keyFile,gameKey:null,gameKeys:null};
 /* 3.x with a key file: entries after "pack_keyfile" use that entry's decrypted bytes as the key file */
 for(const e of out){e.keyFile=keyFile;e.ctx=ctx;if(f.major===3&&keyFile&&/pack_keyfile/i.test(e.name)){try{keyFile=decode(e,true);}catch{}}}
 memo.set(file,{st,list:out});return out;}
/* the plain bytes of one entry */
function decode(e,raw=false){const {f,mode}=e.ctx;const buf=kit.readAt(e.ctx.file,e.offset,e.size);
 if(e.method){if(f.major===3&&f.minor===1)v31Decrypt(buf,buf.length,{name:e.name.replace(/\//g,'\\'),method:e.method,arcKey:e.arcKey,keyFile:e.keyFile});
  else if(f.major===3&&e.keyFile&&e.ctx.gameKey!==false)v3KeyDecrypt(buf,buf.length,{rawName:e.rawName,arcKey:e.arcKey,keyFile:e.keyFile,gameKey:e.ctx.gameKey});
  else chain(buf,buf.length,mode.v===1?u(e.arcKey^0xFEC9753E):u(u(buf.length+e.arcKey)^0xFEC9753E));}
 if(raw||!e.packed)return buf;return unpack(buf)||buf;}
/* "1PC\xFF": byte-pair expansion, 8- or 16-bit block counts */
function unpack(input){if(input.length<12||input.readUInt32LE(0)!==0xFF435031)return null;const wide=input[4]&1,outLen=input.readInt32LE(8);if(outLen<0||outLen>256<<20)return null;
 const out=Buffer.alloc(outLen),n0=new Uint8Array(256),n1=new Uint8Array(256),stack=new Uint8Array(256);let src=12,dst=0;
 while(src<input.length){for(let i=0;i<256;i++)n0[i]=i;for(let i=0;i<256;){let c=input[src++];if(c>127){i+=c-127;c=0;}if(i>255)break;c++;for(let k=0;k<c&&i<256;k++){n0[i]=input[src++];if(n0[i]!==i)n1[i]=input[src++];i++;}}
  let count;if(wide){count=input.readUInt16LE(src);src+=2;}else{count=input.readInt32LE(src);src+=4;}let k=0;
  for(;;){let x;if(k>0)x=stack[--k];else{if(!count)break;count--;x=input[src++];}if(n0[x]===x){if(dst>=outLen)return null;out[dst++]=x;}else{if(k>254)return null;stack[k++]=n1[x];stack[k++]=n0[x];}}}
 return dst===outLen?out:null;}

/* ---- 3.0 game key: from the exe, else probe-supplied candidates, kept when the scripts read as Japanese ------------- */
function resolveGameKey(entries){const ctx=entries[0]?.ctx;if(!ctx||ctx.f.major!==3||ctx.f.minor!==0||!ctx.keyFile0||ctx.gameKey!==null)return;
 const probe=entries.filter(e=>/\.s$/i.test(e.name)&&e.method).slice(0,3);if(!probe.length){ctx.gameKey=false;return;}
 const ok=key=>{ctx.gameKey=key;let kana=0;for(const e of probe){try{kana+=(text(decode(e)).match(kit.KANA_G)||[]).length;}catch{}}return kana>=4;};
 const exe=gameKeyFromExe(ctx.file);if(exe&&ok(exe))return;for(const v of packKeys()){if(ok(Buffer.from(v.gameKey,'hex')))return;}
 if(ok(null))return;ctx.gameKey=exe||null;}

/* ---- script grammar (VNTextPatch's reading of .s) ----------------------------------------------------------------- */
const text=buf=>buf.includes(0)?buf.toString('utf16le').replace(/^﻿/,''):kit.decoder([buf]).decode(buf);
const clean=t=>kit.trimBoth(t.replace(/\[rb,([^,\]]*),[^\]]*\]/g,'$1').replace(/\[n\]/g,'\n').replace(/\[[^\]\n]*\]/g,''));
function parse(buf){const lines=[],anchors=[];
 for(const raw of text(buf).split(/\r?\n/)){const t=raw.trim();if(!t)continue;
  if(/^\^select,/i.test(t)){for(const c of t.split(',').slice(1)){const s=clean(c);if(s)lines.push(s);}continue;}
  if(/^[@^\\％;]|^\/\//.test(t)){anchors.push(t);continue;}
  if(/^【[^】]*】$/.test(t)){anchors.push(t);continue;}
  const m=/^\w+,([^,]+),(.+)$/.exec(t);const s=clean(m?m[2]:t);if(!s)continue;if(kit.ascii(s))anchors.push(s);else lines.push(s);}
 return {lines,anchors};}

const SCRIPT=/\.s$/i;
const engine=kit.engine({id:'qlie',hint:'GameData\\*.pack',
 archives:{name:/\.pack$/i,subs:['GameData','gamedata',''],entry:SCRIPT,list:file=>{const l=list(file);if(l)resolveGameKey(l);return l;},read:(file,e)=>decode(e)},
 loose:{name:SCRIPT,subs:['GameData/scenario','GameData/script']},parse});
module.exports={engine,parse,list,decode,unpack,footer,_internal:{chain,v3KeyDecrypt,v31Decrypt,nameXor,nameXor31,hash30,hash31,Mt,genTable,keyData}};
