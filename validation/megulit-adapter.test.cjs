// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter without a game: the engine rule table only claims what the code has, the plan picks the script
   reader / engine hide first, the questions and the seed status follow the answers, HANDOFF rows are read and written, the
   game lock queues, and the version layer of a patched exe is found by its prints only when the game asks for it. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Engines=require('../tools/megulit-adapter/engines.cjs'),Ident=require('../tools/megulit-adapter/identify.cjs');
const {plan}=require('../tools/megulit-adapter/plan.cjs'),Check=require('../tools/megulit-adapter/checkpoints.cjs');
const Adapter=require('../tools/megulit-adapter.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'megulit-adapter-'));
const REPO=path.join(__dirname,'..');

test('engines: every file a rule names exists, so the inventory never claims more than the code',()=>{
 for(const [id,r] of Object.entries(Engines.RULES)){const c=Engines.capabilities(id);
  assert.equal(c.draw.length,r.draw.length,id+' draw files');assert.equal(c.hide.length,r.hide.length,id+' hide files');
  for(const n of r.registry)assert.ok(require('../services/original-engines/registry.cjs').ENGINES.some(e=>e.name===n),id+': registry name '+n);}});
test('engines: KiriKiri reads with RRFZ\'s readers, aligns on the KAG DLL, hides at the source; an unknown engine is empty, not guessed',()=>{
 const k=Engines.capabilities('kirikiri');assert.ok(k.readers.includes('kirikiri-lang')&&k.readers.includes('kirikiri-cx'));
 assert.ok(k.hide.some(h=>/MeguLitDrawSkip\.h$/.test(h.file)));assert.ok(k.pairing.some(p=>/:patch$/.test(p)));
 assert.equal(Engines.capabilities('cs2').id,'catsystem2');
 const u=Engines.capabilities('nosuchengine');assert.equal(u.known,false);assert.deepEqual(u.readers,[]);
 assert.match(Engines.markdown([k]),/^\| 引擎 \| 剧本读取（RRFZ） \| 画字钩子 \| 引擎级隐藏 \| 汉化配对 \| seed \/ 默认设置 \|/);});

test('plan: a reader that read Japanese is the text source; the draw hook aligns; the engine hide comes first',()=>{
 const caps=Engines.capabilities('yuris');
 const p=plan({caps,probe:{step:'ok',detected:'yuris',lines:9000,japaneseLines:8000,chineseLines:0}});
 assert.deepEqual([p.source.kind,p.source.reader,p.align,p.pairing.mode,p.hide.kind],['script','yuris','draw-roles','script','engine']);
 assert.equal(plan({caps:Engines.capabilities('kirikiri'),probe:{step:'ok',detected:'kirikiri-cx',lines:54584,japaneseLines:53137,chineseLines:241}}).pairing.mode,'script','Han-only name lines are no Chinese build (千恋＊万花)');
 const z=plan({caps:Engines.capabilities('catsystem2'),probe:{step:'chinese-build',detected:'catsystem2',original:'layer',lines:9000,japaneseLines:7000,chineseLines:8800}});
 assert.equal(z.pairing.mode,'patch');assert.equal(z.source.original,'layer');
 const h=plan({caps:Engines.capabilities('artemis'),probe:{step:'decrypt-failed',detail:'artemis:KEY',detected:null}});
 assert.equal(h.source.kind,'hook');assert.equal(h.pairing.mode,'machine');assert.equal(h.hide.kind,'generic');assert.ok(h.notes.some(n=>/读取器/.test(n)));});

test('identify: HANDOFF 已适配的游戏 rows; the same VNDB id and release means done, an unknown release never does',()=>{
 const text='# x\n## 已适配的游戏\n\n| 游戏 | VNDB | 发行版 | 引擎 | 状态 | 谁 | PR / seed |\n|---|---|---|---|---|---|---|\n| 千恋＊万花 | v19073 | Steam 版 | KiriKiri | verified | a | kirikiri/senren-banka |\n| オルフレール | v15563 | 待补 | KiriKiri | 进行中 | b | PR #1 |\n\n## 进行中\n| a | b |\n';
 const rows=Ident.adaptedRows(text);assert.equal(rows.length,2);assert.equal(rows[0].vndb,'v19073');
 assert.equal(Ident.sameRelease(rows,'v19073','Steam版')[0].same,true);assert.equal(Ident.sameRelease(rows,'v19073','DL 版')[0].same,false);
 assert.equal(Ident.sameRelease(rows,'v15563','DL 版')[0].same,false);
 const row='| 新作 | v1 | DL 版 | X | verified | c | x/y |';const out=Adapter.addHandoffRow(text,row);
 assert.equal(Ident.adaptedRows(out).length,3);assert.ok(out.indexOf(row)<out.indexOf('## 进行中'));});

test('checkpoints: unknown work and release are asked; a pass asks for the dialogue and choice pictures; status follows the answers',()=>{
 const d=tmp(),run=path.join(d,'run');fs.mkdirSync(run);for(const f of ['shot-1-intro.jpg','shot-2-line-3.jpg','shot-3-line-15.jpg'])fs.writeFileSync(path.join(run,f),'x');
 const cold={verdict:'pass',checks:{choice:{measured:true,ok:true}},phases:[]};
 const qs=Check.questions({identity:{vndb:'',release:'',releaseGuess:'',adapted:[]},caps:{known:true},cold,coldOut:d});
 assert.deepEqual(qs.map(q=>q.id),['vndb','cn','release','lines','dialogue','choice']);
 assert.ok(qs.find(q=>q.id==='dialogue').evidence.every(f=>/line-\d+/.test(f)));
 assert.equal(Check.status({cold},{lines:'yes',dialogue:'yes',choice:'yes'}),'verified');assert.equal(Check.status({cold},{lines:'no',dialogue:'yes',choice:'yes'}),'skeleton','a line that does not change with the game is no verified seed');assert.equal(Check.status({cold},{dialogue:'no'}),'skeleton');assert.equal(Check.status({cold},{}),'');
 const fail={verdict:'fail',checks:{hidden:{measured:true,ok:false,detail:'leak 0'}}};
 assert.ok(Check.questions({identity:{vndb:'v1',release:'DL'},caps:{},cold:fail}).some(q=>q.id==='readmode'));
 assert.equal(Check.status({cold:fail},{readmode:'yes'}),'read');
 assert.ok(Check.questions({identity:{vndb:'v1',release:'DL',adapted:[{same:true,status:'verified',ref:'x'}]},caps:{}}).some(q=>q.id==='again'));
 assert.throws(()=>Check.parseAnswers(['vndb=19073']),/v<number>/);assert.deepEqual(Check.parseAnswers(['vndb=V19073','release=DL 版']),{vndb:'v19073',release:'DL 版'});
 const html=fs.readFileSync(Check.review(path.join(d,'review.html'),{title:'t',summary:['s']},qs,{vndb:'v1'}),'utf8');assert.match(html,/已答：v1/);assert.match(html,/run\/shot-3-line-15\.jpg/);});

test('version layer: a patched exe finds its build by prints only when the game asks (source.versionMatch prints); the default stays exe-only',()=>{
 const S=require('../core/profiles/seed.cjs'),D=require('../core/profiles/defaults.cjs'),Dom=require('../core/profiles/domains.cjs');
 assert.equal(D.source.versionMatch,'exe');assert.deepEqual(Dom.clean({source:{versionMatch:'prints'}}).rejected,[]);assert.deepEqual(Dom.clean({source:{versionMatch:'any'}}).rejected,['source.versionMatch']);
 const sha='a'.repeat(64),data='b'.repeat(64),versions=new Map([[sha,{key:sha,settings:{draw:{embed:true}}}]]);
 const s={versions,byPrint:new Map([['g|data|'+data,sha]])};
 assert.equal(S.versionFor({exeSha256:sha},s).match,'exe');
 assert.equal(S.versionFor({exeSha256:'c'.repeat(64),gameKey:'g',prints:{data}},s),null,'no fallback unless asked');
 assert.equal(S.versionFor({exeSha256:'c'.repeat(64),gameKey:'g',prints:{data},fallback:true},s).match,'data');
 assert.equal(S.versionFor({exeSha256:'c'.repeat(64),gameKey:'other',prints:{data},fallback:true},s),null,'only the matched game\'s builds');});
test('version layer: game.json ext.versionPrints is indexed for the versions the game lists only',()=>{
 const d=tmp(),sha='d'.repeat(64),slug='test-game',dir=path.join(d,'kirikiri',slug);fs.mkdirSync(path.join(dir,'versions'),{recursive:true});
 const ver={schema:'megulit.game-diff',version:1,key:sha,layer:'version',source:'official',settings:{draw:{embed:false}},exe:'g.exe',engine:'kirikiri'};
 const game={schema:'megulit.game-diff',version:1,key:'e'.repeat(64),layer:'game',source:'official',mode:'hide',settings:{source:{versionMatch:'prints'}},engine:'kirikiri',prints:{title:'f'.repeat(64)},status:'skeleton',slug,builds:[sha],ext:{versionPrints:{[sha]:{data:'1'.repeat(64),pe:'1.0.0.0@5f3a1b2c'},['9'.repeat(64)]:{data:'2'.repeat(64)}}}};
 fs.writeFileSync(path.join(dir,'versions',sha+'.json'),JSON.stringify(ver));fs.writeFileSync(path.join(dir,'game.json'),JSON.stringify(game));
 const s=S0().load(d);assert.deepEqual(s.errors,[]);assert.equal(s.byPrint.get(slug+'|data|'+'1'.repeat(64)),sha);assert.equal(s.byPrint.get(slug+'|pe|1.0.0.0@5f3a1b2c'),sha);assert.equal(s.byPrint.size,2);});
const S0=()=>require('../core/profiles/seed.cjs');

test('game-print dataPrint: the script sources of a reader, independent of the exe; empty when no reader names a file',()=>{
 const GP=require('../core/game-print.cjs'),d=tmp();fs.writeFileSync(path.join(d,'a.ks'),'*start\n「こんにちは」\n');
 const a=GP.dataPrint(d,['kirikiri-ks','kirikiri']);fs.writeFileSync(path.join(d,'game.exe'),'MZ patched');const b=GP.dataPrint(d,['kirikiri-ks','kirikiri']);
 assert.equal(a,b);assert.equal(GP.dataPrint(d,['nosuchreader']),'');});

test('game lock: a live lock queues, a stale one (20 min) is taken over, release removes only our own lock',async()=>{
 const d=tmp(),file=path.join(d,'.game.lock');fs.writeFileSync(file,'owner=other game=x started=now');
 assert.equal(await Adapter.gameLock('me','g',{file,waitMs:0}),null);
 const old=new Date(Date.now()-21*60000);fs.utimesSync(file,old,old);
 assert.equal(await Adapter.gameLock('me','g',{file,waitMs:0}),null,'a lock that never says refreshed= gets three hours');
 fs.writeFileSync(file,'owner=other game=x refreshed=then');fs.utimesSync(file,old,old);
 const release=await Adapter.gameLock('me','g',{file,waitMs:0});assert.ok(release);assert.match(fs.readFileSync(file,'utf8'),/^owner=me game=g refreshed=/);
 release();assert.equal(fs.existsSync(file),false);});

test('entry: one command line, the old adapt-auto is the cold stage behind it',()=>{
 const o=Adapter.parseRun(['node','x','E:/g','--vndb','v15563','--release','DL 版','--foreground','--answer','dialogue=yes']);
 assert.deepEqual([o.vndb,o.release,o.foreground,o.answers[0]],['v15563','DL 版',true,'dialogue=yes']);
 assert.throws(()=>Adapter.parseRun(['node','x','E:/g','--vndb','15563']),/v<number>/);
 assert.equal(fs.existsSync(path.join(REPO,'tools','adapt-auto.cjs')),false,'one entry: tools/megulit-adapter.cjs');
 const src=fs.readFileSync(path.join(REPO,'tools','megulit-adapter.cjs'),'utf8')+fs.readdirSync(path.join(REPO,'tools','megulit-adapter')).map(f=>fs.readFileSync(path.join(REPO,'tools','megulit-adapter',f),'utf8')).join('\n');
 assert.equal(/(^|[^:'"\\])\/\/(?!\s*SPDX)/m.test(src.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|\/[^/\n*][^/\n]*\/[a-z]*/g,'')),false,'no // comments');});

test('profileFor: a no-DVD exe of a seeded build gets its version layer low (seed-version~head) only when the game says prints',()=>{
 const d=tmp(),seedDir=path.join(d,'seed'),game=path.join(d,'game'),sha='a'.repeat(64),slug='adapter-fixture';fs.mkdirSync(game);
 const exe=path.join(game,'fixture.exe');fs.writeFileSync(exe,Buffer.concat([Buffer.from('MZ'),Buffer.alloc(70000,1)]));
 const GP=require('../core/game-print.cjs'),head=GP.headTail(exe,64<<10);
 const write=(versionMatch)=>{const dir=path.join(seedDir,'kirikiri',slug);fs.rmSync(seedDir,{recursive:true,force:true});fs.mkdirSync(path.join(dir,'versions'),{recursive:true});
  fs.writeFileSync(path.join(dir,'versions',sha+'.json'),JSON.stringify({schema:'megulit.game-diff',version:1,key:sha,layer:'version',source:'official',settings:{draw:{embed:true}},exe:'fixture.exe',engine:'kirikiri'}));
  fs.writeFileSync(path.join(dir,'game.json'),JSON.stringify({schema:'megulit.game-diff',version:1,key:'e'.repeat(64),layer:'game',source:'official',mode:'hide',settings:{source:{versionMatch}},engine:'kirikiri',prints:{title:GP.titleHash('Adapter Fixture')},status:'verified',slug,builds:[sha],match:{titles:['Adapter Fixture']},ext:{versionPrints:{[sha]:{head}}}}));};
 const P=require('../core/profiles/index.cjs'),old=process.env.MEGULIT_SEED_DIR;process.env.MEGULIT_SEED_DIR=seedDir;
 try{const input={engine:'kirikiri',exe,folder:game,title:'Adapter Fixture',exeSha256:'c'.repeat(64)};
  write('prints');P.reload();let p=P.profileFor(input);
  assert.equal(p.gameKey,slug);assert.equal(p.versionMatch,'head');assert.match(p.layers,/seed-version~head/);assert.equal(p.draw.embed,true,'the build\'s version keys reach the patched exe');
  write('exe');P.reload();p=P.profileFor(input);
  assert.equal(p.versionMatch,'');assert.doesNotMatch(p.layers,/seed-version/);assert.equal(p.draw.embed,false,'default: the exe hash only, as before');
  write('prints');P.reload();p=P.profileFor({...input,exeSha256:sha});
  assert.equal(p.versionMatch,'exe');assert.match(p.layers,/\+seed(\+|$)/);assert.doesNotMatch(p.layers,/seed-version~/);}
 finally{if(old===undefined)delete process.env.MEGULIT_SEED_DIR;else process.env.MEGULIT_SEED_DIR=old;P.reload();}});

test('publish text: the PR body has 问题 / 改动 / 验证 and names the work 「原名（中文名）」; the HANDOFF row has VNDB + release',()=>{
 const d=tmp(),seed=path.join(d,'seed','kirikiri','senren-banka');fs.mkdirSync(seed,{recursive:true});fs.writeFileSync(path.join(seed,'game.json'),JSON.stringify({status:'verified',slug:'senren-banka'}));
 const st={title:'千恋＊万花',engine:'kirikiri',seed,caps:{label:'KiriKiri'},answers:{cn:'千恋万花',release:'Steam 版',dialogue:'yes'},identity:{vndb:'v19073',prints:{}},foreground:false,
  plan:{source:{kind:'script',reader:'kirikiri-cx',japaneseLines:53137},align:'kag',pairing:{mode:'script',chineseLines:0},hide:{kind:'engine',file:'native/krkrtext/script.inc'},notes:[]},cold:{verdict:'pass',reasons:['原文隐藏：过']},questions:[{id:'dialogue',ask:'原文藏住了吗'}]};
 const body=Adapter.prBody(st);for(const h of ['## 问题','## 改动','## 验证'])assert.ok(body.includes(h),h);
 assert.match(body,/千恋＊万花（千恋万花）（VNDB v19073，Steam 版）/);assert.match(body,/原文藏住了吗 → yes/);assert.doesNotMatch(body,/[A-Za-z]:[\\/]/,'no local path');
 assert.equal(Adapter.handoffRow(st),'| 千恋＊万花 | v19073 | Steam 版 | KiriKiri | verified | 魚魚棟 · Claude | kirikiri/senren-banka（MeguLit-Adapter） |');});

test('samples: disc images ask for an install (soundtrack .cue beside .wav does not); a YU-RIS hide carries its choice caveat; a reader that failed to parse says so',()=>{
 const d=tmp();fs.mkdirSync(path.join(d,'pkg'));fs.writeFileSync(path.join(d,'pkg','Disc.iso'),'');fs.writeFileSync(path.join(d,'pkg','Disc.mds'),'');fs.mkdirSync(path.join(d,'ost'));fs.writeFileSync(path.join(d,'ost','a.cue'),'');fs.writeFileSync(path.join(d,'ost','a.wav'),'');
 assert.deepEqual(Adapter.discImages(d).map(f=>path.basename(f)).sort(),['Disc.iso','Disc.mds']);
 assert.equal(Check.questions({install:Adapter.discImages(d),identity:{vndb:'v1',cn:'-',release:'x'},caps:{}})[0].id,'install');
 const y=plan({caps:Engines.capabilities('yuris'),probe:{step:'parse-failed',detail:'yuris',detected:null}});
 assert.ok(y.notes.some(n=>/选项/.test(n)),'caveat shown');assert.ok(y.notes.some(n=>/读取器/.test(n)),'parse-failed is a reader gap');});

test('VNDB: a Steam appid names the release, one Japanese release is taken, several become the question; an error asks a person',async()=>{
 const d=tmp();fs.writeFileSync(path.join(d,'steam_appid.txt'),'1144400');
 const rel=(rid,title,o={})=>({rid,title,engine:'KiriKiri',langs:['ja'],patch:false,official:true,platforms:['win'],ext:{steam:'',dlsite:'',dmm:''},...o});
 const lookup=async()=>({vnid:'v19073',how:'title',zh:'千恋万花',releases:[rel('r45245','Senren * Banka - Package Edition'),rel('r49530','Senren * Banka - Download Edition'),rel('r52360','Senren * Banka',{ext:{steam:'1144400'}}),rel('r46927','Senren * Banka - Trial Edition')]});
 let v=await Ident.vndb({title:'千恋＊万花',gameDir:d,engine:'kirikiri'},{lookup});
 assert.deepEqual([v.vndb,v.cn,v.release,v.engineDiffers],['v19073','千恋万花','Steam 版（r52360）',false]);
 v=await Ident.vndb({title:'千恋＊万花',gameDir:tmp(),engine:'kirikiri'},{lookup});
 assert.equal(v.release,'');assert.deepEqual(v.candidates,['パッケージ版（r45245）','DL 版（r49530）','Senren * Banka（r52360）'],'no trial among them');
 assert.ok(Check.questions({identity:{vndb:'v19073',cn:'x',release:'',releaseCandidates:v.candidates},caps:{}}).find(q=>q.id==='release').ask.includes('DL 版（r49530）'));
 v=await Ident.vndb({title:'x',gameDir:tmp(),engine:'kirikiri'},{lookup:async()=>({vnid:'v1',how:'title',zh:'',releases:[rel('r1','Only',{engine:'Artemis Engine'})]})});
 assert.equal(v.release,'Only（r1）');assert.equal(v.engineDiffers,true,'VNDB says Artemis, we say KiriKiri');
 v=await Ident.vndb({title:'x',gameDir:tmp()},{lookup:async()=>{throw Error('METADATA_NETWORK');}});
 assert.deepEqual([v.vndb,v.release,v.error],['','','METADATA_NETWORK']);
 assert.ok(Check.questions({identity:{vndb:v.vndb,release:v.release},caps:{}}).some(q=>q.id==='vndb'));});

test('LunaHook: static checks name an engine only where the registry is silent; the runtime 「匹配到 X 引擎」 line is read from the hook diagnostics',()=>{
 const R=require('../services/original-engines/registry.cjs'),d=tmp();
 fs.writeFileSync(path.join(d,'game.exe'),'MZ');fs.mkdirSync(path.join(d,'windata'));fs.writeFileSync(path.join(d,'windata','script_body.bin'),'x');
 assert.ok(R.lunaHook(d).some(h=>h.cls==='_5pb_2'),'FILE target in a subfolder');assert.equal(R.engineOf(d),null,'the registry itself unchanged');
 const unknown=Engines.capabilities('');const c=Adapter.lunaCaps(unknown,d,'');assert.equal(c.id,'mages');assert.equal(c.luna,'_5pb_2');
 const named=Adapter.lunaCaps(Engines.capabilities('ddsystem'),d,'ddsystem');assert.equal(named.known,false,'a registry engine keeps its name');assert.match(named.luna,/_5pb_2/);
 assert.match(Check.questions({identity:{vndb:'v1',cn:'-',release:'x'},caps:named})[0].ask,/LunaHook 认为是 .*_5pb_2/);
 const e=tmp(),Cold=require('../tools/megulit-adapter/cold.cjs');fs.mkdirSync(path.join(e,'logs'));const t=new Date().toISOString().replace('Z','0000Z');
 fs.writeFileSync(path.join(e,'logs','hook-diagnostics.log'),t+' info 0 匹配到 Yuris 引擎\n');
 const diag=Cold.hookDiagnostics(e,{startedAt:t,endedAt:t},null);assert.equal(diag.lunaEngine,'Yuris');assert.equal(Engines.lunaRule(diag.lunaEngine),'yuris');
 const j=require('../services/original-engines/lunahook-fingerprints.json');assert.ok(j.rules.length>=150&&j.rules.every(r=>['FILE','FILE_ANY','FILE_ALL'].includes(r.check)&&r.targets.length));});

test('second opinion: GalTransl detect names the engine and the file to port; an extractor runs only with game + output folders; failures are notes, not stops',()=>{
 const S=require('../tools/megulit-adapter/second-opinion.cjs'),skill=tmp();fs.mkdirSync(path.join(skill,'python','engines'),{recursive:true});fs.writeFileSync(path.join(skill,'python','detect.py'),'');fs.writeFileSync(path.join(skill,'python','engines','yuris.py'),'');
 const out=tmp(),calls=[];
 const run=(py,args)=>{calls.push(args);if(args[0]==='-I')return {status:0,stdout:JSON.stringify({next_steps:[{engine:'yuris',strongest_evidence:'probe',matched_files:9,engine_page:'engines/yuris.md',extract_commands:['python -m python.engines.yuris_extract extract "<游戏目录>" "<输出目录>" --archive <剧本包相对路径>.ypf','python -m python.engines.yuris_extract extract "<游戏目录>" "<输出目录>" [--verify-edits]']}],candidates:{yuris:[{evidence:'YPF archive version 500'}]}}),stderr:''};
  const dest=args[args.indexOf('extract')+2];fs.mkdirSync(path.join(dest,'gt_input'),{recursive:true});fs.writeFileSync(path.join(dest,'gt_input','a.json'),JSON.stringify([{message:'「こんにちは」'},{name:'A',message:'はい'},{message:''}]));return {status:0,stdout:'',stderr:''};};
 const o=S.secondOpinion({gameDir:'G:/game',out,skill},{run});
 assert.equal(o.ok,true);assert.equal(o.port,'python/engines/yuris.py');assert.equal(o.extracted.lines,2,'two lines with text');
 assert.equal(calls.length,2,'the command that needs a script archive path is skipped');assert.ok(calls[1].includes('G:/game')&&calls[1].some(a=>a.startsWith(path.join(out,'external'))),'game folder in, output under out/external');
 assert.match(S.note(o),/yuris.*YPF archive version 500.*读出 2 句.*python\/engines\/yuris\.py/);
 assert.equal(S.secondOpinion({gameDir:'G:/game',out,skill:tmp()},{run}).error.length>0,true,'no skill: an error, not a throw');
 assert.equal(S.wanted({probe:{step:'ok'},caps:{known:true}}),false);assert.equal(S.wanted({probe:{step:'parse-failed'},caps:{known:true}}),true);});

test('own copy: goes under MEGULIT_ADAPTER_GAMES, never C: or E:, and only while 15 GB stay free; an existing copy is kept',()=>{
 const src=tmp(),root=tmp();fs.mkdirSync(path.join(src,'g'));fs.writeFileSync(path.join(src,'g','game.exe'),'MZ');
 const big={bavail:1,bsize:4096};const no='';assert.throws(()=>Adapter.copyGame(src,{root,statfs:()=>big,noDrives:no}),/15 GB must stay free/);
 const roomy={bavail:2**40/4096,bsize:4096};const c=Adapter.copyGame(src,{root,statfs:()=>roomy,noDrives:no});assert.equal(c.reused,false);assert.ok(fs.existsSync(path.join(c.dir,'g','game.exe')));
 assert.equal(Adapter.copyGame(src,{root,statfs:()=>big,noDrives:no}).reused,true);
 assert.throws(()=>Adapter.copyGame(src,{root:'E:\games',statfs:()=>roomy}),/never go to C: or E:/);});

test('entry defaults: VNDB and the second opinion are on, a copy is off; each switch turns its own one off',()=>{
 const d=Adapter.parseRun(['node','x','E:/g']);assert.deepEqual([d.net,d.external,d.copy,d.offline,d.foreground],[true,true,false,false,false]);
 const o=Adapter.parseRun(['node','x','E:/g','--no-net','--no-external','--copy']);assert.deepEqual([o.net,o.external,o.copy],[false,false,true]);});

test('Steam build: VNDB\'s one appid goes to the cold test; two appids (千恋＊万花) become the steam question',async()=>{
 const rel=(rid,steam)=>({rid,title:'Senren * Banka',engine:'KiriKiri',langs:['ja'],patch:false,official:true,platforms:['win'],ext:{steam,dlsite:'',dmm:''}});
 let v=await Ident.vndb({title:'x',gameDir:tmp()},{lookup:async()=>({vnid:'v1',how:'title',zh:'',releases:[rel('r1','1144400'),rel('r2','')]})});assert.equal(v.steamAppId,'1144400');
 v=await Ident.vndb({title:'x',gameDir:tmp()},{lookup:async()=>({vnid:'v1',how:'title',zh:'',releases:[rel('r1','1144400'),rel('r2','1221010')]})});assert.equal(v.steamAppId,'');assert.deepEqual(v.steamCandidates,['1144400','1221010']);
 const q=Check.questions({identity:{vndb:'v1',cn:'-',release:'x',steamCandidates:v.steamCandidates},caps:{},cold:{verdict:'inconclusive',stuck:'冷测试没开始：steam-appid-unknown'}});
 assert.deepEqual(q.map(x=>x.id),['steam']);assert.match(q[0].ask,/1144400、1221010/);
 assert.equal(Adapter.parseRun(['node','x','E:/g','--steam-appid','1144400']).steamAppId,'1144400');});

/* 2026-11-27 (owner: 不再用冷测试加 Cardinal 打分来验证适配，改成实机验证，RRFZ 的路子): the run is a live check a person looks at; Cardinal is an
   optional background supplement (--cold), never a gate. Before, a run without Cardinal stayed inconclusive and nobody was asked */
test('live check: without Cardinal a passing run asks the person about line changes, the hidden original and the choice',()=>{const A=require('../tools/megulit-adapter/cold.cjs');
 const cold={verdict:'pass',lines:34,restored:true},diff={ok:true,mode:'hide',cost:0,over:[]};
 const j=A.judge({cold,diff,card:null,live:true});assert.equal(j.verdict,'pass');assert.ok(j.reasons.some(r=>/Cardinal 没跑/.test(r)));
 const withCard=A.judge({cold,diff,card:{ok:true,errors:[],result:{lines:20,scores:{row:0.3,leak:0},applies:{}}},live:true});assert.equal(withCard.verdict,'pass','Cardinal scores never fail a live check');assert.ok(withCard.reasons.some(r=>/后台补充/.test(r)));
 assert.equal(A.judge({cold:{...cold,verdict:'fail',why:'hideVisible'},diff,card:null,live:true}).verdict,'fail','the run\'s own self-check still fails it');
 assert.equal(A.judge({cold,diff,card:null}).verdict,'inconclusive','the old cold + Cardinal path is unchanged');
 const d=tmp(),run=path.join(d,'run');fs.mkdirSync(run);for(const f of ['shot-2-line-3.jpg','shot-3-line-15.jpg'])fs.writeFileSync(path.join(run,f),'x');
 const live={verdict:'pass',checks:{},phases:[{name:'choice-try-1'}]};
 assert.deepEqual(Check.questions({identity:{vndb:'v1',release:'DL',cn:'-'},caps:{known:true},cold:live,coldOut:d}).map(q=>q.id),['lines','dialogue','choice'],'a choice the run reached is asked about without Cardinal');
 assert.deepEqual(Check.questions({identity:{vndb:'v1',release:'DL',cn:'-'},caps:{known:true},cold:{...live,phases:[]},coldOut:d}).map(q=>q.id),['lines','dialogue']);});
