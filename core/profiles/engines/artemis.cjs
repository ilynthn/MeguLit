// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine diff: Artemis (*.pfs). Only keys of core/profiles/defaults.cjs that every Artemis game on the Artemis2 hook needs.
   2026-11-27 ハミダシクリエイティブ (D3D9, FreeType): the line is rasterised on the CPU, so GDI and GPU glyph hides see nothing; the
   Artemis2 hook (made writable in native/megulithook/Artemis.cpp) is the layout call, one glyph or ruby base per call: every piece
   is blanked while the line is hidden (source.embedGlyphPieces). */
module.exports={
 engine:'artemis',
 settings:{
  source:{embedGlyphPieces:['^Artemis2$']},
 },
};
