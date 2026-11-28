// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 排行榜 · 作品榜: three more top tabs on the leaderboard page (Galgame / 轻小说 / 乙游), each with its own
   source switch in the sub row. Data: bridge charts_view (services/charts.cjs, read from the relay, which fetches the
   source sites once a day). A row opens the game's MeguLit detail page when the game is in the library, otherwise the
   source site. The credit line under the list is always there, in every state. */
export const CHART_BOARDS=['gal','ln','otome'];
export const CHART_SOURCES={gal:['vndb','bangumi'],ln:['bangumi','anilist'],otome:['vndb','bangumi']};
export const SOURCE_LINKS={vndb:{name:'VNDB',url:'https://vndb.org'},bangumi:{name:'Bangumi',url:'https://bgm.tv'},anilist:{name:'AniList',url:'https://anilist.co'}};
const CW={
 zh:{gal:'Gal',ln:'轻小说',otome:'乙游',galTitle:'Galgame 排行',lnTitle:'轻小说排行',otomeTitle:'乙女游戏排行',colRank:'名次',colWork:'作品',colScore:'评分',colVotes:'评价人数',votes:'{n} 人评价',
  credit:'排名数据来自 {src}，按其公开数据整理，与 MeguLit 无关，排名不代表 MeguLit 的立场',updated:'{date} 更新',stale:'暂时连不上联网服务，显示的是上次保存的排名（{date}）',
  pending:'这份排名还在整理中，明天再来看看',offline:'暂时连不上联网服务',notReady:'联网服务还在准备中',retry:'重试',inLibrary:'在游戏库中',openSource:'在 {src} 查看',empty:'暂时没有数据'},
 ja:{gal:'ギャルゲ',ln:'ラノベ',otome:'乙女ゲー',galTitle:'ギャルゲーランキング',lnTitle:'ライトノベルランキング',otomeTitle:'乙女ゲームランキング',colRank:'順位',colWork:'作品',colScore:'評価',colVotes:'評価数',votes:'{n} 件の評価',
  credit:'ランキングのデータは {src} の公開データをもとに整理したもので、MeguLit とは関係がなく、MeguLit の見解を示すものではありません',updated:'{date} 更新',stale:'オンラインサービスに接続できないため、前回保存したランキング（{date}）を表示しています',
  pending:'このランキングは準備中です。明日また見てみてください',offline:'オンラインサービスに接続できません',notReady:'オンラインサービスは準備中です',retry:'再試行',inLibrary:'ライブラリにあります',openSource:'{src} で見る',empty:'まだデータがありません'},
 en:{gal:'Galgame',ln:'Light novels',otome:'Otome',galTitle:'Galgame ranking',lnTitle:'Light novel ranking',otomeTitle:'Otome game ranking',colRank:'Rank',colWork:'Title',colScore:'Score',colVotes:'Ratings',votes:'{n} ratings',
  credit:'Ranking data comes from {src} and is compiled from its public data. It has nothing to do with MeguLit, and the ranking does not reflect MeguLit\'s views',updated:'Updated {date}',stale:'Cannot reach the online service; showing the last saved ranking ({date})',
  pending:'This ranking is still being put together; check back tomorrow',offline:'Cannot reach the online service right now',notReady:'Online services are still being set up',retry:'Retry',inLibrary:'In your library',openSource:'View on {src}',empty:'No data yet'}
};
export function chartWords(locale){return CW[locale]||CW.zh;}
const fill=(t,v)=>t.replace(/\{(\w+)\}/g,(_,k)=>v[k]??'');
const nf=locale=>new Intl.NumberFormat(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-US');
const day=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'';};
/* 原名（中文名）: the Chinese name in full-width brackets after the original, only when it differs */
export function workName(x){const t=String(x?.title||''),z=String(x?.zh||'');return z&&z!==t?`${t}（${z}）`:t;}
export function sourceSwitch(board,current,esc){const list=CHART_SOURCES[board]||[];return `<div class="lb-seg" role="group" data-lb-group="source">${list.map(id=>`<button type="button" data-lb-source="${id}" aria-pressed="${id===current}">${esc(SOURCE_LINKS[id].name)}</button>`).join('')}</div>`;}
/* the credit line, its source a link that opens in the browser through the app */
export function creditHTML(source,locale,esc){const w=chartWords(locale),s=SOURCE_LINKS[source]||SOURCE_LINKS.vndb;const parts=w.credit.split('{src}');return `<p class="lb-charts-credit" data-lb-credit="${esc(source)}">${esc(parts[0])}<button type="button" class="lb-charts-link" data-lb-open="${esc(s.url)}">${esc(s.name)}</button>${esc(parts[1]||'')}</p>`;}
/* one ranked work as a row: rank, cover, 原名（中文名） with a small line under it, a value and a side note. Shared by the
   作品榜 and 阅读榜 · 按游戏; ranks 1–3 carry the podium's gold / silver / bronze. `attrs` is the button's data-* (escaped). */
export function rankRow({rank,cover,title,name,sub,value,side,attrs,owned,hint},esc){
 const img=cover&&/^data:image\/(png|jpeg|webp|gif);base64,/.test(cover)?`<img src="${esc(cover)}" alt="" loading="lazy" decoding="async">`:`<span class="lb-chart-blank" aria-hidden="true">${esc([...String(title||'?')][0]||'?')}</span>`;
 const cls=[owned?'is-owned':'',rank<=3?'is-top is-top-'+rank:''].filter(Boolean).join(' ');
 return `<li${cls?` class="${cls}"`:''}><button type="button" class="lb-chart-row" ${attrs} title="${esc(name+(hint?' · '+hint:''))}"><span class="leaderboard-rank">${rank}</span><span class="lb-chart-cover">${img}</span><span class="lb-chart-name"><span class="lb-chart-title" lang="ja">${esc(name)}</span><small>${sub}</small></span><strong class="lb-chart-score">${value}</strong><span class="lb-chart-votes">${side}</span></button></li>`;
}
function row(x,source,w,locale,esc){
 const name=workName(x),src=SOURCE_LINKS[source]?.name||'',hint=x.gameId?w.inLibrary:fill(w.openSource,{src});
 return rankRow({rank:x.rank,cover:x.cover,title:x.title,name,hint,owned:!!x.gameId,attrs:x.gameId?`data-lb-game-id="${esc(x.gameId)}"`:`data-lb-open="${esc(x.url)}"`,sub:`${x.year?esc(String(x.year))+' · ':''}${esc(hint)}`,value:esc(Number(x.score||0).toFixed(source==='vndb'?2:1)),side:esc(fill(w.votes,{n:nf(locale).format(x.votes||0)}))},esc);
}
/* the body of one chart tab: card with heading and status, the list, then the credit line */
export function chartsHTML(data,locale,esc){
 const w=chartWords(locale),board=CHART_BOARDS.includes(data?.board)?data.board:'gal',source=(CHART_SOURCES[board]||[]).includes(data?.source)?data.source:CHART_SOURCES[board][0];
 const items=Array.isArray(data?.items)?data.items:[],date=day(data?.updatedAt);
 const status=data?.state==='stale'?`<p class="lb-note lb-charts-stale">${esc(fill(w.stale,{date:date||'—'}))}</p>`:'';
 let body;
 if(items.length)body=`<ol class="leaderboard-list lb-rows lb-charts" role="list">${items.map(x=>row(x,source,w,locale,esc)).join('')}</ol>`;
 else if(data?.state==='pending')body=`<p class="lb-empty">${w.pending}</p>`;
 else if(data?.state==='not-configured')body=`<p class="lb-empty">${w.notReady}</p>`;
 else body=`<div class="leaderboard-offline"><p>${w.offline}</p><button type="button" class="secondary" data-lb-retry>${w.retry}</button></div>`;
 return `<section class="lb-card leaderboard-charts" data-lb-board="${board}"><div class="lb-card-head"><h2 class="lb-h2">${w[board+'Title']} <span>· ${esc(SOURCE_LINKS[source].name)}</span></h2>${date&&data?.state==='ok'?`<small>${esc(fill(w.updated,{date}))}</small>`:''}</div>${status}${body}</section>${creditHTML(source,locale,esc)}`;
}
