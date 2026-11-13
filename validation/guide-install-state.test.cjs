// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 Settings guides: a download CTA reads the real install state. An installed pack shows ✓ 已就绪, not a download button,
   and the settings page refuses to start a download for an installed pack. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const web=path.join(__dirname,'..','web');
test('guide action markup: installed pack → ready mark, missing pack → download button',async()=>{
 const g=await import(pathToFileURL(path.join(web,'settings-guides.js')).href);
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const ready=g.guideActionMarkup('reading',{installed:{reading:true},locale:'zh',esc});
 assert.match(ready,/guide-ready/);assert.match(ready,/已就绪/);assert.doesNotMatch(ready,/<button/);assert.doesNotMatch(ready,/data-guide-act/);
 const missing=g.guideActionMarkup('reading',{installed:{reading:false},locale:'zh',esc});
 assert.match(missing,/<button[^>]*data-guide-act="reading"/);assert.match(missing,/一键下载注音词典/);
 for(const locale of ['en','ja'])assert.doesNotMatch(g.guideActionMarkup('voice',{installed:{voice:true},locale,esc}),/<button/);
 assert.match(g.guideActionMarkup('ankiCheck',{installed:{},locale:'zh',esc}),/检查 Anki 连接/);
});
test('settings page passes the real pack state to the guide and never downloads an installed pack',()=>{
 const s=fs.readFileSync(path.join(web,'settings.js'),'utf8');
 assert.match(s,/installed\[p\.id\]=!!p\.installed/,'guide gets install state from pack_status');
 assert.match(s,/mountGuide\(\{[^}]*installed,/,'install state reaches mountGuide');
 assert.match(s,/if\(now\?\.installed\)\{toast\(ready\);return;\}await api\('pack_download'/,'click re-checks state before downloading');
 assert.match(fs.readFileSync(path.join(web,'settings-grimoire.css'),'utf8'),/\.guide-ready\{/);
});
