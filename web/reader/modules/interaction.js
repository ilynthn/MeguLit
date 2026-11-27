// SPDX-License-Identifier: GPL-3.0-or-later
// Reports which parts of the translation overlay must receive clicks (and paint): the Windows region of the overlay
// window is built from these rectangles. Menus use their untransformed box so open/close/drag animations are never
// clipped; while a menu is dragged or resized, or while a mode transition plays, the whole surface is reported.
(function installInteractionRegions(){
 'use strict';if(!document.documentElement){document.addEventListener('DOMContentLoaded',installInteractionRegions,{once:true});return;}if(window.__tomoyoHitRegions)return;window.__tomoyoHitRegions=true;
 // Wait for native size acknowledgement AND the matching WebView viewport before painting a panel.
 window.__tomeWaitForSurface=(node,ready,maxWait=700)=>{
  if(!document.body.classList.contains('tomoyo-ui-translation')){requestAnimationFrame(ready);return;}
  let ack=null,finished=false,frame=0;
  const valid=()=>node.isConnected&&!node.hasAttribute('data-leaving');
  const cleanup=()=>{finished=true;clearInterval(timer);cancelAnimationFrame(frame);removeEventListener('tome-region-applied',receive);};
  const check=()=>{if(finished)return;if(!valid()){cleanup();return;}
   if(!ack||frame)return;const scale=devicePixelRatio||1;if(Math.abs(innerWidth*scale-ack.surfaceWidth)>2||Math.abs(innerHeight*scale-ack.surfaceHeight)>2)return;
   const w=innerWidth,h=innerHeight;frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{frame=0;if(!finished&&valid()&&w===innerWidth&&h===innerHeight){cleanup();ready();}});});
  };
  const receive=e=>{ack=e.detail;check();};addEventListener('tome-region-applied',receive);
  // Never wait forever: if the size acknowledgement does not arrive or never matches (DPI rounding, bridge restart),
  // the panel is shown after 700 ms anyway, as the former fixed fallback did.
  const started=Date.now(),timer=setInterval(()=>{check();if(finished)return;if(Date.now()-started>=maxWait){cleanup();if(valid())ready();return;}window.__tomoyoHitRegionsRefresh?.(true);},Math.min(150,Math.max(30,Math.floor(maxWait/2))));
  window.__tomoyoHitRegionsRefresh?.(true);
 };
 let queued=false,last='';const watched=new WeakSet(),resize=new ResizeObserver(schedule);
 const NODES='.sentence-text:not(.megulit-art-row) .char-token,.tome-page-lines>div,.tome-inline-wait,.tomoyo-cn-output,.tome-translation-char,.tomoyo-learning-notice,.tome-first-run,.lookup-tooltip,.tomoyo-selection-card,.tomoyo-cn-dialog[open],.tomoyo-cn-dialog[data-leaving],.tome-backlog[data-open],.tome-backlog[data-leaving],.tome-box-deco,.tome-subtitle-drag-guide,.sentence-placeholder,.mg-select-pop,.tome-color-panel,.mg-cap-hit,.mg-tour,body.tomoyo-ui-translation:not(.tomoyo-gal-bound) .sentence-window';/* 2026-11-13 the choice overlay (E407.2) paints only inside the window region: without its boxes here it was drawn but never seen */
 // The lookup card and its dropdowns need the native pointer gate even when the game polls mouse buttons.
 const MENUS='.tomoyo-cn-dialog,.tome-backlog,.mg-select-pop,.tome-color-panel,.tome-subtitle-drag-guide,.tomoyo-selection-card';
 function movedTranslationScroll(node) {
  const row=node?.closest('.megulit-anchor-window .tomoyo-cn-row');
  return row?.style.translate&&row.style.overflowY==='auto'?row:null;
 }
 /* 2026-11-26 (QQ #1130, p0: the wheel over the lookup popup advanced the game; wheel up over the line no longer opened the log):
    every lookup popup (the card and the word tooltip) owns the wheel over its box; over the line the log decides (backlog.js) */
 const LOOKUPS='.tomoyo-selection-card,.lookup-tooltip';
 window.__megulitResolveWheel=(id,x,y)=>{
  const inLookup=[...document.querySelectorAll(LOOKUPS)].some(node=>{const style=getComputedStyle(node);if(style.visibility!=='visible'||style.display==='none')return false;
   const box=node.getBoundingClientRect();return box.width&&box.height&&x>=box.left&&x<box.right&&y>=box.top&&y<box.bottom;});
  const at=document.elementFromPoint(x,y),scroll=movedTranslationScroll(at),log=inLookup?'':window.__tomoyoChinese?.backlogWheelTarget?.(at)||'';
  const panel=!!(inLookup||at?.closest(MENUS)||at?.closest(LOOKUPS)||scroll&&scroll.scrollHeight>scroll.clientHeight||log==='all');
  window.__tomoyoTranslateRequest(JSON.stringify({type:'galWheelDecision',id,panel,panelUp:!panel&&log==='up'}));
 };
 /* 2026-11-26 (オルフレール, Ctrl fast-forward: one hooked line of 3996 characters, 8000 char tokens on the page; Cardinal r1/r2: the
    reader stopped answering for good after 89 s). Every mutation ran a report in a microtask and a report reads every token's style and
    boxes (110 ms for 8000 tokens): a typing line mutates every frame, so the page did nothing else. A report that took long holds the
    next one back by three times its cost (at most a quarter of the time goes to regions, whatever the page holds); a page of normal size
    (a report under 12 ms) reports at once as before. */
 let nextReport=0,reportTimer=0;const clock=()=>typeof performance==='object'&&performance?performance.now():Date.now();
 function runReport(){reportTimer=0;const t=clock();report();const now=clock(),cost=now-t;nextReport=cost>12?now+cost*3:0;}
 function schedule(){if(queued)return;queued=true;const wait=nextReport-clock();if(wait>0){if(!reportTimer)reportTimer=setTimeout(runReport,wait);}else queueMicrotask(runReport);}
 /* 2026-11-19 (1.4.17 candidate, user: 「打字机效果…像运行了两遍…像被啃了一块走又恢复」, every game): a character the typewriter has
    just let in starts its 70 ms fade at opacity 0. Counted as invisible, it and its neighbour dropped out of the window region
    for one report; the bridge applies regions a few frames late, so the hole showed on letters already painted and swept
    along behind the typing. A glyph in a typing line or in a running fade is painted: it keeps its region. */
 function fadingIn(node){if(node.closest('[data-tome-typing="true"]'))return true;try{return node.getAnimations().some(a=>a.playState==='running');}catch{return false;}}
 // WebView2 only redraws damaged parts of its surface; a part that was outside the old region can still hold stale
 // (black) pixels when the region grows, which showed as black blocks for the first frame of a menu or the backlog.
 // Damage the whole viewport for two frames before the native side applies the new region.
 let damage=null,damageFrames=0;
 function repaint(){if(!document.body)return;if(!damage){damage=document.createElement('div');damage.setAttribute('aria-hidden','true');damage.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647;background:rgba(0,0,0,.004);contain:strict';}
  if(!damage.isConnected)document.body.append(damage);const serial=++damageFrames;damage.style.opacity=damage.style.opacity==='1'?'.99':'1';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(serial===damageFrames)damage.remove();}));}
 // force: send even if nothing changed (the native side dropped its regions, e.g. after binding a game).
 window.__tomoyoHitRegionsRefresh=force=>{if(force===true)last='';schedule();};
 function menuBox(node){
  // offsetLeft/Top of a fixed element are viewport coordinates and ignore CSS transforms.
  if(node.offsetParent===null&&getComputedStyle(node).position==='fixed')return {left:node.offsetLeft,top:node.offsetTop,right:node.offsetLeft+node.offsetWidth,bottom:node.offsetTop+node.offsetHeight,width:node.offsetWidth,height:node.offsetHeight};
  return node.getBoundingClientRect();
 }
 // Range rectangles preserve every wrapped fragment of old page lines and plain error/status text.
 // Pending typewriter spans keep their layout but contribute no painted region until they become visible.
 function textBoxes(node){if(node.matches('.tome-page-lines>div,.tomoyo-cn-output')){const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()];}return [...node.getClientRects()];}
 function compact(rects){while(rects.length>256){let best=-1,cost=Infinity;for(let i=0;i<rects.length-1;i++){const a=rects[i],b=rects[i+1];if(a.menu||b.menu)continue;const c=Math.max(a.x+a.width,b.x+b.width)-Math.min(a.x,b.x)+Math.max(a.y+a.height,b.y+b.height)-Math.min(a.y,b.y);if(c<cost){cost=c;best=i;}}if(best<0)break;const a=rects[best],b=rects[best+1],x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);rects.splice(best,2,{x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y,menu:false});}return rects;}
 function lookupGripBox(scale){
  const grip=window.__tomoyoChinese?.lookupGrip?.();
  if(!grip||getComputedStyle(grip.head).visibility!=='visible')return null;
  if(!watched.has(grip.head)){resize.observe(grip.head);watched.add(grip.head);}
  const card=grip.head.parentElement.getBoundingClientRect();
  const clipped=node=>{
   const r=node.getBoundingClientRect(),left=Math.max(0,card.left,r.left),top=Math.max(0,card.top,r.top);
   const right=Math.min(innerWidth,card.right,r.right),bottom=Math.min(innerHeight,card.bottom,r.bottom);
   if(right<=left||bottom<=top)return null;
   const x=Math.floor(left*scale),y=Math.floor(top*scale);
   return {x,y,width:Math.ceil(right*scale)-x,height:Math.ceil(bottom*scale)-y};
  };
  const area=clipped(grip.head);
  return area&&{area,controls:[...grip.controls].map(clipped).filter(Boolean)};
 }
 // While the menu is dragged it moves by transform every frame; recomputing the window region per frame queues
 // SetWindowRgn calls the native side cannot keep up with (the panel is clipped mid-drag and keeps "moving" after
 // release). Hold one whole-layer region for the drag; release recomputes it from the real content.
 // The same holds for an edge/corner resize (2026-11-15, user video: blank areas, clipped footer, flicker, jumps).
 /* 2026-11-21 (owner, STEINS;GATE: earlier lines of the page let clicks through): at most every 2 s, when the regions change, how many visible Japanese characters on the page lie outside them and in which elements (reader-host.log layoutDiagnostic kind=hitRegions) */
 let missSent=0;function missDiag(regions){const now=Date.now();if(now-missSent<2000)return;missSent=now;const scale=Number(devicePixelRatio)||1,inside=(x,y)=>regions.some(r=>x*scale>=r.x&&x*scale<r.x+r.width&&y*scale>=r.y&&y*scale<r.y+r.height);let chars=0,missed=0;const where={},rows=new Set();for(const t of document.querySelectorAll('.sentence-window .char-token,.sentence-window .tome-page-char,.tome-page-lines>div')){if(t.matches('.tome-page-lines>div')&&t.querySelector('.tome-page-char'))continue;const st=getComputedStyle(t);if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)===0)continue;for(const r of t.getClientRects()){if(!r.width||!r.height||!/[\u3040-\u30ff\u4e00-\u9fff]/.test(t.textContent||''))continue;chars++;rows.add(Math.round(r.top/8));if(!inside(r.left+r.width/2,r.top+r.height/2)){missed++;const k=(t.parentElement?.className||t.className||'?').toString().slice(0,40);where[k]=(where[k]||0)+1;}}}if(!chars)return;try{window.__tomoyoTranslateRequest(JSON.stringify({type:'layoutDiagnostic',kind:'hitRegions',regions:regions.length,japaneseChars:chars,japaneseRows:rows.size,outside:missed,outsideIn:Object.entries(where).map(([k,v])=>k+':'+v).join(' ').slice(0,200)}));}catch{}}
 function report(){queued=false;if(document.querySelector('.tome-menu-dragging,.tomoyo-menu-resizing,.tome-subtitle-drag-guide[data-dragging]')){const scale=Number(devicePixelRatio)||1,regions=[{x:0,y:0,width:Math.ceil(innerWidth*scale),height:Math.ceil(innerHeight*scale),menu:true}],key=JSON.stringify({regions,menuOpen:true});if(key!==last){last=key;try{window.__tomoyoTranslateRequest(JSON.stringify({type:'galHitRegions',regions,menuOpen:true}));}catch{}}return;}const regions=[],scale=Number(devicePixelRatio)||1,bound=document.body?.classList.contains('tomoyo-gal-bound')||document.body?.classList.contains('tomoyo-ui-translation');
  const menuOpen=!!document.querySelector('.tomoyo-cn-dialog[open],.tomoyo-cn-dialog[data-leaving],.tome-backlog[data-open],.tome-backlog[data-leaving]');
  const lookupDrag=Number(document.querySelector('.tomoyo-selection-card[data-lookup-drag]')?.dataset.lookupDrag)||0;
  const dragKey=lookupDrag?`lookup:${lookupDrag}:${menuOpen}:${innerWidth}:${innerHeight}:${scale}`:'';
  if(dragKey&&last===dragKey)return;
  const clipRects=new Map();
  if(bound)for(const node of document.querySelectorAll(NODES)){if(node.closest('body.megulit-choice-covers-line .sentence-window:not(.tome-island-page),body.megulit-choice-only .sentence-window:not(.tome-island-page)'))continue;if(!watched.has(node)){resize.observe(node);watched.add(node);}const style=getComputedStyle(node),isMenu=node.matches(MENUS);
   if(node.matches('.tomoyo-cn-output')&&node.querySelector('.tome-translation-char'))continue;
   // Text Ranges include fragments scrolled out of sight. Those pixels must stay clickable in the game.
   const container=movedTranslationScroll(node)||node.closest('.megulit-dialogue-band');
   if(container&&!clipRects.has(container))clipRects.set(container,container.getBoundingClientRect());const clip=clipRects.get(container);
   const followsPaintedBox=node.matches('.tomoyo-selection-card,.tomoyo-menu-resizing,.tome-dragging');
   const boxes=isMenu?[followsPaintedBox?node.getBoundingClientRect():menuBox(node)]:textBoxes(node);for(const r of boxes){if(style.display==='none'||style.visibility==='hidden'||(!isMenu&&Number(style.opacity)===0&&!node.classList.contains('tome-typewriter-pending')&&!fadingIn(node))||!r.width||!r.height)continue;if(node.closest('[hidden]')||!node.getClientRects().length)continue;
   // The Windows region clips painting as well as clicks: include the furigana (a ::before above each token, outside its box) and the text outline.
   let top=r.top-(isMenu?0:6),side=isMenu?0:6;const sentence=node.closest('.sentence-text');
   if(sentence?.classList.contains('tomoyo-furigana')){const font=parseFloat(style.fontSize)||16,scale=parseFloat(getComputedStyle(sentence).getPropertyValue('--tomoyo-ruby-scale'))||.55,root=getComputedStyle(document.documentElement),offY=parseFloat(root.getPropertyValue('--tomoyo-ruby-offset-y'))||0,offX=parseFloat(root.getPropertyValue('--tomoyo-ruby-offset-x'))||0;top=r.top-font*(scale*1.3+.2)-Math.max(0,-offY)-4;side=Math.max(6,Math.abs(offX)+font*.6);}
   let x=Math.max(0,r.left-side),y=Math.max(0,top),right=Math.min(innerWidth,r.right+side),bottom=Math.min(innerHeight,r.bottom+(isMenu?0:6)+Math.max(0,sentence?.classList.contains('tomoyo-furigana')?(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tomoyo-ruby-offset-y'))||0):0));
   if(clip){x=Math.max(x,clip.left);y=Math.max(y,clip.top);right=Math.min(right,clip.right);bottom=Math.min(bottom,clip.bottom);}
   const lookup=node.matches('.tomoyo-selection-card')||node.matches('.mg-select-pop')&&document.body.classList.contains('tomoyo-selection-open');
   /* #1136: the 对话记录 sits over the game like the word card; a native press there is a press a polling game sees (relay: the bridge keeps it from the game and relays it) */
   const relay=!lookup&&node.matches('.tome-backlog');
   if(right>x&&bottom>y){const leftPx=Math.floor(x*scale),topPx=Math.floor(y*scale);regions.push({x:leftPx,y:topPx,width:Math.ceil(right*scale)-leftPx,height:Math.ceil(bottom*scale)-topPx,menu:isMenu,...(lookup?{lookup:true}:{}),...(relay?{relay:true}:{})});}}}
  regions.sort((a,b)=>Number(a.menu)-Number(b.menu)||a.y-b.y||a.x-b.x);
  const merged=[];for(const r of regions){const p=merged.at(-1);if(p&&!p.menu&&!r.menu&&Math.abs(p.y-r.y)<=2&&Math.abs(p.height-r.height)<=2&&r.x<=p.x+p.width+2&&r.x+r.width>=p.x-2){/* Union on both sides: a region sorted first only by a 1px higher top (the moved wait marker) used to keep its left edge and drop the whole Japanese line left of it. */const top=Math.min(p.y,r.y),bottom=Math.max(p.y+p.height,r.y+r.height),left=Math.min(p.x,r.x);p.width=Math.max(p.x+p.width,r.x+r.width)-left;p.x=left;p.y=top;p.height=bottom-top;}else merged.push({...r});}regions.splice(0,regions.length,...compact(merged));/* #1136: the relayed 对话记录 keeps a native press where a drag is native-only (its scrollbar, sliders, drop-downs) */if(bound)for(const log of document.querySelectorAll('.tome-backlog[data-open]')){const spots=[],list=log.querySelector('.tome-log-list');if(list&&list.scrollHeight>list.clientHeight){const r=list.getBoundingClientRect(),cs=getComputedStyle(list),br=parseFloat(cs.borderRightWidth)||0,w=Math.max(12,list.offsetWidth-list.clientWidth-(parseFloat(cs.borderLeftWidth)||0)-br)/* an overlay scrollbar takes no layout width but is still dragged at the edge */;if(w>0)spots.push({left:r.right-br-w,top:r.top,right:r.right-br,bottom:r.bottom});}for(const c of log.querySelectorAll('input[type=range],select'))spots.push(c.getBoundingClientRect());for(const r of spots){const x=Math.floor(Math.max(0,r.left)*scale),y=Math.floor(Math.max(0,r.top)*scale),right=Math.ceil(Math.min(innerWidth,r.right)*scale),bottom=Math.ceil(Math.min(innerHeight,r.bottom)*scale);if(right>x&&bottom>y)regions.push({x,y,width:right-x,height:bottom-y,menu:true,nativeSpot:true});}}/* E533: art-text translations are painted (window region) but pass the pointer to the game (pass): a title card or button under them stays clickable *//* 2026-11-15 choices (ruby + translation over the game's options) and the placed name plate / options (text-place.js) are painted the same way: the click reaches the game's own button */if(bound)for(const node of document.querySelectorAll('.megulit-art-item .megulit-art-cn,.megulit-choice,.megulit-choice-cn,#megulit-place-extras span,#megulit-page-ahead>i')){const r=node.getBoundingClientRect();if(!r.width||!r.height||regions.length>=250)continue;const x=Math.max(0,r.left-8),y=Math.max(0,r.top-6),right=Math.min(innerWidth,r.right+8),bottom=Math.min(innerHeight,r.bottom+6);if(right>x&&bottom>y)regions.push({x:Math.floor(x*scale),y:Math.floor(y*scale),width:Math.ceil((right-x)*scale),height:Math.ceil((bottom-y)*scale),menu:false,pass:true});}const lookupGrip=lookupGripBox(scale),message={type:'galHitRegions',regions,menuOpen,lookupDrag,lookupGrip};
  const key=dragKey||JSON.stringify(message);if(key!==last){last=key;repaint();try{window.__tomoyoTranslateRequest(JSON.stringify(message));}catch{}try{missDiag(regions.filter(r=>!r.pass));}catch{}}
 }
 new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','class','hidden','open','data-open','data-leaving','data-lookup-drag']});addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);document.addEventListener('transitionend',schedule,true);document.addEventListener('animationend',schedule,true);schedule();
})();
