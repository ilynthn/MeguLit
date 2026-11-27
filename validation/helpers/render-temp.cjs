// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 The browser render scripts (torch-exterior-render, torch-courtyard-render, torch-ground-render) each make a scratch
   folder under TEMP for the service root, the headless Edge profile and their screenshots, 50–75 MB a run. They were never
   removed, and a day of runs filled the system drive. The folder now goes when the script ends: after it passes, after a failed
   assertion or a browser that would not start (the scripts call remove() in their finally), and on Ctrl+C or a console close
   (the signal ends the process and the exit handler removes it). Run a script with --keep to leave the folder for its screenshots. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

function renderTemp(prefix,{keep=process.argv.includes('--keep')}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
 let gone=false;
 const remove=()=>{
  if(keep||gone)return;gone=true;
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}catch{gone=false;}
 };
 process.once('exit',remove);
 for(const signal of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP'])process.once(signal,()=>process.exit(130));
 return {dir,keep,remove};
}

module.exports={renderTemp};
