// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 文库的注音与点读：复用阅读层那套 Sudachi + JMdict 管线。
   - 注音：exampleSpans() 决定"哪个词、哪个读音"，假名不成 ruby、专有名词不猜、送假名留在 ruby 外
   - 点读：按段落分词后找到光标所在的词，再走 lookup_exact
   结果按章节缓存到 data/novel-cache/<id>/<idx>.ruby.json，正文一变（hash）就重算。 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { exampleSpans } = require('../../core/example-ruby.cjs');

const VERSION = 2;
const CHUNK = 3000;           // tokenize 的上限是 4000，留余量
const SURROGATE = /[\uD800-\uDFFF]/;

const cacheFile = (root, id, idx) => path.join(root, 'data', 'novel-cache', id, String(idx) + '.ruby.json');
const chapterFile = (root, id, idx) => path.join(root, 'data', 'novel-cache', id, String(idx) + '.json');

function readChapter(root, id, idx) {
  try {
    return JSON.parse(fs.readFileSync(chapterFile(root, id, idx), 'utf8'));
  } catch {
    throw Error('NOVEL_CACHE_MISSING');
  }
}

/* 超长段落按句读切块，保证每次 tokenize 不超过 CHUNK */
function cut(text) {
  if (text.length <= CHUNK) return [text];
  const out = [];
  let rest = text;
  while (rest.length > CHUNK) {
    const at = Math.max(rest.lastIndexOf('。', CHUNK), rest.lastIndexOf('」', CHUNK), rest.lastIndexOf('、', CHUNK));
    const end = at >= CHUNK * 0.5 ? at + 1 : CHUNK;
    out.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) out.push(rest);
  return out;
}

async function tokensOf(learning, text) {
  const raw = await learning.tokenize(text);
  return typeof learning.readings?.resolve === 'function' ? learning.readings.resolve(raw) : raw;
}

async function annotateParagraph(learning, text) {
  const spans = [];
  const words = [];
  let offset = 0;
  for (const piece of cut(text)) {
    try {
      const tokens = await tokensOf(learning, piece);
      for (const token of tokens || []) {
        if (Number.isInteger(token.start) && Number.isInteger(token.end) && token.end > token.start &&
            /[\p{L}\p{N}]/u.test(token.surface || '')) {
          words.push([token.start + offset, token.end + offset]);
        }
      }
      if (!SURROGATE.test(piece)) {
        for (const span of exampleSpans(piece, tokens, [])) spans.push([span.start + offset, span.end + offset, span.reading]);
      }
    } catch { /* 单块失败不影响整段 */ }
    offset += [...piece].length;
  }
  return { spans, words };
}

async function chapter(root, runtime, id, index) {
  const idx = Number(index) || 0;
  const data = readChapter(root, id, idx);
  const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
  const learning = runtime?.learning?.();
  if (!learning || typeof learning.tokenize !== 'function' || !learning.installed?.()) {
    return { available: false, reason: 'TOKENIZER_MISSING' };
  }
  const hash = crypto.createHash('sha1').update(paragraphs.join('\u0000')).digest('hex');
  const file = cacheFile(root, id, idx);
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached.version === VERSION && cached.hash === hash && Array.isArray(cached.paragraphs) && Array.isArray(cached.words)) {
      return { available: true, hash, cached: true, paragraphs: cached.paragraphs, words: cached.words };
    }
  } catch { /* 没缓存就重算 */ }
  const result = [];
  const words = [];
  for (const text of paragraphs) {
    const annotated = await annotateParagraph(learning, text);
    result.push(annotated.spans);
    words.push(annotated.words);
  }
  try {
    fs.writeFileSync(file + '.tmp', JSON.stringify({ version: VERSION, hash, paragraphs: result, words }));
    fs.renameSync(file + '.tmp', file);
  } catch { /* 缓存写失败只影响下次速度 */ }
  return { available: true, hash, cached: false, paragraphs: result, words };
}

async function resolve(learning, text, offset, requestedEnd) {
  const chars = [...text];
  const at = Math.max(0, Math.min(chars.length - 1, offset));
  const exact = Number.isInteger(requestedEnd) && requestedEnd > at && requestedEnd <= chars.length && requestedEnd - at <= 100;
  const tokens = await tokensOf(learning, text).catch(() => []);
  const hit = (tokens || []).find(token => exact ? token.start === at && token.end === requestedEnd
    : at >= token.start && at < token.end) || null;
  let start = exact ? at : hit ? hit.start : at;
  let end = exact ? requestedEnd : hit ? hit.end : Math.min(chars.length, at + 1);
  if (!(end > start)) { start = Math.max(0, Math.min(chars.length - 1, at)); end = Math.min(chars.length, start + 1); }
  if (!(end > start)) return null;
  let result = null;
  try { result = await learning.request('lookup_exact', { text, start, end }, 'zh'); } catch { /* 选区无效按没查到处理 */ }
  const entries = (result?.entries || []).slice(0, 6);
  const surface = chars.slice(start, end).join('');
  const best = entries.find(entry => (entry.spellings || []).includes(surface)) || entries[0] || null;
  return { hit, start, end, surface, entries, raw: best };
}

async function lookup(root, db, runtime, request) {
  const index = Number(request.index) || 0;
  const paragraph = Number(request.paragraph) || 0;
  const data = readChapter(root, String(request.id || ''), index);
  const text = String((data.paragraphs || [])[paragraph] || '');
  if (!text) throw Error('NOVEL_PARAGRAPH_NOT_FOUND');
  const learning = runtime?.learning?.();
  if (!learning?.installed?.()) throw Error('TOKENIZER_MISSING');
  const found = await resolve(learning, text, Math.max(0, Number(request.offset) || 0), request.end);
  if (!found) return { word: '', reading: '', start: 0, end: 0, entries: [], saved: null };
  const entries = found.entries.map(entry => ({
    spelling: entry.spellings?.[0] || entry.readings?.[0] || found.surface,
    reading: (entry.readings || []).join(' · '),
    definition: (Array.isArray(entry.definition_groups) && entry.definition_groups.length
      ? entry.definition_groups.map(group => group.text)
      : (entry.definitions || [])).map(String).join('\n')
  })).filter(entry => entry.definition);
  let saved = null;
  if (db && found.raw?.id) {
    try {
      const row = db.prepare('SELECT status FROM vocabulary WHERE id=?').get(found.raw.id);
      if (row) saved = row.status;
    } catch { /* 没有生词本表就当没收录 */ }
  }
  return { word: found.surface, reading: found.hit?.reading || '', start: found.start, end: found.end, entries, saved, text: text.slice(0, 1000) };
}

/* 收进生词本：复用 reading_save_word 那条路径（learning-insights.saveWord），例句取当前段落 */
async function save(root, db, runtime, request) {
  const index = Number(request.index) || 0;
  const paragraph = Number(request.paragraph) || 0;
  const data = readChapter(root, String(request.id || ''), index);
  const text = String((data.paragraphs || [])[paragraph] || '');
  if (!text) throw Error('NOVEL_PARAGRAPH_NOT_FOUND');
  const learning = runtime?.learning?.();
  if (!learning?.installed?.()) throw Error('TOKENIZER_MISSING');
  const found = await resolve(learning, text, Math.max(0, Number(request.offset) || 0), request.end);
  if (!found?.raw?.id) throw Error('WORD_NOT_FOUND');
  const insights = require('../learning-insights.cjs');
  const saved = insights.saveWord(db, found.raw, {
    text,
    start: found.start,
    end: found.end,
    gameId: null
  });
  runtime.emit?.('reader-event', { type: 'word-status-changed' });
  return { ...saved, word: found.surface };
}

module.exports = { chapter, lookup, save };
