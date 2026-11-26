// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 the real screen as a second hide evidence (core/cardinal/screen-evidence.cjs), and tapes that cannot be used fail with a
   code (core/cardinal/tape-file.cjs) instead of scoring 0 */
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/cardinal/screen-evidence.cjs'),C=require('../core/cardinal/checks.cjs'),S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs');
const T=require('../core/cardinal/tape-file.cjs');
const real=require('./fixtures/cardinal/orfre-screen-20261126.json');
const steps=lines=>lines.map(l=>({t:l.t,hb:{type:'hookSource',text:l.text}}));

test('real オルフレール pictures: the read-only run shows its original, the late choice-screen picture says nothing',()=>{
 const e=E.evidence(real.frames,steps(real.lines));const shot=e.items.find(i=>/shot-4/.test(i.name)),late=e.items.find(i=>/ocr-3/.test(i.name));
 assert.equal(shot.verdict,'visible');assert.equal(late.verdict,'unusable');assert.match(late.why,/old/);
 assert.equal(e.state,'visible');assert.equal(e.visible,1);assert.equal(E.valid(e),true);
});

const line='これは画面に出る一行目の本文です';
const other=[{text:'Q.Save',x:10,y:900,w:60,h:20},{text:'Config',x:100,y:900,w:60,h:20},{text:'Backlog',x:200,y:900,w:60,h:20}];
const frame=(at,ocr,extra={})=>({at,ocr:[...other,...ocr],...extra});

test('a miss is hidden only on a fresh line in a picture OCR could read, and only four of them observe the hide',()=>{
 const st=steps([{t:1000,text:line}]);
 assert.equal(E.judge(frame(2000,[]),E.dialogue(st)).verdict,'hidden');
 assert.equal(E.judge({at:2000,ocr:[]},E.dialogue(st)).verdict,'unusable','OCR read nothing: a miss proves nothing');
 assert.equal(E.judge(frame(1000+E.MAX_AGE+1,[]),E.dialogue(st)).verdict,'unusable');
 assert.equal(E.judge(frame(500,[]),E.dialogue(st)).verdict,'unusable','before the first line');
 assert.equal(E.evidence([2000,3000,4000].map(at=>frame(at,[])),st).state,'unconfirmed');
 assert.equal(E.evidence([2000,3000,4000,5000].map(at=>frame(at,[])),st).state,'hidden');
});

test('OCR of the line counts as visible, rough reads too, but not inside MeguLit\'s own rows',()=>{
 const st=steps([{t:1000,text:line}]),ls=E.dialogue(st);
 assert.equal(E.judge(frame(2000,[{text:'こ れ は 画 面 に 出 る 一 行 目 の',x:300,y:700,w:600,h:30}]),ls).verdict,'visible');
 assert.equal(E.judge(frame(2000,[{text:'全然ちがう文章が出ている',x:300,y:700,w:600,h:30}]),ls).verdict,'hidden');
 assert.equal(E.judge(frame(2000,[{text:line,x:300,y:700,w:600,h:30}],{exclude:[{x:290,y:690,w:700,h:60}]}),ls).verdict,'hidden','the reader\'s own Japanese row is not the original');
});

function base(){const st=[{line:1,text:line,t:1000,hb:{type:'hookSource',text:line}}];return {name:'screen',steps:st,o:{samples:[],sourceEpisodes:[{step:0,line:1,text:line,at:0}],choiceOffers:[],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}};}

test('leak takes the screen: visible fails it, four hidden pictures observe the hide, a forged summary is ignored',()=>{
 const st=base().steps;
 const vis=base();vis.o.screen=E.evidence([frame(2000,[{text:line,x:0,y:0,w:9,h:9}])],st);const lv=C.leaks(vis);assert.equal(lv.state,'visible');assert.equal(lv.rate,1);assert.match(lv.bad[0],/shows the original/);
 const hid=base();hid.o.screen=E.evidence([2000,3000,4000,5000].map(at=>frame(at,[])),st);const lh=C.leaks(hid);assert.equal(lh.state,'hidden');assert.equal(lh.rate,0);
 assert.equal(S.score(hid,D.cardinal).detail.leakObservation.screen.state,'hidden');
 const forged=base();forged.o.screen={source:'screen-ocr',state:'hidden',usable:1,visible:0,hidden:1};assert.equal(C.leaks(forged).state,'unconfirmed','fewer than four usable frames cannot claim hidden');
});

test('tape files: version 0 and 1 read, broken ones fail with a code',()=>{
 const rows=[{t:1,hb:{type:'hookSource',text:'一行'}},{t:2,gwb:{type:'layout'}}];const v0=rows.map(r=>JSON.stringify(r)).join('\n');
 assert.equal(T.parse(v0).version,0);assert.equal(T.parse(v0).lines,1);
 const v1=T.serialize({rows,lines:1,game:'g'});assert.equal(T.parse(v1).version,1);assert.equal(T.parse(v1).rows.length,2);
 const code=text=>{try{T.parse(text);return 'ok';}catch(e){return e.code;}};
 assert.equal(code(''),'TAPE_EMPTY');assert.equal(code('garbage\nmore garbage\n'+v0.split('\n')[0]),'TAPE_UNREADABLE');
 assert.equal(code(JSON.stringify({tape:T.KIND,version:2})+'\n'+v0),'TAPE_VERSION');
 assert.equal(code(JSON.stringify({t:1,gwb:{type:'layout'}})),'TAPE_NO_LINES');
 assert.equal(code(JSON.stringify({hb:{type:'hookSource',text:'x'}})),'TAPE_NO_TIME');
 assert.equal(T.parse(v0+'\n{broken').skipped.bad,1,'one bad line among good ones is skipped and counted');
});

/* 2026-11-26 krkr-nodraw r1 screen-16: the choice screen ruled 「the original is visible」 against a 4000-character page the hook joined
   while skipping; options are drawn by the game on purpose */
test('a joined skip page is no line to compare, and the game\'s options are not the original',()=>{
 const r1=require('./fixtures/cardinal/nodraw-r1-screen16.json');
 assert.equal(E.judge(r1.frame,[r1.prev,r1.line]).verdict,'unusable');assert.match(E.judge(r1.frame,[r1.prev,r1.line]).why,/joined page/);
 const st=steps([{t:1000,text:'それで本当は、お優しい方なのかしらと思った'}]),ls=E.dialogue(st),opt=['……本当は、お優しい方なのかしら','……本当に、几帳面な方なのね'];
 const f=frame(2000,[{text:'本当は、お優しい方なのかしら',x:800,y:380,w:340,h:22}]);
 assert.equal(E.judge(f,ls).verdict,'visible','without the options it reads like the line');assert.equal(E.judge(f,ls,opt).verdict,'hidden','with them it is the option');
 assert.deepEqual(E.options([{t:1,screen:{type:'choices',texts:opt}},{t:2,gwb:{type:'hookChoiceBoxes',items:[{text:'左へ行く'}]}}]),[...opt,'左へ行く']);
});
test('scattered character pairs are no read: a match needs a run of characters in order',()=>{
 const long='いつも方が好きで、なのに彼はかしらと言った。のかと問われ、しらを切る';const ls=E.dialogue(steps([{t:1000,text:long}]));
 assert.equal(E.judge(frame(2000,[{text:'い方なのかしら',x:1,y:1,w:9,h:9}]),ls).verdict,'hidden');
 assert.equal(E.judge(frame(2000,[{text:'彼はかしらと言った',x:1,y:1,w:9,h:9}]),ls).verdict,'visible');
});
