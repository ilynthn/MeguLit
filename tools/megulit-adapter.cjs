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
         -> cold test + Cardinal (tools/megulit-adapter/cold.cjs, the former adapt-auto) -> questions with pictures -> seed
     node tools/megulit-adapter.cjs answer <out dir> id=value ...    answer the questions; when none is left the seed is written
     node tools/megulit-adapter.cjs publish <out dir> --repo <checkout on a branch> [--go]
                                    the seed into The Seed/, a commit, a PR, the HANDOFF row (dry run without --go)
     node tools/megulit-adapter.cjs inventory [--json]                what every engine has (from the code)
     node tools/megulit-adapter.cjs cold <game folder> ...            the cold stage alone (the old adapt-auto command line)

   Exit codes: 0 done, 1 fail, 2 inconclusive, 3 waiting for a person (<out>/review.html shows each question with its pictures).
   State: <out>/adapter.json (everything decided, every answer); nothing is written into the game folder. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Cold=require('./megulit-adapter/cold.cjs'),Engines=require('./megulit-adapter/engines.cjs'),Ident=require('./megulit-adapter/identify.cjs');
const {plan,STEPS}=require('./megulit-adapter/plan.cjs'),Check=require('./megulit-adapter/checkpoints.cjs');
const REPO=path.join(__dirname,'..');
const EXIT={done:0,fail:1,inconclusive:2,human:3};
const GAME_LOCK=process.env.MEGULIT_GAME_LOCK||path.join(Cold.RUNS_ROOT,'.game.lock');
const STALE_MS=20*60000;

function parseRun(argv){const a=argv.slice(2),o={dir:'',exe:'',vndb:'',release:'',out:'',budgetMin:10,foreground:false,offline:false,skip:false,force:false,app:Cold.APP_DEFAULT,answers:[],lockWaitMin:60};
 for(let i=0;i<a.length;i++){const k=a[i],v=()=>{if(i+1>=a.length)throw Error(k+' needs a value');return a[++i];};
  if(k==='--exe')o.exe=v();else if(k==='--vndb')o.vndb=v().toLowerCase();else if(k==='--release')o.release=v();else if(k==='--out')o.out=v();
  else if(k==='--budget-min')o.budgetMin=Number(v());else if(k==='--app')o.app=v();else if(k==='--answer')o.answers.push(v());else if(k==='--lock-wait-min')o.lockWaitMin=Number(v());
  else if(k==='--foreground')o.foreground=true;else if(k==='--offline')o.offline=true;else if(k==='--skip')o.skip=true;else if(k==='--force')o.force=true;
  else if(!k.startsWith('--')&&!o.dir)o.dir=k;else throw Error('unknown argument: '+k);}
 if(!o.dir)throw Error('usage: node tools/megulit-adapter.cjs <game folder> [--vndb v123] [--release "DL 版"] [--foreground] [--offline]');
 if(o.vndb&&!Ident.VNDB.test(o.vndb))throw Error('--vndb is v<number>');
 if(!(o.budgetMin>0&&o.budgetMin<=60))throw Error('--budget-min must be 1..60');
 return o;}

/* ---- the machine-wide game lock (megulit-game-test: one game at a time; 20 minutes without a refresh is stale) ---------------- */
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function gameLock(owner,game,{waitMs=3600000,file=GAME_LOCK,log=()=>{}}={}){const line=()=>'owner='+owner+' game='+game+' refreshed='+new Date().toISOString();const t0=Date.now();let said=false;
 for(;;){try{fs.writeFileSync(file,line(),{flag:'wx'});break;}catch(e){if(e.code!=='EEXIST')throw e;}
  let age=0;try{age=Date.now()-fs.statSync(file).mtimeMs;}catch{continue;}
  if(age>STALE_MS){try{fs.unlinkSync(file);}catch{}continue;}
  if(Date.now()-t0>waitMs)return null;if(!said){log('# waiting for the game lock: '+String(fs.readFileSync(file,'utf8')).trim());said=true;}await sleep(15000);}
 const mine=line().split(' refreshed=')[0];const timer=setInterval(()=>{try{if(String(fs.readFileSync(file,'utf8')).startsWith(mine))fs.writeFileSync(file,line());}catch{}},60000);timer.unref?.();
 return ()=>{clearInterval(timer);try{if(String(fs.readFileSync(file,'utf8')).startsWith(mine))fs.unlinkSync(file);}catch{}};}

/* ---- the script probe: RRFZ's readers over the folder (counts only, no text) ------------------------------------------------ */
function probe(loc,title,budgetMs){try{const P=require('../services/adapter-probe-core.cjs');const r=P.probeGame({dir:loc.gameDir,executable:loc.exe,title},{budgetMs});
  return {step:r.step,detail:r.detail,detected:r.detected,lines:r.lines,japaneseLines:r.japaneseLines,dialogueLines:r.dialogueLines,chineseLines:r.chineseLines,original:r.original,restore:r.restore,tried:r.tried,ms:r.ms,engines:(r.engines||[]).map(e=>({id:e.id,lines:e.lines,japaneseLines:e.japaneseLines,chineseLines:e.chineseLines,error:e.error||undefined}))};}
 catch(e){return {step:'error',detail:String(e.message||e).slice(0,200),detected:null,lines:0,japaneseLines:0,chineseLines:0};}}

const stateFile=out=>path.join(out,'adapter.json');
const readState=out=>JSON.parse(fs.readFileSync(stateFile(out),'utf8'));
function saveState(st){st.updatedAt=new Date().toISOString();fs.writeFileSync(stateFile(st.out),JSON.stringify(st,null,1));}
const coldView=c=>c?{verdict:c.verdict,reasons:c.reasons,checks:c.checks,stuck:c.stuck,phases:c.phases,totalMs:c.totalMs,steps:c.steps,cardinal:c.cardinal,exeSha256:c.exeSha256,hide:c.hide,artifacts:c.artifacts&&{out:c.artifacts.out,diff:c.artifacts.diff,run:c.artifacts.run}}:null;
function summary(st){const p=st.plan,c=st.cold,i=st.identity;return [
 '引擎：'+st.engine+'（'+(st.caps.label||'规则表没有')+'）',
 '作品：'+(st.answers.vndb||i.vndb||'未知')+'，发行版：'+(st.answers.release||i.release||i.releaseGuess||'未知'),
 '原文来源：'+(p.source.kind==='script'?'剧本读取 '+p.source.reader+'（日文 '+p.source.japaneseLines+' 行）':'钩子流（'+p.source.why+'）')+'；对齐：'+p.align,
 '配对：'+p.pairing.mode+(p.pairing.chineseLines?'（中文 '+p.pairing.chineseLines+' 行）':'')+'；隐藏：'+(p.hide.kind==='engine'?'引擎级 '+p.hide.file:'通用层'),
 '冷测试：'+(c?c.verdict+'；'+(c.reasons||[]).slice(0,4).join('；'):st.offline?'没跑（--offline）':'没跑'),
 ...p.notes];}
function finish(st,log){const qs=Check.questions({identity:{...st.identity,vndb:st.answers.vndb||st.identity.vndb,release:st.answers.release||st.identity.release},caps:st.caps,cold:st.cold,coldOut:st.cold?.artifacts?.out||'',force:st.force});
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
function prBody(st){const c=st.cold||{};return ['## '+st.title+'（MeguLit-Adapter）','',...summary(st).map(s=>'- '+s),'','### Cardinal','',...(c.reasons||[]).map(r=>'- '+r),'','### 人工确认','',...(st.questions||[]).map(q=>'- '+q.ask+' → '+(st.answers[q.id]??'未答')),'','只改 `The Seed/'+st.engine+'/'+path.basename(st.seed)+'/`（纯数据）',''].join('\n');}

async function run(o,{log=console.log}={}){const dir=path.resolve(o.dir),title=Cold.titleOf(dir),out=path.resolve(o.out||path.join(Cold.RUNS_ROOT,Cold.safeName(title)));
 fs.mkdirSync(out,{recursive:true});
 const triage=Cold.unsupported(dir);if(triage){log('# '+triage);return EXIT.inconclusive;}
 const loc=Cold.locate(dir,o.exe);if(!loc){log('# 找不到主程序（用 --exe 指定）');return EXIT.inconclusive;}
 const caps=Engines.capabilities(loc.engine);log('# '+title+' '+loc.engine+' '+loc.exe);
 const pr=probe(loc,title,90000);log('# probe '+pr.step+' '+(pr.detected||'-')+' jp='+pr.japaneseLines+' zh='+pr.chineseLines);
 const readers=[...new Set([pr.detected,...caps.readers].filter(Boolean))];
 const identity=Ident.identify({gameDir:loc.gameDir,exe:loc.exe,engine:loc.engine,title,vndb:o.vndb,release:o.release,chineseBuild:pr.step==='chinese-build',readers});
 const st={tool:'megulit-adapter',out,title,dir,exe:loc.exe,gameDir:loc.gameDir,engine:loc.engine,engineWhy:loc.why,caps,probe:pr,identity,plan:plan({caps,probe:pr}),steps:STEPS,cold:null,answers:Check.parseAnswers(o.answers),force:o.force,offline:o.offline,startedAt:new Date().toISOString()};
 if(o.vndb)st.answers.vndb=st.answers.vndb||o.vndb;if(o.release)st.answers.release=st.answers.release||o.release;
 saveState(st);
 if((identity.adapted||[]).some(r=>r.same)&&!o.force&&st.answers.again===undefined)return finish(st,log);
 if(!o.offline){const release=await gameLock('megulit-adapter',Cold.safeName(title),{waitMs:o.lockWaitMin*60000,log});if(!release){log('# 游戏锁等不到');st.cold=null;return finish(st,log);}
  try{const r=await Cold.run({dir,exe:o.exe,out:path.join(out,'cold'),budgetMin:o.budgetMin,app:o.app,foreground:o.foreground,seedOut:'',skip:o.skip},{log});st.cold=coldView(r);st.gameKey=r.gameKey;}
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
 sh('git',['add','--',path.relative(repo,dest)],repo);sh('git',['commit','-m','The Seed: '+st.title+'（MeguLit-Adapter）'],repo);sh('git',['push','-u','origin','HEAD'],repo);
 const url=sh('gh',['pr','create','--title','The Seed: '+st.title+'（MeguLit-Adapter）','--body-file',path.join(st.out,'pr-body.md')],repo);log('# PR '+url);
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
module.exports={parseRun,gameLock,probe,run,answer,publish,addHandoffRow,handoffRow,writeSeed,finish,main,EXIT};
