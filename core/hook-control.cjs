// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const naninovelStream=t=>/Naninovel.*RevealableText|:Naninovel\.UI:RevealableText:SetTextValue:/i.test((t.name||'')+' '+(t.code||''));
const streamRank=t=>naninovelStream(t)?300:/^Embed/.test(t.name||'')||t.embeddable===true?200:/TMP_Text|TextMeshPro|TextElement|TextField/.test(t.name||'')?10:100;
const HIDDEN_REDRAWN='原文已隐藏：游戏的字由 MeguLit 在原位重画';
const READ_ON_PURPOSE=why=>why?'自检未过线，已自动改为只显示译文：'+why:'这部游戏的文字特效和隐藏原文冲突，已自动改为只显示译文';
const EMBED_FEEDBACK='这个游戏暂时不能隐藏原文：请在「关于」里提交反馈，附上游戏名和截图，一般一天内就能适配';
const MANUAL_SAMPLE_MS=25000,MANUAL_ADVANCE_MS=90000;
class HookControl{
 /* the original is kept off screen another way than write-back (or shown on purpose): the status line for it, else '' */
 hiddenWithoutEmbed(){const h=this.host,k=h.hooks||{};if(h.textEffectsHold)return READ_ON_PURPOSE(h.textEffectsHold.why);
  if(k.sact2Hidden?.(k.lastSource))return '当前句的游戏原文已由引擎绘制层隐藏';
  if(k.enabled===true&&k.route!=='read'&&(k.ownTextFn?.()===true||k.compositedFn?.()===true))return HIDDEN_REDRAWN;return '';}
 constructor(host,now=Date.now){this.host=host;this.now=now;this.seq=0;this.baseline=false;this.plan='read';this.running=false;this.lastIdentity='';}
 status(value){if('hookEmbedUnsupported' in value)this.unsupported=value.hookEmbedUnsupported===true;if(this.diagnosticEpisode&&['verified','visible'].includes(value.hookCheckState)&&this.diagnosticEpisode===this.host.sentenceDiagnosticEpisode)this.host.onEvent?.({type:'sentenceHideObservation',episode:this.diagnosticEpisode,original:value.hookCheckState==='verified'?'hidden':'visible'});if(value.hookCheckState)this.host.hooks.trace?.('check '+value.hookCheckState+' '+(value.hookCheckMessage||''));this.host.notify({type:'hookCheck',hookProfile:this.plan,hookAutoOcr:!!this.autoOcr,...value});}
 // No stream of this game can be embedded: keep reading and let OCR cover the original text instead. Only a mask
 // mode ToMe chose itself is changed back, never one the user picked.
 // OCR may still measure positions, but covering the original text is only ever the user's choice (maskModeSource 'user').
 ocr(){this.autoOcr=false;}
 start(profile,force=false){
  if(!['read','euphoria474','embed','off'].includes(profile))return;
  const h=this.host;
  if(profile==='euphoria474'&&h.state.hookExact474!==true){this.status({hookCheckState:'unsupported',hookCheckMessage:'此游戏版本不匹配，YU-RIS 0.474 隐藏没有启动'});return;}
  if(profile==='embed'&&!h.hooks.state.hookThreads.some(t=>t.embeddable)){this.status({hookCheckState:'unsupported',hookCheckMessage:'还没有支持内嵌的文本流，先启动通用读取并推进一句'});return;}
  if(this.styleCalibration&&this.styleTimer)this.finishStyleSync(false,true);
  this.running=profile!=='off';this.plan=profile;this.baseline=false;this.baselineMisses=0;this.missSequence=null;this.seq=0;const styleIdentity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');this.styleCalibration=!!(force&&!h.hooks.remembered/* E520 */&&h.preferences.autoGameStyle!==false&&h.styleSync&&!h.styleSync.latest&&this.styleCalibrationIdentity!==styleIdentity);if(this.styleCalibration)force=false;h.hooks.onGiveWayCapped=()=>this.giveWayCapped();h.hooks.preflight=this.running&&profile!=='read'&&!force&&!h.hooks.remembered;
  h.send({type:'hookVerifyCancel'});
  this.autoOcr=false;const userOcr=false;/* 2026-11-12 (user) OCR never covers the original */
  h.save({...h.preferences,bindEnabled:true,maskMode:userOcr?'local':'hook',maskModeSource:userOcr?'user':'',hookProfile:profile});
  if(this.styleCalibration)this.beginStyleSync(false);
  if(profile!=='off'&&profile!=='read'&&!h.state.bound)h.send({type:'toggleMode'});
  if(profile!=='off'&&profile!=='read'&&h.state.coverEnabled===false)h.send({type:'toggleCover'});
  this.status({hookProfile:profile,...(profile==='read'?{}:{hookEmbedUnsupported:false}),hookBaselineVerified:false,hookVisualVerified:false,hookCheckState:profile==='off'?'stopped':profile==='read'?'reading':force?'unverified':'baseline',hookCheckMessage:profile==='off'?'Hook 已停止':profile==='read'?'读取已启动，推进一句后检查捕捉结果':force?'隐藏已开启，约 3 秒后从下一句开始生效':'先检查游戏原文，请推进一句；识别到原文后自动启动隐藏'});
 }
 beginStyleSync(manual=false,purpose='all',owner=''){
  const h=this.host;if(!h.styleSync||!h.state.bound){this.styleCalibration=false;h.styleSync?.status('waiting');return;}
  /* 2026-11-21 (owner, test pack v5 ファタモルガーナの館): a game whose engine reports every character's box (KiriKiri page DLL,
     ファタ / 千恋＊万花) is placed from those boxes: calibration never gives way to measure the original, it follows the engine */
  {const cur=h.placement?.current,engineBoxes=!!(cur&&(!cur.fallback||cur.engine==='krkr')&&Array.isArray(cur.rects)&&cur.rects.length);
   const readerPlaced=cur&&(cur.engine==='glyph'||cur.id==='systemnnn-row'||cur.approx||(cur.fallback&&cur.engine!=='krkr'));
   // A blanked ADV dialogue is typeset by the reader. Its engine cells supply the
   // origin, but cannot measure the font, spacing or ink requested in the menu.
   const profile=h.hooks?.profile;
   const blankDialogue=profile?.placement?.drawWhileBlanking===true && profile.page?.engineRows===false
    && !h.placement?.paged && !h.hooks.flowPage && !h.hooks.pageNvl?.();
   if((engineBoxes||h.hooks?.drawsHidden===true)&&!(manual&&(readerPlaced||blankDialogue))){
    if(this.styleCalibration && h.styleSync.calibrating)this.finishStyleSync(false,true);
    this.styleCalibration=false;
    this.styleCalibrationIdentity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');
    this.styleRetryLine=null;
    if(h.hooks.preflight){h.hooks.preflight=false;h.hooks.configure?.(h.preferences,h.state);}
    h.hooks.trace?.('calibration: engine boxes, no give way (following the engine coordinates)');
    h.styleSync.status('following');return;}}
  if (manual) h.placement?.endScriptRow?.();
  h.hooks.onGiveWayCapped=()=>this.giveWayCapped();
  this.styleCalibrationIdentity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');clearTimeout(this.styleTimer);this.styleManual=manual;this.styleRetryLine=null;this.styleAwaitLive=false;this.styleCalibration=true;this.styleIdentity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');this.styleRestore=['embed','euphoria474'].includes(this.plan)&&h.preferences.hookHide!==false;
  h.styleSync.calibrating=true;h.styleSync.waitNext=this.styleRestore||h.hooks.drawsHidden===true;h.hooks.calibrating=true; // E246.1: embedding cleared the current line, so measure the next original line
   // A button press can wait for the player to advance. Keep its bounded deadline independent of the startup baseline.
   h.hooks.manualStyleWindow=manual?(h.styleSync.waitNext?MANUAL_ADVANCE_MS:MANUAL_SAMPLE_MS):0;
   h.hooks.preflight=true;h.hooks.configure?.(h.preferences,h.state);h.onEvent?.({gameStylePreview:false});h.styleSync.automatic=!manual;h.styleSync.owner=owner;if(!h.styleSync.source){const source=h.state.hookSource||h.hooks.lastSource;if(source?.trim()){h.styleSync.source=source;h.styleSync.sourceRead=h.state.hookSourceRead===true;}}h.styleSync.status('revealing');
  h.styleSync.begin?.(purpose);h.styleSync.request(true);
  // A visible current sentence completes calibration; a bounded deadline restores normal reading on failure.
  /* 2026-11-19 (user, 素晴らしき日々 a new work, 自动校准 on: no position came): the automatic calibration began on the first line,
     that line had already been replaced, so it waited for the next original line; its 12 s ran out from the begin, the user
     advanced 19 s later and one miss gave up for the whole launch. Waiting for the next line is not counted: the 12 s run
     from when that line arrives. A miss tries again on the next line; after 3 misses in a row it stops and says so. */
  const identity=this.styleIdentity,deadline=manual?h.hooks.manualStyleWindow:12000,began=this.now();let lineAt=!manual&&h.styleSync.waitNext?0:began;
  const arm=ms=>{clearTimeout(this.styleTimer);this.styleTimer=setTimeout(tick,Math.max(0,ms));this.styleTimer.unref?.();};
  const tick=()=>{if(!this.styleCalibration)return;
   if(!manual&&!lineAt){if(h.styleSync.waitNext&&this.now()-began<300000){arm(1000);return;}lineAt=this.now();}
   if(!manual&&this.now()-lineAt<deadline){arm(deadline-(this.now()-lineAt));return;}
   if(h.styleSync.publish?.())return;
   if(manual){this.styleFailures=(this.styleFailures||0)+1;if(this.styleFailures>=2)this.styleGiveUp=identity;this.finishStyleSync(false);this.styleRetryAt=this.now()+60000;return;}
   if(this.styleAutoFailKey!==identity){this.styleAutoFailKey=identity;this.styleAutoFailures=0;}this.styleAutoFailures++;
   /* 2026-11-19 (user, 素晴らしき日々: 「原文断断续续露出来」): a retry is at least 30 s after the miss, 3 at most; a game whose lines are
      not on engine places (laid out in the reader's box) is tried once, then keeps the default box and says so */
   if(this.styleAutoFailures>=3||!h.placement?.current){this.styleGiveUp=identity;this.finishStyleSync(false);h.styleSync.status('autoGaveUp');return;}
   this.finishStyleSync(false);this.styleRetryLine=identity;this.styleRetryAt=this.now()+30000;};
  arm(lineAt?deadline:1000); /* automatic calibration pauses embedding: keep that pause short once the line is there (user: ISLAND showed the original for 90 s after every launch) */
 }
 /* HookNative capped a give way (GIVE_WAY_MS): a calibration ends with what it measured, or as timed out; the baseline goes on hidden */
 giveWayCapped(){const h=this.host;if(this.styleCalibration){if(h.styleSync?.publish?.())return;this.finishStyleSync(false);h.styleSync?.status('timeout');return;}
  if(this.running&&!this.baseline){this.stage='switching';this.status({hookCheckState:'switching',hookCheckMessage:'原文检查超过 2 秒，已恢复隐藏'});}}
 finishStyleSync(success,cancel=false){
  // Returning to hidden mode retires the OCR request for the revealed frame, even if the dialogue hasn't advanced.
  if(this.styleCalibration && this.stage==='baseline'){this.seq++;this.stage='waiting';this.host.send({type:'hookVerifyCancel'});}
  if(!this.styleCalibration)return;clearTimeout(this.styleTimer);this.styleTimer=null;this.styleCalibration=false;const h=this.host;h.hooks.manualStyleWindow=0;if(this.styleRevealed){this.styleRevealed=false;h.onEvent?.({gameStyleReveal:false});}h.hooks.calibrating=false;h.hooks.preflight=false;h.styleSync.calibrating=false;clearTimeout(h.styleSync.timer);h.styleSync.cancel?.();if(cancel){/* the calibration showed the original (hide paused): a cancelled one hides again at once, not at the next settings save */h.hooks.configure?.(h.preferences,h.state);}h.onEvent?.({gameStylePreview:false});
  const same=this.styleIdentity===String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');this.styleRetryAt=this.now()+15000;
  if(same&&!cancel){h.hooks.preflight=false;h.hooks.configure?.(h.preferences,h.state);this.styleAwaitLive=false;h.styleSync.status(success?'applied':'retrying');}
  if(!same||cancel||!this.styleRestore){this.styleAwaitLive=false;h.onEvent?.({gameStylePreview:false});}

 }
 check(){const h=this.host;if(!this.running){this.start(h.preferences.hookProfile==='off'?'read':h.preferences.hookProfile);return;}if(h.hooks.lastSource)this.source(h.hooks.lastSource);else this.status({hookCheckMessage:'还没有台词，请在游戏里推进一句'});}
 source(text){
  if(!this.running||!text.trim())return;
  this.checkedSource=text;
  /* 2026-11-19 (user, 素晴らしき日々: double text while calibrating): from the first line the game draws in the original during a
     calibration until the calibration ends, the reader's own Japanese and translation step aside (gameStyleReveal), so the
     original is never covered by a second text; while the calibration only waits for that line the reader stays */
  if(this.styleCalibration&&this.host.hooks?.preflight&&!this.styleRevealed){
   const hooks=this.host.hooks;
   if(this.styleManual&&hooks.manualStyleWindow===MANUAL_ADVANCE_MS){hooks.manualStyleWindow=MANUAL_SAMPLE_MS;hooks.capGiveWay?.();}
   this.styleRevealed=true;this.host.onEvent?.({gameStyleReveal:true});
  }
  /* E351: a flow page (WoH) is laid out on the game's own page grid; the automatic box calibration measured the current
     sentence mid-page (left 56 / top 53 / width 44) and paused hiding while it measured, so it never runs there. */
  const h=this.host;/* 2026-11-15 layer 4 page model (overlay-placement page()): the layer itself says which glyphs it left out; the per-line screen check (capture + OCR at +0.3 / +1 / +1.7 s) held the bridge and the page's place messages stopped for up to 2 s in the middle of a sentence */if(h.placement?.paged){this.seq++;this.sourceAt=this.now();this.stage='read';this.status({hookCapturedAt:this.sourceAt,hookCaptureCharacters:text.length,hookVisualVerified:true,hookCheckState:'captured',hookCheckMessage:'台词捕捉成功，由 MeguLit 原位绘制'});return;}/* capture compositor: MeguLit draws the text itself, no screen OCR (no verify, no style measuring, no mask) */if(h.compositor?.wanted?.(h.preferences)){this.seq++;this.sourceAt=this.now();this.stage='read';this.status({hookCapturedAt:this.sourceAt,hookCaptureCharacters:text.length,hookVisualVerified:false,hookCheckState:'captured',hookCheckMessage:'台词捕捉成功，由 MeguLit 接管绘制'});return;}if(!this.styleCalibration&&!(h.hooks?.flowPage&&h.hooks?.flowGridName)/* E414: only a page with a measured grid skips box calibration */&&!h.hooks?.remembered/* E520: a game that embedded before is never paused on its first lines to measure the original */&&(this.styleCalibrationIdentity!==String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'')||this.styleRetryLine===String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||''))&&this.plan!=='off'&&h.preferences.autoGameStyle!==false&&h.styleSync&&!h.styleSync.latest&&this.now()>=(this.styleRetryAt||0)&&this.styleGiveUp!==String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||''))this.beginStyleSync(false);this.seq++;this.sourceAt=this.now();
  const stage=h.hooks.preflight?'baseline':h.hooks.enabled&&this.plan!=='read'?'hidden':'read';
  if(stage==='baseline'&&this.styleCalibration)h.styleSync?.status('measuring');
  this.stage=stage;this.status({hookCapturedAt:this.sourceAt,hookCaptureCharacters:text.length,hookVisualVerified:false,hookCheckState:stage==='baseline'?'baseline':stage==='hidden'?'checking':'captured',hookCheckMessage:stage==='baseline'?'已抓到台词，正在检查游戏中的原文':stage==='hidden'?'台词已捕捉，正在检查游戏原文是否消失':'台词捕捉成功，正在检查游戏画面'});
  this.diagnosticEpisode=h.sentenceDiagnosticEpisode;
  const scriptArea = h.preferences.scanAuto !== false && h.hooks?.sadisticPage?.scanArea(text);
  const area = scriptArea || require('./scan-area.cjs').area(h.preferences,h.hooks?.flowPage||h.flowPage||undefined,h.state?.processName);
  h.send({type:'hookVerify',source:text,sequence:this.seq,stage,...area});
 }
 visual(m){
  if(!this.running||m.sequence!==this.seq||m.stage!==this.stage)return;
  const h=this.host;h.hooks.trace?.('visual '+JSON.stringify(m));
  /* E477 (player: a new game in a small window kept its original under MeguLit's text after many tries). A baseline screen check that
     fails outright (capture or OCR error, a window too small to read) returned here without counting, so preflight (original shown,
     writeback off) never ended. It now counts as a miss for its line, like a check that found nothing. */
  if(!m.valid){if(m.stage==='baseline'&&!this.styleCalibration){this.baselineMiss(m.sequence);if(this.stage==='switching')return;}
   if(h.hooks.sact2Hidden?.(this.checkedSource)){this.status({hookCheckState:'verified',hookVisualVerified:true,hookEmbedUnsupported:false,hookCheckMessage:'当前句的游戏原文已由引擎绘制层隐藏'});return;}
   this.status({hookCheckState:'unverified',hookVisualVerified:false,hookCheckMessage:'画面未确认：'+String(m.error||'画面读取失败')});return;}
  if(m.sourceCharacters<4){this.status({hookCheckState:'waiting',hookCheckMessage:'台词太短，等待下一句较长台词完成画面检查'});return;}
  if(m.stage==='baseline'){
   if(this.styleCalibration&&!m.matched)return; // Mask OCR failure must not cancel the independent style probe
   if(m.matched&&this.styleCalibration){this.baseline=true;this.status({hookBaselineVerified:true,hookCheckState:'baseline',hookCheckMessage:'原文已显示，正在测量并同步样式'});return;}
   if(m.matched){this.baseline=true;h.hooks.preflight=false;this.stage='switching';h.hooks.configure(h.preferences,h.state);this.status({hookBaselineVerified:true,hookCheckState:'switching',hookCheckMessage:'原文位置已确认，正在启动隐藏；等约 3 秒后推进下一句'});}
   // A screen check that never recognises the original (stylised fonts, busy art: manosaba) must not keep an
   // embeddable stream read-only forever: after two lines without a match, hide through the selected stream anyway.
   else if(m.sample===2&&!this.baselineMiss(m.sequence))this.status({hookCheckState:'unverified',hookCheckMessage:'没在扫描区找到原文，尚未自动启动隐藏；检查下方扫描范围或推进下一句'});
   return;
  }
  if(m.stage==='read'){this.status({hookCheckState:m.matched?'captured':'unverified',hookVisualVerified:false,hookCheckMessage:m.matched?'捕捉成功，游戏原文可见（当前仅读取）':'捕捉成功，画面未匹配到本句原文'});return;}
  /* The replacement was answered but the game still drew the original (WHITE ALBUM2, user 2026-11-09): cover this line
     with the OCR mask so the original does not show through; the next line is tried through the hook again. */
  /* E285 (user: CLANNAD got blocks over the credits and scenery): with the translation written back into the game, a line
     still in Japanese is the intended fallback while its translation is on the way, and OCR reads the drawn Chinese kanji as
     the original; no OCR cover then. */
  if(m.matched&&h.preferences?.embedTranslation===true&&h.preferences?.translationBlur!==true&&!(h.hooks?.state?.hookThreads||[]).some(t=>t.selected&&t.hideOnly===true)){this.status({hookCheckState:'replaced',hookVisualVerified:false,hookCheckMessage:'译文由游戏自己显示'});return;}
  /* 2026-11-15 P0 (user: 「不允许任何打马赛克和模糊」): the OCR cover (maskAssist) is never drawn again, whatever the check finds */
  if(m.matched){this.status({hookCheckState:'visible',hookVisualVerified:false,hookCheckMessage:'游戏原文仍然可见'});return;}
  if(m.sample<2)return;
  const drawFresh=(h.hooks.state.hookDrawAt||0)>=this.sourceAt-1800;
  if(this.baseline&&(drawFresh||h.hooks.state.replacementState==='callback-acknowledged')&&m.japaneseCharacters===0){this.status({hookCheckState:'verified',hookVisualVerified:true,hookCheckedAt:m.checkedAt,hookCheckMessage:'隐藏检查通过：绘制已拦截，连续两次未在游戏扫描区识别到日文'});}
  else if(!this.baseline&&drawFresh&&this.plan==='euphoria474'&&h.state.hookExact474===true&&m.japaneseCharacters===0)this.status({hookCheckState:'verified',hookVisualVerified:true,hookCheckedAt:m.checkedAt,hookCheckMessage:'隐藏检查通过：绘制已拦截，连续两次未在游戏扫描区识别到日文'});
  else this.status({hookCheckState:'unverified',hookVisualVerified:false,hookCheckMessage:m.japaneseCharacters>0?'扫描区还有日文，可能是原文残留或其他标签，隐藏效果待确认':'扫描区未识别到原文，但缺少'+(!this.baseline?'原文基线':'本句绘制记录')+'，暂不判定隐藏成功'});
 }
 // Turn hiding on/off to match preferences.hookHide. explicit = the user just flipped the switch.
 apply(explicit=false){
  const h=this.host,p=h.preferences;if(this.plan==='off'&&!explicit&&!p.hookAutoStart)return;
  if(h.hooks.state.hookFramework==='siglus'){
   if(this.plan!=='read'){this.plan='read';this.running=true;this.status({hookCheckState:'reading',hookCheckMessage:'已识别脚本字符串流，使用安全读取，保留游戏原文'});}
   return;
  }
  if(this.plan==='euphoria474'&&h.state.hookExact474===false)this.start('read');
  const hiding=['embed','euphoria474'].includes(this.plan);
  if(!p.hookHide){h.hooks.probeHide?.(false);this.ocr(false);if(h.textEffectsHold&&this.unsupported===true)this.status({hookEmbedUnsupported:false,hookCheckMessage:READ_ON_PURPOSE(h.textEffectsHold.why)});if(hiding)this.start('read');else if(explicit&&this.plan==='off')this.start('read');return;}
  // The verified YU-RIS 0.474 build uses a custom draw hook; read-only discovery does not expose that hook.
  if(h.state.hookExact474===true){if(!explicit&&!(h.state.bound&&h.state.coverEnabled!==false))return;if(this.plan!=='euphoria474')this.start('euphoria474',p.hookFast!==false);return;}
  const identity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');if(this.discoveryIdentity!==identity){this.discoveryIdentity=identity;this.readOnlySince=null;}
  const threads=h.hooks.state.hookThreads||[],naninovel=h.state.hookFramework==='naninovel'||/^manosaba$/i.test(h.state.processName||'');
  /* 2026-11-13 (DDLC Plus in English): many TMP streams rank the same; the one the foreign-language picker mapped to dialogue wins */const left=h.hooks.leftCodes||new Set(),foreignPicked=h.hooks.foreignPicked&&threads.find(x=>x.id===h.hooks.foreignPicked&&x.embeddable&&!left.has(x.code));/* E610: a hook the bridge left for carrying no dialogue is never ranked back */const t=foreignPicked||threads.filter(x=>x.embeddable&&!left.has(x.code)&&(!/DrawHide/.test(x.name)||h.state.hookExact474===true)&&(!naninovel||naninovelStream(x))).sort((a,b)=>streamRank(b)-streamRank(a))[0];
  // Naninovel's shared TMP setters also carry menus, names and backlog entries. Its printer is the dialogue source.
  if(naninovel&&!t){this.ocr(false);this.status({hookCheckState:'waiting',hookCheckMessage:'已识别 Naninovel，等待剧情台词流；推进一句后自动内嵌'});return;}
  // A hiding plan carried over from another game (the plan is saved) stays only while this game offers a stream
  // that can be embedded; once its streams carry text and none can, fall back below instead of leaving the
  // original visible.
  if(hiding&&(t||!threads.some(x=>x.selected&&x.sample))){const selected=threads.find(x=>x.selected);if(t&&selected&&t.id!==selected.id&&(streamRank(t)>streamRank(selected)||t===foreignPicked)){h.hooks.preferredThread=t.id;h.hooks.select?.(t.id);}return;}
  if(hiding)this.start('read');
  if(!t){if(this.plan==='off')this.start('read');
   // Streams carry text but none can be embedded: this game is covered by OCR instead.
   if(threads.some(x=>x.selected&&x.sample)){if(p.hookHide)h.hooks.probeHide?.(true);if(this.readOnlySince==null)this.readOnlySince=this.now();{const s=threads.find(x=>x.selected)?.sample||'';if(!this.pendingSamples||this.pendingIdentity!==identity){this.pendingSamples=new Set();this.pendingIdentity=identity;}if(s)this.pendingSamples.add(s);}if(this.now()-this.readOnlySince<8000){this.status({hookCheckState:'waiting',hookCheckMessage:'优先查找可内嵌的引擎文本流，暂不启用 OCR'});return;}
    /* E531 (CLANNAD / Siglus: title menu strings came first, the EmbedSiglus dialogue stream only appears with the first story line):
       while an embed-capable hook is inserted, wait until several different lines passed without it before calling the game unsupported. */
    /* E578: the selected stream cannot write back; the hook may still hide the game's own drawing of it (GDI / glyph hide). It is switched on
       as a probe and the stream turns embeddable (hide-only) once a hidden draw is reported; only after several lines without one is the game unsupported. */
    if(h.hooks.probing===true&&h.hooks.state.hookEmbedPending!==true&&this.pendingSamples.size<4){this.status({hookCheckState:'waiting',hookEmbedUnsupported:false,hookCheckMessage:'正在尝试通用隐藏原文：推进几句后自动生效'});return;}
    if(h.hooks.state.hookEmbedPending===true&&this.pendingSamples.size<4){this.status({hookCheckState:'waiting',hookEmbedUnsupported:false,hookCheckMessage:'已找到可内嵌的引擎钩子，进入剧情第一句后自动隐藏原文'});return;}/* 2026-11-21 (owner, ファタモルガーナの館 incr11: 「已经隐藏了却显示了这个提示」, hook-events 23:31:21.984 隐藏检查通过, 23:31:37.856 embed -> custom,
       then 这个游戏暂时不能隐藏原文 every 2 s): no stream writes back, but the original is still hidden: the glyph layer blanks it and MeguLit draws
       the line on its place (overlay placement / compositor). Nothing to report then. A read mode chosen by the self-check or the text-effect
       judge shows the game's text on purpose: it says so (the Alt+T read-mode line), never "send feedback". */
    const hidden=this.hiddenWithoutEmbed();if(hidden){this.status({hookEmbedUnsupported:false,hookCheckMessage:hidden});return;}
    /* E346 (user 2026-11-10): every engine that ends here tells the user how to get the game adapted. */this.status({hookCheckState:'reading',hookEmbedUnsupported:true,hookCheckMessage:EMBED_FEEDBACK});return;}
   this.status({hookCheckState:'waiting',hookCheckMessage:'已开启隐藏：等 Hook 找到游戏文本流，推进一句后自动开始隐藏'});return;}
  if(!explicit&&!(h.state.bound&&h.state.coverEnabled!==false))return;
  h.hooks.preferredThread=t.id;this.start(/DrawHide/.test(t.name)?'euphoria474':'embed',p.hookFast!==false);
 }
 /* One miss per line: two lines whose original could not be confirmed on screen hide through the selected embeddable stream anyway.
    The engine error guard (error dialog / crash after a replacement -> writeback off and remembered) still applies. */
 baselineMiss(sequence){const h=this.host;if(this.missSequence===sequence)return false;this.missSequence=sequence;this.baselineMisses=(this.baselineMisses||0)+1;
  if(!(this.baselineMisses>=2&&(h.hooks.state.hookThreads||[]).some(t=>t.selected&&t.embeddable)))return false;
  if(this.styleCalibration){this.styleGiveUp=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');this.finishStyleSync(false,true);}
  h.hooks.preflight=false;this.stage='switching';h.hooks.configure(h.preferences,h.state);this.status({hookBaselineVerified:false,hookCheckState:'switching',hookCheckMessage:'屏幕上未能识别原文，已按可内嵌文本流开启隐藏'});return true;}
 /* E520 (user: "只要是内嵌成功过的，开场第一句就要实现替换"): the bridge found this game's remembered dialogue stream, written only after a
    real replacement. The screen baseline (show the first line, find it, then hide) and the automatic style calibration (pause hiding
    to measure the original) are both warm-ups that let the first lines through; neither runs for such a game. The saved hiding plan
    is switched on at once; when the remembered stream turns out stale the bridge re-learns it (StaleMemory) as before. */
 remembered(){const h=this.host;if(!this.running||!['embed','euphoria474'].includes(this.plan)||h.preferences.hookHide===false)return false;
  if(this.styleCalibration&&this.styleManual)return false;
  this.styleCalibrationIdentity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');if(this.styleCalibration)this.finishStyleSync(false,true);
  if(!h.hooks.preflight&&this.baseline)return true;this.baseline=true;h.hooks.preflight=false;this.stage='switching';h.hooks.configure(h.preferences,h.state);
  this.status({hookBaselineVerified:true,hookCheckState:'switching',hookCheckMessage:'上次内嵌成功的设置已恢复，从第一句开始替换'});return true;}
 modeChanged(){const h=this.host,active=h.state.bound&&h.state.coverEnabled!==false;if(!active&&this.styleCalibration)this.finishStyleSync(false,true);if(this.running&&this.plan!=='read'&&!active){this.baseline=false;this.status({hookBaselineVerified:false,hookVisualVerified:false,hookCheckState:'reading',hookCheckMessage:'隐藏已关闭，约 3 秒后换下一句恢复原文'});}else if(this.running&&this.plan!=='read'&&active&&!this.baseline){
   // Style sampling already ran (or timed out) for this game process: do not gate hiding on the visual baseline
   // again, or games whose text OCR never matches would stay unhidden after every mode switch.
   const sampled=this.styleCalibrationIdentity===String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');
   const fast=!!h.hooks.remembered||h.preferences.hookFast!==false&&(h.preferences.autoGameStyle===false||!h.styleSync||!!h.styleSync.latest||sampled);h.hooks.preflight=!fast;h.hooks.configure(h.preferences,h.state);this.status(fast?{hookCheckState:'switching',hookCheckMessage:'隐藏已恢复，约 3 秒后从下一句开始生效'}:{hookCheckState:'baseline',hookCheckMessage:'准备隐藏，先推进一句检查原文位置'});}}
}
module.exports={HookControl};
