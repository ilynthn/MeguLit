/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* 2026-11-26 (死に逝く君、館に芽吹く憎悪, integration run, hook-events / hook-diagnostics 12:50:41-12:51:12): on the game's own LOAD screen
   MeguLit's current line 「未曽有の大虐殺を…」 stayed up, and the save slot's preview 「当時、街には多くの人々が溢れていた。」 (KiriKiri2,
   KiriKiri1) with its DrawText pieces 「当時、街には多く」「の人々が溢れてい」「た。」 became a choice that OCR found and the reader
   translated over the slots. The art scan read the slots as 「NO. 03」「NO. 04」…「2026 / 11 / 16 …」. Both are replayed here:
   a past line on a side stream with no line after it, and rows with save dates, hide the reader's line until the next line. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {HookNative}=require('../core/hook-native.cjs');
function rig(){
 let now=1000;const timers=[],events=[],traces=[];
 const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);
 h.trace=s=>traces.push(s);h.send=()=>{};h.artCandidate=()=>{};h.requestChoices=()=>{};
 const realSet=global.setTimeout,realClear=global.clearTimeout;
 global.setTimeout=(fn,ms)=>{const t={at:now+(ms||0),fn,unref(){}};timers.push(t);return t;};
 global.clearTimeout=t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);};
 const run=t=>{for(;;){timers.sort((a,b)=>a.at-b.at);const n=timers[0];if(!n||n.at>t)break;timers.shift();now=n.at;try{n.fn();}catch{}}now=Math.max(now,t);};
 const say=(t,text)=>{run(t);h.emitSource(text,'live');};
 const aux=(t,sourceName,text)=>{run(t);h.auxText({sourceName,role:0,text});};
 const dialog=()=>events.filter(e=>e.type==='hookDialog'&&e.engine==='pastlines').map(e=>e.visible);
 const done=()=>{global.setTimeout=realSet;global.clearTimeout=realClear;};
 return {h,say,aux,run,dialog,traces,done,events};}
const OLD='当時、街には多くの人々が溢れていた。',NOW='未曽有の大虐殺を引き起こしたのは、あの男のような連中だと言うことも間違いなかった。';
const story=(r,from)=>{let t=from;r.say(t,OLD);for(let i=0;i<40;i++){t+=1500;r.say(t,'これは物語の'+i+'番目の地の文で、まだ続いていく。');}t+=1500;r.say(t,NOW);return t;};

test('a save slot preview (a line from long ago) on the side streams hides the line; the next line brings it back',()=>{
 const r=rig();try{
  const t=story(r,2000);
  /* the reader's line redrawn by KiriKiri1 after it: never a past line */
  r.aux(t+700,'KiriKiri1',NOW);
  /* the LOAD screen, 12:50:53.75 */
  r.aux(t+12000,'KiriKiri2',OLD);r.aux(t+12003,'tTVPNativeBaseBitmap::DrawText','当時、街には多く');r.aux(t+12004,'KiriKiri1',OLD);
  r.aux(t+12005,'tTVPNativeBaseBitmap::DrawText','の人々が溢れてい');r.aux(t+12005,'tTVPNativeBaseBitmap::DrawText','た。');
  assert.deepEqual((r.h.choice?.items||[]).map(x=>x.key).filter(k=>k.length>2),[],'the preview and its pieces are no choice');
  r.run(t+12900);assert.deepEqual(r.dialog(),[false],'the reader line is hidden on the screen of past lines');
  r.say(t+20000,'「ここは……」');assert.deepEqual(r.dialog(),[false,true],'the next line shows again');
 }finally{r.done();}});

test('a recent line on a side stream, a past line followed by a line, or skipping hide nothing',()=>{
 const r=rig();try{
  const t=story(r,2000);
  r.aux(t+3000,'KiriKiri1','これは物語の35番目の地の文で、まだ続いていく。');r.run(t+5000);
  r.aux(t+6000,'KiriKiri2',OLD);r.say(t+6300,'「ああ」');r.run(t+8000);
  r.h.skipKey=true;r.aux(t+9000,'KiriKiri2',OLD);r.run(t+11000);r.h.skipKey=false;
  assert.deepEqual(r.dialog(),[]);
 }finally{r.done();}});

test('the current line drawn again ends the hide (the screen was closed without loading)',()=>{
 const r=rig();try{
  const t=story(r,2000);r.aux(t+5000,'KiriKiri2',OLD);r.run(t+6000);assert.deepEqual(r.dialog(),[false]);
  r.aux(t+9000,'KiriKiri1',NOW);assert.deepEqual(r.dialog(),[false,true]);
 }finally{r.done();}});

test('rows with save dates hide the line while they stay on the picture',()=>{
 const r=rig();try{
  r.say(2000,NOW);
  r.run(2500);r.h.artScreen({type:'artScreen',dates:3});assert.deepEqual(r.dialog(),[],'not while the line has just come');
  r.run(6000);r.h.artScreen({type:'artScreen',dates:1});assert.deepEqual(r.dialog(),[],'one date is a HUD clock, not slots');
  r.h.artScreen({type:'artScreen',dates:3});assert.deepEqual(r.dialog(),[false]);
  r.h.artScreen({type:'artScreen',dates:0});assert.deepEqual(r.dialog(),[false,true]);
 }finally{r.done();}});

test('the current line drawn again before the hide fires cancels the pending hide (Codex #1267)',()=>{
 const r=rig();try{
  const t=story(r,2000);r.aux(t+5000,'KiriKiri2',OLD);r.aux(t+5300,'KiriKiri1',NOW);r.run(t+8000);
  assert.deepEqual(r.dialog(),[],'the backlog closed within the settling time: the restored dialogue stays');
  assert.equal(r.h.pastScreen,null);
 }finally{r.done();}});

test('the art scan counts the LOAD screen rows of the run as dated rows, dialogue rows not',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','native','PageLocator.cs'),'utf8');
 const m=/Regex DateRow = new System\.Text\.RegularExpressions\.Regex\(@"([^"]+)"\)/.exec(src);assert.ok(m,'DateRow pattern');
 const re=new RegExp(m[1].replace(/\\d/g,'[0-9]'));
 const count=rows=>rows.filter(x=>re.test(x)).length;
 assert.ok(count(['oa','0.01','30.02','NO. 03','NO. 04','NO. 05','NO. 06','2026 / 11 / 16 21:43','2026 / 11 / 26 21:50'])>=2);
 assert.equal(count(['SA\\Æ ◆ LOAD ◆ Q. S ◆ Q. L 崋 》 目 月 O X','当時、街には多くの人々が溢れていた。','4月12日（土）']),0);
 assert.equal(count(['2026年11月26日 21:43']),1);
 assert.match(src,/Emit\(new \{ type = "artScreen", dates = dates \}\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','core','gal-native.cjs'),'utf8'),/message\.type==='artScreen'\)\{this\.hooks\.artScreen/);});
