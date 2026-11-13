// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E630–E639 F3 "game-maker binaries" (docs/engine-families.md 第二轮): engines built with a general-purpose maker whose
   text sits in one string pool, or in a zip / the maker's own pack beside a table, often appended to the runtime exe.
   One module, one reader per maker, all on the shared kit (peOverlay / scan / poolLines / textRuns / zipList …).
   Every reader returns the shown strings in pool or code order, so a patch that rewrites the same file pairs 1:1.

   gamemaker  E630 data.win / game.unx: IFF "FORM" chunks, STRG = u32 count + absolute pointers to {u32 length, UTF-8, NUL}
              (UndertaleModTool UndertaleData / UndertaleString, MIT, format facts); included files (txt / json / csv)
   director   E631 Macromedia / Adobe Director .dxr .dir .cxt .cst (RIFX / XFIR imap -> mmap) and Afterburner .dcr .cct
              (FGDM / FGDC: Fver, Fcdr, ABMP varint map, FGEI initial load segment, zlib), also movies inside a projector
              exe; text cast members are STXT {u32 12, u32 text length, u32 style length, text} (ScummVM director/archive.cpp,
              GPL-2.0-or-later, format facts)
   hsp        E632 Hot Soup Processor 3: start.ax "HSP3" header (pt_cs / max_cs / pt_ds / max_ds), the code segment is u16
              words (type & 0x0FFF, 0x8000 = 32-bit operand follows), TYPE_STRING (2) operands are data-segment offsets of
              C strings (OpenHSP hsp3struct.h, BSD); DPMX packs (exe overlay or data.dpm: 16-byte header, 32-byte entries
              {name[16], u32, u32 key, u32 offset, u32 size}); text files in the pack are read too. Keyed (encrypted) DPM
              entries are not decrypted (needs a real game)
   clickteam  E633 Clickteam Fusion / MMF2: the exe overlay holds "PAME" (ANSI) / "PAMU" (UTF-16) + chunk list {u16 id, u16
              flags, u32 size}; flag 1 = {u32 unpacked, u32 packed, zlib}; the frame chunk 0x3333 nests a chunk list; flags
              2 / 3 (encrypted, newer builds) are skipped. Generic text scan of every chunk in order (CTFAK, format facts)
   ags        E634 Adventure Game Studio: every compiled script "SCOM" {u32 version, u32 global data, u32 code (dwords), u32
              strings, …} in the exe's CLIB overlay, ac2game.dat / game28.dta and room .crm files: the strings section
              (NUL-separated literals). A Chinese .tra ("AGSTranslation\0", blocks {i32 id, i32 len} / {0, name[16], i64
              len}, -1 end; dictionary pairs XOR-subtracted with "Avis Durgan") pairs by source text (patchLines)
              (AGS Common/data/tra_file.cpp, data_helpers.cpp, script/cc_script.cpp, Artistic-2.0, format facts)
   srpg       E635 SRPG Studio data.dts "SDTS": u32 encrypted, project data from u32@20 + 168 to the end, RC4 with MD5 of
              the UTF-16 key "key" / "_dyn" (CryptoAPI RC4, keys "keyset" / "_dynamic" truncated to length() bytes);
              strings are {u32 byte length, UTF-16LE, NUL NUL} (HNIdesu/SRPGStudioReverseTools, Sinflower/SRPG-ToolBox MIT)
   java       E636 Java / libGDX: .jar (kit.zipList) text assets (.properties with \u escapes, json, csv, xml, txt) and the
              string literals of .class constant pools (CONSTANT_String -> Utf8); loose assets/ data/ text
   xna        E637 MonoGame / XNA / FNA: Content/*.xnb ("XNB" + platform + version + flags; 0x40 LZ4 block, 0x80 LZX is not
              decoded) -> 7-bit length-prefixed UTF-8 strings; the game's .NET assemblies' #US heap (UTF-16 literals)
   ohrrpgce   E638 OHRRPGCE .rpg lumped file (name NUL, u32 PDP-endian size); .say text boxes, 400-byte records of 8 × 38
              byte lines (OHRRPGCE wiki RPG format, GPL-2.0, format facts)
   rpgpaper   E638 RPG Paper Maker (RPM): Content/Datas/**.json, every string value in order */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const kit=require('./kit.cjs');
const EMPTY=Object.freeze({lines:[],anchors:[]});
const out=lines=>({lines,anchors:[]});
const safe=fn=>buf=>{try{return fn(Buffer.isBuffer(buf)?buf:Buffer.from(buf))||EMPTY;}catch{return EMPTY;}};
const stat=f=>{try{const s=fs.statSync(f);return s.size+':'+s.mtimeMs;}catch{return '';}};
const MAX=512<<20;
/* an engine from scenes(dir) -> [{name, read}] (archives = the same list, so a patch folder with the same files overlays) */
function reader({id,hint,list,parse,test,extra}){const scenes=dir=>{let l;try{l=list(dir);}catch{l=[];}return l.sort((a,b)=>a.name.localeCompare(b.name));};
 return {id,hint,scenes,archives:scenes,sources:dir=>[...new Set(scenes(dir).map(s=>s.file).filter(Boolean))],parse:safe(parse),test:test||(()=>false),...(extra||{})};}
const loose=(file,name)=>({name,file,read:()=>fs.readFileSync(file)});
const rel=(dir,f)=>path.relative(dir,f).replace(/\\/g,'/');

/* ---- the exe overlay: which maker's data is appended (one 1 MB look per exe, cached) ----------------------------- */
const KINDS=[['hsp','DPMX'],['clickteam','PAMU'],['clickteam','PAME'],['ags','CLIB\x1a'],['director','XFIR'],['director','RIFX']];
const kindCache=new Map();
function overlayKind(file){const key=file+'|'+stat(file);if(kindCache.has(key))return kindCache.get(key);let kind=null;
 const ov=kit.peOverlay(file);if(ov){const b=kit.readAt(file,ov.at,Math.min(ov.size,1<<20));let best=Infinity;
  for(const [k,m] of KINDS){const i=b.indexOf(m,0,'latin1');if(i>=0&&i<best){best=i;kind=k;}}
  /* AGS also marks the end of a CLIB-carrying exe */
  if(!kind&&kit.tail(file,16).toString('latin1').includes('SIGE'))kind='ags';}
 if(kindCache.size>2000)kindCache.clear();kindCache.set(key,kind);return kind;}
const exesOf=(dir,kind)=>kit.files(dir,{name:/\.exe$/i,max:16}).filter(f=>overlayKind(f)===kind);
const overlayRead=(file,from=0)=>{const ov=kit.peOverlay(file);if(!ov)return Buffer.alloc(0);return kit.readAt(file,ov.at+from,Math.min(ov.size-from,MAX));};

/* ---- shared text assets (included files, jar entries, Content, RPM) ---------------------------------------------- */
const TEXT_EXT=/\.(txt|json|csv|tsv|xml|properties|ini|yaml|yml|lang|po|ks|scn|dat\.txt)$/i;
function jsonStrings(v,acc){if(typeof v==='string')acc.push(v);else if(Array.isArray(v))for(const x of v)jsonStrings(x,acc);else if(v&&typeof v==='object')for(const k of Object.keys(v))jsonStrings(v[k],acc);return acc;}
const unescapeProps=s=>s.replace(/\\u([0-9a-fA-F]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\(.)/g,'$1');
/* Java constant pool: the Utf8 entries that CONSTANT_String entries name (string literals), in pool order */
function classStrings(b){if(b.length<10||b.readUInt32BE(0)!==0xcafebabe)return null;const n=b.readUInt16BE(8),utf=[],refs=[];let p=10;
 loop:for(let i=1;i<n&&p<b.length;i++){const tag=b[p++];switch(tag){
  case 1:{const l=b.readUInt16BE(p);utf[i]=b.toString('utf8',p+2,p+2+l);p+=2+l;break;}
  case 3:case 4:case 9:case 10:case 11:case 12:case 17:case 18:p+=4;break;
  case 5:case 6:p+=8;i++;break;
  case 7:case 16:case 19:case 20:p+=2;break;
  case 8:refs.push(b.readUInt16BE(p));p+=2;break;
  case 15:p+=3;break;
  default:break loop;}}
 return refs.map(k=>utf[k]).filter(s=>typeof s==='string');}
function textAsset(b){const cls=classStrings(b);if(cls)return out(kit.poolLines(cls));
 const t=kit.decodeText(b).replace(/^﻿/,''),s=t.trimStart();
 if(/^[[{]/.test(s)){try{return out(kit.poolLines(jsonStrings(JSON.parse(s),[])));}catch{}}
 if(/^<[?!A-Za-z]/.test(s)){const acc=[];for(const m of t.matchAll(/>([^<]+)<|="([^"]*)"/g))acc.push(m[1]??m[2]);return out(kit.poolLines(acc.map(x=>x.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&'))));}
 const rows=t.split(/\r?\n/),body=rows.filter(r=>r.trim()&&!/^\s*[#!;]/.test(r));if(!body.length)return EMPTY;
 if(body.filter(r=>/^\s*[^=:\s]+\s*[=:]/.test(r)).length>=body.length*.8){const acc=[];let cur=null;
  for(const r of rows){if(cur!==null){cur+=r.trimStart();if(/\\$/.test(cur)){cur=cur.slice(0,-1);continue;}acc.push(cur);cur=null;continue;}
   if(!r.trim()||/^\s*[#!;]/.test(r))continue;const m=/^\s*[^=:\s]+\s*[=:]\s?(.*)$/.exec(r);if(!m)continue;if(/\\$/.test(m[1])){cur=m[1].slice(0,-1);continue;}acc.push(m[1]);}
  if(cur!==null)acc.push(cur);return out(kit.poolLines(acc.map(unescapeProps)));}
 const sep=['\t',','].find(c=>body.length>1&&body.every(r=>r.split(c).length===body[0].split(c).length&&r.includes(c)));
 if(sep)return out(kit.poolLines(body.flatMap(r=>r.split(sep).map(c=>c.replace(/^"|"$/g,'').replace(/""/g,'"')))));
 return out(kit.poolLines(body));}

/* ---- GameMaker (E630) --------------------------------------------------------------------------------------------- */
function gmChunks(b){if(b.length<16||b.toString('latin1',0,4)!=='FORM')return null;const end=Math.min(b.length,8+b.readUInt32LE(4)),c={};let p=8;
 while(p+8<=end){const name=b.toString('latin1',p,p+4),len=b.readUInt32LE(p+4);if(!/^[A-Z0-9]{4}$/.test(name)||p+8+len>end)break;c[name]={at:p+8,size:len};p+=8+len;}return c;}
function gmStrings(b){const c=gmChunks(b)?.STRG;if(!c||c.size<4)return null;const n=b.readUInt32LE(c.at);if(n>4e6||c.at+4+n*4>b.length)return null;const s=[];
 for(let i=0;i<n;i++){const o=b.readUInt32LE(c.at+4+i*4);if(o+4>b.length)continue;const len=b.readUInt32LE(o);if(o+4+len>b.length)continue;s.push(b.toString('utf8',o+4,o+4+len));}return s;}
const GM_DATA=/^(data\.win|game\.unx|game\.ios|game\.droid)$/i;
const gamemaker=reader({id:'gamemaker',hint:'data.win（STRG 字符串表）',
 list:dir=>{const data=kit.files(dir,{name:GM_DATA,magic:'FORM'});if(!data.length)return [];
  return [...data.map(f=>loose(f,path.basename(f))),...kit.walk(dir,2,n=>TEXT_EXT.test(n)&&!/^options\.ini$/i.test(n)).map(f=>loose(f,rel(dir,f)))];},
 parse:b=>{const s=gmStrings(b);return s?out(kit.poolLines(s)):textAsset(b);},test:n=>GM_DATA.test(n)});

/* ---- Macromedia / Adobe Director (E631) ---------------------------------------------------------------------------- */
function varint(b,p){let v=0,c;do{c=b[p.at++];v=(v*128)+(c&0x7f);}while(c&0x80&&p.at<b.length);return v;}
/* the resources of one RIFX / XFIR movie at buf[at]: [{tag, data()}] in map order, or null */
function rifx(buf,at=0){const sig=buf.toString('latin1',at,at+4);if(sig!=='RIFX'&&sig!=='XFIR')return null;const be=sig==='RIFX';
 const u32=o=>be?buf.readUInt32BE(o):buf.readUInt32LE(o),u16=o=>be?buf.readUInt16BE(o):buf.readUInt16LE(o);
 const cc=v=>String.fromCharCode(v>>>24,(v>>>16)&255,(v>>>8)&255,v&255),tag=o=>cc(u32(o));
 const end=Math.min(buf.length,at+8+u32(at+4)),type=tag(at+8),res=[];
 if(type==='MV93'||type==='MC95'||type==='APPL'){if(tag(at+12)!=='imap')return null;const m=at+u32(at+24);if(tag(m)!=='mmap')return null;
  const hs=u16(m+8),es=u16(m+10),used=u32(m+16);
  for(let i=0;i<used;i++){const e=m+8+hs+i*es;if(e+12>buf.length)break;const t=tag(e),sz=u32(e+4),o=at+u32(e+8);if(t==='free'||t==='junk'||o+8+sz>buf.length)continue;
   res.push({tag:t,data:()=>buf.subarray(o+8,o+8+sz)});}
  return {be,type,res,end};}
 if(type!=='FGDM'&&type!=='FGDC')return null;
 const p={at:at+12};if(tag(p.at)!=='Fver')return null;p.at+=4;const fl=varint(buf,p);p.at+=fl;
 if(tag(p.at)!=='Fcdr')return null;p.at+=4;const cl=varint(buf,p);const zlibTypes=[];
 try{const f=kit.inflate(buf.subarray(p.at,p.at+cl));const n=be?f.readUInt16BE(0):f.readUInt16LE(0);
  for(let i=0;i<n;i++){const g=2+i*16,d1=be?f.readUInt32BE(g):f.readUInt32LE(g);zlibTypes.push(d1===0xac99e904);}}catch{}
 p.at+=cl;if(tag(p.at)!=='ABMP')return null;p.at+=4;const al=varint(buf,p),aEnd=p.at+al;varint(buf,p);varint(buf,p);
 const map=kit.inflate(buf.subarray(p.at,aEnd)),q={at:0};varint(map,q);varint(map,q);const n=varint(map,q),list=[];
 for(let i=0;i<n&&q.at<map.length;i++){const id=varint(map,q);let off=varint(map,q);if(off>=0x80000000)off-=0x100000000;const comp=varint(map,q),raw=varint(map,q),ct=varint(map,q);
  const t=cc(be?map.readUInt32BE(q.at):map.readUInt32LE(q.at));q.at+=4;list.push({id,off,comp,raw,ct,tag:t});}
 p.at=aEnd;if(tag(p.at)!=='FGEI')return null;p.at+=4;varint(buf,p);const ilsBody=p.at,ils=new Map(),byId=new Map(list.map(r=>[r.id,r]));
 const ilsRes=byId.get(2);if(ilsRes){try{const s=kit.inflate(buf.subarray(ilsBody,ilsBody+ilsRes.comp)),r={at:0};
  while(r.at<s.length){const id=varint(s,r),e=byId.get(id);if(!e)break;ils.set(id,s.subarray(r.at,r.at+e.comp));r.at+=e.comp;}}catch{}}
 const unpack=(e,d)=>{if(zlibTypes[e.ct]||e.comp!==e.raw){try{return kit.inflate(d);}catch{}}return d;};
 for(const e of list){if(e.id===2)continue;const raw=ils.get(e.id)||(e.off>=0&&ilsBody+e.off+e.comp<=buf.length?buf.subarray(ilsBody+e.off,ilsBody+e.off+e.comp):null);if(!raw)continue;
  res.push({tag:e.tag,data:()=>unpack(e,raw)});}
 return {be,type,res,end};}
/* STXT: {u32 header (12), u32 text length, u32 style length}; written big-endian, a little-endian header is accepted too */
function stxt(d){if(d.length<12)return null;for(const be of [true,false]){const h=be?d.readUInt32BE(0):d.readUInt32LE(0),l=be?d.readUInt32BE(4):d.readUInt32LE(4);if(h>=12&&h<=64&&h+l<=d.length)return d.subarray(h,h+l);}return null;}
function directorTexts(buf){const texts=[];
 for(const sig of ['RIFX','XFIR']){let i=buf.indexOf(sig,0,'latin1');while(i>=0){let m=null;try{m=rifx(buf,i);}catch{}
   if(m)for(const r of m.res)if(r.tag==='STXT'){const t=stxt(r.data());if(t&&t.length)texts.push({at:i,t});}
   i=buf.indexOf(sig,i+4,'latin1');}}
 return texts.sort((a,b)=>a.at-b.at).map(x=>x.t);}
const DIR_FILE=/\.(dxr|dir|cxt|cst|dcr|cct)$/i;
const director=reader({id:'director',hint:'*.dxr / *.dcr / *.cxt（STXT 文本演员）或放映机 exe',
 list:dir=>[...kit.walk(dir,2,n=>DIR_FILE.test(n)).map(f=>loose(f,rel(dir,f))),...exesOf(dir,'director').map(f=>({name:path.basename(f),file:f,read:()=>overlayRead(f)}))],
 parse:b=>{const t=directorTexts(b);if(!t.length)return EMPTY;const dec=kit.decoder(t);return out(kit.poolLines(t.map(x=>dec.decode(x))));},test:n=>DIR_FILE.test(n)});

/* ---- Hot Soup Processor 3 (E632) ----------------------------------------------------------------------------------- */
/* a valid HSP3 object at b[at]: {at, size, cs, csLen, ds, dsLen} */
function axAt(b,at){if(b.toString('latin1',at,at+4)!=='HSP3'||at+0x60>b.length)return null;const r=o=>b.readInt32LE(at+o);
 const size=r(12),cs=r(16),csLen=r(20),ds=r(24),dsLen=r(28);if(size<0x60||at+size>b.length)return null;
 if(cs<0x40||ds<0x40||cs+csLen>size||ds+dsLen>size||csLen<0||dsLen<0)return null;return {at,size,cs,csLen,ds,dsLen};}
function axStrings(b,h){const out=[],seg=b.subarray(h.at,h.at+h.size),ds=seg.subarray(h.ds,h.ds+h.dsLen);let p=h.cs;const end=h.cs+h.csLen;
 while(p+2<=end){const c=seg.readUInt16LE(p);p+=2;let v;if(c&0x8000){if(p+4>end)break;v=seg.readUInt32LE(p);p+=4;}else{if(p+2>end)break;v=seg.readUInt16LE(p);p+=2;}
  if((c&0x0fff)===2){const s=kit.cstr(ds,v);if(s&&s.length)out.push(s);}}
 return out;}
/* DPMX index at b[d]: [{name, key, offset (absolute in b), size}] */
function dpmx(b,d=0){if(b.toString('latin1',d,d+4)!=='DPMX'||d+16>b.length)return null;const data=b.readUInt32LE(d+4),n=b.readUInt32LE(d+8);if(n>100000||d+16+n*32>b.length)return null;const out=[];
 for(let i=0;i<n;i++){const e=d+16+i*32,nb=b.subarray(e,e+16),z=nb.indexOf(0);const name=kit.cname(nb);
  const key=b.readUInt32LE(e+20),offset=d+data+b.readUInt32LE(e+24),size=b.readUInt32LE(e+28);if(!name||offset+size>b.length)return null;out.push({name,key,offset,size});}
 return out;}
function hspPieces(b){const out=[],idx=(()=>{const d=b.indexOf('DPMX',0,'latin1');return d>=0?dpmx(b,d):null;})();
 if(idx){for(const e of idx){if(e.key)continue;const d=b.subarray(e.offset,e.offset+e.size);if(/\.ax$/i.test(e.name)){const h=axAt(d,0);if(h)out.push({kind:'ax',b:d,h});}else if(TEXT_EXT.test(e.name))out.push({kind:'text',b:d});}if(out.length)return out;}
 let i=b.indexOf('HSP3',0,'latin1');while(i>=0){const h=axAt(b,i);if(h){out.push({kind:'ax',b,h});i=b.indexOf('HSP3',i+h.size,'latin1');}else i=b.indexOf('HSP3',i+4,'latin1');}
 return out;}
function hspParse(b){const pieces=hspPieces(b),lines=[],ax=pieces.filter(x=>x.kind==='ax').map(x=>axStrings(x.b,x.h));
 const dec=kit.decoder(ax.flat());for(const list of ax)lines.push(...kit.poolLines(list.map(s=>dec.decode(s))));
 for(const x of pieces)if(x.kind==='text')lines.push(...textAsset(x.b).lines);
 return out(lines);}
const hsp=reader({id:'hsp',hint:'start.ax（exe 尾部 DPMX 或 data.dpm）',
 list:dir=>[...exesOf(dir,'hsp').map(f=>({name:path.basename(f),file:f,read:()=>overlayRead(f)})),...kit.files(dir,{name:/\.(dpm|ax)$/i}).map(f=>loose(f,path.basename(f)))],
 parse:hspParse,test:n=>/\.(dpm|ax)$/i.test(n),extra:{encrypted:b=>(dpmx(b,Math.max(0,b.indexOf('DPMX',0,'latin1')))||[]).filter(e=>e.key&&/\.ax$/i.test(e.name)).length}});

/* ---- Clickteam Fusion / MMF2 (E633) -------------------------------------------------------------------------------- */
function cfChunks(b,p,end,unicode,acc,depth=0){while(p+8<=end){const id=b.readUInt16LE(p),flags=b.readUInt16LE(p+2),size=b.readUInt32LE(p+4);p+=8;if(id===0x7f7f||p+size>end)break;
  let body=b.subarray(p,p+size);p+=size;if(flags&2){acc.encrypted++;continue;}
  if(flags&1){try{body=kit.inflate(body.subarray(8));}catch{continue;}}
  if(id===0x3333&&depth<2){cfChunks(body,0,body.length,unicode,acc,depth+1);continue;}
  acc.lines.push(...kit.textRuns(unicode?body.toString('utf16le'):new TextDecoder(kit.codepage(body)).decode(body)));}
 return acc;}
function clickteam(b){for(const sig of ['PAMU','PAME']){const at=b.indexOf(sig,0,'latin1');if(at<0||at>(4<<20))continue;return cfChunks(b,at+16,b.length,sig==='PAMU',{lines:[],encrypted:0});}return null;}
const CCN=/\.(ccn|ccj)$/i;
const clickteamEngine=reader({id:'clickteam',hint:'exe 尾部 PAME / PAMU（Clickteam Fusion）',
 list:dir=>[...exesOf(dir,'clickteam').map(f=>({name:path.basename(f),file:f,read:()=>overlayRead(f)})),...kit.files(dir,{name:CCN}).map(f=>loose(f,path.basename(f)))],
 parse:b=>{const r=clickteam(b);return r?out(r.lines):EMPTY;},test:n=>CCN.test(n),extra:{chunks:clickteam}});

/* ---- Adventure Game Studio (E634) ---------------------------------------------------------------------------------- */
function scomAt(b,at){if(b.toString('latin1',at,at+4)!=='SCOM'||at+20>b.length)return null;const ver=b.readInt32LE(at+4),gd=b.readUInt32LE(at+8),cs=b.readUInt32LE(at+12),ss=b.readUInt32LE(at+16);
 if(ver<0||ver>1000)return null;const s=at+20+gd+cs*4;if(gd>b.length||cs>b.length||s+ss>b.length)return null;return {strings:b.subarray(s,s+ss),end:s+ss};}
function scomStrings(b){const out=[];let i=b.indexOf('SCOM',0,'latin1');
 while(i>=0){const s=scomAt(b,i);if(s){let p=0;while(p<s.strings.length){const z=s.strings.indexOf(0,p),e=z<0?s.strings.length:z;if(e>p)out.push(s.strings.subarray(p,e));p=e+1;}i=b.indexOf('SCOM',s.end,'latin1');}else i=b.indexOf('SCOM',i+4,'latin1');}
 return out;}
/* the compiled scripts of a big file (an exe with hundreds of MB of sprites): found in windows, returned back to back */
function scomExtract(file){const from=kit.peOverlay(file)?.at||0,parts=[];
 for(const at of kit.scan(file,'SCOM',{from,max:4096})){const h=kit.readAt(file,at,20);if(h.length<20)continue;const gd=h.readUInt32LE(8),cs=h.readUInt32LE(12),ss=h.readUInt32LE(16),len=20+gd+cs*4+ss;
  if(h.readInt32LE(4)<0||h.readInt32LE(4)>1000||len>(64<<20)||at+len>kit.size(file))continue;parts.push(kit.readAt(file,at,len));}
 return Buffer.concat(parts);}
const PW=Buffer.from('Avis Durgan','latin1');
function traString(b,p){const len=b.readInt32LE(p.at);p.at+=4;if(len<0||p.at+len>b.length)throw Error('TRA');const s=Buffer.from(b.subarray(p.at,p.at+len));p.at+=len;
 for(let i=0;i<s.length;i++){s[i]=(s[i]-PW[i%11])&255;if(s[i]===0)return s.subarray(0,i);}return s;}
/* a translation file: [[source bytes, translation bytes]] */
function tra(b){if(b.length<19||b.toString('latin1',0,14)!=='AGSTranslation')return null;const p={at:15},pairs=[];
 while(p.at+4<=b.length){const id=b.readInt32LE(p.at);p.at+=4;if(id<0)break;let len;if(id===0){p.at+=16;len=Number(b.readBigInt64LE(p.at));p.at+=8;}else{len=b.readInt32LE(p.at);p.at+=4;}const end=p.at+len;if(len<0||end>b.length)break;
  if(id===1)while(p.at<end){const s=traString(b,p),d=traString(b,p);if(!s.length&&!d.length)break;if(s.length)pairs.push([s,d]);}
  p.at=end;}
 return pairs;}
/* source text -> translation, decoded each side in its own code page */
function traDict(b){const pairs=tra(b);if(!pairs)return null;const ds=kit.decoder(pairs.map(x=>x[0])),dd=kit.decoder(pairs.map(x=>x[1])),m=new Map();
 for(const [s,d] of pairs){const k=kit.trimBoth(ds.decode(s)),v=kit.trimBoth(dd.decode(d));if(k&&v&&!m.has(k))m.set(k,v);}return m;}
const AGS_DATA=/^(ac2game\.dat|game28\.dta)$|\.crm$/i;
function agsPatchLines(base,found){const dicts=[];for(const d of found.dirs||[])for(const f of kit.files(d,{name:/\.tra$/i}))try{const m=traDict(fs.readFileSync(f));if(m&&m.size)dicts.push(m);}catch{}
 if(!dicts.length)return null;let any=false;
 const list=base.map(scene=>{let changed=false;const lines=scene.lines.map(t=>{for(const m of dicts){const v=m.get(t);if(v){changed=true;return v;}}return t;});if(!changed)return scene;any=true;return {...scene,patched:true,lines};});
 return any?list:null;}
const ags=reader({id:'ags',hint:'exe 尾部 CLIB / ac2game.dat / *.crm（SCOM 字符串段）',
 list:dir=>[...exesOf(dir,'ags').map(f=>({name:path.basename(f),file:f,read:()=>scomExtract(f)})),...kit.files(dir,{name:AGS_DATA,max:4000}).map(f=>({name:path.basename(f),file:f,read:()=>scomExtract(f)}))],
 parse:b=>{const s=scomStrings(b);if(!s.length)return EMPTY;const dec=kit.decoder(s);return out(kit.poolLines(s.map(x=>dec.decode(x))));},test:n=>AGS_DATA.test(n),
 extra:{patchLines:agsPatchLines,tra,traDict}});

/* ---- SRPG Studio (E635) -------------------------------------------------------------------------------------------- */
function rc4(key,data){const S=new Uint8Array(256);for(let i=0;i<256;i++)S[i]=i;for(let i=0,j=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;[S[i],S[j]]=[S[j],S[i]];}
 const o=Buffer.alloc(data.length);for(let k=0,i=0,j=0;k<data.length;k++){i=(i+1)&255;j=(j+S[i])&255;[S[i],S[j]]=[S[j],S[i]];o[k]=data[k]^S[(S[i]+S[j])&255];}return o;}
/* CryptoAPI hashes the first length() bytes of the wide key; RC4 takes the 16-byte digest (or 40 bits + 11 zero bytes on
   the base provider) */
const SRPG_KEYS=['keyset','_dynamic'].map(k=>Buffer.from(k,'utf16le').subarray(0,k.length));
function srpgKeys(){const out=[];for(const k of SRPG_KEYS){const h=crypto.createHash('md5').update(k).digest();out.push(h,Buffer.concat([h.subarray(0,5),Buffer.alloc(11)]));}return out;}
const zeroShare=b=>{const s=b.subarray(0,4096);let z=0;for(const c of s)if(c===0)z++;return s.length?z/s.length:0;};
function srpgProject(b){if(b.length<0x30||b.toString('latin1',0,4)!=='SDTS')return null;const enc=b.readUInt32LE(4),at=b.readUInt32LE(20)+168;if(at>b.length)return null;const data=b.subarray(at);
 if(!enc)return data;let best=null,score=-1;for(const k of srpgKeys()){const d=rc4(k,data.subarray(0,4096)),s=zeroShare(d);if(s>score){score=s;best=k;}}
 return score>0.05?rc4(best,data):null;}
/* {u32 byte length, UTF-16LE, NUL NUL} strings in order */
function utf16Pool(d){const out=[];for(let i=0;i+4<=d.length;){const len=d.readUInt32LE(i);
  if(len>=4&&len<=65536&&!(len&1)&&i+4+len<=d.length&&d[i+3+len]===0&&d[i+2+len]===0){const s=d.toString('utf16le',i+4,i+2+len);if(!s.includes('\0')){out.push(s);i+=4+len;continue;}}
  i++;}
 return out;}
const srpg=reader({id:'srpg',hint:'data.dts（SDTS，RC4）',list:dir=>kit.files(dir,{name:/^data\.dts$/i,magic:'SDTS'}).map(f=>loose(f,path.basename(f))),
 parse:b=>{const d=srpgProject(b);return d?out(kit.poolLines(utf16Pool(d))):EMPTY;},test:n=>/^data\.dts$/i.test(n),extra:{project:srpgProject,rc4}});

/* ---- Java / libGDX (E636) ------------------------------------------------------------------------------------------ */
const JAVA_LIB=/^(META-INF|com\/badlogic|org\/(lwjgl|apache|json|slf4j|objectweb|jbox2d|newdawn)|javax?\/|kotlinx?\/|scala\/|com\/(google|sun|fasterxml|esotericsoftware|jcraft)|net\/(java|jpountz)|paulscode|de\/matthiasmann|sun\/|jdk\/)/;
const JAR_SKIP=/^(gdx|lwjgl|jinput|jogl|gluegen|jorbis|jlayer|kotlin|scala|commons|guava|gson|jackson|slf4j|log4j|asm|box2d|kryo|jutils|joal|openal)/i;
const JAR_ENTRY=n=>!JAVA_LIB.test(n)&&(TEXT_EXT.test(n)||/\.class$/i.test(n));
function jarsOf(dir){const out=[];for(const sub of ['','lib','bin','game','app','jar'])for(const f of kit.files(path.join(dir,sub),{name:/\.jar$/i}))if(!JAR_SKIP.test(path.basename(f)))out.push(f);return out;}
const java=reader({id:'java',hint:'*.jar（.properties / .class 常量池 / 文本资源）',
 list:dir=>{const out=[];for(const j of jarsOf(dir)){const l=kit.zipList(j);if(!l)continue;for(const e of l)if(!e.encrypted&&JAR_ENTRY(e.name))out.push({name:e.name,file:j,read:()=>kit.zipRead(j,e)});}
  if(!out.length)return out;for(const sub of ['assets','data','res','resources'])for(const f of kit.walk(path.join(dir,sub),4,n=>TEXT_EXT.test(n)))out.push(loose(f,rel(dir,f)));return out;},
 parse:textAsset,test:n=>/\.jar$/i.test(n),extra:{classStrings}});

/* ---- MonoGame / XNA / FNA (E637) ----------------------------------------------------------------------------------- */
function lz4Block(src,size){const o=Buffer.alloc(size);let s=0,p=0;
 while(s<src.length&&p<size){const tok=src[s++];let lit=tok>>4;if(lit===15){let c;do{c=src[s++];lit+=c;}while(c===255&&s<src.length);}
  src.copy(o,p,s,s+lit);s+=lit;p+=lit;if(s>=src.length)break;const off=src[s]|(src[s+1]<<8);s+=2;let ml=tok&15;if(ml===15){let c;do{c=src[s++];ml+=c;}while(c===255&&s<src.length);}ml+=4;
  if(!off||off>p)throw Error('LZ4');for(let k=0;k<ml&&p<size;k++){o[p]=o[p-off];p++;}}
 return o.subarray(0,p);}
function xnbBody(b){if(b.length<10||b.toString('latin1',0,3)!=='XNB')return null;const flags=b[5];
 if(flags&0x40)return lz4Block(b.subarray(14),b.readUInt32LE(10));if(flags&0x80)return null;return b.subarray(10);}
const utf8=new TextDecoder('utf-8',{fatal:true});
/* .NET BinaryWriter strings (7-bit length + UTF-8) that hold non-ASCII text */
function netStrings(d){const out=[];for(let i=0;i<d.length;){let len=0,sh=0,j=i,c;do{c=d[j++];len|=(c&0x7f)<<sh;sh+=7;}while(c&0x80&&sh<21&&j<d.length);
  if(len>=2&&len<=8192&&j+len<=d.length){const s=d.subarray(j,j+len);if(s.some(x=>x>=0x80)){let t=null;try{t=utf8.decode(s);}catch{}if(t&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t)){out.push(t);i=j+len;continue;}}}
  i++;}
 return out;}
/* a .NET assembly's #US heap (string literals, UTF-16) */
function userStrings(b){try{if(b.toString('latin1',0,2)!=='MZ')return null;const pe=b.readUInt32LE(0x3c);if(b.toString('latin1',pe,pe+4)!=='PE\0\0')return null;
 const nsec=b.readUInt16LE(pe+6),opt=pe+24,magic=b.readUInt16LE(opt),dd=opt+(magic===0x20b?112:96),cliRva=b.readUInt32LE(dd+14*8);if(!cliRva)return null;
 const secs=opt+b.readUInt16LE(pe+20),off=rva=>{for(let i=0;i<nsec;i++){const s=secs+i*40,va=b.readUInt32LE(s+12),vs=Math.max(b.readUInt32LE(s+8),b.readUInt32LE(s+16));if(rva>=va&&rva<va+vs)return rva-va+b.readUInt32LE(s+20);}return -1;};
 const cli=off(cliRva);if(cli<0)return null;const md=off(b.readUInt32LE(cli+8));if(md<0||b.toString('latin1',md,md+4)!=='BSJB')return null;
 const vl=b.readUInt32LE(md+12);let p=md+16+vl+2;const n=b.readUInt16LE(p);p+=2;let us=null;
 for(let i=0;i<n;i++){const o=b.readUInt32LE(p),sz=b.readUInt32LE(p+4);p+=8;const z=b.indexOf(0,p),name=b.toString('latin1',p,z);p=(z+4)&~3;if(name==='#US')us=b.subarray(md+o,md+o+sz);}
 if(!us)return null;const out=[];for(let i=1;i<us.length;){const c=us[i];let len,h;if(c<0x80){len=c;h=1;}else if((c&0xc0)===0x80){len=((c&0x3f)<<8)|us[i+1];h=2;}else{len=((c&0x1f)<<24)|(us[i+1]<<16)|(us[i+2]<<8)|us[i+3];h=4;}
  if(!len){i+=h;continue;}if(len>1)out.push(us.toString('utf16le',i+h,i+h+len-1));i+=h+len;}
 return out;}catch{return null;}}
const XNA_DLL=/^(MonoGame\.Framework|Microsoft\.Xna\.Framework.*|FNA)\.dll$/i;
const NET_SKIP=/^(MonoGame|Microsoft|System|SharpDX|Steamworks|FNA|Newtonsoft|OpenTK|NVorbis|Lidgren|SDL|soft_oal|mscorlib|netstandard|api-ms|Mono\.|ICSharpCode|TiledSharp|MonoMod|Facepunch|Tao|Ionic|NLog|log4net|Humper|Nez|Myra|FontStashSharp)/i;
function xnaGame(dir){return kit.files(dir,{name:XNA_DLL}).length>0||kit.walk(path.join(dir,'Content'),3,n=>/\.xnb$/i.test(n)).length>0;}
const xna=reader({id:'xna',hint:'Content\\*.xnb / 游戏程序集 #US',
 list:dir=>{if(!xnaGame(dir))return [];const out=kit.walk(path.join(dir,'Content'),5,n=>/\.xnb$/i.test(n)||TEXT_EXT.test(n)).map(f=>loose(f,rel(dir,f)));
  for(const f of kit.files(dir,{name:/\.(exe|dll)$/i,max:200}))if(!NET_SKIP.test(path.basename(f))&&kit.peInfo(f)?.pe)out.push(loose(f,path.basename(f)));return out;},
 parse:b=>{if(b.toString('latin1',0,3)==='XNB'){const d=xnbBody(b);return d?out(kit.poolLines(netStrings(d))):EMPTY;}const us=userStrings(b);if(us)return out(kit.poolLines(us));if(b.toString('latin1',0,2)==='MZ')return EMPTY;return textAsset(b);},
 test:n=>/\.xnb$/i.test(n),extra:{xnbBody,userStrings,lz4Block}});

/* ---- OHRRPGCE (E638) ----------------------------------------------------------------------------------------------- */
function lumps(b){const out=[];let p=0;while(p<b.length){const z=b.indexOf(0,p);if(z<0||z===p||z-p>50)return null;const name=b.toString('latin1',p,z);if(!/^[\w.\-]+$/.test(name))return null;p=z+1;if(p+4>b.length)return null;
  const size=((b[p+1]<<24)|(b[p]<<16)|(b[p+3]<<8)|b[p+2])>>>0;p+=4;if(p+size>b.length)return null;out.push({name,at:p,size});p+=size;}
 return out.length?out:null;}
function sayBoxes(d){const boxes=[];for(let r=0;r+400<=d.length;r+=400){const ls=[];for(let k=0;k<8;k++){const l=d.subarray(r+k*38,r+k*38+38),z=l.indexOf(0);ls.push(z<0?l:l.subarray(0,z));}boxes.push(ls);}return boxes;}
function ohrParse(b){let say=null;const l=lumps(b);if(l){const e=l.find(x=>/\.say$/i.test(x.name));if(!e)return EMPTY;say=b.subarray(e.at,e.at+e.size);}else if(b.length%400===0)say=b;if(!say)return EMPTY;
 const boxes=sayBoxes(say),dec=kit.decoder(boxes.flat());return out(kit.poolLines(boxes.map(ls=>ls.map(x=>dec.decode(x).replace(/\s+$/,'')).filter(Boolean).join('\n'))));}
const ohrrpgce=reader({id:'ohrrpgce',hint:'*.rpg（.say 文本框）',list:dir=>[...kit.files(dir,{name:/\.rpg$/i}).filter(f=>{try{return !!lumps(kit.readAt(f,0,Math.min(kit.size(f),MAX)));}catch{return false;}}).map(f=>loose(f,path.basename(f))),
  ...kit.walk(dir,1,n=>/\.say$/i.test(n)).map(f=>loose(f,path.basename(f)))],parse:ohrParse,test:n=>/\.(rpg|say)$/i.test(n),extra:{lumps}});
const isRpg=f=>{const h=kit.head(f,64);const z=h.indexOf(0);return z>0&&z<=50&&/^[\w.\-]+$/.test(h.toString('latin1',0,z))&&kit.size(f)>z+5;};

/* ---- RPG Paper Maker (E638) ---------------------------------------------------------------------------------------- */
const rpgpaper=reader({id:'rpgpaper',hint:'Content\\Datas\\*.json',list:dir=>kit.walk(path.join(dir,'Content','Datas'),4,n=>/\.json$/i.test(n)).map(f=>loose(f,rel(dir,f))),
 parse:textAsset,test:n=>/\.json$/i.test(n)});

const ENGINES={gamemaker,director,hsp,clickteam:clickteamEngine,ags,srpg,java,xna,ohrrpgce,rpgpaper};
/* registry fingerprints that need a look inside a file */
const probes={overlayKind,isRpg,gdx:j=>(kit.zipList(j)||[]).some(e=>e.name.startsWith('com/badlogic/'))};
module.exports={ENGINES,probes,textAsset,classStrings,gmStrings,gmChunks,rifx,stxt,directorTexts,axAt,axStrings,dpmx,hspPieces,clickteam,scomStrings,scomExtract,tra,traDict,
 srpgProject,utf16Pool,rc4,netStrings,userStrings,xnbBody,lz4Block,lumps,sayBoxes};
