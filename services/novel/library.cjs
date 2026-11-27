// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 本地书库：导入 → 分章 → 缓存 → 书架。正文落在 data/novel-cache，元数据与进度落在同一个 megulit.sqlite。 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const txt = require('./parse-txt.cjs');
const epub = require('./parse-epub.cjs');
const { isbnOf } = require('./identity.cjs');

const MAX_FILE = 64 * 1024 * 1024;
const MAX_PDF = 256 * 1024 * 1024;
const PDF_RANGE = 512 * 1024;
const COVER_MAX = 600 * 1024;
const TEXT_EXT = new Set(['.txt', '.md']);
const PACK_EXT = new Set(['.epub', '.zip']);
const kindOf = ext => ext === '.pdf' ? 'pdf' : PACK_EXT.has(ext) ? 'epub' : TEXT_EXT.has(ext) ? 'txt' : '';
const limitOf = ext => ext === '.pdf' ? MAX_PDF : MAX_FILE;
const IMAGE_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

const sha1 = buffer => crypto.createHash('sha1').update(buffer).digest('hex');
const now = () => Math.floor(Date.now() / 1000);

function imageExt(bytes) {
  const head = bytes.subarray(0, 16);
  if (head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return '.png';
  if (head[0] === 0xff && head[1] === 0xd8) return '.jpg';
  if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (/^GIF8[79]a/.test(head.toString('ascii'))) return '.gif';
  return '';
}

const cacheRoot = (root, id) => path.join(root, 'data', 'novel-cache', id);
const assetRoot = (root, id) => path.join(root, 'data', 'novel-assets', id);

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value));
  fs.renameSync(temp, file);
}

function countChars(paragraphs) {
  let n = 0;
  for (const line of paragraphs) n += line.replace(/\s/g, '').length;
  return n;
}

function languageOf(book, paragraphs) {
  const declared = String(book.language || '').toLowerCase();
  if (declared) return declared.slice(0, 12);
  const sample = paragraphs.join('').slice(0, 20000);
  let kana = 0;
  let han = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0);
    if (code >= 0x3040 && code <= 0x30ff) kana++;
    else if (code >= 0x4e00 && code <= 0x9fff) han++;
  }
  /* 中文里偶尔夹一个「の」不算日文：假名要有量，而且在汉字里占比够高 */
  if (kana >= 12 && kana / Math.max(1, kana + han) > 0.05) return 'ja';
  return 'zh';
}

function coverDataUrl(root, id, name) {
  if (!name || name !== path.basename(name)) return '';
  const file = path.join(assetRoot(root, id), name);
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > COVER_MAX) return '';
    const mime = IMAGE_MIME[path.extname(file).toLowerCase()];
    if (!mime) return '';
    return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
  } catch {
    return '';
  }
}

const onlineFiles = new Map([
  ['bangumi', 'online-info.json'], ['ndl', 'online-ndl.json'], ['openlibrary', 'online-openlibrary.json'],
  ['moegirl', 'online-moegirl.json'], ['shlibrary', 'online-shlibrary.json']
]);
const onlineFile = (root, id, provider) => path.join(cacheRoot(root, id), onlineFiles.get(provider));
const linkedCover = (root, id, name) => /^online-cover-[a-f\d]{12}\.(?:jpe?g|png|webp|gif)$/.test(String(name))
  ? coverDataUrl(root, id, name) : '';

function readOnlineInfo(root, id, provider = 'bangumi') {
  if (!onlineFiles.has(provider) || !/^novel-[a-f\d]{16}$/.test(String(id))) return null;
  try {
    const value = JSON.parse(fs.readFileSync(onlineFile(root, id, provider), 'utf8'));
    if (provider === 'bangumi') return Number.isSafeInteger(value?.subjectId) && value.subjectId > 0 ? value : null;
    return typeof value?.recordId === 'string' && value.recordId ? value : null;
  } catch { return null; }
}

function lookupState(root, id, value) {
  if (!/^novel-[a-f\d]{16}$/.test(String(id))) return null;
  const file = path.join(cacheRoot(root, id), 'online-lookup.json');
  if (value) { writeJson(file, value); return value; }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function setOnlineInfo(db, root, id, online, bytes, provider = 'bangumi') {
  if (!onlineFiles.has(provider)) throw Error('NOVEL_ONLINE_PROVIDER');
  if (!/^novel-[a-f\d]{16}$/.test(String(id))) throw Error('NOVEL_NOT_FOUND');
  const row = db.prepare("SELECT cover FROM novels WHERE status='active' AND id=?").get(id);
  if (!row) throw Error('NOVEL_NOT_FOUND');
  if (online) {
    if (bytes) {
      const ext = imageExt(bytes);
      if (!ext || bytes.length > COVER_MAX) throw Error('NOVEL_ONLINE_COVER');
      const name = 'online-cover-' + sha1(bytes).slice(0, 12) + ext;
      const folder = assetRoot(root, id);
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, name);
      if (!fs.existsSync(file)) {
        const temp = file + '.' + process.pid + '.tmp';
        fs.writeFileSync(temp, bytes);
        fs.renameSync(temp, file);
      }
      online = { ...online, coverFile: name };
    }
    writeJson(onlineFile(root, id, provider), online);
  } else {
    try { fs.unlinkSync(onlineFile(root, id, provider)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const localCover = coverDataUrl(root, id, row.cover);
  const coverRecord = provider === 'bangumi' ? online : readOnlineInfo(root, id);
  return { provider, online, cover: linkedCover(root, id, coverRecord?.coverFile) || localCover, hasLocalCover: Boolean(localCover) };
}

/* ---------------- 导入 ---------------- */

async function parseFile(file, bytes) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') {
    if (!/%PDF-[12]\.\d/.test(bytes.subarray(0, 1024).toString('latin1')) ||
        !bytes.subarray(-65536).includes('%%EOF')) throw Error('NOVEL_INVALID_PDF');
    const title = path.basename(file, ext);
    return { title, language: /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title) ? 'ja' : 'und', chapters: [] };
  }
  if (PACK_EXT.has(ext)) {
    const book = await epub.readEpub(file);
    return {
      title: book.title,
      isbn: book.isbn,
      author: book.author,
      intro: book.intro,
      language: book.language,
      cover: book.cover,
      assets: book.assets || [],
      chapters: book.chapters.map(chapter => ({
        title: chapter.title,
        paragraphs: chapter.paragraphs,
        images: chapter.images || []
      }))
    };
  }
  if (!TEXT_EXT.has(ext)) throw Error('NOVEL_UNSUPPORTED');
  const { text, encoding } = txt.decode(bytes);
  const chapters = txt.splitChapters(text);
  const front = txt.frontMatter(text);
  return {
    title: front.title || path.basename(file, ext),
    isbn: isbnOf(front.isbn),
    author: front.author || '',
    intro: '',
    language: '',
    cover: null,
    encoding,
    chapters: chapters.map((chapter, index) => ({
      title: chapter.title || `第 ${index + 1} 章`,
      paragraphs: chapter.text.split(/\n+/).map(line => line.trim()).filter(Boolean)
    }))
  };
}

function insertBook(db, root, file, book, hash, bytes, owned) {
  const id = 'novel-' + hash.slice(0, 16);
  const ext = path.extname(file).toLowerCase();
  const createdAt = now();
  let chars = 0;
  for (const chapter of book.chapters) chapter.chars = countChars(chapter.paragraphs);
  for (const chapter of book.chapters) chars += chapter.chars;
  const language = languageOf(book, book.chapters.slice(0, 3).flatMap(chapter => chapter.paragraphs));

  let coverName = '';
  const coverExt = book.cover && book.cover.bytes && book.cover.bytes.length ? imageExt(book.cover.bytes) : '';
  if (coverExt && book.cover.bytes.length <= 12 * 1024 * 1024) {
    const folder = assetRoot(root, id);
    fs.mkdirSync(folder, { recursive: true });
    coverName = 'cover' + coverExt;
    fs.writeFileSync(path.join(folder, coverName), book.cover.bytes);
  }

  /* 插图：按 href 去重后落盘，章节里只记文件名 */
  const nameByHref = new Map();
  if (Array.isArray(book.assets) && book.assets.length) {
    const dir = assetRoot(root, id);
    fs.mkdirSync(dir, { recursive: true });
    for (const asset of book.assets) {
      const ext = imageExt(asset.bytes) || '.jpg';
      const name = 'img-' + sha1(asset.bytes).slice(0, 12) + ext;
      try {
        fs.writeFileSync(path.join(dir, name), asset.bytes);
        nameByHref.set(asset.href, name);
      } catch { /* 写不进去就跳过这张 */ }
    }
  }

  const folder = cacheRoot(root, id);
  fs.mkdirSync(folder, { recursive: true });
  book.chapters.forEach((chapter, index) => {
    writeJson(path.join(folder, index + '.json'), {
      version: 1,
      title: chapter.title,
      paragraphs: chapter.paragraphs,
      images: (chapter.images || []).map(img => ({ after: img.after, file: nameByHref.get(img.href) })).filter(img => img.file)
    });
  });

  /* 有些 EPUB 把书名塞进 dc:creator，作者就会等于书名 —— 这种直接当没有 */
  const authorValue = (() => {
    const a = String(book.author || '').trim();
    const t = String(book.title || '').trim();
    if (!a) return '';
    if (a === t) return '';
    if (t && a.startsWith(t)) return '';
    return a;
  })();
  let sourcePath = file;
  if (ext === '.pdf' || owned) {
    const directory = assetRoot(root, id);
    fs.mkdirSync(directory, { recursive: true });
    sourcePath = path.join(directory, ext === '.pdf' ? 'document.pdf' : 'source' + ext);
    fs.writeFileSync(sourcePath, bytes);
  }
  db.prepare(`INSERT INTO novels
    (id,source,remote_id,title,author,cover,intro,category,languages,word_count,chapter_count,status,local_path,content_hash,added_at,last_opened_at,original)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, 'local', '', book.title, authorValue, coverName, book.intro || '', '',
    language, chars, book.chapters.length, 'active', sourcePath, hash, createdAt, null,
    JSON.stringify({ ext, encoding: book.encoding || '', isbn: book.isbn || '' })
  );
  const insertChapter = db.prepare('INSERT OR REPLACE INTO novel_chapters (novel_id,idx,title,chars,cached_at) VALUES (?,?,?,?,?)');
  book.chapters.forEach((chapter, index) => insertChapter.run(id, index, chapter.title, chapter.chars, createdAt));
  return { id, title: book.title, chapters: book.chapters.length, chars, cover: coverName, language };
}

async function importFiles(root, db, paths, { owned = false, onProgress } = {}) {
  const seen = new Set();
  const result = { imported: [], skipped: [], failed: [] };
  for (const file of (Array.isArray(paths) ? paths : []).slice(0, 200)) {
    const target = String(file || '').trim();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    let stat;
    try { stat = fs.statSync(target); } catch { result.failed.push({ path: target, error: 'NOVEL_NOT_FOUND' }); continue; }
    if (!stat.isFile()) { result.failed.push({ path: target, error: 'NOVEL_NOT_FILE' }); continue; }
    const ext = path.extname(target).toLowerCase();
    if (!kindOf(ext)) { result.failed.push({ path: target, error: 'NOVEL_UNSUPPORTED' }); continue; }
    if (stat.size > limitOf(ext)) { result.failed.push({ path: target, error: 'NOVEL_FILE_TOO_LARGE' }); continue; }
    try {
      onProgress?.('read');
      const bytes = await fs.promises.readFile(target);
      if (bytes.length > limitOf(ext)) throw Error('NOVEL_FILE_TOO_LARGE');
      const hash = sha1(bytes);
      const existing = () => db.prepare('SELECT id,title FROM novels WHERE content_hash=?').get(hash);
      const duplicate = existing();
      if (duplicate) { result.skipped.push({ path: target, ...duplicate, reason: 'DUPLICATE' }); continue; }
      onProgress?.('parse');
      const book = await parseFile(target, bytes);
      if (ext !== '.pdf' && !book.chapters.length) throw Error('NOVEL_EMPTY');
      const concurrent = existing();
      if (concurrent) { result.skipped.push({ path: target, ...concurrent, reason: 'DUPLICATE' }); continue; }
      onProgress?.('save');
      const summary = insertBook(db, root, target, book, hash, bytes, owned);
      result.imported.push({ ...summary, path: target });
    } catch (error) {
      result.failed.push({ path: target, error: /^[A-Z_]+$/.test(error?.message || '') ? error.message : 'NOVEL_PARSE_FAILED' });
    }
  }
  return result;
}

/* ---------------- 扫描 ---------------- */

function scanFolder(folder, { depth = 2, limit = 400 } = {}) {
  const files = [];
  const walk = (dir, level) => {
    if (level > depth || files.length >= limit) return;
    let items = [];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const item of items) {
      if (files.length >= limit) return;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) { walk(full, level + 1); continue; }
      const ext = path.extname(item.name).toLowerCase();
      const kind = kindOf(ext);
      if (!kind) continue;
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      files.push({ path: full, name: item.name, size, kind });
    }
  };
  walk(String(folder || ''), 0);
  return files;
}

/* ---------------- 读取 ---------------- */

function progressOf(db, id) {
  const row = db.prepare('SELECT * FROM novel_progress WHERE novel_id=?').get(id);
  if (!row) return null;
  return { chapterIdx: row.chapter_idx, charOffset: row.char_offset, page: row.page, percent: row.percent, updatedAt: row.updated_at };
}

function shelf(db, root) {
  const rows = db.prepare(`SELECT n.*, (SELECT COUNT(*) FROM novel_chapters c WHERE c.novel_id=n.id) chapters
    FROM novels n WHERE n.status='active' ORDER BY COALESCE(n.last_opened_at,n.added_at) DESC, n.title`).all();
  const books = rows.map(row => {
    const progress = progressOf(db, row.id);
    const online = readOnlineInfo(root, row.id);
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      category: row.category,
      languages: row.languages,
      format: kindOf(path.extname(row.local_path || '').toLowerCase()),
      chapterCount: row.chapters,
      chars: row.word_count,
      source: row.source,
      addedAt: row.added_at,
      lastOpenedAt: row.last_opened_at,
      cover: linkedCover(root, row.id, online?.coverFile) || coverDataUrl(root, row.id, row.cover),
      progress: progress ? {
        chapterIdx: progress.chapterIdx,
        percent: Math.max(0, Math.min(1, progress.percent || 0)),
        updatedAt: progress.updatedAt
      } : null
    };
  });
  const totals = books.reduce((sum, book) => ({ books: sum.books + 1, chapters: sum.chapters + book.chapterCount, chars: sum.chars + book.chars }), { books: 0, chapters: 0, chars: 0 });
  return { books, totals };
}

function onlineDetails(root, id) {
  return {
    online: readOnlineInfo(root, id),
    onlineSources: Object.fromEntries([...onlineFiles.keys()].filter(key => key !== 'bangumi')
      .map(key => [key, readOnlineInfo(root, id, key)])),
    onlineLookup: lookupState(root, id)
  };
}

function detail(db, root, id) {
  const row = db.prepare('SELECT * FROM novels WHERE id=?').get(String(id || ''));
  if (!row) throw Error('NOVEL_NOT_FOUND');
  const chapters = db.prepare('SELECT idx,title,chars FROM novel_chapters WHERE novel_id=? ORDER BY idx').all(row.id);
  const online = onlineDetails(root, row.id);
  const localCover = coverDataUrl(root, row.id, row.cover);
  return {
    book: {
      id: row.id,
      title: row.title,
      author: row.author,
      intro: row.intro,
      languages: row.languages,
      format: kindOf(path.extname(row.local_path || '').toLowerCase()),
      chars: row.word_count,
      chapterCount: row.chapter_count,
      localPath: row.local_path,
      cover: linkedCover(root, row.id, online.online?.coverFile) || localCover,
      hasLocalCover: Boolean(localCover),
      ...online,
      addedAt: row.added_at
    },
    chapters: chapters.map(chapter => ({ idx: chapter.idx, title: chapter.title, chars: chapter.chars })),
    progress: progressOf(db, row.id)
  };
}

function preview(db, root, id) {
  const row = db.prepare(`SELECT id, cover FROM novels WHERE id=? AND status='active'`).get(id);
  if (!row || !/^novel-[a-f0-9]{16}$/.test(row.id)) throw Error('NOVEL_NOT_FOUND');
  const { seconds } = db.prepare('SELECT COALESCE(SUM(seconds), 0) seconds FROM novel_events WHERE novel_id=?').get(id);
  const folder = assetRoot(root, row.id);
  const cover = row.cover && row.cover === path.basename(row.cover) ? row.cover : '';
  let duplicate = '';
  let images = [];
  if (cover) {
    try { duplicate = 'img-' + sha1(fs.readFileSync(path.join(folder, cover))).slice(0, 12); } catch { /* Missing cover. */ }
  }
  try {
    images = fs.readdirSync(folder, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^img-[a-f0-9]{12}\.(?:jpe?g|png|webp|gif)$/.test(entry.name))
      .map(entry => entry.name)
      .filter(name => path.parse(name).name !== duplicate)
      .sort();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { seconds, images };
}

function chapter(db, root, id, index) {
  const row = db.prepare('SELECT title FROM novel_chapters WHERE novel_id=? AND idx=?').get(String(id || ''), Number(index) || 0);
  if (!row) throw Error('NOVEL_CHAPTER_NOT_FOUND');
  const file = path.join(cacheRoot(root, id), String(Number(index) || 0) + '.json');
  let payload;
  try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw Error('NOVEL_CACHE_MISSING'); }
  db.prepare('UPDATE novels SET last_opened_at=? WHERE id=?').run(now(), id);
  return { idx: Number(index) || 0, title: payload.title || row.title, paragraphs: payload.paragraphs || [], images: payload.images || [] };
}

async function findInBook(db, root, id, request = {}) {
  const query = String(request.query || '').trim().slice(0, 160);
  if (!query || !/^novel-[a-f0-9]{16}$/.test(id)) return { rows: [], more: false };
  const chapters = db.prepare('SELECT idx,title FROM novel_chapters WHERE novel_id=? ORDER BY idx').all(id);
  const pattern = new RegExp(RegExp.escape(query), 'giu');
  const rows = [];
  for (const { idx, title } of chapters) {
    const file = path.join(cacheRoot(root, id), String(idx) + '.json');
    let data;
    try { data = JSON.parse(await fs.promises.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
    for (const [paragraph, text] of paragraphs.entries()) {
      if (typeof text !== 'string') continue;
      for (const match of text.matchAll(pattern)) {
        const start = match.index, end = start + match[0].length;
        rows.push({ chapterIdx: idx, chapterTitle: data.title || title, paragraph, start, end,
          before: (start > 40 ? '…' : '') + text.slice(Math.max(0, start - 40), start),
          match: match[0], after: text.slice(end, end + 55) + (end + 55 < text.length ? '…' : '') });
        if (rows.length === 120) return { rows, more: true };
      }
    }
  }
  return { rows, more: false };
}

/* 单张插图：读文件回 base64，前端按需取 */
function image(root, id, name) {
  if (!/^novel-[a-f0-9]{16}$/.test(id) || !/^img-[a-f0-9]{12}\.(?:jpe?g|png|webp|gif)$/.test(name)) throw Error('NOVEL_IMAGE_NOT_FOUND');
  const file = path.join(assetRoot(root, id), name);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 12 * 1024 * 1024) throw Error('NOVEL_IMAGE_NOT_FOUND');
    return { name, mime: IMAGE_MIME[path.extname(name)], data: fs.readFileSync(file).toString('base64') };
  } catch { throw Error('NOVEL_IMAGE_NOT_FOUND'); }
}

async function pdfRange(db, root, id, { begin, end }) {
  if (!/^novel-[a-f0-9]{16}$/.test(id) || !db.prepare("SELECT id FROM novels WHERE id=? AND status='active'").get(id)) {
    throw Error('NOVEL_NOT_FOUND');
  }
  const file = path.join(assetRoot(root, id), 'document.pdf');
  if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile()) throw Error('NOVEL_NOT_FOUND');
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size } = await handle.stat();
    if (begin === undefined && end === undefined) return { size };
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 ||
        end <= begin || end > size || end - begin > PDF_RANGE) throw Error('NOVEL_INVALID_RANGE');
    const bytes = Buffer.alloc(end - begin);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, begin);
    if (bytesRead !== bytes.length) throw Error('NOVEL_NOT_FOUND');
    return { data: bytes.toString('base64') };
  } finally {
    await handle.close();
  }
}

function remove(db, root, id) {
  const row = db.prepare('SELECT id FROM novels WHERE id=?').get(String(id || ''));
  if (!row) throw Error('NOVEL_NOT_FOUND');
  db.prepare('DELETE FROM novel_chapters WHERE novel_id=?').run(row.id);
  db.prepare('DELETE FROM novel_progress WHERE novel_id=?').run(row.id);
  db.prepare('DELETE FROM novel_bookmarks WHERE novel_id=?').run(row.id);
  db.prepare('DELETE FROM novel_excerpts WHERE novel_id=?').run(row.id);
  db.prepare('DELETE FROM novels WHERE id=?').run(row.id);
  for (const folder of [cacheRoot(root, row.id), assetRoot(root, row.id)]) {
    try { fs.rmSync(folder, { recursive: true, force: true }); } catch { /* 文件被占用时留到下次 */ }
  }
  return { removed: true };
}

function getProgress(db, id) {
  const row = db.prepare('SELECT chapter_count FROM novels WHERE id=?').get(String(id || ''));
  if (!row) throw Error('NOVEL_NOT_FOUND');
  const progress = progressOf(db, id);
  if (!progress) return { chapterIdx: 0, charOffset: 0, page: 0, percent: 0, updatedAt: null };
  return progress;
}

function saveProgress(db, id, patch = {}) {
  const row = db.prepare('SELECT chapter_count FROM novels WHERE id=?').get(String(id || ''));
  if (!row) throw Error('NOVEL_NOT_FOUND');
  const chapterIdx = Math.max(0, Math.min(row.chapter_count - 1, Number(patch.chapterIdx) || 0));
  const charOffset = Math.max(0, Number(patch.charOffset) || 0);
  const page = Math.max(0, Number(patch.page) || 0);
  const percent = Number.isFinite(patch.percent) ? Math.max(0, Math.min(1, patch.percent)) : row.chapter_count ? chapterIdx / row.chapter_count : 0;
  const at = now();
  db.prepare(`INSERT INTO novel_progress (novel_id,chapter_idx,char_offset,page,percent,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(novel_id) DO UPDATE SET chapter_idx=excluded.chapter_idx,char_offset=excluded.char_offset,page=excluded.page,percent=excluded.percent,updated_at=excluded.updated_at`)
    .run(id, chapterIdx, charOffset, page, percent, at);
  db.prepare('UPDATE novels SET last_opened_at=? WHERE id=?').run(at, id);
  return { chapterIdx, charOffset, page, percent, updatedAt: at };
}

/* ---------------- 书签 ---------------- */

function bookmarks(db, id) {
  const rows = db.prepare('SELECT * FROM novel_bookmarks WHERE novel_id=? ORDER BY chapter_idx, char_offset, created_at').all(String(id || ''));
  const titles = new Map(db.prepare('SELECT idx,title FROM novel_chapters WHERE novel_id=?').all(String(id || '')).map(row => [row.idx, row.title]));
  return rows.map(row => ({
    id: row.id,
    chapterIdx: row.chapter_idx,
    chapterTitle: titles.get(row.chapter_idx) || '',
    charOffset: row.char_offset,
    note: row.note,
    color: row.color,
    createdAt: row.created_at
  }));
}

function addBookmark(db, id, request = {}) {
  const novel = db.prepare('SELECT id FROM novels WHERE id=?').get(String(id || ''));
  if (!novel) throw Error('NOVEL_NOT_FOUND');
  const chapterIdx = Math.max(0, Number(request.chapterIdx) || 0);
  const charOffset = Math.max(0, Number(request.charOffset) || 0);
  const note = String(request.note || '').slice(0, 200);
  const color = ['red', 'gold', 'blue', ''].includes(String(request.color || '')) ? String(request.color || '') : '';
  /* 同一位置只留一条，避免连点堆一列 */
  const existing = db.prepare('SELECT id FROM novel_bookmarks WHERE novel_id=? AND chapter_idx=? AND char_offset=?').get(id, chapterIdx, charOffset);
  if (existing) return { id: existing.id, existing: true };
  const info = db.prepare('INSERT INTO novel_bookmarks (novel_id,chapter_idx,char_offset,note,color,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, chapterIdx, charOffset, note, color, now());
  return { id: Number(info.lastInsertRowid), existing: false };
}

function removeBookmark(db, id, bookmarkId) {
  const info = db.prepare('DELETE FROM novel_bookmarks WHERE novel_id=? AND id=?').run(String(id || ''), Number(bookmarkId) || 0);
  if (!info.changes) throw Error('NOVEL_BOOKMARK_NOT_FOUND');
  return { removed: true };
}

/* ---------------- 阅读事件（统计用） ---------------- */

function recordEvent(db, id, request = {}) {
  const novel = db.prepare('SELECT id FROM novels WHERE id=?').get(String(id || ''));
  if (!novel) throw Error('NOVEL_NOT_FOUND');
  const seconds = Math.max(0, Math.min(6 * 3600, Math.round(Number(request.seconds) || 0)));
  const characters = Math.max(0, Math.min(500000, Math.round(Number(request.characters) || 0)));
  if (!seconds && !characters) return { recorded: false };
  db.prepare('INSERT INTO novel_events (novel_id,seconds,characters,occurred_at) VALUES (?,?,?,?)').run(id, seconds, characters, now());
  return { recorded: true };
}


/* ---------------- 摘录 ---------------- */

function excerpts(db, id) {
  const rows = db.prepare('SELECT * FROM novel_excerpts WHERE novel_id=? ORDER BY created_at DESC').all(String(id || ''));
  const titles = new Map(db.prepare('SELECT idx,title FROM novel_chapters WHERE novel_id=?').all(String(id || '')).map(row => [row.idx, row.title]));
  return rows.map(row => {
    let meta = {};
    try { meta = JSON.parse(row.anki_note_id || '{}'); } catch { /* 老数据 */ }
    return {
      id: row.id,
      chapterIdx: row.chapter_idx,
      chapterTitle: titles.get(row.chapter_idx) || '',
      text: row.text,
      translation: row.translation,
      word: meta.word || '',
      paragraph: Number(meta.paragraph) || 0,
      start: Number(meta.start) || 0,
      end: Number(meta.end) || 0,
      createdAt: row.created_at
    };
  });
}

function addExcerpt(db, id, request = {}) {
  const novel = db.prepare('SELECT id FROM novels WHERE id=?').get(String(id || ''));
  if (!novel) throw Error('NOVEL_NOT_FOUND');
  const text = String(request.text || '').slice(0, 2000).trim();
  if (!text) throw Error('NOVEL_EXCERPT_EMPTY');
  const chapterIdx = Math.max(0, Number(request.chapterIdx) || 0);
  const translation = String(request.translation || '').slice(0, 2000);
  const titles = db.prepare('SELECT title FROM novel_chapters WHERE novel_id=? AND idx=?').get(id, chapterIdx);
  /* 顺手写进「学习 › 句子」：摘录即同步，不需要二级菜单再确认一次 */
  let sentenceId = null;
  try {
    sentenceId = require('../saved-sentences.cjs').save(db, { gameId: null, text, translation, source: 'manual' }).id;
  } catch { /* 句子保存失败不影响摘录本身 */ }
  const payload = JSON.stringify({
    word: String(request.word || '').slice(0, 40),
    paragraph: Math.max(0, Number(request.paragraph) || 0),
    start: Number(request.start) || 0,
    end: Number(request.end) || 0,
    sentenceId
  });
  const info = db.prepare('INSERT INTO novel_excerpts (novel_id,chapter_idx,text,chapter_title,translation,anki_note_id,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, chapterIdx, text, titles?.title || '', translation, payload, now());
  return { id: Number(info.lastInsertRowid), sentenceId, text, translation, chapterTitle: titles?.title || '' };
}

/* 补译文：写回摘录，并同步到「学习 › 句子」那条 */
function translateExcerpt(db, id, request = {}) {
  const excerptId = Number(request.excerptId) || 0;
  const translation = String(request.translation || '').slice(0, 2000).trim();
  if (!translation) throw Error('NOVEL_TRANSLATION_EMPTY');
  const row = db.prepare('SELECT anki_note_id FROM novel_excerpts WHERE novel_id=? AND id=?').get(String(id || ''), excerptId);
  if (!row) throw Error('NOVEL_EXCERPT_NOT_FOUND');
  db.prepare('UPDATE novel_excerpts SET translation=? WHERE id=?').run(translation, excerptId);
  try {
    const sentenceId = JSON.parse(row.anki_note_id || '{}').sentenceId;
    if (sentenceId) {
      db.prepare("UPDATE saved_sentences SET translation=? WHERE id=? AND (translation IS NULL OR translation='')").run(translation, sentenceId);
    }
  } catch { /* 句子那边没有就算了 */ }
  return { id: excerptId, translation };
}

function removeExcerpt(db, id, excerptId) {
  const row = db.prepare('SELECT anki_note_id FROM novel_excerpts WHERE novel_id=? AND id=?').get(String(id || ''), Number(excerptId) || 0);
  const info = db.prepare('DELETE FROM novel_excerpts WHERE novel_id=? AND id=?').run(String(id || ''), Number(excerptId) || 0);
  if (!info.changes) throw Error('NOVEL_EXCERPT_NOT_FOUND');
  /* 句子面板里的那条一起删掉，两边保持一致 */
  try {
    const sentenceId = JSON.parse(row?.anki_note_id || '{}').sentenceId;
    if (sentenceId) require('../saved-sentences.cjs').remove(db, { id: sentenceId });
  } catch { /* 已经不在也不报错 */ }
  return { removed: true };
}
module.exports = {
  importFiles, scanFolder, shelf, detail, preview, chapter, findInBook, remove, getProgress, saveProgress, readOnlineInfo, setOnlineInfo, onlineDetails, lookupState,
  bookmarks, addBookmark, removeBookmark, recordEvent, excerpts, addExcerpt, translateExcerpt, removeExcerpt,
  coverDataUrl, image, pdfRange, kindOf, limitOf, MAX_FILE
};
