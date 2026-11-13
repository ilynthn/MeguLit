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
 zh:{inspect:'拖卡片抽出或放回 · 拖空白处旋转 · 拖到窗口边缘丢弃',title:'卡面墙',back:'游戏库',list:'简洁列表',add:'加 Toploader',empty:'空 Toploader：点一下制作收藏卡',filled:'查看收藏卡',eject:'从 Toploader 取出',insert:'放回 Toploader',close:'关闭',flip:'点卡片翻面',loading:'制卡功能加载中',failed:'操作没有成功，请再试一次',count:(a,b)=>a+' / '+b,emptyShort:'空卡套',stale:'卡面墙刚刚有变化，已刷新，请再试一次',finish:'卡面',finishes:{plain:'普通',shine:'闪卡',holo:'镭射'},binQ:'丢掉这张卡？',binBody:'只是这张卡没了，原来的 CG、封面和截图都还在',keep:'留着',discard:'丢掉',first:'点任意一个空卡套，用已解锁的 CG、封面或截图做第一张卡',source:{save:'存档已解锁 CG',seen:'游戏中见过',shot:'MeguLit 截图',cover:'作品封面',cg:'游戏 CG'}},
 en:{inspect:'Drag the card out or back in · drag around it to turn · drag to a window edge to discard',title:'Card wall',back:'Library',list:'Simple list',add:'Add toploader',empty:'Empty toploader: click to make a card',filled:'View card',eject:'Take out of toploader',insert:'Put back in toploader',close:'Close',flip:'Click the card to turn it over',loading:'The card maker is loading',failed:'That did not work, please try again',count:(a,b)=>a+' / '+b,emptyShort:'Empty toploader',stale:'The wall changed meanwhile; it has been refreshed, please try again',finish:'Finish',finishes:{plain:'Plain',shine:'Sparkle',holo:'Holo'},binQ:'Discard this card?',binBody:'Only the card goes; the CG, cover or screenshot it came from stays',keep:'Keep it',discard:'Discard',first:'Click any empty toploader to make your first card from an unlocked CG, the cover or a shot',source:{save:'Unlocked in saves',seen:'Seen in game',shot:'MeguLit shot',cover:'Cover',cg:'Game CG'}},
 ja:{inspect:'カードをドラッグで出し入れ · 周りをドラッグで回転 · 画面の端へドラッグで手放す',title:'カードウォール',back:'ライブラリ',list:'シンプル表示',add:'トップローダーを追加',empty:'空のトップローダー：クリックでカードを作る',filled:'カードを見る',eject:'トップローダーから出す',insert:'トップローダーに戻す',close:'閉じる',flip:'カードをクリックで裏返す',loading:'カード作成を読み込み中',failed:'うまくいきませんでした。もう一度お試しください',count:(a,b)=>a+' / '+b,emptyShort:'空のトップローダー',stale:'ウォールが更新されました。もう一度お試しください',finish:'カード面',finishes:{plain:'ノーマル',shine:'キラ',holo:'ホロ'},binQ:'このカードを手放しますか？',binBody:'なくなるのはカードだけで、元の CG・カバー・スクリーンショットは残ります',keep:'残す',discard:'手放す',first:'空のトップローダーをクリックして、解放済みの CG・カバー・撮影から最初のカードを作りましょう',source:{save:'セーブで解放済み',seen:'ゲーム中に表示',shot:'MeguLit の撮影',cover:'作品カバー',cg:'ゲーム CG'}}
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

/* the named springs of the big moves (one system, gsap-performance: no magic numbers scattered over the tweens) */
const MOTION={lift:{k:210,c:23},veil:{k:120,c:22},chrome:{k:90,c:19},home:{k:240,c:28}};
const EASE_OUT='cubic-bezier(.22,1,.36,1)';

/* ---------- a card's still framing, and the slow Ken Burns move around it ----------
   still = {x,y,scale}: x/y the centre of the framing as a fraction of the picture (0..1), scale the zoom over a
   cover fit (>= 1). Offsets are clamped so the picture always covers the card. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function stillTransform(still,dx=0,dy=0,ds=1){
 const s=Math.max(1,Number(still?.scale)||1)*ds,m=(s-1)/(2*s)*100;
 const tx=clamp((.5-(Number(still?.x??.5)))*100+dx,-m,m),ty=clamp((.5-(Number(still?.y??.5)))*100+dy,-m,m);
 return 'scale('+s.toFixed(4)+') translate('+tx.toFixed(3)+'%,'+ty.toFixed(3)+'%)';
}
/* the face picture is already cut to the player's still by cards_create, so the card shows it whole and drifts from its centre
   (applying the still again zoomed the CG twice: blurry and off its framing) */
const FACED={x:.5,y:.5,scale:1};
function hash(s){let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.codePointAt(0),16777619);return h>>>0;}

/* ---------- the card back: the collectible card's crest (detail-flip.js), the title's first character ---------- */
const glyphOf=title=>[...String(title||'')].find(c=>/[一-鿿぀-ヿ]/.test(c))||String(title||' ').trim().charAt(0).toUpperCase()||'M';
const crestHTML=card=>`<div class="dtv-back-art is-crest"><i class="dtv-ring"></i><i class="dtv-ring is-inner"></i><b>${esc(card?.initial||glyphOf(card?.title))}</b><span>MeguLit</span><small>${esc(card?.title||'')}</small></div>`;

/* ---------- scuffs (user 2026-11-13: random per toploader, many with none, never more than a couple) ----------
   Each toploader picks 0, 1 or 2 fine marks from a small pool by its id, so the same sleeve keeps its marks. */
const SCUFFS=['M28 168c18-9 36-14 52-15','M118 52c9 6 15 13 19 22','M40 74l23-7','M96 196c10 2 21 1 30-3','M132 130l9 15','M24 120c6-8 14-13 24-15','M60 40l14 9','M110 160c8-3 17-3 25 1','M140 90l-6 18','M30 200l18-4','M84 112c4 7 10 12 18 14','M50 142l-10 16'];
const scuffCache=new Map();
function scuffPicks(id){
 const h=hash(id+'/scuff'),roll=h%100,n=roll<42?0:roll<84?1:2,picks=[];
 for(let i=0;picks.length<n&&i<8;i++){const k=(h>>>(7+i*3))%SCUFFS.length;if(!picks.includes(k))picks.push(k);}
 return {picks,op:(.16+((h>>>27)%5)*.025).toFixed(3)};
}
function scuffOf(id){
 const {picks,op}=scuffPicks(id);if(!picks.length)return '';
 const key=picks.join(',')+'/'+op;if(scuffCache.has(key))return scuffCache.get(key);
 const paths=picks.map(k=>"<path d='"+SCUFFS[k]+"'/>").join('');
 const svg="<svg xmlns='http://www.w3.org/2000/svg' width='168' height='226'><g fill='none' stroke='white' stroke-linecap='round' stroke-opacity='"+op+"' stroke-width='.45'>"+paths+'</g></svg>';
 const url='url("data:image/svg+xml,'+encodeURIComponent(svg)+'")';scuffCache.set(key,url);return url;
}

/* ---------- the plate's title, split into characters for a staggered rise (gsap-text style, native WAAPI) ---------- */
function splitTitle(el,title){
 const text=String(title||'');el.textContent='';el.setAttribute('aria-label',text);
 for(const ch of Array.from(text)){const s=document.createElement('span');s.className='cw-ch';s.setAttribute('aria-hidden','true');s.textContent=ch===' '?' ':ch;el.append(s);}
}
function revealTitle(plate,delay=0){
 if(reduce())return;
 const chars=plate.querySelectorAll('.cw-ch'),meta=plate.querySelector('.cw-plate-meta'),n=Math.min(chars.length,22);
 chars.forEach((c,i)=>c.animate([{transform:'translateY(.62em)',opacity:0},{transform:'none',opacity:1}],{duration:560,delay:delay+Math.min(i,22)*16,easing:EASE_OUT,fill:'backwards'}));
 meta?.animate([{transform:'translateY(6px)',opacity:0},{transform:'none',opacity:1}],{duration:480,delay:delay+n*16+80,easing:EASE_OUT,fill:'backwards'});
}
/* a card went into 我的卡: the counter takes it with a small beat */
function pulseCount(){
 const el=page?.root.querySelector('.cw-count');if(!el||reduce())return;
 el.animate([{transform:'scale(1)'},{transform:'scale(1.28)',offset:.32},{transform:'scale(1)'}],{duration:520,easing:'cubic-bezier(.3,.7,.2,1)'});
}

/* ---------- the wall's back plane: a faint crimson-demon casting circle behind the toploaders ----------
   One static picture on its own layer; while the wall pans it moves at a fifth of the speed, so the toploaders read as
   hanging in front of a wall that is further away (the AE camera through layered planes, megu-edit). Drawn once. */
let sigilUrl='';
function sigil(){
 if(sigilUrl)return sigilUrl;
 const C=600,ring=r=>"<circle cx='"+C+"' cy='"+C+"' r='"+r+"'/>",pt=(r,a)=>[(C+r*Math.cos(a)).toFixed(1),(C+r*Math.sin(a)).toFixed(1)];
 let ticks='';for(let i=0;i<120;i++){const a=i/120*Math.PI*2,l=i%10?8:20,[x1,y1]=pt(512,a),[x2,y2]=pt(512-l,a);ticks+='M'+x1+' '+y1+'L'+x2+' '+y2;}
 let star='';for(let i=0;i<=7;i++){const [x,y]=pt(318,-Math.PI/2+i*3*Math.PI*2/7);star+=(i?'L':'M')+x+' '+y;}
 let nodes='';for(let i=0;i<7;i++){const [x,y]=pt(318,-Math.PI/2+i*Math.PI*2/7);nodes+="<circle cx='"+x+"' cy='"+y+"' r='14'/>";}
 const svg="<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1200' viewBox='0 0 1200 1200'><g fill='none' stroke='%23edb56e' stroke-width='1.2'>"+ring(560)+ring(524)+ring(500)+ring(332)+ring(150)+ring(138)+"<path d='"+ticks+"'/><path d='"+star+"' stroke-width='1'/>"+nodes+'</g></svg>';
 sigilUrl='url("data:image/svg+xml,'+svg.replace(/</g,'%3C').replace(/>/g,'%3E').replace(/"/g,"'")+'")';
 return sigilUrl;
}

/* ---------- 闪卡 glints (user 2026-11-14: "白色的带一点点彩色的反光，像柏油路上很多玻璃渣被光照到") ----------
   Not a colour wash: scattered points of white light, a few faintly tinted, the way broken glass in asphalt catches a
   lamp. Three tiles of random points, each set lighting up at its own angle, so turning the card makes different
   points flash. Drawn once on a canvas each and shared through --cw-glint-a/b/c. */
function glintUrl(seed,count){
 let i=seed>>>0;const rnd=()=>((i=Math.imul(i^i>>>15,2246822507)^Math.imul(i^i>>>13,3266489909)+0x6D2B79F5)>>>0)/4294967296;
 const N=192,cv=document.createElement('canvas');cv.width=cv.height=N;const g=cv.getContext('2d');if(!g)return 'none';
 const tint=['#bff4ff','#ffd6f2','#e2d6ff','#d6ffe9','#fff3c4'];
 for(let n=0;n<count;n++){
  const x=rnd()*N,y=rnd()*N,big=rnd()<.06,r=big?1.4+rnd()*1:.5+rnd()*.7,col=rnd()<.18?tint[Math.floor(rnd()*tint.length)]:'#ffffff';
  for(const [dx,dy] of [[0,0],[N,0],[-N,0],[0,N],[0,-N]]){
   const px=x+dx,py=y+dy;if(px<-6||px>N+6||py<-6||py>N+6)continue;
   const grd=g.createRadialGradient(px,py,0,px,py,r*2.6);grd.addColorStop(0,col);grd.addColorStop(.35,col);grd.addColorStop(1,'rgba(255,255,255,0)');
   g.fillStyle=grd;g.beginPath();g.arc(px,py,r*2.6,0,Math.PI*2);g.fill();
   /* the bigger shards throw a small four-point star */
   if(big){g.strokeStyle=col;g.globalAlpha=.55;g.lineWidth=.6;g.beginPath();g.moveTo(px-r*4,py);g.lineTo(px+r*4,py);g.moveTo(px,py-r*4);g.lineTo(px,py+r*4);g.stroke();g.globalAlpha=1;}
  }
 }
 return 'url("'+cv.toDataURL('image/png')+'")';
}
try{const d=document.documentElement.style;d.setProperty('--cw-glint-a',glintUrl(0x1a2b,150));d.setProperty('--cw-glint-b',glintUrl(0x3c4d,150));d.setProperty('--cw-glint-c',glintUrl(0x5e6f,150));}catch{}



/* ---------- the CG tour (user, from the start: under the pointer, or while handled, the card leaves its still and slowly
   travels the whole CG, then comes back, round and round) ----------
   At rest the card shows its face (the still, cut by cards_create). On hover a second picture, the whole CG, is laid
   exactly over it at the same framing, then one looping WAAPI animation pans it: from the still to the nearer end of
   the picture at full height (or width), across to the far end, and back to the still. Transform only, one card at a
   time; when the pointer leaves it glides back to the still and the big picture is let go. */
const TOUR_SPEED=24; /* local px per second across the picture */
function tourGeometry(card){
 const fw=Number(card.fullW)||0,fh=Number(card.fullH)||0;if(!fw||!fh)return null;
 const Wc=CARD_W,Hc=CARD_H,base=Math.max(Wc/fw,Hc/fh),bw=fw*base,bh=fh*base;
 const at=(x,y,k)=>{const dw=bw*k,dh=bh*k;return {tx:clamp(Wc/2-x*dw,Wc-dw,0),ty:clamp(Hc/2-y*dh,Hc-dh,0),k};};
 const st=card.still||{},still=at(Number(st.x??.5),Number(st.y??.5),Math.max(1,Number(st.scale)||1));
 const wide=bw>Wc+1,a=wide?at(0,.5,1):at(.5,0,1),b=wide?at(1,.5,1):at(.5,1,1);
 return {bw,bh,still,a,b,wide};
}
const tf=p=>'translate('+p.tx.toFixed(2)+'px,'+p.ty.toFixed(2)+'px) scale('+p.k.toFixed(4)+')';
function tour(parts,on){
 const card=parts.cardData,img=parts.full;if(!img)return;
 if(!on||!card||reduce()){
  if(!parts.touring)return;parts.touring=false;
  const cur=getComputedStyle(img).transform,g=card&&tourGeometry(card);
  for(const a of img.getAnimations())a.cancel();
  if(!g||reduce()){img.style.opacity='0';img.removeAttribute('src');return;}
  img.style.transform=tf(g.still);
  img.animate([{transform:cur},{transform:tf(g.still)}],{duration:700,easing:EASE_OUT}).finished.then(()=>{if(!parts.touring){img.style.opacity='0';img.removeAttribute('src');}},()=>{});
  return;
 }
 if(parts.touring)return;parts.touring=true;
 const g=tourGeometry(card);if(!g){parts.touring=false;return;}
 const go=()=>{
  if(!parts.touring)return;
  Object.assign(img.style,{width:g.bw+'px',height:g.bh+'px',transform:tf(g.still),opacity:'1'});
  /* nearer end first, then across, then home; time follows distance */
  const d=(p,q)=>Math.hypot(p.tx-q.tx,p.ty-q.ty)+Math.abs(p.k-q.k)*120;
  const [n,f]=d(g.still,g.a)<=d(g.still,g.b)?[g.a,g.b]:[g.b,g.a];
  const s1=d(g.still,n),s2=d(n,f),s3=d(f,g.still),T=Math.max(1,s1+s2+s3),dur=Math.max(9000,T/TOUR_SPEED*1000);
  img.animate([{transform:tf(g.still),easing:'cubic-bezier(.45,0,.55,1)'},{transform:tf(n),offset:s1/T,easing:'cubic-bezier(.45,0,.55,1)'},{transform:tf(f),offset:(s1+s2)/T,easing:'cubic-bezier(.45,0,.55,1)'},{transform:tf(g.still)}],{duration:dur,iterations:Infinity});
 };
 /* the whole CG is fetched for this card only, the last few kept */
 fullOf(card).then(url=>{if(!parts.touring||!url)return;if(img.getAttribute('src')!==url){img.src=url;img.decode?.().then(go,go)??go();}else go();},()=>{parts.touring=false;});
}
const fullCache=new Map();
async function fullOf(card){
 if(card.full)return card.full;
 if(fullCache.has(card.id)){const u=fullCache.get(card.id);fullCache.delete(card.id);fullCache.set(card.id,u);return u;}
 const r=await call('cards_full',{cardId:card.id});const u=r?.full||'';
 if(u){fullCache.set(card.id,u);while(fullCache.size>3)fullCache.delete(fullCache.keys().next().value);}
 return u;
}

/* ---------- toploader markup ---------- */
const TL_W=168,TL_H=226,CARD_W=146,CARD_H=204,CARD_TOP=12;
const ABOVE=-(CARD_H+CARD_TOP)+4; /* the card's bottom edge just inside the opening */
function buildToploader(t,card,{withBack=false}={}){
 const el=document.createElement('div');
 el.className='cw-tl'+(card?' is-filled':'');el.dataset.tl=t.id;el.tabIndex=0;el.setAttribute('role','button');
 el.setAttribute('aria-label',card?words().filled+(card.title?' · '+card.title:''):words().empty);
 /* the pin stays on the wall; the hang tab, the sleeve and its card swing on it together */
 el.innerHTML=`<div class="cw-hang"><i class="cw-tab" aria-hidden="true"></i><i class="cw-pin" aria-hidden="true"></i><div class="cw-tilt"><i class="cw-drop" aria-hidden="true"></i>`+
  `<div class="cw-card"><i class="cw-lift" aria-hidden="true"></i><div class="cw-flip"><div class="cw-face"><img class="cw-art" alt="" draggable="false" decoding="async"><img class="cw-full" alt="" draggable="false" decoding="async"><i class="cw-foil"></i><i class="cw-glint is-b"></i><i class="cw-glint is-c"></i></div>${withBack?`<div class="cw-back">${crestHTML(card)}</div>`:''}</div></div>`+
  `<div class="cw-shell" aria-hidden="true"><i class="cw-glare"></i><i class="cw-sweep"></i><i class="cw-lip"></i></div>${withBack?'<div class="cw-thick" aria-hidden="true"><i class="cw-pane"></i><i class="cw-side is-l"></i><i class="cw-side is-r"></i><i class="cw-side is-b"></i><i class="cw-side is-t"></i></div>':''}</div></div>${withBack?'':'<p class="cw-label" aria-hidden="true"><b></b><small></small></p>'}`;
 const parts={el,hang:el.querySelector('.cw-hang'),tilt:el.querySelector('.cw-tilt'),card:el.querySelector('.cw-card'),flip:el.querySelector('.cw-flip'),img:el.querySelector('.cw-art'),full:el.querySelector('.cw-full'),shell:el.querySelector('.cw-shell'),sweep:el.querySelector('.cw-sweep'),back:el.querySelector('.cw-back'),label:el.querySelector('.cw-label'),lift:el.querySelector('.cw-lift'),drop:withBack?el.querySelector('.cw-drop'):null,thick:el.querySelector('.cw-thick')};
 {const h=hash(t.id);parts.el.querySelector('.cw-glare').style.translate=((h%41)-20)+'% '+(((h>>6)%17)-8)+'%';const sc=scuffOf(t.id);if(sc)parts.shell.style.setProperty('--cw-scuff',sc);if(!withBack){parts.el.style.setProperty('--cw-rest',(((h>>11)%27)-13)/10+'deg');parts.el.style.setProperty('--cw-dy',(((h>>15)%7)-3)+'px');}}
 fill(parts,card);
 return parts;
}
function fill(parts,card,phase){
 parts.cardData=card||null;parts.el.__parts=parts;
 parts.el.classList.toggle('is-filled',!!card);
 if(card&&(card.finish==='shine'||card.finish==='holo'))parts.el.dataset.finish=card.finish;else delete parts.el.dataset.finish;
 parts.el.setAttribute('aria-label',card?words().filled+(card.title?' · '+card.title:''):words().empty);
 if(card){if(parts.img.getAttribute('src')!==card.src)parts.img.src=card.src;parts.img.decode?.().catch(()=>{});if(parts.touring){parts.touring=false;tour(parts,true);}{for(const a of parts.img.getAnimations())a.cancel();parts.img.style.transform=stillTransform(FACED);}}
 else{for(const a of parts.img.getAnimations())a.cancel();parts.img.removeAttribute('src');}
 if(parts.back)parts.back.innerHTML=crestHTML(card);
 if(parts.label){const w=words();parts.label.firstChild.textContent=card?.title||w.emptyShort;const d=card?.createdAt?new Date(card.createdAt):null;parts.label.lastChild.textContent=card&&card.source!=='cover'?[w.source[card.source]||w.source[card.kind]||'',d&&!isNaN(d)?d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0'):''].filter(Boolean).join(' · '):'';}
 motion(parts).jump({cy:0,cx:0,cr:0,co:card?1:0});
}
/* the toploader's own spring: card (cx,cy,cr,co,f flip), shell (sx,sy press), glare sweep g, hang (hr swing, hy, ho) */
function motion(parts){
 if(parts.spring)return parts.spring;
 const {card,shell,sweep,hang}=parts;
 parts.spring=new Spring({cx:0,cy:0,cr:0,cs:1,lz:0,co:0,so:1,sh:0,sx:1,sy:1,g:0,hr:0,hy:0,ho:1},x=>{
  /* 2D only: the depth behind the shell comes from the CSS translate while the toploader tilts (no layer per card at rest) */
  const k=x.cs*(1+.035*x.lz);
  card.style.transform=x.cx||x.cy||x.cr||k!==1?'translate('+x.cx.toFixed(2)+'px,'+x.cy.toFixed(2)+'px) rotate('+x.cr.toFixed(3)+'deg)'+(k!==1?' scale('+k.toFixed(4)+')':''):'';
  card.style.opacity=clamp(x.co,0,1).toFixed(3);
  {const lz=clamp(x.lz,-.2,1.2);parts.lift.style.opacity=Math.max(clamp(-x.cy/55,0,1)*(parts.out?.55:1),parts.out?clamp(.55+.45*lz,0,1):0).toFixed(3);
   parts.lift.style.transform=lz?'translate('+(lz*12).toFixed(2)+'px,'+(lz*20).toFixed(2)+'px) scale('+(1+lz*.05).toFixed(4)+')':'';}
  if(parts.drop){const so=clamp(x.so,0,1).toFixed(3);shell.style.opacity=so;parts.drop.style.opacity=so;if(parts.thick)parts.thick.style.opacity=so;}
  /* sh: the sleeve drawn down off the card (inspect eject), the card itself stays put */
  const slide=x.sh?'translateY('+x.sh.toFixed(2)+'px)':'';
  if(parts.thick)parts.thick.style.transform=slide;if(parts.drop)parts.drop.style.transform=slide;
  shell.style.transform=(slide+(x.sx===1&&x.sy===1?'':' scale('+x.sx.toFixed(4)+','+x.sy.toFixed(4)+')')).trim();
  const g=clamp(x.g,0,1);sweep.style.opacity=(Math.sin(Math.PI*g)*.38).toFixed(3);sweep.style.transform='translateX('+(-120+g*240).toFixed(1)+'%)';
  hang.style.transform=x.hr||x.hy?'translateY('+x.hy.toFixed(2)+'px) rotate('+x.hr.toFixed(3)+'deg)':'';
  hang.style.opacity=clamp(x.ho,0,1).toFixed(3);
 },{cx:.3,cy:.3,cr:.02,cs:.0008,lz:.004,co:.004,so:.004,sh:.3,sx:.0006,sy:.0006,g:.004,hr:.02,hy:.2,ho:.004});
 /* while it moves, the toploader's moving parts get their own layers (one cell restyles, nothing else), then drop them */
 parts.spring.onrun=()=>parts.el.classList.add('cw-anim');
 parts.spring.onidle=()=>parts.el.classList.remove('cw-anim');
 return parts.spring;
}

/* ---------- the motions ----------
   Each sequence takes a ticket; a newer motion on the same toploader invalidates it, and the new one starts from the
   springs' current state, so an interrupted insert turns into an eject (or back) without a jump. */
const ticket=parts=>(parts.seq=(parts.seq||0)+1);
async function insertMotion(parts,{from='above',at=0}={}){
 const t=ticket(parts),s=motion(parts),alive=()=>parts.seq===t;
 s.wall('cy',null);
 /* handed over from the card maker's flight: the card appears exactly where the flight lands, then goes on in */
 if(from==='handoff'){s.jump({cy:ABOVE,cx:0,cr:0,co:0});const wait=at-performance.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));if(!alive())return false;s.jump({co:1});
  dispatchEvent(new CustomEvent('megulit:cards-handoff',{detail:{toploaderId:parts.el.dataset.tl}}));}
 if(from==='above'&&s.x.co<.05)s.jump({cy:ABOVE-120,cx:0,cr:-5,co:0});
 /* 1. carried in, squared up over the opening (a handed-over card is there already) */
 if(from!=='handoff'){s.to({cy:ABOVE,cx:0,cr:0},{k:150,c:21}).to({co:1},{k:260,c:34});
  await s.until(x=>Math.abs(x.cy-ABOVE)<4&&Math.abs(x.cr)<.6);if(!alive())return false;}
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
 tour(parts,on);
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
 root.innerHTML=`<div class="cw-field"><div class="cw-sigil" aria-hidden="true"></div><div class="cw-plane"></div></div>`+
  `<div class="field-search cw-pod"><span class="side"><button type="button" class="icon-button cw-back-btn" aria-label="${esc(w.back)}" title="${esc(w.back)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button></span>`+
  `<span class="cw-title"><b>${esc(w.title)}</b><small class="cw-count"></small></span>`+
  `<span class="side"><button type="button" class="library-wall-toggle cw-mode" role="switch" aria-label="${esc(w.list)}" title="${esc(w.list)}"></button><button type="button" class="icon-button cw-add" aria-label="${esc(w.add)}" title="${esc(w.add)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M12 9v6M9 12h6"/></svg></button></span></div>`+
  `<p class="cw-first" hidden>${esc(w.first)}</p><div class="cw-toast" role="status" aria-live="polite"></div>`;
 document.body.append(root);
 const field=root.querySelector('.cw-field'),plane=root.querySelector('.cw-plane');root.querySelector('.cw-sigil').style.backgroundImage=sigil();
 const P=page={root,field,plane,sigil:root.querySelector('.cw-sigil'),main,cells:new Map(),state:null,mode:'a',view:{x:0,y:0,z:1},cols:1,rows:1,cw:212,ch:318,events:new AbortController()};
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
 P.root.querySelector('.cw-first').hidden=filled>0;
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
 /* the first build sets the wall's view whichever mode it opens in, so switching to the wall later starts from it
    (opening in the list left the view unset: every toploader stacked in the top left corner) */
 if(first){const z=1;P.view.z=z;P.zoomTarget=z;P.view.x=(P.cols-1)*P.cw/2;P.view.y=Math.max(0,(P.height/z-P.ch)/2-60/z);}
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
  }else if(card&&cell.parts.cardData?.src!==card.src)fill(cell.parts,card);
 }
 build();
 for(const id of added){const c=P.cells.get(id);if(c&&onScreen(c))hangMotion(c.parts,added.indexOf(id)*40);}
 /* a card the card maker just made: bring its toploader into view and slide the card in */
 const focus=fresh.find(c=>c.id===detail?.toploaderId)||fresh[0];
 if(focus){const at=Number(detail?.handoffAt)||0;if(!at)await reveal(focus);if(page===P)insertMotion(focus.parts,at?{from:'handoff',at}:{});}
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
 /* as many columns as fit the window at full size (none cut by its edge); the wall then runs down */
 P.cols=Math.min(n,Math.max(2,Math.floor(((P.width||1600)-96)/P.cw)));
 P.rows=Math.ceil(n/P.cols);
}
function constrain(){
 const P=page,v=P.view;
 const cx0=(P.cols-1)*P.cw/2,cy0=(P.rows-1)*P.ch/2;
 const rangeX=Math.max(0,(P.cols*P.cw-P.width/v.z)/2+P.cw*.15),rangeY=Math.max(0,(P.rows*P.ch-P.height/v.z)/2+P.ch*.15+60/v.z);
 v.x=clamp(v.x,cx0-rangeX,cx0+rangeX);v.y=clamp(v.y,cy0-rangeY,cy0+rangeY);
}
function relayout(){const P=page;if(!P)return;P.painted='';if(P.mode==='a')paint();else for(const c of P.cells.values()){if(c.t){c.node.style.transform='';c.node.style.opacity='';c.t=c.o='';}}}
function paint(){
 const P=page;if(!P||P.mode!=='a'||!P.cells.size)return;
 constrain();
 const {x,y,z}=P.view,cx=P.width/2,cy=P.height/2,cw=P.cw,ch=P.ch;
 const stamp=x.toFixed(2)+' '+y.toFixed(2)+' '+z.toFixed(4)+' '+P.width+' '+P.height+' '+P.smear.toFixed(4)+' '+P.cells.size;
 if(stamp===P.painted)return;P.painted=stamp;
 const radius=Math.hypot(cx,cy)||1,ex=1+P.smear*Math.abs(P.smearX),ey=1+P.smear*Math.abs(P.smearY);
 {const ox=(P.cols-1)*cw/2,oy=(P.rows-1)*ch/2,k=.2*z;P.sigil.style.transform='translate('+((ox-x)*k).toFixed(1)+'px,'+((oy-y)*k).toFixed(1)+'px) scale('+(.92+.08*z).toFixed(4)+')';}
 for(const c of P.cells.values()){
  const col=c.index%P.cols,row=Math.floor(c.index/P.cols);
  if(c.jx==null){const h=hash(c.id+'/hang'),hc=hash('col'+col);c.jx=((h%7)-3);c.jy=((hc%11)-5);}
  const dx=(col*cw+c.jx-x)*z,dy=(row*ch+c.jy-y)*z;
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
 try{await maker.openCardMaker({toploaderId:id,from:el});}catch(e){console.warn('openCardMaker',e);toast(words().failed);}
}

/* inspect, by hand (user 2026-11-13: "放卡和拿出卡都要做无极的自然带惯性的鼠标拖动交互 … 不要用按钮"): the card is pulled out of
   the sleeve and pushed back in by dragging it, with no steps and with the hand's own speed carried on after release.
   Inside the sleeve the card can only slide along it, held a little by the plastic at first; once its bottom edge
   clears the mouth it is free and follows the pointer anywhere. Dropped near the mouth it is carried in and seated.
   Taken towards a window edge a bin appears there and its ring closes as the card nears the edge; a closed ring means
   discard, asked once more on release. These are the pure rules; openViewer drives them. */
const FREE_AT=-(CARD_H+CARD_TOP);
const rubber=(v,lim)=>lim*(1-1/(Math.abs(v)/lim+1))*Math.sign(v);
/* raw pull (local px, negative = up) -> where the card is while still in the sleeve: pushing in gives only a hair,
   the first 14 px of a pull are held by the plastic (the card lags 40 %), after that it slides 1:1 */
function sleeveY(raw){if(raw>=0)return rubber(raw,3);return raw+Math.min(-raw,14)*.6;}
/* the mouth: a free card whose bottom edge is over the opening, near the sleeve's axis, goes back in */
const inMouth=(cx,cy)=>Math.abs(cx)<44&&cy>FREE_AT-70&&cy<FREE_AT+40;
/* the bin's ring: 0 far from every edge, 1 (closed, discard) at the edge */
const BIN_FROM=150,BIN_AT=34;
const binProgress=d=>clamp((BIN_FROM-d)/(BIN_FROM-BIN_AT),0,1);
/* a released card coasts on friction from the hand's speed: where it would stop (k=0 spring, damping c) */
const coastEnd=(x,v,c)=>x+v/c;

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
 const day=card.createdAt?new Date(card.createdAt):null,stamp=day&&!isNaN(day)?day.getFullYear()+'.'+String(day.getMonth()+1).padStart(2,'0')+'.'+String(day.getDate()).padStart(2,'0'):'';
 const RING=2*Math.PI*27;
 layer.innerHTML=`<div class="cw-veil"></div><div class="cw-desk" aria-hidden="true"></div><div class="cw-stage"></div>`+
  `<div class="cw-plate" aria-hidden="true"><h2 class="cw-plate-title" lang="ja"></h2><p class="cw-plate-meta"><span>${esc(w.source[card.source]||w.source[card.kind]||'')}</span>${stamp?`<span>${esc(stamp)}</span>`:''}</p></div>`+
  `<div class="cw-bin" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="cw-bin-track" cx="32" cy="32" r="27"/><circle class="cw-bin-ring" cx="32" cy="32" r="27" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="${RING.toFixed(2)}"/><path class="cw-bin-icon" d="M24.5 25.5h15M29.5 25.5v-2.2h5v2.2M26.5 25.5l1 13.4c.1.9.8 1.6 1.7 1.6h5.6c.9 0 1.6-.7 1.7-1.6l1-13.4M30.4 29.5v7M33.6 29.5v7"/></svg></div>`+
  `<div class="cw-bar"><div class="cw-finish" role="radiogroup" aria-label="${esc(w.finish)}">${['plain','shine','holo'].map(f=>`<button type="button" role="radio" data-finish="${f}" aria-checked="${(card.finish||'plain')===f}">${esc(w.finishes[f])}</button>`).join('')}</div><button type="button" class="cw-btn secondary cw-close">${esc(w.close)}</button></div><p class="cw-hint">${esc(w.inspect)}</p>`+
  `<div class="cw-confirm" role="alertdialog" aria-modal="true" aria-label="${esc(w.binQ)}" hidden><div class="cw-confirm-box"><h3>${esc(w.binQ)}</h3><p>${esc(w.binBody)}</p><div class="cw-confirm-row"><button type="button" class="cw-btn secondary cw-keep">${esc(w.keep)}</button><button type="button" class="cw-btn danger cw-discard">${esc(w.discard)}</button></div></div></div>`;
 const veil=layer.querySelector('.cw-veil'),bar=layer.querySelector('.cw-bar'),stage=layer.querySelector('.cw-stage'),hint=layer.querySelector('.cw-hint'),plate=layer.querySelector('.cw-plate');
  const bin=layer.querySelector('.cw-bin'),ring=layer.querySelector('.cw-bin-ring'),confirmEl=layer.querySelector('.cw-confirm');
 const ghost=buildToploader(cell.data,null,{withBack:true});ghost.el.classList.add('cw-ghost');ghost.el.removeAttribute('tabindex');
 ghost.el.style.position='absolute';ghost.el.style.left='0';ghost.el.style.top='0';ghost.el.style.transformOrigin='0 0';
 stage.append(ghost.el);P.root.append(layer);P.root.classList.add('is-inspecting');
 fill(ghost,card);if(card.finish==='shine'||card.finish==='holo')ghost.el.dataset.finish=card.finish;
 /* the how-to line goes once the player has handled the card */
 let hintGone=false;
 splitTitle(plate.querySelector('.cw-plate-title'),card.title);
 const base=P.root.getBoundingClientRect();
 const home=()=>{const r=src.getBoundingClientRect();return {x:r.left-base.left,y:r.top-base.top,s:r.width/TL_W};};
 /* a loose card leaves with the viewer for 我的卡: it shrinks into the wall's counter in the capsule */
 const pocket=()=>{const r=P.root.querySelector('.cw-count').getBoundingClientRect(),s=.11;return {x:r.left-base.left+r.width/2-TL_W*s/2,y:r.top-base.top+r.height/2-TL_H*s/2,s};};
 const fit=()=>Math.min((base.height-170)/(TL_H+40),(base.width*.34)/TL_W,3.1);
 const h0=home();
 /* the twin is laid out at the size it is shown at (CSS zoom) and only ever scaled down by its transform: a 168 px layout
    scaled up 3x is drawn from a small bitmap while it moves (blurry when dragged or turned), a 3x layout scaled down is not */
 const GZ=clamp(Math.ceil(fit()),1,3);ghost.el.style.zoom=String(GZ);
 /* position (x,y,s) of the twin; z = inspect zoom; b veil; u controls */
 const spring=new Spring({x:h0.x,y:h0.y,s:h0.s,z:1,b:0,u:0},v=>{
  const s=v.s*v.z,cx=v.x+TL_W*v.s/2,cy=v.y+TL_H*v.s/2;
  ghost.el.style.transform='translate('+((cx-TL_W*s/2)/GZ).toFixed(3)+'px,'+((cy-TL_H*s/2)/GZ).toFixed(3)+'px) scale('+(s/GZ).toFixed(4)+')';
  veil.style.opacity=clamp(v.b,0,1).toFixed(3);
  const u=clamp(v.u,0,1);bar.style.opacity=u.toFixed(3);bar.style.transform='translate(-50%,'+((1-u)*14).toFixed(2)+'px)';hint.style.opacity=(hintGone?0:u*.8).toFixed(3);
  plate.style.opacity=(u*(1-clamp(bench*4,0,1))).toFixed(3);
  if(parked&&state!=='gone'){const p=park();if(Math.abs(gs.goal.sh-p)>.5)gs.to({sh:p},{k:420,c:40});}
 },{x:.3,y:.3,s:.0006,z:.0008,b:.003,u:.003});
 /* the twin's screen box from the springs' goal or current values */
 const box=(v=spring.x)=>{const s=v.s*v.z,cx=v.x+TL_W*v.s/2,cy=v.y+TL_H*v.s/2;return {x:cx-TL_W*s/2,y:cy-TL_H*s/2,S:s};};
 const target=()=>{const s=fit();return {x:(base.width-TL_W*s)/2,y:(base.height-TL_H*s)/2-24,s,z:1};};
 let bench=0,parked=false;
 /* the parked sleeve: its top edge (the mouth) sits just above the window's bottom edge, whatever the zoom */
 const park=()=>{const b=box();return (base.height-78-b.y)/b.S;};
 spring.render(spring.x);
 /* the museum plate sits right of the card at rest, centred on it (hidden when there is no room) */
 {const t=target(),left=t.x+TL_W*t.s+28,room=base.width-left-40;plate.hidden=room<220;plate.style.left=left+'px';plate.style.top=(t.y+TL_H*t.s-6)+'px';plate.style.maxWidth=Math.min(420,room)+'px';}
 /* free rotation: rx/ry in degrees, unbounded; on the sleeve's tilt layer, or on the bare card */
 let loose=false,closing=false;
 const near=a=>a-360*Math.round(a/360);
 const turnTarget=()=>loose?ghost.flip:ghost.tilt;
 const turn=new Spring({rx:0,ry:0},v=>{
  const t='rotateX('+v.rx.toFixed(2)+'deg) rotateY('+v.ry.toFixed(2)+'deg)';
  turnTarget().style.transform=t;(loose?ghost.tilt:ghost.flip).style.transform='';
  const ax=near(v.rx),ay=near(v.ry),gx=50+clamp(ay,-90,90)*.55,gy=50-clamp(ax,-90,90)*.45;ghost.tilt.style.setProperty('--mx',gx.toFixed(1)+'%');ghost.tilt.style.setProperty('--my',gy.toFixed(1)+'%');ghost.tilt.style.setProperty('--gl',Math.min(1,(Math.abs(ax)+Math.abs(ay))/50).toFixed(3));ghost.tilt.style.setProperty('--px',clamp(ay/40,-1.5,1.5).toFixed(3));ghost.tilt.style.setProperty('--py',clamp(-ax/40,-1.5,1.5).toFixed(3));
 },{rx:.05,ry:.05});
 const faceOn=(k=150,c=20)=>turn.jump({rx:near(turn.x.rx),ry:near(turn.x.ry)}).to({rx:0,ry:0},{k,c});
 const gs=motion(ghost);gs.wall('cy',null);
 ghost.el.classList.add('is-inspect');
 src.style.opacity='0';
 const V=P.viewer={id:cell.id,layer,dispose:()=>{tour(ghost,false);spring.stop();turn.stop();gs.stop();layer.remove();P.root.classList.remove('is-inspecting');src.style.opacity='';if(P.viewer===V)P.viewer=null;}};
 /* out of the wall: it lifts toward you with a quarter turn of play that settles face on (ζ≈0.8) */
 spring.to({...target()},MOTION.lift).to({b:1},MOTION.veil).to({u:1},MOTION.chrome);
 if(!reduce()){turn.jump({rx:8,ry:-14}).to({rx:0,ry:0},{k:90,c:15});revealTitle(plate,300);}
 const desk=on=>layer.classList.toggle('desk',on);
 const goHome=()=>{bench=0;desk(false);spring.to({...target()},{k:150,c:24});};

 /* the service follows what the hand did, in order (chain); a refusal puts the card back where the service has it */
 let applied=false,chain=Promise.resolve();
 const sync=goal=>{chain=chain.then(async()=>{
  if(goal===applied)return;
  try{const next=await call(goal?'cards_eject':'cards_insert',goal?{toploaderId:cell.id}:{toploaderId:cell.id,cardId:card.id});if(!next)throw Error('NO_STATE');
   applied=goal;if(page===P){P.state=next;const t=next.toploaders.find(x=>x.id===cell.id);fill(cell.parts,t?cardOf(next,t):null);updateCount();}}
  catch(e){console.warn(goal?'cards_eject':'cards_insert',e);toast(w.failed);if(!closing&&state!=='gone'){if(applied)free();else seat();}}
 });return chain;};

 /* ---- the card's states: 'in' (in the sleeve), 'free' (out, anywhere), 'gone' (discarded) ---- */
 let state='in';
 const setLoose=on=>{if(loose===on)return;loose=on;turn.render(turn.x);ghost.el.classList.toggle('is-loose',on);};
 /* free: the bare card takes the turns over once face on */
 const free=()=>{state='free';ghost.out=true;parked=true;desk(true);ghost.el.classList.add('is-out');setLoose(true);faceOn(320,36);
  /* the sleeve goes down out of the way until only its mouth shows at the bottom; it lets go of the card with a small kick */
  gs.to({sh:park()},{k:120,c:19}).kick({sy:-.03,hr:4}).to({sx:1,sy:1},{k:520,c:16}).to({hr:0},{k:70,c:6});sync(true);};
 /* seat: the card on the rail, pushed home while the sleeve rises back to its place (both converge, so the card only
    ever goes deeper), a press and a small sway when it bottoms out */
 const seat=async()=>{
  state='in';ghost.out=false;parked=false;setLoose(false);ghost.el.classList.remove('is-out');faceOn(240,30);sync(false);
  const t=ticket(ghost),alive=()=>ghost.seq===t;
  gs.wall('cy',null);gs.to({cx:0,cr:0,cs:1,co:1},{k:300,c:30}).to({lz:0},{k:260,c:26}).to({cy:0},{k:110,c:17}).to({sh:0},{k:110,c:19.5});
  goHome();
  await gs.until(x=>Math.abs(x.sh)<2.5&&Math.abs(x.cy)<2.5);if(!alive())return;
  gs.jump({g:0}).to({g:1},{k:46,c:13}).kick({hr:-7,sy:-.025}).to({hr:0},{k:60,c:4.6}).to({sx:1,sy:1},{k:520,c:16});
  await gs.settled();if(alive())gs.jump({g:0});
 };

 /* ---- the bin (only for a free card) ---- */
 let binP=0,binSide='',armed=false,binAt=null;
 const showBin=(px,py)=>{
  /* pulling a card out goes up: the top edge does not count during the drag that freed it */
  const W=base.width,H=base.height,d={l:px,r:W-px,...(drag?.pulled?{}:{t:py})},side=Object.keys(d).reduce((a,b)=>d[b]<d[a]?b:a),p=binProgress(d[side]);
  binP=p;binSide=side;
  /* on the edge the card heads for, beside the card (past its end along that edge), never under it */
  const r=cardEl.getBoundingClientRect(),cx0=r.left-base.left+r.width/2,cy0=r.top-base.top+r.height/2,inset=46;
  let bx,by;
  if(side==='l'||side==='r'){bx=side==='l'?inset:W-inset;const below=cy0+r.height/2+56;by=below<H-50?below:cy0-r.height/2-56;by=clamp(by,50,H-50);}
  else{by=side==='t'?inset:H-inset;const right=cx0+r.width/2+56;bx=right<W-50?right:cx0-r.width/2-56;bx=clamp(bx,50,W-50);}
  binAt={x:bx,y:by,side};
  const show=clamp(p*3,0,1);
  bin.style.transform='translate('+(bx-32).toFixed(1)+'px,'+(by-32).toFixed(1)+'px) scale('+(.78+.22*show).toFixed(3)+')';
  bin.style.opacity=show.toFixed(3);
  ring.setAttribute('stroke-dashoffset',(RING*(1-p)).toFixed(2));
  const now=p>=1;if(now!==armed){armed=now;bin.classList.toggle('is-armed',now);if(now&&!reduce())bin.animate([{scale:'1'},{scale:'1.16'},{scale:'1'}],{duration:360,easing:'cubic-bezier(.3,1.6,.4,1)'});}
  /* the card gives itself up a little as it nears the bin */
  gs.to({cs:1-.14*p,co:1-.28*p},{k:420,c:40});
 };
 const hideBin=()=>{binP=0;if(armed){armed=false;bin.classList.remove('is-armed');}bin.style.opacity='0';ring.setAttribute('stroke-dashoffset',RING.toFixed(2));};
 const binCentre=()=>binAt?{x:binAt.x,y:binAt.y}:{x:base.width/2,y:base.height-60};

 /* ---- dragging the card ----
    in, pulling: the card follows the hand and the sleeve is drawn the other way (PULL_K times as far), the camera pulls
    back as it comes out; free: the card follows the hand anywhere, the parked sleeve's mouth is a solid object: a card
    coming down onto it off-axis rests on the rim, near the axis it is funnelled in, on the axis it goes onto the rail */
 const cardEl=ghost.card,PULL_K=1.2,RIM_PASS=9;
 /* the card's local offset (cx,cy) that puts a pointer at (px,py) with the grab point g (local, from the card's corner) */
 const localAt=(px,py,g)=>{const b=box();return {cx:(px-b.x)/b.S-11-g.x,cy:(py-b.y)/b.S-12-g.y};};
 let drag=null,grab=null;
 const startDrag=e=>{
  const b=box(),g={x:(e.clientX-base.left-b.x)/b.S-11-gs.x.cx,y:(e.clientY-base.top-b.y)/b.S-12-gs.x.cy};
  ghost.seq=(ghost.seq||0)+1;gs.wall('cy',null);
  drag={id:e.pointerId,g,vx:0,vy:0,t:performance.now(),px:e.clientX,py:e.clientY,moved:false,mode:state==='in'?'pull':'free',z0:spring.goal.z};
  if(state==='free')gs.to({lz:1},{k:320,c:26});
  stage.setPointerCapture?.(e.pointerId);
  faceOn(320,36);
 };
 const moveDrag=e=>{
  const now=performance.now(),dt=Math.max(4,now-drag.t);
  const px=e.clientX-base.left,py=e.clientY-base.top;
  if(!drag.moved){if(Math.hypot(e.clientX-drag.px,e.clientY-drag.py)<3)return;drag.moved=true;layer.classList.add('dragging');goneHint();}
  /* hand speed in screen px/s, smoothed */
  drag.vx=drag.vx*.35+(e.clientX-drag.px)/dt*1000*.65;drag.vy=drag.vy*.35+(e.clientY-drag.py)/dt*1000*.65;drag.px=e.clientX;drag.py=e.clientY;drag.t=now;
  let {cx,cy}=localAt(px,py,drag.g),sh=gs.goal.sh;
  if(drag.mode==='pull'){
   /* card and sleeve part along the rail; the plastic holds the first few px */
   const rel=sleeveY(Math.min(cy,40)*(1+PULL_K));cy=rel/(1+PULL_K);sh=cy-rel;cx=rubber(cx,4);
   const out=clamp(rel/FREE_AT,0,1);bench=out;desk(out>.12);spring.to({z:drag.z0-(drag.z0-.72)*out},{k:420,c:42});
   gs.to({sh},{k:1400,c:75});
   if(rel<FREE_AT){drag.mode='free';drag.pulled=true;free();gs.to({lz:1},{k:320,c:26});}
  }else if(drag.mode==='push'){
   /* on the rail into the parked sleeve: sideways it is held, deeper than home it will not go, back up past the mouth it is free */
   sh=gs.x.sh;cx=rubber(cx,3);let rel=cy-sh;
   if(rel<FREE_AT-6){drag.mode='free';state='free';ghost.out=true;setLoose(true);ghost.el.classList.add('is-out');gs.to({lz:1},{k:300,c:28});}
   else{if(rel>0)rel=rubber(rel,3);cy=sh+rel;}
  }
  if(drag.mode==='free'){
   sh=gs.x.sh;const rel=cy-sh,dx=Math.abs(cx);
   /* the mouth: near the axis the flared lip guides the card in; on the axis past the lip it is on the rail */
   if(rel>FREE_AT-9&&dx<7){const k=clamp((rel-(FREE_AT-9))/9,0,1)*.15;cx*=1-k;}
   if(rel>FREE_AT&&Math.abs(cx)<CARD_W*.95){
    if(Math.abs(cx)<=RIM_PASS){drag.mode='push';state='in';ghost.out=false;setLoose(false);ghost.el.classList.remove('is-out');hideBin();gs.to({lz:0,cs:1,co:1},{k:300,c:32});}
    /* off the axis the card's edge rests on the rim */
    else{cy=sh+FREE_AT+rubber(rel-FREE_AT,4);if(!drag.rim){drag.rim=true;gs.kick({sy:-.02});}}
   }else drag.rim=false;
   /* at least 40 % of it stays in the window */
   const b=box(),hw=CARD_W/2,hh=CARD_H/2,ccx=b.x+(11+cx+hw)*b.S,ccy=b.y+(12+cy+hh)*b.S,mx=hw*b.S*.2,my=hh*b.S*.2;
   const kx=ccx<-mx?-mx+rubber(ccx+mx,30):ccx>base.width+mx?base.width+mx+rubber(ccx-base.width-mx,30):ccx,ky=ccy<-my?-my+rubber(ccy+my,30):ccy;
   cx+=(kx-ccx)/b.S;cy+=(ky-ccy)/b.S;
  }
  ghost.el.classList.toggle('near-mouth',drag.mode==='free'&&cy-gs.x.sh>FREE_AT-18&&Math.abs(cx)<11);
  /* the card leans into the way it is moving */
  const lean=drag.mode==='free'?clamp(drag.vx*.006,-9,9):0;
  gs.to({cx,cy},{k:1400,c:75}).to({cr:lean},{k:260,c:24});
  if(drag.mode==='free')showBin(px,py);else hideBin();
 };
 const endDrag=async e=>{
  const d=drag;drag=null;layer.classList.remove('dragging');ghost.el.classList.remove('near-mouth');
  if(!d.moved){if(state==='in'&&!parked){goHome();gs.to({cy:0,sh:0},{k:300,c:26});}return;}
  if(performance.now()-d.t>90){d.vx=0;d.vy=0;}
  const b=box(),vx=clamp(d.vx,-4000,4000)/b.S,vy=clamp(d.vy,-4000,4000)/b.S;
  if(d.mode==='free'){const spin=clamp(d.vx*.022+d.vy*.006,-110,110);gs.to({cr:0},{k:26,c:6.4,v:{cr:spin}}).to({lz:0},{k:36,c:8.2});}else gs.to({cr:0},{k:160,c:16});
  if(d.mode==='pull'){
   /* let go part way: a fast pull or more than half out finishes it, otherwise card and sleeve close up again */
   const rel=gs.x.cy-gs.x.sh,out=rel/FREE_AT;
   if(out>.5&&vy<240||vy<-700){free();gs.to({cy:Math.min(gs.x.cy,gs.x.sh+FREE_AT-24)},{k:120,c:17,v:{cy:Math.min(vy,0)}});}
   else{gs.to({cx:0},{k:300,c:30}).to({cy:0},{k:240,c:16,v:{cy:Math.max(vy,0)}}).to({sh:0},{k:240,c:20});goHome();gs.until(x=>Math.abs(x.cy-x.sh)<1).then(()=>{if(state==='in'&&!drag)gs.kick({hr:-6}).to({hr:0},{k:60,c:4.6});});}
   return;
  }
  if(d.mode==='push'){const rel=gs.x.cy-gs.x.sh;if(rel>FREE_AT+26||vy>0){seat();return;}free();return;}
  if(armed){askDiscard();return;}
  hideBin();
  const rel=gs.x.cy-gs.x.sh;
  if(Math.abs(gs.x.cx)<=RIM_PASS*.6&&rel>FREE_AT-8&&vy>=0){seat();return;}
  /* thrown: it coasts on from the hand's speed and settles inside the window; over the sleeve its bottom edge hits the rim and bounces */
  const c=5.5,ex=coastEnd(gs.x.cx,vx,c),ey=coastEnd(gs.x.cy,vy,c);
  const b2=box(spring.goal);
  const minX=(24-b2.x)/b2.S-11,maxX=(base.width-24-b2.x)/b2.S-11-CARD_W,minY=(24-b2.y)/b2.S-12,maxY=(base.height-24-b2.y)/b2.S-12-CARD_H;
  const over=Math.abs(clamp(ex,minX,maxX))<CARD_W*.95&&rel<FREE_AT;
  gs.wall('cy',over?gs.x.sh+FREE_AT:null,.38);
  gs.to({cx:clamp(ex,minX,maxX),cy:clamp(ey,minY,over?gs.x.sh+FREE_AT:maxY)},{k:46,c:12.5,v:{cx:vx,cy:vy}});
 };

 /* ---- discard: asked once more ---- */
 const askDiscard=()=>{
  state='asking';confirmEl.hidden=false;const boxEl=confirmEl.querySelector('.cw-confirm-box');
  {const bw=Math.min(360,base.width-48),bh=boxEl.offsetHeight||170,b=binAt||{x:base.width/2,y:base.height/2,side:'b'};
   let left=b.side==='l'?b.x+52:b.side==='r'?b.x-52-bw:b.x-bw/2,top=b.side==='t'?b.y+52:b.side==='b'?b.y-52-bh:b.y-bh/2;
   const L=clamp(left,24,base.width-bw-24),T=clamp(top,24,base.height-bh-24);boxEl.style.left=L+'px';boxEl.style.top=T+'px';boxEl.dataset.side=b.side;
   boxEl.style.setProperty('--ax',clamp(b.x-L,22,bw-22)+'px');boxEl.style.setProperty('--ay',clamp(b.y-T,22,bh-22)+'px');}
  if(!reduce()){confirmEl.animate([{opacity:0},{opacity:1}],{duration:200,easing:'linear'});boxEl.animate([{transform:'scale(.94)',opacity:0},{transform:'none',opacity:1}],{duration:420,easing:EASE_OUT});}
  confirmEl.querySelector('.cw-keep').focus({preventScroll:true});
 };
 const closeAsk=()=>{if(confirmEl.hidden)return;if(reduce())confirmEl.hidden=true;else confirmEl.animate([{opacity:1},{opacity:0}],{duration:160,easing:'linear'}).finished.then(()=>{confirmEl.hidden=true;},()=>{confirmEl.hidden=true;});};
 const keep=()=>{
  closeAsk();state='free';hideBin();
  /* it comes back from the edge to the middle of the bench */
  /* it comes back from the edge to the middle of the pad, wherever the parked sleeve is */
  {const b=box();gs.to({cx:(base.width/2-b.x)/b.S-11-CARD_W/2,cy:(base.height*.44-b.y)/b.S-12-CARD_H/2,cr:0,cs:1,co:1},{k:120,c:18});}setTimeout(()=>layer.focus({preventScroll:true}),0);
 };
 const discard=async()=>{
  closeAsk();state='gone';closing=true;
  await chain;
  /* into the bin: it shrinks onto the ring and goes out */
  const bc=binCentre(),b=box();
  gs.to({cx:(bc.x-b.x)/b.S-11-CARD_W/2,cy:(bc.y-b.y)/b.S-12-CARD_H/2,cs:.12,cr:-10},{k:170,c:24}).to({co:0},{k:90,c:20});
  bin.classList.add('is-eating');if(!reduce())setTimeout(()=>{const f=document.createElement('i');f.className='cw-bin-flare';bin.append(f);f.animate([{transform:'scale(.6)',opacity:.9},{transform:'scale(2.4)',opacity:0}],{duration:620,easing:EASE_OUT}).finished.then(()=>f.remove(),()=>f.remove());},260);
  let next=null;try{next=applied?await call('cards_delete',{cardId:card.id}):null;}catch(e){console.warn('cards_delete',e);}
  if(!next){toast(w.failed);closing=false;state='free';bin.classList.remove('is-eating');keep();return;}
  if(page===P){P.state=next;updateCount();}
  await gs.until(x=>x.co<.05);hideBin();desk(false);parked=false;gs.to({sh:0},{k:160,c:24});
  /* the empty sleeve goes back to its place on the wall */
  spring.to({...home(),z:1},MOTION.home).to({b:0},{k:170,c:28}).to({u:0},{k:300,c:34});
  await spring.until(v=>Math.abs(v.s*v.z-home().s)<.02&&Math.hypot(v.x-home().x,v.y-home().y)<3);
  src.style.opacity='';V.dispose();
 };
 confirmEl.querySelector('.cw-keep').addEventListener('click',keep);
 confirmEl.addEventListener('pointerdown',e=>{if(!e.target.closest('.cw-confirm-box'))keep();});
 confirmEl.querySelector('.cw-discard').addEventListener('click',discard);

 const close=async()=>{
  if(closing)return;closing=true;layer.classList.add('closing');hideBin();desk(false);
  ghost.seq=(ghost.seq||0)+1;
  const out=state==='free',into=out?pocket:home;
  parked=false;if(out)gs.to({co:0},{k:60,c:16}).to({sh:0,so:0},{k:120,c:22});else gs.to({cx:0,cy:0,cr:0,cs:1,sh:0},{k:300,c:30});
  faceOn(200,28);
  spring.to({...into(),z:1},MOTION.home).to({b:0},{k:170,c:28}).to({u:0},{k:300,c:34});
  const at=(v,d)=>{const h=into();return Math.hypot(v.x-h.x,v.y-h.y)<d*h.s*TL_W&&Math.abs(v.s*v.z-h.s)<h.s*d*.7;};
  await spring.until(v=>at(v,.12));
  src.style.opacity='';
  if(out){pulseCount();await spring.until(v=>at(v,.04)||gs.x.co<.02);}
  else await spring.until(v=>Math.abs(v.s*v.z-home().s)<.012&&Math.hypot(v.x-home().x,v.y-home().y)<2.5);
  V.dispose();
 };
 layer.querySelector('.cw-close').addEventListener('click',close);
 layer.querySelector('.cw-finish').addEventListener('click',async e=>{const btn=e.target.closest('[data-finish]');if(!btn||closing)return;const f=btn.dataset.finish,prev=card.finish||'plain';if(f===prev)return;
  const setF=v=>{card.finish=v;for(const el of [ghost.el,cell.parts.el]){if(v==='plain')delete el.dataset.finish;else el.dataset.finish=v;}for(const x of layer.querySelectorAll('.cw-finish [data-finish]'))x.setAttribute('aria-checked',String(x.dataset.finish===v));};
  setF(f);if(!reduce())ghost.tilt.animate([{'--gl':0},{'--gl':.8,offset:.4},{'--gl':0}],{duration:900,easing:EASE_OUT});
  try{const next=await call('cards_set_finish',{cardId:card.id,finish:f});if(!next)throw Error('NO_STATE');if(page===P)P.state=next;}catch(err){console.warn('cards_set_finish',err);setF(prev);if(/CARD_NOT_FOUND/.test(String(err?.message||err))){toast(w.stale);refresh();}else toast(w.failed);}});
 const goneHint=()=>{if(hintGone)return;hintGone=true;if(!reduce())hint.animate([{opacity:getComputedStyle(hint).opacity},{opacity:0}],{duration:300,easing:'linear'});hint.style.opacity='0';};
 /* keyboard: Enter / Space take the card out or put it back, Delete asks to discard, Escape closes */
 const keyPull=()=>{if(closing)return;if(state==='in'){bench=1;desk(true);spring.to({z:.72},{k:150,c:24});const rel=FREE_AT-30,cy=rel/2.2;free();gs.to({cy},{k:120,c:17});}else if(state==='free')seat();};
 layer.addEventListener('keydown',e=>{
  if(!confirmEl.hidden){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();keep();}return;}
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
  else if((e.key==='Enter'||e.key===' ')&&e.target===layer){e.preventDefault();keyPull();}
  else if(e.key==='Delete'&&state==='free'){e.preventDefault();askDiscard();}
 });
 /* a press on the card drags it; anywhere else it turns the card (with the velocity carried into a friction coast);
    wheel zooms, double-click faces on, a press that does not move on the veil closes */
 cardEl.addEventListener('pointerenter',()=>tour(ghost,true));cardEl.addEventListener('pointerleave',()=>{if(!drag)tour(ghost,false);});
 cardEl.addEventListener('pointerenter',()=>{if(state==='in'&&!drag&&!grab&&!closing)gs.to({cy:-5},{k:300,c:26});});
 cardEl.addEventListener('pointerleave',()=>{if(state==='in'&&!drag&&!closing)gs.to({cy:0},{k:300,c:26});});
 stage.style.pointerEvents='auto';
 stage.addEventListener('pointerdown',e=>{
  if(closing||state==='asking'||state==='gone'||!e.isPrimary||e.button!==0)return;
  if(e.target.closest('.cw-ghost .cw-card')){turn.stop();startDrag(e);return;}
  turn.stop();grab={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),rx:turn.x.rx,ry:turn.x.ry,vx:0,vy:0,moved:false,onCard:!!e.target.closest('.cw-ghost')};
  stage.setPointerCapture?.(e.pointerId);
 });
 stage.addEventListener('pointermove',e=>{
  if(drag?.id===e.pointerId){moveDrag(e);return;}
  if(grab?.id!==e.pointerId)return;
  const dx=e.clientX-grab.x,dy=e.clientY-grab.y;if(!grab.moved&&Math.hypot(dx,dy)<4)return;
  if(!grab.moved){grab.moved=true;layer.classList.add('turning');goneHint();}
  const now=performance.now(),dt=Math.max(4,now-grab.t),k=.42/Math.sqrt(spring.x.z);
  const ry=grab.ry+dx*k,rx=grab.rx-dy*k,prevX=turn.x.rx,prevY=turn.x.ry;
  turn.jump({rx,ry});
  grab.vx=grab.vx*.3+(rx-prevX)/dt*1000*.7;grab.vy=grab.vy*.3+(ry-prevY)/dt*1000*.7;grab.t=now;
 });
 const release=e=>{
  if(drag?.id===e.pointerId){endDrag(e);return;}
  if(grab?.id!==e.pointerId)return;const g=grab;grab=null;layer.classList.remove('turning');
  if(!g.moved){if(!g.onCard&&e.type==='pointerup')close();return;}
  if(performance.now()-g.t>80||reduce())return;
  /* coast: friction only (k=0), the rest angle is where the decay ends, so it never springs back */
  const c=4.2,vx=clamp(g.vx,-1400,1400),vy=clamp(g.vy,-1400,1400);
  turn.to({rx:turn.x.rx+vx/c,ry:turn.x.ry+vy/c},{k:0,c,v:{rx:vx,ry:vy}});
 };
 stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);
 stage.addEventListener('dblclick',e=>{if(closing||e.target.closest('.cw-ghost .cw-card'))return;faceOn();spring.to({z:spring.goal.z>.9?1:spring.goal.z},{k:200,c:26});});
 stage.addEventListener('wheel',e=>{
  e.preventDefault();if(closing||drag||(state==='in'&&bench))return;
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?base.height:1);
  const goal=clamp((spring.goal.z||1)*Math.exp(-delta*.0016),state==='free'?.5:.55,state==='free'?1.9:3.2);
  spring.to({z:goal},{k:260,c:32});
 },{passive:false});
 layer.tabIndex=-1;layer.focus({preventScroll:true});
 V.turn=turn;V.spring=spring;V.ghost=ghost;V.close=close;V.pull=keyPull;V.state=()=>({state,applied,loose,closing,binP,armed});
 return V;
}

/* test hooks for the headless checks (validation/card-wall-*.cjs) */
if(window.__TOME_TEST_TRANSPORT__)window.__megulitCardWall={open:openCardWall,close:closeCardWall,page:()=>page,insertMotion,hangMotion,scuffPicks,sleeveY,inMouth,binProgress,setMode,activate,refresh,stillTransform};
