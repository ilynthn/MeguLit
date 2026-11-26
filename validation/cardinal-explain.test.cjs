// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 every deduction says which line, which moment and why (core/cardinal/explain.cjs); scores themselves do not change */
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../core/cardinal/score.cjs'),X=require('../core/cardinal/explain.cjs'),D=require('../core/profiles/defaults.cjs');

function run(){const texts=['これは最初の本文です','これは次の本文です','三つ目の本文がここに'];
 const steps=texts.map((text,i)=>({line:i+1,text,t:1795253000000+i*2000,hb:{type:'hookSource',text}}));const samples=[];
 for(const [i,st] of steps.entries())if(i<2)for(let at=i*2000;at<=i*2000+1000;at+=100)samples.push({at,hookSource:st.text,body:'',glyphs:[{text:st.text,kind:'line',pointer:'auto',rect:{x:100,y:500,w:350,h:30}}],cn:[{text:'译文',rect:{x:100,y:550,w:350,h:30}}],choices:[],hitRegions:[{x:0,y:0,width:1920,height:1080}]});
 return {name:'explain',steps,o:{samples,sourceEpisodes:steps.map((st,step)=>({step,line:st.line,text:st.text,at:step*2000})),choiceOffers:[],screenChoices:[{at:4500,texts:['左へ行く','右へ行く']}],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}};}

test('the explanation names the unseen line, the unoffered choice and the unconfirmed hide, and matches the scores',()=>{
 const r=S.score(run(),D.cardinal),e=r.explain;
 assert.equal(e.row.points,6.67);assert.equal(e.row.factors['dialogue lines observed'],'2/3');
 const unseen=e.row.items.find(i=>i.line===3);assert.ok(unseen,'line 3 is listed');assert.equal(unseen.text,'三つ目の本文がここに');
 assert.equal(e.choice.points,0);assert.equal(e.choice.items[0].at,4500);assert.match(e.choice.items[0].reason,/never reached the reader/);
 assert.equal(e.leak.factors.hide,'unconfirmed');assert.match(e.leak.items.at(-1).reason,/隐藏未确认/);
 assert.equal(e.stable.points,10);assert.deepEqual(e.stable.items,[],'a full key lists nothing');
 assert.ok(X.lines(r).some(l=>/^choice 0\/10/.test(l)));
});

test('a key that does not apply has no points and no deduction',()=>{
 const r0=run();r0.o.screenChoices=[];const e=S.score(r0,D.cardinal).explain;assert.equal(e.choice.points,null);assert.equal(e.choice.lost,null);
});
