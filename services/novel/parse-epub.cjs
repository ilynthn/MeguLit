// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 本地 EPUB：用 core/zip-extract.cjs 读包（已支持 Zip64 / stored / deflate / Shift-JIS 文件名），
   再走 container.xml → OPF(manifest+spine) → nav.xhtml 或 toc.ncx → 逐个 XHTML 转段落。
   不引 XML 库：EPUB 的这几个文件结构稳定，正则足够，且能容忍属性顺序、命名空间前缀与自闭合写法。 */
const path = require('node:path');
const zip = require('../../core/zip-extract.cjs');

const MAX_BYTES = 64 * 1024 * 1024;

const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', times: '×', copy: '©', reg: '®', trade: '™',
  emsp: '\u3000', ensp: ' ', thinsp: ' '
};
const decodeEntities = value => String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
  if (name[0] === '#') {
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  }
  return Object.prototype.hasOwnProperty.call(ENT, name.toLowerCase()) ? ENT[name.toLowerCase()] : match;
});

const attr = (tag, name) => {
  const pattern = new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i');
  const found = pattern.exec(tag);
  return found ? decodeEntities(found[2] ?? found[3] ?? '') : '';
};
const stripTags = value => decodeEntities(String(value || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function resolveHref(base, href) {
  const clean = String(href || '').split('#')[0].trim();
  if (!clean) return '';
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* 保留原样 */ }
  const joined = path.posix.normalize(path.posix.join(base || '', decoded));
  return joined.replace(/^\.\//, '');
}

/* ---- 正文：<ruby> 先摘出来（EPUB 的注音比重新分词准），其余标签按块级换行 ---- */
function htmlToBlocks(html) {
  const found = [];
  let text = String(html || '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|svg|nav|math)\b[\s\S]*?<\/\1>/gi, ' ')
    /* EPUB 里的插图先摘成占位符，等段落切完再按位置插回去 */
    .replace(/<img\b[^>]*>/gi, tag => {
      const src = attr(tag, 'src');
      if (!src) return '';
      found.push({ src });
      return `\n\u0000IMG${found.length - 1}\u0000\n`;
    })
    .replace(/<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi, (match, inner) => {
      const rt = /<rt\b[^>]*>([\s\S]*?)<\/rt>/i.exec(inner);
      const base = inner.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '').replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, '');
      const surface = stripTags(base);
      const reading = rt ? stripTags(rt[1]) : '';
      return reading ? `${surface}（${reading}）` : surface;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  text = decodeEntities(text).replace(/\u00a0/g, ' ');
  const paragraphs = [];
  const images = [];
  for (const raw of text.split(/\n+/)) {
    const marker = /^\u0000IMG(\d+)\u0000$/.exec(raw.trim());
    if (marker) {
      const img = found[Number(marker[1])];
      if (img) { img.after = paragraphs.length; images.push(img); }
      continue;
    }
    const line = raw.replace(/[ \t\u3000]+/g, ' ').trim();
    if (line) paragraphs.push(line);
  }
  return { paragraphs, images };
}

function htmlToParagraphs(html) {
  return htmlToBlocks(html).paragraphs;
}

function readCoverId(opf) {
  const meta = /<meta\b[^>]*name\s*=\s*["']cover["'][^>]*>/i.exec(opf);
  return meta ? attr(meta[0], 'content') : '';
}

function parseManifest(opf) {
  const items = [];
  const pattern = /<item\b[^>]*\/?>/gi;
  let match;
  while ((match = pattern.exec(opf))) {
    const tag = match[0];
    const href = attr(tag, 'href');
    if (!href) continue;
    items.push({
      id: attr(tag, 'id'),
      href,
      type: attr(tag, 'media-type').toLowerCase(),
      properties: attr(tag, 'properties').toLowerCase()
    });
  }
  return items;
}

function parseSpine(opf, items) {
  const byId = new Map(items.map(item => [item.id, item]));
  const order = [];
  const pattern = /<itemref\b[^>]*\/?>/gi;
  let match;
  while ((match = pattern.exec(opf))) {
    const item = byId.get(attr(match[0], 'idref'));
    if (item && /x?html/.test(item.type || 'xhtml')) order.push(item);
  }
  const spineTag = /<spine\b[^>]*>/i.exec(opf);
  return { order, tocId: spineTag ? attr(spineTag[0], 'toc') : '' };
}

function parseNavDocument(html, base) {
  const toc = [];
  const anchors = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchors.exec(html))) {
    const href = resolveHref(base, match[1]);
    const title = stripTags(match[2]);
    if (href && title) toc.push({ href, title });
  }
  return toc;
}

function parseNcx(xml, base) {
  const toc = [];
  const points = /<navPoint\b[\s\S]*?<\/navPoint>/gi;
  let match;
  while ((match = points.exec(xml))) {
    const label = /<text\b[^>]*>([\s\S]*?)<\/text>/i.exec(match[0]);
    const content = /<content\b[^>]*>/i.exec(match[0]);
    const href = content ? resolveHref(base, attr(content[0], 'src')) : '';
    const title = label ? stripTags(label[1]) : '';
    if (href && title) toc.push({ href, title });
  }
  return toc;
}

function firstHeading(html) {
  for (const name of ['h1', 'h2', 'h3', 'title']) {
    const found = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i').exec(html);
    const text = found ? stripTags(found[1]) : '';
    if (text) return text;
  }
  return '';
}

async function readEpub(file) {
  const list = await zip.entries(file, { maxIndex: MAX_BYTES, maxEntries: 20000 });
  if (!list.length) throw Error('NOVEL_PARSE_FAILED');
  const byName = new Map(list.map(entry => [entry.name.replace(/\\/g, '/'), entry]));
  const find = name => {
    if (byName.has(name)) return byName.get(name);
    const lower = name.toLowerCase();
    for (const [key, entry] of byName) if (key.toLowerCase() === lower) return entry;
    return null;
  };
  const read = async name => {
    const entry = find(name);
    if (!entry) return '';
    const bytes = await zip.readMember(file, entry, MAX_BYTES);
    return new TextDecoder('utf-8').decode(bytes);
  };

  const container = await read('META-INF/container.xml');
  const rootfile = /<rootfile\b[^>]*>/i.exec(container);
  const opfPath = rootfile ? attr(rootfile[0], 'full-path') : '';
  if (!opfPath) throw Error('NOVEL_PARSE_FAILED');
  const opf = await read(opfPath);
  if (!opf) throw Error('NOVEL_PARSE_FAILED');
  const base = path.posix.dirname(opfPath) === '.' ? '' : path.posix.dirname(opfPath);

  const title = stripTags((/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf) || [])[1] || '');
  const { isbnOf } = require('./identity.cjs');
  const isbn = [...opf.matchAll(/<dc:identifier\b[^>]*>([\s\S]*?)<\/dc:identifier>/gi)]
    .map(([, value]) => isbnOf(stripTags(value))).find(Boolean) || '';
  const author = stripTags((/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i.exec(opf) || [])[1] || '');
  const language = stripTags((/<dc:language\b[^>]*>([\s\S]*?)<\/dc:language>/i.exec(opf) || [])[1] || '');
  const introRaw = (/<dc:description\b[^>]*>([\s\S]*?)<\/dc:description>/i.exec(opf) || [])[1] || '';

  const items = parseManifest(opf);
  const spine = parseSpine(opf, items);

  let toc = [];
  const navItem = items.find(item => item.properties.split(/\s+/).includes('nav'));
  if (navItem) toc = parseNavDocument(await read(resolveHref(base, navItem.href)), base);
  if (!toc.length) {
    const ncx = items.find(item => item.type === 'application/x-dtbncx+xml') ||
      items.find(item => spine.tocId && item.id === spine.tocId);
    if (ncx) toc = parseNcx(await read(resolveHref(base, ncx.href)), base);
  }
  const tocMap = new Map();
  for (const entry of toc) if (!tocMap.has(entry.href)) tocMap.set(entry.href, entry.title);

  const chapters = [];
  const squash = value => String(value || '').replace(/[\s\u3000]+/g, '');
  for (const item of spine.order) {
    const href = resolveHref(base, item.href);
    const html = await read(href);
    if (!html) continue;
    const blocks = htmlToBlocks(html);
    const paragraphs = blocks.paragraphs;
    if (!paragraphs.length && !blocks.images.length) continue;
    const chapterTitle = tocMap.get(href) || firstHeading(html) || '';
    /* 正文第一行常常就是章名本身，和目录标题重复，去掉 */
    if (chapterTitle && paragraphs.length > 1 && squash(paragraphs[0]) === squash(chapterTitle)) {
      paragraphs.shift();
      for (const img of blocks.images) img.after = Math.max(0, img.after - 1);
    }
    chapters.push({
      title: chapterTitle,
      paragraphs,
      images: blocks.images.map(img => ({ after: img.after, href: resolveHref(path.posix.dirname(href), img.src) }))
    });
  }
  if (!chapters.length) throw Error('NOVEL_PARSE_FAILED');

  /* 插图实体：按 href 去重，交给导入层落盘 */
  const assets = [];
  const seenAsset = new Set();
  for (const chapter of chapters) {
    for (const img of chapter.images) {
      if (seenAsset.has(img.href)) continue;
      seenAsset.add(img.href);
      const entry = find(img.href);
      if (!entry) continue;
      try {
        const bytes = await zip.readMember(file, entry, MAX_BYTES);
        if (bytes && bytes.length && bytes.length <= 12 * 1024 * 1024) assets.push({ href: img.href, bytes });
      } catch { /* 单张图失败不影响整本 */ }
    }
  }

  let cover = null;
  const coverItem = items.find(item => item.properties.includes('cover-image')) ||
    items.find(item => item.id === readCoverId(opf)) ||
    items.find(item => /^image\//.test(item.type) && /cover/i.test(item.href));
  if (coverItem) {
    const entry = find(resolveHref(base, coverItem.href));
    if (entry) cover = { bytes: await zip.readMember(file, entry, MAX_BYTES), href: coverItem.href };
  }

  return {
    title: title || path.basename(file, path.extname(file)),
    isbn,
    author,
    language,
    /* dc:description 里常是转义过的 HTML（&lt;p&gt;…），先解码再剥标签 */
    intro: htmlToParagraphs(decodeEntities(introRaw)).join('\n').slice(0, 1200),
    chapters,
    assets,
    cover
  };
}

module.exports = { readEpub, htmlToParagraphs, decodeEntities };
