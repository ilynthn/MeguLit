#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 传火的起点) The Seed: the first game diffs, made in one run from the games this PC already plays.
   Nothing is opened, launched, signed or uploaded; the installs are only read.

     node tools/diff-maker/seed-all.cjs [--root <MeguLit install>]... [--out <folder>] [--seed <repo The Seed folder>] [--only <title part>]

   Sources per install (default E:\MeguLit-Test-1421 and E:\MeguLit, read only): the library (data/megulit.sqlite games, read only),
   data/config/original-text.json (engine, script index, Chinese patch index), data/config/game-reception.json (VNDB), logs/
   game-launch.log (which game ran when) and logs/hook-events.log(.previous) + reader-host.log (the runtime samples, cut per launch).
   Per game: prints (core/game-print.cjs: exe SHA-256, head, PE version; main archive, script, Steam, VNDB, title) and engine;
   with a runtime sample of at least selfCheck.minLines lines the offline search of tools/diff-maker runs and gives the version
   and game drafts (unsigned core/game-diff.cjs documents).
     complete  a sample and every self-check window passes in hide mode -> <seed>/<engine>/<gameKey>/game.json (scope game) +
               versions/<exeSha256>.json (scope version) (only hashes, ids, settings: no path, no user name, no title text)
     pending   no sample (skeleton: identity + engine + pairing), or no hide candidate passes (read-mode drafts) ->
               <out>/_pending/<engine>/<gameKey>/
   Everything else (reports, line data with the patch's Chinese, skeletons) stays under <out> (default H:\MeguLit-Work\The Seed),
   with the summary <out>/report.md. */
const fs=require('node:fs'),path=require('node:path');
const Profiles=require('../../core/profiles/index.cjs'),GamePrint=require('../../core/game-print.cjs'),Domains=require('../../core/profiles/domains.cjs'),SeedFormat=require('../../core/profiles/seed.cjs'),crypto=require('node:crypto');
const GameDiff=require('../../core/game-diff.cjs'),Samples=require('./samples.cjs'),Scripts=require('./scripts.cjs'),Search=require('./search.cjs'),Emit=require('./emit.cjs'),Probe=require('./probe.cjs');
const {REASONS}=require('../../core/self-check.cjs');
const {parseSelector}=require('../../core/game-request-selector.cjs');
const ROOT=path.join(__dirname,'..','..');
const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));}catch{return null;}};
const readText=f=>{try{return fs.readFileSync(f,'utf8');}catch{return '';}};
const writeJson=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,1)+'\n');};
const HAN=/\p{Script=Han}/u,KANA=/[\u3040-\u30ff]/;

/* the library of one install: games with their library record, original-text entry, VNDB id and launches */
function library(root){const out=[];let rows=[];
 try{const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(root,'data','megulit.sqlite'),{readOnly:true});rows=db.prepare('SELECT id,title,executable,source,status,original,removed_at FROM games').all();db.close();}
 catch(e){const st=readJson(path.join(root,'data','adapter-probe','state.json'));rows=(st?.games||st?.library||[]).map(g=>({id:g.id,title:g.title,executable:g.executable}));}
 const ot=readJson(path.join(root,'data','config','original-text.json'))||{},rec=readJson(path.join(root,'data','config','game-reception.json'))||{};
 for(const r of rows){if(r.removed_at)continue;let lib={};try{lib=JSON.parse(r.original||'{}').library||{};}catch{}
  const vndb=lib.vndbId||(/vndb\.org\/(v\d+)/.exec(rec[r.id]?.vndb?.url||'')||[])[1]||'';
  out.push({root,id:r.id,title:String(r.title||lib.title||''),names:(lib.names||[]).map(String),exe:String(r.executable||lib.exe||''),steam:String(lib.appid||lib.vndbSteamAppid||''),vndb,engine:String(lib.engine||ot[r.id]?.engine||''),lang:String(lib.contentLanguage||''),ot:ot[r.id]||null});}
 return out;}

/* launches per game id: [{from,to}] from game-launch.log (a launch lasts until the next one) */
function launches(root){const rows=[];for(const l of readText(path.join(root,'logs','game-launch.log')).split(/\r?\n/)){if(!l.startsWith('{'))continue;let v;try{v=JSON.parse(l);}catch{continue;}if(v.stage==='launch-request'&&v.gameId&&v.at)rows.push({id:v.gameId,at:v.at});}
 rows.sort((a,b)=>a.at<b.at?-1:1);const by=new Map();rows.forEach((r,i)=>{const w={from:r.at,to:rows[i+1]?.at||''};if(!by.has(r.id))by.set(r.id,[]);by.get(r.id).push(w);});return by;}

function engineOf(g){for(const s of [g.engine,g.ot?.engine,g.ot?.runtime?.engine])if(s){const id=Profiles.engineId(s)||Profiles.engineId(String(s).split(/[-_]/)[0]);if(id)return id;}return '';}
/* 原名（中文圈通用译名）: the library title and, when the library knows a Chinese name (Han, no kana, another text), that one */
function nameOf(g){const zh=g.names.find(n=>HAN.test(n)&&!KANA.test(n)&&!/[\[\]()（）]/.test(n)&&[...n].length<=24&&n!==g.title&&!g.title.includes(n));return zh?g.title+'（'+zh+'）':g.title;}

/* the script index of the original-text provider -> {ix, script print, pairing} */
function scriptOf(g){const rt=g.ot?.runtime,pt=g.ot?.patch;const ix=Scripts.emptyIndex();let lines=0,patch=0;
 const idx=rt?.index?readJson(rt.index):null,pidx=pt?.index?readJson(pt.index):null;
 const paired=['ready','interface-only'].includes(g.ot?.patchStatus)&&g.ot.patchAlignment?.reliable===true&&rt?.sha256&&pt?.runtimeSha===rt.sha256&&
  !!rt.reader&&pt.reader===rt.reader&&idx?.source?.sha256===rt.sha256&&pidx?.role==='patch'&&pidx.source?.sha256===pt.sha256&&idx.role==='runtime';
 let quality=null;
 if(idx&&Array.isArray(idx.lines)){const zh=paired&&Array.isArray(pidx.lines)&&pidx.lines.length===idx.lines.length?pidx.lines:[];lines=idx.lines.length;ix.files=1;
  const {translated}=require('../../services/align-sample.cjs');
  if(idx.role==='runtime'&&idx.source?.sha256===rt.sha256){
   quality=require('../../services/script-translation-quality.cjs').translationQuality(idx,zh.length?zh:null);
   if(quality){
    quality.indexHash=crypto.createHash('sha256').update(JSON.stringify([idx.roles,idx.lines])).digest('hex');
    quality.patchIndexHash=zh.length?crypto.createHash('sha256').update(JSON.stringify(zh)).digest('hex'):null;
   }
  }
  idx.lines.forEach((s,i)=>{if(typeof s!=='string'||!s||idx.roles?.[i]==='i')return;ix.dialogue.add(Samples.fold(s));ix.lines++;const local=g.ot?.patchStatus==='ready'&&translated(zh[i],s)?zh[i]:'';if(local)patch++;ix.entries.push({line:s,ruby:idx.ruby?.[i]||null,zh:local});});}
 return {ix,quality,script:/^[0-9a-f]{64}$/.test(String(rt?.sha256||''))?rt.sha256:'',pairing:{status:String(g.ot?.status||''),lines,patchLines:pt?.lines||0,aligned:patch}};}

/* the runtime sample of a game over all installs: the newest launch with at least minLines hook lines (what the current code
   did; an older, longer run shows code that is gone), else the launch with the most lines */
function sampleOf(g,logs,wins,minLines){let most=null;
 for(const w of wins.slice().sort((a,b)=>a.from<b.from?1:-1)){const L=logs.get(w.root);const r=Samples.fromLogs(L.hook,L.reader,'',w);const n=r.events.filter(e=>e.kind==='line').length;const s={...r,lines:n,window:w};
  if(n>=minLines)return s;if(!most||n>most.lines)most=s;}
 return most;}


/* the readable game slug (owner: 目录名用罗马字/英文名): slugs.json by '<title>|<exe>' then title, the hand-written game diff's key,
   an ASCII title slugified, else 'game-' + the title print */
const SLUGS=readJson(path.join(__dirname,'slugs.json'))||{};
const SLUG=/^[a-z0-9][a-z0-9-]{1,62}$/;
function slugOf(g,gameKey){/* the batch skeleton generator (tools/megulit-adapter/skeleton.cjs) names it from VNDB's latin title */if(typeof g.slug==='string'&&SLUG.test(g.slug))return g.slug;
 const exe=path.basename(g.exe);for(const k of [g.title+'|'+exe,g.title]){const v=SLUGS[k];if(typeof v==='string'&&SLUG.test(v))return v;}
 if(gameKey&&!gameKey.startsWith('auto-')&&SLUG.test(gameKey))return gameKey;
 const ascii=String(g.title).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,62).replace(/-+$/,'');
 if(SLUG.test(ascii)&&!/[^\x00-\x7f]/.test(g.title.replace(/[～\s]/g,'')))return ascii;
 return 'game-'+(GamePrint.titleHash(g.title)||crypto.createHash('sha256').update(g.id).digest('hex')).slice(0,12);}

/* the values this game runs with today (kernel defaults <- engine diff <- the hand-written game diff), every key of
   core/profiles/defaults.cjs written out: a later change of a kernel default does not move a game that works (做好了就是做好了) */
/* Not pinned: null values (null means "the kernel decides": pinning it freezes nothing and would hide the layers under the seed),
   calibrate.* (this PC's measurement, the auto layer) and selfCheck.* (the gate's thresholds): a verified seed sits above this PC's
   calibration, pinning them would switch off every player's calibration and gate tuning (owner OK 2026-11-21) */
const NOT_PINNED=new Set(['calibrate','selfCheck']);
function pinned(profile){const out={};const walk=(v,dst,at)=>{for(const [k,x] of Object.entries(v)){const key=at?at+'.'+k:k;
  if(x===null||x===undefined)continue;if(Domains.DOMAINS[key]){dst[k]=JSON.parse(JSON.stringify(x));continue;}
  if(x&&typeof x==='object'&&!Array.isArray(x)){const o={};walk(x,o,key);if(Object.keys(o).length)dst[k]=o;}}};
 for(const k of Object.keys(Profiles.DEFAULTS))if(!NOT_PINNED.has(k)&&profile[k]&&typeof profile[k]==='object'){const o={};walk(profile[k],o,k);if(Object.keys(o).length)out[k]=o;}
 return out;}
/* the measured values a seed carries: the kernel keys the search result stands for (calibrate.* is the auto layer's) */
function seedMeasured(m){const out=JSON.parse(JSON.stringify(m||{}));delete out.calibrate;return out;}
/* order-free comparison (a seed edited by hand or merged may list its fields in another order) */
const sameJson=(a,b)=>require('../../core/game-diff.cjs').canonical(a)===require('../../core/game-diff.cjs').canonical(b);

const STATUS=['verified','owner-ok','read','skeleton'];
/* the language of the game's own text from the library (contentLanguage, what MeguLit detected when the game was added): en / ja /
   zh -> zh-Hans; anything else, or nothing, is Japanese (the format's default) */
function langsOf(g){const l=String(g.lang||'').toLowerCase();return [l==='en'?'en':l==='zh'||l==='zh-hans'?'zh-Hans':'ja'];}
/* one game -> its seed (always written to <seed> unless the program is missing) and its report row */
async function seedOne(g,logs,wins,options){
 const job=options.requestJob;
 if(!job||!g.exe||!fs.existsSync(g.exe)||g.vndb!==job.work||engineOf(g)!==job.engine||g.lang?.toLowerCase()!==job.lang||g.ot?.runtime?.sha256!==job.script){
  return generateSeed(g,logs,wins,options);
 }
 const exeSha=crypto.createHash('sha256').update(fs.readFileSync(g.exe)).digest('hex');
 if(exeSha!==job.exe)return generateSeed(g,logs,wins,options);
 const ref=crypto.randomUUID();
 try{await job.update(ref,false);}catch(e){console.error('Seed generation receipt:',e.message);}
 try{return await generateSeed(g,logs,wins,options,exeSha);}
 finally{try{await job.update(ref,true);}catch(e){console.error('Seed generation finish receipt:',e.message);}}
}

async function generateSeed(g,logs,wins,{out,seed,ownerOk,versionsWritten},knownExeSha){const engine=engineOf(g)||'unknown',name=nameOf(g);const row={name,engine,id:g.id,state:'',look:[]};
 if(!g.exe||!fs.existsSync(g.exe)){row.state='skip';row.look.push('程序不在本机');return row;}
 const sc=scriptOf(g);
 if(sc.quality){
  const returned=require('../../services/script-translation-quality.cjs').returnedSources(
   logs.get(g.root)?.reader,g.id,sc.script,g.ot?.patch?.sha256||null);
  if(returned)sc.quality.returned=returned;
 }
 const exeSha=knownExeSha||crypto.createHash('sha256').update(fs.readFileSync(g.exe)).digest('hex');
 const prints=GamePrint.prints(g.exe,{exe:exeSha,title:g.title,steamAppId:g.steam,vndb:g.vndb,script:sc.script,engine:engine==='unknown'?'':engine});
 const gid=Probe.gameId(prints);
 const exeName=path.basename(g.exe);const input={exe:exeName,title:g.title,engine,steamAppId:g.steam,folder:path.dirname(g.exe)};
 const base=Profiles.profileFor(input);const gameFile=Profiles.games().find(x=>x.key===base.gameKey&&!x.seed)||null;
 const slug=slugOf(g,base.gameKey);row.slug=slug;row.prints=prints;row.pairing=sc.pairing;row.layers=base.layers;
 row.fixture=fs.existsSync(path.join(ROOT,'validation','fixtures','games',base.gameKey))?base.gameKey:'';
 const minLines=Search.thresholdsOf(base).minLines;const smp=sampleOf(g,logs,wins,minLines);row.lines=smp?.lines||0;
 const probe={dir:'',manifest:{title:g.title},title:g.title,exe:{name:exeName,sha256:exeSha},game:{title:g.title,archive:null,script:sc.script,steamAppId:g.steam,vndb:g.vndb},
  versions:[{exe:exeName,sha256:exeSha,probed:true}],engine,engineWhy:['library'],runtime:{shots:0},prints,input};
 const lines=Scripts.replacements(sc.ix.entries);const work=path.join(out,engine,slug);fs.mkdirSync(work,{recursive:true});
 let measured={},mode='hide',status,sus=[];
 if(smp&&smp.lines>=minLines){const all=[...smp.events,...smp.records];const t0=Math.min(...all.map(e=>e.at).filter(Number.isFinite));const rel=e=>({...e,at:e.at-t0});
  const rep={events:smp.events.filter(e=>Number.isFinite(e.at)).map(rel).sort((a,b)=>a.at-b.at),records:smp.records.map(rel).sort((a,b)=>a.at-b.at)};
  const result=Search.search(rep,base,sc.ix);result.lines=smp.lines;result.windowCount=Search.windows(rep.events,result.thresholds).length;
  const b=result.best;sus=Emit.suspect(Search.settingsOf(result));measured=Emit.withoutSuspect(Search.settingsOf(result),sus);mode=b.params.hideMethod==='read'?'read':'hide';status=mode==='hide'&&b.pass?'verified':'read';
  row.metrics=b.metrics;row.over=result.hideBest?.over||[];
  const rpt=Emit.report(probe,slug,result,Emit.diffsOf(probe,slug,result,gameFile),base,lines);row.look.push(...rpt.look);fs.writeFileSync(path.join(work,'report.md'),rpt.md);}
 else{status=ownerOk.has(slug)?'owner-ok':'skeleton';row.look.push(status==='owner-ok'?'店主确认能用，本机没有样本':'待运行样本'+(smp?.lines?'（只有 '+smp.lines+' 句）':''));}
 /* 2026-11-21 (owner, 1.4.22 test: ファタモルガーナの館 lost its Japanese in read mode; hide mode with the reader drawing the Japanese
    works, incr12) a game on the owner's list is owner-ok and hidden even when a sample's offline verdict was read: the sample can be
    older than the fixes that made it work, the owner's run is newer */
 if(status==='read'&&ownerOk.has(slug)){status='owner-ok';mode='hide';if(measured.hide)measured.hide={...measured.hide,textEffectsRead:false};if(measured.calibrate&&measured.calibrate.hideMethod==='read')measured.calibrate={...measured.calibrate,hideMethod:'hide'};row.look.push('样本判读模式，但店主确认隐藏模式能用：owner-ok');}
 row.state=status;row.mode=mode;row.suspect=sus;for(const x of sus)row.look.push('可疑量测值没写进 seed：'+x.key+' '+x.value.w+'x'+x.value.h+' @'+x.value.x+','+x.value.y+'（'+x.why+'）');
 /* the seed: today's values pinned, the measured ones over them; build() keeps each scope's keys */
 const settings=Emit.deepMerge(pinned(base),seedMeasured(measured));
 /* settings.lang (per source language: annotation, pairing, dictionary, fontFallback) is the seed's own data, not a profile value
    the kernel fills in: an existing seed's lang blocks are kept; a new seed of a Japanese game gets lang.ja.annotation 'ruby' (the
    kernel's behaviour, as the 55 seeds were migrated in feat/diff-layers 4a1e5446) */
 {const oldGame=seed?readJson(path.join(seed,engine,slug,'game.json')):null;const lang=oldGame?.settings?.lang;
  settings.lang=lang&&Object.keys(lang).length?JSON.parse(JSON.stringify(lang)):(oldGame?.sourceLangs||langsOf(g)).includes('ja')?{ja:{annotation:'ruby'}}:{};if(!Object.keys(settings.lang).length)delete settings.lang;}
 const {version,game:doc}=Emit.docs({prints,exeSha,exeName,engine:engine==='unknown'?'':engine,mode,settings,gid});
 /* seed fields of The Seed (registered with diff-layers as part of the seed format): status, the readable slug, the exe builds
    whose version layer goes with this game. One exe shared by several games (one program, several releases) has one version file:
    the first game (by slug) holds it, the others name it in builds */
 /* a seed already in the repository keeps the prints and match it was given (curated) and its sourceLangs; rev goes up when the
    seed changes */
 const old=seed?readJson(path.join(seed,engine,slug,'game.json')):null,oldV=seed?readJson(path.join(seed,engine,slug,'versions',exeSha+'.json')):null;
 const prints2={...(doc.prints||{}),...(old?.prints||{})};
 /* the titles the game is known by (the document has no title field: the library title goes here too) */
 const titles=[...new Set([...(old?.match?.titles||[]),g.title,...g.names])].filter(t=>t&&t.length<=120&&!/[\\/]/.test(t)).slice(0,20);
 const exes=[...new Set([...(old?.match?.exe||gameFile?.match?.exe||[]),exeName])].filter(x=>x&&x.length<=80&&!/[\\/]/.test(x)).slice(0,20);
 const match={exe:exes,...(titles.length?{titles}:{}),...(old?.match?.notTitles?{notTitles:old.match.notTitles}:{})};
 const builds=[...new Set([...(old?.builds||[]),exeSha])].slice(0,64);
 /* the game key: an existing seed keeps its identity; a new one is the relay's gidFor of its prints. seedFormat 1 and sourceLangs
    (the languages of the game's own text, BCP 47) are written out; an existing seed's sourceLangs and ext are kept */
 const sourceLangs=old?.sourceLangs||langsOf(g);
 const game={...doc,key:old?.key||Probe.gameId(prints2),prints:prints2,seedFormat:1,status,slug,builds,match,sourceLangs,...(old?.ext?{ext:old.ext}:{})};
 if(sc.quality&&sc.script){
  const prior=game.ext?.translationQuality||{},previous=prior[exeSha];
  if(previous?.returned&&!sc.quality.returned&&previous.indexHash===sc.quality.indexHash&&previous.patchIndexHash===sc.quality.patchIndexHash)
   sc.quality.returned=previous.returned;
  if(sc.quality.patchIndexHash||previous?.indexHash!==sc.quality.indexHash||!previous.patchIndexHash)
   game.ext={...game.ext,translationQuality:{...prior,[exeSha]:{script:sc.script,...sc.quality}}};
 }
 /* unchanged content: the file stays as it is (its field order and rev too); changed: rev + 1 (a first rev is 1) */
 const bump=(o,n)=>{if(!o)return n;const r=Number.isInteger(o.rev)?o.rev:0;if(sameJson({...o,rev:0},{...n,rev:0})&&r>=1)return o;return {...n,rev:Math.max(1,r+1)};};
 const gameOut=bump(old,{...game,rev:1}),versionOut=bump(oldV,{...version,rev:1});
 for(const [n,d,w] of [['game',gameOut,{engine:gameOut.engine,slug}],['version',versionOut,{engine:versionOut.engine,file:exeSha+'.json'}]]){const r=SeedFormat.check(d,w);if(!r.ok)throw new Error(n+' seed: '+r.errors.join('; '));}
 const owner=versionsWritten.get(exeSha);if(owner&&owner!==engine+'/'+slug)row.look.push('版本层和 '+owner+' 共用（同一个 exe）');
 const files=[[path.join(work,'game.json'),gameOut]];if(!owner)files.push([path.join(work,'versions',exeSha+'.json'),versionOut]);
 if(seed){files.push([path.join(seed,engine,slug,'game.json'),gameOut]);if(!owner)files.push([path.join(seed,engine,slug,'versions',exeSha+'.json'),versionOut]);}
 if(!owner)versionsWritten.set(exeSha,engine+'/'+slug);
 for(const [f,v] of files)writeJson(f,v);
 if(lines.length)writeJson(path.join(work,'lines.json'),Emit.linesOf(probe,slug,lines,gid));
 writeJson(path.join(work,'identity.json'),{name,slug,engine,status,game:gid,prints,script:sc.script,pairing:sc.pairing,layers:base.layers,sample:row.lines,suspect:sus});
 return row;}

const f3=v=>v==null?'-':String(Math.round(v*1000)/1000);
const STATUS_ZH={verified:'verified：有样本且自检全过线，直接用','owner-ok':'owner-ok：店主确认能用（本机没样本），直接用',read:'read：有样本但隐藏没过线，直接读模式',skeleton:'skeleton：只有身份 + 引擎 + 配对 + 钉住的值，自检闸门照常把关',skip:'跳过：程序不在本机'};
function summary(rows,out){const by=s=>rows.filter(r=>r.state===s);const eng={};for(const r of rows){const e=eng[r.engine]||(eng[r.engine]={verified:0,'owner-ok':0,read:0,skeleton:0,skip:0});e[r.state]++;}
 const row=r=>{const p=r.prints||{};const fp=r.slug?'`'+r.slug+'` exe `'+String(p.exe||'').slice(0,8)+'`'+(p.pe?' pe '+p.pe.split('@')[0]:'')+' ('+GamePrint.GAME_KINDS.filter(k=>p[k]).join('/')+')':'-';
  const m=r.metrics;const score=m?'drop '+f3(m.dropRate)+' hide '+f3(m.hideVisible)+' rep '+f3(m.repeatRate)+' choice '+m.choiceMismatch+' pos '+f3(m.positionPx)+' pair '+f3(m.pairRate):'-';
  const pair=r.pairing&&r.pairing.lines?'；剧本 '+r.pairing.lines+' 句'+(r.pairing.aligned?'，补丁对齐 '+r.pairing.aligned:''):'';
  return '| '+r.name.replace(/\|/g,'¦')+' | '+r.engine+' | '+fp+' | '+(r.lines?r.lines+' 句':'无')+pair+' | '+score+' | '+(r.mode||'-')+(r.over&&r.over.length&&r.mode==='read'?'（'+r.over.join(',')+'）':'')+(r.fixture?' · 夹具 '+r.fixture:'')+' | '+[...new Set(r.look)].slice(0,3).map(x=>x.replace(/\|/g,'¦').slice(0,60)).join('；')+' |';};
 const lines=['# The Seed 汇总','','本机库里的游戏，一次批量离线生成，全部未签名。每份 seed 都钉住这部游戏现在实际用的 profile 值（内核默认 ← 引擎差分 ← 现有游戏差分），有样本的再盖上离线搜索量到的值','',
  ...['verified','owner-ok','read','skeleton','skip'].map(s=>'- '+STATUS_ZH[s]+'：'+by(s).length+' 部'),'',
  '## 引擎分布','','| 引擎 | verified | owner-ok | read | skeleton | 跳过 |','|---|---|---|---|---|---|',...Object.entries(eng).sort((a,b)=>a[0]<b[0]?-1:1).map(([e,c])=>'| '+e+' | '+c.verified+' | '+c['owner-ok']+' | '+c.read+' | '+c.skeleton+' | '+c.skip+' |'),''];
 for(const s of ['verified','owner-ok','read','skeleton','skip']){const list=by(s);if(!list.length)continue;
  lines.push('## '+STATUS_ZH[s],'','| 游戏 | 引擎 | slug / 指纹 | 样本 | 自检分数 | 模式 | 需人看 |','|---|---|---|---|---|---|---|',...list.map(row),'');}
 fs.writeFileSync(path.join(out,'report.md'),lines.join('\n'));return lines.join('\n');}

function requestJobOf(selector,origin){
 if(!selector&&!origin)return null;
 const token=process.env.ADAPTER_ADMIN_TOKEN,relay=new URL(origin);
 if(!selector||!token||relay.username||relay.password||
    (relay.protocol!=='https:'&&!(relay.protocol==='http:'&&['127.0.0.1','localhost'].includes(relay.hostname)))){
  throw Error('SEED_REQUEST_JOB_CONFIG');
 }
 const identity=parseSelector(selector);
 if(!identity)throw Error('SEED_REQUEST_SELECTOR');
 const url=new URL('/api/seed-admin/game-request-evidence',relay);
 return {...identity,async update(ref,ended){
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
   headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({selector:identity.key,kind:'generating',ref,ended})});
  if(!response.ok)throw Error('SEED_REQUEST_JOB_HTTP_'+response.status);
 }};
}
async function main(argv){const args=argv.slice(2);const all=n=>{const out=[];for(let i=args.indexOf(n);i>=0;i=args.indexOf(n)){out.push(args[i+1]);args.splice(i,2);}return out;};
 const roots=all('--root');if(!roots.length)roots.push('E:\\MeguLit-Test-1421','E:\\MeguLit');
 const seedArg=all('--seed')[0]||'',out=all('--out')[0]||'H:\\MeguLit-Work\\The Seed',seed=seedArg||path.join(ROOT,'The Seed'),only=all('--only')[0]||'';
 const ownerOk=new Set((readJson(all('--owner-ok')[0]||path.join(__dirname,'owner-ok.json'))||[]).map(String));
 const requestJob=requestJobOf(all('--request-selector')[0],all('--request-relay')[0]);
 fs.mkdirSync(out,{recursive:true});
 const logs=new Map(),games=new Map();
 for(const r of roots){if(!fs.existsSync(r)){console.error('skip '+r+' (not found)');continue;}
  const L=path.join(r,'logs');logs.set(r,{hook:readText(path.join(L,'hook-events.log.previous'))+'\n'+readText(path.join(L,'hook-events.log')),reader:readText(path.join(L,'reader-host.log.previous'))+'\n'+readText(path.join(L,'reader-host.log'))});
  const launch=launches(r);
  for(const g of library(r)){const k=g.exe.toLowerCase()||g.id;const cur=games.get(k)||{...g,wins:[]};cur.wins.push(...(launch.get(g.id)||[]).map(w=>({...w,root:r})));if(!cur.ot&&g.ot)cur.ot=g.ot;games.set(k,cur);}}
 const versionsWritten=new Map();const list=[...games.values()].map(g=>({g,slug:(()=>{try{return slugOf(g,Profiles.profileFor({exe:path.basename(g.exe),title:g.title}).gameKey);}catch{return g.title;}})()})).sort((a,b)=>a.slug<b.slug?-1:1);
 const rows=[];for(const {g} of list){if(only&&!g.title.includes(only))continue;
  try{rows.push(await seedOne(g,logs,g.wins,{out,seed,ownerOk,versionsWritten,requestJob}));}catch(e){rows.push({name:nameOf(g),engine:engineOf(g)||'unknown',state:'skip',look:['出错：'+e.message]});}}
 const dup=new Map();for(const r of rows)if(r.slug){const k=r.engine+'/'+r.slug;if(dup.has(k))r.look.push('slug 和 '+dup.get(k)+' 重复：在 tools/diff-maker/slugs.json 里分开');dup.set(k,r.name);}
 const order=['verified','owner-ok','read','skeleton','skip'];rows.sort((a,b)=>order.indexOf(a.state)-order.indexOf(b.state)||(a.engine<b.engine?-1:a.engine>b.engine?1:0));
 summary(rows,out);const n=s=>rows.filter(r=>r.state===s).length;
 console.log('The Seed: '+rows.length+' games, verified '+n('verified')+', owner-ok '+n('owner-ok')+', read '+n('read')+', skeleton '+n('skeleton')+', skip '+n('skip')+'\n  '+path.join(out,'report.md'));return 0;}
if(require.main===module)main(process.argv).then(c=>{process.exitCode=c;},e=>{console.error(e);process.exitCode=1;});
module.exports={library,launches,engineOf,nameOf,slugOf,pinned,seedOne,summary,main,STATUS};
