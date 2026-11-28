// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 小説家になろう（syosetu.com）：日文原文。
   搜索走官方 API（api.syosetu.com/novelapi，JSON）；目录和正文解析 ncode.syosetu.com 的页面。
   页面结构与取段方式参考 Novelia（auto-novel/auto-novel，GPL-3.0，packages/crawler/src/web/syosetu.ts）：
   目录 .p-eplist 下有链接的是话、没链接的是章名，按 .c-pager__item--last 翻页，没有目录的是短篇；
   正文取 .p-novel__body 里的 .js-novel-text 段落，空段保留为空行。这里按 MeguLit 的需要重写，并保留注音。 */
const { attr, text, rubySegments, inner } = require('./html.cjs');

const ORIGIN = 'https://ncode.syosetu.com';
const API = 'https://api.syosetu.com/novelapi/api/';
const SITE = { id: 'syosetu', routes: ['proxy', 'direct', 'relay', 'mirror'], gap: 1200 };
const TTL = { search: 10 * 60e3, toc: 60 * 60e3, chapter: 30 * 24 * 60 * 60e3 };
const MAX_TOC_PAGES = 30;

const ncodeOf = value => {
  const found = /(?:^|\/)(n\d{4}[a-z]{1,3})(?:\/|$)/i.exec(String(value || '').trim()) || /^(n\d{4}[a-z]{1,3})$/i.exec(String(value || '').trim());
  return found ? found[1].toLowerCase() : '';
};
const clean = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();

function parseSearch(body) {
  let data;
  try { data = JSON.parse(body); } catch { throw Error('WEBNOVEL_RESPONSE'); }
  if (!Array.isArray(data)) throw Error('WEBNOVEL_RESPONSE');
  return data.slice(1).filter(row => row && row.ncode).map(row => ({
    source: 'syosetu', id: String(row.ncode).toLowerCase(), title: clean(row.title), author: clean(row.writer),
    intro: String(row.story || '').trim().slice(0, 400), episodes: Number(row.general_all_no) || 0,
    finished: Number(row.end) === 0 ? true : Number(row.end) === 1 ? false : null, short: Number(row.noveltype) === 2,
    url: `${ORIGIN}/${String(row.ncode).toLowerCase()}/`,
  }));
}

/* 一页目录：{ title, author, chapters:[{id,title,volume}], last } */
function parseToc(body, ncode) {
  const title = text((/<h1\b[^>]*class="[^"]*p-novel__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(body) || [])[1]);
  const author = text(inner(body, 'p-novel__author')).replace(/^作者[:：]\s*/, '');
  const list = inner(body, 'p-eplist');
  const chapters = [];
  let volume = '';
  const blocks = /<div\b[^>]*class="(p-eplist__chapter-title|p-eplist__sublist)"[^>]*>([\s\S]*?)(?=<div\b[^>]*class="p-eplist__(?:chapter-title|sublist)"|$)/gi;
  for (let found; (found = blocks.exec(list));) {
    if (found[1] === 'p-eplist__chapter-title') { volume = text(found[2].replace(/<\/div>[\s\S]*$/, '')); continue; }
    const link = /<a\b[^>]*class="[^"]*p-eplist__subtitle[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(found[2]);
    if (!link) continue;
    const href = attr(link[0], 'href');
    const id = (/\/(\d+)\/?$/.exec(href) || [])[1];
    if (id) chapters.push({ id, title: text(link[1]), volume });
  }
  const lastTag = /<a\b[^>]*class="[^"]*c-pager__item--last[^"]*"[^>]*>/i.exec(body);
  const last = lastTag ? Number((/[?&]p=(\d+)/.exec(attr(lastTag[0], 'href')) || [])[1]) || 1 : 1;
  /* 短篇：没有目录，页面本身就是正文 */
  const short = !list && /js-novel-text/.test(body);
  return { id: ncode, title, author, chapters: short ? [{ id: '', title, volume: '' }] : chapters, last, short };
}

/* 正文：blocks = [{t:'p', text, ruby?} | {t:'br'} | {t:'img', src}] */
function parseChapter(body) {
  const title = text((/<h1\b[^>]*class="[^"]*p-novel__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(body) || [])[1]);
  const main = inner(body, 'p-novel__body') || body;
  /* 前书 / 后书是另外的 --preface / --afterword 块，正文只取不带修饰的那一块 */
  const textBlock = /<div\b[^>]*class="(js-novel-text p-novel__text(?:\s+p-novel__text--(\w+))?)"[^>]*>([\s\S]*?)<\/div>/gi;
  const parts = { main: [], preface: [], afterword: [] };
  for (let found; (found = textBlock.exec(main));) {
    const kind = found[2] === 'preface' ? 'preface' : found[2] === 'afterword' ? 'afterword' : 'main';
    for (const p of found[3].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) parts[kind].push(block(p[1]));
  }
  if (!parts.main.length) throw Error('WEBNOVEL_RESPONSE');
  return { title, blocks: parts.main, preface: parts.preface, afterword: parts.afterword };
}

function block(html) {
  const image = /<img\b[^>]*>/i.exec(html);
  if (image) {
    let src = attr(image[0], 'src');
    if (src.startsWith('//')) src = 'https:' + src;
    if (/^https:\/\//.test(src)) return { t: 'img', src };
  }
  const plain = text(html);
  if (!plain) return { t: 'br' };
  const ruby = rubySegments(html);
  return ruby ? { t: 'p', text: plain, ruby } : { t: 'p', text: plain };
}

function create(fetcher) {
  const get = (url, ttl) => fetcher.get(url, { site: SITE, ttl, headers: { Cookie: 'over18=yes' } });
  return {
    id: 'syosetu', lang: 'ja', origin: 'https://syosetu.com/',
    ncodeOf,
    async test() {
      const started = Date.now();
      const { route } = await get(`${API}?out=json&lim=1&of=n`, 0);
      return { ok: true, route, ms: Date.now() - started };
    },
    async search(keyword) {
      const query = clean(keyword).slice(0, 100);
      if (!query) return [];
      const direct = ncodeOf(query);
      const params = new URLSearchParams({ out: 'json', lim: '20', of: 't-n-w-s-ga-nt-e', order: 'hyoka' });
      if (direct) params.set('ncode', direct); else params.set('word', query);
      const { body } = await get(`${API}?${params}`, TTL.search);
      return parseSearch(body);
    },
    async toc(id) {
      const ncode = ncodeOf(id);
      if (!ncode) throw Error('WEBNOVEL_BAD_ID');
      const first = parseToc((await get(`${ORIGIN}/${ncode}/`, TTL.toc)).body, ncode);
      const pages = Math.min(first.last, MAX_TOC_PAGES);
      for (let page = 2; page <= pages; page++) {
        first.chapters.push(...parseToc((await get(`${ORIGIN}/${ncode}/?p=${page}`, TTL.toc)).body, ncode).chapters);
      }
      return { source: 'syosetu', id: ncode, title: first.title, author: first.author, chapters: first.chapters,
        truncatedToc: first.last > MAX_TOC_PAGES, url: `${ORIGIN}/${ncode}/` };
    },
    async chapter(id, chapterId) {
      const ncode = ncodeOf(id);
      const episode = String(chapterId ?? '');
      if (!ncode || !/^\d{0,6}$/.test(episode)) throw Error('WEBNOVEL_BAD_ID');
      const url = episode ? `${ORIGIN}/${ncode}/${episode}/` : `${ORIGIN}/${ncode}/`;
      const { body, route } = await get(url, TTL.chapter);
      return { ...parseChapter(body), url, route, complete: true };
    },
  };
}

module.exports = { create, parseSearch, parseToc, parseChapter, ncodeOf, SITE };
