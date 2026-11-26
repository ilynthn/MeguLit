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
   Usage: node tools/adapt-auto.cjs <game folder> [--exe <relative path>] [--out <dir>] [--budget-min N] [--app <MeguLit install>] [--foreground] [--seed-out <dir>]
     --budget-min  the whole game, every step (default 10); result.steps has each step's ms, result.stuck where it stopped
     --skip        hold Ctrl (fast-forward) while advancing; default is reading pace (a per-character draw stream fast-forwarded
                   arrives in pieces: オルフレール 23 lines row 0.235 with Ctrl, 60 lines row 0.8 without)
     --seed-out    on a pass, the seed entry <dir>/<engine>/<slug>/{game.json,versions/<sha>.json,lines.json} (local only)
     --foreground  the game on the visible desktop (owner away only; still muted, still in ColdDesk's job) and whole-screen
                   pictures (every 4 s for the first 16 s, then every 15 s) into <out>/screen/ (the hidden desktop's shots are the game's client area only)
   Writes <out>/result.json {verdict, engine, gameKey, reasons, artifacts, ...}; exit 0 pass, 1 fail, 2 inconclusive.
   Never writes into the game folder (the save snapshot/restore of the cold test is the only thing that touches its saves), never
   writes .adapt-result.json (that file sends the group receipt and deletes the game). One run at a time (a lock in the runs root). */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const REPO=path.join(__dirname,'..');
const RUNS_ROOT=process.env.MEGULIT_ADAPT_RUNS||'F:\\Agent\\work\\adapt-auto-runs';
/* the testbed's InputCtl32/64.exe + InputShim32/64.dll: the input ladder's second level (services/cold-test-run.cjs inputLadder) */
const INPUTCTL_DIR=process.env.MEGULIT_INPUTCTL_DIR||'F:\\Agent\\work\\megu-testbed';
const APP_DEFAULT=process.env.MEGULIT_APP||'E:\\MeguLit';
const EXIT={pass:0,fail:1,inconclusive:2};
/* what Cardinal must reach for each of the three checks (scores 0..1, core/cardinal/score.cjs) */
const GATE={leak:0.98,row:0.9,pair:0.9,choice:1};

/* ---- 0 arguments ------------------------------------------------------------------------------------------------------ */
function parseArgs(argv){const a=argv.slice(2),o={dir:'',exe:'',out:'',budgetMin:10,app:APP_DEFAULT,foreground:false,seedOut:'',skip:false};
 for(let i=0;i<a.length;i++){const k=a[i];
  if(k==='--exe')o.exe=a[++i]||'';else if(k==='--out')o.out=a[++i]||'';else if(k==='--budget-min')o.budgetMin=Number(a[++i]);else if(k==='--app')o.app=a[++i]||'';else if(k==='--foreground')o.foreground=true;else if(k==='--seed-out')o.seedOut=a[++i]||'';else if(k==='--no-skip')o.skip=false;else if(k==='--skip')o.skip=true;
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
 for(const p of APP_PARTS){const src=path.join(app,...p);if(fs.existsSync(src))copyTree(src,path.join(root,...p),/^(ColdDesk|HookBridge|D3D9Probe)\.exe$/i);}
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 /* the cold test's own switches: no relay reports, no shot uploads (judge decides; nothing leaves this PC) */
 fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({coldTest:true,coldTestShots:false,autoProfileShare:false,runtimeSampleShare:false,probeUpload:false},null,1));
 buildColdDesk(root);buildHookBridge(root);useCheckoutHook(root);
 return root;}
/* MeguLitHook32/64.dll built from this repository's native/megulithook (a private native build; the DLLs are not in git) replace
   the install's copies in the copy only, like HookBridge.exe below: the engine-layer hook changes are what runs. A DLL without the
   hook version marker (an old or foreign build) is never used.
   2026-11-26 オルフレール: "source no-draw sometimes does nothing" (hide.skipped 0, the reader left in read mode) was every run from a
   checkout without a local build. useCheckoutHook then copied nothing, prepareApp had just put the install's DLL (no DrawSkip) into
   the shared _app copy, and the run went on silently. Every run with "MeguLit_DRAWSKIP ready" in its diagnostics skipped about 53,600 glyphs.
   So the DLL is looked for in MEGULIT_HOOK_DIR, this checkout, then the repository's other worktrees: the most capable build wins
   (DrawSkip over GDI hide only), this checkout before others, newer before older; what was used goes into result.hook */
const HOOK_MARK='MeguLit_GDIHIDE armed version=2',DRAWSKIP_MARK='MeguLit_DRAWSKIP ready';
function hookDirs(){const dirs=[];if(process.env.MEGULIT_HOOK_DIR)dirs.push(process.env.MEGULIT_HOOK_DIR);dirs.push(path.join(REPO,'native','megulithook'));
 try{const r=spawnSync('git',['-C',REPO,'worktree','list','--porcelain'],{encoding:'utf8',windowsHide:true,timeout:15000});
  for(const m of String(r.stdout||'').matchAll(/^worktree (.+)$/gm))dirs.push(path.join(path.normalize(m[1].trim()),'native','megulithook'));}catch{}
 const seen=new Set();return dirs.filter(d=>{const k=path.resolve(d).toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});}
function pickHookDll(name,dirs){let best=null;dirs.forEach((dir,order)=>{const src=path.join(dir,name);let buf,st;try{st=fs.statSync(src);buf=fs.readFileSync(src);}catch{return;}
  if(buf.indexOf(HOOK_MARK)<0)return;const c={src,buf,drawSkip:buf.indexOf(DRAWSKIP_MARK)>=0,own:order===0||path.resolve(dir)===path.resolve(REPO,'native','megulithook'),mtimeMs:st.mtimeMs};
  const better=!best||c.drawSkip!==best.drawSkip?!best||c.drawSkip:c.own!==best.own?c.own:c.mtimeMs>best.mtimeMs;if(better)best=c;});
 return best;}
let hookUsed={};
function useCheckoutHook(root,dirs=hookDirs()){hookUsed={};for(const name of ['MeguLitHook32.dll','MeguLitHook64.dll']){const pick=pickHookDll(name,dirs);
  if(!pick){hookUsed[name]={src:'install',drawSkip:false};continue;}hookUsed[name]={src:pick.src,drawSkip:pick.drawSkip};
  for(const dir of [path.join(root,'native','megulithook'),path.join(root,'runtime','megulithook')]){const dst=path.join(dir,name);let same=false;try{same=fs.readFileSync(dst).equals(pick.buf);}catch{}if(same)continue;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dst,pick.buf);}}
 return hookUsed;}
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
/* HookBridge.exe (+ D3D9Probe.exe) from this repository's native sources with native/Build-HookBridge.ps1 (Roslyn; its own
   --self-test runs), into the copy only, again whenever a source changes: the engine-layer fixes of this checkout are what runs */
const BRIDGE_SOURCES=['HookBridge.cs','EmbedTextPolicy.cs','HookSourceFrames.cs','WaitRenderHook.cs','HookTarget.cs','HookSignature.cs','TextPathCanary.cs','GpuHideLayer.cs','D3D9Probe.cs'];
function buildHookBridge(root){const exe=path.join(root,'native','HookBridge.exe'),mark=exe+'.src-sha256',h=crypto.createHash('sha256');
 for(const f of BRIDGE_SOURCES){h.update(f+'\0');try{h.update(fs.readFileSync(path.join(REPO,'native',f)));}catch{}}
 const sum=h.digest('hex');let old='';try{old=fs.readFileSync(mark,'utf8');}catch{}
 if(old===sum&&fs.existsSync(exe))return exe;
 /* about 8.7 s (Roslyn + the bridge's --self-test), only when a source changed; otherwise the copy is reused (prepareApp ~30 ms).
    One retry: the previous build's self-test process can still hold the output file for a moment */
 const build=()=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(REPO,'native','Build-HookBridge.ps1'),'-OutputPath',exe],
  {encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:64<<20,env:{...process.env,MEGULIT_BUILD_TOOLS:process.env.MEGULIT_BUILD_TOOLS||'E:\\Apps\\build-tools'}});
 let r=build();if(r.status!==0){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2000);r=build();}
 if(r.status!==0)throw Error('HookBridge build failed: '+String(r.stderr||r.stdout||r.error?.message||'').slice(-600));
 fs.writeFileSync(mark,sum);return exe;}

/* ---- one run at a time ------------------------------------------------------------------------------------------------- */
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
function lock(file){fs.mkdirSync(path.dirname(file),{recursive:true});
 for(let i=0;i<2;i++){try{fs.writeFileSync(file,String(process.pid),{flag:'wx'});return ()=>{try{fs.unlinkSync(file);}catch{}};}
  catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(fs.readFileSync(file,'utf8'))|0;if(pid&&alive(pid))return null;try{fs.unlinkSync(file);}catch{}}}
 return null;}

/* ---- 2 probe ------------------------------------------------------------------------------------------------------------ */
function makeProbe(loc,title,outDir,{budgetMs=120000}={}){const PF=require('../services/probe-full.cjs');
 const work=path.join(outDir,'probe-work');fs.rmSync(work,{recursive:true,force:true});
 const c=PF.collect({dir:loc.gameDir,executable:loc.exe,result:{detected:loc.engine||null},out:work,title,app:'adapt-auto',packedMax:16<<20,rawMax:96<<20,budgetMs});
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
/* located: the save places as they were before the run (located after it, a folder the game just made counts as guarded) */
function residue(located,before,since){const Saves=require('../core/cold-test/saves.cjs');const removed=[],kept=[];
 let found=[];try{found=Saves.sweep(located,since);}catch{}
 for(const d of found){if(before.has(d.toLowerCase())){kept.push(d);continue;}try{fs.rmSync(d,{recursive:true,force:true});removed.push(d);}catch{kept.push(d);}}
 return {removed,kept};}
/* Locale Emulator exactly when MeguLit itself would start the game through it (services/locale-launch.cjs: x86 programs unless
   the profile says otherwise); -> {path, guid} | null */
function localeEmulatorFor(root,loc,title){try{const P=require('../core/profiles/index.cjs'),LE=require('../core/locale-emulator.cjs');
 const profile=P.profileFor({engine:loc.engine,exe:loc.exe,title,folder:loc.gameDir});
 if(LE.steamApi(loc.exe)||!require('../services/locale-launch.cjs').useJapanese(profile,{},loc.exe))return null;
 const dir=path.join(root,'runtime','locale-emulator'),guid=LE.profile(dir);return LE.complete(dir)&&guid?{path:path.join(dir,'LEProc.exe'),guid}:null;}catch{return null;}}
/* reading pace for this many lines (the diff's samples), then fast-forward to the first choice (owner: 先阅读速度采够 60 句 → 按 Ctrl
   快进直到第一个选项 → 选项出现时恢复正常速度采选项和后 5 句) */
const SLOW_LINES=60;
/* engines whose bridge hands a line over only once the typewriter drew it all (YU-RIS: folded, joined), so the reader starts revealing
   it then: the next click waits 45 ms a character (driver readPerCharMs). KiriKiri no-KAG comes piece by piece while it types (オルフレール
   r5 with it: cold 230 s -> 306 s, total 554 s, nothing gained) */
const WHOLE_LINE=new Set(['yuris']);
async function coldTest(root,loc,title,budgetMs,exeSha,{visible=false,localeEmulator=null,skip=true}={}){const Cold=require('../services/cold-test.cjs');
 const game={id:'adapt-'+crypto.createHash('sha1').update(loc.exe.toLowerCase()).digest('hex').slice(0,10),exe:loc.exe,engine:loc.engine,title,exeKey:exeSha||''};
 /* no relay: the verdict of this tool is the only consumer */
 return Cold.testOne(root,game,{budgetMs,ignoreInput:true,visible,localeEmulator,ocrMenu:true,hideProbe:true,choiceLocate:true,inputFallback:{inputCtlDir:INPUTCTL_DIR,foreground:visible},driver:{targetLines:1000,afterChoice:5,choiceSequence:true,hoverStart:true,holdBlind:true,choiceQuietMs:1500,readQuietMs:600,readMinMs:1000,readPerCharMs:WHOLE_LINE.has(loc.engine)?45:0,...(skip===true?{}:{skip:false,slowLines:SLOW_LINES})},deps:{report:async()=>({state:'off'}),upload:async()=>({state:'off'}),steamRunning:()=>{try{return require('../services/game-process.cjs').imageRunning('steam.exe');}catch{return false;}}}});}

/* whole-screen pictures while a --foreground run goes (what the user would see: the game window and anything over it) */
const SCREEN_PS=`Add-Type -AssemblyName System.Windows.Forms,System.Drawing;$d=$env:MEGULIT_SCREEN_DIR;$stop=Join-Path $d 'stop';$i=0;
while(-not (Test-Path $stop)){if($i -lt 4){Start-Sleep -Seconds 4}else{Start-Sleep -Seconds 15};if(Test-Path $stop){break};$i++;$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;
$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;$g=[System.Drawing.Graphics]::FromImage($bmp);$g.CopyFromScreen($b.X,$b.Y,0,0,$bmp.Size);
$bmp.Save((Join-Path $d ('screen-{0:D2}.png' -f $i)),[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$bmp.Dispose()}`;
/* the previous run's recorder can still hold the folder for up to 15 s after it was told to stop (runs back to back: EPERM): its old
   pictures are removed one by one where possible, and a run never fails over them */
function screenRecorder(dir){try{fs.rmSync(dir,{recursive:true,force:true});}catch{try{for(const f of fs.readdirSync(dir))try{fs.rmSync(path.join(dir,f),{force:true});}catch{}}catch{}}fs.mkdirSync(dir,{recursive:true});
 const p=require('node:child_process').spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',SCREEN_PS],{windowsHide:true,stdio:'ignore',env:{...process.env,MEGULIT_SCREEN_DIR:dir}})/* the folder by environment: -Command joins its arguments, a path with a space (Monochrome Empire) came apart and no picture was taken */;
 let closed=false;const ended=new Promise(r=>{p.once('close',()=>{closed=true;r();});p.once('error',()=>{closed=true;r();});});
 /* -> a promise that settles once the recorder has exited (it finishes the picture it is writing), at most 20 s */
 return ()=>{try{fs.writeFileSync(path.join(dir,'stop'),'');}catch{}const kill=setTimeout(()=>{try{p.kill();}catch{}},20000);return ended.then(()=>clearTimeout(kill));};}

/* at most n pictures, evenly over the run, for Cardinal's screen OCR (owner: OCR 只跑隐藏判定需要的帧，最多 20 张；all of them added two minutes) */
function shotSample(dir,to,n){let files=[];try{files=fs.readdirSync(dir).filter(f=>/\.png$/i.test(f)).sort();}catch{return '';}if(!files.length)return '';
 try{fs.rmSync(to,{recursive:true,force:true});}catch{}fs.mkdirSync(to,{recursive:true});const pick=files.length<=n?files:Array.from({length:n},(_,i)=>files[Math.round(i*(files.length-1)/(n-1))]);
 for(const f of new Set(pick))try{fs.copyFileSync(path.join(dir,f),path.join(to,f));}catch{}return to;}

/* ---- 4 diff ------------------------------------------------------------------------------------------------------------- */
const RUN_LOGS=/^(hook-events|engine-draw|reader-host)\.log$|^shot-.*\.jpe?g$/i;
/* window: {from,to} ISO, the part of the run the diff is made from (the reading-pace phase: fast-forward shreds a per-glyph stream) */
function makeDiff(probeDir,runDir,outDir,window=null){
 const rt=path.join(probeDir,'runtime');fs.mkdirSync(rt,{recursive:true});
 {const mf=path.join(probeDir,'manifest.json');const man=JSON.parse(fs.readFileSync(mf,'utf8'));if(window)man.runtime=window;else delete man.runtime;fs.writeFileSync(mf,JSON.stringify(man,null,1));}
 for(const f of fs.readdirSync(runDir))if(RUN_LOGS.test(f))fs.copyFileSync(path.join(runDir,f),path.join(rt,f));
 const DM=require('./diff-maker/index.cjs');const m=DM.make(probeDir);const written=DM.write(m,{out:path.join(outDir,'diff'),repo:false});
 const b=m.result.best;return {ok:true,gameKey:m.key,engine:m.probe.engine,mode:b.params.hideMethod,cost:b.cost,over:b.over,lines:m.result.lines,dir:written[0]};}

/* ---- 5 Cardinal -------------------------------------------------------------------------------------------------------- */
function cardinal(runDir,run,loc,exeSha,title,outFile,{timeoutMs=600000,shots=''}={}){
 if(!run?.startedAt||!run?.endedAt)return {ok:false,why:'run.json has no start/end'};
 const game={pid:run.pid||4242,exe:loc.exe,title,sha:exeSha,engine:loc.engine};
 /* the bridges' own records of the run (cold-test-run writes Cardinal's tape) replay every engine; the logs need engine-draw records */
 const tape=path.join(runDir,'cardinal-tape.jsonl'),source=fs.existsSync(tape)?['--tape',tape]:['--logs',runDir,'--from',run.startedAt,'--to',run.endedAt];
 /* the cold run's own record (the choice its OCR read on the game screen) and the pictures of the real screen (a second hide evidence,
    read by Windows OCR inside Cardinal; only once the recorder has written them all). --lines: the whole tape (the cold run cut it to the
    reading-pace lines and the Ctrl span; Cardinal's default, the profile's last 60 lines, was Ctrl only on Monochrome Empire r6) */
 const runFile=path.join(runDir,'run.json'),extra=[...(fs.existsSync(runFile)?['--run',runFile]:[]),...(fs.existsSync(tape)&&run.tapeLines>0?['--lines',String(run.tapeLines)]:[]),...(shots&&fs.existsSync(shots)&&fs.readdirSync(shots).some(f=>/\.png$/i.test(f))?['--shots',shots]:[])];
 const r=spawnSync(process.execPath,[path.join(__dirname,'cardinal.cjs'),...source,...extra,'--game',JSON.stringify(game),'--out',outFile],{encoding:'utf8',timeout:timeoutMs,windowsHide:true,maxBuffer:32<<20});
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
 /* 2026-11-26 (owner via 261126总指挥): measured only by Cardinal's own observation of the hide (leakObservation: hide checks, native
    records, the bridge's hide-only confirmation, or an observed read mode); a cold run never measures hideVisible (no reader) */
 const lo=r.detail?.leakObservation||{},hideMeasured=lo.observed===true&&typeof s.leak==='number';
 check('hidden','原文隐藏',s.leak>=GATE.leak,hideMeasured,'leak '+s.leak+(hideMeasured?(lo.read?'，读模式':'')+(lo.checked?'，隐藏检测 '+lo.checked+' 次':'')+(lo.native?'，原生记录':''):'，Cardinal 没观测到隐藏（没有隐藏确认）'));
 check('replaced','译文替换',s.row>=GATE.row&&s.pair>=GATE.pair,!!ap.row&&!!ap.pair,'row '+s.row+' pair '+s.pair);
 check('choice','第一个选项有翻译',s.choice>=GATE.choice,!!ap.choice,ap.choice?'choice '+s.choice:'没推进到选项');
 if(fail)return done('fail');
 if(Object.values(checks).some(c=>c.measured!==true)||(card.errors||[]).length)return done('inconclusive');
 return done('pass');}

/* ---- layer 2: the engine's draw hook ----------------------------------------------------------------------------------
   Only chosen, never changed for one game (owner 2026-11-26: 内核 → 引擎通用逆向画字函数 → 专门适配 → 上传 seed). KiriKiri goes
   the krkr route (MeguLitKrkr32/64.dll on KAG message layers + the kernel's KiriKiri hooks); an engine with a reverse-engineered
   draw signature (tools/engine-sigs/<id>-draw.cjs, the reference of native/megulithook's matcher) is checked against this exe
   before the game is started: no hit there means the native matcher will not hit either. */
const SIG_OF={catsystem2:'cs2',cs2:'cs2',advhd:'advhd',bgi:'bgi',cmvs:'cmvs',fvp:'fvp',mages:'mages',majiro:'majiro',siglus:'siglus',yuris:'yuris'};
function engineHook(loc){const t0=Date.now(),done=o=>({...o,ms:Date.now()-t0});
 if(loc.engine==='kirikiri'){let bits=0;try{bits=require('../core/locale-emulator.cjs').x86(loc.exe)?32:64;}catch{}return done({route:'krkr',hook:'MeguLitKrkr'+(bits||'')+'.dll + kernel KiriKiri hooks'});}
 const id=SIG_OF[loc.engine];if(!id)return done({route:'kernel',hook:'kernel hooks only (no engine draw signature for '+(loc.engine||'unknown')+')'});
 const file=path.join(__dirname,'engine-sigs',id+'-draw.cjs');if(!fs.existsSync(file))return done({route:'kernel',hook:'kernel hooks only'});
 try{const r=require(file).scanFile(loc.exe);const hits=Array.isArray(r?.hits)?r.hits.length:Array.isArray(r)?r.length:r?.hit?1:0;return done({route:'engine-draw',hook:id+'-draw',sig:path.relative(REPO,file),hits});}
 catch(e){return done({route:'engine-draw',hook:id+'-draw',sig:path.relative(REPO,file),hits:0,error:String(e.message||e).slice(0,160)});}}

/* the kernel's own diagnostics for the run (the shared hook-diagnostics.log of the copied app, cut to the run's time) */
function hookDiagnostics(root,run,dest){const out={injected:[],auxNoise:0,auxSample:'',kagWait:false,selected:''};if(!run?.startedAt)return out;
 const a=Date.parse(run.startedAt)-2000,z=Date.parse(run.endedAt||new Date().toISOString())+2000;let text='';try{text=fs.readFileSync(path.join(root,'logs','hook-diagnostics.log'),'utf8');}catch{return out;}
 const kept=[];for(const l of text.split(/\r?\n/)){const t=Date.parse(l.slice(0,28));if(!(t>=a&&t<=z))continue;kept.push(l);let m;
  if((m=/注入钩子: (.+?) [0-9A-F]{6,}$/.exec(l)))out.injected.push(m[1]);
  if((m=/aux noise (.+?) "(.*)"$/.exec(l))){out.auxNoise++;if(!out.auxSample)out.auxSample=m[1]+': '+m[2].slice(0,40);}
  if(/krkr wait kag/.test(l))out.kagWait=true;
  if((m=/auto-select (\S+)/.exec(l)))out.selected=m[1];}
 out.injected=[...new Set(out.injected)];if(dest)try{fs.writeFileSync(dest,kept.join('\n')+'\n');}catch{}
 return out;}

/* where the run got stuck, for the person who takes over (owner: 改名画面、标题菜单、黑屏、钩子没命中等) */
function stuckOf({cold,run,diag,engine,minLines=8}){const lines=cold?.lines|0,end=String(run?.end||cold?.end||'');
 if(!cold)return '冷测试没有跑';
 if(cold.verdict==='blocked'||cold.verdict==='skipped')return '冷测试没开始：'+cold.why;
 if(lines>=minLines)return '';
 if(engine?.route==='engine-draw'&&!(engine.hits>0))return '钩子没命中：'+engine.hook+' 画字签名在这个 exe 里没找到';
 if(end==='no-window')return '没有游戏窗口（启动失败或弹窗退出）';
 if(end==='exited')return '游戏自己退出了（启动弹窗？见 run/hook-status.log）';
 if(end==='black'||run?.black)return '黑屏（隐藏桌面画不出画面）';
 const ocr=String(run?.ocrText||'');
 if(!lines&&/^(no-lines|time-intro)/.test(end))return run?.ocrStart?'开场后没有台词（点了「'+run.ocrStart+'」）':'标题菜单（没找到「はじめから / New Game」）';
 if(diag?.auxNoise>0)return '钩子没命中正文：正文在被丢弃的线程里（'+diag.auxSample+'…，共 '+diag.auxNoise+' 条），选中的是 '+(diag.selected||'别的线程')+(diag.kagWait?'；KAG 层没接上（krkr wait kag）':'');
 if(/名前?.{0,3}[入人][力カ]/.test(ocr))return '改名画面';
 if(/^stalled/.test(end))return '推进停住（'+lines+' 句后 45 秒没有新句）';
 return '台词太少（'+lines+' 句，结束原因 '+(end||'?')+'）';}

/* ---- layer 4: the seed entry (The Seed/<engine>/<slug>/game.json + versions/<sha>.json), local only ---------------------------
   From the game layer diff-maker made, plus the seed fields (README of The Seed), checked with core/profiles/seed.cjs like
   seed-all.cjs. Written only for a pass (status verified); never into the repository, never uploaded. */
function writeSeed(diffDir,{engine,title,exeName,exeSha,gameKey},seedOut){const SeedFormat=require('../core/profiles/seed.cjs'),Probe=require('./diff-maker/probe.cjs');
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));const gf=fs.readdirSync(diffDir).find(f=>/^game-.*\.json$/.test(f)),vf=fs.readdirSync(diffDir).find(f=>/^version-[0-9a-f]{64}\.json$/.test(f));
 if(!gf||!vf)throw Error('diff has no game/version document');
 const doc=read(path.join(diffDir,gf)),ver=read(path.join(diffDir,vf));const settings=JSON.parse(JSON.stringify(doc.settings||{}));delete settings.calibrate;settings.lang={ja:{annotation:'ruby'}};
 let slugs={};try{slugs=read(path.join(__dirname,'diff-maker','slugs.json'));}catch{}
 const slug=[slugs[title+'|'+exeName],slugs[title]].find(v=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(v))||String(gameKey||'game').toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,64);
 const game={...doc,settings,key:doc.key||Probe.gameId(doc.prints||{}),seedFormat:1,status:'verified',slug,builds:[exeSha],match:{exe:[exeName],titles:[title]},sourceLangs:['ja'],rev:1};
 const version={...ver,rev:1};
 for(const [n,d,w] of [['game',game,{engine,slug}],['version',version,{engine,file:exeSha+'.json'}]]){const r=SeedFormat.check(d,w);if(!r.ok)throw Error(n+' seed: '+r.errors.join('; '));}
 const dir=path.join(seedOut,engine,slug);fs.mkdirSync(path.join(dir,'versions'),{recursive:true});
 fs.writeFileSync(path.join(dir,'game.json'),JSON.stringify(game,null,1)+'\n');fs.writeFileSync(path.join(dir,'versions',exeSha+'.json'),JSON.stringify(version,null,1)+'\n');
 for(const f of fs.readdirSync(diffDir).filter(f=>/^lines-.*\.json$/.test(f)))fs.copyFileSync(path.join(diffDir,f),path.join(dir,'lines.json'));
 return dir;}

/* ---- main ---------------------------------------------------------------------------------------------------------------- */
/* the whole game within --budget-min (default 10): every step timed (result.steps, ms); out of time → inconclusive, naming the step */
const RESERVE_MS=150000,PROBE_MS=120000;
async function run(opts,{log=console.log}={}){
 const T0=Date.now(),budget=Math.round(opts.budgetMin*60000),left=()=>budget-(Date.now()-T0);
 const dir=path.resolve(opts.dir),title=titleOf(dir);
 const out=path.resolve(opts.out||path.join(RUNS_ROOT,safeName(title)));
 if(inside(out,dir))throw Error('--out must not be inside the game folder');
 fs.mkdirSync(out,{recursive:true});
 const result={verdict:'inconclusive',engine:'',gameKey:'',title,gameDir:dir,exe:'',reasons:[],checks:{},stuck:'',budgetMs:budget,totalMs:0,steps:{},
  layers:{kernel:'MeguLitHook（不改）',engine:null,game:null,seed:null},artifacts:{out},startedAt:new Date().toISOString(),
  proof:{offline:['原文隐藏：Cardinal 只回放阅读层；游戏画面上原生字是否真的被盖住，冷测试只有钩子自报的 hideVisible，没有屏幕像素比对','译文替换和选项翻译：回放的翻译来源是固定的假译文（不联网），证明的是阅读层画出了译文，不是译文质量'],screenshots:'run/shot-*.jpg 是游戏客户区；--foreground 时 screen/screen-*.png 是整块屏幕。两者都没有 MeguLit 阅读层（本工具只开钩子，不开 MeguLit.exe），所以截图证明不了译文画上、选项有翻译，只能看游戏原生字和推进到哪'}};
 /* stage records (core/yui-run.cjs, <out>/yui-run.log): a run that stops says at which stage and why */
 const yui=require('../core/yui-run.cjs').start(out,{kind:'adapt-auto'});result.artifacts.yui=yui.file;
 const stageOf=name=>String(name).replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
 const step=async(name,fn)=>{const t=Date.now();yui.mark(stageOf(name));try{return await fn();}catch(e){yui.fail(stageOf(name),String(e?.message||e));throw e;}finally{result.steps[name]=Date.now()-t;}};
 const write=()=>{result.endedAt=new Date().toISOString();result.totalMs=Date.now()-T0;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));};
 const finish=j=>{result.verdict=j.verdict;result.reasons=[...result.reasons,...j.reasons];result.checks=j.checks;
  if(j.verdict==='pass')yui.close();else yui.fail(j.verdict==='fail'?'verdict-fail':'verdict-inconclusive',(result.stuck?'卡在：'+result.stuck+'；':'')+(j.reasons||[]).join('；'));
  if(j.verdict!=='pass'&&result.stuck)result.reasons.unshift('卡在：'+result.stuck);write();return result;};
 const overtime=name=>{if(left()>0)return false;result.stuck='超时：'+name+' 之前已用完 '+opts.budgetMin+' 分钟';return true;};
 if(!fs.existsSync(dir))throw Error('game folder not found: '+dir);
 const why=await step('triage',()=>unsupported(dir));if(why)return finish(judge({unsupported:why}));
 const loc=await step('locate',()=>locate(dir,opts.exe));if(!loc)return finish(judge({unsupported:'找不到主程序（用 --exe 指定）'}));
 if(inside(out,loc.gameDir))throw Error('--out must not be inside the game folder');
 result.skip=opts.skip===true;result.exe=loc.exe;result.engine=loc.engine;result.engineWhy=loc.why;log('# '+title+' '+loc.engine+' '+loc.exe);
 const release=lock(path.join(RUNS_ROOT,'adapt-auto.lock'));if(!release)return finish(judge({unsupported:'另一部游戏正在自动适配（一次只跑一部）'}));
 try{
  /* layer 2: the engine's draw hook */
  const engine=await step('engineHook',()=>engineHook(loc));result.layers.engine=engine;log('# engine '+engine.route+' '+engine.hook+(engine.hits!=null?' hits='+engine.hits:''));
  /* probe */
  let probe=null;
  await step('probe',()=>{try{probe=makeProbe(loc,title,out,{budgetMs:Math.max(30000,Math.min(PROBE_MS,left()-RESERVE_MS-120000))});result.artifacts.probe=probe.dir;result.exeSha256=probe.exeSha256;log('# probe '+probe.items+' items');}
   catch(e){result.reasons.push('探针：'+e.message);}});
  try{result.gameKey=require('../core/profiles/index.cjs').profileFor({engine:loc.engine,exe:loc.exe,title,exeSha256:probe?.exeSha256||undefined}).gameKey||'';}catch{}
  if(overtime('冷测试'))return finish(judge({cold:null}));
  /* cold test: what is left of the budget, less the reserve for diff + Cardinal */
  const root=await step('prepareApp',()=>prepareApp(opts.app,path.join(RUNS_ROOT,'_app')));
  const before=userDirs(),t0=Date.now();let located0=null;try{located0=require('../core/cold-test/saves.cjs').locate({exe:loc.exe,engine:loc.engine,title});}catch{}
  const localeEmulator=localeEmulatorFor(root,loc,title);result.localeEmulator=!!localeEmulator;
  const coldMs=Math.max(120000,left()-RESERVE_MS);result.coldBudgetMs=coldMs;
  const stopScreen=opts.foreground?screenRecorder(path.join(out,'screen')):null;
  let cold=null;
  await step('cold',async()=>{try{cold=await coldTest(root,loc,title,coldMs,probe?.exeSha256,{visible:opts.foreground,localeEmulator,skip:opts.skip===true});}catch(e){cold={verdict:'blocked',why:'cold test threw: '+e.message};}});
  if(stopScreen){await stopScreen();result.foreground=true;result.artifacts.screen=fs.readdirSync(path.join(out,'screen')).filter(f=>/\.png$/i.test(f)).map(f=>path.join(out,'screen',f));}
  if(cold.runDir&&located0){const r=residue(located0,before,t0-1000);result.residue=r;if(r.kept.length)result.reasons.push('游戏在已有用户目录里写了没快照到的文件：'+r.kept.join('; '));}
  result.cold=cold;log('# cold '+cold.verdict+' '+(cold.why||'')+' lines='+(cold.lines|0));
  let runCopy='',runInfo=null,diag=null;
  if(cold.runDir&&fs.existsSync(cold.runDir)){runCopy=path.join(out,'run');fs.rmSync(runCopy,{recursive:true,force:true});copyTree(cold.runDir,runCopy);
   try{runInfo=JSON.parse(fs.readFileSync(path.join(runCopy,'run.json'),'utf8'));}catch{}
   /* which input the game took (services/cold-test-run.cjs inputLadder): the level it ended on, sends per level, every check and step up */
   if(runInfo?.input){result.input=runInfo.input;log('# input '+runInfo.input.level+' '+JSON.stringify(runInfo.input.sent)+(runInfo.input.escalations.length?' up: '+runInfo.input.escalations.map(e=>e.from+'>'+e.to).join(','):''));}
   /* the bridge's hide confirmations of this run (cold-test-run hideProbe): when, on which stream */
   result.hide={confirmed:runInfo?.hideConfirmed||[],probes:(runInfo?.hideProbes||[]).length,skipped:runInfo?.drawSkipped||0};
   result.hook=hookUsed;if(loc.engine==='kirikiri'&&!result.hide.skipped&&!hookUsed['MeguLitHook32.dll']?.drawSkip)result.reasons.push('源头不画没装上：用的 MeguLitHook32.dll（'+(hookUsed['MeguLitHook32.dll']?.src||'install')+'）没有 DrawSkip，设 MEGULIT_HOOK_DIR 指向带 DrawSkip 的构建');
   diag=hookDiagnostics(root,runInfo,path.join(runCopy,'hook-diagnostics.log'));result.layers.engine={...engine,injected:diag.injected,selected:diag.selected,auxNoise:diag.auxNoise,kagWait:diag.kagWait};
   result.artifacts.run=runCopy;result.artifacts.screenshots=fs.readdirSync(runCopy).filter(f=>/^shot-.*\.jpe?g$/i.test(f)).map(f=>path.join(runCopy,f));}
  result.stuck=stuckOf({cold,run:runInfo,diag,engine});
  /* layer 3: the game diff */
  let diff=null;
  await step('diff',()=>{if(probe&&runCopy){try{const fast=(runInfo?.phases||[]).find(p=>p.name==='fast');result.phases=runInfo?.phases||[];diff=makeDiff(probe.dir,runCopy,out,fast?{from:runInfo.startedAt,to:fast.at}:null);if(fast)diff.window={from:runInfo.startedAt,to:fast.at};result.artifacts.diff=diff.dir;if(diff.gameKey)result.gameKey=diff.gameKey;log('# diff '+diff.mode+' cost='+diff.cost);}catch(e){diff={ok:false,why:e.message};}}
   else diff={ok:false,why:probe?'冷测试没有运行目录':'没有探针'};});
  result.diff=diff;if(diff.ok)result.layers.game={diff:diff.dir,mode:diff.mode};
  /* Cardinal (only when the cold run has lines to replay) */
  let card=null;
  if(runCopy&&(cold.lines|0)>0){if(overtime('Cardinal 回放'))return finish(judge({cold,diff,card:null}));
   await step('cardinal',()=>{const file=path.join(out,'cardinal.json');card=cardinal(runCopy,runInfo,loc,probe?.exeSha256||'',title,file,{timeoutMs:Math.max(60000,left()),shots:result.foreground?shotSample(path.join(out,'screen'),path.join(out,'screen-sample'),20):''});if(card.ok)result.artifacts.cardinal=file;
    fs.writeFileSync(path.join(out,'cardinal.log'),card.log||'');result.cardinal=card.ok?{scores:card.result.scores,applies:card.result.applies,total:card.result.total,lines:card.result.lines,errors:card.errors}:{why:card.why};
    log('# cardinal '+(card.ok?JSON.stringify(card.result.scores):card.why));});}
  const j=judge({cold,diff,card});
  /* layer 4: the seed entry, only for a pass */
  if(j.verdict==='pass'&&opts.seedOut)await step('seed',()=>{try{result.layers.seed=writeSeed(diff.dir,{engine:loc.engine,title,exeName:path.basename(loc.exe),exeSha:probe.exeSha256,gameKey:result.gameKey},path.resolve(opts.seedOut));result.artifacts.seed=result.layers.seed;}
   catch(e){j.reasons.push('seed 没写出：'+e.message);}});
  if(left()<0&&j.verdict==='pass')j.reasons.push('超出预算 '+Math.round(-left()/1000)+' 秒');
  return finish(j);}
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
module.exports={parseArgs,pickHookDll,hookDirs,useCheckoutHook,titleOf,safeName,unsupported,locate,engineOfGame,engineHook,hookDiagnostics,stuckOf,writeSeed,judge,lock,run,main,GATE,EXIT};
