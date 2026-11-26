// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 layered game profile: kernel defaults <- engine diff <- game diff, one frozen settings object per running game.
   profileFor({engine,exe,title,folder,files,steamAppId,auto}) -> frozen {gameKey,engine,layers,placement,page,choice,hide,safeMode}

   gameKey: the file name of games/<gameKey>.cjs, a hand-picked slug ('senren-banka'), never derived from a path, so it stays the
   same for the retail, Steam, patched and renamed copies of one work. Which copy is which game is told by the game file's
   `match` (see matchScore): Steam app id, fingerprint files of the game folder, program names and titles. A program name
   alone is not enough when it is a generic engine name (BGI.exe, Game.exe, SiglusEngine.exe ...): it needs a second sign.
   A pirated or renamed copy keeps its data files and its window/library title, so files or title still name it; a Chinese
   patch that renames the exe is listed in exe or found by title. A game without a game file gets an 'auto-' key (hash of the
   program name and title) and only the core+engine layers. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DEFAULTS=require('./defaults.cjs');
const ENGINE_DIR=path.join(__dirname,'engines'),GAME_DIR=path.join(__dirname,'games');
const KEY=/^[a-z0-9][a-z0-9-]{1,62}$/;
/* names the engine detectors use (services/original-engines/registry.cjs names, hook page engines, probe ids) -> engine file id */
const ALIASES={'bgi':'bgi','ethornell':'bgi','bgi/ethornell':'bgi','yuris':'yuris','yu-ris':'yuris','kirikiri':'kirikiri','kirikiriz':'kirikiri','krkr':'kirikiri','krkrz':'kirikiri','krkr2':'kirikiri','tvpx':'kirikiri','siglus':'siglus','siglusengine':'siglus','reallive':'reallive','catsystem2':'catsystem2','cs2':'catsystem2','artemis':'artemis','malie':'malie','advhd':'advhd','willplus':'advhd','kogado':'kogado','majiro':'majiro','qlie':'qlie','softpal':'softpal','nexas':'nexas','system3x':'system3','system3':'system3','system4':'system4','shiinario':'shiinario','entis':'entis','cotopha':'entis','nscripter':'nscripter','livemaker':'livemaker','stuffscript':'stuffscript','unity':'unity','renpy':'renpy','tyrano':'tyrano','rpgmaker':'rpgmaker','rpgmakermvmz':'rpgmaker','rpgmakermv':'rpgmaker','rpgmakermz':'rpgmaker','rpgmv':'rpgmaker','rpgmz':'rpgmaker','mages':'mages','wolf':'wolf','avg32':'avg32','unknown':'','rpgm':'rpgmaker','rmmv':'rpgmaker','rmmz':'rpgmaker'};
Object.assign(ALIASES,{rgss:'rgss',rgss1:'rgss',rgss2:'rgss',rgss3:'rgss',rgss13:'rgss',rpgmakerxp:'rgss',rpgmakervx:'rgss',rpgmakervxace:'rgss',rpgmakervxxp:'rgss'});
/* program names many unrelated games share: they count as a weak sign only */
const GENERIC_EXE=new Set(['game.exe','bgi.exe','siglusengine.exe','advhd.exe','malie.exe','cs2.exe','start.exe','launcher.exe','system.exe','reallive.exe','krkr.exe','krkrz.exe','tvpwin32.exe','nscripter.exe','nscr.exe','gamepro.exe','main.exe','play.exe','run.exe','setup.exe','config.exe','avg32.exe','sys4.exe','system4.exe','livemaker.exe','windows.exe','nw.exe','ruby.exe','soft.exe','pal.exe','renpy.exe','python.exe']);

function engineId(name){const raw=String(name||'').toLowerCase().trim();if(!raw)return '';const head=raw.split(/\s*[/(]\s*/)[0];
 for(const s of [raw,head])for(const v of [s.replace(/[^a-z0-9]/g,''),s.replace(/[^a-z0-9-]/g,'')])if(v in ALIASES)return ALIASES[v];
 const id=head.replace(/[^a-z0-9]/g,'');return /^[a-z0-9]{2,40}$/.test(id)?id:'';}
const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s　・*＊\-_:：!！?？~〜「」『』【】()（）\[\]'"`.,、。]/g,'');
const exeName=p=>path.win32.basename(String(p||'')).toLowerCase();

const cache={engines:new Map(),games:null};
function readDir(dir){try{return fs.readdirSync(dir).filter(f=>f.endsWith('.cjs')).sort();}catch{return [];}}
function loadEngine(id){if(!id)return null;if(cache.engines.has(id))return cache.engines.get(id);let e=null;const file=path.join(ENGINE_DIR,id+'.cjs');if(fs.existsSync(file))e=require(file);cache.engines.set(id,e);return e;}
/* the games the repository knows: The Seed/ (built-in seeds, data, core/profiles/seed.cjs) and core/profiles/games/<key>.cjs (only
   for the rare game whose diff needs code); a seed and a games/ file of one key: the games/ file wins */
function games(){if(cache.games)return cache.games;const files=readDir(GAME_DIR).map(f=>{const g=require(path.join(GAME_DIR,f));return {...g,key:f.slice(0,-4)};});
 const have=new Set(files.map(g=>g.key));cache.games=[...files,...require('./seed.cjs').seeds().games.filter(g=>!have.has(g.key))];return cache.games;}
function reload(){for(const dir of [ENGINE_DIR,GAME_DIR])for(const f of readDir(dir))delete require.cache[path.join(dir,f)];cache.engines.clear();cache.games=null;require('./seed.cjs').reload();}

/* how strongly a running copy looks like game g: steam 3, all fingerprint files 3, a distinctive exe 3, a generic exe 1,
   a title 3 (2 when the title only contains it), the same known engine +1. An engine both sides know that differs
   rules the game out; a title listed in notTitles (fan disc, sequel) never counts. Accepted at 3 or more. */
function matchScore(g,input){const m=g.match||{};let score=0;const why=[];
 const eng=engineId(input.engine),own=engineId(g.engine);if(eng&&own&&eng!==own)return {score:0,why:['engine '+eng+'!='+own]};
 /* the program's SHA-256 is the version itself: a listed hash names the game whatever the file is called */
 if(Array.isArray(m.exeSha256)&&input.exeSha256&&m.exeSha256.map(x=>String(x).toLowerCase()).includes(String(input.exeSha256).toLowerCase())){score+=10;why.push('sha256');}
 if(m.steamAppId&&String(input.steamAppId||'')===String(m.steamAppId)){score+=3;why.push('steam');}
 /* the game prints of a seed (core/game-print.cjs) against the running game's: an archive or script print names the game */
 {const mp=m.prints||{},ip={...(input.prints||{})};if(!ip.title&&input.title&&mp.title)try{ip.title=require('../game-print.cjs').titleHash(input.title);}catch{}
  if(!ip.vndb&&input.vndb)ip.vndb=String(input.vndb).toLowerCase();
  for(const [k,w] of [['pack',10],['script',10],['vndb',3],['title',3]])if(mp[k]&&ip[k]&&mp[k]===ip[k]){score+=w;why.push(k);}}
 if(Array.isArray(m.files)&&m.files.length&&input.folder){const ok=m.files.every(f=>{try{return fs.existsSync(path.join(input.folder,f));}catch{return false;}});if(ok){score+=3;why.push('files');}}
 else if(Array.isArray(m.files)&&m.files.length&&Array.isArray(input.files)){const have=new Set(input.files.map(f=>String(f).toLowerCase().replace(/\\/g,'/')));if(m.files.every(f=>have.has(String(f).toLowerCase())))
  {score+=3;why.push('files');}}
 const exe=exeName(input.exe);if(exe&&(m.exe||[]).some(x=>String(x).toLowerCase()===exe)){const w=GENERIC_EXE.has(exe)?1:3;score+=w;why.push(w>1?'exe':'exe(generic)');}
 const t=fold(input.title),exact=(m.titles||[]).some(x=>!(x instanceof RegExp)&&fold(x)&&fold(x)===t);
 if(t&&!(m.notTitles||[]).some(x=>fold(x)&&t.includes(fold(x)))&&(exact||(m.titles||[]).some(x=>x instanceof RegExp?x.test(String(input.title).normalize('NFKC')):(fold(x)&&t.includes(fold(x)))))){score+=exact?3:2;why.push(exact?'title':'title~');}
 if(score&&eng&&own&&eng===own){score+=1;why.push('engine');}
 return {score,why};}
function findGame(input){let best=null;for(const g of games()){const r=matchScore(g,input);if(r.score>=3&&(!best||r.score>best.score))best={game:g,...r};}return best;}
function autoKey(input){const exe=exeName(input.exe),t=fold(input.title);if(!exe&&!t)return 'none';return 'auto-'+crypto.createHash('sha1').update(exe+'|'+t).digest('hex').slice(0,10);}

const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof RegExp);
/* open maps: dictionaries whose entries are data, not kernel keys (draw.roleMap: identity -> role). A layer adds or overrides entries,
   the entries of the layers under it stay */
const OPEN=new Set(['lang']);
/* keys a layer may set: the kernel tree only (a typo or an unknown key is an error, found by validation/games-regression) */
function unknownKeys(settings,base=DEFAULTS,at=''){const out=[];for(const [k,v] of Object.entries(settings||{})){if(!(k in base)){out.push(at+k);continue;}if(plain(base[k])){if(!plain(v))out.push(at+k);else if(!OPEN.has(at+k))out.push(...unknownKeys(v,base[k],at+k+'.'));}}return out;}
/* an open map (lang): entries add up across layers, one entry's own fields too (lang.ja.annotation from one layer, pairing from another) */
function mergeOpen(a,b){const out={...a};for(const [k,v] of Object.entries(b))out[k]=plain(v)&&plain(a[k])?{...a[k],...v}:v;return out;}
function merge(a,b,at=''){if(!plain(b))return a;const out={...a};for(const [k,v] of Object.entries(b)){if(!(k in a))continue;out[k]=OPEN.has(at+k)&&plain(v)?mergeOpen(plain(a[k])?a[k]:{},v):plain(a[k])&&plain(v)?merge(a[k],v,at+k+'.'):Array.isArray(v)?v.slice():v;}return out;}
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
const clone=v=>JSON.parse(JSON.stringify(v));
/* only the kernel keys of a layer (an auto layer read from disk may carry stale or unknown keys: they are dropped, not errors) */
function known(settings,base=DEFAULTS,at=''){const out={};if(!plain(settings))return out;for(const [k,v] of Object.entries(settings)){if(!(k in base))continue;if(plain(base[k])){if(plain(v))out[k]=OPEN.has(at+k)?{...v}:known(v,base[k],at+k+'.');}else out[k]=v;}return out;}
/* one more layer over a profile (same rule as profileFor): a new frozen profile, layers +name */
function apply(profile,layer,name){const meta={application:profile.application,vndbLayout:profile.vndbLayout,gameKey:profile.gameKey,engine:profile.engine,exeSha256:profile.exeSha256||'',match:profile.match||'none',layers:profile.layers,matched:profile.matched,rejected:profile.rejected||''};const base={};for(const k of Object.keys(DEFAULTS))base[k]=clone(profile[k]);
 const s=merge(base,clone(known(layer)));return freeze({...meta,layers:name?meta.layers+'+'+name:meta.layers,...s});}

/* layers, each over the one before (docs/diff-layers.md):
     core <- engine <- game (repo) <- shared-game / shared (relay, the players' agreed diff: game layer, then this exe's
     version layer) <- auto (this PC's calibration)
     <- official-game (relay, our signed diff for every version of the game) <- official (relay, our signed diff of this exe
     version) <- stepdown (this PC's gate step-down: always last, so a
     game that broke here can always fall back)
   Layers from outside the repo are data: input.sharedGame / shared / auto / officialGame / official / stepDown are settings objects
   (services/self-check-live.cjs inputOf picks them; the signed documents are checked by services/auto-profile-feed.cjs).
   Each is checked again against core/profiles/domains.cjs here; one key or value outside its domain leaves that layer out
   whole (profile.rejected names it). input.exeSha256: the program's SHA-256, shown in the trace. */
/* the prints of the running copy that can name its build (core/game-print.cjs), read once per exe file state; {} without an exe */
const printMemo=new Map();
function copyPrints(input){const exe=String(input.exe||'');if(!exe||!path.isAbsolute(exe))return {};let st;try{st=fs.statSync(exe);}catch{return {};}const k=exe.toLowerCase()+'|'+st.size+'|'+st.mtimeMs;if(printMemo.has(k))return printMemo.get(k);
 const GP=require('../game-print.cjs'),dir=String(input.folder||path.dirname(exe)),out={};try{out.head=GP.headTail(exe,64<<10);}catch{}const pe=GP.peVersion(exe);if(pe)out.pe=pe;
 const pack=GP.mainPack(dir);if(pack)try{out.pack=GP.headTail(pack,1<<20);}catch{}
 try{out.data=GP.dataPrint(dir,require('../../services/original-engines/registry.cjs').readersFor(dir));}catch{}
 printMemo.set(k,out);return out;}
const OUTSIDE=[['sharedGame','shared-game'],['shared','shared'],['auto','auto'],['officialGame','official-game'],['official','official'],['verifiedLocal','verified-local'],['stepDown','stepdown']];
function profileFor(input={}){input=input||{};const hit=findGame(input);const game=hit?.game||null;const {clean}=require('./domains.cjs');
 const engine=engineId(input.engine)||engineId(game?.engine)||'';const eng=loadEngine(engine);
  let s=clone(DEFAULTS);const layers=['core'],rejected=[];if(eng){s=merge(s,clone(eng.settings||{}));layers.push('engine');}
 /* a repository game file, or a skeleton seed (identity + pinned values: under this PC's calibration, the gate decides) */
 if(game&&(!game.seed||game.status==='skeleton')){s=merge(s,clone(game.settings||{}));layers.push(game.seed?'seed-skeleton':'game');}
 /* built-in seeds (The Seed/) stand where the downloaded official diff of their layer stands; a downloaded one with a higher rev
    replaces them (input.officialGameRev / input.officialRev from services/self-check-live.cjs inputOf) */
 const seedVersion=/^[0-9a-f]{64}$/.test(String(input.exeSha256||''))?require('./seed.cjs').versionOf(input.exeSha256):null;
 /* 2026-11-27 MeguLit-Adapter: the exe hash missed, and this game's seed says source.versionMatch 'prints': the version layer its
    recorded prints name (a no-DVD / updated / renamed exe of the same build) is a candidate only, so it goes in low, where a skeleton
    seed goes (under this PC's calibration; the self-check gate decides), never in the official slot */
 let candidate=null;
 if(!seedVersion&&game?.seed&&(game.settings?.source?.versionMatch??s.source.versionMatch)==='prints'){const r=require('./seed.cjs').versionFor({exeSha256:input.exeSha256,gameKey:game.key,prints:input.versionPrints||copyPrints(input),fallback:true});
  if(r&&r.match!=='exe'){candidate=r;s=merge(s,clone(known(r.doc.settings||{})));layers.push('seed-version~'+r.match);}}
 const take=(seedDoc,field,rev)=>seedDoc&&(!plain(input[field])||!(Number(input[rev])>Number(seedDoc.rev||0)));
 const seedGame=game?.seed&&game.status!=='skeleton'?game:null;
 // A bundled revision has no checked runtime/script binding at this stage.
 const evidence=require('../seed-evidence.cjs');
 const scoped=seedVersion?.evidence?.trials;
 const bundled=scoped ? evidence.applyStatus(seedVersion,evidence.status(seedVersion,null)) : seedVersion;
 const useBundled=take(seedVersion,'official','officialRev') &&
  !(scoped && input.verifiedTrialRevision===seedVersion.rev && input.officialRev===seedVersion.rev);
 const slots={officialGame:take(seedGame,'officialGame','officialGameRev')?['seed-game',game.settings]:null,official:useBundled?['seed',bundled.settings]:null};
 const owners=new Map(),revisions=new Map();
 function remember(settings,name,prefix=''){for(const [k,v] of Object.entries(settings)){const key=prefix+k;if(plain(v))remember(v,name,key+'.');else owners.set(key,name);}}
 if(game?.seed&&game.status==='skeleton'){remember(game.settings,'seed-skeleton');revisions.set('seed-skeleton',game.seedRev);}
 for(const [field,name0] of OUTSIDE){let v=input[field],name=name0;if(slots[field]){[name,v]=slots[field];}if(!plain(v))continue;const c=clean(v);if(c.rejected.length){rejected.push(name+': '+c.rejected.slice(0,3).join(','));continue;}s=merge(s,c.value);layers.push(name);remember(c.value,name);
 if(name==='seed'||name==='seed-game'||name.startsWith('official'))revisions.set(name,name==='seed'?seedVersion.rev:name==='seed-game'?game.seedRev:input[field+'Rev']);}
 if(['adv','nvl','mixed'].includes(input.confirmedPresentation)){s.page.presentation=input.confirmedPresentation;owners.set('page.presentation','personal');}
 const keysFor=layer=>[...owners].filter(([,owner])=>owner===layer).map(([key])=>key);
 const application={values:Object.fromEntries([...owners.keys()].map(key=>[key,get(s,key,null)])),layers:[...revisions].map(([layer,revision])=>({layer,revision:revision||null,keys:keysFor(layer)})),personal:[...keysFor('personal'),...keysFor('auto'),...keysFor('verified-local'),...keysFor('stepdown')]};
 const exe=/^[0-9a-f]{64}$/.test(String(input.exeSha256||''))?String(input.exeSha256):'';
 /* how the game was recognised, most exact first (docs/diff-layers.md): input.match is the relay's ('exe' | 'bin' | 'game:<basis>');
    else the repo game file's ('exe' when it lists this exe hash, game:<why> otherwise); else 'engine' or 'none' */
 const match=/^(exe|head|pe|game:[a-z~(),]{2,40})$/.test(String(input.match||''))?String(input.match):hit?(hit.why.includes('sha256')?'exe':'game:'+hit.why.filter(w=>w!=='sha256').map(w=>/^exe/.test(w)?'name':w.replace('~','')).join(',')):eng?'engine':'none';
 return freeze({application,versionMatch:seedVersion?'exe':candidate?candidate.match:'',vndbLayout:exe&&input.vndbLayoutKey===exe&&['adv','nvl','mixed'].includes(input.vndbLayout)?input.vndbLayout:null,gameKey:game?game.key:autoKey(input),seedStatus:game?.seed?game.status:'',sourceLangs:game?.sourceLangs||['ja'],engine:engine||'unknown',exeSha256:exe,match,layers:layers.join('+'),matched:hit?hit.why.join(','):'',rejected:rejected.join('; '),...s});}
/* the trace line every run writes once (hook-events.log), so the owner's log tells which layers this game ran with */
const traceLine=p=>'profile '+p.gameKey+' match='+(p.match||'none')+' exe='+(p.exeSha256?p.exeSha256.slice(0,8):'-')+' layers='+p.layers+' engine='+p.engine+(p.rejected?' rejected='+p.rejected:'');
/* a dotted key of a profile, with the fallback when the profile or the key is missing */
function get(p,key,fallback){let v=p;for(const k of String(key).split('.')){if(v==null||typeof v!=='object')return fallback;v=v[k];}return v===undefined||v===null?fallback:v;}
/* the language block of a profile for the source language the reader reads ('ja', 'en', 'zh-Hans' -> 'zh-Hans', else 'zh'), {} when the
   profile has none: the caller then keeps the language-free settings */
function forLang(p,tag){const L=p?.lang||{};const t=String(tag||'ja');return L[t]||L[t.split('-')[0]]||{};}
/* the RegExps of choice.filters (bad sources are skipped) */
function choiceFilters(p){const out=[];for(const src of get(p,'choice.filters',[]))try{out.push(new RegExp(String(src),'u'));}catch{}return out;}
module.exports={DEFAULTS,OPEN,forLang,profileFor,merge,apply,known,engineId,matchScore,findGame,games,loadEngine,unknownKeys,traceLine,get,choiceFilters,reload,GENERIC_EXE,ENGINE_DIR,GAME_DIR};
