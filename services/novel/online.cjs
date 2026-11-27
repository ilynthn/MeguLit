// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { readOnlineInfo, setOnlineInfo, lookupState } = require('./library.cjs');
const { catalogs, searchMoegirl } = require('./catalogs.cjs');
const { isbnOf, titleParts, bestMatch } = require('./identity.cjs');
const { openStore } = require('../store.cjs');

const endpoint = 'https://api.bgm.tv/v0';
const coverLimit = 600 * 1024;
const text = (value, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const asId = value => {
  const raw = String(value ?? '').trim();
  const match = /^(?:https:\/\/(?:bgm\.tv|bangumi\.tv|chii\.in)\/subject\/)?([1-9]\d{0,9})\/?$/i.exec(raw);
  return match ? Number(match[1]) : 0;
};

function coverUrl(raw) {
  try {
    const url = new URL(raw);
    return url.origin === 'https://lain.bgm.tv' && !url.username && !url.password && url.pathname.startsWith('/pic/cover/')
      ? url.href : '';
  } catch { return ''; }
}

function normalizeSubject(raw) {
  if (!raw || raw.type !== 1 || raw.nsfw || !asId(raw.id)) return null;
  const rating = Number(raw.rating?.score);
  const votes = Math.max(0, Math.trunc(Number(raw.rating?.total) || 0));
  const info = Array.isArray(raw.infobox) ? raw.infobox : [];
  const fact = keys => {
    const value = info.find(item => keys.includes(item?.key))?.value;
    return text(Array.isArray(value) ? value.map(item => text(item?.v)).filter(Boolean).join('、') : value);
  };
  const aliases = info.find(item => ['别名', '別名'].includes(item?.key))?.value;
  return {
    subjectId: asId(raw.id), title: text(raw.name), alternate: text(raw.name_cn), date: text(raw.date || raw.air_date, 25),
    aliases: (Array.isArray(aliases) ? aliases.map(item => text(item?.v)) : [text(aliases)]).filter(Boolean).slice(0, 12),
    author: fact(['作者', '原作', '著者']), illustrator: fact(['插图', '插画', 'イラスト', '挿絵']),
    publisher: fact(['出版社', '出版', '発行所', 'レーベル']), isbn: isbnOf(fact(['ISBN', 'ISBN-13', 'ISBN13'])),
    summary: text(raw.summary, 6500), platform: text(raw.platform, 45),
    coverUrl: coverUrl(raw.images?.common) || coverUrl(raw.images?.medium) || coverUrl(raw.images?.large),
    score: votes && rating > 0 && rating <= 10 ? rating : null, votes
  };
}

function network(runtime) {
  if (!runtime?.reviews) throw Error('PERSISTENT_RUNTIME_REQUIRED');
  return runtime.reviews();
}

function requireBook(db, id) {
  if (!/^novel-[a-f\d]{16}$/.test(id) ||
      !db.prepare("SELECT id FROM novels WHERE id=? AND status='active'").get(id)) throw Error('NOVEL_NOT_FOUND');
}

function providerOf(request) {
  const provider = request.provider || 'bangumi';
  if (provider !== 'bangumi' && !catalogs.has(provider)) throw Error('NOVEL_ONLINE_PROVIDER');
  return provider;
}

function catalogResults(source, provider, query, refresh = false) {
  const lookup = () => catalogs.get(provider).search(source, query);
  return refresh ? lookup() : source.cached(`novel:${provider}:search:${query}`, 5 * 60_000, lookup);
}

function getSubject(source, id, refresh = false) {
  const fetchSubject = async () => {
    const result = normalizeSubject(await source.request(endpoint + '/subjects/' + id, {}, 'json'));
    if (!result || result.subjectId !== id) throw Error('NOVEL_ONLINE_NOT_BOOK');
    return result;
  };
  return refresh ? fetchSubject() : source.cached('novel:subject:' + id, 15 * 60_000, fetchSubject);
}

async function search(db, runtime, id, request) {
  requireBook(db, id);
  const query = text(request.query, 180);
  if (!query) return { items: [] };
  const source = network(runtime);
  const provider = providerOf(request);
  if (provider !== 'bangumi') return { items: await catalogResults(source, provider, query) };
  return { items: await searchBangumi(source, query) };
}

async function searchBangumi(source, query, byTitle = false) {
  const exact = byTitle ? 0 : asId(query);
  if (exact) return [await getSubject(source, exact)];
  return source.cached('novel:search:' + query, 5 * 60_000, async () => {
    const response = await source.request(endpoint + '/search/subjects?limit=12', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: query, sort: 'match', filter: { type: [1], nsfw: false } })
    }, 'json');
    return (Array.isArray(response.data) ? response.data : []).map(normalizeSubject).filter(Boolean);
  });
}

async function fetchCover(source, image) {
  const safe = coverUrl(image);
  if (!safe) throw Error('NOVEL_ONLINE_COVER');
  const res = await source.fetcher(safe, {
    redirect: 'error', headers: { 'User-Agent': 'MeguLit/1.4.25 (desktop novel library)' },
    signal: AbortSignal.timeout(12000)
  });
  const size = Number(res.headers.get('content-length'));
  if (!res.ok || size > coverLimit || !res.body) throw Error('NOVEL_ONLINE_COVER');
  const chunks = [];
  let count = 0;
  for await (const part of res.body) {
    count += part.length;
    if (count > coverLimit) throw Error('NOVEL_ONLINE_COVER');
    chunks.push(part);
  }
  return Buffer.concat(chunks, count);
}

async function save(db, root, runtime, id, request) {
  requireBook(db, id);
  const provider = providerOf(request);
  const current = readOnlineInfo(root, id, provider);
  const refresh = request.refresh === true;
  if (provider !== 'bangumi') {
    const source = network(runtime);
    const recordId = refresh ? current?.recordId : text(request.recordId, 60);
    const query = refresh ? current?.matchQuery : text(request.query, 180);
    if (!recordId || !query) throw Error('NOVEL_ONLINE_SELECT_BOOK');
    const records = await catalogResults(source, provider, query, refresh);
    const match = records.find(record => record.recordId === recordId);
    if (!match) throw Error('NOVEL_ONLINE_NOT_BOOK');
    const record = await (catalogs.get(provider).expand?.(source, match) || match);
    if (refresh && readOnlineInfo(root, id, provider)?.recordId !== recordId) throw Error('NOVEL_ONLINE_SELECT_BOOK');
    return setOnlineInfo(db, root, id, { ...record, matchQuery: query, fetchedAt: Date.now() }, null, provider);
  }
  const subjectId = refresh ? current?.subjectId : asId(request.subjectId);
  if (!subjectId) throw Error('NOVEL_ONLINE_SELECT_BOOK');
  const source = network(runtime);
  const record = await getSubject(source, subjectId, refresh);
  const bytes = !refresh && request.useCover === true
    ? await fetchCover(source, record.coverUrl).catch(() => { throw Error('NOVEL_ONLINE_COVER'); })
    : null;
  if (refresh && readOnlineInfo(root, id)?.subjectId !== subjectId) throw Error('NOVEL_ONLINE_SELECT_BOOK');
  return setOnlineInfo(db, root, id, {
    ...record,
    coverFile: refresh ? current?.coverFile || '' : '',
    fetchedAt: Date.now()
  }, bytes);
}

function clear(db, root, id, request) {
  return setOnlineInfo(db, root, id, null, null, providerOf(request));
}

async function reviews(db, root, runtime, id, request) {
  requireBook(db, id);
  const online = readOnlineInfo(root, id);
  if (!online) throw Error('NOVEL_ONLINE_SELECT_BOOK');
  const source = network(runtime);
  const size = [10, 20, 50].includes(Number(request.size)) ? Number(request.size) : 10;
  const wanted = Math.max(1, Math.min(1000, Math.trunc(Number(request.page) || 1)));
  const ident = { id: online.subjectId };
  // Same public short-review source and throttling as the game details.
  let first = Math.floor((wanted - 1) * size / 50);
  let data = await source.source('bangumi', ident, first + 1);
  const total = Math.max(Number(data.total) || 0, data.items.length);
  const pages = Math.max(1, Math.min(1000, Math.ceil(total / size)));
  const page = Math.min(wanted, pages);
  const correct = Math.floor((page - 1) * size / 50);
  if (correct !== first) {
    first = correct;
    data = await source.source('bangumi', ident, first + 1);
  }
  const start = (page - 1) * size - first * 50;
  let rows = data.items;
  if (start + size > 50 && total > (first + 1) * 50) rows = rows.concat((await source.source('bangumi', ident, first + 2)).items);
  const items = rows.slice(start, start + size).filter(item => text(item.text))
    .map(item => ({ id: item.id, author: text(item.author, 90), date: text(item.date, 20), text: text(item.text, 5000), rating: item.rating }));
  return { subjectId: ident.id, total, items, page, pages, available: true,
    matched: online.title, url: `https://bgm.tv/subject/${ident.id}/comments` };
}

const queues = new WeakMap();
const errorRetry = 20 * 60_000;
const emptyRetry = 7 * 24 * 60 * 60_000;
const eligible = status => !status || status.status === 'pending' ||
  (status.status === 'failed' && Date.now() - status.at >= errorRetry) ||
  (status.status === 'missing' && Date.now() - status.at >= emptyRetry) ||
  (status.status === 'disabled' && Boolean(process.env.MEGULIT_SHLIBRARY_API_KEY?.trim()));

function queueFor(runtime) {
  if (!queues.has(runtime)) queues.set(runtime, { pending: new Set(), running: '', resumed: false, draining: false, backoff: new Map() });
  return queues.get(runtime);
}

function activeBook(root, id, run) {
  const db = openStore(root);
  try {
    const book = db.prepare("SELECT id,title,author,original FROM novels WHERE id=? AND status='active'").get(id);
    return book ? run(db, book) : null;
  } finally { db.close(); }
}

const providerKeys = ['bangumi', ...catalogs.keys(), 'moegirl'];

async function matchCatalog(source, provider, book, aliases = []) {
  const local = titleParts(book.title);
  const get = query => provider === 'bangumi' ? searchBangumi(source, query, true) : catalogResults(source, provider, query);
  const titles = [local.title, ...aliases, ...(provider === 'bangumi' ? [] : [local.base])];
  const queries = [...new Set([book.isbn, ...titles].map(query => text(query, 180)).filter(Boolean))];
  let best;
  for (const query of queries.slice(0, 4)) {
    let candidates;
    try { candidates = await get(query); }
    catch (error) {
      if (!best) throw error;
      break;
    }
    const match = bestMatch(book, candidates, aliases);
    if (!match) continue;
    if (!best || match.matchScore > best.matchScore) best = { ...match, matchQuery: query };
    if (best.matchScore >= 2 || (!book.isbn && best.matchScore >= 1.199)) break;
  }
  if (!best) return null;
  if (provider !== 'bangumi') return catalogs.get(provider).expand?.(source, best) || best;
  const complete = await getSubject(source, best.subjectId).catch(() => null);
  if (!complete) return best;
  const verified = bestMatch(book, [complete], aliases);
  return verified ? { ...verified, matchQuery: best.matchQuery } : null;
}

async function enrich(root, runtime, id) {
  const book = activeBook(root, id, (_db, row) => row);
  if (!book || runtime.stopped) return;
  try { book.isbn = isbnOf(JSON.parse(book.original || '{}').isbn); } catch { book.isbn = ''; }
  const source = network(runtime);
  const { backoff } = queueFor(runtime);
  const states = {};
  const pending = [];
  const records = {};
  const prior = lookupState(root, id)?.sources || {};
  for (const provider of providerKeys) {
    const record = readOnlineInfo(root, id, provider);
    if (record) {
      records[provider] = record;
      states[provider] = { status: 'matched', at: record.fetchedAt || Date.now() };
    } else if (provider === 'shlibrary' && !process.env.MEGULIT_SHLIBRARY_API_KEY?.trim()) {
      states[provider] = { status: 'disabled', at: Date.now() };
    } else if (eligible(prior[provider])) {
      pending.push(provider);
      states[provider] = { status: 'pending', at: Date.now() };
    } else {
      states[provider] = prior[provider];
    }
  }
  const snapshot = () => ({ sources: states, pending: Object.values(states).some(item => item.status === 'pending') });
  lookupState(root, id, snapshot());

  async function fill(provider, find) {
    if (!pending.includes(provider) || runtime.stopped) return;
    let record;
    let status = 'missing';
    try {
      if ((backoff.get(provider) || 0) > Date.now()) status = 'failed';
      else record = await find();
    } catch (error) {
      status = 'failed';
      if (/timeout|fetch failed|HTTP_(?:429|5\d\d)/i.test(String(error?.message || error))) backoff.set(provider, Date.now() + 2 * 60_000);
    }
    if (runtime.stopped) return;
    activeBook(root, id, db => {
      const current = readOnlineInfo(root, id, provider);
      if (current || record) {
        records[provider] = current || { ...record, fetchedAt: Date.now() };
        if (!current) setOnlineInfo(db, root, id, records[provider], null, provider);
        status = 'matched';
      }
      states[provider] = { status, at: Date.now() };
      lookupState(root, id, snapshot());
    });
  }
  const bangumi = fill('bangumi', () => matchCatalog(source, 'bangumi', book));
  const ndl = fill('ndl', () => matchCatalog(source, 'ndl', book));
  const openLibrary = fill('openlibrary', () => matchCatalog(source, 'openlibrary', book));
  await Promise.all([bangumi, ndl, openLibrary,
    fill('shlibrary', async () => {
      if (!book.isbn) await Promise.all([bangumi, ndl]);
      const inferredIsbn = book.isbn || isbnOf(records.ndl?.isbn) || isbnOf(records.bangumi?.isbn);
      return matchCatalog(source, 'shlibrary', { ...book, isbn: inferredIsbn }, [records.bangumi?.alternate].filter(Boolean));
    }),
    fill('moegirl', async () => {
      await bangumi;
      const aliases = [records.bangumi?.alternate].filter(Boolean);
      const titles = [...aliases, book.title].map(name => titleParts(name).base).filter(Boolean);
      return source.cached('novel:moegirl:' + titles.join('|'), emptyRetry, () => searchMoegirl(source, titles));
    })
  ]);
}

function schedule(root, runtime, ids, prioritize = false) {
  if (!runtime?.reviews || runtime.stopped) return;
  const queue = queueFor(runtime);
  for (const id of ids) {
    if (!/^novel-[a-f\d]{16}$/.test(id) || queue.running === id) continue;
    if (queue.pending.has(id)) {
      if (prioritize) { queue.pending.delete(id); queue.pending = new Set([id, ...queue.pending]); }
      continue;
    }
    const last = lookupState(root, id);
    if (last && !providerKeys.some(key => eligible(last.sources?.[key]))) continue;
    lookupState(root, id, { ...last, pending: true });
    if (prioritize) queue.pending = new Set([id, ...queue.pending]);
    else queue.pending.add(id);
  }
  if (queue.draining || !queue.pending.size) return;
  queue.draining = true;
  void (async () => {
    try {
      while (!runtime.stopped && queue.pending.size) {
        const id = queue.pending.values().next().value;
        queue.pending.delete(id);
        queue.running = id;
        try { await enrich(root, runtime, id); }
        catch {
          activeBook(root, id, () => {
            const last = lookupState(root, id);
            const sources = Object.fromEntries(providerKeys.map(key => [key,
              last?.sources?.[key]?.status === 'matched' ? last.sources[key] : { status: 'failed', at: Date.now() }]));
            lookupState(root, id, { sources, pending: false });
          });
        } finally { queue.running = ''; }
      }
    } finally { queue.draining = false; }
  })().catch(() => {});
}

function resume(root, runtime, ids) {
  if (!runtime?.reviews || runtime.stopped) return;
  const queue = queueFor(runtime);
  if (queue.resumed) return;
  queue.resumed = true;
  schedule(root, runtime, ids.filter(id => lookupState(root, id)?.pending));
}

module.exports = { search, searchBangumi, save, clear, reviews, schedule, resume };
