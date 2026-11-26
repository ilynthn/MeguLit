'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const cardinalTape=require('./cardinal/tape.cjs');

const { clean: cleanGal } = require('./game-style.js');
const { HookNative } = require('./hook-native.cjs');
const {HookControl}=require('./hook-control.cjs');
const {GameStyleSync}=require('./game-style-sync.cjs');const {GameRuby}=require('./game-ruby.cjs');
class GalNative {
  // layout: { native, config, hook, ... } from layout.cjs
  constructor(layout, overlayPid, onEvent, spawnNative = spawn) {
    this.layout = layout; this.folder = layout.config; this.onEvent = onEvent; this.state = { bound: false }; this.lastFrameId = 0;
    this.gameRuby=new GameRuby(layout.config);
    this.styleSync=new GameStyleSync(layout,m=>{if(m.gameStyleState==='profile'&&m.gameStyleKey&&m.gameStyleEffectivePrefs){this.previewPreferences=null;
      if(m.gameStyleSavedAt&&this.preferences.hookFast!==false&&!(this.controller?.styleCalibration&&this.controller.styleManual)){
        if(this.controller?.styleCalibration)this.controller.finishStyleSync(false,true);
        this.hooks.preflight=false;
      }
      this.save({...this.preferences,...require('./game-profile.js').followFont(m.gameStyleEffectivePrefs)});}this.onEvent(m);if(m.gameStyleState==='measured')this.controller?.finishStyleSync(true);else if(['unavailable','timeout','unmatched'].includes(m.gameStyleState))this.controller?.finishStyleSync(false);});this.styleSync.overlayPid=overlayPid;
    this.preferences = this.read();this.state.hookProfile=this.preferences.hookProfile;
    this.hooks=new HookNative(layout,message=>this.hookEvent(message));/* Text architecture ②: setting textRenderer=compositor draws the game's text in a captured frame (core/compositor-host.cjs) */this.compositor=new(require('./compositor-host.cjs').CompositorHost)({root:require('node:path').dirname(layout.native||''),onEvent:m=>{if(m?.type==='compositorState'&&m.state==='gameClosed'){this.rebindProcess(true);return;}if(m?.type==='compositorConv'){this.hooks.send?.({type:'glyphConv',ok:m.ok===true});this.hooks.trace?.('conv source '+(m.ok?'confirmed':'rejected')+' by the compositor');return;}this.onEvent(m);}});/* overlay placement (2026-11-14): the reader draws the text at the sources' character boxes */this.placement=new(require('./overlay-placement.cjs').OverlayPlacement)({hidden:l=>{if(this.hooks){this.hooks.onHiddenChoices??=items=>this.placement?.hiddenChoices?.(items);this.hooks.placedHidden?.(l.text,l);}},replaced:()=>this.hooks?.originalReplaced?.()===true,blanking:()=>this.hooks?.glyphBlanking?.()===true,skipping:()=>this.hooks?.drawSkipping?.()===true,root:require('node:path').dirname(layout.native||''),trace:t=>this.hooks?.trace?.(t),send:m=>{/* names and choices are drawn by the overlay too: glyph-dots extra lines (blank + boxes) while placement is on */if(m.type==='textPlaceMode'&&!m.on)this.locateHost?.stop();if(m.type==='textPlaceMode')try{this.hooks.setGlyphExtras?.(m.on?{names:true}:{names:false,choices:[]});}catch{}if(m.type==='placeChoiceBoxes'){if(m.items.length)this.hooks.choiceBoxes?.(m);else if(!this.hooks.state.hookChoices?.scriptGroup)this.hooks.notify?.({hookChoices:null});return;}this.onEvent(m);}});/* GetGlyphOutline engines: their text position learned from glyph-dots' locating marks (core/glyph-locate-host.cjs) */{const {GlyphLocateHost}=require('./glyph-locate-host.cjs');let exePid=0,exe='';this.locateHost=new GlyphLocateHost({root:require('node:path').dirname(layout.native||''),hooks:this.hooks,frame:()=>this.rawFrame(),trace:t=>this.hooks.trace?.(t),exe:()=>{const pid=Number(this.state.gameProcessId)||0;if(pid!==exePid){exePid=pid;exe='';if(pid)require('./game-fonts.cjs').exePath(pid).then(p=>{if(exePid===pid)exe=String(p||'');}).catch(()=>{});}return exe;}});this.placement.locator=(t,n)=>this.locateHost.layout(t,n);}this.hooks.ownTextFn=()=>!!this.placement?.wanted(this.preferences);this.hooks.compositedFn=()=>!!this.compositor?.wanted(this.preferences);this.hooks.choiceReaderAllowed=()=>this.state.bound&&this.preferences?.choiceOverlay!==false&&!this.compositor?.cc;
    this.hooks.locateChoices=(options,scriptGroup)=>{if(scriptGroup){
      clearTimeout(this.choiceWait);
      // Keep the game's actionable glyphs intact while the reader obtains their coordinates.
      if(this.placement?.on&&this.hooks.choiceReaderAllowed())this.hooks.setGlyphExtras({names:true,choices:[]});
      this.locateChoicesOcr(options);return;
    }/* placement: the options are pushed to MeguLitFont as extra lines (blank + boxes); their boxes replace the OCR locate (OCR would find blank buttons). Engines that never report option boxes fall back to the locate after 600 ms */if(this.placement?.on&&typeof this.hooks.setGlyphExtras==='function'){try{this.hooks.setGlyphExtras({names:true,choices:options});}catch{}if(!options.length)return;clearTimeout(this.choiceWait);this.choiceWait=setTimeout(()=>{if(!this.placement?.choicesPlaced)this.locateChoicesOcr(options);},600);this.choiceWait.unref?.();return;}this.locateChoicesOcr(options);};this.locateChoicesOcr=options=>{this.compositor?.choices(options);/* the compositor owns the game's text: no overlay menu */if(this.compositor?.cc)return;if(this.state.bound&&this.preferences?.choiceOverlay!==false)this.send({type:'choiceLocate',options});else this.hooks.trace?.('choice locate skipped: '+(this.state.bound?'turned off':'reader not bound'));};this.hooks.locate=text=>{if(this.state.bound&&this.preferences?.pageLocate!==false)this.send({type:'pageLocate',text});};this.hooks.artLocate=text=>{/* 2026-11-15 (user: 「ocr遮挡给我关了」) art text (OCR-located translations drawn over the picture) only when switched on */if(this.state.bound&&this.preferences?.artText===true)this.send({type:'pageLocate',text,art:true});};this.artScanTimer=setInterval(()=>this.artScan(),700);this.artScanTimer.unref?.();this.controller=new HookControl(this);this.hooks.onRemembered=()=>this.controller.remembered();this.controller.plan=this.preferences.hookProfile;this.controller.running=this.preferences.hookProfile!=='off';this.hooks.preflight=!['read','off'].includes(this.preferences.hookProfile)&&(this.preferences.hookFast===false||this.preferences.autoGameStyle!==false);
    if(this.preferences.hookAutoStart){this.preferences={...this.preferences,hookHide:true,hookProfile:this.preferences.hookProfile==='off'?'read':this.preferences.hookProfile};this.controller.plan=this.preferences.hookProfile;this.controller.running=true;}
    Object.assign(this.state,this.hookPrefs());
    // Start every launch in the normal (home) interface; Alt+M switches to the translation window.
    if(this.preferences.interfaceMode!=='normal'){this.preferences={...this.preferences,interfaceMode:'normal'};try{fs.writeFileSync(path.join(this.folder,'gal-preferences.json'),JSON.stringify({...this.preferences,translationPrompt:undefined},null,2));}catch{}}
    let exe = path.join(layout.native, 'GalWindowBridge.exe');
    const pending=path.join(layout.native,'GalWindowBridge.updated.exe');
    if(fs.existsSync(pending)){try{fs.copyFileSync(pending,exe);fs.unlinkSync(pending);}catch{exe=pending;}}
    if (!fs.existsSync(exe)) { this.state.message = '窗口组件缺失，请完整解压新版启动包'; return; }
    this.process = spawnNative(exe, [String(overlayPid),...(layout.overlayHwnd?[String(layout.overlayHwnd)]:[])], { cwd: layout.native, windowsHide: true, stdio: ['pipe','pipe','ignore'] });
    this.process.on('error', () => this.notify({ message: '窗口绑定组件无法启动，自动注音仍可使用' }));
    this.process.stdin.on('error', () => {});
    createInterface({ input: this.process.stdout }).on('line', line => {
      if(this.stopped)return;let message; try { message = JSON.parse(line); } catch { return; }
      /* Cardinal's tape: the session's bridge records, in memory, for the replay after the session (core/cardinal/tape.cjs) */
      cardinalTape.record('gwb',message);
      if(message.type==='hookVisual'){this.controller.visual(message);return;}
      if(message.type==='readerPointer'||message.type==='hostFrame'||message.type==='readerContext'||message.type==='layerState'||message.type==='layerRaise'){this.onEvent(message);return;}
      if(message.type==='clientShot'){const pending=this.mediaPending?.get('c'+message.id);if(pending){this.mediaPending.delete('c'+message.id);pending(message);}return;}
      if(message.type==='sceneShot'){const pending=this.mediaPending?.get('s'+message.id);if(pending){this.mediaPending.delete('s'+message.id);pending(message);}return;}
      if(message.type==='rawFrame'){const pending=this.mediaPending?.get('r'+message.id);if(pending){this.mediaPending.delete('r'+message.id);pending(message);}return;}if(message.type==='sceneFrame'||message.type==='sceneProbe'){const key=(message.type==='sceneFrame'?'f':'p')+message.id,pending=this.mediaPending?.get(key);if(pending){this.mediaPending.delete(key);pending(message);}return;}
      if(message.type==='mediaClip'){const pending=this.mediaPending?.get(String(message.id));if(pending){this.mediaPending.delete(String(message.id));pending(message);}return;}
      if (message.type === 'ready') { this.artScanKey='';this.onEvent(message);this.send({ type: 'configure', ...this.preferences });this.send({type:'gameAudio',enabled:!!this.gameAudioWanted}); this.notify({ hotkey:message.hotkey, coverHotkey:message.coverHotkey, modeHotkey:message.modeHotkey, coverEnabled:message.coverEnabled, message:message.hotkey?'全局 Alt+T 已就绪，可选择并绑定游戏窗口':'全局 Alt+T 被占用，可在 ToMe 窗口内按 Alt+T' }); return; }
      if(['normal','translation'].includes(message.interfaceMode)){if(this.pending)this.pending.interfaceMode=message.interfaceMode;this.save({...this.preferences,interfaceMode:message.interfaceMode},false);}
      if (message.type === 'bound' && message.processName) {this.artScanKey='';this.state={...this.state,...message}; /* 2026-11-19 the full program path is remembered with the name, so a game of another folder with the same program name (BGI.exe) is never auto-bound to this record; an old record learns its path at the first bind */const prev=this.pending||this.preferences;this.save({ ...prev, gameProcess: message.processName, gameExecutable: String(message.gameExecutable||(prev.gameProcess===message.processName?prev.gameExecutable||'':'')), bindEnabled: true }, false); this.pending=null; }
      if(message.type==='error')this.pending=null;
      if(message.type==='hotkeyState'){/* E476: Alt+T taken back once another program let go */this.notify({hotkey:message.hotkey,coverHotkey:message.coverHotkey,modeHotkey:message.modeHotkey});this.onEvent(message);return;}
      if ((message.type === 'hotkey'||message.type==='bindHotkey')) { this.onEvent(message); return; }
      if (message.type === 'modeRequest' || message.type === 'backlogHotkey' || message.type === 'regionApplied' || message.type === 'readerInput') { this.onEvent(message); return; }
      if(message.type==='waitMarkerFrame'){this.onEvent(message);return;}
      if(message.type==='glassFrame'){this.onEvent(message);return;}
      if (message.type === 'maskFrame') { this.lastFrameId = message.id; this.onEvent(message); return; }
      // E306 OCR page locator (PageLocator.cs): sentence boxes go through the same page path as the native engines.
      if(message.type==='hookEngineLine'){this.hooks.pageLine?.(message);return;}
      if(message.type==='hookChoiceBoxes'){this.hooks.choiceBoxes?.(message);return;}
      if(message.type==='pageLocateStatus'){this.hooks.trace?.('ocr page '+message.status);return;}
      /* 2026-11-19 (素晴らしき日々: the opening quotes are pictures) what the art scan reads becomes a read-only line of the reader (hook-native ocrLine); drawing it over the picture stays with 文字图片翻译 (artText) */
      if(message.type==='artText'&&!this.state.gameProcessId)return;
      if(message.type==='artText'&&this.hooks.sayaOcrGroup(message))return;
      if(message.type==='artText'){if(this.preferences?.artText===true&&message.once!==true)this.onEvent(message);this.hooks.ocrLine(message);return;}
      if(message.type==='markerTarget'){this.hooks.markerTarget(message);this.onEvent({type:'markerDebug',markerDebug:message.active?`found at ${message.x},${message.y} ${message.width}x${message.height} in ${message.clientWidth}x${message.clientHeight}`:'not active'});return;}
      if (message.type === 'layout') { this.notify({ layout:message }); return; }
      this.notify(message);
    });
    this.process.on('exit', () => this.notify({ bound: false, message: '窗口绑定组件已退出，注音和翻译仍可使用' }));
  }
  read() { try { return cleanGal(JSON.parse(fs.readFileSync(path.join(this.folder, 'gal-preferences.json'), 'utf8'))); } catch { return cleanGal(); } }
  hookPrefs(){return {hookAutoStart:this.preferences.hookAutoStart,hookHide:this.preferences.hookHide,hookFast:this.preferences.hookFast,ocrReadLines:this.preferences.ocrReadLines!==false};}
  // The UI's copy of these can be stale, so the backend value always wins unless own=true.
  /* 2026-11-21 text effects (ファタモルガーナの館): the game's text effect cannot be hidden line by line, so for this game the original stays
     and MeguLit shows the translation only. In memory only: the saved 隐藏游戏原文 is kept for every other game; the user's own
     switch of 隐藏游戏原文 ends it (切回隐藏) */
  /* 2026-11-21 layered game profile (core/profiles/index.cjs profileFor): the running game's frozen settings reach the hook
     kernel (hook-native this.profile, trace 'profile <gameKey> engine=.. layers=..'), the overlay placement and, through the
     hook state (gameProfile), the reader (bootstrap.js window.MeguLitProfile). services/reader.cjs calls this once the program
     and library row are known, and with profileFor({}) when the game closes. */
  setGameProfile(profile,input){if(!profile||typeof profile!=='object')return;this.profile=profile;if(this.placement)this.placement.profile=profile;this.hooks?.setProfile?.(profile,input===undefined?null:input);if(profile.hide?.textEffectsRead===true&&!this.textEffectsHold)this.textEffects(true);}
  /* 2026-11-21 why: the self-check gate's reason (services/self-check-live.cjs), shown in Alt+T with 重新校准; '' = text effects */
  /* 2026-11-21 (owner): 读模式只由用户在设置 / Alt+T 里手动开关. No automatic path (the reader's or core's text-effects verdict,
     the self-check gate, a stored / shared / official calibration, a seed's mode=read or status=read, a cold-test verdict) changes
     the render mode any more: textEffects(true) only records the hint, logs it and asks Alt+T to show 「这部游戏可能有显示问题，可以
     手动切读模式」; textEffects(false) clears it. textEffectsHold stays null (no hookHide override). */
  textEffects(on,why=''){const was=this.readHint||null;if(on){if(was)return;this.readHint={why:String(why||''),at:Date.now()};try{this.hooks?.trace?.('read mode suggested, not switched'+(why?' ('+String(why).slice(0,80)+')':''));}catch{}}else{if(!was&&!this.textEffectsHold)return;this.readHint=null;if(this.textEffectsHold){const h=this.textEffectsHold.hookHide;this.textEffectsHold=null;this.preferences={...this.preferences,hookHide:h};this.controller.apply(true);}}this.notify({...this.hookPrefs(),textEffectsRead:false,readModeHint:!!on,readReason:on?String(why||''):''});}
  setHookPrefs(v){if(this.textEffectsHold&&typeof v?.hookHide==='boolean'){this.textEffectsHold=null;this.notify({textEffectsRead:false});}const next={...this.preferences};for(const k of ['hookAutoStart','hookHide','hookFast','ocrReadLines'])if(typeof v?.[k]==='boolean')next[k]=v[k];if(next.hookAutoStart&&!this.preferences.hookAutoStart&&typeof v?.hookHide!=='boolean')next.hookHide=true;const hideChanged=next.hookHide!==this.preferences.hookHide,autoOn=next.hookAutoStart&&!this.preferences.hookAutoStart;this.save(next,true,true);this.notify(this.hookPrefs());if(hideChanged||autoOn)this.controller.apply(true);}
  /* E337 (user 2026-11-10, 女装山脈: a stream decoded as garbage was picked, "文本流捕捉错了要加个手动刷新重新选取"): pick the
     stream whose sample reads as Japanese best, skipping the current one (and ones already skipped for this game run).
     onlyIfBad: called by 校准当前句; switches only when the current sample looks garbled. */
  static sampleScore(text){const s=String(text||'');if(!s.trim())return -1;const jp=(s.match(/[\u3040-\u30ff\u3400-\u9fff]/g)||[]).length,bad=(s.match(/[\uff61-\uff9f\u25a1\ufffd\ue000-\uf8ff]/g)||[]).length;return bad>=2&&bad>=jp*.15?-2:jp/Math.max(1,s.length)*Math.min(1,s.length/12)-bad*.2;}
  reselectStream(onlyIfBad=false){const threads=this.hooks?.state?.hookThreads||[],flow=this.hooks?.flowPage===true,score=t=>GalNative.sampleScore(t)+(flow&&!this.hooks.flowStory(t)?-5:0)+(require('./hook-native.cjs').HookNative.uiHelp(t)?-6:0)/* E350: a tooltip/menu-help stream is never picked, in any game *//* E349: on a flow page (WoH) a menu/hint stream is never the pick */,current=threads.find(t=>t.selected);
   if(flow&&onlyIfBad&&current&&!this.hooks.flowStory(current.sample)){this.hooks.flowStreamCheck(true);return {switched:true};}
   if(onlyIfBad&&(!current||score(current.sample)>-2))return {kept:true};
   const run=String(this.state?.gameProcessId||'')+'|'+String(this.state?.gameStarted||'');if(this.skippedRun!==run){this.skippedRun=run;this.skipped=new Set();}
   if(current)this.skipped.add(current.id);
   let next=threads.filter(t=>!this.skipped.has(t.id)&&t.sample&&score(t.sample)>-2).sort((a,b)=>score(b.sample)-score(a.sample))[0];
   if(!next&&!onlyIfBad){this.skipped=new Set(current?[current.id]:[]);next=threads.filter(t=>t.id!==current?.id&&t.sample&&!require('./hook-native.cjs').HookNative.uiHelp(t.sample)).sort((a,b)=>score(b.sample)-score(a.sample))[0];}
   if(!next){this.userStart('auto',false);return {restarted:true};}
   this.userStart('auto',false,next.id);return {selected:next.id,name:next.name};}
  userStart(profile,force,id){if(profile==='auto'){if(typeof id==='string'&&id.length<100)this.hooks.preferredThread=id;const c=this.controller;if(!this.preferences.hookHide){c.start('read');return;}if(['embed','euphoria474'].includes(c.plan))c.start('read');c.apply(true);return;}if(['embed','euphoria474'].includes(profile)||profile==='read'){const hide=profile!=='read';if(hide!==this.preferences.hookHide){this.preferences={...this.preferences,hookHide:hide};this.notify(this.hookPrefs());}}if(typeof id==='string'&&id.length<100)this.hooks.preferredThread=id;this.controller.start(profile,force);}
  save(value, configure = true, own = false) { if(this.stopped)return; if(!own&&this.preferences)value={...value,...this.hookPrefs()};/* 文字显示 (textRenderer) is app-wide: written by the settings page only, kept through the reader's own saves */if(value&&value.textRenderer===undefined){try{const cur=JSON.parse(fs.readFileSync(path.join(this.folder,'gal-preferences.json'),'utf8').replace(/^\uFEFF/,'')).textRenderer;if(cur)value={...value,textRenderer:cur};}catch{}}this.preferences = cleanGal(value);if(this.textEffectsHold)this.preferences={...this.preferences,hookHide:false};this.previewPreferences=null; const file=path.join(this.folder,'gal-preferences.json'),{translationPrompt,...global}=this.preferences;fs.writeFileSync(file+'.tmp',JSON.stringify(this.textEffectsHold?{...global,hookHide:this.textEffectsHold.hookHide}:global,null,2));fs.renameSync(file+'.tmp',file); if(configure)this.send({ type: 'configure', ...this.preferences });this.styleSync.configure(this.preferences,this.state);this.hooks.configure(this.preferences,this.state);this.compositor?.configure(this.preferences,this.state);this.placement?.configure(this.preferences,this.state); }
  preview(value) { if(this.stopped)return; /* 2026-11-16 Alt+T (user video, 死に逝く君、館に芽吹く憎悪): the route (hookProfile) belongs to HookControl; a page snapshot taken before the embed was restored sent 'read' back and switched embedding off */this.previewPreferences=cleanGal({...value,...this.hookPrefs(),hookProfile:this.preferences.hookProfile});this.send({type:'configure',...this.previewPreferences});this.hooks.configure(this.previewPreferences,this.state);this.compositor?.configure(this.previewPreferences,this.state);this.placement?.configure(this.previewPreferences,this.state);this.styleSync.configure(this.previewPreferences,this.state); }
  /* the Alt+T menu closed: its unsaved values are dropped, the saved preferences (the host's own state) apply again */
  endPreview() { if(this.stopped)return; if(!this.previewPreferences)return;this.previewPreferences=null;this.send({type:'configure',...this.preferences});this.hooks.configure(this.preferences,this.state);this.compositor?.configure(this.preferences,this.state);this.placement?.configure(this.preferences,this.state);this.styleSync.configure(this.preferences,this.state); }
  bind(hwnd, settings) { if(this.stopped)return; this.pending=cleanGal({...settings,...this.hookPrefs(),hookProfile:this.preferences.hookProfile}); this.send({ type:'bind',hwnd,settings:this.pending }); }
  send(message) { if(this.stopped&&message?.type!=='quit')return; if(message?.type==='configure')message=require('./scan-area.cjs').apply(message,this.hooks?.flowPage||undefined,this.state?.processName); if (this.process?.stdin.writable) this.process.stdin.write(JSON.stringify(message)+'\n'); }
  scriptReplacement() {
    return this.state?.bound && this.preferences.hookHide !== false &&
      this.controller?.plan !== 'off' && !(this.controller?.styleCalibration && this.controller.styleManual);
  }
  // A whitespace-only source is the embed's own replacement read back on a redraw (BGI writes spaces), never a line:
  // passing it on blanks the Japanese while the previous translation stays. '' keeps its meaning (text cleared).
  hookEvent(message){if(this.stopped)return;if(message.gameProfile&&typeof message.gameProfile==='object'&&message.gameProfile!==this.profile){this.profile=message.gameProfile;if(this.placement)this.placement.profile=message.gameProfile;}if(message.type==='hookTextPos'){if(message.color||message.style)this.styleSync?.evidence();this.placement?.hook(message);}if(message.type==='hookCharRects'&&message.color)this.styleSync?.evidence(); /* the engine side read its own glyph pixels: the window sampler stays off */if(message.type==='hookGpuPage'){this.placement?.page(message,{replaced:this.hooks?.originalReplaced?.()===true});return;}if(message.type==='hookGlyphExtra')this.placement?.extras(this.hooks.state?.hookGlyphExtras);if(message.type==='hookGlyphDots'||message.type==='hookCharRects'||message.type==='hookTextMarks'){this.compositor?.hook(message,this.hooks.state?.hookGlyphDots);this.placement?.hook(message);if(message.type==='hookGlyphDots'){if(this.placement?.on)this.locateHost?.onTable(this.hooks.state?.hookGlyphDots);this.placement?.glyph(this.hooks.state?.hookGlyphDots,this.hooks.sadisticPage && this.scriptReplacement() ? this.hooks.sadisticPage : null);}};if (this.hooks.sadisticPage && typeof message.hookSource === 'string') {
      if (message.hookSource && this.scriptReplacement()) {
        this.placement?.scriptRow(message.hookSource, this.hooks.sadisticPage,
          message.hookSequence, () => this.scriptReplacement() ? this.rawFrame() : null);
      } else this.placement?.endScriptRow();
    }
    if(typeof message.hookSource==='string'&&message.hookSource&&!message.hookSource.trim()){message={...message};delete message.hookSource;}if(message.type==='lineStyleSample'){this.styleSync?.evidence();this.onEvent(message);return;}if(message.type==='hookTextEffects'){/* core's count of lines the text effect broke (hook-native textEffectsJudge): read mode as galTextEffects */this.onEvent(message);return;}if(message.type==='hookTextPos'||message.type==='hookPage'||message.type==='hookDialog'||message.type==='hookFont'||message.type==='hookGameUi'||message.type==='hookEmbedRequest'||message.type==='hookDrawEmbed'||message.type==='hookDrawUi'||message.type==='hookPatchTranslation'){this.onEvent(message);return;}if(message.hookActive===false){message={...message,hookVisualVerified:false,hookCheckState:this.controller?.running?'waiting':'stopped'};this.send({type:'hookVerifyCancel'});}
    // Tag each live line read/unread (shown before in this game) so the reader can use the game's read-text colour.
    if(message.hookActive!==false&&typeof message.hookSource==='string'&&message.hookSource.trim()&&message.hookSourceOrigin!=='history'){const read=this.styleSync.readLine(message.hookSource);if(typeof message.hookSourceRead==='boolean')message={...message,hookSourceReadOrigin:'engine'};else if(typeof read==='boolean')message={...message,hookSourceRead:false,hookSourceReadOrigin:read?'tome-history-ignored':'tome-history'};} /* E407: MeguLit's own cross-run history is not the game's read flag (user: new game, unread lines in the read colour); only an engine-reported flag paints read, unknown = unread */
    // The game's own ruby readings, remembered per work: the page uses them for furigana and speech.
    if(typeof message.hookSource==='string'&&message.hookSource.trim()){const key=this.styleSync?.profileKey;if(this.gameRuby)message={...message,hookRubyDict:Array.isArray(message.hookSourceRuby)&&message.hookSourceRuby.length?this.gameRuby.learn(key,message.hookSourceRuby):this.gameRuby.dict(key)};}
    this.state={...this.state,...message};if(this.controller?.styleCalibration&&this.controller.styleIdentity!==String(this.state.gameProcessId||'')+'|'+String(this.state.gameStarted||''))this.controller.finishStyleSync(false,true);this.onEvent(message);
    // A script-confirmed pixel reading cannot establish that the native stream hid a line
    // or that the calibration preview can be dismissed.
    if(message.hookSourceEngine==='saya-page-ocr'&&message.hookSourceOrigin==='ocr')return;
    if(!this.hooks.streamProbe&&((Array.isArray(message.hookThreads)&&message.hookThreads.length)||Object.prototype.hasOwnProperty.call(message,'hookFramework')||message.hookReselectState==='recovered'))this.controller.apply();if(message.hookActive===true&&typeof message.hookSource==='string'&&!message.hookRecovering){if(message.hookSourceOrigin!=='history')this.rememberLine(message.hookSource);this.controller.source(message.hookSource);this.styleSync.observe(message.hookSource,message.hookSourceRead,message.hookSourceEngine);this.styleSync.lineStyle(message.hookSource,message.hookSourceOrigin!=='history',this.hooks.enabled===true&&this.hooks.preflight!==true);if(this.controller.styleAwaitLive&&message.hookSourceOrigin!=='history'&&this.hooks.enabled){this.controller.styleAwaitLive=false;this.onEvent({gameStylePreview:false});}}}
  /* Launcher-style games (a settings window first, then the game window in the same process): when the bound window goes
     away while its process lives on, bind that process again every 1.5 s for 20 s so its next main window is taken. Also
     called when the compositor sees its window close (the reader may still report the old window as bound). */
  rebindProcess(force=false){if(this.rebinding||this.stopped)return;const pid=Number(this.state.gameProcessId),hwnd=String(this.state.gameHwnd||'');let alive=false;try{process.kill(pid,0);alive=pid>0;}catch{}if(!alive)return;this.rebinding=true;let n=0;const again=()=>{if(this.stopped||++n>13||(this.state.bound===true&&(!force||String(this.state.gameHwnd||'')!==hwnd))){this.rebinding=false;return;}try{process.kill(pid,0);}catch{this.rebinding=false;return;}this.send({type:'bindProcess',pid:String(pid)});setTimeout(again,1500).unref?.();};setTimeout(again,800).unref?.();}
  notify(message) { if(this.stopped)return;const oldBound=this.state.bound,oldCover=this.state.coverEnabled,oldIdentity=this.state.gameStarted;this.state = { ...this.state, ...message };/* Launcher-style games (a settings window first, then the game window in the same process): when the bound window goes away while its process lives on, bind that process again for up to 20 s so its next main window is taken */if(oldBound===true&&message.bound===false)this.rebindProcess();if(message.gameStarted&&oldIdentity&&message.gameStarted!==oldIdentity){this.controller.baseline=false;this.controller.seq++;this.controller.stage='waiting';this.hooks.preflight=!['read','off'].includes(this.preferences.hookProfile)&&(this.preferences.hookFast===false||this.preferences.autoGameStyle!==false);this.send({type:'hookVerifyCancel'});if(this.preferences.hookAutoStart&&!this.preferences.hookHide){this.preferences={...this.preferences,hookHide:true};this.state={...this.state,hookHide:true};}}
    // The bound event carries the executable hash. Restore a confirmed style before the bridge selects its initial route.
    const savedKey = message.bound === true && typeof message.gameStyleKey === 'string' && message.gameStyleKey.toLowerCase();
    if (savedKey && !this.controller.styleCalibration && this.preferences.hookFast !== false &&
        this.preferences.hookHide === true && ['embed','euphoria474'].includes(this.preferences.hookProfile) &&
        this.styleSync.profiles?.[savedKey]?.textSavedAt) this.hooks.preflight = false;
    this.styleSync.configure(this.previewPreferences||this.preferences,this.state);
    const prefs=this.previewPreferences||this.preferences;
    this.hooks.configure(prefs,this.state);
    this.compositor?.configure(prefs,this.state);
    this.placement?.configure(prefs,this.state);
    if(message.type==='layout'&&message.clientWidth&&message.clientHeight)this.styleSync.resize(message.clientWidth,message.clientHeight); this.onEvent(message);if((typeof message.bound==='boolean'&&oldBound!==message.bound)||(typeof message.coverEnabled==='boolean'&&oldCover!==message.coverEnabled)){this.controller.modeChanged();this.controller.apply();} }
  // Anki: the game's own sound and picture. Lines are remembered with the time they arrived; a card's sentence is cut
  // from its line's start to the next line's start (or now) out of the bridge's in-memory recording of the game.
  setGameAudio(enabled){this.gameAudioWanted=!!enabled;this.send({type:'gameAudio',enabled:this.gameAudioWanted});}
  rememberLine(text){if(typeof text!=='string'||!text.trim())return;const lines=this.lines||(this.lines=[]);if(String(lines.at(-1)?.text||'').replace(/\s+/g,'')===text.replace(/\s+/g,''))return; /* E270: a re-sent line with other breaks is the same line */lines.push({text,at:Date.now()});this.keepVoice(lines.at(-2));try{this.onLine?.(text);}catch{}/* voice-harvest.cjs: line times for the game's own voice clips */if(lines.length>300)lines.splice(0,lines.length-300);}
  /* E450 runtime source of the game's own voice: when the next line arrives, the clip recorded for the line before it is
     handed to onLineVoice (game-voice.cjs keeps it for that line). Only with the game sound capture on. */
  keepVoice(line){if(!line||!this.gameAudioWanted||typeof this.onLineVoice!=='function'||line.voiceKept)return;line.voiceKept=true;const text=line.text;setTimeout(()=>{this.gameMedia(text,Date.now(),false).then(m=>{if(m?.matched&&m.audio?.data)this.onLineVoice(text,m.audio.data);}).catch(()=>{});},300).unref?.();}
  gameMedia(text,now=Date.now(),screenshot=true){const {spoken}=require('./island-source.js'),norm=v=>spoken(String(v||'')).replace(/<[^>]*>/g,'').normalize('NFKC').replace(/\s+/g,'');const lines=this.lines||[],want=norm(text);
   let i=want?lines.findLastIndex(line=>norm(line.text)===want):-1;
   if(i<0&&[...want].length>=6)i=lines.findLastIndex(line=>norm(line.text).endsWith(want));
   // The capture ring holds two minutes. Unmatched text can still take a screenshot,
   // but must not pick up dialogue from an unrelated line in the last few seconds.
   /* E270 (user, ATRI: the game voice was missing on a card): when the game sent the line twice, the clip started at the
      second copy, after the voice had played. Start from the first copy of a run. */
   while(i>0&&norm(lines[i-1].text)===norm(lines[i].text))i--;
   if(i>=0&&now-lines[i].at>=120000)i=-1;
   const from=i>=0?lines[i].at-450:now,to=i>=0?Math.min(lines[i+1]?.at??now,from+30000):now,id=String(++this.mediaSerial||(this.mediaSerial=1));
   return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete(id);resolve(null);},6000);timer.unref?.();
    map.set(id,m=>{clearTimeout(timer);/* E454 keep only the spoken run, not the music after it */let wav=i>=0&&m.voiced&&m.wav?m.wav:'';if(wav){try{const t=require('./voice-trim.cjs').trimWav(wav,lines[i].text,{carry:i>0});if(t)wav=t.data?t.data.toString('base64'):'';}catch{}}resolve({audio:wav?{data:wav}:null,screenshot:m.jpeg||null,matched:i>=0,recording:!!m.recording,error:m.audioError||''});});
    this.send({type:'mediaClip',id,from,to,screenshot});});}
  // Frosted-glass panels: a single frame of the game window only (ToMe's overlay is a separate window, not captured).
  /* 2026-11-12 one clean capture of the game window with its looks score and difference hash (scene-shots.cjs) */
  /* 2026-11-21 runtime sample (owner's screenshot policy): the whole client area, at its own size (kept on this PC) and scaled to a
     long edge of maxEdge px under maxBytes (the copy that may be uploaded); GalWindowBridge GameAudio.ClientShot */
  clientShot({maxEdge=960,maxBytes=150*1024}={}){const id=String(++this.mediaSerial||(this.mediaSerial=1));return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete('c'+id);resolve(null);},5000);timer.unref?.();map.set('c'+id,m=>{clearTimeout(timer);resolve(m.full&&m.small?{full:m.full,small:m.small}:null);});this.send({type:'clientShot',id,maxEdge,maxBytes});});}
  sceneShot(){const id=String(++this.mediaSerial||(this.mediaSerial=1));return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete('s'+id);resolve(null);},5000);timer.unref?.();map.set('s'+id,m=>{clearTimeout(timer);resolve(m.jpeg?{jpeg:m.jpeg,score:Number(m.score)||0,hash:String(m.hash||'')}:null);});this.send({type:'sceneShot',id});});}
  /* 2026-11-13 collected sentence pictures (services/sentence-scenes.cjs): sceneFrame = the whole clean frame as JPEG with the hash of
     its top 62% (asked only while the dialogue box is hidden); sceneProbe = that top hash of the frame on screen now, no picture */
  /* one lossless BGRA frame of the game window: {width,height,data} or null (placement locating, core/glyph-locate-host.cjs) */
  rawFrame(){const dir=require('node:path').join(this.layout.cache||require('node:os').tmpdir(),'glyph-locate');try{fs.mkdirSync(dir,{recursive:true});}catch{}const file=require('node:path').join(dir,process.pid+'-'+((this.rawSerial=(this.rawSerial||0)+1)%4)+'.megulit-frame');const id=String(++this.mediaSerial||(this.mediaSerial=1));return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete('r'+id);resolve(null);},5000);timer.unref?.();map.set('r'+id,m=>{clearTimeout(timer);if(!m.ok||!(m.width>0)||!(m.height>0)){resolve(null);return;}try{const data=fs.readFileSync(file);try{fs.unlinkSync(file);}catch{}resolve(data.length===m.width*m.height*4?{width:m.width,height:m.height,clientOrigin:m.clientOrigin,data}:null);}catch{resolve(null);}});this.send({type:'rawFrame',id,file});});}
  sceneFrame(){return this.sceneAsk('sceneFrame','f',m=>m.jpeg&&/^[0-9a-f]{16}$/.test(String(m.topHash||''))?{jpeg:m.jpeg,topHash:String(m.topHash),score:Number(m.score)||0}:null);}
  sceneProbe(){return this.sceneAsk('sceneProbe','p',m=>/^[0-9a-f]{16}$/.test(String(m.topHash||''))?{topHash:String(m.topHash)}:null);}
  sceneAsk(type,prefix,shape){const id=String(++this.mediaSerial||(this.mediaSerial=1));return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete(prefix+id);resolve(null);},5000);timer.unref?.();map.set(prefix+id,m=>{clearTimeout(timer);resolve(shape(m));});this.send({type,id});});}
  gameFrame(){const now=Date.now(),id=String(++this.mediaSerial||(this.mediaSerial=1));return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete(id);resolve('');},4000);timer.unref?.();map.set(id,m=>{clearTimeout(timer);resolve(m.jpeg||'');});this.send({type:'mediaClip',id,from:now,to:now,screenshot:true});});}
  /* 2026-11-12 art scan (OCR read path, PageLocator.Scan): on while the game is bound and no hook line is current; sent only when it changes */
  artScan(){if(this.stopped)return;/* 2026-11-19 OCR read lines: the scan also runs with artText off (ocrReadLines, default on), then only after 5 s without a hook line */const art=this.preferences?.artText===true,read=this.preferences?.ocrReadLines!==false;const s=this.state.bound===true&&(art||read)?this.hooks.artScanState(undefined,art?2000:5000):{on:false,dialog:'',speaker:'',band:false};if(!art)s.slow=true;const key=JSON.stringify(s);if(key===this.artScanKey)return;this.artScanKey=key;this.send({type:'artScan',...s});}
  stop() {
    if(this.stopping)return this.stopping;
    this.stopped=true;clearInterval(this.artScanTimer);clearTimeout(this.choiceWait);clearTimeout(this.controller?.styleTimer);
    const stops=[()=>this.compositor?.stop(),()=>this.locateHost?.stop(),()=>this.placement?.stop(),()=>this.styleSync?.stop(),()=>this.hooks.stop(),
      ()=>require('./owned-exit.cjs').trackStop(this,this.process,()=>{this.send({type:'quit'});this.process?.stdin.end();})];
    const result=Promise.allSettled(stops.map(async stop=>stop())).then(results=>{const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;this.stopError=null;});
    this.stopping=result;
    result.catch(error=>{this.stopError=error;if(this.stopping===result)this.stopping=null;});
    return result;
  }
}
module.exports = { cleanGal, GalNative };
