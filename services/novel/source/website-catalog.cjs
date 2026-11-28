// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { createHash } = require('node:crypto');
const { startBrowser } = require('./browser-session.cjs');
const { attachEditionAliases } = require('../editions.cjs');
const { searchKey } = require('../search-titles.cjs');
const { publicLookup, requestStream } = require('./book-site.cjs');

const CATALOG_LIMIT = 24;
const URL_LIMIT = 2048;
const japanese = /^(?:ja|jpn|jp|japanese|日本語|日文)$/i;
const lightNovel = /ライトノベル|ラノベ|light novels?|轻小说|輕小說/i;
const operations = new Map();
const clean = (value, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function safeUrl(raw, base) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > URL_LIMIT) return '';
    return url.href;
  } catch { return ''; }
}

function sameSite(raw, base) {
  const url = safeUrl(raw, base);
  return url && new URL(url).origin === new URL(base).origin ? url : '';
}

function stateFor(key) {
  let state = operations.get(key);
  if (!state) {
    state = { browser: null, opening: null, auth: '', items: new Map(), pages: new Map(), catalogue: new Map() };
    operations.set(key, state);
  }
  return state;
}

async function ensureBrowser(state, options, visible = false) {
  if (state.opening) await state.opening;
  if (state.browser && !state.browser.exited() && (state.browser.visible || !visible)) return state.browser;
  state.opening = (async () => {
    await state.browser?.close().catch(() => {});
    const browser = await startBrowser(options.binary, options.args, { visible });
    try {
      await browser.navigate(options.url);
      for (let attempt = 0; attempt < 12; attempt++) {
        if (await browser.evaluate('location.href !== "about:blank" && document.readyState !== "loading"').catch(() => false)) break;
        await new Promise(resolve => setTimeout(resolve, 180));
      }
      state.browser = browser;
      return browser;
    } catch (error) {
      await browser.close().catch(() => {});
      throw error;
    }
  })();
  try { return await state.opening; }
  finally { state.opening = null; }
}

async function request(browser, origin, href, kind, body) {
  // Requests execute in the existing browser context, so login cookies and verification remain browser-owned.
  const command = async ({ origin, href, kind, body }) => {
    if (location.origin !== origin) return { status: 0, manual: true };
    try {
      const response = await fetch(href, {
        credentials: 'same-origin', redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(4800),
        ...(kind === 'api' ? { method: body ? 'POST' : 'GET',
          headers: { Accept: 'application/json', source: 'android', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body }
          : { headers: { Accept: 'application/opds+json, application/atom+xml;q=0.95, application/json;q=0.9, text/html;q=0.7' } })
      });
      const info = { status: response.status, url: response.url,
        mime: response.headers.get('content-type') || '', challenge: response.headers.get('cf-mitigated') === 'challenge' };
      if (kind === 'file') {
        info.file = response.ok && (/\b(?:application\/(?:pdf|epub\+zip|octet-stream))\b/i.test(info.mime) ||
          /^attachment(?:;|$)/i.test(response.headers.get('content-disposition') || ''));
        await response.body?.cancel();
        return info;
      }
      if (kind === 'cover') {
        if (!response.ok || !/^image\/(?:jpeg|png|webp|gif)(?:;|$)/i.test(info.mime)) return info;
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 600 * 1024) { await reader.cancel(); return info; }
          chunks.push(value);
        }
        info.image = await new Promise(resolve => {
          const file = new FileReader();
          file.onloadend = () => resolve(file.result);
          file.readAsDataURL(new Blob(chunks, { type: info.mime.split(';')[0] }));
        });
        return info;
      }
      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
      let content = '';
      if (reader) for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        content += value;
        if (content.length > 2 * 1024 * 1024) { await reader.cancel(); return info; }
      }
      try { info.json = JSON.parse(content); return info; } catch {}
      if (/xml|atom/i.test(info.mime) || /<(?:\w+:)?feed(?:\s|>)/i.test(content.slice(0, 300))) {
        const xml = new DOMParser().parseFromString(content, 'application/xml');
        const children = (node, name) => [...node.children].filter(item => item.localName === name);
        const first = (node, name) => children(node, name)[0]?.textContent || '';
        const links = node => children(node, 'link').map(link => ({ rel: link.getAttribute('rel'), href: link.getAttribute('href'), type: link.getAttribute('type') }));
        if (xml.documentElement.localName === 'feed') {
          info.json = { links: links(xml.documentElement), publications: children(xml.documentElement, 'entry').slice(0, 500).map(entry => ({
            metadata:{ title:first(entry,'title'), author:children(entry,'author').map(author => first(author,'name')),
              language:first(entry,'language'), description:first(entry,'summary') || first(entry,'content'), published:first(entry,'published'),
              subject:children(entry,'category').map(category => category.getAttribute('label') || category.getAttribute('term')) },
            links:links(entry)
          })) };
          return info;
        }
      }
      if (info.mime.includes('html') || /^\s*</.test(content)) {
        const page = new DOMParser().parseFromString(content, 'text/html');
        info.challenge ||= /just a moment|checking your browser|attention required/i.test(page.title)
          || Boolean(page.querySelector('#challenge-form, #cf-challenge-running'));
        info.login = Boolean(page.querySelector('input[type=password]')) && /login|sign.?in|auth/i.test(new URL(response.url).pathname);
        info.link = page.querySelector('link[rel=alternate][type*="opds"], link[rel=alternate][type="application/atom+xml"]')?.getAttribute('href');
        info.schema = [...page.querySelectorAll('script[type="application/ld+json"]')].slice(0, 10).flatMap(tag => {
          try { return [JSON.parse(tag.textContent)]; } catch { return []; }
        });
      }
      return info;
    } catch { return { status: 0 }; }
  };
  const params = { origin, href, kind, body };
  return await browser.evaluate('(' + command.toString() + ')(' + JSON.stringify(params) + ')').catch(() => ({ status: 0 }));
}

async function externalCover(url) {
  const { hostname } = new URL(url);
  const lookup = await publicLookup(hostname);
  const stream = await requestStream(url, '', { lookup, timeout: 5000 });
  try {
    const mime = String(stream.headers['content-type']).split(';')[0];
    if (stream.statusCode !== 200 || !/^image\/(?:jpeg|png|webp|gif)$/i.test(mime)) return '';
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 600 * 1024) return '';
      chunks.push(chunk);
    }
    return 'data:' + mime + ';base64,' + Buffer.concat(chunks).toString('base64');
  } finally { stream.destroy(); }
}

function authReason(result) {
  if (result.challenge) return 'verify';
  if (result.login || result.status === 401 ||
      /^(?:.*\b)?(?:auth(?:entication|orization)? required|access denied|sign in|log in)(?:\b.*)?$/i.test(result.json?.error || result.json?.message || '')) return 'login';
  return result.status === 403 ? 'verify' : '';
}

const list = value => Array.isArray(value) ? value : value ? [value] : [];
const languageOf = value => list(value).find(lang => japanese.test(String(lang))) ? 'japanese' : clean(list(value)[0], 40);
const authorOf = value => list(value).map(author => clean(typeof author === 'string' ? author : author?.name, 90)).filter(Boolean).join('、');
const extOf = (type, url) => /epub/i.test(type) ? 'epub' : /pdf/i.test(type) ? 'pdf' : /\.(epub|pdf)(?:[?#]|$)/i.exec(url || '')?.[1]?.toLowerCase() || '';

function normalizedEntry(info, links, base, id) {
  const title = clean(info.title || info.name);
  if (!title) return null;
  const language = languageOf(info.language || info.inLanguage);
  const tags = list(info.subject || info.genre || info.keywords).map(item => typeof item === 'string' ? item : item?.name || item?.code || '').join(' ');
  const href = safeUrl(info.url, base) || base;
  const author = authorOf(info.author);
  const cover = safeUrl(links.cover, base);
  const file = safeUrl(links.file, base);
  const extension = extOf(links.type, file);
  return {
    id: id.startsWith('api-') ? id : id.slice(0, id.indexOf('-') + 1) + createHash('sha256')
      .update(JSON.stringify([href === base ? '' : href, file, info.identifier, title, author, language])).digest('hex').slice(0, 20),
    title, author, language,
    alternate: clean(info.alternateHeadline || info.originalTitle || info.original_title || info.alternateTitle),
    originalTitle: clean(info.originalTitle || info.original_title),
    japanese: language === 'japanese' || (!language && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)),
    lightNovel: lightNovel.test(tags + ' ' + title), cover, file: extension ? file : '', extension, url: href,
    downloadable: Boolean(file && extension), description: clean(info.description, 5000),
    year: clean(info.published || info.datePublished, 10).slice(0, 4), isbn: clean(info.identifier || info.isbn, 40)
  };
}

function opdsEntries(feed, base) {
  const entries = list(feed.publications).concat(list(feed.groups).flatMap(group => list(group?.publications)));
  return entries.slice(0, 500).map((publication, index) => {
    const links = list(publication?.links);
    const acquire = links.find(item => list(item.rel).some(rel => /^https?:\/\/opds-spec\.org\/acquisition(?:\/open-access)?$/.test(rel)) &&
      extOf(item.type || '', item.href));
    const cover = list(publication?.images)[0] || links.find(link => list(link.rel).some(rel => /\/image(?:\/thumbnail)?$/.test(rel)));
    return normalizedEntry(publication?.metadata || {}, { cover: cover?.href, file: acquire?.href, type: acquire?.type || '' },
      base, 'opds-' + index);
  }).filter(Boolean);
}

function schemaEntries(nodes, base) {
  return list(nodes).flatMap(node => list(node?.['@graph'] || node))
    .flatMap(node => node?.itemListElement ? list(node.itemListElement).map(entry => entry.item) : [node])
    .filter(node => list(node?.['@type']).includes('Book')).slice(0, 100).map((book, index) => {
      const image = list(book.image)[0];
      const file = list(book.encoding).find(item => extOf(item?.encodingFormat || '', item?.contentUrl));
      return normalizedEntry(book, { cover: typeof image === 'string' ? image : image?.url, file: file?.contentUrl,
        type: file?.encodingFormat || '' }, base, 'web-' + index);
    }).filter(Boolean);
}

function apiEntries(data, origin) {
  return data.books.slice(0, 100).flatMap(book => {
    const id = String(book.id || '');
    const hash = String(book.hash || '');
    if (!/^\d{1,20}$/.test(id)) return [];
    const extension = extOf(String(book.extension || ''), '');
    const info = normalizedEntry({ ...book, subject: book.tags || book.category, language: book.language, url: book.href || '/book/' + id },
      { cover: book.cover }, origin, 'api-' + id);
    return info ? [{ ...info, hash, apiId: id, extension, downloadable: Boolean(extension && /^[a-f\d]{5,32}$/i.test(hash)),
      size: clean(book.filesizeString, 35) }] : [];
  });
}

const priority = book => Number(book.japanese) + Number(book.lightNovel) * (book.japanese ? 2 : 0);
function orderBooks(books, order) {
  return books.sort((a, b) => priority(b) - priority(a) ||
    (order === 'date' || order === 'year' ? Number(b.year || 0) - Number(a.year || 0) : 0));
}

async function discover(state, browser, options, requestData) {
  const { url } = options;
  const origin = new URL(url).origin;
  const page = Math.min(500, Math.max(1, Math.trunc(Number(requestData.page) || 1)));
  const query = clean(requestData.query, 150);
  const order = clean(requestData.order, 20);
  const body = new URLSearchParams({ message: query || 'ライトノベル', page, limit: CATALOG_LIMIT });
  if (!requestData.allLanguages && !query) body.set('languages[0]', 'japanese');
  if (['date', 'year', 'popular'].includes(order)) body.set('order', order);
  const api = await request(browser, origin, origin + '/eapi/book/search', 'api', body.toString());
  if (Array.isArray(api.json?.books)) {
    return { adapter: 'api', books: orderBooks(apiEntries(api.json, origin), order), page,
      more: Boolean(api.json.pagination?.next ?? api.json.pagination?.hasNext ?? (api.json.books.length >= CATALOG_LIMIT)) };
  }
  const browseKey = query + ':' + page;
  const href = state.pages.get(browseKey) || url;
  let feed = await request(browser, origin, href, 'catalog');
  const feedLink = sameSite(feed.link, feed.url || href);
  if (feedLink) feed = await request(browser, origin, feedLink, 'catalog');
  const template = list(feed.json?.links).find(item => list(item.rel).includes('search') && item.templated)?.href;
  if (query && page === 1 && typeof template === 'string') {
    const search = sameSite(template.replace(/\{(?:searchTerms|query)\}/g, encodeURIComponent(query)), feed.url || href);
    if (search) feed = await request(browser, origin, search, 'catalog');
  }
  const validOpds = Array.isArray(feed.json?.publications) || Array.isArray(feed.json?.groups);
  const found = validOpds ? opdsEntries(feed.json, feed.url || href) : schemaEntries(feed.schema || feed.json, feed.url || href);
  if (validOpds || found.length) {
    const term = searchKey(query);
    const filter = term && !template ? found.filter(book => [book.title, book.alternate, book.author, book.isbn].some(value => searchKey(value).includes(term))) : found;
    const next = sameSite(list(feed.json?.links).find(item => list(item.rel).includes('next'))?.href, feed.url || href);
    if (next) {
      if (state.pages.size > 60) state.pages.clear();
      state.pages.set(query + ':' + (page + 1), next);
    }
    return { adapter: validOpds ? 'opds' : 'schema', page, books: orderBooks(filter, order), more: Boolean(next) };
  }
  const auth = authReason(feed) || authReason(api) || (feed.manual ? 'verify' : '');
  const authUrl = sameSite(feed.url, url);
  return { page, books: [], auth, authUrl,
    error: feed.status || api.status ? 'NOVEL_WEBSITE_CATALOG_UNAVAILABLE' : 'BOOK_SITE_UNAVAILABLE' };
}

async function resolveDownload(browser, origin, book) {
  if (!book.apiId) return { file: book.file };
  const result = await request(browser, origin, origin + '/eapi/book/' + book.apiId + '/' + book.hash + '/file', 'api');
  const auth = authReason(result);
  if (auth) return { auth, authUrl: sameSite(result.url, origin) };
  const file = result.json?.file?.downloadLink || result.json?.file?.download_link || result.json?.response?.file?.downloadLink;
  if (!file && (result.json?.success === 0 || result.json?.success === false)) return { auth: 'login' };
  return { file };
}

async function canResumeDownload(browser, origin, book) {
  const result = await resolveDownload(browser, origin, book);
  const file = safeUrl(result.file, origin);
  if (!file) return false;
  if (book.apiId && new URL(file).origin !== origin) return true;
  return Boolean((await request(browser, origin, file, 'file')).file);
}

async function closeBrowser(state) {
  const browser = state.browser;
  state.browser = null;
  await browser?.close().catch(() => {});
}

async function beginAuth(state, options, reason, query) {
  if (state.auth === 'pending') return { authStatus: state.auth };
  const browser = await ensureBrowser(state, options, true);
  if (state.auth === 'pending') return { authStatus: state.auth };
  state.auth = 'pending';
  const origin = new URL(options.url).origin;
  const book = state.items.get(String(query.bookId || ''));
  const authUrl = sameSite(query.authUrl, options.url);
  if (authUrl && authUrl !== options.url) await browser.navigate(authUrl).catch(() => {});
  await browser.show().catch(() => {});
  const deadline = Date.now() + 10 * 60_000;
  void (async () => {
    try {
      while (state.auth === 'pending' && Date.now() < deadline && !browser.exited()) {
        await new Promise(resolve => setTimeout(resolve, 2300));
        const result = await discover(state, browser, options, query);
        if (!result.adapter) continue;
        if (reason === 'manual' && result.adapter !== 'api') continue;
        if (book && !await canResumeDownload(browser, origin, book)) continue;
        if (['login', 'manual'].includes(reason) && result.adapter === 'api') {
          const profile = await request(browser, origin, origin + '/eapi/user/profile', 'api');
          if (!profile.json?.user?.id && !profile.json?.user?.user_id &&
              !profile.json?.response?.user?.id && !profile.json?.response?.user_id) continue;
        }
        if (state.auth !== 'pending') return;
        // Continue from the verified browser context, including its session-only cookies.
        await browser.hide().catch(() => {});
        if (state.auth === 'pending') state.auth = 'ready';
        return;
      }
    } catch { /* Cancellation or a browser window closing. */ }
    if (state.auth === 'pending') state.auth = 'closed';
  })();
  return { authStatus: state.auth };
}

async function handle(options, input) {
  const state = stateFor(options.key);
  const operation = input.operation;
  if (operation === 'authStatus') return { authStatus: state.auth };
  if (operation === 'authenticate') return beginAuth(state, options, input.reason || 'manual', input);
  if (operation === 'logout') {
    state.auth = '';
    const browser = await ensureBrowser(state, options);
    await browser.clear(new URL(options.url).origin);
    await closeBrowser(state);
    state.items.clear();
    state.pages.clear();
    state.catalogue.clear();
    return { loggedOut: true };
  }
  if (operation === 'openBrowser') {
    const browser = await ensureBrowser(state, options, true);
    await browser.show().catch(() => {});
    if (input.bookId && state.items.get(input.bookId)?.url) await browser.navigate(state.items.get(input.bookId).url);
    return { opened: true };
  }
  if (operation === 'browse') {
    const browser = await ensureBrowser(state, options);
    const result = await discover(state, browser, options, input);
    if (!result.error && input.query && options.titleVariants) {
      const aliases = await options.titleVariants(input.query, result.books).catch(() => []);
      const extra = await Promise.allSettled(aliases.map(query => discover(state, browser, options, { ...input, query })));
      const combined = new Map(result.books.map(book => [book.id, book]));
      for (const item of extra) if (item.status === 'fulfilled' && !item.value.error) {
        result.more ||= item.value.more;
        for (const book of item.value.books) if (!combined.has(book.id)) combined.set(book.id, book);
      }
      result.books = orderBooks([...combined.values()], input.order);
      result.alias = aliases.find(title => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)) || '';
    }
    state.items = new Map(result.books.map(book => [book.id, book]));
    rememberCatalogue(state, attachEditionAliases(result.books));
    return result;
  }
  const book = state.items.get(String(input.bookId || ''));
  if (!book) throw Error('NOVEL_WEBSITE_BOOK_NOT_FOUND');
  const origin = new URL(options.url).origin;
  const browser = await ensureBrowser(state, options);
  if (operation === 'cover') {
    if (!book.cover) return { data: '' };
    const result = await request(browser, origin, book.cover, 'cover');
    const data = result.image || (new URL(book.cover).origin !== origin ? await externalCover(book.cover).catch(() => '') : '');
    return { data };
  }
  if (operation === 'download') {
    if (!book.downloadable) throw Error('NOVEL_UNSUPPORTED');
    const resolution = await resolveDownload(browser, origin, book);
    if (resolution.auth) return resolution;
    const target = safeUrl(resolution.file, origin);
    if (!target) throw Error('BOOK_SITE_DOWNLOAD_LINK');
    const result = await browser.navigate(target);
    if (result?.isDownload) return { downloading: true };
    const gate = await browser.evaluate(`(() => /just a moment|attention required/i.test(document.title) || document.querySelector('#challenge-form') ? 'verify'
      : document.querySelector('input[type=password]') ? 'login' : '')()`).catch(() => '');
    if (gate) return { auth: gate, authUrl: sameSite(await browser.evaluate('location.href').catch(() => ''), origin) };
    throw Error('BOOK_SITE_DOWNLOAD_LINK');
  }
  throw Error('NOVEL_WEBSITE_OPERATION');
}

function rememberCatalogue(state, books) {
  for (const book of books) {
    if (!book.downloadable) continue;
    const previous = state.catalogue.get(book.id);
    state.catalogue.set(book.id, { ...book, aliases: [...new Set([...(previous?.aliases || []), ...(book.aliases || [])])].slice(0, 16) });
    if (state.catalogue.size > 100) state.catalogue.delete(state.catalogue.keys().next().value);
  }
}

const catalogueFor = key => [...(operations.get(key)?.catalogue?.values() || [])];
module.exports = { handle, catalogueFor };
