// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { label, languageOf, identifiers } = require('./editions.cjs');

const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const common = { 見:'见', 憶:'忆', 記:'记', 書:'书', 聲:'声', 戀:'恋', 愛:'爱', 與:'与', 傳:'传', 異:'异',
  學:'学', 國:'国', 圖:'图', 図:'图', 館:'馆', 龍:'龙', 夢:'梦', 時:'时', 間:'间', 門:'门', 場:'场', 澤:'泽', 沢:'泽',
  關:'关', 関:'关', 灣:'湾', 陰:'阴', 陽:'阳', 稱:'称', 總:'总', 読:'读', 讀:'读' };

function searchKey(value) {
  return [...String(value || '').normalize('NFKC').toLowerCase()].map(char => common[char] || char)
    .join('').replace(/[^\p{L}\p{N}]/gu, '');
}

function names(record) {
  return [...new Set([record.title, record.alternate, ...(Array.isArray(record.aliases) ? record.aliases : [])]
    .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim().slice(0, 160)))];
}

function scoreName(name, term) {
  const text = searchKey(label(name).name || name);
  if (!text) return 0;
  if (text === term) return 10;
  if (text.includes(term)) return (text.startsWith(term) ? 6 : 4) + Math.min(1, term.length / text.length);
  if (text.length >= 3 && term.includes(text)) return 2 + text.length / term.length;
  return 0;
}

function choose(query, records) {
  const anchor = label(query);
  const term = searchKey(anchor.name || query);
  const results = new Map();
  for (const record of records) {
    const entries = names(record);
    const matched = entries.map(name => [name, scoreName(name, term)]).sort((a, b) => b[1] - a[1])[0];
    if (!matched?.[1]) continue;
    for (const isbn of identifiers(record.isbn)) {
      if (!isbn.startsWith('9784')) continue;
      const score = matched[1] + 1;
      if (!results.has(isbn) || results.get(isbn).score < score) results.set(isbn, { name: isbn, score });
    }
    for (const alias of entries) {
      if (searchKey(alias) === searchKey(query)) continue;
      const edition = label(alias);
      if (anchor.volume != null && edition.volume != null && edition.volume !== anchor.volume) continue;
      const series = edition.name && edition.name !== alias.normalize('NFKC').trim() ? edition.name : alias;
      const name = (anchor.volume == null ? series : edition.volume == null ?
        series + ' ' + anchor.volume : alias).slice(0, 160);
      const crossLanguage = Number(kana.test(name) !== kana.test(query));
      const score = matched[1] + crossLanguage * 3 + (name === record.title && languageOf(record) === 'ja' ? .5 : 0);
      const key = searchKey(name);
      if (key && key !== searchKey(query) && (!results.has(key) || results.get(key).score < score)) results.set(key, { name, score });
    }
  }
  return [...results.values()].sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.name);
}

async function expand(query, { root, db, books = [], bangumi, wiki } = {}) {
  const term = searchKey(query);
  if (term.length < 2 || !cjk.test(query)) return [];
  const local = db ? require('./library.cjs').searchEditionRecords(db, root) : [];
  const records = [...local, ...books];
  const known = choose(query, records);
  if (known.some(name => kana.test(name) !== kana.test(query) || /^9784\d{9}$/.test(name))) return known;
  const extra = await Promise.allSettled([bangumi?.(label(query).name || query), wiki?.(label(query).name || query)]);
  for (const result of extra) if (result.status === 'fulfilled' && Array.isArray(result.value)) records.push(...result.value);
  return choose(query, records);
}

async function wikiAliases(query, read) {
  const japanese = kana.test(query);
  const host = japanese ? 'ja.wikipedia.org' : 'zh.wikipedia.org';
  const language = japanese ? 'zh' : 'ja';
  const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: query.replace(/[|\r\n]/g, ' '),
    gsrnamespace: '0', gsrlimit: '5', prop: 'langlinks', lllang: language, lllimit: '1', format: 'json', formatversion: '2' });
  const data = await read('https://' + host + '/w/api.php?' + params);
  return (data?.query?.pages || []).flatMap(page => {
    const title = String(page.title || '').replace(/\s*\((?:小説|小说|ライトノベル|輕小說|轻小说)\)$/u, '');
    const linked = page.langlinks?.[0]?.title;
    return title && linked ? [{ title, alternate: linked }] : [];
  });
}

module.exports = { expand, wikiAliases, searchKey };
