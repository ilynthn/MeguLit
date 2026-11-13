// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E664 Whale (HARUKAZE, みなとそふと / Minato Carnival, mirai: 辻堂さんの純愛ロード, 君が主で執事が俺で): *.dat archives with
   a hashed index; the scripts inside are plain Shift-JIS text.
   Archive (arc_unpacker, rr-, GPL-3.0: src/dec/whale/dat_archive_decoder.cc): u32 count ^ 0x26ACA46E, then per entry
   u64 hash (CRC-64 of the file name), u8 type ^ (hash & 0xFF), u32 offset, u32 packed size, u32 size (each ^ low dword of
   the hash). Type 2 (compressed) entries are the scripts: every whole dword XOR'd with (hash ^ CRC-64(game title)) low
   dword, then zlib. Names of other entries are needed to unlock them, scripts are not: their offsets are plain.
   The title-derived dword K is the same for every script of an archive. It is recovered here from the zlib stream
   itself (2 header bytes fixed, the other 2 tried; a candidate must inflate a whole script with its Adler-32), so no
   per-game key list is needed.
   Script (VNTranslationTools, arcusmaximus, MIT: WhaleScript.cs): "*label" lines and lines that start with ASCII are
   code (anchors); a line starting with a Japanese character is text, "【name,…】「message」" or "（monologue）";
   SELECT "choice,*label",… gives choices; CS / MS.HS commands carry text arguments; "[n]" is a line break. */
const zlib=require('node:zlib'),path=require('node:path');
const kit=require('./kit.cjs');
const COUNT_KEY=0x26aca46e;

function list(file){const sz=kit.size(file);if(sz<32||!/\.dat$/i.test(file))return null;const h=kit.readAt(file,0,4);const count=(h.readUInt32LE(0)^COUNT_KEY)>>>0;
 if(!count||count>200000||4+count*21>sz)return null;const idx=kit.readAt(file,4,count*21),out=[];
 for(let i=0;i<count;i++){const p=i*21,lo=idx.readUInt32LE(p),hash=idx.readBigUInt64LE(p),type=idx[p+8]^(lo&255);if(type>2)return null;
  const offset=(idx.readUInt32LE(p+9)^lo)>>>0,size=(idx.readUInt32LE(p+13)^lo)>>>0,unpacked=(idx.readUInt32LE(p+17)^lo)>>>0;
  if(type===2&&(offset<4+count*21||offset+size>sz||size<8))return null;out.push({index:i,name:String(i).padStart(4,'0')+'.txt',hash,lo,type,offset,size,unpacked});}
 return out.some(e=>e.type===2)?out:null;}
const scriptsOf=file=>{const l=list(file);return l?l.filter(e=>e.type===2):null;};
const unxor=(b,key)=>{const o=Buffer.from(b),n=o.length>>>2;for(let i=0;i<n;i++)o.writeUInt32LE((o.readUInt32LE(i*4)^key)>>>0,i*4);return o;};
const tryInflate=b=>{try{return zlib.inflateSync(b,{maxOutputLength:64<<20});}catch{return null;}};
/* K for an archive (cached by path + size + mtime) */
const keys=new Map();
function archiveKey(file,scripts){const st=require('node:fs').statSync(file),id=path.resolve(file)+'|'+st.size+'|'+st.mtimeMs;if(keys.has(id))return keys.get(id);
 const sample=scripts.slice().sort((a,b)=>a.size-b.size).slice(0,2);let found=null;
 const e=sample[0],head=kit.readAt(file,e.offset,Math.min(e.size,512)&~3);
 outer:for(const b1 of [0x9c,0xda,0x01,0x5e]){const k0=head[0]^0x78,k1=head[1]^b1;
  for(let k2=0;k2<256;k2++)for(let k3=0;k3<256;k3++){const key=(k0|(k1<<8)|(k2<<16)|(k3<<24))>>>0,dec=unxor(head,key);
   let part;try{part=zlib.inflateSync(dec,{finishFlush:zlib.constants.Z_SYNC_FLUSH,maxOutputLength:1<<16});}catch{continue;}if(!part.length)continue;
   const full=tryInflate(unxor(kit.readAt(file,e.offset,e.size),key));if(!full)continue;
   const K=(key^e.lo)>>>0;if(sample[1]&&!tryInflate(unxor(kit.readAt(file,sample[1].offset,sample[1].size),(sample[1].lo^K)>>>0)))continue;found=K;break outer;}}
 keys.set(id,found);return found;}
function read(file,e){const scripts=scriptsOf(file)||[e];const K=archiveKey(file,scripts);if(K===null)return Buffer.alloc(0);return tryInflate(unxor(kit.readAt(file,e.offset,e.size),(e.lo^K)>>>0))||Buffer.alloc(0);}

const MSG=/^(?:【(.+?)(?:,\w+)*】)?(?:「(.+?)」?|(（(?:.+?)）?))$/;
function message(s,out){const m=MSG.exec(s);if(!m){out.push(s);return;}if(m[1])out.push(m[1]);out.push(m[2]??m[3]);}
function parse(buf){const text=kit.decodeText(buf),raw=[],anchors=[];
 for(const line of text.split(/\r?\n/)){if(!line.trim()||line[0]==='*'){if(line[0]==='*')anchors.push(line.trim());continue;}
  if(line.charCodeAt(0)>0xff){message(line,raw);continue;}
  if(/^SELECT /.test(line)){if(/^SELECT\s+(?:"[^",]+,\*\w+"[,\s]*)+$/.test(line))for(const m of line.matchAll(/"([^",]+),\*\w+"/g))raw.push(m[1]);anchors.push(line.replace(/"[^",]+,(\*\w+)"/g,'$1'));continue;}
  if(/^(CS|MS\.HS) /.test(line)){const m=/^[A-Z0-9.]+\s+((?:(?:"[^"]+"|[^,\s]+)[,\s]*)+)$/.exec(line);if(m)for(const a of m[1].matchAll(/"([^"]+)"|([^,\s"]+)/g)){const v=a[1]??a[2];if(/[぀-ヿ一-鿿]/.test(v))message(v,raw);}anchors.push(line.split(/\s/)[0]);continue;}
  anchors.push(line.trim());}
 const lines=raw.map(s=>kit.trimBoth(s.replace(/\[n\]/g,'\n'))).filter(Boolean);return {lines,anchors};}
const engine=kit.engine({id:'whale',hint:'*.dat（Whale，剧本 zlib + 异或）',archives:{name:/\.dat$/i,list:scriptsOf,read,sort:false},loose:{name:/^\d{4}\.txt$/i},parse,test:n=>/^\d{4}\.txt$/i.test(n)});
const isArchive=f=>!!scriptsOf(f);
module.exports={engine,list,read,parse,archiveKey,unxor,COUNT_KEY,isArchive};
