/* SPDX-License-Identifier: GPL-3.0-or-later */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','text-place.js'),'utf8');
const body=/const userRowLayout = prefs => \{[\s\S]*?\n  \};/.exec(code);
test('the placed-row translation uses the user width and line spacing, defaults stay game-following',()=>{
 assert.ok(body,'userRowLayout exists');
 const userRowLayout=new Function(body[0]+'\nreturn userRowLayout;')();
 assert.deepEqual(userRowLayout({}),{width:0,lineHeight:0});
 assert.deepEqual(userRowLayout({translationWidth:75,translationLineHeight:0}),{width:0,lineHeight:0});
 assert.deepEqual(userRowLayout({translationWidth:0}),{width:0,lineHeight:0});
 assert.deepEqual(userRowLayout({translationWidth:90,translationLineHeight:.4}),{width:90,lineHeight:.4});
 assert.deepEqual(userRowLayout({translationWidth:300,translationLineHeight:9}),{width:0,lineHeight:3});
 assert.match(code,/const own = userRowLayout\(b\.galPreferences\?\.\(\) \|\| \{\}\);/);
 assert.match(code,/set\(row, 'line-height', String\(Math\.max\(\.9, 1\.25 \+ own\.lineHeight\)\)\)/);
 /* Codex #1177: the width asked for is used as it is, narrower than the automatic one too, inside the room left */
 const w=/width = own\.width > 0 \? (Math\.max\(1, Math\.min\(R - x0, Math\.max\(size \* 4, \(R - L\) \* own\.width \/ 100\)\)\))/.exec(code);
 assert.ok(w,'the user width is not a lower bound');
 const width=new Function('R','x0','L','size','own','return '+w[1]+';');
 assert.equal(width(1000,0,0,30,{width:30}),300,'30 % of a 1000 px box is 300 px even though the Japanese spans 600 px');
 assert.equal(width(1000,700,0,30,{width:90}),300,'never past the room to the right');
 assert.equal(width(1000,0,0,30,{width:5}),120,'never under four characters');
});
