// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 pictures of the real screen -> frames for core/cardinal/screen-evidence.cjs. Each picture (png / jpg) goes through Windows
   OCR (services/cold-ocr.ps1, Japanese, one picture at a time, about 8 s each); its time is the file's modification time (the capture
   wrote it), the clock of the tape on the same PC. Nothing leaves this PC; the pictures are only read. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const PICTURE=/\.(png|jpe?g|bmp)$/i;
function ocr(file,{timeoutMs=60000,spawnImpl=spawn}={}){return new Promise(resolve=>{let p,out='';
 try{p=spawnImpl('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'..','cold-ocr.ps1'),file],{windowsHide:true,stdio:['ignore','pipe','ignore']});}catch{return resolve(null);}
 const timer=setTimeout(()=>{try{p.kill();}catch{}},timeoutMs);
 p.stdout.on('data',d=>{out+=d;});p.on('error',()=>{clearTimeout(timer);resolve(null);});
 p.on('close',()=>{clearTimeout(timer);try{const v=JSON.parse(out);resolve(Array.isArray(v)?v:v&&typeof v==='object'?[v]:[]);}catch{resolve(null);}});});}
/* dir or file list -> [{name, at, ocr|null}], oldest first; exclude: rectangles (picture px) of MeguLit's own rows, the same for all */
async function frames(source,{exclude=[],read=ocr,limit=60}={}){
 const files=(Array.isArray(source)?source:fs.readdirSync(source).map(n=>path.join(source,n))).filter(f=>PICTURE.test(f)).map(f=>({f,at:fs.statSync(f).mtimeMs})).sort((a,b)=>a.at-b.at).slice(0,limit);
 const out=[];for(const {f,at} of files){const o=await read(f);out.push({name:path.basename(f),at:Math.round(at),ocr:o||[],...(o?{}:{error:'ocr failed'}),exclude});}
 return out;}
module.exports={frames,ocr};
