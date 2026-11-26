// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <cstddef>

namespace Sact2 {

struct Glyph { int x, y; unsigned code; };

// The live message sprite has a separate name row and up to three body rows.
// The backlog uses its own full-screen sprite, even when it contains this text.
constexpr size_t MaxGlyphs = 128;
inline int BubbleSlot(int x, int y) {
 if (y != 2 && y != 143 && y != 284) return 0;
 const int column = x == 96 ? 1 : x == 228 ? 2 : x == 240 ? 3 : 0;
 return column ? column + 3 * ((y - 2) / 141) : 0;
}
inline bool Bubble(int x, const Glyph *glyphs, size_t count) {
 // These sprites center a block of 14-pixel characters on a 16-pixel row grid.
 // The action ticker and command cards don't use this grid or these anchors.
 const auto &first = glyphs[0];
 if (first.x < 0 || first.x > 87 || (first.y != 6 && first.y != 14 && first.y != 22)) return false;
 const int rows = 1 + (22 - first.y) / 8;
 int row = 0, width = 0, widest = 0;
 for (size_t i = 0; i < count; ++i) {
  const auto &g = glyphs[i];
  if (g.y == first.y + (row + 1) * 16) {
   ++row;
   if (row >= rows) return false;
   if (width > widest) widest = width;
   width = 0;
  }
  if (g.y != first.y + row * 16 || g.x != first.x + 14 * width) return false;
  ++width;
 }
 if (width > widest) widest = width;
 return row + 1 == rows && first.x + 7 * widest == (x == 240 ? 78 : 94);
}
inline size_t DrawCount(bool hide, int x, int y, const Glyph *glyphs, size_t count) {
 if (!hide || !count || count > MaxGlyphs) return count;
 if (BubbleSlot(x, y)) return Bubble(x, glyphs, count) ? 0 : count;
 if (x != 3 || y != 355) return count;
 size_t body = 0;
 if (glyphs[0].y == 6) {
  if (glyphs[0].x != 54 || glyphs[0].code != 0x7981) return count; // 【 in CP932
  body = 1;
  while (body < count && glyphs[body].y == 6 && glyphs[body].x == 54 + 20 * (int)body) ++body;
  if (body < 3 || body == count || glyphs[body - 1].code != 0x7a81) return count; // 】
 }
 const auto &first = glyphs[body];
 if (first.x != 54 || first.y != 36) return count;
 if (body && first.code != 0x7581 && first.code != 0x7781 && first.code != 0x6981) return count; // 「, 『, （
 for (size_t i = body; i < count; ++i) {
  const auto &g = glyphs[i];
  if ((g.y != 36 && g.y != 62 && g.y != 88) || g.x < 54 || g.x >= 588) return count;
  if (g.code < 0x20) return count;
  if (i > body && (g.y < glyphs[i - 1].y || (g.y == glyphs[i - 1].y && g.x <= glyphs[i - 1].x))) return count;
 }
 return body;
}

}
