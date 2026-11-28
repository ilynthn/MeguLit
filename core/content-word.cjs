// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 排行榜「新收录单词」 counts only content words (owner said: 「は是个啥单词」, the week's big word was the particle は). One rule for
   every caller (services/leaderboard.cjs: the per-period word count, the lookups sent to the hot-word board, the word shown in the
   middle of the board):
   - a word counts when it is a noun, verb, い-adjective, な-adjective or adverb, by its part of speech from the tokenizer the reader
     uses (SudachiDict Full via core/learning-native.cjs tokenize_text) or, for a saved word, the JMdict entry it was saved from;
   - it is counted by its dictionary form (食べた, 食べて and 食べる are one word);
   - never: particles, auxiliaries, copulas (は, が, を, です, ます), pronouns, conjunctions, interjections and fillers (ああ, ええ),
     prefixes, suffixes, counters and numbers, a single kana, punctuation and symbols, and the very common words in STOPWORDS.
   Without a tokenizer (SudachiDict not installed) a looked-up surface is kept only when it is not one of those by the fallback
   checks below (single kana, symbols, FUNCTION_WORDS, STOPWORDS); its part of speech is then unknown, never guessed. */

const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '形状詞', '副詞']);
// SudachiDict sub-classes of a content part of speech that are not words a learner collects
const NOT_CONTENT = new Set(['数詞']);
// The most common verbs and formal nouns: words every learner knows, which would otherwise top every week.
const STOPWORDS = new Set([
  'する', '為る', 'ある', '有る', '在る', 'いる', '居る', 'なる', '成る', 'おる', 'できる', '出来る', 'くる', '来る', 'いく', '行く', 'ゆく', 'やる', 'みる', 'しまう', 'おく', 'くれる', 'もらう', 'いう', '言う', 'ない', '無い', 'いい', '良い', 'よい',
  'こと', '事', 'もの', '物', 'ところ', '所', 'よう', '様', 'ため', '為', 'わけ', '訳', 'はず', '筈', 'とき', '時', 'ほう', '方', 'そう', 'こう', 'どう', 'ああ', 'まま', 'うち', 'ほか', 'つもり', 'みたい', 'くらい', 'ぐらい', 'ほど', 'だけ', 'まだ', 'もう', 'また', 'とても', 'ちょっと'
]);
// Particles, auxiliaries and fillers recognised when no tokenizer is available (the tokenizer's part of speech decides otherwise).
const FUNCTION_WORDS = new Set([
  'は', 'が', 'を', 'に', 'へ', 'と', 'で', 'や', 'の', 'も', 'か', 'ね', 'よ', 'な', 'さ', 'わ', 'ぞ', 'ぜ', 'から', 'まで', 'より', 'ので', 'のに', 'けど', 'けれど', 'けれども', 'しか', 'でも', 'って', 'ても', 'では', 'には', 'とは', 'のは', 'など', 'ばかり', 'こそ', 'さえ',
  'です', 'ます', 'だ', 'た', 'て', 'ない', 'ぬ', 'う', 'よう', 'らしい', 'でした', 'ました', 'でしょう', 'だろう', 'じゃ', 'じゃない', 'ません', 'たい', 'れる', 'られる', 'せる', 'させる',
  'ええ', 'うん', 'はい', 'いいえ', 'ああ', 'おお', 'えっ', 'あっ', 'えー', 'あー', 'うーん', 'へえ', 'ほら', 'さあ', 'まあ', 'ねえ', 'おい', 'あの', 'その', 'この', 'どの', 'これ', 'それ', 'あれ', 'どれ'
]);
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々]/u;
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;

/* A string that can never be a content word: empty, one kana, no Japanese letter (numbers, symbols, punctuation, Latin). */
function unusable(text) {
  const t = String(text || '').normalize('NFKC').trim(), chars = [...t];
  if (!chars.length || !JAPANESE.test(t)) return true;
  if (chars.length === 1 && KANA_ONLY.test(t)) return true;
  return chars.some(ch => ch !== 'ー' && /[\p{P}\p{S}\p{N}\s]/u.test(ch));
}
const stop = lemma => STOPWORDS.has(lemma);
const blank = t => !String(t?.surface || '').trim() || t?.pos === '空白';
const content = t => CONTENT_POS.has(t?.pos || t?.grammar?.[0]) && !NOT_CONTENT.has(t?.grammar?.[1]);
const lemmaOf = t => String(t?.base_form || t?.normalized || t?.surface || '').trim();

/* One looked-up term and its tokens (tokenize_text of that term alone) → its dictionary form, or '' when it is not a content word.
   A term the tokenizer reads as one content word plus endings (食べ｜た, 言っ｜て｜た, 静か｜な) is that word; a term of two or more
   content words (気がつく, 胸が痛い) is kept as written: the hot-word board files it under 短语 by itself. */
function lookupLemma(term, tokens) {
  const text = String(term || '').normalize('NFKC').trim();
  if (unusable(text)) return '';
  if (!Array.isArray(tokens)) return FUNCTION_WORDS.has(text) || stop(text) ? '' : text;
  const words = tokens.filter(t => !blank(t)), heads = words.filter(content);
  if (!heads.length) return '';
  if (heads.length > 1) return text;
  const lemma = lemmaOf(heads[0]);
  return unusable(lemma) || stop(lemma) ? '' : lemma;
}

const JMDICT_CONTENT = [/^noun\b/i, /\bverb\b/i, /^adjective \(keiyoushi\)/i, /adjectival nouns? or quasi-adjectives/i, /^adverb\b/i, /^'taru' adjective/i, /^noun or participle which takes the aux\. verb suru/i];
const JMDICT_NOT = [/auxiliary/i, /copula/i, /^particle/i, /^pronoun/i, /^conjunction/i, /^interjection/i, /^prefix/i, /^suffix/i, /^counter/i, /^numeric/i, /^expressions/i, /^noun, used as a (?:suffix|prefix)/i, /^pre-noun adjectival/i];
/* A JMdict part-of-speech list (entry.pos): true when one of its tags is a content word's; null when there is none to go by. */
function jmdictContent(pos) {
  const tags = (Array.isArray(pos) ? pos : []).map(String).filter(Boolean);
  if (!tags.length) return null;
  return tags.some(p => JMDICT_CONTENT.some(re => re.test(p)) && !JMDICT_NOT.some(re => re.test(p)));
}

/* A saved word (vocabulary row: spelling, original.entry.pos when it was saved from the reader) → its dictionary form, or ''.
   tokens: tokenize_text of the spelling, used when the row carries no JMdict part of speech (Anki or account imports). */
function savedLemma(spelling, pos, tokens) {
  const text = String(spelling || '').normalize('NFKC').trim();
  if (unusable(text) || stop(text) || FUNCTION_WORDS.has(text)) return '';
  const byEntry = jmdictContent(pos);
  if (byEntry !== null) return byEntry ? text : '';
  if (Array.isArray(tokens)) { const words = tokens.filter(t => !blank(t)); return words.some(content) ? text : ''; }
  return text;
}

/* 每周热词's three lists (the relay files every term with this; the app reads only 词汇 as words): 短句 has sentence punctuation or
   runs past 12 characters, 短语 is 4+ characters with a pause or a particle between words, the rest is 词汇. */
function hotCategory(term) {
  const text = String(term || ''), length = [...text].length;
  if (/[。！？!?…]/.test(text) || length > 12) return 'sentence';
  if (length >= 4 && (/[、 ]/.test(text) || /[㐀-鿿゠-ヿ][をにがはでとのもへ][぀-ヿ㐀-鿿]/.test(text))) return 'phrase';
  return 'word';
}

module.exports = { hotCategory, lookupLemma, savedLemma, jmdictContent, unusable, STOPWORDS, FUNCTION_WORDS, CONTENT_POS };
