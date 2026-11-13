// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* Innocent Grey / Noesis "IGA0" archives (虚ノ少女 script.iga), as in GARbro (MIT, ArcFormats/Noesis/ArcIGA.cs):
   from 0x10 a packed-uint index length, then (name offset, data offset, size) packed uints, the name table length and
   one packed uint per name byte (cp932). Packed uint: bytes shifted in 7 bits at a time until the low bit is 1, >> 1.
   Data is XOR (i + 2), and also 0xFF for .s scripts.
   In a .s scene a string operand is 04 00 <length> then that many bytes (padded): Shift-JIS up to a NUL. A speaker is a string
   "＃名前"; ruby is written <漢字<よみ>. */
const fs=require('node:fs'),path=require('node:path');
const sj=kit.SJIS;
/* #149 (殻ノ少女 / カルタグラ / クロウカシス / PP-ピアニッシモ, older Innocent Grey): "PACKDAT." archives (script.dat), as in
   IG_tools igtool (GPL) and Crass: u32 count twice, then 48-byte entries (cp932 name[32], absolute offset, mode,
   unpacked size, packed size). Mode & 0x10000 (pictures) is an XOR stream keyed by the size; .s scripts are stored plain
   and XOR 0xFF. The .s strings are the same 04 00 <length> operands as in IGA scenes, so parse() reads both. */
function packdat(file,b,size){if(b.length<16)return null;const count=b.readUInt32LE(12);if(!count||count>200000||16+count*48>b.length)return null;
 const dir=[];for(let i=0;i<count;i++){const at=16+i*48,raw=b.subarray(at,at+32),z=raw.indexOf(0);const name=sj.decode(z<0?raw:raw.subarray(0,z));
  const offset=b.readUInt32LE(at+32),mode=b.readUInt32LE(at+36),full=b.readUInt32LE(at+40),packed=b.readUInt32LE(at+44);if(!name||offset+packed>size)return null;dir.push({name,offset,mode,full,packed});}
 return dir.map(e=>({name:e.name,read:()=>{const d=Buffer.alloc(e.packed),g=fs.openSync(file,'r');try{fs.readSync(g,d,0,e.packed,e.offset);}finally{fs.closeSync(g);}
  if(e.mode&0x10000){let t=(e.packed>>>2)>>>0;t=((t<<((t&7)+8))^t)>>>0;for(let i=0;i+4<=d.length;i+=4){const v=(d.readUInt32LE(i)^t)>>>0;d.writeUInt32LE(v,i);const s=v%24;t=s?((t<<s)|(t>>>(32-s)))>>>0:t;}}
  if(/\.s$/i.test(e.name))for(let i=0;i<d.length;i++)d[i]^=0xff;return d;}}));}
// E450 only the index is read up front (voice.iga is over a gigabyte); each entry is read from the file when asked for.
function list(file){let fd,size,b;try{fd=fs.openSync(file,'r');size=fs.fstatSync(fd).size;b=Buffer.alloc(Math.min(size,16<<20));fs.readSync(fd,b,0,b.length,0);}catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
 if(b.toString('latin1',0,8)==='PACKDAT.')return packdat(file,b,size);
 if(b.toString('latin1',0,4)!=='IGA0')return null;let p=0x10;
 const u=()=>{let v=0;while((v&1)===0){if(p>=b.length)throw Error('IGA_TRUNCATED');v=(v*128+b[p++])>>>0;}return v>>>1;};
 try{const len=u(),end=p+len,dir=[];while(p<end)dir.push({nameAt:u(),offset:u(),size:u()});
  const names=u(),data=p+names;
  for(let i=0;i<dir.length;i++){const n=(i+1<dir.length?dir[i+1].nameAt:names)-dir[i].nameAt,bytes=Buffer.alloc(n);for(let k=0;k<n;k++)bytes[k]=u();dir[i].name=sj.decode(bytes);dir[i].offset+=data;if(dir[i].offset+dir[i].size>size)return null;}
  return dir.map(e=>({name:e.name,read:()=>{const d=Buffer.alloc(e.size),g=fs.openSync(file,'r');try{fs.readSync(g,d,0,e.size,e.offset);}finally{fs.closeSync(g);}const key=/\.s$/i.test(e.name)?0xff:0;for(let i=0;i<d.length;i++)d[i]^=((i+2)^key)&255;return d;}}));
 }catch{return null;}}
/* E450 the voice of a line: the last clip name (aok0003, no extension) the script names between the previous line and
   this one; voice.iga holds the clips. Music and effects (bgm03, se012) are not voices. */
function voiceBetween(d,from,to){let v=null;for(const m of d.toString('latin1',from,to).matchAll(/(?<![\w.])([A-Za-z]{2,4}\d{4,5})(?![\w.])/g))if(!/^(?:bgm?|se|sys|ev|bg)/i.test(m[1]))v=m[1];return v;}
function parse(d){const lines=[],ruby=[],voices=[];let prevEnd=0;
 for(let i=0;i+3<d.length;i++){if(d[i]!==0x04||d[i+1]!==0)continue;const n=d[i+2];if(n<3||i+3+n>d.length)continue;
  const z=d.indexOf(0,i+3);if(z<i+5||z>=i+3+n)continue;const t=sj.decode(d.subarray(i+3,z));if(t.includes('�')||!/[ぁ-ゖァ-ヺ一-龯]/.test(t))continue;
  if(/^[!-~]+$/.test(t))continue;const voice=voiceBetween(d,prevEnd,i);i+=2+n;prevEnd=i+1;
  if(t.startsWith('＃')){lines.push(t.slice(1));ruby.push(null);voices.push(null);continue;}
  const pairs=[...t.matchAll(/<([^<>]*)<([^<>]*)>/g)].filter(m=>m[1]&&m[2]).map(m=>[m[1],m[2]]);
  lines.push(t.replace(/<([^<>]*)<[^<>]*>/g,'$1'));ruby.push(pairs.length?pairs:null);voices.push(voice);}
 const v=require('./voice-ref.cjs').keep(voices);return v?{lines,anchors:[],ruby,voices:v}:{lines,anchors:[],ruby};}
// E450 the clips of an IGA archive (voice.iga), for game-voice.cjs.
function audio(file){if(!/\.(?:iga|dat)$/i.test(file))return null;const l=list(file);return l?l.filter(e=>/\.(?:ogg|wav)$/i.test(e.name)):null;}
function scriptIga(dir){const f=path.join(dir,'script.iga');try{if(fs.statSync(f).isFile())return f;}catch{}
 /* #149 older Innocent Grey games keep the scenes in script.dat (PACKDAT.) */const d=path.join(dir,'script.dat');try{const fd=fs.openSync(d,'r'),h=Buffer.alloc(8);try{fs.readSync(fd,h,0,8,0);}finally{fs.closeSync(fd);}if(h.toString('latin1')==='PACKDAT.')return d;}catch{}return null;}
/* E577 kit.engine: one script archive, entries keep their names and order */
const engine=kit.engine({id:'iga',hint:'script.iga / script.dat（PACKDAT.）',overlay:false,
 archives:{find:dir=>scriptIga(dir),list,entry:/\.s$/i,keepPath:true,sort:false},parse,test:n=>/\.s$/i.test(n)});
module.exports={list,parse,engine,audio};
