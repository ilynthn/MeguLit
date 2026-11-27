// SPDX-License-Identifier: GPL-3.0-or-later
// GlyphTrace.h: where each GetGlyphOutline glyph ends up on screen (hide layer 4, MeguLitGpu; docs/hide-layers.md,
// "Glyph trace"). For engines that rasterise every character with GetGlyphOutline and copy the bitmap into their own
// Direct3D texture with their own code (CLANNAD / Siglus, ISLAND / CatSystem2, Under The Moon / AdvHD), no GDI call says
// where the character is drawn. Three steps, all generic:
//  1. Glyph: every GetGlyphOutline call that returns a bitmap (GGO_BITMAP, GGO_GRAY2/4/8) is queued with its character,
//     metrics and coverage (0..255), oldest first, for 1.5 s.
//  2. Write: a texture write (D3D9 LockRect/UnlockRect on a texture or its level-0 surface, UpdateSurface/UpdateTexture
//     copies, D3D11 UpdateSubresource) takes queued glyphs:
//     - a written rectangle of one glyph's size (the engine uploads glyph by glyph) takes the oldest glyph that fits;
//       inside it the bitmap is placed by content when the glyph has ink, else the rectangle is the cell;
//     - a bigger write (whole texture) is searched for each queued glyph's bitmap (anchor pixel + full compare), or,
//       for a blank glyph (MeguLitFont blank mode) that carries a mark pixel at its top-left (coverage 1..48 of 255),
//       for that mark with an empty box after it.
//     The cell (texture, texel rect, character) is kept; a later cell over the same texels replaces it.
//  3. Draw: a textured quad whose texel rect is centred on a known cell is that character, at the quad's place (render
//     target pixels mapped to the back buffer like layer 4's glyph rects). Per dialogue line (LINE from HookBridge) the
//     characters drawn since the line started are reported in draw order:
//       ToMe_GLYPHPOS line=<seq> sw=<back W> sh=<back H> n=<k> list=<u hex>,<x>,<y>,<w>,<h>;...
//     Positions closer than 40 % of the glyph height with the same character are one (shadow / outline passes).
//     A previous line still drawn after LINE (fading out) is reported too; the reader matches characters in order.
//     Cached glyphs (no new GetGlyphOutline call) are found through their cell like new ones.
#pragma once
#include <string>
#include <vector>
#include <deque>
#include <map>
#include <functional>
#include <cmath>
#include <stdint.h>
#include <stdio.h>
#include <chrono>
#include <algorithm>

struct GtGlyph { unsigned ord, at; uint32_t u; int bw, bh, cell, ink; std::vector<uint8_t> cov; };
// tint: 0x01RRGGBB when the texels the glyph was written to carry a colour (the engine tints on the CPU), 0 = unknown / grey-only format
struct GtCell { int x, y, w, h; uint32_t u; unsigned ord; uint32_t tint = 0; };

struct GlyphTrace {
 // col: the quad's vertex colour 0xAARRGGBB when the draw has one (hasCol)
 struct Q { float x0, y0, x1, y1, u0, v0, u1, v1; uint32_t col = 0xffffffffu; bool hasCol = false; unsigned glyph = 0; };
 struct Pos { uint32_t u; float x, y, w, h; unsigned order; uint32_t col = 0; bool hasCol = false; };
 std::function<void(const std::string &)> emit; void (*log)(const char *, ...) = nullptr;
 std::deque<GtGlyph> pending; unsigned ord = 0, traced = 0;
 std::map<void *, std::vector<GtCell>> cells;
 unsigned seq = 0, lineAt = 0, order = 0, lastEmit = 0; bool dirty = false; std::vector<Pos> drawn;
 uint32_t sentCol = 0; bool sentAny = false, colDirty = false;

 static int Pad(int h) { return (std::max)(8, h / 2); }
 void Expire(unsigned now) { while (!pending.empty() && (int)(now - pending.front().at) > 1500) pending.pop_front(); while (pending.size() > 256) pending.pop_front(); }

 // 1. GetGlyphOutline returned a bitmap. cov: bw x bh coverage 0..255 (row-major, no padding); cellH: the font's cell
 //    height (tmHeight), the upper bound of a one-glyph upload together with the advance.
 void Glyph(uint32_t u, int bw, int bh, int cellH, const uint8_t *cov, unsigned now) {
  if (bw <= 0 || bh <= 0 || bw > 512 || bh > 512) return; Expire(now);
  GtGlyph g; g.ord = ++ord; g.at = now; g.u = u; g.bw = bw; g.bh = bh; g.cell = (std::max)(cellH, (std::max)(bw, bh)); g.cov.assign(cov, cov + (size_t)bw * bh); g.ink = 0;
  for (uint8_t c : g.cov) if (c > 48) g.ink++;
  pending.push_back(std::move(g));
 }
 bool Waiting() const { return !pending.empty(); }
 bool Known(void *tex) const { return cells.count(tex) > 0; }

 void Keep(void *tex, const GtCell &c) {
  auto &v = cells[tex]; for (size_t i = 0; i < v.size();) { const GtCell &o = v[i]; if (o.x < c.x + c.w && c.x < o.x + o.w && o.y < c.y + c.h && c.y < o.y + o.h) v.erase(v.begin() + i); else i++; }
  if (v.size() >= 8192) v.erase(v.begin()); v.push_back(c); traced++; if (cells.size() > 256) { auto keep = cells[tex]; cells.clear(); cells[tex] = keep; }
 }
 // Best place of glyph g inside the region (rx,ry,rw,rh) of read(x,y) (-1 = unreadable): returns false when not found.
 /* 2026-11-19 (1.4.17 live, 千恋＊万花: 35 s "not responding" on the title): a search runs on the game thread, so it stops at the
    deadline of the write that asked for it */
 typedef std::chrono::steady_clock::time_point Deadline;
 static bool Late(const Deadline *d) { return d && std::chrono::steady_clock::now() > *d; }
 template <class R> static bool Find(const GtGlyph &g, const R &read, int rx, int ry, int rw, int rh, int &fx, int &fy, const std::vector<GtCell> *taken = nullptr, const Deadline *deadline = nullptr) {
  auto used = [&](int x, int y) { if (taken) for (const GtCell &c : *taken) if (x < c.x + c.w && c.x < x + g.bw && y < c.y + c.h && c.y < y + g.bh) return true; return false; };
  if (g.bw > rw || g.bh > rh) return false;
  if (g.ink >= 3) {
   int ax = 0, ay = 0, av = -1; for (int y = 0; y < g.bh; y++) for (int x = 0; x < g.bw; x++) if (g.cov[(size_t)y * g.bw + x] > av) { av = g.cov[(size_t)y * g.bw + x]; ax = x; ay = y; }
   for (int y = ry + ay; y <= ry + rh - g.bh + ay; y++) { if (Late(deadline)) return false; for (int x = rx + ax; x <= rx + rw - g.bw + ax; x++) {
    int t = read(x, y); if (t < 0) return false; if (std::abs(t - av) > 40) continue;
    int ox = x - ax, oy = y - ay; if (used(ox, oy)) continue; long diff = 0; int missing = 0;
    for (int yy = 0; yy < g.bh; yy++) for (int xx = 0; xx < g.bw; xx++) { int a = g.cov[(size_t)yy * g.bw + xx], b = read(ox + xx, oy + yy); if (b < 0) return false; diff += std::abs(a - b); if (a > 96 && b < 32) missing++; }
    if (diff <= 20L * g.bw * g.bh && missing * 10 <= g.ink) { fx = ox; fy = oy; return true; }
   } }
   // not there with its ink: the engine may have received the blank of MeguLitFont (whose hook ran after ours)
  }
  // blank glyph with a mark pixel at its top-left (coverage 1..48), nothing else inside its box
  else if (g.cov[0] == 0) return false;
  for (int y = ry; y <= ry + rh - g.bh; y++) { if (Late(deadline)) return false; for (int x = rx; x <= rx + rw - g.bw; x++) {
   int t = read(x, y); if (t < 0) return false; if (t < 1 || t > 48 || used(x, y)) continue; bool empty = true;
   for (int yy = 0; yy < g.bh && empty; yy++) for (int xx = 0; xx < g.bw; xx++) { if (!xx && !yy) continue; int b = read(x + xx, y + yy); if (b < 0 || b > 2) { empty = false; break; } }
   if (empty) { fx = x; fy = y; return true; }
  } }
  return false;
 }
 // 2. Texels (x, y, w, h) of texture tex were written; read(x, y) gives the written coverage (0..255) or -1.
 // The colour of a glyph where it was written (read / unread tint done on the CPU): up to 8 texels under the glyph's strongest
 // coverage, looked up from the glyph's own small bitmap. No search of the written image, a few texel reads per glyph.
 // Texels inside the strokes first (coverage >= 200 and the four neighbours too): at the edge of a stroke the game blends the
 // fill with its outline, shadow and anti-aliasing. Of those the most saturated one is the fill: blending only takes
 // saturation away, and the mean of edge and inside came out grey-pink for a bright pink speaker colour (アイキス3 sexy, アヤメ
 // #ff5ea8). Neutral text (white, grey: nothing saturated to go by) takes the per-channel median.
 template <class C> static uint32_t Tint(const GtGlyph &g, const C &rgb, int fx, int fy) {
  size_t total = g.cov.size(), step = total > 4096 ? total / 4096 : 1; const int bw = g.bw, bh = g.bh;
  auto inside = [&](size_t i) { int x = (int)(i % bw), y = (int)(i / bw); if (x < 1 || y < 1 || x >= bw - 1 || y >= bh - 1) return false;
   return g.cov[i - 1] >= 200 && g.cov[i + 1] >= 200 && g.cov[i - bw] >= 200 && g.cov[i + bw] >= 200; };
  int s[8]; int n = 0;
  for (int pass = 0; pass < 2 && n < 2; pass++)
   for (size_t i = 0; i < total && n < 8; i += step) if (g.cov[i] >= 200 && (pass ? !inside(i) : inside(i))) { int c = rgb(fx + (int)(i % bw), fy + (int)(i / bw)); if (c < 0) return 0; s[n++] = c; i += total / 9; }
  if (n < 2) return 0;
  auto ch = [](int c, int k) { return (c >> (16 - 8 * k)) & 255; };
  int best = 0, bestSat = -1; for (int i = 0; i < n; i++) { int hi = (std::max)(ch(s[i], 0), (std::max)(ch(s[i], 1), ch(s[i], 2))), lo = (std::min)(ch(s[i], 0), (std::min)(ch(s[i], 1), ch(s[i], 2))); if (hi - lo > bestSat) { bestSat = hi - lo; best = i; } }
  if (bestSat >= 40) return 0x01000000u | (uint32_t)(s[best] & 0xffffff);
  uint32_t out = 0x01000000u; for (int k = 0; k < 3; k++) { int v[8]; for (int i = 0; i < n; i++) v[i] = ch(s[i], k); std::sort(v, v + n); out |= (uint32_t)v[n / 2] << (16 - 8 * k); }
  return out;
 }
 template <class R> void Write(void *tex, int x, int y, int w, int h, bool whole, const R &read, unsigned now) { Write(tex, x, y, w, h, whole, read, [](int, int) { return -1; }, now); }
 template <class R, class C> void Write(void *tex, int x, int y, int w, int h, bool whole, const R &read, const C &rgb, unsigned now) {
  Expire(now); if (pending.empty() || w <= 0 || h <= 0) return;
  if (!whole) for (size_t i = 0; i < pending.size(); i++) { const GtGlyph &g = pending[i];
   // one glyph's upload: as big as the glyph's box at least, at most its cell plus a margin
   if (w + 1 < g.bw || h + 1 < g.bh || w > g.cell + Pad(g.cell) || h > g.cell + Pad(g.cell)) continue;
   GtCell c{ x, y, w, h, g.u, g.ord }; int fx, fy; if (g.ink >= 3 && Find(g, read, x, y, w, h, fx, fy)) { c = GtCell{ fx, fy, g.bw, g.bh, g.u, g.ord }; c.tint = Tint(g, rgb, fx, fy); }
   Keep(tex, c); if (log) log("glyph trace: U+%04X ord=%u -> tex %p texels %d,%d %dx%d (upload)", g.u, g.ord, tex, c.x, c.y, c.w, c.h);
   pending.erase(pending.begin(), pending.begin() + i + 1); return; }
  if ((long long)w * h > 4LL * 1024 * 1024) return;
  /* at most 4 ms of the game thread per write; the glyphs not looked for yet stay pending for the next writes */
  std::vector<GtCell> taken; const Deadline deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(4);
  for (size_t i = 0; i < pending.size();) { if (Late(&deadline)) break; const GtGlyph &g = pending[i]; int fx, fy;
   if (Find(g, read, x, y, w, h, fx, fy, &taken, &deadline)) { taken.push_back(GtCell{ fx, fy, g.bw, g.bh, g.u, g.ord }); if (g.ink >= 3) taken.back().tint = Tint(g, rgb, fx, fy); Keep(tex, taken.back()); if (log) log("glyph trace: U+%04X ord=%u -> tex %p texels %d,%d %dx%d (content)", g.u, g.ord, tex, fx, fy, g.bw, g.bh); pending.erase(pending.begin() + i); }
   else i++; }
 }
 // A copy of texels (sx, sy, w, h) of src to (dx, dy) of dst (UpdateSurface / UpdateTexture / CopySubresourceRegion).
 void Copy(void *src, void *dst, int sx, int sy, int w, int h, int dx, int dy) {
  auto it = cells.find(src); if (it == cells.end() || src == dst) return; std::vector<GtCell> add;
  for (const GtCell &c : it->second) if (c.x >= sx && c.y >= sy && c.x + c.w <= sx + w && c.y + c.h <= sy + h) add.push_back(GtCell{ c.x - sx + dx, c.y - sy + dy, c.w, c.h, c.u, c.ord });
  for (auto &c : add) Keep(dst, c);
 }
 void Line(unsigned s, unsigned now) {
  seq = s; lineAt = now; drawn.clear(); order = 0; dirty = false; sentAny = false; colDirty = false;
 }
 void Off() { seq = 0; drawn.clear(); }
 // 3. One draw of quads from texture tex (tw x th); toBack maps a render-target rect to back-buffer pixels (false = not yet).
 template <class M> void Draw(void *tex, unsigned tw, unsigned th, std::vector<Q> &q, const M &toBack, unsigned now) {
  if (!seq || !tw || !th) return; auto it = cells.find(tex); if (it == cells.end()) return; const auto &cv = it->second;
  for (Q &d : q) {
   float cx = (d.u0 + d.u1) * 0.5f * tw, cy = (d.v0 + d.v1) * 0.5f * th, uw = std::fabs(d.u1 - d.u0) * tw, vh = std::fabs(d.v1 - d.v0) * th;
   const GtCell *hit = nullptr; for (const GtCell &c : cv) if (cx >= c.x - 1 && cx <= c.x + c.w + 1 && cy >= c.y - 1 && cy <= c.y + c.h + 1 && uw <= c.w * 2 + 4 && vh <= c.h * 2 + 4) { hit = &c; break; }
   d.glyph = hit ? hit->ord : 0;
   if (!hit) continue;
   float r[4] = { (std::min)(d.x0, d.x1), (std::min)(d.y0, d.y1), (std::max)(d.x0, d.x1), (std::max)(d.y0, d.y1) }; if (!toBack(r)) continue;
   float w = r[2] - r[0], h = r[3] - r[1]; if (w < 1 || h < 1) continue;
   // what this pass paints the character with: the written tint times the vertex colour (either may be missing). A character is
   // drawn in several passes (shadow, outline, then the text on top): the last pass is its colour.
   bool has = hit->tint != 0 || d.hasCol; uint32_t col = 0;
   if (has) { uint32_t t = hit->tint ? hit->tint & 0xffffff : 0xffffff, v = d.hasCol ? d.col : 0xffffffffu;
    col = (v & 0xff000000u) | ((((t >> 16) & 255) * ((v >> 16) & 255) / 255) << 16) | ((((t >> 8) & 255) * ((v >> 8) & 255) / 255) << 8) | ((t & 255) * (v & 255) / 255); }
   bool dup = false; for (Pos &p : drawn) if (p.u == hit->u && std::fabs(p.x - r[0]) < h * 0.4f && std::fabs(p.y - r[1]) < h * 0.4f) { dup = true; if (has && (!p.hasCol || p.col != col)) { p.col = col; p.hasCol = true; colDirty = true; } break; }
   if (dup || drawn.size() >= 400) continue;
   Pos np{ hit->u, r[0], r[1], w, h, ++order }; np.col = col; np.hasCol = has; drawn.push_back(np); dirty = true; if (has) colDirty = true;
  }
 }
 // The line's colour: the most common one among its characters (4 bits a channel), as the mean of that group.
 //   ToMe_GLYPHCOL line=<seq> rgb=<rrggbb> a=<aa> n=<characters with that colour> of=<characters with a colour>
 static uint32_t ColKey(uint32_t c) { return ((c >> 28) & 15) << 12 | ((c >> 20) & 15) << 8 | ((c >> 12) & 15) << 4 | ((c >> 4) & 15); }
 bool LineColor(uint32_t &out, int &n, int &of) const {
  std::map<uint32_t, int> count; of = 0; for (const Pos &p : drawn) if (p.hasCol) { of++; count[ColKey(p.col)]++; }
  if (of < 2) return false; uint32_t key = 0; n = 0; for (auto &c : count) if (c.second > n) { n = c.second; key = c.first; }
  long a = 0, r = 0, g = 0, b = 0; for (const Pos &p : drawn) if (p.hasCol && ColKey(p.col) == key) { a += p.col >> 24; r += (p.col >> 16) & 255; g += (p.col >> 8) & 255; b += p.col & 255; }
  out = ((uint32_t)(a / n) << 24) | ((uint32_t)(r / n) << 16) | ((uint32_t)(g / n) << 8) | (uint32_t)(b / n); return n * 2 >= of;
 }
 unsigned lastCol = 0;
 void Frame(unsigned now, unsigned bbW, unsigned bbH) {
  if (colDirty && emit && seq && (int)(now - lastCol) >= 120) { colDirty = false; lastCol = now; uint32_t c; int n, of;
   if (LineColor(c, n, of) && (!sentAny || c != sentCol)) { sentAny = true; sentCol = c; char b[120]; snprintf(b, sizeof b, "ToMe_GLYPHCOL line=%u rgb=%06x a=%02x n=%d of=%d", seq, c & 0xffffff, c >> 24, n, of); emit(b); } }
  if (!dirty || !emit || (int)(now - lastEmit) < 120) return; dirty = false; lastEmit = now;
  std::string l = "ToMe_GLYPHPOS line=" + std::to_string(seq) + " sw=" + std::to_string(bbW) + " sh=" + std::to_string(bbH) + " n=" + std::to_string(drawn.size()) + " list=";
  for (size_t i = 0; i < drawn.size(); i++) { char b[80]; snprintf(b, sizeof b, "%s%X,%.0f,%.0f,%.0f,%.0f", i ? ";" : "", drawn[i].u, drawn[i].x, drawn[i].y, drawn[i].w, drawn[i].h); l += b; }
  emit(l);
 }
};

// Coverage 0..255 of one texel of a locked surface in the formats glyph uploads use (-1: other formats).
static inline int GtTexel(const unsigned char *row, int x, int fmt) {
 switch (fmt) {
  case 21: case 32: { const unsigned char *p = row + x * 4; return p[3]; }                       // A8R8G8B8, A8B8G8R8: alpha
  case 22: case 33: { const unsigned char *p = row + x * 4; return (std::max)(p[0], (std::max)(p[1], p[2])); } // X8: brightest channel
  case 28: case 50: return row[x];                                                                  // A8, L8
  case 51: return row[x * 2 + 1];                                                                   // A8L8: alpha
  case 26: return (row[x * 2 + 1] >> 4) * 17;                                                       // A4R4G4B4: alpha
  default: return -1;
 }
}
// Colour 0xRRGGBB of one texel in the formats that carry one (-1: alpha / luminance only, or another format).
static inline int GtTexelRgb(const unsigned char *row, int x, int fmt) {
 switch (fmt) {
  case 21: case 22: { const unsigned char *p = row + x * 4; return (p[2] << 16) | (p[1] << 8) | p[0]; }  // A8R8G8B8, X8R8G8B8 (memory B G R A)
  case 32: case 33: { const unsigned char *p = row + x * 4; return (p[0] << 16) | (p[1] << 8) | p[2]; }  // A8B8G8R8, X8B8G8R8
  case 26: { unsigned v = row[x * 2] | (row[x * 2 + 1] << 8); return (((v >> 8) & 15) * 17 << 16) | (((v >> 4) & 15) * 17 << 8) | ((v & 15) * 17); } // A4R4G4B4
  default: return -1;
 }
}
// GetGlyphOutline bitmap -> coverage 0..255 (rows are DWORD aligned; mono 1 bit, gray 0..4 / 0..16 / 0..64).
static inline bool GtCoverage(unsigned format, const unsigned char *buf, unsigned size, int bw, int bh, std::vector<uint8_t> &out) {
 format &= 0x0F; if (bw <= 0 || bh <= 0) return false; int levels = format == 4 ? 4 : format == 5 ? 16 : format == 6 ? 64 : format == 1 ? 1 : 0; if (!levels) return false;
 unsigned pitch = format == 1 ? ((bw + 31) / 32) * 4 : (bw + 3) & ~3u; if ((unsigned long long)pitch * bh > size) return false; out.assign((size_t)bw * bh, 0);
 for (int y = 0; y < bh; y++) for (int x = 0; x < bw; x++) { int v = format == 1 ? ((buf[y * pitch + x / 8] >> (7 - x % 8)) & 1) : buf[y * pitch + x]; out[(size_t)y * bw + x] = (uint8_t)((std::min)(v, levels) * 255 / levels); }
 return true;
}
