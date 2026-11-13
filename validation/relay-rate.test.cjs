// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 (user: 一直连不上联网服务, 429 for a whole IP): relay limits loosened for reads, Retry-After on every 429,
   signed-in requests counted by token; the app's relay gate caches GETs, honours Retry-After and backs off. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});
 return {prepare:sql=>stmt(sql),raw:db};}
const NOW=new Date('2026-11-10T04:00:30Z');
const req=(headers={})=>new Request('https://relay.test/api/health',{headers:{'cf-connecting-ip':'198.51.100.7',...headers}});

test('relay limits: reads loosened, writes and codes kept strict',async()=>{
 const {RATE}=await load('worker.js');
 assert.deepEqual(RATE.ip,[600,60]);assert.deepEqual(RATE.user,[600,60]);assert.ok(RATE['ip-shared'][0]>=RATE.ip[0]);
 for(const k of ['lb-get','hot','daily','release','social-get','forum-get'])assert.ok(RATE[k][0]/RATE[k][1]>=2,k);
 assert.deepEqual(RATE.feedback,[4,3600]);assert.deepEqual(RATE['forum-post'],[5,3600]);assert.deepEqual(RATE.appeal,[3,86400]);assert.deepEqual(RATE.avatar,[5,3600]);
});

test('a 429 carries Retry-After = seconds left in the window',async()=>{
 const {handle,RATE}=await load('worker.js');const env={DB:d1(),HASH_SALT:'s'};
 let last;for(let i=0;i<=RATE.ip[0];i++)last=await handle(req(),env,NOW);
 assert.equal(last.status,429);assert.equal((await last.json()).error,'RATE_LIMITED');assert.equal(last.headers.get('retry-after'),'30');
});

test('signed-in requests are counted per token, not per shared IP',async()=>{
 const {handle,RATE}=await load('worker.js');const env={DB:d1(),HASH_SALT:'s'};
 for(let i=0;i<RATE.ip[0];i++)await handle(req(),env,NOW);
 assert.equal((await handle(req(),env,NOW)).status,429);
 const signed=await handle(req({authorization:'Bearer mgl_'+'a'.repeat(43)}),env,NOW);
 assert.equal(signed.status,200);
});

test('client gate: GET cache, shared in-flight, Retry-After honoured, backoff on 5xx',async()=>{
 const {createGate}=require('../services/relay-gate.cjs');
 let t=1e6,calls=0,mode='ok';
 const inner=async()=>{calls++;if(mode==='429')return new Response('{"ok":false,"error":"RATE_LIMITED"}',{status:429,headers:{'retry-after':'7'}});
  if(mode==='500')return new Response('x',{status:500});return new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json'}});};
 const g=createGate(inner,{now:()=>t});
 const url='https://api.megulit.com/api/leaderboard?period=week';
 const [a,b]=await Promise.all([g(url),g(url)]);assert.equal(calls,1);assert.deepEqual(await a.json(),{ok:true});assert.deepEqual(await b.json(),{ok:true});
 await g(url);assert.equal(calls,1,'cached within TTL');
 t+=61000;await g(url);assert.equal(calls,2,'TTL over');
 await g('https://example.com/api/x');assert.equal(calls,3,'other hosts pass through');
 mode='429';t+=61000;const r=await g(url);assert.equal(r.status,429);
 const blocked=await g('https://api.megulit.com/api/hotwords');assert.equal(calls,4,'no network while blocked');
 assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'7');assert.equal((await blocked.json()).retryAfter,7);
 t+=8000;mode='500';await g('https://api.megulit.com/api/me');assert.equal(calls,5);
 await assert.rejects(g('https://api.megulit.com/api/me'));assert.equal(calls,5,'backing off after a 5xx');
 t+=3000;mode='ok';await g('https://api.megulit.com/api/me');assert.equal(calls,6);
});

test('client gate: a busy minute on the 排行榜 / 交流 pages stays far under 30 relay calls',async()=>{
 const {createGate}=require('../services/relay-gate.cjs');let t=0,calls=0;
 const g=createGate(async()=>{calls++;return new Response('{}',{status:200});},{now:()=>t});
 const pages=['/api/leaderboard?period=week&metric=seconds','/api/hotwords?category=word','/api/forum?tag=all','/api/following','/api/kindred','/api/news','/api/hotwords/daily'];
 /* 60 page switches in one minute (one a second), each page also asking for the same 10 avatars */
 for(let i=0;i<60;i++){t=i*1000;await g('https://api.megulit.com'+pages[i%pages.length]);for(let k=0;k<10;k++)await g('https://api.megulit.com/api/avatar/'+String(k).padStart(32,'0'));}
 assert.ok(calls<30,'calls '+calls);assert.equal(g.stats().perMinute,calls);
});
