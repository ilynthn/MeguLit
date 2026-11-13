// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const {identifierNoise}=require('./text-noise.cjs');const {ChoiceCapture,placeChoices,SYMBOL_OPTION}=require('./choice-capture.cjs');const {DoubleLine}=require('./double-line.cjs');
/* #148 (WHITE ALBUM2, AQUAPLUS: phone lines came as 「<F16「やぁ…」>」): inline engine tags of one ASCII letter (+ up to 3
   digits) wrapped straight around Japanese text are unwrapped for every engine; <R漢字|かな> keeps its base. HTML-like tags
   (<br>, <b>) are never touched: the letter must be followed by non-ASCII text. */
function unwrapTags(text){let s=String(text),prev;do{prev=s;s=s.replace(/<R([^<>|\x00-\x7f][^<>|]*)\|[^<>]*>/g,'$1').replace(/<[A-Za-z]\d{0,3}(?=[^\x00-\x7f])([^<>]*)>/g,'$1');}while(s!==prev);return s;}
function cleanSource(text,name='',code=''){const unity=code.endsWith(':JIT:UNITY');if(unity)text=require('./unity-source.cjs').rubySize(text).replace(/<br\s*\/?>/gi,'\n').replace(/<ruby[^>]*>(.*?)<\/ruby>/gis,'$1').replace(/<\/?(?:color|size|font|b|i|u|s|mark|align|line-height|cspace|mspace|indent|margin|voffset|alpha|link|style|noparse|sprite)(?:[=\s][^>]*)?>/gi,'');text=unwrapTags(text).replace(/\r\n?/g,'\n');if(unity)text=require('./unity-source.cjs').typewriter(text);return text.replace(/\x05/g,/^BGI(?:\.exe)?$/i.test(name)?'\n':'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'');}
/* A speaker name from a name stream: brackets and control marks stripped; anything that reads like a sentence is not a name. */
function speakerName(raw){const n=String(raw||'').replace(/[\x00-\x1f]/g,'').replace(/^[\s【\[「『(（]+|[\s】\]」』)）:：]+$/gu,'').trim();if(n.length%2===0&&n.length>=4&&n.slice(0,n.length/2)===n.slice(n.length/2))return speakerName(n.slice(0,n.length/2)); /* a name stream that sends the name twice (時雨時雨) */
 return n&&n.length<=16&&(/^[?？]+$/.test(n)||!/[。、！？!?…]/.test(n))?n:'';}
/* #141 (CLANNAD, v1.4.9-beta.1: speaker names showed up in the text flow). Many engines (RealLive/Siglus, KiriKiri, BGI,
   YU-RIS …) send the name box in the same stream as the line, either as its own string or glued to the front of the line.
   Whatever the engine, a name is split off into the speaker field: 【名前】 / ［名前］ alone or before the line, a name before
   a quote with a line break, ideographic space or colon in between, and – for names already seen – 名前「…」 and a bare
   名前 line. Returns {name,text}; text is '' when the string was only a name. */
const QUOTE_OPEN='「『（(',QUOTE_CLOSE='」』）)';
function splitSpeaker(raw,known){const s=String(raw||'');const t=s.replace(/^[\s　]+/,'');if(!t)return {name:'',text:s};
 const kn=n=>!!known&&typeof known.has==='function'&&known.has(n);
 let m=/^[【［\[]([^【】［］\[\]\n]{1,16})[】］\]](?:[\s　]*)([\s\S]*)$/.exec(t);
 if(m){const n=speakerName(m[1]),rest=m[2].trim()?m[2]:'';if(n&&(!rest||/^[「『（(]/.test(rest)||kn(n)))return {name:n,text:rest};}
 m=/^([^\s　「『（(【［\[。、！？!?…]{1,12})(?:[ 　]*\n[\s　]*|　+|[ 　]*[:：][\s　]*)([「『（(][\s\S]*)$/.exec(t);
 if(m){const n=speakerName(m[1]);if(n)return {name:n,text:m[2]};}
 m=/^([^\s　「『（(【［\[。、！？!?…]{1,12})([「『（(][\s\S]*[」』）)])$/.exec(t.trimEnd());
 if(m&&kn(m[1]))return {name:m[1],text:m[2]};
 if(kn(t.trim()))return {name:t.trim(),text:''};
 return {name:'',text:s};}
function scriptSource(text){
 // Script VM syntax left in a hooked string (variable references, ％Ａ/＊Ｂ commands); "50％OFF" is ordinary text (E215).
 const marker=/[【《\[][\$＄]|[%％*＊][A-ZＡ-Ｚ](?![A-Za-zＡ-Ｚａ-ｚ])|[\$＄][\p{L}_＿]/u.exec(text);
 return marker?text.slice(0,marker.index).trimEnd():text;
}
const IslandSource=require('./island-source.js');
// Engines whose MeguLit DLL reports each sentence of a full-screen page (hookEngineLine): KiriKiri (E300), Ren'Py (E301),
// and every other engine through the OCR page locator (E306, GalWindowBridge PageLocator.cs).
const PAGE_ENGINES=new Set(['krkr','renpy','ocr']);
/* E305 full-screen (NVL) games whose engine reports no line positions or page turns (魔法使いの夜 / WITCH ON THE HOLY NIGHT,
   HuneX, LunaHook typemoon): their lines go out as engine 'nvl', and the reader stacks each one under the last inside
   the calibrated text box, turning the page when the box is full. Keyed by the game's process name. */
/* The window bridge reports Process.ProcessName (no extension): "WoH"; the file name is accepted too. */
const FLOW_PAGE_EXES=/^WoH(?:\.exe)?$/i;
/* E414: a measured page grid belongs to one program (WoH's 27-cell rows); every other page game is laid out in its calibrated box. */
const FLOW_GRIDS=[[/^WoH(?:\.exe)?$/i,'woh']];
class HookNative{
 /* E410 (user: WoH's original stayed visible under the overlay). The baseline preflight lets one line through unhidden to
    find where the game draws it; on a full-screen page that line stays on the page, under the overlay, and the page is laid
    out on the game's own grid anyway. A flow page never runs it. */
 /* E414 (user: "做成通用解法"): a game is a page game when its program is listed (WoH) or when its own script says so: the
    script provider knows where pages start and most pages hold more than one line (HuneX tables, multilingual KiriKiri
    [cm]/[l]). Every page rule (page clears, no duplicates, row continuation, no marker/box auto-hide, no preflight) follows. */
 /* E422: the reader's skip key (Ctrl / the game's skip held), for the bridge's skip-burst rule. */
 skipHeld(v){const held=v===true;if(held===this.skipKey)return;if(held&&this.pageQueue?.rest.length){const q=this.pageQueue;this.pageQueue=null;this.source({...q.base,text:q.rest[q.rest.length-1]},q.name);}this.skipKey=held;if(this.process)this.send({type:'skipHeld',held});}
 /* 2026-11-12 (user, ファタモルガーナの館: "这死馆也没有上一句渐暗"): the script guess (flowGame: many multi-sentence pages) is
    overruled by the engine itself: once its page DLL reports lines (with their real places, box or full page), the game is not laid out as a flow page */
 get flowPage(){if(this._flowPage===true)return true;if(this.pageMode&&this.pageMode.engine!=='ocr')return false;return this.originalText?.flowGame?.()===true;}
 set flowPage(v){this._flowPage=v===true;}
 /* 2026-11-12 a KiriKiri page DLL draws the game's own text invisible itself (MeguLitKrkr __megulitKrkrHide): nothing to look at
    before hiding, so the preflight that shows the original first (and stayed in read mode when its check was cancelled) is skipped.
    E472: except while the game style is being calibrated: the probe samples the game's own glyphs, so the game must draw them. */
 get preflight(){return this._preflight===true&&this.flowPage!==true&&(this.pageMode?.engine!=='krkr'||this.calibrating===true);}
 /* E472: the game itself draws the current line invisible (KiriKiri page DLL): calibration has to wait for the next line. */
 get drawsHidden(){return this.enabled===true&&this.pageMode?.engine==='krkr';}
 set preflight(v){this._preflight=v===true;}
 /* E410: where a flow line sits on the page, from the game's own scripts (null when unknown). */
 flowLayout(text){try{const provider=this.originalText;if(!provider?.flowLayout)return null;const r=this.resolveSource(text);if(!r||r.method==='same-text'/* E520: the place of a repeated line is unknown */||!(r.status==='exact'||r.status==='high'||r.method==='untranslated'))return null;return provider.flowLayout(r.indices)||null;}catch{return null;}}
 constructor(layout,onEvent,spawnHelper=spawn,now=Date.now){this.layout=typeof layout==='string'?{native:layout,hook:path.join(layout,'hook-runtime')}:layout;this.folder=this.layout.native;this.emit=onEvent;this.spawn=spawnHelper;this.now=now;this.state={hookActive:false,hookAvailable:false,hookThreads:[],processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookMessage:'Hook 未启用'};this.islandSources=new Map();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;this.lastSource="";this.identity="";this.serial=0;this.enabled=false;this.attempt=0;this.retryAt=0;this.timer=setInterval(()=>this.tick(),1000);this.timer.unref?.();}
 trace(message){try{const file=path.join(this.layout.logs||path.join(this.folder,"..","logs"),"hook-events.log");if(fs.existsSync(file)&&fs.statSync(file).size>=1048576){fs.rmSync(file+".previous",{force:true});fs.renameSync(file,file+".previous");}fs.appendFileSync(file,new Date().toISOString()+" "+message+"\n");}catch{}}
 notify(v){if(Object.entries(v).every(([k,value])=>this.state[k]===value))return;this.state={...this.state,...v};this.emit({type:'hook',...v});}
 configure(preferences,state){this.preferences=preferences;this.windowState=state;const pid=Number(state.gameProcessId),hwnd=String(state.gameHwnd||'');this.wanted=(preferences.hookAutoStart||['hook','local'].includes(preferences.maskMode))&&preferences.bindEnabled===true&&preferences.hookProfile!=='off';this.target=Number.isSafeInteger(pid)&&pid>0&&/^\d{1,19}$/.test(hwnd)?{pid,hwnd,name:String(state.processName||''),started:String(state.gameStarted||'')}:null;
  if(!this.wanted||!this.target){this.stop(false);return;}if(this.process&&(this.pid!==pid||this.started!==this.target.started))this.stop(false);
  /* E285 (user: Alt+H also switched off the translation the game draws itself): Alt+H hides MeguLit's own layers; the
     game keeps drawing the written-back translation until its own switch is turned off. */
  const enabled=preferences.hookProfile!=='read'&&!this.preflight&&state.bound===true&&(state.coverEnabled!==false||preferences.embedTranslation===true&&preferences.translationBlur!==true);const route=enabled?(preferences.hookProfile==='embed'?'embed':'custom'):'read';if(this.process&&(enabled!==this.enabled||route!==this.route)){
   // Every engine toggles hiding in place (E215): the bridge only flips its replacement switch. Detaching and
   // re-injecting the same game process on each mode change (calibration, preflight) made the overlay flicker and
   // crashed CLANNAD HD (Siglus) without an error; it also dropped the first line after calibration.
   if(true){this.trace('render mode switched in place '+this.route+' -> '+route);this.enabled=enabled;this.route=route;this.verified=false;if(enabled)this.send({type:'enable'});else this.send({type:'disable',reason:preferences.hookProfile==='read'?'reader-profile':this.preflight?'reader-preflight':state.bound!==true?'reader-unbound':'cover-disabled'});}
   else{this.trace('render mode changed; detach then reconnect');this.stop(false);this.retryAt=this.now()+2500;return;}}if(!this.process&&this.now()>=this.retryAt)this.start(this.target);this.syncMarker();this.syncEmbedMode();}
 // 'translate' while the per-work switch is on and replacement is active; 'hide' (blank for MeguLit to draw) otherwise.
 /* E352 (user: perfect original-style embed for every game). A full-screen page has no box MeguLit could cover cleanly; when
    the game's own translation table (official Chinese or an imported patch) answers every line at once, the game draws
    the translation itself in its own layout. Unmatched lines get the usual translation within the bridge's wait. */
 autoTranslateEmbed(){return this.flowPage===true&&/* E415: a blurred translation must be MeguLit's own, the game's pixels cannot be blurred */this.preferences?.translationBlur!==true&&this.scriptAllowed?.()!==false&&this.originalText?.kind==='patch'&&/* E358: only when the game's font can draw its translation table */this.originalText?.tableDrawable?.()===true;/* E414: only when the game's own glyphs are known to cover the table */}
 syncEmbedMode(){/* E417 a hide-only stream (old BGI per-character hook) cannot draw a translation: MeguLit draws it */const hideOnly=(this.state?.hookThreads||[]).some(t=>t.selected&&t.hideOnly===true);const want=!!(this.process&&this.enabled&&!hideOnly&&(this.preferences?.embedTranslation===true&&this.preferences?.translationBlur!==true||this.autoTranslateEmbed()));if(!this.process){this.embedModeSent=undefined;return;}if(want===this.embedModeSent)return;this.embedModeSent=want;if(!want&&this.state?.embedTranslating)this.notify({embedTranslating:false});this.trace('embed mode '+(want?'translate':'hide'));this.send({type:'embedMode',mode:want?'translate':'hide'});}
 /* E358: hide:true = the game's font cannot draw this translation: the bridge hides the line, the overlay draws it (per line). */
 /* 2026-11-13 (adapt/krkr-bgi, live euphoria, EmbedYURIS6): every written-back translation made the engine stop with
    「テキスト内部エラーです。テキストサイズ情報を正しく格納できませんでした」 — longer (32->38 bytes), shorter (20->14, 「フォントサイズが不正です」)
    and even the same size padded with spaces (20->20). Blanking the line in place (hide) is safe. So on a YU-RIS embed stream the game
    only hides the line and MeguLit draws the translation. */
 fixedSizeEmbed(){return (this.state?.hookThreads||[]).some(t=>t.selected&&/^EmbedYURIS/i.test(String(t.name||'')));}
 embedReply(id,trans,o={}){if(!this.process||!Number.isSafeInteger(id))return;const hide=o?.hide===true||!!trans&&this.fixedSizeEmbed();this.send({type:'embedReply',id,trans:hide?'':String(trans||'').slice(0,4000),...(hide?{hide:true}:{})});if(!this.embedModeSent||!(hide||trans))return;
  if(hide&&!this.glyphNoted){this.glyphNoted=true;this.trace?.('embed fallback: the game font has no glyphs for the translation; the game hides the line and MeguLit draws it');}
  this.notify({embedTranslating:!hide,embedLine:{source:String(o?.source||''),text:hide?'':String(o?.text||trans||''),drawn:!hide}});}
 tick(){if(this.process&&this.now()-this.lastHeartbeat>12000){const old=this.process;this.process=null;++this.serial;old.kill();this.retry('Hook 通信无响应');}if(!this.process&&this.wanted&&this.target&&this.now()>=this.retryAt)this.start(this.target);}
 retry(message){this.pageReset();this.islandSources.clear();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;clearTimeout(this.islandTimer);clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;this.pendingSource=null;this.verified=false;this.enabled=false;this.retryAt=this.now()+Math.min(30000,1000*2**Math.min(this.attempt++,5));this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookSource:this.lastSource||null,hookRecovering:!!this.lastSource,hookThreads:[],hookMessage:message+'；正在自动重连'});}
 start({pid,hwnd,name,started}){if(!/^[A-Za-z0-9_\-. \u0080-\uffff]{1,100}$/.test(name)||!/^\d{10,20}$/.test(started))return;
  // Do not keep re-attaching to a game process that has exited; wait for the window bridge to bind the new one.
  if(this.spawn===spawn)try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){this.retryAt=this.now()+3000;this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,hookMessage:'游戏进程已退出，等待游戏重新启动后自动绑定'});return;}}
  // A HookBridge built while ToMe ran is staged as HookBridge.updated.exe and installed here, before the bridge starts.
  const staged=path.join(this.folder,'HookBridge.updated.exe');if(fs.existsSync(staged))try{fs.copyFileSync(staged,path.join(this.folder,'HookBridge.exe'));fs.unlinkSync(staged);}catch{}
  HookNative.syncShippedHook(this.folder);
  HookNative.fetchRuntimeDump(this.folder);
  const root=this.layout.hook,required=['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'],missing=required.filter(n=>!fs.existsSync(path.join(root,n)));if(missing.length||!fs.existsSync(path.join(this.folder,'HookBridge.exe'))){this.retryAt=this.now()+30000;this.notify({hookMessage:'Hook 组件缺失：'+missing.join('、'),hookAvailable:false});return;}
  this.flowPage=FLOW_PAGE_EXES.test(name);this.flowGridName=(FLOW_GRIDS.find(([re])=>re.test(name))||[])[1]||'';  const identity=pid+"|"+started;if(identity!==this.identity){this.lastSource="";this.lastSourceAt=0;this.preferredThread=null;this.remembered=null;this.identity=identity;this.state.hookFramework=null;this.state.hookEmbedPending=false;}this.pid=pid;this.started=started;this.enabled=this.preferences?.hookProfile!=='read'&&!this.preflight&&this.windowState?.bound===true&&(this.windowState?.coverEnabled!==false||this.preferences?.embedTranslation===true);this.route=this.enabled?(this.preferences?.hookProfile==='embed'?'embed':'custom'):'read';this.markerKey='';this.lastHeartbeat=this.now();const serial=++this.serial,child=this.process=this.spawn(path.join(this.folder,'HookBridge.exe'),[String(pid),hwnd,name,started,...(this.route==='read'?['--read-only']:this.route==='embed'?['--official-embed']:[])],{cwd:this.folder,windowsHide:true,stdio:['pipe','pipe','ignore']});child.stdin.on('error',()=>{});if(this.enabled)this.send({type:'enable'});
  const failed=()=>{if(serial!==this.serial)return;this.process=null;++this.serial;this.retry('Hook 连接停止');};child.on('error',failed);child.on('exit',failed);
  createInterface({input:child.stdout}).on('line',line=>{if(serial!==this.serial||line.length>30000)return;let m;try{m=JSON.parse(line);}catch{return;}this.lastHeartbeat=this.now();/* 2026-11-13 replay recording: MEGULIT_HOOK_RECORD=<file.jsonl> keeps every bridge message with its time (validation/hook-replay) */if(process.env.MEGULIT_HOOK_RECORD&&m.type!=='hookHeartbeat')try{fs.appendFileSync(process.env.MEGULIT_HOOK_RECORD,JSON.stringify({t:this.now(),m})+'\n');}catch{}
   if(m.type==='hookEngineFeature'&&['naninovel','cs2','siglus'].includes(m.framework)){
    if(m.framework==='siglus'&&this.enabled){this.enabled=false;this.route='read';this.verified=false;this.preferredThread=null;this.send({type:'disable',reason:'script-vm-capture-only'});}
    this.notify({hookFramework:m.framework});return;
   }
   /* E531: an embed-capable hook is inserted; its stream appears with the first dialogue line, so a title menu is not "unsupported" */
   if(m.type==='hookEmbedPending'){this.trace('embed hook pending '+String(m.code||'').slice(0,200));this.notify({hookEmbedPending:true});return;}
   /* E520: the bridge found this game's remembered dialogue stream (it embedded before): no warm-up, replace from the first line */
   /* signature memory: the remembered hook was relocated by its byte signature (game updated/other build) and inserted before the first line, always on, no switch; a miss is silent and falls back to the existing search */
   if(m.type==='hookSignature'){this.state.hookSignature={found:!!m.found,moved:!!m.moved,module:String(m.module||'').slice(0,100)};this.trace('stream signature '+(m.found?(m.moved?'relocated ':'same place ')+String(m.code||'').slice(0,200):'not found in '+String(m.module||'')));return;}
   if(m.type==='hookMemory'){this.remembered={name:String(m.name||'').slice(0,100),code:String(m.code||'').slice(0,1000)};this.trace('stream memory '+this.remembered.name+' '+this.remembered.code);this.notify({hookRemembered:true});try{this.onRemembered?.(this.remembered);}catch(e){this.trace('remembered error '+(e?.message||e));}return;}
   if(m.type==='hookEngineLine'&&PAGE_ENGINES.has(m.engine)){this.pageLine(m);return;}
   if(m.type==='hookTextPos'&&m.engine==='pal_sprite_v1'){this.palPosition(m);return;}
   /* 2026-11-12 the engine's own text window state (KiriKiri ToMe_DIALOG): a line arriving while it is hidden is art text */
   if(m.type==='hookDialog'&&typeof m.visible==='boolean'){this.engineDialog=m.visible;this.engineDialogAt=this.now();}
   if(m.type==='hookTextPos'||m.type==='hookPage'||m.type==='hookDialog'||m.type==='hookGameUi'||m.type==='hookFont'){this.emit(m);if(m.type==='hookPage')this.islandPage(m);return;}
   /* Translation written back into the game: the bridge holds a dialogue line and asks for its translation. */
   if(m.type==='embedRequest'&&Number.isSafeInteger(m.id)&&typeof m.text==='string'&&m.text.length<=4000){this.emit({type:'hookEmbedRequest',id:m.id,text:m.text});return;}
   if(m.type==='hookRender'){this.notify({hookDrawCount:Number(m.count)||0,hookDrawAt:Number(m.at)||0});return;}
   if(m.type==='waitMarkerDrawn'){this.emit({type:'waitMarkerDrawn'});return;}
   if(m.type==='waitMarkerStatus'){this.notify({waitMarkerMessage:String(m.message||'').slice(0,300),waitMarkerHookActive:m.active===true});return;}
   if(m.type==='hookSource'&&typeof m.text==='string'&&m.text.length<=4000){this.sourcePage(m,name);return;}
   // v1.1.4: speaker names from a name-role stream, for every engine that reports one (user: the log showed every line as narration).
   if(m.type==='hookAuxText'&&typeof m.text==='string'&&m.text.length<=400){this.auxText(m);return;}
   if(m.type==='hookName'&&typeof m.text==='string'){const n=speakerName(m.text);if(n){this.speaker={text:n,at:this.now()};this.noteSpeaker(n);}return;}
   if(m.type==='hookThreads'&&Array.isArray(m.hookThreads)){// Unity games create a stream per String-method call site (often 100+); keep the selected and embeddable ones
   // ahead of the cut so a late dialogue stream such as Naninovel's printer is never dropped.
   const rank=t=>(t&&t.selected===true?2:0)+(t&&t.embeddable===true?1:0);this.notify({hookAvailable:true,hookThreads:m.hookThreads.slice().sort((a,b)=>rank(b)-rank(a)).slice(0,100).filter(t=>typeof t.id==='string'&&t.id.length<100).map(t=>({id:t.id,name:String(t.name||'').slice(0,100),code:String(t.code||'').slice(0,1000),sample:String(t.sample||'').slice(0,110),selected:t.selected===true,embeddable:t.embeddable===true,...(t.hideOnly===true?{hideOnly:true}:{})}))});this.syncEmbedMode();this.leaveCheck();if(this.preferredThread&&this.state.hookThreads.some(t=>t.id===this.preferredThread)){const id=this.preferredThread;this.preferredThread=null;this.select(id);}else if(!this.foreignPick())this.flowStreamCheck();return;}
   if(['hookStatus','hookError','hookHeartbeat'].includes(m.type)){const value={};for(const k of ['processAttached','streamSelected','receivedText'])if(typeof m[k]==='boolean')value[k]=m[k];if(typeof m.replacementState==='string')value.replacementState=this.verified&&this.enabled?'user-verified':m.replacementState;if(typeof m.hookActive==='boolean')value.hookActive=m.hookActive;if(m.hookMessage)value.hookMessage=String(m.hookMessage).slice(0,400);if(m.type!=='hookError'&&(value.receivedText??this.state.receivedText)&&(value.processAttached??this.state.processAttached)&&(value.streamSelected??this.state.streamSelected))value.hookMessage='已收到真实游戏台词；'+((value.replacementState||this.state.replacementState)==='user-verified'?'原文隐藏已由用户确认':'原文替换状态请见分阶段诊断');this.notify(value);if(m.type==='hookError')this.retryAt=this.now()+1000;this.syncMarker();}
  });this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookSource:this.lastSource||null,hookRecovering:!!this.lastSource,hookFramework:this.state.hookFramework||null,hookMessage:'正在连接 LunaHook；等待实际文本流'});
 }
 // Japanese original for a translated build (services/original-text.cjs). Only an exact or position-confirmed match
 // replaces the captured line; anything else, or any error, keeps the captured text so the dialogue never goes missing.
 /* E285 (user: a Chinese script was imported, yet the game was given DeepSeek's wording): one lookup per line, shared by the
    reader and the text written back into the game, so the matcher's reading position moves once per line. */
 markScriptSource(){try{if(this.state&&!this.state.scriptSource)this.notify({scriptSource:true});}catch{}}
 resolveSource(text){const provider=this.originalText;if(!provider||!text)return null;const key=String(text).replace(/\s+/g,'');this.sourceCache??=new Map();if(this.sourceCache.has(key)&&this.sourceCache.get(key).provider===provider)return this.sourceCache.get(key).r;const r=provider.resolve(text);this.sourceCache.set(key,{provider,r});if(this.sourceCache.size>200)this.sourceCache.delete(this.sourceCache.keys().next().value);return r;}
 // The script's own translation for a captured line, or '' when the line is not matched with confidence.
 /* 2026-11-13 an OCR row (art text) snapped to the script line it reads, when the game's script is known */
 ocrSnap(text){try{const p=this.originalText;if(!p||typeof p.near!=='function'||this.scriptAllowed?.()===false)return '';const t=p.near(text);return t&&t!==text?t:'';}catch{return '';}}
 scriptTranslation(text){try{if(this.scriptAllowed?.()!==false&&this.trackPairs){const zh=this.trackPairs.get(String(text||'').replace(/\s+/g,''));if(zh)return zh;}const provider=this.originalText;if(!provider||this.scriptAllowed?.()===false)return '';const r=this.resolveSource(text);if(!r||r.status!=='exact'&&r.status!=='high')return '';const t=provider.kind==='patch'?r.translation:r.captured;return typeof t==='string'&&t.trim()&&!require('../services/original-text.cjs').japaneseLine(t)?t.trim():'';}catch{return '';}}
 originalTextFor(text){const provider=this.originalText;if(!provider||!text)return text;try{const r=this.resolveSource(text);
  if(provider.kind==='patch'){if((r.status==='exact'||r.status==='high')&&typeof r.translation==='string'&&r.translation.trim()&&!require('../services/original-text.cjs').japaneseLine(r.translation)&&typeof this.emit==='function'&&this.scriptAllowed?.()!==false){this.trace('patch-text '+r.status+' #'+r.indices[0]);if(r.machine!==true)this.markScriptSource();this.emit({type:'hookPatchTranslation',japanese:text,chinese:r.translation,machine:r.machine===true});}return text;}if((r.status==='exact'||r.status==='high')&&r.japanese&&!r.alreadyJapanese){this.trace('original-text '+r.status+' '+r.method+' #'+r.indices[0]);
   /* The patched line is the translation group's own Chinese for this Japanese line (user, 2026-11-09: zero-latency
      bilingual from an existing 汉化). Hand the pair to the reader before the line itself, so its translation is ready. */
   this.markScriptSource();if(typeof r.captured==='string'&&r.captured.trim()&&typeof this.emit==='function'&&this.scriptAllowed?.()!==false)this.emit({type:'hookPatchTranslation',japanese:r.japanese,chinese:r.captured});
   return r.japanese;}if(r.status!=='none')this.trace('original-text kept '+r.status+' '+r.method);}catch(error){this.trace('original-text error '+(error?.message||error));}return text;}
 /* E294 (user: a friend's Steam CLANNAD was read as Japanese while the game showed Simplified Chinese, furigana and all):
    three lines in a row with no kana and several characters no Japanese font has (际 无 尽 这 们) mean the game is
    running a Chinese script; the status says so once, so the user restores Japanese instead of reading Chinese. */
 /* 2026-11-13 a line without any Japanese (the game set to English, French, ...): its Japanese line from the script's own
    parallel language tables when the engine has them (any engine whose scene reader offers foreign(), e.g. DDLC Plus). */
 /* 2026-11-13 openings in a localized build (Summer Pockets Steam Chinese: the poem is a picture of the Chinese table text): an
    OCR group in another language gives back its Japanese table line, matched loosely (OCR slips, no punctuation) */
 foreignArt(text,id){try{const p=this.originalText;if(!p||typeof p.foreign!=='function'||this.scriptAllowed?.()===false)return '';/* one item read again (a better OCR read) keeps its line: the sequence must not move on */const memo=this.foreignArtMemo||(this.foreignArtMemo=new Map());if(id!=null&&memo.has(id))return memo.get(id);const r=p.foreign(String(text||''),{fuzzy:true}),ja=r&&r!==text?r:'';if(id!=null){memo.set(id,ja);if(memo.size>100)memo.delete(memo.keys().next().value);}return ja;}catch{return '';}}
 foreignArtReady(){const p=this.originalText;return !!p&&typeof p.foreign==='function'&&this.scriptAllowed?.()!==false;}
 foreignJapanese(text,opt){try{const t=String(text||'').trim();if(!t||/[\u3040-\u30ff\u4e00-\u9fff]/.test(t)||!/[A-Za-z\u00c0-\u024f\uac00-\ud7af]{2}/.test(t))return '';const p=this.originalText;if(!p||typeof p.foreign!=='function')return '';const ja=p.foreign(t,opt);if(ja){this.trace('foreign line -> japanese');if(this.state?.sourceForeign)this.notify({sourceForeign:false});return ja;}return '';}catch{return '';}}
 /* 2026-11-13 (DDLC Plus in English: the hook was attached but no dialogue stream was selected, the reader stayed empty):
    the native picker scores samples by Japanese characters, so a game set to another language never gets a pick. When
    nothing is selected and the scene reader can map a stream's sample back to Japanese (foreign()), that stream is the
    dialogue stream; the most mapped samples win, each stream is tried once per run. */
 foreignPick(){try{const threads=this.state?.hookThreads||[];if(!threads.length)return false;
  const p=this.originalText;if(!p||typeof p.foreign!=='function')return false;const tried=this.foreignTried||(this.foreignTried=new Set());
  /* 2026-11-13 (DDLC Plus live: the pick landed on the boot screen's "Press HELP key" and "Skip Intro" streams and stayed
     there; the BIOS screen even maps to more Japanese than one dialogue line): a stream picked this way is only
     provisional. Dialogue is the stream that keeps changing: each stream counts how many different samples mapped back
     to Japanese (cached per sample), and a prose stream (at most 3 rows, one of 5+ words; BIOS dumps and menus are not)
     with at least two such samples, more than the picked one, takes over; it must be writable when the picked one was. A stream the player chose is never touched. */
  const current=threads.find(t=>t.selected)?.id||'';if(current&&current===this.manualThread)return false;const mine=current||this.foreignPicked||'';
  const cache=this.foreignScores||(this.foreignScores=new Map());const score=t=>{const sample=String(t.sample||'');const c=cache.get(t.id);if(c&&c.sample===sample)return c;let n=0;for(const x of sample.split(/\n+/))if(x.trim()){const ja=this.foreignJapanese(x,{prefix:true});if(ja)n+=ja.length;}const e={sample,n,changes:(c?.changes||0)+(n?1:0)};cache.set(t.id,e);return e;};
  let best=null;for(const t of threads){if(t.id===mine||tried.has(t.id)||!t.sample)continue;const s=score(t);if(!s.n)continue;const rows=String(t.sample).split(/\n+/).filter(x=>x.trim());const long=rows.length<=3&&rows.some(x=>/[a-zÀ-ɏ]{2,}[,;]?\s+[a-zÀ-ɏ]{2,}[,;]?\s+[a-zÀ-ɏ]{2,}/i.test(x)&&x.trim().split(/\s+/).length>=5)&&(t.embeddable===true||!threads.find(x=>x.id===mine)?.embeddable);if(mine&&!long)continue;const better=!best||(mine?(s.changes>best.changes||(s.changes===best.changes&&s.n>best.n)):s.n>best.n);if(better)best={id:t.id,n:s.n,changes:s.changes,long};}
  if(!best)return false;if(mine){const own=threads.find(t=>t.id===mine);const o=own?score(own):{changes:0};/* E501 (live DDLC Plus beta.24: 「Skip Intro」 stayed in the reader and the first story line was lost): while the picked stream is a short label (no prose row), the first sample that is a full sentence (5+ words ending in . ! ? … or a quote) is enough to take over */const ownProse=!!own&&String(own.sample||'').split(/\n+/).some(x=>x.trim().split(/\s+/).length>=5);const sentence=String(threads.find(t=>t.id===best.id)?.sample||'').split(/\n+/).some(x=>x.trim().split(/\s+/).length>=5&&/[.!?…"”]\s*$/.test(x.trim()));if(!best.long||best.changes<(ownProse||!sentence?2:1)||(ownProse&&best.changes<=o.changes))return false;}
  tried.add(best.id);if(mine)tried.add(mine);this.foreignPicked=best.id;this.trace('foreign stream pick id='+best.id+' mapped='+best.n+(mine?' (was '+mine+')':''));this.select(best.id);return true;}catch{return false;}}
 languageCheck(text){try{const t=String(text||'').replace(/%l[^;%]*;[^%]*%l;/g,'');if(!t.trim())return;
  /* 2026-11-13 (user: DDLC Plus in English showed nothing and said nothing): three story-length lines in a row with no
     Japanese and no Chinese, that the script could not map back to Japanese, raise a notice to switch the game to Japanese */
  {const latin=!/[\u3040-\u30ff\u4e00-\u9fff]/.test(t)&&(t.match(/[A-Za-z\u00c0-\u024f\uac00-\ud7af]/g)||[]).length>=12&&/\s|[\uac00-\ud7af]/.test(t.trim());const mapped=latin&&!!this.foreignJapanese(t);this.foreignRun=latin&&!mapped?(this.foreignRun||0)+1:0;
   if(this.foreignRun>=3&&!this.state?.sourceForeign){this.trace('source looks like a non-Japanese language');this.notify({sourceForeign:true,hookMessage:'检测到游戏目前显示的不是日文（例如英文），MeguLit 需要日文原文。请在游戏自己的设置或 Steam（游戏属性 → 语言）里切换成日文后继续'});}
   else if(/[\u3040-\u30ff]/.test(t)&&this.state?.sourceForeign)this.notify({sourceForeign:false});}
  if(!HookNative.sjis){const dec=new TextDecoder('shift_jis'),set=new Set();for(let a=0x81;a<=0xfc;a++)for(let b=0x40;b<=0xfc;b++){const c=dec.decode(Buffer.from([a,b]));if(c.length===1&&c!=='�')set.add(c);}HookNative.sjis=set;}
  const han=t.match(/[一-鿿]/g)||[],kana=/[぀-ヿ]/.test(t),foreign=han.filter(c=>!HookNative.sjis.has(c)).length;
  /* E347 (user 2026-11-10, Steam 沙耶の唄 with a Chinese patch): Chinese text read as Shift-JIS comes out as kanji mixed
     with half-width katakana (ｹｯｦ) and boxes, which also counts as a Chinese build. */
  const garbled=han.length>=4&&(t.match(/[\uff61-\uff9f\u25a1\ufffd]/g)||[]).length>=3;
  const chinese=(!kana||garbled)&&han.length>=4;this.chineseRun=chinese?(this.chineseRun||0)+1:0;this.chineseForeign=chinese?(this.chineseForeign||0)+foreign:0;
  if(this.chineseRun>=3&&(this.chineseForeign>=2||garbled)&&!this.state?.sourceChinese){this.trace('source looks like Simplified Chinese');this.notify({sourceChinese:true,hookMessage:'检测到游戏剧本目前是中文，MeguLit 需要日文原文。请先在游戏设置或 Steam（游戏属性 → 语言）里改成日文；游戏本身不支持日文的话，用「工具 → 日文原版恢复」；如果游戏目录里没有检测到日文剧本，需要先自行获取日文原版资源，再选「从日文原版导入」，支持直接导入生肉压缩包，自动恢复成日文'});}
  else if(kana&&this.state?.sourceChinese)this.notify({sourceChinese:false});}catch{}}
 /* E407 choices (every engine): text from the hook's non-dialogue streams is collected (never written back), OCR finds
    each choice's row on screen, and the reader draws ruby and translation over the buttons. Every step is logged to
    hook-events.log under "choice". */
 /* 2026-11-12 (user: art text in the opening and during play must be readable, the game keeps drawing it and MeguLit lays an
    invisible copy and the translation over it): a Japanese line from another stream that is not the current dialogue line
    is looked for on the picture (PageLocator art mode); once per text within 20 s. */
 artCandidate(text){try{const t=String(text||'').trim(),flat=HookNative.flat(t);if(typeof this.artLocate!=='function'||[...flat].length<2||[...flat].length>60)return;
  {const lt=require('./language-tracks.cjs');if(lt.stuttered(t)||lt.soundCaption(t))return;}
  if(!/[぀-ヿ㐀-鿿]/.test(flat)||/[\/:]/.test(t)||/[<>{}\[\]=@]/.test(t))return;
  if(this.lastSource&&(HookNative.flat(this.lastSource).includes(flat)||flat.includes(HookNative.flat(this.lastSource))))return;
  const now=this.now(),seen=this.artSeen||(this.artSeen=new Map());const last=seen.get(flat);if(last!=null&&now-last<20000)return;seen.set(flat,now);if(seen.size>200)seen.delete(seen.keys().next().value);
  this.trace('art text located '+JSON.stringify(t.slice(0,40)));this.artLocate(t);}catch{}}
 /* 2026-11-12 art scan, the OCR read path (user: opening titles, credits, chapter cards bilingual in every game, also when
    no hook stream carries them; ファタモルガーナの館's opening lines are pictures). Wanted while the engine says its text window
    is hidden, or no hook line arrived for 2 s: PageLocator then reads the picture when it changes and sends Japanese rows
    that are not the current dialogue line (dialog, speaker; band = the lower text-box band is skipped while a line is
    current) as artText. OCR only reads; the game keeps drawing the text. */
 artScanState(now=this.now()){const hidden=this.engineDialog===false,line=String(this.lastSource||'').trim(),current=!!line&&!hidden;
  const on=hidden||!line||now-(this.lastSourceAt||0)>2000;
  return {on,dialog:current?line.slice(0,600):'',speaker:current?String(this.state?.hookSpeaker||'').slice(0,40):'',band:current,foreign:this.foreignArtReady()};}
 auxText(m){this.artCandidate(m.text);const C=this.choice||(this.choice=this.newChoiceCapture());const added=C.add(m.text,this.lastSource,this.speaker?.text);
  this.trace('choice aux '+String(m.sourceName||'').slice(0,40)+' role='+(m.role??'')+' added='+JSON.stringify(added)+' text='+JSON.stringify(String(m.text).slice(0,80)));
  if(!added.length)return;clearTimeout(this.choiceTimer);this.choiceTimer=setTimeout(()=>this.requestChoices(0),450);this.choiceTimer.unref?.();}
 requestChoices(round){const options=round>0&&this.choiceOptions?this.choiceOptions:this.choice?.options();
  if(!options){this.trace('choice candidates too few n='+(this.choice?.items.length||0));return;}
  if(typeof this.locateChoices!=='function'){this.trace('choice locate unavailable');return;}
  this.choiceOptions=options;this.choiceRound=round;this.trace('choice locate round='+round+' options='+JSON.stringify(options));this.locateChoices(options);}
 choiceBoxes(m){if(process.env.MEGULIT_HOOK_RECORD)try{fs.appendFileSync(process.env.MEGULIT_HOOK_RECORD,JSON.stringify({t:this.now(),m:{...m,type:'hookChoiceBoxes'}})+'\n');}catch{}const n=v=>Number.isFinite(Number(v))?Math.round(Number(v)):0,items=(Array.isArray(m.items)?m.items:[]).filter(i=>i&&typeof i.text==='string').slice(0,12).map(i=>({text:i.text.slice(0,120),x0:n(i.x0),y0:n(i.y0),x1:n(i.x1),y1:n(i.y1)}));
  this.trace('choice ocr '+String(m.status||'')+' found='+items.length+' boxes='+JSON.stringify(items.map(i=>[i.text,i.x0,i.y0,i.x1,i.y1]))+' missed='+JSON.stringify(m.missed||[])+' screen='+m.sw+'x'+m.sh+' rows='+JSON.stringify(m.rows||[]));
  if(!this.choiceOptions)return;
  {const fixed=placeChoices(items,this.choiceOptions,Array.isArray(m.missed)?m.missed.map(String):[],this.choice?.order);if(fixed.length!==items.length)this.trace('choice placed '+JSON.stringify(fixed.map(i=>[i.text,i.x0,i.y0,i.x1,i.y1])));items.splice(0,items.length,...fixed);}
  /* 2026-11-13 one box is enough when every other option is only ellipses (nothing to read or translate there) */
  if(items.length>=2||items.length===1&&this.choiceOptions.length>=2&&(m.missed||[]).length>0&&(m.missed||[]).every(s=>SYMBOL_OPTION.test(String(s)))){this.choice.active=true;this.notify({hookChoices:{items,sw:n(m.sw),sh:n(m.sh),at:this.now(),/* options on screen OCR could not box (ellipsis rows): the reader keeps clear of them */unboxed:Math.max(0,this.choiceOptions.length-items.length)}});
   /* the buttons can move (hover, animation): read them again a few times while the choice screen is up */const r=(this.choiceRound||0)+1;if(r<=8){clearTimeout(this.choiceTimer);this.choiceTimer=setTimeout(()=>{if(this.choice?.active)this.requestChoices(r);},1500);this.choiceTimer.unref?.();}}
  else if(this.choice?.active)this.clearChoices('choices no longer on screen');}
 /* 2026-11-13 the choice detector also knows the names learned from bare name lines (CLANNAD 「朋也」) */newChoiceCapture(){const C=new ChoiceCapture(()=>this.now());C.extraNames=()=>this.knownSpeakers||[];return C;}
 clearChoices(why,keep=0,line=''){clearTimeout(this.choiceTimer);const shown=!!this.choice?.active||!!this.state.hookChoices;this.choice?.reset(keep,line);this.choiceOptions=null;/* 2026-11-13 candidates that came with the line itself are asked for again */if(keep&&this.choice?.items.length){this.choiceTimer=setTimeout(()=>this.requestChoices(0),450);this.choiceTimer.unref?.();}if(!shown)return;this.trace('choice cleared: '+why);this.notify({hookChoices:null});}
 /* E542 (user, CLANNAD HD prologue: one sentence per click, but eight sentences arrived as one line): HookBridge marks an
    output that is exactly several separate engine callbacks with parts (oldest first) and partsAgeMs. Only the first part
    is shown; each advance input of the player (click / Space / Enter in the game, readerInput) shows the next. Inputs made
    after the first callback but before LunaHost flushed the batch already advanced the game, so they are replayed. A
    held skip shows the last part at once. Any new line from the game drops what is left. */
 sourcePage(m,name){
  const parts=Array.isArray(m.parts)?m.parts.map(p=>String(p||'').trim()).filter(Boolean):[];
  this.pageQueue=null;
  if(parts.length<2||parts.join('')!==String(m.text).trim()||this.skipKey){this.source(m,name);return;}
  const now=this.now(),age=Math.max(0,Number(m.partsAgeMs)||0),since=now-age;
  const done=(this.advanceTimes||[]).filter(t=>t>=since&&t<=now).length,first=Math.min(done,parts.length-1);
  this.trace('page parts '+parts.length+' shown from '+(first+1));
  const base={...m};delete base.parts;delete base.partsAgeMs;
  this.pageQueue={base,name,rest:parts.slice(first+1)};this.partAt=now;
  this.source({...base,text:parts[first]},name);
 }
 advance(){
  const now=this.now();this.advanceTimes=(this.advanceTimes||[]).filter(t=>now-t<20000);this.advanceTimes.push(now);
  const q=this.pageQueue;if(!q||!q.rest.length){this.pageQueue=null;return false;}
  /* a double click or key repeat is one advance */if(now-(this.partAt||0)<250)return false;this.partAt=now;
  const next=q.rest.shift();if(!q.rest.length)this.pageQueue=null;
  this.trace('page part advance '+JSON.stringify(next.slice(0,20)));this.source({...q.base,text:next},q.name);return true;
 }
 source(m,name){
  /* E560 Unity setter streams: typewriter steps and whole NVL pages become the one paragraph the game is on (core/unity-source.cjs) */
  {const code=String(m.sourceCode||'');if(code.endsWith(':JIT:UNITY')&&!m.unityBoxed&&typeof m.text==='string'&&!this.skipKey){const {UnityBox}=require('./unity-source.cjs');(this.unityBox||(this.unityBox=new UnityBox(()=>this.now(),(line,p)=>this.source({...p.m,text:line,unityBoxed:true},p.name)))).feed(code,cleanSource(m.text,name,code),{m,name});return;}}
  /* 2026-11-12 (ファタモルガーナの館: "……けれど……", drawn large in the middle of the opening, was hidden and shown as a subtitle
     at the bottom): while the engine says its text window is hidden, a line is art text. HookBridge leaves it to the game;
     here it goes to the art layer (invisible readable copy + translation where the game drew it), not to the subtitles. */
  if(this.engineDialog===false&&typeof m.text==='string'&&m.text.trim()){this.trace('art text (text window hidden) '+JSON.stringify(m.text.slice(0,40)));this.artSeen?.delete(HookNative.flat(m.text.trim()));this.artCandidate(m.text);return;}
  // The game's own ruby readings ride after the line as \x1d base \x1c reading pairs (ISLAND hook): split them off
  // before anything else sees the text, and attach them when this line is delivered (user, 2026-11-03).
  /* 2026-11-14 (ダストマニア・グロテスク, Chinese patch): Shift-JIS read as GBK becomes the Japanese it was (core/text-sanity.cjs) */
  if(typeof m.text==='string'){const fixed=require('./text-sanity.cjs').repairShiftJisAsGbk(m.text);if(fixed){this.trace('source repaired Shift-JIS read as GBK '+JSON.stringify(fixed.slice(0,20)));m={...m,text:fixed};}}
  const extracted=require('./source-ruby.cjs').extractSourceRuby(m.text);let ruby=extracted.ruby;m={...m,text:extracted.text};this.languageCheck(m.text);
  // Multilingual containers keep only the Japanese track (E243); streams that deliver every line several times (or every character doubled) are learned and undone per stream (E215).
  this.repeats=this.repeats||new (require('./repeat-normalizer.cjs').RepeatNormalizer)();
  this.attempt=0;/* 2026-11-13 (user: DDLC Plus set to English showed nothing): a line in another language is first looked up in the
     game's own parallel language tables (foreignJapanese, original-text.cjs), so the reader gets the Japanese line */
  {const raw=scriptSource(cleanSource(m.text,name,String(m.sourceCode||'')));const ja=this.foreignJapanese(raw);if(ja){m={...m,text:ja};}}
  let text=this.originalTextFor(this.repeats.normalize(String(m.sourceCode||m.sourceName||name||''),require('./language-tracks.cjs').japaneseTrack(scriptSource(cleanSource(m.text,name,String(m.sourceCode||''))))).replace(/\n+$/,''));
  if(!text.trim())return;
  /* 2026-11-13 multi-language container (サノバウィッチ 日简繁): the game's own Chinese track is this line's official translation */{const zh=require('./language-tracks.cjs').chineseTrack(scriptSource(cleanSource(m.text,name,String(m.sourceCode||''))),text);if(zh){const k=text.replace(/\s+/g,'');(this.trackPairs||(this.trackPairs=new Map())).set(k,zh);if(this.trackPairs.size>4000)this.trackPairs.delete(this.trackPairs.keys().next().value);}}
  /* E408 one frame holding the line twice (redraw), collapsed only on same-stream evidence */{const stream=String(m.sourceCode||m.sourceName||name||'');this.sourceStream=stream;const dbl=(this.doubles||(this.doubles=new DoubleLine(()=>this.now()))).fix(stream,text,this.lastSource);if(dbl.collapsed){this.trace('source doubled collapsed ('+dbl.reason+') chars='+text.length+'->'+dbl.text.length);text=dbl.text;}}
  /* E320 WITCH ON THE HOLY NIGHT (flow page): its title-screen help ("Change text display speed.Change auto-scroll speed." ...) came through the dialogue hook
     and was read as a story line, and one line once arrived twice in one piece. Text without any Japanese is menu/help text here, and a line made of
     the same sentence twice is that sentence. */
  if(this.flowPage)this.syncEmbedMode();
  if(this.flowPage){if(!this.flowStory(text)){
    /* E532 (user: ファタモルガーナの館 opening 「館がある」「聖なるかな」 stayed Japanese only): a short Japanese card with no sentence stop is
       opening/title-card text, not menu help. It goes to the art path (located on the picture, translated in the original's style)
       and the selected stream stays: switching on every card made the streams flip every 2 s and resend the story line. */
    if(HookNative.artCard(text)){this.trace('flow page: title card to art '+JSON.stringify(text.slice(0,40)));this.artCandidate(text);return;}
    this.trace('flow page: not a story line, dropped (menu/help) '+JSON.stringify(text.slice(0,40)));this.flowStreamCheck(true);return;}
   const once=HookNative.undouble(text);if(once!==text){this.trace('flow page: doubled line collapsed chars='+text.length);this.source({...m,text:once},name);return;}}
  /* E282 (user: game ruby first): readings the game's own script gives this line (KiriKiri Z scene files) join the ruby
     the hook delivered; only for a line the script matched, and never twice for one base. */
  if(this.originalText?.kind==='patch'){const r=this.resolveSource(text);if(r&&Array.isArray(r.ruby)&&(r.status==='exact'||r.status==='high'||r.method==='untranslated'))for(const pair of r.ruby)if(!ruby.some(q=>q[0]===pair[0]))ruby.push(pair);}
  // v1.1.5: a line of another language track (Traditional/Simplified Chinese) inside a Japanese stream is not dialogue to read.
  {const lt=require('./language-tracks.cjs');if(lt.soundCaption(text)||lt.stuttered(text)){this.trace('drop caption/typewriter frame '+JSON.stringify(text.slice(0,40)));return;}if(lt.scriptIdentifier(text)){this.trace('drop script identifier '+JSON.stringify(text.slice(0,40)));return;}if(lt.borrowedCode(text)){this.trace('drop borrowed-code (Chinese patch) line '+JSON.stringify(text.slice(0,40)));if(!this.japaneseStream)this.notify({hookNotice:'这句是汉化补丁的「借码」文字，不是日文原文（常见于汉化版存下的存档）。MeguLit 不会读取它；请从日文原版存的档或新游戏开始',hookNoticeAt:this.now()});return;}if(lt.foreignLine(text)&&this.japaneseStream){this.trace('drop foreign-language line '+JSON.stringify(text.slice(0,40)));return;}if(/[ぁ-ゟァ-ヺ]/u.test(text))this.japaneseStream=true;}
  // The game's own LOG/backlog (E215.2, user: hide MeguLit there and do not read it): opening it replays lines read
  // earlier, several within a second. Two or more earlier lines (other than the current one) inside one second mark the
  // LOG: those lines are neither read nor recorded and the reader hides; it returns after 1.5 s without replays or at
  // the first new line. A single repeated line (a script repeating itself) is read as usual.
  {const L=this.nativeLog||(this.nativeLog={seen:new Map(),hits:[],active:false,timer:null}),now=this.now(),key=text.replace(/\s+/g,'');
   const current=key===String(this.lastSource||'').replace(/\s+/g,''),replay=L.seen.has(key)&&(!current||L.active||!!L.held);L.hits=L.hits.filter(t=>now-t<1000);if(replay)L.hits.push(now);
   const end=()=>{if(!L.active)return;L.active=false;clearTimeout(L.timer);L.timer=null;this.trace('native log closed');this.notify({hookNativeLog:false});};
   if(L.bypass===key)L.bypass=null;
   else if(replay&&(L.active||L.hits.length>=2)){if(!L.active){L.active=true;L.held=null;this.trace('native log detected; reading paused');this.notify({hookNativeLog:true});}
    clearTimeout(L.timer);L.timer=setTimeout(end,1500);L.timer.unref?.();return;}
   // The first earlier line waits 0.4 s: a LOG sends the next one at once, a script repeating one line does not.
   else if(replay){const held=L.held={m,name};const timer=setTimeout(()=>{if(L.held!==held)return;L.held=null;L.bypass=key;this.source(m,name);},400);timer.unref?.();return;}
   if(!replay)end();L.seen.delete(key);L.seen.set(key,now);if(L.seen.size>3000)L.seen.delete(L.seen.keys().next().value);}
  // Scene/chapter keys and asset ids ("10_1", "bg_01.png", "Chapter2") from engine string streams are never dialogue.
  if(identifierNoise(text)){this.trace('drop identifier text '+JSON.stringify(text.slice(0,60)));return;}
  if(ruby.length){const map=this.sourceRuby||(this.sourceRuby=new Map());map.set(text,ruby);if(map.size>64)map.delete(map.keys().next().value);}
  if(m.sourceName==='EmbedToMeCS2_DrawPreserve'){if(m.origin==='history'&&this.state.receivedText)return;this.queueIslandSource(text,m.origin);return;}
  this.locatePage(text,m.origin);
  if(this.pageRoute(text,m.origin))return;
  if(!/EmbedToMeCS2_DrawPreserve|EmbedEuphoria474_DrawHide/.test(m.sourceName||'')){this.deliverSource(text,m.origin);return;}
  const pending=this.pendingSource;
  if(pending&&text!==pending.text&&!text.startsWith(pending.text)&&!pending.text.startsWith(text))this.flushSource();
  if(this.pendingSource){if(text.length>=this.pendingSource.text.length)this.pendingSource={text,origin:m.origin};return;}
  this.pendingSource={text,origin:m.origin};const serial=this.serial;this.sourceTimer=setTimeout(()=>{if(serial===this.serial)this.flushSource();},40);this.sourceTimer.unref?.();
 }
 /* E300 KiriKiri full-screen pages (user: ライムライト・レモネードジャム keeps several paragraphs on screen, each line where the
    game wrapped it). MeguLitKrkr32.dll reports each sentence of a KAG message layer (hookEngineLine): begin at its first
    character, end at its click wait with the box it filled and the text it drew, a newline at every row the game started.
    On a full-screen layer (nvl) each sentence becomes one page line at its own place, as on ISLAND: a new page clears the
    old one at its first character (page line 2n-1), the sentence itself is delivered at its end (page line 2n) with the
    game's own breaks. The hook's text for it (it arrives with the first character) is the original when the drawn text
    differs (blanked or written back by the embed), re-broken at the same rows. Hook lines no page sentence takes within
    1.5 s are dropped while the page is up, and delivered as usual once the game is back in its ADV box (nvl=0), so ADV
    KiriKiri games read exactly as before.
    E301: the same protocol carries Ren'Py (MeguLitRenpy32/64.dll + native/MeguLitRenpy.py, NVL pages); every name
    here takes the engine from the report (PAGE_ENGINES), positions go out as <engine>_screen_v1. */
 pageReset(){if(this.pageState)clearTimeout(this.pageState.timer);this.pageState=null;this.pageMode=null;this.flowMarkerAt=null;}
 pageNvl(){return this.pageMode?.mode==='nvl'&&this.now()-this.pageMode.at<120000;}
 pageLine(m){
  // E320: a flow page (WoH) is laid out by the reader from the text box; the screen OCR locator placed the same lines again (doubles, jumps).
  if(this.flowPage&&m.engine==='ocr')return;
  if(!Number.isSafeInteger(m.line)||m.line<1||!['begin','end'].includes(m.phase))return;
  const now=this.now(),engine=m.engine,K=this.pageState&&this.pageState.engine===engine?this.pageState:(this.pageReset(),this.pageState={engine,lines:new Map(),held:[],timer:null});
  if(!m.nvl){if(this.pageMode?.mode==='nvl')this.trace(engine+' page mode off');this.pageMode={mode:'adv',engine,at:now};this.releasePageHeld();
   /* E550 ADV sentence: where the engine draws it (canvas pixels, with the canvas size) and its colour, so the reader places and
      paints each line like the game without calibration (web text-position.js, <engine>_adv_v1). */
   if(engine!=='ocr'&&m.sw>0&&m.sh>0)this.emit({type:'hookTextPos',engine:engine+'_adv_v1',line:m.line,token:m.line,phase:m.phase,x0:m.x0,y0:m.y0,x1:m.x1,y1:m.y1,size:m.size,sw:m.sw,sh:m.sh,count:m.count,...(typeof m.color==='string'&&/^#[0-9a-f]{6}$/i.test(m.color)?{color:m.color}:{}),at:now});
   /* 2026-11-13 (adapt/krkr-bgi, live 女王蜂の王房 めのう編): the engine line carries the whole sentence it drew, but the text stream
      the hook picked (a name-entry label) said nothing for it, so the reader stayed on 「めのう輝夜」. When no hook source arrived
      while this line was drawn, its drawn text is the line (same-text dedupe in emitSource keeps a late hook copy out). */
   if(engine!=='ocr'){if(m.phase==='begin')this.advBeginAt=now;else{const drawn=String(m.text||'').replace(/^\n+|\n+$/g,''),began=this.advBeginAt||now;
    const heard=()=>this.lastSourceAt>=began&&this.lastSourceAt!==this.advOwnAt;if(drawn.trim()&&!heard()){clearTimeout(this.advTextTimer);this.advTextTimer=setTimeout(()=>{if(heard()||HookNative.flat(this.lastSource)===HookNative.flat(drawn))return;this.trace(engine+' adv line '+m.line+' from the engine draw (stream silent)');this.emitSource(this.originalTextFor(drawn),'live');this.advOwnAt=this.lastSourceAt;},400);this.advTextTimer.unref?.();}}}
   return;}
  if(this.pageMode?.mode!=='nvl')this.trace(engine+' page mode on');this.pageMode={mode:'nvl',engine,at:now};
  let e=K.lines.get(m.line);if(!e){e={line:m.line,same:m.same===true,hookText:'',origin:'live',ended:false,at:now};K.lines.set(m.line,e);if(K.lines.size>64)K.lines.delete(K.lines.keys().next().value);
   if(!e.same)this.emit({type:'hookPage',engine,line:m.line*2-1,same:false,token:0,at:now});}
  if(!e.hookText){const h=K.held.shift();if(h){e.hookText=h.text;e.origin=h.origin;}}
  // OCR reports after the hook line: the first sentence of a page was already delivered as an ordinary line; it is re-read as the page's.
  if(!e.hookText&&engine==='ocr'&&this.lastSource&&HookNative.flat(this.lastSource)===HookNative.flat(String(m.text||'')))e.hookText=this.lastSource;
  if(m.phase!=='end'||e.ended)return;e.ended=true;
  const drawn=HookNative.pageText(String(m.text||''),e.hookText),text=e.hookText||!drawn?drawn:this.originalTextFor(drawn);
  if(!text){this.trace(engine+' page line '+m.line+' had no readable text');return;}
  const token=IslandSource.token(text),line=m.line*2;
  this.emit({type:'hookPage',engine,line,same:e.same,token,at:now});
  this.emit({type:'hookTextPos',engine:engine+'_screen_v1',line,token,x0:m.x0,y0:m.y0,x1:m.x1,y1:m.y1,size:m.size,sw:m.sw,sh:m.sh,count:m.count,...(typeof m.color==='string'&&/^#[0-9a-f]{6}$/i.test(m.color)?{color:m.color}:{}),at:now});
  this.emitSource(text,e.origin==='history'?'live':e.origin,engine,line);
 }
 // The drawn text keeps the game's rows; the hook's text is the original when they differ (same length: re-broken there).
 static flat(v){return String(v||'').replace(/[ \u3000\r\n]/g,'');}
 static pageText(drawn,hook){const flat=v=>v.replace(/[ \u3000\r\n]/g,''),own=drawn.replace(/^\n+|\n+$/g,'');
  if(hook&&flat(hook)!==flat(own)){const rows=own.split('\n').map(r=>[...r].length),chars=[...hook.replace(/\n/g,'')];if(rows.length<2||rows.reduce((a,b)=>a+b,0)!==chars.length)return hook;
   let at=0;return rows.map(n=>{const r=chars.slice(at,at+n).join('');at+=n;return r;}).join('\n');}
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(own)?own:hook||'';}
 pageRoute(text,origin){
  if(!this.pageNvl())return false;
  const K=this.pageState,now=this.now(),open=[...K.lines.values()].reverse().find(e=>!e.ended&&!e.hookText&&now-e.at<3000);
  if(open){open.hookText=text;open.origin=origin||'live';return true;}
  K.held.push({text,origin:origin||'live',at:now});if(K.held.length>8)K.held.shift();this.schedulePageHeld();return true;
 }
 schedulePageHeld(){const K=this.pageState;if(!K)return;clearTimeout(K.timer);if(!K.held.length)return;const serial=this.serial,wait=Math.max(0,K.held[0].at+HookNative.holdFor(K.engine)-this.now());K.timer=setTimeout(()=>{if(serial===this.serial)this.expirePageHeld();},wait);K.timer.unref?.();}
 expirePageHeld(){const K=this.pageState;if(!K)return;const now=this.now(),keep=[];for(const h of K.held){if(now-h.at<HookNative.holdFor(K.engine)){keep.push(h);continue;}if(this.pageNvl()&&K.engine!=='ocr')this.trace(K.engine+' page: hook line drawn nowhere on the page, dropped chars='+h.text.length);else this.deliverSource(h.text,h.origin);}K.held=keep;this.schedulePageHeld();}
 /* E306: engines without a page DLL are located on the picture (OCR, PageLocator.cs in GalWindowBridge). Each live hook
    line is sent there (gal-native sets this.locate) unless a native page engine (krkr / renpy) reported in the last
    10 minutes; ISLAND lines never get here. The OCR answer takes up to ~3.5 s, so on an OCR page a held hook line waits
    5 s, and one the picture never showed is delivered as an ordinary line instead of dropped (OCR may simply miss it). */
 locatePage(text,origin){if(this.flowPage||typeof this.locate!=='function'||(origin&&origin!=='live'))return;const P=this.pageState;if(P&&P.engine!=='ocr'&&this.now()-(this.pageMode?.at||0)<600000)return;if(this.originalReplaced()){if(!this.locateSkipLogged){this.locateSkipLogged=true;this.trace('ocr page skipped: the game draws the replaced line, not the original');}return;}this.locateSkipLogged=false;try{this.locate(text);}catch{}}
 /* Issue 120/121 (Pal, no engine coordinates): while the selected stream's text is replaced the game never draws the original, so reading the screen for it only misses (34 of 34 lines) and spends four OCR passes a line. The fallback runs on lines where the original is on screen: read-only, the baseline line, a calibration line, or an unhidden profile. */
 /* Pal (issues 120/121): MeguLitHook32 reports each text-sprite transaction (ToMe_TEXTPOS engine=pal_sprite_v1) with an FNV-1a
    token of its drawn text without whitespace, 0 when every glyph is blank (MeguLit hid the line). A transaction is passed on
    only when it is the current hook line: same token, or blank while the original is replaced and about as long. Speaker
    plates and other sprites pair with nothing. A draw may reach MeguLit before its hook line: it waits up to 3 s. The token
    sent on is the hook line's own (the one position calibration pairs samples by). */
 static palKey(text){let h=2166136261;for(const c of String(text||'').replace(/\s+/g,''))for(let i=0;i<c.length;i++)h=Math.imul(h^c.charCodeAt(i),16777619);return h>>>0;}
 static sourceToken(text){let h=2166136261;const t=String(text||'');for(let i=0;i<t.length;i++)h=Math.imul(h^t.charCodeAt(i),16777619);return h>>>0;}
 palMatches(m,text){if(!text)return false;if(m.token===HookNative.palKey(text))return true;const n=String(text).replace(/\s+/g,'').length;return m.token===0&&this.originalReplaced()&&n>0&&m.count>=Math.ceil(n*.5)&&m.count<=n*2+2;}
 palPosition(m){const q=this.palQueue||(this.palQueue=[]),now=this.now();if(this.palMatches(m,this.lastSource)){this.emit({...m,token:HookNative.sourceToken(this.lastSource)});return;}q.push({m,at:now});while(q.length>12||q.length&&now-q[0].at>3000)q.shift();}
 palFlush(){const q=this.palQueue;if(!q?.length)return;const now=this.now(),text=this.lastSource;this.palQueue=[];for(const e of q)if(now-e.at<=3000&&this.palMatches(e.m,text))this.emit({...e.m,token:HookNative.sourceToken(text)});}
 originalReplaced(){return this.enabled===true&&this.preferences?.hookHide!==false&&['clear-requested','callback-acknowledged','user-verified'].includes(this.state?.replacementState);}
 // "A。A。" (also with the game's leading ideographic spaces) -> "A。"; anything else unchanged.
 static undouble(text){const n=text.replace(/[\s\u3000]/g,'');if(n.length<12||n.length%2||n.slice(0,n.length/2)!==n.slice(n.length/2)||!/[。！？!?」』…―）)]$/.test(n))return text;
  let seen=0;for(let i=0;i<text.length;i++){if(!/[\s\u3000]/.test(text[i])&&++seen===n.length/2)return text.slice(0,i+1);}return text;}
 /* E349 (user, WoH 1.2.7: "不替换也不隐藏也不内嵌", the overlay showed only control hints such as "ボイスを再生します").
    TYPE-MOON's hook point carries two streams with the same hook code: the story text and the title/menu control hints.
    The hint stream appears first (title screen) and the remembered stream is matched by hook code, so the hints were
    selected and the story was neither read, hidden nor replaced. A story line is one the game's own script table has
    (original-text provider); without the table, one with the game's paragraph indent, a quote or sentence-final
    punctuation. A selected stream whose text is not story is switched to the stream that carries story. */
 /* E532 a title card: 2-40 characters of Japanese with kana or kanji, no long katakana run (BGM/effect/resource names such as
    「女中のテーマピアノソロ」), no ASCII words and no control help. A false hit costs nothing: the art path shows it only when OCR
    finds that text on the picture. */
 static artCard(text){const t=String(text||'').replace(/<r[^<>]*>|<\/r>/g,'').replace(/\s+/g,'');const n=[...t].length;return n>=2&&n<=40&&/[぀-ゟ㐀-鿿]/.test(t)&&!/[゠-ヿ]{4,}/.test(t)&&!/[A-Za-z]{2,}/.test(t)&&!HookNative.uiHelp(String(text||''));}
 flowStory(text){const t=String(text||'').replace(/<r[^<>]*>|<\/r>/g,'').trim();if(!t||!/[\u3040-\u30ff\u3400-\u9fff]/.test(t)&&!/^[「『“]/.test(t)||HookNative.uiHelp(String(text||'')))return false;
  /* E353 (offline replay of the whole WoH table): the table only ever says YES. A line it holds is story even when the
     official Chinese left it as it is (names such as 「青子。」); a line it cannot match (spells written <rソウ>[swel]</r>,
     Latin with katakana ruby) falls through to the layout test instead of being dropped. The hint test sees the indent. */
  try{const r=this.originalText?this.resolveSource(t):null;if(r&&(r.status&&r.status!=='none'||r.method==='untranslated'))return true;}catch{}
  return /^[\u3000「『“（(]/.test(String(text||''))||/[。！？!?…」』”）)―]$/.test(t);}
 flowStreamCheck(now=false){if(!this.flowPage||!this.process)return false;const threads=this.state.hookThreads||[],cur=threads.find(t=>t.selected);if(!cur||!now&&(!cur.sample||this.flowStory(cur.sample)))return false;
  const next=threads.filter(t=>t.id!==cur.id&&t.sample&&this.flowStory(t.sample)).sort((a,b)=>(b.embeddable===true)-(a.embeddable===true))[0];if(!next)return false;
  if(this.flowSwitchAt&&this.now()-this.flowSwitchAt<2000)return false;this.flowSwitchAt=this.now();this.trace('flow page: selected stream carries menu/help text, switching to '+next.id);this.select(next.id);return true;}
 /* E350 (user, WoH: hovering the top control bar filled the page with its tooltips, run together). Control hints are short
    descriptions ending in ます/します/ません with no sentence stop, no quote and no paragraph indent; a hover over several
    buttons joins them into one string. Such text (each joined piece) is never a story line and never a stream to pick. */
 static uiHelp(text){const t=String(text||'').replace(/<r[^<>]*>|<\/r>/g,'').replace(/\s+$/,'');if(!t||/[「」『』“”。！？!?]/.test(t)||/^[\u3000\s]/.test(t))return false;
  const parts=t.split(/(?<=ます|ません)/).map(p=>p.trim()).filter(Boolean);return parts.length>0&&parts.every(p=>/(?:ます|ません)$/.test(p)&&[...p].length<=32);}
 static holdFor(engine){return engine==='ocr'?5000:1500;}
 releasePageHeld(){const K=this.pageState;if(!K)return;const held=K.held;K.held=[];clearTimeout(K.timer);for(const h of held)this.deliverSource(h.text,h.origin);}
 // A render burst can report several sentences before the host flushes their source frames.
 // Join every native line, in draw order; a later token must never overwrite an earlier unmatched line.
 islandPage(m){
  if(m.engine!=='cs2'||!Number.isSafeInteger(m.token)||m.token<0||m.token>0xffffffff||!Number.isSafeInteger(m.line)||m.line<1||(this.islandDraw&&m.line<=this.islandDraw.line))return;
  this.islandDraw={token:m.token,line:m.line,at:this.now()};this.islandDraws.push(this.islandDraw);
  if(this.islandDraws.length>64)this.islandDraws.shift();
  clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;this.pendingSource=null;this.drainIsland();
 }
 drainIsland(){
  clearTimeout(this.islandTimer);
  while(this.islandDraws.length){const draw=this.islandDraws[0],candidate=this.islandSources.get(draw.token),age=this.now()-draw.at;
   if(!candidate||this.now()-candidate.at>=5000){
    // Ordered delivery keeps a burst's earlier lines (240 ms before a later ready line moves on). The newest draw blocks
    // nothing, so its frame may be later: dropping it at 240 ms hid the original with no ToMe text (Opus 5.5, 2026-11-02).
    const limit=this.islandDraws.length===1?1500:240;
    if(age<limit){const serial=this.serial;this.islandTimer=setTimeout(()=>{if(serial===this.serial)this.drainIsland();},limit-age);this.islandTimer.unref?.();return;}
    this.trace('ISLAND missing source line='+draw.line+' token='+draw.token);this.islandDraws.shift();continue;
   }
   this.islandDraws.shift();if(draw.line<=this.islandDelivered)continue;this.islandDelivered=draw.line;
   this.deliverSource(candidate.text,candidate.origin,'cs2',draw.line);
  }
 }
 queueIslandSource(text,origin){
  const key=IslandSource.token(text);this.islandSources.set(key,{text,origin,at:this.now()});
  if(this.islandSources.size>64)this.islandSources.delete(this.islandSources.keys().next().value);
  if(this.islandDraw){this.drainIsland();return;}
  // Preserve read-only startup capture until the first native draw report is available.
  const serial=this.serial,pending=this.pendingSource;
  if(pending){pending.callbacks=(pending.callbacks||1)+1;if(text===pending.text||pending.text.startsWith(text))return;pending.text=text;pending.origin=origin;}
  else{this.pendingSource={text,origin,callbacks:1};this.sourceDeadline=setTimeout(()=>{if(serial===this.serial)this.flushSource();},240);this.sourceDeadline.unref?.();}
  clearTimeout(this.sourceTimer);this.sourceTimer=setTimeout(()=>{if(serial===this.serial)this.flushSource();},80);this.sourceTimer.unref?.();
 }
 flushSource(){clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;const pending=this.pendingSource;this.pendingSource=null;if(pending){if(pending.callbacks&&this.islandDraw){this.drainIsland();return;}if(pending.callbacks)this.trace('ISLAND source burst settled callbacks='+pending.callbacks+' chars='+pending.text.length);this.deliverSource(pending.text,pending.origin,pending.callbacks?'cs2':'');}}
 // Fast-forward / held Ctrl (E215.4, user: after skipping, every skipped line poured into MeguLit). Lines arriving less
 // than 300 ms apart are a skip burst: they are held, each replacing the last, and only the line the game stops on is
 // shown, 400 ms after the burst ends. Native page engines (ISLAND cs2, several lines per page) keep ordered delivery.
 /* E345 the hook engine (MeguLitHook32/64.dll) comes with the runtime pack, which is downloaded once. A newer build shipped
    with MeguLit in native\megulithook\ (YU-RIS embed) replaces the installed one before a game is attached; the old file
    is kept as .previous. A file still loaded by a running game cannot be replaced and is tried again next time. */
 /* 2026-11-13 cold "runtime-dump" pack (docs/runtime-dump-pack.md): fetched in the background the first time a game is
    hooked, no switch and no message; HookBridge injects it as soon as the files are there (also later in the same run).
    Offline or any failure: nothing happens, the next game start tries once more. */
 static fetchRuntimeDump(folder){try{if(HookNative.dumpFetch)return;const packs=require('./runtime-packs.cjs').RuntimePacks.shared(path.dirname(folder));
  if(packs.installed('runtime-dump')||!packs.manifest().packs?.['runtime-dump'])return;HookNative.dumpFetch=packs.ensure('runtime-dump').catch(()=>{}).finally(()=>{HookNative.dumpFetch=null;});}catch{}}
 static syncShippedHook(folder){for(const name of ['MeguLitHook32.dll','MeguLitHook64.dll']){try{
  const src=path.join(folder,'megulithook',name),dst=path.join(folder,'..','runtime','megulithook',name);
  if(!fs.existsSync(src)||!fs.existsSync(path.dirname(dst)))continue;
  const a=fs.statSync(src),b=fs.existsSync(dst)?fs.statSync(dst):null;
  if(b&&a.size===b.size&&fs.readFileSync(src).equals(fs.readFileSync(dst)))continue;
  if(b&&!fs.existsSync(dst+'.previous'))fs.copyFileSync(dst,dst+'.previous');
  fs.copyFileSync(src,dst+'.tmp');fs.renameSync(dst+'.tmp',dst);}catch{}}}
 /* E334 (user 2026-11-10, 女装山脈 with Ctrl held): some engines (YU-RIS) hand over every skipped line as one long text.
    Such a text is cut back to the line the game stopped on: with a script, the shortest ending that is a known script
    line; without one, the part after the last speaker change (name「…). Ordinary long narration is left whole. */
 lastOfMerged(text){
  const s=String(text||'');if(s.length<120)return s;
  const cuts=[];const re=/[。！？!?…」』）)―─]+(?=[^。！？!?…」』）)―─])/g;let m;while((m=re.exec(s)))cuts.push(m.index+m[0].length);
  if(cuts.length<3)return s;
  if(this.originalText){for(let i=cuts.length-1;i>=0;i--){const part=s.slice(cuts[i]).trim();if(part.length<2)continue;
   const r=this.resolveSource(part.replace(/^[^「『\s]{1,8}(?=[「『])/,''))||this.resolveSource(part);if(r&&(r.status==='exact'||r.status==='high')){for(let k=i-1;k>=Math.max(0,i-4);k--){const longer=s.slice(cuts[k]).trim(),q=this.resolveSource(longer);if(!q||q.status!=='exact'&&q.status!=='high')break;i=k;}return s.slice(cuts[i]).trim();}}}
  const speakers=[...s.matchAll(/(?:^|[。！？!?…」』])([^\s「」『』。！？!?…]{1,8})[「『]/g)];
  if(speakers.length>=2){const at=speakers[speakers.length-1].index+(/^[。！？!?…」』]/.test(speakers[speakers.length-1][0])?1:0);const tail=s.slice(at).trim();if(tail.length>=2&&tail.length<s.length*.6)return tail;}
  return s;
 }
 deliverSource(text,origin,engine='',nativeLine=0){
  const now=this.now(),live=!engine&&!nativeLine&&(origin||'live')==='live',S=this.skipBurst||(this.skipBurst={last:0,held:null,timer:null,count:0});
  if(!live){this.emitSource(text,origin,engine,nativeLine);return;}
  {const last=this.lastOfMerged(text);if(last!==text){this.trace('merged skip text: kept the last line of '+text.length+' chars');text=last;}}
  const gap=now-S.last;S.last=now;
  if(gap>=300&&!S.held){S.count=0;this.emitSource(text,origin,engine,nativeLine);return;}
  S.count++;S.held={text,origin};clearTimeout(S.timer);
  if(S.count===1)this.trace('skip burst: holding lines until the game stops');
  const serial=this.serial;S.timer=setTimeout(()=>{const held=S.held;S.held=null;S.timer=null;if(!held||serial!==this.serial)return;this.trace('skip burst settled; skipped='+(S.count-1));S.count=0;this.emitSource(held.text,held.origin);},400);S.timer.unref?.();
 }
 /* E270 (user, ATRI: one line was often typed out twice): games re-send the shown line when the voice ends or the
    window repaints, seconds later (after a long voice) and sometimes with different line breaks. The same line (ignoring
    white space) right after itself is ignored until another line comes; very short lines such as …… keep the old
    650 ms so a script that repeats them still advances. */
 sameAsLast(text){const k=s=>String(s||'').replace(/\s+/g,''),key=k(text);if(!key||key!==k(this.lastSource))return false;const age=this.now()-(this.lastSourceAt||0);/* E408: the same line from another stream (two hooks on one line) within 2.5 s is the same line; from the same stream a short line is a real repeat after 650 ms */return key.length>=6||age<650||!!this.sourceStream&&!!this.lastSourceStream&&this.sourceStream!==this.lastSourceStream&&age<2500;}
 /* E530 (DDLC Plus: the boot prompt "Press HELP key..." stayed in the reader on the main menu): the game left the dialogue
    screen when the stream that sent the shown line has been silent for 12 s while other streams changed to three or more
    different short labels (menu buttons, titles). Clock/number-only samples and prose do not count, so a player reading
    slowly or a ticking UI never clears a real line. The reader is cleared with an empty line; the next real line shows as usual. */
 leaveCheck(){try{const now=this.now(),threads=this.state?.hookThreads||[],L=this.leave||(this.leave={samples:new Map(),labels:new Set(),since:0});
  if(L.since!==this.lastSourceAt){L.since=this.lastSourceAt;L.labels.clear();}
  const selected=threads.find(t=>t.selected)?.id||'';
  for(const t of threads){const sample=String(t.sample||'').trim(),old=L.samples.get(t.id);L.samples.set(t.id,sample);if(t.id===selected||!sample||old===sample)continue;
   for(const row of sample.split(/\n+/)){const x=row.trim();if(HookNative.leaveLabel(x)&&!(this.lastSource&&String(this.lastSource).includes(x)))L.labels.add(x);}}
  if(L.samples.size>300)L.samples.clear();
  if(!this.lastSource||!this.lastSourceAt||now-this.lastSourceAt<12000||L.labels.size<3)return false;/* 2026-11-13 (Summer Pockets: the choice screen is silent too, its menu labels changed): a choice screen OCR still finds is not leaving */if(this.choice?.active)return false;
  this.trace('left dialogue screen: stream silent '+Math.round((now-this.lastSourceAt)/1000)+'s, labels='+JSON.stringify([...L.labels].slice(0,5)));
  this.lastSource='';this.lastSourceAt=0;L.labels.clear();this.clearChoices('left dialogue screen');
  this.notify({hookSource:'',hookSpeaker:'',hookSourceOrigin:'leave',hookSequence:(this.state.hookSequence||0)+1,hookMessage:'游戏离开对话界面，已清空阅读器'});return true;}catch{return false;}}
 /* a menu/title label: letters, at most 24 chars or 4 words, no sentence end */
 static leaveLabel(x){return !!x&&x.length<=24&&x.split(/\s+/).length<=4&&/[\p{L}]{2,}/u.test(x)&&!/[。．.!?！？…」』"”]\s*$/.test(x);}
 emitSource(text,origin,engine='',nativeLine=0){
  /* E501 every source path (native line, merged batch, skip burst) meets the same frame-dump filter as the aux entries */
  if(require('./language-tracks.cjs').stuttered(text)){this.trace('drop typewriter/redraw frame '+JSON.stringify(String(text).slice(0,40)));return;}
  {const sp=splitSpeaker(text,this.knownSpeakers);if(sp.name){this.speaker={text:sp.name,at:this.now()};this.noteSpeaker(sp.name);if(!sp.text.trim()){this.trace('speaker name split from the text flow');return;}text=sp.text;}}
  if(!engine&&!nativeLine&&this.flowPage)engine='nvl';
  if((origin==='history'&&this.state.receivedText)||(!nativeLine&&this.sameAsLast(text)&&this.state.hookActive&&this.state.receivedText&&!this.state.hookRecovering)){this.trace('source duplicate ignored chars='+text.length);return;}
  // E247 (user: a game settings screen looped its prompts into the text bar): when lines already shown in the last
  // 8 s keep coming back (two or more repeats), the stream is cycling menu/system text; drop it until an unseen line.
  if(!nativeLine&&(origin||'live')==='live'){const now=this.now(),L=this.loopGuard||(this.loopGuard={seen:[],repeats:[],looping:false});L.seen=L.seen.filter(x=>now-x.at<8000);L.repeats=L.repeats.filter(t=>now-t<8000);
   if(L.seen.some(x=>x.text===text)){L.repeats.push(now);if(L.looping||L.repeats.length>=2){if(!L.looping)this.trace('menu loop detected; repeating lines ignored');L.looping=true;return;}}
   else{if(L.looping)this.trace('menu loop ended');L.looping=false;L.repeats=[];}
   L.seen.push({text,at:now});if(L.seen.length>12)L.seen.shift();}
  this.learnBareName(text);
  const speaker=this.speaker&&this.now()-this.speaker.at<2500?this.speaker.text:'';this.speaker=null;/* E416 the choice detector learns every dialogue line and speaker, whatever the engine */(this.choice||(this.choice=this.newChoiceCapture())).noteDialogue(text,speaker);/* E407 a new dialogue line ends the choice screen */if(text.replace(/\s+/g,'')!==String(this.lastSource||'').replace(/\s+/g,''))this.clearChoices('new dialogue line',400,text);this.lastSource=text;this.lastSourceAt=this.now();this.palFlush?.();this.lastSourceStream=this.sourceStream||'';this.trace('source chars='+text.length+' sequence='+((this.state.hookSequence||0)+1));this.notify({hookActive:true,processAttached:true,streamSelected:true,hookRecovering:false,hookSource:text,hookSpeaker:speaker,hookSourceEngine:engine,hookFlowGrid:engine==='nvl'?(this.flowGridName||''):'',...(()=>{const f=engine==='nvl'?this.flowLayout(text):null;/* E410 */return {hookFlowPageStart:f?.pageStart===true,hookFlowRow:f?.row||'',hookSourceIndex:Number.isSafeInteger(f?.index)?f.index:-1};})(),hookSourceLine:nativeLine,hookSourceOrigin:origin||'live',hookSourceRuby:this.sourceRuby?.get(text)||[],hookSequence:(this.state.hookSequence||0)+1,receivedText:!!text.trim(),hookMessage:text.trim()?'已收到真实游戏台词':'收到空文本信号'});
 }
 /* #141 (CLANNAD: a bare name sent as its own string, with no brackets, before the 「…」 line). A short name-like line
    followed within 2 s by a quoted line is a name candidate; the second time it happens the name is learned, so from then
    on splitSpeaker moves it to the speaker field. Any engine. */
 learnBareName(text){const now=this.now(),c=this.nameCandidate,bare=String(text||'').trim();this.nameCandidate=null;
  if(c&&now-c.at<2000&&/^[「『]/.test(bare)){const N=this.nameHits||(this.nameHits=new Map());const hits=(N.get(c.text)||0)+1;N.set(c.text,hits);if(N.size>400)N.delete(N.keys().next().value);if(hits>=2&&!this.knownSpeakers?.has(c.text)){this.noteSpeaker(c.text);this.trace('speaker name learned from bare lines');}if(this.knownSpeakers?.has(c.text)&&!this.speaker)this.speaker={text:c.text,at:now};}
  if(bare.length>=1&&bare.length<=8&&speakerName(bare)===bare&&!/[\s　「『（(【［\[。、，,.！？!?…‥・～〜]/.test(bare))this.nameCandidate={text:bare,at:now};}
 /* #141 names seen in a name stream or split from a line; at most 200 are kept. */
 noteSpeaker(n){const K=this.knownSpeakers||(this.knownSpeakers=new Set());if(!n||n.length>16)return;K.delete(n);K.add(n);if(K.size>200)K.delete(K.values().next().value);}
 markerTarget(v){this.waitTarget=v;this.syncMarker();this.flowMarker(v);}
 /* E323 (user: WoH kept the old page's lines when the game cleared the page). A full-screen page has no clear signal in
    the text hook, but the game's wait marker sits after the newest line and only ever moves DOWN the page; the one time
    it moves up (more than its own height) the game has started a new page. Emitted as the page protocol's turn
    (hookPage same:false); the reader keeps the line that just arrived and drops the rest. */
 flowMarker(v){if(!this.flowPage||!v||v.active!==true||![v.y,v.height].every(Number.isFinite))return;const prev=this.flowMarkerAt;this.flowMarkerAt={y:v.y,height:v.height,at:this.now()};
  if(prev&&prev.y-v.y>Math.max(prev.height,v.height,8)*1.2){this.flowPageLine=(this.flowPageLine||0)+1;this.trace('flow page: wait marker moved up '+(prev.y-v.y)+'px, new page');this.emit({type:'hookPage',engine:'nvl',line:this.flowPageLine,same:false,token:0,at:this.now()});}}
 // The Direct3D9 wait-marker draw hook no longer runs any probing code inside the game (that once crashed a game);
 // it only patches system d3d9.dll functions whose address and bytes match a probe made in a separate process.
 syncMarker(){const v={...(this.waitTarget||{}),type:'waitMarker',active:!!this.waitTarget?.active&&this.enabled&&this.state.hookActive&&this.preferences?.hideWaitMarker===true},key=JSON.stringify(v);if(this.process&&key!==this.markerKey){this.markerKey=key;this.send(v);}}
 confirmReplacement(){if(this.enabled&&this.state.receivedText){this.verified=true;this.notify({replacementState:'user-verified'});}}
 select(id,manual){this.verified=false;if(manual)this.manualThread=id;if(this.process&&typeof id==='string'&&this.state.hookThreads.some(t=>t.id===id)){this.trace('select id='+id+' replace='+this.enabled);this.send({type:'select',id,replace:this.enabled});}else{this.trace('select rejected id='+String(id));this.notify({hookMessage:'文本流尚未就绪，请重新扫描后选择'});}}
 rescan(){this.send({type:'rescan'});}
 // E246: style sampling pauses the embed replacement so the game draws one original line, then resumes it.
 suspendReplacement(on){if(!this.process||!this.enabled)return;if(on&&!this.suspended){this.suspended=true;this.trace('replacement paused for style sampling');this.send({type:'disable',reason:'style-sampling'});}else if(!on&&this.suspended){this.suspended=false;this.trace('replacement resumed after style sampling');this.send({type:'enable'});}}
 send(v){if(this.process?.stdin.writable)this.process.stdin.write(JSON.stringify(v)+'\n');}
 stop(dispose=true){this.embedModeSent=undefined;if(this.state?.scriptSource)this.notify({scriptSource:false});if(this.state?.embedTranslating)this.notify({embedTranslating:false});clearTimeout(this.skipBurst?.timer);this.skipBurst=null;this.pageReset();this.islandSources.clear();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;clearTimeout(this.islandTimer);clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;this.pendingSource=null;this.verified=false;this.retryAt=0;this.attempt=0;this.markerKey='';this.waitTarget=null;if(this.process){const old=this.process;this.send({type:'quit'});old.stdin.end();this.process=null;++this.serial;const timer=setTimeout(()=>{if(old.exitCode===null)old.kill();},2000);timer.unref?.();}this.enabled=false;this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'disabled',hookSource:null,hookThreads:[],hookDrawCount:0,hookDrawAt:0});if(dispose){this.lastSource='';this.identity='';this.wanted=false;clearInterval(this.timer);}}
}
module.exports={FLOW_PAGE_EXES,HookNative,PAGE_ENGINES,cleanSource,scriptSource,identifierNoise,splitSpeaker,speakerName};
