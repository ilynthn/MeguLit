// SPDX-License-Identifier: GPL-3.0-or-later
/* E415 日报 page (top tab after 排行榜). Data: bridge daily_view (services/daily.cjs) → relay GET /api/news and
   GET /api/hotwords/daily. A newspaper layout in the grimoire palette: dateline strip, lead story, a ruled three-column
   row, a compact list, and a right rail of today's hot words. Clicking a word opens 学习 › 查词 with that word.
   Links open only through daily_open (the bridge accepts only links it just handed to this page). */
export const dailyLabel={zh:'日报',ja:'日報',en:'Daily'};
const W={
 zh:{kinds:{person:'人名',org:'组织',work:'作品',place:'地名',product:'商品',event:'事件'},mtNote:'当前为微软机器翻译，效果一般。想要更好的译文，可以在设置 › 翻译里接入自己的 AI API',mtGo:'去设置',mtClose:'不再提示',catGal:'Galgame',catAcg:'ACG · 动画漫画',glossFrom:{dict:'词典',ai:'AI 注释',mt:'机器翻译'},wReading:'读音',wGloss:'释义',wSource:'出处',trWhy:{LOCAL_MODEL_MISSING:'本地模型还没下载',API_KEY_MISSING:'没有填 API Key',TRANSLATION_HTTP_429:'翻译服务请求太频繁',NETWORK:'连不上翻译服务',TIMEOUT:'翻译服务超时',other:'翻译服务没有返回结果'},rdJa:'日文',rdTr:'译文',rdBi:'双语',rdOrig:'原文网页',rdClose:'关闭',rdLoading:'正在取原文…',rdFail:'原文暂时打不开，可以去原网页看',rdTrFail:'翻译暂时不可用',rdHint:'点一个词查词，拖选一段查短语',rdAnki:'加入 Anki · megulit_news',rdAnkiOk:'已加入 megulit_news',rdAnkiFail:'没加进 Anki：',rdMore:'在查词面板打开',rdNone:'词典里没查到',rdVia:{fast:'本机加速直连',direct:'本机直连',relay:'MeguLit 中转'},news:'Galgame 新闻',words:'今日热词',all:'全部',updated:'更新于',refresh:'刷新',issue:'第 {n} 号',lookup:'查词',read:'阅读原文',source:'来源',
  wordsNote:'每天从日本的热门检索里挑出 20 个词。点一个词，直接在查词面板里看释义和例句',noReading:'读音见词典',
  emptyTitle:'今天的报纸还在印刷',emptyText:'联网服务还没有送来新闻和热词。稍后再来，或者点刷新再试一次',errorTitle:'暂时连不上日报',errorText:'检查一下网络，或者稍后再刷新',
  noNews:'这一栏今天还没有新闻',noWords:'今天的热词还没整理好',more:'更多新闻',weekday:['日','一','二','三','四','五','六'],credit:'标题与摘要来自各站公开 RSS，点开阅读原文'},
 ja:{kinds:{person:'人名',org:'団体',work:'作品',place:'地名',product:'商品',event:'出来事'},mtNote:'現在は Microsoft の機械翻訳です。精度はそこそこです。より良い訳が必要なら、設定 › 翻訳で自分の AI API を接続できます',mtGo:'設定を開く',mtClose:'閉じる',catGal:'ギャルゲー',catAcg:'ACG · アニメ・マンガ',glossFrom:{dict:'辞書',ai:'AI 注釈',mt:'機械翻訳'},wReading:'読み',wGloss:'意味',wSource:'出典',trWhy:{LOCAL_MODEL_MISSING:'ローカルモデルが未ダウンロード',API_KEY_MISSING:'API キー未設定',TRANSLATION_HTTP_429:'翻訳サービスへの要求が多すぎます',NETWORK:'翻訳サービスに接続できません',TIMEOUT:'翻訳サービスがタイムアウトしました',other:'翻訳サービスから結果が返りませんでした'},rdJa:'日本語',rdTr:'翻訳',rdBi:'対訳',rdOrig:'元のページ',rdClose:'閉じる',rdLoading:'本文を取得中…',rdFail:'本文を取得できませんでした。元のページで読めます',rdTrFail:'翻訳は今使えません',rdHint:'単語をクリックで辞書、ドラッグでフレーズ検索',rdAnki:'Anki に追加 · megulit_news',rdAnkiOk:'megulit_news に追加しました',rdAnkiFail:'Anki に追加できません：',rdMore:'辞書パネルで開く',rdNone:'辞書に見つかりません',rdVia:{fast:'高速直結',direct:'直結',relay:'MeguLit 中継'},news:'ギャルゲーニュース',words:'今日の注目ワード',all:'すべて',updated:'更新',refresh:'更新',issue:'第 {n} 号',lookup:'辞書で調べる',read:'元記事を読む',source:'出典',
  wordsNote:'日本で今日よく検索されている言葉を 20 語。クリックすると辞書パネルで意味と例文を表示します',noReading:'読みは辞書で',
  emptyTitle:'今日の紙面は印刷中です',emptyText:'オンラインサービスからニュースとワードがまだ届いていません。しばらくしてから、または更新を押してください',errorTitle:'日報に接続できません',errorText:'ネットワークを確認するか、しばらくしてから更新してください',
  noNews:'この欄のニュースはまだありません',noWords:'今日のワードはまだ準備中です',more:'その他のニュース',weekday:['日','月','火','水','木','金','土'],credit:'見出しと要約は各サイトの公開 RSS より。クリックで元記事へ'},
 en:{kinds:{person:'Person',org:'Organisation',work:'Work',place:'Place',product:'Product',event:'Event'},mtNote:'This is Microsoft machine translation, so quality is limited. For better translations, connect your own AI API in Settings › Translation',mtGo:'Open settings',mtClose:'Dismiss',catGal:'Galgame',catAcg:'ACG · anime & manga',glossFrom:{dict:'dictionary',ai:'AI note',mt:'machine translation'},wReading:'Reading',wGloss:'Meaning',wSource:'Source',trWhy:{LOCAL_MODEL_MISSING:'the local model is not downloaded',API_KEY_MISSING:'no API key',TRANSLATION_HTTP_429:'too many requests to the translation service',NETWORK:'cannot reach the translation service',TIMEOUT:'the translation service timed out',other:'the translation service returned nothing'},rdJa:'Japanese',rdTr:'Translation',rdBi:'Bilingual',rdOrig:'Original page',rdClose:'Close',rdLoading:'Fetching the article…',rdFail:'Could not load the article. You can read it on the original page',rdTrFail:'Translation is unavailable right now',rdHint:'Click a word to look it up, drag to look up a phrase',rdAnki:'Add to Anki · megulit_news',rdAnkiOk:'Added to megulit_news',rdAnkiFail:'Could not add to Anki: ',rdMore:'Open in dictionary',rdNone:'Not in the dictionary',rdVia:{fast:'accelerated direct',direct:'direct',relay:'MeguLit relay'},news:'Galgame news',words:'Words of the day',all:'All',updated:'Updated',refresh:'Refresh',issue:'No. {n}',lookup:'Look up',read:'Read the article',source:'Source',
  wordsNote:'Twenty words people in Japan are searching for today. Click one to open it in the dictionary with meanings and examples',noReading:'reading in dictionary',
  emptyTitle:'Today’s paper is still at the press',emptyText:'The online service has not delivered news or words yet. Come back later or press Refresh',errorTitle:'Cannot reach the daily',errorText:'Check your connection or refresh later',
  noNews:'No news in this column yet',noWords:'Today’s words are not ready yet',more:'More news',weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],credit:'Headlines and summaries from each site’s public RSS. Click to read the original'}
};
const LOAD_LIMIT=25000;
const pad=n=>String(n).padStart(2,'0');
function dateline(locale,w,now=new Date()){
 const y=now.getFullYear(),m=now.getMonth()+1,d=now.getDate(),wd=w.weekday[now.getDay()];
 const start=new Date(y,0,0),day=Math.floor((now-start)/864e5);
 const date=locale==='en'?now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):locale==='ja'?`${y}年${m}月${d}日（${wd}）`:`${y}年${m}月${d}日 星期${wd}`;
 return {date,issue:w.issue.replace('{n}',day)};
}
function ago(iso,locale){
 const t=Date.parse(iso||'');if(!Number.isFinite(t))return '';const min=Math.max(0,Math.round((Date.now()-t)/60000));
 if(min<60)return {zh:`${min} 分钟前`,ja:`${min} 分前`,en:`${min} min ago`}[locale];const h=Math.round(min/60);
 if(h<48)return {zh:`${h} 小时前`,ja:`${h} 時間前`,en:`${h} h ago`}[locale];const d=new Date(t);return `${d.getMonth()+1}/${d.getDate()}`;
}
/* geometric placeholder when a story has no picture: deterministic per title */
function plate(seed){let h=0;for(const c of seed)h=(h*31+c.charCodeAt(0))>>>0;return `<span class="dl-plate" data-v="${h%4}" aria-hidden="true"><i></i><i></i><i></i></span>`;}
function figure(n,esc){return n.image?`<span class="dl-fig${n.sensitive?' is-sensitive':''}"><img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('dl-fig-fail')">${plate(n.title)}</span>`:`<span class="dl-fig dl-fig-fail">${plate(n.title)}</span>`;}
function meta(n,locale,esc){return `<span class="dl-meta"><b>${esc(n.source)}</b>${n.date?`<time datetime="${esc(n.date)}">${esc(ago(n.date,locale))}</time>`:''}</span>`;}
export function newsHTML(items,{locale,esc,w}){
 if(!items.length)return `<p class="dl-none">${w.noNews}</p>`;
 /* the lead is the newest story with a picture (within the first five), so the top of the page carries an image */
 const pick=Math.max(0,items.slice(0,5).findIndex(n=>n.image)),lead=items[pick],rest=items.filter((_,i)=>i!==pick),cols=rest.slice(0,3),list=rest.slice(3,60);
 return `<article class="dl-lead dl-in" style="--i:0"><a href="#" data-dl-open="${esc(lead.link)}">${figure(lead,esc)}<span class="dl-lead-copy">${meta(lead,locale,esc)}<h2${lead.title.length>34?' class="dl-long"':''}>${esc(lead.title)}</h2><p>${esc(lead.summary)}</p><span class="dl-read">${w.read}<i aria-hidden="true"></i></span></span></a></article>`
  +(cols.length?`<div class="dl-cols">${cols.map((n,i)=>`<article class="dl-col dl-in" style="--i:${i+1}"><a href="#" data-dl-open="${esc(n.link)}">${figure(n,esc)}${meta(n,locale,esc)}<h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p></a></article>`).join('')}</div>`:'')
  +(list.length?`<section class="dl-list"><h4>${w.more}</h4><ol>${list.map((n,i)=>`<li class="dl-in" style="--i:${i+4}"><a href="#" data-dl-open="${esc(n.link)}"><span class="dl-idx">${pad(i+1)}</span><span class="dl-list-copy"><strong>${esc(n.title)}</strong>${meta(n,locale,esc)}</span></a></li>`).join('')}</ol></section>`:'');
}
export function wordsHTML(words,{esc,w,locale='zh'}){
 if(!words.length)return `<p class="dl-none">${w.noWords}</p>`;
 return `<ol class="dl-words">${words.map((x,i)=>`<li class="dl-word dl-in" style="--i:${i}"><div class="dl-word-row"><button type="button" class="dl-word-main" data-dl-lookup="${esc(x.term)}" title="${w.lookup}"><span class="dl-rank">${pad(i+1)}</span><span class="dl-term">${x.reading&&x.reading!==x.term?`<ruby>${esc(x.term)}<rt>${esc(x.reading)}</rt></ruby>`:`<span>${esc(x.term)}</span>`}${x.gloss||w.kinds?.[x.kind]?`<small class="dl-gloss">${w.kinds?.[x.kind]?`<b class="dl-kind" data-kind="${esc(x.kind)}">${esc(w.kinds[x.kind])}</b>`:''}${esc(x.gloss||'')}</small>`:''}</span>${x.traffic?`<span class="dl-traffic">${esc(x.traffic)}</span>`:''}<span class="dl-go" aria-hidden="true">${w.lookup}</span></button><button type="button" class="dl-chev" data-dl-word aria-expanded="false" aria-label="${esc(x.term)}"></button></div><div class="dl-word-more"><div><dl class="dl-facts">${x.reading?`<dt>${w.wReading}</dt><dd>${esc(x.reading)}</dd>`:''}${x.gloss||w.kinds?.[x.kind]?`<dt>${w.wGloss}</dt><dd>${w.kinds?.[x.kind]?esc(w.kinds[x.kind])+(x.gloss?(locale==='en'?', ':'，'):''):''}${esc(x.gloss||'')}<em>${esc(w.glossFrom?.[x.glossFrom]||'')}</em></dd>`:''}${x.headline?`<dt>${w.wSource}</dt><dd>${esc(x.headline)}</dd>`:''}</dl><span class="dl-word-actions">${x.url?`<a href="#" data-dl-open="${esc(x.url)}">${esc(x.source||w.read)}</a>`:''}</span></div></div></li>`).join('')}</ol>`;
}
function emptyHTML(w,error){return `<div class="dl-empty dl-in"><span class="dl-empty-art" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></span><h2>${error?w.errorTitle:w.emptyTitle}</h2><p>${error?w.errorText:w.emptyText}</p><button type="button" class="dl-btn" data-dl-refresh>${w.refresh}</button></div>`;}
export function pageHTML(data,{locale,esc,filter='all',cat='gal'}){
 const w=W[locale]||W.zh,{date,issue}=dateline(locale,w);
 const news=(data?.news?.items||[]).filter(n=>(n.cat||'gal')===cat),words=data?.words?.words||[],sources=[...new Set(news.map(n=>n.source))];
 const shown=filter==='all'?news:news.filter(n=>n.source===filter);
 const updated=data?.news?.updatedAt||data?.words?.updatedAt;
 const strip=`<header class="dl-strip"><span class="dl-date">${esc(date)}</span><span class="dl-issue">${esc(issue)}</span><span class="dl-strip-end">${updated?`<span>${w.updated} ${esc(ago(updated,locale))}</span>`:''}<button type="button" class="dl-icon" data-dl-refresh title="${w.refresh}" aria-label="${w.refresh}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button></span></header>`;
 if(!data||data.state==='error'||data.state==='not-configured'||data.state==='empty')return `<div class="dl">${strip}${emptyHTML(w,data?.state==='error')}</div>`;
 return `<div class="dl">${strip}<div class="dl-grid"><section class="dl-news" aria-label="${w.news}"><div class="dl-head"><nav class="dl-cats" role="tablist">${[['gal',w.catGal],['acg',w.catAcg]].map(([c,l])=>`<button type="button" role="tab" data-dl-cat="${c}" aria-selected="${c===cat}">${esc(l)}</button>`).join('')}</nav><nav class="dl-filters" role="tablist">${['all',...sources].map(s=>`<button type="button" role="tab" data-dl-filter="${esc(s)}" aria-selected="${s===filter}">${s==='all'?w.all:esc(s)}</button>`).join('')}<span class="dl-filter-ink" aria-hidden="true"></span></nav></div><div class="dl-news-body">${newsHTML(shown,{locale,esc,w})}</div><p class="dl-credit">${w.credit}</p></section>`
  +`<aside class="dl-rail" aria-label="${w.words}"><div class="dl-head"><h3>${w.words}</h3>${data.words?.source?`<small>${esc(data.words.source)}</small>`:''}</div><p class="dl-note">${w.wordsNote}</p>${wordsHTML(words,{esc,w,locale})}</aside></div></div>`;
}
function placeInk(root){const nav=root.querySelector('.dl-filters'),on=nav?.querySelector('[aria-selected=true]'),ink=nav?.querySelector('.dl-filter-ink');if(!on||!ink)return;ink.style.width=on.offsetWidth+'px';ink.style.transform=`translateX(${on.offsetLeft}px)`;}
/* the home's news thumbnails open the daily page on that article */
function focusFromHome(main){let link='';try{link=sessionStorage.getItem('megulit-daily-focus')||'';sessionStorage.removeItem('megulit-daily-focus');}catch{}if(!link)return;const hit=[...main.querySelectorAll('[data-dl-open]')].find(e=>e.dataset.dlOpen===link);const item=hit?.closest('article,li')||hit;if(!item)return;requestAnimationFrame(()=>{item.scrollIntoView({block:'center',behavior:'smooth'});item.classList.add('dl-focus');setTimeout(()=>item.classList.remove('dl-focus'),2200);});}
let onlineBack=null;
export async function mountDaily(main,{api,locale,esc,toast,isCurrent=()=>true,lookup,openSettings}){
 let data=null,filter='all',cat=(()=>{try{return localStorage.getItem('megulit-daily-cat')==='acg'?'acg':'gal';}catch{return 'gal';}})();
 const paint=()=>{main.innerHTML=pageHTML(data,{locale,esc,filter,cat});bind();focusFromHome(main);requestAnimationFrame(()=>{placeInk(main);main.querySelector('.dl')?.classList.add('dl-ready');});};
 const load=async(spin)=>{if(spin)main.querySelector('[data-dl-refresh]')?.classList.add('dl-spin');/* Issue 129: never sit on the loading card. The service answers within ~12 s (8 s per relay request, 4 s for glosses); past LOAD_LIMIT the page shows the error card with its refresh button, and it reloads by itself when the connection comes back */let timer;try{data=await Promise.race([api('daily_view',spin?{force:true}:{}),new Promise((_,no)=>{timer=setTimeout(()=>no(Error('DAILY_TIMEOUT')),LOAD_LIMIT);})]);}catch(e){data={state:'error',error:/TIMEOUT/.test(String(e?.message||''))?'TIMEOUT':'NETWORK'};}finally{clearTimeout(timer);}if(isCurrent())paint();};
  /* one recovery listener at a time: a visit replaces the previous visit's listener instead of piling up */if(onlineBack)window.removeEventListener('online',onlineBack);onlineBack=function back(){if(!isCurrent()){window.removeEventListener('online',back);if(onlineBack===back)onlineBack=null;return;}if(data?.state==='error')load(false);};window.addEventListener('online',onlineBack);
 function bind(){
  main.querySelectorAll('[data-dl-refresh]').forEach(b=>b.onclick=()=>load(true));
  bindOpen(main);
  main.querySelectorAll('[data-dl-cat]').forEach(b=>b.onclick=()=>{if(b.dataset.dlCat===cat)return;cat=b.dataset.dlCat;filter='all';try{localStorage.setItem('megulit-daily-cat',cat);}catch{}const body=main.querySelector('.dl-news');body?.classList.add('dl-swap');setTimeout(()=>{if(isCurrent())paint();},160);});
  main.querySelectorAll('[data-dl-filter]').forEach(b=>b.onclick=()=>{if(b.dataset.dlFilter===filter)return;filter=b.dataset.dlFilter;
   main.querySelectorAll('[data-dl-filter]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));placeInk(main);
   const body=main.querySelector('.dl-news-body'),w=W[locale]||W.zh,inCat=data.news.items.filter(n=>(n.cat||'gal')===cat),shown=filter==='all'?inCat:inCat.filter(n=>n.source===filter);
   body.classList.add('dl-swap');setTimeout(()=>{if(!body.isConnected)return;body.innerHTML=newsHTML(shown,{locale,esc,w});bindOpen(body);body.classList.remove('dl-swap');},160);});
  main.querySelectorAll('[data-dl-word]').forEach(b=>b.onclick=()=>{const li=b.closest('.dl-word'),open=!li.classList.contains('open');main.querySelectorAll('.dl-word.open').forEach(x=>{x.classList.remove('open');x.querySelector('[aria-expanded]').setAttribute('aria-expanded','false');});if(open){li.classList.add('open');b.setAttribute('aria-expanded','true');}});
  main.querySelectorAll('[data-dl-lookup]').forEach(b=>b.onclick=()=>lookup?.(b.dataset.dlLookup));
 }
 /* news stories open in the reader; hot-word headlines open in the browser */
 function bindOpen(scope){scope.querySelectorAll('[data-dl-open]').forEach(a=>a.onclick=e=>{e.preventDefault();const item=a.closest('.dl-word')?null:data?.news?.items.find(n=>n.link===a.dataset.dlOpen);if(item)openReader(item,{api,locale,esc,toast,lookup,openSettings});else api('daily_open',{url:a.dataset.dlOpen}).catch(()=>toast?.('…'));});}
 main.innerHTML=pageHTML(null,{locale,esc}).replace('dl-empty dl-in','dl-empty dl-in dl-loading');
 await load(false);
}

/* ---- E415 reader: 日文 / 译文 / 双语, click a word or drag a phrase to look it up, add to Anki megulit_news ---------- */
const MODES=['ja','tr','bi'];
/* 'TRANSLATION_FAILED:LOCAL_MODEL_MISSING …' → a readable reason */
export function trReason(e,w){const m=String(e?.message||e||'');const code=Object.keys(w.trWhy).find(k=>k!=='other'&&m.includes(k))||(/fetch failed|ENOTFOUND|ECONN|NETWORK/i.test(m)?'NETWORK':/TIMEOUT|aborted/i.test(m)?'TIMEOUT':/HTTP_429/.test(m)?'TRANSLATION_HTTP_429':'other');return w.trWhy[code];}
function defs(v){if(Array.isArray(v))return v.map(defs).filter(Boolean).join('；');if(v&&typeof v==='object')return Object.values(v).map(defs).filter(Boolean).join('；');const t=String(v??'');if(/^[\[{]/.test(t.trim()))try{return defs(JSON.parse(t));}catch{}return t;}
/* tokens carry a reading only when the dictionary settled it; ruby is drawn only for those */
export function paragraphHTML(p,esc){return p.tokens?.length?p.tokens.map(t=>/^[\s\p{P}\p{S}]+$/u.test(t.s)?esc(t.s):`<span class="rd-t" data-b="${esc(t.b)}" data-r="${esc(t.r||'')}">${t.r&&/\p{sc=Han}/u.test(t.s)?`<ruby>${esc(t.s)}<rt>${esc(t.r)}</rt></ruby>`:esc(t.s)}</span>`).join(''):esc(p.text);}
export function readerShell(item,w,esc){return `<div class="rd" role="dialog" aria-modal="true" aria-label="${esc(item.title)}"><div class="rd-scrim" data-rd-close></div><section class="rd-sheet"><header class="rd-bar"><span class="rd-src">${esc(item.source)}</span><div class="rd-modes" role="tablist">${MODES.map(m=>`<button type="button" role="tab" data-rd-mode="${m}" aria-selected="${m==='ja'}">${w[{ja:'rdJa',tr:'rdTr',bi:'rdBi'}[m]]}</button>`).join('')}<span class="rd-mode-ink" aria-hidden="true"></span></div><span class="rd-bar-end"><button type="button" class="rd-link" data-rd-orig>${w.rdOrig}</button><button type="button" class="dl-icon rd-x" data-rd-close aria-label="${w.rdClose}" title="${w.rdClose}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.4"/></svg></button></span></header><article class="rd-body"><h1>${esc(item.title)}</h1><p class="rd-meta">${esc(item.source)}${item.date?' · '+esc(new Date(item.date).toLocaleString()):''}<span class="rd-via"></span></p><p class="rd-hint">${w.rdHint}</p><div class="rd-text" data-mode="ja"><p class="rd-wait">${w.rdLoading}</p></div></article><div class="rd-pop" hidden></div></section></div>`;}
/* dismissed for this run of the app only */
let mtHidden=false;
export function openReader(item,{api,locale,esc,toast,lookup,openSettings}){
 const w=W[locale]||W.zh,host=document.createElement('div');host.innerHTML=readerShell(item,w,esc);const root=host.firstElementChild;document.body.appendChild(root);
 requestAnimationFrame(()=>root.classList.add('rd-on'));
 const sheet=root.querySelector('.rd-sheet'),text=root.querySelector('.rd-text'),pop=root.querySelector('.rd-pop');let data=null,tr=null,mode='ja',popTicket=0,machine=false;
 const key=e=>{if(e.key==='Escape'){if(!pop.hidden)pop.hidden=true;else close();}};
 const close=()=>{root.classList.remove('rd-on');document.removeEventListener('keydown',key);setTimeout(()=>root.remove(),280);};
 document.addEventListener('keydown',key);
 root.querySelectorAll('[data-rd-close]').forEach(b=>b.onclick=close);
 root.querySelector('[data-rd-orig]').onclick=()=>api('daily_open',{url:item.link}).catch(()=>toast?.('…'));
 const ink=()=>{const on=root.querySelector('[data-rd-mode][aria-selected=true]'),bar=root.querySelector('.rd-mode-ink');if(on&&bar){bar.style.width=on.offsetWidth+'px';bar.style.transform=`translateX(${on.offsetLeft}px)`;}};requestAnimationFrame(ink);
 const setMode=m=>{mode=m;root.querySelectorAll('[data-rd-mode]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.rdMode===m)));ink();};
 const paint=()=>{if(!data)return;text.dataset.mode=mode;text.innerHTML=(machine&&mode!=='ja'&&!mtHidden?`<aside class="rd-mt" role="note"><span>${w.mtNote}</span><button type="button" class="rd-link" data-rd-mt-go>${w.mtGo}</button><button type="button" class="rd-mt-x" data-rd-mt-x aria-label="${w.mtClose}" title="${w.mtClose}">×</button></aside>`:'')+data.paragraphs.map((p,i)=>`<div class="rd-p" data-i="${i}">${mode!=='tr'?`<p class="rd-ja" lang="ja">${paragraphHTML(p,esc)}</p>`:''}${mode!=='ja'?`<p class="rd-tr">${tr?esc(tr[i]||''):'<span class="rd-shimmer"></span>'}</p>`:''}</div>`).join('');};
 let trBusy=false;const needTr=async()=>{if(tr||trBusy||mode==='ja'||!data)return;trBusy=true;try{const res=await api('daily_translate',{texts:data.paragraphs.map(p=>p.text),target:locale==='en'?'en':'zh'}),out=Array.isArray(res)?res:res?.texts;if(!Array.isArray(out)||!out.some(Boolean))throw Error('TRANSLATION_FAILED:other');tr=out;machine=/microsoft/.test(String(res?.engine||''));}catch(e){toast?.(w.rdTrFail+(locale==='en'?': ':'：')+trReason(e,w));setMode('ja');}trBusy=false;if(root.isConnected)paint();};
 text.addEventListener('click',e=>{if(e.target.closest('[data-rd-mt-x]')){mtHidden=true;e.target.closest('.rd-mt').remove();}else if(e.target.closest('[data-rd-mt-go]')){close();openSettings?.('translation');}});
 root.querySelectorAll('[data-rd-mode]').forEach(b=>b.onclick=()=>{if(b.dataset.rdMode===mode)return;setMode(b.dataset.rdMode);text.classList.add('rd-swap');setTimeout(()=>{paint();text.classList.remove('rd-swap');needTr();},140);});
 const show=async(query,rect,sentence)=>{
  query=query.trim().slice(0,40);if(!query)return;const ticket=++popTicket,box=sheet.getBoundingClientRect();
  pop.hidden=false;pop.style.left=Math.max(12,Math.min(rect.left-box.left,box.width-344))+'px';pop.style.top=(rect.bottom-box.top+sheet.scrollTop+10)+'px';
  pop.innerHTML=`<div class="rd-pop-head"><strong>${esc(query)}</strong></div><p class="rd-wait">…</p>`;pop.classList.remove('rd-pop-in');void pop.offsetWidth;pop.classList.add('rd-pop-in');
  /* 2026-11-12 (user: clicking ソロデベロッパー showed ロディー朝): the online dictionary answers an unknown loanword with near
     spellings of other words. Only entries whose spelling or reading is the clicked word, or part of it (2+ characters),
     are shown; with none, the word itself and a machine translation. */
  const flat=v=>String(v||'').replace(/[\s・ー\-]/g,''),q=flat(query),fits=e=>{const sp=flat(e?.spelling),rd=flat(String(e?.pron||e?.reading||'').split(/\s/)[0]);return !!sp&&(sp===q||rd===q||[...sp].length>=2&&(q.includes(sp)||sp.includes(q))||[...rd].length>=2&&(q.includes(rd)||rd.includes(q)));};
  let items=[];try{items=(await api('dictionary',{query,source:'moji',operationId:crypto.randomUUID()})||[]).filter(fits);}catch{}if(!items?.length)try{items=(await api('dictionary',{query,source:'local',operationId:crypto.randomUUID()})||[]).filter(fits);}catch{}
  let gloss='';if(!items?.length){try{const r=await api('daily_translate',{texts:[query],target:locale==='en'?'en':'zh'}),o=Array.isArray(r)?r:r?.texts;gloss=String(o?.[0]||'').trim();}catch{}}
  if(ticket!==popTicket)return;const top=(items||[]).slice(0,3),first=top[0],reading=first?String(first.pron||first.reading||'').split(/\s/)[0]:'';
  pop.innerHTML=`<div class="rd-pop-head"><strong>${esc(first?.spelling||query)}</strong>${reading?`<span>${esc(reading)}</span>`:''}</div>${top.length?`<ol>${top.map(e=>`<li><b>${esc(e.spelling||'')}</b> <small>${esc(String(e.pron||e.reading||''))}</small><p>${esc(defs(e.definition).slice(0,220))}</p></li>`).join('')}</ol>`:(gloss?`<p class="rd-gloss">${esc(gloss)}</p><p class="rd-wait">${w.rdNone}</p>`:`<p class="rd-wait">${w.rdNone}</p>`)}<div class="rd-pop-actions"><button type="button" class="dl-btn" data-rd-anki ${first?'':'disabled'}>${w.rdAnki}</button><button type="button" class="rd-link" data-rd-more>${w.rdMore}</button></div>`;
  pop.querySelector('[data-rd-more]').onclick=()=>{close();lookup?.(query);};
  const add=pop.querySelector('[data-rd-anki]');if(first)add.onclick=async()=>{add.disabled=true;try{await api('daily_anki',{term:first.spelling||query,reading,meaning:defs(first.definition).slice(0,2000),sentence,link:item.link,title:item.title});toast?.(w.rdAnkiOk);add.textContent='✓ megulit_news';}catch(e){add.disabled=false;toast?.(w.rdAnkiFail+String(e?.message||e).replace(/^Error:\s*/,''));}};
 };
 const sentenceOf=node=>{const i=Number(node?.closest?.('.rd-p')?.dataset.i);return data?.paragraphs[i]?.text||'';};
 text.addEventListener('mouseup',e=>{const sel=getSelection(),picked=String(sel||'').trim();
  if(picked&&picked.length<=40&&text.contains(sel.anchorNode)){show(picked,sel.getRangeAt(0).getBoundingClientRect(),sentenceOf(sel.anchorNode.parentElement));return;}
  const t=e.target.closest('.rd-t');if(t){text.querySelectorAll('.rd-t.on').forEach(x=>x.classList.remove('on'));t.classList.add('on');show(t.dataset.b||t.textContent,t.getBoundingClientRect(),sentenceOf(t));}});
 sheet.addEventListener('mousedown',e=>{if(!pop.contains(e.target)&&!e.target.closest('.rd-text'))pop.hidden=true;});
 const failed=()=>{text.innerHTML=`<p class="rd-wait">${w.rdFail}</p><button type="button" class="dl-btn" data-rd-orig2>${w.rdOrig}</button>`;text.querySelector('[data-rd-orig2]').onclick=()=>api('daily_open',{url:item.link}).catch(()=>{});};
 api('daily_article',{link:item.link}).then(r=>{if(!root.isConnected)return;if(r?.state!=='ok'||!r.paragraphs?.length)return failed();data=r;root.querySelector('.rd-via').textContent=' · '+(w.rdVia[r.via]||'');paint();}).catch(()=>{if(root.isConnected)failed();});
 return {close};
}
