'use strict';
/* (user 2026-11-13) the start notice's update list appeared only after a while and opening it stuttered:
   a cached list is drawn in the first frame, before the service answers, and only the first rows are built at once.
   Also every web/*.css must have balanced braces: a stray declaration line (its selector deleted) swallowed the
   next rule (.dev-notice-rule's grid-area) and put the game-name hint over the notice title. */
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const web = path.join(__dirname, '..', 'web');

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.hidden = false; this.textContent = ''; this.isConnected = true; }
  append(...xs) { for (const x of xs) x instanceof Frag ? this.children.push(...x.children) : this.children.push(x); }
  replaceChildren(...xs) { this.children = []; this.append(...xs); }
}
class Frag extends El {}

function fakeDom() {
  const list = new El('ul'), note = new El('p');
  list.hidden = note.hidden = true;
  const dialog = { isConnected: true, querySelector: s => s === '.dev-notice-updates' ? list : s === '.dev-notice-updates-note' ? note : null };
  globalThis.document = { createElement: t => new El(t), createDocumentFragment: () => new Frag('#frag') };
  return { dialog, list, note };
}
const rows = n => Array.from({ length: n }, (_, i) => ({ date: '2026-11-' + String(1 + (i % 28)).padStart(2, '0'), text: 'update ' + i }));

test('a cached update list is drawn before the service answers', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  globalThis.requestIdleCallback = fn => setTimeout(fn, 0);
  const ui = await import(pathToFileURL(path.join(web, 'feedback-ui.js')).href);
  store.set('megulit.siteUpdates', JSON.stringify(rows(5)));
  assert.strictEqual(ui.cachedUpdates().length, 5);

  const { dialog, list } = fakeDom();
  let answer; const pending = new Promise(r => { answer = r; });
  const api = () => pending; /* the service never answers in time */
  const shown = ui.drawUpdates(dialog, 'zh', ui.cachedUpdates());
  assert.strictEqual(shown, 5); assert.strictEqual(list.hidden, false); assert.strictEqual(list.children.length, 5);
  answer(rows(5)); await api();
  /* the fill path itself must draw the cache before awaiting the service */
  const src = fs.readFileSync(path.join(web, 'feedback-ui.js'), 'utf8'), fill = src.slice(src.indexOf('async function fillUpdates'));
  assert.ok(fill.indexOf('drawUpdates(dialog, locale, cached)') < fill.indexOf("await api('site_updates'"));
});

test('a long update list builds only the first rows at once, the rest when idle', async () => {
  const ui = await import(pathToFileURL(path.join(web, 'feedback-ui.js')).href);
  globalThis.requestIdleCallback = fn => setTimeout(fn, 0);
  const { dialog, list } = fakeDom();
  ui.drawUpdates(dialog, 'zh', rows(200));
  assert.ok(list.children.length <= 12, 'first frame rows ' + list.children.length);
  for (let i = 0; i < 20 && list.children.length < 200; i++) await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(list.children.length, 200);
  assert.strictEqual(list.children[0].children[0].textContent, '11.01');
});

test('every web stylesheet has balanced braces', () => {
  for (const f of fs.readdirSync(web).filter(x => x.endsWith('.css'))) {
    const s = fs.readFileSync(path.join(web, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0, line = 1;
    for (const ch of s) { if (ch === '\n') line++; if (ch === '{') depth++; if (ch === '}' && --depth < 0) assert.fail(`${f}:${line} stray }`); }
    assert.strictEqual(depth, 0, f + ' unclosed {');
  }
});
