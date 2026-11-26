// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core/cardinal/checks.cjs'),S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs'),H=require('../core/cardinal/native-hide.cjs'),{formatChars}=require('../core/text-paths.cjs');
const fixture=require('./fixtures/cardinal/fata-live-visibility-20261121.json');
const empty=()=>({name:'synthetic-hide-observation',steps:[],o:{samples:[],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}});
const record=(changes={})=>formatChars({engine:'krkr',line:1,hidden:true,sw:800,sh:600,text:'本文',rects:[[100,100,20,20],[120,100,20,20]],...changes});
test('native hide evidence requires nonempty finite dialogue records, not names, UI or clears',()=>{
 const h=H.collector({modeled:false});h.report(record(),true);assert.deepEqual(h.snapshot(),{source:'native-dialogue',modeled:false,lines:1,visible:0});
 for(const raw of [record({role:'name',line:2}),record({role:'choice',line:3}),record({line:4,text:'',rects:[]}),record({line:0}),record({line:5,sw:0}),record({line:6,text:'ab'}),record({line:7,rects:[[0,0,0,0],[0,0,0,0]]}),record({line:8}).replace('n=2','n=9')]){h.report(raw,true);assert.equal(h.snapshot().lines,1);}
 h.report(record({line:9}),false);assert.equal(h.snapshot().lines,1);
 h.report(record({hidden:false}),true);assert.equal(h.snapshot().visible,1);h.report(record({hidden:true}),true);assert.equal(h.snapshot().visible,1,'a later hidden snapshot cannot erase an observed visible draw');
});
test('missing or malformed native counts never prove hiding succeeded',()=>{
 for(const hidden of [{lines:0,visible:0},{source:'native-dialogue',modeled:false,lines:0,visible:0},{source:'native-dialogue',modeled:false,lines:1,visible:2},{source:'native-dialogue',modeled:false,lines:NaN,visible:0},{source:'native-dialogue',modeled:false,lines:1.5,visible:0},{source:'native-dialogue',modeled:true,lines:10,visible:0},{source:'name',modeled:false,lines:10,visible:0}]){
  const run=empty();run.o.hidden=hidden;const result=C.leaks(run);assert.equal(result.observed,false);assert.equal(result.rate,1);assert.equal(S.score(run,D.cardinal).scores.leak,0);
 }
});
test('valid native observations or four distinct valid hide checks can establish observation',()=>{
 const native=empty();native.o.hidden={source:'native-dialogue',modeled:false,lines:4,visible:0};assert.equal(C.leaks(native).observed,true);assert.equal(C.leaks(native).rate,0);native.o.hidden.visible=1;assert.equal(C.leaks(native).rate,.25);
 const visual=(sequence,matched=false)=>new Date(1795253000000+sequence).toISOString()+' visual '+JSON.stringify({type:'hookVisual',stage:'hidden',valid:true,sequence,matched});
 const run=empty();run.o.hookEvents=[visual(1),visual(2),visual(3)];assert.equal(C.leaks(run).observed,false);run.o.hookEvents.push(visual(3));assert.equal(C.leaks(run).observed,false,'repeating one check does not make four');run.o.hookEvents.push(visual(4));assert.equal(C.leaks(run).observed,true);assert.equal(C.leaks(run).rate,0);
 const missing=empty();missing.o.hookEvents=[1,2,3,4].map(sequence=>visual(sequence).replace(',"matched":false',''));assert.equal(C.leaks(missing).observed,false,'missing matched booleans are not negative visual checks');
 const one=empty();one.o.hookEvents=[visual(1,true)];assert.equal(C.leaks(one).rate,1);assert.equal(C.leaks(one).observed,true,'one observed failure is not excused by the success sample minimum');
});
test('manual read is observed failure and never scores higher than unknown hiding',()=>{
 const run=empty();run.o.samples=[{at:0,hookProfile:'read',hookHide:true,glyphs:[]}];const result=C.leaks(run);assert.equal(result.observed,true);assert.equal(result.rate,1);assert.equal(S.score(run,D.cardinal).scores.leak,0);
});
test('read-only stream with the hide confirmed by the bridge is not manual read; without the confirmation it still is',()=>{
 const confirmed={t:1,hb:{type:'hookThreads',hookThreads:[{id:'52c3a7:0:1c',name:'KiriKiri2',selected:true,hideOnly:true,embeddable:true}]}};
 const run=empty();run.o.samples=[{at:0,hookProfile:'read',hookHide:true,glyphs:[]}];run.steps=[confirmed];const r=C.leaks(run);assert.equal(r.readObserved,false);assert.equal(r.observed,true);assert.equal(r.rate,0);
 const other=empty();other.o.samples=[{at:0,hookProfile:'read',hookHide:true,glyphs:[]}];other.steps=[{t:1,hb:{type:'hookThreads',hookThreads:[{id:'x',selected:false,hideOnly:true},{id:'y',selected:true,hideOnly:false}]}}];assert.equal(C.leaks(other).rate,1,'a hide-only thread that is not the selected one proves nothing');
 const off=empty();off.o.samples=[{at:0,hookProfile:'read',hookHide:false,glyphs:[]}];off.steps=[confirmed];assert.equal(C.leaks(off).rate,1,'read with the hide off is manual read');
});
test('deleting real failure evidence cannot improve the existing faulty session',()=>{
 const baseline=S.score(fixture.run,D.cardinal);assert.equal(baseline.total,.257);assert.equal(baseline.scores.leak,0);
 const run=structuredClone(fixture.run);run.o.hookEvents=[];run.o.hbSent=[];run.o.hidden={lines:0,visible:0};for(const sample of run.o.samples){delete sample.readMode;delete sample.hookHide;delete sample.hookProfile;}
 const result=S.score(run,D.cardinal);assert.equal(result.scores.leak,0);assert.equal(result.detail.leakObservation.observed,false);assert.ok(result.total<=baseline.total);
});
