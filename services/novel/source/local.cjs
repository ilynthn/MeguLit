// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 本地书源：已导入的书本身就是"发现"和"搜索"的结果。
   和联网源同签名，页面拿到的形状一致（items + state），所以下一轮换源时不用动 UI。 */
const library = require('../library.cjs');

const shape = book => ({
  id: book.id,
  title: book.title,
  author: book.author,
  cover: book.cover,
  chars: book.chars,
  chapterCount: book.chapterCount,
  languages: book.languages,
  progress: book.progress || null,
  source: 'local'
});

async function test() {
  return { ok: true, kind: 'local', message: 'LOCAL_READY' };
}

async function discover(request, { db, root }) {
  const { books } = library.shelf(db, root);
  return { state: 'ok', source: 'local', items: books.slice(0, 24).map(shape) };
}

async function search(request, { db, root }) {
  const keyword = String(request.keyword || '').trim();
  if (!keyword) return { state: 'ok', source: 'local', items: [] };
  const like = `%${keyword.replace(/[%_]/g, ch => '\\' + ch)}%`;
  const rows = db.prepare(`SELECT * FROM novels WHERE status='active' AND (title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\') ORDER BY COALESCE(last_opened_at,added_at) DESC LIMIT 60`).all(like, like);
  return {
    state: 'ok',
    source: 'local',
    items: rows.map(row => shape({
      id: row.id,
      title: row.title,
      author: row.author,
      cover: library.coverDataUrl(root, row.id, row.cover),
      chars: row.word_count,
      chapterCount: row.chapter_count,
      languages: row.languages,
      progress: null
    }))
  };
}

module.exports = { test, discover, search };
