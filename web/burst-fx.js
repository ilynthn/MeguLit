// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 shared impact effects (presentation only): a pit knocked out of a surface with fine cracks round it,
   chips of the surface falling away under gravity, an Explosion (爆裂魔法) burst for a wrong answer and an Aqua-style
   flower-and-water fountain (花鳥風月) that mends a pit for a right one. Used by dict-impact.js and practice-fx.js. */
export const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
export const NS='http://www.w3.org/2000/svg';
export const rng=seed=>{let s=(seed>>>0)%2147483647||1;return ()=>{s=(s*16807)%2147483647;return s/2147483647;};};
const f1=n=>n.toFixed(1);

/* a jagged hole: outline points around (x,y) with radius r */
export function pitPath(r,x,y,R){
 const n=10+Math.floor(r()*5),a0=r()*Math.PI*2;let d='';
 for(let i=0;i<n;i++){const a=a0+i/n*Math.PI*2+(r()-.5)*.35,rad=R*(.62+r()*.42);d+=`${i?'L':'M'}${f1(x+Math.cos(a)*rad)} ${f1(y+Math.sin(a)*rad)} `;}
 return d+'Z';
}
/* fine cracks: a few short jagged lines out of the pit's rim */
export function crackPaths(r,x,y,R,reach,rays,from=0,span=Math.PI*2){
 const out=[];
 for(let i=0;i<rays;i++){
  let a=from+(i+.2+r()*.6)/rays*span,px=x+Math.cos(a)*R*.8,py=y+Math.sin(a)*R*.8,d=`M${f1(px)} ${f1(py)}`;
  const len=reach*(.45+r()*.55),seg=3+Math.floor(r()*3);
  for(let k=0;k<seg;k++){a+=(r()-.5)*.36;const l=len/seg*(.6+r()*.8),qx=px,qy=py;px+=Math.cos(a)*l;py+=Math.sin(a)*l;d+=` L${f1(px)} ${f1(py)}`;out.push({d:`M${f1(qx)} ${f1(qy)} L${f1(px)} ${f1(py)}`,w:Math.max(.35,1.6*(1-k/seg))});
   if(r()<.25){let ba=a+(r()<.5?-1:1)*(.6+r()*.5),bx=px,by=py,bd=`M${f1(px)} ${f1(py)}`;for(let j=0;j<2;j++){ba+=(r()-.5)*.6;const bl=len/seg*(.35+r()*.4);bx+=Math.cos(ba)*bl;by+=Math.sin(ba)*bl;bd+=` L${f1(bx)} ${f1(by)}`;}out.push({d:bd,w:.45});}}

 }
 return out;
}
/* markup of one scar (pit + cracks) for an svg <g> */
export function scarMarkup(seed,x,y,R,reach,rays,from,span){
 const r=rng(seed),hole=pitPath(r,x,y,R),rim=pitPath(rng(seed+1),x,y+R*.12,R*1.12);
 return `<path class="fx-rim" d="${rim}"/><path class="fx-pit" d="${hole}"/><path class="fx-pit-lip" d="${hole}"/>`+
  crackPaths(r,x,y,R,reach,rays,from,span).map(p=>`<path class="fx-crack" pathLength="1" d="${p.d}" stroke-width="${p.w}"/>`).join('');
}

function layer(){let l=document.querySelector('body>.fx-layer');if(!l){l=document.createElement('div');l.className='fx-layer';l.setAttribute('aria-hidden','true');document.body.append(l);}return l;}
const later=(el,ms)=>setTimeout(()=>el.remove(),ms);

/* chips of the surface: small irregular flakes thrown a little and falling */
export function debris(x,y,{n=10,spread=1,up=.6,tint='glass'}={}){
 if(calm)return;n=Math.max(0,Math.min(n,LIMIT.chips-document.querySelectorAll('.fx-chip').length));if(!n)return;
 const l=layer();
 for(let i=0;i<n;i++){
  const c=document.createElement('i');c.className=`fx-chip is-${tint}`;const s=2+Math.random()*5*spread;
  const sides=4+Math.floor(Math.random()*3),pts=Array.from({length:sides},(_,k)=>{const a=k/sides*Math.PI*2+Math.random()*.6,rr=35+Math.random()*15;return `${f1(50+Math.cos(a)*rr)}% ${f1(50+Math.sin(a)*rr)}%`;}).join(',');
  c.style.cssText=`left:${x}px;top:${y}px;width:${f1(s)}px;height:${f1(s*(.6+Math.random()*.7))}px;clip-path:polygon(${pts})`;l.append(c);
  const vx=(Math.random()-.5)*220*spread,vy=-(Math.random()*up*260),g=900+Math.random()*500,T=.7+Math.random()*.7,spin=(Math.random()-.5)*900,frames=[];
  for(let k=0;k<=8;k++){const t=T*k/8;frames.push({transform:`translate(${f1(vx*t)}px,${f1(vy*t+g*t*t/2)}px) rotate(${f1(spin*t)}deg)`,opacity:k<6?1:(8-k)/2.5});}
  c.animate(frames,{duration:T*1000,easing:'linear',fill:'forwards'});later(c,T*1000+60);
 }
 const dust=document.createElement('b');dust.className='fx-dust';dust.style.cssText=`left:${x}px;top:${y}px`;l.append(dust);
 dust.animate([{transform:'translate(-50%,-50%) scale(.3)',opacity:.55},{transform:'translate(-50%,-30%) scale(1.8)',opacity:0}],{duration:900,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});later(dust,950);
}

/* 爆裂魔法, refined (user: too rough). Beats: 0–650 ms a seal charges — three rings and a star draw themselves while
   embers are drawn in from all around and the glow grows; 600 ms a thin pillar of light drops from the top of the
   window onto the point; 700 ms impact — a soft warm glow, the fireball, a sharp shock ring and a slower dust ring, a
   spray of sparks under gravity, the frame shakes; then smoke climbs into a faint mushroom and embers drift up. The
   promise resolves at the impact so the caller can cut the pit and throw the chips. */
function sparkField(){let c=document.querySelector('body>.fx-layer>canvas.fx-sparks');if(!c){c=document.createElement('canvas');c.className='fx-sparks';layer().append(c);}const dpr=Math.min(2,devicePixelRatio||1);if(c.width!==innerWidth*dpr||c.height!==innerHeight*dpr){c.width=innerWidth*dpr;c.height=innerHeight*dpr;}return {c,ctx:c.getContext('2d'),dpr};}
/* 2026-11-12 (user: rapid clicking must never pile up): hard limits shared by every effect — at most 600 live canvas
   particles (the oldest are dropped first), at most 3 explosions playing (a new one ends the oldest at once), at most
   120 DOM chips and 80 fountain bits, no stacked flash or shake within 300 ms, and the canvas loop sleeps while the
   window is hidden. */
export const LIMIT={particles:400,blasts:3,chips:60,petals:60,gap:150};
let lastBlast=0;
let live=[],running=false,lastJolt=0;
const blasts=[];
function cap(){if(live.length>LIMIT.particles)live.splice(0,live.length-LIMIT.particles);}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&live.length)runSparks();});
function runSparks(){cap();if(running||document.hidden)return;running=true;let prev=performance.now();
 const step=now=>{if(document.hidden){running=false;return;}const dt=Math.min(.04,(now-prev)/1000);prev=now;const f=sparkField();if(!f.ctx){running=false;return;}const {ctx,dpr}=f;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);ctx.globalCompositeOperation='lighter';
  live=live.filter(p=>{p.t+=dt;if(p.t>p.life)return false;
   if(p.kind==='in'){const k=Math.min(1,p.t/p.life),e=k*k;p.x=p.x0+(p.tx-p.x0)*e;p.y=p.y0+(p.ty-p.y0)*e;}
   else{p.vx*=1-p.drag*dt;p.vy=p.vy*(1-p.drag*dt)+p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
   const k=p.t/p.life,a=p.kind==='in'?Math.min(1,k*4)*(1-k*.3):1-k,hot=1-k;
   ctx.globalAlpha=a;ctx.fillStyle=p.kind==='ember'?`rgb(255,${Math.round(120+110*hot)},${Math.round(60*hot)})`:p.kind==='in'?p.color:`rgb(255,${Math.round(180+75*hot)},${Math.round(120+120*hot)})`;
   if(p.kind==='smoke'){if(p.t<0)return true;const r=p.s*(1+k*1.6),sh=Math.round(30+20*k),g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);ctx.globalCompositeOperation='source-over';g.addColorStop(0,`rgba(${sh},${sh-4},${sh-6},${.42*Math.sin(Math.PI*Math.min(1,k*1.2))})`);g.addColorStop(1,`rgba(${sh},${sh-4},${sh-6},0)`);ctx.globalAlpha=1;ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='lighter';return true;}
   if(p.kind==='fire'){p.x+=Math.sin(p.t*5+(p.wob||0))*.8;const r=p.s*(1+k*2.2),c=k<.15?[255,250,230]:k<.35?[255,214,140]:k<.6?[255,130,60]:k<.8?[170,50,40]:[70,50,50];const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,`rgba(${c},${.55*(p.dim||1)*Math.pow(1-k,1.3)})`);g.addColorStop(1,`rgba(${c},0)`);ctx.globalAlpha=1;ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();return true;}
   if(p.kind==='spark'){p.trail.push([p.x,p.y]);if(p.trail.length>6)p.trail.shift();ctx.strokeStyle=ctx.fillStyle;ctx.lineCap='round';for(let i=1;i<p.trail.length;i++){ctx.globalAlpha=a*i/p.trail.length;ctx.lineWidth=p.s*i/p.trail.length;ctx.beginPath();ctx.moveTo(p.trail[i-1][0],p.trail[i-1][1]);ctx.lineTo(p.trail[i][0],p.trail[i][1]);ctx.stroke();}}
   else{ctx.beginPath();ctx.arc(p.x,p.y,p.s,0,Math.PI*2);ctx.fill();}
   return true;});
  if(live.length)requestAnimationFrame(step);else{ctx.clearRect(0,0,innerWidth,innerHeight);running=false;}};
 requestAnimationFrame(step);}
const anim=(el,frames,opts)=>el.animate(frames,{fill:'forwards',...opts});
export function explosion(x,y,{shake,bar,k=1}={}){
 if(calm)return Promise.resolve();
 /* clicks faster than one every 150 ms still leave their pit, but do not start another blast */
 const t0=performance.now();if(t0-lastBlast<LIMIT.gap)return Promise.resolve();lastBlast=t0;
 const l=layer(),w=document.createElement('div');w.className='fx-explosion';w.style.cssText=`left:${x}px;top:${y}px`;
 const star=Array.from({length:5},(_,i)=>{const a=-Math.PI/2+i*Math.PI*4/5;return `${i?'L':'M'}${f1(Math.cos(a)*46)} ${f1(Math.sin(a)*46)}`;}).join(' ')+'Z';
 w.innerHTML=`<svg class="fx-seal" viewBox="-70 -70 140 140"><circle pathLength="1" r="66"/><circle pathLength="1" r="58"/><path pathLength="1" d="${star}"/><circle pathLength="1" r="22"/>${Array.from({length:12},(_,i)=>`<text transform="rotate(${i*30}) translate(0 -61.5)">${'爆裂我が名は紅き魔の焔よ'[i]}</text>`).join('')}</svg>
  <b class="fx-charge"></b><b class="fx-pillar"></b><b class="fx-core"></b><b class="fx-fire"></b><b class="fx-fire is-inner"></b><b class="fx-ring"></b><b class="fx-ring is-dust"></b>`;
 l.append(w);blasts.push(w);while(blasts.length>LIMIT.blasts){const old=blasts.shift();old.getAnimations({subtree:true}).forEach(a=>a.finish());old.remove();}
 const jolt=performance.now()-lastJolt>300;if(jolt)lastJolt=performance.now();
 const flash=document.createElement('b');flash.className='fx-flash';flash.style.cssText=`--x:${x}px;--y:${y}px`;l.append(flash);
 const $=s=>w.querySelector(s),T=1900;
 anim($('.fx-seal'),[{transform:'translate(-50%,-50%) scale(.55) rotate(-60deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1) rotate(0deg)',opacity:1,offset:.3},{transform:'translate(-50%,-50%) scale(1.05) rotate(20deg)',opacity:1,offset:.36},{transform:'translate(-50%,-50%) scale(1.7) rotate(40deg)',opacity:0,offset:.55},{opacity:0}],{duration:T,easing:'cubic-bezier(.3,.6,.2,1)'});
 w.querySelectorAll('.fx-seal circle,.fx-seal path').forEach((p,i)=>anim(p,[{strokeDashoffset:1},{strokeDashoffset:0}],{duration:360,delay:60+i*90,easing:'cubic-bezier(.4,0,.2,1)'}));
 anim($('.fx-charge'),[{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:.9,offset:.33},{transform:'translate(-50%,-50%) scale(.6)',opacity:1,offset:.36},{opacity:0,offset:.42},{opacity:0}],{duration:T});
 if(0)anim($('.fx-pillar'),[{transform:'translateX(-50%) scaleY(0)',opacity:0},{transform:'translateX(-50%) scaleY(0)',opacity:0,offset:.24},{transform:'translateX(-50%) scaleY(1)',opacity:1,offset:.33},{transform:'translateX(-50%) scaleY(1)',opacity:1,offset:.37},{transform:'translateX(-50%) scaleY(1) scaleX(2.2)',opacity:0,offset:.5},{opacity:0}],{duration:T,easing:'ease-out'});
 anim($('.fx-core'),[{transform:'translate(-50%,-50%) scale(0)',opacity:0},{transform:'translate(-50%,-50%) scale(0)',opacity:0,offset:.36},{transform:'translate(-50%,-50%) scale(1.6)',opacity:1,offset:.39},{transform:'translate(-50%,-50%) scale(2.6)',opacity:0,offset:.55},{opacity:0}],{duration:T});
 anim($('.fx-fire'),[{transform:'translate(-50%,-50%) scale(0)',opacity:0},{transform:'translate(-50%,-50%) scale(0)',opacity:0,offset:.36},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.44},{transform:'translate(-50%,-50%) scale(1.35)',opacity:.5,offset:.6},{transform:'translate(-50%,-56%) scale(1.5)',opacity:0}],{duration:T,easing:'cubic-bezier(.2,.8,.3,1)'});
 anim($('.fx-fire.is-inner'),[{transform:'translate(-50%,-50%) scale(0)',opacity:0},{transform:'translate(-50%,-50%) scale(0)',opacity:0,offset:.37},{transform:'translate(-50%,-50%) scale(.7)',opacity:1,offset:.42},{transform:'translate(-50%,-60%) scale(.9)',opacity:0,offset:.62},{opacity:0}],{duration:T});
 anim($('.fx-ring'),[{transform:'translate(-50%,-50%) scale(.1)',opacity:0},{transform:'translate(-50%,-50%) scale(.1)',opacity:1,offset:.37},{transform:'translate(-50%,-50%) scale(5)',opacity:0,offset:.62},{opacity:0}],{duration:T,easing:'cubic-bezier(.1,.7,.3,1)'});
 anim($('.fx-ring.is-dust'),[{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{transform:'translate(-50%,-50%) scale(.2)',opacity:.7,offset:.38},{transform:'translate(-50%,-50%) scale(3.2)',opacity:0,offset:.85},{opacity:0}],{duration:T,easing:'cubic-bezier(.2,.6,.3,1)'});
 /* 2026-11-13 user (photosensitive epilepsy): no white flash at the hit; a small warm glow fades in ~250 ms and out ~500 ms */anim(flash,[{opacity:0,transform:'scale(.7)'},{opacity:0,transform:'scale(.7)',offset:.36},{opacity:.5*k,transform:'scale(1)',offset:.49},{opacity:0,transform:'scale(1.15)',offset:.76},{opacity:0}],{duration:T,easing:'ease-in-out'});w.style.scale=String(.6+.4*k);

 /* embers drawn in during the charge */
 for(let i=0;i<0;i++){const a=Math.random()*Math.PI*2,r=140+Math.random()*260;live.push({kind:'in',x0:x+Math.cos(a)*r,y0:y+Math.sin(a)*r,tx:x,ty:y,x:0,y:0,t:-Math.random()*.25,life:.62,s:.8+Math.random()*1.6,color:'rgb(255,120,70)'});}
 runSparks();
 setTimeout(()=>{w.remove();const i=blasts.indexOf(w);if(i>=0)blasts.splice(i,1);},T+60);later(flash,T+60);
 return new Promise(res=>setTimeout(()=>{
  for(let i=0;i<Math.round(75*k);i++){const a=Math.random()*Math.PI*2,v=(240+Math.random()*760)*.7*(.6+.4*k);live.push({kind:'spark',x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-160,g:420,drag:1.8,t:0,life:.55+Math.random()*.8,s:.8+Math.random()*1.4,trail:[]});}
  /* the fireball as layered puffs (no flat disc): hot white at the heart, orange, then dark red cooling to smoke */
  for(let i=0;i<Math.round(24*k);i++){const a=Math.random()*Math.PI*2,v=(60+Math.random()*320)*.7;live.push({kind:'fire',dim:.1,x:x+Math.cos(a)*8,y:y+Math.sin(a)*8,vx:Math.cos(a)*v*1.3,vy:Math.sin(a)*v*.7-80,g:-70,drag:2.6,t:0,life:1.6+Math.random()*.9,s:(30+Math.random()*34)*.7,wob:Math.random()*6});}
  for(let i=0;i<14;i++)live.push({kind:'ember',x:x+(Math.random()-.5)*60,y:y+(Math.random()-.5)*30,vx:(Math.random()-.5)*80,vy:-(40+Math.random()*120),g:-30,drag:.6,t:0,life:1.6+Math.random()*1.6,s:.8+Math.random()*1.4});
  runSparks();
  const kk=[[-5,2],[4,-4],[-3,3],[2,-2],[-1,1],[0,0]].map(([dx,dy])=>({transform:`translate(${dx*k}px,${dy*k}px)`}));
  if(jolt)for(const el of [shake,bar].filter(Boolean))el.animate(kk,{duration:520,easing:'cubic-bezier(.2,.7,.3,1)'});
  for(let i=0;i<34;i++){const cap=i>12,a=Math.random()*Math.PI*2;live.push({kind:'smoke',x:x+(cap?Math.cos(a)*40:(Math.random()-.5)*14),y:y-(cap?70+Math.random()*30:i*5),vx:(Math.random()-.5)*(cap?50:12),vy:-(cap?18+Math.random()*24:40+Math.random()*30),g:cap?0:12,drag:.8,t:-(cap?.25:0)-Math.random()*.2,life:2.4+Math.random()*1.4,s:(cap?18:12)+Math.random()*14});}
  res();},Math.round(T*.37)));
}
function mushroom(x,y){
 const l=layer(),m=document.createElement('div');m.className='fx-mushroom';m.style.cssText=`left:${x}px;top:${y}px`;
 const puffs=[[0,0,40,34,'stem'],[0,-28,34,38,'stem'],[0,-62,30,34,'stem'],[-38,-98,70,52,'cap'],[34,-100,74,54,'cap'],[0,-116,92,60,'cap'],[-70,-84,50,38,'cap'],[68,-84,52,38,'cap']];
 m.innerHTML=puffs.map(([px,py,pw,ph,k])=>`<i class="is-${k}" style="left:${px}px;top:${py}px;width:${pw}px;height:${ph}px"></i>`).join('');l.append(m);
 m.querySelectorAll('i').forEach((p,i)=>{const cap=p.classList.contains('is-cap'),dx=(Math.random()-.5)*(cap?80:26);
  p.animate([{transform:'translate(-50%,-50%) translateY(40px) scale(.3)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.3},{transform:`translate(calc(-50% + ${f1(dx)}px),calc(-50% - ${cap?70:46}px)) scale(${cap?2:1.6})`,opacity:0}],{duration:2800+Math.random()*900,delay:200+i*45,easing:'cubic-bezier(.25,.6,.3,1)',fill:'both'});});
 later(m,4300);
}

/* 花鳥風月: water arcs up and falls with petals and a few sparkles */
export function fountain(x,y,k=1){
 if(calm)return;const room=LIMIT.petals-document.querySelectorAll('.fx-drop,.fx-petal').length;if(room<6)return;k=Math.min(k,room/26);
 const l=layer();
 for(let i=0;i<Math.round(26*k);i++){
  const flower=i%3===0,el=document.createElement('i');el.className=flower?'fx-petal':'fx-drop';
  el.style.cssText=`left:${x}px;top:${y}px`;if(flower)el.textContent=['✿','❀','✾'][Math.floor(Math.random()*3)];l.append(el);
  const vx=(Math.random()-.5)*260,vy=-(260+Math.random()*260),g=900,T=1+Math.random()*.6,spin=(Math.random()-.5)*360,frames=[];
  for(let k=0;k<=8;k++){const t=T*k/8;frames.push({transform:`translate(${f1(vx*t)}px,${f1(vy*t+g*t*t/2)}px) rotate(${f1(spin*t)}deg) scale(${k===0?.3:1})`,opacity:k===0?0:k<6?1:(8-k)/2.5});}
  el.animate(frames,{duration:T*1000,delay:Math.random()*160,easing:'linear',fill:'both'});later(el,T*1000+260);
 }
 const glow=document.createElement('b');glow.className='fx-bloom';glow.style.cssText=`left:${x}px;top:${y}px`;l.append(glow);
 glow.animate([{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:.8,offset:.3},{transform:'translate(-50%,-50%) scale(1.6)',opacity:0}],{duration:900,easing:'ease-out',fill:'forwards'});later(glow,950);
}
