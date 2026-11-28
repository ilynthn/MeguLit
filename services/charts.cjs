// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 排行榜 · 作品榜 (web/charts-view.js): Galgame / light novel / otome rankings, read only from the relay
   (GET /api/charts?board=&source=, covers from GET /api/charts/img/<id>; relay/src/charts.js fetches VNDB, Bangumi and
   AniList once a day). The app never calls those sites for the lists.
   Every good answer is kept in data/cache/charts/<board>-<source>.json; when the relay cannot be reached (or has no list
   yet) that copy is shown with state 'stale'. Each row is matched against the game library (VNDB id first, then the
   title) so the page can open the game's own detail page; rows not in the library open the source site. */
const fs=require('node:fs'),path=require('node:path');
const relay=require('./relay-config.cjs');
const BOARDS={gal:['vndb','bangumi'],ln:['bangumi','anilist'],otome:['vndb','bangumi']};
const SOURCES={vndb:{id:'vndb',name:'VNDB',url:'https://vndb.org'},bangumi:{id:'bangumi',name:'Bangumi',url:'https://bgm.tv'},anilist:{id:'anilist',name:'AniList',url:'https://anilist.co'}};
/* the hosts a row may link to, per source */
const HOSTS={vndb:'vndb.org',bangumi:'bgm.tv',anilist:'anilist.co'};
const TIMEOUT=8000,THUMB_BUDGET=2500,IMG_MAX=600*1024,KEEP_IMG_DAYS=7;
const TYPES={'image/jpeg':1,'image/png':1,'image/webp':1,'image/gif':1};
const str=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const num=v=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):0;
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
function pick(board,source){const b=BOARDS[board]?board:'gal';return {board:b,source:BOARDS[b].includes(source)?source:BOARDS[b][0]};}
function link(v,source){try{const u=new URL(String(v||''));return u.protocol==='https:'&&u.hostname===HOSTS[source]&&!u.username&&!u.password?u.href:'';}catch{return '';}}
/* what the relay sent, checked field by field; anything odd is dropped */
function clean(d,source){
 const items=(Array.isArray(d?.items)?d.items:[]).slice(0,50).map((x,i)=>({rank:Number.isInteger(x?.rank)&&x.rank>0?x.rank:i+1,id:str(x?.id,40),vndb:/^v\d{1,7}$/.test(String(x?.vndb||''))?x.vndb:'',title:str(x?.title,160),zh:str(x?.zh,160),score:Math.min(10,num(x?.score)),votes:Math.floor(num(x?.votes)),year:Number.isInteger(x?.year)&&x.year>1900?x.year:0,cover:/^\/api\/charts\/img\/[0-9a-f]{32}$/.test(String(x?.cover||''))?x.cover:'',url:link(x?.url,source)})).filter(x=>x.id&&x.title&&x.url);
 return {items,updatedAt:str(d?.updatedAt,30)||null};
}
const cacheFile=(root,board,source)=>path.join(root,'data','cache','charts',`${board}-${source}.json`);
function readCache(root,board,source){try{const j=JSON.parse(fs.readFileSync(cacheFile(root,board,source),'utf8'));return Array.isArray(j?.items)&&j.items.length?j:null;}catch{return null;}}
function writeCache(root,board,source,data){const f=cacheFile(root,board,source);try{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f+'.tmp',JSON.stringify(data));fs.renameSync(f+'.tmp',f);}catch{}}
async function get(url,fetcher){
 try{const r=await fetcher(url,{method:'GET',headers:{'user-agent':'MeguLit'},signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)return {state:'error',error:'HTTP_'+r.status};return {state:'ok',data:await r.json()};}
 catch(e){return {state:'error',error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
}
/* ---- covers: data/cache/charts-img, then the relay ------------------------------------------------------------- */
const imgDir=root=>path.join(root,'data','cache','charts-img');
async function thumbnail(root,base,ref,fetcher){
 const file=path.join(imgDir(root),ref.slice(16));
 try{const raw=fs.readFileSync(file);const cut=raw.indexOf(10);if(cut>0)return 'data:'+raw.subarray(0,cut).toString()+';base64,'+raw.subarray(cut+1).toString('base64');}catch{}
 if(!base)return '';
 try{const r=await fetcher(base+ref,{method:'GET',headers:{'user-agent':'MeguLit'},signal:AbortSignal.timeout(TIMEOUT)});const type=String(r.headers?.get?.('content-type')||'').split(';')[0].trim();
  if(!r.ok||!TYPES[type])return '';const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>IMG_MAX)return '';
  try{fs.mkdirSync(imgDir(root),{recursive:true});fs.writeFileSync(file,Buffer.concat([Buffer.from(type+'\n'),bytes]));}catch{}
  return 'data:'+type+';base64,'+bytes.toString('base64');}catch{return '';}
}
function pruneImages(root,now=Date.now()){try{for(const name of fs.readdirSync(imgDir(root))){const f=path.join(imgDir(root),name);if(now-fs.statSync(f).mtimeMs>KEEP_IMG_DAYS*864e5)fs.rmSync(f,{force:true});}}catch{}}
/* the page waits at most THUMB_BUDGET for covers; the rest keep downloading into the cache for the next visit */
async function thumbnails(root,base,items,fetcher){
 pruneImages(root);const jobs=items.map(async x=>{const ref=x.cover;x.cover='';if(ref)x.cover=await thumbnail(root,base,ref,fetcher).catch(()=>'');});
 let timer;await Promise.race([Promise.all(jobs),new Promise(r=>{timer=setTimeout(r,THUMB_BUDGET);timer.unref?.();})]);clearTimeout(timer);
}
/* ---- library match --------------------------------------------------------------------------------------------- */
function libraryIndex(db){
 const byVndb=new Map(),byTitle=new Map();if(!db)return {byVndb,byTitle};
 let rows=[];try{rows=db.prepare('SELECT id,title,original FROM games WHERE removed_at IS NULL').all();}catch{return {byVndb,byTitle};}
 for(const row of rows){let o={};try{o=JSON.parse(row.original||'{}')||{};}catch{}const lib=o.library||{};
  for(const v of [o.vndbManual,lib.vndbId]){const m=/^(?:https?:\/\/(?:www\.)?vndb\.org\/)?v?(\d{1,7})$/i.exec(String(v||'').trim());if(m&&!byVndb.has('v'+m[1]))byVndb.set('v'+m[1],row.id);}
  for(const t of [row.title,o.vndbTitle,...(Array.isArray(o.titleAliases)?o.titleAliases:[]),...(Array.isArray(lib.names)?lib.names:[])]){const k=norm(t);if(k.length>1&&!byTitle.has(k))byTitle.set(k,row.id);}}
 return {byVndb,byTitle};
}
function matchLibrary(items,db,board){
 if(board==='ln')return items;
 const {byVndb,byTitle}=libraryIndex(db);
 for(const x of items){const id=(x.vndb&&byVndb.get(x.vndb))||byTitle.get(norm(x.title))||(x.zh&&byTitle.get(norm(x.zh)))||'';if(id)x.gameId=id;}
 return items;
}
/* 2026-11-28 按游戏 cards: what the app knows about a title without asking anyone — the library game (detail page and
   its cover) and, from the saved 作品榜 lists, the Chinese name and the cover already downloaded through the relay */
function readLocalImage(root,ref){try{const raw=fs.readFileSync(path.join(imgDir(root),String(ref).slice(16)));const cut=raw.indexOf(10);return cut>0?'data:'+raw.subarray(0,cut).toString()+';base64,'+raw.subarray(cut+1).toString('base64'):'';}catch{return '';}}
function titleInfo(root,db,titles){
 const known=new Map();
 for(const [board,list] of Object.entries(BOARDS))for(const source of list)for(const x of readCache(root,board,source)?.items||[]){const k=norm(x.title);if(k&&!known.has(k))known.set(k,x);if(x.zh&&!known.has(norm(x.zh)))known.set(norm(x.zh),x);}
 const {byVndb,byTitle}=libraryIndex(db);let covers=new Map();
 try{covers=new Map(db.prepare("SELECT id,cover FROM games WHERE removed_at IS NULL AND cover!=''").all().map(r=>[r.id,r.cover]));}catch{}
 return titles.map(title=>{const k=norm(title),chart=known.get(k)||null,gameId=byTitle.get(k)||(chart?.vndb&&byVndb.get(chart.vndb))||(chart&&byTitle.get(norm(chart.title)))||'';
  let cover='';if(gameId&&covers.get(gameId))try{cover=require('./store.cjs').imageData(root,'covers',covers.get(gameId))||'';}catch{}
  if(!cover&&chart?.cover)cover=readLocalImage(root,chart.cover);
  const zh=chart&&chart.zh&&norm(chart.zh)!==k?chart.zh:'';
  return {gameId,zh,cover};});
}
/* ---- the page -------------------------------------------------------------------------------------------------- */
async function view(root,db,request={},options={}){
 const {board,source}=pick(String(request.board||''),String(request.source||''));
 const env=options.env||process.env,fetcher=options.fetch||fetch,base=relay.relayBase(root,env);
 const head={board,source,sources:BOARDS[board].map(id=>SOURCES[id]),boards:Object.keys(BOARDS)};
 let fresh=null,error='';
 if(base){const r=await get(`${base}/api/charts?board=${board}&source=${source}`,fetcher);if(r.state==='ok'){const c=clean(r.data,source);if(c.items.length)fresh=c;else error='PENDING';}else error=r.error;}
 const data=fresh||readCache(root,board,source);
 if(fresh)writeCache(root,board,source,fresh);
 if(!data)return {...head,state:!base?'not-configured':error==='PENDING'?'pending':'error',error:error||undefined,items:[],updatedAt:null};
 const items=matchLibrary(data.items.map(x=>({...x})),db,board);
 await thumbnails(root,base,items,fetcher);
 return {...head,state:fresh?'ok':'stale',error:fresh?undefined:error||'NOT_CONFIGURED',items,updatedAt:data.updatedAt||null};
}
/* rows link only to their own source site */
function canOpen(url){try{const u=new URL(String(url||''));return u.protocol==='https:'&&Object.values(HOSTS).includes(u.hostname);}catch{return false;}}
module.exports={titleInfo,BOARDS,SOURCES,HOSTS,view,clean,canOpen,matchLibrary,readCache,cacheFile};
