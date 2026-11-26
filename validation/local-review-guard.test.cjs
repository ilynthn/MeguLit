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
const WEB = path.join(ROOT, 'web');
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
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(WEB, rel);
    if (!file.startsWith(WEB + path.sep) && file !== WEB) {
      res.writeHead(403);
      return res.end();
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
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
    bootErrors: (window.__bootErrors || []).slice(0, 5),
    appText: (document.querySelector('#app')?.textContent || '').trim().slice(0, 120),
  }))()`).catch(err => ({ evalError: String(err?.message || err) }));
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(diag)}`);
}

test('local review prevents double-click skip, recovers on record_review error, and drops stale renders after switching tabs', { skip: !hasEdge && 'Edge not installed', timeout: 120000 }, async t => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-local-review-'));
  let server, cdp;
  try {
    server = await serveWeb();
    cdp = await startEdge(path.join(temp, 'edge'));
    const url = `http://127.0.0.1:${server.address().port}/`;

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        window.__bootErrors = [];
        window.addEventListener('error', e => window.__bootErrors.push(String(e.message || e.error || 'error')));
        window.addEventListener('unhandledrejection', e => window.__bootErrors.push(String(e.reason || 'rejection')));
        const words = [
          { id: 101, spelling: '夢', reading: 'ゆめ', definitions: '["梦"]' },
          { id: 102, spelling: '空', reading: 'そら', definitions: '["天空"]' },
        ];
        window.__ctrl = {
          recordCalls: [],
          vocabResolvers: [],
          recordResolvers: [],
          holdVocab: false,
          holdRecord: false,
          failNextRecord: false,
        };
        window.__TOME_TEST_TRANSPORT__ = async (command, args) => {
          if (command !== 'service') return {};
          const req = args?.request || {};
          switch (req.action) {
            case 'home':
              return { games: [], stats: { readingSeconds: 0, words: words.length, lookups: 0 }, preferences: { language: 'zh', accent: '#ad1539' } };
            case 'ui_state':
              return {};
            case 'preferences':
              return { language: 'zh', accent: '#ad1539' };
            case 'vocabulary':
              if (window.__ctrl.holdVocab) {
                return new Promise(resolve => window.__ctrl.vocabResolvers.push(() => resolve(words.map(w => ({ ...w })))));
              }
              return words.map(w => ({ ...w }));
            case 'record_review':
              window.__ctrl.recordCalls.push(req.id);
              if (window.__ctrl.failNextRecord) {
                window.__ctrl.failNextRecord = false;
                throw new Error('RECORD_FAILED');
              }
              if (window.__ctrl.holdRecord) {
                return new Promise(resolve => window.__ctrl.recordResolvers.push(() => resolve({ ok: true })));
              }
              return { ok: true };
            case 'anki_status':
              return { connected: true, decks: ['Default'], defaultDeck: 'Default' };
            case 'anki_current':
            case 'anki_practice':
              return { done: true };
            case 'unknown_words':
            case 'learning_activity':
              return [];
            default:
              return {};
          }
        };
      })();`,
    });

    await cdp.send('Page.navigate', { url });
    await waitFor(
      cdp,
      "document.readyState === 'complete' && window.__TOME_READY__ === true && !!document.querySelector('[data-route=\"learning\"]')",
      'app boot and learning route button',
    );
    await cdp.evaluate("document.querySelector('[data-route=\"learning\"]').click()");
    await waitFor(cdp, "!!document.querySelector('[data-tab=\"review\"]')", 'review tab button');
    await cdp.evaluate("document.querySelector('[data-tab=\"review\"]').click()");
    await waitFor(cdp, "!!document.querySelector('[data-review-source=\"local\"]')", 'local review source tab');

    await t.test('rapid clicks on Next while record_review is pending record once and advance only one card', async () => {
      const res = await cdp.evaluate(`(async () => {
        const waitUntil = async (pred, label, ms = 10000) => {
          const end = Date.now() + ms;
          while (Date.now() < end) {
            if (pred()) return;
            await new Promise(r => setTimeout(r, 20));
          }
          throw new Error('timed out waiting for ' + label);
        };
        window.__ctrl.recordCalls.length = 0;
        window.__ctrl.holdVocab = false;
        window.__ctrl.holdRecord = true;
        window.__ctrl.recordResolvers.length = 0;

        document.querySelector('[data-review-source="local"]').click();
        await waitUntil(() => document.querySelector('.review-card h2')?.textContent === '夢', 'first card');

        // Reveal answer
        document.querySelector('#review-next').click();
        await waitUntil(() => !!document.querySelector('.review-card .word-reading'), 'revealed answer');

        // Double-click Next while record_review is in flight
        const btn = document.querySelector('#review-next');
        btn.click();
        const disabledDuringFlight = btn.disabled;
        btn.click();
        const callsWhilePending = window.__ctrl.recordCalls.slice();

        // Resolve all pending record_review calls
        while (window.__ctrl.recordResolvers.length) {
          window.__ctrl.recordResolvers.shift()();
        }
        await waitUntil(() => document.querySelector('.review-card h2')?.textContent !== '夢', 'card advance');

        return {
          disabledDuringFlight,
          callsWhilePending,
          callsAfterResolve: window.__ctrl.recordCalls.slice(),
          secondCardHeading: document.querySelector('.review-card h2')?.textContent || null,
          secondCardCounter: document.querySelector('.review-card .muted')?.textContent || null,
        };
      })()`);

      assert.equal(res.disabledDuringFlight, true, 'Next button must disable while record_review is pending');
      assert.deepEqual(res.callsWhilePending, [101], 'rapid double click must not send duplicate record_review requests');
      assert.deepEqual(res.callsAfterResolve, [101]);
      assert.equal(res.secondCardHeading, '空', 'must advance to the second card rather than skipping it');
      assert.equal(res.secondCardCounter, '2 / 2');
    });

    await t.test('record_review failure keeps the current card and re-enables Next for retry', async () => {
      const res = await cdp.evaluate(`(async () => {
        const waitUntil = async (pred, label, ms = 10000) => {
          const end = Date.now() + ms;
          while (Date.now() < end) {
            if (pred()) return;
            await new Promise(r => setTimeout(r, 20));
          }
          throw new Error('timed out waiting for ' + label);
        };
        window.__ctrl.holdVocab = false;
        window.__ctrl.holdRecord = false;
        window.__ctrl.failNextRecord = true;
        window.__bootErrors.length = 0;

        document.querySelector('[data-review-source="local"]').click();
        await waitUntil(() => document.querySelector('.review-card h2')?.textContent === '夢', 'first card');

        // Reveal first card (夢)
        document.querySelector('#review-next').click();
        await waitUntil(() => !!document.querySelector('.review-card .word-reading'), 'first card revealed');

        // First Next fails
        document.querySelector('#review-next').click();
        await waitUntil(() => !document.querySelector('#review-next')?.disabled, 'Next re-enabled after error');
        await new Promise(r => setTimeout(r, 30));
        const afterError = {
          heading: document.querySelector('.review-card h2')?.textContent || null,
          disabled: !!document.querySelector('#review-next')?.disabled,
          unhandledErrors: window.__bootErrors.slice(),
        };

        // Retry succeeds and advances to second card (空)
        document.querySelector('#review-next').click();
        await waitUntil(() => document.querySelector('.review-card h2')?.textContent === '空', 'advanced to second card');
        return {
          afterError,
          nextHeading: document.querySelector('.review-card h2')?.textContent || null,
        };
      })()`);

      assert.equal(res.afterError.heading, '夢', 'failed record_review must stay on the current card');
      assert.equal(res.afterError.disabled, false, 'Next button must re-enable after failure');
      assert.deepEqual(res.afterError.unhandledErrors, [], 'record_review error must be handled rather than unhandled rejection');
      assert.equal(res.nextHeading, '空', 'retrying Next after error must advance to the next card');
    });

    await t.test('slow vocabulary or record_review response does not overwrite Anki review after switching back', async () => {
      const res = await cdp.evaluate(`(async () => {
        const waitUntil = async (pred, label, ms = 10000) => {
          const end = Date.now() + ms;
          while (Date.now() < end) {
            if (pred()) return;
            await new Promise(r => setTimeout(r, 20));
          }
          throw new Error('timed out waiting for ' + label);
        };
        window.__ctrl.holdVocab = true;
        window.__ctrl.vocabResolvers.length = 0;

        // 1. Slow vocabulary load followed by switching back to Anki review
        document.querySelector('[data-review-source="local"]').click();
        await waitUntil(() => window.__ctrl.vocabResolvers.length === 1, 'pending vocabulary request');
        document.querySelector('[data-review-source="anki"]').click();
        await waitUntil(() => !!document.querySelector('#review-content [data-start]'), 'Anki deck view mounted');

        window.__ctrl.vocabResolvers.shift()();
        await new Promise(r => setTimeout(r, 50));
        const afterSlowVocab = {
          hasAnkiStart: !!document.querySelector('#review-content [data-start]'),
          hasLocalNext: !!document.querySelector('#review-content #review-next'),
        };

        // 2. Slow record_review followed by switching back to Anki review
        window.__ctrl.holdVocab = false;
        window.__ctrl.holdRecord = true;
        window.__ctrl.recordResolvers.length = 0;
        document.querySelector('[data-review-source="local"]').click();
        await waitUntil(() => document.querySelector('.review-card h2')?.textContent === '夢' && !!document.querySelector('#review-next'), 'local card mounted');
        document.querySelector('#review-next').click();
        await waitUntil(() => !!document.querySelector('.review-card .word-reading'), 'revealed');
        document.querySelector('#review-next').click();
        await waitUntil(() => window.__ctrl.recordResolvers.length === 1, 'pending record_review');

        document.querySelector('[data-review-source="anki"]').click();
        await waitUntil(() => !!document.querySelector('#review-content [data-start]'), 'Anki deck view mounted again');

        window.__ctrl.recordResolvers.shift()();
        await new Promise(r => setTimeout(r, 50));
        const afterSlowRecord = {
          hasAnkiStart: !!document.querySelector('#review-content [data-start]'),
          hasLocalNext: !!document.querySelector('#review-content #review-next'),
        };

        return { afterSlowVocab, afterSlowRecord };
      })()`);

      assert.equal(res.afterSlowVocab.hasAnkiStart, true, 'Anki review must stay visible when stale vocabulary resolves');
      assert.equal(res.afterSlowVocab.hasLocalNext, false, 'stale vocabulary load must not overwrite Anki review');
      assert.equal(res.afterSlowRecord.hasAnkiStart, true, 'Anki review must stay visible when stale record_review resolves');
      assert.equal(res.afterSlowRecord.hasLocalNext, false, 'stale record_review completion must not overwrite Anki review');
    });
  } finally {
    await cdp?.stop();
    server?.close();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(temp, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 30)); }
    }
  }
});
