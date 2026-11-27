// SPDX-License-Identifier: GPL-3.0-or-later
// Ratings strip for five community platforms. Choosing one drops down that
// platform's reviews with paging and optional machine translation.
export const receptionMessages={
 zh:{title:'评分与社区评价',loading:'正在获取作品资料…',empty:'暂未获取到可核实的评分或评价',votes:'人评价',positive:'好评',reviews:'社区评价',helpful:'人觉得有帮助',source:'查看原文',technical:'技术资料',translated:'机器翻译',
  fetched:'获取时间',noSynopsis:'暂未获取到作品简介，联网后会自动重试',regions:{zh:'中文',ja:'日本',en:'English'},notFound:'未收录',failed:'获取失败',openSite:'打开原站',matched:'匹配',total:'共 {n} 条',
  translate:'翻译',translating:'翻译中…',showOriginal:'原文',auto:'自动检测',from:'源语言',to:'目标语言',perPage:'每页',rows:'条',prev:'上一页',next:'下一页',go:'跳转',pageInput:'页码',likes:'赞',
  useful:'有用',funny:'欢乐',replies:'回复',views:'浏览',points:'分',spoiler:'含剧透，点击显示',more:'阅读全文',full:'展开全文',fullLess:'收起全文',fullLoading:'正在获取全文…',fullFailed:'全文获取失败，可点右侧链接查看',
  recommended:'推荐',notRecommended:'不推荐',noReviews:'这个平台暂时没有评论',loadingReviews:'正在载入评论…',autoTranslate:'自动翻译',restore:'恢复原文',showTranslation:'显示译文',translateFailed:'翻译失败',
  rateLimited:'免费机翻请求过于频繁，请稍后再试，或在 设置 → 翻译 中改用其他评价翻译引擎',engineNames:{machine:'免费机翻',follow:'API / 云端模型',local:'本地大模型'},engine:'翻译方式',engineHelp:'免费机翻最快，支持多种语言，用多了会被暂时限流；API / 云端模型用设置里选的翻译引擎，译文更自然但消耗额度，只能译成中文或英文；本地大模型离线但较慢。推荐免费机翻，被限流时换 API',
  hours:'游玩 {n} 小时',expand:'展开',collapse:'收起',retry:'重试'},
 ja:{title:'評価とコミュニティレビュー',loading:'作品情報を取得中…',empty:'確認できる評価はまだ取得できていません',votes:'件の評価',positive:'好評',reviews:'コミュニティレビュー',helpful:'人が参考になったと評価',source:'原文を読む',
  technical:'技術情報',translated:'機械翻訳',fetched:'取得日時',noSynopsis:'紹介文をまだ取得できていません。接続時に再試行します',regions:{zh:'中国語',ja:'日本',en:'English'},notFound:'未登録',failed:'取得失敗',
  openSite:'サイトを開く',matched:'一致',total:'全 {n} 件',translate:'翻訳',translating:'翻訳中…',showOriginal:'原文',auto:'自動検出',from:'翻訳元',to:'翻訳先',perPage:'表示件数',rows:'件',prev:'前へ',
  next:'次へ',go:'移動',pageInput:'ページ',likes:'いいね',useful:'参考になった',funny:'面白い',replies:'返信',views:'閲覧',points:'点',spoiler:'ネタバレを含みます。クリックで表示',more:'全文を読む',full:'全文を表示',
  fullLess:'全文を閉じる',fullLoading:'全文を取得中…',fullFailed:'全文を取得できませんでした。右のリンクから確認できます',recommended:'おすすめ',notRecommended:'おすすめしない',noReviews:'このサイトにはまだレビューがありません',loadingReviews:'レビューを読み込み中…',
  autoTranslate:'自動翻訳',restore:'原文に戻す',showTranslation:'翻訳を表示',translateFailed:'翻訳に失敗しました',rateLimited:'無料機械翻訳のリクエストが多すぎます。しばらく待つか、設定 → 翻訳 でレビューの翻訳エンジンを変更してください',
  engineNames:{machine:'無料機械翻訳',follow:'API・クラウド',local:'ローカルモデル'},engine:'翻訳方法',engineHelp:'無料機械翻訳は最速で多言語対応、多用すると一時的に制限されます。API・クラウドは設定の翻訳エンジンを使い、自然な訳ですが利用枠を消費し、中国語か英語のみ。ローカルモデルはオフラインですが遅め。推奨は無料機械翻訳、制限されたら API へ',
  hours:'プレイ {n} 時間',expand:'続きを読む',collapse:'閉じる',retry:'再試行'},
 en:{title:'Ratings and community reviews',loading:'Fetching game information…',empty:'No verified ratings or reviews retrieved yet',votes:'votes',positive:'positive',
  reviews:'Community reviews',helpful:'found this helpful',source:'Read source',technical:'Technical information',translated:'Machine translated',fetched:'Retrieved',
  noSynopsis:'No synopsis retrieved yet. It will retry when connected',regions:{zh:'Chinese',ja:'Japan',en:'English'},notFound:'Not listed',failed:'Unavailable',
  openSite:'Open site',matched:'Matched',total:'{n} reviews',translate:'Translate',translating:'Translating…',showOriginal:'Original',auto:'Detect',from:'From',
  to:'To',perPage:'Per page',rows:'rows',prev:'Previous',next:'Next',go:'Go',pageInput:'Page',likes:'likes',useful:'helpful',funny:'funny',replies:'replies',views:'views',
  points:'points',spoiler:'Contains spoilers. Click to show',more:'Read full review',full:'Show full review',fullLess:'Hide full review',fullLoading:'Fetching the full review…',
  fullFailed:'Could not fetch the full review; use the link on the right',recommended:'Recommended',notRecommended:'Not recommended',noReviews:'No reviews on this platform yet',
  loadingReviews:'Loading reviews…',autoTranslate:'Auto translate',restore:'Show original',showTranslation:'Show translation',translateFailed:'Translation failed',
  rateLimited:'Free machine translation is rate limited. Try again later, or choose another review translation engine in Settings → Translation',engineNames:{machine:'Free machine',
  follow:'API / cloud model',local:'Local model'},engine:'Translator',engineHelp:'Free machine translation is fastest and supports many languages, but heavy use is rate limited. API / cloud model uses the engine chosen in Settings: more natural, uses your quota, Chinese or English only. Local model works offline but is slower. Recommended: free machine; switch to API when rate limited',
  hours:'{n} h played',expand:'Show more',collapse:'Show less',retry:'Retry'}
};
const LANG_NAMES={'auto':null,'zh-CN':'简体中文','zh-TW':'繁體中文','ja':'日本語','en':'English','ko':'한국어'};
const SIZES=[10,20,50];
const PLATFORMS=[['bangumi','Bangumi','zh'],['twodfan','2DFan','zh'],['egs','批評空間','ja'],['vndb','VNDB','en'],['steam','Steam','en']];
const states=new Map();let reviewEngine=null;
const stored=(key,fallback)=>{try{return localStorage.getItem('megulit.reviews.'+key)??fallback;}catch{return fallback;}};
const store=(key,value)=>{try{localStorage.setItem('megulit.reviews.'+key,value);}catch{}};
/* E291 (user: switch Steam reviews between language regions) */
const STEAM_LANG_KEYS=['all','schinese','tchinese','japanese','english'];
const STEAM_LANG_WORDS={zh:{steamLang:'评价语言',steamLangs:{all:'全部语言',schinese:'简体中文',tchinese:'繁体中文',japanese:'日语',english:'英语'}},en:{steamLang:'Review language',
 steamLangs:{all:'All languages',schinese:'Simplified Chinese',tchinese:'Traditional Chinese',japanese:'Japanese',english:'English'}},ja:{steamLang:'レビューの言語',steamLangs:{
 all:'すべての言語',schinese:'簡体字中国語',tchinese:'繁体字中国語',japanese:'日本語',english:'英語'}}};
for(const [k,v] of Object.entries(STEAM_LANG_WORDS))if(receptionMessages[k])Object.assign(receptionMessages[k],v);
function stateFor(id,locale){if(!states.has(id))states.set(id,{steamLang:stored('steamLang','all'),summary:null,open:'',page:1,data:null,loading:false,error:'',
 auto:stored('auto','0')==='1',translate:stored('auto','0')==='1',engineUsed:'',translateError:'',source:'auto',target:stored('target',{zh:'zh-CN',ja:'ja',en:'en'}[locale]),
 size:Number(stored('size',10))||10,translations:new Map(),revealed:new Set(),expanded:new Set(),full:new Map(),fullOpen:new Set(),busy:false});return states.get(id);
 }
function fromEnrichment(value){if(!value)return null;if(Array.isArray(value.platforms))return value.platforms;return PLATFORMS.map(([key,name,region])=>key==='vndb'&&value.vndb?{key,name,region,available:true,value:value.vndb.rating,
 scale:10,votes:value.vndb.votes,url:value.vndb.url}:key==='steam'&&value.steam?{key,name,region,available:true,value:value.steam.percent,scale:'%',votes:value.steam.total,
 url:value.steam.url}:{key,name,region,pending:true});}
function scoreHTML(p,w,esc){if(p.pending)return '<strong class="review-score is-pending">…</strong><small>&nbsp;</small>';if(!p.available)return `<strong class="review-score is-missing">—</strong><small>${p.error?w.failed:w.notFound}</small>`;
 const v=p.value;const main=v==null?'—':p.scale==='%'?v+'%':p.scale===10?String(+Number(v).toFixed(2)):String(v);const unit=v==null?'':p.scale==='%'?` <small>${w.positive}</small>`:` <small>/${p.scale}</small>`;
 return `<strong class="review-score">${esc(main)}${unit}</strong><small>${esc(Number(p.votes||0).toLocaleString())} ${w.votes}</small>`;}
function ratingBadge(r){if(!r)return '';return `<span class="review-rating">${r.scale===100?r.value:Number(r.value)}<small>/${r.scale}</small></span>`;}
function statsHTML(item,w){const parts=[];if(item.likes!=null&&(item.likes||item.platform!=='egs'))parts.push(`${item.likes} ${item.points?w.points:item.useful?w.useful:w.likes}`);
 if(item.funny)parts.push(`${item.funny} ${w.funny}`);if(item.replies)parts.push(`${item.replies} ${w.replies}`);if(item.views)parts.push(`${item.views.toLocaleString()} ${w.views}`);
 if(item.hours)parts.push(w.hours.replace('{n}',item.hours));return parts.map(t=>`<span>${t}</span>`).join('');}
function textOf(state,item){const full=state.fullOpen.has(item.id)&&state.full.get(item.id);return typeof full==='string'&&full?full:item.text;}
function tkey(state,item){return item.id+(textOf(state,item)!==item.text?'#full':'')+'|'+state.source+'|'+state.target;}
function translatedCount(state){return (state.data?.items||[]).filter(item=>state.translations.has(tkey(state,item))).length;}
function itemHTML(item,state,w,esc,platform){
 const body=textOf(state,item),key=tkey(state,item),translated=state.translate?state.translations.get(key):'',hidden=item.spoiler&&!state.revealed.has(item.id),
  long=(translated||body).length>360||(translated||body).split(String.fromCharCode(10)).length>8,open=state.expanded.has(item.id),fullState=state.full.get(item.id),
  fullOpen=state.fullOpen.has(item.id);
 const view={...item,platform,points:platform==='vndb',useful:platform==='steam'};
 return `<article class="review-item${hidden?' is-spoiler':''}" data-review-id="${esc(item.id)}"><header><strong>${esc(item.author||'—')}</strong>${ratingBadge(item.rating)}${item.recommended!=null?`<span class="review-verdict${item.recommended?'':' is-negative'}">${item.recommended?w.recommended:w.notRecommended}</span>`:''}${item.kind?`<span class="review-kind">${esc(item.kind)}</span>`:''}<time>${esc(item.date||'')}</time></header>
 <div class="review-body">${hidden?`<button type="button" class="review-spoiler" data-reveal="${esc(item.id)}">${w.spoiler}</button>`:''}<p class="${long&&!open?'is-clamped':''}">${esc(translated||item.text)}</p>${long?`<button type="button" class="review-expand" data-expand="${esc(item.id)}">${open?w.collapse:w.expand}</button>`:''}${item.more&&!hidden?`<button type="button" class="review-expand review-full" data-full="${esc(item.id)}" ${fullState===null?'disabled':''}>${fullState===null?w.fullLoading:fullOpen&&fullState?w.fullLess:w.full}</button>${fullState===false?`<small class="review-full-error">${w.fullFailed}</small>`:''}`:''}${translated&&!hidden?`<details class="review-original"><summary>${w.translated} · ${w.showOriginal}</summary><p>${esc(body)}</p></details>`:''}</div>
 <footer>${statsHTML(view,w)}${item.url&&(item.more||platform!=='bangumi')?`<button type="button" class="text-button" data-review-open="${esc(item.url)}">${w.source} ↗</button>`:''}</footer></article>`;
}
function pagerHTML(data,w){const {page,pages}=data;const nums=new Set([1,pages,page-1,page,page+1].filter(n=>n>=1&&n<=pages));let last=0,html='';for(const n of [...nums].sort((a,
 b)=>a-b)){if(n-last>1)html+='<span class="review-gap">…</span>';html+=`<button type="button" class="rv-page${n===page?' is-current':''}" data-rv-page="${n}" ${n===page?'aria-current="page"':''}>${n}</button>`;
 last=n;}
 return `<nav class="review-pager" aria-label="${w.pageInput}"><button type="button" class="rv-page" data-rv-page="${page-1}" ${page<=1?'disabled':''} aria-label="${w.prev}">‹</button>${html}<button type="button" class="rv-page" data-rv-page="${page+1}" ${page>=pages?'disabled':''} aria-label="${w.next}">›</button><label class="review-jump"><input type="number" min="1" max="${pages}" value="${page}" data-review-jump aria-label="${w.pageInput}"><span>/ ${pages}</span></label><button type="button" class="review-go" data-review-go>${w.go}</button></nav>`;
  }
function langOptions(selected,withAuto,w){return Object.entries(LANG_NAMES).filter(([k])=>withAuto||k!=='auto').map(([k,name])=>`<option value="${k}" ${k===selected?'selected':''}>${name||w.auto}</option>`).join('');
 }
function drawerHTML(state,w,esc){
 const platform=(state.summary||PLATFORMS.map(([key,name])=>({key,name}))).find(p=>p.key===state.open)||{},data=state.data;
 const head=`<div class="review-toolbar"><div class="rv-source"><strong>${esc(platform.name||'')}</strong>${data?.matched?`<span>${w.matched} ${esc(data.matched)}</span>`:''}${data?.available?`<span>${esc(w.total.replace('{n}',Number(data.total||0).toLocaleString()))}</span>`:''}${platform.url||data?.url?`<button type="button" class="text-button" data-review-open="${esc(data?.url||platform.url)}">${w.openSite} ↗</button>`:''}</div>
 <div class="rv-controls">${state.open==='steam'?`<label class="review-steam-lang"><select data-review-steam-lang aria-label="${w.steamLang}">${STEAM_LANG_KEYS.map(k=>`<option value="${k}" ${k===(state.steamLang||'all')?'selected':''}>${w.steamLangs[k]}</option>`).join('')}</select></label>`:''}<label class="review-engine" title="${esc(w.engineHelp)}"><select data-review-engine aria-label="${w.engine}">${['machine','follow','local'].map(k=>`<option value="${k}" ${k===(reviewEngine||'machine')?'selected':''}>${w.engineNames[k]}</option>`).join('')}</select></label><label class="review-auto"><input type="checkbox" data-review-auto ${state.auto?'checked':''}><span class="review-switch" aria-hidden="true"></span>${w.autoTranslate}</label><div class="review-translate"><select data-rv-source aria-label="${w.from}">${langOptions(state.source,true,w)}</select><span aria-hidden="true">→</span><select data-review-target aria-label="${w.to}">${langOptions(state.target,false,w)}</select><button type="button" class="review-translate-toggle" data-review-translate aria-pressed="${state.translate&&translatedCount(state)>0}" ${state.busy?'disabled':''} title="${state.engineUsed?w.engineNames[state.engineUsed]:''}">${state.busy?w.translating:state.translate&&translatedCount(state)?w.restore:translatedCount(state)?w.showTranslation:w.translate}</button></div><label class="review-size">${w.perPage}<select data-review-size>${SIZES.map(n=>`<option value="${n}" ${n===state.size?'selected':''}>${n} ${w.rows}</option>`).join('')}</select></label></div></div>${state.translateError?`<p class="review-status review-translate-error">${['REVIEW_HTTP_429','TRANSLATION_HTTP_429'].includes(state.translateError)?w.rateLimited:w.translateFailed+' · '+esc(state.translateError.slice(0,160))}</p>`:''}`;
 let body;
 if(state.loading&&!data)body=`<p class="review-status">${w.loadingReviews}</p>`;
 else if(state.error)body=`<p class="review-status">${w.failed} <button type="button" class="text-button" data-review-retry>${w.retry}</button></p>`;
 else if(!data?.available||!data.items.length)body=`<p class="review-status">${data&&!data.available?w.notFound:w.noReviews}</p>`;
 else body=`<div class="review-list${state.loading?' is-loading':''}">${data.items.map(item=>itemHTML(item,state,w,esc,state.open)).join('')}</div>${data.pages>1?pagerHTML(data,w):''}`;
 return `<div class="review-drawer"><div class="review-drawer-inner">${head}${body}</div></div>`;
}
export function receptionHTML(value,locale,esc,id=''){
 const w=receptionMessages[locale],state=id?stateFor(id,locale):null,platforms=state?.summary||fromEnrichment(value);
 if(!platforms)return `<section class="panel game-reception" data-reception="${esc(id)}"><h2 class="panel-title">${w.title}</h2><p class="settings-help">${w.loading}</p></section>`;
 if(!state?.open&&platforms.length&&platforms.every(p=>!p.available&&!p.pending&&p.error))return `<section class="panel game-reception" data-reception="${esc(id)}"><h2 class="panel-title">${w.title}</h2><p class="u-status" data-state="error">${w.failed}</p></section>`;
  return `<section class="panel game-reception" data-reception="${esc(id)}"><h2 class="panel-title">${w.title}</h2><div class="review-platforms" role="tablist">${platforms.map(p=>`<button type="button" role="tab" class="review-platform${p.pending?' is-pending':p.available?'':' is-unavailable'}" data-review-platform="${p.key}" aria-expanded="${state?.open===p.key}" aria-selected="${state?.open===p.key}" ${p.available||p.pending||state?.open===p.key?'':'aria-disabled="true"'}><span class="review-region">${w.regions[p.region]}</span><span class="review-name">${esc(p.name)}</span>${scoreHTML(p,w,esc)}</button>`).join('')}</div>${state?.open?drawerHTML(state,w,esc):''}${value?.at?`<small class="settings-help review-fetched">${w.fetched} · ${esc(new Date(value.at).toLocaleDateString({zh:'zh-CN',ja:'ja-JP',en:'en-US'}[locale]))}</small>`:''}</section>`;
}
export function bindReception(target,{api,id,locale,esc,value,openFirst=''}){
 const w=receptionMessages[locale],state=stateFor(id,locale);
 if(value?.platforms)state.summary=value.platforms;
 const section=()=>target.querySelector(`[data-reception="${CSS.escape(id)}"]`);
 const render=()=>{const old=section();if(!old)return;const wrap=document.createElement('div');wrap.innerHTML=receptionHTML(value,locale,esc,id);const next=wrap.firstElementChild;
  old.replaceWith(next);wire(next);};
 const translatePage=async()=>{
  const run=state.translationRun=Symbol(),page=state.data;
  const hadStatus=state.busy||!!state.translateError;
  state.translateError='';state.busy=false;
  if(!state.translate||!page?.items?.length){if(hadStatus)refreshList();return;}
  const pending=page.items.filter(item=>(!item.spoiler||state.revealed.has(item.id))&&!state.translations.has(tkey(state,item)));
  if(!pending.length){refreshList();return;}state.busy=true;refreshList();
  const current=()=>state.translationRun===run&&state.data===page&&state.translate;
  try{for(let at=0;at<pending.length;at+=2){
   const chunk=pending.slice(at,at+2),keys=chunk.map(item=>tkey(state,item));
   const result=await api('reviews_translate',{texts:chunk.map(item=>textOf(state,item)),source:state.source,target:state.target});
   if(!current())return;
   const texts=Array.isArray(result)?result:result.texts||[];
   state.engineUsed=result.engine||'machine';keys.forEach((key,i)=>{if(texts[i])state.translations.set(key,texts[i]);});
   if(result.error){state.translateError=result.error;break;}if(section())refreshList();
  }}catch(error){if(!current())return;state.translateError=String(error?.message||error);}
  state.busy=false;if(section())refreshList();};
 const load=async(page,scroll=true)=>{const ticket=state.ticket=(state.ticket||0)+1;state.translate=state.auto;state.loading=true;state.error='';render();try{const data=await api('game_reviews',
  {id,platform:state.open,page,size:state.size,lang:state.open==='steam'?state.steamLang||'all':'all'});if(ticket!==state.ticket)return;state.data=data;state.page=data.page;
  }catch(error){if(ticket!==state.ticket)return;state.page=page;state.error=String(error?.message||error);}state.loading=false;if(!section())return;render();if(scroll)section()?.querySelector('.review-toolbar')?.scrollIntoView({
  block:'nearest',behavior:'smooth'});translatePage();};
 const wire=root=>{
  root.querySelectorAll('[data-review-platform]').forEach(button=>button.onclick=()=>{const key=button.dataset.reviewPlatform,p=(state.summary||fromEnrichment(value)||[]).find(x=>x.key===key);
   if(p?.available&&p.hasReviews===false){if(p.url)api('open_source',{url:p.url}).catch(()=>{});return;}
   if(state.open===key){state.open='';state.data=null;render();return;}if(!p?.available&&!p?.pending)return;state.open=key;state.data=null;state.page=1;load(1);
   });
  root.querySelectorAll('[data-rv-page]').forEach(button=>button.onclick=()=>load(Number(button.dataset.rvPage)));
  const jump=root.querySelector('[data-review-jump]'),go=()=>{const n=Math.round(Number(jump.value));if(n>=1&&n<=(state.data?.pages||1))load(n);else jump.value=state.page;
   };
  root.querySelector('[data-review-go]')?.addEventListener('click',go);jump?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();go();
   }});
  root.querySelector('[data-review-steam-lang]')?.addEventListener('change',event=>{state.steamLang=event.target.value;store('steamLang',state.steamLang);state.data=null;
   load(1);});
  root.querySelector('[data-review-size]')?.addEventListener('change',event=>{const first=(state.page-1)*state.size;state.size=Number(event.target.value);store('size',
   state.size);load(Math.floor(first/state.size)+1);});
  root.querySelector('[data-rv-source]')?.addEventListener('change',event=>{state.source=event.target.value;translatePage();});
  root.querySelector('[data-review-target]')?.addEventListener('change',event=>{state.target=event.target.value;store('target',state.target);translatePage();});
  // One button: translate this page, then switch between the original and the translation.
  root.querySelector('[data-review-translate]')?.addEventListener('click',()=>{const shown=state.translate&&translatedCount(state)>0;state.translate=!shown;if(state.translate)translatePage();
   else refreshList();});
  root.querySelector('[data-review-engine]')?.addEventListener('change',async event=>{const value=event.target.value;try{await api('settings_save',{scope:'translation',
   values:{reviewEngine:value}});reviewEngine=value;state.translations.clear();state.translateError='';if(state.translate)translatePage();else refreshList();}catch{
   event.target.value=reviewEngine||'machine';}});
  root.querySelector('[data-review-auto]')?.addEventListener('change',event=>{state.auto=event.target.checked;store('auto',state.auto?'1':'0');if(state.auto){state.translate=true;
   translatePage();}});
  import('./select-control.js').then(m=>{if(root.isConnected)m.enhanceSelects(root);}).catch(()=>{});
  root.querySelector('[data-review-retry]')?.addEventListener('click',()=>load(state.page));
  root.querySelector('.rv-source [data-review-open]')?.addEventListener('click',event=>api('open_source',{url:event.currentTarget.dataset.reviewOpen}).catch(()=>{
   }));
  wireItems(root);
 };
 const wireItems=root=>{
  // "Show more" only when the clamped text really overflows (sources such as VNDB already send a short preview).
  requestAnimationFrame(()=>root.querySelectorAll('.review-list [data-expand]').forEach(button=>{const id=button.dataset.expand,p=button.parentElement.querySelector('p');
   if(!p)return;if(state.expanded.has(id)){p.classList.add('is-clamped');const overflow=p.scrollHeight>p.clientHeight+2;p.classList.remove('is-clamped');button.hidden=!overflow;
   }else button.hidden=p.scrollHeight<=p.clientHeight+2;}));
  root.querySelectorAll('.review-list [data-expand]').forEach(button=>button.onclick=()=>{const id=button.dataset.expand;state.expanded.has(id)?state.expanded.delete(id):state.expanded.add(id);
   refreshList();});
  root.querySelectorAll('.review-list [data-full]').forEach(button=>button.onclick=async()=>{const id=button.dataset.full,item=(state.data?.items||[]).find(x=>x.id===id);
   if(!item)return;if(state.fullOpen.has(id)&&state.full.get(id)){state.fullOpen.delete(id);refreshList();return;}if(typeof state.full.get(id)==='string'&&state.full.get(id)){
   state.fullOpen.add(id);state.expanded.add(id);refreshList();if(state.translate)translatePage();return;}state.full.set(id,null);refreshList();try{const result=await api('review_full',
   {platform:state.open,url:item.url});const text=String(result?.text||'').trim();state.full.set(id,text||false);if(text){state.fullOpen.add(id);state.expanded.add(id);
   }}catch{state.full.set(id,false);}if(section()){refreshList();if(state.translate)translatePage();}});
  root.querySelectorAll('.review-list [data-reveal]').forEach(button=>button.onclick=()=>{state.revealed.add(button.dataset.reveal);refreshList();if(state.translate)translatePage();
   });
  root.querySelectorAll('.review-list [data-review-open]').forEach(button=>button.onclick=()=>api('open_source',{url:button.dataset.reviewOpen}).catch(()=>{}));
 };
 // Translation and per-item changes only swap the list and the translate button, so an open dropdown stays open.
 const refreshList=()=>{const root=section(),list=root?.querySelector('.review-list');if(!root||!list){render();return;}const wrap=document.createElement('div');
  wrap.innerHTML=receptionHTML(value,locale,esc,id);const fresh=wrap.querySelector('.review-list');if(!fresh){render();return;}list.replaceWith(fresh);
  const button=root.querySelector('[data-review-translate]'),next=wrap.querySelector('[data-review-translate]');if(button&&next){button.textContent=next.textContent;
   button.disabled=next.disabled;button.title=next.title;button.setAttribute('aria-pressed',next.getAttribute('aria-pressed'));}
  root.querySelector('.review-translate-error')?.remove();const error=wrap.querySelector('.review-translate-error');if(error)root.querySelector('.review-toolbar')?.after(error);
   wireItems(root);};
 const root=section();if(value?.platforms)render();else if(root)wire(root);
 if(openFirst&&!state.autoOpened&&state.summary?.some(p=>p.key===openFirst&&p.available)){state.autoOpened=true;if(!state.open){state.open=openFirst;load(1,false);}}
 if(reviewEngine===null){reviewEngine='';api('settings_get').then(settings=>{reviewEngine=settings?.values?.translation?.reviewEngine||'machine';const select=section()?.querySelector('[data-review-engine]');
  if(select&&select.value!==reviewEngine){select.value=reviewEngine;select.dispatchEvent(new Event('change-sync'));render();}}).catch(()=>{reviewEngine='machine';
  });}
 if(!state.summary&&!state.summaryLoading){state.summaryLoading=true;api('game_reviews_summary',{id}).then(result=>{state.summary=result.platforms;}).catch(()=>{
  state.summary=PLATFORMS.map(([key,name,region])=>({key,name,region,available:false,error:'REVIEW_NETWORK'}));}).finally(()=>{state.summaryLoading=false;render();
  });}
}
