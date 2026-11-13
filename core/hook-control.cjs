// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const naninovelStream=t=>/Naninovel.*RevealableText|:Naninovel\.UI:RevealableText:SetTextValue:/i.test((t.name||'')+' '+(t.code||''));
const streamRank=t=>naninovelStream(t)?300:/^Embed/.test(t.name||'')||t.embeddable===true?200:/TMP_Text|TextMeshPro|TextElement|TextField/.test(t.name||'')?10:100;
const EMBED_FEEDBACK='这个游戏暂时不能隐藏原文：请在「关于」里提交反馈，附上游戏名和截图，一般一天内就能适配';
class HookControl{
 constructor(host,now=Date.now){this.host=host;this.now=now;this.seq=0;this.baseline=false;this.plan='read';this.running=false;this.lastIdentity='';}
 status(value){if(value.hookCheckState)this.host.hooks.trace?.('check '+value.hookCheckState+' '+(value.hookCheckMessage||''));this.host.notify({type:'hookCheck',hookProfile:this.plan,hookAutoOcr:!!this.autoOcr,...value});}
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
  this.running=profile!=='off';this.plan=profile;this.baseline=false;this.baselineMisses=0;this.missSequence=null;this.seq=0;const styleIdentity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');this.styleCalibration=!!(force&&!h.hooks.remembered/* E520 */&&h.preferences.autoGameStyle!==false&&h.styleSync&&!h.styleSync.latest&&this.styleCalibrationIdentity!==styleIdentity);if(this.styleCalibration)force=false;h.hooks.preflight=this.running&&profile!=='read'&&!force&&!h.hooks.remembered;
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
  this.styleCalibrationIdentity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');clearTimeout(this.styleTimer);this.styleManual=manual;this.styleAwaitLive=false;this.styleCalibration=true;this.styleIdentity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');this.styleRestore=['embed','euphoria474'].includes(this.plan)&&h.preferences.hookHide!==false;
  h.styleSync.calibrating=true;h.styleSync.waitNext=this.styleRestore||h.hooks.drawsHidden===true;h.hooks.calibrating=true; // E246.1: embedding cleared the current line, so measure the next original line
   h.hooks.preflight=true;h.hooks.configure?.(h.preferences,h.state);h.onEvent?.({gameStylePreview:false});h.styleSync.automatic=!manual;h.styleSync.owner=owner;if(!h.styleSync.source){const source=h.state.hookSource||h.hooks.lastSource;if(source?.trim()){h.styleSync.source=source;h.styleSync.sourceRead=h.state.hookSourceRead===true;}}h.styleSync.status('revealing');
  h.styleSync.begin?.(purpose);h.styleSync.request(true);
  // A visible current sentence completes calibration; a bounded deadline restores normal reading on failure.
  this.styleTimer=setTimeout(()=>{if(!this.styleCalibration)return;if(!h.styleSync.publish?.()){this.styleFailures=(this.styleFailures||0)+1;if(this.styleFailures>=(manual?2:1))this.styleGiveUp=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');this.finishStyleSync(false);this.styleRetryAt=this.now()+60000;}},manual?(h.styleSync.waitNext?90000:25000):12000); /* automatic calibration pauses embedding: keep that pause short (user: ISLAND showed the original for 90 s after every launch) */this.styleTimer.unref?.();
 }
 finishStyleSync(success,cancel=false){
  if(!this.styleCalibration)return;clearTimeout(this.styleTimer);this.styleTimer=null;this.styleCalibration=false;const h=this.host;h.hooks.calibrating=false;h.hooks.preflight=false;h.styleSync.calibrating=false;clearTimeout(h.styleSync.timer);if(cancel)h.styleSync.cancel?.();h.onEvent?.({gameStylePreview:false});
  const same=this.styleIdentity===String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');this.styleRetryAt=this.now()+15000;
  if(same&&!cancel){h.hooks.preflight=false;h.hooks.configure?.(h.preferences,h.state);this.styleAwaitLive=false;h.styleSync.status(success?'applied':'retrying');}
  if(!same||cancel||!this.styleRestore){this.styleAwaitLive=false;h.onEvent?.({gameStylePreview:false});}
 }
 check(){const h=this.host;if(!this.running){this.start(h.preferences.hookProfile==='off'?'read':h.preferences.hookProfile);return;}if(h.hooks.lastSource)this.source(h.hooks.lastSource);else this.status({hookCheckMessage:'还没有台词，请在游戏里推进一句'});}
 source(text){
  if(!this.running||!text.trim())return;
  /* E351: a flow page (WoH) is laid out on the game's own page grid; the automatic box calibration measured the current
     sentence mid-page (left 56 / top 53 / width 44) and paused hiding while it measured, so it never runs there. */
  const h=this.host;if(!this.styleCalibration&&!(h.hooks?.flowPage&&h.hooks?.flowGridName)/* E414: only a page with a measured grid skips box calibration */&&!h.hooks?.remembered/* E520: a game that embedded before is never paused on its first lines to measure the original */&&this.styleCalibrationIdentity!==String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'')&&this.plan!=='off'&&h.preferences.autoGameStyle!==false&&h.styleSync&&!h.styleSync.latest&&this.now()>=(this.styleRetryAt||0)&&this.styleGiveUp!==String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||''))this.beginStyleSync(false);this.seq++;this.sourceAt=this.now();
  const stage=h.hooks.preflight?'baseline':h.hooks.enabled&&this.plan!=='read'?'hidden':'read';
  if(stage==='baseline'&&this.styleCalibration)h.styleSync?.status('measuring');
  this.stage=stage;this.status({hookCapturedAt:this.sourceAt,hookCaptureCharacters:text.length,hookVisualVerified:false,hookCheckState:stage==='baseline'?'baseline':stage==='hidden'?'checking':'captured',hookCheckMessage:stage==='baseline'?'已抓到台词，正在检查游戏中的原文':stage==='hidden'?'台词已捕捉，正在检查游戏原文是否消失':'台词捕捉成功，正在检查游戏画面'});
  h.send({type:'hookVerify',source:text,sequence:this.seq,stage,...require('./scan-area.cjs').area(h.preferences,h.flowPage||undefined)});
 }
 visual(m){
  if(!this.running||m.sequence!==this.seq||m.stage!==this.stage)return;
  const h=this.host;h.hooks.trace?.('visual '+JSON.stringify(m));
  /* E477 (player: a new game in a small window kept its original under MeguLit's text after many tries). A baseline screen check that
     fails outright (capture or OCR error, a window too small to read) returned here without counting, so preflight (original shown,
     writeback off) never ended. It now counts as a miss for its line, like a check that found nothing. */
  if(!m.valid){if(m.stage==='baseline'&&!this.styleCalibration){this.baselineMiss(m.sequence);if(this.stage==='switching')return;}this.status({hookCheckState:'unverified',hookVisualVerified:false,hookCheckMessage:'画面未确认：'+String(m.error||'画面读取失败')});return;}
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
  if(m.matched){if(h.hooks.lastSource)h.send({type:'maskAssist',source:h.hooks.lastSource});this.status({hookCheckState:'visible',hookVisualVerified:false,hookCheckMessage:'游戏原文仍然可见，本句已临时用遮罩盖住'});return;}
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
  if(!p.hookHide){this.ocr(false);if(hiding)this.start('read');else if(explicit&&this.plan==='off')this.start('read');return;}
  // The verified YU-RIS 0.474 build uses a custom draw hook; read-only discovery does not expose that hook.
  if(h.state.hookExact474===true){if(!explicit&&!(h.state.bound&&h.state.coverEnabled!==false))return;if(this.plan!=='euphoria474')this.start('euphoria474',p.hookFast!==false);return;}
  const identity=String(h.state.gameProcessId||'')+'|'+String(h.state.gameStarted||'');if(this.discoveryIdentity!==identity){this.discoveryIdentity=identity;this.readOnlySince=null;}
  const threads=h.hooks.state.hookThreads||[],naninovel=h.state.hookFramework==='naninovel'||/^manosaba$/i.test(h.state.processName||'');
  /* 2026-11-13 (DDLC Plus in English): many TMP streams rank the same; the one the foreign-language picker mapped to dialogue wins */const foreignPicked=h.hooks.foreignPicked&&threads.find(x=>x.id===h.hooks.foreignPicked&&x.embeddable);const t=foreignPicked||threads.filter(x=>x.embeddable&&(!/DrawHide/.test(x.name)||h.state.hookExact474===true)&&(!naninovel||naninovelStream(x))).sort((a,b)=>streamRank(b)-streamRank(a))[0];
  // Naninovel's shared TMP setters also carry menus, names and backlog entries. Its printer is the dialogue source.
  if(naninovel&&!t){this.ocr(false);this.status({hookCheckState:'waiting',hookCheckMessage:'已识别 Naninovel，等待剧情台词流；推进一句后自动内嵌'});return;}
  // A hiding plan carried over from another game (the plan is saved) stays only while this game offers a stream
  // that can be embedded; once its streams carry text and none can, fall back below instead of leaving the
  // original visible.
  if(hiding&&(t||!threads.some(x=>x.selected&&x.sample))){const selected=threads.find(x=>x.selected);if(t&&selected&&t.id!==selected.id&&(streamRank(t)>streamRank(selected)||t===foreignPicked)){h.hooks.preferredThread=t.id;h.hooks.select?.(t.id);}return;}
  if(hiding)this.start('read');
  if(!t){if(this.plan==='off')this.start('read');
   // Streams carry text but none can be embedded: this game is covered by OCR instead.
   if(threads.some(x=>x.selected&&x.sample)){if(this.readOnlySince==null)this.readOnlySince=this.now();if(this.now()-this.readOnlySince<8000){this.status({hookCheckState:'waiting',hookCheckMessage:'优先查找可内嵌的引擎文本流，暂不启用 OCR'});return;}/* E346 (user 2026-11-10): every engine that ends here tells the user how to get the game adapted. */this.status({hookCheckState:'reading',hookEmbedUnsupported:true,hookCheckMessage:EMBED_FEEDBACK});return;}
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
