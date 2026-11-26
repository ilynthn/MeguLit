// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 the cold run's Cardinal tape holds the reading-pace lines before Ctrl (Monochrome Empire r4: 60 lines at reading pace, 40
   with Ctrl, a 60-line tape, all of it in the fast span, Cardinal scored 0 lines) */
const test=require('node:test'),assert=require('node:assert/strict');
const {tapeOfRun,TAPE_SLOW,TAPE_FAST}=require('../services/cold-test-run.cjs');
const Tape=require('../core/cardinal/tape.cjs');

function fill(n,t0,step){Tape.clear();Tape.keep(400);for(let i=0;i<n;i++)Tape.record('hb',{type:'hookSource',text:'台詞'+i+'。'},t0+i*step);}

test('a run with a Ctrl span keeps the span and the reading-pace lines before it',()=>{const t0=Date.parse('2026-11-26T11:00:00Z');fill(100,t0,1000);
 const res={phases:[{name:'fast',at:new Date(t0+60*1000).toISOString(),lines:60}]};
 const snap=tapeOfRun(res);assert.equal(snap.lines,40+TAPE_SLOW,'40 Ctrl lines and 60 before them');
 const src=snap.rows.filter(r=>r.hb?.type==='hookSource');assert.equal(src[0].hb.text,'台詞0。');assert.equal(src.at(-1).hb.text,'台詞99。');});

test('a long Ctrl span still keeps the 60 reading-pace lines before it, and only its ends; without Ctrl the whole kept run',()=>{const t0=Date.parse('2026-11-26T11:00:00Z');fill(300,t0,1000);
 const snap=tapeOfRun({phases:[{name:'fast',at:new Date(t0+200*1000).toISOString()}]});assert.equal(snap.lines,TAPE_FAST+TAPE_SLOW,'a Ctrl span over TAPE_FAST keeps its first and last halves');
 const texts=snap.rows.filter(r=>r.hb?.type==='hookSource').map(r=>r.hb.text);assert.equal(texts[0],'台詞140。');assert.equal(texts.at(-1),'台詞299。');
 assert.ok(texts.includes('台詞229。')&&!texts.includes('台詞230。')&&!texts.includes('台詞269。')&&texts.includes('台詞270。'));assert.equal(snap.fastDropped,40);
 assert.equal(tapeOfRun({phases:[]}).lines,300);assert.equal(tapeOfRun({}).lines,300);Tape.clear();});

test('the worker keeps more than the in-memory default of 60 lines',()=>{const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','services','cold-test-run.cjs'),'utf8');
 assert.match(src,/require\('\.\.\/core\/cardinal\/tape\.cjs'\)\.keep\(TAPE_KEEP\)/);assert.match(src,/const snap=tapeOfRun\(res\)/);});
