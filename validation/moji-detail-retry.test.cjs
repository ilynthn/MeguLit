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
import { mountEntries } from '/detail-collect.js';
window.__mountEntries = mountEntries;
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

test('MOJi detail and notes failures are not cached and can be retried', { skip: !hasEdge && 'Edge not installed', timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-moji-retry-'));
  let server, cdp;
  try {
    server = await serve();
    cdp = await startEdge(path.join(temp, 'edge'));
    const url = `http://127.0.0.1:${server.address().port}/`;
    await cdp.send('Page.navigate', { url });
    for (let i = 0; i < 60; i++) {
      if (await cdp.evaluate('window.__ready === true').catch(() => false)) break;
      await new Promise(r => setTimeout(r, 30));
    }

    const res = await cdp.evaluate(`(async () => {
      const target = document.getElementById('mount');
      let detailCallsA = 0, detailCallsB = 0, notesCallsA = 0;
      const items = [
        { id: 'wA', spelling: '茄子', reading: 'なす', pron: 'なす', definition: '茄子摘要' },
        { id: 'wB', spelling: '成す', reading: 'なす', pron: 'なす', definition: '形成摘要' },
      ];
      const stop = window.__mountEntries(target, {
        items,
        source: 'moji',
        locale: 'zh',
        esc: window.__esc,
        loadDetail: async item => {
          if (item.id === 'wA') {
            detailCallsA++;
            if (detailCallsA === 1) throw new Error('MOJI_UNAVAILABLE');
            return {
              id: 'wA', spelling: '茄子', pron: 'なす', accent: '①', jlpt: 'N3', views: 1551,
              meanings: [{ zh: '茄子（完整释义）', examples: [{ ja: '茄子を焼く。', zh: '烤茄子。' }] }],
              notes: [],
              comments: [
                { author: 'u1', content: 'n1' }, { author: 'u2', content: 'n2' },
                { author: 'u3', content: 'n3' }, { author: 'u4', content: 'n4' },
                { author: 'u5', content: 'n5' }, { author: 'u6', content: 'n6' },
              ],
              commentCount: 25,
            };
          }
          detailCallsB++;
          return { id: 'wB', spelling: '成す', pron: 'なす', meanings: [{ zh: '完成' }], notes: [], comments: [], commentCount: 0 };
        },
        loadNotes: async (item, page) => {
          notesCallsA++;
          if (notesCallsA === 1) throw new Error('MOJI_UNAVAILABLE');
          return { page, comments: [{ author: 'u7', content: '第二页笔记成功加载' }], hasMore: false };
        },
      });

      const wait = ms => new Promise(r => setTimeout(r, ms));
      await wait(60);
      const firstFailText = target.querySelector('.esr-d').textContent;

      // Switch to second entry then back to first entry: failed detail must not be cached, so wA reloads.
      target.querySelector('[data-key="1"]').click();
      await wait(60);
      target.querySelector('[data-key="0"]').click();
      await wait(60);
      const afterDetailRetry = target.querySelector('.esr-d').textContent;

      // Switch away and back again: successful detail IS cached and does not refetch.
      target.querySelector('[data-key="1"]').click();
      await wait(40);
      target.querySelector('[data-key="0"]').click();
      await wait(40);

      // Expand local 6th note so "load more notes" button appears.
      target.querySelector('[data-notes-open]').click();
      await wait(30);
      const loadMoreBefore = !!target.querySelector('[data-notes-more]');

      // First click on load more fails: button must stay available for retry.
      target.querySelector('[data-notes-more]').click();
      await wait(60);
      const loadMoreAfterFail = !!target.querySelector('[data-notes-more]');
      const loadMoreDisabledAfterFail = target.querySelector('[data-notes-more]')?.disabled ?? null;

      // Second click retries page 2 and renders the fetched note.
      if (loadMoreAfterFail) {
        target.querySelector('[data-notes-more]').click();
        await wait(60);
      }
      const notesAfterRetry = target.querySelector('.ent-notes')?.textContent || '';
      const loadMoreAfterSuccess = !!target.querySelector('[data-notes-more]');
      stop();
      return {
        detailCallsA,
        detailCallsB,
        notesCallsA,
        firstFailHasNotice: firstFailText.includes('详情暂时无法打开'),
        afterDetailRetryHasFull: afterDetailRetry.includes('茄子（完整释义）') && afterDetailRetry.includes('茄子を焼く。'),
        loadMoreBefore,
        loadMoreAfterFail,
        loadMoreDisabledAfterFail,
        notesAfterRetryHasPage2: notesAfterRetry.includes('第二页笔记成功加载'),
        loadMoreAfterSuccess,
      };
    })()`);

    assert.equal(res.firstFailHasNotice, true);
    assert.equal(res.detailCallsA, 2, 'failed detail should be retried once, then cached on success');
    assert.equal(res.detailCallsB, 1, 'successful detail should stay cached');
    assert.equal(res.afterDetailRetryHasFull, true, 'retry should render full MOJi detail');
    assert.equal(res.loadMoreBefore, true);
    assert.equal(res.loadMoreAfterFail, true, 'load more notes button must stay available after transient failure');
    assert.equal(res.loadMoreDisabledAfterFail, false);
    assert.equal(res.notesCallsA, 2);
    assert.equal(res.notesAfterRetryHasPage2, true, 'retrying load more notes should fetch page 2');
    assert.equal(res.loadMoreAfterSuccess, false);
  } finally {
    await cdp?.stop();
    server?.close();
    await new Promise(r => setTimeout(r, 200));
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
});
