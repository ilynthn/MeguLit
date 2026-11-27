'use strict';
/* E458 start notice: what success looks like + a second tutorial page; the top bar 指南 panel opens it again */
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const web = path.join(__dirname, '..', 'web');
const read = name => fs.readFileSync(path.join(web, name), 'utf8');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('tutorial exists in zh / ja / en with the same sections', async () => {
  const g = await import(pathToFileURL(path.join(web, 'guide-content.js')).href);
  const shape = l => g.GUIDE[l].sections.map(s => s.level ? 'level' : (s.keys || s.steps).length).join(',');
  /* 2026-11-12 the by-level section is the plan for the chosen level: every level has the same number of tips in each language */
  const lv = await import(pathToFileURL(path.join(web, 'guide-levels.js')).href);
  for (const id of lv.LEVEL_IDS) for (const l of ['ja', 'en']) assert.strictEqual(lv.LEVEL_TIPS[l].tips[id].length, lv.LEVEL_TIPS.zh.tips[id].length, l + ' ' + id);
  assert.match(lv.levelSectionHTML('zh', 'N3', esc), /你的水平：N3/);assert.match(lv.levelSectionHTML('en', null, esc), /No level yet/);
  assert.strictEqual(shape('ja'), shape('zh'));
  assert.strictEqual(shape('en'), shape('zh'));
  for (const l of ['zh', 'ja', 'en']) {
    assert.strictEqual(g.SUCCESS[l].steps.length, 3);
    const html = g.guideHTML(l, esc) + g.successHTML(l, esc);
    assert.match(html, /<kbd>Alt\+T<\/kbd>/);
    assert.match(html, /<kbd>Alt\+H<\/kbd>/);
    assert.doesNotMatch(html, /\[\[/);
  }
});

test('every hotkey in the tutorial is a real reader hotkey', async () => {
  const g = await import(pathToFileURL(path.join(web, 'guide-content.js')).href);
  const reader = read('reader/modules/settings.js');
  const keys = new Set(JSON.stringify(g.GUIDE).match(/Alt\+[A-Z]/g));
  /* Alt+M (bind the window in front) is a global hotkey the native bridge registers, not a key the reader page handles */
  const native = fs.readFileSync(path.join(web, '..', 'native', 'GalWindowBridge.cs'), 'utf8');
  for (const k of keys) {
    const registered = new RegExp(`RegisterHotKey\\(IntPtr\\.Zero,0x5[0-9a-f]{2},0x4001,0x${k.slice(-1).charCodeAt(0).toString(16)}\\)`, 'i').test(native);
    if (!registered) assert.match(reader, new RegExp(`altKey && event\\.code === 'Key${k.slice(-1)}'`), k);
  }
});

test('notice has two pages and the guide panel is reachable from the top bar', () => {
  const ui = read('feedback-ui.js'), app = read('app.js');
  for (const hook of ['data-page="1"', 'data-page="2"', 'data-next', 'data-back', 'data-ok', 'export function openGuide', "api('site_updates'", "kind: 'game'"]) assert.ok(ui.includes(hook), hook);
  for (const tab of ['updates', 'guide', 'report', 'game']) assert.ok(ui.includes(`['${tab}', t.tab`), tab);
  for (const l of ['zh', 'ja', 'en']) assert.ok(/next:.*back:.*done:.*guide:/.test(ui.split(`  ${l}: {`)[1] || ''), l);
  assert.ok(app.indexOf('data-top-guide') < app.indexOf("['tools','settings','about']"));
  assert.match(app, /\[data-top-guide\]'\)\?\.addEventListener\('click',\(\)=>.*openGuide/);
});
