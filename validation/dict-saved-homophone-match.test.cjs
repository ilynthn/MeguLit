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

test('dictionary saved-word check matches spelling rather than reading and refreshes cache after onSave', { skip: !hasEdge && 'Edge not installed', timeout: 60000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-dict-saved-'));
  let server, cdp;
  try {
    server = await serveWeb();
    cdp = await startEdge(path.join(temp, 'edge'));
    const url = `http://127.0.0.1:${server.address().port}/`;

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        window.__state = {
          vocab: [
            { id: 1, spelling: '橋', reading: 'はし', definitions: '["桥"]', status: 1, created_at: 1700000000 },
            { id: 2, spelling: '', reading: 'かみ', definitions: '["纯假名示例"]', status: 0, created_at: 1700000001 },
          ],
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
    await cdp.evaluate(`(async () => {
      for (let i = 0; i < 100; i++) {
        if (document.querySelector('[data-route="learning"]')) break;
        await new Promise(r => setTimeout(r, 40));
      }
      document.querySelector('[data-route="learning"]').click();
      for (let i = 0; i < 100; i++) {
        const tab = document.querySelector('[data-tab="dictionary"]');
        if (tab) { tab.click(); break; }
        await new Promise(r => setTimeout(r, 40));
      }
      for (let i = 0; i < 100; i++) {
        if (document.querySelector('#lookup-input')) return true;
        await new Promise(r => setTimeout(r, 40));
      }
      throw new Error('dictionary tab did not mount');
    })()`);

    await t.test('homophones sharing reading with a saved word stay savable, and saving refreshes savedSet on next search', async () => {
      const res = await cdp.evaluate(`(async () => {
        const searchLocal = async q => {
          const input = document.querySelector('#lookup-input');
          const btn = document.querySelector('#lookup-form button[value="local"]');
          input.value = q;
          btn.click();
          for (let i = 0; i < 100; i++) {
            if (document.querySelectorAll('.dict-entries .esr-row').length === 3 && document.querySelector('.dict-entries [data-save]')) break;
            await new Promise(r => setTimeout(r, 30));
          }
        };
        const inspect = async index => {
          const rows = [...document.querySelectorAll('.dict-entries .esr-row')];
          rows[index].click();
          await new Promise(r => setTimeout(r, 20));
          const btn = document.querySelector('.dict-entries [data-save]');
          return { text: btn?.textContent.trim() || '', disabled: !!btn?.disabled };
        };

        await searchLocal('はし');
        const hashiBridge = await inspect(0);
        const hashiChopsticks = await inspect(1);
        const hashiEdge = await inspect(2);

        // Save 箸 from the dictionary panel.
        await inspect(1);
        const saveBtn = document.querySelector('.dict-entries [data-save]');
        if (!saveBtn.disabled) saveBtn.click();
        await new Promise(r => setTimeout(r, 80));

        // Search はし again: 箸 must stay saved while 端 remains savable.
        const vocabCallsBefore = window.__state.vocabCalls;
        await searchLocal('はし');
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
        const input = document.querySelector('#lookup-input');
        const btn = document.querySelector('#lookup-form button[value="local"]');
        input.value = 'かみ';
        btn.click();
        for (let i = 0; i < 100; i++) {
          const head = document.querySelector('.dict-entries .esr-row')?.textContent || '';
          if (head.includes('紙')) break;
          await new Promise(r => setTimeout(r, 30));
        }
        const inspect = async index => {
          const rows = [...document.querySelectorAll('.dict-entries .esr-row')];
          rows[index].click();
          await new Promise(r => setTimeout(r, 20));
          const b = document.querySelector('.dict-entries [data-save]');
          return { text: b?.textContent.trim() || '', disabled: !!b?.disabled };
        };

        const kamiPaper = await inspect(0);
        const kamiKana = await inspect(1);
        const yappariBefore = await inspect(2);
        const saveBtn = document.querySelector('.dict-entries [data-save]');
        if (!saveBtn.disabled) saveBtn.click();
        await new Promise(r => setTimeout(r, 80));
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
    await new Promise(r => setTimeout(r, 300));
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  }
});
