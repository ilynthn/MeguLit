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
<head><meta charset="utf-8"></head>
<body>
<div class="main"><div id="mount"></div></div>
<script type="module">
import { mountSentences, focusSentence } from '/sentences-page.js';
window.__mountSentences = mountSentences;
window.__focusSentence = focusSentence;
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

test('focusSentence clears previous search query so focused sentence is visible and highlighted', { skip: !hasEdge && 'Edge not installed', timeout: 30000 }, async () => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-sent-focus-'));
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
      const rows = [
        { id: 1, game_id: 'g1', title: 'G1', text: '雨が降っている。', translation: '正在下雨。', created_at: 1700000200, source: 'manual', words: [] },
        { id: 2, game_id: 'g1', title: 'G1', text: '晴れの日だった。', translation: '是个晴天。', created_at: 1700000100, source: 'manual', words: [] },
      ];
      const opts = {
        api: async action => action === 'sentences' ? rows : [],
        locale: 'zh',
        esc: window.__esc,
        toast: () => {},
        errorMessage: String,
        empty: msg => '<div>' + msg + '</div>',
        emptyLabel: '空',
        readTime: () => '今天',
        datetime: () => '今天',
        icon: () => '',
        isCurrent: () => true,
        rerender: () => {},
        lookup: () => {},
        openGame: () => {},
        games: [{ id: 'g1', title: 'G1' }],
        cover: () => '',
      };

      await window.__mountSentences(mount, opts);
      const input = mount.querySelector('.sp-q input');
      input.value = '雨';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 160));
      const filteredIds = [...mount.querySelectorAll('.sp-list [data-sentence-id]')].map(n => n.dataset.sentenceId);

      // Leave page and jump back via focusSentence('晴れの日だった。')
      mount.replaceChildren();
      window.__focusSentence('晴れの日だった。');
      await window.__mountSentences(mount, opts);
      await new Promise(r => setTimeout(r, 40));

      const afterInputValue = mount.querySelector('.sp-q input')?.value ?? null;
      const afterIds = [...mount.querySelectorAll('.sp-list [data-sentence-id]')].map(n => n.dataset.sentenceId);
      const focusedNode = mount.querySelector('.sp-list [data-sentence-id="2"]');
      return {
        filteredIds,
        afterInputValue,
        afterIds,
        hasFocusClass: focusedNode?.classList.contains('sentence-focus') ?? false,
      };
    })()`);

    assert.deepEqual(res.filteredIds, ['1']);
    assert.equal(res.afterInputValue, '', 'focusSentence must clear previous search query');
    assert.deepEqual(res.afterIds, ['1', '2'], 'focused sentence must not be hidden by stale search query');
    assert.equal(res.hasFocusClass, true, 'focused sentence row must receive sentence-focus highlight');
  } finally {
    await cdp?.stop();
    server?.close();
    await new Promise(r => setTimeout(r, 200));
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
});
