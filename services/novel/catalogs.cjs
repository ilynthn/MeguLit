// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { decodeEntities } = require('./parse-epub.cjs');
const { isbnOf: isbn } = require('./identity.cjs');

const ndl = 'https://ndlsearch.ndl.go.jp';
const openLibrary = 'https://openlibrary.org';
const text = (value, limit = 250) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const description = (value, limit = 250) => text(decodeEntities(String(value || '').replace(/<[^>]+>/g, '')), limit);
const list = value => Array.isArray(value) ? value : [];

function ndlRecords(xml) {
  if (!/<rss[\s>]/i.test(xml)) throw Error('NOVEL_ONLINE_RESPONSE');
  const records = new Map();
  for (const [, item] of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const values = name => [...item.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi'))]
      .map(([, value]) => description(value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1'), name === 'description' ? 2000 : 250))
      .filter(Boolean);
    const recordId = [...values('link'), ...values('guid')].map(url => {
      const match = /^https?:\/\/(ndlsearch|iss)\.ndl\.go\.jp\/books\/(R\d{9}-[A-Z\d-]+)(?:[/?#].*)?$/i.exec(url);
      return match?.[1] === 'iss' ? match[2].replace(/-00$/, '') : match?.[2];
    }).find(Boolean);
    const title = values('title')[0] || values('dc:title')[0];
    if (!recordId || !title) continue;
    const volume = values('dcndl:volume')[0];
    const displayTitle = volume && !title.endsWith(` ${volume}`) ? `${title} ${volume}` : title;
    const isbnFields = [...item.matchAll(/<dc:identifier\s[^>]*\w+:ISBN["'][^>]*>([^<]+)<\/dc:identifier>/gi)];
    records.set(recordId, {
      recordId, title: displayTitle, author: [...new Set(values('dc:creator'))].join('、'),
      publisher: values('dc:publisher').join('、'), date: values('dc:date')[0] || values('dcterms:issued')[0],
      isbn: isbnFields.map(([, value]) => isbn(decodeEntities(value))).find(Boolean) || '', volume,
      url: `${ndl}/books/${recordId}`
    });
  }
  return [...records.values()];
}

async function searchNdl(source, query) {
  const number = isbn(query);
  const params = new URLSearchParams({ dpid: 'iss-ndl-opac', cnt: '12', [number ? 'isbn' : 'title']: number || query });
  const xml = await source.request(`${ndl}/api/opensearch?${params}`, { headers: { Accept: 'application/rss+xml' } });
  return ndlRecords(xml);
}

function openLibraryRecords(response, number) {
  return list(response.docs).flatMap(work => {
    const workId = /^(?:\/works\/)?(OL\d+W)$/.exec(work.key)?.[1];
    if (!workId || !work.title) return [];
    const edition = work.editions?.docs?.[0];
    const editionId = /^\/books\/(OL\d+M)$/.exec(edition?.key)?.[1];
    const editionIsbns = list(edition?.isbn).map(isbn).filter(Boolean);
    if (number && (!editionId || !editionIsbns.includes(number))) return [];
    const recordId = editionId || workId;
    const votes = Math.max(0, Math.trunc(Number(work.ratings_count) || 0));
    const score = Number(work.ratings_average);
    return [{
      recordId, workId, title: text(edition?.title || work.title),
      author: text(list(work.author_name).join('、')), publisher: text(list(edition?.publisher).join('、')),
      date: text(String(list(edition?.publish_date)[0] || text(edition?.publish_date) || work.first_publish_year || ''), 40),
      isbn: number || editionIsbns[0] || '',
      edition: Boolean(editionId), score: votes && score > 0 && score <= 5 ? Math.round(score * 10) / 10 : null,
      votes, scale: 5, url: `${openLibrary}/${editionId ? 'books' : 'works'}/${recordId}`,
      coverUrl: Number(work.cover_i) > 0 ? `https://covers.openlibrary.org/b/id/${Number(work.cover_i)}-S.jpg` : ''
    }];
  });
}

async function searchOpenLibrary(source, query) {
  const number = isbn(query);
  const fields = 'key,title,author_name,first_publish_year,ratings_average,ratings_count,cover_i,editions,editions.key,editions.title,editions.isbn,editions.publisher,editions.publish_date';
  const params = new URLSearchParams({ fields, limit: '10', ...(number ? { q: `isbn:${number}` } : { title: query }) });
  return openLibraryRecords(await source.request(`${openLibrary}/search.json?${params}`, {}, 'json'), number);
}

async function expandOpenLibrary(source, record) {
  try {
    const work = await source.request(`${openLibrary}/works/${record.workId}.json`, {}, 'json');
    return { ...record, summary: description(work.description?.value || work.description, 4000) };
  } catch {
    return record;
  }
}

async function searchShanghai(source, query) {
  const key = process.env.MEGULIT_SHLIBRARY_API_KEY?.trim();
  if (!key) return [];
  const code = isbn(query);
  const params = new URLSearchParams({ key, [code ? 'code' : 'title']: code || query });
  const result = await source.request(`https://data1.library.sh.cn/bib/webapi/instance/list?${params}`, { redirect: 'error' }, 'json');
  if (result.result != null && !['0', '1'].includes(String(result.result))) throw Error('NOVEL_ONLINE_RESPONSE');
  const rows = Array.isArray(result.resultList) ? result.resultList : Object.values(result.resultList || {});
  return rows.slice(0, 12).flatMap(row => {
    const title = text(row?.title);
    if (!title) return [];
    const identifiers = [row.ids, row.isbn].flat(Infinity).map(String);
    const number = identifiers.flatMap(value => value.match(/(?:97[89][\d -]{10,17}\d|\d[\d -]{8,14}[\dX])/gi) || [])
      .map(isbn).find(Boolean);
    const recordId = String(row.uri || row.shelf || number || title).slice(0, 120);
    return [{ recordId, title, author: text(row.response), publisher: text(row.provision),
      date: text(String(row.year || ''), 40), isbn: number, url: 'https://data1.library.sh.cn/index' }];
  });
}

async function searchMoegirl(source, titles) {
  const { _moegirlText } = require('../../core/library.cjs');
  let networkError;
  const result = await _moegirlText(titles, { fetcher: async url => {
    try {
      const data = await source.request(url, {}, 'json');
      return { ok: true, json: () => data };
    } catch (error) { networkError = error; throw error; }
  } });
  if (networkError) throw networkError;
  if (!result || !/小说|小說|小説|轻文学|light novel/i.test(result.text)) return null;
  return { recordId: result.title, title: result.title, summary: result.text, scope: 'series',
    url: 'https://zh.moegirl.org.cn/' + encodeURIComponent(result.title.replaceAll(' ', '_')) };
}

const catalogs = new Map([
  ['ndl', { search: searchNdl }],
  ['openlibrary', { search: searchOpenLibrary, expand: expandOpenLibrary }],
  ['shlibrary', { search: searchShanghai }]
]);

module.exports = { catalogs, searchMoegirl };
