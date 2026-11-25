import {requestUiFrame,cancelUiFrame} from './idle-gate.js';
import {activityCells} from './learning-activity.js';
import {openLinesPicker} from './home-lines.js';
import {createDepth,markFlat,cachedDaily,rememberDaily,dailyIsFresh,dailySignature,cachedActivity,rememberActivity} from './home-depth.js';
import {exAttr,setExample} from './example-ruby.js';
import {loadGsap} from './gsap-loader.js';
import {seedBannerHTML,openSeedDialog} from './the-seed.js';
import {createDock,openHandPicker,HAND_MAX} from './home-picker.js';
import {pickHeadline,cachedHeadline,translateHeadline,headlineLabel,activitySummary,emptyActivityHTML} from './home-today.js';

const copy={
 zh:{tipClick:'单击',tipDetail:'作品详情',tipDbl:'双击',tipDraw:'抽一张',daily:'每日热点',streak:'最长连续',figRead:'累计阅读',figChars:'读过的字',figWords:'关联单词',last:'上次',coverHint:'单击查看详情 · 双击抽卡',
  search:'搜索作品',read:'今日阅读',words:'收录单词',lookups:'查词',full:'完整统计',play:'继续游玩',detail:'作品详情',all:'全部作品',edit:'选择首页展示的作品',title:'首页展示的作品',sub:'拖动排序 · 置顶 · 隐藏',auto:'按最近游玩',
  pick:'只放我挑的',pin:'置顶',hide:'隐藏',close:'关闭',hintAuto:'按最近游玩自动轮播；置顶的永远在最前，隐藏的不出现。',hintPick:'只轮播这里的顺序；一个都不剩时回到最近游玩。',chars:'字',linked:'词',total:'累计',activity:'学习活动',
  days:'天',min:'分',empty:'还没有作品',add:'添加游戏'},
 ja:{tipClick:'クリック',tipDetail:'作品詳細',tipDbl:'ダブルクリック',tipDraw:'ドロー',daily:'今日の話題',streak:'最長連続',figRead:'累計読書',figChars:'読んだ文字',figWords:'関連単語',last:'前回',coverHint:'クリックで詳細 · ダブルクリックでガチャ',
  search:'作品を検索',read:'今日の読書',words:'収録単語',lookups:'辞書引き',full:'統計をすべて見る',play:'続きをプレイ',detail:'作品詳細',all:'すべての作品',edit:'ホームに表示する作品を選ぶ',title:'ホームに表示する作品',sub:'ドラッグで並べ替え · 固定 · 非表示',
  auto:'最近プレイ順',pick:'選んだ作品だけ',pin:'固定',hide:'非表示',close:'閉じる',hintAuto:'最近プレイ順に切り替わります。固定は常に先頭、非表示は出ません。',hintPick:'この順番だけで切り替えます。残りがなければ最近プレイ順に戻ります。',chars:'字',
  linked:'語',total:'累計',activity:'学習の記録',days:'日',min:'分',empty:'作品がまだありません',add:'ゲームを追加'},
 en:{tipClick:'Click',tipDetail:'Details',tipDbl:'Double-click',tipDraw:'Draw a card',daily:'Daily picks',streak:'best streak',figRead:'Time read',figChars:'Characters read',
  figWords:'Linked words',last:'Last',coverHint:'Click for details · double-click to draw',search:'Search games',read:'Read today',words:'Words saved',lookups:'Lookups',
  full:'Full statistics',play:'Continue',detail:'Details',all:'All games',edit:'Choose games for the home screen',title:'Games on the home screen',sub:'Drag to reorder · pin · hide',
  auto:'Recently played',pick:'Only my picks',pin:'Pin',hide:'Hide',close:'Close',hintAuto:'Cycles through recently played games; pinned ones lead, hidden ones never show.',
  hintPick:'Cycles through this order only; falls back to recently played when empty.',chars:'chars',linked:'words',total:'Total',activity:'Learning activity',days:'days',
  min:'min',empty:'No games yet',add:'Add game'}};

const DUR=12000,BEAT=476,LOGO=new URL('./assets/megulit-logo.svg',import.meta.url).href;
const details=new Map(),palettes=new Map();
const LINES_EDIT={zh:'选择台词',ja:'セリフを選ぶ',en:'Choose lines'};
/* (user 2026-11-12) the lines chosen for this game in the picker, else the automatic ones (saved sentences, else the latest read) */
/* 2026-11-13: lines recorded before script identifiers were filtered (10_プロローグ0725___for_summerpockets) stay out of the showcase */
const storyLine=t=>!(t&&!/\s/.test(t)&&t.includes('_')&&!/[。、！？!?…―]/.test(t));
export function homeLinesFor(d){const own=(d?.homeLines||[]).map(t=>String(t||'').trim()).filter(Boolean);if(own.length)return {lines:own.slice(0,5),custom:true};
 if(Array.isArray(d?.homeAuto))return {lines:d.homeAuto.map(t=>String(t||'').trim()).filter(Boolean).filter(storyLine).slice(0,8),custom:false};const saved=(d?.sentences||[]).map(s=>String(s.text||'').trim()).filter(Boolean).filter(storyLine);
 return {lines:(saved.length?saved:(d?.recentLines||[]).map(s=>String(s.text||'').trim()).filter(Boolean).filter(storyLine).slice(-6)).slice(0,8),custom:false};}
let live=null;

export function cleanShowcase(value){const v=value&&typeof value==='object'?value:{},ids=list=>Array.isArray(list)?[...new Set(list.filter(x=>typeof x==='string'&&x.length<200))].slice(0,
 500):[];return {mode:v.mode==='pick'?'pick':'auto',order:ids(v.order),pinned:ids(v.pinned),hidden:ids(v.hidden)};}

export function showcaseGames(games,setting){const sc=cleanShowcase(setting),available=games.filter(g=>g.available!==false&&!sc.hidden.includes(g.id)),by=id=>available.find(g=>g.id===id),
 when=g=>g.lastLaunchedAt||g.lastPlayedAt||0,recent=[...available].sort((a,b)=>when(b)-when(a)),pinned=sc.pinned.map(by).filter(Boolean);
 if(sc.mode==='pick'){const picked=sc.order.map(by).filter(Boolean);if(picked.length)return [...pinned,...picked.filter(g=>!pinned.includes(g))].slice(0,HAND_MAX);}
 return [...pinned,...recent.filter(g=>!pinned.includes(g))].slice(0,HAND_MAX);}

function palette(game){if(palettes.has(game.id))return Promise.resolve(palettes.get(game.id));const fallback=['#d05b34','#edb56e','#3b4a8c'];if(!game.cover)return Promise.resolve(fallback);
 return new Promise(done=>{const img=new Image();img.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(img,0,0,24,24);const d=x.getImageData(0,0,24,24).data,px=[];for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,
  g,b);px.push({r,g,b,s:mx?(mx-mn)/mx:0,l:(mx+mn)/510});}
  const hex=p=>'#'+[p.r,p.g,p.b].map(v=>v.toString(16).padStart(2,'0')).join(''),vivid=[...px].sort((a,b)=>b.s*(1-Math.abs(a.l-.5))-a.s*(1-Math.abs(b.l-.5))),light=[...px].sort((a,
   b)=>b.l-a.l),dark=[...px].sort((a,b)=>a.l-b.l);const out=[hex(vivid[0]),hex(light[Math.floor(light.length*.1)]),hex(dark[Math.floor(dark.length*.15)])];palettes.set(game.id,
   out);done(out);}catch{done(fallback);}};img.onerror=()=>done(fallback);img.src=game.cover;});}

function detail(api,id,locale){if(!details.has(id))details.set(id,api('game_detail',{id,locale}).catch(()=>({})));return details.get(id);}

const rnd=(a,b)=>a+Math.random()*(b-a),pickOne=list=>list[Math.floor(Math.random()*list.length)];
const EASES=['cubic-bezier(.2,.8,.2,1)','cubic-bezier(.16,1,.3,1)','cubic-bezier(.34,1.56,.64,1)','cubic-bezier(.7,0,.2,1)'];
const backCard=()=>{const d=document.createElement('div');d.className='tv-back tv-loose';d.innerHTML=`<img src="${LOGO}" alt=""><i></i><i></i><i></i><i></i>`;return d;
 };
const PILE={x:-82,y:44,r:-11,s:.74,n:6};
function pileCards(pile){if(pile.childElementCount)return;for(let n=0;n<PILE.n;n++){const c=backCard();c.style.transform=`translate(${(PILE.n-1-n)*1.6}px,${(PILE.n-1-n)*2}px) rotate(${((n*37)%7-3)*.5}deg)`;
 pile.appendChild(c);}}
const at=(dx,dy,r,s,extra='')=>`translate(${dx}%,${dy}%) ${extra} rotate(${r}deg) rotateY(var(--turn)) scale(${s})`;
const P0=()=>at(PILE.x,PILE.y,PILE.r,PILE.s),UP=(k=1)=>`translateZ(${rnd(50,100)*k}px)`,E1='cubic-bezier(.25,.8,.25,1)',E2='cubic-bezier(.22,1,.36,1)',E3='cubic-bezier(.45,0,.25,1)',
 EB='cubic-bezier(.3,1.35,.5,1)';
const DRAWS={
 slide:()=>({pile:'none',f:[[0,P0()],[.14,at(PILE.x-12,PILE.y+2,PILE.r-5,PILE.s),E1],[.36,at(PILE.x*.45,PILE.y*.25-rnd(12,22),PILE.r*.3,.96,UP(.7)),E2]]}),
 flick:()=>{const sp=pickOne([-1,1])*360;return {pile:'bump',f:[[0,P0()],[.1,at(PILE.x,PILE.y-3,PILE.r+4,PILE.s*.97),E3],[.34,at(PILE.x*.5,PILE.y*.1-rnd(30,45),
  PILE.r+sp*.8,.9,UP(1.2)),E2],[.46,at(0,-4,sp,1.02),E1]]};},
 fan:()=>({pile:'fan',f:[[0,P0()],[.16,at(PILE.x+4,PILE.y-6,PILE.r+18,PILE.s),E1],[.26,at(PILE.x+6,PILE.y-30,PILE.r+12,PILE.s*1.05),E1],[.4,at(PILE.x*.35,PILE.y*.1-14,
  PILE.r*.2,.97,UP(.7)),E2]]}),
 cut:()=>({pile:'cut',f:[[0,P0()],[.18,P0(),'linear'],[.27,at(PILE.x+2,PILE.y-24,PILE.r-6,PILE.s*1.04),E1],[.4,at(PILE.x*.4,PILE.y*.15-16,PILE.r*.3,.97,UP(.7)),
  E2]]}),
 peel:()=>({pile:'none',f:[[0,P0()],[.15,at(PILE.x,PILE.y-4,PILE.r,PILE.s,'rotateX(38deg)'),E1],[.24,at(PILE.x+3,PILE.y-12,PILE.r+6,PILE.s*1.04,'rotateX(10deg)'),
  E1],[.4,at(PILE.x*.4,PILE.y*.15-18,PILE.r*.2,.97,UP(.7)),E2]]}),
 riffle:()=>({pile:'riffle',f:[[0,P0()],[.22,P0(),'linear'],[.3,at(PILE.x-4,PILE.y-18,PILE.r-10,PILE.s*1.03),E1],[.42,at(PILE.x*.4,PILE.y*.1-20,PILE.r*.2,.97,UP(.8)),
  E2]]}),
 bottom:()=>({pile:'lift',f:[[0,at(PILE.x,PILE.y,PILE.r,PILE.s,'translateZ(-30px)')],[.2,at(PILE.x+78,PILE.y+8,PILE.r+8,PILE.s,'translateZ(-30px)'),E1],[.3,at(PILE.x+84,
  PILE.y-4,PILE.r+5,PILE.s*1.02,UP(.4)),E1],[.42,at(PILE.x*.3,PILE.y*.1-12,PILE.r*.2,.98,UP(.7)),E2]]}),
 fromLeft:()=>({f:[[0,at(-190,rnd(-30,30),-25,.9)],[.42,at(6,0,4,1.01),E2]]}),
 fromRight:()=>({f:[[0,at(190,rnd(-30,30),25,.9)],[.42,at(-6,0,-4,1.01),E2]]}),
 slam:()=>({f:[[0,at(0,-170,rnd(-8,8),1.25,UP(2.5))],[.3,at(0,3,0,.97),'cubic-bezier(.6,0,.9,.5)'],[.38,at(0,-4,0,1.02),E1],[.45,at(0,1,0,1),E1]]}),
 rise:()=>({f:[[0,at(0,170,rnd(-6,6),.8)],[.4,at(0,-6,0,1.02),E2]]}),
 spinIn:()=>({f:[[0,at(0,0,pickOne([-720,720]),.05)],[.42,at(0,0,0,1.04),'cubic-bezier(.15,.8,.25,1)']]}),
 zoom:()=>({f:[[0,at(rnd(-20,20),rnd(-20,20),rnd(-20,20),3.2,UP(3))],[.12,at(0,0,0,2.4,UP(2)),'linear'],[.4,at(0,0,0,1,''),'cubic-bezier(.2,.8,.2,1)']]}),
 boomerang:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(sx*200,-40,sx*60,.8)],[.22,at(-sx*55,10,-sx*30,.95,UP(.6)),E2],[.42,at(sx*4,0,sx*3,1),E1]]};},
 spiral:()=>{const k=pickOne([-1,1]),fr=[];for(let n=0;n<=6;n++){const a=n/6*Math.PI*2.4*k,rr=(1-n/6)*120;fr.push([n/6*.44,at(Math.cos(a)*rr,Math.sin(a)*rr*.8,(1-n/6)*k*-200,
  .5+n/12),n?'linear':undefined]);}return {f:fr};},
 frisbee:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(sx*-160,-120,sx*-40,.7,'rotateX(70deg)')],[.24,at(sx*-40,-50,sx*-200,.9,'rotateX(45deg) '+UP()),E2],[.44,
  at(0,0,0,1,'rotateX(0deg)'),E1]]};},
 behind:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(0,0,0,.8,'translateZ(-160px)')],[.2,at(sx*90,-4,sx*8,.9,'translateZ(-60px)'),E1],[.42,at(0,0,0,1,UP(.5)),
  E2]]};},
 portal:()=>({f:[[0,at(0,0,0,1,'scaleX(.02) scaleY(.02)')],[.18,at(0,0,0,1,'scaleX(1.05) scaleY(.03)'),E1],[.38,at(0,0,0,1,'scaleY(1.06)'),EB],[.46,at(0,0,0,1),
  E1]]}),
 leaf:()=>{const k=pickOne([-1,1]);return {f:[[0,at(k*-30,-180,k*-30,.9)],[.12,at(k*30,-120,k*25,.92),E3],[.24,at(k*-25,-60,k*-18,.95),E3],[.36,at(k*12,-16,k*10,
  .98),E3],[.46,at(0,0,0,1),E3]]};},
 dealer:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(sx*-170,140,sx*-540,.85)],[.3,at(sx*14,4,sx*6,1),'cubic-bezier(.1,.7,.3,1)'],[.42,at(0,0,0,1),E1]]};},
 elastic:()=>({f:[[0,at(0,0,0,.01)],[.2,at(0,0,rnd(-6,6),1.28),'cubic-bezier(.2,.9,.3,1)'],[.3,at(0,0,0,.9),E3],[.38,at(0,0,0,1.06),E3],[.46,at(0,0,0,1),E3]]}),
 slots:()=>({f:[[0,at(0,-320,0,1)],[.1,at(0,-140,0,1),'linear'],[.2,at(0,-30,0,1),'linear'],[.32,at(0,8,0,1),'cubic-bezier(.2,.8,.3,1)'],[.42,at(0,0,0,1),E1]]}),
 tumble:()=>({f:[[0,at(rnd(-40,40),-200,rnd(-10,10),.9,'rotateX(720deg)')],[.42,at(0,0,0,1,'rotateX(0deg)'),'cubic-bezier(.25,.8,.3,1)']]}),
 skid:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(sx*-220,8,sx*-12,1)],[.22,at(sx*24,2,sx*6,1),'cubic-bezier(.1,.8,.3,1)'],[.34,at(sx*-5,0,sx*-2,1),E3],[.44,
  at(0,0,0,1),E1]]};},
 heli:()=>{const k=pickOne([-1,1]);return {f:[[0,at(rnd(-30,30),-190,0,.6,UP(1.5))],[.42,at(0,0,k*720,1),'cubic-bezier(.2,.6,.3,1)']]};}};
const PILE_IN=620;
/* (user 2026-11-12: "no code transition for the background lines") the columns change like ink: the old ones lift and
   fade one after another from the right, then the new ones rise into place with a soft stagger; only opacity and
   transform animate (Web Animations, on the compositor), the text is written once per change */
/* 2026-11-15 (user: 把左边的过渡做好点) hand-off, never a blank frame: the old title / last-played line / columns are copied into ghosts that sit on top and lift away
   (up, blurred, faded, letter by letter for the title) while the new ones rise in underneath with a 20-30ms stagger; transform + opacity only (GSAP); a new pick
   ends the running hand-off first (kills the timelines, drops the ghosts, clears the inline styles) so nothing piles up or leaves a trace */
const HO_SEL=['.tv-title','.tv-who','.tv-line','.tv-script'];
function endHandoff(lv){const h=lv.ho;lv.ho=null;if(!h)return;h.tls.forEach(t=>t.kill());h.ghosts.forEach(n=>n.remove());const g=window.gsap;if(g&&lv.root.isConnected)g.set([...lv.root.querySelectorAll('.tv-title .tv-ch,.tv-title .tv-meta,.tv-who,.tv-line,.tv-script p')],{clearProps:'transform,opacity,filter,willChange'});}
function startHandoff(root,lv){const g=window.gsap;endHandoff(lv);if(!g)return false;const h=lv.ho={ghosts:[],tls:[],rm:calm()};
 for(const sel of HO_SEL){const el=root.querySelector(sel);if(!el||!el.parentElement)continue;const c=el.cloneNode(true);c.classList.add('tv-ghost');c.removeAttribute('id');c.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));c.setAttribute('aria-hidden','true');
  Object.assign(c.style,{position:'absolute',left:el.offsetLeft+'px',top:el.offsetTop+'px',width:el.offsetWidth+'px',height:el.offsetHeight+'px',right:'auto',bottom:'auto',margin:'0',pointerEvents:'none',zIndex:'6'});el.after(c);h.ghosts.push(c);}
 const rm=h.rm,tl=g.timeline({onComplete:()=>h.ghosts.forEach(n=>n.remove())});h.tls.push(tl);
 const mv=(y)=>rm?{}:{y,filter:'blur(5px)'},T=rm?.18:.32;
 h.ghosts.forEach((c,k)=>{const sel=HO_SEL[HO_SEL.findIndex(s=>c.matches(s))];
  if(sel==='.tv-title'){const ch=c.querySelectorAll('.tv-ch');if(ch.length)tl.to(ch,{...mv(-16),opacity:0,duration:T,ease:'power2.in',stagger:rm?0:{amount:.12}},0);tl.to(c.querySelector('.tv-meta')||[],{...(rm?{}:{y:-8}),opacity:0,duration:T*.9,ease:'power2.in'},0);}
  else if(sel==='.tv-script'){const ps=c.querySelectorAll('p');tl.to(ps.length?ps:c,{...(rm?{}:{y:-14}),opacity:0,duration:T,ease:'power2.in',stagger:rm?0:.04},.12);}
  else tl.to(c,{...(rm?{}:{y:-10}),opacity:0,duration:T,ease:'power2.in'},.06);});
 return true;}
/* the new texts rise in: title letter by letter (about 0.6 s in all), then the who/line row and the columns, each about 60ms behind */
function handoffIn(root,lv,part){const g=window.gsap,h=lv.ho;if(!g||!h)return;const rm=h.rm,tl=g.timeline({defaults:{ease:'expo.out'}});h.tls.push(tl);
 if(part==='title'){const ch=root.querySelectorAll('.tv-title:not(.tv-ghost) .tv-ch'),meta=root.querySelector('.tv-title:not(.tv-ghost) .tv-meta');
  if(ch.length)tl.fromTo(ch,rm?{opacity:0}:{y:'105%',opacity:0},{...(rm?{}:{y:0}),opacity:1,duration:rm?.2:.5,stagger:rm?0:{amount:.1}},.08);if(meta)tl.fromTo(meta,rm?{opacity:0}:{y:8,opacity:0},{...(rm?{}:{y:0}),opacity:1,duration:rm?.2:.45},.16);}
 else if(part==='rows'){const row=[...root.querySelectorAll('.tv-who:not(.tv-ghost),.tv-line:not(.tv-ghost)')];if(row.length)tl.fromTo(row,rm?{opacity:0}:{y:10,opacity:0},{...(rm?{}:{y:0}),opacity:1,duration:rm?.2:.45,stagger:rm?0:.06},.14);}
 else{const ps=root.querySelectorAll('.tv-script:not(.tv-ghost) p');if(ps.length)tl.fromTo(ps,rm?{opacity:0}:{y:18,opacity:0},{...(rm?{}:{y:0}),opacity:1,duration:rm?.2:.5,stagger:rm?0:.05},.2);}}
function swapScript(script,lines,onPick,soft){if(!script)return;const esc2=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
 (script._anims||[]).forEach(x=>{try{x.cancel();}catch{}});script._anims=[];
 lines=lines.slice(0,8);const next=lines.map(t=>/^[「『（("]/.test(t)?t:'「'+t+'」'),olds=[...script.querySelectorAll('p')];
 const bind=()=>script.querySelectorAll('p').forEach(el=>el.addEventListener('pointerenter',()=>{const n=+el.dataset.n;if(!lines[n])return;script.querySelectorAll('p').forEach(x=>x.classList.toggle('on',
  x===el));onPick(lines[n]);}));
 const paint=texts=>{script.innerHTML=texts.map((t,n)=>`<p class="${n?'':'on'}" data-n="${n}"><span class="tv-stxt" lang="ja"${exAttr(t,null,esc2)}>${esc2(t)}</span></p>`).join('');
  /* 2026-11-15 (user: 句子列数不对，每句最多三列，不要空列) a sentence wraps into 1-3 columns by itself; one that needs more, or no longer fits the room, is skipped for a shorter one; no empty slots remain */
  const first=script.querySelector('p');if(first){const fs=parseFloat(getComputedStyle(first).fontSize)||16,lh=fs*1.8,room=innerWidth*.31;let used=0,kept=0;
   script.querySelectorAll('p').forEach(el=>{const w=el.offsetWidth,cols=Math.round((w-6)/lh);if(w>0&&(cols>3||used+w>room||kept>=5)){el.remove();return;}used+=w;kept++;});
   const left=script.querySelector('p');if(left)script.querySelectorAll('p').forEach(el=>el.classList.toggle('on',el===left));
   const cv=script.closest('.tv-home')?.querySelector('.tv-cover');if(cv){script.style.right='';const gap=cv.getBoundingClientRect().left-script.getBoundingClientRect().right;if(Number.isFinite(gap)&&gap!==0)script.style.right=`calc(42% + 28px - ${(gap-32).toFixed(1)}px)`;}const lab=script.parentElement?.querySelector('.tv-lines-edit');if(lab)lab.style.left=script.offsetLeft+'px';}
  script.classList.toggle('is-empty',!texts.length);bind();};
 script.classList.remove('is-fading');const token=String(Math.random());script.dataset.timer=token;
 if(olds.length&&script._cand===next.join('|'))return;script._cand=next.join('|');
 if(matchMedia('(prefers-reduced-motion:reduce)').matches||typeof Element.prototype.animate!=='function'||soft){paint(next);return;}
 const OUT=300,GAP=45,keep=x=>(script._anims.push(x),x);
 /* start after the frame that paints the new cover and ring, so the first frames of the fade are not swallowed by it */
 requestAnimationFrame(()=>requestAnimationFrame(()=>{if(script.dataset.timer!==token)return;
 const outs=olds.map((el,k)=>keep(el.animate([{opacity:1,transform:'translate3d(0,0,0)'},{opacity:0,transform:'translate3d(0,-16px,0)'}],{duration:OUT,delay:k*GAP,
  easing:'cubic-bezier(.4,0,.7,.4)',fill:'forwards'})).finished);
 Promise.all(outs.map(p=>p.catch(()=>null))).then(()=>{/* a newer swap cancels these fades: their finished promises reject with AbortError */if(script.dataset.timer!==token)return;script._anims=[];paint(next);
  script.querySelectorAll('p').forEach((el,k)=>{keep(el.animate([{opacity:0,transform:'translate3d(0,28px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:720,
   delay:k*90,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));
   const no=el.querySelector('.tv-sno');if(no)keep(no.animate([{opacity:0},{opacity:1}],{duration:420,delay:k*90+260,easing:'ease-out',fill:'backwards'}));});}).catch(()=>{
    });}));}

function busy(cover,ms){cover.dataset.busy='1';cover.classList.remove('touch');const face=cover.querySelector('.tv-face');if(face){face.style.transition='transform .25s ease-out';
 face.style.transform='';}clearTimeout(+cover.dataset.busyTimer||0);cover.dataset.busyTimer=setTimeout(()=>{delete cover.dataset.busy;},ms);}
function outLayer(cover){const home=cover.closest('.tv-home');let layer=home.querySelector(':scope>.tv-outgoing');if(!layer){layer=document.createElement('div');
 layer.className='tv-outgoing';layer.setAttribute('aria-hidden','true');home.insertBefore(layer,home.querySelector(':scope>.tv-canvas'));}const h=home.getBoundingClientRect(),
 r=cover.getBoundingClientRect(),w=cover.offsetWidth*1.06;layer.style.width=w+'px';layer.style.left=(r.left+r.width/2-h.left-w/2)+'px';layer.style.top=(r.top+r.height/2-h.top-w*2/3)+'px';
 layer.querySelectorAll('.tv-old').forEach(n=>n.remove());return layer;}
function placePile(pile,cover){const home=cover.closest('.tv-home').getBoundingClientRect(),r=cover.getBoundingClientRect(),w=cover.offsetWidth*1.06,h=w*4/3;pile.style.width=w+'px';
 pile.style.left=(r.left+r.width/2-home.left-w/2)+'px';pile.style.top=(r.top+r.height/2-home.top-h/2)+'px';}
function pileMotion(pile,kind,total,delay){const cards=[...pile.children],top=cards[cards.length-1],rest=cards.slice(0,-1),base=c=>c.style.transform;
 pile.getAnimations().forEach(x=>x.cancel());const inMs=PILE_IN,from=pickOne([['-120%','70%',-28],['-50%','130%',-10],['60%','110%',18]]);pile.animate([{opacity:0,
  translate:`${from[0]} ${from[1]}`,rotate:`${from[2]}deg`,scale:'.85',easing:'cubic-bezier(.3,.75,.3,1)'},{opacity:1,translate:'0 0',rotate:'0deg',scale:'1',offset:inMs/(inMs+total),
  easing:'linear'},{opacity:1,translate:'0 0',rotate:'0deg',scale:'1',offset:(inMs+total*.42)/(inMs+total),easing:'cubic-bezier(.4,0,.6,1)'},{opacity:0,translate:'-8% 14%',
  rotate:'-6deg',scale:'.94',offset:(inMs+total*.62)/(inMs+total),easing:'linear'},{opacity:0,translate:'-8% 14%',rotate:'-6deg',scale:'.94'}],{duration:inMs+total,
  delay:Math.max(0,delay-inMs),easing:'linear',fill:'both'});
 cards.forEach((c,n)=>c.animate([{opacity:0,translate:'0 -34px',rotate:`${(n%2?1:-1)*6}deg`},{opacity:1,translate:'0 0',rotate:'0deg'}],{duration:320,delay:Math.max(0,
  delay-inMs)+180+n*55,easing:'cubic-bezier(.2,.9,.3,1)',fill:'backwards'}));
 const hid=kind==='lift'?cards[0]:top;hid.animate([{opacity:0},{opacity:0}],{duration:total*.85,delay,fill:'backwards'});
 const wob=(c,kf,o)=>c.animate(kf,{duration:total*.5,delay,easing:E1,fill:'backwards',...o});
 if(kind==='fan')rest.forEach((c,n)=>{const k=n-(rest.length-1)/2;wob(c,[{transform:base(c)},{transform:`${base(c)} rotate(${k*9}deg) translateX(${k*6}px)`,offset:.35},
  {transform:`${base(c)} rotate(${k*9}deg) translateX(${k*6}px)`,offset:.6},{transform:base(c)}]);});
 if(kind==='cut')rest.forEach((c,n)=>{const up=n>=rest.length/2;wob(c,[{transform:base(c)},{transform:`${base(c)} translate(${up?-22:22}px,${up?-6:4}px) rotate(${up?-6:5}deg)`,
  offset:.4},{transform:`${base(c)} translate(${up?-22:22}px,${up?-6:4}px) rotate(${up?-6:5}deg)`,offset:.6},{transform:base(c)}]);});
 if(kind==='riffle')rest.forEach((c,n)=>{const sx=n%2?1:-1;wob(c,[{transform:base(c)},{transform:`${base(c)} translateX(${sx*26}px) rotate(${sx*4}deg)`,offset:.2+n*.03},
  {transform:base(c),offset:.45+n*.04},{transform:base(c)}]);});
 if(kind==='lift')cards.slice(1).forEach(c=>wob(c,[{transform:base(c)},{transform:`${base(c)} translateY(-8px)`,offset:.3},{transform:`${base(c)} translateY(-8px)`,
  offset:.55},{transform:base(c)}]));
 if(kind==='bump')rest.forEach((c,n)=>{c.animate([{transform:base(c)},{transform:`${base(c)} translateY(3px)`,offset:.3},{transform:base(c)}],{duration:260,delay:delay+total*.1+n*12,
  easing:'ease-out'});});}
const parsePose=(dx,dy,r,s,extra='')=>{const g=(re,d)=>{const m=extra.match(re);return m?parseFloat(m[1]):d;};return {x:dx,y:dy,r,s,z:g(/translateZ\((-?[\d.]+)px\)/,
 0),rx:g(/rotateX\((-?[\d.]+)deg\)/,0),sx:g(/scaleX\((-?[\d.]+)\)/,1),sy:g(/scaleY\((-?[\d.]+)\)/,1)};};
const FEELS={soft:{k:120,c:16,lead:1.15,drag:.05},fluid:{k:190,c:21,lead:1,drag:.04},snappy:{k:320,c:27,lead:.85,drag:.03},crisp:{k:700,c:52,lead:.72,drag:.012}};
function springTrack(targets,feel){const ch=['x','y','r','s','z','rx','ry','sx','sy'],pos={...targets[0].p},vel=Object.fromEntries(ch.map(k=>[k,0])),dt=1/240,out=[];
 let ti=0,t=0,settled=0;const last=targets[targets.length-1].at;
 while(t<last+3){while(ti+1<targets.length&&targets[ti+1].at<=t)ti++;const nx=targets[ti+1],cu=targets[ti],u=nx?Math.min(1,Math.max(0,(t-cu.at)/Math.max(.001,nx.at-cu.at))):1,
  sm=u*u*u*(u*(u*6-15)+10),tg=nx?Object.fromEntries(ch.map(n=>[n,cu.p[n]+(nx.p[n]-cu.p[n])*sm])):cu.p,k=targets[ti].k||feel.k,c=targets[ti].c||feel.c;let moving=false;
  for(const n of ch){const a=k*(tg[n]-pos[n])-c*vel[n];vel[n]+=a*dt;pos[n]+=vel[n]*dt;if(Math.abs(tg[n]-pos[n])>(n==='s'||n==='sx'||n==='sy'?.002:.15)||Math.abs(vel[n])>(n==='s'||n==='sx'||n==='sy'?.01:1))moving=true;
   }
  if(Math.round(t/dt)%4===0)out.push({t,p:{...pos},v:{x:vel.x,y:vel.y}});
  t+=dt;if(t>last&&!moving){if(++settled>12)break;}else settled=0;}
 return out;}
function deal(cover,background,animate,mode='draw'){const flip=cover.querySelector('.tv-flip'),face=cover.querySelector('.tv-face'),artEl=cover.querySelector('.tv-art'),
 backFace=flip.querySelector('.tv-back'),pile=cover.closest('.tv-home')?.querySelector(':scope>.tv-pile');cover.querySelectorAll('.tv-old,.tv-sheen').forEach(n=>n.remove());
 cover.closest('.tv-home')?.querySelectorAll(':scope>.tv-outgoing>.tv-old').forEach(n=>n.remove());[flip,face,artEl,backFace,...(pile?[pile,...pile.children]:[])].forEach(el=>el.getAnimations().forEach(x=>x.cancel()));
 if(!animate||matchMedia('(prefers-reduced-motion:reduce)').matches||!artEl.style.background){artEl.style.background=background;return 0;}
 if(mode==='fade'){busy(cover,620);const fresh=document.createElement('div');fresh.className='tv-old';fresh.style.background=background;face.insertBefore(fresh,
  face.querySelector('.tv-foil'));const a=fresh.animate([{clipPath:'inset(0 0 100% 0)',transform:'scale(1.06)'},{clipPath:'inset(0 0 0% 0)',
  transform:'none'}],{duration:560,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'});a.finished.then(()=>{artEl.style.background=background;fresh.remove();},
  ()=>fresh.remove());return 260;}
 const outDir=rnd(0,Math.PI*2),outDur=rnd(360,460);
 /* a field card that goes back into the hand (cover.dataset.stow, set by the draw) flies there itself; only a card that is not in the hand is thrown off */
 const stowed=cover.dataset.stow==='1';delete cover.dataset.stow;const old=document.createElement('div');old.className='tv-old';old.style.background=artEl.style.background;if(!stowed)outLayer(cover).appendChild(old);
 if(!stowed)old.animate([{transform:'none',opacity:1},{transform:`translate(${Math.cos(outDir)*18}%,${Math.sin(outDir)*14}%) rotate(${rnd(-12,12)}deg) scale(.97)`,opacity:.9,
  offset:.35},{transform:`translate(${Math.cos(outDir)*rnd(120,160)}%,${Math.sin(outDir)*rnd(90,120)}%) rotate(${rnd(-50,50)}deg) scale(${rnd(.75,.9)})`,opacity:0}],
  {duration:outDur,easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'}).finished.then(()=>old.remove(),()=>old.remove());
 artEl.style.background=background;
 const names=Object.keys(DRAWS),name=names.filter(n=>n!==cover.dataset.draw)[Math.floor(Math.random()*(names.length-1))],style=DRAWS[name](),feelName=pickOne(['soft',
  'fluid','fluid','snappy','snappy','crisp']),feel=FEELS[feelName];
 const side=Math.random()<.5?-1:1,turn=180*side,tilt=rnd(-4,4),lift=rnd(50,100),over=rnd(1.04,1.09),T=rnd(1.05,1.3)*feel.lead,gap=outDur*.25/1000;
 const targets=style.f.map(([t,s])=>{const m=s.match(/translate\((-?[\d.]+)%,(-?[\d.]+)%\)\s*(.*?)\s*rotate\((-?[\d.]+)deg\)\s*rotateY\(var\(--turn\)\)\s*scale\((-?[\d.]+)\)/);
  const p=m?parsePose(+m[1],+m[2],+m[4],+m[5],m[3]):parsePose(0,0,0,1);p.ry=turn;return {at:t*T,p};});
 if(style.pile&&style.pile!=='lift')targets.forEach(x=>{x.p.z=Math.max(x.p.z,18);});
 const slot={x:0,y:0,r:tilt,s:1,z:0,rx:0,ry:turn,sx:1,sy:1},tf=.52*T;
 const R=360*Math.round(targets[targets.length-1].p.r/360);slot.r+=R;targets.push({at:tf,p:{...slot}},{at:tf+.12,p:{...slot,z:lift,s:over,ry:0,r:R+tilt*.4},k:feel.k*.9},
  {at:tf+.42,p:{x:0,y:0,r:R,s:1,z:0,rx:0,ry:0,sx:1,sy:1}});
 const spin=targets.reduce((m,x,i)=>i?Math.max(m,Math.abs(x.p.r-targets[i-1].p.r)+Math.abs(x.p.rx-targets[i-1].p.rx)):m,0),stretch=1+Math.min(.6,spin/1000);targets.forEach(x=>{
  if(x.at<tf)x.at*=stretch;});const shift=tf*(stretch-1);targets.forEach(x=>{if(x.at>=tf)x.at+=shift;});
 const track=springTrack(targets,feel),total=track[track.length-1].t*1000;
 const frames=track.map(({t,p,v})=>{const lean=Math.max(-14,Math.min(14,v.x*feel.drag)),pitch=Math.max(-12,Math.min(12,-v.y*feel.drag*.8));return {offset:Math.min(1,
  t*1000/total),transform:`translate(${p.x.toFixed(2)}%,${p.y.toFixed(2)}%) translateZ(${p.z.toFixed(1)}px) rotateX(${(p.rx+pitch).toFixed(2)}deg) rotate(${(p.r+lean).toFixed(2)}deg) rotateY(${p.ry.toFixed(2)}deg) scale(${p.s.toFixed(4)}) scaleX(${p.sx.toFixed(3)}) scaleY(${p.sy.toFixed(3)})`};
  });
 frames[0].offset=0;frames[frames.length-1]={offset:1,transform:`translate(0%,0%) translateZ(0px) rotateX(0deg) rotate(${R}deg) rotateY(0deg) scale(1) scaleX(1) scaleY(1)`};
 const swapAt=track.find(f=>Math.abs(f.p.ry)<90)?.t*1000||total*.7,mid=Math.min(.999,swapAt/total),delay=gap*1000+(style.pile&&pile?PILE_IN:0),timing={duration:total,
  delay,easing:'linear',fill:'backwards'};
 if(pile&&style.pile){placePile(pile,cover);pileCards(pile);pileMotion(pile,style.pile,total,delay);}
 flip.animate(frames,timing);
 const dof=track.map(({t,p})=>{const near=p.s*Math.max(.5,700/Math.max(120,700-p.z)),b=Math.min(9,Math.max(0,(near-1.18)*7));return {offset:Math.min(1,t*1000/total),
  filter:`blur(${b.toFixed(2)}px)`};});dof[0].offset=0;dof[dof.length-1]={offset:1,filter:'blur(0px)'};if(dof.some(k=>k.filter!=='blur(0.00px)'&&k.filter!=='blur(0px)'))[artEl,
  backFace].forEach(el=>el.animate(dof,{...timing,fill:'backwards'}));
 face.animate([{opacity:0},{opacity:0,offset:mid},{opacity:1,offset:Math.min(1,mid+.001)},{opacity:1}],timing);
 backFace.animate([{opacity:1},{opacity:1,offset:mid},{opacity:0,offset:Math.min(1,mid+.001)},{opacity:0}],{...timing,fill:'both'}).finished.then(()=>backFace.getAnimations().forEach(x=>x.cancel()),
  ()=>{});
 const sheen=document.createElement('i');sheen.className='tv-sheen';face.appendChild(sheen);sheen.style.setProperty('--sa',rnd(95,135)+'deg');
 sheen.animate([{backgroundPosition:'120% 0',opacity:0},{opacity:1,offset:.3},{backgroundPosition:'-40% 0',opacity:0}],{duration:rnd(700,950),delay:delay+swapAt,
  easing:'ease-out',fill:'both'}).finished.then(()=>sheen.remove(),()=>sheen.remove());
 cover.dataset.draw=name;cover.dataset.feel=feelName;
 busy(cover,delay+total+120);return delay+swapAt;}

export const DRAW_NAMES=Object.keys(DRAWS);

/* 2026-11-13 judges round 2: a title like "English (日本語)" shows the first part big and the bracketed name as a line under it; the big title stays at two lines at most and no larger than ~5vw */
function splitTitle(t){const m=String(t||'').match(/^(.+?)\s*[（(]([^（）()]+)[）)]\s*$/u);return m&&m[1].trim().length>1?[m[1].trim(),m[2].trim()]:[String(t||''),''];}
/* 2026-11-13 (user: "不要左侧这么大一个作品名了") the game name is only the fallback when there is no daily headline, and it stays mid-sized */
/* 2026-11-15 (user: 最左下角只要作品的随机一句话，不要和背景的句子同步，单独随机) the bottom-left line is its own random pick from every line the game has, never tied to the background script */
const quoted=s=>/^[「『（("]/.test(s)?s:'「'+s+'」';
function titleHTML(t){const esc3=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]),ch=c=>`<span class="tv-ch">${esc3(c)}</span>`;
 return String(t).split(/[\s\u3000]+(?=[～〜~]|-\S)/u).map(seg=>`<span class="tv-seg">${(seg.match(/[A-Za-z0-9'’!?.,:;&\-]+|[\s\u3000]+|[\s\S]/gu)||[]).map(tok=>/^[A-Za-z0-9'’!?.,:;&\-]+$/.test(tok)?`<span class="tv-w">${[...tok].map(ch).join('')}</span>`:/^[\s\u3000]+$/.test(tok)?' ':ch(tok)).join('')}</span>`).join('');}
/* 2026-11-15 (user: 不同作品的标题过渡动画) old title leaves character by character (up, blur, fade), the new one rises from the mask below; the line and the last-played note follow. GSAP, transform/opacity/filter only; a new switch kills the running timeline first so nothing stacks */
const calm=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function titleOut(root,lv){const g=window.gsap;if(!g||calm())return Promise.resolve();lv.tl?.kill();const t=root.querySelector('.tv-title'),chars=t.querySelectorAll('.tv-ch'),rest=[t.querySelector('.tv-meta'),root.querySelector('.tv-who'),root.querySelector('.tv-line')].filter(Boolean);
 return new Promise(res=>{const tl=g.timeline();lv.tl=tl;if(chars.length)tl.to(chars,{y:-18,opacity:0,filter:'blur(6px)',duration:.26,ease:'power2.in',stagger:{amount:.16}},0);tl.to(rest,{y:-6,opacity:0,duration:.22,ease:'power2.in'},0);tl.call(res);});}
function titleIn(root,lv){const g=window.gsap;if(!g||calm())return;lv.tl?.kill();const t=root.querySelector('.tv-title'),chars=t.querySelectorAll('.tv-ch'),rest=[t.querySelector('.tv-meta'),root.querySelector('.tv-who'),root.querySelector('.tv-line')].filter(Boolean);
 const tl=g.timeline({onComplete:()=>g.set([...chars,...rest],{clearProps:'filter,willChange'})});lv.tl=tl;
 if(chars.length)tl.fromTo(chars,{y:'110%',opacity:0,filter:'blur(0px)'},{y:0,opacity:1,duration:.55,ease:'expo.out',stagger:{amount:.32}},0);
 tl.fromTo(rest,{y:8,opacity:0},{y:0,opacity:1,duration:.4,ease:'power2.out',stagger:.06},.18);}
function randomLine(d,background){const all=[...new Set([...(d?.sentences||[]).map(s=>String(s.text||'').trim()),...(d?.recentLines||[]).map(s=>String(s.text||'').trim()),...(Array.isArray(d?.homeAuto)?d.homeAuto:[]).map(t=>String(t||'').trim())].filter(Boolean).map(t=>t.replace(/\[[^\]]*\]/g,'').trim()).filter(t=>t.length>=6&&t.length<=56&&storyLine(t)))];
 const free=all.filter(t=>!background.slice(0,1).includes(t)),pool=free.length?free:all;return pool.length?pool[Math.floor(Math.random()*pool.length)]:'';}
/* prefer two lines (down to 44px), fall back to three lines (down to 28px); never clipped */
function fitTitle(h){const max=Math.min(76,Math.max(36,innerWidth*.04));for(const [lines,floor] of [[2,Math.max(34,innerWidth*.023)],[3,28]]){let size=max;h.style.fontSize=size+'px';const limit=()=>h.scrollHeight>size*1.18*lines+size*.3||h.scrollWidth>h.clientWidth+2;
 while(limit()&&size>floor){size-=2;h.style.fontSize=size+'px';}if(!limit())return;}}

function tweenFig(el,to,fmt){if(!el)return;const from=+el.dataset.v||0;el.dataset.v=to;cancelAnimationFrame(+el.dataset.raf||0);if(matchMedia('(prefers-reduced-motion:reduce)').matches||from===to){
 el.textContent=fmt(to);return;}const t0=performance.now(),dur=900;const tick=now=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,4);el.textContent=fmt(from+(to-from)*e);
 if(k<1)el.dataset.raf=requestAnimationFrame(tick);};el.dataset.raf=requestAnimationFrame(tick);setTimeout(()=>{if(+el.dataset.v===to)el.textContent=fmt(to);},dur+80);
 }

let glowTimer=0;
function glowTo(fn,g){if(!fn)return;const layer=document.querySelector('.grimoire-glow');if(!layer||!layer.classList.contains('ready')){fn(g);return;}clearTimeout(glowTimer);
 layer.style.transition='opacity .45s cubic-bezier(.4,0,.2,1)';layer.style.opacity='0';glowTimer=setTimeout(()=>{fn(g);layer.style.transition='opacity 1.1s cubic-bezier(.22,1,.36,1)';
 layer.style.opacity='';},460);}

const SENSITIVE_WORD=()=>{const l=document.documentElement.lang||'';return l.startsWith('ja')?'センシティブな内容':l.startsWith('en')?'Sensitive content':'敏感内容';},HOT_WORD=()=>{
 const l=document.documentElement.lang||'';return l.startsWith('ja')?'今日のトップ':l.startsWith('en')?'Top story today':'今日热点';};
function fitLeft(root){const left=root.querySelector('.tv-left'),title=root.querySelector('.tv-title');if(!left)return;left.getAnimations?.().forEach(x=>x.cancel());/* 2026-11-13 (user: "左下角不要字") the game name is hidden while the library has games; the column then reaches down to the bottom bar */
 const titleShown=!!title&&getComputedStyle(title).display!=='none',bar=root.querySelector('.tv-dialog');if(titleShown||!bar){if(!title)return;/* 2026-11-13 (user: after a draw the heat map was gone): a title not laid out yet (mid card change) measures 0 high, which hid every block; measure only a laid-out title */if(!title.getBoundingClientRect().height)return;}
 /* 2026-11-12 (user: "还有我说的封面呢") the day's top news cover is kept longest: the small blocks go first, then the cover gets compact, and only then goes *//* 2026-11-13 (user: "大封面呢"): the title box reaches far above its letters (tall glyph cells), so blocks were hidden over empty space; compare with where the title's text is actually drawn */const inkTop=!titleShown?bar.getBoundingClientRect().top:(()=>{
 let top=Infinity;const walk=document.createTreeWalker(title,NodeFilter.SHOW_TEXT),range=document.createRange();for(let n=walk.nextNode();n;n=walk.nextNode()){if(!n.nodeValue.trim())continue;
 range.selectNodeContents(n);for(const r of range.getClientRects())if(r.width>0&&r.height>0)top=Math.min(top,r.top);}return Number.isFinite(top)?top:title.getBoundingClientRect().top;
 })(),fits=()=>left.getBoundingClientRect().bottom<=inkTop-14,hot=left.querySelector('.tv-hot-news'),parts=['.tv-heatsum','.tv-daily','.tv-hot-news','.tv-heat-card'].map(s=>left.querySelector(s)).filter(Boolean);
 /* 2026-11-15 (user: 每日热点的四个封面都要完整显示，没有例外) nothing is hidden or cropped any more: when the column is taller than the room above the title it is scaled down as a whole, covers keep their ratio */
 parts.forEach(p=>p.style.display='');hot?.classList.remove('is-compact');left.style.zoom='';let z=1;for(let k=0;k<3;k++){const r=left.getBoundingClientRect(),room=inkTop-14-r.top;if(r.bottom<=inkTop-14||room<=0)break;z=Math.max(.35,z*room/r.height);left.style.zoom=String(z);}/* 2026-11-19 (user: 切换游戏时左列随标题行数跳高度): the column's size changes with the title's line count; the change is eased in (FLIP, transform only, 260 ms) instead of jumping; reduced motion jumps */{const r=left.getBoundingClientRect(),was=left.__flRect;left.__flRect={h:r.height,w:r.width};if(was&&was.h>0&&r.height>0&&Math.abs(was.h-r.height)>2&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&left.animate){left.style.transformOrigin='0 0';left.animate([{transform:'scale('+(was.w/r.width)+','+(was.h/r.height)+')'},{transform:'none'}],{duration:260,easing:'cubic-bezier(.16,1,.3,1)'});}}}

export function cardify(card){
 const face=card.querySelector('.tv-face');if(!face)return ()=>{};
 const host=card.closest('.tv-home')||card.parentElement;
 const initialTransition=face.style.transition;
 const state={rx:0,ry:0,scale:1,x:.5,y:.5,strength:0};
 let target={...state},pointer=null,pressed=false,dirty=false,frame=0,lastAt=0,stopped=false;
 // One clock owns the tilt. A CSS transform transition would restart at every pointer sample.
 face.style.transition='box-shadow .3s';
 const neutral=()=>({rx:0,ry:0,scale:1,x:.5,y:.5,strength:0});
 const paint=()=>{
  face.style.transform=state.strength<.001&&!pressed?'':
   `rotateX(${state.rx.toFixed(3)}deg) rotateY(${state.ry.toFixed(3)}deg) scale(${state.scale.toFixed(5)})`;
  face.style.setProperty('--px',`${(state.x*100).toFixed(2)}%`);
  face.style.setProperty('--py',`${(state.y*100).toFixed(2)}%`);
  face.style.setProperty('--hue',`${(state.x*360).toFixed(1)}deg`);
  card.classList.toggle('touch',state.strength>.001);
 };
 function aim(){
  dirty=false;target=neutral();
  if(!pointer||document.hidden||card.dataset.busy)return;
  const r=card.getBoundingClientRect();if(!r.width||!r.height)return;
  const dx=Math.max(r.left-pointer.x,0,pointer.x-r.right);
  const dy=Math.max(r.top-pointer.y,0,pointer.y-r.bottom);
  const distance=Math.hypot(dx,dy),margin=64;
  if(distance>=margin)return;
  const near=1-distance/margin,strength=near*near*(3-2*near);
  const x=Math.max(0,Math.min(1,(pointer.x-r.left)/r.width));
  const y=Math.max(0,Math.min(1,(pointer.y-r.top)/r.height));
  const depth=pressed?1.6:1;
  target={rx:(.5-y)*20*depth*strength,ry:(x-.5)*20*depth*strength,
   scale:1+(pressed?-.04:.03)*strength,x,y,strength};
 }
 function tick(now){
  frame=0;if(stopped)return;if(!card.isConnected){stop();return;}
  if(dirty)aim();
  // Cap the step after a stalled frame so re-entering never snaps to the target pose.
  const dt=Math.min(32,Math.max(0,now-lastAt));lastAt=now;
  const blend=1-Math.exp(-dt/100);
  let settled=true;
  for(const key of Object.keys(state)){
   state[key]+=(target[key]-state[key])*blend;
   const tolerance=key==='scale'?.0001:.001;
   if(Math.abs(target[key]-state[key])>tolerance)settled=false;
  }
  if(settled)Object.assign(state,target);
  paint();if(!settled)frame=requestUiFrame(tick);
 }
 function wake(){if(!stopped&&!frame){lastAt=performance.now();frame=requestUiFrame(tick);}}
 function move(event){
  if(event.pointerType==='touch')return;
  pointer={x:event.clientX,y:event.clientY};dirty=true;wake();
 }
 function leave(){pointer=null;pressed=false;dirty=true;wake();}
 function down(event){if(event.button!==0||event.pointerType==='touch')return;pressed=true;move(event);}
 function up(){if(!pressed)return;pressed=false;dirty=true;wake();}
 function geometry(){dirty=true;if(pointer)wake();}
 function reset(){
  if(frame)cancelUiFrame(frame);frame=0;pointer=null;pressed=false;
  target=neutral();Object.assign(state,target);paint();
 }
 const busy=new MutationObserver(()=>{if(card.dataset.busy)reset();else geometry();});
 busy.observe(card,{attributes:true,attributeFilter:['data-busy']});
 host.addEventListener('pointermove',move,{passive:true});
 host.addEventListener('pointerleave',leave);
 card.addEventListener('pointerdown',down);
 window.addEventListener('pointerup',up);
 window.addEventListener('pointercancel',up);
 window.addEventListener('blur',leave);
 window.addEventListener('resize',geometry);
 document.addEventListener('scroll',geometry,true);
 document.addEventListener('visibilitychange',reset);
 function stop(){
  if(stopped)return;stopped=true;reset();busy.disconnect();
  host.removeEventListener('pointermove',move);host.removeEventListener('pointerleave',leave);
  card.removeEventListener('pointerdown',down);
  window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);
  window.removeEventListener('blur',leave);window.removeEventListener('resize',geometry);
  document.removeEventListener('scroll',geometry,true);document.removeEventListener('visibilitychange',reset);
  face.style.transition=initialTransition;
 }
 return stop;
}

/* 2026-11-15 (user: 热力图重新设计，只展示当月) this month as a calendar (Monday first, today marked, later days faint, four tiers of reading) with the month's totals beside it */
export function monthHTML(all,locale,esc,w,fmtNum,today=new Date()){const y=today.getFullYear(),m=today.getMonth(),pre=`${y}-${String(m+1).padStart(2,'0')}`,N=new Date(y,m+1,0).getDate(),first=(new Date(y,m,1).getDay()+6)%7,td=today.getDate();
 const by=new Map(all.filter(c=>String(c.day).startsWith(pre)).map(c=>[+String(c.day).slice(8),c]));let run=0,best=0,chars=0,looks=0,active=0;const days=[];
 for(let d=1;d<=N;d++){const c=by.get(d),lv=d>td?-1:(c?.level||0);if(d<=td){run=lv>0?run+1:0;best=Math.max(best,run);}chars+=c?.characters||0;looks+=c?.lookups||0;if(lv>0)active++;
  const at=first+d-1;days.push(`<i class="${d===td?'is-today ':''}${lv<0?'later':lv?'l'+lv:''}" style="grid-column:${at%7+1};grid-row:${Math.floor(at/7)+1}" data-day="${pre}-${String(d).padStart(2,'0')}" data-min="${Math.round((c?.seconds||0)/60)}"></i>`);}
 /* every day carries its own grid cell: automatic placement after leading blanks was fragile (grimoire.css made days spill into extra columns and the month sat a day off) */
 const wd=locale==='en'?'MTWTFSS':'一二三四五六日',lk={zh:'查词',ja:'辞書引き',en:'lookups'}[locale]||'查词';
 return {active,month:m+1,html:`<div class="tv-month-cal"><div class="tv-month-wd">${[...wd].map(x=>`<span>${x}</span>`).join('')}</div><div class="tv-month-days">${days.join('')}</div></div><div class="tv-month-sum"><span><b>${fmtNum(chars)}</b><em>${esc(w.figChars||w.chars)}</em></span><span><b>${fmtNum(looks)}</b><em>${esc(lk)}</em></span><span><b>${best}<small>${esc(w.days)}</small></b><em>${esc(w.streak)}</em></span></div>`};}
export function stopHomeTV(){if(!live)return;live.tl?.kill();clearTimeout(live.timer);clearInterval(live.beat);clearInterval(live.typer);live.depth?.stop();live.hand?.stop();live.cardTilts?.forEach(stop=>stop());live=null;}

export function homeTVSignature(model){return JSON.stringify([model.games.map(g=>[g.id,g.available,g.cover?.length,g.title,g.lastPlayedAt,g.readingSeconds,g.characters,
 g.learnedWords]),model.stats,model.preferences.homeShowcase,model.preferences.username]);}

export function renderHomeTV(main,ctx){
 stopHomeTV();
 const {model,api,locale,esc,icon,number,duration,relativeTime,navigate,onLaunch,onDetail,onAdd,greeting,savePreferences}=ctx,w=copy[locale]||copy.zh;
 let shownLines=[],setting=cleanShowcase(model.preferences.homeShowcase),list=showcaseGames(model.games,setting),cur=0,token=0,shown=null;const pool=model.games.filter(g=>g.available!==false),
  randomGame=()=>{const rest=pool.filter(g=>g!==shown);return rest[Math.floor(Math.random()*rest.length)]||pool[0];};
 const date=new Date().toLocaleDateString({zh:'zh-CN',ja:'ja-JP',en:'en-US'}[locale],{month:'long',day:'numeric',weekday:'long'});
 const mins=s=>{const m=Math.floor((s||0)/60);return m>=60?`${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`:`${m}m`;};
 main.innerHTML=`<div class="tv-home" tabindex="-1"><div class="tv-pile" aria-hidden="true"></div><div class="tv-canvas">
  <div class="tv-plane" data-z="-200"><div class="tv-tl"></div></div>
  <div class="tv-plane" data-z="-80"><div class="tv-kana"></div><div class="tv-ring"></div></div>
  <div class="tv-plane" data-z="0"><div class="tv-slices"></div><div class="tv-script"></div><button type="button" class="tv-lines-edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg><span></span></button></div>
  <div class="tv-plane" data-z="60"><div class="tv-cover tv-card"><i class="tv-cshadow" aria-hidden="true"></i><div class="tv-flip"><div class="tv-face"><div class="tv-art"></div><i class="tv-foil"></i><i class="tv-glare"></i></div><div class="tv-back"><img src="${LOGO}" alt=""><i></i><i></i><i></i><i></i></div></div></div></div></div>
  <div class="tv-scan"></div><div class="tv-grain"></div><div class="tv-marks"><i></i><i></i><i></i><i></i></div>
  <div class="tv-left"><div class="tv-clock"><span>${esc(date)}</span><b>${esc(greeting)}</b></div><div class="tv-heat-card tv-card"><div class="tv-face"><button class="tv-heatlink" data-go="activity"></button><div class="tv-heat"></div><div class="tv-heat-none" hidden></div><div class="tv-heatsum"></div><button class="tv-daily" data-go="daily"><i aria-hidden="true"></i><span class="tv-daily-k">${w.daily}</span><span class="tv-daily-t"></span><small>→</small></button><div class="tv-daily-pics"></div><i class="tv-glare"></i></div></div></div>
  
  <div class="tv-figs"><button class="tv-fig" data-go="statistics"><b data-fig="time">0m</b><small>${w.figRead}</small></button><button class="tv-fig" data-go="detail"><b data-fig="chars">0</b><small>${w.figChars}</small></button><button class="tv-fig" data-go="words"><b data-fig="words">0</b><small>${w.figWords}</small></button><button class="tv-more" data-go="statistics">${w.full} →</button></div>
  <div class="tv-title"><div class="tv-h1" role="heading" aria-level="1"></div><div class="tv-meta"></div></div>
  <div class="tv-rail"></div>
  <div class="tv-dialog"><span class="tv-who"></span><span class="tv-line"></span><div class="tv-act"></div></div></div>`;
 const root=main.querySelector('.tv-home'),$=s=>root.querySelector(s);
 /* The Seed banner: a plaque on the right, above the recent-games rail */
 {root.insertAdjacentHTML('beforeend',seedBannerHTML(locale,esc));
  const b=root.querySelector('.seed-banner');b.addEventListener('click',()=>openSeedDialog({api,locale,esc}));}
 live={root,timer:0,beat:0,typer:0,depth:null};loadGsap().catch(()=>{});
 const art=(g,p)=>g.cover?`url("${String(g.cover).replace(/"/g,'%22')}") center/cover`:`linear-gradient(160deg,${p[0]},${p[2]} 70%)`;
 root.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{const to=b.dataset.go;if(to==='detail'){if(shown)onDetail(shown.id);return;}if(to==='words')navigate('learning',
  'words');else if(to==='activity')navigate('statistics');else navigate(to);}));
 if(!list.length){$('.tv-h1').textContent=w.empty;$('.tv-act').innerHTML=model.games.length?'':`<button class="tv-btn primary" data-act="add">${icon('plus')}${w.add}</button>`;
  $('[data-act="add"]')?.addEventListener('click',onAdd);root.classList.add('empty');}
 {const b=$('.tv-lines-edit'),label=LINES_EDIT[locale]||LINES_EDIT.zh;b.querySelector('span').textContent=label;b.title=label;b.setAttribute('aria-label',label);
  b.addEventListener('click',()=>{const g=shown;if(!g)return;openLinesPicker({api,locale,esc,game:g,shown:shownLines,relativeTime,onSave:async chosen=>{const d=await detail(api,
   g.id,locale);d.homeLines=chosen;if(shown!==g||!live||live.root!==root)return;const pick=homeLinesFor(d);shownLines=pick.lines.slice(0,8);b.classList.toggle('custom',
   pick.custom);swapScript($('.tv-script'),shownLines,type);type(pick.lines[0]||'');}});});}
 /* 2026-11-13 (user: no 「继续游玩」 button on home cards, 禁止) covers stay artwork and title only; launching lives on the detail page */
 $('[data-act="detail"]')?.addEventListener('click',()=>shown&&onDetail(shown.id));
 /* 2026-11-13 (user: "左下角显示小字作品名 … 把之前删掉的那个动效…拿回来 放左下角最下面 点缀一下") the bottom bar is back as a quiet accent: the game name in
    small type rises in letter by letter, then one of its lines types itself out */
 const type=(s,instant)=>{clearInterval(live.typer);let n=0;const line=$('.tv-line');if(!line)return;setExample(line,'');line.textContent='';line.classList.toggle('typing',!!s);if(!s)return;
  if(instant||matchMedia('(prefers-reduced-motion:reduce)').matches){line.textContent=quoted(s);line.classList.remove('typing');setExample(line,s);return;}
  live.typer=setInterval(()=>{n++;line.textContent=n>=s.length?quoted(s):(/^[「『（("]/.test(s)?'':'「')+s.slice(0,n);if(n>=s.length){clearInterval(live.typer);line.classList.remove('typing');setExample(line,s);}},55);};
 const nameIn=g=>{const who=$('.tv-who');if(!who)return;who.textContent=g.lastPlayedAt?`${w.last} · ${relativeTime(g.lastPlayedAt)}`:'';who.title=g.title;};
 const max=Math.max(1,...model.games.map(g=>g.characters||0));
 async function paint(i,flash=true,mode='draw'){const soft=flash&&mode==='fade';
  const g=typeof i==='object'?i:list[i];if(!root.isConnected){if(live?.root===root)stopHomeTV();return;}if(!g||!live||live.root!==root)return;shown=g;cur=list.indexOf(g);
   const mine=++token;
  const started=performance.now(),reveal=deal($('.tv-cover'),art(g,['#3b2a26','#3b2a26','#1a1110']),flash,mode);
  const [p,d]=await Promise.all([palette(g),detail(api,g.id,locale)]);if(mine!==token||!live||live.root!==root)return;
  const wait=flash&&!soft?Math.max(0,reveal-(performance.now()-started)):0;const ho=soft&&startHandoff(root,live);if(wait){await new Promise(r=>setTimeout(r,wait));if(mine!==token||!live||live.root!==root)return;
   }
  glowTo(ctx.onGame,g);root.style.setProperty('--tv-a',p[0]);root.style.setProperty('--tv-b',p[1]);root.style.setProperty('--tv-c',p[2]);
  const k=(g.title.length*37+pool.indexOf(g)*13)%60,picked=homeLinesFor(d),sentences=picked.lines,words=(d.words||[]).filter(x=>x.spelling).slice(0,10),sessions=d.sessions||[];
  $('.tv-kana').textContent=[...g.title].find(c=>/[一-鿿぀-ヿ]/.test(c))||([...g.title].find(c=>/[A-Za-z0-9]/.test(c))||g.title.slice(0,1)).toUpperCase();
  if(!g.cover)$('.tv-art').style.background=art(g,p);/* 2026-11-13 user: a coverless draw showed a bare gradient — write the cleaned title on it */{const nm=String(g.title||'').replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g,
   ' ').replace(/\s+/g,' ').trim()||g.title||'';$('.tv-art').innerHTML=g.cover?'':`<span class="tv-art-name" lang="ja">${esc(nm)}</span>`;}$('.tv-cover').title=g.lastPlayedAt?`${g.title} · ${w.last} · ${relativeTime(g.lastPlayedAt)}`:g.title;
  const pct=Math.max(.02,Math.min(1,(g.characters||0)/max)),ring=$('.tv-ring');ring.style.left=(44+k%14)+'%';const C=2*Math.PI*44,N=60;
  ring.innerHTML=`<svg viewBox="0 0 100 100"><defs><linearGradient id="tvgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6e4"/><stop offset=".45" stop-color="var(--g-gold)"/><stop offset="1" stop-color="var(--tv-a)"/></linearGradient><filter id="tvglow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>${Array.from({length:N},(_,t)=>{const a=t/N*2*Math.PI-Math.PI/2,big=t%5===0,r1=big?38.6:39.4,r2=40.4;return `<line class="etch${big?' big':''}${t<Math.round(pct*N)?' on':''}" style="--d:${t*18}ms" x1="${(50+r1*Math.cos(a)).toFixed(2)}" y1="${(50+r1*Math.sin(a)).toFixed(2)}" x2="${(50+r2*Math.cos(a)).toFixed(2)}" y2="${(50+r2*Math.sin(a)).toFixed(2)}"/>`;}).join('')}<circle class="track" cx="50" cy="50" r="44"/><g transform="rotate(-90 50 50)"><circle class="glow" cx="50" cy="50" r="44" stroke-dasharray="${C}" stroke-dashoffset="${C}" filter="url(#tvglow)"/><circle class="prog" cx="50" cy="50" r="44" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></g><circle class="head" cx="50" cy="8.4" r=".9" style="transform-origin:50px 50px;transform:rotate(0deg)"/></svg>`;
   requestAnimationFrame(()=>requestAnimationFrame(()=>{const off=C*(1-pct);ring.querySelectorAll('.prog,.glow').forEach(c=>c.style.strokeDashoffset=off);const h=ring.querySelector('.head');
   if(h)h.style.transform=`rotate(${pct*360}deg)`;}));
  swapScript($('.tv-script'),sentences.slice(0,8),type,soft);if(ho)handoffIn(root,live,'script');shownLines=sentences.slice(0,8);$('.tv-lines-edit').classList.toggle('custom',picked.custom);
  const now=Date.now(),span=40*864e5,big=Math.max(1,...sessions.map(s=>s.active_seconds||0))*.6;$('.tv-tl').innerHTML=sessions.filter(s=>now-s.started_at*1000<span).map(s=>{
   const y=10+((now-s.started_at*1000)/span)*70,long=(s.active_seconds||0)>=big;return `<b class="${long?'big':''}" style="top:${y}%"></b>`+(long?`<span style="top:${y}%">${new Date(s.started_at*1000).toLocaleDateString(undefined,{month:'numeric',day:'numeric'})} · ${Math.round((s.active_seconds||0)/60)}${w.min}</span>`:'');
   }).join('');
  $('.tv-slices').innerHTML=Array.from({length:5},(_,j)=>`<i style="background:${art(g,p)};background-size:500% 100%;background-position:${j*25}% 0;transform:translateZ(${j%2?40:-20}px) translateY(${(j-2)*12}px)"></i>`).join('');

  const no=String(Math.max(1,pool.indexOf(g)+1)).padStart(2,'0');
  const t=$('.tv-title');if(!soft)t.classList.remove('in');const outP=flash&&!ho?titleOut(root,live):Promise.resolve();setTimeout(async()=>{await outP;if(mine!==token||!live||live.root!==root)return;const [mainTitle,subTitle]=splitTitle(g.title);$('.tv-h1').innerHTML=titleHTML(mainTitle);
   $('.tv-h1').title=g.title;$('.tv-meta').innerHTML=(subTitle?`<span class="tv-sub" lang="ja">${esc(subTitle)}</span>`:''); void t.offsetWidth;fitTitle($('.tv-h1'));
   fitLeft(root);nameIn(g);type(randomLine(d,sentences),!!ho);t.classList.add('in');if(ho){if(live.ho===ho){handoffIn(root,live,'title');handoffIn(root,live,'rows');}}else if(flash)titleIn(root,live);/* measure again once the new title has settled, so a block hidden mid-change comes back */setTimeout(()=>{
   if(live&&live.root===root)fitLeft(root);},900);},flash&&!soft?Math.max(0,reveal-(performance.now()-started)):0);
  tweenFig($('[data-fig="time"]'),g.readingSeconds||0,v=>mins(v));tweenFig($('[data-fig="chars"]'),g.characters||0,v=>number(Math.round(v)));tweenFig($('[data-fig="words"]'),
   g.learnedWords||0,v=>number(Math.round(v)));
  
  rail();
 }
 /* 2026-11-14 (user: "右边下面不是卡牌，是正常选的那种") the games are picked from the cover strip again (thumbnails, the current one wider with its timer bar); the card hand is gone */
 /* 2026-11-15 (user: 当前卡要在牌的正中间，两边都有牌) the strip is the library three times in a row and the current card is the one in the middle copy, so cards stand on both sides of it whichever game is current; the track element stays, so the strip slides from where it was */
 function rail(){const r=$('.tv-rail');let track=r.firstElementChild;if(!track){track=document.createElement('div');track.className='tv-rail-in';r.append(track);}
  /* 2026-11-15 (user: 我不是要固定第四张 别让他动 … 最多10张) the strip never moves: the 10 most recent games, one copy, no sliding; picking only highlights the card in place while the cover, title, lines and figures above dissolve */
  const shownList=list.slice(0,10),key=shownList.map(g=>g.id).join('|')+'|'+setting.pinned.join(',');
  if(track.dataset.key!==key){track.dataset.key=key;const chip=(g,i)=>`<button class="tv-chip" data-i="${i}" title="${esc(g.title)}" aria-label="${esc(g.title)}" style="--dur:${DUR}ms">${g.cover?`<img src="${esc(g.cover)}" alt="">`:''}${setting.pinned.includes(g.id)?'<span class="pin"></span>':''}<span class="bar"></span></button>`;
   track.innerHTML=shownList.map(chip).join('');
   track.querySelectorAll('.tv-chip').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.i;if(list[i]&&list[i]!==shown)paint(i,true,'fade');}));}
  track.querySelectorAll('.tv-chip').forEach((b,i)=>b.classList.toggle('on',list[i]===shown));}
 function commit(){model.preferences.homeShowcase=setting;savePreferences({homeShowcase:setting});const id=shown?.id;list=showcaseGames(model.games,setting);
  paint(Math.max(0,list.findIndex(g=>g.id===id)),false);}
 /* 2026-11-13 (user: "不要全部作品 … 把＋卡移到最右边 不要是卡牌了 鼠标放上去再出来") the hand editor is a tab docked on the right edge that slides out
    on hover and tucks back; it opens a window where the library's games are ticked into or out of the hand (home-picker.js) */
 if(model.games.some(g=>g.available!==false))createDock(root,{locale,onOpen:()=>openHandPicker(root,{games:model.games,hand:list.map(g=>g.id),setting,locale,esc,
  onSave:next=>{setting=next;commit();}})});
 /* 2026-11-13 (user: "每次回到首页都重新加载、卡一下") the daily block paints at once from the cached copy without replaying its entrance, then refreshes
    quietly and repaints only when the news really changed; flat one-colour pictures are never shown (user: "缩略图不要展示纯色图") */
  let dailySig='';const showDaily=(v,instant)=>{if(!live||live.root!==root)return;const sig=dailySignature(v);if(sig===dailySig)return;dailySig=sig;if(instant)root.classList.add('tv-instant');const n=(v?.news?.items||[]).find(x=>!x.flat)||v?.news?.items?.[0],h=v?.words?.words?.[0],t=$('.tv-daily-t'),dailyCat=(()=>{try{return localStorage.getItem('megulit-daily-cat')==='acg'?'acg':'gal';}catch{return 'gal';}})(),{top,small:pics}=pickHeadline(v?.news?.items,dailyCat),box=$('.tv-daily-pics');if(box){box.innerHTML=pics.map(x=>`<button type="button" class="tv-daily-pic${x.sensitive?' is-sensitive':''}" data-link="${esc(x.link)}" title="${esc(x.title)}" style="background-image:url(&quot;${x.image}&quot;)">${x.sensitive?`<span class="tv-sensitive">${esc(SENSITIVE_WORD())}</span>`:''}</button>`).join('');
  box.querySelectorAll('[data-link]').forEach(b=>b.addEventListener('click',()=>{try{sessionStorage.setItem('megulit-daily-focus',b.dataset.link);}catch{}navigate('daily');
  }));}const lead=top||n;if(lead){t.textContent=lead.title;t.title=lead.title+(lead.source?' · '+lead.source:'');}else if(h){t.textContent=h.term+(h.gloss?' · '+h.gloss:'');}/* 2026-11-13 (user: "左侧热力图卡片下面有第四张尺寸更大的第一头条", "左下角不要字") under the activity card the day's top story is a fourth,
     larger picture, picture only; its title (in the UI language) labels it for the tooltip and screen readers. An adult one is blurred with a note */
  {const left=$('.tv-left'),card=left?.querySelector('.tv-heat-card');let big=left?.querySelector('.tv-hot-news');if(!top||!card){big?.remove();}else{
   if(!big){big=document.createElement('button');big.type='button';}if(box&&big.nextElementSibling!==box)box.before(big);/* 2026-11-15 (user: 大封面要和小封面连起来) the big cover sits in the same container as the three small ones, same width, same gaps */big.className='tv-hot-news'+(top.sensitive?' is-sensitive':'');
   big.innerHTML=`<span class="tv-hot-img" style="background-image:url(&quot;${top.image}&quot;)"></span>${top.sensitive?`<span class="tv-sensitive">${esc(SENSITIVE_WORD())}</span>`:''}`;
   big.onclick=()=>{try{sessionStorage.setItem('megulit-daily-focus',top.link);}catch{}navigate('daily');};
   const label=r=>{const text=headlineLabel(r,top.title);big.title=text+(top.source?'\n'+top.source:'');big.setAttribute('aria-label',HOT_WORD()+' · '+text.split('\n')[0]);};
   const hit=cachedHeadline(top.title,locale);label(hit||{text:top.title,state:'original'});if(!hit)translateHeadline(api,top.title,locale).then(r=>{if(big.isConnected&&live?.root===root)label(r);});}
   fitLeft(root);}
  if(instant)requestAnimationFrame(()=>requestAnimationFrame(()=>root.classList.remove('tv-instant')));};
 {const c=cachedDaily();if(c)showDaily(c,true);if(!c||!dailyIsFresh())api('daily_view',{}).then(v=>markFlat(v)).then(v=>{if(v)showDaily(rememberDaily(v),false);}).catch(()=>{});}

 const showActivity=records=>{if(!live||live.root!==root)return;const all=activityCells(Array.isArray(records)?records:[]);let from=Math.max(0,
  all.length-20*7);while(from>0&&all[from].weekday!==0)from--;const cells=all.slice(from),sum=activitySummary(cells,all),active=sum.active,card=$('.tv-heat-card'),none=$('.tv-heat-none');
  card?.classList.toggle('is-empty',sum.empty);if(none){none.hidden=!sum.empty;none.innerHTML=sum.empty?emptyActivityHTML(locale,esc):'';}$('.tv-heat').innerHTML=cells.map((c,
  i)=>`<i style="grid-row:${c.weekday+1};grid-column:${Math.floor(i/7)+1}" class="${i===cells.length-1?'today':c.level?'l'+Math.min(3,c.level):''}" data-day="${esc(c.day)}" data-min="${Math.round((c.seconds||0)/60)}"></i>`).join('');
  {const mo=monthHTML(all,locale,esc,w,v=>number(Math.round(v)));let box=$('.tv-month');if(!box){box=document.createElement('div');box.className='tv-month';$('.tv-heat').before(box);}box.innerHTML=mo.html;card?.classList.add('heat-a');
   $('.tv-heatlink').textContent=sum.empty?`${w.activity} →`:`${w.activity} · ${mo.month}${locale==='en'?'':'月'} · ${mo.active} ${w.days} →`;}const best=sum.best,secs=sum.secs;$('.tv-heatsum').innerHTML=`<span><b>${active}</b>${w.days}</span><span><b>${esc(duration(secs))}</b>${w.total}</span><span><b>${best}</b>${w.streak}</span>`;
  fitLeft(root);};
 {let actSig=JSON.stringify(cachedActivity()||null);if(cachedActivity())showActivity(cachedActivity());api('learning_activity',{range:'year'}).then(r=>{rememberActivity(r);const n=JSON.stringify(r||null);if(n!==actSig){actSig=n;showActivity(r);}}).catch(()=>{});}
 const canvas=$('.tv-canvas'),planes=[...root.querySelectorAll('.tv-plane')],reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
 /* 2026-11-13 (user) every layer has its own depth: the far headline picture drifts against the pointer, near ones (cards, figures, rail, bottom bar) lead it */
 {const L=(sel,z)=>{const el=$(sel);return el?{el,z}:null;};live.depth=createDepth(root,{canvas,planes,layers:[L('.tv-left',7),L('.tv-figs',8),
  L('.tv-rail',24),L('.tv-dialog',5),L('.tv-title',9),L('.tv-marks',3),L('.tv-cshadow',-22)].filter(Boolean)});}
 const onResize=()=>{if(live&&live.root===root){fitLeft(root);}else removeEventListener('resize',onResize);};addEventListener('resize',onResize);
 live.cardTilts=[...root.querySelectorAll('.tv-cover,.tv-heat-card')].map(cardify);
 const coverEl=$('.tv-cover');let clickTimer=0,pressAt=0,pressXY=[0,0];coverEl.setAttribute('aria-label',w.coverHint);const pop=document.createElement('div');pop.className='tv-pop';
  pop.innerHTML=`<p><i class="m1"></i><b>${w.tipClick}</b><span>${w.tipDetail}</span></p><p><i class="m2"></i><b>${w.tipDbl}</b><span>${w.tipDraw}</span></p>`;root.appendChild(pop);
  let popT=0;const hidePop=()=>{clearTimeout(popT);pop.classList.remove('on');};coverEl.addEventListener('pointermove',e=>{const r=root.getBoundingClientRect();
  pop.style.left=(e.clientX-r.left+18)+'px';pop.style.top=(e.clientY-r.top+20)+'px';if(!pop.classList.contains('on')){clearTimeout(popT);popT=setTimeout(()=>pop.classList.add('on'),
  520);}});coverEl.addEventListener('pointerleave',hidePop);coverEl.addEventListener('pointerdown',hidePop);coverEl.addEventListener('pointerdown',e=>{pressAt=performance.now();
  pressXY=[e.clientX,e.clientY];});coverEl.addEventListener('click',e=>{/* (user 2026-11-12) a long press or a drag only plays with the card; letting go never opens the detail */if(e.detail&&(performance.now()-pressAt>350||Math.hypot(e.clientX-pressXY[0],
  e.clientY-pressXY[1])>6))return;clearTimeout(clickTimer);clickTimer=setTimeout(()=>shown&&onDetail(shown.id),260);});coverEl.addEventListener('dblclick',e=>{e.preventDefault();
  clearTimeout(clickTimer);if(pool.length>1)draw(randomGame());});
 function draw(g){if(!g||!live||live.root!==root)return;paint(g);}
 if(list.length)paint(0,false);
 return stopHomeTV;
}

/* E445 heat map tooltip: a styled card instead of the browser's title box (date, weekday, minutes read) */
(()=>{if(typeof document==='undefined')return;let tip=null;const WD={zh:['周日','周一','周二','周三','周四','周五','周六'],ja:['日','月','火','水','木','金','土'],en:['Sun','Mon','Tue',
 'Wed','Thu','Fri','Sat']};
 const lang=()=>{const l=document.documentElement.lang||'zh';return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
 const hide=()=>{if(tip)tip.classList.remove('on');};
 document.addEventListener('mouseover',e=>{const cell=e.target.closest?.('i[data-day]');if(!cell||!cell.closest('.tv-heat-card')){hide();return;}
  if(!tip){tip=document.createElement('div');tip.className='tv-heat-tip';document.body.append(tip);}
  const d=new Date(cell.dataset.day+'T00:00:00'),l=lang(),min=Number(cell.dataset.min)||0;
  const date=l==='en'?d.toLocaleDateString('en',{month:'short',day:'numeric'}):`${d.getMonth()+1}月${d.getDate()}日`;
  const read=min?(l==='en'?`${min} min read`:l==='ja'?`${min} 分読んだ`:`读了 ${min} 分钟`):(l==='en'?'No reading':l==='ja'?'読書なし':'没有阅读');
  tip.innerHTML=`<b></b><span></span><em></em>`;tip.querySelector('b').textContent=date;tip.querySelector('span').textContent=WD[l][d.getDay()];tip.querySelector('em').textContent=read;
   tip.classList.toggle('zero',!min);
  const r=cell.getBoundingClientRect();tip.style.left=Math.round(r.left+r.width/2)+'px';tip.style.top=Math.round(r.top-10)+'px';tip.classList.add('on');});
 document.addEventListener('scroll',hide,true);})();
