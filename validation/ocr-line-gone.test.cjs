/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* 2026-11-26 (死に逝く君、館に芽吹く憎悪, integration run, hook-events 12:38:42-12:39:11): the warning screen's notice was read by the
   art scan (「ocr line "本作品には暴力的、残酷的シーノ…"」), then the scan read the title screen as nothing (「art scan 0/0」) and the
   notice stayed over the title for 26 s, until the first story line. A line the scan read leaves the reader when all of its
   groups left the picture (the scan's hide after two reads without them). The readings are those of the run's log. */
const test=require('node:test'),assert=require('node:assert/strict');
const {HookNative}=require('../core/hook-native.cjs');
function rig(){
 let now=1000;const timers=[],events=[],traces=[];
 const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);
 h.trace=s=>traces.push(s);h.send=()=>{};
 const realSet=global.setTimeout,realClear=global.clearTimeout;
 global.setTimeout=(fn,ms)=>{const t={at:now+(ms||0),fn,unref(){}};timers.push(t);return t;};
 global.clearTimeout=t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);};
 const run=t=>{for(;;){timers.sort((a,b)=>a.at-b.at);const n=timers[0];if(!n||n.at>t)break;timers.shift();now=n.at;try{n.fn();}catch{}}now=Math.max(now,t);};
 const group=(id,text,y,extra={})=>h.ocrLine({type:'artText',source:'ocr',id,text,visible:true,rows:[{text,x:660,y,w:780,h:24}],sw:1671,sh:939,dialogSeen:false,others:0,...extra});
 const hide=id=>h.ocrLine({type:'artText',source:'ocr',id,visible:false});
 const shown=()=>{const s=[...events].reverse().find(e=>typeof e?.hookSource==='string');return s?{text:s.hookSource,origin:s.hookSourceOrigin}:null;};
 const done=()=>{global.setTimeout=realSet;global.clearTimeout=realClear;};
 return {h,group,hide,run,shown,traces,done};}
const NOTICE='本作品には暴力的、残酷的シーン、犯罪にあたる行為等、過激な表現が含まれています。気分を害するおそれがありますので御注意ください。';

test('the warning notice read from the picture leaves the reader when the title screen replaced it',()=>{
 const r=rig();try{
  r.run(2000);r.group(1000001,NOTICE,690);r.run(2600);
  assert.deepEqual(r.shown(),{text:NOTICE,origin:'ocr'},'the notice is a read line');
  r.run(5000);r.hide(1000001);
  assert.deepEqual(r.shown(),{text:'',origin:'leave'},'gone from the picture: the reader is cleared');
  assert.ok(r.traces.includes('ocr line gone from the picture'));
  /* the first story line shows as usual */
  r.run(30000);r.h.emitSource('特に何かの説明があったわけでもなく、それは起こった。','live');
  assert.equal(r.shown().text,'特に何かの説明があったわけでもなく、それは起こった。');
 }finally{r.done();}});

test('a line made of two groups stays until both have left; a newer line is never cleared by an old group',()=>{
 const r=rig();try{
  r.run(2000);r.group(1000011,'本作品はフィクションです。登場する人物名、団体名、地名、設定等は全て架空のものであり、',555);r.group(1000012,'実在するものとは一切関係ありません。',622);r.run(2600);
  assert.equal(r.shown().origin,'ocr');
  r.hide(1000011);assert.equal(r.shown().origin,'ocr','one group still on the picture');
  r.hide(1000012);assert.deepEqual(r.shown(),{text:'',origin:'leave'});
  r.run(9000);r.group(1000021,NOTICE,690);r.run(9600);assert.equal(r.shown().text,NOTICE);
  r.run(12000);r.h.emitSource('「……焼き過ぎたか」','live');r.run(12500);r.hide(1000021);
  assert.equal(r.shown().text,'「……焼き過ぎたか」','the hook line that followed stays');
 }finally{r.done();}});

test('a group read only once keeps its line while the picture still shows text (a card that faded within a second)',()=>{
 const r=rig();try{
  r.run(2000);r.h.artScanCount?.(1,0);r.group(1000031,NOTICE,690,{once:true});r.run(2600);
  assert.equal(r.shown().text,NOTICE);r.hide(1000031);assert.equal(r.shown().text,NOTICE);
  r.h.artScanCount?.(0,0);r.run(5000);assert.equal(r.shown().text,NOTICE,'shown for at least 6 s, so the card can be read');
 }finally{r.done();}});

/* #1267 live 2026-11-27 (死に逝く君、館に芽吹く憎悪 汉化硬盘版, app-1267 hook-events 18:33:49-18:34:47): the warning page fading out was read
   once as garble and taken; the scan then read the title screen as 「art scan 4/0 ツン」 (the menu) and 「0/0」, and the garble stayed
   over the title for over two minutes. */
const GARBLE='にけ異カ′シーノ、犯罪にあたる行為等、過激な表現が含まれオの匍洋音';
test('a line read once leaves the reader when the scan reads the title screen as a menu or as nothing (#1267 live)',()=>{
 for(const after of [[4,0],[0,0]]){const r=rig();try{
  r.run(2000);r.h.artScanCount?.(0,0);r.group(1000041,GARBLE,690,{once:true});r.run(2600);
  assert.equal(r.shown().text,GARBLE,'the read line is shown first');
  r.h.artScanCount?.(...after);r.run(4000);assert.equal(r.shown().text,GARBLE,'held a moment');
  r.run(9000);assert.deepEqual(r.shown(),{text:'',origin:'leave'},'title screen '+after.join('/')+': cleared');
  assert.ok(r.traces.includes('ocr line gone: the art scan reads no line on the picture'));
 }finally{r.done();}}});

test('a line whose group never got its hide leaves when the scan reads nothing; one still read stays',()=>{
 const r=rig();try{
  r.run(2000);r.h.artScanCount?.(1,0);r.group(1000051,NOTICE,690);r.run(2600);assert.equal(r.shown().text,NOTICE);
  r.run(20000);assert.equal(r.shown().text,NOTICE,'the scan still reads a group: the line stays');
  r.h.artScanCount?.(0,0);r.run(20500);assert.equal(r.shown().text,NOTICE,'not at the first empty read');
  r.run(22000);assert.deepEqual(r.shown(),{text:'',origin:'leave'});
 }finally{r.done();}});

test('an empty scan never clears a hook line, and a scan going off forgets the count',()=>{
 const r=rig();try{
  r.run(2000);r.h.artScanCount?.(0,0);r.h.emitSource('特に何かの説明があったわけでもなく、それは起こった。','live');r.run(30000);
  assert.equal(r.shown().text,'特に何かの説明があったわけでもなく、それは起こった。');
  r.h.artScanCount?.(0,0);r.run(60000);assert.equal(r.shown().text,'特に何かの説明があったわけでもなく、それは起こった。');
  const s=rig();try{s.run(2000);s.h.artScanCount?.(0,0);s.h.artScanCount?.(null);s.group(1000061,NOTICE,690,{once:true});s.run(20000);
   assert.equal(s.shown().text,NOTICE,'unknown count (scan off): kept');}finally{s.done();}
 }finally{r.done();}});

test('the art scan status line gives the count the reader uses',()=>{
 const {GalNative}=require('../core/gal-native.cjs');
 assert.deepEqual(GalNative.artScanCount?.('art scan 3/0 本作品は1 8歳未満の方は購できません'),[3,0]);
 assert.deepEqual(GalNative.artScanCount?.('art scan 0/0'),[0,0]);
 assert.equal(GalNative.artScanCount?.('art scan off'),null);
 assert.equal(GalNative.artScanCount?.('art scan skipped: the window gives no picture to BitBlt'),undefined);
});
