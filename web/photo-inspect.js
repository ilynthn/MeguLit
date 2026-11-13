// SPDX-License-Identifier: GPL-3.0-or-later
/* Enlarge-and-inspect for a polaroid (学习 › 句子). The card wall's inspect idea (card-wall.js openViewer) cut down to a
   flat photo: a twin is laid exactly over the photo on the page, the page copy hides, the twin flies to the middle over
   a dark veil and squares up. Wheel or pinch zooms around the pointer, drag pans, double-click resets, Esc / a click on
   the veil / the close button flies it back to wherever the page copy is now. GSAP on transform and opacity when it is
   loaded; without it, or with reduced motion, every step jumps. */
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=null;
export const isInspectOpen=()=>!!current;
export function closeInspect(instant=false){current?.close(instant);}

export function inspectPhoto(src,{hint='',closeLabel='关闭'}={}){
 if(!src?.isConnected)return null;
 current?.close(true);
 const W=src.offsetWidth,H=src.offsetHeight;if(!W||!H)return null;
 const gsap=!reduced()&&window.gsap?window.gsap:null;
 const rot0=parseFloat(getComputedStyle(src).rotate)||0;
 const home=()=>{const r=src.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,s:1,r:parseFloat(getComputedStyle(src).rotate)||rot0};};
 const fitS=()=>Math.min(innerWidth*.86/W,(innerHeight-180)/H,8);
 const centre=()=>({x:innerWidth/2,y:innerHeight/2-20,s:fitS(),r:0});

 const layer=document.createElement('div');layer.className='sp-insp';layer.tabIndex=-1;layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');
 layer.innerHTML=`<div class="sp-insp-veil"></div><p class="sp-insp-hint">${escape(hint)}</p><div class="sp-insp-bar"><button type="button" class="secondary sp-insp-close">${escape(closeLabel)}</button></div>`;
 const veil=layer.querySelector('.sp-insp-veil'),chrome=layer.querySelectorAll('.sp-insp-hint,.sp-insp-bar');
 const twin=document.createElement('div');twin.className=src.className.replace(/\bis-\S+/g,'')+' sp-insp-twin';twin.innerHTML=src.innerHTML;twin.setAttribute('aria-hidden','true');
 twin.style.cssText='--rot:0deg;--dy:0px;rotate:none;translate:none';Object.assign(twin.style,{width:W+'px',height:H+'px'});
 layer.append(twin);document.body.append(layer);

 const st={...home()},goal={...st};
 const apply=()=>{twin.style.transform=`translate(${(st.x-W/2).toFixed(2)}px,${(st.y-H/2).toFixed(2)}px) rotate(${st.r.toFixed(3)}deg) scale(${st.s.toFixed(4)})`;};
 const go=(t,dur=.5,ease='power3.out')=>{Object.assign(goal,t);if(!gsap){Object.assign(st,t);apply();return null;}
  return gsap.to(st,{...t,duration:dur,ease,overwrite:'auto',onUpdate:apply});};
 apply();src.style.opacity='0';

 let closing=false;
 const fade=(to,dur)=>{if(!gsap){veil.style.opacity=to;chrome.forEach(n=>n.style.opacity=to);return;}
  gsap.to(veil,{opacity:to,duration:dur,ease:'power1.out',overwrite:'auto'});gsap.to(chrome,{opacity:to?.8:0,duration:dur*.8,delay:to?.2:0,overwrite:'auto'});};
 fade(1,.35);go(centre(),.62,'expo.out');

 function dispose(){if(gsap){gsap.killTweensOf(st);gsap.killTweensOf(veil);gsap.killTweensOf(chrome);}layer.remove();src.style.opacity='';removeEventListener('resize',onResize);if(current===api)current=null;}
 function close(instant=false){if(closing&&!instant)return;closing=true;layer.classList.add('is-closing');
  if(instant||!gsap){dispose();return;}
  fade(0,.32);const tw=go(home(),.5,'power3.inOut');
  /* the page may scroll or resize under it: aim at the live rectangle on the last stretch */
  tw?.eventCallback('onComplete',()=>{dispose();src.focus?.({preventScroll:true});});}
 const api={close,el:layer};current=api;
 const onResize=()=>{if(!closing)go(centre(),.3);};addEventListener('resize',onResize);

 /* zoom around a point: the point under it stays put */
 const zoomAt=(px,py,s)=>{s=clamp(s,fitS()*.5,fitS()*8);const k=s/goal.s;go({s,x:px-(px-goal.x)*k,y:py-(py-goal.y)*k},.24,'power2.out');};
 layer.addEventListener('wheel',e=>{e.preventDefault();if(closing)return;const d=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);zoomAt(e.clientX,e.clientY,goal.s*Math.exp(-d*.0012));},{passive:false});
 const pts=new Map();let pan=null,pinch=null;
 layer.addEventListener('pointerdown',e=>{if(closing||e.button!==0&&e.pointerType==='mouse'||e.target.closest('.sp-insp-bar'))return;
  pts.set(e.pointerId,{x:e.clientX,y:e.clientY});layer.setPointerCapture?.(e.pointerId);gsap?.killTweensOf(st);Object.assign(goal,st);
  if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,s:st.s,x:st.x,y:st.y,mx:(a.x+b.x)/2,my:(a.y+b.y)/2};pan=null;}
  else if(pts.size===1)pan={x0:e.clientX,y0:e.clientY,x:st.x,y:st.y,moved:false,onPhoto:!!e.target.closest('.sp-insp-twin')};});
 layer.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pts.size>=2){const [a,b]=[...pts.values()],d=Math.hypot(a.x-b.x,a.y-b.y)||1,s=clamp(pinch.s*d/pinch.d,fitS()*.5,fitS()*8),k=s/pinch.s,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
   st.s=s;st.x=mx-(pinch.mx-pinch.x)*k;st.y=my-(pinch.my-pinch.y)*k;Object.assign(goal,st);apply();return;}
  if(!pan)return;const dx=e.clientX-pan.x0,dy=e.clientY-pan.y0;if(!pan.moved&&Math.hypot(dx,dy)<4)return;
  if(!pan.moved){pan.moved=true;layer.classList.add('is-pan');}st.x=pan.x+dx;st.y=pan.y+dy;Object.assign(goal,st);apply();});
 const up=e=>{if(!pts.delete(e.pointerId))return;if(pinch){if(pts.size<2)pinch=null;pan=null;return;}
  const p=pan;pan=null;layer.classList.remove('is-pan');if(p&&!p.moved&&!p.onPhoto&&e.type==='pointerup')close();};
 layer.addEventListener('pointerup',up);layer.addEventListener('pointercancel',up);
 layer.addEventListener('dblclick',e=>{if(!closing&&!e.target.closest('.sp-insp-bar'))go(centre(),.45);});
 layer.querySelector('.sp-insp-close').addEventListener('click',()=>close());
 layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
  else if(e.key==='+'||e.key==='='){zoomAt(innerWidth/2,innerHeight/2,goal.s*1.25);}else if(e.key==='-'){zoomAt(innerWidth/2,innerHeight/2,goal.s/1.25);}else if(e.key==='0'){go(centre(),.45);}});
 layer.focus({preventScroll:true});
 return api;
}
