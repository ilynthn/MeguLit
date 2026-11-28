// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 哩哩轻小说（www.linovelib.com）：中文汉化，多为书籍版（文库本）的译文。
   2026-11 实测（PR 正文有记录）：
     - 书页 /novel/{id}.html 的 og:novel:* meta 给书名、作者、目录地址；目录 /novel/{id}/catalog 按卷列章，
       个别章节链接是 javascript:cid(0)，要从上一章末页的「下一页」反推；
     - 正文 /novel/{id}/{cid}.html，长章分 {cid}_2.html …；对非浏览器请求每页只给前面几段，
       末尾是「……（內容加載失敗！請刷新或更換瀏覽器）」占位。我们不绕过这个限制：去掉占位、把该页标成不完整，
       对照阅读里缺的段落标「汉化缺失」，可以用 MeguLit 翻译补；
     - 站内搜索（POST /S6/）要图片验证码，不自动搜索；匹配走作者作品页 /authorarticle/{作者}.html（不需要验证），
       找不到时让用户粘贴书页链接；
     - robots.txt 不禁止 /novel/ 与 /authorarticle/。同站串行、每次请求间隔 3 秒，结果落盘缓存。
   选择器与 ZWolken/Light-Novel-Yuedu-Source（MIT）的「哔哩轻小说」阅读书源核对过（#TextContent、li.col-4、下一页）。 */
const { attr, text, inner, meta } = require('./html.cjs');

const ORIGIN = 'https://www.linovelib.com';
const SITE = { id: 'linovelib', routes: ['direct', 'proxy'], gap: 3000 };
const TTL = { book: 6 * 60 * 60e3, toc: 60 * 60e3, chapter: 30 * 24 * 60 * 60e3, author: 6 * 60 * 60e3 };
const TRUNCATED = /(?:……)?\s*（內容加載失敗！請刷新或更換瀏覽器）\s*$/;
const MAX_PAGES = 12;

const bookIdOf = value => {
  const input = String(value || '').trim();
  const found = /linovelib\.com\/novel\/(\d{1,7})(?:[/.]|$)/i.exec(input) || /^(\d{1,7})$/.exec(input);
  return found ? found[1] : '';
};

function parseBook(body, id) {
  const title = meta(body, 'og:novel:book_name') || meta(body, 'og:title');
  if (!title) throw Error('WEBNOVEL_RESPONSE');
  return {
    source: 'linovelib', id, title, author: meta(body, 'og:novel:author'), intro: meta(body, 'og:description').slice(0, 400),
    category: meta(body, 'og:novel:category'), status: meta(body, 'og:novel:status'), url: `${ORIGIN}/novel/${id}.html`,
  };
}

function parseCatalog(body, id) {
  const chapters = [];
  const volumes = String(body).split(/<div\b[^>]*class="volume(?:\s[^"]*)?"[^>]*>/i).slice(1);
  for (const part of volumes) {
    const volume = text((/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(part) || [])[1]);
    for (const item of part.matchAll(/<li\b[^>]*class="[^"]*col-4[^"]*"[^>]*>\s*(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)) {
      const href = attr(item[1], 'href');
      const cid = (new RegExp(`^/novel/${id}/(\\d+)\\.html$`).exec(href) || [])[1] || '';
      const title = text(item[2]);
      /* 插图页只有图，没有可对照的正文 */
      chapters.push({ id: cid, title, volume, extra: /^插图$|^插畫$/.test(title) });
    }
  }
  return chapters;
}

/* 一页正文：{ title, blocks, next, truncated } */
function parsePage(body, id, cid) {
  const title = text((/<div id="mlfy_main_text">\s*<h1>([\s\S]*?)<\/h1>/i.exec(body) || /<h1>([\s\S]*?)<\/h1>/i.exec(body) || [])[1])
    .replace(/（\d+\/\d+）$/, '');
  const holder = /<div\b[^>]*id="TextContent"[^>]*>([\s\S]*?)<\/div>/i.exec(body);
  if (!holder) throw Error('WEBNOVEL_RESPONSE');
  let truncated = false;
  const blocks = [];
  /* 最后一段常常没有 </p>，按 <p> 切开 */
  for (const piece of holder[1].split(/<p\b[^>]*>/i).slice(1)) {
    const html = piece.replace(/<\/p>[\s\S]*$/i, '');
    const image = /<img\b[^>]*>/i.exec(html);
    if (image) {
      const src = attr(image[0], 'data-src') || attr(image[0], 'src');
      if (/^https:\/\//.test(src)) blocks.push({ t: 'img', src });
      continue;
    }
    let plain = text(html);
    if (TRUNCATED.test(plain)) { truncated = true; plain = plain.replace(TRUNCATED, '').trim(); }
    if (plain) blocks.push({ t: 'p', text: plain });
  }
  const pager = /<div class="mlfy_page">([\s\S]*?)<\/div>/i.exec(body)?.[1] || '';
  const nextHref = [...pager.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*下一[页章]\s*<\/a>/g)].map(found => found[1])[0] || '';
  const samePage = new RegExp(`^/novel/${id}/${cid}_(\\d+)\\.html$`).exec(nextHref);
  const nextChapter = new RegExp(`^/novel/${id}/(\\d+)\\.html$`).exec(nextHref);
  return { title, blocks, truncated, nextPage: samePage ? Number(samePage[1]) : 0, nextChapter: nextChapter ? nextChapter[1] : '' };
}

function parseAuthor(body) {
  const out = [];
  for (const cell of String(body).split(/<div class="list-cell\b/).slice(1)) {
    const link = /<p class="tit"><a href="\/novel\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/i.exec(cell);
    if (!link) continue;
    out.push({ source: 'linovelib', id: link[1], title: text(link[2]),
      intro: text((/<p class="ac">([\s\S]*?)<\/p>/i.exec(cell) || [])[1]).slice(0, 200), url: `${ORIGIN}/novel/${link[1]}.html` });
  }
  return out;
}

function create(fetcher) {
  const get = (url, ttl, referer) => fetcher.get(url, { site: SITE, ttl, headers: { Referer: referer || ORIGIN + '/' } });
  const api = {
    id: 'linovelib', lang: 'zh', origin: 'https://www.linovelib.com/',
    bookIdOf,
    async test() {
      const started = Date.now();
      const { route } = await get(`${ORIGIN}/novel/73.html`, 0);
      return { ok: true, route, ms: Date.now() - started };
    },
    async book(value) {
      const id = bookIdOf(value);
      if (!id) throw Error('WEBNOVEL_BAD_ID');
      return parseBook((await get(`${ORIGIN}/novel/${id}.html`, TTL.book)).body, id);
    },
    async byAuthor(name) {
      const author = String(name || '').normalize('NFC').replace(/\s+/g, '').slice(0, 40);
      if (!author || /[/\\?#%]/.test(author)) return [];
      try {
        return parseAuthor((await get(`${ORIGIN}/authorarticle/${encodeURIComponent(author)}.html`, TTL.author)).body);
      } catch (error) {
        if (error.message === 'WEBNOVEL_NOT_FOUND') return [];
        throw error;
      }
    },
    /* 浏览器里搜：站内搜索要验证码，交给用户自己完成 */
    searchUrl: keyword => `https://www.bing.com/search?q=${encodeURIComponent('site:linovelib.com ' + String(keyword || '').slice(0, 80))}`,
    async toc(value) {
      const book = await api.book(value);
      const chapters = parseCatalog((await get(`${ORIGIN}/novel/${book.id}/catalog`, TTL.toc, book.url)).body, book.id);
      return { ...book, chapters };
    },
    /* 目录里的坏链接（没有 id）传 chapters + index，用前一章反推 */
    async chapter(value, chapterId, { chapters = [], index = -1 } = {}) {
      const id = bookIdOf(value);
      let cid = String(chapterId || '');
      if (!cid) cid = await api.resolve(id, chapters, index);
      if (!id || !/^\d{1,9}$/.test(cid)) throw Error('WEBNOVEL_BAD_ID');
      const blocks = [];
      let title = '';
      let truncated = false;
      let page = 1;
      let route = '';
      for (; page <= MAX_PAGES; page++) {
        const url = `${ORIGIN}/novel/${id}/${cid}${page > 1 ? '_' + page : ''}.html`;
        const fetched = await get(url, TTL.chapter, `${ORIGIN}/novel/${id}/catalog`);
        route = fetched.route;
        const parsed = parsePage(fetched.body, id, cid);
        title ||= parsed.title;
        truncated ||= parsed.truncated;
        /* 页尾被截断时补一个占位，对齐时知道这里缺了内容 */
        blocks.push(...parsed.blocks);
        if (parsed.truncated) blocks.push({ t: 'gap' });
        if (!parsed.nextPage) break;
      }
      return { title, blocks, url: `${ORIGIN}/novel/${id}/${cid}.html`, route, complete: !truncated, id: cid };
    },
    /* 目录里 javascript:cid(0) 的章：读前一章最后一页的「下一页」 */
    async resolve(id, chapters, index) {
      const previous = index > 0 ? chapters[index - 1] : null;
      if (!previous?.id) throw Error('WEBNOVEL_BAD_ID');
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${ORIGIN}/novel/${id}/${previous.id}${page > 1 ? '_' + page : ''}.html`;
        const parsed = parsePage((await get(url, TTL.chapter)).body, id, previous.id);
        if (!parsed.nextPage) return parsed.nextChapter;
      }
      throw Error('WEBNOVEL_BAD_ID');
    },
  };
  return api;
}

module.exports = { create, parseBook, parseCatalog, parsePage, parseAuthor, bookIdOf, SITE };
