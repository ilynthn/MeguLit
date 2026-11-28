// SPDX-License-Identifier: GPL-3.0-or-later
// Shared interaction rules for controls created by the settings modules
(function installUiBehavior(){
 'use strict';if(!document.documentElement||!document.head||!document.body){document.addEventListener('DOMContentLoaded',installUiBehavior,{once:true});return;}if(window.__tomeUiBehavior)return;window.__tomeUiBehavior=true;
 const T={
  zh:{move:'在 MeguLit 日文句末显示游戏的等待符，不会自动隐藏原位置',hide:'遮住游戏原位置的等待符，与句末显示开关互不影响',hook:'切换原文隐藏后，从游戏下一句开始生效；Hook 会优先尝试引擎内隐藏',auto:'打开游戏并绑定窗口后，自动连接 Hook 和选择文本流；可在高级选项中手动停止',scan:'OCR 模式：原文遮盖与扫描范围',scanTip:'仅调整 OCR 遮盖层的位置与外观，不改变 Hook 内嵌效果；Hook 画面检查也会参考扫描范围'},
  en:{move:'Show the game’s wait marker at the end of the MeguLit Japanese line; the original position is controlled separately',hide:'Cover the wait marker at its original game position, independently of relocation',hook:'Original-text hiding changes take effect from the next game line; engine-level hiding is tried first',auto:'Automatically connect Hook and select a text stream after binding a game; stop it manually in Advanced',scan:'OCR mode: text cover and scan area',scanTip:'Adjusts the OCR cover, not embedded Hook hiding; Hook visual checks also use this scan area'},
  ja:{move:'MeguLit の日本語文末に待機マークを表示します。元の位置の非表示とは独立しています',hide:'ゲーム内の元の待機マークを隠します。文末への移動とは独立しています',hook:'原文の非表示切替は次の台詞から反映します。エンジン内の非表示を優先します',auto:'ゲームを固定すると Hook に自動接続してテキストを選択します。詳細設定から停止できます',scan:'OCR モード：原文のカバーとスキャン範囲',scanTip:'OCR カバーの位置と見た目を調整します。Hook 埋め込みの効果は変わりません。Hook の画面確認にもこの範囲を使用します'}};
 const text=k=>(T[window.__tomeI18n?.get?.()]||T.zh)[k];
 const style=document.createElement('style');style.textContent=`
 .tomoyo-cn-dialog label:has(input[type=checkbox]),.tomoyo-cn-dialog .tome-hook-switch,.tomoyo-cn-dialog .tome-hook-switch b,.tomoyo-cn-dialog .tome-hook-switch span{font-weight:400!important;cursor:default!important}
 .tomoyo-cn-dialog .tome-hook-hint,.tomoyo-cn-dialog .tome-hook-mode,.tomoyo-cn-dialog [data-gal-wait-state]{display:none!important}
 .tomoyo-cn-dialog [hidden]{display:none!important}
 .tomoyo-cn-dialog [data-menu-category=about] .tome-about-page h2,.tomoyo-cn-dialog [data-menu-category=about] .tome-about-version{display:none}
 .tomoyo-cn-dialog [data-menu-category=about] .tome-credit{border-color:var(--theme-border,#3a3a40)!important;background:transparent!important}
 `;document.head.append(style);
 // Shift/Ctrl/middle-click on an in-app link made WebView open a new browser window on tauri.localhost (unreachable):
 // treat it as a plain click so the app's own router handles it (user, 2026-11-02).
 document.addEventListener('click',e=>{if(!(e.shiftKey||e.ctrlKey||e.metaKey))return;const a=e.target instanceof Element&&e.target.closest('a[href]');if(!a)return;let same=false;try{same=new URL(a.href,location.href).origin===location.origin;}catch{}if(!same)return;e.preventDefault();e.stopImmediatePropagation();a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));},true);
 document.addEventListener('auxclick',e=>{if(e.button===1&&e.target instanceof Element&&e.target.closest('a[href]'))e.preventDefault();},true);
 // Prevent label default activation (row text), while preserving switch-track clicks (label.switch wraps only the switch) and keyboard activation
 document.addEventListener('click',e=>{
  const target=e.target;if(!(target instanceof Element))return;
  if(target.closest('.media-header .synopsis-text')){e.stopPropagation();return;}
  const label=target.closest('label'),input=label&&(label.querySelector('input[type=checkbox]')||(label.htmlFor?document.getElementById(label.htmlFor):null));
  if(input?.type==='checkbox'&&target!==input&&!label.matches('.switch')&&!target.closest('button,a,select,textarea,input'))e.preventDefault();
 },true);
 function apply(){
  for(const [selector,key]of [['[name=galRelocateWaitMarker]','move'],['[name=galHideWaitMarker]','hide'],['[data-hook-pref=hookHide]','hook'],['[data-hook-pref=hookAutoStart]','auto']]){
   for(const input of document.querySelectorAll(selector)){const label=input.closest('label');if(label){const tip=text(key);if(label.title!==tip)label.title=tip;input.setAttribute('aria-description',tip);if(!input.hasAttribute('aria-label'))input.setAttribute('aria-label',label.textContent.trim());}}
  }
  for(const input of document.querySelectorAll('.tomoyo-cn-dialog input[type=checkbox]')){const label=input.closest('label');if(label&&!input.hasAttribute('aria-label'))input.setAttribute('aria-label',label.textContent.trim());}
  for(const scan of document.querySelectorAll('.tomoyo-cn-dialog details:has([name=galScanX])')){const summary=scan.querySelector(':scope>summary');if(summary){summary.dataset.noI18n='';if(summary.textContent!==text('scan'))summary.textContent=text('scan');summary.title=text('scanTip');}}
  for(const mode of document.querySelectorAll('[data-hook-mode]')){const summary=mode.closest('.tome-hook-main')?.querySelector('[data-hook-summary]');if(summary&&summary.title!==mode.textContent)summary.title=mode.textContent;}
  // The colour field's own copy button is wanted (user, 2026-11-02); other copy buttons stay removed.
  // So are the 关于 page's QQ group 复制 buttons (owner 2026-11-29, web/reader/modules/about.js).
  for(const button of document.querySelectorAll('button[data-copy],button')){if(button.closest('.tome-color-field,.tome-qq,.tome-qq-pop'))continue;if(button.hasAttribute('data-copy')||/^(?:复制|已复制|Copy\b|Copied\b|コピー)/i.test(button.textContent.trim()))button.remove();}
 }
 let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});};
 new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
 addEventListener('tome-language-change',schedule);apply();window.__tomeUiBehaviorReady=true;
})();
