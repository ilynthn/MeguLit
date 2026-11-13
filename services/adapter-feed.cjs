// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E562 adapter feed: adapter packs arrive between app releases.
     GET  <relay>/api/adapters/feed?app=<version>&format=<n>
          → {schema:'megulit.adapter-feed',version:1,packs:[{id,version,sha256,format,minApp,maxApp?,requires,size}],
             probes:[{id,keys:['<64 hex>'],kind:'resample'}]}
     GET  <relay>/api/adapters/pack/<id>/<version>   → the signed pack JSON as the maintainer signed it
     POST <relay>/api/adapters/report                {version:1,reports:[{pack,packVersion,key,state,before,after,app}]}
   sync(root): every compatible pack the feed lists is fetched (all of them, not only the ones that match a game here,
   so the relay never learns which games this PC has), checked (sha256 of the canonical body, Ed25519 signature,
   schema, capabilities, app version: adapter-packs.cjs admit) and installed. Then each library game a new or changed
   pack matches is read again: before = the probe / zero-latency numbers, the script index rebuilt with the pack, after =
   the new numbers. A pack that reads fewer lines or pairs worse than before is turned off for that game (rolled back)
   and the game read again without it. The before/after numbers (counts only) go back to the relay with the anonymous
   game key, when 共享适配数据（匿名） is on, so the maintainer sees whether the adaptation is perfect; if not, a new pack
   version or a probe request comes through the next sync without the user doing anything. A probe request for a game
   whose owner allowed follow-ups (adapter-sample.cjs consent) probes and uploads its desensitized structure again; for
   any other game it waits for the user in the 适配总览 dialog.
   start(root) runs sync in a worker thread 3 minutes after start and every 6 hours. */
const fs=require('node:fs'),path=require('node:path'),{Worker,isMainThread,workerData,parentPort}=require('node:worker_threads');
const packs=require('./adapter-packs.cjs');
const TIMEOUT=20000,MAX_PACKS=300,INTERVAL=6*3600000;
const pendingFile=root=>path.join(root,'data','adapter-packs','pending-probes.json');
const resultsFile=root=>path.join(root,'data','adapter-packs','results.json');
function readJSON(file,fallback){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:fallback;}catch{return fallback;}}
function writeJSON(file,v){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,file);}
function base(root){try{return require('./relay-config.cjs').relayBase(root);}catch{return '';}}
async function getJSON(url,fetcher){const r=await fetcher(url,{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)throw Error('HTTP_'+r.status);const text=await r.text();if(text.length>packs.LIMITS.packBytes*4)throw Error('TOO_LARGE');return {text,json:JSON.parse(text)};}
function sharing(root){try{return require('./shared-adaptation.cjs').enabled(root);}catch{return true;}}

/* numbers that describe how well a game reads: lines, Japanese lines, pairing */
function numbers(root,id){let s=null;try{s=readJSON(path.join(root,'data','config','original-text.json'),{})[id];}catch{}const p=s?.patchAlignment?.pairing;
 return {engine:String(s?.runtime?.engine||s?.engine||''),status:String(s?.status||''),lines:s?.runtime?.lines|0,japanese:s?.runtime?.japaneseLines|0,total:p?.total|0,paired:p?.paired|0};}
const rate=n=>n.total?n.paired/n.total:null;
/* E596 whether a game is genuinely solved after the rebuild: with a translation to pair, the pairing rate decides
   (≥ 98 % solved); without one, a full Japanese read is "read"; anything else is partial, nothing read is failed */
function verdict(n){if(!n||!n.lines)return 'failed';const r=rate(n);if(r!==null)return r>=.98?'solved':'partial';return n.japanese>0?'read':'partial';}
/* worse: fewer lines read (by more than 2 %), or a lower pairing rate (by more than half a point), or nothing read now */
function worse(before,after){if(!after.lines&&before.lines)return true;if(before.lines&&after.lines<before.lines*.98)return true;const a=rate(before),b=rate(after);if(a!==null&&b!==null&&b<a-.005)return true;if(a!==null&&b===null&&before.total>0&&after.lines<before.lines)return true;return false;}
/* the library games a pack matches: [{id,title,executable,dir}] */
function matching(db,pack){return require('./adapter-probe.cjs').libraryGames(db).map(g=>({...g,dir:path.dirname(g.executable)})).filter(g=>{try{return fs.existsSync(g.dir)&&packs.match(pack,g.dir)>0;}catch{return false;}});}
/* read one game again (runtime index + the Chinese script search) and give back its numbers */
async function rebuild(root,db,game){const ot=require('./original-text.cjs');try{ot.scanRunning(root,game.id,game.executable);}catch{}try{ot.status(root,db,game.id);}catch{}try{await ot.autoPatch(root,db,game.id,{drives:false});}catch{}return numbers(root,game.id);}
function gameKey(executable){try{return require('./shared-adaptation.cjs').fingerprint(executable)?.key||'';}catch{return '';}}

/* apply(root,db,pack) → reports for the games it matches, rolling it back per game where it made things worse */
async function apply(root,db,pack,{app}={}){
 const out=[],tag=pack.id+'@'+pack.version,store=readJSON(resultsFile(root),{games:{}});
 for(const g of matching(db,pack)){const key=gameKey(g.executable),prev=store.games[g.id];if(prev?.tag===tag)continue;
  /* before: how the game reads right now (with the version this one replaces, if any) */
  const before=numbers(root,g.id);
  packs.enableFor(root,g.dir,tag);let after=await rebuild(root,db,g),state='kept';
  /* the pack must be the reader now; if another engine still wins, it did not take */
  if(!/^adapter-pack$/.test(after.engine)&&(pack.source&&pack.grammar))state='not-used';
  if(state==='kept'&&worse(before,after)){packs.disableFor(root,g.dir,tag);after=await rebuild(root,db,g);state='rolled-back';}
  const origin=pack['x-origin']==='runtime'?'runtime':'probe',v=state==='kept'?verdict(after):state==='not-used'?'failed':verdict(before),r=rate(after);
  store.games[g.id]={tag,state,before,after,verdict:v,origin,rate:r,at:Date.now()};out.push({pack:pack.id,packVersion:pack.version,key,state,before,after,verdict:v,origin,rate:r,app:app||''});
  /* the runtime findings this pack came from learn how it ended */
  if(origin==='runtime')try{require('./runtime-harvest.cjs').noteOutcome(root,g.id,{tag,state,verdict:v,rate:r,lines:after.lines|0});}catch{}}
 writeJSON(resultsFile(root),store);return out;}

async function report(root,reports,fetcher){if(!reports.length||!sharing(root))return {state:'skipped'};const b=base(root);if(!b)return {state:'not-configured'};
 const clean=reports.filter(r=>/^[a-f0-9]{64}$/.test(r.key)).slice(0,50).map(r=>({pack:r.pack,packVersion:r.packVersion,key:r.key,state:r.state,before:{lines:r.before.lines|0,japanese:r.before.japanese|0,total:r.before.total|0,paired:r.before.paired|0},after:{lines:r.after.lines|0,japanese:r.after.japanese|0,total:r.after.total|0,paired:r.after.paired|0},...(['solved','read','partial','failed'].includes(r.verdict)?{verdict:r.verdict}:{}),...(['runtime','probe'].includes(r.origin)?{origin:r.origin}:{}),app:String(r.app||'').slice(0,40)}));
 if(!clean.length)return {state:'skipped'};
 try{const r=await fetcher(b+'/api/adapters/report',{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit'},body:JSON.stringify({version:1,reports:clean}),signal:AbortSignal.timeout(TIMEOUT)});return r.ok?{state:'ok',sent:clean.length}:{state:'error',error:'HTTP_'+r.status};}catch{return {state:'error',error:'NETWORK'};}}

/* probe requests for games here: with consent they run now; the rest wait for the user */
async function probeRequests(root,db,requests,{fetcher}){
 const sample=require('./adapter-sample.cjs'),probe=require('./adapter-probe.cjs'),consent=sample.consent(root),pending=readJSON(pendingFile(root),{requests:{}});
 const games=probe.libraryGames(db).map(g=>({...g,key:gameKey(g.executable)}));const done=[];
 for(const q of (Array.isArray(requests)?requests:[]).slice(0,20)){if(!q||!/^[a-z0-9-]{3,64}$/.test(String(q.id||''))||!Array.isArray(q.keys))continue;
  for(const g of games.filter(x=>x.key&&q.keys.includes(x.key))){if(pending.requests[q.id+':'+g.id]?.state==='sent')continue;
   /* 2026-11-14 the automatic upload switch (on by default) counts as consent for follow-up probes */
   if(!consent[g.key]&&!require('./probe-auto.cjs').enabled(root)){pending.requests[q.id+':'+g.id]={state:'waiting',gameId:g.id,title:g.title,at:Date.now()};continue;}
   await new Promise(res=>{probe.start(root,{prepare:()=>({all:()=>[{id:g.id,title:g.title,executable:g.executable}]})},{ids:[g.id],reason:'request',force:true,budgetMs:5*60000,emit:()=>{}});const t=setInterval(()=>{if(probe.status(root).state!=='running'){clearInterval(t);res();}},500);});
   const prepared=await sample.prepare(root,{prepare:()=>({all:()=>[{id:g.id,title:g.title,executable:g.executable}]})},{ids:[g.id],sampler:probe.sampleInWorker});
   if(prepared.hash){const u=await sample.upload(root,{hash:prepared.hash,fetcher});pending.requests[q.id+':'+g.id]={state:u.state==='uploaded'?'sent':'failed',gameId:g.id,title:g.title,at:Date.now()};done.push(g.id);}
   else pending.requests[q.id+':'+g.id]={state:prepared.empty?'nothing':'failed',gameId:g.id,title:g.title,at:Date.now()};}}
 writeJSON(pendingFile(root),pending);return done;}
function pendingProbes(root){return Object.entries(readJSON(pendingFile(root),{requests:{}}).requests).filter(([,r])=>r.state==='waiting').map(([k,r])=>({request:k.split(':')[0],gameId:r.gameId,title:r.title,at:r.at}));}

/* sync(root,{fetch,db}) → {state,installed:[...],skipped:[...],reports:n,probes:n} */
async function sync(root,{fetch:fetcher=globalThis.fetch,db=null,openDb=null}={}){
 const b=base(root);if(!b)return {state:'not-configured'};const app=packs.appVersion(root),installed=[],skipped=[];let feed;
 try{feed=(await getJSON(b+'/api/adapters/feed?app='+encodeURIComponent(app)+'&format='+packs.FORMAT,fetcher)).json;}catch(e){return {state:'error',error:String(e?.message||e).slice(0,40)};}
 if(feed?.schema!=='megulit.adapter-feed'||!Array.isArray(feed.packs))return {state:'error',error:'BAD_FEED'};
 const st=packs.readState(root),fresh=[];
 for(const e of feed.packs.slice(0,MAX_PACKS)){if(!e||!/^[a-z0-9][a-z0-9-]{2,63}$/.test(String(e.id))||!Number.isSafeInteger(e.version))continue;
  const c=packs.compatible({format:e.format,requires:e.requires,minApp:e.minApp,maxApp:e.maxApp},{app});if(!c.ok){skipped.push({id:e.id,version:e.version,reason:c.reason});continue;}
  if(st.blocked[e.id+'@'+e.version]||packs.installedVersions(root,e.id).includes(e.version))continue;
  try{const {text}=await getJSON(b+'/api/adapters/pack/'+encodeURIComponent(e.id)+'/'+e.version,fetcher);const a=packs.admit(text,{app});
   if(!a.ok){skipped.push({id:e.id,version:e.version,reason:a.reason});continue;}if(e.sha256&&a.sha256!==e.sha256){skipped.push({id:e.id,version:e.version,reason:'SHA256'});continue;}
   const r=packs.install(root,text,{app});if(r.ok){installed.push({id:e.id,version:e.version});fresh.push(a.pack);}else skipped.push({id:e.id,version:e.version,reason:r.reason});}
  catch(err){skipped.push({id:e.id,version:e.version,reason:String(err?.message||err).slice(0,30)});}}
 let reports=[],probes=0,own=false;
 if(!db&&openDb){db=openDb();own=true;}
 /* versions the maintainer withdrew: blocked here too, the games they read are read again */
 const withdrawn=(Array.isArray(feed.withdrawn)?feed.withdrawn:[]).filter(w=>w&&/^[a-z0-9][a-z0-9-]{2,63}$/.test(String(w.id))&&Number.isSafeInteger(w.version)).slice(0,MAX_PACKS);
 try{if(db){for(const w of withdrawn){if(packs.readState(root).active[w.id]===w.version)try{await rollback(root,db,w.id,'withdrawn');}catch{}}
  for(const p of fresh){if(packs.readState(root).active[p.id]!==p.version)continue;reports.push(...await apply(root,db,p,{app}));}
   if(Array.isArray(feed.probes)&&feed.probes.length)probes=(await probeRequests(root,db,feed.probes,{fetcher})).length;}}
 finally{if(own)try{db.close();}catch{}}
 const sent=await report(root,reports,fetcher);
 try{packs.noteSync(root,{at:Date.now(),installed:installed.length,skipped:skipped.length,reported:sent.state==='ok'?sent.sent:0});}catch{}
 return {state:'ok',installed,skipped,reports:reports.length,probes};}

/* status for the UI: installed packs, their per-game results, waiting probe requests */
function status(root){const s=packs.readState(root),res=readJSON(resultsFile(root),{games:{}});
 return {active:Object.entries(s.active).map(([id,version])=>({id,version,installed:packs.installedVersions(root,id)})),blocked:Object.keys(s.blocked),games:res.games,pending:pendingProbes(root),sync:s.sync||{}};}
/* manual rollback from the UI: the pack version is blocked everywhere, the games it read are read again */
async function rollback(root,db,id,reason='user'){const r=packs.rollback(root,id,{reason});if(!r.ok)return r;const res=readJSON(resultsFile(root),{games:{}}),games=require('./adapter-probe.cjs').libraryGames(db);
 for(const [gid,x] of Object.entries(res.games)){if(x.tag!==id+'@'+r.from)continue;const g=games.find(y=>y.id===gid);if(g){const after=await rebuild(root,db,g);res.games[gid]={...x,state:'rolled-back',after,at:Date.now()};}}
 writeJSON(resultsFile(root),res);return r;}

/* one sync / rollback in a worker thread, so reading games again never blocks the service: resolves its answer */
function inThread(root,mode,extra={},timeout=30*60000){return new Promise(resolve=>{let w;try{w=new Worker(__filename,{workerData:{root,mode,...extra}});}catch{return resolve({state:'error',error:'WORKER'});}
 const t=setTimeout(()=>{try{w.terminate();}catch{}resolve({state:'error',error:'TIMEOUT'});},timeout);t.unref?.();
 w.once('message',m=>{clearTimeout(t);resolve(m);});w.once('error',()=>{clearTimeout(t);resolve({state:'error',error:'WORKER'});});w.once('exit',()=>{clearTimeout(t);resolve({state:'error',error:'EXIT'});});});}
const syncNow=root=>inThread(root,'sync'),rollbackNow=(root,id)=>inThread(root,'rollback',{id});
function start(root,{delay=180000,interval=INTERVAL}={}){
 if(process.env.MEGULIT_NO_ADAPTER_SYNC||process.env.NODE_TEST_CONTEXT)return null;
 const run=()=>{let w;try{w=new Worker(__filename,{workerData:{root,mode:'sync'}});}catch{return;}w.on('error',()=>{});w.unref();};
 const t=setTimeout(()=>{run();const i=setInterval(run,interval);i.unref?.();},delay);t.unref?.();return t;}
if(!isMainThread&&workerData?.mode==='sync'){const store=require('./store.cjs');sync(workerData.root,{openDb:()=>store.openStore(workerData.root)}).then(r=>parentPort.postMessage(r),()=>parentPort.postMessage({state:'error'}));}
if(!isMainThread&&workerData?.mode==='rollback'){const store=require('./store.cjs');let db;(async()=>{db=store.openStore(workerData.root);return rollback(workerData.root,db,String(workerData.id));})().then(r=>parentPort.postMessage(r),()=>parentPort.postMessage({ok:false,reason:'ERROR'})).finally(()=>{try{db?.close();}catch{}});}
module.exports={syncNow,rollbackNow,inThread,sync,apply,report,worse,verdict,numbers,status,rollback,start,pendingProbes,probeRequests,matching};
