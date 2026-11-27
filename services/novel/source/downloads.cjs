// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { openStore } = require('../../store.cjs');
const { schedule } = require('../online.cjs');
const bookSite = require('./book-site.cjs');

const tasks = new Map();
const terminal = new Set(['done', 'failed']);
const busy = root => [...tasks].some(([key, task]) => key.startsWith(root + '\0') && !terminal.has(task.phase));
const keyFor = (request, root) => {
  const config = bookSite.readConfig(root);
  const { id, hash } = bookSite.bookRef(request, config);
  return [root, config.origin, id, hash].join('\0');
};

function status(request, { root, db }) {
  const key = keyFor(request, root);
  const task = tasks.get(key);
  if (task?.phase === 'done' && !db.prepare("SELECT 1 FROM novels WHERE id=? AND status='active'").get(task.bookId)) {
    tasks.delete(key);
    return { phase: 'idle' };
  }
  return task ? { ...task } : { phase: 'idle' };
}

function start(request, ctx) {
  const { root, runtime } = ctx;
  const key = keyFor(request, root);
  const previous = status(request, ctx);
  if (!['failed', 'idle'].includes(previous.phase)) return previous;
  const cutoff = Date.now() - 60 * 60_000;
  for (const [ref, entry] of tasks) {
    if (terminal.has(entry.phase) && entry.finishedAt < cutoff) tasks.delete(ref);
  }
  const task = { phase: 'resolving', received: 0, total: 0 };
  tasks.set(key, task);
  setImmediate(async () => {
    try {
      const result = await bookSite.download(request, { root, openDb: () => openStore(root) }, progress => Object.assign(task, progress));
      const book = result.imported[0] || result.skipped[0];
      if (!book) throw Error(result.failed[0]?.error || 'NOVEL_PARSE_FAILED');
      Object.assign(task, { phase: 'done', bookId: book.id, duplicate: Boolean(result.skipped.length) });
      if (result.imported.length) {
        try { schedule(root, runtime, [book.id]); }
        catch { /* The shelf can schedule another metadata lookup when opened. */ }
      }
    } catch (error) {
      Object.assign(task, { phase: 'failed', error: /^(?:BOOK_SITE|NOVEL)_[A-Z_]+$/.test(error.message)
        ? error.message : task.phase === 'importing' ? 'NOVEL_PARSE_FAILED' : 'BOOK_SITE_FILE_NETWORK' });
    } finally {
      task.finishedAt = Date.now();
    }
  });
  return { ...task };
}

module.exports = { start, status, busy };
