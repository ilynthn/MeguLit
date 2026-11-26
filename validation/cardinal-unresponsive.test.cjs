// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 (krkr-nodraw r2) the reader page stopped answering the probe at 89 s; the options offered at 104 s had no sample and were
   ruled 「not all visible, clickable, source-matched and translated」. With no sample the option state is unknown: not counted,
   the observation unreliable, the result names the silent span. Lines of that time still fail row (nothing was seen), now saying why */
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../core/cardinal/responsive.cjs'),C=require('../core/cardinal/checks.cjs'),S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs');
const probes=[{at:100,ok:true},{at:200,ok:true},{at:15300,ok:false},{at:15400,ok:true},{at:15500,ok:true},{at:30600,ok:false},{at:45700,ok:false}];

test('silent spans: from the last answered probe to the next one, or to the end',()=>{
 assert.deepEqual(R.spans({timing:{probes}}),[{from:200,to:15400,failed:1},{from:15500,to:Infinity,failed:2}]);
 assert.deepEqual(R.spans({timing:{probes:[{at:1,ok:true}]}}),[]);assert.deepEqual(R.spans({}),[]);
 assert.equal(R.during(R.spans({timing:{probes}}),20000),true);assert.equal(R.during(R.spans({timing:{probes}}),15450),false);
});

function run(){const text='これは本文の一行です';const steps=[{line:1,text,t:1795253000000,hb:{type:'hookSource',text}},{line:2,text:'二行目の本文がここ',t:1795253020000,hb:{type:'hookSource',text:'二行目の本文がここ'}}];
 const samples=[];for(let at=0;at<=1500;at+=100)samples.push({at,mark:'tick',hookSource:text,body:'',glyphs:[{text,kind:'line',pointer:'auto',rect:{x:100,y:500,w:300,h:30}}],cn:[{text:'译',rect:{x:100,y:550,w:300,h:30}}],choices:[],hitRegions:[{x:0,y:0,width:1920,height:1080}]});
 return {name:'quiet',steps,o:{samples,timing:{probes:[{at:0,ok:true},{at:1500,ok:true},{at:16600,ok:false},{at:31700,ok:false}]},sourceEpisodes:[{step:0,line:1,text,at:0},{step:1,line:2,text:steps[1].text,at:20000}],
  choiceOffers:[{at:25000,n:2,texts:['左へ行く','右へ行く'],until:null}],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}};}

test('options offered while the page was silent are unobserved, not a failure',()=>{
 const c=C.choices(run());assert.equal(c.n,0);assert.equal(c.unanswered,1);assert.equal(c.reliable,false);assert.match(c.bad[0],/did not answer/);
 const s=S.score(run(),D.cardinal);assert.equal(s.applies.choice,false);assert.equal(s.detail.choiceObservation.unanswered,1);
 assert.deepEqual(s.detail.readerUnresponsive,{spans:[{from:1500,to:null,failed:2}],failedProbes:2});assert.match(s.explain.readerUnresponsive.left,/from 1500 ms to the end/);
});
test('a line delivered while the page was silent still fails row, and says why',()=>{
 const s=S.score(run(),D.cardinal);assert.ok(s.scores.row<1);assert.match(s.detail.unseen.find(m=>/line 2/.test(m)),/did not answer/);
});
test('an offer with samples is judged as before, silence elsewhere does not excuse it',()=>{
 const r=run();r.o.choiceOffers=[{at:500,n:2,texts:['左へ行く','右へ行く'],until:null}];const c=C.choices(r);assert.equal(c.n,1);assert.equal(c.ok,0);assert.equal(c.unanswered,0);
});
