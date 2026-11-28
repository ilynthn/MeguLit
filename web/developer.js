// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 developers where players look every day: a logo beside the title of each library card, and the developer line of the
   game page with a small panel (VNDB's introduction, short, source named, and links to VNDB, the official site, Moegirlpedia and
   the Japanese Wikipedia). The Seed catalog uses the same parts. Logos and introductions come from the service
   (seed_logo, seed_producer: services/seed-logo.cjs, services/seed-producer.cjs), links are opened by the service in the system
   browser (seed_producer_open) from its own answer, never from an address the page passes. */
const W={
 zh:{devNone:'暂时读不到这个游戏社的介绍',devSource:'简介来自 VNDB',devSourceMoegirl:'简介来自 萌娘百科（CC BY-NC-SA 3.0）',devSourceBangumi:'简介来自 Bangumi',devOpen:'在浏览器中打开',loading:'正在读取…',failed:'读取失败，稍后再试',dev:'游戏社',links:{vndb:'VNDB 游戏社页',site:'官网',moegirl:'萌娘百科',bangumi:'Bangumi',jawiki:'日文维基'}},
 en:{devNone:'No introduction could be loaded for this developer for now',devSource:'Introduction from VNDB',devSourceMoegirl:'Introduction from Moegirlpedia (CC BY-NC-SA 3.0)',devSourceBangumi:'Introduction from Bangumi',devOpen:'Open in the browser',loading:'Loading…',failed:'Could not load, try again later',dev:'Developer',links:{vndb:'VNDB developer page',site:'Official site',moegirl:'Moegirlpedia',bangumi:'Bangumi',jawiki:'Japanese Wikipedia'}},
 ja:{devNone:'このブランドの紹介は今は読み込めません',devSource:'紹介文の出典：VNDB',devSourceMoegirl:'紹介文の出典：萌娘百科（CC BY-NC-SA 3.0）',devSourceBangumi:'紹介文の出典：Bangumi',devOpen:'ブラウザで開く',loading:'読み込み中…',failed:'読み込めませんでした。あとでもう一度',dev:'ブランド',links:{vndb:'VNDB のブランドページ',site:'公式サイト',moegirl:'萌娘百科（中国語）',bangumi:'Bangumi',jawiki:'日本語版ウィキペディア'}}};
export const devWords=locale=>W[locale]||W.zh;
export const isImg=u=>typeof u==='string'&&u.startsWith('data:image/');
const logos=new Map();
/* the logo of one developer (a data: URL) or null: asked once per developer while the app runs, three at a time at most */
let active=0;const waiting=[];
const slot=()=>new Promise(r=>{const go=()=>{active++;r();};active<3?go():waiting.push(go);});
const free=()=>{active--;const n=waiting.shift();if(n)n();};
export function logoOf(api,pid){let p=logos.get(pid);if(!p){p=slot().then(()=>Promise.resolve(api('seed_logo',{pid})).catch(()=>null)).then(u=>{free();return isImg(u)?u:null;});logos.set(pid,p);}return p;}
/* fills a logo chip (its letter stays when there is no icon) */
export function fillLogo(el,api,pid){logoOf(api,pid).then(u=>{if(!u||!el.isConnected)return;const img=new Image();img.alt='';img.decoding='async';img.onload=()=>{el.textContent='';el.append(img);el.classList.add('has-img');};img.src=u;});}
export const logoChip=(name,pid,esc)=>`<i class="dev-logo" aria-hidden="true" data-pid="${esc(pid)}">${esc(Array.from(name||'?')[0]||'?')}</i>`;
/* the panel: the introduction is text (escaped); the links are buttons the service opens */
export function devPanelHTML(info,t,esc){
 if(!info||!Array.isArray(info.links))return `<p class="sc-panel-note">${esc(t.devNone)}</p>`;
 const ok=new Set(['vndb','site','moegirl','bangumi','jawiki']),from={moegirl:t.devSourceMoegirl,bangumi:t.devSourceBangumi}[info.source]||t.devSource;
 return `${info.intro?`<p class="sc-intro">${esc(info.intro)}<small>${esc(from)}</small></p>`:''}<ul class="sc-links">${info.links.filter(l=>ok.has(l.kind)).map(l=>`<li><button type="button" class="sc-link" data-link="${esc(l.kind)}" title="${esc(t.devOpen)}">${esc(t.links[l.kind]||l.kind)}<span aria-hidden="true"> ↗</span></button></li>`).join('')}</ul>`;
}
/* loads the panel into `panel` once and wires its link buttons */
export async function openPanel({panel,pid,api,t,esc,toast,locale=''}){
 if(!panel.dataset.loaded){panel.dataset.loaded='1';panel.innerHTML=`<p class="sc-panel-note">${esc(t.loading)}</p>`;let info=null;try{info=await api('seed_producer',{pid,locale});}catch{}panel.innerHTML=devPanelHTML(info,t,esc);if(!info)delete panel.dataset.loaded;}
 if(!panel.dataset.bound){panel.dataset.bound='1';panel.addEventListener('click',async e=>{const l=e.target.closest('[data-link]');if(!l)return;e.stopPropagation();try{await api('seed_producer_open',{pid,kind:l.dataset.link});}catch{toast&&toast(t.failed);}});}
}
/* library cards: a logo chip before the title (the developer comes from VNDB through the game's VNDB id) */
export function initLibraryDevelopers({api,locale,esc=s=>String(s)}){
 let by={};const t=devWords(locale);
 const decorate=card=>{const id=card.dataset.game,d=by[id],caption=card.querySelector('.game-caption');if(!caption)return;let chip=caption.querySelector('.dev-logo');
  if(!d){chip?.remove();return;}if(chip&&chip.dataset.pid===d.pid)return;chip?.remove();
  (caption.querySelector('.mq')||caption).insertAdjacentHTML('afterbegin',logoChip(d.name||d.original,d.pid,esc));chip=caption.querySelector('.dev-logo');chip.title=d.original||d.name;fillLogo(chip,api,d.pid);};
 const scan=root=>{if(root.querySelectorAll)root.querySelectorAll('.library-card .game-card[data-game]').forEach(decorate);};
 const load=async()=>{let r=null;try{r=await api('library_developers',{});}catch{}by=r&&r.byGame&&typeof r.byGame==='object'?r.byGame:{};scan(document);};
 new MutationObserver(list=>{for(const m of list)for(const n of m.addedNodes)if(n.nodeType===1){if(n.matches?.('.library-card')||n.querySelector?.('.library-card'))scan(n);}}).observe(document.documentElement,{childList:true,subtree:true});
 load();setInterval(load,60000);addEventListener('megulit-covers-changed',()=>setTimeout(load,1500));
 return {reload:load};
}
/* the game page: a developer card at the top of the right-hand info column of the overview (logo, name, VNDB / Moegirlpedia introduction,
   links), shown at once, no click. The card is kept apart from the page's own markup (the overview is drawn again on every tab switch)
   and put back by place(tab). */
export function mountDetailDeveloper({main,id,api,locale,esc,toast,isCurrent=()=>true}){
 const t=devWords(locale),card=document.createElement('section');card.className='dev-card';card.hidden=true;let ready=false;
 const place=(tab='overview')=>{if(!ready)return;const aside=tab==='overview'?main.querySelector('.detail-aside'):null;if(aside){if(card.parentNode!==aside||aside.firstChild!==card)aside.prepend(card);card.hidden=false;}else{card.remove();}};
 (async()=>{let d=null;try{d=await api('game_developer',{id});}catch{}if(!d||!isCurrent())return;
  const name=d.original||d.name;
  card.innerHTML=`<header class="dev-card-head">${logoChip(name,d.pid,esc)}<div><small>${esc(t.dev)}</small><b>${esc(name)}</b></div></header><div class="dev-card-body" data-body></div>`;
  fillLogo(card.querySelector('.dev-logo'),api,d.pid);ready=true;place(main.querySelector('.detail-tabs [aria-selected="true"]')?.dataset.detailTab||'overview');
  openPanel({panel:card.querySelector('[data-body]'),pid:d.pid,api,t,esc,toast,locale});})();
 return {place};
}
