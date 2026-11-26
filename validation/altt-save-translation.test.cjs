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
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const hasEdge = [
  process.env.MEGULIT_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].some(p => p && fs.existsSync(p));

const MODULES = [
  'web/reader/modules/game-style.js',
  'web/reader/modules/typewriter.js',
  'web/reader/modules/inject.js',
  'web/reader/modules/settings.js',
  'web/reader/modules/island-page.js',
];

function pageHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><style>
body{margin:0;background:#101218;color:#eef0f5;font:18px/1.6 'Microsoft YaHei',sans-serif;}
.sentence-window{position:fixed;left:40px;bottom:40px;width:720px;padding:12px;}
body.tomoyo-game-style .tomoyo-cn-row:has(.tomoyo-cn-output:empty){visibility:hidden;}
</style></head>
<body class="tomoyo-ui-translation tomoyo-gal-bound tomoyo-game-style">
<div class="sentence-window"><div class="sentence-text"></div></div>
<script>
(() => {
  let now = 0, nextId = 1;
  const tasks = new Map();
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++, delay = Math.max(0, Number(ms) || 0);
    tasks.set(id, { id, at: now + delay, fn, args, interval: null });
    return id;
  };
  window.clearTimeout = id => { tasks.delete(id); };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextId++, interval = Math.max(1, Number(ms) || 1);
    tasks.set(id, { id, at: now + interval, fn, args, interval });
    return id;
  };
  window.clearInterval = id => { tasks.delete(id); };
  const baseDate = Date.now();
  Date.now = () => baseDate + now;
  if (window.performance) performance.now = () => now;
  window.__clock = {
    now: () => now,
    advance(ms) {
      const target = now + Math.max(0, Number(ms) || 0);
      for (let steps = 0; steps < 5000; steps++) {
        let next = null;
        for (const t of tasks.values()) {
          if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
        }
        if (!next) break;
        now = next.at;
        if (next.interval != null) next.at = now + next.interval;
        else tasks.delete(next.id);
        if (typeof next.fn === 'function') next.fn(...next.args);
      }
      now = target;
    },
    async tick(ms = 0) {
      await Promise.resolve();
      await Promise.resolve();
      this.advance(ms);
      await Promise.resolve();
    },
  };
})();
window.__sent = [];
window.__autoGuard = {};
window.__tomoyoTranslateRequest = raw => {
  const msg = JSON.parse(raw);
  window.__sent.push(msg);
  if (msg.type === 'translateGuard' && window.__autoGuard[msg.text]) {
    const answer = window.__autoGuard[msg.text];
    setTimeout(() => window.__tomoyoChinese.deliverBackfill(msg.text, answer, 'guard', { target: window.__tomoyoChinese.translationTarget(), source: 'api', provider: 'deepseek' }), 40);
  }
};
window.__tomoyoGalPrefs = { display: 'bilingual', translationPrompt: '' };
</script>
<script src="/m/0.js"></script>
<script src="/m/1.js"></script>
<script src="/m/2.js"></script>
<script src="/m/3.js"></script>
<script src="/m/4.js"></script>
<script>
(() => {
  const b = window.__tomoyoChinese;
  window.TomeTypewriter.configure({ enabled: false, speed: 120 });
  b.quietTranslation = true;
  b.isGalBound = () => true;
  b.galLayoutInfo = () => ({ clientX: 0, clientY: 0, clientWidth: 1280, clientHeight: 720, readerX: 64, readerY: 500, readerWidth: 1152, readerHeight: 180 });
  b.galPreferences = () => ({ ...window.TomoyoGameStyle.defaults, ...window.__tomoyoGalPrefs, translationSize: 24, hookHide: true, pageDimPast: true, typewriter: false });
  window.__ready = true;
})();
</script>
</body>
</html>`;
}

function serve() {
  const html = pageHtml();
  const sources = MODULES.map(read);
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    if (p === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    const m = /^\/m\/(\d+)\.js$/.exec(p);
    if (m && sources[Number(m[1])] != null) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      return res.end(sources[Number(m[1])]);
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openFresh(cdp, url) {
  await cdp.send('Page.navigate', { url });
  for (let i = 0; i < 200; i++) {
    if (await cdp.evaluate('window.__ready === true').catch(() => false)) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('reader harness did not initialize');
}

test('Alt+T settings save re-arms translateGuard and orders visibility notifications before refresh (#1127)', { skip: !hasEdge && 'Edge not installed', timeout: 30000 }, async t => {
  const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-altt-save-'));
  let server, cdp;
  try {
    server = await serve();
    cdp = await startEdge(path.join(temp, 'edge'));
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.clear(); } catch {}' });
    const url = `http://127.0.0.1:${server.address().port}/`;

    await t.test('refresh after Alt+T settings save re-arms translateGuard when refreshed response is lost', async () => {
      await openFresh(cdp, url);
      const res = await cdp.evaluate(`(async () => {
        const b = window.__tomoyoChinese;
        const jp = '「今日はいい天気だね。」';
        const zh = '“今天天气真好呢。”';
        document.querySelector('.sentence-text').textContent = jp;
        b.refresh();
        await window.__clock.tick(280);
        const firstReq = window.__sent.find(m => m.id && m.text === jp);
        b.deliver(firstReq.id, zh, false, '', { target: 'zh', source: 'api', provider: 'deepseek' });
        const beforeSave = document.querySelector('.tomoyo-cn-output').textContent;

        // Advance past initial 600ms/1500ms/3000ms guard timers, as when the player reads a line and opens Alt+T.
        await window.__clock.tick(3150);

        b.openSettings();
        await window.__clock.tick(30);
        const dialog = document.querySelector('.tomoyo-cn-dialog');
        const form = dialog.querySelector('form');
        form.elements.namedItem('size').value = '22';
        form.elements.namedItem('size').dispatchEvent(new Event('input', { bubbles: true }));
        window.__sent.length = 0;
        window.__autoGuard[jp] = '“今天真是好天气呢。”';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        const cfg = window.__sent.find(m => m.type === 'configure');
        b.configured(true, '', cfg.configureId);

        await window.__clock.tick(950);
        const guards = window.__sent.filter(m => m.type === 'translateGuard' && m.text === jp);
        const afterReq = window.__sent.find(m => m.id && m.text === jp);
        return {
          beforeSave,
          afterSave: document.querySelector('.tomoyo-cn-output')?.textContent || '',
          state: document.querySelector('.tomoyo-cn-output')?.dataset.state || '',
          guardCount: guards.length,
          guardSerial: guards[0]?.visibleSerial ?? null,
          afterReqId: afterReq?.id ?? null,
        };
      })()`);
      assert.equal(res.beforeSave, '“今天天气真好呢。”');
      assert.ok(res.guardCount >= 1, 'refresh after save must re-arm translateGuard');
      assert.equal(res.guardSerial, res.afterReqId, 'guard should carry the refreshed visible serial');
      assert.equal(res.afterSave, '“今天真是好天气呢。”');
      assert.equal(res.state, 'ready');
    });

    await t.test('line first seen while translation is hidden re-arms guard once visibility returns', async () => {
      await openFresh(cdp, url);
      const res = await cdp.evaluate(`(async () => {
        const b = window.__tomoyoChinese;
        const jp = '「ここで待っていて。」';
        b.setTranslationVisible(false);
        document.querySelector('.sentence-text').textContent = jp;
        await window.__clock.tick(280);
        window.__sent.length = 0;
        window.__autoGuard[jp] = '“在这里等着。”';
        b.setTranslationVisible(true);
        await window.__clock.tick(950);
        const guards = window.__sent.filter(m => m.type === 'translateGuard' && m.text === jp);
        const visIdx = window.__sent.findIndex(m => m.disabled === false);
        const reqIdx = window.__sent.findIndex(m => m.id && m.text === jp);
        return {
          guardCount: guards.length,
          text: document.querySelector('.tomoyo-cn-output')?.textContent || '',
          hidden: document.querySelector('.tomoyo-cn-output')?.hidden,
          visIdx,
          reqIdx,
          visId: window.__sent[visIdx]?.id ?? null,
          reqId: window.__sent[reqIdx]?.id ?? null,
        };
      })()`);
      assert.ok(res.guardCount >= 1, 'line first seen while hidden must still trigger translateGuard once shown');
      assert.equal(res.text, '“在这里等着。”');
      assert.equal(res.hidden, false);
      assert.ok(res.visIdx >= 0 && res.reqIdx > res.visIdx);
      assert.ok(res.reqId > res.visId);
    });

    await t.test('re-enabling translation after disable suppresses guard while off and re-arms on the same line', async () => {
      await openFresh(cdp, url);
      const res = await cdp.evaluate(`(async () => {
        const b = window.__tomoyoChinese;
        const jp = '「すぐ戻るよ。」';
        document.querySelector('.sentence-text').textContent = jp;
        b.refresh();
        await window.__clock.tick(280);
        const firstReq = window.__sent.find(m => m.id && m.text === jp);
        b.deliver(firstReq.id, '“马上回来。”', false, '', { target: 'zh', source: 'api', provider: 'deepseek' });

        window.__sent.length = 0;
        b.setEnabled(false);
        const jp2 = '「ここで待ってて。」';
        document.querySelector('.sentence-text').textContent = jp2;
        await window.__clock.tick(750);
        const guardsWhileOff = window.__sent.filter(m => m.type === 'translateGuard').length;

        window.__sent.length = 0;
        window.__autoGuard[jp2] = '“在这边等我。”';
        b.setEnabled(true);
        await window.__clock.tick(950);
        const guardsAfterOn = window.__sent.filter(m => m.type === 'translateGuard' && m.text === jp2);
        return {
          guardsWhileOff,
          guardCount: guardsAfterOn.length,
          text: document.querySelector('.tomoyo-cn-output')?.textContent || '',
          hidden: document.querySelector('.tomoyo-cn-output')?.hidden,
        };
      })()`);
      assert.equal(res.guardsWhileOff, 0, 'translateGuard must not fire while translation is disabled');
      assert.ok(res.guardCount >= 1, 'line seen while disabled must trigger translateGuard once re-enabled');
      assert.equal(res.text, '“在这边等我。”');
      assert.equal(res.hidden, false);
    });

    await t.test('setHookSourcePreview cancels pending guard timers while previewing and re-arms on exit', async () => {
      await openFresh(cdp, url);
      const res = await cdp.evaluate(`(async () => {
        const b = window.__tomoyoChinese;
        const jp = '「プレビュー確認。」';
        document.querySelector('.sentence-text').textContent = jp;
        b.refresh();
        await window.__clock.tick(120);
        window.__sent.length = 0;
        b.setHookSourcePreview(true);
        await window.__clock.tick(750);
        const guardsInPreview = window.__sent.filter(m => m.type === 'translateGuard').length;

        window.__sent.length = 0;
        window.__autoGuard[jp] = '“预览确认。”';
        b.setHookSourcePreview(false);
        await window.__clock.tick(950);
        const guardsAfterPreview = window.__sent.filter(m => m.type === 'translateGuard' && m.text === jp);
        return {
          guardsInPreview,
          guardCount: guardsAfterPreview.length,
          text: document.querySelector('.tomoyo-cn-output')?.textContent || '',
        };
      })()`);
      assert.equal(res.guardsInPreview, 0, 'pending guard timers must be cleared during source preview');
      assert.ok(res.guardCount >= 1, 'exiting source preview must re-arm translateGuard');
      assert.equal(res.text, '“预览确认。”');
    });

    await t.test('setTranslationVisible advances serial to cancel in-flight requests and precedes paged refresh requests', async () => {
      await openFresh(cdp, url);
      const single = await cdp.evaluate(`(async () => {
        const b = window.__tomoyoChinese;
        const jp = '「風が冷たいね。」';
        document.querySelector('.sentence-text').textContent = jp;
        b.refresh();
        await window.__clock.tick(280);
        const req = window.__sent.find(m => m.id && m.text === jp);
        window.__sent.length = 0;
        b.setTranslationVisible(false);
        await window.__clock.tick(750);
        const offAck = window.__sent.find(m => m.disabled === true);
        const guardsWhileHidden = window.__sent.filter(m => m.type === 'translateGuard').length;
        return { reqId: req?.id ?? null, offId: offAck?.id ?? null, guardsWhileHidden };
      })()`);
      assert.ok(single.reqId != null && single.offId != null, 'in-flight request and disabled ack must both carry ids');
      assert.ok(single.offId > single.reqId, `disabled=true must advance serial past in-flight request (${single.offId} <= ${single.reqId})`);
      assert.equal(single.guardsWhileHidden, 0, 'translateGuard must not fire while translation is hidden');

      await openFresh(cdp, url);
      const paged = await cdp.evaluate(`(() => {
        const b = window.__tomoyoChinese;
        b.setTranslationVisible(false);
        b.islandPage.accept({ hookSourceEngine: 'nvl', hookSource: '「雨が降ってきた。」', hookSequence: 1, hookFlowPageStart: true });
        window.__sent.length = 0;
        b.setTranslationVisible(true);
        const disabledIdx = window.__sent.findIndex(m => m.disabled === false);
        const reqIdx = window.__sent.findIndex(m => m.pageKey && m.text === '「雨が降ってきた。」');
        return {
          disabledIdx,
          reqIdx,
          disabledId: window.__sent[disabledIdx]?.id ?? null,
          reqId: window.__sent[reqIdx]?.id ?? null,
        };
      })()`);
      assert.ok(paged.disabledIdx >= 0 && paged.reqIdx >= 0, 'both visibility ack and paged translation request should be sent');
      assert.ok(paged.disabledIdx < paged.reqIdx, `disabled=false must precede paged translation request (got ${paged.disabledIdx} vs ${paged.reqIdx})`);
      assert.ok(paged.reqId > paged.disabledId, `paged request id must be greater than disabled ack id (got ${paged.reqId} vs ${paged.disabledId})`);
    });
  } finally {
    await cdp?.stop();
    server?.close();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(temp, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 30)); }
    }
  }
});
