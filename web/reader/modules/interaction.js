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
  const cleanup=()=>{finished=true;clearInterval(timer);cancelAnimationFrame(frame);removeEventListener('tome-region-applied',receive);};
  const check=()=>{if(finished)return;if(!node.isConnected||node.hasAttribute('data-leaving')){cleanup();return;}
   if(!ack||frame)return;const scale=devicePixelRatio||1;if(Math.abs(innerWidth*scale-ack.surfaceWidth)>2||Math.abs(innerHeight*scale-ack.surfaceHeight)>2)return;
   const w=innerWidth,h=innerHeight;frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{frame=0;if(!finished&&node.isConnected&&!node.hasAttribute('data-leaving')&&w===innerWidth&&h===innerHeight){cleanup();ready();}});});
  };
  const receive=e=>{ack=e.detail;check();};addEventListener('tome-region-applied',receive);
  // Never wait forever: if the size acknowledgement does not arrive or never matches (DPI rounding, bridge restart),
  // the panel is shown after 700 ms anyway, as the former fixed fallback did.
  const started=Date.now(),timer=setInterval(()=>{check();if(finished)return;if(Date.now()-started>=maxWait){cleanup();if(node.isConnected&&!node.hasAttribute('data-leaving'))ready();return;}window.__tomoyoHitRegionsRefresh?.(true);},Math.min(150,Math.max(30,Math.floor(maxWait/2))));
  window.__tomoyoHitRegionsRefresh?.(true);
 };
 let queued=false,last='';const watched=new WeakSet(),resize=new ResizeObserver(schedule);
 const NODES='.sentence-text:not(.megulit-art-row) .char-token,.tome-page-lines>div,.tome-inline-wait,.tomoyo-cn-output,.tome-translation-char,.tomoyo-learning-notice,.tome-first-run,.lookup-tooltip,.tomoyo-selection-card,.tomoyo-cn-dialog[open],.tomoyo-cn-dialog[data-leaving],.tome-backlog[data-open],.tome-backlog[data-leaving],.tome-box-deco,.sentence-placeholder,.mg-select-pop,.tome-color-panel,body.tomoyo-ui-translation:not(.tomoyo-gal-bound) .sentence-window';
 /* The lookup card is a panel too (user, 2026-11-09: clicks inside it went through to the game and advanced the story):
    menu regions keep their clicks, text regions pass them to the game. */
 const MENUS='.tomoyo-cn-dialog,.tome-backlog,.mg-select-pop,.tome-color-panel,.tomoyo-selection-card';
 function schedule(){if(queued)return;queued=true;queueMicrotask(report);}
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
 // While the menu is dragged it moves by transform every frame; recomputing the window region per frame queues
 // SetWindowRgn calls the native side cannot keep up with (the panel is clipped mid-drag and keeps "moving" after
 // release). Hold one whole-layer region for the drag; release recomputes it from the real content.
 function report(){queued=false;if(document.querySelector('.tome-menu-dragging')){const scale=Number(devicePixelRatio)||1,regions=[{x:0,y:0,width:Math.ceil(innerWidth*scale),height:Math.ceil(innerHeight*scale),menu:true}],key=JSON.stringify({regions,menuOpen:true});if(key!==last){last=key;try{window.__tomoyoTranslateRequest(JSON.stringify({type:'galHitRegions',regions,menuOpen:true}));}catch{}}return;}const regions=[],scale=Number(devicePixelRatio)||1,bound=document.body?.classList.contains('tomoyo-gal-bound')||document.body?.classList.contains('tomoyo-ui-translation');
  const menuOpen=!!document.querySelector('.tomoyo-cn-dialog[open],.tomoyo-cn-dialog[data-leaving],.tome-backlog[data-open],.tome-backlog[data-leaving]');
  if(bound)for(const node of document.querySelectorAll(NODES)){if(!watched.has(node)){resize.observe(node);watched.add(node);}const style=getComputedStyle(node),isMenu=node.matches(MENUS);if(node.matches('.tomoyo-cn-output')&&node.querySelector('.tome-translation-char'))continue;const boxes=isMenu?[node.classList.contains('tomoyo-menu-resizing')||node.classList.contains('tome-dragging')?node.getBoundingClientRect():menuBox(node)]:textBoxes(node);for(const r of boxes){if(style.display==='none'||style.visibility==='hidden'||(!isMenu&&Number(style.opacity)===0&&!node.classList.contains('tome-typewriter-pending'))||!r.width||!r.height)continue;if(node.closest('[hidden]')||!node.getClientRects().length)continue;
   // The Windows region clips painting as well as clicks: include the furigana (a ::before above each token, outside its box) and the text outline.
   let top=r.top-(isMenu?0:6),side=isMenu?0:6;const sentence=node.closest('.sentence-text');
   if(sentence?.classList.contains('tomoyo-furigana')){const font=parseFloat(style.fontSize)||16,scale=parseFloat(getComputedStyle(sentence).getPropertyValue('--tomoyo-ruby-scale'))||.55,root=getComputedStyle(document.documentElement),offY=parseFloat(root.getPropertyValue('--tomoyo-ruby-offset-y'))||0,offX=parseFloat(root.getPropertyValue('--tomoyo-ruby-offset-x'))||0;top=r.top-font*(scale*1.3+.2)-Math.max(0,-offY)-4;side=Math.max(6,Math.abs(offX)+font*.6);}
   const x=Math.max(0,r.left-side),y=Math.max(0,top),right=Math.min(innerWidth,r.right+side),bottom=Math.min(innerHeight,r.bottom+(isMenu?0:6)+Math.max(0,sentence?.classList.contains('tomoyo-furigana')?(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tomoyo-ruby-offset-y'))||0):0));if(right>x&&bottom>y)regions.push({x:Math.floor(x*scale),y:Math.floor(y*scale),width:Math.ceil((right-x)*scale),height:Math.ceil((bottom-y)*scale),menu:isMenu});}}
  regions.sort((a,b)=>Number(a.menu)-Number(b.menu)||a.y-b.y||a.x-b.x);
  const merged=[];for(const r of regions){const p=merged.at(-1);if(p&&!p.menu&&!r.menu&&Math.abs(p.y-r.y)<=2&&Math.abs(p.height-r.height)<=2&&r.x<=p.x+p.width+2&&r.x+r.width>=p.x-2){/* Union on both sides: a region sorted first only by a 1px higher top (the moved wait marker) used to keep its left edge and drop the whole Japanese line left of it. */const top=Math.min(p.y,r.y),bottom=Math.max(p.y+p.height,r.y+r.height),left=Math.min(p.x,r.x);p.width=Math.max(p.x+p.width,r.x+r.width)-left;p.x=left;p.y=top;p.height=bottom-top;}else merged.push({...r});}regions.splice(0,regions.length,...compact(merged));/* E533: art-text translations are painted (window region) but pass the pointer to the game (pass): a title card or button under them stays clickable */if(bound)for(const node of document.querySelectorAll('.megulit-art-item .megulit-art-cn')){const r=node.getBoundingClientRect();if(!r.width||!r.height||regions.length>=250)continue;const x=Math.max(0,r.left-8),y=Math.max(0,r.top-6),right=Math.min(innerWidth,r.right+8),bottom=Math.min(innerHeight,r.bottom+6);if(right>x&&bottom>y)regions.push({x:Math.floor(x*scale),y:Math.floor(y*scale),width:Math.ceil((right-x)*scale),height:Math.ceil((bottom-y)*scale),menu:false,pass:true});}const key=JSON.stringify({regions,menuOpen});if(key!==last){last=key;repaint();try{window.__tomoyoTranslateRequest(JSON.stringify({type:'galHitRegions',regions,menuOpen}));}catch{}}
 }
 new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','class','hidden','open','data-open','data-leaving']});addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);schedule();
})();
