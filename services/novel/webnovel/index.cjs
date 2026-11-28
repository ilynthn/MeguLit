// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 内置网文书源：syosetu（日文原文）+ linovelib（中文汉化），以及两边的作品配对和对照阅读。
   设置：data/config/novel-web.json（开关）；手动配对：data/config/novel-web-pairs.json。代理沿用书源设置里的 HTTP 代理。 */
const fs = require('node:fs');
const path = require('node:path');
const { createFetcher, RELAY, MIRRORS } = require('./fetch.cjs');
const syosetu = require('./syosetu.cjs');
const linovelib = require('./linovelib.cjs');
const { rankWorks, matchChapters } = require('./match.cjs');
const { alignChapter } = require('./align.cjs');
const { simplify } = require('./kanji.cjs');

const BUILTIN = ['syosetu', 'linovelib'];
const settingsFile = root => path.join(root, 'data', 'config', 'novel-web.json');
const pairsFile = root => path.join(root, 'data', 'config', 'novel-web-pairs.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 1));
  fs.renameSync(file + '.tmp', file);
}

function readSettings(root) {
  const saved = readJson(settingsFile(root), {});
  const enabled = {};
  for (const id of BUILTIN) enabled[id] = saved?.enabled?.[id] !== false;
  return { enabled };
}

const proxyOf = root => {
  try { return require('../source/book-site.cjs').readConfig(root).proxy || ''; } catch { return ''; }
};

/* 每个服务实例一份抓取器（限速队列与「上次通的线路」在进程内共享） */
const fetchers = new Map();
function sources(root, options = {}) {
  const proxy = options.proxy ?? proxyOf(root);
  const cacheKey = root + '\n' + proxy;
  let fetcher = options.fetcher || fetchers.get(cacheKey);
  if (!fetcher) {
    fetcher = createFetcher({ root, proxy });
    fetchers.set(cacheKey, fetcher);
  }
  return { syosetu: syosetu.create(fetcher), linovelib: linovelib.create(fetcher), fetcher, proxy };
}

const failure = error => ({ error: /^WEBNOVEL_[A-Z_]+$/.test(error?.message) ? error.message : 'WEBNOVEL_INTERNAL',
  attempts: error?.attempts || [], ...(error?.url ? { url: error.url } : {}) });

function routeList(root, proxy) {
  const describe = (name, site) => ({
    name,
    state: name === 'proxy' ? (proxy ? 'ready' : 'unset') : name === 'direct' ? 'ready'
      : name === 'relay' ? (RELAY.enabled ? 'ready' : 'not-deployed') : (MIRRORS.some(entry => entry.site === site) ? 'ready' : 'none-approved'),
  });
  return {
    syosetu: syosetu.SITE.routes.map(name => describe(name, 'syosetu')),
    linovelib: linovelib.SITE.routes.map(name => describe(name, 'linovelib')),
  };
}

function config(root, request) {
  const current = readSettings(root);
  if (request.operation === 'save' && request.enabled && typeof request.enabled === 'object') {
    for (const id of BUILTIN) if (typeof request.enabled[id] === 'boolean') current.enabled[id] = request.enabled[id];
    writeJson(settingsFile(root), current);
  }
  const proxy = proxyOf(root);
  const routes = routeList(root, proxy);
  return {
    sources: BUILTIN.map(id => ({ id, lang: id === 'syosetu' ? 'ja' : 'zh', origin: id === 'syosetu' ? 'https://syosetu.com/' : 'https://www.linovelib.com/',
      enabled: current.enabled[id], routes: routes[id] })),
    proxy: Boolean(proxy),
  };
}

const pairKey = id => 'syosetu:' + id;
function readPairs(root) { return readJson(pairsFile(root), {}) || {}; }

/* 找中文版：手动配过的优先；否则按作者作品页打分，够把握才自动选 */
async function counterpart(root, src, work) {
  const saved = readPairs(root)[pairKey(work.id)];
  if (saved?.zh === null) return { zh: null, candidates: [], manual: true };
  if (saved?.zh) return { zh: await src.linovelib.toc(saved.zh), candidates: [], manual: true };
  const authors = [...new Set([work.author, simplify(work.author)].map(name => String(name || '').replace(/[\s　]+/g, '')).filter(Boolean))];
  const found = [];
  for (const author of authors) {
    for (const item of await src.linovelib.byAuthor(author)) if (!found.some(entry => entry.id === item.id)) found.push({ ...item, author });
    if (found.length) break;
  }
  const ranked = rankWorks(work, found);
  const best = ranked.find(item => item.match.sure);
  return { zh: best ? await src.linovelib.toc(best.id) : null, candidates: ranked.slice(0, 8), manual: false };
}

async function work(root, request, options) {
  const src = sources(root, options);
  const settings = readSettings(root);
  if (!settings.enabled.syosetu) return { error: 'WEBNOVEL_SOURCE_DISABLED', source: 'syosetu' };
  let ja;
  try { ja = await src.syosetu.toc(request.id); } catch (error) { return { ...failure(error), side: 'ja' }; }
  const result = { ja, zh: null, candidates: [], chapters: [], manual: false };
  if (!settings.enabled.linovelib) return { ...result, zhDisabled: true };
  try {
    Object.assign(result, await counterpart(root, src, ja));
  } catch (error) {
    return { ...result, zhError: failure(error), searchUrl: src.linovelib.searchUrl(ja.title) };
  }
  result.searchUrl = src.linovelib.searchUrl(ja.title);
  if (result.zh) {
    const overrides = readPairs(root)[pairKey(ja.id)]?.chapters || {};
    result.chapters = matchChapters(ja.chapters, result.zh.chapters).map((entry, index) => {
      const forced = overrides[ja.chapters[index].id];
      if (forced === null) return { zh: null, score: 0, sure: true, manual: true };
      if (forced !== undefined) {
        /* 有书号的章按书号记；目录里是坏链接的章按位置记成 #序号 */
        const target = String(forced).startsWith('#') ? Number(String(forced).slice(1))
          : result.zh.chapters.findIndex(chapter => chapter.id === forced);
        if (target >= 0 && target < result.zh.chapters.length) return { zh: target, score: 1, sure: true, manual: true };
      }
      return entry;
    });
  }
  return result;
}

function pair(root, request) {
  const id = syosetu.ncodeOf(request.id);
  if (!id) throw Error('WEBNOVEL_BAD_ID');
  const pairs = readPairs(root);
  const entry = pairs[pairKey(id)] || {};
  if ('zh' in request) {
    if (request.zh === null || request.zh === '') entry.zh = request.zh === null ? null : undefined;
    else {
      const zh = linovelib.bookIdOf(request.zh);
      if (!zh) throw Error('WEBNOVEL_BAD_ID');
      if (entry.zh !== zh) entry.chapters = {};
      entry.zh = zh;
    }
  }
  if (request.chapter !== undefined) {
    entry.chapters ||= {};
    const value = request.zhChapter;
    if (value === undefined) delete entry.chapters[String(request.chapter)];
    else entry.chapters[String(request.chapter)] = value === null ? null : String(value);
  }
  if (entry.zh === undefined && !Object.keys(entry.chapters || {}).length) delete pairs[pairKey(id)];
  else pairs[pairKey(id)] = entry;
  writeJson(pairsFile(root), pairs);
  return { saved: true };
}

/* 一话对照：request { id, chapter, zh?, zhChapter?, zhIndex? } */
async function chapter(root, request, options) {
  const src = sources(root, options);
  let ja;
  try { ja = await src.syosetu.chapter(request.id, request.chapter); } catch (error) { return { ...failure(error), side: 'ja' }; }
  const result = { ja, zh: null };
  if (request.zh && (request.zhChapter || Number.isInteger(request.zhIndex))) {
    try {
      const toc = Number.isInteger(request.zhIndex) && !request.zhChapter ? (await src.linovelib.toc(request.zh)).chapters : [];
      result.zh = await src.linovelib.chapter(request.zh, request.zhChapter || '', { chapters: toc, index: request.zhIndex });
    } catch (error) { result.zhError = failure(error); }
  }
  /* 日文段落的分词和注音走日报同一套（services/daily.cjs paragraphTokens），点读卡片也复用日报的 */
  const runtime = options?.runtime;
  if (runtime) {
    const paragraphs = ja.blocks.filter(block => block.t === 'p');
    try {
      const tokenized = await require('../../daily.cjs').paragraphTokens(runtime, paragraphs.map(block => block.text));
      paragraphs.forEach((block, index) => { if (tokenized[index]?.tokens?.length) block.tokens = tokenized[index].tokens; });
    } catch { /* 没有分词也能读 */ }
  }
  result.align = alignChapter(ja.blocks, result.zh?.blocks || []);
  return result;
}

/* 只打开两个书源的页面和浏览器搜索页 */
const OPENABLE = /^https:\/\/(?:ncode\.syosetu\.com|syosetu\.com|www\.linovelib\.com|www\.bing\.com\/search)(?:[/?]|$)/;
function open(request) {
  const url = String(request.url || '');
  if (!OPENABLE.test(url)) throw Error('URL_NOT_ALLOWED');
  const child = require('node:child_process').spawn('explorer.exe', [new URL(url).href], { windowsHide: true, detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  return { opened: true };
}

async function test(root, request, options) {
  const src = sources(root, options);
  const id = BUILTIN.includes(request.source) ? request.source : 'syosetu';
  try { return { source: id, ...(await src[id].test()) }; }
  catch (error) { return { source: id, ok: false, ...failure(error) }; }
}

async function search(root, request, options) {
  const src = sources(root, options);
  if (!readSettings(root).enabled.syosetu) return { error: 'WEBNOVEL_SOURCE_DISABLED', items: [] };
  try { return { items: await src.syosetu.search(request.keyword) }; }
  catch (error) { return { items: [], ...failure(error) }; }
}

module.exports = { config, work, pair, chapter, test, search, open, readSettings, sources, OPENABLE };
