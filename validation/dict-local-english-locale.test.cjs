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
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.json': 'application/json; charset=utf-8',
};

function serveWeb() {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const file = path.join(ROOT, 'web', rel);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function waitFor(cdp, expr, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await cdp.evaluate(expr).catch(() => false);
    if (ok) return;
    await new Promise(r => setTimeout(r, 50));
  }
  const diag = await cdp.evaluate(`(() => ({
    href: location.href,
    readyState: document.readyState,
    tomeReady: !!window.__TOME_READY__,
    dictCalls: (window.__dictCalls || []).length,
    bootErrors: (window.__bootErrors || []).slice(0, 5),
    appText: (document.querySelector('#app')?.textContent || '').trim().slice(0, 120),
  }))()`).catch(err => ({ evalError: String(err?.message || err) }));
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(diag)}`);
}

test('bridge dictionary local fallback forwards English language to lookup_exact', async () => {
  const { dispatch } = require('../services/bridge.cjs');
  const seen = [];
  const runtime = {
    learning: () => ({
      async request(cmd, args, lang) {
        seen.push({ cmd, args, lang });
        return {
          entries: [{
            spellings: ['夢'],
            readings: ['ゆめ'],
            definitions: [lang === 'en' ? 'dream' : '梦'],
          }],
        };
      },
    }),
  };

  const enRows = await dispatch({ action: 'dictionary', query: '夢', source: 'local', language: 'en' }, runtime);
  assert.equal(seen[0]?.lang, 'en');
  assert.equal(enRows[0]?.definition, 'dream');

  const zhRows = await dispatch({ action: 'dictionary', query: '夢', source: 'local' }, runtime);
  assert.equal(seen[1]?.lang, 'zh');
  assert.equal(zhRows[0]?.definition, '梦');
});

test('dict-home peek passes English language when locale is en without adding operationId', async () => {
  const mod = await import(pathToFileURL(path.join(ROOT, 'web', 'dict-home.js')));
  assert.deepEqual(mod.DICT_HOME_PEEK('夢'), { query: '夢', source: 'local' });
  assert.deepEqual(mod.DICT_HOME_PEEK('夢', 'en'), { query: '夢', source: 'local', language: 'en' });
});

test('dictionary page in English locale sends language=en for local lookup and Jisho fallback', { skip: !hasEdge && 'Edge not installed', timeout: 120000 }, async () => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-dict-en-'));
  let server, cdp;
  try {
    server = await serveWeb();
    cdp = await startEdge(path.join(temp, 'edge'));
    const url = `http://127.0.0.1:${server.address().port}/`;

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__bootErrors = [];
        window.addEventListener('error', e => window.__bootErrors.push(String(e.message || e.error || 'error')));
        window.addEventListener('unhandledrejection', e => window.__bootErrors.push(String(e.reason || 'rejection')));
        localStorage.setItem('tomoyo-ui-language', 'en');
        window.__dictCalls = [];
        window.__TOME_TEST_TRANSPORT__ = async (cmd, args) => {
          if (cmd !== 'service') return {};
          const req = args?.request || {};
          const a = req.action;
          if (a === 'home') return { games: [], stats: {}, preferences: { language: 'en', accent: '#ad1539' } };
          if (a === 'ui_state') return {};
          if (a === 'preferences') return { language: 'en', accent: '#ad1539' };
          if (a === 'unknown_words') return [{ surface: '夢', lookups: 3 }];
          if (a === 'vocabulary') return [];
          if (a === 'learning_activity') return [];
          if (a === 'dictionary') {
            window.__dictCalls.push({ query: req.query, source: req.source, language: req.language, hasOp: !!req.operationId });
            if (req.source === 'jisho') throw new Error('JISHO_UNAVAILABLE');
            return [{ spelling: req.query, reading: 'ゆめ', definition: req.language === 'en' ? 'dream' : '梦' }];
          }
          if (a === 'dictionary_related') return [];
          if (a === 'moji_status') return { signedIn: false };
          return {};
        };
      `,
    });

    await cdp.send('Page.navigate', { url });
    await waitFor(
      cdp,
      "document.readyState === 'complete' && window.__TOME_READY__ === true && !!document.querySelector('[data-route=\"learning\"]')",
      'app boot and learning route button',
    );
    await cdp.evaluate("document.querySelector('[data-route=\"learning\"]').click()");
    await waitFor(cdp, "!!document.querySelector('[data-tab=\"dictionary\"]')", 'dictionary tab button');
    await cdp.evaluate("document.querySelector('[data-tab=\"dictionary\"]').click()");
    await waitFor(
      cdp,
      "!!document.querySelector('#lookup-form') && !!document.querySelector('#lookup-input') && (window.__dictCalls || []).some(c => !c.hasOp)",
      'dictionary form and initial home peek',
    );

    const res = await cdp.evaluate(`(async () => {
      const waitUntil = async (pred, label, ms = 10000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          if (pred()) return;
          await new Promise(r => setTimeout(r, 20));
        }
        throw new Error('timed out waiting for ' + label);
      };
      const peekCalls = window.__dictCalls.filter(c => !c.hasOp);

      window.__dictCalls.length = 0;
      const input = document.querySelector('#lookup-input');
      const form = document.querySelector('#lookup-form');
      input.value = '夢';
      form.querySelector('button[value="local"]').click();
      await waitUntil(
        () => window.__dictCalls.some(c => c.source === 'local') && (document.querySelector('#lookup-results')?.textContent || '').includes('dream'),
        'local English dictionary result',
      );
      const localCall = window.__dictCalls.find(c => c.source === 'local');
      const localText = document.querySelector('#lookup-results')?.textContent || '';

      window.__dictCalls.length = 0;
      input.value = '夢';
      form.querySelector('button[value="moji"]').click();
      await waitUntil(
        () => window.__dictCalls.some(c => c.source === 'jisho') && window.__dictCalls.some(c => c.source === 'local'),
        'Jisho fallback to local English dictionary',
      );
      const fallbackCall = window.__dictCalls.find(c => c.source === 'local');
      return { peekCalls, localCall, localText, fallbackCall };
    })()`);

    assert.equal(res.peekCalls[0]?.language, 'en', 'dict-home peek in en locale must pass language=en');
    assert.equal(res.localCall?.language, 'en', 'local dictionary button in en locale must pass language=en');
    assert.match(res.localText, /dream/);
    assert.equal(res.fallbackCall?.language, 'en', 'Jisho fallback to local in en locale must pass language=en');
  } finally {
    await cdp?.stop();
    server?.close();
    await new Promise(r => setTimeout(r, 200));
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
});
