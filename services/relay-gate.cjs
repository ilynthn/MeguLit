// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 (user: MeguLit kept saying 连不上联网服务; api.megulit.com answered 429 RATE_LIMITED to the user's IP for
   over a minute). One gate in front of every call to the relay (api.megulit.com, cn-api.megulit.com, or the address
   saved in Settings), so no single page can flood it:
   - GET answers are kept in memory for a short time per route (same URL + same sign-in = one network call), and two
     identical GETs in flight share one request;
   - a 429 closes the gate for the relay's Retry-After (default 60 s); calls in that time get a local 429 at once,
     with Retry-After, instead of going out and extending the block;
   - network errors and 5xx back off exponentially (2 s, 4 s … 120 s) per host, route and method;
   - a write (POST/PUT/DELETE) that succeeded clears the GET cache, so the page shows what was just changed.
   createGate(fetcher) is the testable core; install() wraps globalThis.fetch once in the service process. */
const DEFAULT_HOSTS=['api.megulit.com','cn-api.megulit.com'];
/* seconds a GET answer is reused; routes not listed (sync, auth, me, health) are never cached */
const TTL=[
 [/^\/api\/avatar\/[0-9a-f]{32}$/,3600],[/^\/api\/news\/img\//,3600],[/^\/api\/forum\/images\//,3600],
 [/^\/api\/release\//,300],[/^\/api\/news(\/article)?$/,300],[/^\/api\/hotwords(\/daily)?$/,300],
 [/^\/api\/leaderboard$/,60],[/^\/api\/adaptation$/,120],
 [/^\/api\/(profile|following|kindred)(\/|$)/,30],[/^\/api\/forum(\/|$)/,20]
];
const ttlFor=pathname=>{for(const[re,s]of TTL)if(re.test(pathname))return s;return 0;};
const MAX_ENTRIES=300;
let required=null;
const requiredStatus=()=>required?{...required}:null;
function headerOf(init,name){const h=init?.headers;if(!h)return '';if(typeof h.get==='function')return h.get(name)||'';const k=Object.keys(h).find(k=>k.toLowerCase()===name);return k?String(h[k]):'';}
function retryAfterSeconds(response){
 const raw=String(response?.headers?.get?.('retry-after')||'').trim();if(!raw)return 60;
 const n=Number(raw);if(Number.isFinite(n))return Math.max(1,Math.min(3600,Math.ceil(n)));
 const at=Date.parse(raw);return Number.isFinite(at)?Math.max(1,Math.min(3600,Math.ceil((at-Date.now())/1000))):60;
}
function limited(seconds){return new Response(JSON.stringify({ok:false,error:'RATE_LIMITED',retryAfter:seconds}),{status:429,headers:{'content-type':'application/json; charset=utf-8','retry-after':String(seconds),'x-megulit-gate':'local'}});}
function createGate(fetcher,options={}){
 const now=options.now||(()=>Date.now()),hosts=options.hosts||(()=>DEFAULT_HOSTS);
 const cache=new Map(),inflight=new Map(),failures=new Map(),sent=[];
 let blockedUntil=0;
 const isRelay=url=>{try{const u=new URL(url);return u.pathname.startsWith('/api/')&&hosts().includes(u.host);}catch{return false;}};
 const count=()=>{const t=now();sent.push(t);while(sent.length&&t-sent[0]>60000)sent.shift();};
 const store=(key,ttl,status,headers,body)=>{cache.delete(key);cache.set(key,{until:now()+ttl*1000,status,headers,body});if(cache.size>MAX_ENTRIES)cache.delete(cache.keys().next().value);};
 const replay=e=>new Response(e.body.length?e.body:null,{status:e.status,headers:e.headers});
 async function gated(input,init={}){
  const url=typeof input==='string'?input:input?.url||String(input);
  if(!isRelay(url))return fetcher(input,init);
  const headers=new Headers(init.headers||(typeof input==='object'?input.headers:undefined));
  const version=options.version?.();if(version)headers.set('x-megulit-version',version);
  init={...init,headers};
  if(required&&/^(POST|PUT|PATCH)$/.test(init.method||input?.method||'GET')&&/^\/api\/(feedback|diagnostics|probe|adapters|contrib|cardinal|game-profile|torch)(\/|$)/.test(new URL(url).pathname))return new Response(JSON.stringify({ok:false,error:'UPDATE_REQUIRED',...required}),{status:426,headers:{'content-type':'application/json','retry-after':'86400'}});
  /* 2026-11-15 (v1.4.10 user could not send logs) a one-click report (一键上传问题反馈: logs + reason) always goes out:
     a 429 or backoff from the background adaptation-contribution chunks used to make it fail at once with a local
     RATE_LIMITED; the relay still rate-limits it itself */
  const {host,pathname:path}=new URL(url),method=String(init.method||input?.method||'GET').toUpperCase();
  const userSend=method==='POST'&&/^\/api\/(diagnostics|feedback)$/.test(path);
  const t=now();if(!userSend&&t<blockedUntil)return limited(Math.ceil((blockedUntil-t)/1000));
  const failureKey=host+' '+method+' '+path;
  const recordFailure=()=>{
   const count=(failures.get(failureKey)?.count||0)+1;
   failures.delete(failureKey);
   failures.set(failureKey,{count,until:now()+Math.min(120,2**count)*1000});
   if(failures.size>MAX_ENTRIES)failures.delete(failures.keys().next().value);
  };
  const ttl=method==='GET'&&init.cache!=='no-store'?ttlFor(path):0;
  const key=ttl?url+'\n'+headerOf(init,'authorization'):'';
  if(key){const hit=cache.get(key);if(hit&&hit.until>t)return replay(hit);if(inflight.has(key))return replay(await inflight.get(key));}
  if(!userSend&&t<(failures.get(failureKey)?.until||0))throw Object.assign(new TypeError('fetch failed'),{cause:{code:'MEGULIT_BACKOFF'}});
  const run=(async()=>{
   count();let r;
   try{r=await fetcher(input,init);}catch(error){if(error?.name!=='TimeoutError'&&error?.name!=='AbortError')recordFailure();throw error;}
   if(r.status===426){try{const body=await r.clone().json();if(body.error==='UPDATE_REQUIRED')required={latest:body.latest||'',minVersion:body.minVersion||'',message:body.message||''};}catch{}}
   if(r.status===429){const s=retryAfterSeconds(r);blockedUntil=Math.max(blockedUntil,now()+s*1000);}
   if(r.status>=500)recordFailure();else failures.delete(failureKey);
   if(method!=='GET'&&r.ok)cache.clear();
   if(!key)return r;
   const body=Buffer.from(await r.arrayBuffer()),headers=[...r.headers.entries()];
   const entry={status:r.status,headers,body};if(r.status===200&&!r.headers.get('x-megulit-token'))store(key,ttl,r.status,headers,body);
   return entry;
  })();
  if(!key)return run;
  inflight.set(key,run);try{return replay(await run);}finally{inflight.delete(key);}
 }
 gated.stats=()=>{const t=now();while(sent.length&&t-sent[0]>60000)sent.shift();return {perMinute:sent.length,blockedFor:Math.max(0,Math.ceil((blockedUntil-t)/1000)),cached:cache.size};};
 gated.reset=()=>{cache.clear();inflight.clear();failures.clear();sent.length=0;blockedUntil=0;};
 return gated;
}
/* hosts: the two built-in relays plus the address saved in Settings, read when a call is made */
function currentHosts(){const out=[...DEFAULT_HOSTS];try{const base=require('./relay-config.cjs').relayBase(process.env.MEGULIT_ROOT||null);if(base)out.push(new URL(base).host);}catch{}return out;}
let installed=null;
function install(){
 if(installed)return installed;if(process.env.NODE_TEST_CONTEXT||typeof globalThis.fetch!=='function')return null;
 const inner=globalThis.fetch.bind(globalThis);installed=createGate(inner,{hosts:currentHosts,version:()=>{try{return require('./shared-adaptation.cjs').appVersion(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT||require('node:path').resolve(__dirname,'..'));}catch{return '';}}});globalThis.fetch=installed;return installed;
}
function stats(){return installed?installed.stats():{perMinute:0,blockedFor:0,cached:0};}
module.exports={createGate,install,stats,ttlFor,retryAfterSeconds,DEFAULT_HOSTS,requiredStatus};
