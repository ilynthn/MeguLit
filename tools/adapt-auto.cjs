#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 unattended adaptation of one game folder (owner: QQ 群文件 → adapt.ps1 解压识别 → 这里自动适配 → 回执).
   Strings the existing parts together, nothing re-implemented:
     1 game folder → main exe + engine       core/library.cjs findGame/engineOf, services/engine-fingerprint.cjs fingerprint
     2 probe (no game run)                   services/probe-full.cjs collect + unpack → <out>/probe (tools/diff-maker/README.md layout)
     3 cold test (hidden desktop, muted)     services/cold-test.cjs testOne: save snapshot → ColdDesk + HookNative + drive.cjs → restore
     4 diff                                  tools/diff-maker make/write over the probe + the cold run's logs (never --write-repo)
     5 Cardinal                              tools/cardinal.cjs --logs <run>: the cold run replayed into the headless reader
     6 verdict                               judge(): cold self-check + Cardinal; anything not measured → inconclusive, never a guessed pass
   Usage: node tools/adapt-auto.cjs <game folder> [--exe <relative path>] [--out <dir>] [--budget-min N] [--app <MeguLit install>] [--foreground]
     --foreground  the game on the visible desktop (owner away only; still muted, still in ColdDesk's job) and whole-screen
                   pictures (every 4 s for the first 16 s, then every 15 s) into <out>/screen/ (the hidden desktop's shots are the game's client area only)
   Writes <out>/result.json {verdict, engine, gameKey, reasons, artifacts, ...}; exit 0 pass, 1 fail, 2 inconclusive.
   Never writes into the game folder (the save snapshot/restore of the cold test is the only thing that touches its saves), never
   writes .adapt-result.json (that file sends the group receipt and deletes the game). One run at a time (a lock in the runs root). */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const REPO=path.join(__dirname,'..');
const RUNS_ROOT=process.env.MEGULIT_ADAPT_RUNS||'F:\\Agent\\work\\adapt-auto-runs';
const APP_DEFAULT=process.env.MEGULIT_APP||'E:\\MeguLit';
const EXIT={pass:0,fail:1,inconclusive:2};
/* what Cardinal must reach for each of the three checks (scores 0..1, core/cardinal/score.cjs) */
const GATE={leak:0.98,row:0.9,pair:0.9,choice:1};

/* ---- 0 arguments ------------------------------------------------------------------------------------------------------ */
function parseArgs(argv){const a=argv.slice(2),o={dir:'',exe:'',out:'',budgetMin:6,app:APP_DEFAULT,foreground:false};
 for(let i=0;i<a.length;i++){const k=a[i];
  if(k==='--exe')o.exe=a[++i]||'';else if(k==='--out')o.out=a[++i]||'';else if(k==='--budget-min')o.budgetMin=Number(a[++i]);else if(k==='--app')o.app=a[++i]||'';else if(k==='--foreground')o.foreground=true;
  else if(!k.startsWith('--')&&!o.dir)o.dir=k;else throw Error('unknown argument: '+k);}
 if(!o.dir)throw Error('usage: node tools/adapt-auto.cjs <game folder> [--exe <relative path>] [--out <dir>] [--budget-min N]');
 if(!(o.budgetMin>0&&o.budgetMin<=60))throw Error('--budget-min must be 1..60');
 return o;}

/* a display title from the download folder: 「[GAME][PC-JP] トリック･オア･アリス」→「トリック･オア･アリス」 */
const titleOf=dir=>path.basename(path.resolve(dir)).replace(/\[[^\]]*\]/g,' ').replace(/[『』]/g,'').replace(/\s+/g,' ').trim()||path.basename(dir);
const safeName=s=>String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,80)||'game';
const inside=(child,parent)=>{const r=path.relative(path.resolve(parent),path.resolve(child));return r===''||!!r&&!r.startsWith('..')&&!path.isAbsolute(r);};

/* ---- 1 game folder → exe + engine -------------------------------------------------------------------------------------- */
const SWITCH=/\.(nsp|xci|nsz|xcz|nca|nro|nso)$/i,DISC=/\.(iso|mds|mdf|cue|ccd|img|nrg|cdi|chd|b5t|b6t|isz)$/i;
function walk(dir,depth,out=[]){let ents=[];try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of ents){const f=path.join(dir,e.name);if(e.isDirectory()){if(depth>0)walk(f,depth-1,out);}else out.push(f);}return out;}
/* Switch titles and disc images cannot be cold-tested on this PC: a reason, or '' */
function unsupported(dir,files=walk(dir,4)){
 if(/\[[0-9A-F]{16}\]/i.test(path.basename(dir))||files.some(f=>SWITCH.test(f)))return 'Switch 游戏（要模拟器），冷测试跑不了';
 const exes=files.filter(f=>/\.exe$/i.test(f));
 if(files.some(f=>DISC.test(f))&&!exes.length)return '光盘镜像（要挂载/安装），冷测试跑不了';
 if(!exes.length)return '目录里没有 exe';
 return '';}
/* the engine id core/profiles knows: library registry name first, then the archive fingerprint over the folder's files */
function engineOfGame(gameDir){const Profiles=require('../core/profiles/index.cjs');
 try{const e=require('../core/library.cjs').engineOf(gameDir);const id=e&&Profiles.engineId(e.name);if(id)return {engine:id,why:'library '+e.name};}catch{}
 try{const F=require('../services/engine-fingerprint.cjs');const markers=[],archives=[];
  for(const f of walk(gameDir,2)){const name=path.relative(gameDir,f).replace(/\\/g,'/'),base=path.basename(f);const m=F.markerOf(base);if(m)markers.push(m);
   if(/\.(xp3|arc|pac|npa|dat|pfs|int|ypf|cpz|rpa|rgss3a|rgss2a|rgssad|pck|bin|dpm|gxp)$/i.test(base)){let magic='';try{const fd=fs.openSync(f,'r'),b=Buffer.alloc(8);fs.readSync(fd,b,0,8,0);fs.closeSync(fd);magic=b.toString('hex');}catch{}archives.push({name,magic});}}
  const fp=F.fingerprint({markers,archives});const id=fp&&Profiles.engineId(fp.engine);if(id)return {engine:id,why:'fingerprint '+fp.engine+' ('+fp.evidence+')'};}catch{}
 return {engine:'',why:'engine unknown'};}
/* --exe wins; else core/library findGame, which looks up to four folders down (Monochrome Empire: game\Win専用…\ゲーム版ver.1.0) */
function locate(dir,exeRel=''){const L=require('../core/library.cjs');let exe='';
 if(exeRel){exe=path.resolve(dir,exeRel);if(!fs.existsSync(exe))throw Error('--exe not found: '+exe);}
 else{const g=L.findGame(dir,4);exe=g?.exe||'';}
 if(!exe)return null;const gameDir=path.dirname(exe);return {exe,gameDir,...engineOfGame(gameDir)};}

/* ---- the MeguLit binaries the cold test needs, copied out of the install (nothing is written into the install) ------------ */
const APP_PARTS=[['native'],['runtime','hook'],['runtime','hook-island'],['runtime','hook-mages'],['runtime','hook-mages-e201'],['runtime','hook-readonly'],['runtime','hook-siglus'],['runtime','megulithook'],['runtime','runtime-dump'],['runtime','locale-emulator']];
function copyTree(from,to,skip=null){const st=fs.statSync(from);if(st.isDirectory()){fs.mkdirSync(to,{recursive:true});for(const n of fs.readdirSync(from))if(!(skip&&skip.test(n)&&fs.existsSync(path.join(to,n))))copyTree(path.join(from,n),path.join(to,n),skip);return;}
 let same=false;try{const d=fs.statSync(to);same=d.size===st.size&&Math.abs(d.mtimeMs-st.mtimeMs)<2000;}catch{}if(!same){fs.copyFileSync(from,to);fs.utimesSync(to,st.atime,st.mtime);}}
function prepareApp(app,root){if(!fs.existsSync(path.join(app,'native','ColdDesk.exe')))throw Error('no ColdDesk.exe under '+app+'\\native (pass --app <MeguLit install>)');
 for(const p of APP_PARTS){const src=path.join(app,...p);if(fs.existsSync(src))copyTree(src,path.join(root,...p),/^ColdDesk\.exe$/i);}
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 /* the cold test's own switches: no relay reports, no shot uploads (judge decides; nothing leaves this PC) */
 fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({coldTest:true,coldTestShots:false,autoProfileShare:false,runtimeSampleShare:false,probeUpload:false},null,1));
 buildColdDesk(root);
 return root;}
/* ColdDesk.exe from this repository's native/ColdDesk.cs (it has --ignore-input; an older install may not): built with the .NET
   Framework csc like Build.ps1, into the copy only, again whenever the source changes */
const CSC=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
function buildColdDesk(root){const src=path.join(REPO,'native','ColdDesk.cs'),exe=path.join(root,'native','ColdDesk.exe'),mark=exe+'.src-sha256';
 const h=crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');let old='';try{old=fs.readFileSync(mark,'utf8');}catch{}
 if(old===h&&fs.existsSync(exe))return exe;
 if(!fs.existsSync(CSC))throw Error('csc.exe not found: '+CSC);
 const tmp=exe+'.build.exe';const r=spawnSync(CSC,['/nologo','/target:exe','/optimize+','/platform:x64','/reference:System.Drawing.dll','/out:'+tmp,src],{encoding:'utf8',windowsHide:true,timeout:180000});
 if(r.status!==0)throw Error('ColdDesk build failed: '+String(r.stdout||r.stderr||r.error?.message||'').slice(0,600));
 fs.renameSync(tmp,exe);fs.writeFileSync(mark,h);return exe;}

/* ---- one run at a time ------------------------------------------------------------------------------------------------- */
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
function lock(file){fs.mkdirSync(path.dirname(file),{recursive:true});
 for(let i=0;i<2;i++){try{fs.writeFileSync(file,String(process.pid),{flag:'wx'});return ()=>{try{fs.unlinkSync(file);}catch{}};}
  catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(fs.readFileSync(file,'utf8'))|0;if(pid&&alive(pid))return null;try{fs.unlinkSync(file);}catch{}}}
 return null;}

/* ---- 2 probe ------------------------------------------------------------------------------------------------------------ */
function makeProbe(loc,title,outDir){const PF=require('../services/probe-full.cjs');
 const work=path.join(outDir,'probe-work');fs.rmSync(work,{recursive:true,force:true});
 const c=PF.collect({dir:loc.gameDir,executable:loc.exe,result:{detected:loc.engine||null},out:work,title,app:'adapt-auto',packedMax:16<<20,rawMax:96<<20,budgetMs:120000});
 if(!c||c.empty)throw Error('probe-full collected nothing');
 const dir=path.join(outDir,'probe');fs.rmSync(dir,{recursive:true,force:true});PF.unpack(c.file,dir);
 /* the diff maker reads manifest.engine / detected; probe-full keeps the exe path relative to the game folder */
 const mf=path.join(dir,'manifest.json'),m=JSON.parse(fs.readFileSync(mf,'utf8'));if(!m.detected&&loc.engine)m.detected=loc.engine;fs.writeFileSync(mf,JSON.stringify(m,null,1));
 fs.rmSync(work,{recursive:true,force:true});
 const exeSha=(m.files||[]).find(f=>String(f.path).replace(/\\/g,'/').toLowerCase()===String(m.exe).replace(/\\/g,'/').toLowerCase())?.sha256||'';
 return {dir,items:c.items,bytes:c.bytes,exeSha256:exeSha};}

/* ---- 3 cold test -------------------------------------------------------------------------------------------------------- */
/* user-folder save places the game created during the run (Saves.sweep finds them; the snapshot could not know them): a folder
   that was not there before the run is test residue and goes; one that was there stays and is only reported */
function userDirs(){const Saves=require('../core/cold-test/saves.cjs'),out=new Set();
 for(const r of Saves.userRoots(process.env)){let ents=[];try{ents=fs.readdirSync(r.path,{withFileTypes:true});}catch{}for(const e of ents)if(e.isDirectory())out.add(path.join(r.path,e.name).toLowerCase());}
 return out;}
function residue(loc,title,before,since){const Saves=require('../core/cold-test/saves.cjs');const removed=[],kept=[];
 let found=[];try{found=Saves.sweep(Saves.locate({exe:loc.exe,engine:loc.engine,title}),since);}catch{}
 for(const d of found){if(before.has(d.toLowerCase())){kept.push(d);continue;}try{fs.rmSync(d,{recursive:true,force:true});removed.push(d);}catch{kept.push(d);}}
 return {removed,kept};}
/* Locale Emulator exactly when MeguLit itself would start the game through it (services/locale-launch.cjs: x86 programs unless
   the profile says otherwise); -> {path, guid} | null */
function localeEmulatorFor(root,loc,title){try{const P=require('../core/profiles/index.cjs'),LE=require('../core/locale-emulator.cjs');
 const profile=P.profileFor({engine:loc.engine,exe:loc.exe,title,folder:loc.gameDir});
 if(LE.steamApi(loc.exe)||!require('../services/locale-launch.cjs').useJapanese(profile,{},loc.exe))return null;
 const dir=path.join(root,'runtime','locale-emulator'),guid=LE.profile(dir);return LE.complete(dir)&&guid?{path:path.join(dir,'LEProc.exe'),guid}:null;}catch{return null;}}
async function coldTest(root,loc,title,budgetMs,exeSha,{visible=false,localeEmulator=null}={}){const Cold=require('../services/cold-test.cjs');
 const game={id:'adapt-'+crypto.createHash('sha1').update(loc.exe.toLowerCase()).digest('hex').slice(0,10),exe:loc.exe,engine:loc.engine,title,exeKey:exeSha||''};
 /* no relay: the verdict of this tool is the only consumer */
 return Cold.testOne(root,game,{budgetMs,ignoreInput:true,visible,localeEmulator,ocrMenu:true,deps:{report:async()=>({state:'off'}),upload:async()=>({state:'off'}),steamRunning:()=>{try{return require('../services/game-process.cjs').imageRunning('steam.exe');}catch{return false;}}}});}

/* whole-screen pictures while a --foreground run goes (what the user would see: the game window and anything over it) */
const SCREEN_PS=`Add-Type -AssemblyName System.Windows.Forms,System.Drawing;$d=$args[0];$stop=Join-Path $d 'stop';$i=0;
while(-not (Test-Path $stop)){if($i -lt 4){Start-Sleep -Seconds 4}else{Start-Sleep -Seconds 15};if(Test-Path $stop){break};$i++;$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;
$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;$g=[System.Drawing.Graphics]::FromImage($bmp);$g.CopyFromScreen($b.X,$b.Y,0,0,$bmp.Size);
$bmp.Save((Join-Path $d ('screen-{0:D2}.png' -f $i)),[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$bmp.Dispose()}`;
function screenRecorder(dir){fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
 const p=require('node:child_process').spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','& {'+SCREEN_PS+'}',dir],{windowsHide:true,stdio:'ignore'});
 return ()=>{try{fs.writeFileSync(path.join(dir,'stop'),'');}catch{}setTimeout(()=>{try{p.kill();}catch{}},20000).unref();};}

/* ---- 4 diff ------------------------------------------------------------------------------------------------------------- */
const RUN_LOGS=/^(hook-events|engine-draw|reader-host)\.log$|^shot-.*\.jpe?g$/i;
function makeDiff(probeDir,runDir,outDir){
 const rt=path.join(probeDir,'runtime');fs.mkdirSync(rt,{recursive:true});
 for(const f of fs.readdirSync(runDir))if(RUN_LOGS.test(f))fs.copyFileSync(path.join(runDir,f),path.join(rt,f));
 const DM=require('./diff-maker/index.cjs');const m=DM.make(probeDir);const written=DM.write(m,{out:path.join(outDir,'diff'),repo:false});
 const b=m.result.best;return {ok:true,gameKey:m.key,engine:m.probe.engine,mode:b.params.hideMethod,cost:b.cost,over:b.over,lines:m.result.lines,dir:written[0]};}

/* ---- 5 Cardinal -------------------------------------------------------------------------------------------------------- */
function cardinal(runDir,run,loc,exeSha,title,outFile,{timeoutMs=600000}={}){
 if(!run?.startedAt||!run?.endedAt)return {ok:false,why:'run.json has no start/end'};
 const game={pid:run.pid||4242,exe:loc.exe,title,sha:exeSha,engine:loc.engine};
 const r=spawnSync(process.execPath,[path.join(__dirname,'cardinal.cjs'),'--logs',runDir,'--from',run.startedAt,'--to',run.endedAt,'--game',JSON.stringify(game),'--out',outFile],{encoding:'utf8',timeout:timeoutMs,windowsHide:true,maxBuffer:32<<20});
 const log=String(r.stdout||'')+String(r.stderr||'');
 let o=null;try{o=JSON.parse(fs.readFileSync(outFile,'utf8'));}catch{}
 if(!o?.result)return {ok:false,why:'cardinal produced no result'+(r.error?' ('+r.error.message+')':'')+': '+log.slice(-400),log};
 return {ok:true,result:o.result,errors:o.out?.errors||[],cleanup:o.out?.cleanupFailure||null,log};}

/* ---- 6 verdict ---------------------------------------------------------------------------------------------------------- */
/* {unsupported, cold, diff, card} → {verdict, reasons, checks}. Every check must be measured; a missing one is inconclusive. */
function judge({unsupported:why='',cold=null,diff=null,card=null}={}){const reasons=[],checks={};
 const done=v=>({verdict:v,reasons,checks});
 if(why){reasons.push(why);return done('inconclusive');}
 if(!cold){reasons.push('冷测试没有跑');return done('inconclusive');}
 if(cold.verdict==='blocked'||cold.verdict==='skipped'){reasons.push('冷测试'+(cold.verdict==='blocked'?'被拦下':'跳过')+'：'+cold.why);return done('inconclusive');}
 if(cold.restored===false){reasons.push('存档没能还原（快照留在 data/cold-test/snap）');return done('inconclusive');}
 if(cold.verdict==='inconclusive'){reasons.push('冷测试没结论：'+(cold.why||cold.end||'')+'（'+(cold.lines|0)+' 句）');return done('inconclusive');}
 let fail=false;
 if(cold.verdict==='fail'){fail=true;reasons.push('冷测试自检没过线，只能读模式：'+(cold.why||''));}
 else reasons.push('冷测试自检 '+cold.verdict+'（'+(cold.lines|0)+' 句'+(cold.verdict==='edge'?'，接近阈值 '+cold.near:'')+'）');
 if(!diff?.ok){reasons.push('差分没做出来：'+(diff?.why||'未运行'));return done(fail?'fail':'inconclusive');}
 if(diff.mode==='read'){fail=true;reasons.push('离线搜索没有过线的隐藏组合（'+(diff.over||[]).join(',')+'）');}
 if(!card?.ok){reasons.push('Cardinal 回放没结果：'+(card?.why||'未运行'));return done(fail?'fail':'inconclusive');}
 const r=card.result,s=r.scores||{},ap=r.applies||{};
 if(!(r.lines>0)){reasons.push('Cardinal 回放里没有台词');return done(fail?'fail':'inconclusive');}
 if((card.errors||[]).length)reasons.push('Cardinal 回放报错：'+JSON.stringify(card.errors).slice(0,200));
 const check=(name,label,ok,measured,detail)=>{checks[name]={ok:measured?ok:null,measured,detail};
  if(!measured)reasons.push(label+'：量不到（'+detail+'）');else if(!ok){fail=true;reasons.push(label+'：不过（'+detail+'）');}else reasons.push(label+'：过（'+detail+'）');};
 const hideMeasured=(cold.measured||[]).includes('hideVisible');
 check('hidden','原文隐藏',s.leak>=GATE.leak,hideMeasured&&typeof s.leak==='number','leak '+s.leak+(hideMeasured?'':'，冷测试没量到 hideVisible'));
 check('replaced','译文替换',s.row>=GATE.row&&s.pair>=GATE.pair,!!ap.row&&!!ap.pair,'row '+s.row+' pair '+s.pair);
 check('choice','第一个选项有翻译',s.choice>=GATE.choice,!!ap.choice,ap.choice?'choice '+s.choice:'没推进到选项');
 if(fail)return done('fail');
 if(Object.values(checks).some(c=>c.measured!==true)||(card.errors||[]).length)return done('inconclusive');
 return done('pass');}

/* ---- main ---------------------------------------------------------------------------------------------------------------- */
async function run(opts,{log=console.log}={}){
 const dir=path.resolve(opts.dir),title=titleOf(dir);
 const out=path.resolve(opts.out||path.join(RUNS_ROOT,safeName(title)));
 if(inside(out,dir))throw Error('--out must not be inside the game folder');
 fs.mkdirSync(out,{recursive:true});
 const result={verdict:'inconclusive',engine:'',gameKey:'',title,gameDir:dir,exe:'',reasons:[],checks:{},artifacts:{out},startedAt:new Date().toISOString(),
  proof:{offline:['原文隐藏：Cardinal 只回放阅读层；游戏画面上原生字是否真的被盖住，冷测试只有钩子自报的 hideVisible，没有屏幕像素比对','译文替换和选项翻译：回放的翻译来源是固定的假译文（不联网），证明的是阅读层画出了译文，不是译文质量'],screenshots:'run/shot-*.jpg 是游戏客户区；--foreground 时 screen/screen-*.png 是整块屏幕。两者都没有 MeguLit 阅读层（本工具只开钩子，不开 MeguLit.exe），所以截图证明不了译文画上、选项有翻译，只能看游戏原生字和推进到哪'}};
 const write=()=>{result.endedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));};
 const finish=j=>{result.verdict=j.verdict;result.reasons=j.reasons;result.checks=j.checks;write();return result;};
 if(!fs.existsSync(dir))throw Error('game folder not found: '+dir);
 const why=unsupported(dir);if(why)return finish(judge({unsupported:why}));
 const loc=locate(dir,opts.exe);if(!loc)return finish(judge({unsupported:'找不到主程序（用 --exe 指定）'}));
 if(inside(out,loc.gameDir))throw Error('--out must not be inside the game folder');
 result.exe=loc.exe;result.engine=loc.engine;result.engineWhy=loc.why;log('# '+title+' '+loc.engine+' '+loc.exe);
 const release=lock(path.join(RUNS_ROOT,'adapt-auto.lock'));if(!release)return finish(judge({unsupported:'另一部游戏正在自动适配（一次只跑一部）'}));
 try{
  /* 2 probe */
  let probe=null;try{probe=makeProbe(loc,title,out);result.artifacts.probe=probe.dir;result.exeSha256=probe.exeSha256;log('# probe '+probe.items+' items');}
  catch(e){result.reasons.push('探针：'+e.message);}
  try{result.gameKey=require('../core/profiles/index.cjs').profileFor({engine:loc.engine,exe:loc.exe,title,exeSha256:probe?.exeSha256||undefined}).gameKey||'';}catch{}
  /* 3 cold test */
  const root=prepareApp(opts.app,path.join(RUNS_ROOT,'_app'));
  const before=userDirs(),t0=Date.now();
  const localeEmulator=localeEmulatorFor(root,loc,title);result.localeEmulator=!!localeEmulator;
  const stopScreen=opts.foreground?screenRecorder(path.join(out,'screen')):null;
  let cold=null;try{cold=await coldTest(root,loc,title,Math.round(opts.budgetMin*60000),probe?.exeSha256,{visible:opts.foreground,localeEmulator});}catch(e){cold={verdict:'blocked',why:'cold test threw: '+e.message};}
  if(stopScreen){stopScreen();result.foreground=true;result.artifacts.screen=fs.readdirSync(path.join(out,'screen')).filter(f=>/\.png$/i.test(f)).map(f=>path.join(out,'screen',f));}
  if(cold.runDir){const r=residue(loc,title,before,t0-1000);result.residue=r;if(r.kept.length)result.reasons.push('游戏在已有用户目录里写了没快照到的文件：'+r.kept.join('; '));}
  result.cold=cold;log('# cold '+cold.verdict+' '+(cold.why||'')+' lines='+(cold.lines|0));
  let runCopy='',runInfo=null;
  if(cold.runDir&&fs.existsSync(cold.runDir)){runCopy=path.join(out,'run');fs.rmSync(runCopy,{recursive:true,force:true});copyTree(cold.runDir,runCopy);
   try{runInfo=JSON.parse(fs.readFileSync(path.join(runCopy,'run.json'),'utf8'));}catch{}
   result.artifacts.run=runCopy;result.artifacts.screenshots=fs.readdirSync(runCopy).filter(f=>/^shot-.*\.jpe?g$/i.test(f)).map(f=>path.join(runCopy,f));}
  /* 4 diff */
  let diff=null;
  if(probe&&runCopy){try{diff=makeDiff(probe.dir,runCopy,out);result.artifacts.diff=diff.dir;if(diff.gameKey)result.gameKey=diff.gameKey;log('# diff '+diff.mode+' cost='+diff.cost);}catch(e){diff={ok:false,why:e.message};}}
  else diff={ok:false,why:probe?'冷测试没有运行目录':'没有探针'};
  result.diff=diff;
  /* 5 Cardinal (only when the cold run has lines to replay) */
  let card=null;
  if(runCopy&&(cold.lines|0)>0){const file=path.join(out,'cardinal.json');card=cardinal(runCopy,runInfo,loc,probe?.exeSha256||'',title,file);if(card.ok)result.artifacts.cardinal=file;
   fs.writeFileSync(path.join(out,'cardinal.log'),card.log||'');result.cardinal=card.ok?{scores:card.result.scores,applies:card.result.applies,total:card.result.total,lines:card.result.lines,errors:card.errors}:{why:card.why};
   log('# cardinal '+(card.ok?JSON.stringify(card.result.scores):card.why));}
  return finish(judge({cold,diff,card}));}
 finally{release();}}

async function main(argv){let opts;try{opts=parseArgs(argv);}catch(e){console.error(e.message);return EXIT.inconclusive;}
 /* Node 22 fs.cpSync segfaults on Windows when the source path is not ASCII (core/cold-test/saves.cjs snapshots
    Documents\A'sRing\オルフレール; node 22.22.3 exit 139, the shell saw 127). Run under the app's own runtime node, the one the
    cold test runs under in MeguLit anyway */
 if(process.platform==='win32'&&Number(process.versions.node.split('.')[0])<24&&!process.env.MEGULIT_ADAPT_REEXEC){const node=path.join(opts.app,'runtime','node.exe');
  if(fs.existsSync(node)){const r=spawnSync(node,[__filename,...argv.slice(2)],{stdio:'inherit',windowsHide:true,env:{...process.env,MEGULIT_ADAPT_REEXEC:'1'}});return r.status??EXIT.inconclusive;}}
 /* core/layout.cjs reads MEGULIT_ROOT once: the hook, its logs and the cold worker (it inherits the env) use the copied binaries */
 if(!process.env.MEGULIT_ROOT)process.env.MEGULIT_ROOT=path.join(RUNS_ROOT,'_app');
 try{const r=await run(opts);console.log(r.verdict+' '+path.join(r.artifacts.out,'result.json'));for(const x of r.reasons)console.log('  '+x);return EXIT[r.verdict]??2;}
 catch(e){console.error('adapt-auto: '+(e.stack||e.message));return EXIT.inconclusive;}}
if(require.main===module)main(process.argv).then(c=>{process.exitCode=c;});
module.exports={parseArgs,titleOf,safeName,unsupported,locate,engineOfGame,judge,lock,run,main,GATE,EXIT};
