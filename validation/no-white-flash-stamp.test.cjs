// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 user: the stage-clear stamp must not flash the whole screen white (photosensitive viewers, sudden) */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
test('the reward stamp never inverts or whitens the screen',()=>{
 const r=fs.readFileSync(path.join(__dirname,'..','web','rewards.js'),'utf8');assert.doesNotMatch(r,/invert\(/);
 const c=fs.readFileSync(path.join(__dirname,'..','web','grammar.css'),'utf8'),m=c.match(/\.rw-lines\{[^}]*\}/);assert.ok(m);
 assert.doesNotMatch(m[0],/rgba\(255,255,255,\.[5-9]/,'rays stay faint');
});
