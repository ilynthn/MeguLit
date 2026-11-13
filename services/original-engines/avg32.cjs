// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');
/* AVG32 (ZERO 涙 1997, Key's engine before RealLive): TXT/SEEN.TXT is a "PACL" archive. Header: magic, 12 bytes, count at
   0x10, then 32-byte entries from 0x20 (16-byte name, offset, packed size, unpacked size, flag). Each entry is "PACK",
   4 bytes, unpacked size, packed size, then LZ: flag bytes read MSB first (1 = literal), a reference is a 16-bit word,
   length (w&15)+2, distance (w>>4)+1. The scenario bytecode ("TPC32") keeps its text as Shift-JIS runs; names are
   written 【名前】 in the line itself, ＊Ｋ ＊Ｌ ... are name variables. */
const fs=require('node:fs'),path=require('node:path');
/* #104 the game's own ini says where the scenario is: #DIRC.TXT="DAT" =P:"SEEN.TXT" (AIR 2000 and its Chinese build
   keep it in DAT\; GAMEEXE.INI may be renamed after the exe, air_cn.ini). */
function iniFiles(dir){let names=[];try{names=fs.readdirSync(dir).filter(f=>/\.ini$/i.test(f));}catch{}const out=[];
 for(const f of names.sort((a,b)=>(/^gameexe\.ini$/i.test(b)?1:0)-(/^gameexe\.ini$/i.test(a)?1:0))){try{const b=fs.readFileSync(path.join(dir,f));if(b.length<1<<20&&/#DIRC\.|#NAME\.|#SEEN_START/.test(b.toString('latin1')))out.push(b);}catch{}}return out;}
function seenFile(dir){const tries=[];for(const ini of iniFiles(dir)){const m=/#DIRC\.TXT\s*=\s*"([^"]*)"\s*=\s*\w\s*:\s*"([^"]+)"/i.exec(ini.toString('latin1'));if(m)tries.push(path.join(dir,m[1],m[2]));}
 for(const sub of ['TXT','txt','DAT','dat','.'])tries.push(path.join(dir,sub,'SEEN.TXT'));
 for(const f of tries){try{if(fs.statSync(f).isFile())return f;}catch{}}return null;}
function lz(src,p,size){const o=Buffer.alloc(size);let d=0;
 while(d<size&&p<src.length){let f=src[p++];for(let i=0;i<8&&d<size&&p<src.length;i++,f<<=1){
  if(f&0x80)o[d++]=src[p++];else{if(p+1>=src.length)return o.subarray(0,d);const w=src.readUInt16LE(p);p+=2;const c=(w&15)+2,off=(w>>4)+1;for(let k=0;k<c&&d<size;k++,d++)o[d]=d-off>=0?o[d-off]:0;}}}
 return o.subarray(0,d);}
function list(file){const b=fs.readFileSync(file);if(b.toString('latin1',0,4)!=='PACL')return null;const n=b.readUInt32LE(16),out=[];
 if(n<=0||n>10000||32+n*32>b.length)return null;
 for(let i=0;i<n;i++){const e=32+i*32,name=b.toString('latin1',e,e+16).replace(/\0[\s\S]*$/,''),off=b.readUInt32LE(e+16);
  if(off+16>b.length)continue;out.push({name,read:()=>{if(b.toString('latin1',off,off+4)!=='PACK')return b.subarray(off,off+b.readUInt32LE(e+20));return lz(b,off+16,b.readUInt32LE(off+8));}});}
 return out;}
const sjLead=c=>(c>=0x81&&c<=0x9f)||(c>=0xe0&&c<=0xfc),gbLead=c=>c>=0x81&&c<=0xfe;
const sjDec=kit.SJIS,gbDec=new TextDecoder('gbk');
// Text: runs of double-byte Shift-JIS characters (the engine stores dialogue full-width); a run must carry kana or kanji.
function runs(data,lead,dec){const lines=[];let i=0;
 while(i<data.length){let j=i;for(;;){if(j+1<data.length&&lead(data[j])&&data[j+1]>=0x40&&data[j+1]!==0x7f)j+=2;else if(j>i&&data[j]>=0x21&&data[j]<0x7f&&/[!?]/.test(String.fromCharCode(data[j])))j++;else break;}
  if(j-i>=4){const t=dec.decode(data.subarray(i,j)).replace(/[\s　]+$/,'');if(/[ぁ-ゖァ-ヺ一-龯]/.test(t)&&!t.includes('�'))lines.push(t);i=j;}else i++;}
 return lines;}
/* #104 Chinese builds rewrite the strings in GBK (AIR air_cn.exe). Read both ways and keep the one whose text looks like
   dialogue: brackets and full stops in that code page (「 is 81 75 in Shift-JIS, A1 B8 in GBK), kana for Japanese. */
const dialogue=lines=>{let n=0;for(const t of lines)n+=(t.match(/[「」『』。、，！？ぁ-ゖァ-ヺ]/g)||[]).length;return n;};
/* 2026-11-13 (涙, live hook 「…んぐぅッ!!」): half-width text inside a line is its own command, 00 FE <ASCII> 00 FF, between
   the full-width parts; it is put back in place so the line keeps its end and meets the hooked text. */
function inlineHalf(data){const parts=[];let last=0;
 for(let i=0;i+3<data.length;i++){if(data[i]!==0||data[i+1]!==0xfe)continue;let j=i+2;while(j<data.length&&data[j]>=0x20&&data[j]<0x7f)j++;
  if(j>i+2&&j+1<data.length&&data[j]===0&&data[j+1]===0xff){parts.push(data.subarray(last,i),data.subarray(i+2,j));last=j+2;i=j+1;}}
 if(!parts.length)return data;parts.push(data.subarray(last));return Buffer.concat(parts);}
function parse(data){data=inlineHalf(Buffer.from(data));const sj=runs(data,sjLead,sjDec),gb=runs(data,gbLead,gbDec);return {lines:dialogue(gb)>dialogue(sj)*1.5?gb:sj,anchors:[]};}
function defaultNames(dir){const out=new Map();for(const ini of iniFiles(dir)){
 const s=ini.toString('latin1');for(const m of s.matchAll(/#NAME\.([A-Z])="([^"]*)"/g))if(!out.has(m[1].charCodeAt(0)-65))out.set(m[1].charCodeAt(0)-65,Buffer.from(m[2],'latin1'));}return out;}
// ＊Ａ is 81 96 82 60 in Shift-JIS and A3 AA A3 C1 in GBK.
function withNames(data,names){const parts=[];let last=0;
 for(let i=0;i+3<data.length;i++){let k=-1;if(data[i]===0x81&&data[i+1]===0x96&&data[i+2]===0x82&&data[i+3]>=0x60&&data[i+3]<=0x79)k=data[i+3]-0x60;else if(data[i]===0xa3&&data[i+1]===0xaa&&data[i+2]===0xa3&&data[i+3]>=0xc1&&data[i+3]<=0xda)k=data[i+3]-0xc1;
  if(k>=0&&names.has(k)){parts.push(data.subarray(last,i),names.get(k));i+=3;last=i+1;}}
 parts.push(data.subarray(last));return Buffer.concat(parts);}
const avg32={
 id:'avg32',hint:'TXT\\SEEN.TXT',
 // ＊Ａ..＊Ｚ are the characters' names; the game prints the defaults from GAMEEXE.INI (#NAME.A="忍"), so the text
 // is read with those names in place (Shift-JIS bytes swapped before decoding).
 scenes(dir){const f=seenFile(dir);if(!f)return [];const names=defaultNames(dir);
  return (list(f)||[]).map(s=>({name:s.name,read:()=>names.size?withNames(s.read(),names):s.read()}));},
 archives:()=>[],
 sources:dir=>{const f=seenFile(dir);return f?[f]:[];},
 parse,test:n=>/^SEEN\d+\.TXT$/i.test(n),
 _internal:{lz,list,seenFile,inlineHalf},
};
module.exports=avg32;
