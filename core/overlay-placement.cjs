// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Text architecture, overlay placement (2026-11-14, replaces the capture compositor as the default).
   The sources stop the game drawing the current line (blank glyphs, opacity 0 layers, alpha 0 renderers) and report
   where every character is. This host turns those reports into one `textPlace` message per line for the reader
   overlay (web/reader/modules/text-place.js), which draws MeguLit's Japanese, ruby and translation at exactly those
   boxes and keeps its usual interaction (word card, drag-select, clicks elsewhere go to the game).
   Positions come from the sources only, never from screen pixels:
     - ③ hookCharRects (KiriKiri, Unity, Ren'Py, web): game-screen px + viewport → client px;
     - ① hookGlyphDots records with a cell position (MeguLitFont v4, blank mode): client px of each cell.
   Switched on by 文字显示 = 画进游戏画面 (gal-preferences textRenderer 'compositor'), unless the old capture compositor is
   forced for tests (MEGULIT_CAPTURE_COMPOSITOR=1). */
const fs = require('node:fs'), path = require('node:path');
const { rectsToClient } = require('./compositor-host.cjs');

class OverlayPlacement {
  constructor({ root, send = () => {}, trace = () => {}, replaced = () => false, hidden = () => {}, blanking = () => false, skipping = () => false } = {}) {
    this.hidden = hidden; this.replaced = replaced; this.blanking = blanking; this.skipping = skipping; this.root = root; this.send = send; this.trace = trace; this.client = [0, 0]; this.current = null; this.on = false;
    /* the running game's layered profile (core/profiles), set by gal-native setGameProfile; branches read this.profile.placement.* */
    this.profile = require('./profiles/index.cjs').profileFor({});
  }
  wanted(preferences) {
    if (process.env.MEGULIT_CAPTURE_COMPOSITOR === '1') return false;
    if (this.root) try {
      const file = path.join(this.root, 'data', 'config', 'gal-preferences.json'), t = fs.statSync(file).mtimeMs;
      if (t !== this.settingTime) { this.settingTime = t; this.setting = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).textRenderer; }
      if (this.setting) return this.setting === 'compositor';
    } catch {}
    /* 2026-11-15 (user, 沙耶の唄: 「位置要和原文一样」): drawing in the game's own place is the default; only an explicit other
       文字显示 choice turns it off */
    return (preferences?.textRenderer || 'compositor') === 'compositor';
  }
  configure(preferences, state) {
    /* GalWindowBridge reports the client size in its layout message (state.layout); older callers passed it flat */
    const size = state?.layout?.clientWidth ? state.layout : state;
    if (this.scriptLine && (preferences?.hookHide === false || preferences?.hookProfile === 'off' ||
        (size?.clientHeight && Math.abs(size.clientWidth / size.clientHeight - 16 / 9) > .02))) this.endScriptRow();
    if (size?.clientWidth && size?.clientHeight) this.client = [size.clientWidth, size.clientHeight];
    const on = this.wanted(preferences) && state?.bound === true;
    /* 2026-11-19 (user, 千恋＊万花: "有时候原文还是会出来一下，就一下，然后又没了"; log 11:20:44-48Z: the reader left for 3 s, the engine side
       handed the text back to the game after its 1.6 s, the next line was drawn by the game (hidden=0), the reader came back with that
       line at once and the engine hid the game's text 0.56 s later: two Japanese lines on each other in between). While MeguLit is
       hiding the game's text, a line the game draws itself is on screen only until the hide is back; the reader is told so and leaves
       the Japanese to the game for that time. Reading without hiding (the reader as a second text) is not touched. */
    this.hiding = (preferences?.hookProfile === 'embed' || preferences?.hookProfile === 'euphoria474') && preferences?.hookHide !== false;
    /* 2026-11-21 (owner, STEINS;GATE right after 千恋＊万花 in one MeguLit run: its lines came with no place and were pinned at 千恋＊万花's place and rows):
       the reader is told which game the mode is for; another game starts with no place of its own */
    const game = String(state?.gameProcessId || state?.gameHwnd || '');
    const birth = String(state?.gameStarted || '');
    if (on === this.on && game === this.game && birth === this.birth) return;
    if (this.on) {
      this.stop();
      if (on) this.send({ type: 'textPlaceMode', on: false });
    }
    this.on = on;
    this.game = game;
    this.birth = birth;
    this.send(game ? { type: 'textPlaceMode', on, game } : { type: 'textPlaceMode', on });
  }
  clear() { if (this.current) { this.current = null; this.send({ type: 'textPlace', clear: true }); } }
  /* 2026-11-19 (千恋＊万花 maximised, krkr drawing its text invisible, the reader still in its style box): why a reported line
     was or was not placed, once per line, so a live log says which step stopped it */
  why(key, text) { if (this.whyKey === key) return; this.whyKey = key; this.trace('placement ' + text); }
  hook(m) {
    if (m && m.type === 'hookCharRects' && !this.on) this.why('off:' + m.line, 'off: line ' + (Number(m.line) || 0) + ' not placed (文字显示 is not 画进游戏画面, or no window bound)');
    if (!this.on || !m) return;
    /* engine position hooks (hookTextPos: line box in game-screen px) anchor lines that come without device positions */
    if (m.type === 'hookTextPos') { const k = m.sw > 0 && this.client[0] ? this.client[0] / m.sw : 1, ky = m.sh > 0 && this.client[1] ? this.client[1] / m.sh : k; if ([m.x0, m.y0, m.x1, m.size].every(Number.isFinite) && m.size > 0) this.anchor({ x: m.x0 * k, y: m.y0 * ky, size: m.size * ky, width: Math.max((m.x1 - m.x0) * k, m.size * ky * 16) }); return; }
    if (m.type === 'hookCharRects') {
      if (m.engine === 'gpu' && m.hidden !== true && this.ownsEngineRows()) return;
      if (m.engine !== 'gpu') this.engineSeen = true; /* an engine reports this game's lines with their places (krkr, renpy, …) */
      const chars = [...String(m.text || '')].map(c => c === '\u001f' ? '\n' : c), flat = [];
      for (const c of chars) if (c !== '\n' && c !== '\r') flat.push(c);
      const rects = rectsToClient(m, this.client[0], this.client[1]);
      const id = String(m.engine || 'path') + ':' + (Number(m.line) || 0);
      const text = flat.join('');
      const blankStream = this.profile.placement?.drawWhileBlanking === true;
      const readerDraw = m.engine === 'krkr' && blankStream;
      const style = { ...(readerDraw && text ? { sourceToken: require('./island-source.js').token(text) } : {}),
        ...(m.color ? { color: m.color } : {}), ...(typeof m.read === 'boolean' ? { read: m.read } : {}) };
      /* 2026-11-21 (ファタモルガーナの館, owner's recording 02:57Z: the line just read came back in white for 0.7 s after each click): an
         engine that reports its cleared line (KiriKiri MessageLayer.clear, page.reportClear in the game's diff) sends it once more,
         empty and not hidden. The game's page is gone: the reader never draws it again from its boxes. The line stays the placement's
         last line (the next one is typed where it was) */
      if (m.hidden !== true && !flat.length && !rects.length && m.engine !== 'gpu') {
        if (readerDraw && (this.nativeEmbed?.id === id || this.current?.id === id && this.current.fallback)) {
          const cleared = this.nativeEmbed?.id === id ? this.nativeEmbed.text : this.current.text;
          if (this.nativeEmbed?.id === id) this.nativeEmbed = null;
          if (this.current && this.current.id !== id) return;
          this.current = null;
          this.visibleKey = '';
          this.send({ type: 'textPlace', clearedFallback: true, text: cleared });
          return;
        }
        if (this.current?.id === id && !this.current.fallback && this.goneId !== id) { this.goneId = id; this.why('gone:' + id, 'gone: line ' + (Number(m.line) || 0) + ' cleared by the game'); this.send({ type: 'textPlace', gone: true, text: this.current.text }); this.rowsCleared(id); }
        return;
      }
      if (rects.length !== flat.length) { this.why('count:' + m.line + ':' + rects.length, 'rejected: line ' + (Number(m.line) || 0) + ' has ' + rects.length + ' boxes for ' + flat.length + ' characters'); return; } // one rect per character is the protocol; anything else is not placeable
      if (readerDraw && this.nativeEmbed && (this.nativeEmbed.id !== id || m.hidden || this.nativeEmbed.text !== text || m.emb === 0)) this.nativeEmbed = null;
      // A late colour sample can follow emb=2 on the same draw. It does not transfer the line back to the reader.
      if (readerDraw && !m.hidden && (m.emb || this.nativeEmbed?.id === id)) {
        const embedded = m.emb || this.nativeEmbed.embedded;
        this.clear();
        this.nativeEmbed = { id, text, embedded };
        const key = id + '|' + text + '|emb' + embedded;
        if (key !== this.visibleKey) this.send({ type: 'textPlace', visible: true, hiding: this.hiding, text, embedded });
        this.visibleKey = key;
        return;
      }
      /* 2026-11-15 (沙耶の唄: MeguLit's Japanese drawn a few px off the game's own, unhidden line): the source says the game
         draws this line itself (not hidden yet, or never). The reader must not put its Japanese over it: it gets a
         `visible` note for this text and shows only the translation until the line is placed. */
      /* 2026-11-16 (1.4.16 live, user: 切一次屏之后文字层就不见了 再点一下才出来): after a focus change the game repaints the line it
         already showed hidden from its cached glyphs, and the repaint reports it as not hidden. That is the same line,
         still hidden on screen: it stays placed. */
      if (m.hidden !== true && m.engine !== 'gpu' && this.current && !this.current.fallback && this.current.id === id && this.current.text === text) {
        if (readerDraw && (m.color || typeof m.read === 'boolean')) this.emitLine({ ...this.current, ...style });
        return;
      } /* GPU hiding is decided per frame: there, not hidden is the game showing it */
      /* incr9 2026-11-21 (owner, 千恋＊万花 lines 100001..: 「お客さん」 drawn by nobody): the bridge blanks this stream's glyphs, so a line the
         engine reports unhidden is not on screen: the reader draws its Japanese where the last line was; a hidden glyph later only places it */
      if (m.hidden !== true && m.engine !== 'gpu' && blankStream && this.blanking()) {
        this.why('sblank:' + id, 'fallback: line ' + (Number(m.line) || 0) + ' reported unhidden while the glyph layer blanks the stream (the reader draws it)');
        // TextRender's boxes are still usable while the glyph layer owns hiding. Keep fallback ownership so
        // these records never create an orphan line or count as engine hide proof.
        const boxes = readerDraw && !this.profile.draw?.embed && OverlayPlacement.sane(rects, this.client);
        return this.emitLine({ id, engine: m.engine || 'engine', text, fallback: true, client: this.client.slice(), ...(boxes ? { rects: boxes } : {}), ...style });
      }
      if (m.engine === 'littlecheese') {
        const cells = OverlayPlacement.sane(rects, this.client);
        const nativeCells = m.hidden ? null : m.nativeCells || flat.map(() => true);
        if (m.hidden || m.nativeCells) {
          this.engineHidden = true;
          this.emitLine({ id, engine: m.engine, text, rects, client: this.client.slice(), ...(nativeCells ? { nativeCells } : {}) });
        }
        this.rows({ id, text, rects: cells, nativeCells, bitmapPage: m.bitmapPage }, true);
        return;
      }
      if (m.hidden !== true) { this.why('shown:' + id, 'not placed: line ' + (Number(m.line) || 0) + ' is drawn by the game itself (hidden=0)'); if (this.current?.id === id) this.clear(); const vis = flat.join(''), vkey = vis + (m.emb ? '|emb' + m.emb : ''); if (vis && vkey !== this.visibleKey) { this.visibleKey = vkey; this.send({ type: 'textPlace', visible: true, text: vis, ...(this.hiding === true ? { hiding: true } : {}), ...(m.emb === 1 || m.emb === 2 ? { embedded: m.emb } : {}) }); } return; }
      if (m.engine === 'gpu') this.gpuHiding = Date.now();
      else this.engineHidden = true;
      this.visibleKey = ''; this.why('placed:' + id + ':' + rects.length, 'placed: line ' + (Number(m.line) || 0) + ', ' + rects.length + ' characters, first box ' + (rects[0] ? [].concat(rects[0]).map(v => Math.round(Number(v) || 0)).join(',') : '-') + ' in client ' + this.client.join('x'));
      this.emitLine({ id, engine: m.engine, text, rects, client: this.client.slice(), ...style });
      if (m.engine !== 'gpu') this.rows({ id, text: flat.join(''), rects: this.current && !this.current.fallback && this.current.id === id ? this.current.rects : null });
    }
  }
  /* 2026-11-21 (owner, ファタモルガーナの館 two-row page: the line above went undrawn once the reader moved on, the new one sat on the first
     row): with page.engineRows the engine's lines make a page. A line joins it when the game has not cleared the page since (the
     engine's clear report, page.reportClear) and its top is below every row already on it; otherwise it starts a new page. The page
     goes to the reader as textPlacePage: every line on its own boxes, the earlier ones as old lines (ruby, lookups, the line colour) */
  rows(l, retainedBitmap = false) {
    const mode = retainedBitmap || require('./profiles/index.cjs').get(this.profile, 'page.engineRows', false);
    if (mode === false || !l || !Array.isArray(l.rects) || !l.rects.length) return;
    const ok = r => Array.isArray(r) && r.length >= 4, rs = l.rects.filter(ok); if (!rs.length) return;
    const top = Math.min(...rs.map(r => r[1])), P = this.rowPage || (this.rowPage = []);
    const bitmap = retainedBitmap && Number.isSafeInteger(l.bitmapPage);
    if (bitmap && this.bitmapPage !== l.bitmapPage) { P.length = 0; this.bitmapPage = l.bitmapPage; }
    const entry = { id: l.id, text: l.text, rects: l.rects, ...(l.nativeCells ? { nativeCells: l.nativeCells } : {}) };
    const at = P.findIndex(x => x.id === l.id);
    if (at >= 0) P[at] = entry;
    else { const bottom = P.length ? Math.max(...P.flatMap(x => x.rects.filter(ok).map(r => r[1] + r[3]))) : -Infinity;
      if (P.length && (bitmap || top >= bottom - 2)) this.why('rows:' + l.id, 'page: ' + l.id + ' goes on the page under ' + P[P.length - 1].id + ' (no clear since, starts below its rows)');
      else { if (P.length) this.why('rows:' + l.id, 'page: ' + l.id + ' starts a new page (' + (top < bottom - 2 ? 'not below the page' : 'cleared') + ')'); P.length = 0; }
      P.push(entry); if (P.length > 12) P.shift(); }
    if (mode === true || P.length >= 2) {
      this.rowsPaged = true;
      const armed = !retainedBitmap || P.some(row => !row.nativeCells || row.nativeCells.some(cell => !cell));
      this.page({ awake: true, armed, sw: this.client[0], sh: this.client[1], lines: P }, { engineRows: mode === true, retainedBitmap });
    } else this.rowsUnpage();
  }
  /* auto (null): back to the line model once the page holds one line again */
  rowsUnpage() { if (!this.rowsPaged) return; this.rowsPaged = false; this.pageKey = ''; this.send({ type: 'textPlacePage', lines: null }); }
  ownsEngineRows() {
    return this.rowsPaged === true && require('./profiles/index.cjs').get(this.profile, 'page.engineRows', false) === true;
  }
  rowsCleared(id) { if (!this.rowPage || !this.rowPage.length) return; this.why('rowsgone:' + id, 'page: cleared by the game with ' + id + ', its ' + this.rowPage.length + ' row(s) go'); this.rowPage = [];
    if (require('./profiles/index.cjs').get(this.profile, 'page.engineRows', null) === true) this.page({ awake: true, armed: true, sw: this.client[0], sh: this.client[1], lines: [] }, { engineRows: true }); else this.rowsUnpage(); }
  scriptRow(text, layout, sequence, frame) {
    // The window bridge publishes its first positioned layout when the reader becomes
    // visible. Before that, report the script's reference space; mapper scales it
    // when the real client arrives, including a bind that started in the background.
    const client = this.client[0] && this.client[1] ? this.client : [1280, 720];
    const rects = this.on && layout?.grid(text, client);
    if (!rects) { this.endScriptRow(); return; }
    const key = sequence + '|' + text;
    if (this.scriptLine?.key === key) return;
    const previous = this.scriptLine;
    clearTimeout(previous?.timer);
    const page = layout.page?.(text), start = layout.row?.(text);
    const samePage = page != null && previous?.page === page && start >= previous.start;
    const history = samePage ? previous.records.filter(r => layout.row(r.text) < start) : [];
    const record = {text: text.replace(/[\r\n]/g, ''), ink: rects.map(() => true)};
    const row = this.scriptLine = {key, page, start, records: [...history, record]};
    const publish = () => {
      const previousCells = [];
      for (const r of history) {
        const boxes = layout.grid(r.text, client);
        if (boxes) [...r.text].forEach((ch, i) => { if (!r.ink[i] && ch.trim()) previousCells.push([ch, boxes[i]]); });
      }
      const line = {type:'textPlace', id:'systemnnn-row', text:record.text, rects, nativeCells:record.ink, previousCells, frameLayout:row.frameLayout, client:client.slice()};
      const signature = JSON.stringify(line);
      if (this.current && this.lastKey === signature) return;
      this.current = line; this.lastKey = signature; this.send(line);
    };
    // Keep earlier missing cells on the same NVL page. The next stable native frame
    // may restore those glyphs from cache; each new source checks their ink again.
    if (this.client[0] && this.client[1]) publish();
    let attempts = 0;
    const sample = async () => {
      if (this.scriptLine !== row) return;
      let image;
      try { image = await frame?.(); } catch {}
      if (this.scriptLine !== row || !this.on) return;
      const size = image && [image.width, image.height];
      if (image?.clientOrigin?.length === 2) row.frameLayout = {clientX:image.clientOrigin[0], clientY:image.clientOrigin[1], clientWidth:image.width, clientHeight:image.height};
      let settled = true;
      for (const r of row.records) {
        const boxes = size && layout.grid(r.text, size);
        const ink = boxes && require('./sadistic-blood-layout.cjs').nativeInk(image, size, boxes);
        if (ink && r.sample && ink.every((v, i) => v === r.sample[i])) r.ink = ink;
        else settled = false;
        r.sample = ink;
      }
      if (row.frameLayout || this.client[0] && this.client[1]) publish();
      if (!settled && ++attempts < 4) row.timer = setTimeout(sample, 260);
    };
    if (frame) row.timer = setTimeout(sample, 220);
  }
  endScriptRow() {
    clearTimeout(this.scriptLine?.timer);
    this.scriptLine = null;
    if (this.current?.id === 'systemnnn-row') this.clear();
  }
  /* ① MeguLitFont blank mode (record spec 3): the current line's table (hook-native state.hookGlyphDots) with a cell
     origin per character. Spaces: c = client px, m<W>x<H> / t<W>x<H> = a surface of that size (scaled to the client),
     g / - = no device position (not placeable). A character the engine drew from its glyph cache has no record: it sits
     right after the previous placed one on the same row (advance), as long as a later character of the line was drawn. */
  glyph(table, scriptLayout) {
    if (table && typeof table.text === 'string' && table.text && !this.on) this.why('goff:' + (Number(table.seq) || 0), 'off: glyph line ' + (Number(table.seq) || 0) + ' not placed (文字显示 is not 画进游戏画面, or no window bound)');
    if (!this.on || !table || typeof table.text !== 'string' || !table.text) return;
    if (this.scriptLine && scriptLayout?.isRedraw(table.text)) return;
    const chars = [...table.text], { rects, drawn: recorded, sizes } = this.rectsOf(table, ['d', 'c']);
    const id = 'glyph:' + (Number(table.seq) || 0);
    // A glyph fragment from the same draw can otherwise replace the native page's source.
    if (this.ownsEngineRows() || this.nativeEmbed?.text === table.text) return;
    // A glyph table can arrive after the GPU has placed the same line, with fragments from the previous box.
    if (this.current?.engine === 'gpu' && this.current.rects && this.current.text === table.text) return;
    if (this.current?.sourceToken != null && this.current.rects && this.current.text === table.text) return;
    /* 2026-11-16 (死に逝く君、館に芽吹く憎悪, KiriKiri: 「間　側　法律　当　　ば　ほとんど　犯罪行」): an engine with a glyph
       cache rasterises a character once and reuses the bitmap, so a character an earlier line used has no record in
       this one. "Drawn" used to mean "has a record", and every reused character stayed out for good: the reader drew
       only the line's new characters, with holes. The game types in reading order, so a character before a drawn one
       has been drawn; the characters after the last record are let in once the line is complete (no new record for
       DoneAfter ms: a typing engine sends one every few tens of ms). */
    if (recorded.size) this.hideSeen = true;
    /* 2026-11-16 (QQ group, WHITE ALBUM: 「…そうなんだよなあ」 twice, MeguLit's a few px off the game's own): no character of
       any line has come back as hidden by the game, so nothing proves the game's line is gone. A guessed place (anchor
       estimate, locator) would put MeguLit's Japanese next to the game's own: the line goes out as `visible` instead
       (the reader keeps the translation and never draws its Japanese over the game's). Every engine. */
    /* 2026-11-20 (user, CHAOS;CHILD: 「对话框的字咋没了」): the GPU layer hides this game's lines (it placed one as hidden), so a line the
       glyph path never saw hidden is still not the game's own drawing: the reader draws its Japanese where the last line was */
    if (!this.hideSeen && this.gpuHiding && Date.now() - this.gpuHiding < 30 * 60 * 1000) { this.why('gfall:' + id, 'fallback: glyph line ' + (Number(table.seq) || 0) + ' unplaced while the GPU layer hides the game lines'); return this.emitLine({ id, engine: 'glyph', text: table.text, fallback: true, client: this.client.slice() }); }
    /* 2026-11-21 (owner, STEINS;GATE: 「每次校准才出来一下日文」): the write-back (embed) has replaced and verified the game's original, so a glyph line
       the glyph layer never saw hidden is not the game drawing the original: the reader keeps its Japanese (it was hidden as the game's own line
       on every line and came back only while a calibration switched the mode) */
    /* 2026-11-21 r29 (owner, 千恋＊万花: lines tripled, the place moving, the original flashing): only for a game whose lines no engine reports
       with places (STEINS;GATE/MAGES); a game with an engine path (KiriKiri) keeps the note and its hide timing as before */
    if (!this.hideSeen && !this.engineSeen && this.replaced()) { this.why('greplaced:' + id, 'not placed: glyph line ' + (Number(table.seq) || 0) + ' unhidden, but the write-back replaced the original (the reader draws it)'); if (this.current?.id === id) this.clear(); return; }
    /* 2026-11-21 (owner incr9, 千恋＊万花: glyph lines 7-25 arrived as "the game draws it itself" between the KiriKiri lines placed hidden at
       374,707): once an engine has placed one of this game's lines hidden, the engine's places are the source and the glyph path is only
       the fallback for games without one. An unhidden glyph line then sends no `visible` note that could keep the reader's Japanese away. */
    if (!this.hideSeen && this.engineHidden) { this.why('gengine:' + id, 'skipped: glyph line ' + (Number(table.seq) || 0) + ' (the engine path places the lines of this game)'); return; }
    /* incr9 2026-11-21 (owner, 千恋＊万花: 「お客さん」「……ぁ？」 every short line 'has no hidden glyph yet', the game drew nothing, the reader
       neither): with the bridge blanking the writable stream the line is hidden; the reader draws it, a late hidden glyph only places it */
    if (!this.hideSeen && require('./profiles/index.cjs').get(this.profile, 'placement.drawWhileBlanking', false) && this.blanking()) { this.why('gblank:' + id, 'fallback: glyph line ' + (Number(table.seq) || 0) + ' has no hidden glyph yet, but the glyph layer blanks the stream (the reader draws it)'); return this.emitLine({ id, engine: 'glyph', text: table.text, fallback: true, client: this.client.slice() }); }
    /* 2026-11-26 (オルフレール, KiriKiri without KAG: row 0.4, the reader drew only the Chinese): the bridge skips the game's DrawText at the
       source (drawSkipped on the selected stream), so the game never draws this line: the reader draws its Japanese. Any engine with a source skip */
    if (!this.hideSeen && this.skipping()) { this.why('gskip:' + id, 'fallback: glyph line ' + (Number(table.seq) || 0) + ' has no hidden glyph, but the bridge skips the game\'s own draw at the source (the reader draws it)'); return this.emitLine({ id, engine: 'glyph', text: table.text, fallback: true, client: this.client.slice() }); }
    if (!this.hideSeen) this.why('gshown:' + id, 'not placed: glyph line ' + (Number(table.seq) || 0) + ' has no hidden glyph yet (the game draws it itself)');
    if (!this.hideSeen) { const vis = chars.filter(c => !/\s/.test(c)).join(''); if (this.current?.id === id) this.clear(); if (vis && vis !== this.visibleKey) { this.visibleKey = vis; this.send({ type: 'textPlace', visible: true, text: vis, ...(this.hiding === true ? { hiding: true } : {}) }); } return; }
    const typed = this.typed(table, chars.length, recorded), drawn = new Set(chars.map((c, i) => i).filter(i => i < typed));
    let first = -1, last = -1; for (let i = 0; i < rects.length; i++) if (rects[i]) { if (first < 0) first = i; last = i; }
    if (last >= 0) {
      for (let i = first + 1; i < typed; i++) if (!rects[i] && rects[i - 1]) { const p = rects[i - 1]; rects[i] = [p[0] + p[2], p[1], p[2], p[3]]; }
      for (let i = first - 1; i >= 0; i--) { const n = rects[i + 1]; rects[i] = [n[0] - n[2], n[1], n[2], n[3]]; }
      for (let i = typed; i < rects.length; i++) rects[i] = null;
      return this.emitLine({ id, engine: 'glyph', text: table.text, rects, client: this.client.slice() });
    }
    /* no device position at all (GetGlyphOutline engines: Siglus, AdvHD...): lay the line out from the anchor (the last
       exactly placed line of this game, or an outside locator: anchor()), one advance per character, wrapping at the
       anchor's width; only characters the game has drawn so far (typing). Without an anchor: fallback. */
    /* glyph-dots' locating marks learned this game's text position (core/glyph-locate-host.cjs) */
    if (this.offFrame) { this.why('gsurf:' + id + ':' + this.offFrame, 'glyph line ' + (Number(table.seq) || 0) + ' drawn on a surface that is not the frame (' + this.offFrame + ', client ' + this.client.join('x') + '): its boxes are no screen position, laid out from the anchor'); }
    const located = this.locator?.(table, typed);
    if (Array.isArray(located) && located.length === chars.length && located.some(Boolean)) return this.emitLine({ id, engine: 'glyph', text: table.text, rects: located, client: this.client.slice(), located: true });
    if (this.anchorBox) return this.emitLine({ id, engine: 'glyph', text: table.text, rects: this.estimate(chars, drawn, sizes), client: this.client.slice(), approx: true });
    this.why('gfall:' + id, 'not placed: glyph line ' + (Number(table.seq) || 0) + ' has no device position for its glyphs (' + rects.filter(Boolean).length + '/' + chars.length + ' with a place); the reader keeps its own box');
    this.emitLine({ id, engine: 'glyph', text: table.text, fallback: true, client: this.client.slice() });
  }
  /* how many characters of the line the game has drawn: up to the last one with a record, all of them once no record
     came for DoneAfter ms (the timer lays the line out again then) or the line has no record at all */
  typed(table, n, recorded) {
    const key = (Number(table.seq) || 0) + '|' + table.text, count = recorded.size, last = count ? Math.max(...recorded) + 1 : 0;
    clearTimeout(this.doneTimer);
    if (this.typing?.key !== key || this.typing.count !== count) this.typing = { key, count, done: false };
    if (!count || this.typing.done || last >= n) return n;
    this.doneTimer = setTimeout(() => { if (this.typing?.key !== key) return; this.typing.done = true; this.glyph(table); }, OverlayPlacement.DoneAfter);
    this.doneTimer.unref?.();
    return last;
  }
  /* one box per character of a glyph table (null = no record / no device position); kinds: record kinds that count */
  rectsOf(table, accept) {
    const chars = [...table.text], rects = new Array(chars.length).fill(null), kinds = new Array(chars.length).fill(''), [cw, ch] = this.client;
    this.offFrame = '';
    const drawn = new Set(), sizes = [];
    for (const d of Array.isArray(table.dots) ? table.dots : []) {
      if (!d || !accept.includes(d.k) || !(d.i >= 0 && d.i < chars.length)) continue;
      if (d.ch && d.ch !== chars[d.i]) continue;
      drawn.add(d.i); if (d.h > 0) sizes.push([d.h, d.a > 0 ? d.a : d.h, d.b > 0 ? d.b : 0]);
      if (!d.at || kinds[d.i] === accept[0]) continue; /* first kind-d record of an index wins (shadow / outline passes, redraws) */
      const sp = String(d.at.space || ''), m = /^[mt](\d+)x(\d+)$/.exec(sp);
      let kx = 1, ky = 1;
      /* 2026-11-19 (素晴らしき日々, voiced 「」 lines at the top of the game): a memory surface stands for the screen only when it
         is the frame (the game's back buffer: the client's shape, any scale). Any other surface (a line or name sprite the
         game blits somewhere later) has its own origin: its boxes are no screen position, the line is laid out from the
         anchor of the last exactly placed line like an engine without device positions. */
      if (m) { const w = +m[1], h = +m[2]; if (!(w > 0 && h > 0 && cw > 0 && ch > 0)) continue;
        if (Math.abs(w / h - cw / ch) > 0.03 * (cw / ch)) { this.offFrame = sp; continue; }
        kx = cw / w; ky = ch / h; }
      else if (sp !== 'c') continue;
      const hgt = d.h > 0 ? d.h : 0, adv = d.a > 0 ? d.a : hgt;
      if (!hgt) continue;
      rects[d.i] = [d.at.x * kx, d.at.y * ky, adv * kx, hgt * ky]; kinds[d.i] = d.k;
    }
    return { rects, drawn, sizes };
  }
  /* ① extra lines (glyph-dots records 4, hook-native state.hookGlyphExtras): name plate (kind n) and choices (kind o),
     blanked by the game like the line. Placed only when every character has a box (no guessing: a wrong name or option
     is worse than the game's blank); the reader draws them click-through, so a click on an option reaches the game's
     own (blank) button. */
  extras(all) {
    if (!this.on) return;
    const items = [];
    for (const t of Object.values(all || {}).sort((p, q) => p.id - q.id)) {
      if (!t || typeof t.text !== 'string' || !t.text || !(t.kind === 'n' || t.kind === 'o')) continue;
      const { rects } = this.rectsOf(t, [t.kind]);
      const ok = rects.every(Boolean) && OverlayPlacement.sane(rects, this.client);
      if (ok && ok.every(Boolean)) items.push({ id: t.id, kind: t.kind, text: t.text, rects: ok });
    }
    const key = JSON.stringify(items);
    if (key === this.extraKey) return; this.extraKey = key;
    this.send({ type: 'textPlaceExtra', items, client: this.client.slice() });
    /* the choices' boxes also feed the reader's choice overlay (ruby + translation under each option) in place of the
       OCR locate, which finds nothing once the options are blank */
    const options = items.filter(i => i.kind === 'o');
    this.choicesPlaced = options.length > 0;
    if (options.length || this.choiceSent) {
      this.choiceSent = options.length > 0;
      this.send({ type: 'placeChoiceBoxes', sw: this.client[0], sh: this.client[1], items: options.map(i => { const r = i.rects; return { text: i.text, x0: Math.round(Math.min(...r.map(v => v[0]))), y0: Math.round(Math.min(...r.map(v => v[1]))), x1: Math.round(Math.max(...r.map(v => v[0] + v[2]))), y1: Math.round(Math.max(...r.map(v => v[1] + v[3]))) }; }) });
    }
  }
  /* options found from hidden lines no source carried (hook-native placedHidden): drawn as choices on their boxes, and given to the reader's
     choice overlay (ruby + translation under each) */
  hiddenChoices(items) {
    if (!this.on || !Array.isArray(items) || items.length < 2) return;
    const ok = items.map(i => ({ id: 'hidden:' + i.text, kind: 'o', text: i.text, rects: i.rects })).filter(i => Array.isArray(i.rects) && i.rects.length);
    if (ok.length < 2) return;
    this.extraKey = JSON.stringify(ok); this.send({ type: 'textPlaceExtra', items: ok, client: this.client.slice() }); this.choicesPlaced = true; this.choiceSent = true;
    this.send({ type: 'placeChoiceBoxes', sw: this.client[0], sh: this.client[1], items: ok.map(i => { const r = i.rects; return { text: i.text, x0: Math.round(Math.min(...r.map(v => v[0]))), y0: Math.round(Math.min(...r.map(v => v[1]))), x1: Math.round(Math.max(...r.map(v => v[0] + v[2]))), y1: Math.round(Math.max(...r.map(v => v[1] + v[3]))) }; }) });
    this.why('hchoice:' + ok.length, 'choices from hidden lines no source carried: ' + ok.map(i => i.text).join(' / ').slice(0, 80));
  }
  /* the dialogue area learned from an exactly placed line: left edge, first row top, row pitch, width, size */
  learn(rects) {
    const r = rects.filter(Boolean); if (r.length < 2) return;
    const x = Math.min(...r.map(v => v[0])), y = Math.min(...r.map(v => v[1])), right = Math.max(...r.map(v => v[0] + v[2]));
    const tops = [...new Set(r.map(v => Math.round(v[1])))].sort((p, q) => p - q), h = r[0][3];
    const pitch = tops.length > 1 ? tops[1] - tops[0] : (this.anchorBox?.pitch || h * 1.5);
    const prev = this.anchorBox?.exact ? this.anchorBox : null;
    this.anchorBox = { x, y, pitch, width: Math.max(right - x, prev && Math.abs(prev.x - x) < h ? prev.width : 0), size: h, exact: true };
  }
  /* outside locator (game-style probe dialogue box, OCR of the first character): {x, y, size, width, pitch} in client px.
     An exact line learned later replaces it. */
  anchor(box) {
    if (!box || !(box.size > 0) || !Number.isFinite(box.x) || !Number.isFinite(box.y)) return;
    if (this.anchorBox?.exact) return;
    this.anchorBox = { x: box.x, y: box.y, size: box.size, pitch: box.pitch > 0 ? box.pitch : box.size * 1.5, width: box.width > 0 ? box.width : Math.max(box.size * 20, (this.client[0] || 1280) * .7), exact: false };
  }
  estimate(chars, drawn, sizes) {
    const A = this.anchorBox, med = (k, d) => { const v = sizes.map(s => s[k]).sort((p, q) => p - q); return v.length ? v[v.length >> 1] : d; };
    const h = A.exact ? A.size : med(0, A.size), adv = med(1, h), all = drawn.size === 0, rects = [];
    let x = A.x, y = A.y;
    chars.forEach((c, i) => {
      if (c === '\n') { x = A.x; y += A.pitch; rects.push(null); return; }
      const w = /[\x20-\x7e｡-ﾟ]/.test(c) ? adv / 2 : adv;
      if (x + w > A.x + A.width + 1 && x > A.x) { x = A.x; y += A.pitch; }
      rects.push(all || drawn.has(i) ? [x, y, w, h] : null); x += w;
    });
    return rects;
  }
  /* every position leaves here checked: a box must have a size and touch the game client, and is clamped into it; a line
     with no such box (all 0 / null, the client size unknown) or whose boxes all share one origin (a hook that reports
     0,0 for every character, e.g. a centred line drawn without a text box) is not placeable and goes out as fallback,
     never as boxes at the client's (or the monitor's) top-left corner. */
  static sane(rects, client) {
    const [cw, ch] = client || [0, 0];
    if (!(cw > 0 && ch > 0) || !Array.isArray(rects)) return null;
    const out = rects.map(r => {
      if (!Array.isArray(r) || r.length < 4 || !r.every(Number.isFinite)) return null;
      let [x, y, w, h] = r;
      if (!(w > 0 && h > 0) || x >= cw || y >= ch || x + w <= 0 || y + h <= 0) return null;
      /* 2026-11-19 (user, 素晴らしき日々 installed 1.4.17: 「一说话字就飞不见了，位置也一直乱跑」; every voiced 「」 line had its first glyph
         exactly on the client's top edge, firstGlyphTop = clientY, also on the test copy): a box more than half above the
         client is not a screen position (an off-screen buffer, a surface drawn at its own origin); clamping it put the line at
         the top of the game and taught the anchor that place. Such a box has no place. */
      if (y < -h / 2) return null;
      w = Math.min(w, cw); h = Math.min(h, ch); x = Math.min(Math.max(x, 0), cw - w); y = Math.min(Math.max(y, 0), ch - h);
      return [x, y, w, h];
    });
    const ok = out.filter(Boolean);
    if (!ok.length) return null;
    /* every box on the client's very top row (y 0): a buffer drawn at its own origin, never a dialogue line on screen */
    if (ok.every(r => r[1] <= 0.5)) return null;
    if (ok.length > 1 && ok.every(r => r[0] === ok[0][0] && r[1] === ok[0][1])) return null;
    return out;
  }
  /* Layer 4 page model (native/gpuhide/GlyphQuads.h, ToMe_PAGE): engines that redraw the whole page keep their own layout;
     the layer leaves the glyphs out and reports every line of the page with the places of its characters, in reading
     order (a line still being typed has fewer places than characters). The reader draws the whole page on them: older
     lines keep their Japanese and ruby, the newest one carries the translation. awake false = no page on screen (text
     window hidden, title): everything is cleared. */
  /* o.replaced: another hide path (write-back of the selected stream, or a proven glyph layer) already takes the game's
     own line away (hook-native originalReplaced). 2026-11-15 (user group, 1.4.10, 時計仕掛けのレイライン / SoftPal: "只有翻译了，
     要替换的原文没了"): layer 4 reported the text window (awake=1) while it was not armed, because the writable stream was
     hidden by write-back; the reader took that page for "the game draws its own line" and dropped its Japanese, so the
     box showed the translation alone. An unarmed page is only the window state: with the line hidden elsewhere it goes
     out as `elsewhere` and the reader places the line as it would without a page. */
  page(m, o = {}) {
    if (!this.on || !m) return;
    if (m.type === 'hookGpuPage' && !m.armed && this.ownsEngineRows()) return;
    const [cw, ch] = this.client, kx = m.sw > 0 && cw ? cw / m.sw : 1, ky = m.sh > 0 && ch ? ch / m.sh : kx;
    const elsewhere = !m.armed && !!m.awake && o.replaced === true;
    const lines = m.awake && (m.armed || o.retainedBitmap) ? m.lines.map(l => ({ id: l.id, text: l.text, rects: l.rects.slice(0, [...l.text].length).map(r => r ? [Math.round(r[0] * kx), Math.round(r[1] * ky), Math.round(r[2] * kx), Math.round(r[3] * ky)] : null), ...(l.nativeCells ? { nativeCells: l.nativeCells } : {}) })) : [];
    const out = elsewhere ? { type: 'textPlacePage', awake: true, armed: false, elsewhere: true, lines: [], client: this.client.slice() }
      : { type: 'textPlacePage', awake: m.awake, armed: m.armed, ...(o.engineRows ? { engineRows: true } : {}), ...(o.retainedBitmap ? { retainedBitmap: true } : {}), own: m.own, ownRects: m.ownRects, lines, client: this.client.slice() };
    const key = JSON.stringify(out);
    if (key === this.pageKey) return; this.pageKey = key; this.paged = true;
    for (const l of lines) this.learn(l.rects);
    this.send(out);
  }
  emitLine(line) {
    if (!line.fallback) {
      const rects = OverlayPlacement.sane(line.rects, line.client);
      /* 2026-11-21 (owner: 「原地补画不就能二次认领了吗」): a line the game drew hidden goes to the source side with its boxes; a line no source
         carried becomes a source line (furigana, translation, lookups) or, with others at once, the options of a choice */
      if (rects) try { this.hidden({ text: line.text, rects, client: line.client }); } catch {}
      if (!rects) this.why('insane:' + line.id + ':' + line.text, 'not placed: ' + line.id + ' has no box on the game client (off the client, or all on its top edge: a buffer drawn at its own origin); the reader keeps its own box and the anchor is not taught');
      if (rects) line = { ...line, rects };
      else {
        const { id, engine, text, client, sourceToken, color, read } = line;
        line = { id, engine, text, client, fallback: true, ...(sourceToken != null ? { sourceToken } : {}), ...(color ? { color } : {}), ...(typeof read === 'boolean' ? { read } : {}) };
      }
      if (rects && !line.approx) this.learn(rects);
    }
    const key = JSON.stringify(line);
    if (this.current && key === this.lastKey) return; this.lastKey = key; this.current = line; this.visibleKey = '';
    this.send({ type: 'textPlace', ...line });
  }
  stop() {
    this.endScriptRow();
    this.on = false;
    clearTimeout(this.doneTimer);
    this.typing = null;
    this.clear();
    if (this.paged) this.send({ type: 'textPlacePage', lines: null });
    if (this.extraKey && this.extraKey !== '[]') this.send({ type: 'textPlaceExtra', items: [] });
    if (this.choiceSent) this.send({ type: 'placeChoiceBoxes', items: [] });
    this.rowPage = [];
    this.bitmapPage = null;
    this.rowsPaged = false;
    this.paged = false;
    this.choiceSent = false;
    this.choicesPlaced = false;
    this.pageKey = '';
    this.extraKey = '';
    this.lastKey = '';
    this.visibleKey = '';
    this.nativeEmbed = null;
    this.goneId = '';
    this.whyKey = '';
    this.anchorBox = null;
    this.gpuHiding = 0;
    this.hideSeen = false;
    this.engineSeen = false;
    this.engineHidden = false;
  }
}

/* a typing engine sends a record every few tens of ms; this long without one, the line is complete */
OverlayPlacement.DoneAfter = 450;

/* "ToMe_PAGE sw=1280 sh=960 awake=1 armed=1 gh=41 own=0" then, per line, TAB id TAB n TAB x,y,w,h;... TAB text */
function parsePage(raw) {
  const parts = String(raw || '').split('	'), head = /^ToMe_PAGE sw=(\d+) sh=(\d+) awake=([01]) armed=([01]) gh=(\d+) own=(\d+) ownr=([-\d,;]*)(?: t=(\d+))?$/.exec(parts[0]);
  if (!head || (parts.length - 1) % 4) return null;
  const blank = c => c <= ' ' || c === '　' || c === '​' || c === '﻿', lines = [];
  for (let i = 1; i < parts.length; i += 4) {
    const rects = parts[i + 2] ? parts[i + 2].split(';').slice(0, 2048).map(q => q.split(',').map(Number)) : [];
    if (rects.some(q => q.length !== 4 || q.some(n => !Number.isFinite(n)))) return null;
    lines.push({ id: Number(parts[i]), n: Number(parts[i + 1]), rects, text: [...parts[i + 3]].filter(c => !blank(c)).join('').slice(0, 4000) });
  }
  return { type: 'hookGpuPage', sw: +head[1], sh: +head[2], awake: head[3] === '1', armed: head[4] === '1', glyphHeight: +head[5], own: +head[6], ownRects: head[7], tick: head[8] ? +head[8] : 0, lines };
}

module.exports = { OverlayPlacement, parsePage };
