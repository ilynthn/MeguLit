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
    homeCalls: window.__state?.homeCalls || 0,
    bootErrors: (window.__bootErrors || []).slice(0, 5),
    appText: (document.querySelector('#app')?.textContent || '').trim().slice(0, 120),
  }))()`).catch(err => ({ evalError: String(err?.message || err) }));
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(diag)}`);
}

test('dictionary saved-word check matches spelling rather than reading and refreshes cache after onSave', { skip: !hasEdge && 'Edge not installed', timeout: 120000 }, async t => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-dict-saved-'));
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
        window.__state = {
          vocab: [
            { id: 1, spelling: '橋', reading: 'はし', definitions: '["桥"]', status: 1, created_at: 1700000000 },
            { id: 2, spelling: '', reading: 'かみ', definitions: '["纯假名示例"]', status: 0, created_at: 1700000001 },
          ],
          homeCalls: 0,
          dictCalls: 0,
          vocabCalls: 0,
          savedCalls: [],
        };
        const entriesByQuery = {
          'はし': [
            { spelling: '橋', reading: 'はし', definition: '桥' },
            { spelling: '箸', reading: 'はし', definition: '筷子' },
            { spelling: '端', reading: 'はし', definition: '边缘；尽头' },
          ],
          'かみ': [
            { spelling: '紙', reading: 'かみ', definition: '纸' },
            { spelling: '', reading: 'かみ', definition: '纯假名示例' },
            { spelling: '', reading: 'やっぱり', definition: '果然' },
          ],
        };
        window.__TOME_TEST_TRANSPORT__ = async (command, args) => {
          if (command !== 'service') return {};
          const req = args?.request || {};
          switch (req.action) {
            case 'home':
              window.__state.homeCalls++;
              return { games: [], stats: { readingSeconds: 0, words: window.__state.vocab.length, lookups: 0 }, preferences: { language: 'zh', accent: '#ad1539' } };
            case 'ui_state':
              return {};
            case 'preferences':
              return { language: 'zh', accent: '#ad1539' };
            case 'vocabulary':
              window.__state.vocabCalls++;
              return window.__state.vocab.map(r => ({ ...r }));
            case 'unknown_words':
            case 'learning_activity':
              return [];
            case 'moji_status':
              return { signedIn: false, name: '' };
            case 'dictionary':
              window.__state.dictCalls++;
              return (entriesByQuery[req.query] || []).map(x => ({ ...x }));
            case 'reading_save_word': {
              const key = String(req.key || req.base || '');
              window.__state.savedCalls.push(key);
              if (!window.__state.vocab.some(v => (v.spelling || v.reading) === key)) {
                window.__state.vocab.push({
                  id: window.__state.vocab.length + 1,
                  spelling: key === 'やっぱり' ? '' : key,
                  reading: key === 'やっぱり' ? 'やっぱり' : 'はし',
                  definitions: '["已收录"]',
                  status: 0,
                  created_at: 1700000100,
                });
              }
              return { spelling: key };
            }
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
    await waitFor(cdp, "!!document.querySelector('[data-tab=\"dictionary\"]')", 'dictionary tab button');
    await cdp.evaluate("document.querySelector('[data-tab=\"dictionary\"]').click()");
    await waitFor(
      cdp,
      "!!document.querySelector('#lookup-input') && !!document.querySelector('#lookup-form button[value=\"local\"]')",
      'dictionary lookup form',
    );

    await t.test('homophones sharing reading with a saved word stay savable, and saving refreshes savedSet on next search', async () => {
      const res = await cdp.evaluate(`(async () => {
        const waitUntil = async (pred, label, ms = 10000) => {
          const end = Date.now() + ms;
          while (Date.now() < end) {
            if (pred()) return;
            await new Promise(r => setTimeout(r, 20));
          }
          throw new Error('timed out waiting for ' + label);
        };
        const searchLocal = async (q, firstNeedle) => {
          const input = document.querySelector('#lookup-input');
          const btn = document.querySelector('#lookup-form button[value="local"]');
          if (!input || !btn) throw new Error('lookup controls missing');
          const beforeCalls = window.__state.dictCalls;
          input.value = q;
          btn.click();
          await waitUntil(() => {
            const rows = document.querySelectorAll('.dict-entries .esr-row');
            return window.__state.dictCalls > beforeCalls
              && rows.length === 3
              && rows[0].textContent.includes(firstNeedle)
              && !!document.querySelector('.dict-entries [data-save]');
          }, 'search results for ' + q);
        };
        const inspect = async index => {
          const rows = [...document.querySelectorAll('.dict-entries .esr-row')];
          if (!rows[index]) throw new Error('missing result row ' + index);
          rows[index].click();
          await waitUntil(
            () => document.querySelectorAll('.dict-entries .esr-row')[index]?.classList.contains('is-cur')
              && !!document.querySelector('.dict-entries [data-save]'),
            'entry selection ' + index,
          );
          const btn = document.querySelector('.dict-entries [data-save]');
          return { text: btn?.textContent.trim() || '', disabled: !!btn?.disabled };
        };

        await searchLocal('はし', '橋');
        const hashiBridge = await inspect(0);
        const hashiChopsticks = await inspect(1);
        const hashiEdge = await inspect(2);

        // Save 箸 from the dictionary panel.
        await inspect(1);
        const saveBtn = document.querySelector('.dict-entries [data-save]');
        const savedBefore = window.__state.savedCalls.length;
        if (saveBtn && !saveBtn.disabled) {
          saveBtn.click();
          await waitUntil(
            () => window.__state.savedCalls.length > savedBefore && !!document.querySelector('.dict-entries [data-save]')?.disabled,
            'save completion for 箸',
          );
        }

        // Search はし again: 箸 must stay saved while 端 remains savable.
        const vocabCallsBefore = window.__state.vocabCalls;
        await searchLocal('はし', '橋');
        const chopsticksAfterResearch = await inspect(1);
        const edgeAfterResearch = await inspect(2);
        return {
          hashiBridge,
          hashiChopsticks,
          hashiEdge,
          savedCalls: window.__state.savedCalls.slice(),
          vocabCallsBefore,
          vocabCallsAfter: window.__state.vocabCalls,
          chopsticksAfterResearch,
          edgeAfterResearch,
        };
      })()`);

      assert.equal(res.hashiBridge.disabled, true, 'already saved 橋 should be marked saved');
      assert.equal(res.hashiChopsticks.disabled, false, 'homophone 箸 must not be disabled just because 橋 shares はし');
      assert.equal(res.hashiEdge.disabled, false, 'homophone 端 must not be disabled just because 橋 shares はし');
      assert.deepEqual(res.savedCalls, ['箸']);
      assert.ok(res.vocabCallsAfter > res.vocabCallsBefore, 'onSave must clear cached savedSet so subsequent search re-reads vocabulary');
      assert.equal(res.chopsticksAfterResearch.disabled, true, 'newly saved 箸 must stay marked saved after re-searching');
      assert.equal(res.edgeAfterResearch.disabled, false, 'unsaved homophone 端 must stay savable after re-searching');
    });

    await t.test('kana-only saved entry does not disable kanji homophone, and kana-only entry updates immediately on save', async () => {
      const res = await cdp.evaluate(`(async () => {
        const waitUntil = async (pred, label, ms = 10000) => {
          const end = Date.now() + ms;
          while (Date.now() < end) {
            if (pred()) return;
            await new Promise(r => setTimeout(r, 20));
          }
          throw new Error('timed out waiting for ' + label);
        };
        const input = document.querySelector('#lookup-input');
        const btn = document.querySelector('#lookup-form button[value="local"]');
        if (!input || !btn) throw new Error('lookup controls missing');
        const beforeCalls = window.__state.dictCalls;
        input.value = 'かみ';
        btn.click();
        await waitUntil(() => {
          const rows = document.querySelectorAll('.dict-entries .esr-row');
          return window.__state.dictCalls > beforeCalls
            && rows.length === 3
            && rows[0].textContent.includes('紙')
            && !!document.querySelector('.dict-entries [data-save]');
        }, 'search results for かみ');

        const inspect = async index => {
          const rows = [...document.querySelectorAll('.dict-entries .esr-row')];
          if (!rows[index]) throw new Error('missing result row ' + index);
          rows[index].click();
          await waitUntil(
            () => document.querySelectorAll('.dict-entries .esr-row')[index]?.classList.contains('is-cur')
              && !!document.querySelector('.dict-entries [data-save]'),
            'entry selection ' + index,
          );
          const b = document.querySelector('.dict-entries [data-save]');
          return { text: b?.textContent.trim() || '', disabled: !!b?.disabled };
        };

        const kamiPaper = await inspect(0);
        const kamiKana = await inspect(1);
        const yappariBefore = await inspect(2);
        const saveBtn = document.querySelector('.dict-entries [data-save]');
        const savedBefore = window.__state.savedCalls.length;
        if (saveBtn && !saveBtn.disabled) {
          saveBtn.click();
          await waitUntil(
            () => window.__state.savedCalls.length > savedBefore && !!document.querySelector('.dict-entries [data-save]')?.disabled,
            'save completion for やっぱり',
          );
        }
        const yappariAfter = {
          text: document.querySelector('.dict-entries [data-save]')?.textContent.trim() || '',
          disabled: !!document.querySelector('.dict-entries [data-save]')?.disabled,
        };
        return { kamiPaper, kamiKana, yappariBefore, yappariAfter };
      })()`);

      assert.equal(res.kamiPaper.disabled, false, 'kanji entry 紙 must not be disabled by saved kana-only entry かみ');
      assert.equal(res.kamiKana.disabled, true, 'saved kana-only entry かみ should be marked saved');
      assert.equal(res.yappariBefore.disabled, false);
      assert.equal(res.yappariAfter.disabled, true, 'saving kana-only entry やっぱり should immediately mark it saved');
    });
  } finally {
    await cdp?.stop();
    server?.close();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(temp, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 30)); }
    }
  }
});
