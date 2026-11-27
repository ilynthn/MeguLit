// SPDX-License-Identifier: GPL-3.0-or-later
/* megulit.com /me/: the logic that has no DOM, so the tests can run it in Node.
   - deinflect / candidates / pickEntries: tap a character in a sentence, find the longest dictionary word starting there
   - buildStats: everything the dashboard shows, from the records the desktop app synced
   - syncKinds: pull the changed kinds into a local store (IndexedDB in the browser, a Map in the tests)
   Nothing here renders text from the records into HTML; the page only ever uses textContent. */

export const KINDS = ['words', 'sentences', 'reading', 'settings', 'progress', 'study'];

/* ---- dictionary look-up ------------------------------------------------------------------------------------------- */
const GODAN = {
  う: { i: 'い', a: 'わ', e: 'え', o: 'お', t: 'っ', d: 'っ' }, く: { i: 'き', a: 'か', e: 'け', o: 'こ', t: 'い', d: 'い' },
  ぐ: { i: 'ぎ', a: 'が', e: 'げ', o: 'ご', t: 'い', d: 'い' }, す: { i: 'し', a: 'さ', e: 'せ', o: 'そ', t: 'し', d: 'し' },
  つ: { i: 'ち', a: 'た', e: 'て', o: 'と', t: 'っ', d: 'っ' }, ぬ: { i: 'に', a: 'な', e: 'ね', o: 'の', t: 'ん', d: 'ん' },
  ぶ: { i: 'び', a: 'ば', e: 'べ', o: 'ぼ', t: 'ん', d: 'ん' }, む: { i: 'み', a: 'ま', e: 'め', o: 'も', t: 'ん', d: 'ん' },
  る: { i: 'り', a: 'ら', e: 'れ', o: 'ろ', t: 'っ', d: 'っ' }
};
const RULES = [];
const rule = (from, to, allowWholeWord = false) => RULES.push([from, to, allowWholeWord]);
for (const [end, row] of Object.entries(GODAN)) {
  for (const s of ['ます', 'ました', 'ません', 'ましょう', 'たい', 'たく', 'そう', 'ながら', 'に']) rule(row.i + s, end);
  for (const s of ['ない', 'なかった', 'なく', 'れる', 'せる', 'ず', 'ぬ', 'せない']) rule(row.a + s, end);
  rule(row.e + 'ば', end); rule(row.e + 'る', end); rule(row.o + 'う', end);
  const voiced = end === 'ぐ' || end === 'ぬ' || end === 'ぶ' || end === 'む';
  rule(row.t + (voiced ? 'だ' : 'た'), end); rule(row.t + (voiced ? 'で' : 'て'), end);
}
rule('行った', '行く', true); rule('行って', '行く', true);
for (const s of ['ます', 'ました', 'ません', 'ましょう', 'たい', 'ない', 'なかった', 'なく', 'た', 'て', 'よう', 'られる', 'させる', 'れば', 'ず', 'ろ', 'そう', 'ながら']) rule(s, 'る');
for (const s of ['かった', 'くない', 'くなかった', 'くて', 'ければ', 'く', 'さ', 'そう', 'すぎる', 'かったら']) rule(s, 'い');
for (const s of ['し', 'しない', 'します', 'しました', 'した', 'して', 'しよう', 'される', 'させる', 'すれば', 'せず']) rule(s, 'する');
/* …て + いる and friends: back to the te-form, which the rules above then take to the dictionary form */
const PROGRESSIVE = [['ている', 'て'], ['ていた', 'て'], ['ていない', 'て'], ['ていません', 'て'], ['ています', 'て'], ['ていました', 'て'], ['でいる', 'で'], ['でいた', 'で'], ['てる', 'て'], ['でる', 'で'], ['ちゃう', 'て'], ['ておく', 'て'], ['てしまう', 'て'], ['てた', 'て']];
/* every dictionary form this surface may come from, the surface itself first */
export function deinflect(surface) {
  const out = [], seen = new Set(), queue = [[String(surface), 0]];
  while (queue.length) {
    const [word, depth] = queue.shift();
    if (!word || seen.has(word)) continue;
    seen.add(word); out.push(word);
    if (depth >= 2) continue;
    for (const [from, to, allowWholeWord] of RULES) if (word.endsWith(from) && (allowWholeWord || word.length > from.length)) queue.push([word.slice(0, word.length - from.length) + to, depth + 1]);
    for (const [from, to] of PROGRESSIVE) if (word.endsWith(from) && word.length > from.length) queue.push([word.slice(0, word.length - from.length) + to, depth + 1]);
  }
  return out;
}
const WORD_CHAR = /[ぁ-ゖァ-ヺー㐀-鿿豈-﫿々〆ヶ]/u;
export const isWordChar = ch => WORD_CHAR.test(ch);
/* the strings to try for a tap at index i of text, longest first */
export function candidates(text, i, max = 12) {
  const chars = [...String(text)];
  if (i < 0 || i >= chars.length || !isWordChar(chars[i])) return [];
  const out = [];
  for (let len = Math.min(max, chars.length - i); len >= 1; len--) out.push(chars.slice(i, i + len).join(''));
  return out;
}
export const SHARDS = 2048;
/* one file per form, by its first two characters (a one-character form by that character), so the busy kana starts are spread out */
export const shardOf = form => { const [a, b] = [...String(form)]; return (b === undefined ? a.codePointAt(0) : a.codePointAt(0) * 31 + b.codePointAt(0)) % SHARDS; };
/* entries from a shard that carry this exact form, most common first */
export function pickEntries(shard, form, limit = 6) {
  const hits = [];
  for (const e of shard) {
    const [, spellings, readings] = e;
    const spelled = spellings.includes(form);
    if (spelled || readings.includes(form)) hits.push({ entry: e, spelled });
  }
  const rank = e => (e[5] > 0 ? e[5] : 1e9);
  hits.sort((a, b) => (b.spelled - a.spelled) || (rank(a.entry) - rank(b.entry)));
  return hits.slice(0, limit).map(h => ({ id: h.entry[0], spellings: h.entry[1], readings: h.entry[2], definitions: h.entry[3], pos: h.entry[4], rank: h.entry[5] }));
}
/* the longest word that starts at the tapped character: {surface, form, entries}; loadShard(n) → shard array or null */
export async function lookupAt(text, i, loadShard) {
  let missing = false;
  for (const surface of candidates(text, i)) {
    for (const form of deinflect(surface)) {
      let shard = null;
      try { shard = await loadShard(shardOf(form)); } catch { shard = null; }
      if (shard === null) { missing = true; continue; }
      const entries = pickEntries(shard, form);
      if (entries.length) return { surface, form, entries };
    }
  }
  return { surface: '', form: '', entries: [], ...(missing ? { unavailable: true } : {}) };
}

/* ---- statistics ---------------------------------------------------------------------------------------------------- */
export const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const MASTERY = ['new', 'learning', 'learning', 'known', 'known'];
const num = v => (Number.isFinite(v) && v > 0 ? v : 0);
/* all = {words:[data], sentences:[data], reading:[data], progress:[data], study:[data]}: only live records */
export function buildStats(all, now = new Date(), days = 30) {
  const reading = all.reading || [], perDay = new Map(), perGame = new Map();
  let seconds = 0, characters = 0, lines = 0;
  for (const r of reading) {
    const s = num(r.seconds); seconds += s; characters += num(r.characters); lines += num(r.sentences);
    if (typeof r.day === 'string') perDay.set(r.day, (perDay.get(r.day) || 0) + s);
    const g = String(r.game || ''); if (g) perGame.set(g, (perGame.get(g) || 0) + s);
  }
  const series = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); const k = dayKey(d); series.push({ day: k, minutes: Math.round((perDay.get(k) || 0) / 60) }); }
  /* streak: consecutive days with reading, counted back from today (or from yesterday when today has none yet) */
  let streak = 0; const probe = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!(perDay.get(dayKey(probe)) > 0)) probe.setDate(probe.getDate() - 1);
  while (perDay.get(dayKey(probe)) > 0) { streak++; probe.setDate(probe.getDate() - 1); }
  const mastery = { new: 0, learning: 0, known: 0 };
  for (const w of all.words || []) mastery[MASTERY[Math.max(0, Math.min(4, Number(w.status) || 0))]]++;
  const study = { lookups: 0, reviews: 0, newWords: 0 };
  for (const s of all.study || []) { study.lookups += num(s.lookups); study.reviews += num(s.reviews); study.newWords += num(s.newWords); }
  return {
    seconds, characters, lines, streak, series, mastery, study,
    words: (all.words || []).length, sentences: (all.sentences || []).length,
    games: [...perGame].map(([game, secs]) => ({ game, seconds: secs })).sort((a, b) => b.seconds - a.seconds),
    routes: routes(all.progress || [])
  };
}
/* one row per work across devices: the newest device's read/total, the seconds of every device added */
export function routes(progress) {
  const by = new Map();
  for (const p of progress) {
    const key = String(p.game || '').toLowerCase(); if (!key) continue;
    const row = by.get(key) || { game: p.game, read: 0, total: null, seconds: 0, lastPlayedAt: 0 };
    row.seconds += num(p.seconds);
    if (num(p.lastPlayedAt) >= row.lastPlayedAt) { row.lastPlayedAt = num(p.lastPlayedAt); row.read = num(p.read); row.total = p.total > 0 ? p.total : null; row.game = p.game; }
    by.set(key, row);
  }
  return [...by.values()].map(r => ({ ...r, ratio: r.total ? Math.min(1, r.read / r.total) : null })).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}
export const formatDuration = seconds => { const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60); return { h, m }; };
export function parseDefinitions(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try { const v = JSON.parse(value); if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : String(x?.text ?? x?.definition ?? '')).filter(Boolean); } catch { /* plain text */ }
  return value ? [value] : [];
}
/* sentences: search the text and the translation, filter by work, newest first */
export function filterSentences(list, { query = '', game = '' } = {}) {
  const q = String(query).trim().toLowerCase();
  return list.filter(s => (!game || s.game === game) && (!q || String(s.text).toLowerCase().includes(q) || String(s.translation || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}
export function filterWords(list, { query = '', mastery = '' } = {}) {
  const q = String(query).trim().toLowerCase();
  return list.filter(w => (!mastery || MASTERY[Math.max(0, Math.min(4, Number(w.status) || 0))] === mastery)
    && (!q || String(w.spelling).toLowerCase().includes(q) || String(w.reading).includes(q) || parseDefinitions(w.definitions).join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

/* ---- sync into a local store --------------------------------------------------------------------------------------- */
/* api.get(path) → parsed JSON (throws with .code/.status); store: {cursor(kind), setCursor(kind,n), apply(kind,records), clear(kind)}.
   Pulls only the kinds the summary says moved; a cursor behind the local one (the cloud copy was deleted) clears the kind. */
export async function syncKinds({ api, store, kinds = KINDS }) {
  const summary = await api.get('/api/sync');
  if (!summary?.ok || typeof summary.kinds !== 'object') throw Object.assign(new Error('SYNC_RESPONSE_INVALID'), { code: 'SYNC_RESPONSE_INVALID' });
  const changed = [];
  for (const kind of kinds) {
    const remote = Number(summary.kinds[kind]?.cursor) || 0;
    let local = await store.cursor(kind);
    if (remote < local) { await store.clear(kind); await store.setCursor(kind, 0); local = 0; changed.push(kind); }
    if (remote === local) continue;
    for (let page = 0; page < 200; page++) {
      const data = await api.get(`/api/sync/${kind}?since=${local}&limit=500`);
      if (data?.ok !== true || !Array.isArray(data.records) || !Number.isSafeInteger(data.cursor) || data.cursor < local || typeof data.more !== 'boolean' || (data.more && data.cursor === local)) throw Object.assign(new Error('SYNC_RESPONSE_INVALID'), { code: 'SYNC_RESPONSE_INVALID' });
      await store.apply(kind, data.records);
      local = data.cursor; await store.setCursor(kind, local);
      if (!data.more) break;
    }
    changed.push(kind);
  }
  return changed;
}
export function displayName(profile, me) {
  const nick = typeof profile?.nickname === 'string' ? profile.nickname.trim() : '';
  return nick || me?.username || String(me?.email || '').split('@')[0] || '';
}
export const initialOf = name => { const c = [...String(name || '').trim()][0]; return c ? c.toUpperCase() : 'M'; };
