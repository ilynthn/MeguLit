const words={
 zh:{expand:'展开',collapse:'收起',source:'简介来源',moegirl:'萌娘百科',bangumi:'Bangumi',missing:'这个来源暂无作品简介'},
 ja:{expand:'続きを読む',collapse:'閉じる',source:'あらすじの出典',moegirl:'萌娘百科',bangumi:'Bangumi',missing:'この出典のあらすじはありません'},
 en:{expand:'Read more',collapse:'Collapse',source:'Synopsis source',moegirl:'Moegirlpedia',bangumi:'Bangumi',missing:'No synopsis available from this source'},
};
export function synopsisContentHTML(synopsis,{locale,esc,placeholder,expanded=false}){
 const w=words[locale];
 return `<p class="game-synopsis" id="game-synopsis-body">${esc(synopsis.text||placeholder)}</p><div class="synopsis-footer"><small class="settings-help synopsis-source">${esc(synopsis.source||'')}</small>${synopsis.text?`<button type="button" class="text-button" data-synopsis-toggle aria-expanded="${expanded}" aria-controls="game-synopsis-body">${expanded?w.collapse:w.expand}<span aria-hidden="true">⌄</span></button>`:''}</div>`;
}
export function synopsisHTML({locale,esc,icon,title,refresh,source,actions=true}){
 const w=words[locale];
 return `<section class="panel synopsis-panel"><div class="section-header"><h2 class="panel-title">${title}</h2>${actions?`<div class="synopsis-actions"><select data-synopsis-source aria-label="${esc(w.source)}"><option value="bangumi"${source==='bangumi'?' selected':''}>${w.bangumi}</option><option value="moegirl"${source==='moegirl'?' selected':''}>${w.moegirl}</option><option value="vndb"${source==='vndb'?' selected':''}>VNDB</option></select><button type="button" class="text-button" data-refresh>${icon('refresh')}${refresh}</button></div>`:''}</div><div class="synopsis-content" aria-live="polite"></div></section>`;
}
export const missingSynopsis=locale=>words[locale].missing;
/* E266: the synopsis opens and folds with a height animation, and the toggle only appears when the text is actually
   cut off at the current width (short synopses and wide windows show no button; resizing re-checks). */
const clampLines=5;
export function bindSynopsis(root,locale,onChange=()=>{}){const button=root.querySelector('[data-synopsis-toggle]');if(!button)return ()=>{};const panel=button.closest('.synopsis-panel'),body=panel.querySelector('.game-synopsis');const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const limit=()=>{const cs=getComputedStyle(body);const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.9;return Math.round(lh*clampLines);};
 const fits=()=>body.scrollHeight<=limit()+2;
 const sync=()=>{const short=fits();panel.classList.toggle('is-short',short);button.hidden=short;if(!panel.classList.contains('is-expanded'))body.style.maxHeight=short?'none':limit()+'px';};
 const label=expanded=>{button.innerHTML=(expanded?words[locale].collapse:words[locale].expand)+'<span aria-hidden="true">⌄</span>';};
 button.onclick=()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));label(expanded);
  const from=body.getBoundingClientRect().height,to=expanded?body.scrollHeight:limit();
  panel.classList.toggle('is-expanded',expanded);panel.classList.toggle('is-collapsed',!expanded);
  if(reduce){body.style.maxHeight=expanded?'none':to+'px';onChange(expanded);return;}
  body.style.maxHeight=from+'px';void body.offsetHeight;body.classList.add('is-animating');body.style.maxHeight=to+'px';
  const done=e=>{if(e&&e.propertyName!=='max-height')return;body.removeEventListener('transitionend',done);body.classList.remove('is-animating');if(panel.classList.contains('is-expanded'))body.style.maxHeight='none';};
  body.addEventListener('transitionend',done);setTimeout(()=>done(),600);onChange(expanded);};
 if(panel.classList.contains('is-expanded'))body.style.maxHeight='none';
 sync();const ro=new ResizeObserver(()=>sync());ro.observe(body);
 document.fonts?.ready?.then(()=>{if(body.isConnected)sync();});
 return ()=>ro.disconnect();}
