// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 Cardinal: the start-up segment before the kernel leaves its initial read mode is not scored (core/cardinal/warmup.cjs),
   and a tape snapshot keeps the bridge's last hookStatus in its head (core/cardinal/tape.cjs). */
const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../core/cardinal/warmup.cjs'),Tape=require('../core/cardinal/tape.cjs');
const T0=Date.parse('2026-11-26T07:20:00.000Z'),iso=ms=>new Date(T0+ms).toISOString();
const ev=(ms,text)=>iso(ms)+' '+text;
const run=(events,extra={})=>({name:'r',steps:[{t:0,hb:{type:'hookSource',text:'あ'}},{t:1,hb:{type:'hookSource',text:'い'}}],
 o:{t0:T0,hookEvents:events,samples:[{at:100},{at:2000},{at:3000},{at:9000}],hbSent:[{at:50,type:'disable',reason:'reader-profile'},{at:4000,type:'enable'}],
  sourceEpisodes:[{step:0,line:1,text:'あ',at:1500},{step:1,line:2,text:'い',at:5000}],...extra}});

test('until: the first lasting switch away from an initial read mode',()=>{
 assert.equal(W.until(run([ev(294,'render mode switched in place read -> custom'),ev(2742,'render mode switched in place custom -> read'),ev(2749,'render mode switched in place read -> custom'),ev(2752,'render mode switched in place custom -> embed')])),2749);
 assert.equal(W.until(run([ev(500,'render mode switched in place custom -> embed')])),0,'did not start in read mode');
 assert.equal(W.until(run([])),0);
 assert.equal(W.until(run([ev(500,'render mode switched in place read -> custom'),ev(6000,'render mode switched in place custom -> read')])),500,'a switch back after STABLE_MS is a real read mode, counted');
 assert.equal(W.until(run([ev(500,'render mode switched in place read -> custom'),ev(900,'render mode switched in place custom -> read')])),0,'never leaves read mode for good: no cut');});

test('cut: samples, messages, events and lines before it are left out and counted; nothing after',()=>{
 const r=run([ev(10,'check baseline x'),ev(2749,'render mode switched in place read -> custom')]);const c=W.cut(r);
 assert.deepEqual(c.warmup,{until:2749,droppedSamples:2,keptSamples:2,droppedLines:1});
 assert.deepEqual(c.run.o.samples.map(s=>s.at),[3000,9000]);assert.deepEqual(c.run.o.hbSent.map(m=>m.type),['enable']);
 assert.equal(c.run.o.hookEvents.length,1);assert.deepEqual(c.run.o.sourceEpisodes.map(e=>e.step),[1]);
 assert.equal(c.run.steps.filter(s=>s.hb.type==='hookSource').length,1,'the dropped line is no dialogue line');assert.equal(c.run.steps.length,2,'step indexes kept');
 assert.equal(r.o.samples.length,4,'input unchanged');
 const same=run([]);assert.equal(W.cut(same).run,same);assert.equal(W.cut(same).warmup,null);});

test('score: reports the cut; thresholds are the same',()=>{const S=require('../core/cardinal/score.cjs');
 const r=S.score(run([ev(2749,'render mode switched in place read -> custom')]),{});assert.equal(r.warmup.droppedSamples,2);
 assert.equal(S.score(run([]),{}).warmup,null);});

test('tape: the last hookStatus stays in the head of a snapshot',()=>{Tape.clear();Tape.keep(10);
 Tape.record('hb',{type:'hookProcess',path:'g.exe'},1);Tape.record('hb',{type:'hookStatus',replacementState:'disabled',hookActive:true},2);
 for(let i=0;i<40;i++)Tape.record('hb',{type:'hookSource',text:'台詞'+i},10+i);
 const snap=Tape.snapshot(10);const st=snap.rows.filter(r=>r.hb?.type==='hookStatus');assert.equal(st.length,1);assert.equal(st[0].hb.replacementState,'disabled');Tape.clear();});
