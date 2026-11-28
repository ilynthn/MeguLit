// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { createHash } = require('node:crypto');
const { isbnOf, titleParts } = require('./identity.cjs');

const key = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function languageOf(value) {
  const name = String(value?.language || value?.languages || '').trim().toLowerCase();
  if (/^(?:ja|jpn|japanese|日本語|日文|日语|日語)(?:[-_ ]|$)/i.test(name)) return 'ja';
  if (/^(?:zh|zho|chi|cmn|chinese|中文|简体中文|繁體中文)(?:[-_ ]|$)/i.test(name)) return 'zh';
  if (/^(?:en|eng|english|英文)(?:[-_ ]|$)/i.test(name)) return 'en';
  return /^[a-z]{2,3}(?:[-_][a-z]+)?$/.test(name) ? name.split(/[-_]/)[0] : '';
}

const digits = '零一二三四五六七八九';
function ordinal(value) {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const normalized = value.replace(/〇/g, '零').replace(/[两兩]/g, '二');
  if (!/十|百/u.test(normalized)) return Number([...normalized].map(char => digits.indexOf(char)).join(''));
  let sum = 0, last = 0;
  for (const char of normalized) {
    if (char === '十' || char === '百') { sum += (last || 1) * (char === '十' ? 10 : 100); last = 0; }
    else last = digits.indexOf(char);
  }
  return sum + last;
}

const special = /合本|全集|全\s*[零〇一二三四五六七八九十\d]+\s*[巻卷册冊]|套装|套裝|合订|合訂|合集|総集編|總集編|短編集|短篇集|外伝|外傳|外传|番外|前日譚|後日譚|特別編|特别篇|特別篇|アンソロジー|omnibus|anthology|box\s*set/iu;
const range = /(?:第|vol\.?|(?<=[\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]))\s*\d+\s*[-–〜～~]\s*\d+\s*[巻卷册冊]?$|(?:[巻卷册冊]|vol\.?)\s*\d+\s*[-–〜～~]\s*\d+/iu;

function label(value) {
  const raw = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const decoration = raw.replace(/\.(?:epub|pdf|txt)$/iu, '')
    .replace(/(?:\s*[([](?:電子書籍版|電子版|电子版|電子書籍|文庫版|精校版?|校对版|簡體中文版?|简体中文版?|繁體中文版?|繁体中文版?|中文版|日文版|日语版|日本語版|EPUB|PDF)\s*[)\]])+$/iu, '')
    .replace(/\s+(?:简体中文|繁體中文|繁体中文|中文版|日文版|日本語版)$/u, '').trim();
  const cleaned = titleParts(decoration);
  const title = cleaned.title;
  const compound = special.test(decoration) || range.test(decoration) ||
    /改訂版|改订版|修訂版|修订版|新装版|完全版|増補版|增订版|增補版|特装版|特裝版|豪華版|豪华版|典藏版/u.test(decoration);
  let part = '';
  let base = title;
  const fork = /^(.*?)(?:[ (]+|第)(上|中|下|前|後|后)(?:巻|卷|册|冊|編|篇)?\)?$/u.exec(title) ||
    /^(.*?)(上|中|下|前|後|后)(?:巻|卷|册|冊|編|篇)$/u.exec(title);
  if (fork?.[1].trim()) {
    base = fork[1].trim();
    part = fork[2].replace('后', '後');
  }
  const explicit = /^(.*?)(?:[ (]*(?:第|vol(?:ume)?\.?|[巻卷])\s*([零〇一二两兩三四五六七八九十百\d]+(?:\.\d+)?)\s*[巻卷册冊]?|[ (]*(\d+(?:\.\d+)?|[零〇一二两兩三四五六七八九十百]+)\s*[巻卷册冊])\)?$/iu.exec(base);
  const simple = titleParts(base);
  const numbered = explicit?.[1].trim() ? ordinal(explicit[2] || explicit[3]) : simple.volume != null && simple.volume <= 200 ? simple.volume : null;
  base = explicit?.[1].trim() || (numbered != null ? simple.base : base);
  return { name: base, title, key: key(base), full: key(title), raw: decoration.toLowerCase(), volume: numbered, part, compound };
}

const authorKey = value => key(String(value || '').normalize('NFKC').replace(/(?:著|著者|作者|原作)\s*$/u, ''));
function authorMatches(a, b) {
  return a && b && a === b;
}

function aliases(book, title) {
  return [book.alternate, ...(book.aliases || [])].filter(Boolean).map(label).filter(alias =>
    alias.key.length > 1 && !alias.compound && (alias.volume == null || alias.volume === title.volume) &&
    (!alias.part || alias.part === title.part)).map(alias => alias.key);
}

function identifiers(value) {
  const text = String(value || '');
  const parsed = [isbnOf(text), ...text.split(/[,;，；、/]+/u).map(isbnOf)];
  return [...new Set(parsed.filter(Boolean))];
}

function descriptor(book) {
  const title = label(book.title);
  return { title, lang: languageOf(book), isbns: identifiers(book.isbn), sourceIsbn: isbnOf(book.sourceIsbn),
    author: authorKey(book.author), aliases: aliases(book, title) };
}

function sameEdition(a, b) {
  if (!a.title.key || !b.title.key) return false;
  const exactIsbn = a.isbns.some(isbn => b.isbns.includes(isbn));
  if (a.title.volume !== b.title.volume || a.title.part !== b.title.part) return false;
  if (a.title.compound || b.title.compound) return exactIsbn && a.title.raw === b.title.raw;
  if (exactIsbn) return true;
  if (!a.lang || !b.lang) return false;
  if (a.sourceIsbn && b.isbns.includes(a.sourceIsbn) || b.sourceIsbn && a.isbns.includes(b.sourceIsbn)) return true;
  if (!authorMatches(a.author, b.author)) return false;
  if (a.lang === b.lang) return a.title.full === b.title.full && !(a.isbns.length && b.isbns.length);
  return a.title.key === b.title.key || a.aliases.includes(b.title.key) || b.aliases.includes(a.title.key) ||
    a.aliases.some(alias => b.aliases.includes(alias));
}

function groups(books) {
  const index = new Map();
  const output = [];
  for (const book of books) {
    const identity = descriptor(book);
    const keys = new Set([identity.title.key, ...identity.aliases,
      ...[...identity.isbns, identity.sourceIsbn].filter(Boolean).map(isbn => '#' + isbn)].filter(Boolean));
    const candidates = new Set([...keys].flatMap(value => [...(index.get(value) || [])]));
    const matches = [...candidates].filter(group => group.entries.every(entry => sameEdition(identity, entry.identity)));
    const group = matches.length === 1 ? matches[0] : { entries: [] };
    if (!group.entries.length) output.push(group);
    group.entries.push({ book, identity });
    for (const value of keys) {
      if (!index.has(value)) index.set(value, new Set());
      index.get(value).add(group);
    }
  }
  return output.map(group => [...group.entries].sort((a, b) => Number(b.identity.lang === 'ja') - Number(a.identity.lang === 'ja'))
    .map(entry => entry.book));
}

function withSharedAliases(books) {
  const titles = books.map(book => book.title);
  const originalTitle = books.find(book => languageOf(book) === 'ja')?.title;
  return books.map(book => ({ ...book, originalTitle: languageOf(book) !== 'ja' ? originalTitle : book.originalTitle,
    aliases: [...new Set([...(book.aliases || []), ...titles])].slice(0, 12) }));
}

function canonicalTitle(book) {
  const source = label(book.title);
  const original = label(book.originalTitle);
  if (source.compound) return String(book.title || '').normalize('NFKC').trim();
  if (!original.name || original.compound || (original.volume != null && original.volume !== source.volume) ||
      (original.part && original.part !== source.part)) return source.title;
  const numbered = source.volume == null || original.volume === source.volume ? '' : ' ' + source.volume;
  const part = source.part && !original.part ? ' ' + source.part + '巻' : '';
  return original.title + numbered + part;
}

function collections(books, metadata) {
  const candidates = new Map();
  for (const book of books) {
    const record = metadata.get(book.id);
    const identity = label(book.title);
    const author = authorKey(book.author || record?.author);
    if (!author || identity.compound || identity.part) continue;
    const series = record?.series || {};
    const title = series.title || identity.name;
    const volume = series.position ?? identity.volume;
    if (!title || volume == null || !Number.isFinite(volume)) continue;
    const seriesKey = [author, key(title)].join(':');
    if (!candidates.has(seriesKey)) candidates.set(seriesKey, { title, entries: [] });
    candidates.get(seriesKey).entries.push({ id: book.id, volume });
  }
  return [...candidates].flatMap(([identity, value]) => {
    if (new Set(value.entries.map(entry => entry.volume)).size < 2) return [];
    const id = 'collection-' + createHash('sha256').update(identity).digest('hex').slice(0, 16);
    return [{ id, title: value.title, books: value.entries.sort((a, b) => a.volume - b.volume).map(entry => entry.id) }];
  });
}

function attachEditionAliases(books) {
  const mapped = new Map(groups(books).filter(group => group.length > 1).flatMap(group => withSharedAliases(group))
    .map(book => [book.id, book]));
  return books.map(book => mapped.get(book.id) || book);
}

module.exports = { groups, languageOf, label, canonicalTitle, collections, identifiers, attachEditionAliases, withSharedAliases };
