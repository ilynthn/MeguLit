// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* PR #1339 CI (crossline-lookup.test.cjs, 「少女は頬を赤 / らめて俯いた。」: a drag over the game's line break gave 赤らむ, not 赤らめる):
   the colloquial fallback read the bare stem 赤らめ as the imperative of 赤らむ and put that over the words SudachiDict had already
   found. A contraction, a dialect ending or a deinflection guess is only for a word nothing else finds; a word that is listed, or a
   plain verb stem ending in め / し / べ, is never rewritten or cut (調べ is 調べる, not 調 + the dialect ending べ).
   1. core/learning-native.cjs with the real SudachiDict tokens and JMdict rows of validation/helpers/crossline-fixture.cjs;
   2. core/colloquial.cjs with JMdict rows trimmed to the fields used. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { LocalLearning } = require('../core/learning-native.cjs');
const Colloquial = require('../core/colloquial.cjs');
const fx = require('./helpers/crossline-fixture.cjs');

function learning(dir, rank = {}) {
  const L = new LocalLearning(dir), entries = fx.entries.map(e => rank[e.id] ? { ...e, freq_rank: rank[e.id] } : e);
  L.tokenize = async text => { const t = fx.tokens[text]; if (!t) throw Error('no tokens for ' + JSON.stringify(text)); return L.dictionaryWords(JSON.parse(JSON.stringify(t))); };
  L.load = function () { if (this.index) return; this.index = new Map(); this.byId = new Map(); this.english = new Map(); for (const e of entries) { this.byId.set(e.id, e); for (const k of [...e.spellings, ...e.readings]) this.index.set(k, [...(this.index.get(k) || []), e.id]); } };
  return L;
}
const ids = r => (r?.entries || []).map(e => e.id);

test('a drag over the game\'s line break keeps the word SudachiDict found (赤らめる, not the guess 赤らむ); the other broken words too', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-misstrip-'));
  try {
    const L = learning(dir);
    for (const [text, first, id, wrong] of [
      ['少女は頬を赤\nらめて俯いた。', '赤', 1383290, 1383280],
      ['古い壁はすっかり黒\nずんでいた。', '黒', 1287450, 1287410],
      ['彼はじっと彼女を見つ\nめていた。', '見', 1604580, null],
      ['彼女の呼吸はひどく乱れ、全身はじっとりと汗\nばんでいた。悪夢を見たせいだろう。', '汗', 1213070, null]
    ]) {
      const chars = [...text], start = chars.indexOf(first), nl = chars.indexOf('\n');
      const r = await L.request('lookup_exact', { text, start, end: nl + 3 });
      assert.ok(ids(r).includes(id), text + ': ' + JSON.stringify({ surface: r?.surface, ids: ids(r) }));
      if (wrong) assert.ok(!ids(r).includes(wrong), text + ': the deinflection guess is not shown');
      assert.equal(r.colloquial?.dialect || null, null, text + ': no dialect ending');
      assert.ok(!/口语缩约|方言语尾|只查了前面/.test(r.match_note || ''), text + ': not marked colloquial: ' + r.match_note);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a plain deinflection guess never replaces the words found inside a selection, even when JMdict ranks the guess higher', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-misstrip-'));
  try {
    // 赤らめ is both the stem of 赤らめる and the imperative of 赤らむ; with 赤らむ ranked first only the words inside keep 赤らめる on the card
    const L = learning(dir, { 1383280: 1, 1383290: 90000 }), text = '少女は頬を赤\nらめて俯いた。', chars = [...text];
    const r = await L.request('lookup_exact', { text, start: chars.indexOf('赤'), end: chars.indexOf('\n') + 3 });
    assert.deepEqual(ids(r), [1383290], JSON.stringify({ surface: r?.surface, note: r?.match_note }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const V5 = r => ["Godan verb with '" + r + "' ending", 'transitive verb'], V1 = ['Ichidan verb', 'transitive verb'], N = ['noun (common) (futsuumeishi)'];
const JM = [
  { id: 1, spellings: ['赤らめる'], readings: ['あからめる'], pos: V1 },
  { id: 2, spellings: ['赤らむ'], readings: ['あからむ'], pos: V5('mu') },
  { id: 3, spellings: ['赤'], readings: ['あか'], pos: N },
  { id: 4, spellings: ['調べる'], readings: ['しらべる'], pos: V1, freq_rank: 900 },
  { id: 5, spellings: ['調'], readings: ['ちょう'], pos: N },
  { id: 6, spellings: ['比べる'], readings: ['くらべる'], pos: V1, freq_rank: 1200 },
  { id: 7, spellings: ['比'], readings: ['ひ'], pos: N },
  { id: 8, spellings: ['話す'], readings: ['はなす'], pos: V5('su'), freq_rank: 150 },
  { id: 9, spellings: ['話'], readings: ['はなし'], pos: N, freq_rank: 300 },
  { id: 10, spellings: ['見つめる'], readings: ['みつめる'], pos: V1 },
  { id: 11, spellings: ['眺め'], readings: ['ながめ'], pos: N },
  { id: 12, spellings: ['少し'], readings: ['すこし'], pos: ['adverb (fukushi)'] },
  { id: 13, spellings: ['初め'], readings: ['はじめ'], pos: N },
  { id: 14, spellings: ['並べる'], readings: ['ならべる'], pos: V1 },
  { id: 15, spellings: ['並'], readings: ['なみ'], pos: N },
  { id: 16, spellings: ['探す'], readings: ['さがす'], pos: V5('su') },
  { id: 17, spellings: ['舐める'], readings: ['なめる'], pos: V1, freq_rank: 5000 },
  { id: 18, spellings: [], readings: ['そう'], pos: ['adverb (fukushi)'], freq_rank: 60 }
];
const index = new Map(), byId = new Map();
for (const e of JM) { byId.set(e.id, e); for (const k of [...e.spellings, ...e.readings]) index.set(k, [...(index.get(k) || []), e.id]); }
const lookup = key => (index.get(key) || []).map(id => byId.get(id));

test('words and verb stems ending in め / し / べ are read as written: no dialect ending cut, no contraction', () => {
  const CASES = [
    ['赤らめ', '赤らめる'], ['見つめ', '見つめる'], ['眺め', '眺め'], ['初め', '初め'],
    ['話し', '話す'], ['探し', '探す'], ['少し', '少し'],
    ['調べ', '調べる'], ['比べ', '比べる'], ['並べ', '並べる'],
    ['赤らめる', '赤らめる'], ['調べる', '調べる']
  ];
  const wrong = [];
  for (const [word, base] of CASES) {
    const r = Colloquial.resolve(word, lookup);
    if (!r || r.base !== base || r.dialect || r.rules.length || r.prefix) wrong.push(word + ' → ' + JSON.stringify(r && { base: r.base, dialect: r.dialect?.ending, rules: r.rules, prefix: r.prefix }) + ' (want ' + base + ')');
  }
  assert.deepEqual(wrong, []);
});

test('a real dialect ending after a word is still cut (舐めんなし, そうだべ)', () => {
  const a = Colloquial.resolve('舐めんなし', lookup);
  assert.deepEqual([a.base, a.dialect?.ending], ['舐める', 'し']);
  const b = Colloquial.resolve('そうだべ', lookup);
  assert.deepEqual([b.base, b.dialect?.ending], ['そう', 'だべ']);
});
