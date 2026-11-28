// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { Readable } = require('node:stream');
const { isbnOf } = require('../identity.cjs');
const { imageExt } = require('../library.cjs');
const { normalizeSubject, fetchCover } = require('../online.cjs');
const bookSite = require('./book-site.cjs');

const urls = { bangumi: 'https://bgm.tv/book', openlibrary: 'https://openlibrary.org' };
const limit = 24;
const clean = value => String(value ?? '').normalize('NFKC').trim().slice(0, 160);
const year = value => String(value ?? '').match(/^\d{4}/)?.[0] || '';

async function connect(root, origin, task) {
  const settings = bookSite.readConfig(root);
  let failure;
  for (const proxy of bookSite.connectionRoutes(settings, origin)) {
    try { return await task(proxy); }
    catch (error) { failure = error; }
  }
  throw failure;
}

async function readJson(url, proxy, options) {
  const { data, status } = await bookSite.jsonRequest(url, proxy, { ...options, timeout: 6500 });
  if (status < 200 || status >= 300 || !data || typeof data !== 'object') throw Error('BOOK_SITE_RESPONSE');
  return data;
}

async function bangumi(query, page, order, proxy) {
  const params = new URLSearchParams({ limit, offset: (page - 1) * limit });
  const body = JSON.stringify({ keyword: query || 'ライトノベル',
    sort: order === 'popular' ? 'heat' : 'match',
    filter: { type: [1], nsfw: false } });
  const data = await readJson('https://api.bgm.tv/v0/search/subjects?' + params, proxy, {
    body, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
  });
  if (!Array.isArray(data.data)) throw Error('BOOK_SITE_RESPONSE');
  const books = data.data.map(normalizeSubject).filter(Boolean).map(book => ({
    id: String(book.subjectId), title: book.title || book.alternate, alternate: book.alternate, aliases: book.aliases, author: book.author, year: year(book.date),
    cover: book.coverUrl, japanese: /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(book.title),
    url: 'https://bgm.tv/subject/' + book.subjectId, description: book.summary, publisher: book.publisher, isbn: book.isbn
  }));
  return { books, more: Number(data.total) > page * limit, url: urls.bangumi };
}

async function openlibrary(query, page, order, proxy) {
  const isbn = isbnOf(query);
  const term = isbn ? 'isbn:' + isbn : query || 'subject:fiction language:jpn';
  const params = new URLSearchParams({ q: term, lang: 'ja', limit, page,
    fields: 'key,title,author_name,first_publish_year,cover_i,language,editions,editions.key,editions.title,editions.language' });
  if (order === 'date' || order === 'year') params.set('sort', 'new');
  else if (order === 'popular') params.set('sort', 'editions');
  const data = await readJson('https://openlibrary.org/search.json?' + params, proxy);
  if (!Array.isArray(data.docs)) throw Error('BOOK_SITE_RESPONSE');
  const books = data.docs.flatMap(row => {
    const id = /^(?:\/works\/)?(OL\d+W)$/.exec(row.key || '')?.[1];
    if (!id || !row.title) return [];
    const edition = row.editions?.docs?.[0];
    const editionId = /^\/books\/OL\d+M$/.test(edition?.key) ? edition.key : '';
    const number = Number(row.cover_i);
    return [{
      id, title: clean(edition?.title || row.title), author: clean(row.author_name?.join('、')),
      year: year(row.first_publish_year), japanese: (edition?.language || row.language)?.includes('jpn'),
      cover: Number.isSafeInteger(number) && number > 0 ? 'https://covers.openlibrary.org/b/id/' + number + '-M.jpg' : '',
      url: 'https://openlibrary.org' + (editionId || '/works/' + id), isbn: isbn || ''
    }];
  });
  return { books, more: Number(data.numFound ?? data.num_found) > page * limit,
    url: 'https://openlibrary.org/search?q=' + encodeURIComponent(term) };
}

const providers = { bangumi, openlibrary };
async function discover(provider, request, ctx) {
  const query = clean(request.query);
  const page = Math.min(500, Math.max(1, Math.trunc(Number(request.page) || 1)));
  try {
    const data = await connect(ctx.root, urls[provider], async proxy => {
      const primary = await providers[provider](query, page, request.order, proxy);
      if (!query || provider === 'bangumi') return primary;
      const aliases = await bookSite.titleVariants(query, ctx, proxy, primary.books);
      const results = await Promise.allSettled(aliases.map(alias => providers[provider](alias, page, request.order, proxy)));
      const pool = new Map(primary.books.map(book => [book.id, book]));
      for (const result of results) if (result.status === 'fulfilled') {
        primary.more ||= result.value.more;
        for (const book of result.value.books) if (!pool.has(book.id)) pool.set(book.id, book);
      }
      return { ...primary, books: [...pool.values()] };
    });
    data.books.sort((a, b) => Number(Boolean(b.japanese)) - Number(Boolean(a.japanese)));
    return { ...data, provider, catalog: true, page, proxiedCovers: true };
  } catch {
    return { books: [], provider, catalog: true, page, error: 'BOOK_SITE_UNAVAILABLE', url: urls[provider] };
  }
}

async function cover(request, { root, runtime }) {
  const { source, url } = request;
  if (!Object.hasOwn(providers, source)) throw Error('BOOK_SITE_INVALID_ORIGIN');
  const load = () => connect(root, urls[source], async proxy => {
    const image = await fetchCover({ fetcher: async href => {
      const result = await bookSite.requestStream(href, proxy, { timeout: 6500 });
      const empty = result.statusCode === 204 || result.statusCode === 304;
      if (empty) result.resume();
      return new Response(empty ? null : Readable.toWeb(result), { status: result.statusCode, headers: result.headers });
    } }, url, source);
    if (!image) throw Error('BOOK_SITE_RESPONSE');
    return { data: 'data:image/' + ({ '.png': 'png', '.webp': 'webp', '.gif': 'gif' }[imageExt(image)] || 'jpeg') + ';base64,' + image.toString('base64') };
  });
  return runtime?.reviews?.().cached('novel:catalog-cover:' + source + ':' + url, 300000, load) ?? load();
}

module.exports = { discover, cover };
