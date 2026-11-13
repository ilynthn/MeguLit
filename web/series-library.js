import {messages} from './i18n.js';
import * as selectMotion from './library-select-motion.js';
export function libraryEntries(model,query='',selecting=false){
 const state=model.collections||{series:[],memberships:[],suggestions:[]},term=query.normalize('NFKC').toLocaleLowerCase().trim(),matches=values=>values.some(v=>String(v||'').normalize('NFKC').toLocaleLowerCase().includes(term));
 const memberIds=new Set(state.memberships.map(m=>m.gameId));
 return {series:selecting?[]:state.series.filter(s=>!term||matches([s.name,s.originalName,...s.aliases])),games:model.games.filter(g=>term?matches([g.title,...(g.aliases||[])]):selecting||!memberIds.has(g.id)),
  suggestions:state.suggestions};
}
export function sortMembers(games,members,mode,locale){
 const byId=new Map(members.map(m=>[m.gameId,m])),fallback=(a,b)=>(byId.get(a.id)?.customOrder??0)-(byId.get(b.id)?.customOrder??0)||a.title.localeCompare(b.title,
  locale)||a.id.localeCompare(b.id);
 const value=g=>{const m=byId.get(g.id);if(mode==='story')return m.storyOrder;if(mode==='release')return m.releaseOrder??(m.releasedOn?Date.parse(m.releasedOn)/86400000:null);
  return null;};
 return [...games].sort((a,b)=>{if(mode==='name')return a.title.localeCompare(b.title,locale)||fallback(a,b);if(mode==='recent')return (b.lastPlayedAt||0)-(a.lastPlayedAt||0)||fallback(a,
  b);if(mode==='story'||mode==='release'){const x=value(a),y=value(b);if(x==null&&y!=null)return 1;if(x!=null&&y==null)return -1;if(x!=null&&y!=null&&x!==y)return x-y;
  }return fallback(a,b);});
}
export function createSeriesLibrary(env){
 const selected=new Set(),managementOpen=new Set();let selecting=false;
 const w=()=>messages[env.locale()].series,esc=env.esc,icon=env.icon;
 const state=()=>env.model().collections||{series:[],memberships:[],suggestions:[]};
 const commit=async(action,params)=>{try{const result=await env.api(action,params);await env.reload();return result;}catch(error){env.toast(w().failed);throw error;
  }};
 function image(series){if(series.cover)return series.cover;const member=state().memberships.filter(m=>m.seriesId===series.id).sort((a,b)=>a.customOrder-b.customOrder).map(m=>env.model().games.find(g=>g.id===m.gameId)).find(g=>g?.cover);
  return member?.cover||'';}
 function collectionCard(series,cls='',pending=null){const src=pending?pending.src:image(series),ids=pending?new Set(pending.ids):new Set(state().memberships.filter(m=>m.seriesId===series.id).map(m=>m.gameId)),games=env.model().games.filter(g=>ids.has(g.id)),
  seconds=games.reduce((sum,g)=>sum+(g.readingSeconds||0),0),words=games.reduce((sum,g)=>sum+(g.learnedWords||0),0),last=Math.max(0,...games.map(g=>g.lastPlayedAt||0)),
  installed=games.filter(g=>g.available).length,sw=w();return `<div class="library-card series-collection ${cls}" data-series-drop="${esc(series.id)}"><button class="game-card" data-series="${esc(series.id)}"><span class="cover-frame">${src?`<img class="cover" src="${esc(src)}" alt="" loading="lazy">`:`<span class="hero-placeholder">${icon('library')}</span>`}<span class="game-hover"><strong>${esc(series.name)}</strong><span>${sw.installedCount} · ${installed}/${games.length}</span><span>${sw.totalReading} · ${env.duration(seconds)}</span><span>${sw.totalWords} · ${env.number(words)}</span><span>${sw.lastPlayed} · ${env.relativeTime(last)}</span></span></span><span class="game-caption">${esc(series.name)}</span><span class="library-card-meta"><span class="series-caption"><span>${esc(sw.count(series.count))}</span><span class="series-stack">${icon('layers')}</span></span><span class="library-card-numbers"><span>${icon('clock')}${env.duration(seconds)}</span><span>${icon('book')}${env.number(words)}</span></span></span></button></div>`;
  }
 function gameCard(game,member,manage=false,cls=''){const order=selected.has(game.id)?[...selected].indexOf(game.id)+1:0;return `<div class="series-game ${order?'is-selected':''} ${cls}" data-member-id="${esc(game.id)}" draggable="true">${manage?'':marks(order)}${env.card(game,true)}${member?`<span class="series-installed ${game.available?'available':''}">${esc(game.available?w().installed:w().missing)}</span>`:''}${manage&&member?`<div class="series-member-tools"><button class="text-button" data-order-move="up" data-id="${esc(game.id)}" title="${esc(w().up)}">↑</button><button class="text-button" data-order-move="down" data-id="${esc(game.id)}" title="${esc(w().down)}">↓</button><button class="text-button" data-remove-member="${esc(game.id)}">${w().remove}</button></div><details class="series-order-editor"><summary>${w().orderEdit}</summary>${[['storyOrder','number',w().storyNumber],['releaseOrder','number',w().releaseNumber],['releasedOn','date',w().releaseDate],['edition','text',w().edition]].map(([key,type,label])=>`<label><span>${label}</span><input data-member-field="${key}" data-id="${esc(game.id)}" type="${type}" ${type==='number'?'step="any"':''} value="${esc(member[key]??'')}" placeholder="${esc(w().unknown)}"></label>`).join('')}</details>`:''}</div>`;
  }
 function bindGames(target,seriesId=null,ordered=[]){
  env.bindGames(target);
  target.querySelectorAll('[data-member-id]').forEach(node=>bindMember(node,seriesId,ordered));
 }
 function bindMember(node,seriesId=null,ordered=[]){
   node.addEventListener('click',event=>{if(!selecting)return;event.preventDefault();event.stopImmediatePropagation();toggleOne(node);},{capture:true});
   
   node.ondragstart=event=>{if(selecting){event.preventDefault();return;}event.dataTransfer.setData('application/x-megulit-game',node.dataset.memberId);event.dataTransfer.effectAllowed='move';};
   if(seriesId){node.ondragover=event=>{if(state().series.find(s=>s.id===seriesId)?.sortMode==='custom'){event.preventDefault();node.classList.add('series-drop-target');
    }};node.ondragleave=()=>node.classList.remove('series-drop-target');node.ondrop=async event=>{event.preventDefault();node.classList.remove('series-drop-target');
    if(state().series.find(s=>s.id===seriesId)?.sortMode!=='custom')return;const id=event.dataTransfer.getData('application/x-megulit-game'),ids=ordered.map(g=>g.id),
    a=ids.indexOf(id),b=ids.indexOf(node.dataset.memberId);if(a<0||b<0||a===b)return;ids.splice(a,1);ids.splice(b,0,id);await commit('series_order',{id:seriesId,
    gameIds:ids}).catch(()=>{});};}
 }
 /* Blueprint selection marks: ticks, frame and hover check. Hidden until .lib-selecting. (2026-11-14: no running-number tag; no numbering in the UI) */
 function marks(){return `<span class="bp-sel" aria-hidden="true"><i class="bp-ticks"></i><i class="bp-frame"></i><i class="bp-box">${icon('check')}</i></span>`;}
 function countParts(){const probe=987654321,text=String(w().selected(probe)),at=text.indexOf(String(probe));return at<0?[text,'']:[text.slice(0,at).trim(),text.slice(at+String(probe).length).trim()];}
 const backLabel=()=>({zh:'返回',en:'Back',ja:'戻る'})[env.locale()]||'Back';
 /* the bar: count, then either the two actions or the inline name field (no modal: naming needs neither interruption nor protected focus) */
 function barHTML(){const [pre,post]=countParts(),sw=w();return `<div class="bp-bar" role="toolbar" aria-label="${esc(sw.select)}"><i class="bp-rule" aria-hidden="true"></i><span class="bp-tagline" aria-hidden="true"><span class="bp-code"><i></i></span><span class="bp-label">select</span></span><span class="bp-count-wrap" aria-live="polite" aria-label="${esc(sw.selected(selected.size))}">${pre?`<span>${esc(pre)}</span>`:''}<span class="bp-count"><span>${selected.size}</span></span>${post?`<span>${esc(post)}</span>`:''}</span><span class="bp-actions"><button type="button" class="bp-create" data-create ${selected.size<2?'disabled':''}>${icon('layers')}<span>${esc(sw.create)}</span></button><button type="button" class="bp-cancel" data-select-cancel>${esc(sw.cancel)}</button></span><form class="bp-name" hidden><input class="bp-input" name="name" required maxlength="200" autocomplete="off" placeholder="${esc(sw.name)}" aria-label="${esc(sw.name)}"><button class="bp-create" type="submit" data-name-confirm>${icon('layers')}<span>${esc(sw.create)}</span></button><button type="button" class="bp-cancel" data-name-back>${esc(backLabel())}</button></form></div>`;}
 function bindBar(root){const bar=root.querySelector('.bp-bar');if(!bar)return;const form=bar.querySelector('.bp-name'),input=form.querySelector('input');
  bar.querySelector('[data-create]').addEventListener('click',()=>{if(selected.size<2)return;bar.classList.add('is-naming');form.hidden=false;selectMotion.naming(bar,true);input.focus();});
  const back=()=>{bar.classList.remove('is-naming');form.hidden=true;selectMotion.naming(bar,false);bar.querySelector('[data-create]')?.focus();};
  bar.querySelector('[data-name-back]').addEventListener('click',back);input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();back();}});
  form.addEventListener('submit',e=>{e.preventDefault();const name=input.value.trim();if(!name){input.focus();return;}form.querySelector('[data-name-confirm]').disabled=true;createInPlace(root,name,[...selected]);});
  bar.querySelector('[data-select-cancel]').addEventListener('click',()=>toggleSelection(root));}
 function bindCollection(node){node.querySelector('[data-series]')?.addEventListener('click',()=>env.openSeries(node.dataset.seriesDrop));
  node.ondragover=e=>{e.preventDefault();node.classList.add('series-drop-target');};node.ondragleave=()=>node.classList.remove('series-drop-target');
  node.ondrop=async e=>{e.preventDefault();node.classList.remove('series-drop-target');const id=e.dataTransfer.getData('application/x-megulit-game');if(env.model().games.some(g=>g.id===id))await commit('series_assign',
   {id:node.dataset.seriesDrop,gameIds:[id]}).catch(()=>{});};}
 const nodeOf=(root,id)=>root.querySelector(`.series-game[data-member-id="${CSS.escape(id)}"]`);
 /* one card: class toggle, update the bar. No re-render. */
 function toggleOne(node){const root=node.closest('#library-results')||node.parentElement,id=node.dataset.memberId,on=!selected.has(id),before=selected.size;
  if(on)selected.add(id);else selected.delete(id);
  node.classList.toggle('is-selected',on);node.querySelector('.game-card')?.setAttribute('aria-pressed',String(on));
  root.classList.toggle('bp-has',selected.size>0);syncBar(root,before);selectMotion.toggle(node,on);}
 function syncBar(root,before){const bar=root.querySelector('.bp-bar');if(!bar)return;selectMotion.count(bar,selected.size,before);
  bar.querySelector('.bp-count-wrap')?.setAttribute('aria-label',w().selected(selected.size));const b=bar.querySelector('[data-create]');if(!b)return;const was=b.disabled;b.disabled=selected.size<2;if(was&&!b.disabled)selectMotion.arm(b);
  if(selected.size<2&&bar.classList.contains('is-naming'))bar.querySelector('[data-name-back]')?.click();}
 function clearPicks(root){for(const id of selected){const n=nodeOf(root,id);if(!n)continue;n.classList.remove('is-selected');n.querySelector('.game-card')?.removeAttribute('aria-pressed');}selected.clear();}
 function setModeClasses(root,on){root.classList.toggle('lib-selecting',on);root.classList.toggle('bp-has',on&&selected.size>0);if(on){clearTimeout(layerTimer);root.classList.add('bp-layers');}else dropLayers(root);}
 let layerTimer=0;
 function dropLayers(root){clearTimeout(layerTimer);layerTimer=setTimeout(()=>{if(selecting)return;if(selectMotion.isBusy())return dropLayers(root);(window.requestIdleCallback||setTimeout)(()=>{if(!selecting)root.classList.remove('bp-layers');});},400);}
 /* the plain grid renders both modes at once: collection cards carry .bp-norm-only, games that already sit in a collection
    carry .bp-sel-only, so entering or leaving the mode is a class toggle and never inserts or removes cards (a mid-grid
    insert restyles every following card, ~50 ms). */
 const inPlace=root=>!!root?.classList.contains('lib-list')&&!!root.querySelector(':scope>.library-grid')&&!root.querySelector('.series-suggestions');
 const modeOnly=grid=>!!grid.querySelector(':scope>:is(.bp-sel-only,.bp-norm-only)');
 async function toggleSelection(root){if(!root||selectMotion.isBusy())return;
  if(!inPlace(root)||(selecting&&env.libraryView?.()!=='list')){selecting=!selecting;selected.clear();renderLibrary(root);if(selecting)selectMotion.enter(root,()=>{});return;}
  const grid=root.querySelector('.library-grid'),reflow=modeOnly(grid);
  if(!selecting){selecting=true;selected.clear();root.querySelector('.library-empty-hint')?.remove();await selectMotion.prepare();
   await selectMotion.enter(root,()=>{const on=()=>{root.insertAdjacentHTML('beforeend',barHTML());bindBar(root);setModeClasses(root,true);};if(reflow)selectMotion.flip(grid,on);else on();});return;}
  await selectMotion.leave(root,()=>{const off=()=>{selecting=false;clearPicks(root);root.querySelector('.bp-bar')?.remove();setModeClasses(root,false);};if(reflow)selectMotion.flip(grid,off);else off();});}
 /* create from the bar. One cut at t=0: the picked cards become members (.bp-sel-only, they stay in the DOM) and a
    placeholder collection card is appended (CSS order puts collections first), so the grid changes once and never shifts
    again. The stack animation runs straight through; the service result only fills the placeholder in. */
 async function createInPlace(root,name,ids){const grid=root.querySelector('.library-grid'),nodes=ids.map(id=>nodeOf(root,id)).filter(Boolean);
  const src=nodes[0]?.querySelector('img.cover')?.getAttribute('src')||'';
  const job=env.api('series_create',{name,gameIds:ids}).then(async result=>{await env.refresh();return result;});
  let card=null;
  await selectMotion.create({root,nodes,apply:()=>{selecting=false;clearPicks(root);nodes.forEach(n=>n.classList.add('bp-sel-only'));setModeClasses(root,false);
   grid.insertAdjacentHTML('beforeend',collectionCard({id:'',name,count:ids.length},'bp-norm-only bp-pending',{src,ids}));card=grid.lastElementChild;return card;}});
  try{const result=await job,series=state().series.find(s=>s.id===result.id);if(!series||!card)throw Error('SERIES_MISSING');
   const t=document.createElement('template');t.innerHTML=collectionCard(series,'bp-norm-only');card.dataset.seriesDrop=series.id;card.classList.remove('bp-pending');
   card.replaceChildren(...t.content.firstElementChild.childNodes);bindCollection(card);settle(grid,card);}
  catch{env.toast(w().failed);card?.remove();nodes.forEach(n=>n.classList.remove('bp-sel-only'));}}
 function settle(grid,card){setTimeout(()=>(window.requestIdleCallback||setTimeout)(()=>{if(!card.isConnected||selectMotion.isBusy())return;const first=[...grid.children].find(n=>!n.classList.contains('series-collection'));if(first&&card.compareDocumentPosition(first)&Node.DOCUMENT_POSITION_PRECEDING)grid.insertBefore(card,first);}),1600);}
 function renderLibrary(target){if(!target)return;const model=env.model(),query=env.search(),entries=libraryEntries(model,query,selecting);for(const id of selected)if(!model.games.some(g=>g.id===id))selected.delete(id);
  const scroll=target.querySelector('.library-grid')?.scrollTop||0;
  const suggestions=!selecting&&entries.suggestions.length?`<details class="series-suggestions"><summary>${w().suggest} · ${entries.suggestions.length}</summary>${entries.suggestions.map((s,i)=>`<div><span>${esc(model.games.find(g=>g.id===s.gameId)?.title||'')} → ${esc(s.name)}</span><button class="text-button" data-suggest="${i}" data-accept="true">${w().accept}</button><button class="text-button" data-suggest="${i}" data-accept="false">${w().dismiss}</button></div>`).join('')}</details>`:'';
  let cards;
  if(selecting||env.libraryView?.()==='list'){const normal=libraryEntries(model,query,false),picking=libraryEntries(model,query,true),inNormal=new Set(normal.games.map(g=>g.id)),inPicking=new Set(picking.games.map(g=>g.id));
   cards=normal.series.map(s=>collectionCard(s,'bp-norm-only')).join('')+model.games.filter(g=>inNormal.has(g.id)||inPicking.has(g.id)).map(g=>gameCard(g,null,false,!inNormal.has(g.id)?'bp-sel-only':!inPicking.has(g.id)?'bp-norm-only':'')).join('');}
  else cards=entries.series.map(s=>collectionCard(s)).join('')+entries.games.map(g=>gameCard(g)).join('');
  /* the bar goes last: inserting it before the grid would restyle every card (sibling invalidation) */
  target.innerHTML=`${suggestions}<div class="games-grid library-grid">${cards}</div>${selecting?barHTML():''}`;
  bindGames(target);bindBar(target);target.classList.toggle('bp-has',selecting&&selected.size>0);if(selecting)target.classList.add('bp-layers');
  target.querySelectorAll('[data-series-drop]').forEach(bindCollection);
  target.querySelectorAll('[data-suggest]').forEach(b=>b.onclick=()=>{const s=entries.suggestions[Number(b.dataset.suggest)];commit('series_suggestion',{gameId:s.gameId,
   key:s.key,accept:b.dataset.accept==='true'}).catch(()=>{});});
  if(!entries.games.length&&!entries.series.length)target.insertAdjacentHTML('beforeend',`<p class="settings-help library-empty-hint">${esc(env.text().noResults)}</p>`);
  const grid=target.querySelector('.games-grid');
  env.onLibraryRendered?.(grid,selecting);
  if(target.classList.contains('lib-list'))grid.scrollTop=scroll;
 }
 function createCollection(ids){const dialog=env.modal(`<h2>${w().create}</h2><form><label class="form-label">${w().name}<input class="form-input" name="name" required maxlength="200" autofocus></label><div class="dialog-actions"><button type="button" class="secondary" data-cancel>${w().close}</button><button class="primary" type="submit">${w().create}</button></div></form>`);
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const name=dialog.querySelector('input').value.trim();
  if(!name)return;const b=dialog.querySelector('[type=submit]');b.disabled=true;try{const result=await commit('series_create',{name,gameIds:ids});selecting=false;
  selected.clear();dialog.close();env.openSeries(result.id);}catch{b.disabled=false;}};}
 function chooseCollection(ids){const dialog=env.modal(`<h2>${w().addTo}</h2><div class="series-picker">${state().series.map(s=>`<button class="secondary" data-pick-series="${esc(s.id)}">${esc(s.name)}</button>`).join('')||`<p class="settings-help">${w().noCollections}</p>`}<button class="text-button" data-new>${w().create}</button><button class="text-button" data-close>${w().close}</button></div>`);
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-new]').onclick=()=>{dialog.close();createCollection(ids);};dialog.querySelectorAll('[data-pick-series]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;try{await commit('series_assign',{id:b.dataset.pickSeries,gameIds:ids});dialog.close();}catch{b.disabled=false;}});}
 function renderDetail(main,id){selecting=false;selected.clear();const s=state().series.find(s=>s.id===id);if(!s){env.back();return;}const members=state().memberships.filter(m=>m.seriesId===id),
  games=env.model().games.filter(g=>members.some(m=>m.gameId===g.id)),ordered=sortMembers(games,members,s.sortMode,env.locale()),src=image(s),sw=w();
  main.innerHTML=`<button class="text-button detail-back" data-series-back>← ${sw.back}</button><section class="panel game-detail-hero series-hero"><div class="detail-cover">${src?`<img class="cover" src="${esc(src)}" alt="">`:icon('library')}</div><div class="detail-title"><div class="eyebrow">${sw.collection}</div><h1>${esc(s.name)}</h1>${s.originalName?`<p class="settings-help">${esc(s.originalName)}</p>`:''}${s.developer?`<p class="settings-help">${esc(s.developer)}</p>`:''}<p>${sw.count(games.length)}</p></div></section><details class="series-management panel" ${managementOpen.has(id)?'open':''}><summary>${sw.manage}</summary><div class="series-management-fields">${[['name',sw.name],['originalName',sw.original],['developer',sw.developer]].map(([key,label])=>`<label>${label}<input data-series-field="${key}" value="${esc(s[key])}" maxlength="200"></label>`).join('')}<label>${sw.aliases}<textarea data-series-field="aliases" rows="2">${esc(s.aliases.join('\n'))}</textarea></label></div><div class="review-controls series-cover-row"><button class="secondary" data-series-cover>${sw.cover}</button><button class="secondary" data-series-add>${sw.add}</button><button class="text-button detail-remove" data-series-dissolve>${sw.dissolve}</button></div></details><div class="section-header"><h2>${sw.count(games.length)}</h2><select data-series-sort aria-label="${sw.sort}">${['story','release','name','recent','custom'].map(k=>`<option value="${k}" ${k===s.sortMode?'selected':''}>${sw[k==='name'?'nameSort':k]}</option>`).join('')}</select></div>${s.sortMode==='story'&&members.some(m=>m.storyOrder==null)?`<p class="settings-help">${sw.noStory}</p>`:''}${s.sortMode==='release'&&members.some(m=>!m.releasedOn&&m.releaseOrder==null)?`<p class="settings-help">${sw.noRelease}</p>`:''}${s.sortMode==='custom'?`<p class="settings-help">${sw.drag}</p>`:''}<div class="games-grid library-grid series-members">${ordered.map(g=>gameCard(g,members.find(m=>m.gameId===g.id),true)).join('')}</div>${!games.length?`<p class="settings-help">${sw.empty}</p>`:''}`;
  main.querySelector('.series-management').ontoggle=e=>{if(e.currentTarget.open)managementOpen.add(id);else managementOpen.delete(id);};main.querySelector('[data-series-back]').onclick=env.back;
   main.querySelector('[data-series-sort]').onchange=e=>commit('series_update',{id,values:{sortMode:e.target.value}}).catch(()=>{});
  main.querySelectorAll('[data-series-field]').forEach(input=>input.onchange=()=>commit('series_update',{id,values:{[input.dataset.seriesField]:input.dataset.seriesField==='aliases'?input.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean):input.value}}).catch(()=>{
   }));
  main.querySelector('[data-series-cover]').onclick=async()=>{try{const p=await env.invoke('pick_image');if(p)await commit('series_cover',{id,path:p});}catch{}};
  main.querySelector('[data-series-add]').onclick=()=>{const dialog=env.modal(`<h2>${sw.choose}</h2><div class="series-picker">${env.model().games.map(g=>`<label><input type="checkbox" data-series-member="${esc(g.id)}" ${members.some(m=>m.gameId===g.id)?'checked':''}>${esc(g.title)}</label>`).join('')}</div><button class="secondary" data-close>${sw.close}</button>`);
   dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelectorAll('[data-series-member]').forEach(b=>b.onchange=()=>commit(b.checked?'series_assign':'series_remove',
   {id,gameIds:[b.dataset.seriesMember]}).catch(()=>b.checked=!b.checked));};
  main.querySelector('[data-series-dissolve]').onclick=()=>{const dialog=env.modal(`<h2>${sw.dissolveTitle}</h2><p>${sw.dissolveHint}</p><div class="dialog-actions"><button class="secondary" data-no>${sw.close}</button><button class="primary" data-yes>${sw.confirm}</button></div>`);
   dialog.querySelector('[data-no]').onclick=()=>dialog.close();dialog.querySelector('[data-yes]').onclick=async e=>{e.target.disabled=true;try{await commit('series_dissolve',
   {id});dialog.close();env.back();}catch{e.target.disabled=false;}};};
  bindGames(main,id,ordered);main.querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=()=>commit('series_remove',{id,gameIds:[b.dataset.removeMember]}).catch(()=>{
   }));
  main.querySelectorAll('[data-member-field]').forEach(input=>input.onchange=()=>commit('series_member_update',{id,gameId:input.dataset.id,values:{[input.dataset.memberField]:input.type==='number'?input.value===''?null:Number(input.value):input.value}}).catch(()=>{
   }));
  main.querySelectorAll('[data-order-move]').forEach(b=>b.onclick=()=>{const ids=ordered.map(g=>g.id),a=ids.indexOf(b.dataset.id),n=a+(b.dataset.orderMove==='up'?-1:1);
   if(n<0||n>=ids.length)return;[ids[a],ids[n]]=[ids[n],ids[a]];commit('series_order',{id,gameIds:ids}).catch(()=>{});});
 }
 return {renderLibrary,renderDetail,toggleSelection,chooseCollection};
}
