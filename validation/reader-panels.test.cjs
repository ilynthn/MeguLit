'use strict';
// 2026-11-13 reader panels「推镜」(option D): one module styles 点读卡 / 对话记录 / Alt+T; user settings stay adjustable.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('reader-panels loads before controls-b in both module lists',()=>{
 const json=JSON.parse(read('web/reader/modules.json'));assert.ok(json.indexOf('reader-panels')>0&&json.indexOf('reader-panels')<json.indexOf('controls-b'));
 assert.match(read('web/reader/module-list.js'),/"reader-panels","controls-b"\]/);
});
test('panel opacity, radius and border come from the user settings, not fixed values',()=>{
 const js=read('web/reader/modules/reader-panels.js');
 assert.match(js,/border-radius:var\(--tome-p-radius,18px\)/);assert.match(js,/rgba\(243,239,232,var\(--tome-p-border,\.08\)\)/);
 assert.match(js,/\.tome-menu-bg\{background-color:#0a090a!important\}/);assert.doesNotMatch(js,/\.tome-menu-bg\{[^}]*opacity/);
});
test('no ordinal numbering and motion that never keeps running',()=>{
 const js=read('web/reader/modules/reader-panels.js');
 assert.doesNotMatch(js,/counter\(|counter-increment/);
 assert.match(js,/onComplete:\(\)=>tl\.kill\(\)/);assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(js,/new URL\('\.\.\/vendor\/gsap\.min\.js',document\.baseURI\)/);
 assert.ok(fs.statSync(path.join(root,'web/vendor/gsap.min.js')).size>60000);
});
