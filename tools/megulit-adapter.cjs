#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter: the one entry for adapting a game (owner: 不再一部一部写适配脚本，合成一个半自动适配器；以后所有适配都走它).
   Four layers, each in its place: kernel (never changed for one game) -> engine layer (RRFZ's script readers in
   services/original-engines, the draw hooks in native/megulithook + tools/engine-sigs, engine-level hides; the rule table
   tools/megulit-adapter/engines.cjs) -> game diff (The Seed data only) -> upload (a PR).

     node tools/megulit-adapter.cjs <game folder> [--exe <rel>] [--vndb v123] [--release "DL 版"] [--out <dir>] [--budget-min 10]
                                    [--foreground] [--offline] [--skip] [--force] [--app <MeguLit install>] [--answer id=value ...]
         identify (VNDB + release, HANDOFF) -> engine -> script probe (RRFZ readers) -> plan (text source, pairing, hide)
         -> live check: the game run with the hook and the hide (tools/megulit-adapter/cold.cjs; --foreground when the owner is away),
            a person looks at a few lines: the line changes, the original is hidden, the choice -> seed -> publish
         --cold  Cardinal replays the run as well, a background supplement: its scores are noted, never a gate
   2026-11-27 (owner: 不再用冷测试加 Cardinal 打分来验证适配，改成实机验证，RRFZ 的路子): Cardinal no longer decides; the person's look does
     node tools/megulit-adapter.cjs answer <out dir> id=value ...    answer the questions; when none is left the seed is written
     node tools/megulit-adapter.cjs publish <out dir> --repo <checkout on a branch> [--go]
                                    the seed into The Seed/, a commit, a PR, the HANDOFF row (dry run without --go)
     node tools/megulit-adapter.cjs inventory [--json]                what every engine has (from the code)
     node tools/megulit-adapter.cjs cold <game folder> ...            the cold stage alone (the old adapt-auto command line)

   Exit codes: 0 done, 1 fail, 2 inconclusive, 3 waiting for a person (<out>/review.html shows each question with its pictures).
   State: <out>/adapter.json (everything decided, every answer); nothing is written into the game folder. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const SecondOpinion=require('./megulit-adapter/second-opinion.cjs'),Cold=require('./megulit-adapter/cold.cjs'),Engines=require('./megulit-adapter/engines.cjs'),Ident=require('./megulit-adapter/identify.cjs');
const {plan,STEPS}=require('./megulit-adapter/plan.cjs'),Check=require('./megulit-adapter/checkpoints.cjs');
const REPO=path.join(__dirname,'..');
const EXIT={done:0,fail:1,inconclusive:2,human:3};
const GAME_LOCK=process.env.MEGULIT_GAME_LOCK||path.join(Cold.RUNS_ROOT,'.game.lock');
const STALE_MS=20*60000,STALE_ONCE_MS=180*60000;

function parseRun(argv){const a=argv.slice(2),o={steamAppId:'',copy:false,net:true,external:true,dir:'',exe:'',vndb:'',release:'',cn:'',out:'',budgetMin:10,foreground:false,offline:false,skip:false,force:false,app:Cold.APP_DEFAULT,answers:[],lockWaitMin:60,cold:false};
 for(let i=0;i<a.length;i++){const k=a[i],v=()=>{if(i+1>=a.length)throw Error(k+' needs a value');return a[++i];};
  if(k==='--exe')o.exe=v();else if(k==='--vndb')o.vndb=v().toLowerCase();else if(k==='--release')o.release=v();else if(k==='--cn')o.cn=v();else if(k==='--out')o.out=v();
  else if(k==='--budget-min')o.budgetMin=Number(v());else if(k==='--app')o.app=v();else if(k==='--answer')o.answers.push(v());else if(k==='--lock-wait-min')o.lockWaitMin=Number(v());
  else if(k==='--foreground')o.foreground=true;else if(k==='--offline')o.offline=true;else if(k==='--no-net')o.net=false;else if(k==='--no-external')o.external=false;else if(k==='--copy')o.copy=true;else if(k==='--steam-appid')o.steamAppId=v();else if(k==='--skip')o.skip=true;else if(k==='--force')o.force=true;else if(k==='--cold')o.cold=true;
  else if(!k.startsWith('--')&&!o.dir)o.dir=k;else throw Error('unknown argument: '+k);}
 if(!o.dir)throw Error('usage: node tools/megulit-adapter.cjs <game folder> [--vndb v123] [--release "DL 版"] [--foreground] [--offline]');
 if(o.vndb&&!Ident.VNDB.test(o.vndb))throw Error('--vndb is v<number>');
 if(!(o.budgetMin>0&&o.budgetMin<=60))throw Error('--budget-min must be 1..60');
 return o;}

/* ---- the machine-wide game lock (megulit-game-test: one game at a time; 20 minutes without a refresh is stale) ---------------- */
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function gameLock(owner,game,{waitMs=3600000,file=GAME_LOCK,log=()=>{}}={}){const line=()=>'owner='+owner+' game='+game+' refreshed='+new Date().toISOString();const t0=Date.now();let said=false;
 for(;;){try{fs.writeFileSync(file,line(),{flag:'wx'});break;}catch(e){if(e.code!=='EEXIST')throw e;}
  let age=0,held='';try{age=Date.now()-fs.statSync(file).mtimeMs;held=String(fs.readFileSync(file,'utf8'));}catch{continue;}
  /* 2026-11-27 a holder that writes started= once and never refreshes (pr-test, 02:36) still had its MeguLit open at 20 minutes:
     such a lock is taken over only after STALE_ONCE_MS (3 hours) */
  if(age>(/refreshed=/.test(held)?STALE_MS:STALE_ONCE_MS)){try{fs.unlinkSync(file);}catch{}continue;}
  if(Date.now()-t0>waitMs)return null;if(!said){log('# waiting for the game lock: '+String(fs.readFileSync(file,'utf8')).trim());said=true;}await sleep(15000);}
 const mine=line().split(' refreshed=')[0];const timer=setInterval(()=>{try{if(String(fs.readFileSync(file,'utf8')).startsWith(mine))fs.writeFileSync(file,line());}catch{}},60000);timer.unref?.();
 return ()=>{clearInterval(timer);try{if(String(fs.readFileSync(file,'utf8')).startsWith(mine))fs.unlinkSync(file);}catch{}};}

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
const coldView=c=>c?{lunaEngine:c.layers?.engine?.lunaEngine||'',verdict:c.verdict,reasons:c.reasons,checks:c.checks,stuck:c.stuck,phases:c.phases,totalMs:c.totalMs,steps:c.steps,cardinal:c.cardinal,exeSha256:c.exeSha256,hide:c.hide,artifacts:c.artifacts&&{out:c.artifacts.out,diff:c.artifacts.diff,run:c.artifacts.run}}:null;
function summary(st){const p=st.plan,c=st.cold,i=st.identity;return [
 '引擎：'+st.engine+'（'+(st.caps.label||'规则表没有')+'）',
 '作品：'+(st.answers.vndb||i.vndb||'未知')+'，发行版：'+(st.answers.release||i.release||i.releaseGuess||'未知'),
 '原文来源：'+(p.source.kind==='script'?'剧本读取 '+p.source.reader+'（日文 '+p.source.japaneseLines+' 行）':'钩子流（'+p.source.why+'）')+'；对齐：'+p.align,
 '配对：'+p.pairing.mode+(p.pairing.chineseLines?'（中文 '+p.pairing.chineseLines+' 行）':'')+'；隐藏：'+(p.hide.kind==='engine'?'引擎级 '+p.hide.file:'通用层'),
 '实机验证：'+(c?c.verdict+'；'+(c.reasons||[]).slice(0,4).join('；'):st.offline?'没跑（--offline）':'没跑'),
 ...p.notes];}
function finish(st,log){const qs=Check.questions({install:st.install||[],identity:{...st.identity,vndb:st.answers.vndb||st.identity.vndb,release:st.answers.release||st.identity.release,cn:st.answers.cn||st.identity.cn},caps:st.caps,cold:st.cold,coldOut:st.cold?.artifacts?.out||'',force:st.force});
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
 const exeSha=st.cold.exeSha256||st.identity.prints.exe;const dir=Cold.writeSeed(diff,{engine:st.engine,title:st.title,exeName:path.basename(st.exe),exeSha,gameKey:st.gameKey||''},path.join(st.out,'seed'));
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
 '## 验证','','- 实机验证（开游戏'+(st.foreground?'前台':'隐藏桌面')+'跑几句，静音）：'+(c.verdict||'没跑'),...(c.reasons||[]).map(r=>'  - '+r),'- 人看截图确认：',...(st.questions||[]).map(q=>'  - '+q.ask+' → '+(st.answers[q.id]??'未答')),'- 截图是游戏画面，没有 MeguLit 阅读层：选项译文要在 MeguLit 里再看一眼（未验证译文画面）',''].join('\n');}

async function run(o,{log=console.log}={}){if(o.copy){const c=copyGame(path.resolve(o.dir));log('# own copy '+c.dir+(c.reused?' (kept)':' ('+Math.round(c.bytes/1048576)+' MB)'));o={...o,dir:c.dir};}
 const dir=path.resolve(o.dir),title=Cold.titleOf(dir),out=path.resolve(o.out||path.join(OUT_ROOT(),Cold.safeName(title)));
 fs.mkdirSync(out,{recursive:true});
 if(!fs.existsSync(dir)){log('# 游戏目录不存在：'+dir+'（Git Bash 的 /e/... 带 [ ] 时不转换，用 E:/...）');return EXIT.inconclusive;}
 const triage=Cold.unsupported(dir);if(triage&&!/光盘/.test(triage)){log('# '+triage);return EXIT.inconclusive;}
 const discs=discImages(dir),loc=/光盘/.test(triage)?null:Cold.locate(dir,o.exe);
 if(!loc&&discs.length){const st={tool:'megulit-adapter',out,title,dir,exe:'',engine:'',caps:{known:true},probe:null,identity:{vndb:o.vndb,release:o.release,releaseGuess:'',prints:{},adapted:[]},plan:{source:{kind:'hook',why:'not installed'},align:'hook',pairing:{mode:'machine'},hide:{kind:'generic'},notes:['只有光盘镜像，先安装']},install:discs,steps:STEPS,cold:null,answers:Check.parseAnswers(o.answers),force:o.force,offline:true,startedAt:new Date().toISOString()};saveState(st);return finish(st,log);}
 if(!loc){log('# 找不到主程序（用 --exe 指定）');return EXIT.inconclusive;}
 let caps=lunaCaps(Engines.capabilities(loc.engine),loc.gameDir,loc.engine);if(caps.lunaStatic)loc.engine=caps.id;log('# '+title+' '+(loc.engine||'?')+(caps.luna?' (LunaHook '+caps.luna+')':'')+' '+loc.exe);
 const pr=probe(loc,title,90000);log('# probe '+pr.step+' '+(pr.detected||'-')+' jp='+pr.japaneseLines+' zh='+pr.chineseLines);
 const readers=[...new Set([pr.detected,...caps.readers].filter(Boolean))];
 const identity=Ident.identify({gameDir:loc.gameDir,exe:loc.exe,engine:loc.engine,title,vndb:o.vndb,release:o.release,chineseBuild:pr.step==='chinese-build',readers});
 if(o.steamAppId)identity.steamAppId=o.steamAppId;
 /* VNDB: the work, the release, the Chinese title, VNDB's engine (an answer only when unambiguous; --no-net or an error asks a person) */
 if(o.net){const v=await Ident.vndb({title,gameDir:loc.gameDir,vnid:o.vndb||identity.vndb,chineseBuild:pr.step==='chinese-build',engine:loc.engine});identity.steamAppId=o.steamAppId||v.steamAppId||'';identity.steamCandidates=v.steamCandidates||[];identity.vndbLookup={how:v.how,release:v.release,releaseHow:v.releaseHow,candidates:v.candidates,engine:v.vndbEngine,engineDiffers:v.engineDiffers,error:v.error,releases:v.releases.map(r=>({rid:r.rid,title:r.title,engine:r.engine,langs:r.langs,patch:r.patch,official:r.official,ext:r.ext}))};
  if(!identity.vndb&&v.vndb)identity.vndb=v.vndb;if(v.cn)identity.cn=v.cn;if(!identity.release&&v.release)identity.release=v.release;identity.releaseCandidates=v.candidates;
  if(v.vndb)identity.adapted=Ident.sameRelease(Ident.adaptedRows(Ident.handoffText()),identity.vndb,identity.release||identity.releaseGuess);}
 const st={tool:'megulit-adapter',out,title,foreground:o.foreground,dir,exe:loc.exe,gameDir:loc.gameDir,engine:loc.engine,engineWhy:loc.why,caps,probe:pr,identity,plan:withVndbNotes(plan({caps,probe:pr}),identity),steps:STEPS,cold:null,answers:Check.parseAnswers(o.answers),force:o.force,offline:o.offline,startedAt:new Date().toISOString()};
 if(o.vndb)st.answers.vndb=st.answers.vndb||o.vndb;if(o.cn)st.answers.cn=st.answers.cn||o.cn;if(o.release)st.answers.release=st.answers.release||o.release;
 /* our readers read nothing: GalTransl's detect + extractor as a second opinion (evidence and a porting pointer, never the text) */
 if(o.external&&SecondOpinion.wanted({probe:pr,caps})){st.external={galtransl:SecondOpinion.secondOpinion({gameDir:loc.gameDir,out})};const n=SecondOpinion.note(st.external.galtransl);if(n)st.plan.notes.push(n);log('# second opinion '+(n||st.external.galtransl.error));}
 saveState(st);
 if((identity.adapted||[]).some(r=>r.same)&&!o.force&&st.answers.again===undefined)return finish(st,log);
 if(!o.offline){const release=await gameLock('megulit-adapter',Cold.safeName(title),{waitMs:o.lockWaitMin*60000,log});if(!release){log('# 游戏锁等不到');st.cold=null;return finish(st,log);}
  try{const r=await Cold.run({dir,exe:o.exe,out:path.join(out,'cold'),budgetMin:o.budgetMin,app:o.app,foreground:o.foreground,seedOut:'',skip:o.skip,steamAppId:identity.steamAppId||'',vndb:identity.vndb||'',live:true,cardinal:o.cold===true},{log});st.cold=coldView(r);st.gameKey=r.gameKey;
   const luna=r.layers?.engine?.lunaEngine||'';if(luna){st.lunaRuntime=luna;const id=Engines.lunaRule(luna);if(!st.caps.known&&id){st.caps={...Engines.capabilities(id),luna,lunaRuntime:true};st.engine=id;st.plan=withVndbNotes(plan({caps:st.caps,probe:st.probe}),st.identity);st.plan.notes.push('引擎由 LunaHook 运行时认出（'+luna+'），写回 engines.cjs / registry');}}}
  catch(e){st.cold={verdict:'inconclusive',reasons:['冷测试出错：'+e.message],checks:{},stuck:'',artifacts:{out:path.join(out,'cold')}};}
  finally{release();}}
 return finish(st,log);}

function answer(out,args,{log=console.log}={}){const st=readState(path.resolve(out));Object.assign(st.answers,Check.parseAnswers(args));return finish(st,log);}

/* ---- publish: the seed into a checkout on its own branch, a commit, a PR; the HANDOFF row straight to main (HANDOFF rule 7) ---- */
function sh(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',windowsHide:true,timeout:300000});if(r.status!==0)throw Error(cmd+' '+args.join(' ')+': '+String(r.stderr||r.stdout||r.error?.message).slice(-400));return String(r.stdout||'').trim();}
function addHandoffRow(text,row){const lines=text.split('\n');let at=-1,on=false;for(let i=0;i<lines.length;i++){if(/^##\s/.test(lines[i])){if(on)break;on=/已适配的游戏/.test(lines[i]);continue;}if(on&&/^\|/.test(lines[i]))at=i;}
 if(at<0)throw Error('HANDOFF.md has no 已适配的游戏 table');lines.splice(at+1,0,row);return lines.join('\n');}
function publish(out,{repo='',go=false,log=console.log}={}){const st=readState(path.resolve(out));if(st.state!=='ready')throw Error('not ready to publish (state '+st.state+'); answer the questions first');
 if(!repo)throw Error('--repo <a MeguLit checkout on its own branch> is needed');const slug=path.basename(st.seed),dest=path.join(repo,'The Seed',st.engine,slug);
 const plan=['copy '+st.seed+' -> '+dest,'git add + commit "The Seed: '+st.title+'（MeguLit-Adapter）"','git push -u origin HEAD','gh pr create --body-file '+path.join(st.out,'pr-body.md'),'HANDOFF.md 已适配的游戏 += '+st.handoffRow+' (origin/main)'];
 if(!go){log('# dry run (add --go):');for(const p of plan)log('  '+p);return EXIT.done;}
 const branch=sh('git',['rev-parse','--abbrev-ref','HEAD'],repo);if(/^(main|master|HEAD)$/.test(branch))throw Error('the checkout is on '+branch+': make a branch first');
 fs.mkdirSync(dest,{recursive:true});fs.cpSync(st.seed,dest,{recursive:true});
 sh('git',['add','--',path.relative(repo,dest)],repo);sh('git',['commit','-m','The Seed：'+workName(st)+' 适配（MeguLit-Adapter）'],repo);sh('git',['push','-u','origin','HEAD'],repo);
 const url=sh('gh',['pr','create','--title','The Seed：'+workName(st)+' 适配（MeguLit-Adapter）','--body-file',path.join(st.out,'pr-body.md')],repo);log('# PR '+url);
 const wt=path.join(st.out,'handoff-wt');sh('git',['fetch','origin','main'],repo);sh('git',['worktree','add','--detach',wt,'origin/main'],repo);
 try{const f=path.join(wt,'HANDOFF.md');fs.writeFileSync(f,addHandoffRow(fs.readFileSync(f,'utf8'),st.handoffRow.replace(/（MeguLit-Adapter） \|$/,'（MeguLit-Adapter）'+url.replace(/.*\/pull\//,' PR #')+' |')));
  sh('git',['commit','-am','HANDOFF.md：登记 '+st.title+'（MeguLit-Adapter）'],wt);sh('git',['push','origin','HEAD:main'],wt);}
 finally{try{sh('git',['worktree','remove','--force',wt],repo);}catch{}}
 st.pr=url;st.state='published';saveState(st);return EXIT.done;}

async function main(argv){const cmd=argv[2];
 if(cmd==='inventory'){const rows=Engines.inventory();console.log(argv.includes('--json')?JSON.stringify(rows,null,1):Engines.markdown(rows));return 0;}
 const runsGame=cmd!=='answer'&&cmd!=='publish';
 if(runsGame){let app=Cold.APP_DEFAULT;const i=argv.indexOf('--app');if(i>0&&argv[i+1])app=argv[i+1];const r=Cold.reexecIfOldNode(__filename,argv,app);if(r!==null)return r;Cold.prepareRuntime();}
 try{
  if(cmd==='cold')return await Cold.main([argv[0],argv[1],...argv.slice(3)]);
  if(cmd==='answer'){if(!argv[3])throw Error('usage: answer <out dir> id=value ...');return answer(argv[3],argv.slice(4));}
  if(cmd==='publish'){const a=argv.slice(4);const r=a.indexOf('--repo');return publish(argv[3],{repo:r>=0?a[r+1]:'',go:a.includes('--go')});}
  return await run(parseRun(argv));}
 catch(e){console.error('megulit-adapter: '+(e.message||e));return EXIT.inconclusive;}}
if(require.main===module)main(process.argv).then(c=>{process.exitCode=c;});
module.exports={copyGame,lunaCaps,discImages,parseRun,gameLock,probe,run,answer,publish,addHandoffRow,handoffRow,prBody,writeSeed,finish,main,EXIT};
