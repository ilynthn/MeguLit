// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 排行榜 · 作品榜: Galgame, light novel and otome game rankings from public third-party data, fetched once a
   day on a cron and cached in D1 (charts_cache). The app reads only GET /api/charts and GET /api/charts/img/<id>, so no
   client ever calls the source sites.

   Sources (official APIs only; each one's terms allow this use, see the PR that added this file):
     VNDB      https://api.vndb.org/kana   POST /vn, sorted by rating. Data under ODbL 1.0 (vndb.org/d17), API free for
                                           non-commercial use, 200 requests / 5 min. Covers flagged sexual or violent
                                           (image.sexual / image.violence ≥ 1) are not mirrored.
     Bangumi   https://api.bgm.tv/v0       POST /search/subjects sorted by rank; requires a User-Agent naming the app and
                                           its homepage (github.com/bangumi/api, docs-raw/user agent.md). Without a token
                                           it never returns R18 subjects.
     AniList   https://graphql.anilist.co  Page.media(format NOVEL, country JP, SCORE_DESC). Free for non-commercial use,
                                           90 requests / min; one request per day, top 50 only (no bulk collection).
   Not used: ErogameScape (no API and no permission for scripted SQL; would need the operator's OK), BOOK☆WALKER (no API,
   store pages only), このライトノベルがすごい！ (no machine-readable list; the annual ranking is the publisher's work). */
const UA='ilynthn/MeguLit-relay (+https://github.com/ilynthn/MeguLit)';
export const LIMIT=50;
export const SOURCES={
 vndb:{id:'vndb',name:'VNDB',url:'https://vndb.org'},
 bangumi:{id:'bangumi',name:'Bangumi',url:'https://bgm.tv'},
 anilist:{id:'anilist',name:'AniList',url:'https://anilist.co'}
};
/* board → its sources, first = default */
export const BOARDS={gal:['vndb','bangumi'],ln:['bangumi','anilist'],otome:['vndb','bangumi']};
const VNDB_FIELDS='id,title,alttitle,titles.title,titles.lang,titles.official,titles.main,rating,votecount,released,image.url,image.sexual,image.violence';
export const VNDB_QUERY={
 gal:{filters:['and',['olang','=','ja'],['votecount','>=',500]],sort:'rating',reverse:true,results:LIMIT,fields:VNDB_FIELDS},
 /* g542 = Otome Game */
 otome:{filters:['and',['olang','=','ja'],['tag','=','g542'],['votecount','>=',30]],sort:'rating',reverse:true,results:LIMIT,fields:VNDB_FIELDS}
};
/* Bangumi tags are user-given and noisy ("轻小说" sits on 罪与罚 too): meta_tags (curated) where one exists, and a subject
   only counts when the tag is one of its main ones, at least SHARE of the votes of its top tag */
export const BANGUMI_QUERY={
 gal:{filter:{type:[4],meta_tags:['Galgame'],rank:['>0']},pages:3},
 otome:{filter:{type:[4],tag:['乙女向'],rank:['>0']},pages:4,tag:'乙女向'},
 ln:{filter:{type:[1],tag:['轻小说'],meta_tags:['日本','系列'],rank:['>0']},pages:6,tag:'轻小说'}
};
export const SHARE=0.25;
/* the search endpoint returns at most 20 subjects per call */
export const BANGUMI_PAGE=20;
export const ANILIST_QUERY=`query($n:Int){Page(page:1,perPage:$n){media(type:MANGA,format:NOVEL,countryOfOrigin:"JP",isAdult:false,sort:SCORE_DESC,popularity_greater:1500){id title{native romaji} averageScore siteUrl startDate{year} coverImage{medium} stats{scoreDistribution{amount}}}}}`;

const str=(v,n=200)=>typeof v==='string'?v.trim().slice(0,n):'';
const httpsUrl=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'?u.href.slice(0,500):'';}catch{return '';}};
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const round=(v,d=2)=>Math.round(v*10**d)/10**d;
export const normTitle=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
const year=v=>{const m=String(v||'').match(/^(\d{4})/);return m?Number(m[1]):0;};
const ranked=list=>list.slice(0,LIMIT).map((x,i)=>({rank:i+1,...x}));

/* ---- parsers (pure; the tests feed them recorded responses) ---------------------------------------------------- */
export function parseVndb(json){
 return ranked((Array.isArray(json?.results)?json.results:[]).map(v=>{
  const titles=Array.isArray(v.titles)?v.titles:[];
  const zh=titles.find(t=>t.lang==='zh-Hans'&&t.official)||titles.find(t=>t.lang==='zh-Hans')||titles.find(t=>t.lang==='zh-Hant');
  const id=/^v\d+$/.test(String(v.id))?v.id:'';
  const safe=v.image&&num(v.image.sexual)<1&&num(v.image.violence)<1;
  return {id,vndb:id,title:str(v.alttitle||titles.find(t=>t.main)?.title||v.title),zh:str(zh?.title),score:round(num(v.rating)/10),votes:num(v.votecount),year:year(v.released),cover:safe?httpsUrl(v.image.url):'',url:id?'https://vndb.org/'+id:''};
 }).filter(x=>x.id&&x.title&&x.score>0));
}
/* the tag counts when it is among the subject's main tags; with no tags listed the subject is kept */
export function mainTag(subject,tag,share=SHARE){
 const tags=Array.isArray(subject?.tags)?subject.tags:[];if(!tag||!tags.length)return true;
 const top=Math.max(...tags.map(t=>num(t.count)));const hit=tags.find(t=>t.name===tag);
 return !!hit&&top>0&&num(hit.count)/top>=share;
}
export function parseBangumi(pages,{tag=''}={}){
 const seen=new Set(),all=(Array.isArray(pages)?pages:[pages]).flatMap(p=>Array.isArray(p?.data)?p.data:[]);
 return ranked(all.filter(s=>s&&!s.nsfw&&mainTag(s,tag)&&num(s.rating?.rank)>0&&!seen.has(s.id)&&seen.add(s.id)).sort((a,b)=>num(a.rating.rank)-num(b.rating.rank)).map(s=>{
  const id=Number.isInteger(s.id)?s.id:0;
  return {id:id?'bgm:'+id:'',title:str(s.name),zh:str(s.name_cn),score:round(num(s.rating?.score)),votes:num(s.rating?.total),year:year(s.date),cover:httpsUrl(s.images?.common||s.images?.medium||s.image),url:id?'https://bgm.tv/subject/'+id:''};
 }).filter(x=>x.id&&x.title&&x.score>0));
}
export function parseAnilist(json){
 const media=Array.isArray(json?.data?.Page?.media)?json.data.Page.media:[];
 return ranked(media.map(m=>{
  const id=Number.isInteger(m.id)?m.id:0,votes=(Array.isArray(m.stats?.scoreDistribution)?m.stats.scoreDistribution:[]).reduce((n,d)=>n+num(d.amount),0);
  return {id:id?'al:'+id:'',title:str(m.title?.native||m.title?.romaji),zh:'',score:round(num(m.averageScore)/10),votes,year:num(m.startDate?.year),cover:httpsUrl(m.coverImage?.medium),url:id?'https://anilist.co/manga/'+id:''};
 }).filter(x=>x.id&&x.title&&x.score>0));
}
/* AniList (and a VNDB entry without a Chinese title) borrows the Chinese name of the same work from the Bangumi list */
export function fillChinese(lists){
 const zh=new Map();for(const items of lists)for(const x of items)if(x.zh)zh.set(normTitle(x.title),x.zh);
 for(const items of lists)for(const x of items)if(!x.zh){const z=zh.get(normTitle(x.title));if(z)x.zh=z;}
 return lists;
}

/* ---- fetch ---------------------------------------------------------------------------------------------------- */
async function post(url,body,fetcher){const r=await fetcher(url,{method:'POST',headers:{'user-agent':UA,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP_'+r.status);return r.json();}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function fetchList(board,source,fetcher=fetch,{gap=1100}={}){
 if(source==='vndb')return parseVndb(await post('https://api.vndb.org/kana/vn',VNDB_QUERY[board],fetcher));
 if(source==='bangumi'){const q=BANGUMI_QUERY[board],pages=[];
  for(let p=0;p<q.pages;p++){if(p)await wait(gap);pages.push(await post(`https://api.bgm.tv/v0/search/subjects?limit=${BANGUMI_PAGE}&offset=${p*BANGUMI_PAGE}`,{keyword:'',sort:'rank',filter:q.filter},fetcher));}
  return parseBangumi(pages,{tag:q.tag});}
 if(source==='anilist')return parseAnilist(await post('https://graphql.anilist.co',{query:ANILIST_QUERY,variables:{n:LIMIT}},fetcher));
 throw Error('UNKNOWN_SOURCE');
}

/* ---- D1 cache ------------------------------------------------------------------------------------------------- */
async function loadRow(env,board,source){const row=await env.DB.prepare('SELECT payload,updated_at FROM charts_cache WHERE board=? AND source=?').bind(board,source).first();if(!row)return null;try{return {...JSON.parse(row.payload),updatedAt:new Date(row.updated_at).toISOString()};}catch{return null;}}
async function saveRow(env,board,source,payload,now){await env.DB.prepare('INSERT INTO charts_cache(board,source,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(board,source) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(board,source,JSON.stringify(payload),now.getTime()).run();}
async function hex(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);}
/* a list shorter than this is treated as a failed fetch: yesterday's list stays */
export const MIN_ITEMS=10;
/* One run of the daily cron: every board × source, one host at a time. A source that fails keeps its last list; a cover
   already mirrored for the same URL keeps its /api/charts/img link. */
export async function refreshCharts(env,now=new Date(),fetcher=fetch,options={}){
 /* the pause between two calls to the same host (CHARTS_GAP_MS only for tests) */
 options={...options,gap:options.gap??(Number.isFinite(Number(env.CHARTS_GAP_MS))&&env.CHARTS_GAP_MS!==undefined?Number(env.CHARTS_GAP_MS):1100)};
 const pairs=Object.entries(BOARDS).flatMap(([board,list])=>list.map(source=>({board,source})));
 const got=new Map(),errors={};let last='';
 for(const {board,source} of pairs){
  if(last===source)await wait(options.gap);last=source;
  try{const items=await fetchList(board,source,fetcher,options);if(items.length>=MIN_ITEMS)got.set(board+'|'+source,items);else errors[board+'|'+source]='TOO_FEW';}
  catch(e){errors[board+'|'+source]=String(e?.message||e).slice(0,40);}
 }
 fillChinese([...got.values()]);
 let saved=0;
 for(const [key,items] of got){const [board,source]=key.split('|');
  const prev=await loadRow(env,board,source).catch(()=>null),img=new Map((prev?.items||[]).filter(x=>x.img&&x.cover).map(x=>[x.cover,x.img]));
  for(const x of items)x.img=img.get(x.cover)||'';
  await saveRow(env,board,source,{board,source,items},now);saved++;}
 return {saved,errors};
}
/* ---- covers mirrored into R2 (chart-img/<id>): the app's CSP allows only its own images. A few per run, on the
   half-hourly cron, so the daily run stays well under the Worker's subrequest limit. ----------------------------- */
export const NEW_IMAGES=12,IMG_MAX=600*1024;
const IMG_TYPES=/^image\/(jpeg|png|webp|gif)$/;
export async function mirrorChartImages(env,now=new Date(),fetcher=fetch,budget=NEW_IMAGES){
 if(!env.BUCKET)return 0;let done=0;
 for(const [board,list] of Object.entries(BOARDS))for(const source of list){
  if(done>=budget)return done;
  const row=await loadRow(env,board,source).catch(()=>null);if(!row?.items?.length)continue;let changed=false;
  for(const x of row.items){if(done>=budget)break;if(x.img||!x.cover)continue;done++;
   try{const r=await fetcher(x.cover,{headers:{'user-agent':UA,accept:'image/*'},signal:AbortSignal.timeout(10000)});const type=(r.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!r.ok||!IMG_TYPES.test(type))continue;const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length||bytes.length>IMG_MAX)continue;
    const id=await hex(x.cover);await env.BUCKET.put('chart-img/'+id,bytes,{httpMetadata:{contentType:type},customMetadata:{at:String(now.getTime())}});x.img='/api/charts/img/'+id;changed=true;}catch{}}
  if(changed)await env.DB.prepare('UPDATE charts_cache SET payload=? WHERE board=? AND source=?').bind(JSON.stringify({board,source,items:row.items}),board,source).run();
 }
 return done;
}
/* covers no list points at any more (a work that left every top 50) are deleted after the daily run */
export async function cleanupChartImages(env){
 if(!env.BUCKET?.list)return 0;const keep=new Set();
 for(const [board,list] of Object.entries(BOARDS))for(const source of list)for(const x of (await loadRow(env,board,source).catch(()=>null))?.items||[])if(x.img)keep.add('chart-img/'+x.img.slice(16));
 let removed=0,cursor;do{const page=await env.BUCKET.list({prefix:'chart-img/',cursor});for(const o of page.objects||[])if(!keep.has(o.key)){await env.BUCKET.delete(o.key);removed++;}cursor=page.truncated?page.cursor:undefined;}while(cursor);
 return removed;
}
export async function dailyCharts(env,now=new Date(),fetcher=fetch){const r=await refreshCharts(env,now,fetcher);r.removed=await cleanupChartImages(env).catch(()=>0);return r;}

/* ---- HTTP ----------------------------------------------------------------------------------------------------- */
const NOINDEX={'x-robots-tag':'noindex, nofollow'};
export async function chartsGet(env,url,{json,fail}){
 const board=url.searchParams.get('board')||'gal';if(!BOARDS[board])return fail('INVALID_BOARD',400,NOINDEX);
 const source=url.searchParams.get('source')||BOARDS[board][0];if(!BOARDS[board].includes(source))return fail('INVALID_SOURCE',400,NOINDEX);
 const row=await loadRow(env,board,source);
 /* the image link is served as the item's cover; source cover URLs never reach the app */
 const items=(row?.items||[]).map(({img,cover,...x})=>({...x,cover:img||''}));
 return json({board,source,state:row?'ok':'pending',items,updatedAt:row?.updatedAt||null,sources:BOARDS[board].map(id=>SOURCES[id])},200,{'cache-control':'public, max-age=1800',...NOINDEX});
}
export async function chartImageGet(env,id){
 const obj=env.BUCKET?await env.BUCKET.get('chart-img/'+id):null;if(!obj)return new Response('',{status:404});
 return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'image/jpeg','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
}
