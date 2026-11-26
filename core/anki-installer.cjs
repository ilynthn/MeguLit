// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: a player without Anki only got "find the path in Settings", and the settings looked empty; it must
   be a foolproof one-click install). Downloads the official Anki installer (ankitects/anki GitHub release; the same file
   on MeguLit's mirror first, it is the faster one in China), checks its size and SHA-256 against the release digest,
   runs it with a progress bar (msiexec /passive; Windows may ask for permission once), then installs AnkiConnect and
   starts Anki and connects. The MSI includes Anki and its runtime. One job at a time; status() reports where it is. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const ankiProcess=require('./anki-process.cjs');
const PACKAGE={version:'26.09.4',name:'anki-26.09.4-win-x64.msi',size:201621504,sha256:'c35e7b90acf2929a71d70ac755a3dd0685f9fbe1a89d2f9edabb6fe7c0d91cba'};
const SOURCES=['https://dl.megulit.com/files/anki/'+PACKAGE.name,'https://cn-dl.megulit.com/files/anki/'+PACKAGE.name,'https://github.com/ankitects/anki/releases/download/'+PACKAGE.version+'/'+PACKAGE.name];
const inChina=()=>{try{const o=Intl.DateTimeFormat().resolvedOptions();return o.timeZone==='Asia/Shanghai'||o.timeZone==='Asia/Urumqi'||/^zh-CN/i.test(o.locale||'');}catch{return false;}};
let state={phase:'idle',received:0,total:PACKAGE.size,error:''},job=null;
const status=()=>({...state,version:PACKAGE.version});
function log(root,m){try{fs.appendFileSync(path.join(root,'logs','anki-process.log'),new Date().toISOString()+' installer '+m+'\n');}catch{}}
async function download(root,fetcher){
 const dir=path.join(root,'data','cache','anki-installer'),file=path.join(dir,PACKAGE.name);fs.mkdirSync(dir,{recursive:true});
 const ok=f=>{try{if(fs.statSync(f).size!==PACKAGE.size)return false;const h=crypto.createHash('sha256');h.update(fs.readFileSync(f));return h.digest('hex')===PACKAGE.sha256;}catch{return false;}};
 if(ok(file)){state.received=PACKAGE.size;return file;}
 /* 2026-11-19: core/fast-download.cjs measures every source at once and pulls the fast ones in parallel Range pieces;
    a slow or silent connection moves to another source, finished pieces survive a retry. Size and SHA-256 still decide. */
 try{log(root,'download '+SOURCES.length+' sources');await require('./fast-download.cjs').download({urls:SOURCES,dest:file,size:PACKAGE.size,sha256:PACKAGE.sha256,fetch:fetcher,onProgress:p=>{state.received=p.received;},log:line=>log(root,line)});return file;}
 catch(e){throw Error('ANKI_DOWNLOAD_FAILED '+String((e.last&&e.last.message)||e.message||''));}
}
function installFolder(root){
 const folder=ankiProcess.ankiFolder(root);
 try{
  const entry=fs.lstatSync(folder,{throwIfNoEntry:false});
  if (!entry || (entry.isDirectory() && fs.readdirSync(folder).length===0)) return folder;
 }catch{}
 // Existing files and directory links may belong to a manually managed Anki.
 throw Error('ANKI_INSTALL_TARGET_FAILED '+folder);
}

/* msiexec with its own progress bar; 0 and 3010 (restart later) are success, 1602 is "cancelled" (the permission prompt) */
async function runInstaller(root,file){
 const folder=installFolder(root);
 const args=['/i',file,'/passive','/norestart','INSTALLFOLDER='+folder];
 await new Promise((resolve,reject)=>{
  const child=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','msiexec.exe'),args,{windowsHide:false,stdio:'ignore'});
  child.on('error',reject);
  child.on('exit',code=>{
   log(root,'msiexec exit '+code);
   if (code===0||code===3010) return resolve();
   if (code===1602||code===1223) return reject(Error('ANKI_INSTALL_CANCELLED'));
   reject(Error('ANKI_INSTALL_TARGET_FAILED '+folder+' ('+code+')'));
  });
 });
}
/* start(root,{runtime,fetcher}) begins (or joins) the job: download, install, AnkiConnect, start and connect */
function start(root,{runtime=null,fetcher=fetch,install=runInstaller,china=inChina(),
 find=()=>runtime?runtime.ankiProcess().find():ankiProcess.find('',process.env,undefined,root)}={}){
 if(job)return status();
 state={phase:'downloading',received:0,total:PACKAGE.size,error:''};
 job=(async()=>{try{
   if(!find()){const file=await download(root,fetcher);state.phase='installing';await install(root,file);}
   state.phase='connecting';
   if(!find())throw Error('ANKI_EXECUTABLE_MISSING');
   const runner=runtime?.ankiProcess?.();
   if(typeof runner?.online==='function'&&await runner.online()){log(root,'already online');state.phase='done';log(root,'done');return;}
   try{
    const r=await ankiProcess.installAnkiConnect(process.env,{locate:find,fresh:true});
    log(root,'ankiconnect '+(r.already?'already there':'installed'));
   }catch(e){
    log(root,'ankiconnect '+e.message);
    throw e;
   }
   // An existing Anki 25.x launcher can still need packages on first start.
   if(china){process.env.UV_DEFAULT_INDEX??='https://pypi.tuna.tsinghua.edu.cn/simple';process.env.UV_INDEX_URL??='https://pypi.tuna.tsinghua.edu.cn/simple';}
   if(runner)await runner.start({hide:false});
   state.phase='done';log(root,'done');
  }catch(e){state.phase='error';const message=String(e.message||e);state.error=message.startsWith('ANKI_INSTALL_TARGET_FAILED ')?message:message.slice(0,120);log(root,'error '+state.error);}finally{job=null;}})();
 return status();
}
module.exports={start,status,PACKAGE,SOURCES};
