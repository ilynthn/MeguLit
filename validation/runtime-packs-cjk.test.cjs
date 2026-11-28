// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 1.4.26: Settings → 运行组件 drew broken Chinese. 「注音分词词典」 read as 「汪音…」, 语 and 通 lost their tops, and the
   last row was the bare id "disc-mount" with no note. Two causes:
   - the name and state cells used line-height:1 with overflow:hidden (kept for the ellipsis), which cut off the
     top of CJK glyphs whose font is taller than 1em;
   - the interface stack tried Noto Serif JP and Yu Mincho before any Chinese font. On a PC without Noto Serif SC,
     one word mixed a Japanese Mincho with STSong/SimSun, because Japanese fonts have no simplified forms
     (组, 词, 语).
   The real app runs against a real service in headless Edge, and the fonts are pinned with @font-face aliases so
   the result does not depend on which fonts this machine happens to have:
   - "Noto Serif SC" / "Source Han Serif SC" are shadowed by a face that covers no CJK character (as if not installed);
   - "Noto Serif JP" is the bundled web/fonts/NotoSerifJP.woff2 (as if installed);
   - for the clipping check, "Noto Serif SC" is Microsoft YaHei, a Chinese face taller than 1em that every Windows has. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hasEdge = [process.env.MEGULIT_EDGE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(file => file && fs.existsSync(file));

/* 8-bit RGB/RGBA PNG (what Page.captureScreenshot returns) to its pixel bytes */
function pixels(base64) {
 const png = Buffer.from(base64, 'base64'); let pos = 8, width = 0, height = 0, channels = 4; const idat = [];
 while (pos < png.length) {
  const length = png.readUInt32BE(pos), type = png.toString('latin1', pos + 4, pos + 8), data = png.subarray(pos + 8, pos + 8 + length);
  if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = data[9] === 2 ? 3 : 4; }
  if (type === 'IDAT') idat.push(data);
  pos += 12 + length;
 }
 const raw = require('node:zlib').inflateSync(Buffer.concat(idat)), stride = width * channels, out = Buffer.alloc(stride * height);
 for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
  for (let x = 0; x < stride; x++) {
   const a = x >= channels ? out[row + x - channels] : 0, b = y ? out[row - stride + x] : 0, c = y && x >= channels ? out[row - stride + x - channels] : 0;
   const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
   out[row + x] = (line[x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
  }
 }
 return out;
}
/* how many pixels differ by more than the background's grain (a few levels) */
const inkDiff = (a, b) => { const p = pixels(a), q = pixels(b); let n = 0; for (let i = 0; i < p.length; i++) if (Math.abs(p[i] - q[i]) > 40) n++; return n; };

test('Settings → 运行组件 in the Chinese interface', {skip:!hasEdge && 'Edge not installed', timeout:240000}, async t => {
 const {startService, startWeb, startEdge} = require('./library-views-perf.cjs');
 const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'megulit-rpk-cjk-'));
 const root = path.join(temp, 'root');
 fs.mkdirSync(path.join(root, 'setup'), {recursive:true});
 fs.copyFileSync(path.join(ROOT, 'setup', 'runtime.json'), path.join(root, 'setup', 'runtime.json'));
 const service = startService(root);
 let web, cdp;
 const waitFor = async (expression, what, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (!await cdp.evaluate(expression).catch(() => false)) { if (Date.now() > deadline) assert.fail(what + ' did not appear'); await sleep(200); }
 };
 const fonts = async style => cdp.evaluate(`(async () => {
  document.getElementById('cjk-fixture')?.remove();
  const st = document.createElement('style'); st.id = 'cjk-fixture'; st.textContent = ${JSON.stringify(style)}; document.head.append(st);
  await document.fonts.load('600 14.5px "Noto Serif JP"', '注音'); await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
 })()`);
 const shadow = family => `@font-face{font-family:"${family}";src:local("Arial");unicode-range:U+0}`;
 try {
  web = await startWeb(service);
  cdp = await startEdge(path.join(temp, 'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440, height:900, deviceScaleFactor:1, mobile:false});
  await cdp.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion', value:'reduce'}]});
  await cdp.send('Page.navigate', {url:`http://127.0.0.1:${web.address().port}/#%7B%7D`});
  await waitFor('!!(window.__megulitTest && document.querySelector("#main"))', 'the app');
  await cdp.evaluate(`(async () => {
   document.querySelectorAll('dialog').forEach(d => { try { d.close(); } catch {} d.remove(); });
   const st = document.createElement('style'); st.textContent = '.toast,.toast-stack,[class*=toast],#reader-notice{display:none!important}'; document.head.append(st);
   await window.__megulitTest.navigate('settings');
  })()`);
  assert.equal(await cdp.evaluate('document.documentElement.lang'), 'zh-CN');
  await waitFor('!!document.querySelector(\'[data-section="dictionary"]\')', 'settings navigation');
  await cdp.evaluate('document.querySelector(\'[data-section="dictionary"]\').click()');
  await waitFor('document.querySelectorAll(".rpk-row").length >= 5', 'runtime component rows');
  await cdp.evaluate('document.querySelector(".rpk-list").scrollIntoView({block:"center"})');
  await sleep(500);

  await t.test('every row has a name and a note (disc-mount included), in Chinese, English and Japanese', async () => {
   const rows = await cdp.evaluate('[...document.querySelectorAll(".rpk-row")].map(r => [r.querySelector(".rpk-name").textContent, r.querySelector(".rpk-desc").textContent])');
   const disc = rows.find(([name]) => /光盘镜像/.test(name));
   assert.ok(disc, 'disc-mount row has a Chinese name: ' + JSON.stringify(rows));
   assert.ok(!rows.some(([name, note]) => /^[a-z-]+$/.test(name) || !note.trim()), 'no bare pack id, no empty note: ' + JSON.stringify(rows));
   /* the same panel module, mounted for the other two interface languages with the same pack list */
   const other = await cdp.evaluate(`(async () => {
    const {mountRuntimePacks} = await import('/runtime-packs.js');
    const status = (await fetch('/svc', {method:'POST', body:JSON.stringify({action:'pack_status'})}).then(r => r.json())).data;
    const out = {};
    for (const locale of ['en', 'ja']) {
     const host = document.createElement('div'), anchor = document.createElement('div'); anchor.className = 'settings-page'; host.append(anchor); document.body.append(host);
     const stop = mountRuntimePacks({content:host, locale, esc:s => String(s), toast(){}, api:async () => status});
     for (let i = 0; i < 50 && !host.querySelector('.rpk-row'); i++) await new Promise(r => setTimeout(r, 50));
     out[locale] = [...host.querySelectorAll('.rpk-row')].map(r => [r.querySelector('.rpk-name').textContent, r.querySelector('.rpk-desc').textContent]);
     stop(); host.remove();
    }
    return out;
   })()`);
   for (const locale of ['en', 'ja']) {
    assert.equal(other[locale].length, rows.length, locale + ' rows');
    assert.ok(!other[locale].some(([name, note]) => /^[a-z-]+$/.test(name) || !note.trim()), locale + ': ' + JSON.stringify(other[locale]));
   }
  });

  /* PC without Noto Serif SC, with Noto Serif JP: which fonts draw the Chinese */
  await t.test('Chinese labels use one Chinese font, never a Japanese one or the bundled furigana font', async () => {
  await fonts(shadow('Noto Serif SC') + shadow('Source Han Serif SC') +
   '@font-face{font-family:"Noto Serif JP";src:url("/fonts/NotoSerifJP.woff2") format("woff2");font-weight:200 900}');
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  /* the panel redraws itself every few seconds, so each cell is looked up afresh (and read again if it was replaced meanwhile) */
  const count = await cdp.evaluate('document.querySelectorAll(".rpk-name,.rpk-desc").length');
  const latin = /^(Sitka|Segoe|Arial|Cambria|Times)/i;
  for (let i = 0; i < count; i++) {
   let used, text;
   for (let attempt = 0; ; attempt++) {
    try {
     const doc = await cdp.send('DOM.getDocument', {depth:0});
     const {nodeIds} = await cdp.send('DOM.querySelectorAll', {nodeId:doc.root.nodeId, selector:'.rpk-name,.rpk-desc'});
     used = (await cdp.send('CSS.getPlatformFontsForNode', {nodeId:nodeIds[i]})).fonts;
     text = (await cdp.send('DOM.getOuterHTML', {nodeId:nodeIds[i]})).outerHTML.replace(/<[^>]+>/g, '');
     break;
    } catch (error) { if (attempt > 8) throw error; await sleep(150); }
   }
   if (!/[㐀-鿿]/.test(text)) continue;
   const cjk = used.map(f => f.familyName).filter(name => !latin.test(name));
   assert.ok(!cjk.some(name => /Noto Sans JP/i.test(name)), `${text}: the bundled furigana font is not used by the interface (${cjk})`);
   assert.ok(!cjk.some(name => /JP|Mincho|明朝|Gothic|Meiryo/i.test(name)), `${text}: Chinese drawn with a Japanese font (${cjk})`);
   assert.equal(cjk.length, 1, `${text}: one Chinese font for the whole label, got ${cjk}`);
  }
  });

  /* a Chinese face taller than 1em: nothing is cut off by the cells' overflow:hidden. The same cell is captured
     as drawn and with overflow:visible; the same picture (up to the background's grain) means no ink was clipped. */
  await t.test('no glyph is cut off by its cell', async () => {
  await fonts(shadow('Source Han Serif SC') + '@font-face{font-family:"Noto Serif SC";src:local("Microsoft YaHei"),local("Microsoft YaHei UI")}');
  const cells = await cdp.evaluate(`[...document.querySelectorAll('.rpk-name,.rpk-desc,.rpk-state')].filter(e => /[\u3400-\u9fff]/.test(e.textContent)).map(e => {
   const r = e.getBoundingClientRect(); return {text:e.textContent, x:r.left - 2, y:r.top - 8, width:r.width + 4, height:r.height + 16};
  })`);
  assert.ok(cells.length >= 10, 'Chinese name, note and state cells: ' + cells.length);
  const capture = async () => { const shots = []; for (const c of cells) shots.push((await cdp.send('Page.captureScreenshot', {format:'png', clip:{x:c.x, y:c.y, width:c.width, height:c.height, scale:2}})).data); return shots; };
  const settle = () => cdp.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  for (let round = 0; ; round++) {
   await settle();
   const drawn = await capture();
   await cdp.evaluate(`(() => { const st = document.createElement('style'); st.id = 'cjk-unclip'; st.textContent = '.rpk-name,.rpk-desc,.rpk-state{overflow:visible!important}'; document.head.append(st); })()`);
   await settle();
   const full = await capture();
   await cdp.evaluate("document.getElementById('cjk-unclip').remove()");
   const cut = cells.filter((c, i) => inkDiff(drawn[i], full[i]) > 0).map(c => c.text);
   /* a redraw of the panel between two captures could also differ: a difference counts only when it repeats */
   if (!cut.length || round === 2) { assert.deepEqual(cut, [], 'cut off by their cells (the glyphs reach outside the line box)'); break; }
  }
  });
 } finally {
  await cdp?.stop();
  web?.close();
  await service.stop();
  await sleep(300);
  try { fs.rmSync(temp, {recursive:true, force:true, maxRetries:10, retryDelay:300}); }
  catch (error) { if (!['EBUSY','EPERM','ENOTEMPTY'].includes(error?.code)) throw error; }
 }
});
