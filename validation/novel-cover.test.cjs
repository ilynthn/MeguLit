// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openStore } = require('../services/store.cjs');
const { dispatch } = require('../services/novel/index.cjs');
const { lookupState } = require('../services/novel/library.cjs');
const { zip } = require('./helpers/engine-fixtures.cjs');

const png = fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', 'sponsor', 'logo.png'));
const title = '魔法のふせん 2';
const author = 'テスト作家';
const isbn = '9780140328721';

function epub(file, { embedded, isbn: identifier }) {
  const coverItem = embedded ? '<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>' : '';
  const entries = {
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
    'book.opf': '<package><metadata><dc:title>' + title + '</dc:title><dc:creator>' + author +
      '</dc:creator><dc:language>ja</dc:language>' + (identifier ? '<dc:identifier>urn:isbn:' + identifier + '</dc:identifier>' : '') +
      '</metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>' + coverItem +
      '</manifest><spine><itemref idref="chapter"/></spine></package>',
    'chapter.xhtml': '<html><body><p>試験用の文章です。この本は一つの章を収録しています。</p></body></html>'
  };
  if (embedded) entries['cover.png'] = png;
  fs.writeFileSync(file, zip(entries));
}

for (const scenario of [
  { name: 'Bangumi 返回同卷封面', expected: 'bangumi' },
  { name: 'Bangumi 不通时从 Open Library 按标题匹配同版', bangumiDown: true, expected: 'openlibrary' },
  { name: '按 EPUB ISBN 查并跟随 Open Library 的官方封面跳转', bangumiDown: true, isbn, expected: 'openlibrary' },
  { name: '其他卷和不同作者留占位封面', mismatched: true },
  { name: '带原封面的 EPUB 不联网取图', embedded: true }
]) {
  test(scenario.name, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-auto-cover-'));
    const db = openStore(root);
    t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
    const fetched = [];
    const subject = {
      id: 58, type: 1, name: scenario.mismatched ? '魔法のふせん 3' : title,
      images: { common: 'https://lain.bgm.tv/pic/cover/c/test.png' },
      infobox: [{ key: '作者', value: author }]
    };
    const source = {
      cached: (_key, _ttl, task) => task(),
      async request(raw) {
        const url = new URL(raw);
        if (url.hostname === 'api.bgm.tv') {
          if (scenario.bangumiDown) throw Error('fetch failed');
          return url.pathname.includes('/search/') ? { data: [subject] } : subject;
        }
        if (url.hostname === 'openlibrary.org') {
          if (url.pathname.startsWith('/works/')) return {};
          const editionTitle = scenario.mismatched ? '魔法のふせん 2' : title;
          return { docs: scenario.expected === 'bangumi' ? [] : [{
            key: '/works/OL10W', title: editionTitle, author_name: [scenario.mismatched ? '別の著者' : author],
            editions: { docs: [{ key: '/books/OL10M', title: editionTitle, isbn: scenario.isbn ? [isbn] : [] }] }
          }] };
        }
        if (url.hostname === 'ndlsearch.ndl.go.jp') return '<rss version="2.0"></rss>';
        throw Error('No fixture for ' + url.hostname);
      },
      async fetcher(raw) {
        fetched.push(raw);
        const url = new URL(raw);
        if (scenario.isbn && url.hostname === 'covers.openlibrary.org') {
          return Response.redirect('https://archive.org/download/m_covers_0012/m_covers_0012_54.zip/0012547191-M.jpg');
        }
        return new Response(png, { headers: { 'Content-Type': 'image/png' } });
      }
    };
    const runtime = { reviews: () => source };
    const call = (action, args = {}) => dispatch({ action, ...args }, { root, db, runtime });
    const file = path.join(root, 'test.epub');
    epub(file, scenario);
    const { imported } = await call('novel_import', { paths: [file] });
    assert.equal(imported.length, 1);
    const { id } = imported[0];
    for (const deadline = Date.now() + 4000; lookupState(root, id)?.pending && Date.now() < deadline;) {
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    const state = lookupState(root, id);
    assert.equal(state.pending, false);
    const { books: [book] } = await call('novel_shelf');
    const detail = await call('novel_detail', { id, onlineOnly: true });
    assert.equal(book.cover, detail.book.cover);
    assert.equal(Boolean(book.cover), Boolean(scenario.embedded || scenario.expected));
    assert.equal(state.cover?.provider, scenario.expected);
    if (!scenario.expected) assert.equal(fetched.length, 0);
    if (scenario.isbn) assert(fetched.some(url => url.includes('/b/isbn/' + isbn + '-M.jpg')));
    if (scenario.bangumiDown && !scenario.isbn) assert(fetched.some(url => url.includes('/b/olid/OL10M-M.jpg')));
    if (scenario.expected) assert(book.cover.startsWith('data:image/png;base64,'));
  });
}
