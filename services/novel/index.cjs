// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 文库服务入口：把 novel_* 动作路由到本地书库和联网书源。 */
const library = require('./library.cjs');
const flowSettings = require('./flow-settings.cjs');
const online = require('./online.cjs');
const local = require('./source/local.cjs');
const wenku = require('./source/wenku.cjs');
const bookSite = require('./source/book-site.cjs');
const downloads = require('./source/downloads.cjs');
const annotate = require('./annotate.cjs');
const webnovel = require('./webnovel/index.cjs');

const SOURCES = new Map([['local', local], ['wenku', wenku], ['book-site', bookSite]]);
const source = id => SOURCES.get(String(id || 'local')) || local;

async function dispatch(request, ctx) {
  const { db, root, runtime } = ctx;

  const pick = () => source(request.source);
  switch (String(request.action || '')) {
    case 'novel_shelf': {
      const shelf = library.shelf(db, root);
      online.resume(root, runtime, shelf.books.map(book => book.id));
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
      return result;
    }
    case 'novel_detail': {
      const id = String(request.id || '');
      if (request.preview === true) return library.preview(db, root, id);
      if (request.onlineOnly === true) {
        if (!db.prepare("SELECT id FROM novels WHERE id=? AND status='active'").get(id)) throw Error('NOVEL_NOT_FOUND');
        return { book: library.onlineDetails(root, id) };
      }
      const detail = library.detail(db, root, id);
      online.schedule(root, runtime, [id], true);
      detail.book.onlineLookup = library.lookupState(root, id);
      return detail;
    }
    case 'novel_image':
      return library.image(root, String(request.id || ''), request.name);
    case 'novel_pdf':
      return library.pdfRange(db, root, String(request.id || ''), request);
    case 'novel_source_config':
      return bookSite.configuration(request, ctx);
    case 'novel_source_open':
      return bookSite.openSite(request, ctx);
    case 'novel_source_cover':
      return bookSite.cover(request, ctx);
    case 'novel_source_detail':
      return bookSite.detail(request, ctx);
    case 'novel_source_download_start':
      return downloads.start(request, ctx);
    case 'novel_source_download_status':
      return downloads.status(request, ctx);
    case 'novel_source_import': {
      const result = await bookSite.download(request, ctx);
      online.schedule(root, runtime, result.imported.map(book => book.id));
      return result;
    }
    case 'novel_chapter':
      return library.chapter(db, root, String(request.id || ''), request.index);
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
    /* 内置网文书源与日中对照（services/novel/webnovel/） */
    case 'novel_web_config':
      return webnovel.config(root, request);
    case 'novel_web_test':
      return webnovel.test(root, request);
    case 'novel_web_search':
      return webnovel.search(root, request);
    case 'novel_web_work':
      return webnovel.work(root, request);
    case 'novel_web_pair':
      return webnovel.pair(root, request);
    case 'novel_web_chapter':
      return webnovel.chapter(root, request, { runtime });
    case 'novel_web_open':
      return webnovel.open(request);
    case 'novel_source_test':
      return pick().test(request, ctx);
    case 'novel_discover':
      return pick().discover(request, ctx);
    case 'novel_search':
      return pick().search(request, ctx);
    default:
      throw Error('UNKNOWN_ACTION');
  }
}

module.exports = { dispatch };
