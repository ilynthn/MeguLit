// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The Seed catalog page (web/seed-catalog.js): every game that has a seed, grouped by developer, with its cover.
   The list is the built-in seeds (core/profiles/seed.cjs). Names, developers and covers come from VNDB by each seed's public
   VNDB id (prints.vndb); only those ids are sent, nothing from the user's library. Answers are kept in
   data/config/seed-catalog.json: fresh for 30 days (ids VNDB does not know: 7 days). A stale answer is shown at once and
   refreshed behind it, as the site-updates list in bridge.cjs does; after a failed lookup VNDB is not asked again for 10
   minutes. A cover is saved once under data/assets/covers as seed-<vid>-<hash>.<ext> (a new hash when VNDB changes the image).
   Two modes. Normal: only covers VNDB rates safe (image.sexual < 1 and image.violence < 1, as services/leaderboard.cjs
   featureCover asks), and a cover without numeric ratings counts as not safe. NSFW: every cover. The app's R18 filter
   (native pref safe_cg, "适合录屏或给别人看") keeps the page in normal mode whatever the page asks. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {engines:ENGINES,snapshot:SNAPSHOT}=require('./seed-catalog-engine-map.cjs');
const VNDB='https://api.vndb.org/kana/vn',USER_AGENT='MeguLit seed catalog';
const FIELDS='title,alttitle,developers.id,developers.name,developers.original,image.url,image.thumbnail,image.sexual,image.violence';
const DAY=864e5,FRESH=30*DAY,MISS=7*DAY,RETRY=10*6e4,TIMEOUT=8000,MAX_COVER=4*1024*1024,PAGE=100,MAX_PAGE=1000;
const VID=/^v\d{1,7}$/,PID=/^p\d{1,7}$/,IMG=/^https:\/\/(?:[a-z0-9-]+\.)*vndb\.org\/[^\s?#]+$/;
const cacheFile=root=>path.join(root,'data','config','seed-catalog.json');
const coverDir=root=>path.join(root,'data','assets','covers');
/* VNDB rates 0 (safe) to 2; anything that is not a finite number counts as 2 */
const rating=v=>typeof v==='number'&&Number.isFinite(v)?v:2;
const safe=img=>!!img&&rating(img.sexual)<1&&rating(img.violence)<1;
const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
/* seeds may write v0123; VNDB answers v123 */
const vid=v=>{const s=String(v||'').trim().toLowerCase();return VID.test(s)?'v'+Number(s.slice(1)):'';};
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

/* one VNDB answer (or one cached entry), kept to the fields the page shows; the thumbnail is enough for a card */
function cleanVn(r){
 if(!plain(r))return null;
 const img=plain(r.image)?r.image:null,url=img&&[img.thumbnail,img.url].find(u=>typeof u==='string'&&IMG.test(u));
 return {title:text(r.title,200),alttitle:text(r.alttitle,200),
  developers:(Array.isArray(r.developers)?r.developers:[]).filter(d=>plain(d)&&PID.test(String(d.id||''))).slice(0,4).map(d=>({id:d.id,name:text(d.name,120),original:text(d.original,120)})),
  image:url?{url,sexual:rating(img.sexual),violence:rating(img.violence)}:null};
}
/* the parsed file, parsed again only when the file changed: engine pages add thousands of games, and every cover reads it.
   Callers never change this value; readCache copies what it keeps. */
let parsed=null;
function rawCache(root){
 const file=cacheFile(root);let st=null;try{st=fs.statSync(file,{bigint:true});}catch{}
 const stamp=st&&[file,st.mtimeNs,st.size,st.ino].join('|');
 if(stamp&&parsed?.stamp===stamp)return parsed.value;
 let v=null;try{v=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 parsed=stamp?{stamp,value:v}:null;
 return v;
}
const cleanEntry=(id,e)=>!VID.test(id)||!plain(e)||!Number.isFinite(e.at)?null:e.miss===true?{miss:true,at:e.at}:{...cleanVn(e),at:e.at};
/* the cache file is cleaned the same way on every read: a hand-edited or damaged entry cannot bring an unsafe cover back.
   failedAt pauses the seeded games' lookups and engineFailedAt the engine pages, so a failed engine page does not hide
   the names of the tested games. */
function readCache(root){
 const v=rawCache(root),time=k=>Number.isFinite(v?.[k])?v[k]:0;
 const out={vn:{},engines:{},failedAt:time('failedAt'),engineFailedAt:time('engineFailedAt')};
 if(plain(v)&&plain(v.vn))for(const [id,e] of Object.entries(v.vn)){const c=cleanEntry(id,e);if(c)out.vn[id]=c;}

 if(plain(v?.engines))for(const id of Object.keys(ENGINES)){
  const e=v.engines[id];if(!plain(e)||!plain(e.entries)||!/^[0-9a-f]{64}$/.test(e.scope))continue;
  const entries={};
  for(const [key,row] of Object.entries(e.entries)){
   const page=Number(key);
   if(String(page)!==key||!Number.isInteger(page)||page<0||page>MAX_PAGE||!plain(row)||!Number.isFinite(row.at)||row.at<0)continue;
   if(!page&&Number.isSafeInteger(row.count)&&row.count>=0)entries[page]={at:row.at,count:row.count};
   if(page&&Array.isArray(row.ids)&&typeof row.more==='boolean')entries[page]={at:row.at,ids:[...new Set(row.ids.slice(0,PAGE).map(vid).filter(Boolean))],more:row.more};
  }
  out.engines[id]={scope:e.scope,entries};
 }
 return out;
}
function writeCache(root,value){const file=cacheFile(root),tmp=file+'.'+process.pid+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}
function safeOnly(root){try{return JSON.parse(fs.readFileSync(path.join(root,'data','config','native-preferences.json'),'utf8')).safe_cg===true;}catch{return false;}}

/* the seeds as the page needs them: no prints, no settings */
function seedList(seeds){
 const s=seeds||require('../core/profiles/seed.cjs').seeds();
 return (Array.isArray(s?.games)?s.games:[]).map(g=>({slug:String(g.key||''),engine:String(g.engine||''),status:String(g.status||''),vndb:vid(g.prints?.vndb)}));
}
const requests=[];
const resting=(cache,now,key='failedAt')=>cache[key]>0&&now-cache[key]<RETRY;
function noteFailure(root,now,key='failedAt'){const cache=readCache(root);cache[key]=Math.max(cache[key],now);try{writeCache(root,cache);}catch{}}
async function queryVndb(body,{fetch:fetcher=fetch,timeout=TIMEOUT}={}){
 const now=Date.now();
 while(requests.length&&now-requests[0]>=5*60e3)requests.shift();
 if(requests.length>=200)throw Error('VNDB_REQUEST_LIMIT');
 requests.push(now);
 const r=await fetcher(VNDB,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':USER_AGENT},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error('VNDB_HTTP_'+r.status);
 const j=await r.json();if(!Array.isArray(j?.results))throw Error('VNDB_BAD_ANSWER');
 return j;
}
function catalogGame(g,cache){
 const v=g.vndb&&cache.vn[g.vndb]&&!cache.vn[g.vndb].miss?cache.vn[g.vndb]:null;
 return {...g,title:v?.title||'',alttitle:v?.alttitle||'',developers:v?.developers||[],cover:v?.image?(safe(v.image)?'safe':'nsfw'):'none'};
}
async function lookup(ids,{fetch:fetcher=fetch,timeout=TIMEOUT}={}){
 const out={};
 for(let i=0;i<ids.length;i+=PAGE){
  const part=ids.slice(i,i+PAGE),filters=part.length===1?['id','=',part[0]]:['or',...part.map(id=>['id','=',id])];
  const j=await queryVndb({filters,fields:FIELDS,results:PAGE},{fetch:fetcher,timeout});
  for(const x of j.results){const id=vid(x?.id);if(id&&part.includes(id)){const v=cleanVn(x);if(v)out[id]=v;}}
 }
 return out;
}
/* asks VNDB for ids and writes the answers; a failure only notes the time, so the next ten minutes do not wait on VNDB */
const refreshing=new Map();
function refresh(root,ids,{fetch:fetcher,timeout,now}){
 if(refreshing.has(root))return refreshing.get(root);
 const p=(async()=>{
  try{const got=await lookup(ids,{fetch:fetcher,timeout});const cache=readCache(root);for(const id of ids)cache.vn[id]=got[id]?{...got[id],at:now}:{miss:true,at:now};try{writeCache(root,cache);}catch{}return true;}
  catch{noteFailure(root,now);return false;}
 })().finally(()=>refreshing.delete(root));
 refreshing.set(root,p);return p;
}
/* {games:[{slug, engine, status, vndb, title, alttitle, developers, cover:'safe'|'nsfw'|'none'}], offline, safeOnly}.
   Waits on VNDB only when some id has no answer at all; stale answers are refreshed behind the reply (wait:true waits, for tests).
   offline = VNDB could not be asked or did not answer and some names are missing. */
async function catalog(root,{seeds,fetch:fetcher,timeout,now=Date.now(),wait=false}={}){
 const list=seedList(seeds);let cache=readCache(root);
 const ids=[...new Set(list.map(g=>g.vndb).filter(Boolean))];
 const missing=ids.filter(id=>!cache.vn[id]),stale=ids.filter(id=>cache.vn[id]&&!(now-cache.vn[id].at<(cache.vn[id].miss?MISS:FRESH)));
 const paused=resting(cache,now);let offline=false;
 if(missing.length){
  if(paused)offline=true;
  else{offline=!(await refresh(root,[...missing,...stale],{fetch:fetcher,timeout,now}));cache=readCache(root);}
 }else if(stale.length&&!paused){const p=refresh(root,stale,{fetch:fetcher,timeout,now});if(wait){await p;cache=readCache(root);}else p.catch(()=>{});}
 const games=list.map(g=>catalogGame(g,cache));
 return {games,offline,safeOnly:safeOnly(root)};
}
/* Ask /vn to filter by release.engine, so counts and pages are distinct works. A Japanese
   release must match the same engine; a Japanese original may also have ports in other languages. */
function engineFilter(engine,ids){
 const names=engine.vndb.map(n=>['engine','=',n]),inEngine=names.length===1?names[0]:['or',...names];
 const matches=['or',['and',['olang','=','ja'],['release','=',inEngine]],['release','=',['and',inEngine,['lang','=','ja']]]];
 return ids.length?['and',matches,...ids.map(id=>['id','!=',id])]:matches;
}
function seededIds(seeds){return [...new Set(seedList(seeds).map(g=>g.vndb).filter(Boolean))].sort();}
const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
/* the print the bundled engine-count snapshot is keyed on (seed-catalog-engine-map.cjs snapshot.seedIds): a new seed with a VNDB id
   changes it (tools/megulit-adapter.cjs publish writes it) */
const seedIdsPrint=seeds=>fingerprint(seededIds(seeds));
const scopeOf=(id,ids)=>fingerprint([ENGINES[id].vndb,ids]);
const fresh=(entry,now)=>entry&&now-entry.at<FRESH;
const enginePending=new Map();
async function engineQuery(root,id,page,{seeds,fetch:fetcher,timeout,now=Date.now()}){
 const ids=seededIds(seeds),scope=scopeOf(id,ids);
 const cache=readCache(root),old=cache.engines[id],entries=old?.scope===scope?old.entries:{};
 const saved=entries[page],cachedCount=entries[0];
 const prior={entry:saved,cache,count:cachedCount?.count??null};
 if(fresh(saved,now)&&fresh(cachedCount,now))return {...prior,offline:false};
 if(resting(cache,now,'engineFailedAt')||process.env.MEGULIT_OFFLINE==='1')return {...prior,offline:true};
 const key=JSON.stringify([root,id,scope,page]);
 if(enginePending.has(key))return enginePending.get(key);
 const pending=(async()=>{
  try{
   const filters=engineFilter(ENGINES[id],ids),wantCount=!fresh(cachedCount,now);
   const reply=await queryVndb({filters,fields:FIELDS,sort:'id',results:PAGE,page,...(wantCount?{count:true}:{})},{fetch:fetcher,timeout});
   if(typeof reply.more!=='boolean'||wantCount&&!(Number.isSafeInteger(reply.count)&&reply.count>=0))throw Error('VNDB_BAD_ENGINE_ANSWER');
   const current=readCache(root),state=current.engines[id],updated=state?.scope===scope?state.entries:{};
   const entry={at:now,ids:[],more:reply.more},seen=new Set(ids);
   for(const item of reply.results.slice(0,PAGE)){
    const i=vid(item?.id),v=cleanVn(item);
    if(!i||!v||seen.has(i))continue;
    seen.add(i);entry.ids.push(i);current.vn[i]={...v,at:now};
   }
   if(wantCount)updated[0]={at:now,count:reply.count};
   updated[page]=entry;
   current.engines[id]={scope,entries:updated};
   try{writeCache(root,current);}catch{}
   return {entry,cache:current,count:updated[0]?.count??null,offline:false};
  }catch{
   noteFailure(root,now,'engineFailedAt');
   return {...prior,offline:true};
  }
 })().finally(()=>enginePending.delete(key));
 enginePending.set(key,pending);
 return pending;
}
/* Startup uses a public count snapshot plus refreshed counts from pages opened on this install.
   A walk across every release filter can spend VNDB's whole execution-time budget before a click. */
function engineCounts(root,{seeds,now=Date.now()}={}){
 const ids=seededIds(seeds),cache=readCache(root),bundledFresh=fingerprint(ids)===SNAPSHOT.seedIds&&fresh(SNAPSHOT,now);
 const engines=Object.entries(ENGINES).map(([id,{name}])=>{
  const state=cache.engines[id],saved=state?.scope===scopeOf(id,ids)?state.entries[0]:null;
  const count=saved?.count??SNAPSHOT.counts[id]??null;
  return {id,name,count,stale:saved?!fresh(saved,now):!bundledFresh};
 });
 return {engines,offline:resting(cache,now,'engineFailedAt')||process.env.MEGULIT_OFFLINE==='1'};
}
async function enginePage(root,id,page,options={}){
 if(typeof id!=='string'||!Object.hasOwn(ENGINES,id)||!Number.isInteger(page)||page<1||page>MAX_PAGE)return null;
 const {entry,cache,count,offline}=await engineQuery(root,id,page,options);
 const excluded=new Set(seededIds(options.seeds));
 const games=(entry?.ids||[]).filter(vndb=>!excluded.has(vndb)).map(vndb=>catalogGame({vndb,slug:vndb,engine:ENGINES[id].name},cache));
 return {page,games,count,more:entry?.more===true,offline};
}
/* the picture's own first bytes decide what it is; a proxy page or an error body is never saved as a cover */
function imageType(b){
 if(b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'jpg';
 if(b.length>8&&b.readUInt32BE(0)===0x89504e47&&b.readUInt32BE(4)===0x0d0a1a0a)return 'png';
 if(b.length>12&&b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP')return 'webp';
 return '';
}
/* a data: URL of one game's cover, or null. nsfw must be true (and the R18 filter off) for a cover VNDB does not rate safe;
   that check runs before anything is read or fetched, so a cover saved in NSFW mode never shows in normal mode. */
async function cover(root,id0,{nsfw=false,resolveMissing=false,fetch:fetcher=fetch,timeout=TIMEOUT}={}){
 const id=vid(id0);if(!id||id!==String(id0))return null;
 /* only this game's entry is cleaned: a page asks for a hundred covers */
 const entry=()=>{const raw=rawCache(root);return plain(raw)&&plain(raw.vn)&&Object.hasOwn(raw.vn,id)?cleanEntry(id,raw.vn[id]):null;};
 const unknown=(e,now)=>!e||(e.miss&&now-e.at>=MISS);
 let v=entry();
 if(resolveMissing&&process.env.MEGULIT_OFFLINE!=='1'&&unknown(v,Date.now())){
  if(refreshing.has(root)){await refreshing.get(root);v=entry();}
  const now=Date.now();
  if(!resting(readCache(root),now)&&unknown(v,now)){await refresh(root,[id],{fetch:fetcher,timeout,now});v=entry();}
 }
 const img=v&&!v.miss?v.image:null;
 if(!img)return null;
 if(!safe(img)&&(nsfw!==true||safeOnly(root)))return null;
 const store=require('./store.cjs'),base=`seed-${id}-${crypto.createHash('sha256').update(img.url).digest('hex').slice(0,12)}`;
 for(const ext of ['jpg','png','webp']){const have=store.imageData(root,'covers',base+'.'+ext);if(have)return have;}
 try{
  const r=await fetcher(img.url,{headers:{'User-Agent':USER_AGENT},signal:AbortSignal.timeout(timeout)});if(!r.ok)return null;
  const bytes=Buffer.from(await r.arrayBuffer()),ext=imageType(bytes);if(!ext||bytes.length>MAX_COVER)return null;
  fs.mkdirSync(coverDir(root),{recursive:true});fs.writeFileSync(path.join(coverDir(root),base+'.'+ext),bytes);
  return store.imageData(root,'covers',base+'.'+ext)||null;
 }catch{return null;}
}
module.exports={seedIdsPrint,catalog,cover,engineCounts,enginePage,cleanVn,readCache,seedList,safe,imageType,VNDB};
