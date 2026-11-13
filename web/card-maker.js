/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-13 (user: Card Wall) the card maker. Clicking an empty Toploader opens it: pick a work (a plain library-like
   grid with search) -> that work's wall of CONFIRMED unlocked pictures (game CGs, MeguLit's own shots, the cover; only
   what cards_unlocked returns, the front end never looks at game files, so nothing is spoiled) -> a viewfinder in the
   card's own shape (drag to pan, wheel / pinch to zoom, rubber band and spring back) that picks the still view ->
   "print" the card (the face forms, it turns to show the crest back, turns home) -> cards_create + cards_insert ->
   'megulit:cards-changed' so the wall plays its insert animation.
   Motion: the sheet grows out of the clicked Toploader (shared element), each level pushes into the next with the
   chosen cover / CG flying into place, everything is spring driven, interruptible, transform/opacity only, and
   prefers-reduced-motion turns it into short cross-fades.
   still = {x, y, scale}: x/y is the centre of the visible window as a fraction (0..1) of the picture, scale is the zoom
   over the "cover" fit of the card frame (1 = the picture just covers the card). stillRect() maps it to a frame. */
import {fitLibraryGrid} from './library-grid-fit.js';
import {crestGlyph} from './detail-flip.js';

/* backend (services/card-wall.cjs): the card face is 600x800, 3:4; still scale 1 = the largest 3:4 window in the picture */
export const CARD_RATIO=3/4;
export const MAX_ZOOM=4;

/* ---------- pure helpers (tested in validation/card-maker.test.cjs) ---------- */
export function springCurve({stiffness=260,damping=28,mass=1,velocity=0}={},dt=1/240){
 const points=[];let x=0,v=velocity,t=0;
 while(t<4){const a=(-stiffness*(x-1)-damping*v)/mass;v+=a*dt;x+=v*dt;t+=dt;points.push(x);if(t>.05&&Math.abs(1-x)<5e-4&&Math.abs(v)<5e-3)break;}
 points[points.length-1]=1;return {points,duration:Math.round(t*1000)};
}
/* a CSS linear() easing that follows the spring, so plain WAAPI animations get spring physics */
export function springEasing(opts){
 const {points,duration}=springCurve(opts),n=points.length,count=Math.min(64,n),out=['0'];
 for(let i=1;i<count;i++){const k=Math.round(i/count*(n-1));out.push(`${+points[k].toFixed(4)} ${(k/(n-1)*100).toFixed(2)}%`);}
 out.push('1');return {easing:`linear(${out.join(',')})`,duration};
}
export const SPRING={snappy:{stiffness:420,damping:38},smooth:{stiffness:260,damping:30},bouncy:{stiffness:300,damping:22},soft:{stiffness:170,damping:24}};

/* the part of the picture the card shows at zoom 1, as fractions of the picture */
export function windowSize(w,h,scale=1,ratio=CARD_RATIO){
 const img=(w>0&&h>0)?w/h:1,z=Math.max(1e-6,scale);
 return img>ratio?{w:ratio/img/z,h:1/z}:{w:1/z,h:img/ratio/z};
}
export function clampStill(w,h,still={},ratio=CARD_RATIO){
 const num=(v,d)=>Number.isFinite(+v)?+v:d;
 const scale=Math.min(MAX_ZOOM,Math.max(1,num(still.scale,1))),win=windowSize(w,h,scale,ratio);
 const c=(v,half)=>Math.min(1-half,Math.max(half,num(v,.5)));
 return {x:+c(still.x,win.w/2).toFixed(5),y:+c(still.y,win.h/2).toFixed(5),scale:+scale.toFixed(4)};
}
/* where the picture sits inside a frame of fw x fh for a still (left/top relative to the frame) */
export function stillRect(w,h,fw,fh,still={}){
 const base=Math.max(fw/w,fh/h),s=base*(Number(still.scale)||1),W=w*s,H=h*s;
 return {left:fw/2-(Number.isFinite(+still.x)?+still.x:.5)*W,top:fh/2-(Number.isFinite(+still.y)?+still.y:.5)*H,width:W,height:H,base};
}
export function normalizeName(s){
 return String(s||'').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s・·\-_:：!！?？~〜「」『』【】()（）\[\]]/g,'');
}
export function gameNames(g){
 return [g?.title,g?.name,g?.titleJa,g?.titleZh,g?.titleEn,g?.originalTitle,g?.translatedTitle,...(Array.isArray(g?.aliases)?g.aliases:[]),...(Array.isArray(g?.names)?g.names:[])].filter(Boolean).map(String);
}
export function filterGames(games,query){
 const q=normalizeName(query);if(!q)return games.slice();
 return games.filter(g=>gameNames(g).some(n=>normalizeName(n).includes(q)));
}
/* game CGs (from saves or seen on screen) first, then MeguLit shots, then the cover; nothing else is shown */
export function groupUnlocked(items){
 const groups={cg:[],shot:[],cover:[]};
 for(const it of Array.isArray(items)?items:[]){if(!it||!it.src)continue;const kind=it.kind==='shot'||it.source==='shot'?'shot':it.kind==='cover'||it.source==='cover'?'cover':it.kind==='cg'?'cg':null;if(kind)groups[kind].push(it);}
 return ['cg','shot','cover'].map(kind=>({kind,items:groups[kind]})).filter(g=>g.items.length);
}
const list=r=>Array.isArray(r)?r:Array.isArray(r?.items)?r.items:Array.isArray(r?.games)?r.games:[];

/* ---------- words ---------- */
const WORDS={
 zh:{title:'制作收藏卡',games:'选择作品',search:'搜索作品名（中文 / 日文 / 英文）',noGames:'还没有可以做卡的作品。玩一会儿游戏，或在游戏库添加带封面的作品后再来',noMatch:'没有匹配的作品',
  count:'{n} 张可用',cgEmpty:'还没有解锁的 CG，玩到后会出现在这里；也可以用封面或截图做卡',groups:{cg:'游戏 CG',shot:'我的截图',cover:'封面'},src:{save:'存档已解锁',seen:'游戏中见过',shot:'MeguLit 截图',cover:'作品封面'},
  hover:'悬停预览：卡在卡套里静止显示这个取景，鼠标悬停时从这里开始缓慢移动',hoverShort:'悬停试试',frame:'取景',hint:'拖动平移 · 滚轮或双指缩放 · 双击复原',front:'正面',back:'卡背',make:'生成并放入卡套',only:'只做卡，放进「我的卡」',makeOnly:'生成卡',printing:'正在印卡…',fail:'没能生成这张卡：{e}',back_:'返回',close:'关闭',loading:'正在读取…',pendingNote:'还有 {n} 张存档 CG 正在解码，好了会自动出现',reset:'复原'},
 ja:{title:'コレクションカードを作る',games:'作品を選ぶ',search:'作品名で検索（日本語 / 中国語 / 英語）',noGames:'カードにできる作品がまだありません。少し遊ぶか、カバー付きの作品をライブラリに追加してください',noMatch:'一致する作品がありません',
  count:'{n} 枚使えます',cgEmpty:'解放済みの CG はまだありません。プレイすると出てきます。カバーやスクリーンショットでも作れます',groups:{cg:'ゲーム CG',shot:'スクリーンショット',cover:'カバー'},src:{save:'セーブで解放済み',seen:'ゲーム中に表示',shot:'MeguLit の撮影',cover:'作品カバー'},
  hover:'ホバーで動きを確認：スリーブ内ではこの構図で止まり、ホバーするとここからゆっくり動きます',hoverShort:'ホバー',frame:'構図',hint:'ドラッグで移動 · ホイール／ピンチで拡大 · ダブルクリックで戻す',front:'表',back:'裏',make:'作ってスリーブに入れる',only:'作るだけ（マイカードへ）',makeOnly:'カードを作る',printing:'印刷中…',fail:'カードを作れませんでした：{e}',back_:'戻る',close:'閉じる',loading:'読み込み中…',pendingNote:'セーブの CG を {n} 枚デコード中です。終わると自動で表示されます',reset:'戻す'},
 en:{title:'Make a collector card',games:'Choose a work',search:'Search titles (Chinese / Japanese / English)',noGames:'No work has pictures for a card yet. Play for a while, or add a work with a cover to the library',noMatch:'No matching work',
  count:'{n} available',cgEmpty:'No unlocked CGs yet; they appear here once you reach them. You can also use the cover or a screenshot',groups:{cg:'Game CGs',shot:'My screenshots',cover:'Cover'},src:{save:'Unlocked in saves',seen:'Seen in game',shot:'MeguLit shot',cover:'Cover'},
  hover:'Hover to preview: in the Toploader the card rests on this framing and drifts from here on hover',hoverShort:'hover',frame:'Framing',hint:'Drag to pan · wheel or pinch to zoom · double-click to reset',front:'Front',back:'Back',make:'Make and sleeve it',only:'Just make it (My cards)',makeOnly:'Make card',printing:'Printing…',fail:'Could not make this card: {e}',back_:'Back',close:'Close',loading:'Loading…',pendingNote:'{n} CGs from your saves are still being decoded; they appear here when ready',reset:'Reset'}};
const lang=()=>{const l=(document.documentElement.lang||'zh').toLowerCase();return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const ICON={back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
 search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'};

/* ---------- the service ---------- */
function serviceApi(){
 const t=typeof window!=='undefined'&&(window.__TOME_TEST_TRANSPORT__||window.__TAURI_INTERNALS__?.invoke);
 if(window.__MEGULIT_CARDS_MOCK__||!t)return mockApi;
 return (action,params={})=>t('service',{request:{action,...params}});
}
/* dev / preview data used only without a desktop bridge (headless previews) */
const mockSvg=(a,b,label,w=1600,h=900)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="r" cx=".7" cy=".3" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#r)"/><circle cx="${w*.32}" cy="${h*.62}" r="${Math.min(w,h)*.22}" fill="#fff" fill-opacity=".18"/><path d="M0 ${h*.8} Q ${w*.3} ${h*.6} ${w*.6} ${h*.78} T ${w} ${h*.7} V ${h} H 0Z" fill="#000" fill-opacity=".22"/><text x="50%" y="52%" text-anchor="middle" font-family="serif" font-size="${Math.min(w,h)*.12}" fill="#fff" fill-opacity=".85">${label}</text></svg>`);
const MOCK_GAMES=[['g1','ATRI -My Dear Moments-','ATRI','#4a7fb5','#f2c6a0',['ATRI -My Dear Moments-','亚托莉']],['g2','サクラノ詩','サ','#d98aa8','#3a2240',['樱之诗','Sakura no Uta']],['g3','白昼夢の青写真','白','#86a8c8','#e9e2d0',['白日梦的构想图','Hakuchuumu']],['g4','金色ラブリッチェ','金','#e5b84a','#7b2a3a',['金色Loveriche','Kin-iro Loveriche']],['g5','魔女こいにっき','魔','#5b3f8f','#f0a7c8',['魔女恋日记','Majo Koi Nikki']],['g6','千恋＊万花','千','#c03a4a','#f6d7b0',['千恋万花','Senren Banka']],['g7','Summer Pockets','S','#57b3d6','#fbe7a6',['夏日口袋']],['g8','ノラと皇女と野良猫ハート','ノ','#e6845f','#2f3a5a',['野良与皇女与流浪猫之心','Nora to Oujo']],['g9','素晴らしき日々','素','#2c3e50','#bdc3c7',['美好的每一天','Subahibi']]];
const mockState={toploaders:[],cards:[],mode:'a'};
async function mockApi(action,p={}){
 await new Promise(r=>setTimeout(r,action==='cards_create'?650:160));
 const game=MOCK_GAMES.find(g=>g[0]===p.gameId);
 if(action==='cards_games')return MOCK_GAMES.map(([id,title,,a,b,aliases],i)=>({gameId:id,title,aliases,cover:mockSvg(a,b,title.slice(0,8),600,800),unlockedCount:i===8?1:3+i%5}));
 if(action==='cards_unlocked'){if(!game)return [];const [id,title,,a,b]=game;if(id==='g9')return [{id:id+'-cover',kind:'cover',src:mockSvg(a,b,title.slice(0,8),600,800),w:600,h:800,source:'cover'}];
  const out=[];for(let i=0;i<4+(id.charCodeAt(1)%3);i++)out.push({id:`${id}-cg${i}`,kind:'cg',src:mockSvg(i%2?b:a,i%2?a:b,'CG '+(i+1)),w:1600,h:900,source:i%3?'save':'seen'});
  out.push({id:id+'-shot0',kind:'shot',src:mockSvg('#222',a,'SHOT'),w:1600,h:900,source:'shot'},{id:id+'-cover',kind:'cover',src:mockSvg(a,b,title.slice(0,8),600,800),w:600,h:800,source:'cover'});return out;}
 if(action==='cards_create'){const card={id:'c'+Date.now(),gameId:p.gameId,title:game?.[1]||'',initial:game?.[2]||'M',kind:p.kind,src:p.__src||'',w:p.__w||1600,h:p.__h||900,still:p.still,createdAt:Date.now()};mockState.cards.push(card);return card;}
 if(action==='cards_insert'){return mockState;}
 if(action==='cards_pending')return {pending:0};
 if(action==='cards_image'){const it=(await mockApi('cards_unlocked',{gameId:p.gameId})).find(x=>x.id===p.srcId);return it?{id:it.id,src:it.src,w:it.w,h:it.h}:null;}
 return mockState;
}

/* ---------- motion ---------- */
function stopAnims(el){for(const a of el.getAnimations?.()||[]){try{a.commitStyles();}catch{}a.cancel();}}
function play(el,frames,{spring,duration,easing,delay=0,fill='both'}={}){
 if(!el)return null;stopAnims(el);
 if(reduced()){const last=frames[frames.length-1]||{};const f=[{opacity:frames[0]?.opacity??getComputedStyle(el).opacity},{opacity:last.opacity??1}];return el.animate(f,{duration:160,easing:'ease-out',fill,delay:0});}
 const s=spring?springEasing(spring):null;
 return el.animate(frames,{duration:s?.duration??duration??260,easing:s?.easing??easing??'cubic-bezier(.2,.8,.2,1)',delay,fill});
}
/* a shared-element flight from one rect to another: the outer box scales (and clips), the picture inside is counter
   scaled every frame so it keeps its shape. Spring sampled frame by frame. */
function flight(from,to,{src,spring=SPRING.smooth,radius=10,fadeOut=false}={}){
 const box=document.createElement('div');box.className='cm-flight';
 Object.assign(box.style,{left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px',borderRadius:radius+'px'});
 const img=document.createElement('img');img.src=src;img.alt='';box.append(img);document.body.append(box);
 if(reduced()){box.remove();return Promise.resolve();}
 const {points,duration}=springCurve(spring),n=Math.min(48,points.length-1),outer=[],inner=[];
 for(let i=0;i<=n;i++){const p=i?points[Math.round(i/n*(points.length-1))]:0,offset=i/n;
  const w=from.width+(to.width-from.width)*p,h=from.height+(to.height-from.height)*p,x=from.left+(to.left-from.left)*p,y=from.top+(to.top-from.top)*p,sx=Math.max(.001,w/to.width),sy=Math.max(.001,h/to.height),k=Math.max(sx,sy);
  outer.push({offset,transform:`translate(${(x-to.left).toFixed(2)}px,${(y-to.top).toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`});
  inner.push({offset,transform:`scale(${(k/sx).toFixed(4)},${(k/sy).toFixed(4)})`});}
 box.animate(outer,{duration,fill:'both'});img.animate(inner,{duration,fill:'both'});
 const done=new Promise(r=>setTimeout(r,Math.round(duration*.62)));
 return done.then(()=>{const fade=box.animate([{opacity:1},{opacity:0}],{duration:fadeOut?220:180,easing:'ease-out',fill:'forwards'});fade.finished.catch(()=>{}).then(()=>box.remove());});
}
const rectOf=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};};

/* ---------- styles ---------- */
let styled=false;
function ensureStyles(){
 if(styled||typeof document==='undefined')return;styled=true;
 const href=new URL('./card-maker.css',import.meta.url).href;
 if(![...document.styleSheets].some(s=>s.href===href)){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);}
}

/* ---------- the maker ---------- */
let current=null;
export function openCardMaker({toploaderId=null,from=null,api=null}={}){
 if(current)current.close(true);
 ensureStyles();
 const w=WORDS[lang()],call=api||serviceApi();
 const origin=(()=>{const el=from instanceof Element?from:toploaderId!=null?document.querySelector(`[data-toploader-id="${CSS.escape(String(toploaderId))}"],[data-toploader="${CSS.escape(String(toploaderId))}"]`):null;
  if(el)return rectOf(el);if(from&&Number.isFinite(from.left))return {left:from.left,top:from.top,width:from.width,height:from.height};return null;})();
 const returnFocus=document.activeElement;
 const root=document.createElement('div');root.className='cm-root';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',w.title);
 root.innerHTML=`<div class="cm-scrim" data-cm-close></div><section class="cm-sheet"><div class="cm-sheet-bg" aria-hidden="true"></div><div class="cm-content">
  <header class="cm-head"><button type="button" class="cm-icon cm-back" aria-label="${w.back_}" title="${w.back_}" hidden>${ICON.back}</button><div class="cm-heading"><span class="cm-eyebrow">${w.title}</span><h2 class="cm-title">${w.games}</h2></div><button type="button" class="cm-icon cm-x" aria-label="${w.close}" title="${w.close}" data-cm-close>${ICON.close}</button></header>
  <div class="cm-stage"></div><p class="cm-live" role="status" aria-live="polite"></p></div></section>`;
 document.body.append(root);
 const sheet=root.querySelector('.cm-sheet'),bg=root.querySelector('.cm-sheet-bg'),content=root.querySelector('.cm-content'),stage=root.querySelector('.cm-stage'),title=root.querySelector('.cm-title'),backBtn=root.querySelector('.cm-back'),scrim=root.querySelector('.cm-scrim'),live=root.querySelector('.cm-live');
 let level=0,layers=[],closing=false,printing=false,game=null,item=null,viewer=null,resolveDone;
 const finished=new Promise(r=>{resolveDone=r;});

 /* open: the sheet grows out of the Toploader; content follows a beat later */
 const sheetRect=rectOf(sheet);
 play(scrim,[{opacity:0},{opacity:1}],{duration:280,easing:'ease-out'});
 if(origin&&!reduced()){
  const {points,duration}=springCurve(SPRING.smooth),n=Math.min(48,points.length-1),f=[];
  for(let i=0;i<=n;i++){const p=i?points[Math.round(i/n*(points.length-1))]:0,x=origin.left+(sheetRect.left-origin.left)*p,y=origin.top+(sheetRect.top-origin.top)*p,sw=(origin.width+(sheetRect.width-origin.width)*p)/sheetRect.width,sh=(origin.height+(sheetRect.height-origin.height)*p)/sheetRect.height;
   f.push({offset:i/n,transform:`translate(${(x-sheetRect.left).toFixed(2)}px,${(y-sheetRect.top).toFixed(2)}px) scale(${Math.max(.01,sw).toFixed(4)},${Math.max(.01,sh).toFixed(4)})`});}
  bg.animate(f,{duration,fill:'both'});bg.animate([{opacity:.4},{opacity:1,offset:.25},{opacity:1}],{duration:duration*.6,fill:'both'});
  content.animate([{opacity:0,transform:'translateY(10px) scale(.985)'},{opacity:1,transform:'none'}],{duration:340,delay:duration*.28,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
 }else play(sheet,[{opacity:0,transform:'translateY(14px) scale(.98)'},{opacity:1,transform:'none'}],{spring:SPRING.smooth});

 function close(instant=false,result=null,handoff=false){
  if(closing)return finished;closing=true;viewer?.destroy();document.removeEventListener('keydown',onKey,true);
  const end=()=>{root.remove();if(current===api_)current=null;try{returnFocus?.focus?.({preventScroll:true});}catch{}resolveDone(result);};
  if(instant||reduced()){if(!instant){root.animate([{opacity:1},{opacity:0}],{duration:160,fill:'forwards'}).finished.then(end,end);}else end();return finished;}
  root.style.pointerEvents='none';
  play(content,[{opacity:1},{opacity:0}],{duration:140,easing:'ease-in'});
  const r=rectOf(sheet);
  /* after printing the card itself is the shared element: the sheet just dissolves under it */
  if(handoff){stopAnims(sheet);sheet.animate([{opacity:1},{opacity:0,transform:'scale(.985)'}],{duration:200,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
   scrim.animate([{opacity:getComputedStyle(scrim).opacity},{opacity:0}],{duration:420,easing:'ease-out',fill:'forwards'}).finished.then(end,end);return finished;}
  if(origin){const {points,duration}=springCurve(SPRING.snappy),n=Math.min(40,points.length-1),f=[];
   for(let i=0;i<=n;i++){const p=i?points[Math.round(i/n*(points.length-1))]:0,x=r.left+(origin.left-r.left)*p,y=r.top+(origin.top-r.top)*p,sw=(r.width+(origin.width-r.width)*p)/r.width,sh=(r.height+(origin.height-r.height)*p)/r.height;
    f.push({offset:i/n,transform:`translate(${(x-r.left).toFixed(2)}px,${(y-r.top).toFixed(2)}px) scale(${Math.max(.01,sw).toFixed(4)},${Math.max(.01,sh).toFixed(4)})`});}
   stopAnims(bg);bg.animate(f,{duration,fill:'forwards'});bg.animate([{opacity:1},{opacity:1,offset:.55},{opacity:0}],{duration,fill:'forwards'});
   scrim.animate([{opacity:getComputedStyle(scrim).opacity},{opacity:0}],{duration:duration*.9,easing:'ease-out',fill:'forwards'});setTimeout(end,duration);
  }else{stopAnims(sheet);sheet.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(12px) scale(.97)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
   scrim.animate([{opacity:1},{opacity:0}],{duration:240,fill:'forwards'}).finished.then(end,end);}
  return finished;
 }
 const api_={close,finished,root};current=api_;

 /* ---------- levels: push / pop ---------- */
 function setHead(text){title.textContent=text;backBtn.hidden=level===0;}
 function push(layer,{fly}={}){
  const old=layers[layers.length-1];layers.push(layer);level=layers.length-1;stage.append(layer);setHead(layer.dataset.title||'');
  if(old){old.inert=true;play(old,[{opacity:1,transform:'none'},{opacity:0,transform:'scale(.965)'}],{duration:340,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});}
  play(layer,[{opacity:0,transform:'translateY(8px) scale(1.02)'},{opacity:1,transform:'none'}],{spring:SPRING.smooth});
  fly?.();
 }
 function pop(){
  if(layers.length<2||printing)return;const top=layers.pop(),under=layers[layers.length-1];level=layers.length-1;
  if(top.classList.contains('cm-view')){viewer?.destroy();viewer=null;}
  under.inert=false;setHead(under.dataset.title||'');top.inert=true;
  play(top,[{opacity:1,transform:'none'},{opacity:0,transform:'scale(1.03)'}],{duration:200,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'})?.finished.then(()=>top.remove(),()=>top.remove());
  play(under,[{opacity:0,transform:'scale(.965)'},{opacity:1,transform:'none'}],{spring:SPRING.smooth});
  under.querySelector('.is-picked')?.focus({preventScroll:true});
 }
 backBtn.addEventListener('click',pop);
 root.addEventListener('click',e=>{if(e.target.closest('[data-cm-close]')&&!printing)close(false,null);});
 function onKey(e){if(e.key!=='Escape'||printing)return;e.preventDefault();e.stopPropagation();if(level>0)pop();else close(false,null);}
 document.addEventListener('keydown',onKey,true);

 /* ---------- level 0: works ---------- */
 const gamesLayer=document.createElement('div');gamesLayer.className='cm-layer cm-games';gamesLayer.dataset.title=w.games;
 gamesLayer.innerHTML=`<label class="cm-search">${ICON.search}<input type="search" placeholder="${esc(w.search)}" aria-label="${esc(w.search)}" autocomplete="off" spellcheck="false"></label><div class="cm-scroll"><div class="cm-grid cm-game-grid" role="list"></div><p class="cm-empty" hidden></p><div class="cm-skel" aria-hidden="true">${'<i></i>'.repeat(10)}</div></div>`;
 push(gamesLayer);
 const input=gamesLayer.querySelector('input'),grid=gamesLayer.querySelector('.cm-game-grid'),empty=gamesLayer.querySelector('.cm-empty');
 const unfit=fitLibraryGrid(grid);
 let allGames=[];
 const tile=(g,i)=>`<button type="button" class="cm-game" role="listitem" data-id="${esc(g.gameId)}" style="--i:${Math.min(i,18)}"><span class="cm-cover">${g.cover?`<img src="${esc(g.cover)}" alt="" loading="lazy" decoding="async">`:`<b class="cm-glyph">${esc(crestGlyph(g.title))}</b>`}</span><span class="cm-game-name" lang="ja">${esc(g.title)}</span><span class="cm-game-meta">${w.count.replace('{n}',Number(g.unlockedCount)||0)}</span></button>`;
 function renderGames(animate){
  const shown=filterGames(allGames,input.value);grid.innerHTML=shown.map(tile).join('');
  empty.hidden=!!shown.length;empty.textContent=allGames.length?w.noMatch:w.noGames;
  for(const img of grid.querySelectorAll('img'))img.addEventListener('load',()=>img.classList.add('is-in'),{once:true});
  if(animate&&!reduced())grid.querySelectorAll('.cm-game').forEach((el,i)=>{if(i<24)el.animate([{opacity:0,transform:'translateY(12px) scale(.97)'},{opacity:1,transform:'none'}],{...springEasing(SPRING.smooth),delay:Math.min(i,18)*22,fill:'backwards'});});
 }
 call('cards_games').then(r=>{allGames=list(r).filter(g=>g&&g.gameId!=null);gamesLayer.querySelector('.cm-skel')?.remove();renderGames(true);},e=>{gamesLayer.querySelector('.cm-skel')?.remove();empty.hidden=false;empty.textContent=w.fail.replace('{e}',String(e?.message||e));});
 let searchT=0;input.addEventListener('input',()=>{clearTimeout(searchT);searchT=setTimeout(()=>renderGames(false),60);});
 grid.addEventListener('click',e=>{const b=e.target.closest('.cm-game');if(b)openGame(b);});
 setTimeout(()=>input.focus({preventScroll:true}),origin?260:0);

 /* ---------- level 1: the work's unlocked pictures ---------- */
 function openGame(btn){
  const g=allGames.find(x=>String(x.gameId)===btn.dataset.id);if(!g)return;game=g;
  grid.querySelector('.is-picked')?.classList.remove('is-picked');btn.classList.add('is-picked');
  const layer=document.createElement('div');layer.className='cm-layer cm-cgs';layer.dataset.title=g.title;
  layer.innerHTML=`<div class="cm-scroll"><div class="cm-hero"><span class="cm-hero-cover">${g.cover?`<img src="${esc(g.cover)}" alt="">`:`<b class="cm-glyph">${esc(crestGlyph(g.title))}</b>`}</span><div><h3 lang="ja">${esc(g.title)}</h3><p class="cm-muted">${w.count.replace('{n}',Number(g.unlockedCount)||0)}</p></div></div><div class="cm-groups"><div class="cm-skel is-wide" aria-hidden="true">${'<i></i>'.repeat(6)}</div></div></div>`;
  const heroCover=layer.querySelector('.cm-hero-cover');
  push(layer,{fly:()=>{const img=btn.querySelector('img');if(!img)return;const from=rectOf(img);heroCover.style.opacity='0';
   requestAnimationFrame(()=>flight(from,rectOf(heroCover),{src:img.currentSrc||img.src,spring:SPRING.smooth,radius:6}).then(()=>{heroCover.style.opacity='';heroCover.animate([{opacity:0},{opacity:1}],{duration:160});}));}});
  const groups=layer.querySelector('.cm-groups');let shownOnce=false,lastCount=-1;
  /* backend: cards_unlocked answers at once; CGs still being decoded from the saves are counted by cards_pending, the
     wall asks again until none are left (new ones join without the others replaying their entrance) */
  const poll=async()=>{if(closing||!layer.isConnected)return;const pr=await call('cards_pending',{gameId:g.gameId}).catch(()=>null),n=Number(pr?.pending)||0;
   let note=layer.querySelector('.cm-pending');if(n>0){if(!note){note=document.createElement('p');note.className='cm-note cm-pending';groups.before(note);}note.textContent=w.pendingNote.replace('{n}',n);setTimeout(()=>{load().then(poll);},2500);}else{note?.remove();if(lastCount>=0)load();}};
  const load=()=>call('cards_unlocked',{gameId:g.gameId}).then(r=>{if(list(r).length===lastCount)return;lastCount=list(r).length;const first=!shownOnce;shownOnce=true;
   const sets=groupUnlocked(list(r));
   if(!sets.length){groups.innerHTML=`<div class="cm-empty-card"><span class="cm-empty-crest" aria-hidden="true">${esc(crestGlyph(g.title))}</span><p>${w.cgEmpty}</p></div>`;return;}
   const onlyFallback=!sets.some(s=>s.kind==='cg');
   groups.innerHTML=(onlyFallback?`<p class="cm-note">${w.cgEmpty}</p>`:'')+sets.map(s=>`<section class="cm-group"><h4>${w.groups[s.kind]}<span>${s.items.length}</span></h4><div class="cm-grid cm-cg-grid">${s.items.map((it,i)=>`<button type="button" class="cm-cg${(it.w||16)<(it.h||9)?' is-tall':''}" data-id="${esc(it.id)}" style="--i:${Math.min(i,14)}" aria-label="${esc(w.groups[s.kind]+' '+(i+1))}"><img src="${esc(it.src)}" alt="" loading="lazy" decoding="async"><span class="cm-tag">${esc(w.src[it.source]||w.groups[s.kind])}</span></button>`).join('')}</div></section>`).join('');
   const byId=new Map(list(r).map(it=>[String(it.id),it]));
   groups.querySelectorAll('img').forEach(img=>{const show=()=>img.classList.add('is-in');if(img.complete)show();else img.addEventListener('load',show,{once:true});});
   if(first&&!reduced())groups.querySelectorAll('.cm-cg').forEach((el,i)=>{if(i<20)el.animate([{opacity:0,transform:'translateY(14px) scale(.96)'},{opacity:1,transform:'none'}],{...springEasing(SPRING.smooth),delay:Math.min(i,14)*30,fill:'backwards'});});
   groups.onclick=e=>{const b=e.target.closest('.cm-cg');if(b&&!layer.inert)openViewer(b,byId.get(b.dataset.id));};
  },e=>{groups.innerHTML=`<p class="cm-empty">${esc(w.fail.replace('{e}',String(e?.message||e)))}</p>`;});
  load().then(poll);
 }

 /* ---------- level 2: the viewfinder ---------- */
 function openViewer(btn,it){
  if(!it)return;item=it;btn.closest('.cm-layer').querySelector('.is-picked')?.classList.remove('is-picked');btn.classList.add('is-picked');
  const glyph=game.initial||crestGlyph(game.title);
  const layer=document.createElement('div');layer.className='cm-layer cm-view';layer.dataset.title=w.frame;
  const insert=toploaderId!=null;
  layer.innerHTML=`<div class="cm-view-main"><div class="cm-viewport"><img class="cm-ghost" alt="" src="${esc(it.src)}"><div class="cm-frame"><div class="cm-print"><div class="cm-face cm-front"><img class="cm-pic" alt="" src="${esc(it.src)}" draggable="false"><i class="cm-foil"></i><i class="cm-sweep"></i></div><div class="cm-face cm-backface">${backHTML(glyph,game.title)}</div></div><i class="cm-corner"></i></div></div>
   <p class="cm-hint">${w.hint}</p></div>
   <aside class="cm-side"><div class="cm-previews"><figure><div class="cm-mini cm-mini-front" title="${esc(w.hover)}"><span class="cm-drift"><img alt="" src="${esc(it.src)}"></span></div><figcaption>${w.front} / ${w.back} · ${w.hoverShort}</figcaption></figure><figure><div class="cm-mini cm-mini-back">${backHTML(glyph,game.title)}</div><figcaption>${w.back}</figcaption></figure></div>
   <div class="cm-info"><b lang="ja">${esc(game.title)}</b><span>${esc(w.groups[it.kind]||'')}${it.w&&it.h?` · ${it.w}×${it.h}`:''}</span></div><div class="cm-meta"><span class="cm-tag is-static">${esc(w.src[it.source]||w.groups[it.kind]||'')}</span><span class="cm-zoom" aria-live="off">100%</span></div>
   <div class="cm-actions"><button type="button" class="primary cm-make">${insert?w.make:w.makeOnly}</button>${insert?`<button type="button" class="cm-quiet cm-only">${w.only}</button>`:''}</div></aside>`;
  const frame=layer.querySelector('.cm-frame');
  push(layer,{fly:()=>{const img=btn.querySelector('img');const from=rectOf(img);frame.style.opacity='0';
   requestAnimationFrame(()=>{flight(from,rectOf(frame),{src:it.src,spring:SPRING.smooth,radius:8}).then(()=>{frame.style.opacity='';});});}});
  viewer=createViewer(layer,it);
  /* the grid holds thumbnails; the viewfinder swaps in the large picture (cards_image) once it is decoded, same box, no flash */
  call('cards_image',{gameId:game.gameId,srcId:it.id}).then(async r=>{if(!r?.src||viewer?.item!==it)return;const im=new Image();im.src=r.src;await im.decode().catch(()=>{});if(viewer?.item!==it)return;for(const el of layer.querySelectorAll('.cm-pic,.cm-ghost,.cm-mini-front img'))el.src=r.src;},()=>{});
  layer.querySelector('.cm-make').addEventListener('click',()=>make(insert));
  layer.querySelector('.cm-only')?.addEventListener('click',()=>make(false));
 }
 const backHTML=(glyph,name)=>`<div class="dtv-back-art is-crest cm-crest"><i class="dtv-ring"></i><i class="dtv-ring is-inner"></i><b>${esc(glyph)}</b><span>MeguLit</span><small>${esc(name)}</small></div>`;

 function createViewer(layer,it){
  const port=layer.querySelector('.cm-viewport'),frame=layer.querySelector('.cm-frame'),pic=layer.querySelector('.cm-pic'),ghost=layer.querySelector('.cm-ghost'),mini=layer.querySelector('.cm-mini-front'),miniImg=mini.querySelector('img'),zoomOut=layer.querySelector('.cm-zoom');
  let W=Number(it.w)||0,H=Number(it.h)||0;
  let s={x:.5,y:.5,scale:1},v={x:0,y:0,scale:0},raf=0,settling=false,dead=false;
  const ptrs=new Map();let last=null,samples=[];
  const bounds=z=>{const win=windowSize(W,H,z);return {hx:win.w/2,hy:win.h/2,win};};
  const rubber=(over,dim)=>{const c=.55;return (1-1/(Math.abs(over)*c/dim+1))*dim*Math.sign(over);};
  function shown(){
   const z=s.scale<1?1-rubber(1-s.scale,.6):s.scale>MAX_ZOOM?MAX_ZOOM+rubber(s.scale-MAX_ZOOM,1.5):s.scale;
   const {hx,hy,win}=bounds(z),band=(val,lo,hi,dim)=>val<lo?lo-rubber(lo-val,dim):val>hi?hi+rubber(val-hi,dim):val;
   return {x:band(s.x,hx,1-hx,win.w),y:band(s.y,hy,1-hy,win.h),scale:z};
  }
  function render(){
   if(!W||!H)return;const view=shown(),fw=frame.clientWidth,fh=frame.clientHeight;if(!fw)return;
   const r=stillRect(W,H,fw,fh,view),k=r.width/W;
   pic.style.width=W+'px';pic.style.height=H+'px';pic.style.transform=`translate(${r.left.toFixed(2)}px,${r.top.toFixed(2)}px) scale(${k.toFixed(5)})`;
   const pr=port.getBoundingClientRect(),fb=frame.getBoundingClientRect(),fr=fb.left-pr.left+(fb.width-fw)/2,ft=fb.top-pr.top+(fb.height-fh)/2;ghost.style.width=W+'px';ghost.style.height=H+'px';ghost.style.transform=`translate(${(fr+r.left).toFixed(2)}px,${(ft+r.top).toFixed(2)}px) scale(${k.toFixed(5)})`;
   const mw=mini.clientWidth,mh=mini.clientHeight;if(mw){const m=stillRect(W,H,mw,mh,view),mk=m.width/W;miniImg.style.width=W+'px';miniImg.style.height=H+'px';miniImg.style.transform=`translate(${m.left.toFixed(2)}px,${m.top.toFixed(2)}px) scale(${mk.toFixed(5)})`;}
   zoomOut.textContent=Math.round(view.scale*100)+'%';
  }
  function settle(){
   cancelAnimationFrame(raf);settling=true;let prev=performance.now();
   const tick=now=>{if(dead)return;const dt=Math.min(1/30,(now-prev)/1000);prev=now;
    const tgt=clampStill(W,H,s);let moving=false;
    for(const key of ['x','y','scale']){const st=key==='scale'?{k:320,d:30}:{k:260,d:30};const a=-st.k*(s[key]-tgt[key])-st.d*v[key];v[key]+=a*dt;s[key]+=v[key]*dt;if(Math.abs(s[key]-tgt[key])>1e-4||Math.abs(v[key])>1e-3)moving=true;}
    if(!moving){s={...tgt};v={x:0,y:0,scale:0};settling=false;render();return;}render();raf=requestAnimationFrame(tick);};
   raf=requestAnimationFrame(tick);
  }
  /* momentum: the release velocity carries on (decelerating), then the spring pulls it inside the bounds */
  function release(){
   const now=performance.now();samples=samples.filter(p=>now-p.t<90);
   if(samples.length>1&&!reduced()){const a=samples[0],b=samples[samples.length-1],dt=Math.max(16,b.t-a.t)/1000;v.x=(b.x-a.x)/dt;v.y=(b.y-a.y)/dt;
    const proj=.18;const tgt=clampStill(W,H,{x:s.x+v.x*proj,y:s.y+v.y*proj,scale:s.scale});const cur=clampStill(W,H,s);
    if(cur.x===+s.x.toFixed(5)&&cur.y===+s.y.toFixed(5)){s.x+=0;s.y+=0;momentum(tgt);return;}}
   v.x=v.y=0;settle();
  }
  function momentum(tgt){cancelAnimationFrame(raf);let prev=performance.now();const tick=now=>{if(dead)return;const dt=Math.min(1/30,(now-prev)/1000);prev=now;const decay=Math.exp(-dt*6.5);
   s.x+=v.x*dt;s.y+=v.y*dt;v.x*=decay;v.y*=decay;const c=clampStill(W,H,s);
   if(Math.abs(c.x-s.x)>1e-4||Math.abs(c.y-s.y)>1e-4||Math.hypot(v.x,v.y)<.02){settle();return;}render();raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);}
  function zoomAt(factor,cx,cy){
   const fr=frame.getBoundingClientRect(),view=shown(),r=stillRect(W,H,fr.width,fr.height,view);
   const px=(cx-fr.left-r.left)/r.width,py=(cy-fr.top-r.top)/r.height;
   const ns=Math.max(.7,Math.min(MAX_ZOOM*1.25,s.scale*factor)),ratio=s.scale/ns;
   s.x=px+(view.x-px)*ratio;s.y=py+(view.y-py)*ratio;s.scale=ns;
  }
  const onWheel=e=>{e.preventDefault();cancelAnimationFrame(raf);zoomAt(Math.exp(-e.deltaY*(e.ctrlKey?.01:.0018)),e.clientX,e.clientY);render();clearTimeout(onWheel.t);onWheel.t=setTimeout(settle,140);};
  const down=e=>{if(printing)return;port.setPointerCapture?.(e.pointerId);cancelAnimationFrame(raf);settling=false;v={x:0,y:0,scale:0};ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});last=null;samples=[];port.classList.add('is-grab');};
  const move=e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});const pts=[...ptrs.values()];
   const cx=pts.reduce((a,p)=>a+p.x,0)/pts.length,cy=pts.reduce((a,p)=>a+p.y,0)/pts.length,dist=pts.length>1?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):0;
   if(last&&last.n===pts.length){const view=shown(),fr=frame.getBoundingClientRect(),r=stillRect(W,H,fr.width,fr.height,view);
    /* inside the rubber band the finger moves the picture less (resistance), like iOS */
    const resist=(Math.abs(view.x-s.x)>1e-4||Math.abs(view.y-s.y)>1e-4)?.55:1;
    s.x-=(cx-last.cx)/r.width*resist;s.y-=(cy-last.cy)/r.height*resist;if(pts.length>1&&last.dist)zoomAt(dist/last.dist,cx,cy);}
   last={cx,cy,dist,n:pts.length};samples.push({t:performance.now(),x:s.x,y:s.y});if(samples.length>8)samples.shift();render();};
  const up=e=>{if(!ptrs.delete(e.pointerId))return;last=null;if(!ptrs.size){port.classList.remove('is-grab');release();}};
  const dbl=()=>{s={x:.5,y:.5,scale:s.scale>1.05?s.scale:1};v={x:0,y:0,scale:0};const tgt={x:.5,y:.5,scale:1};cancelAnimationFrame(raf);
   if(reduced()){s=tgt;render();return;}s={...s};const from={...s};const {points,duration}=springCurve(SPRING.bouncy);const t0=performance.now();
   const tick=now=>{if(dead)return;const i=Math.min(points.length-1,Math.round((now-t0)/duration*(points.length-1))),p=points[i];for(const k of ['x','y','scale'])s[k]=from[k]+(tgt[k]-from[k])*p;render();if(i<points.length-1)raf=requestAnimationFrame(tick);else{s=tgt;render();}};raf=requestAnimationFrame(tick);};
  const key=e=>{const step=e.shiftKey?.08:.02;let used=true;if(e.key==='ArrowLeft')s.x-=step;else if(e.key==='ArrowRight')s.x+=step;else if(e.key==='ArrowUp')s.y-=step;else if(e.key==='ArrowDown')s.y+=step;else if(e.key==='+'||e.key==='=')s.scale*=1.1;else if(e.key==='-')s.scale/=1.1;else used=false;if(used){e.preventDefault();settle();}};
  port.tabIndex=0;port.setAttribute('role','application');port.setAttribute('aria-label',w.hint);
  port.addEventListener('wheel',onWheel,{passive:false});port.addEventListener('pointerdown',down);port.addEventListener('pointermove',move);port.addEventListener('pointerup',up);port.addEventListener('pointercancel',up);port.addEventListener('dblclick',dbl);port.addEventListener('keydown',key);
  /* user 11-13: on the wall the card rests on the still and drifts from it on hover; the front preview shows that drift */
  const drift=mini.querySelector('.cm-drift');let driftAnim=null;
  mini.addEventListener('pointerenter',()=>{if(reduced())return;driftAnim?.cancel();const m=mini.clientWidth*.06;driftAnim=drift.animate([{transform:'none'},{transform:`translate(${-m}px,${-m*.4}px) scale(1.06)`}],{duration:5200,easing:'ease-in-out',direction:'alternate',iterations:Infinity});});
  mini.addEventListener('pointerleave',()=>{if(!driftAnim)return;const a=driftAnim;driftAnim=null;try{a.commitStyles();}catch{}a.cancel();drift.animate([{transform:getComputedStyle(drift).transform},{transform:'none'}],{...springEasing(SPRING.smooth)}).finished.then(()=>{drift.style.transform='';},()=>{});});
  const ro=new ResizeObserver(()=>render());ro.observe(port);ro.observe(mini);
  const ready=()=>{if(!W||!H){W=pic.naturalWidth||1600;H=pic.naturalHeight||900;}render();};
  if(pic.complete&&pic.naturalWidth)ready();else pic.addEventListener('load',ready,{once:true});if(W&&H)requestAnimationFrame(render);
  return {item:it,still:()=>clampStill(W,H,s),size:()=>({w:W,h:H}),destroy(){dead=true;cancelAnimationFrame(raf);ro.disconnect();},render};
 }

 /* ---------- generate: print the card, then sleeve it ---------- */
 async function make(insert){
  if(printing||!viewer)return;printing=true;const layer=layers[layers.length-1];layer.classList.add('is-printing');
  const still=viewer.still(),{w:iw,h:ih}=viewer.size();
  live.textContent=w.printing;
  const work=(async()=>{const card=await call('cards_create',{gameId:game.gameId,kind:item.kind,srcId:item.id,still,...(call===mockApi?{__src:item.src,__w:iw,__h:ih}:{})});
   if(insert&&card?.id!=null)await call('cards_insert',{toploaderId,cardId:card.id});return card;})();
  const print=layer.querySelector('.cm-print'),frame=layer.querySelector('.cm-frame'),ghost=layer.querySelector('.cm-ghost'),sweep=layer.querySelector('.cm-sweep');
  const quiet=[layer.querySelector('.cm-side'),layer.querySelector('.cm-hint'),ghost];
  let ok=true,card=null,error=null;
  if(reduced()){for(const el of quiet)el.animate([{opacity:1},{opacity:0}],{duration:160,fill:'forwards'});try{card=await work;}catch(e){ok=false;error=e;}}
  else{
   /* 1 the face forms: everything around the frame falls away, the frame lifts like a fresh card */
   for(const el of quiet)stopAnims(el),el.animate([{opacity:getComputedStyle(el).opacity},{opacity:0}],{duration:260,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
   frame.classList.add('is-card');
   const lift=frame.animate([{transform:'none'},{transform:'translateY(-6px) scale(1.035)'}],{...springEasing(SPRING.smooth),fill:'forwards'});
   sweep.animate([{transform:'translateX(-120%) skewX(-18deg)',opacity:0},{opacity:1,offset:.3},{transform:'translateX(220%) skewX(-18deg)',opacity:0}],{duration:760,delay:180,easing:'cubic-bezier(.3,.1,.3,1)'});
   await new Promise(r=>setTimeout(r,520));
   /* 2 it turns over to show the crest back, rests a beat, and keeps turning the same way back to the face */
   const r=(a,z,sc)=>`translateZ(${z}px) rotateY(${a}deg) scale(${sc})`;
   /* a rigid card: pure rotateY under a long perspective, lifted a little toward the viewer, spring settle at the end */
   const flipTo=(from,to,dur)=>print.animate([{transform:r(from,0,1),easing:'cubic-bezier(.4,0,.7,.2)'},{transform:r(from+90,40,1.03),offset:.42,easing:'cubic-bezier(.2,.6,.3,1)'},{transform:r(to+6,8,1.005),offset:.78,easing:'cubic-bezier(.4,0,.4,1)'},{transform:r(to-1.5,0,1),offset:.9,easing:'ease-in-out'},{transform:r(to,0,1)}],{duration:dur,fill:'forwards'});
   await flipTo(0,180,720).finished.catch(()=>{});
   try{card=await Promise.race([work,new Promise(res=>setTimeout(()=>res(undefined),180))]);if(card===undefined)card=await work;}catch(e){ok=false;error=e;}
   const back=flipTo(180,360,720);await new Promise(r=>setTimeout(r,600));
   lift.cancel();
  }
  if(!ok){printing=false;layer.classList.remove('is-printing');frame.classList.remove('is-card');stopAnims(print);print.style.transform='';
   for(const el of quiet){stopAnims(el);el.style.opacity='';}live.textContent=w.fail.replace('{e}',String(error?.message||error||''));
   layer.querySelector('.cm-make')?.focus();return;}
  live.textContent='';
  window.dispatchEvent(new CustomEvent('megulit:cards-changed',{detail:{toploaderId:insert?toploaderId:null,cardId:card?.id??null,card}}));
  /* 3 the finished card heads for its Toploader (the wall takes over and plays the insert), the sheet folds away */
  if(!reduced()){const from=rectOf(frame),to=insert&&origin?{left:origin.left+origin.width*.09,top:origin.top+origin.height*.07,width:origin.width*.82,height:origin.height*.82}:{left:from.left+from.width*.3,top:innerHeight-from.height*.4,width:from.width*.4,height:from.height*.4};
   const fl=document.createElement('div');fl.className='cm-flight is-card';Object.assign(fl.style,{left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px'});
   const face=layer.querySelector('.cm-front').cloneNode(true);face.querySelector('.cm-sweep')?.remove();
   const fw=from.width,fh=from.height;face.style.cssText=`position:absolute;left:0;top:0;width:${fw}px;height:${fh}px;transform-origin:0 0;transform:scale(${to.width/fw},${to.height/fh})`;fl.append(face);document.body.append(fl);
   frame.style.opacity='0';
   const {points,duration}=springCurve(SPRING.smooth),n=Math.min(40,points.length-1),f=[];
   for(let i=0;i<=n;i++){const p=i?points[Math.round(i/n*(points.length-1))]:0,x=from.left+(to.left-from.left)*p,y=from.top+(to.top-from.top)*p,sx=(from.width+(to.width-from.width)*p)/to.width,sy=(from.height+(to.height-from.height)*p)/to.height;
    f.push({offset:i/n,transform:`translate(${(x-to.left).toFixed(2)}px,${(y-to.top).toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`});}
   fl.animate(f,{duration,fill:'forwards'});
   fl.animate([{opacity:1},{opacity:1,offset:.8},{opacity:insert&&origin?1:0}],{duration,fill:'forwards'});
   const sh=document.createElement('i');sh.className='cm-flight-shadow';fl.prepend(sh);sh.animate([{opacity:1},{opacity:0}],{duration,easing:'cubic-bezier(.3,0,.2,1)',fill:'forwards'});
   setTimeout(()=>{fl.animate([{opacity:1},{opacity:0}],{duration:200,fill:'forwards'}).finished.then(()=>fl.remove(),()=>fl.remove());},duration+(insert?140:0));
  }
  printing=false;close(false,card,true);
 }
 return api_;
}
export function closeCardMaker(){return current?.close(false,null);}
if(typeof window!=='undefined')window.MeguLitCardMaker={openCardMaker,closeCardMaker,stillRect,clampStill,CARD_RATIO};
