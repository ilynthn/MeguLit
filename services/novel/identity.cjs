// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

function isbnOf(value) {
  const code = String(value || '').normalize('NFKC').trim()
    .replace(/^(?:urn:)?isbn(?:-1[03])?\s*[:：]?\s*/i, '').replace(/[\s\p{Pd}]/gu, '').toUpperCase();
  const digit = (body, index) => Number(body[index]) * (index % 2 ? 3 : 1);
  const check = body => (10 - [...body].reduce((sum, _, index) => sum + digit(body, index), 0) % 10) % 10;
  if (/^97[89]\d{10}$/.test(code)) return check(code.slice(0, -1)) === Number(code.at(-1)) ? code : '';
  if (!/^\d{9}[\dX]$/.test(code)) return '';
  const sum = [...code].reduce((total, char, index) => total + (char === 'X' ? 10 : Number(char)) * (10 - index), 0);
  if (sum % 11) return '';
  const body = '978' + code.slice(0, 9);
  return body + check(body);
}

const letters = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function chineseNumber(value) {
  const digits = '零一二三四五六七八九';
  const normalized = value.replace(/〇/g, '零').replace(/[两兩]/g, '二');
  if (!/[十百]/.test(normalized)) return Number([...normalized].map(char => digits.indexOf(char)).join(''));
  let total = 0;
  let digit = 0;
  for (const char of normalized) {
    if (char === '十' || char === '百') { total += (digit || 1) * (char === '十' ? 10 : 100); digit = 0; }
    else digit = digits.indexOf(char);
  }
  return total + digit;
}

function titleParts(value) {
  const title = String(value || '').normalize('NFKC').trim()
    .replace(/^(?:\[[^\]]+\]\s*)+/u, '')
    .replace(/\s*\([^()]*(?:文庫|版)[^()]*\)\s*$/u, '')
    .replace(/\s+[\p{L}\p{M}]{2,18}文庫(?:\s+.*)?$/u, '')
    .replace(/\s+/g, ' ').trim();
  const volume = /^(.*?)(?:\s*(?:第|巻|卷|卷[. ]*|巻[. ]*|vol\.?|volume|#)\s*|\s+|(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}。])\s*)(\d+(?:\.\d+)?)\s*[巻卷册冊]?$/iu.exec(title);
  if (volume?.[1].trim()) return { title, base: volume[1].trim(), volume: Number(volume[2]) };
  const ordinal = /^(.+?)第\s*([零〇一二两兩三四五六七八九十百]{1,6})\s*[巻卷册冊]$/u.exec(title);
  return ordinal ? { title, base: ordinal[1].trim(), volume: chineseNumber(ordinal[2]) } : { title, base: title, volume: null };
}

function similarity(a, b) {
  if (a === b) return a ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = name => Array.from({length: name.length - 1}, (_, index) => name.slice(index, index + 2));
  const right = pairs(b);
  let matched = 0;
  for (const pair of pairs(a)) {
    const index = right.indexOf(pair);
    if (index === -1) continue;
    right.splice(index, 1);
    matched++;
  }
  return 2 * matched / (a.length + b.length - 2);
}

function bestMatch(book, candidates, aliases = []) {
  const knownIsbn = isbnOf(book.isbn);
  const known = [book.title, ...aliases].filter(Boolean).map(titleParts);
  const volume = known[0]?.volume;
  const author = letters(book.author);
  let winner;
  for (const candidate of candidates) {
    const candidateIsbn = isbnOf(candidate.isbn);
    const exactIsbn = Boolean(knownIsbn && knownIsbn === candidateIsbn);
    if (knownIsbn && candidateIsbn && !exactIsbn) continue;
    const labels = [candidate.title, candidate.alternate].filter(Boolean).map(titleParts);
    const candidateVolume = candidate.volume != null && candidate.volume !== '' && Number.isFinite(Number(candidate.volume))
      ? Number(candidate.volume) : labels.find(label => label.volume != null)?.volume;
    if (!exactIsbn && volume != null && volume !== candidateVolume) continue;
    const titleScore = Math.max(0, ...known.flatMap(name => labels.map(label => similarity(letters(name.base), letters(label.base)))));
    const candidateAuthor = letters(candidate.author);
    const authorMatch = author.length >= 2 && candidateAuthor.length >= 2 &&
      (author.includes(candidateAuthor) || candidateAuthor.includes(author));
    if (!exactIsbn && titleScore < (authorMatch ? 0.72 : 0.86)) continue;
    const exactTitle = known.some(name => labels.some(label => letters(name.title) === letters(label.title)));
    const score = exactIsbn ? 2 + titleScore : titleScore + (authorMatch ? 0.15 : 0) + (exactTitle ? 0.05 : 0);
    if (!winner || score > winner.matchScore) winner = { ...candidate, matchScore: score };
  }
  return winner;
}

module.exports = { isbnOf, titleParts, bestMatch, similarity };
