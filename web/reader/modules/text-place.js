// SPDX-License-Identifier: GPL-3.0-or-later
/* Overlay placement (2026-11-14, core/overlay-placement.cjs). The game draws the current line blank and its sources
   report a box per character (client px). The reader's own line (the hook reader's .sentence-text with its
   .char-token spans, ruby bases and translation row) is laid out on exactly those boxes: same place, a size taken from
   the boxes, the game style's colour / outline / shadow as everywhere else. Interaction is untouched: the tokens stay
   the reader's own (word card, drag-select), the hit regions follow their new boxes, clicks elsewhere reach the game.
   Ruby uses the reader's shared ruby rule (gal.js paint), measured on the placed boxes. Translation sits under the
   last row without a plate; translation-only mode puts it in the Japanese's place. */
(function install() {
  'use strict';
  const b = window.__tomoyoChinese;
  if (!b || !document.body) { document.addEventListener('DOMContentLoaded', install, { once: true }); return; }
  if (b.textPlace) return;
  let unmatched = null;
  let bandWindow = null, bandRetired = null, appliedOffset = null;
  /* 2026-11-21 (owner's recording, windowed 千恋＊万花: dragging the 原文与译文间距 slider made the translation jump between right under
     its Japanese and below the game window, back and forth): one decision per line, with hysteresis. The translation leaves for
     below the window only once it reaches a quarter glyph into the game's button strip, and comes back under its Japanese only
     once it fits with half a glyph to spare; between the two it stays where it is, so a slider moves it continuously. */
  let cnBelow = { key: null, below: false }; const UNMATCHED_MS = 400;
  let on = false, line = null, frame = 0, lastGeom = '', anchor = null, anchorLine = '', anchorLimit = NaN, anchorMode = true, drawnByGame = '', drawnHiding = false, drawnEmbedded = 0, pageOwn = false, page = null; const clones = new Map();
  const style = document.createElement('style');
  const inline = 'html body.megulit-inline-translation:not(.megulit-place-game-drawn):not(.megulit-readonly-hook) .sentence-window.tomoyo-hook-reader:not(.megulit-place-window):not(.tome-island-page)';
  style.textContent = [
    'html body .sentence-window.megulit-dialogue-band{box-sizing:border-box!important;position:fixed!important;display:block!important;padding:var(--megulit-band-ruby-room,0px) 0 0!important;background:none!important;overflow:hidden!important;text-align:left!important;font-size:calc(var(--tomoyo-gal-jp-size,26px) * var(--megulit-band-fit,1))!important;line-height:var(--megulit-dialogue-pitch,1.6)!important}',
    'html body .sentence-window.megulit-dialogue-band .sentence-text,html body .sentence-window.megulit-dialogue-band .tomoyo-cn-row:not([hidden]){position:static!important;text-indent:0!important;white-space:normal!important;overflow-wrap:anywhere!important;line-break:strict!important}',
    'html body .sentence-window.megulit-dialogue-band .sentence-text{font-size:inherit!important;line-height:inherit!important}',
    'html body .sentence-window.megulit-dialogue-band .tomoyo-cn-output{font-size:calc(var(--tomoyo-gal-cn-size,20px) * var(--megulit-band-fit,1))!important}',
    'html body .megulit-dialogue-band :is(.megulit-old-line,.tome-page-lines){display:none!important}',
    'body.megulit-placed .sentence-window.megulit-place-window{left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100vw!important;height:100vh!important;max-height:none!important;margin:0!important;padding:0!important;background:none!important;border:0!important;box-shadow:none!important;outline:0!important;backdrop-filter:none!important;overflow:visible!important;transform:none!important;pointer-events:none}',
    'body.megulit-placed .sentence-window.megulit-place-window::before,body.megulit-placed .sentence-window.megulit-place-window::after{display:none!important}',
    'body.megulit-placed .tome-box-deco,body.megulit-placed .sentence-window:not(.megulit-place-window){display:none!important}',
    'body.megulit-placed .megulit-place-window .sentence-text{position:absolute!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;transform:none!important;overflow:visible!important}',
    'body.megulit-native-cells .megulit-place-window .char-token.megulit-native-cell,body.megulit-placed .megulit-place-window .sentence-text.megulit-native-sentence{opacity:0!important}',
    'body.megulit-placed .megulit-place-window .tome-page-lines{display:none!important}',
    /* 2026-11-21 (ファタ two-row page: every placed row 11 px under its box): the reader's line-height margin (gal.js, a more specific
       selector) moved the full-window sentence off the surface's top; a placed page's sentence sits exactly at 0,0 */
    'html body.megulit-placed .sentence-window.megulit-place-window .sentence-text:not(#megulit-x){margin:0!important;top:0!important;left:0!important}',
    '.megulit-anchor-window.megulit-anchor-center .sentence-text,.megulit-anchor-window.megulit-anchor-center .tomoyo-cn-row,.megulit-anchor-window.megulit-anchor-center .tomoyo-cn-output,.megulit-anchor-window.megulit-anchor-center .tome-page-lines{text-align:center!important;text-align-last:center!important}',
    '.megulit-anchor-window .sentence-text{position:relative}',
    'body.megulit-place-gone .sentence-window.tomoyo-hook-reader,body.megulit-place-gone .sentence-window.tomoyo-hook-reader *{opacity:0!important;visibility:hidden!important}', /* 2026-11-20 (CHAOS;CHILD: the game cleared its text at a scene change, the old line stayed): gone with the game's line until the next one */
    '.megulit-anchor-window .tome-page-lines{opacity:.6;position:absolute;left:0;right:0;bottom:100%}',
    '.megulit-anchor-window.megulit-page-fresh .tome-page-lines{display:none!important}',
    '.megulit-anchor-window.megulit-page-fresh:not(.megulit-anchor-center) .tome-page-lines{display:none!important}',
    '.megulit-anchor-window.megulit-game-rows .sentence-text{white-space:nowrap!important}' +
    '.megulit-anchor-window.megulit-rows-predicted .sentence-text{white-space:normal!important;max-width:var(--megulit-centre-width)!important;margin-left:auto!important;margin-right:auto!important}', /* a line on the game's rows breaks where the game broke it, nowhere else */ /* dialogue lines never carry the dimmed page above them (2026-11-20 user: the old lines covered the screen) */
    'body.megulit-placed .megulit-place-window .megulit-ruby-base{position:absolute!important;display:block!important;margin:0!important;padding:0!important}',
    'body.megulit-placed .megulit-place-window .megulit-ruby-base:not(:has(.char-token:not(.megulit-unplaced)))::before{visibility:hidden}',
    'body.megulit-placed .megulit-place-window .megulit-ruby-base[data-tomoyo-reading]::before{transform:translate(-50%,-100%) scaleX(var(--megulit-cell-ruby-scale,1))}',
    'body.megulit-placed .megulit-place-window .char-token{scale:var(--megulit-cell-scale,1) 1;transform-origin:left center}',
    'body.megulit-placed .megulit-place-window .char-token{position:absolute!important;display:block!important;margin:0!important;padding:0!important;text-align:center!important;white-space:pre!important;letter-spacing:0!important;text-indent:0!important;pointer-events:auto}',
    'body.megulit-placed .megulit-place-window .char-token.megulit-unplaced{display:none!important}',
    'body.megulit-place-garbled .sentence-window.tomoyo-hook-reader{visibility:hidden!important}', /* a broken copy of the game's Japanese line: the game's own text is drawn instead */
    /* fallback (the game drew its line blank but said nowhere where): the reader keeps its own place, without any plate */
    'body.megulit-place-fallback .sentence-window.tomoyo-hook-reader,body.megulit-place-fallback .sentence-window.tomoyo-hook-reader .tomoyo-cn-row,body.megulit-place-game-drawn .sentence-window.tomoyo-hook-reader,body.megulit-place-game-drawn .sentence-window.tomoyo-hook-reader .tomoyo-cn-row{background:none!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important}',
    'body.megulit-place-fallback .sentence-window.tomoyo-hook-reader::before,body.megulit-place-fallback .sentence-window.tomoyo-hook-reader::after,body.megulit-place-fallback .tome-box-deco,body.megulit-place-game-drawn .sentence-window.tomoyo-hook-reader::before,body.megulit-place-game-drawn .sentence-window.tomoyo-hook-reader::after,body.megulit-place-game-drawn .tome-box-deco{display:none!important}',
    /* the game still draws this line itself (core/overlay-placement.cjs `visible`, an unarmed page): the reader stays in its
       own window, Japanese on top (clickable for lookups) and the translation under it, but never on a plate (2026-11-16 user:
       no plate behind any MeguLit text). Only a placed page whose places do not hold the line yet hides its Japanese. */
    /* 2026-11-16 (1.4.16 live: the game's own line and MeguLit's 20 px above it while the game was not hidden yet): whenever the game draws its line itself, MeguLit draws only the translation, placed or not */
    'body.megulit-place-game-drawn.megulit-anchored .sentence-window.tomoyo-hook-reader .sentence-text:not(.megulit-old-line),body.megulit-place-game-drawn.megulit-placed .sentence-window.tomoyo-hook-reader .sentence-text:not(.megulit-old-line){visibility:hidden!important}',
    'body.megulit-place-game-drawn.megulit-game-line-brief .sentence-window.tomoyo-hook-reader .sentence-text:not(.megulit-old-line){visibility:hidden!important}',
    'body.megulit-place-game-drawn .sentence-window.tomoyo-hook-reader .tomoyo-cn-row{visibility:visible!important}',
    'body.megulit-place-game-drawn.megulit-game-embedded .sentence-window.tomoyo-hook-reader .tomoyo-cn-row{visibility:hidden!important}',
    /* layer 4 page model: older lines of the page (their own .sentence-text, placed like the current one) */
    'body.megulit-cleared-translation .tomoyo-hook-reader .tomoyo-cn-row{display:none!important}',
    'body.megulit-place-asleep .sentence-window.tomoyo-hook-reader{visibility:hidden!important}',
    'body:not(.megulit-placed) .megulit-old-line{display:none!important}',
    '#megulit-page-ahead{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none}','#megulit-page-ahead>i{position:fixed;display:block;pointer-events:none;background:none}',
    /* every line of the page is a full-window .sentence-text: only its characters take the pointer, or the top one swallows the clicks meant for the lines under it */
    'body.megulit-placed .megulit-place-window .sentence-text{pointer-events:none!important}',
    /* Dashes (― — ─ and their kin; never the long-vowel mark ー, which is a letter and stays the font's). A game draws
       「――」 as one unbroken line: its font's dash fills the cell. Reader fonts draw it short, low or with a gap, so the
       glyph is hidden and a stroke is drawn across the token's whole box at mid height, 7 % of the size thick, a hair
       past both edges so neighbours join. One rule for every path: the reader's own box, a flow page, in-place boxes.
       (2026-11-15: three attempts lived only in in-place mode and the last one was thinner than the game's.) */
    '.sentence-text .char-token.megulit-dash{position:relative;-webkit-text-fill-color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important;overflow:visible!important}',
    '.sentence-text .char-token.megulit-dash::after{content:"";position:absolute;left:-.03em;right:-.03em;top:50%;height:max(1px,.07em);margin-top:calc(max(1px,.07em) / -2);background:var(--megulit-dash-color,currentColor);pointer-events:none}',
    '#megulit-place-extras{position:fixed;inset:0;pointer-events:none;z-index:2147483000;background:none}',
    'body.megulit-placed .megulit-place-window .tomoyo-cn-row{position:absolute!important;margin:0!important;padding:0!important;background:none!important;border:0!important;box-shadow:none!important;pointer-events:auto}',
    inline + '{display:block!important}',
    inline + ' :is(.sentence-text:not(.megulit-old-line),.tomoyo-cn-row,.tomoyo-cn-output):not([hidden]){display:inline!important;position:static!important;width:auto!important;padding:0!important;margin:0!important;text-indent:0!important;white-space:normal!important;overflow-wrap:anywhere!important;line-break:strict}',
    inline + ' .sentence-text:not(.megulit-old-line) br,' + inline + ' .tomoyo-cn-output br.megulit-cn-br{display:none!important}',
    inline + ' .tomoyo-cn-row:has(.tomoyo-cn-output:not([hidden]):not(:empty))::before{content:" ";white-space:pre;word-spacing:max(0px,var(--tomoyo-gal-gap,0px))}',
  ].join('\n');
  document.head.append(style);
  const blank = c => /^[\s　​﻿]*$/.test(c);
  /* reader characters -> indexes into the placed line's characters (null: not on the game's line, e.g. a repeated copy
     of the sentence). In order, dashes of any kind are one character; a dash the reader has twice where the game has
     it once shares that cell (index + .5 = its right half). null when fewer than 60 % of the game's characters (and
     of the reader's, up to the game's length) are found: another line. */
  const DASHES = /[‒-―─━⸺⸻]/;
  const same = (a, b) => a === b || (DASHES.test(a) && DASHES.test(b));
  function align(reader, placed) {
    /* 2026-11-16 (user: 「今日も明日も明後日も」 drawn as 「今日も明　　後日も」): a greedy match with a short look-ahead lost
       repeated stretches (日も明 twice) and anything after a long run of the game's extra glyphs (ruby, a doubled copy).
       A longest common subsequence keeps every character the two texts share, in order, earliest copy first. */
    const n = reader.length, m = placed.length, out = new Array(n).fill(null); let found = 0;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let j = n - 1; j >= 0; j--) for (let q = m - 1; q >= 0; q--) L[j][q] = same(reader[j], placed[q]) ? L[j + 1][q + 1] + 1 : Math.max(L[j + 1][q], L[j][q + 1]);
    for (let j = 0, q = 0; j < n && q < m;) {
      if (same(reader[j], placed[q]) && L[j][q] === L[j + 1][q + 1] + 1) { out[j] = q; found++; j++; q++; }
      else if (L[j][q + 1] >= L[j + 1][q]) q++; else j++;
    }
    /* two reader dashes on one game dash: the second takes the right half of the first's box */
    for (let j = 1; j < n; j++) { const prev = out[j - 1]; if (out[j] == null && prev != null && prev % 1 === 0 && DASHES.test(reader[j]) && DASHES.test(placed[prev]) && !DASHES.test(placed[prev + 1] || '')) out[j] = prev + .5; }
    const need = Math.ceil(.6 * Math.min(placed.length, reader.length));
    return found && found >= need ? out : null;
  }
  b.textPlaceAlign = align;
  /* per-character placement on the game's boxes (the layout before 2026-11-16) instead of the anchored reader layout */
  /* the game's place is in use for this game (placement on, anchored mode): stable while lines come and go, unlike the body class */
  b.textPlaceAnchorActive = () => on && anchorMode;
  b.textPlaceEngineRowsActive = () => on && window.MeguLitProfile?.get?.('page.engineRows', false) === true;
  b.textPlaceAnchor = v => { anchorMode = v !== false; document.body.classList.toggle('megulit-anchor-mode', on && anchorMode); anchor = null; anchorLine = ''; schedule?.(); };
  /* the user's own translation wrap width (% of the game box, 0 = nothing set) and line spacing (em offset) for rows a game's glyphs lock;
     the default width (75) and a zero offset are "not set", so a game nobody touched keeps the size that follows its text */
  const userRowLayout = prefs => {
    const width = Number(prefs?.translationWidth), spacing = Number(prefs?.translationLineHeight);
    return { width: Number.isFinite(width) && width > 0 && width <= 100 && width !== 75 ? width : 0, lineHeight: Number.isFinite(spacing) ? Math.max(-.8, Math.min(3, spacing)) : 0 };
  };
  const median = list => { const v = list.filter(n => n > 0).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; };
  function target() {
    const own = document.querySelector('.sentence-window.tomoyo-hook-reader');
    return own && own.isConnected ? own : document.querySelector('.sentence-window');
  }
  /* the reader's own layout, its first character on the anchor */
  function pin(win, sentence) {
    if (!anchor || !win || !sentence) return;
    document.body.classList.add('megulit-anchored'); win.classList.add('megulit-anchor-window');
    for (const p of ['left', 'top']) win.style.removeProperty(p);
    /* 2026-11-21 (owner's recording: the translation jumped back and forth while a slider moved): the rows a previous frame closed
       up are opened before anything is measured, so every frame places the line from the same layout and decides once */
    const row = win.querySelector('.tomoyo-cn-row');
    sentence.style.removeProperty('line-height'); row?.style.removeProperty('margin-top'); row?.style.removeProperty('translate');
    const tok = sentence.querySelector('.char-token'), wr = win.getBoundingClientRect(), tr = tok?.getBoundingClientRect();
    /* 2026-11-19 (user: 「左右留白和边距现在都调整不了文本框位置了」): in anchored mode the box position fields are the line's offset
       from the game's own place, saved with the game's profile (anchorDX/anchorDY, client %, 0 = on the game's first character);
       the reader's own box position x/y stays as it was. A change re-pins at once (the root style observer below). */
    const pr = b.galPreferences?.() || {}, info0 = b.galLayoutInfo?.(), dpr0 = devicePixelRatio || 1, cwc = info0?.clientWidth ? info0.clientWidth / dpr0 : innerWidth, chc = info0?.clientHeight ? info0.clientHeight / dpr0 : innerHeight;
    /* an offset never takes the first character out of the game client (a stray value must not lose the line for good) */
    const cx0 = info0?.clientWidth ? (info0.clientX || 0) / dpr0 : 0, cy0 = info0?.clientHeight ? (info0.clientY || 0) / dpr0 : 0;
    const offX = Math.max(cx0 - anchor[0], Math.min(cx0 + cwc - 40 - anchor[0], (Number(pr.anchorDX) || 0) / 100 * cwc)), offY = Math.max(cy0 - anchor[1], Math.min(cy0 + chc - 40 - anchor[1], (Number(pr.anchorDY) || 0) / 100 * chc));
    appliedOffset = {x:offX / cwc * 100, y:offY / chc * 100};
    if (tr && tr.width && anchor.center) { set(win, 'left', (anchor[0] + offX - wr.width / 2) + 'px'); set(win, 'top', (wr.top + anchor[1] + offY - tr.top) + 'px'); set(win, 'right', 'auto'); set(win, 'bottom', 'auto'); set(win, 'margin', '0'); }
    else if (tr && tr.width) { set(win, 'left', (wr.left + anchor[0] + offX - tr.left) + 'px'); set(win, 'top', (wr.top + anchor[1] + offY - tr.top) + 'px'); set(win, 'right', 'auto'); set(win, 'bottom', 'auto'); set(win, 'margin', '0'); }
    /* 2026-11-19 (user, windowed 千恋＊万花: 「不要再挤压我的汉字了 我窗口化呢 只要显示器上还有位置就不要这样」): the translation keeps the
       user's size and goes on below the game window as long as the monitor's work area has room (the overlay spans the desktop);
       only a sentence that does not fit above the work-area bottom is made smaller, never below 85 %, and if it still
       does not fit only the translation scrolls where at least one row fits. The outline and shadow are always the user's own
       (appearance and this game's style profile): 2026-11-19 (user, windowed 千恋＊万花: 「为啥译文一直有投影，很重很烦还关不掉」) the
       automatic heavy shadow over the game's bottom bar is gone. */
    const parts = row ? [...row.querySelectorAll('*')] : [];
    if (pr.translationInline && win.matches(inline)) {
      const limit = Math.min(innerWidth, cx0 + cwc);
      set(win, 'max-width', Math.max(40, limit - Math.max(cx0, win.getBoundingClientRect().left)) + 'px');
      return;
    }
    /* 2026-11-20 (user, CHAOS;CHILD: 「译文咋没对齐」「译文排版同步一下」): the translation takes the Japanese block's width and side,
       centred under a centred page, from the first character of a left-aligned box; never narrower than half the box (a short line keeps a readable translation).
       2026-11-26 (QQ essence 1137, integration live test on 死に逝く君: the anchored line ignored 译文换行宽度): a wrap width the user changed from its
       default is the translation's width here too (% of the game client, inside the room right of the line); the default keeps the Japanese width */
    if (row) { for (const p of ['max-width', 'margin-left', 'margin-right']) row.style.removeProperty(p);
      const toks = [...sentence.querySelectorAll('.char-token')].filter(t => !t.closest('.tome-page-lines')).map(t => t.getBoundingClientRect()).filter(r => r.width > 0);
      if (toks.length) { const l = Math.min(...toks.map(r => r.left)), r = Math.max(...toks.map(r => r.right)), rr = row.getBoundingClientRect(), own = userRowLayout(pr), w = own.width > 0 ? Math.max(80, Math.min(anchor.center ? cwc - 16 : cx0 + cwc - l - 8, cwc * own.width / 100)) : Math.max(r - l, wr.width * .5);
        set(row, 'max-width', Math.ceil(w) + 'px'); if (anchor.center) { set(row, 'margin-left', 'auto'); set(row, 'margin-right', 'auto'); } else set(row, 'margin-left', Math.max(0, Math.round(l - rr.left)) + 'px'); } }
    for (const o of row ? [row, ...parts] : []) o.style.removeProperty('font-size');
    const cnBase = row ? parseFloat(getComputedStyle(parts[0] || row).fontSize) || 16 : 16; // All fit passes share the user's 85% floor
    /* 2026-11-20 (CHAOS;CHILD acceptance: a two-row dialogue line put its translation over the game's AUTO/SKIP buttons and under
       the box's bottom edge): a text box's line stays inside the game client above the strip a game keeps under its last text row
       for its own buttons (two glyph rows). What does not fit there: first the Japanese rows close up (ruby on top, no game pitch),
       then the translation is at most 15 % smaller, then only the translation is constrained, for that sentence only. A centred page is not a box. */
    /* 2026-11-20 release check (user 2026-11-19, windowed 千恋＊万花: 「只要显示器上还有位置就不要这样」): the button-strip rule is for a game that
       fills the screen; when the work area has room for the translation below the game window it goes there at full size (the rule further down) */
    /* 2026-11-21 (owner's second recording, 千恋＊万花: the translation went out of sight below the window): MeguLit's own surface may end before
       the work area does (the overlay spans the reader and the game, not always the desktop); what is drawn past its bottom is not seen */
    const workLimit = () => { const i = b.galLayoutInfo?.(), d = devicePixelRatio || 1; return Math.min(Number.isFinite(i?.workBottom) && i.workBottom > 0 ? i.workBottom / d : innerHeight, innerHeight) - 8; };
    /* 2026-11-21 (owner, 千恋＊万花: 「日文被挤上去」 when the translation came in late): every fit decision takes the row at the room
       its translation will need (inject.js translationReserve), so the Japanese is placed on the first frame and stays when the text lands */
    /* 2026-11-21 incr9: 18468201 (decide with the reserved translation room) put the Japanese a row up on almost every named line of
       千恋＊万花 (owner: 「现在成必发了」); reverted for every game: the row as it is */
    if (row) for (const p of ['margin-top', 'max-height', 'overflow-y', 'overscroll-behavior']) row.style.removeProperty(p);
    const rowRect = () => row.getBoundingClientRect();
    const roomBelow = (() => { const wb = workLimit(); return row ? wb - (cy0 + chc) >= rowRect().height : false; })();
    /* 2026-11-20 release check (CHAOS;CHILD rig: with room below the window the strip rule was skipped whole and the Japanese third row
       sat on AUTO/SKIP). Japanese-only overflow is handled independently of the translation,
       and with room on the monitor the translation keeps its size; when it would land on the strip it goes below the window instead. */
    // Fit Japanese against its own extent, never against a late translation.
    // A dialogue box with downward growth keeps its first glyph at the measured origin
    // even while the new Japanese wraps differently pending the engine's row breaks.
    const growsDown = window.MeguLitProfile?.get?.('placement.translationGrowsDown', false) === true;
    if (!growsDown && !anchor.estimated && !anchor.center && tr && tr.height) { const glyph = tr.height, uiLimit = cy0 + chc - glyph * 2;
      sentence.style.removeProperty('line-height'); let sx = sentence.getBoundingClientRect();
      if (sx.bottom > uiLimit && sentence.querySelector('br.megulit-row-br')) { set(sentence, 'line-height', closeRows(sentence)); sx = sentence.getBoundingClientRect(); }
      if (sx.bottom > uiLimit) { const up = Math.min(sx.bottom - uiLimit, Math.max(0, win.getBoundingClientRect().top - cy0)); set(win, 'top', (parseFloat(win.style.top) || win.getBoundingClientRect().top) - up + 'px'); }
    }
    // A GPU-placed dialogue can move to the client edge. Move only the translation so the Japanese keeps its anchor.
    if (row && anchor.gpu && !page && tr?.height) {
      const rb = rowRect(), top = Math.max(0, cy0), bottom = Math.min(cy0 + chc, workLimit());
      if (rb.height > 0 && rb.bottom > bottom && bottom > top) {
        const jp = sentence.getBoundingClientRect(), gap = Math.max(4, tr.height * .2);
        const upperEdge = Math.min(bottom, jp.top - gap), lowerEdge = Math.max(top, rb.top, jp.bottom + gap);
        const aboveRoom = Math.floor(upperEdge - top), belowRoom = Math.floor(bottom - lowerEdge);
        const above = rb.height <= aboveRoom || aboveRoom >= belowRoom;
        const room = above ? aboveRoom : belowRoom;
        if (room > 0) {
          if (rb.height > room) {
            set(row, 'max-height', room + 'px'); set(row, 'overflow-y', 'auto'); set(row, 'overscroll-behavior', 'contain');
          }
          const y = above ? upperEdge - Math.min(room, rb.height) : lowerEdge;
          set(row, 'translate', '0 ' + (y - rb.top) + 'px');
          return;
        }
      }
    }
    if (row && roomBelow && !anchor.center && tr && tr.height) { const glyph = tr.height;
      /* 2026-11-21 (owner's third recording, 千恋＊万花, speaker row + one line: the translation left a box that had a free third row for below
         the window): the two glyph rows kept clear under the last text row are for MeguLit's Japanese (CHAOS;CHILD's AUTO/SKIP); the game's own
         buttons take about one and a half of the game's own glyph rows (千恋＊万花 31 px glyphs: its box keeps a free third row; CHAOS;CHILD 40 px:
         AUTO/SKIP start 80 px above the bottom, its box has no third row), so the translation stays under its Japanese while it ends there */
      const cnLimit = cy0 + chc - (anchor.size > 0 ? anchor.size : glyph) * 1.5;
      const rr = rowRect(), over = rr.bottom - cnLimit, key = String(anchorLine || '');
      let below = cnBelow.key === key && cnBelow.below;
      if (rr.top >= cy0 + chc) below = false; /* already under the window: nothing to move */
      /* (the fit check follows the hysteresis) 2026-11-21 (owner's recording, 千恋＊万花 window almost the whole screen: the translation went under the window onto the taskbar and off the
         screen): below the window only when the whole row fits there above the work area's bottom; otherwise it stays under its Japanese
         inside the game and the in-window rule makes it at most 15 % smaller */
      else below = below ? over > -glyph * .5 : over > glyph * .25;
      /* 2026-11-21 (owner: works with a negative 原文与译文间距 and drags it there): at a negative gap the translation always stays under its
         Japanese inside the box, whatever the earlier state; the hysteresis only covers positive gaps */
      const userGap = parseFloat(getComputedStyle(row).marginTop) || 0;
      const refused = below && (userGap < 0 || cy0 + chc + 4 + rr.height > workLimit()); if (refused) below = false;
      cnBelow = { key, below };
      /* below the window: right against its bottom edge (4 px), never further */
      /* the row's margin is the user's 原文与译文间距 (it may be negative); the new margin replaces it, so it is counted in (it was not: the row
         landed off by the gap, under the taskbar or past MeguLit's surface at -19..-28) */
      if (below) set(row, 'margin-top', Math.ceil(cy0 + chc - rr.top + 4 + (parseFloat(getComputedStyle(row).marginTop) || 0)) + 'px');
      else if (refused) inWindow(); }
    else if (row && !roomBelow && !anchor.center && tr && tr.height) inWindow();
    function inWindow() { const glyph = tr.height, uiLimit = cy0 + chc - glyph * 2;
      const fsx = parseFloat(getComputedStyle(parts[0] || row).fontSize) || 16; let rx = rowRect();
      if (rx.bottom > uiLimit) { const fs = Math.max(Math.ceil(cnBase * .85), Math.floor(fsx * Math.max(.85, (uiLimit - rx.top) / Math.max(1, rx.height)))); for (const o of parts.length ? parts : [row]) set(o, 'font-size', fs + 'px'); rx = rowRect(); }
    }
    if (row) { const limit = workLimit();
      const fs0 = parseFloat(getComputedStyle(parts[0] || row).fontSize) || 16; let rb = row.getBoundingClientRect();
      if (rb.bottom > limit) { /* 2026-11-20 (user: 「译文为啥都这么小啊 别这么小」): at most 15 % smaller; remaining overflow belongs to the translation alone */ const fs = Math.max(Math.ceil(cnBase * .85), Math.floor(fs0 * Math.max(.85, (limit - rb.top) / Math.max(1, rb.height)))); for (const o of parts.length ? parts : [row]) set(o, 'font-size', fs + 'px'); rb = row.getBoundingClientRect(); }
      // The calibrated Japanese baseline wins even when the translation cannot fit.
      const available = Math.floor(limit - rb.top), oneLine = parseFloat(getComputedStyle(parts[0] || row).lineHeight) || cnBase * 1.4;
      if (rb.bottom > limit && available >= oneLine) {
        set(row, 'max-height', available + 'px'); set(row, 'overflow-y', 'auto'); set(row, 'overscroll-behavior', 'contain');
      }
    }
  }
  function release(fallback = false, repin = true) {
    clearBand();
    document.querySelector('.megulit-script-history')?.remove();
    document.body.classList.remove('megulit-native-cells');
    if (!page) document.body.classList.remove('megulit-placed');
    document.body.classList.remove('megulit-anchored');
    for (const br of document.querySelectorAll('br.megulit-row-br,br.megulit-cn-br')) br.remove();
    for (const w of document.querySelectorAll('.megulit-anchor-center,.megulit-page-fresh')) w.classList.remove('megulit-anchor-center', 'megulit-page-fresh');
    for (const w of document.querySelectorAll('.megulit-anchor-window')) w.style.removeProperty('max-width');
    for (const w of document.querySelectorAll('.megulit-anchor-window')) { w.classList.remove('megulit-anchor-window', 'megulit-game-rows', 'megulit-rows-predicted'); w.style.removeProperty('--megulit-centre-width'); const cr = w.querySelector('.tomoyo-cn-row'); if (cr) for (const p of ['max-width', 'margin-left', 'margin-right', 'max-height', 'overflow-y', 'overscroll-behavior', 'translate']) cr.style.removeProperty(p); for (const p of ['left', 'top', 'right', 'bottom', 'margin']) w.style.removeProperty(p); w.querySelector('.sentence-text')?.style.removeProperty('line-height'); }
    document.body.classList.toggle('megulit-place-fallback', fallback === true);
    for (const w of document.querySelectorAll('.megulit-place-window')) {
      w.classList.remove('megulit-place-window');
      w.querySelector('.megulit-native-sentence')?.classList.remove('megulit-native-sentence');
      for (const o of w.querySelectorAll('.tomoyo-cn-row *')) { o.style.removeProperty('font-size'); o.style.removeProperty('line-height'); }
      for (const n of w.querySelectorAll('.char-token,.megulit-ruby-base,.tomoyo-cn-row')) { n.classList.remove('megulit-unplaced'); for (const p of ['left', 'top', 'width', 'height', 'font-size', 'line-height','--megulit-cell-scale']) n.style.removeProperty(p); }
    }
    if (lastGeom) { lastGeom = ''; dispatchEvent(new CustomEvent('megulit-reveal-progress', { detail: { typing: false } })); }
    /* between lines (the next one not matched yet) the text stays where the last line was, not at the reader's own place */
    if (fallback === true && repin && anchorMode && anchor) { const w = target(); pin(w, w?.querySelector('.sentence-text:not(.megulit-old-line)')); }
  }
  /* record px are game-client px; the reader surface may be larger than the game (galLayoutInfo: client origin and size
     in physical px), CSS px = physical / devicePixelRatio */
  function mapper(client, frameLayout) {
    const layout = b.galLayoutInfo?.(), info = layout?.clientWidth ? layout : frameLayout, dpr = devicePixelRatio || 1, cw = client?.[0] || innerWidth, ch = client?.[1] || innerHeight;
    const ox = info?.clientWidth ? (info.clientX || 0) / dpr : 0, oy = info?.clientHeight ? (info.clientY || 0) / dpr : 0;
    const k = info?.clientWidth ? info.clientWidth / cw / dpr : innerWidth / cw, ky = info?.clientHeight ? info.clientHeight / ch / dpr : innerHeight / ch;
    /* the game client on the reader surface: nothing is ever drawn outside it (a box with no size, not finite or
       outside the client is no box; the rest is clamped in) */
    const L = ox, T = oy, R = ox + cw * k, B = oy + ch * ky;
    const map = r => {
      if (!Array.isArray(r) || r.length < 4) return null;
      let [x, y, w, h] = [ox + r[0] * k, oy + r[1] * ky, r[2] * k, r[3] * ky];
      if (![x, y, w, h].every(Number.isFinite) || !(w > 0 && h > 0) || x >= R || y >= B || x + w <= L || y + h <= T) return null;
      w = Math.min(w, R - L); h = Math.min(h, B - T);
      return [Math.min(Math.max(x, L), R - w), Math.min(Math.max(y, T), B - h), w, h];
    };
    map.bounds = [L, T, R, B];
    return map;
  }
  const dialogueArea = () => window.MeguLitProfile?.get?.('placement.dialogueArea');
  b.textPlaceUsesDialogueArea = () => on && anchorMode && !!dialogueArea();
  function clearBand() {
    if (!bandWindow) return;
    bandWindow.classList.remove('megulit-dialogue-band', 'megulit-anchor-window');
    for (const key of ['left','top','right','bottom','width','max-width','height','max-height','margin','--megulit-dialogue-pitch','--megulit-band-fit','--megulit-band-ruby-room']) bandWindow.style.removeProperty(key);
    bandWindow = null;
  }
  function retireBand(text) {
    if (!b.textPlaceUsesDialogueArea()) return;
    const sentence = target()?.querySelector('.sentence-text:not(.megulit-old-line)'), current = readerLine();
    if (current && text && (current === text || current.includes(text) && text.length / current.length >= .6)) bandRetired = {sentence,sequence:sentence.dataset.sequence,text:current};
  }
  function placeBand(win, sentence, region, text) {
    const client = b.gameArea?.(), ref = region?.client;
    if (!client || !(ref?.[0] > 0 && ref[1] > 0 && region.w > 0 && region.h > 0)) return false;
    const scale = Math.min(client.width / ref[0], client.height / ref[1]);
    const x = client.left + (client.width - ref[0] * scale) / 2, y = client.top + (client.height - ref[1] * scale) / 2;
    const minX = Math.max(2, client.left + 2), maxX = Math.min(innerWidth - 2, client.left + client.width - 2);
    const minY = Math.max(2, client.top + 2), maxY = Math.min(innerHeight - 2, client.top + client.height - 2);
    const left = Math.max(minX, x + region.x * scale), right = Math.min(maxX, x + (region.x + region.w) * scale);
    const top = Math.max(minY, y + region.y * scale), bottom = Math.min(maxY, y + (region.y + region.h) * scale);
    if (right - left < 40 || bottom - top < 12) return false;
    const records = page?.lines || [], cur = records.findLast(l => [...l.text].filter(c => !blank(c)).join('').includes(text));
    // An armed page can hold several visible native lines at once. Keep their own rows and move the page as a unit.
    if (cur && page.armed && page.awake && records.filter(l => l.rects.some(Boolean)).length > 1) return false;
    if (bandWindow !== win) { const oldPage = page; page = null; release(true, false); page = oldPage; }
    bandWindow = win;
    win.classList.add('megulit-dialogue-band', 'megulit-anchor-window');
    const body = document.body;
    body.classList.add('megulit-anchored');
    body.classList.remove('megulit-place-garbled','megulit-place-asleep');
    if (pageOwn) { pageOwn = false; briefSync(false); }
    const native = gameDrawn() || cur && page?.awake && !page.armed;
    document.body.classList.toggle('megulit-place-game-drawn', !!native);
    const retired = bandRetired?.sentence === sentence && bandRetired.sequence === sentence.dataset.sequence && bandRetired.text === text;
    body.classList.toggle('megulit-place-gone', retired);
    body.classList.remove('megulit-cleared-translation');
    if (!native && cur) drawn(cur);
    const prefs = b.galPreferences?.() || {};
    const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
    const width = right - left, height = bottom - top;
    const l = clamp(left + (Number(prefs.anchorDX) || 0) * client.width / 100, minX, maxX - width);
    const t = clamp(top + (Number(prefs.anchorDY) || 0) * client.height / 100, minY, maxY - height);
    const ruby = prefs.furigana && prefs.display !== 'chinese' ? (Number(prefs.rubyScale) || .55) : 0;
    const pitch = Math.max(1.18 + ruby, (ruby ? 1.85 : 1.4) + (Number(prefs.lineHeight) || 0));
    set(win,'--megulit-dialogue-pitch',String(pitch));
    set(win,'--megulit-band-ruby-room',ruby ? Math.max(.15, ruby + .32 - (pitch - 1) * .5) + 'em' : '0px');
    for (const [key,value] of Object.entries({left:l+'px',top:t+'px',width:width+'px','max-width':width+'px',height:height+'px','max-height':height+'px',right:'auto',bottom:'auto',margin:'0'})) set(win,key,value);
    appliedOffset = {x:(l-left)/client.width*100,y:(t-top)/client.height*100};
    set(win,'--megulit-band-fit','1');
    for (let fit = 1; fit > .5 && win.scrollHeight > win.clientHeight + 1;) {
      fit = Math.max(.5, fit * .92);
      set(win,'--megulit-band-fit',fit.toFixed(3));
    }
    document.getElementById('megulit-page-ahead')?.replaceChildren();
    return true;
  }
  /* name plate (n) and choices (o) the game drew blank: drawn character by character on their boxes in the reader's own
     text style, click-through (a click on an option reaches the game's own blank button underneath) */
  let extras = { items: [], client: null }, extraKey = '';
  /* 2026-11-21 (owner, ファタモルガーナの館 (KiriKiri): 「选项直接没了，而且对话一直少很多很多」): once the engine hide is proven the game draws
     every message-layer line invisible, choices included, while the reader drew only the lines it could align with a hooked
     sentence (this game's hook text is garbled by its text effects: 「いき、い、き」). A line the game drew hidden that the reader
     has not drawn within ORPHAN_MS is drawn from the placement itself: its own text on its own boxes, like a name or a choice.
     Whatever the game hides is on screen. It stays until the game draws over its place or starts a new page. */
  const ORPHAN_MS = 450;
  /* 2026-11-21 (ファタモルガーナの館, owner's recording 02:57Z: after each click the line just read came back in white without ruby for
     0.7 s): the game had cleared its page at the click ([cm]) while the placement still held the line, and this path drew it from
     its boxes. textPlace {gone} (core/overlay-placement.cjs, from an engine that reports its cleared line): that line, the lines
     waiting and the orphans of the page are gone with it; the line stays the anchor for the next one */
  let goneText = '';
  function pageCleared(text) { goneText = [...String(text || '')].filter(c => !blank(c)).join(''); retireBand(goneText); waits.clear(); orphanWait = null; if (orphans.length) { orphans = []; extraKey = ''; } schedule(); }
  let orphans = [], orphanWait = null;
  /* 2026-11-21 (owner, ファタモルガーナの館 r30: the choice screen showed its frames and nothing in them): the game draws its options one right
     after the other, each a hidden line of its own; only the last one stayed current for ORPHAN_MS, the others never became orphans. Every
     unclaimed hidden line waits on its own (by text) and is drawn when its time is up, current or not, unless the reader drew it meanwhile */
  const waits = new Map(), drawnRecent = new Set(), readerDrawn = new Set(); /* readerDrawn: lines the engine-placed path drew (one render owner: never an orphan after) */
  /* a placed line replaced before any frame drew it (options arrive within one frame) waits like the current one */
  function noteReplaced(l) { if (!l || l.fallback || !Array.isArray(l.rects) || !l.text) return; const t = [...l.text].filter(c => !blank(c)).join(''); if (!t || t === goneText || readerDrawn.has(t) || drawnRecent.has(t) || waits.has(t) || orphans.some(o => o.text === t)) return; waits.set(t, { at: performance.now(), l }); setTimeout(schedule, ORPHAN_MS + 20); }
  function flushWaits() { const now = performance.now(); for (const [t, w] of [...waits]) if (now - w.at >= ORPHAN_MS) { waits.delete(t); if (t) { drawnRecent.add(t); if (drawnRecent.size > 40) drawnRecent.delete(drawnRecent.values().next().value); } orphanWait = { text: t, at: w.at }; orphan(w.l); } }
  /* 2026-11-21 (owner, ファタモルガーナの館: 「一直挂着一个文本」, an old line drawn after the player had moved on): the player's advance input
     (readerInput complete: a click, Space or Enter in the game, from GalWindowBridge) cancels every orphan still waiting from before it
     (ADV_GRACE: native polling may report the click just after the next line was placed); a line placed before it is not drawn as an
     orphan any more unless the game places it again (stale). Orphans already drawn stay (a click may move nothing on: beside the
     options, on a word the reader takes): this never makes a game worse. Nothing new is drawn, hiding and positions are untouched. */
  const ADV_GRACE = 150;
  const stale = new Set();
  function advanceInput() {
    const now = performance.now(); let changed = false;
    for (const [t, w] of [...waits]) if (w.at < now - ADV_GRACE) { waits.delete(t); stale.add(t); changed = true; }
    if (orphanWait && orphanWait.at < now - ADV_GRACE) { stale.add(orphanWait.text); orphanWait = null; changed = true; }
    if (stale.size > 32) stale.delete(stale.values().next().value);
    (b.textPlaceAdvances = (b.textPlaceAdvances || 0) + 1); return changed;
  }
  b.textPlaceAdvance = advanceInput;
  function bindAdvance() { if (b.textPlaceAdvanceBound || typeof b.galStatus !== 'function') return; b.textPlaceAdvanceBound = true; const previous = b.galStatus; b.galStatus = m => { previous(m); if (m?.type === 'readerInput' && m.complete === true) advanceInput(); }; }
  /* the reader's own current line, characters only (the engine-placed path draws it: the orphan path never does) */
  function readerOwns(text) { const t = [...String(text || '')].filter(c => !blank(c)).join(''); if (!t) return false; const s = target()?.querySelector('.sentence-text:not(.megulit-old-line)'); const r = s ? [...s.querySelectorAll('.char-token')].map(x => x.textContent).join('').replace(/[\s　]/g, '') : ''; const src = [...String(b.hookSourceText || '')].filter(c => !blank(c)).join(''); return !!(r && (r === t || r.includes(t) || t.includes(r) && r.length >= t.length * .6)) || !!(src && (src === t || src.includes(t))); }
  function orphanItems() { const taken = new Set(extras.items.map(i => [...String(i.text || '')].filter(c => !blank(c)).join(''))); return orphans.filter(o => !taken.has(o.text) && !readerOwns(o.text) && !readerDrawn.has(o.text)).map(o => ({ id: 'orphan:' + o.text, kind: 'l', text: o.text, rects: o.rects, client: o.client })); }
  function overlaps(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }
  /* a new placed line: orphans under its boxes are gone (the game drew over them); a line starting above every orphan is a new page */
  function orphansMeet(l) {
    const rs = (l?.rects || []).filter(r => Array.isArray(r) && r[2] > 0 && r[3] > 0); if (!rs.length || !orphans.length) return;
    const lt = [...String(l.text || '')].filter(c => !blank(c)).join(''); if (orphans.some(o => o.text === lt)) return; /* the orphan itself, frame after frame */
    const top = Math.min(...rs.map(r => r[1])), first = Math.min(...orphans.flatMap(o => o.rects.map(r => r[1])));
    const keep = top <= first ? [] : orphans.filter(o => !o.rects.some(a => rs.some(b => overlaps(a, b))));
    if (keep.length !== orphans.length) { orphans = keep; extraKey = ''; schedule(); }
  }
  /* the placed line is not drawn by the reader (no matching sentence, nothing aligned, no box): after ORPHAN_MS it is drawn from the placement */
  /* 2026-11-21 (owner, ファタモルガーナの館 vs 千恋＊万花): a game whose text effect keeps the hidden line from pairing with the reader's
     (the reader can only redraw it at the game's place, an orphan) is not served by hiding: of the first 20 lines of a game, at least 6
     seen and over 30 % orphans sends galTextEffects once and core shows the game's own text with the translation only (read mode).
     Every counted line is logged (layoutDiagnostic kind=textEffects) so the real rates show in the owner's logs */
  let fx = { game: null, paired: new Set(), orphan: new Set(), sent: false };
  function fxCount(kind, key) {
    key = [...String(key || '')].filter(c => !blank(c)).join(''); if (!key) return;
    if (fx.game !== modeGame) fx = { game: modeGame, paired: new Set(), orphan: new Set(), sent: false };
    if (fx.sent || fx.paired.has(key) || fx.orphan.has(key) && kind === 'orphan') return;
    if (fx.paired.size + fx.orphan.size >= 20 && !fx.orphan.has(key)) return;
    if (kind === 'paired') fx.orphan.delete(key); fx[kind].add(key);
    const n = fx.paired.size + fx.orphan.size, rate = fx.orphan.size / n;
    try { window.__tomoyoTranslateRequest?.(JSON.stringify({ type: 'layoutDiagnostic', kind: 'textEffects', line: kind, paired: fx.paired.size, orphan: fx.orphan.size, rate: Math.round(rate * 100) })); } catch {}
    if (n >= 6 && rate > .3) { fx.sent = true; try { window.__tomoyoTranslateRequest?.(JSON.stringify({ type: 'galTextEffects', paired: fx.paired.size, orphan: fx.orphan.size })); } catch {} }
  }
  b.textEffectsCount = () => ({ paired: fx.paired.size, orphan: fx.orphan.size, sent: fx.sent });
  function orphan(l) {
    if (!l || l.fallback || !Array.isArray(l.rects) || !l.text) return;
    const chars = [...l.text], rects = []; chars.forEach((c, i) => { if (!blank(c)) rects.push(l.rects[i]); });
    const text = chars.filter(c => !blank(c)).join('');
    if (text && text === goneText) return; /* the game cleared it (textPlace gone) */
    /* 2026-11-21 (owner: never give way because a line cannot be drawn): a line without real boxes is simply not drawn here */
    if (!text || !rects.length || !rects.every(r => Array.isArray(r) && r[2] > 0 && r[3] > 0)) return;
    /* one render owner (owner 2026-11-21): the line the reader draws itself (its current sentence) is never drawn again from the placement */
    if (readerOwns(text) || readerDrawn.has(text)) return;
    if (window.MeguLitProfile?.get?.('placement.orphanDraw', true) === false) return; /* the game's diff: nothing is drawn from the placement */
    if (orphans.some(o => o.text === text) || stale.has(text)) return;
    /* 2026-11-21 (owner, ファタモルガーナの館 r33: a clump of characters in the middle of the screen; two lines on top of each other):
       the text effect redraws one place again and again, and a frame of two passes puts two characters on one box
       (「………自分……の自死体…分…の自だ…」). Such a frame is not a line: it is never drawn */
    { const near = (a, c) => Math.abs(a[0] - c[0]) < Math.min(a[2], c[2]) * .5 && Math.abs(a[1] - c[1]) < Math.min(a[3], c[3]) * .5; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (near(rects[i], rects[j])) return; }
    const now = performance.now();
    if (orphanWait?.text !== text) { if (!waits.has(text)) waits.set(text, { at: now, l }); if (waits.size > 16) waits.delete(waits.keys().next().value); orphanWait = { text, at: waits.get(text).at }; setTimeout(schedule, ORPHAN_MS + 20); if (now - orphanWait.at < ORPHAN_MS) return; }
    if (now - orphanWait.at < ORPHAN_MS) return;
    /* one place, one line: an orphan whose boxes the new one covers is an earlier frame of it (the last one wins) */
    fxCount('orphan', text);
    orphans = orphans.filter(o => !o.rects.some(a => rects.some(c => overlaps(a, c)))).concat({ text, rects, client: l.client }).slice(-12); extraKey = ''; orphanWait = null; schedule(); waits.delete(text);
    const log = b.textPlaceOrphans || (b.textPlaceOrphans = []); log.push(text.slice(0, 40)); if (log.length > 30) log.shift();
  }
  /* 2026-11-21 (ファタ acceptance 3/9: the line just read came back in white 0.45 s after the next one): a line the reader drew is
     remembered as drawn, so its replacement never queues it as an undrawn option (noteReplaced) */
  function drawn(l) { document.body.classList.remove('megulit-place-garbled'); const t = l ? [...String(l.text || '')].filter(c => !blank(c)).join('') : ''; waits.delete(t); if (t) { readerDrawn.add(t); if (readerDrawn.size > 40) readerDrawn.delete(readerDrawn.values().next().value); } if (orphanWait?.text === t) orphanWait = null; if (orphans.some(o => o.text === t)) { orphans = orphans.filter(o => o.text !== t); extraKey = ''; } }
  function drawExtras() {
    let layer = document.getElementById('megulit-place-extras');
    const all = extras.items.concat(orphanItems());
    const key = on ? JSON.stringify(extras) + JSON.stringify(orphans) + innerWidth + 'x' + innerHeight + JSON.stringify(b.galLayoutInfo?.() || null) : '';
    if (key === extraKey) return; extraKey = key;
    if (!on || !all.length) { if (layer) { layer.remove(); window.__tomoyoHitRegionsRefresh?.(true); } return; }
    if (!layer) { layer = document.createElement('div'); layer.id = 'megulit-place-extras'; layer.setAttribute('aria-hidden', 'true'); document.body.append(layer); }
    const ref = document.querySelector('.sentence-window .char-token'), cs = ref ? getComputedStyle(ref) : null, map = mapper(extras.client);
    layer.replaceChildren();
    for (const item of all) {
      const chars = [...item.text].filter(c => !blank(c)), boxes = item.rects.map(item.client ? mapper(item.client) : map);
      if (!boxes.length || !boxes.every(Boolean)) continue;
      const size = Math.max(6, median(boxes.map(r => r[2])) || median(boxes.map(r => r[3])));
      const group = document.createElement('div'); group.className = 'megulit-place-extra megulit-place-' + (item.kind === 'n' ? 'name' : item.kind === 'l' ? 'line' : 'choice');
      chars.forEach((c, i) => { const r = boxes[i]; if (!r) return; const span = document.createElement('span'); span.textContent = c;
        span.style.cssText = 'position:absolute;left:' + r[0] + 'px;top:' + r[1] + 'px;width:' + r[2] + 'px;height:' + r[3] + 'px;line-height:' + r[3] + 'px;font-size:' + size + 'px;text-align:center;white-space:pre';
        if (cs) for (const p of ['color', 'font-family', 'font-weight', 'text-shadow', '-webkit-text-stroke', 'paint-order']) span.style.setProperty(p, cs.getPropertyValue(p));
        group.append(span); });
      layer.append(group);
    }
    window.__tomoyoHitRegionsRefresh?.(true);
  }
  /* 2026-11-20 (CHAOS;CHILD two-row line: closed up to 1.45 the furigana of the second row sat on the first row's glyphs): the
     tightest row pitch that still leaves the ruby its own height above the next row (ruby scale of the text, plus a small gap) */
  function closeRows(n) { const rs = parseFloat(getComputedStyle(n).getPropertyValue('--tomoyo-ruby-scale')) || .55; return String(Math.max(1.45, Math.round((1 + rs + .12) * 100) / 100)); }
  function set(n, p, v) { if (n.style.getPropertyValue(p) !== v) n.style.setProperty(p, v, 'important'); }
  /* the reader's current line, as the placement compares it (blanks out) */
  function readerLine() {
    const sentence = target()?.querySelector('.sentence-text:not(.megulit-old-line)');
    return sentence ? [...sentence.querySelectorAll('.char-token')].filter(t => !t.closest('.tome-page-lines') && !t.hasAttribute('data-tomoyo-leading-space') && !blank(t.textContent)).map(t => t.textContent).join('') : '';
  }
  /* one switch for "the game's own line is on screen, the reader's Japanese stays out": a line the game draws while MeguLit is hiding
     (line model, `hiding`), or a page the layer does not hide (page model, pageOwn). 2026-11-19 (user, 沙耶の唄 1.4.17: the first
     line of a page stayed and MeguLit drew the same line under it): the page branch set megulit-place-game-drawn and took
     megulit-placed away in the same step, and the rule that hides the Japanese needs both. */
  function briefSync(lineBrief) { const brief = lineBrief === true || pageOwn; if (document.body.classList.contains('megulit-game-line-brief') !== brief) document.body.classList.toggle('megulit-game-line-brief', brief); }
  function gameDrawn() {
    const text = on && drawnByGame ? readerLine() : '';
    const drawn = !!text && drawnByGame.includes(text);
    if (document.body.classList.contains('megulit-place-game-drawn') !== drawn) { document.body.classList.toggle('megulit-place-game-drawn', drawn); window.__tomoyoHitRegionsRefresh?.(true); }
    /* the same line while MeguLit is hiding the game's text (core/overlay-placement.cjs `hiding`): the game's own line is there until the hide is back, wherever the reader's line sits */
    briefSync(drawn && drawnHiding);
    /* engine-draw (docs/engine-draw-protocol.md): emb=2, the game drew this line's ruby and Chinese itself; the reader adds nothing */
    const embedded = drawn && drawnEmbedded === 2; if (document.body.classList.contains('megulit-game-embedded') !== embedded) document.body.classList.toggle('megulit-game-embedded', embedded);
    return drawn;
  }
  let reveal = { id: 0, n: 0, t: 0 };
  /* tags a dash token (see the style rule); leave --megulit-dash-color unset when fill tracks currentColor (or gradient
     transparent fill) so ::after inherits currentColor dynamically across read/unread line colour transitions. Only pin
     --megulit-dash-color when a stylesheet sets an explicit non-transparent -webkit-text-fill-color different from color. */
  function applyDashColor(t, fill, color) {
    if (fill && fill !== 'rgba(0, 0, 0, 0)' && fill !== color) t.style.setProperty('--megulit-dash-color', fill);
    else t.style.removeProperty('--megulit-dash-color');
  }
  function refreshDashColors() {
    const list = [...document.querySelectorAll('.sentence-text .char-token.megulit-dash')];
    if (!list.length) return;
    // Two-phase read/write: lift inline/class overrides on all dashes first so the browser runs one style recalc.
    for (const t of list) { t.classList.remove('megulit-dash'); t.style.removeProperty('-webkit-text-fill-color'); }
    const measured = list.map(t => { const cs = getComputedStyle(t); return [t, cs.webkitTextFillColor, cs.color]; });
    for (const [t, fill, color] of measured) {
      applyDashColor(t, fill, color);
      t.classList.add('megulit-dash');
      t.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    }
  }
  function markDash(t) {
    if (t.classList.contains('megulit-dash') || !DASH.test(t.textContent || '')) return;
    const cs = getComputedStyle(t);
    applyDashColor(t, cs.webkitTextFillColor, cs.color);
    t.classList.add('megulit-dash');
    /* 2026-11-16 (user: 「──」 drawn as two lines of different widths): a game style's own fill / outline rules outranked
       the dash rule, so the glyph was painted under the drawn line. Inline !important wins over every stylesheet. */
    for (const [p, v] of [['-webkit-text-fill-color', 'transparent'], ['-webkit-text-stroke-width', '0px'], ['text-shadow', 'none'], ['paint-order', 'normal']]) t.style.setProperty(p, v, 'important');
  }
  const DASH = /^[‒-―─━⸺⸻]+$/;
  function glyphSize(shown, boxes) {
    const cjk = boxes.filter((r, j) => r && shown[j] && /[^\x00-\x7f｡-ﾟ]/.test(shown[j].textContent)).map(r => r[2]);
    return Math.max(6, median(cjk) || median(boxes.filter(Boolean).map(r => r[3])));
  }
  function placeGlyphs(sentence, place, size, geom, reported = place) {
    let rubyMoved = false;
    for (const base of sentence.querySelectorAll('.megulit-ruby-base')) {
      let rs = [...base.querySelectorAll('.char-token')].map(t => reported.get(t)).filter(Boolean);
      if (!rs.length) continue;
      /* a word the game wrapped (its first characters at the end of a row, the rest on the next): the base is the part
         on the first row, so the reading sits over it; a box over both rows put the reading in the middle of nowhere */
      const top = Math.min(...rs.map(r => r[1])); rs = rs.filter(r => r[1] < top + r[3] * .5);
      const x0 = Math.min(...rs.map(r => r[0])), y0 = top, x1 = Math.max(...rs.map(r => r[0] + r[2])), y1 = Math.max(...rs.map(r => r[1] + r[3]));
      set(base, 'left', x0 + 'px'); set(base, 'top', y0 + 'px'); set(base, 'width', (x1 - x0) + 'px'); set(base, 'height', (y1 - y0) + 'px');
      base.__megulitOrigin = [x0, y0];
      const key = [x0, y0, x1, y1, size, place.has(base.firstElementChild)].join(',');
      if (base.__megulitRubyGeometry !== key) { base.__megulitRubyGeometry = key; rubyMoved = true; }
    }
    for (const [t, r] of place) {
      const base = t.parentElement?.closest('.megulit-ruby-base'), o = base && sentence.contains(base) && base.__megulitOrigin || [0, 0];
      // Fit full-width ink to the game's narrower advances without changing its height or hit box.
      const width = /[^\x00-\x7f｡-ﾟ]/.test(t.textContent) ? Math.max(size, r[2]) : r[2];
      set(t, '--megulit-cell-scale', String(r[2] / width));
      set(t, 'left', (r[0] - o[0]) + 'px'); set(t, 'top', (r[1] - o[1]) + 'px');
      set(t, 'width', width + 'px'); set(t, 'height', r[3] + 'px');
      set(t, 'font-size', size + 'px'); set(t, 'line-height', r[3] + 'px');
      /* a dash is one unbroken stroke across its box in the game; fonts draw it short and raised */
      markDash(t);
      geom?.push(r.map(Math.round).join(','));
    }
    if (rubyMoved) b.measurePlacedRuby?.(sentence);
  }
  /* put a sentence's character tokens on their boxes (boxes[j] for the j-th shown token; a missing box = not drawn yet) */
  function layout(sentence, boxes, geom, visible = boxes.length, nativeCells = null) {
    const tokens = [...sentence.querySelectorAll('.char-token')].filter(t => !t.closest('.tome-page-lines'));
    const shown = tokens.filter(t => !t.hasAttribute('data-tomoyo-leading-space') && !blank(t.textContent));
    const size = glyphSize(shown, boxes);
    for (const t of tokens) if (!shown.includes(t)) t.classList.add('megulit-unplaced');
    const place = new Map(), reported = new Map();
    shown.forEach((t, j) => {
      t.classList.toggle('megulit-native-cell', nativeCells?.[j] === true);
      const r = boxes[j]; if (r) reported.set(t, r);
      if (!r || j >= visible) { t.classList.add('megulit-unplaced'); return; }
      t.classList.remove('megulit-unplaced'); place.set(t, r);
    });
    placeGlyphs(sentence, place, size, geom, reported);
    return { place, size, shown };
  }
  /* a line (or part of one) the reader has no tokens for: plain characters, in the reader sentence's own classes so they sit and look like its characters */
  function plain(text) { const s = document.createElement('div'), like = target()?.querySelector('.sentence-text:not(.megulit-old-line)'); s.className = like ? like.className : 'sentence-text'; [...text].forEach((c, i) => { const span = document.createElement('span'); span.className = 'char-token'; span.dataset.index = String(i); span.textContent = c; s.append(span); }); return s; }
  function dropOld(win, keep) { for (const n of document.querySelectorAll('.megulit-old-line')) if (!keep || !keep.has(n) || n.parentElement !== win) n.remove(); }
  /* layer 4 page model: the whole page on the game's own places. The reader's line is the page line with its text; the
     page's other lines are drawn from the copy kept when they were the reader's line (ruby, word tokens), or as plain
     tokens when the reader never showed them. No page on screen: nothing is drawn. */
  /* issue 468 (寒蝉鸣泣之时解, full-page NVL: the game's text fills the window and MeguLit could not hide it; the translation sat in
     the reader's own box over the game's lines, and moving that box to the bottom only met other lines). While the game draws a page
     itself and the reader's sentence is on it with places, the translation goes right under that sentence's last row, from its first
     character: a page fills from the top, so the space under the newest sentence is the one place no game text is yet. Japanese is
     the game's own (not drawn again), no plate, the user's translation size; a sentence at the very bottom makes it smaller once
     (at most 15 %), then it runs on below the game window (the layer spans the work area). */
  function underGameLine(win, sentence) {
    const text = readerLine(), row = win?.querySelector('.tomoyo-cn-row'); if (!text || !row || !page) return;
    let cur = null; for (let i = page.lines.length - 1; i >= 0; i--) if (page.lines[i].text.includes(text) && page.lines[i].rects.length) { cur = page.lines[i]; break; }
    if (!cur) return;
    const map = pageMap(), at = [...cur.text.slice(0, cur.text.indexOf(text))].length, rs = cur.rects.slice(at, at + [...text].length).map(map).filter(Boolean); if (!rs.length) return;
    const all = page.lines.flatMap(l => l.rects).map(map), x0 = Math.min(...rs.map(r => r[0])), y1 = Math.max(...rs.map(r => r[1] + r[3])), h = median(rs.map(r => r[3])) || 24;
    const right = Math.max(...all.map(r => r[0] + r[2]), ...rs.map(r => r[0] + r[2]));
    document.body.classList.add('megulit-anchored'); win.classList.add('megulit-anchor-window');
    for (const p of ['margin-left', 'margin-right']) row.style.removeProperty(p);
    set(row, 'max-width', Math.ceil(Math.max(right - x0, h * 12)) + 'px'); set(row, 'text-align', 'left');
    for (const o of [row, ...row.querySelectorAll('*')]) o.style.removeProperty('font-size');
    set(win, 'right', 'auto'); set(win, 'bottom', 'auto'); set(win, 'margin', '0');
    const place = () => { const wr = win.getBoundingClientRect(), rr = row.getBoundingClientRect(); set(win, 'left', (wr.left + x0 - rr.left) + 'px'); set(win, 'top', (wr.top + y1 + h * .25 - rr.top) + 'px'); };
    place(); place();
    const info = b.galLayoutInfo?.(), dpr = devicePixelRatio || 1, limit = (Number.isFinite(info?.workBottom) && info.workBottom > 0 ? info.workBottom / dpr : innerHeight) - 8, rb = row.getBoundingClientRect();
    if (rb.height > 0 && rb.bottom > limit) { const fs0 = parseFloat(getComputedStyle(row).fontSize) || 16, fs = Math.max(Math.ceil(fs0 * .85), Math.floor(fs0 * (limit - rb.top) / rb.height)); for (const o of [row, ...row.querySelectorAll('*')]) set(o, 'font-size', fs + 'px'); place(); }
  }
  function pageMap() {
    const map = mapper(page.client), prefs = b.galPreferences?.() || {};
    if (!anchorMode || !(Number(prefs.anchorDX) || Number(prefs.anchorDY))) return map;
    const rects = page.lines.flatMap(l => l.rects).map(map).filter(Boolean);
    if (!rects.length) return map;
    const [l,t,r,bottom] = map.bounds;
    const dx = Math.max(l - Math.min(...rects.map(x=>x[0])), Math.min(r - Math.max(...rects.map(x=>x[0]+x[2])), (Number(prefs.anchorDX) || 0) * (r-l) / 100));
    const dy = Math.max(t - Math.min(...rects.map(x=>x[1])), Math.min(bottom - Math.max(...rects.map(x=>x[1]+x[3])), (Number(prefs.anchorDY) || 0) * (bottom-t) / 100));
    appliedOffset = {x:dx/(r-l)*100,y:dy/(bottom-t)*100};
    const move = value => { const p = map(value); return p && [p[0]+dx,p[1]+dy,p[2],p[3]]; };
    move.bounds = map.bounds;
    return move;
  }
  function applyPage() {
    const body = document.body, win = target(), sentence = win?.querySelector('.sentence-text:not(.megulit-old-line)');
    /* E610 (DDLC Plus live: the layer never armed for a Unity write-back stream, said awake=0, and the reader was hidden for good) only an armed layer's "no page" hides the reader */const asleep = on && page.armed === true && page.awake === false, live = on && page.awake && page.armed && page.lines.length > 0;
    if (body.classList.contains('megulit-place-asleep') !== asleep) { body.classList.toggle('megulit-place-asleep', asleep); window.__tomoyoHitRegionsRefresh?.(true); }
    if (!live || !sentence) { document.getElementById('megulit-page-ahead')?.replaceChildren(); dropOld(null); clones.clear(); const p = page; page = null; release(); page = p; body.classList.remove('megulit-placed'); /* a page the layer does not hide (not armed, or no line has places yet): the game's own text is on screen, the reader's Japanese is never drawn at its own place over it; the translation stays */ const own = on && page.awake; if (body.classList.contains('megulit-place-game-drawn') !== own) { body.classList.toggle('megulit-place-game-drawn', own); window.__tomoyoHitRegionsRefresh?.(true); } /* only where the reader's line follows the game's place (anchor mode): in its own box elsewhere it stays, Japanese on top */ pageOwn = own === true && anchorMode === true; briefSync(false); if (own && sentence) underGameLine(win, sentence); return; }
    if (pageOwn) { pageOwn = false; briefSync(false); }
    /* 2026-11-21 (ファタ two-row page, page.engineRows): the line model's anchored pin (the window moved to the line's anchor) is undone
       before the page places its lines on their own boxes, or every row sits that far off */
    if (document.querySelector('.megulit-anchor-window')) { const p0 = page; page = null; release(false, false); page = p0; }
    const map = pageMap(), readerText = readerLine(), geom = [];
    body.classList.toggle('megulit-native-cells', page.lines.some(l => Array.isArray(l.nativeCells)));
    let cur = null; if (readerText) for (let i = page.lines.length - 1; i >= 0; i--) if (page.lines[i].text.includes(readerText)) { cur = page.lines[i]; break; }
    if (cur && !page.retainedBitmap && anchorMode && document.body.classList.contains('megulit-inline-translation')) {
      const canvas = mapper(page.client);
      const at = [...cur.text.slice(0, cur.text.indexOf(readerText))].length;
      const boxes = cur.rects.slice(at, at + [...readerText].length).map(canvas).filter(Boolean);
      if (boxes.length) {
        const size = median(boxes.map(r => r[3])) || 24;
        const previousPage = page; page = null; release(true, false); page = previousPage;
        if (page.lines.length === 1) { dropOld(null); clones.clear(); document.getElementById('megulit-page-ahead')?.replaceChildren(); }
        body.classList.remove('megulit-place-game-drawn');
        anchorFrom(boxes, size, canvas, readerText, gameRows(boxes, size, canvas, leftEdge).center);
        drawn(cur);
        pin(win, sentence);
        window.__tomoyoHitRegionsRefresh?.();
        return;
      }
    }
    /* 2026-11-16 (QQ group, ライムライト・レモネードジャム: ruby and translation only, no Japanese): an armed page means the game's
       own text is hidden by MeguLit, so the reader's Japanese can never be "drawn by the game". A line not found on the page
       for longer than its places take to arrive goes back to the reader's own box (every engine): never hidden twice. */
    if (cur || !readerText) unmatched = null; else if (unmatched?.text !== readerText) { unmatched = { text: readerText, at: performance.now() }; setTimeout(schedule, UNMATCHED_MS + 20); }
    if (!cur && readerText && page.armed && performance.now() - unmatched.at >= UNMATCHED_MS) { document.getElementById('megulit-page-ahead')?.replaceChildren(); dropOld(null); clones.clear(); const p = page; page = null; release(true); page = p; body.classList.remove('megulit-placed'); if (body.classList.contains('megulit-place-game-drawn')) { body.classList.remove('megulit-place-game-drawn'); window.__tomoyoHitRegionsRefresh?.(true); } return; }
    body.classList.remove('megulit-place-fallback'); body.classList.add('megulit-placed'); win.classList.add('megulit-place-window');
    for (const w of document.querySelectorAll('.megulit-place-window')) if (w !== win) w.classList.remove('megulit-place-window');
    /* the reader's line is not on the page (its places are not claimed yet, or the game shows another page): its Japanese is not drawn anywhere else */
    const nativeCur = cur?.nativeCells?.every(Boolean) === true;
    sentence.classList.toggle('megulit-native-sentence', nativeCur);
    const hideCur = !cur || nativeCur;
    if (body.classList.contains('megulit-place-game-drawn') !== hideCur) body.classList.toggle('megulit-place-game-drawn', hideCur);
    if (cur) {
      const at = [...cur.text.slice(0, cur.text.indexOf(readerText))].length, n = [...readerText].length;
      /* the places arrive from the game in uneven batches (several characters, then nothing for 0.1 s): the line's
         characters are let in one after another, catching up with what has arrived within about 0.1 s */
      const have = Math.max(0, Math.min(n, cur.rects.length - at)), nowT = performance.now();
      if (reveal.id !== cur.id) reveal = { id: cur.id, n: 0, t: nowT };
      if (reveal.n > have) reveal.n = have;
      else if (reveal.n < have && nowT - reveal.t >= 8) { reveal.n = Math.min(have, reveal.n + Math.max(1, (have - reveal.n) * (nowT - reveal.t) / 100)); reveal.t = nowT; }
      if (reveal.n < have) schedule(); else reveal.t = nowT;
      const visible = Math.floor(reveal.n);
      const boxes = cur.rects.slice(at, at + (page.engineRows ? have : visible)).map(map);
      const revealed = layout(sentence, boxes, geom, visible, cur.nativeCells?.slice(at));
      const row = win.querySelector('.tomoyo-cn-row');
      // Anchor and size a native row's translation from its report, including the still-unrevealed glyphs.
      const all = page.engineRows ? boxes.filter(Boolean) : [...revealed.place.values()];
      if (row && all.length) {
        const size = page.engineRows ? glyphSize(revealed.shown, boxes) : revealed.size;
        const x0 = Math.min(...all.map(r => r[0])), y0 = Math.min(...all.map(r => r[1])), x1 = Math.max(...all.map(r => r[0] + r[2])), y1 = Math.max(...all.map(r => r[1] + r[3]));
        const only = body.classList.contains('tomoyo-gal-zh-only');
        set(row, 'left', x0 + 'px'); set(row, 'top', (only ? y0 : y1 + size * .25) + 'px');
        /* as wide as the page from the start: the row was as wide as what had been typed so far (at least 20 characters),
           so a longer translation was cut off at that edge until the Japanese caught up (2026-11-15, the last flicker) */
        const pageRight = Math.max(...page.lines.flatMap(l => l.rects).map(map).filter(Boolean).map(r => r[0] + r[2]));
        set(row, 'width', Math.max(pageRight - x0, x1 - x0, Math.min(innerWidth - x0 - 8, size * 34)) + 'px');
        /* issue 468 (寒蝉, full-page NVL): the page's translation was always 60 % of the Japanese, whatever the user set. It is the user's
           translation size, as on a single placed line; under a sentence at the bottom of the page it is made smaller once (at most 15 %)
           and otherwise runs on below the game (the layer spans the work area), never over the page's other lines */
        const userCn = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tomoyo-gal-cn-size')), base = only ? size : (Number.isFinite(userCn) && userCn >= 10 ? userCn : Math.max(12, Math.round(size * .6)));
        set(row, 'font-size', base + 'px');
        if (page.retainedBitmap) {
          // The bitmap keeps neighbouring rows. Give the translation a free band inside the game client.
          const [, top, right, bottom] = mapper(page.client).bounds, gap = Math.ceil(size * .25);
          set(row, 'width', Math.max(1, right - x0 - 8) + 'px');
          const others = page.lines.filter(l => l !== cur).flatMap(l => l.rects).map(map).filter(Boolean).sort((a, b) => a[1] - b[1]);
          const height = row.offsetHeight || base * 1.25, limit = bottom - size * 1.3;
          let after = y1 + gap, above = y0 - gap - height;
          for (const r of others) if (r[1] < after + height && r[1] + r[3] > after) after = r[1] + r[3] + gap;
          for (const r of others.reverse()) if (r[1] < above + height && r[1] + r[3] > above) above = r[1] - gap - height;
          const y = only ? y0 : after + height <= limit ? after :
            above >= top ? above : after + height <= bottom ? after : Math.max(top, bottom - height);
          set(row, 'top', y + 'px');
        } else if (!only) { const info = b.galLayoutInfo?.(), dpr = devicePixelRatio || 1, limit = (Number.isFinite(info?.workBottom) && info.workBottom > 0 ? info.workBottom / dpr : innerHeight) - 8, rb = row.getBoundingClientRect();
          if (rb.height > 0 && rb.bottom > limit) set(row, 'font-size', Math.max(Math.ceil(base * .85), Math.floor(base * (limit - rb.top) / rb.height)) + 'px'); }
      }
      const copy = sentence.cloneNode(true); copy.__megulitText = readerText; copy.__megulitAt = at; clones.set(cur.id, copy);
    }
    /* The reader window paints only inside its regions, and a character's own region reached the window a frame or two
       after the character: every new character came in cut off on its right. While the newest line is being typed the
       rest of its row and the next row are regions ahead of time (painted, the pointer passes to the game). */
    {
      const all = page.lines.flatMap(l => l.rects).map(map).filter(Boolean), last = cur && cur.rects.length ? map(cur.rects[cur.rects.length - 1]) : null;
      let ahead = document.getElementById('megulit-page-ahead'), boxes = [];
      if (cur && last && all.length && cur.rects.length < [...cur.text].length) {
        const x0 = Math.min(...all.map(r => r[0])), x1 = Math.max(Math.max(...all.map(r => r[0] + r[2])), x0 + last[3] * 20), h = last[3], pitch = h * 1.3;
        boxes = [[last[0] + last[2], last[1] - h * .5, Math.max(0, x1 - last[0] - last[2]), h * 1.6], [x0, last[1] + pitch - h * .5, x1 - x0, h * 1.6]];
      }
      /* the translation streams in the same way: its row (three lines of room) is a region before the text is there */
      { const row = cur && win.querySelector('.tomoyo-cn-row'), rb = row && row.style.left ? row.getBoundingClientRect() : null; if (rb && rb.width > 0) { const fs = parseFloat(getComputedStyle(row).fontSize) || 16; boxes.push([rb.left - 6, rb.top - 4, rb.width + 12, Math.max(rb.height, fs * 1.6 * 3) + 8]); } }
      const key = boxes.map(r => r.map(Math.round).join(',')).join(';');
      if (!ahead && boxes.length) { ahead = document.createElement('div'); ahead.id = 'megulit-page-ahead'; ahead.setAttribute('aria-hidden', 'true'); document.body.append(ahead); }
      if (ahead && ahead.__megulitKey !== key) { ahead.__megulitKey = key; ahead.replaceChildren(...boxes.map(r => { const i = document.createElement('i'); i.style.cssText = 'left:' + r[0] + 'px;top:' + r[1] + 'px;width:' + r[2] + 'px;height:' + r[3] + 'px'; return i; })); window.__tomoyoHitRegionsRefresh?.(true); }
    }
    const keep = new Set();
    /* characters of a line that the reader's own text lacks (its source was shortened on the way: a repeated syllable
       dropped, a name cut off): the game does not draw them either, so they are drawn plain on their places; the line
       keeps them when it is no longer the reader's own */
    const rest = (l, at, n) => {
      const all = [...l.text], idx = all.map((c, i) => i).filter(i => (i < at || i >= at + n) && l.rects[i]), key = l.id + ':' + idx.join(',');
      let node = [...win.querySelectorAll(':scope>.megulit-line-rest')].find(x => x.__megulitLine === l.id);
      if (!idx.length) { node?.remove(); return; }
      if (!node || node.__megulitKey !== key) { node?.remove(); node = plain(idx.map(i => all[i]).join('')); node.classList.add('megulit-old-line', 'megulit-line-rest'); node.__megulitKey = key; node.__megulitLine = l.id; win.append(node); }
      keep.add(node); layout(node, idx.map(i => map(l.rects[i])), geom, undefined, idx.map(i => l.nativeCells?.[i]));
    };
    if (cur) rest(cur, [...cur.text.slice(0, cur.text.indexOf(readerText))].length, [...readerText].length);
    const ids = new Set(page.lines.map(l => l.id));
    for (const id of [...clones.keys()]) if (!ids.has(id)) clones.delete(id);
    for (const l of page.lines) {
      if (l === cur || !l.rects.length || l.nativeCells?.every(Boolean)) continue;
      let src = clones.get(l.id);
      if (!src) { src = plain(l.text); src.__megulitText = l.text; src.__megulitAt = 0; clones.set(l.id, src); }
      /* the kept copy stays out of the document; what is shown is a copy of it, made again when the reader's own passes
         (a new sentence's ruby pass clears every base in the window) took its ruby away */
      const bases = src.querySelectorAll('.megulit-ruby-base').length;
      let node = src.__megulitShown;
      if (!node || node.parentElement !== win || node.querySelectorAll('.megulit-ruby-base').length !== bases) {
        node?.remove(); node = src.cloneNode(true); node.__megulitText = src.__megulitText; node.__megulitAt = src.__megulitAt; src.__megulitShown = node;
        node.classList.add('megulit-old-line'); node.removeAttribute('data-sequence'); for (const t of node.querySelectorAll('.tome-typewriter-pending')) t.classList.remove('tome-typewriter-pending'); for (const t of node.querySelectorAll('.tome-page-lines,.tome-inline-wait')) t.remove();
        win.append(node);
      }
      keep.add(node);
      const start = node.__megulitAt, end = start + [...node.__megulitText].length;
      layout(node, l.rects.slice(start, end).map(map), geom, undefined, l.nativeCells?.slice(start, end));
      rest(l, node.__megulitAt, [...node.__megulitText].length);
    }
    dropOld(win, keep);
    const key = geom.join(';');
    if (key !== lastGeom) { lastGeom = key; dispatchEvent(new CustomEvent('megulit-reveal-progress', { detail: { typing: false } })); window.__tomoyoHitRegionsRefresh?.(true); }
  }
  /* the line's top-left: the leftmost box of its top row (the first matched character may sit further right), taken once per
     line and kept while a new line starts within a few px of it (the same text box) */
  /* the game's rows of this line: which reader character starts a new row, and the rows' common centre when the game
     centres them (two or more rows sharing a centre with different left edges, or one row centred in the client away from
     its left side) */
  let rowsLine = '', rowsPrev = null, rowsFresh = false, rowsSeq = 0, rowsCentred = false;
  /* 2026-11-21 (owner, CHAOS;CHILD centred narration: a new line typed out on one row and only wrapped and centred when it was
     complete): the widest row of the last fully drawn centred line; a centred line the game is still typing wraps at it */
  let centreWidth = 0, leftEdge = null; /* left edge of the last fully drawn left-aligned line */
  function gameRows(boxes, size, map, leftEdge = null) {
    const rows = [], rowOf = new Array(boxes.length).fill(-1); let cur = null;
    boxes.forEach((r, j) => { if (!r || r[3] < size * .7 || r[2] > size * 1.6) return; /* a small glyph (the game's own ruby) or a wide one (a UI button the layer took for a glyph) is no row */ if (!cur || r[1] > cur.t + size * .6 || r[0] < cur.l - size * .5 && r[1] > cur.t + size * .3) { cur = { l: r[0], r: r[0] + r[2], t: r[1], first: j }; rows.push(cur); } else { cur.l = Math.min(cur.l, r[0]); cur.r = Math.max(cur.r, r[0] + r[2]); } rowOf[j] = rows.length - 1; });
    let center = null; const [L, , R] = map.bounds || [0, 0, innerWidth], mid = r => (r.l + r.r) / 2;
    if (rows.length >= 2) { const c = mid(rows[0]); if (rows.every(r => Math.abs(mid(r) - c) < size * .75) && Math.max(...rows.map(r => r.l)) - Math.min(...rows.map(r => r.l)) > size * 1.5) center = rows.reduce((t, r) => t + mid(r), 0) / rows.length; }
    /* 2026-11-21 (owner, 千恋＊万花: 「普通说话以为要居中，点一下又左对齐」): a text box that sits in the middle of the screen makes a full
       one-row line look centred; a row that starts at the left edge of the page's left-aligned lines is that box, not a centred line */
    else if (rows.length === 1 && Math.abs(mid(rows[0]) - (L + R) / 2) < size * .75 && rows[0].l > L + (R - L) * .15 && !(Number.isFinite(leftEdge) && Math.abs(rows[0].l - leftEdge) <= size * .5)) center = mid(rows[0]);
    return { rows, rowOf, center };
  }
  /* a line break before each reader character the game put at the start of a new row */
  /* 2026-11-20 (user, CHAOS;CHILD: 「排版同步一下啊 对应一下每一行的日文」): the translation gets as many rows as the game gave the
     Japanese, each the part that matches one Japanese row: breaks after the translation's punctuation nearest to where each
     Japanese row ends (by share of the sentence), else at that share. One-row lines and unfinished translations are left alone. */
  const CN_PUNCT = /[，、。；：！？…—,.;:!?」』）)”’》】〕〗〉\]\}]/;
  const CN_NONWORD = /[，、。；：！？…—,.;:!?」』）)”’》】〕〗〉\]\}“‘「『（(《【〔〖〈\s]/g;
  const CN_CLOSE_QUOTE = /[」』”’]/, CN_OPEN_QUOTE = /[「『“‘]/;
  /* breaks for `shares` (where each Japanese row ends, as a share of the sentence): the set of break points after the
     translation's punctuation that lies nearest to the shares overall (least squares); a share no punctuation is left for
     breaks at its own place */
  function cnSplit(text, shares) {
    const n = text.length, k = shares.length; if (!n || !k) return [];
    /* never split closing punctuation onto its own line or orphan a single trailing character; allow a 1-char quoted reply after a closing quote */
    const quoteGap = i => CN_CLOSE_QUOTE.test(text[i - 1]) && CN_OPEN_QUOTE.test(text.slice(i).trimStart()[0] || '');
    const tailOk = i => text.slice(i).replace(CN_NONWORD, '').length >= (quoteGap(i) ? 1 : 2);
    const cand = []; for (let i = 1; i < n; i++) if (CN_PUNCT.test(text[i - 1]) && !CN_PUNCT.test(text[i]) && tailOk(i)) cand.push(i);
    /* not enough punctuation: a break goes where a Chinese clause can start (before 在/将/变…, after 的/了…), never inside a word; none near: no break */
    if (cand.length < k) { const soft = i => CN_PUNCT.test(text[i - 1]) || /[在将把被让使变是有和与而但却又也就都才从向对]/.test(text[i]) || /[的了着过地]/.test(text[i - 1]); const out = []; let last = 0;
      for (const sh of shares) { const p = sh * n; let best = -1, c = Infinity; for (let i = last + 1; i < n; i++) if (soft(i) && !CN_PUNCT.test(text[i]) && tailOk(i) && Math.abs(i - p) < c) { c = Math.abs(i - p); best = i; } if (best > last && c <= n * .2) { out.push(best); last = best; } } return out; }
    const m = cand.length, cost = (j, i) => (cand[i] / n - shares[j]) ** 2, INF = 1e9;
    const D = Array.from({ length: k }, () => new Array(m).fill(INF)), P = Array.from({ length: k }, () => new Array(m).fill(-1));
    for (let i = 0; i < m; i++) D[0][i] = cost(0, i);
    for (let j = 1; j < k; j++) for (let i = j; i < m; i++) for (let h = j - 1; h < i; h++) { const v = D[j - 1][h] + cost(j, i); if (v < D[j][i]) { D[j][i] = v; P[j][i] = h; } }
    let end = -1, best = INF; for (let i = k - 1; i < m; i++) if (D[k - 1][i] < best) { best = D[k - 1][i]; end = i; }
    const out = []; for (let j = k - 1, i = end; j >= 0 && i >= 0; i = P[j][i], j--) out.unshift(cand[i]);
    return out;
  }
  /* a Japanese row's weight in translation length: kana carry about half a Chinese character, kanji and the rest one */
  const jpWeight = c => /[\u3040-\u30ff]/.test(c) ? .55 : 1;
  b.textPlaceCnSplit = cnSplit;
  function cnRows(win, shown, rows) {
    const out = win.querySelector('.tomoyo-cn-output'); if (!out) return;
    const counts = []; let cur = 0;
    shown.forEach((t, j) => { const r = rows.rowOf[j]; if (r >= 0) cur = r; counts[cur] = (counts[cur] || 0) + jpWeight(t.textContent); });
    const filled = counts.filter(Boolean), total = filled.reduce((a, c) => a + c, 0);
    const chars = [...out.querySelectorAll('.tome-translation-char')], text = chars.map(c => c.textContent).join('');
    const ready = out.dataset.state === 'ready' && chars.length >= filled.length * 2 && text.length === chars.length;
    const shares = []; let acc = 0; for (let i = 0; i < filled.length - 1; i++) { acc += filled[i]; shares.push(acc / total); }
    const want = new Set(ready && filled.length >= 2 ? cnSplit(text, shares).map(i => chars[i]) : []);
    for (const br of out.querySelectorAll('br.megulit-cn-br')) if (!want.has(br.nextSibling)) br.remove();
    for (const at of want) if (!(at.previousSibling && at.previousSibling.nodeName === 'BR')) { const br = document.createElement('br'); br.className = 'megulit-cn-br'; at.parentNode.insertBefore(br, at); }
  }
  function rowBreaks(win, shown, rows) {
    const want = new Set(); let prev = -1;
    /* one-line Japanese (QQ essence 1145, Codex #1177): no game row breaks; they come back when the option is off */
    if (!document.body.classList.contains('megulit-jp-one-line')) shown.forEach((t, j) => { const r = rows.rowOf[j]; if (r < 0) return; if (prev >= 0 && r > prev) { const base = t.closest('.megulit-ruby-base'); const at = base && base.querySelector('.char-token') === t ? base : t; if (!base || at === base) want.add(at); } prev = r; });
    for (const br of win.querySelectorAll('br.megulit-row-br')) if (!want.has(br.nextSibling)) br.remove();
    for (const at of want) if (!(at.previousSibling && at.previousSibling.nodeName === 'BR' && at.previousSibling.classList.contains('megulit-row-br'))) { const br = document.createElement('br'); br.className = 'megulit-row-br'; at.parentNode.insertBefore(br, at); }
    win.classList.toggle('megulit-game-rows', want.size > 0); /* 2026-11-20 (CHAOS;CHILD: a two-row line drawn as three) the game's row breaks only */
    win.classList.toggle('megulit-anchor-center', Number.isFinite(rows.center));
  }
  function anchorFrom(got, size, map, lineKey, center = null) {
    const top = Math.min(...got.map(b => b[1]));
    let a = [Number.isFinite(center) ? center : Math.min(...got.filter(b => b[1] < top + size * .5).map(b => b[0])), top];
    /* a centred page and a left-aligned box are different places: switching between them moves the line at once */
    if (anchor && !!anchor.center !== Number.isFinite(center)) anchor = null;
    /* 2026-11-20 (CHAOS;CHILD acceptance: 「発生は、突然だった。」 sat right of the game's centre): a centred line's middle is measured
       again while it types (the first boxes give a middle too far left or right); only its top is kept */
    if (anchor && anchor.center && Number.isFinite(center) && anchorLine === lineKey && Math.abs(a[1] - anchor[1]) < size * 2) a = [center, anchor[1]];
    else if (anchor && anchorLine === lineKey && Math.abs(a[0] - anchor[0]) < size * 2 && Math.abs(a[1] - anchor[1]) < size * 2) a = anchor;
    else if (anchor && Math.abs(a[0] - anchor[0]) <= Math.max(6, size * .6) && Math.abs(a[1] - anchor[1]) <= Math.max(6, size * .6)) a = anchor;
    /* 2026-11-19 (audit of 528a2bae): a game that indents narration by one full-width space and starts dialogue with 「 at the
       margin gave two anchors one character apart, and the line jumped sideways at every change between them. On the same row a
       start up to about one and a half characters off is the same text box: the anchor keeps the leftmost (one move at most) */
    else if (anchor && Math.abs(a[1] - anchor[1]) <= Math.max(6, size * .6) && Math.abs(a[0] - anchor[0]) <= size * 1.6) a = [Math.min(a[0], anchor[0]), anchor[1]];
    anchor = a; anchor.estimated = false; anchor.center = Number.isFinite(center); anchor.size = size; anchor.gpu = line?.engine === 'gpu' && !line.fallback; anchorLine = lineKey;
    anchorLimit = map.bounds[3] - (median(got.map(b => b[3])) || size) * 1.3;
  }
  function apply() {
    frame = 0;
    appliedOffset = null;
    if (waits.size) flushWaits();
    drawExtras();
    // A native clear can precede retirement of the reader sentence and its asynchronous translation.
    const cleared = on && page?.engineRows && !page.lines.length && goneText;
    const reader = cleared ? readerLine() : null;
    const hideTranslation = !!cleared && (!reader || reader === goneText || reader === page.retiredReader);
    document.body.classList.toggle('megulit-cleared-translation', hideTranslation);
    if (!page?.retainedBitmap && b.textPlaceUsesDialogueArea()) {
      const win = target(), text = readerLine(), sentence = win?.querySelector('.sentence-text:not(.megulit-old-line)');
      if (sentence && text && placeBand(win, sentence, dialogueArea(), text)) return;
    }
    clearBand();
    if (page) return applyPage();
    if (!on || !line) { document.body.classList.remove('megulit-place-garbled'); release(); gameDrawn(); return; }
    if (line.nativeCells && readerLine() !== line.text.replace(/\s/g, '')) { release(); return; }
    if (line.cleared) {
      gameDrawn();
      release(true);
      document.body.classList.toggle('megulit-place-gone', readerLine() === line.text);
      return;
    }
    if (line.fallback) {
      const native = gameDrawn();
      document.body.classList.remove('megulit-place-garbled');
      if (native || !line.rects?.length) { release(!native); return; }
    }
    const win = target(), sentence = win?.querySelector('.sentence-text:not(.megulit-old-line)');
    orphansMeet(line);
    if (!sentence) { orphan(line); release(); return; }
    /* 2026-11-21 (ファタ acceptance 3/9: at each click the reader hid its new line as a "broken copy" and drew the old one in white):
       the game cleared this line (textPlace gone, an engine that reports its clear) and the reader already shows the next one before
       its placement: the cleared line is the anchor only, never matched against the reader's text */
    if (goneText && [...String(line.text)].filter(c => !blank(c)).join('') === goneText) { document.body.classList.remove('megulit-place-garbled'); if (anchorMode && anchor) { release(true); pin(win, sentence); } return; }
    const tokens = [...sentence.querySelectorAll('.char-token')].filter(t => !t.closest('.tome-page-lines'));
    const shown = tokens.filter(t => !t.hasAttribute('data-tomoyo-leading-space') && !blank(t.textContent));
    const readerText = shown.map(t => t.textContent).join(''), placeText = [...line.text].filter(c => !blank(c)).join('');
    /* map the reader's characters onto the record (the record may carry a speaker or more before the reader's text) */
    const placeRects = [], chars = [...line.text];
    chars.forEach((c, i) => { if (!blank(c)) placeRects.push(line.rects[i]); });
    /* 2026-11-16 (死に逝く君、館に芽吹く憎悪: every other line jumped between the game's text box and the reader's own place):
       the reader's text is not always a copy of the placed line: its source doubles a dash (「――」 for the game's 「―」),
       repeats the sentence, drops a repeated syllable. An exact match was required, and every such line fell back to the
       reader's own place, a different spot from the line before. The characters are aligned instead (align()); a line
       is placed when most of the game's characters are found in it. */
    const idx = readerText ? align([...readerText], [...placeText]) : null;
    // A blank-stream placement supplies geometry only for its matching source. The reader may already be one line ahead.
    if (!idx && line.fallback) { release(true); return; }
    // Estimated glyph rows describe the host's guess. Use their origin with the reader's own wrap width.
    if (anchorMode && line.approx) {
      const map = mapper(line.client), first = map(line.rects[0]);
      if (first && idx) {
        if (document.body.classList.contains('megulit-place-game-drawn')) {
          document.body.classList.remove('megulit-place-game-drawn');
          window.__tomoyoHitRegionsRefresh?.(true);
        }
        drawn(line);
        fxCount('paired', line.text);
        anchorFrom([first], first[3], map, line.text);
        anchor.estimated = true;
      }
      release(true);
      return;
    }
    /* a placement of another line (the current one is not placed yet): the game's own copy of this line may still be on
       screen, so no plateless Japanese at the reader's place when the source said so */
    /* 2026-11-19 (千恋＊万花 with its Chinese patch shown, user: the reader sat at the left edge over the name plate): the game draws
       another language than the reader's text (a translation patch, a Chinese display), so no character can be aligned. In anchored
       mode only the place is needed, never the characters: the top-left of the game's first row of boxes, taken like any anchor. */
    if (!idx && anchorMode && !gameDrawn()) { const map0 = mapper(line.client), got0 = placeRects.map(r => r && map0(r)).filter(r => r && r[2] > 0 && r[3] > 0);
      /* 2026-11-21 (ファタモルガーナの館: its hook text garbled by the text effects, 「いき、い、き」 for 「呼吸をひとつする度に、指先に感覚が宿る。」): the
         game's line is Japanese too, so the reader's line is not another language of it but a broken copy. The game's own text is drawn on its
         place (and core delivers it as a source line for furigana and translation); the broken copy is not shown */
      if (got0.length && readerText && /[぀-ヿ]/.test(placeText)) { orphan(line); release(); document.body.classList.add('megulit-place-garbled'); return; }
      document.body.classList.remove('megulit-place-garbled');
      if (got0.length && !readerText) orphan(line); /* nothing of the reader's for this hidden line (its hook line was dropped) */
      if (got0.length) { if (readerText) { fxCount('paired', line.text); drawn(line); } anchorFrom(got0, median(got0.map(r => r[3])) || 0, map0, String(line.text || '')); release(true); pin(win, sentence); return; } }
    if (!idx) { if (!gameDrawn()) orphan(line); if (gameDrawn()) release(); else release(true); return; }
    if (document.body.classList.contains('megulit-place-game-drawn')) { document.body.classList.remove('megulit-place-game-drawn'); window.__tomoyoHitRegionsRefresh?.(true); }
    /* record px are game-client px; the reader surface may be larger than the game (galLayoutInfo: client origin and size
       in physical px), CSS px = physical / devicePixelRatio */
    const map = mapper(line.client, line.frameLayout);
    const boxes = shown.map((t, j) => { const k = idx[j]; if (k == null) return null; const r = placeRects[Math.floor(k)]; if (!r) return null; const m = map(r); /* half cells: two reader dashes on one game dash */ return m && k % 1 ? [m[0] + m[2] / 2, m[1], m[2] / 2, m[3]] : m && idx[j + 1] === k + .5 ? [m[0], m[1], m[2] / 2, m[3]] : m; });
    const cjk = boxes.filter((r, j) => r && /[^\x00-\x7f｡-ﾟ]/.test(shown[j].textContent)).map(r => r[2]);
    const size = Math.max(6, median(cjk) || median(boxes.filter(Boolean).map(r => r[3])));
    /* no real box for any of the reader's characters (all 0 / null / outside the game): the reader keeps its own place;
       placing would leave the translation row at the surface's top-left corner */
    if (!boxes.some(Boolean)) { orphan(line); release(true); return; }
    drawn(line);
    /* 2026-11-16 (user: 字号和换行宽度要听设置；位置要跟着原文走但是别抖): the line is laid out by the reader itself with the
       user's own font size and wrap width; only its place comes from the game: the top-left of the game's first character,
       taken once per line (typing never moves it) and kept while a new line starts within a few px of it (the same text
       box). A box that really moved (another text box, a different scene layout) moves it. */
    if (anchorMode && !line.nativeCells) {
      /* 2026-11-20 (user, CHAOS;CHILD: 「排版要贴近游戏」 — narration centred mid-screen, a dialogue box left-aligned): the game's rows
         decide where the reader breaks the line and whether the block is centred; size and wrap width stay the user's.
         A sentence whose first part the game drew earlier (core/page-text.cjs `continues`) keeps the place that part had. */
      const rows = gameRows(boxes, size, map, leftEdge), lead = idx.findIndex(k => k != null), firstBox = boxes.find(Boolean), atLeft = !!firstBox && Number.isFinite(leftEdge) && Math.abs(firstBox[0] - leftEdge) <= size * .5;
      /* 2026-11-20 (user: a centred line started at the left as 「流」 while the game typed it): with under half of the line's boxes known
         the centring cannot be measured yet; a page that was centred stays centred on the same middle until it can */
      /* a line whose first characters start at the left edge of the page's left-aligned lines is not centred, whatever came before */ if (!Number.isFinite(rows.center) && anchor && anchor.center && !atLeft && boxes.filter(Boolean).length < shown.length * .5) rows.center = anchor[0]; b.textPlaceRows = { text: readerText, rows: rows.rows.map(r => [Math.round(r.l), Math.round(r.r), Math.round(r.t), r.first]), center: rows.center, boxes: boxes.map(r => r && r.map(Math.round)), idx };
      fxCount('paired', line.text);
      if (!(anchor && lead >= 3 && Number(b.hookSourceContinues) > 0)) anchorFrom(boxes.filter(Boolean), size, map, String(line.text || ''), rows.center);
      /* the page's earlier lines stay above only when the game drew this line under them; a line that starts at or above
         where the last one ended is a new page (a title card, a cleared box), whatever the text stream said */
      { const k = String(line.text || ''), first = rows.rows[0], seq = Number(sentence.dataset.sequence) || 0; if (k !== rowsLine) { /* only the line placed just before counts (lines skipped through were never placed) */ rowsFresh = !(rowsPrev && rowsSeq && seq - rowsSeq <= 1 && first && first.t >= rowsPrev - size * .3 && Number.isFinite(rows.center) === rowsCentred); /* a centred page and a text box are never one page */ rowsCentred = Number.isFinite(rows.center); rowsPrev = rows.rows.length ? rows.rows[rows.rows.length - 1].t + size : null; rowsLine = k; rowsSeq = seq; } }
      release(true, false); /* pinned once below, after the row breaks: a pin from the unbroken layout here decided the translation's place from a different block every other frame */
      win.classList.toggle('megulit-page-fresh', rowsFresh); if (rowsFresh) b.hookPageReset?.();
      rowBreaks(win, shown, rows);
      { const known = boxes.filter(Boolean).length, centred = Number.isFinite(rows.center);
        if (centred && known >= shown.length && rows.rows.length) centreWidth = Math.max(...rows.rows.map(r => r.r - r.l)) + size;
        if (!centred && known >= shown.length && rows.rows.length) leftEdge = Math.min(...rows.rows.map(r => r.l));
        else if (!centred && !(anchor && anchor.center)) centreWidth = 0;
        /* while the game has not drawn every row of a centred line, the whole line already wraps at the page's row width and is
           centred, so typing only reveals characters in their final place; the game's own breaks replace it row by row */
        const predict = centred && centreWidth > size * 4 && shown.some((t, j) => !(rows.rowOf[j] >= 0));
        win.classList.toggle('megulit-rows-predicted', predict); if (predict) win.style.setProperty('--megulit-centre-width', Math.round(centreWidth) + 'px'); else win.style.removeProperty('--megulit-centre-width'); }
      cnRows(win, shown, rows);
      pin(win, sentence);
      return;
    }
    document.body.classList.remove('megulit-place-fallback');
    document.body.classList.toggle('megulit-native-cells', !!line.nativeCells);
    document.body.classList.add('megulit-placed');
    win.classList.add('megulit-place-window');
    for (const w of document.querySelectorAll('.megulit-place-window')) if (w !== win) w.classList.remove('megulit-place-window');
    const geom = [];
    for (const t of tokens) if (!shown.includes(t)) t.classList.add('megulit-unplaced');
    const place = new Map();
    // Older NVL rows can still be blank in the game after the active sentence
    // moves on. Only their confirmed missing characters remain on the reader.
    let older = document.querySelector('.megulit-script-history');
    const history = line.previousCells || [];
    const oldText = history.map(cell => cell[0]).join('');
    if (!oldText || older?.textContent !== oldText || older?.parentElement !== win) {
      older?.remove();
      older = null;
      if (oldText) {
        older = plain(oldText);
        older.classList.add('megulit-old-line','megulit-script-history');
        win.append(older);
      }
    }
    if (older) layout(older, history.map(cell => map(cell[1])), geom);
    const ink = line.nativeCells?.filter((_, i) => !blank(chars[i]));
    shown.forEach((t, j) => {
      t.classList.toggle('megulit-native-cell', ink?.[idx[j]] === true);
      const r = boxes[j]; if (!r) { t.classList.add('megulit-unplaced'); return; } t.classList.remove('megulit-unplaced'); place.set(t, r); });
    placeGlyphs(sentence, place, size, geom);
    /* translation: under the last row, starting at the line's left edge, no plate; translation only: in the Japanese's place */
    const row = win.querySelector('.tomoyo-cn-row'), all = [...place.values()];
    if (row && all.length) {
      const x0 = Math.min(...all.map(r => r[0])), y0 = Math.min(...all.map(r => r[1])), x1 = Math.max(...all.map(r => r[0] + r[2])), y1 = Math.max(...all.map(r => r[1] + r[3]));
      const only = document.body.classList.contains('tomoyo-gal-zh-only');
      /* 2026-11-26 (QQ essence 1137: the placed rows locked the translation's wrap width and line spacing): a translation wrap width
         or line spacing the user changed from its default now applies here too; the defaults keep the game-following size */
      const own = userRowLayout(b.galPreferences?.() || {});
      const [L, T, R, B] = map.bounds, width = own.width > 0 ? Math.max(1, Math.min(R - x0, Math.max(size * 4, (R - L) * own.width / 100))) /* the width asked for, narrower too (Codex #1177) */ : Math.max(1, Math.min(R - x0, Math.max(x1 - x0, Math.min(R - x0 - 8, size * 20))));
      set(row, 'left', Math.min(Math.max(x0, L), Math.max(L, R - width)) + 'px'); set(row, 'width', width + 'px');
      /* 2026-11-16 (user recording: the translation was small, then suddenly large and over the game's SAVE/LOAD bar, its
         last row out of the window): its size came from the stylesheet and was only made smaller when there was room, so a
         line that filled the text box got the full stylesheet size. The size is now always derived from the Japanese
         glyphs (one size for every line of the box) and only ever made smaller to fit. */
      /* from the boxes' height (one per text box): widths vary with proportional kana and moved the size line to line */
      const tall = median(all.map(r => r[3])) || size, userCn = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tomoyo-gal-cn-size')), base = Number.isFinite(userCn) && userCn >= 10 ? userCn : Math.max(12, Math.round((only ? 1 : .55) * tall));
      /* 2026-11-19 (user: 中文不要随便调尺寸, 只有显示不下才小): the standard size is the user's translation size, the same for every line;
         it is made smaller only when this line's translation does not fit, once, and the result is kept for the line (key: its text) */
      const floor = Math.max(10, Math.round(base * .85));
      set(row, 'font-size', base + 'px'); set(row, 'line-height', String(Math.max(.9, 1.25 + own.lineHeight)));
      /* 2026-11-16 (1.4.16 live: the row was 10px, its text 32px and over the SAVE/LOAD bar): the translation's own elements carry the
         game style's size rule; inline, they take the row's size and line height */
      for (const o of row.querySelectorAll('*')) { set(o, 'font-size', 'inherit'); set(o, 'line-height', 'inherit'); }
      /* not before the line is complete: during the game's typewriter only part of it is placed, and a translation of the
         whole line next to half a Japanese line does not match it */
      row.style.visibility = shown.filter(t => !t.classList.contains('megulit-unplaced')).length < shown.length * .85 ? 'hidden' : '';
      /* 2026-11-16 (死に逝く君、館に芽吹く憎悪: the translation jumped above the Japanese on lines near the bottom of the text
         box): the rule is Japanese on top, the translation right under it. A row that did not fit under the line went
         above it, and its height was measured before its width was set (the previous line's width: more wrapped rows,
         taller than it is). Width first, then the height; a row that does not fit under the line is made smaller (line
         height, then font size) and, if it still does not fit, may run past the game's bottom edge: never above. */
      // Leave room for the game's bottom controls, then use the full remaining height.
      const limit = B - (median(all.map(r => r[3])) || size) * 1.3;
      const below = y1 + size * .2, room = limit - (only ? y0 : below);
      row.style.removeProperty('max-height'); row.style.removeProperty('overflow');
      let rh = row.offsetHeight || base * 1.25;
      if (rh > room) { set(row, 'line-height', '1.1'); rh = row.offsetHeight || rh; }
      /* wider first (fewer rows), as far as the game's right edge */
      if (rh > room && R - x0 - 8 > width) { set(row, 'width', (R - x0 - 8) + 'px'); rh = row.offsetHeight || rh; }
      for (let fs = base; rh > room && fs > floor;) { fs = Math.max(floor, Math.floor(fs * Math.max(.5, room / rh))); set(row, 'font-size', fs + 'px'); rh = row.offsetHeight || rh; }
      /* still too long at the smallest size: cut at the box, never over the game's UI */
      if (rh > room && room > 10) { set(row, 'max-height', room + 'px'); set(row, 'overflow', 'hidden'); }
      const top = only ? (rh > room ? Math.max(T, B - rh) : y0) : below;
      set(row, 'top', Math.max(T, top) + 'px');
    }
    const key = geom.join(';');
    if (key !== lastGeom) { lastGeom = key; dispatchEvent(new CustomEvent('megulit-reveal-progress', { detail: { typing: false } })); window.__tomoyoHitRegionsRefresh?.(true); }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
  b.textPlaceLayoutChanged = schedule;
  // The overlay covers the desktop, so moving the game need not resize the WebView or deliver another line.
  let clientArea = b.gameArea?.();
  b.textPlaceClientArea = area => {
    const prev = clientArea;
    clientArea = area;
    if (!on || (prev && prev.left === area.left && prev.top === area.top &&
        prev.width === area.width && prev.height === area.height)) return;
    // These caches are in surface CSS pixels. Carry them with the client before anchor smoothing and page detection.
    if (prev) {
      const sx = area.width / prev.width, sy = area.height / prev.height;
      const x = value => area.left + (value - prev.left) * sx;
      const y = value => area.top + (value - prev.top) * sy;
      if (anchor) {
        anchor[0] = x(anchor[0]); anchor[1] = y(anchor[1]);
        anchor.size *= sy; anchorLimit = y(anchorLimit);
      }
      if (leftEdge !== null) leftEdge = x(leftEdge);
      if (rowsPrev !== null) rowsPrev = y(rowsPrev);
      centreWidth *= sx;
    }
    schedule();
  };
  b.textPlace = m => {
    if (m?.clearedFallback) {
      drawnByGame = '';
      line = { cleared: true, fallback: true, text: [...String(m.text)].filter(c => !blank(c)).join('') };
      retireBand(line.text);
      schedule(); return;
    }
    if (m?.gone === true) { pageCleared(m.text); return; } if (m && Array.isArray(m.rects) && m.text && [...String(m.text)].filter(c => !blank(c)).join('') !== goneText) goneText = '';
    const draw = Number.isSafeInteger(m?.sourceToken) ? m.id + '/' + m.sourceToken : undefined;
    if (m?.text && typeof m.read === 'boolean') b.lineReadDrawn?.(m.text, m.read, draw);
    if (m?.text && typeof m.color === 'string') b.lineColorDrawn?.(m.text, m.color, draw);
    if (m?.visible === true) { const vis = [...String(m.text || '')].filter(c => !blank(c)).join(''), cur = line && !line.fallback ? [...String(line.text || '')].filter(c => !blank(c)).join('') : '';
    /* 2026-11-20 (CHAOS;CHILD: the click that clears a page at a scene change makes the game draw the whole page once more as plain text,
       earlier lines and the placed one together, while its hidden line leaves the screen): the placed line goes with the page until the next line */
    if (m.hiding === true && cur && vis.length > cur.length && vis.endsWith(cur)) { document.body.classList.add('megulit-place-gone'); line = null; schedule(); return; }
    if (line?.cleared) { line = null; document.body.classList.remove('megulit-place-gone'); }
    drawnEmbedded = m.embedded === 1 || m.embedded === 2 ? m.embedded : 0; drawnByGame = vis; drawnHiding = m.hiding === true; schedule(); return; } if (m?.text && (m.fallback || Array.isArray(m.rects))) { drawnByGame = ''; if (!m.fallback) stale.delete([...String(m.text)].filter(c => !blank(c)).join('')); } { const nb = t => [...String(t || '')].filter(c => !blank(c)).join(''), cur = line && !line.fallback ? nb(line.text) : '', nt = m?.fallback && m.text ? nb(m.text) : '';
    /* the same page redraw seen first as an unplaced line of the whole page (earlier lines + the placed one) */
    if (cur && nt.length > cur.length && nt.endsWith(cur)) { document.body.classList.add('megulit-place-gone'); line = null; schedule(); return; } }
    document.body.classList.remove('megulit-place-gone'); if (m?.clear) line = null; else if (m?.text && (m.fallback || Array.isArray(m.rects))) {
      const text = String(m.text);
      if (!m.fallback && line && !line.nativeCells && line.text !== text) noteReplaced(line);
      line = { text, engine: m.engine, frameLayout: m.frameLayout, previousCells: Array.isArray(m.previousCells) ? m.previousCells : null, nativeCells: Array.isArray(m.nativeCells) && m.nativeCells.length === [...text].length ? m.nativeCells : null, fallback: m.fallback === true, approx: m.approx === true, rects: m.rects, client: Array.isArray(m.client) ? m.client : [innerWidth, innerHeight] };
    } schedule(); };
  const pageGone = () => { for (const n of document.querySelectorAll('.megulit-old-line')) n.remove(); clones.clear(); document.body.classList.remove('megulit-place-asleep'); };
  /* 2026-11-15 `elsewhere` (core/overlay-placement.cjs page()): the layer is not armed and another path hides the game's
     line (write-back, glyph layer); the page says nothing about the line, so the reader places it as without a page */
  b.textPlacePage = m => {
    const had = !!page;
    if (m?.elsewhere === true || !Array.isArray(m?.lines)) {
      if (pageOwn) { pageOwn = false; briefSync(false); }
    }
    if (m?.elsewhere === true) {
      page = null; drawnByGame = '';
      if (had) { pageGone(); dropOld(null); document.getElementById('megulit-page-ahead')?.replaceChildren(); document.body.classList.remove('megulit-place-game-drawn'); }
      schedule(); return;
    }
    page = Array.isArray(m?.lines) ? {
      awake: m.awake === true, armed: m.armed === true, engineRows: m.engineRows === true, retainedBitmap: m.retainedBitmap === true,
      lines: m.lines.filter(l => l && typeof l.text === 'string' && Array.isArray(l.rects)),
      client: Array.isArray(m.client) ? m.client : [innerWidth, innerHeight]
    } : null;
    if (page) {
      if (page.engineRows && !page.lines.length && goneText) {
        const reader = readerLine();
        if (goneText.includes(reader)) page.retiredReader = reader;
      }
      line = null; drawnByGame = '';
    } else if (had) pageGone();
    schedule();
  };
  b.textPlaceExtra = m => { extras = { items: Array.isArray(m?.items) ? m.items.filter(i => i && typeof i.text === 'string' && Array.isArray(i.rects)) : [], client: Array.isArray(m?.client) ? m.client : null }; schedule(); };
  let modeGame = null;
  b.textPlaceMode = m => { on = m?.on === true; document.body.classList.toggle('megulit-anchor-mode', on && anchorMode); if (on) bindAdvance(); if (!on) stale.clear(); if (!on) waits.clear(); if (!on) { orphans = []; orphanWait = null; } const g = m && 'game' in m ? String(m.game || '') : modeGame; if (!on || g !== modeGame) { anchor = null; anchorLine = ''; cnBelow = { key: null, below: false }; } modeGame = g; if (!on) { document.body.classList.remove('megulit-place-gone'); if (pageOwn) { pageOwn = false; briefSync(false); } line = null; drawnByGame = ''; if (page) { page = null; pageGone(); } } schedule(); };
  /* 2026-11-21 (owner's recording 08:28, 千恋＊万花): game-fit.js measured the reader on its own place in the gap between two lines and cut the
     next line's translation; while this module anchors lines on the game's place it owns their layout, gaps included */
  b.textPlaceOwns = () => on && anchorMode && (!!anchor || !!bandWindow);
  b.textPlaceAppliedOffset = () => appliedOffset;
  // Replacing the tokens can change the first glyph's indent and ascent before
  // a fresh set of boxes arrives. Pin the new text in the same paint as the swap.
  b.textPlaceFirstPaint = (win, sentence) => {
    const text = readerLine();
    if (text && b.textPlaceUsesDialogueArea() && placeBand(win, sentence, dialogueArea(), text)) return;
    if (on && anchorMode && anchor && !page && win.classList.contains('megulit-anchor-window')
        && window.MeguLitProfile?.get?.('placement.translationGrowsDown', false) === true) pin(win, sentence);
  };
  b.textPlaceStatus = () => ({ on, line: line ? { text: line.text, n: line.rects?.length || 0, fallback: !!line.fallback, approx: line.approx === true } : null, placed: document.body.classList.contains('megulit-placed'), geom: lastGeom.split(';').length });
  let busy = false;
  new MutationObserver(records => { if (on && (line || drawnByGame || page || bandWindow) && records.some(r => !(r.target.closest?.('.tomoyo-cn-dialog,#megulit-place-extras,#megulit-page-ahead,.megulit-old-line')) && !r.target.classList?.contains('megulit-old-line'))) { /* page mode: at once, before the next paint, so a line that just stopped being the reader's own never misses a frame */ if (page && !busy) { busy = true; try { apply(); } finally { busy = false; } } else schedule(); } }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const markAll = root => { for (const t of (root.querySelectorAll ? root.querySelectorAll('.sentence-text .char-token:not(.megulit-dash)') : [])) markDash(t); };
  let dashRefreshQueued = false;
  const scheduleDashRefresh = () => {
    if (dashRefreshQueued || !document.querySelector('.sentence-text .char-token.megulit-dash')) return;
    dashRefreshQueued = true;
    requestAnimationFrame(() => { dashRefreshQueued = false; refreshDashColors(); });
  };
  new MutationObserver(records => { for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) { if (n.matches?.('.char-token') && n.closest('.sentence-text')) markDash(n); else markAll(n); } }).observe(document.documentElement, { subtree: true, childList: true });
  if (document.body) new MutationObserver(scheduleDashRefresh).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  markAll(document);
  addEventListener('resize', schedule);
  new MutationObserver(() => { scheduleDashRefresh(); if (on && (anchor || page || bandWindow)) schedule(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  addEventListener('megulit-profile', schedule);
})();
