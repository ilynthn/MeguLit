/* 2026-11-13 (user: 右下封面条改成卡牌游戏的「手牌」) the showcase games sit as a hand of cards on an arc along the bottom right; the hovered card
   lifts while its neighbours give way, and picking one plays a card: the field card flies back into its slot (收牌) and the picked one flies onto the
   field (出牌). Ten flight styles share one spring (same mass and damping), are picked at random without repeating, can be interrupted from their
   current pose, and move only transform/opacity. */

/* 2026-11-13 (user: "我要的十种不同手牌和在场牌切换的不同…动画呢") each flight has one clear signature, readable at a glance:
   toss (high arc), flip (turns over, back shows mid-air), swing (pendulum), slap (fast, slams down with a squash), spin (one full turn),
   dive (dips into the table, rises up), edge (turns edge-on and slices across), trail (afterimages), pull (winds back, then shoots),
   float (lifts straight up, hangs, then glides). Each has its own length. */
export const HAND_VARIANTS=['toss','flip','swing','slap','spin','dive','edge','trail','pull','float'];
export const FLIGHT_MS={toss:780,flip:900,swing:880,slap:560,spin:900,dive:880,edge:820,trail:780,pull:860,float:1000};

/* quadratic arc rising from bottom-middle-left, peaking above the old cover strip and falling into the bottom-right corner (container units) */
export function arcPoint(t,W,H){const P0=[.0*W,1.04*H],P1=[.58*W,-.36*H],P2=[.97*W,.74*H],u=1-t,
 x=u*u*P0[0]+2*u*t*P1[0]+t*t*P2[0],y=u*u*P0[1]+2*u*t*P1[1]+t*t*P2[1],dx=2*u*(P1[0]-P0[0])+2*t*(P2[0]-P1[0]),dy=2*u*(P1[1]-P0[1])+2*t*(P2[1]-P1[1]);
 return {x,y,a:Math.atan2(dy,dx)*180/Math.PI};}

/* positions for n cards; hover lifts one card and pushes the others aside along the arc */
export function handLayout(n,{W,H,cw,hover=-1}){if(n<=0)return [];const ch=cw*4/3,step=Math.min(.082,(.9-.16)/Math.max(1,n-1)),mid=.6,start=mid-step*(n-1)/2;
 return Array.from({length:n},(_,j)=>{let t=start+step*j;if(hover>=0&&j!==hover){const d=j-hover;t+=Math.sign(d)*.04*Math.exp(-(Math.abs(d)-1)*.55);}
  const p=arcPoint(Math.max(0,Math.min(1,t)),W,H),a=p.a*.82;if(j!==hover)return {x:p.x,y:p.y,a,s:1,z:j};
  const rad=(a-90)*Math.PI/180;return {x:p.x+Math.cos(rad)*ch*.32,y:p.y+Math.sin(rad)*ch*.32,a:a*.3,s:1.34,z:999};});}

/* step response of a damped spring at normalised time q (0..1 of the flight) */
export function springAt(q,{zeta=.74,omega=11,T=.74}={}){const t=q*T;if(t<=0)return 0;const wd=omega*Math.sqrt(1-zeta*zeta),e=Math.exp(-zeta*omega*t);
 return 1-e*(Math.cos(wd*t)+zeta*omega/wd*Math.sin(wd*t));}

const lerp=(a,b,k)=>a+(b-a)*k,clamp01=q=>Math.max(0,Math.min(1,q)),ease=q=>1-Math.pow(1-clamp01(q),3),bell=q=>Math.sin(Math.PI*clamp01(q)),
 inOut=q=>{q=clamp01(q);return q<.5?4*q*q*q:1-Math.pow(-2*q+2,3)/2;};
/* pose of a flight of `kind` from A to B at normalised time q; poses are {x,y,r,s,rx,ry,o} in root pixels; q=1 is exactly B (so the hand-off to the
   real card has nothing left to settle) */
export function flightPose(kind,A,B,q){const dx=B.x-A.x,dy=B.y-A.y,dist=Math.hypot(dx,dy)||1,dir=Math.sign(dx||1),take=B.s<A.s;let nx=-dy/dist,ny=dx/dist;if(ny>0){nx=-nx;ny=-ny;}
 const turn=kind==='spin'?360*(take?-1:1):0,flipY=kind==='flip'?360:0;if(q>=1)return {x:B.x,y:B.y,r:B.r+turn,s:B.s,rx:0,ry:flipY,o:1};
 let p=springAt(q),from=A,lift=0,side=0,s0=0,r0=0,rx=0,ry=0,lead=null;
 /* two-stage flights: a first move away from the slot, then the spring from there */
 if(kind==='dive'){const h=take?.3:.24,dy0=take?80:-56,ds=take?.86:1.12;if(q<h){const k=ease(q/h);return {x:A.x,y:A.y+dy0*k,r:A.r*(1-k*.7),s:A.s*(1+(ds-1)*k),rx:-14*k,ry:0,o:1};}
  from={...A,y:A.y+dy0,r:A.r*.3,s:A.s*ds};p=springAt((q-h)/(1-h),{zeta:.66,omega:12});rx=-14*(1-Math.min(1,p));}
 if(kind==='float'){const h=.36,up=Math.min(160,dist*.3);if(q<h){const k=ease(q/h);return {x:A.x,y:A.y-up*k,r:A.r*(1-k),s:A.s*(1+.1*k),rx:0,ry:0,o:1};}
  from={...A,y:A.y-up,r:0,s:A.s*1.1};p=springAt((q-h)/(1-h),{zeta:.86,omega:9});}
 if(kind==='pull'){const h=.3;if(q<h){const k=bell(q/h*.5),back=.14*k;return {x:A.x-dx*back,y:A.y-dy*back,r:A.r-8*dir*k,s:A.s*(1-.08*k),rx:0,ry:0,o:1};}
  from={...A,x:A.x-dx*.14,y:A.y-dy*.14,r:A.r-8*dir,s:A.s*.92};p=springAt((q-h)/(1-h),{zeta:.55,omega:14});}
 if(kind==='slap')p=springAt(q,{zeta:.42,omega:17});
 const b=bell(Math.min(1,p));
 switch(kind){
  case 'toss':lift=.46;r0=-22*bell(q)*dir;break;
  case 'flip':lift=.22;ry=360*inOut(q/.78);s0=.07*bell(q);break;
  case 'swing':lift=.08;r0=32*Math.sin(3*Math.PI*q)*Math.pow(1-q,1.4)*dir;break;
  case 'slap':lift=.03;rx=22*clamp01(1-p);s0=p>1?-.5*(p-1):0;break;
  case 'spin':lift=.16;r0=turn*inOut(q);break;
  case 'edge':side=.22;lift=.05;ry=-84*bell(q)*dir;break;
  case 'trail':lift=.3;r0=-8*bell(q);break;
  case 'pull':lift=.04;break;
  default:break;}
 const x=lerp(from.x,B.x,p)+nx*dist*lift*b+ny*dist*side*b*dir,y=lerp(from.y,B.y,p)+ny*dist*lift*b-nx*dist*side*b*dir;
 /* growing onto the field the size leads the travel a little, shrinking into the hand it follows it */
 const sp=B.s>from.s&&kind!=='dive'&&kind!=='slap'?springAt(q,{zeta:.8,omega:12.5}):p;
 return {x,y,r:lerp(from.r,B.r,p)+r0,s:Math.max(.05,lerp(from.s,B.s,sp)*(1+s0)),rx,ry,o:1};}

export function flightFrames(kind,A,B,steps=30){return Array.from({length:steps+1},(_,i)=>flightPose(kind,A,B,i/steps));}
export function samplePose(frames,k){const f=Math.max(0,Math.min(1,k))*(frames.length-1),i=Math.floor(f),j=Math.min(frames.length-1,i+1),u=f-i,a=frames[i],b=frames[j];
 return Object.fromEntries(Object.keys(a).map(key=>[key,lerp(a[key],b[key],u)]));}
/* random flight style, never the same twice running */
export function pickVariant(last,rnd=Math.random){const pool=HAND_VARIANTS.filter(v=>v!==last);return pool[Math.floor(rnd()*pool.length)%pool.length];}
export function poseTransform(p,W,H){return `perspective(2200px) translate3d(${(p.x-W/2).toFixed(2)}px,${(p.y-H/2).toFixed(2)}px,0) rotate(${p.r.toFixed(2)}deg) rotateX(${p.rx.toFixed(2)}deg) rotateY(${p.ry.toFixed(2)}deg) scale(${p.s.toFixed(4)})`;}

/* the live hand. opts: {root,box,layer,cover,art(g),back,reduced,onPlay(g,kind),onLand(g),extras:[{html,cls,onClick}]} */
export function createHand(opts){const {root,box,layer,cover,art,back='',onPlay,onLand}=opts,reduced=!!opts.reduced;
 const st={games:[],cards:new Map(),out:null,hover:-1,flights:new Map(),last:null,extras:[]};
 const metrics=()=>{const W=box.clientWidth,H=box.clientHeight,cw=Math.max(66,Math.min(118,innerWidth*.058));return {W,H,cw,ch:cw*4/3};};
 const inHand=()=>st.games.filter(g=>g.id!==st.out);
 function layout(){const m=metrics(),hand=inHand(),n=hand.length+st.extras.length,pos=handLayout(n,{...m,hover:st.hover});box.style.setProperty('--cw',m.cw+'px');
  const moves=[];hand.forEach((g,j)=>moves.push([st.cards.get(g.id),pos[j]]));st.extras.forEach((el,k)=>moves.push([el,pos[hand.length+k]]));
  const o=st.out&&st.cards.get(st.out);if(o){const j=Math.max(0,st.games.findIndex(g=>g.id===st.out)-1),p=pos[Math.min(j,pos.length-1)]||{x:m.W/2,y:m.H,a:0,s:1,z:0};
   moves.push([o,{...p,s:.9}]);}place(moves,m);return {pos,m};}
 /* 2026-11-13 (user: "手牌就会有个强制被改变位置的bug") the fan moves with Web Animations, not a CSS transition: a CSS transition is timed from the style change, so
    when a draw keeps the page busy for a moment the cards appeared already at their new places; an animation starts when it is first drawn and is
    always seen whole. Current poses are all read before any is written (one style pass), and a move picks up from wherever the card is now. */
 const EASE='cubic-bezier(.22,1.22,.36,1)';
 const slotTransform=(p,m)=>`translate3d(${(p.x-m.cw/2).toFixed(1)}px,${(p.y-m.ch/2).toFixed(1)}px,0) rotate(${p.a.toFixed(2)}deg) scale(${p.s})`;
 function place(list,m){const items=list.filter(([el,p])=>el&&p).map(([el,p])=>[el,p,slotTransform(p,m)]);
  const from=items.map(([el,,to])=>el.style.transform&&el.style.transform!==to&&!reduced&&el.isConnected?getComputedStyle(el).transform:null);
  items.forEach(([el,p,to],i)=>{el.style.zIndex=String(p.z);el.dataset.a=p.a;if(el.style.transform===to)return;el._mv?.cancel();el.style.transform=to;const a=from[i];
   if(a&&a!=='none')el._mv=el.animate([{transform:a},{transform:to}],{duration:420,easing:EASE});});}
 /* pose of a game's slot in root pixels, from the layout numbers (not from a card that may be mid-transition) */
 /* 2026-11-14 (user: "又是那个bug 明明修了咋又来了") the slot is measured, not computed: a bare hidden copy of the card (same classes, the slot's final
    transform, no animations) is laid out in the fan and its box taken. Hand cards turn around their CSS transform-origin (50% 62%), not their centre,
    so the old arithmetic (box origin + layout point) put a tilted slot 5-6px off and the real card jumped when the flying one handed over */
 function slotPose(id,W){const {pos,m}=st.lastLayout||layout(),j=inHand().findIndex(g=>g.id===id);const p=pos[j];if(!p)return null;const el=st.cards.get(id),rr=root.getBoundingClientRect();
  if(!el){const br=box.getBoundingClientRect();return {x:br.left-rr.left+p.x,y:br.top-rr.top+p.y,r:p.a,s:m.cw*p.s/W,rx:0,ry:0,o:1};}
  const c=el.cloneNode(false);c.className=el.className.replace(/is-(out|wait)/g,'');c.style.cssText=el.style.cssText;c.style.transform=slotTransform(p,m);c.style.visibility='hidden';
  c.style.pointerEvents='none';c.style.animation='none';c.style.transition='none';c.setAttribute('aria-hidden','true');c.tabIndex=-1;box.appendChild(c);
  try{const r=c.getBoundingClientRect();return {x:r.left-rr.left+r.width/2,y:r.top-rr.top+r.height/2,r:p.a,s:m.cw*p.s/W,rx:0,ry:0,o:1};}finally{c.remove();}}
 /* 2026-11-13 (user: "位置有大问题") the field card's resting box: a bare copy of it (same classes and inline place, no animations, hidden) is measured,
    so a draw or deal animation still running on the real card never moves the measured spot */
 /* slots and the field card are measured on the untilted scene, where the flights end */
 const flat=fn=>(opts.neutral||(f=>f()))(fn);
 function restRect(){const p=cover.cloneNode(false);p.style.visibility='hidden';p.style.pointerEvents='none';p.setAttribute('aria-hidden','true');cover.parentNode.appendChild(p);
  try{return p.getBoundingClientRect();}finally{p.remove();}}
 /* a hand card's pose as drawn: centre of its box (the image of its centre), angle and scale from its current transform */
 function cardPose(el,W){const r=el.getBoundingClientRect(),rr=root.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return {x:r.left-rr.left+r.width/2,y:r.top-rr.top+r.height/2,r:Math.atan2(m.b,m.a)*180/Math.PI,s:Math.hypot(m.a,m.b)*el.offsetWidth/W,rx:0,ry:0,o:1};}
 function coverPose(){const r=restRect(),rr=root.getBoundingClientRect(),W=cover.offsetWidth||1,H=cover.offsetHeight||1,
  t=4*Math.PI/180,s=r.width/(W*Math.cos(t)+H*Math.sin(t));return {x:r.left-rr.left+r.width/2,y:r.top-rr.top+r.height/2,r:-4,s:Number.isFinite(s)&&s>0?s:1,rx:0,ry:0,o:1};}
 function relayout(){st.lastLayout=layout();}
 function render(games,outId){st.games=games.slice();st.out=outId;const keep=new Set(games.map(g=>g.id));
  for(const [id,el] of st.cards)if(!keep.has(id)){el.remove();st.cards.delete(id);}
  games.forEach(g=>{let el=st.cards.get(g.id);if(!el){el=document.createElement('button');el.type='button';el.className='tv-hc';el.dataset.id=g.id;
   el.innerHTML=`<span class="tv-hc-face"></span>`;el.querySelector('.tv-hc-face').style.background=art(g);el.addEventListener('click',()=>play(g.id));
   el.addEventListener('pointerenter',()=>hoverTo(el));el.addEventListener('focus',()=>hoverTo(el));el.addEventListener('blur',()=>hoverTo(null));box.appendChild(el);st.cards.set(g.id,el);}
   el.title=g.title;el.setAttribute('aria-label',g.title);el.classList.toggle('is-out',g.id===st.out);el.classList.toggle('pinned',!!g.pinned);});
  relayout();}
 function setExtras(list){st.extras.forEach(e=>e.remove());st.extras=list.map(x=>{const el=document.createElement('button');el.type='button';el.className='tv-hc tv-hc-extra '+(x.cls||'');
  el.innerHTML=x.html;el.title=x.title||'';el.setAttribute('aria-label',x.title||'');el.addEventListener('click',x.onClick);el.addEventListener('pointerenter',()=>hoverTo(el));box.appendChild(el);return el;});relayout();}
 function hoverTo(el){/* (user: the returning cover flickered) the fan holds still while a card flies, so the slot a card is flying to does not move under it */if(st.flights.size&&el)return;const all=[...inHand().map(g=>st.cards.get(g.id)),...st.extras],i=el?all.indexOf(el):-1;if(i===st.hover)return;st.hover=i;relayout();}
 box.addEventListener('pointerleave',()=>hoverTo(null));
 function ghostFor(id,g){let f=st.flights.get(id);if(f){f.anims.forEach(a=>a.cancel());return f;}const W=cover.offsetWidth,H=cover.offsetHeight,el=document.createElement('div');
  el.className='tv-ghost';el.style.width=W+'px';el.style.height=H+'px';el.innerHTML=`<i class="tv-ghost-face"></i><i class="tv-ghost-back">${back}</i>`;el.firstChild.style.background=art(g);
  layer.appendChild(el);f={el,W,H,anims:[],frames:null,t0:0,dur:1,trails:[]};st.flights.set(id,f);return f;}
 function currentPose(f){return f.frames?samplePose(f.frames,(performance.now()-f.t0)/f.dur):null;}
 function fly(id,g,A,B,kind,dur,delay,done){/* the scene settles flat while any card flies (opts.onBusy), and follows the pointer again after the last one */if(!st.flights.size)opts.onBusy?.(true);const f=ghostFor(id,g),W=f.W,H=f.H;f.trails.forEach(t=>t.remove());f.trails=[];
  const frames=flightFrames(kind,A,B);f.frames=frames;f.t0=performance.now()+delay;f.dur=dur;const keys=frames.map(p=>({transform:poseTransform(p,W,H)}));
  f.el.style.transform=keys[0].transform;const timing={duration:dur,delay,easing:'linear',fill:'both'};f.anims=[f.el.animate(keys,timing)];
  if(kind==='trail')[.34,.2,.1,.05].forEach((o,k)=>{const t=f.el.cloneNode(true);t.classList.add('is-trail');layer.insertBefore(t,f.el);f.trails.push(t);
   f.anims.push(t.animate(keys.map((x,i)=>({...x,opacity:o*Math.max(0,1-i/(keys.length*.55))})),{...timing,delay:delay+(k+1)*40}));});
  /* 2026-11-13 (user: "过渡到展示的怎么是渐变过渡的") no cross-fade: the last frame of the flight is the real card's exact pose, and in the same task the real
    card is shown and the flying one removed, so the next painted frame simply has the real card where the flying one was */
  f.anims[0].finished.then(()=>{if(st.flights.get(id)!==f)return;st.flights.delete(id);if(!st.flights.size)queueMicrotask(()=>{if(!st.flights.size)opts.onBusy?.(false);});f.trails.forEach(t=>t.remove());done?.();f.anims.forEach(a=>a.cancel());f.el.remove();},()=>{});return f;}
 function play(id){const g=st.games.find(x=>x.id===id);if(!g||id===st.out&&!st.flights.has(id))return;const old=st.out?st.games.find(x=>x.id===st.out):null;
  if(reduced){st.out=id;render(st.games,id);onPlay(g,'plain');onLand?.(g);return;}
  const kind=globalThis.__forceKind||pickVariant(st.last);st.last=kind;const W=cover.offsetWidth;
  /* where the picked card is now: mid-flight pose if it was flying, else its hand slot */
  /* (user: "手牌就会有个强制被改变位置的bug") a hovered card is lifted and enlarged; it takes off from exactly where it is drawn now (mid-transition included), not from its resting slot */
  const pickEl=st.cards.get(id),fromPick=(st.flights.has(id)&&currentPose(st.flights.get(id)))||(pickEl&&!pickEl.classList.contains('is-out')&&!pickEl.classList.contains('is-wait')?cardPose(pickEl,W):slotPose(id,W));
  const fromOld=old?((st.flights.has(old.id)&&currentPose(st.flights.get(old.id)))||coverPose()):null;
  /* (user: the field card vanished when it had come from a random draw) a field card that is not in the hand is thrown off the table, never just removed */
  const gone=!old?opts.field?.():null,fromGone=gone&&gone.id!==id?coverPose():null;
  st.out=id;st.hover=-1;render(st.games,id);onPlay(g,kind,(FLIGHT_MS[kind]||760)+(old?120:0));
  if(fromGone){const rr=root.getBoundingClientRect(),w=cover.offsetWidth;fly('__gone',gone,fromGone,{x:rr.width+w*.9,y:fromGone.y-w*.35,r:24,s:fromGone.s*.94,rx:0,ry:0,o:1},'toss',620,0,null).el.style.zIndex='6';}
  if(old){const el=st.cards.get(old.id);el?.classList.add('is-wait');const to=flat(()=>slotPose(old.id,W));/* the card going home slides in under its neighbours, the one coming out stays on top */if(to)fly(old.id,old,fromOld,to,kind,Math.round((FLIGHT_MS[kind]||760)*.88),0,()=>{el?.classList.remove('is-wait');}).el.style.zIndex='6';else el?.classList.remove('is-wait');}
  /* the landing pose is the field card as it sits with the scene flat (the scene settles flat during the flight, see home-depth hold) */
  if(fromPick)fly(id,g,fromPick,flat(coverPose),kind,FLIGHT_MS[kind]||760,old?120:0,()=>onLand?.(g)).el.style.zIndex='8';else onLand?.(g);}
 /* the field card goes back into its hand slot because a card from outside the hand is coming onto the field (random draw off the deck) */
 function stow(oldId,newId){const old=st.games.find(x=>x.id===oldId);if(reduced||!old||!cover.offsetWidth)return false;const W=cover.offsetWidth,
  from=(st.flights.has(oldId)&&currentPose(st.flights.get(oldId)))||coverPose();st.out=newId;st.hover=-1;render(st.games,newId);const el=st.cards.get(oldId),to=flat(()=>slotPose(oldId,W));
  if(!to)return false;el?.classList.add('is-wait');const kind=globalThis.__forceKind||pickVariant(st.last);st.last=kind;
  fly(oldId,old,from,to,kind,Math.round((FLIGHT_MS[kind]||760)*.88),0,()=>el?.classList.remove('is-wait')).el.style.zIndex='6';return true;}
 /* the field card changed some other way: take it out of the hand without a flight */
 function sync(id){if(id===st.out||st.flights.has(id))return;st.out=id;render(st.games,id);}
 const onResize=()=>relayout();addEventListener('resize',onResize);
 function stop(){removeEventListener('resize',onResize);st.flights.forEach(f=>{f.anims.forEach(a=>a.cancel());f.el.remove();f.trails.forEach(t=>t.remove());});st.flights.clear();}
 /* the fan's horizontal centre and top edge in root pixels, from the resting layout (no hover lift) */
 function extent(){const m=metrics(),n=inHand().length+st.extras.length;if(!n||!m.W)return null;const pos=handLayout(n,{...m,hover:-1}),xs=pos.map(p=>p.x),
  br=box.getBoundingClientRect(),rr=root.getBoundingClientRect();return {cx:br.left-rr.left+(Math.min(...xs)+Math.max(...xs))/2,top:br.top-rr.top+Math.min(...pos.map(p=>p.y))-m.ch/2};}
 return {render,setExtras,play,stow,sync,stop,relayout,extent,restRect,state:st,flying:()=>st.flights.size>0};}
