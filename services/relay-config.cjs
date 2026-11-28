// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E377 one place for the online relay's base URL (Cloudflare Worker on the maintainer's own domain, see relay/README.md).

   relayBase(root) → 'https://relay.example.com' (no trailing slash) or '' when not configured.
   Order: MEGULIT_RELAY_BASE env → Settings 联网服务 · 服务地址 (data/config/online.json "relayUrl") → DEFAULT_RELAY_BASE.
   DEFAULT_RELAY_BASE is the maintainer's relay (api.megulit.com); MEGULIT_RELAY_BASE=off drops that built-in default, so only an address saved in Settings is used (tests use it).
   Only https, or http for localhost (local wrangler dev). Credentials, query and fragment are rejected.

   Endpoints on that base (relay/src/worker.js):
     POST /api/diagnostics            multipart meta + package (or file)
     POST /api/adaptation             {version:1,records:[...]}     POST /api/adaptation/query {version:1,keys:[...]}
     GET  /api/adaptation?fp=a,b
     POST/GET/DELETE /api/leaderboard
   endpoint(root,'/api/diagnostics') joins them, '' when not configured. */
const fs=require('node:fs'),path=require('node:path');
const DEFAULT_RELAY_BASE='https://api.megulit.com';
/* tests never reach the live relays (tools/no-live-relay.cjs) */
if(process.env.NODE_TEST_CONTEXT)require('../tools/no-live-relay.cjs');
const LOCAL=['127.0.0.1','localhost','[::1]'];
function readJSON(file){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}
const onlineFile=root=>path.join(root,'data','config','online.json');
function normalizeBase(value){
 if(typeof value!=='string'||!value.trim()||value.length>300)return '';let url;try{url=new URL(value.trim());}catch{return '';}
 if(url.username||url.password||url.search||url.hash)return '';
 if(!(url.protocol==='https:'||url.protocol==='http:'&&LOCAL.includes(url.hostname)))return '';
 return url.href.replace(/\/+$/,'');
}
/* 2026-11-12 China speed test (chinaz, 29 mainland nodes): api.megulit.com / megulit.com on Cloudflare's free network timed out
   on 12 nodes and took 2.8 s on average for 14 KB. The same Workers are also served through Tencent EdgeOne (Hong Kong /
   Asia edges, no ICP filing) on cn-*.megulit.com. With no address set by the user, both relay hosts are raced on
   /api/health now and then (at most every 30 min, in the background) and the faster one is used; until a race has
   answered, or when the EdgeOne host is down, it stays api.megulit.com. Same Worker and database behind both. */
const CN_RELAY_BASE='https://cn-api.megulit.com';
const DEFAULT_CANDIDATES=[DEFAULT_RELAY_BASE,CN_RELAY_BASE];
let chosen=DEFAULT_RELAY_BASE,raceAt=0,racing=null,raced=false;
async function timeHealth(base,fetcher,timeout){const t=Date.now();const r=await fetcher(base+'/api/health',{cache:'no-store',signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json().catch(()=>null);if(!j||j.ok!==true)throw new Error('BAD_HEALTH');return Date.now()-t;}
async function raceDefault(options={}){
 const fetcher=options.fetch||fetch,timeout=options.timeout||5000,list=options.candidates||DEFAULT_CANDIDATES;
 const timed=await Promise.all(list.map(base=>timeHealth(base,fetcher,timeout).then(ms=>({base,ms}),()=>null)));
 const ok=timed.filter(Boolean).sort((a,b)=>a.ms-b.ms);
 if(ok.length){chosen=ok[0].base;raced=true;}raceAt=Date.now();return {chosen,results:timed};
}
function maybeRace(env){
 if(env!==process.env||process.env.NODE_TEST_CONTEXT||racing||Date.now()-raceAt<30*60*1000)return;
 raceAt=Date.now();racing=raceDefault().catch(()=>null).finally(()=>{racing=null;});
}
function relayBase(root,env=process.env){
 if(require('../core/owner-tests.cjs').privateMode(root,env))return '';
 const off=String(env.MEGULIT_RELAY_BASE||'').trim().toLowerCase()==='off';
 const fromEnv=normalizeBase(env.MEGULIT_RELAY_BASE||'');if(fromEnv)return fromEnv;
 const saved=root?normalizeBase(readJSON(onlineFile(root)).relayUrl||''):'';if(saved)return saved;
 if(off)return '';maybeRace(env);return normalizeBase(chosen);
}
function endpoint(root,route,env=process.env){const base=relayBase(root,env);return base?base+route:'';}
/* 2026-11-15 one-click sends (logs, feedback) try both built-in relays: cn-api first (国内下载源 rule), unless a health
   race has found api.megulit.com faster; an address from Settings or MEGULIT_RELAY_BASE is the only one used */
function endpoints(root,route,env=process.env){
 const base=relayBase(root,env);if(!base)return [];
 if(!DEFAULT_CANDIDATES.includes(base))return [base+route];
 const first=raced&&chosen===DEFAULT_RELAY_BASE?DEFAULT_RELAY_BASE:CN_RELAY_BASE;
 return [first,...DEFAULT_CANDIDATES.filter(b=>b!==first)].map(b=>b+route);
}
// Only the dedicated Seed callers use these bases. General relay APIs stay disabled in owner tests.
function seedBases(root,permission,env=process.env){
 if(!require('../core/owner-tests.cjs').privateMode(root,env))return module.exports.endpoints(root,'',env);
 if(env.MEGULIT_OFFLINE==='1'||env.MEGULIT_CARDINAL_REPLAY==='1')return [];
 if(permission==='receive'&&env.MEGULIT_OWNER_TORCH_RECEIVE==='1'||
    permission==='report'&&env.MEGULIT_OWNER_SEED_REPORT==='1')return [CN_RELAY_BASE,DEFAULT_RELAY_BASE];
 return [];
}
module.exports={seedBases,endpoints,DEFAULT_RELAY_BASE,CN_RELAY_BASE,raceDefault,relayBase,endpoint,normalizeBase,onlineFile,readJSON};
