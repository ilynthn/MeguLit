'use strict';
/* Readings of numbers and number + counter (10分, 三百本, 4人).
   SudachiDict gives each token its reading on its own: 分 is always フン, and Arabic numerals are read digit by digit
   (10 = イチレイ, 34 = サンヨン), so 10分 was annotated 10ふん (user, 2026-11-23). The number is read here from its value,
   and the counter takes the sound change of the number's last part (いっぷん, さんぼん, ろっぴゃっぽん). */

const DIGITS = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const SMALL = { '十': 10, '百': 100, '千': 1000 };
const LARGE = { '万': 1e4, '億': 1e8 };

/* Value of 10, １０, 1,000, 三百, 二〇二六, 2万5千. null when it is not a plain whole number: 〇〇 is a placeholder (〇〇さん),
   adjacent kanji digits are an estimate (二三日 にさんにち, 四五人), and 万 or 億 with no number before it is 数万 or 何億. */
function parseNumber(text) {
  const s = String(text || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，](?=\d{3})/g, '');
  if (!s || s.length > 16 || /^[〇零]+$/.test(s)) return null;
  if (/^\d+$/.test(s)) { const n = Number(s); return /^0\d/.test(s) || n >= 1e12 ? null : n; }
  // Positional kanji (二〇二六) has no unit characters and a zero in it.
  if (/^[一二三四五六七八九][〇零一二三四五六七八九]*[〇零][〇零一二三四五六七八九]*$/.test(s)) return Number([...s].map(c => DIGITS[c]).join(''));
  let total = 0, section = 0, digit = null;
  for (const c of s) {
    if (/\d/.test(c) || c in DIGITS) { if (digit !== null && !/\d/.test(c)) return null; digit = (digit !== null ? digit * 10 : 0) + (/\d/.test(c) ? Number(c) : DIGITS[c]); }
    else if (c in SMALL) { section += (digit === null ? 1 : digit) * SMALL[c]; digit = null; }
    else if (c in LARGE) { if (!section && digit === null) return null; total += (section + (digit || 0)) * LARGE[c]; section = 0; digit = null; }
    else return null;
  }
  const n = total + section + (digit || 0);
  return Number.isSafeInteger(n) && n < 1e12 ? n : null;
}

/* Kanji digits written in place without a zero (一五歳 is 15) count only before a counter, and two neighbouring digits do
   not: 二三日 and 四五人 are an estimate (so is 一二度, while 一二歳 for 12 then reads いちに). */
function placed(text) {
  if (!/^[一二三四五六七八九][一二三四五六七八九]+$/.test(String(text || ''))) return null;
  const d = [...text].map(c => DIGITS[c]);
  return d.length === 2 && d[1] === d[0] + 1 ? null : Number(d.join(''));
}

const ONES = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
const HUNDREDS = ['', 'ひゃく', 'にひゃく', 'さんびゃく', 'よんひゃく', 'ごひゃく', 'ろっぴゃく', 'ななひゃく', 'はっぴゃく', 'きゅうひゃく'];
const THOUSANDS = ['', 'せん', 'にせん', 'さんぜん', 'よんせん', 'ごせん', 'ろくせん', 'ななせん', 'はっせん', 'きゅうせん'];

/* The reading split into the part before the last element and that element, whose kind decides the counter's sound
   change: a digit 1–9 ('1'…'9'), or a unit when the lower places are zero ('10', '100', '1000', '万', '億'). */
function numberParts(n) {
  if (n === 0) return { head: '', tail: 'ぜろ', kind: '0' };
  const words = [];
  const below10000 = v => {
    const th = Math.floor(v / 1000), h = Math.floor(v / 100) % 10, t = Math.floor(v / 10) % 10, o = v % 10;
    if (th) words.push([THOUSANDS[th], '1000']);
    if (h) words.push([HUNDREDS[h], '100']);
    if (t) words.push([(t === 1 ? '' : ONES[t]) + 'じゅう', '10']);
    if (o) words.push([ONES[o], String(o)]);
  };
  // 一万 and 一億 keep いち (the ones place of the group); a bare 千 and 百 do not take it.
  const oku = Math.floor(n / 1e8), man = Math.floor(n / 1e4) % 1e4, rest = n % 1e4;
  if (oku) { below10000(oku); words.push(['おく', '億']); }
  if (man) { below10000(man); words.push(['まん', '万']); }
  if (rest) below10000(rest);
  const last = words.pop();
  return { head: words.map(w => w[0]).join(''), tail: last[0], kind: last[1] };
}

function readNumber(n) { const p = numberParts(n); return p.head + p.tail; }

/* gem: last-element kinds that become a small っ before the counter, with the counter's form after it.
   nasal: the counter's form after さん / せん / まん (三本 さんぼん); four: whether よん takes it too (四分 よんぷん).
   numbers: the forms 4, 7 and 9 take before this counter. exact: whole-number readings. */
const H = '1,6,8,10,100', K = '1,6,8,10,100', ST = '1,8,10';
const COUNTERS = {
  '分': { base: 'ふん', gem: [H, 'ぷん'], nasal: 'ぷん', four: true },
  '本': { base: 'ほん', gem: [H, 'ぽん'], nasal: 'ぼん' },
  '匹': { base: 'ひき', gem: [H, 'ぴき'], nasal: 'びき' },
  '杯': { base: 'はい', gem: [H, 'ぱい'], nasal: 'ばい' },
  '発': { base: 'はつ', gem: [H, 'ぱつ'], nasal: 'ぱつ' },
  '泊': { base: 'はく', gem: [H, 'ぱく'], nasal: 'ぱく' },
  '歩': { base: 'ほ', gem: [H, 'ぽ'], nasal: 'ぽ' },
  '品': { base: 'ひん', gem: [H, 'ぴん'], nasal: 'ぴん' },
  '個': { base: 'こ', gem: [K, 'こ'] },
  '回': { base: 'かい', gem: [K, 'かい'] },
  '階': { base: 'かい', gem: [K, 'かい'], nasal: 'がい' },
  '軒': { base: 'けん', gem: [K, 'けん'], nasal: 'げん' },
  '件': { base: 'けん', gem: [K, 'けん'] },
  'ヶ月': { base: 'かげつ', gem: [K, 'かげつ'] }, 'か月': { base: 'かげつ', gem: [K, 'かげつ'] },
  'カ月': { base: 'かげつ', gem: [K, 'かげつ'] }, 'ケ月': { base: 'かげつ', gem: [K, 'かげつ'] }, '箇月': { base: 'かげつ', gem: [K, 'かげつ'] },
  '歳': { base: 'さい', gem: [ST, 'さい'], exact: { 20: 'はたち' } },
  '才': { base: 'さい', gem: [ST, 'さい'] },
  '冊': { base: 'さつ', gem: [ST, 'さつ'] },
  '足': { base: 'そく', gem: [ST, 'そく'], nasal: 'ぞく' },
  '点': { base: 'てん', gem: [ST, 'てん'] },
  '頭': { base: 'とう', gem: [ST, 'とう'] },
  '通': { base: 'つう', gem: [ST, 'つう'] },
  '秒': { base: 'びょう' }, '枚': { base: 'まい' }, '台': { base: 'だい' }, '度': { base: 'ど' }, '番': { base: 'ばん' },
  '倍': { base: 'ばい' }, '名': { base: 'めい' }, '割': { base: 'わり' }, '話': { base: 'わ' },
  '週間': { base: 'しゅうかん', gem: [ST, 'しゅうかん'] },
  '円': { base: 'えん', numbers: { 4: 'よ' } },
  '年': { base: 'ねん', numbers: { 4: 'よ' } },
  '人': { base: 'にん', numbers: { 4: 'よ' }, exact: { 1: 'ひとり', 2: 'ふたり' } },
  '時': { base: 'じ', numbers: { 4: 'よ', 7: 'しち', 9: 'く' } },
  '時間': { base: 'じかん', numbers: { 4: 'よ', 7: 'しち', 9: 'く' } },
  '月': { base: 'がつ', numbers: { 4: 'し', 7: 'しち', 9: 'く' }, only: n => n >= 1 && n <= 12 },
  // The native count: SudachiDict reads 六つ むいつ.
  'つ': { base: 'つ', only: n => n >= 1 && n <= 9, exact: { 1: 'ひとつ', 2: 'ふたつ', 3: 'みっつ', 4: 'よっつ', 5: 'いつつ', 6: 'むっつ', 7: 'ななつ', 8: 'やっつ', 9: 'ここのつ' } },
  /* 一日 is いちにち or ついたち by meaning: ついたち only right after a month (numberTokens). */
  '日': { base: 'にち', numbers: { 7: 'しち', 9: 'く' }, lastFour: 'よっか', exact: { 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか', 20: 'はつか' } },
};
/* The last element with a small っ: いち いっ, ろく ろっ, はち はっ, (に)じゅう (に)じゅっ, (さんび)ゃく (さんび)ゃっ. */
function geminated(tail, kind) {
  if (kind === '10') return tail.replace(/じゅう$/, 'じゅっ');
  if (kind === '100') return tail.replace(/く$/, 'っ');
  return { 1: 'いっ', 6: 'ろっ', 8: 'はっ' }[kind] || '';
}

/* Reading of number + counter, or '' when the counter is not one handled here. 十分 stays with the dictionary:
   it is usually じゅうぶん (enough), not ten minutes. */
function counterReading(numberText, counter) {
  const rule = COUNTERS[counter], n = parseNumber(numberText);
  // 日間 is the day count and かん: 三日間 みっかかん, 十日間 とおかかん.
  if (counter === '日間') { const days = counterReading(numberText, '日'); return days && days + 'かん'; }
  if (!rule || n === null || (numberText === '十' && counter === '分') || (rule.only && !rule.only(n))) return '';
  if (rule.exact?.[n]) return rule.exact[n];
  const { head, tail, kind } = numberParts(n);
  if (rule.lastFour && kind === '4') return head + rule.lastFour;
  if (rule.gem && rule.gem[0].split(',').includes(kind)) {
    const stem = geminated(tail, kind);
    if (stem) return head + stem + rule.gem[1];
  }
  if (rule.nasal && (kind === '3' || kind === '1000' || kind === '万' || (rule.four && kind === '4'))) return head + tail + rule.nasal;
  const digit = Number(kind);
  if (rule.numbers?.[digit] && /^[1-9]$/.test(kind)) return head + rule.numbers[digit] + rule.base;
  return head + tail + rule.base;
}

/* Tokens with numbers read by value and a number + counter joined into one word (readingSource 'number'), so furigana,
   the speech button and cards share one reading. The pieces stay as subtokens for dictionary lookup; the UniDic accent of
   the pieces does not fit the word, so speech estimates it. A numeral is a 数詞 token, or plain digits without part of
   speech. Tokens already read here pass through unchanged. A kanji numeral without a counter keeps the tokenizer's
   reading, which knows the native counts (六つ むっつ, 三日月 みかづき). */
const isNumeral = t => typeof t?.surface === 'string' && t.readingSource !== 'name' && t.readingSource !== 'game' && (Array.isArray(t.grammar) ? t.grammar[1] === '数詞' : /^[0-9０-９,，]+$/.test(t.surface)) && parseNumber(t.surface) !== null;
function numberTokens(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  const out = [];
  const zero = t => /^[〇零]$/.test(t?.surface || '') && t?.grammar?.[1] === '数詞';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], next = tokens[i + 1];
    // A score or a match-up: SudachiDict reads ０対２ and 5対5 with 対 as the pair counter ツイ (一対の).
    if (token?.surface === '対' && (isNumeral(tokens[i - 1]) || zero(tokens[i - 1])) && (isNumeral(next) || zero(next))) { out.push({ ...token, reading: 'たい', pitch: [], lexeme: null, readingSource: 'number' }); continue; }
    const plain = isNumeral(token), value = plain ? parseNumber(token.surface) : token?.grammar?.[1] === '数詞' ? placed(token.surface) : null;
    if (value === null || token.readingSource === 'number') { out.push(token); continue; }
    const touching = typeof next?.surface === 'string' && next.readingSource !== 'game' && (!Number.isInteger(token.end) || token.end === next.start);
    /* 分 of a fraction or a tenth is ぶ: 3分の1 さんぶんのいち, 八分咲き はちぶざき. */
    const after = tokens[i + 2], tenth = touching && next.surface === '分' && (after?.surface === 'の' && isNumeral(tokens[i + 3]) ? 'ぶん' : /^咲/.test(after?.surface || '') ? 'ぶ' : '');
    /* The first of a month (四月一日, 4月1日) is ついたち; 一日 on its own or after a month-count (1ヶ月1日) stays いちにち. */
    const last = out[out.length - 1], isMonth = last?.readingSource === 'number' && (Array.isArray(last.subtokens) && last.subtokens.length > 1 ? last.subtokens[1]?.surface === '月' : /月$/.test(last.surface || '') && !/[ヶヵかカケ箇個]月$/.test(last.surface || ''));
    const firstOfMonth = touching && next.surface === '日' && value === 1 && isMonth && (!Number.isInteger(last.end) || last.end === token.start);
    const joined = firstOfMonth ? 'ついたち' : tenth ? readNumber(value) + tenth : touching ? counterReading(plain ? token.surface : String(value), next.surface) : '';
    if (!joined && !(plain && /[0-9０-９〇零]/.test(token.surface))) { out.push(token); continue; }
    if (joined) {
      const word = token.surface + next.surface;
      out.push({ ...token, surface: word, reading: joined, base_form: word, normalized: word, end: Number.isInteger(next.end) ? next.end : token.end,
        pitch: [], lexeme: null, reading_ambiguous: false, subtokens: [token, next], readingSource: 'number' });
      i++; continue;
    }
    out.push({ ...token, reading: readNumber(value), pitch: [], lexeme: null, readingSource: 'number' });
  }
  return out;
}

module.exports = { parseNumber, readNumber, counterReading, numberTokens, COUNTERS };
