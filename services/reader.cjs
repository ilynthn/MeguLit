// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
const logSink=require('../core/log-sink.cjs');
const {readJSON,openStore}=require('./store.cjs');
const {cleanPreferences}=require('../core/preferences.cjs');
const {Settings}=require('./settings.cjs');
/* A line with no kana that uses Chinese-only words or simplified forms is another language slot, not the Japanese. */
const notJapanese=t=>!/[぀-ヿ]/.test(t)&&/[吗吧呢嘛们这哪说还给让从对时过为个么吃]/.test(t);
const {normalizeTranslation}=require('../core/translation-format.cjs');
const {artJunk,artNoTranslation,artList}=require('../core/art-filter.cjs');
const atomic=(file,value)=>{const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);};
class Reader{
 constructor(runtime){this.runtime=runtime;this.root=runtime.root;this.folder=runtime.folder;this.latest=0;this.pageScope='';this.lookup=0;this.gameId=null;this.stats=new(require('./reading-statistics.cjs').ReadingStatistics)(this.root);}
 active(){return !this.closed&&!(this.runtime.libraryOnly?this.runtime.libraryOnly():this.root?require('../core/library-mode.cjs').libraryOnly(this.root):false);}
 emit(event,data){if(this.active())this.runtime.emit(event,data);}
 prefs(){return cleanPreferences(readJSON(path.join(this.folder,'preferences.json')));}
 clearGameVisuals(){
  this.retryQueue?.clear();this.strictMtCache?.clear();this.embedCache?.clear();this.embedOrigins?.clear();this.gal?.hooks?.trackPairs?.clear();this.sentenceMarks=null;
  this.visualGeneration=(this.visualGeneration||0)+1;this.latest=(Number(this.latest)||0)+1;this.lookup=(Number(this.lookup)||0)+1;this.pageScope='';this.pagePriorities?.clear();
  this.artTurns?.clear();this.artTurns=new Map();this.drawUi?.items?.clear();this.drawUi?.groups?.clear();this.drawUi=null;this.gameUiPreview=null;
  this.emit('reader-event',{type:'artText',clear:true});this.emit('reader-event',{hookSource:null,hookChoices:null,receivedText:false});
 }
 uiLanguage(){try{return require('./store.cjs').publicPreferences(this.root)?.language||'zh';}catch{return 'zh';}}
 event(message){if(!this.active())return;
  const visualBirth=String(message.gameStarted||this.gal?.state?.gameStarted||'');
  if(message.type==='gameClosed'||message.bound===false){if(this.visualIdentity||this.artTurns?.size||this.drawUi||message.type==='gameClosed')Reader.prototype.clearGameVisuals.call(this);this.visualIdentity='';}
  else if(message.gameProcessId){const identity=String(message.gameProcessId)+'|'+visualBirth;if(identity!==this.visualIdentity){Reader.prototype.clearGameVisuals.call(this);this.visualIdentity=identity;}}
  /* Alt+M binds the window in front (services/bind-hotkey.cjs); it no longer opens or closes the home window */
  if(message.type==='bindHotkey'){require('./bind-hotkey.cjs').request(this,message,e=>this.emit('reader-event',e),this.uiLanguage());return;}
  if(this.hotkeyBind&&(message.type==='bound'||message.type==='error'))require('./bind-hotkey.cjs').follow(this,message,e=>this.emit('reader-event',e),this.uiLanguage());
  if(message.type==='ready'||Array.isArray(message.windows))require('./bind-hotkey.cjs').startupScan(this,message,e=>this.emit('reader-event',e),this.uiLanguage(),()=>{const db=openStore(this.root);try{return db.prepare("SELECT id,title,executable FROM games WHERE removed_at IS NULL AND executable<>''").all();}finally{db.close();}});
  /* the hook's own inferences (left the dialogue screen) obey the same freeze as the screen probes */if(this.gal?.hooks&&!this.gal.hooks.contextFrozen)this.gal.hooks.contextFrozen=()=>this.immersion?.frozen?.()===true;
  if(message.type==='layerState'||message.type==='layerRaise'){this.logVisibility(message);return;}
  if(message.type==='sentenceHideObservation'){const row=this.sentenceMarks?.rows.get(message.episode);if(row)row.original=message.original;return;}
  if(message.type==='readerContext'){this.immersion?.context(message.active);this.logVisibility({type:'readerContext',active:message.active});return;}
  if(message.type==='readerPointer'){this.emit('reader-pointer-input',message);return;}
  if(message.type==='hookEmbedRequest'){this.embedTranslate(message.id,message.text);return;}
  /* engine-draw (docs/engine-draw-protocol.md): UI items drawn by the engine get the art-text treatment (copy + translation beside, clicks reach the game); a dialogue line asks for its in-game replacement */
  if(message.type==='hookDrawUi'){const t=this.drawUi||(this.drawUi=new (require('../core/engine-draw.cjs').UiTracker)()),generation=this.visualGeneration||0;for(const m of t.feed(message,gone=>{if(this.closed||generation!==(this.visualGeneration||0)||this.drawUi!==t)return;for(const g of gone)this.artText(g);}))this.artText(m);return;}
  if(message.type==='hookDrawEmbed'){this.drawEmbed(message);return;}
  if(message.type==='artText'){this.artText(message);return;}
  /* A Chinese-patched game read in Japanese: the patch's line is the translation, cached before the page asks. */
  if(message.type==='hookPatchTranslation'){if(this.zeroLatencyEnabled?.(this.targetLanguage?.())&&(message.machine||message.filled||message.japanese===message.chinese))return;if(typeof message.japanese==='string'&&typeof message.chinese==='string'&&message.chinese.length<=4000){
   if(!message.machine&&!message.filled&&message.chinese.trim())this.logVisibility({type:'patchLine'});this.embedCached(message.japanese,message.chinese.trim(),{language:'',source:message.filled?'filled':message.machine?'machine':this.gal?.hooks?.originalText?.kind==='original'?'official':'patch'});/* 2026-11-21 (owner, 千恋＊万花 中文版, r26 21:40:06 / 21:40:10: the patch translation stored, the reader never asked for it): a stored patch line is offered to the line on screen at once; the reader fills it when that line shows no translation of its own */try{if(message.chinese.trim())this.emit('reader-event',{type:'call',method:'deliverBackfill',args:[message.japanese,message.chinese.trim(),message.filled?'filled':message.machine===true?'machine':this.gal?.hooks?.originalText?.kind==='original'?'official':'patch',{target:'zh'}]});}catch{}/* learning: remember which lines carry a human translation (group patch / official Chinese) */if(!message.machine&&!message.filled){const source=this.gal?.hooks?.originalText?.kind==='original'?'official':'group';this.humanLine(message.japanese,{text:message.chinese.trim(),source});if(this.gameId)this.stats.translation(this.gameId,message.japanese,message.chinese.trim(),source);}}return;}
  if(message.type==='hostFrame'){
   if(message.dismissLookup===true)this.emit('reader-event',{type:'call',method:'closeLocalSelection',args:[]});
   try{logSink.append(path.join(this.root,'logs','reader-host.log'),JSON.stringify({at:new Date().toISOString(),...message})+'\n');}catch{}
   return;
  }
  const config=this.runtime.config();
  const reportedBirth=String(message.gameStarted||this.gal?.state?.gameStarted||'');
  if(message.gameProcessId&&(message.gameProcessId!==this.gamePid||reportedBirth&&reportedBirth!==this.gameBirth)){this.gamePid=message.gameProcessId;this.gameBirth=reportedBirth;require('./background-games.cjs').foreground().then(()=>require('./background-games.cjs').unmute(this.root,message.gameProcessId)).catch(()=>{});/* card wall: the save-CG worker yields to the open game */try{require('./card-wall.cjs').noteGame(this.root,this.gamePid);}catch{}this.gameId=null;this.runtime.localLearning?.useNames(null);this.runtime.localLearning?.useGameReadings?.(null);this.pendingLines=[];this.translation?.clearContext();this.setWorkPrompt('');this.stats.reset();const pid=this.gamePid,birth=this.gameBirth;
   require('../core/game-fonts.cjs').exePath(pid).then(exe=>{if(!this.active()||this.gamePid!==pid||this.gameBirth!==birth||this.gal?.state?.gameStarted&&String(this.gal.state.gameStarted)!==birth)return;exe=require('./launch-path.cjs').canonical(exe,{root:this.root,pid,birth});exe=require('../core/owner-tests.cjs').sourceFor(this.root,exe,{pid,birth})||exe;this.gameExe=exe;try{if(require('./text-effects.cjs').has(this.root,exe)&&this.gal&&!this.gal.textEffectsHold&&!this.seedKeepsHide(exe,'remembered')){this.logVisibility({type:'readModeHint',reason:'text-effects',remembered:true});this.gal.textEffects(true);}}catch{}this.adoptTextSource(exe,pid);this.translation?.clearContext();const db=openStore(this.root);try{const game=require('./library.cjs').activeGameForProgram(db,exe);this.gameId=game?.id||null;this.bindNames(game);this.applyGameProfile(exe,game);this.findTextSource(this.gameId);this.sharedImport(game);/* E596 opt-in runtime harvest (does nothing unless allowed and needed) */if(game?.id)try{require('./runtime-harvest.cjs').onGameBound(this.root,{gameId:game.id,executable:exe,pid},{emit:(e,d)=>this.emit(e,d)});}catch{}this.setWorkPrompt(game?.id|| (exe?'exe-'+require('node:crypto').createHash('sha256').update(exe.toLowerCase()).digest('hex'):''));for(const line of this.pendingLines||[])this.stats.line({...line,gameId:this.gameId});this.pendingLines=null;this.emit('reader-event',{type:'activeGame',legacyId:game?.legacy_id??null});}finally{db.close();}}).catch(()=>{});this.confirmGameFont('bind').catch(()=>{});
  }
  if(message.bound===false&&this.gal?.process&&this.gal.process.exitCode!==null&&!this.gal.stopped){this.runtime.readerReady=false;this.runtime.readerError='READER_NATIVE_EXITED';this.emit('reader-health',{ready:false,error:'READER_NATIVE_EXITED'});}
  if(message.type==='hookTextEffects'){/* 2026-11-21 core counted the lines the game's text effect broke (hook-native textEffectsJudge): read mode for this exe, remembered, as galTextEffects */const g=this.gal;if(this.gameExe&&g&&!g.textEffectsHold&&!this.seedKeepsHide(this.gameExe,'core',message)){require('./text-effects.cjs').set(this.root,this.gameExe,{paired:Number(message.paired)||0,orphan:Number(message.orphan)||0,by:'core'});this.logVisibility({type:'readModeHint',reason:'text-effects',by:'core',paired:Number(message.paired)||0,orphan:Number(message.orphan)||0});g.textEffects(true);}return;}
  if(message.type==='gameClosed'){try{require('../core/owner-tests.cjs').revokeFor(this.root,this.gameExe);}catch{}/* Cardinal: the session's last lines replayed in a hidden reader and scored, in the background (services/cardinal.cjs) */try{require('./cardinal.cjs').kick(this,'session-end');}catch{}try{require('./self-check-live.cjs').stop();}catch{}try{this.gal?.setGameProfile?.(require('../core/profiles/index.cjs').profileFor({}));}catch{}try{this.gal?.textEffects?.(false);}catch{}try{require('./card-wall.cjs').noteGame(this.root,null);}catch{}try{require('./runtime-harvest.cjs').onGameClosed(this.root);}catch{}
   /* E598 a game switched to Japanese automatically that never showed text is put back (core/japanese-auto.cjs) */
   if(this.gameId)try{require('../core/japanese-auto.cjs').gameClosed(this.root,this.gameId,{options:require('./japanese-restore-options.cjs').forExecutable(this.gameExe)});}catch(error){try{logSink.append(path.join(this.root,'logs','japanese-auto.log'),new Date().toISOString()+' '+String(error?.message||error).slice(0,160)+'\n');}catch{}}
   this.jpAutoSeen=null;this.gameId=null;this.runtime.localLearning?.useNames(null);this.runtime.localLearning?.useGameReadings?.(null);this.gamePid=null;this.gameBirth=null;this.pendingLines=null;this.setWorkPrompt('');this.stats.reset();}
  this.runtime.services().gameEvent(message,config).catch(()=>{});
  if(message.type==='dialogEvidence'&&config.dialogDetection==='visual')this.immersion.evidence(message.visible,'visual');
  // The embedded replacement was seen working in this game: remember it as verified (shown as "embedding verified").
  /* E359 (user 2026-11-10: 女装山脈 showed 内嵌已适配 though it could only be read): what this PC actually saw is kept on the
     game. A run whose streams carry text but none can be embedded marks it "readonly" (a later verified embed wins).
     2026-11-19: the verdict carries the build that saw it (hookReadonlyBuild); one from another build is redone (services/hook-verdict.cjs). */
  if(message.hookEmbedUnsupported===true&&this.gameExe&&this.readonlyExe!==this.gameExe){this.readonlyExe=this.gameExe;try{const db=openStore(this.root);try{const game=require('./library.cjs').activeGameForProgram(db,this.gameExe);if(game){const original=JSON.parse(game.original||'{}');const verdict=require('./hook-verdict.cjs'),build=verdict.appVersion(this.root);if(verdict.mayMarkReadonly(original.library,build)){original.library={...original.library,hook:'readonly',hookReadonlyAt:Date.now(),hookReadonlyBuild:build};db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),game.id);this.emit('library-updated',{id:game.id});}}}finally{db.close();}}catch{}}
  const trial=require('./torch-local-trial.cjs');
  if(Array.isArray(message.hookThreads))trial.feedback(this,{type:'streamChanged'});
  if(message.type==='hookCheck')trial.feedback(this,message);
  if(message.gameStyleReveal===true||message.gameStylePreview===true||message.type==='hookGameUi'&&message.kind!=='dialogue'||message.type==='dialogScene'&&message.visible===false||message.type==='cover'||message.bound===false||message.hookRecovering||message.hookSourceOrigin==='history'||message.hookSourceOrigin==='ocr')trial.invalidate(this);
  if(message.type==='hookCheck'&&message.hookCheckState==='verified'&&this.gameExe&&this.verifiedExe!==this.gameExe){this.verifiedExe=this.gameExe;try{this.runtime.library().verify(this.gameExe);const db=openStore(this.root);try{const game=require('./library.cjs').activeGameForProgram(db,this.gameExe);if(game){const original=JSON.parse(game.original||'{}');if(original.library?.hook!=='verified'){original.library={...original.library,hook:'verified',hookVerifiedAt:Date.now(),hookVerifiedStream:String(this.gal?.hooks?.state?.hookThreads?.find?.(t=>t.selected)?.name||'')};db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),game.id);this.emit('library-updated',{id:game.id});}}}finally{db.close();}}catch{}this.shareAdaptation();}
  if(message.type==='gameStyleStatus'&&message.gameStyleState==='saved')this.shareAdaptation();
  /* 2026-11-19 (user: 校准的时候也要自动去换): a calibration confirms the game font again (a hand-picked font stays) */
  if((message.type==='dialogCalibration'&&message.success===true)||(message.type==='gameStyleStatus'&&['measured','saved'].includes(message.gameStyleState)))this.confirmGameFont('calibration').catch(()=>{});
  if(message.type==='hookGameUi'){
   const kind=message.kind;
   if(['choice','settings'].includes(kind)){
    this.immersion.scene(false,'game-ui '+kind);
    this.gal?.send({type:'gameUi',items:require('../core/game-ui.cjs').uiItems(message.items,kind,this.gal?.preferences)});
   }else if(['dialogue','transition','clear'].includes(kind)){
    this.gal?.send({type:'gameUi',items:[]});this.immersion.scene(kind==='dialogue');
   }
  }
  /* E322: every whole-layer hide or show is logged with its cause (user: the layer faded out by itself in several games). */if(message.type==='dialogScene'||message.type==='dialogSceneKept')this.logVisibility({type:message.type,visible:message.visible,reason:message.reason});if(message.type==='dialogScene'){/* E578: the game hid or showed its text window (box band only): followed with immersion off too */if(message.box===true)this.immersion.window(message.visible,'window '+(message.reason||''));else this.immersion.scene(message.visible,'scene '+(message.reason||''));}
  if(message.type==='dialogAuto')this.immersion.autoBox(message.visible);
  if(message.type==='readerInput'){if(message.complete===true){this.immersion.input?.();this.gal?.hooks?.advance?.();}this.immersion.skip(message.skipHeld);if(typeof message.skipHeld==='boolean')this.gal?.hooks?.skipHeld?.(message.skipHeld);}
  if(message.type==='hookDialog')this.immersion.engine(message.visible,message.engine);
  /* 2026-11-12 (user: "自动校准的同时直接替换成游戏原生字体"): the engine names the face it draws the text with (KiriKiri
     MessageLayer.font.face). Our Japanese text takes it: the game's own font file when the folder scan found that family,
     else the installed face by name. A font the user picked by hand is kept. */
  /* 2026-11-13 card wall: an engine hook reports a picture on the game's screen (card-wall.cjs 'seen') */
  if(message.type==='imageShown'&&typeof message.name==='string'&&this.gameExe)try{require('./card-wall.cjs').noteSeen(this.root,this.gameExe,message.name);}catch{}
  if(message.type==='hookFont')this.engineFont(message);
  if(message.type==='hookFontFile')this.engineFontFile(message);
  if(message.type==='markerPresence')this.immersion.marker(message.present===true);
  if(message.hookSequence!==undefined)require('./self-check-live.cjs').seedBoundary(this,message);
  if(message.type==='waitMarkerDrawn'){this.immersion.markerDrawn();this.gal?.send({type:'markerHookDrawn'});}
  /* 2026-11-16 why the bridge hid or moved the reading layer (menu / cover / dialogue / foreground), once per change: a report of MeguLit's text vanishing is matched against it */if(message.type==='coverDebug'&&typeof message.text==='string'&&message.text!==this.lastCoverDebug){/* every change is kept: the 250 ms limit dropped the hide that followed a z-order move right after the menu closed */this.lastCoverDebug=message.text;this.lastCoverDebugAt=Date.now();this.logVisibility({type:'coverDebug',text:message.text.slice(0,240)});}
  /* Issue 127: Alt+H and its hotkey registration reach the log, so a report shows whether the cover was really switched */if(message.type==='ready')this.logVisibility({type:'readerHotkeys',menu:message.hotkey,cover:message.coverHotkey,mode:message.modeHotkey});if(message.type==='cover'&&typeof message.coverEnabled==='boolean')this.logVisibility({type:'cover',enabled:message.coverEnabled});
  if(message.type==='ready'){this.gal?.send({type:'dialogConfig',scene:config.immersion===true,auto:config.immersion===true,active:config.immersion&&config.dialogDetection==='visual',marker:config.immersion&&config.dialogDetection==='marker'});this.gal?.setGameAudio(config.ankiGameMedia!==false);}
  if(message.type==='gameClosed'||message.bound===false)this.immersion.bind('');else if(message.gameHwnd)this.immersion.bind(message.gameHwnd+'|'+message.gameProcessId+'|'+message.gameStarted);
  /* 2026-11-13 (ATRI: the choice overlay was drawn in a reader window hidden as "scene changed"): while choices are on screen the reader stays shown */if(Object.prototype.hasOwnProperty.call(message,'hookChoices'))this.immersion.choices(!!message.hookChoices);
  if(typeof message.hookSource==='string'&&message.hookSource.trim()&&message.hookActive===true&&message.processAttached===true&&!message.hookRecovering&&!message.recovering&&!['history','ocr'].includes(message.hookSourceOrigin)&&!['history','ocr'].includes(message.origin))try{require('./seed-usage.cjs').note(this);}catch{}
  if(typeof message.hookSource==='string'&&message.hookSource&&!message.hookRecovering&&message.hookSourceOrigin!=='history')try{const target=this.cardinalTarget(),cardinalPair=require('../core/cardinal/tape.cjs').liveSource(message.hookSource,{target,sequence:message.hookSequence});if(!this.zeroLatencyEnabled(target))this.embedCached(message.hookSource);message={...message,cardinalPair};
   if(cardinalPair&&this.gameId){
    const live=require('./self-check-live.cjs').current(),s=live?.reader===this&&live.exe===this.gameExe&&live.pid===this.gamePid&&live.birth===this.gameBirth?live:null;
    const seed=require('./cardinal.cjs').sourceOf(s,this.gal?.profile);
    const markEpisode=(this.sentenceMarks??=new(require('./sentence-marks.cjs').Session)()).observe(this.gameId,cardinalPair.episode,{...message,scriptCursor:this.gal?.hooks?.originalText?.position?.()},seed.seedRev);
    message={...message,cardinalPair:{...cardinalPair,markEpisode}};
    if(this.gal)this.gal.sentenceDiagnosticEpisode=markEpisode;
   }}catch{}
  if(message.cardinalPair&&!message.hookSourcePreview)require('./torch-local-trial.cjs').source(this,message,message.cardinalPair);
  if(typeof message.hookSource==='string'){/* #468 a reader line read by OCR marks the game for the probe upload (adapter-probe.cjs markRuntime), once per game and session */if(message.hookSourceOrigin==='ocr'&&this.gameId&&message.hookSource.trim()){const seen=this.ocrMarked||(this.ocrMarked=new Set());if(!seen.has(this.gameId)){seen.add(this.gameId);try{require('./adapter-probe.cjs').markRuntime(this.root,this.gameId,'ocr-fallback','reader lines came from OCR');}catch{}}}this.gal?.send({type:'markerSource',text:message.hookSource});if(!message.hookRecovering&&message.hookSourceOrigin!=='history'){
   if(message.hookSource&&message.hookSource!==this.immersion.currentText)this.gal?.send({type:'dialogSceneLine'});
   this.immersion.source(message.hookSource,message.hookSourceEngine,message.hookSourceOrigin);
   /* E287: translate the next few lines the script leaves untranslated, so they are ready before the game reaches them. */
   if(message.hookSource.trim()&&!message.hookSourcePreview)require('./script-prefetch.cjs').ahead(this).catch(()=>{});
   if(typeof message.hookSource==='string'&&message.hookSource.trim()){require('./scene-shots.cjs').maybe(this);require('./sentence-scenes.cjs').remember(this);}
  }if(!message.hookRecovering&&message.hookSourceOrigin!=='history'&&message.hookSource){this.lastLine=message.hookSource;
   /* E598 text from the game after an automatic switch: it works */
   if(this.gameId&&this.jpAutoSeen!==this.gameId){this.jpAutoSeen=this.gameId;try{require('../core/japanese-auto.cjs').textSeen(this.root,this.gameId);}catch{}}}const line={gameId:this.gameId,text:message.hookSource,sequence:message.hookSequence,active:message.hookActive,recovering:message.hookRecovering,origin:message.hookSourceOrigin};if(this.pendingLines){if(this.pendingLines.length<40)this.pendingLines.push(line);}else this.stats.line(line);}
  this.emit('reader-event',message);if(typeof message.hotkey==='boolean')this.emit('reader-health',this.runtime.readerStatus?.()||{});
 }
 /* E475 + font probe (user 2026-11-13: 自动读内存来导入游戏字体): the font the game draws with is the reader's Japanese font
    unless the user picked another one after the font-follow migration (japaneseFontSource 'user'); 恢复为游戏原字体 sets it
    back to 'game'. An engine's own report (KiriKiri) outranks the probe's draw counts for the same game. */
 engineFont(message){try{const g=this.gal;if(!g||!message)return;const ef=require('../core/engine-font.cjs');if(message.probe&&ef.uiFace(message.face))return;if(ef.engineDefault?.(message)){this.gal?.hooks?.trace?.('engine font ignored: '+message.face+' '+message.size+'px is the engine default (no font set on that layer)');return;}const rank=ef.rank(message);
  if(this.engineFontSeen&&this.engineFontSeen.pid===this.gamePid&&this.engineFontSeen.rank>rank)return;
  this.engineFontSeen={pid:this.gamePid,rank,message};if(!message.scanned)this.fonts?.note?.(message.probe?'probe':'engine',{face:String(message.face||''),engine:String(message.engine||''),size:message.size||0});
  if(g.preferences?.japaneseFontSource==='user')return;this.applyEngineFont(message);}catch{}}
 /* E503 Unity / MAGES / Ren'Py draw without Windows, so the probe never names their dialogue font: the game's files are read
    once (core/engine-font-scan.cjs, worker thread, cached per folder), the font it ships is imported like a probe font file
    and reported as a scanned hookFont (outranks the probe, not a live engine report). */
 async engineFontScan(pid,{force=false}={}){try{const root=this.fonts?.current?.root;if(!root||this.gamePid!==pid)return;const scanner=require('../core/engine-font-scan.cjs');if(!scanner.engineOf(root)){this.fonts.note('archive',{engine:'',found:0,reason:'no engine archive'});return;}
  const r=await scanner.inWorker(root,path.join(this.root,'cache','engine-font-scan'),force);if(!r||this.gamePid!==pid){this.fonts?.note?.('archive',{engine:scanner.engineOf(root),found:0,reason:'scan failed'});return;}
  this.fonts.note('archive',{engine:r.engine,found:(r.files||[]).length,face:r.face||r.family||'',reason:r.reason||'',source:r.prerendered?.source||'',prerendered:r.prerendered?{family:r.prerendered.family,source:r.prerendered.source}:null,match:r.match?{family:r.match.family,score:r.match.score,recognized:!!r.match.recognized,game:!!r.match.source}:null,notes:r.notes||[]});
  for(const file of r.files||[])try{const label=r.labels?.[file];this.fonts.addFile(file,label?'archive':'file',label||'');}catch{}
  this.gal?.hooks?.trace?.('engine font scan '+r.engine+': '+JSON.stringify(r.face||r.family||'')+' ('+r.reason+')');try{fs.appendFileSync(path.join(this.root,'logs','engine-font-scan.log'),JSON.stringify({at:new Date().toISOString(),root,engine:r.engine,face:r.face,family:r.family,reason:r.reason,files:r.files})+'\n');}catch{}
  if(r.face||r.family)this.engineFont({type:'hookFont',engine:r.engine,face:r.face||'',family:r.family,scanned:true,bold:typeof r.bold==='boolean'?r.bold:undefined,size:r.size});}catch{}}
 applyEngineFont(message){const g=this.gal;const choice=require('../core/engine-font.cjs').pick({face:message.face,prerendered:message.prerendered,family:message.family,fonts:this.fonts?.current?.fonts});if(!choice)return null;
  const values={japaneseFont:choice.key,japaneseFontSource:'game'};if((message.probe||message.scanned)&&typeof message.bold==='boolean')values.japaneseBold=message.bold;
  if(Object.keys(values).some(k=>g.preferences?.[k]!==values[k]))g.save({...g.preferences,...values});this.emit('reader-event',{type:'enginePreferences',values});
  this.gal.hooks?.trace?.('engine font '+JSON.stringify(choice.face)+(message.size?' '+message.size+'px':'')+(message.engine?' via '+message.engine:'')+(message.prerendered?' pfont='+message.prerendered:'')+' -> '+choice.key+' ('+choice.reason+')');return values;}
 engineFontFile(message){try{if(!this.fonts||!message?.path)return;const go=()=>{const added=this.fonts.addFile(String(message.path),message.kind==='mem'?'mem':'file');if(added?.length){this.fonts.note('registered',{found:(this.fonts.current?.fonts||[]).filter(f=>f.loaded==='mem'||f.loaded==='file').length});this.gal?.hooks?.trace?.('game font loaded from '+(message.kind==='mem'?'memory':'file')+': '+added.map(f=>f.family).join(', '));const seen=this.engineFontSeen;if(seen&&seen.pid===this.gamePid&&this.gal?.preferences?.japaneseFontSource!=='user')this.applyEngineFont(seen.message);}};
  if(this.fonts.current?.status==='ready')go();else if(this.gamePid)this.fonts.detect(this.gamePid).then(go,()=>{});}catch{}}
 /* 2026-11-19 (user: "给我自动装上 校准的时候也要自动去换 手动点查找的时候也要自动去找"): one pass over every source of the
    game's font, run when a game is bound, after a calibration and on 重新查找游戏字体: (a) font files in the game folder,
    (b) fonts in its archives, and a pre-rendered dialogue font turned into an outline font (core/engine-font-scan.cjs),
    (c) fonts the game registered itself (font probe: AddFontMemResource / AddFontResource, saved under cache/font-probe),
    (d) the face the engine or the probe reports; then the result is applied unless the user picked a font by hand
    (japaneseFontSource 'user'; 恢复为游戏原字体 makes it 'game' again). Everything stays in this PC's cache. */
 async confirmGameFont(reason,{force=false}={}){const pid=this.gamePid;if(!pid||!this.fonts)return null;
  if(!force&&this.fontConfirmAt&&Date.now()-this.fontConfirmAt<15000)return null;this.fontConfirmAt=Date.now();
  try{await this.fonts.detect(pid,force);}catch{}if(this.gamePid!==pid)return null;
  this.probeFonts();await this.engineFontScan(pid,{force});if(this.gamePid!==pid)return null;
  const g=this.gal;if(!g||g.preferences?.japaneseFontSource==='user'){this.gal?.hooks?.trace?.('game font confirmed ('+reason+'): kept the font picked by hand');return null;}
  /* nothing named and nothing found: the current font stays (no default face is forced on the game) */
  if(this.engineFontSeen?.pid!==pid&&!(this.fonts.current?.fonts||[]).some(f=>f.lang==='ja')){this.gal?.hooks?.trace?.('game font confirmed ('+reason+'): no source gave a font');return null;}
  const values=this.followGameFont();if(values)this.emit('reader-event',{type:'enginePreferences',values});
  this.gal?.hooks?.trace?.('game font confirmed ('+reason+'): '+JSON.stringify(values?.japaneseFont||''));return values;}
 /* Furigana and the speech button read the game's character names as VNDB lists them (昂晴 こうせい, not のぼるはる). */
 bindNames(game){
  // A game without a VNDB id is found on VNDB by its titles (name-reading.cjs vnForTitles).
  let vndbId='',titles=[];try{const lib=JSON.parse(game?.original||'{}').library||{};vndbId=lib.vndbId||'';titles=[game?.title,...(Array.isArray(lib.names)?lib.names:[])];}catch{}
  // Names are an extra: no learning module, or any failure here, never stops binding the game.
  let learning;try{learning=this.runtime.learning?.();}catch{}if(typeof learning?.useNames!=='function')return;
  const gameId=game?.id||null;learning.useNames(null);this.bindReadings(learning,game);if(!vndbId&&!titles.some(Boolean))return;
  require('../core/name-reading.cjs').gameNames(vndbId,{titles,folder:path.join(this.root,'cache','vndb-names'),lookup:s=>learning.readings.lookup(s)})
   .then(names=>{if(this.gameId===gameId)learning.useNames(names);}).catch(()=>{});
 }
 /* #1134 the game's own readings come before VNDB names and the dictionary for furigana, the speech button and lookup
    (core/game-reading.cjs): this line's ruby, the ruby of lines seen before (GameRuby), the ruby the whole stored script always
    gives a word. Read when a line is tokenized, so ruby learned while playing applies at once. */
 bindReadings(learning,game){
  if(typeof learning?.useGameReadings!=='function')return;const exe=this.gameExe;let script;
  const scriptMap=()=>{if(script===undefined){script=null;try{script=require('../core/game-reading.cjs').scriptReadings(require('./original-text.cjs').scriptRuby(this.root,exe,game?.id));}catch{}}return script;};
  learning.useGameReadings(exe?text=>{const own=this.gal?.hooks?.sourceRuby,line=own?.get(text)||own?.get(String(text).replace(/\s+/g,''))||[];
   return {line,learned:this.gal?.gameRuby?.dict(this.gal?.styleSync?.profileKey)||{},script:scriptMap()};}:null);
 }
 /* fonts the font probe saved for this game (cache/font-probe/<FNV-1a of the lower-case game folder>/mem-*.ttf) */
 probeFonts(){try{const root=this.fonts?.current?.root;if(!root)return;let h=2166136261;for(let i=0;i<root.length;i++)h=Math.imul((h^root.toLowerCase().charCodeAt(i))>>>0,16777619)>>>0;
  const dir=path.join(this.root,'cache','font-probe',h.toString(16).padStart(8,'0'));
  for(const n of fs.existsSync(dir)?fs.readdirSync(dir):[])if(/\.(ttf|otf|ttc|otc)$/i.test(n))try{this.fonts.addFile(path.join(dir,n),/^mem-/i.test(n)?'mem':'file');}catch{}
  this.fonts.note('registered',{found:(this.fonts.current?.fonts||[]).filter(f=>f.loaded==='mem'||f.loaded==='file').length});}catch{}}
 followGameFont(){const g=this.gal;if(!g)return null;g.save({...g.preferences,japaneseFontSource:'game'});const seen=this.engineFontSeen;let values=null;if(seen&&seen.pid===this.gamePid)values=this.applyEngineFont(seen.message);
  else{const f=this.fonts?.current?.fonts?.find(f=>f.lang==='ja');values={japaneseFont:f?'game:'+f.id:'originalGothic',japaneseFontSource:'game'};g.save({...g.preferences,...values});}return values;}

 logVisibility(entry){const at=new Date().toISOString();try{logSink.append(path.join(this.root,'logs','reader-host.log'),JSON.stringify({at,...entry})+'\n');}catch{}/* 2026-11-21 the live self-check reads the reader's entries too */try{require('./self-check-live.cjs').feedReader({at,...entry});}catch{}}
 selectGame(processName,enter=true,executable=''){if(!this.active())return;
  if(!this.gal)return;
  if(this.gal.preferences.gameProcess!==processName||this.expectedExecutable&&this.expectedExecutable!==executable)this.gal.send({type:'unbind'});
  this.expectedExecutable=executable;
  /* E545 zero-latency from the first line: the script provider is ready before the game process binds */
  try{const exe=executable?require('./launch-path.cjs').canonical(executable):'';if(exe){this.textExe=exe;this.refreshTextSource({exe,pid:0});}}catch{}
  this.gal.send({type:'expectExecutable',path:executable});
  this.gal.save({...this.gal.preferences,gameProcess:processName,gameExecutable:this.gal.preferences.gameProcess===processName?this.gal.preferences.gameExecutable||'':'',bindEnabled:true});
  if(enter)this.gal.send({type:'enterGame'});
 }
 attach({pid,hwnd}){if(!this.active())return {libraryOnly:true,attached:false};
  if(!Number.isSafeInteger(pid)||pid<1||!/^\d{1,19}$/.test(String(hwnd)))throw Error('INVALID_READER_WINDOW');
  if(this.gal)return {attached:true};
  this.overlayPid=pid;
  const layout={...require('../core/layout.cjs'),overlayHwnd:String(hwnd)};
  this.immersion=new(require('../core/immersion.cjs').Immersion)(message=>{if(message.dialogVisible===false){require('./scene-shots.cjs').maybe(this,{hidden:true});require('./sentence-scenes.cjs').remember(this,{hidden:true});}else if(message.dialogVisible===true){this.sceneDialogHidden=false;require('./sentence-scenes.cjs').remember(this);}/* 2026-11-19 choices are not looked for while the dialogue box is gone for a known reason (settings page typing its preview) */if(this.gal?.hooks&&typeof message.dialogVisible==='boolean')this.gal.hooks.dialogGoneAt=message.dialogVisible?0:/^(?:window|scene|engine)$/.test(String(message.reason||''))?(this.gal.hooks.dialogGoneAt||Date.now()):0;this.logVisibility({type:'dialogVisibility',visible:message.dialogVisible,reason:message.reason});this.emit('reader-event',{type:'dialogVisibility',visible:message.dialogVisible,choiceOnly:message.choiceOnly===true});clearTimeout(this.hideTimer);if(message.dialogVisible===false)this.hideTimer=setTimeout(()=>this.gal?.send({type:'dialogVisibility',visible:false}),140);else this.gal?.send({type:'dialogVisibility',visible:message.dialogVisible});this.emit('reader-event',message);});this.immersion.onDecision=d=>this.logVisibility({type:'visibilityDecision',...d});/* the hook bridge keeps the game's text hidden while the layer is away only because the game's text window is (core/immersion.cjs awayByDialog) */this.syncDialogAway=()=>{const away=this.immersion.awayByDialog(),changed=away!==this.dialogAway;/* said again every two seconds while it lasts: a bridge that was started in between knows it too */if(!changed&&!(away&&Date.now()-(this.dialogAwayAt||0)>=2000))return;this.dialogAway=away;this.dialogAwayAt=Date.now();if(changed)this.logVisibility({type:'dialogAway',away});this.gal?.hooks?.send?.({type:'dialogAway',away});};this.immersion.configure(this.runtime.config());/* E422: a page game is known before its first line */this.immersion.flowGame=()=>this.gal?.hooks?.flowPage===true;this.tick=setInterval(()=>{this.immersion.tick();this.syncDialogAway();},100);this.tick.unref();
  this.fonts=new(require('../core/game-fonts.cjs').GameFonts)(layout,(_,light)=>{this.emit('reader-event',{type:'fonts',fonts:this.fonts.payload(!light)});});
  this.gal=new(require('../core/gal-native.cjs').GalNative)(layout,pid,message=>this.event(message),this.runtime.spawnReaderNative);this.gal.onLineVoice=(text,wav)=>{/* E455 a kept clip loses its music first when separation is on and ready */const keep=v=>{try{require('./game-voice.cjs').remember(this.root,text,v);}catch{}};if(this.runtime.config().ankiVoiceIsolate===false)return keep(wav);require('./vocal-sep.cjs').isolate(this.root,wav).then(clean=>keep(clean||wav),()=>keep(wav));};
  try{this.gal.onLine=require('./voice-harvest.cjs').recorder(this.root,()=>this.textExe||this.gameExe);}catch{}/* the game's own CV, recorded as it plays (MeguLitDump voice harvest) */
  if(!this.gal.process){this.stop();throw Error('READER_NATIVE_MISSING');}
  this.gal.process.once('error',()=>{this.runtime.call({action:'reader_health',phase:'native-launch',error:'READER_NATIVE_START_FAILED'}).catch(()=>{});});
  if(this.runtime.pendingGame)this.selectGame(this.runtime.pendingGame,this.runtime.pendingGameEnter,this.runtime.pendingExecutable);
  else if(this.textExe||this.gameExe)this.refreshTextSource();/* E545 a reader started again while the game runs: the new hooks get the provider */
  return {attached:true};
 }
 setWorkPrompt(key){
  this.workKey=key;
  this.workPrompt=key?readJSON(path.join(this.folder,'game-translation-prompts.json'))[key]||'':'';
  this.emit('reader-event',{type:'workTranslationPrompt',key,prompt:this.workPrompt});
 }
 saveWorkPrompt(key,prompt){
  if(!key||key!==this.workKey||typeof prompt!=='string')return;
  const file=path.join(this.folder,'game-translation-prompts.json'),values=readJSON(file),clean=prompt.trim().slice(0,2000);
  if(clean)values[key]=clean;else delete values[key];
  atomic(file,values);this.setWorkPrompt(key);this.translation?.clearContext();
 }
 translator(){if(!this.translation){this.translation=require('../core/providers.cjs').createTranslationService();}return this.translation;}
 loadKeys(){const {SecretStore}=require('../core/secrets.cjs');if(fs.existsSync(path.join(this.folder,'secrets.dpapi')))for(const[base,key]of new SecretStore(this.folder,undefined,path.join(this.root,'native','KeyVault.exe')).entries())this.translator().setKey(base,key);}
 /* v1.1.4 (user: show the real progress from 0% to 100%): while the llama.cpp runtime downloads, the overlay line of
    the waiting sentence is updated every half second, then shows the model starting, then the translation. */
 async localReady(options,id,current){
  const llm=this.runtime.local(),push=message=>{if(Number.isSafeInteger(id))this.emit('reader-event',{type:'call',method:'deliver',args:[id,'',true,message]});};
  try{return await llm.ensure(options);}catch(error){
   /* E406's in-place switch to Microsoft (no local model downloaded) is gone: the error goes to services/translation-chain.cjs, which goes on to the next source */
   if(!/^LOCAL_RUNTIME_DOWNLOADING/.test(error.message))throw error;}
  while(llm.job?.state==='downloading'&&current()){const j=llm.job;push('LOCAL_RUNTIME_DOWNLOADING:'+(j.total?Math.min(100,Math.floor(j.received/j.total*100)):0));await new Promise(r=>setTimeout(r,500));}
  if(!current())throw Error('SUPERSEDED');
  if(llm.job?.state!=='done')throw Error('LOCAL_RUNTIME_DOWNLOAD_FAILED');
  push('LOCAL_RUNTIME_DOWNLOADING:100');push('LOCAL_STARTING');
  return llm.ensure(options);
 }
 // Translation written back into the game (embedTranslation): the hook bridge holds the line until this answers (about
 // 3.7 s); an empty answer lets the original line through. Lines are cached so the reader page, which asks for the
 // same line a moment later, and repeated lines (backlog, redraws) do not call the translation service again.
 // The imported script source (Chinese patch or Japanese original) for the running game, if one lines up.
 /* Learning: the human translation zero-latency holds for a Japanese line, then the overlay's machine translation. */
 humanLine(text,value){this.humanLines??=new Map();const key=String(text||'').replace(/\s+/g,'');if(!key)return undefined;if(value===undefined){if(this.humanLines.has(key))return this.humanLines.get(key);
   try{const hooks=this.gal?.hooks,provider=hooks?.originalText;if(provider&&hooks.scriptAllowed?.()!==false){const found=require('./learning-insights.cjs').humanFromResolve(provider.kind,hooks.resolveSource(text));if(found)return found;}}catch{}return null;}
  this.humanLines.set(key,value);if(this.humanLines.size>800)this.humanLines.delete(this.humanLines.keys().next().value);return value;}
 sentenceTranslation(text,machine){const insights=require('./learning-insights.cjs'),human=this.humanLine(text);return insights.pickTranslation({human,machine:human&&insights.usable(machine)&&machine.trim()===human.text?'':machine});}
 /* E545 (user: 零延迟翻译 only worked after switching it off and on again): the provider is built for the program being
    launched (selectGame) before its first line, adopted by the game process when it binds, checked again while the game
    runs (a stale patch rebuilt in the background, the start-up script prewarm, a cold run) and on every settings save;
    an unchanged key keeps the provider and its reading position, a changed one rebuilds it. force rebuilds anyway. */
 refreshTextSource({force=true,exe=this.textExe||this.gameExe||'',pid=this.gamePid||0}={}){try{const hooks=this.gal?.hooks;if(!hooks)return;/* E330 the 零延迟翻译 switch in the translation settings */
  hooks.scriptAllowed=()=>{const prefs=this.prefs(),archive=hooks.originalText?.archiveImport===true;return (archive?hooks.originalText.isCurrent():prefs.scriptTranslation!==false)&&prefs.learnerLanguage!=='en';};
  const allowed=hooks.scriptAllowed();
  let game;try{const db=require('./store.cjs').openStore(this.root);try{game=require('./library.cjs').activeGameForProgram(db,exe);}finally{db.close();}}catch{}
  const ot=require('./original-text.cjs'),key=exe?String(exe).toLowerCase()+'|'+ot.providerKey(this.root,exe,game?.id):'';
  const sourceChanged=hooks.textSourceKey!==key;
  if(hooks.textSourceAllowed!==allowed||sourceChanged){
   this.strictMtCache?.clear();this.embedCache?.clear();this.embedOrigins?.clear();this.humanLines?.clear();hooks.textSourceAllowed=allowed;
  }
  if(!exe){hooks.originalText=null;hooks.textSourceKey='';return;}
  if(!force&&hooks.originalText&&hooks.textSourceKey===key)return;hooks.originalText=ot.provider(this.root,exe,{id:game?.id});hooks.textSourceKey=key;hooks.textSourcePid=pid;
  if(sourceChanged&&exe===this.gameExe){
   const session=require('./self-check-live.cjs').current();
   if(session?.reader===this&&session.exe===exe&&session.script!==ot.contributionScript(this.root,exe,game?.id))this.applyGameProfile(exe,game);
  }
  /* 2026-11-14 the launch notice asks the shared check first: an install known to have Japanese never gets "the script is Chinese" */
  try{const db=require('./store.cjs').openStore(this.root);try{const archive=hooks.originalText?.archiveImport===true;
   hooks.japaneseInstall=game?.id&&!archive?require('./japanese-presence.cjs').verdict(this.root,db,game.id).japanese:null;const lib=JSON.parse(game?.original||'{}').library||{};hooks.setSourceLanguage?.(archive?'':lib.contentLanguage==='zh'?'zh!':lib.contentLanguage==='ja'||hooks.japaneseInstall===true?'ja':hooks.japaneseInstall===false?'zh':'');}finally{db.close();}}catch{hooks.japaneseInstall=null;}}catch{}}
 /* E545 the game process binds: a provider built at launch for this same program is kept (no reading-position reset) */
 /* 2026-11-21 layered game profile (core/profiles): which game diff and engine diff this run uses, from the program path, the
    library row (title, detected engine) and the folder (Steam app id, fingerprint files); handed to gal-native setGameProfile */
 applyGameProfile(exe,game){try{const P=require('../core/profiles/index.cjs');let o={};try{o=JSON.parse(game?.original||'{}')||{};}catch{}const folder=exe?path.dirname(exe):'';
  let engine=String(o.library?.engine||o.engine||'');if(!engine&&folder)try{engine=require('../core/library.cjs').engineOf(folder)?.name||'';}catch{}
  let steamAppId='';if(folder)try{steamAppId=fs.readFileSync(path.join(folder,'steam_appid.txt'),'utf8').trim().slice(0,12);}catch{}
  const title=String(game?.title||this.gal?.state?.gameTitle||'');const vndb=String(o.vndbManual||o.library?.vndbId||'');const input={engine,exe,title,folder,steamAppId,vndb,vndbLayoutKey:o.library?.presentation?.key,vndbLayout:vndb&&o.library?.presentation?.vnid===vndb?o.library.presentation.mode:null};let profile=P.profileFor(input);/* 2026-11-21 self-check gate + first-play calibration (services/self-check-live.cjs): this PC's stored auto layer goes on top */try{const live=require('./self-check-live.cjs');require('../core/hook-native.cjs').HookNative.traceTap=live.feedTrace;const s=live.start(this,exe,profile,input);if(s)profile=P.profileFor(live.inputOf(s));}catch{}this.gal?.setGameProfile?.(profile,input);const pid=this.gamePid,birth=String(this.gal?.state?.gameStarted||'');require('../core/owner-tests.cjs').resolve(this.root,{exe,engine:profile.engine}).then(token=>{const h=this.gal?.hooks;if(!token||!h||!require('../core/owner-tests.cjs').identity(token,exe))return;if(this.gamePid!==pid||String(this.gal?.state?.gameStarted||'')!==birth||this.gameExe!==exe){require('../core/owner-tests.cjs').revoke(token);return;}h.setOwnerTestGrant?.(token);const live=require('./self-check-live.cjs').current(),p=live?.reader===this?P.profileFor(require('./self-check-live.cjs').inputOf(live)):profile;this.gal?.setGameProfile?.(p,input);}).catch(()=>{});}catch(error){this.gal?.hooks?.trace?.('profile error '+(error?.message||error));}}
 /* 2026-11-21 (owner, 1.4.22 test v2, ファタモルガーナの館: 「为啥不替换文本了啊」, 02:45:51Z the reader's text-effect count sent it to
    read mode) a game whose built-in seed is verified / owner-ok in hide mode is never switched to read mode by a text-effect
    judgement (the reader's pairing count, core's effect judge, an older remembered verdict): it is only logged */
 seedKeepsHide(exe,by,m={}){try{let p=this.gal?.profile;if(!p||!p.seedStatus)p=require('../core/profiles/index.cjs').profileFor({exe});
  if(!['verified','owner-ok'].includes(p.seedStatus)||p.hide?.textEffectsRead===true)return false;
  this.logVisibility({type:'layoutDiagnostic',kind:'textEffects',what:'keptHide',by,seed:p.gameKey,status:p.seedStatus,paired:Number(m.paired)||0,orphan:Number(m.orphan)||0});this.gal?.hooks?.trace?.('text effects: read mode not taken ('+by+'), seed '+p.gameKey+' '+p.seedStatus+' stays hidden');return true;}catch{return false;}}
 scriptExecutable(exe){
  const selected=this.expectedExecutable;
  if(!selected||!exe||!this.root)return exe;
  const shadows=path.resolve(this.root,'data','unity-shadow');
  if(path.relative(shadows,path.dirname(path.dirname(exe)))!=='')return exe;
  try{
   const key=require('../core/text-paths-unity.cjs').shadowKey(selected,'il2cpp');
   const expectedCopy=path.join(shadows,key,path.basename(selected));
   if(path.relative(expectedCopy,exe)==='')return selected;
  }catch{}
  return exe;
 }
 adoptTextSource(exe,pid){exe=this.scriptExecutable(exe);const hooks=this.gal?.hooks,same=!!(hooks?.originalText&&hooks.textSourcePid===0&&String(this.textExe||'').toLowerCase()===String(exe||'').toLowerCase());this.textExe=exe;
  if(same){hooks.textSourcePid=pid;this.refreshTextSource({force:false,exe,pid});}else this.refreshTextSource({exe,pid});this.watchTextSource(exe);}
 watchTextSource(exe){for(const t of this.textSourceTimers||[])clearTimeout(t);this.textSourceTimers=[3000,15000,60000,180000].map(ms=>{const t=setTimeout(()=>{if(this.textExe===exe&&this.gal)this.refreshTextSource({force:false});},ms);t.unref?.();return t;});}
 // E280: a Japanese game started without a patch set up: look for one on this computer in the background.
 findTextSource(gameId){/* E450 the game's own voices for its lines */try{const db=require('./store.cjs').openStore(this.root);try{const row=db.prepare('SELECT executable FROM games WHERE id=?').get(String(gameId));require('./game-voice.cjs').scanLater(this.root,row?.executable,8000,{cold:this.prefs?.()?.scriptColdRun!==false});}finally{db.close();}}catch{}const hooks=this.gal?.hooks,ready=hooks?.originalText;/* E545 a provider without its patch (none yet, or one left stale by a reader update) still looks for one */if(!gameId||ready&&(ready.kind!=='patch'||ready.patch))return;require('./original-text.cjs').autoPatchLater(this.root,gameId,()=>this.refreshTextSource({force:false}));}
 /* E370 shared adaptation: a game with nothing saved on this PC starts from a matching shared record (local store, then
    the relay when one is configured); the reader says 已套用共享适配设置 once. Settings the user saved are never replaced. */
 sharedImport(game){const exe=this.gameExe;if(!exe)return;setTimeout(()=>{try{if(this.gameExe!==exe)return;const shared=require('./shared-adaptation.cjs');if(!shared.enabled(this.root))return;let original={};try{original=JSON.parse(game?.original||'{}')||{};}catch{}const lib=original.library||{};
  const run=()=>{const before=lib.localeMode,result=shared.importFor(this.root,{executable:exe,engine:lib.engine||'',library:game?lib:null,styleSync:this.gal?.styleSync});
   if(game&&lib.localeMode!==before){const db=openStore(this.root);try{const row=db.prepare('SELECT original FROM games WHERE id=?').get(game.id);if(row){const o=JSON.parse(row.original||'{}');if(!o.library?.localeMode){o.library={...o.library,localeMode:lib.localeMode};db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(o),game.id);}}}finally{db.close();}}
   if(result.fingerprint&&shared.takeNotice(this.root,result.fingerprint))this.gal?.hooks?.notify?.({sharedAdaptation:Date.now()});return result;};
  const result=run();if(result.fingerprint&&!shared.find(this.root,result.fingerprint))require('./shared-adaptation-sync.cjs').pull([result.fingerprint],{root:this.root}).then(r=>{if(r.state==='ok'&&r.records.length&&this.gameExe===exe)run();}).catch(()=>{});}catch{}},0);}
 /* E370: after a verified embed or a calibration save, this game's record is written (and pushed when a relay is set). */
 shareAdaptation(){const exe=this.gameExe;if(!exe)return;clearTimeout(this.shareTimer);this.shareTimer=setTimeout(()=>{try{if(this.gameExe!==exe)return;const shared=require('./shared-adaptation.cjs');if(!shared.enabled(this.root))return;const db=openStore(this.root);let game;try{game=require('./library.cjs').activeGameForProgram(db,exe);}finally{db.close();}let lib={};try{lib=JSON.parse(game?.original||'{}').library||{};}catch{}
  const hooks=this.gal?.hooks;shared.exportFor(this.root,{executable:exe,engine:lib.engine||'',library:lib,hooks,styleSync:this.gal?.styleSync,hookProfile:hooks?.state?.hookProfile||this.gal?.preferences?.hookProfile||'',appVersion:shared.appVersion(this.root)});}catch{}},1500);this.shareTimer.unref?.();}
 // E285: the overlay's display choice picks the translation language (日文＋英文 / 仅英文 translate into English).
 cardinalTarget(){return this.targetLanguage();}
 targetLanguage(options){if(!options)try{options=this.langOptions(this.prefs());}catch{options=this.langOptions({});}return options.learnerLanguage==='en'?'en':'zh';}
 requestOptions(request={}){return this.langOptions(require('../core/providers.cjs').resolveOptions({...this.prefs(),...(request.options&&typeof request.options==='object'?request.options:{}),translationPrompt:this.workPrompt||''}));}
 displayLanguage(){const d=this.gal?.preferences?.display;return d==='bilingual-en'||d==='english'?'en':'';}
 langOptions(o){const lang=this.displayLanguage();return lang?{...o,learnerLanguage:lang}:o;}
 /* 2026-11-21 (owner, 千恋＊万花 中文版: 「電車を降りて、駅前でタクシーを捕まえたものの…」 paired with the patch (exact #9) and shown without Chinese): the
    patch translation was stored under the line as the hook gave it and looked up with the line as the reader had it; any difference (ruby or
    effect markup, blanks, the brackets around it) missed. Both sides use one normal key now (Reader.normKey); an exact miss tries the longest
    cached line that contains the asked one or is contained in it (a sentence cut from a page, a page around a sentence), at least 60 % of it, or a page that ends with the asked line (the newest sentence of a page the patch was paired on).
    Every lookup is noted (key fingerprint, hit / near / miss and why) in the hook trace and in this.embedLog. */
 static normKey(text){let t=String(text||'');
  t=t.replace(/[｜|]([^《\[｜|]+)[《\[][^》\]]*[》\]]/g,'$1').replace(/《[^》]*》/g,'').replace(/\[[^\]]*\]/g,'').replace(/<[^>]*>/g,'').replace(/\\[a-zA-Z]+(\[[^\]]*\])?/g,'');
  t=t.replace(/[\s\u3000\u200b\u001f]+/g,'');
  for(let k=0;k<3;k++)t=t.replace(/^[「『“"（(【]+/,'').replace(/[」』”"）)】]+$/,'');
  return t;}
 static keyPrint(key){let h=0;for(const c of String(key))h=(h*31+c.codePointAt(0))>>>0;return h.toString(16)+'/'+[...String(key)].length;}
 embedNote(kind,key,why=''){const n={at:Date.now(),kind,key:Reader.keyPrint(key),why};(this.embedLog||(this.embedLog=[])).push(n);if(this.embedLog.length>60)this.embedLog.shift();try{this.gal?.hooks?.trace?.('translation '+kind+' key='+n.key+(why?' '+why:''));}catch{}}
 embedNear(key){
  if(require('../core/saya-page-ocr.cjs').legacyExe(this.gal?.hooks?.target?.name))return null;
  const p=key.startsWith('en|')?'en|':'',q=key.slice(p.length),ql=[...q].length;if(ql<4)return null;let best=null;
  for(const [k,v] of this.embedCache){if(!v||!k.startsWith(p)||(p===''&&k.startsWith('en|')))continue;const c=k.slice(p.length),cl=[...c].length;if(c===q)continue;
   const inside=c.includes(q),around=q.includes(c);if(!inside&&!around)continue;
   if(Math.min(cl,ql)/Math.max(cl,ql)<.6&&!(inside&&c.endsWith(q)))continue;
   if(!best||cl>best.len)best={value:v,cacheKey:k,len:cl,why:(inside?'asked line inside cached ':'cached line inside asked ')+Reader.keyPrint(k)};}
  if(best)return best;
  /* 2026-11-21 (ファタモルガーナの館: the game draws 「あなた死者」 (ruby あなた on 死者), the hook gave 「あなた」に…, the patch was paired on one, the reader asked with the other):
     the same line with a word more or less: character-pair (bigram) overlap of at least 0.8 and lengths within 30 %, the closest wins */
  const grams=t=>{const a=[...t],m=new Map();for(let i=0;i+1<a.length;i++){const g=a[i]+a[i+1];m.set(g,(m.get(g)||0)+1);}return m;},qg=grams(q),qn=Math.max(1,ql-1);let close=null;
  for(const [k,v] of this.embedCache){if(!v||!k.startsWith(p)||(p===''&&k.startsWith('en|')))continue;const c=k.slice(p.length),cl=[...c].length;if(cl<4||Math.min(cl,ql)/Math.max(cl,ql)<.7)continue;
   const cg=grams(c);let both=0;for(const [g,n] of qg)both+=Math.min(n,cg.get(g)||0);const dice=2*both/(qn+Math.max(1,cl-1));if(dice>=.8&&(!close||dice>close.dice))close={value:v,cacheKey:k,dice,why:'similar '+dice.toFixed(2)+' '+Reader.keyPrint(k)};}
  return close;}
 embedKey(text,language=this.targetLanguage()){return (language==='en'?'en|':'')+Reader.normKey(text);}
 embedCached(text,value,{language=this.targetLanguage(),source,provider,returned,verified=false}={}){this.embedCache??=new Map();const embedded=language!=='en'&&this.gal?.hooks?.originalText?.embedded===true,scope=embedded?this.gal.hooks.originalText.cacheKey(text):'';if(embedded&&!scope)return undefined;const key=embedded?'embedded|'+scope:this.embedKey(text,language);if(!key)return undefined;if(value===undefined){const hit=this.embedCache.get(key);const origin=this.embedOrigins?.get(key),index=this.gal?.hooks?.originalText;
  const allowed=!verified||origin?.verified&&origin.index===index&&origin.position===index?.position?.();
  if(hit&&allowed){if(returned)Object.assign(returned,{cached:true,...(origin&&{source:origin.source,provider:origin.provider})});this.embedNote('hit',key);try{require('../core/cardinal/tape.cjs').liveTranslation(text,hit,{target:language==='en'?'en':'zh'});}catch{}return hit;}const near=embedded||verified?null:this.embedNear(key);if(near){if(returned){const o=this.embedOrigins?.get(near.cacheKey);Object.assign(returned,{cached:true,...(o&&{source:o.source,provider:o.provider})});}this.embedNote('near',key,near.why);try{require('../core/cardinal/tape.cjs').liveTranslation(text,near.value,{target:language==='en'?'en':'zh'});}catch{}return near.value;}this.embedNote('miss',key,'no cached line equal to or around it ('+this.embedCache.size+' cached)');return undefined;}if(value){this.embedNote('store',key);try{require('../core/cardinal/tape.cjs').liveTranslation(text,value,{target:language==='en'?'en':'zh'});}catch{}}this.embedOrigins??=new Map();this.embedOrigins.delete(key);if(source){const origin={source,provider};
   if(['script','patch','official','group'].includes(source)){origin.verified=true;origin.index=this.gal?.hooks?.originalText;origin.position=origin.index?.position?.();}
   this.embedOrigins.set(key,origin);
  }this.embedCache.delete(key);this.embedCache.set(key,value);if(this.embedCache.size>800){const oldest=this.embedCache.keys().next().value;this.embedCache.delete(oldest);this.embedOrigins.delete(oldest);}return value;}
 /* 2026-11-12 art text (PageLocator art mode): the page gets the place and the translation; the game keeps drawing the line */
 async artText(message){if(message?.source==='engine'&&message.role==='name'){const turns=this.artTurns||(this.artTurns=new Map());turns.set(message.id,(turns.get(message.id)||0)+1);if(turns.size>300)turns.delete(turns.keys().next().value);if(message.visible!==true)turns.delete(message.id);this.emit('reader-event',{...message,translation:'',rowTranslations:[]});return;}const cacheLanguage=this.targetLanguage();/* 2026-11-15 unreadable art text (mojibake, the game's own noise lines) is neither translated nor drawn */if(message?.visible===true&&require('../core/text-sanity.cjs').garbledSource(String(message.text||''),{controls:false})){this.gal?.hooks?.trace?.('art text unreadable '+message.id);this.emit('reader-event',{...message,translation:'',visible:false});return;}/* E578: a list of short rows (a menu) is translated row by row, see artList */const list=message.source==='ocr'&&message.visible===true&&message.foreign!==true?artList(message.rows):null;let translation='';let text=String(message.text||'').slice(0,600);/* 2026-11-13 OCR rows (source ocr) carry recognition slips (「のた」 for 「のだ」): the script line they stand for replaces them */let shown='';/* 2026-11-13 a foreign group (the game draws the line in another language): its Japanese table line becomes the text, the drawn line is kept as shown; no table line, no item */if(message.foreign===true&&message.visible===true){const ja=this.gal?.hooks?.foreignArt?.(text,message.id)||'';this.gal?.hooks?.trace?.('art foreign '+message.id+' '+JSON.stringify(text.slice(0,40))+' -> '+JSON.stringify(ja.slice(0,40)));if(ja){shown=text;text=ja.slice(0,600);}else{/* not in the table: the Japanese OCR's own reading, when it is Japanese (a kanji card) */const alt=String(message.alt||'');if(!/[\u3040-\u30ff]/.test(alt)&&!/^[\u4e00-\u9fff]{2,8}$/.test(alt))return;text=alt.slice(0,600);}}else if(!list&&message.source==='ocr'&&message.visible===true&&text.trim()){const snapped=this.gal?.hooks?.ocrSnap?.(text);if(snapped)text=snapped.slice(0,600);}/* E540 (WHITE ALBUM2 title logo read as 「ミき=ミミミ」, the translator answered with an apology): an OCR read that is not a line is no item */if(message.visible===true&&message.source==='ocr'&&!shown&&artJunk(text,message.rows,message.sh))return;/* a hide (or newer read) that arrives while a translation is awaited wins: the stale show is dropped */const turns=this.artTurns||(this.artTurns=new Map()),turn=(turns.get(message.id)||0)+1;turns.set(message.id,turn);if(turns.size>300)turns.delete(turns.keys().next().value);
  if(list){const rowTranslations=(await this.artRows(list)).map((t,i)=>t&&!artNoTranslation(list[i],t)?t:'');if(turns.get(message.id)!==turn)return;this.emit('reader-event',{...message,text:list.join('\n'),translation:rowTranslations.some(Boolean)?rowTranslations.join('\n'):'',rowTranslations});return;}
  if(message.visible===true&&text.trim()){try{/* the game's own drawn Chinese line is the translation of a foreign group */translation=(shown&&cacheLanguage!=='en'&&/[\u4e00-\u9fff]/.test(shown)&&!/[\u3040-\u30ff]/.test(shown)?shown:'')||this.localTranslation(text,cacheLanguage);
   /* E540 (WHITE ALBUM2 opening: every card read, almost none shown): a card lasts 3-4 s and the translator can take as long,
      so the hide came first and the show was dropped. The line goes out at once (its readable copy), the translation follows. */
   if(!translation&&turns.get(message.id)===turn)this.emit('reader-event',{...message,text,translation:'',...(shown&&{shown})});
   if(!translation){const until=this.zeroLatencyEnabled(cacheLanguage)?Infinity:Date.now()+4000;try{const result=await this.chainTranslate(text,this.baseOptions(cacheLanguage),{current:()=>turns.get(message.id)===turn&&Date.now()<until});translation=result.text;this.embedCached(text,translation,{language:cacheLanguage,source:result.source,provider:result.provider});}catch{}}}catch{}}
  /* E540: a translator's apology, or the drawn line given back unchanged (a Chinese-patched title menu read as a kanji card), is no translation */
  if(translation&&artNoTranslation(text,translation))translation='';
  if(turns.get(message.id)!==turn)return;if(message.visible!==true)turns.delete(message.id);this.emit('reader-event',{...message,text,translation,...(shown&&{shown})});}
 /* E578: one translation per menu row (cached per row, so an item seen again costs nothing); an empty string where none came in time */
 async artRows(list){const cacheLanguage=this.targetLanguage();let options;try{options=this.baseOptions(cacheLanguage);}catch{return list.map(()=>'');}const until=this.zeroLatencyEnabled(cacheLanguage)?Infinity:Date.now()+4000;
  return Promise.all(list.map(async row=>{try{let t=this.zeroLatencyEnabled(cacheLanguage)?(this.localChoice(row,cacheLanguage)?.text||this.embedCached(row,undefined,{language:cacheLanguage,verified:true})):this.embedCached(row,undefined,{language:cacheLanguage})||'';if(!t){const result=await this.chainTranslate(row,options,{current:()=>Date.now()<until});t=result.text;this.embedCached(row,t,{language:cacheLanguage,source:result.source,provider:result.provider});}return t||'';}catch{return '';}}));}
 /* engine-draw: ruby (game ruby, then dictionary-settled readings) and translation (script, then the fallback chain) for one dialogue line the engine will draw itself */
 async drawEmbed(m){const generation=this.visualGeneration||0,owner=this.gal,current=()=>!this.closed&&this.gal===owner&&(this.visualGeneration||0)===generation;const cacheLanguage=this.targetLanguage();const text=String(m?.text||'');if(!text||text.length>600||notJapanese(text))return;let ruby=[],zh='';
  try{const x=await require('./example-ruby.cjs').exampleRuby(null,this.runtime.learning(),[{text,ruby:this.gal?.hooks?.sourceRuby?.get(text)||[]}]);const it=x?.items?.[0];if(it?.text===text&&Array.isArray(it.spans))ruby=it.spans.map(sp=>[sp.start,sp.end,String(sp.reading||'')]);}catch{}
  try{zh=this.localTranslation(text,cacheLanguage);if(!zh){const until=this.zeroLatencyEnabled(cacheLanguage)?Infinity:Date.now()+4000;const result=await this.chainTranslate(text,this.baseOptions(cacheLanguage),{current:()=>current()&&Date.now()<until});zh=result.text||'';if(zh)this.embedCached(text,zh,{language:cacheLanguage,source:result.source,provider:result.provider});}}catch{}
  if(zh&&(/[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(zh)||require('../core/text-sanity.cjs').garbledSource(zh)))zh='';
  if(current())owner?.hooks?.drawEmbedReply?.(m.key,{ruby,zh});}
 async embedTranslate(id,text){const generation=this.visualGeneration||0,owner=this.gal,current=()=>!this.closed&&this.gal===owner&&(this.visualGeneration||0)===generation;const cacheLanguage=this.targetLanguage();
  let trans='';
  /* E352: the engine's string still carries its ruby markup (HuneX <rふ>触</r>, ISLAND \x1d pairs): translate the text the player reads. */
  try{const plain=require('../core/source-ruby.cjs').extractSourceRuby(text).text;if(plain.trim())text=plain;}catch{}
  /* Multi-language releases pass every language slot of a line through the same call (ATRI: the Simplified and
     Traditional Chinese of each line after the Japanese, live test 2026-11-13); those stay as the game has them. */
  /* 2026-11-14 (ダストマニア・グロテスク): Japanese read with the wrong code page is translated as the Japanese it was; unreadable text gets no translation, the game keeps its own line */
  {const sanity=require('../core/text-sanity.cjs');const fixed=sanity.repairMojibake(text);if(fixed)text=fixed.text;else if(sanity.garbledSource(text,{controls:false})){this.gal?.hooks?.embedReply(id,'',{source:text,text:''});return;}}
  if(notJapanese(text)){this.gal?.hooks?.embedReply(id,'',{source:text,text:''});return;}
  try{
   trans=this.localTranslation(text,cacheLanguage);
   if(!trans){const until=this.zeroLatencyEnabled(cacheLanguage)?Infinity:Date.now()+3500;try{const result=await this.chainTranslate(text,this.baseOptions(cacheLanguage),{current:()=>current()&&Date.now()<until});trans=result.text;this.embedCached(text,trans,{language:cacheLanguage,source:result.source,provider:result.provider});}catch{}}
  }catch(error){try{logSink.append(path.join(this.root,'logs','reader-host.log'),JSON.stringify({at:new Date().toISOString(),type:'embedTranslateFailed',error:String(error?.message||error).slice(0,200)})+'\n');}catch{}}
  /* E358: never let the game draw a translation with holes: a line its font cannot draw is hidden in the game and MeguLit draws it. */
  /* 2026-11-15 never write garbage into a game: a translation with replacement characters, control codes or mojibake goes back empty (the game keeps its line); HookBridge checks the code page (EmbedTextPolicy.GuardWrite) */
  if(trans&&(/[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trans)||require('../core/text-sanity.cjs').garbledSource(trans))){try{logSink.append(path.join(this.root,'logs','reader-host.log'),JSON.stringify({at:new Date().toISOString(),type:'embedTranslateRefused',chars:trans.length})+'\n');}catch{}trans='';}
  let hide=false;if(trans){try{hide=this.gal?.hooks?.originalText?.drawable?.(trans)===false;}catch{}}
  if(current())owner?.hooks?.embedReply(id,hide?'':trans,{hide,source:text,text:trans});
 }
 zeroLatencyEnabled(language){
  if(language==='en')return false;
  try{return this.prefs().scriptTranslation!==false;}catch{return false;}
 }
 localTranslation(text,language,returned={}){
  const strict=this.zeroLatencyEnabled?.(language);
  const script=language==='en'?'':this.gal?.hooks?.scriptTranslation?.(text,returned);
  if(script&&(!strict||script.trim()!==text.trim()&&[undefined,'script','patch','official','group'].includes(returned.source))){returned.source??="script";this.embedCached(text,script,{language,source:returned.source});return script;}
  if(strict){
   const parts=this.gal?.hooks?.piecedTranslation?.(text);
   if(parts?.text&&!parts.machine&&!parts.filled){returned.source='patch';return parts.text;}
   if(!script&&this.gal?.hooks?.scriptAllowed?.()!==false)return this.embedCached(text,undefined,{language,returned,verified:true})||'';
   return '';
  }
  return this.embedCached(text,undefined,{language,returned})||'';
 }
 recordTranslation(role,result,index){
  if(!this.gameId||!index||result.target!=='zh')return;
  this.logVisibility({type:'translationReturned',game:this.gameId,...index,role,source:result.source||'unknown',provider:result.provider||''});
 }
 localChoice(text,target){
   const hooks=this.gal?.hooks;
   if(target==='en'||hooks?.scriptAllowed?.()===false)return null;
   const track=hooks?.trackPairs?.get(text.replace(/\s+/g,''));
   if(track)return {text:track,source:'official'};
   const provider=hooks?.originalText;
   if(!provider)return null;
   let hit;
   if(provider.resolveChoice)hit=provider.resolveChoice(text);
   else{
    const position=provider.save?.();
    try{hit=provider.resolve(text);}finally{if(position!==undefined)provider.load?.(position);}
   }
   if(hit?.status!=='exact'||this.zeroLatencyEnabled(target)&&(hit.machine||hit.filled||['machine','filled'].includes(hit.source)))return null;
   const translation=hit.translation??(provider.kind==='original'?hit.captured:'');
   return typeof translation==='string'&&translation.trim()&&
    !require('./original-text.cjs').japaneseLine(translation)&&translation!==text?
    {text:translation,source:hit.machine?'machine':hit.filled?'filled':provider.kind==='original'?'official':'patch'}:null;
  }
 async choiceTranslations(request){
  const texts=request.items;
  if(!Array.isArray(texts)||texts.length>12||texts.some(t=>typeof t!=='string'||!t.trim()||t.length>4000))throw Error('INVALID_READER_TEXT');
  const options=this.requestOptions(request),target=this.targetLanguage(options),hooks=this.gal?.hooks;
  const token=this.choiceRequest={},generation=this.visualGeneration,index=hooks?.originalText?.translationIndex;
  const current=()=>this.choiceRequest===token&&this.gal?.hooks===hooks&&this.visualGeneration===generation&&this.active()&&target===this.targetLanguage();
  const rows=texts.map(text=>{try{return this.localChoice(text,target);}catch{return null;}});
  if(rows.some(Boolean)&&rows.includes(null)&&current()){
   this.emit('reader-event',{type:'call',method:'deliverChoiceTranslations',args:[request.request,{target,rows:rows.slice()}]});
  }
  await Promise.all(texts.map(async (text,index)=>{
   if(rows[index])return;
   try{const r=await this.chainTranslate(text,options,{current});rows[index]={text:r.text,source:r.source,provider:r.provider};}
   catch{rows[index]={text:'',source:'unavailable'};}
  }));
  if(!current()||hooks?.originalText?.translationIndex!==index)return {target,rows:[]};
  for(const row of rows)this.recordTranslation('choice',{...row,target},index);
  return {target,rows};
 }
 async translate(request,returned={}){const options=this.requestOptions(request),cacheLanguage=this.targetLanguage(options);const text=String(request.text||'');if(!text.trim()||text.length>4000)throw Error('INVALID_READER_TEXT');const pageKey=request.pageKey;if(!pageKey)this.latest=request.id;const generation=this.visualGeneration,stillBound=()=>this.active()&&this.visualGeneration===generation;const current=()=>stillBound()&&(pageKey?this.pageScope===pageKey:this.latest===request.id);const gameId=this.gameId;
  const local=this.localTranslation(text,cacheLanguage,returned);if(local)return local;
  try{const r=await this.chainTranslate(text,options,{id:request.id,current,foreground:()=>request.id===(pageKey?this.pagePriorities?.get(pageKey)?.id:this.latest)});if(!stillBound())return '';Object.assign(returned,{source:r.source,provider:r.provider,...(r.cached&&{cached:true})});if(gameId)this.stats.translation(gameId,text,r.text);this.embedCached(text,r.text,{language:cacheLanguage,source:r.source,provider:r.provider});/* 2026-11-21 (owner, 千恋＊万花 r34: lines the patch did not pair got their fallback translation 1 to 8 s later, after the reader had moved on, and it was dropped): a late answer still fills the line wherever it is shown (on screen, the page's earlier lines, the log) */if(!current()&&r?.text)try{this.compositorText(text,r.text,cacheLanguage);this.emit('reader-event',{type:'call',method:'deliverBackfill',args:[text,r.text,'late',{target:cacheLanguage,source:r.source,provider:r.provider}]});}catch{}return r.text;}
  catch(error){if(stillBound())this.translationRetries().add(text,{gameId,options});throw error;}}
 /* One translation per line: a later, better answer replaces the compositor's copy too, so the overlay row and the compositor never show two different translations of one sentence (#1128) */
 compositorText(text,translation,language){try{if(this.active()&&language===this.targetLanguage()&&translation)this.gal?.compositor?.text?.(String(text||''),translation);}catch{}}
 /* One line through the fallback chain (services/translation-chain.cjs). options: the reader's resolved options. */
 async chainTranslate(text,options,{id=null,current:previous=()=>true,foreground,quiet=false}={}){if(!this.active())throw Error('READER_DISABLED');const current=()=>this.active()&&previous();const requestLanguage=this.targetLanguage(options),cacheLanguage=requestLanguage;const chain=require('./translation-chain.cjs');this.loadKeys();
  let localInstalled=false;try{localInstalled=!!this.runtime.local().status().installed&&this.runtime.models().status().models.some(m=>m.installed);}catch{}
  const strict=this.zeroLatencyEnabled(requestLanguage);
  const profiles=strict&&this.folder?readJSON(path.join(this.folder,'translation-profiles.json')):{};
  const list=chain.candidates(options,{hasKey:base=>this.translator().hasKey(base,''),localInstalled,apiFirst:strict,profiles});
  // Keep the owner's configured APIs and models ahead of the reviewed fallback.
  // Only use it for the exact Japanese line in the original 2003 Saya script.
  const hooks=this.gal?.hooks;
  let reviewed;
  if(strict&&hooks?.originalText?.sayaPageLine&&hooks.scriptAllowed?.()!==false){
   reviewed=require('./original-engines/fill.cjs').lookup(text)?.zh;
   if(reviewed&&hooks.originalText.sayaPageLine(text,true)===text){
    const mt=list.findIndex(o=>chain.isMt(o.provider));
    list.splice(mt<0?list.length:mt,0,{provider:'filled'});
   }
  }
  let cachedProvider;
  const generation=this.visualGeneration,game=this.gameId;
  return chain.translate(text,list,async o=>{
   if(o.provider==='filled')return reviewed;
   const opts={...o,translationPrompt:this.workPrompt||'',learnerLanguage:requestLanguage,...(quiet?{detached:true}:{})};
   // Reuse an exact MT answer only after all higher-ranked providers have been tried.
   const key=strict&&chain.isMt(o.provider)?JSON.stringify([game,requestLanguage,o.provider,text]):null;
   if(key&&this.strictMtCache?.has(key)){cachedProvider=o.provider;return this.strictMtCache.get(key);}
   if(chain.isLocal(opts.provider))await this.localReady(opts,id,current);
   const value=normalizeTranslation(await this.translator().translate(text,opts,current,foreground));
   if(key&&value&&generation===this.visualGeneration&&game===this.gameId){
    this.strictMtCache??=new Map();this.strictMtCache.set(key,value);
    if(this.strictMtCache.size>800)this.strictMtCache.delete(this.strictMtCache.keys().next().value);
   }
   return value;
  },{isCurrent:current,budgetMs:strict?0:2500,trace:t=>{try{this.gal?.hooks?.trace?.(t);}catch{}},onLate:r=>{if(quiet||!this.active()||this.visualGeneration!==generation)return;this.embedCached(text,r.text,{language:cacheLanguage,source:r.source,provider:r.provider});this.compositorText(text,r.text,cacheLanguage);try{this.emit('reader-event',{type:'call',method:'deliverBackfill',args:[text,r.text,'better',{target:cacheLanguage,source:r.source,provider:r.provider}]});}catch{}}}).then(r=>{if(r.provider==='filled')return {...r,source:'filled',provider:''};if(cachedProvider===r.provider)r.cached=true;/* E415 (user: 提示用户是微软机翻): said once per reader session when machine translation stood in for the chosen engine */if(r.source==='mt'&&!chain.isMt(options.provider)&&!this.mtNoticed){this.mtNoticed=true;this.emit('reader-event',{type:'call',method:'mtNotice',args:[]});}return r;});}
 /* The reader's own options (preferences, display language, work prompt) */
 baseOptions(language){const options=this.requestOptions();return language?{...options,learnerLanguage:language}:options;}
 translationRetries(){return this.retryQueue??=new(require('./translation-chain.cjs').Retries)((text,c)=>{
  const options=c.options||this.requestOptions(),target=this.targetLanguage(options);
  if(c.gameId!==this.gameId)return null;
  if(this.zeroLatencyEnabled(target)){const origin={},hit=this.localTranslation(text,target,origin);if(hit)return {text:hit,...origin};}
  return this.chainTranslate(text,options,{current:()=>c.gameId===this.gameId});
 },(text,r,c)=>this.fillTranslation(text,r,c));}
 /* A translation that came late: the cache, the dialogue log (reading_events, never as a group pairing) and the line on screen */
 fillTranslation(text,r,{gameId,options}={}){if(!this.active())return;this.embedCached(text,r.text,{language:this.targetLanguage(options),source:r.source,provider:r.provider});this.compositorText(text,r.text,this.targetLanguage(options));if(gameId)try{const source=r.source==='official'?'official':['patch','script','group'].includes(r.source)?'group':'machine';this.stats.translation(gameId,text,r.text,source);}catch{}this.emit('reader-event',{type:'call',method:'deliverBackfill',args:[text,r.text,r.source,{target:this.targetLanguage(options),source:r.source,provider:r.provider}]});}
 async invoke(command,args={}){if(!this.active())throw Error('READER_DISABLED');
  if(command.startsWith('plugin:sql|'))return require('./legacy-reader-sql.cjs').request(this.root,command,args,{sentenceTranslation:text=>this.sentenceTranslation(text,this.embedCached(text)||'')});
  if(command==='word_states'){const forms=Array.isArray(args.forms)?[...new Set(args.forms.filter(v=>typeof v==='string'&&v.length<=100))].slice(0,200):[];if(!forms.length)return [];const db=openStore(this.root);try{return db.prepare('SELECT id,spelling,reading,status FROM vocabulary WHERE spelling IN ('+forms.map(()=>'?').join(',')+')').all(...forms);}finally{db.close();}}
  if(['tokenize_text','lookup_exact','lookup_at_position','scan_sentence'].includes(command)){if(typeof args.text!=='string'||args.text.length>4000)throw Error('INVALID_READER_TEXT');const result=await this.runtime.learning().request(command,args,this.prefs().learnerLanguage||'zh',{names:true});return result;}
  if(command==='get_settings')return {...require('./settings.cjs').nativeDefaults,...readJSON(path.join(this.folder,'native-preferences.json'))};
  if(command==='save_settings'){const safe={};for(const[k,v]of Object.entries(args.settings||{}))if(!/key|password|secret|token/i.test(k))safe[k]=v;atomic(path.join(this.folder,'native-preferences.json'),{...readJSON(path.join(this.folder,'native-preferences.json')),...safe});return safe;}
  throw Error('UNKNOWN_READER_COMMAND');
 }
 async message(r){if(!this.active())return {replies:[]};
  const replies=[],reply=(method,...args)=>replies.push({method,args}),g=this.gal;
  if(!r||typeof r!=='object')throw Error('INVALID_REQUEST');
  switch(r.type){
   case 'lookupViewed':{const surface=typeof r.surface==='string'?r.surface.trim():'';if(!surface||surface.length>100||typeof r.operationId!=='string'||!/^[a-z0-9-]{8,100}$/i.test(r.operationId))throw Error('INVALID_LOOKUP');require('./torch-local-trial.cjs').feedback(this,r);const now=Date.now();if(this.lastLookup?.surface!==surface||now-this.lastLookup.time>2000){this.lastLookup={surface,time:now};const line=typeof this.lastLine==='string'&&this.lastLine.replace(/\s+/g,'').includes(surface)?this.lastLine.replace(/\s+/g,''):'';const t=line?this.sentenceTranslation(line,this.embedCached(line)||''):{};require('./unknown-words.cjs').recordLookup(this.root,{surface,gameId:this.gameId,operationId:r.operationId,sentence:line,translation:t.translation||'',translationSource:t.translationSource||''});}break;}
   case 'loadPreferences':reply('restoreSettings',this.prefs());break;
   case 'loadGalPreferences':reply('restoreGalSettings',{...(g?.preferences||require('../core/game-style.js').clean()),translationPrompt:this.workPrompt||''});reply('workTranslationPrompt',this.workKey||'',this.workPrompt||'');reply('galStatus',{...g?.state,type:'restore'});reply('learningStatus',this.runtime.learning().status());break;
   case 'learningRequest':try{const result=r.engine==='unidic'&&r.result?(r.command==='tokenize_text'?this.runtime.learning().readings.resolve(this.runtime.learning().withNames(r.result)):this.runtime.learning().adaptResult(r.result,r.language)):await this.runtime.learning().request(r.command,r.args,r.language||this.prefs().learnerLanguage||'zh',{names:true});reply('learningDeliver',r.id,result,'');}catch(e){reply('learningDeliver',r.id,null,e.message);}break;
   case 'galReadings':reply('deliverReadings',r.id,this.runtime.learning().readings.resolve(r.tokens||[]));break;
   /* Alt+T 外观 → 危险区: the same reset and undo as Settings → 数据与备份 (services/settings-reset.cjs) */
   case 'settingsReset':case 'settingsResetUndo':{try{const lib=require('./settings-reset.cjs'),result=r.type==='settingsReset'?lib.reset(this.root):lib.undo(this.root,String(r.id||''));for(const scope of ['text','panels'])try{await this.runtime.settingsSaved?.({scope});}catch{}reply('restoreSettings',this.prefs());reply(r.type==='settingsReset'?'settingsResetDone':'settingsResetUndone',result.id);this.runtime.emit?.('reader-event',{type:'settings-reset'});}catch(e){reply('settingsResetFailed',String(e.message||e));}break;}
   case 'sentenceSave':case 'sentenceDelete':case 'sentenceState':{/* 收藏这一句: the reader sends the line it shows; the game is the one this reader is attached to */const text=String(r.text||''),lib=require('./saved-sentences.cjs'),db=openStore(this.root);try{const args={gameId:this.gameId,text,translation:String(r.translation||''),source:'manual'};const result=r.type==='sentenceSave'?lib.save(db,args):r.type==='sentenceDelete'?lib.remove(db,args,{root:this.root}):lib.state(db,args);/* 2026-11-13 the clean game picture of this moment, when one matches (sentence-scenes.cjs; async, never blocks the save) */if(r.type==='sentenceSave'&&result.id){require('./sentence-scenes.cjs').attach(this,result.id);/* 2026-11-15 its game voice (saved-line-voice.cjs; async) */require('./saved-line-voice.cjs').attach({root:this.root,reader:this},result.id,text);}reply('sentenceState',text,!!result.saved,'',!!result.created);if(r.type!=='sentenceState')this.runtime.emit?.('reader-event',{type:'sentence-saved'});}catch(e){reply('sentenceState',text,false,e.message);}finally{db.close();}break;}
   case 'sentenceDisplayObservation':this.sentenceMarks?.displayed(this.gameId,r);break;
   case 'cardinalPairPolicy':{const result=require('../core/cardinal/tape.cjs').pairPolicy(r,this.cardinalTarget());if(result)reply('cardinalPairScope',result);break;}
   case 'cardinalPair':{const accepted=require('../core/cardinal/tape.cjs').pairObserved(r,this.cardinalTarget());if(accepted)require('./torch-local-trial.cjs').feedback(this,r);this.logVisibility({type:'layoutDiagnostic',kind:'cardinalPair',episode:String(r.episode||'').slice(0,80),scope:String(r.scope||'').slice(0,80),target:String(r.target||'').slice(0,35),observed:r.observed===true,paired:r.paired===true,accepted});break;}
   case 'choiceTranslations':{const result=await this.choiceTranslations(r);reply('deliverChoiceTranslations',r.request,result);break;}
   case 'pageTranslationScope':this.pageScope=String(r.key||'').slice(0,100);break;
   // Priority updates may arrive before the page scope or after a later row is visible.
   case 'pageTranslationCurrent':{const key=String(r.key||'').slice(0,100),revision=r.revision;
    if(!key||!Number.isSafeInteger(revision)||revision<=(this.pagePriorities?.get(key)?.revision||0))break;
    this.pagePriorities??=new Map();this.pagePriorities.delete(key);
    this.pagePriorities.set(key,{revision,id:Number.isSafeInteger(r.currentId)?r.currentId:null});
    if(this.pagePriorities.size>8)this.pagePriorities.delete(this.pagePriorities.keys().next().value);
    break;}
   case 'galSource':if(typeof r.text==='string'&&r.text.length<=4000){this.translator().observeSource(r.text);g?.send({type:'source',text:r.text});}break;
   case 'layoutDiagnostic':/* E407: where the line was drawn against the game's text (ruby rows, offsets, hide state) */{const v={};for(const [k,x]of Object.entries(r))if(k!=='type'&&Object.keys(v).length<40&&(typeof x==='number'&&Number.isFinite(x)||typeof x==='boolean'||typeof x==='string'&&x.length<=200))v[k]=x;this.logVisibility({type:'layoutDiagnostic',...v});}break;
   case 'perfDiagnostic':try{const file=path.join(this.root,'logs','reader-perf.log');logSink.append(file,JSON.stringify({at:new Date().toISOString(),...r})+'\n',{rotate:1<<20,rotateSuffix:'.1'});}catch{}break;
   case 'pointerDiagnostic':try{const file=path.join(this.root,'logs','reader-pointer.log');if(fs.existsSync(file)&&fs.statSync(file).size>1<<20)fs.renameSync(file,file+'.1');fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),...r})+'\n');}catch{}break;
   case 'galConfigure':case 'galPreview':if(!g||r.gameStyleKey&&r.gameStyleKey!==g.styleSync.profileKey)break;{const settings={...r.settings,gameProcess:g.preferences.gameProcess,gameExecutable:g.preferences.gameExecutable,bindEnabled:g.preferences.bindEnabled};settings.maskModeSource=settings.maskMode==='local'?(g.preferences.maskMode==='local'?g.preferences.maskModeSource:'user'):'';/* a Japanese font changed in the settings = the user's own choice from now on */if(settings.japaneseFont==='@game'){settings.japaneseFont=g.preferences.japaneseFont;settings.japaneseFontSource='game';}else settings.japaneseFontSource=settings.japaneseFont!==undefined&&settings.japaneseFont!==g.preferences.japaneseFont?'user':(settings.japaneseFontSource||g.preferences.japaneseFontSource);r.type==='galConfigure'?g.save(settings):g.preview(settings);if(r.type==='galConfigure'&&r.settings?.japaneseFont==='@game'){const values=this.followGameFont();if(values)this.emit('reader-event',{type:'enginePreferences',values});}}break;
   case 'galPreviewEnd':g?.endPreview?.();/* 2026-11-16 Alt+T (user recording: the text went away after closing the menu): the page dropped back to the snapshot it took when the menu opened, stale against the host (hook route, game font, calibrated box); closing hands it the host's own state */if(g)reply('restoreGalSettings',{...g.preferences,translationPrompt:this.workPrompt||''});break;
   case 'galWindows':g?.send({type:'windows'});break;
   case 'galBind':if(!/^\d{1,19}$/.test(r.hwnd||''))throw Error('INVALID_GAME_WINDOW');require('./bind-hotkey.cjs').bindWindow(this,{hwnd:r.hwnd,title:r.title,processName:r.processName},r.settings,e=>this.emit('reader-event',e));break;
   case 'galPickWindow':g?.send({type:'pickWindow',active:r.active===true});break;
   case 'galUnbind':Reader.prototype.clearGameVisuals.call(this);this.visualIdentity='';this.translator().clearContext();g?.save({...g.preferences,bindEnabled:false});this.stats.reset();break;
   case 'galMenu':/* opening and closing the menu both freeze every inferred hide/show (core/immersion.cjs), whatever the bridge reports */if(r.open===true)this.immersion?.context(false);this.immersion?.menu?.(r.open===true);g?.send({type:'menu',open:r.open===true});break;
   case 'galLookup':g?.send({type:'lookup',open:r.open===true});break;
   case 'galBacklogHotkey':g?.send({type:'backlogHotkey',modifiers:Number(r.modifiers)|0,key:Number(r.key)|0});break;
   case 'galWheelDecision':if(Number.isSafeInteger(r.id))g?.send({type:'wheelDecision',id:r.id,panel:r.panel===true,panelUp:r.panelUp===true});break;
   case 'galFloatDrag':if([r.x,r.y].every(Number.isFinite))g?.send({type:'floatDrag',x:r.x,y:r.y});break;
   case 'galHitRegions':{
    const validRect=x=>x&&[x.x,x.y,x.width,x.height].every(Number.isFinite);
    if(!Array.isArray(r.regions)||r.regions.length>256||!r.regions.every(validRect))break;
    const grip=r.lookupGrip,lookupGrip=validRect(grip?.area)&&Array.isArray(grip.controls)&&grip.controls.length<=64&&grip.controls.every(validRect)?grip:null;
    g?.send({type:'hitRegions',regions:r.regions,menuOpen:r.menuOpen===true,lookupDrag:Number.isSafeInteger(r.lookupDrag)?r.lookupDrag:0,lookupGrip});break;
   }
   case 'galGlass':if(Array.isArray(r.rects)&&r.rects.length<=16&&r.rects.every(x=>[x.x,x.y,x.width,x.height].every(Number.isFinite)))g?.send({type:'glass',rects:r.rects,radius:Number(r.radius)||18});break;
   case 'galToggleCover':g?.send({type:'toggleCover'});break;
   case 'galToggleMode':g?.send({type:'toggleMode'});break;
   case 'galShutdown':this.stop();break;
   case 'hookPrefs':if(r.settings?.hookHide===true&&this.gameExe){require('./text-effects.cjs').clear(this.root,this.gameExe);/* 重新校准: a stepped-down game records its first window again */try{const live=require('./self-check-live.cjs'),cur=live.current();if(cur&&live.choose(cur)?.mode==='read')live.recalibrate(this);}catch{}}g?.setHookPrefs(r.settings);break;
   case 'galTextEffects':/* text-place.js: this game's text effect leaves most lines unpaired; read mode for this exe, remembered */if(this.gameExe&&g&&!g.textEffectsHold&&!this.seedKeepsHide(this.gameExe,'reader',r)){require('./text-effects.cjs').set(this.root,this.gameExe,{paired:Number(r.paired)||0,orphan:Number(r.orphan)||0});this.logVisibility({type:'readModeHint',reason:'text-effects',paired:Number(r.paired)||0,orphan:Number(r.orphan)||0});g.textEffects(true);}break;case 'compositorRuby':g?.compositor?.ruby?.(String(r.text||''),Array.isArray(r.ruby)?r.ruby:[]);break;
   case 'hookStart':g?.userStart(r.profile,r.force===true,r.id);break;
   case 'hookReselect':
    if(r.onlyIfBad===true)g?.reselectStream?.(true);
    else if(g)g.hooks.reprobeText();
    else reply('galStatus',{hookReselectState:'unbound'});
    break;
   /* 2026-11-21 (owner: 「再加个兜底的检测有没有译文，没有的话就再查赶紧补上」): the reader's translation guard asks for a line still without a
      translation by its text. A visible line also supplies its serial for queue priority. The answer can still fill an earlier row. */
   case 'translateGuard':{const text=String(r.text||'');if(!text.trim()||text.length>4000)break;const tr=x=>{try{g?.hooks?.trace?.('translation guard '+x+' '+JSON.stringify(text.slice(0,24)));}catch{}};
    const generation=this.visualGeneration,current=()=>this.active()&&this.visualGeneration===generation;
    const serial=Number.isSafeInteger(r.visibleSerial)?r.visibleSerial:null;
    // The guard can be the first request to reach the host for the visible line.
    if(serial!==null&&serial>this.latest)this.latest=serial;
    const foreground=serial===null?undefined:()=>this.latest===serial;
    (async()=>{const cacheLanguage=this.targetLanguage();const returned={};let t=this.localTranslation(text,cacheLanguage,returned);
     if(t){tr('fill cache');}else{tr('retry chain');try{const result=await this.chainTranslate(text,this.baseOptions(cacheLanguage),{current,foreground});if(!current())return;t=result.text;Object.assign(returned,{source:result.source,provider:result.provider});if(t)this.embedCached(text,t,{language:cacheLanguage,...returned});}catch(e){if(current())tr('still-missing '+String(e?.message||e).slice(0,40));}}
     if(t&&current())this.emit('reader-event',{type:'call',method:'deliverBackfill',args:[text,t,'guard',{target:cacheLanguage,...returned}]});})();break;}
   case 'engineGiveWay':g?.hooks?.giveWay?.(r.ms);break; /* 2026-11-21: a hidden line the reader cannot draw goes back to the game */
   case 'hookSelect':g?.hooks.select(r.id,true);break;
   case 'hookCheck':g?.controller.check();break;
   case 'readerReading':this.immersion?.reading?.();break;
   case 'hookRescan':g?.hooks.rescan();break;
   case 'hookReplacementConfirm':g?.hooks.confirmReplacement();break;
   case 'gameStyleProfileRequest':g?.styleSync.replay();break;
   case 'gameStyleCaptureReady':g?.styleSync.captureReady(r.id);break;
   case 'gameStyleSync':if(!r.key||r.key===g?.styleSync.profileKey)g?.controller.beginStyleSync(true,r.part,r.owner);break;
   case 'gameStyleCancel':if(!r.key||r.key===g?.styleSync.profileKey)g?.controller.finishStyleSync(false,true);break;
   case 'gameStyleConfirm':
    if(r.key===g?.styleSync.profileKey&&g?.styleSync.saveProfile(r.prefs,['text','position'].includes(r.part)?r.part:'all',r.key,r.map,r.saveId)){
     try{this.saveWorkPrompt(r.workKey,r.translationPrompt);}catch{reply('workPromptSaveFailed');}
    }break;
   case 'gameStyleUpdate':g?.styleSync.updateProfile(r.prefs||{});break;
   case 'textPosMapSave':if(r.key)g?.styleSync.savePositionMap(r.map,r.key);break;
   case 'gameStyleImportList':g?.styleSync.status('importList',{gameStyleImportList:g.styleSync.savedWorks()});break;
   case 'gameStyleImportPreview':if(r.key===g?.styleSync.profileKey){const part=r.part==='position'?'position':'text',found=g.styleSync.importFrom(String(r.source||''),part);g.styleSync.status('importPreview',{gameStyleImportPart:part,gameStyleImportSource:String(r.source||''),gameStyleImportPrefs:found?.prefs||null,gameStyleImportMap:found?.map||null});}break;
   case 'gameUiScan':{
    if(this.gameUiScan){reply('gameUiScanResult',null,'GAME_UI_SCAN_BUSY');break;}
    const pid=g?.state.gameProcessId,hwnd=g?.state.gameHwnd;
    this.gameUiScan=true;
    try{
     const items=await require('../core/game-ui.cjs').scanGameUi(g?.layout||{},g?.state,this.overlayPid);
     if(pid!==g?.state.gameProcessId||hwnd!==g?.state.gameHwnd)throw Error('GAME_UI_TARGET_CHANGED');
     this.gameUiPreview={pid,hwnd,items};reply('gameUiScanResult',items,'');
    }catch(error){reply('gameUiScanResult',null,error.message);}finally{this.gameUiScan=false;}
    break;
   }
   case 'gameUiPreview':{
    const current=this.gameUiPreview;if(current&&current.pid===g?.state.gameProcessId&&current.hwnd===g?.state.gameHwnd)g.send({type:'gameUi',items:current.items,preview:true});
    break;
   }
   case 'gameFontFollow':{const values=this.followGameFont();if(values)this.emit('reader-event',{type:'enginePreferences',values});reply('restoreGalSettings',{...g?.preferences});break;}
   case 'gameFontsLoad':reply('gameFonts',this.fonts?.payload(true));break;
   case 'gameFontsRescan':if(this.gamePid)await this.confirmGameFont('rescan',{force:true});break;
   case 'gameFontsApply':if(this.fonts?.current?.status==='ready'){const fonts=this.fonts.current.fonts,prefs={...g.preferences};for(const[lang,key]of [['ja','japaneseFont'],['zh','chineseFont']]){const f=fonts.find(f=>f.lang===lang);if(f)prefs[key]='game:'+f.id;}g.save(prefs);this.fonts.markApplied();reply('restoreGalSettings',prefs);}break;
   case 'configure':{let success=true,error='';try{const {resolveOptions}=require('../core/providers.cjs'),options=resolveOptions(r);if(options.provider!=='google'&&!require('../core/engines.cjs').ENGINES[options.provider]?.keyless)this.loadKeys();require('../core/translation-settings.cjs').saveTranslationSettings(r,{resolveOptions,service:this.translator(),secrets:{set:(baseUrl,apiKey)=>new Settings(this.root).saveKey({provider:options.provider,baseUrl,apiKey})},persist:settings=>atomic(path.join(this.folder,'preferences.json'),{...readJSON(path.join(this.folder,'preferences.json')),...cleanPreferences(settings)})});}catch(e){success=false;error=e.message;}reply('configured',success,error,r.configureId??null);/* E545 */if(success)this.refreshTextSource({force:false});break;}
   case 'learningSettings':atomic(path.join(this.folder,'preferences.json'),{...readJSON(path.join(this.folder,'preferences.json')),...cleanPreferences(r.settings)});break;
   case 'nativeSettings':await this.invoke('save_settings',{settings:r.settings});break;
   case 'v4':try{reply('v4Deliver',r.id,await this.v4(r.action,r.args||{}),'');}catch(e){reply('v4Deliver',r.id,null,e.message);}break;
   case 'revealProgress':this.immersion?.reveal(r.text,r.typing);break;
   case 'lookupCancel':this.lookup++;this.lookupTranslation=(this.lookupTranslation||0)+1;/* the selection's translation is dropped with its card: queued attempts skip (Codex #1175) */break;
   case 'lookupExplain':{const serial=++this.lookup;try{const main=this.prefs(),models=require('../core/lookup-models.cjs'),context=['context','summary','explain'].includes(r.mode);this.loadKeys();const keyed=o=>this.translator().hasKey(o.baseUrl,o.provider),options=context?models.contextOptions(main,main,keyed):models.lookupOptions(main,main);if(!options)throw Error('LOOKUP_MODEL_REQUIRED');if(options.provider==='moji'){const selection=[...r.args.text].slice(r.args.start,r.args.end).join('').trim();const entries=await require('./moji-dictionary.cjs').lookupMoji(selection,fetch,{root:this.root});const text=entries.slice(0,4).map(e=>[[e.spelling,e.reading].filter(Boolean).join('  '),e.definition].filter(Boolean).join('\n')).join('\n\n')||'MOJi 辞書里没有找到「'+selection+'」';if(this.lookup===serial)reply('lookupDeliver',r.id,{text,kind:'moji',provider:'moji'},'');break;}this.loadKeys();const local=await this.invoke('lookup_exact',r.args);let result;try{const ask=o=>this.translator().lookup({selection:[...r.args.text].slice(r.args.start,r.args.end).join(''),sentence:r.args.text,entries:local.entries,morphology:local.morphology,mode:r.mode},o,()=>this.lookup===serial);try{result=await ask(options);}catch(first){/* #1117: the context source ran out of quota or hit a limit while the translation API the player bound is a different one: ask that one, the same API as the translations */const bound=context?models.boundModel(main,keyed):null;if(bound&&(bound.provider!==options.provider||bound.baseUrl!==options.baseUrl)&&/额度不足|请求过快/.test(String(first?.message)))result=await ask(bound);else throw first;}}catch(e){if(context&&/key|401|403|unauthori|密钥|未配置|missing/i.test(String(e.message)))throw Error('CONTEXT_KEY_REQUIRED');throw e;}if(this.lookup===serial)reply('lookupDeliver',r.id,result,'');}catch(e){reply('lookupDeliver',r.id,null,e.message);}break;}
   /* 2026-11-26 (QQ #1139: a phrase selected by dragging or a long press was looked up but never translated) the selection goes
      through the same translation chain as the lines (the user's engine, then the fallbacks), quietly: no line cache, no late
      backfill, no context entry */
   case 'lookupTranslate':{const serial=this.lookupTranslation=(this.lookupTranslation||0)+1;try{const selection=[...String(r.args?.text||'')].slice(Number(r.args?.start)||0,Number(r.args?.end)||0).join('').trim();if(!selection||[...selection].length>400)throw Error('选区为空或过长');const result=await this.chainTranslate(selection,this.requestOptions(),{current:()=>this.lookupTranslation===serial,quiet:true});if(this.lookupTranslation===serial)reply('lookupDeliver',r.id,{text:String(result?.text||''),kind:'translation',source:result?.source||'',provider:result?.provider||''},'');}catch(e){reply('lookupDeliver',r.id,null,e.message);}break;}
   case 'lookupConfigure':try{const clean=require('../core/lookup-models.cjs').cleanLookup(r.settings);for(const[name,key]of Object.entries(r.keys||{}))if(key)new Settings(this.root).saveKey({provider:name==='deepseek'?'deepseek':'gpt',baseUrl:clean.lookupProfiles[name]?.baseUrl,apiKey:key});atomic(path.join(this.folder,'preferences.json'),{...readJSON(path.join(this.folder,'preferences.json')),...clean});reply('lookupConfigured','');}catch(e){reply('lookupConfigured',e.message);}break;
   case 'keyStatus':{const result={};for(const[name,options]of Object.entries(r.targets||{}).slice(0,20)){try{this.loadKeys();const resolved=require('../core/providers.cjs').resolveOptions(options);result[name]=resolved.provider==='google'||this.translator().hasKey(resolved.baseUrl,resolved.provider);}catch{result[name]=false;}}reply('keyStatus',result);break;}
   case 'dictStatus':reply('dictStatus',{databases:require('../core/dict-check.cjs').quickStatus(require('../core/layout.cjs').reading),installing:!!this.runtime.learning().installing});break;
   case 'dictCheck':{const check=require('../core/dict-check.cjs');const results=await check.fullCheck(require('../core/layout.cjs').reading,data=>this.emit('reader-event',{type:'call',method:'dictCheckProgress',args:[data]}));reply('dictCheckResult',results.map(r=>({...r,missingCount:r.missing.length,badCount:r.bad.length,missing:r.missing.slice(0,20),bad:r.bad.slice(0,20)})));break;}
   case 'dictRepair':this.runtime.learning().install(true,true,Array.isArray(r.only)?r.only.filter(x=>['sudachi','unidic'].includes(x)):null).catch(()=>{});break;
   case 'learningInstall':this.runtime.learning().install(true).catch(()=>{});break;
   case 'galMaskLoaded':case 'galMaskError':if(Number.isSafeInteger(r.id)&&r.id===g?.lastFrameId){const count=Number.isSafeInteger(r.count)&&r.count>=0&&r.count<=4000?r.count:0;g.notify({maskMessage:r.type==='galMaskLoaded'?(r.provisional?'遮罩预览已加载：':'遮罩图片已加载：')+count+' 块原文小区域':'阅读层无法解码遮罩图片，请查看状态诊断'});}break;
   default:if(Number.isSafeInteger(r.id)){this.latest=r.id;if(r.disabled!==undefined)break;const generation=this.visualGeneration,stillBound=()=>this.active()&&this.visualGeneration===generation;/* ② the compositor draws the Japanese itself: furigana from the shared rule (game ruby in the line, then dictionary-settled readings) */if(g?.compositor&&g.preferences?.furigana!==false&&r.text)require('./example-ruby.cjs').exampleRuby(null,this.runtime.learning(),[{text:String(r.text)}]).then(x=>{const it=x?.items?.[0];if(stillBound()&&it?.spans?.length)g.compositor?.ruby?.(it.text,it.spans.map(sp=>[sp.start,sp.end,String(sp.reading||'')]));}).catch(()=>{});try{const target=this.targetLanguage(this.requestOptions(r)),returned={},p=g?.hooks?.originalText,translated=await this.translate(r,returned);
    if(!stillBound())break;
    if(this.gal===g&&p===g?.hooks?.originalText&&p?.matchedBody?.(r.text))this.recordTranslation('body',{...returned,target},p.translationIndex);/* ② the compositor draws this translation beside / instead of the line */if(this.active()&&target===this.targetLanguage())g?.compositor?.text(String(r.text||''),translated);reply('deliver',r.id,translated,false,'',{target,...returned});}catch(e){if(stillBound())reply('deliver',r.id,'',true,e.message);}}else throw Error('UNKNOWN_READER_ACTION');
  }
  return {replies:this.active()?replies:[]};
 }
 async v4(action,args){
  const config=this.runtime.config();
  if(action==='markSentence'){if(!this.sentenceMarks)throw Error('SENTENCE_EXPIRED');return this.sentenceMarks.mark(this.root,this.gameId,args);}
  if(action==='load')return config;
  if(action==='configure'){atomic(path.join(this.folder,'v4-preferences.json'),{...readJSON(path.join(this.folder,'v4-preferences.json')),...require('../core/v4-config.cjs').cleanV4(args)});this.immersion?.configure(this.runtime.config());const current=this.runtime.config();this.gal?.send({type:'dialogConfig',scene:current.immersion===true,auto:current.immersion===true,active:current.immersion&&current.dialogDetection==='visual',marker:current.immersion&&current.dialogDetection==='marker'});this.gal?.setGameAudio(this.runtime.config().ankiGameMedia!==false);return this.runtime.config();}
  const mapped={modelStatus:'model_status',modelDownload:'model_download',modelCancel:'model_cancel',runtimeDownload:'runtime_download',runtimeCancel:'runtime_cancel',speakers:'speakers',speakersCached:'speakers_cached',preview:'speech_preview'};
  if(mapped[action])return this.runtime.call({action:mapped[action],...args});
  if(action==='backgroundGet'){const image=require('./assets.cjs').get(this.root,args.slot==='game'?'panels':'home');if(image||args.slot==='game')return {image};
   /* The home page shows its built-in background when none is chosen; the in-game panels follow the home background, so
      they get the same picture instead of nothing (user, 2026-11-09: the three panels turned fully transparent). */
   let prefs={};try{prefs=JSON.parse(fs.readFileSync(path.join(this.root,'data','preferences.json'),'utf8'))||{};}catch{}
   if(prefs.homeBackground===''&&prefs.defaultBackground110)return {image:''};
   try{const file=path.join(this.root,'web','assets',prefs.theme==='light'?'default-background-light.webp':'default-background-dark.webp');return {image:'data:image/webp;base64,'+fs.readFileSync(file).toString('base64'),builtIn:true};}catch{return {image:''};}}
  if(action==='backgroundSet')return require('./assets.cjs').set(this.root,args.slot==='game'?'panels':'home',args.path);
  if(action==='backgroundPeek')return {image:require('./assets.cjs').preview(args.path)};
  if(action==='backgroundClear')return require('./assets.cjs').clear(this.root,args.slot==='game'?'panels':'home');
  if(action==='gameFrame'){const image=await this.gal?.gameFrame();return {image:image?'data:image/jpeg;base64,'+image:''};}
  if(action==='ankiScreenshot'){
   if(config.ankiGameMedia===false)return {};
   /* 2026-11-14: the card picture is the game window's own surface only, never MeguLit's text box or lookup card */
   const image=await this.gal?.gameFrame();
   if(!image)return {};
   const id=require('node:crypto').randomUUID();
   /* #115: a picture taken when the lookup card opens is used when + Anki is clicked later, so keep a few for 3 min */
   this.cardScreenshots??=new Map();for(const [k,v] of this.cardScreenshots)if(v.expires<=Date.now())this.cardScreenshots.delete(k);while(this.cardScreenshots.size>=4)this.cardScreenshots.delete(this.cardScreenshots.keys().next().value);
   this.cardScreenshots.set(id,{id,image,expires:Date.now()+180000});
   return {id};
  }
  if(action==='mojiFacts')return await require('./moji-dictionary.cjs').cachedFacts(String(args.word||''),String(args.reading||''),{root:this.root}).catch(()=>null);
  if(action==='modelDelete')return this.runtime.models().remove(String(args.id));
  if(action==='runtimeDelete')return this.runtime.local().remove();
  if(action.startsWith('voicePack')){
   const pack=this.voicePack??=new(require('../core/voice-pack.cjs').VoicePack)();
   const refresh=async()=>{await this.runtime.services().stopSpeech();try{await this.runtime.services().ensureSpeech(config.aivisUrl,config.aivisGpu);this.runtime.services().rememberSpeakers(await this.runtime.speech().speakers(config));}catch{}};
   if(action==='voicePackStatus')return pack.status();if(action==='voicePackInstall')return args.uuid?pack.startOne(String(args.uuid),refresh):pack.start(refresh);if(action==='voicePackCancel')return pack.cancel(String(args.uuid||''));if(action==='voicePackRemove'){await this.runtime.services().stopSpeech();try{return pack.remove(String(args.uuid||''));}finally{await refresh();}}
  }
  if(action==='calibrate'){this.gal?.send({type:'dialogCalibrate',...args});return {pending:true};}
  if(action==='ankiStats'){
   const {pickEntry}=require('./anki-sync.cjs'),linked=new Set((Array.isArray(args.linked)?args.linked:[]).map(Number)),notes=await new(require('../core/anki.cjs').Anki)().stats(config);let resolved=0;
   for(const note of notes){if(linked.has(note.noteId)||!note.word||resolved>=300)continue;resolved++;try{const text=note.word,result=await this.runtime.learning().request('lookup_exact',{text,start:0,end:[...text].length},'zh'),entry=pickEntry(result.entries,text,note.reading);if(entry)note.entry={id:entry.id,spellings:entry.spellings||[],readings:entry.readings||[],definitions:entry.definitions||(entry.definition_groups||[]).map(g=>g.text),pos:entry.pos||[]};}catch{}}
   return notes;
  }
  if(action==='unityFontStatus')return (this.unityFont??=new(require('../core/unity-font.cjs').UnityFont)(this.root)).status();
  if(action==='unityFontDownload')return (this.unityFont??=new(require('../core/unity-font.cjs').UnityFont)(this.root)).download();
  if(action==='localeStatus')return this.runtime.library().locale.status(true);
  if(action==='localeInstall')return this.runtime.library().locale.install();
  if(action==='ankiStatus')return new(require('../core/anki.cjs').Anki)().status(config);
  if(action==='ankiFind')return {path:this.findAnki()};
  if(action==='ankiLaunch'){
   const anki=new(require('../core/anki.cjs').Anki)();try{const status=await anki.status(config);await this.runtime.ankiProcess().show();return {running:true,...status};}catch{}
   const exe=this.findAnki();if(!exe)throw Error('ANKI_EXECUTABLE_MISSING');const child=require('node:child_process').spawn(exe,[],{cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:false});child.on('error',()=>{});child.unref();
   for(let i=0;i<40;i++){await new Promise(resolve=>setTimeout(resolve,750));try{return {launched:true,...await anki.status(config)};}catch{}}throw Error('ANKI_OFFLINE');
  }
  if(['word','speak','prefetch','anki'].includes(action)){
   const captured=action==='anki'&&typeof args.screenshotId==='string'&&this.cardScreenshots?.get(args.screenshotId);
   const screenshot=captured&&captured.expires>Date.now()?captured.image:'';
   if(captured)this.cardScreenshots.delete(args.screenshotId);
   // The dictionary page's Anki button comes here too (args.dictionary): it is no game text, so no game names.
   const word=await this.runtime.learning().word(args,args.entryId,{names:!args.dictionary}),reading=this.gal?.gameRuby?.dict(this.gal?.styleSync?.profileKey)?.[word.surface];if(reading){word.reading=reading;word.ambiguous=false;word.pitch=[];}
   if(args.pitchChoice!==undefined){if(!word.pitch.includes(args.pitchChoice))throw Error('INVALID_PITCH');word.pitch=[args.pitchChoice];}
   /* 2026-11-15 学习 › 词典 「加入 Anki」 (args.dictionary): the same card, made from a dictionary entry outside the game. The card's
      sentence is the example the page passes (a MOJi example, or none), never the word itself; no game picture or game voice is taken,
      and no example line or saved sentence is written to the word book */
   if(args.dictionary){word.sentence=String(args.sentence||'').slice(0,1000);word.ambiguous=false;}
   if(action==='word')return word;let audio;
   if(['speak','prefetch'].includes(action)){await this.runtime.services().ensureSpeech(config.aivisUrl,config.aivisGpu);/* word.spoken: the whole number word the selection is part of (分 of 10分 says じゅっぷん, as the furigana shows) */const audio=await this.runtime.speech().synthesize(word.spoken?{...word,...word.spoken}:word,config,{prefetch:action==='prefetch'});return action==='prefetch'?{ready:true}:audio;}
   const picked=args.dictionary?{translation:String(args.translation||'').slice(0,1000),translationSource:args.translation?'dictionary':''}:this.sentenceTranslation(args.text,String(args.translation||'').slice(0,1000));args.translation=picked.translation;args.translationSource=picked.translationSource;const extra={aiNote:args.aiNote&&typeof args.aiNote.text==='string'?{kind:args.aiNote.kind==='summary'?'summary':'explain',text:args.aiNote.text.slice(0,2000)}:null,translation:picked.translation.slice(0,1000),translationSource:picked.translationSource,gameTitle:args.dictionary?'':this.gameTitle()};if(!args.dictionary)try{const insights=require('./learning-insights.cjs'),learning=this.runtime.learning(),resolved=learning.readings.resolve(await learning.tokenize(args.text));let pairs=[];try{pairs=this.gal?.hooks?.resolveSource?.(args.text)?.ruby||[];}catch{}/* one rule for every example line (core/example-ruby.cjs): game ruby → dictionary reading, names and guesses bare */extra.sentenceHtml=require('../core/example-ruby.cjs').exampleCardHtml(args.text,resolved,{pairs,gameRuby:this.gal?.gameRuby?.dict(this.gal?.styleSync?.profileKey)||{},start:args.start,end:args.end});void insights;}catch{}
   if(config.ankiGameMedia!==false&&!args.dictionary){
    const media=await this.gal?.gameMedia(args.text,Date.now(),false).catch(()=>null);
    extra.screenshot=screenshot;
    /* E454 (player: the card's voice carried long stretches of BGM): the voice file the script names for this line comes
       first, it is the clean voice alone; the clip recorded from the game's sound (trimmed to the spoken run) is next,
       then one kept while the game ran */
    let voice=null;try{voice=require('./game-voice.cjs').find(this.root,args.text);}catch{}
    const asAudio=v=>({data:v.data.toString('base64'),ext:require('./game-voice.cjs').kind(v.data).ext});
    if(voice?.source==='scan'){extra.sentenceAudio=asAudio(voice);extra.gameAudio=true;}
    /* 2026-11-15 (user: 有的例句和原配音不一致) a clip cut from the game sound only when the script does not say the line is
       unvoiced (or a piece of a voiced line) and its length fits the text; else the card gets the synthesized sentence */
    else if(media?.audio&&(()=>{try{return require('./game-voice.cjs').recordedFits(this.root,args.text,media.audio.data);}catch{return false;}})()){extra.sentenceAudio=media.audio;extra.gameAudio=true;extra.recorded=true;}
    else if(voice){extra.sentenceAudio=asAudio(voice);extra.gameAudio=true;}
    try{logSink.append(path.join(this.root,'logs','reader-host.log'),JSON.stringify({at:new Date().toISOString(),type:'ankiGameAudio',matched:!!media?.matched,recording:!!media?.recording,voiced:!!media?.audio,error:media?.error||''})+'\n');}catch{}
   }
   if(config.ankiAudio){
    const speechReady=await this.runtime.services().ensureSpeech(config.aivisUrl,config.aivisGpu).then(()=>true,()=>false);
    if(speechReady){
     try{audio=await this.runtime.speech().synthesize(word,config);}catch{}
     if(!extra.sentenceAudio&&(!args.dictionary||word.sentence))try{extra.sentenceAudio=await this.runtime.speech().synthesize({surface:args.dictionary?word.sentence:args.text,reading:'',pitch:[]},config);}catch{}
    }
   }
   await this.prepareMiningModel(config);const result=await new(require('../core/anki.cjs').Anki)(fetch,{mediaDir:require('../core/anki-media-cache.cjs').dirFor(this.root)}).sync(word,config,audio,extra);const entries=(await this.invoke('lookup_exact',args)).entries||[];const mined=await this.mine({entry:entries.find(e=>e.id===args.entryId)||entries[0],args:args.dictionary?{...args,text:''}:args,noteId:result.id});if(mined)result.wordMined=true;if(mined?.sentenceSaved)result.sentenceSaved=true;
   if(config.ankiGameMedia!==false&&!args.dictionary&&!result.screenshotAttached)result.mediaWarning='SCREENSHOT_UNAVAILABLE';
   result.sentenceAudioSource=extra.gameAudio?'game':extra.sentenceAudio?'synthesized':'';
   /* E455 a recorded clip on the card is replaced by its voice alone once separated (same media file name, so the
      card keeps pointing at it); the card is not held up while the model runs */
   if(extra.recorded&&config.ankiVoiceIsolate!==false&&extra.sentenceAudio?.data){const data=extra.sentenceAudio.data,name='tomoyo_g_'+require('node:crypto').createHash('sha256').update(data).digest('hex').slice(0,16)+(extra.sentenceAudio.ext||'.wav');
    require('./vocal-sep.cjs').isolate(this.root,data).then(async clean=>{if(!clean)return;let out=clean.toString('base64');/* (user 2026-11-12) no voice left once the music is gone: the line is unvoiced, so the card speaks it */if(require('../core/voice-trim.cjs').quiet(clean)){try{await this.runtime.services().ensureSpeech(config.aivisUrl,config.aivisGpu);const s=await this.runtime.speech().synthesize({surface:args.text,reading:'',pitch:[]},config);if(s?.data){out=s.data;/* plays on the synthesized-sentence channel */const mc=require('../core/anki-media-cache.cjs');mc.markSynth(mc.dirFor(this.root),name);}}catch{}}return new(require('../core/anki.cjs').Anki)(fetch,{mediaDir:require('../core/anki-media-cache.cjs').dirFor(this.root)}).call(config,'storeMediaFile',{filename:name,data:out});}).then(done=>{if(done!==undefined)try{logSink.append(path.join(this.root,'logs','reader-host.log'),JSON.stringify({at:new Date().toISOString(),type:'ankiVoiceIsolated',file:name})+'\n');}catch{}}).catch(()=>{});
    result.voiceIsolation=require('./vocal-sep.cjs').ready(this.root)?'pending':'preparing';}
   return result;
  }
  throw Error('UNKNOWN_LEARNING_ACTION');
 }
 async prepareMiningModel(config){
  if(!['MeguLit','ToMe','tomoyo_megumin'].includes(config.ankiModel))return;
  const key=JSON.stringify([config.ankiUrl,config.ankiModel]);if(this.miningModelReady===key)return;
  const anki=new(require('../core/anki.cjs').Anki)();const models=await anki.call(config,'modelNames');
  if(models.includes(config.ankiModel))await require('./anki-model.cjs').removeManagedReading(this.root,config,anki);else await anki.prepareModel(config);
  this.miningModelReady=key;
 }
 gameTitle(){if(!this.gameId)return '';const db=openStore(this.root);try{return db.prepare('SELECT title FROM games WHERE id=?').get(this.gameId)?.title||'';}catch{return '';}finally{db.close();}}
 findAnki(){return this.runtime.ankiProcess().find();}
 findAnkiLegacy(){const env=process.env;for(const file of [this.runtime.config().ankiPath,...[env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs'),env.ProgramFiles,env['ProgramFiles(x86)']].filter(Boolean).map(folder=>path.join(folder,'Anki','anki.exe'))])if(file&&fs.existsSync(file)&&fs.statSync(file).isFile())return file;return '';}
 async mine({entry,args,noteId}){if(!entry?.id)return;const db=openStore(this.root);try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT OR IGNORE INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,0,?,?)').run(entry.id,entry.spellings?.[0]||entry.readings?.[0]||'',entry.readings?.[0]||'',JSON.stringify(entry.definitions||[]),Math.floor(Date.now()/1000),JSON.stringify({entry,noteId}));if(args?.text&&!require('./saved-sentences.cjs').findExample(db,entry.id,args.text,this.gameId))db.prepare('INSERT INTO examples(word_id,game_id,text,translation,highlight_start,highlight_end,created_at,original) VALUES(?,?,?,?,?,?,?,?)').run(entry.id,this.gameId,args.text,args.translation||'',args.start||0,args.end||0,Math.floor(Date.now()/1000),JSON.stringify({translationSource:args.translationSource||(args.translation?'machine':''),readAt:Math.floor(Date.now()/1000)}));require('./anki-sync.cjs').link(db,Number(entry.id),Number(noteId));/* every Anki card leaves its line in 学习 → 句子 (source auto; a manual save stays manual) */let kept=null;if(args?.text)try{kept=require('./saved-sentences.cjs').save(db,{gameId:this.gameId,text:args.text,translation:args.translation||'',source:'auto'});}catch{}db.exec('COMMIT');if(kept?.id){require('./sentence-scenes.cjs').attach(this,kept.id);require('./saved-line-voice.cjs').attach({root:this.root,reader:this},kept.id,args.text);}if(kept?.created)this.runtime.emit?.('reader-event',{type:'sentence-saved'});return {sentenceSaved:!!kept?.created};}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}}
 stop(){
  try{require('../core/owner-tests.cjs').revokeFor(this.root);}catch{}
  if(this.stopping)return this.stopping;
  Reader.prototype.clearGameVisuals.call(this);this.visualIdentity='';
  this.closed=true;++this.latest;++this.lookup;this.pageScope='';this.gamePid=null;this.hotkeyBind=null;clearInterval(this.tick);clearTimeout(this.hideTimer);
  // Keep failed teardown resources out of the live reader, but reachable for another stop.
  const gal=this.gal||this.stoppingGal,child=gal?.process;this.stoppingGal=gal;this.gal=null;
  const stops=[()=>this.translation?.clearContext?.(),()=>this.retryQueue?.clear(),()=>this.stats.reset(),()=>gal?.send?.({type:'unbind'}),()=>gal?.stop(),()=>require('../core/owned-exit.cjs').trackStop(this,child)];
  const result=Promise.allSettled(stops.map(async stop=>stop())).then(results=>{const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;this.stoppingGal=null;this.stopError=null;this.stopFailed=false;});
  this.stopping=result;result.then(()=>{if(this.stopping===result)this.stopping=null;},error=>{this.stopError=error;this.stopFailed=true;if(this.stopping===result)this.stopping=null;});return result;
 }
}
module.exports={Reader,notJapanese};
