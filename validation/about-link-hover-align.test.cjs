// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Owner 2026-11-27: hovering a row of the about page's 链接 list (更新日志 · GitHub · Releases) put the red diamond below the
   label's middle, and the value text slid 18 px right, out of line with the other rows. Renders the real aboutHTML with the
   real stylesheets, hovers the first, a middle and the last (反馈问题) row, and checks the diamond sits on the label's
   middle and the value column does not move. Headless Edge (MEGULIT_PLAYWRIGHT). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP about link hover align (no playwright-core)'); process.exit(0); }
const web = path.join(__dirname, '..', 'web');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const harness = () => {
  const links = (fs.readFileSync(path.join(web, 'index.html'), 'utf8').match(/<link rel="stylesheet"[^>]*>/g) || []).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">${links}</head><body><main style="padding:40px"></main>
<script type="module">import {aboutHTML} from './about.js';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
document.querySelector('main').innerHTML=aboutHTML('zh',esc);window.ready=1;</script></body></html>`;
};
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(harness()); }
  const f = path.join(web, u);
  if (!f.startsWith(web)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});
/* the label's glyph box, the diamond's centre (its ::before box after transforms) and the value's left edge */
const measure = el => {
  const label = [...el.childNodes].find(n => n.nodeName !== 'SMALL');
  const range = document.createRange(); range.selectNodeContents(label);
  const glyph = [...range.getClientRects()].find(r => r.height > 0);
  const host = label.nodeType === 1 ? label : el, s = getComputedStyle(host, '::before'), box = host.getBoundingClientRect();
  return { star: box.top + parseFloat(s.top) + parseFloat(s.marginTop) + parseFloat(s.height) / 2, label: (glyph.top + glyph.bottom) / 2, value: el.querySelector('small').getBoundingClientRect().left, shown: s.transform !== 'none' && !/matrix\(0, 0, 0, 0/.test(s.transform) };
};
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.ready);
    await page.addStyleTag({ content: '*,*::before{transition:none!important;animation:none!important}' });
    const rows = page.locator('.ab-links button');
    assert.strictEqual(await rows.count(), 5, 'five link rows');
    await page.mouse.move(0, 0);
    const idle = await rows.evaluateAll(els => els.map(el => el.querySelector('small').getBoundingClientRect().left));
    for (const i of [0, 2, 4]) {
      const b = await rows.nth(i).boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      const m = await rows.nth(i).evaluate(measure);
      const name = await rows.nth(i).evaluate(el => el.firstChild.textContent);
      assert.ok(m.shown, `${name}: the diamond shows on hover`);
      assert.ok(Math.abs(m.star - m.label) <= 1, `${name}: diamond centre ${m.star.toFixed(1)} on the label's middle ${m.label.toFixed(1)}`);
      assert.strictEqual(m.value, idle[i], `${name}: the value text stays in its column on hover`);
    }
    console.log('PASS about link rows: the hover diamond sits on the label\'s middle and the value column holds still');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exit(1); });
