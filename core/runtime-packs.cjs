// SPDX-License-Identifier: GPL-3.0-or-later
// Optional runtime packs for the slim release. setup/runtime.json lists each pack (zip of runtime/<...>)
// with its download URLs, SHA-256, download size and unpacked size. The first-launch window installs
// "base" (and optionally the rest); this store lets Settings install the remaining packs later.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawn}=require('node:child_process');

/* E383 a mirror template may use {url} (whole GitHub URL), or {tag} and {file} (release tag and file name) for our own mirror dl.megulit.com */
function mirrorUrl(template,url){const parts=String(url).split('/'),file=parts.pop()||'',tag=parts.pop()||'';return template.replace('{url}',url).replace('{tag}',tag).replace('{file}',file);}
const MARKERS={base:'runtime/node.exe',reading:'runtime/reading/sudachidict_full/resources/system.dic',voice:'runtime/aivis/run.exe',archives:'runtime/garbro/ArcFormats.dll','runtime-dump':'runtime/runtime-dump/MeguLitDump64.dll'};
/* E470 "archives": GARbro (morkt, MIT) downloaded only when a game's scripts sit in an archive MeguLit's own readers cannot open.
   onDemand packs are left out of "download full", unpack into their own dest folder (the upstream release is not laid out as runtime/...)
   and can be removed again in Settings. */
const ON_DEMAND_FILES=['GameRes.dll','ArcFormats.dll','GameData/Formats.dat'];
/* 2026-11-13 "runtime-dump" (docs/runtime-dump-pack.md): MeguLitDump32/64.dll, a cold pack the user never sees. It is
   "hidden": left out of status() (no row in Settings, nothing to switch), never removable, fetched by core/hook-native.cjs
   in the background the first time a game is hooked and injected by HookBridge once it is on disk. A pack may name the
   files that make it complete with "files"; without it the GARbro list above applies. */
const packFiles=pack=>Array.isArray(pack?.files)&&pack.files.length?pack.files:ON_DEMAND_FILES;

const SHARED=new Map();
class RuntimePacks{
 /* one store per install root, so Settings and the readers that fetch a pack on demand see the same jobs */
 static shared(root){const k=path.resolve(root).toLowerCase();if(!SHARED.has(k))SHARED.set(k,new RuntimePacks(root));return SHARED.get(k);}
 constructor(root){this.root=root;this.jobs={};}
 /* parsed once per change of runtime.json: installed() and status() ask for it on every reader and Settings poll */
 manifest(){const f=path.join(this.root,'setup','runtime.json');let k='';try{const s=fs.statSync(f);k=s.size+'|'+s.mtimeMs;}catch{}if(k&&this.manifestKey===k)return this.manifestCache;
  let m;try{m=JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));}catch{m={packs:{}};}this.manifestKey=k;this.manifestCache=m;return m;}
 installed(id){const marker=MARKERS[id];if(!marker||!fs.existsSync(path.join(this.root,marker)))return false;const p=this.manifest().packs?.[id],dest=p?.dest;return !dest||packFiles(p).every(f=>fs.existsSync(path.join(this.root,dest,f)));}
 onDemand(id){return !!this.manifest().packs?.[id]?.onDemand;}
 status(){const m=this.manifest();return {version:m.version||'',packs:Object.entries(m.packs||{}).filter(([,p])=>!p.hidden).map(([id,p])=>{const j=this.jobs[id];return {id,size:p.size||0,unpacked:p.unpacked||0,onDemand:!!p.onDemand,license:p.license||'',installed:this.installed(id),job:j?{state:j.state,stage:j.stage,received:j.received,total:j.total,error:j.error}:null};})};}
 download(ids){
  const m=this.manifest(),list=(Array.isArray(ids)&&ids.length?ids:Object.keys(m.packs||{}).filter(id=>!m.packs[id].onDemand)).filter(id=>m.packs?.[id]&&!this.installed(id));
  if(this.running)return this.status();
  for(const id of list)this.jobs[id]={state:'queued',stage:'',received:0,total:m.packs[id].size||0,error:''};
  this.running=(async()=>{for(const id of list){const job=this.jobs[id];if(job.state==='cancelled')continue;try{await this.install(id,m.packs[id],job);job.state='done';}catch(error){if(job.state!=='cancelled'){job.state='error';job.error=String(error.message||error);}}}})().finally(()=>{this.running=null;});
  return this.status();
 }
 /* Resolve once the pack is installed (downloading it if needed); rejects with the job's error. Used by readers that need a pack now. */
 async ensure(id,{timeout=15*60000}={}){if(this.installed(id))return true;if(!this.manifest().packs?.[id])throw Error('PACK_UNKNOWN');
  const start=Date.now();let asked=false;for(;;){const job=this.jobs[id];
   /* our own download failing or being cancelled ends the wait; it is not restarted every 300 ms (offline: one try, not hundreds) */
   if(!this.running&&(!job||!['queued','downloading'].includes(job.state))){if(asked&&job&&['error','cancelled'].includes(job.state))throw Error(job.error||'PACK_'+job.state.toUpperCase());this.download([id]);asked=true;}
   await new Promise(r=>setTimeout(r,300));if(this.installed(id))return true;if(Date.now()-start>timeout)throw Error('PACK_TIMEOUT');}}
 /* Only on-demand packs can be removed; a running download of it is cancelled first. */
 uninstall(id){const p=this.manifest().packs?.[id];if(!p?.onDemand||!p.dest||p.hidden)throw Error('PACK_NOT_REMOVABLE');const job=this.jobs[id];if(job&&['queued','downloading'].includes(job.state)){job.state='cancelled';job.controller?.abort();}
  const dest=path.resolve(this.root,p.dest);if(!dest.startsWith(path.resolve(this.root,'runtime')+path.sep))throw Error('PACK_DEST_OUTSIDE');fs.rmSync(dest,{recursive:true,force:true});delete this.jobs[id];return this.status();}
 cancel(){for(const job of Object.values(this.jobs)){if(['queued','downloading'].includes(job.state)){job.state='cancelled';job.controller?.abort();}}return this.status();}
 async install(id,pack,job){
  const part=path.join(this.root,'runtime-'+id+'.part'),stage=path.join(this.root,'runtime-'+id+'.unpack');
  let lastError=null;
  // Mainland China (by time zone / locale, no IP lookup): try GitHub mirrors first. SHA-256 still has to match.
  const direct=pack.urls||[],mirrored=(this.manifest().mirrors||[]).flatMap(m=>direct.map(u=>mirrorUrl(m,u)));
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'',china=['Asia/Shanghai','Asia/Chongqing','Asia/Harbin','Asia/Urumqi','PRC'].includes(tz);
  for(const url of china?[...mirrored,...direct]:[...direct,...mirrored]){
   job.state='downloading';job.stage='download';job.received=0;job.controller=new AbortController();
   try{
    const digest=await fetchTo(url,part,job);
    if(digest.toLowerCase()!==String(pack.sha256).toLowerCase())throw Error('文件校验失败');
    lastError=null;break;
   }catch(error){lastError=error;try{fs.rmSync(part,{force:true});}catch{}if(job.state==='cancelled')throw error;}
  }
  if(lastError)throw lastError;
  if(!direct.length&&!mirrored.length)throw Error('没有下载地址');
  job.stage='unpack';
  try{
  fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});
  await new Promise((resolve,reject)=>{const p=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',part,'-C',stage],{windowsHide:true});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('解压失败')));});
  if(pack.dest){/* whole release into its own folder; swap in atomically so a failed unpack leaves the old copy */
   const to=path.resolve(this.root,pack.dest);if(!to.startsWith(path.resolve(this.root,'runtime')+path.sep))throw Error('PACK_DEST_OUTSIDE');
   const files=packFiles(pack),top=fs.readdirSync(stage),from=top.length===1&&fs.statSync(path.join(stage,top[0])).isDirectory()&&!files.some(f=>fs.existsSync(path.join(stage,f)))?path.join(stage,top[0]):stage;
   if(!files.every(f=>fs.existsSync(path.join(from,f))))throw Error('安装不完整');
   fs.mkdirSync(path.dirname(to),{recursive:true});fs.rmSync(to+'.old',{recursive:true,force:true});if(fs.existsSync(to))fs.renameSync(to,to+'.old');fs.renameSync(from,to);fs.rmSync(to+'.old',{recursive:true,force:true});
  }else{
  const from=path.join(stage,'runtime'),to=path.join(this.root,'runtime');fs.mkdirSync(to,{recursive:true});
  for(const name of fs.readdirSync(from)){const target=path.join(to,name);fs.rmSync(target,{recursive:true,force:true});fs.renameSync(path.join(from,name),target);}
  }
  fs.rmSync(stage,{recursive:true,force:true});fs.rmSync(part,{force:true});
  }catch(error){/* a failed unpack leaves no half folder or archive behind; the next try starts clean */fs.rmSync(stage,{recursive:true,force:true});fs.rmSync(part,{force:true});throw error;}
  if(!this.installed(id))throw Error('安装不完整');
 }
}
// node:http(s) instead of fetch: follows GitHub's CDN redirects and streams with normal backpressure.
function fetchTo(url,file,job,hops=0){
 return new Promise((resolve,reject)=>{
  const lib=url.startsWith('https:')?require('node:https'):require('node:http');
  const req=lib.get(url,{headers:{'User-Agent':'MeguLit-runtime'},signal:job.controller.signal},res=>{
   if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();if(hops>8)return reject(Error('重定向过多'));return resolve(fetchTo(new URL(res.headers.location,url).toString(),file,job,hops+1));}
   if(res.statusCode!==200){res.resume();return reject(Error('HTTP '+res.statusCode));}
   job.total=Number(res.headers['content-length'])||job.total;
   const hash=createHash('sha256'),out=fs.createWriteStream(file);
   res.on('data',chunk=>{hash.update(chunk);job.received+=chunk.length;});
   res.on('error',e=>{out.destroy();reject(e);});out.on('error',reject);
   out.on('finish',()=>{if(job.total&&job.received<job.total)return reject(Error('下载不完整'));resolve(hash.digest('hex'));});
   res.pipe(out);
  });
  req.on('error',reject);
 });
}
module.exports={RuntimePacks,MARKERS,ON_DEMAND_FILES,mirrorUrl};
