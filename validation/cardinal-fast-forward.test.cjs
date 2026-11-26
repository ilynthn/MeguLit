// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 the Ctrl fast-forward spans of a cold-test tape leave the line scores (core/cardinal/fast-forward.cjs); leak and choice
   keep the whole run; a tape without phases is scored as before */
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../core/cardinal/score.cjs'),F=require('../core/cardinal/fast-forward.cjs'),D=require('../core/profiles/defaults.cjs');
const L=require('../core/cardinal/timeline.cjs'),T=require('../core/cardinal/tape-file.cjs'),R=require('../core/cardinal/screen-run.cjs');
const good=['一行目の本文です','二行目の本文です','三行目の本文です'],joined=['なります」た」力が及ばず','滅んでしまっ」村が','すことなく眠りに就いた。えて'],after=['選択の後の本文です'];
/* reading lines shown well, fast lines joined and never completed on the reader, one line after the choice */
function run({phases=true}={}){const steps=[];let t=1795253000000;const add=s=>{steps.push({...s,t});t+=2000;};
 for(const x of good)add({hb:{type:'hookSource',text:x}});if(phases)add({phase:'fast'});for(const x of joined)add({hb:{type:'hookSource',text:x}});
 if(phases)add({phase:'choice'});for(const x of after)add({hb:{type:'hookSource',text:x}});
 let n=0;for(const st of steps)if(st.hb){st.line=++n;st.text=st.hb.text;}
 const eps=[],samples=[];let at=0;for(const [step,st] of steps.entries()){if(!st.hb){at+=10;continue;}eps.push({step,line:st.line,text:st.text,at});
  const shown=joined.includes(st.text)?st.text.slice(0,3):st.text;for(let a=at;a<at+1500;a+=100)samples.push({at:a,hookSource:st.text,body:'',glyphs:[{text:shown,kind:'line',pointer:'auto',rect:{x:100,y:500,w:300,h:30}}],cn:[{text:'译',rect:{x:100,y:550,w:300,h:30}}],choices:[],hitRegions:[{x:0,y:0,width:1920,height:1080}]});at+=2000;}
 return {name:'ff',steps,o:{samples,sourceEpisodes:eps,choiceOffers:[],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}};}

test('fast spans: from fast to the next other phase, or to the end',()=>{
 assert.deepEqual(F.spans([{phase:'fast'},{},{phase:'choice'},{},{phase:'fast'},{}]),[{fromStep:0,toStep:2},{fromStep:4,toStep:6}]);
 assert.deepEqual(F.spans([{},{}]),[]);
});

test('joined fast-forward lines no longer pull row and clean down, and the result says how many were left out',()=>{
 const old=S.score(run({phases:false}),D.cardinal),cut=S.score(run(),D.cardinal);
 assert.ok(old.scores.row<1,'without phases the joined lines count');assert.equal(old.fastForward,null);
 assert.equal(cut.scores.row,1);assert.equal(cut.scores.clean,1);assert.equal(cut.lines,4);
 assert.equal(cut.fastForward.droppedLines,3);assert.ok(cut.fastForward.droppedSamples>0);assert.match(cut.fastForward.why,/快进/);
 assert.match(cut.explain.fastForward.left,/^3 lines/);
});

test('leak still sees the whole run, fast span included',()=>{
 const r=run();const at=r.o.sourceEpisodes.find(e=>e.text===joined[1]).at;r.o.samples.find(s=>s.at>=at).readMode=true;
 const s=S.score(r,D.cardinal);assert.equal(s.detail.leakObservation.state,'visible');assert.equal(s.scores.leak,0);
});

test('a run that is fast to the end leaves nothing to score and says so',()=>{
 const r=run();const i=r.steps.findIndex(s=>s.phase==='choice');r.steps.splice(i);r.o.sourceEpisodes=r.o.sourceEpisodes.filter(e=>e.step<i);
 for(const st of r.steps.slice(0,3))st.hb.type='hookSourceWarmup';
 const s=S.score(r,D.cardinal);assert.equal(s.total,0);assert.equal(s.unscorable.reason,'fast-forward-only');assert.match(s.unscorable.text,/快进段/);
});

test('phases travel from run.json through the tape into timeline steps',()=>{
 const rows=R.phaseRows({phases:[{name:'fast',at:'2026-11-26T09:38:04.540Z'},{name:'choice',at:'2026-11-26T09:38:29.282Z'},{name:'Bad Name',at:'2026-11-26T09:38:30Z'}]});
 assert.deepEqual(rows.map(r=>r.phase.name),['fast','choice']);
 const text=T.serialize({rows:[{t:Date.parse('2026-11-26T09:38:00Z'),hb:{type:'hookSource',text:'本文'}},...rows],lines:1});
 const steps=L.fromTape(T.parse(text).rows,{});assert.deepEqual(steps.filter(s=>s.phase).map(s=>s.phase),['fast','choice']);
});
