// SPDX-License-Identifier: GPL-3.0-or-later
import { pourIntoSlot } from './novel-flow-liquid.js';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function readingDuration(seconds, locale, w) {
  if (!seconds) return w.unreadTime;
  const parts = [['hour', Math.floor(seconds / 3600)], ['minute', Math.floor(seconds / 60) % 60]];
  if (seconds < 60) parts.push(['second', seconds]);
  return parts.filter(([, value]) => value).map(([unit, value]) =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value)).join(' ');
}

function bookExtent(book, w) {
  if (book.format === 'pdf') return 'PDF';
  return [w.chapters(book.chapterCount), w.chars(book.chars), book.languages?.toUpperCase()].filter(Boolean).join(' · ');
}

export function createCoverPreview(page, { api, esc, w, locale, isCurrent }) {
  const panel = document.createElement('aside');
  panel.className = 'nv-book-preview';
  panel.popover = 'manual';
  panel.setAttribute('aria-hidden', 'true');
  let current;

  function close() {
    if (!current) return;
    clearTimeout(current.timer);
    current.events.abort();
    current.observer.disconnect();
    current = null;
    panel.hidePopover();
    panel.remove();
    panel.replaceChildren();
  }

  function position(anchor) {
    const bounds = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const gap = 12;
    const right = bounds.right + gap;
    const left = right + width <= innerWidth - gap ? right : bounds.left - width - gap;
    panel.style.left = `${Math.max(gap, Math.min(left, innerWidth - width - gap))}px`;
    panel.style.top = `${Math.max(gap, Math.min(bounds.top, innerHeight - height - gap))}px`;
  }

  async function open(book, anchor) {
    if (current?.anchor === anchor || !isCurrent() || !anchor.isConnected) return;
    close();
    const state = { anchor, events: new AbortController() };
    state.observer = new MutationObserver(() => { if (!anchor.isConnected) close(); });
    state.observer.observe(page.parentNode, { childList: true, subtree: true });
    current = state;
    const valid = () => current === state && anchor.isConnected && isCurrent();
    const cover = book.cover || '';
    panel.innerHTML = `
      ${cover ? `<img class="nv-preview-backdrop" src="${esc(cover)}" alt="">` : ''}
      <div class="nv-preview-copy"><h2>${esc(book.title)}</h2><p>${esc(book.author || w.noAuthor)}</p></div>
      <div class="nv-preview-art">${cover ? `<img src="${esc(cover)}" alt="">` : `<span class="nv-spine"><span>${esc(book.title)}</span></span>`}</div>
      <div class="nv-preview-copy nv-preview-facts">
        <p>${esc(bookExtent(book, w))}</p>
        <p>${esc(w.progress(book.progress?.percent ?? 0))}</p>
        <p>${esc(w.readingTime)} <span data-nv-time>…</span></p>
      </div>`;
    page.append(panel);
    panel.showPopover();
    position(anchor);
    const { signal } = state.events;
    const dismissOnLayout = event => { if (!(event.target instanceof Node) || !panel.contains(event.target)) close(); };
    addEventListener('scroll', dismissOnLayout, { capture: true, passive: true, signal });
    addEventListener('resize', close, { signal });
    addEventListener('blur', close, { signal });

    let preview;
    try { preview = await api('novel_detail', { id: book.id, preview: true }); } catch {
      if (valid()) panel.querySelector('[data-nv-time]').textContent = '—';
      return;
    }
    if (!valid()) return;
    panel.querySelector('[data-nv-time]').textContent = readingDuration(preview.seconds, locale, w);
    const slides = [...(cover ? [null] : []), ...preview.images];
    if (!preview.images.length || reducedMotion()) return;
    const art = panel.querySelector('.nv-preview-art');
    let next = cover ? 1 : 0;
    let failures = 0;

    async function advance() {
      if (!valid() || reducedMotion()) return;
      const file = slides[next];
      next = (next + 1) % slides.length;
      try {
        const img = new Image();
        img.alt = '';
        if (!file) img.src = cover;
        else {
          const result = await api('novel_image', { id: book.id, name: file });
          if (!valid()) return;
          img.src = `data:${result.mime};base64,${result.data}`;
        }
        await img.decode();
        if (!valid() || reducedMotion()) return;
        const old = art.firstElementChild;
        art.append(img);
        const timing = { duration: 360, easing: 'ease-in-out', fill: 'both' };
        const fade = img.animate([{ opacity: 0 }, { opacity: 1 }], timing);
        old?.animate([{ opacity: 1 }, { opacity: 0 }], timing);
        await fade.finished.catch(() => {});
        old?.remove();
        fade.cancel();
        failures = 0;
      } catch { failures++; }
      if (valid() && slides.length > 1 && failures < slides.length) state.timer = setTimeout(advance, 3100);
    }
    state.timer = setTimeout(advance, cover ? 2800 : 0);
  }
  return { open, close };
}

const flowUnits = {
  width: '%', x: '%', top: 'px', height: 'px', spacing: 'px', depth: 'px',
  angle: 'deg', selectedAngle: 'deg', scale: '', lift: 'px', fade: '%', titleGap: 'px'
};

export function applyShelfFlowSettings(flow, settings) {
  for (const [key, unit] of Object.entries(flowUnits)) {
    const property = '--nv-flow-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
    const value = settings?.[key];
    if (Number.isFinite(value)) flow.style.setProperty(property, value + unit);
    else flow.style.removeProperty(property);
  }
  flow.dispatchEvent(new flow.ownerDocument.defaultView.Event('nv-flow-layout'));
}

export function liftCoverForDetail(source) {
  if (!source?.naturalWidth) return null;
  const rect = source.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const matrix = new DOMMatrix(getComputedStyle(source).transform);
  const angle = Math.atan2(matrix.b, matrix.a);
  const sin = Math.abs(Math.sin(angle)), cos = Math.abs(Math.cos(angle));
  const projection = cos * cos - sin * sin;
  const width = projection > .5 ? (rect.width * cos - rect.height * sin) / projection : rect.width;
  const height = projection > .5 ? (rect.height * cos - rect.width * sin) / projection : rect.height;
  const box = (left, top, w, h) => ({ left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
  const start = { ...box(rect.left + (rect.width - width) / 2, rect.top + (rect.height - height) / 2, width, height),
    transform: `rotate(${angle}rad)` };
  const image = source.cloneNode();
  image.className = 'nv-detail-flight';
  image.setAttribute('aria-hidden', 'true');
  Object.assign(image.style, start);
  source.style.visibility = 'hidden';
  document.body.append(image);
  let target;
  let flight;
  const events = new AbortController();
  function remove() {
    events.abort();
    flight?.cancel();
    image.remove();
    source.style.removeProperty('visibility');
    target?.style.removeProperty('visibility');
  }
  async function land(destination) {
    if (!destination) { remove(); return; }
    target = destination;
    const end = target.getBoundingClientRect();
    target.style.visibility = 'hidden';
    flight = image.animate([start, { ...box(end.left, end.top, end.width, end.height), transform: 'rotate(0deg)' }],
      { duration: 390, easing: 'cubic-bezier(.24,.78,.23,1)', fill: 'forwards' });
    addEventListener('resize', remove, { signal: events.signal });
    addEventListener('scroll', remove, { capture: true, passive: true, signal: events.signal });
    await flight.finished.catch(() => {});
    remove();
  }
  return { land, remove };
}

function createFlowFeature(flow, rail, { getBook, api, esc, w, locale, openBook }) {
  const stage = flow.querySelector('.nv-flow-stage');
  let current;
  const returning = new Set();

  function position(feature, measure = false) {
    const { card, node } = feature;
    if (measure || feature.anchorLeft === undefined) {
      feature.anchorLeft = rail.offsetLeft + card.offsetLeft + card.offsetWidth / 2;
      node.style.top = rail.offsetTop + card.offsetTop + 'px';
    }
    node.style.left = feature.anchorLeft - rail.scrollLeft + 'px';
  }

  function fit(feature) {
    const face = feature.node.querySelector('.nv-flow-face-info');
    const copy = face.firstElementChild;
    copy.style.fontSize = '';
    for (let attempt = 0; attempt < 4 && face.scrollHeight > face.clientHeight; attempt++) {
      copy.style.fontSize = Number.parseFloat(getComputedStyle(copy).fontSize) * .88 + 'px';
    }
  }

  function open(card) {
    const book = getBook(card.dataset.nvBook);
    if (!book || current?.card === card) return;
    const node = document.createElement('div');
    node.className = 'nv-flow-feature';
    const motion = document.createElement('div');
    motion.className = 'nv-flow-feature-motion';
    const drift = document.createElement('div');
    drift.className = 'nv-flow-drift';
    const pose = document.createElement('div');
    pose.className = 'nv-flow-pose';
    const volume = card.querySelector('.nv-flow-volume').cloneNode(true);

    const face = volume.querySelector('.nv-flow-cover');
    const art = face.querySelector('img');
    if (art) {
      art.className = 'nv-flow-art';
      art.removeAttribute('loading');
      node.dataset.hasArt = '';
    }

    const progress = Math.max(0, Math.min(1, book.progress?.percent ?? 0));
    face.classList.add('nv-flow-face-info');
    face.innerHTML = `<div class="nv-flow-facts">
      <div class="nv-flow-byline"><h3>${esc(book.title)}</h3><p>${esc(book.author || w.noAuthor)}</p></div>
      <p>${esc(bookExtent(book, w))}</p>
      <div class="nv-flow-progress"><p>${esc(w.progress(progress))}</p><span aria-hidden="true" style="--nv-read:${progress}"></span></div>
      <p>${esc(w.readingTime)} <span data-nv-time>…</span></p>
    </div>`;

    pose.append(volume);
    if (art) pose.append(art);
    drift.append(pose);
    motion.append(drift);
    node.append(motion);
    stage.append(node);
    const feature = { card, node, drift, pose, volume, art };
    current = feature;
    position(feature);
    fit(feature);
    card.dataset.featured = '';
    flow.dataset.detail = '';
    node.getBoundingClientRect();
    node.dataset.open = '';
    node.onclick = () => { if (current === feature) openBook(card); };
    const time = face.querySelector('[data-nv-time]');
    api('novel_detail', { id: book.id, preview: true }).then(data => {
      if (current !== feature || !node.isConnected) return;
      time.textContent = readingDuration(data.seconds, locale, w);
      fit(feature);
    }).catch(() => { if (current === feature) time.textContent = '—'; });
    document.fonts.ready.then(() => { if (current === feature && node.isConnected) fit(feature); });
  }

  function remove(feature) {
    clearTimeout(feature.idleTimer);
    feature.events?.abort();
    feature.node.remove();
    if (current?.card !== feature.card) delete feature.card.dataset.featured;
    delete feature.card.dataset.filling;
    returning.delete(feature);
  }

  async function returnToSlot(feature) {
    const { card, node, pose, volume, art, drift } = feature;
    const { signal } = feature.events;
    const anchor = node.getBoundingClientRect();
    const assembly = pose.getBoundingClientRect();
    const origin = { x: assembly.left + assembly.width / 2 - anchor.left,
      y: assembly.top + assembly.height / 2 - anchor.top };
    const centerShift = (pose.offsetWidth - volume.offsetWidth) / 2;
    for (const part of [volume, art].filter(Boolean)) {
      part.animate([
        { transform: getComputedStyle(part).transform, clipPath: 'inset(0 round 0%)', opacity: 1 },
        { transform: `translateX(${centerShift}px) scale(.23, .17) rotate(-7deg)`,
          clipPath: 'inset(0 round 38%)', opacity: 1, offset: .82 },
        { transform: `translateX(${centerShift}px) scale(.12, .10)`,
          clipPath: 'inset(0 round 50%)', opacity: 0 }
      ], { duration: 148, easing: 'cubic-bezier(.46,.12,.42,1)', fill: 'forwards' });
    }
    drift.dataset.frozen = '';
    // The stream uses coordinates relative to this slot, which keeps moving with the rail.
    await new Promise(resolve => setTimeout(resolve, 103));
    if (signal.aborted) return;
    await pourIntoSlot(node, origin, card.offsetHeight - 2, signal, () => position(feature));
    if (signal.aborted) return;

    const render = card.querySelector('.nv-flow-book-render');
    card.dataset.filling = '';
    delete card.dataset.featured;
    // A single wave clips the assembled book, so its sides and front art reveal at the same height.
    feature.fill = render.animate([
      { clipPath: 'polygon(-400% 104%, 0 100%, 50% 104%, 100% 100%, 500% 104%, 500% 130%, -400% 130%)' },
      { clipPath: 'polygon(-400% 61%, 0 49%, 50% 56%, 100% 46%, 500% 61%, 500% 130%, -400% 130%)', offset: .49 },
      { clipPath: 'polygon(-400% -28%, 0 -28%, 50% -28%, 100% -28%, 500% -28%, 500% 130%, -400% 130%)' }
    ], { duration: 152, easing: 'cubic-bezier(.22,.7,.3,1)' });
    await feature.fill.finished.catch(() => {});
    if (!signal.aborted) remove(feature);
  }

  function close(animate) {
    const feature = current;
    if (!feature) return;
    current = null;
    clearTimeout(feature.idleTimer);
    delete flow.dataset.detail;
    if (!animate || reducedMotion()) { remove(feature); return; }

    const { node } = feature;
    node.dataset.returning = '';
    node.setAttribute('aria-hidden', 'true');
    returning.add(feature);
    feature.events = new AbortController();
    returnToSlot(feature).catch(() => remove(feature));
  }

  function update(refit = false) {
    if (current) {
      position(current, refit);
      if (refit) fit(current);
    }
    for (const feature of returning) position(feature, refit);
  }

  function track(event) {
    if (!current || reducedMotion() || event.pointerType === 'touch') return;
    const feature = current;
    const parts = feature.art ? [feature.volume, feature.art] : [feature.volume];
    feature.node.dataset.moving = '';
    for (const part of parts) {
      const bounds = part.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / (bounds.width * 1.55)));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / bounds.height));
      const art = part === feature.art;
      part.style.setProperty('--nv-follow-x', -y * (art ? 7 : 5) + 'deg');
      part.style.setProperty('--nv-follow-y', x * (art ? 11 : 7) + 'deg');
      part.style.setProperty('--nv-follow-shift', x * (art ? 7 : 4) + 'px');
    }
    clearTimeout(feature.idleTimer);
    feature.idleTimer = setTimeout(untrack, 660);
  }

  function untrack() {
    if (!current) return;
    clearTimeout(current.idleTimer);
    delete current.node.dataset.moving;
    for (const part of [current.volume, current.art]) {
      if (!part) continue;
      for (const axis of ['x', 'y', 'shift']) part.style.removeProperty('--nv-follow-' + axis);
    }
  }

  function reset() {
    close(false);
    for (const feature of returning) {
      feature.fill?.cancel();
      remove(feature);
    }
  }

  return { open, close, update, track, untrack, reset, artFor: card => current?.card === card ? current.art : null };
}

export function bindShelfFlow(rail, { title, main, openBook, alignToolbar, getBook, api, esc, w, locale }) {
  const flow = rail.parentElement;
  const panel = flow.parentElement;
  const feature = createFlowFeature(flow, rail, { openBook, getBook, api, esc, w, locale });
  const events = new AbortController();
  const { signal } = events;
  let selected;
  let pending;
  let scrollTimer;
  let dwellTimer;
  let titleAnimation;
  let titleTarget = '';
  let wheelDelta = 0;
  let lastWheel = 0;
  let wheelDirection = 0;
  let slideFrame = 0;
  let slideLeft = 0;
  let lastSlideTime = 0;
  let drag;

  async function showTitle() {
    const next = selected?.getAttribute('aria-label') ?? '';
    if (next === titleTarget) return;
    titleTarget = next;
    const previousOpacity = getComputedStyle(title).opacity;
    titleAnimation?.cancel();
    if (title.textContent && !reducedMotion()) {
      const exit = title.animate([{ opacity: previousOpacity }, { opacity: 0, translate: '0 -8px' }],
        { duration: 160, easing: 'ease-in', fill: 'forwards' });
      titleAnimation = exit;
      try { await exit.finished; } catch { return; }
      exit.cancel();
    }
    title.textContent = next;
    if (next && !reducedMotion()) {
      titleAnimation = title.animate([{ opacity: 0, translate: '0 14px' }, { opacity: 1, translate: '0 0' }],
        { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  }

  function select(card) {
    if (!card || card === selected) return;
    clearTimeout(dwellTimer);
    feature.close(true);
    if (selected) {
      selected.removeAttribute('data-active');
      selected.removeAttribute('aria-current');
      selected.tabIndex = -1;
    }
    selected = card;
    selected.dataset.active = '';
    selected.setAttribute('aria-current', 'true');
    selected.tabIndex = 0;
  }

  function syncScroll() {
    const first = rail.firstElementChild;
    if (!first || !first.offsetWidth) return;
    const lead = first.offsetLeft + first.offsetWidth / 2;
    const index = Math.round((rail.scrollLeft + rail.clientWidth / 2 - lead) / first.offsetWidth);
    select(rail.children[Math.min(rail.children.length - 1, Math.max(0, index))]);
  }

  function settle() {
    clearTimeout(scrollTimer);
    if (slideFrame || drag?.active) return;
    pending = null;
    syncScroll();
    showCurrent();
  }

  function showCurrent() {
    showTitle();
    clearTimeout(dwellTimer);
    const card = selected;
    dwellTimer = setTimeout(() => {
      if (card === selected && card?.isConnected && !pending && !drag?.active && !flow.inert) feature.open(card);
    }, 720);
  }

  const cardCenter = card => card.offsetLeft + card.offsetWidth / 2 - rail.clientWidth / 2;

  function stopSlide() {
    cancelAnimationFrame(slideFrame);
    slideFrame = 0;
    pending = null;
    delete rail.dataset.sliding;
  }

  function slide(time) {
    if (!pending) { stopSlide(); return; }
    const target = Math.min(rail.scrollWidth - rail.clientWidth, Math.max(0, cardCenter(pending)));
    const distance = target - slideLeft;
    if (Math.abs(distance) < .6) {
      rail.scrollTo({ left: target, behavior: 'instant' });
      stopSlide();
      showCurrent();
      return;
    }
    slideLeft += distance * (1 - Math.exp(-Math.max(1, time - lastSlideTime) / 66));
    lastSlideTime = time;
    rail.scrollTo({ left: slideLeft, behavior: 'instant' });
    slideFrame = requestAnimationFrame(slide);
  }

  function center(card, smooth = true) {
    if (!card) return;
    select(card);
    const left = cardCenter(card);
    clearTimeout(scrollTimer);
    if (smooth && !reducedMotion() && (slideFrame || Math.abs(left - rail.scrollLeft) > 1)) {
      pending = card;
      if (!slideFrame) {
        slideLeft = rail.scrollLeft;
        lastSlideTime = performance.now();
        rail.dataset.sliding = '';
        slideFrame = requestAnimationFrame(slide);
      }
      return;
    }
    stopSlide();
    rail.scrollTo({ left, behavior: 'instant' });
    showCurrent();
  }

  function reset(id) {
    feature.reset();
    const cards = [...rail.children];
    cards.forEach((card, index) => {
      card.querySelector('[data-nv-number]').textContent = String(index + 1).padStart(2, '0');
    });
    center(cards.find(card => card.dataset.nvBook === id) ?? cards[0], false);
    alignToolbar(rail.firstElementChild);
  }

  function measureBounds() {
    const bottomInset = Number.parseFloat(getComputedStyle(main).paddingBottom) || 0;
    const bottom = Math.min(innerHeight, main.getBoundingClientRect().bottom - bottomInset);
    const room = Math.max(0, Math.floor(bottom - panel.getBoundingClientRect().top));
    const value = room + 'px';
    if (panel.style.getPropertyValue('--nv-flow-room') !== value) {
      panel.style.setProperty('--nv-flow-room', value);
      if (selected) center(selected, false);
    }
    feature.update(true);
  }

  rail.addEventListener('scroll', () => {
    feature.update();
    if (drag?.active) {
      syncScroll();
      showTitle();
      return;
    }
    if (slideFrame) return;
    if (!pending) syncScroll();
    clearTimeout(dwellTimer);
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(settle, 150);
  }, { passive: true });
  rail.addEventListener('scrollend', () => {
    if (slideFrame || drag?.active) return;
    settle();
  });
  flow.addEventListener('nv-flow-layout', () => {
    center(selected, false);
    feature.update(true);
    alignToolbar(rail.firstElementChild);
  });
  main.addEventListener('pointermove', event => {
    if (flow.inert || drag?.active) feature.untrack();
    else feature.track(event);
  }, { passive: true, signal });
  main.addEventListener('pointerleave', feature.untrack, { signal });
  const resize = new ResizeObserver(() => {
    feature.update(true);
    alignToolbar(rail.firstElementChild);
  });
  resize.observe(rail);
  const region = new ResizeObserver(measureBounds);
  region.observe(main);
  addEventListener('resize', () => {
    measureBounds();
    alignToolbar(rail.firstElementChild);
  }, { signal });
  measureBounds();
  main.addEventListener('wheel', event => {
    if (flow.inert || drag?.active || event.ctrlKey || event.defaultPrevented || !selected) return;
    const mode = event.deltaMode;
    const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
      * (mode === 1 ? 32 : mode === 2 ? rail.clientWidth : 1);
    if (!delta) return;
    event.preventDefault();
    const direction = Math.sign(delta);
    if (event.timeStamp - lastWheel > 145 || direction !== wheelDirection) wheelDelta = 0;
    wheelDirection = direction;
    lastWheel = event.timeStamp;
    // A mouse notch already represents one book. High-resolution deltas accumulate until they reach one step.
    wheelDelta = mode || Math.abs(delta) >= 38 ? 38 : wheelDelta + Math.abs(delta);
    if (wheelDelta < 38) return;
    wheelDelta -= 38;
    center(direction > 0 ? selected.nextElementSibling : selected.previousElementSibling);
  }, { passive: false, signal });
  main.addEventListener('pointerdown', event => {
    if (flow.inert || !selected || !event.isPrimary || event.button !== 0 ||
        event.target.closest('button, a, input, select, textarea, .nv-flow-feature')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
  }, { signal });
  // The desktop shell normally starts a window drag on bare main-area presses.
  main.addEventListener('mousedown', event => {
    if (!flow.inert && event.target === main && event.button === 0) event.stopPropagation();
  }, { signal });
  main.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (!drag.active) {
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(event.clientY - drag.y)) return;
      rail.dataset.dragging = '';
      stopSlide();
      clearTimeout(dwellTimer);
      clearTimeout(scrollTimer);
      feature.close(true);
      main.setPointerCapture(event.pointerId);
      drag.active = true;
      drag.left = rail.scrollLeft;
      main.dataset.nvFlowDragging = '';
    }
    event.preventDefault();
    rail.scrollTo({ left: drag.left - dx, behavior: 'instant' });
  }, { signal });
  function endDrag(event) {
    if (drag?.id !== event.pointerId) return;
    const active = drag.active;
    drag = null;
    delete main.dataset.nvFlowDragging;
    if (active) {
      syncScroll();
      center(selected);
    }
    delete rail.dataset.dragging;
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, endDrag, { signal });
  rail.onclick = event => {
    const card = event.target.closest('[data-nv-book]');
    if (!card) return;
    if (card === selected) openBook(card);
    else center(card);
  };
  rail.onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const card = event.key === 'ArrowLeft' ? selected?.previousElementSibling : selected?.nextElementSibling;
    if (!card) return;
    center(card);
    card.focus({ preventScroll: true });
  };
  function destroy() {
    stopSlide();
    if (drag && main.hasPointerCapture(drag.id)) main.releasePointerCapture(drag.id);
    drag = null;
    delete main.dataset.nvFlowDragging;
    clearTimeout(scrollTimer);
    clearTimeout(dwellTimer);
    titleAnimation?.cancel();
    resize.disconnect();
    region.disconnect();
    events.abort();
    panel.style.removeProperty('--nv-flow-room');
    feature.reset();
  }

  return { reset, destroy, artFor: feature.artFor, id: () => selected?.dataset.nvBook };
}
