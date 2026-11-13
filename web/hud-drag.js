/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Movable, resizable HUD blocks (2026-11-13, user: Anki 复习卡的字体、翻译、例句都能像游戏的 HUD 一样拖动).
   Same technique as the in-game Alt+T panel (reader/modules/menu-layout.js): the pointer is captured, the block
   follows with a GPU transform once per frame (coalesced events), and the final place is written once on release;
   eight edge/corner handles resize it. Positions are percentages of the stage, so the host page and the isolated card
   frame, which cover the same stage, share one layout.
   FF14-style editing (user 2026-11-13): free placement with smart snapping to other blocks' edges, centres and equal
   gaps (guides are drawn; Alt switches snapping off while held), or a grid.
   A block hugs its content: the content keeps its own proportions and is scaled to the block, and the block's frame is
   the content's box, so the frame, label and handles sit exactly on what is shown.
   Classic script: loaded by anki-card.html, imported for its side effect by anki-review.js, required by the tests. */
(function(root){
 'use strict';
 const EDGES=['n','s','e','w','nw','ne','sw','se'];
 const num=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
 const round=n=>Math.round(n*100)/100;
 function normRect(r,fallback,min){
  const f=fallback||{x:10,y:10,w:30,h:20},m=min||{w:4,h:3};
  const w=Math.min(100,Math.max(m.w,num(r?.w,f.w))),h=Math.min(100,Math.max(m.h,num(r?.h,f.h)));
  const x=Math.min(100-w,Math.max(0,num(r?.x,f.x))),y=Math.min(100-h,Math.max(0,num(r?.y,f.y)));
  const out={x:round(x),y:round(y),w:round(w),h:round(h)};const s=Number(r?.s);if(Number.isFinite(s)&&s>=.05&&s<=8)out.s=Math.round(s*1000)/1000;return out;
 }
 function mergeLayout(saved,defaults){
  const out={};for(const key of Object.keys(defaults))out[key]=normRect(saved&&saved[key],defaults[key]);return out;
 }
 function applyRect(el,r){el.style.left=r.x+'%';el.style.top=r.y+'%';el.style.width=r.w+'%';el.style.height=r.h+'%';}
 /* The frame a block shows for content of natural size nw x nh px on a SW x SH px stage. The scale is kept once known
    (r.s), so a longer sentence grows its box instead of shrinking its text; a fresh rect (just resized, or from a
    preset) is filled as far as the content's proportions allow. Never larger than the stage. */
 function hugRect(r,nw,nh,SW,SH,max=6){
  if(!(nw>0&&nh>0&&SW>0&&SH>0))return {rect:normRect(r,r),scale:1,fresh:false};
  const fresh=!Number.isFinite(r.s);let s=fresh?Math.min(r.w*SW/100/nw,r.h*SH/100/nh):r.s;s=Math.min(max,Math.max(.12,s));
  const shown=Math.min(s,SW*.99/nw,SH*.99/nh),w=nw*shown/SW*100,h=nh*shown/SH*100,cx=r.x+r.w/2,cy=r.y+r.h/2;
  const rect=normRect({x:cx-w/2,y:cy-h/2,w,h,s},r,{w:.3,h:.3});return {rect,scale:shown,fresh};
 }
 /* Snapping. r: the rect being placed (percent), others: rects of the other blocks, kind: 'move' or a resize edge.
    opts: {mode:'free'|'grid', grid:px, SW, SH, thr:px}. Returns the adjusted rect and the guides to draw. */
 function snapRect(r,others,kind,opts){
  const o=opts||{},SW=o.SW||1000,SH=o.SH||1000,out={...r},guides=[];
  const moveX=kind==='move'?['l','c','r']:['l','r'].filter(e=>kind.includes(e==='l'?'w':'e'));
  const moveY=kind==='move'?['t','m','b']:['t','b'].filter(e=>kind.includes(e==='t'?'n':'s'));
  if(o.mode==='grid'){
   const gx=Math.max(1,o.grid||24)/SW*100,gy=Math.max(1,o.grid||24)/SH*100,q=(v,g)=>Math.round(v/g)*g;
   if(kind==='move'){out.x=q(r.x,gx);out.y=q(r.y,gy);}
   else{if(moveX.includes('l')){const x=q(r.x,gx);out.w=r.w+(r.x-x);out.x=x;}if(moveX.includes('r'))out.w=q(r.x+r.w,gx)-out.x;
    if(moveY.includes('t')){const y=q(r.y,gy);out.h=r.h+(r.y-y);out.y=y;}if(moveY.includes('b'))out.h=q(r.y+r.h,gy)-out.y;}
   return {rect:normRect(out,r,{w:.5,h:.5}),guides};
  }
  const thrX=(o.thr||7)/SW*100,thrY=(o.thr||7)/SH*100;
  const axis=(dim)=>{
   const P=dim==='x'?['x','w']:['y','h'],[p,s]=P,keys=dim==='x'?moveX:moveY,thr=dim==='x'?thrX:thrY;
   const cands=[{v:0},{v:50,kind:'centre'},{v:100}];
   for(const b of others){cands.push({v:b[p]},{v:b[p]+b[s]},{v:b[p]+b[s]/2,kind:'centre'});}
   /* equal gaps between blocks that share a row (x) or a column (y) with the moving one */
   if(kind==='move'){const q=dim==='x'?'y':'x',qs=dim==='x'?'h':'w';
    const line=others.filter(b=>b[q]<r[q]+r[qs]&&b[q]+b[qs]>r[q]).sort((a,b)=>a[p]-b[p]);
    for(let i=0;i+1<line.length;i++){const A=line[i],B=line[i+1],gap=B[p]-(A[p]+A[s]);if(gap<=0)continue;
     cands.push({v:B[p]+B[s]+gap,edge:'start',kind:'gap',gap,from:B[p]+B[s]},{v:A[p]-gap,edge:'end',kind:'gap',gap,from:A[p]-gap});
     const mid=(A[p]+A[s]+B[p]-r[s])/2;if(mid>A[p]+A[s])cands.push({v:mid,edge:'start',kind:'gap',gap:mid-(A[p]+A[s]),from:A[p]+A[s]});}}
   let best=null;
   for(const k of keys){const at=k==='l'||k==='t'?r[p]:k==='c'||k==='m'?r[p]+r[s]/2:r[p]+r[s];
    for(const c of cands){if(c.edge==='start'&&!(k==='l'||k==='t'))continue;if(c.edge==='end'&&!(k==='r'||k==='b'))continue;
     const d=c.v-at;if(Math.abs(d)<=thr&&(!best||Math.abs(d)<Math.abs(best.d)))best={d,k,c};}}
   if(!best)return;
   if(kind==='move')out[p]=r[p]+best.d;
   else if(best.k==='l'||best.k==='t'){out[p]=r[p]+best.d;out[s]=r[s]-best.d;}else out[s]=r[s]+best.d;
   guides.push({axis:dim,at:round(best.c.v),kind:best.c.kind||'edge',...(best.c.kind==='gap'?{gap:round(best.c.gap)}:{})});
  };
  if(!o.off){axis('x');axis('y');}
  return {rect:normRect(out,r,{w:.5,h:.5}),guides};
 }
 /* Draw guides into a layer covering the stage */
 function drawGuides(layer,guides){
  if(!layer)return;layer.replaceChildren(...(guides||[]).map(g=>{const i=layer.ownerDocument.createElement('i');i.className='hud-guide hud-guide-'+g.axis+(g.kind==='centre'?' hud-guide-centre':g.kind==='gap'?' hud-guide-gap':'');
   if(g.axis==='x')i.style.left=g.at+'%';else i.style.top=g.at+'%';return i;}));
 }
 /* Moves (drag the body) and resizes (drag a handle) one block while editing() is true. onCommit gets the new rect.
    snap(rect,kind,altKey) may return {rect,guides}; guides(list) draws them. */
 function attach(el,{stage,rect,onCommit,editing,snap,guides}){
  if(!el||el.dataset.hudDrag)return;el.dataset.hudDrag='1';
  for(const edge of EDGES){const h=el.ownerDocument.createElement('i');h.className='hud-handle';h.dataset.edge=edge;h.setAttribute('aria-hidden','true');el.append(h);}
  el.addEventListener('pointerdown',down=>{
   if(down.button!==0||!editing())return;const handle=down.target.closest('.hud-handle'),edge=handle?.dataset.edge||'';
   if(!handle&&down.target.closest('input,select,textarea,summary'))return;
   down.preventDefault();down.stopPropagation();try{el.setPointerCapture(down.pointerId);}catch{}
   const box=stage().getBoundingClientRect(),start=normRect(rect()),sw=box.width/100,sh=box.height/100;let last=down,frame=0,next=start;
   el.classList.add(edge?'hud-resizing':'hud-dragging');
   const paint=()=>{frame=0;const dx=(last.clientX-down.clientX)/sw,dy=(last.clientY-down.clientY)/sh;let cand;
    if(!edge)cand=normRect({x:start.x+dx,y:start.y+dy,w:start.w,h:start.h},start,{w:.3,h:.3});
    else{let {x,y,w,h}=start;
     if(edge.includes('e'))w=start.w+dx;if(edge.includes('s'))h=start.h+dy;
     if(edge.includes('w')){w=Math.max(1,start.w-dx);x=start.x+start.w-w;}
     if(edge.includes('n')){h=Math.max(1,start.h-dy);y=start.y+start.h-h;}
     cand=normRect({x,y,w,h},start,{w:1,h:1});}
    const res=snap?snap(cand,edge||'move',!!last.altKey):null;next=res?.rect||cand;guides?.(res?.guides||[]);
    if(!edge)el.style.transform='translate3d('+((next.x-start.x)*sw)+'px,'+((next.y-start.y)*sh)+'px,0)';else applyRect(el,next);};
   const move=e=>{last=e.getCoalescedEvents?.().at(-1)||e;if(!frame)frame=requestAnimationFrame(paint);};
   const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);
    if(frame){cancelAnimationFrame(frame);paint();}guides?.([]);el.style.transform='';applyRect(el,next);el.classList.remove('hud-dragging','hud-resizing');
    el.classList.add('hud-settle');setTimeout(()=>el.classList.remove('hud-settle'),220);
    if(next.x!==start.x||next.y!==start.y||next.w!==start.w||next.h!==start.h){const r={x:next.x,y:next.y,w:next.w,h:next.h};
     /* a move keeps the scale; a resize asks for a new one */if(!edge&&Number.isFinite(start.s))r.s=start.s;onCommit(r);}};
   el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  });
  /* Keyboard: arrows move by 1% (Shift: resize, Alt: by .25%) while the block has focus in edit mode */
  el.addEventListener('keydown',e=>{if(!editing()||!/^Arrow/.test(e.key))return;e.preventDefault();const r={...rect()},d=e.altKey?.25:1;
   const dx=e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,dy=e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0;
   if(e.shiftKey){r.w+=dx;r.h+=dy;delete r.s;}else{r.x+=dx;r.y+=dy;}const n=normRect(r,rect(),{w:.3,h:.3});applyRect(el,n);onCommit(n);});
 }
 const api={normRect,mergeLayout,applyRect,hugRect,snapRect,drawGuides,attach,EDGES};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MeguHud=api;
})(globalThis);
