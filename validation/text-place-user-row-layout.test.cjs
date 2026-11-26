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
});
