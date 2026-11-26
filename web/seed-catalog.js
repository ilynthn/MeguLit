// SPDX-License-Identifier: GPL-3.0-or-later
/* The Seed catalog: every game that has a seed, grouped by developer, with its cover (services/seed-catalog.cjs).
   Tested games show every cover unless the app's R18 filter is on. The engine pages follow the global NSFW setting (Settings,
   off by default; web/nsfw.js): off, a cover VNDB rates adult is a veil card (one line of text) and a click shows that one
   cover; on, every cover. Opened from The Seed dialog and the About section (web/the-seed.js). */
import {nsfwOn} from './nsfw.js';
import {fxPref} from './fx-prefs.js';
const W={
 zh:{title:'已种下的游戏',sub:(g,s,b)=>`${g} 部游戏 · ${s} 颗种子 · ${b} 个游戏社`,seeds:n=>`${n} 颗种子`,partly:(a,b)=>`${a}/${b} 已确认`,locked:'设置里开着「卡背过滤 R18 图片」，成人封面不能显示',search:'搜索已实测游戏或游戏社',
  count:n=>`${n} 部`,other:'其他',tested:'已实测',engineAdapted:'引擎已适配（未逐部实测）',
  engineHint:'同引擎的游戏大多能用，个别版本更换密钥或封包后可能读不出，欢迎反馈。',engineCountMissing:'部数暂缺',engineCached:'缓存部数，打开后更新',
  tabEngines:'引擎已适配',about:n=>`约 ${n} 部`,unit:'部',allEngines:'全部引擎',tabs:'目录分类',
  previous:'上一页',next:'下一页',page:(n,m)=>m?`第 ${n} / ${m} 页`:`第 ${n} 页`,retry:'重试',
  status:{verified:'已确认','owner-ok':'已确认',read:'已适配 · 默认配置已导入',skeleton:'等传火'},hidden:'成人内容 · 在设置里开启后显示',reveal:'点击只临时查看这一张',devNone:'暂时读不到这个游戏社的介绍',devSource:'简介来自 VNDB',devOpen:'在浏览器中打开',links:{vndb:'VNDB 游戏社页',site:'官网',moegirl:'萌娘百科',jawiki:'日文维基'},
  offline:'连不上 VNDB，部分游戏名和封面暂时显示不了',empty:'没有找到',close:'关闭',loading:'正在读取…',failed:'读取失败，稍后再试',link:'看看都有哪些游戏'},
 en:{title:'Seeded games',sub:(g,s,b)=>`${g} games · ${s} seeds · ${b} developers`,seeds:n=>`${n} seeds`,partly:(a,b)=>`${a}/${b} confirmed`,locked:'"Keep R18 pictures off the card back" is on in Settings, so only normal mode is shown',search:'Search tested games or developers',
  count:n=>`${n} ${+n===1?'game':'games'}`,other:'Other',tested:'Tested',engineAdapted:'Supported engines (individual games untested)',
  engineHint:'Most games on these engines should work. Some releases use different keys or archives. Please report any that cannot be read.',engineCountMissing:'Count unavailable',engineCached:'Cached count, refreshed when opened',
  tabEngines:'Supported engines',about:n=>`about ${n}`,unit:'games',allEngines:'All engines',tabs:'Catalog sections',
  previous:'Previous',next:'Next',page:(n,m)=>m?`Page ${n} of ${m}`:`Page ${n}`,retry:'Retry',
  status:{verified:'Confirmed','owner-ok':'Confirmed',read:'Adapted · default settings imported',skeleton:'Waiting for a spark'},hidden:'Adult content · shown when enabled in Settings',reveal:'Click to see only this one for now',devNone:'No introduction could be loaded for this developer for now',devSource:'Introduction from VNDB',devOpen:'Open in the browser',links:{vndb:'VNDB developer page',site:'Official site',moegirl:'Moegirlpedia',jawiki:'Japanese Wikipedia'},
  offline:'VNDB cannot be reached, so some names and covers are missing for now',empty:'Nothing found',close:'Close',loading:'Loading…',failed:'Could not load the list, try again later',link:'See which games'},
 ja:{title:'種まき済みのゲーム',sub:(g,s,b)=>`${g} 本 · 種 ${s} 個 · ${b} ブランド`,seeds:n=>`種 ${n} 個`,partly:(a,b)=>`${a}/${b} 確認済み`,locked:'設定で「カード裏の R18 画像を除外」がオンのため、通常モードのみ表示します',search:'確認済みゲーム・ブランドで検索',
  count:n=>`${n} 本`,other:'その他',tested:'実機確認済み',engineAdapted:'対応エンジン（作品ごとの動作は未確認）',
  engineHint:'同じエンジンの多くの作品に対応していますが、鍵やアーカイブが異なる版は読み込めない場合があります。問題があればお知らせください。',engineCountMissing:'件数を取得できません',engineCached:'キャッシュされた件数。開くと更新されます',
  tabEngines:'対応エンジン',about:n=>`約 ${n} 本`,unit:'本',allEngines:'すべてのエンジン',tabs:'カタログの区分',
  previous:'前へ',next:'次へ',page:(n,m)=>m?`${n} / ${m} ページ`:`${n} ページ`,retry:'再試行',
  status:{verified:'確認済み','owner-ok':'確認済み',read:'対応済み · 既定設定を取り込み済み',skeleton:'伝火待ち'},hidden:'成人向け · 設定でオンにすると表示',reveal:'クリックでこの 1 枚だけ一時的に表示',devNone:'このブランドの紹介は今は読み込めません',devSource:'紹介文の出典：VNDB',devOpen:'ブラウザで開く',links:{vndb:'VNDB のブランドページ',site:'公式サイト',moegirl:'萌娘百科（中国語）',jawiki:'日本語版ウィキペディア'},
  offline:'VNDB に接続できないため、一部の名前と表紙を表示できません',empty:'見つかりません',close:'閉じる',loading:'読み込み中…',failed:'読み込めませんでした。後でもう一度お試しください',link:'収録ゲームを見る'}
};
export const catalogWords=locale=>W[locale]||W.zh;
/* the covers' mode is the global NSFW setting */
export const savedMode=()=>nsfwOn()?'nsfw':'normal';

/* names: Japanese (or Chinese) users get the original script, English users the romanised title; a game VNDB does not know
   shows its seed slug */
const fromSlug=s=>String(s||'').split('-').filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
export const gameTitle=(g,locale)=>(locale==='en'?g.title||g.alttitle:g.alttitle||g.title)||fromSlug(g.slug);
export const developerName=(d,locale)=>(locale==='en'?d.name||d.original:d.original||d.name)||'';
const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
/* one card per game: seeds of different builds that share a VNDB id (月姫 v1.4 and v1.6) become one card with seeds = 2.
   ok = how many of them are confirmed; the card says 「1/2 已确认」 when only some are, so a build that was never confirmed
   does not look confirmed. status is the best of them, for the colour. */
const RANK={verified:0,'owner-ok':1,read:2,skeleton:3};
const rank=s=>RANK[s]??4;
const confirmed=s=>s==='verified'||s==='owner-ok';
export function mergeGames(games){
 const out=[],byVn=new Map();
 for(const g of games){
  const same=g.vndb&&byVn.get(g.vndb);
  if(!same){const c={...g,seeds:1,ok:confirmed(g.status)?1:0,engines:[g.engine]};out.push(c);if(g.vndb)byVn.set(g.vndb,c);continue;}
  same.seeds++;same.ok+=confirmed(g.status)?1:0;if(!same.engines.includes(g.engine))same.engines.push(g.engine);if(rank(g.status)<rank(same.status))same.status=g.status;
 }
 return out;
}
export const statusText=(g,locale)=>{const t=catalogWords(locale);return g.seeds>1&&g.ok>0&&g.ok<g.seeds?t.partly(g.ok,g.seeds):t.status[g.status]||t.status.skeleton;};
/* groups by the first developer; the biggest first, games without a developer last */
export function groupGames(games,locale,query=''){
 const q=fold(query),m=new Map();
 for(const g of mergeGames(games)){
  const d=g.developers?.[0],name=d?developerName(d,locale):'';
  if(q&&![gameTitle(g,locale),g.title,g.alttitle,g.slug,...(g.developers||[]).flatMap(x=>[x.name,x.original])].some(s=>fold(s).includes(q)))continue;
  const key=d?.id||'';if(!m.has(key))m.set(key,{id:key,name,games:[]});m.get(key).games.push(g);
 }
 const cmp=(a,b)=>a.localeCompare(b,locale==='en'?'en':'ja');
 for(const x of m.values())x.games.sort((a,b)=>cmp(gameTitle(a,locale),gameTitle(b,locale)));
 return [...m.values()].sort((a,b)=>(!a.id)-(!b.id)||b.games.length-a.games.length||cmp(a.name,b.name));
}
/* what a card shows where the cover goes: an image to load, the placeholder because the mode hides it, or no cover at all */
export const coverState=(g,mode)=>g.cover==='safe'||(g.cover==='nsfw'&&mode==='nsfw')?'load':g.cover==='nsfw'?'hidden':'none';

const STATUS_CLASS={verified:'ok','owner-ok':'ok',read:'ok',skeleton:'wait'};
function cardHTML(g,locale,mode,esc,seeded=true){
 const t=catalogWords(locale),title=gameTitle(g,locale),st=coverState(g,mode),dev=g.developers?.[0]?developerName(g.developers[0],locale):'';
 const ph=`<span class="sc-ph" aria-hidden="true">${esc(Array.from(dev||title)[0]||'?')}</span>${st==='hidden'?`<button type="button" class="sc-veil" data-reveal="${esc(g.vndb)}" title="${esc(t.reveal)}">${esc(t.hidden)}</button>`:''}`;
 return `<li class="sc-card"><div class="sc-cover" data-state="${st}"${st==='load'?` data-vndb="${esc(g.vndb)}"`:''}>${ph}</div>
  <div class="sc-meta"><b title="${esc(title)}">${esc(title)}</b>${seeded?`<span class="sc-tags"><span class="sc-engine">${esc((g.engines||[g.engine]).join(' / '))}</span>${g.seeds>1?`<span class="sc-builds">${esc(t.seeds(g.seeds))}</span>`:''}<span class="sc-st sc-st-${g.seeds>1&&g.ok>0&&g.ok<g.seeds?'part':STATUS_CLASS[g.status]||'wait'}">${esc(statusText(g,locale))}</span></span>`:dev?`<span class="sc-tags sc-by">${esc(dev)}</span>`:''}</div></li>`;
}
export function catalogHTML(games,locale,mode,esc,query=''){
 const t=catalogWords(locale),groups=groupGames(games,locale,query);
 if(!groups.length)return `<p class="sc-empty">${esc(t.empty)}</p>`;
 return groups.map(gr=>`<section class="sc-group"><h3><span class="sc-logo" aria-hidden="true"${gr.id?` data-pid="${esc(gr.id)}"`:''}>${esc(Array.from(gr.name||t.other)[0]||'?')}</span>${gr.id?`<button type="button" class="sc-dev" data-dev="${esc(gr.id)}" aria-expanded="false">${esc(gr.name||t.other)}</button>`:`<span>${esc(gr.name||t.other)}</span>`}<small>${esc(t.count(gr.games.length))}</small></h3>${gr.id?'<div class="sc-panel" data-panel hidden></div>':''}
  <ul class="sc-grid">${gr.games.map(g=>cardHTML(g,locale,mode,esc)).join('')}</ul></section>`).join('');
}

/* covers: four at a time. The last 300 covers that arrived are kept per mode for as long as the app runs (an engine has
   thousands of games); a miss or an error is asked again next time. live() is false once the list was drawn again (search, mode switch) or closed: that run stops before its
   next request, so leaving NSFW mode stops the downloads of covers normal mode does not show. */
const covers=new Map(),KEEP_COVERS=300;
const isCover=u=>typeof u==='string'&&u.startsWith('data:image/');
export function resolveSeedCover(api,vid,mode='safe',cache=covers){
 const key=vid+'|'+mode;
 let pending=cache.get(key);
 if(!pending){
  pending=Promise.resolve().then(()=>api('seed_cover',{vndb:vid,nsfw:mode==='nsfw'})).catch(()=>null).then(url=>{
   if(!isCover(url))cache.delete(key);
   return isCover(url)?url:null;
  });
  cache.set(key,pending);
  while(cache.size>KEEP_COVERS)cache.delete(cache.keys().next().value);
 }else{cache.delete(key);cache.set(key,pending);}
 return pending;
}
export function loadCovers(root,api,mode,live=()=>root.isConnected,{cache=covers,show=showCover}={}){
 const todo=[...root.querySelectorAll('.sc-cover[data-state="load"][data-vndb]:not([data-loaded])')];let at=0;
 const next=async()=>{while(at<todo.length&&live()){const el=todo[at++];if(!el.isConnected)continue;
  const url=await resolveSeedCover(api,el.dataset.vndb,mode,cache);if(isCover(url)&&live()&&el.isConnected&&!el.dataset.loaded)show(el,url);}};
 return Promise.all([next(),next(),next(),next()]);
}
function showCover(el,url){const img=new Image();img.alt='';img.decoding='async';img.onload=()=>img.classList.add('is-in');img.src=url;el.prepend(img);el.dataset.loaded='1';}

import {devPanelHTML,openPanel,devWords} from './developer.js';
export {devPanelHTML};
/* developer logos: the small icon of the developer's own site (services/seed-logo.cjs), three at a time; no icon = the letter badge stays */
const logos=new Map();
export function loadLogos(root,api,live=()=>root.isConnected,{cache=logos}={}){
 const todo=[...root.querySelectorAll('.sc-logo[data-pid]')];let at=0;
 const next=async()=>{while(at<todo.length&&live()){const el=todo[at++],pid=el.dataset.pid;if(!el.isConnected)continue;
  let p=cache.get(pid);if(!p){p=Promise.resolve().then(()=>api('seed_logo',{pid})).catch(()=>null).then(u=>{if(!isCover(u))cache.set(pid,Promise.resolve(null));return u;});cache.set(pid,p);}
  const url=await p;if(isCover(url)&&live()&&el.isConnected){const img=new Image();img.alt='';img.decoding='async';img.onload=()=>{el.textContent='';el.append(img);el.classList.add('has-img');};img.src=url;}}};
 return Promise.all([next(),next(),next()]);
}
export function openSeedCatalog({api,locale,esc,toast}){
 document.querySelector('dialog.seed-catalog')?.close();
 const t=catalogWords(locale),dialog=document.createElement('dialog');let mode=savedMode(),games=[],query='',safeOnly=false,seedOffline=false;
 dialog.className='game-dialog seed-catalog';
 /* the app's dialog parts: game-dialog head, two tabs (the seeded games; the engines MeguLit reads), a bar like the lines
    picker for the seeded games, the list, the action row */
 dialog.innerHTML=`<div class="game-dialog-head"><h2>${esc(t.title)}</h2><p data-sub>${esc(t.loading)}</p></div>
  <div class="sc-tabs" role="tablist" aria-label="${esc(t.tabs)}">
   <button type="button" role="tab" id="sc-tab-tested" aria-controls="sc-pane-tested" aria-selected="true" data-tab="tested">${esc(t.tested)}<small data-tab-count></small></button>
   <button type="button" role="tab" id="sc-tab-engines" aria-controls="sc-pane-engines" aria-selected="false" tabindex="-1" data-tab="engines">${esc(t.tabEngines)}<small data-tab-count></small></button>
  </div>
  <div class="sc-bar" data-bar><label class="sc-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" data-search autofocus placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" autocomplete="off" spellcheck="false"></label></div>
  <p class="sc-offline" data-offline hidden>${esc(t.offline)}</p>
  <div class="sc-body" data-body>
   <div role="tabpanel" id="sc-pane-tested" aria-labelledby="sc-tab-tested" data-pane="tested"><div data-seed-games></div></div>
   <div role="tabpanel" id="sc-pane-engines" aria-labelledby="sc-tab-engines" data-pane="engines" hidden>
    <p class="sc-note"><b>${esc(t.engineAdapted)}</b><span>${esc(t.engineHint)}</span></p>
    <p class="sc-offline sc-inline" data-engines-offline hidden>${esc(t.offline)}</p>
    <div data-engine-list><p class="sc-empty">${esc(t.loading)}</p></div>
    <div class="sc-edetail" data-engine-view hidden></div>
   </div>
  </div>
  <div class="dialog-actions"><button type="button" class="text-button" data-close>${esc(t.close)}</button></div>`;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 const $=s=>dialog.querySelector(s),body=$('[data-body]'),seedGames=$('[data-seed-games]');
 let run=0;
 /* 2026-11-24 (user): the tested games always show their covers, adult ones too; only the app's R18 filter keeps them veiled */
 const testedMode=()=>safeOnly?'normal':'nsfw';
 const render=()=>{const mine=++run,shown=testedMode();dialog.dataset.mode=mode;seedGames.innerHTML=catalogHTML(games,locale,shown,esc,query);loadCovers(seedGames,api,shown,()=>mine===run&&dialog.isConnected);loadLogos(seedGames,api,()=>mine===run&&dialog.isConnected);};

 /* covers answer the pointer like the library wall (card-tilt.js): a small turn toward it with a moving sheen */
 const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 let tilted=null;
 const untilt=el=>{if(!el)return;el.classList.remove('is-tilting');for(const k of ['--rx','--ry','--mx','--my'])el.style.removeProperty(k);};
 body.addEventListener('pointermove',e=>{
  const el=calm||e.buttons||!fxPref('cardTilt').on?null:e.target.closest?.('.sc-cover')||null;
  if(el!==tilted){untilt(tilted);tilted=el;}
  if(!el)return;
  const r=el.getBoundingClientRect();if(!r.width)return;
  const x=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height));
  el.style.setProperty('--ry',((x-.5)*16).toFixed(2)+'deg');el.style.setProperty('--rx',((.5-y)*14).toFixed(2)+'deg');
  el.style.setProperty('--mx',(x*100).toFixed(1)+'%');el.style.setProperty('--my',(y*100).toFixed(1)+'%');el.classList.add('is-tilting');
 },{passive:true});
 body.addEventListener('pointerleave',()=>{untilt(tilted);tilted=null;},{passive:true});

 /* tabs: the seeded games first; the search bar belongs to them */
 const tabs=[...dialog.querySelectorAll('[data-tab]')];
 const showTab=name=>{
  for(const b of tabs){const on=b.dataset.tab===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;$(`[data-pane="${b.dataset.tab}"]`).hidden=!on;}
  $('[data-bar]').hidden=name!=='tested';$('[data-offline]').hidden=name!=='tested'||!seedOffline;dialog.dataset.section=name;body.scrollTop=0;
 };
 $('.sc-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab);});
 $('.sc-tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const i=tabs.indexOf(document.activeElement);if(i<0)return;
  const b=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];b.focus();showTab(b.dataset.tab);e.preventDefault();});
 const tabCount=(name,text)=>{$(`[data-tab="${name}"] [data-tab-count]`).textContent=text;};

 /* engines: a tile per engine, the biggest first; a click opens that engine's games one VNDB page at a time */
 const engineList=$('[data-engine-list]'),engineView=$('[data-engine-view]');
 const known=n=>Number.isSafeInteger(n)&&n>=0;
 const num=n=>n.toLocaleString('en-US');
 const countText=n=>known(n)?t.count(num(n)):t.engineCountMissing;
 let engineInfo=new Map(),current=null,enginesOffline=false;
 const showEngines=r=>{
  if(!dialog.isConnected)return;
  enginesOffline=!!r?.offline;$('[data-engines-offline]').hidden=!enginesOffline||!engineView.hidden;
  const engines=(Array.isArray(r?.engines)?r.engines:[]).slice().sort((a,b)=>(known(b.count)?b.count:-1)-(known(a.count)?a.count:-1));
  engineInfo=new Map(engines.map(g=>[g.id,g]));
  const total=engines.reduce((n,g)=>n+(known(g.count)?g.count:0),0),top=Math.max(1,...engines.map(g=>known(g.count)?g.count:0));
  if(total)tabCount('engines',t.about(num(total)));
  engineList.innerHTML=engines.length?`<ul class="sc-engines">${engines.map(g=>`<li><button type="button" class="sc-etile" data-engine="${esc(g.id)}"${g.stale?` title="${esc(t.engineCached)}"`:''}>
   <span class="sc-etile-name">${esc(g.name)}</span><span class="sc-etile-n">${known(g.count)?`<b>${esc(num(g.count))}</b> ${esc(t.unit)}`:esc(t.engineCountMissing)}</span>
   <i aria-hidden="true" style="--share:${known(g.count)?(Math.log10(g.count+1)/Math.log10(top+1)).toFixed(3):0}"></i></button></li>`).join('')}</ul>`:`<p class="sc-empty">${esc(r?.offline?t.offline:t.failed)}</p>`;
 };
 /* back to the tiles, drawn again so a count an opened page refreshed shows on its tile and in the total */
 const closeEngine=()=>{current=null;engineView.hidden=true;engineView.innerHTML='';engineView.removeAttribute('aria-busy');delete engineView.dataset.engine;engineList.hidden=false;
  showEngines({engines:[...engineInfo.values()],offline:enginesOffline});body.scrollTop=0;};
 async function showEnginePage(id,page){
  const info=engineInfo.get(id);if(!info)return;
  if(current?.busy)return;
  const mine={id,page,busy:true};current=mine;
  engineList.hidden=true;engineView.hidden=false;$('[data-engines-offline]').hidden=true;
  if(engineView.dataset.engine!==id){
   engineView.dataset.engine=id;
   engineView.innerHTML=`<div class="sc-ehead"><button type="button" class="sc-back" data-engine-back><span aria-hidden="true">←</span> ${esc(t.allEngines)}</button>
    <h3>${esc(info.name)}<small data-engine-count${info.stale?` title="${esc(t.engineCached)}"`:''}>${esc(countText(info.count))}</small></h3></div>
    <p class="sc-offline sc-inline" data-engine-notice hidden></p><div data-engine-games></div>`;
  }
  const view=engineView.querySelector('[data-engine-games]'),notice=engineView.querySelector('[data-engine-notice]');
  notice.hidden=false;notice.textContent=t.loading;engineView.setAttribute('aria-busy','true');
  try{
   const result=await api('seed_catalog_engine',{engine:id,page});
   if(current!==mine||!dialog.isConnected)return;
   if(!result||!Array.isArray(result.games)||result.page!==page||result.offline&&!result.games.length)throw Error('catalog page');
   let count=info.count;
   if(!result.offline&&known(result.count)){
    count=result.count;info.count=count;info.stale=false;
    const c=engineView.querySelector('[data-engine-count]');c.textContent=countText(count);c.removeAttribute('title');
   }
   const pages=known(count)&&count>0?Math.ceil(count/100):0;
   const games=result.games.length?`<ul class="sc-grid">${result.games.map(g=>cardHTML(g,locale,mode,esc,false)).join('')}</ul>`:`<p class="sc-empty">${esc(t.empty)}</p>`;
   const button=(label,n,disabled,cls)=>`<button type="button" class="text-button ${cls}" data-engine-page="${n}"${disabled?' disabled':''}>${esc(label)}</button>`;
   const pager=page>1||result.more?`<nav class="sc-pager">${button(t.previous,page-1,page<=1,'sc-prev')}<span>${esc(t.page(page,pages&&Math.max(pages,page)))}</span>${button(t.next,page+1,!result.more,'sc-next')}</nav>`:'';
   view.innerHTML=games+pager;
   notice.hidden=!result.offline;notice.textContent=t.offline;
   body.scrollTop=0;
   loadCovers(view,api,mode,()=>current?.id===id&&current.page===page&&view.isConnected);
  }catch{
   if(current!==mine||!dialog.isConnected)return;
   notice.hidden=true;
   view.innerHTML=`<div class="sc-empty sc-fail"><span>${esc(t.offline)}</span><button type="button" class="sc-back" data-engine-page="${page}">${esc(t.retry)}</button></div>`;
  }finally{mine.busy=false;if(current===mine)engineView.removeAttribute('aria-busy');}
 }
 engineList.addEventListener('click',e=>{const b=e.target.closest('[data-engine]');if(b)showEnginePage(b.dataset.engine,1);});
 engineView.addEventListener('click',e=>{
  if(e.target.closest('[data-engine-back]'))return closeEngine();
  const button=e.target.closest('[data-engine-page]');if(button&&!button.disabled)showEnginePage(engineView.dataset.engine,Number(button.dataset.enginePage));
 });
 /* a veil card: a click shows that one cover for now (the setting stays off; the app's R18 filter still refuses it) */
 body.addEventListener('click',async e=>{const b=e.target.closest('[data-reveal]');if(!b||b.disabled)return;if(safeOnly){b.title=t.locked;return;}const el=b.closest('.sc-cover');b.disabled=true;let u=null;try{u=await api('seed_cover',{vndb:b.dataset.reveal,nsfw:true});}catch{}
  if(isCover(u)&&el.isConnected){b.remove();el.querySelector('.sc-ph')?.remove();showCover(el,u);el.dataset.state='load';}else{b.disabled=false;b.title=safeOnly?t.locked:t.failed;}});
 /* a developer's name opens a small panel: VNDB's introduction (cut short, source named) and links; links open in the system browser */
 body.addEventListener('click',async e=>{const b=e.target.closest('[data-dev]');if(!b)return;const panel=b.closest('.sc-group').querySelector('[data-panel]'),open=panel.hidden;panel.hidden=!open;b.setAttribute('aria-expanded',String(open));if(open)openPanel({panel,pid:b.dataset.dev,api,t:{...t,...devWords(locale)},esc,toast,locale});});
 $('[data-search]').addEventListener('input',e=>{query=e.target.value;render();});
 $('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.showModal();
 Promise.resolve().then(()=>api('seed_catalog',{})).then(r=>{
  if(!dialog.isConnected)return;games=Array.isArray(r?.games)?r.games:[];
  /* the app's R18 filter (卡背过滤 R18 图片) is on: normal mode only, the NSFW button off with a hint */
  if(r?.safeOnly===true){safeOnly=true;mode='normal';render();}
  const merged=mergeGames(games).length;tabCount('tested',t.count(merged));
  $('[data-sub]').textContent=t.sub(merged,games.length,new Set(games.map(g=>g.developers?.[0]?.id).filter(Boolean)).size);
  seedOffline=!!r?.offline;$('[data-offline]').hidden=!seedOffline||dialog.dataset.section==='engines';render();
 }).catch(()=>{if(dialog.isConnected){$('[data-sub]').textContent=t.failed;toast&&toast(t.failed);}});
 /* the engine counts are local (a snapshot plus pages opened before), so they do not wait on the seeded games' VNDB lookup */
 Promise.resolve().then(()=>api('seed_catalog_engines',{})).then(showEngines).catch(()=>showEngines({offline:true}));
 return dialog;
}
/* the entry button for The Seed dialog and the About section */
export const catalogLinkHTML=(locale,esc,cls='seed-link')=>`<button type="button" class="${cls}" data-seed-catalog>${esc(catalogWords(locale).link)}<i aria-hidden="true">→</i></button>`;
export function bindSeedCatalog(root,{api,locale,esc,toast}){root.querySelectorAll('[data-seed-catalog]').forEach(b=>b.addEventListener('click',()=>openSeedCatalog({api,locale,esc,toast})));}
