// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E565 Majiro (Majiro Script Engine: 夏ノ雨, 恋する乙女と守護の楯, Chu×Chu!, many Maika / Lass / ensemble titles).
   Format references (read, not copied): GARbro ArcFormats/Majiro/ArcMajiro.cs (morkt, MIT) for the archive, and
   MajiroTools (AtomCrafty, MIT: src/MajiroLib/Script/{Disassembler,Opcode,Crc}.cs) for the script bytecode.

   scenario.arc  "MajiroArcV1.000\0" | V2 | V3, u32 count, u32 names offset, u32 data offset, then count entries
                 V1 {u32 hash, u32 offset} (+1 terminating entry, size = next offset - offset)
                 V2 {u32 hash, u32 offset, u32 size}   V3 {u64 hash, u32 offset, u32 size}
                 and the NUL-terminated cp932 names, in entry order.
   *.mjo         "MajiroObjV1.000\0" (plain) or "MajiroObjX1.000\0" (bytecode XOR'd with the CRC-32 table as 1024
                 little-endian bytes), u32 entry point, u32 read-mark size, u32 function count, count x {u32 hash,
                 u32 offset}, u32 bytecode size, bytecode.
   Bytecode is u16 opcodes with fixed operand encodings (the table below). A message is the run of `text` (0x840)
   fragments up to `proc` (0x841) or a page/wait control (`ctrl` 0x842 "p"/"w"/"r"); `ctrl "n"` is a line break inside
   it. Non-ASCII `ldstr` (0x801) strings are speaker names and choice labels; ASCII ones (file names, labels) are
   anchors. The opcode walk is exact, so a byte that merely looks like 0x840 inside an operand is never read as text. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');

/* ---- CRC-32 key ------------------------------------------------------------------------------------------------ */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let v=n;for(let k=0;k<8;k++)v=v&1?(v>>>1)^0xEDB88320:v>>>1;t[n]=v>>>0;}return t;})();
const KEY=(()=>{const b=Buffer.alloc(1024);for(let i=0;i<256;i++)b.writeUInt32LE(CRC[i],i*4);return b;})();
function crypt(buf,offset=0){const out=Buffer.from(buf);for(let i=0;i<out.length;i++)out[i]^=KEY[(offset+i)&0x3ff];return out;}
function hash32(bytes){let r=0xffffffff;for(const b of bytes)r=(r>>>8)^CRC[(r^b)&255];return (~r)>>>0;}

/* ---- archive --------------------------------------------------------------------------------------------------- */
const sj=kit.SJIS;
function arcList(b){
 if(!b||b.length<0x1c||b.toString('latin1',0,10)!=='MajiroArcV'||b.toString('latin1',11,16)!=='.000\0')return null;
 const version=b[10]-0x30;if(version<1||version>3)return null;
 const count=b.readInt32LE(16),namesAt=b.readUInt32LE(20),dataAt=b.readUInt32LE(24);
 if(count<=0||count>200000||dataAt<=namesAt||dataAt>b.length)return null;
 const entry=4*(version+1),hashSize=version<3?4:8;
 if((count+(version===1?1:0))*entry+0x1c!==namesAt)return null;
 const out=[];let np=namesAt;
 for(let i=0;i<count;i++){const z=b.indexOf(0,np);if(z<0||z>=dataAt)return null;const name=sj.decode(b.subarray(np,z));np=z+1;
  const at=0x1c+i*entry,offset=b.readUInt32LE(at+hashSize);
  const size=version===1?b.readUInt32LE(at+entry+hashSize)-offset:b.readUInt32LE(at+hashSize+4);
  if(offset<dataAt||size<0||offset+size>b.length)return null;out.push({name,offset,size});}
 return out;}

/* ---- script ---------------------------------------------------------------------------------------------------- */
/* operand encodings by opcode (MajiroTools Opcode.cs): t type list, s string, f flags, h hash, o var offset, 0 address
   placeholder, i int, r float, a arg count, j jump, l line, c switch table */
const ENC=new Map();
(()=>{const bin=[0x100,0x108,0x110,0x118,0x120,0x128,0x130,0x138,0x140,0x148,0x150,0x158,0x160,0x168,0x170,0x178,0x180,0x188];
 for(const b of bin)for(let k=0;k<6;k++)ENC.set(b+k,'');
 for(const v of [0x190,0x198,0x1a0,0x1a1,0x191,0x1a8,0x1a9])ENC.set(v,'');
 for(let b=0x1b0;b<=0x200;b+=8)for(let k=0;k<6;k++)ENC.set(b+k,'fho');
 for(let b=0x210;b<=0x260;b+=8)for(let k=0;k<6;k++)ENC.set(b+k,'fho');
 for(let b=0x270;b<=0x2c0;b+=8)for(let k=0;k<3;k++)ENC.set(b+k,'fho');
 for(let b=0x2d0;b<=0x320;b+=8)for(let k=0;k<3;k++)ENC.set(b+k,'fho');
 const one={0x800:'i',0x801:'s',0x802:'fho',0x803:'r',0x80f:'h0a',0x810:'h0a',0x829:'t',0x82b:'',0x82c:'j',0x82d:'j',0x82e:'j',0x82f:'',
  0x830:'j',0x831:'j',0x832:'j',0x833:'j',0x838:'j',0x839:'j',0x834:'ha',0x835:'ha',0x836:'t',0x837:'fho',0x83a:'l',0x83b:'j',0x83c:'j',0x83d:'j',
  0x83e:'',0x83f:'',0x840:'s',0x841:'',0x842:'s',0x843:'j',0x844:'',0x845:'j',0x846:'',0x847:'j',0x850:'c'};
 for(const [k,v] of Object.entries(one))ENC.set(+k,v);})();
const OP={LDSTR:0x801,TEXT:0x840,PROC:0x841,CTRL:0x842};

function objHeader(b){
 if(!b||b.length<32)return null;const sig=b.toString('latin1',0,16);
 const enc=sig==='MajiroObjX1.000\0',plain=sig==='MajiroObjV1.000\0';if(!enc&&!plain)return null;
 const fc=b.readInt32LE(24);if(fc<0||fc>100000)return null;const at=28+fc*8;if(at+4>b.length)return null;
 const size=b.readUInt32LE(at);if(at+4+size>b.length)return null;
 return {encrypted:enc,code:enc?crypt(b.subarray(at+4,at+4+size)):Buffer.from(b.subarray(at+4,at+4+size))};}

/* Instructions that carry strings, in order: {op, bytes}. Stops quietly at the first unknown opcode (a damaged or
   unfamiliar script keeps what was read up to there). */
/* E573 through kit.opcodeWalk: Majiro's operand letters map to kit widths (f h o 0 i r a j l: fixed bytes) */
const WIDTH={f:2,h:4,o:2,'0':4,i:4,r:4,a:2,j:4,l:2},KIT=new Map([...ENC].map(([op,e])=>[op,[...e].map(c=>WIDTH[c]??c)]));
function strings(code){const out=[];kit.opcodeWalk(code,op=>KIT.get(op),(op,strs)=>{for(const b of strs)out.push({op,bytes:b});if(op===OP.PROC)out.push({op,bytes:null});});return out;}

/* one encoding per script (kit.codepage: SJIS originals, GBK patches) */
function pickDecoder(list){const all=Buffer.concat(list.filter(x=>x.bytes&&x.bytes.some(c=>c>=0x80)).map(x=>x.bytes));return all.length&&kit.codepage(all)==='gbk'?new TextDecoder('gbk'):sj;}
const PATHY=/[\\/.:]|^[$#@]/;
function parse(buf){
 const h=objHeader(Buffer.isBuffer(buf)?buf:Buffer.from(buf));if(!h)return {lines:[],anchors:[]};
 const list=strings(h.code),dec=pickDecoder(list),lines=[],anchors=[];let msg='';
 const flush=()=>{const t=msg.replace(/^[\s　]+|[\s　]+$/g,'');if(t)lines.push(t);msg='';};
 for(const x of list){
  if(x.op===OP.TEXT){msg+=dec.decode(x.bytes);continue;}
  if(x.op===OP.PROC){flush();continue;}
  if(x.op===OP.CTRL){const c=dec.decode(x.bytes);if(c==='n')msg+='\n';else if(/^[pwr]$/.test(c))flush();continue;}
  if(x.op===OP.LDSTR){const raw=x.bytes;if(!raw.length)continue;
   if(!raw.some(c=>c>=0x80)){anchors.push(raw.toString('latin1'));continue;}
   const s=dec.decode(raw).trim();if(s&&!PATHY.test(s)){flush();lines.push(s);}}}
 flush();return {lines,anchors};}

/* ---- engine ---------------------------------------------------------------------------------------------------- */
const MJO=n=>/\.mjo$/i.test(n);
const head=kit.head;
function archives(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}
 return names.filter(n=>/\.arc$/i.test(n)).map(n=>path.join(dir,n)).filter(f=>head(f,10).toString('latin1')==='MajiroArcV')
  /* scenario.arc first, then update / patch archives, which the engine lets override it */
  .sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b));}
const rank=f=>/^scenario\.arc$/i.test(path.basename(f))?0:/^scenario/i.test(path.basename(f))?1:2;
function scenesIn(file){let b;try{b=fs.readFileSync(file);}catch{return [];}const es=arcList(b);if(!es)return [];
 return es.filter(e=>MJO(e.name)).map(e=>({name:e.name,read:()=>b.subarray(e.offset,e.offset+e.size)}));}
function loose(dir){const out=[];for(const d of [dir,path.join(dir,'scenario')]){let names;try{names=fs.readdirSync(d);}catch{continue;}for(const n of names)if(MJO(n))out.push(path.join(d,n));}return out;}
const engine={
 id:'majiro',hint:'scenario.arc（.mjo）',
 scenes(dir){const out=new Map();for(const a of archives(dir))for(const s of scenesIn(a))out.set(s.name.toLowerCase(),s);
  for(const f of loose(dir))out.set(path.basename(f).toLowerCase(),{name:path.basename(f),read:()=>fs.readFileSync(f)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>archives(dir).flatMap(scenesIn),
 sources:dir=>[...archives(dir),...loose(dir)],
 parse,test:MJO,
};
module.exports={engine,parse,arcList,objHeader,strings,crypt,hash32,KEY,ENC,OP};
