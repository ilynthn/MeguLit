// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #1143 (QQ, euphoria HDリマスター): the first screen after 最初から始める is a choice (オープニングを見る / メインルームへ), drawn on the
   YU-RIS2 and YU-RIS streams before any dialogue. HookBridge auto-selected YU-RIS2 as the dialogue stream, the two options went
   out as one dialogue line (each drawn twice) and the choice detector dropped both as part of that line: OCR was never asked.
   The HD build's version seed sets source.autoSelectSkip so those streams stay auxiliary; the dialogue stream is YU-RIS6.
   Recordings: validation/helpers/choice-replay/euphoria-hd-before.jsonl (live, old bridge) and euphoria-hd.jsonl (live, fixed bridge). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../core/profiles/index.cjs'),Seed=require('../core/profiles/seed.cjs'),{HookNative}=require('../core/hook-native.cjs');
const {replay}=require('./helpers/hook-replay.cjs');
const HD='e77a11486b6d94a42f9d7d39fd768b4e763f163b977d3eaed94cf9e13217f995',SD='d30b992fc56a9e7ae8c3235664e929cd47eeaaa12ad74f8ddf8b7e15dec3184d';
const dir=path.join(__dirname,'helpers','choice-replay');
const OPTIONS=['オープニングを見る','メインルームへ'];
const profile=sha=>P.profileFor({exe:'D:/games/euphoria/euphoriaHD.exe',exeSha256:sha,engine:'YU-RIS',title:'euphoria HDリマスター'});

test('the euphoria HD build seed keeps YU-RIS2 / YU-RIS from being taken as the dialogue stream; other builds keep the kernel default',()=>{
 assert.deepEqual(Seed.load().errors,[]);
 assert.equal(Seed.versionOf(HD).game,'euphoria');
 assert.deepEqual(profile(HD).source.autoSelectSkip,['^YU-RIS2?$']);
 assert.deepEqual(profile(SD).source.autoSelectSkip,[],'the 2011 euphoria.exe build is unchanged');
 assert.deepEqual(profile('').source.autoSelectSkip,[],'no exe hash, no version layer');
 assert.deepEqual(P.profileFor({engine:'YU-RIS',exe:'D:/x/ysbin.exe',title:'other'}).source.autoSelectSkip,[]);
 const skip=profile(HD).source.autoSelectSkip.map(s=>new RegExp(s));
 for(const name of ['YU-RIS','YU-RIS2'])assert.ok(skip.some(r=>r.test(name)),name);
 for(const name of ['YU-RIS6','yuris7','yuris8','yuris9','EmbedYURIS6'])assert.ok(!skip.some(r=>r.test(name)),name);
});

test('HookBridge gets the list only when the profile sets it',()=>{
 const bp=p=>HookNative.prototype.bridgeProfile.call({profile:p});
 assert.deepEqual(bp(profile(HD)).autoSelectSkip,['^YU-RIS2?$']);
 assert.equal('autoSelectSkip' in bp(profile(SD)),false);
 assert.equal('autoSelectSkip' in bp(P.profileFor({})),false);
 const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.match(cs,/d\.TryGetValue\("autoSelectSkip",out av\)\?AutoSelectSkipFrom\(av\)/,'ApplyProfile reads the list (absent = none)');
 assert.match(cs,/&&!AutoSkipped\(c\.name\)&&!AutoSelectSkipped\(c\.name\)/,'auto-select passes a skipped stream by');
 assert.match(cs,/other=\(Selected!=""&&tp\.Key\(\)!=Selected\|\|Selected==""&&AutoSelectSkipped\(name\)\)/,'a skipped stream is auxiliary before any dialogue stream');
 assert.match(cs,/Resume!=null&&!AutoSelectSkipped\(name\)/,'a remembered skipped stream is not resumed');
});

test('the shared domain takes the key only as a short RegExp list on the version layer',()=>{
 const {clean}=require('../core/profiles/domains.cjs');
 assert.deepEqual(clean({source:{autoSelectSkip:['^YU-RIS2?$']}}).rejected,[]);
 assert.notDeepEqual(clean({source:{autoSelectSkip:['x'.repeat(101)]}}).rejected,[]);
 const src=fs.readFileSync(path.join(__dirname,'..','core','profiles','domains.cjs'),'utf8');
 assert.match(src,/'source\.autoSelectSkip':\{regexList:\{max:16,chars:100\},layer:'version'\}/);
});

test('live recording: the old bridge sent the options as a dialogue line; the reader takes that line back and asks OCR for the options (every engine); the fixed bridge never sends it',()=>{
 const before=replay(path.join(dir,'euphoria-hd-before.jsonl'),{name:'euphoriaHD.exe'});
 assert.ok(before.traces.some(s=>/^choice aux YU-RIS role=0 added=\[\]/.test(s)),'the pieces first look like part of the line');
 assert.ok(before.traces.some(s=>s.startsWith('choice frame taken back from the dialogue')),before.traces.filter(s=>/choice/.test(s)).join('\n'));
 assert.ok(before.locates.some(l=>OPTIONS.every(o=>l.options.includes(o))),JSON.stringify(before.locates));
 assert.ok(before.events.some(e=>e&&e.hookSource===''&&e.hookSourceOrigin==='choice-frame'),'the line is taken off the reader');
 const after=replay(path.join(dir,'euphoria-hd.jsonl'),{name:'euphoriaHD.exe'});
 assert.ok(after.locates.some(l=>OPTIONS.every(o=>l.options.includes(o))),JSON.stringify(after.locates));
});

test('live run: the art scan reading the two options after they were located is the choice, not a new dialogue line that clears it',t=>{
 const os=require('node:os'),file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'euphoria-hd-')),'run.jsonl');t.after(()=>fs.rmSync(path.dirname(file),{recursive:true,force:true}));
 const rows=fs.readFileSync(path.join(dir,'euphoria-hd.jsonl'),'utf8').trim().split(/\r?\n/);
 const t0=JSON.parse(rows[0]).t;
 rows.push(JSON.stringify({t:t0+1550,m:{type:'hookChoiceBoxes',serial:1,sw:1024,sh:768,status:'found',missed:[],rows:['オ ー プ ニ ン グ を 見 る','メ イ ン ル ー ム へ'],items:[{text:OPTIONS[0],x0:404,y0:226,x1:616,y1:250},{text:OPTIONS[1],x0:430,y0:323,x1:594,y1:345}]}}));
 rows.push(JSON.stringify({t:t0+1600,m:{type:'artText',source:'ocr',id:7001,visible:true,text:OPTIONS.join('\n'),sw:1024,sh:768,others:2,rows:[{text:OPTIONS[0],x:404,y:226,w:212,h:24},{text:OPTIONS[1],x:430,y:323,w:164,h:22}]}}));
 /* the next choice of the same run: a misreading of the background ten seconds later */
 rows.push(JSON.stringify({t:t0+11600,m:{type:'artText',source:'ocr',id:7002,visible:true,text:')第に',sw:1024,sh:768,others:0,rows:[{text:')第に',x:520,y:600,w:60,h:24}]}}));
 fs.writeFileSync(file,rows.join('\n')+'\n');
 const r=replay(file,{name:'euphoriaHD.exe'});
 assert.ok(r.traces.some(s=>/^ocr line refused \(the choice on screen\)/.test(s)),r.traces.filter(s=>/ocr|choice/.test(s)).join('\n'));
 assert.ok(r.traces.some(s=>s.startsWith('ocr line refused (a choice is on screen) ")第に"')),r.traces.filter(s=>/ocr|choice/.test(s)).join('\n'));
 assert.equal(r.traces.some(s=>/choice cleared/.test(s)),false);
 const last=r.shown.filter(Boolean).pop();
 assert.deepEqual(last?.items.map(i=>i.text),OPTIONS);
});

test('title menu: one-row OCR groups stacked like a menu are refused together, never joined into a line',t=>{
 const os=require('node:os'),file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'euphoria-hd-title-')),'run.jsonl');t.after(()=>fs.rmSync(path.dirname(file),{recursive:true,force:true}));
 const t0=1795000000000,items=[['・`最初から始める',737,395,163,24],['続きから始める',740,451,160,24],['おまけ',826,507,74,24]];
 const rows=items.map(([text,x,y,w,h],i)=>JSON.stringify({t:t0+i,m:{type:'artText',source:'ocr',id:8000+i,visible:true,text,sw:1024,sh:768,others:0,rows:[{text,x,y,w,h}]}}));
 fs.writeFileSync(file,rows.join('\n')+'\n');
 const r=replay(file,{name:'euphoriaHD.exe'});
 assert.ok(r.traces.some(s=>s.startsWith('ocr lines refused (a list across 3 groups)')),r.traces.filter(s=>/ocr/.test(s)).join('\n'));
 assert.equal(r.events.some(e=>typeof e?.hookSource==='string'&&/始める/.test(e.hookSource)),false);
});

test('a sentence the scan reads alone is still a line (the cross-group rule needs a stacked list)',t=>{
 const os=require('node:os'),file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'euphoria-hd-notice-')),'run.jsonl');t.after(()=>fs.rmSync(path.dirname(file),{recursive:true,force:true}));
 const text='このゲームには暴力シーンやグロテスクな表現、ショッキングな演出が含まれています。';
 fs.writeFileSync(file,JSON.stringify({t:1795000000000,m:{type:'artText',source:'ocr',id:8100,visible:true,text,sw:1024,sh:768,others:0,rows:[{text,x:120,y:360,w:780,h:26}]}})+'\n');
 const r=replay(file,{name:'euphoriaHD.exe'});
 assert.ok(r.traces.some(s=>s.startsWith('ocr line "このゲームには')),r.traces.filter(s=>/ocr/.test(s)).join('\n'));
});

test('Ctrl held (live recording): YU-RIS keeps the last sentences of a merged fast-forward text, other engines keep it whole',()=>{
 const file=path.join(dir,'euphoria-hd-skip.jsonl');
 const lines=r=>r.traces.filter(s=>/^source chars=/.test(s)).map(s=>+s.match(/chars=(\d+)/)[1]);
 const yuris=replay(file,{name:'euphoriaHD.exe',profile:profile(HD)});
 const kept=lines(yuris);
 assert.ok(kept.length>=2,JSON.stringify(yuris.traces.filter(s=>/source|merged/.test(s))));
 assert.ok(kept.every(n=>n<=90),'every line fits the box: '+kept);
 assert.equal(profile(HD).page.skipMergedTail,90);
 const tail=yuris.traces.filter(s=>/^merged skip text/.test(s));
 assert.ok(tail.some(s=>s.includes('of 505 chars')),tail.join('\n'));
 const other=replay(file,{name:'game.exe',profile:P.profileFor({engine:'KiriKiri',exe:'D:/x/game.exe',title:'other'})});
 assert.equal(P.profileFor({engine:'KiriKiri',exe:'D:/x/game.exe',title:'other'}).page.skipMergedTail,null);
 assert.ok(lines(other).includes(505),'the kernel default keeps the 505-character text whole: '+lines(other));
});

test('a dialogue line that a typing stream flushed in pieces is never taken for a choice frame',()=>{
 const {ChoiceCapture}=require('../core/choice-capture.cjs');
 assert.equal(ChoiceCapture.frameOf('「こ、こんにちは」と言った。',['「こ、','こんにちは」と言った。']),null);
 assert.equal(ChoiceCapture.frameOf('唐突に、広大なメインルームに『声』が響いた。',['唐突に、','広大なメインルームに『声』が響いた。']),null);
 assert.equal(ChoiceCapture.frameOf('はいはい',['はい']),null,'one piece repeated is no choice of two');
 assert.deepEqual(ChoiceCapture.frameOf('トイレだなトイレだな飲み水だろう飲み水だろう',['トイレだなトイレだな','飲み水だろう飲み水だろう']),['トイレだな','飲み水だろう']);
});

test('live recording (title): the content notice read from a picture leaves the reader with the picture, and the menu after it never becomes a line',()=>{
 const r=replay(path.join(dir,'euphoria-hd-title.jsonl'),{name:'euphoriaHD.exe'});
 const shown=r.events.filter(e=>e&&typeof e.hookSource==='string');
 assert.ok(shown.some(e=>e.hookSource.startsWith('このゲームには')),'the notice was shown while it was on screen');
 assert.equal(shown.at(-1)?.hookSource,'','the reader is empty on the title screen: '+JSON.stringify(shown.map(e=>e.hookSource.slice(0,12))));
 assert.equal(shown.some(e=>/始める/.test(e.hookSource)),false);
});

test('an OCR line whose picture is still on screen stays, and a gone picture never clears a newer line',()=>{
 const os=require('node:os'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'euphoria-hd-ocr-'));
 const rows=fs.readFileSync(path.join(dir,'euphoria-hd-title.jsonl'),'utf8').trim().split(/\r?\n/).map(l=>JSON.parse(l));
 const stay=path.join(tmp,'stay.jsonl');fs.writeFileSync(stay,rows.filter(r=>r.m.visible===true&&r.m.id<=1000011).map(r=>JSON.stringify(r)).join('\n')+'\n');
 const a=replay(stay,{name:'euphoriaHD.exe'}).events.filter(e=>e&&typeof e.hookSource==='string');
 assert.ok(a.at(-1)?.hookSource.startsWith('このゲームには'),JSON.stringify(a.map(e=>e.hookSource.slice(0,12))));
 const t0=rows[0].t,newer=path.join(tmp,'newer.jsonl');
 const live=[...rows.filter(r=>r.m.visible===true&&r.m.id<=1000011),{t:t0+2500,m:{type:'hookSource',text:'合成声「『ようこそメインルームへ』」',sourceName:'EmbedYURIS6',hookActive:true}},...rows.filter(r=>r.m.visible===false&&r.m.id<=1000011).map(r=>({...r,t:Math.max(r.t,t0+4000)}))];
 fs.writeFileSync(newer,live.map(r=>JSON.stringify(r)).join('\n')+'\n');
 const b=replay(newer,{name:'euphoriaHD.exe'}).events.filter(e=>e&&typeof e.hookSource==='string');
 assert.ok(b.at(-1)?.hookSource.includes('ようこそ'),JSON.stringify(b.map(e=>e.hookSource.slice(0,12))));
 fs.rmSync(tmp,{recursive:true,force:true});
});
