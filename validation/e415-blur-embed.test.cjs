// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E415 (player report on 1.3.9, 穢翼のユースティア): 「译文模糊（悬停显示）」 did nothing while 「译文由游戏自己显示」 was on,
// because the game drew the Chinese itself (its pixels cannot be blurred from the overlay), and the setting was dropped
// by the service-side preference cleaner. With blur on, the translation is MeguLit's own.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('translationBlur survives the service-side preference cleaner',()=>{
 const g=require('../core/game-style.js');assert.equal(g.clean({translationBlur:true}).translationBlur,true);assert.equal(g.clean({}).translationBlur,false);});
test('blur on: the game is not asked to draw the translation',()=>{
 const h=read('core/hook-native.cjs'),c=read('core/hook-control.cjs');
 assert.match(h,/preferences\.embedTranslation===true&&preferences\.translationBlur!==true\)/);
 assert.match(h,/!hideOnly&&this\.preferences\?\.embedTranslation===true&&this\.preferences\?\.translationBlur!==true\);/);
 assert.doesNotMatch(h,/autoTranslateEmbed/,'QQ #1141: no page game is switched to game-drawn translation by itself');
 assert.match(c,/embedTranslation===true&&h\.preferences\?\.translationBlur!==true/);});
