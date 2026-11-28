// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火碑: everyone who shared a calibration (The Seed) is carved on one black stone in a dim marble hall.
   A real three.js scene (web/vendor/three, r168, offline): an old stone church (web/torch-hall.js, textures in web/torch-textures.js)
   lit by the PC's clock, torches from dusk, a polished marble floor that mirrors it, and a black basalt stele on a wide stair. Names are drawn into the stele's textures one page at a time (canvas, carved look), so a
   monument with hundreds of thousands of names only ever holds a few hundred in memory.

   Data: services/torch-monument.cjs through the bridge (torch_page / torch_months / torch_find / torch_me).
   Life cycle: the hall stays prepared between route visits, with drawing and input suspended while detached.
   Locale changes, game launch, WebView shutdown and context loss dispose its GPU resources.
   Baked ahead (web/torch-bake.js): the hall's textures and an ambient-occlusion volume; sun shadows are redrawn only when the sun moves.
   Quality: 'high' (mirror floor, MSAA, clear coats, bloom, grading) or 'low' (none of those, lower resolution, smaller textures; baked AO and shadows on both); auto picks low on weak
   machines and drops to low when frames run slow. */
import * as THREE from './vendor/three/three.module.min.js';
import {Reflector} from './vendor/three/addons/objects/Reflector.js';
import {EffectComposer} from './vendor/three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from './vendor/three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from './vendor/three/addons/postprocessing/ShaderPass.js';
import {SMAAPass} from './vendor/three/addons/postprocessing/SMAAPass.js';
import {rng,canvas2d,glowSprite} from './torch-textures.js';
import {buildHall,buildStele,HALL} from './torch-hall.js';
import {loadBaked,withBaked,bakedAO,applyAO,bakeProgress} from './torch-bake.js';
import {VolumetricPass} from './torch-volumetric.js';
import {loadGsap} from './gsap-loader.js';
import {createTorchCovers} from './torch-covers.js';
import {buildCourtyard} from './torch-courtyard.js';
import {torchGroundHeight} from './torch-ground.js';
import {createTorchWalk,keepTorchCameraAboveFloor} from './torch-controls.js';

/* Legacy number queries still jump to the original internal ID. */
const cnParse=q=>{const D="零壹贰叁肆伍陆柒捌玖",U={"拾":10,"佰":100,"仟":1000},B={"万":1e4,"亿":1e8};if(!/^[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]+$/.test(q))return null;let total=0,sec=0,d=0;for(const c of q){const v=D.indexOf(c);if(v>=0){d=v;continue;}if(U[c]){sec+=(d||1)*U[c];d=0;continue;}if(B[c]){total=(total+sec+d)*B[c];sec=0;d=0;}}return total+sec+d;};
const COPY={
 zh:{title:'传火碑',sub:'这里记录玩家为各部作品分享的校准',count:n=>'已刻名 '+n+' 处',monthCount:(m,n)=>m+' · '+n+' 处',range:(a,b)=>'第 '+a+'–'+b+' 位',all:'全部',
  anon:'匿名',empty:'还没有人刻下名字',find:'找名字',findGo:'查找',me:'我的名字',meNone:'还没有查到这个账号的刻名',quality:{high:'画质 标准',low:'画质 省电'},
  prev:'往前',next:'往后',none:'没找到这个名字',offline:'暂时连不上服务器，过一会儿再打开看看',notDeployed:'服务器尚未开放这个名单功能',loading:'正在读取…',preparing:'正在准备殿堂…',simple:'用简化视图',more:'只显示前 50 个',
  ym:m=>m.replace(/^(\d{4})-(\d{2})$/,(x,y,mo)=>y+' 年 '+Number(mo)+' 月')},
 en:{title:'Monument',sub:'Calibrations shared by contributors for each game',count:n=>n+' names',monthCount:(m,n)=>m+' · '+n,range:(a,b)=>'#'+a+'–'+b,all:'All',
  anon:'Anonymous',empty:'No names carved yet',find:'Find a name',findGo:'Find',me:'My name',meNone:'No inscriptions found for this account',quality:{high:'Quality: full',low:'Quality: light'},
  prev:'Back',next:'On',none:'No such name',offline:'Cannot reach the server right now. Try again later.',notDeployed:'This list feature is not available on the server yet.',loading:'Loading…',preparing:'Preparing the hall…',simple:'Use the simple view',more:'First 50 only',
  ym:m=>m},
 ja:{title:'継火の碑',sub:'作品ごとにキャリブレーションを共有した記録です',count:n=>n+' 件',monthCount:(m,n)=>m+' · '+n+' 件',range:(a,b)=>a+'–'+b+' 番目',all:'すべて',
  anon:'匿名',empty:'まだ誰の名前も刻まれていません',find:'名前を探す',findGo:'探す',me:'自分の名前',meNone:'このアカウントの刻名は見つかりませんでした',quality:{high:'画質 標準',low:'画質 軽量'},
  prev:'前へ',next:'次へ',none:'見つかりませんでした',offline:'サーバーに接続できません。しばらくしてからもう一度開いてください',notDeployed:'名簿機能はサーバーでまだ公開されていません',loading:'読み込み中…',preparing:'聖堂を準備しています…',simple:'簡易表示にする',more:'最初の 50 件のみ',
  ym:m=>m.replace(/^(\d{4})-(\d{2})$/,(x,y,mo)=>y+' 年 '+Number(mo)+' 月')}};
const QUALITY_KEY='megulit-torch-quality';
const FONT='"Torch Serif","Noto Serif SC","Source Han Serif SC","Noto Serif JP","Songti SC","SimSun","Yu Mincho",serif';
const PAGE=300,KEEP=1200;
/* stele face: a 4096×1536 canvas in "logical" units (drawn at half size on the low tier) */
const FW=4096,FH=984,BAND_Y0=14,BAND_Y1=100,RULE_Y=112,AREA_X0=90,AREA_X1=4006,AREA_Y0=146,AREA_Y1=954,COL_W=66;
const NAME_PX=40,NAME_ADV=42,SIDE_PX=15,SIDE_ADV=16,DATE_PX=14,GAP=30;

let current=null;
export function closeTorchMonument(){current?.close();}
export function suspendTorchMonument(){current?.suspend();}
/* 2026-11-28 the route is left (another top-bar page): a hall still loading is given up at once and its WebGL context released;
   a ready one is kept for the next visit */
export function leaveTorchMonument(){current?.leave();}
/* the simple list was needed in this session (the bake could not be read, or the hall took too long and the simple view was
   picked): later visits go straight to it until MeguLit restarts */
let preferSimple=false;
const SIMPLE_AFTER=10000;
/* hand the main thread back between slices of the build, so clicks (the top bar) are handled while the hall is put together */
const yieldMain=()=>new Promise(resolve=>setTimeout(resolve,0));
const CANCELLED=Symbol('torch-cancelled');
export function hasTorchMonument(locale){return current?.locale===locale;}
export function invalidateTorchMonument(locale){if(current?.locale!==locale)closeTorchMonument();}

export async function openTorchMonument({mount,onContextLost,locale='zh',...options}){
 invalidateTorchMonument(locale);
 if(!current)current=createMonument({locale,...options});
 const hall=current;
 hall.resume(mount,onContextLost);
 return hall.prepared;
}

function createMonument({api,locale,esc=s=>String(s??''),toast=()=>{}}){
 const opened=performance.now();
 const timing=(name,start)=>performance.measure('torch:'+name,{start,end:performance.now()});
 const t=COPY[locale]||COPY.zh;
 const controls=({zh:'WASD 水平行走 · 左拖平移 · 滚轮前后移动 · 右拖自由转向 · 中拖微调 · 双击左键复位',ja:'WASDで水平移動 · 左ドラッグで平行移動 · ホイールで前後移動 · 右ドラッグで自由回転 · 中ドラッグで視点微調整 · 左ダブルクリックでリセット',en:'WASD to walk · Left-drag to pan · Scroll forward/back · Right-drag to look · Middle-drag to adjust view · Double left-click to reset'})[locale]||'';
 const host=document.createElement('div');host.className='torch-monument';host.setAttribute('role','region');host.setAttribute('aria-label',t.title);
 host.innerHTML=`<canvas class="tm-canvas"></canvas><div class="tm-veil" aria-hidden="true"></div>
  <header class="tm-head"><h2 class="tm-title">${esc(t.title)}</h2><p class="tm-sub">${esc(t.sub)}</p></header>
  <p class="tm-count" aria-live="polite"></p>
  <div class="tm-tip" role="tooltip" hidden><b class="tm-tip-name"></b><span class="tm-tip-meta"></span></div>
  <p class="tm-status" role="status" hidden></p>
  <button type="button" class="tm-btn tm-text tm-simple-go" hidden>${esc(t.simple)}</button>
  <ol class="tm-list" hidden></ol>
  <p class="tm-help">${controls}</p>
  <footer class="tm-bar">
   <div class="tm-pager"><button type="button" class="tm-btn tm-next" aria-label="${esc(t.next)}" title="${esc(t.next)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5"/></svg></button><span class="tm-range"></span><button type="button" class="tm-btn tm-prev" aria-label="${esc(t.prev)}" title="${esc(t.prev)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5"/></svg></button></div>
   <form class="tm-find" hidden><input type="search" maxlength="30" autocomplete="off" spellcheck="false" placeholder="${esc(t.find)}" aria-label="${esc(t.find)}"><button type="submit" class="tm-btn tm-text">${esc(t.findGo)}</button><ul class="tm-results" hidden></ul></form>
   <button type="button" class="tm-btn tm-text tm-me" hidden>${esc(t.me)}</button>
   <span class="tm-sep" aria-hidden="true"></span>
   <button type="button" class="tm-btn tm-text tm-quality" aria-pressed="false" disabled></button>
  </footer>`;
 const $=s=>host.querySelector(s);
 const state={month:'',months:[],monthsOn:false,findOn:false,mine:[],mineAt:0,items:[],off:0,next:null,atStart:true,total:0,loading:false,pageError:'',focusNo:null,fit:0,layout:null,
  bandWindow:0,hover:null,hoverMonth:null};
 let disposed=false,mounted=false,scene=null,sceneReady=false,gsap=null,ro=null,simple=false,progress=0,slowTimer=0,assetTick=0;
 let visit=0,wakePreparation,onContextLost,firstFrame=false,faceDirty=false;
 const ctl={locale,close,suspend,resume,leave,prepared:null};
 const isVisit=id=>mounted&&visit===id;
 const canvas=$('.tm-canvas'),bar=$('.tm-bar'),veil=$('.tm-veil');
 canvas.inert=bar.inert=true;
 $('.tm-canvas').tabIndex=0;$('.tm-canvas').setAttribute('aria-label',`${t.title} · ${controls}`);
 const quality=()=>{let q='auto';try{q=localStorage.getItem(QUALITY_KEY)||'auto';}catch{}return q==='high'||q==='low'?q:'auto';};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

 /* ---------- data ---------- */
 const call=async(a,p)=>{try{return await api(a,p);}catch{return {ok:false};}};
 let pageRequest=0,initialPagePending=true;
 async function loadAt({month=state.month,cursor=''}={},valid=()=>!disposed){
  const request=++pageRequest;state.loading=true;updateStatus();
  const r=await call('torch_page',{month,cursor,limit:PAGE});if(!valid()||request!==pageRequest)return false;
  state.loading=false;
  if(!r||!r.ok){state.pageError=r?.error==='NOT_DEPLOYED'?t.notDeployed:t.offline;state.items=[];state.next=null;state.total=0;updateStatus();redraw();return false;}
  state.pageError='';updateStatus();state.month=r.month||month||'';state.items=r.items||[];state.next=r.next;state.total=r.total|0;state.off=0;
  state.atStart=!cursor||!state.items.length;return true;}
 async function ahead(valid){if(!valid()||state.loading||!state.next||state.off+state.fit+60<state.items.length)return;
  const request=++pageRequest;state.loading=true;
  const r=await call('torch_page',{month:state.month,cursor:state.next,limit:PAGE});if(!valid()||request!==pageRequest)return;
  state.loading=false;if(!r?.ok)return;
  const last=state.items.length?state.items[state.items.length-1].torchNo:-1;state.items.push(...(r.items||[]).filter(i=>i.torchNo>last));state.next=r.next;
  if(state.items.length>KEEP&&state.off>PAGE){state.items.splice(0,PAGE);state.off-=PAGE;state.atStart=false;}}
 async function behind(valid){if(state.loading||state.atStart||!state.items.length)return 0;const first=state.items[0].torchNo;if(first<=0){state.atStart=true;return 0;}
  const request=++pageRequest;state.loading=true;
  const r=await call('torch_page',{month:state.month,before:String(first),limit:PAGE});
  if(!valid()||request!==pageRequest)return 0;
  state.loading=false;if(!r?.ok)return 0;
  const add=(r.items||[]).filter(i=>i.torchNo<first);if(!add.length){state.atStart=true;return 0;}state.items.unshift(...add);state.off+=add.length;
  if(r.hasPrevious===false)state.atStart=true;
  if(state.items.length>KEEP){const cut=state.items.length-KEEP;state.items.splice(KEEP,cut);state.next=String(state.items[state.items.length-1].torchNo);}
  return add.length;}
 async function jumpTo(item){if(!item||!mounted||state.loading)return;
  const id=visit,valid=()=>isVisit(id),month=state.monthsOn&&item.month?item.month:'';
  const ok=await loadAt({month,cursor:item.torchNo-80>0?String(item.torchNo-80):''},valid);if(!ok||!valid())return;
  state.focusNo=item.torchNo;
  if(state.items.length&&item.torchNo-80>0)state.atStart=false;
  const idx=state.items.findIndex(i=>i.torchNo===item.torchNo);
  if(idx<0){state.focusNo=null;}else{const half=Math.floor((state.fit||160)/2);state.off=Math.max(0,idx-half);layoutNow();
   if(!state.layout.entries.some(e=>e.item.torchNo===item.torchNo)){state.off=idx;}}
  redraw();await ahead(valid);if(valid()&&state.focusNo===item.torchNo)scene?.lookAtFocus();}

 /* ---------- UI ---------- */
 function status(msg){const el=$('.tm-status');el.textContent=msg||'';el.hidden=!msg;}
 function updateStatus(){status(simple?(state.loading?t.loading:state.pageError||(initialPagePending||state.items.length?'':t.empty))
  :!sceneReady?t.preparing+(progress>=.01?' '+Math.round(progress*100)+'%':''):state.loading?t.loading:state.pageError);}
 function setProgress(p){if(p<=progress)return;progress=Math.min(.99,p);if(!sceneReady&&!simple)updateStatus();}
 function updateChrome(){const L=state.layout,n=state.total;
  $('.tm-count').textContent=state.month?t.monthCount(t.ym(state.month),n):n?t.count(n):'';
  const first=L?.entries[0]?.item,last=L?.entries[L.entries.length-1]?.item;
  $('.tm-range').textContent=first?t.range(first.torchNo,last.torchNo):'';
  $('.tm-pager').hidden=!first;
  $('.tm-prev').disabled=!state.off&&state.atStart;$('.tm-next').disabled=!(L&&state.off+L.entries.length<state.items.length)&&!state.next;
  const q=scene?.tier||tier;const qb=$('.tm-quality');qb.textContent=t.quality[q];qb.setAttribute('aria-pressed',String(q==='low'));}
 async function step(dir,cols=false){if(!mounted||state.loading||!state.layout)return;
  const id=visit,valid=()=>isVisit(id);
  if(dir>0){const L=state.layout;const n=cols?Math.max(1,L.firstColumnCount):Math.max(1,L.entries.length);if(state.off+n>=state.items.length&&!state.next)return;
   state.off=Math.min(state.items.length-1,state.off+n);redraw();await ahead(valid);if(valid())redraw();}
  else{if(state.off<=0)await behind(valid);if(!valid())return;if(state.off<=0){redraw();return;}const n=cols?backColumn(state.off):backPage(state.off);state.off=Math.max(0,state.off-n);redraw();}}
 const tip=$('.tm-tip');
 function showTip(entry,x,y){if(!entry){tip.hidden=true;return;}const it=entry.item;
  tip.querySelector('.tm-tip-name').textContent=it.name||it.alias||t.anon;
  tip.querySelector('.tm-tip-meta').textContent=[dateText(it.at,true),it.game].filter(Boolean).join(' · ');
  tip.hidden=false;const r=host.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
  tip.style.left=Math.min(r.width-w-12,Math.max(12,x-r.left+16))+'px';tip.style.top=Math.min(r.height-h-12,Math.max(12,y-r.top+18))+'px';}

 /* ---------- face layout & drawing ---------- */
 const measure=document.createElement('canvas').getContext('2d');
 const runs=s=>{const out=[];for(const ch of s){const latin=/[ -~ -ɏ]/.test(ch);const last=out[out.length-1];if(last&&last.latin===latin)last.text+=ch;else out.push({latin,text:ch});}return out;};
 function verticalLength(s,px,adv){measure.font=px+'px '+FONT;let len=0;for(const r of runs(s))len+=r.latin?measure.measureText(r.text.trim()?r.text:' ').width+px*0.18:[...r.text].length*adv;return len;}
 function dateText(at,full){if(!at)return '';const d=new Date(at*1000),p=n=>String(n).padStart(2,'0');return full?d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()):p(d.getMonth()+1)+'·'+p(d.getDate());}
 function entryBox(item){const name=item.name||item.alias||t.anon;let px=NAME_PX,adv=NAME_ADV,len=verticalLength(name,px,adv);const room=AREA_Y1-AREA_Y0-56;
  if(len>room){const k=room/len;px=Math.floor(px*k);adv=adv*k;len=verticalLength(name,px,adv);}
  const game=item.game||'';let side=game;const sideRoom=Math.max(len,4*SIDE_ADV);
  while(side&&verticalLength(side,SIDE_PX,SIDE_ADV)>sideRoom)side=[...side].slice(0,-2).join('')+'…';if(side==='…')side='';
  const sideLen=side?verticalLength(side,SIDE_PX,SIDE_ADV):0;return {name,px,adv,len,side,sideLen,h:Math.max(len,sideLen)+24};}
 function layoutFrom(off){const entries=[];let col=0,y=AREA_Y0,firstColumnCount=0;const cols=Math.floor((AREA_X1-AREA_X0)/COL_W);
  for(let i=off;i<state.items.length;i++){const box=entryBox(state.items[i]);if(y+box.h>AREA_Y1&&y>AREA_Y0){col++;y=AREA_Y0;}if(col>=cols)break;
   const x=AREA_X1-COL_W*(col+1);entries.push({item:state.items[i],box,x,y,col});if(col===0)firstColumnCount++;y+=box.h+GAP;}
  return {entries,firstColumnCount,cols};}
 function backColumn(off){let y=AREA_Y0,n=0;for(let i=off-1;i>=0;i--){const h=entryBox(state.items[i]).h;if(y+h>AREA_Y1&&n)break;y+=h+GAP;n++;}return Math.max(1,n);}
 function backPage(off){let n=0,o=off;const cols=Math.floor((AREA_X1-AREA_X0)/COL_W);for(let c=0;c<cols&&o>0;c++){const k=backColumn(o);o-=k;n+=k;}return Math.max(1,n);}
 function layoutNow(){state.layout=layoutFrom(state.off);state.fit=state.layout.entries.length;return state.layout;}
 function redraw(){if(disposed)return;layoutNow();updateChrome();
  if(simple){renderList();return;}
  if(mounted)scene?.paintFace();else faceDirty=true;}
 /* the simple view: the names of the current page as a plain list, paged by the same arrows */
 function renderList(){const list=$('.tm-list');
  list.innerHTML=(state.layout?.entries||[]).map(({item})=>`<li><b>${esc(item.name||item.alias||t.anon)}</b><span>${esc([dateText(item.at,true),item.game].filter(Boolean).join(' · '))}</span></li>`).join('');
  list.hidden=false;}
 function enterSimple(){
  if(disposed||simple)return;
  simple=true;preferSimple=true;clearTimeout(slowTimer);slowTimer=0;
  /* the hall's own context is given up on purpose: that is not a lost context */
  canvas.removeEventListener('webglcontextlost',onLost);
  if(scene){ro?.disconnect();ro=null;scene.dispose();scene=null;}
  host.classList.add('tm-simple');
  canvas.hidden=veil.hidden=$('.tm-help').hidden=$('.tm-quality').hidden=$('.tm-sep').hidden=$('.tm-simple-go').hidden=true;
  bar.inert=false;timing('simple',opened);updateStatus();redraw();
 }

 /* Prepare the visible shell before the renderer, overlapping data and local assets. */
 const tier=pickTier(quality());
 const timed=async(name,work)=>{const start=performance.now();try{return await work();}finally{timing(name,start);}};
 /* controls */
 $('.tm-simple-go').addEventListener('click',enterSimple);$('.tm-prev').addEventListener('click',()=>step(-1));$('.tm-next').addEventListener('click',()=>step(1));
 $('.tm-quality').addEventListener('click',()=>{const next=scene.tier==='low'?'high':'low';try{localStorage.setItem(QUALITY_KEY,next);}catch{}scene.setTier(next);updateChrome();});
 $('.tm-me').addEventListener('click',()=>{if(!state.mine.length){toast(t.meNone);return;}const it=state.mine[state.mineAt%state.mine.length];state.mineAt++;jumpTo(it);});
 const results=$('.tm-results');
 $('.tm-find').addEventListener('submit',async e=>{e.preventDefault();const q=$('.tm-find input').value.trim();results.hidden=true;if(!q)return;
  const no=/^(?:传火人|火を継ぐ人|torch bearer)?\s*#?\s*(\d{1,12})$/i.exec(q);if(no){jumpTo({torchNo:Number(no[1]),month:''});return;}
  const cn=/^(?:传火人)?\s*([零壹贰叁肆伍陆柒捌玖拾佰仟万亿]+)$/.exec(q),cnv=cn?cnParse(cn[1]):null;if(cnv!==null){jumpTo({torchNo:cnv,month:''});return;}
  const id=visit,r=await call('torch_find',{name:q});if(!isVisit(id))return;
  if(!r?.ok){toast(t.offline);return;}if(r.available===false){toast(t.notDeployed);return;}
  const list=r.items||[];
  if(!list.length){toast(t.none);return;}if(list.length===1){jumpTo(list[0]);return;}
  results.innerHTML=list.map((it,i)=>`<li><button type="button" data-i="${i}"><b>${esc(it.name||it.alias||t.anon)}</b><span>${esc(dateText(it.at,true))}</span></button></li>`).join('')+(list.length>=50?`<li class="tm-results-more">${esc(t.more)}</li>`:'');
  results.hidden=false;results.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{results.hidden=true;jumpTo(list[Number(b.dataset.i)]);}));});
 const isEditor=target=>target?.isContentEditable||target?.closest?.('input,textarea,select');
 const clearKeys=()=>scene?.clearKeys();
 const onFocusTarget=e=>{if(isEditor(e.target)||e.target.closest?.('dialog,[role=dialog]'))clearKeys();};
 const onKeyUp=e=>scene?.moveKey(e.code,false);
 const onKey=e=>{if(!mounted||!sceneReady)return;
  if(!e.isComposing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!isEditor(e.target)&&!e.target.closest?.('dialog,[role=dialog]')&&scene.moveKey(e.code,true,e.repeat)){
   e.preventDefault();return;
  }
  if(!host.contains(e.target))return;
  if(e.key==='Escape'){if(!results.hidden){e.preventDefault();results.hidden=true;}else if(scene.reading()){e.preventDefault();scene.resetView();}return;}
  if(e.target.closest?.('input,textarea'))return;
  if(e.key==='+'||e.key==='='){e.preventDefault();scene.walkBy(-120,0);return;}if(e.key==='-'){e.preventDefault();scene.walkBy(120,0);return;}if(e.key==='0'){e.preventDefault();scene.resetView();return;}
  if(e.key==='PageDown'||e.key==='ArrowLeft'){e.preventDefault();step(1);}else if(e.key==='PageUp'||e.key==='ArrowRight'){e.preventDefault();step(-1);}};
 /* Paging stays on the arrows; wheel input walks along the current view. */
 const onWheel=e=>{if(!sceneReady||e.target.closest?.('.tm-bar,.tm-results'))return;e.preventDefault();scene.walkBy(e.deltaY||e.deltaX,e.deltaMode);};
 host.addEventListener('wheel',onWheel,{passive:false});
 canvas.addEventListener('pointermove',e=>{const hit=scene?.pick(e.clientX,e.clientY);let cursor='';state.hoverMonth=null;
  if(hit&&hit.band){state.hoverMonth=hit.band;cursor='pointer';showTip(null);}else if(hit&&hit.entry){cursor='grab';showTip(hit.entry,e.clientX,e.clientY);}else{cursor='grab';showTip(null);}
  canvas.dataset.cursor=cursor;});
 canvas.addEventListener('pointerleave',()=>{scene?.clearCoverHover();showTip(null);});
 canvas.addEventListener('click',async e=>{if(scene.dragged())return;const hit=scene.pick(e.clientX,e.clientY);
  if(!hit||!hit.band)return;const b=hit.band;
  if(b.kind==='shift'){state.bandWindow=Math.max(0,Math.min(Math.max(0,state.months.length-12),state.bandWindow+b.dir*6));redraw();return;}
  if(state.loading)return;
  const id=visit,valid=()=>isVisit(id);
  const ok=await loadAt({month:b.month,cursor:''},valid);
  if(!ok||!valid())return;
  state.focusNo=null;redraw();await ahead(valid);if(valid())redraw();});
 /* stop drawing in the background; close before a game starts */
 canvas.addEventListener('dblclick',e=>{if(e.button!==0)return;e.preventDefault();scene.resetView();});
 const syncActive=()=>scene?.setActive(mounted&&sceneReady&&!document.hidden&&document.hasFocus());
 const onBlur=()=>scene?.setActive(false);
 function resume(mount,contextLost){
  onContextLost=contextLost;
  if(mounted)suspend();
  mount.append(host);
  mounted=true;
  addEventListener('keydown',onKey,{capture:true});
  addEventListener('keyup',onKeyUp,{capture:true});
  document.addEventListener('focusin',onFocusTarget);
  document.addEventListener('visibilitychange',syncActive);
  addEventListener('blur',onBlur);addEventListener('focus',syncActive);
  if(scene){
   scene.resize();ro?.observe(host);
   scene.loadCovers?.(call);
   if(faceDirty){faceDirty=false;scene.paintFace();}
   syncActive();
  }
  wakePreparation?.();
  /* still not ready after a while: offer the simple list instead of leaving the visit on the loading line */
  if(!sceneReady&&!simple&&!slowTimer)slowTimer=setTimeout(()=>{if(!disposed&&!sceneReady&&!simple&&mounted)$('.tm-simple-go').hidden=false;},SIMPLE_AFTER);
  if(!ctl.prepared)ctl.prepared=prepare();
  else if((sceneReady||simple)&&state.pageError){
   const id=visit,valid=()=>isVisit(id);
   loadAt({},valid).then(ok=>{if(ok&&valid())redraw();});
  }
 }
 function suspend(){
  if(!mounted)return;
  mounted=false;visit++;onContextLost=null;
  if(!initialPagePending){state.loading=false;updateStatus();}
  removeEventListener('keydown',onKey,{capture:true});document.removeEventListener('visibilitychange',syncActive);
  removeEventListener('keyup',onKeyUp,{capture:true});document.removeEventListener('focusin',onFocusTarget);
  removeEventListener('blur',onBlur);removeEventListener('focus',syncActive);ro?.disconnect();
  results.hidden=true;showTip(null);state.hoverMonth=null;
  if(scene?.suspend())faceDirty=true;
  if(firstFrame){
   gsap?.killTweensOf(veil);
   veil.style.opacity='0';
  }
  host.remove();
 }

 /* Finish loading assets off-route, but build and compile only once a visit needs the scene. */
 async function waitForMount(){
  while(!disposed&&!mounted)await new Promise(resolve=>{wakePreparation=resolve;});
  wakePreparation=null;
 }
 function onFirstFrame(){
  firstFrame=true;timing('first-frame',opened);
  scene.intro();
  if(gsap)gsap.to(veil,{autoAlpha:0,duration:1.6,ease:'power2.out'});
  else veil.style.opacity='0';
 }
 function onLost(){
  const notify=onContextLost;
  close();notify?.();
 }
 const onPageHide=event=>{if(!event.persisted)close();};
 canvas.addEventListener('webglcontextlost',onLost);
 addEventListener('pagehide',onPageHide);
 addEventListener('megulit-game-launch',close);

 /* Side requests follow the first page request. */
 function sideRequests(firstLoad){
  call('torch_months').then(r=>{if(disposed||!r?.ok)return;state.monthsOn=r.available!==false;state.months=r.months||[];state.bandWindow=Math.max(0,state.months.length-12);redraw();});
  call('torch_find',{name:'',probe:true}).then(r=>{if(disposed)return;state.findOn=!!(r?.ok&&r.available!==false);$('.tm-find').hidden=!state.findOn;});
  call('torch_me').then(async r=>{if(disposed||!r?.ok)return;state.mine=r.items||[];$('.tm-me').hidden=!(r.available!==false&&state.mine.length);
   if(state.mine.length){await firstLoad;redraw();}});
 }
 /* 2026-11-28 user: 现在点传火碑会卡住强制加载 不让切走. The hall was put together in one go on the main thread (and, when the
    bake could not be read, every texture and the occlusion volume were worked out there too: 8 s on a fast PC), so the top bar
    could not be clicked until it was done. Now the build and the shader compile run in slices that hand the thread back, a
    visit that is left stops at the next slice and releases what it made, a bake that cannot be read shows the simple list
    instead, and after SIMPLE_AFTER the visitor may pick the simple list themselves. */
 async function prepare(){
  updateStatus();redraw();
  const simpleFirst=preferSimple&&!window.__TORCH_BAKE,low=tier==='low';
  const fontReady=simpleFirst?null:timed('font',()=>document.fonts.load('44px "Torch Serif"','传火碑人').catch(()=>{}));
  const gsapReady=simpleFirst||reduced?null:timed('gsap',()=>loadGsap().catch(()=>null));
  const bakeReady=simpleFirst?null:timed('bake-assets',()=>loadBaked(low));
  const firstLoad=timed('first-page',()=>loadAt({})).then(()=>{
   initialPagePending=false;
   if(disposed)return;
   updateStatus();redraw();
   const id=visit;
   return ahead(()=>isVisit(id));
  });
  const simpleNow=()=>{enterSimple();sideRequests(firstLoad);return ctl;};
  if(simpleFirst)return simpleNow();
  assetTick=setInterval(()=>setProgress(.5*bakeProgress(low)),150);
  const alive=()=>!disposed&&!simple;
  try{
   let bake=await bakeReady;
   /* one more try for a file that failed to arrive or decode (a stale bake stays stale) */
   if(!bake.ok&&bake.reason!=='stale'&&!window.__TORCH_BAKE&&alive())bake=await timed('bake-assets-retry',()=>loadBaked(low));
   const [motion]=await Promise.all([gsapReady,fontReady]);
   clearInterval(assetTick);
   if(disposed)return null;
   if(simple)return ctl;
   if(!bake.ok&&!window.__TORCH_BAKE){console.warn('torch: bake not usable, showing the simple list',bake.reason);return simpleNow();}
   setProgress(.5);
   await yieldMain();
   while(!mounted&&!disposed)await waitForMount();
   if(disposed)return null;
   if(simple)return ctl;
   gsap=motion;
   layoutNow();
   const start=performance.now();
   const {ok,reason}=bake;
   scene=await withBaked(bake,()=>buildScene({host,canvas:$('.tm-canvas'),state,t,tier,reduced,gsap,onTier:updateChrome,bakeInfo:{ok,reason},onFirstFrame,alive,
    onProgress:p=>setProgress(.5+.3*p)}));
   timing(ok?'build-scene':'build-scene-fallback',start);
   if(!window.__TORCH_BAKE)scene.loadCovers?.(call);
   ro=new ResizeObserver(()=>{if(mounted)scene?.resize();});ro.observe(host);
   if(typeof window.__TORCH_HOUR==='number')host.__torch=scene;
  }catch(error){
   clearInterval(assetTick);
   if(error===CANCELLED)return disposed?null:ctl;
   if(disposed)return null;
   console.error('torch: the hall could not be built, showing the simple list',error);
   return simpleNow();
  }
  updateChrome();
  sideRequests(firstLoad);

  await yieldMain();
  while(!mounted&&!disposed)await waitForMount();
  if(disposed)return null;
  if(simple)return ctl;
  const compileStart=performance.now();
  const built=scene;
  Promise.resolve(built.prepare(()=>{
   if(disposed||simple||scene!==built)return;
   sceneReady=true;clearTimeout(slowTimer);slowTimer=0;$('.tm-simple-go').hidden=true;
   canvas.inert=bar.inert=false;$('.tm-quality').disabled=false;
   updateStatus();timing('shader-ready',compileStart);timing('ready',opened);syncActive();
  },{alive,onProgress:p=>setProgress(.8+.2*p)})).catch(error=>{
   if(disposed||simple)return;
   console.error('torch: shaders could not be prepared, showing the simple list',error);enterSimple();
  });
  return ctl;
 }
 function leave(){if(sceneReady||simple)suspend();else close();}
 function close(){
  if(disposed)return;
  suspend();disposed=true;if(current===ctl)current=null;
  clearTimeout(slowTimer);slowTimer=0;clearInterval(assetTick);assetTick=0;
  wakePreparation?.();
  canvas.removeEventListener('webglcontextlost',onLost);
  removeEventListener('pagehide',onPageHide);removeEventListener('megulit-game-launch',close);
  scene?.dispose();scene=null;host.remove();
 }
 return ctl;
}

/* weak machines start on the light tier: few cores, little memory, or a software renderer */
let autoQuality;
function pickTier(q){if(q!=='auto')return q;if(autoQuality)return autoQuality;
 const cores=navigator.hardwareConcurrency||4,mem=navigator.deviceMemory||8;
 if(cores<=2||mem<=2)return autoQuality='low';
 let soft=false;try{const gl=document.createElement('canvas').getContext('webgl2');const ext=gl&&gl.getExtension('WEBGL_debug_renderer_info');
  const name=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'';soft=/swiftshader|basic render|llvmpipe|software/i.test(name);gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
 return autoQuality=soft?'low':'high';}

/* ================= the scene ================= */
/* 2026-11-28 async: the build hands the main thread back between its parts (see prepare in createMonument). A visit that ends
   meanwhile (alive() false) stops at the next part; what was made so far is released here and CANCELLED is thrown. */
async function buildScene({host,canvas,state,t,tier,reduced,gsap,onTier,bakeInfo=null,onFirstFrame,alive=()=>true,onProgress=()=>{}}){
 let aoInfo=null;
 const bag=new Set();const keep=o=>{bag.add(o);return o;};
 const tex=(c,srgb=true,rep=1)=>{const x=keep(new THREE.CanvasTexture(c));x.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;x.wrapS=x.wrapT=THREE.RepeatWrapping;x.repeat.set(rep,rep);x.anisotropy=8;return x;};
 let renderer,composer=null,bloom=null,grade=null,vol=null,reflector=null,active=true,raf=0,last=performance.now(),slow=0,frames=0,introDone=false,dragMoved=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x0e0c14);scene.fog=new THREE.FogExp2(0x16131f,0.015);
 const camera=new THREE.PerspectiveCamera(44,1,0.1,900);
 const START={pos:new THREE.Vector3(0,2.6,37),look:new THREE.Vector3(0,27,3)},END={pos:new THREE.Vector3(0,5.45,20.5),look:new THREE.Vector3(0,3.95,0)};
 const view={pos:START.pos.clone(),look:START.look.clone(),yaw:0,pitch:0,yawT:0,pitchT:0,dragYaw:0,dragPitch:0,freeYaw:0,freePitch:0,px:0,pxT:0,read:null};
 const walk=createTorchWalk({reduced});
 const travel=new THREE.Vector3(),screenRight=new THREE.Vector3();
 camera.position.copy(view.pos);camera.lookAt(view.look);

 /* ---- environment for reflections: a dim stone room with a few bright windows (scaled with the daylight, see frame) ---- */
 function envMap(){const pm=new THREE.PMREMGenerator(renderer);const es=new THREE.Scene();es.background=new THREE.Color(0x2c2834);
  const box=new THREE.Mesh(new THREE.BoxGeometry(40,30,40),new THREE.MeshBasicMaterial({color:0x4a4448,side:THREE.BackSide}));box.position.y=10;es.add(box);
  const flr=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshBasicMaterial({color:0x6e6a72}));flr.rotation.x=-Math.PI/2;flr.position.y=-4.9;es.add(flr);
  const win=new THREE.MeshBasicMaterial({color:new THREE.Color(0xf0e8ff).multiplyScalar(4)});
  for(let i=0;i<7;i++){const a=(i/6-.5)*Math.PI*.8,m=new THREE.Mesh(new THREE.CircleGeometry(.9,20),win);m.position.set(Math.sin(a)*14,13,-Math.cos(a)*14);m.lookAt(0,8,0);es.add(m);}
  for(const s of [-1,1]){const m=new THREE.Mesh(new THREE.CircleGeometry(2.4,24),win);m.position.set(s*15,14,4);m.lookAt(0,10,4);es.add(m);}
  const rt=pm.fromScene(es,.02);es.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});pm.dispose();return keep(rt);}

 /* ---- the hall (web/torch-hall.js) ---- */
 /* before dispose() below exists: free the scene graph, the kept textures and targets, and the renderer once made */
 function abandon(){
  scene.traverse(o=>{if(o.geometry)o.geometry.dispose();const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
   ms.forEach(m=>{for(const k in m){const v=m[k];if(v&&v.isTexture)v.dispose();}m.dispose?.();});});
  for(const o of bag){try{o.dispose?.();}catch{}}bag.clear();
  if(renderer){renderer.renderLists.dispose();renderer.dispose();if(!renderer.getContext().isContextLost())renderer.forceContextLoss();}
 }
 let part=0;const PARTS=12;
 async function slice(full){onProgress(++part/PARTS);await yieldMain();if(alive())return;if(full)dispose();else abandon();throw CANCELLED;}
 await slice(false);
 const tBuild=performance.now();const H=await buildHall({scene,keep,tex,tier,maxAniso:8,slice:()=>slice(false)});const buildMs=performance.now()-tBuild;
 await slice(false);
 const courtyard=buildCourtyard(scene,HALL.NZ1);
 const hazeDay=new THREE.Color(0xb1c6d6),hazeNight=new THREE.Color(0x475777),haze=new THREE.Color();
 const covers=createTorchCovers(courtyard.group,{east:HALL.BACK,west:HALL.NZ1,reduced});const {skipInMirror,floorMat,FL_W,FL_L,FL_Z}=H;

 /* ---- the stele (web/torch-hall.js) ---- */
 const {stele,slab,SW,SH,SD,basaltBody,bas,emit:steleEmit}=buildStele({scene,keep,tier});
 /* inscription surface: its own maps, redrawn per page */
 const LOW=tier==='low',FS=()=>tier==='low'?.5:1;
 const faceW=SW-.3,faceH=faceW*FH/FW,faceY=slab.position.y;
 const faces={map:canvas2d(FW,FH),emissive:canvas2d(FW,FH),rough:canvas2d(FW,FH),mask:canvas2d(FW,FH),t1:canvas2d(FW,FH),t2:canvas2d(FW,FH),base:null,baseR:null,scale:1};
 const faceMat=keep(new THREE.MeshStandardMaterial({roughness:1,metalness:0,envMapIntensity:1.0,emissive:0xffffff,emissiveIntensity:1,
  normalMap:basaltBody.normalMap,normalScale:new THREE.Vector2(.12,.12)}));
 const faceTex={map:keep(new THREE.CanvasTexture(faces.map)),emissive:keep(new THREE.CanvasTexture(faces.emissive)),rough:keep(new THREE.CanvasTexture(faces.rough))};
 faceTex.map.colorSpace=faceTex.emissive.colorSpace=THREE.SRGBColorSpace;for(const k in faceTex){faceTex[k].anisotropy=8;faceTex[k].generateMipmaps=true;}
 faceMat.map=faceTex.map;faceMat.emissiveMap=faceTex.emissive;faceMat.roughnessMap=faceTex.rough;
 const face=new THREE.Mesh(keep(new THREE.PlaneGeometry(faceW,faceH)),faceMat);face.position.set(0,faceY,SD/2+.002);face.receiveShadow=true;stele.add(face);
 /* glow for the entry being looked for */
 const glowTex=tex(glowSprite(256),true);
 const glow=new THREE.Mesh(keep(new THREE.PlaneGeometry(1,1)),keep(new THREE.MeshBasicMaterial({map:glowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0,fog:false})));
 glow.position.set(0,faceY,SD/2+.03);glow.renderOrder=5;stele.add(glow);
 const glowLight=new THREE.PointLight(0xbfe0ff,0,3.2,2);glowLight.position.set(0,faceY,SD/2+.6);stele.add(glowLight);
 /* the stone's own light: a slow dark-violet swirl sealed inside the polished face (domain-warped noise, additive, dim enough that the
    names stay readable), a soft violet aura around the slab's outline, and a few motes of light drifting up off the face.
    Stronger at night (follows the torch level), barely there by day. */
 const auraU={uTime:{value:0},uI:{value:.3},uLv:{value:new THREE.Vector4(1,1,1,1)}};
 const breathPhase=[0,1,2,3].map(i=>[Math.random()*6.28,Math.random()*6.28,.5+i*.13+Math.random()*.2]);
 const NOISE=`float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return s;}`;
 const swirl=new THREE.Mesh(keep(new THREE.PlaneGeometry(faceW,faceH)),keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,uniforms:auraU,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float uTime;uniform float uI;uniform vec4 uLv;varying vec2 vUv;${NOISE}
   float lv(float x){vec4 w=exp(-pow((vec4(x)-vec4(.125,.375,.625,.875))/.17,vec4(2.)));return dot(w,uLv)/max(1e-3,dot(w,vec4(1.)));}
   void main(){vec2 p=vUv*vec2(5.,1.3);float t=uTime*.05;
    vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3)-t));vec2 r=vec2(fbm(p+3.5*q+vec2(1.7,9.2)+t*.8),fbm(p+3.5*q+vec2(8.3,2.8)-t*.6));float f=fbm(p+3.*r);
    vec3 c=vec3(.28,.09,.58)*pow(smoothstep(.55,.9,f),2.)*.55+vec3(.72,.52,1.)*pow(smoothstep(.76,.97,f),4.)*.45;
    float m=smoothstep(0.,.08,vUv.x)*(1.-smoothstep(.92,1.,vUv.x))*smoothstep(0.,.12,vUv.y)*(1.-smoothstep(.88,1.,vUv.y));
    gl_FragColor=vec4(c*uI*.32*m*(.35+.65*lv(vUv.x)),1.);}`})));
 swirl.position.set(0,faceY,SD/2+.003);swirl.renderOrder=4;stele.add(swirl);
 const AW=SW+2.4,AH=SH+2.0;
 const aura=new THREE.Mesh(keep(new THREE.PlaneGeometry(AW,AH)),keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,uniforms:auraU,
  vertexShader:`varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float uTime;uniform float uI;uniform vec4 uLv;varying vec2 vP;${NOISE}
   float lv(float x){vec4 w=exp(-pow((vec4(x)-vec4(.125,.375,.625,.875))/.17,vec4(2.)));return dot(w,uLv)/max(1e-3,dot(w,vec4(1.)));}
   void main(){vec2 b=vec2(${(SW/2).toFixed(3)},${(SH/2).toFixed(3)});vec2 d=abs(vP)-b;float dist=length(max(d,0.))+min(max(d.x,d.y),0.);
    float a=exp(-max(dist,0.)*2.6)*step(0.,dist);float s=vP.x*.55+(vP.x<0.?-vP.y:vP.y)*.55;float wav=smoothstep(.42,.78,fbm(vec2(s*.8,uTime*.07)));
    wav*=lv(clamp(vP.x/${(SW).toFixed(3)}+.5,0.,1.));
    vec2 edge=vec2(${(AW/2).toFixed(3)},${(AH/2).toFixed(3)})-abs(vP);
    float feather=smoothstep(.03,.48,min(edge.x,edge.y));
    gl_FragColor=vec4(vec3(.36,.16,.70)*a*wav*uI*.3,feather);}`})));
 aura.position.set(0,faceY,-SD/2-.04);aura.renderOrder=1;stele.add(aura);
 /* motes off the face */
 const MOTES=90,mp=new Float32Array(MOTES*3),ms=new Float32Array(MOTES);for(let i=0;i<MOTES;i++){mp[i*3]=(Math.random()-.5)*faceW;mp[i*3+1]=faceY-faceH/2+Math.random()*faceH*.9;mp[i*3+2]=SD/2+.05;ms[i]=Math.random();}
 const moteGeo=keep(new THREE.BufferGeometry());moteGeo.setAttribute('position',new THREE.BufferAttribute(mp,3));moteGeo.setAttribute('aSeed',new THREE.BufferAttribute(ms,1));
 const motes=new THREE.Points(moteGeo,keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,uniforms:{...auraU,uPx:{value:1}},
  vertexShader:`uniform float uTime;uniform float uI;uniform float uPx;attribute float aSeed;varying float vA;
   void main(){float life=fract(uTime*(.05+aSeed*.05)+aSeed*9.1);vec3 p=position+vec3(sin(aSeed*50.+uTime*.4)*.15,life*1.4,.05+life*.35);
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;vA=sin(life*3.14159)*uI;gl_PointSize=uPx*(1.+aSeed*1.6)*(6./-mv.z);}`,
  fragmentShader:`varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;float a=smoothstep(.5,0.,d)*vA;gl_FragColor=vec4(vec3(.72,.55,1.)*a*1.6,a);}`})));
 await slice(false);
 motes.frustumCulled=false;motes.renderOrder=5;stele.add(motes);


 function ensureFaceSize(){const k=FS();if(faces.scale===k&&faces.base)return;faces.scale=k;const w=Math.round(FW*k),h=Math.round(FH*k);
  for(const n of ['map','emissive','rough','mask','t1','t2']){faces[n].width=w;faces[n].height=h;}
  /* polished basalt under the letters: grain from the basalt tile, a soft sheen from top */
  const b=canvas2d(w,h),g=b.getContext('2d');g.fillStyle='#08090b';g.fillRect(0,0,w,h);g.globalAlpha=.9;const pat=g.createPattern(bas.map,'repeat');g.fillStyle=pat;g.fillRect(0,0,w,h);g.globalAlpha=1;
  const sh=g.createLinearGradient(0,0,0,h);sh.addColorStop(0,'rgba(120,140,165,.05)');sh.addColorStop(.5,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.25)');g.fillStyle=sh;g.fillRect(0,0,w,h);
  const r=canvas2d(w,h),rg=r.getContext('2d');rg.fillStyle=rg.createPattern(bas.rough,'repeat');rg.fillRect(0,0,w,h);
  faces.base=b;faces.baseR=r;faceTex.map.dispose();faceTex.emissive.dispose();faceTex.rough.dispose();}

 /* vertical text: CJK upright, Latin runs turned 90° like tategaki */
 function vText(g,s,cx,y,px,adv,fill){g.font=px+'px '+FONT;g.textAlign='center';g.textBaseline='middle';let yy=y;
  for(const r of ((str)=>{const out=[];for(const ch of str){const latin=/[ -~ -ɏ]/.test(ch);const last=out[out.length-1];if(last&&last.latin===latin)last.text+=ch;else out.push({latin,text:ch});}return out;})(s)){
   if(r.latin){const w=g.measureText(r.text).width;g.save();g.translate(cx,yy+w/2+px*.09);g.rotate(Math.PI/2);if(fill)g.fillStyle=fill;g.fillText(r.text,0,0);g.restore();yy+=w+px*.18;}
   else for(const ch of r.text){if(fill)g.fillStyle=fill;if(/[ー〜～…‥]/.test(ch)){g.save();g.translate(cx,yy+adv/2);g.rotate(Math.PI/2);g.fillText(ch,0,0);g.restore();}
    else if(/[、。，．]/.test(ch))g.fillText(ch,cx+px*.32,yy+adv/2-px*.3);else g.fillText(ch,cx,yy+adv/2);yy+=adv;}}
  return yy-y;}
 /* everything carved goes through `glyphs(g,colorFor)`: the same call fills the mask and the glow layer */
 function glyphs(g,colorFor){const L=state.layout;if(!L)return;
  /* month band */
  const band=bandItems();g.textAlign='center';g.textBaseline='middle';
  if(!band.length){const c=colorFor({title:true});if(c){g.fillStyle=c;g.font='54px '+FONT;if('letterSpacing' in g)g.letterSpacing='24px';g.fillText(t.title,FW/2+12,(BAND_Y0+BAND_Y1)/2+4);if('letterSpacing' in g)g.letterSpacing='0px';}}
  for(const b of band){const c=colorFor({band:b});if(!c)continue;g.fillStyle=c;
   if(b.kind==='shift'){g.font='40px '+FONT;g.fillText(b.dir<0?'‹':'›',b.x,(BAND_Y0+BAND_Y1)/2);continue;}
   g.fillRect(b.x-2,BAND_Y1-10,4,14);g.font=(b.active?'600 42px ':'38px ')+FONT;g.fillText(b.label,b.x,BAND_Y0+30);
   if(b.sub){g.font='20px '+FONT;g.fillText(b.sub,b.x,BAND_Y0+68);}}
  const rc=colorFor({rule:true});if(rc){g.fillStyle=rc;g.fillRect(AREA_X0,RULE_Y,AREA_X1-AREA_X0,3);g.fillRect(AREA_X0,RULE_Y+10,AREA_X1-AREA_X0,1.2);}
  if(!L.entries.length){const c=colorFor({empty:true});if(c&&!state.loading&&!state.pageError){vText(g,t.empty,FW/2,(AREA_Y0+AREA_Y1)/2-verticalLen(t.empty,84,88)/2,84,88,c);}return;}
  for(const e of L.entries){const c=colorFor({entry:e});if(!c)continue;const cx=e.x+26;
   vText(g,e.box.name,cx,e.y,e.box.px,e.box.adv,c);
   if(e.box.side)vText(g,e.box.side,e.x+55,e.y+3,SIDE_PX,SIDE_ADV,c);
   g.font=DATE_PX+'px '+FONT;g.textAlign='center';g.textBaseline='middle';g.fillStyle=c;g.fillText(dateShort(e.item.at),e.x+30,e.y+Math.max(e.box.len,e.box.sideLen)+13);}}
 const verticalLen=(s,px,adv)=>{const c=faces.t1.getContext('2d');c.font=px+'px '+FONT;let len=0;for(const ch of s)len+=/[ -~]/.test(ch)?c.measureText(ch).width:adv;return len;};
 const dateShort=at=>{if(!at)return '';const d=new Date(at*1000);return String(d.getMonth()+1).padStart(2,'0')+'·'+String(d.getDate()).padStart(2,'0');};
 function bandItems(){const out=[];if(!state.monthsOn||!state.months.length){state.band=out;return out;}const list=state.months,win=state.bandWindow,shown=list.slice(win,win+12);
  const xs=AREA_X0+120,xe=AREA_X1-120,slots=shown.length+1,stepX=Math.min(300,(xe-xs)/Math.max(1,slots));
  const start=(AREA_X0+AREA_X1)/2-stepX*(slots-1)/2;
  out.push({kind:'month',month:'',label:t.all,sub:'',x:start,active:!state.month,w:stepX});
  shown.forEach((m,i)=>out.push({kind:'month',month:m.month,label:m.month.replace('-','.'),sub:String(m.n),x:start+stepX*(i+1),active:state.month===m.month,w:stepX}));
  if(win>0)out.push({kind:'shift',dir:-1,x:AREA_X0+30,w:80});if(win+12<list.length)out.push({kind:'shift',dir:1,x:AREA_X1-30,w:80});
  state.band=out;return out;}
 const mineSet=()=>new Set(state.mine.map(m=>m.torchNo));
 function paintFace(){ensureFaceSize();const k=faces.scale,w=faces.map.width,h=faces.map.height;const mine=mineSet();
  const prep=c=>{const g=c.getContext('2d');g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=1;g.clearRect(0,0,w,h);g.setTransform(k,0,0,k,0,0);return g;};
  /* mask: every glyph in white */
  const gm=prep(faces.mask);glyphs(gm,()=>'#fff');
  const flat=(c,color)=>{const g=c.getContext('2d');g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-in';g.fillStyle=color;g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over';};
  const sh=Math.max(1,Math.round(4*k));
  /* albedo: polished stone + carved letters (dark upper wall, lit lower lip, matte grey floor of the cut) */
  const gA=faces.map.getContext('2d');gA.setTransform(1,0,0,1,0,0);gA.globalCompositeOperation='source-over';gA.drawImage(faces.base,0,0);
  const g1=prep(faces.t1);g1.setTransform(1,0,0,1,0,0);g1.drawImage(faces.mask,0,0);flat(faces.t1,'#020203');gA.drawImage(faces.t1,0,0);
  const g2=prep(faces.t2);g2.setTransform(1,0,0,1,0,0);g2.drawImage(faces.mask,0,sh);g2.globalCompositeOperation='destination-in';g2.drawImage(faces.mask,0,0);g2.globalCompositeOperation='source-over';
  flat(faces.t2,'#6f7c8b');gA.drawImage(faces.t2,0,0);
  g2.setTransform(1,0,0,1,0,0);g2.clearRect(0,0,w,h);g2.drawImage(faces.mask,0,sh);g2.globalCompositeOperation='destination-in';g2.drawImage(faces.mask,0,0);g2.drawImage(faces.mask,0,-Math.max(1,Math.round(2*k)));
  g2.globalCompositeOperation='source-over';flat(faces.t2,'#39424d');gA.drawImage(faces.t2,0,0);
  /* roughness: polished stone, matte cuts */
  const gR=faces.rough.getContext('2d');gR.setTransform(1,0,0,1,0,0);gR.drawImage(faces.baseR,0,0);g1.setTransform(1,0,0,1,0,0);g1.clearRect(0,0,w,h);g1.drawImage(faces.mask,0,0);flat(faces.t1,'#d4d4d4');gR.drawImage(faces.t1,0,0);
  /* glow: faint cold light in every cut, brighter for this PC's names and the one looked for */
  const gE=faces.emissive.getContext('2d');gE.setTransform(1,0,0,1,0,0);gE.fillStyle='#000';gE.fillRect(0,0,w,h);g1.setTransform(1,0,0,1,0,0);g1.clearRect(0,0,w,h);g1.drawImage(faces.mask,0,sh>>1);
  g1.globalCompositeOperation='destination-in';g1.drawImage(faces.mask,0,0);flat(faces.t1,'#4d7398');gE.drawImage(faces.t1,0,0);
  gE.setTransform(k,0,0,k,0,0);
  glyphs(gE,o=>{if(o.entry){const n=o.entry.item.torchNo;if(n===state.focusNo)return '#f2f8ff';if(mine.has(n))return '#7fa9d6';return null;}
   if(o.band){if(o.band.active)return '#9cc4ee';if(state.hoverMonth&&o.band.kind===state.hoverMonth.kind&&o.band.month===state.hoverMonth.month&&o.band.dir===state.hoverMonth.dir)return '#5f87b0';return null;}
   return null;});
  gE.setTransform(1,0,0,1,0,0);
  faceTex.map.needsUpdate=faceTex.emissive.needsUpdate=faceTex.rough.needsUpdate=true;placeGlow();}
 let paintQueued=0,lastHoverKey='';
 function queuePaint(){if(paintQueued)return;paintQueued=requestAnimationFrame(()=>{paintQueued=0;paintFace();});}
 function placeGlow(){const e=state.layout?.entries.find(x=>x.item.torchNo===state.focusNo);if(!e){glow.userData.on=false;return;}
  const cx=e.x+38,cy=e.y+Math.max(e.box.len,e.box.sideLen)/2+6,u=cx/FW,v=cy/FH;glow.position.x=(u-.5)*faceW;glow.position.y=faceY+(.5-v)*faceH;
  glow.scale.set(COL_W/FW*faceW*2.2,(e.box.len+80)/FH*faceH*1.35,1);glow.userData.on=true;glow.userData.t0=performance.now();
  glowLight.position.set(glow.position.x,glow.position.y,SD/2+.5);glow.userData.world=new THREE.Vector3(glow.position.x,glow.position.y,0);}

 /* ---- dust drifting in the bay; brighter in daylight and by torchlight ---- */
 let dust=null;
 /* motes in the air: tiny and dim, but where the sun or the moon reaches them (their own lookup in its shadow map) they light up in
    its colour, so a moonbeam through the drum fills with drifting specks */
 function makeDust(n){const pos=new Float32Array(n*3),seed=new Float32Array(n),r=rng(91);
  for(let i=0;i<n;i++){pos[i*3]=(r()-.5)*HALL.HX*1.9;pos[i*3+1]=.2+Math.pow(r(),1.4)*22;pos[i*3+2]=HALL.BACK+.5+r()*(i<n*.75?18:34);seed[i]=r();}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,
   uniforms:{uTime:{value:0},uScale:{value:1},uSpeed:{value:reduced?.25:1},uBase:{value:.08},uLit:{value:0},uLight:{value:new THREE.Color(1,1,1)},uWarm:{value:new THREE.Color(0xc8b8f0)},
    tShadow:{value:null},shadowMatrix:{value:new THREE.Matrix4()},uHasShadow:{value:0}},
   vertexShader:`#include <packing>
    uniform float uTime;uniform float uScale;uniform float uSpeed;uniform float uBase;uniform float uLit;uniform vec3 uLight;uniform vec3 uWarm;uniform sampler2D tShadow;uniform mat4 shadowMatrix;uniform float uHasShadow;
    attribute float aSeed;varying vec3 vC;
    void main(){vec3 p=position;float t=uTime*uSpeed;p.x+=sin(t*.09+aSeed*40.)*.4;p.y+=sin(t*.06+aSeed*17.)*.5;p.z+=cos(t*.08+aSeed*29.)*.4;
     float lit=0.;if(uHasShadow>.5){vec4 sc=shadowMatrix*vec4(p,1.);if(sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.&&sc.z<1.)lit=step(sc.z-.0015,unpackRGBAToDepth(texture2D(tShadow,sc.xy)));}
     vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float tw=.6+.4*sin(t*(.5+aSeed)+aSeed*60.);float fade=smoothstep(34.,6.,-mv.z)*smoothstep(.8,3.,-mv.z);
     vC=(uWarm*uBase+uLight*lit*uLit)*tw*fade;gl_PointSize=uScale*(.55+aSeed*.9+lit*.5)*(7./-mv.z);}`,
   fragmentShader:`varying vec3 vC;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;float a=smoothstep(.5,0.,d);gl_FragColor=vec4(vC*a,a*max(vC.r,max(vC.g,vC.b)));}`});
  keep(g);keep(m);const p=new THREE.Points(g,m);p.renderOrder=4;p.frustumCulled=false;return p;}

 /* ---- renderer & tiers ---- */
 function makeRenderer(){renderer=new THREE.WebGLRenderer({canvas,antialias:tier!=='low',powerPreference:tier==='low'?'low-power':'high-performance',stencil:false});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.localClippingEnabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=tier==='low'?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;}
 /* grading on the full tier: a soft vignette, a touch of saturation, fine grain against banding */
 const GRADE={uniforms:{tDiffuse:{value:null},uTime:{value:0},uVig:{value:.34}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime;uniform float uVig;varying vec2 vUv;float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
   void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 d=vUv-.5;c.rgb*=1.-uVig*smoothstep(.28,.9,length(d*vec2(1.05,1.)));float l=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(l),c.rgb,1.06);
    c.rgb+=(h(vUv*913.+fract(uTime))-.5)*.014*(c.rgb+.015);gl_FragColor=c;}`};
 makeRenderer();
 await slice(false);
 let env=envMap();scene.environment=env.texture;
 await slice(false);
 function applyTier(){const low=tier==='low';
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,low?.75:1.75));renderer.shadowMap.type=low?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;H.setShadows(true,low?1024:2048);host.classList.toggle('tm-lowfx',low);
  /* floor: mirror under the translucent polished marble (and the inlaid runner), or the marble alone */
  if(reflector){scene.remove(reflector);reflector.getRenderTarget().dispose();reflector.material.dispose();reflector=null;}
  if(!low){const s=host.getBoundingClientRect();reflector=new Reflector(new THREE.PlaneGeometry(FL_W,FL_L),{clipBias:.003,textureWidth:Math.max(256,s.width*.5),textureHeight:Math.max(256,s.height*.5),color:0xb8b4c4,multisample:0});
   keep(reflector.geometry);reflector.rotation.x=-Math.PI/2;reflector.position.set(0,-.001,FL_Z);reflector.renderOrder=-3;scene.add(reflector);
   const before=reflector.onBeforeRender;reflector.onBeforeRender=function(...a){if(scene.overrideMaterial)return;
    /* a still camera sees the same reflection: redraw it only every third frame then */
    if(idle&&mirrorTick%3!==0)return;const v=skipInMirror.map(o=>o.visible);skipInMirror.forEach(o=>o.visible=false);
    before.apply(this,a);skipInMirror.forEach((o,i)=>o.visible=v[i]);};
   floorMat.transparent=true;floorMat.opacity=.66;floorMat.depthWrite=true;H.inlayMat.transparent=true;H.inlayMat.opacity=.82;}
  else{floorMat.transparent=false;floorMat.opacity=1;H.inlayMat.transparent=false;H.inlayMat.opacity=1;}
  floorMat.needsUpdate=true;H.inlayMat.needsUpdate=true;
  if(dust){scene.remove(dust);dust.geometry.dispose();dust.material.dispose();}dust=makeDust(low?1200:4200);scene.add(dust);
  if(composer){composer.passes.forEach(p=>p.dispose?.());composer.dispose();composer=null;bloom=null;grade=null;vol=null;}
  /* both tiers go through the composer: the scene (MSAA on the full tier), light in the air, then bloom and grading on the full tier */
  { const size=renderer.getDrawingBufferSize(new THREE.Vector2());
   composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.HalfFloatType}));
   for(const t of [composer.renderTarget1,composer.renderTarget2])t.depthTexture=new THREE.DepthTexture(size.x,size.y);
   /* with SMAA the passes swap an odd number of times on the full tier, so the scene lands in either target: both get MSAA */
   if(!low){composer.renderTarget1.samples=4;composer.renderTarget2.samples=4;}
   composer.addPass(new RenderPass(scene,camera));
   vol=new VolumetricPass({camera,light:H.sun,box:{min:[-14.5,0,-17.4],max:[14.5,38,40]},scale:low?.25:.5,steps:low?24:48});composer.addPass(vol);if(aoUni)vol.setVolumes(aoUni);
   if(!low){bloom=new UnrealBloomPass(new THREE.Vector2(512,512),.5,.65,.85);composer.addPass(bloom);grade=new ShaderPass(GRADE);composer.addPass(grade);}
   /* SMAA last, on the display-encoded image: thin gilt ribs and coffer edges stay clean (on top of MSAA on the full tier) */
   composer.addPass(new OutputPass());composer.addPass(new SMAAPass(size.x,size.y));}
  resize(true);queuePaint();}

 /* ---- view ---- */
 let viewWidth=0,viewHeight=0;
 function resize(force=false){const r=host.getBoundingClientRect();const w=Math.max(2,r.width),h=Math.max(2,r.height);
  if(!force&&w===viewWidth&&h===viewHeight)return;
  viewWidth=w;viewHeight=h;renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.fov=w/h<1.45?52:44;camera.updateProjectionMatrix();
  if(composer){composer.setSize(w,h);}
  if(reflector){const pr=renderer.getPixelRatio();reflector.getRenderTarget().setSize(Math.round(w*pr*.5),Math.round(h*pr*.5));}
  if(dust)dust.material.uniforms.uScale.value=h/700*renderer.getPixelRatio();}
 const pointer={x:0,y:0,down:false,sx:0,sy:0,yaw0:0,pitch0:0,moved:0};
 const onMove=e=>{const r=host.getBoundingClientRect();
  if(!pointer.down||!pointer.freeLook){pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=((e.clientY-r.top)/r.height)*2-1;}
  if(pointer.down&&e.pointerId===pointer.id){const dx=(e.clientX-pointer.sx)/r.width,dy=(e.clientY-pointer.sy)/r.height;pointer.moved=Math.max(pointer.moved,Math.abs(dx)+Math.abs(dy));
   if(pointer.freeLook){view.freeYaw=pointer.yaw0-dx*4;view.freePitch=THREE.MathUtils.clamp(pointer.pitch0+dy*3,-1.45,1.45);}
   else if(pointer.pan){
    screenRight.setFromMatrixColumn(camera.matrixWorld,0);
    travel.addScaledVector(screenRight,(pointer.lastX-e.clientX)*20/r.width);
    travel.y+=(e.clientY-pointer.lastY)*14/r.height;
    pointer.lastX=e.clientX;pointer.lastY=e.clientY;
   }
   else{view.dragYaw=THREE.MathUtils.clamp(pointer.yaw0-dx*.9,-.26,.26);view.dragPitch=THREE.MathUtils.clamp(pointer.pitch0+dy*1.1,-.62,.12);}}};
 const clearPointerFocus=()=>{delete canvas.dataset.pointerFocus;heldKeys.clear();};
 canvas.addEventListener('blur',clearPointerFocus);
 const onDown=e=>{if(pointer.down||![0,1,2].includes(e.button))return;e.preventDefault();canvas.dataset.pointerFocus="";canvas.focus({preventScroll:true});covers.point(null);pointer.down=true;pointer.id=e.pointerId;pointer.moved=0;pointer.sx=e.clientX;pointer.sy=e.clientY;pointer.freeLook=e.button===2;pointer.yaw0=pointer.freeLook?view.freeYaw:view.dragYaw;pointer.pitch0=pointer.freeLook?view.freePitch:view.dragPitch;pointer.pan=e.button===0;pointer.lastX=e.clientX;pointer.lastY=e.clientY;dragMoved=false;canvas.classList.add('is-dragging');canvas.setPointerCapture?.(e.pointerId);};
 const onUp=e=>{if(!pointer.down||e.pointerId!==pointer.id)return;pointer.down=false;dragMoved=pointer.moved>.012;canvas.classList.remove('is-dragging');if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
 const onContextMenu=e=>e.preventDefault();
 canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onUp);canvas.addEventListener('lostpointercapture',onUp);canvas.addEventListener('contextmenu',onContextMenu);
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
 function pick(x,y){const r=canvas.getBoundingClientRect();ndc.set(((x-r.left)/r.width)*2-1,-((y-r.top)/r.height)*2+1);ray.setFromCamera(ndc,camera);
  const hit=ray.intersectObject(face,false)[0];
  const cover=!pointer.down&&ray.intersectObjects(covers.group.children,false)[0];
  covers.point(cover&&(!hit||cover.distance<hit.distance)?cover:null);
  if(!hit||!hit.uv)return null;const point=stele.worldToLocal(hit.point.clone());const lx=hit.uv.x*FW,ly=(1-hit.uv.y)*FH;
  if(ly<RULE_Y){const b=(state.band||[]).find(b=>Math.abs(lx-b.x)<b.w/2);if(b){const key=b.kind+b.month+b.dir;if(key!==lastHoverKey){lastHoverKey=key;state.hoverMonth=b;queuePaint();}}else if(lastHoverKey){lastHoverKey='';state.hoverMonth=null;queuePaint();}return b?{band:b}:null;}
  if(lastHoverKey){lastHoverKey='';state.hoverMonth=null;queuePaint();}
  const e=state.layout?.entries.find(e=>lx>=e.x&&lx<e.x+COL_W&&ly>=e.y-6&&ly<e.y+e.box.h);return {entry:e||null,point};}

 /* intro: from the far end of the nave looking up into the dome, a slow push that tilts down to the stone */
 const INTRO=reduced?0:7.2;let introT=reduced?1:0,introStart=0,introTween;
 function intro(){if(reduced){introT=1;introDone=true;return;}introStart=performance.now();
  if(gsap){const o={t:0};introTween=gsap.to(o,{t:1,duration:INTRO,ease:'power2.inOut',onUpdate:()=>{introT=o.t;},onComplete:()=>{introDone=true;}});}}
 const ease=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
 const tmpDir=new THREE.Vector3(),tmpPos=new THREE.Vector3(),eul=new THREE.Euler(0,0,0,'YXZ');
 const heldKeys=new Set(),walkKeys=new Set(['KeyW','KeyA','KeyS','KeyD']),motion=new THREE.Vector3(),level=new THREE.Vector3();
 function moveKey(code,pressed,repeat=false){
  if(!walkKeys.has(code))return false;
  if(!pressed)heldKeys.delete(code);else if(active&&!repeat)heldKeys.add(code);
  return true;
 }
 function updateCamera(dt){if(!gsap&&!introDone&&introStart){introT=Math.min(1,(performance.now()-introStart)/1000/INTRO);if(introT>=1)introDone=true;}
  const k=gsap?introT:ease(introT);
  view.pos.lerpVectors(START.pos,END.pos,k);view.pos.y+=Math.sin(k*Math.PI)*.5;view.look.lerpVectors(START.look,END.look,k);
  if(view.read&&introDone){const r=view.read;view.pos.set(THREE.MathUtils.clamp(r.x*.92,-5,5),THREE.MathUtils.clamp(r.y+.05,2.2,4.4),5.2);view.look.set(r.x,r.y,0);}
  const settle=introDone?1:Math.max(0,(k-.7)/.3);
  view.yawT=-pointer.x*.06*settle+view.dragYaw+view.freeYaw;view.pitchT=THREE.MathUtils.clamp(-pointer.y*.035*settle-view.dragPitch-view.freePitch,-1.5,1.5);view.pxT=pointer.x*.3*settle;
  const a=reduced?1:1-Math.exp(-dt*2.6);view.yaw+=(view.yawT-view.yaw)*a;view.pitch+=(view.pitchT-view.pitch)*a;view.px+=(view.pxT-view.px)*a;
  if(view.smoothPos){const follow=reduced?1:1-Math.exp(-dt*2.2);view.smoothPos.lerp(view.pos,follow);view.smoothLook.lerp(view.look,follow);}else{view.smoothPos=view.pos.clone();view.smoothLook=view.look.clone();}
  tmpDir.copy(view.smoothLook).sub(view.smoothPos).normalize();
  eul.set(view.pitch,view.yaw,0);tmpDir.applyEuler(eul);
  motion.copy(tmpDir).multiplyScalar(walk.step(dt));
  const forward=Number(heldKeys.has('KeyW'))-Number(heldKeys.has('KeyS'));
  const right=Number(heldKeys.has('KeyD'))-Number(heldKeys.has('KeyA'));
  if(forward||right){
   level.set(tmpDir.x,0,tmpDir.z).normalize();
   const speed=6*dt/Math.hypot(forward,right);
   motion.x+=(level.x*forward-level.z*right)*speed;
   motion.z+=(level.z*forward+level.x*right)*speed;
  }
  travel.add(motion);
  camera.position.copy(view.smoothPos).add(travel);camera.position.x+=view.px;
  const {x,z}=camera.position,ground=torchGroundHeight(x,z);
  if(motion.x||motion.z)camera.position.y+=ground-torchGroundHeight(x-motion.x,z-motion.z);
  keepTorchCameraAboveFloor(camera.position,ground);travel.y=camera.position.y-view.smoothPos.y;
  camera.lookAt(tmpPos.copy(camera.position).add(tmpDir));
 }
 function lookAtFocus(){placeGlow();if(glow.userData.on&&glow.userData.world)setRead(glow.userData.world);}
 function setRead(p){
  if(!p){view.read=null;return;}
  const from=camera.position.clone(),look=camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(5).add(from);
  resetView();view.smoothPos=from;view.smoothLook=look;
  view.read=new THREE.Vector3(THREE.MathUtils.clamp(p.x,-5.2,5.2),THREE.MathUtils.clamp(p.y,2.2,4.6),0);
 }
 function resetView(){
  heldKeys.clear();
  view.read=null;view.dragYaw=view.dragPitch=view.freeYaw=view.freePitch=view.px=0;
  view.yaw=view.pitch=0;pointer.x=pointer.y=0;travel.set(0,0,0);walk.reset();
  introTween?.kill();introT=1;introDone=true;view.smoothPos=null;
 }

 /* ---- loop ---- */
 let idle=false,mirrorTick=0;
 function draw(){if(composer)composer.render();else renderer.render(scene,camera);}
 function frame(now){raf=0;if(!active)return;
  /* idle: when the camera has settled (no intro, no drag, no walk-up in progress) the scene only drifts slowly, so 30 fps is enough;
     the light tier is always 30 */
  { const cp=camera.position,cm=frame.cam||(frame.cam=new THREE.Vector3(1e9,0,0)),moving=cm.distanceToSquared(cp)>1e-6||Math.abs((frame.yaw||0)-view.yaw)>1e-5||!introDone||pointer.down;
    cm.copy(cp);frame.yaw=view.yaw;if(moving)frame.moveAt=now;idle=now-(frame.moveAt||0)>1500;}
  if((tier==='low'||idle)&&now-(frame.lastDraw||0)<31){raf=requestAnimationFrame(frame);return;}frame.lastDraw=now;mirrorTick++;
  const dt=Math.min(.1,(now-last)/1000);last=now;
  const time=now/1000;H.update(time,dt,renderer);if(H.shadowDirty())renderer.shadowMap.needsUpdate=true;if(aoUni)aoUni.uTorchLevel.value=H.state.torch*(H.state.flicker||1);if(vol)vol.strength=H.state.beam*(H.state.moon?.8:1);const day=Math.min(1,H.state.skyI/1.1);scene.environmentIntensity=.2+.8*day;
  if(dust){const u=dust.material.uniforms,L=H.sun;u.uTime.value=time;u.uBase.value=.05+H.state.torch*.06;
   u.uHasShadow.value=L.castShadow&&L.shadow.map?1:0;if(L.shadow.map){u.tShadow.value=L.shadow.map.texture;u.shadowMatrix.value.copy(L.shadow.matrix);}
   u.uLight.value.copy(L.color);u.uLit.value=Math.min(1.6,L.intensity*(H.state.moon?1.25:.45));}if(grade)grade.uniforms.uTime.value=time%97;
  auraU.uTime.value=time;auraU.uI.value=.12+.88*H.state.torch;
  /* each quarter of the stele breathes on its own: slow, overlapping swells */
  { const L=auraU.uLv.value,b=breathPhase;for(let i=0;i<4;i++){const v=.5+.5*Math.sin(time*.23*b[i][2]+b[i][0]),w=.5+.5*Math.sin(time*.13*b[i][2]+b[i][1]);L.setComponent(i,Math.pow(Math.min(1,v*.75+w*.45),2.2));}
    if(aoUni)aoUni.uSteleLevels.value.copy(L).multiplyScalar(auraU.uI.value);}motes.material.uniforms.uPx.value=renderer.domElement.height/520;
  if(glow.userData.on){const p=(now-glow.userData.t0)/1000;const o=Math.min(1,p/1.2)*(.42+.1*Math.sin(p*1.6));glow.material.opacity=o;glowLight.intensity=o*2.2;}else{glow.material.opacity*=.9;glowLight.intensity*=.9;}
  updateCamera(dt);
  const p=camera.position,outside=Math.max(Math.abs(p.x)-HALL.AX,p.z-HALL.NZ1,HALL.BACK-p.z,p.y-29);
  const outdoor=THREE.MathUtils.smoothstep(outside,-.6,14);
  const night=1-THREE.MathUtils.smoothstep(H.state.el,-13,1);
  scene.fog.color.lerp(haze.copy(hazeDay).lerp(hazeNight,night),outdoor);
  scene.fog.density=THREE.MathUtils.lerp(scene.fog.density,.00135,outdoor);
  courtyard.update(camera,H.state);covers.update(time,dt);draw();
  if(onFirstFrame&&!renderer.getContext().isContextLost()){onFirstFrame();onFirstFrame=null;}
  /* slow frames on the full tier for ~3 s after the intro: switch to the light tier (only in auto mode) */
  if(introDone&&tier==='high'&&autoTier){frames++;if(dt>.045)slow++;if(frames>=180){if(slow>120){setTier('low',true);}frames=0;slow=0;}}
  raf=requestAnimationFrame(frame);}
 let autoTier=(()=>{try{return !localStorage.getItem(QUALITY_KEY)||localStorage.getItem(QUALITY_KEY)==='auto';}catch{return true;}})();
 function setActive(on){if(disposed)return;active=!!on&&ready;if(!active)heldKeys.clear();if(active&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}if(!active&&raf){cancelAnimationFrame(raf);raf=0;}}
 function suspend(){
  setActive(false);covers.clear();
  const needsPaint=!!(paintQueued||lastHoverKey);
  if(paintQueued){cancelAnimationFrame(paintQueued);paintQueued=0;}
  lastHoverKey='';
  if(pointer.down)onUp({pointerId:pointer.id});
  pointer.x=pointer.y=0;dragMoved=false;
  if(!onFirstFrame&&!introDone){introTween?.kill();introT=1;introDone=true;view.smoothPos=null;}
  return needsPaint;
 }
 function setTier(next,auto=false){if(next===tier)return;tier=next;if(!auto)autoTier=false;applyTier();scene.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];ms.forEach(m=>m.needsUpdate=true);});onTier?.();}
 let disposed=false,ready=false,compilePoll=0;
 function dispose(){covers.clear();disposed=true;active=false;if(raf)cancelAnimationFrame(raf);raf=0;if(paintQueued)cancelAnimationFrame(paintQueued);
  if(compilePoll)clearTimeout(compilePoll);introTween?.kill();
  canvas.removeEventListener('blur',clearPointerFocus);
  canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onUp);canvas.removeEventListener('lostpointercapture',onUp);canvas.removeEventListener('contextmenu',onContextMenu);
  if(composer){composer.passes.forEach(p=>p.dispose?.());composer.dispose?.();}
  if(reflector){reflector.getRenderTarget().dispose();reflector.material.dispose();}
  if(dust){dust.geometry.dispose();dust.material.dispose();}
  scene.traverse(o=>{if(o.isMesh||o.isPoints||o.isInstancedMesh){o.geometry?.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(!m)return;for(const k in m){const v=m[k];if(v&&v.isTexture)v.dispose();}m.dispose();});}
   if(o.isLight&&o.shadow?.map)o.shadow.map.dispose();});
  for(const o of bag){try{o.dispose?.();}catch{}}bag.clear();
  for(const k of ['map','emissive','rough','mask','t1','t2']){faces[k].width=faces[k].height=1;}
  renderer.renderLists.dispose();renderer.dispose();if(!renderer.getContext().isContextLost())renderer.forceContextLoss();}

 /* ambient occlusion from the baked volume (without a bake the page shows the simple list; tools/torch-bake.cjs works it out offline) */
 await slice(true);
 let aoUni=null;{ const t0=performance.now(),vols=bakedAO();if(vols){const r=applyAO(scene,vols);r.textures.forEach(keep);aoUni=r.uniforms;}
  aoInfo={baked:!!bakedAO(),ms:Math.round(performance.now()-t0),bake:bakeInfo};}
 applyTier();
 await slice(true);
 ensureFaceSize();
 await slice(true);
 paintFace();
 await slice(true);
 async function prepare(onReady,{alive:live=()=>true,onProgress:step=()=>{}}={}){
  if(window.__TORCH_BAKE)return;
  /* a few objects per slice (each compile of a new material links its program), the thread handed back in between;
     the bundled r168 readiness check is then polled by this route */
  const list=[];scene.traverse(o=>{if(o.material)list.push(o);});
  for(let i=0;i<list.length;){const until=performance.now()+12;
   while(i<list.length&&performance.now()<until)renderer.compile(list[i++],camera,scene);
   step(i/list.length*.9);await yieldMain();if(disposed||!live())return;}
  renderer.compile(scene,camera);
  const programs=renderer.info.programs.slice();
  const poll=()=>{
   if(disposed||!live())return;
   if(programs.some(program=>!program.isReady())){compilePoll=setTimeout(poll,10);return;}
   ready=true;onReady();
  };
  poll();
 }
 return {get tier(){return tier;},moveKey,clearKeys:()=>heldKeys.clear(),clearCoverHover:()=>covers.point(null),loadCovers:covers.load,prepare,intro,setActive,suspend,setTier,resize,pick,dispose,paintFace:()=>queuePaint(),lookAtFocus,setRead,resetView,walkBy:(delta,mode)=>walk.wheel(delta,mode),reading:()=>!!view.read,dragged:()=>dragMoved,debug:{renderer,scene,camera,sun:H.sun,courtyard,covers,buildMs,torchPoints:H.torchPoints,steleEmit,get ao(){return aoInfo;}}};
}
