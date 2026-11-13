// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E593 Lucifen — Navel / Lime / Hooksoft-adjacent engine (SHUFFLE!, 俺たちに翼はない, さくらシンクロニシティ,
   ねこなでディストーション …; ~48 releases). Family A (string pool, docs/engine-families.md).
   Format references: GARbro ArcFormats/Lucifen/ArcLPK.cs (morkt, MIT) and UBTL/Lucifen-Tools (MIT) for the archive;
   MasakatsuFunaki/VN_Translate_Repo Oretachi_ni_Tsubasa_wa_Nai pipeline_cpp/src/sob/sob_parser.cpp (GPL-3.0) for the
   script, matching regomne/chinesize Lucifen/extSob.py (no licence: facts only) from another title.
     *.lpk   "LPK1"; keys from the scheme (lucifen-schemes.json) and the upper-case base name; code = u32@4 ^ key2 gives
             the index size and flags (1 aligned offsets, 2 trie index, 4 first 0x100 bytes encrypted, 8 LZSS-packed
             entries, 0x10 whole content XOR + nibble rotate). The index (dword XOR with a rotating key) is a letter trie
             over the names; entries {[u8 flag], u32 offset, u32 size, [u32 unpacked]}. SCRIPT.LPK needs no per-file key.
     *.sob   "SOB0" / "SOB2": u32 relocation size; five relocation tables {u32 count, count × (u32 code offset, u32 value)}
             (user variables, syscalls, ?, external functions, self-relative pointers); u32 code size, u32 total; code +
             resources. A message is syscall 462 (0x1CE) whose argument (the nearest self-relative pointer 4–28 bytes
             before it) points at {u8, u16 index, "#speaker\voice$&text$" | "text$"}; a choice menu is syscall 491 (0x1EB)
             pointing at {u8, u16 id, u16 count, count × (u16 stride, C string)}.
   Lines come in code order (name before its message, then each option), so a patch that rewrites the resource area
   and the pointer table pairs 1:1. SOB1 (a variable dump, no messages) gives no lines. */
const kit=require('./kit.cjs'),fs=require('node:fs'),path=require('node:path');
const SCHEMES=require('./lucifen-schemes.json');
const hex=s=>parseInt(s,16)>>>0;
const schemes=params=>(params||SCHEMES).schemes.map(s=>({name:s.name,key1:hex(s.key1),key2:hex(s.key2),xor:hex(s.contentXor),pattern:hex(s.rotatePattern)}));
const DEFAULT=schemes();
const rotl=(v,n)=>{n&=31;return n?((v<<n)|(v>>>(32-n)))>>>0:v>>>0;},rotr=(v,n)=>{n&=31;return n?((v>>>n)|(v<<(32-n)))>>>0:v>>>0;};
/* archive names are ASCII in every known title (SCRIPT, PIC, SE …); the engine hashes their cp932 bytes */
function fileKeys(basename,s){let k1=s.key1,k2=s.key2;const b=Buffer.from(basename,'latin1');
 for(let i=0,e=b.length-1;e>=0;i++,e--){k1=rotr((k1^b[e])>>>0,7);k2=rotl((k2^b[i])>>>0,7);}return [k1,k2];}
/* dword XOR with a rotating key; index: pattern rotl 4 / key rotr, entries: pattern rotr 4 / key rotl */
function cryptIndex(d,len,key,pattern){for(let i=0;i<len>>>2;i++){d.writeUInt32LE((d.readUInt32LE(i*4)^key)>>>0,i*4);pattern=rotl(pattern,4);key=rotr(key,pattern);}}
function cryptEntry(d,len,key,pattern){for(let i=0;i<len>>>2;i++){d.writeUInt32LE((d.readUInt32LE(i*4)^key)>>>0,i*4);pattern=rotr(pattern,4);key=rotl(key,pattern);}}
/* the trie index -> entries */
function readIndex(idx,info){const count=idx.readInt32LE(0);if(count<=0||count>500000)return null;let p=4;
 const prefixLen=idx[p++];if(prefixLen){info.prefix=Buffer.from(idx.subarray(p,p+prefixLen));p+=prefixLen;}
 const wide=idx[p++]!==0,letters=idx.readInt32LE(p);p+=4;const entriesAt=p+letters;if(entriesAt>=idx.length)return null;
 let size=info.packed?13:9;if(Math.floor((idx.length-entriesAt)/size)<count)size=Math.floor((idx.length-entriesAt)/count);if(size<8||info.packed&&size<12)return null;
 const out=[],name=[];
 const walk=(at,depth)=>{if(at<0||at>=idx.length||depth>=260)throw Error('lpk index');const n=idx[at++];
  for(let i=0;i<n;i++){const letter=idx[at++],off=wide?idx.readInt32LE(at):idx.readUInt16LE(at);at+=wide?4:2;name[depth]=letter;
   if(letter)walk(at+off,depth+1);
   else{let ep=entriesAt+size*off;if(depth<1||ep+size>idx.length)throw Error('lpk entry');if(size&1)ep++;const o=idx.readUInt32LE(ep);
    const e={name:kit.SJIS.decode(Buffer.from(name.slice(0,depth))),offset:info.aligned?o*2048:o,size:idx.readUInt32LE(ep+4)};
    e.unpacked=info.packed?idx.readUInt32LE(ep+8):0;out.push(e);}}};
 walk(p,0);return out.length===count?out:null;}
const memo=new Map();
/* {entries, info, scheme} or null */
function open(file,params){const fsz=kit.size(file),stamp=file+'|'+fsz+'|'+(kit.isFile(file)?fs.statSync(file).mtimeMs:0);if(memo.has(stamp))return memo.get(stamp);let r=null;
 try{const h=kit.head(file,8);if(h.length===8&&h.toString('latin1',0,4)==='LPK1'){const base=path.basename(file).replace(/\.[^.]*$/,'').toUpperCase();
  for(const s of params?schemes(params):DEFAULT){const [k1,k2]=fileKeys(base,s),code=(h.readUInt32LE(4)^k2)>>>0,flags=code>>>24;let size=code&0xffffff;if(flags&1)size=size*2048-8;
   if(!(flags&2)||size<5||size+8>fsz)continue;const idx=kit.readAt(file,8,size);cryptIndex(idx,size,k2,s.pattern);
   const info={aligned:!!(flags&1),encrypted:!!(flags&4),packed:!!(flags&8),whole:!!(flags&0x10)&&base!=='PATCH',key:k1,prefix:null};
   let entries=null;try{entries=readIndex(idx,info);}catch{entries=null;}
   if(entries&&entries.every(e=>e.offset+e.size<=fsz)){r={entries,info,scheme:s};break;}}}}catch{r=null;}
 if(memo.size>64)memo.clear();memo.set(stamp,r);return r;}
const list=file=>open(file)?.entries||null;
function read(file,e){const a=open(file);let d=kit.readAt(file,e.offset,e.size);if(!a)return d;const {info,scheme:s}=a;
 if(e.unpacked)d=Buffer.from(kit.lzss(d,e.unpacked));else d=Buffer.from(d);
 if(info.whole)for(let i=0;i<d.length;i++)d[i]=kit.ror(d[i]^s.xor,4);
 if(info.encrypted)cryptEntry(d,Math.min(d.length,0x100),info.key,s.pattern);
 return info.prefix?Buffer.concat([info.prefix,d]):d;}

/* ---- SOB0 / SOB2 ---------------------------------------------------------------------------------------------------- */
const MESSAGE=462,CHOICE=491;
/* {kind:'say'|'choice', code, bytes, name?} in code order */
function records(b){if(b.length<16||!/^SOB[02]$/.test(b.toString('latin1',0,4)))return null;const relocSize=b.readUInt32LE(4),end=8+relocSize;if(end+8>b.length)return null;
 const tables=[];let p=8;for(let t=0;t<5;t++){if(p+4>end)return null;const n=b.readUInt32LE(p);p+=4;if(p+n*8>end)return null;const m=[];for(let i=0;i<n;i++,p+=8)m.push([b.readUInt32LE(p),b.readUInt32LE(p+4)]);tables.push(m);}
 const codeSize=b.readUInt32LE(end),payload=b.subarray(end+8),self=new Map(tables[4]),out=[],used=new Set();
 const arg=code=>{for(let back=4;back<32;back+=4){if(code<back)continue;const t=self.get(code-back);if(t!==undefined)return t;}return -1;};
 for(const [code,id] of tables[1]){if(id!==MESSAGE&&id!==CHOICE)continue;const at=arg(code);if(at<codeSize||at>=payload.length||used.has(at))continue;used.add(at);
  if(id===MESSAGE){if(at+3>payload.length)continue;const s=kit.cstr(payload,at+3);if(s)out.push({kind:'say',code,bytes:s});}
  else{if(at+5>payload.length)continue;const n=payload.readUInt16LE(at+3);let cur=at+5;
   for(let i=0;i<n&&cur+2<=payload.length;i++){const stride=payload.readUInt16LE(cur),s=kit.cstr(payload,cur+2);if(s)out.push({kind:'choice',code,bytes:s});if(!stride)break;cur+=stride;}}}
 return out.sort((a,b)=>a.code-b.code);}
/* "#speaker\voice$&text$" -> [speaker, text]; "text$" -> [null, text] */
function split(t){if(!t.startsWith('#'))return [null,t.replace(/\$$/,'')];let head,body='';const sep=t.indexOf('$&');
 if(sep>=0){head=t.slice(1,sep);body=t.slice(sep+2);}else{const d=t.indexOf('$');if(d>=0){head=t.slice(1,d);body=t.slice(d+1);}else head=t.slice(1);}
 return [head.split('\\')[0],body.replace(/\$$/,'')];}
const clean=t=>kit.trimBoth(t.replace(/\\n/g,'\n'));
function parse(buf){const list=records(buf);if(!list)return {lines:[],anchors:[]};const dec=kit.decoder(list.map(r=>r.bytes)),lines=[],anchors=[];
 for(const r of list){const t=dec.decode(r.bytes);if(r.kind==='choice'){const c=clean(t);if(c)lines.push(c);continue;}
  const [name,body]=split(t),n=name&&clean(name),b=clean(body);if(n)lines.push(n);if(b)lines.push(b);}
 return {lines,anchors};}
const SOB=/\.sob$/i;
const engine=kit.engine({id:'lucifen',hint:'SCRIPT.LPK（*.sob）',
 archives:{name:/\.lpk$/i,magic:'LPK1',list:f=>{const l=list(f);return l&&l.some(e=>SOB.test(e.name))?l:null;},read,entry:SOB},
 loose:{name:SOB,subs:['','script','patch']},parse});
module.exports={engine,parse,open,list,read,records,split,fileKeys,cryptIndex,cryptEntry,schemes,DEFAULT};
