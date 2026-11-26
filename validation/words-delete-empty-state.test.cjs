// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { startEdge } = require('./library-views-perf.cjs');

const ROOT = path.join(__dirname, '..');
const hasEdge = [
  process.env.MEGULIT_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].some(p => p && fs.existsSync(p));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serve() {
  const harness = `<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="/detail-collect.css"></head>
<body>
<div class="main"><div id="mount"></div></div>
<script type="module">
import { mountWords } from '/detail-collect.js';
window.__mountWords = mountWords;
window.__esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.__ready = true;
</script>
</body>
</html>`;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    if (p === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(harness);
    }
    const file = path.join(ROOT, 'web', p.replace(/^\/+/, ''));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('deleting words updates the often-looked-up chip count and falls back to the empty state when the last word is removed', { skip: !hasEdge && 'Edge not installed', timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-words-del-'));
  let server, cdp;
  try {
    server = await serve();
    cdp = await startEdge(path.join(temp, 'edge'));
    const url = `http://127.0.0.1:${server.address().port}/`;
    await cdp.send('Page.navigate', { url });
    for (let i = 0; i < 60; i++) {
      if (await cdp.evaluate('window.__ready === true').catch(() => false)) break;
      await new Promise(r => setTimeout(r, 20));
    }

    const res = await cdp.evaluate(`(() => {
      const mount = document.getElementById('mount');
      const state = {};
      const stop = window.__mountWords(mount, {
        words: [
          { id: 1, spelling: '夢', reading: 'ゆめ', definitions: '["梦"]', status: 0, met: 2, lookups: 5, created_at: 1700000200 },
          { id: 2, spelling: '空', reading: 'そら', definitions: '["天空"]', status: 0, met: 1, lookups: 3, created_at: 1700000100 },
        ],
        lookupOnly: [],
        counts: { total: 2, byStatus: { 0: 2 } },
        locale: 'zh',
        esc: window.__esc,
        state,
        scope: 'all',
        onDelete: (w, done) => done(),
      });

      const oftenBefore = mount.querySelector('[data-f="often"] b')?.textContent ?? null;
      // Delete first word (id=1, lookups=5)
      mount.querySelector('[data-del]').click();
      const oftenAfterOne = mount.querySelector('[data-f="often"] b')?.textContent ?? null;

      // Switch to often filter, then delete the last word (id=2, lookups=3)
      mount.querySelector('[data-f="often"]').click();
      mount.querySelector('[data-del]').click();
      const isEmptySection = !!mount.querySelector('.esr.is-empty');
      const hasStaleClearBtn = !!mount.querySelector('[data-clear]');
      const oftenChipAfterAll = !!mount.querySelector('[data-f="often"]');
      const emptyText = mount.textContent || '';
      stop();
      return {
        oftenBefore,
        oftenAfterOne,
        isEmptySection,
        hasStaleClearBtn,
        oftenChipAfterAll,
        hasEmptyTitle: emptyText.includes('单词本还是空的'),
      };
    })()`);

    assert.equal(res.oftenBefore, '2');
    assert.equal(res.oftenAfterOne, '1', 'often-looked-up chip count must decrease when a looked-up word is deleted');
    assert.equal(res.oftenChipAfterAll, false, 'often chip should disappear once no words remain');
    assert.equal(res.isEmptySection, true, 'deleting the last word should render the empty words state');
    assert.equal(res.hasEmptyTitle, true, 'empty state should show the empty words heading');
    assert.equal(res.hasStaleClearBtn, false, 'empty state must not show a useless Clear search button');
  } finally {
    await cdp?.stop();
    server?.close();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(temp, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 30)); }
    }
  }
});
