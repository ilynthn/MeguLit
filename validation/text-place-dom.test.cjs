// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* web/reader/modules/text-place.js in a real browser (headless Edge through playwright-core; skipped when it is not
   installed: MEGULIT_PLAYWRIGHT=<path to playwright-core>). A reader line with ruby and a translation row is placed on
   recorded character boxes: tokens land on their boxes, ruby bases on the union of theirs, the translation under the
   last row with no plate, translation-only in the Japanese's place, a surface offset (galLayoutInfo) is added, characters
   not drawn yet stay hidden, and the fallback keeps the reader's own place without a plate. */
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch { console.log('SKIP text-place DOM (no playwright-core)'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'text-place.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.sentence-window{position:fixed;left:100px;bottom:20px;width:800px;height:150px;background:rgba(0,0,0,.6);border:2px solid #fff}
.tomoyo-cn-row{display:block;background:rgba(0,0,0,.5)}</style></head><body>
<main><div class="sentence-window tomoyo-hook-reader"><div class="sentence-text"><span class="megulit-ruby-base" data-tomoyo-reading="きょう"><span class="char-token">今</span><span class="char-token">日</span></span><span class="char-token">は</span><span class="char-token">晴</span><span class="char-token">れ</span></div><div class="tomoyo-cn-row">今天是晴天</div></div></main>
<script>window.__tomoyoChinese={};</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const box = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); }, sel);
    const nth = n => `.sentence-text .char-token:nth-of-type(${n})`;
    await page.evaluate(() => window.__tomoyoChinese.textPlaceAnchor(false));
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceMode({ on: true });
      b.textPlace({ text: '「今日は晴れ', client: [1280, 720], rects: [[60, 500, 30, 32], [100, 500, 30, 32], [130, 500, 30, 32], [160, 500, 30, 32], [100, 540, 30, 32], [130, 540, 30, 32]] }); });
    await frame();
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('megulit-placed')), true);
    assert.deepStrictEqual(await box('.megulit-ruby-base'), [100, 500, 60, 32], 'ruby base = union of its tokens');
    assert.deepStrictEqual(await box('.megulit-ruby-base .char-token:nth-of-type(2)'), [130, 500, 30, 32]);
    assert.deepStrictEqual(await box('.sentence-text > .char-token:nth-of-type(3)'), [100, 540, 30, 32], 'second row (reader text found after the leading 「)');
    const row = await box('.tomoyo-cn-row');
    assert.strictEqual(row[0], 100); assert.ok(row[1] >= 572, 'translation under the last row');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.tomoyo-cn-row')).backgroundColor), 'rgba(0, 0, 0, 0)', 'no plate');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.sentence-window')).backgroundColor), 'rgba(0, 0, 0, 0)', 'no window plate');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.megulit-ruby-base .char-token')).fontSize), '30px', 'size from the boxes');
    assert.deepStrictEqual(await page.evaluate(() => [getComputedStyle(document.querySelector('.char-token')).pointerEvents, getComputedStyle(document.querySelector('.sentence-window')).pointerEvents]), ['auto', 'none'], 'words take the click, the rest of the full-screen window does not');
    /* translation only: the Chinese in the Japanese's place */
    await page.evaluate(() => document.body.classList.add('tomoyo-gal-zh-only')); await page.evaluate(() => window.__tomoyoChinese.textPlace({ text: '「今日は晴れ', client: [1280, 720], rects: [[60, 500, 30, 32], [100, 500, 30, 32], [130, 500, 30, 32], [160, 500, 30, 32], [100, 540, 30, 32], [131, 540, 30, 32]] })); await frame();
    assert.strictEqual((await box('.tomoyo-cn-row'))[1], 500, 'translation-only: top of the line');
    await page.evaluate(() => document.body.classList.remove('tomoyo-gal-zh-only'));
    /* surface offset + scale (reader window bigger than the game; physical px) and characters not drawn yet */
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 40, clientY: 20, clientWidth: 640, clientHeight: 360 });
      b.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [[100, 500, 30, 32], [130, 500, 30, 32], [160, 500, 30, 32], null, null] }); });
    await frame();
    assert.deepStrictEqual(await box('.megulit-ruby-base'), [90, 270, 30, 16], 'offset + scale');
    assert.strictEqual(await page.evaluate(n => getComputedStyle(document.querySelector(n)).display, nth(4)), 'none', 'not drawn yet = hidden');
    /* fallback: own place, no plate */
    await page.evaluate(() => { delete window.__tomoyoChinese.galLayoutInfo; window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ' }); }); await frame();
    assert.deepStrictEqual(await page.evaluate(() => [document.body.classList.contains('megulit-placed'), document.body.classList.contains('megulit-place-fallback')]), [false, true]);
    assert.deepStrictEqual(await box('.sentence-window'), [100, 546, 804, 154], 'reader keeps its own box');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.sentence-window')).backgroundColor), 'rgba(0, 0, 0, 0)', 'fallback: no plate');
    /* positions that are not real: never at the surface's (monitor's) top-left, never outside the game client
       (みにくいモジカの子: a centred line came with every rect 0 and the translation flew to the monitor's corner) */
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.galLayoutInfo = () => ({ clientX: 200, clientY: 100, clientWidth: 800, clientHeight: 500 });
      b.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] }); }); await frame();
    assert.deepStrictEqual(await page.evaluate(() => [document.body.classList.contains('megulit-placed'), document.body.classList.contains('megulit-place-fallback')]), [false, true], 'zero rects: fallback, not placed');
    assert.deepStrictEqual(await box('.sentence-window'), [100, 546, 804, 154], 'zero rects: reader keeps its own box');
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [null, [NaN, 5, 30, 32], [-900, 10, 30, 32], [5000, 10, 30, 32], [0, 0, 0, 0]] })); await frame();
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('megulit-placed')), false, 'no real box: not placed');
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [[-20, 700, 40, 40], [20, 700, 40, 40], [60, 700, 40, 40], [1260, 700, 40, 40], [3000, 700, 40, 40]] })); await frame();
    const inside = await page.evaluate(() => [...document.querySelectorAll('.sentence-text .char-token:not(.megulit-unplaced)')].map(n => { const r = n.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); }));
    assert.ok(inside.length >= 3, 'placed tokens');
    for (const [l, t, r, bt] of inside) assert.ok(l >= 200 && t >= 100 && r <= 1000 && bt <= 600, 'inside the game client: ' + [l, t, r, bt]);
    /* the translation of a line on the client's last pixels: in the client horizontally, under the Japanese (2026-11-16: never above it) */
    { const [l, t, r] = await page.evaluate(() => { const q = document.querySelector('.tomoyo-cn-row').getBoundingClientRect(); return [q.left, q.top, q.right].map(Math.round); });
      assert.ok(l >= 200 && r <= 1000 && t >= Math.max(...inside.map(v => v[3])), 'translation row under the line: ' + [l, t, r]); }
    assert.strictEqual(await page.evaluate(() => getComputedStyle([...document.querySelectorAll('.sentence-text .char-token')].pop()).display), 'none', 'a box outside the client is not drawn');
    await page.evaluate(() => { delete window.__tomoyoChinese.galLayoutInfo; window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ' }); }); await frame();
    /* 2026-11-16 (死に逝く君、館に芽吹く憎悪): a line near the bottom of the game with a two-row translation. The row is
       never put above the Japanese: it is made smaller to fit under it, and runs past the bottom when it cannot */
    for (const y of [640, 676]) {
      await page.evaluate(y => { const b = window.__tomoyoChinese, row = document.querySelector('.tomoyo-cn-row'); row.textContent = '衣服破破烂烂，皮肤上满是擦伤，连续走了好几个小时的双腿已经开始失去知觉。'.repeat(2);
        b.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [0, 1, 2, 3, 4].map(i => [100 + i * 32, y, 32, 32]) }); }, y); await frame();
      const [, top, , h] = await box('.tomoyo-cn-row');
      assert.ok(top >= y + 32, 'translation under the Japanese, never above it (y=' + y + ', top=' + top + ')');
      if (y === 640) assert.ok(top + h <= 721, 'made smaller to fit inside the game (bottom ' + (top + h) + ')');
    }
    await page.evaluate(() => { document.querySelector('.tomoyo-cn-row').textContent = '今天是晴天'; window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ' }); }); await frame();
    /* 2026-11-16 the reader's text differs a little from the placed line (doubled dash, repeated copy): still placed on
       the game's boxes, never at the reader's own place */
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ text: '今日―晴れ', client: [1280, 720], rects: [[100, 500, 30, 32], [130, 500, 30, 32], [160, 500, 30, 32], [190, 500, 30, 32], [220, 500, 30, 32]] })); await frame();
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('megulit-placed')), true, 'は vs ― : most characters found, placed');
    assert.deepStrictEqual(await box(nth(4)), [220, 500, 30, 32], 'later characters keep their own boxes (れ)');
    assert.deepStrictEqual(await page.evaluate(() => window.__tomoyoChinese.textPlaceAlign([...'そして――殺人――。'], [...'そして―殺人―。'])), [0, 1, 2, 3, 3.5, 4, 5, 6, 6.5, 7], 'two reader dashes share the game dash');
    assert.deepStrictEqual(await page.evaluate(() => window.__tomoyoChinese.textPlaceAlign([...'晴れ。晴れ。'], [...'晴れ。'])), [0, 1, 2, null, null, null], 'a repeated copy is not drawn twice');
    assert.strictEqual(await page.evaluate(() => window.__tomoyoChinese.textPlaceAlign([...'あいう'], [...'かきく'])), null, 'another line');
    /* 2026-11-16 (user: 「今日も明　　後日も」): repeated stretches and long runs of the game's own extra glyphs (ruby) keep every character */
    assert.deepStrictEqual(await page.evaluate(() => window.__tomoyoChinese.textPlaceAlign([...'今日も明日も明後日も'], [...'今日も明日も明後日も'])), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'repeated 日も明');
    assert.deepStrictEqual(await page.evaluate(() => window.__tomoyoChinese.textPlaceAlign([...'今日も明日も明後日も'], [...'きょう今日もあした明日もあさって明後日も'])), [3, 4, 5, 9, 10, 11, 16, 17, 18, 19], 'ruby runs between the characters');
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ' })); await frame();
    /* 2026-11-16 (user recording, 死に逝く君、館に芽吹く憎悪): the translation keeps one size for the box (no small-then-large),
       stays inside the text box (never over the game's UI bar under it) and is not shown while the line is still typing */
    { const rowFs = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tomoyo-cn-row')).fontSize));
      const put = (rows, zh) => page.evaluate(([rows, zh]) => { document.querySelector('.tomoyo-cn-row').textContent = zh; const rects = [];
        for (let r = 0; r < rows; r++) for (let i = 0; i < 5; i++) rects.push([100 + i * 32, 400 + r * 40, 32, 32]);
        window.__tomoyoChinese.textPlace({ text: '今日は晴れ明日は雨だね夜は雪'.slice(0, rows * 5), client: [1280, 720], rects }); }, [rows, zh]);
      await page.evaluate(() => { const s = document.querySelector('.sentence-text'); s.dataset.keep = s.innerHTML; s.innerHTML = [...'今日は晴れ明日は雨だね夜は雪'].map(c => '<span class="char-token">' + c + '</span>').join(''); });
      await page.evaluate(() => { window.__tomoyoChinese.textPlaceMode({ on: false }); window.__tomoyoChinese.textPlaceMode({ on: true }); });
      await put(3, '短'); await frame(); const big = await rowFs();
      await put(1, '今天是晴天'); await frame(); const one = await rowFs();
      assert.ok(one <= 24 && one >= 14, 'size from the Japanese glyphs, not the stylesheet (' + one + ')');
      await put(3, '衣服破破烂烂，皮肤上满是擦伤，连续走了好几个小时的双腿已经开始失去知觉。'.repeat(3)); await frame();
      const [, t3, , h3] = await box('.tomoyo-cn-row'); assert.ok(await rowFs() <= one, 'a long translation is only ever made smaller');
      assert.ok(t3 >= 512 && t3 + h3 <= 720 - 32 * 1.3 + 2, 'below the last glyph and above the game controls (bottom ' + (t3 + h3) + ')');
      assert.strictEqual(await rowFs(), one, 'the complete translation fits at the configured size');
      assert.ok(await page.locator('.tomoyo-cn-row').evaluate(n => n.scrollHeight <= n.clientHeight + 1), 'available space shows every row');
      await put(1, '今天是晴天'); await frame(); assert.strictEqual(await rowFs(), one, 'the next short line has the same size again');
      assert.ok(big >= one, 'size never grows past the box size');
      await page.evaluate(() => { document.querySelector('.tomoyo-cn-row').textContent = '在百货商店购物，在餐厅用餐，在公园悠闲地度过……'.repeat(2); window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [0, 1, 2, 3, 4].map(i => [100 + i * 32, 600, 32, 32]) }); }); await frame();
      { const [, t, , h] = await box('.tomoyo-cn-row'); assert.ok(t + h <= 720 - 32 * 1.3 + 2, 'never over the bar at the client bottom (' + (t + h) + ')'); }
      await page.evaluate(() => { const st = document.createElement('style'); st.id = 'hostile-cn'; st.textContent = 'html body .sentence-window .tomoyo-cn-row .tomoyo-cn-output.tomoyo-cn-output{font-size:32px!important;line-height:1.6!important}'; document.head.append(st); const row = document.querySelector('.tomoyo-cn-row'); row.innerHTML = '<span class="tomoyo-cn-output">' + '在百货商店购物，在餐厅用餐，在公园悠闲地度过……'.repeat(2) + '</span>'; window.__tomoyoChinese.textPlace({ text: '今日は晴', client: [1280, 720], rects: [0, 1, 2, 3].map(i => [100 + i * 32, 600, 32, 32]) }); }); await frame();
      { const [, t, , h] = await box('.tomoyo-cn-row .tomoyo-cn-output'); assert.ok(t + h <= 720 - 32 * 1.3 + 2, 'the translation text itself (a styled child) stays above the bar (' + (t + h) + ')'); }
      await page.evaluate(() => { document.getElementById('hostile-cn').remove(); document.querySelector('.tomoyo-cn-row').textContent = '今天是晴天'; });
      await page.evaluate(() => window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [[100, 400, 32, 32], [132, 400, 32, 32], null, null, null] })); await frame();
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.tomoyo-cn-row')).visibility), 'hidden', 'typing: translation waits for the whole line');
      await page.evaluate(() => { const s = document.querySelector('.sentence-text'); s.innerHTML = s.dataset.keep; document.querySelector('.tomoyo-cn-row').textContent = '今天是晴天'; window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ' }); }); await frame(); }
    /* 2026-11-16 (user: 「──」 drawn as two lines of different widths): a game style outranking the dash rule still leaves
       one thin line, never the glyph under it */
    await page.evaluate(() => { const st = document.createElement('style'); st.id = 'hostile'; st.textContent = 'html body .sentence-window .sentence-text .char-token.char-token.char-token{-webkit-text-fill-color:rgb(247,247,123)!important;-webkit-text-stroke:3px #000!important;text-shadow:0 0 2px #000!important}'; document.head.append(st);
      const s = document.querySelector('.sentence-text'); s.dataset.keep2 = s.innerHTML; s.innerHTML = [...'――殺人'].map(c => '<span class="char-token">' + c + '</span>').join('');
      window.__tomoyoChinese.textPlace({ text: '――殺人', client: [1280, 720], rects: [0, 1, 2, 3].map(i => [100 + i * 32, 400, 32, 32]) }); }); await frame();
    assert.deepStrictEqual(await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.sentence-text .char-token')); return [c.webkitTextFillColor, c.webkitTextStrokeWidth, c.textShadow]; }), ['rgba(0, 0, 0, 0)', '0px', 'none'], 'dash glyph hidden under its line');
    await page.evaluate(() => { document.getElementById('hostile').remove(); const s = document.querySelector('.sentence-text'); s.innerHTML = s.dataset.keep2; window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ' }); }); await frame();
    /* 2026-11-16 (user: 字号/换行宽度听设置；位置跟着原文但别抖): anchored layout */
    await page.evaluate(() => { const b = window.__tomoyoChinese; b.textPlaceAnchor(true); document.querySelector('.tomoyo-cn-row').textContent = '今天是晴天'; });
    const firstTok = () => page.evaluate(() => { const r = document.querySelector('.sentence-text .char-token').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), getComputedStyle(document.querySelector('.sentence-text .char-token')).fontSize]; });
    const at = (dx, dy, n = 5) => page.evaluate(([dx, dy, n]) => window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [0, 1, 2, 3, 4].map(i => i < n ? [300 + dx + i * 40, 400 + dy, 40, 40] : null) }), [dx, dy, n]);
    await at(0, 0); await frame(); const a0 = await firstTok();
    assert.deepStrictEqual(a0.slice(0, 2), [300, 400], 'first character on the game line\'s top-left');
    assert.notStrictEqual(a0[2], '40px', 'the size is the reader\'s own setting, not the game boxes\'');
    await at(0, 0, 2); await frame(); assert.deepStrictEqual((await firstTok()).slice(0, 2), [300, 400], 'typing does not move it');
    await page.evaluate(() => window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ' })); await frame();
    await at(4, -3); await frame(); assert.deepStrictEqual((await firstTok()).slice(0, 2), [300, 400], 'a few px off: kept (no jitter)');
    await at(0, -200); await frame(); assert.deepStrictEqual((await firstTok()).slice(0, 2), [300, 200], 'another text box: follows');
    await page.evaluate(() => { document.querySelector('.tomoyo-cn-row').textContent = '在百货商店购物，在餐厅用餐，在公园悠闲地度过……'.repeat(3); }); await at(0, 220); await frame();
    { const b = await page.evaluate(() => document.querySelector('.tomoyo-cn-row').getBoundingClientRect().bottom); assert.ok(b <= 720 - 8 + 1, 'anchored: the translation stays on the screen (' + Math.round(b) + ')'); /* 2026-11-19 user: the screen, not the game bar, is the limit */ const fsz = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tomoyo-cn-row')).fontSize)); assert.ok(fsz >= 24 * .6 - 1, 'never under 60 % (' + fsz + ')'); }
    /* QQ essence 1137 (integration live test, 死に逝く君): the anchored line takes the user's 译文换行宽度 when it differs from the default (75) */
    { const rowMax = () => page.evaluate(() => parseFloat(document.querySelector('.tomoyo-cn-row').style.maxWidth) || 0);
      await page.evaluate(() => { document.querySelector('.tomoyo-cn-row').textContent = '今天是晴天'; }); await at(0, 220); await frame();
      const auto = await rowMax();
      await page.evaluate(() => { window.__tomoyoChinese.galPreferences = () => ({ translationWidth: 60 }); }); await at(0, 220); await frame();
      assert.strictEqual(Math.round(await rowMax()), 768, 'anchored: 60 % of a 1280 px client (' + auto + ' before)');
      await page.evaluate(() => { window.__tomoyoChinese.galPreferences = () => ({ translationWidth: 75 }); }); await at(0, 220); await frame();
      assert.strictEqual(await rowMax(), auto, 'the default width keeps the Japanese width');
      await page.evaluate(() => { delete window.__tomoyoChinese.galPreferences; }); }
    /* 2026-11-20 (user, CHAOS;CHILD: 「对应一下每一行的日文」): two game rows give the translation two rows, broken after its comma */
    { await page.evaluate(() => { const r = document.querySelector('.tomoyo-cn-row'); r.innerHTML = '<div class="tomoyo-cn-output" data-state="ready">' + [...'今天是，晴天啊'].map(c => '<span class="tome-translation-char">' + c + '</span>').join('') + '</div>'; window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [[300, 400, 40, 40], [340, 400, 40, 40], [380, 400, 40, 40], [300, 450, 40, 40], [340, 450, 40, 40]] }); }); await frame(); await frame();
      const rows = await page.evaluate(() => { const o = document.querySelector('.tomoyo-cn-output'); return o.innerHTML.split('<br class="megulit-cn-br">').map(p => p.replace(/<[^>]+>/g, '')); });
      assert.deepStrictEqual(rows, ['今天是，', '晴天啊'], 'translation rows follow the Japanese rows');
      /* one-line Japanese (QQ essence 1145, Codex #1177): no game row breaks while the option is on, back when it is off */
      const rowBrs = () => page.evaluate(() => document.querySelectorAll('.sentence-text br.megulit-row-br').length);
      const replace = () => page.evaluate(() => window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [[300, 400, 40, 40], [340, 400, 40, 40], [380, 400, 40, 40], [300, 450, 40, 40], [340, 450, 40, 40]] }));
      assert.strictEqual(await rowBrs(), 1, 'two game rows: one row break');
      await page.evaluate(() => document.body.classList.add('megulit-jp-one-line')); await replace(); await frame(); await frame();
      assert.strictEqual(await rowBrs(), 0, 'one-line Japanese: no row break');
      await page.evaluate(() => document.body.classList.remove('megulit-jp-one-line')); await replace(); await frame(); await frame();
      assert.strictEqual(await rowBrs(), 1, 'option off: the game row break is back');
      /* #1122: closing quote and single trailing character must never be split onto a new row */
      await page.evaluate(() => { const r = document.querySelector('.tomoyo-cn-row'); r.innerHTML = '<div class="tomoyo-cn-output" data-state="ready">' + [...'“今天是晴天。”'].map(c => '<span class="tome-translation-char">' + c + '</span>').join('') + '</div>'; window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [[300, 400, 40, 40], [340, 400, 40, 40], [380, 400, 40, 40], [300, 450, 40, 40], [340, 450, 40, 40]] }); }); await frame(); await frame();
      const quoteRows = await page.evaluate(() => { const o = document.querySelector('.tomoyo-cn-output'); return o.innerHTML.split('<br class="megulit-cn-br">').map(p => p.replace(/<[^>]+>/g, '')); });
      assert.deepStrictEqual(quoteRows, ['“今天是晴天。”'], 'closing quote stays attached to sentence end');
      await page.evaluate(() => { const r = document.querySelector('.tomoyo-cn-row'); r.innerHTML = '<div class="tomoyo-cn-output" data-state="ready">' + [...'今天是晴天，嗯。'].map(c => '<span class="tome-translation-char">' + c + '</span>').join('') + '</div>'; window.__tomoyoChinese.textPlace({ text: '今日は晴れ', client: [1280, 720], rects: [[300, 400, 40, 40], [340, 400, 40, 40], [380, 400, 40, 40], [420, 400, 40, 40], [300, 450, 40, 40]] }); }); await frame(); await frame();
      const orphanRows = await page.evaluate(() => { const o = document.querySelector('.tomoyo-cn-output'); return o.innerHTML.split('<br class="megulit-cn-br">').map(p => p.replace(/<[^>]+>/g, '')); });
      assert.deepStrictEqual(orphanRows, ['今天是晴天，嗯。'], 'single trailing character is not orphaned on a new row'); }
    await page.evaluate(() => { document.querySelector('.tomoyo-cn-row').textContent = '今天是晴天'; });
    await page.evaluate(() => { window.__tomoyoChinese.textPlaceAnchor(false); window.__tomoyoChinese.textPlace({ fallback: true, text: '今日は晴れ' }); }); await frame();
    /* name plate and a choice drawn on their boxes, click-through */
    await page.evaluate(() => window.__tomoyoChinese.textPlaceExtra({ client: [1280, 720], items: [{ id: 1, kind: 'n', text: '朋也', rects: [[80, 450, 28, 30], [108, 450, 28, 30]] }, { id: 2, kind: 'o', text: 'はい', rects: [[600, 200, 32, 34], [632, 200, 32, 34]] }] })); await frame();
    assert.deepStrictEqual(await box('.megulit-place-name span:nth-child(2)'), [108, 450, 28, 30], 'name plate on its boxes');
    assert.deepStrictEqual(await box('.megulit-place-choice span'), [600, 200, 32, 34], 'choice on its boxes');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('megulit-place-extras')).pointerEvents), 'none', 'click-through');
    /* off: everything back */
    await page.evaluate(() => window.__tomoyoChinese.textPlaceMode({ on: false })); await frame();
    assert.deepStrictEqual(await page.evaluate(() => [document.body.className, !!document.getElementById('megulit-place-extras')]), ['', false]);
    console.log('PASS text-place DOM');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
