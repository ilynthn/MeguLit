// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E568 Softpal ADV System (AMUSE CRAFT, Unison Shift / ユニゾンシフト：ブロッサム, Pulltop's sister brands …).
   Format references (read, not copied): SoftPal-Tool by luoyily (GPL-3.0: pac_unpack.py, pal_file_decrypt.py,
   pal_script_tool.py) and GARbro ArcFormats/Softpal (morkt, MIT).
     data.pac   "PAC " u32 0, u32 count; entries from 0x804, 40 bytes each {char name[32], u32 size, u32 offset}
     TEXT.DAT   "$TEXT_LIST__" u32 count, then entries {u32 index, cp932 text\0}; when the first byte is "$" the
                body is encrypted: from byte 16, per dword, the first byte is rotated left by (4 + n) % 8 and the dword
                XOR'd with 0x084DF873 ^ 0xFF987DEE (the last dword before the end is left as is)
     SCRIPT.SRC "Sv20" bytecode; a message is the 32-byte block whose dword at +24 is 17 00 01 00 followed by
                {02|0f|10|11|12|13|14} 00 02 00: +4 text offset, +12 name offset (0x0FFFFFFF: no name); a choice is
                the 16-byte block with 17 00 01 00 02 00 06 00 at +8: +4 text offset. Offsets point into TEXT.DAT.
   Lines come in script order (name before its message), so a Chinese patch's SCRIPT.SRC + TEXT.DAT pair 1:1. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');
/* E573 the PAC index is a kit table */
const PAC={magic:'PAC ',count:{at:8,type:'u32le'},entries:0x804,fields:[{name:'name',type:'cstr',size:32},{name:'size',type:'u32le'},{name:'offset',type:'u32le'}]};
const pacList=file=>{const l=kit.table(file,PAC);return l&&l.length?l:null;};
const pacRead=kit.entryRead;

function decryptText(buf){const d=Buffer.from(buf);if(d[0]!==0x24)return d;let shift=4;
 for(let i=16;i<d.length-4;i+=4){d[i]=kit.rol(d[i],shift);d.writeUInt32LE((d.readUInt32LE(i)^0x084DF873^0xFF987DEE)>>>0,i);shift++;}
 return d;}
/* offset -> raw text bytes */
function textTable(buf){const d=decryptText(buf);if(d.toString('latin1',1,12)!=='TEXT_LIST__')return null;/* a re-packed (plain) TEXT.DAT has 0 for the "$" */const out=new Map();let p=16;
 while(p+4<=d.length){const e=d.indexOf(0,p+4);const end=e<0?d.length:e;out.set(p,d.subarray(p+4,end));p=end+1;}return out;}
/* {kind:'say'|'choice', text, name} offsets in script order */
function scriptRefs(src){const out=[];if(src.toString('latin1',0,2)!=='Sv')return out;
 for(let i=0;i+8<=src.length;i+=4){if(src[i]!==0x17||src[i+1]!==0||src[i+2]!==1||src[i+3]!==0)continue;const lo=src.readUInt16LE(i+4),hi=src.readUInt16LE(i+6);
  if(hi===2&&[0x02,0x0f,0x10,0x11,0x12,0x13,0x14].includes(lo)&&i>=24){const at=i-24,name=src.readUInt32LE(at+12);out.push({kind:'say',text:src.readUInt32LE(at+4),name:name===0x0fffffff?null:name});}
  else if(hi===6&&lo===2&&i>=8)out.push({kind:'choice',text:src.readUInt32LE(i-4),name:null});}
 return out;}
const pickDecoder=kit.decoder;
/* inline codes: <R漢字|よみ> style ruby is kept as its base, \n / %N are breaks, other %X / <...> codes drop */
const clean=t=>t.replace(/<R([^|>]*)\|[^>]*>/g,'$1').replace(/\\n|%N/g,'\n').replace(/%[A-Za-z0-9]+/g,'').replace(/<[^>]*>/g,'').replace(/^[\s　]+|[\s　]+$/g,'');
/* The pair (SCRIPT.SRC, TEXT.DAT) is one scene: scenes() hands parse() both, joined with a marker. */
const JOIN=Buffer.from('\0MEGULIT-SOFTPAL\0');
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),at=b.indexOf(JOIN);if(at<0)return {lines:[],anchors:[]};
 const src=b.subarray(0,at),table=textTable(b.subarray(at+JOIN.length));if(!table)return {lines:[],anchors:[]};
 const refs=scriptRefs(src),used=[];for(const r of refs){if(r.name!=null&&table.has(r.name))used.push(table.get(r.name));if(table.has(r.text))used.push(table.get(r.text));}
 const dec=pickDecoder(used),lines=[],anchors=[];
 for(const r of refs){if(!table.has(r.text))continue;if(r.name!=null&&table.has(r.name)){const n=clean(dec.decode(table.get(r.name)));if(n)lines.push(n);}const t=clean(dec.decode(table.get(r.text)));if(t)lines.push(t);}
 return {lines,anchors};}
function packs(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}return names.filter(n=>/\.pac$/i.test(n)).map(n=>path.join(dir,n)).filter(f=>{const l=pacList(f);return l&&l.some(e=>/^script\.src$/i.test(e.name))&&l.some(e=>/^text\.dat$/i.test(e.name));});}
function scenes(dir){
 /* loose files (a patch folder, or an unpacked game) win over the archive */
 const loose=n=>{try{const f=fs.readdirSync(dir).find(x=>x.toLowerCase()===n);return f?path.join(dir,f):null;}catch{return null;}};
 const ls=loose('script.src'),lt=loose('text.dat');
 if(ls&&lt)return [{name:'script.src',read:()=>Buffer.concat([fs.readFileSync(ls),JOIN,fs.readFileSync(lt)])}];
 for(const p of packs(dir)){const l=pacList(p),s=l.find(e=>/^script\.src$/i.test(e.name)),t=l.find(e=>/^text\.dat$/i.test(e.name));
  return [{name:'script.src',read:()=>Buffer.concat([ls?fs.readFileSync(ls):pacRead(p,s),JOIN,lt?fs.readFileSync(lt):pacRead(p,t)])}];}
 return [];}
const engine={
 id:'softpal',hint:'data.pac（SCRIPT.SRC + TEXT.DAT）',
 scenes,archives:scenes,
 sources:dir=>{const out=packs(dir);for(const n of ['SCRIPT.SRC','TEXT.DAT']){const f=path.join(dir,n);if(fs.existsSync(f))out.push(f);}return out;},
 /* the pair is read by archives() (loose pair or data.pac of a patch folder), never as one loose file */
 parse,test:()=>false,
};
module.exports={engine,parse,pacList,pacRead,decryptText,textTable,scriptRefs,JOIN};
