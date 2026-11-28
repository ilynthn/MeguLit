// SPDX-License-Identifier: GPL-3.0-or-later
/* 文库页（route = novel）：书架 / 本地导入 / 发现。
   与主界面共用 invoke('service') 与主题令牌，不引框架、不建构建链。 */
import { novelMessages } from './novel-i18n.js';
import { bindNovelOnline, novelOnlineLabels } from './novel-online.js';
import { openReader } from './novel-reader.js';
import { openPdfReader } from './novel-pdf-reader.js';
import { discoverMessages, paintDiscovery, paintDiscoveryDetail } from './novel-discover.js';
import { mountWebNovel, webMessages } from './novel-web.js';
import { capsuleSpringFrames } from './capsule-spring.js';
import { applyShelfFlowSettings, bindShelfFlow, createCoverPreview, liftCoverForDetail } from './novel-shelf.js';

const SORT_KEY = 'megulit-novel-sort';
const VIEW_KEY = 'megulit-novel-view';
const BOOK_EXT = /\.(txt|md|epub|zip|pdf)$/i;
const fileKind = file => /\.pdf$/i.test(file) ? 'pdf' : /\.(epub|zip)$/i.test(file) ? 'epub' : 'txt';
const sortKeys = ['recent', 'added', 'title', 'author', 'progress'];
const viewKeys = ['cover', 'list', 'flow'];
const icons = {
  add: '<path d="M12 5v14M5 12h14"/>',
  sort: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  recent: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  added: '<rect x="5" y="6" width="14" height="14" rx="2"/><path d="M8 4v4m8-4v4M5 10h14m-7 3v4m-2-2h4"/>',
  title: '<path d="M5 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H5zm10 3a3 3 0 0 1 3-3h1v12h-1a3 3 0 0 0-3 3"/>',
  author: '<circle cx="12" cy="8" r="3"/><path d="M6 19v-2a6 4 0 0 1 12 0v2"/>',
  progress: '<path d="M5 19v-4m7 4V9m7 10V5"/>',
  match: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
  popular: '<path d="m12 4 2.5 5 5.5.8-4 4 .9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-4 5.5-.8z"/>',
  date: '<rect x="5" y="6" width="14" height="14" rx="2"/><path d="M8 4v4m8-4v4M5 10h14"/>',
  year: '<path d="M5 6h14M7 10h10m-8 4h6m-3 0v5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  cover: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 4v16"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.1M4 12h.1M4 18h.1"/>',
  flow: '<path d="M4 5h4v14H4zm6 0h4v14h-4zm6 1 3-1 4 13-3 1z"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  discover: '<path d="m18.5 5.5-4 13-3-6-6-3z"/><path d="m11.5 12.5 7-7"/>',
  bilingual: '<path d="M4 6h8M8 4v2c0 4-2 7-4 8m2-5c1 2 3 4 6 5"/><path d="m13 20 4-9 4 9m-6.5-3h5"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  clear: '<path d="m7 7 10 10M17 7 7 17"/>'
};
const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';

function readChoice(storageKey, options) {
  try {
    const key = localStorage.getItem(storageKey);
    if (options.includes(key)) return key;
  } catch { /* Storage can be unavailable. */ }
  return options[0];
}

const normalizeSearch = value => String(value ?? '').normalize('NFKC').toLowerCase();

/* 拖放：WebView2 的 File 带绝对路径（同 disc-install.js 的做法） */
const droppedPaths = event => [...(event.dataTransfer?.files || [])].map(file => file.path).filter(Boolean);

/* 样式表用模块 URL 兜底挂载：index.html 里的 <link> 若被资源层拦掉，这里仍然能加载（同 detail-story.js 的做法） */
let stylePromise = null;
function ensureNovelStyle() {
  /* 带时间戳：改了样式表立刻生效，避免 WebView 缓存旧版 */
  const href = new URL('./novel.css', import.meta.url).href + '?v=' + Date.now();
  const existing = document.querySelector('link[data-novel-style]');
  if (existing) return Promise.resolve();
  if (stylePromise) return stylePromise;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.novelStyle = '';
  stylePromise = new Promise(resolve => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
  });
  document.head.append(link);
  return stylePromise;
}

export async function mountNovel(main, ctx) {
  if (!main.isConnected) return;
  ensureNovelStyle();
  const { api, invoke, locale = 'zh', esc, toast, isCurrent = () => true, openSettings } = ctx;
  const w = novelMessages[locale] || novelMessages.zh;
  const sourceText = discoverMessages(locale);
  const onlineLabels = novelOnlineLabels(locale);
  const webText = webMessages(locale);
  let webView;

  /* 上一次进阅读器可能留下布局类，这里先清一次 */
  main.classList.remove('nv-reading');
  main.closest('.workspace')?.classList.remove('nv-reading-ws');
  document.documentElement.classList.remove('nv-reading-root');
  const page = document.createElement('div');
  page.className = 'novel-page';
  main.replaceChildren(page);

  let alive = true;
  let tab = 'shelf';
  let localBack = 'shelf';
  const discoverState = { page: 1, query: '', order: 'popular', request: 0 };
  let discoverTimer;
  let discoverView;
  let discoverResult;
  let discoveredBook;
  let sort = readChoice(SORT_KEY, sortKeys);
  let view = readChoice(VIEW_KEY, viewKeys);
  let shelfFlow;
  let stopDetailEntry;
  let flowBook;
  let query = '';
  let shelfRequest;
  const collator = new Intl.Collator(['zh', 'en', 'ja'].includes(locale) ? locale : 'zh', {numeric: true, sensitivity: 'base'});
  let bookId = '';
  let shelf = null;
  let scanning = false;
  let importing = false;
  let candidates = [];
  let pickTimer = null;
  /* 阅读器：reading 非空时整页交给 novel-reader.js，退出后回到这本书的详情 */
  let reading = null;
  let readerOpen = false;
  let readerHost;

  const aliveNow = () => alive && isCurrent();
  const preview = createCoverPreview(page, { api, esc, w, locale, isCurrent: aliveNow });
  const options = (kind, keys, labels, selected) => keys.map(key =>
    `<label><input type="radio" name="nv-${kind}" value="${key}" ${key === selected ? 'checked' : ''}><span class="nv-sort-check">${icon('check')}</span>${icon(key)}<span>${esc(labels[key])}</span></label>`).join('');

  page.innerHTML = `
    <div class="nv-toolbar" data-nv-toolbar>
      <div class="nv-actions">
        <button type="button" class="nv-tool" data-nv-add aria-label="${esc(w.addBooks)}" title="${esc(w.addBooks)}">${icon('add')}</button>
        <button type="button" class="nv-tool" data-nv-sort popovertarget="nv-sort-options" aria-label="${esc(w.sortBooks)}" title="${esc(w.sortBooks)}">${icon('sort')}</button>
        <button type="button" class="nv-tool" data-nv-view popovertarget="nv-view-options">${icon(view)}</button>
        <div class="nv-search-anchor">
          <button type="button" class="nv-tool" data-nv-search-toggle aria-controls="nv-search-field" aria-expanded="false" aria-label="${esc(w.searchBooks)}" title="${esc(w.searchBooks)}">${icon('search')}</button>
          <div class="nv-search" id="nv-search-field" hidden>
            <input type="text" data-nv-search aria-label="${esc(w.searchBooks)}" autocomplete="off">
            <button type="button" class="nv-tool nv-clear" data-nv-clear hidden aria-label="${esc(w.clearSearch)}" title="${esc(w.clearSearch)}">${icon('clear')}</button>
          </div>
        </div>
        <button type="button" class="nv-tool nv-discover" data-nv-discover aria-label="${esc(w.discover)}" title="${esc(w.discover)}">${icon('discover')}</button>
        <button type="button" class="nv-tool" data-nv-web aria-label="${esc(webText.title)}" title="${esc(webText.title)}">${icon('bilingual')}</button>
      </div>
      <fieldset id="nv-sort-options" class="nv-sort-options" popover aria-label="${esc(w.sortBooks)}">
        ${options('sort', sortKeys, w.sort, sort)}
      </fieldset>
      <fieldset id="nv-view-options" class="nv-sort-options" popover aria-label="${esc(w.viewMode)}">
        ${options('view', viewKeys, w.views, view)}
      </fieldset>
    </div>
    <section class="nv-body" data-nv-body></section>`;

  const bodyEl = page.querySelector('[data-nv-body]');
  const toolbar = page.querySelector('[data-nv-toolbar]');
  const search = page.querySelector('[data-nv-search]');
  const clear = page.querySelector('[data-nv-clear]');
  const sortButton = page.querySelector('[data-nv-sort]');
  const sortOptions = page.querySelector('#nv-sort-options');
  const viewButton = page.querySelector('[data-nv-view]');
  const viewOptions = page.querySelector('#nv-view-options');
  const searchToggle = page.querySelector('[data-nv-search-toggle]');
  const searchField = page.querySelector('#nv-search-field');
  const capsule = toolbar.querySelector('.nv-actions');
  const addButton = toolbar.querySelector('[data-nv-add]');
  const discoverButton = toolbar.querySelector('[data-nv-discover]');
  toolbar.dataset.view = view;
  document.body.append(toolbar);
  let toolbarMotion;

  function navigateShelf(next, targetId = '') {
    sortOptions.hidePopover();
    viewOptions.hidePopover();
    clearTimeout(discoverTimer);
    discoverView?.abort();
    discoveredBook = null;
    if (tab === 'discover' && next === 'shelf') shelf = null;
    if (next === 'local') localBack = tab;
    tab = next;
    bookId = targetId;
    search.value = tab === 'discover' ? discoverState.query : query;
    clear.hidden = !search.value;
    searchField.hidden = true;
    searchToggle.setAttribute('aria-expanded', 'false');
    const searchLabel = tab === 'discover' ? sourceText.search : w.searchBooks;
    search.setAttribute('aria-label', searchLabel);
    searchToggle.setAttribute('aria-label', searchLabel);
    searchToggle.title = searchLabel;
    toolbar.dataset.tab = tab;
    toolbar.dataset.view = tab === 'discover' ? 'discover' : view;
    discoverButton.setAttribute('aria-pressed', String(tab === 'discover'));
    updateSortOptions();
    paint();
    if (next === 'shelf' && !targetId) addButton.focus();
    else bodyEl.querySelector('[data-nv-back]')?.focus();
  }

  addButton.onclick = () => navigateShelf('local');
  discoverButton.onclick = () => navigateShelf(tab === 'discover' ? 'shelf' : 'discover');
  toolbar.querySelector('[data-nv-web]').onclick = () => navigateShelf('web');
  function filterShelf() {
    if (tab !== 'shelf') return;
    query = search.value;
    clear.hidden = !query;
    if (shelf) renderShelf();
  }
  function toggleSearch(open) {
    searchField.hidden = !open;
    searchToggle.setAttribute('aria-expanded', String(open));
    if (open) search.focus();
    else if (tab === 'discover') searchToggle.focus();
    else {
      search.value = '';
      filterShelf();
      searchToggle.focus();
    }
  }
  searchToggle.onclick = () => toggleSearch(searchField.hidden);
  function searchDiscovery() {
    const next = search.value.trim();
    clear.hidden = !next;
    if (next === discoverState.query) return;
    if (discoverState.order === 'popular' && !discoverState.query && next) discoverState.order = 'match';
    if (discoverState.order === 'match' && !next) discoverState.order = 'popular';
    discoverState.query = next;
    updateSortOptions();
    fetchDiscovery(1);
  }
  search.addEventListener('input', event => {
    if (tab === 'shelf') { filterShelf(); return; }
    if (event.isComposing) return;
    clear.hidden = !search.value;
    clearTimeout(discoverTimer);
    discoverTimer = setTimeout(searchDiscovery, 400);
  });
  clear.onclick = () => {
    search.value = '';
    clearTimeout(discoverTimer);
    if (tab === 'discover') searchDiscovery();
    else filterShelf();
    search.focus();
  };
  search.addEventListener('keydown', event => {
    if (tab === 'discover' && event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      clearTimeout(discoverTimer);
      searchDiscovery();
    }
    if (event.key === 'Escape' && !event.isComposing && !sortOptions.matches(':popover-open')) {
      event.preventDefault();
      event.stopPropagation();
      toggleSearch(false);
    }
  });

  function bindChoices(button, panel, onChange) {
    panel.addEventListener('beforetoggle', event => {
      if (event.newState !== 'open') return;
      preview.close();
      const bounds = button.getBoundingClientRect();
      requestAnimationFrame(() => {
        if (!panel.matches(':popover-open')) return;
        const left = Math.max(8, bounds.left - panel.offsetWidth - 12);
        const top = Math.max(8, Math.min(bounds.top, innerHeight - panel.offsetHeight - 8));
        Object.assign(panel.style, { left: `${left}px`, top: `${top}px` });
      });
    });
    panel.addEventListener('change', event => {
      const value = event.target.value;
      panel.hidePopover();
      onChange(value);
      button.focus();
    });
  }
  function updateViewButton() {
    viewButton.innerHTML = icon(view);
    viewButton.title = `${w.viewMode} · ${w.views[view]}`;
    viewButton.setAttribute('aria-label', viewButton.title);
  }
  const persistChoice = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  function updateSortOptions() {
    const onDiscovery = tab === 'discover';
    sortOptions.innerHTML = onDiscovery
      ? options('sort', Object.keys(sourceText.order), sourceText.order, discoverState.order)
      : options('sort', sortKeys, w.sort, sort);
  }
  updateViewButton();
  bindChoices(sortButton, sortOptions, value => {
    if (tab === 'discover') {
      discoverState.order = value;
      fetchDiscovery(1);
      return;
    }
    sort = value;
    persistChoice(SORT_KEY, value);
    if (shelf) renderShelf(true);
  });
  bindChoices(viewButton, viewOptions, value => {
    if (view === value) return;
    persistChoice(VIEW_KEY, value);
    const before = capsule.getBoundingClientRect();
    toolbarMotion?.cancel();
    view = value;
    toolbar.dataset.view = value;
    updateViewButton();
    if (shelf) renderShelf();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const after = capsule.getBoundingClientRect();
      toolbarMotion = capsule.animate(capsuleSpringFrames(before, after, { blur: 2.8 }), { duration: 290 });
    }
  });

  function backButton(label = w.back) {
    return `<button type="button" class="nv-tool nv-section-back" data-nv-back>${icon('back')}${esc(label)}</button>`;
  }

  function alignFlowToolbar(book) {
    if (!book || toolbar.hidden) return;
    const bounds = book.getBoundingClientRect();
    const center = bounds.top + bounds.height / 2;
    const bottom = innerHeight - center - toolbar.offsetHeight / 2;
    const maxBottom = innerHeight - Math.max(12, main.getBoundingClientRect().top + 8) - toolbar.offsetHeight;
    toolbar.style.setProperty('--nv-flow-dock-bottom', `${Math.max(12, Math.min(bottom, maxBottom))}px`);
  }

  function emptyState(title, sub, action = '') {
    return `<div class="nv-empty"><span class="nv-empty-mark" aria-hidden="true"></span>
      <h2>${esc(title)}</h2><p>${esc(sub)}</p>${action}</div>`;
  }

  /* ---------------- 书架 ---------------- */

  function loadShelf() {
    if (!shelfRequest) shelfRequest = api('novel_shelf').finally(() => { shelfRequest = null; });
    return shelfRequest;
  }

  function bookCard(book) {
    const cover = book.cover
      ? `<img src="${esc(book.cover)}" alt="" loading="lazy" draggable="false">`
      /* 没有封面时竖排书名当书脊，和参考图的立体书架一个意思 */
      : `<span class="nv-spine${view === 'flow' ? ' nv-flow-blank' : ''}"><span>${esc(book.title)}</span></span>`;
    const percent = Math.round((book.progress?.percent || 0) * 100);
    const label = `aria-label="${esc(book.title)}" data-nv-book="${esc(book.id)}"`;
    if (view === 'flow') return `<button type="button" class="nv-flow-book" tabindex="-1" ${label}>
      <span class="nv-flow-book-render" aria-hidden="true"><span class="nv-flow-volume">
        <span class="nv-flow-spine"><span data-nv-number></span></span>
        <span class="nv-flow-cover">${cover}</span>
        <span class="nv-flow-boards nv-flow-boards-top"></span>
        <span class="nv-flow-boards nv-flow-boards-bottom"></span>
        <span class="nv-flow-boards nv-flow-boards-edge"></span>
        <span class="nv-flow-pages nv-flow-pages-top"></span>
        <span class="nv-flow-pages nv-flow-pages-bottom"></span>
        <span class="nv-flow-pages nv-flow-pages-edge"></span>
        <span class="nv-flow-back"></span>
      </span></span>
    </button>`;
    if (view === 'cover') return `<button type="button" class="nv-card" ${label}>
      <span class="nv-book-object"><span class="nv-book-block"><span class="nv-cover">${cover}</span></span></span>
    </button>`;
    return `<button type="button" class="nv-card nv-list-row" ${label}>
      <span class="nv-cover">${cover}</span><span class="nv-list-copy">
      <span class="nv-card-title">${esc(book.title)}</span>
      <span class="nv-card-author">${esc(book.author || w.noAuthor)}</span>
      <span class="nv-card-meta">${book.format === 'pdf' ? 'PDF' : `${esc(w.chapters(book.chapterCount))} · ${esc(w.chars(book.chars))}`}</span>
      </span>${percent ? `<span class="nv-card-progress">${esc(w.progress(percent / 100))}</span>` : ''}
    </button>`;
  }

  function openBook(card) {
    if (bookId) return;
    preview.close();
    if (view === 'flow') flowBook = card.dataset.nvBook;
    bookId = card.dataset.nvBook;
    const flow = bodyEl.querySelector('.nv-flow');
    const entry = flow && !matchMedia('(prefers-reduced-motion: reduce)').matches
      ? { flow, art: shelfFlow?.artFor(card) } : null;
    paint(entry);
  }

  async function paintShelf() {
    if (shelf) { renderShelf(); return; }
    bodyEl.innerHTML = `<div class="nv-loading">${esc(w.loading)}</div>`;
    try {
      const data = await loadShelf();
      if (!aliveNow() || tab !== 'shelf' || bookId || reading) return;
      shelf = data;
      renderShelf();
    } catch (error) {
      if (aliveNow() && tab === 'shelf' && !bookId) bodyEl.innerHTML = emptyState(w.fileError, String(error?.message || error));
    }
  }

  function renderShelf(animate = false) {
    preview.close();
    const {books} = shelf;
    if (!books.length) {
      releaseShelfFlow();
      bodyEl.innerHTML = emptyState(w.shelfEmpty, w.shelfEmptySub, `<button type="button" class="nv-primary" data-nv-go-local>${esc(w.addBooks)}</button>`);
      bodyEl.querySelector('[data-nv-go-local]').onclick = () => navigateShelf('local');
      return;
    }
    const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
    const matches = books.filter(book => {
      const text = normalizeSearch([book.title, book.author].join(' '));
      return terms.every(term => text.includes(term));
    });
    const byTitle = (a, b) => collator.compare(a.title, b.title);
    const comparators = {
      recent: (a, b) => (b.lastOpenedAt ?? b.addedAt ?? 0) - (a.lastOpenedAt ?? a.addedAt ?? 0),
      added: (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
      title: byTitle,
      author: (a, b) => Number(!a.author) - Number(!b.author) || collator.compare(a.author || '', b.author || ''),
      progress: (a, b) => (b.progress?.percent ?? 0) - (a.progress?.percent ?? 0)
    };
    matches.sort((a, b) => comparators[sort](a, b) || byTitle(a, b) || collator.compare(a.id, b.id));
    if (!matches.length) {
      releaseShelfFlow();
      bodyEl.innerHTML = emptyState(w.noMatches, w.noMatchesHint);
      return;
    }

    const currentFlowBook = bodyEl.querySelector('.nv-flow') ? shelfFlow?.id() : flowBook;
    let grid = bodyEl.querySelector(`[data-nv-layout="${view}"]`);
    const move = animate && grid && view !== 'flow' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const oldCards = new Map(Array.from(grid?.children ?? [], card => [card.dataset.nvBook, card]));
    const positions = new Map();
    if (move) {
      for (const [id, card] of oldCards) {
        card.getAnimations().filter(animation => animation.id === 'nv-reorder').forEach(animation => animation.cancel());
        const rect = card.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < innerHeight) positions.set(id, rect);
      }
    }
    if (!grid) {
      releaseShelfFlow();
      grid = document.createElement('div');
      grid.dataset.nvLayout = view;
      grid.className = { cover: 'nv-grid', list: 'nv-list-view', flow: 'nv-flow-rail' }[view];
      if (view === 'flow') {
        main.classList.add('nv-flow-active');
        page.classList.add('nv-flow-active');
        bodyEl.classList.add('nv-flow-active');
        bodyEl.innerHTML = '<div class="nv-flow"><div class="nv-flow-stage"></div><h2 class="nv-flow-title" data-title></h2></div>';
        const flow = bodyEl.firstElementChild;
        applyShelfFlowSettings(flow, shelf.flowSettings);
        flow.prepend(grid);
        shelfFlow = bindShelfFlow(grid, { title: flow.querySelector('[data-title]'), main, openBook, alignToolbar: alignFlowToolbar,
          getBook: id => shelf.books.find(book => book.id === id), api, esc, w, locale });
      } else {
        grid.onclick = event => {
          const card = event.target.closest('[data-nv-book]');
          if (card) openBook(card);
        };
        bodyEl.replaceChildren(grid);
      }
    }
    const template = document.createElement('template');
    const cards = matches.map(book => {
      if (oldCards.has(book.id)) return oldCards.get(book.id);
      template.innerHTML = bookCard(book);
      const card = template.content.firstElementChild;
      if (view === 'cover') {
        const cover = card.querySelector('.nv-book-object');
        cover.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') preview.open(book, cover); });
        cover.addEventListener('pointerleave', preview.close);
        card.addEventListener('focus', () => { if (card.matches(':focus-visible')) preview.open(book, cover); });
        card.addEventListener('blur', preview.close);
        card.addEventListener('keydown', event => { if (event.key === 'Escape') preview.close(); });
      }
      return card;
    });
    grid.replaceChildren(...cards);
    if (view === 'flow') shelfFlow.reset(currentFlowBook);
    if (move) {
      const movement = cards.flatMap(card => {
        const before = positions.get(card.dataset.nvBook);
        if (!before) return [];
        const after = card.getBoundingClientRect();
        const x = before.left - after.left, y = before.top - after.top;
        return (x || y) && after.bottom > 0 && after.top < innerHeight ? [{card, x, y}] : [];
      });
      for (const {card, x, y} of movement) {
        card.animate([{translate: x + 'px ' + y + 'px'}, {translate: '0 0'}],
          {id: 'nv-reorder', duration: 280, easing: 'cubic-bezier(.22,.8,.28,1)'});
      }
    }
  }

  function releaseShelfFlow() {
    if (!shelfFlow) return;
    toolbar.style.removeProperty('--nv-flow-dock-bottom');
    flowBook = shelfFlow.id() ?? flowBook;
    shelfFlow.destroy();
    shelfFlow = null;
    main.classList.remove('nv-flow-active');
    page.classList.remove('nv-flow-active');
    bodyEl.classList.remove('nv-flow-active');
  }

  /* ---------------- 详情 ---------------- */

  async function paintDetail(id, entry) {
    const animations = [];
    let flight;
    let cancelled = false;
    function stop() {
      if (cancelled) return;
      cancelled = true;
      for (const animation of animations) animation.cancel();
      flight?.remove();
      entry.flow.inert = false;
      toolbar.inert = false;
      if (stopDetailEntry === stop) stopDetailEntry = null;
    }
    if (entry) {
      entry.flow.inert = true;
      toolbar.inert = true;
      stopDetailEntry = stop;
    } else {
      bodyEl.innerHTML = `<div class="nv-loading">${esc(w.loading)}</div>`;
    }
    let detail;
    try {
      detail = await api('novel_detail', { id });
    } catch (error) {
      if (cancelled || !aliveNow() || bookId !== id) return;
      if (entry) {
        stop();
        releaseShelfFlow();
        toolbar.hidden = true;
      }
      bodyEl.innerHTML = emptyState(w.notFound, String(error?.message || error));
      return;
    }
    if (cancelled || !aliveNow() || bookId !== id) return;
    if (entry) {
      flight = liftCoverForDetail(entry.art);
      for (const surface of [entry.flow, toolbar]) {
        animations.push(surface.animate([{ opacity: 1 }, { opacity: 0 }],
          { duration: 135, easing: 'ease-in', fill: 'forwards' }));
      }
      await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
      if (cancelled || !aliveNow() || bookId !== id) return;
      releaseShelfFlow();
      toolbar.hidden = true;
      toolbar.inert = false;
    }
    const book = detail.book;
    const startAt = detail.progress || null;
    const coverHtml = source => source
      ? `<img src="${esc(source)}" alt="" draggable="false">`
      : `<span class="nv-spine nv-spine-lg"><span>${esc(book.title)}</span></span>`;
    bodyEl.innerHTML = `
      <div class="nv-detail">
        <button type="button" class="nv-back" data-nv-back>‹ ${esc(w.back)}</button>
        <div class="nv-detail-layout">
          <div class="nv-detail-main">
            <div class="nv-detail-top">
              <div class="nv-detail-cover">${coverHtml(book.cover)}</div>
              <div class="nv-detail-meta">
                <h2>${esc(book.title)}</h2>
                <p class="nv-detail-author">${esc(book.author || w.noAuthor)}</p>
                <p class="nv-detail-facts">${book.format === 'pdf' ? 'PDF' : `${esc(w.chapters(book.chapterCount))} · ${esc(w.chars(book.chars))} · ${esc((book.languages || '').toUpperCase() || '—')}`}</p>
                ${book.intro ? `<p class="nv-detail-intro">${esc(book.intro)}</p>` : ''}
                <div class="nv-detail-actions">
                  <button type="button" class="nv-primary" data-nv-read>${esc(startAt ? w.continueReading : w.start)}</button>
                  <button type="button" class="nv-ghost" data-nv-remove>${esc(w.remove)}</button>
                </div>
              </div>
            </div>
            ${book.format === 'pdf' ? '' : `<section class="nv-detail-contents" aria-labelledby="nv-chapters-heading">
              <h3 id="nv-chapters-heading">${esc(onlineLabels.chapters)}</h3>
              <ol class="nv-chapters">${detail.chapters.slice(0, 500).map(chapter => `<li><button type="button" data-nv-chapter="${chapter.idx}"><span class="nv-ch-idx">${chapter.idx + 1}</span><span class="nv-ch-title">${esc(chapter.title)}</span><span class="nv-ch-chars">${esc(w.chars(chapter.chars))}</span></button></li>`).join('')}${detail.chapters.length > 500 ? `<li class="nv-ch-more">${esc(`${detail.chapters.length - 500} …`)}</li>` : ''}</ol>
            </section>`}
          </div>
          <aside class="nv-detail-side detail-main" aria-label="${esc(onlineLabels.info)}"></aside>
        </div>
      </div>`;
    const detailView = bodyEl.querySelector('.nv-detail');
    bindNovelOnline(detailView, { book, api, esc, locale, isCurrent: aliveNow });
    if (entry) {
      const target = bodyEl.querySelector('.nv-detail-cover img');
      const incoming = bodyEl.querySelectorAll(flight ? '.nv-detail > .nv-back, .nv-detail-meta, .nv-detail-contents, .nv-detail-side' : '.nv-detail');
      const landing = flight?.land(target);
      for (const surface of incoming) {
        animations.push(surface.animate([{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }],
          { duration: 310, easing: 'cubic-bezier(.16,1,.3,1)' }));
      }
      Promise.all([landing, ...animations.map(animation => animation.finished.catch(() => {}))]).then(stop);
    }
    bodyEl.querySelector('[data-nv-back]').onclick = () => { bookId = ''; paint(); };
    const open = (chapterIdx, charOffset, startPage) => {
      reading = { id: book.id, format: book.format, chapterIdx: chapterIdx || 0, charOffset: charOffset || 0, startPage };
      paint();
    };
    bodyEl.querySelector('[data-nv-read]').onclick = () => open(startAt?.chapterIdx || 0, startAt?.charOffset || 0, startAt?.page || 0);
    bodyEl.querySelectorAll('[data-nv-chapter]').forEach(row => row.addEventListener('click', () => open(Number(row.dataset.nvChapter), 0)));
    const removeButton = bodyEl.querySelector('[data-nv-remove]');
    removeButton.onclick = async () => {
      if (removeButton.dataset.armed !== '1') {
        removeButton.dataset.armed = '1';
        removeButton.textContent = w.removeConfirm;
        clearTimeout(pickTimer);
        pickTimer = setTimeout(() => { removeButton.dataset.armed = ''; removeButton.textContent = w.remove; }, 3200);
        return;
      }
      removeButton.disabled = true;
      try {
        await api('novel_remove', { id });
        shelf = null;
        bookId = '';
        toast(w.removed);
        paint();
      } catch (error) {
        removeButton.disabled = false;
        toast(String(error?.message || error));
      }
    };
  }

  /* ---------------- 本地 ---------------- */

  function renderCandidates() {
    const list = bodyEl.querySelector('[data-nv-list]');
    if (!list) return;
    if (!candidates.length) { list.innerHTML = ''; return; }
    list.innerHTML = candidates.map((file, index) => `
      <label class="nv-file">
        <input type="checkbox" data-nv-pick="${index}" ${file.checked ? 'checked' : ''}>
        <span class="nv-file-name">${esc(file.name)}</span>
        <span class="nv-file-kind">${esc(file.kind.toUpperCase())}</span>
        <span class="nv-file-size">${esc((file.size / 1024).toFixed(0))} KB</span>
      </label>`).join('');
    list.querySelectorAll('[data-nv-pick]').forEach(box => box.addEventListener('change', () => {
      const item = candidates[Number(box.dataset.nvPick)];
      if (item) item.checked = box.checked;
      updateImportBar();
    }));
    updateImportBar();
  }

  function updateImportBar() {
    const count = candidates.filter(file => file.checked).length;
    const info = bodyEl.querySelector('[data-nv-count]');
    const button = bodyEl.querySelector('[data-nv-import]');
    if (info) info.textContent = count ? w.selected(count) : '';
    if (button) button.disabled = !count || importing;
  }

  async function importSelected() {
    const paths = candidates.filter(file => file.checked).map(file => file.path);
    if (!paths.length || importing) return;
    importing = true;
    updateImportBar();
    const button = bodyEl.querySelector('[data-nv-import]');
    if (button) button.textContent = w.importing;
    try {
      const result = await api('novel_import', { paths });
      if (!aliveNow()) return;
      const done = result.imported.length;
      const skipped = result.skipped.length;
      const failed = result.failed.length;
      if (done) toast(w.importDone(done));
      else if (skipped && !failed) toast(w.importSkipped(skipped));
      else if (failed) toast(`${w.importFailed(failed)} · ${result.failed[0].error}`);
      shelf = null;
      candidates = [];
      navigateShelf('shelf');
      return;
    } catch (error) {
      toast(String(error?.message || error));
    } finally {
      importing = false;
      if (aliveNow()) {
        const again = bodyEl.querySelector('[data-nv-import]');
        if (again) again.textContent = w.import;
        updateImportBar();
      }
    }
  }

  function addCandidates(files) {
    const known = new Set(candidates.map(file => file.path));
    for (const file of files) {
      if (!file?.path || known.has(file.path)) continue;
      known.add(file.path);
      candidates.push({ ...file, checked: true });
    }
    renderCandidates();
  }

  function paintLocal() {
    const ok = candidates.length > 0;
    bodyEl.innerHTML = `
      <div class="nv-local nv-secondary">
        ${backButton()}
        <div class="nv-drop" data-nv-drop tabindex="0" role="button">
          <span class="nv-drop-icon" aria-hidden="true"></span>
          <strong>${esc(w.dropHint)}</strong>
          <span>${esc(w.dropSub)}</span>
        </div>
        <div class="nv-local-actions">
          <button type="button" class="nv-primary" data-nv-folder>${esc(w.pickFolder)}</button>
          <span class="nv-hint">${esc(w.scanHint)}</span>
        </div>
        <div class="nv-list" data-nv-list></div>
        <div class="nv-import-bar">
          <span class="nv-count" data-nv-count></span>
          <button type="button" class="nv-primary" data-nv-import ${ok ? '' : 'disabled'}>${esc(w.import)}</button>
        </div>
        <div class="nv-manual">
          <input type="text" data-nv-path placeholder="${esc(w.manualPath)}" spellcheck="false">
          <button type="button" class="nv-ghost" data-nv-addpath>${esc(w.addPath)}</button>
        </div>
      </div>`;
    bodyEl.querySelector('[data-nv-back]').onclick = () => navigateShelf(localBack);
    renderCandidates();

    const drop = bodyEl.querySelector('[data-nv-drop]');
    drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', event => {
      event.preventDefault();
      drop.classList.remove('over');
      const paths = droppedPaths(event).filter(path => BOOK_EXT.test(path));
      if (!paths.length) return;
      addCandidates(paths.map(path => ({ path, name: path.split(/[\\/]/).pop(), size: 0, kind: fileKind(path) })));
    });

    bodyEl.querySelector('[data-nv-folder]').onclick = async () => {
      if (scanning) return;
      scanning = true;
      try {
        const picked = await invoke('pick_directories', { multiple: false });
        const folder = picked?.[0];
        if (!folder) return;
        const result = await api('novel_scan', { folder });
        if (!aliveNow()) return;
        addCandidates(result.files);
      } catch (error) {
        toast(String(error?.message === 'NOVEL_SCAN_EMPTY' ? w.scanEmpty : error?.message || error));
      } finally {
        scanning = false;
      }
    };

    bodyEl.querySelector('[data-nv-import]').onclick = importSelected;

    const pathInput = bodyEl.querySelector('[data-nv-path]');
    bodyEl.querySelector('[data-nv-addpath]').onclick = () => {
      const value = pathInput.value.trim().replace(/^"|"$/g, '');
      if (!value) return;
      if (!BOOK_EXT.test(value)) { toast(w.fileError); return; }
      addCandidates([{ path: value, name: value.split(/[\\/]/).pop(), size: 0, kind: fileKind(value) }]);
      pathInput.value = '';
    };
    pathInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); bodyEl.querySelector('[data-nv-addpath]').click(); }
    });
  }

  function newDiscoveryView() {
    discoverView?.abort();
    discoverView = new AbortController();
    return discoverView.signal;
  }

  const discoverSettings = openSettings && (() => openSettings('novel-sources'));

  function renderDiscovery(result, signal) {
    paintDiscovery(bodyEl, {
      state: discoverState, result, api, esc, w: sourceText, toast, signal,
      onPage: fetchDiscovery, onLocal: () => navigateShelf('local'), onSettings: discoverSettings,
      onBook: (book, preview, index) => {
        clearTimeout(discoverTimer);
        discoveredBook = { origin: result.host, book, preview, index, scroll: main.scrollTop, proxiedCovers: result.proxiedCovers };
        main.scrollTop = 0;
        paint();
      },
    });
  }

  function showDiscoveryDetail() {
    const selection = discoveredBook;
    paintDiscoveryDetail(bodyEl, {
      selection, api, esc, locale, w: sourceText, signal: newDiscoveryView(), backButton,
      onLocal: () => navigateShelf('local'), onSettings: discoverSettings,
      onImported: () => { shelf = null; }, onRead: id => navigateShelf('shelf', id),
      onBack: () => {
        discoveredBook = null;
        toolbar.hidden = false;
        renderDiscovery(discoverResult, newDiscoveryView());
        main.scrollTop = selection.scroll;
        bodyEl.querySelector(`[data-source-open="${selection.index}"]`)?.focus({ preventScroll: true });
      },
    });
  }

  async function fetchDiscovery(pageNumber) {
    if (tab !== 'discover') return;
    const request = ++discoverState.request;
    discoverState.page = pageNumber;
    const signal = newDiscoveryView();
    renderDiscovery(null, signal);
    try {
      const { query, order } = discoverState;
      const result = await api(query ? 'novel_search' : 'novel_discover', { source: 'book-site', query, order, page: pageNumber });
      if (aliveNow() && !signal.aborted && tab === 'discover' && request === discoverState.request) {
        discoverResult = result;
        renderDiscovery(result, signal);
      }
    } catch {
      if (aliveNow() && !signal.aborted && tab === 'discover' && request === discoverState.request) {
        renderDiscovery({ error: 'BOOK_SITE_UNAVAILABLE' }, signal);
      }
    }
  }

  /* ---------------- 调度 ---------------- */

  function paint(entry) {
    if (!alive) return;
    stopDetailEntry?.();
    preview.close();
    if (entry && bookId) { paintDetail(bookId, entry); return; }
    if (reading || bookId || tab !== 'shelf') releaseShelfFlow();
    if (tab !== 'web') { webView?.destroy(); webView = null; }
    toolbar.hidden = Boolean(reading || bookId || tab === 'local' || tab === 'web' || discoveredBook);
    if (reading) { openReading(); return; }
    if (bookId) { paintDetail(bookId); return; }
    if (discoveredBook) { showDiscoveryDetail(); return; }
    if (tab === 'local') { paintLocal(); return; }
    if (tab === 'discover') { fetchDiscovery(discoverState.page); return; }
    if (tab === 'web') {
      /* 网文对照：内置 syosetu + linovelib（web/novel-web.js） */
      if (!webView) webView = mountWebNovel(bodyEl, { api, locale, esc, toast, onBack: () => navigateShelf('shelf'),
        lookup: word => { try { window.__megulitOpenLookup?.(word); } catch { /* 没挂上就算了 */ } } });
      return;
    }
    paintShelf();
  }

  /* ---------------- 阅读器 ---------------- */

  async function openReading() {
    if (readerOpen) return;
    readerOpen = true;
    const target = reading;
    page.style.display = 'none';
    main.classList.add('nv-reading');
    main.closest('.workspace')?.classList.add('nv-reading-ws');
    document.documentElement.classList.add('nv-reading-root');
    document.body.classList.add('nv-reading-body');
    const hostEl = document.createElement('div');
    readerHost = hostEl;
    hostEl.className = 'nr-host';
    document.body.append(hostEl); /* 放到 body 下：不受 .main 内层 transform 影响，才能真正按视口定位 */
    const done = () => {
      if (!readerOpen) return;
      readerOpen = false;
      reading = null;
      hostEl.remove();
      readerHost = null;
      window.__megulitCloseNovelReader = null;
      page.style.display = '';
      main.classList.remove('nv-reading');
      main.closest('.workspace')?.classList.remove('nv-reading-ws');
      document.documentElement.classList.remove('nv-reading-root');
      document.body.classList.remove('nv-reading-body');
      if (alive) { shelf = null; paint(); }
    };
    try {
      const reader = target.format === 'pdf' ? openPdfReader : openReader;
      const handle = await reader(hostEl, {
        api, esc, toast, w, locale,
        windowAction: action => invoke('window_action', { action }),
        lookup: word => { try { window.__megulitOpenLookup?.(word); } catch { /* 没挂上就算了 */ } },
        id: target.id,
        chapterIdx: target.chapterIdx, charOffset: target.charOffset, startPage: target.startPage,
        onExit: done
      });
      if (!alive) handle?.exit?.();
      else if (!handle) done();
      else window.__megulitCloseNovelReader = () => { try { handle.exit?.(); } catch { done(); } };
    } catch (error) {
      toast(String(error?.message || error));
      done();
    }
  }

  /* 只有书本文件才允许拖进页面，避免 WebView 把别的文件当成页面打开；
     监听挂在 page 上，路由切走时随 DOM 一起回收。 */
  const guard = event => { if (droppedPaths(event).some(path => BOOK_EXT.test(path))) event.preventDefault(); };
  page.addEventListener('dragover', guard);
  page.addEventListener('drop', guard);

  const routeObserver = new MutationObserver(() => {
    if (!page.isConnected) dispose();
  });
  routeObserver.observe(main, { childList: true });
  if (main.parentElement) routeObserver.observe(main.parentElement, { childList: true });
  const shell = main.closest('.app-frame')?.parentElement || document.body;
  routeObserver.observe(shell, { childList: true });

  function dispose() {
    if (!alive) return;
    alive = false;
    webView?.destroy();
    if (readerOpen) {
      window.__megulitCloseNovelReader?.();
      readerHost?.remove();
      document.body.classList.remove('nv-reading-body');
    }
    routeObserver.disconnect();
    clearTimeout(discoverTimer);
    discoverView?.abort();
    toolbarMotion?.cancel();
    stopDetailEntry?.();
    toolbar.remove();
    preview.close();
    releaseShelfFlow();
    reading = null;
    readerOpen = false;
    main.classList.remove('nv-reading');
    main.closest('.workspace')?.classList.remove('nv-reading-ws');
    document.documentElement.classList.remove('nv-reading-root');
  }

  paint();
  return dispose;
}
