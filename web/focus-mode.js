// SPDX-License-Identifier: GPL-3.0-or-later
/* Keyboard-navigation focus rings, one switch for every MeguLit page (main window, settings, point-read card, Alt+T panel, dialogs, kana).
   Chromium/WebView2 starts matching :focus-visible on a clicked button as soon as ANY key is pressed, Shift and Ctrl included, so
   holding Shift (or a game shortcut) after a click drew a ring around that button (user report 11-27: 「很丑 经常发生在按shift之后」).
   This script owns the input mode instead:
   - <html data-input-mode="keyboard"> only after a navigation key (Tab, arrows, Enter, Space, Home/End/PageUp/PageDown) pressed
     without Ctrl/Alt/Meta; Shift, Ctrl, Alt, Meta, letters and shortcuts never enter it;
   - any pointer or touch press removes it again;
   - every :focus-visible selector in every stylesheet (documents and open shadow roots, also ones added later) is rewritten to
     :focus-visible:where(<keyboard mode> *, <text fields>), so outlines, glows and reveals tied to focus only show while navigating
     by keyboard. Text fields keep their caret focus style. focus-ring.css draws the unified ring and hides the browser's own one. */
(function(){
 'use strict';
 if(window.__megulitFocusMode)return;
 const ATTR='data-input-mode',MODE='keyboard';
 const NAV=new Set(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ','Spacebar','Home','End','PageUp','PageDown']);
 const TEXT='textarea,[contenteditable]:not([contenteditable=false]),input:not([type=checkbox],[type=radio],[type=range],[type=button],[type=submit],[type=reset],[type=color],[type=file],[type=image])';
 const KB=':root['+ATTR+'='+MODE+']';
 /* :host-context() only means something in a shadow tree; :is() is forgiving, so documents simply drop that branch */
 const GATE=':where(:is('+KB+',:host-context('+KB+')) *,'+TEXT+')';
 const root=document.documentElement;
 const setMode=on=>{if(on)root.setAttribute(ATTR,MODE);else root.removeAttribute(ATTR);};
 const isNavigation=e=>NAV.has(e.key)&&!e.ctrlKey&&!e.altKey&&!e.metaKey;
 addEventListener('keydown',e=>{if(isNavigation(e))setMode(true);},true);
 addEventListener('pointerdown',()=>setMode(false),true);
 addEventListener('touchstart',()=>setMode(false),{capture:true,passive:true});
 /* the ring fades in and out (140 ms) by animating focus-ring.css's --focus-ring-a; Web Animations leave each control's
    own transition/animation lists alone. Leaving keeps the ring drawn through [data-focus-leaving] until it has faded. */
 const FADE={duration:140,easing:'cubic-bezier(.2,.7,.3,1)'};
 const still=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{return false;}};
 const fade=(el,from,to)=>{try{return el.animate([{'--focus-ring-a':from},{'--focus-ring-a':to}],FADE);}catch{return null;}};
 const isKeyboard=()=>root.getAttribute(ATTR)===MODE;
 const targetOf=e=>(e.composedPath&&e.composedPath()[0])||e.target;
 document.addEventListener('focusin',e=>{const el=targetOf(e);if(!isKeyboard()||still()||!el||el.nodeType!==1)return;el.removeAttribute('data-focus-leaving');fade(el,0,1);},true);
 document.addEventListener('focusout',e=>{
  const el=targetOf(e);if(!isKeyboard()||still()||!el||el.nodeType!==1||!el.matches(':focus-visible'))return;
  el.setAttribute('data-focus-leaving','');
  const done=()=>{if(!el.matches(':focus'))el.removeAttribute('data-focus-leaving');};
  const run=fade(el,1,0);if(run)run.onfinish=run.oncancel=done;else done();
 },true);
 addEventListener('pointerdown',()=>{for(const el of document.querySelectorAll('[data-focus-leaving]'))el.removeAttribute('data-focus-leaving');},true);

 const gate=selector=>selector.includes(':focus-visible')&&!selector.includes(ATTR)?selector.replace(/:focus-visible(?![-\w])/g,':focus-visible'+GATE):selector;
 const rewriteRules=rules=>{
  if(!rules)return;
  for(const rule of rules){
   if(typeof rule.selectorText==='string'){const next=gate(rule.selectorText);if(next!==rule.selectorText)try{rule.selectorText=next;}catch{}}
   if(rule.styleSheet)rewriteSheet(rule.styleSheet);
   let inner=null;try{inner=rule.cssRules;}catch{}
   if(inner&&inner.length)rewriteRules(inner);
  }
 };
 const done=new WeakSet();
 /* focus-ring.css is the ring itself and already written per mode */
 const isRingSheet=sheet=>/\/focus-ring\.css(?:[?#]|$)/.test(sheet.href||'');
 function rewriteSheet(sheet){if(!sheet||done.has(sheet)||isRingSheet(sheet))return;let rules=null;try{rules=sheet.cssRules;}catch{return;}if(!rules)return;done.add(sheet);rewriteRules(rules);}
 const scopes=new Set([document]);
 const rewriteAll=()=>{for(const scope of scopes){for(const sheet of scope.styleSheets||[])rewriteSheet(sheet);for(const sheet of scope.adoptedStyleSheets||[])rewriteSheet(sheet);}};
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;rewriteAll();});};
 /* <style> text replaced later gets a fresh CSSStyleSheet: watch each style element's own text */
 const styleWatch=new MutationObserver(schedule),watched=new WeakSet();
 const noticeNode=node=>{
  if(node.nodeType!==1)return;
  if(node.tagName==='STYLE'&&!watched.has(node)){watched.add(node);styleWatch.observe(node,{childList:true,characterData:true,subtree:true});schedule();}
  else if(node.tagName==='LINK')schedule();
  else if(node.querySelector&&node.querySelector('style,link')){for(const el of node.querySelectorAll('style,link'))noticeNode(el);}
 };
 const watchTree=scope=>{
  new MutationObserver(list=>{for(const m of list)for(const n of m.addedNodes)noticeNode(n);}).observe(scope,{childList:true,subtree:true});
  /* stylesheet <link>s become readable on load; load does not bubble, but it does pass the capture phase */
  scope.addEventListener('load',e=>{if(e.target&&e.target.tagName==='LINK')schedule();},true);
  for(const el of scope.querySelectorAll?scope.querySelectorAll('style,link'):[])noticeNode(el);
 };
 watchTree(document);
 /* open shadow roots (the kana page) get the same rewrite plus the shared ring stylesheet */
 const ringHref=(()=>{const s=document.currentScript;try{return new URL('focus-ring.css',s&&s.src||location.href).href;}catch{return 'focus-ring.css';}})();
 const nativeAttach=Element.prototype.attachShadow;
 if(nativeAttach)Element.prototype.attachShadow=function(init){
  const shadow=nativeAttach.call(this,init);
  if(init&&init.mode==='open'){
   scopes.add(shadow);watchTree(shadow);
   const link=document.createElement('link');link.rel='stylesheet';link.href=ringHref;link.dataset.focusRing='';
   const keep=new MutationObserver(()=>{if(!link.isConnected)shadow.prepend(link);});
   shadow.prepend(link);keep.observe(shadow,{childList:true});
  }
  return shadow;
 };
 document.addEventListener('DOMContentLoaded',schedule);
 addEventListener('load',schedule);
 schedule();
 window.__megulitFocusMode={isKeyboard,gate,rewriteAll};
})();
