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
  const clean = String(href || '').split(/[?#]/)[0].trim().replace(/\\/g, '/');
  if (!clean) return '';
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* 保留原样 */ }
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(decoded)) return '';
  const joined = path.posix.normalize(decoded.startsWith('/') ? decoded : path.posix.join(base || '', decoded));
  return /^\.\.(?:\/|$)/.test(joined) ? '' : joined.replace(/^(?:\.\/|\/)+/, '');
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
      fallback: attr(tag, 'fallback'),
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
    let item = byId.get(attr(match[0], 'idref'));
    const seen = new Set();
    while (item && !seen.has(item.id)) {
      if (isDocument(item)) { order.push(item); break; }
      seen.add(item.id);
      item = byId.get(item.fallback);
    }
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

const isDocument = item => /^(?:application\/xhtml\+xml|text\/html|text\/xml|application\/xml)(?:;|$)/i.test(item.type) ||
  (!item.type || item.type === 'application/octet-stream') && /\.(?:x?html?|xml)(?:[?#]|$)/i.test(item.href);
const unprefix = text => text.replace(/(<\/?)[\w.-]+:(?=(?:container|rootfiles?|package|metadata|manifest|spine|itemref|item|meta|navpoint|navlabel|text|content|html|body|head|p|div|h[1-6]|a|img)\b)/gi, '$1');

function decodeDocument(bytes) {
  const [first, second] = bytes;
  const header = bytes.subarray(0, 512).toString('latin1');
  const declaration = /(?:encoding|charset)\s*=\s*["']?([\w-]+)/i.exec(header)?.[1];
  const encoding = first === 0xff && second === 0xfe || first === 60 && second === 0 ? 'utf-16le'
    : first === 0xfe && second === 0xff || first === 0 && second === 60 ? 'utf-16be' : declaration || 'utf-8';
  try { return new TextDecoder(encoding === 'gb2312' ? 'gb18030' : encoding).decode(bytes); }
  catch { return new TextDecoder().decode(bytes); }
}

function seriesInfo(opf) {
  const legacy = /<meta\b[^>]*\bname\s*=\s*["']calibre:series["'][^>]*>/i.exec(opf)?.[0] || '';
  const legacyNumber = /<meta\b[^>]*\bname\s*=\s*["']calibre:series_index["'][^>]*>/i.exec(opf)?.[0] || '';
  let name = attr(legacy, 'content');
  let position = attr(legacyNumber, 'content');
  if (!name) {
    const meta = [...opf.matchAll(/(<meta\b[^>]*>)([^<]+)<\/meta>/gi)];
    const collection = meta.find(([, tag]) => attr(tag, 'property') === 'belongs-to-collection');
    if (collection) {
      const ref = '#' + attr(collection[1], 'id');
      const type = meta.find(([, tag]) => attr(tag, 'refines') === ref && attr(tag, 'property') === 'collection-type');
      if (!type || type[2].trim().toLowerCase() === 'series') {
        name = stripTags(collection[2]);
        position = meta.find(([, tag]) => attr(tag, 'refines') === ref && attr(tag, 'property') === 'group-position')?.[2];
      }
    }
  }
  return name ? { title: name.trim().slice(0, 160), position: position?.trim() && Number.isFinite(Number(position)) ? Number(position) : null } : null;
}

async function readEpub(file) {
  const list = await zip.entries(file, { maxIndex: MAX_BYTES, maxEntries: 20000 }).catch(() => { throw Error('NOVEL_EPUB_DAMAGED'); });
  if (!list.length) throw Error('NOVEL_EPUB_DAMAGED');
  const normalize = name => resolveHref('', name).normalize('NFC');
  const byName = new Map(list.map(entry => [normalize(entry.name), entry]));
  const byLower = new Map([...byName].map(([name, entry]) => [name.toLowerCase(), entry]));
  const find = name => byName.get(normalize(name)) || byLower.get(normalize(name).toLowerCase());
  const read = async name => {
    const entry = find(name);
    if (!entry) return '';
    try { return unprefix(decodeDocument(await zip.readMember(file, entry, MAX_BYTES))); }
    catch (error) { throw Error(error.message === 'IMPORT_NPA_ENCRYPTED' ? 'NOVEL_EPUB_ENCRYPTED' : 'NOVEL_EPUB_DAMAGED'); }
  };

  const container = await read('META-INF/container.xml');
  const roots = [...container.matchAll(/<rootfile\b[^>]*>/gi)].map(([tag]) => attr(tag, 'full-path')).filter(Boolean);
  const fallback = [...byName.keys()].filter(name => /\.opf$/i.test(name));
  const opfPath = roots.find(find) || (fallback.length === 1 ? fallback[0] : '');
  if (!opfPath) throw Error('NOVEL_EPUB_PACKAGE');
  const opf = await read(opfPath);
  if (!opf) throw Error('NOVEL_EPUB_PACKAGE');
  const base = path.posix.dirname(opfPath) === '.' ? '' : path.posix.dirname(opfPath);

  const metadata = /<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i.exec(opf)?.[1] || '';
  const fields = name => [...metadata.matchAll(new RegExp('<(?:[\\w.-]+:)?' + name + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?' + name + '>', 'gi'))]
    .map(([, value]) => value);
  const title = stripTags(fields('title')[0]);
  const { isbnOf } = require('./identity.cjs');
  const isbn = fields('identifier').map(value => isbnOf(stripTags(value))).find(Boolean) || '';
  const aliases = [...opf.matchAll(/<meta\b[^>]*\bproperty\s*=\s*["'](?:dcterms:alternative|schema:alternateName)["'][^>]*>([\s\S]*?)<\/meta>/gi)]
    .map(([, value]) => stripTags(value)).filter(Boolean).slice(0, 8);
  const sourceIsbn = fields('source').map(value => isbnOf(stripTags(value))).find(Boolean) || '';
  const author = stripTags(fields('creator')[0]);
  const language = stripTags(fields('language')[0]);
  const introRaw = fields('description')[0] || '';

  const items = parseManifest(opf);
  const spine = parseSpine(opf, items);

  let toc = [];
  const navItem = items.find(item => item.properties.split(/\s+/).includes('nav'));
  if (navItem) toc = parseNavDocument(await read(resolveHref(base, navItem.href)).catch(() => ''), base);
  if (!toc.length) {
    const ncx = items.find(item => item.type === 'application/x-dtbncx+xml') ||
      items.find(item => spine.tocId && item.id === spine.tocId);
    if (ncx) toc = parseNcx(await read(resolveHref(base, ncx.href)).catch(() => ''), base);
  }
  const tocMap = new Map();
  for (const entry of toc) if (!tocMap.has(entry.href)) tocMap.set(entry.href, entry.title);

  const chapters = [];
  const byHref = new Map(items.filter(isDocument).map(item => [resolveHref(base, item.href), item]));
  const order = spine.order.length ? spine.order : [...new Set(toc.map(entry => byHref.get(entry.href)).filter(Boolean))];
  const squash = value => String(value || '').replace(/[\s\u3000]+/g, '');
  for (const item of order) {
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
  if (!chapters.length) throw Error('NOVEL_EPUB_CONTENT');

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
    if (entry) {
      try { cover = { bytes: await zip.readMember(file, entry, MAX_BYTES), href: coverItem.href }; }
      catch { /* A broken optional cover must not prevent importing readable chapters. */ }
    }
  }

  return {
    title: title || path.basename(file, path.extname(file)),
    isbn,
    aliases,
    sourceIsbn,
    series: seriesInfo(opf),
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
