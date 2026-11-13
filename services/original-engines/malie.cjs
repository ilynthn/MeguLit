// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E578 Malie (Light: Dies irae, 神咒神威神楽, シルヴァリオ; Karin Entertainment otome titles: 絶対迷宮グリム, 断罪のマリア …;
   VNDB ~204 company releases). Format references (read, not copied): GARbro ArcFormats/Malie/ArcLIB.cs, ArcLIBU.cs,
   LibScheme.cs, MalieEncryption.cs and ArcFormats/Camellia.cs (morkt, MIT), with every title's key from GARbro's
   GameData/Formats.dat (malie-schemes.json, exported by tools/garbro-schemes.ps1); Gertram/MalieScriptEditor
   MSELib/VMParser.cs and classes/LineItem.cs (MIT) for the EXEC layout and the text codes.
   Containers (data*.dat / *.lib, also nested):
     "LIB\0"  plain: u16 count at 8; from 0x10 count × {name[0x24], u32 size, u32 offset (from the archive)}; a name
              without an extension that opens as LIB is a folder
     "LIBU"   plain or encrypted: i32 count at 8; from 0x10 count × {UTF-16 name[0x22], u32 size, i64 offset}
     "LIBP"   encrypted: count, offset count; count × {name[0x14], i32 flags, i32 offset, u32 size} (flags & 0x30000 = 0:
              a folder of size entries from index offset), the offset table, data from the index end aligned to the
              scheme's DataAlign; an entry is at base + table[offset] << 10
   Encryption is per 16-byte block keyed by the block's file offset: Camellia-128 (each dword rotated by
   ((offset >> 4) & 15) + 16 bits, alternately left and right, then a standard Camellia-128 decryption; the cipher is
   Node's) or CFI (newer titles: XOR with the block's first byte, then rotations from a 32-byte key and four words).
   The key is per title; the reader tries every known scheme on the first block (it must decrypt to LIBP / LIBU), so
   no title list is needed. A new title's key comes in an adapter pack (params target "malie-scheme": {title,
   cipher: camellia | cfi, key hex, align, rotate: [4 words] for cfi}).
   The scenario is EXEC (exec.dat / exec in the archive, or the "EXEC" resource of the game .exe, Karin): variables,
   functions, labels (each u32 length | 0x80000000 + UTF-16 name …), u32 data length + data, u32 code length + code,
   then the messages: u32 count, count × {u32 offset, u32 length}, u32 total, the UTF-16 text. Messages are kept in
   scenario order, one per click, so the table pairs a patch line by line. Text codes: \a\b<voice>\0 voice,
   \a\x01<base>\n<ruby>\0 ruby (the base is kept), \a\f1\0 the player's name, other \a<x> display codes. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),kit=require('./kit.cjs');

/* ---- ciphers ------------------------------------------------------------------------------------------------------ */
const rotl=(x,n)=>{n&=31;return n?((x<<n)|(x>>>(32-n)))>>>0:x>>>0;},rotr=(x,n)=>{n&=31;return n?((x>>>n)|(x<<(32-n)))>>>0:x>>>0;};
/* decrypt buf in place; at = the file offset of buf[0], a multiple of 16 */
function camellia(key){const k=Buffer.from(key,'hex');return (buf,at)=>{const n=buf.length&~15;if(!n)return buf;
 for(let i=0;i<n;i+=16){const r=(((at+i)>>>4)&15)+16;buf.writeUInt32LE(rotl(buf.readUInt32LE(i),r),i);buf.writeUInt32LE(rotr(buf.readUInt32LE(i+4),r),i+4);buf.writeUInt32LE(rotl(buf.readUInt32LE(i+8),r),i+8);buf.writeUInt32LE(rotr(buf.readUInt32LE(i+12),r),i+12);}
 const d=crypto.createDecipheriv('camellia-128-ecb',k,null);d.setAutoPadding(false);Buffer.concat([d.update(buf.subarray(0,n)),d.final()]).copy(buf,0);return buf;};}
function cfi(key,rot){const k=Buffer.from(key,'hex'),K=i=>k[i&31]^0xa5;return (buf,at)=>{for(let i=0;i+16<=buf.length;i+=16){const off=at+i,o=off&15,first=buf[i+o];for(let j=0;j<16;j++)if(j!==o)buf[i+j]^=first;const b=off>>>4;
  buf.writeUInt32LE(rotr((buf.readUInt32LE(i)^rotr(rot[0],K(b)))>>>0,K(b+12)),i);
  buf.writeUInt32LE(rotl((buf.readUInt32LE(i+4)^rotl(rot[1],K(b+3)))>>>0,K(b+15)),i+4);
  buf.writeUInt32LE(rotr((buf.readUInt32LE(i+8)^rotr(rot[2],K(b+6)))>>>0,K(b-14)),i+8);
  buf.writeUInt32LE(rotl((buf.readUInt32LE(i+12)^rotl(rot[3],K(b+9)))>>>0,K(b-11)),i+12);}return buf;};}
function decryptorOf(s){try{if(s.cipher==='camellia'&&/^[0-9a-f]{32}$/i.test(s.key))return camellia(s.key);if(s.cipher==='cfi'&&/^[0-9a-f]{64}$/i.test(s.key)&&Array.isArray(s.rotate)&&s.rotate.length===4)return cfi(s.key,s.rotate.map(x=>x>>>0));}catch{}return null;}
let catalog=null;
function packSchemes(){try{return require('../adapter-packs.cjs').params('malie-scheme');}catch{return [];}}
function schemes(){const extra=packSchemes();if(catalog&&catalog.extra===extra)return catalog.list;const list=[];
 for(const {value:s} of extra){const dec=decryptorOf(s||{});if(dec)list.push({title:String(s.title||'adapter pack'),align:s.align>>>0||0x1000,dec});}
 let raw={};try{raw=require('./malie-schemes.json').schemes;}catch{}for(const [title,s] of Object.entries(raw)){const dec=decryptorOf(s);if(dec)list.push({title,align:s.align||0x1000,dec});}
 catalog={extra,list};return list;}
/* read length bytes at offset through a decryptor (null = plain) */
function readDec(file,dec,offset,length){if(!dec)return kit.readAt(file,offset,length);const a=offset&~15,end=(offset+length+15)&~15,b=kit.readAt(file,a,end-a);dec(b,a);return b.subarray(offset-a,offset-a+length);}

/* ---- containers --------------------------------------------------------------------------------------------------- */
const sj=kit.SJIS;
function libList(file,base,size,root,out,depth=0){const h=kit.readAt(file,base,16);if(h.length<16||h.toString('latin1',0,4)!=='LIB\0')return false;const count=h.readInt16LE(8);if(count<=0||0x30*count>size)return false;
 const idx=kit.readAt(file,base+16,0x30*count),data=base+16+0x30*count;
 for(let i=0;i<count;i++){const p=i*0x30,z=idx.indexOf(0,p),name=root+sj.decode(idx.subarray(p,z<0||z>p+0x24?p+0x24:z)),esz=idx.readUInt32LE(p+0x24),off=base+idx.readUInt32LE(p+0x28);
  if(!/\./.test(path.posix.basename(name))&&depth<8&&libList(file,off,esz,name+'/',out,depth+1))continue;if(off<data||off+esz>base+size)return false;out.push({name,offset:off,size:esz});}
 return true;}
function libuList(file,dec,base,root,out,depth=0){const h=readDec(file,dec,base,16);if(h.toString('latin1',0,4)!=='LIBU')return false;const count=h.readInt32LE(8),fsz=kit.size(file);if(count<=0||count>100000)return false;
 const idx=readDec(file,dec,base+16,count*0x50);
 for(let i=0;i<count;i++){const p=i*0x50;let name=idx.toString('utf16le',p,p+0x44);const z=name.indexOf('\0');if(z>=0)name=name.slice(0,z);const esz=idx.readUInt32LE(p+0x44),off=base+Number(idx.readBigInt64LE(p+0x48));
  if(!name.includes('.')&&depth<8&&off+16<=fsz&&libuList(file,dec,off,root+name+'/',out,depth+1))continue;if(off<0||off+esz>fsz)return false;out.push({name:root+name,offset:off,size:esz,dec});}
 return true;}
function libpList(file,scheme){const h=readDec(file,scheme.dec,0,16),count=h.readInt32LE(4),noff=h.readInt32LE(8),fsz=kit.size(file);if(count<=0||count>200000||noff<0||noff>200000)return null;
 const idx=readDec(file,scheme.dec,16,count*0x20),table=readDec(file,scheme.dec,16+count*0x20,noff*4),al=scheme.align-1,base=(16+count*0x20+noff*4+al)&~al,out=[],seen=new Set();
 const dir=(root,first,n,depth)=>{for(let i=0;i<n;i++){const k=first+i;if(k>=count||seen.has(k))return;seen.add(k);const p=k*0x20,z=idx.indexOf(0,p),name=root+sj.decode(idx.subarray(p,z<0||z>p+0x14?p+0x14:z)),flags=idx.readInt32LE(p+0x14),off=idx.readInt32LE(p+0x18),esz=idx.readUInt32LE(p+0x1c);
  if(!(flags&0x30000)){if(off>k&&depth<16)dir(name?name+'/':'',off,esz,depth+1);continue;}if(off<0||off>=noff)continue;const at=base+table.readUInt32LE(off*4)*1024;if(at+esz<=fsz)out.push({name,offset:at,size:esz,dec:scheme.dec});}};
 dir('',0,1,0);return out.length?out:null;}
/* the entries of a Malie archive (names with "/"), or null; tried: plain LIB, plain LIBU, each known key */
function index(file){const fsz=kit.size(file);if(fsz<32)return null;const head=kit.readAt(file,0,16),sig=head.toString('latin1',0,4);
 if(sig==='LIB\0'){const out=[];return libList(file,0,fsz,'',out)&&out.length?out:null;}
 if(sig==='LIBU'){const out=[];return libuList(file,null,0,'',out)&&out.length?out:null;}
 for(const s of schemes()){const b=Buffer.from(head);s.dec(b,0);const t=b.toString('latin1',0,4);
  if(t==='LIBP'){const l=libpList(file,s);if(l)return Object.assign(l,{scheme:s.title});}
  if(t==='LIBU'){const out=[];if(libuList(file,s.dec,0,'',out)&&out.length)return Object.assign(out,{scheme:s.title});}}
 return null;}
const listed=new Map();
function list(file){const key=file+'|'+kit.size(file);if(!listed.has(key))listed.set(key,index(file));return listed.get(key);}
function read(file,e){let b=readDec(file,e.dec||null,e.offset,e.size);if(/\.txtz$/i.test(e.name))b=kit.inflate(b);else if(/\.psbz$/i.test(e.name)&&b.toString('latin1',0,4)==='PSBZ')b=kit.inflate(b.subarray(8));return b;}

/* ---- EXEC --------------------------------------------------------------------------------------------------------- */
/* the message table {strings: [string]} or null: walk the header sections, else find the table that ends the file */
function messages(b){if(!b||b.length<32)return null;let p=0;const u=()=>{if(p+4>b.length)throw 0;const v=b.readUInt32LE(p);p+=4;return v;};
 const name=()=>{const l=u();if((l>>>24)!==0x80)throw 0;p+=l&0x7fffffff;if(p>b.length)throw 0;};
 const table=at=>{if(at+4>b.length)return null;const n=b.readUInt32LE(at);if(n>2000000||at+8+n*8>b.length)return null;const total=b.readUInt32LE(at+4+n*8),data=at+8+n*8;if(data+total>b.length||total&1)return null;
  const out=[];for(let i=0;i<n;i++){const o=b.readUInt32LE(at+4+i*8),l=b.readUInt32LE(at+8+i*8);if(o+l>total||o&1)return null;out.push(b.toString('utf16le',data+o,data+o+l));}return {strings:out,end:data+total};};
 try{const nv=u();if(nv>1000000)throw 0;for(let i=0;i<nv;i++){name();for(let g=0;u()!==0&&g<10000;g++)u();p+=16;}
  u();const nf=u();if(nf>1000000)throw 0;for(let i=0;i<nf;i++){name();p+=12;}
  const nl=u();if(nl>1000000)throw 0;for(let i=0;i<nl;i++){name();p+=4;}
  p+=u();p+=u();const t=table(p);if(t&&t.end<=b.length&&b.length-t.end<16)return t;}catch{}
 /* other builds: the table whose text runs to the end of the file */
 for(let at=b.length-12;at>=0;at-=2){const n=b.readUInt32LE(at);if(!n||n>2000000)continue;const tail=at+4+n*8;if(tail+4>b.length)continue;if(tail+4+b.readUInt32LE(tail)!==b.length)continue;const t=table(at);if(t&&t.strings.length)return t;}
 return null;}
const clean=t=>kit.trimBoth(t.replace(/\x07\x08[^\0]*\0/g,'').replace(/\x07\x01([^\n\0]*)\n[^\0]*\0/g,'$1').replace(/\x07\x0c[^\0]*\0/g,'').replace(/\x07[\s\S]/g,'').replace(/[\0-\x09\x0b-\x1f]/g,'').replace(/\r\n?/g,'\n'));
function parse(buf){const t=messages(Buffer.isBuffer(buf)?buf:Buffer.from(buf));if(!t)return {lines:[],anchors:[]};const lines=[],anchors=[];
 for(const s of t.strings){const x=clean(s);if(!x)continue;if(kit.ascii(x)&&!/[ぁ-ゖ一-龯]/.test(x))anchors.push(x);else lines.push(x);}return {lines,anchors};}

/* ---- the game folder ---------------------------------------------------------------------------------------------- */
const EXEC=/(^|\/)exec(\.dat|\.bin)?$/i;
const archives=dir=>kit.files(dir,{name:/\.(dat|lib)$/i,subs:['','data']}).filter(f=>!!list(f));
/* is this folder a Malie game (library detection, kept cheap): a data*.dat / *.lib that opens, plain or with a known key */
const probe=dir=>kit.files(dir,{name:/^data\d*\.dat$|\.lib$/i,subs:['','data'],max:4}).some(f=>!!list(f));
function scenes(dir){const out=new Map();
 for(const a of archives(dir))for(const e of list(a)||[])if(EXEC.test(e.name))out.set('exec',{name:path.basename(a)+'/'+e.name,read:()=>read(a,e)});
 for(const f of kit.files(dir,{name:/^exec(\.dat|\.bin)?$/i,subs:['','data','data/system']}))out.set('exec',{name:path.basename(f),read:()=>fs.readFileSync(f)});
 if(!out.size)for(const exe of kit.files(dir,{name:/\.exe$/i,max:8})){const r=kit.peResource(exe,'EXEC');if(r&&messages(r)){out.set('exec',{name:path.basename(exe)+'/EXEC',read:()=>kit.peResource(exe,'EXEC')});break;}}
 return [...out.values()];}
const engine={id:'malie',hint:'data*.dat / *.lib（exec）',scenes,archives:scenes,sources:dir=>[...archives(dir),...kit.files(dir,{name:/^exec(\.dat|\.bin)?$/i,subs:['','data','data/system']})],parse:b=>{try{return parse(b);}catch{return {lines:[],anchors:[]};}},test:n=>/^exec(\.dat|\.bin)?$/i.test(n)};
module.exports={engine,parse,messages,clean,list,read,index,probe,schemes,camellia,cfi,readDec};
