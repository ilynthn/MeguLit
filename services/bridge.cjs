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
async function launch(db,id,runtime=null,windowsLaunch=false,{retried=false,redirected=false}={}) {
  const game=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(id);
  if(!game)throw Error('GAME_NOT_FOUND');
  /* 2026-11-12 a folder used as another game's Japanese original starts that game (services/import-source.cjs) */
  {let target='';try{const sources=require('./import-source.cjs');sources.backfill(db);target=sources.targetOf(db,db.prepare('SELECT original FROM games WHERE id=?').get(id));}catch{}if(target&&target!==id&&!redirected)return launch(db,target,runtime,windowsLaunch,{redirected:true});}
   const trace=(stage,extra={})=>{try{fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.appendFileSync(path.join(root,'logs','game-launch.log'),JSON.stringify({at:new Date().toISOString(),gameId:id,stage,...extra})+'\n');}catch{}};
  let stage='launch-preflight',featureWatch=null;
  try{
  if(!game.executable||!fs.existsSync(game.executable))throw Error('EXECUTABLE_MISSING');
  let original={};try{original=JSON.parse(game.original||'{}')||{};}catch{}const profile=original.library || {};
  if(require('./game-language.cjs').originalExecutable(db,id,root).blocked)throw Error('JAPANESE_EXECUTABLE_REQUIRED');
  const elevation=require('./locale-launch.cjs').requiresAdministrator(game.executable);
  runtime?.prepareGame(game.executable,{enter:false});
  /* E370: a first launch with nothing saved here starts from a matching shared adaptation record (stream memory before the Hook starts, locale mode for this launch) */
  try{const before=profile.localeMode,shared=require('./shared-adaptation.cjs');shared.importFor(root,{executable:game.executable,engine:profile.engine||'',library:profile,styleSync:runtime?.reader?.gal?.styleSync});if(profile.localeMode!==before){original.library=profile;db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),id);}}catch{}
  /* Japanese restore tables written before 1.2.2 crash Siglus games on start: rewrite them before launching */
  try{const fix=require('../core/japanese-restore.cjs').repairShared(path.dirname(game.executable));if(fix.repaired||fix.skipped)trace('japanese-restore-repaired',fix);}catch(error){trace('japanese-restore-repair-failed',{error:String(error?.message||error).slice(0,200)});}
  /* E333 (user 2026-11-10, 女装山脈): a YU-RIS Chinese patch (update*.ypf) is still in place while the Japanese program is started: the game shows the Chinese text as garbage. Say so instead of launching. */
  {let plan=null;try{plan=require('../core/japanese-restore.cjs')._internal.yurisPlan(path.dirname(game.executable));}catch{}const exeName=path.basename(game.executable);if(plan?.updates?.length&&!/(cn\d|chs|汉化|中文)/i.test(exeName)&&require('../core/launcher-language.cjs').languageHint(exeName)!=='zh')throw Error('CHINESE_PATCH_ACTIVE');}
  /* 2026-11-12 (user: 沙耶の唄 opened a Windows DirectPlay install window that then wanted a restart) the game's own folder
     gets what it loads from DirectPlay, so no Windows window and no restart (core/directplay.cjs) */
  stage='windows-features';
  const gameDir=path.dirname(game.executable);
  {let dp=null;try{dp=require('../core/directplay.cjs').prepare(gameDir,{root,exe:game.executable});if(dp.copied.length||dp.declined.length||dp.missing.length)trace('directplay',dp);}catch(error){trace('directplay-failed',{error:String(error?.message||error).slice(0,160)});}
   try{const configs=require('../core/windows-features.cjs').prepareDotnet(gameDir);if(configs.length)trace('dotnet-runtime-config',{files:configs});}catch(error){trace('dotnet-config-failed',{error:String(error?.message||error).slice(0,160)});}
   if(dp?.missing?.length){neededFeature.set(id,'DirectPlay');throw Object.assign(Error('DIRECTPLAY_REQUIRED'),{detail:dp.missing.join(',')});}}
  stage='process-check';
  const {gameProcesses}=require('./game-process.cjs');
  const ready=()=>require('./game-readiness.cjs').waitForVisibleGame(()=>gameProcesses(root,game.executable));
  // Paths are passed as literal process arguments, never interpolated into a shell.
  /* If MeguLit cannot query processes here, launch anyway: a single-instance game handles a second start itself (v1.1.0). */
  let focused='absent';try{focused=await require('./game-process.cjs').gameProcess(root,game.executable,{focus:true});}catch(error){if(error.message!=='PROCESS_QUERY_FAILED')throw error;trace('process-check-unavailable');}
  if(focused==='focused'||focused==='running') {
    // An earlier instance that never showed (or lost) its window blocks single-instance games: say so (E215.2, user:
    // サノバウィッチ 'would not start' while a hidden copy from a Japanese-locale launch kept running).
    let readyState=null;try{const state=await ready();readyState=state;trace('existing-window-ready',state);}catch(error){trace('existing-window-not-ready',{error:error.message});throw error.message==='GAME_WINDOW_NOT_READY'?Object.assign(Error('GAME_RUNNING_HIDDEN'),{detail:path.basename(game.executable)}):error;}
    db.prepare('UPDATE games SET last_launched_at=? WHERE id=?').run(Math.floor(Date.now()/1000),id);
    runtime?.prepareGame(game.executable);runtime?.bindLaunched?.(readyState?.pid);return {action:focused,connected:false};
  }
  trace('launch-request',{windowsLaunch});
  /* a Windows feature install window the game still opens is closed at once (the game goes on as if it was cancelled);
     DirectPlay is prepared while the game runs, anything else is remembered for this folder */
  featureWatch=require('../core/windows-features.cjs').watch(gameDir,{trace,onFeature:feature=>{if(/^directplay$/i.test(feature)){const dp=require('../core/directplay.cjs').prepare(gameDir,{root,exe:game.executable,all:true});trace('directplay',dp);}}});
  let state;
  // "Japanese system environment": non-Unicode Japanese games (WA2) show their own dialogs garbled under a Chinese locale.
  if(!elevation&&!windowsLaunch&&profile.localeMode==='japanese'&&profile.source!=='steam'&&require('../core/locale-emulator.cjs').x86(game.executable)){
   stage='locale-start';const lib=runtime?.library?.()||new(require('../core/library.cjs').Library)(require('../core/layout.cjs'));
   let result=await lib.locale.launch(game.executable,{trace});
   if(result.needLocaleEmulator){trace('locale-emulator-install',{});await lib.locale.ensure();result=await lib.locale.launch(game.executable,{trace});if(result.needLocaleEmulator)throw Error('LOCALE_EMULATOR_REQUIRED');}
   state={pid:result.gamePid,locale:'japanese'};
  }else if(elevation||windowsLaunch){
   stage='windows-launch';
   await require('./game-process.cjs').shellOpen(root,game.executable);
   stage='window-wait';state=await ready();
  }else{
   stage='process-start';
   const steamApp=profile.source==='steam'&&/^\d+$/.test(String(profile.appid||''));
   /* 2026-11-13 (user: STEINS;GATE from MeguLit first pops Steam's launcher): an app with several Steam launch options
      (game + Launcher.exe config tool) makes steam://rungameid show a chooser, and Steam then ran Launcher.exe. When the
      install folder holds such a companion launcher, the recorded program is started directly with SteamAppId set, so
      steam_api accepts it without a restart through Steam (Steam itself still has to be running). Generic, any engine. */
   /* Live test 2026-11-13: STEINS;GATE's Game.exe refuses a bare start (「ランチャーから起動してください」); its launcher runs
      "Game.exe mages_sgate". So the companion launcher is read for the command line it gives the game; only when one is
      found is the game started directly with those arguments, otherwise the Steam path is kept as before. */
   const companionArgs=steamApp&&!/^(launcher|config)/i.test(path.basename(game.executable))?require('./steam-companion.cjs').launchArgs(game.executable):null;
   const companion=!!companionArgs;
   const steam=steamApp&&!companion;
   const {startProcess,waitForVisibleGame}=require('./game-readiness.cjs');
   const child=await startProcess(steam?'explorer.exe':game.executable,steam?['steam://rungameid/'+profile.appid]:companion?companionArgs:[],path.dirname(game.executable),'GAME_LAUNCH_FAILED',undefined,companion?{...process.env,SteamAppId:String(profile.appid),SteamGameId:String(profile.appid),SteamOverlayGameId:String(profile.appid)}:null);
   trace('launch-process-started',{pid:child.pid,steam,steamDirect:companion||undefined});
   stage='window-wait';
   /* Steam may start another program in the install folder than the one on record (Summer Pockets: the library has
      SummerPocketsRB.exe, Steam runs SiglusEngine_Steam.exe; user 2026-11-09: the game was up and MeguLit said the launch
      failed). For Steam launches a game process from any program in that folder counts. */
   const siblings=steam?(()=>{try{return fs.readdirSync(path.dirname(game.executable)).filter(f=>/\.exe$/i.test(f)&&!/^(unins|setup|install|config|crash|unitycrash|vc_?redist|dxsetup|launcher)/i.test(f)).map(f=>path.join(path.dirname(game.executable),f)).filter(f=>f.toLowerCase()!==game.executable.toLowerCase()&&fs.statSync(f).size>200000).slice(0,8);}catch{return [];}})():[];
   const anyProcess=async()=>{const own=await gameProcesses(root,game.executable);if(own.length||!siblings.length)return own;for(const exe of siblings){const found=await gameProcesses(root,exe).catch(()=>[]);if(found.length){trace('steam-runs-other-program',{exe:path.basename(exe)});return found;}}return own;};
   /* E303: Steam may prepare a first start (cloud sync, install scripts) for longer than 15 s; wait up to 45 s for its window. */
   const startedAt=Date.now();
   try{state=await waitForVisibleGame(anyProcess,{helper:steam,indirect:steam,helperError:'GAME_LAUNCH_FAILED',exit:()=>child.exit,trace,...(steam?{attempts:180,timeout:45000}:{})});}
   catch(error){
    /* E333 (user 2026-11-10, 女装山脈 with 以日文系统环境启动 off): many Japanese x86 games quit at once, without a window,
       under a Chinese system locale. A quit within 3 s is retried once in the Japanese environment (this launch only). */
    const LE=require('../core/locale-emulator.cjs');
    if(error.message!=='GAME_PROCESS_EXITED'||steam||elevation||windowsLaunch||Date.now()-startedAt>3000||!LE.x86(game.executable))throw error;
    const lib=runtime?.library?.()||new(require('../core/library.cjs').Library)(require('../core/layout.cjs'));
    trace('locale-fallback',{});stage='locale-start';const result=await lib.locale.launch(game.executable,{trace});if(result.needLocaleEmulator)throw error;
    state={pid:result.gamePid,locale:'japanese'};
   }
  }
  trace('new-window-ready',state);
  {const watch=featureWatch;featureWatch=null;setTimeout(()=>watch.stop(),30000).unref?.();}
  db.prepare('UPDATE games SET last_launched_at=? WHERE id=?').run(Math.floor(Date.now()/1000),id);
  runtime?.prepareGame(game.executable);runtime?.bindLaunched?.(state?.pid);return {action:'launched',connected:false};
  }catch(error){
   /* a game that quit after asking Windows for a feature: DirectPlay is placed now, so try once more; anything else is
      offered as an install (no restart) */
   if(featureWatch){featureWatch.stop();const asked=featureWatch.found;featureWatch=null;
    if(asked.length&&['GAME_PROCESS_EXITED','GAME_WINDOW_NOT_READY','GAME_LAUNCH_FAILED'].includes(error.message)){
     const feature=asked[0];trace('windows-feature-needed',{feature,retried});
     if(/^directplay$/i.test(feature)&&!retried){const dp=require('../core/directplay.cjs').prepare(path.dirname(game.executable),{root,exe:game.executable,all:true});if(!dp.missing.length)return launch(db,id,runtime,windowsLaunch,{retried:true});}
     neededFeature.set(id,feature);error=Object.assign(Error(/^directplay$/i.test(feature)?'DIRECTPLAY_REQUIRED':'WINDOWS_FEATURE_REQUIRED'),{detail:feature});}}
   /* E299: a boxed release whose protection plug-in wants the original DVD quits on start; say so (disc-check.cjs). */
   if(['GAME_PROCESS_EXITED','GAME_WINDOW_NOT_READY'].includes(error.message)&&game.executable&&require('./disc-check.cjs').discProtected(path.dirname(game.executable)))error=Object.assign(Error('GAME_DISC_REQUIRED'),{detail:error.message});
   trace('launch-failed',{phase:stage,error:error.message,detail:error.detail||error.code});throw error;}
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
function importedExecutable(db,id,file,language){
  if(language==='ja'){require('./game-language.cjs').originalExecutable(db,id,root,'select',file);}
  const row=db.prepare('SELECT original FROM games WHERE id=?').get(id),original=JSON.parse(row?.original||'{}'),lib=original.library||{};
  if(language==='ja')original.library={...lib,localeMode:require('../core/locale-emulator.cjs').x86(file)?'japanese':lib.localeMode||'off'};
  else{original.library={...lib,exe:file,contentLanguage:'zh',originalExecutableVerified:false};db.prepare('UPDATE games SET executable=? WHERE id=?').run(file,id);}
  db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),id);
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
async function dispatch(request,runtime=null) {
  if(request.action==='backup_export')return require('./backup.cjs').exportBackup(root,request.path);
  if(request.action==='backup_preview')return require('./backup.cjs').previewBackup(root,request.path);
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
    /* E563 probe → desensitized upload → adapter packs (services/adapter-actions.cjs) */
    if(String(request.action).startsWith('adapter_'))return await require('./adapter-actions.cjs').handle(db,root,request,runtime);
    switch(request.action) {
      case 'anki_sync':{
        const {AnkiSync}=require('./anki-sync.cjs'),{Anki}=require('../core/anki.cjs');const config=store.readJSON(path.join(root,'data','config','v4-preferences.json'));
        const result=await new AnkiSync({db,anki:new Anki(),config,resolveEntry:async text=>{if(!runtime)return null;const result=await runtime.learning().request('lookup_exact',{text,start:0,end:[...text].length},'zh');return result.entries?.find(e=>e.spellings?.includes(text)||e.readings?.includes(text))||result.entries?.[0];}}).run();runtime?.emit('reader-event',{type:'word-status-changed'});return result;
      }
      case 'set_word_status':{const id=Number(request.id),status=Number(request.status);if(!Number.isSafeInteger(id)||!Number.isInteger(status)||status<0||status>4)throw Error('INVALID_WORD_STATUS');if(!db.prepare('UPDATE vocabulary SET status=? WHERE id=?').run(status,id).changes)throw Error('WORD_NOT_FOUND');runtime?.emit('reader-event',{type:'word-status-changed'});return {id,status};}
      case 'library_scan':case 'library_find_steam':case 'reader_bootstrap':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.call(request);
      case 'reader_status':case 'reader_health':case 'reader_detach':case 'reader_attach':case 'reader_message':case 'reader_invoke':case 'model_status':case 'model_download':case 'model_cancel':case 'pack_status':case 'pack_download':case 'pack_cancel':case 'local_start':case 'local_stop':case 'runtime_download':case 'runtime_cancel':case 'speakers':case 'speakers_cached':case 'speech_preview':case 'sentence_voice':case 'kana_speak':case 'tokenize':case 'translate_preview':
        if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return await runtime.call(request);
      case 'home': try{require('./import-source.cjs').backfill(db);}catch{}return store.home(db,root);
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
      case 'open_source':{const url=new URL(String(request.url));if(url.protocol!=='https:'||!['vndb.org','store.steampowered.com','steamcommunity.com','bgm.tv','2dfan.com','erogamescape.dyndns.org','github.com','plicy.net','megulit.com','platform.deepseek.com','cloud.siliconflow.cn','bailian.console.aliyun.com','aistudio.google.com','apps.ankiweb.net','ankiweb.net'].includes(url.hostname)||url.username||url.password)throw Error('INVALID_SOURCE_URL');const child=spawn('explorer.exe',[url.href],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {opened:true};}
      case 'game_locale_mode':{const row=db.prepare('SELECT original FROM games WHERE id=? AND removed_at IS NULL').get(String(request.id));if(!row)throw Error('GAME_NOT_FOUND');let original={};try{original=JSON.parse(row.original||'{}')||{};}catch{}original.library={...original.library,localeMode:request.japanese===true?'japanese':'off'};db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),String(request.id));return {japanese:request.japanese===true};}
      // Script sources for zero-latency bilingual: a Chinese patch for the Japanese game, or the Japanese original
      // for a patched game. Both are lined up with the installed script; the running reader picks the change up.
      // E280: opening the dialog also looks for a Chinese patch already on this computer (never downloads anything).
      // Read-only: how much of the work is read, {total, read, ratio, source} (services/read-progress.cjs); ids for several at once.
      case 'read_progress':{const rp=require('./read-progress.cjs');if(Array.isArray(request.ids))return {items:request.ids.map(i=>{try{return rp.progress(root,db,i);}catch(e){return {id:String(i),total:null,read:null,ratio:null,source:null,error:String(e.message||e)};}})};return rp.progress(root,db,request.id);}
      case 'text_source_status':{const ot=require('./original-text.cjs'),id=String(request.id);ot.autoPatchLater(root,id,()=>runtime?.reader?.refreshTextSource?.(),{force:!!request.search});
        /* E297 Hxv4 KiriKiri games: the cold run reads the scripts through the game; 重新查找 retries a failed one */
        const cold=require('./kirikiri-cold.cjs'),row=db.prepare('SELECT id,executable FROM games WHERE id=? AND removed_at IS NULL').get(id),coldOn=require('../core/preferences.cjs').cleanPreferences(require('./store.cjs').readJSON?.(path.join(root,'data','config','preferences.json'))||{}).scriptColdRun!==false;
        if(row)cold.consider(root,row,{enabled:coldOn,force:!!request.search});
        /* 2026-11-14 reading and lining up scripts runs in a worker thread so the service keeps answering (text-source-worker.cjs) */
        return {...await require('./text-source-worker.cjs').run(root,'status',[id]),cold:row?cold.status(root,row.executable):null};}
      case 'text_source_import':{const ot=require('./original-text.cjs'),id=String(request.id),dir=String(request.dir||'');
        const off=require('./text-source-worker.cjs');
        if(request.kind==='patch'){const r=await off.run(root,'importPatch',[id,dir]);if(r.patchStatus!=='ready'){runtime?.reader?.refreshTextSource?.();return off.run(root,'status',[id]);}}else if(request.kind==='original')await off.run(root,'importOriginal',[id,dir]);else throw Error('INVALID_TEXT_SOURCE');
        runtime?.reader?.refreshTextSource?.();return off.run(root,'status',[id]);}
      case 'text_source_clear':{const ot=require('./original-text.cjs'),id=String(request.id);if(request.kind==='patch')ot.clearPatch(root,id);else ot.setMode(root,id,'off');runtime?.reader?.refreshTextSource?.();return ot.status(root,db,id);}
      /* 2026-11-12 Chinese-build guide on the game page: checks, then the one-click fixes the existing code can do */
      case 'cn_version_guide':{const g=require('./cn-version-guide.cjs').guide(db,root,String(request.id));return g;}
      case 'cn_guide_fix':{const id=String(request.id),cg=require('./cn-version-guide.cjs'),row=db.prepare('SELECT executable,original FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row?.executable)throw Error('GAME_NOT_FOUND');const dir=require('./patch-swap.cjs').gameDirectory(root,id,row.executable,JSON.parse(row.original||'{}').library?.dir);
        if(request.kind==='swap')return require('./game-language.cjs').select(db,id,'ja',undefined,root);
        if(request.kind==='reveal'){const file=require('node:path').resolve(String(request.path||''));if(!cg.revealable(dir,file))throw Error('CN_GUIDE_PATH');const child=spawn('explorer.exe',['/select,'+file],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};}
        throw Error('CN_GUIDE_FIX');}
      case 'game_original_executable':{const result=require('./game-language.cjs').originalExecutable(db,String(request.id),root,request.mode,request.executable);const row=db.prepare('SELECT original FROM games WHERE id=?').get(String(request.id));return {...result,localeJapanese:JSON.parse(row?.original||'{}').library?.localeMode==='japanese'};}
      // E237 Japanese restore (Tools page): list library games that ship Japanese data, then apply or undo per game.
      case 'jp_restore_list':{const fs=require('node:fs'),path=require('node:path');return db.prepare('SELECT id,title,executable FROM games WHERE removed_at IS NULL ORDER BY title').all().map(g=>{const dir=g.executable?path.dirname(g.executable):'';let hint='';try{if(dir&&(fs.existsSync(path.join(dir,'.megulit-japanese'))||fs.existsSync(path.join(dir,'.megulit-japanese-import'))))hint='applied';else if(dir&&require('../core/japanese-import.cjs').translatedOnly(dir,g.executable))hint='translated';else if(dir&&fs.existsSync(path.join(dir,'dat'))&&fs.readdirSync(path.join(dir,'dat')).some(f=>/\.dbs$/i.test(f)))hint='candidate';else if(dir&&fs.readdirSync(dir).some(n=>/^(scene|gameexe)(jp|ja|en|zh|cn|tw)?\.(pck|dat)$/i.test(n)||/_(jp|ja)\.(xp3|pck|arc|dat)$/i.test(n)))hint='unsupported';}catch{}return dir?{id:g.id,title:g.title,hint:hint||'import',dir:dir.toLowerCase()}:null;}).filter(Boolean).filter((g,i,all)=>all.findIndex(o=>o.dir===g.dir)===i).map(({dir,...g})=>g);}
      case 'jp_restore_steam':case 'jp_restore_detect':case 'jp_restore_apply':case 'jp_restore_undo':case 'jp_import_apply':case 'jp_import_preview':case 'jp_import_cancel':case 'jp_import_reveal':{const id=String(request.id),row=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row?.executable)throw Error('GAME_NOT_FOUND');const dir=require('node:path').dirname(row.executable),jr=require('../core/japanese-restore.cjs'),ji=require('../core/japanese-import.cjs');
       /* E525 Steam store languages (cached by the Chinese-build guide, fetched in the background when missing) */
       const steamApp=require('../core/game-language-switch.cjs')._internal.steamApp(dir),lsOptions={};if(steamApp){try{const net=require('./cn-version-guide.cjs').online(root,{appid:steamApp.appid});if(net.state==='done'&&typeof net.steamJapanese==='boolean')lsOptions.steamJapanese=net.steamJapanese;}catch{}}
       if(request.action==='jp_restore_steam'){if(!steamApp)throw Error('NOT_STEAM');const child=spawn('explorer.exe',['steam://nav/games/details/'+steamApp.appid],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true,appid:steamApp.appid};}
       /* E280 Chinese-only packages: say so, and import the script archives from a Japanese original the user points at */
       const imported=ji.detect(dir,row.executable),jio=require('../core/japanese-import-original.cjs'),generic=jio.readManifest(dir)?.adapter===jio.ADAPTER;
       /* E328 after the game is switched to Japanese, the files moved aside are the translation patch: build the
          zero-latency translation from them at once and report whether it worked */
       const withPatch=async r=>{let patch=false;try{const ot=require('./original-text.cjs'),done=await ot.autoPatch(root,db,id,{force:true,drives:false});patch=!!(done?.found||done?.kept||done?.rebuilt);runtime?.reader?.refreshTextSource?.();}catch{}return {...r,patch};};
       /* E327 import from a Japanese original the user has: folder, program or archive; preview first, then apply */
       if(request.action==='jp_import_preview')return jio.preview(dir,String(request.source||''));
       if(request.action==='jp_import_cancel'){jio.cleanup(dir);return {ok:true};}
       /* E339: show the .iso made from an installer disc in Explorer (selected, not opened) */
       if(request.action==='jp_import_reveal'){const file=require('node:path').resolve(String(request.path||''));if(!/\.iso$/i.test(file)||!fs.existsSync(file))throw Error('IMPORT_SOURCE_MISSING');const child=spawn('explorer.exe',['/select,'+file],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};}
       if(request.action==='jp_import_apply'&&imported?.state!=='importable'){if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');return jio.apply(dir,String(request.source||''),row.executable).then(r=>{try{r.sourceHidden=require('./import-source.cjs').link(db,id,String(request.source||'')).length;}catch{}if(r.separate){importedExecutable(db,id,r.exe,'ja');return r;}if(r.exe&&require('node:path').basename(r.exe).toLowerCase()!==require('node:path').basename(row.executable).toLowerCase())importedExecutable(db,id,r.exe,'ja');return withPatch(r);});}
       if(request.action==='jp_restore_undo'&&generic){if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');const r=jio.restore(dir);if(!r.skipped.length&&r.exe&&r.exe.toLowerCase()!==row.executable.toLowerCase())importedExecutable(db,id,r.exe,'zh');return r;}
       if(request.action==='jp_restore_detect'){const r=jr.detect(dir,lsOptions);if(imported&&(imported.state==='imported'||['none','unsupported'].includes(r.state)))return imported;
        /* 2026-11-14 one shared "does this install have Japanese" (japanese-presence.cjs): a script read as Japanese, or
           Japanese captured while playing, means already Japanese (BRUNS gameplay.exe), not "no Japanese script found" */
        if(['none','unsupported'].includes(r.state)){const v=require('./japanese-presence.cjs').verdict(root,db,id);if(v.japanese===true)return {state:'already',by:v.by,executable:row.executable};}
        return r;}
       if(request.action==='jp_import_apply'){if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');const r=ji.apply(dir,row.executable,request.source);importedExecutable(db,id,r.exe,'ja');try{r.sourceHidden=require('./import-source.cjs').link(db,id,String(request.source||'')).length;}catch{}return withPatch(r);}
       if(request.action==='jp_restore_undo'&&imported?.state==='imported'){if(jr._internal.gameRunning(dir))throw Error('GAME_RUNNING');const r=ji.restore(dir);if(!r.skipped.length)importedExecutable(db,id,r.exe,'zh');return r;}
       return request.action==='jp_restore_apply'?withPatch(jr.apply(dir,lsOptions)):jr.restore(dir,lsOptions);}
      case 'game_cover':return require('./game-cover.cjs').setCover(db,root,String(request.id),request.path);
      /* E362 adaptation overview + one-click diagnostic package (built locally; shown to the user before any upload) */
      case 'adaptation_overview':return require('./adaptation-overview.cjs').overview(db,root);
      case 'diagnostics_build':return require('./diagnostics.cjs').build(root,db,String(request.id),{version:String(request.version||'').slice(0,40)});
      /* 2026-11-12 About > Uninstall MeguLit: the uninstaller window runs on its own (it closes MeguLit itself) */
      case 'uninstall_open':{const script=path.join(root,'setup','uninstall.ps1');if(!fs.existsSync(script))throw Error('UNINSTALLER_MISSING');const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');const child=spawn(ps,['-NoProfile','-ExecutionPolicy','Bypass','-STA','-WindowStyle','Hidden','-File',script,'-Root',root],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {opened:true};}
      case 'diagnostics_reveal':{const file=require('./diagnostics.cjs').ownPackage(root,request.path);const child=spawn('explorer.exe',['/select,'+file],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {ok:true};}
      case 'diagnostics_build_all':return require('./diagnostics.cjs').buildAll(root,db,{version:String(request.version||'').slice(0,40)}); /* E394 whole-app package from About */
      case 'site_updates':return (async()=>{/* E421 start-up notice list, through the service because the WebView CSP blocks megulit.com.
        (user 2026-11-12: the list sometimes took a while to appear) the last copy is kept in data/cache and shown at once;
        a fresh copy is fetched behind it for the next time, and waited for only when there is no copy yet */
        const file=path.join(root,'data','cache','site-updates.json');let cached=null;try{const v=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(v))cached=v;}catch{}
        const fresh=(async()=>{try{/* megulit.com or its EdgeOne copy cn.megulit.com (mainland China), whichever answers first */const one=async u=>{const r=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(10000)});const v=r.ok?await r.json():null;if(!Array.isArray(v))throw new Error('BAD');return v;};const j=await Promise.any(['https://megulit.com/assets/updates.json','https://cn.megulit.com/assets/updates.json'].map(one)).catch(()=>null);if(!Array.isArray(j))return null;const list=j.slice(0,300);try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(list));fs.renameSync(file+'.tmp',file);}catch{}return list;}catch{return null;}})();
        if(cached){fresh.catch(()=>{});return cached;}return (await fresh)||[];})();
      case 'feedback_send':return require('./feedback.cjs').send(root,{kind:String(request.kind||''),text:String(request.text||''),contact:String(request.contact||''),lang:String(request.lang||'zh'),version:String(request.version||'')}); /* E394 in-app feedback through the relay */
      case 'diagnostics_upload':{const file=require('./diagnostics.cjs').ownPackage(root,request.path),m=request.meta||{};return require('./diagnostics-upload.cjs').upload(file,{version:m.version,game:m.game,note:m.note},{root});}
      case 'game_detail':return require('./game-detail.cjs').detail(db,root,String(request.id),request.locale);
      case 'home_lines':return require('./home-lines.cjs').list(db,root,String(request.id),{query:request.query,limit:request.limit});
      case 'home_lines_save':return {chosen:require('./home-lines.cjs').save(root,String(request.id),request.lines)};
      case 'game_synopsis':return await require('./game-detail.cjs').refreshSynopsis(db,root,String(request.id),request.locale);
      case 'unknown_words':return require('./unknown-words.cjs').unknownWords(root);
      case 'preferences':return store.publicPreferences(root);
      /* Settings → 重置所有设置 (services/settings-reset.cjs): back up, reset, then push the defaults to an open reader */
      case 'settings_reset':case 'settings_reset_undo':{const r=require('./settings-reset.cjs'),result=request.action==='settings_reset'?r.reset(root):r.undo(root,String(request.id||''));for(const scope of ['text','panels'])try{runtime?.settingsSaved({scope});}catch{}return result;}
      case 'settings_get':return new(require('./settings.cjs').Settings)(root).get(String(request.profile||''));
      case 'settings_save':{const leaving=request.scope==='online'&&request.values?.leaderboardEnabled===false&&require('./leaderboard.cjs').config(root).enabled;const result=new(require('./settings.cjs').Settings)(root).save({scope:request.scope,values:request.values,profile:String(request.profile||'')});runtime?.settingsSaved(request);if(leaving)await require('./leaderboard.cjs').leave(root).catch(()=>{});return leaving?new(require('./settings.cjs').Settings)(root).get(String(request.profile||'')):result;}
      /* E415 每日 page: Galgame news and hot words from the relay (services/daily.cjs) */
      case 'daily_view':return await require('./daily.cjs').view(root,db,{runtime,force:request.force===true});
      case 'daily_article':return await require('./daily.cjs').article(root,String(request.link||''),{runtime});
      case 'daily_translate':return await require('./daily.cjs').translate(root,runtime,request.texts,String(request.target||'zh'),{withEngine:true});
      case 'daily_anki':return await require('./daily.cjs').anki(root,runtime,request);
      case 'daily_open':{const url=String(request.url||'');if(!require('./daily.cjs').canOpen(url))throw Error('URL_NOT_ALLOWED');const child=spawn('explorer.exe',[new URL(url).href],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {opened:true};}
      /* E377 opt-in leaderboard (services/leaderboard.cjs) */
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
      case 'anki_find':return {path:runtime.ankiProcess().find()};
      /* 2026-11-12 one-click Anki: download the official installer, install it, add AnkiConnect, start and connect */
      case 'anki_install':return require('../core/anki-installer.cjs').start(root,{runtime,find:()=>runtime?runtime.ankiProcess().find():require('../core/anki-process.cjs').find('',process.env)});
      case 'windows_feature_install':{const feature=neededFeature.get(String(request.id||''))||'DirectPlay';const r=await require('../core/windows-features.cjs').install(feature);neededFeature.delete(String(request.id||''));return r;}
      case 'anki_install_status':return require('../core/anki-installer.cjs').status();
      case 'anki_install_connect':return await require('../core/anki-process.cjs').installAnkiConnect(process.env,runtime?{locate:()=>runtime.ankiProcess().find()}:{});
      case 'anki_connect_status':return {installed:require('../core/anki-process.cjs').ankiConnectInstalled()};
      case 'anki_launch':{const runner=runtime.ankiProcess(),hide=!!runtime.config().ankiHidden;if(String(request.reason||'')==='ANKI_PORT_TAKEN')return await runner.repair({hide});return await runner.start({hide});}
      case 'anki_repair':return await runtime.ankiProcess().repair({hide:!!runtime.config().ankiHidden});
      case 'anki_hide':return {hidden:(await runtime.ankiProcess().hide())>0};
      case 'anki_open':return await runtime.ankiProcess().open(String(request.target||''),String(request.deck||''));
      case 'anki_status':case 'anki_current':case 'anki_start':case 'anki_show_answer':case 'anki_grade':case 'anki_play_audio':case 'anki_stop':case 'anki_practice':case 'anki_deck_config':case 'anki_deck_limits':{
        const {AnkiReviewer}=require('./anki-review.cjs');
        const reviewConfig=store.readJSON(path.join(root,'data','config','v4-preferences.json'),store.readJSON(path.join(root,'migration','baseline-20261103','config','v4-preferences.json')));const reviewer=new AnkiReviewer({db,config:reviewConfig,mediaDir:require('../core/anki-media-cache.cjs').dirFor(root),speak:runtime?async text=>{const c=runtime.config?.()||reviewConfig;try{await runtime.services().ensureSpeech(c.aivisUrl,c.aivisGpu);}catch{}return runtime.speech().synthesize({surface:text,reading:'',pitch:[]},c);}:null});
        if(request.action==='anki_status')return await reviewer.status();
        if(request.action==='anki_current')return await reviewer.snapshot();
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
      case 'save_preferences':{const preferences=savePreferences(request);runtime?.emit('reader-event',{type:'appearance',preferences});if(request.values?.language)runtime?.emit('reader-event',{type:'language',language:preferences.language});return preferences;}
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
          const existing=db.prepare('SELECT id,original FROM games WHERE id=?').get(String(request.id));if(!existing)throw Error('GAME_NOT_FOUND');
          const original=JSON.parse(existing.original);if(original.library)original.library.exe=executable;
          // vndb: a VNDB entry chosen by the user ("" goes back to automatic matching); left out, it stays as it is.
          const vndb=request.vndb===undefined?undefined:require('./game-enrichment.cjs').vndbIdFrom(request.vndb),vndbChanged=vndb!==undefined&&vndb!==(original.vndbManual||'');
          if(vndbChanged){if(vndb)original.vndbManual=vndb;else delete original.vndbManual;}
          original.library={...original.library,exe:executable,executableSignature:require('./library.cjs').signature(executable)};
          db.prepare('UPDATE games SET title=?,executable=?,original=? WHERE id=?').run(title,executable,JSON.stringify(original),existing.id);
          require('./series.cjs').autoGroup(db,root);runtime?.metadata().enqueue([existing.id],vndbChanged);return {id:existing.id,vndbChanged};
        }
        const library=require('./library.cjs'),match=library.matchGame(db,{title,exe:executable},{manual:true});
        const id=match?.id||'game-'+crypto.randomUUID(),original=match?JSON.parse(match.original):{};
        original.library={...original.library,source:'manual',steamRejected:false,dir:path.dirname(executable),exe:executable,executableSignature:library.signature(executable)};
        if(match)db.prepare("UPDATE games SET title=?,executable=?,source='manual',removed_at=NULL,original=? WHERE id=?").run(title,executable,JSON.stringify(original),id);
        else db.prepare('INSERT INTO games(id,title,executable,source,original) VALUES (?,?,?,?,?)').run(id,title,executable,'manual',JSON.stringify(original));
        require('./series.cjs').autoGroup(db,root);runtime?.metadata().enqueue([id]);return {id};
      }
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
        const online=request.source==='moji'||request.source==='jisho';/* 2026-11-13 English UI: Jisho (services/jisho-dictionary.cjs) */
        let entries=request.source==='jisho'?await require('./jisho-dictionary.cjs').lookupJisho(query,fetch,{root}):request.source==='moji'?await require('./moji-dictionary.cjs').lookupMoji(query,fetch,{root}):db.prepare('SELECT DISTINCT e.spelling,e.reading,e.definition FROM dictionary_entries e JOIN dictionary_forms f ON e.id=f.entry_id WHERE f.form=? ORDER BY e.frequency LIMIT 20').all(query);
        /* E457 (user, 2026-11-12: 本地查词 found nothing for 爆裂 or 夢): the dictionary_entries table is only filled by a
           developer tool, so it is empty on every install. The local search now asks the same JMdict the lookup card uses. */
        if(!entries.length&&!online&&runtime){try{const r=await runtime.learning().request('lookup_exact',{text:query,start:0,end:[...query].length},'zh');entries=localEntries(r,query);}catch{}}
        if(entries.length&&typeof request.operationId==='string'&&request.operationId.length<100)require('./unknown-words.cjs').recordLookup(root,{surface:query,operationId:request.operationId});
        return entries;
      }
      case 'dictionary_related':{/* 2026-11-13 related words for the dictionary field (services/dict-related.cjs) */const vocab=db.prepare('SELECT spelling,status,definitions FROM vocabulary ORDER BY created_at DESC LIMIT 2000').all();return require('./dict-related.cjs').related({query:String(request.query||'').slice(0,40),reading:String(request.reading||'').slice(0,40),definition:String(request.definition||'').slice(0,400)},{vocab});}
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
      case 'update_apply':return await require('./update.cjs').apply(root,String(request.current||''));
      case 'update_start':{const u=require('./update.cjs');u.start(root,String(request.current||''));return u.status();}
      case 'update_status':return require('./update.cjs').status();
      case 'update_install':return await require('./update.cjs').install(root);
      case 'kana_progress':return require('./kana.cjs').read(root);
      case 'kana_progress_save':return require('./kana.cjs').save(root,request.data);
      case 'learning_goal':return require('./learning-goal.cjs').get(root);
      case 'learning_goal_set':return require('./learning-goal.cjs').set(root,request.goal||{});
      case 'learning_level':return require('./learning-level.cjs').get(root);
      case 'learning_level_set':return require('./learning-level.cjs').set(db,root,{level:String(request.level||''),kana:request.kana});
      case 'kana_game_words':return require('./kana.cjs').gameWords(db,request.words);
      case 'vocabulary':{/* 2026-11-12 each saved word carries its JLPT level (N5–N1) when the open JLPT list has it */const rows=db.prepare('SELECT v.id,v.spelling,v.reading,v.definitions,v.status,v.created_at,e.text AS example_text,e.game_id AS example_game_id,g.title AS example_title FROM vocabulary v LEFT JOIN examples e ON e.id=(SELECT id FROM examples WHERE word_id=v.id ORDER BY id DESC LIMIT 1) LEFT JOIN games g ON g.id=e.game_id ORDER BY v.created_at DESC,v.id DESC LIMIT 1000').all();let jlpt=null;try{jlpt=require('./learning-insights.cjs').loadJlpt();}catch{}return jlpt?rows.map(r=>({...r,jlpt:(jlpt.byForm.get(r.spelling)||jlpt.byForm.get(r.reading)||null)?.level||null})):rows;}
      case 'sentences':return require('./saved-sentences.cjs').list(db,{source:request.source});
      case 'sentence_save':{const r=require('./saved-sentences.cjs').save(db,{gameId:request.gameId,text:request.text,translation:request.translation,source:request.source});/* a new sentence of the game being read: its clean picture when one matches (async) */if(r.created&&r.game_id&&runtime?.reader?.gameId===r.game_id)require('./sentence-scenes.cjs').attach(runtime.reader,r.id);runtime?.emit?.('reader-event',{type:'sentence-saved'});return r;}
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
      case 'grammar_anki':{
        const grammar=require('./grammar.cjs'),insights=require('./learning-insights.cjs'),e=request.example||{},text=String(e.text||'').slice(0,1000);if(!text)throw Error('INVALID_READER_TEXT');
        const start=Number(e.start)||0,end=Number(e.end)||0,picked=insights.pickTranslation({human:insights.isHuman(e.translationSource)?{text:e.translation,source:e.translationSource}:null,machine:insights.isHuman(e.translationSource)?'':String(e.translation||'')});
        const extra={translation:picked.translation.slice(0,1000),translationSource:picked.translationSource,gameTitle:String(e.title||'').slice(0,200)};
        try{const learning=runtime?.learning?.();if(learning?.installed?.())extra.sentenceHtml=require('../core/sentence-html.cjs').furiganaHtml(text,insights.applyGameRuby(learning.readings.resolve(await learning.tokenize(text)),{},Array.isArray(e.ruby)?e.ruby:[]),start,end);}catch{}
        if(!extra.sentenceHtml){const chars=[...text],h=v=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));extra.sentenceHtml=h(chars.slice(0,start).join(''))+'<b class="tm-hl">'+h(chars.slice(start,end).join(''))+'</b>'+h(chars.slice(end).join(''));}
        const config=runtime?.config?.()||store.readJSON(path.join(root,'data','config','v4-preferences.json'));
        return await new(require('../core/anki.cjs').Anki)().sync(grammar.ankiWord(String(request.point||''),String(request.title||''),String(request.gist||''),{text}),config,null,extra);
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
      case 'launch':return await launch(db,String(request.id),runtime,request.windowsLaunch===true);
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
