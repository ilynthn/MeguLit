// SPDX-License-Identifier: GPL-3.0-or-later
// NetEase Cloud Music audio, for visitors in mainland China, where SoundCloud does not load. Each song streams from
// NetEase's own public song link (music.163.com/song/media/outer/url), the free standard-quality version; the site
// hosts no audio. It is a plain <audio> element, so seeking, the lyrics and the beats work as with any file.
// Every song plays 32 dB down, like the SoundCloud player: the volume the page sets is multiplied by 10^(-32/20).

const GAIN = Math.pow(10, -32 / 20);
const VOLUME = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');

export const neUrl = id => `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
export const nePage = id => `https://music.163.com/#/song?id=${id}`;

// SoundCloud is out of reach from mainland China; the time zone is the cheap, private way to tell
export const inChina = () => {
  // ?music=ne / ?music=sc in the address picks the source by hand (to try the NetEase player from outside China)
  try { const m = new URLSearchParams(location.search).get('music'); if (m === 'ne') return true; if (m === 'sc') return false; } catch {}
  try { return /^Asia\/(Shanghai|Chongqing|Chungking|Harbin|Urumqi|Kashgar)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return false; }
};

export function neAudio() {
  const el = new Audio();
  el.preload = 'auto';
  el.referrerPolicy = 'no-referrer';
  let v = 1;
  Object.defineProperty(el, 'volume', { get: () => v, set: x => { v = x; VOLUME.set.call(el, Math.max(0, Math.min(1, x * GAIN))); } });
  el.volume = 1;
  el.source = 'ne';
  return el;
}
