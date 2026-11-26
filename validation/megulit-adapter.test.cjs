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
 assert.deepEqual(qs.map(q=>q.id),['vndb','release','dialogue','choice']);
 assert.ok(qs.find(q=>q.id==='dialogue').evidence.every(f=>/line-\d+/.test(f)));
 assert.equal(Check.status({cold},{dialogue:'yes',choice:'yes'}),'verified');assert.equal(Check.status({cold},{dialogue:'no'}),'skeleton');assert.equal(Check.status({cold},{}),'');
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
 const d=tmp(),file=path.join(d,'.game.lock');fs.writeFileSync(file,'owner=other game=x refreshed=now');
 assert.equal(await Adapter.gameLock('me','g',{file,waitMs:0}),null);
 const old=new Date(Date.now()-21*60000);fs.utimesSync(file,old,old);
 const release=await Adapter.gameLock('me','g',{file,waitMs:0});assert.ok(release);assert.match(fs.readFileSync(file,'utf8'),/^owner=me game=g refreshed=/);
 release();assert.equal(fs.existsSync(file),false);});

test('entry: one command line, the old adapt-auto is the cold stage behind it',()=>{
 const o=Adapter.parseRun(['node','x','E:/g','--vndb','v15563','--release','DL 版','--foreground','--answer','dialogue=yes']);
 assert.deepEqual([o.vndb,o.release,o.foreground,o.answers[0]],['v15563','DL 版',true,'dialogue=yes']);
 assert.throws(()=>Adapter.parseRun(['node','x','E:/g','--vndb','15563']),/v<number>/);
 assert.equal(fs.existsSync(path.join(REPO,'tools','adapt-auto.cjs')),false,'one entry: tools/megulit-adapter.cjs');
 const src=fs.readFileSync(path.join(REPO,'tools','megulit-adapter.cjs'),'utf8')+fs.readdirSync(path.join(REPO,'tools','megulit-adapter')).map(f=>fs.readFileSync(path.join(REPO,'tools','megulit-adapter',f),'utf8')).join('\n');
 assert.equal(/(^|[^:'"\\])\/\/(?!\s*SPDX)/m.test(src.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|\/[^/\n*][^/\n]*\/[a-z]*/g,'')),false,'no // comments');});
