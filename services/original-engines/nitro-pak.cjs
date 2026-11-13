// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* Nitro+ PAK v2/v3 (沙耶の唄 2003 and other early Nitro+ games), as in GARbro (MIT, ArcFormats/NitroPlus/ArcPAK.cs):
   version, count, unpacked index size, packed index size at 0xC; a zlib index from 0x118 (0x114 in version 2). Entry:
   name length, Shift-JIS name, offset (from the index end), unpacked size, unused, packed flag, packed size; packed
   entries are zlib. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const sj=kit.SJIS;
function list(file){let b;try{b=fs.readFileSync(file);}catch{return null;}if(b.length<0x118)return null;const version=b.readInt32LE(0),count=b.readInt32LE(4),isz=b.readUInt32LE(12);
 const at=version===2?0x114:0x118;if(version<1||version>3||count<=0||count>100000||isz<2||at+isz>b.length)return null;let idx;try{idx=zlib.inflateSync(b.subarray(at,at+isz));}catch{return null;}
 const base=at+isz,out=[];let p=0;
 for(let i=0;i<count;i++){const n=idx.readInt32LE(p);p+=4;if(n<=0||p+n>idx.length)return null;const name=sj.decode(idx.subarray(p,p+n)).replace(/\0[\s\S]*$/,'');p+=n;
  const offset=idx.readUInt32LE(p)+base,unpacked=idx.readUInt32LE(p+4),packed=idx.readUInt32LE(p+12)!==0&&idx.readUInt32LE(p+16)!==0,size=packed?idx.readUInt32LE(p+16):unpacked;p+=20;
  if(offset+size>b.length)return null;out.push({name,read:()=>packed?zlib.inflateSync(b.subarray(offset,offset+size)):b.subarray(offset,offset+size)});}
 return out;}
/* The scenario (script/<title>.txt in script.pak) is markup: <k> waits for a click, <clear> clears the box,
   <R TEXT="よみ">漢字</R> is ruby, <VOICE NAME="名前" ...> names the speaker. Text between waits is one line.
   (沙耶の唄 writes what the hero hears from the "monsters" as deliberately garbled katakana; it is kept as is.) */
function parse(data){const t=sj.decode(data),lines=[],ruby=[];
 for(const part of t.split(/<k>|<clear>|<page>/i)){const name=(part.match(/<VOICE[^>]*NAME="([^"]*)"/i)||[])[1];
  const pairs=[...part.matchAll(/<R TEXT="([^"]*)">([\s\S]*?)<\/R>/gi)].filter(m=>m[1]&&m[2]).map(m=>[m[2],m[1]]);
  const text=part.replace(/<R TEXT="[^"]*">([\s\S]*?)<\/R>/gi,'$1').replace(/<[^>]*>/g,'').replace(/[\r\n]+/g,'').replace(/^[　\s]+|[　\s]+$/g,'');
  if(!text||!/[ぁ-ゖァ-ヺ一-龯]/.test(text))continue;if(name){lines.push(name);ruby.push(null);}lines.push(text);ruby.push(pairs.length?pairs:null);}
 return {lines,anchors:[],ruby};}
function scriptPak(dir){const f=path.join(dir,'script.pak');try{const l=list(f);if(l&&l.some(e=>/\.txt$/i.test(e.name)))return f;}catch{}return null;}
/* E577 kit.engine: one script archive, base names, archive order */
const engine=kit.engine({id:'nitro-pak',hint:'script.pak',overlay:false,archives:{find:dir=>scriptPak(dir),list,entry:/\.txt$/i,sort:false},parse,test:n=>/\.txt$/i.test(n)});
module.exports={list,parse,engine};
