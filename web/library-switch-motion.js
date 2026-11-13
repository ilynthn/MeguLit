// E263: wall <-> simple list switch. Wall gathers to the centre and fades, the list then unrolls top-down like
// dominoes (and the reverse), each cover with a small pan-crop. Uses individual translate/scale so the wall's own
// positioning transforms are left alone.
import {warmGsap} from './gsap-loader.js';
import {syncMainKids} from './main-kids.js';
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const host=()=>document.querySelector('#library-results');
function visible(root){
 if(!root)return [];
 return [...root.querySelectorAll('.library-card')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;}).slice(0,120);
}
const cover=el=>el.querySelector('.cover-frame img,.cover-frame .cover');
const settle=list=>Promise.all(list.map(a=>a.finished.catch(()=>{})));
const centre=root=>{const b=root.getBoundingClientRect();const top=Math.max(b.top,0),bottom=Math.min(b.bottom,innerHeight);return [b.left+b.width/2,(top+bottom)/2];};
// warm the compositor once: the first switches were janky while animation and filter pipelines spun up
globalThis.requestIdleCallback?.(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;left:-9px;top:0;width:1px;height:1px;clip-path:inset(0);';document.body.append(d);d.animate([{translate:'0 0',scale:1,opacity:1,clipPath:'inset(0 0 0 0)'},{translate:'1px 1px',scale:.9,opacity:.5,clipPath:'inset(0 0 50% 0)'}],{duration:60}).finished.finally(()=>d.remove());});
let busy=false;const spots={};
// E275 (user: after fullscreen <-> windowed the capsule flew sideways first): remembered spots are window coordinates,
// so a resize makes them stale. Forget them; the next switch measures fresh and only the FLIP moves the capsule.
addEventListener('resize',()=>{delete spots.wall;delete spots.list;});
// the wall lays itself out around the search capsule; measure again once the capsule has stopped moving
const capsule=()=>document.querySelector('.field-search');
const remeasure=()=>dispatchEvent(new Event('megulit-field-measure'));
const vignette=(el,out)=>el?.animate(out?[{scale:'1 1',opacity:1},{scale:'1.7 1',opacity:0}]:[{scale:'1.7 1',opacity:0},{scale:'1 1',opacity:1}],{pseudoElement:'::after',duration:out?300:560,easing:out?'cubic-bezier(.55,0,.75,.2)':'cubic-bezier(.2,.8,.2,1)',fill:out?'forwards':'backwards'});
export const isBusy=()=>busy;
/* 2026-11-13 option v2 "camera through planes" (CS mode): an AE 3D camera move through layered planes.
   The old view flies past the lens as one plane (scale 1 -> 1.12 on an accelerating in, 160 ms, then drifting on). It is the live, already
   rastered results layer, so the compositor moves it from the very first frame and keeps moving it while the main
   thread builds the new view; it stays bright (an object passing the lens, not a dissolve), so a slow build can never leave an empty or muddy frame. On the commit
   that carries the new view the camera cuts hard (no cross-dissolve): the new plane arrives from depth (scale .9 -> 1, expo-out, 420 ms or what is left of a 600 ms budget), the capsule's ring is there on the cut and the
   outer covers wash in ring by ring from the capsule outwards (24 ms a ring). (2026-11-14: the blueprint HUD beat with the view's running number is gone: no numbering in the UI, and appending it to #main
   restyled the whole page in the cut frame.)
   Reads are batched before writes; every move is transform/opacity only (WAAPI for the planes so they run on the
   compositor). */
const FLY=200,ARRIVE=420,BUDGET=600,RING=16,RINGS=5,CARD=340,LIGHT=240,FLOOR=.7; /* 2026-11-13 (user recording, drift -> wall: 铺满的时候有几个地方卡): outer rings started near 0 and came up in 100 ms, which read as covers popping in at the edges; they now start at least 35% lit and rise over 240 ms */
const EXPO_OUT='cubic-bezier(.16,1,.3,1)',FLY_IN='cubic-bezier(.35,0,.75,.45)'; /* an accelerating in that already reads in the first 100 ms, before the cut */
warmGsap();
/* keep the results host on its own compositor layer, so the fly-past starts on the click's first frame instead of
   waiting for the whole view to be re-rastered as a new layer */
const promote=()=>{const h=host();if(h&&h.style.willChange!=='transform, opacity')h.style.willChange='transform, opacity';};
globalThis.requestIdleCallback?.(promote);
/* one batch of reads: every visible card, the element that carries its own placement (wall cell, orbit slot or the
   card itself) and its offset from the vanishing point. Rects come from the outer slot: in the grid that slot is the
   content-visibility box, and measuring a card inside an off-screen one unlocked and laid it out (140 ms for 60) */
function cells(root,vx,vy){const out=[];if(!root)return out;
 for(const el of root.querySelectorAll('.library-card')){if(el.closest('[data-parked]'))continue;const r=(el.closest('mg-cell,.field-plane > *,.library-grid > *')||el).getBoundingClientRect();
  if(!r.width||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)continue;const dx=r.left+r.width/2-vx,dy=r.top+r.height/2-vy;
  out.push({node:el.closest('mg-cell,.field-plane > *')||el,dx,dy,h:Math.hypot(dx,dy)});if(out.length>=160)break;}
 return out;}
export async function switchLibrary(view,render,from=''){
 if(busy)return;busy=true;const toWall=view!=='list',t0=performance.now();
 try{
  const root=host();
  if(!root||reduce()){render();if(toWall)remeasure();return;}
  /* reads (old plane) */
  const cap0=capsule()?.getBoundingClientRect(),b0=root.getBoundingClientRect();
  const [ox,oy]=cap0?[cap0.left+cap0.width/2,cap0.top+cap0.height/2]:centre(root);
  /* writes: the old plane flies past the lens around the capsule */
  root.style.transformOrigin=`${ox-b0.left}px ${oy-b0.top}px`;
  /* 160 ms to 1.12, then a slow drift on toward the lens, so a long build never freezes the frame before the cut */
  const fly=root.animate([{scale:1,easing:FLY_IN},{scale:1.12,offset:.4},{scale:1.17}],{duration:FLY*2,fill:'forwards'});
  const dim=root.animate([{opacity:1,easing:'cubic-bezier(.5,0,.9,.5)'},{opacity:FLOOR,offset:.4},{opacity:FLOOR*.8}],{duration:FLY*2,fill:'forwards'});
  /* wait until the fly-past runs on the compositor (rAF alone can run ahead of the commit), so it keeps playing
     through the render below */
  await Promise.race([fly.ready,new Promise(r=>setTimeout(r,48))]);await new Promise(r=>requestAnimationFrame(r));
  const cap=capsule();if(cap)cap.style.transition='none';
  /* the cut: the fly-past ends in the same task as the render, so the screen keeps the flying plane until the commit that
     carries the new view, and the wall measures itself against an untransformed host */
  fly.cancel();dim.cancel();root.style.transformOrigin='';
  /* 2026-11-14 (CDP trace, tracks -> wall 190-290 ms): main-kids.js mirrors #main's children onto body from a MutationObserver,
     which ran after this task's layout and restyled the whole page a second time (~2900 elements, 65-80 ms) in the same frame;
     syncing here lets the one forced layout below see the final attributes */
  window.__megulitOrbitWarm=true;render();syncMainKids(document.getElementById('main'));if(toWall)remeasure();
  /* reads (new plane), still in the same task, so the cut and the arrival reach the screen in one commit */
  const next=host(),cap1=capsule()?.getBoundingClientRect();
  const [nx,ny]=cap1?[cap1.left+cap1.width/2,cap1.top+cap1.height/2]:[ox,oy];
  const b1=next?.getBoundingClientRect(),fresh=next?cells(next,nx,ny):[],far=Math.max(1,...fresh.map(c=>c.h));
  /* a slow build eats into the arrival, never into the 600 ms budget (the arrival keeps at least 300 ms) */
  const arrive=Math.round(Math.max(300,Math.min(ARRIVE,BUDGET-(performance.now()-t0)))),card=arrive-(ARRIVE-CARD);
  /* writes: cut. Capsule glides into the frame, the new plane arrives from depth, rings wash in */
  const now=capsule(),runs=[];
  if(now&&cap0&&cap1){const dx=ox-nx,dy=oy-ny;
   if(Math.abs(dx)+Math.abs(dy)>1)runs.push(now.animate([{translate:`${dx}px ${dy}px`},{translate:'0 0'}],{duration:arrive,easing:EXPO_OUT}).finished.catch(()=>{}).finally(()=>{now.style.transition='';if(toWall)remeasure();}));
   else now.style.transition='';}
  if(next){next.style.transformOrigin=`${nx-b1.left}px ${ny-b1.top}px`;
   runs.push(next.animate([{scale:.9},{scale:1}],{duration:arrive,easing:EXPO_OUT}).finished.catch(()=>{}));
   for(const c of fresh){const ring=Math.min(RINGS,Math.floor(c.h/far*(RINGS+1))),pull=.08+ring*.012;
    const o=c.node.style.opacity||1,delay=ring*RING;
    /* opacity lands fast (no muddy half-lit covers), the push toward the lens runs the full expo-out */
    c.node.animate([{opacity:Math.max(.35,1-ring*.13)*o},{opacity:o}],{duration:LIGHT,delay,easing:'cubic-bezier(.25,.1,.25,1)',fill:'backwards'});
    c.node.animate([{translate:`${-c.dx*pull}px ${-c.dy*pull}px`},{translate:'0px 0px'}],{duration:card,delay,easing:EXPO_OUT,fill:'backwards'});}}
  /* safety net: measure once more after everything has settled (layout-based, so it never re-seats the wall) */
  if(toWall)setTimeout(remeasure,760);
  await Promise.race([Promise.all(runs),new Promise(r=>setTimeout(r,arrive+80))]);
  if(next)next.style.transformOrigin='';
 }finally{busy=false;window.__megulitOrbitWarm=false;promote();const h=host();h?.classList.remove('lib-entering');h?.getAnimations().forEach(a=>{if(a.playState!=='running')a.cancel();});}
}


/* v1.1.6 (user: switching back to the wall, and opening the library, must gather from the outside in, not spread out
   from the centre): cards start further out from the centre, a little larger and transparent, and settle inward; the
   outer ring arrives first. Also played when the library opens straight into the wall. */
export function wallIn(next,incoming=next?[...next.querySelectorAll('.library-card')].filter(el=>!el.closest('[data-parked]')).slice(0,400):[]){
 if(!next||!incoming.length||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const [cx,cy]=centre(next);let far=1;const d=incoming.map(el=>{const r=el.getBoundingClientRect(),dx=(r.left+r.width/2)-cx,dy=(r.top+r.height/2)-cy,h=Math.hypot(dx,dy);far=Math.max(far,h);return {el,dx,dy,h};});
 for(const {el,dx,dy,h} of d){const delay=Math.round((1-h/far)*240);
  /* 2026-11-13 (user: the wall still hitched when dragged right after opening): on the wall each cover's <mg-cell> is
     already a compositor layer, so the entrance plays on it (an individual translate composes with the wall's inline
     transform; a scale there would also scale that transform's offset, so the cell only glides and fades, and the
     cover inside keeps its own zoom). Animating the inner card promoted a layer per card for the entrance and
     repainted every cover when those layers dropped at the end. */
  const cell=el.closest('mg-cell');
  if(cell)cell.animate([{translate:`${dx*.32}px ${dy*.32}px`,opacity:0},{translate:'0 0',opacity:cell.style.opacity||'1'}],{duration:520,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
  else el.animate([{translate:`${dx*.32}px ${dy*.32}px`,scale:1.12,opacity:0},{translate:'0 0',scale:1,opacity:1}],{duration:520,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
  cover(el)?.animate([{scale:1.16,translate:`${(dx/Math.max(1,h))*-4}% ${(dy/Math.max(1,h))*-4}%`},{scale:1,translate:'0 0'}],{duration:720,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});}
}
