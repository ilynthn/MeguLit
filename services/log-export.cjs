// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (user: 就单纯加个提取日志的按钮吧 说明是 针对修复 QQ群内专用 / 记得自动备注问题在文件里 … 加入命名里) 提取日志:
   the whole-app diagnostic package (diagnostics.cjs buildAll, scrubbed the same way) with 问题说明.txt inside (the problem
   the reader typed, version, time, the game played last), copied to the reader's real desktop as
   MeguLit日志_<problem>_v<version>_<time>.zip, to be sent to the QQ group by hand. Nothing is uploaded. The desktop comes from
   the shell folder registry key, so a desktop moved by OneDrive or by hand is found; %USERPROFILE%\Desktop is the last resort. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const SHELL_KEYS=['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders'];
const NAME=/^MeguLit日志_.*_v[\w.]+_\d{8}-\d{4}(?:-\d+)?\.zip$/u,NOTE_FILE='问题说明.txt',RECENT_MS=12*3600*1000;

const expand=(value,env)=>String(value||'').replace(/%([^%]+)%/g,(all,name)=>{const key=Object.keys(env).find(k=>k.toLowerCase()===name.toLowerCase());return key?env[key]:all;});
function readRegistry(key){
 try{return execFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','reg.exe'),['query',key,'/v','Desktop'],{encoding:'utf8',windowsHide:true,timeout:5000});}catch{return '';}
}
/* REG_EXPAND_SZ / REG_SZ line of `reg query … /v Desktop` → the path, %VARS% expanded */
function parseRegistry(output,env){
 const m=/^\s*Desktop\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/im.exec(String(output||''));if(!m)return '';
 const value=expand(m[1],env);return /%[^%]+%/.test(value)?'':value;
}
function desktopDir({env=process.env,query=readRegistry,exists=fs.existsSync}={}){
 for(const key of SHELL_KEYS){const dir=parseRegistry(query(key),env);if(dir&&path.isAbsolute(dir)&&exists(dir))return path.resolve(dir);}
 const profile=env.USERPROFILE||require('node:os').homedir();
 for(const dir of [env.OneDrive&&path.join(env.OneDrive,'Desktop'),env.OneDrive&&path.join(env.OneDrive,'桌面'),path.join(profile,'Desktop')])if(dir&&exists(dir))return path.resolve(dir);
 throw Error('DESKTOP_NOT_FOUND');
}

const pad=n=>String(n).padStart(2,'0');
const localStamp=d=>`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const localTime=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const cleanVersion=v=>String(v||'').replace(/[^\w.]/g,'').slice(0,32)||'0';
/* the first 20 characters of the problem, safe as a Windows file name part */
function problemPart(problem){
 const text=[...String(problem||'').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim()].slice(0,20).join('').trim().replace(/[. ]+$/,'').replace(/ /g,'-');
 return text||'问题';
}
function fileName({problem,version,now,dir,exists=fs.existsSync}){
 const base=`MeguLit日志_${problemPart(problem)}_v${cleanVersion(version)}_${localStamp(now)}`;
 for(let i=1;i<100;i++){const name=base+(i>1?'-'+i:'')+'.zip';if(!exists(path.join(dir,name)))return name;}
 throw Error('DESKTOP_NAME_TAKEN');
}
/* the game launched last, when that was within 12 hours: what the reader is most likely talking about */
function recentGame(db,now=new Date()){
 try{
  const row=db.prepare('SELECT title,library,last_launched_at FROM games WHERE last_launched_at IS NOT NULL ORDER BY last_launched_at DESC LIMIT 1').get();
  const at=require('./diagnostics.cjs').ms(row?.last_launched_at);if(!row||!at||now.getTime()-at>RECENT_MS)return null;
  let engine='';try{engine=String(JSON.parse(row.library||'{}').engine||'');}catch{}
  return {title:String(row.title||''),engine,at:new Date(at)};
 }catch{return null;}
}
function noteText({problem,version,now,game}){
 return ['MeguLit 问题说明','',`问题：${String(problem).trim()}`,`版本：v${cleanVersion(version)}`,`时间：${localTime(now)}（${now.toISOString()}）`,
  `当前游戏：${game?`${game.title}${game.engine?`（${game.engine}）`:''}，${localTime(game.at)} 启动`:'无（最近 12 小时没有启动游戏）'}`,'',
  '这个压缩包是 MeguLit「提取日志」生成的，针对修复，QQ 群内专用。日志里的 Windows 用户名、用户文件夹路径和邮箱已经替换掉。'].join('\r\n')+'\r\n';
}
/* → {path,name,dir,bytes}; errors carry a code only (DESKTOP_NOT_FOUND, EACCES, ENOSPC …), never a path */
function exportToDesktop(root,db,{problem='',version='',now=new Date(),desktop,build=require('./diagnostics.cjs').buildAll}={}){
 problem=String(problem||'').trim().slice(0,1000);if(!problem)throw Error('PROBLEM_REQUIRED');
 const scrub=require('./diagnostics.cjs').scrub;problem=scrub(problem);
 const dir=desktop||desktopDir(),game=recentGame(db,now);let pack;
 try{pack=build(root,db,{version,now,extra:[{name:NOTE_FILE,data:noteText({problem,version,now,game})}]});}catch(error){throw Error('LOG_BUILD_FAILED '+String(error?.code||error?.message||'').slice(0,80));}
 const name=fileName({problem,version,now,dir}),file=path.join(dir,name),temporary=file+'.tmp';
 try{fs.copyFileSync(pack.path,temporary);fs.renameSync(temporary,file);}catch(error){fs.rmSync(temporary,{force:true});throw Error(String(error?.code||'LOG_COPY_FAILED'));}
 return {path:file,name,dir,bytes:fs.statSync(file).size};
}
/* only a package this feature wrote on the desktop may be shown in Explorer */
function ownExport(file,dir=desktopDir()){
 const resolved=path.resolve(String(file||''));
 if(path.dirname(resolved).toLowerCase()!==path.resolve(dir).toLowerCase()||!NAME.test(path.basename(resolved))||!fs.existsSync(resolved))throw Error('LOG_EXPORT_NOT_FOUND');
 return resolved;
}
module.exports={desktopDir,parseRegistry,exportToDesktop,ownExport,fileName,problemPart,recentGame,noteText,NAME,NOTE_FILE};
