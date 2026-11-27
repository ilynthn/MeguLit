// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 one test build for everything waiting on the tester (owner: 一个 PR 一个测试版太乱，只保留一个合并测试版；测试版必须是最新版 MeguLit).
     node tools/megulit-adapter/test-build-all.cjs [--dir <H:\MeguLit-Copies\testbuild-all>] [--cards <dir>] [--add N ...] [--check]
   1 the PRs: every card in <cards> (E:\Apps\test-requests\cards\*.json) not done whose PR is open with all CI checks passed, in
     number order (--add N: one more, the auto pipeline's new PR); a PR that does not merge cleanly is left out and reported
   2 the tree: a local branch test/integration (never pushed) in its own worktree <copies>\testbuild-src\integration: origin/main,
     then each PR merged; the test-build mode (services/update.cjs updater off, web/app.js label) taken from #1318's files while
     #1318 is not on main
   3 the build <dir>\app-<main7>-<prs7>\ (a running older one is never touched; older ones are removed when nothing runs from them):
     - shell and runtime: the newest release's MeguLit.exe (this PC has no Rust; the label says 「外壳 vX」) and the installed app's runtime
     - code: core, services, web, The Seed, tools, setup from the tree; data\hot-update.json so the shell reads that web\ (its HTML
       stays the shell's own: a page whose HTML changed since the release is noted)
     - native: C++ helpers from main's newest successful CI run (artifact native-binaries); C# (HookBridge, GalWindowBridge) built here
       from the tree; a C++ part a PR changes: that PR session's own build (integration.json oldRoots) when there, else noted
     - data: the tester's settings, translation config and key vault (auto.cjs readyBuild), every card's game in the library under
       the work's name (on the first start)
   4 <dir>\开始测试.cmd [<PR>]: test-start.cjs; with a PR number the card's game starts. Each run first asks GitHub whether main or one
     of the PRs moved and runs this again when so (a failure: the current build starts, with a word)
   --check: only says whether main or a PR moved (exit 10 when a rebuild is due). */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const REPO=path.join(__dirname,'..','..');
const COPIES=()=>process.env.MEGULIT_COPIES_ROOT||'H:\\MeguLit-Copies';
const CONFIG_APP=()=>process.env.MEGULIT_APP||'E:\\MeguLit';
const CARDS=()=>path.join(process.env.MEGULIT_TEST_REQUESTS||'E:\\Apps\\test-requests','cards');
const AUTO_BRANCH='feat/adapter-auto-pipeline',AUTO_PR=1318;
const OVERLAY=['core','services','web','The Seed','tools','setup'];
const TEST_MODE_FILES=['services/update.cjs','services/relay-gate.cjs','services/bridge.cjs','web/app.js'];

function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,timeout:1800000,maxBuffer:256<<20,...opts});
 if(r.status!==0)throw Error(path.basename(cmd)+' '+args.slice(0,3).join(' ')+' 失败：'+String(r.stderr||r.stdout||r.error?.message||'').trim().slice(-400));return String(r.stdout||'').trim();}
const git=(args,cwd=REPO)=>run('git',args,{cwd});
const gh=args=>run('gh',args,{cwd:REPO});
function robocopy(from,to,extra=[]){const r=spawnSync('robocopy',[from,to,'/E','/XJ','/NFL','/NDL','/NJH','/NJS','/NP','/R:1','/W:1',...extra],{windowsHide:true,timeout:1800000});if(r.status===null||r.status>=8)throw Error('robocopy '+from+' -> '+to+' 失败（'+r.status+'）');}
const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));}catch{return null;}};

/* ---- 1 the cards and their PRs ------------------------------------------------------------------------------------------ */
/* the work's name for the library from a card title: 「常轨脱离（ハミダシクリエイティブ）」 -> the kana part, 「ISLAND · 选项有中文」 -> ISLAND */
function workName(title){const t=String(title||'').split(' · ')[0].trim();const m=/^(.+?)（(.+)）$/.exec(t);
 if(m){const kana=s=>/[\u3040-\u30ff]/.test(s);return kana(m[2])&&!kana(m[1])?m[2].trim():m[1].trim();}return t;}
function cards(dir=CARDS()){let names=[];try{names=fs.readdirSync(dir).filter(f=>/\.json$/i.test(f));}catch{}const out=[];
 for(const f of names){const c=readJson(path.join(dir,f));const pr=Number(String(c?.id||'').replace(/\D/g,''));if(!c||!pr||c.done===true||!c.title)continue;
  /* a card named after a feature (「游戏库显示作品名」, only Han characters) tests how a game gets into the library: its game is not
     put there beforehand; a card named after a work (kana / Latin, or an explicit work field) has its game ready under that name */
  const title=c.work||workName(c.title);out.push({file:path.join(dir,f),pr,game:c.game&&/\.exe$/i.test(c.game)?c.game:'',title,preAdd:!!c.work||/[぀-ヿA-Za-z]/.test(title)});}
 return out.sort((a,b)=>a.pr-b.pr);}
/* open, not draft, every check finished and none failed */
function green(pr,{view=n=>JSON.parse(gh(['pr','view',String(n),'--repo','ilynthn/MeguLit','--json','state,statusCheckRollup']))}={}){let v;try{v=view(pr);}catch(e){return {ok:false,why:'查不到 PR：'+e.message.slice(0,80)};}
 if(v.state!=='OPEN')return {ok:false,why:'PR 不是打开的（'+v.state+'）'};const checks=v.statusCheckRollup||[];
 const bad=checks.filter(c=>!['SUCCESS','SKIPPED','NEUTRAL'].includes(String(c.conclusion||c.state||'').toUpperCase()));
 return bad.length?{ok:false,why:'CI 没全绿（'+bad.map(c=>c.name||c.context).slice(0,3).join('、')+'）'}:{ok:true};}

/* ---- 2 the tree ------------------------------------------------------------------------------------------------------- */
function tree(prs,log){const dir=path.join(COPIES(),'testbuild-src','integration');
 git(['fetch','-q','origin','main',...prs.map(n=>'+refs/pull/'+n+'/head:refs/remotes/origin/pr/'+n),'+refs/heads/'+AUTO_BRANCH+':refs/remotes/origin/'+AUTO_BRANCH]);
 if(!fs.existsSync(path.join(dir,'.git'))){fs.mkdirSync(path.dirname(dir),{recursive:true});git(['worktree','add','-f','-B','test/integration',dir,'origin/main']);}
 git(['checkout','-q','-f','-B','test/integration','origin/main'],dir);git(['clean','-q','-fd'],dir);
 const merged=[],skipped=[],heads={};
 for(const n of prs){heads[n]=git(['rev-parse','origin/pr/'+n]);const r=spawnSync('git',['merge','--no-edit','-q','origin/pr/'+n],{cwd:dir,encoding:'utf8',windowsHide:true});
  if(r.status===0){merged.push(n);continue;}
  const files=String(spawnSync('git',['diff','--name-only','--diff-filter=U'],{cwd:dir,encoding:'utf8'}).stdout||'').trim().split('\n').filter(Boolean);
  spawnSync('git',['merge','--abort'],{cwd:dir,windowsHide:true});skipped.push({pr:n,why:'合不进来（冲突：'+(files.slice(0,4).join('、')||String(r.stderr).trim().slice(-120))+'）'});log('# #'+n+' 合不进来，跳过');}
 /* the test-build mode while #1318 is not on main: only its own files, as a patch */
 const inMain=spawnSync('git',['merge-base','--is-ancestor','origin/'+AUTO_BRANCH,'origin/main'],{cwd:dir}).status===0,notes=[];
 if(!inMain&&!merged.includes(AUTO_PR)){const diff=spawnSync('git',['diff','origin/main...origin/'+AUTO_BRANCH,'--',...TEST_MODE_FILES],{cwd:dir,encoding:'utf8',maxBuffer:64<<20}).stdout||'';
  if(diff.trim()){const f=path.join(path.dirname(dir),'test-mode.patch');fs.writeFileSync(f,diff);const a=spawnSync('git',['apply','--3way',f],{cwd:dir,encoding:'utf8',windowsHide:true});
   if(a.status!==0){spawnSync('git',['checkout','-f','HEAD','--',...TEST_MODE_FILES],{cwd:dir,windowsHide:true});notes.push('测试版模式（#1318）补不进来：更新器照旧开着，界面没有版本标签');}
   else{spawnSync('git',['add','--',...TEST_MODE_FILES],{cwd:dir});spawnSync('git',['commit','-q','-m','test build mode (from #1318)'],{cwd:dir,windowsHide:true});}}}
 const changed={};for(const n of merged)changed[n]=git(['diff','--name-only','origin/main...origin/pr/'+n]).split('\n').filter(Boolean);
 return {dir,main:git(['rev-parse','origin/main']),head:git(['rev-parse','HEAD'],dir),merged,skipped,heads,changed,notes};}

/* ---- 3 the release shell (cached) and main's native helpers (cached by run) ------------------------------------------- */
function base(log){const rel=JSON.parse(gh(['release','view','--repo','ilynthn/MeguLit','--json','tagName,assets']));const asset=rel.assets.find(a=>/win-x64\.zip$/i.test(a.name));
 const dir=path.join(COPIES(),'testbuild-base',rel.tagName),zip=dir+'.zip';
 if(!fs.existsSync(path.join(dir,'.complete'))){log('# 下载 '+rel.tagName+' 的外壳');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  if(!fs.existsSync(zip))gh(['release','download',rel.tagName,'--repo','ilynthn/MeguLit','-p',asset.name,'-O',zip]);
  run(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',zip,'-C',dir]);fs.writeFileSync(path.join(dir,'.complete'),rel.tagName);}
 const root=fs.existsSync(path.join(dir,'MeguLit.exe'))?dir:fs.readdirSync(dir).map(n=>path.join(dir,n)).find(d=>fs.existsSync(path.join(d,'MeguLit.exe')));
 if(!root)throw Error(rel.tagName+' 的包里没有 MeguLit.exe');return {tag:rel.tagName,root};}
function nativeArtifact(log){const runs=JSON.parse(gh(['run','list','--repo','ilynthn/MeguLit','--branch','main','--workflow','ci.yml','--status','success','--limit','5','--json','databaseId,headSha']));
 for(const r of runs){const dir=path.join(COPIES(),'testbuild-base','native-'+r.databaseId);if(fs.existsSync(path.join(dir,'.complete')))return {dir,sha:r.headSha};
  try{log('# 下载 main 的原生组件（CI '+r.databaseId+'）');fs.mkdirSync(dir,{recursive:true});gh(['run','download',String(r.databaseId),'--repo','ilynthn/MeguLit','-n','native-binaries','-D',dir]);fs.writeFileSync(path.join(dir,'.complete'),r.headSha);return {dir,sha:r.headSha};}catch(e){log('#   '+e.message);}}
 return null;}

function assemble(t,b,art,target,oldRoots,log){const notes=[...t.notes];
 robocopy(b.root,target,['/XD',...['data','cache','logs','secrets','migration','validation'].map(d=>path.join(b.root,d)),'/XF','*.rollback-*','*.bak-*']);
 if(!fs.existsSync(path.join(target,'runtime','node.exe'))&&fs.existsSync(path.join(CONFIG_APP(),'runtime','node.exe'))){log('# 复制运行库');robocopy(path.join(CONFIG_APP(),'runtime'),path.join(target,'runtime'));}
 for(const d of OVERLAY)if(fs.existsSync(path.join(t.dir,d)))robocopy(path.join(t.dir,d),path.join(target,d),d==='The Seed'?['/PURGE']:[]);
 if(art){for(const f of fs.readdirSync(art.dir))if(/\.(exe|dll)$/i.test(f))fs.copyFileSync(path.join(art.dir,f),path.join(target,'native',f));}else notes.push('main 的 C++ 原生组件没下到，用 '+b.tag+' 的');
 const ps=(file,args=[])=>run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(t.dir,'native',file),...args],{cwd:path.join(t.dir,'native')});
 try{ps('Build-HookBridge.ps1',['-OutputPath',path.join(target,'native','HookBridge.exe')]);}catch(e){notes.push('HookBridge 没编出来，用 '+b.tag+' 的');log('# '+e.message);}
 try{ps('Build-GalWindowBridge.ps1');const f=['GalWindowBridge.updated.exe','GalWindowBridge.exe'].map(n=>path.join(t.dir,'native',n)).find(x=>fs.existsSync(x));if(f)fs.copyFileSync(f,path.join(target,'native','GalWindowBridge.exe'));}catch(e){notes.push('GalWindowBridge 没编出来，用 '+b.tag+' 的');log('# '+e.message);}
 try{ps('Build-StartupIsland.ps1',['-OutputPath',path.join(target,'native','StartupIsland.exe')]);}catch(e){notes.push('启动画面 StartupIsland 没编出来，用 '+b.tag+' 的');log('# '+e.message);}
 /* C++ parts the PRs change: the PR session's own build (the last PR wins when two change one part); C# parts were built above */
 let comps=[];try{comps=JSON.parse(fs.readFileSync(path.join(t.dir,'native','native-builds.json'),'utf8'));}catch{}
 for(const c of comps){if((c.sources||[]).some(s=>/\.cs$/i.test(s)))continue;
  const by=t.merged.filter(n=>t.changed[n].some(f=>(c.sources||[]).some(s=>f===s||f.startsWith(String(s).replace(/\\/g,'/')+'/'))));
  if(!by.length){if(c.name==='megulithook')notes.push('钩子 DLL 没有 CI 产物，用 '+b.tag+' 的');continue;}
  const pr=by[by.length-1],old=oldRoots[pr];let took=0;
  for(const out of (c.outputs||[]).filter(f=>/\.(dll|exe)$/i.test(f))){const rel=out.replace(/^native[\\/]/,'');const from=old&&[path.join(old,'native',rel),path.join(old,'runtime',rel)].find(f=>fs.existsSync(f));
   if(!from)continue;fs.mkdirSync(path.dirname(path.join(target,'native',rel)),{recursive:true});fs.copyFileSync(from,path.join(target,'native',rel));
   if(/megulithook/i.test(rel)){fs.mkdirSync(path.join(target,'runtime','megulithook'),{recursive:true});fs.copyFileSync(from,path.join(target,'runtime','megulithook',path.basename(rel)));}took++;}
  notes.push(c.name+(took?' 用 #'+pr+' 会话编的':' #'+by.join(' #')+' 改过但这台机器编不了，用 main/'+b.tag+' 的')+(by.length>1?'（#'+by.join(' #')+' 都改了它）':''));}
 const html=git(['diff','--name-only',b.tag,'HEAD','--','web/*.html','web/**/*.html'],t.dir).split('\n').filter(Boolean);if(html.length)notes.push('HTML 用 '+b.tag+' 外壳里的（'+html.join('、')+' 之后改过）');
 const shellLag=git(['log','--oneline',b.tag+'..origin/main','--','desktop/']).split('\n').filter(Boolean);
 return {notes,shellLag};}

function stateFile(dir){return path.join(dir,'integration.json');}
/* --check: has main or a PR moved since the last build? */
function moved(dir,{lsRemote=refs=>spawnSync('git',['ls-remote','https://github.com/ilynthn/MeguLit.git',...refs],{encoding:'utf8',windowsHide:true,timeout:60000}),cards:cardsDir}={}){const s=readJson(stateFile(dir));if(!s?.built)return {due:true,why:'还没做过'};
 const refs=['refs/heads/main',...Object.keys(s.built.heads||{}).map(n=>'refs/pull/'+n+'/head')];const r=lsRemote(refs);if(r.status!==0)return {due:false,error:'查不到 GitHub'};
 const now=Object.fromEntries(String(r.stdout).trim().split('\n').filter(Boolean).map(l=>l.split('\t').reverse()));
 if(now['refs/heads/main']&&now['refs/heads/main']!==s.built.main)return {due:true,why:'main 有新提交'};
 for(const [n,sha] of Object.entries(s.built.heads||{}))if(now['refs/pull/'+n+'/head']&&now['refs/pull/'+n+'/head']!==sha)return {due:true,why:'#'+n+' 有新提交'};
 const cardPrs=cards(cardsDir).map(c=>c.pr).filter(n=>!(n in (s.built.heads||{}))&&!(s.built.skipped||[]).some(x=>x.pr===n));if(cardPrs.length)return {due:true,why:'有新卡片 #'+cardPrs.join(' #')};
 return {due:false};}

function build(o={},{log=console.log}={}){const dir=path.resolve(o.dir||path.join(COPIES(),'testbuild-all'));fs.mkdirSync(dir,{recursive:true});
 const s=readJson(stateFile(dir))||{oldRoots:{},titles:{}};s.oldRoots={...(s.oldRoots||{}),...(o.oldRoots||{})};
 const all=cards(o.cards);for(const n of o.add||[])if(!all.some(c=>c.pr===Number(n)))all.push({pr:Number(n),game:'',title:''});
 const left=[],prs=[];for(const c of all.sort((a,b)=>a.pr-b.pr)){if(prs.includes(c.pr))continue;const g=(o.green||green)(c.pr);if(g.ok)prs.push(c.pr);else left.push({pr:c.pr,why:g.why});}
 log('# 集成：main + #'+prs.join(' #')+(left.length?'；没合：'+left.map(x=>'#'+x.pr+' '+x.why).join('；'):''));
 const t=tree(prs,log),b=base(log),art=nativeArtifact(log);
 const tag=require('node:crypto').createHash('sha1').update(t.merged.map(n=>n+':'+t.heads[n]).join(',')).digest('hex').slice(0,7);
 const target=path.join(dir,'app-'+t.main.slice(0,7)+'-'+tag);let info;
 if(!fs.existsSync(path.join(target,'.complete'))){log('# 组装测试版 '+target);fs.rmSync(target,{recursive:true,force:true});info=assemble(t,b,art,target,s.oldRoots,log);
  fs.writeFileSync(path.join(target,'test-build.json'),JSON.stringify({main:t.main,head:t.head,merged:t.merged,heads:t.heads,skipped:[...left,...t.skipped],base:b.tag,nativeArtifactSha:art?.sha||'',...info,at:new Date().toISOString()},null,1));
  fs.writeFileSync(path.join(target,'.complete'),t.head);}
 info=readJson(path.join(target,'test-build.json'));
 const label='测试版 · main＠'+t.main.slice(0,7)+(t.merged.length?' + #'+t.merged.join(' #'):'')+'（外壳 '+b.tag+(info.shellLag.length?'，main 之后外壳改了 '+info.shellLag.length+' 个提交':'')+'）';
 const games={};for(const c of all)if(c.game&&t.merged.includes(c.pr))games[c.pr]={exe:c.game,title:(s.titles||{})[c.pr]||c.title,preAdd:c.preAdd!==false};
 const Auto=require('./auto.cjs');const r=Auto.readyBuild(dir,{root:target,app:CONFIG_APP(),games,pr:0,label,refresh:{builder:__filename}});
 s.built={main:t.main,head:t.head,heads:Object.fromEntries(t.merged.map(n=>[n,t.heads[n]])),merged:t.merged,skipped:[...left,...t.skipped],root:target,label,notes:info.notes,at:new Date().toISOString()};
 fs.writeFileSync(stateFile(dir),JSON.stringify(s,null,1));
 for(const n of fs.readdirSync(dir))if(/^app-/.test(n)&&path.join(dir,n)!==target){const old=path.join(dir,n);
  const busy=spawnSync('powershell.exe',['-NoProfile','-Command',"@(Get-CimInstance Win32_Process | ? { $_.ExecutablePath -like '"+old.replace(/'/g,"''")+"\\*' }).Count"],{encoding:'utf8',windowsHide:true}).stdout.trim();if(busy==='0')fs.rmSync(old,{recursive:true,force:true});}
 log('# 测试版就绪：'+target+'；'+label+(info.notes.length?'；'+info.notes.join('；'):'')+(s.built.skipped.length?'；没合进来：'+s.built.skipped.map(x=>'#'+x.pr+' '+x.why).join('；'):''));
 return {...r,root:target,label,merged:t.merged,skipped:s.built.skipped,notes:info.notes,games};}

function parse(argv){const o={add:[]};for(let i=0;i<argv.length;i++){const k=argv[i],v=()=>argv[++i];if(k==='--dir')o.dir=v();else if(k==='--cards')o.cards=v();else if(k==='--add')o.add.push(Number(v()));else if(k==='--check')o.check=true;
  else if(k==='--old-root'){const [n,...p]=v().split('=');o.oldRoots={...(o.oldRoots||{}),[n]:p.join('=')};}else throw Error('unknown argument: '+k);}return o;}
if(require.main===module){try{const o=parse(process.argv.slice(2));if(o.check){const m=moved(path.resolve(o.dir||path.join(COPIES(),'testbuild-all')));console.log(JSON.stringify(m));process.exitCode=m.due?10:0;}else build(o);}
 catch(e){console.error('测试版没做出来：'+(e.message||e));process.exitCode=1;}}
module.exports={build,moved,cards,green,workName,tree,parse};
