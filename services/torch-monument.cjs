// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火碑 (web/torch-monument.js): reads of the relay's monument routes (relay/src/torch-credit.js).
   The page itself cannot reach the network (CSP connect-src is ipc only), so these go through the bridge.

     page(root,{month,cursor,limit})  GET /api/torch/monument   -> {ok,total,month,items:[{torchNo,name,at,game}],next}
     months(root)                     GET /api/torch/months     -> {ok,available,total,months:[{month,n}]}
     find(root,name)                  GET /api/torch/find?name= -> {ok,available,items:[{torchNo,name,at,month}]}
     me(root)                         GET /api/torch/me (verified account session)

   Owner-test installs may read the three public routes from the official hosts. Account tokens are excluded in owner-test mode.
   A route the relay does not have yet (404 NOT_FOUND) answers available:false so the page hides its button.
   `at` is unix seconds as the relay stores it. Names are cut to 30 characters (the relay's own limit). */
const fs=require('fs'),path=require('path');
const relay=require('./relay-config.cjs'),owner=require('../core/owner-tests.cjs');
const TIMEOUT=12000,NAME_MAX=30,GAME_MAX=120;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const PUBLIC_ROUTES=new Set(['/api/torch/monument','/api/torch/months','/api/torch/find']);
function endpoints(root,route,env,isolated){
 if(env.MEGULIT_OFFLINE==='1'||env.MEGULIT_CARDINAL_REPLAY==='1')return [];
 if(isolated){
  if(!PUBLIC_ROUTES.has(route.split('?')[0]))return [];
  return [relay.CN_RELAY_BASE+route,relay.DEFAULT_RELAY_BASE+route];
 }
 return relay.endpoints(root,route,env);
}
const BAD_CP=c=>c<32||c===127||c===0x2028||c===0x2029||(c>=0x202a&&c<=0x202e)||(c>=0x2066&&c<=0x2069);
function cleanText(v,max){if(typeof v!=='string')return null;const t=[...v].map(ch=>BAD_CP(ch.codePointAt(0))?' ':ch).join('').replace(/\s+/g,' ').trim();
 const c=[...t].slice(0,max).join('').trim();return c||null;}
const seconds=v=>{if(Number.isFinite(v))return v>1e12?Math.floor(v/1000):Math.floor(v);if(typeof v==='string'&&v){const t=Date.parse(v);return Number.isFinite(t)?Math.floor(t/1000):0;}return 0;};
const monthOf=at=>at>0?new Date(at*1000).toISOString().slice(0,7):'';
const {displayAlias}=require('../core/torch-alias.cjs');
function cleanItem(r){if(!r||typeof r!=='object')return null;const no=r.torchNo;
 if(typeof no!=='number'&&(typeof no!=='string'||!/^\d+$/.test(no)))return null;
 const n=Number(no);if(!Number.isSafeInteger(n)||n<0)return null;const at=seconds(r.at);
 const name=cleanText(r.name,NAME_MAX);
 return {torchNo:n,name,...(!name?{alias:displayAlias(cleanText(r.alias,NAME_MAX),n)}:{}),at,game:cleanText(r.game,GAME_MAX),...(/^v\d{1,7}$/.test(r.gameVndb)?{gameVndb:r.gameVndb}:{}),month:MONTH.test(String(r.month||''))?r.month:monthOf(at)};}
/* GET on each relay host in turn: {status:'ok',json} | {status:'missing'} (route not deployed) | {status:'failed'} */
async function get(root,route,{fetch:fetcher=globalThis.fetch,env=process.env}={}){if(!fetcher)return {status:'failed'};let missing=false;
 const isolated=owner.privateMode(root,env);
 const request={method:'GET',headers:{'user-agent':'MeguLit',accept:'application/json'},...(isolated?{redirect:'error',credentials:'omit'}:{})};
 for(const url of endpoints(root,route,env,isolated)){try{const init={...request,signal:AbortSignal.timeout(TIMEOUT)};const r=route==='/api/torch/me'&&!isolated?await require('./account.cjs').torchRequest(root,url,init,fetcher):await fetcher(url,init);
   if(route==='/api/torch/find?name='&&r.status===400&&(await r.json())?.error==='INVALID_NAME')return {status:'ok',json:{items:[]}};
   if(r.status===404){let j=null;try{j=await r.json();}catch{}if(!j||j.error==='NOT_FOUND'){missing=true;continue;}}
   if(!r.ok)continue;const text=await r.text();if(text.length>2*1024*1024)continue;const j=JSON.parse(text);if(j&&j.ok===true)return {status:'ok',json:j};}catch{}}
 return {status:missing?'missing':'failed'};}
/* 2026-11-29 the stele showed only "cannot reach the server" when the relay was down. Each page that arrives is kept in
   cache/torch-monument.json (the last CACHE_KEEP pages by query); when no host answers, the same query is served from there
   with cached:true and the page keeps retrying quietly. A route that is not deployed is not served from the cache. */
const CACHE_KEEP=24;
const cacheFile=root=>path.join(root,'cache','torch-monument.json');
function readCache(root){try{const c=JSON.parse(fs.readFileSync(cacheFile(root),'utf8'));return c&&typeof c==='object'&&!Array.isArray(c)?c:{};}catch{return {};}}
function keepPage(root,key,value){
 try{
  const c=readCache(root);delete c[key];c[key]={...value,cachedAt:Math.floor(Date.now()/1000)};
  const keys=Object.keys(c);for(const k of keys.slice(0,Math.max(0,keys.length-CACHE_KEEP)))delete c[k];
  const file=cacheFile(root),tmp=file+'.'+process.pid+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(c));fs.renameSync(tmp,file);
 }catch{}
}
function cachedPage(root,key){
 const c=readCache(root)[key];if(!c||!Array.isArray(c.items))return null;
 return {ok:true,cached:true,cachedAt:Math.max(0,Number(c.cachedAt)|0),total:Math.max(0,Number(c.total)|0),month:MONTH.test(String(c.month||''))?c.month:null,
  items:c.items.map(cleanItem).filter(Boolean).slice(0,500),...(typeof c.hasPrevious==='boolean'?{hasPrevious:c.hasPrevious}:{}),next:/^d{1,12}$/.test(String(c.next??''))?String(c.next):null};
}
async function page(root,{month='',cursor='',before='',limit=300}={},opts={}){
 const q=new URLSearchParams();if(MONTH.test(String(month||'')))q.set('month',month);if(/^\d{1,12}$/.test(String(cursor??'')))q.set('cursor',String(cursor));
 if(/^\d{1,12}$/.test(String(before)))q.set('before',String(before));
 q.set('limit',String(Math.max(1,Math.min(500,Math.trunc(Number(limit)||300)))));
 const key=q.toString(),r=await get(root,'/api/torch/monument?'+key,opts);
 if(r.status==='failed'){const kept=cachedPage(root,key);if(kept)return kept;}
 if(r.status!=='ok')return {ok:false,error:r.status==='missing'?'NOT_DEPLOYED':'OFFLINE'};
 const items=(Array.isArray(r.json.items)?r.json.items:[]).map(cleanItem).filter(Boolean).slice(0,500);
 const out={ok:true,total:Math.max(0,Number(r.json.total)|0),month:MONTH.test(String(r.json.month||''))?r.json.month:null,items,...(typeof r.json.hasPrevious==='boolean'?{hasPrevious:r.json.hasPrevious}:{}),next:/^\d{1,12}$/.test(String(r.json.next??''))?String(r.json.next):null};
 keepPage(root,key,out);
 return out;}
async function months(root,opts={}){const r=await get(root,'/api/torch/months',opts);if(r.status==='missing')return {ok:true,available:false,months:[]};if(r.status!=='ok')return {ok:false,error:'OFFLINE',available:true,months:[]};
 const list=(Array.isArray(r.json.months)?r.json.months:[]).filter(m=>m&&MONTH.test(String(m.month))&&Number(m.n)>0).map(m=>({month:m.month,n:Number(m.n)|0})).sort((a,b)=>a.month<b.month?-1:1);
 return {ok:true,available:true,total:Math.max(0,Number(r.json.total)|0),months:list};}
/* with no name (the page asking whether the route exists): the relay answers 400 INVALID_NAME when it has /find, 404 NOT_FOUND when not */
async function find(root,name,opts={}){const q=cleanText(String(name||''),NAME_MAX);
 const r=await get(root,'/api/torch/find?name='+encodeURIComponent(q||''),opts);if(r.status==='missing')return {ok:true,available:false,items:[]};if(r.status!=='ok')return {ok:false,error:'OFFLINE',available:true,items:[]};
 return {ok:true,available:true,items:(Array.isArray(r.json.items)?r.json.items:[]).map(cleanItem).filter(Boolean).slice(0,50)};}
// Only an authenticated roster response can attribute an inscription to the current account.
async function me(root,opts={}){
 const r=await get(root,'/api/torch/me',opts);
 const available=r.status==='ok'&&r.json.rosterVersion===2;
 const items=available&&Array.isArray(r.json.items)?r.json.items.map(cleanItem).filter(Boolean).slice(0,500):[];
 return {ok:r.status!=='failed',available,items};
}
module.exports={page,months,find,me,cleanItem,NAME_MAX};
