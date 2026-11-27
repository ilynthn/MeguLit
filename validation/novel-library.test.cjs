// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openStore } = require('../services/store.cjs');

test('文库支持离线导入、去重、读取、记录进度和移出', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-novel-test-'));
  const db = openStore(root);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  assert(db.prepare("SELECT name FROM sqlite_master WHERE name='novels'").get(), '数据库为文库提供独立存储');
  const { dispatch } = require('../services/novel/index.cjs');
  const call = (action, values = {}) => dispatch({ action, ...values }, { root, db });
  const txt = path.join(root, '本棚.txt');
  fs.writeFileSync(txt, '第一章\n\nこれはテスト用の文章です。\n\n次の段落です。');
  const { imported } = await call('novel_import', { paths: [txt] });
  const { id } = imported[0];
  assert.equal((await call('novel_import', { paths: [txt] })).skipped[0].id, id);
  assert((await call('novel_chapter', { id, index: 0 })).paragraphs.some(line => line.includes('テスト')));
  await call('novel_progress_save', { id, page: 3, percent: 0.5 });
  assert.equal((await call('novel_progress', { id })).page, 3);
  assert.equal((await call('novel_shelf')).books[0].progress.percent, 0.5);
  await call('novel_remove', { id });
  assert.equal((await call('novel_shelf')).books.length, 0);
});

test('PDF 导入保留文件副本并支持按区间读取，拒绝错误格式', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-novel-pdf-test-'));
  const db = openStore(root);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  assert(db.prepare("SELECT name FROM sqlite_master WHERE name='novels'").get(), '数据库为文库提供独立存储');
  const { dispatch } = require('../services/novel/index.cjs');
  const call = (action, values = {}) => dispatch({ action, ...values }, { root, db });
  const pdf = path.join(root, '見本.pdf');
  const bad = path.join(root, '不正.pdf');
  const fixture = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n';
  fs.writeFileSync(pdf, fixture);
  fs.writeFileSync(bad, 'not a PDF');
  assert.equal((await call('novel_import', { paths: [bad] })).failed[0].error, 'NOVEL_INVALID_PDF');
  const { imported } = await call('novel_import', { paths: [pdf] });
  const { id } = imported[0];
  fs.unlinkSync(pdf);
  assert.equal((await call('novel_detail', { id })).book.format, 'pdf');
  const { data } = await call('novel_pdf', { id, begin: 0, end: 8 });
  assert.equal(Buffer.from(data, 'base64').toString(), fixture.slice(0, 8));
  await assert.rejects(call('novel_pdf', { id, begin: -1, end: 8 }), /NOVEL_INVALID_RANGE/);
});

test('书源首次配置留空，保存后默认发现日文轻小说', async t => {
  const https = require('node:https');
  const { EventEmitter } = require('node:events');
  const { Readable } = require('node:stream');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-book-site-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const { dispatch } = require('../services/novel/index.cjs');
  const call = (action, fields = {}) => dispatch({ action, source: 'book-site', ...fields }, { root });
  const requests = [];
  t.mock.method(https, 'request', (url, _options, callback) => {
    const request = new EventEmitter();
    request.end = body => {
      assert.equal(new URL(url).pathname, '/eapi/book/search');
      const form = new URLSearchParams(body);
      requests.push(form);
      const focused = form.get('message') === 'ライトノベル';
      const books = focused
        ? [{ id: '2', href: '/book/2', title: '魔法の旅', language: 'Japanese' }]
        : [{ id: '1', href: '/book/1', title: 'Other book', language: 'English' }];
      const response = Readable.from([Buffer.from(JSON.stringify({
        success: true, books, pagination: { hasNext: focused }
      }))]);
      response.statusCode = 200;
      response.headers = {};
      callback(response);
    };
    return request;
  });

  const origin = 'https://books.example.org';
  const proxy = 'http://127.0.0.1:8080';
  assert.equal((await call('novel_source_config', { operation: 'get' })).origin, '');
  assert.deepEqual(await call('novel_discover'), {
    books: [], page: 1, more: false, error: 'BOOK_SITE_UNCONFIGURED'
  });
  assert.equal(requests.length, 0);
  await call('novel_source_config', { operation: 'save', origin, proxy });
  const found = await call('novel_discover', { page: 2, order: 'date' });
  assert.deepEqual(found.books.map(book => book.title), ['魔法の旅']);
  assert.equal(found.books[0].japanese, true);
  assert.equal(found.more, true);
  assert.equal(new URL(found.url).pathname, '/s/' + encodeURIComponent('ライトノベル'));
  assert.equal(requests[0].get('languages[0]'), 'japanese');
  assert.equal(requests[0].get('page'), '2');
  assert.equal(requests[0].get('order'), 'date');

  const searched = await call('novel_search', { query: 'Other book' });
  assert.deepEqual(searched.books.map(book => book.title), ['Other book']);
  assert.equal(requests[1].get('message'), 'Other book');
  assert.equal(requests[2].has('languages[0]'), false);
  await call('novel_source_config', { operation: 'save', origin: '', proxy });
  const cleared = await call('novel_source_config', { operation: 'get' });
  assert.equal(cleared.origin, '');
  assert.equal(cleared.proxy, proxy);
});
