// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <algorithm>
#include <cmath>
#include <map>
#include <utility>
#include <vector>

template <class Rect> struct CmvsBodyAtlas {
 bool identified = false, startupConfirmed = false;
 unsigned startupSeq = 0, startupFrame = 0, maskedFrame = 0, changedFrame = 0;
 std::vector<Rect> startupCells;
 std::vector<bool> masked;
 bool visibleCell = false, refreshing = false;
};

// The strategy reads the current line and learned band, and returns a group's
// placement or asks the learner to wait. Draw masks and reporting stay in the learner.
template <class Geometry> struct CmvsBodyStrategy {
 using Rect = typename Geometry::Rect;
 using Seen = typename Geometry::Seen;
 using Group = typename Geometry::Group;

 static const unsigned BodyHookGraceMs = 250;
 static constexpr unsigned AtlasWidth = 1024, AtlasHeight = 2048, CellPitch = 72, Columns = 14;
 unsigned bodyReportAt = 0;

 static bool AtlasSize(unsigned width, unsigned height) { return width == AtlasWidth && height == AtlasHeight; }
 static bool UsesBodyAtlas(bool enabled, const Group &group) {
  return enabled && !group.rt && AtlasSize(group.tw, group.th);
 }

 // Draw packs the quantized atlas origin into the low 30 bits of the key.
 static int BodyAtlasCell(long long key) {
  const unsigned long long uv = key;
  const unsigned u = (uv >> 15) & 0x7fff, v = uv & 0x7fff;
  constexpr unsigned uStep = CellPitch * 4096 / AtlasWidth, vStep = CellPitch * 4096 / AtlasHeight;
  if (u % uStep || v % vStep || u / uStep >= Columns) return -1;
  return (v / vStep) * Columns + u / uStep;
 }

 template <class Quad>
 static bool FixedCell(const Quad &q, long long key) {
  return BodyAtlasCell(key) > 0 && q.u0 >= 0 && q.v0 >= 0 && q.u1 <= 1 && q.v1 <= 1 &&
   std::fabs((q.u1 - q.u0) * AtlasWidth - 32) <= 1 && std::fabs((q.v1 - q.v0) * AtlasHeight - 32) <= 1;
 }

 static bool StartupAtlas(const Group &g, unsigned seq, unsigned frame, unsigned bw, unsigned bh) {
  const auto &atlas = g.cmvs;
  return atlas.startupSeq == seq && (atlas.startupConfirmed || atlas.startupFrame == frame) &&
   !atlas.startupCells.empty() && g.rtW == bw && g.rtH == bh;
 }

 static bool MaskStartup(Group &g, unsigned frame, long long key, const Rect &rect, bool fixedCell, bool mayHide) {
  auto &atlas = g.cmvs;
  const int slot = BodyAtlasCell(key);
  if (slot <= 0) return false;
  if (size_t(slot) > atlas.startupCells.size() || !Geometry::SamePlace(atlas.startupCells[slot - 1], rect)) {
   if (fixedCell) atlas.changedFrame = frame;
   return false;
  }
  if (atlas.maskedFrame != frame) {
   std::fill(atlas.masked.begin(), atlas.masked.end(), false);
   atlas.maskedFrame = frame;
   atlas.visibleCell = false;
  }
  if (!mayHide || !fixedCell) { atlas.visibleCell = true; return false; }
  atlas.masked[slot - 1] = true;
  return true;
 }

 static std::vector<Rect> StartupPlacement(const Rect &row, size_t count) {
  // There is no character mapping for glyphs the hook missed. Give the hook
  // text contiguous boxes across the row, with shared rounded edges.
  std::vector<Rect> boxes;
  boxes.reserve(count);
  const float width = row.x1 - row.x0, top = std::round(row.y0), bottom = std::round(row.y1);
  float left = std::round(row.x0);
  for (size_t i = 0; i < count; ++i) {
   const float right = std::round(row.x0 + width * (i + 1) / count);
   boxes.push_back({left, top, right, bottom});
   left = right;
  }
  return boxes;
 }

 struct Selection {
  Group *group = nullptr;
  std::vector<Rect> body;
  bool moved = false;
  bool ownsFrame = false;
  bool startup = false;
 };

 struct Frame {
  bool enabled, learned, areaTraced, hitSent, hiddenSent, reported;
  unsigned frameNo, bbW, bbH, seq, n, lineAt, prevLineAt, bodyReportAt;
  void *areaRt;
  unsigned areaW, areaH;
  float glyphH;
  const Rect &area;
  const std::vector<bool> &blankAt;
  const std::vector<Rect> &lastRects, &earlierRects;

  bool FirstHidden() const { return enabled && areaTraced && hitSent && !hiddenSent; }
  bool NeedsCorrection() const {
   return enabled && reported && areaTraced && std::any_of(lastRects.begin(), lastRects.end(),
    [&](const Rect &r) { return !r.traced && !Geometry::BodyHeight(r, glyphH); });
  }
  bool ReviewsGroup(const Group &g, bool currentFrame, bool fromAtlas, bool mixed) const {
   return enabled && (!reported || mixed || FirstHidden()) && currentFrame && fromAtlas && g.rt == areaRt;
  }
  bool Retains(const Seen &seen) const { return seen.lastFrame == frameNo - 1 && seen.r.traced; }

  template <class KnownAtlas>
  Selection SelectGrid(std::map<long long, Group> &groups, const KnownAtlas &knownAtlas) const {
   if (!enabled) return {};
   Selection selection;
   for (auto &entry : groups) {
    Group &g = entry.second;
    if (g.rt || !AtlasSize(g.tw, g.th) || g.rtW != bbW || g.rtH != bbH) continue;
    auto current = CurrentBodyGrid(g);
    selection.ownsFrame = selection.ownsFrame || g.cmvs.identified;
    if (current.body.empty()) continue;
    if (selection.group) return {nullptr, {}, false, true};
    selection.group = &g;
    selection.body = std::move(current.body);
    selection.startup = current.startup;
   }
   if (Group *match = selection.group) {
    auto &atlas = match->cmvs;
    // A complete observed row is the probe. Publish placement only after a
    // later draw has actually hidden every one of those same cells.
    if (selection.startup) {
     if (!MaskedStartup(atlas, selection.body)) {
      atlas.startupSeq = seq;
      atlas.startupFrame = frameNo;
      atlas.startupConfirmed = false;
      SetStartupCells(atlas, std::move(selection.body));
      return {nullptr, {}, false, true};
     }
     atlas.startupConfirmed = true;
    } else if (!learned && atlas.startupSeq == seq && atlas.startupFrame == frameNo - 1) {
     return {nullptr, {}, false, true};
    }
    selection.moved = learned && (match->rt != areaRt || match->rtW != areaW || match->rtH != areaH ||
     !knownAtlas(match->tex) || std::any_of(selection.body.begin(), selection.body.end(),
      [&](const Rect &r) { return !Geometry::BodyInBand(r, area, glyphH); }));
   }
   return selection;
  }

  // Keep following the confirmed startup row while the hook still owns it.
  // A repaint may translate the whole row or reveal more of the same run.
  Selection FollowStartup(std::map<long long, Group> &groups, bool readOnly) const {
   for (auto &entry : groups) {
    Group &g = entry.second;
    auto &atlas = g.cmvs;
    if (g.rt || !AtlasSize(g.tw, g.th) || !atlas.startupConfirmed || atlas.startupSeq != seq) continue;
    const Selection hold{nullptr, {}, false, true};
    if (readOnly) return hiddenSent ? Selection{&g, lastRects, false, true, true} : hold;
    if (g.rtW != bbW || g.rtH != bbH) return hold;
    if (atlas.changedFrame == frameNo - 1 || atlas.refreshing) {
     auto next = CurrentBodyGrid(g, true);
     if (next.startup && RepaintOfLastRow(next.body) &&
         !std::equal(next.body.begin(), next.body.end(), lastRects.begin(), lastRects.end(), Geometry::SamePlace)) {
      if (MaskedStartup(atlas, next.body)) {
       atlas.refreshing = false;
       return {&g, std::move(next.body), false, true, true};
      }
      SetStartupCells(atlas, std::move(next.body));
      atlas.refreshing = true;
      return hold;
     }
     if (atlas.refreshing) {
      SetStartupCells(atlas, lastRects);
      atlas.refreshing = false;
     }
    }
    if (!hiddenSent && MaskedStartup(atlas, lastRects)) return {&g, lastRects, false, true, true};
    return hold;
   }
   return {};
  }

  // The bubble spacer can also keep the first complete row from matching during calibration.
  std::vector<Rect> InitialBody(const Group &g, bool currentFrame) const {
   if (!enabled || learned || !currentFrame || n < 6 || g.rt || !AtlasSize(g.tw, g.th) || g.frame.size() < n) return {};
   const auto first = std::find_if(g.frame.begin(), g.frame.end(), [](const Rect &r) { return r.traced; });
   if (first == g.frame.end()) return {};
   std::vector<Rect> row;
   for (const auto &r : g.frame) if (std::fabs(r.y0 - first->y0) <= 1) row.push_back(r);
   auto body = Geometry::Chars(std::move(row));
   if (body.size() != n || !FixedPitchBody(body, &g, false)) return {};
   return body;
  }

  Selection Review(Group &g, const std::vector<Rect> &fresh, const std::vector<Rect> &retained, bool canMove) const {
   // A centred line can overlap the previous line and share its atlas with a spacer.
   // Confirm the whole row against fresh keys before counting those positions again.
   auto body = BodyRects(g.frame, retained), newBody = BodyRects(fresh, retained);
   if (hitSent && areaTraced && (body.size() != n || newBody.size() != n)) {
    body = BodyRects(g.frame, retained, &g);
    newBody = BodyRects(fresh, retained, &g);
   }
   const bool moved = canMove && !hitSent && Geometry::Relocated(body, newBody, n, area, glyphH);
   if ((hitSent || moved) && body.size() == n && newBody.size() == n &&
       std::equal(body.begin(), body.end(), newBody.begin(), Geometry::SamePlace)) {
    // A partial row can already have been reported with decorations in its count.
    const size_t shared = std::count_if(lastRects.begin(), lastRects.end(), [&](const Rect &r) {
     return std::any_of(body.begin(), body.end(), [&](const Rect &b) { return Geometry::SamePlace(r, b); });
    });
    if (!reported || shared > n / 2) return {&g, std::move(body), moved};
   }
   if (FirstHidden()) {
    auto row = BodyRects(g.frame, {});
    if (RewrittenBody(g, row)) return {&g, std::move(row)};
   }
   return {};
  }

  template <class KnownAtlas>
  bool WaitForBody(const Group &g, const std::vector<Rect> &rects, const KnownAtlas &knownAtlas) const {
   // Even a later correction can leave the reader pinned to its first position.
   return FirstHidden() && rects.size() == n && rects.size() >= 6 && g.rt == areaRt &&
          PartialBodyWithBoxTrim(g, rects, knownAtlas);
  }

 private:
  static void SetStartupCells(CmvsBodyAtlas<Rect> &atlas, std::vector<Rect> cells) {
   atlas.startupCells = std::move(cells);
   atlas.masked.assign(atlas.startupCells.size(), false);
  }

  bool MaskedStartup(const CmvsBodyAtlas<Rect> &atlas, const std::vector<Rect> &body) const {
   return atlas.startupSeq == seq && atlas.maskedFrame == frameNo - 1 && !atlas.visibleCell &&
    std::equal(body.begin(), body.end(), atlas.startupCells.begin(), atlas.startupCells.end(), Geometry::SamePlace) &&
    std::all_of(atlas.masked.begin(), atlas.masked.end(), [](bool value) { return value; });
  }

  bool RepaintOfLastRow(const std::vector<Rect> &body) const {
   if (lastRects.empty() || body.size() < lastRects.size() ||
       !std::all_of(body.begin(), body.end(), [&](const Rect &r) { return Geometry::BodyInBand(r, area, glyphH); })) return false;
   const float dx = body.front().x0 - lastRects.front().x0;
   const float dy = body.front().y0 - lastRects.front().y0;
   return std::equal(lastRects.begin(), lastRects.end(), body.begin(), [&](Rect previous, const Rect &current) {
    previous.x0 += dx; previous.x1 += dx;
    previous.y0 += dy; previous.y1 += dy;
    return Geometry::SamePlace(previous, current);
   });
  }

  // CMVS packs the line in order in a 72-pixel grid, after the spacer at cell zero.
  bool BodyAtlasRun(const Group &g, const std::vector<Rect> &body, bool fromAtlas) const {
   if (!AtlasSize(g.tw, g.th) || (learned && !fromAtlas)) return false;
   std::vector<bool> matched(body.size());
   size_t count = 0;
   for (const auto &key : g.keys) {
    const auto &seen = key.second;
    if (seen.lastFrame != frameNo - 1) continue;
    if (!learned && ((int)(seen.firstAt - (lineAt - BodyHookGraceMs)) < 0 ||
        (prevLineAt && (int)(seen.firstAt - prevLineAt) <= 0))) continue;
    const int ordinal = BodyAtlasCell(key.first);
    if (ordinal <= 0 || size_t(ordinal) > body.size() || matched[ordinal - 1] ||
        !Geometry::SamePlace(body[ordinal - 1], seen.r)) continue;
    matched[ordinal - 1] = true;
    if (++count == body.size()) return true;
   }
   return false;
  }

  struct Grid {
   std::vector<Rect> body;
   bool startup;
  };

  // Only this frame's ordered atlas cells can describe the line. Counting the
  // box and font atlases together can fill a partial line with pieces of its box.
  Grid CurrentBodyGrid(Group &g, bool extending = false) const {
   if (g.prevFrame != frameNo - 1) return {};
   // A cold row must include the atlas wrap from column 13 to column 0.
   const bool tryStartup = (!learned || extending) && n >= Columns && n == blankAt.size();
   std::vector<const Seen *> cells(blankAt.size());
   std::vector<std::pair<unsigned, const Rect *>> tail;
   const Rect *spacer = nullptr;
   bool conflict = false;
   for (const auto &entry : g.keys) {
    const Seen &seen = entry.second;
    if (seen.lastFrame != frameNo - 1) continue;
    const Rect &r = seen.r;
    const int slot = BodyAtlasCell(entry.first);
    if (slot == 0 && !r.traced && r.x1 - r.x0 <= 8 && r.y1 - r.y0 <= 8) spacer = &r;
    if (slot <= 0 || r.x1 - r.x0 < 12 || r.y1 - r.y0 < 12) continue;
    if (size_t(slot) > cells.size()) {
     if (tryStartup && seen.fixedCell && !r.traced) tail.emplace_back(slot, &r);
     else conflict = true;
     continue;
    }
    const Seen *&cell = cells[slot - 1];
    if (cell && !Geometry::SamePlace(cell->r, r)) conflict = true;
    if (!cell || (!cell->r.traced && r.traced)) cell = &seen;
   }
   const bool hasSpacer = spacer && !cells.empty() && cells[0] && cells[0]->r.x0 > spacer->x0 && cells[0]->r.y0 > spacer->y0;
   if (hasSpacer) g.cmvs.identified = true;
   if (!g.cmvs.identified || conflict || cells.empty() || std::find(cells.begin(), cells.end(), nullptr) != cells.end()) return {};

   const Rect &first = cells.front()->r;
   const float width = first.x1 - first.x0, height = first.y1 - first.y0;
   float pitch = 0;
   const auto recent = [&](unsigned at) {
    return (int)(at - (lineAt - BodyHookGraceMs)) >= 0 && (!prevLineAt || (int)(at - prevLineAt) > 0) &&
     (!bodyReportAt || (int)(at - bodyReportAt) > 0);
   };
   std::vector<Rect> body;
   unsigned fresh = 0;
   bool traced = false;
   for (size_t i = 0; i < cells.size(); ++i) {
    const Seen &seen = *cells[i];
    const Rect &r = seen.r;
    if (std::fabs(r.x1 - r.x0 - width) > width * .2f || std::fabs(r.y1 - r.y0 - height) > height * .2f) return {};
    if (i) {
     const Rect &prior = cells[i - 1]->r;
     const float dx = r.x0 - prior.x0, dy = r.y0 - prior.y0;
     if (std::fabs(dy) <= 1) {
      if (dx <= 0 || dx > height + 1 || (pitch && std::fabs(dx - pitch) > 1)) return {};
      pitch = dx;
     } else if (dy < height * .7f || dy > height * 2 || std::fabs(r.x0 - first.x0) > 1) return {};
    }
    if (blankAt[i]) continue;
    body.push_back(r);
    traced = traced || r.traced;
    if (recent(seen.firstAt) || (r.traced && recent(seen.tracedAt))) ++fresh;
   }
   // The same coordinates and UVs can be reused. Old cells alone cannot claim
   // a new line, while a second report of an already matched line can reuse them.
   const bool repeat = reported && std::equal(body.begin(), body.end(), lastRects.begin(), lastRects.end(), Geometry::SamePlace);
   if (!traced || body.size() != n || (!extending && !repeat && fresh < (std::min)(n, 2u))) return {};
   const Rect &last = cells.back()->r;
   const bool startup = tryStartup && hasSpacer && std::fabs(last.y0 - first.y0) <= 1 &&
    std::all_of(cells.begin(), cells.end(), [](const Seen *cell) { return cell->fixedCell && cell->r.traced; });
   // The hook can miss some of the glyphs drawn on this row. Keep the
   // contiguous trailing cells in the body once their placement agrees.
   if (!tail.empty()) {
    if (!startup) return {};
    std::sort(tail.begin(), tail.end(), [](const auto &a, const auto &b) { return a.first < b.first; });
    for (size_t i = 0; i < tail.size(); ++i) {
     const Rect &r = *tail[i].second;
     if (tail[i].first != cells.size() + i + 1 || std::fabs(r.x0 - last.x0 - pitch * (i + 1)) > 1 ||
         std::fabs(r.y0 - last.y0) > 1 || std::fabs(r.x1 - r.x0 - width) > width * .2f ||
         std::fabs(r.y1 - r.y0 - height) > height * .2f) return {};
     body.push_back(r);
    }
   }
   return {std::move(body), startup};
  }

  bool FixedPitchBody(const std::vector<Rect> &body, const Group *atlas = nullptr, bool fromAtlas = true) const {
   if (body.size() < 5 || !body[0].traced) return false;
   const float height = learned ? glyphH : body[0].y1 - body[0].y0;
   const float pitch = body[1].x0 - body[0].x0;
   if (pitch <= 0 || pitch > height) return false;
   bool tracedPrefix = body[1].traced;
   unsigned untraced = 0;
   for (size_t i = 0; i < body.size(); i++) {
    const auto &r = body[i];
    const bool bodySize = learned ? Geometry::BodyInBand(r, area, glyphH) : Geometry::BodyHeight(r, height);
    if (!bodySize || std::fabs(r.y0 - body[0].y0) > 1 ||
        (i > 0 && std::fabs(r.x0 - body[i - 1].x0 - pitch) > 1)) return false;
    if (!r.traced) untraced++;
    else if (untraced) tracedPrefix = false;
   }
   // Initial calibration and missing interior traces both require a confirmed atlas run.
   return (learned && tracedPrefix && untraced <= 2) ||
    (atlas && untraced <= body.size() / 3 && BodyAtlasRun(*atlas, body, fromAtlas));
  }

  // A spacer or a column of box tiles to the left can make a partial row count as complete.
  template <class KnownAtlas>
  bool PartialBodyWithBoxTrim(const Group &g, const std::vector<Rect> &rects, const KnownAtlas &knownAtlas) const {
   const auto &trim = rects.front();
   if (trim.traced) return false;
   const auto first = std::find_if(rects.begin() + 1, rects.end(), [](const Rect &r) { return r.traced; });
   if (first == rects.end() || trim.x0 >= first->x0 || trim.y1 >= first->y0) return false;
   // A cross-atlas match can be mostly box tiles. These tiles straddle the top of the glyph row.
   const size_t tiles = std::count_if(rects.begin(), rects.end(), [&](const Rect &r) {
    return !r.traced && !Geometry::BodyHeight(r, glyphH) && r.y0 < first->y0 && r.y1 > first->y0;
   });
   if (tiles >= 4 && tiles * 4 >= rects.size()) return true;
   std::vector<Rect> row;
   for (const auto &r : rects) {
    if (!r.traced && std::fabs(r.x0 - trim.x0) <= 1 && std::fabs(r.y0 - first->y0) > 1) continue;
    row.push_back(r);
   }
   return rects.size() - row.size() <= 3 && FixedPitchBody(row, &g, learned && knownAtlas(g.tex));
  }

  std::vector<Rect> BodyRects(std::vector<Rect> rects, const std::vector<Rect> &retained, const Group *atlas = nullptr) const {
   rects.erase(std::remove_if(rects.begin(), rects.end(), [&](const Rect &r) {
    // Bubble tiles can keep an earlier rectangle alive after its glyph has gone.
    const bool outsideBody = atlas ? !Geometry::BodyInBand(r, area, glyphH) : !r.traced || !Geometry::BodyHeight(r, glyphH);
    return outsideBody || (Geometry::Earlier(r, earlierRects) && std::any_of(retained.begin(), retained.end(),
     [&](const Rect &e) { return Geometry::SamePlace(e, r); }));
   }), rects.end());
   if (rects.size() < n) return {};
   auto body = Geometry::Chars(Geometry::Cluster(Geometry::Chars(std::move(rects))));
   if (atlas && (body.size() != n || !FixedPitchBody(body, atlas))) return {};
   return body;
  }

  // CMVS can reuse both the position and UV of an older glyph. Require changes at two
  // distinct places in a complete row before accepting the reused keys as the new line.
  bool RewrittenBody(const Group &g, const std::vector<Rect> &row) const {
   if (row.size() != n || !FixedPitchBody(row)) return false;
   // The game can draw the first updated cells before LINE reaches the GPU thread.
   const Rect *first = nullptr;
   for (const auto &key : g.keys) {
    const auto &seen = key.second;
    if (seen.lastFrame != frameNo - 1 || !seen.r.traced || (int)(seen.tracedAt - seen.firstAt) <= 0 ||
        (int)(seen.tracedAt - (lineAt - BodyHookGraceMs)) < 0 ||
        (prevLineAt && (int)(seen.tracedAt - prevLineAt) <= 0) ||
        (bodyReportAt && (int)(seen.tracedAt - bodyReportAt) <= 0)) continue;
    const auto place = std::find_if(row.begin(), row.end(), [&](const Rect &r) { return Geometry::SamePlace(r, seen.r); });
    if (place == row.end()) continue;
    if (first && first != &*place) return true;
    first = &*place;
   }
   return false;
  }
 };
};
