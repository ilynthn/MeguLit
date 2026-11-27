// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter auto (owner: 新游戏下载完脚本自动跑到「店主可以测」，不花 LLM token): a finished download -> an installed
   own copy -> the adapter with --tester -> a PR -> a test build -> the tester's checklist and a card for the owner's test bench;
   a stuck note where a person decides. Checks, on real code with fixtures (no game, no installer of a real game is run):
   - install: a disc image (Alcohol .mdf with 2048-byte sectors) whose root is the game is read out, the installer's own files
     dropped, a bonus disc and a sound-track folder skipped; GIGA's update applied after a size/CRC check and refused when they
     differ; an Inno Setup disc is installed by running its own installer silently and per user into the copy; a .zip download
     is unpacked; a Chinese overlay package (汉化启动器 beside the Japanese exe) is started from the Japanese exe; the update
     folder's own program is not taken for an installed game (アイキス3 replay); nothing goes to C: / E:
   - auto: the card has the shape of the owner's test bench (c1312.json) and the checklist names the copy, the exe and the
     side-by-side test build; the adapter's exit 3 / a new engine / an adapter without --tester stop with a stuck note; after a
     person answers, the ready adapter state is taken, not run again (replay bug); a rerun goes on from the first step not done
   - the test build is ready on a double click (owner: 引导挡着、库是空的、翻译没配、Alt+T 被正式版占着): the installed app's settings,
     translation config and key vault but not its library or database, a relocation marker naming the test root, 开始测试.cmd with
     test-start.json (the game under the work's name); the exit command it sends the installed MeguLit; the card's first step is that cmd
   - the watch: only finished game orders with an issue, once each; --baseline marks without running; one watch at a time */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const {spawnSync}=require('node:child_process');
const Install=require('../tools/megulit-adapter/auto-install.cjs');
const Auto=require('../tools/megulit-adapter/auto.cjs');
const Watch=require('../tools/adapt-auto-watch.cjs');

const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'adapter-auto-'));
const put=(f,data)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);};
const FREE={bavail:1e6,bsize:1<<20};
/* the fixtures live in the temp folder, which is on C: on CI: the copies-never-on-C:/E: rule is set per test (the last zip test) */
process.env.MEGULIT_COPIES_NO_DRIVES='';
/* a findGame stand-in for fixture folders (the real one needs an engine's marker files): the first plain exe */
const find=d=>{const walk=x=>{for(const e of fs.readdirSync(x,{withFileTypes:true})){const f=path.join(x,e.name);if(e.isFile()&&/\.exe$/i.test(e.name)&&!/^(setup|unins|update)/i.test(e.name)&&!/(_cn|chs)\.exe$/i.test(e.name))return f;if(e.isDirectory()&&!/^data$/i.test(e.name)){const r=walk(f);if(r)return r;}}return '';};const exe=walk(d);return exe?{dir:path.dirname(exe),exe}:null;};

/* a flat ISO 9660 image: PVD at 16, terminator at 17, the root directory at 18, one sector per file from 19 */
function iso(files){const names=Object.keys(files),sectors=19+names.length+1,user=Buffer.alloc(sectors*2048);
 const pvd=user.subarray(16*2048);pvd[0]=1;pvd.write('CD001',1,'latin1');pvd[156]=34;pvd.writeUInt32LE(18,156+2);pvd.writeUInt32LE(2048,156+10);pvd[156+25]=2;
 user.subarray(17*2048)[0]=255;user.subarray(17*2048).write('CD001',1,'latin1');
 const rec=(name,lba,size,dir)=>{const n=Buffer.from(name,'latin1'),len=33+n.length+(n.length%2?0:1),r=Buffer.alloc(len);r[0]=len;r.writeUInt32LE(lba,2);r.writeUInt32LE(size,10);r[25]=dir?2:0;r[32]=n.length;n.copy(r,33);return r;};
 const recs=[rec('\x00',18,2048,true),rec('\x01',18,2048,true)];
 names.forEach((n,i)=>{const data=Buffer.from(files[n]);recs.push(rec(n+';1',19+i,data.length,false));data.copy(user,(19+i)*2048);});
 Buffer.concat(recs).copy(user,18*2048);return user;}
/* GIGA UpdateInf.dat with one file entry */
function updateInf(version,name,data){const b=Buffer.alloc(0x300+0x118);b.write('アイキス3',0,'latin1');b.write(version,0x180,'latin1');b.write('Software\\GIGA\\Test',0x200,'latin1');b.write('DIRECTORY',0x280,'latin1');
 b.write(name,0x300,'latin1');b.writeUInt32LE(data.length,0x300+0x108);b.writeUInt32LE(zlib.crc32(data)>>>0,0x300+0x110);return b;}

test('install: a disc whose root is the game is read out, installer files dropped, bonus discs skipped, the GIGA update applied',async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const dl=path.join(d,'dl'),root=path.join(d,'copies');
 put(path.join(dl,'[220325][戯画] Game パッケージ版 (mdf+mds)','GAME.mdf'),iso({'Game.exe':'old-exe','data.pac':'pac','Setup.exe':'installer','autorun.inf':'[autorun]'}));
 put(path.join(dl,'[220325][戯画] Game パッケージ版 (mdf+mds)','GAME.mds'),'mds');
 put(path.join(dl,'[220325][戯画] Game パッケージ版 (mdf+mds)','mini album.mdf'),iso({'track.wav':'x'}));
 put(path.join(dl,'[220325][戯画] Game 特典 サウンドトラック (wav+cue)','ost.cue'),'FILE "ost.wav" WAVE');put(path.join(dl,'[220325][戯画] Game 特典 サウンドトラック (wav+cue)','ost.wav'),'w');
 const newExe=Buffer.from('new-exe-1.03');const up=path.join(dl,'[220325][戯画] Game Update Ver.1.03');
 put(path.join(up,'UpdateInf.dat'),updateInf('ver1.03','Game.exe',newExe));put(path.join(up,'Data','Game.exe'),newExe);put(path.join(up,'Update.exe'),'u');
 const r=await Install.install(dl,{short:'game',root,deps:{statfs:()=>FREE,find}});
 assert.equal(r.ok,true,r.why);assert.equal(r.how,'disc-files');assert.equal(r.dir,path.join(root,'game-auto'));
 /* the update's own Data\Game.exe did not count as an installed game: the disc was installed */
 assert.equal(fs.readFileSync(path.join(r.dir,'Game.exe'),'utf8'),'new-exe-1.03');assert.equal(fs.readFileSync(path.join(r.dir,'data.pac'),'utf8'),'pac');
 assert.equal(fs.existsSync(path.join(r.dir,'Setup.exe')),false);assert.equal(fs.existsSync(path.join(r.dir,'autorun.inf')),false);
 assert.equal(fs.existsSync(path.join(r.dir,'track.wav')),false,'the mini album is a bonus disc');
 assert.deepEqual(r.updates,['ver1.03']);assert.equal(path.basename(r.exe),'Game.exe');
 /* a rerun keeps the copy */
 const again=await Install.install(dl,{short:'game',root,deps:{statfs:()=>FREE,find}});assert.equal(again.ok,true);assert.equal(again.how,'kept');});

test('install: an update whose file does not match UpdateInf.dat is refused; a disc of another installer stops for a person',async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const dl=path.join(d,'dl');put(path.join(dl,'disc','GAME.iso'),iso({'Game.exe':'e'}));
 put(path.join(dl,'Update Ver.1.01','UpdateInf.dat'),updateInf('ver1.01','Game.exe',Buffer.from('right')));put(path.join(dl,'Update Ver.1.01','Data','Game.exe'),'wrong');
 const r=await Install.install(dl,{short:'g',root:path.join(d,'c'),deps:{statfs:()=>FREE,find}});
 assert.equal(r.ok,false);assert.match(r.why,/CRC/);
 const dl2=path.join(d,'dl2');put(path.join(dl2,'GAME.iso'),iso({'setup.exe':'installshield','data1.cab':'c'}));
 const r2=await Install.install(dl2,{short:'g2',root:path.join(d,'c'),deps:{statfs:()=>FREE,find}});
 assert.equal(r2.ok,false);assert.match(r2.why,/要人装/);});

test('install: an Inno Setup disc runs its own installer silently, per user, into the copy',async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const dl=path.join(d,'dl'),root=path.join(d,'copies');
 put(path.join(dl,'制服カノジョ3','SEIFUKU3.mdf'),iso({'Launcher.exe':'MZ... Inno Setup Setup Data (6.2.0) ...','Launcher-1.bin':'p1','Launcher-2.bin':'p2'}));
 put(path.join(dl,'制服カノジョ3','愛夜　ドラマCD.mdf'),iso({'t.wav':'x'}));
 const calls=[];const run=(exe,args)=>{calls.push({exe,args});const dir=args.find(a=>a.startsWith('/DIR=')).slice(5);put(path.join(dir,'SEIFUKU3.exe'),'game');put(path.join(dir,'unins000.exe'),'u');return {status:0};};
 const r=await Install.install(dl,{short:'seifuku3',root,deps:{statfs:()=>FREE,run,find}});
 assert.equal(r.ok,true,r.why);assert.equal(r.how,'inno');assert.equal(calls.length,1);assert.equal(path.basename(calls[0].exe),'Launcher.exe');
 for(const a of ['/VERYSILENT','/SUPPRESSMSGBOXES','/CURRENTUSER','/DIR='+path.join(root,'seifuku3-auto')])assert.ok(calls[0].args.includes(a),a);
 assert.equal(path.basename(r.exe),'SEIFUKU3.exe');assert.equal(fs.existsSync(path.join(root,'seifuku3-auto.disc')),false,'the read-out disc is removed');
 /* the installer failing (no elevation, refused) stops for a person */
 const r2=await Install.install(dl,{short:'other',root,deps:{statfs:()=>FREE,run:()=>({status:1}),find}});assert.equal(r2.ok,false);assert.match(r2.why,/没装成/);});

test('install: a .zip download is unpacked; a Chinese overlay package starts from the Japanese exe; C: is refused',{skip:process.platform!=='win32'},async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const stage=path.join(d,'stage','Ozmafia');put(path.join(stage,'ozmafia.exe'),'ja');put(path.join(stage,'ozmafia_cn.exe'),'cn launcher');put(path.join(stage,'mai.dll'),'dll');put(path.join(stage,'pac','sc.ypf'),'p');
 const dl=path.join(d,'dl');fs.mkdirSync(dl);const z=spawnSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-a','-cf',path.join(dl,'Ozmafia.zip'),'-C',path.join(d,'stage'),'Ozmafia'],{encoding:'utf8',windowsHide:true});assert.equal(z.status,0,z.stderr);
 const realFind=dir=>{const g=find(dir);return g?{dir:g.dir,exe:''}:null;};/* findGame knows the engine but not which of the two programs */
 const r=await Install.install(dl,{short:'ozmafia',root:path.join(d,'copies'),deps:{statfs:()=>FREE,seven:'',find:realFind,copy:(src,o)=>require('../tools/game-copies.cjs').prepareCopy(src,{...o,statfs:()=>FREE,noDrives:''})}});
 assert.equal(r.ok,true,r.why);assert.equal(path.basename(r.exe),'ozmafia.exe');assert.match(r.notes.join(),/ozmafia_cn\.exe/);
 assert.match(r.steps.join(),/解压 Ozmafia\.zip/);
 const c=await Install.install(dl,{short:'x',root:'C:\\MeguLit-Copies',noDrives:'C,E'});assert.equal(c.ok,false);assert.match(c.why,/C:/);});

/* ---- auto with fake workers: the adapter writes its state like the real one ------------------------------------------- */
function fakeAdapter(script){const calls=[];return {calls,fn:args=>{calls.push(args);const out=args[0]==='answer'||args[0]==='publish'?args[1]:args[args.indexOf('--out')+1];const step=script(args,out);
  if(step.state)put(path.join(out,'adapter.json'),JSON.stringify({state:step.state,title:'テストゲーム',engine:'yuris',caps:{known:step.known!==false,label:'YU-RIS'},identity:{vndb:'v1'},answers:{},questions:step.questions||[],review:path.join(out,'review.html'),pr:step.pr||'',...step.extra}));
  if(step.request)put(path.join(out,'test-request.md'),step.request);return {status:step.status,out:step.out||''};}};}
function setup(t){const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));const env={...process.env};
 Object.assign(process.env,{MEGULIT_AUTO_ROOT:path.join(d,'auto'),MEGULIT_COPIES_ROOT:path.join(d,'copies'),MEGULIT_TEST_REQUESTS:path.join(d,'req'),MEGULIT_AUTO_WORKTREES:path.join(d,'wt'),MEGULIT_AUTO_QUEUE:path.join(d,'queue')});
 t.after(()=>{for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);});
 const dl=path.join(d,'dl','test-game');put(path.join(dl,'SOURCE.txt'),'作品: テストゲーム\n版本: DL版 / 2026-01-01\n');
 put(path.join(d,'queue','test-game.json'),'\uFEFF'+JSON.stringify({name:'test-game',task:'下载《テストゲーム》（中文名 测试游戏，VNDB v12345）',issue:77,result:'ok'}));
 const copy=path.join(d,'copies','test-game-auto');put(path.join(copy,'Game.exe'),'e');
 const integrated=[];
 const install=async()=>({ok:true,dir:copy,exe:path.join(copy,'Game.exe'),how:'copy',steps:['复制成自己的副本'],updates:[],notes:['外挂汉化整包：用日文原版 Game.exe']});
 const integrate=o=>{integrated.push(o);return {root:path.join(o.dir,'app-1'),merged:o.add,skipped:[]};};
 return {d,dl,copy,install,integrate,integrated,logs:[]};}

test('auto: a download runs to a card of the test bench shape and a checklist; the PR body gets Refs #issue',async t=>{const s=setup(t);
 const A=fakeAdapter((args,out)=>{if(args[0]==='publish'){return {status:0,state:'published',pr:'https://github.com/ilynthn/MeguLit/pull/4321'};}
  put(path.join(out,'pr-body.md'),'## 问题\n\nx\n\n## 改动\n\ny\n');return {status:0,state:'ready',request:'# 实测清单\n\n## 游戏\n\n- 目录：`X`\n- 启动程序：`Game.exe`（不要用汉化启动器）\n\n## 步骤\n\n1. a\n'};});
 const repos=[];const code=await Auto.auto({dir:s.dl,name:'test-game',issue:77,publish:true},{log:m=>s.logs.push(m),deps:{install:s.install,adapter:A.fn,integrate:s.integrate,checkout:o=>{repos.push(o);return path.join(s.d,'repo');},vndb:async()=>{throw Error('no lookup when the order names the work');}}});
 assert.equal(code,0,s.logs.join('\n'));
 const first=A.calls[0];assert.ok(first.includes('--tester'));assert.deepEqual(first.slice(first.indexOf('--exe'),first.indexOf('--exe')+2),['--exe','Game.exe']);
 assert.deepEqual(first.slice(first.indexOf('--vndb'),first.indexOf('--vndb')+2),['--vndb','v12345']);assert.deepEqual(first.slice(first.indexOf('--cn'),first.indexOf('--cn')+2),['--cn','测试游戏']);
 assert.deepEqual(A.calls[1].slice(0,1),['publish']);assert.ok(A.calls[1].includes('--go'));
 assert.match(fs.readFileSync(path.join(s.d,'auto','runs','test-game','adapter','pr-body.md'),'utf8'),/Refs #77/);
 const card=JSON.parse(fs.readFileSync(path.join(s.d,'req','cards','4321.json'),'utf8'));
 assert.deepEqual(Object.keys(card),['id','title','sub','game','app','steps','checks','order','done']);
 assert.equal(card.id,'4321');assert.equal(card.title,'テストゲーム');assert.equal(card.game,path.join(s.copy,'Game.exe'));assert.equal(card.app,path.join(s.d,'copies','testbuild-all','开始测试.cmd')+' 4321','one entry for every card, the PR number picks the game');assert.equal(s.integrated.length,1);assert.deepEqual(s.integrated[0].add,[4321],'the PR is added to the combined build, not built on its own');assert.match(card.steps[0],/双击开始测试\.cmd，游戏会自己打开/);assert.doesNotMatch(card.steps.join(),/添加/);
 assert.equal(card.checks.length,3);assert.match(card.checks[0][1],/原文/);assert.match(card.checks[1][1],/换一句/);assert.match(card.checks[2][1],/选项.*中文/);
 assert.equal(card.done,false);assert.ok(card.steps.length>=3);
 const md=fs.readFileSync(path.join(s.d,'req','4321-test-game.md'),'utf8');
 assert.match(md,/开始测试\.cmd/);assert.match(md,/释放 Alt\+T/);assert.match(md,/test-game-auto/);assert.match(md,/不要用汉化启动器/);assert.doesNotMatch(md,/目录：`X`/);
 assert.equal(fs.existsSync(path.join(s.d,'req','stuck','test-game.md')),false);
 /* a rerun does nothing again */
 const n=A.calls.length;assert.equal(await Auto.auto({dir:s.dl,name:'test-game',issue:77,publish:true},{log:()=>{},deps:{install:s.install,adapter:A.fn,integrate:s.integrate,checkout:()=>path.join(s.d,'repo')}}),0);assert.equal(A.calls.length,n);});

test('auto: exit 3 stops with a stuck note; after the answer the ready state is taken, not the adapter run again',async t=>{const s=setup(t);
 let answered=false;const A=fakeAdapter(args=>{if(args[0]==='answer')return {status:0,state:'ready'};
  return answered?{status:0,state:'ready'}:{status:3,state:'waiting',questions:[{id:'again',ask:'HANDOFF 已登记过，还要重新适配吗？'}]};});
 const deps={install:s.install,adapter:A.fn,integrate:s.integrate,checkout:()=>path.join(s.d,'repo'),vndb:async()=>({})};
 assert.equal(await Auto.auto({dir:s.dl,name:'test-game',pr:1312},{log:()=>{},deps}),3);
 const stuck=fs.readFileSync(path.join(s.d,'req','stuck','test-game.md'),'utf8');assert.match(stuck,/卡在「适配」/);assert.match(stuck,/again：HANDOFF 已登记过/);assert.match(stuck,/--pr 1312/);assert.match(stuck,/review\.html/);
 /* the person answers with `answer <out> again=yes`: the adapter state becomes ready */
 const out=path.join(s.d,'auto','runs','test-game','adapter');const st=JSON.parse(fs.readFileSync(path.join(out,'adapter.json'),'utf8'));st.state='ready';fs.writeFileSync(path.join(out,'adapter.json'),JSON.stringify(st));
 const before=A.calls.length;assert.equal(await Auto.auto({dir:s.dl,name:'test-game',pr:1312},{log:()=>{},deps}),0);
 assert.equal(A.calls.length,before,'the ready adapter is not run again (it would drop the answers)');
 assert.equal(fs.existsSync(path.join(s.d,'req','stuck','test-game.md')),false,'the stuck note goes once the card is out');
 assert.ok(fs.existsSync(path.join(s.d,'req','cards','1312.json')));});

test('auto: a new engine, an adapter without --tester and an install failure stop with what to decide',async t=>{const s=setup(t);
 const A=fakeAdapter(()=>({status:0,state:'ready',known:false}));
 assert.equal(await Auto.auto({dir:s.dl,name:'test-game',pr:9},{log:()=>{},deps:{install:s.install,adapter:A.fn,vndb:async()=>({})}}),3);
 assert.match(fs.readFileSync(path.join(s.d,'req','stuck','test-game.md'),'utf8'),/新引擎/);
 fs.rmSync(path.join(s.d,'auto'),{recursive:true,force:true});
 const B=fakeAdapter(()=>({status:2,out:'megulit-adapter: unknown argument: --tester'}));
 assert.equal(await Auto.auto({dir:s.dl,name:'test-game',pr:9},{log:()=>{},deps:{install:s.install,adapter:B.fn,vndb:async()=>({})}}),3);
 assert.match(fs.readFileSync(path.join(s.d,'req','stuck','test-game.md'),'utf8'),/--tester/);
 fs.rmSync(path.join(s.d,'auto'),{recursive:true,force:true});
 assert.equal(await Auto.auto({dir:s.dl,name:'test-game'},{log:()=>{},deps:{install:async()=>({ok:false,why:'光盘镜像读不了：X.nrg'})}}),3);
 assert.match(fs.readFileSync(path.join(s.d,'req','stuck','test-game.md'),'utf8'),/卡在「装游戏」[\s\S]*X\.nrg/);});

test('auto meta: the work from the queue order and SOURCE.txt; a title alone is looked up on VNDB',async t=>{const s=setup(t);
 const m=Auto.meta(s.dl,'test-game');assert.equal(m.title,'テストゲーム');assert.equal(m.vndb,'v12345');assert.equal(m.cn,'测试游戏');assert.equal(m.release,'DL版');
 fs.writeFileSync(path.join(s.d,'queue','test-game.json'),JSON.stringify({name:'test-game',task:'下载 テストゲーム 日文原版',issue:77,result:'ok'}));
 const seen=[];const A=fakeAdapter(()=>({status:0,state:'ready'}));
 await Auto.auto({dir:s.dl,name:'test-game',pr:5},{log:()=>{},deps:{install:s.install,adapter:A.fn,integrate:s.integrate,checkout:()=>'',vndb:async a=>{seen.push(a.title);return {vndb:'v999',cn:'中'};}}});
 assert.deepEqual(seen,['テストゲーム']);assert.ok(A.calls[0].includes('v999'));});

test('combined test build: the tester settings and keys but not the installed library, every card game under its own name, one 开始测试.cmd taking a PR number',{skip:process.platform!=='win32'},t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const app=path.join(d,'app'),root=path.join(d,'all','app-1'),card=path.join(d,'all'),game=path.join(d,'copies','Ozmafia-ozmafia-joki','ozmafia.exe');put(game,'g');
 put(path.join(root,'MeguLit.exe'),'exe');put(path.join(root,'runtime','node.exe'),'node');
 put(path.join(app,'data','megulit.sqlite'),'library db');put(path.join(app,'data','preferences.json'),'{"language":"zh"}');put(path.join(app,'data','megulit-relocation.json'),JSON.stringify({root:app}));
 put(path.join(app,'data','config','translation-profiles.json'),'{"provider":"deepseek"}');put(path.join(app,'data','config','secrets.dpapi'),'vault');put(path.join(app,'data','config','account','profile.json'),'{}');
 put(path.join(app,'data','config','library.json'),'{"folders":["E:\\\\gal"]}');
 const games={1312:{exe:game,title:'OZMAFIA!!'},1326:{exe:game,title:'ozmafia-copy-folder',preAdd:false}};
 const r=Auto.readyBuild(card,{root,app,games,pr:0,label:'测试版 · main＠abc1234 + #1312 #1326',refresh:{builder:'x.cjs'}});
 /* the tester's own settings, translation config and key vault come along; not the installed library (scan folders) or database */
 const cfg=path.join(root,'data','config');
 assert.equal(fs.readFileSync(path.join(cfg,'translation-profiles.json'),'utf8'),'{"provider":"deepseek"}');assert.equal(fs.readFileSync(path.join(cfg,'secrets.dpapi'),'utf8'),'vault');
 assert.ok(fs.existsSync(path.join(cfg,'account','profile.json')));assert.ok(fs.existsSync(path.join(root,'data','preferences.json')));
 assert.equal(fs.existsSync(path.join(cfg,'library.json')),false);assert.equal(fs.existsSync(path.join(root,'data','megulit.sqlite')),false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data','megulit-relocation.json'),'utf8')).root,root,'the marker names the test root, not the installed one');
 /* the shell reads this build's web\ only while hot-update.json names its exe */
 assert.match(JSON.parse(fs.readFileSync(path.join(root,'data','hot-update.json'),'utf8')).exe,/^\d+-\d+$/);
 /* one entry: 开始测试.cmd passes its arguments (a PR number) to test-start.cjs with the card folder's own node */
 assert.equal(path.basename(r.cmd),'开始测试.cmd');const cmd=fs.readFileSync(r.cmd,'utf8');assert.match(cmd,/test-start\.cjs/);assert.match(cmd,/%\*/);assert.match(cmd,/node\.exe/);assert.doesNotMatch(cmd,/[^\x00-\x7f]/,'the cmd stays ASCII');
 const j=JSON.parse(fs.readFileSync(path.join(card,'test-start.json'),'utf8'));assert.equal(j.root,root);assert.equal(j.label,'测试版 · main＠abc1234 + #1312 #1326');assert.deepEqual(Object.keys(j.games),['1312','1326']);assert.equal(j.games[1326].preAdd,false);
 assert.ok(fs.existsSync(path.join(card,'test-start.cjs')));});

test('combined test build: cards not done and green are taken in PR order; a feature card is not given a game under a folder name; the checks gate a PR',t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const All=require('../tools/megulit-adapter/test-build-all.cjs');
 put(path.join(d,'c1304.json'),JSON.stringify({id:'1304',title:'アイキス3 sexy',game:'X:\\a\\Aikiss3.exe'}));
 put(path.join(d,'c1303.json'),'\uFEFF'+JSON.stringify({id:'1303',title:'常轨脱离（ハミダシクリエイティブ）',game:'X:\\h\\hamidashi.exe'}));
 put(path.join(d,'c1326.json'),JSON.stringify({id:'1326',title:'游戏库显示作品名',game:'X:\\o\\ozmafia.exe'}));
 put(path.join(d,'c1320.json'),JSON.stringify({id:'1320',title:'首页大卡牌按压'}));
 put(path.join(d,'c1309.json'),JSON.stringify({id:'1309',title:'制服カノジョ3',game:'X:\\s\\S.exe',done:true}));
 const list=All.cards(d);assert.deepEqual(list.map(c=>c.pr),[1303,1304,1320,1326]);
 assert.equal(list[0].title,'ハミダシクリエイティブ');assert.equal(list[0].preAdd,true);assert.equal(list.find(c=>c.pr===1326).preAdd,false);assert.equal(list.find(c=>c.pr===1320).game,'');
 const view=state=>()=>({state:state.state,statusCheckRollup:state.checks});
 assert.equal(All.green(1,{view:view({state:'OPEN',checks:[{name:'a',conclusion:'SUCCESS'},{name:'b',conclusion:'SKIPPED'}]})}).ok,true);
 assert.match(All.green(1,{view:view({state:'OPEN',checks:[{name:'Tests (shard 2/3)',conclusion:'FAILURE'}]})}).why,/Tests \(shard 2\/3\)/);
 assert.equal(All.green(1,{view:view({state:'OPEN',checks:[{name:'a',status:'IN_PROGRESS'}]})}).ok,false,'a check still running is not green');
 assert.match(All.green(1,{view:view({state:'MERGED',checks:[]})}).why,/MERGED/);
 /* main or a PR moved -> a rebuild is due; a new card too */
 const dir=path.join(d,'all');put(path.join(dir,'integration.json'),JSON.stringify({built:{main:'m1',heads:{1303:'p1'},skipped:[]}}));
 const ls=out=>refs=>({status:0,stdout:out});
 assert.equal(All.moved(dir,{lsRemote:ls('m1\trefs/heads/main\np1\trefs/pull/1303/head\n'),cards:d}).due,true,'cards 1304 / 1320 / 1326 are new');
 fs.rmSync(d+'/c1304.json');fs.rmSync(d+'/c1320.json');fs.rmSync(d+'/c1326.json');
 assert.equal(All.moved(dir,{lsRemote:ls('m1\trefs/heads/main\np1\trefs/pull/1303/head\n')}).due,false);
 assert.match(All.moved(dir,{lsRemote:ls('m2\trefs/heads/main\np1\trefs/pull/1303/head\n')}).why,/main/);
 assert.match(All.moved(dir,{lsRemote:ls('m1\trefs/heads/main\np2\trefs/pull/1303/head\n')}).why,/#1303/);
 assert.equal(All.moved(dir,{lsRemote:()=>({status:1,stdout:''})}).due,false,'offline: the current build starts');});

test('test start: the installed MeguLit is asked to exit through its own command file (Alt+T freed), nothing killed',t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const TS=require('../tools/megulit-adapter/test-start.cjs');TS.askExit(d);
 const c=JSON.parse(fs.readFileSync(path.join(d,'cache','desktop-command.json'),'utf8'));assert.equal(c.command,'exit');assert.ok(c.nonce);
 assert.deepEqual(fs.readdirSync(path.join(d,'cache')),['desktop-command.json'],'written whole (no temp file left)');});

test('watch: finished game orders with an issue run once; baseline marks without running; one watch at a time',async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const q=path.join(d,'done'),state=path.join(d,'auto','watch-state.json');
 put(path.join(q,'a.json'),'\uFEFF'+JSON.stringify({name:'a',root:path.join(d,'dl'),issue:1,result:'ok'}));fs.mkdirSync(path.join(d,'dl','a'),{recursive:true});
 put(path.join(q,'tool.json'),JSON.stringify({name:'tool',issue:0,result:'ok'}));put(path.join(q,'bad.json'),JSON.stringify({name:'bad',issue:3,result:'blocked'}));
 const ran=[];const run=o=>{ran.push(o);return {exit:0,out:'ok'};};
 assert.equal(await Watch.main(['--queue',q,'--state',state],{log:()=>{},run}),0);
 assert.deepEqual(ran.map(o=>[o.name,o.issue,o.dir]),[['a',1,path.join(d,'dl','a')]]);
 const st=JSON.parse(fs.readFileSync(state,'utf8'));assert.equal(st.orders.a.exit,0);assert.match(st.orders.tool.skipped,/issue/);assert.match(st.orders.bad.skipped,/blocked/);
 await Watch.main(['--queue',q,'--state',state],{log:()=>{},run});assert.equal(ran.length,1,'an order runs once');
 put(path.join(q,'b.json'),JSON.stringify({name:'b',root:path.join(d,'dl'),issue:2,result:'ok'}));
 await Watch.main(['--queue',q,'--state',state,'--baseline'],{log:()=>{},run});assert.equal(ran.length,1);assert.equal(JSON.parse(fs.readFileSync(state,'utf8')).orders.b.baseline,true);
 /* a run cut off (running) is due again; a live second watch exits at once */
 const s2=JSON.parse(fs.readFileSync(state,'utf8'));s2.orders.a={running:true};fs.writeFileSync(state,JSON.stringify(s2));
 fs.writeFileSync(path.join(d,'auto','watch.lock'),String(process.pid));await Watch.main(['--queue',q,'--state',state],{log:()=>{},run});assert.equal(ran.length,1,'locked');
 fs.rmSync(path.join(d,'auto','watch.lock'));await Watch.main(['--queue',q,'--state',state],{log:()=>{},run});assert.equal(ran.length,2);assert.equal(ran[1].name,'a');});

test('install: a UDF disc read with 8.3 names never starts its Inno installer (it would wait on a disk prompt); UDF goes through the mount',async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const dl=path.join(d,'dl'),root=path.join(d,'copies');
 /* the ISO 9660 side of 制服カノジョ3's DVD: LAUNCHER.EXE beside LAUNCHER.BIN / LAUNCHE2.BIN, not Launcher-1.bin */
 put(path.join(dl,'disc','SEIFUKU3.mdf'),iso({'LAUNCHER.EXE':'MZ Inno Setup Setup Data (6.2.0)','LAUNCHER.BIN':'p1','LAUNCHE2.BIN':'p2'}));
 const ran=[];const r=await Install.install(dl,{short:'s3',root,deps:{statfs:()=>FREE,run:(exe,args)=>{ran.push(exe);return {status:0};},isUdf:()=>false,find}});
 assert.equal(r.ok,false);assert.match(r.why,/LAUNCHER-1\.bin/);assert.deepEqual(ran,[],'the installer is not run');
 /* a UDF image is read by the mount, which gives the long names: then the installer runs */
 const udf=Buffer.alloc(40*2048);udf.write('CD001',16*2048+1,'latin1');udf.write('BEA01',18*2048+1,'latin1');udf.write('NSR02',19*2048+1,'latin1');
 const f=path.join(d,'udf.mdf');fs.writeFileSync(f,udf);assert.equal(Install.isUdf(f),true);assert.equal(Install.isUdf(path.join(dl,'disc','SEIFUKU3.mdf')),false);
 const mounted=[];const mount=async(img,dest)=>{mounted.push(img);put(path.join(dest,'Launcher.exe'),'MZ Inno Setup Setup Data (6.2.0)');put(path.join(dest,'Launcher-1.bin'),'p1');};
 const run=(exe,args)=>{ran.push(path.basename(exe));put(path.join(args.find(a=>a.startsWith('/DIR=')).slice(5),'SEIFUKU3.exe'),'g');return {status:0};};
 const r2=await Install.install(dl,{short:'s3b',root,deps:{statfs:()=>FREE,run,isUdf:()=>true,mount,find}});
 assert.equal(r2.ok,true,r2.why);assert.equal(mounted.length,1);assert.deepEqual(ran,['Launcher.exe']);assert.match(r2.steps.join(),/UDF/);});
