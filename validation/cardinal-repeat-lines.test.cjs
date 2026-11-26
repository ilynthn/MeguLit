// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 Cardinal scored none of the reading-pace lines of two cold runs (core/cardinal/checks.cjs newLines / sameLine,
   core/cardinal/warmup.cjs FOLLOW_MS):
     ISLAND (CS2 stream): each drawn line comes four times and the line two ahead once before it, so every record had another
       within burstMs; 120 lines on the tape, 0 scored
     千恋＊万花 (EmbedKrkrZ): a record carries the sentence four times and its Chinese, the reader shows the sentence once; it never
       equalled the record, 104 lines on the tape, 0 scored
     ISLAND: two samples still in read mode 38 and 130 ms after core left it gave the whole run leak 0 */
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../core/cardinal/score.cjs'),W=require('../core/cardinal/warmup.cjs'),D=require('../core/profiles/defaults.cjs');
const HIT={x:0,y:0,width:2000,height:2000};
/* a sample of the reader showing `shown` (its source line) with every glyph drawn and clickable */
const sample=(at,source,shown=source,extra={})=>({at,hookSource:source,hitRegions:[HIT],cn:[],
 glyphs:[...String(shown)].map((ch,i)=>({text:ch,kind:'line',color:[1,2,3],pointer:'auto',parentCls:'',rect:{x:100+i*30,y:800,w:28,h:28}})),...extra});
/* deliveries [{t,text}] and what the reader shows [{from,to,source,shown}] -> a replay run */
function run(deliveries,shows,extra={}){const steps=[],eps=[];
 deliveries.forEach((d,i)=>{steps.push({t:d.t,line:i+1,text:d.text,hb:{type:'hookSource',text:d.text}});eps.push({step:i,line:i+1,text:d.text,at:d.t});});
 const samples=[];for(const s of shows)for(let at=s.from;at<s.to;at+=100)samples.push(sample(at,s.source,s.shown??s.source));
 return {name:'r',steps,o:{samples,sourceEpisodes:eps,hookEvents:[],hbSent:[],...extra}};}

const ISLAND=['「だから、ここで生きて」','そこには――。','「そうすれば、辛いことも」','「お帰りなさい」','顔を上げる。','あの頃と変わらぬ笑顔の、彼女がいた。','…………そんな、気がした。','「おーい、こっち来てみろよ！」'];
/* the game draws line k at k*1500 ms: the record of line k+2 once (read ahead), then line k four times */
function island(){const d=[],shows=[];for(let k=0;k<ISLAND.length;k++){const t=1000+k*1500;if(ISLAND[k+2])d.push({t,text:ISLAND[k+2]});for(let r=0;r<4;r++)d.push({t:t+1+r,text:ISLAND[k]});
  shows.push({from:t+100,to:t+1500,source:ISLAND[k]});}return run(d,shows);}

test('ISLAND: a line drawn four times after the line two ahead is one reading-pace line each',()=>{
 const r=S.score(island(),D.cardinal);
 assert.equal(r.unscorable,undefined,'not a Ctrl burst');
 assert.ok(r.lines>=4,'lines scored: '+r.lines);
 assert.equal(r.scores.row,1);assert.equal(r.scores.clean,1);
 /* the reader that stays on the first line is still caught */
 const stuck=island();for(const s of stuck.o.samples)Object.assign(s,sample(s.at,ISLAND[0]));
 const bad=S.score(stuck,D.cardinal);assert.ok(bad.scores.row<0.5,'a reader that never moves loses its rows: '+bad.scores.row);});

test('a real Ctrl burst of different lines is still left out',()=>{
 const d=ISLAND.map((text,i)=>({t:1000+i*80,text}));const r=S.score(run(d,d.map((x,i)=>({from:x.t,to:x.t+80,source:x.text}))),D.cardinal);
 assert.equal(r.detail.sourceCoverage.expected,0);});

const SENREN=[['「お客さんってば」','「先生您醒醒」'],['「あっ、はい。なんですか？」','「啊，什么事？」'],['飛び起きた俺は、前に座っている運転手に返事をする。','我跳起来回答了司机。'],['「そろそろ着きますけど」','「快到了」']];
const raw=([ja,zh])=>ja.repeat(4)+zh.repeat(4);
function senren(shownOf=([ja])=>ja){return run(SENREN.map((x,i)=>({t:1000+i*2500,text:raw(x)})),SENREN.map((x,i)=>({from:1000+i*2500+100,to:1000+(i+1)*2500,source:shownOf(x)})));}

test('千恋＊万花: the reader showing the sentence of a four-times record with its Chinese is that line',()=>{
 const r=S.score(senren(),D.cardinal);
 assert.equal(r.lines,SENREN.length);assert.equal(r.scores.row,1);assert.equal(r.scores.clean,1);
 assert.equal(r.detail.contentCoverage.complete,SENREN.length,'each line completes the sentence the reader took');});

test('a cut-off prefix or another line is not the record\'s line',()=>{
 const other=S.score(run(SENREN.map((x,i)=>({t:1000+i*2500,text:raw(x)})),SENREN.map((x,i)=>({from:1000+i*2500+100,to:1000+(i+1)*2500,source:SENREN[(i+1)%SENREN.length][0]}))),D.cardinal);
 assert.equal(other.scores.row,0,'a reader showing another line is not credited');
 const cut=S.score(senren(([ja])=>ja.slice(0,4)),D.cardinal);assert.equal(cut.scores.row,0,'a reader that shows only a prefix is not credited');});

test('a plain line per record scores as before',()=>{
 const d=SENREN.map(([ja],i)=>({t:1000+i*2500,text:ja}));const r=S.score(run(d,d.map((x,i)=>({from:x.t+100,to:x.t+2500,source:x.text}))),D.cardinal);
 assert.equal(r.lines,SENREN.length);assert.equal(r.scores.row,1);});

test('warmup: read samples just after core left read mode belong to the start-up, later ones do not',()=>{
 const T0=Date.parse('2026-11-27T00:00:00.000Z'),ev=(ms,t)=>new Date(T0+ms).toISOString()+' '+t;
 const mk=lateRead=>{const r=senren();r.o.t0=T0;r.o.hookEvents=[ev(500,'render mode switched in place read -> custom')];
  for(const s of r.o.samples){s.hookProfile=s.at<700||lateRead&&s.at>=4000&&s.at<4300?'read':'embed';s.hookHide=false;}
  r.o.samples.unshift({...sample(520,''),glyphs:[],hookProfile:'read',hookHide:false},{...sample(600,''),glyphs:[],hookProfile:'read',hookHide:false});return r;};
 const r=S.score(mk(false),D.cardinal);
 assert.ok(r.warmup.until>=600,'the cut follows the reader: '+r.warmup.until);
 assert.equal(r.detail.leakObservation.read,false);
 const late=S.score(mk(true),D.cardinal);assert.equal(late.detail.leakObservation.read,true,'read mode later in the run still counts');
 assert.equal(W.FOLLOW_MS,1000);});

/* ISLAND: the game draws a line at its page record, which can come after Ctrl was held; the reader was right to show it then */
function intoCtrl(skipped){const d=SENREN.map(([ja],i)=>({t:1000+i*2500,text:ja})),fast=[{t:11000,text:'「快進の一行目」'},{t:11050,text:'「快進の二行目」'}];
 const r=run([...d,...fast],[{from:1100,to:3500,source:d[0].text},{from:3600,to:6000,source:d[1].text},...(skipped?[{from:6100,to:11000,source:d[3].text}]:[{from:6100,to:8500,source:d[2].text},{from:8600,to:11000,source:d[2].text},{from:11000,to:12000,source:d[3].text}])]);
 r.steps.splice(4,0,{t:10999,phase:'fast'});r.o.sourceEpisodes=r.o.sourceEpisodes.map(e=>e.step>=4?{...e,step:e.step+1}:e);return r;}
test('a reading-pace line the game drew only after Ctrl was held is left out with the Ctrl span',()=>{
 const r=S.score(intoCtrl(false),D.cardinal);assert.ok(r.fastForward,'a Ctrl span');
 assert.equal(r.detail.sourceCoverage.expected,3,'the fourth line was still to come when Ctrl was held');assert.equal(r.scores.row,1);});
test('a line the reader passed over before Ctrl still counts as missed',()=>{
 const r=S.score(intoCtrl(true),D.cardinal);assert.equal(r.detail.sourceCoverage.expected,4);assert.ok(r.scores.row<1);});
