// SPDX-License-Identifier: GPL-3.0-or-later
const active = new WeakMap();
const curlSurfaces = new WeakMap();
const curlFrames = new WeakMap();
const lastInput = new WeakMap();

export function stopReaderTurn(root) {
  active.get(root)?.();
}

function curlSurface(root) {
  let surface = curlSurfaces.get(root);
  if (surface) return surface;
  const layer = document.createElement('div');
  layer.className = 'nr-page-turn';
  layer.setAttribute('aria-hidden', 'true');
  const make = className => {
    const div = document.createElement('div');
    div.className = className;
    return div;
  };
  const paper = make('nr-page-paper');
  const reverse = make('nr-page-reverse');
  const gradient = make('nr-page-fold-gradient');
  const shade = make('nr-page-cast-shadow');
  reverse.append(gradient);
  layer.append(paper, shade, reverse);
  surface = { layer, paper, reverse, gradient, shade };
  curlSurfaces.set(root, surface);
  return surface;
}

export function turnReaderPage(root, viewport, body, mode, forward, previous = '', outgoing = [], shift = 0) {
  const now = performance.now();
  const rapid = now - (lastInput.get(root) ?? -Infinity) < 145;
  lastInput.set(root, now);
  stopReaderTurn(root);

  const animations = [];
  let release = () => {};
  const animate = (element, frames, timing) => animations.push(element.animate(frames, timing));
  if (mode === 'fade') {
    const timing = { duration: rapid ? 120 : 155, easing: 'ease-in-out', fill: 'both' };
    animate(viewport, [{ opacity: outgoing.length ? .73 : .18 }, { opacity: 1 }], timing);
    // Keep the outgoing illustration on its existing surface while the new page fades in underneath.
    const hold = { translate: shift + 'px', zIndex: 1, pointerEvents: 'none' };
    for (const picture of outgoing) animate(picture, [{ ...hold, opacity: .88 }, { ...hold, opacity: 0 }], timing);
  } else if (mode === 'slide' && previous && !rapid) {
    animate(body, [{ transform: previous }, { transform: body.style.transform }],
      { duration: 165, easing: 'cubic-bezier(.17,.72,.25,1)' });
  } else if (mode === 'curl' && !rapid) {
    // The fold is independent of the text and images. Only the live spread needs rasterizing.
    const { layer, paper, reverse, gradient, shade } = curlSurface(root);
    const { clientWidth: width, clientHeight: height } = root;
    if (!width || !height) return;
    const frames = getCurlFrames(root, width, height, forward);
    gradient.style.setProperty('--nr-fold-side', forward ? 'to right' : 'to left');
    gradient.style.width = frames.gradientWidth + 'px';
    root.append(layer);
    const timing = { duration: 235, fill: 'both' };
    animate(paper, frames.front, timing);
    animate(reverse, frames.reverse, timing);
    animate(gradient, frames.gradient, timing);
    animate(shade, frames.shade, timing);
    release = () => layer.remove();
  } else {
    const distance = (forward ? 1 : -1) * (mode === 'curl' ? 14 : 25);
    const frames = [{ translate: distance + 'px', opacity: .84 }, { translate: '0', opacity: 1 }];
    animate(viewport, frames, { duration: rapid ? 85 : 125, easing: 'ease-out' });
  }
  const finish = () => {
    if (active.get(root) !== finish) return;
    active.delete(root);
    for (const animation of animations) animation.cancel();
    release();
  };
  active.set(root, finish);
  animations[0].finished.then(finish, finish);
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
    const t = 1 - (1 - raw) ** 3;
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
    frames.front.push({ opacity: .5 * (1 - raw), clipPath: poly([[0, 0], [top, 0], [bottom, h], [0, h]]) });
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
