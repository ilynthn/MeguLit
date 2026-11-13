// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Runtime CG unlock: the reading side of module Cg (native/runtimedump/modules/Cg.cpp in MeguLitDump32/64.dll). The DLL
// writes a CG only after the game's own window showed it (closest-candidate signature match on two polls; preloaded,
// gallery-table and never-shown pictures stay in memory and are dropped), so everything listed here is a picture the
// player saw, in play or in the game's CG gallery. TLG is the exception the DLL cannot decode: it is confirmed here
// (settle below), off the main thread.
// Layout: <runtime-dump dir for the game>/cg.jsonl (one line per CG: file, source, how, crc, w, h, fmt, size, at) and
// cg/<crc>_<w>x<h>.<ext>. card-wall.cjs offers these as kind 'cg', source 'memory', id 'mem:<crc>'.
const fs=require('node:fs'),path=require('node:path');
const rd=()=>require('./runtime-dump.cjs');
/* formats the card picture step can open */
const OPEN=new Set(['png','jpg','bmp','webp']);

/* ---- TLG: confirmed here, not in the DLL ----
   cg-wait/<crc>_<w>x<h>_<unix time>.tlg are TLG file images the game decrypted; cg-screens.bin (and the rotated
   cg-screens.old) hold the steady window signatures the DLL logged while they waited (u32 unix time, u32 0, 32x18 grey
   bytes). For every logged screen the closest waiting TLG that matches (mean and every cell, like Cg.cpp Dist) wins;
   a winner becomes cg/<crc>_<w>x<h>.png. A TLG that never won is deleted after WAIT_MS. Each TLG is decoded once:
   its signature is cached next to it as <file>.sig (576 bytes, or 1 byte when it cannot count). Screen logs are
   deleted once no TLG waits. Decoder: cg-decoders.cjs tlg(). */
const SW=32,SH=18,TOP=12,AVG=14,CELL=40,WAIT_MS=30*60*1000;
function grid(rgba,w,h){const sig=new Int32Array(SW*SH);
 for(let gy=0;gy<SH;gy++)for(let gx=0;gx<SW;gx++){const x0=Math.floor(gx*w/SW),x1=Math.floor((gx+1)*w/SW),y0=Math.floor(gy*h/SH),y1=Math.floor((gy+1)*h/SH);
  const sx=Math.floor((x1-x0)/8)+1,sy=Math.floor((y1-y0)/8)+1;let sum=0,c=0;
  for(let y=y0;y<y1;y+=sy)for(let x=x0;x<x1;x+=sx){const q=(y*w+x)*4;sum+=(rgba[q]*77+rgba[q+1]*150+rgba[q+2]*29)>>8;c++;}
  sig[gy*SW+gx]=c?Math.floor(sum/c):0;}
 return sig;}
const flat=sig=>{let lo=255,hi=0;for(let i=0;i<SW*TOP;i++){if(sig[i]<lo)lo=sig[i];if(sig[i]>hi)hi=sig[i];}return hi-lo<40;};
/* distance over the compared rows, or -1 when the mean or any single cell is too far (a variant CG differs in a few cells) */
const dist=(a,b)=>{let d=0;for(let i=0;i<SW*TOP;i++){const x=Math.abs(a[i]-b[i]);if(x>CELL)return -1;d+=x;}return d<AVG*SW*TOP?d:-1;};
const same=(a,b)=>dist(a,b)>=0;
function screens(dir){const out=[],n=8+SW*SH;
 for(const f of ['cg-screens.old','cg-screens.bin']){let b;try{b=fs.readFileSync(path.join(dir,f));}catch{continue;}
  for(let o=0;o+n<=b.length;o+=n)out.push({at:b.readUInt32LE(o),sig:b.subarray(o+8,o+n)});}
 return out;}
function decodeTlg(file){const dec=require('./cg-decoders.cjs'),buf=Buffer.from(fs.readFileSync(file));
 for(const o of [0,15])if(buf[o]===0xab&&buf[o+1]===0x4c)buf[o]=0x54;/* AB-LG variant: same header after the first byte */
 return dec.tlg(buf);}
/* the cached signature of a waiting TLG (null: cannot count) */
function sigOf(file){
 try{const b=fs.readFileSync(file+'.sig');return b.length===SW*SH?Int32Array.from(b):null;}catch{}
 let sig=null;try{const img=decodeTlg(file);if(img.width*img.height>0){const s=grid(img.rgba,img.width,img.height);if(!flat(s))sig=s;}}catch{}
 try{fs.writeFileSync(file+'.sig',sig?Buffer.from(Uint8Array.from(sig)):Buffer.from([0]));}catch{}
 return sig;}
const rm=f=>{try{fs.unlinkSync(f);}catch{}};
function settle(dir,now=Date.now()){
 const wait=path.join(dir,'cg-wait');let names=[];try{names=fs.readdirSync(wait);}catch{names=[];}
 const waits=[];
 for(const n of names){const f=path.join(wait,n);
  if(n.endsWith('.sig')){if(!fs.existsSync(f.slice(0,-4)))rm(f);continue;}
  const m=/^([0-9a-f]{8})_\d{1,5}x\d{1,5}_(\d{1,12})\.tlg$/.exec(n);if(!m){if(n.endsWith('.tmp'))rm(f);continue;}
  waits.push({crc:m[1],at:+m[2],file:f,sig:sigOf(f)});}
 if(!waits.length){rm(path.join(dir,'cg-screens.bin'));rm(path.join(dir,'cg-screens.old'));return;}
 /* each logged screen: only its closest matching TLG counts */
 const won=new Set();
 for(const s of screens(dir)){let best=null,bd=-1;
  for(const w of waits){if(!w.sig||s.at+5<w.at)continue;const d=dist(w.sig,s.sig);if(d>=0&&(bd<0||d<bd)){bd=d;best=w;}}
  if(best)won.add(best);}
 for(const w of waits){
  if(won.has(w)){let img=null;try{img=decodeTlg(w.file);}catch{}
   if(img){const rel='cg/'+w.crc+'_'+img.width+'x'+img.height+'.png';fs.mkdirSync(path.join(dir,'cg'),{recursive:true});
    fs.writeFileSync(path.join(dir,rel),require('./cg-decoders.cjs').png(img));
    fs.appendFileSync(path.join(dir,'cg.jsonl'),JSON.stringify({file:rel,source:'',how:'tlg',crc:w.crc,w:img.width,h:img.height,fmt:'png',at:Math.floor(now/1000)})+'\n');}
   rm(w.file);rm(w.file+'.sig');}
  else if(!w.sig||now-w.at*1000>WAIT_MS){rm(w.file);rm(w.file+'.sig');}}
 /* the rotated log is dropped once every TLG it could confirm is gone */
 const left=waits.filter(w=>fs.existsSync(w.file));
 if(!left.length){rm(path.join(dir,'cg-screens.bin'));rm(path.join(dir,'cg-screens.old'));}
 else{const oldest=Math.min(...left.map(w=>w.at));let newestOld=0;try{const b=fs.readFileSync(path.join(dir,'cg-screens.old')),n=8+SW*SH;for(let o=0;o+n<=b.length;o+=n)newestOld=Math.max(newestOld,b.readUInt32LE(o));}catch{}
  if(newestOld&&newestOld+5<oldest)rm(path.join(dir,'cg-screens.old'));}}

/* settle in a worker thread, at most once per folder every 10 s: the page never waits for TLG decoding */
const busy=new Map();
function settleSoon(dir){
 try{if(!fs.existsSync(path.join(dir,'cg-wait')))return;}catch{return;}
 const last=busy.get(dir);if(last&&Date.now()-last<10000)return;busy.set(dir,Date.now());
 try{const {Worker}=require('node:worker_threads');const w=new Worker(__filename,{workerData:{cgSettle:dir}});w.on('error',()=>{});w.unref();}catch{}}

/* every recorded CG of a game, oldest first, one per CRC: [{crc,file,source,how,w,h,fmt,at}] */
function list(exe,opts={}){
 if(!exe)return [];const dir=rd().dirFor(path.dirname(String(exe)));if(opts.settle!==false)settleSoon(dir);let raw='';
 try{raw=fs.readFileSync(path.join(dir,'cg.jsonl'),'utf8');}catch{return [];}
 const seen=new Set(),out=[];
 for(const line of raw.split('\n')){if(!line.trim())continue;let e;try{e=JSON.parse(line);}catch{continue;}
  const crc=String(e.crc||'').toLowerCase();if(!/^[0-9a-f]{8}$/.test(crc)||seen.has(crc))continue;
  /* the file must sit inside the game's cg folder (no paths out of it) */
  const rel=String(e.file||'');if(!/^cg\/[0-9a-f]{8}_\d{1,5}x\d{1,5}\.(?:png|jpg|bmp|webp|tlg)$/i.test(rel))continue;
  const file=path.join(dir,...rel.split('/'));if(!fs.existsSync(file))continue;
  seen.add(crc);out.push({crc,file,source:String(e.source||''),how:String(e.how||''),w:+e.w||0,h:+e.h||0,fmt:String(e.fmt||'').toLowerCase(),at:+e.at||0});}
 return out;}

/* card wall sources (card-wall.cjs sources()): pictures the page can show; opts.settle false for counting only */
function sources(exe,opts){return list(exe,opts).filter(c=>OPEN.has(c.fmt)).map(c=>({id:'mem:'+c.crc,kind:'cg',source:'memory',file:c.file}));}

module.exports={list,sources,settle,_internal:{grid,flat,same,dist}};

try{const wt=require('node:worker_threads');if(!wt.isMainThread&&wt.workerData&&wt.workerData.cgSettle)settle(wt.workerData.cgSettle);}catch{}
