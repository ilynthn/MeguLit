// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const store=require('./store.cjs');
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
  if(typeof patch.username==='string')next.username=patch.username.slice(0,80);
  if(typeof patch.fontFamily==='string' && !/[<>{};]/.test(patch.fontFamily))next.fontFamily=patch.fontFamily.slice(0,120);
  if(Number.isFinite(patch.backgroundDim))next.backgroundDim=Math.max(0,Math.min(1,patch.backgroundDim));
  if(typeof patch.homeBackground==='boolean')next.homeBackground=patch.homeBackground?'background.jpg':'';
  /* v1.1.0 ships a default background: the first save turns it on once, a later toggle-off is kept */
  if(!next.defaultBackground110){if(typeof patch.homeBackground!=='boolean')next.homeBackground=next.homeBackground||'background.jpg';next.defaultBackground110=true;}
  if(['dark','black','light'].includes(patch.themeMode))next.themeMode=patch.themeMode;
  const file=path.join(root,'data','preferences.json'),temporary=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(next,null,2));fs.renameSync(temporary,file);
  return next;
}
async function launch(db,id,runtime=null,windowsLaunch=false) {
  const game=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(id);
  if(!game)throw Error('GAME_NOT_FOUND');
   const trace=(stage,extra={})=>{try{fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.appendFileSync(path.join(root,'logs','game-launch.log'),JSON.stringify({at:new Date().toISOString(),gameId:id,stage,...extra})+'\n');}catch{}};
  let stage='launch-preflight';
  try{
  if(!game.executable||!fs.existsSync(game.executable))throw Error('EXECUTABLE_MISSING');
  const original=JSON.parse(game.original),profile=original.library || {};
  if(require('./game-language.cjs').originalExecutable(db,id,root).blocked)throw Error('JAPANESE_EXECUTABLE_REQUIRED');
  const elevation=require('./locale-launch.cjs').requiresAdministrator(game.executable);
  runtime?.prepareGame(game.executable,{enter:false});
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
  let state;
  // "Japanese system environment": non-Unicode Japanese games (WA2) show their own dialogs garbled under a Chinese locale.
  if(!elevation&&!windowsLaunch&&profile.localeMode==='japanese'&&profile.source!=='steam'&&require('../core/locale-emulator.cjs').x86(game.executable)){
   stage='locale-start';const lib=runtime?.library?.()||new(require('../core/library.cjs').Library)(require('../core/layout.cjs'));
   const result=await lib.locale.launch(game.executable,{trace});if(result.needLocaleEmulator)throw Error('LOCALE_EMULATOR_REQUIRED');state={pid:result.gamePid,locale:'japanese'};
  }else if(elevation||windowsLaunch){
   stage='windows-launch';
   await require('./game-process.cjs').shellOpen(root,game.executable);
   stage='window-wait';state=await ready();
  }else{
   stage='process-start';
   const steam=profile.source==='steam'&&/^\d+$/.test(String(profile.appid||''));
   const {startProcess,waitForVisibleGame}=require('./game-readiness.cjs');
   const child=await startProcess(steam?'explorer.exe':game.executable,steam?['steam://rungameid/'+profile.appid]:[],path.dirname(game.executable),'GAME_LAUNCH_FAILED');
   trace('launch-process-started',{pid:child.pid,steam});
   stage='window-wait';
   state=await waitForVisibleGame(()=>gameProcesses(root,game.executable),{helper:steam,indirect:steam,helperError:'GAME_LAUNCH_FAILED',exit:()=>child.exit,trace});
  }
  trace('new-window-ready',state);
  db.prepare('UPDATE games SET last_launched_at=? WHERE id=?').run(Math.floor(Date.now()/1000),id);
  runtime?.prepareGame(game.executable);runtime?.bindLaunched?.(state?.pid);return {action:'launched',connected:false};
  }catch(error){trace('launch-failed',{phase:stage,error:error.message,detail:error.detail||error.code});throw error;}
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
async function dispatch(request,runtime=null) {
  if(request.action==='backup_export')return require('./backup.cjs').exportBackup(root,request.path);
  if(request.action==='backup_preview')return require('./backup.cjs').previewBackup(root,request.path);
  if(request.action==='backup_apply'){runtime?.reader?.stop();if(runtime){runtime.reader=null;runtime.libraryManager=null;}return require('./backup.cjs').applyBackup(root,request.id);}
  if(request.action==='history_translate'){if(!runtime)throw Error('RUNTIME_REQUIRED');return runtime.history().ensure(Number(request.id));}
  const db=store.openStore(root);
  try {
    if(String(request.action).startsWith('series_'))return require('./series.cjs').handle(db,root,request);
    switch(request.action) {
      case 'anki_sync':{
        const {AnkiSync}=require('./anki-sync.cjs'),{Anki}=require('../core/anki.cjs');const config=store.readJSON(path.join(root,'data','config','v4-preferences.json'));
        const result=await new AnkiSync({db,anki:new Anki(),config,resolveEntry:async text=>{if(!runtime)return null;const result=await runtime.learning().request('lookup_exact',{text,start:0,end:[...text].length},'zh');return result.entries?.find(e=>e.spellings?.includes(text)||e.readings?.includes(text))||result.entries?.[0];}}).run();runtime?.emit('reader-event',{type:'word-status-changed'});return result;
      }
      case 'set_word_status':{const id=Number(request.id),status=Number(request.status);if(!Number.isSafeInteger(id)||!Number.isInteger(status)||status<0||status>4)throw Error('INVALID_WORD_STATUS');if(!db.prepare('UPDATE vocabulary SET status=? WHERE id=?').run(status,id).changes)throw Error('WORD_NOT_FOUND');runtime?.emit('reader-event',{type:'word-status-changed'});return {id,status};}
      case 'library_scan':case 'library_find_steam':case 'reader_bootstrap':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.call(request);
      case 'reader_status':case 'reader_health':case 'reader_detach':case 'reader_attach':case 'reader_message':case 'reader_invoke':case 'model_status':case 'model_download':case 'model_cancel':case 'pack_status':case 'pack_download':case 'pack_cancel':case 'local_start':case 'local_stop':case 'runtime_download':case 'runtime_cancel':case 'speakers':case 'speakers_cached':case 'speech_preview':case 'kana_speak':case 'tokenize':case 'translate_preview':
        if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return await runtime.call(request);
      case 'home': return store.home(db,root);
      case 'game_enrich':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.metadata().ensure(String(request.id),request.locale,request.refresh===true);
      case 'game_reviews_summary':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.reviews().summary(String(request.id));
      case 'game_reviews':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.reviews().page(String(request.id),String(request.platform),request.page,request.size);
      case 'reviews_translate':if(!runtime)throw Error('PERSISTENT_RUNTIME_REQUIRED');return runtime.reviews().translate(request.texts,String(request.target),String(request.source||'auto'));
      case 'open_source':{const url=new URL(String(request.url));if(url.protocol!=='https:'||!['vndb.org','store.steampowered.com','steamcommunity.com','bgm.tv','2dfan.com','erogamescape.dyndns.org','github.com','plicy.net'].includes(url.hostname)||url.username||url.password)throw Error('INVALID_SOURCE_URL');const child=spawn('explorer.exe',[url.href],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return {opened:true};}
      case 'game_locale_mode':{const row=db.prepare('SELECT original FROM games WHERE id=? AND removed_at IS NULL').get(String(request.id));if(!row)throw Error('GAME_NOT_FOUND');const original=JSON.parse(row.original||'{}');original.library={...original.library,localeMode:request.japanese===true?'japanese':'off'};db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),String(request.id));return {japanese:request.japanese===true};}
      case 'game_original_executable':{const result=require('./game-language.cjs').originalExecutable(db,String(request.id),root,request.mode,request.executable);const row=db.prepare('SELECT original FROM games WHERE id=?').get(String(request.id));return {...result,localeJapanese:JSON.parse(row?.original||'{}').library?.localeMode==='japanese'};}
      // E237 Japanese restore (Tools page): list library games that ship Japanese data, then apply or undo per game.
      case 'jp_restore_list':{const fs=require('node:fs'),path=require('node:path');return db.prepare('SELECT id,title,executable FROM games WHERE removed_at IS NULL ORDER BY title').all().map(g=>{const dir=g.executable?path.dirname(g.executable):'';let hint='';try{if(dir&&fs.existsSync(path.join(dir,'.megulit-japanese')))hint='applied';else if(dir&&fs.existsSync(path.join(dir,'dat'))&&fs.readdirSync(path.join(dir,'dat')).some(f=>/\.dbs$/i.test(f)))hint='candidate';else if(dir&&fs.readdirSync(dir).some(n=>/^(scene|gameexe)(jp|ja|en|zh|cn|tw)?\.(pck|dat)$/i.test(n)||/_(jp|ja)\.(xp3|pck|arc|dat)$/i.test(n)))hint='unsupported';}catch{}return hint?{id:g.id,title:g.title,hint,dir:dir.toLowerCase()}:null;}).filter(Boolean).filter((g,i,all)=>all.findIndex(o=>o.dir===g.dir)===i).map(({dir,...g})=>g);}
      case 'jp_restore_detect':case 'jp_restore_apply':case 'jp_restore_undo':{const row=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(String(request.id));if(!row?.executable)throw Error('GAME_NOT_FOUND');const dir=require('node:path').dirname(row.executable),jr=require('../core/japanese-restore.cjs');return request.action==='jp_restore_detect'?jr.detect(dir):request.action==='jp_restore_apply'?jr.apply(dir):jr.restore(dir);}
      case 'game_cover':return require('./game-cover.cjs').setCover(db,root,String(request.id),request.path);
      case 'game_detail':return require('./game-detail.cjs').detail(db,root,String(request.id),request.locale);
      case 'game_synopsis':return await require('./game-detail.cjs').refreshSynopsis(db,root,String(request.id),request.locale);
      case 'unknown_words':return require('./unknown-words.cjs').unknownWords(root);
      case 'preferences':return store.publicPreferences(root);
      case 'settings_get':return new(require('./settings.cjs').Settings)(root).get(String(request.profile||''));
      case 'settings_save':{const result=new(require('./settings.cjs').Settings)(root).save({scope:request.scope,values:request.values,profile:String(request.profile||'')});runtime?.settingsSaved(request);return result;}
      case 'save_key':return new(require('./settings.cjs').Settings)(root).saveKey({provider:request.provider,baseUrl:request.baseUrl,apiKey:request.apiKey});
      case 'anki_find':return {path:runtime.ankiProcess().find()};
      case 'anki_install_connect':return await require('../core/anki-process.cjs').installAnkiConnect();
      case 'anki_connect_status':return {installed:require('../core/anki-process.cjs').ankiConnectInstalled()};
      case 'anki_launch':{const runner=runtime.ankiProcess();return await runner.start({hide:!!runtime.config().ankiHidden});}
      case 'anki_hide':return {hidden:(await runtime.ankiProcess().hide())>0};
      case 'anki_open':return await runtime.ankiProcess().open(String(request.target||''),String(request.deck||''));
      case 'anki_status':case 'anki_current':case 'anki_start':case 'anki_show_answer':case 'anki_grade':case 'anki_play_audio':case 'anki_stop':case 'anki_practice':case 'anki_deck_config':case 'anki_deck_limits':{
        const {AnkiReviewer}=require('./anki-review.cjs');
        const reviewer=new AnkiReviewer({db,config:store.readJSON(path.join(root,'data','config','v4-preferences.json'),store.readJSON(path.join(root,'migration','baseline-20261103','config','v4-preferences.json')))});
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
          }catch(error){db.exec('ROLLBACK');throw error;}
        }else db.prepare('UPDATE games SET removed_at=? WHERE id=?').run(Math.floor(Date.now()/1000),game.id);
        return {removed:game.id};
      }
      case 'dictionary':{
        const query=String(request.query||'').trim().slice(0,100);
        if(!query)return [];
        const entries=request.source==='moji'?await require('./moji-dictionary.cjs').lookupMoji(query,fetch,{root}):db.prepare('SELECT DISTINCT e.spelling,e.reading,e.definition FROM dictionary_entries e JOIN dictionary_forms f ON e.id=f.entry_id WHERE f.form=? ORDER BY e.frequency LIMIT 20').all(query);
        if(entries.length&&typeof request.operationId==='string'&&request.operationId.length<100)require('./unknown-words.cjs').recordLookup(root,{surface:query,operationId:request.operationId});
        return entries;
      }
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
      case 'kana_game_words':return require('./kana.cjs').gameWords(db,request.words);
      case 'vocabulary':return db.prepare('SELECT id,spelling,reading,definitions,status,created_at FROM vocabulary ORDER BY created_at DESC,id DESC LIMIT 1000').all();
      case 'sentences':return db.prepare('SELECT s.id,s.game_id,s.text,s.translation,s.created_at,g.title FROM saved_sentences s LEFT JOIN games g ON s.game_id=g.id ORDER BY s.created_at DESC LIMIT 1000').all();
      case 'word_trash':return db.prepare('SELECT id,word_id,deleted_at,snapshot FROM word_trash ORDER BY deleted_at DESC,id DESC LIMIT 30').all().map(row=>{const s=JSON.parse(row.snapshot);return {id:row.id,deleted_at:row.deleted_at,spelling:s.word?.spelling || s.spelling || '',reading:s.word?.reading || s.reading || ''};});
      case 'delete_word':return deleteWord(db,Number(request.id));
      case 'restore_word':return restoreWord(db,Number(request.id));
      case 'learning_activity':return require('./learning-activity.cjs').activity(db,request);
      case 'statistics':return require('./statistics.cjs').statistics(db,request);
      case 'focus_game':{const game=db.prepare('SELECT executable FROM games WHERE id=? AND removed_at IS NULL').get(String(request.id));if(!game)throw Error('GAME_NOT_FOUND');return {status:await require('./game-process.cjs').gameProcess(root,game.executable,{focus:true})};}
      case 'launch':return await launch(db,String(request.id),runtime,request.windowsLaunch===true);
      case 'migration_status':return store.readJSON(path.join(root,'migration','migration-report.json'));
      default:throw Error('UNKNOWN_ACTION');
    }
  }finally{db.close();}
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
module.exports={dispatch,deleteWord,restoreWord,launch,cleanUiState};
