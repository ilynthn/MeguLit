// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* アオイトリ（青鸟）, user 2026-11-28 (「这个文本的出现一闪一闪的」): its text box sits at the bottom, sized to each line and
   centred, every line on one row. After a short centred line, a long line the game types on one row was wrapped at the short
   line's width while it typed, then at the reader box width, and half way through its rows jumped above the box. Replays: the
   target (one row on the game's row while it types and when complete, Japanese and translation centred together, with an
   anchor offset, a scaled client and the bottom-row squeeze; a game glyph that never gets a box, a doubled dash, narrow
   boxes; a centred two-row line wider than the box), and the layouts that must keep the reader's own wrapping: a
   left-aligned box, the first row of a line the game wraps, a row wider than the game client, one-line Japanese.
   Headless Edge through playwright-core; skipped when it is not installed (MEGULIT_PLAYWRIGHT). */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path'), test = require('node:test');
let chromium = null;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP box one-row wrap (no playwright-core)'); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const tokens = t => [...t].map(c => '<span class="char-token">' + c + '</span>').join('');
/* the reader box: border-box with side padding like gal.js; o.oneLine: the one-line Japanese option (gal.js makes the row nowrap) */
const html = o => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}
.sentence-window{position:fixed;left:${o.winLeft ?? 240}px;bottom:20px;width:${o.winWidth ?? 560}px;height:150px;box-sizing:border-box;padding:10px 20px}
.sentence-text{font-size:${o.font ?? 28}px;line-height:1.2}.tomoyo-cn-row{font-size:20px}
body.megulit-jp-one-line .sentence-text{white-space:nowrap!important}</style></head><body class="${o.oneLine ? 'megulit-jp-one-line' : ''}">
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"></div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output">我只是想变得普通一次而已。</span></div></div></main>
<script>${o.growsDown ? 'window.MeguLitProfile={get:(k,d)=>k==="placement.translationGrowsDown"?true:d};' : ''}window.__tomoyoChinese={${o.prefs ? 'galPreferences:()=>(' + JSON.stringify(o.prefs) + '),' : ''}${o.layout ? 'galLayoutInfo:()=>(' + JSON.stringify(o.layout) + ')' : ''}};</script></body></html>`;
/* n game glyphs of size s from x0 on row y; centred on 640; the first `drawn` of them drawn */
const rowAt = (n, x0, y, s = 32) => Array.from({ length: n }, (_, i) => [x0 + i * s, y, s, s]);
const centred = (n, y, s = 32) => rowAt(n, 640 - n * s / 2, y, s);
const partial = (all, drawn) => [...all.slice(0, drawn), ...Array(all.length - drawn).fill(null)];
const SHORT = '見捨てたわけじゃない。', LONG = 'ただ、一度でいいから、“普通”になりたかった。', N = [...LONG].length;
const near = (v, want, what, s) => assert.ok(Math.abs(v - want) <= 2, what + ': ' + v + ', expected ' + want + ' (' + JSON.stringify(s) + ')');

test('a centred line the game keeps on one row stays on it; other layouts keep the reader\'s wrapping', { skip: !chromium }, async t => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    /* a page per scenario; place(game text, rects, reader text) replays one textPlace and returns what is drawn */
    const open = async (o = {}) => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.setContent(html(o)); await page.addScriptTag({ content: code });
      await page.evaluate(() => { window.__tomoyoChinese.textPlaceAnchor(false); window.__tomoyoChinese.textPlaceMode({ on: true }); window.__tomoyoChinese.textPlaceAnchor(true); });
      const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const shape = () => page.evaluate(() => {
        const w = document.querySelector('.sentence-window'), s = w.querySelector('.sentence-text'), t = [...s.querySelectorAll('.char-token')].map(e => e.getBoundingClientRect()), cn = w.querySelector('.tomoyo-cn-output').getBoundingClientRect();
        const minL = Math.min(...t.map(r => r.left)), maxR = Math.max(...t.map(r => r.right));
        return { rows: new Set(t.map(r => Math.round(r.top))).size, top: Math.round(t[0].top), first: Math.round(t[0].left), minL: Math.round(minL), maxR: Math.round(maxR), mid: Math.round((minL + maxR) / 2),
          cnMid: Math.round(cn.left + cn.width / 2), win: Math.round(w.getBoundingClientRect().width), scale: s.style.getPropertyValue('--megulit-anchor-scale') };
      });
      let last = '';
      const place = async (text, rects, reader = text) => {
        await page.evaluate(([t, h, r, fresh]) => { const s = document.querySelector('.sentence-text'); if (fresh) s.innerHTML = h; window.__tomoyoChinese.textPlace({ text: t, client: [1280, 720], rects: r }); }, [text, tokens(reader), rects, reader !== last]);
        last = reader; await frame(); return shape();
      };
      return { page, place, shape, frame };
    };
    const typed = async (p, text, all, steps, reader = text) => { const out = []; for (const d of steps) out.push(await p.place(text, d >= all.length ? all : partial(all, d), reader)); return out; };
    const onScreen = (s, what) => assert.ok(s.minL >= 0 && s.maxR <= 1280, what + ' stays on the screen (' + JSON.stringify(s) + ')');

    await t.test('target: a 23-glyph line typed after an 11-glyph one stays on one row on the game\'s row, centred with its translation', async () => {
      const p = await open();
      const short = await p.place(SHORT, centred(11, 656));
      assert.strictEqual(short.rows, 1);
      const all = centred(N, 656), steps = await typed(p, LONG, all, [3, 8, 16, N]), done = steps.at(-1);
      for (const s of steps) {
        assert.strictEqual(s.rows, 1, 'one row while it types and when complete (' + JSON.stringify(s) + ')');
        assert.strictEqual(s.top, short.top, 'on the game\'s row, not pushed above the box (' + JSON.stringify(s) + ')');
        assert.strictEqual(s.first, done.first, 'its first character does not move sideways while it types');
        near(s.mid, 640, 'the Japanese is centred on the box middle', s); near(s.cnMid, 640, 'the translation is centred with it', s);
      }
      assert.strictEqual(done.win, 644 + 40, 'the reader box takes the row (and its own padding) instead of wrapping it');
      assert.strictEqual((await p.place(SHORT, centred(11, 656))).win, 560, 'a short line after it gets the reader box back');
      await p.place(LONG, all);
      await p.page.evaluate(() => window.__tomoyoChinese.textPlaceMode({ on: false })); await p.frame();
      assert.strictEqual((await p.shape()).win, 560, 'placement off gives the reader box back');
      await p.page.close();
    });

    await t.test('target with an anchor offset, a scaled client and the bottom-row squeeze: translation stays with the Japanese', async () => {
      let p = await open({ prefs: { anchorDX: 5 } });
      await p.place(SHORT, centred(11, 656));
      for (const s of await typed(p, LONG, centred(N, 656), [3, N])) { assert.strictEqual(s.rows, 1); near(s.mid, 704, 'offset Japanese', s); near(s.cnMid, 704, 'offset translation', s); }
      await p.page.close();
      p = await open({ layout: { clientX: 100, clientY: 40, clientWidth: 960, clientHeight: 540, workBottom: 720 } });
      await p.place(SHORT, centred(11, 656));
      let steps = await typed(p, LONG, centred(N, 656), [3, 12, N]);
      for (const s of steps) { assert.strictEqual(s.rows, 1); near(s.mid, 580, 'Japanese in the scaled client', s); near(s.cnMid, 580, 'translation in the scaled client', s); assert.strictEqual(s.scale, steps.at(-1).scale, 'the squeeze does not change when the line completes'); }
      await p.page.close();
      p = await open({ font: 40 });
      await p.place(SHORT, centred(11, 690, 24));
      steps = await typed(p, LONG, centred(N, 690, 24), [3, 12, N]);
      for (const s of steps) { assert.strictEqual(s.rows, 1); near(s.mid, 640, 'squeezed Japanese', s); near(s.cnMid, 640, 'translation under it', s); assert.strictEqual(s.scale, steps.at(-1).scale, 'squeezed to the game row from the first glyph on (' + JSON.stringify(s) + ')'); }
      assert.ok(steps[0].scale && parseFloat(steps[0].scale) < .7, 'the reader row is fitted to the game row (' + JSON.stringify(steps[0]) + ')');
      await p.page.close();
    });

    await t.test('target after a centred two-row line: the one-row line is not wrapped at that page\'s width', async () => {
      const p = await open(), page = '流行を創り出していた高層建造物はその役目';
      const two = await p.place(page, [...centred(14, 560), ...centred([...page].length - 14, 600)]);
      assert.strictEqual(two.rows, 2); near(two.mid, 640, 'a centred two-row page', two);
      for (const s of await typed(p, LONG, centred(N, 656), [3, 12, N])) { assert.strictEqual(s.rows, 1, 'one row (' + JSON.stringify(s) + ')'); near(s.mid, 640, 'centred', s); }
      await p.page.close();
    });

    await t.test('reader characters the game does not draw: a tail and a repeated copy stay centred on the game\'s row', async () => {
      let p = await open();
      const g = 'ただ、一度でいいから普通になりたかった', tail = g + '」」', all = centred([...g].length, 656);
      await p.place(SHORT, centred(11, 656));
      for (const s of await typed(p, g, all, [3, 12, all.length], tail)) { assert.strictEqual(s.rows, 1, 'one row (' + JSON.stringify(s) + ')'); assert.strictEqual(s.top, 656); near(s.mid, 640, 'Japanese', s); near(s.cnMid, 640, 'translation', s); }
      await p.page.close();
      /* the game's text has the tail but gives it no box: the drawn row decides, as before (centred, not pushed up) */
      p = await open();
      await p.place(SHORT, centred(11, 656));
      const end = await p.place(tail, all);
      assert.strictEqual(end.top, 656, 'not pushed above the box (' + JSON.stringify(end) + ')'); near(end.mid, 640, 'centred', end); near(end.cnMid, 640, 'translation', end);
      await p.page.close();
      p = await open({ winWidth: 900, winLeft: 190 });
      await p.place('発生は、突然だった。', centred(10, 656));
      const twice = await p.place(SHORT, centred(11, 656), SHORT + SHORT);
      assert.strictEqual(twice.rows, 1); assert.strictEqual(twice.top, 656); near(twice.mid, 640, 'repeated copy centred', twice); near(twice.cnMid, 640, 'translation', twice);
      assert.strictEqual(twice.scale, '', 'a repeated copy is not squeezed into the game row (' + JSON.stringify(twice) + ')');
      await p.page.close();
    });

    await t.test('a game glyph that never gets a box does not move the line sideways', async () => {
      /* the game's text ends in 」 but it never gives the 」 a box: one glyph short of the projection, within the centring slack */
      const g = 'ただ、一度でいいから普通になりたかった', q = g + '」';
      for (const o of [{ y: 656, s: 32 }, { y: 690, s: 24, font: 40 }]) {
        let p = await open({ font: o.font });
        await p.place(SHORT, centred(11, o.y, o.s));
        const all = centred([...g].length, o.y, o.s), steps = await typed(p, q, all, [3, 12, all.length]);
        for (const s of steps) { assert.strictEqual(s.rows, 1, 'one row (' + JSON.stringify(s) + ')'); assert.strictEqual(s.first, steps[0].first, 'no sideways move (' + JSON.stringify(s) + ')'); near(s.mid, 640, 'Japanese', s); near(s.cnMid, 640, 'translation', s); }
        await p.page.close();
        p = await open({ font: o.font });
        await p.place(SHORT, centred(11, o.y, o.s));
        const twice = [await p.place(q, all), await p.place(q, all)];
        for (const s of twice) { assert.strictEqual(s.rows, 1); near(s.mid, 640, 'delivered complete, every frame', s); }
        await p.page.close();
      }
    });

    await t.test('the projection counts game glyphs at their pitch: a doubled dash, narrow boxes', async () => {
      /* the reader has 「――」 where the game draws one 「―」 (two reader characters on one game box) */
      const game = 'ただ―一度でいいから普通になりたかったのです', reader = 'ただ――一度でいいから普通になりたかったのです';
      let p, steps;
      for (const after of [SHORT, null]) { /* after a short line, and as the first line (no place to keep) */
        p = await open();
        if (after) await p.place(after, centred(11, 656));
        steps = await typed(p, game, centred([...game].length, 656), [2, 3, 4, 9, 14, [...game].length], reader);
        for (const s of steps) { assert.strictEqual(s.rows, 1, 'one row (' + JSON.stringify(s) + ')'); assert.strictEqual(s.first, steps[0].first, 'no sideways move (' + JSON.stringify(s) + ')'); near(s.mid, 640, 'centred', s); }
        await p.page.close();
      }
      /* 28 px glyph boxes at a 32 px pitch */
      p = await open();
      const narrow = (n, y) => centred(n, y).map(r => [r[0], r[1], 28, 32]);
      await p.place(SHORT, narrow(11, 656));
      steps = await typed(p, LONG, narrow(N, 656), [2, 3, 8, 16, N]);
      for (const s of steps) { assert.strictEqual(s.rows, 1, 'one row (' + JSON.stringify(s) + ')'); assert.strictEqual(s.first, steps[0].first, 'no sideways move (' + JSON.stringify(s) + ')'); near(s.mid, 638, 'centred on the game row', s); }
      await p.page.close();
    });

    await t.test('a centred two-row line wider than the reader box is centred with its translation', async () => {
      /* CHAOS;CHILD-style narration: 18 + 8 glyph rows in a bigger reader font; the rows are the game's, the box takes the wider one */
      const p = await open({ font: 40 }), text = '流行を創り出していた高層建造物はその役目を諦めたように倒壊';
      const s = await p.place(text, [...centred(18, 300), ...centred([...text].length - 18, 340)]);
      assert.strictEqual(s.rows, 2); onScreen(s, 'it'); near(s.mid, 640, 'Japanese', s); near(s.cnMid, 640, 'translation', s);
      await p.page.close();
    });

    await t.test('left-aligned boxes keep the reader\'s wrapping (as before)', async () => {
      let p = await open({ font: 36, winLeft: 100, winWidth: 900 });
      const line = 'ある日のこと、僕は学校の帰り道で見知らぬ少女に声をかけられたのだった。';
      await p.place('こんにちは、今日もいい天気ですね。', rowAt(17, 160, 600, 24));
      const big = await p.place(line, rowAt([...line].length, 160, 600, 24));
      assert.strictEqual(big.rows, 2, 'a one-row game line in a bigger reader font wraps in the box (' + JSON.stringify(big) + ')'); assert.strictEqual(big.first, 160); onScreen(big, 'the line');
      await p.page.close();
      p = await open({ font: 28, winLeft: 40, winWidth: 1100 });
      const small = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタ';
      onScreen(await p.place(small, rowAt([...small].length, 40, 640, 18)), 'a long row of small game glyphs');
      await p.page.close();
      p = await open({ font: 36, winLeft: 100, winWidth: 900 });
      const wide = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろ';
      const rows = await p.place(wide, [...rowAt(30, 100, 560, 30), ...rowAt([...wide].length - 30, 100, 600, 30)]);
      assert.strictEqual(rows.rows, 2); assert.strictEqual(rows.first, 100); assert.strictEqual(rows.win, 900, 'a left-aligned box keeps the reader box width (' + JSON.stringify(rows) + ')');
      await p.page.close();
    });

    await t.test('the first row of a line the game wraps is not forced onto one row', async () => {
      let p = await open({ font: 28, winLeft: 100, winWidth: 900 });
      const line = 'ある日のこと、僕は学校の帰り道で見知らぬ少女に声をかけられたのだった。それは春のことだった。', n = [...line].length;
      await p.place('こんにちは、今日もいい天気ですね。', rowAt(17, 160, 560, 30));
      for (const s of await typed(p, line, [...rowAt(30, 160, 560, 30), ...rowAt(n - 30, 160, 600, 30)], [5, 20, 30])) { assert.ok(s.rows >= 2, 'left-aligned dialogue wraps in the box (' + JSON.stringify(s) + ')'); onScreen(s, 'it'); }
      await p.page.close();
      p = await open({ font: 30, winLeft: 100, winWidth: 1000 });
      const narration = '流行を創り出していた高層建造物はその役目を諦めたように倒壊し黒い火災は仲間を求めて勢いを広げ', m = [...narration].length;
      await p.place('発生は、突然だった。', centred(10, 260, 30));
      /* in the reader box, not at the width of the one-row line before it (five rows of its ten glyphs) */
      for (const s of await typed(p, narration, [...centred(20, 300, 30), ...centred(m - 20, 340, 30)], [4, 12, 20])) { assert.strictEqual(s.rows, 2,'centred narration wraps in the box (' + JSON.stringify(s) + ')'); onScreen(s, 'it'); near(s.mid, 640, 'centred', s); }
      await p.page.close();
    });

    await t.test('a row wider than the game client keeps the reader\'s wrapping', async () => {
      const p = await open({ font: 60, winLeft: 40, winWidth: 1200 });
      await p.place(SHORT, centred(11, 656));
      const all = centred(N, 656), steps = await typed(p, LONG, all, [3, 8]);
      for (const s of steps) { assert.ok(s.rows >= 2, 'wrapped (' + JSON.stringify(s) + ')'); onScreen(s, 'it'); assert.strictEqual(s.scale, '', 'not squeezed into the drawn part while it types'); }
      for (const s of [await p.place(LONG, all), await p.place(LONG, all)]) { assert.ok(s.rows >= 2, 'wrapped when complete, every frame (' + JSON.stringify(s) + ')'); onScreen(s, 'it'); }
      await p.page.close();
    });

    await t.test('the first paint of the next line does not keep the one-row box width', async () => {
      const p = await open({ growsDown: true });
      await p.place(SHORT, centred(11, 656));
      assert.strictEqual((await p.place(LONG, centred(N, 656))).win, 644 + 40);
      const next = await p.page.evaluate(([h]) => { const s = document.querySelector('.sentence-text'); s.innerHTML = h; window.__tomoyoChinese.textPlaceFirstPaint(s.closest('.sentence-window'), s); return Math.round(s.closest('.sentence-window').getBoundingClientRect().width); }, [tokens(SHORT)]);
      assert.strictEqual(next, 560, 'a short next line is pinned in the reader box at once');
      await p.page.close();
    });

    await t.test('one-line Japanese keeps its own fit in the reader box', async () => {
      const p = await open({ oneLine: true });
      await p.place(SHORT, centred(11, 656));
      for (const s of await typed(p, LONG, centred(N, 656), [3, N])) assert.strictEqual(s.win, 560, 'the box the one-line fit measures stays the reader\'s (' + JSON.stringify(s) + ')');
      await p.page.close();
    });
  } finally { await browser.close(); }
});
