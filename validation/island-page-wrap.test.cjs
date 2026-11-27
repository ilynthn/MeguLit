// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 ISLAND（アイランド）, owner on a test build: 「现在为啥老超出去会话框啊 原文我记得是两行啊」. The game drew
   「だからさっきから言ってるだろ。このＣＤは砂浜で拾ったんだ、盗んだんじゃない」 on two rows inside its text box; the reader
   (island-page.js, engine cs2) set it on one row that ran past the box onto the SKIP / AUTO / NEXT buttons, and the
   translation ran as wide. Since v1.2.4 a line drawn on more rows than its text has breaks wrapped at its drawn width on
   every paged engine except cs2. Replayed on island-page.js in headless Edge: the line and its translation stay inside the
   text area the game drew; a one-row line stays one row; no line runs past the game's client on the right. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), test = require('node:test');
let chromium;
try { ({ chromium } = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}
const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'reader', 'modules', 'island-page.js'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:"Yu Gothic","MS Gothic",sans-serif}</style></head>
<body class="tomoyo-ui-translation tomoyo-gal-bound"><main><div class="sentence-window"><div class="sentence-text"></div></div></main>
<script>window.__sent=[];window.__tomoyoTranslateRequest=s=>window.__sent.push(JSON.parse(s));
window.TomoyoGameStyle={paintFor:()=>({}),paintVariables:()=>({}),linePaint:()=>null};
window.__tomoyoChinese={serial:0,isGalBound:()=>true,galLayoutInfo:()=>({clientX:0,clientY:0,clientWidth:1280,clientHeight:720}),galPreferences:()=>({width:78,translationWidth:75})};</script></body></html>`;
const LONG = '「だからさっきから言ってるだろ。このＣＤは砂浜で拾ったんだ、盗んだんじゃない」';
const SHORT = '「……だれ？」';
/* the game's text box: glyph origins from x 230, rows 36 px apart, 27 px glyphs; the long line wraps after 26 characters */
const BOX = { x0: 230, size: 27, sw: 1280, sh: 720 };

async function show(page, text, sequence, pos) {
  return page.evaluate(([text, sequence, pos]) => {
    const b = window.__tomoyoChinese, token = new window.TomeIslandPage.Page().source(text, 1, 0).token;
    b.islandPage.accept({ hookSourceEngine: 'cs2', hookSource: text, hookSequence: sequence });
    b.islandPage.position({ engine: 'cs2_screen_v1', token, line: sequence, ...pos });
  }, [text, sequence, pos]);
}
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function measure(page, text) {
  return page.evaluate(text => {
    const node = [...document.querySelectorAll('.tome-island-pair')].find(n => n.querySelector('.sentence-text').textContent === text);
    const box = node.getBoundingClientRect(), chars = [...node.querySelectorAll('.sentence-text .char-token')].map(c => c.getBoundingClientRect());
    const cn = node.querySelector('.tomoyo-cn-output').getBoundingClientRect();
    return { left: box.left, right: box.right, rows: new Set(chars.map(c => Math.round(c.top))).size, charRight: Math.max(...chars.map(c => c.right)), cnRight: cn.width ? cn.right : 0, cnRows: cn.height };
  }, text);
}
async function translate(page, text, translation) {
  await page.waitForFunction(text => window.__sent.some(m => m.text === text), text, { timeout: 5000 });
  await page.evaluate(([text, translation]) => { const m = window.__sent.find(m => m.text === text); window.__tomoyoChinese.deliverPageTranslation(m.id, translation, false, ''); }, [text, translation]);
  await page.waitForTimeout(300); await frames(page);
}

test('ISLAND: a line the game drew on two rows wraps inside the text box, translation included', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    /* two rows: origins 230..905 (26 glyphs a row), y 560 and 596 */
    await show(page, LONG, 1, { ...BOX, x1: 230 + 25 * 27, y0: 560, y1: 596 }); await frames(page);
    const textRight = 230 + 26 * 27 + 27 * 0.6 + 1;
    let m = await measure(page, LONG);
    assert.ok(m.rows >= 2, 'the long line is set on the game\'s two rows, not one: ' + JSON.stringify(m));
    assert.ok(m.charRight <= textRight, 'no character past the text box (right ' + textRight + '): ' + JSON.stringify(m));
    await translate(page, LONG, '我从刚才就一直在说吧。这张CD是我在沙滩上捡到的，不是偷来的，你到底要我说几遍才肯相信啊');
    m = await measure(page, LONG);
    assert.ok(m.cnRight > 0 && m.cnRight <= textRight, 'the translation wraps inside the same text box: ' + JSON.stringify(m));
  } finally { await browser.close(); }
});

test('ISLAND: a one-row line stays one row and keeps its translation width; nothing runs past the client on the right', { skip: !chromium }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html); await page.addScriptTag({ content: code });
    await show(page, SHORT, 1, { ...BOX, x1: 230 + 6 * 27, y0: 560, y1: 560 }); await frames(page);
    let m = await measure(page, SHORT);
    assert.equal(m.rows, 1, 'a short line the game drew on one row stays one row');
    await translate(page, SHORT, '……是谁？');
    m = await measure(page, SHORT);
    assert.ok(m.cnRight > 0 && m.cnRows < 60, 'its translation stays on one row: ' + JSON.stringify(m));
    /* a line drawn near the right edge (a name plate or a narrow box) */
    await show(page, LONG, 2, { ...BOX, x0: 900, x1: 900 + 12 * 27, y0: 600, y1: 636 }); await frames(page);
    m = await measure(page, LONG);
    assert.ok(m.charRight <= 1280 && m.right <= 1281, 'nothing past the game client: ' + JSON.stringify(m));
  } finally { await browser.close(); }
});
