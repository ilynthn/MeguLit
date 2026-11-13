// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 MeguLit relay — one Cloudflare Worker (D1 + R2) for diagnostics upload, shared adaptation records and the
   opt-in leaderboard. Deploy steps: relay/README.md. Bindings: DB (D1), BUCKET (R2). Secrets: GITHUB_TOKEN,
   LINK_SECRET (HMAC key for download links), optional HASH_SALT and DIAG_TOKEN. Vars: GITHUB_REPO, LINK_DAYS,
   ALLOWED_ORIGINS. Nothing here trusts the client: every body is size-capped and validated (validate.js). */
import {LIMITS,validateLeaderboard,validateBoardQuery,validateAdaptationRecord,validateKeys,validateMeta,issueBody,validateHot,INSTALL_ID,HEX64} from './validate.js';
/* E379 accounts (relay/ACCOUNTS.md) and community features (avatars, hot words) */
import {handleAccounts,isAccountsPath,authenticate,ROTATED} from './accounts.js';
/* website game-request and feedback forms → GitHub issues */
import {feedbackPost,syncPendingFeedback} from './feedback.js';
/* E397 public profiles, follows, 同好 */
import {profileOwn,profileCard,followEdit,followingFeed,kindred,socialDeletes,profileReport,profileAppeal} from './social.js';
import {avatarUpload,avatarDelete,avatarGet,avatarReport,avatarsFor,avatarStatus,avatarAppeal,avatarReview,signReview,cleanupAvatars,hotStatements,hotWordsGet,settleDue} from './community.js';
/* #117 交流 board */
import {forumRoute,forumDeletes,cleanupForumImages} from './forum.js';
import {newsGet,hotWordsDailyGet,refreshDaily,imageGet,articleGet} from './daily.js';
/* E562 adapter packs, before/after reports, desensitized probe uploads */
import {adaptersRoute} from './adapters.js';

/* requests per window; key prefix → [limit, seconds] */
/* 2026-11-13 (user: 限制太大了; api.megulit.com answered 429 to a whole IP for over a minute): reads are loosened, writes,
   codes and logins stay strict. The overall limit counts a signed-in request by its token ('user'), so a family, an
   internet café or a school behind one IP no longer share 120 a minute; 'ip-shared' still caps one IP as a whole.
   Old: ip 120/60 s, lb-get 60, adapt-get 120/h, avatar-get 600, hot 60, daily 60, daily-img 240, release 30,
   social-get 120, forum-get 120. */
export const RATE={ip:[600,60],user:[600,60],'ip-shared':[3000,60],'adapt-feed':[60,3600],'adapt-pack':[1200,3600],'adapt-report':[30,3600],probe:[64,3600],feedback:[4,3600],'feedback-day':[12,86400],'lb-post':[6,600],'lb-id':[20,3600],'lb-get':[300,60],'adapt-post':[30,3600],'adapt-get':[600,3600],diag:[20,3600],'diag-dl':[30,3600],avatar:[5,3600],'avatar-get':[1200,60],report:[20,3600],hot:[300,60],daily:[300,60],'daily-img':[900,60],release:[120,60],appeal:[3,86400],profile:[30,3600],'social-get':[600,60],follow:[60,3600],'profile-report':[3,86400],'profile-appeal':[3,86400],'forum-get':[600,60],'forum-post':[5,3600],'forum-reply':[30,3600],'forum-day':[60,86400],'forum-ip':[40,3600],'forum-img':[60,3600]};
const encoder=new TextEncoder();
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function sha256(value){return hex(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value));}
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
function sameText(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}

/* ---- responses / CORS ------------------------------------------------------------------------------------------ */
/* The desktop app calls from its Node service, which sends no Origin, so no CORS is needed for it. A browser origin is
   allowed only when listed in ALLOWED_ORIGINS (comma separated, e.g. a future web view). */
function corsHeaders(request,env){
 const origin=request.headers.get('origin');if(!origin)return {};
 const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 return allowed.includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,PUT,DELETE','access-control-allow-headers':'content-type,authorization','access-control-max-age':'86400',vary:'origin'}:{};
}
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});}
const fail=(error,status=400,extra)=>json({ok:false,error},status,extra);

/* ---- rate limiting (fixed windows in D1) ----------------------------------------------------------------------- */
async function releaseGet(which,env){
 const now=Math.floor(Date.now()/1000);let row=null;try{row=await env.DB.prepare('SELECT body,fetched_at FROM release_cache WHERE which=?').bind(which).first();}catch{}
 const out=(body,age)=>new Response(body,{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=120','x-release-age':String(age)}});
 if(row&&now-row.fetched_at<600)return out(row.body,now-row.fetched_at);
 const fresh=await refreshRelease(env,which).catch(()=>null);if(fresh)return out(fresh,0);
 if(row)return out(row.body,now-row.fetched_at);
 return new Response(JSON.stringify({error:'RELEASE_UNAVAILABLE'}),{status:503,headers:{'content-type':'application/json; charset=utf-8'}});
}
/* GitHub's answer is stored only when it is a real release (GitHub rate-limits the shared Cloudflare egress now and then) */
async function refreshRelease(env,which){
 const headers={'User-Agent':'MeguLit-Relay','Accept':'application/vnd.github+json'};if(env.GITHUB_TOKEN)headers.Authorization='Bearer '+env.GITHUB_TOKEN;
 const up=await fetch('https://api.github.com/repos/ilynthn/MeguLit/releases/'+which,{headers});if(!up.ok)return null;
 const body=await up.text();let rel;try{rel=JSON.parse(body);}catch{return null;}if(!rel?.tag_name||!Array.isArray(rel.assets))return null;
 await env.DB.prepare('INSERT INTO release_cache(which,body,fetched_at) VALUES(?,?,?) ON CONFLICT(which) DO UPDATE SET body=excluded.body,fetched_at=excluded.fetched_at').bind(which,body,Math.floor(Date.now()/1000)).run();
 return body;
}
/* seconds until the window that refused the last call ends; handle() sends it as Retry-After on every 429 */
let refusedFor=0;
export const retryAfter=()=>refusedFor||60;
/* 2026-11-13 D1 daily rows_written was at 94% of the free tier: every request wrote a rate_limits row (the global ip
   bucket plus the route's own). The short, high-traffic windows now use Cloudflare's own rate limiting bindings
   (no D1 write at all); the rare long windows (hourly / daily caps) stay in D1, where a row per hit is nothing. */
export const NATIVE={ip:'RL_IP','lb-get':'RL_LB_GET','avatar-get':'RL_AVATAR_GET',hot:'RL_HOT',daily:'RL_DAILY','daily-img':'RL_DAILY_IMG',release:'RL_RELEASE','social-get':'RL_SOCIAL_GET','forum-get':'RL_FORUM_GET'};
export async function hit(env,kind,subject,now=Date.now()){
 const limiter=env[NATIVE[kind]||''];
 if(limiter?.limit){try{const ok=(await limiter.limit({key:`${kind}:${subject}`})).success;if(!ok)refusedFor=RATE[kind]?.[1]||60;return ok;}catch{/* fall through to D1 */}}
 const [limit,seconds]=RATE[kind],windowStart=Math.floor(now/1000/seconds)*seconds,bucket=`${kind}:${subject}:${windowStart}`;
 const row=await env.DB.prepare('INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,windowStart+seconds).first();
 if(Math.random()<.02)await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at<?').bind(Math.floor(now/1000)).run();
 const ok=(row?.count??1)<=limit;if(!ok)refusedFor=Math.max(1,windowStart+seconds-Math.floor(now/1000));return ok;
}
async function clientKey(request,env){return (await sha256((env.HASH_SALT||'megulit-relay')+':'+(request.headers.get('cf-connecting-ip')||'unknown'))).slice(0,32);}
/* Leaderboard identity: a logged-in account (one row across PCs) or else the install id; only hashes are stored. */
export async function subjects(request,env,installId,now){
 const auth=env.DB&&request.headers.get('authorization')?await authenticate(request,env,now).catch(()=>null):null;
 const account=auth?await sha256('account:'+auth.account.id):'',install=INSTALL_ID.test(String(installId||''))?await sha256(installId):'';
 /* 2026-11-12 (user: one player showed twice, once as the install and once as the account): an install that posted
    signed in is linked to that account, and counts for it from then on, signed in or not. */
 let linked='';
 if(env.DB&&install){try{
  if(account)await env.DB.prepare('INSERT INTO install_links(install_hash,account_hash,linked_at) VALUES(?,?,?) ON CONFLICT(install_hash) DO UPDATE SET account_hash=excluded.account_hash,linked_at=excluded.linked_at WHERE install_links.account_hash<>excluded.account_hash').bind(install,account,Math.floor((now?.getTime?.()||Date.now())/1000)).run();
  else linked=(await env.DB.prepare('SELECT account_hash FROM install_links WHERE install_hash=?').bind(install).first())?.account_hash||'';
 }catch{}}
 return {primary:account||linked||install,account,install,auth,linked};
}
async function readJSON(request,max=LIMITS.body){
 const length=Number(request.headers.get('content-length')||0);if(length>max)return {error:'PAYLOAD_TOO_LARGE'};
 const text=await request.text();if(text.length>max)return {error:'PAYLOAD_TOO_LARGE'};
 try{return {value:JSON.parse(text)};}catch{return {error:'INVALID_JSON'};}
}

/* ---- leaderboard ----------------------------------------------------------------------------------------------- */
const COLUMN={characters:'characters',seconds:'seconds',words:'words',streak:'streak',reviews:'reviews',kana:'kana'};
export async function leaderboardPost(request,env,ip,now=new Date()){
 if(!await hit(env,'lb-post',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const body=await readJSON(request);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const checked=validateLeaderboard(body.value,now);if(!checked.ok)return fail(checked.error);
 const hot=validateHot(body.value.hot,now);if(!hot.ok)return fail(hot.error);
 const {id,name,keys,stats,games,element,level}=checked.value,who=await subjects(request,env,id,now),idHash=who.primary,t=Math.floor(now.getTime()/1000);
 if(!await hit(env,'lb-id',idHash,now.getTime()))return fail('RATE_LIMITED',429);
 /* 2026-11-12 the board rows an install kept before it was linked to the account are the same player: removed, the
    account's rows (just posted with the full totals) are the only ones */
 if(who.install&&idHash!==who.install){try{await env.DB.batch(['leaderboard_stats','leaderboard_games','leaderboard_users'].map(t=>env.DB.prepare(`DELETE FROM ${t} WHERE id_hash=?`).bind(who.install)));}catch{}}
 /* 2026-11-12 (user: two players named the same mixed the board up) a name another player already uses is refused */
 {const taken=await env.DB.prepare('SELECT 1 FROM leaderboard_users WHERE lower(trim(name))=lower(trim(?)) AND id_hash<>? LIMIT 1').bind(name,idHash).first();if(taken)return fail('NAME_TAKEN',409);}
 /* 2026-11-13 every upsert below skips the write when nothing actually changed (D1 counts rows_written, and the app
    re-posts the same totals every 10 minutes while the board is open). updated_at alone is not worth a row. */
 const statements=[env.DB.prepare('INSERT INTO leaderboard_users(id_hash,name,share_games,element,level,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id_hash) DO UPDATE SET name=excluded.name,share_games=excluded.share_games,element=excluded.element,level=excluded.level,updated_at=excluded.updated_at WHERE leaderboard_users.name<>excluded.name OR leaderboard_users.share_games<>excluded.share_games OR leaderboard_users.element<>excluded.element OR leaderboard_users.level<>excluded.level').bind(idHash,name,games?1:0,element,level,t,t)];
 for(const period of ['week','month','all']){const s=stats[period];statements.push(env.DB.prepare('INSERT INTO leaderboard_stats(id_hash,period,period_key,characters,seconds,words,streak,reviews,kana,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id_hash,period,period_key) DO UPDATE SET characters=excluded.characters,seconds=excluded.seconds,words=excluded.words,streak=excluded.streak,reviews=excluded.reviews,kana=excluded.kana,updated_at=excluded.updated_at WHERE leaderboard_stats.characters<>excluded.characters OR leaderboard_stats.seconds<>excluded.seconds OR leaderboard_stats.words<>excluded.words OR leaderboard_stats.streak<>excluded.streak OR leaderboard_stats.reviews<>excluded.reviews OR leaderboard_stats.kana<>excluded.kana').bind(idHash,period,keys[period],s.characters,s.seconds,s.words,s.streak,s.reviews,s.kana,t));}
  /* the games were deleted and re-inserted wholesale before: 60 rows a post for a 30-game list, nearly all identical */
 {const keys=(games||[]).map(g=>g.key);
  statements.push(keys.length
   ?env.DB.prepare(`DELETE FROM leaderboard_games WHERE id_hash=? AND game_key NOT IN (${keys.map(()=>'?').join(',')})`).bind(idHash,...keys)
   :env.DB.prepare('DELETE FROM leaderboard_games WHERE id_hash=?').bind(idHash));
  for(const g of games||[])statements.push(env.DB.prepare('INSERT INTO leaderboard_games(id_hash,game_key,title,characters,seconds,updated_at,last_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id_hash,game_key) DO UPDATE SET title=excluded.title,characters=excluded.characters,seconds=excluded.seconds,updated_at=excluded.updated_at,last_at=excluded.last_at WHERE leaderboard_games.title<>excluded.title OR leaderboard_games.characters<>excluded.characters OR leaderboard_games.seconds<>excluded.seconds OR leaderboard_games.last_at<>excluded.last_at').bind(idHash,g.key,g.title,g.characters,g.seconds,t,g.last||0));}
 statements.push(...hotStatements(env,idHash,hot.value,now));
 /* a PC that just logged in: fold its old install-id row into the account row */
 if(who.account&&who.install&&who.install!==who.account)for(const table of ['leaderboard_stats','leaderboard_games','leaderboard_users','hot_lookups'])statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE id_hash=?`).bind(who.install));
 await env.DB.batch(statements);
 return json({ok:true,account:!!who.account});
}
export async function leaderboardGet(url,env,ip,now=new Date()){
 if(!await hit(env,'lb-get',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const checked=validateBoardQuery(url.searchParams,now);if(!checked.ok)return fail(checked.error);const q=checked.value;
 if(q.metric==='games'&&q.game===null){
  const {results}=await env.DB.prepare(`SELECT g.game_key,MAX(g.title) title,COUNT(*) readers,
    (SELECT u.name FROM leaderboard_games t JOIN leaderboard_users u ON u.id_hash=t.id_hash WHERE t.game_key=g.game_key ORDER BY t.characters DESC LIMIT 1) top_name,
    MAX(g.characters) top_value FROM leaderboard_games g GROUP BY g.game_key ORDER BY readers DESC,top_value DESC LIMIT 100`).all();
  return json({games:results.map(r=>({title:r.title,readers:r.readers,top:r.top_name?{rank:1,name:r.top_name,value:r.top_value}:null}))});
 }
 let rows,total,mine=null;
 if(q.metric==='games'){
  ({results:rows}=await env.DB.prepare('SELECT g.id_hash,u.name,u.element,u.level,g.characters value,p.pid FROM leaderboard_games g JOIN leaderboard_users u ON u.id_hash=g.id_hash LEFT JOIN profiles p ON p.id_hash=g.id_hash AND p.public=1 AND p.hidden=0 WHERE g.game_key=? AND g.characters>0 ORDER BY g.characters DESC,g.updated_at ASC LIMIT 50').bind(q.game).all());
  total=(await env.DB.prepare('SELECT COUNT(*) n FROM leaderboard_games WHERE game_key=? AND characters>0').bind(q.game).first())?.n||0;
  if(q.me){const r=await env.DB.prepare('SELECT characters value FROM leaderboard_games WHERE game_key=? AND id_hash=?').bind(q.game,q.me).first();if(r&&r.value>0)mine={value:r.value,rank:1+((await env.DB.prepare('SELECT COUNT(*) n FROM leaderboard_games WHERE game_key=? AND characters>?').bind(q.game,r.value).first())?.n||0)};}
 }else{
  const col=COLUMN[q.metric];
  ({results:rows}=await env.DB.prepare(`SELECT s.id_hash,u.name,u.element,u.level,s.${col} value,p.pid FROM leaderboard_stats s JOIN leaderboard_users u ON u.id_hash=s.id_hash LEFT JOIN profiles p ON p.id_hash=s.id_hash AND p.public=1 AND p.hidden=0 WHERE s.period=? AND s.period_key=? AND s.${col}>0 ORDER BY s.${col} DESC,s.updated_at ASC LIMIT 50`).bind(q.period,q.key).all());
  total=(await env.DB.prepare(`SELECT COUNT(*) n FROM leaderboard_stats WHERE period=? AND period_key=? AND ${col}>0`).bind(q.period,q.key).first())?.n||0;
  if(q.me){const r=await env.DB.prepare(`SELECT ${col} value FROM leaderboard_stats WHERE period=? AND period_key=? AND id_hash=?`).bind(q.period,q.key,q.me).first();if(r&&r.value>0)mine={value:r.value,rank:1+((await env.DB.prepare(`SELECT COUNT(*) n FROM leaderboard_stats WHERE period=? AND period_key=? AND ${col}>?`).bind(q.period,q.key,r.value).first())?.n||0)};}
 }
 /* rank = 1 + number of strictly better values, so ties share a rank; id hashes never leave the server */
 const avatars=await avatarsFor(env,rows.map(r=>r.id_hash));
 let rank=0,prev=null;const entries=rows.map((r,i)=>{if(r.value!==prev){rank=i+1;prev=r.value;}return {rank,name:r.name,value:r.value,me:!!q.me&&r.id_hash===q.me,avatar:avatars.get(r.id_hash)||null,pid:r.pid||null,element:r.element||'',level:r.level||0};});
 /* E420 the most-read work (all time, from readers who share game names) for 阅读时长 / 阅读字数 */
 let feature=null;
 if(q.metric==='seconds'||q.metric==='characters'){const col=q.metric;const f=await env.DB.prepare(`SELECT MAX(title) title,SUM(${col}) value,COUNT(*) readers FROM leaderboard_games WHERE ${col}>0 GROUP BY game_key ORDER BY value DESC LIMIT 1`).first();if(f&&f.value>0)feature={title:f.title,value:f.value,readers:f.readers};}
 return json({entries,total,me:mine,feature});
}
export async function leaderboardDelete(request,url,env,ip,now=new Date()){
 if(!await hit(env,'lb-post',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const id=url.searchParams.get('id')||'';if(!INSTALL_ID.test(id))return fail('INVALID_ID');
 return removeSubjects(env,[...new Set([(await subjects(request,env,id,now)).account,await sha256(id)])].filter(Boolean));
}
export async function removeSubjects(env,hashes){
 await avatarDelete(env,hashes);
 await env.DB.batch([...hashes.flatMap(h=>['leaderboard_stats','leaderboard_games','leaderboard_users','hot_lookups'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE id_hash=?`).bind(h))),...socialDeletes(env,hashes),...forumDeletes(env,hashes)]);
 return json({ok:true});
}

/* ---- shared adaptation ----------------------------------------------------------------------------------------- */
export async function adaptationPost(request,env,ip,now=new Date()){
 if(!await hit(env,'adapt-post',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const body=await readJSON(request,LIMITS.adaptationRecords*LIMITS.adaptationRecord+1024);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const records=body.value?.records;if(!Array.isArray(records)||records.length>LIMITS.adaptationRecords)return fail('INVALID_RECORDS');
 const t=Math.floor(now.getTime()/1000),statements=[];let rejected=0;
 for(const record of records){const ok=validateAdaptationRecord(record);if(!ok){rejected++;continue;}
  statements.push(env.DB.prepare('INSERT INTO adaptation_records(key,record,submitter,reports,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(key) DO UPDATE SET record=excluded.record,submitter=excluded.submitter,reports=reports+1,updated_at=excluded.updated_at').bind(ok.key,ok.json,ip,t));}
 if(statements.length)await env.DB.batch(statements);
 return json({ok:true,accepted:statements.length,rejected});
}
async function adaptationLookup(keys,env){
 if(!keys.length)return json({records:[]});
 const {results}=await env.DB.prepare(`SELECT record FROM adaptation_records WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
 return json({records:results.map(r=>{try{return JSON.parse(r.record);}catch{return null;}}).filter(Boolean)});
}
export async function adaptationGet(url,env,ip,now=new Date()){
 if(!await hit(env,'adapt-get',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const keys=validateKeys(String(url.searchParams.get('fp')||'').split(',').filter(Boolean));if(!keys)return fail('INVALID_QUERY');
 return adaptationLookup(keys,env);
}
export async function adaptationQuery(request,env,ip,now=new Date()){
 if(!await hit(env,'adapt-get',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const body=await readJSON(request,8*1024);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);
 const keys=validateKeys(body.value?.keys);if(!keys)return fail('INVALID_QUERY');return adaptationLookup(keys,env);
}

/* ---- diagnostics ----------------------------------------------------------------------------------------------- */
export async function diagnosticsPost(request,env,ip,url,now=new Date()){
 if(env.DIAG_TOKEN&&!sameText(request.headers.get('authorization')||'','Bearer '+env.DIAG_TOKEN))return fail('UNAUTHORIZED',401);
 if(!await hit(env,'diag',ip,now.getTime()))return fail('RATE_LIMITED',429);
 if(Number(request.headers.get('content-length')||0)>LIMITS.zip+LIMITS.meta+64*1024)return fail('PAYLOAD_TOO_LARGE',413);
 if(!/^multipart\/form-data/i.test(request.headers.get('content-type')||''))return fail('INVALID_BODY');
 let form;try{form=await request.formData();}catch{return fail('INVALID_BODY');}
 const metaPart=form.get('meta'),file=form.get('package')||form.get('file');
 const metaText=typeof metaPart==='string'?metaPart:metaPart&&typeof metaPart.text==='function'?await metaPart.text():'';
 if(!metaText||metaText.length>LIMITS.meta)return fail('INVALID_META');
 let metaValue;try{metaValue=JSON.parse(metaText);}catch{return fail('INVALID_META');}
 const meta=validateMeta(metaValue);if(!meta.ok)return fail(meta.error);
 if(!file||typeof file.arrayBuffer!=='function')return fail('PACKAGE_REQUIRED');
 if(file.size>LIMITS.zip)return fail('PAYLOAD_TOO_LARGE',413);
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.length<22||bytes[0]!==0x50||bytes[1]!==0x4b)return fail('NOT_A_ZIP');
 const digest=await sha256(bytes);if(meta.value.sha256&&meta.value.sha256!==digest)return fail('CHECKSUM_MISMATCH');
 const id=crypto.randomUUID(),stamp=now.toISOString().slice(0,7),objectKey=`diagnostics/${stamp}/${id}.zip`;
 await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:'application/zip'},customMetadata:{version:meta.value.version,sha256:digest}});
 const days=Math.max(1,Math.min(90,Number(env.LINK_DAYS)||30)),expires=Math.floor(now.getTime()/1000)+days*86400;
 const link=env.LINK_SECRET?`${url.origin}/api/diagnostics/download/${id}?exp=${expires}&sig=${await hmac(env.LINK_SECRET,id+':'+expires)}`:'(LINK_SECRET not set — ask the maintainer)';
 const summary={...meta.value,size:bytes.length,sha256:digest};
 let issueUrl='';
 if(env.GITHUB_TOKEN){
  const repo=/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO||'')?env.GITHUB_REPO:'ilynthn/MeguLit';
  const title=`[诊断] ${summary.game.title||'未知游戏'} · v${summary.version||'?'}`.slice(0,200);
  const r=await (env.fetch||fetch)(`https://api.github.com/repos/${repo}/issues`,{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'megulit-relay','content-type':'application/json'},body:JSON.stringify({title,body:issueBody(summary,link,days),labels:['diagnostics']})});
  if(r.ok){const data=await r.json().catch(()=>({}));issueUrl=typeof data.html_url==='string'?data.html_url:'';}
 }
 await env.DB.prepare('INSERT INTO diagnostics(id,object_key,issue_url,ip_hash,size,sha256,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,objectKey,issueUrl,ip,bytes.length,digest,Math.floor(now.getTime()/1000),expires).run();
 return json({ok:true,id,issueUrl},201);
}
export async function diagnosticsDownload(url,env,ip,now=new Date()){
 if(!await hit(env,'diag-dl',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const id=url.pathname.split('/').pop()||'',exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig')||'';
 if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isSafeInteger(exp)||!HEX64.test(sig)||!env.LINK_SECRET)return fail('NOT_FOUND',404);
 if(!sameText(sig,await hmac(env.LINK_SECRET,id+':'+exp)))return fail('NOT_FOUND',404);
 if(exp<Math.floor(now.getTime()/1000))return fail('LINK_EXPIRED',410);
 const row=await env.DB.prepare('SELECT object_key FROM diagnostics WHERE id=?').bind(id).first();if(!row)return fail('NOT_FOUND',404);
 const object=await env.BUCKET.get(row.object_key);if(!object)return fail('NOT_FOUND',404);
 return new Response(object.body,{headers:{'content-type':'application/zip','content-disposition':`attachment; filename="megulit-diagnostics-${id}.zip"`,'cache-control':'private, no-store'}});
}

/* the overall limit: by token when the request is signed in (a token cannot be guessed, a fake one only reaches the
   per-IP 'ip-shared' cap), else by IP */
async function overall(request,env,ip,now){
 const auth=request.headers.get('authorization')||'';
 if(/^Bearer mgl_[A-Za-z0-9_-]{43}$/.test(auth))return await hit(env,'ip-shared',ip,now.getTime())&&await hit(env,'user',(await sha256('tok:'+auth)).slice(0,32),now.getTime());
 return hit(env,'ip',ip,now.getTime());
}
/* ---- router ---------------------------------------------------------------------------------------------------- */
const social={json,fail,readJSON,hit,sha256,authenticate,avatarsFor,signReview};
export async function handle(request,env,now=new Date(),ctx=null){
 const url=new URL(request.url),cors=corsHeaders(request,env),path=url.pathname.replace(/\/+$/,'')||'/';
 if(request.method==='OPTIONS')return new Response(null,{status:Object.keys(cors).length?204:403,headers:cors});
 const ip=await clientKey(request,env);
 let response;
 try{
  refusedFor=0;
  if(!await overall(request,env,ip,now))response=fail('RATE_LIMITED',429);
  else if(path==='/api/health'&&request.method==='GET')response=json({ok:true,service:'megulit-relay'});
  else if(path==='/api/leaderboard')response=request.method==='POST'?await leaderboardPost(request,env,ip,now):request.method==='GET'?await leaderboardGet(url,env,ip,now):request.method==='DELETE'?await leaderboardDelete(request,url,env,ip,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path==='/api/leaderboard/avatar/appeal'&&request.method==='POST'){const who=await subjects(request,env,url.searchParams.get('id'),now);response=await hit(env,'appeal',who.primary||ip,now.getTime())?await avatarAppeal(request,env,who.primary,url,now):fail('RATE_LIMITED',429);}
  else if(/^\/api\/avatar\/[0-9a-f]{32}\/review$/.test(path)&&request.method==='GET')response=await hit(env,'diag-dl',ip,now.getTime())?await avatarReview(url,env,now):fail('RATE_LIMITED',429);
  else if(path==='/api/leaderboard/avatar'){const who=await subjects(request,env,url.searchParams.get('id'),now);
   if(request.method==='GET')response=await avatarStatus(env,who.primary);
   else if(!await hit(env,'avatar',who.primary||ip,now.getTime()))response=fail('RATE_LIMITED',429);
   else response=request.method==='POST'?await avatarUpload(request,env,who.primary,now):request.method==='DELETE'?await avatarDelete(env,[who.primary]):fail('METHOD_NOT_ALLOWED',405);}
  else if(/^\/api\/avatar\/[0-9a-f]{32}$/.test(path)&&request.method==='GET')response=await hit(env,'avatar-get',ip,now.getTime())?await avatarGet(env,path.split('/').pop()):fail('RATE_LIMITED',429);
  else if(/^\/api\/avatar\/[0-9a-f]{32}\/report$/.test(path)&&request.method==='POST'){const who=await subjects(request,env,url.searchParams.get('id'),now);response=await hit(env,'report',who.primary||ip,now.getTime())?await avatarReport(env,path.split('/')[3],who.primary||'ip:'+ip,now):fail('RATE_LIMITED',429);}
  /* E397 profiles and follows (relay/src/social.js) */
  else if(path==='/api/profile')response=await profileOwn(request,env,ip,now,social);
  else if(path==='/api/profile/appeal'&&request.method==='POST')response=await profileAppeal(request,env,ip,now,social);
  else if(/^\/api\/profile\/[0-9a-f]{16}\/report$/.test(path)&&request.method==='POST')response=await profileReport(request,env,ip,now,social,path.split('/')[3]);
  else if(path.startsWith('/api/profile/')&&request.method==='GET')response=await profileCard(request,env,ip,now,social,path.slice(13));
  else if(path.startsWith('/api/follow/'))response=await followEdit(request,env,ip,now,social,path.slice(12));
  else if(path==='/api/following'&&request.method==='GET')response=await followingFeed(request,env,ip,now,social);
  else if(path==='/api/kindred'&&request.method==='GET')response=await kindred(request,env,ip,now,social);
  /* #117 交流 board (relay/src/forum.js) */
  else if(path==='/api/forum'||path.startsWith('/api/forum/'))response=await forumRoute(request,env,ip,now,social,path);
  /* E461 (user: players in mainland China cannot reach api.github.com, so the update check failed) GitHub's release
     JSON for MeguLit only, cached 5 minutes at the edge; the app still checks the package against GitHub's digest */
  else if(/^\/api\/release\/(latest|tags\/v\d+\.\d+\.\d+[a-z]?)$/.test(path)&&request.method==='GET')response=await hit(env,'release',ip,now.getTime())?await releaseGet(path.slice(13),env):fail('RATE_LIMITED',429);
  /* E415 每日 page (relay/src/daily.js) */
  else if(path==='/api/news'&&request.method==='GET')response=await hit(env,'daily',ip,now.getTime())?await newsGet(env,{json},now,url):fail('RATE_LIMITED',429);
  else if(/^\/api\/news\/img\/[0-9a-f]{32}$/.test(path)&&request.method==='GET')response=await hit(env,'daily-img',ip,now.getTime())?await imageGet(env,path.slice(14)):fail('RATE_LIMITED',429);
  else if(path==='/api/news/article'&&request.method==='GET')response=await hit(env,'daily',ip,now.getTime())?await articleGet(env,url,{json,fail},now):fail('RATE_LIMITED',429);
  else if(path==='/api/hotwords/daily'&&request.method==='GET')response=await hit(env,'daily',ip,now.getTime())?await hotWordsDailyGet(env,url,{json,fail},now):fail('RATE_LIMITED',429);
  else if(path==='/api/hotwords'&&request.method==='GET')response=await hit(env,'hot',ip,now.getTime())?await hotWordsGet(url,env):fail('RATE_LIMITED',429);
  else if(path==='/api/me'&&request.method==='DELETE'){const auth=await authenticate(request,env,now).catch(()=>null);response=await handleAccounts(request,env,now);if(auth&&response.ok)await removeSubjects(env,[await sha256('account:'+auth.account.id)]);}
  else if(isAccountsPath(path))response=await handleAccounts(request,env,now,ctx)||fail('NOT_FOUND',404);
  else if(path==='/api/adaptation')response=request.method==='POST'?await adaptationPost(request,env,ip,now):request.method==='GET'?await adaptationGet(url,env,ip,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path==='/api/adaptation/query')response=request.method==='POST'?await adaptationQuery(request,env,ip,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path==='/api/feedback')response=request.method==='POST'?await feedbackPost(request,env,{readJSON,fail,json,hit},ip,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path==='/api/diagnostics')response=request.method==='POST'?await diagnosticsPost(request,env,ip,url,now):fail('METHOD_NOT_ALLOWED',405);
  else if(path.startsWith('/api/diagnostics/download/')&&request.method==='GET')response=await diagnosticsDownload(url,env,ip,now);
  else if(path.startsWith('/api/adapters/')||path==='/api/probe'||path.startsWith('/api/probe/'))response=await adaptersRoute(request,env,ip,now,url,path,{json,fail,hit,readJSON})||fail('NOT_FOUND',404);
  else response=fail('NOT_FOUND',404);
 }catch(error){console.error('relay error',error?.message);response=fail('SERVER_ERROR',500);}
 if(response.status===429&&!response.headers.get('retry-after'))response.headers.set('retry-after',String(retryAfter()));
 for(const[k,v]of Object.entries(cors))response.headers.set(k,v);
 return response;
}
/* Cron (wrangler.toml [triggers]): Monday 00:00 UTC+8 settles last week's hot words. */
export async function scheduled(event,env,ctx){
 /* every 30 minutes: website feedback still waiting for its GitHub issue; the weekly cron settles hot words */
 if(event?.cron==='20 21 * * *'){const job=refreshDaily(env,new Date(event?.scheduledTime||Date.now())).catch(()=>0);if(ctx?.waitUntil)ctx.waitUntil(job);return job;}
 if(event?.cron==='*/30 * * * *'){const job=Promise.all([syncPendingFeedback(env).catch(()=>0),refreshRelease(env,'latest').catch(()=>null),cleanupForumImages(env,new Date(event?.scheduledTime||Date.now())).catch(()=>0)]);if(ctx?.waitUntil)ctx.waitUntil(job);return job;}
 const when=new Date(event?.scheduledTime||Date.now());const job=settleDue(env,when).then(async done=>{await cleanupAvatars(env,when).catch(()=>0);return done;});if(ctx?.waitUntil)ctx.waitUntil(job);return job;}
/* a token rotated while answering any request goes back on that answer, whichever endpoint it was */
export default {fetch:async(request,env,ctx)=>{const response=await handle(request,env,new Date(),ctx);const token=ROTATED.get(request);if(!token||response.headers.get('x-megulit-token'))return response;const copy=new Response(response.body,response);copy.headers.set('x-megulit-token',token);return copy;},scheduled};
