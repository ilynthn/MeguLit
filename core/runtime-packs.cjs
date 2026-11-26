// SPDX-License-Identifier: GPL-3.0-or-later
// Optional runtime packs for the slim release. setup/runtime.json lists each pack (zip of runtime/<...>)
// with its download URLs, SHA-256, download size and unpacked size. The first-launch window installs
// "base" (and optionally the rest); this store lets Settings install the remaining packs later.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');

/* E383 a mirror template may use {url} (whole GitHub URL), or {tag} and {file} (release tag and file name) for our own mirror dl.megulit.com */
const mirrorUrl=(template,url)=>require('./download-sources.cjs').fill(typeof template==='string'?template:template.url,url);
const MARKERS={base:'runtime/node.exe',reading:'runtime/reading/sudachidict_full/resources/system.dic',voice:'runtime/aivis/run.exe',archives:'runtime/garbro/ArcFormats.dll','archives-legacy':'runtime/garbro-legacy/ArcFormats.dll','runtime-dump':'runtime/runtime-dump/MeguLitDump64.dll','unity-text':'runtime/unity-text/MeguLitUnityText.dll','disc-mount':'runtime/wincdemu/WinCDEmu-4.1.exe'};
/* E470 "archives": GARbro (morkt, MIT) downloaded only when a game's scripts sit in an archive MeguLit's own readers cannot open.
   onDemand packs are left out of "download full", unpack into their own dest folder (the upstream release is not laid out as runtime/...)
   and can be removed again in Settings. */
const ON_DEMAND_FILES=['GameRes.dll','ArcFormats.dll','GameData/Formats.dat'];
/* 2026-11-13 "runtime-dump" (docs/runtime-dump-pack.md): MeguLitDump32/64.dll, a cold pack the user never sees. It is
   "hidden": left out of status() (no row in Settings, nothing to switch), never removable, fetched by core/hook-native.cjs
   in the background the first time a game is hooked and injected by HookBridge once it is on disk. A pack may name the
   files that make it complete with "files"; without it the GARbro list above applies. */
/* contract of an installed pack (its pack.json), 0 when there is none */
const packContract=dir=>{try{return +JSON.parse(fs.readFileSync(path.join(dir,'pack.json'),'utf8').replace(/^﻿/,'')).contract||0;}catch{return 0;}};
const packFiles=pack=>Array.isArray(pack?.files)&&pack.files.length?pack.files:ON_DEMAND_FILES;
/* Download the original Sysprogs executable directly. Our mirrors host MeguLit release assets only. */
function packSources(id,pack,{china=false,mirrors=[]}={}){
 if(id==='disc-mount')return pack.urls||[];
 const sources=require('./download-sources.cjs');
 return (pack.urls||[]).flatMap(u=>sources.expand(u,{china,list:sources.normalize(mirrors)}));
}

const SHARED=new Map();
class RuntimePacks{
 /* one store per install root, so Settings and the readers that fetch a pack on demand see the same jobs */
 static shared(root){const k=path.resolve(root).toLowerCase();if(!SHARED.has(k))SHARED.set(k,new RuntimePacks(root));return SHARED.get(k);}
 constructor(root){this.root=root;this.jobs={};}
 /* parsed once per change of runtime.json: installed() and status() ask for it on every reader and Settings poll */
 manifest(){const f=path.join(this.root,'setup','runtime.json');let k='';try{const s=fs.statSync(f);k=s.size+'|'+s.mtimeMs;}catch{}if(k&&this.manifestKey===k)return this.manifestCache;
  let m;try{m=JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));}catch{m={packs:{}};}this.manifestKey=k;this.manifestCache=m;return m;}
 installed(id){const marker=MARKERS[id];if(!marker||!fs.existsSync(path.join(this.root,marker)))return false;const p=this.manifest().packs?.[id],dest=p?.dest;
   if(id==='disc-mount'){
    const file=path.join(this.root,marker),stat=fs.statSync(file),key=stat.size+'|'+stat.mtimeMs+'|'+stat.ctimeMs;
    if(this.discFileKey!==key){this.discFileValid=require('./disc-tools.cjs').matches(file,'installer');this.discFileKey=key;}
    return this.discFileValid;
   }
   if(!dest)return true;if(!packFiles(p).every(f=>fs.existsSync(path.join(this.root,dest,f))))return false;
   /* 2026-11-21 (P0, runtime-dump: the 2026-11-13 pack kept a stack overflow its source had fixed; files present = installed, so it was never fetched again): a manifest entry may name the pack contract it needs; an installed pack.json below it is not installed, and the pack is fetched again */
   return packContract(path.join(this.root,dest))>=(+p.contract||0);}
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
  const part=id==='disc-mount'?path.join(this.root,MARKERS[id]):path.join(this.root,'runtime-'+id+'.zip'),stage=path.join(this.root,'runtime-'+id+'.unpack');
  /* 2026-11-19 (hundreds of mainland players: downloads crawled, stuck on dl.megulit.com): core/fast-download.cjs measures
     every source at once and pulls Range pieces from the fast ones in parallel; a slow or silent connection is moved to
     another source, finished pieces survive a retry (runtime-<id>.zip.part.json). Mainland China (time zone / locale, no IP
     lookup) still lists the mirrors first; SHA-256 has to match. */
  /* 2026-11-20: sources and their order from the same setup/runtime.json "mirrors" list setup uses (core/download-sources.cjs) */
  const china=require('./fast-download.cjs').inChina();
  const all=packSources(id,pack,{china,mirrors:this.manifest().mirrors||[]});
  if(!all.length)throw Error('没有下载地址');
  job.state='downloading';job.stage='download';job.received=0;job.controller=new AbortController();
  try{
   await require('./fast-download.cjs').download({urls:all,china,dest:part,size:pack.size||0,sha256:pack.sha256,signal:job.controller.signal,userAgent:'MeguLit-runtime',
    onProgress:p=>{job.received=p.received;if(p.total)job.total=p.total;},log:line=>{try{fs.mkdirSync(path.join(this.root,'logs'),{recursive:true});fs.appendFileSync(path.join(this.root,'logs','runtime-download.log'),new Date().toISOString()+' '+id+' '+line+'\n');}catch{}}});
  }catch(error){throw /^(HASH|SIZE)_MISMATCH$/.test(error.code||'')?Error('文件校验失败'):error.code==='ABORTED'?error:Error(String(error.message||error).replace(/^DOWNLOAD_FAILED /,''));}
  if(id==='disc-mount'){if(!this.installed(id))throw Error('DISC_INSTALLER_INVALID');return;}
  job.stage='unpack';
  try{
  fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});
  await new Promise((resolve,reject)=>{const p=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',part,'-C',stage],{windowsHide:true});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('解压失败')));});
  if(pack.dest){/* whole release into its own folder; swap in atomically so a failed unpack leaves the old copy */
   const to=path.resolve(this.root,pack.dest);if(!to.startsWith(path.resolve(this.root,'runtime')+path.sep))throw Error('PACK_DEST_OUTSIDE');
   const files=packFiles(pack),top=fs.readdirSync(stage),from=top.length===1&&fs.statSync(path.join(stage,top[0])).isDirectory()&&!files.some(f=>fs.existsSync(path.join(stage,f)))?path.join(stage,top[0]):stage;
   if(!files.every(f=>fs.existsSync(path.join(from,f))))throw Error('安装不完整');
   /* 2026-11-27 a release that ships no licence text (GARbro-Mod 1.0.2.3) gets the one kept in core/runtime-licenses (licenseFile) */
   if(pack.licenseFile){const lic=path.join(__dirname,'runtime-licenses',path.basename(String(pack.licenseFile)));if(fs.existsSync(lic)&&!fs.existsSync(path.join(from,'LICENSE.txt')))fs.copyFileSync(lic,path.join(from,'LICENSE.txt'));}
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
module.exports={RuntimePacks,packContract,MARKERS,ON_DEMAND_FILES,mirrorUrl,packSources};
