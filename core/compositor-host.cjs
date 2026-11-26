// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Text architecture ② in the running reader (docs/text-architecture-compositor.md). Setting 文字绘制 (textRenderer):
   'overlay' (default) keeps the reader overlay window; 'compositor' starts MeguLitCompositor.exe for the bound game
   window and feeds it:
     - ①'s hookGlyphDots events (line text, per-character metrics) and ③'s hookCharRects (cells of engines without dots),
     - the reader's translation of each line (Reader.message → annotate), the menu choices (choice locate),
     - the 显示内容 setting (display): chinese/english = translation only in the game's text area, japanese = Japanese only.
   While the compositor runs for the game it owns all of the game's text: the reader overlay's dialogue layer stays off
   (compositorDrawing) for every line, also lines the compositor cannot place (those keep the game's own drawing), so
   text is never doubled. Only a compositor that cannot capture ('fallback', or exit) gives the text back to the
   overlay; a game whose capture failed stays on the overlay until it restarts. */
const path = require('node:path');
const NAME_PLATE = /^\s*[\[【［][^\]】］]{1,16}[\]】］]\s*/;
const { CaptureCompositor, strip, rubyToStripped } = require('../services/capture-compositor.cjs');

/* ③ records: game-screen px → client px (engine viewport, else aspect fit centred), as core/text-paths.cjs does. */
function rectsToClient(rec, cw, ch) {
  let [vx, vy, vw, vh] = rec.viewport || [0, 0, 0, 0];
  if (!(vw > 0 && vh > 0)) {
    if (rec.sw > 0 && rec.sh > 0 && cw > 0 && ch > 0) { const k = Math.min(cw / rec.sw, ch / rec.sh); vw = rec.sw * k; vh = rec.sh * k; vx = (cw - vw) / 2; vy = (ch - vh) / 2; }
    else { vx = 0; vy = 0; vw = cw || rec.sw; vh = ch || rec.sh; }
  }
  const kx = rec.sw > 0 ? vw / rec.sw : 1, ky = rec.sh > 0 ? vh / rec.sh : 1;
  return (rec.rects || []).map(([x, y, w, h]) => [Math.round(vx + x * kx), Math.round(vy + y * ky), Math.round(w * kx), Math.round(h * ky)]);
}

class CompositorHost {
  constructor({ root, onEvent = () => {}, make } = {}) {
    this.root = root; this.onEvent = onEvent;
    this.make = make || (opts => new CaptureCompositor({ root, ...opts }));
    this.cc = null; this.hwnd = ''; this.failedFor = ''; this.lines = new Map(); this.drawing = false; this.mode = ''; this.recent = new Map(); this.choiceItems = [];
    this.client = [0, 0];
  }
  trace(line) { try { require('node:fs').appendFileSync(path.join(this.root || '.', 'logs', 'compositor.log'), new Date().toISOString() + ' ' + line + '\n'); } catch {} }
  // 文字显示 is one choice for the whole app, not a per-game style: read from the global gal-preferences.json (the per-game
  // style profile merged into the reader's preferences would otherwise bring back the default).
  wanted(preferences) {
    /* 2026-11-14 owner stopped the capture compositor (stole clicks/focus, marks showed): the reader overlay places the text
       instead (core/overlay-placement.cjs). Kept for tests only: MEGULIT_CAPTURE_COMPOSITOR=1. */
    if (process.env.MEGULIT_CAPTURE_COMPOSITOR !== '1') return false;
    if (this.root) try {
      const fs = require('node:fs'), file = path.join(this.root, 'data', 'config', 'gal-preferences.json'), t = fs.statSync(file).mtimeMs;
      if (t !== this.settingTime) { this.settingTime = t; this.setting = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')).textRenderer; }
      if (this.setting) return this.setting === 'compositor';
    } catch {}
    return preferences?.textRenderer === 'compositor';
  }
  // Called with every preferences/state change of the bound game (GalNative.notify).
  configure(preferences, state) {
    const hwnd = String(state?.gameHwnd || ''), identity = hwnd + '|' + String(state?.gameStarted || '');
    if (state?.clientWidth && state?.clientHeight) this.client = [state.clientWidth, state.clientHeight];
    const want = this.wanted(preferences) && state?.bound === true && /^\d{1,19}$/.test(hwnd) && hwnd !== '0' && this.failedFor !== identity;
    const why = !this.wanted(preferences) ? 'setting overlay' : state?.bound !== true ? 'not bound' : !/^\d{1,19}$/.test(hwnd) || hwnd === '0' ? 'no game window' : this.failedFor === identity ? 'capture failed earlier' : 'on';
    if (why !== this.lastWhy) { this.lastWhy = why; this.trace('configure: ' + why + ' hwnd=' + hwnd); }
    if (this.cc && (!want || identity !== this.identity)) this.stop();
    if (!want) return;
    if (!this.cc) {
      let cc = null; cc = this.make({ onEvent: e => { if (cc && cc === this.cc) this.event(e); } }); // events of a stopped instance are stale
      if (!cc.available()) { this.failedFor = identity; this.onEvent({ type: 'compositorState', state: 'missing' }); return; }
      if (!cc.start({ hwnd: Number(hwnd) })) { this.failedFor = identity; return; }
      this.cc = cc; this.identity = identity; this.hwnd = hwnd; this.mode = '';
    }
    const mode = ['chinese', 'english'].includes(preferences?.display) ? 'translation' : preferences?.display === 'japanese' ? 'jp' : 'bilingual';
    if (mode !== this.mode) { this.mode = mode; this.cc.style({ mode, ruby: preferences?.furigana !== false, lookup: true }); }
  }
  // ① / ③ events from HookBridge (GalNative.hookEvent).
  hook(m, table) {
    if (!this.cc || !m) return;
    if (m.type === 'hookTextMarks' && m.path === 'char' && m.state === 'hit') {
      // Text marks on a per-character argument hook (the hook DLL replaces each visible non-ASCII character by 「・」,
      // ASCII stays real): from the first confirmed line on, every line of the stream is a marks line. The hit can come
      // just after its line's text, so that line is sent again as a marks line.
      if (!this.charMarks) { this.charMarks = true; if (this.lastPlain && Date.now() - this.lastPlain.at < 3000) this.charMarksLine(this.lastPlain.m); }
      return;
    }
    if (m.type === 'hookTextMarks' && (m.state === 'paused' || m.state === 'off')) { this.charMarks = false; return; }
    if (m.type === 'hookGlyphDots') {
      if (m.state === 'line') this.remember(Number(m.seq) || 0, String(m.text || ''));
      if (this.charMarks) { if (m.state === 'line') this.charMarksLine(m); return; }
      if (m.state === 'line') this.lastPlain = { m, at: Date.now() };
      this.cc.hookGlyphDots(m);
      // Blind dots (drawn before the line's text arrived) are mapped to characters by HookNative when the line comes:
      // its line table (table) then holds them with their character index.
      if (m.state === 'line' && table && table.seq === m.seq) {
        const blind = (table.dots || []).filter(d => d && d.k === 'b' && Number.isInteger(d.i) && d.i >= 0);
        if (blind.length) this.cc.hookGlyphDots({ type: 'hookGlyphDots', state: 'dots', seq: m.seq, dots: blind });
      }
    } else if (m.type === 'hookTextMarks' && m.state === 'line') {
      // Text marks (④, docs/text-architecture-marks.md): the game draws one centred 「・」/「･」 per visible character of
      // this line; the compositor finds them like dots and places each glyph centred on its mark.
      const text = String(m.text || ''), id = 300000 + (this.markSeq = (this.markSeq || 0) + 1);
      this.remember(id, text);
      this.cc.send({ t: 'line', id, text, expected: Number(m.marks) || [...strip(text).text].length, marks: String(m.mark || 'middle-dot') });
    } else if (m.type === 'hookCharRects') {
      const text = String(m.text || '').replace(/\r?\n/g, ''), id = 100000 + (Number(m.line) || 0);
      this.remember(id, text);
      this.cc.send({ t: 'rects', id, text, rects: rectsToClient(m, this.client[0], this.client[1]), hidden: m.hidden === true });
    }
  }
  // A per-character marks line: only the characters the DLL marks are MeguLit's to draw (ASCII stays the game's own glyph).
  charMarksLine(m) {
    // ASCII the game draws itself (a name's brackets) is kept and sent as "plain" so the compositor places, erases and
    // draws it next to its marked neighbour; an engine code ($X, \X) is dropped with its letter.
    // a leading name plate ([name], 【name】, ［name］) is not marked by the DLL: the game draws it, MeguLit leaves it
    const src = [...String(m.text || '').replace(NAME_PLATE, '')], chars = [], plain = [];
    for (let i = 0; i < src.length; i++) {
      const c = src[i], u = c.codePointAt(0);
      if (c === '$' || c === '\\') { i++; continue; }
      if (u > 0x20 && u < 0x7F) { plain.push(chars.length); chars.push(c); continue; }
      if (u >= 0x80 && u !== 0x3000 && u !== 0x30FB && u !== 0xFEFF && !(u >= 0x2000 && u <= 0x200F) && !(u >= 0xE000 && u <= 0xF8FF)) chars.push(c);
    }
    const marks = chars.length - plain.length;
    if (!marks) return;
    this.cc.lines?.set?.(Number(m.seq) || 0, { text: chars.join('') }); // for word lookup on the drawn line
    this.cc.send({ t: 'line', id: Number(m.seq) || 0, text: chars.join(''), expected: marks, plain, marks: 'middle-dot' });
  }
  remember(id, text) { this.lines.set(id, strip(text).text); if (this.lines.size > 64) this.lines.delete(this.lines.keys().next().value); this.lastId = id; }
  // The reader translated a line: hand the translation to the compositor line that shows it (①'s text may carry more,
  // e.g. variable names before the line; matched on blank-stripped text).
  text(source, translation) {
    if (!this.cc || !translation) return;
    const s = strip(source).text; if (!s) return;
    let id = null;
    for (const [k, v] of [...this.lines.entries()].reverse()) if (v === s || v.includes(s) || (v && s.includes(v))) { id = k; break; }
    if (id !== null) this.cc.annotate({ id, tl: NAME_PLATE.test(String(source || '')) ? String(translation).replace(NAME_PLATE, '').replace(/^\s*[^\s：:「『“"]{1,12}[：:]\s*/, '') : translation });
    // Menu items arrive as text only: their translations come through here like any line (before or after the menu).
    this.recent.set(s, translation); if (this.recent.size > 48) this.recent.delete(this.recent.keys().next().value);
    const item = this.choiceItems.find(x => !x.tl && strip(x.text).text === s);
    if (item) { item.tl = translation; this.cc.choices(this.choiceItems); }
    this.trace('translation ' + (id !== null ? 'for line ' + id : item ? 'for a choice' : 'unmatched: ' + s.slice(0, 24)));
  }
  // The reader's furigana for a line (game ruby first, then context / dictionary readings): [[start, end, reading]] in
  // code points of the reader's text. A per-character marks line had its leading name plate removed: shifted to match.
  ruby(source, list) {
    if (!this.cc || !Array.isArray(list) || !list.length) return;
    const s = strip(source).text; if (!s) return;
    let id = null;
    for (const [k, v] of [...this.lines.entries()].reverse()) if (v === s || v.includes(s) || (v && s.includes(v))) { id = k; break; }
    if (id === null) return;
    let full = String(source), ruby = list;
    const plate = this.charMarks && full.match(NAME_PLATE);
    if (plate) { const n = [...plate[0]].length; full = full.slice(plate[0].length); ruby = list.map(r => [r[0] - n, r[1] - n, r[2]]).filter(r => r[0] >= 0); }
    /* the compositor's line can carry more before the reader's text (a speaker such as "？？"): re-index onto it.
       2026-11-26 (A 组 ruby 错位, found reading the code: every reading after the game's row break sat one character off): the game's line holds its own row breaks and the reader's text does not (or breaks elsewhere), and the positions were
       moved onto the game's line as they were, so each break before a word pushed its reading one character on. Positions are
       counted without blanks on both sides now, the way the compositor counts its cells. */
    const lt = String(this.cc.lines?.get?.(id)?.text || ''), line = strip(lt).text, mine = strip(full).text;
    const found = line ? line.indexOf(mine.slice(0, Math.min(6, mine.length))) : -1, n = found > 0 ? [...line.slice(0, found)].length : 0;
    ruby = rubyToStripped(full, ruby).map(r => [r[0] + n, r[1] + n, r[2]]); full = found >= 0 ? line : mine;
    this.cc.annotate({ id, fullText: full, ruby }); this.trace('ruby for line ' + id + ' spans=' + ruby.length + ' full=' + JSON.stringify(full.slice(0, 30)) + ' line=' + JSON.stringify(String(this.cc.lines?.get?.(id)?.text || '').slice(0, 30)) + ' first=' + JSON.stringify(ruby[0] || null));
  }
  choices(options) {
    if (!this.cc || !Array.isArray(options) || !options.length) return;
    this.choiceItems = options.map(o => typeof o === 'string' ? { text: o } : { text: String(o?.text || o?.source || ''), tl: String(o?.translation || o?.tl || '') });
    for (const x of this.choiceItems) { const tl = !x.tl && this.recent.get(strip(x.text).text); if (tl) x.tl = tl; }
    this.cc.choices(this.choiceItems);
  }
  event(e) {
    if (e.e !== 'stats' && (e.e !== 'line' || e.status !== this.lastStatus)) this.trace('event ' + JSON.stringify(e).slice(0, 300));
    if (e.e === 'line') this.lastStatus = e.status;
    if (e.e === 'fallback') { this.failedFor = this.identity; this.setDrawing(false); this.onEvent({ type: 'compositorState', state: 'fallback', reason: e.reason }); this.stop(); }
    else if (e.e === 'exit') { this.cc = null; this.setDrawing(false); if (e.reason === 'game-closed') { this.identity = ''; this.onEvent({ type: 'compositorState', state: 'gameClosed' }); } } // a launcher window closed: the owner binds the game's next window
    else if (e.e === 'lookup') { const text = String(this.cc?.lines?.get?.(e.id)?.text || ''); if (text) this.onEvent({ type: 'compositorLookup', id: e.id, index: e.index, text, x: e.x, y: e.y }); } // a click on a composited glyph: the reader opens its word card there
    else if (e.e === 'conv') this.onEvent({ type: 'compositorConv', ok: e.ok === true }); // oss-universal conv source: confirm / reject
    else if (e.e === 'ready') { this.setDrawing(true); this.onEvent({ type: 'compositorState', state: 'running' }); }
  }
  setDrawing(v) { if (v === this.drawing) return; this.drawing = v; this.onEvent({ compositorDrawing: v }); }
  stop() { const cc = this.cc; this.cc = null; this.lines.clear(); this.setDrawing(false);const stops=this.stops??=new Set(),next=cc?.stop();if(next){stops.add(next);next.then(()=>stops.delete(next),()=>{});}const result=Promise.all([...stops]);result.catch(()=>{});return result; }
}

module.exports = { CompositorHost, rectsToClient };
