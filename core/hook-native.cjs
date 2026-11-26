// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const cardinalTape=require('./cardinal/tape.cjs');
const Profiles=require('./profiles/index.cjs');
const {parseGlyphPos,fillPlaces}=require('./gpu-glyph-pos.cjs');const {identifierNoise}=require('./text-noise.cjs');const {ChoiceCapture,placeChoices,SYMBOL_OPTION}=require('./choice-capture.cjs');const {DoubleLine}=require('./double-line.cjs');
/* #148 (WHITE ALBUM2, AQUAPLUS: phone lines came as 「<F16「やぁ…」>」): inline engine tags of one ASCII letter (+ up to 3
   digits) wrapped straight around Japanese text are unwrapped for every engine; <R漢字|かな> keeps its base. HTML-like tags
   (<br>, <b>) are never touched: the letter must be followed by non-ASCII text. */
function unwrapTags(text){let s=String(text),prev;do{prev=s;s=s.replace(/<R([^<>|\x00-\x7f][^<>|]*)\|[^<>]*>/g,'$1').replace(/<[A-Za-z]\d{0,3}(?=[^\x00-\x7f])([^<>]*)>/g,'$1');}while(s!==prev);return s;}
function cleanSource(text,name='',code=''){const unity=code.endsWith(':JIT:UNITY');if(unity)text=require('./unity-source.cjs').rubySize(text).replace(/<br\s*\/?>/gi,'\n').replace(/<ruby[^>]*>(.*?)<\/ruby>/gis,'$1').replace(/<\/?(?:color|size|font|b|i|u|s|mark|align|line-height|cspace|mspace|indent|margin|voffset|alpha|link|style|noparse|sprite)(?:[=\s][^>]*)?>/gi,'');text=unwrapTags(text).replace(/\r\n?/g,'\n');if(unity)text=require('./unity-source.cjs').typewriter(text);return text.replace(/\x05/g,/^BGI(?:\.exe)?$/i.test(name)?'\n':'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'');}
/* A speaker name from a name stream: brackets and control marks stripped; anything that reads like a sentence is not a name. */
function speakerName(raw){const n=String(raw||'').replace(/[\x00-\x1f]/g,'').replace(/^[\s【\[「『(（]+|[\s】\]」』)）:：]+$/gu,'').trim();{const st=LineOnce.nameStack(n);if(st)return st;}if(n.length%2===0&&n.length>=4&&n.slice(0,n.length/2)===n.slice(n.length/2))return speakerName(n.slice(0,n.length/2)); /* a name stream that sends the name twice (時雨時雨) */
 return n&&n.length<=16&&(/^[?？]+$/.test(n)||!/[。、！？!?…]/.test(n))?n:'';}
/* #141 (CLANNAD, v1.4.9-beta.1: speaker names showed up in the text flow). Many engines (RealLive/Siglus, KiriKiri, BGI,
   YU-RIS …) send the name box in the same stream as the line, either as its own string or glued to the front of the line.
   Whatever the engine, a name is split off into the speaker field: 【名前】 / ［名前］ alone or before the line, a name before
   a quote with a line break, ideographic space or colon in between, and – for names already seen – 名前「…」 and a bare
   名前 line. Returns {name,text}; text is '' when the string was only a name. */
/* side-stream text waits this long for the dialogue line of the same moment before it may be art text */const AUX_ART_DELAY_MS=120;
/* OCR read lines (2026-11-19): a read group waits this long for the rest of the screen's groups; this many groups at once is a menu or settings page; a hook line this recent is current; the same text again within this long is the same screen */
const HOOK_RETRY_MAX=6,HOOK_ATTACH_GRACE_MS=45000,OCR_LINE_SETTLE_MS=500,OCR_LINE_MAX_BLOCKS=4,OCR_LINE_QUIET_MS=5000,OCR_LINE_REPEAT_MS=60000,OCR_LINE_STALE_MS=60000;
const SKIP_BURST_GAP_MS=300,SKIP_BURST_SETTLE_MS=400,SKIP_BURST_MAX_HOLD_MS=800;
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
 /* 2026-11-15 (沙耶の唄 「青海$ｰャン」 was cut at the $): a $ before half-width katakana is the line's own text, not a variable */
 const marker=/[【《\[][\$＄]|[%％*＊][A-ZＡ-Ｚ](?![A-Za-zＡ-Ｚａ-ｚ])|[\$＄](?![\uff61-\uff9f])[\p{L}_＿]/u.exec(text);
 return marker?text.slice(0,marker.index).trimEnd():text;
}
const IslandSource=require('./island-source.js');
const LineOnce=require('./line-once.js');const {PageText}=require('./page-text.cjs');const {SentencePieces}=require('./sentence-pieces.cjs');
// Engines whose MeguLit DLL reports each sentence of a full-screen page (hookEngineLine): KiriKiri (E300), Ren'Py (E301),
// and every other engine through the OCR page locator (E306, GalWindowBridge PageLocator.cs).
const PAGE_ENGINES=new Set(['krkr','renpy','ocr']);
const SCRIPT_PAGE_ROW=Symbol('script page row');
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
 skipHeld(v){const held=v===true;if(held===this.skipKey)return;if(held&&this.pageQueue?.rest.length){const q=this.pageQueue;this.pageQueue=null;this.source({...q.base,text:q.rest[q.rest.length-1]},q.name);}this.skipKey=held;
  const burst=this.skipBurst;
  if(burst){if(held){clearTimeout(burst.settle);burst.settle=null;}else if(burst.held||this.state.hookSourcePreview)this.settleSkipBurst(burst);}
  if(this.process)this.send({type:'skipHeld',held});}
 /* 2026-11-12 (user, ファタモルガーナの館: "这死馆也没有上一句渐暗"): the script guess (flowGame: many multi-sentence pages) is
    overruled by the engine itself: once its page DLL reports lines (with their real places, box or full page), the game is not laid out as a flow page */
 get flowPage(){const confirmed=this.profile?.page?.presentation;
  if(confirmed==='adv'||confirmed==='nvl')return confirmed==='nvl';
  if(confirmed!=='mixed'){const o=this.profile?.page?.flowPage;if(typeof o==='boolean')return o;}const hint=confirmed||this.profile?.vndbLayout;
  if(hint==='adv'||hint==='nvl'){
   if(this.pageMode&&this.pageMode.engine!=='ocr')return false;
   return hint==='nvl';
  }
  if(this._flowPage===true)return true;if(this.pageMode&&this.pageMode.engine!=='ocr')return false;return this.originalText?.flowGame?.()===true;}
 set flowPage(v){this._flowPage=v===true;}
 /* 2026-11-12 a KiriKiri page DLL draws the game's own text invisible itself (MeguLitKrkr __megulitKrkrHide): nothing to look at
    before hiding, so the preflight that shows the original first (and stayed in read mode when its check was cancelled) is skipped.
    E472: except while the game style is being calibrated: the probe samples the game's own glyphs, so the game must draw them. */
 get preflight(){const o=this.profile?.hide?.preflight;return this._preflight===true&&this.flowPage!==true&&((typeof o==='boolean'?o:this.pageMode?.engine!=='krkr')||this.calibrating===true);}
 /* E472: the game itself draws the current line invisible (KiriKiri page DLL): calibration has to wait for the next line. */
 get drawsHidden(){const o=this.profile?.hide?.drawsHidden;return this.enabled===true&&(typeof o==='boolean'?o:this.pageMode?.engine==='krkr');}
 sact2Hidden(text){const p=this.sact2Paint;return this.enabled===true&&!this.skipKey&&p?.serial===this.serial&&p.line===HookNative.flat(text);}
 set preflight(v){this._preflight=v===true;}
 /* E410: where a flow line sits on the page, from the game's own scripts (null when unknown). */
 flowLayout(text){try{const provider=this.originalText;if(!provider?.flowLayout)return null;const r=this.resolveSource(text);if(!r||r.method==='same-text'/* E520: the place of a repeated line is unknown */||!(r.status==='exact'||r.status==='high'||r.method==='untranslated'))return null;return provider.flowLayout(r.indices)||null;}catch{return null;}}
 constructor(layout,onEvent,spawnHelper=spawn,now=Date.now){this.profile=Profiles.profileFor({});this.layout=typeof layout==='string'?{native:layout,hook:path.join(layout,'hook-runtime')}:layout;this.folder=this.layout.native;this.emit=onEvent;require('./text-sanity.cjs').warmUp();this.spawn=spawnHelper;this.now=now;this.state={hookActive:false,hookAvailable:false,hookThreads:[],processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookMessage:'Hook 未启用'};this.islandSources=new Map();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;this.lastSource="";this.identity="";this.serial=0;this.enabled=false;this.attempt=0;this.retryAt=0;this.timer=setInterval(()=>this.tick(),1000);this.timer.unref?.();}
 trace(message){try{const file=path.join(this.layout.logs||path.join(this.folder,"..","logs"),"hook-events.log");require("./log-sink.cjs").append(file,new Date().toISOString()+" "+message+"\n",{rotate:1048576});}catch{}/* 2026-11-21 the live self-check (services/self-check-live.cjs) reads every trace line */try{HookNative.traceTap?.(String(message));}catch{}}
 /* 2026-11-21 layered game profile (core/profiles): kernel <- engine diff <- game diff. Every per-engine / per-game branch of the
    kernel reads this.profile (never the program name); the reader gets the same object as hookState gameProfile. */
 setProfile(profile,input){if(!profile||typeof profile!=='object')return;const before=JSON.stringify(this.bridgeProfile());if(input!==undefined)this.profileInput=input&&typeof input==='object'?input:null;this.profile=require('./owner-tests.cjs').apply(profile,this.ownerTestGrant,{exe:this.profileInput?.exe,engine:profile.engine});this.sadisticPage=require('./sadistic-blood-layout.cjs').load(this.profileInput?.exe,this.profile.exeSha256);this.drawSync();this.trace(Profiles.traceLine(this.profile));this.notify({gameProfile:this.profile});
  /* HookBridge reads hide.engineTrial.* (native/HookBridge.cs ApplyProfile): at spawn from MEGULIT_PROFILE, afterwards as a message */
  const now=this.bridgeProfile();if(this.process&&JSON.stringify(now)!==before)this.send({type:'profile',...now});}
 setOwnerTestGrant(token){const O=require('./owner-tests.cjs');if(token&&!O.identity(token,this.profileInput?.exe))return false;if(this.ownerTestGrant===token)return;require('./danganronpa-pc-source.cjs').clear(this);this.ownerTestCleanup?.();if(this.ownerTestGrant)O.revoke(this.ownerTestGrant);this.ownerTestGrant=token||null;if(!token)return;const target=this.target;if(!target||!O.bind(token,{pid:target.pid,birth:target.started})){O.revoke(token);this.ownerTestGrant=null;return;}this.ownerTestCleanup=O.onRevoke(token,()=>{this.ownerTestGrant=null;require('./danganronpa-pc-source.cjs').clear(this);this.profile=O.apply(this.profile,null,{});this.enabled=false;this.send({type:'disable',reason:'owner-test-revoked'});this.drawSync();});this.drawSync();}
 /* the part of the profile the bridge reads; keys left at null (kernel rule) are not sent */
 bridgeProfile(){const t=this.profile?.hide?.engineTrial||{},out={};for(const k of ['enabled','unconfirmedLines','clickMs','skipAside'])if(t[k]!==null&&t[k]!==undefined)out[k]=t[k];const profile={engineTrial:out};if(this.sadisticPage)profile.sadisticTrialLayout=true;if(this.profile?.engine==='artemis'&&this.profile?.source?.artemisQuoteSpans===true)profile.artemisQuoteSpans=true;return profile;}
 /* a game the library knows no engine for: the first page record of an engine text path (krkr -> kirikiri) adds that engine's diff */
 learnEngine(name){try{if(this.profile?.engine!=='unknown')return;const id=Profiles.engineId(name);if(!id||!Profiles.loadEngine(id))return;this.setProfile(Profiles.profileFor({...(this.profileInput||{}),engine:id}));}catch{}}
 notify(v){if(Object.entries(v).every(([k,value])=>this.state[k]===value))return;this.state={...this.state,...v};this.emit({type:'hook',...v});}
 /* 2026-11-21 (owner, test pack v5 ファタモルガーナの館 03:32:53Z: 「校准当前句」 gave way to measure the original, the measurement was
    cancelled and the hide never came back: the Japanese gone, the original showing, the calibration stuck at 正在测量当前句…).
    Automatic preflight uses the short baseline cap. A player-requested measurement supplies its own bounded window:
    then preflight is off, the hide and the replacement are back (onGiveWayCapped tells the controller to finish). */
 capGiveWay(){if(this.preflight!==true){clearTimeout(this.giveWayTimer);this.giveWayTimer=null;return;}const limit=this.manualStyleWindow||HookNative.GIVE_WAY_MS;
  if(this.giveWayTimer&&this.giveWayLimit===limit)return;
  clearTimeout(this.giveWayTimer);this.giveWayLimit=limit;
  this.giveWayTimer=setTimeout(()=>{this.giveWayTimer=null;if(this.preflight!==true)return;this.preflight=false;this.calibrating=false;try{this.trace('preflight give way capped at '+limit+' ms: hiding and replacement restored');}catch{}try{this.onGiveWayCapped?.();}catch{}if(this.preferences&&this.windowState)this.configure(this.preferences,this.windowState);},limit);this.giveWayTimer?.unref?.();}
 /* 2026-11-21 (engine-draw, Fata v5: #choiceframe and #clearline never reached the game): the game's pid lives in configure()'s window
    state and the target, never in this.state (the hook's notify state); reading this.state.gameProcessId gave 0, so the engine-draw
    control file (%TEMP%\MeguLit\draw\<pid>.txt) was never written */
 gamePid(){return Number(this.target?.pid||this.windowState?.gameProcessId||this.state?.gameProcessId)||0;}
 resetSourceSession(){
  // Page and OCR history belong to the bound process, even if no HookBridge could start for it.
  clearTimeout(this.ocr?.timer);
  this.ocr=null;
  this.pageText=null;
  this.pageSaidSame=false;
  this.hookRecent=[];
  this.recentSources=[];
  this.loopGuard=null;
  this.pageQueue=null;
  this.advanceTimes=[];
  clearTimeout(this.nativeLog?.timer);
  this.nativeLog=null;
  clearTimeout(this.boxBlink?.timer);
  this.boxBlink=null;
  this.engineDialog=undefined;
  this.sact2Paint=null;
  this.unityBox=null;
  this.lastSource='';
  this.lastSourceAt=0;
 }
 configure(preferences,state){if(this.disposed)return;this.preferences=preferences;this.windowState=state;this.capGiveWay();const pid=Number(state.gameProcessId),hwnd=String(state.gameHwnd||'');this.wanted=(preferences.hookAutoStart||['hook','local'].includes(preferences.maskMode))&&preferences.bindEnabled===true&&preferences.hookProfile!=='off';if(this.nativeRuby&&(this.nativeRuby.pid!==pid||this.nativeRuby.started!==String(state.gameStarted||'')))this.clearNativeRuby();
  const previous=this.target;
  this.target=Number.isSafeInteger(pid)&&pid>0&&/^\d{1,19}$/.test(hwnd)?{pid,hwnd,name:String(state.processName||''),started:String(state.gameStarted||'')}:null;
  if(previous?.pid!==this.target?.pid||previous?.started!==this.target?.started){this.resetSourceSession();this.finishStreamProbe('');}
  if(this.ownerTestGrant&&(!this.target||!require('./owner-tests.cjs').bind(this.ownerTestGrant,{pid:this.target.pid,birth:this.target.started})))require('./owner-tests.cjs').revoke(this.ownerTestGrant);if(this.profile&&this.gamePid()!==(this.drawPid||0)){this.drawPid=this.gamePid();try{this.drawSync();}catch{}}/* a profile that came before the game's pid writes its control file now */
  if(!this.wanted||!this.target){this.stop(false);return;}if(this.process&&(this.pid!==pid||this.started!==this.target.started))this.stop(false);
  /* E285 (user: Alt+H also switched off the translation the game draws itself): Alt+H hides MeguLit's own layers; the
     game keeps drawing the written-back translation until its own switch is turned off. */
  /* Text architecture: with 文字显示 = compositor the game's own drawing must turn into glyph dots, so replacement is on and the bridge is in dot mode (write-back streams included) */
  /* E610: overlay placement keeps write-back on between calibrations because the engine reports glyph positions. 2026-11-15 (死に逝く君、館に芽吹く憎悪, 1.4.9/1.4.10: 「本次校准未完成」 every time): a calibration measures the game's own pixels, so while one runs (calibrating + preflight) the game must draw its original like any embed stream; placement kept the KiriKiri line invisible and the probe never saw it */const showOriginal=this.calibrating===true&&this.preflight===true;/* 2026-11-21 (1.4.22 test, ファタモルガーナの館: read mode lost the Japanese and the render mode flapped custom <-> read) read mode
     (隐藏游戏原文 off: the user's switch, text effects, a read seed or calibration) means the game keeps its own text: MeguLit's own
     text output no longer forces the hide on (it did, whenever the selected stream was not GDI-less, so the KiriKiri page DLL kept
     drawing at opacity 0 and the glyph layer kept blanking while the reader drew the translation only) */let enabled=(this.compositedFn?.()===true||this.ownTextFn?.()===true&&!this.gdilessSelected())&&state.bound===true&&!showOriginal&&preferences.hookHide!==false||preferences.hookProfile!=='read'&&!this.preflight&&state.bound===true&&(state.coverEnabled!==false||preferences.embedTranslation===true&&preferences.translationBlur!==true);/* 2026-11-16 (QQ group, Fate/stay night with a Traditional Chinese patch: neither the game's text nor MeguLit's): the selected stream carries no Japanese the reader can draw, so hiding the game's own line leaves nothing on screen. Every engine: the game keeps its text until a Japanese line comes again (japaneseGuard). */if(this.noJapaneseSource===true&&this.noJapanesePid===pid)enabled=false;const route=enabled?(preferences.hookProfile==='embed'?'embed':'custom'):'read';if(this.process&&(enabled!==this.enabled||route!==this.route)){
   // Every engine toggles hiding in place (E215): the bridge only flips its replacement switch. Detaching and
   // re-injecting the same game process on each mode change (calibration, preflight) made the overlay flicker and
   // crashed CLANNAD HD (Siglus) without an error; it also dropped the first line after calibration.
   if(true){this.trace('render mode switched in place '+this.route+' -> '+route);this.enabled=enabled;this.route=route;this.verified=false;if(enabled)this.send({type:'enable'});else this.send({type:'disable',reason:preferences.hookProfile==='read'?'reader-profile':this.preflight?'reader-preflight':state.bound!==true?'reader-unbound':'cover-disabled'});}
   else{this.trace('render mode changed; detach then reconnect');this.stop(false);this.retryAt=this.now()+2500;return;}}if(!this.process&&this.now()>=this.retryAt)this.start(this.target);this.syncMarker();this.syncEmbedMode();this.syncGlyphMode();}
 setSourceLanguage(value){/* 'zh!': the library knows this build shows Chinese (contentLanguage); 'zh': only inferred, a Japanese line may overturn it */const language=value==='zh'||value==='zh!'||value==='ja'?value:'';if(language===this.sourceLanguage)return;this.sourceLanguage=language;if(this.process&&language)this.send({type:'sourceLanguage',value:language});}
 syncTextMarks(){if(!this.process||this.marksOn)return;const sel=(this.state.hookThreads||[]).find(t=>t.selected)||(this.state.hookThreads||[]).find(t=>this.selectedId&&t.id===this.selectedId);if(this.compositedFn?.()===true&&!this.textPathActive&&sel&&(this.noDotLines||0)>=2){this.marksOn=true;this.send({type:'textMarks',on:true});this.trace?.('text marks on: stream '+sel.id+(sel.embeddable===true?' (write-back)':' (per-character argument hook in the DLL)')+' gets no glyph dots');}}
 syncGlyphMode(){if(!this.process)return;/* a ③ path for an engine without GDI glyphs (Unity, web) owns this game's text: no glyph dots (its text setters must not wait on the dot pass-through). KiriKiri / Ren'Py keep the dots: lines ③ cannot place (custom message layers) are still hidden as dots and drawn by the compositor instead of being blanked with nothing drawn */const own=this.ownTextFn?.()===true,want='blank'/* 2026-11-21 dot glyphs retired (owner: 打点可以不要了): never asked for, whatever the renderer */,sel=(this.state.hookThreads||[]).find(t=>t.selected)||(this.state.hookThreads||[]).find(t=>this.selectedId&&t.id===this.selectedId),ro=this.readOnly&&this.readOnly.serial===this.serial?this.readOnly:(this.readOnly={serial:this.serial,ids:new Set()});if(sel&&(sel.embeddable!==true||sel.hideOnly===true))ro.ids.add(sel.id);/* hide-only = no write-back either *//* a stream first listed read-only stays so for this game: a GDI hide probe later lists it as clearable, which is no write-back */const blind=want==='dot'&&!!sel&&ro.ids.has(sel.id);if(sel)this.selectedId=sel.id;/* the bridge's own auto-select is remembered too: a later stream list without the flag must not turn blind off */const key=want+'|'+blind+'|'+(sel?sel.id:'')+'|'+this.serial;/* a newly chosen stream gets the mode again: the bridge arms its line reports for the selected stream when the mode arrives */if(this.glyphKey===key)return;this.glyphKey=key;/* dot-blind for a read-only dialogue stream: its text arrives after the glyphs (AdvHD, KiriKiri2 read-only streams), so the glyphs under the dialogue font are dotted without waiting for the line *//* overlay placement (2026-11-14): blank glyphs on every selected stream, write-back ones pass their text through unchanged so the game lays it out itself *//* E610 (DDLC Plus live, beta.43: with overlay placement the TextTypewriterEffect stream passed its text through and waited for GDI glyph blanking; Unity draws its text with its own atlases, so nothing hid the original and no glyph positions came back). A stream of a Unity hook (Mono JIT or IL2CPP) has no GDI glyphs: without the ③ text path it is hidden by write-back like any writable stream. */const gdiless=this.gdilessSelected(sel);/* incr9 2026-11-21: blank on a writable stream = the bridge hides this game's dialogue glyphs (overlay-placement glyphBlanking) */this.glyphBlankWritable=want==='blank'&&!!sel&&sel.embeddable===true&&!blind;this.send({type:'glyphMode',mode:want,all:want==='dot'||own&&!this.textPathActive&&!gdiless,blind});this.trace?.('glyph mode '+want+(blind?' blind':'')+(sel?' stream='+sel.id+(sel.embeddable===true?' writable':' read-only'):' no stream'));}
 // 'translate' while the per-work switch is on and replacement is active; 'hide' (blank for MeguLit to draw) otherwise.
 /* QQ #1141 (B站, 魔法使いの夜 Steam: 「只显示中文了 日文不显示」): E352 (2026-11-10) switched a full-screen page game with its own translation table to
    translate embed by itself; the game then drew only its Chinese and the reader hid the whole page, so the Japanese was gone. Bilingual
    reading (Japanese above, translation below) is the rule: a page game hides its text and MeguLit draws both; the game draws the
    translation only when the player turns on 「译文由游戏自己显示」. The automatic switch is removed. */
 syncEmbedMode(){/* E417 a hide-only stream (old BGI per-character hook) cannot draw a translation: MeguLit draws it */const hideOnly=(this.state?.hookThreads||[]).some(t=>t.selected&&t.hideOnly===true);const want=!!(this.process&&this.enabled&&!hideOnly&&this.preferences?.embedTranslation===true&&this.preferences?.translationBlur!==true);if(!this.process){this.embedModeSent=undefined;return;}if(want===this.embedModeSent)return;this.embedModeSent=want;if(!want&&this.state?.embedTranslating)this.notify({embedTranslating:false});this.trace('embed mode '+(want?'translate':'hide'));this.send({type:'embedMode',mode:want?'translate':'hide'});}
 /* E358: hide:true = the game's font cannot draw this translation: the bridge hides the line, the overlay draws it (per line). */
 /* 2026-11-13 (adapt/krkr-bgi, live euphoria, EmbedYURIS6): every written-back translation made the engine stop with
    「テキスト内部エラーです。テキストサイズ情報を正しく格納できませんでした」 — longer (32->38 bytes), shorter (20->14, 「フォントサイズが不正です」)
    and even the same size padded with spaces (20->20). Blanking the line in place (hide) is safe. So on a YU-RIS embed stream the game
    only hides the line and MeguLit draws the translation. */
 fixedSizeEmbed(){return (this.state?.hookThreads||[]).some(t=>t.selected&&/^EmbedYURIS/i.test(String(t.name||'')));}
 embedReply(id,trans,o={}){if(!this.process||!Number.isSafeInteger(id))return;const hide=o?.hide===true||!!trans&&this.fixedSizeEmbed();this.send({type:'embedReply',id,trans:hide?'':String(trans||'').slice(0,4000),...(hide?{hide:true}:{})});if(!this.embedModeSent||!(hide||trans))return;
  if(hide&&!this.glyphNoted){this.glyphNoted=true;this.trace?.('embed fallback: the game font has no glyphs for the translation; the game hides the line and MeguLit draws it');}
  this.notify({embedTranslating:!hide,embedLine:{source:String(o?.source||''),text:hide?'':String(o?.text||trans||''),drawn:!hide}});}
 tick(){if(this.ownerTestGrant)this.drawSync();
  if(this.streamProbe?.until&&this.now()>=this.streamProbe.until){this.streamProbe.until=0;this.notify({hookReselectState:'timedOut'});}
  if(!this.disposed&&!this.stopPending&&this.stopError&&this.clearExitedBridgeStop())this.stop(false);
  if(this.gaveUp&&this.target&&this.gaveUp!==this.target.pid+'|'+this.target.started){this.gaveUp=null;this.attempt=0;this.retryAt=0;}/* #468 (寒蝉 rig, 2026-11-20: the bridge waits up to 12 s for the hook loader while it injects and sends nothing; a Unity game busy starting took that long, the 12 s heartbeat ended the bridge mid-handshake, the DLL stayed injected but never connected again and the game hung): until the bridge reports the process attached it gets HOOK_ATTACH_GRACE_MS */if(this.process&&this.now()-this.lastHeartbeat>(this.state.processAttached===true?12000:HOOK_ATTACH_GRACE_MS)){const old=this.process;this.process=null;++this.serial;old.kill();this.retry('Hook 通信无响应');}if(!this.process&&this.wanted&&this.target&&this.now()>=this.retryAt)this.start(this.target);}
 /* the engine's text window state (ToMe_DIALOG); lines held during a moment's hide are dialogue when it comes back */
 dialogState(visible){this.engineDialog=visible;this.engineDialogAt=this.now();if(visible&&this.boxBlink){const b=this.boxBlink;this.boxBlink=null;clearTimeout(b.timer);this.trace('line kept as dialogue: the text window was hidden only for a moment');for(const x of b.lines)this.source(x.m,x.name);}}
 retry(message){this.pageReset();this.islandSources.clear();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;clearTimeout(this.islandTimer);clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;this.pendingSource=null;this.verified=false;this.enabled=false;this.retryAt=this.now()+Math.min(30000,1000*2**Math.min(this.attempt++,5));/* #468 (live: a bridge that could not reach the hook DLL again said 「LunaHook 未连接当前游戏」 every 45 s for ever): after HOOK_RETRY_MAX failures in a row without a line from the game, this game process is given up on with a clear state; a new game process, or a line, starts over */if(this.attempt>=HOOK_RETRY_MAX&&this.target){this.gaveUp=this.target.pid+'|'+this.target.started;this.retryAt=Infinity;this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,hookRecovering:false,hookGaveUp:true,hookMessage:'钩子连续 '+this.attempt+' 次没能接上这局游戏，已停止重连；重启游戏后会重新连接，期间由画面识别兜底'});this.trace('hook reconnect given up after '+this.attempt+' attempts ('+message+')');return;}this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookSource:this.lastSource||null,hookRecovering:!!this.lastSource,hookThreads:[],hookMessage:message+'；正在自动重连'});}
 start({pid,hwnd,name,started}){if(this.disposed||this.stopPending||this.stopError)return;if(!/^[A-Za-z0-9_\-. \u0080-\uffff]{1,100}$/.test(name)||!/^\d{10,20}$/.test(started))return;this.drawSync();
  // Do not keep re-attaching to a game process that has exited; wait for the window bridge to bind the new one.
  if(this.spawn===spawn)try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){this.retryAt=this.now()+3000;this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,hookMessage:'游戏进程已退出，等待游戏重新启动后自动绑定'});return;}}
  // A HookBridge built while ToMe ran is staged as HookBridge.updated.exe and installed here, before the bridge starts.
  const staged=path.join(this.folder,'HookBridge.updated.exe');if(fs.existsSync(staged))try{fs.copyFileSync(staged,path.join(this.folder,'HookBridge.exe'));fs.unlinkSync(staged);}catch{}
  if(this.profile?.draw?.spikechunsoftInput===true&&require('./danganronpa-pc-source.cjs').allowed(this)){const draw=this.ensureEngineDraw(pid);draw.transport.flush(draw.cfg,draw.entries);}HookNative.syncShippedHook(this.folder);
  HookNative.fetchRuntimeDump(this.folder);
  const root=this.layout.hook,required=['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'],missing=required.filter(n=>!fs.existsSync(path.join(root,n)));if(missing.length||!fs.existsSync(path.join(this.folder,'HookBridge.exe'))){this.retryAt=this.now()+30000;this.notify({hookMessage:'Hook 组件缺失：'+missing.join('、'),hookAvailable:false});return;}
  this.flowPage=FLOW_PAGE_EXES.test(name);this.flowGridName=(FLOW_GRIDS.find(([re])=>re.test(name))||[])[1]||'';  const identity=pid+"|"+started;if(identity!==this.identity){/* 2026-11-16 (沙耶の唄 restarted: its first line was taken for a LOG replay of the previous run and dropped) the LOG detector's seen lines belong to one game process */if(this.nativeLog){clearTimeout(this.nativeLog.timer);this.nativeLog=null;}this.pageText=null;this.doubles=null;this.glyphColors=null;this.textPathActive=false;this.marksOn=false;this.noDotLines=0;this.lastSource="";this.lastSourceAt=0;this.preferredThread=null;this.remembered=null;this.identity=identity;this.state.hookFramework=null;this.state.hookEmbedPending=false;}this.pid=pid;this.started=started;this.enabled=this.preferences?.hookProfile!=='read'&&!this.preflight&&this.windowState?.bound===true&&(this.windowState?.coverEnabled!==false||this.preferences?.embedTranslation===true);this.route=this.enabled?(this.preferences?.hookProfile==='embed'?'embed':'custom'):'read';this.markerKey='';this.state={...this.state,processAttached:false};/* a new bridge has the attach grace until it reports the process attached */this.lastHeartbeat=this.now();const serial=++this.serial,child=this.process=this.spawn(path.join(this.folder,'HookBridge.exe'),[String(pid),hwnd,name,started,...(this.route==='read'?['--read-only']:this.route==='embed'?['--official-embed']:[])],{cwd:this.folder,windowsHide:true,stdio:['pipe','pipe','ignore'],/* dot mode from the start: the bridge pre-selects the dialogue stream when its hook goes in */env:{...process.env,MEGULIT_PROFILE:JSON.stringify(this.bridgeProfile()),...(this.sourceLanguage?{MEGULIT_SOURCE_LANGUAGE:this.sourceLanguage}:{}),...require('./glyph-dots.cjs').bridgeEnv(path.join(this.folder,'..')),...(this.compositedFn?.()===true?{MEGULIT_GLYPH_MODE:'dot',MEGULIT_GLYPH_ALL:'1'}:{})}});child.stdin.on('error',()=>{});if(this.enabled)this.send({type:'enable'});
  const failed=()=>{if(serial!==this.serial)return;this.process=null;++this.serial;this.retry('Hook 连接停止');};child.on('error',failed);child.on('exit',failed);
  createInterface({input:child.stdout}).on('line',line=>{if(serial!==this.serial||line.length>30000)return;let m;try{m=JSON.parse(line);}catch{return;}this.lastHeartbeat=this.now();/* Cardinal's tape (core/cardinal/tape.cjs) */cardinalTape.record('hb',m);/* 2026-11-13 replay recording: MEGULIT_HOOK_RECORD=<file.jsonl> keeps every bridge message with its time (validation/hook-replay) */if(process.env.MEGULIT_HOOK_RECORD&&m.type!=='hookHeartbeat')try{fs.appendFileSync(process.env.MEGULIT_HOOK_RECORD,JSON.stringify({t:this.now(),m})+'\n');}catch{}
   /* 2026-11-14 Chinese builds draw GBK through ANSI calls: read them with the code page of the game's own script (core/hook-codepage.cjs) */
   if(m.type==='hookProcess'){const cp=require('./hook-codepage.cjs').hookCodepage(m.path);if(cp!==932){this.trace('hook code page '+cp+' for '+m.path);this.send({type:'codepage',value:cp});}return;}
   if(m.type==='hookEngineFeature'&&['naninovel','cs2','siglus'].includes(m.framework)){
    if(m.framework==='siglus'&&this.enabled){this.enabled=false;this.route='read';this.verified=false;this.preferredThread=null;this.send({type:'disable',reason:'script-vm-capture-only'});}
    this.notify({hookFramework:m.framework});return;
   }
   /* E531: an embed-capable hook is inserted; its stream appears with the first dialogue line, so a title menu is not "unsupported" */
   if(m.type==='hookEmbedPending'){this.trace('embed hook pending '+String(m.code||'').slice(0,200));this.notify({hookEmbedPending:true});return;}
   /* E520: the bridge found this game's remembered dialogue stream (it embedded before): no warm-up, replace from the first line */
   /* signature memory: the remembered hook was relocated by its byte signature (game updated/other build) and inserted before the first line, always on, no switch; a miss is silent and falls back to the existing search */
   if(m.type==='hookSignature'){this.state.hookSignature={found:!!m.found,moved:!!m.moved,module:String(m.module||'').slice(0,100)};this.trace('stream signature '+(m.found?(m.moved?'relocated ':'same place ')+String(m.code||'').slice(0,200):'not found in '+String(m.module||'')));return;}
   /* E610 the bridge left a stream that never carried dialogue: neither the foreign picker nor the stream ranking takes that hook again this run */if(m.type==='hookStreamLeft'){const code=String(m.code||'');(this.leftCodes||(this.leftCodes=new Set())).add(code);if(this.foreignPicked===m.id)this.foreignPicked=null;this.preferredThread=null;this.trace('stream left '+String(m.id||'')+' '+code.slice(0,120));return;}
   if(m.type==='hookMemory'){this.rememberedAt=Date.now();this.remembered={name:String(m.name||'').slice(0,100),code:String(m.code||'').slice(0,1000)};this.trace('stream memory '+this.remembered.name+' '+this.remembered.code);this.notify({hookRemembered:true});try{this.onRemembered?.(this.remembered);}catch(e){this.trace('remembered error '+(e?.message||e));}return;}
   if(m.type==='hookEngineLine'&&PAGE_ENGINES.has(m.engine)){this.pageLine(m);return;}
   /* Text architecture ③ (core/text-paths.cjs): a char-rect record from an engine path; hidden only once the game side confirmed it */
   if(m.type==='hookChars'){this.charRects(m.line);return;}
   /* engine-draw MAGES (native/megulithook/MagesDraw.h, HookBridge EngineInfo): the engine's dialogue pages -> ToMe_CHARS, one line per page unit */if(m.type==='hookEngineDraw'&&m.engine==='mages'){this.magesDraw(String(m.line||''));return;}
   if(m.type==='hookGpuPage'){const page=require('./overlay-placement.cjs').parsePage(m.line);/* #299/#307/#311 (Strawberry Nauts, FSN REMASTERED, ライムライト・レモネードジャム): a page the layer never located (gh=0, nothing awake, no places: the game draws its text another way) says nothing about the text window; taking it for 'window gone' hid the reader's line 0.1 s after each line came, so the box and the game's text were both gone */if(page&&!page.awake&&!(page.glyphHeight>0)&&!page.lines.some(l=>l.rects.length)){if(!this.unseenPageNoted){this.unseenPageNoted=true;this.trace?.('gpu page not located (gh=0): window state ignored');}return;}if(page){this.emit(page);/* the page on screen is the engine's own word on whether its text is shown (a wait marker leaving must not hide the reader's page; no page = text window gone, title) */if(page.armed&&(page.lines.some(l=>l.rects.length)||!page.awake)){/* only the reader's layer follows it: engineDialog stays untouched, or the first line of a page, handed over while the old page fades out, was taken for art text (2026-11-15: every page lost its first line) */this.emit({type:'hookDialog',visible:page.awake,engine:'gpupage'});}}return;}
   if(m.type==='hookTextPos'&&m.engine==='pal_sprite_v1'){this.palPosition(m);return;}
   /* 2026-11-12 the engine's own text window state (KiriKiri ToMe_DIALOG): a line arriving while it is hidden is art text */
   if(m.type==='hookDialog'&&typeof m.visible==='boolean')this.dialogState(m.visible);
   if(m.type==='hookTextPos'||m.type==='hookPage'||m.type==='hookDialog'||m.type==='hookGameUi'||m.type==='hookFont'||m.type==='hookTextMarks'){this.emit(m);if(m.type==='hookPage')this.islandPage(m);return;}
   /* Translation written back into the game: the bridge holds a dialogue line and asks for its translation. */
   if(m.type==='embedRequest'&&Number.isSafeInteger(m.id)&&typeof m.text==='string'&&m.text.length<=4000){this.emit({type:'hookEmbedRequest',id:m.id,text:m.text});return;}
   /* 2026-11-14 glyph hide (native/fontprobe/GlyphMatch.h): the engine-agnostic fallback hid the game's own drawing of the line (hit),
      learned the dialogue font (key), or found the engine reuses rasterised glyphs and stopped (cached; the bridge turns the stream back to read-only). */
   if(m.type==='hookGlyphHide'){this.glyphHide(m);return;}
   /* 2026-11-14 glyph dots (docs/text-architecture.md): MODE dot serves one small square per dialogue character; the
      bridge forwards the line and every served dot. They are passed on as hookGlyphDots for the capture compositor and the
      current line's dot table is kept in state (hookGlyphDots: seq, text, dots by index, cached). */
   if(m.type==='hookGlyphDots'){this.glyphDots(m);this.glyphColorFlush();return;}
   if(m.type==='hookGlyphColor'){this.glyphColor(m);return;}
   /* the engine's own read flag for the sentence at its click wait: passed on as the read state of the current source */
   if(m.type==='hookEngineRead'){if(typeof m.read==='boolean')this.emit({hookSourceRead:m.read,hookSourceReadOrigin:'engine'});return;}
   if(m.type==='hookGlyphExtra'){this.glyphExtra(m);return;}
   /* 2026-11-15 layer 4 glyph trace: where the GetGlyphOutline glyphs of the line were drawn (core/gpu-glyph-pos.cjs fills the
      positions of ① records whose space is "-"); the latest is kept in state without a UI broadcast. */
   if(m.type==='hookGlyphPos'&&typeof m.line==='string'&&m.line.length<=40000){const p=parseGlyphPos(m.line);if(p){const dots=this.state.hookGlyphDots;/* ① records without a position (GetGlyphOutline engines) get the traced places; the overlay reads state.hookGlyphDots directly */this.state={...this.state,hookGlyphPos:p,...(dots?{hookGlyphDots:fillPlaces(dots,p)}:{})};this.emit({type:'hookGlyphPos',...p});}return;}
   if(m.type==='hookRender'){this.notify({hookDrawCount:Number(m.count)||0,hookDrawAt:Number(m.at)||0});return;}
   if(m.type==='waitMarkerDrawn'){this.emit({type:'waitMarkerDrawn'});return;}
   if(m.type==='waitMarkerStatus'){this.notify({waitMarkerMessage:String(m.message||'').slice(0,300),waitMarkerHookActive:m.active===true});return;}
   if(m.type==='hookSact2Mode'){this.sact2DrawSerial=m.active===true?serial:null;this.sact2Paint=null;return;}
   if(m.type==='hookSact2Paint'){
    if(this.sact2DrawSerial!==serial||!this.enabled||this.skipKey||this.streamProbe||typeof m.text!=='string'||!m.text||m.text.length>128)return;
    this.sact2Paint={serial,line:HookNative.flat(m.text)};
    // Battle balloons and nameless messages can arrive on an auxiliary hook stream.
    if(m.kind==='battle'||m.kind==='narration')this.source({text:m.text,sourceName:'System40',bridgeSerial:serial},name);
    return;
   }
   if(m.type==='hookSource'&&typeof m.text==='string'&&m.text.length<=4000){
    if(this.streamProbe&&(m.streamProbe!==this.streamProbe.id||m.origin==='history'))return;
    if(!require('./danganronpa-pc-source.cjs').receive(this,m,name))this.sourcePage({...m,bridgeSerial:serial},name);return;}
   // v1.1.4: speaker names from a name-role stream, for every engine that reports one (user: the log showed every line as narration).
   if(m.type==='hookPageText'&&typeof m.text==='string'){this.auxPage(m);return;}if(m.type==='hookAuxText'&&typeof m.text==='string'&&m.text.length<=400){this.auxText(m);return;}
   if(m.type==='hookName'&&typeof m.text==='string'){const n=speakerName(m.text);if(n){this.speaker={text:n,at:this.now()};this.noteSpeaker(n);/* a name flushed just after its line belongs to that line (core/sentence-pieces.cjs) */this.sentencePieces?.nameAfter(n,this.speaker.at);}return;}
   if(m.type==='hookThreads'&&Array.isArray(m.hookThreads)){// Unity games create a stream per String-method call site (often 100+); keep the selected and embeddable ones
   // ahead of the cut so a late dialogue stream such as Naninovel's printer is never dropped.
   const rank=t=>(t&&t.selected===true?2:0)+(t&&t.embeddable===true?1:0);this.notify({hookAvailable:true,hookThreads:m.hookThreads.slice().sort((a,b)=>rank(b)-rank(a)).slice(0,100).filter(t=>typeof t.id==='string'&&t.id.length<100).map(t=>({id:t.id,name:String(t.name||'').slice(0,100),code:String(t.code||'').slice(0,1000),sample:String(t.sample||'').slice(0,110),selected:t.selected===true,embeddable:t.embeddable===true,...(t.hideTrying===true?{hideTrying:true}:{}),...(t.hideOnly===true?{hideOnly:true}:{})}))});this.syncEmbedMode();this.syncGlyphMode?.();if(this.streamProbe)return;this.leaveCheck();if(this.preferredThread&&this.state.hookThreads.some(t=>t.id===this.preferredThread)){const id=this.preferredThread;this.preferredThread=null;this.select(id);}else if(!this.foreignPick()){this.unselectedChinese();this.flowStreamCheck();}return;}
   if(['hookStatus','hookError','hookHeartbeat'].includes(m.type)){const value={};for(const k of ['processAttached','streamSelected','receivedText'])if(typeof m[k]==='boolean')value[k]=m[k];if(this.streamProbe)value.receivedText=false;if(typeof m.replacementState==='string')value.replacementState=this.verified&&this.enabled?'user-verified':m.replacementState;if(typeof m.hookActive==='boolean')value.hookActive=m.hookActive;if(m.hookMessage)value.hookMessage=String(m.hookMessage).slice(0,400);if(m.type!=='hookError'&&(value.receivedText??this.state.receivedText)&&(value.processAttached??this.state.processAttached)&&(value.streamSelected??this.state.streamSelected))value.hookMessage='已收到真实游戏台词；'+((value.replacementState||this.state.replacementState)==='user-verified'?'原文隐藏已由用户确认':'原文替换状态请见分阶段诊断');this.notify(value);if(m.type==='hookError')this.retryAt=this.now()+1000;this.syncMarker();}
  });this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookSource:this.lastSource||null,hookRecovering:!!this.lastSource,hookFramework:this.state.hookFramework||null,hookMessage:'正在连接 LunaHook；等待实际文本流'});
  this.sendStreamProbe();
 }
 // Japanese original for a translated build (services/original-text.cjs). Only an exact or position-confirmed match
 // replaces the captured line; anything else, or any error, keeps the captured text so the dialogue never goes missing.
 /* E285 (user: a Chinese script was imported, yet the game was given DeepSeek's wording): one lookup per line, shared by the
    reader and the text written back into the game, so the matcher's reading position moves once per line. */
 /* Front end -> bridge: MODE dot or blank for the glyph fallback (the compositor switches dots on while it runs). */
 /* ① extra lines (records 4): the name plate and the choices are blanked like the line and reported with their cell
    origins, each under its own id (state.hookGlyphExtras: {[id]:{id,kind:'n'|'o',text,dots}}; a new name replaces the old
    one). setGlyphExtras({names:true}) lets the bridge push every name-stream line; {choices:[...]} pushes the options on
    screen ([] clears them). Off by default: only turn it on when the reader overlay draws names and choices itself. */
 /* locating marks for GetGlyphOutline engines (core/glyph-locate.cjs): on only while the reader captures frames to find them */
 setGlyphMarks(on){this.send({type:'glyphMarks',on:on===true});}
 setGlyphExtras(o={}){const m={type:'glyphExtras',names:o.names===true};if(Array.isArray(o.choices))m.choices=o.choices.map(String).filter(t=>t.trim()).slice(0,12);this.send(m);if(Array.isArray(o.choices)&&!m.choices.length&&this.state.hookGlyphExtras){const keep={};for(const[k,v]of Object.entries(this.state.hookGlyphExtras))if(v.kind!=='o')keep[k]=v;this.state={...this.state,hookGlyphExtras:keep};}}
 glyphExtra(m){if(!m||!Number.isSafeInteger(m.id))return;const all={...(this.state.hookGlyphExtras||{})};
  if(m.state==='line'&&(m.kind==='n'||m.kind==='o')&&typeof m.text==='string'){if(m.kind==='n')for(const[k,v]of Object.entries(all))if(v.kind==='n')delete all[k];all[m.id]={id:m.id,kind:m.kind,text:m.text.slice(0,200),dots:[]};const ids=Object.keys(all).map(Number).sort((a,b)=>a-b);while(ids.length>16)delete all[ids.shift()];}
  else if(m.state==='dots'&&Array.isArray(m.dots)&&all[m.id]){const t={...all[m.id],dots:[...all[m.id].dots]};for(const d of m.dots.slice(0,256))if(d&&Number.isInteger(d.i)&&d.i>=0&&typeof d.ch==='string'&&d.k===t.kind&&!t.dots.some(o=>o.i===d.i))t.dots.push({i:d.i,ch:d.ch.slice(0,2),h:d.h|0,b:d.b|0,a:d.a|0,x:d.x|0,y:d.y|0,s:d.s|0,k:d.k,path:String(m.path||'').slice(0,8),...(d.at&&typeof d.at.space==='string'&&/^(c|g|[mt]\d{1,5}x\d{1,5})$/.test(d.at.space)?{at:{x:d.at.x|0,y:d.at.y|0,space:d.at.space}}:{})});all[m.id]=t;}
  else return;
  this.state={...this.state,hookGlyphExtras:all};this.emit(m);}
 setGlyphMode(mode){this.send({type:'glyphMode',mode:'blank'});/* 2026-11-21 dot glyphs retired: always blank */}
 /* Colour evidence for engines whose dialogue is hidden as blank glyphs or skipped GPU draws (nothing of the game's text is on
    screen): the colour of the draw itself. GDI / GDI+ / Direct2D report the DC text colour or brush per line (src text|gdip|d2d|run,
    matched by the line's seq); the GPU glyph trace reports texel tint x vertex colour (src gpu, the line being traced).
    Pure white or black from a source that never showed anything else may not be the final colour (engines that draw white and tint
    in a shader or on the CPU afterwards): such a value is evidence only once the source has shown two different colours in this
    game session. Any other colour is the game's own choice and counts at once (live ISLAND: every line pale cyan, read or not
    yet reached, and the reader stayed white). The colour is passed on as a lineStyleSample for the line's text, into the reader's
    one pixel slot. */
 glyphColor(m){if(!Number.isSafeInteger(m.seq)||!/^#[0-9a-f]{6}$/i.test(m.color||'')||!(m.alpha>=0&&m.alpha<=255))return;const src=m.src==='gpu'?'gpu':'gdi',G=this.glyphColors||(this.glyphColors={gdi:{seen:new Set(),cur:null},gpu:{seen:new Set(),cur:null}}),S=G[src];
  const color=m.color.toLowerCase(),key=color+'/'+(m.alpha>>4);if(S.seen.size<32)S.seen.add(key);S.cur={seq:m.seq,color,alpha:m.alpha,origin:String(m.src||'').slice(0,8),sent:''};this.glyphColorFlush();}
 glyphColorFlush(){const G=this.glyphColors,d=this.state.hookGlyphDots;if(!G||!d||!d.text)return;
  for(const src of ['gdi','gpu']){const S=G[src],c=S.cur;const plain=/^#(?:f[a-f]){3}$|^#(?:0[0-5]){3}$/.test(c?.color||'');if(!c||plain&&S.seen.size<2||src==='gdi'&&c.seq!==d.seq)continue;const tag=d.seq+'|'+c.color+'|'+c.alpha;if(c.sent===tag)continue;c.sent=tag;
   this.emit({type:'lineStyleSample',text:d.text,style:{fill:c.color,alpha:Math.round(c.alpha/255*1000)/1000},origin:'draw-'+c.origin});return;}}
 glyphDots(m){if(m?.state==='status'&&['paused','live','needs-relaunch','marks-off'].includes(m.status)){this.trace('glyph dots '+m.status);this.notify({hookGlyphDotsStatus:m.status});this.emit(m);return;}if(!m||!['line','dots','cached'].includes(m.state))return;const cur=this.state.hookGlyphDots;
  if(m.state==='cached'){if(cur)this.notify({hookGlyphDots:{...cur,cached:true}});this.emit(m);return;}
  if(!Number.isSafeInteger(m.seq))return;/* ④ text marks: an engine that does not draw its dialogue through GDI never gets dots. In compositor mode, a write-back stream whose last two lines got no dot at all is switched to text marks (the game draws 「・」 per character) */if(m.state==='line'&&cur&&cur.seq!==m.seq){this.noDotLines=(cur.dots||[]).length?0:(this.noDotLines||0)+1;this.syncTextMarks?.();}
  let next=cur&&cur.seq===m.seq?{...cur}:{seq:m.seq,text:'',dots:[],cached:cur?.cached===true};
  /* blind dots (kind b) were drawn before their line arrived: they carry the previous seq and belong to the next line,
     mapped here by reading order (the n-th blind dot of a character = its n-th occurrence after the previous one). */
  const pending=cur&&cur.seq!==m.seq?(cur.dots||[]).filter(d=>d.k==='b'&&d.i<0):[];
  if(m.state==='line'&&typeof m.text==='string'){next.text=m.text.slice(0,2048);if(pending.length){let at=0;const mapped=[];for(const d of pending){const j=next.text.indexOf(d.ch,at);if(j<0)continue;mapped.push({...d,i:j});at=j+1;}next.dots=[...next.dots,...mapped];}}
  else if(pending.length)next.dots=[...pending];
  if(m.state==='dots'&&Array.isArray(m.dots)){const dots=[...next.dots];for(const d of m.dots.slice(0,1024))if(d&&Number.isInteger(d.i)&&typeof d.ch==='string'&&/^[dcprb]$/.test(d.k)&&!dots.some(o=>o.i===d.i&&o.k===d.k&&(d.i>=0||o.ch===d.ch&&o.h===d.h)))dots.push({i:d.i,ch:d.ch.slice(0,2),h:d.h|0,b:d.b|0,a:d.a|0,x:d.x|0,y:d.y|0,s:d.s|0,k:d.k,path:String(m.path||'').slice(0,8),...(d.at&&typeof d.at.space==='string'&&/^(c|g|[mt]\d{1,5}x\d{1,5})$/.test(d.at.space)?{at:{x:d.at.x|0,y:d.at.y|0,space:d.at.space}}:{})});next.dots=dots.slice(0,2048);}
  this.state={...this.state,hookGlyphDots:this.state.hookGlyphPos?fillPlaces(next,this.state.hookGlyphPos):next};this.emit(m);}
 magesDraw(line){if(line.length>1000)return;const pid=this.gamePid?.()||0;if(!this.magesLive||this.magesLive.pid!==pid){const D=require('./mages-draw.cjs'),t=Profiles.get(this.profile,'draw.engineTable',null);this.magesLive=new D.MagesLive({table:t&&t.engine==='mages'?t:{}});this.magesLive.pid=pid;}for(const rec of this.magesLive.feed(line))this.charRects(rec);}
 clearNativeRuby(){const own=this.nativeRuby;if(own)for(const key of own.keys)if(this.sourceRuby?.get(key)===own.pairs)this.sourceRuby.delete(key);this.nativeRuby=null;}
 nativeLineRuby(rec){
  if(rec.engine!=='krkr'&&rec.engine!=='renpy')return;
  this.clearNativeRuby();const pid=this.gamePid();if(!(pid>0)||!rec.text||!rec.ruby?.length)return;
  const pairs=require('./text-paths.cjs').rubyPairs(rec);if(!pairs.length)return;
  const keys=[...new Set([rec.text,rec.text.replace(/\s+/g,'')])],map=this.sourceRuby||(this.sourceRuby=new Map());
  for(const key of keys)map.set(key,pairs);while(map.size>64)map.delete(map.keys().next().value);
  this.nativeRuby={pid,started:String(this.target?.started||''),engine:rec.engine,line:rec.line,keys,pairs};
 }
 charRects(raw){const tp=require('./text-paths.cjs'),rec=tp.parseChars(raw);if(!rec)return;this.drawLog(raw);/* engine-draw (docs/engine-draw-protocol.md): a UI item (name, choice, button, menu, system) is annotated beside its box, never hidden or replaced; a dialogue line may ask for its in-game replacement */if(require('./engine-draw.cjs').routeOf(rec)==='ui'){this.emit({...rec,type:'hookDrawUi'});return;}this.nativeLineRuby(rec);this.engineDrawLine(rec);if(rec.engine==='krkr'){const pid=this.gamePid();if(this.krkrChars?.pid!==pid)this.krkrChars={pid,n:0};this.krkrChars.n++;const K=this.pageState;if(K&&this.filterHookRedraws(K)&&!rec.text&&rec.line===K.latestLine)K.clear={line:rec.line,at:this.now(),sequence:this.state.hookSequence};}const gate=this.charGates||(this.charGates=new Map());if(!gate.has(rec.engine))gate.set(rec.engine,new tp.HiddenGate());rec.hidden=gate.get(rec.engine).report(rec)&&rec.hidden;rec.at=this.now();if(!this.textPathActive&&(rec.engine==='unity'||rec.engine==='web')){this.textPathActive=true;this.syncGlyphMode?.();}this.emit(rec);}
 glyphHide(m){if(!m||!['ready','hit','key','cached'].includes(m.state))return;const v={hookGlyphHide:m.state==='key'||m.state==='ready'?(this.state.hookGlyphHide||'learning'):m.state};if(m.state==='ready'&&Number.isFinite(m.version))v.hookGlyphVersion=Number(m.version);if(m.state==='hit'&&typeof m.path==='string')v.hookGlyphPath=m.path.slice(0,16);if(m.state==='key'&&typeof m.face==='string'&&Number.isFinite(m.size))v.hookGlyphFont={face:m.face.slice(0,64),size:Number(m.size)};this.trace('glyph hide '+m.state+(m.path?' '+String(m.path).slice(0,16):'')+(m.size?' '+Number(m.size)+'px':''));this.notify(v);}
 markScriptSource(){try{if(this.state&&!this.state.scriptSource)this.notify({scriptSource:true});}catch{}}
 resolveSource(text){const provider=this.originalText;if(!provider||!text||HookNative.nonDialogue(text))return null;const key=String(text).replace(/\s+/g,'');this.sourceCache??=new Map();const from=typeof provider.position==='function'?provider.position():-1,ok=x=>!!x&&(x.status==='exact'||x.status==='high');
   /* 2026-11-21 (pairing self-test read in script order) a pairing is weak when it is a guess (the same words stand in several places and the
   reading position is near none of them) or lies far from the reading position (more than 400 lines ahead or 12 behind, or taken from the lines just read back: 素晴らしき日々 「へ？」
   handed over as へ？ met the one narration へ？ 4655 lines on, while 「へ？」 stood three lines ahead); the form of the line found nearest after the
   reading position goes first (also over a pairing more than 12 lines on: bare あれ？ 250 lines on is not 「あれ？」 the next line) (『むぐっ！』 handed over bare: 「むぐっ！」 further on is another line), the weak pairing is kept only when no form is
   near. The reading state is put back before each form. A line found at the reading position that the table leaves in Japanese is that line:
   no other form is tried for it (「え？」 is not the line え？) */const near=x=>from<0||!Array.isArray(x?.indices)||!x.indices.length||x.method==='position'||x.method==='anchored'||x.indices[0]>=from-12&&x.indices[0]-from<=400,gap=x=>Array.isArray(x?.indices)&&x.indices.length&&from>=0?(x.indices[0]>from?x.indices[0]-from:1e6+from-x.indices[0]):0,weakOf=x=>ok(x)&&provider.save&&(x.method==='guess'||x.method==='near-back'||!near(x)),farOf=x=>weakOf(x)||ok(x)&&provider.save&&gap(x)>12&&gap(x)<1e6;
   /* 2026-11-21 (pairing self-test read in script order: 「ああ――」 #487 got the translation of #131, 「此処」 #244 that of #115): a line found in
   several places is kept only while the reading position is still on it; once another line was read, the same words are looked up again
   at the new position (a line the same everywhere is kept as before; a line found once is kept while it is near the reading position) */if(this.sourceCache.has(key)&&this.sourceCache.get(key).provider===provider){const c=this.sourceCache.get(key).r,at=typeof provider.position==='function'?provider.position():null;if(at==null||c.method==='same-text'||!Array.isArray(c.indices)||c.indices.at(-1)===at||c.method==='unique'&&near(c))return c;}const before=provider.save?.();let r=provider.resolve(text);/* 2026-11-21 (千恋＊万花 中文版 r34: 「？？？　例のイベントって？」 missed the patch while the lines around it paired): the hook line can carry the
   speaker the script keeps apart (？？？ / a name and a full-width space, inside or before the bracket, or 【name】); an unsure match is looked up again without it */
   const located=r?.method==='untranslated'&&Array.isArray(r.indices)&&r.indices.length&&near(r);
   if(!located&&(!ok(r)||farOf(r))){const first=ok(r)?r:null,after=provider.save?.();let weak=null,best=first&&!weakOf(first)?{r:first,state:after}:null;
    for(const v of HookNative.speakerless(text)){if(before!==undefined)provider.load?.(before);const r2=provider.resolve(v);if(!ok(r2)){/* the line found right at the reading position, left in Japanese by the table (素晴らしき日々 「何それ？」 #18679), is that line, not a bare 何それ？ elsewhere */if(r2?.method==='untranslated'&&provider.save&&Array.isArray(r2.indices)&&r2.indices.length&&gap(r2)<=12&&(!best||gap(r2)<gap(best.r)))best={r:r2,state:provider.save?.()};continue;}if(weakOf(r2)){weak??={r:r2,state:provider.save?.()};continue;}if(before===undefined){best={r:r2};break;}if(!best||gap(r2)<gap(best.r))best={r:r2,state:provider.save?.()};}
    if(best){if(best.r!==first&&ok(best.r))this.trace?.('patch matched without the speaker prefix');r=best.r;if(best.state!==undefined)provider.load?.(best.state);}else if(first){r=first;provider.load?.(after);}else if(weak){r=weak.r;provider.load?.(weak.state);}else if(after!==undefined)provider.load?.(after);}/* 2026-11-19 only a confident match is kept: an uncertain or missing one (a reading position since corrected, a grown line) is looked up again */if(r&&(r.status==='exact'||r.status==='high'))this.sourceCache.set(key,{provider,r});if(this.sourceCache.size>200)this.sourceCache.delete(this.sourceCache.keys().next().value);return r;}
 // The script's own translation for a captured line, or '' when the line is not matched with confidence.
 /* 2026-11-13 an OCR row (art text) snapped to the script line it reads, when the game's script is known */
 ocrSnap(text){try{const p=this.originalText;if(!p||typeof p.near!=='function'||this.scriptAllowed?.()===false)return '';const t=p.near(text);return t&&t!==text?t:'';}catch{return '';}}
 scriptTranslation(text,returned={}){try{if(this.scriptAllowed?.()!==false&&this.trackPairs){const zh=this.trackPairs.get(String(text||'').replace(/\s+/g,''));if(zh){returned.source="script";return zh;}}const provider=this.originalText;if(!provider||this.scriptAllowed?.()===false)return '';if(provider.resolveJapanese){const hit=provider.resolveJapanese(text);if(hit.status==='exact'){returned.source='official';return hit.translation;}}
  const r=this.resolveSource(text);if(!r||r.status!=='exact'&&r.status!=='high')return '';const t=provider.kind==='patch'?r.translation:r.captured;returned.source=r.machine||r.source==='machine'?'machine':r.filled||r.source==='filled'?'filled':provider.kind==='original'?'official':provider.kind==='patch'?'patch':'script';return typeof t==='string'&&t.trim()&&!require('../services/original-text.cjs').japaneseLine(t)?t.trim():'';}catch{return '';}}
 /* 2026-11-19 a grown line (core/sentence-pieces.cjs) the script cannot cover as a whole (the engine lost a part between two
    pieces): each piece's own script translation, in order, when every piece has one */
 piecedTranslation(text){try{const pieces=this.sentencePieces?.piecesOf(text);if(!pieces||this.scriptAllowed?.()===false)return null;let machine=false;const parts=pieces.map(p=>{const r=this.resolveSource(String(p).replace(/\n+$/,''));if(!r||r.status!=='exact'&&r.status!=='high'||typeof r.translation!=='string'||!r.translation.trim()||require('../services/original-text.cjs').japaneseLine(r.translation))return null;if(r.machine||r.filled||r.source==='machine'||r.source==='filled')machine=true;return r.translation.replace(/\s+$/,'');});return parts.every(Boolean)?{text:parts.join(''),n:parts.length,machine}:null;}catch{return null;}}
 originalTextFor(text){const provider=this.originalText;if(!provider||!text)return text;try{const r=this.resolveSource(text);if(!r)return text;
  if(provider.kind==='patch'){if((r.status==='exact'||r.status==='high')&&typeof r.translation==='string'&&r.translation.trim()&&!require('../services/original-text.cjs').japaneseLine(r.translation)&&typeof this.emit==='function'&&this.scriptAllowed?.()!==false){this.trace('patch-text '+r.status+' #'+r.indices[0]);if(!r.machine&&!r.filled&&!['machine','filled'].includes(r.source))this.markScriptSource();this.emit({type:'hookPatchTranslation',japanese:text,chinese:require('./language-tracks.cjs').engineMarkup(r.translation),machine:!!r.machine||r.source==='machine',...(r.filled||r.source==='filled'?{filled:true}:{})});}else{const pieced=this.piecedTranslation(text);if(pieced){this.trace('patch-text pieced from '+pieced.n+' pieces');this.emit({type:'hookPatchTranslation',japanese:text,chinese:require('./language-tracks.cjs').engineMarkup(pieced.text),machine:pieced.machine});}}return text;}if((r.status==='exact'||r.status==='high')&&r.japanese&&!r.alreadyJapanese){this.trace('original-text '+r.status+' '+r.method+' #'+r.indices[0]);
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
  const current=threads.find(t=>t.selected)?.id||'';if(current&&current===this.manualThread)return false;/* E610 (DDLC Plus live: the remembered TextTypewriterEffect stream is a plugin hook inserted ~2 s after the setters; the picker took an English OS label stream first): while a remembered stream has not shown up, for up to 20 s, nothing is picked */if(this.remembered?.code&&!threads.some(t=>t.code===this.remembered.code)&&Date.now()-(this.rememberedAt||0)<20000)return false;const left=this.leftCodes||new Set();/* E609 (DDLC Plus in Japanese: a stream of English OS labels that maps to the table must not take the selection from the stream that carries the Japanese story) */const curSample=String(threads.find(t=>t.selected)?.sample||'');if(current&&/[぀-ヿ]/.test(curSample)&&(curSample.match(/[぀-ヿ一-鿿]/g)||[]).length>=8)return false;const mine=current||this.foreignPicked||'';
  const cache=this.foreignScores||(this.foreignScores=new Map());const score=t=>{const sample=String(t.sample||'');const c=cache.get(t.id);if(c&&c.sample===sample)return c;let n=0;for(const x of sample.split(/\n+/))if(x.trim()){const ja=this.foreignJapanese(x,{prefix:true});if(ja)n+=ja.length;}const e={sample,n,changes:(c?.changes||0)+(n?1:0)};cache.set(t.id,e);return e;};
  let best=null;for(const t of threads){if(t.id===mine||tried.has(t.id)||!t.sample||left.has(t.code))continue;const s=score(t);if(!s.n)continue;const rows=String(t.sample).split(/\n+/).filter(x=>x.trim());const long=rows.length<=3&&rows.some(x=>/[a-zÀ-ɏ]{2,}[,;]?\s+[a-zÀ-ɏ]{2,}[,;]?\s+[a-zÀ-ɏ]{2,}/i.test(x)&&x.trim().split(/\s+/).length>=5)&&(t.embeddable===true||!threads.find(x=>x.id===mine)?.embeddable);if(mine&&!long)continue;const better=!best||(mine?(s.changes>best.changes||(s.changes===best.changes&&s.n>best.n)):s.n>best.n);if(better)best={id:t.id,n:s.n,changes:s.changes,long};}
  if(!best)return false;if(mine){const own=threads.find(t=>t.id===mine);const o=own?score(own):{changes:0};/* E501 (live DDLC Plus beta.24: 「Skip Intro」 stayed in the reader and the first story line was lost): while the picked stream is a short label (no prose row), the first sample that is a full sentence (5+ words ending in . ! ? … or a quote) is enough to take over */const ownProse=!!own&&String(own.sample||'').split(/\n+/).some(x=>x.trim().split(/\s+/).length>=5);const sentence=String(threads.find(t=>t.id===best.id)?.sample||'').split(/\n+/).some(x=>x.trim().split(/\s+/).length>=5&&/[.!?…"”]\s*$/.test(x.trim()));if(!best.long||best.changes<(ownProse||!sentence?2:1)||(ownProse&&best.changes<=o.changes))return false;}
  tried.add(best.id);if(mine)tried.add(mine);this.foreignPicked=best.id;this.trace('foreign stream pick id='+best.id+' mapped='+best.n+(mine?' (was '+mine+')':''));this.select(best.id);return true;}catch{return false;}}
 /* Japanese text that was decoded as GBK, decoded back: '' when it is not that (an unmapped character, no kana after). */
 static sjisAsGbk(text){try{if(!HookNative.gbk){const dec=new TextDecoder('gbk'),map=new Map();for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){if(b===0x7f)continue;const c=dec.decode(Buffer.from([a,b]));if(c.length===1&&c!=='�'&&!map.has(c))map.set(c,[a,b]);}HookNative.gbk=map;}
  const bytes=[];for(const ch of String(text)){const code=ch.codePointAt(0);if(code<0x80){bytes.push(code);continue;}const pair=HookNative.gbk.get(ch);if(!pair)return '';bytes.push(...pair);}
  const ja=new TextDecoder('shift_jis').decode(Buffer.from(bytes));if(ja.includes('�'))return '';const kana=(ja.match(/[ぁ-ゖァ-ヺ]/g)||[]).length;return kana>=2&&kana>=[...ja].length*.2?ja:'';}catch{return '';}}
 /* 2026-11-14 (月姬 v1.4 / v1.6 Chinese builds: the bridge picks only streams with Japanese, so the Chinese dialogue stream was
    never selected, languageCheck never ran and the reader waited for dialogue with no word why). While nothing is
    selected, a stream whose samples keep changing into Chinese prose (no kana, characters no Japanese font has) raises the
    same Chinese-build notice after three different lines. */
 unselectedChinese(){try{const threads=this.state?.hookThreads||[];if(!threads.length||threads.some(t=>t.selected)||this.state?.sourceChinese||this.japaneseInstall===true)return;
  const seen=this.chineseSamples||(this.chineseSamples=new Map());
  for(const t of threads){const x=String(t.sample||'').trim();if(!HookNative.chineseProse(x))continue;let set=seen.get(t.id);if(!set){if(seen.size>50)seen.delete(seen.keys().next().value);set=new Set();seen.set(t.id,set);}set.add(x);
   if(set.size>=3){this.trace('unselected stream '+t.id+' carries Chinese prose');for(const line of [...set].slice(-3))this.languageCheck(line);return;}}}catch{}}
 static chineseProse(text){const t=String(text||'');if(!t||t.length>400||/[぀-ヿ｡-ﾟ]/.test(t))return false;const han=t.match(/[一-鿿]/g)||[];if(han.length<6)return false;
  if(!HookNative.sjis){const dec=new TextDecoder('shift_jis'),set=new Set();for(let a=0x81;a<=0xfc;a++)for(let b=0x40;b<=0xfc;b++){const c=dec.decode(Buffer.from([a,b]));if(c.length===1&&c!=='�')set.add(c);}HookNative.sjis=set;}
  return han.filter(c=>!HookNative.sjis.has(c)).length>=1&&!HookNative.sjisAsGbk(t);}
 /* never "game hidden, nothing drawn" (2026-11-16): three story-length lines in a row on the selected stream without kana that the script cannot map back to Japanese → stop hiding; the first kana line turns hiding back on */
 japaneseGuard(text){try{const t=String(text||'').replace(/%l[^;%]*;[^%]*%l;/g,'');const letters=(t.match(/[一-鿿㐀-䶿A-Za-zÀ-ɏ가-힯]/g)||[]).length;const kana=/[ぁ-ヺｦ-ﾝ]/.test(t);if(!kana&&letters<6)return;const before=this.noJapaneseSource===true&&this.noJapanesePid===this.pid;
  if(kana||this.foreignJapanese(t)){this.kanalessRun=0;if(before){this.noJapaneseSource=false;this.trace('japanese line again: hiding allowed');this.reapplyConfig();}return;}
  this.kanalessRun=(this.kanalessRun||0)+1;if(this.kanalessRun>=3&&!before){this.noJapaneseSource=true;this.noJapanesePid=this.pid;this.trace('selected stream has no Japanese: the game keeps its own text');this.reapplyConfig();/* #307/#311: say why, once, with the existing notice (a Chinese patch or a non-Japanese language), when the language checks did not raise one */if(!this.state?.sourceChinese&&!this.state?.sourceForeign){const han=(t.match(/[一-鿿]/g)||[]).length;this.notify(han>=4?{sourceChinese:true,hookMessage:'检测到游戏剧本目前没有日文原文（可能装了汉化补丁），MeguLit 不会隐藏游戏原字。请用「工具 → 日文原版恢复」切回日文后再开隐藏'}:{sourceForeign:true,hookMessage:'检测到游戏目前显示的不是日文，MeguLit 不会隐藏游戏原字。请在游戏设置或 Steam（游戏属性 → 语言）里切换成日文后继续'});}}}catch{}}
 reapplyConfig(){try{if(this.preferences&&this.windowState)this.configure(this.preferences,this.windowState);}catch{}}
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
  /* 2026-11-14 (ダストマニア・グロテスク under Japanese locale: the first lines came in as 僙乕僽丄儘乕僪…): Shift-JIS read
     with the Chinese code page looks like Chinese but is Japanese, and an install the shared check (japanese-presence.cjs)
     knows to have Japanese is never called a Chinese build. */
  const misread=!kana&&han.length>=4&&!!HookNative.sjisAsGbk(t);
  const chinese=(!kana||garbled)&&han.length>=4&&!misread&&this.japaneseInstall!==true;this.chineseRun=chinese?(this.chineseRun||0)+1:0;this.chineseForeign=chinese?(this.chineseForeign||0)+foreign:0;
  if(this.chineseRun>=3&&(this.chineseForeign>=2||garbled)&&!this.state?.sourceChinese){this.trace('source looks like Simplified Chinese');this.notify({sourceChinese:true,hookMessage:'检测到游戏剧本目前是中文，MeguLit 需要日文原文。请先在游戏设置或 Steam（游戏属性 → 语言）里改成日文；游戏本身不支持日文的话，用「工具 → 日文原版恢复」；如果游戏目录里没有检测到日文剧本，需要先自行获取日文原版资源，再选「从日文原版导入」，支持直接导入生肉压缩包，自动恢复成日文'});}
  else if(kana&&this.state?.sourceChinese)this.notify({sourceChinese:false});}catch{}}
 /* E407 choices (every engine): text from the hook's non-dialogue streams is collected (never written back), OCR finds
    each choice's row on screen, and the reader draws ruby and translation over the buttons. Every step is logged to
    hook-events.log under "choice". */
 /* 2026-11-12 (user: art text in the opening and during play must be readable, the game keeps drawing it and MeguLit lays an
    invisible copy and the translation over it): a Japanese line from another stream that is not the current dialogue line
    is looked for on the picture (PageLocator art mode); once per text within 20 s. */
 artCandidate(text){try{const t=this.stripHookAnnotations(String(text||'')).trim(),flat=HookNative.flat(t);if(typeof this.artLocate!=='function'||[...flat].length<2||[...flat].length>60)return;
  /* The effect-frame seed already rejects these draws as choices. The art route must not paint the same
     interleaved glyphs or frame-picture names back over its clean dialogue. Other games keep their policy. */
  if(Profiles.get(this.profile,'choice.dropEffectFrames',false)===true&&Profiles.get(this.profile,'page.pairByDrawn',false)===true){
   if(Profiles.choiceFilters(this.profile).some(r=>r.test(t))||HookNative.interleaved(t,Profiles.get(this.profile,'choice.contentInterleave',false)===true))return;
   if((this.recentSources||[]).some(s=>HookNative.flat(s).includes(flat)))return;
  }
  {const lt=require('./language-tracks.cjs');if(lt.stuttered(t)||lt.soundCaption(t))return;if(lt.typedOut(t))return;}
  /* 2026-11-15 (沙耶の唄: the dialogue stream dropped the game's own noise line, then the art path translated it and drew 「对了对了，这次暑假…」
     over it): a line no one can read is no art text either */
  if(require('./text-sanity.cjs').garbledSource(t,{controls:false})){this.trace('art text unreadable, left to the game '+JSON.stringify(t.slice(0,20)));return;}
  if(!/[぀-ヿ㐀-鿿]/.test(flat)||/[\/:]/.test(t)||/[<>{}\[\]=@]/.test(t))return;
  if(this.lastSource&&(HookNative.flat(this.lastSource).includes(flat)||flat.includes(HookNative.flat(this.lastSource))))return;
  const now=this.now(),seen=this.artSeen||(this.artSeen=new Map());const last=seen.get(flat);if(last!=null&&now-last<20000)return;seen.set(flat,now);if(seen.size>200)seen.delete(seen.keys().next().value);
  this.trace('art text located '+JSON.stringify(t.slice(0,40)));this.artLocate(t);}catch{}}
 /* 2026-11-12 art scan, the OCR read path (user: opening titles, credits, chapter cards bilingual in every game, also when
    no hook stream carries them; ファタモルガーナの館's opening lines are pictures). Wanted while the engine says its text window
    is hidden, or no hook line arrived for 2 s: PageLocator then reads the picture when it changes and sends Japanese rows
    that are not the current dialogue line (dialog, speaker; band = the lower text-box band is skipped while a line is
    current) as artText. OCR only reads; the game keeps drawing the text. */
 sayaOcrGroup(m){
  const {legacyExe,SayaPageOcr}=require('./saya-page-ocr.cjs');
  if(m.source!=='ocr'||m.foreign===true||!legacyExe(this.target?.name))return false;
  (this.sayaOcr??=new SayaPageOcr(this)).update(m);
  return true;
 }
 artScanState(now=this.now(),quiet=2000){this.sayaOcr?.providerReady();const hidden=this.engineDialog===false,line=String(this.lastSource||'').trim(),own=!!line&&(this.ocr?.lastText===line||['saya-page-ocr','saya-script-read'].includes(this.state?.hookSourceEngine)),current=!!line&&!hidden&&!own;
  const on=hidden||!line||own||now-(this.lastSourceAt||0)>quiet;
  return {on,dialog:current?line.slice(0,600):'',speaker:current?String(this.state?.hookSpeaker||'').slice(0,40):'',band:current,foreign:this.foreignArtReady()};}
 /* 2026-11-19 (素晴らしき日々: the opening quotes 「私（あるいはこれを読むあなた）は世界に属さない。」 are pictures, no stream carries them; every
    engine's title cards, chapter cards and picture monologues): a group the art scan read (PageLocator artText, source ocr) is a
    line of its own for the reader: read-only, shown where the reader shows lines, never over the picture, never written to the
    game. Refused: while the dialogue line is on the picture or a hook line is current, four or more groups at once (a menu, a
    settings page with its sample text), logos and OCR noise (art-filter), stacked short rows (a list), unreadable text, a part
    of the hook line, and the same text again within a minute. The line goes through source(), so line-once applies as to any line. */
 ocrLine(m){try{if(!m||m.source!=='ocr'||m.foreign===true||m.id==null)return;const O=this.ocr||(this.ocr={shown:new Map(),said:new Map(),done:new Set(),timer:null,lastText:''});
  if(m.visible!==true||typeof m.text!=='string'){O.shown.delete(m.id);return;}
  /* a group is taken once, when its reading has stopped changing (a fade in or out reads as garble); later readings of the same group are ignored */
  if(O.done.has(m.id))return;const was=O.shown.get(m.id),now=this.now();
  const rowTexts=Array.isArray(m.rows)&&m.rows.length?m.rows.map(r=>String(r?.text||'')):[m.text];
  O.shown.set(m.id,{id:m.id,text:m.text,reads:[...(was?.reads||[]),rowTexts].slice(-8),firstSeen:was?.firstSeen??now,rows:Array.isArray(m.rows)?m.rows:[],sw:+m.sw||0,sh:+m.sh||0,dialogSeen:m.dialogSeen===true,others:+m.others||0,once:m.once===true,seenAt:now,changedAt:m.once===true?now-OCR_LINE_SETTLE_MS:was&&was.text===m.text?was.changedAt:now});/* once: read a single time and already gone (a card that faded within a second): taken at once, under the stricter once rule */
  this.ocrSchedule(OCR_LINE_SETTLE_MS);}catch{}}
 ocrSchedule(ms){const O=this.ocr;clearTimeout(O.timer);O.timer=setTimeout(()=>this.ocrFlush(),ms);O.timer.unref?.();}
 ocrFlush(){const O=this.ocr;if(!O)return;const now=this.now();
  /* 2026-11-19 (素晴らしき日々, user build: the quotes were refused as 「19 text groups at once」 while the scan read one): a group read once
     is already gone and never gets a hide, so it is dropped once looked at, taken or not; any group not heard of for a minute is gone too */
  for(const [id,it] of O.shown)if(O.done.has(id)||now-(it.seenAt||0)>OCR_LINE_STALE_MS)O.shown.delete(id);
  const items=[...O.shown.values()];
  if(items.length>=OCR_LINE_MAX_BLOCKS){this.trace('ocr lines skipped: '+items.length+' text groups at once (menu or settings page)');for(const it of items)if(it.once){O.done.add(it.id);O.shown.delete(it.id);}return;}
  let wait=0;const take=[];
  for(const it of items){const age=now-it.changedAt;if(age<OCR_LINE_SETTLE_MS){wait=Math.max(wait,OCR_LINE_SETTLE_MS-age);continue;}
   /* 2026-11-21 (ファタモルガーナの館 opening 「聖なるかな」, core/ocr-vote.cjs): a newer group over the same place with more rows is this text still
      fading in: this one is left to it; the group's readings (and its rows, when they are one phrase) vote the text; readings that
      disagree and cannot be voted are not shown (no translation of a misread); a line of the script near the reading replaces it */
   {const V=require('./ocr-vote.cjs');const newer=items.find(o=>o!==it&&!O.done.has(o.id)&&(o.firstSeen||0)>=(it.firstSeen||0)&&V.supersedes(o,it));
    if(newer){O.done.add(it.id);this.trace('ocr line superseded (still fading in) '+JSON.stringify(String(it.text).slice(0,40)));continue;}
    const v=V.vote(it.reads||[[it.text]]);if(!V.confident(it.reads||[[it.text]],v)){O.done.add(it.id);this.trace('ocr line refused (readings disagree) '+JSON.stringify(String(it.text).slice(0,40)));continue;}
    if(v.text&&v.text!==HookNative.flat(it.text)){this.trace('ocr line voted '+JSON.stringify(String(it.text).slice(0,40))+' -> '+JSON.stringify(v.text.slice(0,40)));it.text=v.text;}it.repeated=v.repeated;
    const near=this.ocrSnap(it.text);if(near){this.trace('ocr line snapped to the script '+JSON.stringify(near.slice(0,40)));it.text=near;}}
   O.done.add(it.id);if(O.done.size>400)O.done.delete(O.done.values().next().value);if(it.once)O.shown.delete(it.id);
   const why=this.ocrLineRefused(it,now);if(why){this.trace('ocr line refused ('+why+') '+JSON.stringify(it.text.slice(0,40)));continue;}
   const flat=HookNative.flat(it.text);O.said.set(flat,now);if(O.said.size>200)O.said.delete(O.said.keys().next().value);take.push(it);}
  /* 2026-11-19 (素晴らしき日々, live: the notice screen's three paragraphs came as three lines in 30 ms, the reader kept only the last):
     the groups taken together are one screen, one line, top to bottom */
  if(take.length){const box=take.flatMap(it=>it.rows).reduce((b,r)=>{const x=+r?.x,y=+r?.y,w=+r?.w,h=+r?.h;if(![x,y,w,h].every(Number.isFinite))return b;return b?{x0:Math.min(b.x0,x),y0:Math.min(b.y0,y),x1:Math.max(b.x1,x+w),y1:Math.max(b.y1,y+h)}:{x0:x,y0:y,x1:x+w,y1:y+h};},null);
   const top=it=>Math.min(...it.rows.map(r=>+r?.y).filter(Number.isFinite),Infinity),text=take.slice().sort((a,b)=>top(a)-top(b)).map(it=>it.text.trim()).join(String.fromCharCode(10)),sw=take[0].sw,sh=take[0].sh;
   this.trace('ocr line '+JSON.stringify(text.slice(0,40)));O.lastText=text;
   this.source({type:'hookSource',text,origin:'ocr',hookActive:true,...(box&&sw&&sh?{ocrRect:{...box,sw,sh}}:{})},'ocr');}
  if(wait>0)this.ocrSchedule(wait+20);}
 static ocrSentence(flat){const t=String(flat||''),n=[...t].length;return n>=12&&/[぀-ヿ]/.test(t)&&(/[。！？!?]/.test(t)||/(ます|ました|ましょう|ません|です|ください)/.test(t));}
 ocrLineRefused(it,now){const f=require('./art-filter.cjs'),t=String(it.text||'').trim(),flat=HookNative.flat(t),n=[...flat].length,O=this.ocr,kana=/[぀-ヿ]/.test(flat);
  if(it.dialogSeen)return 'the dialogue line is on the picture';
  const line=String(this.lastSource||'').trim();if(line&&line!==O.lastText&&this.engineDialog!==false&&now-(this.lastSourceAt||0)<OCR_LINE_QUIET_MS)return 'a hook line is current';
  /* a title or menu screen: three or more rows on the picture that are no Japanese group (START, LOAD, CONFIG, a copyright line) */
  /* 2026-11-21 (owner, STEINS;GATE: 「【フォーントリガー】ボタンで携帯電話を呼び出して、…」 a tutorial over the game's button legend was refused as a menu and never
     translated): a whole Japanese sentence among the other rows is a notice the player reads; it is taken like a line */
  if(it.others>=3&&!HookNative.ocrSentence(flat))return 'a title or menu screen';
  if(it.once&&(!kana||n<4))return 'read once, too short or without kana';
  if(it.once&&n<=12&&it.rows.length===1&&it.sw>0&&it.sh>0&&this.originalText?.ocrSuffix&&this.scriptAllowed?.()!==false){
   const row=it.rows[0],x=(row.x+row.w/2)*100/it.sw,y=(row.y+row.h/2)*100/it.sh;
   const box=require('./scan-area.cjs').area(this.preferences||{},this.flowPage,this.target?.name);
   if(x>=box.scanX&&x<=box.scanX+box.scanWidth&&y>=box.scanY&&y<=box.scanY+box.scanHeight&&this.originalText.ocrSuffix(t))return 'vanished script line ending';
  }
  if(n<2||n>120)return 'length';if(f.artJunk(t,it.rows,it.sh))return 'logo or OCR noise';if(!it.repeated&&f.artList(it.rows))return 'a list'; /* rows of one phrase (a litany fading in) are that phrase, not a list */
  if(require('./text-sanity.cjs').garbledSource(t,{controls:false}))return 'unreadable';
  /* radicals the OCR guesses inside a logo (Novectacle read as 「ノベクタク丿レ」): no word uses them alone */
  if(/[丨丶丿乀乁亅冂冖冫凵勹匚匸卩厂厶廴弋彡彳⺀-⻿⼀-⿟]/u.test(flat))return 'OCR noise';
  /* boxes and frames read as ロ/口, or a few Latin letters among them (ファタ title fading in: 「Dロ,ロ」) */
  {const box=(flat.match(/[ロ口]/gu)||[]).length;if((n<=6&&/[A-Za-zＡ-Ｚａ-ｚ]/.test(flat))||(n<=8&&box*2>=n))return 'OCR noise';}
  /* kanji without kana: a chapter card when large and short, else a logo fragment or a guess (「不連在」 13 px on 963) */
  if(!kana){const tall=Math.max(0,...it.rows.map(r=>+r?.h||0));if(n>8||n<2||(it.sh>0&&tall<it.sh/50))return 'kanji fragment';}
  if(line&&line!==O.lastText){const l=HookNative.flat(line);if(l.includes(flat)||flat.includes(l))return 'part of the hook line';}
  /* #468 (ひぐらしのなく頃に解, Unity NVL: the whole page stays on screen while one hooked line is read, the scan read the page
     after 5 s and its OCR text, 「最高潮」 read as 「最咼潮」, became a line of its own: wrong glyphs, the page read again).
     Text the game's memory already gave always wins: an OCR group whose character pairs are mostly in the hooked lines of
     the last ten minutes is that text read from pixels (OCR errors leave most pairs intact), never a line. Any engine. */
  if(HookNative.hookOverlap(flat,this.hookRecent,now)>=0.5)return 'text the hook already gave';
  const last=O.said.get(flat);if(last!=null&&now-last<OCR_LINE_REPEAT_MS)return 'already shown';return '';}
 /* #468 (ひぐらしのなく頃に解, live 2026-11-20: with the game's text hidden the reader drew one sentence per page; the game keeps every
    sentence of the page until it turns it). The dialogue stream adds one sentence per call and never sends its page again, so the
    page rules (core/page-text.cjs) never knew it was a page game. Another stream of the same game that carries the text box as the
    game holds it (several lines, the current line among them: TMP set_text of the whole page) is that evidence: the game pages,
    and a page that holds the current line but no longer the one before it was turned before this line. Any engine. */
 auxPage(m){try{const P=this.pageText;if(this.calibrating||!P||typeof m?.text!=='string'||!m.text.includes(String.fromCharCode(10)))return;
  const raw=m.text.replace(/<[^>]*>/g,''),k=HookNative.flat(raw),R=this.hookRecent||[],cur=R.length?R[R.length-1].key:'';if(cur.length<2||!k.includes(cur))return;
  const prev=R.length>=2?R[R.length-2].key:'';
  /* One wrapped sentence (TextRender during calibration) is still ADV. Start a page only when the other stream
     demonstrably retains two distinct dialogue lines. An established page may then report its first new line alone. */
  if(!P.pages){
   if(k===cur)return;
   const dialogue=raw.replace(/【[^】\n]*】/g,''),flatDialogue=HookNative.flat(dialogue);
   if(!flatDialogue.includes(cur))return;
   const rows=dialogue.split('\n').map(HookNative.flat);
   const independentRows=prev&&prev!==cur&&rows.includes(prev)&&rows.includes(cur);
   // A translated row can repeat punctuation from the previous line. Only an entire row proves it in that case.
   const additionalDialogue=flatDialogue.split(cur).some(rest=>/[\u3041-\u309f\u30a1-\u30fa]/.test(rest));
   if(!additionalDialogue&&!independentRows&&(!/[\p{L}\p{N}]/u.test(prev)||!HookNative.retainedPrevious(flatDialogue,prev,cur)))return;
  }
  P.paging=true;P.auxPageAt=this.now();
  if(prev&&prev!==cur&&!k.includes(prev)&&this.pageSaidSame===true&&P.auxResetFor!==cur){P.auxResetFor=cur;this.pageSaidSame=false;this.trace('page turned before this line (the page text no longer holds the line before it)');this.emit({type:'hookPage',engine:'text',reset:true,at:this.now()});}}catch{}}
 /* Exclude every occurrence of the current sentence, including overlapping redraws. A previous sentence must
    survive in a separate gap; a speaker prefix or suffix cannot make a substring into a second sentence. */
 static retainedPrevious(page,previous,current){if(!previous||!current)return false;let end=0;for(let at=page.indexOf(current);at>=0;at=page.indexOf(current,at+1)){if(at>end&&page.slice(end,at).includes(previous))return true;end=Math.max(end,at+current.length);}return page.slice(end).includes(previous);}
 /* share of the character pairs of `flat` found in the hooked lines of the last ten minutes (0 when nothing to compare) */
 static hookOverlap(flat,recent,now){const t=String(flat||'');if([...t].length<4||!Array.isArray(recent))return 0;const hay=recent.filter(r=>now-r.at<600000).map(r=>r.key).join(String.fromCharCode(10));if(!hay)return 0;const ch=[...t];let n=0,hit=0;for(let i=0;i+1<ch.length;i++){n++;if(hay.includes(ch[i]+ch[i+1]))hit++;}return n?hit/n:0;}
 auxText(m){if(this.sadisticPage&&['TextOutA','NNNhook'].includes(m.sourceName)&&this.sadisticPage.isRedraw(m.text))return;const text=this.stripHookAnnotations(m.text);if(!text?.trim())return;if(text!==m.text)m={...m,text};this.auxPage(m);{const sp=splitSpeaker(m?.text,this.knownSpeakers);if(sp.name&&!sp.text.trim()){this.speaker={text:sp.name,at:this.now()};this.noteSpeaker(sp.name);return;}}/* 2026-11-15 (沙耶の唄, user: 「ocr遮挡又出来了」): the dialogue hook sends each line on two thread contexts; the one not selected
    came here as aux text, went to the art path and its translation was drawn over the game's own line. A line from the same hook
    as the dialogue stream is dialogue, never art text. */
  if(m.sourceName&&this.dialogueHook&&String(m.sourceName)===this.dialogueHook)return;/* nor choice text (user: 「不是选项」) */
  if(this.recoverPageAside(m))return;
  /* 2026-11-15 (死に逝く君、館に芽吹く憎悪: the side stream's 「X　X　」 frame came 4-25 ms before the dialogue stream's line, was located
     as art text and drawn translated next to the subtitle): a side-stream text waits until the dialogue line of that moment
     has arrived, then the usual "part of the current line" check drops it */
  {const t=m.text;const at=setTimeout(()=>this.artCandidate(t),AUX_ART_DELAY_MS);at.unref?.();}try{this.textEffectsFrame(m.text);}catch{}/* 2026-11-19 (千恋＊万花 settings page: 「オオ」「テテ」 went to OCR as options) no choice candidates while the dialogue box is gone for a known reason */if(this.dialogGoneAt&&Date.now()-this.dialogGoneAt>=800){this.trace('choice aux skipped: dialogue box gone');return;}const C=this.choice||(this.choice=this.newChoiceCapture());if(/^SiglusEngine[234]$/.test(m.sourceName||''))C.noteSiglusFrame(m.text);const added=C.add(m.text,this.lastSource,this.speaker?.text);
  this.trace('choice aux '+String(m.sourceName||'').slice(0,40)+' role='+(m.role??'')+' added='+JSON.stringify(added)+' text='+JSON.stringify(String(m.text).slice(0,80)));
  if(!added.length)return;clearTimeout(this.choiceTimer);this.choiceTimer=setTimeout(()=>this.requestChoices(0),450);this.choiceTimer.unref?.();}
 /* 2026-11-21 (ファタモルガーナの館 r30: 「choice locate options=["お声が聞けて","かったです","か良ったか良でっす…"]」): a text effect's interleaved frame and a piece
    of the dialogue line are not options. Interleaved: one pair of characters three times or more, or few distinct characters for its length */
 /* 2026-11-21: lines drawn hidden at once are options only when laid out like options: two or more rows one under the other, centred on one
    middle (or one left edge and similar widths), evenly spaced, and not in the box the last dialogue line was drawn in */
 static choiceShape(items,dialog){
  const bb=items.map(i=>{const r=(i.rects||[]).filter(v=>Array.isArray(v)&&v[2]>0&&v[3]>0);if(!r.length)return null;const x0=Math.min(...r.map(v=>v[0])),y0=Math.min(...r.map(v=>v[1])),x1=Math.max(...r.map(v=>v[0]+v[2])),y1=Math.max(...r.map(v=>v[1]+v[3]));return {x0,y0,x1,y1,w:x1-x0,h:y1-y0,cx:(x0+x1)/2};});
  if(bb.length<2||bb.some(b=>!b))return false;
  bb.sort((a,b)=>a.y0-b.y0);const g=Math.max(...bb.map(b=>b.h));
  for(let i=1;i<bb.length;i++)if(bb[i].y0<bb[i-1].y1-g*.2)return false;
  const cxs=bb.map(b=>b.cx),wmax=Math.max(...bb.map(b=>b.w));
  const centred=Math.max(...cxs)-Math.min(...cxs)<=Math.max(g,wmax*.08);
  const left=Math.max(...bb.map(b=>b.x0))-Math.min(...bb.map(b=>b.x0))<=g*.5&&Math.min(...bb.map(b=>b.w))/wmax>=.6;
  if(!centred&&!left)return false;
  if(bb.length>=3){const gaps=bb.slice(1).map((b,i)=>b.y0-bb[i].y0);if(Math.max(...gaps)-Math.min(...gaps)>g*.6)return false;}
  if(Array.isArray(dialog)&&dialog.length){const d=dialog.filter(v=>Array.isArray(v)&&v[2]>0);if(d.length){const D={x0:Math.min(...d.map(v=>v[0])),y0:Math.min(...d.map(v=>v[1]))-g,x1:Math.max(...d.map(v=>v[0]+v[2])),y1:Math.max(...d.map(v=>v[1]+v[3]))+g*2.5};if(bb.some(b=>b.x0<D.x1&&D.x0<b.x1&&b.y0<D.y1&&D.y0<b.y1))return false;}}
  return true;}
 /* 2026-11-21 (pairing self-test over every patched game): a script line that is no dialogue never pairs and is not counted: comments
    (■…■), engine variables and commands (@…, Bustshot, backlay, motion_stop, %D$vl1; on their own), and bare labels without kana or
    sentence marks (タイトル-like UI words are kept apart by the caller's repeat count) */
 static nonDialogue(text){const t=String(text||'').trim();if(!t)return true;
  if(/^■.*■$/.test(t)||/^[@＠#＃;；]/.test(t)||/^\/\/[^぀-ヿ]*$/.test(t))return true; /* a // comment, never 「/////っ！！」 */
  const ascii=(t.match(/[A-Za-z_$]/g)||[]).length;if(/\b(?:Bustshot|Sprite|backlay|motion_\w+|playse|playbgm|wait|jump|call|layopt|trans|image|eval)\b/i.test(t)&&ascii>=t.length*.3)return true;
  if((t.match(/[!-\/:-@\[-`{-~]/g)||[]).length>=12)return true; /* a font sample row (DDLC: !"#%&'()*+,-./0123456789:;<=>\u2026) */
  if(!/[\u3040-\u30ff\u4e00-\u9fff]/.test(t))return !/[「『（]/.test(t)&&!/[。！？!?…ー〜～]/.test(t)&&t.length<=24;
  if(/が表示されていません|翻訳不要|未使用|ダミー/.test(t))return true;
  return false;}
 static speakerless(text){const t=String(text||'').trim(),out=[];const add=v=>{v=v.trim();if(v&&v!==t&&!out.includes(v))out.push(v);};
  add(t.replace(/^【[^】]{1,16}】\s*/,''));const name='(?:[？?]{2,}|[一-龯々ァ-ヶー・]{2,8})'; /* one character is no name (素晴らしき日々: 「マ　で？　マジ…」, a line with gaps) */add(t.replace(new RegExp('^([「『（])'+name+'[\\s　]+'),'$1'));add(t.replace(new RegExp('^'+name+'[\\s　]*(?=[「『])'),''));
  /* the other way round: the script keeps an unknown speaker inside the line (千恋＊万花: 「？？？　例のイベントって？」, 7 of 54584 lines) while the
     hook gives the line without it (the name plate took ？？？; r34 seq 37 came as 11 characters) */
  if(/^[「『]/.test(t)&&!/^[「『][？?]{2,}/.test(t)){add(t[0]+'？？？　'+t.slice(1));add(t[0]+'？？　'+t.slice(1));}
  /* a line handed over without its brackets (the bracket drawn apart, or cut by the source) is the script's 「…」 / 『…』 line */
  /* ruby / effect markup the script does not keep, and digits or letters the source gives half-width where the script has them full-width */
  {const plain=t.replace(/[｜|]([^《\[｜|]+)[《\[][^》\]]*[》\]]/g,'$1').replace(/《[^》]*》/g,'').replace(/\[[^\]]*\]/g,'');if(plain!==t){add(plain);for(const v of HookNative.speakerless(plain))add(v);}
   const full=t.replace(/(%[0-9A-Za-z]*;)|[0-9A-Za-z]/g,(c,tag)=>tag||String.fromCharCode(c.charCodeAt(0)+0xFEE0));if(full!==t)add(full);} /* engine tags (KiriKiri %84; …%;) stay as written */
  if(t){add('「'+t+'」');add('『'+t+'』');} /* also around a line that has its own inner brackets: 『「…」\n「…」』, 「「のわっ」」 */
  for(const v of out.slice())add(v.replace(/^[「『]/,'').replace(/[」』]$/,''));return out;}
 /* 2026-11-21 (ファタモルガーナの館 22:52:53: the only option 「……おはよう………………」 was taken for an effect frame by its ellipses, choice filtered 3 -> 1):
    only content characters count, punctuation and symbols repeat in any line */
 static interleaved(t,content=true){const a=[...(content?HookNative.content(t):HookNative.flat(t))];if(a.length<8)return false;if(new Set(a).size/a.length<.55)return true;const m=new Map();for(let i=0;i+1<a.length;i++){const g=a[i]+a[i+1];m.set(g,(m.get(g)||0)+1);if(m.get(g)>=3)return true;}return false;}
 choiceFilter(options){if(!Array.isArray(options))return options;const said=[this.lastSource,...(this.recentSources||[])].map(x=>HookNative.flat(x)).filter(Boolean);const drop=Profiles.choiceFilters(this.profile);const fx=Profiles.get(this.profile,'choice.dropEffectFrames',false)===true;const kept=options.filter(o=>{const f=HookNative.flat(o);if(!f)return false;if(drop.some(r=>r.test(String(o))))return false;/* 9b3ff9b1's effect-frame and dialogue-piece checks only where the game diff asks for them (choice.dropEffectFrames): in the kernel they kept ATRI's glued options from OCR */if(!fx)return true;if(HookNative.interleaved(f,Profiles.get(this.profile,'choice.contentInterleave',false)===true))return false;return !said.some(x=>x!==f&&x.includes(f));});if(kept.length!==options.length)this.trace('choice options filtered '+options.length+' -> '+kept.length);/* 2026-11-21 (ATRI choice replay red since 9b3ff9b1): options() hands over one candidate on purpose when the frame came twice in one string (「AB AB」, OCR cuts it at the rows); the filter keeps that single candidate */return kept.length>=2||options.length===1&&kept.length===1?kept:null;}
 requestChoices(round){const options=this.choiceFilter(round>0&&this.choiceOptions?this.choiceOptions:this.choice?.options());
  if(!options){this.trace('choice candidates too few n='+(this.choice?.items.length||0));return;}
  if(typeof this.locateChoices!=='function'){this.trace('choice locate unavailable');return;}
  const group=this.originalText?.choiceGroupAfter?.(this.lastSource,options);
  const confirmed=!!group&&this.choiceReaderAllowed?.()!==false;
  if(this.state.hookChoices?.scriptGroup&&!confirmed){
   if(this.choiceReaderAllowed?.()===false)this.clearChoices('reader disabled');
   return;
  }
  this.choiceOptions=group||options;this.choiceRound=round;
  if(confirmed&&!this.state.hookChoices?.scriptGroup){
   this.choice.active=true;
   this.trace('choice script group confirmed, awaiting native rectangles');
   this.notify({hookChoices:{items:group.map(text=>({text})),geometryPending:true,scriptGroup:true,at:this.now()}});
  }
  this.trace('choice locate round='+round+' options='+JSON.stringify(this.choiceOptions));
  this.locateChoices(this.choiceOptions,!!group);
  if(confirmed&&this.state.hookChoices?.geometryPending&&round<2){
   const screen=this.state.hookChoices;
   clearTimeout(this.choiceTimer);
   this.choiceTimer=setTimeout(()=>{if(this.state.hookChoices===screen)this.requestChoices(round+1);},6000);
   this.choiceTimer.unref?.();
  }}
 choiceBoxes(m){if(process.env.MEGULIT_HOOK_RECORD)try{fs.appendFileSync(process.env.MEGULIT_HOOK_RECORD,JSON.stringify({t:this.now(),m:{...m,type:'hookChoiceBoxes'}})+'\n');}catch{}const n=v=>Number.isFinite(Number(v))?Math.round(Number(v)):0,items=(Array.isArray(m.items)?m.items:[]).filter(i=>i&&typeof i.text==='string').slice(0,12).map(i=>({text:i.text.slice(0,120),x0:n(i.x0),y0:n(i.y0),x1:n(i.x1),y1:n(i.y1)}));
  this.trace('choice ocr '+String(m.status||'')+' found='+items.length+' boxes='+JSON.stringify(items.map(i=>[i.text,i.x0,i.y0,i.x1,i.y1]))+' missed='+JSON.stringify(m.missed||[])+' screen='+m.sw+'x'+m.sh+' rows='+JSON.stringify(m.rows||[]));
  if(!this.choiceOptions)return;
  const scriptGroup=this.state.hookChoices?.scriptGroup===true;
  if(scriptGroup){
   // Only replace the detached labels with measured rectangles for this entire group.
   const ordered=this.choiceOptions.map(text=>items.find(i=>i.text===text&&i.x1>i.x0&&i.y1>i.y0));
   if(!ordered.every(Boolean)||!(m.sw>0&&m.sh>0)){
    if(!this.state.hookChoices.geometryPending&&!items.length&&m.status==='miss'&&this.choiceOptions.every(text=>m.missed?.includes(text)))this.clearChoices('choices no longer on screen');
    return;
   }
   items.splice(0,items.length,...ordered);
  }else{const fixed=placeChoices(items,this.choiceOptions,Array.isArray(m.missed)?m.missed.map(String):[],this.choice?.order);if(fixed.length!==items.length)this.trace('choice placed '+JSON.stringify(fixed.map(i=>[i.text,i.x0,i.y0,i.x1,i.y1])));items.splice(0,items.length,...fixed);}
  /* 2026-11-13 one box is enough when every other option is only ellipses (nothing to read or translate there) */
  if(items.length>=2||items.length===1&&this.choiceOptions.length>=2&&(m.missed||[]).length>0&&(m.missed||[]).every(s=>SYMBOL_OPTION.test(String(s)))){this.choice.active=true;this.notify({hookChoices:{items,...(scriptGroup&&{scriptGroup:true}),sw:n(m.sw),sh:n(m.sh),at:this.now(),/* options on screen OCR could not box (ellipsis rows): the reader keeps clear of them */unboxed:Math.max(0,this.choiceOptions.length-items.length)}});
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
 source(m,name){if(m?.bridgeSerial!==undefined&&m.bridgeSerial!==this.serial)return;if(require('./danganronpa-pc-source.cjs').shouldBlock(this,m))return;if(require('./unity-il2cpp-source.cjs').shouldBlock(this.textPath,m,this.target))return;if(require('./unity-kemco-source.cjs').shouldBlock(this.textPath,m,this.target)||require('./artemis-session.cjs').shouldBlock(this.textPath,m,this.target,undefined,this.wanted!==false))return;if(m&&/textrender/i.test(String(m.sourceName||'')))this.trSeen=this.gamePid();
  /* E560 Unity setter streams: typewriter steps and whole NVL pages become the one paragraph the game is on (core/unity-source.cjs) */
  {const code=String(m.sourceCode||'');if(code.endsWith(':JIT:UNITY')&&!m.unityBoxed&&typeof m.text==='string'&&!this.skipKey){const {UnityBox}=require('./unity-source.cjs');(this.unityBox||(this.unityBox=new UnityBox(()=>this.now(),(line,p)=>this.source({...p.m,text:line,unityBoxed:true},p.name)))).feed(code,cleanSource(m.text,name,code),{m,name});return;}}
  /* 2026-11-14 (ダストマニア・グロテスク, Chinese patch): Shift-JIS read as GBK (or any Japanese read with the wrong code page:
     Big5, Korean, Western, UTF-8) becomes the Japanese it was (core/text-sanity.cjs).
     The hook gets this text already as UTF-16 (the game converted it with the system code page), so the hook's own code page
     setting cannot help: each stream is judged by its text and locked once it is clearly one or the other. */
  if(m.sourceName&&m.origin!=='history')this.dialogueHook=String(m.sourceName);
  if(typeof m.text==='string'){const stream=name||m.sourceCode||m.sourceName||'';const fixed=(this.codepage||(this.codepage=new (require('./text-sanity.cjs').StreamCodepage)())).fix(stream,m.text);if(fixed.locked)this.trace('stream locked as '+fixed.pair+' '+JSON.stringify(String(stream).slice(0,60)));if(fixed.unreadable){this.trace('source dropped unreadable ('+this.codepage.mode(stream)+') '+JSON.stringify(m.text.slice(0,20)));return;}if(fixed.repaired){this.trace('source repaired '+fixed.pair+' '+JSON.stringify(fixed.text.slice(0,20)));m={...m,text:fixed.text};}}
  /* 2026-11-12 (ファタモルガーナの館: "……けれど……", drawn large in the middle of the opening, was hidden and shown as a subtitle
     at the bottom): while the engine says its text window is hidden, a line is art text. HookBridge leaves it to the game;
     here it goes to the art layer (invisible readable copy + translation where the game drew it), not to the subtitles. */
  /* 2026-11-19 (ISLAND with its own hook, rig2 live: 「…………はぁ」 arrived 7 ms after the window reported hidden for a sprite change
     and 0.3 s before it was shown again; taken as art text, the line was never shown) a line in the first 0.6 s of a hidden text
     window waits: the window back within that time makes it dialogue, otherwise it is art text as before */
  if(this.engineDialog===false&&typeof m.text==='string'&&m.text.trim()&&this.now()-(this.engineDialogAt||0)<600&&!m.boxBlinkTimedOut){const b=this.boxBlink||(this.boxBlink={lines:[],timer:null});if(!b.lines.some(x=>x.m.text===m.text))b.lines.push({m,name});if(!b.timer){const wait=Math.max(1,600-(this.now()-(this.engineDialogAt||0)));b.timer=setTimeout(()=>{if(this.boxBlink!==b)return;this.boxBlink=null;for(const x of b.lines)this.source({...x.m,boxBlinkTimedOut:true},x.name);},wait);b.timer.unref?.();}return;}
  if(this.engineDialog===false&&typeof m.text==='string'&&m.text.trim()){const text=this.stripHookAnnotations(m.text);this.trace('art text (text window hidden) '+JSON.stringify(text.slice(0,40)));this.artSeen?.delete(HookNative.flat(text.trim()));this.artCandidate(text);return;}
  // The game's own ruby readings ride after the line as \x1d base \x1c reading pairs (ISLAND hook): split them off
  // before anything else sees the text, and attach them when this line is delivered (user, 2026-11-03).
  const extracted=require('./source-ruby.cjs').extractSourceRuby(m.text);let ruby=extracted.ruby;m={...m,text:this.stripHookAnnotations(extracted.text)};
  if(typeof m.text==='string'&&!m.text.trim()&&extracted.text?.trim())return;
  if(this.pageRedraw(this.pageState,m.text)){this.trace('krkr page: hook redraw with the drawn line at its end, skipped chars='+m.text.length);return;}
  /* 2026-11-14 a Japanese line that reached us decoded as GBK (no kana, decodes back to kana-rich Shift-JIS) is read as Japanese */
  if(typeof m.text==='string'&&!/[ぁ-ゖァ-ヺ]/.test(m.text)){const ja=HookNative.sjisAsGbk(m.text);if(ja){this.trace('Shift-JIS read as GBK, decoded again');m={...m,text:ja};}}
  this.languageCheck(m.text);this.japaneseGuard(m.text);
  /* a line still unreadable after that (mojibake, replacement characters) is never drawn; the game keeps its own text */
  /* 2026-11-15 (沙耶の唄: after such a line the reader kept the previous line's furigana and translation over a page that no longer
     had it): the line on screen is now one MeguLit cannot read, so the reader steps aside (hookLineUnreadable) until the next
     readable line; HookBridge leaves the line to the game (EmbedTextPolicy.Unreadable), nothing hides it. */
  /* 2026-11-15 (user, 沙耶の唄: 「这乱码是原文文本啊」): the monsters' speech is noise in the game's own script (2003 script.pak, official
     Chinese too). On a stream already known as readable Japanese (two kana lines, StreamCodepage 'native') such a line is the
     script's text: delivered, hidden, redrawn in place and translated like every other line. Only replacement characters
     and code-page mojibake stay unreadable there. */
  /* user: 「按照剧本来上遮罩防止误杀」 - a line the game's own script holds exactly is its text, whatever it looks like */
  let scripted=false;if(typeof m.text==='string'&&this.originalText){try{const r=this.resolveSource(String(m.text).trim());scripted=!!r&&r.status==='exact';}catch{}}
  const pageParts=this.filterHookRedraws()?this.pageScriptParts(m.text):[];
  const authored=pageParts.length===1||pageParts.length>1&&this.pageNvl();
  /* A wide hook proves decoding, not that a redraw frame is a sentence. Only this opt-in effect-page
     policy applies, and a line verified exactly in the script remains the game's authored dialogue. */
  if(this.originalText&&!scripted&&!authored&&Profiles.get(this.profile,'choice.dropEffectFrames',false)===true&&Profiles.get(this.profile,'page.pairByDrawn',false)===true&&HookNative.interleaved(m.text,Profiles.get(this.profile,'choice.contentInterleave',false)===true)){this.trace('source effect redraw left to the engine');return;}
  /* a wide / UTF-8 hook (LunaHook H W|Q|U|V) hands over the engine's own string: never code-page mojibake (EmbedTextPolicy.EngineText) */
  const engineText=/^H[WQUV]/.test(String(m.sourceCode||''))&&typeof m.text==='string'&&!/\ufffd/.test(m.text);
  const scriptNoise=scripted||authored||engineText||typeof m.text==='string'&&this.codepage?.mode(name||m.sourceCode||m.sourceName||'')==='native'&&/[\u3041-\u309f\u30a1-\u30fa]/.test(m.text)&&!/\ufffd/.test(m.text)&&!require('./text-sanity.cjs').repairShiftJisAsGbk(m.text);
  if(scriptNoise)this.trace('script noise line kept '+JSON.stringify(String(m.text).slice(0,20)));
  if(!scriptNoise&&require('./text-sanity.cjs').garbledSource(m.text,{controls:false})){this.trace('source dropped unreadable '+JSON.stringify(String(m.text).slice(0,20)));if(!this.lineUnreadable){this.lineUnreadable=true;this.notify({hookLineUnreadable:true});}return;}
  // Multilingual containers keep only the Japanese track (E243); streams that deliver every line several times (or every character doubled) are learned and undone per stream (E215).
  this.repeats=this.repeats||new (require('./repeat-normalizer.cjs').RepeatNormalizer)();
  this.attempt=0;/* 2026-11-13 (user: DDLC Plus set to English showed nothing): a line in another language is first looked up in the
     game's own parallel language tables (foreignJapanese, original-text.cjs), so the reader gets the Japanese line */
  {const raw=scriptSource(cleanSource(m.text,name,String(m.sourceCode||'')));const ja=this.foreignJapanese(raw);if(ja){m={...m,text:ja};}}
  /* 2026-11-19 (千恋＊万花: 「■自動車（車内／走行）」 in the reader) script stage notes are no dialogue (core/line-once.js) */
  const frame=authored?m.text:require('./language-tracks.cjs').japaneseTrack(LineOnce.stripStageNotes(scriptSource(cleanSource(m.text,name,String(m.sourceCode||'')))));
  const stream=String(m.sourceCode||m.sourceName||name||'');this.sourceStream=stream;
  let drawn=frame;
  if(!authored){
   drawn=this.repeats.normalize(stream,frame);
   const rc=require('./ruby-copies.cjs').collapse(drawn);if(rc){this.trace('source ruby copies folded ('+rc.copies+')');/* the readings of the folded copies go to the furigana */for(const pair of LineOnce.collapse(drawn).ruby)if(!ruby.some(q=>q[0]===pair[0]))ruby.push(pair);drawn=rc.text;}
  /* E408 one frame holding the line twice (redraw), collapsed only on same-stream evidence.
     2026-11-15 (死に逝く君、館に芽吹く憎悪, Krkr2wcs draws every line twice 「X　X　」): judged on the frame as the stream drew it, before
     the script lookup, with the evidence taken from the frame before repeat-normalizer (core/double-line.cjs). */
   if(typeof drawn==='string'){const dbl=(this.doubles||(this.doubles=new DoubleLine(()=>this.now()))).fix(stream,drawn,this.lastSource,typeof frame==='string'?frame:drawn);if(dbl.collapsed){this.trace('source doubled collapsed ('+dbl.reason+') chars='+drawn.length+'->'+dbl.text.length);drawn=dbl.text;}}
   /* 2026-11-19 (user: 「所有游戏都禁止复读」; 千恋＊万花 「志那都荘まで…」 drawn six times, ruby base and reading alternating): the same
      sentence again in one frame (redraw, base/reading variant, whole run repeated) is one sentence; readings go to the ruby */
   if(typeof drawn==='string'){const once=LineOnce.collapse(drawn);if(once.collapsed){this.trace('source repeat collapsed chars='+drawn.length+'->'+once.text.length);drawn=once.text;for(const pair of once.ruby)if(!ruby.some(q=>q[0]===pair[0]))ruby.push(pair);}}
  }
  /* 2026-11-19 (素晴らしき日々: 「やっぱり……いい女には、」「たばこと」「屋上と」… one sentence the game adds to its box piece by piece) a piece of an open quotation grows the line (core/sentence-pieces.cjs) */if(!this.filterHookRedraws()&&typeof drawn==='string'&&drawn.trim()){const grown=(this.sentencePieces||(this.sentencePieces=new SentencePieces(()=>this.now()))).take(this.sourceStream||'',drawn,this.speaker&&this.now()-this.speaker.at<2500?this.speaker.text:'',this.speaker?.at??Infinity);if(grown!==drawn){this.trace('sentence piece joined chars='+drawn.length+'->'+grown.length);drawn=grown;}}
  let text=String(this.originalTextFor(String(drawn??'').replace(/\n+$/,''))??'').replace(/\n+$/,'');
  if(!text.trim())return;
  /* 2026-11-13 multi-language container (サノバウィッチ 日简繁): the game's own Chinese track is this line's official translation */{const zh=require('./language-tracks.cjs').chineseTrack(scriptSource(cleanSource(m.text,name,String(m.sourceCode||''))),text);if(zh){const k=text.replace(/\s+/g,'');(this.trackPairs||(this.trackPairs=new Map())).set(k,zh);if(this.trackPairs.size>4000)this.trackPairs.delete(this.trackPairs.keys().next().value);}}
  /* E320 WITCH ON THE HOLY NIGHT (flow page): its title-screen help ("Change text display speed.Change auto-scroll speed." ...) came through the dialogue hook
     and was read as a story line, and one line once arrived twice in one piece. Text without any Japanese is menu/help text here, and a line made of
     the same sentence twice is that sentence. */
  if(this.flowPage)this.syncEmbedMode();
  /* 2026-11-19 (ファタモルガーナの館 live: 「館がある」 read from the picture went back to the art path and was shown nowhere with artText off) a line the art scan read is already a card: it is shown as it is */
  if(this.flowPage&&m.origin!=='ocr'){if(!this.flowStory(text)){
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
  if(!authored){const lt=require('./language-tracks.cjs');if(lt.soundCaption(text)||lt.stuttered(text)){this.trace('drop caption/typewriter frame '+JSON.stringify(text.slice(0,40)));return;}if(lt.scriptIdentifier(text)){this.trace('drop script identifier '+JSON.stringify(text.slice(0,40)));return;}if(lt.borrowedCode(text)){this.trace('drop borrowed-code (Chinese patch) line '+JSON.stringify(text.slice(0,40)));if(!this.japaneseStream)this.notify({hookNotice:'这句是汉化补丁的「借码」文字，不是日文原文（常见于汉化版存下的存档）。MeguLit 不会读取它；请从日文原版存的档或新游戏开始',hookNoticeAt:this.now()});return;}if(lt.foreignLine(text)&&this.japaneseStream){this.trace('drop foreign-language line '+JSON.stringify(text.slice(0,40)));return;}}
  if(/[ぁ-ゟァ-ヺ]/u.test(text))this.japaneseStream=true;
  // The game's own LOG/backlog (E215.2, user: hide MeguLit there and do not read it): opening it replays lines read
  // earlier, several within a second. Two or more earlier lines (other than the current one) inside one second mark the
  // LOG: those lines are neither read nor recorded and the reader hides; it returns after 1.5 s without replays or at
  // the first new line. A single repeated line (a script repeating itself) is read as usual.
  {const L=this.nativeLog||(this.nativeLog={seen:new Map(),hits:[],active:false,timer:null}),now=this.now(),key=text.replace(/\s+/g,'');
   /* 2026-11-19 (ISLAND with its own hook: a page relayout sends the page's earlier lines again, 「わお…」 after 「いやっほう…」, a
      whole NVL page after its newest line; 96 false LOGs paused reading and 14 of 20 lines were never shown, also in v1.4.16) the
      LOG is told by evidence, not by any repeat: earlier lines read lately (the last 40) arriving while the story has not moved
      on for 2 s. A line that moves on (new, or the one read after the current line: a new game or a skip through text read
      before) is progress, and so is any line read; earlier lines within 2 s of that are the page being laid out again
      and are read as usual. */
   const recent=L.order||(L.order=[]),c=recent.length-1,at=recent.lastIndexOf(key),seen=L.seen.has(key);
   const anchor=L.lastKey!==undefined?L.lastKey:recent[c],before=recent.lastIndexOf(anchor,anchor===key?-1:recent.length-1),repeatCurrent=c>=0&&at===c,forward=!seen||at<0||repeatCurrent&&!L.active&&!L.held||before>=0&&recent[before+1]===key;
   if(forward&&!repeatCurrent)L.progressAt=now;
   const current=key===String(this.lastSource||'').replace(/\s+/g,''),settled=now-(L.progressAt||0)>=2000;
   const replay=seen&&!forward&&(L.active||settled)&&(!current||L.active||!!L.held);L.hits=L.hits.filter(h=>now-h.at<1000);if(replay&&!L.hits.some(h=>h.key===key))L.hits.push({at:now,key});
   /* a suspected LOG loses nothing: its lines wait in a stash. When the story goes on from the last of them (the line after it in
      history: a new game started again, not a LOG) they are read first, in order; when the LOG closes by itself they go. */
   const stash=L.stash||(L.stash=[]);
   const end=(keep)=>{if(!L.active)return;L.active=false;clearTimeout(L.timer);L.timer=null;if(!keep)stash.length=0;else L.stashAt=this.now();this.trace('native log closed');this.notify({hookNativeLog:false});};
   if(stash.length&&!L.active&&now-(L.stashAt||0)>10000)stash.length=0;
   if(stash.length&&L.bypass!==key){const i=recent.lastIndexOf(stash[stash.length-1].key),j=recent.lastIndexOf(L.lastKey);
    /* lines from well before the last line read (not a LOG, which ends at it) followed by the line after them: the story started again */
    if(i>=0&&j>=0&&i<j-1&&recent[i+1]===key){const lines=stash.splice(0);this.trace('native log was a story restart; '+lines.length+' line(s) read');if(L.active)end(true);this.stashFlush=true;try{for(const x of lines){L.bypass=x.key;L.lastKey=x.key;this.source(x.m,x.name);}}finally{this.stashFlush=false;}L.lastKey=lines.length?lines[lines.length-1].key:L.lastKey;return this.source(m,name);}}
   if(L.bypass===key)L.bypass=null;
   else if(replay&&(L.active||L.hits.length>=2)){if(!L.active){L.active=true;if(L.held){stash.push({...L.held,key:L.heldKey});L.held=null;}this.trace('native log detected; reading paused');this.notify({hookNativeLog:true});}
    if(!stash.some(x=>x.key===key)){stash.push({m,name,key});if(stash.length>20)stash.shift();}clearTimeout(L.timer);L.timer=setTimeout(()=>end(true),1500);L.timer.unref?.();return;}
   // The first earlier line waits 0.4 s: a LOG sends the next one at once, a script repeating one line does not.
   else if(replay){const held=L.held={m,name};L.heldKey=key;const timer=setTimeout(()=>{if(L.held!==held)return;L.held=null;L.bypass=key;this.source(m,name);},400);timer.unref?.();return;}
   if(!replay){end(false);stash.length=0;}L.lastKey=key;L.progressAt=now;if(forward&&!repeatCurrent){recent.push(key);if(recent.length>40)recent.shift();}L.seen.delete(key);L.seen.set(key,now);if(L.seen.size>3000)L.seen.delete(L.seen.keys().next().value);}
  // Scene/chapter keys and asset ids ("10_1", "bg_01.png", "Chapter2") from engine string streams are never dialogue.
  if(identifierNoise(text)){this.trace('drop identifier text '+JSON.stringify(text.slice(0,60)));return;}
  if(this.streamProbe&&m.streamProbe===this.streamProbe.id&&m.origin!=='history')this.finishStreamProbe('recovered');
  if(ruby.length){const map=this.sourceRuby||(this.sourceRuby=new Map());map.set(text,ruby);if(map.size>64)map.delete(map.keys().next().value);}
  if(m.sourceName==='EmbedToMeCS2_DrawPreserve'){if(m.origin==='history'&&this.state.receivedText)return;this.queueIslandSource(text,m.origin);return;}
  if(require('./danganronpa-pc-source.cjs').tagged(m)){if(this.pageNvl())return;this.deliverSource(text,m.origin,'',0,m);return;}
  if(require('./unity-il2cpp-source.cjs').tagged(m)){this.deliverSource(text,m.origin,'',0,m);return;}
  if((require('./unity-kemco-source.cjs').isTaggedSource(m)||require('./artemis-session.cjs').isTaggedSource(m))&&this.pageNvl())return;
  if(m.sourceName==='NNNhook'&&Number.isInteger(this.sadisticPage?.row(text))){this.deliverSource(text,m.origin,'',0,m);return;}
  this.locatePage(text,m.origin);
  if(this.pageRoute(text,m.origin))return;
  if(!/EmbedToMeCS2_DrawPreserve|EmbedEuphoria474_DrawHide/.test(m.sourceName||'')){this.deliverSource(text,m.origin,'',0,m);return;}
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
 pageReset(){this.sentencePieces?.reset();if(this.pageState)clearTimeout(this.pageState.timer);this.pageState=null;this.pageMode=null;this.flowMarkerAt=null;}
 pageNvl(){return this.pageMode?.mode==='nvl'&&this.now()-this.pageMode.at<120000;}
 drawSourceToken(raw){
  let text=require('./language-tracks.cjs').japaneseTrack(scriptSource(cleanSource(String(raw||''))));if(!text.trim())return null;
  /* Match the same script-language resolution and speaker split as the source route, without publishing a second line. */
  if(this.originalText&&this.originalText.kind!=='patch'){try{const r=this.resolveSource(text);if((r?.status==='exact'||r?.status==='high')&&r.japanese&&!r.alreadyJapanese)text=r.japanese;}catch{}}
  text=splitSpeaker(text,this.knownSpeakers).text;return text.trim()?IslandSource.token(text):null;
 }
 pageLine(m){
  // E320: a flow page (WoH) is laid out by the reader from the text box; the screen OCR locator placed the same lines again (doubles, jumps).
  if(m.engine==='ocr'&&(this.flowPage||this.sadisticPage?.isRedraw(m.text)))return;
  this.learnEngine(m.engine);
  if(!Number.isSafeInteger(m.line)||m.line<1||!['begin','end'].includes(m.phase))return;
  const now=this.now(),engine=m.engine,K=this.pageState&&this.pageState.engine===engine?this.pageState:(this.pageReset(),this.pageState={engine,lines:new Map(),held:[],timer:null});
  if(!m.nvl){if(this.pageMode?.mode==='nvl')this.trace(engine+' page mode off');this.pageMode={mode:'adv',engine,at:now};this.releasePageHeld();
   /* E550 ADV sentence: where the engine draws it (canvas pixels, with the canvas size) and its colour, so the reader places and
      paints each line like the game without calibration (web text-position.js, <engine>_adv_v1). */
   if(engine!=='ocr'&&m.sw>0&&m.sh>0){const sourceToken=m.phase==='end'?this.drawSourceToken(m.text):null;this.emit({type:'hookTextPos',engine:engine+'_adv_v1',line:m.line,token:m.line,phase:m.phase,x0:m.x0,y0:m.y0,x1:m.x1,y1:m.y1,size:m.size,sw:m.sw,sh:m.sh,count:m.count,...(sourceToken!==null?{sourceToken}:{}),...(typeof m.color==='string'&&/^#[0-9a-f]{6}$/i.test(m.color)?{color:m.color}:{}),...HookNative.paintField(m.paint),at:now});}
   /* 2026-11-13 (adapt/krkr-bgi, live 女王蜂の王房 めのう編): the engine line carries the whole sentence it drew, but the text stream
      the hook picked (a name-entry label) said nothing for it, so the reader stayed on 「めのう輝夜」. When no hook source arrived
      while this line was drawn, its drawn text is the line (same-text dedupe in emitSource keeps a late hook copy out). */
   if(engine!=='ocr'){if(m.phase==='begin')this.advBeginAt=now;else{const drawn=String(m.text||'').replace(/^\n+|\n+$/g,''),began=this.advBeginAt||now;
    const heard=()=>this.lastSourceAt>=began&&this.lastSourceAt!==this.advOwnAt;if(drawn.trim()&&!heard()){clearTimeout(this.advTextTimer);this.advTextTimer=setTimeout(()=>{if(heard()||HookNative.flat(this.lastSource)===HookNative.flat(drawn))return;this.trace(engine+' adv line '+m.line+' from the engine draw (stream silent)');this.emitSource(this.originalTextFor(drawn),'live');this.advOwnAt=this.lastSourceAt;},400);this.advTextTimer.unref?.();}}}
   return;}
  if(this.pageMode?.mode!=='nvl')this.trace(engine+' page mode on');this.pageMode={mode:'nvl',engine,at:now};
  const filtered=this.filterHookRedraws(K);
  let e=K.lines.get(m.line);if(!e){e={line:m.line,same:m.same===true,hookText:'',origin:'live',ended:false,at:now};K.lines.set(m.line,e);if(K.lines.size>64)K.lines.delete(K.lines.keys().next().value);
   if(!e.same&&!filtered)this.emit({type:'hookPage',engine,line:m.line*2-1,same:false,token:0,at:now});}
  if(!e.hookText){const h=K.held.shift();if(h){e.hookText=h.text;e.origin=h.origin;e.heldAt=h.at;}}
  // OCR reports after the hook line: the first sentence of a page was already delivered as an ordinary line; it is re-read as the page's.
  if(!e.hookText&&engine==='ocr'&&this.lastSource&&HookNative.flat(this.lastSource)===HookNative.flat(String(m.text||'')))e.hookText=this.lastSource;
  if(m.phase!=='end'||e.ended)return;e.ended=true;
  /* 2026-11-21 (ファタモルガーナの館, 22:51:55: page line 10 drew 「私を呼ぶ声が……届いたのだ。」 but took the hook line held before it, 「……けれど……」,
     and the sentence was read twice while the right one was dropped): the hook text is paired by what the line drew, not by order alone.
     A drawn line with kana takes the held hook line whose characters it shows (an effect frame shows them shuffled or repeated); when
     none does, the drawn text is the line and the hook line waits for its own page line (expirePageHeld delivers it if none comes) */
  const own=filtered?this.stripHookAnnotations(String(m.text||'')):String(m.text||'');
  const fx=engine!=='ocr'&&Profiles.get(this.profile,'page.pairByDrawn',false)===true&&this.pagePick(K,e,own)===true;
  const exactDrawn=filtered&&(!/[ぁ-ゟァ-ヺ]/u.test(own)||HookNative.interleaved(own))&&this.pageScriptParts(own).length===1;
  const useDrawn=exactDrawn||filtered&&/[ぁ-ゟァ-ヺ]/u.test(own)&&!HookNative.interleaved(own);
  if(filtered&&!useDrawn&&e.hookText&&(!HookNative.drawnMatch(e.hookText,own)||this.pageScriptParts(e.hookText).length>1)){
   if(!this.pageHeldCovered(K,e.hookText)&&!K.held.some(h=>HookNative.flat(h.text)===HookNative.flat(e.hookText))){
    K.held.unshift({text:e.hookText,origin:e.origin,at:e.heldAt??e.at});this.schedulePageHeld();
   }
   this.trace(engine+' page line '+m.line+' unconfirmed hook text ignored');
   return;
  }
  const drawn=useDrawn?own.trim():HookNative.pageText(own,e.hookText);
  const key=HookNative.flat(drawn);
  if(filtered&&key){
   const published=key===HookNative.flat(this.lastSource)||this.hookRecent?.some(line=>line.key===key)||[...K.lines.values()].some(line=>line.sourceText===key);
   // A line number alone does not make queued hook text new. A clean new draw can repeat authored dialogue.
   if(K.recovered?.key===key&&m.line===K.recovered.line||published&&(!useDrawn||m.line<=(K.latestLine||0))||!useDrawn&&this.pageRedraw(K,drawn)){
    this.trace(engine+' page line '+m.line+' replay ignored chars='+key.length);return;
   }
  }
  if(filtered&&useDrawn&&m.line>(K.latestLine||0))this.flushPageBetween(K,e,drawn);
  const text=!drawn||e.hookText&&!useDrawn?drawn:this.originalTextFor(drawn);
  if(!text){this.trace(engine+' page line '+m.line+' had no readable text');return;}
  const token=IslandSource.token(text),line=m.line*2;
  this.emit({type:'hookPage',engine,line,same:e.same,token,at:now});
  this.emit({type:'hookTextPos',engine:engine+'_screen_v1',line,token,x0:m.x0,y0:m.y0,x1:m.x1,y1:m.y1,size:m.size,sw:m.sw,sh:m.sh,count:m.count,...(typeof m.color==='string'&&/^#[0-9a-f]{6}$/i.test(m.color)?{color:m.color}:{}),...HookNative.paintField(m.paint),at:now});
  const sequence=this.state.hookSequence;
  this.fxNext=fx;try{this.emitSource(text,e.origin==='history'?'live':e.origin,engine,line);}finally{this.fxNext=false;}
  if(filtered&&sequence!==this.state.hookSequence){e.sourceText=HookNative.flat(this.lastSource);K.latestLine=Math.max(K.latestLine||0,m.line);}
 }
 /* What the game really drew this line with (any engine path may report it): paint=f:rrggbbaa[,e:rrggbbaa:width][,s:rrggbbaa:dx:dy]
    f = glyph fill and its opacity, e = outline, s = drop shadow, a:1 = the opacity is not settled yet (a fade-in may be running). Missing parts were not drawn; a malformed field is dropped. */
 static paint(v){if(typeof v!=='string'||!v||v.length>120)return null;const out={};
  for(const part of v.split(',')){if(part==='a:1'){out.animated=true;continue;}const a=part.split(':'),m=/^([0-9a-f]{6})([0-9a-f]{2})$/i.exec(a[1]||'');if(!m)return null;const color='#'+m[1].toLowerCase(),alpha=Math.round(parseInt(m[2],16)/255*1000)/1000,n=i=>{const x=Number(a[i]);return Number.isFinite(x)&&Math.abs(x)<=64?x:0;};
   if(a[0]==='f'&&a.length===2){out.fill=color;out.alpha=alpha;}else if(a[0]==='e'&&a.length<=3){if(alpha>0){out.edge=color;out.edgeAlpha=alpha;out.edgeWidth=Math.abs(n(2));}}else if(a[0]==='s'&&a.length<=4){if(alpha>0){out.shadow=color;out.shadowAlpha=alpha;out.shadowX=n(2);out.shadowY=n(3);}}else return null;}
  return out.fill?out:null;}
 static paintField(v){const style=HookNative.paint(v);return style?{style}:{};}
 // The drawn text keeps the game's rows; the hook's text is the original when they differ (same length: re-broken there).
 static flat(v){return String(v||'').replace(/[ \u3000\r\n]/g,'');}
 static pageText(drawn,hook){const flat=v=>v.replace(/[ \u3000\r\n]/g,''),own=drawn.replace(/^\n+|\n+$/g,'');
  if(hook&&flat(hook)!==flat(own)){const rows=own.split('\n').map(r=>[...r].length),chars=[...hook.replace(/\n/g,'')];if(rows.length<2||rows.reduce((a,b)=>a+b,0)!==chars.length)return hook;
   let at=0;return rows.map(n=>{const r=chars.slice(at,at+n).join('');at+=n;return r;}).join('\n');}
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(own)?own:hook||'';}
 stripHookAnnotations(text){
  const patterns=Profiles.get(this.profile,'page.hookAnnotationPatterns',[]);
  if(!patterns.length||typeof text!=='string')return text;
  const cleaned=patterns.reduce((value,pattern)=>value.replace(new RegExp(pattern,'gu'),''),text);
  return !cleaned.trim()&&text.trim()&&this.pageScriptParts(text).length===1?text:cleaned;
 }
 filterHookRedraws(page=this.pageState){
  return Profiles.get(this.profile,'page.filterHookRedraws',false)===true&&(!page||page.engine==='krkr');
 }
 pageScriptParts(text){return HookNative.flat(text)?this.originalText?.pageParts?.(text)||[]:[];}
 flushPageBetween(K,current,next){
  if(!this.lastSource||!this.originalText?.pageBetween)return;
  const pending=[...K.held,...K.lines.values()].filter(h=>(h.text||h.hookText)&&(!h.line||h===current||!h.ended&&h.line<current.line));
  for(const h of pending){
   const packet=h.text||h.hookText,rows=this.originalText.pageBetween(this.lastSource,packet,next);
   if(!rows.length)continue;
   const key=HookNative.flat(packet);
   K.held=K.held.filter(x=>HookNative.flat(x.text)!==key);
   for(const e of K.lines.values())if(e.line<=current.line&&HookNative.flat(e.hookText)===key)e.hookText='';
   this.schedulePageHeld();
   this.trace(K.engine+' page: recovered '+rows.length+' script row(s) before the next native draw');
   for(const text of rows){this.originalTextFor(text);this.emitSource(text,'live',K.engine,0,SCRIPT_PAGE_ROW);}
   return;
  }
 }
 recoverPageAside(m){
  const K=this.pageState,clear=K?.clear,now=this.now(),key=HookNative.flat(m.text);
  if(!clear||!this.filterHookRedraws(K)||clear.sequence!==this.state.hookSequence||now-clear.at>350||m.role!==0||!/^KiriKiri\d+$/i.test(m.sourceName||''))return false;
  if(key.length>24||!/^（?[…‥]{2,}[^（）]+[…‥]{2,}。?）?$/u.test(key)||key===HookNative.flat(this.lastSource)||!this.originalText?.pageNext?.(this.lastSource,m.text))return false;
  if(clear.pending)return clear.pending===key;
  clear.pending=key;
  const timer=setTimeout(()=>{
   if(this.pageState!==K||K.clear!==clear||this.state.hookSequence!==clear.sequence)return;
   this.originalTextFor(m.text);
   this.emitSource(m.text,'live',K.engine);
   if(this.state.hookSequence!==clear.sequence){K.recovered={key,line:clear.line+1};this.trace('krkr page: next script aside recovered from the auxiliary stream chars='+key.length);}
  },110);timer.unref?.();
  return true;
 }
 pageRedraw(K,text){
  if(!this.filterHookRedraws(K)||!K)return false;
  const flat=HookNative.flat(text),bodies=[...K.lines.values()].map(line=>line.sourceText).filter(Boolean);
  const tails=bodies.filter(body=>flat.length>body.length&&flat.endsWith(body));
  if(!tails.length)return false;
  const known=this.pageScriptParts(text);
  if(known.length===1)return false;
  const confirmed=new Set(tails);
  if(known.length>1){
   let suffix='';
   for(let i=known.length-1;i>0;i--){suffix=HookNative.flat(known[i])+suffix;if(confirmed.has(suffix))return true;}
   return false;
  }
  // Without a script match, require a whole earlier draw or a complete aside before the confirmed tail.
  return tails.some(body=>{
   const prefix=flat.slice(0,-body.length);
   return bodies.some(earlier=>prefix.endsWith(earlier))||/（[….。][^（）]*）$/u.test(prefix);
  });
 }
 pageFallbackParts(text){
  const known=this.pageScriptParts(text);
  if(known.length>1)return known;
  if(known.length===1)return [text];
  // Without a script index, only an explicitly closed parenthesized aside supplies a reliable boundary.
  const parts=[];let rest=text.trim();
  while(rest){const aside=/^（[….。][^（）]*）/.exec(rest);if(!aside)break;parts.push(aside[0]);rest=rest.slice(aside[0].length).trimStart();}
  if(rest)parts.push(rest);
  return parts.length>1?parts:[text];
 }
 pageHeldCovered(K,text){
  if(!this.filterHookRedraws(K))return this.heldCovered(text);
  const flat=HookNative.flat(text);
  if(!flat||(this.recentSources||[]).includes(flat))return true;
  // A standalone script row may also occur inside a different line. Require exact equality to suppress its hook copy.
  if(this.pageScriptParts(text).length)return false;
  return this.heldCovered(text);
 }
 deliverHeld(K,h){
  if(this.pageHeldCovered(K,h.text)){this.trace(K.engine+' page: hook line already read, skipped chars='+h.text.length);return;}
  const choices=this.heldChoiceParts(h.text);
  if(choices){this.trace(K.engine+' page: hook line is the choice screen ('+choices.length+' candidate(s)), left to the choice layer chars='+h.text.length);return;}
  const filtered=this.filterHookRedraws(K);
  if(filtered&&this.pageRedraw(K,h.text)){this.trace(K.engine+' page: hook redraw with the drawn line at its end, skipped chars='+h.text.length);return;}
  const lines=filtered?this.pageFallbackParts(h.text):[h.text];
  for(const text of lines){
   if(filtered&&(this.pageHeldCovered(K,text)||this.heldChoiceParts(text)))continue;
   if(filtered)this.originalTextFor(text);
   this.trace(K.engine+' page: hook line drawn off the page layer, delivered from the hook text chars='+text.length);
   this.fxNext=true;try{this.deliverSource(text,h.origin,filtered?K.engine:'');}finally{this.fxNext=false;}
  }
 }
 pageRoute(text,origin){
  if(!this.pageNvl())return false;
  const K=this.pageState,now=this.now(),open=[...K.lines.values()].reverse().find(e=>!e.ended&&!e.hookText&&now-e.at<3000);
  if(this.pageRedraw(K,text)){this.trace(K.engine+' page: hook redraw with the drawn line at its end, skipped chars='+text.length);return true;}
  if(open){open.hookText=text;open.origin=origin||'live';open.heldAt=now;return true;}
  K.held.push({text,origin:origin||'live',at:now});if(K.held.length>8)K.held.shift();this.schedulePageHeld();return true;
 }
 schedulePageHeld(){const K=this.pageState;if(!K)return;clearTimeout(K.timer);if(!K.held.length)return;const serial=this.serial,wait=Math.max(0,K.held[0].at+this.holdFor(K.engine)-this.now());K.timer=setTimeout(()=>{if(serial===this.serial)this.expirePageHeld();},wait);K.timer.unref?.();}
 /* 2026-11-21 (ファタモルガーナの館: 20 hook lines 「drawn nowhere on the page, dropped」 in 2.5 minutes, about half the story): a hook line no
    page line took is never dropped. One the reader already has (a piece of a delivered line, or a page dump made of delivered lines) goes
    quietly; any other is the game's line drawn off the message layer (a text effect drawn on its own layer, a choice) and is delivered from
    the hook text, counted as an effect line (textEffectsLine). Choice texts glued in one hook line come as one row each */
 expirePageHeld(){
  const K=this.pageState;if(!K)return;
  const now=this.now(),keep=[],wait=this.holdFor(K.engine),nativePage=this.pageNvl()&&K.engine!=='ocr';
  for(const h of K.held){
   if(now-h.at<wait){keep.push(h);continue;}
   if(!nativePage&&!this.filterHookRedraws(K)){this.deliverSource(h.text,h.origin);continue;}
   if(!Profiles.get(this.profile,'page.keepHeld',false)){this.trace(K.engine+' page: hook line drawn nowhere on the page, dropped chars='+h.text.length);continue;}
   this.deliverHeld(K,h);
  }
  K.held=keep;this.schedulePageHeld();
 }
 /* content characters: no spaces, punctuation or symbols (ellipses and brackets say nothing about which line it is) */
 static content(v){return HookNative.flat(v).replace(/[\p{P}\p{S}]/gu,'');}
 /* the drawn text shows the hook line: the same text, one inside the other, or (a text effect: characters shuffled, repeated, fading in) nearly every
    distinct character of the drawn text is in the hook line and most of the hook line's are drawn */
 static drawnMatch(hook,drawn){const a=HookNative.flat(hook),b=HookNative.flat(drawn);if(!a||!b)return false;if(a===b||a.length>=2&&b.includes(a)&&a.length>=b.length*.8||b.length>=2&&a.includes(b)&&b.length>=a.length*.8)return true;
  const x=new Set(HookNative.content(hook)),y=new Set(HookNative.content(drawn));if(x.size<2||y.size<2)return false;let inX=0,inY=0;for(const c of y)if(x.has(c))inX++;for(const c of x)if(y.has(c))inY++;return inX/y.size>=.9&&inY/x.size>=.75;}
 pagePick(K,e,own){if(!/[぀-ヿ]/.test(own))return;/* blank (hidden) or written back (a translation): the hook text stays the line's */
  /* a clean drawn line that holds the hook text and more (the hook line came in pieces: 「…」「…だから……」 for 「……だから……」) is the line itself */
  const whole=h=>{const a=HookNative.flat(h),b=HookNative.flat(own);return b.length>a.length&&b.includes(a)&&!HookNative.interleaved(own);};
  if(e.hookText&&HookNative.drawnMatch(e.hookText,own)){if(whole(e.hookText)){e.hookText='';e.origin='live';return false;}return HookNative.flat(e.hookText)!==HookNative.flat(own);}
  const i=K.held.findIndex(h=>HookNative.drawnMatch(h.text,own));
  if(i>=0){const h=K.held.splice(i,1)[0];if(e.hookText)K.held.unshift({text:e.hookText,origin:e.origin,at:e.heldAt||this.now()});if(whole(h.text)){e.hookText='';e.origin='live';this.schedulePageHeld();return false;}e.hookText=h.text;e.origin=h.origin;this.trace(K.engine+' page line '+e.line+' paired by its drawn text');this.schedulePageHeld();return HookNative.flat(h.text)!==HookNative.flat(own);}
  if(HookNative.interleaved(own))return;/* an effect frame no hook line explains is never the line */
  if(e.hookText){K.held.unshift({text:e.hookText,origin:e.origin,at:e.heldAt||this.now()});this.trace(K.engine+' page line '+e.line+' drew another text than the hook line; the drawn text is the line');e.hookText='';e.origin='live';this.schedulePageHeld();}}
 /* a held hook line the reader already has: inside one recent line, or (a page dump) at least 80 % made of recent lines */
 heldCovered(text){const f=HookNative.flat(text),R=(this.recentSources||[]).filter(Boolean);if(!f)return true;if(R.some(r=>r.includes(f)))return true;
  const mark=new Uint8Array(f.length);for(const r of R){if(r.length<4)continue;let at=f.indexOf(r);while(at>=0){mark.fill(1,at,at+r.length);at=f.indexOf(r,at+1);}}let n=0;for(const v of mark)n+=v;return n>=f.length*.8;}
 heldChoiceParts(text){
  const shown=this.choice?.active&&Array.isArray(this.state?.hookChoices?.items)?this.state.hookChoices.items.map(i=>HookNative.flat(i?.text)).filter(Boolean):[];
  const confirmed=HookNative.glued(text,shown);
  if(confirmed)return confirmed;
  // The frame name and its option are also drawn separately before the choice boxes arrive.
  // Only the composite with the repeated, profile-declared frame label is presentation text.
  const frames=Profiles.get(this.profile,'choice.pageFrames',[]);
  if(!frames.length)return null;
  const flat=HookNative.flat(text),recent=this.choiceKeys();
  for(const label of recent){
   if(!frames.includes('^'+label+'$')||!flat.startsWith(label+label))continue;
   const option=flat.slice(2*label.length);
   if(option&&option!==label&&recent.includes(option)){
    const known=this.sourceCache?.get(String(text).replace(/\s+/g,''));
    if(known&&known.provider===this.originalText&&known.r?.status==='exact')return null;
    return [label,option];
   }
  }
  return null;
 }
 choiceKeys(){const C=this.choice;if(!C||!Array.isArray(C.items))return [];const now=this.now();return C.items.filter(x=>now-x.at<5000).map(x=>x.key).filter(k=>k&&k.length>=2);}
 /* 2026-11-21 (ファタモルガーナの館: the reader's own count saw 5-11 % orphans and never switched to read mode, because the lines the text
    effect broke never reached it): core counts each of the game's first 20 lines. A line is an effect line when it came from the hook
    text because no page line drew it, from a hidden placement with no hook line, from a page line that drew it shuffled, or when an
    interleaved effect frame of its characters was drawn within 3 s. Six lines or more and over 30 % effect lines: hookTextEffects once
    (services/reader.cjs: read mode for this exe, as galTextEffects). A game whose lines come clean (千恋＊万花) never gets there */
 textEffectsState(){const pid=this.gamePid();if(!this.fx||this.fx.pid!==pid)this.fx={pid,lines:[],frames:[],sent:false};return this.fx;}
 static frameOf(set,key){if(set.size<3)return false;const k=new Set(key);let n=0;for(const c of set)if(k.has(c))n++;return n/set.size>=.9;}
 textEffectsLine(text,effect){if(Profiles.get(this.profile,'safeMode.effectJudge',false)!==true)return;const F=this.textEffectsState();if(F.sent)return;const key=HookNative.content(text);if(key.length<2)return;const now=this.now();let l=F.lines.find(x=>x.key===key);
  if(!l){if(F.lines.length>=20)return;l={key,at:now,effect:false};F.lines.push(l);}
  if(!effect&&F.frames.some(fr=>now-fr.at<3000&&HookNative.frameOf(fr.set,key)))effect=true;
  if(effect)l.effect=true;this.textEffectsJudge(F,l);}
 textEffectsFrame(text){if(Profiles.get(this.profile,'safeMode.effectJudge',false)!==true||!HookNative.interleaved(text))return;const F=this.textEffectsState();if(F.sent)return;const now=this.now(),set=new Set(HookNative.content(text));F.frames=F.frames.filter(fr=>now-fr.at<3000);F.frames.push({set,at:now});if(F.frames.length>16)F.frames.shift();
  for(const l of F.lines)if(!l.effect&&now-l.at<3000&&HookNative.frameOf(set,l.key)){l.effect=true;this.textEffectsJudge(F,l);}}
 textEffectsJudge(F,l){const n=F.lines.length,e=F.lines.filter(x=>x.effect).length;this.trace('text effects: line '+(l.effect?'effect':'clean')+' '+e+'/'+n);if(F.sent||n<6||e/n<=.3)return;F.sent=true;this.trace('text effects: '+e+' of '+n+' lines broken by the text effect, read mode');this.emit({type:'hookTextEffects',paired:n-e,orphan:e,at:this.now()});}
 /* a text made only of the given pieces glued (each may repeat): the distinct pieces in order, or null */
 static glued(text,keys){const f=HookNative.flat(text),K=[...new Set(keys)].sort((a,b)=>b.length-a.length);if(!f||!K.length)return null;let rest=f;const out=[];for(let k=0;rest&&k<16;k++){const p=K.find(x=>rest.startsWith(x));if(!p)return null;if(!out.includes(p))out.push(p);rest=rest.slice(p.length);}return rest?null:out;}
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
 /* incr9 2026-11-21 (owner, 千恋＊万花: short lines showed the translation alone; the game drew nothing and neither did MeguLit): the bridge
    blanks the selected writable stream's glyphs, so the game's line is hidden whether or not a hidden glyph came back yet */
 glyphBlanking(){return this.enabled===true&&this.preferences?.hookHide!==false&&this.glyphBlankWritable===true;}
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
 /* profile page.holdMs (engine/game diff) over the kernel's hold */
 holdFor(engine){const o=this.profile?.page?.holdMs;return Number.isFinite(o)&&o>=0?o:HookNative.holdFor(engine);}
 static holdFor(engine){return engine==='ocr'?5000:1500;}
 releasePageHeld(){const K=this.pageState;if(!K)return;const held=K.held;K.held=[];clearTimeout(K.timer);for(const h of held){if(this.filterHookRedraws(K))this.deliverHeld(K,h);else this.deliverSource(h.text,h.origin);}}
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
 deliverSource(text,origin,engine='',nativeLine=0,authority){if(require('./danganronpa-pc-source.cjs').shouldBlock(this,authority,origin))return;
  if(require('./unity-il2cpp-source.cjs').shouldBlock(this.textPath,authority||{origin},this.target))return;
  if(require('./unity-kemco-source.cjs').shouldBlock(this.textPath,authority,this.target)||require('./artemis-session.cjs').shouldBlock(this.textPath,authority,this.target,origin,this.wanted!==false))return;
  const now=this.now(),live=!engine&&!nativeLine&&(origin||'live')==='live',S=this.skipBurst||(this.skipBurst={last:0,held:null,settle:null,cap:null,count:0});
  if(!live||this.stashFlush){if(this.stashFlush)S.last=now;this.emitSource(text,origin,engine,nativeLine,authority);return;}
  {const last=this.lastOfMerged(text);if(last!==text){this.trace('merged skip text: kept the last line of '+text.length+' chars');text=last;/* 2026-11-19 (素晴らしき日々: 「それか、…とか言ってるヤツだ。」 untranslated) the script translation was looked up for the merged text; the kept line is looked up itself */try{this.originalTextFor(text);}catch{}}}
  const gap=now-S.last;S.last=now;
  if(gap>=SKIP_BURST_GAP_MS&&!this.skipKey){
   if(S.held)this.trace('skip burst settled; skipped='+S.count+' (normal pace)');
   clearTimeout(S.cap);clearTimeout(S.settle);S.cap=S.settle=S.held=null;S.count=0;
   this.emitSource(text,origin,engine,nativeLine,authority);
   if(this.state.hookSourcePreview)this.notify({hookSourcePreview:false});
   return;
  }
  S.count++;S.held={text,origin,authority,sequence:this.state.hookSequence};
  if(!S.cap){
   this.trace('skip burst: holding lines until the game stops');
   const serial=this.serial;
   S.cap=setTimeout(()=>{S.cap=null;if(serial===this.serial)this.flushSkipBurst(S,true);},SKIP_BURST_MAX_HOLD_MS);
   S.cap.unref?.();
  }
  if(!this.skipKey)this.settleSkipBurst(S);
 }
 settleSkipBurst(S){
  clearTimeout(S.settle);
  const serial=this.serial;
  S.settle=setTimeout(()=>{S.settle=null;if(serial===this.serial)this.flushSkipBurst(S,false);},SKIP_BURST_SETTLE_MS);
  S.settle.unref?.();
 }
 flushSkipBurst(S,preview){
  if(!preview){clearTimeout(S.cap);S.cap=null;}
  const held=S.held,count=S.count;
  S.held=null;S.count=0;
  if(held&&held.sequence===this.state.hookSequence){
   this.trace('skip burst settled; skipped='+(count-1)+(preview?' (preview)':''));
   this.emitSource(held.text,held.origin,'',0,held.authority,preview);
  }
  if(!preview&&this.state.hookSourcePreview)this.notify({hookSourcePreview:false});
 }
 /* E270 (user, ATRI: one line was often typed out twice): games re-send the shown line when the voice ends or the
    window repaints, seconds later (after a long voice) and sometimes with different line breaks. The same line (ignoring
    white space) right after itself is ignored until another line comes; very short lines such as …… keep the old
    650 ms so a script that repeats them still advances. */
 sameAsLast(text){const k=s=>String(s||'').replace(/\s+/g,''),key=k(text);/* 2026-11-19 the ruby-reading form of the last line is the last line */if(!key||key!==k(this.lastSource)&&!(key.length>=6&&LineOnce.variant(key,this.lastSource)))return false;const age=this.now()-(this.lastSourceAt||0);/* E408: the same line from another stream (two hooks on one line) within 2.5 s is the same line; from the same stream a short line is a real repeat after 650 ms */return key.length>=6||age<650||!!this.sourceStream&&!!this.lastSourceStream&&this.sourceStream!==this.lastSourceStream&&age<2500;}
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
  /* 2026-11-19 16:57 (user: back from another window the current line was gone until the next one; hook log: "left dialogue screen: stream silent 111s" with three tooltips the pointer crossed on the way back). This verdict is an inference like any screen probe: nothing counts and nothing is decided while the reader's context is frozen (not in front, menu open, settling after the return), and what was collected until then is dropped */if(this.contextFrozen?.()===true){L.labels.clear();return false;}
  if(!this.lastSource||!this.lastSourceAt||now-this.lastSourceAt<12000||L.labels.size<3)return false;/* 2026-11-13 (Summer Pockets: the choice screen is silent too, its menu labels changed): a choice screen OCR still finds is not leaving */if(this.choice?.active)return false;
  this.trace('left dialogue screen: stream silent '+Math.round((now-this.lastSourceAt)/1000)+'s, labels='+JSON.stringify([...L.labels].slice(0,5)));
  this.lastSource='';this.lastSourceAt=0;this.sentencePieces?.reset();L.labels.clear();this.clearChoices('left dialogue screen');
  this.notify({hookSource:'',hookSpeaker:'',hookSourceOrigin:'leave',hookSequence:(this.state.hookSequence||0)+1,hookMessage:'游戏离开对话界面，已清空阅读器'});return true;}catch{return false;}}
 /* a menu/title label: letters, at most 24 chars or 4 words, no sentence end */
 static leaveLabel(x){return !!x&&x.length<=24&&x.split(/\s+/).length<=4&&/[\p{L}]{2,}/u.test(x)&&!/[。．.!?！？…」』"”]\s*$/.test(x);}
 /* 2026-11-19 (rig2 千恋＊万花 bound after the game was already on its title: its TextRender renderers existed before MeguLit's
    script wrapped the class, so no line reported its character boxes and the reader stayed in its own box at the left edge;
    the same since v1.4.16). A game on the TextRender plugin that MeguLit did not start itself and whose dialogue stream gives
    three lines without one character record is told once how to get them. Hiding is left as it is: the game's text stays
    hidden by the other layers, only the place is missing (stepping back would show it under the reader's text). */
 positionsCheck(){const pid=this.gamePid();if(!pid||this.trSeen!==pid||this.launchedPid===pid)return;const P=this.posCheck&&this.posCheck.pid===pid?this.posCheck:(this.posCheck={pid,lines:0,said:false});
  if(P.said||(this.krkrChars?.pid===pid&&this.krkrChars.n>0))return;if(!/krkr|kirikiri|textrender/i.test(String(this.dialogueHook||'')))return;
  if(++P.lines<3)return;P.said=true;this.trace('positions: no character records from the TextRender game after '+P.lines+' lines (started before MeguLit)');
  this.notify({hookNotice:'这款游戏要从 MeguLit 游戏库启动（或重启游戏）后，文字位置和隐藏才完整',hookNoticeAt:this.now()});}
 /* 2026-11-21 (ファタモルガーナの館: its hook text garbled by the text effects or dropped while the game drew the line hidden): a line the game drew
    hidden that no source line carried within 450 ms is delivered as a source line itself (origin 'placement'), so it is read, given furigana and
    translated like any other; the recent sources are kept for the comparison */
 placedHidden(raw,info){const text=String(raw||'').replace(/\u001f/g,'\n').replace(/\n/g,''),f=HookNative.flat(text);if(!f||f.length<2)return;const seen=()=>(this.recentSources||[]).some(s=>s.includes(f)||f.includes(s));if(seen()){if(Array.isArray(info?.rects)&&info.rects.length)this.lastDialogRects=info.rects;return;}if((this.placedWait||(this.placedWait=new Map())).has(f))return;
  const serial=this.serial,t=setTimeout(()=>{this.placedWait.delete(f);if(serial!==this.serial||seen())return;const B=this.hiddenBatch||(this.hiddenBatch={items:[],timer:null});B.items.push({text,rects:info?.rects||null});clearTimeout(B.timer);B.timer=setTimeout(()=>{const items=B.items.splice(0);if(serial!==this.serial)return;const boxed=items.filter(i=>Array.isArray(i.rects)&&i.rects.length);if(items.length>=2&&boxed.length===items.length&&items.every(i=>!HookNative.interleaved?.(i.text,Profiles.get(this.profile,'choice.contentInterleave',false)===true))&&HookNative.choiceShape(items,this.lastDialogRects)){this.trace('placement lines without a source line, taken as '+items.length+' options');try{this.onHiddenChoices?.(items);}catch{}return;}for(const i of items){if(Array.isArray(i.rects)&&i.rects.length)this.lastDialogRects=i.rects;this.trace('placement line without a source line, delivered from the placement chars='+HookNative.flat(i.text).length);/* r34: 4 of the 8 misses were script lines delivered from the placement, which never went through the pairing (no patch-text); they do now */try{this.originalTextFor(i.text);}catch{}this.deliverSource(i.text,'placement');}},200);B.timer.unref?.();},450);t.unref?.();this.placedWait.set(f,t);if(this.placedWait.size>16){const k=this.placedWait.keys().next().value;clearTimeout(this.placedWait.get(k));this.placedWait.delete(k);}}
 giveWay(ms){this.send({type:'engineGiveWay',ms:Math.max(0,Math.min(10000,Number(ms)||3000))});}
 emitSource(text,origin,engine='',nativeLine=0,authority,preview=false){if(require('./danganronpa-pc-source.cjs').shouldBlock(this,authority,origin))return;if(require('./unity-il2cpp-source.cjs').shouldBlock(this.textPath,authority||{origin},this.target))return;if(require('./unity-kemco-source.cjs').shouldBlock(this.textPath,authority,this.target)||require('./artemis-session.cjs').shouldBlock(this.textPath,authority,this.target,origin,this.wanted!==false))return;{const f=HookNative.flat(text);if(f){(this.recentSources||(this.recentSources=[])).push(f);if(this.recentSources.length>24)this.recentSources.shift();}}this.positionsCheck?.();
  try{this.textPath?.want(text);}catch{}
  const scriptStep=authority===SCRIPT_PAGE_ROW;
  const authored=scriptStep||this.filterHookRedraws()&&this.pageScriptParts(text).length===1;
  /* E501 every source path (native line, merged batch, skip burst) meets the same frame-dump filter as the aux entries */
  if(!authored){
   if(require('./language-tracks.cjs').stuttered(text)){this.trace('drop typewriter/redraw frame '+JSON.stringify(String(text).slice(0,40)));return;}
  /* last guard before the reader: every path (native line, merged batch, skip burst) draws a sentence once and no stage note */
  /* 2026-11-19 names glued while skipping (謎の男謎の男…美亜美亜) are the last name */{const nm=LineOnce.nameStack(text);if(nm){this.speaker={text:nm,at:this.now()};this.noteSpeaker(nm);this.trace('name stack kept last name '+JSON.stringify(nm));return;}}
  {const bare=LineOnce.stripStageNotes(text);if(bare!==text){if(!bare.trim()){this.trace('drop stage note '+JSON.stringify(String(text).slice(0,40)));return;}text=bare;}const once=LineOnce.collapse(text);if(once.collapsed){this.trace('emit repeat collapsed chars='+text.length+'->'+once.text.length);text=once.text;}}
  }
  /* 2026-11-20 core/page-text.cjs: the page drawn again is nothing new; the page plus a new part is the new part */
  if(origin!=='ocr'&&require('./saya-page-ocr.cjs').legacyExe(this.target?.name)){
   if(/^(?:MS\s*P?ゴシック)+$/iu.test(String(text).normalize('NFKC').replace(/\s/g,'')))return;
   if(this.originalText?.sayaPageLine){
    const exact=this.originalText.sayaPageLine(text,true);
    if(!exact)return;
    text=exact;
    if(this.windowState?.bound&&!this.originalReplaced())engine='saya-script-read';
   }
  }
  const paged=!nativeLine&&!scriptStep&&!this.flowPage&&!['saya-page-ocr','saya-script-read'].includes(engine);if(paged){const P=this.pageText||(this.pageText=new PageText());if(!authored){const r=P.take(text,this.now());if(r.drop){this.trace('page text: '+r.drop+' '+JSON.stringify(String(text).slice(0,40)));return;}if(r.page){this.trace('page text: new part after '+r.page+' shown lines');text=r.text;}}}
  {const sp=splitSpeaker(text,this.knownSpeakers);if(sp.name){this.speaker={text:sp.name,at:this.now()};this.noteSpeaker(sp.name);if(!sp.text.trim()){this.trace('speaker name split from the text flow');return;}text=sp.text;}}
  if(!engine&&!nativeLine&&this.flowPage)engine='nvl';
  const takesOverSayaPage=this.state.hookSourceEngine==='saya-page-ocr'&&origin!=='ocr'&&origin!=='history';
  if((origin==='history'&&this.state.receivedText)||(!nativeLine&&!scriptStep&&!takesOverSayaPage&&this.sameAsLast(text)&&this.state.hookActive&&this.state.receivedText&&!this.state.hookRecovering)){this.trace('source duplicate ignored chars='+text.length);return;}
  // E247 (user: a game settings screen looped its prompts into the text bar): when lines already shown in the last
  // 8 s keep coming back (two or more repeats), the stream is cycling menu/system text; drop it until an unseen line.
  if(!nativeLine&&!scriptStep&&(origin||'live')==='live'){const now=this.now(),L=this.loopGuard||(this.loopGuard={seen:[],repeats:[],looping:false});L.seen=L.seen.filter(x=>now-x.at<8000);L.repeats=L.repeats.filter(t=>now-t<8000);
   if(L.seen.some(x=>x.text===text)){L.repeats.push(now);if(L.looping||L.repeats.length>=2){if(!L.looping)this.trace('menu loop detected; repeating lines ignored');L.looping=true;return;}}
   else{if(L.looping)this.trace('menu loop ended');L.looping=false;L.repeats=[];}
   L.seen.push({text,at:now});if(L.seen.length>12)L.seen.shift();}
  /* 2026-11-20 core/page-text.cjs: the rest of a sentence that the last line left open with a comma is shown with it, as one sentence */
  const part=text;let continues=0;/* not when the engine named a new speaker after the last line */if(paged&&!this.filterHookRedraws()&&!(this.speaker&&this.speaker.at>(this.lastSourceAt||0))){const c=this.pageText.continuation(text,this.now());if(c){this.trace('sentence continues the shown line ('+c.continues+' chars before)');text=c.text;continues=c.continues;}}
  this.beforeDialogue?.({hookSequence:(this.state.hookSequence||0)+1,hookSource:text,hookSourceOrigin:origin,hookSourceContinues:continues});
  this.learnBareName(text);
  const speaker=this.speaker&&this.now()-this.speaker.at<2500?this.speaker.text:'';this.speaker=null;/* E416 the choice detector learns every dialogue line and speaker, whatever the engine */(this.choice||(this.choice=this.newChoiceCapture())).noteDialogue(text,speaker);/* E407 a new dialogue line ends the choice screen */if(text.replace(/\s+/g,'')!==String(this.lastSource||'').replace(/\s+/g,''))this.clearChoices('new dialogue line',400,text);this.lastSource=text;this.lastSourceAt=this.now();/* #468 the lines the game's own text gave (never an OCR line): an OCR reading of the same page is refused (ocrLineRefused) */if(origin!=='ocr'){const R=this.hookRecent||(this.hookRecent=[]);R.push({key:HookNative.flat(text),at:this.now()});if(R.length>24)R.shift();}this.palFlush?.();this.lastSourceStream=this.sourceStream||'';this.trace('source chars='+text.length+' sequence='+((this.state.hookSequence||0)+1));this.textEffectsLine(text,this.fxNext===true||origin==='placement');if(paged){/* the reader keeps the page's earlier lines above this one while the page stays (web hook-reader.js) */if(!continues&&this.pageText.pages){const same=this.pageText.samePage(this.now());this.pageSaidSame=same;this.emit({type:'hookPage',engine:'text',line:(this.state.hookSequence||0)+1,same,at:this.now()});}this.pageText.shown(part,text,this.now());}this.notify({...(this.lineUnreadable?(this.lineUnreadable=false,{hookLineUnreadable:false}):{}),hookActive:true,...(origin==='ocr'||engine==='saya-page-ocr'?{}:{processAttached:true,streamSelected:true,hookRecovering:false}),hookSource:text,...(preview||this.state.hookSourcePreview?{hookSourcePreview:preview}:{}),hookSpeaker:speaker,hookSourceEngine:engine,hookFlowGrid:engine==='nvl'?(this.flowGridName||''):'',...(()=>{const f=engine==='nvl'?this.flowLayout(text):null;/* E410 */return {hookFlowPageStart:f?.pageStart===true,hookFlowRow:f?.row||'',hookSourceIndex:Number.isSafeInteger(f?.index)?f.index:-1};})(),hookSourceContinues:continues,hookSourceLine:nativeLine,hookSourceOrigin:origin||'live',hookSourceRuby:this.sourceRuby?.get(text)||[],hookSequence:(this.state.hookSequence||0)+1,receivedText:!!text.trim(),hookMessage:engine==='saya-page-ocr'?'画面文字已匹配原版剧本':origin==='ocr'?'已读取画面文字':text.trim()?'已收到真实游戏台词':'收到空文本信号'});
  this.il2cppShown=require('./unity-il2cpp-source.cjs').tagged(authority)?{authority,sequence:this.state.hookSequence}:null;
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
 /* E610 a selected stream of a Unity hook (Mono JIT or IL2CPP): its text is drawn from Unity's own atlases, never with GDI glyphs, so no glyph positions or glyph blanking exist for it */
 gdilessSelected(sel){const t=sel||(this.state?.hookThreads||[]).find(x=>x.selected)||(this.state?.hookThreads||[]).find(x=>this.selectedId&&x.id===this.selectedId);return /:JIT:UNITY$|IL2CPP/i.test(String(t?.code||''));}
 select(id,manual){this.verified=false;if(manual)this.manualThread=id;if(this.process&&typeof id==='string'&&this.state.hookThreads.some(t=>t.id===id)){this.trace('select id='+id+' replace='+this.enabled);this.selectedId=id;this.send({type:'select',id,replace:this.enabled,...(manual?{manual:true}:{})});}else{this.trace('select rejected id='+String(id));this.notify({hookMessage:'文本流尚未就绪，请重新扫描后选择'});}}
 rescan(){this.send({type:'rescan'});}
 reprobeText(){
  if(this.disposed||!this.target||this.windowState?.bound!==true)return this.finishStreamProbe('unbound');
  if(!this.wanted)return this.finishStreamProbe('disabled');
  if(this.streamProbe&&this.now()<this.streamProbe.until)return 'waiting';
  const id=this.streamProbeId=(this.streamProbeId||0)+1;
  this.streamProbe={id,until:this.now()+30000};
  this.preferredThread=null;
  this.manualThread=null;
  this.gaveUp=null;
  this.retryAt=0;
  this.attempt=0;
  this.notify({hookReselectState:'waiting',receivedText:false});
  this.trace('fresh text stream probe '+id+' gamePid='+this.target.pid);
  if(this.process)this.sendStreamProbe();
  else this.tick();
  return 'waiting';
 }
 sendStreamProbe(){if(this.streamProbe)this.send({type:'probeStreams',id:this.streamProbe.id});}
 finishStreamProbe(state){
  this.streamProbe=null;
  if(state||this.state.hookReselectState)this.notify({hookReselectState:state});
  return state;
 }
 // E246: style sampling pauses the embed replacement so the game draws one original line, then resumes it.
 /* E578 hide probe (live beta38, ダストマニア: a stream that cannot write back left the reader in read mode, so the host never switched it on and the
    generic GDI / glyph hide never ran): while hiding is wanted the selected read-only stream is switched on in the game anyway; the hook
    reports a hidden draw and only then the stream becomes hide-only (hookThreads embeddable+hideOnly) and the normal hide path takes over. */
 probeHide(on){on=on===true;if(!this.process||this.probing===on)return;this.probing=on;this.trace('hide probe '+(on?'on':'off'));this.send({type:'probe',on});}
 suspendReplacement(on){if(!this.process||!this.enabled)return;if(on&&!this.suspended){this.suspended=true;this.trace('replacement paused for style sampling');this.send({type:'disable',reason:'style-sampling'});}else if(!on&&this.suspended){this.suspended=false;this.trace('replacement resumed after style sampling');this.send({type:'enable'});}}
 /* Text architecture ③ (core/text-paths-launch.cjs): a web / Unity engine path follows the same replacement switch and gets each source line to find the dialogue */
 attachTextPath(p){this.textPath=p;try{p.hide(this.enabled===true);}catch{}this.drawSync();}
 /* engine-draw: the profile's draw.* switches go to the engine paths that read them (web / RPG Maker now, KiriKiri with its next line) */
 drawSync(){if(this.disposed||this.stopPending||this.stopError)return;this.profile=require('./owner-tests.cjs').apply(this.profile,this.ownerTestGrant,{exe:this.profileInput?.exe,engine:this.profile?.engine});const ED=require('./engine-draw.cjs'),drawProfile=this.engineDrawProfile(),cfg=ED.settings(drawProfile);try{this.textPath?.drawConfig?.({...cfg,kemcoSprites:Profiles.get(this.profile,'draw.kemcoSprites',false)===true});}catch{}
  /* a game whose diff turns draw.* on gets its control file at once (YU-RIS arms its glyph loop hook from it before any line) */
  try{const pid=this.gamePid();if(pid&&(cfg.roles||cfg.embed||cfg.clear||cfg.spikechunsoftInput===true||cfg.advhdInput===true||cfg.cmvsInput===true||cfg.fvpInput===true||cfg.minoriInput===true||(cfg.choiceFrames||[]).length))this.ensureEngineDraw(pid);else this.engineDraw?.setProfile(drawProfile);}catch{}}
 send(v){if(v&&(v.type==='enable'||v.type==='disable'))try{this.textPath?.hide(v.type==='enable');}catch{}if(this.process?.stdin.writable)this.process.stdin.write(JSON.stringify(v)+'\n');}
 /* engine-draw: one replacement table per game process, handed to the engine's transport (KiriKiri: control file) */
 /* the control file of this game process (every engine DLL that reads draw.* reads it: KiriKiri, Ren'Py, YU-RIS) */
 engineDrawProfile(){return this.profile?.draw?.spikechunsoftInput===true&&!require('./danganronpa-pc-source.cjs').allowed(this)?Profiles.apply(this.profile,{draw:{spikechunsoftInput:false}},'private-input-off'):this.profile;}
 ensureEngineDraw(pid){const ED=require('./engine-draw.cjs'),profile=this.engineDrawProfile();if(!this.engineDraw||this.engineDraw.pid!==pid){this.engineDraw?.stop();this.engineDraw=new ED.EngineDraw({profile,transport:new ED.KrkrTransport(pid),onAsk:a=>this.emit({type:'hookDrawEmbed',...a})});this.engineDraw.pid=pid;}else this.engineDraw.setProfile(profile);return this.engineDraw;}
 engineDrawLine(rec){if(rec.engine!=='krkr'&&rec.engine!=='renpy')return;/* both read the same control file (%TEMP%\MeguLit\draw\<pid>.txt) */const pid=this.gamePid();if(!pid)return;this.ensureEngineDraw(pid).line(rec);}
 /* engine-draw: every parsed ToMe_CHARS record, timestamped, in logs/engine-draw.log (its own file: hook-events.log rotates at 1 MB and
    keeps the diagnostics); the probe and the offline diff maker read roles / boxes / emb from it. A record repeated within the last 64 is left out */
 drawLog(raw){try{const seen=this.drawSeen||(this.drawSeen=new Set());if(seen.has(raw))return;seen.add(raw);if(seen.size>64)seen.delete(seen.values().next().value);
  const file=path.join(this.layout.logs||path.join(this.folder,'..','logs'),'engine-draw.log');require('./log-sink.cjs').append(file,new Date().toISOString()+' '+String(raw).replace(/[\r\n]/g,' ')+'\n',{rotate:4194304});}catch{}}
 drawEmbedReply(key,o){this.engineDraw?.put(key,o);try{this.textPath?.drawEmbed?.(key,o);}catch{}}
 static gameProcessGone(pid){
  if(!Number.isSafeInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);}catch(error){return error.code==='ESRCH';}
  return false;
 }
 clearExitedBridgeStop(){
  const stopped=this.stoppingBridge;
  if(!stopped||!this.ownedStops?.has(stopped.child))return false;
  const {child,pid,started}=stopped;
  // An abnormal bridge exit can leave hooks in a live game. Once both processes are gone,
  // that specific bridge can no longer own hooks and must not block another game session.
  if(child.exitCode==null&&child.signalCode==null)return false;
  const reused=this.target?.pid===pid&&/^\d{10,20}$/.test(this.target.started)&&this.target.started!==started;
  if(!reused&&!HookNative.gameProcessGone(pid))return false;
  this.ownedStops.delete(child);
  this.stoppingBridge=null;
  this.trace('hook stop recovered: previous game and bridge exited gamePid='+pid);
  return true;
 }
 stop(dispose=true){
  if(this.state?.hookChoices?.scriptGroup)this.clearChoices('hook stopped');
  this.sayaOcr?.stop();this.sayaOcr=null;
  require('./danganronpa-pc-source.cjs').clear(this);
  let sourceStop;try{sourceStop=this.textPath?.stopIl2CppSource?.();}catch(error){sourceStop=Promise.reject(error);}sourceStop?.catch(()=>{});
  if(this.ownerTestGrant)require('./owner-tests.cjs').revoke(this.ownerTestGrant);this.ownerTestCleanup?.();this.ownerTestCleanup=null;
  this.clearNativeRuby();
  if(dispose){this.disposed=true;this.lastSource='';this.identity='';this.wanted=false;clearInterval(this.timer);}if(this.stopPending)return this.stopPending;
  let resolve,reject;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});this.stopPending=result;result.catch(()=>{});
  const tasks=[],draw=this.engineDraw,old=this.process,attempt=fn=>{try{return Promise.resolve(fn());}catch(error){return Promise.reject(error);}};
  if(sourceStop)tasks.push(sourceStop);
  // Launch can bind the Lua token before Reader's asynchronous profile lookup reaches this hook
  if(this.textPath instanceof require('./artemis-session.cjs').ArtemisSession)tasks.push(attempt(()=>this.textPath.stop()));
  tasks.push(attempt(()=>draw?.stop()).then(()=>{if(this.engineDraw===draw)this.engineDraw=null;}));
  tasks.push(attempt(()=>{this.embedModeSent=undefined;this.probing=false;if(this.lineUnreadable){this.lineUnreadable=false;this.notify({hookLineUnreadable:false});}if(this.state?.scriptSource)this.notify({scriptSource:false});if(this.state?.embedTranslating)this.notify({embedTranslating:false});clearTimeout(this.skipBurst?.settle);clearTimeout(this.skipBurst?.cap);this.skipBurst=null;this.skipKey=false;if(this.state?.hookSourcePreview)this.notify({hookSourcePreview:false});this.pageReset();this.islandSources.clear();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;clearTimeout(this.islandTimer);clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;this.pendingSource=null;this.verified=false;this.retryAt=0;this.attempt=0;this.markerKey='';this.waitTarget=null;}));
  // Even failed control revocation must request and await the owned helper's shutdown.
  // HookBridge checks game exit and releases the hide layers before its final stdout drain (up to 2 s).
  if(old)this.stoppingBridge={child:old,pid:this.pid,started:this.started};
  tasks.push(attempt(()=>require('./owned-exit.cjs').trackStop(this,old,()=>{try{this.send({type:'quit'});}finally{old.stdin.end();}},{graceMs:8000})).then(()=>{
   this.stoppingBridge=null;
  },error=>{
   if(this.disposed||!this.clearExitedBridgeStop()||this.ownedStops.size)throw error;
  }));
  this.process=null;if(old)++this.serial;this.enabled=false;
  tasks.push(attempt(()=>this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'disabled',hookSource:null,hookThreads:[],hookDrawCount:0,hookDrawAt:0})));
  Promise.allSettled(tasks).then(results=>{this.stopPending=null;const failed=results.find(r=>r.status==='rejected');
   if(failed){
    const error=Error('READER_STOP_INCOMPLETE',{cause:failed.reason});error.code='READER_STOP_INCOMPLETE';
    if(!this.stopError)this.trace?.('hook stop incomplete gamePid='+this.pid+' bridgeExit='+old?.exitCode+' signal='+old?.signalCode+' cause='+String(failed.reason?.message||failed.reason));
    this.stopError=error;reject(error);
   }else{this.stopError=null;resolve();}
  });return result;
 }
}
HookNative.GIVE_WAY_MS=2000;
module.exports={FLOW_PAGE_EXES,HookNative,PAGE_ENGINES,cleanSource,scriptSource,identifierNoise,splitSpeaker,speakerName};
