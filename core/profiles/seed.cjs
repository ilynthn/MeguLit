// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 仓库根目录「The Seed/」是正式产物，随 GitHub main 发布、随安装包内置；以后改游戏只改 seed) the built-in
   game diffs (The Seed/README.md, docs/diff-layers.md "当前权威接口"):
     The Seed/<engine>/<slug>/game.json                  a megulit.game-diff document, layer 'game' (core/game-diff.cjs), key =
                                                         the game identity, prints = pack / script / steam / vndb / title
                                                         (core/game-print.cjs), plus the seed fields status, slug, builds
     The Seed/<engine>/<slug>/versions/<exeSha256>.json  layer 'version', key = the exe's SHA-256, prints = exe / head / pe
   Built-in seeds ship with the code: official, no signature. status says how the client uses a game seed:
     verified / owner-ok   used as the official game layer
     read                  used as the official game layer, in read mode
     skeleton              identity + pinned values only: a low layer (where a repository game file stands), so this PC's
                           calibration goes over it and the self-check gate decides as for any unknown game
   A file that fails check() is left out and listed by errors(); validation/the-seed.test.cjs keeps the folder clean. */
const fs=require('node:fs'),path=require('node:path');
const gameDiff=require('../game-diff.cjs'),gamePrint=require('../game-print.cjs');
const SEED_DIR=path.join(__dirname,'..','..','The Seed');
const SLUG=/^[a-z0-9][a-z0-9-]{1,62}$/,HEX=/^[0-9a-f]{64}$/,ENGINE=/^[a-z0-9]{2,40}$/,STATUS=['verified','owner-ok','read','skeleton'];
const SEED_FIELDS=['status','slug','builds','match','sourceLangs','seedFormat','ext'];
/* 2026-11-21 (owner: seed 格式带版本号和扩展区，向前兼容) seedFormat: the seed format this file was written for (absent = 1).
   ext: an extension area ({<name>: anything}) a client that does not know <name> ignores. Unknown top-level fields and unknown
   settings keys are ignored too (an older client reading a newer seed); known fields and keys are checked strictly. */
const SEED_FORMAT=1;
const GAME_DIFF_FIELDS=new Set(['evidence','schema','version','key','layer','prints','rev','source','mode','settings','exe','engine','app','issuedAt','agree','reporters','cost','signature']);
const {clean,DOMAINS}=require('./domains.cjs');
/* the document as this client understands it: known fields only, settings without unknown keys; ignored = what was left out */
function known(d){const ignored=[],doc={};for(const [k,v] of Object.entries(d)){if(GAME_DIFF_FIELDS.has(k)||SEED_FIELDS.includes(k))doc[k]=v;else ignored.push(k);}
 const c=clean(plain(d.settings)?d.settings:{});const bad=[];for(const r of c.rejected){if(DOMAINS[r])bad.push(r);else ignored.push('settings.'+r);}
 if(plain(d.settings))doc.settings=c.value;return {doc,ignored,bad};}
const LANG=/^[a-z]{2,3}(?:-[A-Za-z]{2,8})*$/;
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
/* a path, a drive, a user folder or an e-mail never belongs in a seed */
const PRIVATE=/[A-Za-z]:[\\/]|\\\\|\/(?:home|Users)\/|\\Users\\|@[a-z0-9-]+\.[a-z]{2,}/i;
const strip=d=>{const o={...d};for(const k of SEED_FIELDS)delete o[k];return o;};
/* {ok, errors[]}; where = {engine, slug} from the folder (game.json) or {file} (versions/<sha>.json) */
function check(d0,{engine,slug,file}={}){const e=[];const bad=m=>e.push(m);
 if(!plain(d0))return {ok:false,errors:['not an object'],ignored:[]};
 const K=known(d0),d=K.doc;for(const k of K.bad)bad('settings '+k+' out of its domain');
 if(d.seedFormat!==undefined&&!(Number.isInteger(d.seedFormat)&&d.seedFormat>=1))bad('seedFormat');
 if(d.ext!==undefined&&!plain(d.ext))bad('ext is an object');
 const isGame=d.layer==='game';
 const v=gameDiff.validate(strip(d));if(!v.ok)bad('game-diff '+v.error+(v.rejected?' '+v.rejected.join(','):''));
 if('signature' in d)bad('a built-in seed is not signed');
 if(!ENGINE.test(String(d.engine||'')))bad('engine');else if(engine&&d.engine!==engine)bad('engine differs from its folder');
 if(isGame){
  if(!STATUS.includes(d.status))bad('status');
  if(!SLUG.test(String(d.slug||'')))bad('slug');else if(slug&&d.slug!==slug)bad('slug differs from its folder');
  if(d.builds!==undefined&&(!Array.isArray(d.builds)||d.builds.length>64||!d.builds.every(b=>HEX.test(b))))bad('builds');
  if(d.mode==='read'!==(d.status==='read'))bad('status read <-> mode read');
  if(d.prints&&['exe','head','pe'].some(k=>k in d.prints))bad('a game seed has no exe prints');
  /* 2026-11-21 (owner: 兼容英文作品 + 多语言译文) the languages the game's own text comes in, BCP 47 ('ja', 'en', 'zh-Hans'); absent = ['ja'] */
  if(d.sourceLangs!==undefined&&(!Array.isArray(d.sourceLangs)||!d.sourceLangs.length||d.sourceLangs.length>8||!d.sourceLangs.every(x=>typeof x==='string'&&LANG.test(x))))bad('sourceLangs');
  /* match: readable names the hashes cannot carry (a renamed Chinese-patch exe, the titles a library may hold) */
  const m=d.match,list=(v,len)=>v===undefined||Array.isArray(v)&&v.length<=20&&v.every(x=>typeof x==='string'&&x&&x.length<=len);
  if(m!==undefined&&(!plain(m)||Object.keys(m).some(k=>!['exe','titles','notTitles'].includes(k))||!list(m.exe,80)||!list(m.titles,120)||!list(m.notTitles,120)||(m.exe||[]).some(x=>/[\/]/.test(x))))bad('match {exe, titles, notTitles}');}
 else{
  if(d.layer!=='version')bad('layer');
  for(const k of SEED_FIELDS)if(k in d)bad(k+' belongs to game.json');
  if(!HEX.test(String(d.key||'')))bad('key');else if(file&&file!==d.key+'.json')bad('file name is not <key>.json');
  if(d.prints&&(d.prints.exe!==undefined&&d.prints.exe!==d.key||['pack','steam','vndb','title'].some(k=>k in d.prints)||d.prints.script&&!d.evidence))bad('a version seed has its own exe prints only');
  if(d.exe&&/[\\/]/.test(d.exe))bad('exe is a file name');}
 if(d.prints!==undefined){const p=gamePrint.check(d.prints);if(Object.keys(p).length!==Object.keys(d.prints).length)bad('prints');}
 if(PRIVATE.test(JSON.stringify(d)))bad('a path, user folder or address');
 /* pinning (docs/diff-layers.md 当前权威接口): a seed pins non-null behaviour keys only; null (the kernel decides), calibrate.* and
    selfCheck.* stay out, or a verified seed would cover this PC's calibration, the shared layers and the gate thresholds */
 const warnings=[];const S=d.settings||{};for(const g of ['calibrate','selfCheck'])if(plain(S[g])&&Object.keys(S[g]).length)warnings.push('pins '+g+'.*');
 const nulls=(o,at)=>{for(const [k,v] of Object.entries(o||{})){const p=at?at+'.'+k:k;if(v===null)warnings.push('pins '+p+' = null');else if(plain(v)&&p!=='lang')nulls(v,p);}};nulls(S,'');
 return {ok:!e.length,errors:e,warnings,ignored:K.ignored,doc:d};}

let cache=null;
function load(dir=SEED_DIR){const games=[],versions=new Map(),errors=[];
 const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));}catch(x){errors.push(path.relative(dir,f)+': '+x.message);return null;}};
 // Publication history has its own signed-chain validator and never supplies profile settings.
 let engines=[];try{engines=fs.readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name!=='history').map(d=>d.name);}catch{return {games,versions,errors,dir};}
 for(const engine of engines){let slugs=[];try{slugs=fs.readdirSync(path.join(dir,engine),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);}catch{}
  for(const slug of slugs){const base=path.join(dir,engine,slug);
   let files=[];try{files=fs.readdirSync(path.join(base,'versions')).filter(f=>f.endsWith('.json'));}catch{}
   for(const f of files){const v0=read(path.join(base,'versions',f));if(!v0)continue;const r=check(v0,{engine,file:f});if(!r.ok){errors.push(engine+'/'+slug+'/versions/'+f+': '+r.errors.join('; '));continue;}const v=r.doc;versions.set(v.key,{...v,slug});}
   const g0=read(path.join(base,'game.json'));if(!g0)continue;const r=check(g0,{engine,slug});if(!r.ok){errors.push(engine+'/'+slug+'/game.json: '+r.errors.join('; '));continue;}const g=r.doc;
   /* builds: its own version files and the shared ones it lists; their exe names also name the game (a generic name only weakly) */
   const builds=[...new Set([...(g.builds||[]),...files.map(f=>f.slice(0,-5))])];
   games.push({key:slug,engine:g.engine,seed:true,...(plain(g.ext)?{ext:g.ext}:{}),status:g.status,seedRev:Number.isInteger(g.rev)?g.rev:null,sourceLangs:g.sourceLangs||['ja'],mode:g.mode,gameId:g.key,prints:g.prints||{},settings:g.settings||{},
    match:{exeSha256:builds,exe:[...new Set([...builds.map(b=>versions.get(b)?.exe).filter(Boolean),...(g.match?.exe||[])])],titles:g.match?.titles||[],notTitles:g.match?.notTitles||[],steamAppId:g.prints?.steam||undefined,prints:g.prints||{}}});}}
 /* a version file filed under one game may serve others (builds): its game is the one that lists it */
 for(const g of games)for(const b of g.match.exeSha256){const v=versions.get(b);if(v&&!v.game)v.game=g.key;}
 /* 2026-11-27 MeguLit-Adapter: game.json ext.versionPrints {<exe sha>: {head, pe, data, pack}} records what else names that build, so
    a patched or renamed exe of the same build still finds its version layer (versionFor; used only when the game's profile says
    source.versionMatch 'prints'). An entry of a version this game does not list, or a malformed print, is left out */
 const byPrint=new Map();
 for(const g of games){const vp=g.ext?.versionPrints;if(!plain(vp))continue;
  for(const [sha,pr] of Object.entries(vp)){if(!HEX.test(sha)||!versions.has(sha)||!g.match.exeSha256.includes(sha)||!plain(pr))continue;
   for(const kind of PRINT_KINDS){const v=String(pr[kind]||'').toLowerCase();if(!v||!PRINT_RULES[kind].test(v))continue;const k=g.key+'|'+kind+'|'+v;if(!byPrint.has(k))byPrint.set(k,sha);}}}
 return {games,versions,errors,dir,byPrint};}
/* the version layer of this copy: the exe hash first, then (only for a game whose profile asks for it) the recorded prints, most
   exact first. -> {doc, match:'exe'|'head'|'pe'|'data'|'pack'} | null. prints: {head, pe, data, pack} of the running copy */
const PRINT_KINDS=['head','pe','data','pack'],PRINT_RULES={head:HEX,pe:/^\d{1,5}\.\d{1,5}\.\d{1,5}\.\d{1,5}@[0-9a-f]{8}$/,data:HEX,pack:HEX};
function versionFor({exeSha256='',gameKey='',prints={},fallback=false}={},s=seeds()){const exact=s.versions.get(String(exeSha256||''));if(exact)return {doc:exact,match:'exe'};
 if(!fallback||!gameKey)return null;
 for(const kind of PRINT_KINDS){const v=String(prints?.[kind]||'').toLowerCase();if(!v)continue;const sha=s.byPrint?.get(gameKey+'|'+kind+'|'+v);if(sha&&s.versions.has(sha))return {doc:s.versions.get(sha),match:kind};}
 return null;}
/* MEGULIT_SEED_DIR: another The Seed folder (tests of the matching rules run against their own seeds, never the repository's) */
function seeds(){return cache||(cache=load(process.env.MEGULIT_SEED_DIR||SEED_DIR));}
function reload(){cache=null;}
module.exports={SEED_DIR,SEED_FORMAT,STATUS,check,known,load,seeds,reload,versionFor,PRINT_KINDS,versionOf:key=>seeds().versions.get(String(key||''))||null};
