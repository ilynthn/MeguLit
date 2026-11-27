// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 MeguLit-Adapter, batch skeleton seeds (owner: RRFZ 一次 PR 加 32 部，每部只是认引擎、算 key、写骨架；批量骨架出来后打开就能用的
   要占大部分). One command over many game folders, offline (nothing is started; VNDB is asked unless --offline):

     node tools/megulit-adapter.cjs skeleton <folder>... [--scan <library root>]... [--queue <DeepSeek done folder>]... [--seed <The Seed>] [--out <dir>] [--offline]
                                             [--no-probe] [--no-craft] [--no-second-opinion] [--json]

   Per game, layered so that the cheap evidence decides most games and only the doubtful ones pay for more:
     1. locate + engine: the adapter's own (cold.locate: core/library findGame, the library registry, services/engine-fingerprint),
        the rule table (engines.cjs capabilities: readers, draw hooks, engine-level hides, the engine's defaults file)
     2. craft-anything static study (craft.cjs, a few seconds; MEGULIT_CRAFT_CLI): the engine words in the program and its text API
     3. the script probe (RRFZ's readers, services/adapter-probe-core.cjs, capped): does our reader read this game's script
     4. identity (identify.cjs): a repository seed that already matches -> skipped; VNDB (identify.vndb) for the work id, the
        Japanese and Chinese titles and the slug (VNDB's latin title)
     5. confidence: high = known engine with its hide and defaults, our reader reads Japanese lines, craft agrees, VNDB found;
        needs-look = engine unknown or only partly supported, craft names another engine, or the probe failed; else medium.
        needs-look games get GalTransl's second opinion (MEGULIT_GT_SKILL) as evidence for the person
   Every game that is located gets a skeleton seed in RRFZ's format (tools/diff-maker/seed-all.cjs seedOne: the profile values pinned,
   status skeleton, key = the relay's gidFor of the prints), plus ext.adapter {confidence, why, layers} and ext.versionPrints. The
   runtime self-check gate decides hide or read mode as for every skeleton. The list (<out>/skeleton.md + .json) says per game:
   written / skipped (seed exists) / not a game / engine unknown, the confidence, its reasons and the layers used. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const REPO=path.join(__dirname,'..','..');
const Cold=require('./cold.cjs'),Engines=require('./engines.cjs'),Ident=require('./identify.cjs');

const CONF={high:'高',medium:'中',look:'需重点看'};

/* the game folders under a library root: each child folder, and each folder a level deeper when the child holds no exe of its own
   (E:\gal\ISLAND\ISLAND). A folder with no exe anywhere four levels down is not a game */
function scanRoot(root){let kids=[];try{kids=fs.readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>path.join(root,d.name));}catch{return [];}
 return kids.filter(d=>!/^(?:\.|_|cache$|logs?$|runs$|tmp$|adapter-)/i.test(path.basename(d)));}

/* DeepSeek's finished download orders (F:\Agent\deepseek\queue\done\<name>.json: {name, task, root, result}): the folder
   <root>\<name> of each order that ended ok, and the VNDB id the order names ("VNDB v24"), which beats a title search */
function queueDirs(dir,hints){let names=[];try{names=fs.readdirSync(dir).filter(f=>/\.json$/i.test(f));}catch{return [];}const out=[];
 for(const n of names){let j;try{j=JSON.parse(fs.readFileSync(path.join(dir,n),'utf8').replace(/^\uFEFF/,''));}catch{continue;}
  if(j?.result!=='ok'||!j.root||!j.name)continue;const d=path.resolve(String(j.root),String(j.name));if(!fs.existsSync(d))continue;
  const v=/VNDB\s*[:：]?\s*(v\d{1,7})(?!\d)/i.exec(String(j.task||''));if(v)hints.set(d,v[1].toLowerCase());out.push(d);}
 return out;}

function lunaCaps(caps,gameDir,engine){if(caps.known)return caps;let hits=[];try{hits=require('../../services/original-engines/registry.cjs').lunaHook(gameDir);}catch{}
 const names=[...new Set(hits.map(h=>h.cls))];const mapped=names.find(n=>Engines.lunaRule(n));
 if(mapped&&!engine)return {...Engines.capabilities(Engines.lunaRule(mapped)),luna:mapped,lunaStatic:true};return names.length?{...caps,luna:names.join(' / ')}:caps;}

function craftOf(loc,caps,out,{craft}){if(craft===false)return null;let C;try{C=require('./craft.cjs');}catch{return null;}
 if(!process.env.MEGULIT_CRAFT_CLI)return null;
 try{const rep=C.study({gameDir:loc.gameDir,exe:loc.exe,out});if(!rep?.ok)return {ok:false,error:String(rep?.error||'craft failed').slice(0,120)};
  const s=C.suggest(rep,caps);return {ok:true,engine:s.engine,agrees:s.agrees,hide:s.hide,strong:s.strong,note:C.note(rep,s),ms:rep.ms};}
 catch(e){return {ok:false,error:String(e.message||e).slice(0,120)};}}

function probeOf(loc,title,{probe,probeMs}){if(probe===false)return null;
 try{const r=require('../../services/adapter-probe-core.cjs').probeGame({dir:loc.gameDir,executable:loc.exe,title},{budgetMs:probeMs});
  return {step:r.step,detected:r.detected||'',lines:r.lines|0,japaneseLines:r.japaneseLines|0,chineseLines:r.chineseLines|0};}
 catch(e){return {step:'error',detected:'',lines:0,japaneseLines:0,chineseLines:0,error:String(e.message||e).slice(0,120)};}}

/* the confidence of one game and why: only evidence, every reason a sentence the owner reads */
function confidence({caps,probe,craft,vndb}){const why=[],look=[],mid=[];
 if(!caps.known)look.push('引擎不在规则表（'+(caps.luna?'LunaHook 认出 '+caps.luna:'未知')+'）');
 else{if(!caps.defaults)mid.push('引擎没有默认设置文件');if(!caps.hide.length&&!caps.draw.length)look.push('引擎只有部分支持：没有引擎级隐藏也没有画字钩子');}
 if(craft?.ok&&craft.agrees===false)look.push('craft 认为是 '+(craft.engine||'别的引擎')+'，和规则表不一致');
 if(craft&&!craft.ok)mid.push('craft 没跑成（'+craft.error+'）');if(!craft)mid.push('没跑 craft');
 if(probe){if(probe.step==='error')look.push('剧本探针出错');else if(probe.japaneseLines>0)why.push('读出日文剧本 '+probe.japaneseLines+' 句');
  else if(probe.chineseLines>0)mid.push('只读出中文 '+probe.chineseLines+' 句（汉化版）');else mid.push('剧本读取器没读出台词（'+probe.step+'）');}
 else mid.push('没跑剧本探针');
 if(!vndb)mid.push('VNDB 没认出作品');
 if(caps.known)why.unshift('引擎 '+caps.label+(caps.hide.length?'，有引擎级隐藏':'')+(caps.defaults?'，有默认设置':''));
 if(craft?.ok&&craft.agrees)why.push('craft 也认出 '+(craft.engine||caps.id));
 const level=look.length?'look':mid.length?'medium':'high';return {level,why:[...look,...mid,...why]};}

/* the existing repository seed of the same work (VNDB id), when there is one */
function seedOfWork(vndb){if(!vndb)return null;try{return require('../../core/profiles/seed.cjs').seeds().games.find(g=>g.prints?.vndb===vndb)||null;}catch{return null;}}

async function one(dir,o){const t0=Date.now();const row={dir:path.basename(dir),state:'',title:'',engine:'',slug:'',confidence:'',why:[],layers:[],ms:0};
 const done=()=>{row.ms=Date.now()-t0;return row;};
 const triage=Cold.unsupported(dir);if(triage){row.state='not-game';row.why.push(triage);return done();}
 let loc=null;try{loc=Cold.locate(dir);}catch(e){row.why.push(String(e.message||e));}
 if(!loc){row.state='not-game';row.why.push('找不到主程序');return done();}
 /* MeguLit's own builds and tools sitting beside the games (testbuild-*, a copied app) are not games */
 if(/^(?:megulit|node|colddesk|hookbridge)/i.test(path.basename(loc.exe))){row.state='not-game';row.why.push('MeguLit 自己的程序（'+path.basename(loc.exe)+'）');return done();}
 row.layers.push('locate');
 /* a copy's own folder name says more than a generic install folder (seifuku3-tmpspace: installed) */
 let title=Cold.titleOf(dir);if(/^(?:installed?|install|game|data|bin|app|program|files?)$/i.test(title))title=path.basename(dir);row.title=title;row.exe=path.basename(loc.exe);
 /* the same program twice in one batch (a copy beside the original): one seed */
 const exeSha=crypto.createHash('sha256').update(fs.readFileSync(loc.exe)).digest('hex');const twin=o.seen.get(exeSha);
 if(twin){row.state='skip-seed';row.why.push('和 '+twin+' 是同一个程序，只出一份 seed');return done();}o.seen.set(exeSha,row.dir);
 let caps=lunaCaps(Engines.capabilities(loc.engine),loc.gameDir,loc.engine);if(caps.lunaStatic)loc.engine=caps.id;
 row.engine=caps.known?caps.id:(loc.engine||'');row.engineWhy=loc.why;
 const craft=craftOf(loc,caps,path.join(o.out,'craft',Cold.safeName(title)),o);if(craft)row.layers.push('craft');
 /* an engine only craft knows: taken when the rule table has it */
 if(!caps.known&&craft?.ok&&craft.engine){const c=Engines.capabilities(craft.engine);if(c.known){caps=c;row.engine=c.id;row.engineWhy='craft '+craft.engine;}}
 const pr=probeOf(loc,title,o);if(pr)row.layers.push('probe');row.probe=pr;
 const readers=[...new Set([pr?.detected,...caps.readers].filter(Boolean))];
 const id=Ident.identify({gameDir:loc.gameDir,exe:loc.exe,engine:row.engine,title,vndb:o.hints?.get(path.resolve(dir))||'',chineseBuild:pr?.step==='chinese-build',readers});row.layers.push('identify');
 if(id.seed){row.state='skip-seed';row.why.push('仓库已有 seed（'+id.seed.key+'，'+id.seed.status+'）');return done();}
 let v=null;if(!o.offline){try{v=await (o.vndbLookup||Ident.vndb)({title,gameDir:loc.gameDir,vnid:id.vndb,chineseBuild:pr?.step==='chinese-build',engine:row.engine});row.layers.push('vndb');}catch(e){row.why.push('VNDB 出错：'+e.message);}}
 const vndb=id.vndb||v?.vndb||'';row.vndb=vndb;
 const same=seedOfWork(vndb);if(same){row.state='skip-seed';row.why.push('同作品（'+vndb+'）已有 seed '+same.key+'：另一个版本请人看');return done();}
 if(!row.engine){row.state='no-engine';row.why.push('认不出引擎（'+loc.why+'）');}
 const c=confidence({caps,probe:pr,craft,vndb});row.confidence=c.level;row.why.push(...c.why);
 if(c.level==='look'&&o.secondOpinion!==false&&process.env.MEGULIT_GT_SKILL){try{const S=require('./second-opinion.cjs');const so=S.secondOpinion({gameDir:loc.gameDir,out:path.join(o.out,'second-opinion',Cold.safeName(title))});const n=S.note(so);if(n)row.why.push(n);row.layers.push('galtransl');}catch(e){row.why.push('GalTransl 第二意见出错：'+e.message);}}
 if(!row.engine)return done();
 /* the seed in RRFZ's format: seed-all's seedOne with this folder as the library record */
 const ja=v?.ja||title,slug=Ident.slugFrom(v?.ja?ja:title,v?.latin||v?.romaji||'')||'';/* the VNDB title, not the folder name, adds the edition words */
 const g={root:'',id:'skeleton:'+crypto.createHash('sha256').update(loc.exe.toLowerCase()).digest('hex').slice(0,16),title:ja,names:[v?.cn,title].filter(n=>n&&n!==ja),exe:loc.exe,steam:v?.steamAppId||'',vndb,engine:row.engine,lang:pr?.step==='chinese-build'?'':'ja',ot:null,...(slug?{slug}:{})};
 const SeedAll=require('../diff-maker/seed-all.cjs'),SeedFormat=require('../../core/profiles/seed.cjs');
 const r=await SeedAll.seedOne(g,new Map(),[],{out:path.join(o.out,'work'),seed:o.seed,ownerOk:new Set(),versionsWritten:o.versionsWritten});
 if(r.state==='skip'){row.state='skip';row.why.push(...r.look);return done();}
 row.slug=r.slug;row.name=r.name;row.state='written';row.layers.push('seed');
 /* the evidence goes with the seed: ext.adapter (who made it, how sure) and ext.versionPrints (a renamed or patched exe still finds it) */
 const file=path.join(o.seed,row.engine,r.slug,'game.json');const doc=JSON.parse(fs.readFileSync(file,'utf8'));
 const prints={};for(const k of ['head','pe','data','pack'])if(id.prints?.[k])prints[k]=id.prints[k];
 doc.ext={...(doc.ext||{}),adapter:{...(doc.ext?.adapter||{}),tool:'megulit-adapter skeleton',...(vndb?{vndb}:{}),...(v?.release?{release:v.release}:{}),confidence:c.level,why:c.why.slice(0,6),layers:row.layers.slice()},
  ...(exeSha&&Object.keys(prints).length?{versionPrints:{...(doc.ext?.versionPrints||{}),[exeSha]:prints}}:{})};
 const chk=SeedFormat.check(doc,{engine:row.engine,slug:r.slug});if(!chk.ok)throw Error('seed '+r.slug+': '+chk.errors.join('; '));
 fs.writeFileSync(file,JSON.stringify(doc,null,1)+'\n');
 return done();}

/* seeds written into a repository checkout (<repo>/The Seed): the bundled catalog snapshot follows, as the adapter's publish does
   (services/seed-catalog-engine-map.cjs: seedIds is the print of the seeded VNDB ids, validation/megulit-adapter.test.cjs checks it;
   counts are the works still without a seed, one less per newly seeded work) */
function catalogSnapshot(seedDir,rows){const repo=path.dirname(path.resolve(seedDir)),file=path.join(repo,'services','seed-catalog-engine-map.cjs');
 if(path.basename(path.resolve(seedDir))!=='The Seed'||!fs.existsSync(file))return '';
 let t=fs.readFileSync(file,'utf8');const before=t;
 for(const r of rows)if(r.state==='written'&&r.vndb&&r.engine)t=t.replace(new RegExp('(\\n\\s*'+r.engine.replace(/[^a-z0-9_]/gi,'')+':)(\\d+)'),(s,a,n)=>a+Math.max(0,Number(n)-1));
 if(t!==before)fs.writeFileSync(file,t);
 const changed=require('../megulit-adapter.cjs').refreshSeedIds(repo);return changed||(t!==before?path.relative(repo,file):'');}

/* the list: one row per game, the doubtful ones first (the owner tests those first) */
function report(rows){const order=['look','medium','high',''];const st={written:'已生成','skip-seed':'已有 seed，跳过','not-game':'不是游戏目录','no-engine':'认不出引擎',skip:'跳过'};
 const sorted=rows.slice().sort((a,b)=>(a.state==='written'?0:1)-(b.state==='written'?0:1)||order.indexOf(a.confidence)-order.indexOf(b.confidence)||a.dir.localeCompare(b.dir));
 const n=s=>rows.filter(r=>r.state===s).length,c=l=>rows.filter(r=>r.state==='written'&&r.confidence===l).length;
 const total=rows.reduce((a,r)=>a+r.ms,0);
 const lines=['# 批量骨架 seed 清单','',
  '共 '+rows.length+' 个目录，用时 '+(total/60000).toFixed(1)+' 分钟：已生成 '+n('written')+'（可信度 高 '+c('high')+' / 中 '+c('medium')+' / 需重点看 '+c('look')+'），已有 seed 跳过 '+n('skip-seed')+'，认不出引擎 '+n('no-engine')+'，不是游戏 '+n('not-game')+(n('skip')?'，其他跳过 '+n('skip'):''),'',
  '| 目录 | 结果 | 引擎 | slug | 可信度 | 依据 | 用了哪几层 | 用时 |','|---|---|---|---|---|---|---|---|',
  ...sorted.map(r=>'| '+[r.dir,st[r.state]||r.state,r.engine||'—',r.slug||'—',CONF[r.confidence]||'—',r.why.slice(0,4).join('；')||'—',r.layers.join(' → ')||'—',(r.ms/1000).toFixed(1)+' s'].map(x=>String(x).replace(/\|/g,'¦')).join(' | ')+' |')];
 return lines.join('\n')+'\n';}

function parse(argv){const o={dirs:[],scan:[],queue:[],seed:path.join(REPO,'The Seed'),out:'',offline:false,probe:true,craft:true,secondOpinion:true,probeMs:20000,json:false};
 for(let i=0;i<argv.length;i++){const k=argv[i],v=()=>{if(i+1>=argv.length)throw Error(k+' needs a value');return argv[++i];};
  if(k==='--scan')o.scan.push(v());else if(k==='--queue')o.queue.push(v());else if(k==='--seed')o.seed=v();else if(k==='--out')o.out=v();else if(k==='--probe-ms')o.probeMs=Number(v());
  else if(k==='--offline')o.offline=true;else if(k==='--no-probe')o.probe=false;else if(k==='--no-craft')o.craft=false;else if(k==='--no-second-opinion')o.secondOpinion=false;else if(k==='--json')o.json=true;
  else if(!k.startsWith('--'))o.dirs.push(k);else throw Error('unknown argument: '+k);}
 if(!o.dirs.length&&!o.scan.length&&!o.queue.length)throw Error('usage: node tools/megulit-adapter.cjs skeleton <folder>... [--scan <library root>]... [--seed <dir>] [--out <dir>] [--offline]');
 o.out=o.out||path.join(process.env.MEGULIT_ADAPTER_OUT||path.join(Cold.RUNS_ROOT,'adapter-out'),'skeleton');return o;}

async function run(o,{log=console.log}={}){fs.mkdirSync(o.out,{recursive:true});o.versionsWritten=o.versionsWritten||new Map();o.seen=new Map();
 o.hints=o.hints||new Map();const fromQueue=(o.queue||[]).flatMap(q=>queueDirs(q,o.hints));
 const dirs=[...o.dirs.map(d=>path.resolve(d)),...o.scan.flatMap(r=>scanRoot(path.resolve(r))),...fromQueue];const rows=[];
 for(const d of [...new Set(dirs)]){let r;try{r=await one(d,o);}catch(e){r={dir:path.basename(d),state:'skip',why:['出错：'+String(e.message||e).slice(0,160)],layers:[],ms:0};}
  rows.push(r);log('# '+r.dir+': '+r.state+(r.engine?' '+r.engine:'')+(r.confidence?' '+CONF[r.confidence]:'')+' ('+(r.ms/1000).toFixed(1)+' s)');}
 const snap=catalogSnapshot(o.seed,rows);if(snap)log('# catalog snapshot updated: '+snap);
 const md=report(rows);fs.writeFileSync(path.join(o.out,'skeleton.md'),md);fs.writeFileSync(path.join(o.out,'skeleton.json'),JSON.stringify(rows,null,1));
 log(o.json?JSON.stringify(rows,null,1):md);return rows;}

async function main(argv){const rows=await run(parse(argv));return rows.some(r=>r.state==='written')?0:2;}
module.exports={main,run,parse,one,confidence,report,scanRoot,queueDirs,catalogSnapshot,CONF};
