// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Furigana font: Noto Sans JP ships with MeguLit (web/fonts, SIL OFL 1.1) and is the default. It must load from the bundled
   file whether or not the PC has the font installed, be listed (and marked as bundled, not "system font" or "requires
   installation") in the Alt+T 文字 → 注音字体 list and in the home text settings, and users still on the pre-v1.2.2 default
   ('round', Meiryo) move to it once, while a font they picked themselves stays. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { setTimeout: sleep } = require('node:timers/promises');

const ROOT = path.join(__dirname, '..');
const web = path.join(ROOT, 'web');
const hasEdge = [process.env.MEGULIT_EDGE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(file => file && fs.existsSync(file));

function tempRoot(name) {
 return fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-' + name + '-'));
}
function remove(dir) {
 try { fs.rmSync(dir, {recursive:true, force:true, maxRetries:10, retryDelay:150}); }
 catch (error) { if (!['EBUSY','EPERM','ENOTEMPTY'].includes(error?.code)) throw error; }
}

test('the furigana font defaults to Noto Sans JP for a new user (shared settings and the reader copy)', () => {
 for (const file of ['../core/game-style.js', '../web/reader/modules/game-style.js']) {
  const gs = require(file);
  assert.equal(gs.defaults.rubyFont, 'notoSansJP', file);
  assert.equal(gs.clean({}).rubyFont, 'notoSansJP', file + ': nothing saved yet');
  assert.match(gs.japaneseFonts.notoSansJP, /^"Noto Sans JP",/, file + ': the family the reader paints furigana with');
  /* listed first and flagged as bundled; other choices keep their own kind */
  assert.deepEqual(gs.fontOptions.rubyFont[0], ['notoSansJP', 'Noto Sans JP', 'sans', 'bundled'], file);
  assert.equal(gs.fontOptions.rubyFont.filter(([id]) => id === 'notoSansJP').length, 1, file + ': listed once');
  assert.ok(gs.fontOptions.rubyFont.some(([id]) => id === 'round'), file + ': Meiryo is still a choice');
  /* a font picked by hand is still accepted */
  assert.equal(gs.clean({rubyFont:'mincho'}).rubyFont, 'mincho', file);
 }
 const {fields} = require('../services/settings-schema.cjs');
 const field = fields.find(f => f.scope === 'text' && f.key === 'rubyFont');
 const noto = field.options.find(o => o.value === 'notoSansJP');
 assert.ok(noto, 'home text settings list Noto Sans JP');
 assert.match(JSON.stringify(noto), /自带/);
 assert.match(JSON.stringify(noto), /bundled/);
 assert.match(JSON.stringify(noto), /同梱/);
 assert.equal(field.options[0].value, 'notoSansJP', 'first in the home list too');
});

test('users still on the old default (Meiryo) move to Noto Sans JP once; fonts picked by hand stay', () => {
 const {openStore} = require('../services/store.cjs');
 const {Settings} = require('../services/settings.cjs');
 const dir = tempRoot('ruby-font'), cfg = path.join(dir, 'data', 'config');
 fs.mkdirSync(cfg, {recursive:true});
 const write = (name, value) => fs.writeFileSync(path.join(cfg, name), JSON.stringify(value));
 const read = name => JSON.parse(fs.readFileSync(path.join(cfg, name), 'utf8'));
 write('gal-preferences.json', {rubyFont:'round', chineseFont:'simhei', japaneseSize:40});
 write('text-defaults.json', {rubyFont:'round', textColor:'#ffeedd'});
 write('game-style-profiles.json', {version:3, entries:{
  old: {name:'old', prefs:{rubyFont:'round', japaneseSize:38}, history:[{savedAt:1, prefs:{rubyFont:'round'}}, {savedAt:2, prefs:{rubyFont:'mincho'}}]},
  picked: {name:'picked', prefs:{rubyFont:'yuGothic'}},
  inherit: {name:'inherit', prefs:{rubyFont:'inherit'}},
  current: {name:'current', prefs:{rubyFont:'notoSansJP'}},
  unset: {name:'unset', prefs:{japaneseSize:30}},
 }});
 try {
  openStore(dir).close();
  const g = read('gal-preferences.json'), p = read('game-style-profiles.json').entries, preset = read('text-defaults.json');
  assert.equal(g.rubyFont, 'notoSansJP');
  assert.equal(g.chineseFont, 'simhei', 'other settings untouched');
  assert.equal(g.japaneseSize, 40);
  assert.equal(preset.rubyFont, 'notoSansJP');
  assert.equal(preset.textColor, '#ffeedd');
  assert.equal(p.old.prefs.rubyFont, 'notoSansJP');
  assert.equal(p.old.prefs.japaneseSize, 38);
  assert.equal(p.old.history[0].prefs.rubyFont, 'notoSansJP');
  assert.equal(p.old.history[1].prefs.rubyFont, 'mincho', 'a hand-picked font in the history stays');
  assert.equal(p.picked.prefs.rubyFont, 'yuGothic');
  assert.equal(p.inherit.prefs.rubyFont, 'inherit');
  assert.equal(p.current.prefs.rubyFont, 'notoSansJP');
  assert.equal(p.unset.prefs.rubyFont, undefined, 'nothing saved: the default already applies');
  /* what the home text settings show afterwards */
  assert.equal(new Settings(dir).read('text').rubyFont, 'notoSansJP');

  /* the user picks Meiryo after the migration: the next start keeps it */
  write('gal-preferences.json', {rubyFont:'round'});
  openStore(dir).close();
  assert.equal(read('gal-preferences.json').rubyFont, 'round');
 } finally {
  remove(dir);
 }
});

test('the reader loads the bundled Noto Sans JP for furigana and lists it as bundled', {skip:!hasEdge && 'Edge not installed', timeout:120000}, async () => {
 const {startEdge} = require('./library-views-perf.cjs');
 const types = {'.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2'};
 const temp = tempRoot('ruby-font-edge');
 const served = [];
 const stub = `<script>(${function () {
  localStorage.clear();
  window.__TAURI_INTERNALS__ = {transformCallback: () => 1, invoke: async (cmd, args) => {
   if (cmd !== 'service') return null;
   const {action} = args.request;
   if (action === 'home') return {preferences:{language:'zh', themeMode:'dark'}, games:[]};
   if (action === 'ui_state') return {};
   if (action === 'reader_bootstrap') return {engines:[], native:{}};
   if (action === 'reader_message') return {replies:[]};
   return {};
  }};
 }.toString()})();</script>`;
 const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(web, rel);
  served.push(rel);
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const content = fs.readFileSync(file);
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  res.end(rel === '/reader/index.html' ? String(content).replace('<head>', '<head>' + stub) : content);
 });
 let cdp;
 const waitFor = async (condition, timeout = 20000) => {
  const deadline = performance.now() + timeout;
  do { if (await cdp.evaluate(condition).catch(() => false)) return; await sleep(50); } while (performance.now() < deadline);
  assert.fail(condition + ' did not become true');
 };
 try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cdp = await startEdge(path.join(temp, 'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:1280, height:720, deviceScaleFactor:1, mobile:false});
  const url = `http://127.0.0.1:${server.address().port}/reader/index.html`;
  const navigation = await cdp.send('Page.navigate', {url});
  assert.ok(!navigation.errorText, navigation.errorText);
  await waitFor('!!window.__TOME_READER_READY__');

  /* The furigana font the reader paints with, and whether that face is the bundled file (served by this test's server). */
  const font = await cdp.evaluate(`(async () => {
   const family = getComputedStyle(document.documentElement).getPropertyValue('--tomoyo-ruby-font').trim();
   const faces = await document.fonts.load('24px ' + family, 'ふりがなカタカナー、。');
   return {family, loaded: faces.map(f => f.family + ':' + f.status), check: document.fonts.check('24px ' + family, 'ふりがなカタカナー、。')};
  })()`);
  assert.match(font.family, /^"Noto Sans JP"/, 'the default furigana family');
  assert.ok(font.loaded.includes('Noto Sans JP:loaded'), JSON.stringify(font));
  assert.equal(font.check, true, 'document.fonts.check: the furigana glyphs are ready in Noto Sans JP');
  assert.ok(served.includes('/fonts/NotoSansJP.woff2'), 'the face came from the bundled web/fonts/NotoSansJP.woff2, not a system install');

  /* Alt+T → 文字 → 注音字体 */
  const key = {code:'KeyT', key:'t', modifiers:1, windowsVirtualKeyCode:84};
  await cdp.send('Input.dispatchKeyEvent', {type:'rawKeyDown', ...key});
  await cdp.send('Input.dispatchKeyEvent', {type:'keyUp', ...key});
  await waitFor(`!!document.querySelector('.tomoyo-cn-dialog select[name=galRubyFont] option[value=notoSansJP]')`);
  const list = await cdp.evaluate(`(() => {
   const select = document.querySelector('.tomoyo-cn-dialog select[name=galRubyFont]');
   const option = select.querySelector('option[value=notoSansJP]');
   return {value: select.value, first: select.options[0].value, name: option.dataset.fontName, note: option.dataset.fontNote,
    meiryo: select.querySelector('option[value=round]')?.dataset.fontNote || ''};
  })()`);
  assert.equal(list.value, 'notoSansJP', 'selected by default');
  assert.equal(list.first, 'notoSansJP');
  assert.equal(list.name, 'Noto Sans JP');
  assert.match(list.note, /自带/, 'marked as bundled: ' + list.note);
  assert.doesNotMatch(list.note, /系统字体|需本机安装/);
  assert.ok(list.meiryo, 'the other choices keep their notes');
 } finally {
  await cdp?.stop();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  remove(temp);
 }
});
