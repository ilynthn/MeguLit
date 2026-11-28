// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "ReplayCases.h"
#include <initializer_list>

namespace CmvsUsertest {

static std::vector<Quad> Cells(int x, int y, unsigned count, unsigned traced, unsigned glyphBase, unsigned columns = 23) {
 std::vector<Quad> cells;
 for (unsigned i = 0; i < count; ++i) {
  const float left = x + 28.f * (i % columns), top = y + 42.f * (i / columns);
  const float u = ((i + 1) % 14) * 72.f / 1024, v = ((i + 1) / 14) * 72.f / 2048;
  cells.push_back({left, top, left + 32, top + 32, u, v, u + 32.f / 1024, v + 32.f / 2048, 0});
  if (i < traced) cells.back().glyph = glyphBase + i + 1;
 }
 return cells;
}

static std::wstring Text(unsigned seq, size_t slots, std::initializer_list<size_t> blanks = {}) {
 std::wstring text;
 for (size_t i = 0; i < slots; ++i) text += static_cast<wchar_t>(0xe000 + (seq - 1) * 64 + i);
 for (size_t i : blanks) text[i] = L' ';
 return text;
}

static Quad Box(int x, int y, int w, int h, int u, int v, unsigned tw, unsigned th) {
 return {float(x), float(y), float(x + w), float(y + h), float(u) / tw, float(v) / th,
         float(u + w) / tw, float(v + h) / th, 0};
}

static std::vector<Quad> Tiles(int x, int y) {
 return {Box(x, y, 40, 70, 0, 0, 1280, 720), Box(x, y + 70, 28, 28, 0, 70, 1280, 720)};
}

static std::vector<Quad> Reveal(const std::vector<Quad> &body, size_t count) {
 const auto &first = body.front();
 std::vector<Quad> draw{Box(int(first.x0) - 26, int(first.y0) - 40, 4, 4, 0, 0, 1024, 2048)};
 draw.insert(draw.end(), body.begin(), body.begin() + count);
 return draw;
}

static void Paint(ReplayFixture &g, unsigned tick, const std::vector<Quad> &cells,
                  const std::vector<Quad> &tiles = {}) {
 if (!tiles.empty()) g.Draw((void *)2, 1280, 720, nullptr, 1280, 720, 1280, 720, tiles, tick);
 if (!cells.empty()) g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, cells, tick);
 g.Frame(tick + 1, 1280, 720);
}

static void Warm(ReplayFixture &g, const std::vector<Quad> &body, bool spacer = true) {
 g.BodyRecheck(true);
 g.Line(Text(1, body.size()), 10000);
 const auto draw = spacer ? Reveal(body, body.size()) : body;
 Paint(g, 10001, draw);
 Paint(g, 10018, draw);
}

static std::string Placement(unsigned seq, bool hidden, const std::vector<Quad> &body,
                             std::initializer_list<size_t> blanks = {}) {
 std::string result = "ToMe_CHARS engine=gpu line=" + std::to_string(seq) + (hidden ? " hidden=1" : " hidden=0");
 result += " sw=1280 sh=720 vx=0 vy=0 vw=1280 vh=720 n=" + std::to_string(body.size() - blanks.size()) + " rects=";
 bool first = true;
 for (size_t i = 0; i < body.size(); ++i) {
  if (std::find(blanks.begin(), blanks.end(), i) != blanks.end()) continue;
  const auto &q = body[i];
  char box[64];
  std::snprintf(box, sizeof box, "%s%.0f,%.0f,%.0f,%.0f", first ? "" : ";", q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
  result += box;
  first = false;
 }
 return result;
}

static void CheckPlacements(const ReplayFixture &g, std::initializer_list<std::string> expected) {
 std::vector<std::string> actual;
 std::istringstream out(g.output.rows.str());
 for (std::string message; std::getline(out, message);) {
  if (message.rfind("ToMe_CHARS ", 0) == 0) actual.push_back(message.substr(0, message.find(" text=")));
 }
 const auto difference = std::mismatch(actual.begin(), actual.end(), expected.begin(), expected.end());
 if (difference.first == actual.end() && difference.second == expected.end()) return;
 throw std::runtime_error("CMVS placement stream differs at report " + std::to_string(difference.first - actual.begin() + 1) +
                          ": expected " + std::to_string(expected.size()) + " reports, received " + std::to_string(actual.size()));
}

// Geometry and draw order from the first incorrect corner report, followed by the completed row.
static void Corner(ReplayFixture &g) {
 const auto old = Cells(344, 334, 20, 20, 0);
 const auto next = Cells(414, 334, 15, 15, 20);
 const auto tiles = Tiles(388, 294);
 Warm(g, old);
 g.Line(Text(2, 15), 15000);
 Paint(g, 15001, Reveal(next, 13), tiles);
 Paint(g, 15018, Reveal(next, 15), tiles);
 Paint(g, 15035, Reveal(next, 15), tiles);
 CheckPlacements(g, {Placement(1, true, old), Placement(2, true, next)});
}

// The new prefix, three cells from the previous draw, and part of the box total 23 positions.
static void Mixed(ReplayFixture &g) {
 const auto old = Cells(470, 656, 11, 11, 0);
 const auto next = Cells(302, 656, 23, 7, 20);
 auto tiles = Tiles(276, 616);
 for (int x = 304; x <= 444; x += 28) {
  tiles.push_back(Box(x, 616, 28, 28, 28, 0, 1280, 720));
  tiles.push_back(Box(x - 2, 644, 32, 44, 28, 28, 1280, 720));
  tiles.push_back(Box(x, 686, 28, 28, 28, 72, 1280, 720));
 }
 Warm(g, old);
 g.Line(Text(2, 23), 15000);
 Paint(g, 15000, {});
 Paint(g, 15001, {});
 auto prefix = Reveal(next, 6);
 prefix.insert(prefix.end(), old.begin(), old.begin() + 3);
 Paint(g, 15002, prefix, tiles);
 Paint(g, 15018, Reveal(next, 23), tiles);
 Paint(g, 15035, Reveal(next, 23), tiles);
 CheckPlacements(g, {Placement(1, false, old), Placement(1, true, old), Placement(2, true, next)});
}

// The two dialogue bands are learned before the sample. The two-line bubble has three drawn blanks;
// the next bubble has 32 body cells and a spacer, and its successor reuses the same positions and UVs.
static void TwoRows(ReplayFixture &g) {
 const auto warm = Cells(456, 306, 18, 18, 0, 2);
 const auto upper = Cells(316, 306, 39, 12, 20);
 const auto lower = Cells(316, 614, 32, 6, 60);
 const auto shorter = Cells(316, 614, 26, 6, 100);
 Warm(g, warm, false);
 g.Line(Text(2, 39, {14, 18, 32}), 15000);
 Paint(g, 15001, Reveal(upper, 38));
 Paint(g, 15018, Reveal(upper, 39));
 Paint(g, 15035, Reveal(upper, 39));
 Paint(g, 17000, Reveal(lower, 5));
 g.Line(Text(3, 32), 17100);
 Paint(g, 17101, Reveal(lower, 24));
 Paint(g, 17118, Reveal(lower, 32));
 Paint(g, 17135, Reveal(lower, 32));
 g.Line(Text(4, 26), 19100);
 // A clipped redraw of the old line has the new length and the right grid, but no new cells.
 Paint(g, 19101, Reveal(lower, 26));
 // Six cells have changed, but the old draw still extends beyond the new line.
 auto oldTail = lower;
 std::copy_n(shorter.begin(), 6, oldTail.begin());
 Paint(g, 19118, Reveal(oldTail, 32));
 Paint(g, 19135, Reveal(shorter, 25));
 CheckPlacements(g, {Placement(1, false, warm), Placement(1, true, warm), Placement(2, true, upper, {14, 18, 32}),
                     Placement(3, true, lower)});
 Paint(g, 19152, Reveal(shorter, 26));
 Paint(g, 19169, Reveal(shorter, 26));
 CheckPlacements(g, {Placement(1, false, warm), Placement(1, true, warm), Placement(2, true, upper, {14, 18, 32}),
                     Placement(3, true, lower), Placement(4, true, shorter)});
}

// The log samples draws every tenth frame. These batches preserve the sampled
// order and rectangles, including the four untraced cells beyond the first line.
static std::vector<int> PaintCold(ReplayFixture &g, unsigned tick, const std::vector<Quad> &body, size_t count,
                                  unsigned width = 1024, unsigned height = 2048) {
 auto row = Reveal(body, count);
 row.front().u1 = 4.f / width;
 row.front().v1 = 4.f / height;
 const auto split = row.begin() + (std::min)(row.size(), size_t(14));
 auto mask = g.Draw((void *)1, width, height, nullptr, 1280, 720, 1280, 720, {row.begin(), split}, tick);
 if (split != row.end()) {
  for (int index : g.Draw((void *)1, width, height, nullptr, 1280, 720, 1280, 720, {split, row.end()}, tick))
   mask.push_back(int(split - row.begin()) + index);
 }
 const auto ui = g.Draw((void *)2, 1024, 2048, nullptr, 1280, 720, 1280, 720,
                        {Box(4, 0, 4, 4, 0, 0, 1024, 2048)}, tick);
 if (!ui.empty()) throw std::runtime_error("CMVS hid the unrelated atlas");
 g.Frame(tick + 1, 1280, 720);
 return mask;
}

static std::vector<int> BodyMask(int count) {
 std::vector<int> mask;
 for (int i = 1; i <= count; ++i) mask.push_back(i);
 return mask;
}

static std::string ColdPlacement(bool hidden = true, int count = 19) {
 // The first cell starts at 302 and the last ends at 918 + 32.
 std::vector<Quad> boxes;
 for (int i = 0; i < count; ++i) {
  const float left = float(302 + (648 * i + count / 2) / count);
  const float right = float(302 + (648 * (i + 1) + count / 2) / count);
  boxes.push_back({left, 334, right, 366});
 }
 return Placement(1, hidden, boxes);
}

// Synthesized from the startup log: the hook sends 19 characters, but the
// game draws 23 glyphs. After OFF, it draws the complete 20-cell second line.
static void ColdStart(ReplayFixture &g) {
 const auto first = Cells(302, 334, 23, 19, 0);
 const auto second = Cells(344, 334, 20, 19, 40);
 auto before = first;
 for (Quad &q : before) q.glyph = 0;
 g.BodyRecheck(true);
 PaintCold(g, 9900, before, 13);
 g.Line(Text(1, 19), 10000);
 PaintCold(g, 10001, first, 23);
 const auto firstHidden = PaintCold(g, 10018, first, 23);
 const auto firstStable = PaintCold(g, 10035, first, 23);
 if (firstHidden != BodyMask(23) || firstStable != BodyMask(23))
  throw std::runtime_error("CMVS cold-start mask must cover all 23 drawn glyphs");
 if (g.lastRects.size() != 23) throw std::runtime_error("CMVS must remember all 23 original positions");
 g.Off();
 g.Line(Text(2, 20), 15000);
 PaintCold(g, 15001, second, 13);
 const auto secondHidden = PaintCold(g, 15018, second, 20);
 PaintCold(g, 15035, second, 20);

 CheckPlacements(g, {ColdPlacement(), Placement(2, true, second)});
 if (secondHidden != BodyMask(20)) throw std::runtime_error("CMVS second line mask must cover all 20 glyphs");
}

static void CheckColdAtlasGuards() {
 const auto good = Cells(302, 334, 23, 19, 0);
 const auto rejects = [](const std::vector<Quad> &row, unsigned width, unsigned height, bool enabled, bool readOnly) {
  ReplayFixture g;
  g.BodyRecheck(enabled);
  g.Mode(readOnly);
  g.Line(Text(1, 19), 10000);
  if (!PaintCold(g, 10001, row, row.size(), width, height).empty() ||
      !PaintCold(g, 10018, row, row.size(), width, height).empty())
   throw std::runtime_error("CMVS acquired an unconfirmed cold atlas");
  CheckPlacements(g, {});
 };
 rejects(good, 512, 2048, true, false);
 rejects(good, 1024, 1024, true, false);
 rejects(good, 1024, 2048, false, false);
 rejects(good, 1024, 2048, true, true);
 rejects(Cells(302, 334, 23, 23, 0), 1024, 2048, true, false);

 auto offGrid = good;
 offGrid[4].u0 += 1.f / 1024;
 offGrid[4].u1 += 1.f / 1024;
 rejects(offGrid, 1024, 2048, true, false);
 offGrid = good;
 offGrid[4].v0 += 1.f / 2048;
 offGrid[4].v1 += 1.f / 2048;
 rejects(offGrid, 1024, 2048, true, false);

 auto narrow = good;
 for (size_t i = 0; i < narrow.size(); ++i) {
  narrow[i].u0 = ((i + 1) % 13) * 72.f / 1024;
  narrow[i].u1 = narrow[i].u0 + 32.f / 1024;
  narrow[i].v0 = ((i + 1) / 13) * 72.f / 2048;
  narrow[i].v1 = narrow[i].v0 + 32.f / 2048;
 }
 rejects(narrow, 1024, 2048, true, false);

 auto wrongCrop = good;
 wrongCrop[6].v1 += 4.f / 2048;
 rejects(wrongCrop, 1024, 2048, true, false);
 wrongCrop = good;
 wrongCrop[6].u1 += 4.f / 1024;
 rejects(wrongCrop, 1024, 2048, true, false);

 auto displacedTail = good;
 displacedTail.back().x0 += 4;
 displacedTail.back().x1 += 4;
 rejects(displacedTail, 1024, 2048, true, false);
 displacedTail = good;
 displacedTail.back().y0 += 4;
 displacedTail.back().y1 += 4;
 rejects(displacedTail, 1024, 2048, true, false);
 displacedTail = good;
 displacedTail.back().u0 += 72.f / 1024;
 displacedTail.back().u1 += 72.f / 1024;
 rejects(displacedTail, 1024, 2048, true, false);
 displacedTail = good;
 displacedTail.back().x1 += 8;
 rejects(displacedTail, 1024, 2048, true, false);
 displacedTail = good;
 displacedTail.back().y1 += 8;
 rejects(displacedTail, 1024, 2048, true, false);

 // A redraw in hide mode cannot remove a trailing cell already drawn in read mode.
 ReplayFixture g;
 g.BodyRecheck(true);
 g.Line(Text(1, 19), 10000);
 PaintCold(g, 10001, good, good.size());
 auto row = Reveal(good, good.size());
 const auto storeDecoy = [&](unsigned tick) {
  const auto &first = good.front();
  return g.Draw((void *)3, 1024, 2048, nullptr, 1280, 720, 1280, 720,
                {Box(int(first.x0), int(first.y0), 32, 32, 5, 8, 1024, 2048)}, tick);
 };
 g.Mode(true);
 const auto visible = g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, {row.back()}, 10018);
 g.Mode(false);
 g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, row, 10018);
 storeDecoy(10018);
 g.Frame(10019, 1280, 720);
 if (!visible.empty() || g.hitSent) throw std::runtime_error("CMVS took over a frame with a visible cold cell");
 CheckPlacements(g, {});

 storeDecoy(10035);
 PaintCold(g, 10035, good, good.size());
 CheckPlacements(g, {ColdPlacement()});
 if (!storeDecoy(10052).empty()) throw std::runtime_error("cold-start learning claimed a different atlas");
}

static void CheckLateColdTail() {
 ReplayFixture g;
 const auto row = Cells(302, 334, 23, 19, 0);
 const std::vector<Quad> prefix(row.begin(), row.begin() + 19);
 const auto prefixReport = Placement(1, true, prefix);
 g.BodyRecheck(true);
 g.Line(Text(1, 19), 10000);
 PaintCold(g, 10001, row, 19);
 PaintCold(g, 10018, row, 19);
 CheckPlacements(g, {prefixReport});

 PaintCold(g, 10035, row, row.size());
 CheckPlacements(g, {prefixReport});
 if (PaintCold(g, 10052, row, row.size()) != BodyMask(23))
  throw std::runtime_error("late CMVS glyphs stayed visible after the next repaint");
 CheckPlacements(g, {prefixReport, ColdPlacement()});
 if (PaintCold(g, 10069, row, row.size()) != BodyMask(23))
  throw std::runtime_error("CMVS lost the extended row when it redrew again");
 CheckPlacements(g, {prefixReport, ColdPlacement()});

 g.Mode(true);
 if (!PaintCold(g, 10086, row, row.size()).empty()) throw std::runtime_error("CMVS hid the extended row in read mode");
 CheckPlacements(g, {prefixReport, ColdPlacement(), ColdPlacement(false)});
 g.Mode(false);
 if (PaintCold(g, 10103, row, 19) != BodyMask(19)) throw std::runtime_error("CMVS failed to restore the prefix mask");
 CheckPlacements(g, {prefixReport, ColdPlacement(), ColdPlacement(false)});
 if (PaintCold(g, 10120, row, row.size()) != BodyMask(23)) throw std::runtime_error("CMVS failed to restore the full mask");
 CheckPlacements(g, {prefixReport, ColdPlacement(), ColdPlacement(false), ColdPlacement()});
}

static void CheckUnconfirmedColdProbe() {
 const auto body = Cells(302, 334, 23, 19, 0);
 const auto draw = Reveal(body, body.size());
 const auto arm = [](ReplayFixture &g) {
  g.BodyRecheck(true);
  g.Line(Text(1, 19), 10000);
 };
 {
  ReplayFixture g;
  arm(g);
  PaintCold(g, 10001, body, body.size());
  g.Frame(10019, 1280, 720);
  if (!PaintCold(g, 10035, body, body.size()).empty()) throw std::runtime_error("CMVS used an expired startup probe");
  CheckPlacements(g, {});
 }
 for (const auto size : {std::pair<unsigned, unsigned>{1296, 720}, std::pair<unsigned, unsigned>{1280, 736}}) {
  ReplayFixture g;
  arm(g);
  PaintCold(g, 10001, body, body.size());
  if (!g.Draw((void *)1, 1024, 2048, nullptr, size.first, size.second, 1280, 720, draw, 10018).empty())
   throw std::runtime_error("CMVS used a startup probe on a different target size");
 }
 {
  ReplayFixture g;
  arm(g);
  for (unsigned tick : {10001u, 10018u}) {
   const auto first = g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, draw, tick);
   const auto second = g.Draw((void *)2, 1024, 2048, nullptr, 1280, 720, 1280, 720, draw, tick);
   if (!first.empty() || !second.empty()) throw std::runtime_error("CMVS masked an ambiguous startup atlas");
   g.Frame(tick + 1, 1280, 720);
  }
  CheckPlacements(g, {});
 }
}

static void CheckMovedColdRow() {
 ReplayFixture g;
 const auto first = Cells(302, 334, 19, 19, 0);
 const auto shifted = Cells(326, 334, 19, 19, 0);
 g.BodyRecheck(true);
 g.Line(Text(1, 19), 10000);
 PaintCold(g, 10001, first, first.size());
 PaintCold(g, 10018, first, first.size());
 PaintCold(g, 10035, shifted, shifted.size());
 CheckPlacements(g, {Placement(1, true, first)});
 if (PaintCold(g, 10052, shifted, shifted.size()) != BodyMask(19))
  throw std::runtime_error("CMVS did not mask the confirmed repaint at its new position");
 CheckPlacements(g, {Placement(1, true, first), Placement(1, true, shifted)});
}

static void CheckVisibleColdCrop() {
 ReplayFixture g;
 const auto row = Cells(302, 334, 19, 19, 0);
 auto visible = row.front();
 visible.v1 += 4.f / 2048;
 g.BodyRecheck(true);
 g.Line(Text(1, 19), 10000);
 PaintCold(g, 10001, row, row.size());
 const auto mask = g.Draw((void *)1, 1024, 2048, nullptr, 1280, 720, 1280, 720, {visible}, 10018);
 PaintCold(g, 10018, row, row.size());
 if (!mask.empty() || g.hitSent) throw std::runtime_error("CMVS confirmed a frame with a visible crop at a body cell");
 CheckPlacements(g, {});
 if (PaintCold(g, 10035, row, row.size()) != BodyMask(19))
  throw std::runtime_error("CMVS did not recover on the next complete hidden repaint");
 CheckPlacements(g, {Placement(1, true, row)});
}

static void CheckColdUnicode() {
 ReplayFixture g;
 const auto row = Cells(302, 334, 23, 19, 0);
 g.BodyRecheck(true);
 // Bypass the tape's one-code-unit aliases to exercise the native UTF-16 input.
 g.GlyphLearner::Line(L"\U00020BB7" + Text(1, 17), 10000);
 PaintCold(g, 10001, row, row.size());
 if (PaintCold(g, 10018, row, row.size()) != BodyMask(23)) throw std::runtime_error("CMVS failed to mask the Unicode row");
 CheckPlacements(g, {ColdPlacement(true, 18)});
 if (g.output.rows.str().find(" text=\xf0\xa0\xae\xb7") == std::string::npos)
  throw std::runtime_error("CMVS did not preserve the supplementary character");
}

static const FixtureCase Cases[] = {
 {L"aoitori-cmvs-cold-start", ColdStart},
 {L"aoitori-cmvs-user-corner", Corner},
 {L"aoitori-cmvs-user-mixed", Mixed},
 {L"aoitori-cmvs-user-two-rows", TwoRows},
};

} // namespace CmvsUsertest
