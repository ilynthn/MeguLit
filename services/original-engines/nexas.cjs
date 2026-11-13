// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E577 NeXAS (GIGA / Team BALDRHEAD: BALDR SKY, BALDR HEART, 天結いキャッスルマイスター, 真恋姫†英雄譚, ソーマリング …;
   VNDB ~197 company releases, 147 since 2016). Format references (read, not copied):
     GARbro ArcFormats/Nexas/ArcPAC.cs (morkt, MIT), zbspac PackageFormat.txt and ScriptUnpacker.c (CloudiDust, BSD-2),
     akiWagashi/GIGA_NeXAS (pack type 7 = zstd), Yggdrasill-Moe/Niflheim giga_text_dump.py and regomne/chinesize
     NeXAs/extTxtFromBin.py (the .bin string table), SakuraSymphonyReTranslation DC3PS-NeXAS-Script-Tool (the "VER"
     header of newer builds, length-prefixed UTF-8 strings, the (0,name)(5,1)(0,message) speaker pattern, @ codes).
   *.pac   "PAC" + a byte that is not ' ' (Softpal) or 'K'; u32 count; u32 pack type (0 none, 1 LZSS, 2 Huffman, 3 zlib,
           4 zlib unless size = unpacked, 7 zstd: newer titles). Index: old builds at 0xC, count × {name[0x20|0x40],
           u32 offset, u32 unpacked, u32 size}; newer ones at the end: the last u32 is its size, the bytes before it
           are NOT'ed, then static-Huffman coded (count × 0x4C, names 0x40, cp932).
   *.bin   compiled scenario: [u32 version, only in newer builds] u32 code count, count × {u32 op, u32 arg}, u32 string
           count, the cp932 C strings; then more tables. Builds with a "VER" header carry two code sections and
           length-prefixed strings. Op 0 pushes a string by index; (0,name)(5,1)(0,message) gives a speaker.
   The string table in order is the scenario's text in order (each message once, as the compiler emits them), so a
   patch that rewrites the table pairs line by line. Text codes: @v<voice> @h<face> @t<time> @k @d @g are display
   codes, @n a line break, @r<base>@<ruby>@ ruby (the base is kept). Built on kit.cjs. */
const path=require('node:path'),kit=require('./kit.cjs');

/* ---- PAC ---------------------------------------------------------------------------------------------------------- */
function index(file){const size=kit.size(file);if(size<16)return null;const h=kit.readAt(file,0,12);
 if(h.toString('latin1',0,3)!=='PAC'||h[3]===0x20||h[3]===0x4b)return null;const count=h.readUInt32LE(4),type=h.readUInt32LE(8);if(!count||count>200000)return null;
 const entries=(buf,at,nameLen)=>{const out=[],step=nameLen+12;if(at+count*step>buf.length)return null;
  for(let i=0;i<count;i++){const p=at+i*step,z=buf.indexOf(0,p),nb=buf.subarray(p,z<0||z>p+nameLen?p+nameLen:z);if(!nb.length||nb[0]<0x20)return null;
   const e={name:kit.SJIS.decode(nb).replace(/\\/g,'/'),offset:buf.readUInt32LE(p+nameLen),unpacked:buf.readUInt32LE(p+nameLen+4),size:buf.readUInt32LE(p+nameLen+8),type};
   if(!e.name.trim()||e.offset<12||e.offset+e.size>size)return null;out.push(e);}
  return out;};
 /* old builds: the index right after the header */
 const head=kit.readAt(file,12,Math.min(size-12,count*0x4c));for(const n of [0x20,0x40]){const l=entries(Buffer.concat([Buffer.alloc(12),head]),12,n);if(l)return l;}
 /* newer builds: the Huffman-coded index at the end */
 const isz=kit.readAt(file,size-4,4).readUInt32LE(0);if(isz<8||isz>=size-12||isz>count*0x4c*2)return null;
 try{const raw=kit.not(kit.readAt(file,size-4-isz,isz)),idx=kit.huffman(raw,count*0x4c,{order:'msb'});return entries(idx,0,0x40);}catch{return null;}}
const listed=new Map();
function list(file){const key=file+'|'+kit.size(file);if(!listed.has(key))listed.set(key,index(file));return listed.get(key);}
function read(file,e){const b=kit.readAt(file,e.offset,e.size);if(!e.type||e.size===e.unpacked&&e.type!==1&&e.type!==2)return b;
 switch(e.type){case 1:return kit.lzss(b,e.unpacked);case 2:return kit.huffman(b,e.unpacked,{order:'msb'});case 3:case 4:return kit.inflate(b);
  default:return kit.unpackAny(b,Math.max(e.unpacked,1))||b;}}

/* ---- .bin --------------------------------------------------------------------------------------------------------- */
const u32=(b,p)=>p+4<=b.length?b.readUInt32LE(p):-1;
/* the string table: {strings: [Buffer], codes: [[op,arg]], utf8} or null. Layouts tried: "VER" header, version + codes,
   bare codes (the oldest, BALDR SKY) */
function table(b){if(!b||b.length<12)return null;
 const cstrs=(at)=>{const n=u32(b,at);if(n<1||n>200000)return null;const out=[];let p=at+4;for(let i=0;i<n;i++){const z=b.indexOf(0,p);if(z<0)return null;out.push(b.subarray(p,z));p=z+1;}return {strings:out,end:p};};
 const pstrs=(at)=>{const n=u32(b,at);if(n<1||n>200000)return null;const out=[];let p=at+4;for(let i=0;i<n;i++){const l=u32(b,p);if(l<1||p+4+l>b.length)return null;out.push(b.subarray(p+4,p+4+l-1));p+=4+l;}return {strings:out,end:p};};
 const codes=(at)=>{const n=u32(b,at);if(n<0||n>(b.length-at)/8)return null;const out=[];for(let i=0;i<n;i++)out.push([b.readUInt32LE(at+4+i*8),b.readUInt32LE(at+8+i*8)]);return {codes:out,end:at+4+n*8};};
 const sane=t=>t&&t.strings.length&&t.strings.some(s=>s.some(c=>c>=0x80));
 let ver=-1;if(b.toString('latin1',0,3)==='VER')ver=9;else if(b[0]===9&&b.toString('latin1',4,7)==='VER')ver=13;
 if(ver>0){const unk=u32(b,ver);if(unk<0||unk>100000)return null;const a=codes(ver+4+unk*4);if(!a)return null;const c=codes(a.end);if(!c)return null;
  const t=pstrs(c.end);return sane(t)?{strings:t.strings,codes:c.codes,utf8:true}:null;}
 /* a small version word first (BALDR HEART and later), else the code count itself */
 for(const at of b.readUInt32LE(0)<0x100&&b.readUInt32LE(4)>2?[4,0]:[0]){const c=codes(at);if(!c)continue;const t=cstrs(c.end);if(sane(t))return {strings:t.strings,codes:c.codes,utf8:false};}
 return null;}
/* speakers: the string pushed before (5,1) and the message pushed after it */
function speakers(codes,n){const s=new Set();for(let i=0;i+2<codes.length;i++)if(codes[i][0]===0&&codes[i+1][0]===5&&codes[i+1][1]===1&&codes[i+2][0]===0&&codes[i][1]<n)s.add(codes[i][1]);return s;}
const clean=t=>kit.trimBoth(t.replace(/@[rR]([^@]*)@[^@]*@/g,'$1').replace(/@・@/g,'').replace(/@v[\w-]+/g,'').replace(/@h[\w-]+/g,'').replace(/@t\d+/g,'').replace(/@n/g,'\n').replace(/@[kdgb]/g,''));
function parse(buf){const t=table(buf);if(!t)return {lines:[],anchors:[]};
 const dec=t.utf8?new TextDecoder('utf-8'):kit.decoder(t.strings),lines=[],anchors=[],names=speakers(t.codes,t.strings.length),who=[];
 t.strings.forEach((s,i)=>{if(!s.length)return;if(!s.some(c=>c>=0x80)){anchors.push(s.toString('latin1'));return;}const x=clean(dec.decode(s));if(!x)return;if(names.has(i))who.push(x);lines.push(x);});
 return {lines,anchors,speakers:who};}

/* update*.pac sorts after script.pac, so a patched script replaces the original (kit.engine keeps the last one) */
const engine=kit.engine({id:'nexas',hint:'script.pac（*.bin）',
 archives:{name:/^(script|update\d*)\.pac$/i,list:f=>{const l=list(f);return l&&l.some(e=>/\.bin$/i.test(e.name))?l:null;},read,entry:/\.bin$/i},
 loose:{name:/\.bin$/i,subs:['script']},parse});
module.exports={engine,parse,list,read,table,clean,index};
