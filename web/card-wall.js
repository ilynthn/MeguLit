// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 卡面墙 (Card Wall, shared spec scratchpad/cardwall/SPEC.md): rigid clear toploaders hang on a wall, empty or
   holding a collectible card the player made from a CG, a cover or a MeguLit scene shot. Opened from the library capsule.
   The wall is the library wall's motion (grimoire.js fieldify): the same drag velocity estimate, the same 105 ms coast
   decay with no snap on release, the same chased wheel zoom (85 ms), the same lens falloff and speed stretch, covers in
   classless <mg-cell> wrappers moved by transform and opacity only. It is finite: the pan stops at the wall's edges.
   The second mode is the library's simple list (a scrolling grid); the switch is a FLIP, like library-switch-motion.
   Every toploader motion (insert, eject, hang, the viewer's shared-element zoom) runs on one small spring integrator,
   so any motion can be retargeted mid-flight from its current position and velocity. Reduced motion jumps to the end. */
import {fxPref} from './fx-prefs.js';

const reduceQuery=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
const reduce=()=>reduceQuery.matches;
const WORDS={
 zh:{inspect:'拖动自由旋转 · 滚轮缩放 · 双击摆正',title:'卡面墙',back:'游戏库',list:'简洁列表',add:'加 Toploader',empty:'空 Toploader：点一下制作收藏卡',filled:'查看收藏卡',eject:'从 Toploader 取出',insert:'放回 Toploader',close:'关闭',flip:'点卡片翻面',loading:'制卡功能加载中',failed:'操作没有成功，请再试一次',count:(a,b)=>a+' / '+b},
 en:{inspect:'Drag to turn · wheel to zoom · double-click to face on',title:'Card wall',back:'Library',list:'Simple list',add:'Add toploader',empty:'Empty toploader: click to make a card',filled:'View card',eject:'Take out of toploader',insert:'Put back in toploader',close:'Close',flip:'Click the card to turn it over',loading:'The card maker is loading',failed:'That did not work, please try again',count:(a,b)=>a+' / '+b},
 ja:{inspect:'ドラッグで回転 · ホイールで拡大 · ダブルクリックで正面',title:'カードウォール',back:'ライブラリ',list:'シンプル表示',add:'トップローダーを追加',empty:'空のトップローダー：クリックでカードを作る',filled:'カードを見る',eject:'トップローダーから出す',insert:'トップローダーに戻す',close:'閉じる',flip:'カードをクリックで裏返す',loading:'カード作成を読み込み中',failed:'うまくいきませんでした。もう一度お試しください',count:(a,b)=>a+' / '+b}
};
const words=()=>{const l=String(document.documentElement.lang||'zh').toLowerCase();return WORDS[l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh'];};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

/* ---------- API (spec: cards_state / cards_insert / cards_eject / cards_add_toploaders / cards_set_mode) ---------- */
const invoke=(command,args={})=>{
 if(window.__TOME_TEST_TRANSPORT__)return window.__TOME_TEST_TRANSPORT__(command,args);
 const native=window.__TAURI_INTERNALS__?.invoke;
 if(!native)return Promise.reject(Error('DESKTOP_REQUIRED'));
 return native(command,args);
};
/* until the service answers the card actions, the page runs on an in-memory wall (development only) */
let offline=null;
const unknownAction=e=>/unknown|unsupported|not (found|implemented|supported)|DESKTOP_REQUIRED|no such action/i.test(String(e?.message||e));
function offlineWall(){
 if(offline)return offline;
 offline={toploaders:Array.from({length:50},(_,i)=>({id:'tl'+(i+1),cardId:null,order:i})),cards:[],mode:'a'};
 return offline;
}
function offlineCall(action,p){
 const s=offlineWall(),copy=()=>JSON.parse(JSON.stringify(s));
 if(action==='cards_state')return copy();
 if(action==='cards_insert'){const t=s.toploaders.find(x=>x.id===p.toploaderId);if(t)t.cardId=p.cardId;return copy();}
 if(action==='cards_eject'){const t=s.toploaders.find(x=>x.id===p.toploaderId);if(t)t.cardId=null;return copy();}
 if(action==='cards_add_toploaders'){const n=Math.max(1,Math.min(200,p.count|0||1));for(let i=0;i<n;i++){const o=s.toploaders.length;s.toploaders.push({id:'tl'+(o+1)+'-'+Date.now().toString(36),cardId:null,order:o});}return copy();}
 if(action==='cards_set_mode'){s.mode=p.mode==='b'?'b':'a';return copy();}
 return null;
}
async function call(action,params={}){
 if(!offline){
  try{const r=await invoke('service',{request:{action,...params}});if(r!=null)return r;}
  catch(e){if(!unknownAction(e))throw e;}
  console.warn('card wall: service has no',action,'- using an in-memory wall');
 }
 return offlineCall(action,params);
}

/* ---------- springs: one integrator for every toploader motion ----------
   Each value has its own stiffness k and damping c (mass 1, per second). Retargeting keeps position and velocity, so an
   interrupted motion carries on from where it is. Optional walls bounce a value (a card hitting the sleeve's bottom). */
const live=new Set();let loopId=0;
function loop(now){loopId=0;for(const s of [...live])s.tick(now);if(live.size)loopId=requestAnimationFrame(loop);}
class Spring{
 constructor(values,render,eps={}){this.x={...values};this.goal={...values};this.v={};this.k={};this.c={};this.walls={};this.eps=eps;this.render=render;this.last=0;this.waits=[];
  for(const key in values){this.v[key]=0;this.k[key]=170;this.c[key]=26;}}
 to(goal,{k=170,c=26,v=null}={}){
  for(const key in goal){this.goal[key]=goal[key];this.k[key]=k;this.c[key]=c;if(!(key in this.x)){this.x[key]=goal[key];this.v[key]=0;}if(v&&key in v)this.v[key]=v[key];}
  if(reduce()){this.jump(goal);return this;}
  this.run();return this;
 }
 jump(values){Object.assign(this.x,values);Object.assign(this.goal,values);for(const key in values)this.v[key]=0;this.render(this.x);this.check(true);return this;}
 kick(v){for(const key in v)this.v[key]=(this.v[key]||0)+v[key];if(!reduce())this.run();return this;}
 wall(key,max,bounce){if(max==null)delete this.walls[key];else this.walls[key]={max,bounce};return this;}
 run(){if(!live.has(this)){this.last=0;live.add(this);this.onrun?.();}if(!loopId)loopId=requestAnimationFrame(loop);}
 stop(){if(live.delete(this))this.onidle?.();}
 near(key){const e=this.eps[key]??.05;return Math.abs(this.x[key]-this.goal[key])<=e&&Math.abs(this.v[key])<=e*10;}
 tick(now){
  const dt=this.last?Math.min(.034,Math.max(.001,(now-this.last)/1000)):1/60;this.last=now;
  const steps=Math.ceil(dt/.004),h=dt/steps;
  for(let i=0;i<steps;i++)for(const key in this.goal){
   const a=-this.k[key]*(this.x[key]-this.goal[key])-this.c[key]*this.v[key];
   this.v[key]+=a*h;this.x[key]+=this.v[key]*h;
   const w=this.walls[key];if(w&&this.x[key]>w.max){this.x[key]=w.max;if(this.v[key]>0)this.v[key]=-this.v[key]*w.bounce;}
  }
  let moving=false;for(const key in this.goal)if(!this.near(key)){moving=true;break;}
  if(!moving){Object.assign(this.x,this.goal);for(const key in this.v)this.v[key]=0;live.delete(this);this.onidle?.();}
  this.render(this.x);this.check(!moving);
 }
 check(settled){this.waits=this.waits.filter(w=>{if(settled||w.pred(this.x,this.v)){w.res(true);return false;}return true;});}
 until(pred){if(pred(this.x,this.v)||!live.has(this))return Promise.resolve(true);return new Promise(res=>this.waits.push({pred,res}));}
 settled(){return this.until(()=>false);}
}

/* ---------- a card's still framing, and the slow Ken Burns move around it ----------
   still = {x,y,scale}: x/y the centre of the framing as a fraction of the picture (0..1), scale the zoom over a
   cover fit (>= 1). Offsets are clamped so the picture always covers the card. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function stillTransform(still,dx=0,dy=0,ds=1){
 const s=Math.max(1,Number(still?.scale)||1)*ds,m=(s-1)/(2*s)*100;
 const tx=clamp((.5-(Number(still?.x??.5)))*100+dx,-m,m),ty=clamp((.5-(Number(still?.y??.5)))*100+dy,-m,m);
 return 'scale('+s.toFixed(4)+') translate('+tx.toFixed(3)+'%,'+ty.toFixed(3)+'%)';
}
function hash(s){let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.codePointAt(0),16777619);return h>>>0;}
function kenBurns(img,card,phase){
 for(const a of img.getAnimations())a.cancel();
 const base=stillTransform(card.still);img.style.transform=base;
 if(reduce())return;
 const h=hash(card.id),ang=(h%360)*Math.PI/180,r=2.2;
 const to=stillTransform(card.still,Math.cos(ang)*r,Math.sin(ang)*r,1.075);
 const a=img.animate([{transform:base},{transform:to}],{duration:22000,iterations:Infinity,direction:'alternate',easing:'cubic-bezier(.42,0,.58,1)'});
 a.currentTime=phase||0;
}
/* out of the sleeve the card stops on its still framing: glide from wherever the move is to the still, then rest */
function freeze(img,card){
 const from=getComputedStyle(img).transform;
 for(const a of img.getAnimations())a.cancel();
 const to=stillTransform(card.still);img.style.transform=to;
 if(!reduce()&&from&&from!=='none')img.animate([{transform:from},{transform:to}],{duration:720,easing:'cubic-bezier(.2,.8,.2,1)'});
}
const kbPhase=img=>{const a=img?.getAnimations?.()[0];return a?Number(a.currentTime)||0:undefined;};

/* ---------- the card back: the collectible card's crest (detail-flip.js), the title's first character ---------- */
const glyphOf=title=>[...String(title||'')].find(c=>/[一-鿿぀-ヿ]/.test(c))||String(title||' ').trim().charAt(0).toUpperCase()||'M';
const crestHTML=card=>`<div class="dtv-back-art is-crest"><i class="dtv-ring"></i><i class="dtv-ring is-inner"></i><b>${esc(card?.initial||glyphOf(card?.title))}</b><span>MeguLit</span><small>${esc(card?.title||'')}</small></div>`;

/* ---------- toploader markup ---------- */
const TL_W=168,TL_H=226,CARD_W=146,CARD_H=204,CARD_TOP=12;
const ABOVE=-(CARD_H+CARD_TOP)+4; /* the card's bottom edge just inside the opening */
function buildToploader(t,card,{withBack=false}={}){
 const el=document.createElement('div');
 el.className='cw-tl'+(card?' is-filled':'');el.dataset.tl=t.id;el.tabIndex=0;el.setAttribute('role','button');
 el.setAttribute('aria-label',card?words().filled+(card.title?' · '+card.title:''):words().empty);
 /* the pin stays on the wall; the hang tab, the sleeve and its card swing on it together */
 el.innerHTML=`<div class="cw-hang"><i class="cw-tab" aria-hidden="true"></i><i class="cw-pin" aria-hidden="true"></i><div class="cw-tilt"><i class="cw-drop" aria-hidden="true"></i>`+
  `<div class="cw-card"><i class="cw-lift" aria-hidden="true"></i><div class="cw-flip"><div class="cw-face"><img class="cw-art" alt="" draggable="false" decoding="async"><i class="cw-foil"></i></div>${withBack?`<div class="cw-back">${crestHTML(card)}</div>`:''}</div></div>`+
  `<div class="cw-shell" aria-hidden="true"><i class="cw-glare"></i><i class="cw-sweep"></i><i class="cw-lip"></i></div>${withBack?'<div class="cw-thick" aria-hidden="true"><i class="cw-pane"></i><i class="cw-side is-l"></i><i class="cw-side is-r"></i><i class="cw-side is-b"></i><i class="cw-side is-t"></i></div>':''}</div></div>`;
 const parts={el,hang:el.querySelector('.cw-hang'),tilt:el.querySelector('.cw-tilt'),card:el.querySelector('.cw-card'),flip:el.querySelector('.cw-flip'),img:el.querySelector('.cw-art'),shell:el.querySelector('.cw-shell'),sweep:el.querySelector('.cw-sweep'),back:el.querySelector('.cw-back'),lift:el.querySelector('.cw-lift'),drop:withBack?el.querySelector('.cw-drop'):null,thick:el.querySelector('.cw-thick')};
 {const h=hash(t.id);parts.el.querySelector('.cw-glare').style.translate=((h%41)-20)+'% '+(((h>>6)%17)-8)+'%';}
 fill(parts,card);
 return parts;
}
function fill(parts,card,phase){
 parts.cardData=card||null;parts.el.__parts=parts;
 parts.el.classList.toggle('is-filled',!!card);
 parts.el.setAttribute('aria-label',card?words().filled+(card.title?' · '+card.title:''):words().empty);
 if(card){if(parts.img.getAttribute('src')!==card.src)parts.img.src=card.src;parts.img.decode?.().catch(()=>{});if(parts.live)kenBurns(parts.img,card,0);else{for(const a of parts.img.getAnimations())a.cancel();parts.img.style.transform=stillTransform(card.still);}}
 else{for(const a of parts.img.getAnimations())a.cancel();parts.img.removeAttribute('src');}
 if(parts.back)parts.back.innerHTML=crestHTML(card);
 motion(parts).jump({cy:0,cx:0,cr:0,co:card?1:0});
}
/* the toploader's own spring: card (cx,cy,cr,co,f flip), shell (sx,sy press), glare sweep g, hang (hr swing, hy, ho) */
function motion(parts){
 if(parts.spring)return parts.spring;
 const {card,shell,sweep,hang}=parts;
 parts.spring=new Spring({cx:0,cy:0,cr:0,co:0,so:1,sx:1,sy:1,g:0,hr:0,hy:0,ho:1},x=>{
  /* 2D only: the depth behind the shell comes from the CSS translate while the toploader tilts (no layer per card at rest) */
  card.style.transform=x.cx||x.cy||x.cr?'translate('+x.cx.toFixed(2)+'px,'+x.cy.toFixed(2)+'px) rotate('+x.cr.toFixed(3)+'deg)':'';
  card.style.opacity=clamp(x.co,0,1).toFixed(3);
  parts.lift.style.opacity=clamp(-x.cy/55,0,1).toFixed(3);
  if(parts.drop){const so=clamp(x.so,0,1).toFixed(3);shell.style.opacity=so;parts.drop.style.opacity=so;if(parts.thick)parts.thick.style.opacity=so;}
  shell.style.transform=x.sx===1&&x.sy===1?'':'scale('+x.sx.toFixed(4)+','+x.sy.toFixed(4)+')';
  const g=clamp(x.g,0,1);sweep.style.opacity=(Math.sin(Math.PI*g)*.9).toFixed(3);sweep.style.transform='translateX('+(-120+g*240).toFixed(1)+'%)';
  hang.style.transform=x.hr||x.hy?'translateY('+x.hy.toFixed(2)+'px) rotate('+x.hr.toFixed(3)+'deg)':'';
  hang.style.opacity=clamp(x.ho,0,1).toFixed(3);
 },{cx:.3,cy:.3,cr:.02,co:.004,so:.004,sx:.0006,sy:.0006,g:.004,hr:.02,hy:.2,ho:.004});
 /* while it moves, the toploader's moving parts get their own layers (one cell restyles, nothing else), then drop them */
 parts.spring.onrun=()=>parts.el.classList.add('cw-anim');
 parts.spring.onidle=()=>parts.el.classList.remove('cw-anim');
 return parts.spring;
}

/* ---------- the motions ----------
   Each sequence takes a ticket; a newer motion on the same toploader invalidates it, and the new one starts from the
   springs' current state, so an interrupted insert turns into an eject (or back) without a jump. */
const ticket=parts=>(parts.seq=(parts.seq||0)+1);
async function insertMotion(parts,{from='above'}={}){
 const t=ticket(parts),s=motion(parts),alive=()=>parts.seq===t;
 s.wall('cy',null);
 if(from==='above'&&s.x.co<.05)s.jump({cy:ABOVE-120,cx:0,cr:-5,co:0});
 /* 1. carried in, squared up over the opening */
 s.to({cy:ABOVE,cx:0,cr:0},{k:150,c:21}).to({co:1},{k:260,c:34});
 await s.until(x=>Math.abs(x.cy-ABOVE)<4&&Math.abs(x.cr)<.6);if(!alive())return false;
 /* 2. a light press: the sleeve gives a little at the mouth and a light runs across the plastic */
 s.to({cy:ABOVE+46},{k:320,c:36}).to({sx:1.016,sy:.993},{k:520,c:40}).to({g:1},{k:46,c:13});
 await s.until(x=>x.cy>ABOVE+30);if(!alive())return false;
 s.to({sx:1,sy:1},{k:420,c:15});
 /* 3. it slides home and rebounds off the sleeve's bottom; the toploader sways on its pin */
 s.wall('cy',0,.5).to({cy:0},{k:130,c:8});
 await s.until(x=>x.cy>-2);if(!alive())return false;
 s.kick({hr:-16,sy:-.06}).to({hr:0},{k:60,c:4.2}).to({sx:1,sy:1},{k:520,c:16});
 await s.settled();if(!alive())return false;
 s.wall('cy',null).jump({g:0});
 return true;
}
async function ejectMotion(parts,{loose=false}={}){
 const t=ticket(parts),s=motion(parts),alive=()=>parts.seq===t;
 s.wall('cy',null);
 /* 1. pinched at the top and drawn up against the plastic's grip: slow, heavily damped */
 s.to({cy:-44},{k:70,c:24}).to({sx:.996,sy:1.004},{k:300,c:30});
 await s.until(x=>x.cy<-30);if(!alive())return false;
 if(loose)s.to({so:0},{k:120,c:22});
 /* 2. free of the grip it lifts clear with a small spring, the sleeve relaxes and sways */
 s.to({sx:1,sy:1},{k:420,c:16}).to({cy:loose?ABOVE+70:ABOVE-36},{k:200,c:loose?22:17,v:{cy:-520}}).kick({hr:5}).to({hr:0},{k:60,c:5.5});
 await s.until(x=>x.cy<ABOVE+(loose?110:30));if(!alive())return false;
 /* 3. (inspect) the empty sleeve fades away and the bare card settles where the sleeve was */
 if(loose){s.to({so:0},{k:220,c:30}).to({cy:0},{k:210,c:27});await s.until(x=>x.cy>-60);return alive();}
 await s.settled();
 return alive();
}
/* hung on the wall: dropped from a little above, it swings on the pin and settles */
function hangMotion(parts,delay=0){
 const s=motion(parts);
 /* each toploader swings a little differently (amplitude ±20%, slightly different period), from plumb */
 const h=hash(parts.el.dataset.tl||''),amp=.8+(h%41)/100,dir=h&64?1:-1;
 s.jump({hy:-30,hr:0,ho:0});
 const go=()=>s.to({hy:0},{k:190,c:20}).to({ho:1},{k:260,c:34}).kick({hr:dir*95*amp}).to({hr:0},{k:140+(h%37),c:4.8});
 if(delay&&!reduce())setTimeout(go,delay);else go();
}

/* ---------- hover: tilt and sheen like the library's covers, through the shell ---------- */
let hoverEl=null,hoverRaf=0,hoverEv=null;
function tiltReset(el){
 if(!el||!el.isConnected)return;
 el.classList.remove('is-tilting');el.classList.add('tilt-out');
 for(const k of ['--rx','--ry'])el.style.setProperty(k,'0deg');
 el.style.setProperty('--px','0');el.style.setProperty('--py','0');
 clearTimeout(el.__tiltOut);el.__tiltOut=setTimeout(()=>{if(el.classList.contains('is-tilting'))return;el.classList.remove('tilt-out');for(const k of ['--rx','--ry','--mx','--my','--px','--py'])el.style.removeProperty(k);},620);
}
/* user correction 2026-11-13: on the wall the card rests on its still; under the pointer the CG starts to drift from the
   still, and when the pointer leaves it glides back to the still */
function liveCG(tilt,on){
 const parts=tilt?.closest('.cw-tl')?.__parts;if(!parts?.cardData)return;
 parts.live=on;if(on)kenBurns(parts.img,parts.cardData,0);else freeze(parts.img,parts.cardData);
}
function tiltPaint(){
 hoverRaf=0;if(!hoverEl||!hoverEv)return;const r=hoverEl.getBoundingClientRect();if(!r.width)return;
 const x=clamp((hoverEv.clientX-r.left)/r.width,0,1),y=clamp((hoverEv.clientY-r.top)/r.height,0,1),big=hoverEl.closest('.cw-ghost')?1.25:1;
 hoverEl.style.setProperty('--ry',((x-.5)*16*big).toFixed(2)+'deg');hoverEl.style.setProperty('--rx',((.5-y)*14*big).toFixed(2)+'deg');
 hoverEl.style.setProperty('--mx',(x*100).toFixed(1)+'%');hoverEl.style.setProperty('--my',(y*100).toFixed(1)+'%');
 hoverEl.style.setProperty('--px',((x-.5)*2).toFixed(3));hoverEl.style.setProperty('--py',((y-.5)*2).toFixed(3));
 clearTimeout(hoverEl.__tiltOut);hoverEl.classList.remove('tilt-out');hoverEl.classList.add('is-tilting');
}
function onHover(e){
 if(reduce()||!fxPref('cardTilt').on)return;
 if(e.buttons||document.querySelector('.cw-page.cw-moving,.cw-page.cw-dragging')){if(hoverEl){liveCG(hoverEl,false);tiltReset(hoverEl);hoverEl=null;}return;}
 const el=e.target?.closest?.('.cw-ghost')?null:e.target?.closest?.('.cw-field .cw-tl .cw-tilt')||null;
 if(el!==hoverEl){liveCG(hoverEl,false);tiltReset(hoverEl);hoverEl=el;liveCG(hoverEl,true);}
 if(!hoverEl)return;hoverEv=e;if(!hoverRaf)hoverRaf=requestAnimationFrame(tiltPaint);
}

/* ---------- the page ---------- */
let page=null;
const cardOf=(state,t)=>t.cardId?state.cards.find(c=>c.id===t.cardId)||null:null;
const sorted=list=>[...list].sort((a,b)=>(a.order??0)-(b.order??0));

export async function openCardWall(main=document.querySelector('#main')){
 if(page){page.root.focus?.();return page;}
 const w=words();
 const root=document.createElement('section');
 root.className='cw-page';root.setAttribute('aria-label',w.title);root.tabIndex=-1;
 root.innerHTML=`<div class="cw-field"><div class="cw-plane"></div></div>`+
  `<div class="field-search cw-pod"><span class="side"><button type="button" class="icon-button cw-back-btn" aria-label="${esc(w.back)}" title="${esc(w.back)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button></span>`+
  `<span class="cw-title"><b>${esc(w.title)}</b><small class="cw-count"></small></span>`+
  `<span class="side"><button type="button" class="library-wall-toggle cw-mode" role="switch" aria-label="${esc(w.list)}" title="${esc(w.list)}"></button><button type="button" class="icon-button cw-add" aria-label="${esc(w.add)}" title="${esc(w.add)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M12 9v6M9 12h6"/></svg></button></span></div>`+
  `<div class="cw-toast" role="status" aria-live="polite"></div>`;
 document.body.append(root);
 const field=root.querySelector('.cw-field'),plane=root.querySelector('.cw-plane');
 const P=page={root,field,plane,main,cells:new Map(),state:null,mode:'a',view:{x:0,y:0,z:1},cols:1,rows:1,events:new AbortController()};
 const signal=P.events.signal;
 /* the page covers the main area only (the top bar stays as it is) */
 const place=()=>{const r=(P.main&&P.main.isConnected?P.main:document.documentElement).getBoundingClientRect();root.style.left=r.left+'px';root.style.top=r.top+'px';root.style.width=r.width+'px';root.style.height=r.height+'px';};
 place();
 const ro=new ResizeObserver(()=>{place();measure();relayout();});if(P.main)ro.observe(P.main);ro.observe(root);
 /* navigating away rebuilds #main; the library's capsule going away closes the wall */
 const pod=P.main?.querySelector('.field-search');
 const mo=new MutationObserver(()=>{if(pod&&!pod.isConnected)closeCardWall({instant:true});});if(P.main)mo.observe(P.main,{childList:true,subtree:false});
 /* the library under the page is covered: take it out of rendering, so its ~90 cover layers are not composited with
    every frame of the card wall (CDP: Layerize 3.5 ms a frame with it, 0.x without). Restored on close. */
 const hidden=P.main?[...P.main.children].filter(el=>!el.matches('.field-search')&&getComputedStyle(el).visibility!=='hidden'):[];
 const hide=()=>{for(const el of hidden)el.style.visibility='hidden';};
 if(reduce())hide();else setTimeout(()=>{if(page===P)hide();},280);
 P.cleanup=()=>{ro.disconnect();mo.disconnect();for(const el of hidden)el.style.visibility='';};
 root.querySelector('.cw-back-btn').addEventListener('click',()=>closeCardWall(),{signal});
 root.querySelector('.cw-add').addEventListener('click',e=>addToploaders(e.shiftKey?10:1),{signal});
 root.querySelector('.cw-mode').addEventListener('click',()=>setMode(P.mode==='a'?'b':'a'),{signal});
 addEventListener('keydown',e=>{if(e.key==='Escape'&&page===P&&!P.viewer){e.preventDefault();closeCardWall();}},{signal});
 document.addEventListener('pointermove',onHover,{passive:true,capture:true,signal});
 addEventListener('megulit:cards-changed',e=>refresh(e.detail),{signal});
 wireWall(P);
 if(!reduce())root.animate([{opacity:0},{opacity:1}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});
 try{P.state=await call('cards_state');}catch(e){console.warn('cards_state',e);P.state=offlineCall('cards_state',{});}
 if(page!==P)return null;
 P.mode=P.state.mode==='b'?'b':'a';
 build(true);
 return P;
}
export function closeCardWall({instant=false}={}){
 const P=page;if(!P)return;page=null;
 P.viewer?.dispose();P.events.abort();P.cleanup?.();cancelAnimationFrame(P.raf);
 if(hoverEl&&P.root.contains(hoverEl))hoverEl=null;
 for(const c of P.cells.values())c.parts.spring?.stop();
 if(instant||reduce()){P.root.remove();return;}
 P.root.style.pointerEvents='none';
 P.root.animate([{opacity:1},{opacity:0}],{duration:200,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}).finished.catch(()=>{}).finally(()=>P.root.remove());
}
export const isCardWallOpen=()=>!!page;

function toast(text){
 const el=page?.root.querySelector('.cw-toast');if(!el)return;el.textContent=text;el.classList.add('show');
 clearTimeout(el.__t);el.__t=setTimeout(()=>el.classList.remove('show'),2400);
}
function updateCount(){
 const P=page;if(!P?.state)return;const filled=P.state.toploaders.filter(t=>t.cardId).length;
 P.root.querySelector('.cw-count').textContent=words().count(filled,P.state.toploaders.length);
 const m=P.root.querySelector('.cw-mode');m.setAttribute('aria-checked',String(P.mode==='b'));
 P.root.dataset.mode=P.mode;
}

/* cells: one <mg-cell> per toploader, kept across refreshes */
function build(first=false){
 const P=page;if(!P)return;
 const list=sorted(P.state.toploaders),seen=new Set(),frag=document.createDocumentFragment();
 list.forEach((t,i)=>{
  seen.add(t.id);let cell=P.cells.get(t.id);const card=cardOf(P.state,t);
  if(!cell){const node=document.createElement('mg-cell'),parts=buildToploader(t,card);node.append(parts.el);cell={node,parts,t:'',o:'',index:i,id:t.id};P.cells.set(t.id,cell);frag.append(node);}
  cell.index=i;cell.data=t;
 });
 for(const [id,cell] of P.cells)if(!seen.has(id)){cell.node.remove();P.cells.delete(id);}
 if(frag.childNodes.length)P.plane.append(frag);
 /* DOM order follows the toploaders' order (the list mode reads it) */
 const nodes=list.map(t=>P.cells.get(t.id).node);if(nodes.some((n,i)=>P.plane.children[i]!==n))P.plane.append(...nodes);
 updateCount();
 measure();layoutGrid();
 if(first&&P.mode==='a'){const across=Math.max(1,Math.floor(P.width/P.cw));P.view.x=(Math.min(across,P.cols)-1)*P.cw/2;P.view.y=Math.max(0,(Math.min(P.rows,Math.floor(P.height/P.ch))-1))*P.ch/2;P.view.z=1;P.zoomTarget=1;}
 relayout();
 if(first&&!reduce()){let n=0;for(const cell of P.cells.values()){if(n<36&&onScreen(cell))hangMotion(cell.parts,n++*28+60);}}
}
const onScreen=cell=>{const r=cell.parts.el.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};

async function refresh(detail){
 const P=page;if(!P)return;
 let next;try{next=await call('cards_state');}catch(e){console.warn('cards_state',e);return;}
 if(page!==P)return;
 const before=new Map(P.state.toploaders.map(t=>[t.id,t.cardId]));
 P.state=next;
 const fresh=[],added=[];
 for(const t of next.toploaders){
  if(!before.has(t.id)){added.push(t.id);continue;}
  const cell=P.cells.get(t.id);if(!cell)continue;const card=cardOf(next,t);
  if(before.get(t.id)!==t.cardId){
   if(P.viewer?.id===t.id)continue;
   fill(cell.parts,card);if(card&&!before.get(t.id))fresh.push(cell);
  }else if(card&&cell.parts.cardData?.src!==card.src)fill(cell.parts,card,kbPhase(cell.parts.img));
 }
 build();
 for(const id of added){const c=P.cells.get(id);if(c&&onScreen(c))hangMotion(c.parts,added.indexOf(id)*40);}
 /* a card the card maker just made: bring its toploader into view and slide the card in */
 const focus=fresh.find(c=>c.id===detail?.toploaderId)||fresh[0];
 if(focus){await reveal(focus);if(page===P)insertMotion(focus.parts);}
 for(const c of fresh)if(c!==focus)insertMotion(c.parts);
}
async function addToploaders(count){
 const P=page;if(!P)return;
 try{const next=await call('cards_add_toploaders',{count});if(page!==P)return;
  const before=new Set(P.state.toploaders.map(t=>t.id));P.state=next;build();
  const added=next.toploaders.filter(t=>!before.has(t.id)).map(t=>P.cells.get(t.id)).filter(Boolean);
  if(added[0])await reveal(added[0]);
  added.forEach((c,i)=>hangMotion(c.parts,i*45));
 }catch(e){console.warn('cards_add_toploaders',e);toast(words().failed);}
}
async function setMode(mode){
 const P=page;if(!P||P.switching||mode===P.mode)return;
 P.switching=true;
 try{
  const first=new Map();for(const c of P.cells.values())if(onScreen(c))first.set(c,c.parts.el.getBoundingClientRect());
  P.mode=mode;updateCount();measure();layoutGrid();relayout();
  if(mode==='b'){const pivot=[...first.keys()].sort((a,b)=>a.index-b.index)[0];if(pivot)P.field.scrollTop=Math.max(0,pivot.node.offsetTop-80);}
  if(!reduce()){
   /* FLIP: each toploader glides from where it hung to its new place on one spring curve, nearest the centre first */
   const cx=innerWidth/2,cy=innerHeight/2,anims=[];
   for(const c of P.cells.values()){
    const a=first.get(c),b=c.parts.el.getBoundingClientRect();
    const inView=b.bottom>0&&b.top<innerHeight;
    if(!a&&!inView)continue;
    const from=a||{left:b.left,top:b.top+60,width:b.width,height:b.height};
    const dx=from.left-b.left,dy=from.top-b.top,s=from.width/(b.width||1);
    const d=Math.hypot(b.left+b.width/2-cx,b.top+b.height/2-cy);
    anims.push(c.parts.el.animate([{translate:dx+'px '+dy+'px',scale:String(s),opacity:a?1:0},{translate:'0 0',scale:'1',opacity:1}],{duration:SPRING_MS,delay:Math.min(220,d*.18),easing:SPRING_EASE,fill:'backwards'}));
   }
   await Promise.all(anims.map(a=>a.finished.catch(()=>{})));
  }
  call('cards_set_mode',{mode}).catch(e=>console.warn('cards_set_mode',e));
 }finally{P.switching=false;}
}
/* a spring sampled into a CSS linear() curve, for the compositor-run FLIP */
const SPRING_MS=760;
const SPRING_EASE=(()=>{const k=210,c=22,pts=[];let x=0,v=0;const steps=60,dt=SPRING_MS/1000/steps;for(let i=0;i<=steps;i++){pts.push(Math.round(x*1000)/1000);for(let j=0;j<8;j++){const a=-k*(x-1)-c*v;v+=a*dt/8;x+=v*dt/8;}}pts[pts.length-1]=1;return 'linear('+pts.join(',')+')';})();

/* ---------- the wall: the library wall's motion, finite ---------- */
function measure(){
 const P=page;if(!P)return;
 P.width=P.field.clientWidth;P.height=P.field.clientHeight;
 const pod=P.root.querySelector('.cw-pod'),pr=pod.getBoundingClientRect(),fr=P.field.getBoundingClientRect();
 P.podTop=pr.height?pr.top-fr.top:P.height;
}
function layoutGrid(){
 const P=page;if(!P)return;
 P.cw=212;P.ch=318;
 const n=Math.max(1,P.cells.size);
 P.cols=Math.min(n,Math.max(2,Math.round(Math.sqrt(n*1.5*(P.width||1600)/Math.max(1,P.height||900)))));
 P.rows=Math.ceil(n/P.cols);
}
function constrain(){
 const P=page,v=P.view;
 const cx0=(P.cols-1)*P.cw/2,cy0=(P.rows-1)*P.ch/2;
 const rangeX=Math.max(0,(P.cols*P.cw-P.width/v.z)/2+P.cw*.15),rangeY=Math.max(0,(P.rows*P.ch-P.height/v.z)/2+P.ch*.15);
 v.x=clamp(v.x,cx0-rangeX,cx0+rangeX);v.y=clamp(v.y,cy0-rangeY,cy0+rangeY);
}
function relayout(){const P=page;if(!P)return;P.painted='';if(P.mode==='a')paint();else for(const c of P.cells.values()){if(c.t){c.node.style.transform='';c.node.style.opacity='';c.t=c.o='';}}}
function paint(){
 const P=page;if(!P||P.mode!=='a')return;
 constrain();
 const {x,y,z}=P.view,cx=P.width/2,cy=P.height/2,cw=P.cw,ch=P.ch;
 const stamp=x.toFixed(2)+' '+y.toFixed(2)+' '+z.toFixed(4)+' '+P.width+' '+P.height+' '+P.smear.toFixed(4)+' '+P.cells.size;
 if(stamp===P.painted)return;P.painted=stamp;
 const radius=Math.hypot(cx,cy)||1,ex=1+P.smear*Math.abs(P.smearX),ey=1+P.smear*Math.abs(P.smearY);
 for(const c of P.cells.values()){
  const col=c.index%P.cols,row=Math.floor(c.index/P.cols);
  const dx=(col*cw-x)*z,dy=(row*ch-y)*z;
  const sx=cx+dx*ex,sy=cy+dy*ey;
  let t,o;
  if(sx<-cw*z*1.4||sx>P.width+cw*z*1.4||sy<-ch*z*1.4||sy>P.height+ch*z*1.4){t='translate(-300vw,-300vh)';o='0';}
  else{
   const d=Math.min(1,Math.hypot(dx,dy)/radius),k=z*(1-.26*d*d);
   t='translate('+(sx-TL_W/2).toFixed(1)+'px,'+(sy-TL_H/2).toFixed(1)+'px) scale('+k.toFixed(3)+')';
   o=(1-.48*d*d).toFixed(2);
  }
  if(c.t!==t){c.node.style.transform=t;c.t=t;}
  if(c.o!==o){c.node.style.opacity=o;c.o=o;}
 }
}
/* bring a toploader to the middle before a motion plays on it (a short glide of the view, then rest) */
function reveal(cell){
 const P=page;if(!P)return Promise.resolve();
 if(P.mode==='b'){const r=cell.node.getBoundingClientRect(),f=P.field.getBoundingClientRect();if(r.top<f.top+40||r.bottom>f.bottom-90){P.field.scrollTo({top:P.field.scrollTop+r.top-f.top-f.height/2+r.height/2,behavior:reduce()?'auto':'smooth'});return new Promise(r=>setTimeout(r,reduce()?0:420));}return Promise.resolve();}
 const col=cell.index%P.cols,row=Math.floor(cell.index/P.cols),tx=col*P.cw,ty=row*P.ch;
 const r=cell.parts.el.getBoundingClientRect();if(r.left>40&&r.right<innerWidth-40&&r.top>60&&r.bottom<innerHeight-120&&Math.hypot(tx-P.view.x,ty-P.view.y)*P.view.z<P.height*.36)return Promise.resolve();
 const s=new Spring({x:P.view.x,y:P.view.y},v=>{P.view.x=v.x;P.view.y=v.y;P.moving(true);paint();},{x:.4,y:.4});
 P.glide?.stop();P.glide=s;
 s.to({x:tx,y:ty},{k:90,c:19});
 return s.until(v=>Math.hypot(v.x-tx,v.y-ty)<20).then(()=>{if(page===P)P.moving(false);});
}
function wireWall(P){
 const signal=P.events.signal,field=P.field;
 P.smear=0;P.smearX=1;P.smearY=0;P.zoomTarget=1;
 let drag=null,vx=0,vy=0,lastMove=0,coastAt=0,coastEnd=0,zoomAt=0,suppress=false;
 P.moving=on=>{if(P.root.classList.contains('cw-moving')===on)return;
  if(on&&hoverEl){liveCG(hoverEl,false);tiltReset(hoverEl);hoverEl=null;}
  P.root.classList.toggle('cw-moving',on);};
 /* the library's speed stretch (特效 · 游戏库 · 拖动模糊): positions spread a little along the movement, no filter */
 const stretch=(sx,sy)=>{const fx=fxPref('wallBlur'),speed=Math.hypot(sx,sy),goal=fx.on&&!reduce()?Math.min(.045,Math.max(0,speed-.35)*.018)*fx.k:0;if(speed>.05){P.smearX=sx/speed;P.smearY=sy/speed;}P.smear+=(goal-P.smear)*.35;if(P.smear<.0008&&goal===0)P.smear=0;};
 function frame(now){
  P.raf=0;const v=P.view;
  if(coastEnd){
   const dt=Math.min(32,Math.max(0,now-coastAt)),decay=Math.exp(-dt/105);
   const x=v.x,y=v.y;
   v.x-=vx*105*(1-decay)/v.z;v.y-=vy*105*(1-decay)/v.z;
   constrain();
   if(v.x===x)vx=0;
   if(v.y===y)vy=0;
   vx*=decay;vy*=decay;coastAt=now;
   if(now>=coastEnd||Math.hypot(vx,vy)<.06)coastEnd=vx=vy=0;
  }else if(now-lastMove>72)vx=vy=0;
  let zooming=false;
  if(P.zoomTarget!==v.z){
   const dt=Math.min(40,Math.max(0,now-(zoomAt||now))),k=reduce()?1:1-Math.exp(-dt/85);
   v.z+=(P.zoomTarget-v.z)*(zoomAt?k:0);
   if(Math.abs(P.zoomTarget-v.z)<.0008)v.z=P.zoomTarget;else zooming=true;
  }
  zoomAt=zooming?now:0;
  {const fast=drag?.active||coastEnd;stretch(fast?vx:0,fast?vy:0);}paint();
  if(!coastEnd&&!drag?.active&&!zooming)P.moving(false);
  if(coastEnd||zooming||(drag?.active&&Math.hypot(vx,vy)>.75)||P.smear)queue();
 }
 const queue=()=>{if(!P.raf)P.raf=requestAnimationFrame(frame);};
 P.queue=queue;
 field.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||P.mode!=='a')return;
  P.glide?.stop();coastEnd=vx=vy=0;queue();lastMove=performance.now();suppress=false;
  drag={id:e.pointerId,sx:e.clientX,sy:e.clientY,x:P.view.x,y:P.view.y,active:false};
 },{signal});
 addEventListener('pointermove',e=>{
  if(drag?.id!==e.pointerId)return;
  const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
  if(!drag.active){if(Math.hypot(dx,dy)<6)return;drag.active=suppress=true;P.root.classList.add('cw-dragging');P.moving(true);field.setPointerCapture?.(e.pointerId);}
  const now=performance.now(),dt=Math.max(4,now-lastMove),v=P.view,x=v.x,y=v.y;
  v.x=drag.x-dx/v.z;v.y=drag.y-dy/v.z;constrain();
  if(dt>72)vx=vy=0;
  else{vx=clamp(vx*.3+(x-v.x)*v.z/dt*.7,-3,3);vy=clamp(vy*.3+(y-v.y)*v.z/dt*.7,-3,3);}
  lastMove=now;queue();
 },{signal});
 const end=e=>{
  if(drag?.id!==e.pointerId)return;
  const now=performance.now();
  if(e.type==='pointerup'&&drag.active&&!reduce()&&now-lastMove<72&&Math.hypot(vx,vy)>.12){coastAt=now;coastEnd=now+430;}else coastEnd=vx=vy=0;
  drag=null;P.root.classList.remove('cw-dragging');queue();
 };
 addEventListener('pointerup',end,{signal});addEventListener('pointercancel',end,{signal});field.addEventListener('lostpointercapture',end,{signal});
 field.addEventListener('wheel',e=>{
  if(P.mode!=='a')return;
  e.preventDefault();if(drag)return;P.glide?.stop();coastEnd=vx=vy=0;
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?field.clientHeight:1);
  P.zoomTarget=clamp(P.zoomTarget*Math.exp(-delta*.0015),.45,1.8);
  if(!zoomAt)zoomAt=performance.now();
  P.moving(true);queue();
 },{passive:false,signal});
 field.addEventListener('dragstart',e=>e.preventDefault(),{signal});
 field.addEventListener('click',e=>{
  if(suppress&&e.detail){e.preventDefault();e.stopPropagation();suppress=false;return;}
  const el=e.target.closest('.cw-tl');if(el)activate(el.dataset.tl);
 },{capture:true,signal});
 field.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const el=e.target.closest?.('.cw-tl');if(!el)return;e.preventDefault();activate(el.dataset.tl);},{signal});
}

/* ---------- clicking a toploader ---------- */
async function activate(id){
 const P=page;if(!P||P.viewer)return;
 const cell=P.cells.get(id);if(!cell)return;
 if(cell.parts.cardData){openViewer(cell);return;}
 /* empty: the card maker (card-maker.js, its own module) takes over and reports back with megulit:cards-changed */
 const el=cell.parts.el;if(!reduce())el.animate([{scale:'1'},{scale:'.97'},{scale:'1'}],{duration:260,easing:'cubic-bezier(.3,.7,.3,1)'});
 let maker=null;
 try{maker=await import('./card-maker.js');}catch(e){console.warn('card maker',e);}
 if(typeof maker?.openCardMaker!=='function'){toast(words().loading);return;}
 try{await maker.openCardMaker({toploaderId:id});}catch(e){console.warn('openCardMaker',e);toast(words().failed);}
}

/* ---------- inspect (user correction 2026-11-13: like inspecting a weapon in CS2) ----------
   A twin of the toploader is laid exactly over the one on the wall (same size, same transform origin), the wall's copy
   hides, and a spring carries the twin to the middle; closing aims the same spring back at the wall copy's current
   rectangle, so a close mid-open turns round from where it is. In the middle it can be turned freely in 3D by dragging
   (any angle, all the way round to the back, coasting on with friction after release, no snapping) and zoomed without
   steps on the wheel. Two ways to inspect: the card inside its toploader (the sleeve has real thickness: a back pane and
   four edges, its own reflections), or the bare card taken out (the sleeve fades away, the card's back is the crest).
   Double-click puts it face on again. CSS 3D only: perspective + rotateX/Y + a two-sided card, transform and opacity. */
function openViewer(cell){
 const P=page;const card=cell.parts.cardData;if(!card)return;
 if(hoverEl){liveCG(hoverEl,false);tiltReset(hoverEl);hoverEl=null;}
 const w=words(),src=cell.parts.el;
 const layer=document.createElement('div');layer.className='cw-viewer';
 layer.innerHTML=`<div class="cw-veil"></div><div class="cw-stage"></div><div class="cw-bar"><button type="button" class="cw-btn cw-eject">${esc(w.eject)}</button><button type="button" class="cw-btn cw-close">${esc(w.close)}</button></div><p class="cw-hint">${esc(w.inspect)}</p>`;
 const veil=layer.querySelector('.cw-veil'),bar=layer.querySelector('.cw-bar'),stage=layer.querySelector('.cw-stage'),hint=layer.querySelector('.cw-hint');
 const ghost=buildToploader(cell.data,null,{withBack:true});ghost.el.classList.add('cw-ghost');ghost.el.removeAttribute('tabindex');
 ghost.el.style.position='absolute';ghost.el.style.left='0';ghost.el.style.top='0';ghost.el.style.transformOrigin='0 0';
 stage.append(ghost.el);P.root.append(layer);
 fill(ghost,card);
 const base=P.root.getBoundingClientRect();
 const home=()=>{const r=src.getBoundingClientRect();return {x:r.left-base.left,y:r.top-base.top,s:r.width/TL_W};};
 const fit=()=>Math.min((base.height-170)/(TL_H+40),(base.width*.34)/TL_W,3.1);
 const h0=home();
 /* position (x,y,s) of the twin; z = inspect zoom; b veil; u controls */
 const spring=new Spring({x:h0.x,y:h0.y,s:h0.s,z:1,b:0,u:0},v=>{
  const s=v.s*v.z,cx=v.x+TL_W*v.s/2,cy=v.y+TL_H*v.s/2;
  ghost.el.style.transform='translate('+(cx-TL_W*s/2).toFixed(2)+'px,'+(cy-TL_H*s/2).toFixed(2)+'px) scale('+s.toFixed(4)+')';
  veil.style.opacity=clamp(v.b,0,1).toFixed(3);
  const u=clamp(v.u,0,1);bar.style.opacity=u.toFixed(3);bar.style.transform='translate(-50%,'+((1-u)*14).toFixed(2)+'px)';hint.style.opacity=(u*.7).toFixed(3);
 },{x:.3,y:.3,s:.0006,z:.0008,b:.003,u:.003});
 spring.render(spring.x);
 const target=()=>{const s=fit();return {x:(base.width-TL_W*s)/2,y:(base.height-TL_H*s)/2-24,s};};
 /* free rotation: rx/ry in degrees, unbounded; on the sleeve's tilt layer, or on the bare card */
 let loose=false,closing=false,busy=false;
 const turnTarget=()=>loose?ghost.flip:ghost.tilt;
 const turn=new Spring({rx:0,ry:0},v=>{
  const t='rotateX('+v.rx.toFixed(2)+'deg) rotateY('+v.ry.toFixed(2)+'deg)';
  turnTarget().style.transform=t;(loose?ghost.tilt:ghost.flip).style.transform='';
 },{rx:.05,ry:.05});
 ghost.el.classList.add('is-inspect');
 src.style.opacity='0';
 const V=P.viewer={id:cell.id,layer,dispose:()=>{spring.stop();turn.stop();ghost.spring?.stop();layer.remove();src.style.opacity='';P.viewer=null;}};
 /* out of the wall: it lifts toward you with a quarter turn of play that settles face on (ζ≈0.8) */
 spring.to({...target()},{k:210,c:23}).to({b:1},{k:120,c:22}).to({u:1},{k:90,c:19});
 if(!reduce())turn.jump({rx:8,ry:-14}).to({rx:0,ry:0},{k:90,c:15});
 const ejectBtn=layer.querySelector('.cw-eject');
 /* z .58 and the sleeve lowered by half the card's travel: opening, card and sleeve all fit while it moves */
 const pullBack=()=>{const t=target(),z=.74;spring.to({x:t.x,y:t.y+(-ABOVE)*t.s*z/2,z},{k:130,c:22});};
 const close=async()=>{
  if(closing)return;closing=true;layer.classList.add('closing');
  ghost.seq=(ghost.seq||0)+1;
  const gs=motion(ghost);
  if(loose)gs.to({co:0,cy:gs.x.cy+40},{k:200,c:28});
  /* the shortest way back to face on, wherever the free turn left it */
  const near=a=>a-360*Math.round(a/360);turn.jump({rx:near(turn.x.rx),ry:near(turn.x.ry)}).to({rx:0,ry:0},{k:200,c:28});
  spring.to({...home(),z:1},{k:240,c:28}).to({b:0},{k:170,c:28}).to({u:0},{k:300,c:34});
  await spring.until(v=>Math.hypot(v.x-home().x,v.y-home().y)<home().s*TL_W*.12&&Math.abs(v.s*v.z-home().s)<home().s*.08);
  src.style.opacity='';
  await spring.until(v=>Math.abs(v.s*v.z-home().s)<.012&&Math.hypot(v.x-home().x,v.y-home().y)<2.5);
  V.dispose();
 };
 layer.querySelector('.cw-close').addEventListener('click',close);
 layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
 /* drag to turn (with the velocity carried into a friction coast), wheel to zoom, double-click to face on.
    A press that does not move closes only when it lands on the veil. */
 let grab=null;
 stage.style.pointerEvents='auto';
 stage.addEventListener('pointerdown',e=>{
  if(closing||!e.isPrimary||e.button!==0)return;
  turn.stop();grab={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),rx:turn.x.rx,ry:turn.x.ry,vx:0,vy:0,moved:false,onCard:!!e.target.closest('.cw-ghost')};
  stage.setPointerCapture?.(e.pointerId);
 });
 stage.addEventListener('pointermove',e=>{
  if(grab?.id!==e.pointerId)return;
  const dx=e.clientX-grab.x,dy=e.clientY-grab.y;if(!grab.moved&&Math.hypot(dx,dy)<4)return;
  if(!grab.moved){grab.moved=true;layer.classList.add('turning');}
  const now=performance.now(),dt=Math.max(4,now-grab.t),k=.42/Math.sqrt(spring.x.z);
  const ry=grab.ry+dx*k,rx=grab.rx-dy*k,prevX=turn.x.rx,prevY=turn.x.ry;
  turn.jump({rx,ry});
  grab.vx=grab.vx*.3+(rx-prevX)/dt*1000*.7;grab.vy=grab.vy*.3+(ry-prevY)/dt*1000*.7;grab.t=now;
 });
 const release=e=>{
  if(grab?.id!==e.pointerId)return;const g=grab;grab=null;layer.classList.remove('turning');
  if(!g.moved){if(!g.onCard&&e.type==='pointerup')close();return;}
  if(performance.now()-g.t>80||reduce())return;
  /* coast: friction only (k=0), the rest angle is where the decay ends, so it never springs back */
  const c=4.2,vx=clamp(g.vx,-1400,1400),vy=clamp(g.vy,-1400,1400);
  turn.to({rx:turn.x.rx+vx/c,ry:turn.x.ry+vy/c},{k:0,c,v:{rx:vx,ry:vy}});
 };
 stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);
 stage.addEventListener('dblclick',()=>{if(closing)return;const near=a=>a-360*Math.round(a/360);turn.jump({rx:near(turn.x.rx),ry:near(turn.x.ry)}).to({rx:0,ry:0},{k:150,c:20});spring.to({z:1},{k:200,c:26});});
 stage.addEventListener('wheel',e=>{
  e.preventDefault();if(closing)return;
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?base.height:1);
  const goal=clamp((spring.goal.z||1)*Math.exp(-delta*.0016),.55,3.2);
  spring.to({z:goal},{k:260,c:32});
 },{passive:false});
 ejectBtn.addEventListener('click',async()=>{
  if(busy||closing)return;busy=true;ejectBtn.disabled=true;
  const gs=motion(ghost),toLoose=!loose;
  /* square up first, then the card leaves (or goes back into) the sleeve */
  const near=a=>a-360*Math.round(a/360);turn.jump({rx:near(turn.x.rx),ry:near(turn.x.ry)}).to({rx:0,ry:0},{k:170,c:24});
  await turn.until(v=>Math.abs(v.rx)<3&&Math.abs(v.ry)<3);
  try{
   if(toLoose){
    const job=call('cards_eject',{toploaderId:cell.id});
    pullBack();
    const done=ejectMotion(ghost,{loose:true}).then(ok=>{if(ok&&!closing)spring.to({...target(),z:1},{k:240,c:29});return ok;});
    let next=null;try{next=await job;}catch(e){console.warn('cards_eject',e);}
    if(!next){toast(w.failed);await gs.to({so:1},{k:160,c:24}).until(x=>x.so>.9);await insertMotion(ghost,{from:'here'});}
    else{
     P.state=next;const t=next.toploaders.find(x=>x.id===cell.id);fill(cell.parts,t?cardOf(next,t):null);updateCount();
     await done;
     /* the bare card now takes the turns; the sleeve's angle passes to it */
     turn.stop();loose=true;turn.render(turn.x);ghost.el.classList.add('is-loose');ejectBtn.textContent=w.insert;
    }
   }else{
    const job=call('cards_insert',{toploaderId:cell.id,cardId:card.id});
    turn.stop();loose=false;turn.render(turn.x);ghost.el.classList.remove('is-loose');ejectBtn.textContent=w.eject;
    /* the sleeve comes back, the card is carried over its opening, then the same insert as from the card maker */
    pullBack();
    gs.to({so:1},{k:150,c:24}).to({cy:ABOVE-10,cx:0,cr:0},{k:150,c:20});
    await gs.until(x=>x.so>.85&&x.cy<ABOVE);
    const done=insertMotion(ghost,{from:'here'});
    let next=null;try{next=await job;}catch(e){console.warn('cards_insert',e);}
    if(!next)toast(w.failed);else{P.state=next;const t=next.toploaders.find(x=>x.id===cell.id);fill(cell.parts,t?cardOf(next,t):null);updateCount();}
    await done;if(!closing)spring.to({...target(),z:1},{k:120,c:21});
   }
  }finally{busy=false;ejectBtn.disabled=false;}
 });
 layer.tabIndex=-1;layer.focus({preventScroll:true});
 V.turn=turn;V.spring=spring;V.ghost=ghost;V.close=close;V.eject=()=>ejectBtn.click();
 return V;
}

/* test hooks for the headless checks (validation/card-wall-*.cjs) */
if(window.__TOME_TEST_TRANSPORT__)window.__megulitCardWall={open:openCardWall,close:closeCardWall,page:()=>page,insertMotion,ejectMotion,hangMotion,setMode,activate,refresh,stillTransform};
