// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { zip } = require('./helpers/engine-fixtures.cjs');
const { openStore } = require('../services/store.cjs');
const { dispatch } = require('../services/novel/index.cjs');
const { align } = require('../services/novel/bilingual.cjs');

const japanese = ['夕凪図書館の扉を開けた。', 'ああ。', '時計塔の鐘が鳴った。', '銀色の羅針盤が回った。'];
const chinese = ['我推开了夕凪图书馆的大门。', '追加的译者话：今天是特别页。', '钟声从时钟塔传来。', '银色的罗盘转动了。'];

function fixture(file, title, language, paragraphs, { author = '春山澪', alternate = '' } = {}) {
  fs.writeFileSync(file, zip({
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
    'book.opf': '<package><metadata><dc:title>' + title + '</dc:title><dc:creator>' + author +
      '</dc:creator><dc:language>' + language + '</dc:language>' +
      (alternate ? '<meta property="dcterms:alternative">' + alternate + '</meta>' : '') +
      '</metadata><manifest><item id="body" href="body.xhtml" media-type="application/xhtml+xml"/></manifest>' +
      '<spine><itemref idref="body"/></spine></package>',
    'body.xhtml': '<html><body>' + paragraphs.map(text => '<p>' + text + '</p>').join('') + '</body></html>'
  }));
}

test('同一卷内的原文和译本共用详情，阅读进度各自保存，增译段落不挤占原文位置', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-edition-fixture-'));
  const db = openStore(root);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const call = (action, args = {}) => dispatch({ action, ...args }, { db, root });
  const records = [
    ['ja', '白い海の記憶 第2巻', japanese, {}],
    ['zh', '白海回忆 第二冊', chinese, { alternate: '白い海の記憶' }],
    ['zh', '白海回忆 第三冊', chinese, { alternate: '白い海の記憶' }],
    ['zh', '白海回忆 第二冊（特装版）', chinese, { alternate: '白い海の記憶' }],
    ['zh', '白海回忆 第2.5巻', chinese, { alternate: '白い海の記憶' }],
    ['zh', '白海回忆 第二冊', chinese, { alternate: '白い海の記憶', author: '別の作者' }],
    ['zh', '白海回忆 第2-3冊 合集', chinese, { alternate: '白い海の記憶' }]
  ];
  const paths = records.map(([language, title, paragraphs, options], index) => {
    const file = path.join(root, index + '.epub');
    fixture(file, title, language, paragraphs, options);
    return file;
  });
  const { imported, failed } = await call('novel_import', { paths });
  assert.deepEqual(failed, []);
  const [original, translated, other] = imported;
  const shelf = await call('novel_shelf');
  assert.equal(shelf.books.length, records.length - 1);
  const merged = shelf.books.find(book => book.id === original.id);
  assert.deepEqual(merged.editions.map(book => book.id), [original.id, translated.id]);
  const chineseView = await call('novel_detail', { id: translated.id });
  assert.deepEqual(chineseView.editions.map(book => book.id), [original.id, translated.id]);
  await call('novel_progress_save', { id: translated.id, page: 7, percent: .27 });
  assert.equal((await call('novel_detail', { id: translated.id })).progress.page, 7);
  assert.equal((await call('novel_detail', { id: original.id })).progress, null);
  const page = await call('novel_bilingual', { id: original.id, index: 0 });
  assert.equal(page.available, true);
  assert.equal(page.sentences['0:0'], chinese[0]);
  assert.equal(page.sentences['1:0'], undefined, 'an unsupported interjection does not acquire a random translation');
  assert.equal(page.sentences['2:0'], chinese[2]);
  assert.equal(page.sentences['3:0'], chinese[3]);
  assert(!Object.values(page.sentences).includes(chinese[1]), 'the translator-only sentence is never displayed');
  assert.equal((await call('novel_bilingual', { id: other.id, index: 0 })).available, false);
});

test('本地双语保留缺少共同汉字的对话并跳过汉化组附加内容', () => {
  const original = [{ idx: 0, paragraphs: ['夕凪図書館の扉を開けた。', '「おはよう。」', '「よく眠れた？」', '時計塔の鐘が鳴った。'] }];
  const translated = [{ idx: 0, paragraphs: ['我推开了夕凪图书馆的大门。', '「早啊。」', '译者的话：这一段是后来补的。', '「睡得好吗？」', '钟声从时钟塔传来。'] },
    { idx: 1, title: '汉化组后记', paragraphs: ['感谢阅读。', '接下来公布人员名单。'] }];
  assert.deepEqual(align(original, translated)[0], {
    '0:0': '我推开了夕凪图书馆的大门。',
    '1:0': '「早啊。」',
    '2:0': '「睡得好吗？」',
    '3:0': '钟声从时钟塔传来。'
  });
});

test('发现结果保持各版本独立，后台注入的别名不把独立短篇、未标卷和前后册串在一起', () => {
  const { attachEditionAliases } = require('../services/novel/editions.cjs');
  const original = { id: 'ja', title: '時計塔 Vol. 2 上巻', language: 'japanese', author: '作家' };
  const correct = { id: 'zh', title: '时钟塔 第二冊 上卷', alternate: '時計塔', language: 'chinese', author: '作家' };
  const other = [
    { ...correct, id: 'lower', title: '时钟塔 第二冊 下卷' },
    { ...correct, id: 'collection', title: '时钟塔 第二冊 上卷（合集）' },
    { ...correct, id: 'numberless', title: '时钟塔 上卷' },
    { ...correct, id: 'bonus', title: '时钟塔 第二冊 上卷 外传' },
    { ...correct, id: 'different', title: '时钟塔 第二冊 上卷', author: '別人' }
  ];
  const books = attachEditionAliases([correct, original, ...other]);
  assert.equal(books.length, other.length + 2);
  assert.deepEqual(books.slice(0, 2).map(book => book.id), ['zh', 'ja']);
  assert.equal(books[0].originalTitle, original.title);
  assert.equal(books[2].originalTitle, undefined);
  assert(books.every(book => !book.editions));
});



test('中文半截书名联查原版，两个结果各自下载，导入时携带已核对的别名', async t => {
  const https = require('node:https');
  const { EventEmitter } = require('node:events');
  const { Readable } = require('node:stream');
  const { importFiles } = require('../services/novel/library.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-edition-catalogue-'));
  const db = openStore(root);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const call = (action, fields = {}) => dispatch({ action, ...fields }, { root, db });
  const author = '春山澪';
  const original = { id: '101', hash:'cafe001', title:'白い海の記憶 第2巻', author, language:'japanese', extension:'epub' };
  const translated = { id: '102', hash:'cafe002', title:'白海回忆 第二冊', originalTitle:'白い海の記憶', author, language:'chinese', extension:'pdf' };
  const wrong = { ...translated, id:'103', hash:'cafe003', title:'白海回忆 第三冊' };
  const origin = 'https://books.example.org';
  t.mock.method(https, 'request', (url, _options, callback) => {
    const request = new EventEmitter();
    request.end = body => {
      assert.equal(new URL(url).pathname, '/eapi/book/search');
      const query = new URLSearchParams(body).get('message');
      const match = query === '白海' ? [translated, wrong] : query.startsWith('白い海の記憶') ? [original] : [];
      const data = { success:true, books:match.map(book => ({ ...book, href:'/book/' + book.id })) };
      const response = Readable.from([Buffer.from(JSON.stringify(data))]);
      response.statusCode = 200;
      response.headers = {};
      callback(response);
    };
    return request;
  });
  await call('novel_source_config', { operation:'save', origin });
  const found = await call('novel_search', { source:'book-site', query:'白海' });
  assert.deepEqual(found.books.map(book => [book.language, book.id, book.hash, book.extension]),
    [['japanese', '101', 'cafe001', 'epub'], ['chinese', '102', 'cafe002', 'pdf'], ['chinese', '103', 'cafe003', 'pdf']]);
  const { attachEditionAliases } = require('../services/novel/editions.cjs');
  const catalogue = attachEditionAliases(found.books);
  assert(catalogue[0].aliases.includes(translated.title));
  assert(found.books.every(book => !book.editions));
  const jaFile = path.join(root, 'original.epub');
  const zhFile = path.join(root, 'translation.pdf');
  fixture(jaFile, original.title, 'ja', japanese);
  fs.writeFileSync(zhFile, '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  const jaResult = await importFiles(root, db, [jaFile], { owned:true, catalogue:[catalogue[0]], boundCatalogue:true });
  const zhResult = await importFiles(root, db, [zhFile], { owned:true, catalogue:[catalogue[1]], boundCatalogue:true });
  const shelf = await call('novel_shelf');
  assert.equal(shelf.books.length, 1);
  assert.deepEqual(shelf.books[0].editions.map(book=>[book.id, book.format]), [
    [jaResult.imported[0].id, 'epub'], [zhResult.imported[0].id, 'pdf']
  ]);
  assert.equal((await call('novel_bilingual', { id:jaResult.imported[0].id, index:0 })).available, false, 'a PDF edition is selectable without being treated as verified sentence text');
});

test('带后缀的旧式中文 EPUB 可与原版一起导入，同系列分卷组成合集', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-legacy-epub-'));
  const db = openStore(root);
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const call = (action, fields = {}) => dispatch({ action, ...fields }, { root, db });
  const original = path.join(root, 'original.epub');
  const translation = path.join(root, 'old-chinese.epub');
  const second = path.join(root, 'next.epub');
  fixture(original, '山の物語 第1巻（電子版）', 'ja', japanese);
  fixture(second, '山の物語 第2巻', 'ja', japanese);
  const archive = zip({
    'META-INF/Container.xml':'<c:container><c:rootfiles><c:rootfile full-path="Content/Missing.opf"/><c:rootfile full-path="Content/Book%20Data.opf"/></c:rootfiles></c:container>',
    'Content/Book Data.opf':'<opf:package><opf:metadata><dct:title>群山物語 第一冊（精校版）</dct:title><dct:creator>春山澪</dct:creator><dct:language>zh</dct:language><opf:meta property="dcterms:alternative">山の物語</opf:meta></opf:metadata><opf:manifest><opf:item id="fallback" fallback="c" href="Legacy.xml" media-type="application/legacy"/><opf:item id="c" href="Text/篇%20一.xhtml" media-type="application/xhtml+xml"/><opf:item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></opf:manifest><opf:spine><opf:itemref idref="fallback"/></opf:spine></opf:package>',
    'Content/Text/篇 一.xhtml':Buffer.concat([Buffer.from('<?xml version="1.0" encoding="gb18030"?><h:html><h:body><h:p>'), Buffer.from('bcf2cce5d6d0cec4', 'hex'), Buffer.from('</h:p></h:body></h:html>')]),
    'Content/cover.png':'optional-corrupted-cover'
  });
  const marker = archive.lastIndexOf('Content/cover.png') - 46;
  assert.equal(archive.readUInt32LE(marker),0x02014b50);
  archive[marker + 16] ^= 1;
  fs.writeFileSync(translation, archive);
  const result = await call('novel_import', { paths:[original, translation, second] });
  assert.deepEqual(result.failed, []);
  assert.equal(result.imported.length, 3);
  const [ja, zh, v2] = result.imported;
  assert.equal((await call('novel_chapter',{id:zh.id,index:0})).paragraphs[0],'简体中文');
  const shelf = await call('novel_shelf');
  assert.equal(shelf.books.length,2);
  assert.equal(shelf.books.find(book=>book.id===ja.id).title,'山の物語 第1巻');
  assert.deepEqual(shelf.collections.map(group=>[group.title, group.books]), [['山の物語',[ja.id,v2.id]]]);
  const detail = await call('novel_detail',{id:zh.id});
  assert.equal(detail.book.title,'山の物語 第1巻');
  assert.equal(detail.book.languages,'zh');
});

test('书名缺少全称时可从题名别称或原版 ISBN 找到另一语言版', async () => {
  const { expand } = require('../services/novel/search-titles.cjs');
  const alternate = { title:'夏へのトンネル、さよならの出口', alternate:'通往夏天的隧道，再见的出口', author:'八目迷' };
  assert.equal((await expand('通往夏天', { bangumi: async()=>[alternate] }))[0],alternate.title);
  assert.equal((await expand('夏へのトンネル', { books:[alternate] }))[0],alternate.alternate);
  assert.deepEqual(await expand('夏へのトンネル', { books:[{title:alternate.title}] }),[alternate.title]);
  assert.equal((await expand('夏天的隧道', { books:[{title:alternate.alternate, isbn:'9789572653968,9784094518023,9572653962,4094518029'}] }))[0],
    '9784094518023');
});