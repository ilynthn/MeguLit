/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Movable, resizable HUD blocks (2026-11-13, user: Anki 复习卡的字体、翻译、例句都能像游戏的 HUD 一样拖动).
   Same technique as the in-game Alt+T panel (reader/modules/menu-layout.js): the pointer is captured, the block
   follows with a GPU transform once per frame (coalesced events), and the final place is written once on release;
   eight edge/corner handles resize it. Positions are percentages of the stage, so the host page and the isolated card
   frame, which cover the same stage, share one layout. Classic script: loaded by anki-card.html, imported for its side
   effect by anki-review.js, and required by the tests. */
(function(root){
 'use strict';
 const EDGES=['n','s','e','w','nw','ne','sw','se'];
 const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
 function normRect(r,fallback,min){
  const f=fallback||{x:10,y:10,w:30,h:20},m=min||{w:4,h:3};
  let w=Math.min(100,Math.max(m.w,num(r?.w,f.w))),h=Math.min(100,Math.max(m.h,num(r?.h,f.h)));
  const x=Math.min(100-w,Math.max(0,num(r?.x,f.x))),y=Math.min(100-h,Math.max(0,num(r?.y,f.y)));
  const round=n=>Math.round(n*100)/100;return {x:round(x),y:round(y),w:round(w),h:round(h)};
 }
 function mergeLayout(saved,defaults){
  const out={};for(const key of Object.keys(defaults))out[key]=normRect(saved&&saved[key],defaults[key]);return out;
 }
 function applyRect(el,r){el.style.left=r.x+'%';el.style.top=r.y+'%';el.style.width=r.w+'%';el.style.height=r.h+'%';}
 /* Moves (drag the body) and resizes (drag a handle) one block while editing() is true. onCommit gets the new rect. */
 function attach(el,{stage,rect,onCommit,editing}){
  if(!el||el.dataset.hudDrag)return;el.dataset.hudDrag='1';
  for(const edge of EDGES){const h=el.ownerDocument.createElement('i');h.className='hud-handle';h.dataset.edge=edge;h.setAttribute('aria-hidden','true');el.append(h);}
  el.addEventListener('pointerdown',down=>{
   if(down.button!==0||!editing())return;const handle=down.target.closest('.hud-handle'),edge=handle?.dataset.edge||'';
   if(!handle&&down.target.closest('input,select,textarea,summary'))return;
   down.preventDefault();down.stopPropagation();try{el.setPointerCapture(down.pointerId);}catch{}
   const box=stage().getBoundingClientRect(),start=rect(),sw=box.width/100,sh=box.height/100;let last=down,frame=0,next=start;
   el.classList.add(edge?'hud-resizing':'hud-dragging');
   const paint=()=>{frame=0;const dx=(last.clientX-down.clientX)/sw,dy=(last.clientY-down.clientY)/sh;
    if(!edge){next=normRect({x:start.x+dx,y:start.y+dy,w:start.w,h:start.h},start);
     el.style.transform='translate3d('+((next.x-start.x)*sw)+'px,'+((next.y-start.y)*sh)+'px,0)';return;}
    let {x,y,w,h}=start;
    if(edge.includes('e'))w=start.w+dx;if(edge.includes('s'))h=start.h+dy;
    if(edge.includes('w')){w=Math.max(4,start.w-dx);x=start.x+start.w-w;}
    if(edge.includes('n')){h=Math.max(3,start.h-dy);y=start.y+start.h-h;}
    next=normRect({x,y,w,h},start);applyRect(el,next);};
   const move=e=>{last=e.getCoalescedEvents?.().at(-1)||e;if(!frame)frame=requestAnimationFrame(paint);};
   const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);
    if(frame){cancelAnimationFrame(frame);paint();}el.style.transform='';applyRect(el,next);el.classList.remove('hud-dragging','hud-resizing');
    el.classList.add('hud-settle');setTimeout(()=>el.classList.remove('hud-settle'),220);
    if(next.x!==start.x||next.y!==start.y||next.w!==start.w||next.h!==start.h)onCommit(next);};
   el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  });
  /* Keyboard: arrows move by 1% (Shift: resize) while the block has focus in edit mode */
  el.addEventListener('keydown',e=>{if(!editing()||!/^Arrow/.test(e.key))return;e.preventDefault();const r={...rect()},d=e.altKey?.25:1;
   const dx=e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,dy=e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0;
   if(e.shiftKey){r.w+=dx;r.h+=dy;}else{r.x+=dx;r.y+=dy;}const n=normRect(r,rect());applyRect(el,n);onCommit(n);});
 }
 const api={normRect,mergeLayout,applyRect,attach,EDGES};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MeguHud=api;
})(globalThis);
