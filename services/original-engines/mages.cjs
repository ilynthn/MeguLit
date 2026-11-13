// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E342 MAGES. engine (Steam STEINS;GATE): USRDIR/script.mpk holds one SC3 file per scene (.SCX). An SC3 file is
   "SC3\0", the offset of its string table, the offset of the table after it; each string runs to 0xFF. A byte 0x80-0xAF
   starts a two-byte glyph: (big-endian word & 0x7FFF) is an index into the game's font sheet, so the text is only
   readable with that sheet's character list (mages-charset-sghd.txt: LunaHook's charset_SGHD, the same list the hook
   uses for this game, copied from preserved/source/lunahoook-adapted/.../resource/mages, GPL like LunaHook). Control bytes follow the hook's reader (native/mages/readString.cpp):
   01 name 02, 09 ruby base 0A reading 0B, 04/15 expression, 0C/11/12/13 one 16-bit argument, 00 line break.
   A speaker name is its own line (【倫太郎】), so a hooked line with or without the name lines up (the matcher joins
   consecutive lines). Only the Japanese release reads: the English MAGES releases decode to English and are left out.
   There is no Chinese in these releases; zero-latency translation machine-translates ahead. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const KANA=/[ぁ-ゖァ-ヺ]/;
const {stat}=require('./file-key.cjs');
/* 2026-11-13 the MAGES games index their font sheets differently. LunaHook's lists for the Steam releases: sghd
   (STEINS;GATE), default (STEINS;GATE 0, CHAOS;CHILD), sglbp (Linear Bounded Phenogram), sgmde (My Darling's Embrace).
   Each script is decoded with every list and the one giving the most common Japanese words wins (a wrong list still
   gives kana, which sit at the same indexes, but scrambles the kanji). */
const CHARSETS=['sghd','default','sglbp','sgmde'],charsetMemo=new Map();
const charset=(id='sghd')=>{if(!charsetMemo.has(id))charsetMemo.set(id,fs.readFileSync(path.join(__dirname,'mages-charset-'+id+'.txt'),'utf8').replace(/[\r\n]/g,''));return charsetMemo.get(id);};
const COMMON=/言|思|見|自分|何|今|人|私|俺|時間|気|前|手|目|声|顔|設定|変更|保存|出|来|行|事|話|分|中|大|上|下/g;
/* hits of common words per list for one script */
function charsetScores(buf){const out={};if(buf.length<12||buf.toString('latin1',0,4)!=='SC3\0')return out;const so=buf.readUInt32LE(4),ro=buf.readUInt32LE(8);if(so<12||ro<so||ro>buf.length)return out;
 for(const id of CHARSETS){const cs=charset(id);let hit=0;for(let q=so;q+4<=ro;q+=4){const at=buf.readUInt32LE(q);if(at<buf.length)hit+=(decodeString(buf,at,cs).text.match(COMMON)||[]).length;}out[id]=hit;}
 return out;}
/* another list must clearly beat the default sghd: a few common characters also turn up by chance in scrambled text */
const bestOf=sc=>{const base=sc.sghd||0;let best='sghd',score=base;for(const id of CHARSETS)if(id!=='sghd'&&(sc[id]||0)>score&&(sc[id]||0)>=base*1.2+3){score=sc[id];best=id;}return best;};
/* a game uses one list: decided once per script.mpk over a sample of scenes (a short menu scene alone can mislead) */
const gameMemo=new Map();
function gameCharset(file){const key=file+'|'+stat(file);if(gameMemo.has(key))return gameMemo.get(key);const sum={};
 try{const list=mpkList(file).filter(e=>SCX(e.name)&&e.size>4000);for(const e of list.filter((_,k)=>k%Math.max(1,Math.floor(list.length/12))===0).slice(0,12)){const sc=charsetScores(mpkRead(file,e));for(const id in sc)sum[id]=(sum[id]||0)+sc[id];}}catch{}
 const id=bestOf(sum);gameMemo.set(key,id);return id;}
const tagged=(file,e)=>{const b=mpkRead(file,e);b.magesCharset=gameCharset(file);return b;};
function pickCharset(buf){return charset(buf&&CHARSETS.includes(buf.magesCharset)?buf.magesCharset:bestOf(charsetScores(buf)));}
// MPK v2: "MPK\0", version 2.0, entry count (u64), index at 0x40 of 256-byte entries (compression, id, offset, size,
// unpacked size, 224-byte name).
const listMemo=new Map();
function mpkList(file){const key=file+'|'+stat(file);if(listMemo.has(key))return listMemo.get(key);let out=null,fd;
 try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,h=Buffer.alloc(16);fs.readSync(fd,h,0,16,0);
  if(h.toString('latin1',0,4)==='MPK\0'&&h.readUInt16LE(6)===2){const n=h.readUInt32LE(8);if(n>0&&n<100000&&0x40+n*256<=size){const idx=Buffer.alloc(n*256);fs.readSync(fd,idx,0,idx.length,0x40);out=[];
   for(let i=0;i<n;i++){const p=i*256,e={compressed:idx.readUInt32LE(p)!==0,offset:Number(idx.readBigUInt64LE(p+8)),packed:Number(idx.readBigUInt64LE(p+16)),size:Number(idx.readBigUInt64LE(p+24)),name:idx.toString('latin1',p+32,p+256).replace(/\0[\s\S]*$/,'')};
    if(e.offset+e.packed>size){out=null;break;}out.push(e);}}}
 }catch{out=null;}finally{if(fd!==undefined)fs.closeSync(fd);}
 listMemo.set(key,out);if(listMemo.size>16)listMemo.delete(listMemo.keys().next().value);return out;}
function mpkRead(file,e){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(e.packed);fs.readSync(fd,b,0,e.packed,e.offset);return e.compressed?zlib.inflateSync(b):b;}finally{fs.closeSync(fd);}}
// One SC3 string as display lines: the speaker's name (if any) and the text, with ruby pairs and unknown glyphs counted.
function decodeString(b,q,cs){let text='',name='',miss=0;const ruby=[];
 const glyph=()=>{const i=b.readUInt16BE(q)&0x7fff;q+=2;const c=cs[i];if(c===undefined){miss++;return '';}return c;};
 while(q<b.length&&b[q]!==0xff){const c=b[q];
  if(c>=0xb0){q++;continue;}
  if(c>=0x80){if(q+1>=b.length)break;text+=glyph();continue;}
  q++;
  if(c===0)text+='\n';
  else if(c===1){while(q<b.length&&b[q]!==2&&b[q]!==0xff){if(b[q]<0x20)q++;else if(b[q]>=0x80)name+=glyph();else q++;}if(b[q]===2)q++;}
  else if(c===4||c===0x15){let t=b[q];if(!t)q++;else{while(q<b.length&&t){if(t&0x80)q+=2+((t&0x60)>>5);else q+=2;t=b[q];}q++;}}
  else if(c===0x0c||c===0x11||c===0x12||c===0x13)q+=2;
  else if(c===9){let base='',reading='';
   while(q<b.length&&b[q]!==0x0b&&b[q]!==0xff){if(b[q]===0x0a){q++;while(q<b.length&&b[q]!==0x0b&&b[q]!==0xff){if(b[q]>=0x80)reading+=glyph();else q++;}}else if(b[q]>=0x80)base+=glyph();else q++;}
   if(b[q]===0x0b)q++;text+=base;if(base&&reading)ruby.push([base,reading]);}
 }
 return {name,text,miss,ruby};}
/* MAGES voices. An expression is a run of tokens ending in the two bytes 00 00: a byte with 0x80 set is a number of
   1, 2, 3 or 5 bytes ((b & 0x60) >> 5 picks the size), any other token is an operator and its priority (2 bytes).
   Mes (01 0C type ...) shows string lineId: type 0 = character expression, u16 lineId; types 1 and 3 put the voice
   expression first (voice, character, u16 lineId). A voice is an index into USRDIR/voice.mpk (STEINS;GATE: 7159 ->
   OKA_0102.OGG), so a line's voice reference is "mpkvoice_<index>" and audio() lists voice.mpk under those names. */
function expr(b,q,end){const vals=[];for(let n=0;n<64&&q+1<end;n++){const t=b[q];
  if(t&0x80){const len=[1,2,3,5][(t&0x60)>>5];if(q+len>end)return null;let v=t&0x1f;if(len===2)v=b[q+1]|(t&0x1f)<<8;else if(len===3)v=b[q+1]|b[q+2]<<8|(t&0x1f)<<16;else if(len===5)v=b.readInt32LE(q+1);vals.push(v);q+=len;}
  else{if(t===0&&b[q+1]===0)return {q:q+2,vals};q+=2;}}
 return null;}
function mesVoices(b,so,nstr){const out=new Map();if(so<16)return out;const code=b.readUInt32LE(12);if(code<12||code>=so)return out;
 for(let i=code;i+3<so;i++){if(b[i]!==1||b[i+1]!==0x0c)continue;const type=b[i+2];if(type>3)continue;
  /* the lineId is the u16 after the expressions, followed by the next instruction (01 xx) */
  for(let k=type&1?2:1;k<=3;k++){let q=i+3,first=null,ok=true;for(let j=0;j<k;j++){const r=expr(b,q,so);if(!r){ok=false;break;}if(j===0)first=r.vals;q=r.q;}
   if(!ok||q+3>so)continue;const id=b.readUInt16LE(q);if(id>=nstr||b[q+2]!==1)continue;
   if(type&1&&first&&first.length===1&&first[0]>=0&&!out.has(id))out.set(id,'mpkvoice_'+first[0]);i=q+1;break;}}
 return out;}
function parse(buf){const lines=[],ruby=[],anchors=[],voices=[];let miss=0,glyphs=0;
 if(buf.length<12||buf.toString('latin1',0,4)!=='SC3\0')return {lines,anchors,ruby,miss};
 const so=buf.readUInt32LE(4),ro=buf.readUInt32LE(8),cs=pickCharset(buf);if(so<12||ro<so||ro>buf.length)return {lines,anchors,ruby,miss};
 let vm=new Map();try{vm=mesVoices(buf,so,(ro-so)>>2);}catch{}
 for(let s=so;s+4<=ro;s+=4){const at=buf.readUInt32LE(s);if(at>=buf.length)continue;const d=decodeString(buf,at,cs);miss+=d.miss;glyphs+=d.name.length+d.text.length;
  if(d.name){lines.push('【'+d.name+'】');ruby.push(null);}
  const t=d.text.replace(/^\n+|\n+$/g,'');if(t){voices[lines.length]=vm.get((s-so)>>2)||null;lines.push(t);ruby.push(d.ruby.length?d.ruby:null);}}
 const out={lines,anchors,ruby,miss,glyphs};if(voices.some(Boolean))out.voices=lines.map((_,i)=>voices[i]||null);return out;}
const voiceMpk=file=>/(^|[\\/])voice[^\\/]*\.mpk$/i.test(file);
/* voice.mpk clips under "mpkvoice_<index>" (what the script plays) and under their own names */
function audio(file){if(!voiceMpk(file))return null;const l=mpkList(file);if(!l)return null;const out=[];
 l.forEach((e,i)=>{if(!/\.(?:ogg|wav|opus)$/i.test(e.name))return;const read=()=>mpkRead(file,e);out.push({name:'mpkvoice_'+i+'.ogg',read},{name:e.name,read});});return out;}
const scriptMpk=dir=>{for(const f of [path.join(dir,'USRDIR','script.mpk'),path.join(dir,'script.mpk')])if(fs.existsSync(f)&&mpkList(f))return f;return null;};
const SCX=n=>/\.scx$/i.test(n);
// Japanese and decodable with this character list: most strings of a sample of scenes have kana, few glyphs unknown.
const jpMemo=new Map();
function japanese(file){const key=file+'|'+stat(file);if(jpMemo.has(key))return jpMemo.get(key);let ok=false;
 try{const list=mpkList(file).filter(e=>SCX(e.name)&&e.size>4000);let lines=0,kana=0,miss=0,glyphs=0;
  for(const e of list.filter((_,i)=>i%Math.max(1,Math.floor(list.length/12))===0).slice(0,12)){const p=parse(tagged(file,e));lines+=p.lines.length;kana+=p.lines.filter(t=>KANA.test(t)).length;miss+=p.miss;glyphs+=p.glyphs||0;}
  ok=lines>0&&kana>=lines*.5&&miss<=glyphs*.01;}catch{ok=false;}
 jpMemo.set(key,ok);return ok;}
const mages={
 id:'mages',hint:'USRDIR\\script.mpk',
 scenes(dir){const f=scriptMpk(dir);if(!f||!japanese(f))return [];
  return mpkList(f).filter(e=>SCX(e.name)).map(e=>({name:e.name,read:()=>tagged(f,e)})).sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>{const f=scriptMpk(dir);return f?[f]:[];},
 parse:buf=>{const p=parse(buf),o={lines:p.lines,anchors:p.anchors,ruby:p.ruby};if(p.voices)o.voices=p.voices;return o;},
 audio,
 test:()=>false,
 // No Chinese in these releases (zero-latency translation translates ahead).
 patchLines:()=>null,
 _internal:{mpkList,mpkRead,decodeString,parseSc3:parse,charset,pickCharset,charsetScores,gameCharset,CHARSETS,expr,mesVoices},
};
module.exports=mages;
