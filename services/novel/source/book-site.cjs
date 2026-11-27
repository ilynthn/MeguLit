// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const dns = require('node:dns/promises');
const { BlockList } = require('node:net');
const { spawn } = require('node:child_process');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { SecretStore } = require('../../../core/secrets.cjs');
const { bestMatch, titleParts } = require('../identity.cjs');
const { searchBangumi } = require('../online.cjs');
const { importFiles, limitOf, readOnlineInfo } = require('../library.cjs');
const { decodeEntities } = require('../parse-epub.cjs');

const DISCOVERY_QUERY = 'ライトノベル';
const ORDERS = new Set(['match', 'popular', 'date', 'year']);
const PAGE_SIZE = 24;
// Only proxy off-site covers that the current catalog returned.
const recentCovers = new Map();
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const normalize = value => String(value ?? '').normalize('NFKC').trim();
const titleKey = value => normalize(value).replace(/[^\p{L}\p{N}]/gu, '');
const clip = (value, size = 250) => normalize(value).slice(0, size);
const publicHost = hostname => /^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]+$/i.test(hostname) &&
  !/\.(?:local|localhost|internal|home|test)$/i.test(hostname);
const privateAddresses = new BlockList();
for (const [ip, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 3]]) privateAddresses.addSubnet(ip, bits, 'ipv4');
for (const [ip, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  privateAddresses.addSubnet(ip, bits, 'ipv6');
}

function originOf(value) {
  const input = normalize(value);
  if (!input) return '';
  try {
    const url = new URL(input);
    if (url.protocol === 'https:' && publicHost(url.hostname) && !url.port && !url.username && !url.password &&
        url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch { /* Invalid input is reported below. */ }
  throw Error('BOOK_SITE_INVALID_ORIGIN');
}

function proxyOf(value) {
  const input = normalize(value);
  if (!input) return '';
  try {
    const url = new URL(input);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
        url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch { /* Invalid input is reported below. */ }
  throw Error('BOOK_SITE_INVALID_PROXY');
}

const settingsFile = root => path.join(root, 'data', 'config', 'novel-discover.json');
function readConfig(root) {
  try {
    const config = JSON.parse(fs.readFileSync(settingsFile(root), 'utf8'));
    return { origin: originOf(config.origin), proxy: proxyOf(config.proxy) };
  } catch {
    return { origin: '', proxy: '' };
  }
}

function saveConfig(root, request) {
  const config = { origin: originOf(request.origin), proxy: proxyOf(request.proxy) };
  const file = settingsFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(config));
  fs.renameSync(file + '.tmp', file);
  return config;
}

function vault(root) {
  const directory = path.join(root, 'data', 'config', 'novel-discover');
  fs.mkdirSync(directory, { recursive: true });
  return new SecretStore(directory, undefined, path.join(root, 'native', 'KeyVault.exe'));
}

const validSession = (id, key) => /^\d{1,20}$/.test(id) && /^[a-z\d_.~%+\-/=]{8,250}$/i.test(key);
const sessionCookie = (id, key) => `remix_userid=${id}; remix_userkey=${key}`;
function cookieOf(root, origin) {
  const pair = vault(root).values[origin]?.split(':') || [];
  return validSession(...pair) ? sessionCookie(...pair) : '';
}

function requestStream(url, proxy, { body, headers = {}, timeout = 12000, idle = 0, lookup } = {}) {
  const agent = proxy ? new https.Agent({ proxyEnv: { HTTPS_PROXY: proxy } }) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: body ? 'POST' : 'GET', agent, signal: AbortSignal.timeout(timeout), lookup,
      headers: {
        'User-Agent': 'MeguLit (book catalog)',
        'Accept-Encoding': 'identity',
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
        ...headers,
      }
    }, res => {
      res.once('close', () => agent?.destroy());
      resolve(res);
    });
    req.once('error', error => { agent?.destroy(); reject(error); });
    if (idle) req.setTimeout(idle, () => req.destroy(Error('BOOK_SITE_FILE_NETWORK')));
    req.end(body?.toString());
  });
}

async function jsonRequest(url, proxy, options, allowEmpty = false) {
  const response = await requestStream(url, proxy, options);
  let size = 0;
  const parts = [];
  for await (const chunk of response) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw Error('BOOK_SITE_RESPONSE');
    parts.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { if (!allowEmpty) throw Error(response.statusCode === 429 ? 'BOOK_SITE_RATE_LIMIT' : 'BOOK_SITE_RESPONSE'); }
  return { status: response.statusCode, data, headers: response.headers };
}

async function eapi(config, route, { body, cookie } = {}) {
  const { status, data } = await jsonRequest(config.origin + '/eapi/' + route, config.proxy, {
    body, headers: { Accept: 'application/json', source: 'android', ...(cookie ? { Cookie: cookie } : {}) },
  }, true);
  if (status === 429) throw Error('BOOK_SITE_RATE_LIMIT');
  if (status === 403 && !data) throw Error('BOOK_SITE_WEB_REQUIRED');
  if (!['1', 'true'].includes(String(data?.success)) || status >= 400) {
    const error = clip(data?.error || data?.message).toLowerCase();
    if (/incorrect email|wrong password|invalid password/.test(error)) throw Error('BOOK_SITE_WRONG_LOGIN');
    if (/quota|download limit|daily limit/.test(error)) throw Error('BOOK_SITE_DOWNLOAD_LIMIT');
    if (/confirm.*email|verify.*(?:email|browser)|captcha|personal domain/.test(error)) throw Error('BOOK_SITE_WEB_REQUIRED');
    if (status === 401 || /access denied|authoriz|login|sign in|session.*expired/.test(error)) throw Error('BOOK_SITE_AUTH');
    throw Error('BOOK_SITE_RESPONSE');
  }
  return data;
}

function siteSearch(config, query, order, page, japanese = true) {
  const url = new URL('/s/' + encodeURIComponent(query), config.origin);
  url.searchParams.set('page', page);
  if (japanese) url.searchParams.set('languages[]', 'japanese');
  if (order !== 'match') url.searchParams.set('order', order);
  return url.href;
}

function record(book, origin) {
  const title = clip(book.title);
  if (!title || book.deleted === 1 || book.active === 0) return null;
  const id = String(book.id ?? '');
  const hash = String(book.hash ?? '');
  let url;
  try { url = new URL(book.href || book.url, origin); } catch { return null; }
  if (url.origin !== origin || !url.pathname.startsWith('/book/') || url.username || url.password) return null;
  let cover = '';
  try {
    const candidate = book.cover && new URL(book.cover, origin);
    if (candidate?.protocol === 'https:' && publicHost(candidate.hostname) &&
        !candidate.username && !candidate.password && !candidate.port) cover = candidate.href;
  } catch { /* Keep the cover placeholder. */ }
  const language = clip(book.language, 48);
  return {
    id, hash, title, url: url.href, cover, language, author: clip(book.author), year: clip(book.year, 8),
    extension: clip(book.extension, 10).toLowerCase(), size: clip(book.filesizeString, 30),
    japanese: /^(?:japanese|ja|jpn|日本語|日语|日文)$/i.test(language) || (!language && kana.test(title)),
    downloadable: /^\d{1,20}$/.test(id) && /^[a-f\d]{5,32}$/i.test(hash),
  };
}

function bookRef(request, config) {
  if (!config.origin || request.origin !== config.origin) throw Error('BOOK_SITE_INVALID_ORIGIN');
  const id = String(request.id || '');
  const hash = String(request.hash || '');
  if (!/^\d{1,20}$/.test(id) || !/^[a-f\d]{5,32}$/i.test(hash)) throw Error('BOOK_SITE_BOOK_REF');
  return { id, hash };
}

function rememberCovers(config, books) {
  for (const { cover } of books) {
    if (!cover || new URL(cover).origin === config.origin) continue;
    const key = config.origin + ' ' + cover;
    recentCovers.delete(key);
    recentCovers.set(key, true);
    if (recentCovers.size > 1024) recentCovers.delete(recentCovers.keys().next().value);
  }
}

async function detail(request, { root }) {
  const config = readConfig(root);
  const { id, hash } = bookRef(request, config);
  const cookie = cookieOf(root, config.origin);
  const route = `book/${id}/${hash}`;
  let result;
  try { result = await eapi(config, route, { cookie }); }
  catch (error) {
    if (!cookie || error.message !== 'BOOK_SITE_AUTH') throw error;
    result = await eapi(config, route);
  }
  const raw = result.book;
  if (!raw || String(raw.id) !== id) throw Error('BOOK_SITE_RESPONSE');
  const book = record({ ...raw, hash: raw.hash || hash, href: raw.href || raw.url || `/book/${id}/${hash}` }, config.origin);
  if (!book) throw Error('BOOK_SITE_RESPONSE');
  rememberCovers(config, [book]);
  const summary = decodeEntities(String(raw.description || '').slice(0, 10000)
    .replace(/<br\b[^>]*>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '')).trim().slice(0, 5000);
  return { ...book, description: summary, publisher: clip(raw.publisher), pages: Math.max(0, Math.trunc(Number(raw.pages) || 0)),
    isbn: clip(raw.identifier || raw.isbn, 90) };
}

async function originalTitle(query, root, db, runtime, proxy) {
  if (!/\p{Script=Han}/u.test(query) || kana.test(query)) return '';
  const { base, volume } = titleParts(query);
  const exact = titleKey(base);
  const existing = db.prepare("SELECT id, title FROM novels WHERE languages LIKE 'ja%' AND status='active'").all();
  for (const row of existing) {
    const provider = readOnlineInfo(root, row.id);
    if (titleKey(provider?.alternate) === exact) {
      return volume == null ? titleParts(row.title).base : `${titleParts(row.title).base} ${volume}`;
    }
  }
  const match = await Promise.any([
    (async () => {
      const request = async (url, options) => {
        const { data } = await jsonRequest(url, proxy, { ...options, timeout: 5000 });
        return data;
      };
      const reviews = runtime?.reviews?.();
      const cached = (key, ttl, load) => reviews ? reviews.cached('book-site:' + key, ttl, load) : load();
      const candidates = await searchBangumi({ request, cached }, base, true);
      const variants = candidates.flatMap(candidate => [
        candidate, ...candidate.aliases.map(alternate => ({ ...candidate, alternate })),
      ]);
      const found = bestMatch({ title: base }, variants)?.title || (exact.length >= 5 && variants.find(candidate =>
        normalize(candidate.alternate).split(/[\s\p{P}]/u, 1).some(first => titleKey(first) === exact)
      )?.title);
      if (!found || found === base) throw Error();
      return found;
    })(),
    (async () => {
      const params = new URLSearchParams({ action: 'query', prop: 'langlinks', lllang: 'ja', redirects: '1',
        format: 'json', formatversion: '2', titles: base.replace(/[|\r\n]/g, '') });
      const { data } = await jsonRequest('https://zh.wikipedia.org/w/api.php?' + params, proxy, { timeout: 4500 });
      const found = clip(data.query?.pages?.[0]?.langlinks?.[0]?.title).replace(/\s*\((?:小説|ライトノベル|漫画)\)$/, '');
      if (!found || found === base) throw Error();
      return found;
    })(),
  ]).catch(() => '');
  return match && volume != null ? `${match} ${volume}` : match;
}

async function queryPage(config, query, order, page, japanese, cookie) {
  const body = new URLSearchParams({ message: query, page, limit: PAGE_SIZE });
  if (order !== 'match') body.set('order', order);
  if (japanese) body.set('languages[0]', 'japanese');
  const data = await eapi(config, 'book/search', { body, cookie });
  if (!Array.isArray(data.books)) throw Error('BOOK_SITE_RESPONSE');
  return {
    books: data.books.map(book => record(book, config.origin)).filter(Boolean),
    more: Boolean(data.pagination?.next ?? data.pagination?.hasNext ?? (data.books.length >= PAGE_SIZE)),
  };
}

async function discover(request, { root, db, runtime }) {
  const config = readConfig(root);
  const query = clip(request.query, 160);
  const order = ORDERS.has(request.order) ? request.order : query ? 'match' : 'popular';
  const page = Math.min(500, Math.max(1, Math.trunc(Number(request.page) || 1)));
  if (!config.origin) return { books: [], page, more: false, error: 'BOOK_SITE_UNCONFIGURED' };
  const browseQuery = query || DISCOVERY_QUERY;
  const url = siteSearch(config, browseQuery, order, page);
  let cookie = '';
  try {
    cookie = cookieOf(root, config.origin);
    const translated = query ? originalTitle(query, root, db, runtime, config.proxy).catch(() => '') : Promise.resolve('');
    const initial = queryPage(config, browseQuery, order, page, true, cookie).catch(error => {
      if (!cookie || error.message !== 'BOOK_SITE_AUTH') throw error;
      cookie = '';
      return queryPage(config, browseQuery, order, page, true);
    });
    const [primary, alias] = await Promise.all([initial, translated]);
    const additional = [];
    if (alias) additional.push(queryPage(config, alias, order, page, true, cookie));
    if (query) additional.push(queryPage(config, query, order, page, false, cookie));
    const results = await Promise.allSettled(additional);
    const lists = [...results.slice(0, alias ? 1 : 0), { status: 'fulfilled', value: primary },
      ...results.slice(alias ? 1 : 0)].filter(result => result.status === 'fulfilled').map(result => result.value);
    const seen = new Set();
    const books = lists.flatMap(list => list.books).filter(book => {
      const key = book.id || book.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => Number(b.japanese) - Number(a.japanese));
    // The desktop CSP permits local images and data URLs. Use the bounded cover service even on direct connections.
    rememberCovers(config, books);
    return { books, alias, page, more: lists.some(list => list.more), url, host: config.origin, proxiedCovers: true };
  } catch (error) {
    const code = /^BOOK_SITE_[A-Z_]+$/.test(error.message) ? error.message : 'BOOK_SITE_UNAVAILABLE';
    return { books: [], page, more: false, error: code, url, host: config.origin };
  }
}

function openSite(request, { root }) {
  const url = new URL(request.url);
  if (url.origin !== readConfig(root).origin || url.username || url.password ||
      !/^\/(?:$|s\/|book\/)/.test(url.pathname)) throw Error('BOOK_SITE_INVALID_ORIGIN');
  const child = spawn('explorer.exe', [url.href], { windowsHide: true, detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  return { opened: true };
}

async function profile(config, cookie) {
  if (!cookie) return { status: 'signedOut', signedIn: false, hasSession: false };
  try {
    const result = await eapi(config, 'user/profile', { cookie });
    const user = result.user || result.response?.user || result.response;
    if (String(user?.id ?? user?.user_id) !== /^remix_userid=(\d+);/.exec(cookie)?.[1]) throw Error('BOOK_SITE_AUTH');
    const count = value => value != null && /^\d+$/.test(String(value)) ? Number(value) : null;
    const used = count(user.downloads_today);
    const limit = count(user.downloads_limit);
    return { status: 'verified', signedIn: true, hasSession: true,
      quota: used != null && limit != null ? { used, limit } : null };
  } catch (error) {
    return { status: error.message === 'BOOK_SITE_AUTH' ? 'expired' : 'unavailable', signedIn: false, hasSession: true };
  }
}

function readSession(result, cookies = []) {
  const user = result?.user || result?.response?.user || result?.response || {};
  const field = name => cookies.map(value => value.match(new RegExp(`^${name}=([^;]+)`, 'i'))?.[1]).find(Boolean);
  const id = String(user.id ?? user.user_id ?? field('remix_userid') ?? '');
  const key = String(user.remix_userkey ?? user.user_key ?? field('remix_userkey') ?? '');
  if (!validSession(id, key)) throw Error('BOOK_SITE_AUTH');
  return { id, key };
}

async function login(root, request) {
  const config = readConfig(root);
  if (request.origin !== config.origin) throw Error('BOOK_SITE_INVALID_ORIGIN');
  const email = clip(request.email, 254);
  const password = typeof request.password === 'string' ? request.password : '';
  if (!email || !password || password.length > 1024) throw Error('BOOK_SITE_AUTH');
  const credentials = { email, password };
  let session;
  try {
    session = readSession(await eapi(config, 'user/login', { body: new URLSearchParams(credentials) }));
  } catch (error) {
    if (!['BOOK_SITE_AUTH', 'BOOK_SITE_RESPONSE'].includes(error.message)) throw error;
    const { data, headers, status } = await jsonRequest(config.origin + '/rpc.php', config.proxy, {
      body: new URLSearchParams({ ...credentials, action: 'login', site_mode: 'books', isModal: 'true',
        isSingleLogin: '1', gg_json_mode: '1' }),
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Origin: config.origin },
    }, true);
    if (status === 429) throw Error('BOOK_SITE_RATE_LIMIT');
    if (data?.response?.validationError) throw Error('BOOK_SITE_WRONG_LOGIN');
    if (!data && !headers['set-cookie']) throw Error('BOOK_SITE_WEB_REQUIRED');
    session = readSession(data, headers['set-cookie'] || []);
  }
  const verified = await profile(config, sessionCookie(session.id, session.key));
  if (!verified.signedIn) throw Error(verified.status === 'expired' ? 'BOOK_SITE_AUTH' : 'BOOK_SITE_VERIFY_FAILED');
  vault(root).set(config.origin, session.id + ':' + session.key);
  return { ...config, ...verified };
}

async function configuration(request, { root }) {
  if (request.operation === 'login') return login(root, request);
  const config = request.operation === 'save' ? saveConfig(root, request) : readConfig(root);
  if (!config.origin) return { ...config, status: 'unconfigured', signedIn: false, hasSession: false };
  if (request.operation === 'logout') vault(root).set(config.origin, '');
  return { ...config, ...(await profile(config, cookieOf(root, config.origin))) };
}

function safeUrl(link, origin) {
  let url;
  try { url = new URL(link, origin); } catch { throw Error('BOOK_SITE_DOWNLOAD_LINK'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !publicHost(url.hostname)) throw Error('BOOK_SITE_DOWNLOAD_LINK');
  return url;
}

async function cover(request, { root, runtime }) {
  const config = readConfig(root);
  if (!config.origin) throw Error('BOOK_SITE_UNCONFIGURED');
  const url = safeUrl(request.url, config.origin);
  const offSite = url.origin !== config.origin;
  if (offSite && !recentCovers.has(config.origin + ' ' + url.href)) throw Error('BOOK_SITE_DOWNLOAD_LINK');
  const load = async () => {
    const lookup = offSite ? await publicLookup(url.hostname) : undefined;
    // Direct connections can pin off-site DNS; a proxy resolves the hostname itself.
    const response = await requestStream(url, offSite ? '' : config.proxy, { timeout: 7000, lookup });
    const mime = String(response.headers['content-type']).split(';')[0].toLowerCase();
    if (response.statusCode !== 200 || !/^image\/(?:jpeg|png|webp|gif)$/.test(mime)) {
      response.destroy();
      throw Error('BOOK_SITE_RESPONSE');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response) {
      size += chunk.length;
      if (size > 600 * 1024) throw Error('BOOK_SITE_RESPONSE');
      chunks.push(chunk);
    }
    return { data: `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}` };
  };
  const reviews = runtime?.reviews?.();
  return reviews ? reviews.cached(`book-site:cover:${config.proxy}:${url.href}`, 300000, load) : load();
}

async function publicLookup(hostname) {
  const addresses = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address, family }) =>
    privateAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6') || (family === 6 && !/^[23][\da-f]{3}:/i.test(address)))) {
    throw Error('BOOK_SITE_FILE_HOST');
  }
  return (_host, options, callback) => callback(null, options.all ? addresses : addresses[0].address, addresses[0].family);
}

async function openDownload(url, config, cookie, referer) {
  for (let hops = 0; hops < 6; hops++) {
    const same = url.origin === config.origin;
    const lookup = same ? undefined : await publicLookup(url.hostname);
    const response = await requestStream(url, config.proxy, {
      lookup, timeout: 45 * 60 * 1000, idle: 35000,
      headers: same ? { Cookie: cookie, ...(referer ? { Referer: referer } : {}) } : {},
    }).catch(() => { throw Error('BOOK_SITE_FILE_NETWORK'); });
    if (response.statusCode === 200) {
      if (!/html|json/i.test(String(response.headers['content-type']))) return response;
      response.destroy();
      throw Error('BOOK_SITE_WEB_REQUIRED');
    }
    response.destroy();
    if (response.statusCode === 401 || response.statusCode === 403) throw Error('BOOK_SITE_WEB_REQUIRED');
    if (response.statusCode === 429) throw Error('BOOK_SITE_RATE_LIMIT');
    if (!response.headers.location || response.statusCode < 300 || response.statusCode > 399) throw Error('BOOK_SITE_FILE_NETWORK');
    url = safeUrl(response.headers.location, url);
  }
  throw Error('BOOK_SITE_DOWNLOAD_LINK');
}

async function download(request, { root, db, openDb }, report = () => {}) {
  const config = readConfig(root);
  const { id, hash } = bookRef(request, config);
  const cookie = cookieOf(root, config.origin);
  if (!cookie) throw Error('BOOK_SITE_AUTH');
  const requestedExt = '.' + clip(request.extension, 10).toLowerCase();
  if (!['.pdf', '.epub'].includes(requestedExt)) throw Error('NOVEL_UNSUPPORTED');
  const result = await eapi(config, `book/${id}/${hash}/file`, { cookie });
  const file = result.file || result.response?.file || {};
  const link = file.downloadLink || file.download_link;
  if (file.allowDownload === false || file.allowDownload === 0) throw Error('BOOK_SITE_DOWNLOAD_LIMIT');
  if (typeof link !== 'string' || !link.trim()) throw Error('BOOK_SITE_DOWNLOAD_LINK');
  const ext = file.extension ? '.' + clip(file.extension, 10).toLowerCase().replace(/^\./, '') : requestedExt;
  if (!['.pdf', '.epub'].includes(ext)) throw Error('NOVEL_UNSUPPORTED');
  const response = await openDownload(safeUrl(link, config.origin), config, cookie, `${config.origin}/book/${id}/${hash}`);
  const limit = limitOf(ext);
  const length = Number(response.headers['content-length']);
  const total = Number.isSafeInteger(length) && length > 0 ? length : 0;
  let folder, target;
  try {
    if (total > limit) throw Error('NOVEL_FILE_TOO_LARGE');
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-book-'));
    let name = clip(request.title, 100).replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/^\.+|[. ]+$/g, '') || id;
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
    target = path.join(folder, name + ext);
    let received = 0;
    report({ phase: 'downloading', received, total });
    await pipeline(response, new Transform({
      transform(chunk, _, callback) {
        received += chunk.length;
        if (received > limit) { callback(Error('NOVEL_FILE_TOO_LARGE')); return; }
        report({ phase: 'downloading', received, total });
        callback(null, chunk);
      }
    }), fs.createWriteStream(target, { flags: 'wx' }));
    if (!received || (total && received !== total)) throw Error('BOOK_SITE_FILE_NETWORK');
    report({ phase: 'importing', received, total: received, step: 'read' });
    const connection = db || openDb();
    try {
      return await importFiles(root, connection, [target], {
        owned: true, onProgress: step => report({ phase: 'importing', step }),
      });
    } finally {
      if (!db) connection.close();
    }
  } finally {
    response.destroy();
    if (target) await fs.promises.unlink(target).catch(() => {});
    if (folder) await fs.promises.rmdir(folder).catch(() => {});
  }
}

module.exports = { discover, search: discover, test: discover, configuration, detail, bookRef, readConfig, openSite, cover, download };
