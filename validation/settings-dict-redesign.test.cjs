// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 Settings → 辞典与解释 redesign (option D): runtime component rows, the engine comparison rows and the stylesheet wiring */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const web=path.join(__dirname,'..','web'),load=f=>import(pathToFileURL(path.join(web,f)).href),read=f=>fs.readFileSync(path.join(web,f),'utf8');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MB=1048576,w={installed:'已安装',missing:'未安装',downloading:'下载中',unpack:'解压中',queued:'等待中',error:'失败',cancel:'取消',download:'下载',retry:'重试',required:'必需',requiredTip:'tip',archives:'通用封包解包（GARbro）',archivesNote:'解开游戏的加密封包',voice:'语音引擎 AivisSpeech',voiceNote:'x'};

test('component rows: every installed pack reads 必需 (GARbro included), never an uninstall button',async()=>{
 const {packRowHtml}=await load('runtime-packs.js');
 const garbro=packRowHtml({id:'archives',size:9*MB,installed:true,onDemand:true,license:'GARbro (MIT)'},w,esc);
 assert.match(garbro,/class="rpk-required"[^>]*>必需</);assert.match(garbro,/解开游戏的加密封包/);
 assert.doesNotMatch(garbro,/<button|卸载|data-remove|按需/);
 assert.match(garbro,/<b>9<\/b>MB/);
 const src=read('runtime-packs.js');assert.doesNotMatch(src,/pack_uninstall|data-remove/);
});
test('component rows: missing → download button for that pack, downloading → cancel and a gold progress value',async()=>{
 const {packRowHtml,sizeParts}=await load('runtime-packs.js');
 const missing=packRowHtml({id:'voice',size:280*MB,installed:false},w,esc);
 assert.match(missing,/data-pack-act="download" data-pack="voice">下载</);assert.match(missing,/data-k="none"/);
 const busy=packRowHtml({id:'voice',size:280*MB,installed:false,job:{state:'downloading',received:140*MB,total:280*MB}},w,esc);
 assert.match(busy,/data-pack-act="cancel">取消</);assert.match(busy,/--p:50\.0/);assert.match(busy,/下载中 50%/);
 const failed=packRowHtml({id:'voice',size:280*MB,installed:false,job:{state:'error',error:'网络断开'}},w,esc);
 assert.match(failed,/>重试</);assert.match(failed,/失败：网络断开/);
 assert.deepEqual(sizeParts(1.5*1073741824),['1.5','GB']);assert.deepEqual(sizeParts(107*MB),['107','MB']);
});
test('engine comparison: two rows split the same line, the current one is checked, three languages',async()=>{
 const {engineRowsHtml}=await load('settings-help.js');
 for(const locale of ['zh','en','ja']){const html=engineRowsHtml('sudachi',locale);
  assert.equal((html.match(/role="radio"/g)||[]).length,2,locale);
  assert.match(html,/data-engine="sudachi"/);assert.match(html,/aria-checked="true" data-engine="sudachi"/);assert.match(html,/aria-checked="false" data-engine="unidic"/);
  assert.equal((html.match(/tk-diff/g)||[]).length,3,'スカイツリー vs スカイ|ツリー marked '+locale);
  assert.match(html,/<ruby>東京<rt>とうきょう<\/rt><\/ruby>/);}
 assert.match(engineRowsHtml('unidic','zh'),/aria-checked="true" data-engine="unidic"/);
 assert.match(engineRowsHtml('sudachi','zh'),/正在使用/);assert.match(engineRowsHtml('sudachi','zh'),/改用/);
 const help=read('settings-help.js');assert.doesNotMatch(help,/engine-explanation/);assert.match(help,/select\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
});
test('stylesheet: settings-dict.css is loaded last and keeps the shared grid',()=>{
 const html=read('index.html'),links=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m=>m[1]);
 assert.equal(links.at(-1),'settings-dict.css');
 const css=read('settings-dict.css');
 assert.match(css,/\.rpk-row\{[^}]*grid-template-columns:20px 220px minmax\(0,1fr\) 72px 132px 84px/);
 assert.match(css,/\.rpk-eng\{[^}]*grid-template-columns:256px 440px minmax\(0,1fr\) 84px/);
 assert.match(css,/\.settings-guide\[data-guide=dictionary\]/);assert.match(css,/prefers-reduced-motion/);
 assert.match(read('settings-guides.js'),/card\.dataset\.guide = section/);
});
