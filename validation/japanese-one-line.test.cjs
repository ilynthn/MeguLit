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
