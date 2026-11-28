// SPDX-License-Identifier: GPL-3.0-or-later
/* E415 每日 page: Galgame news and today's hot Japanese words, fetched on a cron and cached in D1 (daily_cache).
   The app reads only GET /api/news and GET /api/hotwords/daily, so it works where the source sites are slow or blocked.

   Sources (public RSS only; each site's robots.txt allows these paths; we keep title, date, source, a one-or-two
   sentence summary, a thumbnail URL and the link, never the article body):
     Moepedia 美少女ゲームカレンダー  https://moepedia.net/feed/                      (all items: it is a galgame site)
     4Gamer.net                     https://www.4gamer.net/rss/index.xml            (only items matching GAL_WORDS)
     電ファミニコゲーマー             https://news.denfaminicogamer.jp/feed           (only items matching GAL_WORDS)
     ln-news.com ラノベニュース      https://ln-news.com/feed                        (Atom, all items, the 轻小说 tab)
     Google トレンド (JP daily)      https://trends.google.com/trending/rss?geo=JP   (hot words, with one related headline)
     NHK ニュース                    https://www3.nhk.or.jp/rss/news/cat0.xml        (fallback hot words when Trends fails:
                                                                                     「」-quoted terms in the headlines) */
import newsArticle from '../../services/news-article.cjs';
const UA='MeguLitRelay/1.0 (+https://megulit.com)';
export const NEWS_FEEDS=[
 {id:'moepedia',name:'Moepedia',url:'https://moepedia.net/feed/',all:true},
 {id:'4gamer',name:'4Gamer.net',url:'https://www.4gamer.net/rss/index.xml'},
 {id:'denfami',name:'電ファミニコゲーマー',url:'https://news.denfaminicogamer.jp/feed'},
 /* E415 more sources (robots.txt allows the feeds): the first is Moepedia's second page, the rest are general game
    news filtered by GAL_WORDS */
 {id:'moepedia',name:'Moepedia',url:'https://moepedia.net/feed/?paged=2',all:true},
 {id:'4gamer',name:'4Gamer.net',url:'https://www.4gamer.net/rss/pc/pc_news.xml'},
 {id:'gamespark',name:'Game*Spark',url:'https://www.gamespark.jp/rss/index.rdf'},
 {id:'automaton',name:'AUTOMATON',url:'https://automaton-media.com/feed/'},
 {id:'gamewatch',name:'GAME Watch',url:'https://game.watch.impress.co.jp/data/rss/1.0/gmw/feed.rdf'},
 /* ACG tab: anime, manga and other 二次元 news, unfiltered */
 {id:'animeanime',name:'アニメ!アニメ!',url:'https://animeanime.jp/rss/index.rdf',all:true,cat:'acg'},
 {id:'natalie',name:'コミックナタリー',url:'https://natalie.mu/comic/feed/news',all:true,cat:'acg'},
 /* 轻小说 tab: ラノベニュースオンライン, Atom feed at /feed (robots.txt allows everything); titles and links only, the
    app reads the article on the user's PC (the feed carries no summary) */
 {id:'lnnews',name:'ln-news.com',url:'https://ln-news.com/feed',all:true,cat:'ln'}
];
export const CATEGORIES=['gal','acg','ln'];
export const TRENDS_URL='https://trends.google.com/trending/rss?geo=JP',NHK_URL='https://www3.nhk.or.jp/rss/news/cat0.xml';
export const GAL_WORDS=/ノベル|ADV|成人向け|18禁|R18|FANZA|DLsite|同人ゲーム|萌え|美少女|ギャルゲ|エロゲ|恋愛|乙女ゲ|Key|ゆずソフト|サガプラネッツ|ぱれっと|オーガスト|TYPE-MOON|ニトロプラス|アリスソフト|Navel|まどそふと|ういんどみる|クロシェット|SMEE|HOOKSOFT|あざらしそふと|ensemble|feng|minori|CIRCUS|ねこねこ|Frontwing|フロントウイング|MAGES|ヒロイン|Galgame|galgame/;
/* stories stay KEEP_NEWS_DAYS after they first appear, so the page keeps a full front page between quiet days */
const MAX_NEWS=60,MAX_WORDS=20,KEEP_NEWS_DAYS=10;

/* ---- tiny RSS/RDF reader (no DOM in Workers) ------------------------------------------------------------------ */
const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
export function decode(s){return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):Number(e.slice(1))):ENT[e.toLowerCase()]??m);}
const text=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const tag=(xml,name)=>{const m=xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>'));return m?m[1]:'';};
const safeUrl=v=>{try{const u=new URL(decode(v).trim());return u.protocol==='https:'||u.protocol==='http:'?u.href.slice(0,500):'';}catch{return '';}};
/* one or two sentences, at most 120 characters */
export function summary(s){const t=text(s).replace(/\s*\[…\]$|\s*\[&#8230;\]$/,'');const parts=t.match(/[^。！？!?]+[。！？!?]?/g)||[];let out='';for(const p of parts.slice(0,2)){if((out+p).length>120)break;out+=p;}return (out||t.slice(0,118)+(t.length>118?'…':'')).trim();}
/* RSS <item> and Atom <entry> */
export function items(xml){return [...String(xml||'').matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map(m=>m[2]);}
/* Atom: the story link is the <link> that is not an enclosure (ln-news.com lists its picture as rel="enclosure" first) */
const atomLinks=it=>[...it.matchAll(/<link\s[^>]*>/g)].map(m=>({rel:(m[0].match(/\srel=["']([^"']+)["']/)||[])[1]||'alternate',href:(m[0].match(/\shref=["']([^"']+)["']/)||[])[1]||''})).filter(l=>l.href);
export function parseNews(xml,feed){
 return items(xml).map(it=>{
  const links=atomLinks(it),title=text(tag(it,'title')).slice(0,160),link=safeUrl(tag(it,'link')||links.find(l=>l.rel==='alternate')?.href||(it.match(/rdf:about="([^"]+)"/)||[])[1]||'');
  const when=Date.parse(text(tag(it,'pubDate')||tag(it,'dc:date')||tag(it,'updated')||tag(it,'published')));
  const body=tag(it,'content:encoded');
  const image=safeUrl((it.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/)||(links.find(l=>l.rel==='enclosure')&&it.match(/<link[^>]*rel="enclosure"[^>]*type="image[^>]*href="([^"]+)"/))||it.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/)||decode(body).match(/<img[^>]*src="([^"]+)"/)||[])[1]||'');
  return {title,link,date:Number.isFinite(when)?new Date(when).toISOString():'',source:feed.name,sourceId:feed.id,cat:feed.cat||'gal',summary:summary(tag(it,'description')||tag(it,'summary')||body),image};
 }).filter(n=>n.title&&n.link&&(feed.all||GAL_WORDS.test(n.title+' '+n.summary)));
}
const KANA=/^[ぁ-ゟ゠-ヿー・\s]+$/;
export function parseTrends(xml){
 return items(xml).map(it=>{const term=text(tag(it,'title')).slice(0,40),news=tag(it,'ht:news_item');
  /* every related headline (up to 3): the AI note reads who someone is from them instead of guessing */
  const context=[...it.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)].map(m=>text(m[1]).slice(0,120)).filter(Boolean).slice(0,3);
  return {term,context,reading:KANA.test(term)?term:'',traffic:text(tag(it,'ht:approx_traffic')).slice(0,12),headline:text(tag(news,'ht:news_item_title')).slice(0,160),url:safeUrl(tag(news,'ht:news_item_url')),source:text(tag(news,'ht:news_item_source')).slice(0,40)};})
  .filter(w=>w.term&&/[぀-ヿ一-鿿]/.test(w.term));
}
/* NHK fallback: terms in 「」 from today's headlines (names of laws, events, catchphrases) */
export function parseNhk(xml){
 const seen=new Set(),out=[];
 for(const it of items(xml)){const title=text(tag(it,'title')),url=safeUrl(tag(it,'link'));
  for(const m of title.matchAll(/「([^」]{2,16})」/g)){const term=m[1].trim();if(seen.has(term)||!/[぀-ヿ一-鿿]/.test(term))continue;seen.add(term);out.push({term,reading:KANA.test(term)?term:'',traffic:'',headline:title.slice(0,160),url,source:'NHK'});}}
 return out;
}

/* ---- fetch + cache --------------------------------------------------------------------------------------------- */
async function get(url,fetcher){try{const r=await fetcher(url,{headers:{'user-agent':UA,accept:'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(10000)});return r.ok?await r.text():'';}catch{return '';}}
export const dayKey=(now=new Date())=>new Date(now.getTime()+9*3600e3).toISOString().slice(0,10); /* Japan date */
async function save(env,kind,day,payload,now){await env.DB.prepare('INSERT INTO daily_cache(kind,day,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,day) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(kind,day,JSON.stringify(payload),now.getTime()).run();}
async function load(env,kind,day){const row=day?await env.DB.prepare('SELECT payload,updated_at FROM daily_cache WHERE kind=? AND day=?').bind(kind,day).first():await env.DB.prepare('SELECT payload,updated_at FROM daily_cache WHERE kind=? ORDER BY day DESC LIMIT 1').bind(kind).first();if(!row)return null;try{return {...JSON.parse(row.payload),updatedAt:new Date(row.updated_at).toISOString()};}catch{return null;}}
export async function refreshNews(env,now=new Date(),fetcher=fetch){
 const lists=await Promise.all(NEWS_FEEDS.map(async f=>parseNews(await get(f.url,fetcher),f)));
 const prev=(await load(env,'news','').catch(()=>null))?.items||[],cutoff=now.getTime()-KEEP_NEWS_DAYS*864e5;
 const fresh=lists.flat(),seen=new Set();
 const all=[...fresh,...prev].filter(n=>n?.link&&!seen.has(n.link)&&seen.add(n.link)).filter(n=>fresh.includes(n)||!n.date||Date.parse(n.date)>=cutoff) /* what the feeds list now always stays; only carried-over stories expire */.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).filter((n,_,list)=>list.filter(x=>(x.cat||'gal')===(n.cat||'gal')).indexOf(n)<MAX_NEWS);
 if(!all.length)return 0;
 if(env.BUCKET)await mirrorImages(env,all,now,fetcher).catch(()=>0);else for(const n of all)n.image='';
 await save(env,'news',dayKey(now),{items:all,sources:[...new Map(NEWS_FEEDS.map(f=>[f.id,{id:f.id,name:f.name,cat:f.cat||'gal'}])).values()]},now);return all.length;
}
export async function refreshWords(env,now=new Date(),fetcher=fetch){
 let words=parseTrends(await get(TRENDS_URL,fetcher)),source='Google トレンド';
 if(words.length<10){const nhk=parseNhk(await get(NHK_URL,fetcher));const have=new Set(words.map(w=>w.term));words=[...words,...nhk.filter(w=>!have.has(w.term))];source=!have.size?'NHK':nhk.length?'Google トレンド · NHK':source;}
 words=words.slice(0,MAX_WORDS);if(!words.length)return 0;
 await glossWords(env,words).catch(()=>0);
 await save(env,'hotwords',dayKey(now),{words,source},now);return words.length;
}
export async function refreshDaily(env,now=new Date(),fetcher=fetch){const [news,words]=await Promise.all([refreshNews(env,now,fetcher).catch(()=>0),refreshWords(env,now,fetcher).catch(()=>0)]);const images=env.BUCKET?await cleanupImages(env,now).catch(()=>0):0;return {news,words,removed:images};}
/* E415 (user: the sites publish once a day; refresh when I open it): the cron runs once a day; besides that the first
   request of a new Japan day fetches inline, and the page's refresh button (?refresh=1) refetches at most every
   FORCE_GAP so a busy page cannot hammer the source sites. */
export const FORCE_GAP=10*60e3;
async function cached(env,kind,now,refresh,force=false){
 let row=await load(env,kind,'');
 const age=row?now.getTime()-Date.parse(row.updatedAt):Infinity,stale=!row||dayKey(new Date(Date.parse(row.updatedAt)))!==dayKey(now);
 if(stale||force&&age>FORCE_GAP){await refresh(env,now).catch(()=>0);row=await load(env,kind,'')||row;}
 return row;
}
const forced=url=>url?.searchParams?.get('refresh')==='1';
/* E415 full text only for sources the maintainer may republish: wrangler.toml NEWS_FULLTEXT_SOURCES = "moepedia,…"
   (empty by default). Empty → the app fetches the article on the user's PC instead. */
export const fulltextSources=env=>new Set(String(env.NEWS_FULLTEXT_SOURCES||'').split(',').map(s=>s.trim()).filter(Boolean));
const NOINDEX={'x-robots-tag':'noindex, nofollow'};
export async function newsGet(env,{json},now=new Date(),url=null){const row=await cached(env,'news',now,refreshNews,forced(url)),allow=fulltextSources(env);return json({items:(row?.items||[]).map(n=>({...n,fulltext:allow.has(n.sourceId)})),sources:row?.sources||NEWS_FEEDS.map(f=>({id:f.id,name:f.name})),updatedAt:row?.updatedAt||null},200,{'cache-control':'public, max-age=600',...NOINDEX});}
export async function hotWordsDailyGet(env,url,{json,fail},now=new Date()){
 const day=url.searchParams.get('day')||'';if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return fail('INVALID_DAY',400);
 const row=day?await load(env,'hotwords',day):await cached(env,'hotwords',now,refreshWords,forced(url));
 return json({day:day||dayKey(now),words:row?.words||[],source:row?.source||'',updatedAt:row?.updatedAt||null},200,{'cache-control':'public, max-age=600'});
}

/* ---- thumbnails mirrored into R2 -------------------------------------------------------------------------------
   The app's CSP allows only its own images, and the source sites can be slow from mainland China, so every thumbnail
   is copied to R2 (daily-img/<id>) and served as GET /api/news/img/<id>. Stories without an RSS picture get their
   page's og:image (only for the top MIRROR stories, to stay under the Worker's subrequest limit). Objects older than
   KEEP_DAYS are deleted by the same cron. */
export const MIRROR=120,NEW_IMAGES=16,IMG_MAX=900*1024,KEEP_DAYS=2;
const IMG_TYPES=/^image\/(jpeg|png|webp|gif|avif)$/;
async function hex(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);}
async function ogImage(link,fetcher){try{const r=await fetcher(link,{headers:{'user-agent':UA,accept:'text/html'},signal:AbortSignal.timeout(8000)});if(!r.ok)return '';const html=(await r.text()).slice(0,200000);const m=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);return m?safeUrl(new URL(decode(m[1]),link).href):'';}catch{return '';}}
async function copyImage(env,key,url,fetcher,now){
 try{const r=await fetcher(url,{headers:{'user-agent':UA,accept:'image/*'},signal:AbortSignal.timeout(10000)});const type=(r.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!r.ok||!IMG_TYPES.test(type)||Number(r.headers?.get?.('content-length')||0)>IMG_MAX)return false;
  const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length||bytes.length>IMG_MAX)return false;
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{at:String(now.getTime())}});return true;}catch{return false;}
}
export async function mirrorImages(env,items,now=new Date(),fetcher=fetch){
 let done=0,fetched=0;
 for(const [i,n] of items.entries()){
  const id=await hex(n.link),key='daily-img/'+id;
  if(i>=MIRROR){n.image='';continue;}
  let have=!!(await env.BUCKET.head?.(key));
  /* at most NEW_IMAGES downloads per run keeps the cron under the Worker's subrequest limit; the rest follow next run */
  if(!have&&fetched<NEW_IMAGES){fetched++;const src=/^\/api\//.test(n.image||'')?'':n.image||await ogImage(n.link,fetcher);have=!!src&&await copyImage(env,key,src,fetcher,now);}
  n.image=have?'/api/news/img/'+id:'';if(have)done++;
 }
 return done;
}
export async function imageGet(env,id){
 const obj=await env.BUCKET.get('daily-img/'+id);if(!obj)return new Response('',{status:404});
 return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'image/jpeg','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
}
export async function cleanupImages(env,now=new Date()){
 let removed=0,cursor;
 for(const prefix of ['daily-img/','daily-article/']){cursor=undefined;do{const page=await env.BUCKET.list({prefix,cursor,include:['customMetadata']});
  for(const o of page.objects||[]){const at=Number(o.customMetadata?.at)||new Date(o.uploaded||0).getTime();if(now.getTime()-at>KEEP_DAYS*864e5){await env.BUCKET.delete(o.key);removed++;}}
  cursor=page.truncated?page.cursor:undefined;}while(cursor);}
 return removed;
}

export async function articleGet(env,url,{json,fail},now=new Date(),fetcher=fetch){
 const link=url.searchParams.get('link')||'',allow=fulltextSources(env);
 const row=await load(env,'news','');const item=(row?.items||[]).find(n=>n.link===link);
 if(!item||!allow.has(item.sourceId)||!env.BUCKET)return fail('NOT_AVAILABLE',404,NOINDEX);
 const key='daily-article/'+await hex(link),hitObj=await env.BUCKET.get(key);
 if(hitObj){try{return json(JSON.parse(await new Response(hitObj.body).text()),200,{'cache-control':'public, max-age=3600',...NOINDEX});}catch{}}
 let html='';try{const r=await fetcher(link,{headers:{'user-agent':UA,accept:'text/html'},signal:AbortSignal.timeout(10000)});if(r.ok)html=await r.text();}catch{}
 const x=newsArticle.extract(html,link);if(!x.paragraphs.length)return fail('FETCH_FAILED',502,NOINDEX);
 const body={title:x.title||item.title,paragraphs:x.paragraphs,source:item.source,link};
 await env.BUCKET.put(key,JSON.stringify(body),{httpMetadata:{contentType:'application/json'},customMetadata:{at:String(now.getTime())}});
 return json(body,200,{'cache-control':'public, max-age=3600',...NOINDEX});
}

/* E415 a short Chinese note per hot word (退市 / 棒球选手 / 快餐产品), written once a day by Workers AI with the
   headline as context. The app prefers its own dictionary and falls back to machine translation when this is empty. */
/* E415: big models first (Qwen3 30B-A3B, 3B active, guessed jobs); DeepSeek V4 needs the paid Workers plan, so the
   chain tries the larger models the Free plan serves and ends with the one known to work. The first good answer wins. */
/* live check 2026-11-11 on the Free plan: Kimi K2.6 and GLM-5.3 need the paid plan, gpt-oss-120b returns no list,
   Llama 3.3 70B answers all ten well */
export const GLOSS_CHAIN=['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/qwen/qwen3-30b-a3b-fp8'];
export const GLOSS_MODEL=GLOSS_CHAIN[0],GLOSS_FALLBACK=GLOSS_CHAIN[1];
/* E415 (user: 「ゴリ = 网红」 reads as if the word meant 网红): every note says what kind of thing the word is.
   type: 词语 (an ordinary word: note = its meaning) or 人名 / 组织 / 作品 / 地名 / 商品 / 事件 (a proper noun: note =
   who or what it is, never the name itself). The page shows the type as a small tag beside the note. */
export const GLOSS_PROMPT='你是给中国读者看的日语词汇注释员。对每个日语词，结合给出的新闻标题，先判断类型，再写不超过16个字的简体中文说明。类型只能是：词语、人名、组织、作品、地名、商品、事件。词语：说明写中文词义（例：上場廃止→退市）。人名：说明写这个人是谁，国籍或领域加身份（例：ゴリ→日本网红（YouTuber），岡本和真→日本职业棒球选手），绝对不能只写名字本身或它的中文写法。组织、作品、地名、商品、事件：说明写它是什么（例：海ほたる→东京湾跨海公路的休息站）。身份和类型以给出的新闻标题为准，要充分利用标题里的线索：标题写「経済評論家の○○氏」就写经济评论家；标题里出现比赛、项目或行业（MotoGP、F1、NPB、独立リーグ、オーナー、YouTuber、芥川賞 等）就据此写具体身份（例：日本摩托车赛车手、F1车队老板、日本职业棒球选手）。只有标题里完全没有线索又不确定时，人名才写「日本人物」，不要凭空猜职业。类型必须和说明一致：说明是球队、公司、机构、团体就选组织；是人就选人名；是动画、漫画、游戏、电影、歌曲就选作品。必须全部使用简体中文，不能出现日文假名。只输出 JSON 数组，顺序与输入一致，每项形如 {"type":"人名","note":"日本网红（YouTuber）"}，不要输出其他内容。';
export const GLOSS_RETRY='上一次的说明只重复了名字，没有说明是什么。请重新判断类型并写说明：人名写国籍或领域加身份（例：日本职业棒球选手、日本女演员、日本网红（YouTuber）），其他专有名词写它是什么。绝对不能只写名字本身、它的中文写法或音译。必须用简体中文。只输出 JSON 数组，每项形如 {"type":"人名","note":"日本职业棒球选手"}。';
const KINDS={'词语':'word','普通词':'word','词汇':'word','人名':'person','人物':'person','组织':'org','团体':'org','公司':'org','企业':'org','作品':'work','地名':'place','地点':'place','设施':'place','商品':'product','产品':'product','事件':'event'};
export const KIND_IDS=['word','person','org','work','place','product','event'];
/* Models answer with a JSON array of strings, or (Qwen 3 in JSON mode) an already-parsed array of objects such as
   {"term":"上場廃止","gloss":"退市"}: take the gloss-like field, else the first string that is not the term. */
const GLOSS_KEYS=['gloss','释义','meaning','definition','translation','note','解释','意思'];
function glossOf(v){
 if(typeof v==='string')return v;
 if(v&&typeof v==='object'){for(const k of GLOSS_KEYS)if(typeof v[k]==='string'&&v[k].trim())return v[k];const vals=Object.values(v).filter(x=>typeof x==='string');return vals.length>1?vals[vals.length-1]:vals[0]||'';}
 return '';
}
/* a note with kana is Japanese, not a Chinese gloss: drop it so the app falls back to machine translation */
const KANA_RE=/[\u3040-\u309f\u30a0-\u30ff]/;
function kindOf(v){const t=v&&typeof v==='object'?String(v.type??v['类型']??v.kind??'').trim():'';return KINDS[t]||(KIND_IDS.includes(t)?t:'');}
/* [{kind,gloss}] from any answer shape; notes with kana are dropped (Japanese, not a Chinese gloss), a leading
   「人名，」 is cut because the type is shown as a tag */
/* the type must agree with the note (金沢ドラゴンクロス: 作品 + 棒球队 → 组织) */
const KIND_BY_NOTE=[['org',/(球队|俱乐部|公司|企业|集团|机构|团体|组织|协会|联盟|政党|党$|大学|学校|医院|银行|事务所|乐队|组合$)/],['person',/(选手|演员|艺人|歌手|偶像|政治家|议员|大臣|首相|作家|漫画家|主播|网红|评论家|运动员|车手|教练|导演|社长|老板|模特|声优|主持人)/],['work',/(动画|漫画|游戏|电影|电视剧|剧集|小说|歌曲|专辑|作品)$/]];
export function fixKind(kind,note){if(!note||kind==='word')return kind;for(const [k,re] of KIND_BY_NOTE)if(re.test(note))return k;return kind;}
export function parseNotes(text,count){
 let list=Array.isArray(text)?text:null;
 if(!list){const raw=String(text||'').replace(/<think>[\s\S]*?<\/think>/g,'');const m=raw.match(/\[[\s\S]*\]/);if(!m)return [];try{list=JSON.parse(m[0]);}catch{return [];}}
 if(!Array.isArray(list))return [];
 return list.slice(0,count).map(v=>{const kind=kindOf(v);let g=glossOf(typeof v==='object'&&v?{...v,type:undefined,'类型':undefined,kind:undefined}:v).replace(/[\r\n]+/g,' ').trim();
  g=g.replace(/^(?:词语|人名|人物|组织|团体|作品|地名|地点|商品|产品|事件)\s*[，,：:]\s*/,'').slice(0,30);if(KANA_RE.test(g))g='';return {kind:fixKind(kind,g),gloss:g};});
}
export function parseGlosses(text,count){return parseNotes(text,count).map(n=>n.gloss);}
/* a note that only restates the name (岡本和真 → 冈本和真) says nothing: it shares most of its characters with the
   term. Short descriptions such as 日本演员 are fine (a length rule rejected them, E415 补 8). */
export function repeatsTerm(term,note,kind=''){
 const a=String(term||'').replace(/[\s・·.]/g,''),b=String(note||'').replace(/[\s・·.]/g,'');if(!b)return false;if(a===b)return true;
 const shared=[...b].filter(c=>a.includes(c)).length;if(shared/Math.max(1,b.length)>=0.5)return true;
 return false;
}
async function askNotes(env,model,prompt,words){
 const input=words.map((w,i)=>{const ctx=(w.context?.length?w.context:[w.headline]).filter(Boolean).map(h=>h.slice(0,120)).join(' ／ ');return `${i+1}. ${w.term}${ctx?'\n   新闻：'+ctx:''}`;}).join('\n');
 const out=await env.AI.run(model,{messages:[{role:'system',content:prompt+' /no_think'},{role:'user',content:input}],max_tokens:1400,temperature:0.2});
 /* Workers AI answers as {response} (Llama), {response:[…]} (Qwen 3 JSON mode) or OpenAI-style {choices:[{message:{content}}]} */
 const raw=out?.response??out?.result?.response??out?.choices?.[0]?.message?.content??out?.result?.choices?.[0]?.message?.content??'';
 return parseNotes(Array.isArray(raw)?raw:typeof raw==='string'?raw:JSON.stringify(raw),words.length);
}
async function glossWords(env,words){
 if(!env.AI||typeof env.AI.run!=='function'||!words.length)return 0;
 for(const model of [...new Set([...(env.DAILY_GLOSS_MODEL?[env.DAILY_GLOSS_MODEL]:[]),...GLOSS_CHAIN])]){
  try{const list=await askNotes(env,model,GLOSS_PROMPT,words);
   if(list.filter(n=>n.gloss).length<Math.ceil(words.length/3)){console.warn('gloss: too few from',model,list.filter(n=>n.gloss).length,'/',words.length);continue;}
   words.forEach((w,i)=>{const n=list[i];if(!n)return;if(n.kind)w.kind=n.kind;if(n.gloss&&!repeatsTerm(w.term,n.gloss,n.kind))w.gloss=n.gloss;});
   /* notes that only restated the name: ask once more for just those */
   const redo=words.filter((w,i)=>list[i]?.gloss&&!w.gloss);
   if(redo.length)try{const again=await askNotes(env,model,GLOSS_RETRY,redo);redo.forEach((w,i)=>{const n=again[i];if(n?.kind&&!w.kind)w.kind=n.kind;if(n?.gloss&&!repeatsTerm(w.term,n.gloss,w.kind))w.gloss=n.gloss;});}catch{}
   console.log('gloss: model',model,list.filter(n=>n.gloss).length,'/',words.length);
   return list.length;}
  catch(e){console.warn('gloss: model failed',model,String(e?.message||e).slice(0,200));}
 }
 return 0;
}
