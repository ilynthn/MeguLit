'use strict';
/* Words whose reading SudachiDict cannot tell from the word alone, read from the words around them (readingSource 'context').
   Run in LocalLearning.tokenize, so furigana, the speech button and lookup share the reading.

   生 (#1123, user 2026-11-24: 生に縋ろう annotated なまにすがろう, it is せいにすがろう): SudachiDict gives the lone noun 生
   its 形状詞 reading ナマ everywhere. Life (せい) is the noun taking を / に / へ (生を受ける, 生に縋る, 生への執着), or が / は / も /
   と after の (人の生は短い). Raw (なま) is 生で, 生の + noun (生の声), an order (生をもう１つ), a compound (生ビール, one token) and every other place.
   Checked on 3522 game lines with these patterns: 52 of 53 生 changes right (the order above was the one wrong).
   人気 (ひとけ): のない / の無い / の少ない / の絶えた is the presence of people (人気のない廊下); 人気がない stays にんき (not popular).
   Only these patterns: a rule that guesses more turns right readings wrong. */
const kanaOf = s => [...String(s || '')].map(c => { const n = c.codePointAt(0); return n >= 0x30a1 && n <= 0x30f6 ? String.fromCodePoint(n - 0x60) : c; }).join('');
const touches = (a, b) => !!a && !!b && (!Number.isInteger(a.end) || !Number.isInteger(b.start) || a.end === b.start);
const surf = t => String(t?.surface || '');

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
];

function contextReadings(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  return tokens.map((token, i) => {
    if (!token || typeof token.surface !== 'string' || token.readingSource === 'name' || token.readingSource === 'number' || token.readingSource === 'game') return token;
    const rule = RULES.find(r => r.surface === token.surface && kanaOf(token.reading) === r.from);
    if (!rule) return token;
    const prev = tokens[i - 1], next = tokens[i + 1], after = tokens[i + 2];
    if (!touches(token, next) || (after && !touches(next, after) && rule.surface === '人気')) return token;
    if (!rule.when(prev && touches(prev, token) ? prev : null, next, after)) return token;
    /* the UniDic accent belonged to the old reading; speech estimates the new one */
    return { ...token, reading: rule.to, readingSource: 'context', pitch: [], lexeme: null, reading_ambiguous: false };
  });
}

module.exports = { contextReadings };
