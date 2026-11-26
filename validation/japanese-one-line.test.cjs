/* SPDX-License-Identifier: GPL-3.0-or-later */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const style=require('../core/game-style.js'),profile=require('../core/game-profile.js'),schema=require('../services/settings-schema.cjs');
test('japaneseOneLine is off by default and only true turns it on',()=>{
 assert.equal(style.defaults.japaneseOneLine,false);
 assert.equal(style.clean({}).japaneseOneLine,false);
 assert.equal(style.clean({japaneseOneLine:'yes'}).japaneseOneLine,false);
 assert.equal(style.clean({japaneseOneLine:true}).japaneseOneLine,true);
});
test('japaneseOneLine is a per-work text key and a settings field',()=>{
 assert.ok(profile.textKeys.includes('japaneseOneLine'));
 const text=fs.readFileSync(path.join(root,'services','settings-schema.cjs'),'utf8');
 assert.match(text,/bool\('text','japaneseOneLine'/);
});
test('reader copies carry the key, the checkbox, the no-wrap rule and the fit',()=>{
 const gs=fs.readFileSync(path.join(root,'web','reader','modules','game-style.js'),'utf8'),gp=fs.readFileSync(path.join(root,'web','reader','modules','game-profile.js'),'utf8'),gal=fs.readFileSync(path.join(root,'web','reader','modules','gal.js'),'utf8');
 assert.match(gs,/japaneseOneLine: false/);assert.match(gs,/'translationInline','japaneseOneLine'/);assert.match(gp,/'japaneseOneLine'/);
 assert.match(gal,/name="galJapaneseOneLine"/);assert.match(gal,/japaneseOneLine:'galJapaneseOneLine'/);
 assert.match(gal,/megulit-jp-one-line[^{]*\.sentence-text[^{]*\{[^}]*white-space:nowrap/);
 assert.match(gal,/--megulit-jp-one-line-scale/);
});
/* RRFZ #1177: a larger Japanese size or a resized game changes no text, so the fit has to be asked for on every apply and layout */
test('the one-line fit is redone on every apply and game layout while it is on',()=>{
 const gal=fs.readFileSync(path.join(root,'web','reader','modules','gal.js'),'utf8');
 const apply=/function apply\(\) \{[\s\S]*?\n  \}\r?\n/.exec(gal)[0];
 assert.match(apply,/const oneLine = preferences\.japaneseOneLine === true, oneLineChanged = document\.body\.classList\.contains\('megulit-jp-one-line'\) !== oneLine;/);
 assert.match(apply,/if \(oneLineChanged \|\| oneLine\) bridge\.japaneseOneLineFit\?\.\(\);/);
 const layout=/bridge\.galLayout = layout => \{[\s\S]*?\n  \};/.exec(gal)[0];
 assert.match(layout,/if \(preferences\.japaneseOneLine === true\) bridge\.japaneseOneLineFit\?\.\(\);/);
});
test('the room ends at the nearer of the game edge and the reading box edge',()=>{
 const gal=fs.readFileSync(path.join(root,'web','reader','modules','gal.js'),'utf8');
 const m=/const box = text\.closest\('\.sentence-window'\)\?\.getBoundingClientRect\(\), gameRight = (area \? area\.left \+ area\.width : window\.innerWidth);\s*const right = (box && box\.width > 0 \? Math\.min\(gameRight, box\.right\) : gameRight), room/.exec(gal);
 assert.ok(m,'right edge rule found');
 const right=(area,box)=>{const window={innerWidth:1920};const gameRight=eval(m[1]);return eval(m[2]);};
 assert.equal(right({left:0,width:1600},{width:800,right:1000}),1000,'narrow box');
 assert.equal(right({left:0,width:1600},{width:1800,right:1800}),1600,'box past the game');
 assert.equal(right(null,{width:0,right:0}),1920,'no box measured: the layer edge');
});
