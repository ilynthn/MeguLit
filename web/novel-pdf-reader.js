// SPDX-License-Identifier: GPL-3.0-or-later

const asset = name => new URL('./vendor/pdfjs/' + name, import.meta.url).href;
const chunkSize = 512 * 1024;
const decode = data => Uint8Array.from(atob(data), char => char.charCodeAt(0));
const labels = {
  zh: { back: '返回书籍', previous: '上一页', next: '下一页', page: '页码', smaller: '缩小', larger: '放大',
    fit: '适合页面', loading: '正在打开 PDF…', error: '无法打开 PDF', password: '输入 PDF 密码', unlock: '打开' },
  ja: { back: '本に戻る', previous: '前のページ', next: '次のページ', page: 'ページ番号', smaller: '縮小', larger: '拡大',
    fit: '全体を表示', loading: 'PDF を開いています…', error: 'PDF を開けません', password: 'PDF のパスワード', unlock: '開く' },
  en: { back: 'Back to book', previous: 'Previous page', next: 'Next page', page: 'Page number', smaller: 'Zoom out', larger: 'Zoom in',
    fit: 'Fit page', loading: 'Opening PDF…', error: 'Could not open PDF', password: 'PDF password', unlock: 'Open' },
};

export function openPdfReader(host, { api, esc, locale, id, startPage = 0, onExit }) {
  const w = labels[locale] || labels.zh;
  host.innerHTML = `<section class="nv-pdf" aria-label="PDF">
    <div class="nv-pdf-tools">
      <button type="button" class="nv-ghost" data-action="exit" title="${esc(w.back)}" aria-label="${esc(w.back)}">‹</button>
      <div class="nv-pdf-nav">
        <button type="button" data-action="previous" title="${esc(w.previous)}" aria-label="${esc(w.previous)}">‹</button>
        <input data-pdf-page type="number" min="1" value="1" aria-label="${esc(w.page)}">
        <span data-pdf-count> / —</span>
        <button type="button" data-action="next" title="${esc(w.next)}" aria-label="${esc(w.next)}">›</button>
      </div>
      <div class="nv-pdf-nav">
        <button type="button" data-action="smaller" title="${esc(w.smaller)}" aria-label="${esc(w.smaller)}">−</button>
        <button type="button" data-action="fit" title="${esc(w.fit)}" aria-label="${esc(w.fit)}">100%</button>
        <button type="button" data-action="larger" title="${esc(w.larger)}" aria-label="${esc(w.larger)}">+</button>
      </div>
    </div>
    <div class="nv-pdf-stage">
      <p role="status" data-pdf-status>${esc(w.loading)}</p>
      <form data-pdf-unlock hidden>
        <input type="password" autocomplete="off" aria-label="${esc(w.password)}" placeholder="${esc(w.password)}">
        <button type="submit" class="nv-primary">${esc(w.unlock)}</button>
      </form>
      <canvas hidden></canvas>
    </div>
  </section>`;
  const stage = host.querySelector('.nv-pdf-stage');
  const canvas = stage.querySelector('canvas');
  const pageField = host.querySelector('[data-pdf-page]');
  const status = stage.querySelector('[data-pdf-status]');
  const unlock = stage.querySelector('[data-pdf-unlock]');
  const button = action => host.querySelector(`[data-action="${action}"]`);
  const cancellation = new AbortController();
  let alive = true;
  let doc;
  let loading;
  let renderTask;
  let timer;
  let activePage = 1;
  let renderVersion = 0;
  let zoom = 1;

  function save() {
    if (!doc) return;
    api('novel_progress_save', { id, chapterIdx: 0, page: activePage - 1, percent: activePage / doc.numPages }).catch(() => {});
  }

  function fail() {
    if (!alive) return;
    status.textContent = w.error;
    status.hidden = false;
  }

  async function draw() {
    if (!doc || !alive) return;
    const version = ++renderVersion;
    renderTask?.cancel();
    const page = await doc.getPage(activePage);
    if (!alive || version !== renderVersion) return;
    const size = page.getViewport({ scale: 1 });
    const fit = Math.max(.1, Math.min((stage.clientWidth - 32) / size.width, (stage.clientHeight - 32) / size.height));
    const viewport = page.getViewport({ scale: fit * zoom });
    const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.max(1, Math.floor(viewport.width * density));
    canvas.height = Math.max(1, Math.floor(viewport.height * density));
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    canvas.hidden = false;
    renderTask = page.render({ canvas, canvasContext: context, viewport,
      transform: [density, 0, 0, density, 0, 0], background: '#fff' });
    try {
      await renderTask.promise;
      if (version === renderVersion) status.hidden = true;
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') throw error;
    }
  }

  function updateControls() {
    pageField.value = activePage;
    pageField.disabled = !doc;
    button('previous').disabled = !doc || activePage <= 1;
    button('next').disabled = !doc || activePage >= doc.numPages;
    button('fit').textContent = Math.round(zoom * 100) + '%';
    button('smaller').disabled = !doc || zoom <= .5;
    button('larger').disabled = !doc || zoom >= 3;
    button('fit').disabled = !doc;
  }

  function go(next) {
    if (!doc) return;
    activePage = Math.max(1, Math.min(doc.numPages, Math.trunc(Number(next) || activePage)));
    updateControls();
    stage.scrollTo(0, 0);
    draw().catch(fail);
    clearTimeout(timer);
    timer = setTimeout(save, 320);
  }

  function resize(nextZoom) {
    zoom = Math.max(.5, Math.min(3, nextZoom));
    updateControls();
    draw().catch(fail);
  }
  function exit() {
    if (!alive) return;
    alive = false;
    clearTimeout(timer);
    save();
    cancellation.abort();
    renderTask?.cancel();
    loading?.destroy().catch(() => {});
    onExit();
  }
  button('exit').onclick = exit;
  button('previous').onclick = () => go(activePage - 1);
  button('next').onclick = () => go(activePage + 1);
  button('smaller').onclick = () => resize(zoom / 1.25);
  button('larger').onclick = () => resize(zoom * 1.25);
  button('fit').onclick = () => resize(1);
  pageField.onchange = () => go(pageField.value);
  window.addEventListener('resize', () => draw().catch(fail), { signal: cancellation.signal });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); exit(); return; }
    if (event.target.closest?.('input') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['PageDown', 'ArrowRight', 'PageUp', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      go(activePage + (['PageDown', 'ArrowRight'].includes(event.key) ? 1 : -1));
    }
  }, { signal: cancellation.signal });
  updateControls();

  (async () => {
    const [pdf, info] = await Promise.all([import(asset('pdf.min.mjs')), api('novel_pdf', { id })]);
    if (!alive) return;
    pdf.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');
    const transport = new pdf.PDFDataRangeTransport(info.size, null);
    transport.requestDataRange = async (begin, end) => {
      try {
        const range = new Uint8Array(end - begin);
        for (let offset = begin; alive && offset < end; offset += chunkSize) {
          const { data } = await api('novel_pdf', { id, begin: offset, end: Math.min(end, offset + chunkSize) });
          range.set(decode(data), offset - begin);
        }
        if (alive) transport.onDataRange(begin, range);
      } catch {
        if (!alive) return;
        fail();
        loading.destroy().catch(() => {});
      }
    };
    loading = pdf.getDocument({
      range: transport, rangeChunkSize: chunkSize, disableAutoFetch: true, disableStream: true,
      cMapUrl: asset('cmaps/'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts/'),
      wasmUrl: asset('wasm/'), iccUrl: asset('iccs/'), useWasm: false, isEvalSupported: false, enableXfa: false,
    });
    loading.onPassword = updatePassword => {
      status.hidden = true;
      unlock.hidden = false;
      const field = unlock.querySelector('input');
      field.focus();
      unlock.onsubmit = event => {
        event.preventDefault();
        const password = field.value;
        field.value = '';
        unlock.hidden = true;
        updatePassword(password);
      };
    };
    doc = await loading.promise;
    if (!alive) return;
    host.querySelector('[data-pdf-count]').textContent = ' / ' + doc.numPages;
    pageField.max = doc.numPages;
    go(startPage + 1);
  })().catch(fail);

  return { exit };
}
