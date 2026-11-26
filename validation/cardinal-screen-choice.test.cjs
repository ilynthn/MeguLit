// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 options the game's screen showed (cold test OCR, run.json) are counted by the choice check, and the leak result says
   whether the hide was confirmed, instead of an unexplained 0 */
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core/cardinal/checks.cjs'),S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs');
const L=require('../core/cardinal/timeline.cjs'),R=require('../core/cardinal/screen-run.cjs');

const run={phases:[{name:'fast',at:'2026-11-26T08:08:45.709Z',lines:60},{name:'choice',at:'2026-11-26T08:09:30.153Z',lines:81},{name:'choice-done',at:'2026-11-26T08:09:39.606Z',lines:83}],
 ocrChoices:['・・・・・・本当は、おしい方なのかしら','・本当に、几帳面な方なのね']};

test('a cold-test run gives one screen choice row from its choice phases and OCR options',()=>{
 const rows=R.choiceRows(run);assert.equal(rows.length,1);assert.equal(rows[0].t,Date.parse('2026-11-26T08:09:30.153Z'));
 assert.deepEqual(rows[0].screen.texts,run.ocrChoices);assert.equal(rows[0].screen.until,Date.parse('2026-11-26T08:09:39.606Z'));
 assert.deepEqual(R.choiceRows({...run,ocrChoices:[]}),[]);assert.equal(R.screenRows(run).length,4,'the choice row and the three phases');assert.deepEqual(R.choiceRows({ocrChoices:['a','b']}),[],'no choice phase, no row');
});

test('a tape keeps screen rows as screenChoice steps in time order and drops malformed ones',()=>{
 const rows=[{t:1000,hb:{type:'hookSource',text:'一行目です'}},...R.choiceRows(run).map(r=>({...r,t:1500})),{t:1600,screen:{type:'choices',texts:[]}},{t:1700,screen:{type:'other'}},{t:2000,hb:{type:'hookSource',text:'二行目です'}}];
 const steps=L.fromTape(rows,{});const sc=steps.filter(s=>s.screenChoice);assert.equal(sc.length,1);assert.equal(sc[0].t,1500);
 const i=steps.indexOf(sc[0]);assert.equal(steps[i-1].hb?.text,'一行目です');assert.equal(steps[i+1].hb?.text,'二行目です');
});

function base(){const steps=['これは最初の本文です','これは次の本文です'].map((text,i)=>({line:i+1,text,t:1795253000000+i*2000,hb:{type:'hookSource',text}}));
 return {name:'screen-choice',steps,o:{samples:[],sourceEpisodes:steps.map((st,step)=>({step,line:st.line,text:st.text,at:step*2000})),choiceOffers:[],screenChoices:[],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}};}

test('options on the game screen that never reached the reader are a measured choice failure, not unmeasured',()=>{
 const r=base();assert.equal(C.choices(r).n,0,'no screen choice: nothing to look at');
 r.o.screenChoices=[{at:2500,texts:run.ocrChoices}];const c=C.choices(r);assert.equal(c.n,1);assert.equal(c.ok,0);assert.match(c.bad[0],/never reached the reader/);
 const s=S.score(r,D.cardinal);assert.equal(s.applies.choice,true);assert.equal(s.scores.choice,0);
});

test('a screen choice covered by a reader offer is not counted again; the offer is the unit',()=>{
 const r=base();r.o.screenChoices=[{at:2500,texts:run.ocrChoices}];r.o.choiceOffers=[{at:2300,n:2,texts:['本当は、お優しい方なのかしら','本当に、几帳面な方なのね'],until:null}];
 const c=C.choices(r);assert.equal(c.n,1,'only the offer');assert.equal(c.bad.filter(b=>/game screen/.test(b)).length,0);
 r.o.choiceOffers[0].until=2000;assert.equal(C.choices(r).bad.filter(b=>/game screen/.test(b)).length,1,'a withdrawn offer does not cover a later screen');
});

test('leak says unconfirmed (隐藏未确认) without any hide observation and keeps the 0',()=>{
 const r=base();const lk=C.leaks(r);assert.equal(lk.state,'unconfirmed');assert.equal(lk.rate,1);assert.match(lk.bad.at(-1),/隐藏未确认/);
 const s=S.score(r,D.cardinal);assert.equal(s.scores.leak,0);assert.equal(s.detail.leakObservation.state,'unconfirmed');
});

test('a hide-only confirmation of the selected stream with the hide on is an observed hidden original',()=>{
 const r=base();r.steps.unshift({t:1795252999000,hb:{type:'hookThreads',hookThreads:[{id:'1',selected:true,hideOnly:true}]}});
 r.o.sourceEpisodes=r.o.sourceEpisodes.map(e=>({...e,step:e.step+1}));r.o.samples=[{at:100,hookHide:true,hookProfile:'hide',glyphs:[]}];
 const lk=C.leaks(r);assert.equal(lk.state,'hidden');assert.equal(lk.hideConfirmed,true);assert.equal(lk.rate,0);
 r.o.samples[0].hookHide=false;assert.equal(C.leaks(r).state,'unconfirmed','the confirmation alone, with the hide off, is not an observation');
});
