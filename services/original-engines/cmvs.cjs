// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E592 CMVS — Purple Software's engine (Purple software, Chronoclock, Amatarasu Riddle Star, 青空の見える丘, ハピメア …;
   ~44 company releases, 26 since 2016). Family A (string pool, docs/engine-families.md).
   Format references (read, not copied): GARbro ArcFormats/Cmvs ArcCPZ.cs, CpzHeader.cs, CmvsMD5.cs (morkt, MIT) for the
   archive; ZQF-ReVN/RxCMVS PS3_Cryptor.cpp / PS3_TextEditor.cpp (no licence: format facts only) for the script; the
   per-title constants live in cmvs-schemes.json.
     *.cpz   "CPZ5" / "CPZ6" (read) / "CPZ7" (detected, needs a real game: its keys hide in start.ps3). A 0x40-byte header
             of XOR-masked fields with an additive checksum and the index's MD5; the index is decrypted in four passes
             (stage 1 with the CPZ5 secret, a byte substitution table, the directory cipher, the per-directory entry
             cipher), keyed by a modified MD5 of four header words (the variant differs per title). Entries are
             decrypted with the same secret and table.
     *.ps2 / *.ps3  "PS2A": 0x30-byte header {+0xC key, +0x10 text count, +0x14 code size, +0x18 extra size,
             +0x1C text size, +0x24 packed size, +0x28 unpacked size}; the body is byte-rotated
             (b = ror(k ^ (b - 0x7C), (key >> 20) % 5 + 1), k = (key >> 24) + (key >> 3)) then LZSS (2 KB window from
             0x7DF, 3 offset bits in the high byte, length + 2).
   Text model: the code section (code + 4 × text count + extra) pushes strings with 01 02 20 01 <u32 offset> 0F 02 30 04;
   the offset points into the text section (C strings). Lines come in push order, so a Chinese patch that appends its
   strings and repoints the pushes (how RxCMVS rebuilds a .ps3) pairs 1:1. Resource names (.ogg, .ps3 …) and ASCII
   strings are anchors. */
const kit=require('./kit.cjs'),fs=require('node:fs');
const SCHEMES=require('./cmvs-schemes.json');
const hex=s=>parseInt(s,16)>>>0;
function scheme(params){const s=params||SCHEMES,c=s.cpz5;
 return {md5:Object.entries(s.md5).map(([name,v])=>({name,init:v.init.map(hex),out:v.out.map(([i,op,k])=>[i,op,hex(k)])})),
  secret:c.secret.map(hex),factor:hex(c.decoderFactor),entryInit:hex(c.entryInitKey),entrySub:hex(c.entrySubKey),entryTail:hex(c.entryTailKey),entryPos:hex(c.entryKeyPos),
  indexSeed:hex(c.indexSeed),indexAddend:hex(c.indexAddend),indexSub:hex(c.indexSubtrahend),dirAddend:c.dirKeyAddend.map(hex)};}
const DEFAULT=scheme();
const rotl=(v,n)=>{n&=31;return n?((v<<n)|(v>>>(32-n)))>>>0:v>>>0;},rotr=(v,n)=>{n&=31;return n?((v>>>n)|(v<<(32-n)))>>>0:v>>>0;};

/* ---- modified MD5: one compression of {w0..w3, 0x80, 0 …, 0x80 (bit length), 0} from the variant's state ---------- */
const S=[[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]],T=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*2**32)>>>0);
function md5Words(words,variant){const m=new Array(16).fill(0);for(let i=0;i<4;i++)m[i]=words[i]>>>0;m[4]=0x80;m[14]=0x80;
 let [a,b,c,d]=variant.init;const st=[...variant.init];
 for(let i=0;i<64;i++){let f,g;if(i<16){f=d^(b&(c^d));g=i;}else if(i<32){f=c^(d&(b^c));g=(5*i+1)&15;}else if(i<48){f=b^c^d;g=(3*i+5)&15;}else{f=c^(b|~d);g=(7*i)&15;}
  const t=d;d=c;c=b;b=(b+rotl((a+f+m[g]+T[i])>>>0,S[i>>4][i&3]))>>>0;a=t;}
 st[0]=(st[0]+a)>>>0;st[1]=(st[1]+b)>>>0;st[2]=(st[2]+c)>>>0;st[3]=(st[3]+d)>>>0;
 return variant.out.map(([i,op,k])=>op==='^'?(st[i]^k)>>>0:op==='+'?(st[i]+k)>>>0:(st[i]-k)>>>0);}

/* ---- header ------------------------------------------------------------------------------------------------------- */
function header(h){if(h.length<0x40||h.toString('latin1',0,3)!=='CPZ')return null;const v=h[3]-48;if(v<5||v>7)return null;
 const u=o=>h.readUInt32LE(o),i=o=>h.readInt32LE(o),sum=(n,init)=>{let s=init;for(let o=0;o<n;o+=4)s=(s+u(o))>>>0;return s;};
 const c=v===5?{k:[-0x1C5AC27,0x37F298E7,0x7A6F3A2C,0xAE7D39BF,0xFB73A955],m:[0x43DE7C19,0xCC65F415,0xD016A93C,0x97A3BA9A]}
  :{k:[-0x1C5AC26,0x37F298E8,0x7A6F3A2D,0xAE7D39B7,0xFB73A956],m:[0x43DE7C1A,0xCC65F416,0xD016A93D,0x97A3BA9B]};
 const r={version:v,dirCount:i(4)^c.k[0],dirSize:i(8)^c.k[1],fileSize:i(12)^c.k[2],master:(u(0x30)^c.k[3])>>>0,encrypted:((u(0x34)^c.k[4])>>>0)!==0,
  md5:c.m.map((k,n)=>(u(0x20+n*4)^k)>>>0),entryKey:v===5?0:(Math.imul(0x7DA8F173,rotr((u(0x38)^0x37ACF832)>>>0,5))+0x13712765)>>>0,nameAt:0x18,indexAt:0x40,checksum:true};
 if(v===7){if(h.length<0x48)return null;const raw=u(0x40);r.keySize=(raw^0x65EF99F3)|0;r.nameAt=0x1C;r.indexAt=0x48;r.checksum=sum(0x40,(raw-0x6DC5A9B4)>>>0)===u(0x44);}
 else r.checksum=sum(0x3C,0x923A564C)===u(0x3C);
 r.indexMd5=h.subarray(0x10,0x20);return r.checksum&&r.dirCount>0&&r.dirSize>0&&r.fileSize>0?r:null;}

/* ---- index -------------------------------------------------------------------------------------------------------- */
function table(key,summand,factor){const t=Uint8Array.from({length:256},(_,i)=>i);
 for(let n=0;n<256;n++){let a=(key>>>16)&255,b=key&255,x=t[a];t[a]=t[b];t[b]=x;a=(key>>>8)&255;b=key>>>24;x=t[a];t[a]=t[b];t[b]=x;key=(summand+Math.imul(factor,rotr(key,2)))>>>0;}
 return t;}
function stage1(d,key,sc){const sk=sc.secret.map(s=>(s-key)>>>0),shift=(((key>>>24)^(key>>>16)^(key>>>8)^key^0xB)&15)+7,n=d.length>>>2;let j=5;
 for(let p=0;p<n;p++){d.writeUInt32LE((rotr(((sk[j]^d.readUInt32LE(p*4))+sc.indexAddend)>>>0,shift)+0x01010101)>>>0,p*4);j=(j+1)%24;}
 for(let q=n*4,k=d.length&3;k>0;k--,q++){d[q]=((d[q]^(sk[j]>>>(k*4)))-sc.indexSub)&255;j=(j+1)%24;}}
function dirCipher(d,len,key4,arcKey=0){let seed=0x76548AEF,i=0;
 for(;i<len>>>2;i++){d.writeUInt32LE((rotl(((d.readUInt32LE(i*4)^key4[i&3])-0x4A91C262)>>>0,3)-seed)>>>0,i*4);seed=(seed+((0x10FB562A^arcKey)>>>0))>>>0;}
 for(let q=i*4;q<len;q++,i++)d[q]=((d[q]^(key4[i&3]>>>6))+0x37)&255;}
function entryCipher(d,at,len,key4,seed,arcKey=0){let i=0;
 for(;i<len>>>2;i++){const o=at+i*4;d.writeUInt32LE((rotl(((d.readUInt32LE(o)^key4[i&3])-seed)>>>0,2)+0x37A19E8B)>>>0,o);seed=(seed-((0x139FA9B^arcKey)>>>0))>>>0;}
 for(let q=at+i*4;q<at+len;q++,i++)d[q]=((d[q]^(key4[i&3]>>>4))+5)&255;}
/* the entries of one directory index decrypted with one md5 variant, or null when it does not parse */
function readIndex(raw,h,variant,sc,fileSize){const idx=Buffer.from(raw),md5=md5Words(h.md5,variant),mk=h.master;
 stage1(idx,(mk^0x3795B39A)>>>0,sc);let t=table(mk,md5[1],sc.factor);for(let i=0;i<h.dirSize;i++)idx[i]=t[0x3A^idx[i]];
 dirCipher(idx,h.dirSize,[(md5[0]^((mk+0x76A3BF29)>>>0))>>>0,(md5[1]^mk)>>>0,(md5[2]^((mk+0x10000000)>>>0))>>>0,(md5[3]^mk)>>>0]);
 t=table(mk,md5[2],sc.factor);const base=h.indexAt+raw.length,out=[];let dp=0;
 for(let d=0;d<h.dirCount;d++){if(dp+16>h.dirSize)return null;const size=idx.readInt32LE(dp),count=idx.readInt32LE(dp+4),eo=idx.readInt32LE(dp+8),dirKey=idx.readUInt32LE(dp+12);
  if(size<=16||dp+size>h.dirSize||count<0||count>=0x10000)return null;const name=kit.cstr(idx,dp+16,dp+size).toString('latin1');
  const next=d+1===h.dirCount?h.fileSize:(dp+size+12<=h.dirSize?idx.readInt32LE(dp+size+8):-1),len=next-eo;if(len<=0||eo<0||h.dirSize+eo+len>idx.length)return null;
  let cur=h.dirSize+eo;const end=cur+len;for(let i=cur;i<end;i++)idx[i]=t[0x7E^idx[i]];
  entryCipher(idx,cur,len,md5.map((m,j)=>(m^((dirKey+sc.dirAddend[j])>>>0))>>>0),sc.indexSeed);
  for(let e=0;e<count;e++){if(cur+h.nameAt>end)return null;const es=idx.readInt32LE(cur);if(es<=h.nameAt||cur+es>end)return null;
   const nb=kit.cstr(idx,cur+h.nameAt,end);if(!nb||!nb.length||nb.some(c=>c<0x20))return null;const ko=cur+(h.version>6?0x14:0x10);
   const entry={name:(name==='root'?'':name+'/')+kit.SJIS.decode(nb),offset:Number(idx.readBigInt64LE(cur+4))+base,size:idx.readUInt32LE(cur+12),key:(idx.readUInt32LE(ko+4)+dirKey)>>>0};
   if(entry.offset<base||entry.offset+entry.size>fileSize)return null;out.push(entry);cur+=es;}
  dp+=size;}
 return {entries:out,md5,variant:variant.name};}
const memo=new Map();
/* {version, entries, md5, h, sc} for a CPZ5/CPZ6 archive; null for anything else (CPZ7 included) */
function open(file,params){const fsz=kit.size(file),stamp=file+'|'+fsz+'|'+(kit.isFile(file)?fs.statSync(file).mtimeMs:0);if(memo.has(stamp))return memo.get(stamp);
 let r=null;try{const h=header(kit.head(file,0x48));if(h&&h.version<7){const sc=params?scheme(params):DEFAULT,raw=kit.readAt(file,h.indexAt,h.dirSize+h.fileSize);
  if(raw.length===h.dirSize+h.fileSize&&require('node:crypto').createHash('md5').update(raw).digest().equals(h.indexMd5))
   for(const v of sc.md5){const x=readIndex(raw,h,v,sc,fsz);if(x&&x.entries.length){r={...x,h,sc};break;}}}}catch{r=null;}
 if(memo.size>64)memo.clear();memo.set(stamp,r);return r;}
const list=file=>open(file)?.entries||null;
function read(file,e){const a=open(file),data=kit.readAt(file,e.offset,e.size);if(!a||!a.h.encrypted)return data;
 const {h,sc,md5}=a;let seed=((((h.master^e.key)>>>0)+h.dirCount)>>>0);seed=(seed-sc.entrySub)>>>0;seed=(seed^h.entryKey)>>>0;
 const t=table(md5[3],h.master,sc.factor),kb=Buffer.alloc(64);for(let i=0;i<16;i++)kb.writeUInt32LE(sc.secret[i],i*4);
 const low=(md5[1]>>>2)&255,sk=Array.from({length:16},(_,i)=>{for(let q=0;q<4;q++)kb[i*4+q]=low^t[kb[i*4+q]];return (kb.readUInt32LE(i*4)^seed)>>>0;});
 let key=sc.entryInit,k=sc.entryPos;const n=data.length>>>2;
 for(let i=0;i<n;i++){const v=(md5[key&3]^(((data.readUInt32LE(i*4)^sk[(key>>>6)&15]^(sk[k]>>>1))>>>0)-seed))>>>0;data.writeUInt32LE(v,i*4);k=(k+1)&15;key=(key+seed+v)>>>0;}
 for(let q=n*4;q<data.length;q++)data[q]=t[data[q]^sc.entryTail];
 return data;}

/* ---- PS2A script -------------------------------------------------------------------------------------------------- */
function unpackPs2(buf){if(buf.length<0x30||buf.toString('latin1',0,4)!=='PS2A')return null;const key=buf.readUInt32LE(12),shift=((key>>>20)%5)+1,k=((key>>>24)+(key>>>3))&255;
 const body=Buffer.from(buf.subarray(0x30).map(b=>kit.ror(k^((b-0x7C)&255),shift)));
 return Buffer.concat([buf.subarray(0,0x30),kit.lzss(body,buf.readUInt32LE(0x28),{window:0x800,start:0x7df,lenBits:5,minMatch:2})]);}
const PUSH=Buffer.from([1,2,0x20,1]),PUSH_END=Buffer.from([0x0f,2,0x30,4]);
const RESOURCE=/\.(ogg|wav|mv2|pb3|pb2|ps3|ps2|cur|cmv|mgv|png|bmp)\b/i;
/* the pushed strings in code order */
function pushed(d){const count=d.readUInt32LE(0x10),code=0x30,codeLen=d.readUInt32LE(0x14)+4*count+d.readUInt32LE(0x18),text=code+codeLen,textLen=d.readUInt32LE(0x1C),out=[];
 if(text+textLen>d.length||codeLen<0)return out;
 for(let p=code;p+12<=text;p++){if(d[p]!==1||!d.subarray(p,p+4).equals(PUSH)||!d.subarray(p+8,p+12).equals(PUSH_END))continue;const s=kit.cstr(d,text+d.readUInt32LE(p+4),text+textLen);if(s&&s.length)out.push(s);p+=11;}
 return out;}
const clean=t=>kit.trimBoth(t.replace(/\\n/g,'\n'));
function parse(buf){const d=unpackPs2(buf);if(!d)return {lines:[],anchors:[]};const list=pushed(d),dec=kit.decoder(list),lines=[],anchors=[];
 for(const s of list){const t=s.some(c=>c>=0x80)?clean(dec.decode(s)):s.toString('latin1');if(!t)continue;if(kit.ascii(t)||RESOURCE.test(t))anchors.push(t);else lines.push(t);}
 return {lines,anchors};}

const PS=/\.ps[23]$/i;
const cpz7=dir=>kit.files(dir,{name:/\.cpz$/i,magic:'CPZ7'}).length>0&&!kit.files(dir,{name:/\.cpz$/i}).some(f=>list(f)?.some(e=>PS.test(e.name)));
const engine=kit.engine({id:'cmvs',hint:'*.cpz（*.ps3）',
 archives:{name:/\.cpz$/i,magic:'CPZ',list:f=>{const l=list(f);return l&&l.some(e=>PS.test(e.name))?l:null;},read,entry:PS},
 loose:{name:PS,subs:['','script','patch']},parse,
 extra:{unsupported:dir=>cpz7(dir)?'CMVS_CPZ7':'',REASONS:{CMVS_CPZ7:'这部 CMVS 作品用的是 CPZ7 归档（密钥藏在 start.ps3 里，各作品不同），还没有实物验证过，暂时读不了剧本'}}});
module.exports={engine,parse,header,open,list,read,unpackPs2,pushed,md5Words,table,stage1,dirCipher,entryCipher,scheme,DEFAULT,rotl,rotr};
