// SPDX-License-Identifier: GPL-3.0-or-later
/* E562 adapter packs and desensitized probe uploads (services/adapter-feed.cjs, services/adapter-sample.cjs).

   Public (the app):
     GET  /api/adapters/feed?app=<version>&format=<n>   the packs on offer + withdrawn versions + open probe requests
     GET  /api/adapters/pack/<id>/<version>             one signed pack, as published
     POST /api/adapters/report                          {version:1,reports:[{pack,packVersion,key,state,before,after,app,
                                                        verdict?,origin?}]} (verdict solved|read|partial|failed and origin
                                                        runtime|probe are optional, E596; kept with the after numbers)
     POST /api/probe                                    one chunk {version:1,upload,part,parts,size,sha256,data(base64)}
                                                        the last chunk verifies and stores the bundle and enqueues a Seed evidence draft
                                                        2026-11-14 optional identity, items, state (complete|partial|
                                                        failed), vndb on a one-game bundle: one probe per identity
                                                        (probe_games, 0017); a probe that adds nothing is answered
                                                        {ok,duplicate:true} on the first chunk and only bumps reporters
     GET  /api/probe/has?id=<identity>[&seen=1]         {state:none|partial|complete|failed, items}
     GET  /api/probe/download/<id>?exp=&sig=            the bundle (HMAC-signed link, like diagnostics)
   Maintainer (Authorization: Bearer ADAPTER_ADMIN_TOKEN, a wrangler secret):
     POST /api/adapters/publish        {pack}            store a signed pack (the app checks the signature; the relay
                                                        cannot sign, so a relay breach cannot push a pack)
     POST /api/adapters/withdraw       {id,version}      off the feed; apps that use it roll back
     POST /api/adapters/probe-request  {id,keys:[...]}   ask those games for a fresh probe; {id,close:true} ends it
     GET  /api/adapters/reports?pack=  the before/after numbers */
import {probeFullRoute} from './probe-full.js';
import {enqueueProbeDrafts,probeDraft} from './probe-seed.js';
import {legacyProbeDisposition,closeReceiptIssue} from './probe-issues.js';
import {settle,trackIssue,repoFor} from './issue-trackers.js';
const HEX64=/^[a-f0-9]{64}$/,ID=/^[a-z0-9][a-z0-9-]{2,63}$/,SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export const ADAPTER_LIMITS={pack:256*1024,bundle:8*1024*1024,chunk:512*1024,parts:16,reports:50,keys:200,feed:300};
const encoder=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(bytes){return hex(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?encoder.encode(bytes):bytes));}
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
function same(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const admin=(request,env)=>!!env.ADAPTER_ADMIN_TOKEN&&same(request.headers.get('authorization')||'','Bearer '+env.ADAPTER_ADMIN_TOKEN);
const nums=o=>({lines:Math.max(0,Math.min(1e8,o?.lines|0)),japanese:Math.max(0,Math.min(1e8,o?.japanese|0)),total:Math.max(0,Math.min(1e8,o?.total|0)),paired:Math.max(0,Math.min(1e8,o?.paired|0))});
/* 2026-11-26 a stored probe gets a detail issue again, closed at once and listed in the [适配探针] 汇总 tracker under its
   reason (issue-trackers.js). Its first line is not the legacy intro ("MeguLit desensitized probe uploaded through the
   relay"), so the issue webhook and tools/github-issue-event.mjs leave it alone: the Seed drafts are queued here. */
const md=t=>String(t??'').replace(/[\\`*_{}[\]()#+!|<>@]/g,c=>'\\'+c).replace(/[\r\n]+/g,' ').slice(0,200);
const PROBE_SECTIONS={'chinese-build':'中文版（按规矩回复后关闭即可）','parse-failed':'解析失败','decrypt-failed':'解密失败'},MULTI_SECTION='同一用户多部游戏（原 issue 里有逐部勾选）';
export function probeDetail(bundle,{link,days,sha,size}){
 const games=bundle.games,steps=[...new Set(games.map(g=>String(g.step||'unknown')))];
 const name=games.length===1?String(games[0].title||'未知游戏').slice(0,80):`${games.length} 部游戏：${games.slice(0,8).map(g=>String(g.title||'未知游戏').slice(0,40)).join(' / ')}`;
 const lines=['MeguLit probe received by the relay (desensitized: no game text, every natural-language character was replaced locally and checked before upload).','',
  `- App: ${md(bundle.app||'?')}`,`- Created: ${md(bundle.createdAt||'?')}`,`- Games: ${games.length}`,`- Size: ${size} bytes`,`- SHA-256: \`${sha}\``,''];
 if(games.length>1)lines.push(...games.slice(0,30).map(g=>`- [ ] ${md(g.title||'(title not shared)')} · ${md(g.step)}`),'');
 for(const g of games.slice(0,30))lines.push(`### ${md(g.title||'(title not shared)')}`,`- key: \`${String(g.key||'').slice(0,64)}\``,...(HEX64.test(String(g.identity||''))?[`- identity: \`${g.identity}\``]:[]),`- step: **${md(g.step)}** ${md(g.detail||'')}`,`- reader: ${md(g.detected||'none')} · lines ${g.lines|0} · Japanese ${g.japaneseLines|0}${g.pairing?` · pairing ${g.pairing.paired|0}/${g.pairing.total|0}`:''}`,
  `- archives: ${(Array.isArray(g.inventory?.archives)?g.inventory.archives:[]).slice(0,6).map(a=>md(a?.name)+' '+md(a?.format||a?.magic)).join(', ')||'-'}`,`- engines tried: ${(Array.isArray(g.engines)?g.engines:[]).map(e=>md(e?.id)+(e?.error?' ('+md(e.error)+')':'')).slice(0,10).join(', ')||'-'}`,'');
 lines.push(`Download (expires in ${days} days): ${link}`,'','Answer with a pack: `node tools/adapter-pack.cjs sign …` then `publish`; ask for a fresh probe with `probe-request`.');
 return {name,title:`[适配探针] ${games.length===1?name:games.length+' 个游戏'} · ${steps.join(', ')}`.slice(0,200),body:lines.join('\n').slice(0,60000),
  section:games.length>1?MULTI_SECTION:PROBE_SECTIONS[steps[0]]||String(steps[0]).replace(/[^\w-]/g,'').slice(0,40)||'unknown'};}
const b64=s=>{const bin=atob(s);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;};

/* ---- feed / packs ---------------------------------------------------------------------------------------------- */
async function feed(env,url,{json}){
 const rows=(await env.DB.prepare('SELECT id,version,sha256,format,min_app,max_app,requires,size,withdrawn_at FROM adapter_packs ORDER BY id,version').all()).results||[];
 const packs=[],withdrawn=[];for(const r of rows){if(r.withdrawn_at){withdrawn.push({id:r.id,version:r.version});continue;}let requires=[];try{requires=JSON.parse(r.requires);}catch{}
  packs.push({id:r.id,version:r.version,sha256:r.sha256,format:r.format,minApp:r.min_app,...(r.max_app?{maxApp:r.max_app}:{}),requires,size:r.size});}
 const probes=((await env.DB.prepare('SELECT id,keys,kind FROM adapter_probe_requests WHERE closed_at IS NULL ORDER BY created_at DESC LIMIT 20').all()).results||[]).map(r=>{let keys=[];try{keys=JSON.parse(r.keys);}catch{}return {id:r.id,keys,kind:r.kind};});
 return json({schema:'megulit.adapter-feed',version:1,packs:packs.slice(-ADAPTER_LIMITS.feed),withdrawn,probes},200,{'cache-control':'public, max-age=300'});}
async function packGet(env,id,version,{fail}){if(!ID.test(id)||!/^\d{1,9}$/.test(version))return fail('NOT_FOUND',404);
 const row=await env.DB.prepare('SELECT body,withdrawn_at FROM adapter_packs WHERE id=? AND version=?').bind(id,Number(version)).first();if(!row||row.withdrawn_at)return fail('NOT_FOUND',404);
 return new Response(row.body,{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});}
/* the relay checks shape only; the apps verify the signature against the keys they ship */
export function validatePack(pack){
 if(!pack||typeof pack!=='object'||Array.isArray(pack))return {ok:false,error:'INVALID_PACK'};
 if(pack.schema!=='megulit.adapter-pack'||!Number.isSafeInteger(pack.format)||pack.format<1)return {ok:false,error:'INVALID_SCHEMA'};
 if(!ID.test(String(pack.id||''))||!Number.isSafeInteger(pack.version)||pack.version<1)return {ok:false,error:'INVALID_ID'};
 if(!SEMVER.test(String(pack.minApp||''))||pack.maxApp!==undefined&&!SEMVER.test(String(pack.maxApp)))return {ok:false,error:'INVALID_APP_RANGE'};
 if(!Array.isArray(pack.requires)||pack.requires.length>64||!pack.requires.every(r=>typeof r==='string'&&/^[a-z0-9:-]{1,60}$/.test(r)))return {ok:false,error:'INVALID_REQUIRES'};
 const s=pack.signature;if(!s||s.alg!=='ed25519'||!/^[A-Za-z0-9_-]{1,20}$/.test(String(s.keyId||''))||!/^[A-Za-z0-9+/=]{40,200}$/.test(String(s.value||'')))return {ok:false,error:'UNSIGNED'};
 return {ok:true};}
async function publish(request,env,now,{json,fail,readJSON}){
 const body=await readJSON(request,ADAPTER_LIMITS.pack*2);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);const pack=body.value?.pack;
 const v=validatePack(pack);if(!v.ok)return fail(v.error);const text=JSON.stringify(pack);if(encoder.encode(text).length>ADAPTER_LIMITS.pack)return fail('PAYLOAD_TOO_LARGE',413);
 const {signature,...unsigned}=pack,digest=await sha256(canonical(unsigned));
 const old=await env.DB.prepare('SELECT sha256 FROM adapter_packs WHERE id=? AND version=?').bind(pack.id,pack.version).first();if(old&&old.sha256!==digest)return fail('VERSION_EXISTS',409);
 await env.DB.prepare('INSERT INTO adapter_packs(id,version,body,sha256,format,min_app,max_app,requires,size,published_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id,version) DO UPDATE SET body=excluded.body,withdrawn_at=NULL')
  .bind(pack.id,pack.version,text,digest,pack.format,pack.minApp,pack.maxApp||'',JSON.stringify(pack.requires),encoder.encode(text).length,Math.floor(now.getTime()/1000)).run();
 return json({ok:true,id:pack.id,version:pack.version,sha256:digest},201);}
async function withdraw(request,env,now,{json,fail,readJSON}){const body=await readJSON(request);const id=String(body.value?.id||''),version=Number(body.value?.version);if(!ID.test(id)||!Number.isSafeInteger(version))return fail('INVALID_ID');
 await env.DB.prepare('UPDATE adapter_packs SET withdrawn_at=? WHERE id=? AND version=?').bind(Math.floor(now.getTime()/1000),id,version).run();return json({ok:true});}
async function probeRequest(request,env,now,{json,fail,readJSON}){const body=await readJSON(request);const v=body.value||{},id=String(v.id||'');if(!ID.test(id))return fail('INVALID_ID');
 if(v.close){await env.DB.prepare('UPDATE adapter_probe_requests SET closed_at=? WHERE id=?').bind(Math.floor(now.getTime()/1000),id).run();return json({ok:true});}
 const keys=Array.isArray(v.keys)?[...new Set(v.keys.filter(k=>HEX64.test(String(k))))].slice(0,ADAPTER_LIMITS.keys):[];if(!keys.length)return fail('INVALID_KEYS');
 await env.DB.prepare("INSERT INTO adapter_probe_requests(id,keys,kind,created_at) VALUES(?,?,'resample',?) ON CONFLICT(id) DO UPDATE SET keys=excluded.keys,closed_at=NULL").bind(id,JSON.stringify(keys),Math.floor(now.getTime()/1000)).run();return json({ok:true,id,keys:keys.length},201);}
async function reportPost(request,env,now,{json,fail,readJSON}){const body=await readJSON(request);const list=body.value?.reports;if(body.value?.version!==1||!Array.isArray(list)||!list.length||list.length>ADAPTER_LIMITS.reports)return fail('INVALID_REPORT');
 let accepted=0;for(const r of list){if(!r||!ID.test(String(r.pack||''))||!Number.isSafeInteger(r.packVersion)||!HEX64.test(String(r.key||''))||!['kept','rolled-back','not-used'].includes(r.state))continue;
  await env.DB.prepare('INSERT INTO adapter_reports(pack,pack_version,game_key,state,before_json,after_json,app,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(pack,pack_version,game_key) DO UPDATE SET state=excluded.state,before_json=excluded.before_json,after_json=excluded.after_json,app=excluded.app,reporters=reporters+1,updated_at=excluded.updated_at')
   .bind(r.pack,r.packVersion,r.key,r.state,JSON.stringify(nums(r.before)),JSON.stringify({...nums(r.after),...(['solved','read','partial','failed'].includes(r.verdict)?{verdict:r.verdict}:{}),...(['runtime','probe'].includes(r.origin)?{origin:r.origin}:{})}),String(r.app||'').replace(/[^0-9A-Za-z.-]/g,'').slice(0,40),Math.floor(now.getTime()/1000)).run();accepted++;}
 return json({ok:true,accepted});}
async function reportsGet(env,url,{json}){const pack=url.searchParams.get('pack');const rows=pack&&ID.test(pack)?(await env.DB.prepare('SELECT * FROM adapter_reports WHERE pack=? ORDER BY updated_at DESC LIMIT 500').bind(pack).all()).results:(await env.DB.prepare('SELECT * FROM adapter_reports ORDER BY updated_at DESC LIMIT 500').all()).results;
 return json({ok:true,reports:(rows||[]).map(r=>({pack:r.pack,packVersion:r.pack_version,key:r.game_key,state:r.state,before:JSON.parse(r.before_json),after:JSON.parse(r.after_json),app:r.app,reporters:r.reporters,updatedAt:r.updated_at}))});}

/* ---- probe uploads --------------------------------------------------------------------------------------------- */
/* ---- one probe per game (2026-11-14, owner: 去重) ------------------------------------------------------------------ */
const PROBE_STATES=['complete','partial','failed'];
function dedupeOf(v,app=''){if(!HEX64.test(String(v.identity||'')))return null;
 return {identity:v.identity,app:/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(String(app||''))?String(app):'',items:Math.max(0,Math.min(10000,Number(v.items)|0)),state:PROBE_STATES.includes(v.state)?v.state:'partial',vndb:/^v[1-9]\d{0,7}$/.test(String(v.vndb||''))?v.vndb:''};}
/* the new probe is worth keeping over the stored one: the stored one failed or is missing items */
/* a.b.c numeric compare; '' sorts lowest */
export function newerApp(a,b){const p=x=>String(x||'').split('.').map(Number);const x=p(a),y=p(b);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;}
/* rows stored before the app column read as 1.4.12: every probe issue then open was filed by 1.4.12 or older */
export const APP_BEFORE_COLUMN='1.4.12';
export function betterProbe(stored,next){if(!stored)return true;if(next.app&&newerApp(next.app,stored.app||APP_BEFORE_COLUMN))return true;if(stored.state==='complete')return false;
 if(stored.state==='failed')return next.state!=='failed'||next.items>stored.items;
 return next.state==='complete'||next.items>stored.items;}
const storedProbe=(env,id)=>env.DB.prepare('SELECT bundle_id,state,items,issue_url,app FROM probe_games WHERE identity=?').bind(id).first();
const bump=(env,id,t)=>env.DB.prepare('UPDATE probe_games SET reporters=reporters+1,updated_at=? WHERE identity=? RETURNING reporters').bind(t,id).first();
/* GET /api/probe/has: one row read; seen=1 (once per app and game) bumps reporters */
async function probeHas(env,url,now,{json,fail}){const id=url.searchParams.get('id')||'';if(!HEX64.test(id))return fail('INVALID_ID');
 const row=await env.DB.prepare('SELECT state,items FROM probe_games WHERE identity=?').bind(id).first();
 if(row&&url.searchParams.get('seen')==='1')await bump(env,id,Math.floor(now.getTime()/1000));
 return json({ok:true,state:row?.state||'none',items:row?.items|0});}
async function probeChunk(request,env,ip,now,url,{json,fail,readJSON,ctx}){
 const body=await readJSON(request,Math.ceil(ADAPTER_LIMITS.chunk*4/3)+4096);if(body.error)return fail(body.error,body.error==='PAYLOAD_TOO_LARGE'?413:400);const v=body.value||{};
 if(v.version!==1||!/^[0-9a-f-]{36}$/.test(String(v.upload||''))||!Number.isSafeInteger(v.part)||!Number.isSafeInteger(v.parts)||v.parts<1||v.parts>ADAPTER_LIMITS.parts||v.part<0||v.part>=v.parts||!Number.isSafeInteger(v.size)||v.size<1||v.size>ADAPTER_LIMITS.bundle||!HEX64.test(String(v.sha256||''))||typeof v.data!=='string')return fail('INVALID_CHUNK');
 let bytes;try{bytes=b64(v.data);}catch{return fail('INVALID_CHUNK');}if(bytes.length>ADAPTER_LIMITS.chunk||!bytes.length)return fail('PAYLOAD_TOO_LARGE',413);
 const t=Math.floor(now.getTime()/1000),dd=dedupeOf(v,request.headers.get('x-megulit-version'));
 const receipt=()=>env.DB.prepare('SELECT sha256,ip_hash FROM probe_bundles WHERE id=?').bind(v.upload).first();
 const finish=async (result,status=200)=>await closeReceiptIssue(env,v.upload,now)
  ?json(result,status):fail('PROBE_ISSUE_CLOSE_PENDING',502);
 const prior=await receipt();
 if(prior)return prior.sha256===v.sha256&&prior.ip_hash===ip?finish({ok:true,id:v.upload,duplicate:true}):fail('CHUNK_MISMATCH',409);
 const first=await env.DB.prepare('SELECT parts,size,sha256,ip_hash FROM probe_uploads WHERE upload=? LIMIT 1').bind(v.upload).first();
 if(first&&(first.parts!==v.parts||first.size!==v.size||first.sha256!==v.sha256||first.ip_hash!==ip))return fail('CHUNK_MISMATCH',409);
 /* a new upload of a game the relay already holds an as-good probe of: count the reporter, keep nothing */
 let stored=null;if(dd&&!first){stored=await storedProbe(env,dd.identity);if(stored&&!betterProbe(stored,dd)){const b=await bump(env,dd.identity,t);return json({ok:true,duplicate:true,reporters:b?.reporters|0});}}
 await env.BUCKET.put(`probes/parts/${v.upload}/${v.part}`,bytes);
 await env.DB.prepare('INSERT INTO probe_uploads(upload,part,parts,size,sha256,ip_hash,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(upload,part) DO NOTHING').bind(v.upload,v.part,v.parts,v.size,v.sha256,ip,t).run();
 const have=(await env.DB.prepare('SELECT COUNT(*) AS n FROM probe_uploads WHERE upload=?').bind(v.upload).first())?.n||0;
 if(have<v.parts)return json({ok:true,received:have,parts:v.parts},202);
 /* all parts: assemble, verify, store, enqueue */
 const chunks=[];for(let i=0;i<v.parts;i++){const o=await env.BUCKET.get(`probes/parts/${v.upload}/${i}`);if(!o)return fail('CHUNK_MISSING',409);chunks.push(new Uint8Array(await new Response(o.body).arrayBuffer()));}
 const total=chunks.reduce((n,c)=>n+c.length,0);if(total!==v.size)return fail('SIZE_MISMATCH',409);const all=new Uint8Array(total);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}
 if(await sha256(all)!==v.sha256)return fail('CHECKSUM_MISMATCH',409);
 let bundle;try{bundle=JSON.parse(new TextDecoder().decode(all));}catch{return fail('INVALID_BUNDLE');}
 if(bundle?.schema!=='megulit.probe-bundle'||bundle.version!==1||!Array.isArray(bundle.games)||!bundle.games.length||bundle.games.some(g=>!g||typeof g!=='object'||Array.isArray(g)))return fail('INVALID_BUNDLE');
 if(dd&&(bundle.games.length!==1||bundle.games[0].identity!==dd.identity))return fail('IDENTITY_MISMATCH');
 /* another upload of this game may have finished meanwhile */
 if(dd){stored=await storedProbe(env,dd.identity);if(stored&&!betterProbe(stored,dd)){for(let i=0;i<v.parts;i++){try{await env.BUCKET.delete?.(`probes/parts/${v.upload}/${i}`);}catch{}}
  await env.DB.prepare('DELETE FROM probe_uploads WHERE upload=?').bind(v.upload).run();const b=await bump(env,dd.identity,t);return json({ok:true,duplicate:true,reporters:b?.reporters|0});}}
 const id=v.upload,objectKey=`probes/intake/${id}-${v.sha256}.json`;
 const drafts=await Promise.all(bundle.games.map((g,i)=>probeDraft(g,bundle.app,v.sha256,i)));
 if(encoder.encode(JSON.stringify(drafts)).length>512*1024)return fail('PROBE_QUEUE_LIMIT',413);
 await env.BUCKET.put(objectKey,all,{httpMetadata:{contentType:'application/json'},customMetadata:{sha256:v.sha256}});
 const days=Math.max(1,Math.min(90,Number(env.LINK_DAYS)||30)),expires=t+days*86400;
 const writes=[env.DB.prepare(`INSERT INTO probe_bundles(id,object_key,ip_hash,size,sha256,created_at,expires_at)
   SELECT ?,?,?,?,?,?,? WHERE ?='' OR COALESCE((SELECT bundle_id FROM probe_games WHERE identity=?),'')=?`)
   .bind(id,objectKey,ip,total,v.sha256,t,expires,dd?.identity||'',dd?.identity||'',stored?.bundle_id||''),
  enqueueProbeDrafts(env.DB,drafts,id,now)];
 if(dd)writes.push(env.DB.prepare(`INSERT INTO probe_games(identity,bundle_id,state,items,reporters,vndb,first_at,updated_at,app)
   SELECT ?,?,?,?,1,?,?,?,? WHERE EXISTS (SELECT 1 FROM probe_bundles WHERE id=?)
   ON CONFLICT(identity) DO UPDATE SET bundle_id=excluded.bundle_id,state=excluded.state,items=excluded.items,
     app=CASE WHEN excluded.app<>'' THEN excluded.app ELSE probe_games.app END,
     vndb=CASE WHEN excluded.vndb<>'' THEN excluded.vndb ELSE probe_games.vndb END,updated_at=excluded.updated_at`)
   .bind(dd.identity,id,dd.state,dd.items,dd.vndb,t,t,dd.app,id));
 const disposition=dd&&drafts[0].kind==='probe-skeleton'&&legacyProbeDisposition(env,stored?.issue_url,now,id);
 if(disposition)writes.push(disposition);
 try{await env.DB.batch(writes);}catch(error){
  const committed=await receipt();
  if(!committed)throw error;
  if(committed.sha256!==v.sha256||committed.ip_hash!==ip)return fail('CHUNK_MISMATCH',409);
  return finish({ok:true,id,duplicate:true});
 }
 if(!await receipt())return fail('PROBE_QUEUE_RETRY',503);
 await env.DB.prepare('DELETE FROM probe_uploads WHERE upload=?').bind(id).run();
 for(let i=0;i<v.parts;i++)await env.BUCKET.delete?.(`probes/parts/${id}/${i}`).catch(()=>{});
 // Keep historical issue-linked evidence available for its disposition.
 if(stored?.bundle_id){
  /* 2026-11-26 a bundle whose download a tracker-listed detail issue advertises stays too (issue-trackers.js) */
  const old=await env.DB.prepare("DELETE FROM probe_bundles WHERE id=? AND issue_url='' AND NOT EXISTS (SELECT 1 FROM issue_tracker_entries WHERE id='probe:'||probe_bundles.id) RETURNING object_key").bind(stored.bundle_id).first()
   .catch(error=>/no such table/i.test(error?.message||'')?env.DB.prepare("DELETE FROM probe_bundles WHERE id=? AND issue_url='' RETURNING object_key").bind(stored.bundle_id).first():Promise.reject(error));
  if(old)await env.BUCKET.delete?.(old.object_key).catch(()=>{});
 }
 if(env.GITHUB_TOKEN){const old=/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)$/.exec(String(stored?.issue_url||'')),legacy=old&&old[1]===repoFor(env)?old:null;
  const link=env.LINK_SECRET&&url?`${url.origin}/api/probe/download/${id}?exp=${expires}&sig=${await hmac(env.LINK_SECRET,'probe:'+id+':'+expires)}`:'(LINK_SECRET not set)';
  const detail=probeDetail(bundle,{link,days,sha:v.sha256,size:total});
  await settle(ctx,trackIssue(env,{id:'probe:'+id,tracker:'adapter-probe',name:detail.name,section:detail.section,draft:{title:detail.title,body:detail.body,labels:['adapter-probe']},
   mergeKey:dd?'probe:'+dd.identity:'',mergeRef:legacy?Number(legacy[2]):undefined},now));}
 return finish({ok:true,id,queued:true},201);}
async function probeDownload(url,env,{fail}){const id=url.pathname.split('/').pop()||'',exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig')||'';
 if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isSafeInteger(exp)||!HEX64.test(sig)||!env.LINK_SECRET)return fail('NOT_FOUND',404);
 if(!same(sig,await hmac(env.LINK_SECRET,'probe:'+id+':'+exp)))return fail('NOT_FOUND',404);if(exp<Math.floor(Date.now()/1000))return fail('LINK_EXPIRED',410);
 const row=await env.DB.prepare('SELECT object_key FROM probe_bundles WHERE id=?').bind(id).first();if(!row)return fail('NOT_FOUND',404);const o=await env.BUCKET.get(row.object_key);if(!o)return fail('NOT_FOUND',404);
 return new Response(o.body,{headers:{'content-type':'application/json','content-disposition':`attachment; filename="megulit-probe-${id}.json"`,'cache-control':'private, no-store'}});}

/* router for every path above; null when the path is not one of these */
export async function adaptersRoute(request,env,ip,now,url,path,deps){
 const {fail,hit}=deps,m=request.method;
 if(path==='/api/adapters/feed'&&m==='GET')return await hit(env,'adapt-feed',ip,now.getTime())?feed(env,url,deps):fail('RATE_LIMITED',429);
 const pm=/^\/api\/adapters\/pack\/([a-z0-9-]{3,64})\/(\d{1,9})$/.exec(path);if(pm&&m==='GET')return await hit(env,'adapt-pack',ip,now.getTime())?packGet(env,pm[1],pm[2],deps):fail('RATE_LIMITED',429);
 if(path==='/api/adapters/report'&&m==='POST')return await hit(env,'adapt-report',ip,now.getTime())?reportPost(request,env,now,deps):fail('RATE_LIMITED',429);
 /* 2026-11-15 closed-beta full probes (probe-full.js) */
 if(path.startsWith('/api/probe/full/'))return probeFullRoute(request,env,ip,now,url,path,deps);
 if(path==='/api/probe'&&m==='POST')return await hit(env,'probe',ip,now.getTime())?probeChunk(request,env,ip,now,url,deps):fail('RATE_LIMITED',429);
 /* no rate-limit row here (D1 write budget): the global per-IP limiter covers it */
 if(path==='/api/probe/has'&&m==='GET')return probeHas(env,url,now,deps);
 if(path.startsWith('/api/probe/download/')&&m==='GET')return await hit(env,'diag-dl',ip,now.getTime())?probeDownload(url,env,deps):fail('RATE_LIMITED',429);
 if(['/api/adapters/publish','/api/adapters/withdraw','/api/adapters/probe-request','/api/adapters/reports'].includes(path)){
  if(!admin(request,env))return fail('UNAUTHORIZED',401);
  if(path==='/api/adapters/publish'&&m==='POST')return publish(request,env,now,deps);
  if(path==='/api/adapters/withdraw'&&m==='POST')return withdraw(request,env,now,deps);
  if(path==='/api/adapters/probe-request'&&m==='POST')return probeRequest(request,env,now,deps);
  if(path==='/api/adapters/reports'&&m==='GET')return reportsGet(env,url,deps);
  return fail('METHOD_NOT_ALLOWED',405);}
 if(path.startsWith('/api/adapters/')||path==='/api/probe')return fail('METHOD_NOT_ALLOWED',405);
 return null;}
