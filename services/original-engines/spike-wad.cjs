// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Spike Chunsoft PC releases built on the SDL2 port (Steam ダンガンロンパ 1・2 Reload: DR1_us.exe / DR2_us.exe).
   Game data lives in *.wad archives: "AGAR", version (2 x u32), header size + header, then the file table (u32 count;
   per file u32 name length, name, u64 size, u64 offset), the directory table (u32 count; per dir u32 name length, name,
   u32 entry count; per entry u32 name length, name, u8 is-dir); file offsets count from the end of the tables.
   Scenes are Dr?/data/<lang>/script/*.lin: u32 type (2 = has text), u32 header size, u32 text offset, u32 file size;
   bytecode (0x70 op args...) up to the text block; the text block is u32 count, count+1 offsets (from the block),
   UTF-16LE strings with a BOM, ending in NUL, carrying <CLT n>...<CLT> colour tags.
   Which language a set of scripts is in is read from its text, not from its folder: the Steam release keeps every
   language under data/us and swaps the wad. The Japanese set gives the lines; a Chinese set beside it (another wad, or
   another folder) pairs by script name and string index. An English-only install has no Japanese and is left out. */
const fs=require('node:fs'),path=require('node:path');
const KANA=/[ぁ-ゖァ-ヺ]/,HAN=/[一-鿿]/;
const {stat}=require('./file-key.cjs');
const listMemo=new Map();
function wadList(file){const key=file+'|'+stat(file);if(listMemo.has(key))return listMemo.get(key);let out=null,fd;
 try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size;let cap=Math.min(size,4<<20),h=null;
  for(;;){h=Buffer.alloc(cap);fs.readSync(fd,h,0,cap,0);try{out=parseTable(h,size);break;}catch(e){if(e.message!=='short'||cap>=size||cap>=256<<20){out=null;break;}cap=Math.min(size,cap*4);}}
 }catch{out=null;}finally{if(fd!==undefined)fs.closeSync(fd);}
 listMemo.set(key,out);if(listMemo.size>16)listMemo.delete(listMemo.keys().next().value);return out;}
function parseTable(h,size){if(h.length<20||h.toString('latin1',0,4)!=='AGAR')return null;
 const need=n=>{if(n>h.length)throw new Error('short');};let p=16;need(p);p+=h.readUInt32LE(12);need(p+4);
 const n=h.readUInt32LE(p);p+=4;if(n>1000000)return null;const files=[];
 for(let i=0;i<n;i++){need(p+4);const l=h.readUInt32LE(p);p+=4;need(p+l+16);const name=h.toString('utf8',p,p+l);p+=l;files.push({name,size:Number(h.readBigUInt64LE(p)),offset:Number(h.readBigUInt64LE(p+8))});p+=16;}
 need(p+4);const d=h.readUInt32LE(p);p+=4;if(d>1000000)return null;
 for(let i=0;i<d;i++){need(p+4);p+=4+h.readUInt32LE(p);need(p+4);const c=h.readUInt32LE(p);p+=4;for(let j=0;j<c;j++){need(p+4);p+=4+h.readUInt32LE(p)+1;}}
 need(p);for(const f of files){f.offset+=p;if(f.offset+f.size>size)return null;}return files;}
function wadRead(file,e){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(e.size);fs.readSync(fd,b,0,e.size,e.offset);return b;}finally{fs.closeSync(fd);}}
// The strings of one .lin, in table order, without BOM, NUL and colour tags.
function linStrings(b){if(!b||b.length<16||b.readUInt32LE(0)!==2)return null;const to=b.readUInt32LE(8);if(to<16||to+4>b.length)return null;
 const n=b.readUInt32LE(to);if(n>100000||to+8+n*4>b.length)return null;const out=[];
 /* DR2 leaves the closing offset 0: the last string then runs to its NUL */
 for(let i=0;i<n;i++){const a=to+b.readUInt32LE(to+4+i*4),next=b.readUInt32LE(to+8+i*4),z=next?to+next:b.length;if(a>z||z>b.length)return null;
  out.push(clean(b.toString('utf16le',a,z-((z-a)&1))));}
 return out;}
const clean=t=>t.replace(/^﻿/,'').replace(/\0[\s\S]*$/,'').replace(/<CLT[^>]*>/g,'').replace(/\r/g,'').replace(/^\n+|\n+$/g,'');
const wads=dir=>{let l=[];try{l=fs.readdirSync(dir).filter(n=>/\.wad$/i.test(n)).map(n=>path.join(dir,n));}catch{}return l.filter(f=>wadList(f));};
// Script sets: one per wad and language folder -> {lang, scripts: Map(base name -> reader)}.
const setMemo=new Map();
function sets(dir){const files=wads(dir),key=files.map(f=>f+'|'+stat(f)).join('\n');if(setMemo.has(key))return setMemo.get(key);const out=[];
 for(const f of files){const groups=new Map();
  for(const e of wadList(f)){const m=/^(.*\/data\/([^/]+)\/script)\/([^/]+\.lin)$/i.exec(e.name);if(!m)continue;
   if(!groups.has(m[1]))groups.set(m[1],new Map());groups.get(m[1]).set(m[3].toLowerCase(),()=>wadRead(f,e));}
  for(const [folder,scripts] of groups){let lines=0,kana=0,han=0;const names=[...scripts.keys()].sort();
   for(const n of names.filter((_,i)=>i%Math.max(1,Math.floor(names.length/16))===0).slice(0,16)){let s=null;try{s=linStrings(scripts.get(n)());}catch{}
    for(const t of s||[]){if(!t.trim())continue;lines++;if(KANA.test(t))kana++;else if(HAN.test(t))han++;}}
   const lang=lines&&kana>=lines*.3?'ja':lines&&han>=lines*.5?'zh':'other';out.push({file:f,folder,lang,scripts});}}
 setMemo.clear();setMemo.set(key,out);return out;}
const spikeWad={
 id:'spike-wad',hint:'*.wad (AGAR) data/*/script/*.lin',
 scenes(dir){const all=sets(dir),ja=all.filter(s=>s.lang==='ja'),zh=all.filter(s=>s.lang==='zh');if(!ja.length)return [];const out=[],seen=new Set();
  for(const set of ja)for(const [name,read] of set.scripts){if(seen.has(name))continue;seen.add(name);const other=zh.find(z=>z.scripts.has(name));
   out.push({name,read:()=>{const own=linStrings(read())||[];let z=[];if(other){try{z=linStrings(other.scripts.get(name)())||[];}catch{}}
    return Buffer.from(JSON.stringify({ja:own,zh:z.length===own.length?z:[]}));}});}
  return out.sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 /* E-wad: the Steam release swaps <name>_us.wad for <name>_jp.wad only when the Steam game language is Japanese,
    so an English install has scripts but no Japanese: say so instead of the generic "not supported" */
 unsupported(dir){const all=sets(dir);return all.length&&!all.some(s=>s.lang==='ja')?'WAD_NO_JAPANESE':'';},
 REASONS:{WAD_NO_JAPANESE:'装的是英文/其他语言版（只有 *_us.wad）：在 Steam 游戏属性 → 语言 里改成日本語，等 Steam 下载 *_jp.wad 后即可读取'},
 sources:dir=>[...new Set(sets(dir).filter(s=>s.lang!=='other').map(s=>s.file))],
 /* strings are paired by index before empty ones are dropped, so a dropped string never shifts the pairing */
 parse(buf){const doc=JSON.parse(buf.toString('utf8'));const keep=doc.ja.map((t,i)=>t.trim()?i:-1).filter(i=>i>=0);
  return {lines:keep.map(i=>doc.ja[i]),anchors:[],zh:keep.map(i=>doc.zh[i]||'')};},
 test:()=>false,
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{wadList,wadRead,linStrings,sets},
};
module.exports=spikeWad;
