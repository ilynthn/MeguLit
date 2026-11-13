'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Updates from GitHub Releases. On every start MeguLit checks the latest release; a newer one is downloaded in the
   background with real progress, verified (size, zip header, GitHub's sha256 digest) and kept in cache/update until the
   user restarts. A detached PowerShell script then waits for MeguLit to exit, copies the program files over the old ones
   and reopens it. data / logs / cache / runtime / models are never touched. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const REPO='https://api.github.com/repos/ilynthn/MeguLit/releases';
const ASSET=/^MeguLit-v(\d+)\.(\d+)\.(\d+)([a-z]?)-win-x64\.zip$/i;
const HOSTS=new Set(['github.com','objects.githubusercontent.com','release-assets.githubusercontent.com']);
/* User report (2026-11-09, mainland China): "restart and update" said download failed. GitHub downloads are often
   unreachable there, so the package also comes through the same relays the runtime installer uses. A relay only
   passes GitHub's own file along; the package must still match GitHub's sha256 digest, and without a digest no
   relay is used. China-looking systems (time zone / language) try the relays first. */
/* E289 (user report 2026-11-10, Henan: the download failed right at the end): ghfast.top added as a third relay; relays
   get the package digest as a query so a cached copy from before a same-version hotfix is never served. */
const MIRRORS=['https://gh-proxy.com/{url}','https://ghproxy.net/{url}','https://ghfast.top/{url}'];
const MIRROR_HOSTS=new Set(MIRRORS.map(m=>new URL(m.replace('{url}','')).hostname));
const inChina=()=>{try{const o=Intl.DateTimeFormat().resolvedOptions();return o.timeZone==='Asia/Shanghai'||o.timeZone==='Asia/Urumqi'||/^zh-CN/i.test(o.locale||'');}catch{return false;}};
function sources(rel,china=inChina()){const direct=[rel.url];if(!rel.digest)return direct;const fresh=rel.url+(rel.url.includes('?')?'&':'?')+'v='+String(rel.digest).slice(0,12);const relayed=MIRRORS.map(m=>m.replace('{url}',fresh));return china?[...relayed,...direct]:[...direct,...relayed];}
const updateLog=(root,line)=>{try{fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.appendFileSync(path.join(root,'logs','update.log'),new Date().toISOString()+' '+line+'\n');}catch{}};
const HEADERS={'User-Agent':'MeguLit-Updater','Accept':'application/vnd.github+json'};
/* E461 (user: players in mainland China, update_check "fetch failed"): api.github.com is often unreachable there, so the
   release JSON also comes from MeguLit's relay (api.megulit.com/api/release/..., GitHub's own answer cached 5 minutes);
   China-looking systems ask the relay first. The package itself is still checked against GitHub's sha256 digest. */
const RELAY_RELEASE='https://api.megulit.com/api/release/';
/* the relay host that answered fastest (api.megulit.com or its EdgeOne copy cn-api.megulit.com, see relay-config.cjs) */
function relayReleaseBase(){try{const base=require('./relay-config.cjs').relayBase(null);return base?base+'/api/release/':RELAY_RELEASE;}catch{return RELAY_RELEASE;}}
async function releaseFetch(fetcher,which,timeout,china=inChina()){
 const relayed=[...new Set([relayReleaseBase(),RELAY_RELEASE])].map(u=>u+which);const urls=china?[...relayed,REPO+'/'+which]:[REPO+'/'+which,...relayed];let last;
 for(const url of urls){try{const r=await fetcher(url,{headers:HEADERS,signal:AbortSignal.timeout(timeout)});if(r.ok||r.status===404)return r;last=r;}catch(e){last=e;}}
 if(last instanceof Error)throw last;return last;}
/* Hotfix letters (user 2026-11-10: 1.2.8a, 1.2.8b ...) are a display label only: the GitHub tag and the package name stay
   numeric (v1.2.8, MeguLit-v1.2.8-win-x64.zip) so every installed updater keeps working; a lettered hotfix is found by the
   package digest like any hotfix. The letter is dropped before comparing. */
const base=v=>String(v||'').trim().replace(/^v/,'').replace(/[a-z]+$/i,'');
/* E350 (user 2026-11-10: "修改以后的自动更新识别规则"): versions compare as major.minor.patch plus the hotfix letter
   (1.2.8 < 1.2.8a < 1.2.8b < 1.2.9), and a package named MeguLit-v1.2.8b-win-x64.zip is accepted, so later releases
   may carry the letter in the tag itself. */
/* Beta builds (user 2026-11-13: 1.4.9-beta.1 on branch beta, GitHub prereleases) sort below their stable release and
   above the one before it, so the stable 1.4.9 replaces a beta and 1.4.8 never pulls a beta user back. */
const parse=v=>{const s=String(v||'').trim().replace(/^v/,''),b=/^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/i.exec(s);if(b)return [+b[1],+b[2],+b[3],-1000+ +b[4]];const m=/^(\d+)\.(\d+)\.(\d+)([a-z]?)$/i.exec(s);if(!m)return base(v).split('.').map(n=>Number(n)||0).concat(0);return [+m[1],+m[2],+m[3],m[4]?m[4].toLowerCase().charCodeAt(0)-96:0];};
const newer=(a,b)=>{const x=parse(a),y=parse(b);for(let i=0;i<4;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;};

function asset(rel){
 const a=(rel.assets||[]).find(a=>ASSET.test(a.name));if(!a)throw Error('UPDATE_ASSET_MISSING');
 const url=new URL(a.browser_download_url);if(url.protocol!=='https:'||!HOSTS.has(url.hostname))throw Error('UPDATE_URL_REJECTED');
 return a;
}
async function latest(fetcher=fetch){
 const r=await releaseFetch(fetcher,'latest',15000);
 if(!r.ok)throw Error('UPDATE_CHECK_FAILED');
 const rel=await r.json(),a=asset(rel);
 return {version:String(rel.tag_name||'').replace(/^v/,''),name:a.name,size:a.size,url:a.browser_download_url,digest:/^sha256:[a-f0-9]{64}$/i.test(a.digest||'')?a.digest.slice(7).toLowerCase():'',hot:require('./hot-update.cjs').asset(rel),notes:String(rel.body||'').replace(/^> \*\*\[⬇[^\n]*\n*/m,'').slice(0,60000),page:rel.html_url,published:rel.published_at||''};
}
/* Size of the package the user is running, for "bigger / smaller than now". Unknown is fine. */
async function installedSize(current,fetcher=fetch){
 try{let r=await releaseFetch(fetcher,'tags/v'+String(current).replace(/^v/,''),10000);if(!r.ok&&base(current)!==String(current).replace(/^v/,''))r=await releaseFetch(fetcher,'tags/v'+base(current),10000);if(!r.ok)return 0;return asset(await r.json()).size||0;}catch{return 0;}
}

let state={phase:'idle'},job=null,found=null;
const status=()=>({...state});

/* v1.1.8 hotfixes: a release can be replaced in place under the same version. The package this install came from is
   remembered by GitHub's digest; the same version with a different digest online is offered as an update. A manual
   install has no record yet, so the first check simply records what is online. */
function installedFile(root){return root?path.join(root,'data','update-installed.json'):'';}
function readInstalled(root){try{return JSON.parse(fs.readFileSync(installedFile(root),'utf8'));}catch{return null;}}
function writeInstalled(root,value){if(!root)return;try{fs.mkdirSync(path.dirname(installedFile(root)),{recursive:true});fs.writeFileSync(installedFile(root),JSON.stringify(value));}catch{}}
function isHotfix(root,rel,current){/* a lettered app (1.2.8a) under a numeric tag (v1.2.8) is still that release: only a real lettered tag older than the app is skipped */if(base(rel.version)!==base(current)||/[a-z]$/i.test(String(rel.version))&&newer(current,rel.version))return false;current=String(rel.version);
 if(!root||!rel.digest||String(rel.version)!==String(current).replace(/^v/,''))return false;
 const mine=readInstalled(root);if(!mine||mine.version!==rel.version){writeInstalled(root,{version:rel.version,digest:rel.digest});return false;}
 return !!mine.digest&&mine.digest!==rel.digest;
}
// Updates made by an older version left MeguLit.rollback-update.exe next to MeguLit.exe; it moves into the rollback
// folder so the MeguLit folder holds a single program to start (user, 2026-11-09).
function tidyRollback(root){if(!root)return false;const old=path.join(root,'MeguLit.rollback-update.exe');try{if(!fs.existsSync(old))return false;const dir=path.join(root,'migration','update-rollback');fs.mkdirSync(dir,{recursive:true});const dest=path.join(dir,'MeguLit.exe');if(!fs.existsSync(dest))fs.renameSync(old,dest);else fs.rmSync(old,{force:true});return true;}catch{return false;}}
// A new version may bring a new icon; Windows keeps showing the old one from its icon cache until that is refreshed.
// Done once per installed version, also when the update itself was run by an older version's script.
function refreshIcons(root,current,run=(file,args)=>{const c=require('node:child_process').spawn(file,args,{detached:true,stdio:'ignore',windowsHide:true});c.on('error',()=>{});c.unref();}){
 if(!root||!current)return false;const mark=path.join(root,'data','icon-refresh.json');let seen='';try{seen=JSON.parse(fs.readFileSync(mark,'utf8')).version||'';}catch{}
 if(seen===String(current))return false;try{run(path.join(process.env.SystemRoot||'C:\\Windows','System32','ie4uinit.exe'),['-show']);fs.mkdirSync(path.dirname(mark),{recursive:true});fs.writeFileSync(mark,JSON.stringify({version:String(current)}));return true;}catch{return false;}
}
async function check(current,fetcher=fetch,root=''){current=String(current||'').trim().replace(/^v/,'');tidyRollback(root);refreshIcons(root,current);try{require('./uninstall.cjs').registerSoon(root,current);}catch{}
 const rel=await latest(fetcher),hotfix=isHotfix(root,rel,current),isNewer=newer(rel.version,current)||hotfix;
 /* a small package of only the changed files, when this install is exactly the one it was made from (hot-update.cjs) */
 const hot=isNewer&&root&&require('./hot-update.cjs').fits(rel.hot,current,readInstalled(root))?rel.hot:null;
 found=isNewer?{...rel,hotfix,useHot:!!hot}:null;
 const previous=isNewer&&!hot?await installedSize(current,fetcher):0;
 if(isNewer&&!['downloading','ready'].includes(state.phase))state={phase:'available',version:rel.version,total:hot?hot.size:rel.size,received:0,hot:!!hot};
 return {current,latest:rel.version,newer:isNewer,hotfix,hot:!!hot,hotSize:hot?hot.size:0,size:rel.size,previousSize:previous,delta:previous?rel.size-previous:null,notes:rel.notes,page:rel.page,published:rel.published,phase:state.phase};
}

/* Writes zip + script; resolves when the package is verified and ready to install.
   E289: a connection that drops near the end no longer throws the whole package away. What arrived is kept in `part`
   and the next try (same source again, then the next one) asks only for the rest with an HTTP Range request; a source
   that ignores the range sends the whole file and the kept part is replaced. The digest still checks the result. */
async function download(url,rel,fetcher=fetch,part={chunks:[],length:0}){
 const control=new AbortController();let idle=setTimeout(()=>control.abort(),30000);const poke=()=>{clearTimeout(idle);idle=setTimeout(()=>control.abort(),30000);};
 try{
  const from=rel.size&&part.length>0&&part.length<rel.size?part.length:0;if(!from){part.chunks=[];part.length=0;}
  const headers={'User-Agent':'MeguLit-Updater',...(from?{Range:'bytes='+from+'-'}:{})};
  const r=await fetcher(url,{headers,redirect:'follow',signal:AbortSignal.any?AbortSignal.any([control.signal,AbortSignal.timeout(600000)]):control.signal});
  if(!r.ok)throw Error('HTTP_'+r.status);
  const final=new URL(r.url||url);if(final.protocol!=='https:'||!(HOSTS.has(final.hostname)||MIRROR_HOSTS.has(final.hostname)))throw Error('UPDATE_URL_REJECTED');
  if(from&&r.status!==206){part.chunks=[];part.length=0;}
  state.received=part.length;poke();
  if(r.body&&r.body.getReader){const reader=r.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;poke();const b=Buffer.from(value);part.chunks.push(b);part.length+=b.length;state.received=part.length;}}
  else{const b=Buffer.from(await r.arrayBuffer());part.chunks.push(b);part.length+=b.length;state.received=part.length;}
  const data=Buffer.concat(part.chunks);
  if(rel.size&&data.length<rel.size)throw Error('UPDATE_INCOMPLETE');
  if(rel.size&&data.length!==rel.size){part.chunks=[];part.length=0;throw Error('UPDATE_SIZE_MISMATCH');}
  if(data.subarray(0,2).toString('latin1')!=='PK'){part.chunks=[];part.length=0;throw Error('UPDATE_NOT_ZIP');}
  if(rel.digest&&crypto.createHash('sha256').update(data).digest('hex')!==rel.digest){part.chunks=[];part.length=0;throw Error('UPDATE_HASH_MISMATCH');}
  return data;
 }catch(error){throw Error(control.signal.aborted&&!/^UPDATE_/.test(error.message)?'STALLED':error.message);}finally{clearTimeout(idle);}
}
function start(root,current,fetcher=fetch){current=String(current||'').trim().replace(/^v/,'');
 if(job)return job;
 job=(async()=>{
  try{
   let rel=found&&(newer(found.version,current)||found.hotfix)?found:await latest(fetcher);if(!newer(rel.version,current)&&!rel.hotfix)throw Error('ALREADY_LATEST');
   const dir=path.join(root,'cache','update');fs.mkdirSync(dir,{recursive:true});
   const full=rel.digest;if(rel.useHot&&rel.hot)rel={...rel.hot,version:rel.version,isHot:true};
   const zip=path.join(dir,rel.name),ps1=path.join(dir,'apply-update.ps1');
   state={phase:'downloading',version:rel.version,total:rel.size||0,received:0,hot:!!rel.isHot};
   let data=null;
   /* A package downloaded earlier (user chose "later") is reused when it still verifies. */
   if(fs.existsSync(zip)){const old=fs.readFileSync(zip);if((!rel.size||old.length===rel.size)&&(!rel.digest||crypto.createHash('sha256').update(old).digest('hex')===rel.digest))data=old;}
   /* One source after another; a source that stalls for 30 s, fails or delivers a different file is skipped. A
      size or digest mismatch on every source usually means the release was replaced meanwhile (hotfix), so the
      release is read again once and the download repeated. */
   let pick=rel;
   for(let round=0;!data&&round<2;round++){
    if(round&&pick.isHot)break;
    if(round){try{const fresh=await latest(fetcher);if(fresh.digest===pick.digest&&fresh.size===pick.size)break;pick=fresh;state.total=fresh.size||0;}catch{break;}}
    const part={chunks:[],length:0};
    for(const url of sources(pick)){
     // A source that delivered part of the file gets two more tries to finish it before the next source continues.
     for(let attempt=0;!data&&attempt<3;attempt++){
      const before=part.length;
      try{data=await download(url,pick,fetcher,part);}
      catch(error){updateLog(root,'download failed '+new URL(url).hostname+' '+error.message+' at '+part.length+'/'+(pick.size||0));if(part.length<=before)break;}
     }
     if(data)break;
    }
   }
   if(!data)throw Error('UPDATE_DOWNLOAD_FAILED');
   rel=pick;const hash=crypto.createHash('sha256').update(data).digest('hex');
   fs.writeFileSync(zip,data);
   if(rel.isHot){state={phase:'ready',version:rel.version,total:data.length,received:data.length,sha256:full,zip,hot:true};return status();}
   fs.writeFileSync(ps1,'﻿'+script(),'utf8');
   state={phase:'ready',version:rel.version,total:data.length,received:data.length,sha256:hash,zip,ps1};
   return status();
  }catch(error){if(found)found.useHot=false;/* a failed hot download falls back to the full package on retry */state={...state,phase:'error',error:/^[A-Z_]+$/.test(error.message)?error.message:'UPDATE_DOWNLOAD_FAILED'};job=null;throw Error(state.error);}
 })();
 job.catch(()=>{});
 return job;
}

/* Hands the verified package to the script; the caller then quits MeguLit.
   v1.1.2 (user, 2026-11-09: "restart and update" reopened the same version, logs/update.log never appeared): a detached
   powershell.exe started from MeguLit's service exits at once without running anything, and a plain child dies with
   MeguLit. The script is therefore started by Windows itself through WMI (Win32_Process.Create), outside MeguLit's
   process tree, and the launcher's return code is checked before MeguLit is allowed to quit. */
function launchScript(root,{run=spawn}={}){
 /* v1.1.4: Windows 11 hands console programs to Windows Terminal, which ignores -WindowStyle Hidden and showed the
    script's progress window. conhost --headless runs it with no window at all; the startup info also asks for SW_HIDE. */
 const line=`conhost.exe --headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${state.ps1}" -Root "${root}" -Zip "${state.zip}"`;
 const create='$s=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0};$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$env:MEGULIT_UPDATE_COMMAND;ProcessStartupInformation=$s};exit [int]$r.ReturnValue';
 return new Promise(resolve=>{
  let child;try{child=run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',create],{stdio:'ignore',windowsHide:true,env:{...process.env,MEGULIT_UPDATE_COMMAND:line}});}catch{resolve(false);return;}
  const timer=setTimeout(()=>resolve(false),20000);
  child.on('error',()=>{clearTimeout(timer);resolve(false);});
  child.on('exit',code=>{clearTimeout(timer);resolve(code===0);});
 });
}
async function install(root,options){
 if(state.phase!=='ready'||!state.zip||!fs.existsSync(state.zip))throw Error('UPDATE_NOT_READY');
 if(state.hot){
  /* written in place while MeguLit runs; the page then calls hot_reload. A failure leaves the old files and offers the full package. */
  try{require('./hot-update.cjs').apply(root,state.zip,options);}catch(error){updateLog(root,'hot update failed '+error.message);if(found)found.useHot=false;job=null;state={...state,phase:'error',hot:false,error:/^[A-Z_]+$/.test(error.message)?error.message:'HOT_APPLY_FAILED'};throw Error(state.error);}
  writeInstalled(root,{version:state.version,digest:state.sha256||''});updateLog(root,'hot update applied '+state.version);
  try{fs.rmSync(state.zip,{force:true});}catch{}
  state={...state,phase:'installed'};job=null;return {...status(),hot:true};
 }
 fs.mkdirSync(path.join(root,'logs'),{recursive:true});
 if(!/^[^"]+$/.test(root+state.ps1+state.zip))throw Error('UPDATE_PATH_REJECTED');
 if(!await launchScript(root,options))throw Error('UPDATE_LAUNCH_FAILED');
 writeInstalled(root,{version:state.version,digest:state.sha256});
 state={...state,phase:'installing'};return status();
}
async function apply(root,current,fetcher=fetch){await start(root,current,fetcher);return {...await install(root),staged:true};}

/* Runs after MeguLit has exited: only files that exist in the zip are copied. */
function script(){return `param([string]$Root,[string]$Zip)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$log=Join-Path $Root 'logs\\update.log'
New-Item -ItemType Directory -Force (Split-Path $log) -ErrorAction SilentlyContinue | Out-Null
function Log($m){try{Add-Content -LiteralPath $log -Value ((Get-Date -Format o)+' '+$m) -Encoding utf8}catch{}}
try{
 Log "start $Zip"
 $exe=Join-Path $Root 'MeguLit.exe'
 for($i=0;$i -lt 60;$i++){ if(-not (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })){break}; Start-Sleep -Milliseconds 500 }
 Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
 Start-Sleep -Milliseconds 800
 $stage=Join-Path $Root 'cache\\update\\stage'
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
 Expand-Archive -LiteralPath $Zip -DestinationPath $stage -Force
 $src=Join-Path $stage 'MeguLit'
 if(-not (Test-Path (Join-Path $src 'MeguLit.exe'))){throw 'zip has no MeguLit\\MeguLit.exe'}
 # The previous version is kept in migration\\update-rollback (user, 2026-11-09: a second exe next to MeguLit.exe
 # confused people about which one to start). The whole program is kept, not only the exe, so a rollback is complete.
 $bak=Join-Path $Root 'migration\\update-rollback'
 New-Item -ItemType Directory -Force $bak | Out-Null
 & robocopy $Root $bak /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /XD data logs cache runtime models migration /XF MeguLit.rollback-update.exe | Out-Null
 if($LASTEXITCODE -ge 8){throw "backup failed $LASTEXITCODE"}
 Remove-Item -LiteralPath (Join-Path $Root 'MeguLit.rollback-update.exe') -Force -ErrorAction SilentlyContinue
 Log 'backed up previous version'
 & robocopy $src $Root /E /R:5 /W:1 /NFL /NDL /NJH /NJS /XD data logs cache runtime models | Out-Null
 if($LASTEXITCODE -ge 8){throw "robocopy failed $LASTEXITCODE"}
 Log 'copied'
 Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue
}catch{ Log ('failed: '+$_) }
# A new icon must show at once: refresh the shell's icon cache (the system's own tool; Explorer keeps running).
try{ & (Join-Path $env:SystemRoot 'System32\\ie4uinit.exe') -show; Log 'icon cache refreshed' }catch{}
$started=Start-Process -FilePath (Join-Path $Root 'MeguLit.exe') -WorkingDirectory $Root -PassThru
Log 'restarted'
# A new version that crashes right after start is replaced by the kept previous version and started again.
try{
 Start-Sleep -Seconds 20
 $bak=Join-Path $Root 'migration\\update-rollback'
 if($started -and $started.HasExited -and $started.ExitCode -ne 0 -and (Test-Path (Join-Path $bak 'MeguLit.exe'))){
  Log ('new version exited with '+$started.ExitCode+'; rolling back')
  & robocopy $bak $Root /E /R:5 /W:1 /NFL /NDL /NJH /NJS | Out-Null
  try{Remove-Item -LiteralPath (Join-Path $Root 'data\\update-installed.json') -Force -ErrorAction SilentlyContinue}catch{}
  Start-Process -FilePath (Join-Path $Root 'MeguLit.exe') -WorkingDirectory $Root
  Log 'rolled back'
 }
}catch{ Log ('rollback check failed: '+$_) }
`;}
function reset(){state={phase:'idle'};job=null;found=null;}
module.exports={refreshIcons,tidyRollback,sources,check,start,status,install,apply,newer,latest,installedSize,reset,launchScript};
