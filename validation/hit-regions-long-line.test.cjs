'use strict';
/* 2026-11-26 (オルフレール, Ctrl fast-forward; Cardinal r1/r2: the reader page stopped answering for good after about 89 s). The hook
   sends the skipped text as one line (3996 characters, 8000 char tokens with the translation). Every DOM mutation ran a hit-region report
   in a microtask, and a report reads each token's style and boxes (about 110 ms for 8000 tokens); a typing line mutates every frame, so
   reports ran back to back and the page answered nothing else. The interaction reporter (web/reader/modules/interaction.js) runs in a vm
   with a fake DOM whose box reads cost time on a fake clock. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SOURCE = fs.readFileSync(path.join(__dirname, '../web/reader/modules/interaction.js'), 'utf8');
function page(tokens, costPerToken) {
  let now = 0, reports = 0, mutated = null;
  const micro = [], timers = [], sent = [];
  const node = i => ({ closest: () => null, matches: () => false, classList: { contains: () => false }, parentElement: null,
    getClientRects: () => { now += costPerToken; const x = (i % 40) * 20, y = Math.floor(i / 40) * 24; return [{ left: x, top: y, right: x + 20, bottom: y + 20, width: 20, height: 20 }]; } });
  const nodes = Array.from({ length: tokens }, (_, i) => node(i));
  const document = { documentElement: {}, body: { classList: { contains: c => c === 'tomoyo-gal-bound' }, append() {}, appendChild() {} },
    querySelector: () => null,
    querySelectorAll: sel => { if (sel.includes('.char-token') && sel.includes('.sentence-placeholder')) { reports++; return nodes; } return []; },
    createElement: () => ({ setAttribute() {}, style: {}, remove() {}, isConnected: false }), addEventListener() {} };
  const window = { __tomoyoTranslateRequest: p => sent.push(p) };
  vm.runInNewContext(SOURCE, { window, document, devicePixelRatio: 1, innerWidth: 1920, innerHeight: 1080, Date, JSON, Math, Number, Map, WeakSet,
    performance: { now: () => now }, queueMicrotask: fn => micro.push(fn), setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; },
    requestAnimationFrame: () => 0, getComputedStyle: () => ({ display: 'inline', visibility: 'visible', opacity: '1', fontSize: '24px', getPropertyValue: () => '' }),
    ResizeObserver: class { observe() {} }, MutationObserver: class { constructor(fn) { mutated = fn; } observe() {} }, addEventListener() {} });
  const flush = () => { while (micro.length) micro.shift()(); };
  const advance = ms => { const end = now + ms; for (;;) { flush(); timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = Math.max(now, t.at); t.fn(); } now = Math.max(now, end); flush(); };
  flush();
  return { get reports() { return reports; }, get now() { return now; }, mutate: () => mutated(), advance, sent };
}
test('a 4000-character line (8000 tokens) typing for a second: hit-region reports take at most about a quarter of the time', () => {
  const p = page(8000, 0.014);
  const start = p.now, before = p.reports;
  for (let frame = 0; frame < 60; frame++) { p.mutate(); p.advance(16); }
  const spent = (p.reports - before) * 8000 * 0.014 * 2, wall = p.now - start;
  assert.ok(p.reports - before <= 4, 'reports in one second of typing: ' + (p.reports - before));
  assert.ok(spent / wall <= 0.3, 'share of time in reports: ' + (spent / wall).toFixed(2));
  p.advance(2000); assert.ok(p.sent.length >= 1, 'the regions still reach the host');
});
test('a page of normal size still reports at once on every change (no delay added)', () => {
  const p = page(40, 0.014);
  const before = p.reports;
  for (let frame = 0; frame < 10; frame++) { p.mutate(); p.advance(0); }
  assert.equal(p.reports - before, 10);
});
test('the last change after a long report is reported (held back, never dropped)', () => {
  const p = page(8000, 0.014);
  p.mutate(); p.advance(0);
  const n = p.reports; p.mutate(); p.advance(0);
  assert.equal(p.reports, n, 'held back right after a long report');
  p.advance(1000); assert.equal(p.reports, n + 1, 'runs once the hold is over');
});
