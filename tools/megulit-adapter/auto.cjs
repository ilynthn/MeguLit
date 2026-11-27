// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter auto: a finished download runs on its own to the point where the owner can test it, with no LLM
   (owner: 「以后新游戏来了你让脚本自动跑 你自己不要消费token 跑到给我测试的阶段了你再耗token去给我统计」).

     node tools/megulit-adapter.cjs auto <download folder> [--name <short>] [--issue N] [--pr N] [--no-publish]
                                         [--requests <dir>] [--copies <dir>] [--app <MeguLit install>]

   Steps (each is kept in <runs>/<short>/auto.json; a rerun goes on from the first step not done):
     1 install    tools/megulit-adapter/auto-install.cjs: archives, disc images, the game's own Inno installer, official updates,
                  the Japanese exe of a Chinese overlay package -> <copies>\<short>-auto
     2 adapt      the adapter itself with --tester (no game run here): identify, engine, script reader, a skeleton seed, the PR body
                  and its test request. Exit 3 (a question for a person), a new engine or a failure stops here
     3 publish    a worktree on adapt/<short> from origin/main, `publish --go` (seed commit, PR, HANDOFF row). --pr N takes an
                  existing PR instead (a replay of a game that already has one); --no-publish stops before (dry run)
     4 testbuild  the PR goes into the one combined test build <copies>\testbuild-all (tools/megulit-adapter/test-build-all.cjs): the newest
                  main + every open, CI-green PR with a card not done; 开始测试.cmd [<PR>] is the one entry (updater off, a version label)
     5 request    <requests>\<PR>-<short>.md (the tester's checklist) and <requests>\cards\<PR>.json (a card for the owner's
                  test bench, the c1312.json shape: the local page reads cards\*.json and shows it at once;
                  the tester's results land in <requests>\results\<id>.json, a tested card is set done:true)
   Where a person has to decide, <requests>\stuck\<short>.md says which step, what to decide and how to go on, and auto stops
   (exit 3). Nothing here opens the game to check it: the owner's tester does that.
   Exit codes: 0 a card is waiting, 3 stuck (a person decides), 2 bad arguments. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Install=require('./auto-install.cjs');

const REPO=path.join(__dirname,'..','..');
const ADAPTER=path.join(REPO,'tools','megulit-adapter.cjs');
const env=process.env;
const ROOTS=()=>({auto:env.MEGULIT_AUTO_ROOT||'F:\\Agent\\work\\adapt-auto',copies:env.MEGULIT_COPIES_ROOT||'H:\\MeguLit-Copies',requests:env.MEGULIT_TEST_REQUESTS||'E:\\Apps\\test-requests',
 app:env.MEGULIT_APP||'E:\\MeguLit',worktrees:env.MEGULIT_AUTO_WORKTREES||'F:\\Agent\\work\\wt'});
const STEPS=['install','adapt','publish','testbuild','request'];
const STEP_CN={install:'装游戏',adapt:'适配',publish:'开 PR',testbuild:'测试版',request:'测试清单和卡片'};
const shortOf=dir=>String(path.basename(path.resolve(dir))).replace(/\[[^\]]*\]/g,' ').normalize('NFKC').replace(/[^\w\-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase().slice(0,40)||'game';

function parse(argv){const o={dir:'',name:'',issue:0,pr:0,publish:true,requests:'',copies:'',app:'',vndb:'',queue:''};
 for(let i=0;i<argv.length;i++){const k=argv[i],v=()=>{if(i+1>=argv.length)throw Error(k+' needs a value');return argv[++i];};
  if(k==='--name')o.name=v();else if(k==='--vndb')o.vndb=v().toLowerCase();else if(k==='--queue')o.queue=v();else if(k==='--issue')o.issue=Number(v())||0;else if(k==='--pr')o.pr=Number(String(v()).replace(/.*\/pull\//,''))||0;
  else if(k==='--no-publish')o.publish=false;else if(k==='--requests')o.requests=v();else if(k==='--copies')o.copies=v();else if(k==='--app')o.app=v();
  else if(!k.startsWith('--')&&!o.dir)o.dir=k;else throw Error('unknown argument: '+k);}
 if(!o.dir)throw Error('usage: node tools/megulit-adapter.cjs auto <download folder> [--name <short>] [--issue N] [--pr N] [--no-publish]');
 return o;}

const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));}catch{return null;}};
const writeJson=(f,o)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(o,null,1)+'\n');};

/* ---- what the download says about itself: the queue order (<queue>\<short>.json: 「下载《原名》… VNDB v123 … 中文名 X」) and
   SOURCE.txt (作品: / 版本:). The copy's folder name carries no title, so without this the adapter cannot find the work on VNDB
   (制服カノジョ3 replay: three questions). A title without a VNDB id is looked up on VNDB here (identify.cjs vndb, no LLM). */
const QUEUE=()=>env.MEGULIT_AUTO_QUEUE||'F:\\Agent\\deepseek\\queue\\done';
function sourceText(src){for(const f of [path.join(src,'SOURCE.txt'),...(()=>{try{return fs.readdirSync(src,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(src,e.name,'SOURCE.txt'));}catch{return [];}})()])
 try{return fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'');}catch{}return '';}
function meta(src,short,{queue=QUEUE()}={}){const order=readJson(path.join(queue,short+'.json'))||{},task=String(order.task||''),source=sourceText(src),both=task+'\n'+source;
 const line=k=>{const m=new RegExp('^\\s*'+k+'\\s*[:：]\\s*(.+)$','m').exec(source);return m?m[1].trim():'';};
 let title=line('作品')||line('作品名')||(/《([^》]+)》/.exec(task)||[])[1]||'';
 if(!title){const first=source.split('\n').map(s=>s.trim()).find(Boolean)||'';const m=/^([^（(\s][^（(]*?)\s*[（(]/.exec(first);if(m&&m[1].length<=40)title=m[1].trim();}
 const vndb=((/VNDB\s*[:：]?\s*(v\d{2,6})\b/i.exec(both)||[])[1]||'').toLowerCase();
 const cn=((/中文名\s*[:：]?\s*[「『“"]?([^」』”"，,）)\n]+)/.exec(both)||[])[1]||'').trim();
 const release=(line('版本').split(/\s*\/\s+/)[0]||'').slice(0,60);
 return {title,vndb,cn,release,order:order.name?path.join(queue,short+'.json'):''};}

/* ---- the default workers (tests replace them)------------------------------------------------------------------------ */
function adapterCli(args,{node=process.execPath}={}){const r=spawnSync(node,[ADAPTER,...args],{encoding:'utf8',windowsHide:true,timeout:3600000,maxBuffer:64<<20});
 return {status:r.status===null?1:r.status,out:String(r.stdout||'')+String(r.stderr||'')+(r.error?'\n'+r.error.message:'')};}
function sh(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',windowsHide:true,timeout:600000});if(r.status!==0)throw Error(cmd+' '+args.join(' ')+': '+String(r.stderr||r.stdout||r.error?.message||'').trim().slice(-300));return String(r.stdout||'').trim();}
/* a checkout of the PR's branch for publish (a new branch from origin/main) or for the test build (an existing PR's head) */
function checkout({short,pr=0,root},{git=sh}={}){const dir=path.join(root,'adapt-'+short);
 if(fs.existsSync(path.join(dir,'.git'))){if(pr){git('git',['fetch','origin','pull/'+pr+'/head'],dir);git('git',['checkout','--detach','FETCH_HEAD'],dir);}return dir;}
 git('git',['fetch','origin','main'],REPO);
 if(pr){git('git',['fetch','origin','pull/'+pr+'/head'],REPO);git('git',['worktree','add','--detach',dir,'FETCH_HEAD'],REPO);}
 else{let branch='adapt/'+short;try{git('git',['rev-parse','--verify','refs/heads/'+branch],REPO);branch+='-'+Date.now().toString(36);}catch{}git('git',['worktree','add','-b',branch,dir,'origin/main'],REPO);}
 return dir;}
/* the installed MeguLit without user data, the checkout's code on top (robocopy: junctions skipped, long paths fine) */
const SKIP_DIRS=['cache','data','logs','secrets','migration','validation'];
const OVERLAY=['core','services','web','The Seed','tools'];
function robocopy(from,to,extra=[]){const r=spawnSync('robocopy',[from,to,'/E','/XJ','/NFL','/NDL','/NJH','/NJS','/NP','/R:1','/W:1',...extra],{windowsHide:true,timeout:1800000});if(r.status===null||r.status>=8)throw Error('robocopy '+from+' -> '+to+' failed ('+r.status+')');}
/* 2026-11-27 (owner, after the first test builds: 引导弹窗挡着、库是空的、翻译没配、Alt+T 被正式版占着 -> 测不了) a test build is ready the
   moment it is double-clicked: readyBuild(<card folder>, {root, app, exe, title, pr})
     - <root>\data gets the installed MeguLit's preferences.json and data\config (translation settings, the DPAPI key vault, the account:
       this PC's own user, never in the repository), not its library.json (its scan folders would pull the whole library in) nor its
       database; a fresh megulit-relocation.json names this root, so nothing rewrites paths
     - <card folder>\test-start.json + test-start.cjs + 开始测试.cmd: closes the other MeguLit instances through their command file,
       starts this one side by side with a debugging port, adds the game under the work's name (never the copy's folder name) and
       clicks its 「开始」 (tools/megulit-adapter/test-start.cjs)
   A card folder may point at another card's build (OZMAFIA!! #1312 sits on #1303's branch and build). */
const READY_SKIP_CONFIG=/^(library\.json|.*\.rollback-.*|.*\.bak-.*)$/i;
function portOf(pr){return 9300+(Number(pr)||0)%600;}
function readyBuild(card,{root,app,exe,title,pr,label='',refresh=null,games=null}){if(!fs.existsSync(path.join(root,'MeguLit.exe')))throw Error('找不到测试版 MeguLit：'+root);
 const data=path.join(root,'data'),cfg=path.join(data,'config');fs.mkdirSync(cfg,{recursive:true});
 const from=path.join(app,'data','config');if(fs.existsSync(from))for(const e of fs.readdirSync(from,{withFileTypes:true})){if(READY_SKIP_CONFIG.test(e.name))continue;
  fs.cpSync(path.join(from,e.name),path.join(cfg,e.name),{recursive:true,force:true});}
 for(const f of ['preferences.json'])if(fs.existsSync(path.join(app,'data',f)))fs.copyFileSync(path.join(app,'data',f),path.join(data,f));
 fs.writeFileSync(path.join(data,'megulit-relocation.json'),JSON.stringify({schema:1,root,migratedAt:new Date().toISOString()}));
 /* the page files are built into MeguLit.exe; web\ next to it is read only while data\hot-update.json names this exe
    (desktop/src/hot_assets.rs, services/hot-update.cjs exeStamp): without it the test build shows the exe's own pages, not the PR's */
 const st=fs.statSync(path.join(root,'MeguLit.exe'));fs.writeFileSync(path.join(data,'hot-update.json'),JSON.stringify({exe:st.size+'-'+Math.floor(st.mtimeMs),testBuild:true}));
 fs.mkdirSync(card,{recursive:true});fs.copyFileSync(path.join(__dirname,'test-start.cjs'),path.join(card,'test-start.cjs'));
 /* games: {<PR>: {exe, title}} (the integration build, 开始测试.cmd <PR>); one game: exe/title of that PR */
 const list=games||(exe?{[String(pr||'game')]:{exe,title}}:{});
 fs.writeFileSync(path.join(card,'test-start.json'),JSON.stringify({root,port:portOf(pr),label,games:list,refresh},null,1)+'\n');
 /* the card keeps its own node: a rebuild replaces the build folder (app-<main>-<pr>) while the cmd may be running */
 const ownNode=path.join(card,'node.exe'),src=path.join(root,'runtime','node.exe');if(!fs.existsSync(ownNode)&&fs.existsSync(src))fs.copyFileSync(src,ownNode);
 const node=fs.existsSync(ownNode)?'%~dp0node.exe':'node';
 const cmd=path.join(card,'开始测试.cmd');
 fs.writeFileSync(cmd,'@echo off\r\nrem MeguLit test: updates this test build to the newest main + PRs, closes the installed MeguLit, opens the test build;\r\nrem with a PR number (this cmd 1312) that card\'s game starts from it\r\n"'+node+'" "%~dp0test-start.cjs" "%~dp0." %*\r\nif errorlevel 1 pause\r\n');
 return {cmd,port:portOf(pr)};}

/* ---- the tester's checklist and the owner's card ------------------------------------------------------------------- */
const CHECKS=[['c1','对话框里的日文原文藏住了，没有残留','第一句先露一下再藏是故意的；说话人名牌可以留着'],['c2','阅读层日文和中文都在，点一下游戏就换一句，不停在旧句、不跳句',''],['c3','第一个选项：每个选项都有中文，点中文选项能选中','选项画面务必截图']];
function checklist(a){const L=[];L.push('# '+a.pr+' '+a.title+' 实测清单（auto 生成）','',
 '- PR：https://github.com/ilynthn/MeguLit/pull/'+a.pr+(a.issue?'（Refs #'+a.issue+'）':''),
 '- 作品：'+a.title+(a.vndb?'（VNDB '+a.vndb+(a.release?'，'+a.release:'')+'）':'')+'，引擎 '+(a.engine||'?'),
 '- 来源：'+a.src,'','## 游戏副本','','- 目录：`'+a.copy+'`','- 启动程序：`'+path.basename(a.exe)+'`'+(a.notes.length?'（'+a.notes.join('；')+'）':''),
 '- 装法：'+a.installSteps.join('；'),'- 测试专用副本，随便存档；测完由主会话删','','## 测试版 MeguLit','',
 '- 双击 `'+a.cmd+'`：先正常退出正式版 MeguLit（释放 Alt+T），再打开测试版（设置、翻译、API 跟正式版一样，游戏已在库里），然后从测试版启动游戏','- 测完关掉测试版就行，正式版不会自动重开','- 游戏音量调到 0','',
 '## 步骤','',...a.steps.map((s,i)=>(i+1)+'. '+s),'','## 通过','',...CHECKS.map(c=>'- '+c[1]+(c[2]?'（'+c[2]+'）':'')),'- 全程不崩、不卡、不闪','',
 '## 回传截图','','1. 第 3 句左右的对话画面','2. 第 10 句左右的对话画面','3. 第一个选项画面（中文选项出来之后）','4. 选完选项后的下一句','',
 '不通过时另附测试版 `MeguLit\\logs\\` 里最新的 `hook-diagnostics.log`。');
 /* the adapter's own test request: only the notes under its 「## 游戏」 (which exe, the engine, the lines read); its steps are the ones above */
 const notes=(/## 游戏\n([\s\S]*?)(\n## |$)/.exec(a.adapterRequest||'')||[])[1]||'';const keep=notes.split('\n').filter(l=>/^- /.test(l)&&!/^- 目录：/.test(l));
 if(keep.length)L.push('','## 适配器的说明','',...keep);
 return L.join('\n')+'\n';}
const STEPS_FOR=()=>['双击开始测试.cmd，游戏会自己打开（会先关掉正式版 MeguLit）','片头点掉，标题选「はじめから」（START），看前 10 句','继续点（或按住 Ctrl 快进）到第一个选项，停几秒','选一个中文选项，再往下点 3 句'];
function nextOrder(dirs){let n=0;for(const d of dirs){let names=[];try{names=fs.readdirSync(d);}catch{}for(const f of names){const c=/\.json$/i.test(f)&&readJson(path.join(d,f));if(c&&Number(c.order)>n)n=Number(c.order);}}return n+1;}
function card(a,order){return {id:String(a.pr),title:a.title,sub:'#'+a.pr+' · auto 生成 · 用 '+path.basename(a.exe)+' 启动'+(a.notes.length?'；'+a.notes[0]:''),game:a.exe,app:a.cmd,steps:a.steps,checks:CHECKS.map(c=>[...c]),order,done:false};}

/* ---- stuck: which step, what a person decides, how to go on ------------------------------------------------------------ */
function stuckNote(st,{step,why,decide,evidence=[]}){const L=['# '+st.short+' 卡在「'+STEP_CN[step]+'」（auto，'+new Date().toISOString().slice(0,16).replace('T',' ')+'）','',
 '- 下载目录：`'+st.src+'`'+(st.issue?'，issue #'+st.issue:''),'- 卡在哪：'+why,'- 要人决定：'+decide,...evidence.map(e=>'- 证据：`'+e+'`'),'',
 '## 决定后怎么继续','','```','node tools/megulit-adapter.cjs auto "'+st.src+'" --name '+st.short+(st.issue?' --issue '+st.issue:'')+(st.pr?' --pr '+st.pr:''),'```',
 '（auto 从没做完的那一步接着跑；已做完的步骤记在 `'+st.file+'`）',''];
 if(step==='adapt'&&st.adapterOut)L.splice(L.length-1,0,'','适配器的问题先回答：`node tools/megulit-adapter.cjs answer "'+st.adapterOut+'" <id>=<值> ...`，再跑上面的 auto。');
 return L.join('\n')+'\n';}

/* ---- the run ---------------------------------------------------------------------------------------------------------- */
async function auto(o,{log=console.log,deps={}}={}){const R={...ROOTS(),...(o.requests?{requests:o.requests}:{}),...(o.copies?{copies:o.copies}:{}),...(o.app?{app:o.app}:{})};
 const D={install:Install.install,adapter:adapterCli,checkout,integrate:o=>require('./test-build-all.cjs').build(o),vndb:a=>require('./identify.cjs').vndb(a),...deps};
 const src=path.resolve(o.dir),short=o.name||shortOf(src),file=path.join(R.auto,'runs',short,'auto.json');
 const st={short,src,issue:o.issue||0,file,steps:{},...readJson(file),short,src,file};if(o.issue)st.issue=o.issue;if(o.pr)st.pr=o.pr;
 const save=()=>{st.updatedAt=new Date().toISOString();writeJson(file,st);};
 const stuckFile=path.join(R.requests,'stuck',short+'.md');
 const stop=(step,why,decide,evidence=[])=>{st.stuck={step,why,decide,at:new Date().toISOString()};save();fs.mkdirSync(path.dirname(stuckFile),{recursive:true});
  fs.writeFileSync(stuckFile,stuckNote(st,{step,why,decide,evidence}));log('# 卡在「'+STEP_CN[step]+'」：'+why+' → '+stuckFile);return 3;};
 delete st.stuck;save();
 /* 1 install */
 if(!st.steps.install?.ok){log('# 1 装游戏 '+src);let r;try{r=await D.install(src,{short,root:R.copies,log});}catch(e){r={ok:false,why:String(e.message||e)};}
  st.steps.install=r;save();if(!r.ok)return stop('install',r.why,'能不能装、怎么装（装好后把游戏目录放到副本目录或给 auto 指一个装好的目录）');}
 const inst=st.steps.install;
 /* 2 adapt (--tester: no game run; a skeleton seed, the PR body, the test request) */
 const out=path.join(R.auto,'runs',short,'adapter');st.adapterOut=out;
 if(!['ready','published'].includes(st.steps.adapt?.state)){log('# 2 适配 '+inst.exe);
  const prev=readJson(path.join(out,'adapter.json'));
  const m=meta(src,short,o.queue?{queue:o.queue}:{});if(o.vndb)m.vndb=o.vndb;
  if(!m.vndb&&m.title){try{const v=await D.vndb({title:m.title,gameDir:inst.dir});if(v?.vndb){m.vndb=v.vndb;m.vndbHow='VNDB 按标题「'+m.title+'」';if(!m.cn&&v.cn)m.cn=v.cn;}}catch{}}
  st.meta=m;save();const idArgs=[...(m.vndb?['--vndb',m.vndb]:[]),...(m.cn?['--cn',m.cn]:[])];
  /* the release is left to the adapter's own VNDB match (SOURCE.txt's 版本 line is free text); a stuck note shows it as a hint */
  /* a person answered meanwhile (answer <out> ...): the adapter's state is taken as it is; still waiting: re-judged with its answers */
  const r=prev&&['ready','published'].includes(prev.state)?{status:0,out:''}:prev&&prev.state==='waiting'?D.adapter(['answer',out]):D.adapter([inst.dir,'--exe',path.relative(inst.dir,inst.exe),'--tester','--out',out,...idArgs]);
  const a=readJson(path.join(out,'adapter.json'))||{};
  st.steps.adapt={exit:r.status,state:a.state||'',engine:a.engine||'',known:a.caps?.known!==false,title:a.title||'',seed:a.seed||'',review:a.review||'',tail:String(r.out||'').trim().split('\n').slice(-12).join('\n')};save();
  if(/unknown argument: --tester/.test(r.out||''))return stop('adapt','这份适配器还没有 --tester（离线 skeleton seed，#1312 带来的）','先合 #1312，或在有 --tester 的检出上跑 auto');
  if(r.status===3)return stop('adapt','适配器停下来问人（退出码 3）：\n'+(a.questions||[]).filter(q=>!(q.id in (a.answers||{}))).map(q=>'  - '+q.id+'：'+q.ask).join('\n')+(m.release?'\n  - 下载说明里写的版本：'+m.release:''),'回答 review.html 里的问题',[a.review||path.join(out,'review.html')]);
  if(a.caps&&a.caps.known===false)return stop('adapt','新引擎：规则表里没有'+(a.engine?'（'+a.engine+'）':'')+(a.caps.luna?'，LunaHook 认作 '+a.caps.luna:''),'用哪个引擎层（engines.cjs 加规则 / 剧本读取器），或这部先不适配',[path.join(out,'adapter.json')]);
  if(a.state==='skipped')return stop('adapt','HANDOFF 里同发行版已适配过，适配器没重做','要不要重做（重做：answer again=yes）',[path.join(out,'adapter.json')]);
  if(r.status!==0||a.state!=='ready')return stop('adapt','适配器没做完（退出码 '+r.status+'，状态 '+(a.state||'无')+(a.seedError?'，'+a.seedError:'')+'）：\n```\n'+st.steps.adapt.tail+'\n```','看日志决定怎么修（适配器/引擎层的活）',[path.join(out,'adapter.json')]);}
 const ad=readJson(path.join(out,'adapter.json'))||{};
 /* 3 publish */
 if(!st.steps.publish?.pr){if(o.pr){st.steps.publish={pr:o.pr,how:'existing'};save();}
  else if(!o.publish){log('# 3 不开 PR（--no-publish），停在这里');st.steps.publish={dry:true};save();return 0;}
  else{log('# 3 开 PR');let repo='';try{repo=D.checkout({short,root:R.worktrees});}catch(e){return stop('publish','建分支检出失败：'+e.message,'看 git 的错误');}
   if(st.issue){const body=path.join(out,'pr-body.md');try{const t=fs.readFileSync(body,'utf8');if(!t.includes('#'+st.issue))fs.writeFileSync(body,t.replace(/\n## 改动/,'\nRefs #'+st.issue+'\n\n## 改动'));}catch{}}
   const r=D.adapter(['publish',out,'--repo',repo,'--go']);const a=readJson(path.join(out,'adapter.json'))||{};const n=Number(String(a.pr||'').replace(/.*\/pull\//,''))||0;
   if(r.status!==0||!n)return stop('publish','publish --go 没开出 PR（退出码 '+r.status+'）：\n```\n'+String(r.out||'').trim().split('\n').slice(-8).join('\n')+'\n```','看错误；分支 '+repo);
   st.steps.publish={pr:n,url:a.pr,repo};save();}}
 const pr=st.steps.publish.pr;
 /* 4 + 5: the card first (the integration build reads the cards), then the PR goes into the one combined test build
    (<copies>\testbuild-all: main + every open, CI-green PR with a card not done; test-build-all.cjs). The PR's own CI may not be green yet:
    it is left out until it is, and 开始测试.cmd integrates again by itself (a new card counts as a change) */
 const cmdPath=path.join(R.copies,'testbuild-all','开始测试.cmd');
 const title=ad.title||st.steps.adapt?.title||short,args={pr,title,issue:st.issue,vndb:ad.answers?.vndb||ad.identity?.vndb||'',release:ad.answers?.release||ad.identity?.release||ad.identity?.releaseGuess||'',
  engine:ad.caps?.label||ad.engine||'',src,copy:inst.dir,exe:inst.exe,notes:inst.notes||[],installSteps:inst.steps||[],cmd:cmdPath+' '+pr,steps:STEPS_FOR(inst.exe),
  adapterRequest:(()=>{try{return fs.readFileSync(path.join(out,'test-request.md'),'utf8');}catch{return '';}})()};
 const md=path.join(R.requests,pr+'-'+short+'.md');fs.mkdirSync(R.requests,{recursive:true});fs.writeFileSync(md,checklist(args));
 const cards=path.join(R.requests,'cards');fs.mkdirSync(cards,{recursive:true});const cf=path.join(cards,pr+'.json');
 /* a rerun keeps the card's place and a done the tester already set */
 const old=readJson(cf);const c=card(args,old?.order||nextOrder([cards]));if(old?.done)c.done=true;writeJson(cf,c);
 st.steps.request={md,card:cf};save();try{fs.rmSync(stuckFile,{force:true});}catch{}
 /* the combined build: a failure does not take the card back (it opens in the next 开始测试.cmd run) */
 try{const t=D.integrate({add:[Number(pr)],dir:path.join(R.copies,'testbuild-all'),cards:path.join(R.requests,'cards'),oldRoots:{}});st.steps.testbuild={dir:t.root,cmd:cmdPath,merged:t.merged,skipped:t.skipped};save();}
 catch(e){st.steps.testbuild={cmd:cmdPath,error:String(e.message||e)};save();log('# 合并测试版这次没做成（'+e.message+'）：卡片已写，下次 开始测试.cmd 会再集成');}
 log('# 5 测试清单 '+md+'，卡片 '+cf);return 0;}

async function main(argv){let o;try{o=parse(argv);}catch(e){console.error('megulit-adapter auto: '+e.message);return 2;}return auto(o);}
module.exports={readyBuild,portOf,auto,main,parse,meta,shortOf,checklist,card,stuckNote,checkout,nextOrder,STEPS,CHECKS};
