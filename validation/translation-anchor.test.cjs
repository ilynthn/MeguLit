// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = process.env.MEGULIT_ANCHOR_TARGET || path.join(__dirname, '..');
const fit = require(path.join(root, 'web/reader/modules/game-fit.js'));

function style() {
  const values = new Map();
  return { getPropertyValue: k => values.get(k) || '', setProperty: (k, v) => values.set(k, v), removeProperty: k => values.delete(k), get top() { return values.get('top') || ''; } };
}

// Execute the real pin function. Rectangles here are a controlled geometry seam,
// not a browser layout or evidence that text was visible in a game.
function anchored({ center = false, grows = false, y = 560, jpHeight = 40 } = {}) {
  const source = fs.readFileSync(path.join(root, 'web/reader/modules/text-place.js'), 'utf8');
  const pin = source.slice(source.indexOf('  function pin('), source.indexOf('  function release('));
  const setters = source.slice(source.indexOf('  function closeRows('), source.indexOf('\n', source.indexOf('  function set(')));
  const classes = { add() {} };
  let height = 20;
  const rect = (top, h, left = 100, width = 600) => ({ top, bottom: top + h, left, right: left + width, width, height: h });
  const win = { style: style(), classList: classes, getBoundingClientRect: () => rect(Number.parseFloat(win.style.top) || 0, jpHeight + height), querySelector: q => q === '.tomoyo-cn-row' ? row : null };
  const top = () => Number.parseFloat(win.style.top) || 0;
  const token = { closest: () => null, getBoundingClientRect: () => rect(top(), 30, 100, 30) };
  const sentence = { style: style(), querySelector: q => q === '.char-token' ? token : null, querySelectorAll: () => [token], getBoundingClientRect: () => rect(top(), jpHeight) };
  const row = { style: style(), querySelectorAll: () => [], getBoundingClientRect: () => {
    const size = Number.parseFloat(row.style.getPropertyValue('font-size')) || 24;
    const full = height * size / 24;
    const cap = Number.parseFloat(row.style.getPropertyValue('max-height'));
    return rect(top() + jpHeight, Number.isFinite(cap) ? Math.min(cap, full) : full);
  } };
  const anchor = [100, y]; anchor.center = center; anchor.size = 30;
  const context = vm.createContext({
    b: { galPreferences: () => ({}), galLayoutInfo: () => ({ clientX: 0, clientY: 0, clientWidth: 1280, clientHeight: 720, workBottom: 720 }) },
    document: { body: { classList: classes } }, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    anchor, anchorLine: 'synthetic', cnBelow: { key: null, below: false },
    window: { MeguLitProfile: { get: () => grows } },
    getComputedStyle: n => ({ fontSize: n.style.getPropertyValue('font-size') || '24px', lineHeight: '32px', marginTop: '0px', getPropertyValue: () => '' })
  });
  /* pin() reads the user's translation wrap width through userRowLayout (QQ essence 1137) */
  const own = /  const userRowLayout = prefs => \{[\s\S]*?\n  \};/.exec(source)[0];
  vm.runInContext(own + '\n' + setters + '\n' + pin + '\nglobalThis.invoke = pin;', context);
  return { show(h) { height = h; context.invoke(win, sentence); return { jp: top(), jpHeight: sentence.getBoundingClientRect().height, cn: row.getBoundingClientRect(), cap: row.style.getPropertyValue('max-height'), scroll: row.style.getPropertyValue('overflow-y') }; } };
}

for (const center of [false, true]) for (const grows of [false, true]) {
  test(`real anchored pin keeps JP when CN arrives, center=${center}, old game flag=${grows}`, () => {
    const r = anchored({ center, grows });
    const pending = r.show(20), delivered = r.show(250), streaming = r.show(400), next = r.show(20);
    assert.equal(pending.jp, 560);
    for (const value of [delivered, streaming, next]) assert.equal(value.jp, pending.jp);
    assert.equal(delivered.scroll, 'auto');
    assert.ok(delivered.cn.height >= 32 && delivered.cn.bottom <= 712);
    assert.equal(next.cap, '', 'next short line clears the previous constraint');
  });
}

test('real anchored pin never turns less than one translation row into a tiny clipped strip', () => {
  const r = anchored({ center: true, y: 670 });
  const pending = r.show(20), delivered = r.show(200);
  assert.equal(delivered.jp, pending.jp);
  assert.equal(delivered.cap, '');
  assert.ok(delivered.cn.bottom > 720, 'this extreme viewport cannot show the entire translation');
});

test('normal calibrated reader plan never shifts JP for a late or streaming translation', () => {
  for (const anchor of [500, 610, 670]) for (const cn of [20, 90, 300, 600]) {
    const jp = { top: anchor, bottom: anchor + 60 };
    let f = 1, p;
    for (let i = 0; i < 5; i++) { p = fit.plan({ top: anchor, bottom: jp.bottom + cn * f }, { top: 0, bottom: 720 }, f, jp); assert.equal(p.shift, 0); if (f === p.fit) break; f = p.fit; }
    assert.ok(f >= fit.MIN);
  }
});

