/* Library multi-select motion, "Blueprint" (2026-11-13).
   GSAP timelines for the choreography (enter wave, bar push, create-collection stack), WAAPI for single micro moves.
   Transform/opacity only. Every function reads layout first, then calls the caller's DOM change, then writes tweens. */
import {loadGsap,warmGsap} from './gsap-loader.js';

const EXPO='expo.out';
const EXPO_CSS='cubic-bezier(.16,1,.3,1)';
const WAVE_STEP=.03;          /* 30 ms per diagonal step of the grid */
const TICK_IN=.34;
const BAR_IN=.5;
const EXIT=.16;               /* leaving is faster than entering */
const FLY=.46;
const FLY_STAGGER=.03;
const TRAVEL=.36;
const STACK_W=104;
const STACK_MAX=8;
const TILTS=[-4,5,-6,3.5,-3,6,-5,4];

const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let busy=false;
export const isBusy=()=>busy;
const setBusy=on=>{busy=on;window.__bpBusy=on;};
if(typeof window!=="undefined")warmGsap();

export function prepare(){return calm()?Promise.resolve(null):loadGsap().catch(()=>null);}

const inView=(r,v)=>r.bottom>v.top&&r.top<v.bottom&&r.right>v.left&&r.left<v.right&&r.width>0;

/* grid position of each visible card, as a diagonal index for the wave */
function diagonals(rects){
 const xs=[...new Set(rects.map(r=>Math.round(r.left)))].sort((a,b)=>a-b),ys=[...new Set(rects.map(r=>Math.round(r.top)))].sort((a,b)=>a-b);
 return rects.map(r=>xs.indexOf(Math.round(r.left))+ys.indexOf(Math.round(r.top)));
}

function visibleCards(grid){
 const view=grid.getBoundingClientRect(),cards=[...grid.querySelectorAll(':scope>.series-game')],rects=cards.map(c=>c.getBoundingClientRect());
 const keep=cards.map((c,i)=>inView(rects[i],view));
 return {view,cards:cards.filter((c,i)=>keep[i]),rects:rects.filter((r,i)=>keep[i])};
}

/* enter: apply() toggles the classes; the ticks snap in as a diagonal wave and the bar pushes up */
export async function enter(root,apply){
 const gsap=await prepare(),grid=root.querySelector('.library-grid');
 if(!gsap||!grid){apply();return;}
 const {cards,rects}=visibleCards(grid),steps=diagonals(rects);
 apply();
 setBusy(true);
 const bar=root.querySelector('.bp-bar'),ticks=cards.map(c=>c.querySelector('.bp-ticks'));
 /* the tick wave is one compositor animation per card (WAAPI needs no style reads; GSAP would read each tick's
    computed transform right after writing the previous one, a forced style pass per card) */
 ticks.forEach((t,i)=>t?.animate([{opacity:0,transform:'scale(1.16)'},{opacity:1,transform:'none'}],{duration:TICK_IN*1000,delay:steps[i]*WAVE_STEP*1000,easing:EXPO_CSS,fill:'backwards'}));
 /* the bar is the GSAP timeline; its CSS transitions would restart on every GSAP write, so they are off for the run */
 const parts=barParts(bar);gsap.set(parts,{transition:'none'});
 const tl=gsap.timeline({defaults:{ease:EXPO},onComplete:()=>{gsap.set(parts,{clearProps:'transform,opacity,transition'});setBusy(false);}});
 barIn(tl,bar,.04);
 tl.to({},{duration:Math.max(0,(Math.max(0,...steps)*WAVE_STEP+TICK_IN)-tl.duration())});
 return tl;
}

function barParts(bar){return bar?[bar,bar.querySelector('.bp-rule'),bar.querySelector('.bp-count'),...bar.querySelectorAll('.bp-tagline,.bp-create,.bp-cancel')].filter(Boolean):[];}

function barIn(tl,bar,at){
 if(!bar)return;
 tl.fromTo(bar,{yPercent:150,opacity:0},{yPercent:0,opacity:1,duration:BAR_IN,ease:EXPO},at)
  .fromTo(bar.querySelector('.bp-rule'),{scaleX:0,transformOrigin:'0 50%'},{scaleX:1,duration:.42},at+.1)
  .fromTo(bar.querySelector('.bp-count'),{yPercent:70,opacity:0},{yPercent:0,opacity:1,duration:.4},at+.12)
  .fromTo(bar.querySelectorAll('.bp-tagline,.bp-create,.bp-cancel'),{x:14,opacity:0},{x:0,opacity:1,duration:.38,stagger:.04},at+.14);
}

/* leave: marks and bar go first (fast), then apply() drops the classes */
export async function leave(root,apply){
 const gsap=await prepare(),grid=root.querySelector('.library-grid');
 if(!gsap||!grid){apply();return;}
 const {cards}=visibleCards(grid),marks=cards.map(c=>c.querySelector('.bp-sel')).filter(Boolean),bar=root.querySelector('.bp-bar');
 setBusy(true);
 await gsap.timeline({defaults:{ease:'power3.in'}})
  .to(marks,{opacity:0,duration:EXIT*.8,ease:'power2.in'},0)
  .to(bar,{yPercent:140,opacity:0,duration:EXIT+.04},0);
 apply();
 gsap.set(marks,{clearProps:'opacity'});
 setBusy(false);
}

/* one card toggled: CSS draws the frame and pops the tag; picking adds a two-frame accent invert on the tag */
export function toggle(node,on){
 if(!on||calm())return;
 node.querySelector('.bp-box')?.animate([{scale:1.18},{scale:1}],{duration:200,easing:'cubic-bezier(.16,1,.3,1)'});
}

/* the big numeral rolls: up when the count grows, down when it shrinks */
export function count(bar,n,before){
 const box=bar?.querySelector('.bp-count');if(!box)return;
 const text=String(n),current=box.querySelector('span:not([data-out])');
 if(current?.textContent===text)return;
 box.querySelectorAll('[data-out]').forEach(s=>s.remove());
 const next=document.createElement('span');next.textContent=text;box.append(next);
 if(!current)return;
 if(calm()){current.remove();return;}
 const dir=n>before?1:-1;current.dataset.out='1';
 current.animate([{transform:'none',opacity:1},{transform:`translateY(${-dir*100}%)`,opacity:0}],{duration:240,easing:EXPO_CSS,fill:'forwards'}).finished.then(()=>current.remove(),()=>current.remove());
 next.animate([{transform:`translateY(${dir*100}%)`},{transform:'none'}],{duration:320,easing:EXPO_CSS});
}

/* the bar swaps its actions for the inline name field: a short push from the right, no layout animation */
export function naming(bar,on){if(calm()||!bar)return;const group=bar.querySelector(on?'.bp-name':'.bp-actions');if(!group)return;
 [...group.children].forEach((el,i)=>el.animate([{transform:'translateX(14px)',opacity:0},{transform:'none',opacity:1}],{duration:300,delay:i*35,easing:EXPO_CSS,fill:'backwards'}));}

/* create button arms when the second cover is picked */
export function arm(button){if(!calm())button?.animate([{transform:'scale(1.08)'},{transform:'none'}],{duration:260,easing:EXPO_CSS});}

/* FLIP: apply() changes the grid; cards that stay slide from where they were, new ones fade in. Reads, then writes. */
export function flip(grid,apply,{gsap=window.gsap,duration=.42}={}){
 const view=grid.getBoundingClientRect(),before=new Map();
 for(const n of grid.children){const r=n.getBoundingClientRect();if(inView(r,view))before.set(n,r);}
 const result=apply();
 if(!gsap||calm())return result;
 const moves=[],fresh=[];
 for(const n of grid.children){const r=n.getBoundingClientRect(),b=before.get(n);
  if(b){const dx=b.left-r.left,dy=b.top-r.top;if(Math.abs(dx)>.5||Math.abs(dy)>.5)moves.push([n,dx,dy]);}
  else if(inView(r,view)&&!n.hasAttribute('data-bp-hold'))fresh.push(n);}
 moves.forEach(([n,x,y])=>gsap.fromTo(n,{x,y},{x:0,y:0,duration,ease:EXPO,clearProps:'transform'}));
 if(fresh.length)gsap.fromTo(fresh,{opacity:0},{opacity:1,duration:.22,ease:'none',clearProps:'opacity'});
 return result;
}

/* create collection, one continuous timeline (about 1.05 s, a click anywhere skips to the end).
   t=0: the grid changes in one cut: the picked cards leave the mode as collection members and a placeholder collection card
        takes its slot (apply() returns it); their covers are cloned at the old spots first, so nothing jumps on screen.
   A:   the clones fly into a tilted paper stack sitting on the bar (expo-out, 30 ms apart).
   beat: one accent flash on the stack, speed lines, the bar drops away.
   C:   the stack lands on the new card's cover and hands over to it. */
export async function create({root,nodes,apply}){
 const gsap=await prepare(),grid=root.querySelector('.library-grid');
 if(!gsap||!grid||!nodes.length){apply();root.querySelector('.bp-bar')?.remove();return;}
 setBusy(true);
 /* read */
 const view=grid.getBoundingClientRect(),bar=root.querySelector('.bp-bar'),barRect=bar?.getBoundingClientRect()||{left:view.left+view.width/2-1,width:2,top:view.bottom-40};
 const picked=nodes.slice(0,STACK_MAX),covers=picked.map(n=>n.querySelector('.cover-frame')),rects=covers.map(c=>c.getBoundingClientRect());
 /* the stack is built at full cover size and shown at scale s, so every clone is rastered sharp at the size it ends on */
 const W=rects[0]?.width||STACK_W*2,H=rects[0]?.height||W*4/3,s=STACK_W/W,cx=barRect.left+barRect.width/2-view.left,cy=barRect.top-view.top-H*s/2-30;
 /* write: the fly layer, clipped to the grid so nothing crosses the capsule or the top bar */
 const layer=document.createElement('div');layer.className='bp-fly-layer';layer.style.cssText=`left:${view.left}px;top:${view.top}px;width:${view.width}px;height:${view.height}px`;
 const stack=document.createElement('div');stack.className='bp-stack';stack.style.cssText=`left:${cx-W/2}px;top:${cy-H/2}px;width:${W}px;height:${H}px`;
 const flies=[],papers=[];
 for(let k=picked.length-1;k>=0;k--){
  const fly=document.createElement('div');fly.className='bp-fly';
  const paper=document.createElement('div');paper.className='bp-paper';
  const img=covers[k]?.querySelector('img');let face;
  if(img){face=document.createElement('img');face.src=img.currentSrc||img.src;face.alt='';}else{face=document.createElement('span');face.className='bp-blank';}
  fly.append(paper,face);stack.append(fly);flies[k]=fly;papers[k]=paper;
 }
 const flash=document.createElement('div');flash.className='bp-flash';flash.style.cssText=`left:${W*(1-s)/2-12}px;top:${H*(1-s)/2-12}px;width:${W*s+24}px;height:${H*s+38}px`;stack.append(flash);
 const lines=[[-1,.18,120,0],[-1,.46,74,1],[-1,.74,150,0],[1,.26,96,1],[1,.52,140,0],[1,.8,82,0]].map(([side,at,len,paperLine])=>{
  const l=document.createElement('i');l.className='bp-line'+(paperLine?' paper':'');
  l.style.cssText=`top:${H*(1-s)/2+H*s*at}px;width:${len}px;${side<0?`right:${W*(1+s)/2+18}px;transform-origin:100% 50%`:`left:${W*(1+s)/2+18}px;transform-origin:0 50%`}`;stack.append(l);return l;});
 layer.append(stack);document.body.append(layer);
 const from=k=>{const r=rects[k];return {x:r.left+r.width/2-(view.left+cx),y:r.top+r.height/2-(view.top+cy),scale:r.width/W,rotation:0};};
 flies.forEach((f,k)=>gsap.set(f,from(k)));gsap.set(papers,{opacity:0});
 /* the cut: grid in its final state, the new card held invisible until the stack lands on it */
 const card=apply();
 if(card){card.setAttribute('data-bp-hold','');card.style.opacity='0';}
 const target=card?.querySelector('.cover-frame');
 let t=target?.getBoundingClientRect();
 if(t&&!inView(t,view)){grid.scrollTop+=t.top-view.top-24;t=target.getBoundingClientRect();}
 const n=picked.length,beat=FLY*.82+(n-1)*FLY_STAGGER,travelAt=beat+.08;
 const tl=gsap.timeline({defaults:{ease:EXPO},onComplete:finish});
 flies.forEach((f,k)=>{const at=(n-1-k)*FLY_STAGGER;
  tl.to(f,{x:(k%2?1:-1)*Math.min(k,3)*2,y:-Math.min(k,4)*2.5,scale:s,rotation:k===0?-2:TILTS[k%TILTS.length],duration:FLY},at)
   .to(papers[k],{opacity:1,duration:.22,ease:'power1.out'},at+.08);});
 tl.addLabel('beat',beat)
  .fromTo(flash,{opacity:1},{opacity:0,duration:.16,ease:'power2.out',immediateRender:false},'beat')
  .fromTo(stack,{scale:1.08},{scale:1,duration:.26,immediateRender:false},'beat')
  .fromTo(lines,{scaleX:0,opacity:1},{scaleX:1,opacity:0,duration:.3,stagger:.014,immediateRender:false},'beat');
 if(bar)tl.to(bar,{yPercent:150,opacity:0,duration:.2,ease:'power3.in',onComplete:()=>bar.remove()},'beat+=.04');
 /* the landing overshoots a hair in scale (a soft spring) and settles exactly on the card's cover, which then takes over */
 if(t){tl.to(stack,{x:t.left+t.width/2-(view.left+cx),y:t.top+t.height/2-(view.top+cy),duration:TRAVEL},travelAt)
   .to(flies,{scale:t.width/W,duration:TRAVEL,ease:'back.out(1.5)'},travelAt)
   .to(flies,{x:0,y:0,rotation:0,duration:TRAVEL*.8},travelAt)
   .to(papers,{opacity:0,duration:.06,ease:'none'},travelAt)
   .to(flies.slice(1),{opacity:0,duration:.16,ease:'none'},travelAt+.12)
   .call(reveal,null,travelAt+TRAVEL);}
 else tl.to(stack,{opacity:0,duration:.2},travelAt).call(reveal);
 const skip=()=>tl.progress(1);
 document.addEventListener('pointerdown',skip,{capture:true,once:true});
 /* hand-over: the card shows under the stack first, the stack hides a frame later, and the layer is dropped once things are quiet */
 let revealed=false;
 function reveal(){if(revealed)return;revealed=true;if(card){card.style.opacity='';card.removeAttribute('data-bp-hold');}requestAnimationFrame(()=>{layer.style.visibility='hidden';setTimeout(()=>layer.remove(),500);});}
 function finish(){reveal();document.removeEventListener('pointerdown',skip,{capture:true});bar?.remove();setBusy(false);}
 return tl;
}
