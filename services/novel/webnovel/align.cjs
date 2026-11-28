// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 段落对齐：日文段落在上、中文段落在下。
   沿用 services/script-harvest.cjs 的 Gale-Church 长度模型（中文约为日文的 0.8 倍长，1-1 / 1-0 / 0-1 / 2-1 / 1-2 五种配对），
   多加两样：汉字重合（日文折成简体后比较）和「是不是对白」，并给每一对算把握度。
   对不上就不配：把握度低的拆成「原文无对应汉化」和「汉化无对应原文」两行，不硬塞到一起。
   linovelib 截断处（gap）可以吞掉任意多段日文，这些段落标成「汉化缺失」。 */
const { han } = require('./kanji.cjs');

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const size = value => Math.max(1, (String(value).match(CJK) || []).length + (String(value).match(/[A-Za-z0-9]/g) || []).length * 0.5);
const R = 0.8;
const OK = 0.58;
const WEAK = 0.4;
const K = { len: 1, word: 3, skip: 1, skipZh: 4, gap: 0.9, merge: 2 };

/* 两边都常见、说明不了对应关系的字 */
const COMMON = new Set('的一了是不人我这那在有个也就都说着和她他你为么么来去到上下大小中里出会要还没过看'.split(''));
function lexical(ja, zh) {
  const a = [...han(ja)].filter(char => !COMMON.has(char));
  const b = new Set([...han(zh)].filter(char => !COMMON.has(char)));
  /* 日文几乎全是假名（短对白）：汉字说明不了什么，按「不知道」算 */
  if (a.length < 2) return 0.36;
  if (!b.size) return 0;
  const shared = a.filter(char => b.has(char)).length;
  /* 字太少时不按小集合算比例，免得一两个字撞上就满分 */
  return shared / Math.max(3, Math.min(a.length, b.size)) * 0.7 + shared / Math.max(a.length, b.size) * 0.3;
}
const dialogue = value => /^[「『（(“"]/.test(String(value).trim());
const numbers = value => (String(value).normalize('NFKC').match(/\d+/g) || []).join(',');

function pairScore(ja, zh) {
  /* +4 平滑：短句的长度比很不稳 */
  const d = Math.log((size(zh) + 4) / (size(ja) * R + 4));
  const length = Math.exp(-d * d * 2.5);
  const words = Math.min(1, lexical(ja, zh) * 1.4);
  const shape = dialogue(ja) === dialogue(zh) ? 1 : 0;
  const digits = numbers(ja) === numbers(zh) ? 1 : 0.4;
  let conf = length * 0.3 + words * 0.55 + shape * 0.1 + digits * 0.05;
  /* 长度差太多的一对最多算「可能」，不能只靠撞字配上 */
  if (length < 0.25) conf = Math.min(conf, WEAK - 0.01);
  return { conf: Math.round(conf * 1000) / 1000, d, words, shape };
}

/* jaBlocks / zhBlocks：[{t:'p', text} | {t:'br'} | {t:'img'} | {t:'gap'}] */
function alignChapter(jaBlocks = [], zhBlocks = []) {
  const jaText = jaBlocks.map((block, index) => ({ block, index })).filter(entry => entry.block.t === 'p');
  const zh = zhBlocks.filter(block => block.t === 'p' || block.t === 'gap');
  const n = jaText.length;
  const m = zh.length;
  const INF = 1e18;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  const B = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
  D[0][0] = 0;
  const J = i => jaText[i].block.text;
  const Z = j => zh[j].text;
  const isGap = j => zh[j]?.t === 'gap';
  /* 书籍版改写多，汉字重合比长度更可信；跳过一段的代价要低于「随便配一段」 */
  const cost = (ja, zhText) => {
    const { d, words, shape } = pairScore(ja, zhText);
    return d * d * K.len + (1 - words) * K.word + (1 - shape) * 0.5;
  };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const d = D[i][j];
    if (d >= INF) continue;
    const step = (di, dj, c, kind) => {
      const a = i + di;
      const b = j + dj;
      if (a <= n && b <= m && d + c < D[a][b]) { D[a][b] = d + c; B[a][b] = kind; }
    };
    if (j < m && isGap(j)) {
      step(0, 1, 0, 6); // 离开截断处
      if (i < n) step(1, 0, K.gap, 7); // 日文落进截断处：汉化缺失
      /* 截断处不再参与别的配对 */
      continue;
    }
    if (i < n && j < m) step(1, 1, cost(J(i), Z(j)), 1);
    if (i < n) step(1, 0, K.skip, 2);
    if (j < m) step(0, 1, K.skipZh, 3);
    if (i + 1 < n && j < m) step(2, 1, cost(J(i) + J(i + 1), Z(j)) + K.merge, 4);
    if (i < n && j + 1 < m && !isGap(j + 1)) step(1, 2, cost(J(i), Z(j) + Z(j + 1)) + K.merge, 5);
  }
  /* 回溯成「事件」：每个日文段落一个状态，另外记下没配上的中文段 */
  const byJa = new Array(n).fill(null);
  const extras = []; // [{after: jaTextIndex, text}]
  for (let i = n, j = m; i > 0 || j > 0;) {
    const kind = B[i][j];
    if (kind === 1) {
      const { conf, d } = pairScore(J(i - 1), Z(j - 1));
      byJa[i - 1] = { zh: [Z(j - 1)], conf, single: Math.abs(d) < 0.5 };
      i--; j--;
    } else if (kind === 2) { byJa[i - 1] = { zh: [], conf: 0, state: 'missing' }; i--; }
    else if (kind === 3) { extras.push({ after: i - 1, text: Z(j - 1) }); j--; }
    else if (kind === 4) {
      const { conf } = pairScore(J(i - 2) + J(i - 1), Z(j - 1));
      byJa[i - 2] = { zh: [Z(j - 1)], conf, span: 2 };
      byJa[i - 1] = { zh: [], conf, state: 'merged' };
      i -= 2; j--;
    } else if (kind === 5) {
      const { conf } = pairScore(J(i - 1), Z(j - 2) + Z(j - 1));
      byJa[i - 1] = { zh: [Z(j - 2), Z(j - 1)], conf };
      i--; j -= 2;
    } else if (kind === 6) j--;
    else if (kind === 7) { byJa[i - 1] = { zh: [], conf: 0, state: 'missing', reason: 'truncated' }; i--; }
    else break;
  }
  /* 组装成行，保持日文原有的空行和插图 */
  const rows = [];
  const pendingExtras = new Map();
  for (const extra of extras.reverse()) {
    if (!pendingExtras.has(extra.after)) pendingExtras.set(extra.after, []);
    pendingExtras.get(extra.after).push(extra.text);
  }
  const flushExtras = after => {
    for (const text of pendingExtras.get(after) || []) rows.push({ t: 'p', ja: null, zh: [text], state: 'extra', conf: 0 });
  };
  flushExtras(-1);
  let k = 0;
  for (const block of jaBlocks) {
    if (block.t !== 'p') { rows.push({ t: block.t, src: block.src }); continue; }
    const event = byJa[k] || { zh: [], conf: 0, state: 'missing' };
    let state = event.state || (event.conf >= OK ? 'ok' : event.conf >= WEAK ? 'weak' : 'unpaired');
    /* 一对一、长度合得上、前后两段都配上了（或在章首章尾）：汉字不重合的短对白也算「可能」，不拆开 */
    if (state === 'unpaired' && event.single) {
      const settled = other => !other || (!other.state && other.conf >= WEAK);
      if (settled(byJa[k - 1]) && settled(byJa[k + 1])) state = 'weak';
    }
    if (state === 'unpaired') {
      /* 对不上：原文一行、汉化另起一行 */
      rows.push({ t: 'p', ja: block, zh: [], state: 'missing', conf: event.conf });
      rows.push({ t: 'p', ja: null, zh: event.zh, state: 'extra', conf: event.conf });
    } else {
      rows.push({ t: 'p', ja: block, zh: event.zh, state, conf: event.conf, ...(event.reason ? { reason: event.reason } : {}) });
    }
    flushExtras(k);
    k++;
  }
  const count = state => rows.filter(row => row.state === state).length;
  return {
    rows,
    stats: { ja: n, zh: zh.filter(block => block.t === 'p').length, ok: count('ok'), weak: count('weak'),
      missing: count('missing'), extra: count('extra'), merged: count('merged'),
      truncated: rows.filter(row => row.reason === 'truncated').length },
  };
}

module.exports = { alignChapter, pairScore, K };
