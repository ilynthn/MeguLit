'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const { clean: cleanGal } = require('./game-style.js');
const { HookNative } = require('./hook-native.cjs');
const {HookControl}=require('./hook-control.cjs');
const {GameStyleSync}=require('./game-style-sync.cjs');const {GameRuby}=require('./game-ruby.cjs');
class GalNative {
  // layout: { native, config, hook, ... } from layout.cjs
  constructor(layout, overlayPid, onEvent, spawnNative = spawn) {
    this.layout = layout; this.folder = layout.config; this.onEvent = onEvent; this.state = { bound: false }; this.lastFrameId = 0;
    this.gameRuby=new GameRuby(layout.config);
    this.styleSync=new GameStyleSync(layout,m=>{if(m.gameStyleState==='profile'&&m.gameStyleKey&&m.gameStyleEffectivePrefs){this.previewPreferences=null;this.save({...this.preferences,...require('./game-profile.js').followFont(m.gameStyleEffectivePrefs)});}this.onEvent(m);if(m.gameStyleState==='measured')this.controller?.finishStyleSync(true);else if(['unavailable','timeout','unmatched'].includes(m.gameStyleState))this.controller?.finishStyleSync(false);});this.styleSync.overlayPid=overlayPid;
    this.preferences = this.read();this.state.hookProfile=this.preferences.hookProfile;
    this.hooks=new HookNative(layout,message=>this.hookEvent(message));this.hooks.locateChoices=options=>{if(this.state.bound&&this.preferences?.choiceOverlay!==false)this.send({type:'choiceLocate',options});else this.hooks.trace?.('choice locate skipped: '+(this.state.bound?'turned off':'reader not bound'));};this.hooks.locate=text=>{if(this.state.bound&&this.preferences?.pageLocate!==false)this.send({type:'pageLocate',text});};this.hooks.artLocate=text=>{if(this.state.bound&&this.preferences?.artText!==false)this.send({type:'pageLocate',text,art:true});};this.artScanTimer=setInterval(()=>this.artScan(),700);this.artScanTimer.unref?.();this.controller=new HookControl(this);this.hooks.onRemembered=()=>this.controller.remembered();this.controller.plan=this.preferences.hookProfile;this.controller.running=this.preferences.hookProfile!=='off';this.hooks.preflight=!['read','off'].includes(this.preferences.hookProfile)&&(this.preferences.hookFast===false||this.preferences.autoGameStyle!==false);
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
      if(message.type==='hookVisual'){this.controller.visual(message);return;}
      if(message.type==='readerPointer'||message.type==='hostFrame'){this.onEvent(message);return;}
      if(message.type==='sceneShot'){const pending=this.mediaPending?.get('s'+message.id);if(pending){this.mediaPending.delete('s'+message.id);pending(message);}return;}
      if(message.type==='sceneFrame'||message.type==='sceneProbe'){const key=(message.type==='sceneFrame'?'f':'p')+message.id,pending=this.mediaPending?.get(key);if(pending){this.mediaPending.delete(key);pending(message);}return;}
      if(message.type==='mediaClip'){const pending=this.mediaPending?.get(String(message.id));if(pending){this.mediaPending.delete(String(message.id));pending(message);}return;}
      if (message.type === 'ready') { this.artScanKey='';this.onEvent(message);this.send({ type: 'configure', ...this.preferences });this.send({type:'gameAudio',enabled:!!this.gameAudioWanted}); this.notify({ hotkey:message.hotkey, coverHotkey:message.coverHotkey, modeHotkey:message.modeHotkey, coverEnabled:message.coverEnabled, message:message.hotkey?'全局 Alt+T 已就绪，可选择并绑定游戏窗口':'全局 Alt+T 被占用，可在 ToMe 窗口内按 Alt+T' }); return; }
      if(['normal','translation'].includes(message.interfaceMode)){if(this.pending)this.pending.interfaceMode=message.interfaceMode;this.save({...this.preferences,interfaceMode:message.interfaceMode},false);}
      if (message.type === 'bound' && message.processName) {this.artScanKey='';this.state={...this.state,...message}; this.save({ ...(this.pending || this.preferences), gameProcess: message.processName, bindEnabled: true }, false); this.pending=null; }
      if(message.type==='error')this.pending=null;
      if(message.type==='hotkeyState'){/* E476: Alt+T taken back once another program let go */this.notify({hotkey:message.hotkey,coverHotkey:message.coverHotkey,modeHotkey:message.modeHotkey});this.onEvent(message);return;}
      if ((message.type === 'hotkey'||message.type==='homeHotkey')) { this.onEvent(message); return; }
      if (message.type === 'modeRequest' || message.type === 'backlogHotkey' || message.type === 'regionApplied' || message.type === 'readerInput') { this.onEvent(message); return; }
      if(message.type==='waitMarkerFrame'){this.onEvent(message);return;}
      if(message.type==='glassFrame'){this.onEvent(message);return;}
      if (message.type === 'maskFrame') { this.lastFrameId = message.id; this.onEvent(message); return; }
      // E306 OCR page locator (PageLocator.cs): sentence boxes go through the same page path as the native engines.
      if(message.type==='hookEngineLine'){this.hooks.pageLine?.(message);return;}
      if(message.type==='hookChoiceBoxes'){this.hooks.choiceBoxes?.(message);return;}
      if(message.type==='pageLocateStatus'){this.hooks.trace?.('ocr page '+message.status);return;}
      if(message.type==='artText'){this.onEvent(message);return;}
      if(message.type==='markerTarget'){this.hooks.markerTarget(message);this.onEvent({type:'markerDebug',markerDebug:message.active?`found at ${message.x},${message.y} ${message.width}x${message.height} in ${message.clientWidth}x${message.clientHeight}`:'not active'});return;}
      if (message.type === 'layout') { this.notify({ layout:message }); return; }
      this.notify(message);
    });
    this.process.on('exit', () => this.notify({ bound: false, message: '窗口绑定组件已退出，注音和翻译仍可使用' }));
  }
  read() { try { return cleanGal(JSON.parse(fs.readFileSync(path.join(this.folder, 'gal-preferences.json'), 'utf8'))); } catch { return cleanGal(); } }
  hookPrefs(){return {hookAutoStart:this.preferences.hookAutoStart,hookHide:this.preferences.hookHide,hookFast:this.preferences.hookFast};}
  // The UI's copy of these can be stale, so the backend value always wins unless own=true.
  setHookPrefs(v){const next={...this.preferences};for(const k of ['hookAutoStart','hookHide','hookFast'])if(typeof v?.[k]==='boolean')next[k]=v[k];if(next.hookAutoStart&&!this.preferences.hookAutoStart&&typeof v?.hookHide!=='boolean')next.hookHide=true;const hideChanged=next.hookHide!==this.preferences.hookHide,autoOn=next.hookAutoStart&&!this.preferences.hookAutoStart;this.save(next,true,true);this.notify(this.hookPrefs());if(hideChanged||autoOn)this.controller.apply(true);}
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
  save(value, configure = true, own = false) { if(!own&&this.preferences)value={...value,...this.hookPrefs()};this.preferences = cleanGal(value);this.previewPreferences=null; const file=path.join(this.folder,'gal-preferences.json'),{translationPrompt,...global}=this.preferences;fs.writeFileSync(file+'.tmp',JSON.stringify(global,null,2));fs.renameSync(file+'.tmp',file); if(configure)this.send({ type: 'configure', ...this.preferences });this.styleSync.configure(this.preferences,this.state);this.hooks.configure(this.preferences,this.state); }
  preview(value) { this.previewPreferences=cleanGal({...value,...this.hookPrefs()});this.send({type:'configure',...this.previewPreferences});this.hooks.configure(this.previewPreferences,this.state);this.styleSync.configure(this.previewPreferences,this.state); }
  bind(hwnd, settings) { this.pending=cleanGal({...settings,...this.hookPrefs(),hookProfile:this.preferences.hookProfile}); this.send({ type:'bind',hwnd,settings:this.pending }); }
  send(message) { if(message?.type==='configure')message=require('./scan-area.cjs').apply(message,this.hooks?.flowPage||undefined); if (this.process?.stdin.writable) this.process.stdin.write(JSON.stringify(message)+'\n'); }
  // A whitespace-only source is the embed's own replacement read back on a redraw (BGI writes spaces), never a line:
  // passing it on blanks the Japanese while the previous translation stays. '' keeps its meaning (text cleared).
  hookEvent(message){if(this.stopped)return;if(typeof message.hookSource==='string'&&message.hookSource&&!message.hookSource.trim()){message={...message};delete message.hookSource;}if(message.type==='hookTextPos'||message.type==='hookPage'||message.type==='hookDialog'||message.type==='hookFont'||message.type==='hookGameUi'||message.type==='hookEmbedRequest'||message.type==='hookPatchTranslation'){this.onEvent(message);return;}if(message.hookActive===false){message={...message,hookVisualVerified:false,hookCheckState:this.controller?.running?'waiting':'stopped'};this.send({type:'hookVerifyCancel'});}
    // Tag each live line read/unread (shown before in this game) so the reader can use the game's read-text colour.
    if(message.hookActive!==false&&typeof message.hookSource==='string'&&message.hookSource.trim()&&message.hookSourceOrigin!=='history'){const read=this.styleSync.readLine(message.hookSource);if(typeof message.hookSourceRead==='boolean')message={...message,hookSourceReadOrigin:'engine'};else if(typeof read==='boolean')message={...message,hookSourceRead:false,hookSourceReadOrigin:read?'tome-history-ignored':'tome-history'};} /* E407: MeguLit's own cross-run history is not the game's read flag (user: new game, unread lines in the read colour); only an engine-reported flag paints read, unknown = unread */
    // The game's own ruby readings, remembered per work: the page uses them for furigana and speech.
    if(typeof message.hookSource==='string'&&message.hookSource.trim()){const key=this.styleSync?.profileKey;if(this.gameRuby)message={...message,hookRubyDict:Array.isArray(message.hookSourceRuby)&&message.hookSourceRuby.length?this.gameRuby.learn(key,message.hookSourceRuby):this.gameRuby.dict(key)};}
    this.state={...this.state,...message};if(this.controller?.styleCalibration&&this.controller.styleIdentity!==String(this.state.gameProcessId||'')+'|'+String(this.state.gameStarted||''))this.controller.finishStyleSync(false,true);this.onEvent(message);if((Array.isArray(message.hookThreads)&&message.hookThreads.length)||Object.prototype.hasOwnProperty.call(message,'hookFramework'))this.controller.apply();if(message.hookActive===true&&typeof message.hookSource==='string'&&!message.hookRecovering){if(message.hookSourceOrigin!=='history')this.rememberLine(message.hookSource);this.controller.source(message.hookSource);this.styleSync.observe(message.hookSource,message.hookSourceRead,message.hookSourceEngine);if(this.controller.styleAwaitLive&&message.hookSourceOrigin!=='history'&&this.hooks.enabled){this.controller.styleAwaitLive=false;this.onEvent({gameStylePreview:false});}}}
  notify(message) { if(this.stopped)return;const oldBound=this.state.bound,oldCover=this.state.coverEnabled,oldIdentity=this.state.gameStarted;this.state = { ...this.state, ...message };if(message.gameStarted&&oldIdentity&&message.gameStarted!==oldIdentity){this.controller.baseline=false;this.controller.seq++;this.controller.stage='waiting';this.hooks.preflight=!['read','off'].includes(this.preferences.hookProfile)&&(this.preferences.hookFast===false||this.preferences.autoGameStyle!==false);this.send({type:'hookVerifyCancel'});if(this.preferences.hookAutoStart&&!this.preferences.hookHide){this.preferences={...this.preferences,hookHide:true};this.state={...this.state,hookHide:true};}}this.hooks.configure(this.previewPreferences||this.preferences,this.state);this.styleSync.configure(this.previewPreferences||this.preferences,this.state);if(message.type==='layout'&&message.clientWidth&&message.clientHeight)this.styleSync.resize(message.clientWidth,message.clientHeight); this.onEvent(message);if((typeof message.bound==='boolean'&&oldBound!==message.bound)||(typeof message.coverEnabled==='boolean'&&oldCover!==message.coverEnabled)){this.controller.modeChanged();this.controller.apply();} }
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
  sceneShot(){const id=String(++this.mediaSerial||(this.mediaSerial=1));return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete('s'+id);resolve(null);},5000);timer.unref?.();map.set('s'+id,m=>{clearTimeout(timer);resolve(m.jpeg?{jpeg:m.jpeg,score:Number(m.score)||0,hash:String(m.hash||'')}:null);});this.send({type:'sceneShot',id});});}
  /* 2026-11-13 collected sentence pictures (services/sentence-scenes.cjs): sceneFrame = the whole clean frame as JPEG with the hash of
     its top 62% (asked only while the dialogue box is hidden); sceneProbe = that top hash of the frame on screen now, no picture */
  sceneFrame(){return this.sceneAsk('sceneFrame','f',m=>m.jpeg&&/^[0-9a-f]{16}$/.test(String(m.topHash||''))?{jpeg:m.jpeg,topHash:String(m.topHash),score:Number(m.score)||0}:null);}
  sceneProbe(){return this.sceneAsk('sceneProbe','p',m=>/^[0-9a-f]{16}$/.test(String(m.topHash||''))?{topHash:String(m.topHash)}:null);}
  sceneAsk(type,prefix,shape){const id=String(++this.mediaSerial||(this.mediaSerial=1));return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete(prefix+id);resolve(null);},5000);timer.unref?.();map.set(prefix+id,m=>{clearTimeout(timer);resolve(shape(m));});this.send({type,id});});}
  gameFrame(readerBounds){const now=Date.now(),id=String(++this.mediaSerial||(this.mediaSerial=1));return new Promise(resolve=>{const map=this.mediaPending||(this.mediaPending=new Map());const timer=setTimeout(()=>{map.delete(id);resolve('');},4000);timer.unref?.();map.set(id,m=>{clearTimeout(timer);resolve(m.jpeg||'');});this.send({type:'mediaClip',id,from:now,to:now,screenshot:true,...(readerBounds&&{readerScreenshot:true,...readerBounds})});});}
  /* 2026-11-12 art scan (OCR read path, PageLocator.Scan): on while the game is bound and no hook line is current; sent only when it changes */
  artScan(){if(this.stopped)return;const s=this.state.bound===true&&this.preferences?.artText!==false?this.hooks.artScanState():{on:false,dialog:'',speaker:'',band:false};const key=JSON.stringify(s);if(key===this.artScanKey)return;this.artScanKey=key;this.send({type:'artScan',...s});}
  stop() {clearInterval(this.artScanTimer);clearTimeout(this.controller.styleTimer);this.stopped=true;this.styleSync.stop();this.hooks.stop(); this.send({ type: 'quit' }); this.process?.stdin.end(); }
}
module.exports = { cleanGal, GalNative };
