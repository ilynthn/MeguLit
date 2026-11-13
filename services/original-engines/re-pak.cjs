// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* RE Engine packages (逆転裁判456 王泥喜セレクション, re_chunk_000.pak and its .patch_NNN.pak files). Layout as in
   ree-pak-rs (MIT, eigeen/ree-pak-rs): "KPKA", major, minor, feature flags, count, hash; then 48-byte entries
   (path hash low/high, u64 offset, compressed size, size, attributes, checksum). attributes & 0xF is the compression
   (0 none, 1 raw deflate, 2 zstd); bits 16-23 an RSA resource encryption this title does not use. Later patches
   replace entries with the same path hash.
   The story is in "USR" (.user) files: UTF-16 text runs with the script's control codes (u16 values below 0x20 and
   argument words) between them. 0x0006 / 0x0008 / LF and private-use characters (U+E001 ...) inside a message are
   line breaks and pauses, so text joined only
   by those is one line; any other code ends it. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const statKey=f=>{try{const s=fs.statSync(f);return s.size+'|'+s.mtimeMs;}catch{return '';}};
function toc(file){const fd=fs.openSync(file,'r');try{const h=Buffer.alloc(16);fs.readSync(fd,h,0,16,0);if(h.toString('latin1',0,4)!=='KPKA'||h[4]!==4)return null;if(h.readUInt16LE(6)!==0)return null;
 const n=h.readUInt32LE(8);if(n<=0||n>2000000)return null;const t=Buffer.alloc(n*48);fs.readSync(fd,t,0,t.length,16);const out=[];
 for(let i=0;i<n;i++){const p=i*48;out.push({file,hash:t.readUInt32LE(p+4).toString(16).padStart(8,'0')+t.readUInt32LE(p).toString(16).padStart(8,'0'),offset:Number(t.readBigUInt64LE(p+8)),packed:Number(t.readBigUInt64LE(p+16)),size:Number(t.readBigUInt64LE(p+24)),attr:Number(t.readBigUInt64LE(p+32)&0xffffffffn)});}
 return out;}finally{fs.closeSync(fd);}}
const readRaw=(e,len)=>kit.readAt(e.file,e.offset,len);
function read(e){if((e.attr>>>16)&0xff)throw Error('RE_ENCRYPTED');const b=readRaw(e,e.packed),c=e.attr&0xf;return c===0?b:c===1?zlib.inflateRawSync(b):c===2?zlib.zstdDecompressSync(b):b;}
function head(e){const c=e.attr&0xf;if((e.attr>>>16)&0xff)return null;if(c===0)return readRaw(e,Math.min(8,e.packed));
 if(c===1){try{return zlib.inflateRawSync(readRaw(e,Math.min(e.packed,256)),{finishFlush:zlib.constants.Z_SYNC_FLUSH}).subarray(0,8);}catch{return null;}}
 try{return read(e).subarray(0,8);}catch{return null;}}
function paks(dir){let names=[];try{names=fs.readdirSync(dir);}catch{return [];}
 const base=names.filter(n=>/^re_chunk_\d+\.pak$/i.test(n)).sort();return base.flatMap(b=>[b,...names.filter(n=>n.toLowerCase().startsWith(b.toLowerCase()+'.patch_')&&/\.pak$/i.test(n)).sort()]).map(n=>path.join(dir,n));}
const memo=new Map();
// Entries that are .user files, latest patch winning. Scanning reads the first bytes of every small entry (~0.5 min
// on a 20 GB package), so the result is kept per package set.
function userEntries(dir){const files=paks(dir);if(!files.length)return [];const key=files.map(f=>f+'|'+statKey(f)).join('\n');if(memo.has(key))return memo.get(key);
 const by=new Map();for(const f of files){let t;try{t=toc(f);}catch{t=null;}if(!t)continue;for(const e of t)by.set(e.hash,e);}
 const out=[];for(const e of by.values()){if(e.size>4e6||e.size<16)continue;const h=head(e);if(h&&h.toString('latin1',0,4)==='USR\0')out.push(e);}
 /* largest first: detection only looks at the first few scenes, and the story files are the big ones */
 out.sort((a,b)=>b.size-a.size||a.hash.localeCompare(b.hash));memo.set(key,out);return out;}
const TEXT=/[　-ヿ一-鿿！-ﾟ‐-‧×]/;
function parse(data){if(data.toString('latin1',0,3)!=='USR')return {lines:[],anchors:[]};const lines=[];let cur='',pending=false;
 const flush=()=>{const s=cur.trim();/* Japanese lines carry hiragana; this also leaves out the package's Chinese and binary noise */if(/[ぁ-ん]{2}/.test(s))lines.push(s);cur='';pending=false;};
 for(let i=0;i+1<data.length;i+=2){const c=data.readUInt16LE(i),ch=String.fromCharCode(c);
  if(TEXT.test(ch)){cur+=ch;pending=false;continue;}
  if(cur&&(c===6||c===8||c===10||(c>=0xe000&&c<=0xf8ff))){pending=true;continue;}
  if(cur)flush();}
 if(cur)flush();
 return {lines:lines.filter(l=>l.length>=2),anchors:[]};}
const engine={
 id:'re-pak',hint:'re_chunk_000.pak',
 scenes(dir){return userEntries(dir).map(e=>({name:e.hash+'.user',read:()=>read(e)}));},
 archives:()=>[],sources:dir=>paks(dir),
 parse,test:n=>/\.user$/i.test(n),
 _internal:{toc,read,head,paks},
};
module.exports={engine,parse,toc,read};
