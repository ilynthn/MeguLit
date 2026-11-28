// SPDX-License-Identifier: GPL-3.0-or-later
/* The credits roll shared by the main About page (web/about.js) and the Alt+T 关于 page (web/reader/modules/about.js).
   web/credits.json is the one list; each page draws its own rows, and this module loads the list and moves the roll:
   it creeps upward like the end of a film, rests at the bottom and starts again from the top, stops while hovered or
   focused, follows the wheel, and stands still (the page shows a plain list) when the system asks for reduced motion. */
const SPEED=0.022,REST=2600;
let data=null,loading=null;
export function loadCredits(){
 if(data)return Promise.resolve(data);
 return loading||(loading=fetch(new URL('./credits.json',import.meta.url),{cache:'no-store'}).then(r=>r.ok?r.json():null)
  .then(j=>{data=j&&Array.isArray(j.groups)?j:null;if(!data)loading=null;return data;}).catch(()=>{loading=null;return null;}));
}
export const creditsNow=()=>data;
/* a string, or {zh,en,ja} */
export const pickText=(v,lang)=>v==null?'':typeof v==='string'?v:String(v[lang]||v.en||v.zh||'');
/* Starts the motion on a scroll box. stillClass goes on the box while reduced motion is asked for. Stops by itself once
   the box leaves the page. */
export function rollCredits(roll,{stillClass='static'}={}){
 const calm=matchMedia('(prefers-reduced-motion: reduce)');let held=false,pos=0,last=0,restUntil=0,wrapAt=0;
 const hold=on=>{held=on;if(!on)pos=roll.scrollTop;};
 /* keyboard focus holds it too; a name focused by a click does not keep it stopped once the pointer leaves */
 const keyed=()=>{const a=document.activeElement;return !!a&&roll.contains(a)&&a.matches(':focus-visible');};
 roll.addEventListener('pointerenter',()=>hold(true));roll.addEventListener('pointerleave',()=>hold(keyed()));
 roll.addEventListener('focusin',()=>hold(roll.matches(':hover')||keyed()));roll.addEventListener('focusout',()=>hold(roll.matches(':hover')));
 roll.addEventListener('wheel',()=>{restUntil=performance.now()+REST;wrapAt=0;},{passive:true});
 roll.addEventListener('scroll',()=>{if(held||Math.abs(roll.scrollTop-pos)>2)pos=roll.scrollTop;},{passive:true});
 const tick=now=>{
  if(!roll.isConnected)return;
  const still=calm.matches;roll.classList.toggle(stillClass,still);
  if(still||document.hidden||!roll.offsetParent){last=0;setTimeout(()=>requestAnimationFrame(tick),400);return;}
  const dt=last?Math.min(64,now-last):0;last=now;const max=roll.scrollHeight-roll.clientHeight;
  if(!held&&now>restUntil&&max>0){
   if(pos>=max-1){if(!wrapAt)wrapAt=now+REST;else if(now>wrapAt){wrapAt=0;pos=0;roll.scrollTop=0;restUntil=now+REST/2;}}
   else{pos=Math.min(max,pos+dt*SPEED);roll.scrollTop=pos;}}
  requestAnimationFrame(tick);};
 requestAnimationFrame(tick);
}
