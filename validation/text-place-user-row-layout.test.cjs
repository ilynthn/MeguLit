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
 assert.match(code,/const lineHeight = Math\.max\(\.9, 1\.25 \+ own\.lineHeight\);\s*set\(row, 'font-size', base \+ 'px'\); set\(row, 'line-height', String\(lineHeight\)\);/);
 /* Codex #1177: the width asked for is used as it is, narrower than the automatic one too, inside the room left */
 assert.match(code,/width = own\.width > 0 \? userRowWidth\(own, x0, L, R, size\) : /,'the user width is not a lower bound');
 const w=/const userRowWidth = \(own, x0, L, R, size\) => (Math\.max\(1, Math\.min\(R - x0, Math\.max\(size \* 4, \(R - L\) \* own\.width \/ 100\)\)\));/.exec(code);
 assert.ok(w,'userRowWidth exists');
 const width=new Function('R','x0','L','size','own','return '+w[1]+';');
 assert.equal(width(1000,0,0,30,{width:30}),300,'30 % of a 1000 px box is 300 px even though the Japanese spans 600 px');
 assert.equal(width(1000,700,0,30,{width:90}),300,'never past the room to the right');
 assert.equal(width(1000,0,0,30,{width:5}),120,'never under four characters');
});
/* RRFZ #1177: the page's rows (applyPage) follow the same user width and spacing, and a squeeze never opens a tight spacing up */
test('applyPage uses the user row layout',()=>{
 const page=/function applyPage\(\) \{[\s\S]*?\n  \}\r?\n/.exec(code);
 assert.ok(page,'applyPage found');
 assert.match(page[0],/const own = userRowLayout\(b\.galPreferences\?\.\(\) \|\| \{\}\), \[L, , R\] = map\.bounds \|\| \[0, 0, innerWidth\];/);
 assert.match(page[0],/set\(row, 'width', \(own\.width > 0 \? userRowWidth\(own, x0, L, R, size\) : Math\.max\(pageRight - x0/);
 assert.match(page[0],/if \(own\.lineHeight\) set\(row, 'line-height', String\(Math\.max\(\.9, 1\.25 \+ own\.lineHeight\)\)\); else row\.style\.removeProperty\('line-height'\);/,'back to the stylesheet when the spacing is reset');
 assert.match(page[0],/set\(row, 'font-size', base \+ 'px'\);\s*\/\*[\s\S]*?\*\/\s*for \(const o of row\.querySelectorAll\('\*'\)\) \{ set\(o, 'font-size', 'inherit'\); if \(own\.lineHeight\) set\(o, 'line-height', 'inherit'\); else o\.style\.removeProperty\('line-height'\); \}/,'RRFZ #1289 review 4: the translation inside the row inherits the spacing under the game style too');
 assert.match(page[0],/const free = Math\.max\(1, right - x0 - 8\); set\(row, 'width', \(own\.width > 0 \? Math\.min\(free, userRowWidth\(own, x0, L, R, size\)\) : free\) \+ 'px'\);/,'a retained bitmap page keeps its free band as the outer limit');
});
test('an overflowing placed row is squeezed to 1.1 only from a taller spacing',()=>{
 const m=/if \(rh > room && (lineHeight > 1\.1)\) \{ set\(row, 'line-height', '1\.1'\);/.exec(code);
 assert.ok(m,'the squeeze is guarded');
 assert.doesNotMatch(code,/if \(rh > room\) \{ set\(row, 'line-height', '1\.1'\)/);
 const squeeze=offset=>new Function('lineHeight','return '+m[1]+';')(Math.max(.9,1.25+offset));
 assert.equal(squeeze(0),true,'default 1.25 is squeezed');
 assert.equal(squeeze(-.3),false,'0.95 chosen by the user stays');
 assert.equal(squeeze(-.15),false,'1.1 stays');
});
