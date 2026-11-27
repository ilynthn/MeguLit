// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 本地 TXT：编码探测 → 规范化 → 分章。
   只吃 Node 内置的 TextDecoder（utf-8 / gb18030 / shift_jis），不引任何依赖。
   判定顺序：BOM → UTF-8 严格解码成功即 UTF-8 → 否则同时用 GB18030 与 Shift_JIS 解一遍，按文本可信度打分取高的。 */
const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const gb18030 = new TextDecoder('gb18030');
const shiftJis = new TextDecoder('shift_jis');

const stripBom = text => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
const REPLACEMENT = '\uFFFD';

/* 一段文本像不像正常正文：替换符重罚，假名与常用日文标点加分，控制字符罚。 */
function score(text) {
  const head = text.slice(0, 200000);
  let s = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i);
    if (head[i] === REPLACEMENT) { s -= 60; continue; }
    if (c === 0) { s -= 40; continue; }
    if (c >= 0x3040 && c <= 0x30ff) { s += 3; continue; }            // 假名
    if (c >= 0x4e00 && c <= 0x9fff) { s += 1; continue; }            // 汉字
    if (c >= 0x3000 && c <= 0x303f) { s += 1; continue; }            // 日文标点
    if (c >= 0xff01 && c <= 0xff5e) { s += 1; continue; }            // 全角
    if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) s -= 30;
  }
  return s;
}

function decode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) return { encoding: 'utf-8', text: '' };
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', text: stripBom(bytes.subarray(3).toString('utf8')) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', text: stripBom(new TextDecoder('utf-16le').decode(bytes.subarray(2))) };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));
    swapped.swap16();
    return { encoding: 'utf-16be', text: stripBom(new TextDecoder('utf-16le').decode(swapped)) };
  }
  try {
    const text = stripBom(utf8Strict.decode(bytes));
    /* UTF-8 严格通过也可能是纯 ASCII，此时无需再猜 */
    if (!/[\u0080-\u00ff]/.test(text) || score(text) > -200) return { encoding: 'utf-8', text };
  } catch { /* 不是 UTF-8，继续猜 */ }
  const candidates = [
    { encoding: 'gb18030', text: stripBom(gb18030.decode(bytes)) },
    { encoding: 'shift_jis', text: stripBom(shiftJis.decode(bytes)) }
  ].map(item => ({ ...item, value: score(item.text) }));
  candidates.sort((a, b) => b.value - a.value);
  const best = candidates[0];
  return { encoding: best.encoding, text: best.text };
}

function normalize(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n');
}

const HEADINGS = [
  /^第[〇零一二三四五六七八九十百千両0-9０-９]{1,12}[章卷回節节話话幕部篇]/,
  /^(?:序章|序説|終章|终章|楔子|引子|前書き|後書き|あとがき|プロローグ|エピローグ|番外|後記|后记|幕間)/,
  /^(?:Chapter|CHAPTER|Part|PART)\s+[0-9IVXLC]{1,8}\b/
];
const WEAK_HEADINGS = [
  /^[0-9]{1,3}[.、]\s*\S/,
  /^[（(][0-9]{1,3}[）)]\s*\S/,
  /^[０-９]{1,3}[　\s]\s*\S/
];
const NOISE_TAIL = /[。．.！？!?、,，；;：:」』）)】]$/;

function looksLikeHeading(line, previousBlank, index) {
  const text = line.trim();
  if (!text || text.length > 40) return false;
  if (NOISE_TAIL.test(text)) return false;
  /* 「第N章／序章／Chapter N」这类强标题不要求上一行空行：连载文本里常没有空行 */
  if (HEADINGS.some(pattern => pattern.test(text))) return true;
  return previousBlank && WEAK_HEADINGS.some(pattern => pattern.test(text));
}

function chunkBySize(text, size) {
  const out = [];
  let rest = text;
  while (rest.length) {
    if (rest.length <= size) { out.push(rest); break; }
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size * 0.6) cut = rest.lastIndexOf('。', size);
    if (cut < size * 0.5) cut = size;
    out.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  return out;
}

/* 前导信息：书名/作者常写在第一屏，取到就用它覆盖文件名推断出来的标题。 */
const FRONT_PATTERNS = [
  { key: 'title', pattern: /^(?:书名|書名|作品名|标题|標題|title)\s*[:：]\s*(.{1,80})$/i },
  { key: 'author', pattern: /^(?:作者|著者|author)\s*[:：]\s*(.{1,60})$/i },
  { key: 'isbn', pattern: /^ISBN(?:-1[03])?\s*[:：]\s*(.{10,32})$/i }
];
function frontMatter(raw) {
  const out = {};
  const lines = normalize(raw).split('\n').slice(0, 12);
  for (const line of lines) {
    const text = line.trim();
    for (const item of FRONT_PATTERNS) {
      if (out[item.key]) continue;
      const found = item.pattern.exec(text);
      if (found) out[item.key] = found[1].trim();
    }
  }
  return out;
}

/* 返回 [{title, text}]。三级回退：标题行切分 → 目录式切分（已在标题行规则里覆盖）→ 等比切分。 */
function splitChapters(raw, { size = 8000 } = {}) {
  const text = normalize(raw);
  const lines = text.split('\n');
  const chapters = [];
  let title = '';
  let buffer = [];
  const flush = () => {
    const body = buffer.join('\n').trim();
    if (!body && !title) return;
    chapters.push({ title: title || '', text: body });
    buffer = [];
  };
  let previousBlank = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (looksLikeHeading(line, previousBlank, i)) {
      flush();
      title = line.trim();
      previousBlank = true;
      continue;
    }
    buffer.push(line);
    previousBlank = !line.trim() ? true : false;
  }
  flush();
  const cleaned = chapters.filter(ch => ch.text.length || ch.title);
  /* 第一个标题之前的书名/作者/简介不是一章：短的整块丢掉（元信息另外解析），长的留成"前言" */
  while (cleaned.length > 1 && !cleaned[0].title) {
    if (cleaned[0].text.length <= 400) cleaned.shift();
    else { cleaned[0].title = '前言'; break; }
  }

  const total = cleaned.reduce((n, ch) => n + ch.text.length, 0);
  if (!cleaned.length || total === 0) return [{ title: '', text }];
  /* 没有识别出任何标题：按字数切，标题自动编号 */
  if (cleaned.length === 1 && !cleaned[0].title && total > size * 1.2) {
    return chunkBySize(cleaned[0].text, size).map((body, index) => ({ title: `第 ${index + 1} 节`, text: body.trim() }));
  }
  return cleaned.map((ch, index) => ({ title: ch.title || `第 ${index + 1} 章`, text: ch.text }));
}

module.exports = { decode, normalize, splitChapters, frontMatter, score, looksLikeHeading };
