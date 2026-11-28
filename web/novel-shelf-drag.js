// SPDX-License-Identifier: GPL-3.0-or-later

import { reducedMotion, shelfMotionPreference } from './novel-shelf.js';

const cardSelector = '[data-nv-book]';

export function bindShelfDrag(surface, main, { gridFor, flowCard, originFor, canGroup, canExtract, extractLabel, onStart, onEnd, onMove, onGroup, onExtract }) {
  const listeners = new AbortController();
  const { signal } = listeners;
  let drag;
  let frame;
  let clickDeadline = 0;

  function makeGhost(card, origin, pointer) {
    const cover = card.querySelector('.nv-cover, .nv-flow-cover');
    const bounds = origin.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'nv-drag-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.dataset.nvExtractLabel = extractLabel;
    if (card.hasAttribute('data-nv-collection-card')) ghost.dataset.stacked = '';
    const front = cover.cloneNode(true);
    front.className = 'nv-drag-front';
    ghost.append(front);
    document.body.append(ghost);
    const width = Math.min(150, Math.max(72, bounds.width * .8));
    const height = width * 1.5;
    Object.assign(ghost.style, { width: width + 'px', height: height + 'px' });
    if (!reducedMotion()) front.animate([
      { transform: `translate(${bounds.left + bounds.width / 2 - pointer.x}px, ${bounds.top + bounds.height / 2 - pointer.y}px) scale(${bounds.width / width}, ${bounds.height / height})` },
      { transform: 'rotate(-6deg) rotateY(-13deg)' }
    ], { id: 'nv-drag-lift', duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' });
    return ghost;
  }

  function animateMove(grid, item, change) {
    if (reducedMotion()) { change(); return; }
    const positions = new Map();
    const prior = [];
    for (const card of grid.children) {
      if (card === item) continue;
      const animation = card.getAnimations().find(item => item.id === 'nv-drag-reorder');
      if (animation) prior.push(animation);
      const rect = card.getBoundingClientRect();
      if (rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight) positions.set(card, rect);
    }
    for (const animation of prior) animation.cancel();
    change();
    for (const [card, old] of positions) {
      const rect = card.getBoundingClientRect();
      const x = old.left - rect.left, y = old.top - rect.top;
      if (x || y) card.animate([{ translate: `${x}px ${y}px` }, { translate: '0 0' }],
        { id: 'nv-drag-reorder', duration: 180, easing: 'cubic-bezier(.2,.8,.25,1)' });
    }
  }

  function distance(rect, x, y) {
    return Math.hypot(Math.max(rect.left - x, x - rect.right, 0), Math.max(rect.top - y, y - rect.bottom, 0));
  }

  function dropTarget(state) {
    const { grid, card, x, y } = state;
    const viewport = distance(grid.getBoundingClientRect(), x, y);
    if (viewport > 24) return null;
    const hit = document.elementFromPoint(x, y)?.closest(cardSelector);
    if (hit?.parentElement === grid) return hit;
    if (distance(card.getBoundingClientRect(), x, y) === 0) return card;
    let nearest;
    let best = state.view === 'flow' ? 24 : 38;
    for (const candidate of grid.children) {
      if (candidate === card) continue;
      const value = distance(candidate.getBoundingClientRect(), x, y);
      if (value < best) { best = value; nearest = candidate; }
    }
    return nearest;
  }

  function markGroup(state, target) {
    if (state.group === target) return;
    state.group?.removeAttribute('data-nv-group-drop');
    state.group = target;
    if (target) target.dataset.nvGroupDrop = '';
  }

  function updateDrop(state) {
    const { grid, card, x, y, view } = state;
    const panel = main.getBoundingClientRect();
    const edge = Math.min(72, panel.width * .085);
    state.extract = canExtract() && y >= panel.top && y <= Math.min(innerHeight, panel.bottom) &&
      (x <= panel.left + edge || x >= panel.right - edge);
    state.ghost.toggleAttribute('data-nv-extract', state.extract);
    if (state.extract) {
      markGroup(state, null);
      state.drop = null;
      return;
    }
    const target = dropTarget(state);
    if (target === card) return;
    if (!target) { markGroup(state, null); state.drop = null; return; }
    const rect = target.getBoundingClientRect();
    const isCenter = face => {
      const u = (x - face.left) / Math.max(1, face.width);
      const v = (y - face.top) / Math.max(1, face.height);
      return u > .22 && u < .78 && v > .18 && v < .82;
    };
    const face = view === 'flow' ? rect : target.querySelector('.nv-cover').getBoundingClientRect();
    const stack = view === 'flow' && target.hasAttribute('data-nv-collection-card')
      ? target.querySelector('.nv-flow-cover').getBoundingClientRect() : null;
    if (canGroup(card, target) && (isCenter(face) || (stack && isCenter(stack)))) {
      markGroup(state, target);
      state.drop = null;
      return;
    }
    markGroup(state, null);
    const before = view === 'list' ? y < rect.top + rect.height / 2 : x < rect.left + rect.width / 2;
    state.drop = { target, before };
    const anchor = before ? target : target.nextElementSibling;
    if (anchor !== card && card.nextElementSibling !== anchor) animateMove(grid, card, () => grid.insertBefore(card, anchor));
  }

  function tick() {
    frame = 0;
    const state = drag;
    if (!state?.ghost) return;
    updateDrop(state);
    const ghostX = state.extract ? Math.max(56, Math.min(innerWidth - 56, state.x)) : state.x;
    state.ghost.style.left = ghostX + 'px';
    state.ghost.style.top = state.y + 'px';
    if (state.extract) return;
    const horizontal = state.view === 'flow';
    const scroller = horizontal ? state.grid : main;
    const bounds = scroller.getBoundingClientRect();
    const point = horizontal ? state.x : state.y;
    const start = horizontal ? bounds.left : Math.max(0, bounds.top);
    const end = horizontal ? bounds.right : Math.min(innerHeight, bounds.bottom);
    const edge = Math.min(horizontal ? 50 : 56, (end - start) / 4);
    const speed = point < start + edge ? -Math.min(18, (start + edge - point) / 3)
      : point > end - edge ? Math.min(18, (point - end + edge) / 3) : 0;
    const previous = horizontal ? scroller.scrollLeft : scroller.scrollTop;
    if (speed) {
      if (horizontal) scroller.scrollLeft += speed;
      else scroller.scrollTop += speed;
    }
    if ((horizontal ? scroller.scrollLeft : scroller.scrollTop) !== previous) frame = requestAnimationFrame(tick);
  }

  function finish(apply) {
    const state = drag;
    drag = null;
    cancelAnimationFrame(frame);
    frame = 0;
    if (!state?.ghost) return;
    const { grid, card, group, drop, originalNext } = state;
    markGroup(state, null);
    if ((!apply || group || !drop) && card.parentElement === grid && card.nextElementSibling !== originalNext) {
      animateMove(grid, card, () => grid.insertBefore(card, originalNext));
    }
    card.removeAttribute('data-nv-drag-slot');
    grid.removeAttribute('data-nv-sorting');
    state.ghost.remove();
    if (surface.hasPointerCapture(state.pointer)) surface.releasePointerCapture(state.pointer);
    clickDeadline = performance.now() + 120;
    onEnd();
    if (apply && state.extract) onExtract(card);
    else if (apply && group) onGroup(card, group);
    else if (apply && drop) onMove(card, drop.target, drop.before);
  }

  surface.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    const grid = gridFor();
    const card = event.target.closest(cardSelector) || (event.target.closest('.nv-flow-feature') && flowCard());
    if (!grid || card?.parentElement !== grid) return;
    drag = { grid, card, view: grid.dataset.nvLayout, pointer: event.pointerId, left: event.clientX, top: event.clientY,
      originalNext: card.nextElementSibling, pressed: event.target };
  }, { signal });
  document.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.ghost) {
      if (Math.hypot(drag.x - drag.left, drag.y - drag.top) < 7) return;
      if (drag.card.parentElement !== drag.grid || !drag.grid.isConnected) { finish(false); return; }
      drag.ghost = makeGhost(drag.card, originFor(drag.card, drag.pressed), drag);
      surface.setPointerCapture(drag.pointer);
      drag.card.dataset.nvDragSlot = '';
      drag.grid.dataset.nvSorting = '';
      onStart();
    }
    event.preventDefault();
    if (!frame) frame = requestAnimationFrame(tick);
  }, { signal });
  document.addEventListener('pointerup', event => {
    if (drag?.pointer !== event.pointerId) return;
    if (drag.ghost && frame) updateDrop(drag);
    finish(true);
  }, { signal });
  for (const type of ['pointercancel', 'lostpointercapture']) surface.addEventListener(type, event => {
    if (drag?.pointer === event.pointerId) finish(false);
  }, { signal });
  addEventListener('blur', () => finish(false), { signal });
  shelfMotionPreference.addEventListener('change', () => {
    if (!reducedMotion()) return;
    for (const root of [surface, drag?.ghost].filter(Boolean)) {
      for (const animation of root.getAnimations({ subtree: true })) {
        if (animation.id === 'nv-drag-reorder' || animation.id === 'nv-drag-lift') animation.cancel();
      }
    }
  }, { signal });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !drag) return;
    event.preventDefault();
    finish(false);
  }, { signal });
  surface.addEventListener('click', event => {
    if (!event.detail || performance.now() > clickDeadline) return;
    clickDeadline = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, signal });

  return { active: () => Boolean(drag?.ghost), cancel: () => finish(false), destroy() { finish(false); listeners.abort(); } };
}
