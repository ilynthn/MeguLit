// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E585 Tmr-Hiro ADV System (Tmr-Hiro / HuneX-like small brands; ~40 company releases). Format references (read, not
   copied): GARbro ArcFormats/Tmr-Hiro/ArcPAC.cs (morkt, MIT) for the archive, VNTextPatch-net8
   Scripts/TmrHiroAdvSystem/TmrHiroAdvSystemCodeScript.cs (MIT) for the instruction stream, SExtractor extract_TmrHiro
   (GPL-3.0) for the "name,text,voice" message form.
     *.pac   no magic. i16 count, u8 name length, u32 data offset; entries {char name[n], offset, size} with u32 offsets
             (data offset == 7 + (n + 8) * count) or i64 offsets (n + 12); offsets are relative to the data offset
     script  an entry whose i16 at +4 is 6 and u32 at +6 is 0x00140050 (srp.pac): i32 record count, then records
             {u16 length (opcode + payload), u32 opcode, payload}; inside the archive every payload byte is nibble-swapped
             (rol 4), a loose .srp from a patch is plain
     text    message: opcode 0x00150050 or (opcode & 0xFFFF) == 0, payload = "name,text" / "text" / "name,text,voice",
             a literal \n is a line break; choice: opcode 0x00140010, payload = 3 bytes then repeated " d<choice>,<label>"
   Lines come in instruction order (name before its message), so a Chinese patch's .srp pairs 1:1. */
const kit=require('./kit.cjs');
const OP_CHOICE=0x00140010,OP_HEADER=0x00140050,OP_MSG=0x00150050;

/* [{name, offset, size}] of the script entries of a no-magic .pac, or null */
function list(file){const fsz=kit.size(file);if(fsz<16)return null;const h=kit.head(file,7);if(h.length<7)return null;
 const count=h.readInt16LE(0),nameLen=h[2],data=h.readUInt32LE(3);if(count<=0||count>100000||!nameLen||data>=fsz)return null;
 const idx7=7+(nameLen+8)*count,v=data===idx7?1:data===idx7+4*count?2:0;if(!v)return null;
 const idx=kit.readAt(file,7,data-7),rec=nameLen+(v===1?8:12),out=[];
 for(let i=0;i<count;i++){const p=i*rec,nb=idx.subarray(p,p+nameLen),z=nb.indexOf(0),name=kit.cname(nb);
  const offset=data+(v===1?idx.readUInt32LE(p+nameLen):Number(idx.readBigInt64LE(p+nameLen))),size=idx.readUInt32LE(p+nameLen+(v===1?4:8));
  if(!name||offset+size>fsz)return null;out.push({name,offset,size});}
 const scripts=out.filter(e=>{if(e.size<10)return false;const b=kit.readAt(file,e.offset,10);return b.readInt16LE(4)===6&&b.readUInt32LE(6)===OP_HEADER;});
 return scripts.length?scripts.map(e=>({...e,name:/\.srp$/i.test(e.name)?e.name:e.name+'.srp'})):null;}
const isPac=file=>{try{return !!list(file);}catch{return false;}};

/* walk the records: [{op, at (payload start), end}] */
function walk(buf){if(buf.length<10)return [];const n=buf.readInt32LE(0);if(n<=0||n>2e6)return [];
 return kit.records(buf,4,(b,p)=>{if(p+6>b.length)return null;const len=b.readUInt16LE(p);if(len<4)return null;const end=p+2+len;if(end>b.length)return null;return {next:end,op:b.readUInt32LE(p+2),at:p+6,end};},n);}
/* archive entries are decoded when read (swap every payload back); parse takes decoded bytes, as a loose patch file has them */
function swapped(buf,recs){const b=Buffer.from(buf);for(const r of recs)for(let i=r.at;i<r.end;i++)b[i]=((b[i]<<4)|(b[i]>>>4))&255;return b;}
const texts=(buf,recs)=>{const out=[];for(const r of recs){const body=buf.subarray(r.at,r.end);
 if(r.op===OP_MSG||(r.op&0xffff)===0)out.push({kind:'msg',body});else if(r.op===OP_CHOICE)out.push({kind:'choice',body:body.subarray(3)});}return out;};
/* a decoded message payload is Japanese (or Chinese) text, not binary: no control bytes */
const clean=t=>/^[\x20-\x7e　-鿿＀-￯ -⯿\s]*$/.test(t);
function decode(buf){const recs=walk(buf);if(!recs.length)return null;
 {const list=texts(buf,recs);if(!list.length)return null;
  const dec=kit.decoder(list.map(x=>x.body)),lines=[];let ok=0,bad=0;
  for(const x of list){const t=dec.decode(x.body);
   if(x.kind==='choice'){for(const m of t.matchAll(/ d(.+?),(\w+)/g))lines.push(m[1]);continue;}
   if(!clean(t)){bad++;continue;}ok++;
   const parts=t.split(',');let name=null,text=t;if(parts.length>1){name=parts[0];text=parts[1];}
   text=kit.trimBoth(text.replace(/\\n/g,'\n'));if(name&&name.trim())lines.push(name.trim());if(text)lines.push(text);}
  if(ok&&bad<=ok)return lines;}
 return null;}
const parse=buf=>({lines:decode(buf)||[],anchors:[]});

const engine=kit.engine({id:'tmrhiro',hint:'srp.pac（*.srp）',
 archives:{name:/\.pac$/i,list,read:(f,e)=>{const b=kit.readAt(f,e.offset,e.size),recs=walk(b);return recs.length?swapped(b,recs):b;}},
 loose:{name:/\.srp$/i,subs:['','srp']},parse,test:n=>/\.srp$/i.test(n)});
module.exports={engine,parse,list,isPac,walk};
