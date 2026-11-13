// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 probe upload on by default, quiet background upload, one probe per game (owner: 默认打开…冷上传…去重).
   Covers: the switches default on; the per-game identity (same game in two folders → same id, different games →
   different ids); the quiet queue (sends once, skips what the relay already has, retries later on failure, does nothing
   when off); the relay keeping one probe per identity (a second upload of an as-good probe adds no row and no blob, a
   better one replaces the stored one and comments on its issue). No game is launched; the relay runs in-process. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const fx=require('./helpers/adapter-fixtures.cjs');
const auto=require('../services/probe-auto.cjs'),pi=require('../services/probe-identity.cjs'),sample=require('../services/adapter-sample.cjs'),d=require('../services/desensitize.cjs');

/* ---- an in-process relay (all migrations, D1 on node:sqlite, R2 in a Map) ------------------------------------------ */
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql),raw:db};}
function r2(){const store=new Map();return {store,put:async(k,b)=>{store.set(k,new Uint8Array(b));},get:async k=>store.has(k)?{body:store.get(k)}:null,delete:async k=>{store.delete(k);}};}
const github=[];
const ENV={DB:d1(),BUCKET:r2(),LINK_SECRET:'link',HASH_SALT:'salt',GITHUB_TOKEN:'gh',GITHUB_REPO:'o/r',fetch:async(url,init)=>{github.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({html_url:'https://github.com/o/r/issues/'+(github.length+6)}),{status:201});}};
let handle;const relay=async()=>handle??=(await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href)).handle;
/* each "user" is its own IP; calls counts every request the app made */
function user(ip){const f=async(url,init={})=>{f.calls++;const h=await relay();return h(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':ip,...(init.headers||{})},body:init.body}),ENV,new Date());};f.calls=0;return f;}
const ENDPOINTS={endpoint:'https://relay.test/api/probe',hasEndpoint:'https://relay.test/api/probe/has'};
const rows=sql=>ENV.DB.raw.prepare(sql).all();
const blobs=()=>[...ENV.BUCKET.store.keys()].filter(k=>k.startsWith('probes/')&&!k.startsWith('probes/parts/'));

/* ---- games ------------------------------------------------------------------------------------------------------------ */
const EXE_A=crypto.randomBytes(3<<20),EXE_B=crypto.randomBytes(400*1024);
function install(r,folder,exe,archives=['data/scene.pak','data/bgm.pak']){const dir=path.join(r,folder);fs.mkdirSync(path.join(dir,'data'),{recursive:true});const file=path.join(dir,'Game.exe');fs.writeFileSync(file,exe);
 for(const a of archives)fs.writeFileSync(path.join(dir,a),crypto.randomBytes(8192));return file;}
const resultOf=(archives=['data/scene.pak','data/bgm.pak'],step='unknown-pack')=>({schema:'megulit.probe-result',version:1,step,detail:'',detected:null,engines:[],lines:0,japaneseLines:0,
 inventory:{files:archives.length+1,bytes:1,ext:{'.pak':archives.length,'.exe':1},archives:archives.map(n=>({name:n,size:8192,magic:'',format:''}))}});
/* a user's MeguLit: one library game whose offline probe failed */
function setup(prefix,{folder,exe=EXE_A,archives,step}={}){const r=fx.root(prefix);const executable=install(r,folder||'Games/'+prefix,exe,archives);
 const res={...resultOf(archives,step),title:'テストゲーム',stamp:'s',at:Date.now()};
 fs.mkdirSync(path.join(r,'data','adapter-probe'),{recursive:true});fs.writeFileSync(path.join(r,'data','adapter-probe','state.json'),JSON.stringify({version:1,run:null,results:{g1:res}}));
 return {root:r,executable,db:fx.db([{id:'g1',title:'テストゲーム',executable}])};}
/* the structural samples the probe worker would take (desensitized, gzip) */
const sampler=n=>async()=>({samples:Array.from({length:n},(_,i)=>{const s=d.sample(Buffer.alloc(4096,i+1),{max:4096,compress:true});return {name:'data/scene.pak',role:'archive',size:4096,head:'0'.repeat(64),sample:s,...d.sampleSizes(s)};}),keys:[]});
const quiet={wait:async()=>{},probeFirst:false};

test('default on: both switches are on with nothing stored; an explicit off is kept and stops everything',async()=>{
 const u=setup('megulit-pa-off-');assert.equal(auto.enabled(u.root),true);
 const rh=require('../services/runtime-harvest.cjs');assert.equal(rh.settings(u.root).enabled,true);
 auto.setEnabled(u.root,false);assert.equal(auto.enabled(u.root),false);
 const f=user('203.0.113.9');const r=await auto.run(u.root,u.db,{...quiet,...ENDPOINTS,fetcher:f,sampler:sampler(1)});
 assert.equal(r.state,'off');assert.equal(f.calls,0,'nothing reaches the network while off');
});

test('identity: the same game in two folders is one id, different games are different ids',()=>{
 const r=fx.root('megulit-pa-id-');const a1=install(r,'C/Games/Konosuba',EXE_A),a2=install(r,'D/ギャルゲ/この素晴らしい',EXE_A),b=install(r,'C/Games/Other',EXE_B),c=install(r,'C/Games/SameEngine',EXE_A,['data/ev.pak','data/sys.pak']);
 const res=resultOf(),id=e=>pi.identity({executable:e,result:res}).id;
 assert.match(id(a1),/^[a-f0-9]{64}$/);assert.equal(id(a1),id(a2),'two folders, same game');
 assert.notEqual(id(a1),id(b),'another exe');
 assert.notEqual(pi.identity({executable:c,result:resultOf(['data/ev.pak','data/sys.pak'])}).id,id(a1),'same engine exe, other archives');
 assert.notEqual(pi.identity({executable:a1,result:{...res,detected:'kirikiri'}}).id,id(a1),'engine is part of it');
 assert.equal(pi.identity({executable:a1,result:res,vndb:'v1234'}).id,id(a1),'the VNDB id is a hint, not part of the id');
 assert.equal(pi.identity({executable:a1,result:res,vndb:'v1234'}).vndb,'v1234');
 assert.equal(pi.identity({executable:path.join(r,'missing.exe'),result:res}).id,'','unreadable exe → no id');
});

test('quiet upload: sent once in the background, the next player of the same game sends nothing, a better probe replaces it',async()=>{
 const u1=setup('megulit-pa-u1-',{folder:'C/Games/A'}),f1=user('198.51.100.1');
 let r=await auto.run(u1.root,u1.db,{...quiet,...ENDPOINTS,fetcher:f1,sampler:sampler(1)});
 assert.deepEqual(r.results,{g1:'sent'});assert.equal(rows('SELECT * FROM probe_bundles').length,1);assert.equal(blobs().length,1);
 const g=rows('SELECT * FROM probe_games');assert.equal(g.length,1);assert.equal(g[0].state,'partial','no runtime findings yet');assert.equal(g[0].items,2);assert.equal(g[0].reporters,1);
 assert.equal(github.filter(x=>x.url.endsWith('/issues')).length,1,'one issue');
 const st=auto.status(u1.root);assert.equal(st.log[0].state,'sent');assert.ok(sample.manifest(u1.root,st.log[0].hash).manifest.length,'the manifest stays viewable as a record');
 /* the same player again: nothing new, no request at all */
 const before=f1.calls;r=await auto.run(u1.root,u1.db,{...quiet,...ENDPOINTS,fetcher:f1,sampler:sampler(1)});assert.deepEqual(r.results,{g1:'skipped'});assert.equal(f1.calls,before);
 /* a second player, other folder: one has-check, no upload; the reporter count goes up */
 const u2=setup('megulit-pa-u2-',{folder:'D/ゲーム/A'}),f2=user('198.51.100.2');
 r=await auto.run(u2.root,u2.db,{...quiet,...ENDPOINTS,fetcher:f2,sampler:sampler(1)});
 assert.deepEqual(r.results,{g1:'known'});assert.equal(f2.calls,1,'only GET /api/probe/has');
 assert.equal(rows('SELECT * FROM probe_bundles').length,1,'no new row');assert.equal(blobs().length,1,'no new blob');assert.equal(rows('SELECT reporters FROM probe_games')[0].reporters,2);
 /* a third player whose probe carries more: it replaces the stored one (still one row, one blob) and comments on the issue */
 const u3=setup('megulit-pa-u3-',{folder:'E/A'}),f3=user('198.51.100.3');const oldBundle=rows('SELECT bundle_id FROM probe_games')[0].bundle_id;
 r=await auto.run(u3.root,u3.db,{...quiet,...ENDPOINTS,fetcher:f3,sampler:sampler(3)});
 assert.deepEqual(r.results,{g1:'sent'});const after=rows('SELECT * FROM probe_games')[0];
 assert.notEqual(after.bundle_id,oldBundle);assert.equal(after.items,4);assert.equal(after.reporters,3);
 assert.equal(rows('SELECT * FROM probe_bundles').length,1,'one probe per game');assert.equal(blobs().length,1);
 assert.equal(github.filter(x=>x.url.endsWith('/issues')).length,1,'no second issue');assert.ok(github.at(-1).url.endsWith('/comments'),'a comment on the first one');
});

test('relay: a second upload of a complete probe is answered duplicate on the first chunk — no row, no blob',async()=>{
 const u=setup('megulit-pa-c-',{exe:EXE_B,step:'low-pairing'}),f=user('198.51.100.20');
 let r=await auto.run(u.root,u.db,{...quiet,...ENDPOINTS,fetcher:f,sampler:sampler(0)});assert.deepEqual(r.results,{g1:'sent'});
 const id=auto.status(u.root).games.g1.identity,row=()=>rows(`SELECT * FROM probe_games WHERE identity='${id}'`)[0];
 assert.equal(row().state,'complete');const bundles=rows('SELECT * FROM probe_bundles').length,stored=blobs().length;
 /* the has-check says complete: the queue would not even prepare it */
 const h=await (await f(ENDPOINTS.hasEndpoint+'?id='+id)).json();assert.equal(h.state,'complete');
 /* forced: the same bundle uploaded again with its identity */
 const prep=await sample.prepare(u.root,u.db,{ids:['g1']});const m=prep.manifest[0];
 const up=await sample.upload(u.root,{hash:prep.hash,fetcher:f,endpoint:ENDPOINTS.endpoint,identity:{id,items:m.probeItems,state:m.probeState}});
 assert.equal(up.state,'duplicate');assert.equal(rows('SELECT * FROM probe_bundles').length,bundles,'no new row');assert.equal(blobs().length,stored,'no new blob');
 assert.equal(rows('SELECT * FROM probe_uploads').length,0,'no chunk kept');assert.equal(row().reporters,2,'only the count');
 /* a bundle that claims an identity it does not carry is refused */
 const other=await sample.upload(u.root,{hash:prep.hash,fetcher:f,endpoint:ENDPOINTS.endpoint,identity:{id:'f'.repeat(64),items:1,state:'complete'}});
 assert.equal(other.state,'failed');assert.equal(other.error,'IDENTITY_MISMATCH');
});

test('failure: offline waits and retries later, never throws; a old client without identity still uploads as before',async()=>{
 const u=setup('megulit-pa-x-',{exe:crypto.randomBytes(9000)});let calls=0;const down=async()=>{calls++;throw new TypeError('fetch failed');};
 let r=await auto.run(u.root,u.db,{...quiet,...ENDPOINTS,fetcher:down,sampler:sampler(1)});assert.deepEqual(r.results,{g1:'offline'});
 const g=auto.status(u.root).games.g1;assert.ok(g.nextAt>Date.now()+auto.RETRY_MIN-5000,'retry later');
 r=await auto.run(u.root,u.db,{...quiet,...ENDPOINTS,fetcher:down,sampler:sampler(1)});assert.deepEqual(r.results,{g1:'skipped'});assert.equal(calls,1,'not hammered');
 /* the manual path (no identity) behaves as it did */
 const prep=await sample.prepare(u.root,u.db,{ids:['g1'],sampler:sampler(1)});const up=await sample.upload(u.root,{hash:prep.hash,fetcher:user('198.51.100.30'),endpoint:ENDPOINTS.endpoint});
 assert.equal(up.state,'uploaded');
});
