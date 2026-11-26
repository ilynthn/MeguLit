// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 an option the reader paints over the game's own button (choice-overlay.js, pointer-events none, a pass hit region) is
   clickable: the click reaches the game. Taken from the オルフレール cold run where both options were ruled not clickable. */
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core/cardinal/checks.cjs');
const hits=[{x:397,y:780,width:1100,height:46,menu:false},{x:779,y:370,width:365,height:34,menu:false,pass:true},{x:816,y:393,width:291,height:30,menu:false,pass:true},{x:836,y:457,width:130,height:33,menu:false,pass:true},{x:955,y:458,width:262,height:30,menu:false,pass:true}];
const options=[{sourceText:'……本当は、お優しい方なのかしら',translation:'中文：……本当は、お優しい方なのかしら',translationShown:true,translationRequired:true,pointer:'none',shown:true,rect:{x:787,y:376,w:349,h:22}},
 {sourceText:'……本当に、几帳面な方なのね',translation:'中文：……本当に、几帳面な方なのね',translationShown:true,translationRequired:true,pointer:'none',shown:true,rect:{x:844,y:463,w:114,h:21}}];
function run(mut=()=>{}){const opts=structuredClone(options),h=structuredClone(hits);mut(opts,h);
 return {name:'orfre-choice',steps:[],o:{samples:[1000,1400,1800].map(at=>({at,choices:structuredClone(opts),hitRegions:structuredClone(h),glyphs:[]})),choiceOffers:[{at:900,n:2,texts:options.map(o=>o.sourceText),until:5000}],hookEvents:[],hbSent:[]}};}

test('the real overlay options pass their clicks to the game and count as clickable',()=>{const c=C.choices(run());assert.equal(c.n,1);assert.equal(c.ok,1);assert.deepEqual(c.bad,[]);});
test('a pass-through option with no pass region, or under a capturing region, reaches nothing',()=>{
 assert.equal(C.choices(run((o,h)=>{h.splice(3,2);})).ok,0,'the second option has no pass region');
 assert.equal(C.choices(run((o,h)=>{h.push({x:830,y:450,width:200,height:50,menu:false});})).ok,0,'a capturing region over it swallows the click');
});
test('an option that takes the pointer needs a capturing region, a pass region is not enough',()=>{
 assert.equal(C.choices(run(o=>{for(const x of o)x.pointer='auto';})).ok,0);
 assert.equal(C.choices(run((o,h)=>{for(const x of o)x.pointer='auto';for(const r of h)delete r.pass;})).ok,1);
 assert.equal(C.reaches({pointer:'auto',rect:{x:0,y:0,w:10,h:10}},[]),false);
});
