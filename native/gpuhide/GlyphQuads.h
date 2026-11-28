// SPDX-License-Identifier: GPL-3.0-or-later
// GlyphQuads.h: the API-independent part of hide layer 4 (MeguLitGpu, see GpuHide.cpp and docs/hide-layers.md).
// Input: textured quads per draw call (screen rect + texture-coordinate rect, the texture's size, the render target).
// It learns which quads are the dialogue's glyphs and where the text area is, and decides which quads to leave out.
//
// Glyph-like quad: 4..160 px on screen each way, aspect 1:5..5:1, sampled from a cell of a sheet (at most half of a
// texture of at least 32x32; at most 1/24 of a texture bigger than 256x256), drawn at 0.2..6x its texel size.
// Per line (LINE <text>, n = non-blank characters):
//  - groups = (render target, atlas size). Two counts per group: (A) distinct glyph positions drawn in the last frame,
//    (B) distinct glyph keys (position + atlas cell) first drawn since the line started (the previous line's glyphs
//    that the game keeps redrawing are older). Shadows and outlines drawn as offset copies are merged: positions closer
//    than 40 % of the glyph height are one character.
//  - a row cluster whose count equals n learns the text area (its bounding box, grown by one glyph height) and the
//    atlas sizes that drew there. Learning hides nothing.
//  - after that, while armed (a LINE in the last 60 s, no OFF), glyph-like quads from the learned atlases whose centre
//    lies in the text area are left out. The first hidden draw per line is a "hit". The CMVS startup strategy
//    verifies and masks the cells of a traced body row before publishing the first hit and placement.
#pragma once
#include <string>
#include <vector>
#include <map>
#include <set>
#include <algorithm>
#include <functional>
#include <utility>
#include <cmath>
#include "CmvsBodyStrategy.h"
#include <stdio.h>

struct Quad { float x0, y0, x1, y1, u0, v0, u1, v1; unsigned first; unsigned col = 0xffffffffu; bool hasCol = false; unsigned glyph = 0; }; // col: vertex colour 0xAARRGGBB of the quad's first vertex

static inline bool GlyphLike(const Quad &q, unsigned tw, unsigned th) {
 if (tw < 32 || th < 32) return false;
 float w = q.x1 - q.x0, h = q.y1 - q.y0; if (w < 4 || h < 4 || w > 160 || h > 160) return false; if (w > h * 5 || h > w * 5) return false;
 float tu = (q.u1 - q.u0) * tw, tv = (q.v1 - q.v0) * th; if (tu < 3 || tv < 3) return false;
 // a cell of a sheet: at most half the texture (a whole-texture sprite is never a glyph); big sheets need small cells
 float area = (q.u1 - q.u0) * (q.v1 - q.v0); if (area > 0.5f || (tw * th > 256 * 256 && area > 1.0f / 24)) return false;
 float scale = w / tu; if (scale < 0.2f || scale > 6) return false;
 return true;
}
static inline bool Blank(wchar_t c) { return c <= 0x20 || c == 0x3000 || c == 0x200B || c == 0xFEFF || c == 0x1F; }

struct NativeGroupOrder {
 long long operator()(void *rt, void *tex) const {
  return ((long long)(size_t)rt * 1315423911LL) ^ (long long)(size_t)tex;
 }
};

template <class GroupOrder> struct OrderedGlyphLearner : private GroupOrder {
 explicit OrderedGlyphLearner(GroupOrder order = {}) : GroupOrder(std::move(order)) {}
 struct Rect { float x0, y0, x1, y1; bool traced = false; };
 struct Seen { Rect r; unsigned firstAt, lastFrame, glyph, tracedAt; bool fixedCell = false; };
 struct Group { void *rt, *tex; unsigned tw, th, rtW, rtH; std::map<long long, Seen> keys; std::vector<Rect> frame, prev; unsigned prevFrame; CmvsBodyAtlas<Rect> cmvs; };
 std::function<void(const std::string &)> emit; void (*log)(const char *, ...) = nullptr;
 bool readOnly = false;
 bool bodyRecheck = false;
 using BodyStrategy = CmvsBodyStrategy<OrderedGlyphLearner>;
 BodyStrategy cmvs;

 typename BodyStrategy::Frame CmvsFrame() const {
  return {bodyRecheck && !readOnly, learned, areaTraced, hitSent, hiddenSent, reported,
          frameNo, bbW, bbH, seq, n, lineAt, prevLineAt, cmvs.bodyReportAt,
          areaRt, areaW, areaH, glyphH, area, blankAt, lastRects, earlierRects};
 }
 // line
 std::vector<bool> blankAt; unsigned nb = 0; // the line with its interior blanks (engines that draw a blank glyph for a space)
 /* 2026-11-20 (CHAOS;CHILD: a page keeps its earlier lines while the next one types out): the places the earlier lines of the page
    were matched on, and when; their glyphs are never the new line's (they made a typed-out line look complete, and the line was
    hidden and placed on the earlier line's glyphs: its own last row stayed visible) */
 std::vector<Rect> lastRects, earlierRects; std::set<std::pair<long long, long long>> lastKeys, earlierKeys; unsigned frameNow = 0;
 unsigned nameN = 0; std::wstring text; unsigned n = 0, seq = 0, lineAt = 0, prevLineAt = 0, armedUntil = 0; bool reported = false, hitSent = false, hiddenSent = false; unsigned hiddenQuads = 0;
 // learned
 bool learned = false, areaTraced = false; void *areaRt = nullptr; unsigned areaW = 0, areaH = 0; Rect area{}; std::set<long long> atlases; unsigned learnedSeq = 0; float glyphH = 0;
 size_t learnedGlyphs = 0;
 std::map<void *, unsigned> texFirst; // texture -> first time a glyph quad used it
 std::map<long long, Group> groups; unsigned frameNo = 0, bbW = 0, bbH = 0;
 std::map<void *, std::pair<Rect, Rect>> rtMap; // rt texture -> (uv rect, screen rect)

 // one group per (render target, texture): two atlases of the same size (glyph sheet and UI sheet) never mix
 long long GroupKey(void *rt, void *tex) const { return GroupOrder::operator()(rt, tex); }
 bool LearnedAtlas(void *tex) const { return atlases.count(GroupKey(nullptr, tex)) > 0; }
 // a glyph sheet made for one line is sized to that line (e.g. 76 x 88), unlike UI / font atlases (powers of two)
 static bool LineSized(unsigned w, unsigned h) { auto p2 = [](unsigned v) { return v && !(v & (v - 1)); }; return !(p2(w) && p2(h)) && w * h <= 1024u * 256u; }
 bool Armed(unsigned now) const { return n > 0 && (int)(armedUntil - now) > 0; }
 /* 2026-11-21 (owner, CHAOS;CHILD centred narration: near the end of a page the previous line showed again under MeguLit's):
    the game draws the whole page once more (earlier lines + the current one) from a texture the learner has not seen, so
    neither the learned atlas nor the fresh-sheet rule hid it. A line that is the page so far (it ends with the line before
    and is longer) is a redraw: for RedrawMs glyph-height quads in the learned area of a target of the learned size are
    hidden whatever their texture. */
 static const unsigned RedrawMs = 3000; unsigned redrawUntil = 0;
 /* 2026-11-21 (owner, STEINS;GATE r25: the game's own furigana 「な」「き」 showed over MeguLit's text): a ruby glyph is about half
    the body height, so the glyph-height rule (+-20 %) never hid it. A quad 0.35-0.65 of the learned height whose box overlaps a
    body glyph of the current or an earlier line horizontally and sits right on top of it (bottom within 0.15..0.7 body heights
    above the body's top edge, or overlapping it a little) is that glyph's ruby. */
 bool RubySized(float h) const { return glyphH > 0 && h >= glyphH * 0.35f && h <= glyphH * 0.65f; }
 bool RubyOver(const Rect &q) const {
  for (const std::vector<Rect> *v : { &lastRects, &earlierRects }) for (auto &b : *v) {
   float bh = b.y1 - b.y0; if (bh <= 0) continue;
   bool across = q.x1 > b.x0 - bh * 0.25f && q.x0 < b.x1 + bh * 0.25f; float gap = b.y0 - q.y1;
   if (across && gap >= -bh * 0.15f && gap <= bh * 0.7f) return true; }
  return false; }
 static bool PageRedraw(const std::wstring &now, const std::wstring &before) { return before.size() >= 2 && now.size() > before.size() && now.compare(now.size() - before.size(), before.size(), before) == 0; }

 /* Some hooks hand a sentence over twice in one go (the engine lays it out for the page and again for its log): "X    X".
    The line is X: counted twice, a line had room for twice its characters and took the next sentences' places, so the
    reader's Japanese stayed a sentence or three behind and ended with half a sentence again (2026-11-15, みにくいモジカの子).
    Only with a gap of two or more blanks between the halves: a word that repeats itself (ぶよぶよ) is not a doubled line. */
 static std::wstring Undouble(const std::wstring &t) {
  std::wstring s; std::vector<size_t> at; for (size_t i = 0; i < t.size(); i++) if (!Blank(t[i])) { s += t[i]; at.push_back(i); }
  size_t h = s.size() / 2; if (s.size() < 4 || s.size() % 2 || s.compare(0, h, s, h, h) != 0) return t;
  if (at[h] - at[h - 1] < 3) return t; // fewer than two blanks between the halves
  return t.substr(0, at[h - 1] + 1);
 }
 void Line(const std::wstring &raw, unsigned now) {
  /* 2026-11-20 (CHAOS;CHILD: every voiced line stayed unplaced): a speaker tag the hook puts before the line (【大谷】, LunaHook's
     MAGES reader and others) is not drawn in the text box (the name has its own plate): the line is the text after it. A game
     that does draw it inline still matches (Match: the tag's glyphs first, then the line). */
  std::wstring body = raw; nameN = 0;
  { size_t a = 0; while (a < body.size() && Blank(body[a])) a++; if (a < body.size() && body[a] == L'\u3010') { size_t c = body.find(L'\u3011', a); if (c != std::wstring::npos && c - a >= 2 && c - a <= 17 && c + 1 < body.size()) { for (size_t k = a; k <= c; k++) if (!Blank(body[k])) nameN++; body = body.substr(c + 1); } } }
  const std::wstring t = Undouble(body);
  std::wstring s; for (wchar_t c : t) if (!Blank(c)) s += c; if (s.empty()) return;
  if (s == text && Armed(now)) { armedUntil = now + 60000; return; } // the same line again (re-read): keep its state
  redrawUntil = learned && PageRedraw(s, text) ? now + RedrawMs : 0;
  { size_t a = 0, b = t.size(); while (a < b && Blank(t[a])) a++; while (b > a && Blank(t[b - 1])) b--; blankAt.clear(); nb = 0;
    for (size_t i = a; i < b; i++) { if (t[i] == L'\n' || t[i] == L'\r' || t[i] == 0x1F) continue; bool bl = Blank(t[i]); blankAt.push_back(bl); if (bl) nb++; } }
  prevLineAt = lineAt; text = s; n = (unsigned)s.size(); seq++; lineAt = now; armedUntil = now + 60000; reported = hitSent = hiddenSent = false; hiddenQuads = 0;
  if (!lastKeys.empty()) { earlierRects.insert(earlierRects.end(), lastRects.begin(), lastRects.end()); earlierKeys.insert(lastKeys.begin(), lastKeys.end()); if (earlierRects.size() > 512 || earlierKeys.size() > 1024) { earlierRects.clear(); earlierKeys.clear(); } lastRects.clear(); lastKeys.clear(); }
  PageLineAdd(t, n, now);
  if (log) log("LINE seq=%u n=%u", seq, n);
 }
 void Off() { n = 0; armedUntil = 0; PageOff(); if (log) log("OFF"); }

 // A draw onto the back buffer that samples a render-target texture: remember where that texture lands on screen.
 void Composite(void *tex, const std::vector<Quad> &q) {
  if (q.empty()) return; Quad b = q[0]; for (auto &x : q) { b.x0 = (std::min)(b.x0, x.x0); b.y0 = (std::min)(b.y0, x.y0); b.x1 = (std::max)(b.x1, x.x1); b.y1 = (std::max)(b.y1, x.y1); b.u0 = (std::min)(b.u0, x.u0); b.v0 = (std::min)(b.v0, x.v0); b.u1 = (std::max)(b.u1, x.u1); b.v1 = (std::max)(b.v1, x.v1); }
  if (b.u1 - b.u0 < 0.05f || b.v1 - b.v0 < 0.05f) return; rtMap[tex] = std::make_pair(Rect{ b.u0, b.v0, b.u1, b.v1 }, Rect{ b.x0, b.y0, b.x1, b.y1 });
 }
 bool ToScreen(void *rt, unsigned rtW, unsigned rtH, Rect &r) const {
  if (!rt) return true;
  if (rtW && rtW == bbW && rtH == bbH) return true; // a full-screen composition target: same pixels as the back buffer
  auto it = rtMap.find(rt); if (it == rtMap.end() || !rtW || !rtH) return false; const Rect &uv = it->second.first, &sc = it->second.second;
  auto mx = [&](float x) { return sc.x0 + (x / rtW - uv.x0) / (uv.x1 - uv.x0) * (sc.x1 - sc.x0); }; auto my = [&](float y) { return sc.y0 + (y / rtH - uv.y0) / (uv.y1 - uv.y0) * (sc.y1 - sc.y0); };
  r = Rect{ mx(r.x0), my(r.y0), mx(r.x1), my(r.y1) }; return true;
 }


 /* ---- Page model (2026-11-15, 沙耶の唄 NVL; docs/hide-layers.md "Layer 4, page model") --------------------------------
    Engines that redraw the whole page (old sentences + the new one) every frame from small per-page glyph sheets
    (LineSized textures): the text stays the game's own layout, so every character keeps its real place, width and row.
    Every glyph place of the page is tracked; a LINE claims the places that appear for it (the hook delivers the text a
    moment after the game started typing: places up to 3 s older are its own, at most n). Claimed places are left out
    of every draw while armed. New places keep their pixels until a LINE claims them, so a font-height match alone
    cannot hide a menu, backlog or page shown by loading a save. The page is
    reported whole (ToMe_PAGE: every line's text and its places in reading order) whenever it changes; places that stop
    being drawn while others stay are a page turn (lines forgotten), all places gone is "asleep" (text window hidden, a
    title screen): the same places drawn again wake the page with its lines. */
 struct PPos { Rect r; unsigned firstAt, lastFrame, bornFrame; int line; bool opt; }; // line: -1 pending, -2 the game's own, else PLine id
 struct PLine { int id; unsigned n; std::string text; unsigned at, claimed, sep; std::vector<bool> mask; unsigned nb; unsigned lastAt; Rect last; }; // mask: the line's characters, true = blank
 std::vector<PPos> ppos; std::map<long long, int> pkey; std::vector<PLine> plines; int plineId = 0;
 bool texRt = false; // set by the caller before Draw: the sampled texture is a render target
 /* a calibration saved by an earlier run (bridge PRESET): the page's glyph height */
 void Preset(float gh, unsigned w, unsigned h) { if (gh >= 4 && gh <= 160 && pageH <= 0) { pageH = gh; if (log) log("PRESET gh=%.1f rt=%ux%u", gh, w, h); } }
 bool pageBlankQuads = false; // learned: the engine draws a glyph for a blank (a line had more places than characters)
 bool pageArmed = false, pageOn = false, pageAsleep = false, pageDirty = false; float pageH = 0; unsigned pageSentAt = 0; std::string pageSent;
 std::map<int, unsigned> pageHist; std::set<void *> sheetNow, sheetPrev; void *pageRt = nullptr; unsigned pageRtW = 0, pageRtH = 0;
 static std::string Utf8(const std::wstring &text) { std::string u; for (size_t i = 0; i < text.size(); i++) { unsigned c = text[i]; if (c >= 0xD800 && c < 0xDC00 && i + 1 < text.size()) { c = 0x10000 + ((c - 0xD800) << 10) + (text[++i] - 0xDC00); u += (char)(0xF0 | (c >> 18)); u += (char)(0x80 | ((c >> 12) & 63)); u += (char)(0x80 | ((c >> 6) & 63)); u += (char)(0x80 | (c & 63)); } else if (c < 0x80) u += (char)c; else if (c < 0x800) { u += (char)(0xC0 | (c >> 6)); u += (char)(0x80 | (c & 63)); } else { u += (char)(0xE0 | (c >> 12)); u += (char)(0x80 | ((c >> 6) & 63)); u += (char)(0x80 | (c & 63)); } } return u; }
 static long long PageKey(float x0, float y0) { return ((long long)(int)(x0 * 0.5f) << 32) ^ (long long)(unsigned)(int)(y0 * 0.5f); }
 void PageLineAdd(const std::wstring &t, unsigned count, unsigned now) {
  std::wstring c; for (wchar_t ch : t) c += (ch == L'\t' || ch == L'\n' || ch == L'\r') ? L' ' : ch;
  if (plines.size() >= 64) { int gone = plines.front().id; plines.erase(plines.begin()); for (auto &p : ppos) if (p.line == gone) p.line = -2; }
  /* the line's characters with every blank but the trailing ones (leading indentation and blank rows are glyphs too in engines that draw blanks) */
  std::vector<bool> mask; unsigned blanks = 0; { size_t b = t.size(); while (b > 0 && Blank(t[b - 1])) b--; for (size_t i = 0; i < b; i++) { if (t[i] == L'\n' || t[i] == L'\r' || t[i] == 0x1F) continue; bool bl = Blank(t[i]); mask.push_back(bl); if (bl) blanks++; } }
  plines.push_back(PLine{ ++plineId, count, Utf8(c), now, 0, 0, mask, blanks, 0, Rect{} }); pageArmed = true; pageDirty = true;
 }
 void PageOff() { if (!pageArmed && plines.empty()) return; pageArmed = false; plines.clear(); for (auto &p : ppos) p.line = -2; pageDirty = true; }
 int PageFind(const Rect &r, unsigned now) {
  long long k = PageKey(r.x0, r.y0); auto it = pkey.find(k); if (it != pkey.end()) return it->second;
  float w = r.x1 - r.x0, h = r.y1 - r.y0;
  for (size_t i = 0; i < ppos.size(); i++) { const Rect &o = ppos[i].r; if (std::fabs(o.x0 - r.x0) < 0.4f * (std::min)(o.x1 - o.x0, w) && std::fabs(o.y0 - r.y0) < 0.4f * h) { pkey[k] = (int)i; return (int)i; } }
  if (ppos.size() >= 4096) { ppos.clear(); pkey.clear(); for (auto &l : plines) l.claimed = 0; }
  ppos.push_back(PPos{ r, now, frameNo, frameNo, -1, true }); pkey[k] = (int)ppos.size() - 1; return (int)ppos.size() - 1;
 }
 bool PageHidden(const PPos &p) const { if (!pageArmed || readOnly) return false; return p.line >= 0; }
 bool PageAnyClaim() const { if (!pageArmed || readOnly) return false; for (auto &l : plines) if (l.claimed) return true; return false; }
 // a page quad: handled here (true) with *leave = leave it out
 bool PageQuad(const Quad &x, void *tex, unsigned tw, unsigned th, void *rt, unsigned rtW, unsigned rtH, unsigned now, bool *leave) {
  *leave = false; if (!texRt || tw * th > 1024u * 1024u) return false; // a glyph sheet the game renders at run time (a render target sampled cell by cell)
  float h = x.y1 - x.y0; pageHist[(int)(h + 0.5f)]++;
  if (pageH <= 0) return false;
  if (std::fabs(h - pageH) <= 1.5f) {
   if (!pageRtW) { pageRt = rt; pageRtW = rtW; pageRtH = rtH; }
   sheetNow.insert(tex);
   // Another target has no confirmed character correspondence yet.
   if (rtW != pageRtW || rtH != pageRtH) return false;
   int i = PageFind(Rect{ x.x0, x.y0, x.x1, x.y1 }, now); PPos &p = ppos[i];
   p.lastFrame = frameNo; if (p.r.x1 - p.r.x0 < x.x1 - x.x0 - 0.5f && std::fabs(p.r.x0 - x.x0) < 1.5f) p.r = Rect{ x.x0, x.y0, x.x1, x.y1 };
   *leave = PageHidden(p); return true;
  }
  // another size from a page sheet (ruby, an outline pass): follows the character under / next to it
  if (!sheetNow.count(tex) && !sheetPrev.count(tex)) return false;
  if (!pageArmed || readOnly) return true;
  float cx = (x.x0 + x.x1) / 2; const PPos *best = nullptr; float bd = 1e30f;
  for (auto &p : ppos) { if (p.lastFrame + 2 < frameNo) continue; if (cx < p.r.x0 - pageH || cx > p.r.x1 + pageH) continue; float d = std::fabs((p.r.y0 + p.r.y1) / 2 - (x.y0 + x.y1) / 2) + std::fabs((p.r.x0 + p.r.x1) / 2 - cx) * 0.25f; if (d < bd) { bd = d; best = &p; } }
  *leave = best && bd < pageH * 1.6f && PageHidden(*best);
  return true;
 }
 /* The line's places in reading order: rows top to bottom (a place within half a height of the row's first place), left
    to right. Returns true when the first row is a paragraph place: engines draw a (blank) glyph of their own on the empty
    row between two sentences; it is the line's only place on a row that is not full, with the text starting on a later
    row. It stays hidden with the line and is not one of its characters. */
 bool PageRows(const PLine &l, std::vector<std::vector<Rect>> &rows) const {
  std::vector<Rect> v; float right = 0; for (auto &p : ppos) { if (p.line == l.id) v.push_back(p.r); if (p.lastFrame + 2 >= frameNo) right = (std::max)(right, p.r.x1); }
  std::sort(v.begin(), v.end(), [](const Rect &a, const Rect &b) { return a.y0 < b.y0; });
  rows.clear(); for (auto &r : v) { if (!rows.empty() && std::fabs(r.y0 - rows.back()[0].y0) < (r.y1 - r.y0) * 0.5f) rows.back().push_back(r); else rows.push_back({ r }); }
  for (auto &row : rows) std::sort(row.begin(), row.end(), [](const Rect &a, const Rect &b) { return a.x0 < b.x0; });
  return false;
 }
 /* The places of the line's characters (blanks left out), and the places left over once every character has one. An
    interior blank has a glyph of its own in some engines: the next place on the same row, right after the previous one
    (no gap), is the blank's; with a gap or on a new row the engine drew nothing for it. */
 void PageWalk(const PLine &l, std::vector<Rect> &chars, std::vector<Rect> &left) const {
  std::vector<std::vector<Rect>> rows; bool sep = PageRows(l, rows); chars.clear(); left.clear();
  std::vector<Rect> flat; std::vector<size_t> rowOf; for (size_t ri = sep ? 1 : 0; ri < rows.size(); ri++) for (auto &r : rows[ri]) { flat.push_back(r); rowOf.push_back(ri); }
  if (l.sep && !flat.empty()) { flat.erase(flat.begin()); rowOf.erase(rowOf.begin()); } // the paragraph row's place
  /* the line's only place so far, at the left edge, before text that starts with no blank: it may be the paragraph row; told apart once the next place is there */
  if (pageBlankQuads && !l.sep && flat.size() == 1 && l.n > 1 && !l.mask.empty() && !l.mask[0]) return;
  size_t k = 0, done = 0;
  for (size_t i = 0; i < l.mask.size(); i++) {
   if (l.mask[i]) { if (pageBlankQuads && k < flat.size()) k++; continue; }
   if (k >= flat.size()) break; chars.push_back(flat[k++]); done++; }
  if (done >= l.n) for (; k < flat.size(); k++) left.push_back(flat[k]);
 }
 void PageTurn(unsigned now) {
  std::vector<PLine> keep; /* a line without places yet is waiting for its glyphs: the newest one for as long as a page change takes (the hook hands the text over seconds before a faded page turn ends) */
  for (auto &l : plines) if (!l.claimed && (now - l.at < 3000 || (&l == &plines.back() && now - l.at < 30000))) keep.push_back(l); plines.swap(keep);
  std::vector<PPos> live; for (auto &p : ppos) if (p.lastFrame + 2 >= frameNo) { PPos q = p; q.firstAt = now; q.bornFrame = frameNo; q.line = -1; q.opt = true; live.push_back(q); }
  ppos.swap(live); pkey.clear(); for (size_t i = 0; i < ppos.size(); i++) pkey[PageKey(ppos[i].r.x0, ppos[i].r.y0)] = (int)i;
  if (log) log("PAGE turn live=%u lines=%u", (unsigned)ppos.size(), (unsigned)plines.size());
  pageDirty = true;
 }
 // end of a frame (before frameNo moves on)
 void PageFrame(unsigned now) {
  // the page's glyph height: the commonest height of sheet glyph quads in a frame (3 or more of them)
  { int bh = 0; unsigned bc = 0; for (auto &kv : pageHist) if (kv.second > bc) { bc = kv.second; bh = kv.first; } pageHist.clear();
    if (bc >= 3 && (pageH <= 0 || (bc >= 6 && std::fabs(pageH - bh) > 1.5f && ppos.empty()))) { pageH = (float)bh; if (log) log("PAGE glyph height %d", bh); } }
  sheetPrev.swap(sheetNow); sheetNow.clear();
  if (pageH <= 0 || ppos.empty()) { if (pageDirty) PageReport(now); return; }
  unsigned liveN = 0, deadN = 0, bornN = 0; for (auto &p : ppos) { if (p.lastFrame + 2 >= frameNo) liveN++; else deadN++; if (p.bornFrame == frameNo && p.line == -1) bornN++; }
  if (!liveN) { if (!pageAsleep) { pageAsleep = true; pageDirty = true; if (log) log("PAGE asleep n=%u", (unsigned)ppos.size()); } }
  else { if (pageAsleep) { pageAsleep = false; pageDirty = true; if (log) log("PAGE awake live=%u dead=%u", liveN, deadN); }
   /* Places of the page that stop being drawn while others go on: the page was cleared. A new page is typed onto the
      same places from the top, so its first characters take over old places while the old page's later ones are gone;
      "most of the page gone" missed that (2026-11-15: after a <clear> the old line kept the top row and the new
      sentence got the leftovers: wrong rows, overlapping text). */
   if (deadN) PageTurn(now); }
  if (liveN) {
   PLine *L = plines.empty() ? nullptr : &plines.back();
   /* what was on the page long before the newest line's text came is the game's own (a page shown by loading a save) */
   if (L) for (auto &p : ppos) if (p.line == -1 && (int)(p.firstAt - (L->at - 3000)) < 0) { p.line = -2; pageDirty = true; }
   /* The page's places in reading order are shared out line by line: the first line takes as many as it has characters
      (and blanks, where the engine draws them), the next line the following ones. No timing is involved: a player who
      clicks on while a sentence is still being typed gets the rest of that sentence and the start of the next one in the
      same frame, and "the newest places are the newest line's" put the old sentence's tail into the new one (2026-11-15). */
   std::vector<int> flow; for (size_t i = 0; i < ppos.size(); i++) if (ppos[i].line != -2 && ppos[i].lastFrame + 2 >= frameNo) flow.push_back((int)i);
   std::sort(flow.begin(), flow.end(), [&](int x, int y) { const Rect &a = ppos[x].r, &b = ppos[y].r; if (std::fabs(a.y0 - b.y0) >= pageH * 0.5f) return a.y0 < b.y0; return a.x0 < b.x0; });
   size_t k = 0; unsigned room = 0;
   float left = 1e30f; for (int i : flow) left = (std::min)(left, ppos[i].r.x0);
   for (auto &l : plines) { unsigned cap = l.n + (pageBlankQuads ? l.nb : 0), c = 0;
    /* A blank row between two sentences is a glyph of its own in engines that draw blanks, and no line's text has it when
       the next sentence does not begin with a blank: one place alone on its row, at the page's left edge, with the line's
       text starting on a later row. It goes with the line (left out with it) but is none of its characters (2026-11-15:
       the opening bracket of a dialogue line sat alone on the blank row and the whole line was one place off). */
    l.sep = 0;
    if (pageBlankQuads && !l.mask.empty() && !l.mask[0] && k + 1 < flow.size()) { const Rect &a = ppos[flow[k]].r, &b = ppos[flow[k + 1]].r; if (std::fabs(a.y0 - b.y0) >= pageH * 0.5f && a.x0 <= left + pageH * 0.5f) { PPos &q = ppos[flow[k]]; if (q.line != l.id) { q.line = l.id; pageDirty = true; } l.sep = 1; k++; } }
    for (; k < flow.size() && c < cap; k++, c++) { PPos &q = ppos[flow[k]]; if (q.line != l.id) { q.line = l.id; pageDirty = true; } } if (l.claimed != c) pageDirty = true; l.claimed = c; room += cap - c; }
   unsigned extra = (unsigned)(flow.size() - k), oldest = 0; bool blanks = false; for (auto &l : plines) if (l.nb) blanks = true;
   for (; k < flow.size(); k++) { PPos &q = ppos[flow[k]]; if (q.line >= 0) { q.line = -1; pageDirty = true; } if (now - q.firstAt > oldest) oldest = now - q.firstAt; }
   // many places at once that no line can take: not a typing sentence, shown until a LINE claims them
   if (bornN >= 12 && bornN > room + extra - (extra < bornN ? extra : bornN)) for (auto &p : ppos) if (p.bornFrame == frameNo && p.line == -1) p.opt = false;
   /* places left over for 0.6 s after the newest line came, on a page whose lines have blanks: the engine draws a glyph for
      a blank (indentation, a blank row between sentences); from now on each blank takes a place of its own */
   if (!pageBlankQuads && extra && blanks && L && oldest > 600 && now - L->at > 600) { pageBlankQuads = true; pageDirty = true; if (log) log("PAGE blanks have glyphs"); if (emit) { char m[96]; snprintf(m, sizeof m, "ToMe_GPUHIDE blanks gh=%.1f rt=%ux%u", pageH, pageRtW, pageRtH); emit(m); } }
   for (auto &p : ppos) if (p.line == -1 && now - p.firstAt > 2500) { p.line = -2; pageDirty = true; }
   if (!pageOn) for (auto &l : plines) if (l.claimed) { pageOn = true; break; }
  }
  PageReport(now);
 }
 void PageReport(unsigned now) {
  if (!emit || (!pageDirty && now - pageSentAt < 1000) || now - pageSentAt < 15) return; /* every frame while the game types: the reader's characters appear at the game's own pace */
  std::string s = "ToMe_PAGE sw=" + std::to_string(bbW) + " sh=" + std::to_string(bbH) + " awake=" + (pageAsleep || ppos.empty() ? "0" : "1") + " armed=" + (pageArmed && !readOnly ? "1" : "0") + " gh=" + std::to_string((int)pageH);
  unsigned own = 0; std::string ownr; for (auto &p : ppos) if (p.line == -2 && p.lastFrame + 2 >= frameNo) { own++; if (own <= 40) { char x[48]; snprintf(x, sizeof x, "%s%.0f,%.0f,%.0f", ownr.empty() ? "" : ";", p.r.x0, p.r.y0, p.r.x1 - p.r.x0); ownr += x; } } s += " own=" + std::to_string(own) + " ownr=" + ownr; /* ownr: the first places left to the game (x,y,w), for diagnosis */
  if (!pageAsleep) for (auto &l : plines) {
   std::vector<Rect> cs, left; PageWalk(l, cs, left);
   std::string rects; bool mapped = true;
   for (auto r : cs) { if (!ToScreen(pageRt, pageRtW, pageRtH, r)) { mapped = false; break; } char x[64]; snprintf(x, sizeof x, "%s%.0f,%.0f,%.0f,%.0f", rects.empty() ? "" : ";", r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); rects += x; }
   if (!mapped) return; // the page's target is not composited yet: next frame
   s += "\t" + std::to_string(l.id) + "\t" + std::to_string(l.n) + "\t" + rects + "\t" + l.text;
  }
  pageDirty = false; if (s == pageSent) { pageSentAt = now; return; }
  pageSent = s; pageSentAt = now; { size_t tab = s.find('\t'); std::string head = s.substr(0, tab == std::string::npos ? s.size() : tab) + " t=" + std::to_string(now); emit(tab == std::string::npos ? head : head + s.substr(tab)); }
 }

 // One draw call: returns the indices of the quads to leave out.
 std::vector<int> Draw(void *tex, unsigned tw, unsigned th, void *rt, unsigned rtW, unsigned rtH, unsigned backW, unsigned backH, const std::vector<Quad> &q, unsigned now) {
  std::vector<int> drop; bbW = backW; bbH = backH;
  long long gk = GroupKey(rt, tex); Group *g = nullptr; bool armed = Armed(now);
  bool startupDrop = false;
  // a texture first used for this line (per-line glyph sheets); UI sheets in use before the line never count as sheets
  bool freshTex = false; { auto ft = texFirst.find(tex); if (ft == texFirst.end()) { if (texFirst.size() > 8192) texFirst.clear(); texFirst[tex] = now; ft = texFirst.find(tex); } freshTex = (int)(ft->second - (lineAt - 3000)) >= 0; }
  for (size_t i = 0; i < q.size(); i++) {
   const Quad &x = q[i]; if (!GlyphLike(x, tw, th)) continue;
   { bool leave = false; if (PageQuad(x, tex, tw, th, rt, rtW, rtH, now, &leave)) { if (leave) { drop.push_back((int)i); hiddenQuads++; if (log && hiddenQuads < 60) log("drop page tex=%p %ux%u [%.0f,%.0f %.0fx%.0f]", tex, tw, th, x.x0, x.y0, x.x1 - x.x0, x.y1 - x.y0); } continue; } }
   if (!g) { g = &groups[gk]; g->rt = rt; g->tex = tex; g->tw = tw; g->th = th; g->rtW = rtW; g->rtH = rtH; if (groups.size() > 64) { groups.clear(); g = &groups[gk]; g->rt = rt; g->tex = tex; g->tw = tw; g->th = th; g->rtW = rtW; g->rtH = rtH; } }
   Rect r{ x.x0, x.y0, x.x1, x.y1, x.glyph != 0 };
   if (g->prevFrame != frameNo) { g->prev.swap(g->frame); g->frame.clear(); g->prevFrame = frameNo; }
   if (g->frame.size() < 4096) g->frame.push_back(r);
   long long k = ((long long)(int)(x.x0 * 0.5f) << 44) ^ ((long long)(int)(x.y0 * 0.5f) << 30) ^ ((long long)(int)(x.u0 * 4096) << 15) ^ (long long)(int)(x.v0 * 4096);
   const bool cmvsAtlas = BodyStrategy::UsesBodyAtlas(bodyRecheck, *g);
   const bool startup = cmvsAtlas && armed && !texRt && BodyStrategy::StartupAtlas(*g, seq, frameNo, backW, backH);
   const bool fixedCell = cmvsAtlas && !texRt && (!learned || startup) && BodyStrategy::FixedCell(x, k);
   auto it = g->keys.find(k);
   if (it == g->keys.end()) {
    if (g->keys.size() > 20000) g->keys.clear();
    g->keys[k] = Seen{ r, now, frameNo, x.glyph, now, fixedCell };
   } else {
    Seen &seen = it->second;
    seen.lastFrame = frameNo;
    if (cmvsAtlas && !readOnly) seen.r = r;
    else seen.r.traced = r.traced;
    seen.fixedCell = fixedCell;
    // A texture cell can be rewritten at the same UV, on the same screen position.
    if (x.glyph && x.glyph != seen.glyph) { seen.glyph = x.glyph; seen.tracedAt = now; }
   }
   // learned atlas on the learned target; or, for engines that build a small glyph sheet per line (a new texture every
   // line), any glyph quad of the learned glyph height on a target of the learned size (effect buffers drawn twice)
   bool sameAtlas = rtW == areaW && rtH == areaH && LearnedAtlas(tex), sheet = freshTex && LineSized(tw, th) && rtW == areaW && rtH == areaH && std::fabs((x.y1 - x.y0) - glyphH) <= glyphH * 0.25f;
   // glyph height only: a wait cursor or icon drawn from the same sheet inside the area stays
   bool glyphSize = BodyHeight(r);
   if (!glyphSize && RubySized(x.y1 - x.y0) && RubyOver(Rect{ x.x0, x.y0, x.x1, x.y1 })) glyphSize = true; /* the line's ruby goes with it */
   bool redraw = (int)(redrawUntil - now) > 0 && rtW == areaW && rtH == areaH;
   const float cx = (x.x0 + x.x1) / 2, cy = (x.y0 + x.y1) / 2;
   const bool hide = startup ? BodyStrategy::MaskStartup(*g, frameNo, k, r, fixedCell, !readOnly) :
    learned && armed && !readOnly && glyphSize && (sameAtlas || sheet || redraw) &&
    cx >= area.x0 && cx <= area.x1 && cy >= area.y0 && cy <= area.y1;
   if (hide) {
    drop.push_back((int)i);
    startupDrop = startupDrop || startup;
    if (sameAtlas && rt == areaRt && r.traced) areaTraced = true;
    hiddenQuads++;
    if (log && hiddenQuads < 60) log("drop %s tex=%p %ux%u [%.0f,%.0f %.0fx%.0f uv %.3f,%.3f %.3fx%.3f]",
     startup ? "cmvs" : sameAtlas ? "atlas" : sheet ? "sheet" : "redraw",
     tex, tw, th, x.x0, x.y0, x.x1 - x.x0, x.y1 - x.y0, x.u0, x.v0, x.u1 - x.u0, x.v1 - x.v0);
   }
  }
  if (!drop.empty() && !startupDrop) Hit(drop.size());
  return drop;
 }

 void Hit(size_t count) {
  if (hitSent) return;
  hitSent = true;
  if (!emit) return;
  char b[128];
  snprintf(b, sizeof b, "ToMe_GPUHIDE hit seq=%u quads=%u chars=%u", seq, (unsigned)count, n);
  emit(b);
 }

 // Merge offset copies (shadow / outline) and sort in reading order.
 static std::vector<Rect> Chars(std::vector<Rect> v) {
  std::vector<Rect> out; std::sort(v.begin(), v.end(), [](const Rect &a, const Rect &b) { return a.y0 != b.y0 ? a.y0 < b.y0 : a.x0 < b.x0; });
  // offset copies are as wide as the glyph: narrow neighbours (digits, half-width letters) are never merged
  for (auto &r : v) { float h = r.y1 - r.y0, tol = h * 0.4f; bool merged = false; for (auto &o : out) if (std::fabs(o.x0 - r.x0) < 0.4f * (std::min)(o.x1 - o.x0, r.x1 - r.x0) && std::fabs(o.y0 - r.y0) < tol) { o.x0 = (std::min)(o.x0, r.x0); o.y0 = (std::min)(o.y0, r.y0); o.x1 = (std::max)(o.x1, r.x1); o.y1 = (std::max)(o.y1, r.y1); merged = true; break; } if (!merged) out.push_back(r); }
  // rows: a glyph whose vertical centre is within half a height of the row's first glyph belongs to that row
  std::vector<std::vector<Rect>> rows; std::sort(out.begin(), out.end(), [](const Rect &a, const Rect &b) { return a.y0 < b.y0; });
  for (auto &r : out) { float cy = (r.y0 + r.y1) / 2; bool put = false; for (auto &row : rows) { float ry = (row[0].y0 + row[0].y1) / 2; if (std::fabs(cy - ry) < (row[0].y1 - row[0].y0) * 0.5f) { row.push_back(r); put = true; break; } } if (!put) rows.push_back({ r }); }
  std::vector<Rect> res; for (auto &row : rows) { std::sort(row.begin(), row.end(), [](const Rect &a, const Rect &b) { return a.x0 < b.x0; }); res.insert(res.end(), row.begin(), row.end()); }
  return res;
 }
 // Keep only the largest cluster of rows (a text box), dropping isolated glyph quads elsewhere (names, menus).
 static std::vector<Rect> Cluster(const std::vector<Rect> &c) {
  if (c.size() < 2) return c; float h = 0; for (auto &r : c) h += r.y1 - r.y0; h /= c.size();
  std::vector<int> id(c.size(), -1); int best = -1, bestN = 0, next = 0;
  for (size_t i = 0; i < c.size(); i++) { if (id[i] >= 0) continue; std::vector<size_t> st{ i }; id[i] = next; int cnt = 0;
   while (!st.empty()) { size_t a = st.back(); st.pop_back(); cnt++; for (size_t j = 0; j < c.size(); j++) if (id[j] < 0) { float dx = (std::max)(0.f, (std::max)(c[a].x0, c[j].x0) - (std::min)(c[a].x1, c[j].x1)), dy = (std::max)(0.f, (std::max)(c[a].y0, c[j].y0) - (std::min)(c[a].y1, c[j].y1)); if (dx < h * 1.6f && dy < h * 1.2f) { id[j] = next; st.push_back(j); } } }
   if (cnt > bestN) { bestN = cnt; best = next; } next++; }
  std::vector<Rect> out; for (size_t i = 0; i < c.size(); i++) if (id[i] == best) out.push_back(c[i]); return out;
 }

 // The glyph positions of the line: exactly its characters, or its characters plus its interior blanks drawn as blank
 // glyphs (reading order; the blank positions are dropped from the result).
 const std::vector<Rect> *Match(const std::vector<Rect> &a, const std::vector<Rect> &b, std::vector<Rect> &keep) const {
  if (a.size() == n) return &a; if (b.size() == n) return &b;
  if (nameN) for (const std::vector<Rect> *src : { &a, &b }) if (src->size() == n + nameN) { keep.assign(src->begin() + nameN, src->end()); return &keep; }
  if (!nb) return nullptr;
  for (const std::vector<Rect> *src : { &a, &b }) if (src->size() > n && src->size() <= n + nb && Blanks(*src, keep)) return &keep;
  return nullptr;
 }
 // Walk the line (with its interior blanks) over the glyph positions in reading order: a character takes the next
 // position; a blank takes one too (a blank glyph the engine drew) unless that position starts a new row (the engine
 // wrapped at the blank and drew nothing for it). Succeeds only when both run out together.
 bool Blanks(const std::vector<Rect> &r, std::vector<Rect> &keep) const {
  keep.clear(); size_t k = 0;
  auto rowStart = [&](size_t j) { if (j == 0 || j >= r.size()) return j == 0; float h = r[j].y1 - r[j].y0; return r[j].y0 > r[j - 1].y0 + h * 0.5f; };
  for (size_t i = 0; i < blankAt.size(); i++) {
   if (blankAt[i]) { if (k < r.size() && !rowStart(k)) k++; continue; }
   if (k >= r.size()) return false; keep.push_back(r[k++]); }
  return k == r.size() && keep.size() == n;
 }
 static bool SamePlace(const Rect &a, const Rect &b) {
  const float w = (std::min)(a.x1 - a.x0, b.x1 - b.x0), h = (std::min)(a.y1 - a.y0, b.y1 - b.y0);
  return std::fabs(a.x0 - b.x0) < 0.4f * w && std::fabs(a.y0 - b.y0) < 0.4f * h;
 }
 // Use the earlier glyph's height so a smaller late shadow or outline still counts as its copy.
 static bool Earlier(const Rect &r, const std::vector<Rect> &earlierRects) {
  for (const auto &e : earlierRects) {
   const float w = (std::min)(e.x1 - e.x0, r.x1 - r.x0), h = e.y1 - e.y0;
   if (std::fabs(e.x0 - r.x0) < 0.4f * w && std::fabs(e.y0 - r.y0) < 0.4f * h) return true;
  }
  return false;
 }
 bool Earlier(const Rect &r) const { return Earlier(r, earlierRects); }
 /* a glyph of an earlier line of the page (the same glyph on the same place) is never the new line's */
 bool EarlierGlyph(long long gk, long long k) const { return earlierKeys.count({ gk, k }) > 0; }
 static bool BodyHeight(const Rect &r, float height) { return std::fabs((r.y1 - r.y0) - height) <= height * 0.2f; }
 bool BodyHeight(const Rect &r) const { return BodyHeight(r, glyphH); }
 static bool BodyInBand(const Rect &r, const Rect &area, float height) {
  const float cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  return cx >= area.x0 && cx <= area.x1 && cy >= area.y0 && cy <= area.y1 && BodyHeight(r, height);
 }
 bool BodyInBand(const Rect &r) const { return BodyInBand(r, area, glyphH); }
 // Same-atlas spacers and decorations have no traced glyph cell.
 static std::vector<Rect> TracedChars(std::vector<Rect> rects) {
  rects.erase(std::remove_if(rects.begin(), rects.end(), [](const Rect &r) { return !r.traced; }), rects.end());
  return Chars(Cluster(Chars(std::move(rects))));
 }
 // A relocated dialogue line can use a different atlas. Both the current frame and the new glyphs must agree before moving the band.
 static bool Relocated(const std::vector<Rect> &live, const std::vector<Rect> &fresh, unsigned n, const Rect &area, float glyphH) {
  if (n < 3 || live.size() != n || fresh.size() != n) return false;
  bool above = true, below = true;
  for (size_t i = 0; i < live.size(); i++) {
   const Rect &a = live[i], &b = fresh[i];
   if (std::fabs(a.x0 - b.x0) > (a.x1 - a.x0) * 0.4f || std::fabs(a.y0 - b.y0) > (a.y1 - a.y0) * 0.4f) return false;
   above = above && a.y1 <= area.y0 - glyphH;
   below = below && a.y0 >= area.y1 + glyphH;
  }
  return above || below;
 }
 bool Relocated(const std::vector<Rect> &live, const std::vector<Rect> &fresh) const {
  return Relocated(live, fresh, n, area, glyphH);
 }
 void Frame(unsigned now, unsigned backW, unsigned backH) {
  bbW = backW; bbH = backH; frameNow = now; PageFrame(now); frameNo++; if (pageOn) return; if (!Armed(now)) return;
  /* the earlier lines are on screen while most of their glyphs are still drawn: a text box that replaces its line (most ADV
     games) drops them at once, and its new glyphs on the old places are the new line's again */
  if (!earlierKeys.empty()) { size_t on = 0; for (auto &e : earlierKeys) { auto g = groups.find(e.first); if (g == groups.end()) continue; auto it = g->second.keys.find(e.second); if (it != g->second.keys.end() && frameNo - it->second.lastFrame <= 2) on++; } if (on * 2 < earlierKeys.size()) { earlierKeys.clear(); earlierRects.clear(); } }
  const bool settled = reported && hiddenSent == (hitSent && !readOnly);
  const auto policy = CmvsFrame();
  const bool mixed = policy.NeedsCorrection();
  if (bodyRecheck && reported && learnedSeq == seq) {
   const auto repaint = policy.FollowStartup(groups, readOnly);
   if (repaint.ownsFrame) {
    if (repaint.group) Report(*repaint.group, repaint.body, false, true);
    return;
   }
  }
  if (settled && !mixed) return;
  const auto grid = policy.SelectGrid(groups, [&](void *tex) { return LearnedAtlas(tex); });
  if (grid.ownsFrame) {
   if (grid.group) {
    if (grid.startup) Hit(grid.body.size());
    Report(*grid.group, grid.body, grid.moved, grid.startup);
   }
   return;
  }
  unsigned since = prevLineAt && now - prevLineAt < 120000 ? (std::max)(prevLineAt + 200, lineAt - 3000) : lineAt - 3000;
  Group *movedGroup = nullptr; std::vector<Rect> movedRects, bandDrawn; bool ambiguousMove = false, freshBand = false;
  const bool recoverBand = learned && hitSent && !areaTraced && !readOnly && !reported;
  for (auto &kv : groups) {
   Group &g = kv.second; std::vector<Rect> fresh, live, freshTraced, retainedBody;
   if (learned && (g.rtW != areaW || g.rtH != areaH)) continue;
   const bool currentFrame = g.prevFrame == frameNo - 1, fromAtlas = LearnedAtlas(g.tex);
   const auto initial = policy.InitialBody(g, currentFrame);
   if (!initial.empty()) { Report(g, initial); return; }
   const bool checkBody = policy.ReviewsGroup(g, currentFrame, fromAtlas, mixed);
   if (settled && !checkBody) continue;
   Rect screen{};
   const bool canMove = learned && !readOnly && !reported && currentFrame && g.rt == areaRt &&
    (!hitSent || (recoverBand && !fromAtlas)) && ToScreen(g.rt, g.rtW, g.rtH, screen);
   const bool recover = canMove && recoverBand;
   const bool checkBand = recoverBand && currentFrame && fromAtlas && g.rt == areaRt;
   for (auto &s : g.keys) {
    const Seen &seen = s.second;
    if (checkBody && policy.Retains(seen) && EarlierGlyph(kv.first, s.first))
     retainedBody.push_back(seen.r);
    const bool isFresh = (int)(seen.firstAt - since) >= 0;
    const bool isFreshTrace = recover && seen.lastFrame == frameNo - 1 && seen.r.traced && (int)(seen.tracedAt - since) >= 0;
    if (!isFresh && !isFreshTrace) continue;
    if (!EarlierGlyph(kv.first, s.first)) {
     if (isFresh) fresh.push_back(seen.r);
     if (isFreshTrace) freshTraced.push_back(seen.r);
    }
    if (checkBand && isFresh && seen.lastFrame == frameNo - 1 && BodyInBand(seen.r)) freshBand = true;
   }
   if (checkBody) {
    const auto choice = policy.Review(g, fresh, retainedBody, canMove);
    if (choice.group) { Report(*choice.group, choice.body, choice.moved); return; }
   }
   if (settled) continue;
   if (checkBand && !freshBand) for (const Rect &r : g.frame) if (BodyInBand(r)) bandDrawn.push_back(r);
   const std::vector<Rect> &last = currentFrame ? g.frame : g.prev; for (auto &r : last) if (earlierRects.empty() || !Earlier(r)) live.push_back(r);
   std::vector<Rect> a = Chars(Cluster(Chars(live))), b = Chars(Cluster(Chars(fresh)));
   if (log && (now / 500) != ((now - 17) / 500)) log("frame %u group rt=%p %ux%u live=%u fresh=%u n=%u", frameNo, g.rt, g.tw, g.th, (unsigned)a.size(), (unsigned)b.size(), n);
   std::vector<Rect> keep; const std::vector<Rect> *hit = Match(a, b, keep);
   bool moved = canMove && !hitSent && Relocated(a, b);
   if (recover) {
    // A stale atlas can drop toolbar art. Move only when live and recently written glyph cells agree.
    a = TracedChars(std::move(live)); b = TracedChars(std::move(freshTraced));
    hit = Match(a, b, keep);
    moved = Relocated(a, b);
   } else if (!hit && reported && currentFrame && fromAtlas && areaTraced && g.rt == areaRt) {
    // A traced menu in the same atlas must never replace the positions already reported for this line.
    live.erase(std::remove_if(live.begin(), live.end(), [&](const Rect &r) {
     return !r.traced || !BodyInBand(r) || std::none_of(lastRects.begin(), lastRects.end(), [&](const Rect &p) { return SamePlace(p, r); });
    }), live.end());
    const auto confirmed = Chars(std::move(live));
    if (confirmed.size() == lastRects.size() && !confirmed.empty() &&
        std::equal(confirmed.begin(), confirmed.end(), lastRects.begin(), SamePlace)) hit = &lastRects;
   }
   if (!hit) continue;
   if (learned && !fromAtlas) {
    if (moved && movedGroup) ambiguousMove = true;
    else if (moved) { movedGroup = &g; movedRects.swap(a); }
    continue;
   }
   Report(g, *hit, moved);
   return;
  }
  if (settled) return;
  // Try a confirmed new atlas only after checking all previously learned atlases.
  if (movedGroup && !ambiguousMove && !freshBand) {
   const auto occupied = Chars(Cluster(Chars(std::move(bandDrawn))));
   std::vector<Rect> keep;
   // A centred box may draw only part of a line from cached cells. Require more positions than
   // the old band learned before treating its hit as stale, even if no complete line matches there.
   const bool retained = !occupied.empty() && std::all_of(occupied.begin(), occupied.end(), [&](const Rect &r) { return Earlier(r); });
   if (!recoverBand || (occupied.size() > learnedGlyphs && !retained && !Match(occupied, {}, keep))) {
    Report(*movedGroup, movedRects, true);
    return;
   }
  }
  // The glyphs of one line can come from several atlas pages: count them together per render target.
  std::map<void *, std::vector<Group *>> byRt; for (auto &kv : groups) byRt[kv.second.rt].push_back(&kv.second);
  for (auto &kv : byRt) {
   if (kv.second.size() < 2 || (learned && (kv.second[0]->rtW != areaW || kv.second[0]->rtH != areaH))) continue;
   std::vector<Rect> fresh, live; Group *big = kv.second[0]; size_t most = 0;
   for (Group *g : kv.second) { const std::vector<Rect> &last = g->prevFrame == frameNo - 1 ? g->frame : g->prev; for (auto &r : last) if (earlierRects.empty() || !Earlier(r)) live.push_back(r); if (last.size() > most) { most = last.size(); big = g; }
    for (auto &s : g->keys) if ((int)(s.second.firstAt - since) >= 0 && !EarlierGlyph(GroupKey(g->rt, g->tex), s.first)) fresh.push_back(s.second.r); }
   std::vector<Rect> a = Chars(Cluster(Chars(live))), b = Chars(Cluster(Chars(fresh)));
   if (log && (now / 500) != ((now - 17) / 500)) log("frame %u target rt=%p pages=%u live=%u fresh=%u n=%u", frameNo, kv.first, (unsigned)kv.second.size(), (unsigned)a.size(), (unsigned)b.size(), n);
   std::vector<Rect> keep; const std::vector<Rect> *hit = Match(a, b, keep); if (!hit) continue;
   Report(*big, *hit);
   return;
  }
 }
 void Report(Group &g, const std::vector<Rect> &cs, bool moved = false, bool startup = false) {
  if (bodyRecheck && CmvsFrame().WaitForBody(g, cs, [&](void *tex) { return LearnedAtlas(tex); })) return;
  if (moved) { learned = false; atlases.clear(); hitSent = false; }
  float h = 0; Rect box{ 1e30f, 1e30f, -1e30f, -1e30f }; for (auto &r : cs) { h += r.y1 - r.y0; box.x0 = (std::min)(box.x0, r.x0); box.y0 = (std::min)(box.y0, r.y0); box.x1 = (std::max)(box.x1, r.x1); box.y1 = (std::max)(box.y1, r.y1); } h /= cs.size();
  char b[256];
  if (!learned) {
   learned = true; areaRt = g.rt; areaW = g.rtW; areaH = g.rtH; glyphH = h; learnedSeq = seq; area = Rect{ 0, box.y0 - h, (std::max)(box.x1 + h * 8, (float)g.rtW), box.y1 + h * 2 };
   learnedGlyphs = cs.size();
   areaTraced = std::any_of(cs.begin(), cs.end(), [](const Rect &r) { return r.traced; });
   // atlases whose quads line up with the matched glyphs (other pages, outline / shadow sheets: top-left within 3 px of a
   // glyph for at least 60 % of their quads in the area); a UI sheet drawing the box frame or body under the text is not
   auto aligned = [&](const Rect &r) { for (auto &c : cs) if (std::fabs(r.x0 - c.x0) <= 3 && std::fabs(r.y0 - c.y0) <= 3) return true; return false; };
   auto inArea = [&](const Rect &r) { float cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2; return cx >= area.x0 && cx <= area.x1 && cy >= area.y0 && cy <= area.y1; };
   // every target of the learned size counts: engines draw the same page into a shadow / effect buffer too (Saya)
   for (auto &kv : groups) {
    if (startup && &kv.second != &g) continue;
    if (kv.second.rt != g.rt && (kv.second.rtW != g.rtW || kv.second.rtH != g.rtH)) continue;
    int in = 0, on = 0; for (const std::vector<Rect> *v : { &kv.second.frame, &kv.second.prev }) for (auto &r : *v) if (inArea(r)) { in++; if (aligned(r)) on++; }
    if (&kv.second == &g || (on >= 1 && on * 10 >= in * 6)) atlases.insert(GroupKey(nullptr, kv.second.tex)); }
   snprintf(b, sizeof b, "ToMe_GPUHIDE learn seq=%u area=%.0f,%.0f,%.0f,%.0f atlas=%ux%u glyphs=%u chars=%u atlases=%u", seq, area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0, g.tw, g.th, (unsigned)cs.size(), n, (unsigned)atlases.size()); if (emit) emit(b);
  } else {
   // grow the area when a longer line spills over it
   area.x0 = 0; /* centred rows (CHAOS;CHILD) start further left than the learned line: the band spans the whole target so a new row's first glyphs never leak */ area.x1 = (std::max)(area.x1, (float)g.rtW); area.y0 = (std::min)(area.y0, box.y0 - h * 0.5f); area.x1 = (std::max)(area.x1, box.x1 + h * 0.5f); area.y1 = (std::max)(area.y1, box.y1 + h * 0.5f);
  }
  bool hidden = hitSent && !readOnly; std::string rects; bool mapped = true;
  // The wire protocol counts Unicode code points, while LINE uses UTF-16.
  const size_t count = startup ? std::count_if(text.begin(), text.end(), [](wchar_t c) { return c < 0xdc00 || c > 0xdfff; }) : cs.size();
  const auto projected = cs.size() > count ? BodyStrategy::StartupPlacement(box, count) : std::vector<Rect>{};
  const auto &placement = projected.empty() ? cs : projected;
  for (auto r : placement) { if (!ToScreen(g.rt, g.rtW, g.rtH, r)) { mapped = false; break; } char x[64]; snprintf(x, sizeof x, "%s%.0f,%.0f,%.0f,%.0f", rects.empty() ? "" : ";", r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); rects += x; }
  if (!mapped) { if (log && frameNo % 60 == 0) log("rects not mapped yet: render target %p not composited", g.rt); return; } // try again next frame
  reported = true; hiddenSent = hidden; lastRects = cs; lastKeys.clear();
  if (bodyRecheck && hidden) cmvs.bodyReportAt = frameNow;
  for (auto &kv : groups) { if (kv.second.rt != g.rt) continue; for (auto &s : kv.second.keys) { if (frameNo - s.second.lastFrame > 2) continue; for (auto &c : cs) { float w = (std::min)(c.x1 - c.x0, s.second.r.x1 - s.second.r.x0), h = c.y1 - c.y0; if (std::fabs(c.x0 - s.second.r.x0) < 0.4f * w && std::fabs(c.y0 - s.second.r.y0) < 0.4f * h) { lastKeys.insert({ kv.first, s.first }); break; } } } }
  std::string t;
  { std::string u; for (size_t i = 0; i < text.size(); i++) { unsigned c = text[i]; if (c >= 0xD800 && c < 0xDC00 && i + 1 < text.size()) { c = 0x10000 + ((c - 0xD800) << 10) + (text[++i] - 0xDC00); u += (char)(0xF0 | (c >> 18)); u += (char)(0x80 | ((c >> 12) & 63)); u += (char)(0x80 | ((c >> 6) & 63)); u += (char)(0x80 | (c & 63)); } else if (c < 0x80) u += (char)c; else if (c < 0x800) { u += (char)(0xC0 | (c >> 6)); u += (char)(0x80 | (c & 63)); } else { u += (char)(0xE0 | (c >> 12)); u += (char)(0x80 | ((c >> 6) & 63)); u += (char)(0x80 | (c & 63)); } } t = u; }
  std::string line = "ToMe_CHARS engine=gpu line=" + std::to_string(seq) + " hidden=" + (hidden ? "1" : "0") + " sw=" + std::to_string(bbW) + " sh=" + std::to_string(bbH) + " vx=0 vy=0 vw=" + std::to_string(bbW) + " vh=" + std::to_string(bbH) + " n=" + std::to_string(placement.size()) + " rects=" + rects + " text=" + t;
  if (emit) emit(line);
 }
};

using GlyphLearner = OrderedGlyphLearner<NativeGroupOrder>;
