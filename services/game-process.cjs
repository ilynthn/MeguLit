// SPDX-License-Identifier: GPL-3.0-or-later
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
/* E382 GameProcess.exe can fail once when the PC is busy (seen while building); one retry before PROCESS_QUERY_FAILED */
async function gameProcess(root,executable,options={}){try{return await gameProcessOnce(root,executable,options);}catch(error){if(error.message!=='PROCESS_QUERY_FAILED')throw error;return gameProcessOnce(root,executable,options);}}
function gameProcessOnce(root,executable,{focus=false,execute=execFile}={}){
 const original=executable,candidate=require('./launch-path.cjs').compatiblePath(root,executable,{create:false});executable=candidate;
 return new Promise((resolve,reject)=>execute(path.join(root,'native','GameProcess.exe'),[focus?'--focus':'--query',executable],{windowsHide:true,encoding:'utf8',timeout:10000},(error,stdout)=>{
  if(error)return reject(Error('PROCESS_QUERY_FAILED'));
  const status=stdout.trim();if(status==='absent'&&candidate!==original)return execute(path.join(root,'native','GameProcess.exe'),[focus?'--focus':'--query',original],{windowsHide:true,encoding:'utf8',timeout:10000},(e,out)=>e?reject(Error('PROCESS_QUERY_FAILED')):['absent','running','focused'].includes(String(out).trim())?resolve(String(out).trim()):reject(Error('PROCESS_QUERY_FAILED')));if(!['absent','running','focused'].includes(status))return reject(Error('PROCESS_QUERY_FAILED'));resolve(status);
 }));
}
function shellOpen(root,executable){
 return new Promise((resolve,reject)=>execFile(path.join(root,'native','GameProcess.exe'),['--shell-open',executable],{windowsHide:true,encoding:'utf8',timeout:25000},(error,out)=>{
  const result=String(out||'').trim();
  if(!error&&result==='started')return resolve();
  reject(Error(result==='cancelled'?'GAME_ELEVATION_CANCELLED':'GAME_LAUNCH_FAILED'));
 }));
}
async function gameProcesses(root,exe){
 const pending=path.join(root,'native','GalWindowBridge.updated.exe');
 const bridge=fs.existsSync(pending)?pending:path.join(root,'native','GalWindowBridge.exe');
 const output=await new Promise((resolve,reject)=>execFile(bridge,['--process-status',path.normalize(exe)],{windowsHide:true,timeout:8000,encoding:'utf8'},(error,out)=>error?reject(Error('PROCESS_QUERY_FAILED')):resolve(out)));
 const result=JSON.parse(output.trim());
 if(result.type!=='gameProcesses'||!Array.isArray(result.processes))throw Error('PROCESS_QUERY_FAILED');
 return result.processes;
}
/* Whether a program with this file name is running. tasklist prints in the console code page (GBK on Chinese Windows), so
   looking for a Chinese or Japanese exe name in its output never matched and a running game counted as closed. The
   IMAGENAME filter already did the matching: any CSV row means a match, whatever the encoding. */
function imageRunning(exe){try{const out=require('node:child_process').execFileSync('tasklist',['/FI','IMAGENAME eq '+path.basename(exe),'/FO','CSV','/NH'],{windowsHide:true,encoding:'utf8',timeout:8000});return /^"/m.test(out);}catch{return false;}}
module.exports={gameProcess,gameProcesses,shellOpen,imageRunning};
