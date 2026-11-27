// SPDX-License-Identifier: GPL-3.0-or-later
import { pageTurns, readerIcon, readerLabels, readerMenu, readerSettings } from './novel-reader-controls.js';
import { captureReaderPage, invalidateReaderTurnSnapshot, stopReaderTurn, turnReaderPage } from './novel-reader-turn.js';
import { baseRanges, baseTextHit, passageBetween, selectionBoxes } from './novel-reader-selection.js';

/* 文库阅读器：CSS 多栏分页（横排 / 竖排）+ 滚动模式，排版面板、目录、书签、进度与阅读事件。
   分页的核心是「一个字符偏移 = 一个稳定的阅读位置」：段落带 data-off，排版后一次性测出每段所在栏，
   翻页只改 transform，恢复位置用栏号反查 offset，所以换字号、换窗口、换设备都能落回同一段。 */
const PREFS_KEY = 'megulit-novel-reader';
const GAP = 48;
const DRAWER_KEYS = { t: 'toc', b: 'marks', n: 'notes', a: 'type' };
const DEFAULTS = { size: 19, lineHeight: 1.95, pad: 6, font: 'serif', paper: 'cream', dir: 'h', spread: 'auto', ruby: 'auto',
  turn: 'slide', chrome: 'auto', bilingual: false };
const PAPERS = {
  cream: { paper: '#f6efdf', ink: '#2e2823', rule: 'rgba(80,60,40,.16)' },
  white: { paper: '#fbfaf7', ink: '#26231f', rule: 'rgba(60,50,40,.14)' },
  green: { paper: '#e6ece2', ink: '#26302a', rule: 'rgba(50,70,55,.18)' },
  night: { paper: '#141216', ink: '#d7d2cc', rule: 'rgba(255,255,255,.12)' },
  quiet: { paper: '#e9e7e5', ink: '#514b53', rule: 'rgba(80,64,86,.15)' },
  bold: { paper: '#faf3e7', ink: '#241a18', rule: 'rgba(80,54,40,.20)' }
};
const FONTS = {
  serif: 'var(--t-serif, "Noto Serif SC", "Songti SC", SimSun, serif)',
  sans: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif'
};

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    const prefs = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
    if (prefs.dir === 's' || prefs.turn === 'scroll') { prefs.dir = 's'; prefs.turn = 'scroll'; }
    else if (!pageTurns.includes(prefs.turn)) prefs.turn = DEFAULTS.turn;
    return prefs;
  } catch {
    return { ...DEFAULTS };
  }
}
function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* 隐私模式 */ }
}

export async function openReader(host, ctx) {
  const { api, esc, toast, w, id, locale = 'zh', lookup, windowAction, chapterIdx = 0, charOffset = 0, startPage, onExit } = ctx;
  const prefs = loadPrefs();
  const labels = readerLabels[locale] || readerLabels.zh;

  let alive = true;
  let booted = false;
  let detail = null;
  let chapter = null;
  let page = 0;
  let pages = 1;
  let stride = 0;
  let columns = [];
  let paras = [];
  let panel = '';
  let bookmarks = [];
  let ruby = null;
  let bookLang = '';
  let segmenter;
  let lookupCard = null;
  let lookupRequest = 0;
  let selection = null;
  let drag = null;
  let hoveredWord = null;
  let pendingSeconds = 0;
  let pendingChars = 0;
  let lastCountedPage = -1;
  let saveTimer = null;
  let flushTimer = null;
  let tickTimer = null;
  let lastTick = Date.now();
  let fullscreen = false;
  let nativeFullscreen = false;
  let chapterRequest = 0;
  let turningChapter = false;
  let prefetchTimer;
  let snapshotIdle;
  const chapterCache = new Map();
  let translateTimer;
  let queryTimer;
  let panelVersion = 0;
  const translations = new Map();

  host.innerHTML = `
    <div class="novel-reader" data-dir="${esc(prefs.dir)}" data-paper="${esc(prefs.paper)}">
      <div class="nr-reading-spread">
        <div class="nr-stage" data-nr-stage>
          <div class="nr-viewport" data-nr-viewport><div class="nr-body" data-nr-body></div></div>
        </div>
        <aside class="nr-translation" hidden aria-label="${esc(labels.translation)}">
          <h2>${esc(labels.translation)}</h2><div data-reader-translation role="status"></div>
        </aside>
      </div>
      <div class="nr-selection-layer" aria-hidden="true"></div>
      <div class="nr-reader-ui">
        <aside class="nr-panel" data-nr-panel hidden></aside>
        ${readerMenu(labels, w, esc)}
      </div>
    </div>`;

  const root = host.querySelector('.novel-reader');
  const stage = host.querySelector('[data-nr-stage]');
  const body = host.querySelector('[data-nr-body]');
  const viewport = host.querySelector('[data-nr-viewport]');
  const panelEl = host.querySelector('[data-nr-panel]');
  const menu = host.querySelector('[data-reader-menu]');
  const menuTrigger = host.querySelector('[data-reader-action="menu"]');
  const translationEl = host.querySelector('[data-reader-translation]');
  const readerUI = host.querySelector('.nr-reader-ui');
  const selectionLayer = host.querySelector('.nr-selection-layer');

  applyPrefs();
  const themeObserver = new MutationObserver(syncChrome);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function applyPrefs() {
    const paper = PAPERS[prefs.paper] || PAPERS.cream;
    root.dataset.dir = prefs.dir;
    root.dataset.paper = prefs.paper;
    root.dataset.turn = prefs.turn;
    root.style.setProperty('--nr-size', prefs.size + 'px');
    root.style.setProperty('--nr-lh', String(prefs.lineHeight));
    root.style.setProperty('--nr-pad', prefs.pad + '%');
    root.style.setProperty('--nr-font', FONTS[prefs.font] || FONTS.serif);
    root.style.setProperty('--nr-paper', paper.paper);
    root.style.setProperty('--nr-ink', paper.ink);
    root.style.setProperty('--nr-rule', paper.rule);
    root.style.setProperty('--nr-weight', prefs.paper === 'bold' ? '700' : '400');
    translationEl.parentElement.hidden = !prefs.bilingual;
    syncChrome();
    /* 供 CSS 给承载层上色，接缝处不会透出背景图 */
    document.documentElement.style.setProperty('--nv-paper', paper.paper);
    savePrefs(prefs);
  }

  function syncChrome() {
    root.dataset.uiTheme = ['dark', 'light'].includes(prefs.chrome) ? prefs.chrome
      : document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const language = menu.querySelector('[data-reader-action="language"]');
    language.setAttribute('aria-pressed', String(prefs.bilingual));
    language.title = prefs.bilingual ? labels.singleLang : labels.dualLang;
    language.setAttribute('aria-label', language.title);
  }

  /* ---------------- 排版 ---------------- */

  function layout() {
    const vertical = prefs.dir === 'v';
    const mode = prefs.dir === 's' ? 'scroll' : prefs.dir === 'v' ? 'vscroll' : 'paged';
    root.dataset.mode = mode;
    stopReaderTurn(root);
    cancelIdleCallback(snapshotIdle);
    invalidateReaderTurnSnapshot(root);
    body.style.transform = 'none';
    body.style.height = '';
    body.style.columnWidth = '';
    body.style.writingMode = '';
    if (mode === 'scroll') {
      stage.style.padding = '';
      root.dataset.spread = 'single';
      paras = [...body.querySelectorAll('[data-off]')];
      columns = [];
      const distance = Math.max(0, stage.scrollHeight - stage.clientHeight);
      pages = Math.max(1, Math.ceil(distance / Math.max(1, stage.clientHeight)) + 1);
      return;
    }
    stage.scrollTop = 0;
    viewport.style.overflow = '';
    viewport.scrollLeft = 0;
    /* 页边距在 JS 里算：既跟随用户的"边距"设置，又在宽屏上把正文限制在 ~940px，
       避免一行 60 个汉字。padding 用 stage 的 padding-box 宽度算（它不随 padding 变化），
       算完再读 viewport 的内容盒宽高，保证栏宽正好等于可见宽度。 */
    const stageW = stage.clientWidth;
    if (vertical) {
      /* 竖排首版走横向滚动：vertical-rl 的多栏在"页↔栏"映射上不稳，
         滚动容器天然保持右→左的阅读顺序，翻页键滚一屏就是下一页 */
      stage.style.padding = '26px 30px';
      const W = viewport.clientWidth;
      const H = viewport.clientHeight;
      viewport.style.overflowX = 'auto';
      viewport.style.overflowY = 'hidden';
      body.style.height = H + 'px';
      body.style.writingMode = 'vertical-rl';
      body.style.columnWidth = 'auto';
      body.style.columnGap = '0';
      paras = [...body.querySelectorAll('[data-off]')];
      columns = [];
      stride = W;
      pages = Math.max(1, Math.round(body.scrollWidth / Math.max(1, W)));
      delete root.dataset.spread;
      return;
    }
    /* 铺满：左右只留用户设的页边距，不再把正文压到 940px */
    const padX = Math.max(18, (stageW * prefs.pad) / 100);
    const padY = 26;
    stage.style.padding = `${Math.round(padY)}px ${Math.round(padX)}px`;
    const W = viewport.clientWidth;
    const H = viewport.clientHeight;
    /* 单页：一栏占满；双页：两栏并排，中间留装订线 */
    /* auto：窗口够宽就双页（每栏约 40 字），窄窗自动回到单页 */
    const perPage = prefs.spread === 'auto' ? (W >= 1000 ? 2 : 1) : prefs.spread === 'double' ? 2 : 1;
    const columnW = (W - GAP * (perPage - 1)) / perPage;
    root.dataset.spread = perPage === 2 ? 'double' : 'single';
    body.style.height = H + 'px';
    body.style.writingMode = 'horizontal-tb';
    body.style.columnWidth = columnW + 'px';
    body.style.columnGap = GAP + 'px';
    const content = body.scrollWidth;
    stride = W + GAP;
    const columnCount = Math.round((content + GAP) / (columnW + GAP));
    pages = Math.max(1, Math.ceil(columnCount / perPage));
    measureParagraphs();
    if (prefs.turn !== 'slide' && !reducedMotion()) {
      snapshotIdle = requestIdleCallback(() => {
        if (alive) captureReaderPage(root, viewport, body);
      });
    }
  }

  /* 一次性把每段落在第几栏量出来，翻页时只读缓存，不再触发排版 */
  function measureParagraphs() {
    paras = [...body.querySelectorAll('[data-off]')];
    const origin = body.getBoundingClientRect().left;
    columns = paras.map(el => {
      const rect = el.getBoundingClientRect();
      const pos = rect.left - origin;
      return Math.max(0, Math.floor(pos / stride + 1e-3));
    });
  }

  function goTo(next, { silent = false } = {}) {
    if (!pages) return;
    const previousPage = page;
    page = Math.max(0, Math.min(pages - 1, next | 0));
    if (previousPage === page && !silent) return;
    if (!silent) {
      cancelAnimationFrame(hoverRaf);
      closeLookup();
      setHoveredWord(null);
    }
    if (prefs.dir === 's') {
      // 滚动模式：页码按滚动比例折算
      const max = Math.max(1, stage.scrollHeight - stage.clientHeight);
      stage.scrollTop = (page / Math.max(1, pages - 1)) * max;
    } else if (prefs.dir === 'v') {
      /* 竖排：横向滚动容器，RTL 下 scrollLeft 为负值往左走 */
      viewport.scrollLeft = -page * stride;
    } else {
      const animate = !silent && previousPage !== page && !reducedMotion();
      const old = body.style.transform;
      const snapshot = animate && prefs.turn !== 'slide' ? captureReaderPage(root, viewport, body) : null;
      if (silent || (!animate && previousPage !== page)) stopReaderTurn(root);
      body.style.transform = `translateX(${-page * stride}px)`;
      if (animate) turnReaderPage(root, body, prefs.turn, page > previousPage, old, snapshot);
    }
    if (!silent) queueProgress();
    scheduleTranslation();
  }

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stepPage(forward) {
    if (!chapter || turningChapter) return;
    const boundary = forward ? page >= pages - 1 : page <= 0;
    if (!boundary) { goTo(page + (forward ? 1 : -1)); return; }
    const index = chapter.idx + (forward ? 1 : -1);
    if (index < 0 || index >= detail.book.chapterCount) return;
    turningChapter = true;
    closeLookup();
    setHoveredWord(null);
    loadChapter(index, 0, undefined, { turn: true, forward }).finally(() => { turningChapter = false; });
  }


  /* 竖排是横向滚动：页码和字符位置按滚动比例折算；横排按栏号精确映射 */
  function offsetOfPage() {
    if (root.dataset.mode === 'scroll') {
      const top = stage.getBoundingClientRect().top;
      return Number((paras.find(el => el.getBoundingClientRect().bottom > top) || paras.at(-1))?.dataset.off) || 0;
    }
    if (prefs.dir === 'v') {
      /* 竖排滚动：取视口右缘那一段的首字符，方向无关，且比"按比例折算"准 */
      const right = viewport.getBoundingClientRect().right;
      let best = null;
      let bestDistance = Infinity;
      for (const el of paras) {
        const distance = Math.abs(el.getBoundingClientRect().right - right);
        if (distance < bestDistance) { bestDistance = distance; best = el; }
      }
      return best ? Number(best.dataset.off) || 0 : 0;
    }
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] >= page) return Number(paras[i].dataset.off) || 0;
    }
    return Number(paras.at(-1)?.dataset.off) || 0;
  }

  /* 竖排按"把这一段对齐到右缘"来恢复，不依赖页码换算 */
  function scrollToOffset(offset) {
    let index = 0;
    for (let i = 0; i < paras.length; i++) {
      if ((Number(paras[i].dataset.off) || 0) <= offset) index = i;
      else break;
    }
    const el = paras[index];
    if (!el) return;
    if (prefs.dir === 's') {
      stage.scrollTop += el.getBoundingClientRect().top - stage.getBoundingClientRect().top - 24;
      page = Math.round((stage.scrollTop / Math.max(1, stage.scrollHeight - stage.clientHeight)) * (pages - 1));
      scheduleTranslation();
      return;
    }
    const right = viewport.getBoundingClientRect().right;
    viewport.scrollLeft += right - el.getBoundingClientRect().right;
    page = Math.max(0, Math.min(pages - 1, Math.round(Math.abs(viewport.scrollLeft) / Math.max(1, stride))));
    scheduleTranslation();
  }

  function pageOfOffset(offset) {
    if (prefs.dir === 'v') {
      const last = Number(paras.at(-1)?.dataset.off) || 0;
      return last > 0 ? Math.round((offset / last) * (pages - 1)) : 0;
    }
    let index = 0;
    for (let i = 0; i < paras.length; i++) {
      if ((Number(paras[i].dataset.off) || 0) <= offset) index = i;
      else break;
    }
    return columns[index] || 0;
  }

  /* ---------------- 章节 ---------------- */

  /* 段落文字 + 注音 span → HTML；span 是码点下标，用 [...text] 切 */
  function paragraphHtml(text, spans, words) {
    const characters = [...text];
    const annotations = Array.isArray(spans) ? spans : [];
    if (!words?.length) {
      segmenter ??= new Intl.Segmenter(/^(ja|zh|en)/i.exec(bookLang)?.[0] || locale, { granularity: 'word' });
      let point = 0;
      words = [];
      for (const { segment, isWordLike } of segmenter.segment(text)) {
        const end = point + [...segment].length;
        if (isWordLike) words.push([point, end]);
        point = end;
      }
    }
    let annotation = 0;
    function textHtml(start, end) {
      const parts = [];
      let point = start;
      while (annotation < annotations.length && annotations[annotation][0] < end) {
        const [a, b, reading] = annotations[annotation++];
        if (a < point || b > end || a >= b || !reading) continue;
        parts.push(esc(characters.slice(point, a).join('')),
          `<ruby>${esc(characters.slice(a, b).join(''))}<rt>${esc(reading)}</rt></ruby>`);
        point = b;
      }
      parts.push(esc(characters.slice(point, end).join('')));
      return parts.join('');
    }

    let html = '', cursor = 0, units = 0;
    for (const [start, end] of words) {
      if (start < cursor || end <= start || end > characters.length) continue;
      const before = characters.slice(cursor, start).join('');
      const word = characters.slice(start, end).join('');
      const baseStart = units + before.length;
      const baseEnd = baseStart + word.length;
      html += textHtml(cursor, start);
      html += `<span class="nr-word" data-word-from="${start}" data-word-to="${end}" data-base-start="${baseStart}" data-base-end="${baseEnd}">${textHtml(start, end)}</span>`;
      units = baseEnd;
      cursor = end;
    }
    return html + textHtml(cursor, characters.length);
  }

  async function prepareFigures(data) {
    const images = new Map();
    const files = new Set((data.images || []).map(item => item.file));
    await Promise.all([...files].map(async file => {
      try {
        const result = await api('novel_image', { id, name: file });
        if (!result?.data) return;
        const image = new Image();
        image.alt = '';
        image.draggable = false;
        image.src = `data:${result.mime || 'image/jpeg'};base64,${result.data}`;
        await image.decode();
        images.set(file, image);
      } catch { /* A missing illustration does not block the chapter. */ }
    }));
    return images;
  }

  function renderChapter(images, toEnd) {
    const parts = chapter.paragraphs.map((text, index) => ({ text, index })).filter(part => part.text.trim());
    let offset = 0;
    const spans = shouldRuby() && ruby?.available ? ruby.paragraphs : null;
    /* 插图按 after 位置挂在对应段落后 */
    const figures = new Map();
    for (const img of chapter.images || []) {
      if (!images.has(img.file)) continue;
      const key = Number(img.after) || 0;
      if (!figures.has(key)) figures.set(key, []);
      figures.get(key).push(img);
    }
    const figHtml = list => list.map(img => `<figure class="nr-fig" data-nr-img="${esc(img.file)}"></figure>`).join('');
    const top = figHtml(figures.get(0) || []);
    const pieces = [];
    parts.forEach((part, i) => {
      const html = `<p data-off="${offset}" data-i="${part.index}">${paragraphHtml(part.text, spans?.[part.index], ruby?.words?.[part.index])}</p>`;
      offset += part.text.length;
      pieces.push(html);
      const after = figures.get(part.index + 1);
      if (after) pieces.push(figHtml(after));
    });
    body.innerHTML = top + pieces.join('');
    body.scrollTop = 0;
    for (const figure of body.querySelectorAll('[data-nr-img]')) figure.append(images.get(figure.dataset.nrImg).cloneNode());
    layout();
    const anchor = chapter.restoreOffset || 0;
    if (toEnd) {
      goTo(pages - 1, { silent: true });
    } else if (prefs.dir !== 'h') {
      if (anchor) scrollToOffset(anchor);
      else goTo(0, { silent: true });
    } else {
      /* 同一本书回到上次页码最直观；字号变过导致页码越界时再按字符位置找 */
      const saved = Number.isInteger(chapter.restorePage) ? chapter.restorePage : -1;
      const start = saved >= 0 && saved < pages ? saved : anchor ? pageOfOffset(anchor) : 0;
      goTo(start, { silent: true });
    }
    chapter.restorePage = undefined;
    queueProgress();
  }

  const shouldRuby = () => prefs.ruby === 'on' || (prefs.ruby === 'auto' && /^ja/i.test(bookLang || ''));

  async function loadRuby(index) {
    if (!shouldRuby() && !/^ja/i.test(bookLang)) return null;
    try {
      const data = await api('novel_annotate', { id, index });
      return data?.available ? data : null;
    } catch {
      return null;
    }
  }

  function prepareChapter(index) {
    const cached = chapterCache.get(index);
    if (cached) return cached;
    const pending = api('novel_chapter', { id, index }).then(async data => {
      const [annotations, images] = await Promise.all([loadRuby(index), prepareFigures(data)]);
      return { data, annotations, images };
    }).catch(error => {
      if (chapterCache.get(index) === pending) chapterCache.delete(index);
      throw error;
    });
    chapterCache.set(index, pending);
    return pending;
  }

  function prefetchAdjacent(index, forward) {
    clearTimeout(prefetchTimer);
    for (const cached of chapterCache.keys()) {
      if (Math.abs(cached - index) > 1) chapterCache.delete(cached);
    }
    prefetchTimer = setTimeout(async () => {
      const directions = forward ? [1, -1] : [-1, 1];
      for (const direction of directions) {
        if (!alive || chapter?.idx !== index) break;
        const next = index + direction;
        if (next >= 0 && next < detail.book.chapterCount) await prepareChapter(next).catch(() => {});
      }
    }, 120);
  }

  async function loadChapter(index, offset = 0, savedPage, { turn = false, forward = true } = {}) {
    const request = ++chapterRequest;
    try {
      const { data, annotations, images } = await prepareChapter(index);
      if (!alive || request !== chapterRequest) return false;
      const snapshot = turn && prefs.dir !== 's' && !reducedMotion() ? captureReaderPage(root, viewport, body) : null;
      closeLookup();
      chapter = { ...data, restoreOffset: offset || null, restorePage: Number.isInteger(savedPage) ? savedPage : undefined };
      ruby = annotations;
      renderChapter(images, turn && !forward);
      if (snapshot) turnReaderPage(root, body, prefs.turn, forward, '', snapshot);
      prefetchAdjacent(index, forward);
      return true;
    } catch (error) {
      if (alive && request === chapterRequest) toast(String(error?.message || error));
      return false;
    }
  }

  async function boot() {
    try {
      detail = await api('novel_detail', { id });
      bookmarks = await api('novel_bookmarks', { id });
    } catch (error) {
      toast(String(error?.message || error));
      return;
    }
    if (!alive) return;
    bookLang = detail.book.languages || '';
    booted = true;
    await loadChapter(chapterIdx, charOffset, startPage);
    if (alive) startClock();
  }

  /* ---------------- 进度 / 阅读事件 ---------------- */

  function queueProgress() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!alive || !booted || !chapter) return;
      const total = Math.max(1, detail?.book?.chapterCount || 1);
      const percent = Math.min(1, (chapter.idx + (pages > 1 ? page / pages : 0)) / total);
      api('novel_progress_save', { id, chapterIdx: chapter.idx, charOffset: offsetOfPage(), page, percent }).catch(() => {});
      flushEvent();
    }, 900);
  }

  function flushEvent() {
    if (!pendingSeconds && !pendingChars) return;
    const payload = { id, seconds: pendingSeconds, characters: pendingChars };
    pendingSeconds = 0;
    pendingChars = 0;
    api('novel_event', payload).catch(() => {});
  }

  function startClock() {
    flushTimer = setInterval(flushEvent, 30000);
    tickTimer = setInterval(() => {
      const now = Date.now();
      const delta = Math.min(5, Math.round((now - lastTick) / 1000));
      lastTick = now;
      if (!document.hasFocus() || document.hidden) return;
      pendingSeconds += Math.max(0, delta);
      /* 每一页的字数只算一次：栏号区间内的段落累加 */
      if (prefs.dir !== 's' && columns.length && page !== lastCountedPage) {
        lastCountedPage = page;
        for (let i = 0; i < columns.length; i++) {
          if (columns[i] === page) pendingChars += (paras[i].textContent || '').length;
        }
      }
    }, 1000);
  }

  function scheduleTranslation() {
    clearTimeout(translateTimer);
    if (!prefs.bilingual || !chapter || !alive) return;
    translateTimer = setTimeout(translateVisible, prefs.turn === 'slide' ? 335 : 110);
  }

  async function translateVisible() {
    const source = chapter;
    const bounds = viewport.getBoundingClientRect();
    const frame = stage.getBoundingClientRect();
    const current = paras.filter(para => [...para.getClientRects()].some(rect => rect.right > bounds.left + 3 &&
      rect.left < bounds.right - 3 && rect.bottom > frame.top + 3 && rect.top < frame.bottom - 3));
    const target = /^zh/i.test(bookLang) ? 'en' : locale === 'en' && !/^en/i.test(bookLang) ? 'en' : 'zh';
    const entries = current.map(para => {
      const index = Number(para.dataset.i);
      const key = source.idx + ':' + index + ':' + target;
      const text = source.paragraphs[index];
      return { key, text };
    });
    const requestKey = entries.map(entry => entry.key).join(',');
    translationEl.dataset.translationKey = requestKey;
    const active = () => alive && prefs.bilingual && chapter === source && translationEl.dataset.translationKey === requestKey;
    const render = () => {
      if (!active()) return;
      translationEl.innerHTML = entries.map(({ key }) => {
        const value = translations.get(key);
        return `<p>${esc(value === undefined ? w.translating : value || w.translationEmpty)}</p>`;
      }).join('');
    };
    render();
    const missing = entries.filter(entry => !translations.has(entry.key));
    for (let index = 0; index < missing.length && active(); index += 18) {
      const batch = missing.slice(index, index + 18);
      try {
        const result = await api('daily_translate', { texts: batch.map(entry => entry.text), target });
        const texts = Array.isArray(result) ? result : result?.texts;
        batch.forEach((entry, i) => translations.set(entry.key, String(texts?.[i] || '')));
        render();
      } catch {
        if (active()) translationEl.textContent = w.translationFailed;
        return;
      }
    }
  }

  async function jumpToPassage(row, study = false) {
    closePanel();
    if ((!chapter || chapter.idx !== row.chapterIdx) && !await loadChapter(row.chapterIdx, 0)) return;
    if (!alive) return;
    let paragraph = Number(row.paragraph) || 0;
    let text = chapter.paragraphs[paragraph] || '';
    let start = row.start || 0;
    if (study) {
      let match = text.indexOf(row.text || '');
      if (match < 0 && row.text) {
        const index = chapter.paragraphs.findIndex(part => part.includes(row.text));
        if (index >= 0) { paragraph = index; text = chapter.paragraphs[index]; match = text.indexOf(row.text); }
      }
      start = match >= 0 ? match : [...text].slice(0, start).join('').length;
    }
    const el = body.querySelector(`p[data-i="${paragraph}"]`);
    if (!el) return;
    const offset = Number(el.dataset.off) || 0;
    const end = study ? Math.min(text.length, start + String(row.text || '').length) : row.end;
    const pieces = [{ para: el, start, end: end || start + 1 }];
    const range = baseRanges(el, start, end || start + 1)[0];
    const box = range?.getClientRects()[0];
    if (prefs.dir === 's' && box) {
      stage.scrollTop += box.top - stage.getBoundingClientRect().top - 38;
    } else if (prefs.dir !== 'h') {
      scrollToOffset(offset);
    } else {
      const target = box && stride > 0 ? Math.floor((box.left - viewport.getBoundingClientRect().left) / stride + page + .001) : pageOfOffset(offset);
      goTo(target, { silent: true });
    }
    queueProgress();
    if (study && row.text) {
      const rect = range?.getClientRects()[0] || el.getBoundingClientRect();
      openSentencePanel(row.text, pieces, rect.left + rect.width / 2, rect.bottom, row.translation);
    } else highlight(el, start, end || start + 1);
  }

  function bindBookSearch() {
    const form = panelEl.querySelector('.nr-book-search');
    const input = form.elements.query;
    const feedback = panelEl.querySelector('[data-book-feedback]');
    const results = panelEl.querySelector('[data-book-results]');
    let request = 0;
    async function search() {
      clearTimeout(queryTimer);
      const query = input.value.trim();
      const version = ++request;
      results.replaceChildren();
      feedback.textContent = query ? w.loading : '';
      if (!query) return;
      const active = () => alive && form.isConnected && version === request && query === input.value.trim();
      try {
        const { rows, more } = await api('novel_find', { id, query });
        if (!active()) return;
        feedback.textContent = rows.length ? labels.results(rows.length) + (more ? '+' : '') : labels.noMatches;
        results.innerHTML = rows.map((row, index) =>
          `<button type="button" class="nr-search-hit" data-search-hit="${index}"><small>${esc(row.chapterTitle)}</small><span>${esc(row.before)}<mark>${esc(row.match)}</mark>${esc(row.after)}</span></button>`).join('');
        results.onclick = event => {
          const button = event.target.closest('[data-search-hit]');
          if (button) jumpToPassage(rows[Number(button.dataset.searchHit)]);
        };
      } catch (error) {
        if (active()) feedback.textContent = String(error?.message || error);
      }
    }
    form.onsubmit = event => { event.preventDefault(); search(); };
    input.oninput = () => {
      ++request;
      clearTimeout(queryTimer);
      queryTimer = setTimeout(search, 260);
    };
    input.focus();
  }

  /* ---------------- 目录 / 书签 / 排版面板 ---------------- */

  function drawer(kind) {
    if (panel === kind) { closePanel(); return; }
    closeMenu();
    closeLookup();
    clearTimeout(queryTimer);
    const version = ++panelVersion;
    panel = kind;
    panelEl.hidden = false;
    root.dataset.panel = kind;
    if (kind === 'search') {
      panelEl.innerHTML = `<div class="nr-panel-head"><b>${esc(labels.search)}</b></div>
        <form class="nr-book-search"><input name="query" type="search" maxlength="160" placeholder="${esc(labels.search)}" aria-label="${esc(labels.search)}"><button type="submit" aria-label="${esc(labels.search)}">${readerIcon('search')}</button></form>
        <p class="nr-search-status" data-book-feedback role="status"></p><div class="nr-panel-list" data-book-results></div>`;
      bindBookSearch();
    } else if (kind === 'toc') {
      const chapters = detail?.chapters || [];
      panelEl.innerHTML = `<div class="nr-panel-head"><b>${esc(w.toc)}</b><span>${esc(w.chapters(chapters.length))}</span></div>
        <div class="nr-panel-list">${chapters.map(row => `<button type="button" class="nr-row ${row.idx === chapter?.idx ? 'on' : ''}" data-nr-go="${row.idx}">
          <span class="nr-row-idx">${row.idx + 1}</span><span class="nr-row-title">${esc(row.title)}</span></button>`).join('')}</div>`;
      panelEl.querySelectorAll('[data-nr-go]').forEach(row => row.addEventListener('click', () => {
        closePanel();
        loadChapter(Number(row.dataset.nrGo), 0);
      }));
    } else if (kind === 'marks') {
      panelEl.innerHTML = `<div class="nr-panel-head"><b>${esc(w.marks)}</b><button type="button" class="nr-ghost" data-nr-addmark>${esc(w.addMark)}</button></div>
        <div class="nr-panel-list">${bookmarks.length ? bookmarks.map(mark => `<div class="nr-row nr-mark">
          <button type="button" class="nr-mark-jump" data-nr-jump="${mark.id}">
            <span class="nr-row-title">${esc(mark.chapterTitle || '—')}</span>
            <span class="nr-row-meta">${esc(w.chapters(mark.chapterIdx + 1))}</span>
          </button>
          <button type="button" class="nr-mark-del" data-nr-del="${mark.id}" aria-label="${esc(w.removeMark)}">×</button>
        </div>`).join('') : `<p class="nr-panel-empty">${esc(w.noMarks)}</p>`}</div>`;
      panelEl.querySelector('[data-nr-addmark]').onclick = addMark;
      panelEl.querySelectorAll('[data-nr-jump]').forEach(row => row.addEventListener('click', () => {
        const mark = bookmarks.find(item => String(item.id) === row.dataset.nrJump);
        if (!mark) return;
        closePanel();
        loadChapter(mark.chapterIdx, mark.charOffset);
      }));
      panelEl.querySelectorAll('[data-nr-del]').forEach(row => row.addEventListener('click', async event => {
        event.stopPropagation();
        try {
          await api('novel_bookmark_remove', { id, bookmarkId: Number(row.dataset.nrDel) });
          bookmarks = await api('novel_bookmarks', { id });
          if (alive && panel === 'marks' && version === panelVersion) { closePanel(); drawer('marks'); }
        } catch (error) {
          toast(String(error?.message || error));
        }
      }));
    } else if (kind === 'notes') {
      panelEl.innerHTML = `<div class="nr-panel-head"><b>${esc(labels.notes)}</b><span>…</span></div><div class="nr-panel-list" data-nr-notelist></div>`;
      api('novel_excerpts', { id }).then(rows => {
        if (!alive || panel !== 'notes' || version !== panelVersion) return;
        const list = panelEl.querySelector('[data-nr-notelist]');
        const when = seconds => {
          const date = new Date((seconds || 0) * 1000);
          const pad = n => String(n).padStart(2, '0');
          return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        };
        if (list) {
          list.innerHTML = rows.length
            ? rows.map(row => `<div class="nr-row nr-note" data-nr-goto="${row.id}">
                <div class="nr-note-body">
                  <button type="button" class="nr-note-text" data-nr-excerpt>${esc(String(row.text || '').slice(0, 240))}</button>
                  ${row.translation ? `<p class="nr-note-tr">${esc(String(row.translation).slice(0, 200))}</p>` : `<p class="nr-note-tr muted" data-nr-trrow>${esc(w.translationEmpty)} <button type="button" class="nr-note-tr-btn" data-nr-fill="${row.id}">${esc(w.fillTranslation)}</button></p>`}
                  <span class="nr-row-meta">${esc(row.chapterTitle || '')} · ${esc(when(row.createdAt))}</span>
                </div>
                <button type="button" class="nr-note-card" data-nr-card="${row.id}">${esc(w.makeCard)}</button>
                <button type="button" class="nr-mark-del" data-nr-delnote="${row.id}" aria-label="${esc(w.close)}">×</button>
              </div>`).join('')
            : `<p class="nr-panel-empty">${esc(w.noNotes)}</p>`;
        }
        panelEl.querySelector('.nr-panel-head span').textContent = String(rows.length);
        list?.querySelectorAll('[data-nr-goto]').forEach(node => node.addEventListener('click', event => {
          if (event.target.closest('button:not([data-nr-excerpt])')) return;
          const row = rows.find(item => String(item.id) === node.dataset.nrGoto);
          if (row) jumpToPassage(row, true);
        }));
        list?.querySelectorAll('[data-nr-fill]').forEach(button => button.addEventListener('click', async event => {
          event.stopPropagation();
          const row = rows.find(item => String(item.id) === event.currentTarget.dataset.nrFill);
          if (!row) return;
          const target = event.currentTarget;
          target.disabled = true;
          target.textContent = w.translating;
          try {
            const result = await api('daily_translate', { texts: [row.text], target: locale === 'en' ? 'en' : 'zh' });
            const list2 = Array.isArray(result) ? result : result?.texts;
            const translation = String(list2?.[0] || '').trim();
            if (!translation) throw Error('TRANSLATION_EMPTY');
            await api('novel_excerpt_translate', { id, excerptId: row.id, translation });
            row.translation = translation;
            const holder = target.closest('[data-nr-trrow]');
            if (holder) holder.className = 'nr-note-tr', holder.textContent = translation.slice(0, 200);
          } catch (error) {
            target.disabled = false;
            target.textContent = w.fillTranslation;
            toast(String(error?.message || error));
          }
        }));
        list?.querySelectorAll('[data-nr-card]').forEach(button => button.addEventListener('click', async event => {
          event.stopPropagation();
          const row = rows.find(item => String(item.id) === event.currentTarget.dataset.nrCard);
          if (!row) return;
          event.currentTarget.disabled = true;
          try {
            await api('dictionary_anki', { word: row.word || String(row.text || '').slice(0, 20), sentence: row.text, translation: row.translation || '' });
            toast(w.cardDone);
            event.currentTarget.textContent = w.cardDone;
          } catch (error) {
            event.currentTarget.disabled = false;
            toast(`${w.cardFailed} · ${String(error?.message || error)}`);
          }
        }));
        list?.querySelectorAll('[data-nr-delnote]').forEach(button => button.addEventListener('click', async event => {
          event.stopPropagation();
          try {
            await api('novel_excerpt_remove', { id, excerptId: Number(event.currentTarget.dataset.nrDelnote) });
            closePanel(); drawer('notes');
          } catch (error) {
            toast(String(error?.message || error));
          }
        }));
      }).catch(error => toast(String(error?.message || error)));
    } else if (kind === 'custom') {
      panelEl.innerHTML = `<div class="nr-panel-head"><b>${esc(labels.configure)}</b></div><button class="nr-custom nr-custom-back" type="button">${esc(labels.themes)}</button>`;
      panelEl.querySelector('.nr-custom-back').onclick = () => drawer('type');
    } else {
      panelEl.innerHTML = readerSettings(prefs, PAPERS, labels, w, esc);
      bindTypeset();
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'nr-panel-close';
    close.setAttribute('aria-label', w.close);
    close.innerHTML = readerIcon('close');
    close.onclick = closePanel;
    panelEl.querySelector('.nr-panel-head').append(close);
  }

  /* ---------------- 点读 ---------------- */

  function closeLookup() {
    ++lookupRequest;
    lookupCard?.remove();
    lookupCard = null;
    clearHit();
  }

  function setHoveredWord(word) {
    if (word === hoveredWord) return;
    hoveredWord?.classList.remove('nr-word-hover');
    hoveredWord = word;
    hoveredWord?.classList.add('nr-word-hover');
  }

  const rawParagraph = para => chapter?.paragraphs[Number(para.dataset.i)] || '';

  function clearHit() {
    selection = null;
    selectionLayer.replaceChildren();
    CSS.highlights?.delete('nr-hit');
  }

  function refreshSelection() {
    if (!selection) return;
    const paper = root.getBoundingClientRect();
    const visible = viewport.getBoundingClientRect();
    const panel = stage.getBoundingClientRect();
    const bounds = { left: Math.max(visible.left, panel.left), right: Math.min(visible.right, panel.right),
      top: Math.max(visible.top, panel.top), bottom: Math.min(visible.bottom, panel.bottom) };
    const boxes = selectionBoxes(selection.pieces, bounds, prefs.dir === 'v', prefs.size);
    selectionLayer.replaceChildren(...boxes.map(rect => {
      const box = document.createElement('span');
      box.style.cssText = `left:${rect.left - paper.left}px;top:${rect.top - paper.top}px;width:${rect.right - rect.left}px;height:${rect.bottom - rect.top}px`;
      return box;
    }));
  }

  function drawSelection(pieces, text) {
    selection = { pieces, text };
    refreshSelection();
  }

  function highlight(para, start, end) {
    clearHit();
    const ranges = baseRanges(para, start, end);
    if (ranges.length && window.Highlight && CSS.highlights) CSS.highlights.set('nr-hit', new Highlight(...ranges));
  }

  /* 点词时取所在的句子（按 。！？ 切），摘录进句子面板才有意义 */
  function sentenceAround(text, offset) {
    const chars = [...text];
    const at = Math.max(0, Math.min(chars.length - 1, offset));
    let start = at;
    let end = at;
    while (start > 0 && !/[。！？!?]/.test(chars[start - 1])) start--;
    while (end < chars.length && !/[。！？!?]/.test(chars[end])) end++;
    if (end < chars.length) end++;
    while (start < end && /[\s\u3000「」『』（）()]/.test(chars[start])) start++;
    const body = chars.slice(start, end).join('').trim();
    return { text: body, start, end };
  }

  /* 一次只播一条：连点或事件重入时先停掉上一条，避免"读两遍" */
  let speaking = false;
  let currentAudio = null;
  /* 合成结果按文本缓存：同一个词第二次点立刻出声，不用再等引擎 */
  const clipCache = new Map();

  function stopAudio() {
    try { currentAudio?.pause(); } catch { /* ignore */ }
    currentAudio = null;
  }

  async function clipFor(phrase) {
    const hit = clipCache.get(phrase);
    if (hit) return hit;
    const clip = await api('speech_preview', { text: phrase });
    const data = clip?.data || '';
    if (!data) throw Error('NO_AUDIO');
    const url = 'data:audio/wav;base64,' + data;
    if (clipCache.size >= 60) clipCache.clear();
    clipCache.set(phrase, url);
    return url;
  }

  async function speak(text, button) {
    const phrase = String(text || '').slice(0, 200);
    if (!phrase || speaking) return;
    speaking = true;
    stopAudio();
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = w.generating; }
    try {
      const audio = new Audio(await clipFor(phrase));
      currentAudio = audio;
      audio.addEventListener('ended', () => { if (currentAudio === audio) currentAudio = null; }, { once: true });
      await audio.play();
    } catch (error) {
      toast(`${w.speakFailed} · ${String(error?.message || error)}`);
    } finally {
      speaking = false;
      if (button) { button.disabled = false; if (label) button.textContent = label; }
    }
  }

  /* 统一的面板骨架：结构与日报的 .rd-pop 一致，样式直接吃 daily.css */
  /* 面板定位：贴边时自动收回窗口内；内容异步变高后要再调一次 */
  function placePanel(card, x, y) {
    if (!card?.isConnected) return;
    const rr = root.getBoundingClientRect();
    const w = card.offsetWidth || 332;
    const h = card.offsetHeight || 200;
    const margin = 12;
    const left = Math.min(Math.max(margin, x - rr.left - w / 2), Math.max(margin, rr.width - w - margin));
    const top = Math.min(Math.max(margin, y - rr.top + 18), Math.max(margin, rr.height - h - margin));
    card.style.left = Math.round(left) + 'px';
    card.style.top = Math.round(top) + 'px';
    card.style.maxHeight = Math.max(180, rr.height - margin * 2) + 'px';
  }

  function buildPanel({ title, sub, body, actions, x, y }) {
    closeLookup();
    const rootRect = root.getBoundingClientRect();
    const width = 332;
    const card = document.createElement('div');
    card.className = 'rd-pop nr-pop rd-pop-in';
    card.innerHTML = `<div class="rd-pop-head"><strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}<button type="button" class="nr-pop-x" data-nr-close aria-label="${esc(w.close)}">×</button></div>
      <div class="nr-pop-body" data-nr-body>${body}</div>
      <div class="rd-pop-actions">${actions.join('')}</div>`;
    root.append(card);
    placePanel(card, x, y);
    card.querySelector('[data-nr-close]').onclick = closeLookup;
    lookupCard = card;
    return card;
  }

  async function saveExcerpt({ paragraph, offset, word, text, translation, paraIndex }) {
    const sentence = text ? { text, start: offset, end: offset + [...text].length } : sentenceAround(chapter.paragraphs[paraIndex] || '', offset);
    if (!sentence.text) throw Error('NOVEL_EXCERPT_EMPTY');
    return api('novel_excerpt_add', {
      id, chapterIdx: chapter.idx,
      paragraph: paraIndex, start: sentence.start, end: sentence.end,
      text: sentence.text, translation: translation || '', word: word || ''
    });
  }

  /* 与「日报」同一套接口：dictionary(moji → local) 取词条，查不到再用 daily_translate 给一句释义 */
  const flatKey = value => String(value || '').replace(/[\s・ー\-]/g, '');
  const defsText = definition => (Array.isArray(definition) ? definition : String(definition || '').split(/\n/))
    .filter(Boolean).join('<br>');

  async function lookupEntries(query) {
    const q = flatKey(query);
    const fits = entry => {
      const spelling = flatKey(entry?.spelling);
      const reading = flatKey(String(entry?.pron || entry?.reading || '').split(/\s/)[0]);
      return !!spelling && (spelling === q || reading === q
        || ([...spelling].length >= 2 && (q.includes(spelling) || spelling.includes(q)))
        || ([...reading].length >= 2 && (q.includes(reading) || reading.includes(q))));
    };
    const ask = async source => {
      try {
        const list = await api('dictionary', { query, source, operationId: crypto.randomUUID() });
        return (Array.isArray(list) ? list : []).filter(fits);
      } catch { return []; }
    };
    let items = await ask('moji');
    if (!items.length) items = await ask('local');
    return items;
  }

  async function openWordPanel(hit, x, y) {
    if (!chapter) return;
    const { para, word: token } = hit;
    const index = chapter.idx;
    const paragraph = Number(para.dataset.i);
    const { wordFrom, wordTo, baseStart, baseEnd } = token.dataset;
    const offset = Number(wordFrom), end = Number(wordTo);
    const word = [...rawParagraph(para)].slice(offset, end).join('');
    const actions = [
      `<button type="button" class="dl-btn" data-nr-speak>${esc(w.speak)}</button>`,
      `<button type="button" class="dl-btn" data-nr-dict>${esc(w.openDictionary)}</button>`
    ];
    const card = buildPanel({ title: word, body: `<ul><li class="nr-card-wait">${esc(w.loading)}</li></ul>`,
      actions, x, y });
    highlight(para, Number(baseStart), Number(baseEnd));
    const request = lookupRequest;
    card.querySelector('[data-nr-speak]').onclick = event => speak(word, event.currentTarget);
    card.querySelector('[data-nr-dict]').onclick = () => { closeLookup(); lookup?.(word); };
    try {
      const data = await api('novel_lookup', { id, index, paragraph, offset, end }).catch(() => ({}));
      if (!alive || request !== lookupRequest || !card.isConnected) return;
      if (data.reading) {
        const reading = document.createElement('span');
        reading.textContent = data.reading;
        card.querySelector('.rd-pop-head strong').after(reading);
      }
      const remote = await lookupEntries(word);
      const items = remote.length ? remote : data.entries || [];
      if (!alive || !card.isConnected) return;
      let bodyHtml = '';
      if (items.length) {
        bodyHtml = `<ol class="nr-defs">${items.slice(0, 3).map(entry => `<li><b>${esc(entry.spelling || '')}</b>${entry.pron || entry.reading ? ` <small>${esc(String(entry.pron || entry.reading))}</small>` : ''}<p>${defsText(entry.definition)}</p></li>`).join('')}</ol>`;
      } else {
        let gloss = '';
        try {
          const result = await api('daily_translate', { texts: [word], target: locale === 'en' ? 'en' : 'zh' });
          const list = Array.isArray(result) ? result : result?.texts;
          gloss = String(list?.[0] || '').trim();
        } catch { /* 没译文就只显示词 */ }
        bodyHtml = gloss ? `<p class="nr-card-text">${esc(gloss)}</p>` : `<p class="nr-card-empty">${esc(w.lookupEmpty)}</p>`;
      }
      if (!alive || !card.isConnected) return;
      card.querySelector('[data-nr-body]').innerHTML = bodyHtml;
      placePanel(card, x, y); /* 词条变高后重新贴边 */
      if (items.length && data.saved === null) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'dl-btn';
        more.textContent = w.addWord;
        more.onclick = async () => {
          more.disabled = true;
          try {
            await api('novel_save_word', { id, index, paragraph, offset, end });
            const label = document.createElement('span');
            label.className = 'nr-card-saved';
            label.textContent = w.inWordBook;
            more.replaceWith(label);
            toast(w.wordSaved);
          } catch (error) {
            more.disabled = false;
            toast(String(error?.message || error));
          }
        };
        card.querySelector('.rd-pop-actions').append(more);
      }
    } catch (error) {
      toast(String(error?.message || error));
    }
  }

  async function openSentencePanel(text, pieces, x, y, savedTranslation = '') {
    if (!text || !chapter) return;
    const { para, start } = pieces[0];
    const paraIndex = Number(para.dataset.i);
    const offsetOfRange = [...rawParagraph(para).slice(0, start)].length;
    const card = buildPanel({
      title: w.sentence,
      sub: '',
      body: `<p class="nr-card-text">${esc(text)}</p><p class="nr-card-trans" data-nr-tr>${esc(savedTranslation || w.translating)}</p>`,
      actions: [`<button type="button" class="dl-btn" data-nr-speak>${esc(w.speak)}</button>`,
                `<button type="button" class="dl-btn" data-nr-note>${esc(w.addNote)}</button>`],
      x, y
    });
    drawSelection(pieces, text);
    /* 先绑定：发音/摘录不用等翻译 */
    let translation = savedTranslation;
    const tr = card.querySelector('[data-nr-tr]');
    card.querySelector('[data-nr-speak]').onclick = event => speak(text, event.currentTarget);
    card.querySelector('[data-nr-note]').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await saveExcerpt({ paragraph: paraIndex, offset: offsetOfRange, text, translation, paraIndex });
        button.textContent = w.noteSaved;
        toast(w.noteSaved);
      } catch (error) {
        button.disabled = false;
        toast(String(error?.message || error));
      }
    };
    if (savedTranslation) return;
    try {
      const result = await api('daily_translate', { texts: [text], target: locale === 'en' ? 'en' : 'zh' });
      const list = Array.isArray(result) ? result : result?.texts;
      translation = String(list?.[0] || '').trim();
      if (tr.isConnected) tr.textContent = translation || w.translationEmpty;
      placePanel(card, x, y);
    } catch {
      if (tr.isConnected) tr.textContent = w.translationFailed;
      placePanel(card, x, y);
    }
  }

  function closePanel() {
    clearTimeout(queryTimer);
    ++panelVersion;
    panel = '';
    panelEl.hidden = true;
    panelEl.innerHTML = '';
    delete root.dataset.panel;
  }

  function closeMenu() {
    menu.hidden = true;
    menuTrigger.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    closePanel();
    closeLookup();
    const total = Math.max(1, detail?.book.chapterCount || 1);
    const progress = chapter ? (chapter.idx + page / Math.max(1, pages)) / total : 0;
    menu.querySelector('[data-reader-progress]').textContent = w.toc + ' · ' + Math.round(progress * 100) + '%';
    menu.hidden = false;
    menuTrigger.setAttribute('aria-expanded', 'true');
  }

  async function setFullscreen(next) {
    if (fullscreen === next) return;
    fullscreen = next;
    host.classList.toggle('nr-fullscreen', next);
    const button = menu.querySelector('[data-reader-action="full"]');
    button.setAttribute('aria-pressed', String(next));
    button.title = next ? labels.unfull : labels.full;
    button.setAttribute('aria-label', button.title);
    button.innerHTML = readerIcon(next ? 'unfull' : 'full');
    if (!next) {
      if (nativeFullscreen) {
        nativeFullscreen = false;
        try { await windowAction('fullscreen_off'); } catch { /* The CSS reading layer already exited. */ }
      } else if (document.fullscreenElement === host) {
        await document.exitFullscreen().catch(() => {});
      }
      return;
    }
    if (windowAction) {
      try {
        await windowAction('fullscreen_on');
        if (fullscreen && alive) nativeFullscreen = true;
        else await windowAction('fullscreen_off');
        return;
      } catch { /* Use browser full-screen when the native action is unavailable. */ }
    }
    if (fullscreen && host.requestFullscreen) await host.requestFullscreen().catch(() => {});
  }

  const onFullscreenChange = () => {
    if (fullscreen && !nativeFullscreen && !document.fullscreenElement) setFullscreen(false);
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);

  function bindTypeset() {
    const slider = panelEl.querySelector('[data-reader-size]');
    const output = panelEl.querySelector('output');
    function setSize(value) {
      const anchor = offsetOfPage();
      prefs.size = Math.max(15, Math.min(30, value));
      slider.value = prefs.size;
      output.value = prefs.size + 'px';
      applyPrefs();
      relayout(anchor);
    }
    slider.oninput = () => setSize(slider.valueAsNumber);
    panelEl.querySelectorAll('[data-font-step]').forEach(button => {
      button.onclick = () => setSize(prefs.size + Number(button.dataset.fontStep));
    });
    const pops = [...panelEl.querySelectorAll('.nr-setting-pop')];
    for (const pop of pops) {
      pop.addEventListener('toggle', () => {
        if (pop.open) for (const other of pops) if (other !== pop) other.open = false;
      });
    }
    for (const button of panelEl.querySelectorAll('[data-setting]')) {
      button.onclick = () => {
        const { setting, value } = button.dataset;
        if (setting === 'custom') { drawer('custom'); return; }
        const changesMetrics = (setting === 'turn' && prefs.dir !== (value === 'scroll' ? 's' : 'h')) ||
          setting === 'spread' || (setting === 'paper' && (prefs.paper === 'bold') !== (value === 'bold'));
        const anchor = changesMetrics ? offsetOfPage() : 0;
        if (setting === 'paper' || setting === 'turn') stopReaderTurn(root);
        prefs[setting] = value;
        if (setting === 'turn') prefs.dir = value === 'scroll' ? 's' : 'h';
        for (const option of panelEl.querySelectorAll(`[data-setting="${setting}"]`)) {
          option.setAttribute('aria-pressed', String(option === button));
        }
        button.closest('details')?.removeAttribute('open');
        panelEl.querySelector('.nr-layout-choice').hidden = prefs.dir !== 'h';
        applyPrefs();
        if (changesMetrics) relayout(anchor);
      };
    }
  }

  /* 改字号 / 换方向后保持当前段落不丢 */
  function relayout(anchor = offsetOfPage()) {
    if (!chapter) return;
    layout();
    if (prefs.dir !== 'h') scrollToOffset(anchor);
    else goTo(pageOfOffset(anchor), { silent: true });
    refreshSelection();
    queueProgress();
  }

  async function addMark() {
    if (!chapter) return;
    try {
      await api('novel_bookmark_add', { id, chapterIdx: chapter.idx, charOffset: offsetOfPage() });
      bookmarks = await api('novel_bookmarks', { id });
      closePanel(); panel = ''; drawer('marks');
      toast(w.markAdded);
    } catch (error) {
      toast(String(error?.message || error));
    }
  }

  /* ---------------- 事件 ---------------- */

  readerUI.addEventListener('click', event => {
    const action = event.target.closest('[data-reader-action]')?.dataset.readerAction;
    if (!action) return;
    if (action === 'menu') {
      if (menu.hidden) openMenu();
      else closeMenu();
    } else if (action === 'full') {
      closeMenu();
      setFullscreen(!fullscreen);
    } else if (action === 'language') {
      const anchor = offsetOfPage();
      prefs.bilingual = !prefs.bilingual;
      translationEl.replaceChildren();
      applyPrefs();
      relayout(anchor);
      closeMenu();
    } else drawer(action);
  });

  /* 滚轮翻页：只在这里翻页，左右两侧不再有热区，边缘文字也能正常点 */
  let wheelGestureAt = -Infinity;
  let wheelGestureDelta = 0;
  let wheelGestureTurned = false;
  stage.addEventListener('wheel', event => {
    if (panel || !chapter || event.ctrlKey || event.defaultPrevented) return;
    if (prefs.dir === 's') {
      const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;
      if ((event.deltaY > 0 && atBottom) || (event.deltaY < 0 && stage.scrollTop <= 1)) {
        stepPage(event.deltaY > 0);
      }
      return;
    }
    event.preventDefault();
    if (prefs.dir === 'v' && ((event.deltaY > 0 && page < pages - 1) || (event.deltaY < 0 && page > 0))) {
      viewport.scrollLeft -= event.deltaY;
      return;
    }
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    // Discrete notches are independent, even in a burst. Smooth input includes inertial events.
    const now = performance.now();
    if (now - wheelGestureAt > 90 || Math.sign(wheelGestureDelta) !== Math.sign(delta)) {
      wheelGestureDelta = 0;
      wheelGestureTurned = false;
    }
    if (event.deltaMode !== 0 || (!wheelGestureDelta && Math.abs(delta) >= 38)) {
      stepPage(delta > 0);
      return;
    }
    wheelGestureAt = now;
    wheelGestureDelta += delta;
    if (!wheelGestureTurned && Math.abs(wheelGestureDelta) >= 36) {
      wheelGestureTurned = true;
      stepPage(wheelGestureDelta > 0);
    }
  }, { passive: false });

  let hoverRaf = 0;
  const textEvents = new AbortController();
  const selectionHit = (x, y) => baseTextHit(body, x, y);
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    event.preventDefault();
    if (!menu.hidden) { closeMenu(); return; }
    if (panel) { closePanel(); return; }
    const hit = selectionHit(event.clientX, event.clientY);
    closeLookup();
    if (hit) drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, first: hit, last: hit, moved: false };
  });
  stage.addEventListener('click', event => {
    if (event.pointerType !== 'touch' || !getSelection()?.isCollapsed) return;
    if (!menu.hidden) { closeMenu(); return; }
    if (panel) { closePanel(); return; }
    const hit = selectionHit(event.clientX, event.clientY);
    if (hit?.word) openWordPanel(hit, event.clientX, event.clientY);
    else closeLookup();
  });

  function moveSelection(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 4;
    if (!drag.moved) return;
    const hit = selectionHit(event.clientX, event.clientY);
    if (hit) drag.last = hit;
    const pieces = passageBetween(paras, drag.first, drag.last, rawParagraph);
    drawSelection(pieces, pieces.map(piece => rawParagraph(piece.para).slice(piece.start, piece.end)).join('\n'));
    setHoveredWord(null);
  }

  document.addEventListener('pointermove', moveSelection, { signal: textEvents.signal });
  document.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    moveSelection(event);
    const { first, moved } = drag;
    drag = null;
    if (moved) {
      if (!selection?.text.trim() || selection.text.length > 1000) { clearHit(); return; }
      const { pieces, text } = selection;
      openSentencePanel(text, pieces, event.clientX, event.clientY);
      return;
    }
    const end = selectionHit(event.clientX, event.clientY);
    if (end?.word && end.word === first.word) openWordPanel(end, event.clientX, event.clientY);
  }, { signal: textEvents.signal });
  document.addEventListener('pointercancel', event => {
    if (drag?.pointer !== event.pointerId) return;
    drag = null;
    clearHit();
  }, { signal: textEvents.signal });
  document.addEventListener('copy', event => {
    if (!selection?.text || !getSelection()?.isCollapsed || !event.clipboardData) return;
    event.clipboardData.setData('text/plain', selection.text);
    event.preventDefault();
  }, { signal: textEvents.signal });

  stage.addEventListener('pointermove', event => {
    if (drag || panel || !menu.hidden || event.pointerType === 'touch') return;
    cancelAnimationFrame(hoverRaf);
    hoverRaf = requestAnimationFrame(() => {
      if (alive) setHoveredWord(selectionHit(event.clientX, event.clientY)?.word || null);
    });
  });
  stage.addEventListener('pointerleave', () => { cancelAnimationFrame(hoverRaf); setHoveredWord(null); });
  stage.addEventListener('scroll', () => {
    setHoveredWord(null);
    refreshSelection();
  }, { passive: true });
  stage.addEventListener('scroll', () => {
    if (prefs.dir !== 's') return;
    const max = Math.max(1, stage.scrollHeight - stage.clientHeight);
    const next = Math.round((stage.scrollTop / max) * (pages - 1));
    if (next !== page) { page = next; queueProgress(); }
    scheduleTranslation();
  }, { passive: true });
  viewport.addEventListener('scroll', () => {
    if (prefs.dir !== 'v') return;
    page = Math.max(0, Math.min(pages - 1, Math.round(Math.abs(viewport.scrollLeft) / Math.max(1, stride))));
    queueProgress();
    scheduleTranslation();
    refreshSelection();
  }, { passive: true });

  function onKey(event) {
    if (!alive || event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (event.repeat) return;
      if (lookupCard) { closeLookup(); return; }
      if (panel) closePanel();
      else if (!menu.hidden) closeMenu();
      else if (fullscreen) setFullscreen(false);
      else exit();
      return;
    }
    if (event.target.closest?.('input,textarea,select,[contenteditable]')) return;
    if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && Object.hasOwn(DRAWER_KEYS, event.key)) {
      event.preventDefault();
      if (!event.repeat && booted) drawer(DRAWER_KEYS[event.key]);
      return;
    }
    if (panel || !menu.hidden || event.ctrlKey || event.altKey || event.metaKey) return;
    const nextKeys = ['ArrowRight', 'ArrowDown', 'PageDown', ' '];
    const prevKeys = ['ArrowLeft', 'ArrowUp', 'PageUp'];
    if (nextKeys.includes(event.key) || prevKeys.includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) stepPage(nextKeys.includes(event.key));
    }
    else if (event.key === 'Home') { event.preventDefault(); goTo(0); }
    else if (event.key === 'End') { event.preventDefault(); goTo(pages - 1); }
  }
  addEventListener('keydown', onKey);

  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (alive && chapter) relayout(); }, 220);
  };
  addEventListener('resize', onResize);

  function exit() {
    if (!alive) return;
    alive = false;
    clearTimeout(saveTimer);
    clearTimeout(queryTimer);
    clearTimeout(translateTimer);
    clearTimeout(resizeTimer);
    clearTimeout(prefetchTimer);
    cancelIdleCallback(snapshotIdle);
    chapterCache.clear();
    clearInterval(flushTimer);
    clearInterval(tickTimer);
    removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    themeObserver.disconnect();
    textEvents.abort();
    cancelAnimationFrame(hoverRaf);
    stopReaderTurn(root);
    clearHit();
    if (fullscreen) setFullscreen(false);
    flushEvent();
    if (chapter && detail) {
      const total = Math.max(1, detail.book.chapterCount || 1);
      api('novel_progress_save', {
        id, chapterIdx: chapter.idx, charOffset: offsetOfPage(), page,
        percent: Math.min(1, (chapter.idx + (pages > 1 ? page / pages : 0)) / total)
      }).catch(() => {});
    }
    onExit?.();
  }

  await boot();
  if (!alive) return;
  if (!booted) { exit(); return; }
  return { exit, reload: () => {
    chapterCache.clear();
    return loadChapter(chapter?.idx || 0, 0);
  } };
}
