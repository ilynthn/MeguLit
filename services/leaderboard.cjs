// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E377 opt-in reading leaderboard (client side; the relay is relay/src/worker.js).

   Nothing is sent until the user picks a nickname and agrees on the 排行榜 page. Then:
     - an anonymous install id (random UUID, made here, no account, no hardware ids) is kept in data/config/leaderboard.json;
     - only totals are sent: characters, reading seconds, words saved and the longest run of reading days for this week,
       this month and all time (reading_sessions / vocabulary in services/store.cjs);
     - per-game totals (title, characters, seconds) only when 公开我读过的游戏 is on.
   Settings 联网服务 · 参加排行榜 (data/config/online.json leaderboardEnabled) off → leave(): DELETE on the relay, then the
   local id and consent are forgotten. With no relay configured (services/relay-config.cjs) every call returns
   {state:'not-configured'} and the page shows only the local numbers.

   Wire format (relay/README.md):
     POST   /api/leaderboard {version:1,id,name,keys:{week:'2026-W46',month:'2026-11'},stats:{week,month,all},games?}
            stats.<period> = {characters,seconds,words,streak}     → {ok:true}
     GET    /api/leaderboard?period=week|month|all&metric=characters|seconds|words|streak&key=<period key>&me=<hash>
            → {entries:[{rank,name,value,me}],total,me:{rank,value}|null}
     GET    /api/leaderboard?metric=games[&game=<title>]           → {games:[{title,readers,top}]} / {entries:[...]}
     DELETE /api/leaderboard?id=<install id>                          → {ok:true}
   The relay stores only sha256(id); `me` is that hash so the page can mark the user's own row. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const relay=require('./relay-config.cjs');
const PERIODS=['week','month','all'],METRICS=['characters','seconds','words','streak','reviews','kana'],TIMEOUT=8000,SUBMIT_EVERY=10*60*1000,RESEND_ANYWAY=24*60*60*1000,MAX_GAMES=30;
const stateFile=root=>path.join(root,'data','config','leaderboard.json');
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,1));fs.renameSync(tmp,file);}

/* ---- nickname ------------------------------------------------------------------------------------------------- */
/* Same rules as relay/src/validate.js cleanName (kept in step by validation/leaderboard.test.cjs). */
const BLOCKED=['fuck','shit','bitch','cunt','nigger','nigga','faggot','rape','porn','penis','vagina','asshole','dick','whore','slut','hitler','nazi','傻逼','煞笔','傻b','sb','操你','草你','肏','日你','你妈','尼玛','妈逼','屌','鸡巴','婊子','贱人','强奸','做爱','色情','黄片','习近平','共产党','法轮','台独','死ね','殺す','ちんこ','まんこ','うんこ','セックス','レイプ','きちがい','キチガイ','admin','管理员','官方','megulit','hentai','nsfw','sex','loli','shota','cnm','nmsl','tmd','retard','kys','r18','18禁','成人向','巨乳','爆乳','乳头','裸体','全裸','约炮','卖淫','嫖','淫','骚货','痴汉','中出','av女优','エロ','ロリ','ショタ','おっぱい','パイズリ','中出し','ヘンタイ','変態','废物','垃圾人','去死','脑残','智障','弱智','狗东西','ばか野郎','クソ野郎','消えろ'];
/* control, bidi and zero-width characters */
const hidden=ch=>{const c=ch.codePointAt(0);return c<32||c>=0x7f&&c<=0x9f||c>=0x200b&&c<=0x200f||c>=0x2028&&c<=0x202e||c>=0x2060&&c<=0x206f||c===0xfeff;};
function cleanName(value){
 if(typeof value!=='string')return {ok:false,error:'NAME_REQUIRED'};
 const name=value.normalize('NFKC').replace(/\s+/g,' ').trim();
 if(!name)return {ok:false,error:'NAME_REQUIRED'};
 const chars=[...name];if(chars.length<2||chars.length>16)return {ok:false,error:'NAME_LENGTH'};
 if(chars.some(hidden)||/[<>"'`\\]/.test(name)||/https?:|www\.|\.(?:com|net|org|cn|jp|io)\b|@/i.test(name))return {ok:false,error:'NAME_INVALID'};
 const lower=name.toLowerCase(),flat=lower.replace(/[\s._\-*·・]/g,''),tokens=lower.split(/[^a-z]+/).filter(Boolean);
 /* Latin words: a word that starts with one (so "grape" passes, "fuckyou" does not) or the whole name; others: anywhere. */
 if(BLOCKED.some(word=>/^[a-z]+$/.test(word)?flat===word||tokens.some(t=>t.startsWith(word)):flat.includes(word)))return {ok:false,error:'NAME_BLOCKED'};
 return {ok:true,name};
}

/* ---- local numbers -------------------------------------------------------------------------------------------- */
const dayKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function isoWeek(now){const d=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear(),first=new Date(Date.UTC(year,0,1));return `${year}-W${String(Math.ceil(((d-first)/86400000+1)/7)).padStart(2,'0')}`;}
function periodKeys(now=new Date()){return {week:isoWeek(now),month:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,all:'all'};}
/* Local-time windows in unix seconds: week starts Monday 00:00, month on the 1st. */
function windows(now=new Date()){
 const week=new Date(now);week.setHours(0,0,0,0);week.setDate(week.getDate()-(week.getDay()+6)%7);
 const month=new Date(now.getFullYear(),now.getMonth(),1);const until=Math.floor(now.getTime()/1000)+1;
 return {week:{from:Math.floor(week.getTime()/1000),until},month:{from:Math.floor(month.getTime()/1000),until},all:{from:0,until}};
}
/* Longest run of consecutive local days that have any reading. */
function longestRun(days){let best=0,run=0,prev=null;for(const day of [...days].sort()){const d=new Date(day+'T00:00:00');run=prev&&Math.round((d-prev)/86400000)===1?run+1:1;best=Math.max(best,run);prev=d;}return best;}
/* Days in a row up to today (or up to yesterday when today has no reading yet). */
function currentRun(days,now=new Date()){const set=new Set(days),d=new Date(now);d.setHours(0,0,0,0);if(!set.has(dayKey(d)))d.setDate(d.getDate()-1);let run=0;while(set.has(dayKey(d))){run++;d.setDate(d.getDate()-1);}return run;}
const int=v=>Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.round(Number(v)||0)));
/* E401 learning activity, as unix-second timestamps:
   - reviews: every word review in MeguLit (review_events, which also holds reviews pulled in from Anki notes) plus every
     card answered through the in-app Anki review (anki_review_events). An in-app Anki answer that later comes back
     with an Anki sync (anki_synced_reviews; Anki review ids are epoch milliseconds) is counted once.
   - kana: one per question answered in the kana games (data/kana-progress.json keeps the last 200 runs, so the
     all-time count covers those runs). */
function reviewTimes(db,until){
 const out=[];const safe=fn=>{try{return fn();}catch{return [];}};
 out.push(...safe(()=>db.prepare('SELECT reviewed_at t FROM review_events WHERE reviewed_at<?').all(until)).map(r=>Number(r.t)||0));
 const synced=safe(()=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='anki_synced_reviews'").all()).length>0;
 out.push(...safe(()=>db.prepare(synced?'SELECT a.reviewed_at t FROM anki_review_events a WHERE a.reviewed_at<? AND NOT EXISTS (SELECT 1 FROM anki_synced_reviews s WHERE ABS(s.review_id/1000-a.reviewed_at)<=5)':'SELECT reviewed_at t FROM anki_review_events WHERE reviewed_at<?').all(until)).map(r=>Number(r.t)||0));
 return out;
}
function kanaTimes(root,until){
 if(!root)return [];
 let runs=[];try{runs=require('./kana.cjs').read(root).runs;}catch{return [];}
 const out=[];for(const run of runs){const t=Math.floor(Number(run.id)/1000);if(!(t>0&&t<until))continue;for(let i=0;i<Math.min(run.log.length,500);i++)out.push(t);}
 return out;
}
function collectStats(db,now=new Date(),root=''){
 const w=windows(now),out={keys:periodKeys(now),stats:{},games:[]};
 const sessions=db.prepare('SELECT game_id,started_at,active_seconds,characters FROM reading_sessions WHERE started_at<?').all(w.all.until);
 const words=db.prepare('SELECT created_at FROM vocabulary WHERE created_at<?').all(w.all.until).map(r=>Number(r.created_at)||0);
 const readDay=s=>dayKey(new Date(s.started_at*1000)),reading=s=>s.characters>0||s.active_seconds>0;
 const reviews=reviewTimes(db,w.all.until),kana=kanaTimes(root,w.all.until);
 /* E401 the period numbers count what happened in that week or month ("新收录"); the all-time word total is separate */
 out.totals={words:int(db.prepare('SELECT COUNT(*) n FROM vocabulary').get().n)};
 for(const period of PERIODS){
  const {from,until}=w[period],inside=sessions.filter(s=>s.started_at>=from&&s.started_at<until);
  out.stats[period]={characters:int(inside.reduce((n,s)=>n+(s.characters||0),0)),seconds:int(inside.reduce((n,s)=>n+(s.active_seconds||0),0)),words:words.filter(t=>t>=from&&t<until).length,streak:longestRun(new Set(inside.filter(reading).map(readDay))),reviews:reviews.filter(t=>t>=from&&t<until).length,kana:kana.filter(t=>t>=from&&t<until).length};
 }
 out.currentStreak=currentRun(sessions.filter(reading).map(readDay),now);
 const titles=new Map(db.prepare('SELECT id,title FROM games WHERE removed_at IS NULL AND hidden_at IS NULL').all().map(g=>[g.id,String(g.title||'').trim()]));
 const perGame=new Map();for(const s of sessions){const title=titles.get(s.game_id);if(!title)continue;const g=perGame.get(title)||{title,characters:0,seconds:0,last:0};g.characters+=s.characters||0;g.seconds+=s.active_seconds||0;g.last=Math.max(g.last,int(s.started_at));perGame.set(title,g);}
 out.games=[...perGame.values()].filter(g=>g.characters>0).sort((a,b)=>b.characters-a.characters).slice(0,MAX_GAMES).map(g=>({title:g.title.slice(0,120),characters:int(g.characters),seconds:int(g.seconds),last:int(g.last)}));
 out.hot=collectLookups(db,now);
 return out;
}

/* ---- E379 this week's lookups for the hot-word awards (term + count only; no sentence, game or time) -------------- */
/* Hot-word weeks run Monday 00:00 to Monday 00:00 in UTC+8, the same on every PC; relay/src/validate.js hotWeekKey. */
function hotWeekKey(now=new Date()){const d=new Date(now.getTime()+8*3600000);const u=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const day=u.getUTCDay()||7;u.setUTCDate(u.getUTCDate()+4-day);const year=u.getUTCFullYear(),first=new Date(Date.UTC(year,0,1));return `${year}-W${String(Math.ceil(((u-first)/86400000+1)/7)).padStart(2,'0')}`;}
function hotWeekStart(now=new Date()){const d=new Date(now.getTime()+8*3600000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return Math.floor((d.getTime()-8*3600000)/1000);}
const HOT_TERMS=100;
const japanese=ch=>{const c=ch.codePointAt(0);return c>=0x3040&&c<=0x30ff||c>=0x3400&&c<=0x9fff||c>=0xff66&&c<=0xff9f;};
/* same rule as relay/src/validate.js cleanTerm */
function cleanTerm(value){
 if(typeof value!=='string')return '';const term=value.normalize('NFKC').replace(/\s+/g,' ').trim(),chars=[...term];
 if(!chars.length||chars.length>40||chars.some(hidden)||!chars.some(japanese)||/https?:|www\.|[<>@\\`]/i.test(term))return '';
 return term;
}
function collectLookups(db,now=new Date()){
 const from=hotWeekStart(now),rows=db.prepare('SELECT surface,COUNT(*) n FROM lookup_events WHERE occurred_at>=? AND occurred_at<=? GROUP BY surface ORDER BY n DESC LIMIT 300').all(from,Math.floor(now.getTime()/1000));
 const counts=new Map();for(const r of rows){const term=cleanTerm(r.surface);if(term)counts.set(term,(counts.get(term)||0)+r.n);}
 return {week:hotWeekKey(now),terms:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,HOT_TERMS).map(([term,count])=>({term,count:Math.min(1000,count)}))};
}

/* ---- opt-in state --------------------------------------------------------------------------------------------- */
function online(root){const v=relay.readJSON(relay.onlineFile(root));return {enabled:v.leaderboardEnabled===true,name:typeof v.leaderboardName==='string'?v.leaderboardName:'',shareGames:v.leaderboardShareGames===true};}
function saveOnline(root,patch){const file=relay.onlineFile(root);atomic(file,{...relay.readJSON(file),...patch});}
function state(root){const s=relay.readJSON(stateFile(root));return {installId:/^[0-9a-f-]{36}$/.test(String(s.installId||''))?s.installId:'',consentAt:typeof s.consentAt==='string'?s.consentAt:'',lastSubmitAt:Number(s.lastSubmitAt)||0,lastSubmitHash:typeof s.lastSubmitHash==='string'?s.lastSubmitHash:''};}
const publicHash=id=>id?crypto.createHash('sha256').update(String(id)).digest('hex'):'';
/* E379 a logged-in MeguLit account (services/account.cjs) is the leaderboard identity, so two PCs are one row; the
   nickname stays the leaderboard nickname (accounts carry no display name). Without an account: the install id. */
function identity(root,options={}){
 if(options.account!==undefined)return options.account;
 try{const account=require('./account.cjs');const st=account.status(root);if(!st.loggedIn||!st.accountId)return null;
  return {accountId:st.accountId,token:()=>account.token(root),save:token=>new account.Account(root).setToken(token)};}catch{return null;}
}
/* Taking part = switch on + consent given + a nickname that passes the filter. */
function config(root,env=process.env,options={}){const o=online(root),s=state(root),base=relay.relayBase(root,env),who=identity(root,options);return {...o,...s,base,configured:!!base,joined:o.enabled&&!!s.consentAt&&!!s.installId&&cleanName(o.name).ok,account:!!who,me:who?publicHash('account:'+who.accountId):publicHash(s.installId)};}
/* E385 the app joins only with a signed-in account (requireAccount); older anonymous entries keep working */
function join(root,{name,shareGames=false,consent,requireAccount=false}={},options={}){
 if(requireAccount&&!identity(root,options))throw Error('LEADERBOARD_ACCOUNT_REQUIRED');
 if(consent!==true)throw Error('LEADERBOARD_CONSENT_REQUIRED');
 const checked=cleanName(name);if(!checked.ok)throw Error('LEADERBOARD_'+checked.error);
 const s=state(root);atomic(stateFile(root),{...relay.readJSON(stateFile(root)),installId:s.installId||crypto.randomUUID(),consentAt:new Date().toISOString(),lastSubmitAt:0,lastSubmitHash:''});
 saveOnline(root,{leaderboardEnabled:true,leaderboardName:checked.name,leaderboardShareGames:shareGames===true});
 return config(root);
}

/* ---- network -------------------------------------------------------------------------------------------------- */
async function call(url,init,fetcher,who=null,raw=false){
 const headers={'user-agent':'MeguLit',...(init.body&&!init.type?{'content-type':'application/json'}:{}),...(init.type?{'content-type':init.type}:{})};
 if(who){let token='';try{token=who.token();}catch{}if(token)headers.authorization='Bearer '+token;}
 /* 2026-11-13 (每周热词 · 短句 said 连不上 while the rest worked): the Cloudflare host rate-limits a whole IP (error 1015,
    HTTP 429) after a burst of page prefetches. A GET to one of the two built-in relay hosts that is refused that way, or
    does not answer, is tried once on the other host (same Worker and database, see relay-config.cjs). */
 const twin=init.method==='GET'?(()=>{const hosts=[relay.DEFAULT_RELAY_BASE,relay.CN_RELAY_BASE],i=hosts.findIndex(h=>url.startsWith(h+'/'));return i<0?'':hosts[1-i]+url.slice(hosts[i].length);})():'';
 let r;try{r=await fetcher(url,{method:init.method,body:init.body,headers,signal:AbortSignal.timeout(TIMEOUT)});}
 catch(e){if(twin&&!init.twin)return call(twin,{...init,twin:true},fetcher,who,raw);return {state:'error',error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
 if(r.status===429&&twin&&!init.twin)return call(twin,{...init,twin:true},fetcher,who,raw);
 /* the relay rotates account tokens at most daily; keep the new one or the account would log out a day later */
 const rotated=r.headers?.get?.('x-megulit-token');if(who&&rotated&&/^mgl_[A-Za-z0-9_-]{43}$/.test(rotated))try{who.save(rotated);}catch{}
 if(raw&&r.ok){try{return {state:'ok',bytes:Buffer.from(await r.arrayBuffer())};}catch{return {state:'error',error:'BAD_RESPONSE'};}}
 let data=null;try{data=await r.json();}catch{}
 if(!r.ok){const out={state:'error',error:typeof data?.error==='string'&&/^[A-Z_]{2,40}$/.test(data.error)?data.error:'HTTP_'+r.status};if(r.status===429)out.retryAfter=require('./relay-gate.cjs').retryAfterSeconds(r);return out;}
 return {state:'ok',data:data||{}};
}
/* submit(stats) — stats as collectStats() returns it; this week's lookup counts ride along (term + count only). */
async function submit(stats,options={}){
 const root=options.root,c=config(root,options.env,options);
 if(!c.joined)return {state:'disabled'};if(!c.configured)return {state:'not-configured'};
 const body={version:1,id:c.installId,name:cleanName(c.name).name,keys:{week:stats?.keys?.week,month:stats?.keys?.month},stats:{}};
 for(const period of PERIODS){const p=stats?.stats?.[period]||{};body.stats[period]=Object.fromEntries(METRICS.map(m=>[m,int(p[m])]));}
 /* 2026-11-12 转职: the element and the level ride along so the board can show them */
 if(root){const rc=require('./reader-class.cjs'),cls=rc.read(root);if(cls.element)body.element=cls.element;body.level=rc.readerLevel(body.stats.all,cls.element).level;}
 if(c.shareGames&&Array.isArray(stats?.games))body.games=stats.games.slice(0,MAX_GAMES).map(g=>({title:String(g.title||'').slice(0,120),characters:int(g.characters),seconds:int(g.seconds),last:Math.min(int(g.last),Math.floor((options.now||new Date()).getTime()/1000))})).filter(g=>g.title);
 if(stats?.hot?.week)body.hot={week:stats.hot.week,terms:(stats.hot.terms||[]).slice(0,HOT_TERMS).map(t=>({term:t.term,count:Math.min(1000,int(t.count))})).filter(t=>t.count>0)};
 /* 2026-11-13 the board page re-submits every 10 minutes whether or not anything moved, and each submit costs the
    relay D1 rows (the row itself plus its rate-limit buckets). An identical body is simply not sent. */
 const payload=JSON.stringify(body),fingerprint=crypto.createHash('sha256').update(payload).digest('hex');
 const fresh=(options.now||new Date()).getTime()-c.lastSubmitAt<RESEND_ANYWAY;
 /* ...but it is re-sent once a day even unchanged, so a row the relay lost (or a profile deleted there) comes back. */
 if(!options.force&&fresh&&root&&c.lastSubmitHash===fingerprint)return {state:'ok',skipped:true};  /* lastSubmitAt stays at the last real submit, so the daily resend still comes due */
 const res=await call(c.base+'/api/leaderboard',{method:'POST',body:payload},options.fetch||fetch,identity(root,options));
 if(res.state==='ok'&&root)atomic(stateFile(root),{...relay.readJSON(stateFile(root)),lastSubmitAt:(options.now||new Date()).getTime(),lastSubmitHash:fingerprint});
 return res.state==='ok'?{state:'ok'}:res;
}
const AVATAR_ID=/^[0-9a-f]{32}$/;
/* fetch(period, metric) — named fetchBoard inside so the global fetch stays reachable. */
async function fetchBoard(period,metric,options={}){
 const c=config(options.root,options.env,options);if(!c.configured)return {state:'not-configured'};
 const isGames=metric==='games';if(!isGames&&(!PERIODS.includes(period)||!METRICS.includes(metric)))throw Error('LEADERBOARD_INVALID_QUERY');
 const q=new URLSearchParams(isGames?{metric}:{period,metric});if(!isGames&&period!=='all')q.set('key',periodKeys(options.now)[period]);
 if(isGames&&options.game)q.set('game',String(options.game).slice(0,120));if(c.me)q.set('me',c.me);
 const res=await call(c.base+'/api/leaderboard?'+q,{method:'GET'},options.fetch||fetch);if(res.state!=='ok')return res;
 const clean=e=>({rank:int(e?.rank),name:String(e?.name||'').slice(0,32),value:int(e?.value),me:e?.me===true,avatar:AVATAR_ID.test(String(e?.avatar||''))?e.avatar:null,pid:/^[0-9a-f]{16}$/.test(String(e?.pid||''))?e.pid:null,element:require('./reader-class.cjs').ELEMENTS.includes(e?.element)?e.element:'',level:Math.min(10000,int(e?.level))});
 if(isGames&&!options.game)return {state:'ok',games:(Array.isArray(res.data.games)?res.data.games:[]).slice(0,100).map(g=>({title:String(g?.title||'').slice(0,120),readers:int(g?.readers),top:g?.top?clean(g.top):null}))};
 const f=res.data.feature,feature=f&&String(f.title||'').trim()?{title:String(f.title).slice(0,120),value:int(f.value),readers:int(f.readers)}:null;
 return {state:'ok',entries:(Array.isArray(res.data.entries)?res.data.entries:[]).slice(0,100).map(clean),total:int(res.data.total),me:res.data.me?{rank:int(res.data.me.rank),value:int(res.data.me.value)}:null,feature};
}
/* E420 a cover for the most-read work: the user's own library cover when they have the game, otherwise the VNDB
   cover (only images VNDB rates safe), saved once under data/assets/covers and remembered per title (misses too). */
async function featureCover(root,db,title,options={}){
 const store=require('./store.cjs'),key=String(title||'').trim().toLowerCase();if(!key)return null;
 try{const row=db.prepare("SELECT cover FROM games WHERE removed_at IS NULL AND lower(trim(title))=? AND cover!='' LIMIT 1").get(key);if(row?.cover){const img=store.imageData(root,'covers',row.cover);if(img)return img;}}catch{}
 const cacheFile=path.join(root,'data','config','leaderboard-covers.json'),cache=relay.readJSON(cacheFile);
 if(Object.prototype.hasOwnProperty.call(cache,key))return cache[key]?store.imageData(root,'covers',cache[key]):null;
 let file='';
 try{const fetcher=options.fetch||fetch;
  const r=await fetcher('https://api.vndb.org/kana/vn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['search','=',title],fields:'image.url,image.sexual,image.violence',results:1,sort:'searchrank'}),signal:AbortSignal.timeout(TIMEOUT)});
  const img=r.ok?(await r.json()).results?.[0]?.image:null;
  if(img?.url&&/^https:\/\/[a-z0-9.-]*vndb\.org\//.test(img.url)&&Number(img.sexual)<1&&Number(img.violence)<1){
   const b=await fetcher(img.url,{signal:AbortSignal.timeout(TIMEOUT)});const bytes=b.ok?Buffer.from(await b.arrayBuffer()):null;
   if(bytes&&bytes.length>100&&bytes.length<4*1024*1024){const ext=/\.png$/i.test(img.url)?'png':/\.webp$/i.test(img.url)?'webp':'jpg';file='lb-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,16)+'.'+ext;
    const folder=path.join(root,'data','assets','covers');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,file),bytes);}}
 }catch{return null;}
 cache[key]=file;try{atomic(cacheFile,cache);}catch{}
 return file?store.imageData(root,'covers',file):null;
}
/* Turning the switch off: delete the server entry (when reachable), then forget id and consent either way. */
async function leave(root,options={}){
 const c=config(root,options.env,options);let remote='skipped';
 if(c.installId&&c.configured){const res=await call(c.base+'/api/leaderboard?id='+encodeURIComponent(c.installId),{method:'DELETE'},options.fetch||fetch,identity(root,options));remote=res.state==='ok'?'deleted':res.error;}
 else if(!c.configured)remote='not-configured';
 const s=relay.readJSON(stateFile(root));delete s.installId;delete s.consentAt;delete s.lastSubmitAt;delete s.lastSubmitHash;delete s.avatar;atomic(stateFile(root),s);
 saveOnline(root,{leaderboardEnabled:false});
 return {state:'left',remote};
}

/* ---- E379 avatars --------------------------------------------------------------------------------------------- */
/* The page crops to a square and encodes a WebP of at most 256 px; this side only checks it is a small WebP. */
function avatarBytes(data){
 const b64=String(data||'').replace(/^data:image\/webp;base64,/,'');if(!/^[A-Za-z0-9+/=]+$/.test(b64)||b64.length>90000)throw Error('LEADERBOARD_AVATAR_INVALID');
 const bytes=Buffer.from(b64,'base64');if(bytes.length<30||bytes.length>64*1024||bytes.toString('latin1',0,4)!=='RIFF'||bytes.toString('latin1',8,12)!=='WEBP')throw Error('LEADERBOARD_AVATAR_INVALID');
 return bytes;
}
async function avatarCall(root,method,options={},body){
 const c=config(root,options.env,options);if(!c.configured)return {state:'not-configured'};if(!c.joined)return {state:'disabled'};
 return call(c.base+'/api/leaderboard/avatar?id='+encodeURIComponent(c.installId),{method,body,type:body?'image/webp':''},options.fetch||fetch,identity(root,options));
}
/* → {state:'ok',status:'approved'|'rejected',reason} */
async function setAvatar(root,data,options={}){
 const res=await avatarCall(root,'POST',options,avatarBytes(data));if(res.state!=='ok')return res;
 const status=res.data.status==='approved'?'approved':'rejected';
 atomic(stateFile(root),{...relay.readJSON(stateFile(root)),avatar:{status,reason:String(res.data.reason||'').slice(0,40),id:status==='approved'&&AVATAR_ID.test(String(res.data.avatar||''))?res.data.avatar:''}});
 return {state:'ok',status,reason:String(res.data.reason||'').slice(0,40)};
}
async function removeAvatar(root,options={}){const res=await avatarCall(root,'DELETE',options);if(res.state==='ok'){const s=relay.readJSON(stateFile(root));delete s.avatar;atomic(stateFile(root),s);}return res.state==='ok'?{state:'ok'}:res;}
async function avatarStatus(root,options={}){
 const res=await avatarCall(root,'GET',options);if(res.state!=='ok')return {...res,status:relay.readJSON(stateFile(root)).avatar?.status||'none'};
 const status=['approved','rejected','pending','hidden','none'].includes(res.data.status)?res.data.status:'none';
 const avatar=AVATAR_ID.test(String(res.data.avatar||''))?res.data.avatar:null;
 const issueUrl=/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(String(res.data.issueUrl||''))?res.data.issueUrl:'';
 return {state:'ok',status,reason:String(res.data.reason||'').slice(0,40),avatar,appealed:res.data.appealed===true,issueUrl,image:avatar?(await avatarImages(root,[avatar],options))[avatar]||'':''};
}
/* E379 the owner thinks a rejection is wrong: the relay opens a GitHub issue for a human review (one per picture). */
async function appealAvatar(root,options={}){
 const c=config(root,options.env,options);if(!c.configured)return {state:'not-configured'};if(!c.joined)return {state:'disabled'};
 let version='';try{version=String(require('../package.json').version||'');}catch{}
 const res=await call(c.base+'/api/leaderboard/avatar/appeal?id='+encodeURIComponent(c.installId),{method:'POST',body:JSON.stringify({version:options.version||version})},options.fetch||fetch,identity(root,options));
 if(res.state!=='ok')return res;
 const issueUrl=/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(String(res.data.issueUrl||''))?res.data.issueUrl:'';
 return {state:'ok',issueUrl};
}
async function report(root,avatarId,options={}){
 if(!AVATAR_ID.test(String(avatarId||'')))throw Error('LEADERBOARD_INVALID_QUERY');
 const c=config(root,options.env,options);if(!c.configured)return {state:'not-configured'};
 const res=await call(c.base+'/api/avatar/'+avatarId+'/report'+(c.installId?'?id='+encodeURIComponent(c.installId):''),{method:'POST'},options.fetch||fetch,identity(root,options));
 return res.state==='ok'?{state:'ok',hidden:res.data.hidden===true}:res;
}
/* Avatar pictures as data URLs (the page's CSP allows no remote images). Ids are immutable, so they are cached on
   disk; at most AVATAR_CACHE files are kept. */
const AVATAR_CACHE=400;
async function avatarImages(root,ids,options={}){
 const c=config(root,options.env,options),out={},folder=path.join(root,'data','cache','avatars');if(!c.configured)return out;
 const wanted=[...new Set(ids.filter(id=>AVATAR_ID.test(String(id||''))))].slice(0,60),missing=[];
 for(const id of wanted){const file=path.join(folder,id+'.webp');try{out[id]='data:image/webp;base64,'+fs.readFileSync(file).toString('base64');}catch{missing.push(id);}}
 const fetcher=options.fetch||fetch;
 for(let i=0;i<missing.length;i+=8)await Promise.all(missing.slice(i,i+8).map(async id=>{const res=await call(c.base+'/api/avatar/'+id,{method:'GET'},fetcher,null,true);
  if(res.state!=='ok'||res.bytes.length>64*1024||res.bytes.toString('latin1',8,12)!=='WEBP')return;out[id]='data:image/webp;base64,'+res.bytes.toString('base64');
  try{fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,id+'.webp'),res.bytes);}catch{}}));
 if(missing.length)try{const files=fs.readdirSync(folder).map(name=>({name,t:fs.statSync(path.join(folder,name)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const f of files.slice(AVATAR_CACHE))fs.rmSync(path.join(folder,f.name),{force:true});}catch{}
 return out;
}

/* ---- E379 weekly hot words ------------------------------------------------------------------------------------ */
const CATEGORIES=['word','phrase','sentence'];
async function hotWords(root,{week='',category='word'}={},options={}){
 const c=config(root,options.env,options);if(!c.configured)return {state:'not-configured'};
 if(!CATEGORIES.includes(category)||week&&!/^\d{4}-W\d{2}$/.test(week))throw Error('LEADERBOARD_INVALID_QUERY');
 const q=new URLSearchParams({category});if(week)q.set('week',week);
 const res=await call(c.base+'/api/hotwords?'+q,{method:'GET'},options.fetch||fetch);if(res.state!=='ok')return res;
 const d=res.data,weeks=(Array.isArray(d.weeks)?d.weeks:[]).filter(w=>/^\d{4}-W\d{2}$/.test(String(w))).slice(0,26);
 const awards=(Array.isArray(d.awards)?d.awards:[]).slice(0,50).map(a=>({rank:int(a?.rank),term:String(a?.term||'').slice(0,40),users:int(a?.users),lookups:int(a?.lookups),reason:String(a?.reason||'').slice(0,120),ai:a?.ai===true})).filter(a=>a.term&&a.rank>=1);
 return {state:'ok',week:/^\d{4}-W\d{2}$/.test(String(d.week||''))?d.week:null,weeks,settled:d.settled===true,participants:int(d.participants),category,awards};
}

/* Everything the 排行榜 page needs in one call; refreshes the user's own entry at most every 10 minutes. */
async function view(root,db,request={},options={}){
 const now=options.now||new Date(),period=PERIODS.includes(request.period)?request.period:'week',metric=[...METRICS,'games'].includes(request.metric)?request.metric:'seconds';
 const local=collectStats(db,now,root),c=config(root,options.env,options),tab=request.tab==='hot'?'hot':'board';
 const result={configured:c.configured,joined:c.joined,enabled:c.enabled,name:c.name,shareGames:c.shareGames,account:c.account,tab,period,metric,local,board:null,hot:null,avatars:{}};
 /* E404 your own approved picture, for the 我的主页 chip on every tab */
 const selfAvatar=AVATAR_ID.test(String(relay.readJSON(stateFile(root)).avatar?.id||''))?relay.readJSON(stateFile(root)).avatar.id:null;result.self={avatar:selfAvatar};
 if(selfAvatar&&c.configured)result.avatars=await avatarImages(root,[selfAvatar],options);
 if(!c.configured)return {...result,board:{state:'not-configured'}};
 if(c.joined&&(request.submit===true||now.getTime()-c.lastSubmitAt>SUBMIT_EVERY))result.submit=await submit(local,{...options,root,now,force:request.submit===true});
 /* E397 关注 tab: following and 同好 */
 if(request.tab==='follow'){result.tab='follow';result.social=await social(root,options);return result;}
 if(tab==='hot'){result.hot=await hotWords(root,{week:request.week||'',category:CATEGORIES.includes(request.category)?request.category:'word'},options);return result;}
 result.board=await fetchBoard(period,metric,{...options,root,now,game:request.game});
 if(result.board.state==='ok'&&result.board.feature)result.board.feature.cover=await featureCover(root,db,result.board.feature.title,options);
 /* E420 新收录单词: the week's top hot word, shown as a word you can look up */
 if(result.board.state==='ok'&&metric==='words'){try{const h=await hotWords(root,{category:'word'},options);const top=h.state==='ok'?h.awards.find(a=>a.rank===1):null;if(top)result.board.word={term:top.term,users:top.users};}catch{}}
 if(result.board.state==='ok'){const ids=[...(result.board.entries||[]),...(result.board.games||[]).map(g=>g.top).filter(Boolean)].map(e=>e.avatar);result.avatars={...result.avatars,...await avatarImages(root,ids,options)};}
 return result;
}

/* ---- E397 public profiles, follows, 同好, profile reports (relay/src/social.js) -------------------------------- */
const PID=/^[0-9a-f]{16}$/,VNDB=/^v[1-9]\d{0,6}$/,REPORT_KINDS=['discrimination','nudity','racism','harassment','spam','other'],NAME_ONLY=['admin','管理员','官方','megulit'];
/* Signature rules — keep in step with relay/src/validate.js cleanBio (validation/social-client.test.cjs checks both). */
function cleanBio(value){
 if(value===undefined||value===null)return {ok:true,bio:''};if(typeof value!=='string')return {ok:false,error:'BIO_INVALID'};
 /* E400 kept as typed (NFC): NFKC would turn kaomoji like ( ´∀｀) into a backtick and combining marks. Checks run on an
    NFKC copy so full-width links and words are still caught. Only links, e-mail addresses, control or invisible
    characters (the emoji joiner U+200D is fine) and blocked words are refused. */
 const bio=value.normalize('NFC').replace(/\s+/g,' ').trim();if(!bio)return {ok:true,bio:''};
 if([...bio].length>60)return {ok:false,error:'BIO_LENGTH'};
 const folded=bio.normalize('NFKC');
 if([...bio].some(ch=>ch!=='\u200d'&&hidden(ch))||/https?:|www\.|\.(?:com|net|org|cn|jp|io)\b|[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(folded))return {ok:false,error:'BIO_INVALID'};
 const lower=folded.toLowerCase(),flat=lower.replace(/[\s._\-*·・]/g,''),tokens=lower.split(/[^a-z]+/).filter(Boolean);
 if(BLOCKED.some(word=>!NAME_ONLY.includes(word)&&(/^[a-z]+$/.test(word)?tokens.some(t=>t.startsWith(word)):flat.includes(word))))return {ok:false,error:'BIO_BLOCKED'};
 return {ok:true,bio};
}
const str=(v,n)=>String(v??'').slice(0,n);
const cleanFavorites=list=>(Array.isArray(list)?list:[]).slice(0,5).map(g=>({title:str(g?.title,120),vndb:VNDB.test(String(g?.vndb||''))?g.vndb:''})).filter(g=>g.title);
const cleanRecent=list=>(Array.isArray(list)?list:[]).slice(0,5).map(g=>({title:str(g?.title,120),last:int(g?.last)})).filter(g=>g.title);
const avatarId=v=>AVATAR_ID.test(String(v||''))?v:null;
async function socialCall(root,method,route,body,options={},needLogin=true){
 const c=config(root,options.env,options);if(!c.configured)return {state:'not-configured'};
 const who=identity(root,options);if(needLogin&&!who)return {state:'login'};
 return call(c.base+route,{method,body:body===undefined?undefined:JSON.stringify(body)},options.fetch||fetch,who);
}
/* your own profile as the relay has it ({joined,pid,public,hidden,bio,favorites}) */
async function profileGet(root,options={}){
 const res=await socialCall(root,'GET','/api/profile',undefined,options);if(res.state!=='ok')return res;const d=res.data;
 return {state:'ok',joined:d.joined===true,pid:PID.test(String(d.pid||''))?d.pid:null,public:d.public===true,hidden:d.hidden===true,appealed:d.appealed===true,bio:str(d.bio,60),favorites:cleanFavorites(d.favorites)};
}
async function profileSave(root,{bio,favorites,public:open}={},options={}){
 const checked=cleanBio(bio);if(!checked.ok)throw Error('LEADERBOARD_'+checked.error);
 const res=await socialCall(root,'PUT','/api/profile',{bio:checked.bio,favorites:cleanFavorites(favorites),public:open===true},options);
 if(res.state==='error'&&/^(BIO_|INVALID_FAVORITES|NOT_JOINED)/.test(res.error))throw Error('LEADERBOARD_'+res.error);
 return res.state==='ok'?profileGet(root,options):res;
}
/* someone's card; a private or unknown pid answers {state:'private'} */
async function profileCard(root,pid,options={}){
 if(!PID.test(String(pid||'')))return {state:'private'};
 const res=await socialCall(root,'GET','/api/profile/'+pid,undefined,options,false);
 if(res.state==='error'&&res.error==='NOT_FOUND')return {state:'private'};if(res.state!=='ok')return res;const d=res.data;
 const card={state:'ok',pid,name:str(d.name,32),avatar:avatarId(d.avatar),bio:str(d.bio,60),favorites:cleanFavorites(d.favorites),recent:cleanRecent(d.recent),followers:int(d.followers),following:d.following===true,me:d.me===true,canFollow:!!identity(root,options)};
 card.avatars=await avatarImages(root,[card.avatar],options);return card;
}
async function followSet(root,pid,on,options={}){
 if(!PID.test(String(pid||'')))return {state:'error',error:'NOT_FOUND'};
 const res=await socialCall(root,on?'POST':'DELETE','/api/follow/'+pid,undefined,options);return res.state==='ok'?{state:'ok',following:res.data.following===true}:res;
}
async function reportProfile(root,pid,{kind,reason}={},options={}){
 if(!PID.test(String(pid||'')))return {state:'error',error:'NOT_FOUND'};if(!REPORT_KINDS.includes(kind))throw Error('LEADERBOARD_INVALID_KIND');
 const res=await socialCall(root,'POST',`/api/profile/${pid}/report`,{kind,reason:str(reason,500)},options);return res.state==='ok'?{state:'ok',hidden:true}:res;
}
/* E398 異議あり！ — the owner of a hidden profile objects once per hiding */
async function appealProfile(root,{reason}={},options={}){
 const res=await socialCall(root,'POST','/api/profile/appeal',{reason:str(reason,500)},options);return res.state==='ok'?{state:'ok',appealed:true}:res;
}
/* the 关注 tab: who you follow (newest reading first) and up to 20 同好 */
async function social(root,options={}){
 const [following,kindred]=await Promise.all([socialCall(root,'GET','/api/following',undefined,options),socialCall(root,'GET','/api/kindred',undefined,options)]);
 if(following.state!=='ok')return following;
 const people=(Array.isArray(following.data.following)?following.data.following:[]).slice(0,500).map(p=>({pid:PID.test(String(p?.pid||''))?p.pid:null,name:str(p?.name,32),public:p?.public===true,avatar:avatarId(p?.avatar),recent:cleanRecent(p?.recent).slice(0,3)}));
 const kin=kindred.state==='ok'&&Array.isArray(kindred.data.kindred)?kindred.data.kindred.slice(0,20).map(p=>({pid:PID.test(String(p?.pid||''))?p.pid:null,name:str(p?.name,32),avatar:avatarId(p?.avatar),shared:(Array.isArray(p?.shared)?p.shared:[]).slice(0,10).map(t=>str(t,120)),count:int(p?.count),following:p?.following===true})).filter(p=>p.pid):[];
 return {state:'ok',following:people,kindred:kin,avatars:await avatarImages(root,[...people,...kin].map(p=>p.avatar),options)};
}
/* titles in your library for the favourites picker (most recently read first) */
function libraryTitles(db){
 const rows=db.prepare('SELECT g.title,MAX(s.started_at) last FROM games g LEFT JOIN reading_sessions s ON s.game_id=g.id WHERE g.removed_at IS NULL AND g.hidden_at IS NULL GROUP BY g.id ORDER BY last IS NULL,last DESC,g.title').all();
 const seen=new Set();return rows.map(r=>String(r.title||'').trim().slice(0,120)).filter(t=>t&&!seen.has(t)&&seen.add(t)).slice(0,500);
}
/* forum pictures (forum.cjs) send raw WebP bytes */
module.exports={relayCall:(...a)=>call(...a),socialCall,appealProfile,cleanBio,profileGet,profileSave,profileCard,followSet,reportProfile,social,libraryTitles,REPORT_KINDS,PERIODS,METRICS,CATEGORIES,BLOCKED,cleanName,cleanTerm,collectStats,collectLookups,hotWeekKey,periodKeys,windows,longestRun,currentRun,config,join,leave,submit,fetch:fetchBoard,view,publicHash,stateFile,identity,setAvatar,removeAvatar,avatarStatus,appealAvatar,avatarImages,report,hotWords};
