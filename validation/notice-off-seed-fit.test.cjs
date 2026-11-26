'use strict';
// Start notice: a 以后不再提示 box at the bottom left; the The Seed dialog keeps its buttons inside a small window.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=f=>fs.readFileSync(path.join(__dirname,'../web',f),'utf8');

test('the start notice has a 以后不再提示 box that stops it opening by itself',()=>{
 const js=web('feedback-ui.js');
 for(const word of ["noticeOff: '当前版本不再提示'","noticeOff: 'このバージョンでは表示しない'","noticeOff: \"Don't show again for this version\""])assert.ok(js.includes(word),word);
 assert.match(js,/const noticeOffKey = 'megulit\.startupNoticeOff';/);
 assert.match(js,/if \(\(\(shownThisLaunch \|\| noticeOff\(\)\) && !force\) \|\| document\.querySelector\('\.dev-notice'\) \|\| !canShow\(\)\) return;/,'ticked: no start-up notice, an explicit open still works');
 assert.match(js,/<div class="dev-notice-offbar"><label class="dev-notice-off" title="\$\{esc\(t\.noticeOffTip\)\}"><input type="checkbox" data-notice-off\$\{noticeOff\(\) \? ' checked' : ''\}>/);
 assert.match(js,/\[data-notice-off\]'\)\.onchange = event => setNoticeOff\(event\.target\.checked\);/,'unticking turns the notice back on');
});

test('the box sits bottom left, level with the button row, in every page-1 layout',()=>{
 const css=web('unify.css');
 assert.match(css,/"succ upd" "more upd" "\. note" "off act";align-items:start\}/);
 assert.equal((css.match(/"more" "off" "act"\}\}/g)||[]).length,2,'both one-column layouts keep the box above the buttons');
 assert.match(css,/>\.dev-notice-offbar\{grid-area:off;align-self:end;justify-self:stretch;[^}]*padding:16px 0 18px;position:sticky;bottom:0;z-index:2;background:linear-gradient\(to bottom,transparent,var\(--t-panel-base\) 16px\)\}/,'a band like the button row: text scrolls away under a fade, not under the box');
 assert.match(css,/@media \(max-width:1000px\)\{[^{]*>\.dev-notice-offbar\{position:static;/,'one column: only the button row stays pinned');
 assert.match(css,/body \.dev-notice-off\{display:inline-flex;[^}]*color:var\(--g-gold,#edb56e\)/,'lit in the theme gold');
});

test('the The Seed dialog scrolls its body so the title and buttons stay inside',()=>{
 const css=web('the-seed.css');
 assert.match(css,/\.dev-notice\.seed-panel>\.dev-notice-scroll\{flex:1 1 0;min-height:0;overflow-y:auto\}/);
 assert.match(css,/\.dev-notice\.seed-panel>h2,\.dev-notice\.seed-panel>\.dev-notice-actions\{flex:none\}/);
});

test('the box is per version: ticked on one version, a newer version shows the notice once more', async () => {
 const m = await import(require('node:url').pathToFileURL(path.join(__dirname, '../web/feedback-ui.js')).href);
 const store = { v: null, getItem() { return this.v; } };
 assert.equal(m.noticeOff(store, '1.4.26'), false, 'never ticked');
 store.v = '1.4.26';
 assert.equal(m.noticeOff(store, '1.4.26'), true, 'ticked on this version');
 assert.equal(m.noticeOff(store, '1.4.27'), false, 'a new version asks again');
 store.v = '1';
 assert.equal(m.noticeOff(store, '1.4.26'), false, 'an old 以后不再提示 tick shows the notice once after updating');
});

test('the start notice closes from a single × in the corner', () => {
 const js = web('feedback-ui.js');
 assert.match(js, /class="startup-notice-close" data-notice-close autofocus title="\$\{esc\(t\.close\)\} \(Esc\)" aria-label="\$\{esc\(t\.close\)\}">×<\/button>/);
});
