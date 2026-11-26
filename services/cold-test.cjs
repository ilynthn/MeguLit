// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 店主没有预算买所有游戏，让愿意的用户电脑在闲时替他测自己库里的游戏，把骨架种子测成确认好的种子；默认开，
   隐藏桌面，Steam 不绕开但说清楚，截图只在没过线时上传 2 到 3 张) the idle-time cold test. docs/cold-test.md

   Every CHECK_EVERY the service looks at the PC (core/cold-test/conditions.cjs: idle, on AC, nothing full screen, no game
   playing, CPU quiet, today's budget). When it may, it takes the next library game (core/cold-test/pick.cjs), and:
     1 finds its save places (core/cold-test/saves.cjs; none -> the game is not tested) and snapshots them (journal first)
     2 runs it once on the hidden desktop, muted, driven, for at most the per-game cap (services/cold-test-run.cjs in
       services/cold-test-worker.cjs); the user's first key or mouse move ends it at once
     3 puts the saves back (also after a crash: pending snapshots are restored at the next start)
     4 scores the one recording offline over every candidate setting (core/cold-test/score.cjs)
     5 reports: the score, the prints and the diff (POST /api/game-profile/report, source 'cold'; switches 共享适配 +
       autoProfileShare); on fail or edge also 2-3 small client-area pictures and the run's logs (POST /api/game-profile/runtime;
       switches runtimeSampleShare + coldTestShots). A pass sends no picture. Inconclusive (black hidden desktop, too few
       lines, stopped) sends nothing.
   Switches (library.json): coldTest (on unless false), coldTestShots (on unless false). */
const fs=require('node:fs'),path=require('node:path'),{fork,execFile}=require('node:child_process'),crypto=require('node:crypto'),zlib=require('node:zlib');
const Cond=require('../core/cold-test/conditions.cjs'),Pick=require('../core/cold-test/pick.cjs'),Saves=require('../core/cold-test/saves.cjs'),Score=require('../core/cold-test/score.cjs');
const {helperPath}=require('./cold-test-run.cjs');

const CHECK_EVERY=2*60000,FIRST_DELAY=10*60000,RETEST_EVERY=6*3600000,KEEP_RUNS=6,TIMEOUT=15000;

/* ---- switches ------------------------------------------------------------------------------------------------------- */
const libFile=root=>path.join(root,'data','config','library.json');
function readLib(root){try{return JSON.parse(fs.readFileSync(libFile(root),'utf8'))||{};}catch{return {};}}
function writeLib(root,patch){const f=libFile(root);fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({...readLib(root),...patch},null,2));fs.renameSync(tmp,f);}
const enabled=root=>readLib(root).coldTest!==false;
const shotsEnabled=root=>readLib(root).coldTestShots!==false;
function setEnabled(root,on){writeLib(root,{coldTest:on===true});if(on!==true)stopNow('off');return enabled(root);}
function setShots(root,on){writeLib(root,{coldTestShots:on===true});return shotsEnabled(root);}
const reportsOn=root=>{try{return require('./auto-profile-feed.cjs').sharing(root);}catch{return false;}};
const samplesOn=root=>{try{return require('./runtime-sample.cjs').enabled(root);}catch{return false;}};

/* 2026-11-21 (owner: 说明里写清楚：会在后台打开你库里的游戏；Steam 版会算一点游戏时长，个别游戏可能解锁成就) the switch's words */
const WORDS={
 zh:{title:'闲时帮 The Seed 测游戏',
  body:'电脑空闲、插着电、没在玩游戏的时候，MeguLit 会在一块看不见的桌面上悄悄打开你库里还没确认的游戏，静音跑几十句，给这部游戏的种子打分，再关掉。你屏幕和任务栏上什么都不会出现，一碰键盘鼠标就立刻停下。',
  saves:'开测前会把这部游戏的存档整份备份，测完或中途停下都原样还回去；找不到存档在哪的游戏不测。',
  steam:'Steam 版游戏照常经过 Steam 启动，所以会算一点游戏时长，个别游戏可能会解锁成就。',
  limits:'每部游戏最多 6 分钟，每天最多 30 分钟；用电池、开着全屏、CPU 忙的时候不跑。',
  share:'过线的游戏只上传分数、指纹和差分，截图留在你电脑上。没过线或者分数在边缘时，才附 2 到 3 张缩小的游戏画面（只截游戏窗口），方便我们修。',
  shots:'没过线时附带游戏画面（2 到 3 张，只截游戏窗口）'},
 en:{title:'Test games for The Seed while the PC is idle',
  body:'When your PC is idle, plugged in and no game is running, MeguLit quietly opens a game from your library that is not confirmed yet on an invisible desktop, runs a few dozen lines muted, scores its seed and closes it. Nothing shows on your screen or taskbar, and it stops the moment you touch the keyboard or mouse.',
  saves:'Before a test the game\'s saves are backed up and put back exactly afterwards, even when the test is stopped. A game whose saves cannot be found is not tested.',
  steam:'Steam games start through Steam as usual, so they count a little play time, and a few games may unlock an achievement.',
  limits:'At most 6 minutes per game and 30 minutes a day; never on battery, with something full screen, or while the CPU is busy.',
  share:'A game that passes sends only its score, fingerprints and diff; pictures stay on your PC. Only when it fails or is borderline, 2-3 small pictures of the game window go along, so we can fix it.',
  shots:'Send game pictures when a test fails (2-3, game window only)'},
 ja:{title:'PC が空いているときに The Seed のためにゲームをテスト',
  body:'PC が空いていて電源につながり、ゲームを遊んでいないとき、MeguLit は見えないデスクトップでライブラリのまだ確認されていないゲームをそっと開き、ミュートで数十行進めてシードを採点し、閉じます。画面にもタスクバーにも何も出ず、キーボードやマウスに触れた瞬間に止まります。',
  saves:'テスト前にそのゲームのセーブを丸ごとバックアップし、終わったときも途中で止まったときもそのまま戻します。セーブの場所が分からないゲームはテストしません。',
  steam:'Steam 版はいつも通り Steam 経由で起動するので、プレイ時間が少し加算され、一部のゲームでは実績が解除されることがあります。',
  limits:'1 本につき最大 6 分、1 日最大 30 分。バッテリー駆動中、全画面の表示中、CPU が忙しいときは動きません。',
  share:'合格したゲームはスコア・指紋・差分だけを送り、画像は PC に残ります。不合格かぎりぎりのときだけ、ゲームウィンドウの縮小画像を 2〜3 枚添えて修正に役立てます。',
  shots:'不合格のときゲーム画面を添える（2〜3 枚、ゲームウィンドウのみ）'}};
function explain(locale='zh'){const l=String(locale||'').toLowerCase();return WORDS[l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh'];}

/* ---- state ---------------------------------------------------------------------------------------------------------- */
const stateFile=root=>path.join(root,'data','config','cold-test.json');
function load(root){try{const v=JSON.parse(fs.readFileSync(stateFile(root),'utf8'));if(v&&typeof v==='object')return {tested:{},blocked:{},days:{},log:[],...v};}catch{}return {tested:{},blocked:{},days:{},log:[]};}
function save(root,s){const f=stateFile(root);fs.mkdirSync(path.dirname(f),{recursive:true});const d=Object.keys(s.days||{}).sort();for(const k of d.slice(0,Math.max(0,d.length-14)))delete s.days[k];s.log=(s.log||[]).slice(-60);const tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,1));fs.renameSync(tmp,f);}
function note(s,entry){s.log=s.log||[];s.log.push({at:new Date().toISOString(),...entry});}
const today=(s,t=Date.now())=>s.days?.[Cond.dayOf(t)]||{ms:0,games:0};
const runsDir=root=>path.join(root,'data','cold-test','runs');

/* ---- the PC ---------------------------------------------------------------------------------------------------------- */
function reading(root,{exec=execFile}={}){const helper=helperPath(root);if(!helper)return Promise.resolve(null);
 return new Promise(res=>{try{exec(helper,['status'],{windowsHide:true,timeout:8000},(e,out)=>{if(e)return res(null);try{res(JSON.parse(String(out).trim().split(/\r?\n/).pop()));}catch{res(null);}});}catch{res(null);}});}
function freeMb(root){try{const st=fs.statfsSync(root);return Math.round(st.bavail*st.bsize/1048576);}catch{return NaN;}}

/* ---- the library ---------------------------------------------------------------------------------------------------- */
function libraryGames(db){try{return db.prepare("SELECT id,title,executable,original FROM games WHERE removed_at IS NULL AND executable<>''").all().map(r=>{let o={};try{o=JSON.parse(r.original||'{}');}catch{}
  return {id:String(r.id),title:String(r.title||''),exe:String(r.executable),engine:String(o.library?.engine||o.engine||''),steamAppId:String(o.library?.steamAppId||o.steamAppId||''),vndb:String(o.library?.vndbId||'')};});}catch{return [];}}
/* each game with its exe key (known hashes only: a cold test computes the hash of the one it takes) and its seed */
function withSeeds(root,games){const auto=require('../core/auto-profile.cjs'),P=require('../core/profiles/index.cjs');
 return games.map(g=>{const exeKey=auto.exeKeySync(root,g.exe);let p=null;try{p=P.profileFor({engine:g.engine,exe:g.exe,title:g.title,folder:path.dirname(g.exe),steamAppId:g.steamAppId,vndb:g.vndb,exeSha256:exeKey||undefined});}catch{}
  return {...g,exeKey,seedStatus:p?.seedStatus||'',gameKey:p?.gameKey||''};});}

/* the relay's retest list (GET /api/game-profile/retest), kept 6 hours */
async function retest(root,{fetcher=globalThis.fetch,now=Date.now()}={}){const f=path.join(root,'data','config','cold-test-retest.json');let old=null;try{old=JSON.parse(fs.readFileSync(f,'utf8'));}catch{}
 if(old&&now-(old.fetchedAt||0)<RETEST_EVERY)return Pick.retestOf(old);
 let urls=[];try{urls=require('./relay-config.cjs').endpoints(root,'/api/game-profile/retest');}catch{}
 for(const url of urls){try{const r=await fetcher(url,{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)continue;const t=await r.text();if(t.length>256*1024)continue;const v=JSON.parse(t);v.fetchedAt=now;
   try{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));}catch{}return Pick.retestOf(v);}catch{}}
 return Pick.retestOf(old);}

/* ---- Steam (owner: 不绕开，但要说清楚) ------------------------------------------------------------------------------ */
/* a Steam build asks the running Steam client; without steam_appid.txt next to it, SteamAPI restarts it through Steam on the
   user's desktop. With the game's own app id written there for the run (and removed again), it stays on the hidden desktop and
   Steam still counts it (play time, achievements). Steam must be running; a Steam DRM wrapper that relaunches anyway is ended
   by ColdDesk and the game is not cold-tested again. */
function steamOf(game){const dir=path.dirname(game.exe);let names=[];try{names=fs.readdirSync(dir).map(n=>n.toLowerCase());}catch{}
 const usesSteam=names.includes('steam_api.dll')||names.includes('steam_api64.dll');if(!usesSteam)return null;
 let appid=String(game.steamAppId||'');const file=path.join(dir,'steam_appid.txt');const has=fs.existsSync(file);
 if(!appid&&has)try{appid=fs.readFileSync(file,'utf8').trim();}catch{}
 if(!appid){try{appid=require('../core/steam-owned.cjs').launchAppid(game.exe,{})||'';}catch{}}
 return {appid:/^\d{1,10}$/.test(appid)?appid:'',file,has};}
const steamRunning=()=>{try{return require('./game-process.cjs').imageRunning('steam.exe');}catch{return false;}};

/* ---- one game -------------------------------------------------------------------------------------------------------- */
let current=null;
function stopNow(why){const c=current;if(!c?.stop)return false;c.stop(why).catch(()=>{});return true;}

/* -> {verdict, why, ...}; deps for tests: {runner(opts)->result, report, upload, now} */
/* ignoreInput / visible (tools/adapt-auto.cjs only, unattended): ColdDesk does not end the run on GetLastInputInfo changes / runs the game on the visible desktop */
async function testOne(root,game,{budgetMs,ignoreInput=false,visible=false,localeEmulator=null,ocrMenu=false,driver=null,hideProbe=false,choiceLocate=false,inputFallback=null,deps={}}={}){const s=load(root),id=game.exeKey||'id:'+game.id,now=deps.now||Date.now;const t0=now();
 const block=(why)=>{const st=load(root);st.blocked[id]={why,at:new Date(now()).toISOString(),title:game.title};note(st,{game:game.title,blocked:why});save(root,st);return {verdict:'blocked',why};};
 const steam=steamOf(game);
 if(steam&&!steam.appid)return block('steam-appid-unknown');
 if(steam&&!(deps.steamRunning||steamRunning)())return {verdict:'skipped',why:'steam-not-running'};
 const located=(deps.locate||Saves.locate)({exe:game.exe,engine:game.engine,title:game.title},deps.env||process.env);
 if(!located.ok)return block('no-save-place');
 const auto=require('../core/auto-profile.cjs');const key=game.exeKey||await auto.exeKey(root,game.exe);
 if(deps.startAllowed&&!await deps.startAllowed())return {verdict:'skipped',why:'not-idle'};
 if(require('./background-games.cjs').blocked())return {verdict:'skipped',why:'foreground'};
 const snap=Saves.snapshot(root,located,{id:'r'+t0.toString(36),key});if(!snap.ok)return block('snapshot: '+snap.why);
 const runDir=path.join(runsDir(root),(key||game.id).slice(0,16)+'-'+t0.toString(36));
 let wroteAppid=false,result=null,restored=null,unknown=[],profile=null;
 /* the layered profile the game runs with (its seed included): the hook uses it, and the seed's own settings get their mark */
 try{profile=require('../core/profiles/index.cjs').profileFor({engine:game.engine,exe:game.exe,title:game.title,folder:path.dirname(game.exe),steamAppId:steam?.appid||game.steamAppId,vndb:game.vndb,exeSha256:key||undefined});}catch{}
 try{
  if(steam&&!steam.has){fs.writeFileSync(steam.file,steam.appid);wroteAppid=true;}
  /* A crash must not restore over a still-running cold game. Only confirmed native cleanup unlocks this snapshot. */
  snap.journal.state='failed';snap.journal.errors=['cold cleanup has not been confirmed'];snap.journal.coldCleanup={state:'starting',at:new Date().toISOString()};
  fs.writeFileSync(path.join(Saves.snapDir(root),snap.journal.id,'journal.json'),JSON.stringify(snap.journal,null,1));
  current={game,started:t0,snapshot:{root,journal:snap.journal},stop:()=>require('./background-games.cjs').foreground()};
  result=await (deps.runner||runInWorker)({root,exe:game.exe,runDir,budgetMs,profile:profile?JSON.parse(JSON.stringify(profile)):null,...(ignoreInput?{ignoreInput:true}:{}),...(visible?{visible:true}:{}),...(localeEmulator?{localeEmulator}:{}),...(ocrMenu?{ocrMenu:true}:{}),...(driver?{driver}:{}),...(hideProbe?{hideProbe:true}:{}),...(choiceLocate?{choiceLocate:true}:{}),...(inputFallback?{inputFallback}:{})});}
 finally{current=null;
  if(result?.cleanupConfirmed!==true){restored={ok:false,errors:['cold cleanup has not been confirmed']};}
  else{snap.journal.coldCleanup={...snap.journal.coldCleanup,state:'confirmed'};
   if(wroteAppid)try{fs.unlinkSync(steam.file);}catch{}
   restored=Saves.restore(root,snap.journal);
   try{unknown=Saves.sweep(located,t0-1000,deps.env||process.env);}catch{}}}
 if(result?.cleanupConfirmed!==true)return block('cleanup-unconfirmed');
 const ms=Math.max(0,now()-t0);
 /* score the one recording */
 const read=f=>{try{return fs.readFileSync(path.join(runDir,f),'utf8');}catch{return '';}};
 const events=Score.eventsOf({hookEvents:read('hook-events.log'),engineDraw:read('engine-draw.log'),readerHost:read('reader-host.log')});
 let seedSettings=null;if(profile?.seedStatus)try{seedSettings=require('../core/profiles/seed.cjs').seeds().games.find(g=>g.key===profile.gameKey)?.settings||null;}catch{}
 const scored=Score.score(events,{profile,seedSettings});
 const v=Score.verdict(scored,{stopped:result?.stopped||'',black:!!result?.black,relaunched:!!result?.relaunched});
 const out={verdict:v.verdict,why:v.why,lines:scored.lines,measured:scored.measured,near:scored.near,mode:scored.mode,end:result?.end||'',restored:restored?.ok!==false,unknownWrites:unknown.length,runDir};
 /* bookkeeping: a stopped run is tried again another time; restore trouble or unguarded writes: never again on this PC */
 const st=load(root);const day=Cond.dayOf(t0);st.days[day]=st.days[day]||{ms:0,games:0};st.days[day].ms+=ms;if(result?.pid)st.days[day].games++;
 if(v.verdict==='inconclusive'&&String(v.why).startsWith('stopped:'))st.tested[id]={at:new Date(t0).toISOString(),verdict:'stopped',why:v.why};
 else st.tested[id]={at:new Date(t0).toISOString(),verdict:v.verdict,why:v.why,lines:scored.lines,seed:profile?.seedStatus||''};
 if(result?.relaunched)st.blocked[id]={why:'steam-relaunch',at:new Date(t0).toISOString(),title:game.title};
 if(restored&&!restored.ok)st.blocked[id]={why:'restore: '+restored.errors.join('; ').slice(0,200),at:new Date(t0).toISOString(),title:game.title};
 if(unknown.length)st.blocked[id]={why:'unguarded writes ('+unknown.length+')',at:new Date(t0).toISOString(),title:game.title};
 note(st,{game:game.title,verdict:v.verdict,why:v.why,lines:scored.lines,ms});save(root,st);
 /* report */
 if(v.verdict!=='inconclusive'&&key){try{out.report=await (deps.report||reportResult)(root,{game,key,scored,verdict:v,profile});}catch{out.report={state:'failed'};}
  if(v.verdict==='fail'||v.verdict==='edge'){try{out.upload=await (deps.upload||uploadSample)(root,{key,runDir,scored,verdict:v,result,game});}catch{out.upload={state:'failed'};}}}
 pruneRuns(root);
 return out;}

function runInWorker(opts,deps={}){const snap=current?.snapshot;return require('./cold-native-session.cjs').runInWorker(opts,{...deps,onState:state=>{if(snap){snap.journal.coldCleanup={...snap.journal.coldCleanup,...state};fs.writeFileSync(path.join(Saves.snapDir(snap.root),snap.journal.id,'journal.json'),JSON.stringify(snap.journal,null,1));}deps.onState?.(state);}});}

/* the score, prints and diff (owner: 过线只上传分数、指纹、差分) */
async function reportResult(root,{game,key,scored,verdict,profile},{fetcher}={}){const auto=require('../core/auto-profile.cjs'),feed=require('./auto-profile-feed.cjs');
 let ver='';try{ver=require('./hook-verdict.cjs').appVersion(root);}catch{}
 const rec=auto.record({key,engine:profile?.engine||game.engine,exe:game.exe,version:ver,source:'cold',result:{mode:scored.mode,settings:scored.settings,reason:verdict.verdict==='fail'?verdict.why:'',
  score:{metrics:scored.best.metrics,cost:scored.best.cost,lines:scored.lines},candidates:scored.candidates.slice(0,4)}});
 rec.cold={verdict:verdict.verdict,near:scored.near,measured:scored.measured,seed:scored.seed?{status:profile?.seedStatus||'',pass:scored.seed.pass,over:scored.seed.over}:null};
 /* this PC's own calibration, when it has none yet: the live gate still checks every window of the real play */
 const script=require('./original-text.cjs').contributionScript(root,game.exe,game.id);
 try{if(!auto.load(root,key,script))auto.store(root,key,rec,script);}catch{}
 let prints=null;try{prints=require('../core/game-print.cjs').prints(game.exe,{exe:key,script,title:game.title,steamAppId:game.steamAppId,vndb:game.vndb,engine:profile?.engine||''});}catch{prints={exe:key};}
 return feed.report(root,rec,{prints,...(fetcher?{fetcher}:{})});}

/* fail / edge: 2-3 small client-area pictures (coldTestShots) and the run's logs (runtimeSampleShare) */
function bundleOf(runDir,key,{shots=[],summary={}}={}){let scrub=t=>t;try{const dg=require('./diagnostics.cjs');if(dg.scrub)scrub=t=>dg.scrub(t);}catch{}
 const files=[{name:'cold.json',kind:'runtime',data:Buffer.from(JSON.stringify({schema:'megulit.cold-test',version:1,key,...summary},null,1))}];
 for(const f of ['hook-events.log','engine-draw.log'])try{const t=fs.readFileSync(path.join(runDir,f),'utf8');files.push({name:f,kind:'runtime',data:Buffer.from(scrub(t.length>1536*1024?t.slice(-1536*1024):t))});}catch{}
 shots.forEach((f,i)=>{try{const b=fs.readFileSync(path.join(runDir,f));if(b.length<=600*1024&&b[0]===0xff&&b[1]===0xd8)files.push({name:'shot-'+(i+1)+'.jpg',kind:'shot',data:b});}catch{}});
 const doc={schema:'megulit.runtime-bundle',version:1,key,createdAt:new Date().toISOString(),source:'cold',files:files.map(f=>({name:f.name,kind:f.kind,sha256:crypto.createHash('sha256').update(f.data).digest('hex'),data:f.data.toString('base64')}))};
 const z=zlib.gzipSync(Buffer.from(JSON.stringify(doc)),{level:9});return z.length<=3*1024*1024?{data:z,sha256:crypto.createHash('sha256').update(z).digest('hex'),files:files.map(f=>f.name)}:null;}
async function uploadSample(root,{key,runDir,scored,verdict,result,game},{fetcher=globalThis.fetch}={}){if(!samplesOn(root))return {state:'off'};
 const shots=Score.shotsToUpload(verdict.verdict,(result?.shots||[]),{shotsOn:shotsEnabled(root),shareOn:true});
 const b=bundleOf(runDir,key,{shots,summary:{verdict:verdict.verdict,why:verdict.why,lines:scored.lines,near:scored.near,measured:scored.measured,best:scored.best,seed:scored.seed,end:result?.end||''}});if(!b)return {state:'too-big'};
 let prints={};try{prints=require('../core/game-print.cjs').prints(game.exe,{exe:key,title:game.title,steamAppId:game.steamAppId});}catch{}
 const body=JSON.stringify({version:1,key,prints,sha256:b.sha256,data:b.data.toString('base64')});let urls=[];try{urls=require('./relay-config.cjs').endpoints(root,'/api/game-profile/runtime');}catch{}
 for(const url of urls){try{const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit'},body,signal:AbortSignal.timeout(60000)});if(r.ok)return {state:'sent',shots:shots.length,files:b.files};if(r.status>=400&&r.status<500&&r.status!==429)return {state:'refused',status:r.status};}catch{}}
 return {state:'failed'};}

function pruneRuns(root){let dirs=[];try{dirs=fs.readdirSync(runsDir(root),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>({p:path.join(runsDir(root),d.name),t:fs.statSync(path.join(runsDir(root),d.name)).mtimeMs})).sort((a,b)=>b.t-a.t);}catch{return;}
 for(const d of dirs.slice(KEEP_RUNS))try{fs.rmSync(d.p,{recursive:true,force:true});}catch{}}

/* ---- the schedule --------------------------------------------------------------------------------------------------- */
let timer=null,busy=false,started='',opener=null,playing=()=>false;
/* one check: -> {state, reason?, result?} */
async function tick(root,{db=null,deps={}}={}){if(require('./background-games.cjs').blocked())return {state:'waiting',reason:'foreground'};if(busy||require('./background-games.cjs').occupied())return {state:'busy'};busy=true;try{
  const s=load(root);const cfg=Cond.config(readLib(root).coldTestLimits);
  const r=await (deps.reading||reading)(root);
  const c=Cond.check(r?{...r,gameRunning:(deps.playing||playing)(),freeMb:(deps.freeMb||freeMb)(root)}:null,{cfg,today:today(s),enabled:enabled(root),helper:!!(deps.helper??helperPath(root)),platform:deps.platform||process.platform});
  if(!c.ok)return {state:'waiting',reason:c.reason};
  if(require('./background-games.cjs').blocked())return {state:'waiting',reason:'foreground'};
  const games=withSeeds(root,(deps.games||libraryGames)(db));
  const list=Pick.candidates(games,{retest:await (deps.retest||retest)(root),state:s,exists:deps.exists||(f=>fs.existsSync(f)),running:deps.running||(()=>false)});
  if(require('./background-games.cjs').blocked())return {state:'waiting',reason:'foreground'};
  if(!list.length)return {state:'nothing'};
  const startAllowed=async()=>{const bg=require('./background-games.cjs');if(bg.blocked()||bg.occupied())return false;const fresh=await (deps.reading||reading)(root);
   return Cond.check(fresh?{...fresh,gameRunning:(deps.playing||playing)(),freeMb:(deps.freeMb||freeMb)(root)}:null,{cfg,today:today(load(root)),enabled:enabled(root),helper:!!(deps.helper??helperPath(root)),platform:deps.platform||process.platform}).ok&&!bg.blocked()&&!bg.occupied();};
  const result=await testOne(root,list[0],{budgetMs:Cond.budgetMs(cfg,today(s)),deps:{...deps,startAllowed}});
  return {state:'tested',game:list[0].title,result};}
 finally{busy=false;}}

function schedule(root,delay){clearTimeout(timer);timer=setTimeout(async()=>{timer=null;let db=null;try{db=opener?opener():null;await tick(root,{db});}catch{}finally{try{db?.close?.();}catch{}}schedule(root,CHECK_EVERY);},delay);timer.unref?.();}
/* the server starts it; isPlaying(): MeguLit has a game bound right now */
function start(root,openDb,{delay=FIRST_DELAY,isPlaying=null}={}){if(process.env.NODE_TEST_CONTEXT||started===root||process.platform!=='win32')return null;started=root;opener=openDb;if(isPlaying)playing=isPlaying;
 /* a crash during a run left a snapshot: put those saves back first */
 for(const j of Saves.pending(root))try{Saves.restore(root,j);}catch{}
 schedule(root,delay);return true;}
function stop(){clearTimeout(timer);timer=null;stopNow('stop');}
function status(root){const s=load(root);return {enabled:enabled(root),shots:shotsEnabled(root),running:current?{title:current.game?.title||'',since:current.started}:null,today:today(s),tested:Object.keys(s.tested).length,blocked:Object.keys(s.blocked).length,log:s.log.slice(-20),failedRestores:Saves.failed(root).length};}

module.exports={enabled,shotsEnabled,setEnabled,setShots,explain,WORDS,load,save,tick,testOne,start,stop,status,reading,withSeeds,libraryGames,steamOf,bundleOf,reportResult,uploadSample,retest,runInWorker};
