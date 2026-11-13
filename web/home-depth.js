/* 2026-11-13 (user: "整个首页加景深效果，并参与鼠标互动，不要静止") home depth: every layer of the home page sits at its own depth and follows
   the pointer on a spring; near layers move more than far ones, far layers carry a fixed pre-set blur (CSS), and an idle page drifts very slightly.
   Only `translate`/`transform` are written per frame, so the loop stays on the compositor. Also holds the daily-news cache and the flat-picture
   check used by the home page (user: "缩略图不要展示纯色图", "每次回到首页都重新加载、卡一下"). */

/* flatness of an RGBA sample: luma spread and the share of the most common coarse colour; a plain backdrop with a small icon is flat */
export function flatness(data){let n=0,sum=0,sq=0;const buckets=new Map();for(let i=0;i<data.length;i+=4){if(data[i+3]<16)continue;const r=data[i],g=data[i+1],b=data[i+2],
 l=.299*r+.587*g+.114*b;n++;sum+=l;sq+=l*l;const k=(r>>5)<<6|(g>>5)<<3|(b>>5);buckets.set(k,(buckets.get(k)||0)+1);}
 if(!n)return {std:0,share:1,colors:0};const mean=sum/n,std=Math.sqrt(Math.max(0,sq/n-mean*mean)),top=Math.max(...buckets.values()),colors=[...buckets.values()].filter(c=>c/n>=.02).length;
 return {std,share:top/n,colors};}
export function isFlat(data){const f=flatness(data);return f.share>=.62||(f.std<18&&f.share>=.4)||(f.colors<=2&&f.share>=.35);}

const verdicts=new Map();
const key=src=>String(src).length+':'+String(src).slice(-64);
/* resolves true when the picture is (near) one colour or fails to load; results are remembered per picture */
export function pictureIsFlat(src,{make=()=>new Image(),canvas=()=>document.createElement('canvas')}={}){if(!src)return Promise.resolve(true);const k=key(src);
 if(verdicts.has(k))return verdicts.get(k);const p=new Promise(done=>{const img=make();img.onload=()=>{try{const c=canvas();c.width=c.height=24;const x=c.getContext('2d',
 {willReadFrequently:true});x.drawImage(img,0,0,24,24);done(isFlat(x.getImageData(0,0,24,24).data));}catch{done(false);}};img.onerror=()=>done(true);img.src=src;});
 verdicts.set(k,p);return p;}
/* marks every news item with a picture as flat or not; items keep their order */
export async function markFlat(view,check=pictureIsFlat){const items=view?.news?.items;if(!Array.isArray(items))return view;
 await Promise.all(items.map(async x=>{if(x&&x.image&&typeof x.flat!=='boolean')x.flat=await check(x.image);}));return view;}

/* daily-news cache: memory first (instant on every return), then localStorage (instant on the first visit of a session) */
const STORE='megulit-home-daily-v1',memo={daily:null,at:0,activity:null};
export function dailySignature(v){return JSON.stringify([(v?.news?.items||[]).slice(0,12).map(x=>[x.title,x.link,x.cat,x.sensitive,x.flat,String(x.image||'').length]),
 (v?.words?.words||[]).slice(0,1).map(h=>[h.term,h.gloss])]);}
function slim(v){return {news:{items:(v?.news?.items||[]).slice(0,10).map(({title,link,source,date,cat,sensitive,image,flat})=>({title,link,source,date,cat,sensitive,image,flat}))},
 words:{words:(v?.words?.words||[]).slice(0,1)}};}
export function cachedDaily(storage=globalThis.localStorage){if(memo.daily)return memo.daily;try{const raw=storage?.getItem(STORE);if(raw){memo.daily=JSON.parse(raw);
 memo.at=0;}}catch{}return memo.daily;}
export function rememberDaily(v,storage=globalThis.localStorage){const s=slim(v);memo.daily=s;memo.at=Date.now();try{storage?.setItem(STORE,JSON.stringify(s));}catch{
 try{storage?.setItem(STORE,JSON.stringify({...s,news:{items:s.news.items.slice(0,4)}}));}catch{}}return s;}
/* a fresh copy fetched within the last few minutes is not fetched again */
export function dailyIsFresh(now=Date.now()){return !!memo.daily&&memo.at>0&&now-memo.at<5*60e3;}
export function cachedActivity(){return memo.activity;}
export function rememberActivity(v){memo.activity=v;return v;}
export function resetHomeCache(){memo.daily=null;memo.at=0;memo.activity=null;verdicts.clear();}

/* spring-driven multi-layer parallax. layers: [{el,z,base?}] (z>0 near, z<0 far); planes inside the 3D canvas get their translateZ kept */
export function createDepth(root,{layers=[],canvas=null,planes=[],raf=globalThis.requestAnimationFrame?.bind(globalThis),caf=globalThis.cancelAnimationFrame?.bind(globalThis),
 now=()=>performance.now()}={}){
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion:reduce)').matches;if(reduced||!raf)return {stop(){},frame(){},state:null,hold(){},neutral:fn=>fn()};
 const s={x:0,y:0,vx:0,vy:0,tx:0,ty:0,inside:false,hold:false,lastMove:-1e9,t0:now(),last:now(),id:0,alive:true};
 const onMove=e=>{const r=root.getBoundingClientRect();if(!r.width||!r.height)return;s.tx=Math.max(-.5,Math.min(.5,(e.clientX-r.left)/r.width-.5));
  s.ty=Math.max(-.5,Math.min(.5,(e.clientY-r.top)/r.height-.5));s.inside=true;s.lastMove=now();wake();};
 const onLeave=()=>{s.inside=false;s.tx=0;s.ty=0;wake();};
 root.addEventListener('pointermove',onMove,{passive:true});root.addEventListener('pointerleave',onLeave);
 layers.forEach(l=>{l.el.style.willChange='translate';});
 function paint(x,y){layers.forEach(l=>{const z=l.z;l.el.style.translate=`${(-x*z*1.1).toFixed(2)}px ${(-y*z*.8).toFixed(2)}px`;});
  if(canvas)canvas.style.transform=`rotateY(${(x*13).toFixed(3)}deg) rotateX(${(-y*10).toFixed(3)}deg)`;
  planes.forEach(p=>{const z=+p.dataset.z||0;p.style.transform=`translate3d(${(-x*z*.6).toFixed(2)}px,${(-y*z*.45).toFixed(2)}px,${z}px)`;});}
 function frame(t=now()){s.id=0;if(!s.alive)return;if(!root.isConnected){stop();return;}const dt=Math.min(.05,Math.max(.001,(t-s.last)/1000));s.last=t;
  /* idle breathing: a slow Lissajous drift that fades in after the pointer rests or leaves */
  const idle=Math.min(1,Math.max(0,(t-s.lastMove-1400)/2600)),ph=(t-s.t0)/1000,bx=Math.sin(ph*.21)*.07+Math.sin(ph*.13+1.3)*.035,by=Math.cos(ph*.17)*.05;
  /* while a card flies onto the field the scene settles flat (hold), so the flying card and the real one meet with the same shape */
  const gx=s.hold?0:(s.inside?s.tx:0)*(1-idle*.35)+bx*idle,gy=s.hold?0:(s.inside?s.ty:0)*(1-idle*.35)+by*idle;
  /* under-damped a touch while following, slower when returning home, quick and nearly critical while holding */
  const k=s.hold?110:s.inside?38:14,c=s.hold?19:s.inside?10.5:7.2;s.vx+=((gx-s.x)*k-s.vx*c)*dt;s.vy+=((gy-s.y)*k-s.vy*c)*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;paint(s.x,s.y);
  if(document.hidden)return;s.id=raf(frame);}
 function wake(){if(!s.id&&s.alive)s.id=raf(frame);}
 const onVis=()=>{if(!document.hidden)wake();};document.addEventListener('visibilitychange',onVis);
 function stop(){s.alive=false;if(s.id)caf?.(s.id);s.id=0;root.removeEventListener('pointermove',onMove);root.removeEventListener('pointerleave',onLeave);
  document.removeEventListener('visibilitychange',onVis);}
 /* hold(true) flattens the scene for a card landing; neutral(fn) measures the scene as it is with no tilt (layout read with neutral transforms, put back before any paint) */
 function hold(on){s.hold=!!on;wake();}
 function neutral(fn){paint(0,0);try{return fn();}finally{paint(s.x,s.y);}}
 wake();return {stop,frame,state:s,hold,neutral};}
