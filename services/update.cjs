'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Updates from GitHub Releases. On every start MeguLit checks the latest release; a newer one is downloaded in the
   background with real progress, verified (size, zip header, GitHub's sha256 digest) and kept in cache/update until the
   user restarts. A detached PowerShell script then waits for MeguLit to exit, copies the program files over the old ones
   and reopens it. data / logs / cache / runtime / models / Anki are never touched. */
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
/* E??? (user report 2026-11-13: "更新显示下载失败"): the site's own R2 mirror (dl.megulit.com, what the
   download buttons on megulit.com use) is tried as well. It serves GitHub's own package by file name, supports Range
   requests and is reachable in mainland China when GitHub and the gh proxies are not; the sha256 digest still decides. */
/* 2026-11-20: the GitHub relays come from setup/runtime.json (core/download-sources.cjs), the list setup uses too */
const MIRRORS=(()=>{try{const r=require('../core/download-sources.cjs').relays().map(m=>m.url);if(r.length)return r;}catch{}return ['https://gh-proxy.com/{url}','https://ghproxy.net/{url}','https://ghfast.top/{url}'];})();
const DL_MIRRORS=['https://dl.megulit.com/','https://cn-dl.megulit.com/'];
const MIRROR_HOSTS=new Set([...MIRRORS.map(m=>new URL(m.replace('{url}','')).hostname),...DL_MIRRORS.map(u=>new URL(u).hostname)]);
const inChina=()=>{try{const o=Intl.DateTimeFormat().resolvedOptions();return o.timeZone==='Asia/Shanghai'||o.timeZone==='Asia/Urumqi'||/^zh-CN/i.test(o.locale||'');}catch{return false;}};
function sources(rel,china=inChina()){const direct=[rel.url];if(!rel.digest)return direct;const fresh=rel.url+(rel.url.includes('?')?'&':'?')+'v='+String(rel.digest).slice(0,12);const relayed=MIRRORS.map(m=>m.replace('{url}',fresh));
 /* the R2 mirror only holds the full packages (MeguLit-v*-win-x64.zip), never the small hot-update ones */
 /* content-addressed (files/<sha256>/<name>): exactly this package, never the mirror's "latest" (a by-name request is
    redirected to whatever the mirror synced last), and cn-dl serves it itself instead of redirecting to dl */
 /* mainland China: the China entry (cn-dl) first, Cloudflare's dl second */
 const dl=ASSET.test(String(rel.name||''))&&/^[a-f0-9]{64}$/.test(String(rel.digest))?(china?[...DL_MIRRORS].reverse():DL_MIRRORS).map(m=>m+'files/'+rel.digest+'/'+rel.name):[];
 return china?[...dl,...relayed,...direct]:[...direct,...dl,...relayed];}
function downloadGroups(rel,china=inChina(),required=false){
 const urls=sources(rel,china);if(!china||!required)return [urls];
 return [urls.filter(url=>DL_MIRRORS.some(base=>url.startsWith(base))),urls.filter(url=>!DL_MIRRORS.some(base=>url.startsWith(base))&&url!==rel.url),[rel.url]].filter(group=>group.length);
}
const updateLog=(root,line)=>{try{fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.appendFileSync(path.join(root,'logs','update.log'),new Date().toISOString()+' '+line+'\n');}catch{}};
const HEADERS={'User-Agent':'MeguLit-Updater','Accept':'application/vnd.github+json'};
/* E461 (user: players in mainland China, update_check "fetch failed"): api.github.com is often unreachable there, so the
   release JSON also comes from MeguLit's relay (api.megulit.com/api/release/..., GitHub's own answer cached 5 minutes);
   China-looking systems ask the relay first. The package itself is still checked against GitHub's sha256 digest. */
const RELAY_RELEASE='https://api.megulit.com/api/release/';
const CN_RELAY_RELEASE='https://cn-api.megulit.com/api/release/';
/* the relay host that answered fastest (api.megulit.com or its EdgeOne copy cn-api.megulit.com, see relay-config.cjs) */
function relayReleaseBase(){try{const base=require('./relay-config.cjs').relayBase(null);return base?base+'/api/release/':RELAY_RELEASE;}catch{return RELAY_RELEASE;}}
async function releaseFetch(fetcher,which,timeout,china=inChina(),fresh=false){
 /* 2026-11-13 fake-mainland test: with api.megulit.com (Cloudflare) unreachable the check failed, because the race for
    the fastest relay had not finished and only api.megulit.com was asked. The China entry cn-api is always on the list. */
 const relayed=[...new Set(china?[CN_RELAY_RELEASE,relayReleaseBase(),RELAY_RELEASE]:[relayReleaseBase(),RELAY_RELEASE,CN_RELAY_RELEASE])].map(u=>u+which);const urls=china?[...relayed,REPO+'/'+which]:[REPO+'/'+which,...relayed];let last;
 for(const url of urls){try{const r=await fetcher(url,{headers:fresh?{...HEADERS,'cache-control':'no-cache'}:HEADERS,cache:fresh?'no-store':'default',signal:AbortSignal.timeout(timeout)});if(r.ok||r.status===404)return r;last=r;}catch(e){last=e;}}
 if(last instanceof Error)throw last;return last;}
/* Hotfix letters (user 2026-11-10: 1.2.8a, 1.2.8b ...) are a display label only: the GitHub tag and the package name stay
   numeric (v1.2.8, MeguLit-v1.2.8-win-x64.zip) so every installed updater keeps working; a lettered hotfix is found by the
   package digest like any hotfix. The letter is dropped before comparing. */
const {base,newer,valid}=require('../core/app-version.cjs');
/* E350 (user 2026-11-10: "修改以后的自动更新识别规则"): versions compare as major.minor.patch plus the hotfix letter
   (1.2.8 < 1.2.8a < 1.2.8b < 1.2.9), and a package named MeguLit-v1.2.8b-win-x64.zip is accepted, so later releases
   may carry the letter in the tag itself. */
/* Beta builds (user 2026-11-13: 1.4.9-beta.1 on branch beta, GitHub prereleases) sort below their stable release and
   above the one before it, so the stable 1.4.9 replaces a beta and 1.4.8 never pulls a beta user back. */
/* Version ordering lives in core/app-version.cjs and is also used by the relay */

async function policy(fetcher=fetch,root=''){
 for(const url of require('./relay-config.cjs').endpoints(root,'/api/update/policy')){
  try{const r=await fetcher(url,{signal:AbortSignal.timeout(5000)});if(!r.ok)continue;const p=await r.json();
   if(p&&(!p.minVersion||valid(p.minVersion))&&valid(p.latest))return {latest:p.latest,minVersion:p.minVersion||null,message:p.message||''};
  }catch{}
 }
 return null;
}

function asset(rel){
 const a=(rel.assets||[]).find(a=>ASSET.test(a.name));if(!a)throw Error('UPDATE_ASSET_MISSING');
 const url=new URL(a.browser_download_url);if(url.protocol!=='https:'||!HOSTS.has(url.hostname))throw Error('UPDATE_URL_REJECTED');
 return a;
}
async function latest(fetcher=fetch,fresh=false){
 const r=await releaseFetch(fetcher,'latest',15000,inChina(),fresh);
 if(!r.ok)throw Error('UPDATE_CHECK_FAILED');
 const rel=await r.json(),a=asset(rel);
 return {version:String(rel.tag_name||'').replace(/^v/,''),name:a.name,size:a.size,url:a.browser_download_url,digest:/^sha256:[a-f0-9]{64}$/i.test(a.digest||'')?a.digest.slice(7).toLowerCase():'',hot:require('./hot-update.cjs').asset(rel),notes:String(rel.body||'').replace(/^> \*\*\[⬇[^\n]*\n*/m,'').slice(0,60000),page:rel.html_url,published:rel.published_at||''};
}
/* Size of the package the user is running, for "bigger / smaller than now". Unknown is fine. */
async function installedSize(current,fetcher=fetch){
 try{let r=await releaseFetch(fetcher,'tags/v'+String(current).replace(/^v/,''),10000);if(!r.ok&&base(current)!==String(current).replace(/^v/,''))r=await releaseFetch(fetcher,'tags/v'+base(current),10000);if(!r.ok)return 0;return asset(await r.json()).size||0;}catch{return 0;}
}

let state={phase:'idle'},job=null,found=null,pendingForced=null,launching=null;
const status=()=>pendingForced?{phase:'downloading',received:0,total:0,hot:false}:{...state};

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
/* Silent hot updates (user 2026-11-15: 自动静默，要用户点的只包含热更新无法的内容): a small package that fits is
   downloaded, verified and applied by the page without a card. When it fails, the files are put back
   (hot-update.cjs), the reason goes to logs/update.log and data/update-hot-failed.json, and from then on that version
   is offered as the full package with the usual card, so a broken small package is never tried again in a loop. */
function hotFailedFile(root){return root?path.join(root,'data','update-hot-failed.json'):'';}
function hotFailed(root,version){if(!root)return '';try{const r=JSON.parse(fs.readFileSync(hotFailedFile(root),'utf8'));return r&&r.version===String(version)?String(r.reason||'HOT_FAILED'):'';}catch{return '';}}
function markHotFailed(root,version,reason){if(!root)return;updateLog(root,'hot update failed '+version+' '+reason+'; the full package is offered next time');try{fs.mkdirSync(path.dirname(hotFailedFile(root)),{recursive:true});fs.writeFileSync(hotFailedFile(root),JSON.stringify({version:String(version),reason:String(reason),at:new Date().toISOString()}));}catch{}}
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
 const [releaseResult,p]=await Promise.all([latest(fetcher).then(value=>({value}),error=>({error})),policy(fetcher,root)]);
 const required=!!(p?.minVersion&&newer(p.minVersion,current));
 if(releaseResult.error){if(required)return {current,latest:p.latest,newer:true,required:true,policy:p,hot:false,silent:false,notes:'',page:'https://github.com/ilynthn/MeguLit/releases/latest'};throw releaseResult.error;}
 const rel=releaseResult.value,hotfix=isHotfix(root,rel,current),isNewer=newer(rel.version,current)||hotfix;
 /* a small package of only the changed files, when this install is exactly the one it was made from (hot-update.cjs) */
 const failed=isNewer?hotFailed(root,rel.version):'';
 const hot=isNewer&&!required&&root&&!failed&&require('./hot-update.cjs').fits(rel.hot,current,readInstalled(root))?rel.hot:null;
 found=isNewer?{...rel,hotfix,useHot:!!hot}:null;
 const previous=isNewer&&!hot?await installedSize(current,fetcher):0;
 if(isNewer&&!['downloading','ready'].includes(state.phase))state={phase:'available',version:rel.version,total:hot?hot.size:rel.size,received:0,hot:!!hot};
 return {current,latest:rel.version,newer:isNewer,required,policy:p,hotfix,hot:!!hot,silent:!!hot,hotFailed:failed,hotSize:hot?hot.size:0,size:rel.size,previousSize:previous,delta:previous?rel.size-previous:null,notes:rel.notes,page:rel.page,published:rel.published,phase:state.phase};
}

/* Fetches one package through core/fast-download.cjs and returns its bytes.
   E289 kept: a connection that drops keeps what arrived (cache/update/<name>.part + .part.json) and the next try asks only
   for the missing ranges. 2026-11-19 (hundreds of mainland players, downloads crawled on dl.megulit.com): every source is
   measured at once and the fast ones are pulled in parallel Range pieces; a slow or silent connection moves to another
   source. Only GitHub and the known mirrors may answer (a redirect elsewhere is refused); size, zip header and the sha256
   digest still decide. */
async function download(urls,rel,fetcher,zip,root){
 const accept=(r,url)=>{const final=new URL(r.url||url);if(final.protocol!=='https:'||!(HOSTS.has(final.hostname)||MIRROR_HOSTS.has(final.hostname)))throw Error('UPDATE_URL_REJECTED');};
 try{
  await require('../core/fast-download.cjs').download({urls,china:inChina(),dest:zip,size:rel.size||0,sha256:rel.digest||'',fetch:fetcher,accept,userAgent:'MeguLit-Updater',
   onProgress:p=>{state.received=p.received;if(p.total)state.total=p.total;},log:line=>updateLog(root,'download '+line)});
 }catch(error){
  if(error.code==='HASH_MISMATCH')throw Error('UPDATE_HASH_MISMATCH');if(error.code==='SIZE_MISMATCH')throw Error('UPDATE_SIZE_MISMATCH');
  if(/UPDATE_URL_REJECTED/.test(String(error.message)))throw Error('UPDATE_URL_REJECTED');
  if(/STALLED/.test(String(error.last&&error.last.code)))throw Error('STALLED');
  throw Error('UPDATE_DOWNLOAD_FAILED');
 }
 const data=fs.readFileSync(zip);
 if(data.subarray(0,2).toString('latin1')!=='PK'){fs.rmSync(zip,{force:true});throw Error('UPDATE_NOT_ZIP');}
 return data;
}
function start(root,current,fetcher=fetch,{forceLatest=false}={}){current=String(current||'').trim().replace(/^v/,'');
 if(forceLatest&&pendingForced)return pendingForced;
 /* A manual/silent download already in flight must finish before the forced full-package job starts. Never
    expose that earlier package as ready to the forced dialog, and never write two downloads to the same cache */
 if(forceLatest&&job&&!['ready','error','installed','applied'].includes(state.phase)){
  pendingForced=job.catch(()=>{}).then(()=>{pendingForced=null;job=null;return start(root,current,fetcher,{forceLatest:true});});return pendingForced;
 }
 if(forceLatest){job=null;found=null;state={phase:'downloading',received:0,total:0,hot:false};}
 if(job)return job;
 job=(async()=>{
  try{
   let rel=!forceLatest&&found&&(newer(found.version,current)||found.hotfix)?found:await latest(fetcher,forceLatest);if(!newer(rel.version,current)&&!rel.hotfix)throw Error('ALREADY_LATEST');
   if(forceLatest){const p=await policy(fetcher,root);if(p?.latest&&newer(p.latest,rel.version))throw Error('UPDATE_CHECK_FAILED');}
   const dir=path.join(root,'cache','update');fs.mkdirSync(dir,{recursive:true});
   const full=rel.digest;if(rel.useHot&&rel.hot)rel={...rel.hot,version:rel.version,isHot:true};
   const zip=path.join(dir,rel.name),ps1=path.join(dir,'apply-update.ps1');
   state={phase:'downloading',version:rel.version,total:rel.size||0,received:0,hot:!!rel.isHot};
   let data=null;
   /* A package downloaded earlier (user chose "later") is reused when it still verifies. */
   if(fs.existsSync(zip)){const old=fs.readFileSync(zip);if((!rel.size||old.length===rel.size)&&(!rel.digest||crypto.createHash('sha256').update(old).digest('hex')===rel.digest))data=old;}
   /* All sources together (core/fast-download.cjs); a size or digest mismatch on every source usually means the release
      was replaced meanwhile (hotfix), so the release is read again once and the download repeated. */
   let pick=rel;
   for(let round=0;!data&&round<2;round++){
    if(round&&pick.isHot)break;
    if(round){try{const fresh=await latest(fetcher);if(fresh.digest===pick.digest&&fresh.size===pick.size)break;pick=fresh;state.total=fresh.size||0;}catch{break;}}
    try{let last;for(const urls of downloadGroups(pick,inChina(),forceLatest)){try{data=await download(urls,pick,fetcher,zip,root);break;}catch(error){last=error;updateLog(root,'source group failed '+error.message);}}if(!data)throw last||Error('UPDATE_DOWNLOAD_FAILED');}
    catch(error){updateLog(root,'download failed '+error.message+' ('+(pick.size||0)+' bytes)');if(!/^UPDATE_(HASH|SIZE)_MISMATCH$|^UPDATE_NOT_ZIP$/.test(error.message))break;}
   }
   if(!data)throw Error('UPDATE_DOWNLOAD_FAILED');
   rel=pick;const hash=crypto.createHash('sha256').update(data).digest('hex');
   if(!fs.existsSync(zip))fs.writeFileSync(zip,data);
   if(rel.isHot){state={phase:'ready',version:rel.version,total:data.length,received:data.length,sha256:full,zip,hot:true};return status();}
   fs.writeFileSync(ps1,'﻿'+script(),'utf8');
   state={phase:'ready',version:rel.version,total:data.length,received:data.length,sha256:hash,zip,ps1};
   return status();
  }catch(error){const code=/^[A-Z_]+$/.test(error.message)?error.message:'UPDATE_DOWNLOAD_FAILED';if(found?.useHot){markHotFailed(root,found.version,'download '+code);found.useHot=false;}/* a failed hot download falls back to the full package on retry */state={...state,phase:'error',error:/^[A-Z_]+$/.test(error.message)?error.message:'UPDATE_DOWNLOAD_FAILED'};job=null;throw Error(state.error);}
 })();
 job.catch(()=>{});
 return job;
}

/* Hands the verified package to the script; the caller then quits MeguLit.
   v1.1.2 (user, 2026-11-09: "restart and update" reopened the same version, logs/update.log never appeared): a detached
   powershell.exe started from MeguLit's service exits at once without running anything, and a plain child dies with
   MeguLit. The script is therefore started by Windows itself through WMI (Win32_Process.Create), outside MeguLit's
   process tree, and the launcher's return code is checked before MeguLit is allowed to quit. */
/* v1.4.25 (player, v1.4.19 -> v1.4.25: "下载失败 · UPDATE_LAUNCH_FAILED", the button did nothing, quitting and reopening
   MeguLit fixed it): the launcher was given up after a fixed 20 s, but the WMI call alone takes 6-11 s on a warm machine
   and longer while WmiPrvSE is still cold, so a slow but working launch was reported as failed. The launcher was not
   stopped and could still start the script late, which then closed MeguLit by itself; each retry started another one.
   Success is now the script itself saying it started (it writes the mark file first), checked for up to 90 s; a launcher
   that is still running then is stopped so no late script appears, and one install runs at a time. */
const LAUNCH={total:90000,afterExit:30000,poll:250};
function launchScript(root,{run=spawn,limits=LAUNCH}={}){
 const mark=path.join(path.dirname(state.ps1||path.join(root,'cache','update','apply-update.ps1')),'launched-'+crypto.randomBytes(6).toString('hex'));
 /* v1.1.4: Windows 11 hands console programs to Windows Terminal, which ignores -WindowStyle Hidden and showed the
    script's progress window. conhost --headless runs it with no window at all; the startup info also asks for SW_HIDE. */
 const line=`conhost.exe --headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${state.ps1}" -Root "${root}" -Zip "${state.zip}" -Mark "${mark}"`;
 const create='$s=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0};$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$env:MEGULIT_UPDATE_COMMAND;ProcessStartupInformation=$s};exit [int]$r.ReturnValue';
 /* the full path: the service inherits MeguLit's PATH, which other programs can leave without Windows PowerShell */
 const shell=process.env.SystemRoot?path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'):'powershell.exe';
 const began=Date.now();
 return new Promise(resolve=>{
  let child=null,ended=null,done=false,poll=null;const timers=[];
  const started=()=>{try{return fs.existsSync(mark);}catch{return false;}};
  const finish=(ok,why)=>{if(done)return;done=true;timers.forEach(clearTimeout);clearInterval(poll);
   if(!ok&&ended===null&&child){try{child.kill();}catch{}if(started()){ok=true;why+=', script started';}}
   try{fs.rmSync(mark,{force:true});}catch{}
   updateLog(root,'launch '+(ok?'ok':'failed')+' ('+why+', '+(Date.now()-began)+' ms)');resolve(ok);};
  try{child=run(shell,['-NoProfile','-ExecutionPolicy','Bypass','-Command',create],{stdio:'ignore',windowsHide:true,env:{...process.env,MEGULIT_UPDATE_COMMAND:line}});}catch(error){finish(false,'spawn '+(error?.code||error?.message||error));return;}
  poll=setInterval(()=>{if(started())finish(true,'script started');},limits.poll);
  timers.push(setTimeout(()=>finish(false,ended===null?'launcher still running':'script never started'),limits.total));
  child.on('error',error=>finish(false,'launcher '+(error?.code||error?.message||error)));
  child.on('exit',code=>{ended=code;if(started())return finish(true,'script started');if(code!==0)return finish(false,'launcher exit '+code);
   timers.push(setTimeout(()=>{const ok=started();finish(ok,ok?'script started':'launcher exit 0, script never started');},limits.afterExit));});
 });
}
/* the page could not finish a silent hot update (hot_reload refused or failed after the files were written) */
function hotFail(root,reason){const version=state.version||found?.version||'';if(!version)return {recorded:false};markHotFailed(root,version,String(reason||'HOT_FAILED').slice(0,200));if(found)found.useHot=false;
 /* a hot package downloaded but refused before it was applied (hot_reload dry run) is dropped with its finished job:
    start() returned that job again and the card got the same small package instead of downloading the full one */
 if(state.hot&&state.phase==='ready'){try{if(state.zip)fs.rmSync(state.zip,{force:true});}catch{}job=null;state={phase:'available',version,total:found?.size||0,received:0,hot:false};}
 return {recorded:true,version};}
async function install(root,options={}){
 if(state.phase!=='ready'||!state.zip||!fs.existsSync(state.zip))throw Error('UPDATE_NOT_READY');
 if(state.hot){
  /* written in place while MeguLit runs; the page then calls hot_reload. A failure leaves the old files and offers the full package. */
  try{require('./hot-update.cjs').apply(root,state.zip,options);}catch(error){markHotFailed(root,state.version,'apply '+error.message);if(found)found.useHot=false;job=null;state={...state,phase:'error',hot:false,error:/^[A-Z_]+$/.test(error.message)?error.message:'HOT_APPLY_FAILED'};throw Error(state.error);}
  writeInstalled(root,{version:state.version,digest:state.sha256||''});updateLog(root,'hot update applied '+state.version);try{fs.rmSync(hotFailedFile(root),{force:true});}catch{}
  try{fs.rmSync(state.zip,{force:true});}catch{}
  state={...state,phase:'installed'};job=null;return {...status(),hot:true};
 }
 fs.mkdirSync(path.join(root,'logs'),{recursive:true});
 if(!/^[^"]+$/.test(root+state.ps1+state.zip))throw Error('UPDATE_PATH_REJECTED');
 /* a second click while the first launch is still waiting gets the same answer instead of a second script */
 if(launching)return launching;
 launching=(async()=>{try{
  if(!await launchScript(root,options))throw Error('UPDATE_LAUNCH_FAILED');
  writeInstalled(root,{version:state.version,digest:state.sha256});
  state={...state,phase:'installing'};return status();
 }finally{launching=null;}})();
 return launching;
}
async function apply(root,current,fetcher=fetch){await start(root,current,fetcher);return {...await install(root),staged:true};}

/* Runs after MeguLit has exited: only files that exist in the zip are copied. */
function script(){return `param([string]$Root,[string]$Zip,[string]$Mark)
# first: tells MeguLit the script is running (services/update.cjs launchScript waits for this file)
if($Mark){try{[IO.File]::WriteAllText($Mark,[string]$PID)}catch{}}
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
 & robocopy $Root $bak /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /XD data logs cache runtime models migration Anki /XF MeguLit.rollback-update.exe | Out-Null
 if($LASTEXITCODE -ge 8){throw "backup failed $LASTEXITCODE"}
 Remove-Item -LiteralPath (Join-Path $Root 'MeguLit.rollback-update.exe') -Force -ErrorAction SilentlyContinue
 Log 'backed up previous version'
 & robocopy $src $Root /E /R:5 /W:1 /NFL /NDL /NJH /NJS /XD data logs cache runtime models Anki | Out-Null
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
  & robocopy $bak $Root /E /R:5 /W:1 /NFL /NDL /NJH /NJS /XD Anki | Out-Null
  try{Remove-Item -LiteralPath (Join-Path $Root 'data\\update-installed.json') -Force -ErrorAction SilentlyContinue}catch{}
  Start-Process -FilePath (Join-Path $Root 'MeguLit.exe') -WorkingDirectory $Root
  Log 'rolled back'
 }
}catch{ Log ('rollback check failed: '+$_) }
`;}
function reset(){state={phase:'idle'};job=null;found=null;pendingForced=null;launching=null;}
module.exports={hotFail,hotFailed,refreshIcons,tidyRollback,sources,check,start,status,install,apply,newer,latest,installedSize,reset,launchScript,policy,downloadGroups};
