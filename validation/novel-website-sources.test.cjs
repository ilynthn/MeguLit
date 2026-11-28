// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openStore } = require('../services/store.cjs');
const { dispatch } = require('../services/novel/index.cjs');
const { scan } = require('../services/novel/source/websites.cjs');

test('多个网页书源独立保存，并自动导入专用目录里完成的下载', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-websites-test-'));
  const db = openStore(root);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const web = (operation, params = {}) => dispatch({ action: 'novel_website_sources', operation, ...params }, { root, db });
  const first = (await web('save', { name: '国内站', url: 'https://books.example.org/jp', mode: 'direct' })).site;
  const second = (await web('save', { name: '海外站', url: 'https://archive.example.org/?lang=ja' })).site;
  assert.notEqual(first.id, second.id);
  assert.deepEqual((await web('list')).sites, [first, second]);
  await assert.rejects(web('save', { url: 'file:///C:/books' }), /BOOK_SITE_INVALID_ORIGIN/);
  await assert.rejects(web('save', { url: 'https://books.example.org', mode: 'proxy' }), /BOOK_SITE_INVALID_PROXY/);
  const edited = (await web('save', { id: first.id, name: '主站', url: 'https://books.example.org/latest', mode: 'direct' })).site;
  assert.equal(edited.id, first.id);
  const folder = id => path.join(root, 'cache', 'novel-websites', id, 'downloads');
  for (const site of [first, second]) fs.mkdirSync(folder(site.id), { recursive: true });
  const partial = path.join(folder(first.id), 'Book.pdf.crdownload');
  const pdf = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n';
  fs.writeFileSync(partial, pdf);
  fs.writeFileSync(path.join(folder(second.id), 'unrelated.zip'), 'ignored');
  assert.equal((await web('status', { id: first.id })).downloading, true);
  await scan(root);
  assert.equal(db.prepare('SELECT count(*) count FROM novels').get().count, 0);
  fs.renameSync(partial, path.join(folder(first.id), 'Book.pdf'));
  await scan(root);
  assert.equal(db.prepare('SELECT count(*) count FROM novels').get().count, 0);
  await scan(root);
  const { last } = await web('status', { id: first.id });
  assert(last?.bookId);
  assert.equal((await web('status', { id: second.id })).last, null);
  assert.equal(db.prepare('SELECT count(*) count FROM novels').get().count, 1);
  assert.equal(fs.readdirSync(path.join(folder(first.id), '..', 'imported')).length, 1);
  assert.deepEqual((await web('remove', { id: first.id })).sites, [second]);
  assert.equal(db.prepare('SELECT count(*) count FROM novels').get().count, 1);
});
