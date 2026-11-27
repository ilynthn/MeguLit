// SPDX-License-Identifier: GPL-3.0-or-later
/* megulit.com /me/: the user centre. Read-only view of what the desktop app synced (relay /api/sync), kept in IndexedDB so it
   opens instantly and works offline. Every piece of synced text is put on the page with textContent, never as HTML. */
import { KINDS, SHARDS, syncKinds, buildStats, filterSentences, filterWords, parseDefinitions, lookupAt, formatDuration, displayName, initialOf, isWordChar, MASTERY } from './me-core.mjs';
import { store, getMeta, setMeta, delMeta, allData, allRows, wipeAll } from './me-store.mjs';
import * as relay from './me-api.mjs';
import { loadShard, downloadAll, cachedCount, clearDict } from './me-dict.mjs';
import { translator, pickLang, errorText } from './me-i18n.mjs';

const $ = (s, el = document) => el.querySelector(s);
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } }, del: k => { try { localStorage.removeItem(k); } catch { /* private mode */ } } };
const h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let lang = pickLang(new URLSearchParams(location.search).get('lang') || ls.get('megulit-lang'), navigator.languages || [navigator.language]);
let t = translator(lang);
const state = { data: Object.fromEntries(KINDS.map(k => [k, []])), profile: null, me: null, tab: 'stats', online: navigator.onLine, syncing: false, lastSync: 0, signedIn: false, filters: { query: '', game: '', mastery: '', limit: 30 }, wordLimit: 40 };
const TABS = [['stats', 'tabStats', 'stats'], ['lines', 'tabLines', 'lines'], ['words', 'tabWords', 'words'], ['route', 'tabRoute', 'route']];

/* ---- chrome: language, theme, kana sky -------------------------------------------------------------------------- */
function applyTheme(theme) { if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme; }
function setupChrome() {
  applyTheme(ls.get('megulit-theme'));
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  for (const b of document.querySelectorAll('[data-lang]')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    b.addEventListener('click', () => { lang = b.dataset.lang; ls.set('megulit-lang', lang); t = translator(lang); document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang; for (const x of document.querySelectorAll('[data-lang]')) x.setAttribute('aria-pressed', String(x.dataset.lang === lang)); closePop(); render(); });
  }
  $('#theme')?.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
    const next = dark ? 'light' : 'dark'; applyTheme(next); ls.set('megulit-theme', next);
  });
  const sky = $('#sky'), kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコ読夢恋'; let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 36; i++) {
    const s = h('span', { class: rnd() < .12 ? 'red' : '', style: `left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 100).toFixed(1)}%;--s:${(1 + rnd() * 3).toFixed(2)}rem;--o:${(.03 + rnd() * .08).toFixed(3)};--b:${rnd() < .5 ? (rnd() * 3).toFixed(1) : 0}px;--r:${((rnd() - .5) * 40).toFixed(0)}deg;--d:${(40 + rnd() * 50).toFixed(0)}s;--w:${(-rnd() * 60).toFixed(0)}s` }, kana[Math.floor(rnd() * kana.length)]);
    sky?.append(s);
  }
}

/* ---- formatting ------------------------------------------------------------------------------------------------ */
const pad = n => String(n).padStart(2, '0');
function when(ms) {
  if (!ms) return t('never');
  const d = new Date(ms), now = new Date(), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `${t('today')} ${hm}`;
  if (d.toDateString() === new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString()) return `${t('yesterday')} ${hm}`;
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${hm}`;
}
const duration = seconds => { const { h: hh, m } = formatDuration(seconds); return hh ? [h('b', null, hh), h('small', null, t('hours')), ' ', h('b', null, m), h('small', null, t('minutes'))] : [h('b', null, m), h('small', null, t('minutes'))]; };
const tag = text => h('span', { class: 'mtag' }, text);
const cell = (cls, label, ...kids) => h('div', { class: 'cell ' + cls }, tag(label), ...kids);
const rule = (no, text) => h('div', { class: 'foot-rule' }, h('span', null, '— ' + no), h('span', null, text), h('i', { class: 'barcode' }));

/* ---- data ------------------------------------------------------------------------------------------------------ */
async function loadLocal() {
  for (const kind of KINDS) state.data[kind] = await allData(kind);
  const settings = await allRows('settings');
  state.profile = settings.find(r => r.key === 'profile')?.data || null;
  state.me = (await getMeta('me')) || null;
  state.lastSync = (await getMeta('lastSync')) || 0;
  const name = displayName(state.profile, state.me);
  if (name) ls.set('megulit-me-chip', JSON.stringify({ n: name, a: typeof state.profile?.avatar === 'string' && state.profile.avatar.length < 60000 ? state.profile.avatar : '' }));
}
async function sync() {
  if (state.syncing || !state.signedIn) return;
  state.syncing = true; render();
  try {
    const info = await relay.me(); await setMeta('me', { username: info.username || '', email: info.email || '' });
    await syncKinds({ api: relay.api, store }); await setMeta('lastSync', Date.now()); state.online = true;
  } catch (error) {
    if (error.code === 'UNAUTHORIZED') { await signOutLocal(); state.notice = t('sessionExpired'); state.syncing = false; return showLogin(); }
    state.online = error.code === 'NETWORK' ? false : state.online;
    if (error.code !== 'NETWORK') toast(t('error', { code: error.code || 'ERR' }));
  }
  state.syncing = false; await loadLocal(); render();
}
async function signOutLocal() {
  state.signedIn = false; ls.del('megulit-me-chip'); await wipeAll();
  state.data = Object.fromEntries(KINDS.map(k => [k, []])); state.profile = null; state.me = null; state.lastSync = 0;
}

/* ---- popovers and toast ------------------------------------------------------------------------------------------ */
let pop = null, popOwner = null;
function closePop() { pop?.remove(); pop = null; popOwner = null; for (const el of document.querySelectorAll('.ch.hit')) el.classList.remove('hit'); }
function openPop(content, anchor, owner) {
  closePop(); pop = h('div', { class: 'pop', role: 'dialog' }, h('button', { class: 'pop-x', 'aria-label': t('close'), onclick: closePop }, '×'), content); popOwner = owner;
  document.body.append(pop);
  if (innerWidth >= 720 && anchor) {
    const r = anchor.getBoundingClientRect(), w = Math.min(420, innerWidth - 24), left = Math.max(12, Math.min(innerWidth - w - 12, r.left + scrollX));
    pop.style.cssText = `width:${w}px;left:${left}px;top:${r.bottom + scrollY + 10}px`; pop.classList.add('float');
  }
  requestAnimationFrame(() => pop?.classList.add('in'));
}
addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
addEventListener('click', e => { if (pop && !pop.contains(e.target) && !e.target.closest('.ch') && !e.target.closest('[data-menu]')) closePop(); });
let toastTimer = 0;
function toast(text) { $('.toast')?.remove(); const el = h('div', { class: 'toast', role: 'status' }, text); document.body.append(el); requestAnimationFrame(() => el.classList.add('in')); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3200); }

/* ---- dictionary look-up --------------------------------------------------------------------------------------------- */
async function lookup(sentence, index, charEl) {
  const spans = [...charEl.parentElement.querySelectorAll('.ch')];
  if (!isWordChar(charEl.textContent)) return;
  for (const el of spans) el.classList.remove('hit');
  const box = h('div', { class: 'lk' }, h('p', { class: 'lk-load' }, t('loading')));
  openPop(box, charEl, sentence);
  const result = await lookupAt(sentence.text, index, loadShard);
  if (!pop || popOwner !== sentence) return;
  if (result.surface) { const len = [...result.surface].length; for (let i = index; i < index + len; i++) spans[i]?.classList.add('hit'); }
  box.replaceChildren();
  if (!result.entries.length) { box.append(h('p', { class: 'lk-none' }, result.unavailable ? t('dictOff') : t('noEntry'))); return; }
  const known = new Set(state.data.words.map(w => w.spelling));
  const main = result.entries[0], head = main.spellings[0] || main.readings[0] || result.surface;
  box.append(h('div', { class: 'lk-head' }, h('span', { class: 'lk-w' }, head), main.readings[0] && main.spellings.length ? h('span', { class: 'lk-r' }, main.readings[0]) : null),
    ...(result.form !== result.surface ? [h('p', { class: 'lk-from' }, `${result.surface} → ${result.form}`)] : []));
  for (const e of result.entries) {
    box.append(h('div', { class: 'lk-entry' }, e.pos?.length ? h('span', { class: 'lk-pos' }, [...new Set(e.pos.map(p => p.replace(/\s*\(.*$/, '')))].join(' · ')) : null,
      e !== main ? h('b', { class: 'lk-alt' }, `${e.spellings[0] || ''} ${e.readings[0] || ''}`.trim()) : null,
      h('ol', null, e.definitions.slice(0, 5).map(d => h('li', null, d)))));
  }
  const inBook = result.entries.some(e => e.spellings.some(s => known.has(s)) || (!e.spellings.length && e.readings.some(r => known.has(r))));
  box.append(h('div', { class: 'lk-foot' }, h('span', { class: 'src' }, 'jmdict · ' + (navigator.onLine ? 'cached' : 'offline')), h('span', { class: 'mchip' + (inBook ? ' on' : '') }, inBook ? t('inWordbook') + ' ✓' : t('notInWordbook'))));
}
function clickable(sentence) {
  const chars = [...sentence.text], root = h('div', { class: 'ja' });
  chars.forEach((c, i) => root.append(h('span', { class: 'ch', 'data-i': i }, c)));
  root.addEventListener('click', e => { const el = e.target.closest('.ch'); if (el) lookup(sentence, Number(el.dataset.i), el); });
  return root;
}

/* ---- views ------------------------------------------------------------------------------------------------------- */
function viewStats() {
  const s = buildStats({ ...state.data }), max = Math.max(1, ...s.series.map(d => d.minutes)), sentences = filterSentences(state.data.sentences).slice(0, 2);
  const grid = h('div', { class: 'grid' },
    cell('c3', t('readTime'), h('span', { class: 'k' }, 'total reading'), h('div', { class: 'v' }, duration(s.seconds))),
    cell('c3', t('chars'), h('span', { class: 'k' }, 'characters read'), h('div', { class: 'v red' }, s.characters.toLocaleString('en-US'))),
    cell('c3', t('wordsSaved'), h('span', { class: 'k' }, 'words saved'), h('div', { class: 'v' }, s.words)),
    cell('c3', t('linesSaved'), h('span', { class: 'k' }, 'lines saved'), h('div', { class: 'v' }, s.sentences, s.streak ? h('small', null, '· ' + t('streak', { n: s.streak })) : null)),
    cell('c8', t('last30'), h('span', { class: 'k' }, '— 03  ' + t('minutesPerDay')),
      h('div', { class: 'bars', role: 'img', 'aria-label': t('last30') }, s.series.map(d => h('i', { class: d.minutes ? '' : 'lo', style: `height:${Math.max(3, Math.round(d.minutes / max * 100))}%`, title: `${d.day} · ${d.minutes}${t('minutes')}` }))),
      h('div', { class: 'axis' }, h('span', null, s.series[0].day.slice(5).replace('-', '.')), h('span', null, s.series[14].day.slice(5).replace('-', '.')), h('span', null, s.series[29].day.slice(5).replace('-', '.')))),
    cell('c4', t('tabRoute'), h('span', { class: 'k' }, '— 04  ' + t('routes')), bars(s.routes.slice(0, 4).map(r => [r.game, r.ratio == null ? '—' : Math.round(r.ratio * 100) + '%', r.ratio || 0]))),
    cell('c7', t('recent'), h('span', { class: 'k' }, '— 05  recent lines · ' + t('tapHint')), sentences.length ? sentences.map(sentenceRow) : h('p', { class: 'empty' }, t('noLines'))),
    cell('c5', t('mastery'), h('span', { class: 'k' }, '— 06  word mastery'), bars([[t('masteryNew'), s.mastery.new, ratio(s.mastery.new, s.words), 'plain'], [t('masteryLearning'), s.mastery.learning, ratio(s.mastery.learning, s.words)], [t('masteryKnown'), s.mastery.known, ratio(s.mastery.known, s.words), 'hot']]),
      h('div', { class: 'study' }, [['lookups', s.study.lookups], ['reviews', s.study.reviews], ['newWords', s.study.newWords]].map(([k, v]) => h('div', null, h('b', null, v.toLocaleString('en-US')), h('span', null, t(k))))),
      h('div', { class: 'status' }, h('span', { class: state.online ? 'on' : '' }, state.online ? 'sync on' : 'offline'), h('span', null, 'pwa · offline ready'))));
  return grid;
}
const ratio = (n, total) => (total ? n / total : 0);
function bars(rows) { return h('ul', { class: 'mrows' }, rows.length ? rows.map(([name, value, r, kind]) => h('li', null, h('span', { class: 'gname' }, name), h('em', null, value), h('div', { class: 'bar' }, h('i', { class: kind || '', style: `width:${Math.round(Math.max(0, Math.min(1, r)) * 100)}%` })))) : h('li', { class: 'empty' }, t('noRoute'))); }
function sentenceRow(s) {
  return h('div', { class: 'sent' }, clickable(s), s.translation ? h('div', { class: 'zh' }, s.translation) : null,
    h('div', { class: 'src' }, s.game ? h('b', null, s.game) : null, s.created_at ? ' · ' + new Date(s.created_at * 1000).toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang) : ''));
}
function viewLines() {
  const games = [...new Set(state.data.sentences.map(s => s.game).filter(Boolean))].sort();
  const input = h('input', { type: 'search', value: state.filters.query, placeholder: t('search'), 'aria-label': t('search'), oninput: e => { state.filters.query = e.target.value; state.filters.limit = 30; renderList(); } });
  const select = h('select', { 'aria-label': t('allGames'), onchange: e => { state.filters.game = e.target.value; state.filters.limit = 30; renderList(); } }, h('option', { value: '' }, t('allGames')), games.map(g => h('option', { value: g, selected: g === state.filters.game }, g)));
  const out = h('div', { class: 'list' });
  function renderList() {
    const l = filterSentences(state.data.sentences, state.filters), part = l.slice(0, state.filters.limit);
    out.replaceChildren(...(part.length ? part.map(sentenceRow) : [h('p', { class: 'empty' }, state.data.sentences.length ? t('noMatch') : t('noLines'))]),
      l.length > part.length ? h('button', { class: 'mmore', onclick: () => { state.filters.limit += 30; renderList(); } }, `+ ${l.length - part.length}`) : null);
  }
  renderList();
  return h('div', { class: 'panel' }, h('div', { class: 'search' }, input, select), h('p', { class: 'hint' }, t('tapHint')), out);
}
function viewWords() {
  const chips = [['', t('allStatus')], ['new', t('masteryNew')], ['learning', t('masteryLearning')], ['known', t('masteryKnown')]];
  const out = h('div', { class: 'list' }), bar = h('div', { class: 'mchips' });
  const input = h('input', { type: 'search', value: state.filters.query, placeholder: t('search'), 'aria-label': t('search'), oninput: e => { state.filters.query = e.target.value; state.wordLimit = 40; renderList(); } });
  function renderBar() { bar.replaceChildren(...chips.map(([k, label]) => h('button', { class: 'mchip' + (state.filters.mastery === k ? ' on' : ''), onclick: () => { state.filters.mastery = k; state.wordLimit = 40; renderBar(); renderList(); } }, label))); }
  function renderList() {
    const l = filterWords(state.data.words, state.filters), part = l.slice(0, state.wordLimit);
    out.replaceChildren(...(part.length ? part.map(wordRow) : [h('p', { class: 'empty' }, state.data.words.length ? t('noMatch') : t('noWords'))]),
      l.length > part.length ? h('button', { class: 'mmore', onclick: () => { state.wordLimit += 40; renderList(); } }, `+ ${l.length - part.length}`) : null);
  }
  renderBar(); renderList();
  return h('div', { class: 'panel' }, h('div', { class: 'search' }, input), bar, out);
}
function wordRow(w) {
  const defs = parseDefinitions(w.definitions), level = MASTERY[Math.max(0, Math.min(4, Number(w.status) || 0))];
  const examples = Array.isArray(w.examples) ? w.examples.filter(e => e && typeof e.text === 'string').slice(0, 5) : [];
  return h('details', { class: 'word' }, h('summary', null, h('span', { class: 'ww' }, w.spelling || w.reading), w.spelling && w.reading ? h('span', { class: 'wr' }, w.reading) : null,
    h('span', { class: 'mchip lv-' + level }, t(level === 'new' ? 'masteryNew' : level === 'learning' ? 'masteryLearning' : 'masteryKnown'))),
    h('div', { class: 'wb' }, h('ol', null, defs.slice(0, 6).map(d => h('li', null, d))),
      examples.length ? h('div', { class: 'ex' }, h('span', { class: 'k' }, t('example')), examples.map(e => h('div', { class: 'sent' }, clickable({ text: e.text }), e.translation ? h('div', { class: 'zh' }, e.translation) : null, e.game ? h('div', { class: 'src' }, h('b', null, e.game)) : null))) : null));
}
function viewRoute() {
  const routes = buildStats({ ...state.data }).routes;
  if (!routes.length) return h('div', { class: 'panel' }, h('p', { class: 'empty' }, t('noRoute')));
  const marks = filterSentences(state.data.sentences);
  return h('div', { class: 'routes' }, routes.map(r => {
    const mine = marks.filter(s => s.game === r.game).slice(0, 3);
    return h('section', { class: 'route cell' }, tag(r.game),
      h('div', { class: 'rp' }, h('div', { class: 'v' }, r.ratio == null ? '—' : Math.round(r.ratio * 100), r.ratio == null ? null : h('small', null, '%')), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((r.ratio || 0) * 100)}%` }))),
      h('p', { class: 'src' }, r.total ? `${t('read')} ${r.read} / ${t('ofTotal', { n: r.total })}` : t('progressUnknown'), ' · ', h('span', null, duration(r.seconds)), r.lastPlayedAt ? ' · ' + t('played', { when: when(r.lastPlayedAt) }) : ''),
      mine.length ? h('div', { class: 'marks' }, h('span', { class: 'k' }, t('bookmarks')), mine.map(sentenceRow)) : null);
  }));
}

/* ---- shell, menu ---------------------------------------------------------------------------------------------------- */
function openMenu(anchor) {
  const status = h('p', { class: 'mn-sync' }, state.syncing ? t('syncing') : t('lastSync', { when: when(state.lastSync) }));
  const dict = h('button', { class: 'btn-mini', onclick: async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await downloadAll((done, total) => { btn.textContent = t('dictProgress', { done, total }); }); btn.textContent = t('dictDone'); } catch { btn.disabled = false; btn.textContent = t('downloadDict'); toast(errorText(lang, 'NETWORK')); }
  } }, t('downloadDict'));
  cachedCount().then(n => { if (n >= SHARDS) { dict.textContent = t('dictDone'); dict.disabled = true; } });
  openPop(h('div', { class: 'mn' }, h('p', { class: 'mn-name' }, displayName(state.profile, state.me)), h('p', { class: 'mn-mail' }, state.me?.email || ''), status,
    h('button', { class: 'btn-mini', onclick: () => { closePop(); sync(); } }, t('syncNow')), dict,
    h('button', { class: 'btn-mini danger', onclick: async () => { closePop(); try { await relay.logout(); } catch { /* offline: the local copy still goes */ } await clearDict(); await signOutLocal(); showLogin(); } }, t('signOut')),
    h('p', { class: 'hint' }, t('signedOutNote')), h('p', { class: 'hint' }, t('deviceNote'))), anchor, 'menu');
}
function accountButton() {
  const name = displayName(state.profile, state.me), avatar = typeof state.profile?.avatar === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(state.profile.avatar) ? state.profile.avatar : '';
  return h('button', { class: 'avatar', 'data-menu': '', 'aria-label': t('menu'), onclick: e => { if (pop && popOwner === 'menu') closePop(); else openMenu(e.currentTarget); } }, avatar ? h('img', { src: avatar, alt: '' }) : initialOf(name));
}
function paintAccount() { const slot = $('#acct'); if (!slot) return; slot.replaceChildren(state.signedIn ? accountButton() : h('a', { class: 'acct', href: '/me/' }, t('signIn'))); }
function render() {
  paintAccount();
  const app = $('#app'); if (!app) return;
  document.title = `${t('title')} · MeguLit`;
  if (!state.signedIn) return;
  const name = displayName(state.profile, state.me), views = { stats: viewStats, lines: viewLines, words: viewWords, route: viewRoute };
  const scroll = scrollY, offline = !state.online;
  app.replaceChildren(
    h('div', { class: 'me-head' }, h('p', { class: 'typed' }, t('typed'), h('b', { class: 'caret' }, '▮')),
      h('h1', { class: 'me-title' }, t('welcome') + ' ', h('span', { class: 'ht-gal' }, name || 'MeguLit')),
      rule('02', state.syncing ? t('syncing') : t('lastSync', { when: when(state.lastSync) })),
      offline ? h('p', { class: 'offline' }, t('offline', { when: when(state.lastSync) })) : null,
      h('nav', { class: 'mtabs', 'aria-label': t('title') }, TABS.map(([id, key, en]) => h('a', { href: '#/' + id, 'aria-current': state.tab === id ? 'page' : null }, h('b', null, t(key)), en)))),
    h('div', { class: 'view', key: state.tab }, views[state.tab]()));
  $('.tabbar')?.remove();
  document.body.append(h('nav', { class: 'tabbar', 'aria-label': t('title') }, TABS.map(([id, key, en]) => h('a', { href: '#/' + id, 'aria-current': state.tab === id ? 'page' : null }, t(key), h('span', null, en)))));
  scrollTo(0, scroll);
}
function route() { const id = (location.hash.match(/^#\/(\w+)/) || [])[1]; const next = TABS.some(x => x[0] === id) ? id : 'stats'; if (next !== state.tab) { state.tab = next; closePop(); state.filters = { query: '', game: '', mastery: '', limit: 30 }; state.wordLimit = 40; render(); scrollTo(0, 0); } }
addEventListener('hashchange', route);
addEventListener('online', () => { state.online = true; sync(); });
addEventListener('offline', () => { state.online = false; render(); });

/* ---- sign in -------------------------------------------------------------------------------------------------- */
function showLogin() {
  $('.tabbar')?.remove(); closePop(); paintAccount();
  let mode = 'code', email = '', cooldown = 0, timer = 0;
  const app = $('#app'), msg = h('p', { class: 'msg', role: 'status' }), emailIn = h('input', { type: 'email', autocomplete: 'email', placeholder: t('emailPh'), 'aria-label': t('email') });
  const codeIn = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, placeholder: t('codePh'), 'aria-label': t('code') });
  const idIn = h('input', { autocomplete: 'username', placeholder: t('loginId'), 'aria-label': t('loginId') }), pwIn = h('input', { type: 'password', autocomplete: 'current-password', placeholder: t('password'), 'aria-label': t('password') });
  const send = h('button', { class: 'btn-red', type: 'button' }, t('sendCode')), go = h('button', { class: 'btn-red solid', type: 'submit' }, t('verify'));
  const fail = error => { msg.textContent = errorText(lang, error?.code); msg.className = 'msg bad'; };
  const finish = async data => {
    await setMeta('session', data.token); state.signedIn = true; await loadLocal(); state.tab = 'stats'; history.replaceState(null, '', '/me/#/stats'); render(); sync();
  };
  const tick = () => { send.disabled = cooldown > 0; send.textContent = cooldown > 0 ? `${t('sendCode')} (${cooldown})` : t('sendCode'); };
  send.addEventListener('click', async () => {
    email = emailIn.value.trim(); if (!email) return fail({ code: 'EMAIL_INVALID' });
    send.disabled = true; msg.textContent = '';
    try { await relay.requestCode(email); msg.textContent = t('sentTo', { email }); msg.className = 'msg'; cooldown = 60; tick(); clearInterval(timer); timer = setInterval(() => { cooldown--; tick(); if (cooldown <= 0) clearInterval(timer); }, 1000); codeIn.focus(); }
    catch (error) { fail(error); tick(); }
  });
  const form = h('form', { class: 'login', novalidate: true, onsubmit: async e => {
    e.preventDefault(); go.disabled = true; msg.textContent = '';
    try { finish(mode === 'code' ? await relay.verifyCode(emailIn.value.trim(), codeIn.value.replace(/\s+/g, '')) : await relay.passwordLogin(idIn.value.trim(), pwIn.value)); }
    catch (error) { fail(error); go.disabled = false; }
  } });
  const modes = h('div', { class: 'mtabs small' }, [['code', 'modeCode'], ['password', 'modePassword']].map(([id, key]) => h('a', { href: '#', 'aria-current': mode === id ? 'page' : null, onclick: e => { e.preventDefault(); mode = id; fields(); } }, h('b', null, t(key)))));
  const body = h('div', { class: 'fields' });
  function fields() {
    for (const a of modes.children) a.removeAttribute('aria-current'); modes.children[mode === 'code' ? 0 : 1].setAttribute('aria-current', 'page');
    body.replaceChildren(...(mode === 'code' ? [h('div', { class: 'row' }, emailIn, send), codeIn] : [idIn, pwIn]));
    tick();
  }
  form.append(modes, body, go, msg); fields();
  app.replaceChildren(h('div', { class: 'me-head' }, h('p', { class: 'typed' }, t('typed'), h('b', { class: 'caret' }, '▮')), h('h1', { class: 'me-title' }, h('span', { class: 'ht-gal' }, t('signIn'))), rule('01', t('title'))),
    h('div', { class: 'login-box' }, h('p', { class: 'lede' }, state.notice || t('signInHint')), form, h('p', { class: 'hint' }, t('noAccount'))));
  state.notice = '';
}

/* ---- start ---------------------------------------------------------------------------------------------------- */
async function boot() {
  setupChrome();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/me/sw.js', { scope: '/me/' }).catch(() => {});
  let token; try { token = await getMeta('session'); } catch { token = null; }
  if (!token) return showLogin();
  state.signedIn = true; await loadLocal(); route(); render(); sync();
}
boot();
