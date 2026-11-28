// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 文库服务入口：把 novel_* 动作路由到本地书库和联网书源。 */
const library = require('./library.cjs');
const flowSettings = require('./flow-settings.cjs');
const online = require('./online.cjs');
const local = require('./source/local.cjs');
const wenku = require('./source/wenku.cjs');
const bookSite = require('./source/book-site.cjs');
const publicCatalog = require('./source/catalogs.cjs');
const websites = require('./source/websites.cjs');
const downloads = require('./source/downloads.cjs');
const annotate = require('./annotate.cjs');
const bilingual = require('./bilingual.cjs');

const SOURCES = new Map([['local', local], ['wenku', wenku], ['book-site', bookSite]]);
const source = id => SOURCES.get(String(id || 'local')) || local;

async function dispatch(request, ctx) {
  const { db, root, runtime } = ctx;

  const pick = () => source(request.source);
  switch (String(request.action || '')) {
    case 'novel_shelf': {
      const shelf = library.shelf(db, root);
      online.resume(root, runtime, shelf.books.map(book => book.id));
      websites.resume(root, runtime);
      return { ...shelf, flowSettings: flowSettings.read(root) };
    }
    case 'novel_scan': {
      const files = library.scanFolder(String(request.folder || ''));
      if (!files.length) throw Error('NOVEL_SCAN_EMPTY');
      return { folder: String(request.folder || ''), files };
    }
    case 'novel_import': {
      const result = await library.importFiles(root, db, request.paths);
      online.schedule(root, runtime, result.imported.map(book => book.id));
      const incoming = new Set(result.imported.map(book => book.id));
      if (incoming.size) for (const group of library.editionGroups(db, root)) {
        if (group.length < 2 || !group.some(book => incoming.has(book.id))) continue;
        const original = group.find(book => /^(?:ja|jpn)/i.test(book.languages));
        if (original) void bilingual.prepare(db, root, original.id, group);
      }
      return result;
    }
    case 'novel_detail': {
      const id = String(request.id || '');
      if (request.preview === true) return library.preview(db, root, id);
      if (request.onlineOnly === true) {
        const row = db.prepare("SELECT id, cover FROM novels WHERE id=? AND status='active'").get(id);
        if (!row) throw Error('NOVEL_NOT_FOUND');
        const book = library.onlineDetails(root, id);
        return { book: { ...book, cover: library.bookCover(root, row, book.online, book.onlineLookup) } };
      }
      const detail = library.detail(db, root, id);
      online.schedule(root, runtime, [id], true);
      detail.book.onlineLookup = library.lookupState(root, id);
      if (detail.editions.length > 1) void bilingual.prepare(db, root, id, detail.editions);
      return detail;
    }
    case 'novel_image':
      return library.image(root, String(request.id || ''), request.name);
    case 'novel_pdf_cover_save':
      return library.savePdfCover(db, root, String(request.id || ''), request.data);
    case 'novel_pdf':
      return library.pdfRange(db, root, String(request.id || ''), request);
    case 'novel_website_sources':
      return websites.dispatch(request, ctx);
    case 'novel_source_config':
      return bookSite.configuration(request, ctx);
    case 'novel_source_open':
      return bookSite.openSite(request, ctx);
    case 'novel_source_cover':
      return ['bangumi', 'openlibrary'].includes(request.source) ? publicCatalog.cover(request, ctx) : bookSite.cover(request, ctx);
    case 'novel_source_detail':
      return bookSite.detail(request, ctx);
    case 'novel_source_download_start':
      return downloads.start(request, ctx);
    case 'novel_source_download_status':
      return downloads.status(request, ctx);
    case 'novel_source_import': {
      const result = await bookSite.download(request, ctx);
      online.schedule(root, runtime, result.imported.map(book => book.id));
      const incoming = new Set(result.imported.map(book => book.id));
      if (incoming.size) for (const group of library.editionGroups(db, root)) {
        if (group.length < 2 || !group.some(book => incoming.has(book.id))) continue;
        const original = group.find(book => /^(?:ja|jpn)/i.test(book.languages));
        if (original) void bilingual.prepare(db, root, original.id, group);
      }
      return result;
    }
    case 'novel_chapter':
      return library.chapter(db, root, String(request.id || ''), request.index);
    case 'novel_bilingual':
      return bilingual.chapter(db, root, String(request.id || ''), request.index);
    case 'novel_find':
      return library.findInBook(db, root, String(request.id || ''), request);
    case 'novel_online_search':
      return online.search(db, runtime, String(request.id || ''), request);
    case 'novel_online_save':
      return online.save(db, root, runtime, String(request.id || ''), request);
    case 'novel_online_clear':
      return online.clear(db, root, String(request.id || ''), request);
    case 'novel_online_reviews':
      return online.reviews(db, root, runtime, String(request.id || ''), request);
    case 'novel_remove':
      return library.remove(db, root, String(request.id || ''));
    case 'novel_progress':
      return library.getProgress(db, String(request.id || ''));
    case 'novel_progress_save':
      return library.saveProgress(db, String(request.id || ''), request);
    case 'novel_bookmarks':
      return library.bookmarks(db, String(request.id || ''));
    case 'novel_bookmark_add':
      return library.addBookmark(db, String(request.id || ''), request);
    case 'novel_bookmark_remove':
      return library.removeBookmark(db, String(request.id || ''), request.bookmarkId);
    case 'novel_event':
      return library.recordEvent(db, String(request.id || ''), request);
    case 'novel_excerpts':
      return library.excerpts(db, String(request.id || ''));
    case 'novel_excerpt_add':
      return library.addExcerpt(db, String(request.id || ''), request);
    case 'novel_excerpt_translate':
      return library.translateExcerpt(db, String(request.id || ''), request);
    case 'novel_excerpt_remove':
      return library.removeExcerpt(db, String(request.id || ''), request.excerptId);
    /* 注音与点读：走 runtime 的 Sudachi + JMdict（services/novel/annotate.cjs） */
    case 'novel_annotate':
      return annotate.chapter(root, ctx.runtime, String(request.id || ''), request.index);
    case 'novel_lookup':
      return annotate.lookup(root, db, ctx.runtime, request);
    case 'novel_save_word':
      return annotate.save(root, db, ctx.runtime, request);
    case 'novel_source_test':
      return pick().test(request, ctx);
    case 'novel_discover':
    case 'novel_search': {
      if (['bangumi', 'openlibrary'].includes(request.source)) return publicCatalog.discover(request.source, request, ctx);
      if (request.source !== 'auto') return request.action === 'novel_search' ? pick().search(request, ctx) : pick().discover(request, ctx);
      const targets = ['book-site', 'bangumi', 'openlibrary'];
      const start = Math.max(0, targets.indexOf(request.preferred));
      let first;
      for (const provider of targets.slice(start)) {
        const result = provider === 'book-site' ? await bookSite.discover(request, ctx) : await publicCatalog.discover(provider, request, ctx);
        result.provider = provider;
        if (!result.error) return first?.error && first.error !== 'BOOK_SITE_UNCONFIGURED'
          ? { ...result, fallbackError: first.error } : result;
        if (!first) first = result;
      }
      return first;
    }
    default:
      throw Error('UNKNOWN_ACTION');
  }
}

module.exports = { dispatch };
