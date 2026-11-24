// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const scenes=require('../services/original-engines/scenes.cjs');
function asb(items){const parts=[Buffer.from('ASB\0\0'),u32(items.length)];const str=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b,Buffer.from([0])]);};
 for(const it of items){if(it.label){parts.push(u32(1),str(it.label));continue;}parts.push(u32(0),str(it.cmd),u32(1),u32(Object.keys(it.a||{}).length));for(const [k,v] of Object.entries(it.a||{}))parts.push(str(k),str(v));}
 return Buffer.concat(parts);}
function u32(v){const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;}
function pf8(files){const names=Object.keys(files);let idx=[u32(names.length)];let size=4;for(const n of names)size+=4+Buffer.byteLength(n)+4+8;size+=4+8*names.length+8;
 let off=7+size;const data=[];const ents=[];for(const n of names){const nb=Buffer.from(n);ents.push(Buffer.concat([u32(nb.length),nb,u32(0),u32(off),u32(files[n].length)]));data.push(files[n]);off+=files[n].length;}
 const index=Buffer.concat([u32(names.length),...ents,u32(0),Buffer.alloc(8*names.length+8)]);const key=crypto.createHash('sha1').update(index).digest();
 const enc=data.map(b=>{const c=Buffer.from(b);for(let i=0;i<c.length;i++)c[i]^=key[i%20];return c;});
 const head=Buffer.alloc(7);head.write('pf8');head.writeUInt32LE(index.length,3);return Buffer.concat([head,index,...enc]);}
test('Artemis plain-text scenario/*.txt inside a pf8 archive',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'art-'));
 const txt='*start\r\n; comment\r\n[name 春香]\r\n「おはよう、今日はいい天気だね」[r]\r\nそう言って笑った。\r\n\r\n[sel_text text="右へ行く"]\r\n[bg file="a.png"]\r\n';
 fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['system\\readme.txt']:Buffer.from('not a scenario'),['scenario\\s01.txt']:Buffer.from(txt,'utf8')}));
 const list=scenes.ENGINES.artemis.scenes(dir);assert.deepStrictEqual(list.map(s=>s.name),['s01.txt']);
 const p=scenes.ENGINES.artemis.parse(list[0].read());
 assert.deepStrictEqual(p.lines,['「おはよう、今日はいい天気だね」\nそう言って笑った。','右へ行く']);
 fs.rmSync(dir,{recursive:true,force:true});});
test('Artemis compiled .asb: print runs, ruby base, sel_text',()=>{
 const b=asb([{label:'top'},{cmd:'name',a:{'0':'春香'}},{cmd:'print',a:{data:'今日は'}},{cmd:'ruby',a:{text:'いい'}},{cmd:'print',a:{data:'良い'}},{cmd:'/ruby'},{cmd:'print',a:{data:'天気だね'}},{cmd:'p'},{cmd:'sel_text',a:{text:'帰る'}}]);
 const p=scenes.ENGINES.artemis.parse(b);assert.deepStrictEqual(p.lines,['今日は良い天気だね','帰る']);});
test('Artemis Lua .ast still goes through parseAst',()=>{
 const p=scenes.ENGINES.artemis.parse(Buffer.from('astver = 2.0\nast = { block_00000 = { {"text"}, text = { "こんにちは" } } }','utf8'));assert.ok(p.lines.includes('こんにちは'));});
test('loose scenario/*.txt without Artemis evidence is not claimed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'art-'));fs.mkdirSync(path.join(dir,'scenario'));fs.writeFileSync(path.join(dir,'scenario','a.txt'),'あいう');
 assert.strictEqual(scenes.ENGINES.artemis.scenes(dir).length,0);fs.writeFileSync(path.join(dir,'scenario','main.iet'),'x');
 assert.strictEqual(scenes.ENGINES.artemis.scenes(dir).length,1);fs.rmSync(dir,{recursive:true,force:true});});

const JA_LINES=[
 '「おはよう、今日はいい天気だね」',
 'そう言って笑った。',
 '「これから学校へ行こうか」',
 '「うん、急がないと遅刻しちゃうよ」',
 '二人は駅に向かって歩き出した。',
 '「昨日見た映画、すごく面白かったね」',
];
const ZH_LINES=[
 '「早上好，今天天气真好啊」',
 '她这样说着笑了起来。',
 '「我们现在去学校吧」',
 '「嗯，不快点的话要迟到了」',
 '两人朝着车站的方向走了过去。',
 '「昨天看的电影真是太有趣了」',
];
function txtScene(lines){return '*start\r\n[name 春香]\r\n'+lines.map(l=>l+'\r\n').join('\r\n');}
function asbScene(lines){return asb([{label:'top'},...lines.flatMap(l=>[{cmd:'print',a:{data:l}},{cmd:'p'}])]);}
function mkGame(setup){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'art-under-')),root=fs.mkdtempSync(path.join(os.tmpdir(),'art-root-'));
 const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ');setup(dir);
 return {dir,root,exe,clean(){fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});}};
}

test('Artemis originalLines adopts underlying Japanese scenario/*.txt and .asb across .pfs overlays',()=>{
 const {probeGame}=require('../services/adapter-probe-core.cjs'),ot=require('../services/original-text.cjs');
 const ja=[],zh=[];for(let i=0;i<10;i++){ja.push(...JA_LINES);zh.push(...ZH_LINES);}
 // 1. pf8 scenario/*.txt overlay (root.pfs Japanese + root.pfs.010 Chinese, including case difference S01.TXT / s01.txt)
 const gTxt=mkGame(dir=>{
  fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['scenario\\S01.TXT']:Buffer.from(txtScene(ja),'utf8')}));
  fs.writeFileSync(path.join(dir,'root.pfs.010'),pf8({['scenario\\s01.txt']:Buffer.from(txtScene(zh),'utf8')}));
 });
 try{
  assert.deepStrictEqual(scenes.read('artemis',gTxt.dir).flatMap(s=>s.lines),zh);
  assert.deepStrictEqual(scenes.ENGINES.artemis.originalLines(gTxt.dir),ja);
  const r=probeGame({dir:gTxt.dir,executable:gTxt.exe,title:'t'},{budgetMs:30000});
  assert.strictEqual(r.step,'ok',JSON.stringify(r.engines));
  assert.strictEqual(r.detail,'artemis');
  assert.strictEqual(r.original,'layer');
  assert.strictEqual(r.japaneseLines,ja.length);
  const s=ot.scanRunning(gTxt.root,'art-txt',gTxt.exe);
  assert.strictEqual(s.status,'ready',JSON.stringify(s));
  assert.strictEqual(s.original?.auto,true);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(s.original.index,'utf8')).lines,ja);
 }finally{gTxt.clean();}
 // 2. pf8 compiled .asb overlay (root.pfs Japanese + root.pfs.010 Chinese)
 const gAsb=mkGame(dir=>{
  fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['scenario\\s01.asb']:asbScene(ja)}));
  fs.writeFileSync(path.join(dir,'root.pfs.010'),pf8({['scenario\\s01.asb']:asbScene(zh)}));
 });
 try{
  assert.deepStrictEqual(scenes.read('artemis',gAsb.dir).flatMap(s=>s.lines),zh);
  assert.deepStrictEqual(scenes.ENGINES.artemis.originalLines(gAsb.dir),ja);
  const r=probeGame({dir:gAsb.dir,executable:gAsb.exe,title:'t'},{budgetMs:30000});
  assert.strictEqual(r.step,'ok',JSON.stringify(r.engines));
  assert.strictEqual(r.detail,'artemis');
  assert.strictEqual(r.original,'layer');
  assert.strictEqual(r.japaneseLines,ja.length);
  const s=ot.scanRunning(gAsb.root,'art-asb',gAsb.exe);
  assert.strictEqual(s.status,'ready',JSON.stringify(s));
  assert.strictEqual(s.original?.auto,true);
 }finally{gAsb.clean();}
});

test('Artemis originalLines adopts underlying Japanese when loose scenario/*.txt or .asb overrides root.pfs',()=>{
 const {probeGame}=require('../services/adapter-probe-core.cjs'),ot=require('../services/original-text.cjs');
 const ja=[],zh=[];for(let i=0;i<10;i++){ja.push(...JA_LINES);zh.push(...ZH_LINES);}
 const gLooseTxt=mkGame(dir=>{
  fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['scenario\\s01.txt']:Buffer.from(txtScene(ja),'utf8')}));
  fs.mkdirSync(path.join(dir,'scenario'),{recursive:true});
  fs.writeFileSync(path.join(dir,'scenario','s01.txt'),Buffer.from(txtScene(zh),'utf8'));
 });
 try{
  assert.deepStrictEqual(scenes.ENGINES.artemis.originalLines(gLooseTxt.dir),ja);
  const r=probeGame({dir:gLooseTxt.dir,executable:gLooseTxt.exe,title:'t'},{budgetMs:30000});
  assert.strictEqual(r.step,'ok',JSON.stringify(r.engines));
  assert.strictEqual(r.original,'layer');
  assert.strictEqual(r.japaneseLines,ja.length);
  const s=ot.scanRunning(gLooseTxt.root,'art-ltxt',gLooseTxt.exe);
  assert.strictEqual(s.status,'ready',JSON.stringify(s));
  assert.strictEqual(s.original?.auto,true);
 }finally{gLooseTxt.clean();}
 const gLooseAsb=mkGame(dir=>{
  fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['scenario\\s01.asb']:asbScene(ja)}));
  fs.mkdirSync(path.join(dir,'scenario'),{recursive:true});
  fs.writeFileSync(path.join(dir,'scenario','s01.asb'),asbScene(zh));
 });
 try{
  assert.deepStrictEqual(scenes.ENGINES.artemis.originalLines(gLooseAsb.dir),ja);
  const r=probeGame({dir:gLooseAsb.dir,executable:gLooseAsb.exe,title:'t'},{budgetMs:30000});
  assert.strictEqual(r.step,'ok',JSON.stringify(r.engines));
  assert.strictEqual(r.original,'layer');
  assert.strictEqual(r.japaneseLines,ja.length);
  const s=ot.scanRunning(gLooseAsb.root,'art-lasb',gLooseAsb.exe);
  assert.strictEqual(s.status,'ready',JSON.stringify(s));
  assert.strictEqual(s.original?.auto,true);
 }finally{gLooseAsb.clean();}
});

test('Artemis single-layer Chinese/Japanese .txt/.asb and Chinese-over-Chinese packs do not mis-adopt originals',()=>{
 const {probeGame}=require('../services/adapter-probe-core.cjs'),ot=require('../services/original-text.cjs');
 const ja=[],zh=[];for(let i=0;i<10;i++){ja.push(...JA_LINES);zh.push(...ZH_LINES);}
 const gZhOnly=mkGame(dir=>{
  fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['scenario\\s01.txt']:Buffer.from(txtScene(zh),'utf8'),['scenario\\s02.asb']:asbScene(zh)}));
 });
 try{
  assert.strictEqual(scenes.ENGINES.artemis.originalLines(gZhOnly.dir),null);
  const r=probeGame({dir:gZhOnly.dir,executable:gZhOnly.exe,title:'t'},{budgetMs:30000});
  assert.strictEqual(r.step,'chinese-build');assert.strictEqual(r.original,null);
  const s=ot.scanRunning(gZhOnly.root,'art-zh',gZhOnly.exe);
  assert.strictEqual(s.status,'chinese-only');assert.ok(!s.original);
 }finally{gZhOnly.clean();}
 const gZhOverZh=mkGame(dir=>{
  fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['scenario\\s01.txt']:Buffer.from(txtScene(zh),'utf8')}));
  fs.writeFileSync(path.join(dir,'root.pfs.010'),pf8({['scenario\\s01.txt']:Buffer.from(txtScene(zh),'utf8')}));
 });
 try{
  assert.strictEqual(scenes.ENGINES.artemis.originalLines(gZhOverZh.dir),null);
  const r=probeGame({dir:gZhOverZh.dir,executable:gZhOverZh.exe,title:'t'},{budgetMs:30000});
  assert.strictEqual(r.step,'chinese-build');assert.strictEqual(r.original,null);
 }finally{gZhOverZh.clean();}
 const gJaOnly=mkGame(dir=>{
  fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['scenario\\s01.txt']:Buffer.from(txtScene(ja),'utf8'),['scenario\\s02.asb']:asbScene(ja)}));
 });
 try{
  assert.strictEqual(scenes.ENGINES.artemis.originalLines(gJaOnly.dir),null);
  const r=probeGame({dir:gJaOnly.dir,executable:gJaOnly.exe,title:'t'},{budgetMs:30000});
  assert.strictEqual(r.step,'ok');assert.strictEqual(r.original,null);assert.strictEqual(r.japaneseLines,ja.length*2);
 }finally{gJaOnly.clean();}
});

test('Artemis sources() and fingerprint track loose scenario/*.txt and .asb while keeping .pfs/.ast-only games identical',()=>{
 const ot=require('../services/original-text.cjs');
 const ja=[],zh=[];for(let i=0;i<10;i++){ja.push(...JA_LINES);zh.push(...ZH_LINES);}
 // Adding loose scenario/s01.txt next to root.pfs changes sources() and invalidates scanRunning cache
 const g=mkGame(dir=>{
  fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['scenario\\s01.txt']:Buffer.from(txtScene(ja),'utf8')}));
 });
 try{
  const srcBefore=scenes.ENGINES.artemis.sources(g.dir);
  assert.deepStrictEqual(srcBefore,[path.join(g.dir,'root.pfs')]);
  const fpBefore=scenes.fingerprint('artemis',g.dir);
  const sBefore=ot.scanRunning(g.root,'art-fp',g.exe);
  assert.strictEqual(sBefore.status,'native-japanese');
  fs.mkdirSync(path.join(g.dir,'scenario'),{recursive:true});
  const looseTxt=path.join(g.dir,'scenario','s01.txt');
  fs.writeFileSync(looseTxt,Buffer.from(txtScene(zh),'utf8'));
  const srcAfter=scenes.ENGINES.artemis.sources(g.dir);
  assert.deepStrictEqual(srcAfter,[path.join(g.dir,'root.pfs'),looseTxt]);
  assert.notStrictEqual(scenes.fingerprint('artemis',g.dir),fpBefore);
  const sAfter=ot.scanRunning(g.root,'art-fp',g.exe);
  assert.strictEqual(sAfter.status,'ready',JSON.stringify(sAfter));
  assert.strictEqual(sAfter.original?.auto,true);
 }finally{g.clean();}
 // Games with only .pfs or only .ast keep the exact same sources() as before; bare scenario/*.txt without Artemis evidence is still ignored
 const gAstOnly=mkGame(dir=>{
  fs.mkdirSync(path.join(dir,'scenario'),{recursive:true});
  fs.writeFileSync(path.join(dir,'scenario','s01.ast'),'astver = 2.0\nast = { text = { "こんにちは" } }\n');
  fs.writeFileSync(path.join(dir,'scenario','notes.txt'),'plain text without pfs or iet');
 });
 try{
  assert.deepStrictEqual(scenes.ENGINES.artemis.sources(gAstOnly.dir),[path.join(gAstOnly.dir,'scenario','s01.ast')]);
 }finally{gAstOnly.clean();}
});
