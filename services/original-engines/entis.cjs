// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E582 Entis GLS / Cotopha (Entis, Navel's early titles, Lump of Sugar, Yuzusoft-era partners, Sprite …: 133 releases).
   Format references (read, not copied): GARbro ArcFormats/Entis (ArcNOA.cs, ErisaNemesis.cs, EriReader.cs; morkt, MIT)
   for the archive and its codecs, crskycode EntisGLS_Tools CSX.bt / CSXToolPlus disassembler and RealMrWicked CSXTool
   (GPL) for the Cotopha image.
     *.noa        "Entis\x1a", id 0x02000400, "DirEntry" records from 0x40: count, then per entry size (u64), attribute,
                  encoding, offset (u64, from the record), 8 bytes, extra (u32 + bytes), name (u32 + bytes). Attribute
                  0x10 is a sub folder. Encoding 0 raw, 0x80000010 ERISA-N compressed, 0x40000000 BSHF with a password.
                  A file record is "filehdr" + u64 size; its data starts at +0x10.
     password     per archive, stored in the exe: resource IDR_COTOMI (RCDATA) is an ERISA-N compressed XML with
                  <archive path="x.noa" key="..."/>. Static; a probe-supplied password (params "entis-key") is the
                  fallback for exes that keep it elsewhere.
     *.csx        "Entis\x1a" + "Cotopha Image file", then records {id[8], u64 length}: "image   " is the bytecode,
                  "conststr" the string pool of newer images. The lines are what the scripts pass to the message
                  functions: Load String (02 00 06 + literal) pushes, Call (08 mode argc + literal name) calls. A literal
                  is u32 length + UTF-16LE, or 0x80000000 + an index into conststr. Talk(name, voice) starts a message,
                  Mess(text) adds to it, AddSelect(text, n) adds a choice.
   Built on kit.cjs (E573). */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');

/* ---- bit reader (ERISADecodeContext) ----------------------------------------------------------------------------- */
class Bits{constructor(src){this.s=src;this.p=0;this.n=0;this.v=0;}
 fill(){if(this.n)return true;if(this.p>=this.s.length)return false;const s=this.s,p=this.p;this.v=((s[p]<<24)|((s[p+1]||0)<<16)|((s[p+2]||0)<<8)|(s[p+3]||0))>>>0;this.p+=4;this.n=32;return true;}
 bit(){if(!this.fill())return 1;const r=this.v>>>31;this.n--;this.v=(this.v<<1)>>>0;return r?-1:0;}
 bits(n){let c=0;while(n){if(!this.fill())break;const k=Math.min(n,this.n);c=((c<<k)|(this.v>>>(32-k)))>>>0;n-=k;this.n-=k;this.v=k===32?0:(this.v<<k)>>>0;}return c>>>0;}}
/* ---- ERISA probability model + arithmetic decoder + Nemesis phrase coder ------------------------------------------- */
const ESC=-1,TOTAL_LIMIT=0x2000,SORT_MAX=0x101,SUB_MAX=0x80,SLOT_MAX=0x800,SHIFT=[1,3,4,5],NEW_LIMIT=[1,8,16,32];
class Model{constructor(){this.total=0;this.sorts=0;this.occ=new Uint16Array(SORT_MAX);this.sym=new Int16Array(SORT_MAX);this.subOcc=new Uint16Array(SUB_MAX);this.subSym=new Int16Array(SUB_MAX).fill(-1);}
 init(){this.total=SORT_MAX;this.sorts=SORT_MAX;for(let i=0;i<256;i++){this.occ[i]=1;this.sym[i]=i;}this.occ[256]=1;this.sym[256]=ESC;this.subOcc.fill(0);this.subSym.fill(-1);return this;}
 half(){this.total=0;for(let i=0;i<this.sorts;i++){this.occ[i]=(this.occ[i]+1)>>1;this.total+=this.occ[i];}for(let i=0;i<SUB_MAX;i++)this.subOcc[i]>>=1;}
 inc(i){const o=++this.occ[i],s=this.sym[i];while(--i>=0){if(this.occ[i]>=o)break;this.occ[i+1]=this.occ[i];this.sym[i+1]=this.sym[i];}this.occ[++i]=o;this.sym[i]=s;if(++this.total>=TOTAL_LIMIT)this.half();return i;}
 add(s){const i=this.sorts++;this.total++;this.sym[i]=s;this.occ[i]=1;return i;}}
class Erisa{constructor(src){this.b=new Bits(src);this.code=this.b.bits(32);this.aug=0xFFFF;this.post=0;}
 index(m){const acc=Math.floor((Math.imul(this.code,m.total)>>>0)/this.aug);if(acc>=TOTAL_LIMIT)return -1;let i=0,a=acc&0xffff,fs=0,o;
  for(;;){o=m.occ[i];if(a<o)break;a-=o;fs+=o;if(++i>=m.sorts)return -1;}
  this.code=(this.code-Math.floor((this.aug*fs+m.total-1)/m.total))>>>0;this.aug=Math.floor(this.aug*o/m.total)>>>0;if(!this.aug)return -1;
  while(!(this.aug&0x8000)){let bit=this.b.bit();if(bit===1){if(++this.post>=256)return -1;bit=0;}this.code=((this.code<<1)|(bit&1))>>>0;this.aug=(this.aug<<1)>>>0;}
  this.code&=0xFFFF;return i;}
 symbol(m){const i=this.index(m);if(i<0)return ESC;const s=m.sym[i];m.inc(i);return s;}}
/* ERISA-N (Nemesis): order-4 context models over the base model, plus a phrase / run-length escape */
function nemesis(src,outLen){const d=new Erisa(src),base=new Model().init(),slots=Array.from({length:SLOT_MAX},()=>new Model());let used=0;
 const phraseLen=new Model().init(),phraseIdx=new Model().init(),runLen=new Model().init();
 const buf=new Uint8Array(0x10000),look=Array.from({length:256},()=>({first:0,index:new Uint32Array(256)})),last=new Uint8Array(4);let li=0,bi=0,left=0,next=0;
 const out=Buffer.alloc(outLen);let o=0;
 const emit=c=>{last[li++]=c;li&=3;const ph=look[c];ph.index[ph.first]=bi;ph.first=(ph.first+1)&255;buf[bi++]=c;bi&=0xFFFF;out[o++]=c;};
 while(o<outLen){
  if(left>0){let c=buf[(bi-1)&0xFFFF];const n=Math.min(left,outLen-o);for(let i=0;i<n;i++){if(next>=0){c=buf[next++];next&=0xFFFF;}emit(c);}left-=n;continue;}
  let m=base,deg;for(deg=0;deg<4;deg++){const l=last[(li+3-deg)&3]>>SHIFT[deg];if(m.subSym[l]<0)break;if(m.subSym[l]>=used)throw Error('ERISA_N');m=slots[m.subSym[l]];}
  let i=d.index(m);if(i<0)break;let s=m.sym[i];m.inc(i);let phrase=false;
  if(s===ESC){if(m!==base){i=d.index(base);if(i<0)break;s=base.sym[i];base.inc(i);if(s!==ESC)m.add(s);else phrase=true;}else phrase=true;}
  if(phrase){const pi=d.symbol(phraseIdx);if(pi===ESC)break;const len=d.symbol(pi===0?runLen:phraseLen);if(len===ESC)break;const lc=buf[(bi-1)&0xFFFF],ph=look[lc];left=len;
   if(pi===0)next=-1;else{next=ph.index[(ph.first-pi)&255];if(buf[next]!==lc)throw Error('ERISA_N');next=(next+1)&0xFFFF;}continue;}
  emit(s);
  if(used<SLOT_MAX&&deg<4){let sy=s>>SHIFT[deg];if(sy>=SUB_MAX)throw Error('ERISA_N');
   if(++m.subOcc[sy]>=NEW_LIMIT[deg]){const parent=m;let k;m=base;
    for(k=0;k<=deg;k++){sy=last[(li+3-k)&3]>>SHIFT[k];if(m.subSym[sy]<0)break;if(m.subSym[sy]>=used)throw Error('ERISA_N');m=slots[m.subSym[sy]];}
    if(k<=deg&&m.subSym[sy]<0){const nw=slots[used];m.subSym[sy]=used++;nw.total=0;let j=0;
     for(let x=0;x<parent.sorts;x++){const w=parent.occ[x]>>4;if(w>0&&parent.sym[x]!==ESC){nw.total+=w;nw.occ[j]=w;nw.sym[j]=parent.sym[x];j++;}}
     nw.total++;nw.occ[j]=1;nw.sym[j]=ESC;nw.sorts=++j;nw.subOcc.fill(0);nw.subSym.fill(-1);}}}}
 return out.subarray(0,o);}

/* ---- BSHF: 32-byte blocks whose 256 bits are permuted by the password ---------------------------------------------- */
function bshfPassword(pw){let b=Buffer.from(String(pw||' '),'latin1');if(b.length<32){const a=Buffer.alloc(32);b.copy(a);let n=b.length;a[n++]=0x1b;for(let i=n;i<32;i++)a[i]=(a[i%n]+a[i-1])&255;b=a;}return b;}
/* positions[i] = [byte, mask] the i-th source bit lands on, for the block that uses password offset `off` */
function bshfMap(pass,off){const mask=new Uint8Array(32),map=[];let pos=off,bit=0;
 for(let i=0;i<256;i++){bit=(bit+pass[pos++])&255;if(pos>=pass.length)pos=0;let o=bit>>3,m=0x80>>(bit&7);while(mask[o]===0xFF){bit=(bit+8)&255;o=bit>>3;}
  while(mask[o]&m){bit++;m>>=1;if(!m){bit=(bit+8)&255;o=bit>>3;m=0x80;}}mask[o]|=m;map.push([o,m]);}return map;}
function bshf(src,pw,enc=false){const pass=bshfPassword(pw),out=Buffer.alloc(src.length&~31);let off=0;
 for(let p=0;p+32<=src.length;p+=32){if(off>=pass.length)off=0;const map=bshfMap(pass,off++),blk=src.subarray(p,p+32),dst=out.subarray(p,p+32);
  for(let i=0;i<256;i++){const [o,m]=map[i];if(enc){if(blk[o]&m)dst[i>>3]|=0x80>>(i&7);}else if(blk[i>>3]&(0x80>>(i&7)))dst[o]|=m;}}
 return out;}

/* ---- NOA archive --------------------------------------------------------------------------------------------------- */
const RAW=0,ERISA_N=0x80000010,BSHF=0x40000000;
function isNoa(h){return h.length>=12&&(h.toString('latin1',0,6)==='Entis\x1a'||h.toString('latin1',0,5)==='VIST\x1a')&&h.readUInt32LE(8)===0x02000400;}
function listNoa(file){const h=kit.head(file,0x40);if(!isNoa(h))return null;const fsz=kit.size(file),enc=h.toString('latin1',0x10,0x24)==='EMSAC-Binary Archive'?'shift_jis':'shift_jis',out=[];
 const dir=(at,cur,depth)=>{if(depth>8)return false;const hd=kit.readAt(file,at,16);if(hd.toString('latin1',0,8)!=='DirEntry')return false;const sz=Number(hd.readBigUInt64LE(8));if(sz<=0||sz>64<<20||at+16+sz>fsz)return false;
  const d=kit.readAt(file,at+16,sz);const n=d.readInt32LE(0);let p=4;
  for(let i=0;i<n;i++){if(p+40>d.length)return false;const size=Number(d.readBigUInt64LE(p)),attr=d.readUInt32LE(p+8),code=d.readUInt32LE(p+12),off=at+Number(d.readBigUInt64LE(p+16));p+=32;
   const xl=d.readUInt32LE(p);p+=4+xl;const nl=d.readUInt32LE(p);p+=4;if(p+nl>d.length)return false;const nb=d.subarray(p,p+nl),z=nb.indexOf(0);p+=nl;
   const name=new TextDecoder(enc).decode(z>=0?nb.subarray(0,z):nb),full=cur?cur+'/'+name:name;
   if(attr===0x10){if(!dir(off+16,full,depth+1))return false;}else if(attr===0x20||attr===0x40)break;else out.push({name:full,offset:off,size,code});}
  return true;};
 return dir(0x40,'',0)&&out.length?out:null;}
/* the bytes of one entry: "filehdr" + u64 stored size, then the data */
function readNoa(file,e,password){const len=Number(kit.readAt(file,e.offset+8,8).readBigUInt64LE(0));if(len<=4)return Buffer.alloc(0);
 if(e.code===ERISA_N)return nemesis(kit.readAt(file,e.offset+0x10,len-4),e.size);const data=kit.readAt(file,e.offset+0x10,len);
 if(e.code===RAW)return data;if(e.code===BSHF){if(password==null)throw Error('ENTIS_PASSWORD');return bshf(data,password).subarray(0,Math.min(len-4,e.size));}throw Error('ENTIS_CODE_'+e.code.toString(16));}

/* ---- passwords: IDR_COTOMI in the exe (ERISA-N XML), then probe-supplied ----------------------------------------------- */
const passMemo=new Map();
function exePasswords(dir){if(passMemo.has(dir))return passMemo.get(dir);const out=new Map();
 for(const d of [dir,path.join(dir,'..')])for(const n of kit.names(d))if(/\.exe$/i.test(n)){const r=kit.peResource(path.join(d,n),10,'IDR_COTOMI');if(!r)continue;let xml='';
  try{const raw=nemesis(r,4<<20);xml=raw.includes(0)&&raw[1]===0?raw.toString('utf16le'):new TextDecoder(kit.codepage(raw)).decode(raw);}catch{continue;}
  for(const m of xml.matchAll(/<archive\b[^>]*>/gi)){const p=/\bpath\s*=\s*"([^"]*)"/i.exec(m[0]),k=/\bkey\s*=\s*"([^"]*)"/i.exec(m[0]);if(p&&k)out.set(path.basename(p[1].replace(/\\/g,'/')).toLowerCase(),k[1]);}}
 passMemo.set(dir,out);return out;}
/* per-title passwords: entis-schemes.json, then an adapter pack's "entis-key" params */
const SCHEMES=require('./entis-schemes.json');
function packPasswords(){let extra=[];try{extra=require('../adapter-packs.cjs').params('entis-key').map(p=>p.value);}catch{}return [...extra,...Object.entries(SCHEMES).filter(([k])=>k[0]!=='_').map(([,v])=>v)].filter(v=>v&&typeof v.password==='string');}
/* the password an archive's BSHF entries open with: tried on its first encrypted entry until "Entis\x1a" or text appears */
function passwordFor(file,entries){const enc=entries.find(e=>e.code===BSHF);if(!enc)return null;const name=path.basename(file).toLowerCase(),cands=[];
 const own=exePasswords(path.dirname(file)).get(name);if(own!==undefined)cands.push(own);for(const v of packPasswords())if(!v.archive||String(v.archive).toLowerCase()===name)cands.push(v.password);
 for(const pw of cands){try{const b=readNoa(file,enc,pw);if(b.toString('latin1',0,6)==='Entis\x1a'||plausible(b))return pw;}catch{}}return undefined;}
const plausible=b=>{const t=b.subarray(0,4096);let ok=0;for(const x of t)if(x===9||x===10||x===13||x>=0x20)ok++;return t.length&&ok/t.length>0.9;};

/* ---- Cotopha image (.csx) ------------------------------------------------------------------------------------------- */
const isCsx=b=>b.length>=0x40&&b.toString('latin1',0,6)==='Entis\x1a'&&/Cotopha/i.test(b.toString('latin1',0x10,0x40));
function records(b){const out={};let p=0x40;while(p+16<=b.length){const id=b.toString('latin1',p,p+8),len=Number(b.readBigUInt64LE(p+8));if(!/^[\x20-\x7e]{8}$/.test(id)||len<0||p+16+len>b.length)break;out[id]=b.subarray(p+16,p+16+len);p+=16+len;}return out;}
function constStrings(sec){const out=[];if(!sec||sec.length<4)return out;const n=sec.readInt32LE(0);let p=4;
 for(let i=0;i<n&&p+4<=sec.length;i++){const len=sec.readInt32LE(p);p+=4;if(len<0||p+len*2>sec.length)break;out.push(sec.toString('utf16le',p,p+len*2));p+=len*2;if(p+4>sec.length)break;const refs=sec.readInt32LE(p);p+=4+Math.max(0,refs)*4;}return out;}
/* a string literal at p: [text, next] or null */
function literal(img,p,pool){if(p+4>img.length)return null;const n=img.readUInt32LE(p);if(n===0x80000000){if(p+8>img.length)return null;const i=img.readInt32LE(p+4);return i>=0&&i<pool.length?[pool[i],p+8]:null;}
 if(n>0x4000||p+4+n*2>img.length)return null;return [img.toString('utf16le',p+4,p+4+n*2),p+4+n*2];}
const NAME=/^[A-Za-z_@][A-Za-z0-9_@:.]{0,63}$/;
/* the Load String / Call events of an image, in code order */
function events(img,pool){const ev=[];for(let p=0;p+3<img.length;){
  if(img[p]===0x02&&img[p+1]===0x00&&img[p+2]===0x06){const l=literal(img,p+3,pool);if(l){ev.push({s:l[0]});p=l[1];continue;}}
  if(img[p]===0x08&&img[p+1]>=0x01&&img[p+1]<=0x07&&p+6<=img.length){const argc=img.readInt32LE(p+2);if(argc>=0&&argc<64){const l=literal(img,p+6,pool);if(l&&NAME.test(l[0])){ev.push({call:l[0],argc});p=l[1];continue;}}}
  p++;}
 return ev;}
/* Talk(name, voice) / Mess(text) / AddSelect(text, n): the shown lines, in order. A message ends at the next Talk or at
   any other call that is not Mess */
function csxLines(b){const r=records(b),img=r['image   '];if(!img)return {lines:[],anchors:[]};const pool=constStrings(r['conststr']),lines=[],anchors=[];let cur=null,recent=[];
 const flush=()=>{if(cur!==null){const t=kit.trimBoth(cur.replace(/\\n|\r?\n/g,'\n'));if(t)lines.push(t);}cur=null;};
 for(const e of events(img,pool)){if(e.s!==undefined){recent.push(e.s);if(recent.length>8)recent.shift();continue;}
  const arg=k=>recent.length>=e.argc?recent[recent.length-e.argc+k]:recent[recent.length-1];
  if(e.call==='Talk'){flush();const nm=arg(0);if(nm)anchors.push(nm);cur='';}
  else if(e.call==='Mess'){const t=recent[recent.length-1];if(t!==undefined){cur=(cur||'')+t;}}
  else if(e.call==='AddSelect'){flush();const t=arg(0);if(t&&!kit.ascii(t))lines.push(kit.trimBoth(t));}
  else flush();
  recent=[];}
 flush();return {lines,anchors};}
function parse(buf){if(isCsx(buf))return csxLines(buf);return {lines:[],anchors:[]};}

/* ---- engine ----------------------------------------------------------------------------------------------------------- */
const noaMemo=new Map();
function noaList(file){const st=kit.size(file)+':'+(fs.statSync(file).mtimeMs|0),m=noaMemo.get(file);if(m&&m.st===st)return m.list;let l=null;try{l=listNoa(file);}catch{l=null;}
 if(l){const pw=passwordFor(file,l);for(const e of l)e.password=pw;}noaMemo.set(file,{st,list:l});return l;}
const engine=kit.engine({id:'entis',hint:'*.noa / *.csx',
 archives:{name:/\.(noa|dat|arc)$/i,subs:['','data','Data'],entry:/\.csx$/i,list:noaList,read:(file,e)=>readNoa(file,e,e.password)},
 loose:{name:/\.csx$/i,subs:['','script','Script','data']},parse});
module.exports={engine,parse,listNoa,readNoa,nemesis,bshf,csxLines,events,records,isCsx,exePasswords};
