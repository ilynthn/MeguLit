// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E571 codeX RScript — Liar-soft's engine (also raiL-soft, Studio Ubai, SUKARADOG …: 腐り姫, 赫炎のインガノック,
   誰ソ彼のシェイプシフター, 蛟の巫女). VNDB tags ~211 company releases, 91 since 2016.
   Format references (read, not copied): GARbro ArcFormats/Liar/ArcXFL.cs (morkt, MIT) for the archive and
   TesterTesterov/gscScriptCompAndDecompiler (GPL-3.0) for the script.
     *.xfl   "LB\x01\0", u32 index size, u32 count, count × {char name[32] cp932, u32 offset (from 12 + index size),
             u32 size}; an entry that is itself an .xfl with the signature is a folder
     *.gsc   i32 file size, i32 header size, i32 command section size, i32 string-offset section size, i32 string
             section size, … then the header's other fields; commands; i32 offsets (relative to the string section);
             the NUL-terminated cp932 strings. "^n" is a line break, other ^x codes are display codes.
   The compiler stores strings in the order the script uses them (MESSAGE's speaker and text, choices, labels), so the
   string table in order is the script's text in order, and the reader does not depend on the per-title command set
   (the decompiler's command table differs between titles). ASCII strings (file and directory names) are anchors.
   Built on kit.cjs (E573): the XFL index is a kit table, the strings a kit string table. */
const kit=require('./kit.cjs');
const SIG='LB\x01\0';
/* the entries of an .xfl, folders flattened ("sub.xfl/0002.gsc"); offsets are absolute in the outer file */
function xflList(file){
 const dir=(base,prefix,depth)=>{const h=kit.readAt(file,base,12);if(h.length<12||h.toString('latin1',0,4)!==SIG)return null;
  const idx=h.readUInt32LE(4),count=h.readUInt32LE(8),t=kit.readAt(file,base+12,Math.min(idx,count*40));const data=base+12+idx,out=[];
  for(let i=0;i<count&&(i+1)*40<=t.length;i++){const z=t.indexOf(0,i*40),name=kit.SJIS.decode(t.subarray(i*40,z<0||z>i*40+32?i*40+32:z)),offset=data+t.readUInt32LE(i*40+32),len=t.readUInt32LE(i*40+36),full=prefix?prefix+'/'+name:name;
   if(/\.xfl$/i.test(name)&&depth<4&&kit.readAt(file,offset,4).toString('latin1')===SIG){const sub=dir(offset,full,depth+1);if(sub){out.push(...sub);continue;}}
   out.push({name:full,offset,size:len});}
  return out;};
 const out=dir(0,'',0),size=kit.size(file);return out&&out.every(e=>e.offset+e.size<=size)?out:null;}
/* the string table of a .gsc, in order, or null */
function gscStrings(b){if(b.length<20)return null;
 const head=b.readInt32LE(4),cmd=b.readInt32LE(8),decl=b.readInt32LE(12),def=b.readInt32LE(16);
 if(head<20||head>256||cmd<0||decl<0||def<0||decl%4||head+cmd+decl+def>b.length)return null;
 /* the file size field is the whole file (some files carry trailing zeros, never less) */
 if(b.readInt32LE(0)>b.length||b.readInt32LE(0)<head+cmd+decl+def)return null;
 const base=head+cmd+decl,list=kit.stringTable(b,{offsetsAt:head+cmd,count:decl/4,base,limit:base+def});
 return list.length===decl/4?list:null;}
const clean=t=>kit.trimBoth(t.replace(/\^n/g,'\n').replace(/\^[a-zA-Z]/g,''));
function parse(buf){const list=gscStrings(buf);if(!list)return {lines:[],anchors:[]};const dec=kit.decoder(list),lines=[],anchors=[];
 for(const s of list){if(!s.length)continue;if(!s.some(c=>c>=0x80)){anchors.push(s.toString('latin1'));continue;}const t=clean(dec.decode(s));if(t)lines.push(t);}
 return {lines,anchors};}
const engine=kit.engine({id:'liar',hint:'scr.xfl（*.gsc）',
 archives:{name:/\.xfl$/i,magic:SIG,list:f=>{const l=xflList(f);return l&&l.some(e=>/\.gsc$/i.test(e.name))?l:null;},entry:/\.gsc$/i},
 loose:{name:/\.gsc$/i,subs:['','scr']},parse});
module.exports={engine,parse,xflList,gscStrings,SIG};
