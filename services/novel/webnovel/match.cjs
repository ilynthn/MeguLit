// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 日文原作 ↔ 中文汉化的匹配。
   作品：作者名（日文折成简体后比较）+ 书名汉字重合；番外、FANBOOK、短篇集这类衍生书扣分。
   章节：两边目录按顺序做动态规划，章名汉字重合打分，连续的对应加分；不够把握的不配，留给用户手选。
   注意：syosetu 是网络连载版，linovelib 多是书籍版译文，书籍版会改写、合并、拆分章节，所以章节和段落都可能对不上，
   这时宁可标「未匹配」也不硬配。 */
const { similarity } = require('../identity.cjs');
const { key, han } = require('./kanji.cjs');

const SPIN_OFF = /fanbook|番外|外传|外傳|短篇|短编|短編|画集|画册|漫画|漫畫|設定|设定|特典|官方|公式|アンソロジー|anthology|ss集/i;
/* 副标题（～…～、―…―、括号）不算核心书名 */
const coreTitle = value => String(value || '').normalize('NFKC').replace(/[\s　]*[~～〜―－\-–—(（【［\[].*$/u, '').trim() || String(value || '').trim();

function hanOverlap(a, b) {
  const left = han(a);
  const right = han(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const char of left) if (right.has(char)) shared++;
  return shared / Math.min(left.size, right.size) * 0.6 + shared / Math.max(left.size, right.size) * 0.4;
}

const textScore = (a, b) => {
  const ka = key(a);
  const kb = key(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  return Math.max(similarity(ka, kb), hanOverlap(a, b));
};

function workScore(ja, zh, aliases = []) {
  const author = ja.author && zh.author ? (key(ja.author) === key(zh.author) ? 1 : similarity(key(ja.author), key(zh.author))) : 0;
  const titles = [ja.title, ...aliases].filter(Boolean);
  /* 核心书名长度差得多（另起副题的外传、合集）时打折 */
  const lengthFit = (a, b) => {
    const la = key(coreTitle(a)).length;
    const lb = key(coreTitle(b)).length;
    return la && lb ? 0.7 + 0.3 * Math.min(la, lb) / Math.max(la, lb) : 0.7;
  };
  const title = Math.max(0, ...titles.map(name => (textScore(coreTitle(name), coreTitle(zh.title)) * 0.75 +
    textScore(name, zh.title) * 0.25) * lengthFit(name, zh.title)));
  /* 衍生书：中文一侧有、日文一侧没有 */
  const spin = SPIN_OFF.test(zh.title) && !titles.some(name => SPIN_OFF.test(name)) ? 0.35 : 0;
  const score = Math.max(0, (zh.author ? author * 0.5 + title * 0.5 : title) - spin);
  const sure = score >= 0.62 && (author >= 0.9 || title >= 0.8);
  return { score: Math.round(score * 1000) / 1000, author, title, sure };
}

/* candidates：同作者作品等；返回排好序的候选，最多一个 sure */
function rankWorks(ja, candidates, aliases = []) {
  const ranked = candidates.map(zh => ({ ...zh, match: workScore(ja, zh, aliases) }))
    .sort((a, b) => b.match.score - a.match.score);
  if (ranked[1] && ranked[0].match.score - ranked[1].match.score < 0.08) for (const item of ranked) item.match.sure = false;
  for (const item of ranked.slice(1)) item.match.sure = false;
  return ranked;
}

/* 章节对应：返回与 ja 等长的 [{ zh: index|null, score, sure }] */
function matchChapters(jaChapters, zhChapters) {
  const ja = jaChapters.map(chapter => chapter.title);
  const zhIndex = zhChapters.map((chapter, index) => ({ chapter, index })).filter(entry => !entry.chapter.extra);
  const zh = zhIndex.map(entry => entry.chapter.title);
  const n = ja.length;
  const m = zh.length;
  const NEG = -1e9;
  /* 相同章名在大目录里很常见（序章、后记），所以只在附近找：窗口按长度比例放宽 */
  const ratio = m / Math.max(1, n);
  const band = Math.max(25, Math.ceil(Math.max(n, m) * 0.25));
  const score = new Map();
  const at = (i, j) => {
    const k = i * (m + 1) + j;
    if (!score.has(k)) score.set(k, textScore(ja[i], zh[j]));
    return score.get(k);
  };
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(NEG));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  const run = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  D[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    const center = i * ratio;
    const lo = Math.max(0, Math.floor(center - band));
    const hi = Math.min(m, Math.ceil(center + band));
    for (let j = lo; j <= hi; j++) {
      const d = D[i][j];
      if (d === NEG) continue;
      if (i < n && d > D[i + 1][j]) { D[i + 1][j] = d; B[i + 1][j] = 2; }
      if (j < m && d > D[i][j + 1]) { D[i][j + 1] = d; B[i][j + 1] = 3; }
      if (i < n && j < m) {
        const s = at(i, j);
        const streak = run[i][j] ? 0.3 : 0;
        const gain = s + streak - 0.35;
        if (gain > 0 && d + gain > D[i + 1][j + 1]) { D[i + 1][j + 1] = d + gain; B[i + 1][j + 1] = 1; run[i + 1][j + 1] = 1; }
      }
    }
  }
  let bi = n;
  let bj = 0;
  for (let j = 0; j <= m; j++) if (D[n][j] > D[n][bj]) bj = j;
  const out = ja.map(() => ({ zh: null, score: 0, sure: false }));
  for (let i = bi, j = bj; i > 0 || j > 0;) {
    const step = B[i][j];
    if (step === 1) {
      const s = at(i - 1, j - 1);
      out[i - 1] = { zh: zhIndex[j - 1].index, score: Math.round(s * 1000) / 1000, sure: s >= 0.5 };
      i--; j--;
    } else if (step === 2) i--;
    else if (step === 3) j--;
    else break;
  }
  return out;
}

module.exports = { workScore, rankWorks, matchChapters, textScore, coreTitle };
