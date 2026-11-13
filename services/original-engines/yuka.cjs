// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 Yuka System (Hourai, あかべぇそふとつぅ's sister brands, Lose, Shallot …; ~66 releases). Family A (string pool,
   docs/engine-families.md).
   Format references: GARbro ArcFormats/Yuka/ArcYKC.cs (morkt, MIT) for the archive; AtomCrafty/yukatool2 (GPL-3.0)
   Script/Binary/Disassembler.cs, Script/Data/DataElement.cs, Script/Data/StringExternalizer.cs, IO/Options.cs for the
   script.
     *.ykc   "YKC001" (cp932 names) / "YKC002" (UTF-8 names); u32 index offset @0x10, u32 index length @0x14; index
             entries 0x14 bytes {u32 name offset, u32 name length, u32 offset, u32 size, u32 0}.
     *.yks   "YKS001", i16 encrypted, i32 header length, u32, u32 code offset, u32 code count, u32 index offset, u32
             index count, u32 data offset, u32 data length, …. When encrypted the data section is XOR 0xAA. The code is a
             list of dwords, each an index into the element table {u32 type, u32 f1, u32 f2, u32 f3}: type 0 Func (name at
             data f1; the next dword is the argument count, then the arguments), 1 Ctrl (a label), 4 CInt, 5 CStr (value
             at data f2), 7 SStr / 8 VInt / 9 VStr / 10 VLoc (assignment targets).
   Shown text is the string-constant arguments of StrOut / StrOutNW (lines) and NameOut / StrOutNWC (speakers), the
   methods yukatool2 externalises for translation; lines come in code order, so a patch that rewrites the data section
   pairs 1:1. Choice menus are not described in public sources (no lines from them yet). */
const kit=require('./kit.cjs');
const LINE=new Set(['StrOut','StrOutNW']),NAME=new Set(['NameOut','StrOutNWC']);
function ykc(file){const h=kit.head(file,0x18);if(h.length<0x18||h.toString('latin1',0,4)!=='YKC0')return null;const ver=h.toString('latin1',4,6);if(ver!=='01'&&ver!=='02')return null;
 const at=h.readUInt32LE(0x10),len=h.readUInt32LE(0x14),size=kit.size(file),count=Math.floor(len/0x14);if(at+len>size||!count||count>500000)return null;
 const idx=kit.readAt(file,at,len),dec=new TextDecoder(ver==='01'?'shift_jis':'utf-8'),out=[];
 for(let i=0;i<count;i++){const p=i*0x14,no=idx.readUInt32LE(p),nl=idx.readUInt32LE(p+4),offset=idx.readUInt32LE(p+8),sz=idx.readUInt32LE(p+12);if(offset+sz>size||no+nl>size||nl>1024)return null;
  const nb=kit.readAt(file,no,nl),z=nb.indexOf(0);out.push({name:dec.decode(z<0?nb:nb.subarray(0,z)).replace(/\\/g,'/'),offset,size:sz});}
 return out;}
/* {kind:'name'|'say', bytes} in code order, or null */
function shown(b){if(b.length<0x30||b.toString('latin1',0,6)!=='YKS001')return null;const u=o=>b.readUInt32LE(o);
 const enc=b.readInt16LE(6),codeAt=u(0x10),codeN=u(0x14),idxAt=u(0x18),idxN=u(0x1C),dataAt=u(0x20),dataLen=u(0x24);
 if(codeAt+codeN*4>b.length||idxAt+idxN*16>b.length||dataAt+dataLen>b.length)return null;
 const data=enc===1?kit.xor(b.subarray(dataAt,dataAt+dataLen),0xaa):b.subarray(dataAt,dataAt+dataLen);
 const el=k=>{if(k>=idxN)return null;const p=idxAt+k*16;return {type:u(p),f1:u(p+4),f2:u(p+8),f3:u(p+12)};},code=k=>u(codeAt+k*4),out=[];
 for(let i=0;i<codeN;i++){const e=el(code(i));if(!e)return out;if(e.type!==0)continue;
  const argc=i+1<codeN?code(++i):0,name=kit.cstr(data,e.f1)?.toString('latin1')||'',kind=LINE.has(name)?'say':NAME.has(name)?'name':null;
  for(let j=0;j<argc&&i+1<codeN;j++){const a=el(code(++i));if(kind&&a&&a.type===5){const s=kit.cstr(data,a.f2);if(s&&s.length)out.push({kind,bytes:s});}}}
 return out;}
const clean=t=>kit.trimBoth(t.replace(/\r\n|\r/g,'\n'));
function parse(buf){const list=shown(buf);if(!list)return {lines:[],anchors:[]};const dec=kit.decoder(list.map(x=>x.bytes)),lines=[];
 for(const x of list){const t=clean(dec.decode(x.bytes));if(t)lines.push(t);}return {lines,anchors:[]};}
const YKS=/\.yks$/i;
const engine=kit.engine({id:'yuka',hint:'*.ykc（*.yks）',
 archives:{name:/\.ykc$/i,magic:'YKC0',list:f=>{const l=ykc(f);return l&&l.some(e=>YKS.test(e.name))?l:null;},entry:YKS},
 loose:{name:YKS,subs:['','yks','patch']},parse});
module.exports={engine,parse,ykc,shown,LINE,NAME};
