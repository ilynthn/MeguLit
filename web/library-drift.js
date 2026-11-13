// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 multi-track view, resting state (user: 「我想要做成我们网站里和词典里的那种随机飘的感觉 一搜索再把关键词到的作品
   苹果动画上轨道 取消搜索了就苹果动画回复飘散」).
   With no search the covers drift like the dictionary's field (dict-idle.js) and the site hero: every cover has a depth z
   (0 far, 1 near); far ones are small, dim and soft, the focal band is sharp, near ones are large and a little out of focus.
   They rise slowly with a sway, the pointer pushes the nearer ones aside like water, and a cover that leaves the top comes
   back in from below. A search sends the matches from wherever they are drifting onto the rails (the rings around the
   search capsule) and pushes the rest back into the depth; clearing it lets the matches fly back out into the drift.
   The covers persist across renders (keyed by member id), so typing, clearing and typing again mid-flight always
   continues from where each cover is: GSAP tweens only a per-cover weight (rail 0..1, recede 0..1) and overwrite from
   the current value. Each frame writes transform and opacity on classless <mg-cell> wrappers, nothing else.
   Reduced motion: a still scatter, and the matches step onto the rails without flight. */
import {loadGsap} from './gsap-loader.js';
import {capsuleY} from './grimoire.js';

const CW=168,CH=250,FOCUS=.42,TURN=60000;
const calm=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const fieldActions='[data-game],[data-edit],[data-launch],[data-series]';
const S={covers:new Map(),sources:new Map(),host:null,plane:null,pod:null,rails:null,hits:null,
 W:0,H:0,cx:0,cy:0,podW:360,podH:44,angle:-Math.PI/2,running:false,events:null,ro:null,gsap:null,raf:0,last:0,
 mx:-1e4,my:-1e4,pvx:0,pvy:0,hover:null,ringCount:0,busyUntil:0,
 cam:{z:0,px:0,py:0},camGoal:0,drag:null,railG:null,railT:''};
/* (user 2026-11-13: 滚轮可以缩放 / 按住拖动是景深效果, not the wall's pan) a camera in the field's depth. Each cover sits at
   distance D=1.6-z (near 0.6, far 1.6); the wheel dollies the camera along the depth, so near covers grow and pass by
   faster than far ones. Dragging swings the view around the focal plane: near covers follow the hand, far ones move
   the other way, the focal band stays put; letting go, the view springs back. Covers are never panned like the wall. */
const CAM_NEAR=.42,CAM_FAR=-.5,PARALLAX=1.35;
const R=(a,b)=>a+Math.random()*(b-a);
const idOf=(el,i)=>el.dataset.memberId||(el.dataset.seriesDrop?'s:'+el.dataset.seriesDrop:'i'+i);

/* depth look, after dict-idle.js: size grows with z, alpha peaks on the focal band, blur away from it (set once per cover) */
const driftScale=z=>.32+z*.46;
const driftAlpha=z=>Math.max(.22,Math.min(1,.38+.72*(1-Math.abs(z-FOCUS)*1.5)));
const blurOf=z=>{const d=Math.abs(z-FOCUS);return d<.3?0:z>FOCUS?Math.min(2.4,(d-.3)*10):Math.min(1.4,(d-.3)*7);};

function spawn(c,anywhere){
 c.x=R(-.04,1.04)*S.W;c.y=anywhere?R(-.05,1.05)*S.H:S.H+CH*.6;
 c.vx=R(-3,3);c.vy=-(5+Math.random()*9)*(.45+c.z);c.sway=Math.random()*Math.PI*2;c.wx=0;c.wy=0;
}
/* a fresh field: jittered cells so the first frame is evenly scattered, depths shuffled across cells */
function seed(list){
 const n=list.length,cols=Math.max(1,Math.round(Math.sqrt(n*S.W/Math.max(1,S.H)))),rows=Math.ceil(n/cols),cw=S.W/cols,ch=S.H/rows;
 const cells=[...Array(cols*rows).keys()].sort(()=>Math.random()-.5);
 list.forEach((c,i)=>{const k=cells[i];spawn(c,true);c.x=((k%cols)+R(.15,.85))*cw;c.y=(Math.floor(k/cols)+R(.15,.85))*ch;});
}
function makeCover(id,source){
 const node=document.createElement('mg-cell'),card=source.cloneNode(true);
 card.draggable=false;card.classList.add('field-cell');card.querySelector('.library-card-meta')?.remove();
 card.querySelectorAll('img').forEach(img=>{img.draggable=false;img.decoding='async';img.decode?.().catch(()=>{});});
 node.append(card);node.dataset.id=id;
 const z=Math.pow(Math.random(),1.25),c={id,node,z,x:0,y:0,vx:0,vy:0,sway:0,wx:0,wy:0,w:0,r:0,rx:null,ry:null,rs:1,ra:1,rd:0,slot:null,t:'',o:'',zi:-1,pe:''};
 c.blur=blurOf(z)>.15?'blur('+blurOf(z).toFixed(1)+'px)':'';node.style.filter=c.blur;
 return c;
}

/* rails: rings around the capsule, ring k holds 8+4k covers and turns the other way (the old search orbit, E245.2) */
function railGeometry(n){
 const rx=Math.max(S.podW/2+CW*.75,Math.min(S.W*.36,S.podW/2+CW*2.2)),ry=Math.max(S.podH/2+CH*.62,Math.min(S.H*.36,CH*1.15));
 const slots=[];for(let ring=0,left=n;left>0;ring++){const k=Math.min(left,8+4*ring);slots.push(k);left-=k;}
 const shrink=Math.max(.42,1-(slots.length-1)*.16)*.86,far=1+Math.max(0,slots.length-1)*.62*shrink;
 /* (round 1: the outer ring ran off the bottom) the outermost ring keeps a whole cover inside the field */
 const fitY=Math.max(40,(Math.min(S.cy,S.H-S.cy)-CH*shrink*.55-12)/far),fitX=Math.max(60,(Math.min(S.cx,S.W-S.cx)-CW*shrink*.55-12)/far);
 return {rx:Math.min(rx,fitX),ry:Math.min(ry,fitY),slots,shrink};
}
function slotPose(slot,geo){
 const {ring,k,n}=slot,spread=1+ring*.62*geo.shrink,dir=ring%2?-1:1,a=dir*S.angle+k*2*Math.PI/n+ring*.37,depth=(Math.sin(a)+1)/2;
 return {x:S.cx+Math.cos(a)*geo.rx*spread,y:S.cy+Math.sin(a)*geo.ry*spread,s:(.78+.22*depth)*geo.shrink*(1-ring*.05),a:.62+.38*depth,d:depth,ring};
}
/* matches nearest the capsule take the inner ring; inside a ring they keep their angular order, so paths do not cross */
function assignSlots(hits){
 const geo=railGeometry(hits.length),byDist=[...hits].sort((a,b)=>Math.hypot(a.x-S.cx,a.y-S.cy)-Math.hypot(b.x-S.cx,b.y-S.cy));
 let at=0;geo.slots.forEach((n,ring)=>{
  const dir=ring%2?-1:1,base=dir*S.angle+ring*.37,group=byDist.slice(at,at+n);at+=n;
  const rel=c=>{let d=Math.atan2((c.y-S.cy)/geo.ry,(c.x-S.cx)/geo.rx)-base;d=((d%(2*Math.PI))+2*Math.PI)%(2*Math.PI);return d;};
  group.sort((a,b)=>rel(a)-rel(b)).forEach((c,k)=>{c.slot={ring,k,n};});
 });
 S.geo=geo;drawRails(geo);
}
function drawRails(geo){
 if(!S.rails)return;
 const svg=S.rails,ns='http://www.w3.org/2000/svg',rings=S.hits&&S.hits.size>1?geo.slots.length:0;
 svg.setAttribute('viewBox','0 0 '+S.W+' '+S.H);
 if(!S.railG||S.railG.parentNode!==svg){S.railG=document.createElementNS(ns,'g');svg.append(S.railG);S.railT='';}const g=S.railG;
 while(g.childElementCount<rings){const e=document.createElementNS(ns,'ellipse');g.append(e);}
 [...g.children].forEach((e,ring)=>{if(ring>=rings){e.remove();return;}const spread=1+ring*.62*geo.shrink;
  e.setAttribute('cx',S.cx);e.setAttribute('cy',S.cy);e.setAttribute('rx',(geo.rx*spread).toFixed(1));e.setAttribute('ry',(geo.ry*spread).toFixed(1));});
 S.ringCount=rings;
}

/* the rails turn around the search capsule, which sits above the field's middle */
function podCentre(){const h=S.host,p=S.pod;if(!h||!p)return S.H/2;const y=capsuleY(p,h);return y>0&&y<S.H?y:S.H/2;}
function measure(){
 const h=S.host;if(!h)return;S.W=h.clientWidth;S.H=h.clientHeight;S.podW=S.pod?.offsetWidth||360;S.podH=S.pod?.offsetHeight||44;S.cx=S.W/2;S.cy=podCentre();
 if(S.hits)assignSlots([...S.covers.values()].filter(c=>S.hits.has(c.id)));
}

function frame(dt){
 const still=calm(),ts=S.gsap?S.gsap.globalTimeline.timeScale():1;dt=Math.min(.05,dt)*ts;
 /* (user: only the cover under the pointer stops, never the others) the rails keep turning; the hovered cover holds its
    own spot and glides back to its slot when the pointer leaves */
 if(!still&&S.hits)S.angle+=dt*1000*2*Math.PI/TURN;
 S.pvx*=Math.exp(-8*dt);S.pvy*=Math.exp(-8*dt);
 const geo=S.geo,follow=1-Math.exp(-dt*9);
 if(S.railG){const D=1.6-FOCUS,P=D/Math.max(.06,D-S.cam.z),t='translate('+S.cx.toFixed(1)+' '+S.cy.toFixed(1)+') scale('+P.toFixed(4)+') translate('+(-S.cx).toFixed(1)+' '+(-S.cy).toFixed(1)+')';if(t!==S.railT){S.railG.setAttribute('transform',t);S.railT=t;}}
 for(const c of S.covers.values()){
  /* the drift keeps running under a cover on the rails, so clearing the search sends it back into a living field */
  if(!still&&(c!==S.hover||S.drag)){
   c.sway+=dt*.6;const slow=1-.55*c.r;
   c.x+=((c.vx+Math.sin(c.sway)*5)*slow+c.wx)*dt;c.y+=(c.vy*slow+c.wy)*dt;
   const drag=Math.exp(-1.6*dt);c.wx*=drag;c.wy*=drag;
   const dx=(c.sx??c.x)-S.mx,dy=(c.sy??c.y)-S.my,dm=Math.hypot(dx,dy),reach=120+c.z*150;
   if(!S.drag&&c.w<.5&&dm<reach&&(S.pvx||S.pvy)){const k=(1-dm/reach)*(.4+c.z*.8)*dt*6;c.wx+=(S.pvx*1.4+dx/(dm||1)*50)*k;c.wy+=(S.pvy*1.4+dy/(dm||1)*50)*k;}
   const m=CH*driftScale(c.z)*.7;
   if(c.y<-m||c.x<-CW||c.x>S.W+CW){spawn(c,false);if(c.w<.02){c.t='';}}
   if(c.y>S.H+m*1.5)c.y=-m;
  }
  let x=c.x,y=c.y,s=driftScale(c.z),a=driftAlpha(c.z);
  /* fade in and out at the top and bottom edges instead of popping */
  const edge=Math.min(1,Math.max(0,(c.y+CH*.2)/(CH*.6)),Math.max(0,(S.H+CH*.3-c.y)/(CH*.6)));a*=edge;
  if(c.slot&&geo&&(c.w>0||S.hits?.has(c.id))){
   const p=slotPose(c.slot,geo);
   if(c.rx===null||c.w<=0){c.rx=p.x;c.ry=p.y;c.rs=p.s;c.ra=p.a;}else if(c!==S.hover){c.rx+=(p.x-c.rx)*follow;c.ry+=(p.y-c.ry)*follow;c.rs+=(p.s-c.rs)*follow;c.ra+=(p.a-c.ra)*follow;}
   c.rd=p.d;const w=c.w,lift=1+.07*Math.sin(Math.PI*Math.min(1,w));
   /* the flight bows a little away from the capsule, so covers arrive in an arc, not a straight slide */
   const bow=Math.sin(Math.PI*w)*36,ox=c.rx-S.cx,oy=c.ry-S.cy,ol=Math.hypot(ox,oy)||1;
   x=x+(c.rx-x)*w+ox/ol*bow;y=y+(c.ry-y)*w+oy/ol*bow;s=(s+(c.rs-s)*w)*lift;a=a+(c.ra-a)*w;
  }
  s*=1-.45*c.r;a*=1-.86*c.r;
  /* camera: a cover on the rails counts as sitting on the focal plane */
  {const zf=c.z+(FOCUS-c.z)*Math.min(1,c.w),D=1.6-zf,dist=D-S.cam.z,P=dist>.06?D/dist:D/.06,par=(zf-FOCUS)*PARALLAX;
   x=S.cx+(x-S.cx)*P+S.cam.px*par*P;y=S.cy+(y-S.cy)*P+S.cam.py*par*P;s*=P;
   /* a cover the camera is about to pass fades out instead of filling the window */
   a*=Math.max(0,Math.min(1,(dist-.14)/.2));c.sx=x;c.sy=y;}
  const t='translate('+(x-CW/2).toFixed(1)+'px,'+(y-CH/2).toFixed(1)+'px) scale('+s.toFixed(3)+')',o=a.toFixed(2);
  if(t!==c.t){c.node.style.transform=t;c.t=t;}
  if(o!==c.o){c.node.style.opacity=o;c.o=o;}
  const zi=c.w>.5?400+Math.round(c.rd*100)-(c.slot?.ring||0)*10:Math.round(c.z*100)+(c.r>.5?0:100);
  if(zi!==c.zi){c.node.style.zIndex=String(zi);c.zi=zi;}
  const pe=c.r>.5||a<.12?'none':'';if(pe!==c.pe){c.node.style.pointerEvents=pe;c.pe=pe;}
 }
}
function tick(){const now=performance.now(),dt=S.last?(now-S.last)/1000:0;S.last=now;frame(dt);}
function startLoop(){
 if(S.running)return;S.running=true;S.last=0;
 if(S.gsap){S.gsap.ticker.add(tick);return;}
 const loop=()=>{if(!S.running||S.gsap)return;tick();S.raf=requestAnimationFrame(loop);};S.raf=requestAnimationFrame(loop);
}
function stopLoop(){S.running=false;cancelAnimationFrame(S.raf);S.gsap?.ticker.remove(tick);}

/* search state -> per-cover weights, tweened from wherever they are now */
function retarget(fresh){
 const all=[...S.covers.values()],hits=S.hits?all.filter(c=>S.hits.has(c.id)):[];
 if(S.hits)assignSlots(hits);else drawRails(railGeometry(0));
 const g=S.gsap,still=calm()||!g;
 const order=[...all].sort((a,b)=>Math.hypot(a.x-S.cx,a.y-S.cy)-Math.hypot(b.x-S.cx,b.y-S.cy));
 order.forEach((c,i)=>{
  const on=!!S.hits&&S.hits.has(c.id),back=!!S.hits&&!on;
  if(on&&c.w<=0){c.rx=null;}
  if(on&&c.node.style.filter)c.node.style.filter='';
  if(still){c.w=on?1:0;c.r=back?1:0;if(!on&&c.blur)c.node.style.filter=c.blur;return;}
  /* matches nearest the capsule move first; leaving the rails, the outer ones go first */
  const delay=fresh?0:Math.min(.22,i*.006);
  g.to(c,{w:on?1:0,duration:on?.95:.85,delay,ease:on?'expo.out':'power3.inOut',overwrite:'auto',onComplete:on?null:()=>{if(c.w<=0&&c.blur&&!c.node.style.filter)c.node.style.filter=c.blur;}});
  g.to(c,{r:back?1:0,duration:back?.6:.8,ease:back?'power2.out':'power2.inOut',overwrite:'auto'});
 });
 if(S.rails){const show=S.ringCount>0;if(still||!g){S.rails.style.opacity=show?'1':'0';}
  else g.to(S.rails,{opacity:show?1:0,scale:show?1:.92,transformOrigin:S.cx+'px '+S.cy+'px',duration:show?.7:.45,ease:show?'expo.out':'power2.in',overwrite:'auto'});}
 S.busyUntil=performance.now()+1100;
}

export function driftMount(host,grid,plane,items,filtered,pod){
 const first=S.host!==host||!S.covers.size;
 S.host=host;S.plane=plane;S.pod=pod;
 host.classList.add('field-drift');
 S.W=host.clientWidth;S.H=host.clientHeight;S.podW=pod?.offsetWidth||360;S.podH=pod?.offsetHeight||44;S.cx=S.W/2;S.cy=podCentre();
 const list=items.filter(el=>el.nodeType===1),ids=list.map(idOf);
 S.sources=new Map(list.map((el,i)=>[ids[i],el]));
 /* an unfiltered render is the full library: covers for games that are gone leave, new games join the field */
 if(!filtered){const keep=new Set(ids);for(const [id,c] of S.covers)if(!keep.has(id)){c.node.remove();S.covers.delete(id);}}
 const born=[];
 list.forEach((el,i)=>{if(!S.covers.has(ids[i])){const c=makeCover(ids[i],el);S.covers.set(ids[i],c);born.push(c);}});
 if(born.length){if(first&&!filtered)seed(born);else born.forEach(c=>spawn(c,true));}
 S.rails?.remove();
 const ns='http://www.w3.org/2000/svg',rails=document.createElementNS(ns,'svg');rails.setAttribute('class','drift-rails');rails.setAttribute('aria-hidden','true');
 rails.style.opacity=S.ringCount?'1':'0';S.rails=rails;
 const frag=document.createDocumentFragment();frag.append(rails);for(const c of S.covers.values()){c.t='';c.o='';c.zi=-1;frag.append(c.node);}plane.append(frag);
 S.hits=filtered?new Set(ids):null;
 if(!filtered)S.full=true;else if(first)S.full=false;
 S.events?.abort();S.events=new AbortController();const signal=S.events.signal;
 host.addEventListener('pointermove',e=>{const b=host.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
  if(S.mx>-1e3){S.pvx=S.pvx*.6+(x-S.mx)*.4*30;S.pvy=S.pvy*.6+(y-S.my)*.4*30;}S.mx=x;S.my=y;},{signal});
 host.addEventListener('pointerleave',()=>{S.mx=S.my=-1e4;S.hover=null;},{signal});
 host.addEventListener('wheel',e=>{if(e.target.closest('.field-search,.series-select-bar,.series-suggestions,.bp-bar'))return;e.preventDefault();
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1);S.camGoal=Math.max(CAM_FAR,Math.min(CAM_NEAR,S.camGoal-delta*.0011));
  if(S.gsap&&!calm())S.gsap.to(S.cam,{z:S.camGoal,duration:.7,ease:'power3.out',overwrite:'auto'});else{S.cam.z=S.camGoal;frame(0);}},{passive:false,signal});
 host.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0||e.target.closest('input,select,button:not(.game-card),.field-search,.bp-bar,.series-select-bar,.series-suggestions'))return;
  S.gsap?.killTweensOf(S.cam,'px,py');S.drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:S.cam.px,py:S.cam.py,moved:false};},{signal});
 addEventListener('pointermove',e=>{const d=S.drag;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(!d.moved){if(Math.hypot(dx,dy)<6)return;d.moved=true;S.hover=null;host.classList.add('drift-dragging');try{host.setPointerCapture(e.pointerId);}catch{}}
  /* past a point the hand meets resistance, like pulling on a lens */
  const soft=v=>Math.sign(v)*420*(1-Math.exp(-Math.abs(v)/420));S.cam.px=d.px+soft(dx);S.cam.py=d.py+soft(dy);if(calm())frame(0);},{signal});
 const release=e=>{const d=S.drag;if(!d||d.id!==e.pointerId)return;S.drag=null;host.classList.remove('drift-dragging');if(d.moved)S.suppress=performance.now();
  if(S.gsap&&!calm())S.gsap.to(S.cam,{px:0,py:0,duration:1.1,ease:'back.out(1.5)',overwrite:'auto'});else{S.cam.px=S.cam.py=0;frame(0);}};
 addEventListener('pointerup',release,{signal});addEventListener('pointercancel',release,{signal});
 plane.addEventListener('pointerover',e=>{if(S.drag?.moved)return;const n=e.target.closest('mg-cell');S.hover=n?S.covers.get(n.dataset.id)||null:null;},{signal});
 plane.addEventListener('pointerout',e=>{if(!e.relatedTarget||!e.relatedTarget.closest?.('mg-cell'))S.hover=null;},{signal});
 host.addEventListener('click',e=>{if(performance.now()-(S.suppress||0)<250&&e.detail){e.preventDefault();e.stopPropagation();return;}const hit=e.target.closest(fieldActions),n=hit&&hit.closest('mg-cell'),source=n&&S.sources.get(n.dataset.id);if(!source)return;
  const action=[...hit.attributes].find(attr=>['data-game','data-edit','data-launch','data-series'].includes(attr.name));
  if(action){e.preventDefault();e.stopPropagation();source.querySelector('['+action.name+']')?.click();}},{capture:true,signal});
 S.ro?.disconnect();S.ro=new ResizeObserver(()=>measure());S.ro.observe(host);if(pod)S.ro.observe(pod);
 const warm=!!window.__megulitOrbitWarm;
 /* entering the view cold, the field fades up out of the depth */
 if(first&&!warm&&!calm()){for(const c of S.covers.values())c.r=1;}
 retarget(false);
 frame(0);
 if(!calm())startLoop();
 if(!S.gsap)loadGsap().then(g=>{S.gsap=g;if(S.running){cancelAnimationFrame(S.raf);g.ticker.add(tick);}if(S.host===host)retarget(true);}).catch(()=>{});
 return ()=>{stopLoop();S.events?.abort();S.ro?.disconnect();host.classList.remove('field-drift');S.hover=null;};
}
/* for the evidence harness: true while a search flight or return is still playing */
Object.defineProperty(window,'__driftBusy',{configurable:true,get:()=>performance.now()<S.busyUntil});
/* 2026-11-13 (CDP: each keystroke rebuilt the library DOM, 50-130 ms frames mid-flight): when the field already holds the
   whole library, a search only re-aims the covers that are there; no render, no DOM moves. Returns false when it cannot
   (field not mounted, or a hit has no cover yet), and the caller renders as before. */
export function driftFilter(host,ids){
 if(!S.full||S.host!==host||!host.isConnected||!host.classList.contains('field-drift'))return false;
 if(ids&&ids.some(id=>!S.covers.has(id)))return false;
 const next=ids?new Set(ids):null,same=(!next&&!S.hits)||(next&&S.hits&&next.size===S.hits.size&&[...next].every(id=>S.hits.has(id)));
 if(same)return true;
 /* a search where only one game is left keeps it on the rails like any other */
 S.hits=next;retarget(false);return true;
}
