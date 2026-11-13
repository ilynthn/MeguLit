// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* MAGES. engine dialogue font (STEINS;GATE Steam and the other MPK games). The engine draws text from a pre-rendered glyph
   sheet, USRDIR/system.mpk FONT.PNG (white glyphs in alpha, 64 cells per row, cell = width/64; cell i = charset[i], the same
   charset the script decoder uses), so no font name exists anywhere in the game and no GDI text is drawn for the probe.
   The face is found by drawing: ~120 kana/kanji cells are cropped to their ink box and scaled to 32x32, then every installed
   font family draws the same characters (services/font-match.ps1, GDI+ paths, no font fallback) and the closest one wins
   (STEINS;GATE: DF GothicP W5 0.90 against 0.855 for the next family; E475 found whole-glyph correlation weak, but per-glyph
   ink-box comparison separates faces of the same class). size = the sheet's cell (the glyph's design size in pixels).
   The answer is cached per sheet (size+mtime) in the given cache folder; the match takes ~10-30 s once, off the UI. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const SIZE=32;
function mpkWithFont(root){for(const dir of [path.join(root,'USRDIR'),root]){let names=[];try{names=fs.readdirSync(dir);}catch{continue;}
  for(const n of names.filter(n=>/^system\.mpk$/i.test(n)).concat(names.filter(n=>/\.mpk$/i.test(n)&&!/^system\.mpk$/i.test(n))))return path.join(dir,n);}
 return null;}
function isMages(root){return !!mpkWithFont(root);}
/* PNG -> {width,height,alpha:Uint8Array} (8-bit, non-interlaced; colour types 0,2,4,6). Ink = alpha, or grey when opaque. */
function decodePng(buf){if(buf.readUInt32BE(0)!==0x89504e47)throw new Error('not png');let p=8,w=0,h=0,depth=0,ct=0,inter=0;const idat=[];
 while(p<buf.length){const len=buf.readUInt32BE(p),type=buf.toString('latin1',p+4,p+8),d=buf.subarray(p+8,p+8+len);p+=12+len;
  if(type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);depth=d[8];ct=d[9];inter=d[12];}else if(type==='IDAT')idat.push(d);else if(type==='IEND')break;}
 if(depth!==8||inter)throw new Error('png format');const ch={0:1,2:3,4:2,6:4}[ct];if(!ch)throw new Error('png colour');
 const raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*ch,out=Buffer.alloc(stride*h);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],src=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),o=y*stride;
  for(let x=0;x<stride;x++){const a=x>=ch?out[o+x-ch]:0,b=y?out[o-stride+x]:0,c=x>=ch&&y?out[o-stride+x-ch]:0;let v=src[x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
   out[o+x]=v&255;}}
 const ink=new Uint8Array(w*h);let opaque=true;if(ch===2||ch===4)for(let i=0;i<w*h;i++){ink[i]=out[i*ch+ch-1];if(ink[i]!==255)opaque=false;}
 if(ch<2||ch===3||opaque)for(let i=0;i<w*h;i++)ink[i]=ch>=3?out[i*ch+1]:out[i*ch];
 return {width:w,height:h,ink};}
/* One cell cropped to its ink box (> 100) and scaled to SIZE x SIZE bilinear (matches font-match.ps1). */
function normCell(img,x0c,y0c,cell){let x0=1e9,y0=1e9,x1=-1,y1=-1;const W=img.width,I=img.ink;
 for(let y=y0c;y<y0c+cell&&y<img.height;y++)for(let x=x0c;x<x0c+cell;x++)if(I[y*W+x]>100){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
 if(x1<0)return null;const cw=x1-x0+1,chh=y1-y0+1,o=Buffer.alloc(SIZE*SIZE);
 const g=(a,b)=>I[Math.min(y1,Math.max(y0,b))*W+Math.min(x1,Math.max(x0,a))];
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const sx=x0+(x+0.5)*cw/SIZE-0.5,sy=y0+(y+0.5)*chh/SIZE-0.5,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  o[y*SIZE+x]=Math.round(g(ix,iy)*(1-fx)*(1-fy)+g(ix+1,iy)*fx*(1-fy)+g(ix,iy+1)*(1-fx)*fy+g(ix+1,iy+1)*fx*fy);}
 return o;}
/* The glyph sheet and the sample to match: {mpk, sheet, cell, chars, glyphs(base64)}; null when this is no MAGES game. */
function sample(root,{charset,count=80}={}){const mpk=mpkWithFont(root);if(!mpk)return null;const m=require('../services/original-engines/mages.cjs')._internal;
 const list=m.mpkList(mpk);const e=list&&list.find(e=>/^font\.png$/i.test(e.name));if(!e)return null;
 const img=decodePng(m.mpkRead(mpk,e)),cell=Math.round(img.width/64);if(cell<12||cell>256)return null;
 const cs=charset||m.charset(),rows=Math.floor(img.height/cell);const want=[];
 for(let i=0;i<cs.length&&i<rows*64;i++){const c=cs[i];if(/[ぁ-ゖァ-ヺ一-龯]/.test(c))want.push(i);}
 const step=Math.max(1,Math.floor(want.length/count)),chars=[],glyphs=[];
 for(let k=0;k<want.length&&chars.length<count;k+=step){const i=want[k],g=normCell(img,(i%64)*cell,Math.floor(i/64)*cell,cell);if(!g)continue;chars.push(cs[i]);glyphs.push(g.toString('base64'));}
 if(chars.length<20)return null;let st={};try{st=fs.statSync(mpk);}catch{}
 return {mpk,sheet:e.name,cell,chars:chars.join(''),glyphs,key:mpk.toLowerCase()+'|'+e.offset+'|'+st.size+'|'+st.mtimeMs};}
const HOST=path.join(__dirname,'..','services','font-match.ps1');
function runMatch(job,dir){return new Promise((resolve,reject)=>{fs.mkdirSync(dir,{recursive:true});const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6),inF=path.join(dir,'match-'+id+'.json'),outF=path.join(dir,'match-'+id+'.out.json');
 fs.writeFileSync(inF,JSON.stringify({chars:job.chars,size:SIZE,glyphs:job.glyphs,em:64}));
 const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 require('node:child_process').execFile(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',HOST,'-In',inF,'-Out',outF],{windowsHide:true,timeout:180000},error=>{
  let out=null;try{out=JSON.parse(fs.readFileSync(outF,'utf8'));}catch{}try{fs.unlinkSync(inF);}catch{}try{fs.unlinkSync(outF);}catch{}
  if(!Array.isArray(out))return reject(error||new Error('font match failed'));resolve(out);});});}
/* Synchronous match (engine-font-scan runs in a worker thread): best installed families, or [] when PowerShell fails. */
function matchSync(job,dir){fs.mkdirSync(dir,{recursive:true});const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6),inF=path.join(dir,'match-'+id+'.json'),outF=path.join(dir,'match-'+id+'.out.json');
 fs.writeFileSync(inF,JSON.stringify({chars:job.chars,size:SIZE,glyphs:job.glyphs,em:64}));let out=[];
 try{const ps=path.join(process.env.SystemRoot||'C:\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');require('node:child_process').execFileSync(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',HOST,'-In',inF,'-Out',outF],{windowsHide:true,timeout:240000,stdio:'ignore'});out=JSON.parse(fs.readFileSync(outF,'utf8'));}catch{}
 for(const f of [inF,outF])try{fs.unlinkSync(f);}catch{}return Array.isArray(out)?out:[];}
/* The closest installed face for a sample: {face, style, bold, score, candidates}; face '' below MIN_SCORE. */
const MIN_SCORE=0.8;
function closest(list){const best=list[0];return {face:best&&best.score>=MIN_SCORE?best.family:'',style:best?.style||'',bold:best?.style==='Bold',score:best?.score||0,candidates:list.slice(0,5)};}
/* read(root,{cacheDir}) -> {engine:'mages', face, style, score, size, bold, sheet, candidates} or null. */
async function read(root,{cacheDir,match=runMatch}={}){const s=sample(root);if(!s)return null;
 const cacheFile=cacheDir?path.join(cacheDir,'mages-font.json'):null;let cache={};try{cache=JSON.parse(fs.readFileSync(cacheFile,'utf8'))||{};}catch{}
 let found=cache[s.key];if(!found){const list=await match(s,cacheDir||require('node:os').tmpdir());found=list.slice(0,5);if(cacheFile){cache[s.key]=found;try{fs.mkdirSync(cacheDir,{recursive:true});fs.writeFileSync(cacheFile,JSON.stringify(cache));}catch{}}}
 const best=found[0];if(!best||!(best.score>=0.8))return {engine:'mages',face:null,size:s.cell,sheet:s.sheet,candidates:found};
 return {engine:'mages',face:best.family,style:best.style,score:best.score,size:s.cell,bold:best.style==='Bold',sheet:s.sheet,candidates:found};}
module.exports={read,sample,matchSync,closest,MIN_SCORE,isMages,decodePng,normCell,SIZE};
