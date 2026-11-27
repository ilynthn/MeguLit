// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 「做引擎适配差分和游戏差分，每个游戏都不要互相影响」) the kernel layer of the game profile.
   Every place where MeguLitHook behaves differently per engine or per game reads one of these keys (core/profiles/index.cjs
   profileFor). A value here is the kernel's own behaviour for every game; null means "the kernel decides as before".
   An engine file (engines/<id>.cjs) or a game file (games/<gameKey>.cjs) may only set keys that exist here: a new branch in
   the kernel first adds its key here with the old behaviour as default, then the one engine or game that needs it sets it.
   Arrays replace, they never merge: a game that sets choice.filters owns the whole list. */
module.exports={
 source:{
  /* Artemis64x: retain a quoted message split across one callback batch; only a measured version opts in. */
  artemisQuoteSpans:false,
  /* #1143 HookBridge streams (RegExp sources on the stream name, e.g. '^YU-RIS2?$') never auto-selected as the dialogue stream; their
     text stays auxiliary (choice candidates) even before a dialogue stream is chosen. [] = the kernel: any stream may be taken */
  autoSelectSkip:[],
  /* 2026-11-27 (ファタモルガーナの館) HookBridge streams (RegExp sources on the stream name, e.g. '^Krkr2wcs$') that, once selected, are never
     left for another stream with more dialogue lines (a fresh session left Krkr2wcs in the prologue and the page hide never ran).
     [] = the kernel: the selected stream may be left */
  keepStream:[],
  /* 2026-11-27 (ハミダシクリエイティブ, Artemis2) HookBridge streams (RegExp sources on the stream name) that are the engine's per-glyph
     layout call (one glyph or one ruby base per call, the line joined afterwards): every short piece is blanked while the line is hidden.
     [] = the kernel: a short piece follows the label rule (kanji / katakana pieces go back unchanged) */
  embedGlyphPieces:[],
  siglusDbsNameColumn:null,
  /* 2026-11-27 MeguLit-Adapter: how this game's built-in version layer is found. 'exe' = the kernel as before: only the exe's
     SHA-256 (The Seed versions/<sha>.json). 'prints' = when the exe hash misses (no-DVD, update, a Chinese patch's renamed exe), the
     version whose recorded prints (game.json ext.versionPrints: exe head, PE version, script-source print, main pack print) match
     this copy is taken as a candidate: applied low (under this PC's calibration, like a skeleton seed) so the self-check gate decides */
  versionMatch:'exe',
 },
 placement:{
  /* where the first line of a page is anchored: null = kernel (glyph records, then the text box); 'glyph' | 'box' | 'page' */
  firstLineAnchor:null,
  /* Dialogue body in reference canvas pixels. It follows the aspect-preserving game viewport. */
  dialogueArea:null,
  /* extra pixels (game client) added to the Japanese line's top, after the kernel placed it */
  lineOffsetY:0,
  /* while the glyph layer blanks the selected writable stream, a line not yet seen hidden is drawn by the reader (false = the
     kernel: the game draws it itself until a hidden glyph comes back) */
  drawWhileBlanking:false,
  /* the Japanese stays on the game's text place and its translation only grows down (smaller by at most 15 %); false = the
     kernel: a translation that does not fit above the game's button strip moves the block up */
  translationGrowsDown:false,
  /* a hidden line the reader cannot pair is drawn from its placement (text-place.js orphan path; drawn in the reader's colour, never a
     line the engine-placed path drew); false = never drawn there (ファタモルガーナの館: its options are drawn by the game, #choiceframe) */
  orphanDraw:true,
 },
 page:{
  /* KiriKiri: a message layer cleared by the game (KAG [cm], MessageLayer.clear) after its line was reported takes that line off the
     placement (the reader never redraws a line the game has cleared); false = kernel: nothing is said at a clear */
  reportClear:false,
  /* the lines of one page (an engine that reports each line with its boxes: KiriKiri ToMe_CHARS) are drawn together, each on its own
     row: a line goes on the page when the game has not cleared it since (page.reportClear) and it starts below the page's rows; false
     (core/overlay-placement.cjs rows). true = every line goes through the page (ファタモルガーナの館); null = only when a line has stacked
     under one still on screen; false (the kernel default: a game's fix never changes another game) = never */
  engineRows:false,
  /* the game draws one line over several frames (fade, wipe, per-character effects): null = kernel heuristics; true = every
     repaint of the same line is one line (never a new line, never a skip); false = frames are not effects */
  effectFrames:null,
  /* the game is laid out as a flow page (several sentences per page, the reader lays them out from the text box): null = kernel
     (script guess, overruled by an engine page DLL); true / false = always / never */
  flowPage:null,
  presentation:null,
  /* ms a hook line waits for its place on the page before it is dropped: null = kernel (OCR 5000, engines 1500) */
  holdMs:null,
  // A message layer may replay its page through the hook after a separate dialogue line has already been drawn.
  filterHookRedraws:false,
  hookAnnotationPatterns:[],
  /* a page line takes the held hook line its drawn text shows (equal, inside, or an effect frame's shuffled characters), a clean
     drawn line holding the hook piece and more is the line itself; false = the kernel: the first held hook line, by order */
  pairByDrawn:false,
  /* a hook line no page line took within holdMs is delivered from the hook text unless the reader already has it; false = the
     kernel: dropped while the page is up ("drawn nowhere on the page, dropped") */
  keepHeld:false,
  /* #1143 a live line that is a merged fast-forward text (core/hook-native.cjs lastOfMerged) over twice this many characters, which neither the
     script nor a speaker change could cut, keeps its last sentences up to this many characters; null = the kernel: such a text stays whole */
  skipMergedTail:null,
 },
 choice:{
  /* engine-draw: frame pictures (RegExp sources on the KAG message layer's frameGraphic) of the game's choice page: its text is drawn by
     the game (not hidden) and reported as choices; [] = the kernel: no such page */
  pageFrames:[],
  /* RegExp sources (flags 'u'); a choice candidate whose text matches one of them is never offered as an option */
  filters:[],
  /* an interleaved effect frame is told by content characters only (ellipses and punctuation repeat in any option); false = the
     kernel: every character counts */
  contentInterleave:false,
  /* candidates that are a text effect's interleaved frame, or a piece of a line already read, are no options (9b3ff9b1, ファタ r30);
     false = the kernel: only choice.filters apply */
  dropEffectFrames:false,
 },
 hide:{
  /* the game's text effect cannot be hidden line by line: start this game in read mode (the original stays, MeguLit shows
     the translation), like the per-exe memory of services/text-effects.cjs */
  textEffectsRead:false,
  /* show the original first and check it before hiding: null = kernel (skipped while a KiriKiri page DLL hides the text itself) */
  preflight:null,
  /* the game itself draws the current line invisible, calibration waits for the next line: null = kernel (KiriKiri page DLL) */
  drawsHidden:null,
  /* the engine side hides the text itself (KiriKiri / Ren'Py page DLL) and HookBridge passes lines unchanged once one line was
     confirmed hidden (native/HookBridge.cs EngineAllOk, sent as MEGULIT_PROFILE / {type:'profile'}). null = kernel rule:
     enabled (trial on), unconfirmedLines 2 (lines in a row without a hidden confirmation end the proof), clickMs 400 (texts of
     one click), skipAside true (scene labels and name plates pass without starting a trial) */
  engineTrial:{enabled:null,unconfirmedLines:null,clickMs:null,skipAside:null},
 },
 /* self-check thresholds of the auto-profile layer (feat/auto-profile): a window of lines whose hide/drop/repeat/pairing
    rates decide a fallback */
 /* 2026-11-21 library scan (core/library.cjs steamParts): one work installed in parts (a program of the same name in the install root
    and in part folders, BALDR SKY Dive1): { '.': root label, '<folder>': part label }; null = the kernel names a part after its
    folder and the root after the game's title */
 library:{partLabels:null},
 selfCheck:{window:20,minLines:8,hideVisible:0.25,dropRate:0.15,repeatRate:0.1,choiceMismatch:1,positionPx:96,pairRate:0.8},
 /* what this PC's calibration measured (auto layer): null = not calibrated, the kernel decides */
 calibrate:{
  positionSource:null,/* 'engine' | 'glyph' | 'ocr' */
  textBox:null,/* {x,y,w,h} client px */
  hideMethod:null,/* 'engine' | 'glyph' | 'gpu' | 'read' */
 },
 /* engine-draw (docs/engine-draw-protocol.md): the engine layer reads what it draws from inside the engine */
 draw:{
  /* report each drawn run with its role (name / choice / button / menu / system); false = the kernel: names are not
     reported, link and choice text goes with the dialogue */
  roles:false,
  /* Version-pinned diagnostic raw input only; does not grant roles, hide or embedding. */
  advhdInput:false,
  cmvsInput:false,
  fvpInput:false,
  minoriInput:false,
  spikechunsoftInput:false,
  kemcoSprites:false,
  /* the game draws MeguLit's replacement of a dialogue line itself (Japanese + ruby [+ Chinese]); false = hide + overlay */
  embed:false,
  /* with embed on, the Chinese is drawn by the game too (false = ruby only, the reader draws the Chinese) */
  embedTranslation:true,
  /* the version layer's address table for an engine DLL that finds its draw functions by signature (MAGES: {engine:'mages',
     drawDialogue, drawGlyph, commit, clear, pages, stride, ...} module offsets); the DLL hooks only when the signature agrees.
     It also tells the kernel how to read the records (charset, canvas). null = the signature alone */
  engineTable:null,
  /* native engines whose message / name / choice sprites share one layout (BGI): which call chain is which role, one entry
     "<rva>,<rva>,...=<role>" per chain (the via= of the engine's DRAWRUN rows, a prefix is enough); [] = the kernel: no role */
  viaRoles:[],
 },
 /* 2026-11-21 (owner: 英文学习模式 + 多语言译文) settings that depend on the language of the game's text, one block per BCP 47 tag
    ('ja', 'en', 'zh-Hans'): {annotation:'ruby'|'ipa'|'pinyin'|'none', pairing:'script'|'patch'|'machine'|'none', dictionary:<id>,
    fontFallback:[font names]}. The client takes the block of the source language it reads (Profiles.forLang), else the
    language-free settings around it. Empty = the kernel as before (Japanese: ruby, the script's pairing). */
 lang:{},
 safeMode:{
  /* reader redraws per second while the game is in a page effect; null = kernel default */
  redrawRate:null,
  /* core counts the first 20 lines broken by the text effect (hook-text / placement fallback, shuffled page draw, effect frame of
     the line) and switches read mode over 30 % (hookTextEffects); false = the kernel: only the reader's own pairing count */
  effectJudge:false,
 },
 /* 2026-11-21 Cardinal (core/cardinal/, services/cardinal.cjs, docs/cardinal.md): after a session, a calibration or a self-check this
    PC replays the session's last lines through a hidden reader and scores what the player saw. Here so a signed diff can retune the
    rules per game (hot update): rev is the record's cardinalRev (raise it with any change of the rules below); lines = the last N
    dialogue lines replayed; maxGapMs / sampleMs = the replay clock (gaps longer than maxGapMs shortened, the page measured every
     sampleMs); minIntervalMin = at most one run per exe in that time (a session's end always runs); maxLagMs bounds step/sample lateness
     P95 and every sampler gap beyond sampleMs. Missing/invalid monotonic timing, failed probes, fewer than four probes or a DOM sample
     count/clock mismatch stays on this PC and is never uploaded */
 cardinal:{
  rev:8,lines:60,maxGapMs:1500,sampleMs:90,minIntervalMin:30,maxLagMs:80,
  /* the total = applicable-score weighted mean, capped by visible expected dialogue coverage */
  weights:{row:3,stable:1,clean:2,clear:1,choice:1,pair:1,leak:2},
  /* core/cardinal/checks.cjs T0: a line is settled settleMs after it became the reader's line, the row counts as shown in shownRate of
     its settled samples; stablePx: the Japanese row may move this much; cnOverlapPx: the Chinese may reach this far over the Japanese;
     lineMs: a line counts once shown that long; burstMs: lines closer than this are a skip burst; calibGapMs / calibWatchMs: the
     Japanese may be gone at most calibGapMs within calibWatchMs of a calibration; choiceMs: options visible within this; staleChars:
     an earlier line's row of at least this many characters left on the page is stale; preflightMs: the kernel's preflight (the original
     shown once and checked before the hide) may keep the hide off this long without counting as a leak */
  thresholds:{settleMs:300,shownRate:0.9,stablePx:0,cnOverlapPx:2,lineMs:700,burstMs:300,calibGapMs:1000,calibWatchMs:2500,choiceMs:3000,staleChars:4,preflightMs:1500},
 },
};
