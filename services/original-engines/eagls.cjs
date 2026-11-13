// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E589 EAGLS (SQUEEZ, Cuckoo and friends: ~60 company releases). Format references (read, not copied): GARbro ArcFormats/Eagls/
   ArcEAGLS.cs (morkt, MIT), vagmr/Eagls_engine_tool (MIT; text grammar, checked by its author on 279 scripts of a SQUEEZ title)
   and yuxiangzong/eagls-scpack (GPL-3.0; the key solving).
     SCPACK.pak + SCPACK.idx   no magic. The .idx (10000 bytes to 1 MB) ends with an i32 seed; every byte before it is XOR-ed with
               key[rand() % key.length], rand = the MSVC CRT generator seeded with that value, key the stock
               "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik,9ol.0p;/-@:^[]". A title with its own key is solved from the file: its last
               8 KB are zero before encryption, so the cipher bytes there are key[rand() % n] for the real key length n
     index     entry size = decrypted length / 10000 (28 or 40): {char name[20], u32 offset, u32 size} or {char name[24],
               u32 offset, u32 pad, u32 size, u32 pad}; offsets minus the first one's; a zero first byte ends the table
     *.dat     the first 3600 bytes are the label table (100 × {char name[32], u32 offset}), plain. From 3600 every second byte
               (3600, 3602 … up to the last two bytes) is XOR-ed with "EAGLS_SYSTEM"[rand() % 12], rand seeded with the last byte
               as a signed char; skipped bytes take no random number. The last byte is that seed, the one before it a NUL
     script    plain cp932 text, CRLF lines: "$label" lines, "#speaker" lines (name up to 12 characters, then CR or "="),
               "..." string literals with non-ASCII text, optionally after "&number"
   Lines are the speaker names and literals in script order, so a GBK patch's dat (same layout) pairs 1:1. The AdvSys variant
   (XOR "ADVSYS" from 136000) and a data key other than EAGLS_SYSTEM are not read. */
const kit=require('./kit.cjs'),fs=require('node:fs'),path=require('node:path');
const IDX_KEY='1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik,9ol.0p;/-@:^[]',DATA_KEY='EAGLS_SYSTEM';

function idxDecrypt(raw,key){const n=raw.length-4,rnd=kit.msvcRand(raw.readInt32LE(n)),out=Buffer.alloc(n);for(let i=0;i<n;i++)out[i]=raw[i]^key.charCodeAt(rnd()%key.length);return out;}
/* the key length and bytes whose key stream turns the zero tail into the cipher tail, or null */
function solveKey(raw){const n=raw.length-4;if(n<16384)return null;const rnd=kit.msvcRand(raw.readInt32LE(n)),rs=new Uint16Array(n);for(let i=0;i<n;i++)rs[i]=rnd();
 const tail=Math.max(0,n-8192);
 for(let L=1;L<=1023;L++){const key=new Int16Array(L).fill(-1);let ok=true;for(let i=tail;i<n&&ok;i++){const k=rs[i]%L;if(key[k]<0)key[k]=raw[i];else if(key[k]!==raw[i])ok=false;}
  if(ok)return String.fromCharCode(...[...key].map(v=>v<0?0:v));}
 return null;}
function entries(index,fileSize){const size=Math.min(40,Math.floor(index.length/10000)),long=size===40,nameSize=long?0x18:0x14;if(size<28)return null;
 const first=index.readUInt32LE(nameSize),out=[];
 for(let p=0;p+size<=index.length;p+=size){if(!index[p])break;const z=index.indexOf(0,p),name=index.toString('latin1',p,Math.min(z<0?p+nameSize:z,p+nameSize));
  const offset=long?Number(index.readBigInt64LE(p+nameSize))-first:index.readUInt32LE(p+nameSize)-first,len=index.readUInt32LE(p+nameSize+(long?8:4));
  if(!/^[\x20-\x7e]+$/.test(name)||offset<0||len<0||offset+len>fileSize)return null;out.push({name,offset,size:len});}
 return out.length?out:null;}
const idxOf=pak=>{const d=path.dirname(pak),b=path.basename(pak,path.extname(pak)).toLowerCase(),n=kit.names(d).find(x=>x.toLowerCase()===b+'.idx');return n?path.join(d,n):null;};
function list(pak){const idx=idxOf(pak);if(!idx)return null;const sz=kit.size(idx);if(sz<10000||sz>0xfffff)return null;const raw=kit.readAt(idx,0,sz),fsz=kit.size(pak);
 let e=entries(idxDecrypt(raw,IDX_KEY),fsz);
 if(!e){const key=solveKey(raw);if(key)e=entries(idxDecrypt(raw,key),fsz);}
 return e;}

const randAt=seed=>kit.msvcRand(seed>>>0);
/* a script entry decrypted (the label table stays as is) */
function datDecrypt(buf){if(buf.length<3604)return buf;const rnd=randAt(buf[buf.length-1]<<24>>24);
 return kit.xorStream(buf,()=>DATA_KEY.charCodeAt(rnd()%DATA_KEY.length),{start:3600,stride:2,end:buf.length-2});}
function textOf(b){if(b.length<3604)return [];const body=b.subarray(3600,b.length-2),dec=kit.decoder([body]),t=dec.decode(body),lines=[];
 for(const raw of t.split(/\r\n|\r|\n/)){const ln=raw.trim();if(!ln||ln[0]==='$')continue;
  const sp=/^#([^\r\n=]{1,12})(?:=|$)/.exec(ln);if(sp&&/[^\x00-\x7f]/.test(sp[1]))lines.push(sp[1]);
  for(const m of ln.matchAll(/"([^"]*)"/g))if(/[^\x00-\x7f]/.test(m[1])){const s=kit.trimBoth(m[1]);if(s)lines.push(s);}}
 return lines;}
/* a loose or archived script: plain, or still encrypted */
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);const score=l=>l.filter(x=>kit.hasKana(x)||/[\u4e00-\u9fff]/.test(x)).length;
 const plain=textOf(b),dec=textOf(datDecrypt(b));return {lines:score(dec)>score(plain)?dec:plain,anchors:[]};}

const engine=kit.engine({id:'eagls',hint:'Script\SCPACK.pak + .idx（*.dat）',
 archives:{name:/\.pak$/i,subs:['','Script','script'],list,entry:/\.dat$/i},
 loose:{name:/\.dat$/i,subs:['Script','script']},parse,test:()=>false});
module.exports={engine,parse,list,idxDecrypt,solveKey,datDecrypt,textOf,entries};
