// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* tools/megulit-adapter/skeleton.cjs: a batch of folders -> skeleton seeds in RRFZ's format + the confidence list. Synthetic
   folders only (an exe stub and an XP3 header), no game files; the seeds go to a temporary The Seed. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-skeleton-'));
process.env.MEGULIT_ROOT=path.join(tmp,'root');process.env.MEGULIT_WORK=path.join(tmp,'work');
fs.mkdirSync(process.env.MEGULIT_ROOT,{recursive:true});
const Skeleton=require('../tools/megulit-adapter/skeleton.cjs');
const SeedFormat=require('../core/profiles/seed.cjs');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

const XP3=Buffer.from([0x58,0x50,0x33,0x0d,0x0a,0x20,0x0a,0x1a,0x8b,0x67,0x01]);
function game(root,name,files){const d=path.join(root,name);fs.mkdirSync(d,{recursive:true});for(const [f,b] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(d,f)),{recursive:true});fs.writeFileSync(path.join(d,f),b);}return d;}
const exe=()=>{const b=Buffer.alloc(256*1024);/* core/library mainExe skips files under 200 KB */b.write('MZ',0,'latin1');b.write('TVP(KIRIKIRI) Z core / Scripting Platform for Win32',512,'latin1');return b;};

test('a library root: KiriKiri game -> a valid skeleton seed; a folder without exe and a MeguLit build are listed, not seeded',async()=>{
 const lib=path.join(tmp,'lib'),seed=path.join(tmp,'The Seed'),out=path.join(tmp,'out');
 game(lib,'MyKrkrGame',{'game.exe':exe(),'data.xp3':Buffer.concat([XP3,Buffer.alloc(64)])});
 game(lib,'Soundtrack',{'01.flac':Buffer.alloc(16)});
 game(lib,'testbuild-x',{'MeguLit.exe':exe()});
 const vndbLookup=async()=>({vndb:'v9999991',ja:'テストゲーム',cn:'测试游戏',latin:'Test Game',romaji:'Test Game',release:'DL 版（r1）',steamAppId:''});
 const rows=await Skeleton.run({dirs:[],scan:[lib],seed,out,offline:false,vndbLookup,probe:false,craft:false,secondOpinion:false},{log:()=>{}});
 const by=Object.fromEntries(rows.map(r=>[r.dir,r]));
 assert.equal(by.MyKrkrGame.state,'written',JSON.stringify(by.MyKrkrGame));
 assert.equal(by.MyKrkrGame.engine,'kirikiri');
 assert.equal(by.MyKrkrGame.slug,'test-game');
 assert.equal(by.Soundtrack.state,'not-game');
 assert.equal(by['testbuild-x'].state,'not-game');
 const g=JSON.parse(fs.readFileSync(path.join(seed,'kirikiri','test-game','game.json'),'utf8'));
 assert.ok(SeedFormat.check(g,{engine:'kirikiri',slug:'test-game'}).ok);
 assert.equal(g.status,'skeleton');
 assert.equal(g.layer,'game');
 assert.match(g.key,/^[0-9a-f]{64}$/);
 assert.equal(g.prints.vndb,'v9999991');
 assert.ok(g.settings.hide&&g.settings.choice,'profile values are pinned like RRFZ\'s skeletons');
 assert.equal(g.ext.adapter.vndb,'v9999991');
 assert.ok(['high','medium','look'].includes(g.ext.adapter.confidence));
 const exeSha=g.builds[0];
 const v=JSON.parse(fs.readFileSync(path.join(seed,'kirikiri','test-game','versions',exeSha+'.json'),'utf8'));
 assert.equal(v.layer,'version');assert.equal(v.prints.exe,exeSha);
 const md=fs.readFileSync(path.join(out,'skeleton.md'),'utf8');
 assert.match(md,/已生成 1/);assert.match(md,/不是游戏 2/);
});

test('confidence: evidence decides the tier',()=>{
 const caps={known:true,id:'kirikiri',label:'KiriKiri',defaults:true,hide:[{}],draw:[],readers:['kirikiri']};
 assert.equal(Skeleton.confidence({caps,probe:{step:'ok',japaneseLines:900},craft:{ok:true,agrees:true,engine:'kirikiri'},vndb:'v1'}).level,'high');
 assert.equal(Skeleton.confidence({caps,probe:{step:'none',japaneseLines:0,chineseLines:0},craft:{ok:true,agrees:true},vndb:'v1'}).level,'medium');
 assert.equal(Skeleton.confidence({caps,probe:{step:'ok',japaneseLines:900},craft:{ok:true,agrees:false,engine:'yuris'},vndb:'v1'}).level,'look');
 assert.equal(Skeleton.confidence({caps:{known:false,hide:[],draw:[]},probe:null,craft:null,vndb:''}).level,'look');
 assert.equal(Skeleton.confidence({caps:{...caps,hide:[],draw:[]},probe:{step:'ok',japaneseLines:5},craft:{ok:true,agrees:true},vndb:'v1'}).level,'look');
});

test('DeepSeek done orders: the folder of each ok order and the VNDB id its task names',()=>{
 const q=path.join(tmp,'queue'),root=path.join(tmp,'dl');fs.mkdirSync(q,{recursive:true});
 for(const n of ['a','b','c'])fs.mkdirSync(path.join(root,n),{recursive:true});
 fs.writeFileSync(path.join(q,'a.json'),'﻿'+JSON.stringify({name:'a',root,result:'ok',task:'某作（RealLive，VNDB v1413），Windows 日文原版'}));
 fs.writeFileSync(path.join(q,'b.json'),JSON.stringify({name:'b',root,result:'ok',task:'没有作品号'}));
 fs.writeFileSync(path.join(q,'c.json'),JSON.stringify({name:'c',root,result:'failed',task:'VNDB v2'}));
 const hints=new Map();const dirs=Skeleton.queueDirs(q,hints);
 assert.deepEqual(dirs.map(d=>path.basename(d)).sort(),['a','b']);
 assert.equal(hints.get(path.join(root,'a')),'v1413');
 assert.equal(hints.has(path.join(root,'b')),false);
});

test('seeds written into a checkout: one work less per newly seeded engine in the catalog snapshot',()=>{
 const repo=path.join(tmp,'repo');fs.mkdirSync(path.join(repo,'The Seed'),{recursive:true});fs.mkdirSync(path.join(repo,'services'),{recursive:true});
 const file=path.join(repo,'services','seed-catalog-engine-map.cjs');
 fs.writeFileSync(file,"const engines={\r\n reallive:{name:'RealLive',vndb:['RealLive']},\r\n};\r\nconst snapshot={\r\n counts:{\r\n  reallive:128,\r\n  nscripter:1445,\r\n },\r\n};\r\n");
 Skeleton.catalogSnapshot(path.join(repo,'The Seed'),[{state:'written',engine:'reallive',vndb:'v1413'},{state:'skip-seed',engine:'nscripter',vndb:'v24'},{state:'written',engine:'reallive',vndb:''}]);
 const t=fs.readFileSync(file,'utf8');
 assert.match(t,/reallive:127,/);assert.match(t,/nscripter:1445,/);assert.match(t,/reallive:\{name/);
});
