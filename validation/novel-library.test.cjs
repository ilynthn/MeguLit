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
