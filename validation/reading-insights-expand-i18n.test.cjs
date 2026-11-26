// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

test('readingInsightsHTML and toggle messages localize expand/collapse button in zh, ja and en', async () => {
  const { readingInsightsHTML, insightMessages } = await import(pathToFileURL(path.join(ROOT, 'web', 'reading-insights.js')));
  const items = Array.from({ length: 7 }, (_, i) => ({ key: 'w' + i, base: '語' + i, count: 10 - i, games: [] }));
  const data = { lines: 10, pending: 0, weekly: items, frequent: items, jlpt: [], games: [] };

  const zhHtml = readingInsightsHTML(data, { locale: 'zh', esc: String, number: String });
  const jaHtml = readingInsightsHTML(data, { locale: 'ja', esc: String, number: String });
  const enHtml = readingInsightsHTML(data, { locale: 'en', esc: String, number: String });

  assert.match(zhHtml, /展开全部 7 个 ↓/);
  assert.doesNotMatch(jaHtml, /展开全部/);
  assert.match(jaHtml, /すべて表示（7 語）↓/);
  assert.doesNotMatch(enHtml, /展开全部/);
  assert.match(enHtml, /Show all 7 ↓/);

  assert.equal(insightMessages.zh.collapse, '收起 ↑');
  assert.equal(insightMessages.ja.collapse, '折りたたむ ↑');
  assert.equal(insightMessages.en.collapse, 'Show less ↑');
});
