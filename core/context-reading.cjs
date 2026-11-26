'use strict';
/* Words whose reading SudachiDict cannot tell from the word alone, read from the words around them (readingSource 'context').
   Run in LocalLearning.tokenize, so furigana, the speech button and lookup share the reading.

   生 (#1123, user 2026-11-24: 生に縋ろう annotated なまにすがろう, it is せいにすがろう): SudachiDict gives the lone noun 生
   its 形状詞 reading ナマ everywhere. Life (せい) is the noun taking を / に / へ (生を受ける, 生に縋る, 生への執着), or が / は / も /
   と after の (人の生は短い). Raw (なま) is 生で, 生の + noun (生の声), an order (生をもう１つ), a compound (生ビール, one token) and every other place.
   Checked on 3522 game lines with these patterns: 52 of 53 生 changes right (the order above was the one wrong).
   人気 (ひとけ): のない / の無い / の少ない / の絶えた is the presence of people (人気のない廊下); 人気がない stays にんき (not popular).
   Only these patterns: a rule that guesses more turns right readings wrong.

   Phrases (user 2026-11-26: 何時の間にか annotated なんじのあいだ, it is いつのまにか) are JMdict words; LocalLearning.dictionaryWords
   joins the tokens of any JMdict word before this runs (何時の間にか, いつの間にっ, 一寸 from 一 + 寸), so no phrase is listed here.
   何 is なに before a particle that does not start with t / d / n (何を, 何が, 何より, 何やら, 何かしら; SudachiDict: なん); なん is only
   said before those sounds (何で, 何だ, 何の, 何と) and in 何か. 言う read ゆう by SudachiDict is いう, the reading JMdict lists first
   (って言う, と言うか); ゆう is how it is said, and a writer who means ゆう writes it in kana.
   何時 alone is いつ (when) or なんじ (what time); SudachiDict reads it イツ or ナンドキ, which is never the clock time of today.
   It is なんじ only where the time of day is plain: 今(、/は/って) 何時, 何日の / 明日の 何時, 何時？ / 何時だ。 / 何時だと思ってる,
   何時くらい, 何時に + anything but なる / も / は (何時に寝た, but 何時になったら is いつ), 何時の便 / 電車, 何時から何時まで.
   何時でも is いつ. Everything else keeps the reading SudachiDict gave (何時も, 何時か, 何時まで, 何時頃 are JMdict words read いつ…).
   Also: 彼処 アスコ is あそこ (the reading the reader knows), 矢張 ヤバリ (逆転裁判's 矢張政志) is やはり, 一寸 before たり, or の + 虫 / 光陰 / 先 / 身, is
   いっすん (一寸たりとも), 出来 シュッタイ before an ending (料理出来なくない) is でき.
   SudachiDict already reads 何処 何故 其処 此処 一寸(adverb) 兎に角 矢張り 流石 呉々も 可笑しい 出来る 所謂 暫く 勿論 成程 一体 right.
   Checked on 10083 lines from 54 games (E:\MeguLit\data\original-text, every line with one of these words, 出来 lines sampled):
   263 tokens changed, none wrong (間→ま 7, 何時→なんじ 137, 何時→いつ 1, 矢張 112, 彼処 4, 一寸 1, 出来 1); the details are in
   validation/context-reading.test.cjs. */
const kanaOf = s => [...String(s || '')].map(c => { const n = c.codePointAt(0); return n >= 0x30a1 && n <= 0x30f6 ? String.fromCodePoint(n - 0x60) : c; }).join('');
const touches = (a, b) => !!a && !!b && (!Number.isInteger(a.end) || !Number.isInteger(b.start) || a.end === b.start);
const surf = t => String(t?.surface || '');
const fixed = t => !t || typeof t.surface !== 'string' || t.readingSource === 'name' || t.readingSource === 'number' || t.readingSource === 'game';

const RULES = [
  { surface: '生', from: 'なま', to: 'せい', when: (prev, next, after) => {
    const n = surf(next);
    /* an order is beer: 生をもう１つ, 生を一つ, 生をください */
    if (n === 'を' && /^(?:もう|一つ|ひとつ|二つ|ふたつ|[0-9０-９一二三]|ください|下さい|お願い|頼)/.test(surf(after))) return false;
    if (['を', 'に', 'へ'].includes(n)) return true;
    return ['が', 'は', 'も', 'と'].includes(n) && surf(prev) === 'の';
  } },
  { surface: '人気', from: 'にんき', to: 'ひとけ', when: (prev, next, after) =>
    surf(next) === 'の' && /^(?:な[いくかけ]|無[いくかけし]|少な|絶え|途絶え)/.test(surf(after)) },
  { surface: '彼処', from: 'あすこ', to: 'あそこ', alone: true, when: () => true },
  { surface: '矢張', from: 'やばり', to: 'やはり', alone: true, when: () => true },
  { surface: '一寸', from: 'ちょっと', to: 'いっすん', when: (prev, next, after) => surf(next) === 'たり' || (surf(next) === 'の' && /^(?:虫|光陰|先|身)/.test(surf(after))) },
  { surface: '出来', from: 'しゅったい', to: 'でき', when: (prev, next) => /^[なずまたてるれよそ]/.test(surf(next)) },
  { surface: '何', from: 'なん', to: 'なに', when: (prev, next) => ['助詞', '助動詞'].includes(next?.grammar?.[0]) && /^[\p{Script=Hiragana}]/u.test(surf(next)) && !/^[たちつてとだぢづでどなにぬねのん]/.test(surf(next)) && surf(next) !== 'か' },
  { surface: '言う', from: 'ゆう', to: 'いう', alone: true, when: () => true },
];

const DAYS = new Set(['何日', '明日', '今日', '昨日', '明後日', '今夜', '今晩']);
const RIDES = new Set(['便', '飛行機', '電車', '列車', 'バス', '新幹線']);
const ITSU = /^何時(?:か|まで|までも|頃|ごろ)?$/;

/* なんじ or いつ for 何時 (or a JMdict word starting with it) at i, '' where the words around do not tell */
function whatTime(tokens, i) {
  const token = tokens[i], next = tokens[i + 1], after = tokens[i + 2];
  const n = touches(token, next) ? surf(next) : '', a = n && touches(next, after) ? surf(after) : '';
  if (n === 'で' && a === 'も') return 'いつ';
  /* 今 何時, 今、何時, 今は何時, 今って、何時 */
  let k = i - 1, skipped = 0;
  while (k >= 0 && skipped < 2 && touches(tokens[k], tokens[k + 1]) && ['、', '，', ',', 'は', 'って'].includes(surf(tokens[k]))) { k--; skipped++; }
  const before = k >= 0 && touches(tokens[k], tokens[k + 1]) ? surf(tokens[k]) : '';
  if (before === '今' || before === 'いま') return 'なんじ';
  const p1 = i > 0 && touches(tokens[i - 1], token) ? surf(tokens[i - 1]) : '', p2 = p1 && i > 1 && touches(tokens[i - 2], tokens[i - 1]) ? surf(tokens[i - 2]) : '';
  if (p1 === 'の' && DAYS.has(p2)) return 'なんじ';
  if (p1 === 'から' && p2.startsWith('何時')) return 'なんじ';
  if (n === 'から' && a.startsWith('何時')) return 'なんじ';
  if (surf(token) !== '何時') return '';
  if (/^[？?！!ぃィー]/.test(n)) return 'なんじ';
  if (n === 'だ' && (!a || ['と', 'よ', 'っけ'].includes(a) || /^[？?！!。」…‥、]/.test(a))) return 'なんじ';
  if (['くらい', 'ぐらい', '位'].includes(n)) return 'なんじ';
  if (n === 'に' && a && !/^(?:な|も|は)/.test(a)) return 'なんじ';
  if (n === 'の' && RIDES.has(a)) return 'なんじ';
  /* ナンドキ is SudachiDict's noun 何時, the time; as 何時なの / 何時なんだ / 何時だろ it is the clock (何時だろうが is whenever) */
  if (kanaOf(token.reading) === 'なんどき' && (n === 'な' && /^[のん]/.test(a) || /^だろ/.test(n) && a !== 'が')) return 'なんじ';
  return '';
}

function contextReadings(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  const out = tokens.slice();
  /* the UniDic accent belonged to the old reading; speech estimates the new one */
  const set = (i, reading) => { if (kanaOf(out[i].reading) !== reading) out[i] = { ...out[i], reading, readingSource: 'context', pitch: [], lexeme: null, reading_ambiguous: false }; };
  for (let i = 0; i < out.length; i++) {
    const token = out[i];
    if (fixed(token) || token.readingSource === 'context') continue;
    if (ITSU.test(token.surface)) {
      const said = kanaOf(token.reading), stem = ['なんどき', 'なんじ', 'いつ'].find(r => said.startsWith(r))?.length ?? -1;
      const to = stem < 0 ? '' : whatTime(out, i);
      if (to) set(i, to + said.slice(stem));
      continue;
    }
    const rule = RULES.find(r => r.surface === token.surface && kanaOf(token.reading) === r.from);
    if (!rule) continue;
    const prev = out[i - 1], next = out[i + 1], after = out[i + 2];
    if (!rule.alone && (!touches(token, next) || (after && !touches(next, after) && rule.surface === '人気'))) continue;
    if (!rule.when(prev && touches(prev, token) ? prev : null, next, after)) continue;
    set(i, rule.to);
  }
  return out;
}

module.exports = { contextReadings };
