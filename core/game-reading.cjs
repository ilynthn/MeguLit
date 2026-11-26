'use strict';
/* Readings the game itself gives, before any reading MeguLit works out (user, #1134/#1135 2026-11-23: 「人名/特殊名词等注音优先
   扫描游戏文本+VNDB数据 不要靠自己猜」). Order: the ruby the game prints on this very line, then the ruby it printed on lines seen
   before (core/game-ruby.cjs), then the ruby its whole script gives a word (services/original-text.cjs scriptRuby: only a word the
   script always reads one way), then VNDB names (name-reading.cjs), then the dictionary. LocalLearning.tokenize applies them, so
   furigana, the speech button and lookup read the same.

   A person's name the tokenizer only guessed is never read: SudachiDict reads an unknown name kanji by kanji (昂晴 のぼるはれ) or
   gives a lone name kanji one of its many readings (希 まれ). Such a name keeps no reading (no furigana; speech lets the engine
   say it) until the game or VNDB gives one. A name SudachiDict knows as one word (佐藤) keeps its reading. */
const kanaOf = s => [...String(s || '')].map(c => { const n = c.codePointAt(0); return n >= 0x30a1 && n <= 0x30f6 ? String.fromCodePoint(n - 0x60) : c; }).join('');
const KANJI = /[\p{Script=Han}々〆ヶ]/u, KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u;
const FIXED = new Set(['game', 'name', 'number']);

/* base → reading for the words the whole script reads one way. rubyLines: one entry per script line, each null or [[base, reading], …]. */
function scriptReadings(rubyLines) {
  const seen = new Map();
  for (const pairs of Array.isArray(rubyLines) ? rubyLines : []) for (const pair of Array.isArray(pairs) ? pairs : []) {
    const [base, reading] = Array.isArray(pair) ? pair : [];
    if (typeof base !== 'string' || typeof reading !== 'string' || !KANJI.test(base) || !KANA.test(reading) || base.length > 40 || reading.length > 80) continue;
    const list = seen.get(base) || new Map(); if (!list.has(kanaOf(reading))) list.set(kanaOf(reading), reading); seen.set(base, list);
  }
  const out = new Map();
  for (const [base, list] of seen) if (list.size === 1) out.set(base, [...list.values()][0]);
  return out;
}

/* The game readings that occur in text, in priority order and longest first within each source: [[base, reading, source], …]. */
function readingsIn(text, { line = [], learned = {}, script = null } = {}) {
  const t = String(text || ''), out = [], taken = new Set();
  const add = (base, reading, source) => { if (typeof base !== 'string' || typeof reading !== 'string' || !base || !reading || taken.has(base) || !KANJI.test(base) || !t.includes(base)) return; taken.add(base); out.push([base, reading, source]); };
  const longest = list => [...list].sort((a, b) => [...b[0]].length - [...a[0]].length);
  for (const [b, r] of longest((Array.isArray(line) ? line : []).filter(Array.isArray))) add(b, r, 'line');
  for (const [b, r] of longest(Object.entries(learned && typeof learned === 'object' ? learned : {}))) add(b, r, 'learned');
  if (script instanceof Map) for (const [b, r] of longest([...script].filter(([b]) => t.includes(b)))) add(b, r, 'script');
  return out;
}

/* Token runs that spell a game reading's word become that word (readingSource 'game'). Only whole tokens: the game's ruby on 島
   is not the 島 of 島民. Up to 8 tokens, never across a gap. */
function gameTokens(tokens, readings) {
  if (!Array.isArray(tokens) || !Array.isArray(readings) || !readings.length) return tokens;
  const ordered = [...readings].sort((a, b) => [...String(b?.[0] || '')].length - [...String(a?.[0] || '')].length), out = [];
  for (let i = 0; i < tokens.length; i++) {
    let hit = null;
    for (const [base, reading, source] of ordered) {
      let surface = '', j = i;
      for (; j < tokens.length && j < i + 8; j++) {
        const t = tokens[j];
        if (typeof t?.surface !== 'string' || !t.surface || j > i && Number.isInteger(tokens[j - 1].end) && Number.isInteger(t.start) && tokens[j - 1].end !== t.start) break;
        surface += t.surface; if (surface.length >= base.length) break;
      }
      if (surface === base) { hit = { base, reading, source, stop: j }; break; }
    }
    if (!hit) { out.push(tokens[i]); continue; }
    const part = tokens.slice(i, hit.stop + 1), first = part[0], last = part.at(-1), { reading, source } = hit;
    out.push({ ...first, surface: hit.base, reading, base_form: part.length === 1 ? first.base_form : hit.base, normalized: part.length === 1 ? first.normalized : hit.base,
      end: last.end, ...(part.length > 1 ? { subtokens: part } : {}), pitch: kanaOf(first.reading) === kanaOf(reading) && part.length === 1 ? first.pitch || [] : [],
      lexeme: part.length === 1 && kanaOf(first.reading) === kanaOf(reading) ? first.lexeme : null, reading_ambiguous: false, readingSource: 'game', gameSource: source });
    i = hit.stop;
  }
  return out;
}

/* Person names the tokenizer only guessed lose their reading (readingSource 'unknown-name', guess keeps it for diagnostics):
   an unknown word (OOV), a name cut kanji by kanji (adjacent name pieces, one of them a single kanji), a lone one-kanji given name. */
const personName = t => Array.isArray(t?.grammar) && t.grammar[1] === '固有名詞' && t.grammar[2] === '人名';
function unknownNames(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  const touching = (a, b) => !!a && !!b && (!Number.isInteger(a.end) || !Number.isInteger(b.start) || a.end === b.start);
  const one = x => [...String(x?.surface || '')].length === 1 && KANJI.test(x.surface), free = x => !!x && !FIXED.has(x.readingSource) && !!x.reading;
  const blank = new Set();
  tokens.forEach((t, i) => {
    if (!personName(t) || !free(t) || !KANJI.test(t.surface || '')) return;
    /* a stem before its okurigana is no name (頼 of 頼むっ came as 人名 ライ) */
    const after = tokens[i + 1];if (one(t) && after && touching(t, after) && /^[\p{Script=Hiragana}]/u.test(after.surface || '') && !['助詞', '助動詞', '接尾辞'].includes((after.grammar || [])[0])) return;
    if (t.reading_ambiguous || one(t) && t.grammar[3] === '名') blank.add(i);
    /* a name cut kanji by kanji: 昂晴 came as 昂 (人名 ノボル) + 晴 (普通名詞 ハレ), 紅莉栖 as クレナイ + リー + スミカ. A one-kanji
       name piece next to another name piece or a lone kanji is such a cut, and so is that lone kanji; a whole surname beside
       it (桐生 in 桐生萌郁) keeps its reading */
    if (one(t)) for (const j of [i - 1, i + 1]) {
      const n = tokens[j];if (!free(n) || !touching(...(j < i ? [n, t] : [t, n])) || !(personName(n) || one(n))) continue;
      blank.add(i);if (one(n)) blank.add(j);
    }
  });
  return tokens.map((t, i) => blank.has(i) ? { ...t, reading: '', guess: t.reading, pitch: [], lexeme: null, reading_ambiguous: true, readingSource: 'unknown-name' } : t);
}

module.exports = { scriptReadings, readingsIn, gameTokens, unknownNames };
