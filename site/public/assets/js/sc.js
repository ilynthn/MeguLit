// SPDX-License-Identifier: GPL-3.0-or-later
// SoundCloud audio: the songs stream from the artists' own SoundCloud pages through SoundCloud's official embedded player
// (https://developers.soundcloud.com/docs/api/html5-widget); the site hosts no audio. This wraps the widget in the small
// part of the HTMLAudioElement interface the player uses (src, play/pause, currentTime, duration, volume, events), so
// the lyrics, the beats and the controls work unchanged. The widget stays visible inside the player label (SoundCloud's
// own mini player, with its link), as SoundCloud asks.
// Every song plays 32 dB down: the slider's volume is multiplied by 10^(-32/20) and by the song's trim (playlist.json).

const API = 'https://w.soundcloud.com/player/api.js';
const GAIN = Math.pow(10, -32 / 20);
let apiPromise = null;
const loadApi = () => apiPromise || (apiPromise = new Promise((res, rej) => {
  if (window.SC?.Widget) { res(window.SC); return; }
  const s = document.createElement('script'); s.src = API; s.async = true;
  s.onload = () => res(window.SC); s.onerror = rej; document.head.append(s);
}));
const OPTS = {
  color: '#c8323c', auto_play: 'false', hide_related: 'true', show_comments: 'false', show_user: 'true', show_reposts: 'false', show_teaser: 'false', visual: 'false',
};
const LOAD_OPTS = { ...Object.fromEntries(Object.entries(OPTS).map(([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : v])), color: OPTS.color.slice(1) };
const playerUrl = url => 'https://w.soundcloud.com/player/?' + new URLSearchParams({ url, ...OPTS });

export class ScAudio extends EventTarget {
  static _makeFrame() {
    const f = document.createElement('iframe');
    f.className = 'sc-frame';
    f.title = 'SoundCloud';
    f.allow = 'autoplay; encrypted-media';
    f.height = '20'; f.scrolling = 'no'; f.frameBorder = '0';
    return f;
  }
  constructor() {
    super();
    this.frame = ScAudio._makeFrame();
    this.dataset = {};
    this._src = ''; this._paused = true; this._time = 0; this._duration = NaN; this._volume = 1; this._trim = 0; this.loop = false;
    this._widget = null; this._ready = null; this._wantPlay = false; this._asleep = false; this._resume = 0; this._nap = 0;
  }
  // Memory: SoundCloud's player is a whole page in its own process (about 90 MB). Paused for a while (sound off, the
  // tab hidden, a pause), it is unloaded; the next play loads it again and goes on from the same place.
  _sleepLater() { clearTimeout(this._nap); this._nap = setTimeout(() => { if (this._paused && this._widget) this._sleep(); }, 15000); }
  _sleep() {
    this._resume = this._time; this._asleep = true;
    this._widget = null; this._ready = null;
    // the frame goes away entirely (SoundCloud's widget object belongs to it); a new one takes its place on waking
    this._parent = this.frame.parentNode; this._next = this.frame.nextSibling; this.frame.remove();
  }
  _wake() { if (this._asleep && this._src) { this._asleep = false; this._ready = this._bind(this._src); } }
  getAttribute(n) { return n === 'src' ? this._src || null : null; }
  get src() { return this._src; }
  set src(url) {
    if (url === this._src) return;
    this._src = url; this._time = 0; this._duration = NaN; this._resume = 0;
    if (this._asleep) return;   // loaded on the next play
    // every song gets a fresh player: SoundCloud's own page grows while it plays (about 90 MB to 160 MB a song), and a
    // new frame starts small again
    if (this._widget) { if (!this._paused) { this._paused = true; this.dispatchEvent(new Event('pause')); } this._sleep(); this._asleep = false; this._resume = 0; }
    this._ready = this._bind(url);
  }
  get paused() { return this._paused; }
  get currentTime() { return this._time; }
  set currentTime(t) { this._time = t; if (this._asleep) { this._resume = t; return; } this._ready?.then(w => { w.seekTo(Math.max(0, t) * 1000); this.dispatchEvent(new Event('seeked')); }); }
  get duration() { return this._duration; }
  get seekable() { const d = this._duration; return Number.isFinite(d) ? { length: 1, start: () => 0, end: () => d } : { length: 0, start: () => 0, end: () => 0 }; }
  // SoundCloud's volume is 0-100; at -32 dB the levels are around 1, so whole numbers would be far too coarse
  _level() { return Math.round(this._volume * GAIN * Math.pow(10, this._trim / 20) * 10000) / 100; }
  get trim() { return this._trim; }
  set trim(x) { this._trim = Number(x) || 0; this._ready?.then(w => w.setVolume(this._level())); }
  get volume() { return this._volume; }
  set volume(v) { this._volume = v; this._ready?.then(w => w.setVolume(this._level())); }
  play() {
    this._wantPlay = true; clearTimeout(this._nap); this._wake();
    this._ready?.then(w => w.setVolume(this._level()));
    if (!this._ready) return Promise.reject(new Error('no source'));
    return this._ready.then(w => new Promise((res, rej) => {
      // the widget reports PLAY when it really starts; a browser that wants a click first never does
      const ok = () => { clearTimeout(t); res(); }, t = setTimeout(() => { this.removeEventListener('play', ok); rej(new Error('not allowed')); }, 4000);
      this.addEventListener('play', ok, { once: true });
      w.play();
    }));
  }
  pause() { this._wantPlay = false; this._ready?.then(w => w.pause()); this._sleepLater(); }

  async _bind(url) {
    const SC = await loadApi();
    if (!this._widget) {
      const resume = this._resume; this._resume = 0;
      if (this._parent && !this.frame.isConnected) { this.frame = ScAudio._makeFrame(); this._parent.insertBefore(this.frame, this._next?.parentNode === this._parent ? this._next : null); }
      this.frame.src = playerUrl(url);
      if (!this.frame.isConnected) document.body.append(this.frame);
      const w = SC.Widget(this.frame);
      const E = SC.Widget.Events;
      await new Promise(res => w.bind(E.READY, res));
      // waking up: back to where it was, once it plays
      if (resume > 1) { let once = true; w.bind(E.PLAY, () => { if (once) { once = false; w.seekTo(resume * 1000); } }); }
      w.bind(E.PLAY, () => {
        // SoundCloud resets its volume to 100% on a reload or a new song: ours goes back on at every start
        w.setVolume(this._level());
        // the length is only reliable once a sound plays
        w.getDuration(ms => { if (ms > 0 && ms / 1000 !== this._duration) { this._duration = ms / 1000; this.dispatchEvent(new Event('loadedmetadata')); } });
        if (this._paused) { this._paused = false; this.dispatchEvent(new Event('play')); }
      });
      w.bind(E.PAUSE, () => { if (!this._paused) { this._paused = true; this.dispatchEvent(new Event('pause')); this._sleepLater(); } });
      w.bind(E.FINISH, () => {
        this._paused = true; this.dispatchEvent(new Event('pause'));
        if (this.loop) { w.seekTo(0); w.play(); } else this.dispatchEvent(new Event('ended'));
      });
      w.bind(E.PLAY_PROGRESS, e => { this._time = e.currentPosition / 1000; this.dispatchEvent(new Event('timeupdate')); });
      this._widget = w;
    } else {
      // a new song: the widget stops the old one; it starts the new one itself when a play was asked for
      const go = this._wantPlay;
      if (!this._paused) { this._paused = true; this.dispatchEvent(new Event('pause')); }
      // load() wants real booleans: the strings of the URL form ('false') read as true here, and the player came back
      // in its large artwork layout
      await new Promise(res => this._widget.load(url, { ...LOAD_OPTS, auto_play: go, callback: res }));
    }
    const w = this._widget;
    this._duration = await new Promise(res => w.getDuration(ms => res(ms > 0 ? ms / 1000 : NaN)));
    w.setVolume(this._level());
    this.dispatchEvent(new Event('loadedmetadata'));
    return w;
  }
}
