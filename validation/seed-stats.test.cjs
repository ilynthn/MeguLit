// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 dashboard fixes (relay/src/probe-stats.js, seed-stats.js, dashboard.js). Covers: ready probe packs over
   2 GiB no longer wrap to a negative storedMB (the int32 `|0` overflow that crashed the dashboard render and showed as
   "failed on every node"); one failing stats section leaves the rest and reports itself in errors{}; THE SEED counts
   games / versions / status from the repository tree + one GraphQL call, skips GraphQL when the tree is unchanged, and
   sums every source (github + a future community source). Relay in-process, fake GitHub, no network. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');

const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)||0}};}});return {prepare:sql=>stmt(sql),raw:db};}
function env(extra={}){return {DB:d1(),BUCKET:{},LINK_SECRET:'link',HASH_SALT:'salt',...extra};}
const mod=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const stats=async(ENV,tasks=[])=>{const {handle}=await mod('worker.js');return handle(new Request('https://relay.test/api/probe/stats'),ENV,new Date(),{waitUntil:p=>tasks.push(p)});};

/* a fake GitHub: tree of The Seed/ + GraphQL blobs by oid */
function fakeGitHub(games,{sha='tree1'}={}){const calls={tree:0,graphql:0};
 const tree=[{path:'README.md',sha:'r',type:'blob'},{path:'The Seed/README.md',sha:'sr',type:'blob'}];
 games.forEach((g,i)=>{tree.push({path:`The Seed/eng/g${i}/game.json`,sha:'oid'+i,type:'blob'});for(const v of g.versions||[])tree.push({path:`The Seed/eng/g${i}/versions/${v}.json`,sha:'v'+v,type:'blob'});});
 const fetch=async(url,init={})=>{url=String(url);
  if(url.includes('/git/trees/')){calls.tree++;return new Response(JSON.stringify({sha,tree,truncated:false}),{status:200});}
  if(url.endsWith('/graphql')){calls.graphql++;const q=JSON.parse(init.body).query,repo={};
   for(const m of q.matchAll(/(g\d+):object\(oid:"oid(\d+)"\)/g))repo[m[1]]={text:JSON.stringify({schema:'megulit.game-diff',status:games[+m[2]].status})};
   return new Response(JSON.stringify({data:{repository:repo}}),{status:200});}
  return new Response('{}',{status:404});};
 return {fetch,calls};}

test('probe packs over 2 GiB: storedMB stays positive (no int32 wrap)',async()=>{
 const ENV=env(),big=600*1024*1024;
 for(let i=0;i<6;i++)ENV.DB.raw.exec(`INSERT INTO probe_full(identity,upload,object_key,sha256,size,parts,state,title,step,created_at,updated_at,expires_at,reporters) VALUES('${String(i).repeat(64)}','u${i}','k${i}','${'d'.repeat(64)}',${big},1,'ready','t${i}','ok',0,0,9999999999,1)`);
 const s=await (await stats(ENV)).json();
 assert.equal(s.full.ready,6);assert.ok(s.full.storedMB>3000,'3.6 GB of ready packs, got '+s.full.storedMB);
 assert.deepEqual(s.errors,{});
});

test('one failing section does not take the response down',async()=>{
 const ENV=env();ENV.DB.raw.exec('DROP TABLE seed_stats');/* e.g. the D1 migration not applied yet */
 const r=await stats(ENV);assert.equal(r.status,200);const s=await r.json();
 assert.equal(s.seed,null);assert.match(s.errors.seed,/seed_stats/);
 assert.ok(s.ext&&s.quota&&typeof s.online==='number','other sections present');
});

test('THE SEED: tree + one GraphQL call → games, versions, confirmed, waiting; unchanged tree skips GraphQL',async()=>{
 const games=[{status:'verified',versions:['a1']},{status:'verified',versions:['a2']},{status:'owner-ok'},{status:'read',versions:['a3']},{status:'skeleton',versions:['a4','a5']},{status:'skeleton'},{status:'weird'}];
 const gh=fakeGitHub(games);const ENV=env({fetch:gh.fetch,GITHUB_TOKEN:'t',GITHUB_REPO:'o/r'});
 const {refreshSeedStats,seedSummary,putSeedStats}=await mod('seed-stats.js');
 const d=await refreshSeedStats(ENV,new Date());
 assert.equal(d.games,7);assert.equal(d.versions,5);assert.deepEqual(d.status,{verified:2,'owner-ok':1,read:1,skeleton:2});assert.equal(d.other,1);
 assert.equal(gh.calls.tree,1);assert.equal(gh.calls.graphql,1,'all game.json in one GraphQL call');
 await refreshSeedStats(ENV,new Date());assert.equal(gh.calls.tree,2);assert.equal(gh.calls.graphql,1,'same tree sha → no GraphQL');
 let s=await seedSummary(ENV);assert.equal(s.confirmed,3);assert.equal(s.waiting,3);assert.equal(s.sources.length,1);
 /* a later community source is summed in */
 await putSeedStats(ENV,'community',{games:2,versions:2,status:{skeleton:2}});
 s=await seedSummary(ENV);assert.equal(s.games,9);assert.equal(s.waiting,5);assert.deepEqual(s.sources.map(x=>x.source),['community','github']);
 /* and it reaches the public stats payload, aggregate only */
 const p=await (await stats(ENV)).json();assert.equal(p.seed.games,9);assert.equal(p.seed.confirmed,3);
 assert.doesNotMatch(JSON.stringify(p.seed),/oid\d|The Seed\/eng/,'no paths or blob ids in the payload');
});

test('THE SEED: empty table → first stats call kicks a background refresh; the cron wires it too',async()=>{
 const gh=fakeGitHub([{status:'verified'}]);const ENV=env({fetch:gh.fetch,GITHUB_TOKEN:'t'});const tasks=[];
 const s=await (await stats(ENV,tasks)).json();assert.equal(s.seed.games,0);assert.ok(tasks.length>=1);await Promise.all(tasks);
 assert.equal(gh.calls.tree,1);
 const {seedSummary}=await mod('seed-stats.js');assert.equal((await seedSummary(ENV)).confirmed,1);
 assert.match(fs.readFileSync(path.join(relayDir,'src','worker.js'),'utf8'),/refreshSeedStatsSafe\(env/);
});

test('dashboard: gold THE SEED card, full dumps before the request log, meter clamps, panels render isolated, every card names its source',async()=>{
 const {DASHBOARD_HTML:h}=await mod('dashboard.js');
 assert.match(h,/pane s4 gold/);assert.match(h,/--gold:#e2b25c/);assert.match(h,/data-i18n="p\.seed2"/);
 /* full dumps keeps its name (owner 2026-11-21); THE SEED comes first, the request log last */
 assert.ok(h.indexOf('data-i18n="p.seed2"')<h.indexOf('data-i18n="p.full2"')&&h.indexOf('data-i18n="p.full2"')<h.indexOf('data-i18n="p.log2"'));
 assert.match(h,/function safe\(name,fn\)/);assert.match(h,/Math\.min\(100,Math\.max\(0,/);
 /* 2026-11-27 redesign: each data card carries a description and a data-source line */
 const cards=h.match(/<section class="pane s\d+[^"]*">[\s\S]*?<\/section>/g)||[];
 assert.ok(cards.length>=14,'data cards '+cards.length);
 for(const c of cards){assert.match(c,/class="cd"/,'card without description');assert.match(c,/data-i18n="src"/,'card without source');}
 /* zh/en switch: every dictionary key used on the page exists, both languages are filled in, the choice is remembered */
 const {DASH_DICT}=await mod('dashboard-i18n.js');
 for(const m of h.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g))assert.ok(DASH_DICT[m[1]],'missing dictionary key '+m[1]);
 for(const m of h.matchAll(/\bt\("([a-zA-Z0-9.]+)"/g))assert.ok(DASH_DICT[m[1]],'missing dictionary key '+m[1]);
 for(const [k,v] of Object.entries(DASH_DICT)){assert.ok(v[0]&&v[1],'empty text for '+k);}
 assert.match(h,/ml-dash-lang/);
});


test('THE SEED: GraphQL refused → tree counts still shown, the error reaches the panel, next run retries',async()=>{
 const gh=fakeGitHub([{status:'verified',versions:['a']},{status:'skeleton'}]);let deny=true;
 const fetch=async(url,init)=>String(url).endsWith('/graphql')&&deny?new Response(JSON.stringify({errors:[{message:'Resource not accessible by personal access token'}]}),{status:200}):gh.fetch(url,init);
 const ENV=env({fetch,GITHUB_TOKEN:'t'});const {refreshSeedStatsSafe,seedSummary}=await mod('seed-stats.js');
 await refreshSeedStatsSafe(ENV,new Date());let s=await seedSummary(ENV);
 assert.equal(s.games,2);assert.equal(s.versions,1);assert.equal(s.other,2);assert.match(s.errors.github,/not accessible/);assert.equal(s.sources.length,1,'error row is not a source');
 deny=false;await refreshSeedStatsSafe(ENV,new Date());s=await seedSummary(ENV);
 assert.equal(s.confirmed,1);assert.equal(s.waiting,1);assert.equal(s.errors,undefined,'error cleared');
 /* tree down → no throw, error recorded */
 const ENV2=env({fetch:async()=>new Response('x',{status:500}),GITHUB_TOKEN:'t'});assert.equal(await refreshSeedStatsSafe(ENV2,new Date()),null);
 assert.match((await seedSummary(ENV2)).errors.github,/tree HTTP 500/);
});

test('GET /api/seed/stats: public aggregate for the App about page, open CORS, edge cached once counted',async()=>{
 const gh=fakeGitHub([{status:'verified',versions:['a']},{status:'owner-ok'},{status:'read',versions:['b']},{status:'skeleton'}]);
 const ENV=env({fetch:gh.fetch,GITHUB_TOKEN:'t'});const {handle}=await mod('worker.js');const tasks=[];
 const get=()=>handle(new Request('https://relay.test/api/seed/stats'),ENV,new Date(),{waitUntil:p=>tasks.push(p)});
 let r=await get();assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(r.headers.get('cache-control'),'no-store','not counted yet: not cached');
 let j=await r.json();assert.deepEqual(j,{ok:true,games:0,versions:0,confirmed:0,waiting:0,updatedAt:0});
 await Promise.all(tasks);assert.equal(gh.calls.tree,1,'first call counted in the background');
 r=await get();j=await r.json();
 assert.deepEqual(Object.keys(j).sort(),['confirmed','games','ok','updatedAt','versions','waiting']);
 assert.equal(j.games,4);assert.equal(j.versions,2);assert.equal(j.confirmed,2);assert.equal(j.waiting,2);assert.ok(j.updatedAt>0);
 assert.match(r.headers.get('cache-control'),/max-age=300/);
 const hd=await handle(new Request('https://relay.test/api/seed/stats',{method:'HEAD'}),ENV,new Date(),{waitUntil:()=>{}});assert.equal(hd.status,200);assert.equal(await hd.text(),'');assert.equal(hd.headers.get('access-control-allow-origin'),'*');
 assert.equal((await handle(new Request('https://relay.test/api/seed/stats',{method:'POST'}),ENV,new Date(),{waitUntil:()=>{}})).status,404,'read only');
});

test('D1 reads: live stats computed once per LIVE_TTL for every node (stats_snapshot), one probe_pulse scan per compute',async()=>{
 const ENV=env(),raw=ENV.DB;let pulseScans=0;ENV.DB={prepare:sql=>{if(/FROM probe_pulse/.test(sql)&&/^SELECT/.test(sql))pulseScans++;return raw.prepare(sql);},raw:raw.raw};
 const {LIVE_TTL}=await mod('probe-stats.js');const {handle}=await mod('worker.js');
 const at=ms=>handle(new Request('https://relay.test/api/probe/stats'),ENV,new Date(ms),{waitUntil:()=>{}});
 const t0=Date.now();await at(t0);const first=pulseScans;
 assert.ok(first<=2,'one pulse scan in live (+ the hourly one in wide), got '+first);
 await at(t0+5000);await at(t0+60000);assert.equal(pulseScans,first,'within the TTL: snapshot row only');
 await at(t0+(LIVE_TTL+1)*1000);assert.equal(pulseScans,first+1,'after the TTL: live recomputed once, wide still cached');
 assert.equal(raw.raw.prepare("SELECT COUNT(*) n FROM stats_snapshot").get().n,2);
});
