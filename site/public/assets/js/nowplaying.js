// SPDX-License-Identifier: GPL-3.0-or-later
// Background-music player. The library is assets/audio/playlist.json (built by site/tools/add-song.py): every track is a
// song on its artist's SoundCloud page (played through SoundCloud's embedded player, see sc.js), with an optional
// <id>.lrc (timed lyrics, Chinese translation lines already removed) and <id>.beats.json made from a local copy. While a song plays, a label beside the sound control shows its title, artist, the current lyric line
// (arriving character by character), play/pause, previous/next, a seek bar, two switches and the song's credit.
// Every element marked .js-bgm-credit (the footer) shows the current song's credit, in the page language.

import { neUrl, nePage } from './ne.js';

const pageLang = () => (document.documentElement.lang || 'zh').slice(0, 2);
const base = new URL('../audio/', import.meta.url);
const FALLBACK = { id: 'blxty-ft-orchid-awful', sc: 'https://soundcloud.com/blxty/awful', ne: 1808181016, lyrics: true, trim: 0 };
const a = (href, text) => { const el = document.createElement('a'); el.href = href; el.textContent = text; el.rel = 'noopener'; el.target = '_blank'; return el; };
const mmss = s => (Number.isFinite(s) ? `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '--:--');

let listPromise = null;
const getList = () => listPromise || (listPromise = fetch(new URL('playlist.json', base)).then(r => r.json()).catch(() => ({ text: {}, tracks: [] })));
let current = null;
let viaNe = false;     // true when the songs come from NetEase Cloud Music (visitors in mainland China, see ne.js)   // the track playing now (or about to), shared with the footer credit

// author · album (label) · licence, as nodes with links
function creditNodes(m, text) {
  const t = text?.[pageLang()] || text?.zh || {};
  const out = [];
  const sep = () => out.push(document.createTextNode(' · '));
  if (m.artist) out.push(document.createTextNode(`${t.by || 'by'} `), m.artistUrl ? a(m.artistUrl, m.artist) : document.createTextNode(m.artist));
  if (m.album) { if (out.length) sep(); out.push(document.createTextNode(`${t.from || 'from'} `), m.albumUrl ? a(m.albumUrl, `${m.album}${m.label ? ` (${m.label})` : ''}`) : document.createTextNode(m.album)); }
  if (m.license) { if (out.length) sep(); out.push(m.licenseUrl ? a(m.licenseUrl, m.license) : document.createTextNode(m.license)); }
  if (viaNe && m.ne) { if (out.length) sep(); out.push(a(nePage(m.ne), t.listenNe || 'NetEase Cloud Music')); }
  else if (m.sc) { if (out.length) sep(); out.push(a(m.sc, t.listen || 'SoundCloud')); }
  return out;
}

// the footer credit: the current song, refilled on a track or language change
export function bgmCredit() {
  const fill = async () => {
    const pl = await getList();
    const m = current || pl.tracks[0];
    if (!m) return;
    const t = pl.text?.[pageLang()] || pl.text?.zh || {};
    for (const el of document.querySelectorAll('.js-bgm-credit')) {
      const title = document.createElement('i');
      title.textContent = m.title;
      el.replaceChildren(document.createTextNode(`${t.music || 'Music'}: `), title, document.createTextNode(' — '), ...creditNodes(m, pl.text));
    }
  };
  fill();
  addEventListener('megulit:lang', fill);
  addEventListener('megulit:track', fill);
}

const parseLrc = text => {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const t of tags) out.push({ at: Number(t[1]) * 60 + Number(t[2]), text: words });
  }
  return out.sort((x, y) => x.at - y.at);
};

const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const UI = {
  zh: { lyrics: '歌词', bg: '背景歌词', play: '播放', pause: '暂停', prev: '上一首', next: '下一首', seek: '播放进度' },
  ja: { lyrics: '歌詞', bg: '背景に歌詞', play: '再生', pause: '一時停止', prev: '前の曲', next: '次の曲', seek: '再生位置' },
  en: { lyrics: 'Lyrics', bg: 'Lyrics in background', play: 'Play', pause: 'Pause', prev: 'Previous', next: 'Next', seek: 'Seek' },
};
const ICON = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M19 5 9 12l10 7z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19.5 12z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z"/></svg>',
};

// background: an object with say(text) and clear() (the kana layers); it gets every lyric line while "背景歌词" is on.
// Returns the player: ensureSrc() points the audio at the current track (call it before the first play()).
export function nowPlaying(audio, host, { reduce = false, background = null } = {}) {
  viaNe = audio.source === 'ne';
  const box = document.createElement('div');
  box.className = 'np';
  box.hidden = true;
  box.setAttribute('aria-live', 'off');
  box.innerHTML = '<span class="np-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="np-meta"><b class="np-title"></b><span class="np-artist"></span></span>'
    + '<p class="np-lyric" lang="ja" aria-hidden="true"></p>'
    + `<div class="np-ctl"><div class="np-btns"><button type="button" class="np-b" data-a="prev">${ICON.prev}</button><button type="button" class="np-b np-play" data-a="play">${ICON.pause}</button><button type="button" class="np-b" data-a="next">${ICON.next}</button></div>`
    + '<div class="np-bar"><span class="np-now">00:00</span><input class="np-seek" type="range" min="0" max="1000" value="0"><span class="np-dur">--:--</span></div>'
    + '<p class="np-switches"><button type="button" class="np-sw" data-sw="lyrics"></button><button type="button" class="np-sw" data-sw="bg"></button></p></div><p class="np-credit"></p>';
  host.append(box);
  // SoundCloud's own mini player is the label's last row: the source of the music, left exactly as SoundCloud draws it
  // The frame itself never moves in the page: moving an iframe reloads it (the song would restart and the widget's
  // events would be lost). It lives in a fixed dock in <body>, laid over the empty strip at the bottom of the label
  // whenever that strip is showing, and is moved off screen otherwise.
  if (audio.frame) {
    const slot = document.createElement('div'); slot.className = 'np-src'; box.append(slot);
    const dock = document.createElement('div'); dock.className = 'sc-dock'; dock.append(audio.frame); document.body.append(dock);
    // the slot's opacity is read every 8th frame only (reading styles every frame makes a lot of garbage)
    let n = 0, opaque = false;
    const place = () => {
      if (!(n++ & 7)) opaque = getComputedStyle(slot).opacity > .5;
      const r = slot.getBoundingClientRect(), shown = !box.hidden && r.width > 40 && r.height > 12 && opaque;
      dock.classList.toggle('away', !shown);
      if (shown) { dock.style.left = `${r.left}px`; dock.style.top = `${r.top + r.height - 32}px`; dock.style.width = `${r.width}px`; }
      requestAnimationFrame(place);
    };
    requestAnimationFrame(place);
    // the dock sits outside the label, so the label's hover state counts the dock too: otherwise the pointer on
    // SoundCloud's strip would close the label, the strip would slide away, the label would reopen, and so on
    let hovT = 0;
    const hov = on => { clearTimeout(hovT); if (on) host.classList.add('hov'); else hovT = setTimeout(() => host.classList.remove('hov'), 180); };
    for (const el of [host, dock]) { el.addEventListener('pointerenter', () => hov(true)); el.addEventListener('pointerleave', () => hov(false)); }
  }
  const $ = s => box.querySelector(s);
  const title = $('.np-title'), artist = $('.np-artist'), lyric = $('.np-lyric'), credit = $('.np-credit');
  const playBtn = $('.np-play'), seek = $('.np-seek'), nowEl = $('.np-now'), durEl = $('.np-dur');
  let pl = { text: {}, tracks: [] }, idx = 0, lines = [], cur = -1, hold = false, seeking = false;
  const ui = () => UI[pageLang()] || UI.zh;

  // switches, remembered per browser: lyrics in this label, and lyrics on the page's background layers
  const on = { lyrics: store.get('megulit-lyrics') !== '0', bg: store.get('megulit-bg-lyrics') !== '0' && Boolean(background) && !reduce };
  const switches = box.querySelectorAll('.np-sw');
  const paintUi = () => {
    switches.forEach(b => { const k = b.dataset.sw; b.textContent = ui()[k]; b.setAttribute('aria-pressed', String(on[k])); b.hidden = k === 'bg' && (!background || reduce); });
    box.querySelectorAll('.np-b').forEach(b => b.setAttribute('aria-label', b.dataset.a === 'play' ? (audio.paused ? ui().play : ui().pause) : ui()[b.dataset.a]));
    seek.setAttribute('aria-label', ui().seek);
    if (current) credit.replaceChildren(...creditNodes(current, pl.text));
  };
  addEventListener('megulit:lang', paintUi);
  switches.forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.sw;
    on[k] = !on[k];
    store.set(k === 'bg' ? 'megulit-bg-lyrics' : 'megulit-lyrics', on[k] ? '1' : '0');
    box.classList.toggle('lyrics-off', !on.lyrics);
    if (k === 'bg' && !on.bg) background?.clear();
    if (on[k] && cur >= 0 && lines[cur]) (k === 'bg' ? background?.say(lines[cur].text) : show(lines[cur].text));
    paintUi();
  }));
  box.classList.toggle('lyrics-off', !on.lyrics);

  // every line still on screen leaves; lines already leaving are dropped at once, so at most one is ever fading out
  const show = text => {
    lyric.querySelectorAll('.np-line.out').forEach(n => n.remove());
    lyric.querySelectorAll('.np-line').forEach(old => { if (reduce) { old.remove(); return; } old.classList.add('out'); setTimeout(() => old.remove(), 450); });
    if (!text || !on.lyrics) return;
    const line = document.createElement('span');
    line.className = 'np-line';
    [...text].forEach((ch, i) => { const c = document.createElement('span'); c.textContent = ch; c.style.setProperty('--i', i); line.append(c); });
    lyric.append(line);
  };

  // ---- tracks -------------------------------------------------------------------------------------------------------------
  const ready = getList().then(list => { pl = list; if (!pl.tracks.length) pl.tracks = [{ ...FALLBACK, title: '' }]; current = pl.tracks[idx]; paintTrack(); });
  const srcOf = t => (viaNe ? t.ne && neUrl(t.ne) : t.sc) || new URL(`${t.id}.mp3`, base).href;
  const paintTrack = () => {
    const t = pl.tracks[idx];
    current = t;
    title.textContent = t.title || ''; artist.textContent = t.artist || ''; artist.hidden = !t.artist;
    audio.loop = pl.tracks.length === 1;
    audio.dataset.track = t.id;
    paintUi();
  };
  const loadLyrics = async t => {
    lines = []; cur = -1; show(''); background?.clear();
    if (!t.lyrics) { box.classList.remove('has-lyrics'); return; }
    try { const r = await fetch(new URL(`${t.id}.lrc`, base)); if (r.ok && current === t) lines = parseLrc(await r.text()); } catch {}
    box.classList.toggle('has-lyrics', lines.length > 0);
  };
  let lyricsFor = null;
  // while one song gives way to the next, the player reports a pause: the label stays open through it (closing it
  // would also fold the floating player under the pointer, which was just on the next button)
  let switching = 0;
  const go = (i, play = true) => {
    if (play && !box.hidden) { clearTimeout(switching); switching = setTimeout(() => { switching = 0; if (audio.paused && !hold) box.hidden = true; }, 6000); }
    idx = (i + pl.tracks.length) % pl.tracks.length;
    paintTrack();
    audio.trim = current.trim || 0;
    audio.src = srcOf(current);
    loadLyrics(current); lyricsFor = current;
    dispatchEvent(new CustomEvent('megulit:track', { detail: { id: current.id } }));
    if (play) { hold = false; audio.play().catch(() => {}); }
  };
  const player = {
    ensureSrc() { if (!audio.getAttribute('src')) { const t = pl.tracks[idx] || FALLBACK; audio.trim = t.trim || 0; audio.src = srcOf(t); audio.dataset.track = t.id; } },
    next: () => go(idx + 1),
    // "previous" restarts the song when it is a few seconds in, like any player
    prev: () => { if (audio.currentTime > 3 || pl.tracks.length === 1) jump(0).catch(() => {}); else go(idx - 1); },
  };
  audio.addEventListener('ended', () => { if (pl.tracks.length > 1) player.next(); });

  // ---- controls -----------------------------------------------------------------------------------------------------------
  box.querySelector('.np-ctl').addEventListener('click', e => {
    const b = e.target.closest('.np-b');
    if (!b) return;
    if (b.dataset.a === 'play') { if (audio.paused) { hold = false; audio.play().catch(() => {}); } else { hold = true; audio.pause(); } }
    else player[b.dataset.a]();
  });
  const paintTime = () => {
    const d = audio.duration, t = audio.currentTime;
    if (!seeking && Number.isFinite(d) && d > 0) { seek.value = Math.round(t / d * 1000); seek.style.setProperty('--fill', `${t / d * 100}%`); }
    if (!seeking) nowEl.textContent = mmss(t);
    durEl.textContent = mmss(d);
  };
  // The site's static hosting ignores byte ranges, so the browser cannot jump inside a streamed file. The first seek in
  // a song fetches it whole (usually from the cache), switches the audio to that in-memory copy and jumps there.
  const blobs = new Map();
  const jump = async target => {
    const t = current, wasPlaying = !audio.paused;
    const seekable = audio.seekable.length && audio.seekable.end(audio.seekable.length - 1) >= target - .5 && audio.seekable.start(0) <= target;
    if (!seekable && !audio.src.startsWith('blob:')) {
      let url = blobs.get(t.id);
      if (!url) { const r = await fetch(srcOf(t)); url = URL.createObjectURL(await r.blob()); blobs.set(t.id, url); }
      if (current !== t) return;
      hold = true;
      audio.src = url;
      await new Promise(res => audio.addEventListener('loadedmetadata', res, { once: true }));
    }
    audio.currentTime = target; cur = -1;
    if (wasPlaying) { hold = false; audio.play().catch(() => {}); }
  };
  seek.addEventListener('input', () => { seeking = true; const d = audio.duration; if (Number.isFinite(d)) { nowEl.textContent = mmss(seek.value / 1000 * d); seek.style.setProperty('--fill', `${seek.value / 10}%`); } });
  seek.addEventListener('change', async () => { const d = audio.duration; if (Number.isFinite(d)) await jump(seek.value / 1000 * d).catch(() => {}); seeking = false; paintTime(); });
  audio.addEventListener('timeupdate', paintTime);
  audio.addEventListener('loadedmetadata', paintTime);

  let raf = 0;
  const tick = () => {
    raf = 0;
    if (audio.paused) return;
    if (lines.length) {
      const t = audio.currentTime;
      let i = cur;
      if (i < 0 || t < lines[i].at || (lines[i + 1] && t >= lines[i + 1].at)) { i = -1; for (let k = 0; k < lines.length && lines[k].at <= t; k++) i = k; }
      if (i !== cur) { cur = i; const text = i >= 0 ? lines[i].text : ''; show(text); if (on.bg) background?.say(text); }
    }
    raf = requestAnimationFrame(tick);
  };
  audio.addEventListener('play', async () => {
    await ready;
    if (lyricsFor !== current) { lyricsFor = current; await loadLyrics(current); }
    box.hidden = false; hold = false; clearTimeout(switching); switching = 0;
    playBtn.innerHTML = ICON.pause; paintUi();
    cur = -1; if (!raf) raf = requestAnimationFrame(tick);
  });
  // a pause from this label keeps it open with a play button; sound off (or leaving the page) closes it
  audio.addEventListener('pause', () => {
    playBtn.innerHTML = ICON.play; paintUi();
    show(''); background?.clear(); cur = -1;
    if (!hold && !switching) box.hidden = true;
  });
  audio.addEventListener('seeked', () => { cur = -1; });
  return player;
}
