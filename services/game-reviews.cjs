// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// On-demand community reviews from five public sources. Pages are fetched only
// when the user opens a platform or turns a page, one request per host at a
// time with a minimum gap, and cached; nothing is crawled in the background.
const fs=require('node:fs'),path=require('node:path');
const UA='MeguLit/1.0 (desktop galgame reader; on-demand review viewer)';
const PLATFORMS=[
 {key:'bangumi',name:'Bangumi',region:'zh',home:'https://bgm.tv'},
 {key:'twodfan',name:'2DFan',region:'zh',home:'https://2dfan.com'},
 {key:'egs',name:'批評空間',region:'ja',home:'https://erogamescape.dyndns.org'},
 {key:'vndb',name:'VNDB',region:'en',home:'https://vndb.org'},
 {key:'steam',name:'Steam',region:'en',home:'https://store.steampowered.com'},
];
const STEAM_DEPTH=1000;
const LANGS=new Set(['auto','zh-CN','zh-TW','ja','en','ko']);
const EGS_SQL='https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer_form.php';
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
function decode(s){return String(s||'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi,(m,e)=>{e=e.toLowerCase();if(e[0]==='#')return String.fromCodePoint(e[1]==='x'?parseInt(e.slice(2),16):Number(e.slice(1)));return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[e]??m;});}
function htmlText(s){return decode(String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>\s*<p[^>]*>/gi,'\n\n').replace(/<[^>]+>/g,'')).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
const between=(s,a,b)=>{const i=s.indexOf(a);if(i<0)return '';const j=s.indexOf(b,i+a.length);return j<0?'':s.slice(i+a.length,j);};
// Best title match: exact normalized name first, then containment either way.
function bestMatch(candidates,titles,names){const wanted=titles.map(normalize).filter(t=>t.length>1);let best=null,score=0;for(const c of candidates){for(const n of names(c).map(normalize).filter(Boolean)){for(const t of wanted){const s=n===t?3:n.includes(t)||t.includes(n)?(Math.min(n.length,t.length)/Math.max(n.length,t.length)>.5?2:1):0;if(s>score){score=s;best=c;}}}}return score>=2?best:null;}
// Steam English dates: "September 29, 2016", "4 January, 2018", or no year for the current year.
function steamDate(s){const m=String(s).match(/^(?:(\d{1,2}) (\w+)|(\w+) (\d{1,2})),?(?: (\d{4}))?$/);if(!m)return s;const month=new Date(`${m[2]||m[3]} 1, 2000`).getMonth();if(!Number.isFinite(month))return s;const year=Number(m[5])||new Date().getFullYear(),day=Number(m[1]||m[4]);return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
function sqlString(s){return "'"+String(s).replace(/'/g,"''").replace(/\\/g,'\\\\').slice(0,120)+"'";}
function egsRows(html){const table=between(html,'<div id="query_result_main">','</div>');const rows=[...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<t[hd]>([\s\S]*?)<\/t[hd]>/g)].map(c=>decode(c[1].replace(/<[^>]+>/g,''))));const head=rows.shift()||[];return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]])));}

class GameReviews{
 constructor(root,fetcher=fetch,translation={}){this.root=root;this.fetcher=fetcher;this.translation=translation;this.abort=new AbortController();this.cache=new Map();this.hosts=new Map();this.translations=new Map();this.file=path.join(root,'data/config/review-sources.json');}
 stop(){this.closed=true;this.abort.abort();}
 async request(url,options={},type='text'){
  if(this.closed)throw Error('RUNTIME_STOPPED');const host=new URL(url).host,previous=this.hosts.get(host)||Promise.resolve();let release;const slot=new Promise(r=>release=r);this.hosts.set(host,previous.then(()=>slot));await previous;
  try{const r=await this.fetcher(url,{...options,redirect:options.redirect||'follow',headers:{'User-Agent':UA,'Accept-Language':'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7',...(options.headers||{})},signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(15000)])});if(!r.ok)throw Error('REVIEW_HTTP_'+r.status);return type==='json'?await r.json():await r.text();}
  finally{setTimeout(release,700);}
 }
 cached(key,ttl,load){const hit=this.cache.get(key);if(hit&&Date.now()-hit.at<ttl)return hit.value;const value=load().catch(error=>{this.cache.delete(key);throw error;});this.cache.set(key,{at:Date.now(),value});return value;}
 game(id){const store=require('./store.cjs'),db=store.openStore(this.root);try{const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row)throw Error('GAME_NOT_FOUND');const game={row,original:JSON.parse(row.original||'{}')};const lib=game.original.library||{};const titles=[...new Set([...require('./game-enrichment.cjs').candidates(game),...(lib.names||[])])].filter(t=>String(t).length>1).slice(0,10);return {id,titles,vndb:String(game.original.vndbManual||lib.vndbId||''),vndbManual:String(game.original.vndbManual||''),appid:String(lib.appid||'')||require('../core/library.cjs').steamAppidFor(row.executable)};}finally{db.close();}}
 readSources(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'))||{};}catch{return {};}}
 saveSource(id,key,value){const all=this.readSources();all[id]={...all[id],[key]:value};fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(all));fs.renameSync(this.file+'.tmp',this.file);}
 // A platform identity once matched is remembered; misses retry after a day. A VNDB entry the user set replaces
 // whatever was remembered for VNDB.
  async identity(game,key){
   const saved=this.readSources()[game.id]?.[key];
   const steamMatches=key!=='vndb'||!game.appid||saved?.appid===game.appid&&(!game.vndb||saved.id===game.vndb);
   if(saved&&steamMatches&&!(key==='vndb'&&game.vndbManual&&saved.id!==game.vndbManual)&&(saved.id||Date.now()-saved.at<86400000))return saved.id?saved:null;
   let found=null;try{found=await this['find_'+key](game);}catch(error){if(error.message==='RUNTIME_STOPPED')throw error;return null;}
   this.saveSource(game.id,key,{...(found||{id:null}),...(key==='vndb'&&game.appid?{appid:game.appid}:{}),at:Date.now()});return found;
  }
 async find_bangumi(game){for(const title of game.titles.slice(0,5)){const r=await this.request('https://api.bgm.tv/v0/search/subjects?limit=10',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:title,filter:{type:[4]}})},'json');const hit=bestMatch(r.data||[],game.titles,s=>[s.name,s.name_cn]);if(hit)return {id:String(hit.id),title:hit.name_cn||hit.name};}return null;}
 async find_twodfan(game){for(const title of game.titles.slice(0,4)){const html=await this.request('https://2dfan.com/subjects/search?keyword='+encodeURIComponent(title));const cards=[...html.matchAll(/<div class="subject-card" id="subject_card_(\d+)">([\s\S]*?)(?=<div class="subject-card" id=|<\/div>\s*<\/div>\s*<\/div>\s*<div id="subject-list-pagination"|$)/g)].map(m=>({id:m[1],title:htmlText(between(m[2],'class="subject-card-title">','</h3>')),score:Number(htmlText(between(m[2],'subject-card-score-value">','</span>'))),votes:Number((htmlText(between(m[2],'subject-card-score-count">','</span>')).match(/\d+/)||[0])[0])}));const hit=bestMatch(cards,game.titles,c=>[c.title]);if(hit)return hit;}return null;}
 async find_egs(game){const list=game.titles.slice(0,8).map(sqlString).join(',');let rows=egsRows(await this.request(EGS_SQL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'sql='+encodeURIComponent(`select id,gamename,median,count2 from gamelist where gamename in (${list}) order by count2 desc nulls last limit 5`)}));if(!rows.length)for(const title of game.titles.slice(0,3)){rows=egsRows(await this.request(EGS_SQL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'sql='+encodeURIComponent(`select id,gamename,median,count2 from gamelist where gamename ilike ${sqlString('%'+title.replace(/[%_]/g,'')+'%')} order by count2 desc nulls last limit 8`)}));const hit=bestMatch(rows,game.titles,r=>[r.gamename]);if(hit){rows=[hit];break;}rows=[];}const hit=rows[0];return hit?{id:hit.id,title:hit.gamename}:null;}
  async find_vndb(game){
   if(game.appid&&!game.vndbManual){
    const r=await this.request('https://api.vndb.org/kana/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['extlink','=',['steam',Number(game.appid)]],fields:'vns.id',results:5})},'json');
    const id=r.results?.flatMap(x=>x.vns||[])[0]?.id;
    return id?{id}:null;
   }
   if(game.vndb)return {id:game.vndb.startsWith('v')?game.vndb:'v'+game.vndb};
  // Enrichment may have matched VNDB without writing the id back to the library row.
  try{const url=JSON.parse(fs.readFileSync(path.join(this.root,'data/config/game-reception.json'),'utf8'))[game.id]?.vndb?.url||'';const m=/vndb\.org\/(v\d+)/.exec(url);if(m)return {id:m[1]};}catch{}
  for(const title of game.titles.slice(0,4)){const r=await this.request('https://api.vndb.org/kana/vn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['search','=',title],fields:'title,alttitle,titles.title',results:8,sort:'searchrank'})},'json');const hit=bestMatch(r.results||[],game.titles,v=>[v.title,v.alttitle,...(v.titles||[]).map(t=>t.title)]);if(hit)return {id:hit.id,title:hit.title};}return null;}
 async find_steam(game){return /^\d+$/.test(game.appid)?{id:game.appid}:null;}

 async score(key,ident){
  if(key==='bangumi'){const r=await this.request('https://api.bgm.tv/v0/subjects/'+ident.id,{},'json');return {value:r.rating?.score||null,scale:10,votes:r.rating?.total||0,url:'https://bgm.tv/subject/'+ident.id};}
  if(key==='twodfan')return {value:ident.score||null,scale:5,votes:ident.votes||0,url:'https://2dfan.com/subjects/'+ident.id};
  if(key==='egs'){const [row]=egsRows(await this.request(EGS_SQL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'sql='+encodeURIComponent(`select median,average2,count2 from gamelist where id=${Number(ident.id)}`)}));return {value:row?.median?Number(row.median):null,scale:100,votes:Number(row?.count2)||0,url:'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game='+Number(ident.id)};}
  if(key==='vndb'){const r=await this.request('https://api.vndb.org/kana/vn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['id','=',ident.id],fields:'rating,votecount'})},'json');const v=r.results?.[0];return {value:Number.isFinite(v?.rating)?Math.round(v.rating)/10:null,scale:10,votes:v?.votecount||0,url:'https://vndb.org/'+ident.id};}
  if(key==='steam'){const r=await this.request(`https://store.steampowered.com/appreviewhistogram/${ident.id}?l=english&review_score_preference=0`,{},'json');const up=(r.results?.rollups||[]).reduce((n,x)=>n+(x.recommendations_up||0),0),down=(r.results?.rollups||[]).reduce((n,x)=>n+(x.recommendations_down||0),0);return {value:up+down?Math.round(up/(up+down)*100):null,scale:'%',votes:up+down,url:'https://store.steampowered.com/app/'+ident.id};}
 }
 async summary(id){const game=this.game(String(id));return this.cached('summary:'+game.id,6*3600000,async()=>({platforms:await Promise.all(PLATFORMS.map(async p=>{try{const ident=await this.identity(game,p.key);if(!ident)return {...p,available:false};const score=await this.score(p.key,ident);return {...p,available:true,matched:ident.title||'',...score};}catch(error){if(error.message==='RUNTIME_STOPPED')throw error;return {...p,available:false,error:'REVIEW_NETWORK'};}}))}));}

 // Each source has its own native page size; arbitrary user page sizes are
 // served by fetching the covering source pages and slicing.
 async source(key,ident,n){return this.cached(`src:${key}:${ident.id}:${n}`,30*60000,()=>this['page_'+key](ident,n));}
 async page_bangumi(ident,n){const size=50,r=await this.request(`https://next.bgm.tv/p1/subjects/${ident.id}/comments?limit=${size}&offset=${(n-1)*size}`,{},'json');return {size,total:r.total||0,items:(r.data||[]).map(c=>({id:'bgm'+c.id,author:c.user?.nickname||c.user?.username||'',rating:c.rate?{value:c.rate,scale:10}:null,date:c.updatedAt?new Date(c.updatedAt*1000).toISOString().slice(0,10):'',text:String(c.comment||''),url:`https://bgm.tv/subject/${ident.id}/comments`}))};}
 async page_twodfan(ident,n){const html=await this.request(`https://2dfan.com/subjects/${ident.id}?page=${n}`),list=between(html,'id="comments-list"','id="load-more-container"')||html,meta=htmlText(between(html,'nexus-pagination-info">','</span>')),total=Number((meta.match(/(\d+)\s*条/)||[])[1])||0;
  const items=[...list.matchAll(/<div class="comment-item" id="comment-(\d+)">([\s\S]*?)(?=<div class="comment-item" id="comment-|$)/g)].map(([,cid,body])=>({id:'2df'+cid,author:htmlText(between(body,'comment-author-name">','</span>')),date:(body.match(/datetime="(\d{4}-\d{2}-\d{2})/)||[])[1]||'',spoiler:/data-spoiler="true"/.test(body),text:htmlText(between(body,'data-collapsible-content>','</div>')),likes:Number(htmlText(between(body,'comment-diggs-count">','</span>')))||0,url:'https://2dfan.com/comments/'+cid}));
  return {size:items.length||40,total:total||items.length,items};}
 async page_egs(ident,n){const size=50,game=Number(ident.id),post=sql=>this.request(EGS_SQL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'sql='+encodeURIComponent(sql)});
  const total=n===1?Number(egsRows(await post(`select count(*) as n from userreview where game=${game} and hitokoto is not null`))[0]?.n)||0:undefined;
  const rows=egsRows(await post(`select uid,tokuten,hitokoto,netabare,timestamp,display_unique_count,(memo is not null) as has_memo from userreview where game=${game} and hitokoto is not null order by display_unique_count desc nulls last, timestamp desc limit ${size} offset ${(n-1)*size}`));
  return {size,total,items:rows.map(r=>({id:'egs'+r.uid,author:r.uid,rating:r.tokuten?{value:Number(r.tokuten),scale:100}:null,date:String(r.timestamp||'').slice(0,10),spoiler:r.netabare==='t',text:r.hitokoto||'',views:Number(r.display_unique_count)||0,more:r.has_memo==='t',url:`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/memo.php?game=${game}&uid=${encodeURIComponent(r.uid)}`}))};}
 async page_vndb(ident){const html=await this.request(`https://vndb.org/${ident.id}/reviews`),list=between(html,'<div class="reviews">','</main>');
  const items=[...list.matchAll(/<article>([\s\S]*?)<\/article>/g)].map(([,a])=>{const head=a.match(/<span>(\w+) by <a [^>]*>([^<]*)<\/a> on (\d{4}-\d{2}-\d{2})<\/span>/)||[],wid=(a.match(/\/report\/(w\d+)/)||[])[1]||'',body=(a.match(/<\/span>&gt;<\/span>([\s\S]*?)<\/div><div><a href="\/w\d+#threadstart">/)||a.match(/report<\/a>><\/span>([\s\S]*?)<\/div><div>/)||[])[1]||'';return {id:'vndb'+wid,author:decode(head[2]||''),kind:head[1]||'',date:head[3]||'',rating:(a.match(/<span>(\d+(?:\.\d+)?)\/10<\/span>/)||[])[1]?{value:Number(a.match(/<span>(\d+(?:\.\d+)?)\/10<\/span>/)[1]),scale:10}:null,text:htmlText(body.replace(/<a href="\/w\d+#review">[\s\S]*$/,'')),more:/Read more/.test(body),replies:Number((a.match(/>(\d+) comments?<\/a>/)||[])[1])||0,likes:Number((a.match(/(-?\d+) points?<\/small>/)||[])[1])||0,url:'https://vndb.org/'+wid};}).filter(x=>x.text);
  return {size:Math.max(1,items.length),total:items.length,items};}
 // Steam's homecontent serves review page n at p=n+1 (p=1 and p=2 are both the first page).
 async page_steam(ident,n){const size=10,q=n+1,html=await this.request(`https://steamcommunity.com/app/${ident.id}/homecontent/?userreviewsoffset=${n*size}&p=${q}&numperpage=${size}&browsefilter=toprated&appid=${ident.id}&appHubSubSection=10&l=english&filterLanguage=all&searchText=&maxInappropriateScore=100&forceanon=1`);
  const items=html.split('class="apphub_Card ').slice(1).map(card=>{const helpful=htmlText(between(card,'class="found_helpful">','<div class="review_award')||between(card,'class="found_helpful">','</div>')),url=(card.match(/data-modal-content-url="([^"]+)"/)||[])[1]||'',text=between(card,'class="apphub_CardTextContent">','<div class="UserReviewCardContent_Footer">'),body=text.replace(/<div class="date_posted">[\s\S]*?<\/div>/,'').replace(/<div class="received_compensation"[\s\S]*?<\/div>/,'').replace(/(<\/div>\s*)+$/,'');return {id:'steam'+url.replace(/\D/g,''),author:htmlText(between(card,'apphub_CardContentAuthorName','</a>').replace(/^[^>]*>/,'').replace(/^[^>]*>/,'')),date:steamDate(htmlText(between(card,'class="date_posted">','</div>')).replace(/^Posted:\s*/,'')),recommended:/icon_thumbsUp/.test(card),hours:Number((htmlText(between(card,'class="hours">','</div>')).replace(/,/g,'').match(/[\d.]+/)||[])[0])||0,text:htmlText(body.replace(/<\/div>\s*<\/div>[\s\S]*$/,'')),likes:Number((helpful.replace(/,/g,'').match(/(\d+) (?:people|person) found this review helpful/)||[])[1])||0,funny:Number((helpful.replace(/,/g,'').match(/(\d+) (?:people|person) found this review funny/)||[])[1])||0,replies:Number(htmlText(between(card,'apphub_CardCommentCount alignNews">','</div>')))||0,url};}).filter(x=>x.text);
  return {size,total:undefined,items};}
 async page(id,key,page=1,size=10){
  const platform=PLATFORMS.find(p=>p.key===key);if(!platform)throw Error('INVALID_REVIEW_PLATFORM');size=Math.max(5,Math.min(50,Math.floor(Number(size))||10));page=Math.max(1,Math.floor(Number(page))||1);
  const game=this.game(String(id)),ident=await this.identity(game,key);if(!ident)return {platform:key,available:false,items:[],total:0,page:1,pages:1,size};
  // Steam pages chain through a cursor, so cap its depth to keep jumps bounded.
  const first=await this.source(key,ident,1);let total=first.total;if(total===undefined)total=Math.min(STEAM_DEPTH,(await this.summary(id)).platforms.find(p=>p.key===key)?.votes||first.items.length);
  const pages=Math.max(1,Math.ceil(total/size));page=Math.min(page,pages);const start=(page-1)*size,end=Math.min(total,start+size),items=[];
  for(let n=Math.floor(start/first.size)+1;n<=Math.floor(Math.max(start,end-1)/first.size)+1;n++){const src=n===1?first:await this.source(key,ident,n);const base=(n-1)*first.size;items.push(...src.items.filter((_,i)=>base+i>=start&&base+i<end));if(src.items.length<first.size)break;}
  return {platform:key,available:true,matched:ident.title||'',items,total,page,pages,size,url:(await this.score(key,ident).catch(()=>({}))).url||platform.home};
 }
 async translate(texts,target,source='auto'){if(!LANGS.has(target)||target==='auto'||!LANGS.has(source))throw Error('INVALID_LANGUAGE');const list=(Array.isArray(texts)?texts:[]).slice(0,60).map(t=>String(t||'').slice(0,4000));
  // The app's API / model engines translate into Chinese or English only; other targets use machine translation.
  const chosen=this.translation.engine?.()||'machine',engine=chosen!=='machine'&&this.translation.translate&&['zh-CN','en'].includes(target)?chosen:'machine';
  const viaEngine=async text=>{const out=String(await this.translation.translate(text,target==='en'?'en':'zh',engine)||'').trim();if(!out)throw Error('TRANSLATION_EMPTY');return out;};
  const one=async text=>{if(!text.trim())return '';const key=engine+'|'+source+'>'+target+':'+text;if(this.translations.has(key))return this.translations.get(key);if(engine!=='machine'){const out=await viaEngine(text);if(this.translations.size>2000)this.translations.clear();this.translations.set(key,out);return out;}return require('../core/translate.cjs').translateFree(text,{fetcher:this.fetcher,source,target,signal:this.abort.signal});};
  // A rate limit stops the batch instead of hammering the service with the rest of the page.
  const out=[];let failure='';for(const text of list){if(/^TRANSLATION_(?:HTTP_|UNAVAILABLE)/.test(failure)){out.push('');continue;}out.push(await one(text).catch(error=>{failure||=String(error?.message||error);return '';}));}
  return {texts:out,engine,requested:chosen,error:failure};}
}
module.exports={GameReviews,PLATFORMS,htmlText,egsRows,bestMatch,sqlString};
