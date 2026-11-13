// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E595 LC-ScriptEngine — TacticsNet's engine (lcsebody.exe: 近衛騎士ラティス, 無限錬姦 …; ~41 releases). Family A
   (string pool, docs/engine-families.md).
   Format references: cqjjjzr/LCSELocalizationTools (Apache-2.0) LCSERawSNXScript.kt / LCSESNXParser.kt /
   LCSEParsedScript.kt, crass LC-ScriptEngine.txt (format notes). Research: engine-readers-e.
     <pack>.lst  index for the extension-less data file <pack> (lcsebody1, SoundPackSEVo …): u32 count, count × 76 bytes
                 {u32 offset, u32 length, char name[64], u32 type}; dwords XOR key × 0x01010101 and name bytes XOR key
                 (key 1 in old titles, 2 in newer ones; found from 4 + 76 × count = file size). type 1 = SNX, 2 BMP,
                 3 PNG, 4 WAV, 5 OGG; names carry no extension.
     SNX         every byte XOR a key (2 old, 3 newer; found from the header: 8 + 12 × n + string bytes = size; a patch
                 may store it plain): u32 instruction count n, u32 string table size, n × {u32 op, u32 p1, u32 p2},
                 string table {u32 length (with NUL), bytes}. op 0x11 p1 2 pushes the string at table byte offset p2;
                 op 0x0D p1 0x2C shows the top string; op 0x0D p1 0x4F pops two choices.
   A shown string is "speaker\x01text\x01text…" (\x01 a line break, optional trailing \x02\x03). Lines come in
   instruction order; a patch rewrites only the string table (offsets recomputed), so it pairs 1:1. */
const kit=require('./kit.cjs'),path=require('node:path');
const PUSH=0x11,SHOW=0x0d,TEXT=0x2c,CHOICE=0x4f;
/* the .lst entries (offsets in the data file) or null */
function lst(file){const b=kit.readAt(file,0,Math.min(kit.size(file),8<<20));if(b.length<80)return null;
 for(const k of [1,2,...Array.from({length:256},(_,i)=>i).filter(i=>i>2),0]){const kk=(k*0x01010101)>>>0,n=(b.readUInt32LE(0)^kk)>>>0;if(4+76*n!==b.length||!n)continue;const out=[];
  for(let i=0;i<n;i++){const p=4+76*i,raw=b.subarray(p+8,p+72),nb=[];for(const c of raw){const x=c^k;if(!c||!x)break;nb.push(x);}
   out.push({name:kit.SJIS.decode(Buffer.from(nb)),offset:(b.readUInt32LE(p)^kk)>>>0,size:(b.readUInt32LE(p+4)^kk)>>>0,type:(b.readUInt32LE(p+72)^kk)>>>0});}
  if(out.every(e=>e.name))return out;}
 return null;}
const pack=lstFile=>lstFile.replace(/\.lst$/i,'');
function list(lstFile){const l=lst(lstFile),data=pack(lstFile),size=kit.size(data);if(!l||size<0)return null;const snx=l.filter(e=>e.type===1&&e.offset+e.size<=size);
 return snx.length?snx.map(e=>({...e,name:e.name+'.snx'})):null;}
const read=(lstFile,e)=>kit.readAt(pack(lstFile),e.offset,e.size);
/* the SNX decrypted (key found from the header), or null */
function plain(b){if(b.length<8)return null;for(const k of [0,2,3,...Array.from({length:256},(_,i)=>i).filter(i=>i>3)]){const kk=(k*0x01010101)>>>0,n=(b.readUInt32LE(0)^kk)>>>0,s=(b.readUInt32LE(4)^kk)>>>0;
 if(n<1e6&&8+12*n+s===b.length)return k?kit.xor(b,k):b;}return null;}
/* {kind:'say'|'choice', bytes} in instruction order */
function shown(d){const n=d.readUInt32LE(0),base=8+12*n,strs=new Map();
 for(let p=base;p+4<=d.length;){const len=d.readUInt32LE(p);if(p+4+len>d.length)break;strs.set(p-base,d.subarray(p+4,p+4+len));p+=4+len;}
 const stack=[],out=[];for(let i=0;i<n;i++){const o=8+i*12,op=d.readUInt32LE(o),p1=d.readUInt32LE(o+4),p2=d.readUInt32LE(o+8);
  if(op===PUSH&&p1===2){stack.push(strs.get(p2)||null);continue;}
  if(op===SHOW&&p1===TEXT&&p2===0){const s=stack.pop();if(s)out.push({kind:'say',bytes:s});continue;}
  if(op===SHOW&&p1===CHOICE&&p2===0){const b2=stack.pop(),b1=stack.pop();for(const s of [b1,b2])if(s)out.push({kind:'choice',bytes:s});}}
 return out;}
const z=b=>{const e=b.indexOf(0);return e<0?b:b.subarray(0,e);};
const clean=t=>kit.trimBoth(t.replace(/\x02\x03$/,'').replace(/\x01/g,'\n'));
function parse(buf){const d=plain(buf);if(!d)return {lines:[],anchors:[]};const list=shown(d),dec=kit.decoder(list.map(x=>z(x.bytes))),lines=[];
 for(const x of list){const t=dec.decode(z(x.bytes));if(x.kind==='say'){const at=t.indexOf('\x01');if(at>0){const name=kit.trimBoth(t.slice(0,at)),body=clean(t.slice(at+1));if(name)lines.push(name);if(body)lines.push(body);continue;}}
  const c=clean(t);if(c)lines.push(c);}
 return {lines,anchors:[]};}
const engine=kit.engine({id:'lcse',hint:'lcsebody.lst（*.snx）',
 archives:{name:/\.lst$/i,list,read,entry:/\.snx$/i},
 loose:{name:/\.snx$/i,subs:['','snx','patch']},parse});
module.exports={engine,parse,lst,list,read,plain,shown};
