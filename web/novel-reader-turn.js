// SPDX-License-Identifier: GPL-3.0-or-later
const active = new WeakMap();
const pageSnapshots = new WeakMap();
const curlFrames = new WeakMap();
const lastCurl = new WeakMap();
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export function stopReaderTurn(root) {
  active.get(root)?.();
}

export function invalidateReaderTurnSnapshot(root) {
  pageSnapshots.delete(root);
}

export function captureReaderPage(root, viewport, body) {
  const cached = pageSnapshots.get(root);
  if (cached) {
    cached.copy.style.transform = body.style.transform;
    return cached;
  }
  const surface = root.getBoundingClientRect();
  const bounds = viewport.getBoundingClientRect();
  const paper = document.createElement('div');
  paper.className = 'nr-page-paper';
  const fragment = document.createElement('div');
  fragment.className = 'nr-page-fragment';
  Object.assign(fragment.style, { left: bounds.left - surface.left + 'px', top: bounds.top - surface.top + 'px',
    width: bounds.width + 'px', height: bounds.height + 'px' });
  const copy = body.cloneNode(true);
  copy.style.transform = body.style.transform;
  copy.style.width = bounds.width + 'px';
  if (root.dataset.dir === 'v') copy.style.left = -viewport.scrollLeft + 'px';
  fragment.append(copy);
  paper.append(fragment);
  const snapshot = { paper, copy, width: surface.width, height: surface.height };
  if (root.dataset.dir === 'h') pageSnapshots.set(root, snapshot);
  return snapshot;
}

export function turnReaderPage(root, body, mode, forward, previous, snapshot) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || mode === 'scroll') {
    stopReaderTurn(root);
    return;
  }
  const interrupted = active.has(root);
  active.get(root)?.(snapshot);
  if (mode === 'slide' && !snapshot) {
    const animation = body.animate([{ transform: previous }, { transform: body.style.transform }],
      { duration: interrupted ? 100 : 165, easing: 'cubic-bezier(.12,.74,.23,1)' });
    const finish = () => {
      if (active.get(root) !== finish) return;
      active.delete(root);
      animation.cancel();
    };
    active.set(root, finish);
    animation.finished.then(finish, finish);
    return;
  }
  if (!snapshot) return;
  let layer = snapshot.layer;
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'nr-page-turn';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    layer.append(snapshot.paper);
    snapshot.layer = layer;
  }
  if (!layer.isConnected) root.append(layer);
  const animations = [];
  let finished = false;
  const finish = replacement => {
    if (finished) return;
    finished = true;
    for (const animation of animations) animation.cancel();
    if (replacement !== snapshot) layer.remove();
    if (active.get(root) === finish) active.delete(root);
  };
  active.set(root, finish);

  if (mode !== 'curl') {
    const slide = mode === 'slide';
    const distance = (forward ? -1 : 1) * root.clientWidth;
    const timing = { duration: slide ? 165 : interrupted ? 65 : 105, easing: 'ease-out', fill: 'both' };
    animations.push(layer.animate(slide ? [{ translate: '0' }, { translate: distance + 'px' }]
      : [{ opacity: .72 }, { opacity: 0 }], timing));
    if (slide) animations.push(root.querySelector('.nr-reading-spread')
      .animate([{ translate: -distance + 'px' }, { translate: '0' }], timing));
    animations[0].finished.then(() => finish(), () => finish());
    return;
  }

  snapshot.curl ??= createCurl(layer);
  const { reverse, gradient, shade } = snapshot.curl;
  const { width: w, height: h } = snapshot;
  if (!w || !h) { finish(); return; }
  const frames = getCurlFrames(root, w, h, forward);
  gradient.style.setProperty('--nr-fold-side', forward ? 'to right' : 'to left');
  gradient.style.width = frames.gradientWidth + 'px';
  // Keep a full curl for an isolated flip and shorten overlapping turns in a burst.
  const now = performance.now();
  const interval = now - (lastCurl.get(root) ?? -Infinity);
  lastCurl.set(root, now);
  const timing = { duration: clamp(interval * 1.2, 105, 265), fill: 'both' };
  for (const [element, keyframes] of [
    [snapshot.paper, frames.front], [reverse, frames.reverse],
    [gradient, frames.gradient], [shade, frames.shade],
  ]) animations.push(element.animate(keyframes, timing));
  animations[0].finished.then(() => finish(), () => finish());
}

function createCurl(layer) {
  // A soft leaf bends at a moving diagonal crease. Clip its front, reverse and shadows separately.
  const reverse = document.createElement('div');
  reverse.className = 'nr-page-reverse';
  const gradient = document.createElement('div');
  gradient.className = 'nr-page-fold-gradient';
  reverse.append(gradient);
  const shade = document.createElement('div');
  shade.className = 'nr-page-cast-shadow';
  layer.append(shade, reverse);
  return { reverse, gradient, shade };
}

function getCurlFrames(root, w, h, forward) {
  let cached = curlFrames.get(root);
  if (!cached || cached.width !== w || cached.height !== h) {
    cached = { width: w, height: h, directions: new Map() };
    curlFrames.set(root, cached);
  }
  const existing = cached.directions.get(forward);
  if (existing) return existing;

  const x = n => forward ? n : w - n;
  const poly = points => 'polygon(' + points.map(([a, b]) => x(a).toFixed(1) + 'px ' + b.toFixed(1) + 'px').join(',') + ')';
  const maxLift = Math.min(w * .15, 155);
  const frames = { front: [], reverse: [], gradient: [], shade: [],
    gradientWidth: 38 + maxLift * 1.15 };
  // Interpolate the same crease and shadows between samples on the browser's animation timeline.
  const samples = 14;
  for (let sample = 0; sample <= samples; sample++) {
    const raw = sample / samples;
    const t = 1 - (1 - raw) ** 2;
    const bow = Math.sin(Math.PI * t);
    const lift = maxLift * bow;
    const lean = Math.min(h * .13, 136) * bow;
    const middle = w - (w + 38) * t;
    const top = middle + lean, bottom = middle - lean;
    const line = y => top + (bottom - top) * y / h;
    const curled = [];
    for (let i = 0; i <= 8; i++) {
      const y = h * i / 8;
      curled.push([line(y) - lift * (.48 + .52 * Math.sin(Math.PI * i / 8)), y]);
    }
    frames.front.push({ clipPath: poly([[0, 0], [top, 0], [bottom, h], [0, h]]) });
    const fold = poly([[top, 0], [bottom, h], ...curled.reverse()]);
    frames.reverse.push({ clipPath: fold, opacity: Math.min(1, bow * 7) });
    const angle = Math.atan2(x(top) - x(bottom), h);
    const seam = x(middle);
    const span = 38 + lift * 1.15;
    const crease = `translateX(${seam}px) rotate(${angle}rad)`;
    frames.gradient.push({ transform: `${crease} translateX(${forward ? -span : 0}px) scaleX(${span / frames.gradientWidth})` });
    frames.shade.push({ opacity: bow, transform: `${crease} scaleX(${forward ? 1 : -1})` });
  }
  cached.directions.set(forward, frames);
  return frames;
}
