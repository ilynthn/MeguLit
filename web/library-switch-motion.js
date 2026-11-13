// E263: wall <-> simple list switch. Wall gathers to the centre and fades, the list then unrolls top-down like
// dominoes (and the reverse), each cover with a small pan-crop. Uses individual translate/scale so the wall's own
// positioning transforms are left alone.
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
export async function switchLibrary(toWall,render){
 if(busy)return;busy=true;
 try{
  if(reduce()){await render();return;}
  const root=host(),cards=visible(root),anims=[];
  // E269: capsule glides on its own 50ms after the click, toward the spot it last had in the other layout (remembered,
  // never measured by toggling classes, which flashed the page)
  let capAnim=null;
  const capTimer=setTimeout(()=>{const cap=capsule(),target=spots[toWall?'wall':'list'];if(!cap||!target)return;const a=cap.getBoundingClientRect();
   const dx=target.x-(a.left+a.width/2),dy=target.y-(a.top+a.height/2);cap.style.transition='none';
   if(Math.abs(dx)+Math.abs(dy)>1)capAnim=cap.animate([{translate:'0 0'},{translate:`${dx}px ${dy}px`}],{duration:480,easing:'cubic-bezier(.22,.9,.24,1)',fill:'forwards'});},50);
  {const c=capsule()?.getBoundingClientRect();if(c)spots[toWall?'list':'wall']={x:c.left+c.width/2,y:c.top+c.height/2};}
  if(root&&!toWall){
   const v=vignette(root,true);if(v)anims.push(v);
   const [cx,cy]=centre(root);
   for(const el of cards){const r=el.getBoundingClientRect(),dx=cx-(r.left+r.width/2),dy=cy-(r.top+r.height/2),d=Math.hypot(dx,dy);
    anims.push(el.animate([{translate:'0 0',scale:1,opacity:1},{translate:`${dx*.75}px ${dy*.75}px`,scale:.5,opacity:0}],{duration:300,delay:Math.max(0,180-d*.22),easing:'cubic-bezier(.55,0,.75,.2)',fill:'forwards'}));}
  }else if(root){
   const tops=cards.map(el=>el.getBoundingClientRect().top),minTop=Math.min(...tops);
   cards.forEach((el,i)=>{const r=el.getBoundingClientRect(),order=(tops[i]-minTop)*.5+r.left*.06;
    anims.push(el.animate([{clipPath:'inset(0 0 0 0)',translate:'0 0',opacity:1},{clipPath:'inset(0 0 100% 0)',translate:'0 -16px',opacity:0}],{duration:240,delay:Math.max(0,160-order*.4),easing:'cubic-bezier(.55,0,.75,.2)',fill:'forwards'}));});
  }
  // E273: overlap — the new layout starts while the old one is still leaving, so the background never stands empty
  await Promise.race([settle(anims),new Promise(r=>setTimeout(r,200))]);
  // FLIP the whole capsule synchronously (render is synchronous), with its own transform transition paused, so it
  // never jumps first and then slides
  clearTimeout(capTimer);
  const cap=capsule(),seen=cap?.getBoundingClientRect(),left=capAnim&&capAnim.playState!=='finished'?Math.max(120,480-(capAnim.currentTime||0)):0;
  if(cap)cap.style.transition='none';capAnim?.cancel();
  render();
  if(toWall){remeasure();vignette(host(),false);}
  const now=capsule();
  {const r=now?.getBoundingClientRect();if(r)spots[toWall?'wall':'list']={x:r.left+r.width/2,y:r.top+r.height/2};}
  if(now&&seen){const to=now.getBoundingClientRect(),dx=seen.left+seen.width/2-(to.left+to.width/2),dy=seen.top+seen.height/2-(to.top+to.height/2);
   now.style.transition='none';
   if(Math.abs(dx)+Math.abs(dy)>1){const m=now.animate([{translate:`${dx}px ${dy}px`},{translate:'0 0'}],{duration:left||240,easing:'cubic-bezier(.22,.9,.24,1)'});m.finished.catch(()=>{}).finally(()=>{now.style.transition='';if(toWall)remeasure();});}else now.style.transition='';}
  const pending=host();pending?.classList.add('lib-entering');
  await frame();
  if(toWall){remeasure();await frame();}
  const next=host(),incoming=next?[...next.querySelectorAll('.library-card')].filter(el=>!el.closest('[data-parked]')).slice(0,400):[];if(!next){pending?.classList.remove('lib-entering');return;}
  if(!toWall){
   const tops=incoming.map(el=>el.getBoundingClientRect().top),minTop=Math.min(...tops);
   incoming.forEach((el,i)=>{const r=el.getBoundingClientRect(),delay=Math.min(220,(tops[i]-minTop)*.3+(r.left-next.getBoundingClientRect().left)*.06);
    el.animate([{clipPath:'inset(0 0 100% 0)',translate:'0 -14px',opacity:0},{clipPath:'inset(0 0 0 0)',translate:'0 0',opacity:1}],{duration:420,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
    cover(el)?.animate([{scale:1.18,translate:'0 -5%'},{scale:1,translate:'0 0'}],{duration:640,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});});
  }else{
   wallIn(next,incoming);
  }
 next.classList.remove('lib-entering');
  if(toWall)setTimeout(remeasure,760);
  // safety: once everything has played, no animation may keep holding a card or cover
  setTimeout(()=>{for(const el of document.querySelectorAll('#library-results .library-card,#library-results .cover-frame img,#library-results .cover-frame .cover'))for(const a of el.getAnimations())if(a.playState==='finished'||a.effect?.getComputedTiming?.().fill==='forwards')a.cancel();},1600);
 }finally{busy=false;host()?.classList.remove('lib-entering');}
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
