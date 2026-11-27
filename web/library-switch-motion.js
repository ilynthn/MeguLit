// A complete fade separates views; the wall travels in alternating horizontal strips.
// Individual translate/scale compose with each field's own positioning transforms.
import {syncMainKids} from './main-kids.js';
import {capsuleSpringFrames} from './capsule-spring.js';
const host=()=>document.querySelector('#library-results');
const cover=el=>el.querySelector('.cover-frame img,.cover-frame .cover');
const centre=root=>{const b=root.getBoundingClientRect();const top=Math.max(b.top,0),bottom=Math.min(b.bottom,innerHeight);return [b.left+b.width/2,(top+bottom)/2];};
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const capsule=()=>document.querySelector('.field-search');
const remeasure=()=>dispatchEvent(new Event('megulit-field-measure'));
const EXPO_OUT='cubic-bezier(.16,1,.3,1)',ACCELERATE='cubic-bezier(.55,0,.85,.35)';
const FADE_OUT=360,FADE_IN=680,WALL_IN=960,WALL_OUT=640,BAR_SETTLE=1120;
let busy=false;
export const isBusy=()=>busy;
const promote=()=>{const h=host();if(h)h.style.willChange='opacity';};
globalThis.requestIdleCallback?.(promote);

export async function switchLibrary(view,render,from=''){
 if(busy)return;busy=true;
 const root=host(),bar=capsule(),animations=new Set(),restores=new Map(),observers=[];
 let next=null;
 const style=(el,key,value)=>{if(!el)return;let saved=restores.get(el);if(!saved)restores.set(el,saved=new Map());
  if(!saved.has(key))saved.set(key,el.style[key]);el.style[key]=value;};
 const play=(el,keys,options)=>{if(!el)return null;const a=el.animate(keys,options);a.finished.catch(()=>{});animations.add(a);return a;};
 const wait=async(runs,ms)=>{let timer;try{await Promise.race([
  Promise.all(runs.filter(Boolean).map(a=>a.finished.catch(()=>{}))),new Promise(resolve=>{timer=setTimeout(resolve,ms+200);})
 ]);}finally{clearTimeout(timer);}};
 const hold=runs=>{for(const a of runs.filter(Boolean)){a.pause();a.currentTime=0;}};
 const start=runs=>{const epoch=document.timeline.currentTime;for(const a of runs.filter(Boolean)){a.play();a.startTime=epoch;}return epoch;};
 const alive=el=>el?.isConnected&&host()===el;
 // A shared row clock also covers margin cells added by the wall's deferred painter.
 // Without it these late cells appeared at their destination while their neighbours were still sliding.
 const strips=(el,enter)=>{
  const plane=el.querySelector('.field-plane'),nodes=[...el.querySelectorAll('mg-cell[data-wall-row]:not([data-parked])')];
  if(!plane||!nodes.length)return null;
  const first=Math.min(...nodes.map(n=>Number(n.dataset.wallRow))),runs=[],assigned=new Map();
  const distance=innerWidth+336,duration=enter?WALL_IN:WALL_OUT,step=enter?48:32;
  let epoch=null;
  const attach=node=>{
   if(!node.matches?.('mg-cell[data-wall-row]:not([data-parked])'))return;
   const row=Number(node.dataset.wallRow);if(assigned.get(node)?.row===row)return;
   assigned.get(node)?.animation.cancel();
   const direction=Math.abs(row)%2?-1:1,delay=Math.min(4,Math.max(0,row-first))*step;
   const opacity=Number(node.style.opacity||1),x=direction*distance;
   const a=play(node,enter?[{translate:`${-x}px 0`,opacity:0},{translate:'0 0',opacity}]:[
    {translate:'0 0',opacity},{translate:`${x}px 0`,opacity:0}
   ],{duration,delay,easing:enter?EXPO_OUT:ACCELERATE,fill:'both'});
   a.pause();a.currentTime=0;assigned.set(node,{row,animation:a});runs.push(a);
   if(epoch!==null){a.play();a.startTime=epoch;}
  };
  nodes.forEach(attach);
  const observer=new MutationObserver(records=>{for(const record of records){
   if(record.type==='attributes')attach(record.target);
   else for(const node of record.addedNodes)attach(node);
  }});
  observer.observe(plane,{childList:true,subtree:true,attributes:true,attributeFilter:['data-parked','data-wall-row']});observers.push(observer);
  return {runs,duration:duration+4*step,start(){epoch=start(runs);},stop(){observer.disconnect();}};
 };
 try{
  if(!root||document.hidden||reduce()||typeof root.animate!=='function'){render();if(view!=='list')remeasure();return;}
  const before=bar?.getBoundingClientRect();style(root,'pointerEvents','none');
  const leaving=from==='wall'?strips(root,false):null;
  const outDuration=leaving?.duration||FADE_OUT;
  const fade=play(root,leaving?[{opacity:1},{opacity:1,offset:.55},{opacity:0}]:[{opacity:1},{opacity:0}],{
   duration:outDuration,easing:leaving?'linear':'cubic-bezier(.4,0,.7,1)',fill:'forwards'});
  leaving?.start();await wait([fade,...(leaving?.runs||[])],outDuration);
  if(!alive(root))return;
  leaving?.stop();
  // Keep the host invisible across synchronous DOM replacement and the layout measurement.
  style(root,'opacity','0');style(bar,'transition','none');
  window.__megulitOrbitWarm=true;render();syncMainKids(document.getElementById('main'));
  if(view!=='list')remeasure();
  next=host();if(!alive(next))return;
  const now=capsule(),after=now?.getBoundingClientRect();style(now,'transition','none');style(next,'pointerEvents','none');
  const arriving=view==='wall'?strips(next,true):null,runs=[];
  runs.push(play(next,[{opacity:0},{opacity:1}],{duration:arriving?240:FADE_IN,easing:'cubic-bezier(.22,.65,.3,1)',fill:'both'}));
  // FLIP the existing capsule, keeping its input and focus. A damped overshoot plus a small
  // squash/stretch makes it elastic; the final identity pose restores the exact CSS position.
  if(now&&before&&after){
   runs.push(play(now,capsuleSpringFrames(before,after),{duration:BAR_SETTLE,easing:'linear',fill:'both'}));
   const lit=['tracks','wall','list'].indexOf(view)+1;
   now.querySelectorAll('.library-view-leds i').forEach((lamp,i)=>runs.push(play(lamp,[
    {opacity:i<lit ? .45 : .28,scale:.88},{opacity:i<lit?1:.28,scale:1}
   ],{duration:520,delay:i*55,easing:EXPO_OUT,fill:'both'})));
  }
  hold(runs);fade.cancel();
  // Rows already hold their off-screen pose, so revealing the new host cannot flash its final layout.
  style(next,'opacity','1');
  let paintTimer;try{await Promise.race([
   new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),
   new Promise(resolve=>{paintTimer=setTimeout(resolve,180);})
  ]);}finally{clearTimeout(paintTimer);}
  if(!alive(next))return;
  start(runs);arriving?.start();
  await wait([...runs,...(arriving?.runs||[])],Math.max(BAR_SETTLE,arriving?.duration||FADE_IN));
 }finally{
  for(const observer of observers)observer.disconnect();
  for(const a of animations)a.cancel();
  for(const [el,saved] of restores)for(const [key,value] of saved)el.style[key]=value;
  if(view!=='list'&&alive(next))remeasure();
  busy=false;window.__megulitOrbitWarm=false;promote();host()?.classList.remove('lib-entering');
 }
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
