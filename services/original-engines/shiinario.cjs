// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E579 ShiinaRio / 椎名里緒 (Stage-nana's engine: Eushully until ~2010, GRAND†CROSS, Akatsuki Works, Hime Taiyou …;
   VNDB ~301 company releases). Format references (read, not copied): GARbro ArcFormats/ShiinaRio/ArcWARC.cs (morkt,
   MIT) for WARC and its YH1 / YPK / YLZ entries; OpenShiina docs/engine-notes.md (kagaminehaku, GPL-3.0) for the
   archive roles and the scenario grammar.
     *.war   "WARC 1.x"; u32 at 8 XOR 0xF182AD82 = index offset. Index entries {name[16 in 1.1, 32 later], u32 offset,
             u32 size, u32 unpacked, i64 file time, u32 flags}. An entry starts with a tag ("YH1" static Huffman, dword
             bits high first; "YPK" zlib; "YLZ" the engine's LZ) and the unpacked size; byte 3 set = the body is XOR'd
             with "KM" / "KMKM". 1.1 has no keys. From 1.2 on, the index and entries are encrypted with keys of the
             title (CryptKey, HelperKey, Region, DecodeBin, a ShiinaImage, often an ExtraCrypt). E602: those are read
             here too (shiinario-crypt.cjs: GARbro's Decoder ported, checked byte for byte against ArcFormats.dll; the
             keys of its 127 titles in shiinario-schemes.json, newer titles from adapter packs, params target
             "warc-scheme"). The title is found the way GARbro and OpenShiina do (a game-map .exe beside the archive,
             the archive's name), else by trying every scheme: the index has to decrypt to a consistent table (1.2–1.6
             Kogado range code, 1.7 zlib) and the zlib entries have to inflate. An archive no scheme opens still goes
             to GARbro's runtime pack, which extracts the scenario text.
     *_T.WAR the scenario: Shift-JIS .TXT, one message per non-empty line: "$NAME,args" commands, "【name】" speakers,
             ";" comments. (*_S.WAR holds the compiled engine scripts .SCN, which carry no story text.)
   Lines are the scenario messages in file order, so a translated TXT pairs line by line. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),kit=require('./kit.cjs'),garbro=require('./garbro.cjs'),crypt=require('./shiinario-crypt.cjs');

/* ---- WARC --------------------------------------------------------------------------------------------------------- */
/* {version (110 …170), indexOffset} or null */
function header(file){const h=kit.head(file,12);if(h.length<12||h.toString('latin1',0,4)!=='WARC'||h.toString('latin1',4,7)!==' 1.')return null;const d=h[7]-0x30;if(d<0||d>7)return null;
 const indexOffset=(h.readUInt32LE(8)^0xf182ad82)>>>0;return indexOffset<kit.size(file)?{version:100+d*10,indexOffset}:null;}
/* the entries of a WARC 1.1 archive (no keys), or null */
function list(file){const h=header(file);if(!h||h.version!==110)return null;const size=kit.size(file),nameSize=16,step=nameSize+24;
 const idx=kit.readAt(file,h.indexOffset,Math.min(step*8192,size-h.indexOffset)),out=[],seen=new Set();
 for(let p=0;p+step<=idx.length;p+=step){const z=idx.indexOf(0,p),name=kit.SJIS.decode(idx.subarray(p,z<0||z>p+nameSize?p+nameSize:z));
  const e={name,offset:idx.readUInt32LE(p+nameSize),size:idx.readUInt32LE(p+nameSize+4),unpacked:idx.readUInt32LE(p+nameSize+8),flags:idx.readUInt32LE(p+nameSize+20)};
  if(!name||idx[p]>=0x80)continue;if(e.offset+e.size>size)return null;if(!seen.has(name)){seen.add(name);out.push(e);}}
 return out.length?out:null;}
/* YLZ: the engine's LZ (bits from little-endian dwords, high first; literals and back references up to 64 KB back) */
function ylz(input,start,unpacked){const out=Buffer.alloc(unpacked);let src=start,ctl=0,mask=0,dst=0;
 const ctlBit=()=>{const b=(ctl&mask)!==0;mask>>>=1;if(!mask){ctl=input.readUInt32LE(src);src+=4;mask=0x80000000;}return b;};
 const bits=n=>{let v=0;for(let i=0;i<n;i++)v=(v<<1)|(ctlBit()?1:0);return v;};
 ctlBit();
 while(dst<unpacked){if(ctlBit()){out[dst++]=input[src++];continue;}const next=ctlBit();let offset=input[src++]|~0xffff,ah=0xff,count;
  if(next){if(ctlBit())ah=(ah<<1)|bits(1);else if(ctlBit()){ah=(ah<<1)|bits(1);offset-=0x200;}else if(ctlBit()){ah=(ah<<2)|bits(2);offset-=0x400;}else if(ctlBit()){ah=(ah<<3)|bits(3);offset-=0x800;}else{ah=(ah<<4)|bits(4);offset-=0x1000;}
   if(ctlBit())count=3;else if(ctlBit())count=4;else if(ctlBit())count=5+bits(1);else if(ctlBit())count=7+bits(2);else if(ctlBit())count=0x0b+bits(3);else count=0x13+input[src++];}
  else if(ctlBit()){ah=((ah<<3)|bits(3))-1&0xff;count=2;}
  else if((offset&0xff)===0xff)break;else count=2;
  offset+=(ah&0xff)<<8;for(let k=0;k<count&&dst<unpacked;k++,dst++){const from=dst+offset;out[dst]=from>=0?out[from]:0;}}
 return out.subarray(0,dst);}
/* a YH1 / YPK / YLZ body unpacked (the "KM" XOR, byte 3 set, undone first), as GARbro's opener */
const TAGS={0x314859:'YH1',0x4b5059:'YPK',0x5a4c59:'YLZ'};
function unpackTagged(b,tag,unpacked){const x=Buffer.from(b),keyed=b[3]!==0;
 const xorDwords=key=>{let i=8;for(;i+4<=x.length;i+=4)x.writeUInt32LE((x.readUInt32LE(i)^key)>>>0,i);return i;};
 if(tag==='YH1'){if(keyed)xorDwords((0x6393528e^0x4b4d)>>>0);return kit.huffman(x.subarray(8),unpacked,{order:'dword-msb'});}
 if(tag==='YPK'){if(keyed){const k=(~0x4b4d4b4d)>>>0;for(let i=xorDwords(k);i<x.length;i++)x[i]^=k&255;}return kit.inflate(x.subarray(8));}
 if(tag==='YLZ'){if(keyed){let k=0x4b4d4b4d;for(let i=xorDwords(k);i<x.length;i++){x[i]^=k&255;k>>>=8;}}return ylz(x,8,unpacked);}
 return b;}
/* an entry's bytes (WARC 1.1): the YH1 / YPK / YLZ body unpacked, anything else as stored */
function unpackEntry(b){if(b.length<=8)return b;const tag=b.toString('latin1',0,3);return TAGS[b.readUInt32LE(0)&0xffffff]===tag?unpackTagged(b,tag,b.readUInt32LE(4)):b;}
/* a keyed entry (WARC 1.2+), GARbro's WarOpener.OpenEntry step by step: the tag is XOR'd with the unpacked size; the
   packed bytes are decrypted (flag 0x80000000), the ExtraCrypt's first half undone, DecodeBin applied (0x20000000);
   after unpacking DecodeBin again (0x40000000) and the ExtraCrypt's second half. A YPK that is not zlib once decrypted
   throws (GARbro: "Invalid decryption scheme"). */
function readKeyed(b,flags,dec){if(b.length<=8)return b;const data=Buffer.from(b),unpacked=data.readUInt32LE(4),sig=(data.readUInt32LE(0)^((unpacked^0x82ad82)&0xffffff))&0xffffff;
 if(flags&0x80000000)dec.decrypt(data,8,data.length-8);
 if(dec.extra)dec.extra.decrypt(data,8,data.length-8,0x202);
 if(flags&0x20000000)dec.decrypt2(data,8,data.length-8);
 const tag=TAGS[sig];if(!tag)return data;if(tag==='YPK'&&data[8]!==0x78)throw new Error('YPK: not zlib, wrong scheme');
 let out=unpackTagged(data,tag,unpacked);if(out.length!==unpacked){const full=Buffer.alloc(unpacked);out.copy(full,0,0,Math.min(out.length,unpacked));out=full;}
 if(flags&0x40000000)dec.decrypt2(out,0,out.length);
 if(dec.extra)dec.extra.decrypt(out,0,out.length,0x204);
 return out;}
const read=(file,e)=>e.dec?readKeyed(kit.readAt(file,e.offset,e.size),e.flags,e.dec):unpackEntry(kit.readAt(file,e.offset,e.size));

/* ---- keyed WARC (1.2–1.7) ------------------------------------------------------------------------------------------ */
let catalog=null;
function packSchemes(){try{return require('../adapter-packs.cjs').params('warc-scheme');}catch{return [];}}
/* the schemes: adapter packs first (a newer title, or a fix of a shipped one), then shiinario-schemes.json; a pack's
   scheme may name the shipped SharedData / CommonImages ("@Region1", Common "Image2") and list its .exe names */
function schemes(){const extra=packSchemes();if(catalog&&catalog.extra===extra)return catalog;let json={};try{json=require('./shiinario-schemes.json');}catch{}
 const values=extra.map(p=>p&&p.value).filter(v=>v&&typeof v==='object'),packed=crypt.loadSchemes({...json,schemes:[]},values),base=crypt.loadSchemes(json);
 const names=new Set(packed.schemes.map(x=>x.name)),list=[...packed.schemes,...base.schemes.filter(x=>!names.has(x.name))],gameMap={...base.gameMap};
 for(const v of values)for(const exe of [].concat(v.GameMap||[]))if(typeof exe==='string'&&exe.length<128)gameMap[exe]=String(v.Name);
 catalog={extra,list,byName:new Map(list.map(x=>[x.name,x])),gameMap,errors:[...base.errors,...packed.errors]};return catalog;}
/* the schemes to try for an archive, most likely first: a game-map .exe (or archive name) in its folder, the archive's
   name containing an .exe's stem or a scheme's name; then all the others. known = how many came from those hints */
function candidates(file){const cat=schemes(),base=path.basename(file).toLowerCase(),stem=base.replace(/\.[^.]*$/,'');let here=new Set();
 try{here=new Set(fs.readdirSync(path.dirname(file)).map(n=>n.toLowerCase()));}catch{}
 const list=[],seen=new Set(),add=s=>{if(s&&!seen.has(s.name)){seen.add(s.name);list.push(s);}};
 for(const [k,title] of Object.entries(cat.gameMap)){const lk=k.toLowerCase();if(lk===base||!/\.war$/.test(lk)&&here.has(lk))add(cat.byName.get(title));}
 for(const [k,title] of Object.entries(cat.gameMap)){const ks=k.toLowerCase().replace(/\.[^.]*$/,'');if(ks.length>=3&&stem.includes(ks))add(cat.byName.get(title));}
 for(const s of cat.list)if(s.name.length>=3&&stem.includes(s.name.toLowerCase()))add(s);
 const known=list.length;for(const s of cat.list)add(s);return {list,known};}
/* the index table under one scheme's index keys, or null: 1.7 zlib after 8 bytes, 1.2–1.6 range code; a record whose
   data lies past the end of the file means the keys are wrong (GARbro: CheckPlacement) */
function indexOf(file,h,dec){const size=kit.size(file),max=dec.maxIndexLength,length=Math.min(max,size-h.indexOffset);if(length<8)return null;
 const buf=Buffer.alloc(max);kit.readAt(file,h.indexOffset,length).copy(buf);dec.decryptIndex(h.indexOffset,buf);
 let idx;if(h.version>=170){if(buf[8]!==0x78)return null;try{idx=zlib.inflateSync(buf.subarray(8,length),{finishFlush:zlib.constants.Z_SYNC_FLUSH,maxOutputLength:max});}catch{return null;}}
 else{idx=crypt.rangeDecode(buf,length,max);if(!idx||!idx.length)return null;}
 const step=dec.nameSize+24,out=[],seen=new Set(),sj=kit.SJIS;
 for(let p=0;p+step<=idx.length;p+=step){const z=idx.indexOf(0,p),name=sj.decode(idx.subarray(p,z<0||z>=p+dec.nameSize?p+dec.nameSize:z)),q=p+dec.nameSize;
  const e={name,offset:idx.readUInt32LE(q),size:idx.readUInt32LE(q+4),unpacked:idx.readUInt32LE(q+8),flags:idx.readUInt32LE(q+20)};
  if(e.offset+e.size>size)return null;if(name&&idx[p]<0x80&&!seen.has(name)){seen.add(name);out.push(e);}}
 return out.length?out:null;}
/* how well a scheme reads an archive's entries: zlib bodies have to inflate whole (their Adler-32 covers every byte the
   cipher touched), a .TXT has to come out as text (almost no control bytes; any codepage, a GBK patch too) */
const textLike=b=>{const n=Math.min(b.length,4096);let ctl=0;for(let i=0;i<n;i++){const c=b[i];if(c<0x09||c>0x0d&&c<0x20)ctl++;}return n>0&&ctl*100<=n;};
function score(file,entries){let pass=0,fail=0;
 const tagOf=e=>{if(e.size<=8)return null;const h=kit.readAt(file,e.offset,8);return TAGS[(h.readUInt32LE(0)^((h.readUInt32LE(4)^0x82ad82)&0xffffff))&0xffffff]||null;};
 const ypk=[],txt=[];for(const e of entries){if(e.size>(4<<20))continue;const t=tagOf(e);if(t==='YPK')ypk.push(e);else if(t&&/\.txt$/i.test(e.name))txt.push(e);}
 const pick=l=>l.sort((a,b)=>a.size-b.size).slice(0,4);
 for(const e of pick(ypk)){try{read(file,e);pass++;}catch{fail++;}}
 for(const e of pick(txt)){try{if(textLike(read(file,e)))pass++;else fail++;}catch{fail++;}}
 return {pass,fail};}
const opened=new Map();
/* {version, scheme, entries (each with its decoder)} of a keyed WARC, or null when no scheme opens it */
function open(file){const h=header(file);if(!h||h.version<120)return null;let st;try{st=fs.statSync(file);}catch{return null;}
 const cat=schemes(),key=file+'|'+st.size+'|'+st.mtimeMs;const memo=opened.get(key);if(memo&&memo.cat===cat)return memo.res;
 const {list,known}=candidates(file),groups=new Map();let found=null,hinted=null;
 for(let i=0;i<list.length&&!found;i++){const s=list[i];let dec;try{dec=crypt.decoder(h.version,s);}catch{continue;}const g=s.cryptKey.toString('hex')+'|'+dec.maxIndexLength;
  if(!groups.has(g)){let entries=null;try{entries=indexOf(file,h,dec);}catch{}groups.set(g,entries);}
  const entries=groups.get(g);if(!entries)continue;const own=entries.map(e=>({...e,dec}));let r;try{r=score(file,own);}catch{continue;}
  if(r.pass&&!r.fail)found={version:h.version,scheme:s.name,entries:own};
  /* nothing to check the entries by: only a scheme the game map or the name points at is taken */
  else if(!r.pass&&!r.fail&&i<known&&!hinted)hinted={version:h.version,scheme:s.name,entries:own};}
 const res=found||hinted;if(opened.size>64)opened.clear();opened.set(key,{cat,res});return res;}

/* ---- scenario TXT ------------------------------------------------------------------------------------------------- */
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);if(!b.length)return {lines:[],anchors:[]};
 /* scenario text is mostly double-byte; a binary file (an .SCN, an image) is not */
 const ctl=b.subarray(0,4096).filter(c=>c<0x09||c>0x0d&&c<0x20).length;if(ctl>8)return {lines:[],anchors:[]};
 const text=kit.decoder([b]).decode(b);
 const r=kit.lineGrammar(text,{comment:/^;/,anchor:/^\$/,name:/^【([^】]+)】$/,strip:[],blocks:[]});
 return r.lines.some(kit.hasKana)||r.lines.some(l=>/[㐀-鿿]/.test(l))?r:{lines:[],anchors:r.anchors};}

/* ---- the game folder ---------------------------------------------------------------------------------------------- */
const wars=dir=>kit.files(dir,{name:/\.war$/i,magic:'WARC'}).filter(f=>header(f));
/* the scenario archives: *_T.WAR (and names like scenario / script / txt), else every keyed one; opened here, or by
   GARbro's runtime pack when no scheme here opens them */
const SCENARIO=/(_t|scenario|script|scr|txt|text)\.war$/i;
function scenes(dir){const out=new Map(),all=wars(dir),keyed=[];
 const add=(a,e)=>{if(/\.txt$/i.test(e.name))out.set(e.name.toLowerCase(),{name:path.basename(a)+'/'+e.name,read:()=>read(a,e)});};
 for(const a of all){const l=list(a);if(l){for(const e of l)add(a,e);}else keyed.push(a);}
 const targets=keyed.filter(f=>SCENARIO.test(path.basename(f))),viaGarbro=[];
 for(const a of targets.length?targets:keyed){let arc=null;try{arc=open(a);}catch{}if(arc){for(const e of arc.entries)add(a,e);}else viaGarbro.push(a);}
 for(const a of viaGarbro){let c;try{c=garbro.cacheDir(a);}catch{continue;}const info=garbro.readJson(path.join(c,'done.json'));
  if(info){for(const rel of info.files)if(/\.txt$/i.test(rel))out.set(rel.toLowerCase(),{name:path.basename(a)+'/'+rel.replace(/\\/g,'/'),read:()=>fs.readFileSync(path.join(c,rel))});continue;}
  if(garbro.readJson(path.join(c,'failed.json'))?.version===garbro.version())continue;
  try{garbro.schedule(a);}catch{}}
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));}
const engine={id:'shiinario',hint:'*_T.WAR（*.TXT）',scenes,archives:scenes,sources:wars,parse:b=>{try{return parse(b);}catch{return {lines:[],anchors:[]};}},test:()=>false};
module.exports={engine,parse,header,list,open,read,readKeyed,unpackEntry,ylz,schemes,candidates};
