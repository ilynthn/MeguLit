// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
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
<head><meta charset="utf-8"></head>
<body>
<div id="mount"></div>
<script type="module">
import { mountReadingInsights } from '/reading-insights.js';
window.__mountReadingInsights = mountReadingInsights;
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

test('switching game in reading insights drops stale slower responses from earlier game selection', { skip: !hasEdge && 'Edge not installed', timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-ri-race-'));
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
      const mount = document.getElementById('mount');
      const games = [{ id: 'g1', title: 'Game One', lines: 5, levels: [] }, { id: 'g2', title: 'Game Two', lines: 5, levels: [] }];
      const calls = [];
      let resolveSlow = null;
      const api = async (action, args) => {
        calls.push({ gameId: args.gameId, count: args.count });
        if (args.gameId === 'g1') {
          return new Promise(resolve => {
            resolveSlow = () => resolve({
              lines: 10, pending: 3, counting: true, games, jlpt: [],
              weekly: [{ key: 'g1word', base: '古語一', count: 9, games: [] }],
              frequent: [{ key: 'g1word', base: '古語一', count: 9, games: [] }],
            });
          });
        }
        if (args.gameId === 'g2') {
          return {
            lines: 10, pending: 0, counting: false, games, jlpt: [],
            weekly: [{ key: 'g2word', base: '新語二', count: 4, games: [] }],
            frequent: [{ key: 'g2word', base: '新語二', count: 4, games: [] }],
          };
        }
        return {
          lines: 10, pending: 0, counting: false, games, jlpt: [],
          weekly: [{ key: 'allword', base: '全体語', count: 8, games: [] }],
          frequent: [{ key: 'allword', base: '全体語', count: 8, games: [] }],
        };
      };

      const stop = await window.__mountReadingInsights(mount, {
        api, locale: 'en', esc: window.__esc, number: String, isCurrent: () => true,
      });

      const pick = id => {
        const sel = mount.querySelector('.ri-game');
        sel.value = id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      };

      pick('g1'); // slow request in flight
      await new Promise(r => setTimeout(r, 20));
      pick('g2'); // fast request resolves first
      await new Promise(r => setTimeout(r, 50));
      const beforeStale = mount.textContent;

      resolveSlow(); // stale g1 response arrives late
      await new Promise(r => setTimeout(r, 80));
      const afterStale = mount.textContent;
      const selectedAfterStale = mount.querySelector('.ri-game')?.value || '';
      stop();
      return { beforeStale, afterStale, selectedAfterStale, calls };
    })()`);

    assert.match(res.beforeStale, /新語二/);
    assert.match(res.afterStale, /新語二/, 'stale g1 response must not overwrite g2 view');
    assert.doesNotMatch(res.afterStale, /古語一/, 'stale g1 word must not appear after switching to g2');
    assert.equal(res.selectedAfterStale, 'g2');
  } finally {
    await cdp?.stop();
    server?.close();
    await new Promise(r => setTimeout(r, 200));
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
});
