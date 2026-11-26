// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Dashes in the reader (web/reader/modules/text-place.js, rule ".sentence-text .char-token.megulit-dash"), in a real
   browser (headless Edge through playwright-core; skipped when it is not installed).
   2026-11-15 regression: 「――」 was fixed three times for in-place drawing only and the last version drew it thinner than the
   game; outside in-place mode the font's two short pieces were back. The rule now: every dash token, on every path, is one
   stroke across its whole box at mid height, 7 % of the size thick, joined to its neighbour; its glyph is not painted; the
   long-vowel mark ー is a letter and stays the font's. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP dash stroke (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const tokens = [...'が――僕はコーヒー'].map(c => `<span class="char-token">${c}</span>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px}
.sentence-text{font:32px/1.5 "MS Gothic",monospace;color:rgb(250,250,250);white-space:pre-wrap}
.sentence-text .char-token{-webkit-text-fill-color:rgb(10,200,30);text-shadow:0 0 2px #000}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${tokens}</div><div class="tomoyo-cn-row">x</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    /* the stroke of each dash token: [left, right, top, bottom] in page px, plus what the glyph itself paints */
    const strokes = () => page.evaluate(() => [...document.querySelectorAll('.sentence-text .char-token')].map(t => {
      const r = t.getBoundingClientRect(), a = getComputedStyle(t, '::after'), cs = getComputedStyle(t), px = v => parseFloat(v) || 0;
      const dash = t.classList.contains('megulit-dash');
      const top = r.top + px(a.top) + px(a.marginTop);
      return { c: t.textContent, dash, box: [r.left, r.top, r.width, r.height], font: px(cs.fontSize), fill: cs.webkitTextFillColor, shadow: cs.textShadow,
        stroke: dash ? [r.left + px(a.left), r.right - px(a.right), top, top + px(a.height)] : null, bg: a.backgroundColor, content: a.content };
    }));
    const check = (list, where) => {
      const d = list.filter(t => t.c === '―'), long = list.filter(t => t.c === 'ー');
      assert.strictEqual(d.length, 2, where + ': two dash tokens'); assert.strictEqual(long.length, 2, where + ': two long-vowel marks');
      for (const t of long) { assert.strictEqual(t.dash, false, where + ': ー is a letter, not a dash'); assert.strictEqual(t.fill, 'rgb(10, 200, 30)', where + ': ー keeps its glyph'); }
      for (const t of d) {
        assert.strictEqual(t.dash, true, where + ': ― is tagged');
        assert.strictEqual(t.fill, 'rgba(0, 0, 0, 0)', where + ': the font glyph is not painted'); assert.strictEqual(t.shadow, 'none', where + ': nor its shadow');
        assert.strictEqual(t.bg, 'rgb(10, 200, 30)', where + ': the stroke has the colour the glyph was filled with');
        const [l, r, top, bottom] = t.stroke, thick = bottom - top;
        assert.ok(l <= t.box[0] && r >= t.box[0] + t.box[2], where + ': the stroke spans the whole box (' + [l, r, t.box] + ')');
        assert.ok(thick >= t.font * .06 && thick <= t.font * .085, where + ': about 7 % of the size thick, not a hairline (' + thick + ' at ' + t.font + ')');
        const mid = (top + bottom) / 2, want = t.box[1] + t.box[3] / 2;
        assert.ok(Math.abs(mid - want) <= 1, where + ': at mid height of its box (' + mid + ' vs ' + want + ')');
      }
      assert.ok(d[0].stroke[1] >= d[1].stroke[0], where + ': the two strokes join into one line (' + d[0].stroke[1] + ' / ' + d[1].stroke[0] + ')');
      assert.ok(Math.abs((d[0].stroke[2] + d[0].stroke[3]) - (d[1].stroke[2] + d[1].stroke[3])) <= 1, where + ': at the same height');
    };
    /* 1. the reader's own flow layout (no in-place drawing at all) */
    await frame(); check(await strokes(), 'reader box');
    /* 2. tokens that arrive later (a new sentence) are tagged too */
    await page.evaluate(t => { const s = document.querySelector('.sentence-text'); s.innerHTML = t; }, tokens); await frame(); check(await strokes(), 'new sentence');
    /* 3. in-place drawing: half-width dash cells next to each other (16 px each at size 32), as the game lays them out */
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceAnchor?.(false); b.textPlaceMode({ on: true });
      b.textPlace({ text: 'が――僕はコーヒー', client: [1280, 720], rects: [[100, 500, 32, 41], [132, 500, 16, 41], [148, 500, 16, 41], [164, 500, 32, 41], [196, 500, 32, 41], [228, 500, 32, 41], [260, 500, 32, 41], [292, 500, 32, 41], [324, 500, 32, 41]] }); });
    await frame();
    const placed = await strokes(); check(placed, 'in place');
    const d = placed.filter(t => t.c === '―');
    assert.deepStrictEqual(d.map(t => t.box.map(Math.round)), [[132, 500, 16, 41], [148, 500, 16, 41]], 'in place: on the game\'s cells');
    assert.ok(d[0].stroke[0] <= 132 && d[1].stroke[1] >= 164, 'in place: one line across both half cells (a full cell long)');
    console.log('PASS dash stroke');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
