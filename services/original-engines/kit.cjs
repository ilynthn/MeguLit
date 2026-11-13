// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E573 engine kit: the pieces every script reader was writing again (user 2026-11-14: 这些引擎都有共同处，先查重).
   An audit of services/original-engines (50 modules) found, written separately in each: a Shift-JIS / GBK picker (12×),
   a kana test (24×), "read n bytes at offset" (25×), folder walks, three LZSS decoders, XOR loops (18×), an index-table
   parser per archive, and the same scenes / archives / sources boilerplate. Readers for new engines are built from
   these instead; the adapter-pack runtime (services/adapter-packs.cjs) shares the transforms and the table container.

   io         readAt, head, tail, names, walk, files (by extension, magic, sub folder)
   text       codepage / decoder (SJIS vs GBK), KANA, hasKana, cstr, decodeRuns (generic kana scan), trimBoth
   transforms xor (byte key), xorDword (key, add per dword, add-increment), rol / ror, not, lzss (Okumura, every
              common variant: window, start, fill, flag bit order, length bits, minimum match), zlib / raw deflate
   containers table(): magic + count + entries of fixed, length-prefixed or C-string names, offsets absolute or
              relative, sizes stored or taken from the next entry, names ciphered; nested folders
   text models stringTable (offset table + C strings), pointerTable (index -> dword pointer -> C string), opcodeWalk
              (fixed operand encodings with text opcodes), lineGrammar (KAG-like text with tags, names, ruby)
   engine()   one call that gives scenes(dir) / archives(dir) / sources(dir) / parse / test from a declaration */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');

/* ---- io --------------------------------------------------------------------------------------------------------- */
function readAt(file,offset,length){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(Math.max(0,length));const n=fs.readSync(fd,b,0,b.length,offset);return n<b.length?b.subarray(0,n):b;}finally{fs.closeSync(fd);}}
const size=file=>{try{return fs.statSync(file).size;}catch{return -1;}};
const head=(file,n)=>{try{return readAt(file,0,n);}catch{return Buffer.alloc(0);}};
const tail=(file,n)=>{const s=size(file);if(s<0)return Buffer.alloc(0);try{return readAt(file,Math.max(0,s-n),Math.min(n,s));}catch{return Buffer.alloc(0);}};
const names=dir=>{try{return fs.readdirSync(dir);}catch{return [];}};
const isFile=f=>{try{return fs.statSync(f).isFile();}catch{return false;}};
/* files under dir (depth levels of sub folders) whose name passes test; save folders are never entered */
/* skip: sub folders not entered (default: save folders and MeguLit's own); null enters every folder */
const SKIP=/^(save|savedata|\.megulit)/i;
function walk(dir,depth,test,out=[],skip=SKIP){let es;try{es=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of es){const f=path.join(dir,e.name);if(e.isDirectory()){if(depth>0&&!(skip&&skip.test(e.name)))walk(f,depth-1,test,out,skip);}else if(e.isFile()&&test(e.name,f))out.push(f);}return out;}
/* files in dir and the given sub folders matching name (RegExp) and, if given, starting with magic (string, latin1) */
function files(dir,{name=/./,magic=null,subs=[''],max=64}={}){const out=[];
 for(const s of subs){const d=s?path.join(dir,s):dir;for(const n of names(d)){if(out.length>=max)return out;if(!name.test(n))continue;const f=path.join(d,n);if(!isFile(f))continue;
  if(magic&&head(f,magic.length).toString('latin1')!==magic)continue;out.push(f);}}
 return out;}

/* ---- text ------------------------------------------------------------------------------------------------------- */
const KANA=/[ぁ-ゖァ-ヺ]/,KANA_G=/[ぁ-ゖァ-ヺ]/g;
const hasKana=t=>KANA.test(t);
/* Shift-JIS for the originals, GBK for Chinese patches: replacement characters and half-width katakana (what GBK bytes
   become when read as Shift-JIS) count against an encoding; a tie goes to the one with more kana */
function codepage(all){if(!all||!all.length)return 'shift_jis';
 const score=enc=>{const t=new TextDecoder(enc).decode(all);return {bad:(t.match(/�/g)||[]).length*4+(t.match(/[｡-ﾟ]/g)||[]).length,kana:(t.match(KANA_G)||[]).length};};
 const s=score('shift_jis'),g=score('gbk');return s.bad<g.bad||s.bad===g.bad&&s.kana>=g.kana?'shift_jis':'gbk';}
const decoder=bufs=>new TextDecoder(codepage(Buffer.concat(bufs.filter(b=>b&&b.some(c=>c>=0x80)).slice(0,4000))));
/* E577 the same choice over many strings (BGI, WOLF, YU-RIS, System4 AIN …: one code page per script) */
const codepageOf=(bufs,{min=0,max=4000}={})=>codepage(Buffer.concat(bufs.filter(b=>b&&b.length>min).slice(0,max)));
/* a text script: BOM, then strict UTF-8, then Shift-JIS or GBK (KiriKiri, Tyrano, NScripter, Artemis, Ren'Py sources) */
function decodeText(buf){
 if(buf[0]===0xff&&buf[1]===0xfe)return buf.toString('utf16le',2);
 if(buf[0]===0xfe&&buf[1]===0xff){const b=Buffer.from(buf.subarray(2));b.swap16();return b.toString('utf16le');}
 if(buf[0]===0xef&&buf[1]===0xbb&&buf[2]===0xbf)return buf.toString('utf8',3);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{}
 return new TextDecoder(codepage(buf)).decode(buf);}
const cstr=(b,at,limit=b.length)=>{if(at<0||at>=b.length)return null;const e=b.indexOf(0,at);return b.subarray(at,e<0||e>limit?limit:e);};
const trimBoth=t=>t.replace(/^[\s　]+|[\s　]+$/g,'');
/* E584 Shift-JIS (cp932) encoder for keys and passphrases given as text (Marble, adapter-pack params): the decode table
   inverted once, first code wins; null when a character has no cp932 form */
let sjisMap=null;
function encodeSjis(s){if(!sjisMap){sjisMap=new Map();const dec=new TextDecoder('shift_jis');for(let b=0xa1;b<=0xdf;b++)sjisMap.set(dec.decode(Buffer.from([b])),[b]);
  for(let a=0x81;a<=0xfc;a++){if(a>0x9f&&a<0xe0)continue;for(let b=0x40;b<=0xfc;b++){if(b===0x7f)continue;const c=dec.decode(Buffer.from([a,b]));if(c.length===1&&c!=='�'&&!sjisMap.has(c))sjisMap.set(c,[a,b]);}}}
 const out=[];for(const ch of String(s)){const c=ch.codePointAt(0);if(c<0x80){out.push(c);continue;}const m=sjisMap.get(ch);if(!m)return null;out.push(...m);}return Buffer.from(out);}
const ascii=t=>/^[\x20-\x7e]*$/.test(t);
/* the generic scan (GARbro fallback, engines whose grammar is unknown): runs of Japanese text with kana, in order */
const JP_RUN=/[ぁ-ゖァ-ヺー一-龯々〆〜～！？。、「」『』（）…―・　Ａ-Ｚａ-ｚ０-９]{2,}/g;
/* E575 a Chinese patch has no kana: when no decoding gives kana, GBK text with enough Han characters is read the same way
   (runs with a Han character), so a patch read by the generic scan still yields lines to pair */
const ZH_RUN=/[一-鿿々〆〜～！？。，、；：“”‘’「」『』（）…—·　Ａ-Ｚａ-ｚ０-９]{2,}/g,HAN_G=/[一-鿿]/g;
function decodeRuns(buf){const pick=[];for(const enc of ['shift_jis','utf-8','utf-16le']){let t;try{t=new TextDecoder(enc).decode(buf);}catch{continue;}pick.push({t,kana:(t.match(KANA_G)||[]).length});}
 const best=pick.sort((a,b)=>b.kana-a.kana)[0],lines=[];let last='';
 if(!best||best.kana<4){let t='';try{t=new TextDecoder('gbk').decode(buf);}catch{return [];}if((t.match(HAN_G)||[]).length<8||(t.match(/�/g)||[]).length*20>t.length)return [];
  for(const raw of t.split(/[\r\n\0]+/))for(const m of raw.matchAll(ZH_RUN)){const s=trimBoth(m[0]);if(s.length<2||!/[一-鿿]/.test(s))continue;if(s!==last)lines.push(s);last=s;}
  return lines;}
 for(const raw of best.t.split(/[\r\n\0]+/))for(const m of raw.matchAll(JP_RUN)){const s=trimBoth(m[0]);if(s.length<2||!hasKana(s))continue;if(/^[ァ-ヺー]+$/.test(s)&&s.length<3)continue;if(s!==last)lines.push(s);last=s;}
 return lines;}

/* ---- transforms ------------------------------------------------------------------------------------------------- */
function xor(buf,key,start=0){const b=Buffer.from(buf),k=typeof key==='number'?[key&255]:key;for(let i=0;i<b.length;i++)b[i]^=k[(i+start)%k.length];return b;}
/* dword XOR whose key grows by add each dword, plus an increment added to the value (System-NNN's xor / addXor / addInc) */
function xorDword(buf,key,add=0,inc=0){const n=buf.length>>>2,out=Buffer.from(buf);let x=key>>>0,v=0;for(let i=0;i<n;i++){out.writeUInt32LE(((buf.readUInt32LE(i*4)^x)+v)>>>0,i*4);x=(x+add)>>>0;v=(v+inc)>>>0;}return out;}
const rol=(b,n)=>((b<<(n&7))|(b>>>(8-(n&7))))&255,ror=(b,n)=>((b>>>(n&7))|(b<<(8-(n&7))))&255;
const not=buf=>Buffer.from(buf.map(c=>~c&255));
/* E575 shared by EAGLS / CMVS / Lucifen / Ikura / Tmr-Hiro (engine-readers-d / -e research):
   msvcRand(seed) -> next() as the MSVC CRT rand (seed * 214013 + 2531011, (seed >> 16) & 0x7FFF)
   xorStream(buf, next, {start, stride}) XOR byte i with next() for i = start, start + stride, … (a key stream)
   nibbleSwap(buf) every byte's halves swapped (rol 4)
   rolBytes / rorBytes(buf, n) every byte rotated */
function msvcRand(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,214013)+2531011)>>>0;return (s>>>16)&0x7fff;};}
function xorStream(buf,next,{start=0,stride=1,end=buf.length}={}){const b=Buffer.from(buf);for(let i=start;i<end;i+=stride)b[i]^=next(i)&255;return b;}
const nibbleSwap=buf=>Buffer.from(buf.map(c=>((c<<4)|(c>>>4))&255));
const rolBytes=(buf,n)=>Buffer.from(buf.map(c=>rol(c,n))),rorBytes=(buf,n)=>Buffer.from(buf.map(c=>ror(c,n)));
/* length-prefixed record streams (LCSE / Tmr-Hiro / NekoSDK / ExHIBIT): records(buf, at, read) calls read(view, p) ->
   {next, ...record} until it returns null or runs past the end; returns the records */
function records(buf,at,read,max=1e6){const out=[];let p=at;for(let n=0;n<max&&p<buf.length;n++){let r;try{r=read(buf,p);}catch{break;}if(!r||!(r.next>p))break;out.push(r);p=r.next;}return out;}
/* LZSS, Okumura family. Defaults are the common one (GARbro LzssStream): 4 KB window, writes from 0xFEE, window filled
   with 0, flag bits LSB first and 1 = literal, a reference is lo | (hi & 0xF0) << 4 with length (hi & 0x0F) + 3.
   opts: window, start, fill, msb (flags read MSB first), zeroLiteral (0 = literal), minMatch, lenBits (low bits of
   the second byte), cap (output limit) */
function lzss(src,unpacked,opts={}){const W=opts.window||4096,mask=W-1,min=opts.minMatch??3,lb=opts.lenBits??4,lm=(1<<lb)-1;
 /* the output size when known, else what this input can grow to (every flag byte 8 references of up to 2^lenBits+min) */
 const limit=Math.min(unpacked??Math.ceil(src.length/3)*8*(lm+min),opts.cap??(64<<20));
 const win=new Uint8Array(W).fill(opts.fill||0),out=Buffer.alloc(Math.max(0,limit));let wp=(opts.start??0xfee)&mask,o=0,s=0;
 while(o<out.length&&s<src.length){const flags=src[s++];for(let bit=0;bit<8&&o<out.length&&s<src.length;bit++){const f=opts.msb?(flags>>(7-bit))&1:(flags>>bit)&1,lit=opts.zeroLiteral?!f:!!f;
  if(lit){const c=src[s++];out[o++]=c;win[wp]=c;wp=(wp+1)&mask;}
  else{if(s+1>=src.length)return out.subarray(0,o);const lo=src[s++],hi=src[s++];const pos=lo|((hi>>lb)<<8),len=(hi&lm)+min;for(let k=0;k<len&&o<out.length;k++){const c=win[(pos+k)&mask];out[o++]=c;win[wp]=c;wp=(wp+1)&mask;}}}}
 return out.subarray(0,o);}
/* E577 LZ with references measured back from the output (no window buffer): SiglusEngine (flags LSB first, 1 = literal,
   u16 token: distance tok >> 4, length (tok & 15) + 2) and Interheart ZLC2 (flags MSB first, 1 = reference, distance
   b0 | (b1 & 0xF0) << 4 with 0 meaning 4096, length (b1 & 15) + 3). opts: msb, refIsOne, token(b0, b1) -> {dist, len} */
const SIGLUS_TOKEN=(b0,b1)=>{const t=b0|(b1<<8);return {dist:t>>4,len:(t&15)+2};};
function lzDistance(src,unpacked,{at=0,msb=false,refIsOne=false,token=SIGLUS_TOKEN,strict=false}={}){const out=Buffer.alloc(unpacked);let s=at,o=0;
 while(o<unpacked&&s<src.length){const fl=src[s++];for(let k=0;k<8&&o<unpacked;k++){const bit=msb?(fl>>(7-k))&1:(fl>>k)&1;
  if(bit!==(refIsOne?1:0)){if(s>=src.length)break;out[o++]=src[s++];continue;}
  if(s+1>=src.length)break;const {dist,len}=token(src[s],src[s+1]);s+=2;if(!dist||dist>o){if(strict)throw Error('LZ_DISTANCE');break;}for(let j=0;j<len&&o<unpacked;j++){out[o]=out[o-dist];o++;}}}
 if(strict&&o<unpacked)throw Error('LZ_SHORT');return out.subarray(0,o);}
const inflate=(b,max=64<<20)=>zlib.inflateSync(b,{maxOutputLength:max}),inflateRaw=(b,max=64<<20)=>zlib.inflateRawSync(b,{maxOutputLength:max});
/* zstd (NeXAS since ~2016); Node 22.15+ has it built in, an older runtime gets null */
const zstd=(b,max=64<<20)=>typeof zlib.zstdDecompressSync==='function'?zlib.zstdDecompressSync(b,{maxOutputLength:max}):null;
/* the container's own compression told by its first bytes: zstd frame, zlib header, else null */
function unpackAny(b,max){if(b.length>=4&&b.readUInt32LE(0)===0xfd2fb528)return zstd(b,max);if(b.length>=2&&(b[0]&0x0f)===8&&((b[0]<<8)|b[1])%31===0){try{return inflate(b,max);}catch{}}return null;}
/* E577 the static Huffman coding GARbro calls HuffmanDecoder (NeXAS, CMVS, Lucifen …): the tree first (bit 1 = node, then
   left and right subtrees; bit 0 = leaf, then 8 bits), then the symbols. order 'msb': bits from each byte high first
   (GARbro MsbBitStream, NeXAS); 'dword': bits from little-endian dwords low first (GARbro Purple/Cmvs); 'dword-msb':
   little-endian dwords high bit first (ShiinaRio YH1); a short last dword reads as zero-padded */
function huffman(src,unpacked,{order='msb',start=0}={}){const out=Buffer.alloc(unpacked),lhs=new Uint16Array(512),rhs=new Uint16Array(512);let p=start,cur=0,left=0,token=256;
 const bit=()=>{if(!left){if(order!=='msb'){if(p>=src.length)throw new Error('huffman: input ends');cur=0;for(let k=0;k<4&&p<src.length;k++)cur|=src[p++]<<(8*k);cur>>>=0;left=32;}else{if(p>=src.length)throw new Error('huffman: input ends');cur=src[p++];left=8;}}
  left--;return order==='dword'?(cur>>>(31-left))&1:(cur>>>left)&1;};
 const bits=n=>{let v=0;while(n--)v=(v<<1)|bit();return v;};
 const tree=depth=>{if(depth>512)throw new Error('huffman: tree');if(bit()){const v=token++;if(v>=511)throw new Error('huffman: tree');lhs[v]=tree(depth+1);rhs[v]=tree(depth+1);return v;}return bits(8);};
 const root=tree(0);for(let o=0;o<unpacked;o++){let s=root;while(s>=256)s=bit()?rhs[s]:lhs[s];out[o]=s;}return out;}

/* ---- containers ------------------------------------------------------------------------------------------------- */
/* table(file, spec) -> [{name, offset, size, unpacked}] or null. spec:
     magic       string at 0 (latin1) the file must start with
     count       {at, type: u8|u16le|u32le|i32le}            how many entries
     entries     byte offset of the first entry (number) or {at, type} read from the header
     fields      [{name:'name'|'offset'|'size'|'unpacked'|'flags'|'next', type:u8|u16le|u32le|u64le|cstr|pstr8|skip, size}]
     nameCipher  'not' | {xor: n} applied to name bytes;  encoding (default shift_jis)
     base        'file' (default) | 'after-index' | {at, type} | number: added to every offset
     sizeFrom    'next' when sizes come from the next entry's offset (the last runs to the end of the file)
     validate    (entry, fileSize) -> bool, extra sanity check */
const INT={u8:[1,'readUInt8'],u16le:[2,'readUInt16LE'],u32le:[4,'readUInt32LE'],i32le:[4,'readInt32LE'],u32be:[4,'readUInt32BE']};
function rdInt(b,type,at){if(type==='u64le')return Number(b.readBigUInt64LE(at));const t=INT[type];return b[t[1]](at);}
const widthOf=type=>type==='u64le'?8:INT[type][0];
function table(file,spec,{maxIndex=64<<20}={}){const fsz=size(file);if(fsz<8)return null;
 const idx=readAt(file,0,Math.min(fsz,maxIndex));if(spec.magic&&idx.toString('latin1',0,spec.magic.length)!==spec.magic)return null;
 try{const count=spec.count?rdInt(idx,spec.count.type,spec.count.at):Infinity;if(spec.count&&(count<0||count>500000))return null;
  let p=typeof spec.entries==='number'?spec.entries:rdInt(idx,spec.entries.type,spec.entries.at);const raw=[];
  for(let n=0;n<count&&p<idx.length&&n<500000;n++){const e={};
   for(const f of spec.fields){if(f.type==='skip'){p+=f.size;continue;}
    if(f.type==='cstr'||f.type==='pstr8'){let nb;if(f.type==='cstr'){nb=idx.subarray(p,p+f.size);p+=f.size;const z=nb.indexOf(0);if(z>=0&&!spec.nameCipher)nb=nb.subarray(0,z);}else{const len=idx[p];nb=idx.subarray(p+1,p+1+len);p+=1+len;}
     nb=Buffer.from(nb);if(spec.nameCipher==='not')for(let i=0;i<nb.length;i++)nb[i]=~nb[i]&255;else if(spec.nameCipher?.xor!==undefined)for(let i=0;i<nb.length;i++)nb[i]^=spec.nameCipher.xor;
     const z=nb.indexOf(0);e.name=new TextDecoder(spec.encoding||'shift_jis').decode(z>=0?nb.subarray(0,z):nb);continue;}
    const v=rdInt(idx,f.type,p);p+=widthOf(f.type);if(f.name)e[f.name]=v;}
   raw.push(e);}
  const base=spec.base==='after-index'?p:typeof spec.base==='number'?spec.base:spec.base?rdInt(idx,spec.base.type,spec.base.at):0;
  const out=[];for(let i=0;i<raw.length;i++){const e=raw[i];let offset=base+e.offset,sz=e.size;
   if(spec.sizeFrom==='next'){const next=i+1<raw.length?base+raw[i+1].offset:fsz;sz=next-offset;}
   if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(sz)||sz<0||offset+sz>fsz||!e.name)return null;
   const entry={name:e.name.replace(/\\/g,'/'),offset,size:sz,unpacked:e.unpacked??sz,flags:e.flags};if(spec.validate&&!spec.validate(entry,fsz))return null;out.push(entry);}
  return out;}catch{return null;}}
const entryRead=(file,e)=>readAt(file,e.offset,e.size);
/* E578 a resource of a Windows executable: type and name are strings ("EXEC") or numbers; the first language. Engines
   that compile their scenario into the .exe (Malie EXEC, …) keep it here. -> Buffer or null */
/* E580 a program's PE header: null when the file cannot be read; machine 0 when it is not a PE image. bits 32 / 64 / 0,
   program: an executable image that is not a DLL (library, kirikiri-cold, voice-cold, patch-swap read this alike) */
function peInfo(file){let b;try{b=readAt(file,0,0x1000);}catch{return null;}if(b.length<0x40)return {machine:0,bits:0,program:false,raw:b};
 const o=b.readUInt32LE(0x3c);let h=o+24<=b.length?b.subarray(o,o+24):null;if(!h){try{h=readAt(file,o,24);}catch{h=Buffer.alloc(0);}}
 if(b.readUInt16LE(0)!==0x5a4d||h.length<24||h.readUInt32LE(0)!==0x4550)return {machine:h.length>=6?h.readUInt16LE(4):0,bits:0,program:false,pe:false};
 const machine=h.readUInt16LE(4),attr=h.readUInt16LE(22);return {machine,bits:machine===0x14c?32:machine===0x8664||machine===0xaa64?64:0,program:!!(attr&2)&&!(attr&0x2000),pe:true};}
function peResource(file,type,name=null){try{const mz=readAt(file,0,0x40);if(mz.toString('latin1',0,2)!=='MZ')return null;const pe=mz.readUInt32LE(0x3c),h=readAt(file,pe,0x200);if(h.toString('latin1',0,4)!=='PE  ')return null;
 const nsec=h.readUInt16LE(6),opt=h.readUInt16LE(20),o=24,magic=h.readUInt16LE(o),dd=o+(magic===0x20b?112:96),rva=h.readUInt32LE(dd+2*8);if(!rva)return null;
 const secs=readAt(file,pe+24+opt,nsec*40);let sec=null;for(let i=0;i<nsec;i++){const va=secs.readUInt32LE(i*40+12),vs=Math.max(secs.readUInt32LE(i*40+8),secs.readUInt32LE(i*40+16));if(rva>=va&&rva<va+vs)sec={va,raw:secs.readUInt32LE(i*40+20),size:vs};}
 if(!sec)return null;const rs=readAt(file,sec.raw,Math.min(sec.size,64<<20)),at=r=>r-sec.va+0;
 const ustr=p=>rs.toString('utf16le',p+2,p+2+rs.readUInt16LE(p)*2);
 const find=(dir,want)=>{const n=rs.readUInt16LE(dir+12)+rs.readUInt16LE(dir+14);for(let i=0;i<n;i++){const e=dir+16+i*8,id=rs.readUInt32LE(e),off=rs.readUInt32LE(e+4);
  const key=id&0x80000000?ustr(id&0x7fffffff):id;if(want===null||(typeof want==='string'?typeof key==='string'&&key.toUpperCase()===want.toUpperCase():key===want))return off;}return null;};
 let d=find(0,type);if(d===null||!(d&0x80000000))return null;d=find(d&0x7fffffff,name);if(d===null)return null;
 if(d&0x80000000){d=find(d&0x7fffffff,null);if(d===null||d&0x80000000)return null;}
 const drva=rs.readUInt32LE(d),dsz=rs.readUInt32LE(d+4);return Buffer.from(rs.subarray(at(drva),at(drva)+dsz));}catch{return null;}}

/* ---- text models ------------------------------------------------------------------------------------------------ */
/* offsets[i] (relative to base) -> the C strings, in table order */
function stringTable(buf,{offsetsAt,count,base,limit=buf.length,width=4}){const out=[];for(let i=0;i<count;i++){const at=offsetsAt+i*width;if(at+width>buf.length)break;const o=width===4?buf.readInt32LE(at):buf.readUInt16LE(at);const s=cstr(buf,base+o,limit);if(s)out.push(s);}return out;}
/* index -> dword pointer in a table (dword units) -> C string at pointer*4 */
function pointerTable(buf,tableDword,count){const n=buf.length>>>2;return k=>k<count&&tableDword+k<n?cstr(buf,buf.readUInt32LE((tableDword+k)*4)*4):null;}
/* walk a bytecode whose operands have fixed encodings: enc(op) -> operand list ('i' 4, 'h' 2, 'b' 1, 's' u16 length +
   bytes, 'z' C string, 't' u16 count + bytes, 'c' u16 count × 4, or a number of bytes); emit(op, strings) for every
   instruction that carries strings. Stops at the first unknown opcode. opWidth 1 or 2 */
function opcodeWalk(code,enc,emit,{opWidth=2,start=0}={}){let p=start;
 while(p+opWidth<=code.length){const op=opWidth===2?code.readUInt16LE(p):code[p];p+=opWidth;const e=enc(op);if(e===undefined||e===null)return p-opWidth;const strs=[];
  for(const c of Array.isArray(e)||typeof e==='string'?e:[e]){
   if(typeof c==='number'){p+=c;continue;}
   if(c==='i'){p+=4;continue;}if(c==='h'){p+=2;continue;}if(c==='b'){p+=1;continue;}
   if(c==='s'){if(p+2>code.length)return p;const n=code.readUInt16LE(p);p+=2;strs.push(code.subarray(p,p+Math.max(0,n-1)));p+=n;continue;}
   if(c==='z'){const z=code.indexOf(0,p);if(z<0)return p;strs.push(code.subarray(p,z));p=z+1;continue;}
   if(c==='t'){if(p+2>code.length)return p;p+=2+code.readUInt16LE(p);continue;}
   if(c==='c'){if(p+2>code.length)return p;p+=2+4*code.readUInt16LE(p);continue;}}
  if(p>code.length)return code.length;emit(op,strs);}
 return p;}
/* KAG-like plain text: comments, labels, @commands and [tags] are anchors; "#name" / "【name】" lines are speakers;
   [ruby text=…] or [漢字'よみ] give readings. opts: comment (RegExp), code blocks [[open,close]], name (RegExp with
   group 1), strip (RegExp list), anchor (RegExp) */
function lineGrammar(text,opts={}){const lines=[],anchors=[];let block=null;
 const comment=opts.comment||/^(;|\/\/)/,anchor=opts.anchor||/^[@*]/,blocks=opts.blocks||[[/^[@[]\s*iscript\b/i,/^[@[]\s*endscript\b/i]];
 for(const raw of text.split(/\r?\n/)){const t=raw.trim();if(!t)continue;
  if(block){if(block.test(t))block=null;continue;}const b=blocks.find(([o])=>o.test(t));if(b){block=b[1];continue;}
  if(comment.test(t))continue;if(anchor.test(t)){anchors.push(t);continue;}
  if(opts.name){const m=opts.name.exec(t);if(m){if(m[1])lines.push(m[1].trim());continue;}}
  let s=t;for(const r of opts.strip||[/\[[^\]]*\]/g])s=s.replace(r,'');s=trimBoth(s);if(!s){anchors.push(t);continue;}lines.push(s);}
 return {lines,anchors};}

/* ---- executables and keys (E581) -------------------------------------------------------------------------------- */
/* (peResource: see E578 above; QLIE RESKEY / TFORM1 and Entis IDR_COTOMI use it too) */
/* weights of plaintext bytes in Shift-JIS script text: kana / punctuation leads high, ASCII and line ends fair, control
   bytes and bytes Shift-JIS never uses negative. sep: weight of 0x00 (strings separated by NUL) */
function sjisWeights(sep=3){const w=new Float64Array(256);for(let b=0;b<256;b++){let v=0.4;
 if(b===0)v=sep;else if(b===0x0a||b===0x0d)v=2;else if(b<0x20||b===0x7f)v=-2;else if(b<0x7f)v=1.5;else if(b===0x81||b===0x82)v=4;else if(b===0x83)v=2.5;else if(b>=0x88&&b<=0x9f)v=1.5;else if(b>=0xe0&&b<=0xea)v=1;else if(b===0x80||b===0xa0)v=-1;else if(b>=0xa1&&b<=0xdf)v=0.2;else if(b>=0xfd)v=-3;w[b]=v;}return w;}
/* the same for GBK (Chinese patches): leads 0xB0-0xF7 and punctuation 0xA1-0xA9 high, trails 0xA1-0xFE fair */
function gbkWeights(sep=3){const w=new Float64Array(256);for(let b=0;b<256;b++){let v=0.3;
 if(b===0)v=sep;else if(b===0x0a||b===0x0d)v=2;else if(b<0x20||b===0x7f)v=-2;else if(b<0x7f)v=1.2;else if(b>=0xb0&&b<=0xf7)v=2.5;else if(b>=0xa1&&b<=0xa9)v=2;else if(b>=0xa1&&b<=0xfe)v=0.8;else if(b===0x80||b===0xff)v=-3;w[b]=v;}return w;}
/* textScore(buf) -> share of characters that are CJK text, minus undecodable ones, in the codepage that fits (SJIS or GBK):
   how plausible a decrypted script is, for any key search. Strong for Shift-JIS; weak alone for GBK, where almost every
   byte pair decodes, so a reader adds its own structure check (separators, command lines) */
function textScore(buf){const b=buf.subarray(0,32768);if(!b.length)return 0;const t=new TextDecoder(codepage(b)).decode(b);
 const good=(t.match(/[ぁ-ヺー一-龯々　-〿！-～“”‘’…]/g)||[]).length,bad=(t.match(/[�\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g)||[]).length;return (good-2*bad)/t.length;}
/* xorKeyByColumns(buf, {maxPeriod, weights, sample}) -> [{key, period, score}] best first: a repeating XOR key recovered
   from ciphertext alone. Per period every column takes the key byte that makes its plaintext most like the weights; the
   smallest period within 3 % of the best wins (a multiple of the true period always fits as well). Generic: Marble
   scripts, and the adapter-pack key candidates */
function xorKeyByColumns(buf,{maxPeriod=64,weights=sjisWeights(),sample=48<<10,minPeriod=1}={}){const s=buf.subarray(0,Math.min(buf.length,sample));if(s.length<64)return [];const out=[];
 for(let L=minPeriod;L<=Math.min(maxPeriod,s.length>>3);L++){const key=Buffer.alloc(L);let total=0;
  for(let c=0;c<L;c++){const h=new Uint32Array(256);for(let i=c;i<s.length;i+=L)h[s[i]]++;const used=[];for(let b=0;b<256;b++)if(h[b])used.push(b);let best=-Infinity,bk=0;
   for(let k=0;k<256;k++){let v=0;for(const b of used)v+=h[b]*weights[b^k];if(v>best){best=v;bk=k;}}key[c]=bk;total+=best;}
  out.push({key,period:L,score:total/s.length});}
 if(!out.length)return [];const top=Math.max(...out.map(o=>o.score)),pick=out.find(o=>o.score>=top-Math.abs(top)*0.03);return [pick,...out.filter(o=>o!==pick).sort((a,b)=>b.score-a.score).slice(0,4)];}

/* ---- bundles (E604: TyranoScript's containers, shared by the web / NW.js / Electron / zip-asset family) --------------
   asarList(file)  Electron app.asar: u32 4, u32 header size, pickle {u32, u32 json length, JSON tree}; data from 8 + size
   zipList(file)   a zip anywhere in a file (package.nw, .love, .jar, a zip appended to an exe): end record, central
                   directory, offsets taken from where the directory really is
   zipRead(file,e) stored or deflated entry */
function asarList(file){let head;try{head=readAt(file,0,16);}catch{return null;}if(head.length<16||head.readUInt32LE(0)!==4)return null;
 const size=head.readUInt32LE(4);if(size<8||size>64<<20)return null;const h=readAt(file,8,size);if(h.length<8)return null;
 const len=h.readUInt32LE(4);let tree;try{tree=JSON.parse(h.toString('utf8',8,8+len));}catch{return null;}
 const base=8+size,out=[];const walkTree=(node,pre)=>{for(const [name,v] of Object.entries(node.files||{})){const rel=pre?pre+'/'+name:name;if(v.files)walkTree(v,rel);else if(!v.unpacked&&v.offset!==undefined)out.push({name:rel,offset:base+Number(v.offset),size:Number(v.size)});}};
 walkTree(tree,'');return out;}
function zipList(file){const sz=size(file);if(sz<22)return null;
 const tailLen=Math.min(sz,65557),t=readAt(file,sz-tailLen,tailLen);let e=-1;for(let i=t.length-22;i>=0;i--)if(t.readUInt32LE(i)===0x06054b50){e=i;break;}if(e<0)return null;
 const count=t.readUInt16LE(e+10),cdSize=t.readUInt32LE(e+12),cdOff=t.readUInt32LE(e+16),cdAt=sz-tailLen+e-cdSize,shift=cdAt-cdOff;if(cdAt<0)return null;
 const cd=readAt(file,cdAt,cdSize),out=[];let p=0;
 for(let i=0;i<count&&p+46<=cd.length;i++){if(cd.readUInt32LE(p)!==0x02014b50)break;const flags=cd.readUInt16LE(p+8),method=cd.readUInt16LE(p+10),comp=cd.readUInt32LE(p+20),raw=cd.readUInt32LE(p+24),nl=cd.readUInt16LE(p+28),xl=cd.readUInt16LE(p+30),cl=cd.readUInt16LE(p+32),local=cd.readUInt32LE(p+42);
  const nameBuf=cd.subarray(p+46,p+46+nl),name=flags&0x800?nameBuf.toString('utf8'):decodeText(nameBuf);out.push({name:name.replace(/\\/g,'/'),method,comp,raw,local:local+shift,encrypted:!!(flags&1)});p+=46+nl+xl+cl;}
 return out;}
function zipRead(file,e){const h=readAt(file,e.local,30);if(h.readUInt32LE(0)!==0x04034b50)throw Error('ZIP_LOCAL');const at=e.local+30+h.readUInt16LE(26)+h.readUInt16LE(28),data=readAt(file,at,e.comp);
 if(e.method===0)return data;if(e.method===8)return zlib.inflateRawSync(data,{maxOutputLength:256<<20});throw Error('ZIP_METHOD_'+e.method);}

/* ---- names (E605: every reader built its own TextDecoder('shift_jis') and cut fixed-size archive names at NUL by hand)
   SJIS            one shared Shift-JIS decoder (decode() without stream is stateless, so sharing is safe)
   cname(b,s,e)    b[s..e) cut at the first NUL, decoded as Shift-JIS: the fixed-width name field of most archive indexes */
const SJIS=new TextDecoder('shift_jis');
function cname(b,start=0,end=b.length){const s=b.subarray(start,end),z=s.indexOf(0);return SJIS.decode(z<0?s:s.subarray(0,z));}

/* ---- engine factory --------------------------------------------------------------------------------------------- */
/* engine({id, hint, archives:{name, magic, subs, list(file) -> entries|null, read(file, entry) -> Buffer, entry: RegExp},
   loose:{name, subs}, parse}) -> {id, hint, scenes, archives, sources, parse, test}. Loose files override archived
   ones of the same base name; scenes are sorted by name. */
/* archives options (E577, so the single-script-archive readers share it too): find(dir) -> files instead of the name /
   magic search; entries that carry their own read() keep it; keepPath keeps "folder/name" (default: the base name);
   sort:false keeps the archive's order. overlay:false makes archives(dir) return [] (the reader pairs a patch its own
   way, or a patch never replaces single entries). */
function engine(def){const A=def.archives;
 const arcFiles=dir=>!A?[]:(A.find?[].concat(A.find(dir)||[]):files(dir,{name:A.name,magic:A.magic,subs:A.subs||['']})).filter(f=>{try{return !!A.list(f);}catch{return false;}});
 const looseFiles=dir=>def.loose?files(dir,{name:def.loose.name,subs:def.loose.subs||[''],max:20000}):[];
 const scenes=dir=>{const out=new Map();
  for(const a of arcFiles(dir)){let l;try{l=A.list(a);}catch{l=null;}for(const e of l||[]){if(A.entry&&!A.entry.test(e.name))continue;const n=A.keepPath?e.name:path.posix.basename(String(e.name).replace(/\\/g,'/'));
   out.set(n.toLowerCase(),{name:n,read:typeof e.read==='function'?e.read:()=>A.read?A.read(a,e):entryRead(a,e)});}}
  for(const f of looseFiles(dir))out.set(path.basename(f).toLowerCase(),{name:path.basename(f),read:()=>fs.readFileSync(f)});
  const list=[...out.values()];return A?.sort===false?list:list.sort((a,b)=>a.name.localeCompare(b.name));};
 return {id:def.id,hint:def.hint,scenes,archives:def.overlay===false?()=>[]:scenes,sources:dir=>[...arcFiles(dir),...looseFiles(dir)],parse:buf=>{try{return def.parse(Buffer.isBuffer(buf)?buf:Buffer.from(buf));}catch{return {lines:[],anchors:[]};}},test:def.test||(n=>!!def.loose&&def.loose.name.test(n)),...(def.extra||{})};}

module.exports={SJIS,cname,asarList,zipList,zipRead,peInfo,readAt,size,head,tail,names,isFile,walk,files,KANA,KANA_G,hasKana,codepage,codepageOf,decodeText,decoder,cstr,trimBoth,ascii,decodeRuns,encodeSjis,
 xor,xorDword,rol,ror,not,msvcRand,xorStream,nibbleSwap,rolBytes,rorBytes,records,lzss,lzDistance,SIGLUS_TOKEN,inflate,inflateRaw,zstd,unpackAny,huffman,table,entryRead,peResource,rdInt,stringTable,pointerTable,opcodeWalk,lineGrammar,engine,
 sjisWeights,gbkWeights,textScore,xorKeyByColumns};

/* ---- game-maker binaries (E630: GameMaker, Director, HSP, Clickteam, AGS, SRPG Studio, XNA … keep their data appended to
   the runtime exe or in one string pool) ---------------------------------------------------------------------------------
   peOverlay(file)            {at, size} of the bytes after the last PE section (where HSP DPM, AGS CLIB, Clickteam PAME,
                              Director projector movies sit), or null
   scan(file, magic, opts)    offsets of magic (string latin1 or Buffer) in a file read in windows ({from, to, max, window})
   poolLines(strings)         a string pool's shown text: trimmed, non-ASCII (Japanese or a Chinese patch), no undecodable
                              bytes, CR LF -> LF, in pool order (a patch that rewrites the pool pairs 1:1)
   textRuns(text)             runs of Japanese (with kana) or, when there is no kana anywhere, Chinese text in a decoded
                              blob, in order (the generic scan for UTF-16 / UTF-8 data decodeRuns does not pick) */
function peOverlay(file){try{const mz=readAt(file,0,0x40);if(mz.length<0x40||mz.toString('latin1',0,2)!=='MZ')return null;const pe=mz.readUInt32LE(0x3c),h=readAt(file,pe,24);
 if(h.length<24||h.toString('latin1',0,4)!=='PE\0\0')return null;const nsec=h.readUInt16LE(6),opt=h.readUInt16LE(20),secs=readAt(file,pe+24+opt,nsec*40);let end=0;
 for(let i=0;i<nsec&&(i+1)*40<=secs.length;i++){const raw=secs.readUInt32LE(i*40+20),rs=secs.readUInt32LE(i*40+16);if(raw&&raw+rs>end)end=raw+rs;}
 const sz=size(file);return end&&end<sz?{at:end,size:sz-end}:null;}catch{return null;}}
function scan(file,magic,{from=0,to=Infinity,max=64,window=16<<20}={}){const m=Buffer.isBuffer(magic)?magic:Buffer.from(magic,'latin1'),end=Math.min(size(file),to),out=[];
 for(let p=from;p<end&&out.length<max;p+=window){const b=readAt(file,p,Math.min(window+m.length-1,end-p));let i=b.indexOf(m);while(i>=0&&i<window&&out.length<max){out.push(p+i);i=b.indexOf(m,i+1);}}
 return out;}
function poolLines(strings){const out=[];for(const s of strings){if(typeof s!=='string')continue;const t=trimBoth(s.replace(/\r\n|\r/g,'\n'));
 if(!t||ascii(t.replace(/\n/g,' '))||/[�\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t))continue;out.push(t);}return out;}
const TEXT_RUN=/[ぁ-ゖァ-ヺー一-鿿々〆〜～！？。、，；：“”‘’「」『』（）…―—・　Ａ-Ｚａ-ｚ０-９]{2,}/g;
function textRuns(text){const kana=hasKana(text),out=[];let last='';
 for(const raw of String(text).split(/[\r\n\0]+/))for(const m of raw.matchAll(TEXT_RUN)){const s=trimBoth(m[0]);if(s.length<2||(kana?!hasKana(s):!/[一-鿿]/.test(s)))continue;if(s!==last)out.push(s);last=s;}
 return out;}
module.exports.peOverlay=peOverlay;module.exports.scan=scan;module.exports.poolLines=poolLines;module.exports.textRuns=textRuns;
