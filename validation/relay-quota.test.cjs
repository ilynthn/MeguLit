'use strict';
/* 2026-11-29 api.megulit.com answered Cloudflare "error code: 1027" (free Workers quota spent) twice in one day.
   The gate holds every relay call until 00:00 UTC and the pages say QUOTA_EXCEEDED instead of retrying. */
const test=require('node:test'),assert=require('node:assert/strict');
const gate=require('../services/relay-gate.cjs');

const quota=()=>new Response('error code: 1027',{status:429,headers:{'content-type':'text/plain; charset=UTF-8'}});

test('a 1027 answer closes the gate for every relay host until 00:00 UTC and says QUOTA_EXCEEDED',async()=>{
 let calls=0;const at=Date.UTC(2026,10,28,15,50);
 const g=gate.createGate(async()=>{calls++;return quota();},{now:()=>at});
 const first=await g('https://api.megulit.com/api/news');
 assert.equal(first.status,429);assert.equal((await first.json()).error,'QUOTA_EXCEEDED');
 for(const url of ['https://cn-api.megulit.com/api/me','https://api.megulit.com/api/sync/words']){
  const r=await g(url);assert.equal(r.status,429);assert.equal((await r.json()).error,'QUOTA_EXCEEDED');
 }
 assert.equal(calls,1,'nothing else goes out while the quota is spent');
 const s=g.stats();assert.equal(s.quota,true);assert.equal(s.quotaUntil,Date.UTC(2026,10,29,0,1));
});

test('an ordinary 429 with Retry-After stays a short RATE_LIMITED block',async()=>{
 let t=Date.UTC(2026,10,28,10);const g=gate.createGate(async()=>new Response('{"ok":false,"error":"RATE_LIMITED"}',{status:429,headers:{'retry-after':'5'}}),{now:()=>t});
 await g('https://api.megulit.com/api/leaderboard');const s=g.stats();assert.equal(s.quota,false);assert.equal(s.blockedFor,5);
});

test('isQuotaBody matches only error 1027',()=>{
 assert.equal(gate.isQuotaBody('error code: 1027'),true);
 assert.equal(gate.isQuotaBody('error code: 1015'),false);
 assert.equal(gate.isQuotaBody('error code: 10270'),false);
});
