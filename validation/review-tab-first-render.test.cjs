// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 1.4.26 P0 (owner: 学习界面 anki 直接消失了): opening 学习 → 复习 left the tab blank under the sub-tab bar. The first Anki
   render runs before learning() puts the tab into the page, and #1250 made it require #review-content to be connected, so
   it returned before drawing anything. Loads the real index.html in headless Edge and opens 复习 with Anki connected,
   with Anki not running, and with the status read failing: each must draw the Anki block (the HUD, or 尚未连接 with its
   reconnect button), never an empty #review-content. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { startEdge } = require('./library-views-perf.cjs');

const WEB = path.join(__dirname, '..', 'web');
const hasEdge = [
  process.env.MEGULIT_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].some(p => p && fs.existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

function serveWeb() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(WEB, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
    if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const STATUS = {
  connected: "return { connected: true, decks: ['Default'], defaultDeck: 'Default' };",
  offline: "return { connected: false, reason: 'ANKI_OFFLINE' };",
  failing: "throw new Error('ANKI_OFFLINE');",
};

async function openReview(cdp, url, mode) {
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__TOME_TEST_TRANSPORT__ = async (command, args) => {
        if (command !== 'service') return {};
        switch (args?.request?.action) {
          case 'home': return { games: [], stats: { readingSeconds: 0, words: 0, lookups: 0 }, preferences: { language: 'zh', accent: '#ad1539' } };
          case 'preferences': return { language: 'zh', accent: '#ad1539' };
          case 'anki_status': ${STATUS[mode]}
          case 'anki_current': return { done: true };
          case 'vocabulary': case 'unknown_words': case 'learning_activity': return [];
          default: return {};
        }
      };
    })();`,
  });
  await cdp.send('Page.navigate', { url });
  const until = async (expr, label, ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await cdp.evaluate(expr).catch(() => false)) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('timed out waiting for ' + label);
  };
  await until("window.__TOME_READY__ === true && !!document.querySelector('[data-route=\"learning\"]')", 'app boot');
  await cdp.evaluate("document.querySelector('[data-route=\"learning\"]').click()");
  await until("!!document.querySelector('#learning-content [data-review-source=\"anki\"]')", '复习 committed into the page');
  /* the Anki block is drawn before the tab is committed, so give a late draw time to land before reading what is there */
  await new Promise(r => setTimeout(r, 600));
  return cdp.evaluate(`(() => {
    const content = document.querySelector('#review-content');
    return {
      children: content ? content.children.length : -1,
      hud: !!content?.querySelector('.anki-hud'),
      offline: !!content?.querySelector('.review-card h2') && !content.querySelector('.anki-hud'),
      reconnect: !!content?.querySelector('.review-controls button'),
      failedPage: !!document.querySelector('#learning-content .learning-failed'),
    };
  })()`);
}

for (const mode of Object.keys(STATUS)) {
  test(`复习 draws the Anki block on first open (${mode})`, { skip: !hasEdge && 'Edge not installed', timeout: 120000 }, async () => {
    const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-review-first-'));
    let server, cdp;
    try {
      server = await serveWeb();
      cdp = await startEdge(path.join(temp, 'edge'));
      const seen = await openReview(cdp, `http://127.0.0.1:${server.address().port}/`, mode);
      assert.equal(seen.failedPage, false, `${mode}: the review tab must not fall back to the whole-tab failure panel`);
      assert.ok(seen.children > 0, `${mode}: #review-content must not be empty (blank 复习 tab): ${JSON.stringify(seen)}`);
      if (mode === 'connected') assert.ok(seen.hud, 'connected: the Anki HUD is drawn');
      else assert.ok(seen.offline && seen.reconnect, `${mode}: 尚未连接 Anki with its reconnect button is drawn: ${JSON.stringify(seen)}`);
    } finally {
      await cdp?.stop();
      server?.close();
      for (let i = 0; i < 5; i++) {
        try { fs.rmSync(temp, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 30)); }
      }
    }
  });
}
