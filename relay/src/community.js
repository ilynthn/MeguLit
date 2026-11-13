// SPDX-License-Identifier: GPL-3.0-or-later
/* E379 leaderboard community features on the relay: avatars with server-side moderation and reports, and the weekly
   hot-lookup awards. Bindings: DB (D1), BUCKET (R2), AI (Workers AI). Vars: AVATAR_MODEL, HOT_MODEL, HOT_MIN_USERS,
   REPORT_THRESHOLD. Schema: migrations/0006_community.sql.

   Avatars: the client crops to a square and encodes a ≤256 px still WebP; the relay checks the bytes (validate.js),
   stores them in R2 as pending, asks the vision model, and only an explicit SAFE answer makes the avatar public.
   Anything else — UNSAFE, an unclear answer, a model error, no AI binding — rejects it. Reports from distinct people
   past REPORT_THRESHOLD hide an approved avatar and put it in moderation_queue for a human.

   Hot words: each joined user's submit carries this week's lookup counts (term + count, nothing else). Weekly cron
   (Monday 00:00 UTC+8) settles finished weeks: terms looked up by at least HOT_MIN_USERS different people, split into
   词汇 / 短语 / 短句, ranked by people then lookups, top 50 kept; the top 10 of each get a one-line AI guess at why.
   Results are frozen in hot_awards and the raw per-user rows of settled weeks are deleted. */
import {validateAvatar,HOT,CATEGORIES,classifyTerm,blockedTerm,hotWeekKey,BLOCKED} from './validate.js';

export const AVATAR_MODEL='@cf/meta/llama-3.2-11b-vision-instruct';
/* E415: llama-3.1-8b-instruct was retired on 2026-05-30, so the weekly reasons use Qwen 3 */
export const HOT_MODEL='@cf/qwen/qwen3-30b-a3b-fp8';
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const fail=(error,status=400)=>json({ok:false,error},status);
const sec=now=>Math.floor(now.getTime()/1000);
const minUsers=env=>Math.max(2,Math.min(50,Number(env.HOT_MIN_USERS)||HOT.minUsers));
const reportThreshold=env=>Math.max(1,Math.min(100,Number(env.REPORT_THRESHOLD)||3));

/* ---- moderation ------------------------------------------------------------------------------------------------ */
export const MODERATION_PROMPT='You moderate profile pictures for a language-learning app used by teenagers. Answer with exactly one word: SAFE or UNSAFE. Answer UNSAFE if the image shows nudity or partial nudity, underwear or swimwear focus, sexual acts or poses, suggestive or fetish content, sexualized characters (including anime or drawn characters, and anyone who may be a minor), genitals or their outline, gore, self-harm, drugs, or hate symbols. If you are not sure, answer UNSAFE.';
/* → {approved:boolean, reason} ; approved only on a clean SAFE answer */
export async function moderateImage(env,bytes){
 if(!env.AI||typeof env.AI.run!=='function')return {approved:false,reason:'MODERATION_UNAVAILABLE'};
 let answer;
 try{const out=await env.AI.run(env.AVATAR_MODEL||AVATAR_MODEL,{messages:[{role:'system',content:MODERATION_PROMPT},{role:'user',content:'Is this profile picture SAFE or UNSAFE?'}],image:[...bytes],max_tokens:4,temperature:0});answer=String(out?.response??out?.result?.response??'');}
 catch(error){return {approved:false,reason:'MODERATION_ERROR',answer:String(error?.message||'').slice(0,60)};}
 const word=answer.trim().toUpperCase().replace(/[^A-Z]/g,''),raw=answer.trim().slice(0,60);
 if(word==='SAFE')return {approved:true,reason:'',answer:raw};
 return {approved:false,reason:word==='UNSAFE'?'NSFW':'MODERATION_UNCLEAR',answer:raw};
}

/* ---- avatars --------------------------------------------------------------------------------------------------- */
export async function avatarUpload(request,env,subject,now=new Date()){
 if(!subject)return fail('INVALID_ID');
 const user=await env.DB.prepare('SELECT id_hash FROM leaderboard_users WHERE id_hash=?').bind(subject).first();if(!user)return fail('NOT_JOINED',403);
 if(Number(request.headers.get('content-length')||0)>70*1024)return fail('PAYLOAD_TOO_LARGE',413);
 const bytes=new Uint8Array(await request.arrayBuffer());const checked=validateAvatar(bytes);if(!checked.ok)return fail(checked.error,checked.error==='PAYLOAD_TOO_LARGE'?413:400);
 const avatarId=crypto.randomUUID().replace(/-/g,''),key=`avatars/${avatarId}.webp`,t=sec(now);
 const old=await env.DB.prepare('SELECT avatar_id FROM avatars WHERE id_hash=?').bind(subject).first();
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
 /* pending until the model answers: never served in that state */
 await env.DB.prepare("INSERT INTO avatars(id_hash,avatar_id,status,reason,reports,created_at,reviewed_at) VALUES(?,?,'pending','',0,?,0) ON CONFLICT(id_hash) DO UPDATE SET avatar_id=excluded.avatar_id,status='pending',reason='',answer='',reports=0,created_at=excluded.created_at,reviewed_at=0,appealed_at=0,appeal_issue=''").bind(subject,avatarId,t).run();
 const verdict=await moderateImage(env,bytes);
 await env.DB.batch([env.DB.prepare('UPDATE avatars SET status=?,reason=?,answer=?,reviewed_at=? WHERE id_hash=? AND avatar_id=?').bind(verdict.approved?'approved':'rejected',verdict.reason,verdict.answer||'',t,subject,avatarId),env.DB.prepare('DELETE FROM avatar_reports WHERE avatar_id=?').bind(old?.avatar_id||'')]);
 if(old?.avatar_id)await env.BUCKET.delete?.(`avatars/${old.avatar_id}.webp`);
 /* a rejected picture stays private in R2 (avatarGet never serves it) so its owner can appeal; cleanupAvatars drops it after APPEAL_DAYS */
 return json({ok:true,status:verdict.approved?'approved':'rejected',reason:verdict.reason,avatar:verdict.approved?avatarId:null});
}
export async function avatarDelete(env,subjects){
 for(const subject of subjects.filter(Boolean)){const row=await env.DB.prepare('SELECT avatar_id FROM avatars WHERE id_hash=?').bind(subject).first();if(!row)continue;
  await env.DB.batch([env.DB.prepare('DELETE FROM avatars WHERE id_hash=?').bind(subject),env.DB.prepare('DELETE FROM avatar_reports WHERE avatar_id=?').bind(row.avatar_id)]);await env.BUCKET.delete?.(`avatars/${row.avatar_id}.webp`);}
 return json({ok:true});
}
/* Public bytes: approved only. */
export async function avatarGet(env,avatarId){
 if(!/^[0-9a-f]{32}$/.test(avatarId))return fail('NOT_FOUND',404);
 const row=await env.DB.prepare("SELECT avatar_id FROM avatars WHERE avatar_id=? AND status='approved'").bind(avatarId).first();if(!row)return fail('NOT_FOUND',404);
 const object=await env.BUCKET.get(`avatars/${avatarId}.webp`);if(!object)return fail('NOT_FOUND',404);
 return new Response(object.body,{headers:{'content-type':'image/webp','cache-control':'public, max-age=86400, immutable','x-content-type-options':'nosniff'}});
}
/* One report per reporter per avatar; at the threshold the avatar is hidden and queued for a human. */
export async function avatarReport(env,avatarId,reporter,now=new Date()){
 if(!/^[0-9a-f]{32}$/.test(avatarId))return fail('NOT_FOUND',404);
 const row=await env.DB.prepare("SELECT id_hash,status FROM avatars WHERE avatar_id=?").bind(avatarId).first();if(!row||row.status!=='approved')return json({ok:true,hidden:row?.status==='hidden'});
 if(row.id_hash===reporter)return fail('CANNOT_REPORT_SELF');
 const t=sec(now);await env.DB.prepare('INSERT OR IGNORE INTO avatar_reports(avatar_id,reporter,created_at) VALUES(?,?,?)').bind(avatarId,reporter,t).run();
 const n=(await env.DB.prepare('SELECT COUNT(*) n FROM avatar_reports WHERE avatar_id=?').bind(avatarId).first())?.n||0;
 await env.DB.prepare('UPDATE avatars SET reports=? WHERE avatar_id=?').bind(n,avatarId).run();
 if(n>=reportThreshold(env)){
  await env.DB.batch([env.DB.prepare("UPDATE avatars SET status='hidden',reason='REPORTED' WHERE avatar_id=?").bind(avatarId),env.DB.prepare("INSERT INTO moderation_queue(kind,subject,reason,created_at,resolved_at) VALUES('avatar',?,?,?,0)").bind(avatarId,`reported by ${n}`,t)]);
  return json({ok:true,hidden:true});
 }
 return json({ok:true,hidden:false});
}
/* approved avatar ids for a set of id hashes (board rows) */
export async function avatarsFor(env,hashes){
 if(!hashes.length)return new Map();
 const {results}=await env.DB.prepare(`SELECT id_hash,avatar_id FROM avatars WHERE status='approved' AND id_hash IN (${hashes.map(()=>'?').join(',')})`).bind(...hashes).all();
 return new Map(results.map(r=>[r.id_hash,r.avatar_id]));
}
export async function avatarStatus(env,subject){const row=subject?await env.DB.prepare('SELECT avatar_id,status,reason,appealed_at,appeal_issue FROM avatars WHERE id_hash=?').bind(subject).first():null;return json({status:row?.status||'none',reason:row?.reason||'',avatar:row?.status==='approved'?row.avatar_id:null,appealed:!!row?.appealed_at,issueUrl:row?.appeal_issue||''});}

/* ---- appeals: the owner of a rejected picture asks a human ------------------------------------------------------
   One click in Settings: a GitHub issue (label avatar-appeal) with the verdict, the model's raw answer and a private
   review link (HMAC-signed with LINK_SECRET, REVIEW_HOURS long, not embedded so nothing shows inline in the issue),
   plus a moderation_queue row. One appeal per picture. The maintainer approves or keeps it rejected with the commands
   written into the issue (README: Moderation queue). */
export const APPEAL_DAYS=30,REVIEW_HOURS=72;
const enc=new TextEncoder(),hexOf=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function signReview(secret,avatarId,exp){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hexOf(await crypto.subtle.sign('HMAC',key,enc.encode('review:'+avatarId+':'+exp)));}
const FENCE='`'.repeat(3),TICK='`';
export function appealBody(row,link,meta={}){
 const at=v=>v?new Date(v*1000).toISOString().replace('T',' ').slice(0,16)+' UTC':'-';
 const answer=String(row.answer||'').replace(/[`\r\n]/g,' ').trim()||'-',version=String(meta.version||'?').replace(/[^\w.]/g,'').slice(0,20)||'?';
 const sql=command=>[FENCE,`npx wrangler d1 execute megulit-relay --remote --command "${command}"`,FENCE];
 return ['A MeguLit user thinks the automatic check rejected their leaderboard picture by mistake.','',
  `- Avatar id: ${TICK}${row.avatar_id}${TICK}`,`- Verdict: ${row.reason||'?'} (model answer: ${TICK}${answer}${TICK})`,`- Uploaded: ${at(row.created_at)} · checked: ${at(row.reviewed_at)}`,`- App: ${version}`,'',
  `Private review link (opens the picture, expires in ${REVIEW_HOURS} h; not embedded on purpose):`,link,'',
  'Approve (it shows on the leaderboard right away):',...sql(`UPDATE avatars SET status='approved',reason='APPEAL_APPROVED' WHERE avatar_id='${row.avatar_id}'; UPDATE moderation_queue SET resolved_at=unixepoch() WHERE subject='${row.avatar_id}'`),
  'Keep it rejected:',...sql(`UPDATE avatars SET reason='APPEAL_REJECTED' WHERE avatar_id='${row.avatar_id}'; UPDATE moderation_queue SET resolved_at=unixepoch() WHERE subject='${row.avatar_id}'`)].join('\n');
}
export async function avatarAppeal(request,env,subject,url,now=new Date()){
 if(!subject)return fail('INVALID_ID');
 const row=await env.DB.prepare('SELECT * FROM avatars WHERE id_hash=?').bind(subject).first();
 if(!row||row.status!=='rejected')return fail('NOTHING_TO_APPEAL');
 if(row.appealed_at)return json({ok:true,issueUrl:row.appeal_issue||'',already:true});
 if(!await env.BUCKET.get(`avatars/${row.avatar_id}.webp`))return fail('NOTHING_TO_APPEAL');
 let meta={};try{meta=JSON.parse((await request.text())||'{}')||{};}catch{}
 const t=sec(now),exp=t+REVIEW_HOURS*3600;
 const link=env.LINK_SECRET?`${url.origin}/api/avatar/${row.avatar_id}/review?exp=${exp}&sig=${await signReview(env.LINK_SECRET,row.avatar_id,exp)}`:`(LINK_SECRET not set: npx wrangler r2 object get megulit-diagnostics/avatars/${row.avatar_id}.webp --remote --file a.webp)`;
 let issueUrl='';
 if(env.GITHUB_TOKEN){
  const repo=/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO||'')?env.GITHUB_REPO:'ilynthn/MeguLit';
  try{const r=await (env.fetch||fetch)(`https://api.github.com/repos/${repo}/issues`,{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'megulit-relay','content-type':'application/json'},body:JSON.stringify({title:`[头像复核] ${row.reason||'rejected'} · ${row.avatar_id.slice(0,8)}`,body:appealBody(row,link,meta),labels:['avatar-appeal']})});
   if(r.ok){const data=await r.json().catch(()=>({}));issueUrl=typeof data.html_url==='string'&&data.html_url.startsWith('https://github.com/')?data.html_url:'';}}catch{}
 }
 await env.DB.batch([env.DB.prepare('UPDATE avatars SET appealed_at=?,appeal_issue=? WHERE avatar_id=?').bind(t,issueUrl,row.avatar_id),env.DB.prepare("INSERT INTO moderation_queue(kind,subject,reason,created_at,resolved_at) VALUES('appeal',?,?,?,0)").bind(row.avatar_id,`appeal of ${row.reason}`,t)]);
 return json({ok:true,issueUrl});
}
/* The signed review link serves the picture whatever its status, privately, until it expires. */
export async function avatarReview(url,env,now=new Date()){
 const id=url.pathname.split('/')[3]||'',exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig')||'';
 if(!/^[0-9a-f]{32}$/.test(id)||!Number.isSafeInteger(exp)||!/^[0-9a-f]{64}$/.test(sig)||!env.LINK_SECRET)return fail('NOT_FOUND',404);
 const want=await signReview(env.LINK_SECRET,id,exp);let d=0;for(let i=0;i<64;i++)d|=want.charCodeAt(i)^sig.charCodeAt(i);if(d)return fail('NOT_FOUND',404);
 if(exp<sec(now))return fail('LINK_EXPIRED',410);
 const object=await env.BUCKET.get(`avatars/${id}.webp`);if(!object)return fail('NOT_FOUND',404);
 return new Response(object.body,{headers:{'content-type':'image/webp','cache-control':'private, no-store','x-robots-tag':'noindex','x-content-type-options':'nosniff'}});
}
/* Cron: drop rejected pictures nobody appealed after APPEAL_DAYS (the row stays as 'expired'). */
export async function cleanupAvatars(env,now=new Date()){
 const {results}=await env.DB.prepare("SELECT avatar_id FROM avatars WHERE status='rejected' AND appealed_at=0 AND reviewed_at>0 AND reviewed_at<?").bind(sec(now)-APPEAL_DAYS*86400).all();
 for(const r of results){await env.BUCKET.delete?.(`avatars/${r.avatar_id}.webp`);await env.DB.prepare("UPDATE avatars SET status='expired' WHERE avatar_id=?").bind(r.avatar_id).run();}
 return results.length;
}

/* ---- hot words: per-user weekly counts ------------------------------------------------------------------------- */
/* Statements that replace this user's counts for the week (called from the leaderboard POST batch). */
export function hotStatements(env,subject,hot,now=new Date()){
 if(!hot)return [];const t=sec(now);
 /* 2026-11-13 this used to delete the week's rows and re-insert all of them (up to 100 terms) on every submit, which
    the app repeats every 10 minutes: ~200 D1 rows_written for counts that rarely move. Now only what changed. */
 const terms=[...hot.terms].slice(0,HOT.terms),keys=terms.map(([term])=>term);
 return [keys.length
   ?env.DB.prepare(`DELETE FROM hot_lookups WHERE week_key=? AND id_hash=? AND term NOT IN (${keys.map(()=>'?').join(',')})`).bind(hot.week,subject,...keys)
   :env.DB.prepare('DELETE FROM hot_lookups WHERE week_key=? AND id_hash=?').bind(hot.week,subject),
  ...terms.map(([term,count])=>env.DB.prepare('INSERT INTO hot_lookups(week_key,id_hash,term,count,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(week_key,id_hash,term) DO UPDATE SET count=excluded.count,updated_at=excluded.updated_at WHERE hot_lookups.count<>excluded.count').bind(hot.week,subject,term,count,t))];
}

/* ---- hot words: weekly settlement ------------------------------------------------------------------------------ */
/* Pure ranking of aggregated rows {term,users,lookups} → {word:[...],phrase:[...],sentence:[...]} with ranks. */
export function rankHot(rows,min=HOT.minUsers){
 const out=Object.fromEntries(CATEGORIES.map(c=>[c,[]]));
 for(const r of rows){if(r.users<min||blockedTerm(r.term))continue;out[classifyTerm(r.term)].push({term:r.term,users:r.users,lookups:r.lookups});}
 for(const c of CATEGORIES){out[c].sort((a,b)=>b.users-a.users||b.lookups-a.lookups||(a.term<b.term?-1:a.term>b.term?1:0));out[c]=out[c].slice(0,HOT.top).map((x,i)=>({rank:i+1,...x}));}
 return out;
}
const REASON_SYSTEM='你是日语学习社区“MeguLit”的周报编辑。读者在玩日本视觉小说（galgame）时会查词。给你本周被最多读者查询的日语词条，请为每一条写一句不超过40个汉字的中文推测，说明为什么本周很多人在查它（比如是某部作品的口头禅、常见但难懂的说法、读音特殊、语法难点）。只用“可能”“也许”“大概”这类推测语气，不要编造确定的事实；提供了游戏名时可以参考。只输出 JSON 数组，每项形如 {"term":"词条","reason":"推测"}，不要输出其他内容。';
export function cleanReason(text){
 const value=[...String(text||'').replace(/[\r\n\t]+/g,' ').replace(/[<>`*_#\[\]{}|\\]/g,'').trim()].filter(ch=>{const c=ch.codePointAt(0);return c>=32&&!(c>=0x7f&&c<=0x9f)&&!(c>=0x200b&&c<=0x200f)&&!(c>=0x2028&&c<=0x202e);}).join('');
 if(!value||[...value].length>80||/https?:|www\./i.test(value))return '';
 const flat=value.toLowerCase();if(BLOCKED.some(w=>/^[a-z]+$/.test(w)?w.length>3&&flat.includes(w):flat.includes(w)))return '';
 return value;
}
export function fallbackReason(item){return `本周有 ${item.users} 位读者查过它，一共 ${item.lookups} 次`;}
/* Asks the text model once per category for the top 10; any failure keeps the plain fallback (ai:false). */
export async function aiReasons(env,category,items,games=new Map()){
 const result=new Map(items.map(x=>[x.term,{reason:fallbackReason(x),ai:false}]));
 if(!items.length||!env.AI||typeof env.AI.run!=='function')return result;
 const label={word:'词汇',phrase:'短语',sentence:'短句'}[category];
 const lines=items.map(x=>{const g=games.get(x.term)||[];return `${x.rank}. ${x.term}（${x.users} 位读者查过 ${x.lookups} 次${g.length?'；查它的读者常玩：'+g.map(v=>`${v.title}（${v.n} 人）`).join('、'):''}）`;}).join('\n');
 try{
  const out=await env.AI.run(env.HOT_MODEL||HOT_MODEL,{messages:[{role:'system',content:REASON_SYSTEM+' /no_think'},{role:'user',content:`类别：${label}\n${lines}`}],max_tokens:900,temperature:.4});
  /* {response:'…[…]…'} (Llama), {response:[…]} (Qwen 3 JSON mode) or OpenAI-style {choices:[{message:{content}}]} */
  const raw=out?.response??out?.choices?.[0]?.message?.content??'';
  let list=Array.isArray(raw)?raw:[];
  if(!list.length){const text=String(raw).replace(/<think>[\s\S]*?<\/think>/g,''),start=text.indexOf('['),end=text.lastIndexOf(']');list=start>=0&&end>start?JSON.parse(text.slice(start,end+1)):[];}
  for(const item of Array.isArray(list)?list:[]){const term=typeof item?.term==='string'?item.term.normalize('NFKC').trim():'';const reason=cleanReason(item?.reason);if(result.has(term)&&reason)result.set(term,{reason,ai:true});}
 }catch{}
 return result;
}
/* Game titles (shared by ≥2 of the people who looked a term up) for the AI prompt only; never stored per user. */
async function gamesForTerms(env,week,terms){
 const out=new Map();
 for(const term of terms){const {results}=await env.DB.prepare(`SELECT MAX(g.title) title,COUNT(DISTINCT h.id_hash) n FROM hot_lookups h JOIN leaderboard_users u ON u.id_hash=h.id_hash AND u.share_games=1 JOIN leaderboard_games g ON g.id_hash=h.id_hash WHERE h.week_key=? AND h.term=? GROUP BY g.game_key HAVING n>=2 ORDER BY n DESC LIMIT 3`).bind(week,term).all();if(results.length)out.set(term,results);}
 return out;
}
export async function settleWeek(env,week,now=new Date()){
 if(await env.DB.prepare('SELECT week_key FROM hot_weeks WHERE week_key=?').bind(week).first())return {week,settled:false,reason:'ALREADY_SETTLED'};
 const {results}=await env.DB.prepare('SELECT term,COUNT(DISTINCT id_hash) users,SUM(count) lookups FROM hot_lookups WHERE week_key=? GROUP BY term').bind(week).all();
 const participants=(await env.DB.prepare('SELECT COUNT(DISTINCT id_hash) n FROM hot_lookups WHERE week_key=?').bind(week).first())?.n||0;
 const ranked=rankHot(results,minUsers(env)),t=sec(now),statements=[];
 for(const category of CATEGORIES){
  const list=ranked[category],top=list.slice(0,HOT.cards);
  const reasons=await aiReasons(env,category,top,await gamesForTerms(env,week,top.map(x=>x.term)));
  for(const item of list){const r=reasons.get(item.term);statements.push(env.DB.prepare('INSERT INTO hot_awards(week_key,category,rank,term,users,lookups,reason,reason_ai) VALUES(?,?,?,?,?,?,?,?)').bind(week,category,item.rank,item.term,item.users,item.lookups,r?.reason||'',r?.ai?1:0));}
 }
 statements.push(env.DB.prepare('INSERT INTO hot_weeks(week_key,settled_at,participants) VALUES(?,?,?)').bind(week,t,participants));
 /* raw per-user counts are only needed until the week is settled */
 statements.push(env.DB.prepare('DELETE FROM hot_lookups WHERE week_key<=?').bind(week));
 await env.DB.batch(statements);
 return {week,settled:true,participants,counts:Object.fromEntries(CATEGORIES.map(c=>[c,ranked[c].length]))};
}
/* Cron entry: settle every finished week that still has raw rows (catches up after a missed run). */
export async function settleDue(env,now=new Date()){
 const current=hotWeekKey(now);
 const {results}=await env.DB.prepare('SELECT DISTINCT week_key FROM hot_lookups WHERE week_key<? AND week_key NOT IN (SELECT week_key FROM hot_weeks) ORDER BY week_key').bind(current).all();
 const done=[];for(const r of results)done.push(await settleWeek(env,r.week_key,now));return done;
}
export async function hotWordsGet(url,env){
 const category=url.searchParams.get('category')||'word';if(!CATEGORIES.includes(category))return fail('INVALID_QUERY');
 const asked=url.searchParams.get('week');if(asked&&!/^\d{4}-W\d{2}$/.test(asked))return fail('INVALID_QUERY');
 const {results:weeks}=await env.DB.prepare('SELECT week_key,participants FROM hot_weeks ORDER BY week_key DESC LIMIT 26').all();
 const week=asked||weeks[0]?.week_key||'';
 if(!week||!weeks.some(w=>w.week_key===week))return json({week:week||null,weeks:weeks.map(w=>w.week_key),settled:false,awards:[]});
 const {results}=await env.DB.prepare('SELECT rank,term,users,lookups,reason,reason_ai FROM hot_awards WHERE week_key=? AND category=? ORDER BY rank LIMIT ?').bind(week,category,HOT.top).all();
 return json({week,weeks:weeks.map(w=>w.week_key),settled:true,participants:weeks.find(w=>w.week_key===week)?.participants||0,awards:results.map(r=>({rank:r.rank,term:r.term,users:r.users,lookups:r.lookups,reason:r.rank<=HOT.cards?r.reason:'',ai:r.rank<=HOT.cards&&r.reason_ai===1}))},200,{'cache-control':'public, max-age=600'});
}
