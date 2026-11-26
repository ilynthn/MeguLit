// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #1122 (owner 2026-11-24, 死に逝く君、館に芽吹く憎悪, KiriKiri, client 1920x989): 「最後の最後まで、生に縋ろうとしていた。」 (19 characters,
   placed from x 500 at 33 px) got 「直到最后的最后，她仍拼命想要抓住生的希」 and 「望。」 on a row of its own. The translation takes the
   Japanese block's width (2026-11-20, CHAOS;CHILD); a translation a character or two longer left that tail alone. Now a short last row
   widens the translation by the tail, at the same type size, as far as the game client goes; a long second row stays two rows, and
   with no room to the client edge nothing changes. Real browser (headless Edge through playwright-core; skipped without it). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP cn tail wrap (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const ja = '最後の最後まで、生に縋ろうとしていた。';
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0}.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px}
.sentence-text{font:33px/1.4 "MS Gothic",monospace}.tomoyo-cn-row{display:block;font:33px/1.4 "Microsoft YaHei","MS Gothic",sans-serif;line-break:strict}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text">${[...ja].map(c => `<span class="char-token">${c}</span>`).join('')}</div><div class="tomoyo-cn-row"><div class="tomoyo-cn-output"></div></div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const rows = () => page.evaluate(() => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector('.tomoyo-cn-output')); const tops = new Set([...rg.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))); return { rows: tops.size, size: parseFloat(getComputedStyle(document.querySelector('.tomoyo-cn-output')).fontSize), right: Math.round(document.querySelector('.tomoyo-cn-output').getBoundingClientRect().right) }; });
    const show = (tr, clientWidth) => page.evaluate(([tr, ja, cw]) => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 0, clientY: 0, clientWidth: cw, clientHeight: 989, workBottom: 1040 });
      document.querySelector('.tomoyo-cn-output').textContent = tr; b.textPlace({ text: ja, client: [cw, 989], rects: [...ja].map((c, i) => [500 + i * 33, 783, 33, 36]) }); }, [tr, ja, clientWidth]);
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 0, clientY: 0, clientWidth: 1920, clientHeight: 989, workBottom: 1040 }); b.textPlaceMode({ on: true }); b.textPlaceAnchor(true); });
    /* the owner's line: one row, full size */
    await show('直到最后的最后，她仍拼命想要抓住生的希望。', 1920); await frame();
    const a = await rows(); assert.strictEqual(a.rows, 1, '「望。」 is not left alone on a row ' + JSON.stringify(a)); assert.strictEqual(a.size, 33, 'same type size');
    /* a translation that really needs two rows keeps its width: the second row is long */
    await show('直到最后的最后，她仍拼命想要抓住生的希望，哪怕那希望早已经在她眼前一点一点地破碎消失。', 1920); await frame();
    const b = await rows(); assert.ok(b.rows >= 2, 'a long translation still wraps ' + JSON.stringify(b)); assert.ok(b.right <= 500 + 19 * 33 + 2, 'at the Japanese width ' + JSON.stringify(b));
    /* no room right of the Japanese inside the game client: as before */
    await show('直到最后的最后，她仍拼命想要抓住生的希望。', 500 + 19 * 33 + 10); await frame();
    const c = await rows(); assert.strictEqual(c.rows, 2, 'the client edge is not crossed ' + JSON.stringify(c));
    assert.deepStrictEqual(errors, []);
    console.log('PASS cn tail wrap');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
