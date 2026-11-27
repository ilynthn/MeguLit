// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (owner: 测试版必须是最新版 MeguLit，直接从 main 更新进来，不能再拿 1.4.23a 的安装版做底子) a test build made from the newest code:
     node tools/megulit-adapter/test-build-fresh.cjs --card <card folder> --pr N --exe <game exe> --title <work name> [--old-root <dir>]
     node tools/megulit-adapter/test-build-fresh.cjs --card <card folder>          (again, with what test-start.json already says)
   1 the tree: origin/main with the PR merged in (and this test-build mode, origin/feat/adapter-auto-pipeline, while it is not on main),
     in its own worktree <copies>\testbuild-src\pr-N; a conflict stops the build and is reported, nothing is half made
   2 the shell and runtime: the newest MeguLit release (MeguLit.exe, runtime packs) - this PC has no Rust, so the shell is the release's;
     the label says which (「外壳 v1.4.25」) and main's commits to desktop/ since that tag are listed in test-build.json
   3 the code: core, services, web, The Seed, tools, setup from the tree
   4 native: the C++ helpers from main's newest successful CI run (artifact native-binaries); the C# helpers (HookBridge, GalWindowBridge)
     built here from the tree; a C++ part the PR itself changes is taken from the PR session's own build (--old-root) when it has one,
     else noted; the LunaHook DLL (MeguLitHook) has no CI build: the release's, noted unless the PR's own is there
   5 <card>\app-<main7>-<pr7>\ is the new build (a running older build is never touched); readyBuild writes the tester's settings, the
     start files and the label 「测试版 · main＠<main7> + PR #N」 (MEGULIT_TEST_BUILD: the updater is off, the label is on screen)
   test-start.cjs runs this again by itself when main or the PR has moved (開始测试.cmd: always the newest). */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const REPO=path.join(__dirname,'..','..');
const COPIES=()=>process.env.MEGULIT_COPIES_ROOT||'H:\\MeguLit-Copies';
const CONFIG_APP=()=>process.env.MEGULIT_APP||'E:\\MeguLit';
const AUTO_BRANCH='feat/adapter-auto-pipeline';
const OVERLAY=['core','services','web','The Seed','tools','setup'];

function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,timeout:1800000,maxBuffer:256<<20,...opts});
 if(r.status!==0)throw Error(path.basename(cmd)+' '+args.slice(0,3).join(' ')+' 失败：'+String(r.stderr||r.stdout||r.error?.message||'').trim().slice(-400));return String(r.stdout||'').trim();}
const git=(args,cwd=REPO)=>run('git',args,{cwd});
const gh=args=>run('gh',args,{cwd:REPO});
function robocopy(from,to,extra=[]){const r=spawnSync('robocopy',[from,to,'/E','/XJ','/NFL','/NDL','/NJH','/NJS','/NP','/R:1','/W:1',...extra],{windowsHide:true,timeout:1800000});if(r.status===null||r.status>=8)throw Error('robocopy '+from+' -> '+to+' 失败（'+r.status+'）');}

/* 1 the tree */
function tree(pr,log){const dir=path.join(COPIES(),'testbuild-src','pr-'+pr);
 git(['fetch','-q','origin','main','+refs/pull/'+pr+'/head:refs/remotes/origin/pr/'+pr,'+refs/heads/'+AUTO_BRANCH+':refs/remotes/origin/'+AUTO_BRANCH]);
 if(!fs.existsSync(path.join(dir,'.git'))){fs.mkdirSync(path.dirname(dir),{recursive:true});git(['worktree','add','-f','--detach',dir,'origin/main']);}
 git(['checkout','-q','-f','--detach','origin/main'],dir);git(['clean','-q','-fd'],dir);
 const merge=ref=>{const r=spawnSync('git',['merge','--no-edit','-q',ref],{cwd:dir,encoding:'utf8',windowsHide:true});
  if(r.status!==0){const files=String(spawnSync('git',['diff','--name-only','--diff-filter=U'],{cwd:dir,encoding:'utf8'}).stdout||'').trim().split('\n').filter(Boolean);
   spawnSync('git',['merge','--abort'],{cwd:dir,windowsHide:true});throw Error(ref+' 合到最新 main 有冲突：'+(files.join('、')||String(r.stderr).trim().slice(-200))+'；要人解决');}};
 merge('origin/pr/'+pr);
 const inMain=spawnSync('git',['merge-base','--is-ancestor','origin/'+AUTO_BRANCH,'HEAD'],{cwd:dir}).status===0;
 if(Number(pr)!==1318&&!inMain&&fs.existsSync(path.join(dir,'tools','megulit-adapter'))){try{merge('origin/'+AUTO_BRANCH);}catch(e){log('# 测试版模式（#1318）合不进来：'+e.message+'；更新器照旧，标签不显示');}}
 const sha=r=>git(['rev-parse',r]);return {dir,main:sha('origin/main'),pr:sha('origin/pr/'+pr),head:sha('HEAD'),changed:git(['diff','--name-only','origin/main...origin/pr/'+pr]).split('\n').filter(Boolean)};}

/* 2 the newest release, cached */
function base(log){const rel=JSON.parse(gh(['release','view','--repo','ilynthn/MeguLit','--json','tagName,assets']));const asset=rel.assets.find(a=>/win-x64\.zip$/i.test(a.name));
 const dir=path.join(COPIES(),'testbuild-base',rel.tagName),zip=dir+'.zip';
 if(!fs.existsSync(path.join(dir,'.complete'))){log('# 下载 '+rel.tagName+' 的外壳和运行库');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  if(!fs.existsSync(zip))gh(['release','download',rel.tagName,'--repo','ilynthn/MeguLit','-p',asset.name,'-O',zip]);
  run(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',zip,'-C',dir]);fs.writeFileSync(path.join(dir,'.complete'),rel.tagName);}
 const root=fs.existsSync(path.join(dir,'MeguLit.exe'))?dir:fs.readdirSync(dir).map(n=>path.join(dir,n)).find(d=>fs.existsSync(path.join(d,'MeguLit.exe')));
 if(!root)throw Error(rel.tagName+' 的包里没有 MeguLit.exe');return {tag:rel.tagName,root};}
/* 4 main's newest native helpers (CI artifact), cached by run */
function nativeArtifact(log){const runs=JSON.parse(gh(['run','list','--repo','ilynthn/MeguLit','--branch','main','--workflow','ci.yml','--status','success','--limit','5','--json','databaseId,headSha']));
 for(const r of runs){const dir=path.join(COPIES(),'testbuild-base','native-'+r.databaseId);if(fs.existsSync(path.join(dir,'.complete')))return {dir,sha:r.headSha};
  try{log('# 下载 main 的原生组件（CI '+r.databaseId+'）');fs.mkdirSync(dir,{recursive:true});gh(['run','download',String(r.databaseId),'--repo','ilynthn/MeguLit','-n','native-binaries','-D',dir]);fs.writeFileSync(path.join(dir,'.complete'),r.headSha);return {dir,sha:r.headSha};}catch(e){log('#   '+e.message);}}
 return null;}

function build(o,{log=console.log}={}){const card=path.resolve(o.card),prev=(()=>{try{return JSON.parse(fs.readFileSync(path.join(card,'test-start.json'),'utf8'));}catch{return {};}})();
 const pr=Number(o.pr||prev.pr),exe=o.exe||prev.exe,title=o.title||prev.title,oldRoot=o.oldRoot||prev.root||'';if(!pr||!exe||!title)throw Error('要 --pr --exe --title');
 const t=tree(pr,log),b=base(log),art=nativeArtifact(log),notes=[];
 const target=path.join(card,'app-'+t.main.slice(0,7)+'-'+t.pr.slice(0,7));
 if(!fs.existsSync(path.join(target,'.complete'))){log('# 组装测试版 '+target);fs.rmSync(target,{recursive:true,force:true});
  robocopy(b.root,target,['/XD',...['data','cache','logs','secrets','migration','validation'].map(d=>path.join(b.root,d)),'/XF','*.rollback-*','*.bak-*']);
  /* the release ships no runtime\ (node, hook packs, Locale Emulator: 1.9 GB, fetched at first start); the installed app's is copied so the
     build starts at once (MeguLit itself brings a pack up to date when main asks for a newer one) */
  if(!fs.existsSync(path.join(target,'runtime','node.exe'))&&fs.existsSync(path.join(CONFIG_APP(),'runtime','node.exe'))){log('# 复制运行库');robocopy(path.join(CONFIG_APP(),'runtime'),path.join(target,'runtime'));}
  for(const d of OVERLAY)if(fs.existsSync(path.join(t.dir,d)))robocopy(path.join(t.dir,d),path.join(target,d),d==='The Seed'?['/PURGE']:[]);
  if(art){for(const f of fs.readdirSync(art.dir))if(/\.(exe|dll)$/i.test(f))fs.copyFileSync(path.join(art.dir,f),path.join(target,'native',f));}else notes.push('main 的 C++ 原生组件没下到，用 '+b.tag+' 的');
  /* C# from the tree */
  const ps=(file,args=[])=>run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(t.dir,'native',file),...args],{cwd:path.join(t.dir,'native')});
  try{ps('Build-HookBridge.ps1',['-OutputPath',path.join(target,'native','HookBridge.exe')]);}catch(e){notes.push('HookBridge 没编出来，用 '+b.tag+' 的');log('# '+e.message);}
  try{ps('Build-GalWindowBridge.ps1');for(const f of ['GalWindowBridge.exe','GalWindowBridge.updated.exe'])if(fs.existsSync(path.join(t.dir,'native',f))){fs.copyFileSync(path.join(t.dir,'native',f),path.join(target,'native','GalWindowBridge.exe'));break;}}catch(e){notes.push('GalWindowBridge 没编出来，用 '+b.tag+' 的');log('# '+e.message);}
  /* a C++ part this PR changes: the PR session's own build, else main's (noted) */
  let comps=[];try{comps=JSON.parse(fs.readFileSync(path.join(t.dir,'native','native-builds.json'),'utf8'));}catch{}
  for(const c of comps){if(/\.cs$/i.test(String(c.sources||'')))continue;const touched=t.changed.some(f=>(c.sources||[]).some(s=>f===s||f.startsWith(s.replace(/\\/g,'/')+'/')));if(!touched&&c.name!=='megulithook')continue;
   const outs=(c.outputs||[]).filter(f=>/\.(dll|exe)$/i.test(f));let took=0;
   for(const out of outs){const rel=out.replace(/^native[\\/]/,'');const cands=[oldRoot&&path.join(oldRoot,'native',rel),oldRoot&&path.join(oldRoot,'runtime',rel),path.join(t.dir,out)].filter(Boolean);
    const from=touched?cands.find(f=>fs.existsSync(f)):null;if(from){fs.mkdirSync(path.dirname(path.join(target,'native',rel)),{recursive:true});fs.copyFileSync(from,path.join(target,'native',rel));if(/megulithook/i.test(rel)){fs.mkdirSync(path.join(target,'runtime','megulithook'),{recursive:true});fs.copyFileSync(from,path.join(target,'runtime','megulithook',path.basename(rel)));}took++;}}
   if(touched)notes.push(c.name+(took?' 用 PR 会话编的':' 本 PR 改过但这台机器编不了，用 main/'+b.tag+' 的'));else notes.push('钩子 DLL（'+c.name+'）没有 CI 产物，用 '+b.tag+' 的');}
  const shellLag=git(['log','--oneline',b.tag+'..origin/main','--','desktop/']).split('\n').filter(Boolean);
  /* HTML always comes from the shell (its CSP hashes are built in): a page whose HTML changed since the release is noted */
  const html=git(['diff','--name-only',b.tag,'HEAD','--','web/*.html','web/**/*.html'],t.dir).split('\n').filter(Boolean);if(html.length)notes.push('HTML 用 '+b.tag+' 外壳里的（'+html.join('、')+' 之后改过）');
  fs.writeFileSync(path.join(target,'test-build.json'),JSON.stringify({pr,main:t.main,prHead:t.pr,head:t.head,base:b.tag,nativeArtifactSha:art?.sha||'',shellBehindMain:shellLag,notes,at:new Date().toISOString()},null,1));
  fs.writeFileSync(path.join(target,'.complete'),t.head);}
 const info=JSON.parse(fs.readFileSync(path.join(target,'test-build.json'),'utf8'));
 const label='测试版 · main＠'+t.main.slice(0,7)+' + PR #'+pr+'（外壳 '+b.tag+(info.shellBehindMain.length?'，main 之后外壳改了 '+info.shellBehindMain.length+' 个提交':'')+'）';
 const Auto=require('./auto.cjs');const r=Auto.readyBuild(card,{root:target,app:CONFIG_APP(),exe,title,pr,label,refresh:{builder:__filename,main:t.main,pr:t.pr}});
 /* older builds of this card: removed when nothing runs from them */
 for(const n of fs.readdirSync(card))if(/^app-/.test(n)&&path.join(card,n)!==target){const dir=path.join(card,n);const busy=spawnSync('powershell.exe',['-NoProfile','-Command',"@(Get-CimInstance Win32_Process | ? { $_.ExecutablePath -like '"+dir.replace(/'/g,"''")+"\\*' }).Count"],{encoding:'utf8',windowsHide:true}).stdout.trim();
  if(busy==='0')fs.rmSync(dir,{recursive:true,force:true});}
 log('# 测试版就绪：'+target+'；'+label+(info.notes.length?'；'+info.notes.join('；'):''));return {...r,root:target,label,notes:info.notes};}

function parse(argv){const o={};for(let i=0;i<argv.length;i++){const k=argv[i],v=()=>argv[++i];if(k==='--card')o.card=v();else if(k==='--pr')o.pr=v();else if(k==='--exe')o.exe=v();else if(k==='--title')o.title=v();else if(k==='--old-root')o.oldRoot=v();else throw Error('unknown argument: '+k);}if(!o.card)throw Error('--card <card folder>');return o;}
if(require.main===module){try{build(parse(process.argv.slice(2)));}catch(e){console.error('测试版没做出来：'+(e.message||e));process.exitCode=1;}}
module.exports={build,tree,base,nativeArtifact,parse};
