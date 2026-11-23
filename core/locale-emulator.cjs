// SPDX-License-Identifier: GPL-3.0-or-later
// Portable Locale Emulator integration, using the upstream non-admin Japanese profile
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile,spawn}=require('node:child_process');
const RELEASE='2.5.0.1',URL='https://github.com/xupefei/Locale-Emulator/releases/download/v2.5.0.1/Locale.Emulator.2.5.0.1.zip';
// Pinned official package (size + sha256), so the same file may also come through a relay when GitHub is slow or
// unreachable (user report 2026-11-09, mainland China); a relay only passes GitHub's own file along.
const SHA256='808ff584426d52cc775ad6406da00622f454be95bd4c8fbca42eef4b7235ad5c',SIZE=154135;
/* E??? (user, 2026-11-13): MeguLit's own mirror first in mainland China (dl.megulit.com/gh/..., GitHub's own file
   cached in R2), then the gh relays, then GitHub itself. The size and sha256 above still decide. */
const GH_PATH=URL.replace('https://github.com/','');
const DL=['https://dl.megulit.com/gh/'+GH_PATH,'https://cn-dl.megulit.com/gh/'+GH_PATH];
/* 2026-11-20: relays from setup/runtime.json through core/download-sources.cjs (the list setup uses too) */
const RELAYS=(()=>{try{const r=require('./download-sources.cjs').relays().map(m=>m.url.replace('{url}',URL));if(r.length)return r;}catch{}return ['https://gh-proxy.com/'+URL,'https://ghproxy.net/'+URL];})();
const inChina=()=>{try{const o=Intl.DateTimeFormat().resolvedOptions();return o.timeZone==='Asia/Shanghai'||o.timeZone==='Asia/Urumqi'||/^zh-CN/i.test(o.locale||'');}catch{return false;}};
const SOURCES=inChina()?[...[...DL].reverse(),...RELAYS,URL]:[URL,...DL,...RELAYS];
const REQUIRED=['LEProc.exe','LECommonLibrary.dll','LoaderDll.dll','LocaleEmulator.dll'];
const GUID='b56f4ea1-f9ac-418a-add7-653dc2302e91';
const XML=`<?xml version="1.0" encoding="utf-8"?><LEConfig><Profiles><Profile Name="Run in Japanese" Guid="${GUID}" MainMenu="false"><Parameter></Parameter><Location>ja-JP</Location><Timezone>Tokyo Standard Time</Timezone><RunAsAdmin>false</RunAsAdmin><RedirectRegistry>true</RedirectRegistry><IsAdvancedRedirection>false</IsAdvancedRedirection><RunWithSuspend>false</RunWithSuspend></Profile></Profiles></LEConfig>`;
const run=(file,args,timeout=30000)=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout,encoding:'utf8'},(e,out)=>e?reject(e):resolve(out)));
function profile(dir){try{const xml=fs.readFileSync(path.join(dir,'LEConfig.xml'),'utf8');
 for(const m of xml.matchAll(/<Profile\b([^>]*)>([\s\S]*?)<\/Profile>/g)){const a=m[1],body=m[2],guid=/\bGuid="([0-9a-f-]{36})"/i.exec(a)?.[1];
  if(guid&&/<Location>\s*ja-JP\s*<\/Location>/i.test(body)&&!/<RunAsAdmin>\s*true\s*</i.test(body)&&!/<RunWithSuspend>\s*true\s*</i.test(body)&&!/<Parameter>\s*[^<\s]/i.test(body))return guid;}
 }catch{}return '';}
function complete(dir){return REQUIRED.every(n=>{try{return fs.statSync(path.join(dir,n)).isFile();}catch{return false;}});}
function peInfo(file){try{const fd=fs.openSync(file,'r');try{
 const head=Buffer.alloc(64);if(fs.readSync(fd,head,0,64,0)!==64||head.readUInt16LE(0)!==0x5a4d)return {};
 const pe=Buffer.alloc(24);if(fs.readSync(fd,pe,0,24,head.readUInt32LE(60))!==24||pe.readUInt32LE(0)!==0x4550)return {};
 return {machine:pe.readUInt16LE(4),dll:(pe.readUInt16LE(22)&0x2000)!==0};
}finally{fs.closeSync(fd);}}catch{return {};}}
function x86(exe){return peInfo(exe).machine===0x14c;}
// Siglus is Unicode internally and needs no Japanese locale; under the emulator it could not see fonts installed
// for the current user only (CLANNAD HD: "未发现字体 Noto Sans Mono CJK SC", E215.2), so it is not recommended there.
/* #376 (CLANNAD HD, 2026-11-17): a program with Steam's steam_api beside it is started by Steam or with its app id; under the
   Japanese-environment helper its Steam start fails (「Steam の初期化に失敗しました」, no window). Such a folder is never
   started through the helper, whatever the record says (Steam builds are Unicode). */
function steamApi(exe){try{
 const dir=path.dirname(String(exe||''));
 if(fs.readdirSync(dir).some(n=>/^steam_api(64)?\.dll$/i.test(n)))return true;
 /* Unity keeps Steam's native plugin under its matching player data folder, rather than beside the executable.
    A restored Japanese launch must keep the same no-emulator rule for these builds (星空列车: Plugins/x86). */
 const data=path.join(dir,path.basename(exe,path.extname(exe))+'_Data');
 if(!fs.statSync(path.join(data,'globalgamemanagers'),{throwIfNoEntry:false})?.isFile())return false;
 const {machine}=peInfo(exe);if(machine!==0x14c&&machine!==0x8664)return false;
 const is32=machine===0x14c,plugin=peInfo(path.join(data,'Plugins',is32?'x86':'x86_64',is32?'steam_api.dll':'steam_api64.dll'));
 return plugin.machine===machine&&plugin.dll===true;
}catch{return false;}}
function recommended(game,exe){return game.source!=='steam'&&!steamApi(exe)&&!require('./locale-policy.cjs').chineseSystem4Patch(exe)&&/YU-RIS|BGI|KiriKiri|RealLive|CatSystem|AdvHD|WillPlus|Majiro|QLIE|SoftPal|NeXAS|System4|ShiinaRio|Entis|Cotopha|NScripter|LiveMaker/i.test(game.engine||'')&&x86(exe);}
class LocaleEmulator{
 constructor(root,fetcher=(...a)=>fetch(...a)){this.fetch=fetcher;this.root=root;this.dir=path.join(root,'runtime','locale-emulator');this.job=null;this.cached=null;}
 async status(refresh=false){
  if(!refresh&&this.cached&&Date.now()-this.cached.at<15000)return {...this.cached.value,job:this.job};
  const dirs=[];try{const chosen=JSON.parse(fs.readFileSync(path.join(this.root,'data/config/library.json'),'utf8')).localePath;if(chosen)dirs.push(path.extname(chosen)?path.dirname(chosen):chosen);}catch{}dirs.push(this.dir);
  if(!dirs.some(dir=>complete(dir)&&profile(dir))){
   const uri=await require('./registry-string.cjs').registryString('HKEY_CLASSES_ROOT\\CLSID\\{C52B9871-E5E9-41FD-B84D-C5ACADBEC7AE}\\InprocServer32','CodeBase',2500);
   // The .NET Framework installer stores literal paths. Also accept escaped file URIs.
   const literal=/^file:\/\/\/([a-z]:\/.*)$/i.exec(uri);
   if(/^file:\/\/\//i.test(uri)&&!/[?#]/.test(uri))try{dirs.push(path.dirname(require('node:url').fileURLToPath(uri)));}catch{}
   if(literal)dirs.push(path.win32.dirname(path.win32.normalize(literal[1])));
  }
  const home=process.env.USERPROFILE||'';
  for(const base of [path.join(home,'Downloads'),path.join(home,'Desktop'),path.dirname(this.root),process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean)){
   try{for(const e of fs.readdirSync(base,{withFileTypes:true}))if(e.isDirectory()&&/locale[ ._-]*emulator/i.test(e.name))dirs.push(path.join(base,e.name));}catch{}
  }
  let incomplete='';for(const dir of new Set(dirs)){if(complete(dir)&&profile(dir)){const value={installed:true,path:path.join(dir,'LEProc.exe'),profile:profile(dir),dir,installDir:this.dir};this.cached={at:Date.now(),value};return {...value,job:this.job};}if(fs.existsSync(dir)&&!incomplete)incomplete=dir;}
  const value={installed:false,path:'',dir:'',installDir:this.dir,incompletePath:incomplete};this.cached={at:Date.now(),value};return {...value,job:this.job};
 }
 async install(){
  if(this.job&&['downloading','extracting'].includes(this.job.state))return this.status();
  this.job={state:'downloading',received:0,total:154135,error:''};
  this.installing=this.prepare().then(()=>{this.job.state='done';this.cached=null;}).catch(e=>{this.job.state='error';fs.appendFileSync(path.join(this.root,'logs','locale-emulator.log'),new Date().toISOString()+' '+String(e.message||e)+'\n');this.job.error=/^LE_[A-Z_]+$/.test(e.message)?e.message:'LE_INSTALL_FAILED';});
  return this.status();
 }
 // Launch-time install (user report 2026-11-09: the message sent people to an install button that no longer exists):
 // download and set up Locale Emulator, wait for it, and report whether it is ready now.
 async ensure(){
  let s=await this.status(true);if(s.installed)return s;
  await this.install();await this.installing?.catch(()=>{});
  s=await this.status(true);if(!s.installed)throw Error(this.job?.error==='LE_DOWNLOAD_FAILED'?'LOCALE_EMULATOR_DOWNLOAD_FAILED':'LOCALE_EMULATOR_REQUIRED');
  return s;
 }
 async prepare(){
  const cache=path.join(this.root,'cache');fs.mkdirSync(cache,{recursive:true});
  const zip=path.join(cache,'Locale.Emulator.'+RELEASE+'.zip');
  const stage=this.dir+'.stage-'+crypto.randomUUID();
  try{
   let bytes=null;const cached=fs.existsSync(zip)?fs.readFileSync(zip):null;
   if(cached&&cached.length===SIZE&&crypto.createHash('sha256').update(cached).digest('hex')===SHA256)bytes=cached;
   /* 2026-11-19: core/fast-download.cjs asks every source at once and keeps the fastest (the file is small, the
      measurement usually brings all of it); size, zip header and SHA-256 still decide */
   if(!bytes){
    try{await require('./fast-download.cjs').download({urls:SOURCES,dest:zip,size:SIZE,sha256:SHA256,fetch:this.fetch,onProgress:p=>{this.job.received=p.received;},log:line=>{try{fs.appendFileSync(path.join(this.root,'logs','locale-emulator.log'),new Date().toISOString()+' download '+line+'\n');}catch{}}});
     const got=fs.readFileSync(zip);if(got.readUInt32LE(0)!==0x04034b50){fs.rmSync(zip,{force:true});throw Error('LE_PACKAGE_INVALID');}bytes=got;}
    catch(e){try{fs.appendFileSync(path.join(this.root,'logs','locale-emulator.log'),new Date().toISOString()+' result '+(/^(HASH|SIZE)_MISMATCH$/.test(e.code||'')?'LE_PACKAGE_INVALID':String(e.message||e))+'\n');}catch{}}
   }
   if(!bytes)throw Error('LE_DOWNLOAD_FAILED');
   this.job.state='extracting';
   const script=`import sys,zipfile,pathlib\nz=zipfile.ZipFile(sys.argv[1]); root=pathlib.Path(sys.argv[2]).resolve(); root.mkdir(parents=True)\nfor e in z.infolist():\n p=(root/e.filename).resolve()\n if not p.is_relative_to(root) or e.file_size>20000000 or (e.external_attr>>16)&0o170000==0o120000: raise ValueError('Unsafe archive entry')\nz.extractall(root)\n`;
   const python=path.join(this.root,'runtime','python','python.exe');
   // Without MeguLit's Python (reading components not installed) Windows' own tar unpacks the zip.
   if(fs.existsSync(python))await run(python,['-c',script,zip,stage]);
   else{fs.mkdirSync(stage,{recursive:true});await run(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',zip,'-C',stage]);}
   await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'extract-locale.ps1'),'-Installer',path.join(stage,'LEInstaller.exe'),'-OutputDirectory',stage]);
   if(!complete(stage))throw Error('LE_COMPONENTS_MISSING');
   // A private portable configuration prevents an application profile or global admin profile taking priority
   fs.writeFileSync(path.join(stage,'LEConfig.xml'),XML,'utf8');
   fs.writeFileSync(path.join(stage,'TOME-INSTALL.json'),JSON.stringify({version:RELEASE,publisher:'xupefei / Locale-Emulator',initialized:true,initialization:'official installer embedded resources',url:URL,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),installedAt:new Date().toISOString()},null,2));
   fs.mkdirSync(path.dirname(this.dir),{recursive:true});if(fs.existsSync(this.dir))fs.renameSync(this.dir,this.dir+'.backup-'+Date.now());fs.renameSync(stage,this.dir);
  }finally{if(path.dirname(stage)===path.dirname(this.dir)&&stage.startsWith(this.dir+'.stage-'))try{fs.rmSync(stage,{recursive:true,force:true});}catch{}}
 }
 async processes(exe){const output=await new Promise((resolve,reject)=>execFile(path.join(this.root,'native','GalWindowBridge.exe'),['--process-status',exe],{windowsHide:true,timeout:2500,encoding:'utf8'},(error,out)=>error?reject(Error('LE_PROCESS_CHECK_FAILED')):resolve(out)));const result=JSON.parse(output.trim());if(result.type!=='gameProcesses'||!Array.isArray(result.processes))throw Error('LE_PROCESS_CHECK_FAILED');return result.processes;}
 async launch(exe,{trace=()=>{},alsoExe=''}={}){
  /* 2026-11-16 (user: 启动游戏后很久才绑定窗口): a DRM/launcher program started in the Japanese environment may never show a
     window of its own (2DJGAME 打开游戏.exe starts the engine and idles hidden), so waiting for the launcher alone sat out
     the whole 15 s timeout before MeguLit even looked for the game. With alsoExe the game program's visible window counts too. */
  const also=alsoExe&&alsoExe.toLowerCase()!==exe.toLowerCase()?alsoExe:'';
  const withAlso=async found=>{if(!also)return found;const game=await this.processes(also).catch(()=>[]);return game.some(p=>p.visible)?game:found.length?found:game;};
  if(!x86(exe))throw Error('LE_X86_ONLY');
  const s=await this.status();if(!s.installed)return {needLocaleEmulator:true,...s};
  const launchExe=require('../services/launch-path.cjs').compatiblePath(this.root,exe);
  const {startProcess,waitForVisibleGame}=require('../services/game-readiness.cjs');
  /* E333 (user 2026-11-10, 女装山脈): LEProc sometimes crashes on start (0xC0000005) before the game appears; the next
     try works. A crash with no game process is retried twice before it is reported. */
  let result;
  /* Text architecture ①: with 文字显示 = compositor the game is created through LE's loader by MeguLitLaunch32 (dots before
     the first glyph, core/glyph-dots.cjs); any failure falls back to LEProc below with the late attach */
  const early=require('./glyph-dots.cjs').earlyLocale(this.root,s.dir,launchExe);
  /* ③ dot font rides along the same launcher (MEGULIT_LAUNCH_EXTRA, crash canary keyed on the launched program) */
  const fontDot=early?require('./text-paths-launch.cjs').fontDot(this.root,launchExe,early,trace):null;
  if(early){try{const child=await startProcess(early.file,early.args,path.dirname(launchExe),'LE_SPAWN_FAILED',spawn,early.env);trace('locale-early-started',{pid:child.pid});
    result=await waitForVisibleGame(async()=>{const matches=await this.processes(launchExe);return withAlso(matches.length||launchExe===exe?matches:await this.processes(exe));},{exit:()=>child.exit,helper:true,trace});
    if(fontDot)fontDot.watch(result.pid);
    return {localeJapanese:true,localePath:s.path,gamePid:result.pid,early:true};}
   catch(error){trace('locale-early-failed',{error:error.message});if(fontDot)fontDot.canary.exited('fontdot',0);
    /* the game did start through the launcher, its window just took longer than the wait: LEProc would start a second copy */
    if(error.message==='GAME_WINDOW_NOT_READY'){let running=[];try{running=await this.processes(launchExe);if(!running.length&&launchExe!==exe)running=await this.processes(exe);}catch{}
     running=await withAlso(running);
     if(running.length){trace('locale-early-slow-window',{pid:running[0].pid});throw error;}}}}
  for(let attempt=0;;attempt++){
   const child=await startProcess(s.path,['-runas',s.profile,launchExe],path.dirname(launchExe),'LE_SPAWN_FAILED',spawn);
   trace('locale-helper-started',{pid:child.pid,alias:launchExe!==exe,...(attempt?{retry:attempt}:{})});
   try{result=await waitForVisibleGame(async()=>{
     const matches=await this.processes(launchExe);
     return withAlso(matches.length||launchExe===exe?matches:await this.processes(exe));
    },{exit:()=>child.exit,helper:true,trace});break;}
   catch(error){const code=child.exit?.code;if(error.message!=='LE_HELPER_FAILED'||attempt>=2||!(code===3221225477||code===-1073741819))throw error;
    trace('locale-helper-retry',{code,attempt:attempt+1});await new Promise(r=>setTimeout(r,400));}
  }
  return {localeJapanese:true,localePath:s.path,gamePid:result.pid};
 }
}
module.exports={LocaleEmulator,profile,complete,x86,steamApi,recommended,RELEASE,URL};
