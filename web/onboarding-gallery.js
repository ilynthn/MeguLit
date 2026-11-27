/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-27 the 新手引导 as an illustrated page: the same six steps, pictures and words as the in-game tour
   (web/onboarding-steps.js), paged with 上一步 / 下一步 and dots. It heads the tutorial in the top bar 教程 panel and in the
   start notice; 进游戏后再带我走一遍 asks the service to run the in-game tour again (now if a game is on, else next launch). */
import './hotkey-label.js';
import './onboarding-steps.js';

const O = () => globalThis.MeguLitOnboarding;
const IMG = (name, locale) => new URL(`./assets/onboarding/${O().image(name, locale)}`, import.meta.url).href;
let replayApi = null, replayToast = null;

function stepHTML(locale, i, esc) {
  const s = O().step(locale, i), keys = ['menu', 'cover'].map(k => O().hotkey(k)).filter(Boolean);
  const body = keys.reduce((h, k) => h.split(esc(k)).join(`<kbd>${esc(k)}</kbd>`), esc(s.body));
  return { s, body };
}

export function galleryHTML(locale, esc) {
  if (!O()) return '';
  const o = O(), w = o.words(locale), { s, body } = stepHTML(locale, 0, esc);
  return `<section class="tour-gallery" data-step="${s.id}" data-index="0" data-locale="${esc(locale)}" aria-roledescription="carousel">
<figure class="tour-gallery-shot"><img src="${IMG(s.image, locale)}" alt="" decoding="async"></figure>
<div class="tour-gallery-text"><span class="tour-gallery-kicker">✦ ${esc(w.kicker)}</span><h3 class="tour-gallery-title">${esc(s.title)}</h3><p class="tour-gallery-body">${body}</p></div>
<div class="tour-gallery-bar"><div class="tour-gallery-dots">${o.STEPS.map((x, i) => `<button type="button" data-tour-dot="${i}" aria-label="${esc(o.step(locale, i).title)}"${i ? '' : ' aria-current="step"'}></button>`).join('')}</div>
<div class="tour-gallery-nav"><button type="button" class="secondary" data-tour-prev hidden>${esc(w.prev)}</button><button type="button" class="primary" data-tour-next>${esc(w.next)}</button></div></div>
<button type="button" class="tour-gallery-replay" data-tour-replay>${esc(w.replay)}</button>
</section>`;
}

function show(root, i) {
  const o = O(), locale = root.dataset.locale || 'zh', n = o.STEPS.length;
  i = Math.max(0, Math.min(n - 1, i));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { s, body } = stepHTML(locale, i, esc), w = o.words(locale);
  root.dataset.step = s.id; root.dataset.index = String(i);
  root.querySelector('.tour-gallery-shot img').src = IMG(s.image, locale);
  root.querySelector('.tour-gallery-title').textContent = s.title;
  root.querySelector('.tour-gallery-body').innerHTML = body;
  root.querySelectorAll('[data-tour-dot]').forEach((d, k) => { if (k === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
  root.querySelector('[data-tour-prev]').hidden = i === 0;
  const next = root.querySelector('[data-tour-next]'); next.hidden = i === n - 1; next.textContent = w.next;
}

/* one delegated listener for every gallery the panels draw */
globalThis.document?.addEventListener('click', e => {
  const t = e.target.closest?.('.tour-gallery [data-tour-prev],.tour-gallery [data-tour-next],.tour-gallery [data-tour-dot],.tour-gallery [data-tour-replay]');
  if (!t) return;
  const root = t.closest('.tour-gallery'), i = Number(root.dataset.index) || 0;
  if (t.hasAttribute('data-tour-replay')) {
    const w = O().words(root.dataset.locale || 'zh');
    t.disabled = true;
    Promise.resolve(replayApi?.('onboarding_replay')).then(() => replayToast?.(w.replayDone)).catch(() => {}).finally(() => { t.disabled = false; });
    return;
  }
  show(root, t.hasAttribute('data-tour-dot') ? Number(t.dataset.tourDot) : i + (t.hasAttribute('data-tour-next') ? 1 : -1));
});
globalThis.document?.addEventListener('keydown', e => {
  const root = e.target.closest?.('.tour-gallery');
  if (!root || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  show(root, (Number(root.dataset.index) || 0) + (e.key === 'ArrowRight' ? 1 : -1));
});

export function bindGallery({ api, toast }) { replayApi = api; replayToast = toast; }
