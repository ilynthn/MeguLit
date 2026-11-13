// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: the detail card flips; its back shows a random CG this computer has already unlocked). The unlock
   state comes only from the game's own saves (user's choice), never from guessing: an engine reader finds the CGs the
   save records and reads those images from the game's own files. Engines without a reader yet return supported:false
   and the card shows its plain back.
   KiriKiri: the system save (savedata/datasu.ksd) keeps every image the game has shown, as "cg_<FILE>" => 1 (KAG and
   Yuzusoft) or as the bare name. Saved as UTF-16 text, its simple bit-swap obfuscation (mode 1) or zlib (mode 2). The
   images are loose files or entries of plain (or cx-filtered) .xp3 archives; only browser-readable formats are used. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const IMG=/\.(?:png|jpe?g|webp|bmp|tlg)$/i;
const CGISH=/(?:^|[\\/_])(?:ev|cg|event|evcg|ecg)[\w-]*|^e\d/i;

function ksdText(buf){
 if(!buf||buf.length<4)return '';
 if(buf[0]===0xfe&&buf[1]===0xfe){const mode=buf[2];
  if(mode===2){const at=buf.indexOf(Buffer.from([0x78]),5);for(let i=at;i>=0&&i<Math.min(buf.length,64);i=buf.indexOf(Buffer.from([0x78]),i+1)){try{return zlib.inflateSync(buf.subarray(i)).toString('utf16le');}catch{}}return '';}
  if(mode===1){const body=buf.subarray(5),out=Buffer.alloc(body.length&~1);for(let i=0;i+1<body.length;i+=2){const c=body.readUInt16LE(i);out.writeUInt16LE(((c&0xaaaa)>>1)|((c&0x5555)<<1),i);}return out.toString('utf16le');}
  return '';}
 if(buf[0]===0xff&&buf[1]===0xfe)return buf.subarray(2).toString('utf16le');
 return buf.toString('utf16le');
}
const base=name=>path.basename(String(name).replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase();

function kirikiriSaves(dir){
 const out=[];let list=[];try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of list)if(e.isDirectory()&&/^save/i.test(e.name)){const f=path.join(dir,e.name,'datasu.ksd');if(fs.existsSync(f))out.push(f);}
 return out;
}
function tokens(text){const set=new Set();
 for(const m of text.matchAll(/"cg_([^"]+?)"\s*=>/g))set.add(base(m[1]));
 for(const m of text.matchAll(/"([A-Za-z0-9_\-]{3,64})(?:\.(?:png|jpe?g|tlg|bmp|webp))?"/gi))set.add(m[1].toLowerCase());
 return set;}
function looseImages(dir,depth=3,out=[]){let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of list){const p=path.join(dir,e.name);if(e.isDirectory()){if(depth>0&&!/^(?:save|savedata|movie|bgm|voice|sound|se)$/i.test(e.name)&&!/全cg/i.test(e.name))looseImages(p,depth-1,out);}else if(IMG.test(e.name))out.push(p);}return out;}

/* KiriKiri Z binary saves and data ("KBAD100"): MessagePack with little-endian counts and UTF-16 strings whose
   lengths count code units; 0xC1 is TJS void. */
function kbad(buf){
 if(buf.length<8||buf.toString('latin1',0,7)!=='KBAD100')return undefined;let p=8;
 const str=n=>{const s=buf.toString('utf16le',p,p+n*2);p+=n*2;return s;};
 function v(){if(p>=buf.length)throw Error('EOF');const t=buf[p++];
  if(t<0x80)return t;if(t>=0xe0)return t-256;
  if(t>=0x80&&t<=0x8f)return map(t&15);if(t>=0x90&&t<=0x9f)return arr(t&15);if(t>=0xa0&&t<=0xbf)return str(t&31);
  switch(t){case 0xc0:case 0xc1:return null;case 0xc2:return false;case 0xc3:return true;
   case 0xc4:case 0xd9:{const n=buf[p];p+=1;return str(n);}case 0xc5:case 0xda:{const n=buf.readUInt16LE(p);p+=2;return str(n);}case 0xc6:case 0xdb:{const n=buf.readUInt32LE(p);p+=4;return str(n);}
   case 0xca:p+=4;return buf.readFloatLE(p-4);case 0xcb:p+=8;return buf.readDoubleLE(p-8);
   case 0xcc:return buf[p++];case 0xcd:p+=2;return buf.readUInt16LE(p-2);case 0xce:p+=4;return buf.readUInt32LE(p-4);case 0xcf:p+=8;return Number(buf.readBigUInt64LE(p-8));
   case 0xd0:return buf.readInt8(p++);case 0xd1:p+=2;return buf.readInt16LE(p-2);case 0xd2:p+=4;return buf.readInt32LE(p-4);case 0xd3:p+=8;return Number(buf.readBigInt64LE(p-8));
   case 0xdc:{const n=buf.readUInt16LE(p);p+=2;return arr(n);}case 0xdd:{const n=buf.readUInt32LE(p);p+=4;return arr(n);}
   case 0xde:{const n=buf.readUInt16LE(p);p+=2;return map(n);}case 0xdf:{const n=buf.readUInt32LE(p);p+=4;return map(n);}
   case 0xc7:{const n=buf[p];p+=2+n;return {ext:true};}case 0xc8:{const n=buf.readUInt16LE(p);p+=3+n;return {ext:true};}case 0xc9:{const n=buf.readUInt32LE(p);p+=5+n;return {ext:true};}
  }
  throw Error('TAG_'+t.toString(16)+'@'+(p-1));}
 function arr(n){const a=[];for(let i=0;i<n;i++)a.push(v());return a;}
 function map(n){const m={};for(let i=0;i<n;i++){const k=v();m[k]=v();}return m;}
 const out=v();return {value:out,end:p,len:buf.length};}
const kbadValue=buf=>{try{return kbad(buf)?.value;}catch{return undefined;}};
function kirikiriSeen(buf){
 const v=kbadValue(buf);
 if(v&&typeof v==='object'){const out=new Set();for(const k of Object.keys(v)){const m=/^cg_(.+)$/i.exec(k);if(m)out.add(base(m[1]));}return out;}
 return tokens(ksdText(buf));}
/* xp3 archives next to the exe and one folder down (女王蜂の王房: arc\*.xp3) */
function xp3Archives(dir){const out=[];const add=d=>{try{for(const f of fs.readdirSync(d))if(/\.xp3$/i.test(f))out.push(path.join(d,f));}catch{}};add(dir);
 try{for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isDirectory()&&!/^(?:save|savedata|movie|bgm|voice|sound|se|plugin)$/i.test(e.name)&&!/全cg/i.test(e.name))add(path.join(dir,e.name));}catch{}
 return out;}
const PLAIN=/^(?:\x89PNG|\xff\xd8\xff|BM|TLG[056]\.0|RIFF|KBAD|TJS2|\xff\xfe|\xef\xbb\xbf|[\t\r\n\x20-\x7e]{12})/;
/* an archive whose entries carry the "encrypted" flag but whose bytes are plain (some KiriKiri 2 releases): the first
   few flagged pictures, scripts or tables must all start like what they are */
function plainDespiteFlag(xp3,file,list){const probe=list.filter(e=>e.encrypted&&/\.(?:png|jpe?g|tlg|bmp|tjs|ks|csv)$/i.test(e.name)).slice(0,3);if(!probe.length)return false;
 try{return probe.every(e=>PLAIN.test(xp3.read(file,e,null).toString('latin1',0,12)));}catch{return false;}}
/* pictures the game itself read for MeguLit (voice-cold.cjs 'kirikiri-cg', the capture DLL): <capture>\cg */
function kirikiriCapture(dir){try{const d=path.join(require('./original-engines/scenes.cjs').ENGINES['kirikiri-dump'].captureDir(dir),'cg');return fs.existsSync(d)?[d]:[];}catch{return [];}}
const CGNAME=/^(?:ev|cg|e\d)/i;
function kirikiri(dir){
 const saves=kirikiriSaves(dir);if(!saves.length)return null;
 const seen=new Set();for(const f of saves){try{for(const t of kirikiriSeen(fs.readFileSync(f)))seen.add(t);}catch{}}
 const items=new Map(),add=(b,item)=>{if(!items.has(b))items.set(b,{...item,decode:/\.tlg$/i.test(item.file||item.entry.name)?'tlg':undefined});};
 for(const p of looseImages(dir)){const rel=path.relative(dir,p);if(!CGISH.test(rel))continue;const b=base(p);if(seen.has(b))add(b,{name:b,file:p});}
 for(const d of kirikiriCapture(dir))try{for(const f of fs.readdirSync(d))if(IMG.test(f)){const b=base(f);if(seen.has(b))add(b,{name:b,file:path.join(d,f)});}}catch{}
 const xp3=require('./original-engines/xp3.cjs'),gallery=new Set();let closed=false;
 for(const file of xp3Archives(dir)){let list;try{list=xp3.list(file)?.files||[];}catch{continue;}const a=path.basename(file);
  let cx=null;if(list.some(e=>e.encrypted)){try{cx=require('./original-engines/cx-filter.cjs').forArchive(file);}catch{}if(!cx&&!plainDespiteFlag(xp3,file,list)){closed=true;continue;}}
  for(const e of list){
   if(/cg/i.test(e.name)&&/\.(?:tjs|csv)$/i.test(e.name)&&(e.size||0)<1<<20){try{const v=kbadValue(xp3.read(file,e,cx));if(Array.isArray(v))for(const x of v)for(const ev of (x&&Array.isArray(x.events)?x.events:[]))if(typeof ev==='string')gallery.add(base(ev));}catch{}}
   if(!IMG.test(e.name))continue;const b=base(e.name);if(!seen.has(b)||items.has(b))continue;if(!CGISH.test(a+'/'+e.name))continue;add(b,{name:b,archive:file,entry:e,cx});}}
 if(gallery.size)for(const k of [...items.keys()])if(!gallery.has(k))items.delete(k);
 /* seen CGs no archive MeguLit can open holds: the game reads them itself (list() hands them to the cold run) */
 const wanted=closed?[...seen].filter(b=>!items.has(b)&&(gallery.size?gallery.has(b):CGNAME.test(b))):[];
 return {engine:'KiriKiri',supported:true,items,total:gallery.size,wanted};
}

/* ---- HuneX (魔法使いの夜 Steam): the global save <Title>.gdb is "SDC FORMAT 1.00": u32 seed, u32 packed size, u32 size,
   u16 byte sum and u16 byte xor of the packed bytes, then from 0x20 the packed bytes, each minus the high byte of the
   next Borland LCG state (s = s*0x15A4E35+1); unpacked with a small LZ (byte < 0x80: that many+1 literals; else length
   ((b>>3)&15)+2, distance ((b&7)<<8 | next)+2). Inside: a 0x80-byte header and blocks, one of them the set of every
   image the game has shown ("img0408.mzp"...): u32 count, then NUL-terminated names. The exe keeps the gallery's
   image list in .rdata ("IMG0408.MZP" in 16-byte slots); a seen image counts as a CG only if the gallery lists it.
   Images are MZP ("mrgd00") entries of the game's .hfa archives, decoded to PNG (services/cg-decoders). */
function sdcUnpack(b){
 if(b.length<32||b.toString('latin1',0,15)!=='SDC FORMAT 1.00')return null;
 let s=b.readUInt32LE(16)>>>0;const n=b.readUInt32LE(20),size=b.readUInt32LE(24);if(32+n>b.length||size>64<<20)return null;
 const e=Buffer.alloc(n);let sum=0,xor=0;for(let i=0;i<n;i++){const c=b[32+i];sum=(sum+c)&0xffff;xor^=c;s=(Math.imul(s,0x15a4e35)+1)>>>0;e[i]=(c-((s>>>16)&0xff))&0xff;}
 if(sum!==b.readUInt16LE(28)||xor!==b.readUInt16LE(30))return null;
 const o=Buffer.alloc(size);let p=0,q=0;
 while(p<n&&q<size){const c=e[p];if(c&0x80){const len=((c>>3)&15)+2,dist=((c&7)<<8)+e[p+1]+2;if(dist>q)return null;for(let k=0;k<len&&q<size;k++,q++)o[q]=o[q-dist];p+=2;}else{p++;for(let k=0;k<=c&&q<size;k++)o[q++]=e[p++];}}
 return o;}
/* every run of "<name>.mzp\0" strings that a u32 count of exactly that many introduces */
function mzpNameSets(buf){const out=new Set(),t=buf.toString('latin1');const re=/(?:[\w-]{1,60}\.mzp\0)+/gi;let m;
 while((m=re.exec(t))){const at=m.index;if(at<4)continue;const names=m[0].split('\0').filter(Boolean);if(buf.readUInt32LE(at-4)!==names.length)continue;for(const n of names)out.add(base(n));}
 return out;}
function hunexGallery(exe){let d;try{d=fs.readFileSync(exe);}catch{return null;}const t=d.toString('latin1'),out=new Set();
 for(const m of t.matchAll(/(?:[A-Z0-9_]{1,15}\.MZP\0+){20,}/g))for(const n of m[0].split(/\0+/))if(n)out.add(base(n));
 return out.size?out:null;}
function hunexSaves(dir){let l=[];try{l=fs.readdirSync(dir).filter(f=>/\.gdb$/i.test(f));}catch{}return l.map(f=>path.join(dir,f));}
function hunex(dir,exe){
 const saves=hunexSaves(dir);if(!saves.length)return null;let hfa=[];try{hfa=fs.readdirSync(dir).filter(f=>/\.hfa$/i.test(f)).sort();}catch{}if(!hfa.length)return null;
 const seen=new Set();let ok=false;for(const f of saves){try{const raw=sdcUnpack(fs.readFileSync(f));if(raw){ok=true;for(const n of mzpNameSets(raw))seen.add(n);}}catch{}}
 if(!ok)return null;
 let gallery=hunexGallery(exe);if(!gallery){let l=[];try{l=fs.readdirSync(dir).filter(f=>/\.exe$/i.test(f));}catch{}for(const f of l){gallery=hunexGallery(path.join(dir,f));if(gallery)break;}}
 const {hfaList}=require('./original-engines/hunex.cjs'),items=new Map();
 for(const a of hfa){const file=path.join(dir,a);let list;try{list=hfaList(file)||[];}catch{continue;}
  for(const e of list){if(!/\.mzp$/i.test(e.name))continue;const b=base(e.name);if(!seen.has(b)||items.has(b)||(gallery&&!gallery.has(b)))continue;items.set(b,{name:b,archive:file,entry:e,decode:'mzp'});}}
 return {engine:'HuneX',supported:true,items,total:gallery?gallery.size:0};
}

/* ---- Siglus (CLANNAD, Summer Pockets): dat/mode.cgm ("CGTABLE2") is the gallery: after a 0x20 head, bytes XORed
   with a 256-byte table the engine keeps (the same in every Siglus exe seen), then Siglus LZSS; 0x3C-byte records of
   a 32-byte g00 name and the record's flag number. savedata_*global.sav (u32 version, u32, u32 size, then the same
   XOR + LZSS) holds the global tables as {u32 next offset, u32 count, count u32 values}; the CG table is the one
   long enough for every flag number whose set entries are all gallery flags. Images: g00/<name>.g00. */
const SIGLUS_KEY=Buffer.from('8be55dc3a1e030440085c074095f5e33c05b8be55dc38b450c85c075148b55ec83c220526a00e8f528010083c40889450c8b45e46a006a005053ff1534b143008b451085c074058b4dec89088a45f084c07578a1e03044008b7de88b750c85c075448b1dd0b0430085ff763781ff000004006a0076438b45f88d55fc5268000004005650ff152cb143006a05ffd3a1e030440081ef0000040081c60000040085c074c58b5df853e8f4fbffff8b450c83c4045f5e5b8be55dc38b55f88d4dfc51575652ff152cb14300ebd88b45e883c020506a00e8472801008b7de88945f48bf0a1e030440083c40885c075568b1dd0b0430085ff764981ff000004006a0076','hex');
const unxor=(b,from)=>{const o=Buffer.from(b.subarray(from));for(let i=0;i<o.length;i++)o[i]^=SIGLUS_KEY[i&255];return o;};
function siglusTable(buf){
 if(buf.length<0x28||!/^CGTABLE/.test(buf.toString('latin1',0,8)))return null;const {siglusLz}=require('./cg-decoders.cjs');
 let raw;try{raw=siglusLz(unxor(buf,0x20));}catch{try{raw=siglusLz(buf,0x20);}catch{return null;}}
 const out=new Map();for(let i=0;i+0x3c<=raw.length;i+=0x3c){const name=raw.toString('latin1',i,i+32).replace(/\0[\s\S]*$/,'').trim();if(name)out.set(name.toLowerCase(),raw.readInt32LE(i+32));}
 return out;}
function siglusGlobalTables(buf){
 if(buf.length<20)return [];let raw;try{raw=require('./cg-decoders.cjs').siglusLz(unxor(buf,12));}catch{return [];}
 const out=[];let p=8;
 while(p+8<=raw.length){const next=raw.readUInt32LE(p),n=raw.readUInt32LE(p+4);
  if(next<=p||next>raw.length){p+=4;continue;}
  if(next-p-8===n*4){const set=[];for(let i=0;i<n;i++)if(raw.readInt32LE(p+8+i*4))set.push(i);out.push({count:n,set});}
  p=next;}
 return out;}
function siglusSaves(dir){const out=[];let l=[];try{l=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of l)if(e.isDirectory()&&/^savedata/i.test(e.name)){const f=path.join(dir,e.name,'global.sav');if(fs.existsSync(f))out.push(f);}return out;}
function siglus(dir){
 const cgm=path.join(dir,'dat','mode.cgm');if(!fs.existsSync(cgm))return null;const table=siglusTable(fs.readFileSync(cgm));if(!table||!table.size)return null;
 const flags=new Set(table.values()),top=Math.max(...flags),on=new Set();
 for(const f of siglusSaves(dir)){let tabs;try{tabs=siglusGlobalTables(fs.readFileSync(f));}catch{continue;}
  const fit=tabs.filter(t=>t.count>top&&t.set.every(i=>flags.has(i))).sort((a,b)=>b.set.length-a.set.length)[0];if(fit)for(const i of fit.set)on.add(i);}
 const g00=path.join(dir,'g00'),files=new Map();try{for(const f of fs.readdirSync(g00))if(/\.g00$/i.test(f))files.set(base(f),path.join(g00,f));}catch{}
 const items=new Map();for(const [name,flag] of table){if(!on.has(flag))continue;const file=files.get(name);if(file&&!items.has(name))items.set(name,{name,file,decode:'g00'});}
 return {engine:'Siglus',supported:true,items,total:table.size};
}

/* ---- YU-RIS (euphoria, サイコロジック・ラブコメディ, 女装山脈): the gallery is the engine's stock "es" system. A
   script registers it with calls of es.CGMODE.CG.SET "<image>" (one per picture), THUMB.SET and DEF.SET (closing an
   entry); the flag array gives each entry one slot and then one per picture, from slot 1. The global save
   save/gsd.sd ("YSSD") keeps every global variable as a zlib section {u32 id, u32, u32 packed, u32 size}; an integer
   array is {u32 type 1, u32 dims, dims*u32, u32 bytes, int64 values}. The CG array is the one long enough for every
   slot whose set entries all fall on picture slots (never on an entry's own slot). Images: bmp/png in the ypf archives. */
function yssdArrays(buf){
 const out=[];if(buf.length<0x40||buf.toString('latin1',0,4)!=='YSSD')return out;const offs=new Set();
 for(let k=8;k+4<=0x40;k+=4){const o=buf.readUInt32LE(k);if(o>=0x40&&o+16<=buf.length)offs.add(o);}
 for(const o of offs){const packed=buf.readUInt32LE(o+8);if(o+16+packed>buf.length)continue;let d;try{d=zlib.inflateSync(buf.subarray(o+16,o+16+packed));}catch{continue;}
  if(d.length<16||d.readUInt32LE(0)!==1)continue;const dims=d.readUInt32LE(4);if(dims!==1)continue;const n=d.readUInt32LE(8),bytes=d.readUInt32LE(12);if(bytes!==n*8||16+bytes>d.length)continue;
  const set=[];for(let i=0;i<n;i++)if(d.readBigInt64LE(16+i*8))set.push(i);out.push({id:buf.readUInt32LE(o),count:n,set});}
 return out;}
function yurisArchives(dir){const out=[];for(const d of [dir,path.join(dir,'pac')]){let l=[];try{l=fs.readdirSync(d).filter(f=>/\.ypf$/i.test(f));}catch{}
  /* update*.ypf overrides the base archives, newest first */
  l.sort((a,b)=>(/^update/i.test(b)-/^update/i.test(a))||b.localeCompare(a,undefined,{numeric:true}));for(const f of l)out.push(path.join(d,f));}return out;}
const yurisMemo=new Map();
function yurisGallery(dir,archives){
 const key=archives.map(a=>{try{return a+fs.statSync(a).mtimeMs;}catch{return a;}}).join('|');if(yurisMemo.get(dir)?.key===key)return yurisMemo.get(dir).value;
 const y=require('./original-engines/yuris.cjs')._internal,dec=new TextDecoder('shift_jis');
 const str=a=>{const d=a.data;return d.length>=3&&d[0]===0x4d?dec.decode(d.subarray(3,3+d.readUInt16LE(1))).replace(/^"|"$/g,''):null;};
 let best=null;const done=new Set();
 for(const a of archives)for(const sc of y.ypfScenes(a)){const k=sc.name.toLowerCase();if(done.has(k))continue;done.add(k);let insts;try{insts=y.ystb(sc.read());}catch{continue;}if(!insts)continue;
  const calls=[];for(const x of insts){if(!x.args.length)continue;const n=str(x.args[0]);const m=n&&/^es\.CGMODE\.(CG|DEF)\.SET$/i.exec(n);if(m)calls.push(m[1].toUpperCase()==='CG'?(x.args[1]&&str(x.args[1])||''):null);}
  if(calls.length&&(!best||calls.length>best.length))best=calls;}
 const value=best?esSlots(best):null;
 yurisMemo.delete(dir);yurisMemo.set(dir,{key,value});if(yurisMemo.size>8)yurisMemo.delete(yurisMemo.keys().next().value);return value;}
/* calls in order: a picture name for CG.SET, null for DEF.SET (which closes the entry): the entry's slot, then its pictures */
function esSlots(calls){const slots=new Map(),heads=new Set();let slot=1,pending=[];for(const c of calls){if(c!==null){pending.push(c);continue;}heads.add(slot++);for(const p of pending)slots.set(slot++,p);pending=[];}return {slots,heads,size:slot};}
function yurisSaves(dir){const out=[];let l=[];try{l=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of l)if(e.isDirectory()&&/^save/i.test(e.name)){const f=path.join(dir,e.name,'gsd.sd');if(fs.existsSync(f))out.push(f);}return out;}
function yuris(dir){
 const saves=yurisSaves(dir);if(!saves.length)return null;const archives=yurisArchives(dir);if(!archives.length)return null;
 const g=yurisGallery(dir,archives);if(!g||!g.slots.size)return null;const on=new Set();
 for(const f of saves){let arrays;try{arrays=yssdArrays(fs.readFileSync(f));}catch{continue;}
  const fit=arrays.filter(a=>a.count>=g.size&&a.set.every(i=>g.slots.has(i))).sort((a,b)=>b.set.length-a.set.length)[0];if(fit)for(const i of fit.set)on.add(base(g.slots.get(i)));}
 const names=new Set([...g.slots.values()].map(base)),items=new Map(),{ypfList}=require('./original-engines/yuris.cjs')._internal;
 for(const a of archives){let l;try{l=ypfList(a)||[];}catch{continue;}
  for(const e of l){if(!/\.(?:png|bmp|jpe?g)$/i.test(e.name))continue;const b=base(e.name);if(!on.has(b)||items.has(b))continue;items.set(b,{name:b,archive:a,entry:e});}}
 return {engine:'YU-RIS',supported:true,items,total:names.size};
}

const READERS=[{read:kirikiri,saves:dir=>[...kirikiriSaves(dir),...kirikiriCapture(dir)]},{read:hunex,saves:hunexSaves},{read:siglus,saves:siglusSaves},{read:yuris,saves:yurisSaves}];
const cache=new Map();
function stamp(dir){let s='';for(const r of READERS)for(const f of r.saves(dir)){try{s+=f+fs.statSync(f).mtimeMs;}catch{}}return s;}
function scan(executable){
 const dir=path.dirname(String(executable||''));if(!dir||!fs.existsSync(dir))return {supported:false,items:new Map()};
 const key=dir.toLowerCase(),st=stamp(dir),hit=cache.get(key);if(hit&&hit.stamp===st)return hit.result;
 let result={supported:false,items:new Map()};for(const r of READERS){try{const got=r.read(dir,String(executable));if(got){result=got;break;}}catch{}}
 cache.delete(key);cache.set(key,{stamp:st,result});if(cache.size>8)cache.delete(cache.keys().next().value);return result;
}
const cacheDirOf=(root,executable)=>path.join(root,'data','cg-cache',crypto.createHash('sha1').update(path.dirname(String(executable)).toLowerCase()).digest('hex').slice(0,16));
/* opts: root; cold (the cold-run setting: the game may be started in the background to read CGs only it can open);
   safe (the R18 filter: only CGs the local rating model called safe, the rest rated in the background, cg-rating.cjs) */
function list(executable,opts={}){
 const r=scan(executable),{root}=opts;let items=[...r.items.keys()],pending=0;
 if(root&&opts.cold&&r.wanted?.length){try{const dir=path.dirname(String(executable));require('./voice-cold.cjs').consider(root,{executable:String(executable),dir,engine:'kirikiri-cg'},r.wanted,{enabled:true});}catch{}}
 if(root&&opts.safe&&items.length){const rating=require('./cg-rating.cjs'),cacheDir=cacheDirOf(root,executable),known=rating.ratings(cacheDir),todo=items.filter(n=>!known[n]);
  pending=todo.length;if(todo.length)rating.rateLater(root,cacheDir,todo,name=>pictureFile(root,executable,name));items=items.filter(n=>rating.isSafe(known[n]));}
 return {supported:!!r.supported,engine:r.engine||'',total:r.total||0,items,pending,safe:!!opts.safe};}
function mimeOf(b){if(b.length<12)return null;if(b[0]===0x89&&b.toString('latin1',1,4)==='PNG')return 'image/png';if(b[0]===0xff&&b[1]===0xd8)return 'image/jpeg';
 if(b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP')return 'image/webp';if(b[0]===0x42&&b[1]===0x4d)return 'image/bmp';return null;}
/* the raw bytes of an item, engine formats decoded to PNG */
function bytesOf(it){
 const dec=require('./cg-decoders.cjs');
 let buf;if(it.file)buf=fs.readFileSync(it.file);
 else if(/\.hfa$/i.test(it.archive))buf=require('./original-engines/hunex.cjs').hfaRead(it.archive,it.entry);
 else if(/\.ypf$/i.test(it.archive)){const y=require('./original-engines/yuris.cjs')._internal;buf=y.ypfRead?y.ypfRead(it.archive,it.entry):null;}
 else buf=require('./original-engines/xp3.cjs').read(it.archive,it.entry,it.cx||null);
 if(it.decode&&dec[it.decode])return dec.png(dec.fit(dec[it.decode](buf)));
 return buf;}
const EXT={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/bmp':'.bmp'};
/* the CG as a browser picture in the card back's cache (read and decoded once) */
function pictureFile(root,executable,name){
 const r=scan(executable),it=r.items.get(String(name||'').toLowerCase());if(!it)throw Error('CG_NOT_FOUND');
 const dir=cacheDirOf(root,executable);
 for(const ext of Object.values(EXT)){const f=path.join(dir,it.name+ext);if(fs.existsSync(f))return f;}
 const buf=bytesOf(it),mime=mimeOf(buf);if(!mime||buf.length>24<<20)throw Error('CG_UNREADABLE');
 const f=path.join(dir,it.name+EXT[mime]);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(f,buf);return f;}
function image(root,executable,name,opts={}){
 if(opts.safe&&!require('./cg-rating.cjs').isSafe(require('./cg-rating.cjs').ratings(cacheDirOf(root,executable))[String(name||'').toLowerCase()]))throw Error('CG_HIDDEN');
 const b=fs.readFileSync(pictureFile(root,executable,name));return {mime:mimeOf(b),data:b.toString('base64')};
}
/* 2026-11-13 card wall (no spoilers): only explicit unlock marks of the KiriKiri system saves ("cg_<FILE>" set to a
   true value), never bare names that merely appear in the save; null when there is no KiriKiri save */
function kirikiriMarked(executable){const dir=path.dirname(String(executable||''));const saves=kirikiriSaves(dir);if(!saves.length)return null;const out=new Set();
 for(const f of saves){try{const buf=fs.readFileSync(f),v=kbadValue(buf);
  if(v&&typeof v==='object'){for(const k of Object.keys(v)){const m=/^cg_(.+)$/i.exec(k);if(m&&v[k])out.add(base(m[1]));}}
  else for(const m of ksdText(buf).matchAll(/"cg_([^"]+?)"\s*=>\s*(?:\(int\)\s*)?(?:[1-9]\d*|true)/gi))out.add(base(m[1]));}catch{}}
 return out;}
const cachedPicture=(root,executable,name)=>{const d=cacheDirOf(root,executable);for(const ext of Object.values(EXT)){const f=path.join(d,String(name).toLowerCase()+ext);if(fs.existsSync(f))return f;}return null;};
module.exports={list,image,scan,pictureFile,kirikiriMarked,cachedPicture,ksdText,tokens,kbad,esSlots,sdcUnpack,mzpNameSets,yssdArrays,siglusTable,siglusGlobalTables,SIGLUS_KEY};
