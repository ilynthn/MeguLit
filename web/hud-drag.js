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
  const out={x:round(x),y:round(y),w:round(w),h:round(h)};const s=Number(r?.s);if(Number.isFinite(s)&&s>=.05&&s<=8)out.s=Math.round(s*1000)/1000;
  /* framing of a cropped picture inside its frame: focus point (percent) and zoom */
  for(const k of ['fx','fy']){const v=Number(r?.[k]);if(Number.isFinite(v))out[k]=round(Math.min(100,Math.max(0,v)));}
  const z=Number(r?.z);if(Number.isFinite(z)&&z>1)out.z=Math.round(Math.min(4,z)*100)/100;return out;
 }
 function mergeLayout(saved,defaults){
  const out={};for(const key of Object.keys(defaults))out[key]=normRect(saved&&saved[key],defaults[key]);return out;
 }
 function applyRect(el,r){el.style.left=r.x+'%';el.style.top=r.y+'%';el.style.width=r.w+'%';el.style.height=r.h+'%';}
 /* The frame a block shows for content of natural size nw x nh px on a SW x SH px stage.
    (user 2026-11-14: the example dropped under 下一张 after 显示答案) The saved box is the single source of truth: the
    frame is always exactly that box, on every card and in both the question and answer state. The content keeps its
    scale (r.s) and is shrunk to fit when it is taller or wider than the box (furigana + translation after the reveal);
    it sits at the top of the box, centred across (ox/oy: px offsets inside the frame). A fresh box (just resized, or a
    preset) starts at scale 1, the size set in 外观, so a size never depends on which card was on screen. */
 function hugRect(r,nw,nh,SW,SH,max=6,room){
  const box=normRect(r,r,{w:.3,h:.3});
  if(!(nw>0&&nh>0&&SW>0&&SH>0))return {rect:box,scale:1,fresh:false,ox:0,oy:0};
  const bw=box.w*SW/100,fresh=!Number.isFinite(r.s);
  let s=fresh?1:r.s;s=Math.min(max,Math.max(.12,s));box.s=Math.round(s*1000)/1000;
  /* room: how far (percent of the stage) the content may run below the box top before it has to shrink: the free
     space down to the next block or the buttons, so a long definition wraps at the same size instead of shrinking */
  const roomH=Math.max(box.h,Math.min(100-box.y,Number.isFinite(room)?room:box.h))*SH/100;
  const shown=Math.max(.05,Math.min(s,bw/nw,roomH/nh));
  const ox=Math.round(Math.max(0,(bw-nw*shown)/2));
  /* frame: the content's real box (what the edit outline shows and what is dragged); rect stays the saved slot */
  const frame={x:Math.round((box.x+ox/SW*100)*100)/100,y:box.y,w:Math.round(nw*shown/SW*10000)/100,h:Math.round(nh*shown/SH*10000)/100,s:box.s};
  return {rect:box,frame,scale:shown,fresh,ox,oy:0};
 }
 /* (user 2026-11-14) A drag or resize of the frame (the content's box) moves / resizes the saved slot by the same
    amount, so the slot never collapses onto one card's content; the scale comes from the frame (a corner sets it). */
 function carry(saved,from,to){const s=saved||to,f=from||s,out={x:s.x+(to.x-f.x),y:s.y+(to.y-f.y),w:Math.max(1,s.w+(to.w-f.w)),h:Math.max(1,s.h+(to.h-f.h))};
  if(Number.isFinite(to.s))out.s=to.s;else if(Number.isFinite(s.s))out.s=s.s;for(const k of ['fx','fy','z'])if(s[k]!==undefined)out[k]=s[k];return normRect(out,s,{w:.3,h:.3});}
 /* Free space under a box: the top of the nearest rect below it that shares some of its width, else the stage
    bottom (percent). Used as hugRect's room. */
 function roomBelow(r,others,gap=1){let bottom=100;for(const o of others||[]){if(!o||o===r)continue;
  if(o.x<r.x+r.w-.01&&r.x<o.x+o.w-.01&&o.y>=r.y+r.h-.5)bottom=Math.min(bottom,o.y-gap);}return Math.max(r.h,bottom-r.y);}
 /* (user 2026-11-14: the reading was missing on some cards) The reading of a word from the furigana of its own
    example sentence (the game's ruby): kanji runs are read from ruby bases, kana are kept. '' when any kanji is
    not covered, so nothing is guessed. Katakana readings become hiragana. */
 function rubyReading(word,html){
  const pairs=[],kanji=/[\u3400-\u9fff\u3005\u3006\u30f6]/,w=String(word||'').replace(/\s+/g,'');if(!kanji.test(w))return '';
  String(html||'').replace(/<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi,(m,inner)=>{const rt=(inner.match(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi)||[]).map(x=>x.replace(/<[^>]*>/g,'')).join('').trim();
   const base=inner.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>|<rp\b[^>]*>[\s\S]*?<\/rp>/gi,'').replace(/<[^>]*>/g,'').trim();if(base&&rt)pairs.push([base,rt]);return m;});
  let out='',i=0;while(i<w.length){let best=null;for(const p of pairs)if(w.startsWith(p[0],i)&&(!best||p[0].length>best[0].length))best=p;
   if(best){out+=best[1];i+=best[0].length;continue;}if(kanji.test(w[i]))return '';out+=w[i];i++;}
  return out.replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
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
 function attach(el,{stage,rect,onCommit,editing,snap,guides,ratio,onActive}){
  if(!el||el.dataset.hudDrag)return;el.dataset.hudDrag='1';
  for(const edge of EDGES){const h=el.ownerDocument.createElement('i');h.className='hud-handle';h.dataset.edge=edge;h.setAttribute('aria-hidden','true');el.append(h);}
  el.addEventListener('pointerdown',down=>{
   if(down.button!==0||!editing())return;const handle=down.target.closest('.hud-handle'),edge=handle?.dataset.edge||'';
   if(!handle&&down.target.closest('input,select,textarea,summary'))return;
   down.preventDefault();down.stopPropagation();try{el.setPointerCapture(down.pointerId);}catch{}
   const box=stage().getBoundingClientRect(),start=normRect(rect()),sw=box.width/100,sh=box.height/100;let last=down,frame=0,next=start;
   el.classList.add(edge?'hud-resizing':'hud-dragging');onActive?.(true);
   const paint=()=>{frame=0;const dx=(last.clientX-down.clientX)/sw,dy=(last.clientY-down.clientY)/sh;let cand;
    if(!edge)cand=normRect({x:start.x+dx,y:start.y+dy,w:start.w,h:start.h},start,{w:.3,h:.3});
    else{let {x,y,w,h}=start;
     if(edge.includes('e'))w=start.w+dx;if(edge.includes('s'))h=start.h+dy;
     if(edge.includes('w')){w=Math.max(1,start.w-dx);x=start.x+start.w-w;}
     if(edge.includes('n')){h=Math.max(1,start.h-dy);y=start.y+start.h-h;}
     /* ratio blocks (the screenshot): edges change one side, corners scale freely, Shift keeps the proportions */
     if(ratio&&edge.length===2&&last.shiftKey){const k=Math.max(w/start.w,h/start.h);w=start.w*k;h=start.h*k;
      if(edge.includes('w'))x=start.x+start.w-w;if(edge.includes('n'))y=start.y+start.h-h;}
     cand=normRect({x,y,w,h},start,{w:1,h:1});}
    const res=snap?snap(cand,edge||'move',!!last.altKey):null;next=res?.rect||cand;guides?.(res?.guides||[]);
    if(!edge)el.style.transform='translate3d('+((next.x-start.x)*sw)+'px,'+((next.y-start.y)*sh)+'px,0)';else applyRect(el,next);};
   const move=e=>{last=e.getCoalescedEvents?.().at(-1)||e;if(!frame)frame=requestAnimationFrame(paint);};
   const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);
    if(frame){cancelAnimationFrame(frame);paint();}guides?.([]);el.style.transform='';applyRect(el,next);el.classList.remove('hud-dragging','hud-resizing');onActive?.(false);
    el.classList.add('hud-settle');setTimeout(()=>el.classList.remove('hud-settle'),220);
    if(next.x!==start.x||next.y!==start.y||next.w!==start.w||next.h!==start.h){const r={x:next.x,y:next.y,w:next.w,h:next.h};for(const k of ['fx','fy','z'])if(start[k]!==undefined)r[k]=start[k];
     /* (user 2026-11-14) the scale is the block's text size, set by the user and never derived from a card's content:
        a move or a side edge keeps it (a side only re-wraps), a corner scales it with the box */
     const s0=Number.isFinite(start.s)?start.s:1;r.s=edge.length===2?Math.round(Math.min(6,Math.max(.12,s0*next.h/start.h))*1000)/1000:s0;onCommit(r,start);}};
   el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  });
  /* Keyboard: arrows move by 1% (Shift: resize, Alt: by .25%) while the block has focus in edit mode */
  el.addEventListener('keydown',e=>{if(!editing()||!/^Arrow/.test(e.key))return;e.preventDefault();const r={...rect()},from={...r},d=e.altKey?.25:1;
   const dx=e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,dy=e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0;
   if(e.shiftKey){r.w+=dx;r.h+=dy;}else{r.x+=dx;r.y+=dy;}const n=normRect(r,rect(),{w:.3,h:.3});applyRect(el,n);onCommit(n,from);});
 }
 /* Cover framing: how far (px) the picture overflows its frame on each axis, so a drag of d px moves the focus by d/over */
 function coverOverflow(nw,nh,bw,bh,z){const k=Math.max(bw/nw,bh/nh)*(z||1);return {x:Math.max(0,nw*k-bw),y:Math.max(0,nh*k-bh)};}
 /* (user 2026-11-13: a long example ran under the screenshot) No overlaps: blocks (id->rect, percent) are taken top to
    bottom; a text block that runs into one above it moves down, the picture (flex) gives up its top or bottom instead.
    obstacles never move. Returns {rects, nudged:[ids]}. Only the frames shown change, never the saved layout. */
 function settle(blocks,obstacles,flex,gap=1,minH=8){
  const over=(a,b)=>a.x<b.x+b.w-.01&&b.x<a.x+a.w-.01,vert=(a,b)=>a.y<b.y+b.h+gap-.01&&b.y<a.y+a.h+gap-.01,out={},nudged=new Set();
  const ids=Object.keys(blocks).sort((a,b)=>blocks[a].y-blocks[b].y||(a===flex)-(b===flex));
  const placed=(obstacles||[]).map(r=>({r,fixed:true}));
  for(const id of ids){const r={...blocks[id]};
   for(let pass=0;pass<8;pass++){let hit=null;
    for(const p of placed){const o=p.r;if(!over(r,o)||!vert(r,o))continue;
     /* what starts above (a moved block: above its middle) pushes this one down; a fixed one below is left to the end */
     if(o.y<=r.y+.01||(!p.fixed&&o.y<r.y+r.h/2)){if(!hit||o.y+o.h>hit.y+hit.h)hit=o;}}
    if(!hit)break;const top=hit.y+hit.h+gap;
    if(id===flex){r.h=Math.max(minH,r.y+r.h-top);r.y=top;}else r.y=top;nudged.add(id);}
   if(r.y+r.h>100){if(id===flex)r.h=Math.max(minH,100-r.y);else r.y=Math.max(0,100-r.h);}
   out[id]=r;placed.push({r});}
  /* the picture also ends before anything below it */
  if(out[flex]){const s=out[flex];for(const o of [...(obstacles||[]),...Object.entries(out).filter(([k])=>k!==flex).map(([,v])=>v)]){
   if(over(s,o)&&o.y>s.y+.01&&o.y<s.y+s.h+gap-.01){s.h=Math.max(minH,o.y-gap-s.y);nudged.add(flex);}}}
  for(const k of Object.keys(out))out[k]=normRect(out[k],out[k],{w:.3,h:.3});
  return {rects:out,nudged:[...nudged]};
 }
 const api={coverOverflow,settle,normRect,mergeLayout,applyRect,hugRect,carry,roomBelow,rubyReading,snapRect,drawGuides,attach,EDGES};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MeguHud=api;
})(globalThis);
