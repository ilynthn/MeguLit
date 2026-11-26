// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Dashes in the reader (web/reader/modules/text-place.js, rule ".sentence-text .char-token.megulit-dash"), in a real
   browser (headless Edge via CDP; skipped only when Edge is not installed).
   2026-11-15 regression: 「――」 was fixed three times for in-place drawing only and the last version drew it thinner than the
   game; outside in-place mode the font's two short pieces were back. The rule now: every dash token, on every path, is one
   stroke across its whole box at mid height, 7 % of the size thick, joined to its neighbour; its glyph is not painted; the
   long-vowel mark ー is a letter and stays the font's.
   #1119 regression: when a new unread sentence containing dashes arrives while body.tome-line-read / tome-line-color still
   holds the previous read line's colour, pinning --megulit-dash-color to the initial computed colour froze the dash in the
   read colour after the sentence switched to unread. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startEdge } = require('./library-views-perf.cjs');

const ROOT = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const hasEdge = [
  process.env.MEGULIT_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].some(p => p && fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tokens = [...'が――僕はコーヒー'].map(c => `<span class="char-token">${c}</span>`).join('');
const explicitFillHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px}
.sentence-text{font:32px/1.5 "MS Gothic",monospace;color:rgb(250,250,250);white-space:pre-wrap}
body .sentence-window .sentence-text .char-token{-webkit-text-fill-color:var(--test-fill,rgb(10,200,30))!important;text-shadow:0 0 2px #000}
body.alt-fill .sentence-window .sentence-text .char-token{-webkit-text-fill-color:rgb(255,255,255)!important}
body.same-fill .sentence-window .sentence-text .char-token{-webkit-text-fill-color:currentColor!important}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${tokens}</div><div class="tomoyo-cn-row">x</div></div></main>
<script>window.__tomoyoChinese={};</script><script>${code}</script></body></html>`;

const readStateHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{
  --tomoyo-gal-color:#ffffff;
  --tomoyo-gal-fill:currentColor;
  --tomoyo-gal-read-color:#ffff00;
  --tomoyo-gal-read-fill:currentColor;
  --tomoyo-gal-line-color:#ffffff;
}
body.tome-line-read .sentence-window:not(.tome-island-page){
  --tomoyo-gal-color:var(--tomoyo-gal-read-color);
  --tomoyo-gal-fill:var(--tomoyo-gal-read-fill);
}
body.tome-line-color .sentence-window:not(.tome-island-page){
  --tomoyo-gal-color:var(--tomoyo-gal-line-color);
  --tomoyo-gal-fill:currentColor;
}
.sentence-window{position:fixed;left:100px;bottom:20px;width:900px;height:150px}
.sentence-text{font:32px/1.5 "MS Gothic",monospace;color:var(--tomoyo-gal-color);white-space:pre-wrap}
.sentence-text .char-token{color:inherit;-webkit-text-fill-color:var(--tomoyo-gal-fill,currentColor)!important}
body.tomoyo-gal-bound:is(.tome-line-read,.tome-line-color) .sentence-window:not(.tome-island-page) .sentence-text .char-token{color:var(--tomoyo-gal-color)!important}
</style></head><body class="tomoyo-gal-bound tomoyo-game-style tome-line-read">
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row">x</div></div></main>
<script>window.__tomoyoChinese={};</script><script>${code}</script></body></html>`;

function servePages(pages) {
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (pages[p]) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pages[p]);
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const FRAME = 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))';
const STROKES = `[...document.querySelectorAll('.sentence-text .char-token')].map(t => {
  const r = t.getBoundingClientRect(), a = getComputedStyle(t, '::after'), cs = getComputedStyle(t), px = v => parseFloat(v) || 0;
  const dash = t.classList.contains('megulit-dash');
  const top = r.top + px(a.top) + px(a.marginTop);
  return { c: t.textContent, dash, pinned: t.style.getPropertyValue('--megulit-dash-color').trim(), box: [r.left, r.top, r.width, r.height], font: px(cs.fontSize), color: cs.color, fill: cs.webkitTextFillColor, shadow: cs.textShadow,
    stroke: dash ? [r.left + px(a.left), r.right - px(a.right), top, top + px(a.height)] : null, bg: a.backgroundColor, content: a.content };
})`;

test('dash stroke geometry and explicit -webkit-text-fill-color', { skip: !hasEdge && 'Edge not installed', timeout: 120000 }, async () => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-dash-stroke-'));
  let server;
  let cdp;
  try {
    server = await servePages({ '/explicit': explicitFillHtml });
    cdp = await startEdge(path.join(temp, 'edge'));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/explicit` });
    await sleep(300);

    const check = (list, where, wantColor = 'rgb(10, 200, 30)') => {
      const d = list.filter(t => t.c === '―');
      const long = list.filter(t => t.c === 'ー');
      assert.equal(d.length, 2, where + ': two dash tokens');
      assert.equal(long.length, 2, where + ': two long-vowel marks');
      for (const t of long) {
        assert.equal(t.dash, false, where + ': ー is a letter, not a dash');
        assert.equal(t.fill, wantColor, where + ': ー keeps its glyph');
      }
      for (const t of d) {
        assert.equal(t.dash, true, where + ': ― is tagged');
        assert.equal(t.fill, 'rgba(0, 0, 0, 0)', where + ': the font glyph is not painted');
        assert.equal(t.shadow, 'none', where + ': nor its shadow');
        assert.equal(t.bg, wantColor, where + ': the stroke has the colour the glyph was filled with');
        const [l, r, top, bottom] = t.stroke;
        const thick = bottom - top;
        assert.ok(l <= t.box[0] && r >= t.box[0] + t.box[2], where + ': the stroke spans the whole box (' + [l, r, t.box] + ')');
        assert.ok(thick >= t.font * .06 && thick <= t.font * .085, where + ': about 7 % of the size thick, not a hairline (' + thick + ' at ' + t.font + ')');
        const mid = (top + bottom) / 2;
        const want = t.box[1] + t.box[3] / 2;
        assert.ok(Math.abs(mid - want) <= 1, where + ': at mid height of its box (' + mid + ' vs ' + want + ')');
      }
      assert.ok(d[0].stroke[1] >= d[1].stroke[0], where + ': the two strokes join into one line (' + d[0].stroke[1] + ' / ' + d[1].stroke[0] + ')');
      assert.ok(Math.abs((d[0].stroke[2] + d[0].stroke[3]) - (d[1].stroke[2] + d[1].stroke[3])) <= 1, where + ': at the same height');
    };

    await cdp.evaluate(FRAME);
    check(await cdp.evaluate(STROKES), 'reader box');

    await cdp.evaluate(`(() => { document.querySelector('.sentence-text').innerHTML = ${JSON.stringify(tokens)}; return 1; })()`);
    await cdp.evaluate(FRAME);
    check(await cdp.evaluate(STROKES), 'new sentence');

    // Body class switches explicit !important fill; dash stays hidden (transparent glyph) and stroke updates.
    await cdp.evaluate(`(() => { document.body.classList.add('alt-fill'); return 1; })()`);
    await cdp.evaluate(FRAME);
    check(await cdp.evaluate(STROKES), 'explicit fill changed on body class', 'rgb(255, 255, 255)');
    await cdp.evaluate(`(() => { document.body.classList.remove('alt-fill'); return 1; })()`);
    await cdp.evaluate(FRAME);

    // Root style variable change alone (without touching body.class) refreshes explicit fill colour.
    await cdp.evaluate(`(() => { document.documentElement.style.setProperty('--test-fill', 'rgb(80, 160, 240)'); return 1; })()`);
    await cdp.evaluate(FRAME);
    check(await cdp.evaluate(STROKES), 'explicit fill changed via root style', 'rgb(80, 160, 240)');
    await cdp.evaluate(`(() => { document.documentElement.style.removeProperty('--test-fill'); return 1; })()`);
    await cdp.evaluate(FRAME);

    // Switching from explicit fill back to currentColor clears --megulit-dash-color so later container color updates flow through.
    await cdp.evaluate(`(() => { document.body.classList.add('same-fill'); return 1; })()`);
    await cdp.evaluate(FRAME);
    await cdp.evaluate(`(() => { document.querySelector('.sentence-text').style.color = 'rgb(100, 180, 255)'; return 1; })()`);
    await cdp.evaluate(FRAME);
    const afterSameFill = await cdp.evaluate(STROKES);
    check(afterSameFill, 'switched back to currentColor', 'rgb(100, 180, 255)');
    for (const t of afterSameFill.filter(x => x.dash)) {
      assert.equal(t.pinned, '', 'returning to currentColor clears pinned --megulit-dash-color');
    }
    await cdp.evaluate(`(() => { document.body.classList.remove('same-fill'); document.querySelector('.sentence-text').style.removeProperty('color'); return 1; })()`);
    await cdp.evaluate(FRAME);

    await cdp.evaluate(`(() => { const b = window.__tomoyoChinese; b.textPlaceAnchor?.(false); b.textPlaceMode({ on: true });
      b.textPlace({ text: 'が――僕はコーヒー', client: [1280, 720], rects: [[100, 500, 32, 41], [132, 500, 16, 41], [148, 500, 16, 41], [164, 500, 32, 41], [196, 500, 32, 41], [228, 500, 32, 41], [260, 500, 32, 41], [292, 500, 32, 41], [324, 500, 32, 41]] }); return 1; })()`);
    await cdp.evaluate(FRAME);
    const placed = await cdp.evaluate(STROKES);
    check(placed, 'in place');
    const d = placed.filter(t => t.c === '―');
    assert.deepEqual(d.map(t => t.box.map(Math.round)), [[132, 500, 16, 41], [148, 500, 16, 41]], 'in place: on the game\'s cells');
    assert.ok(d[0].stroke[0] <= 132 && d[1].stroke[1] >= 164, 'in place: one line across both half cells (a full cell long)');
  } finally {
    await cdp?.stop();
    server?.close();
    await sleep(400);
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
});

test('unread dashes follow read/unread line colour changes instead of freezing in read colour (#1119)', { skip: !hasEdge && 'Edge not installed', timeout: 120000 }, async () => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-dash-read-'));
  let server;
  let cdp;
  try {
    server = await servePages({ '/read': readStateHtml });
    cdp = await startEdge(path.join(temp, 'edge'));
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/read` });
    await sleep(300);

    const lineHtml = [...'――——──━ーあ'].map(c => `<span class="char-token">${c}</span>`).join('');
    // 1. New unread sentence inserted while body.tome-line-read is still true from the previous read line,
    //    then read state clears to unread (white).
    await cdp.evaluate(`(() => { document.querySelector('.sentence-text').innerHTML = ${JSON.stringify(lineHtml)}; return 1; })()`);
    await cdp.evaluate(FRAME);
    const whileRead = await cdp.evaluate(STROKES);
    for (const t of whileRead) {
      assert.equal(t.dash ? t.bg : t.color, 'rgb(255, 255, 0)', `read state for ${t.c}`);
      if (t.dash) assert.equal(t.pinned, '', `currentColor dash must not pin --megulit-dash-color (${t.c})`);
    }

    // Now the line switches to unread (tome-line-read removed).
    await cdp.evaluate(`(() => { document.body.classList.remove('tome-line-read'); return 1; })()`);
    await cdp.evaluate(FRAME);
    const afterUnread = await cdp.evaluate(STROKES);
    for (const t of afterUnread) {
      assert.equal(t.dash ? t.bg : t.color, 'rgb(255, 255, 255)', `unread state after read->unread for ${t.c}`);
      if (t.dash) assert.equal(t.pinned, '', `unread dash stays unpinned (${t.c})`);
    }

    // 2. Per-pair container colour change (tome-island-page style, without mutating body or documentElement) flows via currentColor.
    await cdp.evaluate(`(() => {
      document.querySelector('.sentence-window').classList.add('tome-island-page');
      document.querySelector('.sentence-window').style.setProperty('--tomoyo-gal-color', 'rgb(120, 210, 255)');
      return 1;
    })()`);
    await cdp.evaluate(FRAME);
    const afterPairColor = await cdp.evaluate(STROKES);
    for (const t of afterPairColor) {
      assert.equal(t.dash ? t.bg : t.color, 'rgb(120, 210, 255)', `container colour change without body mutation for ${t.c}`);
      if (t.dash) assert.equal(t.pinned, '', `container-coloured dash stays unpinned (${t.c})`);
    }
    await cdp.evaluate(`(() => {
      document.querySelector('.sentence-window').classList.remove('tome-island-page');
      document.querySelector('.sentence-window').style.removeProperty('--tomoyo-gal-color');
      return 1;
    })()`);

    // 3. Stale tome-line-read stays true, while per-line engine colour (tome-line-color) arrives as unread white.
    await cdp.evaluate(`(() => {
      document.body.classList.add('tome-line-read');
      document.body.classList.remove('tome-line-color');
      document.querySelector('.sentence-text').innerHTML = ${JSON.stringify(lineHtml)};
      return 1;
    })()`);
    await cdp.evaluate(FRAME);
    await cdp.evaluate(`(() => {
      document.documentElement.style.setProperty('--tomoyo-gal-line-color', '#ffffff');
      document.body.classList.add('tome-line-color');
      return 1;
    })()`);
    await cdp.evaluate(FRAME);
    const afterEngineColor = await cdp.evaluate(STROKES);
    for (const t of afterEngineColor) {
      assert.equal(t.dash ? t.bg : t.color, 'rgb(255, 255, 255)', `engine unread colour overrides stale read class for ${t.c}`);
    }

    // 4. Gradient transparent fill switching from read to unread also updates dashes via currentColor without pinning.
    await cdp.evaluate(`(() => {
      document.body.classList.remove('tome-line-color');
      document.body.classList.add('tome-line-read');
      document.documentElement.style.setProperty('--tomoyo-gal-fill', 'transparent');
      document.documentElement.style.setProperty('--tomoyo-gal-read-fill', 'transparent');
      document.querySelector('.sentence-text').innerHTML = ${JSON.stringify(lineHtml)};
      return 1;
    })()`);
    await cdp.evaluate(FRAME);
    await cdp.evaluate(`(() => { document.body.classList.remove('tome-line-read'); return 1; })()`);
    await cdp.evaluate(FRAME);
    const afterGradientUnread = await cdp.evaluate(STROKES);
    for (const t of afterGradientUnread) {
      assert.equal(t.dash ? t.bg : t.color, 'rgb(255, 255, 255)', `gradient unread colour for ${t.c}`);
      if (t.dash) assert.equal(t.pinned, '', `gradient transparent dash stays unpinned (${t.c})`);
    }
  } finally {
    await cdp?.stop();
    server?.close();
    await sleep(400);
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
});
