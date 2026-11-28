// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 网文页面的小工具：两站页面结构固定，按类名切块就够了，不引入 HTML 解析库。 */
const { decodeEntities } = require('../parse-epub.cjs');

const attr = (tag, name) => {
  const found = new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
  return found ? decodeEntities(found[2] ?? found[3] ?? '') : '';
};

/* 纯文本：注音的 rt/rp 去掉，只留本文 */
const text = html => decodeEntities(String(html || '')
  .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>|<rp\b[^>]*>[\s\S]*?<\/rp>/gi, '')
  .replace(/<br\b[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, ''))
  .replace(/[ \t\r\f\v\u00a0]+/g, ' ').replace(/ *\n */g, '\n')
  /* \u53ea\u53bb\u534a\u89d2\u7a7a\u767d\uff1a\u6bb5\u9996\u7684\u5168\u89d2\u7a7a\u683c\u662f\u539f\u6587\u7684\u7f29\u8fdb\uff0c\u9605\u8bfb\u8bbe\u7f6e\u91cc\u7684\u300c\u7f29\u8fdb\u4fee\u6b63\u300d\u518d\u51b3\u5b9a\u8981\u4e0d\u8981 */
  .replace(/^[ \n]+|[ \n]+$/g, '');

/* 注音段：[{text, rt?}]，没有注音时返回 null，阅读器按需渲染 <ruby> */
function rubySegments(html) {
  const source = String(html || '');
  if (!/<ruby\b/i.test(source)) return null;
  const out = [];
  let last = 0;
  const pattern = /<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi;
  for (let found; (found = pattern.exec(source));) {
    const before = text(source.slice(last, found.index));
    if (before) out.push({ text: before });
    const inner = found[1];
    const base = text(inner.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, ''));
    const reading = text((/<rt\b[^>]*>([\s\S]*?)<\/rt>/i.exec(inner) || [])[1] || '');
    if (base) out.push(reading ? { text: base, rt: reading } : { text: base });
    last = pattern.lastIndex;
  }
  const rest = text(source.slice(last));
  if (rest) out.push({ text: rest });
  return out;
}

/* 取出第一个 class 含 name 的元素的内部 HTML（按同名标签计数配对，容忍嵌套） */
function inner(html, className, tag = 'div') {
  const source = String(html || '');
  const open = new RegExp(`<${tag}\\b[^>]*\\bclass\\s*=\\s*"[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'i').exec(source);
  if (!open) return '';
  const start = open.index + open[0].length;
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 1;
  for (let found; (found = tags.exec(source));) {
    depth += found[1] ? -1 : 1;
    if (!depth) return source.slice(start, found.index);
  }
  return source.slice(start);
}

const meta = (html, property) => {
  const tag = new RegExp(`<meta\\b[^>]*\\bproperty\\s*=\\s*"${property.replace(/[.:]/g, '\\$&')}"[^>]*>`, 'i').exec(String(html || ''));
  return tag ? attr(tag[0], 'content').trim() : '';
};

module.exports = { attr, text, rubySegments, inner, meta, decodeEntities };
