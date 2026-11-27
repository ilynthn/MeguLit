// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const store=require('./store.cjs');
/* 2026-11-13 every relay call goes through one gate: short GET cache, Retry-After on 429, backoff (services/relay-gate.cjs) */
require('./relay-gate.cjs').install();
const root=(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT)?path.resolve(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT):path.resolve(__dirname,'..');
const MAX_INPUT=512*1024;
const siteUpdatesUrls=['https://cn.megulit.com/assets/updates.json','https://megulit.com/assets/updates.json',
  'https://raw.githubusercontent.com/ilynthn/MeguLit/main/site/public/assets/updates.json'];
let siteUpdatesPending;
function compareSiteUpdates(a,b){
  const version=rows=>rows.map(row=>/^(\d+)\.(\d+)\.(\d+)\s*[:：]/.exec(row?.text)).find(Boolean)?.slice(1).map(Number)||[0,0,0];
  const x=version(a),y=version(b);
  return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]||String(a[0]?.date||'').localeCompare(String(b[0]?.date||''));
}
async function readSiteUpdates(){
  const file=path.join(root,'data','cache','site-updates.json');
  let cached=[];try{const rows=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(rows))cached=rows;}catch{}
  const responses=await Promise.allSettled(siteUpdatesUrls.map(async url=>{
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return [];
    const rows=await response.json();return Array.isArray(rows)?rows.slice(0,300):[];
  }));
  const fresh=responses.filter(r=>r.status==='fulfilled'&&r.value.length).map(r=>r.value).sort((a,b)=>compareSiteUpdates(b,a))[0];
  if(!fresh||compareSiteUpdates(fresh,cached)<0)return cached;
  try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(fresh));fs.renameSync(file+'.tmp',file);}catch{}
  return fresh;
}
function cleanUiState(values){
  const out={};let total=0;
  if(values&&typeof values==='object')for(const[key,value]of Object.entries(values)){
    if(!/^(?:tome|tomoyo)-[\w.-]{1,100}$/.test(key)||/key|token|secret|password/i.test(key)||typeof value!=='string'||value.length>50000)continue;
    total+=value.length;if(total>400000)break;out[key]=value;
  }
  return out;
}

function savePreferences(request) {
  const current=store.publicPreferences(root),patch=request.values || {};
  const next={...current};
  if(['zh','ja','en'].includes(patch.language))next.language=patch.language;
  if(/^#[0-9a-f]{6}$/i.test(patch.accent))next.accent=patch.accent;
  if(Array.isArray(patch.accentPresets))next.accentPresets=[...new Set(patch.accentPresets.filter(v=>/^#[0-9a-f]{6}$/i.test(v)).map(v=>v.toLowerCase()))].slice(0,8);
  if(typeof patch.closeToTray==='boolean')next.closeToTray=patch.closeToTray;
  if(typeof patch.closeAsk==='boolean')next.closeAsk=patch.closeAsk;
  if(typeof patch.glow==='boolean')next.glow=patch.glow;
  if(Number.isFinite(patch.homeFontScale))next.homeFontScale=Math.max(.85,Math.min(1.3,patch.homeFontScale));
  if(Number.isFinite(patch.glowSpeed))next.glowSpeed=Math.max(.25,Math.min(3,patch.glowSpeed));
  if(/^#[0-9a-f]{6}$/i.test(patch.barColor))next.barColor=patch.barColor.toLowerCase();
  if(patch.glassColor===''||/^#[0-9a-f]{6}$/i.test(patch.glassColor))next.glassColor=String(patch.glassColor).toLowerCase();
  if(patch.goldColor===''||/^#[0-9a-f]{6}$/i.test(patch.goldColor))next.goldColor=String(patch.goldColor).toLowerCase();
  if(typeof patch.username==='string')next.username=patch.username.slice(0,80);
  if(typeof patch.fontFamily==='string' && !/[<>{};]/.test(patch.fontFamily))next.fontFamily=patch.fontFamily.slice(0,120);
  if(Number.isFinite(patch.backgroundDim))next.backgroundDim=Math.max(0,Math.min(1,patch.backgroundDim));
  if(typeof patch.homeBackground==='boolean')next.homeBackground=patch.homeBackground?'background.jpg':'';
  /* v1.1.0 ships a default background: the first save turns it on once, a later toggle-off is kept */
  if(!next.defaultBackground110){if(typeof patch.homeBackground!=='boolean')next.homeBackground=next.homeBackground||'background.jpg';next.defaultBackground110=true;}
  if(['dark','black','light'].includes(patch.themeMode))next.themeMode=patch.themeMode;
  {const veils={...(current.pageVeils||{})};let touched=false;const take=(page,part,value)=>{if(!/^[a-z]{1,24}$/.test(page)||!Number.isFinite(value))return;veils[page]={...(veils[page]||{}),[part]:Math.max(0,Math.min(part==='b'?40:1,value))};touched=true;};
   if(patch.pageVeils&&typeof patch.pageVeils==='object')for(const [page,v] of Object.entries(patch.pageVeils))if(v&&typeof v==='object'){take(page,'a',v.a);take(page,'s',v.s);take(page,'b',v.b);}
   for(const [key,value] of Object.entries(patch)){const m=/^veil_([a-z]{1,24})_(a|s|b)$/.exec(key);if(m)take(m[1],m[2],value);}
   if(touched)next.pageVeils=veils;}
  if(patch.homeShowcase&&typeof patch.homeShowcase==='object')next.homeShowcase=store.cleanHomeShowcase(patch.homeShowcase);
  const file=path.join(root,'data','preferences.json'),temporary=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(next,null,2));fs.renameSync(temporary,file);
  return next;
}
/* 2026-11-12 the Windows feature a game could not start without, per game, for the install button (windows_feature_install) */
const neededFeature=new Map();
/* real launch progress for the detail page's button: the milestones below are the stages launch() actually passes (the same ones game-launch.log records);
   the page polls launch_progress and fills the button up to the latest milestone */
const LAUNCH_MILESTONES={prepare:.08,features:.16,'process-check':.26,request:.36,'process-start':.5,started:.64,'window-wait':.7,ready:1};
const launchProgress=new Map();
function markLaunch(id,key,extra={}){const p=LAUNCH_MILESTONES[key];if(p===undefined&&!extra.state)return;const prev=launchProgress.get(id);const keep=prev&&!extra.state&&prev.state==='run'&&prev.p>p?prev.p:p;
 launchProgress.set(id,{p:extra.state==='failed'?(prev?.p||0):keep,key,state:extra.state||(key==='ready'?'done':'run'),error:extra.error||'',at:Date.now(),next:Object.values(LAUNCH_MILESTONES).find(v=>v>keep)||1});}
async function launch(db,id,runtime=null,windowsLaunch=false,{retried=false,redirected=false,launchToken}={}) {
  const game=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(id);
  if(!game)throw Error('GAME_NOT_FOUND');
  /* 2026-11-12 a folder used as another game's Japanese original starts that game (services/import-source.cjs) */
  if(!require('../core/library-mode.cjs').libraryOnly(root)){let target='';try{const sources=require('./import-source.cjs');sources.backfill(db);target=sources.targetOf(db,db.prepare('SELECT original FROM games WHERE id=?').get(id));}catch{}if(target&&target!==id&&!redirected)return launch(db,target,runtime,windowsLaunch,{redirected:true});}
   const trace=(stage,extra={})=>{try{fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.appendFileSync(path.join(root,'logs','game-launch.log'),JSON.stringify({at:new Date().toISOString(),gameId:id,stage,...extra})+'\n');}catch{}};
  let stage='launch-preflight',featureWatch=null,drmPlan=null;if(!retried)markLaunch(id,'prepare');
  let launcherRun=null,launchLease=null,textPath=null,ownerSteam=null,ownerPending=null,ownerAbort=null,ownerPreparation=null,ownerPublisher=null,ownerPublisherGrant=null;/* the DRM launcher this start runs (services/launcher-cleanup.cjs) */try{
  if(!game.executable||!fs.existsSync(game.executable))throw Error('EXECUTABLE_MISSING');
  launchLease=require('./embedded-japanese-jobs.cjs').reserveLaunch(path.dirname(game.executable),launchToken);
  stage='background-stop';trace('background-stop');await require('./background-games.cjs').foreground();trace('background-stopped');if(require('../core/library-mode.cjs').libraryOnly(root))await runtime?.stopReading?.();
  let original={};try{original=JSON.parse(game.original||'{}')||{};}catch{}const profile=original.library || {};
  /* E-SteamOwned: a game Steam installed (appmanifest lists its folder) starts through Steam even when it was added by hand or by a folder scan (core/steam-owned.cjs) */
  const steamAppid=(()=>{try{return require('../core/steam-owned.cjs').launchAppid(game.executable,profile);}catch{return '';}})();if(steamAppid)trace('steam-owned',{appid:steamAppid,source:profile.source||''});
  const ownerEngine=require('../core/profiles/index.cjs').engineId(profile.engine),Owner=process.env.MEGULIT_OWNER_TESTS==='1'&&process.env.MEGULIT_SIDE_BY_SIDE==='1'?require('../core/owner-tests.cjs'):null,privateSteamPolicy=Owner?.launchPolicy(root,game.executable,ownerEngine)==='private-steam',privatePublisherPolicy=Owner?.launchPolicy(root,game.executable,ownerEngine)==='publisher-launch',privateLaunchPolicy=privateSteamPolicy||privatePublisherPolicy;if(privateSteamPolicy&&!steamAppid)throw Error('OWNER_STEAM_APPID');
  if(privateLaunchPolicy){ownerAbort=new AbortController();ownerPending={async stop(){ownerAbort.abort();if(ownerPublisherGrant)Owner.revoke(ownerPublisherGrant);if(ownerPreparation)await ownerPreparation.catch(()=>{});}};runtime?.trackTextPath?.({session:ownerPending});}
  if(!require('../core/library-mode.cjs').libraryOnly(root)&&require('./game-language.cjs').originalExecutable(db,id,root).blocked)throw Error('JAPANESE_EXECUTABLE_REQUIRED');
  /* E-DRM (user 2026-11-15, 死に逝く君、館に芽吹く憎悪): a DRM-wrapped program (SoftDenchi's SdWrap, DMM, DLsite) quits on
     its own when started directly. The record is corrected once to the engine program, and a crack / translation launcher
     beside it starts it (core/drm-wrap.cjs). The game's process and window stay the engine program's. */
  let launchVia='';
  if(privatePublisherPolicy){ownerPreparation=(async()=>{const token=await Owner.resolve(root,{exe:game.executable,engine:ownerEngine,signal:ownerAbort.signal});ownerPublisherGrant=token;if(ownerAbort.signal.aborted){if(token)Owner.revoke(token);throw Error('OWNER_PUBLISHER_CANCELLED');}const p=Owner.publisherLaunch(token,{exe:game.executable,engine:ownerEngine});if(!p)throw Error('OWNER_PUBLISHER_IDENTITY_UNVERIFIED');return p;})();ownerPublisher=await ownerPreparation;launchVia=ownerPublisher.launcher;}
  if(!privateLaunchPolicy){let plan=null;try{plan=require('../core/drm-wrap.cjs').plan(game.executable,{allowTranslated:require('../core/library.cjs').isTranslated(path.dirname(game.executable))||profile.contentLanguage==='zh',source:steamAppid?'steam':profile.source,savedDrm:profile.drm});}catch(error){trace('drm-check-failed',{error:String(error?.message||error).slice(0,160)});}
   if(plan){drmPlan=plan;trace('drm-wrapped',{kind:plan.kind,wrapped:path.basename(plan.wrapped||''),executable:path.basename(plan.executable||''),launcher:path.basename(plan.launchVia||''),changed:plan.changed});
    if(plan.ignoredUpdaters?.length)trace('drm-updaters-ignored',{files:plan.ignoredUpdaters,restoredPreviousLauncher:plan.restoredFromUpdater===true});
    if(plan.changed&&plan.executable&&fs.existsSync(plan.executable)){
     const before=String(game.executable),same=before.toLowerCase()===plan.executable.toLowerCase(),record=profile.drm||{};
     if(!same||String(profile.launchVia||'')!==plan.launchVia||record.kind!==plan.kind){
      launchLease.extend(path.dirname(plan.executable));game.executable=plan.executable;
      original.library={...profile,exe:plan.executable,launchVia:plan.launchVia,drm:{kind:plan.kind,wrapped:plan.wrapped,from:record.from||before,at:Date.now()}};
      db.prepare('UPDATE games SET executable=?,original=? WHERE id=?').run(plan.executable,JSON.stringify(original),id);
      Object.assign(profile,original.library);trace('drm-corrected',{from:path.basename(before),executable:path.basename(plan.executable),launcher:path.basename(plan.launchVia||'')});}
     launchVia=plan.launchVia||'';}}}
  const elevation=require('./locale-launch.cjs').requiresAdministrator(game.executable);if(privateLaunchPolicy&&(elevation||windowsLaunch))throw Error(privatePublisherPolicy?'OWNER_PUBLISHER_ELEVATION_UNSUPPORTED':'OWNER_STEAM_ELEVATION_UNSUPPORTED');
  /* E370: a first launch with nothing saved here starts from a matching shared adaptation record (stream memory before the Hook starts, locale mode for this launch) */
  try{const before=profile.localeMode,shared=require('./shared-adaptation.cjs');shared.importFor(root,{executable:game.executable,engine:profile.engine||'',library:profile,styleSync:runtime?.reader?.gal?.styleSync});if(profile.localeMode!==before){original.library=profile;db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),id);}}catch{}
  const canUseLanguageLauncher=!privateLaunchPolicy&&!steamAppid&&!launchVia;
  let wheelLaunch=canUseLanguageLauncher&&!elevation&&!windowsLaunch&&
   !require('../core/library-mode.cjs').libraryOnly(root)?require('./fata-wheel.cjs').launchPlan(game.executable):null;
  if(wheelLaunch&&require('./locale-launch.cjs').requiresAdministrator(wheelLaunch.executable))wheelLaunch=null;
  const languageTarget=canUseLanguageLauncher&&!wheelLaunch
   ?require('./original-engines/krkr-lang.cjs').launchTarget(game.executable)?.executable:null;
  const gameProcessExe=wheelLaunch?.executable||languageTarget||game.executable;
  if(languageTarget){
   launchVia=game.executable;
   trace('language-launcher-target',{launcher:path.basename(launchVia),executable:path.basename(languageTarget)});
  }
  // Let the reader bind as soon as the game window appears, including after a language launcher hands off to the engine.
  if(!privateLaunchPolicy)runtime?.prepareGame(gameProcessExe,{enter:true});
  /* E590 automatic Japanese: self-check an earlier automatic switch, then switch a localized build once */
  if(!privateLaunchPolicy&&!require('../core/library-mode.cjs').libraryOnly(root)){
  const japaneseRestoreOptions=require('./japanese-restore-options.cjs').forExecutable(game.executable);
  try{const fix=require('../core/japanese-restore.cjs').repairNameColumns(path.dirname(game.executable),japaneseRestoreOptions);if(fix.repaired)trace('japanese-name-columns-repaired',fix);}catch(error){trace('japanese-restore-repair-failed',{error:error.message,detail:error.detail});throw error;}
  if(!retried)require('./japanese-auto-run.cjs').beforeLaunch(root,id,path.dirname(game.executable),trace,japaneseRestoreOptions);
  /* Japanese restore tables written before 1.2.2 crash Siglus games on start: rewrite them before launching */
  try{const fix=require('../core/japanese-restore.cjs').repairShared(path.dirname(game.executable),japaneseRestoreOptions);if(fix.repaired||fix.skipped)trace('japanese-restore-repaired',fix);}catch(error){trace('japanese-restore-repair-failed',{error:String(error?.message||error).slice(0,200),detail:error.detail});if(error.message==='JAPANESE_REPAIR_BLOCKED')throw error;}
  /* E333 (user 2026-11-10, 女装山脈): a YU-RIS Chinese patch (update*.ypf) is still in place while the Japanese program is started: the game shows the Chinese text as garbage. Say so instead of launching. */
  {let plan=null;try{plan=require('../core/japanese-restore.cjs')._internal.yurisPlan(path.dirname(game.executable));}catch{}const exeName=path.basename(game.executable);if(plan?.updates?.length&&!/(cn\d|chs|汉化|中文)/i.test(exeName)&&require('../core/launcher-language.cjs').languageHint(exeName)!=='zh')throw Error('CHINESE_PATCH_ACTIVE');}
  /* 2026-11-12 (user: 沙耶の唄 opened a Windows DirectPlay install window that then wanted a restart) the game's own folder
     gets what it loads from DirectPlay, so no Windows window and no restart (core/directplay.cjs) */
  }
  stage='windows-features';markLaunch(id,'features');
  const gameDir=path.dirname(game.executable);
  if(!privateLaunchPolicy){let dp=null;try{dp=require('../core/directplay.cjs').prepare(gameDir,{root,exe:game.executable});if(dp.copied.length||dp.declined.length||dp.missing.length)trace('directplay',dp);}catch(error){trace('directplay-failed',{error:String(error?.message||error).slice(0,160)});}
   try{const configs=require('../core/windows-features.cjs').prepareDotnet(gameDir);if(configs.length)trace('dotnet-runtime-config',{files:configs});}catch(error){trace('dotnet-config-failed',{error:String(error?.message||error).slice(0,160)});}
   if(dp?.missing?.length){neededFeature.set(id,'DirectPlay');throw Object.assign(Error('DIRECTPLAY_REQUIRED'),{detail:dp.missing.join(',')});}}
  stage='process-check';markLaunch(id,'process-check');
  const {gameProcesses}=require('./game-process.cjs');
  const rgssPath=require('../core/profiles/index.cjs').engineId(profile.engine)==='rgss',existingRgss=rgssPath?require('../core/text-paths-rgss.cjs').existingShadow({exe:game.executable,shadowRoot:path.join(root,'data','rgss-shadow')}):null;let focusExe=gameProcessExe;
  const ready=()=>require('./game-readiness.cjs').waitForVisibleGame(()=>gameProcesses(root,focusExe));
  // Paths are passed as literal process arguments, never interpolated into a shell.
  /* If MeguLit cannot query processes here, launch anyway: a single-instance game handles a second start itself (v1.1.0). */
  let focused='absent';if(privateSteamPolicy){const running=await gameProcesses(root,game.executable);if(running.length)throw Error('RESTART_FROM_OWNER_TEST_ENTRY');}else try{focused=await require('./game-process.cjs').gameProcess(root,focusExe,{focus:true});}catch(error){if(error.message!=='PROCESS_QUERY_FAILED')throw error;trace('process-check-unavailable');}
  if(focused==='absent'&&existingRgss){focused=await require('./game-process.cjs').gameProcess(root,existingRgss,{focus:true});if(focused==='focused'||focused==='running')focusExe=existingRgss;}
  if(focused==='focused'||focused==='running') {
    // An earlier instance that never showed (or lost) its window blocks single-instance games: say so (E215.2, user:
    // サノバウィッチ 'would not start' while a hidden copy from a Japanese-locale launch kept running).
    let readyState=null;try{const state=await ready();readyState=state;trace('existing-window-ready',state);markLaunch(id,'ready');try{require('../core/japanese-auto.cjs').launchResult(root,id,true);}catch{}}catch(error){trace('existing-window-not-ready',{error:error.message});throw error.message==='GAME_WINDOW_NOT_READY'?Object.assign(Error('GAME_RUNNING_HIDDEN'),{detail:path.basename(game.executable)}):error;}
    db.prepare('UPDATE games SET last_launched_at=? WHERE id=?').run(Math.floor(Date.now()/1000),id);
    await require('./background-games.cjs').unmute(root,readyState?.pid);if(ownerPublisher){if(!Number.isSafeInteger(readyState?.pid)||readyState.pid<1||readyState.unverified)throw Error('OWNER_PUBLISHER_CHILD_UNCONFIRMED');if(ownerAbort.signal.aborted||!Owner.publisherLaunch(ownerPublisherGrant,{exe:game.executable,engine:ownerEngine}))throw Error('OWNER_PUBLISHER_IDENTITY_UNVERIFIED');}runtime?.prepareGame(gameProcessExe);runtime?.bindLaunched?.(readyState?.pid);return {action:focused,connected:false};
  }
  trace('launch-request',{windowsLaunch});markLaunch(id,'request');
  /* a Windows feature install window the game still opens is closed at once (the game goes on as if it was cancelled);
     DirectPlay is prepared while the game runs, anything else is remembered for this folder */
  if(!privateLaunchPolicy)featureWatch=require('../core/windows-features.cjs').watch(gameDir,{trace,onFeature:feature=>{if(/^directplay$/i.test(feature)){const dp=require('../core/directplay.cjs').prepare(gameDir,{root,exe:game.executable,all:true});trace('directplay',dp);}}});
  const prepareEnginePath=async()=>{if(require('../core/library-mode.cjs').libraryOnly(root))return;try{let ownerTestGrant=null;try{const P=require('../core/profiles/index.cjs'),engine=P.engineId(profile.engine||game.engine||require('../core/library.cjs').engineOf(path.dirname(game.executable))?.name);ownerTestGrant=await require('../core/owner-tests.cjs').resolve(root,{exe:game.executable,engine});}catch{}let prefs={};try{prefs=JSON.parse(fs.readFileSync(path.join(root,'data','preferences.json'),'utf8'))||{};}catch{}textPath=await require('../core/text-paths-launch.cjs').prepare({root,exe:game.executable,profile,title:game.title,ownerTestGrant,enabled:prefs.ownTextOutput===true||(()=>{try{return JSON.parse(fs.readFileSync(path.join(root,'data','config','gal-preferences.json'),'utf8')).textRenderer==='compositor';}catch{return false;}})(),trace});}catch(error){textPath=null;trace('text-paths-failed',{error:String(error?.message||error).slice(0,160)});}};
  if(rgssPath&&!launchVia&&!elevation&&!windowsLaunch)await prepareEnginePath();
  let state;
  // "Japanese system environment": non-Unicode Japanese games (WA2) show their own dialogs garbled under a Chinese locale.
  if(wheelLaunch&&profile.localeMode==='japanese'&&require('../core/locale-emulator.cjs').x86(wheelLaunch.executable)){
   stage='locale-start';
   const lib=runtime?.library?.()||new(require('../core/library.cjs').Library)(require('../core/layout.cjs'));
   const options={trace,args:wheelLaunch.args};
   let result=await lib.locale.launch(wheelLaunch.executable,options);
   if(result.needLocaleEmulator){await lib.locale.ensure();result=await lib.locale.launch(wheelLaunch.executable,options);if(result.needLocaleEmulator)throw Error('LOCALE_EMULATOR_REQUIRED');}
   state={pid:result.gamePid,locale:'japanese'};
   trace('language-launcher-window-wheel',{executable:path.basename(wheelLaunch.executable),pid:state.pid,locale:state.locale});
  }else if(wheelLaunch){
   stage='process-start';markLaunch(id,'process-start');
   const {startProcess,waitForVisibleGame}=require('./game-readiness.cjs');
   const child=await startProcess(wheelLaunch.executable,wheelLaunch.args,path.dirname(wheelLaunch.executable),'GAME_LAUNCH_FAILED');
   trace('language-launcher-window-wheel',{executable:path.basename(wheelLaunch.executable),pid:child.pid});markLaunch(id,'started');
   stage='window-wait';markLaunch(id,'window-wait');
   state=await waitForVisibleGame(()=>gameProcesses(root,gameProcessExe),{
    helper:true,helperError:'GAME_LAUNCH_FAILED',exit:()=>child.exit,trace
   });
  }else if(launchVia&&!windowsLaunch){
   /* E-DRM: the launcher may first show its own banner (live test: 打开游戏.exe 「Made By 2DJGAME」 waits for OK), so the
      engine program's window is waited for up to 90 s; the launcher's own windows never count as the game. */
   stage='launcher-start';markLaunch(id,'process-start');
   if(ownerPublisher){
    if(ownerAbort.signal.aborted||!Owner.publisherLaunch(ownerPublisherGrant,{exe:game.executable,engine:ownerEngine}))throw Error('OWNER_PUBLISHER_IDENTITY_UNVERIFIED');
    if(require('./locale-launch.cjs').requiresAdministrator(launchVia))throw Error('OWNER_PUBLISHER_ELEVATION_UNSUPPORTED');
   }else if(!languageTarget){
    const list=exe=>gameProcesses(root,exe);
    await require('./launcher-cleanup.cjs').endHidden({launchVia,gameExe:gameProcessExe,list,trace});
    launcherRun={launchVia,since:Date.now()};
   }
   const {startProcess,waitForVisibleGame}=require('./game-readiness.cjs');
   let child={exit:null};
   if(profile.localeMode==='japanese'&&require('../core/locale-emulator.cjs').x86(launchVia)){
    const lib=runtime?.library?.()||new(require('../core/library.cjs').Library)(require('../core/layout.cjs'));
    try{const result=await lib.locale.launch(launchVia,{trace,alsoExe:gameProcessExe});if(result.needLocaleEmulator){await lib.locale.ensure();const retry=await lib.locale.launch(launchVia,{trace,alsoExe:gameProcessExe});if(ownerPublisher&&retry.needLocaleEmulator)throw Error('LOCALE_EMULATOR_REQUIRED');}}catch(error){if(ownerPublisher)throw error;trace('launcher-locale-wait',{error:error.message});}
   }else if(require('./locale-launch.cjs').requiresAdministrator(launchVia))await require('./game-process.cjs').shellOpen(root,launchVia);
   else child=await startProcess(launchVia,[],path.dirname(launchVia),'GAME_LAUNCH_FAILED');
   trace('launcher-started',{launcher:path.basename(launchVia),pid:child.pid});markLaunch(id,'started');
   stage='window-wait';markLaunch(id,'window-wait');
   state=await waitForVisibleGame(()=>gameProcesses(root,gameProcessExe),{
    helper:true,helperError:'GAME_LAUNCH_FAILED',exit:()=>child.exit,trace,
    ...(languageTarget?{}:{attempts:360,timeout:90000})
   });
  }else if(!elevation&&!windowsLaunch&&profile.localeMode==='japanese'&&!steamAppid&&require('../core/locale-emulator.cjs').x86(game.executable)&&!(require('../core/locale-emulator.cjs').steamApi(game.executable)&&(trace('locale-skipped-steam',{}),true))){
   stage='locale-start';const lib=runtime?.library?.()||new(require('../core/library.cjs').Library)(require('../core/layout.cjs'));
   const localeExe=textPath?.path==='rgss'?textPath.exe:game.executable;let result=await lib.locale.launch(localeExe,{trace});
   if(result.needLocaleEmulator){trace('locale-emulator-install',{});await lib.locale.ensure();result=await lib.locale.launch(localeExe,{trace});if(result.needLocaleEmulator)throw Error('LOCALE_EMULATOR_REQUIRED');}
   state={pid:result.gamePid,locale:'japanese'};
  }else if(elevation||windowsLaunch){
   stage='windows-launch';
   await require('./game-process.cjs').shellOpen(root,game.executable);
   stage='window-wait';state=await ready();
  }else{
   stage='process-start';markLaunch(id,'process-start');
   const steamApp=!!steamAppid;
   /* 2026-11-13 (user: STEINS;GATE from MeguLit first pops Steam's launcher): an app with several Steam launch options
      (game + Launcher.exe config tool) makes steam://rungameid show a chooser, and Steam then ran Launcher.exe. When the
      install folder holds such a companion launcher, the recorded program is started directly with SteamAppId set, so
      steam_api accepts it without a restart through Steam (Steam itself still has to be running). Generic, any engine. */
   /* Live test 2026-11-13: STEINS;GATE's Game.exe refuses a bare start (「ランチャーから起動してください」); its launcher runs
      "Game.exe mages_sgate". So the companion launcher is read for the command line it gives the game; only when one is
      found is the game started directly with those arguments, otherwise the Steam path is kept as before. */
   const companionArgs=steamApp&&!/^(launcher|config)/i.test(path.basename(game.executable))?require('./steam-companion.cjs').launchArgs(game.executable):null;
   const companion=!!companionArgs;
   /* Text architecture ③ (core/text-paths-launch.cjs, owner switch preferences.ownTextOutput): a web or Unity engine path may start
      the game with Chromium debugging switches or from MeguLit's shadow folder (Steam app id in the environment, never a restart
      through Steam). Anything failing here leaves the launch exactly as before. */
   if(!privateLaunchPolicy&&!rgssPath)await prepareEnginePath();
   /* ①/③ with 文字显示 = compositor: a Steam game is started directly (SteamAppId; shadow + steam_appid.txt when the folder
      has none, core/text-paths-launch.cjs steamDirect) so MeguLitLaunch can load the glyph dots and the dot font before
      its first glyph. Anything failing keeps the steam:// launch. */
   /* 2026-11-15 (user: 石头门启动失败, Steam then asked to confirm 'mages_sgate'): a companion start with SteamAppId alone can still
      make steam_api call SteamAPI_RestartAppIfNecessary (exit 53), and Steam restarts it as steam://run/<id>//<args>, which always
      asks the user to confirm the arguments. The shadow folder with steam_appid.txt stops the restart, so companion starts use it too. */
   /* 2026-11-21 (群友: BALDR SKY Steam 版打不开) a part of the work in a subfolder (Dive1\BaldrSky.exe, same name as the install
      root's BaldrSky.exe): Steam's only launch option starts the root program, never the part, so steam:// started the other
      game and the launch waited for a window that never came. A part is started directly from the install root (its folder
      has neither steam_api.dll nor the shared archives), through the shadow with steam_appid.txt like a companion start. */
   if(textPath){runtime?.trackTextPath?.(textPath);if(require('../core/library-mode.cjs').libraryOnly(root)){await textPath.session.stop();textPath=null;}}
   const part=steamApp&&!textPath?require('../core/steam-owned.cjs').partOf(game.executable):null;if(part)trace('steam-part',{folder:part.folder});
   if(privateSteamPolicy){ownerPreparation=(async()=>{const token=await Owner.resolve(root,{exe:game.executable,engine:ownerEngine,signal:ownerAbort.signal});if(ownerAbort.signal.aborted){if(token)Owner.revoke(token);throw Error('OWNER_STEAM_CANCELLED');}return require('../core/owner-steam-direct.cjs').prepare({root,exe:game.executable,engine:ownerEngine,appid:steamAppid,token,signal:ownerAbort.signal,trace});})();ownerSteam=await ownerPreparation;runtime?.forgetTextPath?.(ownerPending);runtime?.trackTextPath?.(ownerSteam);}
   let steamDirect=null;if(steamApp&&!textPath&&(companion||part||require('../core/glyph-dots.cjs').wanted(root))){if(!ownerSteam){try{steamDirect=require('../core/text-paths-launch.cjs').steamDirect({exe:game.executable,appid:steamAppid,base:part?part.root:null,trace});}catch(error){steamDirect=null;trace('steam-direct-failed',{error:String(error?.message||error).slice(0,160)});}}}
   if(ownerSteam)steamDirect=ownerSteam;
   const steam=steamApp&&!companion&&!textPath&&!steamDirect;
   const launchExe=steamDirect?steamDirect.exe:game.executable;
   const {startProcess,waitForVisibleGame}=require('./game-readiness.cjs');
   const directEnv=steamDirect?{...process.env,...steamDirect.env}:companion?{...process.env,SteamAppId:String(steamAppid),SteamGameId:String(steamAppid),SteamOverlayGameId:String(steamAppid)}:null;
   /* Text architecture ①: with 文字显示 = compositor a direct start goes through MeguLitLaunch<bit>.exe, so the glyph dots are in place before the game's first glyph (core/glyph-dots.cjs); Steam keeps the late attach */
   const early=steam||textPath?null:require('../core/glyph-dots.cjs').earlyStart(root,launchExe,companion?companionArgs:[],require('../core/locale-emulator.cjs').x86(game.executable),directEnv||process.env);
   if(early)trace('glyph-dots-early',{launcher:path.basename(early.file),font:early.env.MEGULIT_GLYPH_FONT||''});
   /* ③ dot font at the source (native/fontdot): with the early launcher, MeguLitFontDot<bit>.dll is loaded right after
      MeguLitFont while the game is still suspended (core/text-paths-launch.cjs fontDot: compositor mode, binaries, crash canary) */
   const fontDot=early&&!textPath?require('../core/text-paths-launch.cjs').fontDot(root,game.executable,early,trace):null;
   const child=textPath?await startProcess(textPath.exe,[...(companionArgs||[]),...textPath.args],textPath.cwd,'GAME_LAUNCH_FAILED',undefined,{...process.env,...textPath.env}):await startProcess(early?early.file:steam?'explorer.exe':launchExe,early?early.args:steam?['steam://rungameid/'+steamAppid]:companion?companionArgs:[],steamDirect?steamDirect.cwd:path.dirname(game.executable),'GAME_LAUNCH_FAILED',undefined,early?early.env:directEnv);

   trace('launch-process-started',{pid:child.pid,steam,steamDirect:companion||!!steamDirect||undefined});markLaunch(id,'started');
   stage='window-wait';markLaunch(id,'window-wait');
   /* Steam may start another program in the install folder than the one on record (Summer Pockets: the library has
      SummerPocketsRB.exe, Steam runs SiglusEngine_Steam.exe; user 2026-11-09: the game was up and MeguLit said the launch
      failed). For Steam launches a game process from any program in that folder counts. */
   /* 2026-11-21 (BALDR SKY Steam) the whole install tree, not only the record's folder: the root program and the parts in its
      subfolders, also for direct starts, since steam_api's restart (exit 53) runs Steam's own launch option
      (core/steam-owned.cjs installPrograms; it replaces the same-folder list, which it contains). */
   const siblings=steamApp&&!textPath?(()=>{try{return require('../core/steam-owned.cjs').installPrograms(game.executable);}catch{return [];}})():[];
   const anyProcess=async()=>{if(ownerSteam)return gameProcesses(root,ownerSteam.exe);const own=await gameProcesses(root,game.executable);if(!own.length&&textPath&&textPath.exe!==game.executable){const shadow=await gameProcesses(root,textPath.exe).catch(()=>[]);if(shadow.length){if(textPath.observeProcess){const p=shadow.find(p=>p.pid===child.pid);if(p)textPath.observeProcess(p);}return shadow;}}if(!own.length&&steamDirect?.shadow){const shadow=await gameProcesses(root,steamDirect.exe).catch(()=>[]);if(shadow.length)return shadow;}if(own.length||!siblings.length)return own;for(const exe of siblings){const found=await gameProcesses(root,exe).catch(()=>[]);if(found.length){trace('steam-runs-other-program',{exe:path.basename(exe)});return found;}}return own;};
   /* E303: Steam may prepare a first start (cloud sync, install scripts) for longer than 15 s; wait up to 45 s for its window. */
   const startedAt=Date.now();
   const checkHelperHandoff=!!early&&!steamApp&&require('./locale-launch.cjs').josouOriginal(game.executable);
   try{state=await waitForVisibleGame(anyProcess,{helper:steam||!!early,indirect:steam,checkHelperHandoff,helperError:'GAME_LAUNCH_FAILED',exit:()=>child.exit,trace,...(steam?{attempts:180,timeout:45000}:textPath?{attempts:720,timeout:180000}:{})});}/* ③ shadow start: BepInEx (IL2CPP) builds its interop assemblies on the first start, minutes before the game window */
   catch(error){
    if(ownerSteam)throw Object.assign(Error('RESTART_FROM_OWNER_TEST_ENTRY'),{detail:error.code||error.message});
    /* E333 (user 2026-11-10, 女装山脈 with 以日文系统环境启动 off): many Japanese x86 games quit at once, without a window,
       under a Chinese system locale. A quit within 3 s is retried once in the Japanese environment (this launch only). */
    /* 2026-11-15 (石头门): exit 53 is steam_api handing the start to Steam (SteamAPI_RestartAppIfNecessary), not a failed
       start. No Japanese-environment retry (it would quit the same way and queue a second Steam start); wait for the
       game Steam starts instead, and when Steam is waiting for the user (confirm launch arguments), say so. */
    const restart=require('./steam-restart.cjs');
    if(error.message==='GAME_PROCESS_EXITED'&&steamApp&&restart.restarted(child.exit)){
     trace('steam-restart',{code:child.exit.code});stage='steam-restart-wait';
     try{state=await waitForVisibleGame(anyProcess,{helper:true,indirect:true,exit:()=>null,trace,attempts:480,timeout:120000});}
     catch(waitError){let waiting='';try{waiting=restart.pendingPrompt(await require('../core/library.cjs').findSteam(),steamAppid,startedAt);}catch{}
      trace('steam-restart-timeout',{waiting});if(waiting==='ShowGameArgs')throw Object.assign(Error('STEAM_CONFIRM_ARGS'),{detail:waiting});if(waiting)throw Object.assign(Error('STEAM_WAITING_USER'),{detail:waiting});throw waitError;}
    }else if(steam&&error.message==='GAME_WINDOW_NOT_READY'&&(await require('../core/steam-owned.cjs').launchersRunning(game.executable,exe=>gameProcesses(root,exe))).length){
     /* E-SteamOwned (CHAOS;CHILD live 2026-11-20): Steam starts the folder's own launcher first and the game only after the user clicks Start in it. While that launcher runs this is no failure: wait for the game (10 min), end when the launcher closes without it. */
     const owned=require('../core/steam-owned.cjs');let gone=false;const poll=setInterval(()=>{owned.launchersRunning(game.executable,exe=>gameProcesses(root,exe)).then(l=>{if(!l.length)gone=true;}).catch(()=>{});},2000);
     trace('steam-launcher-wait',{});stage='steam-launcher-wait';markLaunch(id,'window-wait');
     try{state=await waitForVisibleGame(anyProcess,{helper:false,indirect:true,exit:()=>gone?{code:0,signal:null}:null,trace,attempts:2400,timeout:600000});}
     catch(waitError){throw Object.assign(Error('STEAM_LAUNCHER_START'),{detail:waitError.message});}finally{clearInterval(poll);}    }else{
    const LE=require('../core/locale-emulator.cjs'),fallbackExe=textPath?.path==='rgss'?textPath.exe:game.executable;
    if(error.message!=='GAME_PROCESS_EXITED'||steam||elevation||windowsLaunch||((error.exitedAt??error.absenceStartedAt??Date.now())-startedAt>3000&&error.detail!=='HELPER_FINISHED_WITHOUT_GAME')||!LE.x86(fallbackExe)||LE.steamApi(fallbackExe))throw error;
    const lib=runtime?.library?.()||new(require('../core/library.cjs').Library)(require('../core/layout.cjs'));
    trace('locale-fallback',error.detail?{reason:error.detail}:{});stage='locale-start';const result=await lib.locale.launch(fallbackExe,{trace});if(result.needLocaleEmulator)throw error;
    state={pid:result.gamePid,locale:'japanese'};
    }
   }
   if(ownerSteam)await ownerSteam.confirm(state?.pid);
   /* ③ dot font: the game must live 20 s with it, or the crash canary turns it off for this game */
   if(fontDot)fontDot.watch(state?.pid);
   /* ③ the engine path joins the hook reader once the game is up; its exit code goes to the crash canary */
   if(textPath&&textPath.path!=='rgss'){try{const tp=require('../core/text-paths-launch.cjs');const join=(n=0)=>{if(require('../core/library-mode.cjs').libraryOnly(root)){textPath.session.stop();return;}const hook=runtime?.reader?.gal?.hooks;if(hook){tp.attach(textPath,hook);return;}if(n<20)setTimeout(()=>join(n+1),1500).unref?.();};join();textPath.connect().catch(()=>{});
    const exitWatch=setInterval(()=>{if(child.exit){clearInterval(exitWatch);try{textPath.session.exited(child.exit.code??-1);Promise.resolve(textPath.session.stop()).then(()=>runtime?.forgetTextPath?.(textPath.session),()=>{});}catch{}}},2000);exitWatch.unref?.();}catch(error){trace('text-paths-attach-failed',{error:String(error?.message||error).slice(0,160)});}}
  }
  if(textPath?.path==='rgss'){runtime?.trackTextPath?.(textPath);const tp=require('../core/text-paths-launch.cjs');const join=(n=0)=>{if(textPath.session.stopped)return;if(require('../core/library-mode.cjs').libraryOnly(root)){textPath.session.stop();return;}const hook=runtime?.reader?.gal?.hooks;if(hook){tp.attach(textPath,hook);return;}if(n<20)setTimeout(()=>join(n+1),1500).unref?.();};textPath.session.watch(state?.pid);join();}
  if(ownerPublisher&&(!Number.isSafeInteger(state?.pid)||state.pid<1||state.unverified))throw Error('OWNER_PUBLISHER_CHILD_UNCONFIRMED');
  await require('./background-games.cjs').unmute(root,state?.pid);trace('new-window-ready',state);markLaunch(id,'ready');try{require('../core/japanese-auto.cjs').launchResult(root,id,true);}catch{}
  if(ownerSteam?.session.stopped||ownerAbort?.signal.aborted)throw Error('RESTART_FROM_OWNER_TEST_ENTRY');
  if(ownerPublisher&&!Owner.publisherLaunch(ownerPublisherGrant,{exe:game.executable,engine:ownerEngine}))throw Error('OWNER_PUBLISHER_IDENTITY_UNVERIFIED');
  if(featureWatch){const watch=featureWatch;featureWatch=null;setTimeout(()=>watch.stop(),30000).unref?.();}
  db.prepare('UPDATE games SET last_launched_at=? WHERE id=?').run(Math.floor(Date.now()/1000),id);
  runtime?.prepareGame(gameProcessExe);runtime?.bindLaunched?.(state?.pid);return {action:'launched',connected:false};
  }catch(error){if(ownerPending){await ownerPending.stop();runtime?.forgetTextPath?.(ownerPending);}if(ownerSteam){await ownerSteam.session.stop();runtime?.forgetTextPath?.(ownerSteam.session);}if(textPath?.path==='rgss')textPath.session.stop();if(launcherRun)try{await require('./launcher-cleanup.cjs').endHidden({...launcherRun,gameExe:game.executable,list:exe=>require('./game-process.cjs').gameProcesses(root,exe),trace});}catch{}try{runtime?.reader?.gal?.send({type:'enterGame',cancel:true});}catch{}
   /* a game that quit after asking Windows for a feature: DirectPlay is placed now, so try once more; anything else is
      offered as an install (no restart) */
   if(featureWatch){featureWatch.stop();const asked=featureWatch.found;featureWatch=null;
    if(asked.length&&['GAME_PROCESS_EXITED','GAME_WINDOW_NOT_READY','GAME_LAUNCH_FAILED'].includes(error.message)){
     const feature=asked[0];trace('windows-feature-needed',{feature,retried});
     if(/^directplay$/i.test(feature)&&!retried){const dp=require('../core/directplay.cjs').prepare(path.dirname(game.executable),{root,exe:game.executable,all:true});if(!dp.missing.length)return await launch(db,id,runtime,windowsLaunch,{retried:true,launchToken:launchLease?.token});}
     neededFeature.set(id,feature);error=Object.assign(Error(/^directplay$/i.test(feature)?'DIRECTPLAY_REQUIRED':'WINDOWS_FEATURE_REQUIRED'),{detail:feature});}}
   /* E299: a boxed release whose protection plug-in wants the original DVD quits on start; say so (disc-check.cjs). */
   if(['GAME_PROCESS_EXITED','GAME_WINDOW_NOT_READY'].includes(error.message)&&game.executable&&require('./disc-check.cjs').discProtected(path.dirname(game.executable)))error=Object.assign(Error('GAME_DISC_REQUIRED'),{detail:error.message});
   /* E-DRM: say which program needs which licence check and what was or can be used instead (launch_hint has the words) */
   if(drmPlan&&['GAME_PROCESS_EXITED','GAME_WINDOW_NOT_READY','GAME_LAUNCH_FAILED'].includes(error.message))error=Object.assign(Error(drmPlan.kind==='steam'?'GAME_STEAM_REQUIRED':drmPlan.launchVia?'GAME_DRM_LAUNCHER_FAILED':'GAME_DRM_WRAPPED'),{detail:error.message});
   trace('launch-failed',{phase:stage,error:error.message,detail:error.detail||error.code});markLaunch(id,'failed',{state:'failed',error:error.message});try{require('../core/japanese-auto.cjs').launchResult(root,id,false);}catch{}throw error;}finally{launchLease?.release();}
}
function deleteWord(db,id) {
  const word=db.prepare('SELECT * FROM vocabulary WHERE id=?').get(id);
  if(!word)throw Error('WORD_NOT_FOUND');
  const examples=db.prepare('SELECT * FROM examples WHERE word_id=?').all(id);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO word_trash(word_id,deleted_at,snapshot) VALUES (?,?,?)').run(id,Math.floor(Date.now()/1000),JSON.stringify({word,examples}));
    db.prepare('DELETE FROM examples WHERE word_id=?').run(id);
    db.prepare('DELETE FROM vocabulary WHERE id=?').run(id);
    db.exec('DELETE FROM word_trash WHERE id NOT IN (SELECT id FROM word_trash ORDER BY deleted_at DESC,id DESC LIMIT 30)');
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {deleted:id};
}
// E280: after a Japanese import (or its undo) the game starts from the Japanese program (or the translated one again).
/* 2026-11-15 (night test, 死に逝く君 汉化硬盘版): turning a Chinese overlay off keeps the same program, so the record still said
   contentLanguage zh and the launch was refused with JAPANESE_EXECUTABLE_REQUIRED right after 恢复日文 succeeded. A restore that
   changed files marks the program on record as the Japanese original; its undo marks it translated again. */
const changedFiles=r=>!!r&&((r.removed|0)+(r.replaced|0)+(r.added|0)+(r.imported|0))>0;
function importedExecutable(db,id,file,language){
  if(language==='ja'){require('./game-language.cjs').originalExecutable(db,id,root,'select',file);}
  const row=db.prepare('SELECT original FROM games WHERE id=?').get(id),original=JSON.parse(row?.original||'{}'),lib=original.library||{};
  /* #376 a Steam folder (steam_api beside the program) keeps its start mode; undo puts back the mode the restore replaced */
  const LE=require('../core/locale-emulator.cjs');
  if(language==='ja'){
    if(!lib.localeUserSet){const next=LE.x86(file)&&!LE.steamApi(file)?'japanese':lib.localeMode||'off';original.library={...lib,localeMode:next,...(next!==(lib.localeMode||'')&&lib.localeBeforeJapanese===undefined?{localeBeforeJapanese:lib.localeMode||''}:{})};}
  }else{original.library={...lib,exe:file,contentLanguage:'zh',originalExecutableVerified:false};if(lib.localeBeforeJapanese!==undefined){original.library.localeMode=lib.localeBeforeJapanese;delete original.library.localeBeforeJapanese;}db.prepare('UPDATE games SET executable=? WHERE id=?').run(file,id);}
  db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),id);
}
function scriptSettings(){return new(require('./settings.cjs').Settings)(root);}
function scriptActivity({hasPairs,embedded=false,perGame=false}){
 const prefs=scriptSettings().read('translation');
 const enabled=prefs.scriptTranslation!==false,english=prefs.learnerLanguage==='en';
 return {hasPairs,enabled,english,embedded,...(perGame?{perGame:true}:{}),active:hasPairs&&(enabled||perGame)&&!english};
}
function enableRestoredTranslation(pairing,runtime){
 try{
  if(pairing.hasPairs&&!scriptActivity(pairing).enabled)scriptSettings().setScriptTranslation(true);
  return scriptActivity(pairing).active;
 }finally{runtime?.reader?.refreshTextSource?.();}
}
async function pairRestoredTranslation(id,runtime){
 const worker=require('./text-source-worker.cjs');
 try{
  if(!(await worker.run(root,'localPairs',[id])).hasPairs)await worker.run(root,'autoPatch',[id,{force:true,drives:false}],{cachedOnly:true});
  return enableRestoredTranslation(await worker.run(root,'localPairs',[id]),runtime);
 }catch{return false;}
}
function restoreWord(db,id) {
  const entry=db.prepare('SELECT * FROM word_trash WHERE id=?').get(id);
  if(!entry)throw Error('WORD_NOT_FOUND');
  const snapshot=JSON.parse(entry.snapshot);
  // Native Final snapshots use canonical fields; legacy trash remains preserved
  // until its fuller word/tag/review snapshot adapter is migrated.
  if(!snapshot.word?.original)throw Error('LEGACY_TRASH_ADAPTER_PENDING');
  const w=snapshot.word;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO vocabulary VALUES (?,?,?,?,?,?,?,?)').run(w.id,w.spelling,w.reading,w.definitions,w.status,w.created_at,w.image,w.original);
    const add=db.prepare('INSERT INTO examples VALUES (?,?,?,?,?,?,?,?,?)');
    for(const e of snapshot.examples || [])add.run(e.id,e.word_id,e.game_id,e.text,e.translation,e.highlight_start,e.highlight_end,e.created_at,e.original);
    db.prepare('DELETE FROM word_trash WHERE id=?').run(id);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {restored:w.id};
}
/* The JMdict entry for a word met in reading: its dictionary form first, then the normalized form. */
// E457 lookup_exact entries as dictionary-page rows: first spelling, all readings, one definition per line.
function localEntries(result,query){return (result?.entries||[]).slice(0,20).map(e=>({spelling:e.spellings?.[0]||e.readings?.[0]||query,reading:(e.readings||[]).join(' · '),definition:(Array.isArray(e.definition_groups)&&e.definition_groups.length?e.definition_groups.map(g=>g.text):(e.definitions||[])).map(String).join('\n')})).filter(e=>e.definition);}
async function lookupEntry(learning,base,key){for(const text of [...new Set([base,key].filter(Boolean))]){const result=await learning.request('lookup_exact',{text,start:0,end:[...text].length},'zh');const entry=result?.entries?.find(e=>require('./learning-insights.cjs').entryMatches(e,base,key));if(entry)return entry;}return null;}
function findAnki(runtime){
 return runtime?runtime.ankiProcess().find():require('../core/anki-process.cjs').find('',process.env,undefined,root);
}
async function dispatch(request,runtime=null) {
  if(request.action==='site_updates'){
    /* Return the freshest result this time, even when a faster mirror or the disk cache lags behind. */
    siteUpdatesPending??=readSiteUpdates().finally(()=>{siteUpdatesPending=null;});
    const rows=await siteUpdatesPending;
    return compareSiteUpdates(rows,[request.cachedHead,request.cachedRelease].filter(Boolean))<0?[]:rows;
  }
  if(String(request.action).startsWith('disc_'))return await require('./disc-install.cjs').handle(root,request,runtime,values=>dispatch({action:'save_game',...values},runtime));
  if(request.action==='backup_export')return require('./backup.cjs').exportBackup(root,request.path);
  if(request.action==='backup_preview')return require('./backup.cjs').previewBackup(root,request.path);
  if(request.action==='backup_discard')return require('./backup.cjs').discardBackup(root,request.id);
  if(request.action==='backup_apply'){runtime?.reader?.stop();if(runtime){runtime.reader=null;runtime.libraryManager=null;}return require('./backup.cjs').applyBackup(root,request.id);}
  if(request.action==='history_translate'){if(!runtime)throw Error('RUNTIME_REQUIRED');return runtime.history().ensure(Number(request.id));}
  /* E378 account + cloud sync (services/account.cjs); opens the store itself */
  if(String(request.action).startsWith('account_'))return await require('./account.cjs').handle(root,request);
  const db=store.openStore(root);
  /* E456 (2026-11-11): every action is awaited before the database closes; a handler that returned its promise unawaited (learning_level_set) ran on a closed database ("database is not open") */
  try {return await (async()=>{
    if(String(request.action).startsWith('series_'))return require('./series.cjs').handle(db,root,request);
    /* 2026-11-13 card wall (services/card-wall.cjs) */
    if(String(request.action).startsWith('cards_'))return require('./card-wall.cjs').handle(db,root,request);
    if(['story_list','story_graph','story_image'].includes(request.action))return await require('./story-progress.cjs').handle(db,root,request);
    /* E563 probe → desensitized upload → adapter packs (services/adapter-actions.cjs) */
    if(String(request.action).startsWith('adapter_'))return await require('./adapter-actions.cjs').handle(db,root,request,runtime);
    switch(request.action) {
      case 'anki_sync':{
        const {AnkiSync,pickEntry}=require('./anki-sync.cjs'),{Anki}=require('../core/anki.cjs');const config=store.readJSON(path.join(root,'data','config','v4-preferences.json'));
        const result=await new AnkiSync({db,anki:new Anki(),config,resolveEntry:async(text,reading)=>{if(!runtime)return null;const result=await runtime.learning().request('lookup_exact',{text,start:0,end:[...text].length},'zh');return pickEntry(result.entries,text,reading,result);}}).run();runtime?.emit('reader-event',{type:'word-status-changed'});return result;
      }
      case 'set_word_status':{const id=Number(request.id),status=Number(request.status);if(!Number.isSafeInteger(id)||!Number.isInteger(status)||status<0||status>4)throw Error('INVALID_WORD_STATUS');if(!db.prepare('UPDATE vocabulary SET status=? WHERE id=?').run(status,id).changes)throw Error('WORD_NOT_FOUND');runtime?.emit('reader-event',{type:'word-status-changed'});return {id,status};}
      case 'library_scan':case 'library_find_steam':case 'reader_bootstrap':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.call(request);
      case 'reader_status':case 'reader_health':case 'reader_detach':case 'reader_attach':case 'reader_message':case 'reader_invoke':case 'model_status':case 'model_download':case 'model_cancel':case 'pack_status':case 'pack_download':case 'pack_cancel':case 'local_start':case 'local_stop':case 'runtime_download':case 'runtime_cancel':case 'speakers':case 'speakers_cached':case 'speech_preview':case 'sentence_voice':case 'sentence_voice_has':case 'kana_speak':case 'tokenize':case 'translate_preview':
        if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return await runtime.call(request);
      case 'home': try{require('./import-source.cjs').backfill(db);}catch{}return store.home(db,root);
      case 'novel_shelf':case 'novel_scan':case 'novel_import':case 'novel_detail':case 'novel_chapter':case 'novel_find':case 'novel_online_search':case 'novel_online_save':case 'novel_online_clear':case 'novel_online_reviews':case 'novel_image':case 'novel_remove':case 'novel_progress':case 'novel_progress_save':case 'novel_bookmarks':case 'novel_bookmark_add':case 'novel_bookmark_remove':case 'novel_event':case 'novel_excerpts':case 'novel_excerpt_add':case 'novel_excerpt_remove':case 'novel_excerpt_translate':case 'novel_annotate':case 'novel_lookup':case 'novel_save_word':case 'novel_pdf':case 'novel_source_config':case 'novel_source_cover':case 'novel_source_open':case 'novel_source_detail':case 'novel_source_download_start':case 'novel_source_download_status':case 'novel_source_import':case 'novel_source_test':case 'novel_discover':case 'novel_search':return await require('./novel/index.cjs').dispatch(request,{db,root,runtime});
      case 'game_shots':case 'game_shot':{const game=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(String(request.id));if(!game)throw Error('GAME_NOT_FOUND');const shots=require('./scene-shots.cjs');
        return request.action==='game_shots'?{items:shots.list(root,game.executable)}:shots.read(root,game.executable,String(request.file||''));}
      case 'game_cgs':case 'game_cg':{const game=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(String(request.id));if(!game)throw Error('GAME_NOT_FOUND');const cg=require('./game-cg.cjs');
        /* the R18 filter (native pref safe_cg) and the cold-run setting (scriptColdRun) for CGs only the game can open */
        const native=store.readJSON(path.join(root,'data','config','native-preferences.json'))||{},opts={root,safe:native.safe_cg===true,cold:require('../core/preferences.cjs').cleanPreferences(store.readJSON(path.join(root,'data','config','preferences.json'))||{}).scriptColdRun!==false};
        return request.action==='game_cgs'?cg.list(game.executable,opts):cg.image(root,game.executable,String(request.name||''),opts);}
      case 'game_enrich':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.metadata().ensure(String(request.id),request.locale,request.refresh===true);
      case 'game_reviews_summary':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.reviews().summary(String(request.id));
      case 'review_full':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.reviews().full(String(request.platform),String(request.url||''));
      case 'game_reviews':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.reviews().page(String(request.id),String(request.platform),request.page,request.size,String(request.lang||'all'));
      case 'reviews_translate':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.reviews().translate(request.texts,String(request.target),String(request.source||'auto'));
      /* home page QQ 交流群 pill: the desktop QQ's join window, or {opened:false} so the page falls back (core/qq-group.cjs) */
      case 'open_qq_group':return require('../core/qq-group.cjs').openGroup(request.uin);
      case 'open_source':{const url=new URL(String(request.url));if(url.protocol!=='https:'||!['vndb.org','store.steampowered.com','steamcommunity.com','bgm.tv','2dfan.com','erogamescape.dyndns.org','github.com','plicy.net','megulit.com','platform.deepseek.com','cloud.siliconflow.cn','bailian.console.aliyun.com','aistudio.google.com','apps.ankiweb.net','zh.moegirl.org.cn','ndlsearch.ndl.go.jp','openlibrary.org','data1.library.sh.cn','qm.qq.com','ankiweb.net'].includes(url.hostname)||url.username||url.password)throw Error('INVALID_SOURCE_URL');const child=spawn('explorer.exe',[url.href],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {opened:true};}
      case 'game_locale_mode':{
        const id=String(request.id),row=db.prepare('SELECT original FROM games WHERE id=? AND removed_at IS NULL').get(id);
        if(!row)throw Error('GAME_NOT_FOUND');
        if(typeof request.japanese!=='boolean')throw Error('INVALID_LOCALE_MODE');
        const original=JSON.parse(row.original||'{}')||{};
        original.library={...original.library,localeMode:request.japanese?'japanese':'off',localeUserSet:true};
        delete original.library.localeBeforeJapanese;
        db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),id);
        return {japanese:request.japanese};}
      // Script sources for zero-latency bilingual: a Chinese patch for the Japanese game, or the Japanese original
      // for a patched game. Both are lined up with the installed script; the running reader picks the change up.
      // E280: opening the dialog also looks for a Chinese patch already on this computer (never downloads anything).
      // Read-only: how much of the work is read, {total, read, ratio, source} (services/read-progress.cjs); ids for several at once.
      case 'read_progress':{const rp=require('./read-progress.cjs');if(Array.isArray(request.ids))return {items:request.ids.map(i=>{try{return rp.progress(root,db,i);}catch(e){return {id:String(i),total:null,read:null,ratio:null,source:null,error:String(e.message||e)};}})};return rp.progress(root,db,request.id);}
      case 'text_source_activity':{
        const pairing=await require('./text-source-worker.cjs').run(root,'localPairs',[String(request.id)]);
        return scriptActivity(pairing);}
      case 'text_source_toggle':{
        if(typeof request.enabled!=='boolean')throw Error('INVALID_TEXT_SOURCE');
        const pairing=await require('./text-source-worker.cjs').run(root,'localPairs',[String(request.id)]);
        scriptSettings().setScriptTranslation(request.enabled);
        await runtime?.settingsSaved?.({scope:'translation',values:{scriptTranslation:request.enabled}});
        return scriptActivity(pairing);}
      case 'text_source_status':{const ot=require('./original-text.cjs'),id=String(request.id);
        if(request.passive!==true)ot.autoPatchLater(root,id,()=>runtime?.reader?.refreshTextSource?.(),{force:!!request.search});
        else if(request.search){
          await require('./text-source-worker.cjs').run(root,'autoPatch',[id,{force:true,drives:false}],{cachedOnly:true});
          runtime?.reader?.refreshTextSource?.();
        }
        /* E297 Hxv4 KiriKiri games: the cold run reads the scripts through the game; 重新查找 retries a failed one */
        const cold=require('./kirikiri-cold.cjs'),row=db.prepare('SELECT id,executable FROM games WHERE id=? AND removed_at IS NULL').get(id),coldOn=require('../core/preferences.cjs').cleanPreferences(require('./store.cjs').readJSON?.(path.join(root,'data','config','preferences.json'))||{}).scriptColdRun!==false;
        if(row&&request.passive!==true)cold.consider(root,row,{enabled:coldOn,force:!!request.search});
        /* 2026-11-14 reading and lining up scripts runs in a worker thread so the service keeps answering (text-source-worker.cjs) */
        return {...await require('./text-source-worker.cjs').run(root,'status',[id],{cachedOnly:request.passive===true}),cold:row?cold.status(root,row.executable):null};}
      case 'text_source_import':{const id=String(request.id),dir=String(request.dir||'');
        const off=require('./text-source-worker.cjs');
        if(request.kind==='patch')await off.run(root,'importPatch',[id,dir],{cachedOnly:true});
        else if(request.kind==='original'){
          await off.run(root,'importOriginal',[id,dir,{activate:true}],{cachedOnly:true});
          try{enableRestoredTranslation(await off.run(root,'localPairs',[id]),runtime);}catch{}
        }else throw Error('INVALID_TEXT_SOURCE');
        runtime?.reader?.refreshTextSource?.();return off.run(root,'status',[id],{cachedOnly:true});}
      case 'text_source_clear':{
        const result=await require('./text-source-worker.cjs').run(root,'clear',[String(request.id),request.kind],{cachedOnly:true});
        runtime?.reader?.refreshTextSource?.();return result;}
      /* 2026-11-12 Chinese-build guide on the game page: checks, then the one-click fixes the existing code can do */
      case 'first_player':require('./torch-receive.cjs').enqueue(root,[String(request.id)],{priority:'user',cooldown:true});return await require('./first-player.cjs').state(db,root,String(request.id),{wait:request.poll===true?0:2500});
      case 'first_player_layout':return require('./presentation.cjs').confirm(db,root,request);
      case 'first_player_credit':return await require('./first-player.cjs').setCredit(db,root,String(request.id),typeof request.name==='string'?request.name:null);
      case 'first_player_share':return {on:require('./first-player.cjs').enableSharing(root)};
      case 'cn_version_guide':{const g=require('./cn-version-guide.cjs').guide(db,root,String(request.id));return g;}
      case 'cn_guide_fix':{const id=String(request.id),cg=require('./cn-version-guide.cjs'),row=db.prepare('SELECT executable,original FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row?.executable)throw Error('GAME_NOT_FOUND');const dir=require('./patch-swap.cjs').gameDirectory(root,id,row.executable,JSON.parse(row.original||'{}').library?.dir);
        if(request.kind==='swap'){const result=require('./game-language.cjs').select(db,id,'ja',undefined,root);
          return {...result,patch:result.changed?await pairRestoredTranslation(id,runtime):false};}
        if(request.kind==='reveal'){const file=require('node:path').resolve(String(request.path||''));if(!cg.revealable(dir,file))throw Error('CN_GUIDE_PATH');const child=spawn('explorer.exe',['/select,'+file],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};}
        throw Error('CN_GUIDE_FIX');}
      case 'game_original_executable':{const id=String(request.id),result=require('./game-language.cjs').originalExecutable(db,id,root,request.mode,request.executable);
        if(request.mode)require('./torch-receive.cjs').enqueue(root,[id],{force:true,priority:'user'});
        const row=db.prepare('SELECT original FROM games WHERE id=?').get(id);
        return {...result,patch:result.changed?await pairRestoredTranslation(id,runtime):false,localeJapanese:JSON.parse(row?.original||'{}').library?.localeMode==='japanese'};}
      // E237 Japanese restore (Tools page): list library games that ship Japanese data, then apply or undo per game.
      /* E590 automatic Japanese: notices, global and per-game switch, status, undo */
      case 'jp_auto_notices':{const ja=require('../core/japanese-auto.cjs');return ja.takeNotices(root).map(n=>({...n,title:db.prepare('SELECT title FROM games WHERE id=?').get(n.id)?.title||''}));}
      case 'jp_auto_get':return {enabled:require('../core/japanese-auto.cjs').read(root).enabled};
      case 'jp_auto_set':{const ja=require('../core/japanese-auto.cjs');if(request.id!=null){ja.setGameOff(root,String(request.id),request.off===true);return {ok:true};}return ja.setEnabled(root,request.enabled!==false);}
      case 'jp_auto_status':case 'jp_auto_undo':{const id=String(request.id),row=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row?.executable)throw Error('GAME_NOT_FOUND');const dir=path.dirname(row.executable),ja=require('../core/japanese-auto.cjs');
       if(request.action==='jp_auto_status')return ja.status(root,id,dir,{executable:row.executable,...require('./japanese-restore-options.cjs').forExecutable(row.executable)});return require('./embedded-japanese-jobs.cjs').runLegacy(id,dir,{operation:'undo',requestId:request.requestId},async()=>{if(require('../core/japanese-restore.cjs')._internal.gameRunning(dir))throw Error('GAME_RUNNING');const result=ja.undo(root,id,dir,{options:require('./japanese-restore-options.cjs').forExecutable(row.executable)});runtime?.reader?.refreshTextSource?.();return result;});}
      case 'jp_restore_scan':case 'jp_restore_scan_status':case 'jp_restore_scan_cancel':{
       const id=String(request.id),row=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row?.executable)throw Error('GAME_NOT_FOUND');
       const jobs=require('./embedded-japanese-jobs.cjs');
       const query={jobId:request.jobId?String(request.jobId):undefined,requestId:request.requestId?String(request.requestId):undefined,retireIfMissing:request.retireIfMissing===true,operation:request.operation};
       if(request.action==='jp_restore_scan_status')return jobs.status(id,query);
       if(request.action==='jp_restore_scan_cancel')return jobs.cancel(id,query);
       return jobs.start(id,path.dirname(row.executable),{requestId:String(request.requestId||'')});}
      case 'jp_restore_list':{const fs=require('node:fs'),path=require('node:path');return db.prepare('SELECT id,title,executable FROM games WHERE removed_at IS NULL ORDER BY title').all().map(g=>{const dir=g.executable?path.dirname(g.executable):'';let hint='';try{if(dir&&(fs.existsSync(path.join(dir,'.megulit-japanese'))||fs.existsSync(path.join(dir,'.megulit-japanese-import'))))hint='applied';else if(dir&&require('../core/japanese-import.cjs').translatedOnly(dir,g.executable))hint='translated';else if(dir&&fs.existsSync(path.join(dir,'dat'))&&fs.readdirSync(path.join(dir,'dat')).some(f=>/\.dbs$/i.test(f)))hint='candidate';else if(dir&&fs.readdirSync(dir).some(n=>/^(scene|gameexe)(jp|ja|en|zh|cn|tw)?\.(pck|dat)$/i.test(n)||/_(jp|ja)\.(xp3|pck|arc|dat)$/i.test(n)))hint='unsupported';}catch{}return dir?{id:g.id,title:g.title,hint:hint||'import',dir:dir.toLowerCase()}:null;}).filter(Boolean).filter((g,i,all)=>all.findIndex(o=>o.dir===g.dir)===i).map(({dir,...g})=>g);}
      case 'jp_restore_steam':case 'jp_restore_detect':case 'jp_restore_apply':case 'jp_restore_undo':case 'jp_import_apply':case 'jp_import_preview':case 'jp_import_cancel':case 'jp_import_reveal':{const id=String(request.id),row=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row?.executable)throw Error('GAME_NOT_FOUND');const dir=require('node:path').dirname(row.executable),jr=require('../core/japanese-restore.cjs'),ji=require('../core/japanese-import.cjs');
       if(request.action==='jp_restore_apply'&&request.embedded===true)return require('./embedded-japanese-jobs.cjs').start(id,dir,{operation:'restore',requestId:String(request.requestId||''),scanToken:String(request.scanToken||''),onDone:result=>{
        result.patch=false;
        if(result.already)return;
        const provider=require('./embedded-japanese.cjs').provider(dir);
        result.patch=enableRestoredTranslation({hasPairs:provider?.hasLocalPairs?.()===true,embedded:true},runtime);
       }});
       const jobService=require('./embedded-japanese-jobs.cjs'),knownRequest=request.action==='jp_restore_undo'?jobService.known(id,request.requestId):null;
       if(request.action==='jp_restore_undo'&&(require('./embedded-japanese.cjs').manifest(dir)||knownRequest&&!knownRequest.legacy&&knownRequest.operation==='undo'))return jobService.start(id,dir,{operation:'undo',requestId:String(request.requestId||''),onDone:()=>runtime?.reader?.refreshTextSource?.()});
       const perform=async()=>{
       /* E525 Steam store languages (cached by the Chinese-build guide, fetched in the background when missing) */
       const steamApp=require('../core/game-language-switch.cjs')._internal.steamApp(dir),lsOptions=require('./japanese-restore-options.cjs').forExecutable(row.executable);/* engine-draw (Artemis): this game's diff asks the game to draw its own Chinese track under the Japanese */try{const g=db.prepare('SELECT engine,title FROM games WHERE id=?').get(id)||{},P=require('../core/profiles/index.cjs'),pr=P.profileFor({exe:row.executable,engine:g.engine,title:g.title});if(P.get(pr,'draw.embed',false)===true&&P.get(pr,'draw.embedTranslation',true)!==false)lsOptions.bilingual='cn';}catch{}if(steamApp){try{const net=require('./cn-version-guide.cjs').online(root,{appid:steamApp.appid});if(net.state==='done'&&typeof net.steamJapanese==='boolean')lsOptions.steamJapanese=net.steamJapanese;}catch{}}
       if(request.action==='jp_restore_steam'){if(!steamApp)throw Error('NOT_STEAM');const child=spawn('explorer.exe',['steam://nav/games/details/'+steamApp.appid],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true,appid:steamApp.appid};}
       /* E280 Chinese-only packages: say so, and import the script archives from a Japanese original the user points at */
       const imported=ji.detect(dir,row.executable),jio=require('../core/japanese-import-original.cjs'),generic=jio.readManifest(dir)?.adapter===jio.ADAPTER;
       /* E328 after the game is switched to Japanese, the files moved aside are the translation patch: build the
          zero-latency translation from them at once and report whether it worked */
       const withPatch=async r=>({...r,patch:await pairRestoredTranslation(id,runtime)});
       /* E327 import from a Japanese original the user has: folder, program or archive; preview first, then apply */
       if(request.action==='jp_import_preview'){
        if(request.discoverArchive===true)return jio.discoverArchive(dir,row.executable);
        return imported?.state==='importable'&&/\.exe$/i.test(String(request.source||''))?
         ji.preview(dir,row.executable,String(request.source||'')):jio.preview(dir,String(request.source||''),row.executable);
       }
       if(request.action==='jp_import_cancel'){jio.cleanup(dir);return {ok:true};}
       /* E339: show the .iso made from an installer disc in Explorer (selected, not opened) */
       if(request.action==='jp_import_reveal'){const file=require('node:path').resolve(String(request.path||''));if(!/\.iso$/i.test(file)||!fs.existsSync(file))throw Error('IMPORT_SOURCE_MISSING');const child=spawn('explorer.exe',['/select,'+file],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};}
       if(request.action==='jp_import_apply'&&(imported?.state!=='importable'||request.archiveToken||!/\.exe$/i.test(String(request.source||'')))){
        const beforeWrite=()=>{if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');};
        beforeWrite();
        return jio.apply(dir,String(request.source||''),row.executable,{archiveToken:request.archiveToken,beforeWrite}).then(r=>{
         if(r.archive){let patch=false;try{runtime?.reader?.refreshTextSource?.();const paired=jio.localArchive(row.executable);
          patch=scriptActivity({hasPairs:paired?.coverage.paired>0,perGame:true}).active;}catch{}
          return {...r,patch};}
         try{r.sourceHidden=require('./import-source.cjs').link(db,id,String(request.source||'')).length;}catch{}
         if(r.separate){importedExecutable(db,id,r.exe,'ja');return withPatch(r);}
         if(r.exe&&require('node:path').basename(r.exe).toLowerCase()!==require('node:path').basename(row.executable).toLowerCase())importedExecutable(db,id,r.exe,'ja');else if(changedFiles(r))importedExecutable(db,id,row.executable,'ja');return withPatch(r);
        });}
       if(request.action==='jp_restore_undo'&&generic){if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');const r=jio.restore(dir);if(!r.archive&&!r.skipped.length)importedExecutable(db,id,r.exe&&r.exe.toLowerCase()!==row.executable.toLowerCase()?r.exe:row.executable,'zh');return r;}
       if(request.action==='jp_restore_detect'){
        const archive=generic&&jio.archiveManifest(dir);
        if(archive)return {state:'imported',archive:true,verified:!!jio.localArchive(row.executable,archive),coverage:archive.coverage};
        const r=jr.detect(dir,lsOptions);if(imported&&(imported.state==='imported'||['none','unsupported'].includes(r.state)))return imported;
        if(r.state==='already'&&r.adapter==='siglus-dbs')return {...r,state:'resources'};
        /* Cached script indexes and reading history cannot establish what the selected launcher loads now. */
        if(['none','unsupported'].includes(r.state)){const tl=require('../core/translated-launcher.cjs').inspect(row.executable);if(tl.translated)return {state:'translated',executable:row.executable,original:tl.original};}
        return r;}
       if(request.action==='jp_import_apply'){if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');const r=ji.apply(dir,row.executable,request.source);importedExecutable(db,id,r.exe,'ja');try{r.sourceHidden=require('./import-source.cjs').link(db,id,String(request.source||'')).length;}catch{}return withPatch(r);}
       if(request.action==='jp_restore_undo'&&imported?.state==='imported'){if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');const r=ji.restore(dir);if(!r.skipped.length)importedExecutable(db,id,r.exe,'zh');return r;}
       /* E595 a Chinese patch over the release: turned off by the import's backed-up remove step (undo = jp_restore_undo) */
       if(request.action==='jp_restore_apply'&&jr.detect(dir,lsOptions).adapter==='overlay-patch'){if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');return jio.apply(dir,dir,row.executable).then(r=>{if(changedFiles(r))importedExecutable(db,id,r.exe||row.executable,'ja');return withPatch({...r,applied:r.imported,cells:0});});}
       return request.action==='jp_restore_apply'?withPatch(jr.apply(dir,lsOptions)):jr.restore(dir,lsOptions);
       };
       if(!['jp_restore_apply','jp_restore_undo','jp_import_apply'].includes(request.action))return perform();
       return jobService.runLegacy(id,dir,{operation:request.action==='jp_restore_undo'?'undo':'restore',requestId:request.requestId},async()=>{
        const result=await perform();if(request.action==='jp_restore_undo')runtime?.reader?.refreshTextSource?.();return result;
       });}
      case 'game_cover':return require('./game-cover.cjs').setCover(db,root,String(request.id),request.path);
      /* E362 adaptation overview + one-click diagnostic package (built locally; shown to the user before any upload) */
      case 'adaptation_overview':return require('./adaptation-overview.cjs').overview(db,root);
      case 'diagnostics_build':return require('./diagnostics.cjs').build(root,db,String(request.id),{version:String(request.version||'').slice(0,40)});
      /* 2026-11-12 About > Uninstall MeguLit: the uninstaller window runs on its own (it closes MeguLit itself) */
      case 'uninstall_open':{const script=path.join(root,'setup','uninstall.ps1');if(!fs.existsSync(script))throw Error('UNINSTALLER_MISSING');const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');const child=spawn(ps,['-NoProfile','-ExecutionPolicy','Bypass','-STA','-WindowStyle','Hidden','-File',script,'-Root',root],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {opened:true};}
      case 'diagnostics_reveal':{const file=require('./diagnostics.cjs').ownPackage(root,request.path);const child=spawn('explorer.exe',['/select,'+file],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};}
      case 'diagnostics_build_all':return require('./diagnostics.cjs').buildAll(root,db,{version:String(request.version||'').slice(0,40)}); /* E394 whole-app package from About */
      case 'logs_export_desktop':return require('./log-export.cjs').exportToDesktop(root,db,{problem:String(request.problem||''),version:String(request.version||'').slice(0,40)}); /* 提取日志: whole-app package on the desktop for the QQ group */
      case 'logs_export_reveal':{const file=require('./log-export.cjs').ownExport(request.path);const child=spawn('explorer.exe',['/select,'+file],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};}
      case 'seed_stats':return require('./seed-stats.cjs').stats(root); /* The Seed live counts for the About page, null when the relay does not answer */
      case 'library_developers':return require('./nsfw.cjs').developers(db,root);
      case 'game_developer':return await require('./nsfw.cjs').developerOf(db,root,String(request.id||''));
      case 'nsfw_state':return await require('./nsfw.cjs').state(db,root,{wait:request.wait===true});
      case 'seed_catalog':return await require('./seed-catalog.cjs').catalog(root); /* The Seed catalog page: the seeded games with VNDB names and developers */
      case 'seed_catalog_engines':return await require('./seed-catalog.cjs').engineCounts(root);
      case 'seed_catalog_engine':return await require('./seed-catalog.cjs').enginePage(root,request.engine,request.page);
      case 'seed_logo':return await require('./seed-logo.cjs').logo(root,String(request.pid||''));
      case 'seed_producer':return await require('./seed-producer.cjs').producer(root,String(request.pid||''),{moegirl:require('./info-source.cjs').forRoot(root,String(request.locale||''))});
      case 'seed_producer_open':return require('./seed-producer.cjs').open(root,String(request.pid||''),String(request.kind||''));
      case 'seed_cover':return await require('./seed-catalog.cjs').cover(root,String(request.vndb||''),{nsfw:request.nsfw===true,resolveMissing:request.resolveMissing===true});
      case 'yui_consent':return {enabled:require('./yui.cjs').enabled(root)};
      case 'yui_consent_set':return require('./yui.cjs').setEnabled(root,request.enabled);
      case 'feedback_send':return require('./feedback.cjs').send(root,{kind:String(request.kind||''),text:String(request.text||''),contact:String(request.contact||''),lang:String(request.lang||'zh'),version:String(request.version||'')}); /* E394 in-app feedback through the relay */
      case 'diagnostics_upload':{const file=require('./diagnostics.cjs').ownPackage(root,request.path),m=request.meta||{};return require('./diagnostics-upload.cjs').upload(file,{version:m.version,game:m.game,note:m.note},{root});}
      /* 2026-11-15 学习 › 词典 「加入 Anki」: the in-game card path (reader v4 'anki') with a dictionary entry and no game context */
      case 'dictionary_anki':{if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');const word=String(request.word||'').trim().slice(0,40);if(!word)throw Error('WORD_NOT_FOUND');
        const reader=runtime.reader??=new(require('./reader.cjs').Reader)(runtime);
        return await reader.v4('anki',{dictionary:true,text:word,start:0,end:[...word].length,sentence:String(request.sentence||'').slice(0,1000),translation:String(request.translation||'').slice(0,1000)});}
      case 'study_words':return require('./game-detail.cjs').studyWords(db,root);
      case 'game_detail':await require('./background-games.cjs').foreground();return require('./game-detail.cjs').detail(db,root,String(request.id),request.locale);
      case 'home_lines':return require('./home-lines.cjs').list(db,root,String(request.id),{query:request.query,limit:request.limit});
      case 'home_lines_save':return {chosen:require('./home-lines.cjs').save(root,String(request.id),request.lines)};
      case 'game_synopsis':return await require('./game-detail.cjs').refreshSynopsis(db,root,String(request.id),request.locale,runtime?.metadata().synopses);
      case 'unknown_words':return require('./unknown-words.cjs').unknownWords(root);
      case 'preferences':return store.publicPreferences(root);
      /* Settings → 重置所有设置 (services/settings-reset.cjs): back up, reset, then push the defaults to an open reader */
      case 'settings_reset':case 'settings_reset_undo':{const r=require('./settings-reset.cjs'),result=request.action==='settings_reset'?r.reset(root):r.undo(root,String(request.id||''));for(const scope of ['text','panels'])try{await runtime?.settingsSaved({scope});}catch{}return result;}
      case 'settings_get':return new(require('./settings.cjs').Settings)(root).get(String(request.profile||''));
      case 'settings_save':{const libraryOnlyBefore=request.scope==='library'?runtime?.libraryOnly?.():undefined;const leaving=request.scope==='online'&&request.values?.leaderboardEnabled===false&&require('./leaderboard.cjs').config(root).enabled;const settings=new(require('./settings.cjs').Settings)(root),/* issue 800: the page sends every field; the running work drops its sizes only when the global ones changed */sizesBefore=request.scope==='text'&&!request.profile?settings.read('text'):undefined;const result=settings.save({scope:request.scope,values:request.values,appendFolders:request.appendFolders===true,profile:String(request.profile||'')});await runtime?.settingsSaved({...request,sizesBefore,libraryOnlyBefore});if(leaving)await require('./leaderboard.cjs').leave(root).catch(()=>{});return leaving?new(require('./settings.cjs').Settings)(root).get(String(request.profile||'')):result;}
      /* E415 每日 page: Galgame news and hot words from the relay (services/daily.cjs) */
      case 'daily_view':return await require('./daily.cjs').view(root,db,{runtime,force:request.force===true});
      case 'daily_article':return await require('./daily.cjs').article(root,String(request.link||''),{runtime});
      case 'daily_translate':return await require('./daily.cjs').translate(root,runtime,request.texts,String(request.target||'zh'),{withEngine:true});
      case 'daily_anki':return await require('./daily.cjs').anki(root,runtime,request);
      case 'daily_open':{const url=String(request.url||'');if(!require('./daily.cjs').canOpen(url))throw Error('URL_NOT_ALLOWED');const child=spawn('explorer.exe',[new URL(url).href],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {opened:true};}
      /* E377 opt-in leaderboard (services/leaderboard.cjs) */
      case 'profile_name_save':return await require('./leaderboard.cjs').saveProfileName(root,db,{name:request.name,joinBoard:request.joinBoard===true});
      case 'profile_chip':return require('./leaderboard.cjs').chip(root);
      /* 2026-11-21 传火碑 (services/torch-monument.cjs, web/torch-monument.js) */
      case 'torch_page':return await require('./torch-monument.cjs').page(root,{month:String(request.month||''),cursor:String(request.cursor??''),before:String(request.before??''),limit:Number(request.limit)||300});
      case 'torch_months':return await require('./torch-monument.cjs').months(root);
      case 'torch_find':return await require('./torch-monument.cjs').find(root,String(request.name||''));
      case 'torch_me':return await require('./torch-monument.cjs').me(root);
      case 'leaderboard_view':return await require('./leaderboard.cjs').view(root,db,{period:String(request.period||''),metric:String(request.metric||''),game:typeof request.game==='string'?request.game:'',submit:request.submit===true,tab:String(request.tab||''),week:String(request.week||''),category:String(request.category||'')});
      /* E379 avatars (moderated on the relay) and reports */
      case 'leaderboard_avatar_set':return await require('./leaderboard.cjs').setAvatar(root,String(request.data||''));
      case 'leaderboard_avatar_remove':return await require('./leaderboard.cjs').removeAvatar(root);
      case 'leaderboard_avatar_status':return await require('./leaderboard.cjs').avatarStatus(root);
      case 'leaderboard_avatar_appeal':return await require('./leaderboard.cjs').appealAvatar(root,{version:String(request.version||'').slice(0,20)});
      case 'leaderboard_report':return await require('./leaderboard.cjs').report(root,String(request.avatar||''));
      case 'leaderboard_join':{const lb=require('./leaderboard.cjs');lb.join(root,{name:request.name,shareGames:request.shareGames===true,consent:request.consent===true,requireAccount:true});return await lb.view(root,db,{period:String(request.period||''),metric:String(request.metric||''),submit:true});}
      /* E394 Settings → 个人主页 reads the switch, nickname and sharing without fetching the board */
      /* 2026-11-12 转职: the reader's element (data/config/reader-class.json, services/reader-class.cjs) */
      case 'reader_class_get':return require('./reader-class.cjs').read(root);
      /* the level as this PC counts it, with whether 转职 is due and how much experience waits for it */
      case 'reader_level':{const rc=require('./reader-class.cjs'),cls=rc.read(root),all=require('./leaderboard.cjs').collectStats(db,new Date(),root).stats?.all||{};return {element:cls.element,...rc.readerLevel(all,cls.element)};}
      case 'reader_class_set':return require('./reader-class.cjs').write(root,String(request.element||''));
      case 'leaderboard_profile':{const c=require('./leaderboard.cjs').config(root);return {configured:c.configured,joined:c.joined,enabled:c.enabled,name:c.name,shareGames:c.shareGames,account:c.account};}
      /* E397 profiles, follows, 同好, reports */
      case 'leaderboard_profile_get':return await require('./leaderboard.cjs').profileGet(root);
      case 'leaderboard_profile_save':return await require('./leaderboard.cjs').profileSave(root,{bio:typeof request.bio==='string'?request.bio:'',favorites:Array.isArray(request.favorites)?request.favorites:[],public:request.public===true});
      case 'leaderboard_card':return await require('./leaderboard.cjs').profileCard(root,String(request.pid||''));
      case 'leaderboard_follow':return await require('./leaderboard.cjs').followSet(root,String(request.pid||''),request.on===true);
      case 'leaderboard_report_profile':return await require('./leaderboard.cjs').reportProfile(root,String(request.pid||''),{kind:String(request.kind||''),reason:typeof request.reason==='string'?request.reason:''});
      case 'leaderboard_profile_appeal':return await require('./leaderboard.cjs').appealProfile(root,{reason:typeof request.reason==='string'?request.reason:''});
      /* #117 交流 board (services/forum.cjs) */
      case 'forum_status':return require('./forum.cjs').status(root);
      case 'forum_list':return await require('./forum.cjs').list(root,{game:String(request.game||''),engine:String(request.engine||''),tag:String(request.tag||''),mine:request.mine===true,page:Number(request.page)||0});
      case 'forum_get':return await require('./forum.cjs').get(root,String(request.id||''));
      case 'forum_post':return await require('./forum.cjs').create(root,{title:String(request.title||''),body:String(request.body||''),tag:String(request.tag||''),game:String(request.game||''),engine:String(request.engine||''),images:Array.isArray(request.images)?request.images:[]});
      case 'forum_image':return await require('./forum.cjs').uploadImage(root,String(request.data||''));
      case 'forum_reply':return await require('./forum.cjs').reply(root,String(request.id||''),String(request.body||''),{},Array.isArray(request.images)?request.images:[]);
      case 'forum_delete':return await require('./forum.cjs').remove(root,String(request.id||''),String(request.reply||''));
      case 'leaderboard_library':return require('./leaderboard.cjs').libraryTitles(db);
      case 'leaderboard_leave':return await require('./leaderboard.cjs').leave(root);
      case 'save_key':return new(require('./settings.cjs').Settings)(root).saveKey({provider:request.provider,baseUrl:request.baseUrl,apiKey:request.apiKey});
      case 'anki_find':return {path:findAnki(runtime)};
      /* 2026-11-12 one-click Anki: download the official installer, install it, add AnkiConnect, start and connect */
      case 'anki_install':return require('../core/anki-installer.cjs').start(root,{runtime});
      case 'windows_feature_install':{const feature=neededFeature.get(String(request.id||''))||'DirectPlay';const r=await require('../core/windows-features.cjs').install(feature);neededFeature.delete(String(request.id||''));return r;}
      case 'anki_install_status':return require('../core/anki-installer.cjs').status();
      case 'anki_install_connect':return await require('../core/anki-process.cjs').installAnkiConnect(process.env,{locate:()=>findAnki(runtime)});
      case 'anki_connect_status':return {installed:require('../core/anki-process.cjs').ankiConnectInstalled()};
      case 'anki_launch':{const runner=runtime.ankiProcess(),hide=!!runtime.config().ankiHidden;if(String(request.reason||'')==='ANKI_PORT_TAKEN')return await runner.repair({hide});return await runner.start({hide});}
      case 'anki_repair':return await runtime.ankiProcess().repair({hide:!!runtime.config().ankiHidden});
      case 'anki_hide':return {hidden:(await runtime.ankiProcess().hide())>0};
      case 'anki_open':return await runtime.ankiProcess().open(String(request.target||''),String(request.deck||''));
      case 'anki_status':case 'anki_current':case 'anki_start':case 'anki_show_answer':case 'anki_grade':case 'anki_play_audio':case 'anki_stop':case 'anki_practice':case 'anki_deck_config':case 'anki_deck_limits':{
        const {AnkiReviewer}=require('./anki-review.cjs');
        const reviewConfig=store.readJSON(path.join(root,'data','config','v4-preferences.json'),store.readJSON(path.join(root,'migration','baseline-20261103','config','v4-preferences.json')));const reviewer=new AnkiReviewer({db,config:reviewConfig,mediaDir:require('../core/anki-media-cache.cjs').dirFor(root),voiceCheck:async(text,buf)=>{const gv=require('./game-voice.cjs');await Promise.race([gv.refreshStale(root),new Promise(r=>setTimeout(r,8000).unref?.())]);return gv.recordedFits(root,text,buf);},gameVoice:async text=>{const v=require('./game-voice.cjs').find(root,text);return v?.source==='scan'?v:null;},speak:runtime?async text=>{const c=runtime.config?.()||reviewConfig;try{await runtime.services().ensureSpeech(c.aivisUrl,c.aivisGpu);}catch{}return runtime.speech().synthesize({surface:text,reading:'',pitch:[]},c);}:null});
        if(request.action==='anki_status')return await reviewer.status();
        if(request.action==='anki_current')return await reviewer.snapshot(null,{recover:true});
        if(request.action==='anki_stop')return await reviewer.stop();
        if(request.action==='anki_practice')return request.end===true?reviewer.endPractice():await reviewer.practice(String(request.deck||''),request.advance===true,request.resume===true);
        if(request.action==='anki_deck_config')return await reviewer.deckConfig(String(request.deck||''));
        if(request.action==='anki_deck_limits')return await reviewer.saveDeckLimits(String(request.deck||''),{newPerDay:request.newPerDay,revPerDay:request.revPerDay});
        if(request.action==='anki_start')return await reviewer.start(String(request.deck||''));
        if(request.action==='anki_show_answer')return await reviewer.showAnswer(Number(request.cardId));
        if(request.action==='anki_play_audio')return await reviewer.playAudio(Number(request.cardId));
        return await reviewer.grade({cardId:Number(request.cardId),ease:Number(request.ease),operationId:request.operationId});
      }
      case 'ui_state':return cleanUiState(store.readJSON(path.join(root,'data','ui-state.json'),store.readJSON(path.join(root,'migration','baseline-20261103','config','ui-state.json'))));
      case 'preserve_ui':{
        const values=cleanUiState(request.values),file=path.join(root,'data','ui-state.json');
        fs.writeFileSync(file,JSON.stringify(values,null,2));return {keys:Object.keys(values).length};
      }
      /* 2026-11-27 新手引导 again (教程 in the top bar): the reader shows it now if a game is on, else ui-state.json keeps the wish for the next launch */
      case 'onboarding_replay':{
        /* the key and its shape belong to web/onboarding-steps.js (KEY, replay); web/ is inside the exe, so it is not required from here */
        const KEY='tomoyo-onboarding',file=path.join(root,'data','ui-state.json'),values=cleanUiState(store.readJSON(file,{}));
        let saved={};try{saved=JSON.parse(values[KEY]||'{}')||{};}catch{}if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};values[KEY]=JSON.stringify({...saved,replay:true});fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(values,null,2));
        runtime?.emit('reader-event',{type:'onboarding',action:'replay'});return {replay:true};
      }
      /* 教程 opened in the main window: the red dot on the 教程 buttons is done with */
      case 'onboarding_seen':{
        const KEY='tomoyo-onboarding',file=path.join(root,'data','ui-state.json'),values=cleanUiState(store.readJSON(file,{}));
        let saved={};try{saved=JSON.parse(values[KEY]||'{}')||{};}catch{}if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
        values[KEY]=JSON.stringify({...saved,seen:true});fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(values,null,2));return {seen:true};
      }
      case 'save_preferences':{const preferences=savePreferences(request);runtime?.emit('reader-event',{type:'appearance',preferences});if(request.values?.language)runtime?.emit('reader-event',{type:'language',language:preferences.language});return preferences;}
      /* 2026-11-27 Settings → 热键 (web/hotkeys-panel.js), also called by the Alt+T 热键 page */
      case 'hotkeys_get':return require('../core/hotkeys.cjs').state(path.join(root,'data','config'));
      case 'hotkeys_save':{const keys=require('../core/hotkeys.cjs'),folder=path.join(root,'data','config');keys.save(folder,request.changes);keys.publish(folder,runtime);return keys.state(folder);}
      /* the log key chosen in the log page before 2026-11-27 (the reader's own storage) is taken over once */
      case 'hotkeys_adopt_log':{const keys=require('../core/hotkeys.cjs'),folder=path.join(root,'data','config');if(keys.adoptLog(folder,request.value))keys.publish(folder,runtime);return keys.state(folder);}
      case 'hotkeys_pause':runtime?.reader?.gal?.send?.({type:'hotkeysPause',paused:request.paused===true});return {paused:request.paused===true};
      case 'asset_get':return require('./assets.cjs').get(root,String(request.slot||'home'));
      case 'asset_preview':return require('./assets.cjs').preview(request.path);
      case 'asset_set':return require('./assets.cjs').set(root,String(request.slot||'home'),request.path);
      case 'asset_clear':return require('./assets.cjs').clear(root,String(request.slot||'home'));
      case 'background':{
        return require('./assets.cjs').get(root,'home');
      }
      case 'save_game':{
        const title=String(request.title||'').trim().slice(0,240),executable=String(request.executable||'').trim();
        if(!title)throw Error('INVALID_TITLE');
        if(!path.isAbsolute(executable)||!executable.toLowerCase().endsWith('.exe')||!fs.existsSync(executable)||!fs.statSync(executable).isFile())throw Error('INVALID_EXECUTABLE');
        if(request.id){
          const existing=db.prepare('SELECT id,title,original FROM games WHERE id=?').get(String(request.id));if(!existing)throw Error('GAME_NOT_FOUND');
          const original=JSON.parse(existing.original);if(original.library)original.library.exe=executable;
          /* a name the user changed is theirs: seed and VNDB matches no longer replace it (core/library-title.cjs) */
          if(title!==existing.title)original.titleSource='user';
          // vndb: a VNDB entry chosen by the user ("" goes back to automatic matching); left out, it stays as it is.
          const vndb=request.vndb===undefined?undefined:require('./game-enrichment.cjs').vndbIdFrom(request.vndb),vndbChanged=vndb!==undefined&&vndb!==(original.vndbManual||'');
          if(vndbChanged){if(vndb)original.vndbManual=vndb;else delete original.vndbManual;
            const lib=original.library;
            if(lib?.appid&&vndb!==lib.vndbId&&['folder','manual'].includes(lib.source)&&!require('../core/library.cjs').steamAppidFor(executable)){
              lib.appid=null;lib.vndbSteamAppid=null;
            }}
          original.library={...original.library,exe:executable,executableSignature:require('./library.cjs').signature(executable)};
          db.prepare('UPDATE games SET title=?,executable=?,original=? WHERE id=?').run(title,executable,JSON.stringify(original),existing.id);
          require('./series.cjs').autoGroup(db,root);runtime?.metadata().enqueue([existing.id],vndbChanged);require('./torch-receive.cjs').enqueue(root,[existing.id],{force:true,priority:'user'});return {id:existing.id,vndbChanged};
        }
        const library=require('./library.cjs'),match=library.matchGame(db,{title,exe:executable},{manual:true});
        const id=match?.id||'game-'+crypto.randomUUID(),original=match?JSON.parse(match.original):{};
        /* E599 (live 2026-11-15: The Shell re-added by hand turned 'manual', MeguLit then started TheShell.exe directly and the game
           stopped at Steam's CODE 00013): the same program of a Steam entry stays a Steam game, so it keeps starting through Steam */
        const sameSteam=match&&!match.removed_at&&original.library?.source==='steam'&&!original.library?.steamRejected&&/^\d+$/.test(String(original.library?.appid||''))&&String(match.executable||'').toLowerCase()===executable.toLowerCase();
        const source=sameSteam?'steam':'manual';
        original.library={...original.library,source,steamRejected:false,dir:path.dirname(executable),exe:executable,executableSignature:library.signature(executable)};
        /* titleAuto: the add dialog filled the name itself (the work's name it looked up, or the folder name); false: the user typed
           it. A folder or program name is replaced by the work's name once the seed or VNDB match is known (core/library-title.cjs) */
        {const T=require('../core/library-title.cjs');original.titleSource=T.isFallback(title,executable)?'folder':request.titleAuto===true?'work':request.titleAuto===false?'user':'scan';}
        if(match)db.prepare("UPDATE games SET title=?,executable=?,source=?,removed_at=NULL,original=? WHERE id=?").run(title,executable,source,JSON.stringify(original),id);
        else db.prepare('INSERT INTO games(id,title,executable,source,original) VALUES (?,?,?,?,?)').run(id,title,executable,'manual',JSON.stringify(original));
        require('./series.cjs').autoGroup(db,root);runtime?.metadata().enqueue([id]);require('./torch-receive.cjs').enqueue(root,[id],{force:true,priority:'user'});return {id};
      }
      /* the add dialog's name for a picked program: the seed's work name, else VNDB's, else the folder name (core/library-title.cjs) */
      case 'game_title_lookup':return await require('./game-enrichment.cjs').lookupTitle(root,String(request.executable||'').trim());
      case 'hidden_games':return db.prepare('SELECT id,title FROM games WHERE hidden_at IS NOT NULL AND removed_at IS NULL ORDER BY title').all();
      case 'set_game_hidden':{
        const result=db.prepare('UPDATE games SET hidden_at=? WHERE id=? AND removed_at IS NULL').run(request.hidden===true?Math.floor(Date.now()/1000):null,String(request.id));
        if(!result.changes)throw Error('GAME_NOT_FOUND');
        return {hidden:request.hidden===true};
      }
      case 'remove_game':{
        const game=db.prepare('SELECT id,title,legacy_id FROM games WHERE id=? AND removed_at IS NULL').get(String(request.id));
        if(!game)throw Error('GAME_NOT_FOUND');
        if(request.permanent===true){
          if(runtime?.reader?.gameId===game.id)throw Error('GAME_RECORDING_ACTIVE');
          db.exec('BEGIN IMMEDIATE');
          try{
            db.prepare('DELETE FROM reading_events WHERE game_id=? OR session_id IN (SELECT id FROM reading_sessions WHERE game_id=?)').run(game.id,game.id);
            for(const table of ['reading_sessions','lookup_events','saved_sentences','examples'])db.prepare('DELETE FROM '+table+' WHERE game_id=?').run(game.id);
            if(game.legacy_id!=null)db.prepare(`DELETE FROM preserved_records WHERE
              (collection='media' AND json_extract(payload,'$.id')=?) OR
              (collection IN ('sessions','sentence_read_events','lookup_events','sentences','word_sentences') AND json_extract(payload,'$.media_id')=?)`).run(game.legacy_id,game.legacy_id);
            db.prepare('DELETE FROM games WHERE id=?').run(game.id);
            db.exec('COMMIT');
            require('./sentence-scenes.cjs').removeGame(root,game.id);
          }catch(error){db.exec('ROLLBACK');throw error;}
        }else db.prepare('UPDATE games SET removed_at=? WHERE id=?').run(Math.floor(Date.now()/1000),game.id);
        return {removed:game.id};
      }
      case 'dictionary':{
        const query=String(request.query||'').trim().slice(0,100);
        if(!query)return [];
        const online=request.source==='moji'||request.source==='jisho'||request.source==='weblio';/* 2026-11-13 English UI: Jisho (services/jisho-dictionary.cjs) */
        /* #1110 Weblio 国語辞典 / 日中中日辞典 public pages (services/weblio-dictionary.cjs) */
        let entries=request.source==='weblio'?await require('./weblio-dictionary.cjs').lookupWeblio(query,fetch,{root,language:request.language==='en'?'en':'zh'}):request.source==='jisho'?await require('./jisho-dictionary.cjs').lookupJisho(query,fetch,{root}):request.source==='moji'?await require('./moji-dictionary.cjs').lookupMoji(query,fetch,{root}):db.prepare('SELECT DISTINCT e.spelling,e.reading,e.definition FROM dictionary_entries e JOIN dictionary_forms f ON e.id=f.entry_id WHERE f.form=? ORDER BY e.frequency LIMIT 20').all(query);
        /* E457 (user, 2026-11-12: 本地查词 found nothing for 爆裂 or 夢): the dictionary_entries table is only filled by a
           developer tool, so it is empty on every install. The local search now asks the same JMdict the lookup card uses. */
        if(!entries.length&&!online&&runtime){try{const r=await runtime.learning().request('lookup_exact',{text:query,start:0,end:[...query].length},request.language==='en'?'en':'zh');entries=localEntries(r,query);}catch{}}
        /* #1099 the player's own dictionaries are asked with the built-in one; each row carries its dictionary's name */
        if(!online){try{entries=[...entries,...require('./user-dictionaries.cjs').rows(root,[query])];}catch{}}
        if(entries.length&&typeof request.operationId==='string'&&request.operationId.length<100)require('./unknown-words.cjs').recordLookup(root,{surface:query,operationId:request.operationId});
        return entries;
      }
      case 'dictionary_related':{/* 2026-11-13 related words for the dictionary field (services/dict-related.cjs) */const vocab=db.prepare('SELECT spelling,reading,status,definitions FROM vocabulary ORDER BY created_at DESC LIMIT 2000').all();return require('./dict-related.cjs').related({query:String(request.query||'').slice(0,40),reading:String(request.reading||'').slice(0,40),definition:String(request.definition||'').slice(0,400)},{vocab});}
      case 'user_dict_list':return require('./user-dictionaries.cjs').list(root);
      case 'user_dict_import':return await require('./user-dictionaries.cjs').importDictionary(root,String(request.path||''),{name:request.name});
      case 'user_dict_toggle':return require('./user-dictionaries.cjs').setEnabled(root,String(request.id||''),request.enabled!==false);
      case 'user_dict_move':return require('./user-dictionaries.cjs').move(root,String(request.id||''),Number(request.delta)||0);
      case 'user_dict_rename':return require('./user-dictionaries.cjs').rename(root,String(request.id||''),request.name);
      case 'user_dict_remove':return require('./user-dictionaries.cjs').remove(root,String(request.id||''));
      case 'moji_status':return require('./moji-dictionary.cjs').status({root});
      case 'moji_login_start':return await require('./moji-dictionary.cjs').loginStart({root});
      case 'moji_login_poll':return await require('./moji-dictionary.cjs').loginPoll(String(request.qrcodeId||''),{root});
      case 'moji_logout':return require('./moji-dictionary.cjs').logout({root});
      case 'moji_audio':return await require('./moji-dictionary.cjs').cachedAudio(String(request.id||''),{root});
      case 'moji_word':return await require('./moji-dictionary.cjs').cachedDetail(String(request.id||''),{root});
      case 'moji_prefetch':return require('./moji-dictionary.cjs').prefetch(request.ids,{root});
      case 'moji_comments':return await require('./moji-dictionary.cjs').wordComments(String(request.id||''),request.page,{root});
      case 'record_review':{
        const id=Number(request.id);if(!db.prepare('SELECT id FROM vocabulary WHERE id=?').get(id))throw Error('WORD_NOT_FOUND');
        db.prepare('INSERT INTO review_events(word_id,reviewed_at) VALUES (?,?)').run(id,Math.floor(Date.now()/1000));return {recorded:true};
      }
      case 'history':return db.prepare('SELECT s.*,g.title FROM reading_sessions s LEFT JOIN games g ON s.game_id=g.id ORDER BY s.started_at DESC LIMIT 500').all();
      case 'dialogue':return require('./history-view.cjs').dialogue(db);
      case 'update_check':return await require('./update.cjs').check(String(request.current||''),fetch,root);
      case 'update_required_status':return require('./relay-gate.cjs').requiredStatus();
      case 'update_apply':return await require('./update.cjs').apply(root,String(request.current||''));
      case 'update_start':{const u=require('./update.cjs');u.start(root,String(request.current||''),fetch,{forceLatest:request.forceLatest===true});return u.status();}
      case 'update_status':return require('./update.cjs').status();
      case 'test_build':return {label:String(process.env.MEGULIT_TEST_BUILD||'').trim()};
      case 'update_install':return await require('./update.cjs').install(root);
      /* 2026-11-15 adaptation contribution consent (services/adapter-contrib.cjs): the update card's 同意并下一步 / 不参与, the beta note */
      case 'contrib_consent':return require('./adapter-contrib.cjs').consentState(root);
      case 'contrib_consent_set':return require('./adapter-contrib.cjs').setConsent(root,request.on===true,{source:String(request.source||'card')});
      case 'contrib_notice_seen':return require('./adapter-contrib.cjs').noticeSeen(root);
      case 'contrib_status':return require('./adapter-contrib.cjs').status(root);
      case 'update_hot_failed':return require('./update.cjs').hotFail(root,String(request.reason||''));
      case 'kana_progress':return require('./kana.cjs').read(root);
      case 'kana_progress_save':return require('./kana.cjs').save(root,request.data);
      case 'learning_goal':return require('./learning-goal.cjs').get(root);
      case 'learning_goal_set':return require('./learning-goal.cjs').set(root,request.goal||{});
      case 'learning_level':return require('./learning-level.cjs').get(root);
      case 'learning_level_set':return require('./learning-level.cjs').set(db,root,{level:String(request.level||''),kana:request.kana});
      case 'kana_game_words':return require('./kana.cjs').gameWords(db,request.words);
      case 'vocabulary':{/* 2026-11-12 each saved word carries its JLPT level (N5–N1) when the open JLPT list has it */const rows=db.prepare('SELECT v.id,v.spelling,v.reading,v.definitions,v.status,v.created_at,e.text AS example_text,e.game_id AS example_game_id,g.title AS example_title FROM vocabulary v LEFT JOIN examples e ON e.id=(SELECT id FROM examples WHERE word_id=v.id ORDER BY id DESC LIMIT 1) LEFT JOIN games g ON g.id=e.game_id ORDER BY v.created_at DESC,v.id DESC LIMIT 1000').all();let jlpt=null;try{jlpt=require('./learning-insights.cjs').loadJlpt();}catch{}return jlpt?rows.map(r=>({...r,jlpt:(jlpt.byForm.get(r.spelling)||jlpt.byForm.get(r.reading)||null)?.level||null})):rows;}
      case 'sentences':return require('./saved-sentences.cjs').list(db,{source:request.source});
      case 'sentence_save':{const r=require('./saved-sentences.cjs').save(db,{gameId:request.gameId,text:request.text,translation:request.translation,source:request.source});/* a new sentence of the game being read: its clean picture when one matches (async) */if(r.created&&r.game_id&&runtime?.reader?.gameId===r.game_id)require('./sentence-scenes.cjs').attach(runtime.reader,r.id);/* 2026-11-15 its game voice (async) */if(r.id)require('./saved-line-voice.cjs').attach({root,reader:runtime?.reader?.gameId===r.game_id?runtime.reader:null},r.id,r.text);runtime?.emit?.('reader-event',{type:'sentence-saved'});return r;}
      case 'sentence_delete':{const r=require('./saved-sentences.cjs').remove(db,{id:request.id,gameId:request.gameId,text:request.text},{root});runtime?.emit?.('reader-event',{type:'sentence-saved'});return r;}
      case 'sentence_state':return require('./saved-sentences.cjs').state(db,{gameId:request.gameId,text:request.text});
      /* 2026-11-13 the clean game picture kept with a collected sentence (sentence-scenes.cjs); file names are checked strictly */
      case 'sentence_scene':return require('./sentence-scenes.cjs').read(root,String(request.id||''),request.file);
      case 'word_trash':return db.prepare('SELECT id,word_id,deleted_at,snapshot FROM word_trash ORDER BY deleted_at DESC,id DESC LIMIT 30').all().map(row=>{const s=JSON.parse(row.snapshot);return {id:row.id,deleted_at:row.deleted_at,spelling:s.word?.spelling || s.spelling || '',reading:s.word?.reading || s.reading || ''};});
      case 'delete_word':return deleteWord(db,Number(request.id));
      case 'restore_word':return restoreWord(db,Number(request.id));
      case 'learning_activity':return require('./learning-activity.cjs').activity(db,request);
      /* Learning from reading: tokenizes the recorded lines not counted yet (needs the reading runtime), then reports
         word frequency, the weekly review list and JLPT coverage. Without the runtime it reports what is counted. */
      case 'reading_insights':{
        const insights=require('./learning-insights.cjs'),gameId=typeof request.gameId==='string'&&request.gameId?request.gameId:null;
        const learning=runtime&&typeof runtime.learning==='function'?runtime.learning():null,ready=!!learning?.installed?.();
        if(ready&&request.count!==false)await insights.refresh(db,text=>learning.tokenize(text),{deadline:Date.now()+8000});
        const result=insights.report(db,{gameId});
        if(ready)await insights.describe(db,[...result.frequent,...result.weekly],(base,key)=>lookupEntry(learning,base,key),{deadline:Date.now()+5000});
        return {...result,counting:ready,gameId};
      }
      /* 学习 → 语法: N5 points with examples from the lines you read and the zero-latency script you reached. */
      case 'grammar_report':{
        const grammar=require('./grammar.cjs'),learning=runtime&&typeof runtime.learning==='function'?runtime.learning():null,ready=!!learning?.installed?.();
        const result=await grammar.report(db,{root,scriptPairs:require('./original-text.cjs').scriptPairs,tokenize:ready&&request.count!==false?text=>learning.tokenize(text):null,deadline:Date.now()+8000});
        return {...result,counting:ready};
      }
      /* 学习 → 语法 › 怎么接: lines from the games you played that use each connection row (services/grammar-forms.cjs) */
      case 'grammar_form_lines':{
        const learning=runtime&&typeof runtime.learning==='function'?runtime.learning():null,ready=!!learning?.installed?.();
        return require('./grammar-forms.cjs').formLines(db,{root,scriptPairs:require('./original-text.cjs').scriptPairs,tokenize:ready?text=>learning.tokenize(text):null,
          point:request.point||{},rows:Array.isArray(request.rows)?request.rows:[],deadline:Date.now()+8000});
      }
      /* 学习 → 语法: grammar cards from the learner's own Anki decks (read here, never shipped), with lines read that contain them */
      case 'grammar_bluebook':{const B=require('./bluebook.cjs'),r=await B.readAll(root,{anki:new(require('../core/anki.cjs').Anki)(),config:runtime?.config?.()||store.readJSON(path.join(root,'data','config','v4-preferences.json'))});return r.available?{...r,examples:await B.examplesForAsync(r.points,await require('./grammar.cjs').candidatesCached(db,{root,scriptPairs:require('./original-text.cjs').scriptPairs}))}:r;}
      case 'grammar_bluebook_import':{const B=require('./bluebook.cjs'),since=Number(request.since)||0,f=B.newDeck(since);if(!f)return {found:false};
        const prev=Number(request.size)||-1;if(f.size!==prev||Date.now()-f.mtime<1500)return {found:true,ready:false,size:f.size,file:path.basename(f.file)};
        const config=runtime?.config?.()||store.readJSON(path.join(root,'data','config','v4-preferences.json'));
        const r=await B.importDeck(f.file,{anki:new(require('../core/anki.cjs').Anki)(),config,open:file=>{const c=spawn('explorer.exe',[file],{detached:true,stdio:'ignore'});c.on('error',()=>{});c.unref();}});
        return {found:true,ready:true,file:path.basename(f.file),...r};}
      /* 学习 → 奖励: magic points, titles and the collected lines */
      case 'learning_rewards':return require('./learning-rewards.cjs').state(db);
      case 'learning_reward':return require('./learning-rewards.cjs').add(db,{kind:String(request.kind||''),ref:String(request.ref||''),streak:Number(request.streak)||0,line:request.line&&typeof request.line==='object'?request.line:null});
      case 'learning_album':return require('./learning-rewards.cjs').album(db);
      case 'grammar_learned':return require('./grammar.cjs').setLearned(db,String(request.point||''),request.learned!==false);
      case 'grammar_answer':return require('./grammar.cjs').recordAnswer(db,String(request.point||''),request.correct===true);
      /* furigana for example sentences on every study page (core/example-ruby.cjs): game ruby → dictionary, names bare */
      case 'example_ruby':return await require('./example-ruby.cjs').exampleRuby(db,runtime?.learning?.()||null,request.items);
      case 'grammar_anki':{
        const grammar=require('./grammar.cjs'),insights=require('./learning-insights.cjs'),e=request.example||{},text=String(e.text||'').slice(0,1000);if(!text)throw Error('INVALID_READER_TEXT');
        const start=Number(e.start)||0,end=Number(e.end)||0,picked=insights.pickTranslation({human:insights.isHuman(e.translationSource)?{text:e.translation,source:e.translationSource}:null,machine:insights.isHuman(e.translationSource)?'':String(e.translation||'')});
        const extra={translation:picked.translation.slice(0,1000),translationSource:picked.translationSource,gameTitle:String(e.title||'').slice(0,200)};
        try{const learning=runtime?.learning?.();if(learning?.installed?.())extra.sentenceHtml=require('../core/example-ruby.cjs').exampleCardHtml(text,learning.readings.resolve(await learning.tokenize(text)),{pairs:Array.isArray(e.ruby)&&e.ruby.length?e.ruby:require('./example-ruby.cjs').gameRubyOf(db,text),start,end});}catch{}
        if(!extra.sentenceHtml){const chars=[...text],h=v=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));extra.sentenceHtml=h(chars.slice(0,start).join(''))+'<b class="tm-hl">'+h(chars.slice(start,end).join(''))+'</b>'+h(chars.slice(end).join(''));}
        const config=runtime?.config?.()||store.readJSON(path.join(root,'data','config','v4-preferences.json'));
        return await new(require('../core/anki.cjs').Anki)().sync(grammar.ankiWord(String(request.point||''),String(request.title||''),String(request.gist||''),{text},request.level),config,null,extra);
      }
      /* 2026-11-14 读过的词 › JLPT 覆盖: one level's words (optionally one game's), and meanings for the rows on screen */
      case 'jlpt_words':return require('./learning-insights.cjs').jlptWords(db,{level:String(request.level||''),gameId:typeof request.gameId==='string'&&request.gameId?request.gameId:null});
      case 'jlpt_describe':{const learning=runtime&&typeof runtime.learning==='function'?runtime.learning():null;
        return require('./learning-insights.cjs').jlptDescribe(db,request.items,learning?.installed?.()?(base,key)=>lookupEntry(learning,base,key):null);}
      case 'reading_save_word':{
        if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');const insights=require('./learning-insights.cjs'),key=String(request.key||'').slice(0,40),base=String(request.base||key).slice(0,40);if(!key)throw Error('WORD_NOT_FOUND');
        const entry=await lookupEntry(runtime.learning(),base,key);const saved=insights.saveWord(db,entry,insights.exampleLine(db,key,typeof request.gameId==='string'?request.gameId:null),{status:Number.isInteger(request.status)?request.status:null});
        runtime.emit?.('reader-event',{type:'word-status-changed'});return saved;
      }
      case 'statistics':return require('./statistics.cjs').statistics(db,request);
      case 'focus_game':{const game=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(String(request.id));if(!game)throw Error('GAME_NOT_FOUND');return {status:await require('./game-process.cjs').gameProcess(root,game.executable,{focus:true})};}
      case 'owner_test_status':return require('../core/owner-tests.cjs').status(root);
      case 'launch_progress':return launchProgress.get(String(request.id))||{p:0,state:'idle',next:.08};
      case 'launch':return await launch(db,String(request.id),runtime,request.windowsLaunch===true);
      /* E-DRM: the words for a DRM launch failure (which program, which licence check, what to choose instead) */
      case 'launch_hint':{const row=db.prepare('SELECT executable,original FROM games WHERE id=?').get(String(request.id));if(!row?.executable)return {text:''};let lib={};try{lib=JSON.parse(row.original||'{}').library||{};}catch{}
       const drm=require('../core/drm-wrap.cjs');let plan=null;try{plan=drm.plan(row.executable,{allowTranslated:true,source:require('../core/steam-owned.cjs').launchAppid(row.executable,lib)?'steam':lib.source});}catch{}return {text:drm.hint(plan,String(request.locale||'zh'))};}
      case 'migration_status':return store.readJSON(path.join(root,'migration','migration-report.json'));
      default:throw Error('UNKNOWN_ACTION');
    }
  })();}finally{db.close();}
}
if(require.main===module) {
  let input='';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>{input+=chunk;if(input.length>MAX_INPUT){process.stderr.write('Request too large');process.exit(1);}});
  process.stdin.on('end',async()=>{
    try {const data=await dispatch(JSON.parse(input));process.stdout.write(JSON.stringify({ok:true,data}));}
    catch(error) {
      fs.mkdirSync(path.join(root,'logs'),{recursive:true});
      // Only controlled error codes are returned; never log request data.
      const code=/^[A-Z_]+$/.test(error.message)?error.message:'SERVICE_FAILED';
      fs.appendFileSync(path.join(root,'logs','service.log'),new Date().toISOString()+' '+code+'\n');
      process.stdout.write(JSON.stringify({ok:false,error:code}));
    }
  });
}
module.exports={dispatch,deleteWord,restoreWord,launch,cleanUiState,localEntries};
