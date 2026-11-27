#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter: the one entry for adapting a game (owner: 不再一部一部写适配脚本，合成一个半自动适配器；以后所有适配都走它).
   Four layers, each in its place: kernel (never changed for one game) -> engine layer (RRFZ's script readers in
   services/original-engines, the draw hooks in native/megulithook + tools/engine-sigs, engine-level hides; the rule table
   tools/megulit-adapter/engines.cjs) -> game diff (The Seed data only) -> upload (a PR).

     node tools/megulit-adapter.cjs <game folder> [--exe <rel>] [--vndb v123] [--release "DL 版"] [--out <dir>] [--budget-min 10]
                                    [--foreground] [--real-input] [--offline] [--no-pairing] [--skip] [--force] [--app <MeguLit install>] [--answer id=value ...]
         identify (VNDB + release, HANDOFF) -> engine -> static study (craft-anything) -> script probe (RRFZ readers) -> plan (text source, pairing, hide) -> zero-latency pairing when a translation sits with the game (pairing.cjs)
         -> live check: the game run with the hook and the hide (tools/megulit-adapter/cold.cjs; --foreground when the owner is away),
            a person looks at a few lines: the line changes, the original is hidden, the choice -> seed -> publish
         --cold  Cardinal replays the run as well, a background supplement: its scores are noted, never a gate
   2026-11-27 (owner: 不再用冷测试加 Cardinal 打分来验证适配，改成实机验证，RRFZ 的路子): Cardinal no longer decides; the person's look does
     node tools/megulit-adapter.cjs answer <out dir> id=value ...    answer the questions; when none is left the seed is written
     node tools/megulit-adapter.cjs publish <out dir> --repo <checkout on a branch> [--go]
                                    the seed into The Seed/, a commit, a PR, the HANDOFF row (dry run without --go)
     node tools/megulit-adapter.cjs auto <download folder> [--name <short>] [--issue N] [--pr N] [--no-publish]
                                    a finished download to the owner's test card with no person and no LLM: install, adapt (--tester),
                                    PR, test build, checklist + card; a stuck note where a person decides (tools/megulit-adapter/auto.cjs)
     node tools/megulit-adapter.cjs craft <game folder> [--exe <rel>] [--out <dir>]
                                    the static study alone: craft-anything (MEGULIT_CRAFT_CLI) reads the program, never runs it:
                                    engine words, text APIs, hide advice -> <out>/craft/report.md (a normal run does it too; --no-craft skips)
     node tools/megulit-adapter.cjs skeleton <folder>... [--scan <library root>]... [--offline]
                                    skeleton seeds for a whole batch, offline, with a confidence list (tools/megulit-adapter/skeleton.cjs)
     node tools/megulit-adapter.cjs inventory [--json]                what every engine has (from the code)
     node tools/megulit-adapter.cjs testbuild <target> [--app <MeguLit>] the tester's side-by-side MeguLit with this checkout's code
     node tools/megulit-adapter.cjs cold <game folder> ...            the cold stage alone (the old adapt-auto command line)

   Exit codes: 0 done, 1 fail, 2 inconclusive, 3 waiting for a person (<out>/review.html shows each question with its pictures).
   State: <out>/adapter.json (everything decided, every answer); nothing is written into the game folder. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Copies=require('./game-copies.cjs'),SecondOpinion=require('./megulit-adapter/second-opinion.cjs'),Cold=require('./megulit-adapter/cold.cjs'),Engines=require('./megulit-adapter/engines.cjs'),Ident=require('./megulit-adapter/identify.cjs'),Craft=require('./megulit-adapter/craft.cjs');
const {plan,STEPS}=require('./megulit-adapter/plan.cjs'),Check=require('./megulit-adapter/checkpoints.cjs'),Install=require('./megulit-adapter/install.cjs'),Pairing=require('./megulit-adapter/pairing.cjs');
const REPO=path.join(__dirname,'..');
const EXIT={done:0,fail:1,inconclusive:2,human:3};
const GAME_LOCK=process.env.MEGULIT_GAME_LOCK||path.join(Cold.RUNS_ROOT,'.game.lock');
const STALE_MS=20*60000,STALE_ONCE_MS=180*60000;

function parseRun(argv){const a=argv.slice(2),o={steamAppId:'',copy:false,net:true,external:true,dir:'',exe:'',vndb:'',release:'',cn:'',out:'',budgetMin:10,foreground:false,offline:false,skip:false,force:false,app:Cold.APP_DEFAULT,answers:[],lockWaitMin:60,cold:false};
 for(let i=0;i<a.length;i++){const k=a[i],v=()=>{if(i+1>=a.length)throw Error(k+' needs a value');return a[++i];};
  if(k==='--exe')o.exe=v();else if(k==='--vndb')o.vndb=v().toLowerCase();else if(k==='--release')o.release=v();else if(k==='--cn')o.cn=v();else if(k==='--out')o.out=v();
  else if(k==='--budget-min')o.budgetMin=Number(v());else if(k==='--app')o.app=v();else if(k==='--answer')o.answers.push(v());else if(k==='--lock-wait-min')o.lockWaitMin=Number(v());
  else if(k==='--foreground')o.foreground=true;else if(k==='--real-input')o.realInput=true;else if(k==='--offline')o.offline=true;else if(k==='--no-net')o.net=false;else if(k==='--no-external')o.external=false;else if(k==='--no-pairing')o.pairing=false;else if(k==='--copy')o.copy=true;else if(k==='--steam-appid')o.steamAppId=v();else if(k==='--skip')o.skip=true;else if(k==='--force')o.force=true;else if(k==='--cold')o.cold=true;else if(k==='--no-craft')o.craft=false;else if(k==='--no-install')o.install=false;
  else if(!k.startsWith('--')&&!o.dir)o.dir=k;else throw Error('unknown argument: '+k);}
 if(!o.dir)throw Error('usage: node tools/megulit-adapter.cjs <game folder> [--vndb v123] [--release "DL 版"] [--foreground] [--offline]');
 if(o.vndb&&!Ident.VNDB.test(o.vndb))throw Error('--vndb is v<number>');
 if(!(o.budgetMin>0&&o.budgetMin<=60))throw Error('--budget-min must be 1..60');
 return o;}

/* ---- the machine-wide game lock (megulit-game-test: one game at a time; 20 minutes without a refresh is stale) ---------------- */
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* tools/game-copies.cjs: the lock is the game folder's own (normally this agent's copy), so different games and different copies run
   at once; with no folder it is the old machine-wide file (same format and rules as before) */
const gameLock=(owner,game,opts={})=>Copies.gameLock(owner,game,{file:GAME_LOCK,...opts});

/* ---- the script probe: RRFZ's readers over the folder (counts only, no text) ------------------------------------------------ */
function probe(loc,title,budgetMs){try{const P=require('../services/adapter-probe-core.cjs');const r=P.probeGame({dir:loc.gameDir,executable:loc.exe,title},{budgetMs});
  return {step:r.step,detail:r.detail,detected:r.detected,lines:r.lines,japaneseLines:r.japaneseLines,dialogueLines:r.dialogueLines,chineseLines:r.chineseLines,original:r.original,restore:r.restore,tried:r.tried,ms:r.ms,engines:(r.engines||[]).map(e=>({id:e.id,lines:e.lines,japaneseLines:e.japaneseLines,chineseLines:e.chineseLines,error:e.error||undefined}))};}
 catch(e){return {step:'error',detail:String(e.message||e).slice(0,200),detected:null,lines:0,japaneseLines:0,chineseLines:0};}}

/* disc images under the folder (four levels): a game that ships as an image has to be installed first; a .cue beside .wav / .flac is a
   soundtrack, not a game disc */
const DISC=/.(iso|mds|mdf|cue|ccd|img|nrg|cdi|chd|b5t|b6t|isz)$/i;
function discImages(dir,depth=4,out=[]){let ents=[];try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}for(const e of ents){const f=path.join(dir,e.name);if(e.isDirectory()){if(depth>0)discImages(f,depth-1,out);}else if(DISC.test(e.name)&&!(/.cue$/i.test(e.name)&&ents.some(x=>/.(wav|flac|ape)$/i.test(x.name))))out.push(f);}return out;}
const withVndbNotes=(p,i)=>{const v=i.vndbLookup;if(v?.engineDiffers)p.notes.push('VNDB 记的引擎是 '+v.engine+'，和认出的不一样：先核对');if(v?.error)p.notes.push('VNDB 没查到（'+v.error+'），作品号 / 发行版问人');return p;};
/* the registry did not know the engine: LunaHook's static checks name one (only then; an engine the registry named but the rule table
   lacks keeps its name, 樟脑丸: DDSystem, not LunaHook's loose EntisGLS check) (registry.lunaHook); the first class the rule table maps is
   taken, the others only go into the question */
function lunaCaps(caps,gameDir,engine=''){if(caps.known)return caps;let hits=[];try{hits=require('../services/original-engines/registry.cjs').lunaHook(gameDir);}catch{}
 const names=[...new Set(hits.map(h=>h.cls))];const mapped=names.find(n=>Engines.lunaRule(n));
 if(mapped&&!engine)return {...Engines.capabilities(Engines.lunaRule(mapped)),luna:mapped,lunaStatic:true};return names.length?{...caps,luna:names.join(' / ')}:caps;}
/* 2026-11-27 (E: nearly full): the game's own copy for testing goes to MEGULIT_ADAPTER_GAMES (else beside the runs root),
   never on a drive of MEGULIT_ADAPTER_NO_DRIVES (default C and E); the target drive must keep MIN_FREE free after the copy. A copy already there (same name) is kept */
/* where a run's pictures and logs go: MEGULIT_ADAPTER_OUT (on our PC a big data drive, see the megulit-adapter skill), else beside the
   cold stage's runs root; the shared game lock and the copied app stay in that runs root */
const OUT_ROOT=()=>process.env.MEGULIT_ADAPTER_OUT||path.join(Cold.RUNS_ROOT,'adapter-out');
const GAMES_ROOT=()=>process.env.MEGULIT_ADAPTER_GAMES||path.join(Cold.RUNS_ROOT,'adapter-games'),MIN_FREE=15*2**30;
function treeBytes(d){let n=0;const walk=x=>{let e=[];try{e=fs.readdirSync(x,{withFileTypes:true});}catch{return;}for(const y of e){const f=path.join(x,y.name);if(y.isDirectory())walk(f);else if(y.isFile())try{n+=fs.statSync(f).size;}catch{}}};walk(d);return n;}
function copyGame(src,{root=GAMES_ROOT(),statfs=fs.statfsSync,noDrives=process.env.MEGULIT_ADAPTER_NO_DRIVES??'C,E'}={}){const dir=path.join(root,Cold.safeName(Cold.titleOf(src)));
 const drive=(/^([A-Za-z]):/.exec(path.resolve(dir))||[])[1]||'';if(drive&&String(noDrives).toUpperCase().split(/[,\s]+/).includes(drive.toUpperCase()))throw Error('copies never go to C: or E: ('+dir+'); set MEGULIT_ADAPTER_GAMES');
 if(fs.existsSync(dir)&&fs.readdirSync(dir).length)return {dir,reused:true,bytes:0};
 const bytes=treeBytes(src);fs.mkdirSync(root,{recursive:true});const st=statfs(root),free=Number(st.bavail)*Number(st.bsize);
 if(free-bytes<MIN_FREE)throw Error('not enough space on '+root+': '+Math.round(free/2**30)+' GB free, the copy needs '+Math.round(bytes/2**30)+' GB and 15 GB must stay free');
 fs.cpSync(src,dir,{recursive:true});return {dir,reused:false,bytes};}
const stateFile=out=>path.join(out,'adapter.json');
const readState=out=>JSON.parse(fs.readFileSync(stateFile(out),'utf8'));
function saveState(st){st.updatedAt=new Date().toISOString();fs.writeFileSync(stateFile(st.out),JSON.stringify(st,null,1));}
const coldView=c=>c?{lunaEngine:c.layers?.engine?.lunaEngine||'',shots:c.shots,verdict:c.verdict,reasons:c.reasons,checks:c.checks,stuck:c.stuck,phases:c.phases,totalMs:c.totalMs,steps:c.steps,cardinal:c.cardinal,exeSha256:c.exeSha256,hide:c.hide,artifacts:c.artifacts&&{out:c.artifacts.out,diff:c.artifacts.diff,run:c.artifacts.run}}:null;
function summary(st){const p=st.plan,c=st.cold,i=st.identity;return [
 '引擎：'+st.engine+'（'+(st.caps.label||'规则表没有')+'）',
 '作品：'+(st.answers.vndb||i.vndb||'未知')+'，发行版：'+(st.answers.release||i.release||i.releaseGuess||'未知'),
 '原文来源：'+(p.source.kind==='script'?'剧本读取 '+p.source.reader+'（日文 '+p.source.japaneseLines+' 行）':'钩子流（'+p.source.why+'）')+'；对齐：'+p.align,
 '配对：'+p.pairing.mode+(p.pairing.chineseLines?'（中文 '+p.pairing.chineseLines+' 行）':'')+'；隐藏：'+(p.hide.kind==='engine'?'引擎级 '+p.hide.file:'通用层'),
 Pairing.line(st.pairing),
 '实机验证：'+(c?c.verdict+'；'+(c.reasons||[]).slice(0,4).join('；'):st.offline?'没跑（--offline）':'没跑'),
 ...p.notes];}
function finish(st,log){const qs=Check.questions({install:st.install||[],identity:{...st.identity,vndb:st.answers.vndb||st.identity.vndb,release:st.answers.release||st.identity.release,cn:st.answers.cn||st.identity.cn},caps:st.caps,cold:st.cold,coldOut:st.cold?.artifacts?.out||'',force:st.force,pairing:st.pairing});
 st.questions=qs;const open=Check.open(qs,st.answers);st.review=Check.review(path.join(st.out,'review.html'),{title:'MeguLit-Adapter：'+st.title,summary:summary(st)},qs,st.answers);
 if(open.length){st.state='waiting';saveState(st);log('# 等人确认（'+open.length+' 个）：'+st.review);for(const q of open)log('  '+q.id+'：'+q.ask+(q.evidence.length?'  证据 '+q.evidence.join(' , '):''));return EXIT.human;}
 if(st.answers.again!==undefined&&!Check.yes(st.answers.again)){st.state='skipped';saveState(st);log('# 已适配过，不重做');return EXIT.done;}
 if(!st.cold||st.cold.verdict==='inconclusive'){st.state='inconclusive';saveState(st);return EXIT.inconclusive;}
 const status=Check.status({cold:st.cold},st.answers);st.status=status;
 if(!status){st.state='fail';saveState(st);return EXIT.fail;}
 try{st.seed=writeSeed(st,status);st.handoffRow=handoffRow(st);st.prBody=prBody(st);fs.writeFileSync(path.join(st.out,'handoff-row.md'),st.handoffRow+'\n');fs.writeFileSync(path.join(st.out,'pr-body.md'),st.prBody);st.state='ready';}
 catch(e){st.state='fail';st.seedError=String(e.message||e);}
 saveState(st);log('# '+st.state+(st.seed?' seed '+st.seed:'')+(st.seedError?' '+st.seedError:''));return st.state==='ready'?EXIT.done:EXIT.fail;}

/* ---- layer 4: the seed. The cold stage's diff (game + version documents) with what the adapter knows on top: status from the
   answers, the VNDB print, the prints that name this build (ext.versionPrints, source.versionMatch 'prints'), the pairing ----- */
function writeSeed(st,status){const SeedFormat=require('../core/profiles/seed.cjs');const diff=st.cold?.artifacts?.diff;if(!diff)throw Error('no diff to make a seed from');
 const exeSha=st.cold.exeSha256||st.identity.prints.exe;const dir=Cold.writeSeed(diff,{engine:st.engine,title:st.title,titles:[st.folderTitle],slug:Cold.slugOf(st.identity.romaji),slugHint:Ident.slugFrom(st.title,st.identity.latin||st.identity.romaji),exeName:path.basename(st.exe),exeSha,gameKey:st.gameKey||''},path.join(st.out,'seed'));
 const gf=path.join(dir,'game.json'),g=JSON.parse(fs.readFileSync(gf,'utf8'));const vndb=st.answers.vndb||st.identity.vndb,release=st.answers.release||st.identity.release||st.identity.releaseGuess;
 g.status=status;if(status==='read'){g.mode='read';g.settings.hide={...(g.settings.hide||{}),textEffectsRead:true};}else if(g.mode==='read')g.mode='hide';
 if(vndb)g.prints={...(g.prints||{}),vndb};
 g.settings.source={...(g.settings.source||{}),versionMatch:'prints'};
 g.settings.lang={...(g.settings.lang||{}),ja:{...(g.settings.lang?.ja||{}),pairing:st.plan.pairing.mode}};
 const pr=st.identity.prints,vp={};for(const k of ['head','pe','data','pack'])if(pr[k])vp[k]=pr[k];
 g.ext={...(g.ext||{}),versionPrints:{[exeSha]:vp},adapter:{tool:'megulit-adapter',vndb:vndb||'',release:release||'',source:st.plan.source.kind==='script'?'script:'+st.plan.source.reader:'hook:'+st.plan.align,hide:st.plan.hide.kind==='engine'?'engine:'+path.basename(st.plan.hide.file):'generic',pairing:st.plan.pairing.mode}};
 const r=SeedFormat.check(g,{engine:st.engine,slug:g.slug});if(!r.ok)throw Error('game seed: '+r.errors.join('; '));
 fs.writeFileSync(gf,JSON.stringify(g,null,1)+'\n');return dir;}
function handoffRow(st){const g=JSON.parse(fs.readFileSync(path.join(st.seed,'game.json'),'utf8'));const vndb=st.answers.vndb||st.identity.vndb||'待补',release=st.answers.release||st.identity.release||st.identity.releaseGuess||'待补';
 return '| '+st.title+' | '+vndb+' | '+release+' | '+(st.caps.label||st.engine)+' | '+(g.status==='verified'?'verified':g.status==='read'?'read':'进行中')+' | 魚魚棟 · Claude | '+st.engine+'/'+g.slug+'（MeguLit-Adapter） |';}
/* AGENTS.md: Chinese, three parts 问题 / 改动 / 验证, a work named 「原名（中文名）」, only what was verified */
const workName=st=>{const cn=String(st.answers.cn||'').trim();return st.title+(cn&&cn!=='-'?'（'+cn+'）':'');};
function prBody(st){const c=st.cold||{},g=JSON.parse(fs.readFileSync(path.join(st.seed,'game.json'),'utf8'));return ['## 问题','',workName(st)+'（VNDB '+(st.answers.vndb||st.identity.vndb||'未知')+'，'+(st.answers.release||st.identity.release||st.identity.releaseGuess||'发行版未知')+'）还没有 The Seed 适配。','',
 '## 改动','','只加 `The Seed/'+st.engine+'/'+path.basename(st.seed)+'/`（纯数据，status '+g.status+'），由 MeguLit-Adapter 生成：',...summary(st).map(s=>'- '+s),'- 版本层另记 exe 头尾 / PE 版本 / 剧本指纹 / 主封包指纹（`ext.versionPrints`，`source.versionMatch: prints`），补丁和汉化后的 exe 也认得','',
 '## 验证','','- 实机验证（开游戏'+(st.foreground?'前台':'隐藏桌面')+'跑几句，静音）：'+(c.verdict||'没跑'),...(c.reasons||[]).map(r=>'  - '+r),'- 人看截图确认：',...(st.questions||[]).map(q=>'  - '+q.ask+' → '+(st.answers[q.id]??'未答')),'- 截图是游戏画面，没有 MeguLit 阅读层：选项译文要在 MeguLit 里再看一眼（未验证译文画面）','',...issueLine(st,g)].join('\n');}
/* 2026-11-27 (アイキス3 sexy #1109) the request issue (answer issue=<n>): AGENTS.md, only a verified seed closes it, anything less is Refs */
function issueLine(st,g){const n=String(st.answers.issue||'').replace(/^#/,'');if(!/^\d{1,7}$/.test(n))return [];return [(g.status==='verified'?'Fixes #':'Refs #')+n,''];}

async function pairingStep(st,loc,pr,log){const hints=Pairing.chineseHints(loc.gameDir,loc.exe);if(!Pairing.need(hints,pr))return null;
 st.pairing={hints,...await Pairing.check({exe:loc.exe})};
 if(st.pairing.status==='ready')st.plan.pairing={mode:'patch',reader:st.plan.source.reader||'',chineseLines:st.pairing.translations,how:'original-text patch '+path.basename(st.pairing.source)};
 log('# '+Pairing.line(st.pairing));saveState(st);return st.pairing;}
/* craftStage(loc, caps, out) -> null (craft-anything not set up on this PC) | {view, line, notes, caps?}: caps is set only when the rule
   table had no engine and craft-anything names one it has (craftStatic); an engine the rule table lacks stays unknown with its name */
function craftStage(loc,caps,out,crafter=Craft.study){const rep=crafter({gameDir:loc.gameDir,exe:loc.exe,out});if(!rep.ok&&/not set/.test(rep.error))return null;
 const s=Craft.suggest(rep,caps);let next=null;const notes=[...s.notes];
 if(rep.ok&&!caps.known&&s.engine){if(Engines.RULES[s.engine]&&s.strong){next={...Engines.capabilities(s.engine),craft:s.engine,craftStatic:true};notes.push('引擎由 craft-anything 静态认出（'+s.engineWhy+'）：特征写回 services/original-engines/registry.cjs 或 engines.cjs');}else next={...caps,craft:s.engine};}
 try{fs.mkdirSync(path.join(out,'craft'),{recursive:true});fs.writeFileSync(path.join(out,'craft','report.md'),Craft.markdown(rep,s,{title:path.basename(loc.gameDir),adapterEngine:caps.known?caps.id:''}));}catch{}
 const view={ok:rep.ok,error:rep.error,version:rep.version,engine:s.engine,engineWhy:s.engineWhy,agrees:s.agrees,hide:s.hide,textApis:rep.textApis.map(t=>t.id),freetype:rep.freetype,unity:rep.unity,report:path.join(out,'craft','report.md')};
 return {view,line:Craft.note(rep,s),notes,caps:next};}
/* node tools/megulit-adapter.cjs craft <game folder> [--exe <rel>] [--out <dir>]: the static study alone (no game run, no VNDB, no lock) */
function craftCmd(args,{log=console.log,crafter}={}){let dir='',exe='',out='';for(let i=0;i<args.length;i++){if(args[i]==='--exe')exe=args[++i];else if(args[i]==='--out')out=args[++i];else if(!dir)dir=args[i];}
 if(!dir)throw Error('usage: craft <game folder> [--exe <rel>] [--out <dir>]');dir=path.resolve(dir);const title=Cold.titleOf(dir);out=path.resolve(out||path.join(OUT_ROOT(),Cold.safeName(title)));
 const loc=Cold.locate(dir,exe);if(!loc){log('# 找不到主程序（用 --exe 指定）');return EXIT.inconclusive;}
 const caps=lunaCaps(Engines.capabilities(loc.engine),loc.gameDir,loc.engine);const cr=craftStage(loc,caps,out,crafter);
 if(!cr){log('# MEGULIT_CRAFT_CLI 没设：craft-anything-cli.exe 的路径');return EXIT.inconclusive;}
 log('# '+title+' 规则表 '+(caps.known?caps.id:'认不出')+(caps.luna?' (LunaHook '+caps.luna+')':''));log('# '+(cr.view.ok?cr.line:cr.view.error));for(const n of cr.notes)log('  '+n);log('# '+cr.view.report);
 return cr.view.ok?EXIT.done:EXIT.inconclusive;}

async function run(o,{log=console.log}={}){if(o.copy){const c=copyGame(path.resolve(o.dir));log('# own copy '+c.dir+(c.reused?' (kept)':' ('+Math.round(c.bytes/1048576)+' MB)'));o={...o,dir:c.dir};}
 const dir=path.resolve(o.dir),title=Cold.titleOf(dir),out=path.resolve(o.out||path.join(OUT_ROOT(),Cold.safeName(title)));
 fs.mkdirSync(out,{recursive:true});
 if(!fs.existsSync(dir)){log('# 游戏目录不存在：'+dir+'（Git Bash 的 /e/... 带 [ ] 时不转换，用 E:/...）');return EXIT.inconclusive;}
 const triage=Cold.unsupported(dir);if(triage&&!/光盘/.test(triage)){log('# '+triage);return EXIT.inconclusive;}
 const discs=discImages(dir),loc=/光盘/.test(triage)?null:Cold.locate(dir,o.exe);
 /* 2026-11-27 (アイキス3 sexy) only disc images: installed by tools/megulit-adapter/install.cjs (the image read out by core/disc-image.cjs, the
    installer's files dropped, the updates checked against their UpdateInf.dat) into MEGULIT_ADAPTER_GAMES, then the run goes on in the installed folder; what it
    cannot install (bin+cue, two game discs, no space) still asks a person */
 if(!loc&&discs.length&&o.install!==false){const r=await (o.installer||Install.install)(dir,{root:GAMES_ROOT()});
  if(r.ok){log('# installed '+r.dir+(r.reused?' (kept)':' ('+r.copied+' files)')+(r.updates.length?' + '+r.updates.map(u=>u.version).join(', '):'')+(r.bonus.length?'; bonus discs not installed: '+r.bonus.length:''));
   return run({...o,dir:r.dir,release:o.release||'',releaseGuess:r.release,install:false,out:o.out||out},{log});}
  log('# 自动安装没成：'+r.why);}
 if(!loc&&discs.length){const st={tool:'megulit-adapter',out,title,dir,exe:'',engine:'',caps:{known:true},probe:null,identity:{vndb:o.vndb,release:o.release,releaseGuess:'',prints:{},adapted:[]},plan:{source:{kind:'hook',why:'not installed'},align:'hook',pairing:{mode:'machine'},hide:{kind:'generic'},notes:['只有光盘镜像，先安装']},install:discs,steps:STEPS,cold:null,answers:Check.parseAnswers(o.answers),force:o.force,offline:true,startedAt:new Date().toISOString()};saveState(st);return finish(st,log);}
 if(!loc){log('# 找不到主程序（用 --exe 指定）');return EXIT.inconclusive;}
 let caps=lunaCaps(Engines.capabilities(loc.engine),loc.gameDir,loc.engine);if(caps.lunaStatic)loc.engine=caps.id;log('# '+title+' '+(loc.engine||'?')+(caps.luna?' (LunaHook '+caps.luna+')':'')+' '+loc.exe);
 /* 2026-11-28 the static study (craft-anything, tools/megulit-adapter/craft.cjs) before the game ever runs: an engine the registry and
    LunaHook did not name is taken from the program's own words and goes through the same probe, plan, live check and questions;
    the import table says which text API draws the line, so the plan says early when the generic hide layers cannot catch it */
 const cr=o.craft===false?null:craftStage(loc,caps,out,o.crafter);if(cr?.caps){caps=cr.caps;loc.engine=caps.id;}
 if(cr)log('# craft '+(cr.view.ok?cr.line:cr.view.error));
 const pr=probe(loc,title,90000);log('# probe '+pr.step+' '+(pr.detected||'-')+' jp='+pr.japaneseLines+' zh='+pr.chineseLines);
 const readers=[...new Set([pr.detected,...caps.readers].filter(Boolean))];
 const identity=Ident.identify({gameDir:loc.gameDir,exe:loc.exe,engine:loc.engine,title,vndb:o.vndb,release:o.release,chineseBuild:pr.step==='chinese-build',readers});
 if(o.steamAppId)identity.steamAppId=o.steamAppId;
 /* the release word of the disc folder an install came from (パッケージ版, DL版 …) */
 if(!identity.releaseGuess&&o.releaseGuess)identity.releaseGuess=o.releaseGuess;
 /* VNDB: the work, the release, the Chinese title, VNDB's engine (an answer only when unambiguous; --no-net or an error asks a person) */
 if(o.net){const v=await Ident.vndb({title,gameDir:loc.gameDir,vnid:o.vndb||identity.vndb,chineseBuild:pr.step==='chinese-build',engine:loc.engine});identity.steamAppId=o.steamAppId||v.steamAppId||'';identity.steamCandidates=v.steamCandidates||[];identity.vndbLookup={how:v.how,release:v.release,releaseHow:v.releaseHow,candidates:v.candidates,engine:v.vndbEngine,engineDiffers:v.engineDiffers,error:v.error,releases:v.releases.map(r=>({rid:r.rid,title:r.title,engine:r.engine,langs:r.langs,patch:r.patch,official:r.official,ext:r.ext}))};
  if(!identity.vndb&&v.vndb)identity.vndb=v.vndb;if(v.cn)identity.cn=v.cn;if(v.latin)identity.latin=v.latin;if(v.ja)identity.ja=v.ja;if(v.romaji)identity.romaji=v.romaji;if(!identity.release&&v.release)identity.release=v.release;identity.releaseCandidates=v.candidates;
  if(v.vndb)identity.adapted=Ident.sameRelease(Ident.adaptedRows(Ident.handoffText()),identity.vndb,identity.release||identity.releaseGuess);}
 const st={tool:'megulit-adapter',out,title:identity.ja||title,folderTitle:title,foreground:o.foreground,dir,exe:loc.exe,gameDir:loc.gameDir,engine:loc.engine,engineWhy:loc.why,caps,probe:pr,identity,plan:withVndbNotes(plan({caps,probe:pr}),identity),steps:STEPS,craft:cr?.view||null,cold:null,answers:Check.parseAnswers(o.answers),force:o.force,offline:o.offline,startedAt:new Date().toISOString()};
 if(cr?.view.ok)st.plan.notes.push(cr.line,...cr.notes);
 if(o.vndb)st.answers.vndb=st.answers.vndb||o.vndb;if(o.cn)st.answers.cn=st.answers.cn||o.cn;if(o.release)st.answers.release=st.answers.release||o.release;
 /* our readers read nothing: GalTransl's detect + extractor as a second opinion (evidence and a porting pointer, never the text) */
 if(o.external&&SecondOpinion.wanted({probe:pr,caps})){st.external={galtransl:SecondOpinion.secondOpinion({gameDir:loc.gameDir,out})};const n=SecondOpinion.note(st.external.galtransl);if(n)st.plan.notes.push(n);log('# second opinion '+(n||st.external.galtransl.error));}
 saveState(st);
 /* 2026-11-28 a translation with the game: MeguLit's own zero-latency search must pair it before the adaptation is ready */
 if(o.pairing!==false)await pairingStep(st,loc,pr,log);
 if((identity.adapted||[]).some(r=>r.same)&&!o.force&&st.answers.again===undefined)return finish(st,log);
 if(!o.offline){const release=await gameLock('megulit-adapter',Cold.safeName(title),{dir:loc.gameDir,waitMs:o.lockWaitMin*60000,log});if(!release){log('# 游戏锁等不到');st.cold=null;return finish(st,log);}
  try{const r=await Cold.run({dir,exe:o.exe,out:path.join(out,'cold'),budgetMin:o.budgetMin,app:o.app,foreground:o.foreground,realInput:o.realInput===true,seedOut:'',skip:o.skip,steamAppId:identity.steamAppId||'',vndb:identity.vndb||'',live:true,cardinal:o.cold===true},{log});st.cold=coldView(r);st.gameKey=r.gameKey;
   const luna=r.layers?.engine?.lunaEngine||'';if(luna){st.lunaRuntime=luna;const id=Engines.lunaRule(luna);if(!st.caps.known&&id){st.caps={...Engines.capabilities(id),luna,lunaRuntime:true};st.engine=id;st.plan=withVndbNotes(plan({caps:st.caps,probe:st.probe}),st.identity);st.plan.notes.push('引擎由 LunaHook 运行时认出（'+luna+'），写回 engines.cjs / registry');}}}
  catch(e){st.cold={verdict:'inconclusive',reasons:['冷测试出错：'+e.message],checks:{},stuck:'',artifacts:{out:path.join(out,'cold')}};}
  finally{release();}}
 return finish(st,log);}

function answer(out,args,{log=console.log}={}){const st=readState(path.resolve(out));Object.assign(st.answers,Check.parseAnswers(args));return finish(st,log);}

/* ---- publish: the seed into a checkout on its own branch, a commit, a PR; the HANDOFF row straight to main (HANDOFF rule 7) ---- */
function sh(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',windowsHide:true,timeout:300000});if(r.status!==0)throw Error(cmd+' '+args.join(' ')+': '+String(r.stderr||r.stdout||r.error?.message).slice(-400));return String(r.stdout||'').trim();}
function addHandoffRow(text,row){const lines=text.split('\n');let at=-1,on=false;for(let i=0;i<lines.length;i++){if(/^##\s/.test(lines[i])){if(on)break;on=/已适配的游戏/.test(lines[i]);continue;}if(on&&/^\|/.test(lines[i]))at=i;}
 if(at<0)throw Error('HANDOFF.md has no 已适配的游戏 table');lines.splice(at+1,0,row);return lines.join('\n');}
/* 2026-11-27 (アイキス3 sexy PR #1304, CI: the-seed.test 'unexpected file lines.json'; seed-catalog-engines.test: the engine-count
   snapshot went stale) only what The Seed allows goes in (game.json, story.json, versions/<sha>.json; lines.json stays local), and the
   snapshot's seed-id print (services/seed-catalog-engine-map.cjs snapshot.seedIds) is written from the checkout's seeds */
function seedFiles(src,dest){fs.mkdirSync(path.join(dest,'versions'),{recursive:true});for(const f of ['game.json','story.json'])if(fs.existsSync(path.join(src,f)))fs.copyFileSync(path.join(src,f),path.join(dest,f));
 let vs=[];try{vs=fs.readdirSync(path.join(src,'versions'));}catch{}for(const v of vs)if(/^[0-9a-f]{64}.json$/.test(v))fs.copyFileSync(path.join(src,'versions',v),path.join(dest,'versions',v));}
function withSeedIds(text,print){return String(text).replace(/(seedIds:')[0-9a-f]{64}(')/,'$1'+print+'$2');}
function refreshSeedIds(repo,run=spawnSync){const r=run(process.execPath,['-e',"process.stdout.write(require('./services/seed-catalog.cjs').seedIdsPrint())"],{cwd:repo,encoding:'utf8',windowsHide:true});
 const print=String(r.stdout||'').trim();if(!/^[0-9a-f]{64}$/.test(print))return '';const f=path.join(repo,'services','seed-catalog-engine-map.cjs');const t=fs.readFileSync(f,'utf8'),n=withSeedIds(t,print);if(n===t)return '';fs.writeFileSync(f,n);return path.relative(repo,f);}
/* 2026-11-27 (ハミダシクリエイティブ, PR #1303 CI): what goes into The Seed is only what validation/the-seed.test.cjs takes: game.json,
   story.json, versions/<exe SHA-256>.json. The adapter's lines.json (the reader's lines) stays in the run folder */
const SEED_FILE=/^(game|story)\.json$|^versions[\\/][0-9a-f]{64}\.json$/;
function copySeedFiles(src,dest){const out=[];const walk=rel=>{for(const e of fs.readdirSync(path.join(src,rel),{withFileTypes:true})){const r=rel?path.join(rel,e.name):e.name;
  if(e.isDirectory()){walk(r);continue;}if(!SEED_FILE.test(r))continue;fs.mkdirSync(path.dirname(path.join(dest,r)),{recursive:true});fs.copyFileSync(path.join(src,r),path.join(dest,r));out.push(r);}};
 walk('');return out;}
/* The Seed's engine overview ships a count snapshot keyed to the seeded VNDB ids (services/seed-catalog-engine-map.cjs seedIds); a
   new seeded work changes the key (validation/seed-catalog-engines.test.cjs) and leaves that engine's count of not-yet-seeded works
   one lower. bumpSnapshot(text, fp, engine, isNew) -> the new file text ('' when nothing changes) */
function bumpSnapshot(text,fp,engine,isNew){const m=/seedIds:'([0-9a-f]{64})'/.exec(text);if(!m||m[1]===fp)return '';
 let t=text.replace(m[0],"seedIds:'"+fp+"'");if(isNew&&engine)t=t.replace(new RegExp('(\\n\\s*'+engine.replace(/[^a-z0-9_]/gi,'')+':)(\\d+)'),(s,a,n)=>a+Math.max(0,Number(n)-1));return t;}
function updateCatalogSnapshot(repo,engine){const file=path.join(repo,'services','seed-catalog-engine-map.cjs');if(!fs.existsSync(file))return '';
 const r=spawnSync(process.execPath,['-e',"const c=require('./services/seed-catalog.cjs');const ids=[...new Set(c.seedList().map(g=>g.vndb).filter(Boolean))].sort();console.log(require('crypto').createHash('sha256').update(JSON.stringify(ids)).digest('hex'))"],{cwd:repo,encoding:'utf8',windowsHide:true});
 const fp=String(r.stdout||'').trim();if(!/^[0-9a-f]{64}$/.test(fp))return '';const t=bumpSnapshot(fs.readFileSync(file,'utf8'),fp,engine,true);if(!t)return '';
 fs.writeFileSync(file,t);return 'seed-catalog snapshot: seedIds -> '+fp.slice(0,12)+', '+engine+' -1';}
function publish(out,{repo='',go=false,log=console.log}={}){const st=readState(path.resolve(out));if(st.state!=='ready')throw Error('not ready to publish (state '+st.state+'); answer the questions first');
 if(!repo)throw Error('--repo <a MeguLit checkout on its own branch> is needed');const slug=path.basename(st.seed),dest=path.join(repo,'The Seed',st.engine,slug);
 const plan=['copy '+st.seed+' -> '+dest,'git add + commit "The Seed: '+st.title+'（MeguLit-Adapter）"','git push -u origin HEAD','gh pr create --body-file '+path.join(st.out,'pr-body.md'),'HANDOFF.md 已适配的游戏 += '+st.handoffRow+' (origin/main)'];
 if(!go){log('# dry run (add --go):');for(const p of plan)log('  '+p);return EXIT.done;}
 const branch=sh('git',['rev-parse','--abbrev-ref','HEAD'],repo);if(/^(main|master|HEAD)$/.test(branch))throw Error('the checkout is on '+branch+': make a branch first');
 copySeedFiles(st.seed,dest);const snap=updateCatalogSnapshot(repo,st.engine);if(snap)log('# '+snap);
 sh('git',['add','--',path.relative(repo,dest),...(snap?[path.join('services','seed-catalog-engine-map.cjs')]:[])],repo);sh('git',['commit','-m','The Seed：'+workName(st)+' 适配（MeguLit-Adapter）'],repo);sh('git',['push','-u','origin','HEAD'],repo);
 const url=sh('gh',['pr','create','--title','The Seed：'+workName(st)+' 适配（MeguLit-Adapter）','--body-file',path.join(st.out,'pr-body.md')],repo);log('# PR '+url);
 const wt=path.join(st.out,'handoff-wt');sh('git',['fetch','origin','main'],repo);sh('git',['worktree','add','--detach',wt,'origin/main'],repo);
 try{const f=path.join(wt,'HANDOFF.md');fs.writeFileSync(f,addHandoffRow(fs.readFileSync(f,'utf8'),st.handoffRow.replace(/（MeguLit-Adapter） \|$/,'（MeguLit-Adapter）'+url.replace(/.*\/pull\//,' PR #')+' |')));
  sh('git',['commit','-am','HANDOFF.md：登记 '+st.title+'（MeguLit-Adapter）'],wt);sh('git',['push','origin','HEAD:main'],wt);}
 finally{try{sh('git',['worktree','remove','--force',wt],repo);}catch{}}
 /* the tester's checklist (tools/megulit-adapter/test-request.cjs), local only */const tr=process.env.MEGULIT_TEST_REQUESTS;if(tr){try{fs.mkdirSync(tr,{recursive:true});const file=path.join(tr,url.replace(/.*\/pull\//,'')+'-'+slug+'.md');fs.writeFileSync(file,require('./megulit-adapter/test-request.cjs').testRequest(st,{pr:url,workName}));log('# test request '+file);}catch(e){log('# test request not written: '+e.message);}}
 st.pr=url;st.state='published';saveState(st);return EXIT.done;}

async function main(argv){const cmd=argv[2];
 /* the tester's build (tools/megulit-adapter/test-build.cjs): testbuild <target> [--app <installed MeguLit>] */
 if(cmd==='testbuild'){if(!argv[3])throw Error('usage: testbuild <target folder> [--app <installed MeguLit>]');const i=argv.indexOf('--app');const r=require('./megulit-adapter/test-build.cjs').testBuild(path.resolve(argv[3]),i>0&&argv[i+1]?{app:argv[i+1]}:{});console.log(JSON.stringify(r,null,1));return r.ok?0:1;}
 if(cmd==='auto')return require('./megulit-adapter/auto.cjs').main(argv.slice(3));
 /* batch skeleton seeds over many folders, offline (tools/megulit-adapter/skeleton.cjs) */
 if(cmd==='skeleton')return require('./megulit-adapter/skeleton.cjs').main(argv.slice(3));
 if(cmd==='craft')return craftCmd(argv.slice(3));
 if(cmd==='inventory'){const rows=Engines.inventory();console.log(argv.includes('--json')?JSON.stringify(rows,null,1):Engines.markdown(rows));return 0;}
 const runsGame=cmd!=='answer'&&cmd!=='publish'&&cmd!=='craft';
 if(runsGame){let app=Cold.APP_DEFAULT;const i=argv.indexOf('--app');if(i>0&&argv[i+1])app=argv[i+1];const r=Cold.reexecIfOldNode(__filename,argv,app);if(r!==null)return r;/* the game folder: the first argument that is not a flag or a flag's value (cold: after the word) */const rest=argv.slice(cmd==='cold'?3:2),VAL=/^--(exe|vndb|release|cn|out|budget-min|app|answer|lock-wait-min|steam-appid|seed-out)$/;let gd='';for(let k=0;k<rest.length;k++){if(VAL.test(rest[k])){k++;continue;}if(!rest[k].startsWith('--')){gd=rest[k];break;}}Cold.prepareRuntime(gd);}
 try{
  if(cmd==='cold')return await Cold.main([argv[0],argv[1],...argv.slice(3)]);
  if(cmd==='answer'){if(!argv[3])throw Error('usage: answer <out dir> id=value ...');return answer(argv[3],argv.slice(4));}
  if(cmd==='publish'){const a=argv.slice(4);const r=a.indexOf('--repo');return publish(argv[3],{repo:r>=0?a[r+1]:'',go:a.includes('--go')});}
  return await run(parseRun(argv));}
 catch(e){console.error('megulit-adapter: '+(e.message||e));return EXIT.inconclusive;}}
if(require.main===module)main(process.argv).then(c=>{process.exitCode=c;});
module.exports={issueLine,seedFiles,withSeedIds,refreshSeedIds,copySeedFiles,bumpSnapshot,updateCatalogSnapshot,copyGame,lunaCaps,craftStage,craftCmd,discImages,parseRun,gameLock,probe,run,answer,publish,addHandoffRow,handoffRow,prBody,writeSeed,finish,main,EXIT};
