/* 2026-11-13 (user: "把＋卡移到最右边 不要是卡牌了 鼠标放上去再出来 … 点击之后给一个窗口 可以让用户自己在作品库里选要哪些卡牌到手牌")
   the hand editor: a tab docked on the right edge (QQ-style: hidden but for a sliver, slides out on hover, tucks back when the pointer
   leaves) opens a window listing the library; ticked games go into the home hand, the rest stay out. */

/* (user: "手卡上限10张牌") */
export const HAND_MAX=10;
const COPY={
 zh:{dock:'选择手牌',title:'选择手牌',sub:'勾选的作品放进首页手牌，没勾的不出现',search:'搜索作品',auto:'恢复按最近游玩',count:n=>`已选 ${n} / ${HAND_MAX}`,full:`最多 ${HAND_MAX} 张`,
  save:'保存',cancel:'取消',none:'没有找到作品',in:'在手牌中',out:'不在手牌'},
 ja:{dock:'手札を選ぶ',title:'手札を選ぶ',sub:'チェックした作品だけがホームの手札に並びます',search:'作品を検索',auto:'最近プレイ順に戻す',count:n=>`${n} / ${HAND_MAX} 枚`,full:`最大 ${HAND_MAX} 枚`,
  save:'保存',cancel:'キャンセル',none:'作品が見つかりません',in:'手札に入っています',out:'手札に入っていません'},
 en:{dock:'Choose hand',title:'Choose your hand',sub:'Ticked games are dealt into the home hand; the rest stay out',search:'Search games',auto:'Back to recently played',
  count:n=>`${n} / ${HAND_MAX} chosen`,full:`Up to ${HAND_MAX} cards`,save:'Save',cancel:'Cancel',none:'No games found',in:'In the hand',out:'Not in the hand'}};
export const pickerCopy=locale=>COPY[locale]||COPY.zh;

/* the showcase setting after the user's pick: the ticked ids in order make the hand; nothing ticked goes back to recently played */
export function applyHandPick(setting,ids){const s=setting&&typeof setting==='object'?setting:{},pick=[...new Set((ids||[]).filter(x=>typeof x==='string'))].slice(0,HAND_MAX);
 const list=k=>Array.isArray(s[k])?s[k]:[];
 return {mode:pick.length?'pick':'auto',order:pick,pinned:list('pinned').filter(id=>pick.includes(id)),hidden:list('hidden').filter(id=>!pick.includes(id))};}

/* rows for the window: the current hand first in its order, then the rest of the library by most recently played */
export function pickerRows(games,handIds){const all=(games||[]).filter(g=>g&&g.available!==false),when=g=>g.lastLaunchedAt||g.lastPlayedAt||0,inHand=new Set(handIds||[]);
 const first=(handIds||[]).map(id=>all.find(g=>g.id===id)).filter(Boolean),rest=all.filter(g=>!inHand.has(g.id)).sort((a,b)=>when(b)-when(a));return [...first,...rest];}

/* toggling one game: out → in while there is room, in → out always */
export function togglePick(ids,id){const has=ids.includes(id);if(has)return ids.filter(x=>x!==id);return ids.length>=HAND_MAX?ids:[...ids,id];}

/* the docked tab; returns the button */
export function createDock(root,{locale,onOpen}){const w=pickerCopy(locale),b=document.createElement('button');b.type='button';b.className='tv-dock';b.setAttribute('aria-label',w.dock);
 b.innerHTML=`<b aria-hidden="true">＋</b><span>${w.dock}</span>`;b.addEventListener('click',onOpen);
 /* (QQ-style) it stays out while the pointer is on it and tucks back a moment after the pointer leaves */
 let t=0;b.addEventListener('pointerenter',()=>{clearTimeout(t);b.classList.add('out');});b.addEventListener('pointerleave',()=>{clearTimeout(t);t=setTimeout(()=>b.classList.remove('out'),260);});
 b.addEventListener('focus',()=>b.classList.add('out'));b.addEventListener('blur',()=>b.classList.remove('out'));root.appendChild(b);return b;}

/* the window. games: the library; hand: ids now in the hand; onSave(setting) */
export function openHandPicker(root,{games,hand,setting,locale,esc,onSave}){root.querySelector('.tv-pick')?.remove();const w=pickerCopy(locale),rows=pickerRows(games,hand);
 let ids=[...(hand||[])].filter(id=>rows.some(g=>g.id===id)).slice(0,HAND_MAX);const back=document.activeElement;
 const wrap=document.createElement('div');wrap.className='tv-pick';wrap.innerHTML=`<div class="tv-pick-scrim" data-close></div><section class="tv-pick-win" role="dialog" aria-modal="true" aria-labelledby="tv-pick-h">
  <header><div><h2 id="tv-pick-h">${esc(w.title)}</h2><p>${esc(w.sub)}</p></div><button type="button" class="tv-pick-x" data-close aria-label="${esc(w.cancel)}">✕</button></header>
  <div class="tv-pick-bar"><input type="search" class="tv-pick-q" placeholder="${esc(w.search)}" aria-label="${esc(w.search)}"><span class="tv-pick-n" aria-live="polite"></span></div>
  <div class="tv-pick-grid" role="list">${rows.map(g=>`<button type="button" role="listitem" class="tv-pick-it" data-id="${esc(g.id)}" data-q="${esc([g.title,...(g.names||[])].join(' ').toLowerCase())}" title="${esc(g.title)}"><span class="cv">${g.cover?`<img src="${esc(g.cover)}" alt="" loading="lazy">`:`<em>${esc(g.title)}</em>`}<i class="tick" aria-hidden="true"></i></span><span class="nm">${esc(g.title)}</span></button>`).join('')}<p class="tv-pick-none" hidden>${esc(w.none)}</p></div>
  <footer><button type="button" class="tv-pick-auto">${esc(w.auto)}</button><span></span><button type="button" class="tv-pick-cancel" data-close>${esc(w.cancel)}</button><button type="button" class="tv-pick-save">${esc(w.save)}</button></footer></section>`;
 root.appendChild(wrap);const $=s=>wrap.querySelector(s);
 const paint=()=>{wrap.querySelectorAll('.tv-pick-it').forEach(el=>{const on=ids.includes(el.dataset.id);el.classList.toggle('on',on);el.setAttribute('aria-pressed',String(on));
  el.setAttribute('aria-label',`${el.title} · ${on?w.in:w.out}`);el.classList.toggle('blocked',!on&&ids.length>=HAND_MAX);});$('.tv-pick-n').textContent=w.count(ids.length)+(ids.length>=HAND_MAX?' · '+w.full:'');};
 const close=()=>{document.removeEventListener('keydown',key,true);wrap.classList.remove('in');setTimeout(()=>wrap.remove(),220);try{back?.focus?.();}catch{}};
 const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};document.addEventListener('keydown',key,true);
 wrap.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',close));
 wrap.querySelectorAll('.tv-pick-it').forEach(el=>el.addEventListener('click',()=>{ids=togglePick(ids,el.dataset.id);paint();}));
 $('.tv-pick-q').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();let any=false;wrap.querySelectorAll('.tv-pick-it').forEach(el=>{el.hidden=!!q&&!el.dataset.q.includes(q);any||=!el.hidden;});$('.tv-pick-none').hidden=any;});
 $('.tv-pick-auto').addEventListener('click',()=>{onSave(applyHandPick(setting,[]));close();});
 $('.tv-pick-save').addEventListener('click',()=>{onSave(applyHandPick(setting,ids));close();});
 paint();requestAnimationFrame(()=>requestAnimationFrame(()=>wrap.classList.add('in')));setTimeout(()=>$('.tv-pick-q')?.focus({preventScroll:true}),60);return {close,wrap};}
