// SPDX-License-Identifier: GPL-3.0-or-later
// megulit.com page script: language and theme, the release data behind the download buttons, engine list, changelog.
import { I18N } from './i18n.js';
import { MIRROR, downloadSources, formatSize, formatDate, pickLang, renderMarkdown } from './core.mjs';
import { kana } from './spell.js';
import { playIntro, introShown } from './intro.js';
import { nowPlaying, bgmCredit } from './nowplaying.js';
import { ScAudio } from './sc.js';
import { neAudio, inChina } from './ne.js';
import { spectrum, eqBars, spectrumScrollbar } from './spectrum.js';
import { heroPlay } from './heroplay.js';
import { notice } from './notice.js';
import { tryIt } from './try.js';
// the entrance starts before anything else on the page is set up
playIntro();

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// ---- language ----------------------------------------------------------------------------------------------------------
// Chinese is the page's own text; read it once so switching back needs no second copy.
const zh = new Map();
for (const el of $$('[data-i]')) zh.set('t:' + el.dataset.i, el.textContent);
for (const el of $$('[data-i-html]')) zh.set('h:' + el.dataset.iHtml, el.innerHTML);
for (const el of $$('[data-i-attr]')) for (const pair of el.dataset.iAttr.split(';')) {
  const [attr, key] = pair.split(':');
  zh.set('a:' + key, el.getAttribute(attr));
}
let lang = pickLang(new URLSearchParams(location.search).get('lang') || store.get('megulit-lang'), navigator.languages || [navigator.language]);
const d = k => I18N.dyn[lang][k];

function applyLang(next) {
  lang = next;
  const dict = I18N[lang] || {};
  const pick = (kind, key) => (lang === 'zh' ? zh.get(kind + ':' + key) : dict[key]) ?? zh.get(kind + ':' + key);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  for (const el of $$('[data-i]')) el.textContent = pick('t', el.dataset.i);
  for (const el of $$('[data-i-html]')) el.innerHTML = pick('h', el.dataset.iHtml);
  for (const el of $$('[data-i-attr]')) for (const pair of el.dataset.iAttr.split(';')) {
    const [attr, key] = pair.split(':');
    el.setAttribute(attr, pick('a', key));
  }
  for (const b of $$('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  splitKinetic();
  setSoundLabel();
  dispatchEvent(new Event('megulit:lang'));
  document.title = document.body.dataset.page === 'changelog' ? `${pick('t', 'cl.title')} · MeguLit` : d('title');
  if (release) fillRelease();
  if (engines) fillEngines(); else fillTicker();
  if (releases) fillReleases();
  setNotes(lang === 'zh' ? 'zh' : 'en');
}
for (const b of $$('[data-lang]')) b.addEventListener('click', () => {
  store.set('megulit-lang', b.dataset.lang);
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  history.replaceState(null, '', url);
  applyLang(b.dataset.lang);
});

// ---- theme -------------------------------------------------------------------------------------------------------------
$('#theme')?.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  store.set('megulit-theme', root.dataset.theme);
});

// ---- specimen glosses ----------------------------------------------------------------------------------------------------
const gloss = $('.gloss');
for (const w of $$('.jp .w')) {
  const i = Number(w.dataset.gloss);
  const on = v => {
    gloss?.classList.toggle('focus', v);
    w.classList.toggle('on', v);
    $$('dt', gloss)[i]?.classList.toggle('on', v);
    $$('dd', gloss)[i]?.classList.toggle('on', v);
  };
  for (const [ev, v] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) w.addEventListener(ev, () => on(v));
}

// ---- embed before / after ------------------------------------------------------------------------------------------------
for (const b of $$('[data-embed]')) b.addEventListener('click', () => {
  $('.textbox').dataset.state = b.dataset.embed;
  for (const o of $$('[data-embed]')) o.setAttribute('aria-pressed', String(o === b));
});

// ---- tabs (arrow keys move between tabs, as the ARIA tabs pattern expects) ------------------------------------------------
const tabs = $$('.tabs [role="tab"]');
function selectTab(tab, focus) {
  for (const t of tabs) {
    const sel = t === tab;
    t.setAttribute('aria-selected', String(sel));
    t.tabIndex = sel ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !sel;
  }
  if (focus) tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); selectTab(tabs[(i + step + tabs.length) % tabs.length], true); }
  });
});

// ---- release data ----------------------------------------------------------------------------------------------------------
let release = null, mirrorOk = false, notesLang = 'zh', engines = null, releases = null;

async function getJson(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally { clearTimeout(timer); }
}

function fillRelease() {
  const r = release;
  const sources = downloadSources(r).filter(s => mirrorOk || s.id !== 'mirror');
  if (!sources.length) return;
  for (const a of $$('.js-download')) a.href = sources[0].url;
  for (const el of $$('.js-version')) el.textContent = 'v' + r.label;
  for (const el of $$('.js-title')) el.textContent = 'MeguLit v' + r.label;
  for (const el of $$('.js-size')) el.textContent = formatSize(r.size, lang);
  for (const el of $$('.js-date')) el.textContent = formatDate(r.published, lang);
  for (const el of $$('.js-filename')) el.textContent = r.name;
  for (const el of $$('.js-sha')) el.textContent = r.sha256;
  const note = $('.js-source-note');
  if (note && !mirrorOk) note.textContent = d('fallbackNote');
  const alt = $('.js-alt');
  if (alt) alt.replaceChildren(...sources.slice(1).map(s => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url;
    a.rel = 'noopener';
    const name = document.createElement('span');
    name.textContent = d(s.id);
    const host = document.createElement('span');
    host.textContent = s.host || new URL(s.url).host;
    a.append(name, host);
    li.append(a);
    return li;
  }));
  setNotes(notesLang);
}

// after every version's notes: it was only tested on the developer's machine; problems go through the app's feedback
const caveat = l => { const p = document.createElement('p'); p.className = 'notes-caveat'; p.textContent = I18N.dyn[l]?.notesCaveat || d('notesCaveat'); return p; };
function setNotes(which) {
  notesLang = which;
  for (const b of $$('[data-notes]')) b.setAttribute('aria-pressed', String(b.dataset.notes === which));
  const box = $('.js-notes');
  if (box && release?.notes) { box.innerHTML = renderMarkdown(release.notes[which] || release.notes.zh); box.append(caveat(lang === 'ja' ? 'ja' : which)); }
}
for (const b of $$('[data-notes]')) b.addEventListener('click', () => setNotes(b.dataset.notes));

$('.js-copy')?.addEventListener('click', async e => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText($('.js-sha').textContent.trim());
    btn.textContent = d('copied');
    setTimeout(() => { btn.textContent = lang === 'zh' ? zh.get('t:d.copy') : I18N[lang]['d.copy']; }, 1600);
  } catch {
    getSelection().selectAllChildren($('.js-sha'));
  }
});

async function loadRelease() {
  try {
    release = await getJson(`${MIRROR}/latest.json`, 3000);
    mirrorOk = Boolean(release?.key);
  } catch { release = null; }
  if (!release) {
    // mirror out of reach: the snapshot shipped with the site, brought up to date from GitHub's own API when it can be
    const snap = await getJson('/data/latest.json', 8000).catch(() => null);
    const gh = await getJson('https://api.github.com/repos/ilynthn/MeguLit/releases/latest', 5000).catch(() => null);
    release = mergeGithub(snap, gh);
  }
  if (release) fillRelease();
}
// The fields the page needs, from a GitHub release; release notes stay the snapshot's unless the version matches.
function mergeGithub(snap, gh) {
  const asset = gh?.assets?.find(a => /^MeguLit-v[\d.]+[a-z]?-win-x64\.zip$/i.test(a.name));
  if (!asset) return snap;
  const label = (/v?(\d+\.\d+\.\d+[a-z]?)\s*$/i.exec(gh.name || '') || /v?(\d+\.\d+\.\d+[a-z]?)$/i.exec(gh.tag_name || '') || [])[1];
  if (!label) return snap;
  const same = snap && snap.label === label.toLowerCase();
  return {
    ...(same ? snap : { notes: snap?.notes && snap.label === label ? snap.notes : null }),
    label: label.toLowerCase(), version: label.toLowerCase(), tag: gh.tag_name, title: gh.name, name: asset.name, size: asset.size,
    sha256: String(asset.digest || '').replace(/^sha256:/, '') || (same ? snap.sha256 : ''),
    published: gh.published_at, github: asset.browser_download_url, page: gh.html_url,
  };
}

// ---- engines ---------------------------------------------------------------------------------------------------------------
function fillEngines() {
  const e = engines;
  const li = (b, span) => {
    const el = document.createElement('li');
    const bb = document.createElement('b');
    bb.textContent = b;
    el.append(bb);
    if (span) { const s = document.createElement('span'); s.textContent = span; el.append(s); }
    return el;
  };
  $('.js-engine-count') && ($('.js-engine-count').textContent = e.detected.length);
  for (const [sel, n] of [['.js-count-engines', e.detected.length], ['.js-count-adapters', e.adapters.length]]) {
    const el = $(sel);
    if (el) { el.dataset.to = n; if (!el.dataset.counted) el.textContent = n; }
  }
  $('.js-adapters')?.replaceChildren(...e.adapters.map(a => li(a.name, a.games.join(' · '))));
  $('.js-games')?.replaceChildren(...e.games.map(g => {
    const el = li(lang === 'en' && g.en ? g.en : g.title, g.engine);
    el.firstChild.lang = 'ja';
    return el;
  }));
  fillTicker();
  $('.js-detected')?.replaceChildren(...e.detected.map(n => { const el = document.createElement('li'); el.textContent = n; return el; }));
}
async function loadEngines() {
  if (!$('.js-adapters')) return;
  engines = await getJson('/data/engines.json', 8000).catch(() => null);
  if (engines) fillEngines();
}

// ---- changelog page --------------------------------------------------------------------------------------------------------
function fillReleases() {
  const list = $('.js-releases');
  if (!list) return;
  list.replaceChildren(...releases.map((r, i) => {
    const li = document.createElement('li');
    li.className = 'rel';
    li.id = r.tag;
    const notesLangFor = lang === 'zh' ? 'zh' : 'en';
    li.innerHTML = `<div class="rel-meta"><h2></h2><p class="js-d"></p><p class="js-s"></p><p><a class="link" rel="noopener"></a></p></div><div class="rel-body"></div>`;
    $('h2', li).textContent = 'v' + r.label;
    if (i === 0) { const b = document.createElement('span'); b.className = 'rel-latest'; b.textContent = d('latest'); $('h2', li).append(b); }
    $('.js-d', li).textContent = formatDate(r.published, lang);
    $('.js-s', li).textContent = `${d('size')} ${formatSize(r.size, lang)}`;
    const a = $('a', li); a.href = r.page; a.textContent = d('github_page');
    $('.rel-body', li).innerHTML = renderMarkdown(r.notes[notesLangFor] || r.notes.zh);
    $('.rel-body', li).append(caveat(lang));
    return li;
  }));
}
async function loadReleases() {
  if (!$('.js-releases')) return;
  releases = await getJson(`${MIRROR}/releases.json`, 4000).catch(() => null);
  if (!Array.isArray(releases) || !releases.length) releases = await getJson('/data/releases.json', 8000).catch(() => null);
  if (Array.isArray(releases)) fillReleases();
  else $('.js-releases').innerHTML = `<li class="rel"><p>${d('loadFail')}</p></li>`;
}


// ---- motion ------------------------------------------------------------------------------------------------------------
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

// Headline letters flip in one by one. The heading keeps its words for screen readers.
function splitKinetic() {
  for (const h of $$('.kinetic')) {
    h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    let i = 0;
    const walk = node => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          // Letters are grouped per word (or per CJK phrase) so a line never breaks inside one; spaces stay breakable.
          const frag = document.createDocumentFragment();
          for (const token of child.textContent.split(/(\s+)/)) {
            if (!token) continue;
            if (/^\s+$/.test(token)) { frag.append(token); continue; }
            const word = document.createElement('span');
            word.className = 'wd';
            for (const ch of token) {
              const span = document.createElement('span');
              span.className = 'ch';
              span.setAttribute('aria-hidden', 'true');
              span.style.setProperty('--i', i++);
              span.textContent = ch;
              word.append(span);
            }
            frag.append(word);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName === 'RUBY') {
          const span = document.createElement('span');
          span.className = 'ch';
          span.style.setProperty('--i', i++);
          child.replaceWith(span);
          span.append(child);
        } else if (child.nodeType === 1 && !child.classList.contains('ch') && !child.classList.contains('wd') && child.tagName !== 'WBR') walk(child);
      }
    };
    walk(h);
    h.style.setProperty('--n', i);
    h.classList.remove('split');
    void h.offsetWidth;
    h.classList.add('split');
  }
}

// Background video: the smallest file that looks sharp on this screen; none when motion is reduced or data is saved.
const video = $('.hero-video');
let heroSeen = true;
// The sound is the full theme song, a separate file fetched only when the visitor turns sound on; the video stays muted.
// the music streams from SoundCloud's embedded player (sc.js); nothing is hosted here
// SoundCloud everywhere except mainland China, where it does not load: there the songs come from NetEase Cloud Music
const bgm = inChina() ? neAudio() : new ScAudio();
// the bottom layer: a few far kana all the way down the page, and the song's lyric lines while it plays
const deepLayer = $('.kana-deep') ? kana($('.kana-deep'), { still: reduce, deep: true, hero: $('.hero') }) : null;
// lyric lines go to the bottom layer and to the sky layer (built further down); each shows them where it is visible
let skyLayer = null;
let topLayer = null;
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const lyricLayers = { say: text => { const pick = Math.random() * 2 ** 32, hud = text ? `\u266a ${mmss(bgm.currentTime)}` : ''; deepLayer?.say(text, pick, hud); skyLayer?.say(text, pick, hud); }, clear: () => { deepLayer?.clear(); skyLayer?.clear(); } };
const player = $('.sound-ctl') ? nowPlaying(bgm, $('.sound-ctl'), { reduce, background: deepLayer ? lyricLayers : null }) : null;
// the equalisers and the right-hand scrollbar follow the song's real spectrum (measured offline, see spectrum.js)
const spec = spectrum(bgm, { reduce });
document.querySelectorAll('.sound-fab .eq, .np-eq').forEach(el => eqBars(spec, el));
spectrumScrollbar(spec);
// the headline plays like a galgame text box (heroplay.js)
heroPlay($('#hero-title'), { reduce });
bgmCredit();
notice({ t: k => d(k), lang: () => lang, after: playIntro() });
tryIt({ lang: () => lang, reduce });
let soundOn = false;
// while the sound is on and the hero is off screen, the sound control floats in the corner so it can be turned off
const soundCtl = $('.sound-ctl'), soundHome = soundCtl && document.createComment('sound-ctl');
soundCtl?.before(soundHome);
// it moves to <body> while floating: inside the hero it would sit under every later section
const floatSound = () => {
  if (!soundCtl) return;
  const float = soundOn && !heroSeen;
  if (float === soundCtl.classList.contains('floating')) return;
  if (float) document.body.append(soundCtl); else soundHome.after(soundCtl);
  soundCtl.classList.toggle('floating', float);
};
function videoSrc() {
  const w = Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2);
  // a portrait screen (phones) gets the vertical cut of the promo
  if (innerHeight > innerWidth && video.dataset.psm) return w <= 1400 ? video.dataset.psm : video.dataset.pmd;
  // the hero video sits dimmed and grey behind the title: 720p is enough up to 1920 wide (half the decoder memory of 1080p)
  return w <= 900 ? video.dataset.sm : w <= 2200 ? video.dataset.md : video.dataset.lg;
}
function startVideo() {
  if (!video || video.getAttribute('src')) return;
  video.src = videoSrc();
  const t = Number(video.dataset.at || 0);
  if (t) video.addEventListener('loadedmetadata', () => { video.currentTime = t; }, { once: true });
  video.play().catch(() => {});
}
// Memory: a video that has been off screen for a few seconds drops its file and decoder (the poster stays, so it
// looks the same); it loads again from the browser cache when it comes back
const releaseVideo = v => { if (!v.getAttribute('src')) return; v.dataset.at = String(v.currentTime || 0); v.pause(); v.removeAttribute('src'); v.load(); };
const releaseLater = (v, ms = 4000) => { clearTimeout(v._rel); v._rel = setTimeout(() => releaseVideo(v), ms); };
let introDone = false;
if (video && !reduce && !navigator.connection?.saveData) {
  // the background video starts once the entrance logo is up, so the two never compete for the first bytes
  introShown.then(() => { introDone = true; if (heroSeen) startVideo(); });
  // off screen the picture pauses to save power; the music is a separate track and keeps playing down the page
  new IntersectionObserver(([e]) => {
    heroSeen = e.isIntersecting;
    if (heroSeen) { clearTimeout(video._rel); if (video.getAttribute('src')) video.play().catch(() => {}); else if (introDone) startVideo(); }
    else { video.pause(); releaseLater(video, 6000); }
    floatSound();
  }).observe(video);
}
if ($('.kana-sky')) skyLayer = kana($('.kana-sky'), { still: reduce, hero: $('.hero'), until: $('.hp') });
if ($('.kana-top')) topLayer = kana($('.kana-top'), { still: reduce, hero: $('.hero'), near: true });
// Drum hits: the song's kicks and snares (found offline by site/tools/beats.py) move every floating layer while it plays
if (!reduce) {
  let beats = null, ki = 0, si = 0, lastT = 0, raf = 0;
  const hit = (kind, s) => { for (const l of [deepLayer, skyLayer, topLayer]) l?.pulse(kind, s); };
  const seek = t => { ki = beats.kick.findIndex(b => b[0] >= t); si = beats.snare.findIndex(b => b[0] >= t); if (ki < 0) ki = beats.kick.length; if (si < 0) si = beats.snare.length; };
  const tick = () => {
    raf = 0;
    if (bgm.paused || !beats) return;
    const t = bgm.currentTime;
    if (t < lastT - .5) seek(t);                      // the song looped (or was sought back)
    lastT = t;
    while (ki < beats.kick.length && beats.kick[ki][0] <= t) { if (t - beats.kick[ki][0] < .15) hit('kick', beats.kick[ki][1]); ki++; }
    while (si < beats.snare.length && beats.snare[si][0] <= t) { if (t - beats.snare[si][0] < .15) hit('snare', beats.snare[si][1]); si++; }
    raf = requestAnimationFrame(tick);
  };
  bgm.addEventListener('play', async () => {
    if (!beats) beats = await fetch(new URL(`../audio/${bgm.dataset.track}.beats.json`, import.meta.url)).then(r => r.json()).catch(() => null);
    if (!beats) return;
    seek(bgm.currentTime); lastT = bgm.currentTime;
    if (!raf) raf = requestAnimationFrame(tick);
  });
  bgm.addEventListener('seeked', () => { if (beats) seek(bgm.currentTime); });
  addEventListener('megulit:track', () => { beats = null; ki = si = 0; lastT = 0; });
}
const soundBtn = $('.js-sound');
function setSoundLabel() {
  if (!soundBtn) return;
  const on = soundOn;
  soundBtn.setAttribute('aria-pressed', String(on));
  $('.js-sound-label').textContent = on ? d('soundOff') : d('soundOn');
  const vol = $('.vol');
  if (vol) vol.hidden = !on;
}
// Volume: sound starts at 20% (every song itself plays 24 dB down); the slider sets it from there.
const volInput = $('#hero-volume'), volOut = $('.vol-v');
const volume = () => (volInput ? Number(volInput.value) : 20) / 100;
volInput?.style.setProperty('--fill', `${volInput.value}%`);   /* the CSP forbids inline style attributes */
// iPhone and iPad: a page cannot change the volume of what it plays (Safari ignores it, SoundCloud's player too), so
// the slider would do nothing there; it gives way to a hint about the phone's own buttons
const fixedVolume = (() => { try { const a = document.createElement('audio'); a.volume = .5; return a.volume === 1; } catch { return false; } })();
if (fixedVolume && volInput) {
  const vol = volInput.closest('.vol'), hint = document.createElement('span');
  hint.className = 'vol-hint'; vol.classList.add('fixed');
  const paintHint = () => { hint.textContent = d('volHint'); };
  paintHint(); addEventListener('megulit:lang', paintHint);
  vol.append(hint);
}
volInput?.addEventListener('input', () => {
  bgm.volume = volume();
  if (volOut) volOut.textContent = `${volInput.value}%`;
  volInput.style.setProperty('--fill', `${volInput.value}%`);
});
// true once the song's position has moved on by a third of a second, false if it has not within `ms`
const moving = (a, ms) => new Promise(res => {
  const t0 = a.currentTime;
  const check = () => { if (a.currentTime > t0 + .3) done(true); };
  const done = ok => { clearTimeout(timer); a.removeEventListener('timeupdate', check); res(ok); };
  const timer = setTimeout(() => done(a.currentTime > t0 + .3), ms);
  a.addEventListener('timeupdate', check);
});
// on → resolves true once the music actually plays (false when the browser still wants a click first)
function setSound(on) {
  soundOn = on;
  let started = Promise.resolve(false);
  if (on) {
    player?.ensureSrc();
    bgm.volume = volume();
    // SoundCloud's player can report a start and then stop at once when the browser has not allowed sound yet: the music
    // only counts as started if it is still playing a moment later (otherwise the first click on the page starts it)
    // (the test is whether the song's position moves: SoundCloud also reports short pauses while it buffers)
    started = bgm.play().then(() => moving(bgm, 4000)).then(ok => { if (!ok && soundOn) throw new Error('blocked'); return true; })
      .catch(() => { if (!soundOn) return false; soundOn = false; bgm.pause(); setSoundLabel(); floatSound(); return false; });
  } else bgm.pause();
  setSoundLabel();
  floatSound();
  return started;
}
// switching to another tab or app pauses the music; coming back resumes it (only if it was playing before)
let pausedByHide = false;
// (whatever started the song: the sound button, or the label's own play button, which leaves the sound switch alone;
// and the pause is sent even when the player last reported a pause, so a stale state cannot leave it playing)
const onHide = () => { if (!bgm.paused) pausedByHide = true; if (bgm.getAttribute('src')) bgm.pause(); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) onHide();
  else if (pausedByHide) { pausedByHide = false; bgm.play().catch(() => {}); }
});
addEventListener('pagehide', onHide);
addEventListener('freeze', onHide);
addEventListener('blur', () => { if (document.hidden) onHide(); });
// phones: the player is a small strip; a tap on it opens the volume, switches and credit, a tap elsewhere closes them
const soundBox = $('.sound-ctl');
document.addEventListener('click', e => {
  if (!soundBox || !matchMedia('(max-width: 40rem)').matches) return;
  const inside = e.target.closest('.sound-ctl');
  if (inside && e.target.closest('.np') && !e.target.closest('a, button, input')) soundBox.classList.toggle('open');
  else if (!inside) soundBox.classList.remove('open');
});
soundBtn?.addEventListener('click', () => {
  disarm();
  store.set('megulit-sound', soundOn ? '0' : '1');   // the visitor's own choice wins from now on
  setSound(!soundOn);
});
// Music on by default (at 20%), unless this visitor turned it off before or asked to save data. Browsers only allow
// sound after the visitor has interacted with the page, so when the first try is refused it starts on the first
// click, tap or key press anywhere (not on the sound button, which makes its own choice).
const firstTouch = e => {
  if (e.target.closest?.('.js-sound')) return;
  disarm();
  if (!soundOn) setSound(true);
};
const disarm = () => { for (const t of ['pointerdown', 'keydown', 'touchend']) removeEventListener(t, firstTouch, true); };
if (soundBtn && store.get('megulit-sound') !== '0' && !navigator.connection?.saveData) {
  introShown.then(() => setSound(true)).then(ok => {
    if (!ok) for (const t of ['pointerdown', 'keydown', 'touchend']) addEventListener(t, firstTouch, true);
  });
}

// Steps: the line over them fills with the scroll, from the first step to the last, and each number lights up as the
// line reaches it (both ways, so scrolling back up empties it again).
const steps = $('.steps');
if (steps && !reduce) {
  const items = $$('li', steps);
  steps.classList.add('js-steps');
  let queued = false;
  const paint = () => {
    queued = false;
    const r = steps.getBoundingClientRect(), H = innerHeight;
    const p = Math.min(1, Math.max(0, (H * .85 - r.top) / (H * .45)));
    steps.style.setProperty('--fill', p.toFixed(3));
    items.forEach((li, i) => li.classList.toggle('lit', p >= (i + .35) / items.length));
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(paint); } }, { passive: true });
  addEventListener('resize', paint);
  paint();
}

// Full-size view: a screenshot card opens its large original, a clip card or feature clip opens the clip itself.
const lightbox = $('.lightbox');
if (lightbox && typeof lightbox.showModal === 'function') {
  const body = $('.lb-body', lightbox), cap = $('.lb-cap', lightbox);
  const big = src => {
    const m = src.match(/^(.*\/assets\/img\/[a-z-]+?)-(?:720|800)\.webp$/);
    if (m) return { img: m[1] + (/auto-update$/.test(m[1]) ? '-1600.webp' : '-1360.webp') };
    const c = src.match(/^(.*\/assets\/clips\/[a-z-]+)\.webp$/);
    if (c) return { video: c[1] + '.mp4', poster: src };
    return { img: src };
  };
  const open = (what, caption) => {
    let el;
    if (what.video) {
      el = document.createElement('video');
      Object.assign(el, { src: what.video, poster: what.poster || '', muted: true, loop: true, autoplay: true, playsInline: true, controls: true });
    } else {
      el = document.createElement('img');
      el.alt = caption || '';
      el.src = what.img;
      el.onerror = () => { if (what.fallback && el.src !== what.fallback) el.src = what.fallback; };
    }
    body.replaceChildren(el);
    cap.textContent = caption || '';
    lightbox.showModal();
  };
  document.addEventListener('click', e => {
    const card = e.target.closest('.hp-card, .feat-item');
    if (!card) return;
    const cap1 = card.querySelector('figcaption')?.textContent.trim() || $('.ft[aria-selected="true"] .ft-t')?.textContent.trim() || '';
    const v = card.querySelector('video');
    if (v) { open({ video: v.dataset.src || v.currentSrc, poster: v.poster }, cap1); return; }
    const img = card.querySelector('img');
    if (img) open({ ...big(img.getAttribute('src')), fallback: img.currentSrc || img.src }, cap1);
  });
  const close = () => { lightbox.close(); };
  $('.lb-close', lightbox).addEventListener('click', close);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });
  lightbox.addEventListener('close', () => body.replaceChildren());
}

// Back to top: shows once the first screen is behind you.
const toTop = $('.to-top');
if (toTop) {
  const show = () => toTop.classList.toggle('on', scrollY > innerHeight * .9);
  show();
  addEventListener('scroll', show, { passive: true });
  toTop.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
}

// The top bar turns transparent over the hero.
const topBar = $('.top'), hero = $('.hero');
if (topBar && hero) {
  const over = () => topBar.classList.toggle('over', hero.getBoundingClientRect().bottom > topBar.offsetHeight + 8);
  over();
  addEventListener('scroll', over, { passive: true });
}

// 3D parallax: copy, specimen and the magic circle lean toward the pointer.
if (hero && finePointer && !reduce) {
  const copy = $('.hero-type'), spec = $('.hero-vert'), circle = $('.hero-media');
  let raf = 0;
  hero.addEventListener('pointermove', e => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
      copy?.style.setProperty('--ry', `${x * 4}deg`); copy?.style.setProperty('--rx', `${-y * 3}deg`);
      spec?.style.setProperty('--ry', `${x * -10}deg`); spec?.style.setProperty('--rx', `${y * 7}deg`);
      circle?.style.setProperty('--px', `${x * -24}px`); circle?.style.setProperty('--py', `${y * -18}px`);
    });
  });
  hero.addEventListener('pointerleave', () => {
    for (const el of [copy, spec]) { el?.style.setProperty('--rx', '0deg'); el?.style.setProperty('--ry', '0deg'); }
    circle?.style.setProperty('--px', '0px'); circle?.style.setProperty('--py', '0px');
  });
}
if (finePointer && !reduce) {
  for (const box of $$('.tilt-card')) {
    box.addEventListener('pointermove', e => {
      const r = box.getBoundingClientRect();
      box.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - .5) * 8}deg`);
      box.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - .5) * -6}deg`);
    });
    box.addEventListener('pointerleave', () => { box.style.setProperty('--rx', '0deg'); box.style.setProperty('--ry', '0deg'); });
  }
  for (const el of $$('.spot')) el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
}

// Feature clips from the promo video: loaded and played only while on screen; posters only when motion is reduced.
if (!reduce) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) { clearTimeout(v._rel); if (!v.getAttribute('src')) v.src = v.dataset.src; v.play().catch(() => {}); }
      else { v.pause(); releaseLater(v); }
    }
  }, { rootMargin: '120px 0px' });
  for (const v of $$('video.clip')) if (!v.closest('.feat-item')) io.observe(v);
}

// Two bands in the two poles. Paper band: what MeguLit does, in Japanese with a small lowercase gloss. Black band:
// real lines from the game in the clips, numbered like a script. Two copies make the loop seamless; the bands speak
// Japanese in every UI language.
const TICK_FEATURES = [['埋め込み', 'embed'], ['ふりがな', 'furigana'], ['クリックで辞書', 'click to look up'], ['Anki カード', 'anki'], ['復習', 'review'], ['五十音', 'kana'], ['学習統計', 'stats'], ['会話ログ', 'backlog'], ['AI 解説', 'explain']];
const TICK_LINES = ['雪に埋もれた…僕の手。', 'それが、何かを掴んでいた。', '彼女の顔を覆う雪を払う。', '僕はこんなところで何をしているのだろう…。', '今なお、それは降り続け、', 'そう。雪だ。'];
function fillTicker() {
  const make = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; };
  const fill = (el, items) => {
    if (!el) return;
    const once = items.flatMap(([main, sub], k) => {
      const item = document.createElement('span');
      item.className = 'tk-item';
      if (el.classList.contains('js-tk-b')) item.append(make('b', 'tk-no', String(k + 1).padStart(2, '0')));
      item.append(make('span', 'tk-jp', main));
      if (sub) item.append(make('small', 'tk-sub', sub));
      return [item, make('i', 'tk-sep', '')];
    });
    el.replaceChildren(...once, ...once.map(n => n.cloneNode(true)));
  };
  fill($('.js-tk-a'), TICK_FEATURES);
  fill($('.js-tk-b'), TICK_LINES.map(l => [l]));
}

if (lang !== 'zh') applyLang(lang);
else { splitKinetic(); fillTicker(); setSoundLabel(); }

// Motion layer (anime.js). If it cannot load, a CSS fallback shows everything after a moment.
// Warm-up: while the entrance plays (or right away when it is skipped), fetch everything below the fold so nothing pops
// in later. Fonts and images first; the clips one after another once the hero video has a head start. Skipped when the
// visitor asked to save data.
function warmUp() {
  if (navigator.connection?.saveData) return;
  try { document.fonts.forEach(f => { if (f.status === 'unloaded') f.load().catch(() => {}); }); } catch {}
  for (const img of $$('img[loading="lazy"]')) { img.loading = 'eager'; img.decode?.().catch(() => {}); }
  if (reduce) return;
  // the clips go into the browser cache only (a video element holding a file keeps it, and a decoder, in memory)
  const clips = [...new Set($$('video.clip').map(v => v.dataset.src).filter(Boolean))];
  const next = () => {
    const url = clips.shift();
    if (!url) return;
    fetch(url, { priority: 'low' }).then(r => r.blob()).catch(() => {}).finally(next);
  };
  let started = false;
  const begin = () => { if (!started) { started = true; next(); } };
  if (video && video.getAttribute('src') && video.readyState < 3) { video.addEventListener('canplay', begin, { once: true }); setTimeout(begin, 1500); }
  else begin();
}
introShown.then(warmUp);
import('./fx.js').then(m => m.run({ reduce, finePointer })).catch(() => {});
loadRelease();
loadEngines();
loadReleases();
