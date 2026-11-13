/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-14 (user: JLPT 覆盖 每一级都能点开，看这一级的词，能收录、能标简单): a window listing one JLPT level's words,
   for all games or one game. Filters 全部 / 读到过 / 已收录 / 未读到, search, sort by times read, bulk select.
   收录 saves the word (word book, and Anki through the usual sync); 简单 marks it known (status 3) so it is no longer
   a gap; both can be undone. N1 has ~2,700 words, so rows are virtualised (fixed height, only the visible slice drawn).
   Meanings come with the list when cached, the rest are asked for as rows scroll into view. */
export const jlptWordMessages={
 zh:{title:'{level} 词表',scope:'全部游戏',all:'全部',met:'读到过',saved:'已收录',unmet:'未读到',search:'搜索词、读音或释义',sortCount:'按读到次数',sortKana:'按读音',
  times:'次',never:'没读到过',save:'收录',unsave:'取消收录',easy:'简单',uneasy:'取消简单',selectAll:'全选当前列表',selected:'已选 {n} 个',bulkSave:'收录所选',bulkEasy:'所选标为简单',
  close:'关闭',empty:'这一栏没有词',failed:'操作失败',metShare:'读到',savedShare:'收录',from:'出自',loading:'正在读取词表…',noMeaning:''},
 ja:{title:'{level} の語彙',scope:'すべてのゲーム',all:'すべて',met:'出会った',saved:'登録済み',unmet:'未読',search:'語・読み・意味で検索',sortCount:'出会った回数順',sortKana:'読み順',
  times:'回',never:'未読',save:'登録',unsave:'登録を外す',easy:'簡単',uneasy:'簡単を外す',selectAll:'表示中をすべて選択',selected:'{n} 語を選択',bulkSave:'選んだ語を登録',bulkEasy:'選んだ語を簡単に',
  close:'閉じる',empty:'該当する語はありません',failed:'操作できませんでした',metShare:'出会った',savedShare:'登録',from:'出典',loading:'語彙を読み込み中…',noMeaning:''},
 en:{title:'{level} words',scope:'All games',all:'All',met:'Met',saved:'Saved',unmet:'Not met',search:'Search word, reading or meaning',sortCount:'Most read',sortKana:'By reading',
  times:'×',never:'not met',save:'Save',unsave:'Unsave',easy:'Easy',uneasy:'Not easy',selectAll:'Select all shown',selected:'{n} selected',bulkSave:'Save selected',bulkEasy:'Mark selected easy',
  close:'Close',empty:'No words here',failed:'Could not do that',metShare:'met',savedShare:'saved',from:'From',loading:'Loading the word list…',noMeaning:''}
};
export const JW_ROW=66;
const KNOWN_STATUS=3;
const kata2hira=s=>String(s||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
/* The rows a filter, search and sort leave (pure, tested). */
export function filterJlptWords(words,{filter='all',query='',sort='count'}={}){
 const q=kata2hira(String(query||'').trim().toLowerCase());
 let out=(words||[]).filter(w=>filter==='met'?w.count>0:filter==='saved'?w.saved:filter==='unmet'?!w.count:true);
 if(q)out=out.filter(w=>[...(w.forms||[w.base]),w.reading,w.meaning].some(t=>kata2hira(String(t||'').toLowerCase()).includes(q)));
 return out.sort(sort==='kana'?(a,b)=>String(a.reading||a.base).localeCompare(String(b.reading||b.base),'ja'):(a,b)=>b.count-a.count||String(a.reading||a.base).localeCompare(String(b.reading||b.base),'ja'));
}
export function jlptTotals(words){const t={all:0,met:0,saved:0,unmet:0};for(const w of words||[]){t.all++;if(w.count)t.met++;else t.unmet++;if(w.saved)t.saved++;}return t;}
/* The visible slice of a virtualised list: first/last index drawn for a scroll position (pure, tested). */
export function visibleRange(scrollTop,height,count,row=JW_ROW,over=6){const first=Math.max(0,Math.floor(scrollTop/row)-over),last=Math.min(count,Math.ceil((scrollTop+height)/row)+over);return {first,last};}

export async function openJlptWords({api,locale,esc,number,toast,level,gameId='',onChange=()=>{},enhance=()=>{}}){
 const t=jlptWordMessages[locale]||jlptWordMessages.zh,pctOf=(n,d)=>`${d?Math.round(n/d*1000)/10:0}%`;
 document.querySelector('dialog.jw-dialog')?.remove();
 const dlg=document.createElement('dialog');dlg.className='jw-dialog';dlg.setAttribute('aria-label',t.title.replace('{level}',level));
 dlg.innerHTML=`<header class="jw-head"><div class="jw-title"><h2>${esc(t.title.replace('{level}',level))}</h2><span class="jw-scope" data-jw-scope>${esc(t.scope)}</span></div><p class="jw-share" data-jw-share></p><button type="button" class="icon-button jw-close" data-jw-close aria-label="${esc(t.close)}" title="${esc(t.close)}">✕</button></header>
  <div class="jw-tools"><div class="stg-tabs jw-filters" role="tablist">${['all','met','saved','unmet'].map(f=>`<button type="button" role="tab" data-jw-filter="${f}" aria-selected="${f==='all'}" class="${f==='all'?'active':''}">${esc(t[f])} <b data-jw-n="${f}"></b></button>`).join('')}</div>
  <input type="search" class="jw-search" data-jw-search placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" autocomplete="off" spellcheck="false"><select class="jw-sort" data-jw-sort aria-label="${esc(t.sortCount)}"><option value="count">${esc(t.sortCount)}</option><option value="kana">${esc(t.sortKana)}</option></select></div>
  <div class="jw-bulk"><label class="jw-check"><input type="checkbox" data-jw-all><span>${esc(t.selectAll)}</span></label><span class="jw-count" data-jw-selected></span><button type="button" class="secondary" data-jw-bulk="save" disabled>${esc(t.bulkSave)}</button><button type="button" class="secondary" data-jw-bulk="easy" disabled>${esc(t.bulkEasy)}</button></div>
  <div class="jw-scroll" data-jw-scroll tabindex="0"><div class="jw-space" data-jw-space><p class="jw-empty">${esc(t.loading)}</p></div></div>`;
 document.body.append(dlg);dlg.showModal();try{enhance(dlg);}catch{}
 const $=s=>dlg.querySelector(s),scroll=$('[data-jw-scroll]'),space=$('[data-jw-space]');
 const state={filter:'all',query:'',sort:'count',busy:new Set(),selected:new Set(),asked:new Set(),view:[]};let words=[],changed=false,closed=false,liveTimer=0;
 const close=()=>{if(closed)return;closed=true;dlg.close();dlg.remove();if(changed)onChange();};
 $('[data-jw-close]').onclick=close;dlg.addEventListener('cancel',e=>{e.preventDefault();close();});dlg.addEventListener('click',e=>{if(e.target===dlg)close();});
 const byKey=new Map();
 const row=(w,i)=>{const busy=state.busy.has(w.key),from=w.games?.[0]?.title;
  return `<div class="jw-row${w.known?' is-known':w.saved?' is-saved':''}${w.count?'':' is-unmet'}" role="listitem" style="transform:translateY(${i*JW_ROW}px)" data-key="${esc(w.key)}">
   <label class="jw-pick"><input type="checkbox" data-jw-pick="${esc(w.key)}"${state.selected.has(w.key)?' checked':''} aria-label="${esc(w.base)}"></label>
   <div class="jw-word"><b lang="ja">${esc(w.base)}</b>${w.reading&&w.reading!==kata2hira(w.base)?`<i lang="ja">${esc(w.reading)}</i>`:''}<span class="jw-def">${esc(w.meaning||'')}</span></div>
   <div class="jw-read"><span class="jw-n">${w.count?`<b>${number(w.count)}</b> ${esc(t.times)}`:esc(t.never)}</span>${from?`<small title="${esc(w.games.map(g=>g.title).join(' · '))}">${esc(from)}</small>`:''}</div>
   <div class="jw-acts"><button type="button" class="secondary jw-act" data-jw-act="save" aria-pressed="${w.saved&&!w.known}"${busy||w.known?' disabled':''}>${esc(w.saved&&!w.known?t.unsave:t.save)}</button><button type="button" class="secondary jw-act" data-jw-act="easy" aria-pressed="${w.known}"${busy?' disabled':''}>${esc(w.known?t.uneasy:t.easy)}</button></div></div>`;};
 let raf=0;const draw=()=>{raf=0;const v=state.view;if(!v.length){space.style.height='';space.innerHTML=`<p class="jw-empty">${esc(t.empty)}</p>`;return;}
  space.style.height=`${v.length*JW_ROW}px`;const {first,last}=visibleRange(scroll.scrollTop,scroll.clientHeight||600,v.length);
  let html='';for(let i=first;i<last;i++)html+=row(v[i],i);space.innerHTML=html;askMeanings(v.slice(first,last));};
 const redraw=()=>{if(!raf)raf=requestAnimationFrame(draw);};
 const counts=()=>{const tot=jlptTotals(words);for(const f of Object.keys(tot)){const b=dlg.querySelector(`[data-jw-n="${f}"]`);if(b)b.textContent=number(tot[f]);}
  $('[data-jw-share]').innerHTML=`<b>${pctOf(tot.met,tot.all)}</b> ${esc(t.metShare)} · <b>${pctOf(tot.saved,tot.all)}</b> ${esc(t.savedShare)} · ${number(tot.met)} / ${number(tot.all)}`;
  const n=state.selected.size;$('[data-jw-selected]').textContent=n?t.selected.replace('{n}',number(n)):'';dlg.querySelectorAll('[data-jw-bulk]').forEach(b=>b.disabled=!n);
  const all=$('[data-jw-all]');all.checked=!!state.view.length&&state.view.every(w=>state.selected.has(w.key));all.indeterminate=!all.checked&&state.view.some(w=>state.selected.has(w.key));};
 const refilter=()=>{state.view=filterJlptWords(words,state);counts();redraw();};
 /* meanings for rows on screen that have none yet, asked in small batches */
 let askTimer=0;const askMeanings=list=>{const need=list.filter(w=>!w.meaning&&!state.asked.has(w.key));if(!need.length)return;need.forEach(w=>state.asked.add(w.key));clearTimeout(askTimer);
  askTimer=setTimeout(()=>api('jlpt_describe',{items:need.slice(0,40).map(w=>({key:w.key,base:w.base}))}).then(r=>{if(closed)return;let any=false;for(const m of r||[]){const w=byKey.get(m.key);if(w&&m.meaning){w.meaning=m.meaning;if(m.reading)w.reading=kata2hira(m.reading);any=true;}}if(any)redraw();}).catch(()=>{}),120);};
 /* one action on one word; returns true when it changed */
 async function act(w,kind,{quiet=false}={}){if(state.busy.has(w.key))return false;state.busy.add(w.key);redraw();
  try{if(kind==='save'){if(w.saved&&!w.known&&w.vocabId!=null){await api('delete_word',{id:w.vocabId});w.saved=false;w.vocabId=null;}
     else if(!w.saved){const r=await api('reading_save_word',{key:w.key,base:w.base,gameId:gameId||null});w.saved=true;w.vocabId=r?.id??w.vocabId;}}
   else{if(w.known&&w.vocabId!=null){await api('set_word_status',{id:w.vocabId,status:0});w.known=false;}
     else if(!w.known){const r=await api('reading_save_word',{key:w.key,base:w.base,gameId:gameId||null,status:KNOWN_STATUS});w.saved=true;w.known=true;w.vocabId=r?.id??w.vocabId;}}
   changed=true;clearTimeout(liveTimer);liveTimer=setTimeout(()=>{if(!closed){changed=false;onChange();}},600);return true;}
  catch{if(!quiet)toast?.(`${t.failed} · ${w.base}`);return false;}
  finally{state.busy.delete(w.key);if(!closed){counts();redraw();}}}
 space.addEventListener('click',e=>{const b=e.target.closest('[data-jw-act]');if(!b)return;const w=byKey.get(b.closest('[data-key]')?.dataset.key);if(w)act(w,b.dataset.jwAct).then(ok=>{if(ok&&state.filter!=='all')refilter();});});
 space.addEventListener('change',e=>{const c=e.target.closest('[data-jw-pick]');if(!c)return;if(c.checked)state.selected.add(c.dataset.jwPick);else state.selected.delete(c.dataset.jwPick);counts();});
 $('[data-jw-all]').addEventListener('change',e=>{for(const w of state.view){if(e.target.checked)state.selected.add(w.key);else state.selected.delete(w.key);}counts();redraw();});
 dlg.querySelectorAll('[data-jw-bulk]').forEach(b=>b.addEventListener('click',async()=>{const kind=b.dataset.jwBulk,list=words.filter(w=>state.selected.has(w.key)&&(kind==='save'?!w.saved:!w.known));
  dlg.querySelectorAll('[data-jw-bulk]').forEach(x=>x.disabled=true);let fail=0;for(const w of list){if(closed)return;if(!await act(w,kind,{quiet:true}))fail++;}
  if(fail)toast?.(`${t.failed} · ${number(fail)}`);state.selected.clear();refilter();}));
 dlg.querySelectorAll('[data-jw-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.jwFilter;dlg.querySelectorAll('[data-jw-filter]').forEach(x=>{const on=x===b;x.classList.toggle('active',on);x.setAttribute('aria-selected',String(on));});scroll.scrollTop=0;refilter();}));
 let typing=0;$('[data-jw-search]').addEventListener('input',e=>{clearTimeout(typing);typing=setTimeout(()=>{state.query=e.target.value;scroll.scrollTop=0;refilter();},120);});
 $('[data-jw-sort]').addEventListener('change',e=>{state.sort=e.target.value;scroll.scrollTop=0;refilter();});
 scroll.addEventListener('scroll',redraw,{passive:true});
 try{const data=await api('jlpt_words',{level,gameId:gameId||null});if(closed)return;words=data.words||[];for(const w of words)byKey.set(w.key,w);
  if(data.gameTitle)$('[data-jw-scope]').textContent=data.gameTitle;space.setAttribute('role','list');refilter();}
 catch(error){if(!closed)space.innerHTML=`<p class="jw-empty">${esc(String(error?.message||error))}</p>`;}
 return dlg;
}
