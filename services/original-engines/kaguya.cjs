// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E594 KaGuYa — アトリエかぐや's engine (Atelier KAGUYA, BARE&BUNNY, Honky-Tonk, CHERRY …; ~124 company releases, 54 since
   2016). Family A (string pool, docs/engine-families.md).
   Format references: VNTextPatch Scripts/KaguyaScript.cs (arcusmaximus, MIT) for message.dat ver4; GalTransl-GalGameReverse-
   Skill engines/kaguya.md + kaguya_early.py (GPL-3.0, after SExtractor extract_Kaguya_dat.py, GPL-3.0) for the early
   format; GARbro ArcFormats/Kaguya ArcKaguya.cs / ArcLINK.cs (morkt, MIT) for the archives. Research: engine-readers-e.
     message.dat "[SCR-MESSAGE]ver4.0" (21-byte header; byte 0x13 ≠ 0 → every string / message block is XOR'd with
                 byte 0x14): names {i32 n, n × (i16 len, bytes)}, choices (same), messages {i32 n, n × (i32 block length,
                 block = i32 text length, text, u8 voice count, UTF-16 voice names)}, groups {i32 n, n × (i32 name index |
                 -1, u8 m, m × i32 message index)}. Lines: per group, the name then each message; then every choice.
                 F0 40 is "％" in this format.
     message.dat early ("[SCR-MESSAGE]" + version; 1 or 2 more header bytes): blocks {u32 length, payload XOR 0xFF}
                 until length 0; payload = first C string, u8 count; count > 0: the first string is the speaker and the
                 text strings follow from 2 bytes after its NUL; count = 0: the first string is a choice.
     *.arc       "WFL1" (records {i32 name length, name XOR 0xFF, u16 mode, u32 size, [u32 unpacked when mode 1]}, data)
                 and "LINK3".."LINK6" (records {u32 record size, u16 flags, 7 bytes, name, data}) are listed so a
                 message.dat stored inside one is found; packed (mode 1, BMR) and encrypted members are images. */
const kit=require('./kit.cjs');
const MAGIC='[SCR-MESSAGE]';
/* ---- message.dat ------------------------------------------------------------------------------------------------ */
function ver4(b){if(b.toString('latin1',0,19)!=='[SCR-MESSAGE]ver4.0'||b.length<0x15)return null;const key=b[0x13]?b[0x14]:0;let p=0x15;
 const i32=()=>{const v=b.readInt32LE(p);p+=4;return v;},str=()=>{const n=b.readInt16LE(p);p+=2;if(n<0||p+n>b.length)throw Error('kaguya');const s=kit.xor(b.subarray(p,p+n),key);p+=n;return s;};
 const names=Array.from({length:i32()},str),choices=Array.from({length:i32()},str),count=i32();if(count<0||count>1e6)return null;const msgs=[];
 for(let i=0;i<count;i++){const n=i32();if(n<4||p+n>b.length)return null;const blk=kit.xor(b.subarray(p,p+n),key);p+=n;const tl=blk.readInt32LE(0);if(tl<0||4+tl>blk.length)return null;msgs.push(blk.subarray(4,4+tl));}
 const groups=i32(),out=[];if(groups<0||groups>1e6)return null;
 for(let g=0;g<groups;g++){const ni=i32(),m=b[p++];for(let k=0;k<m;k++){const mi=i32();if(ni>=0&&names[ni])out.push({kind:'name',bytes:names[ni]});if(msgs[mi])out.push({kind:'say',bytes:msgs[mi]});}}
 for(const c of choices)out.push({kind:'choice',bytes:c});
 return out;}
function early(b){if(b.toString('latin1',0,13)!==MAGIC||b.length<17)return null;const v=b[16];if(v>=0x34)return null;let p=17+(v>=3?2:1);const out=[];
 while(p+4<=b.length){const n=b.readUInt32LE(p);p+=4;if(!n)break;if(p+n>b.length)return null;const d=kit.xor(b.subarray(p,p+n),0xff);p+=n;
  const z=d.indexOf(0);if(z<0||z+1>=d.length)continue;const first=d.subarray(0,z),count=d[z+1];
  if(count===0){if(first.length)out.push({kind:'choice',bytes:first});continue;}
  if(first.length)out.push({kind:'name',bytes:first});let q=z+2;while(q<d.length){const e=d.indexOf(0,q),s=d.subarray(q,e<0?d.length:e);if(s.length)out.push({kind:'say',bytes:s});if(e<0)break;q=e+1;}}
 return out;}
const clean=t=>kit.trimBoth(t.replace(//g,'％').replace(/\r\n|\r/g,'\n'));
function parse(buf){let list=null;try{list=ver4(buf)||early(buf);}catch{list=null;}if(!list)return {lines:[],anchors:[]};
 const dec=kit.decoder(list.map(x=>x.bytes)),lines=[];for(const x of list){const t=clean(dec.decode(x.bytes));if(t)lines.push(t);}return {lines,anchors:[]};}

/* ---- archives --------------------------------------------------------------------------------------------------- */
/* sequential records read one header at a time (the archives hold large images; never read them whole) */
function walkRecords(file,first,read){const size=kit.size(file);let fd;try{fd=require('node:fs').openSync(file,'r');}catch{return null;}
 try{const out=[],buf=Buffer.alloc(0x220);let p=first;
  for(let n=0;n<200000&&p+8<size;n++){const got=require('node:fs').readSync(fd,buf,0,buf.length,p),r=read(buf.subarray(0,got),p,size);if(!r)break;out.push(r);if(!(r.next>p))break;p=r.next;}
  return out.length?out:null;}finally{require('node:fs').closeSync(fd);}}
function wfl(file){if(kit.head(file,4).toString('latin1')!=='WFL1')return null;
 return walkRecords(file,4,(v,p,size)=>{if(v.length<4)return null;const n=v.readInt32LE(0);if(n<=0||n>0x100||4+n+6>v.length)return null;const name=kit.SJIS.decode(kit.xor(v.subarray(4,4+n),0xff)).replace(/^\\+/,'');
  let q=4+n;const mode=v.readUInt16LE(q),sz=v.readUInt32LE(q+2);q+=6;if(mode===1)q+=4;if(p+q+sz>size)return null;return {next:p+q+sz,name,offset:p+q,size:sz,mode};});}
function link(file){const h=kit.head(file,16);if(h.toString('latin1',0,4)!=='LINK')return null;const v=h[4]-48;if(v<3||v>6)return null;
 return walkRecords(file,v===3?8:v<6?0xA:8+h[7],(d,p,size)=>{if(d.length<0x10)return null;const len=d.readUInt32LE(0);if(!len||len<0x10||p+len>size)return null;const flags=d.readUInt16LE(4);let q=13,name;
  if(v<6){const n=d[q],nb=d.subarray(q+3,q+3+n),z=nb.indexOf(0);name=kit.cname(nb);q+=3+n;}
  else{const n=d.readUInt16LE(q);name=d.subarray(q+2,q+2+n).toString('utf16le').replace(/\0+$/,'');q+=2+n;}
  return {next:p+len,name,offset:p+q,size:len-q,packed:!!(flags&3),encrypted:!!(flags&4)};});}
const archiveList=f=>{const l=wfl(f)||link(f);return l&&l.filter(e=>!e.packed&&!e.encrypted&&e.mode!==1);};
const engine=kit.engine({id:'kaguya',hint:'message.dat',
 archives:{name:/\.arc$/i,list:f=>{const l=archiveList(f);return l&&l.some(e=>/^message\.dat$/i.test(e.name.split(/[\\/]/).pop()))?l:null;},entry:/(^|[\\/])message\.dat$/i},
 loose:{name:/^message\.dat$/i,subs:['','data','patch']},parse,test:n=>/^message\.dat$/i.test(n)});
module.exports={engine,parse,ver4,early,wfl,link};
