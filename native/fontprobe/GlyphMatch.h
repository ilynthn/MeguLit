// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLit glyph hide, the decision part (no Windows calls, so native/fontprobe/selftest/match.cpp tests it alone).
// Engine-agnostic hiding of the game's own dialogue at the text-drawing layer every engine ends in (GDI glyph
// rasterisation, GDI/GDI+ string drawing, Direct2D text), instead of a per-engine hook point (user, 2026-11-14:
// 为什么不能不适配就替换). HookBridge pushes the line the generic text hook just read; a draw is hidden only when
//  - per glyph (GetGlyphOutline): the character continues an in-order run through the current line (the cursor may
//    repeat a character for the size-query/bitmap pair, skip a few, or restart at the first character when the engine
//    rasterises the whole line again) AND the font is the dialogue font: learned from three in-order glyphs of a line
//    under one face+size, seeded by MeguLit (FONT) or the probe's leading font. Other sizes (menus, names) never match.
//  - whole strings (TextOut/ExtTextOut, GdipDrawString, ID2D1RenderTarget::DrawText): the trimmed string is part of the
//    current or previous line (short kana runs of the line may be skipped: inline ruby readings), at least two
//    characters, and under the dialogue font once one is known (four or more matching characters count on any font).
//  - ruby: kana of the line in a clearly smaller font drawn straight after a hidden draw (no other draw between).
// The line expires 60 s after it was pushed, so nothing is hidden once MeguLit stops pushing.
// Glyph caches: an engine that rasterises each character once and reuses the bitmap would keep a blanked glyph for
// later text. Detected when two lines in a row leave out at least three characters that were hidden in earlier lines
// while other characters of the same line are still rasterised; then hiding stops for the run ("cache" report) and
// MeguLit falls back to the per-engine hooks (or reads only). In dot mode (StopOnCache = false, docs/text-architecture.md)
// a cached dot glyph is acceptable: the cache is reported ("ToMe_GLYPHDOT cache") and the matcher keeps going.
// Served: which line character a matched draw is (index into the line with blanks removed, see Squeeze), so the dot
// glyph that replaces it can be reported to MeguLit's compositor.
#pragma once
#include <cstdint>
#include <functional>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace GlyphHide
{
struct Key
{
  std::wstring face;
  int size = 0;
  bool Empty() const { return face.empty() || size <= 0; }
  bool Same(const Key &o) const { return !Empty() && face == o.face && (size - o.size <= 1 && o.size - size <= 1); }
  bool operator<(const Key &o) const { return face != o.face ? face < o.face : size < o.size; }
};

inline std::string Utf8(const std::wstring &w)
{
  std::string out;
  for (size_t i = 0; i < w.size(); i++)
  {
    uint32_t c = w[i];
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < w.size() && w[i + 1] >= 0xdc00 && w[i + 1] < 0xe000)
      c = 0x10000 + ((c - 0xd800) << 10) + (w[++i] - 0xdc00);
    if (c < 0x80)
      out += (char)c;
    else if (c < 0x800)
      out += (char)(0xc0 | (c >> 6)), out += (char)(0x80 | (c & 0x3f));
    else if (c < 0x10000)
      out += (char)(0xe0 | (c >> 12)), out += (char)(0x80 | ((c >> 6) & 0x3f)), out += (char)(0x80 | (c & 0x3f));
    else
      out += (char)(0xf0 | (c >> 18)), out += (char)(0x80 | ((c >> 12) & 0x3f)), out += (char)(0x80 | ((c >> 6) & 0x3f)), out += (char)(0x80 | (c & 0x3f));
  }
  return out;
}
inline bool Blank(wchar_t c) { return c <= 0x20 || c == 0x3000 || c == 0x200b || c == 0xfeff; }
inline bool Kana(wchar_t c) { return (c >= 0x3041 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff); }
inline std::wstring Squeeze(const std::wstring &s)
{
  std::wstring out;
  out.reserve(s.size());
  for (wchar_t c : s)
    if (!Blank(c))
      out += c;
  return out;
}
// drawn is part of line; short kana runs of the line (ruby readings carried inline) may be skipped between characters.
// Kind of a served draw: 'd' a character of the current line placed by the in-order walk (or found again by a whole
// string), 'c' a character of the current line drawn again after it was hidden (index of its last placement), 'p' a
// character of the previous line (index into the previous line), 'r' ruby kana over a hidden draw (index -1).
struct Served
{
  int index = -1;
  char kind = 0; // 0: not served (blank or no match)
};
inline bool PartOf(const std::wstring &line, const std::wstring &drawn)
{
  if (drawn.empty() || line.size() < drawn.size())
    return false;
  if (line.find(drawn) != std::wstring::npos)
    return true;
  if (drawn.size() < 2)
    return false;
  for (size_t i = 0; i + drawn.size() <= line.size(); i++)
  {
    if (line[i] != drawn[0])
      continue;
    size_t j = 1, k = i + 1, gap = 0;
    while (j < drawn.size() && k < line.size())
    {
      if (line[k] == drawn[j])
        j++, k++, gap = 0;
      else if (Kana(line[k]) && gap < 12)
        gap++, k++;
      else
        break;
    }
    if (j == drawn.size())
      return true;
  }
  return false;
}

// Positions of each character of drawn (already squeezed) in line, starting the search at from (then from 0); short
// kana runs of the line may be skipped. Empty when drawn is not part of line.
inline std::vector<int> Locate(const std::wstring &line, const std::wstring &drawn, size_t from)
{
  std::vector<int> out;
  auto at = [&](size_t i) {
    if (line[i] != drawn[0])
      return false;
    out.assign(1, (int)i);
    size_t j = 1, k = i + 1, gap = 0;
    while (j < drawn.size() && k < line.size())
    {
      if (line[k] == drawn[j])
        out.push_back((int)k), j++, k++, gap = 0;
      else if (Kana(line[k]) && gap < 12)
        gap++, k++;
      else
        break;
    }
    return j == drawn.size();
  };
  if (drawn.empty() || line.size() < drawn.size())
    return {};
  for (size_t i = from; i + drawn.size() <= line.size(); i++)
    if (at(i))
      return out;
  for (size_t i = 0; i < from && i + drawn.size() <= line.size(); i++)
    if (at(i))
      return out;
  return {};
}

class Matcher
{
public:
  static constexpr uint32_t ArmedFor = 60000, RubyWindow = 1500, PreviousWindow = 1500;
  std::function<void(const std::string &)> Report = [](const std::string &) {};
  bool StopOnCache = true; // blank mode: a glyph cache stops hiding; dot mode: reported, hiding goes on

  void SetLine(const std::wstring &text, uint32_t now)
  {
    std::wstring line = Squeeze(text);
    if (line.empty())
      return;
    if (cached)
      return;
    if (line == current && now - lineAt < ArmedFor)
    {
      lineAt = now; // the same line again (redraw, coalesced batch): keep the cursor
      return;
    }
    Finish();
    previous = current;
    previousHidden = hidden;
    current = line;
    lineAt = now;
    seq++;
    cursor = 0;
    hidden.clear();
    requested.clear();
    positions.clear();
    hits = 0;
    reported = false;
    placedAt.clear();
  }
  void Off()
  {
    Finish();
    current.clear();
    previous.clear();
    hidden.clear();
    previousHidden.clear();
    lineAt = 0;
  }
  void Seed(const Key &k)
  {
    if (!k.Empty())
      seeded = k;
  }
  void Leader(const Key &k) { leader = k; }
  bool Active(uint32_t now) const { return !cached && !current.empty() && now - lineAt < ArmedFor; }
  bool Cached() const { return cached; }
  long Sequence() const { return seq; }
  const std::wstring &Current() const { return current; }
  const std::wstring &Previous() const { return previous; }
  bool DialogueKey(const Key &k) const
  {
    for (auto &d : learned)
      if (d.Same(k))
        return true;
    if (learned.empty())
      return leader.Empty() ? seeded.Same(k) : leader.Same(k); // the probe's live leader beats a remembered seed (a stale seed from a name box must not keep the dialogue size out)
    return false;
  }
  // Blind dots: the probe's leading font (or, before it is known, the remembered seed) always counts, besides learned
  // keys; a name box learned first (AdvHD: 17 px names, 20 px dialogue) must not keep the dialogue size out.
  bool BlindKey(const Key &k) const
  {
    for (auto &d : learned)
      if (d.Same(k))
        return true;
    return leader.Empty() ? seeded.Same(k) : leader.Same(k);
  }
  bool KnowsKey() const { return !learned.empty() || !seeded.Empty(); }

  // One glyph rasterised (GetGlyphOutline). render=false: a metrics-only call (moves the cursor, nothing to blank).
  // True: return a blank glyph with the same metrics.
  bool Glyph(wchar_t c, const Key &k, uint32_t now, bool render, const char *path, Served *served = nullptr)
  {
    if (!Active(now) || Blank(c))
      return false;
    if (render)
      requested.insert(c);
    int pos = Place(c);
    bool dk = DialogueKey(k);
    if (pos >= 0)
    {
      Learn(k, pos);
      dk = DialogueKey(k);
    }
    bool hide = dk && (pos >= 0 || hidden.count(c));
    bool late = false;
    if (!hide && dk && now - lineAt < PreviousWindow && previousHidden.count(c))
      hide = late = true; // the engine still finishes the previous line for a moment after the new one was read
    if (!hide && !dk && Kana(c) && Ruby(k, now) && current.find(c) != std::wstring::npos)
      hide = true;
    if (!hide)
    {
      chain = false;
      return false;
    }
    if (pos >= 0)
      positions.insert(pos), placedAt[c] = pos;
    if (served)
    {
      if (pos >= 0)
        *served = {pos, 'd'};
      else if (late)
        *served = {(int)previous.find(c), 'p'};
      else if (dk)
        *served = {placedAt.count(c) ? placedAt[c] : -1, 'c'};
      else
        *served = {-1, 'r'};
    }
    if (render && !late)
      hidden.insert(c);
    Hit(k, now, path);
    return true;
  }

  // One whole string drawn (TextOut/ExtTextOut, GdipDrawString, D2D DrawText). True: do not draw it.
  // served (optional) gets one entry per character of s (blanks stay unserved).
  bool Text(const std::wstring &s, const Key &k, uint32_t now, const char *path, std::vector<Served> *served = nullptr)
  {
    if (!Active(now))
      return false;
    std::wstring drawn = Squeeze(s);
    if (drawn.empty())
      return false;
    if (drawn.size() == 1)
    {
      Served one;
      bool r = Glyph(drawn[0], k, now, true, path, &one); // engines that draw one character per call walk the line like glyphs
      if (r && served)
      {
        served->assign(s.size(), Served{});
        for (size_t i = 0; i < s.size(); i++)
          if (!Blank(s[i]))
            (*served)[i] = one;
      }
      return r;
    }
    bool dk = DialogueKey(k);
    bool hit = (drawn.size() >= 2 || dk) && (PartOf(current, drawn) || (now - lineAt < ArmedFor && PartOf(previous, drawn)));
    if (hit && !dk && KnowsKey() && drawn.size() < 4)
      hit = false; // a short string in another font: a menu item or a name that happens to be in the line
    if (!hit && !dk && drawn.size() <= 10 && Ruby(k, now))
    {
      bool kana = true;
      for (wchar_t c : drawn)
        kana = kana && Kana(c);
      hit = kana;
    }
    if (!hit)
    {
      chain = false;
      return false;
    }
    if (!dk && drawn.size() >= 4 && learned.size() < 2 && !k.Empty())
      Adopt(k);
    for (wchar_t c : drawn)
      requested.insert(c);
    if (served)
    {
      served->assign(s.size(), Served{});
      std::vector<int> at = Locate(current, drawn, (size_t)cursor);
      char kind = 'd';
      if (at.empty() && !previous.empty())
        at = Locate(previous, drawn, 0), kind = 'p';
      if (at.empty())
        kind = 'r';
      else if (kind == 'd')
      {
        cursor = at.back() + 1;
        for (size_t j = 0; j < at.size(); j++)
          positions.insert(at[j]), placedAt[drawn[j]] = at[j];
      }
      for (size_t i = 0, j = 0; i < s.size(); i++)
        if (!Blank(s[i]))
        {
          (*served)[i] = {j < at.size() ? at[j] : -1, kind};
          j++;
        }
    }
    Hit(k, now, path);
    return true;
  }

  // Called when the line changes: coverage report and glyph cache check.
  void Finish()
  {
    if (current.empty() || cached)
      return;
    if (hits || !requested.empty())
    {
      std::set<wchar_t> repeat, missing;
      for (wchar_t c : current)
        if (oldHidden.count(c))
        {
          repeat.insert(c);
          if (!requested.count(c))
            missing.insert(c);
        }
      bool suspicious = !requested.empty() && missing.size() >= 3 && missing.size() * 2 >= repeat.size();
      suspect = suspicious ? suspect + 1 : 0;
      if (lines < 8)
        Report("ToMe_GLYPHHIDE line seq=" + std::to_string(seq) + " chars=" + std::to_string(current.size()) + " placed=" + std::to_string(positions.size()) + " hidden=" + std::to_string(hidden.size()) + " requested=" + std::to_string(requested.size()) + " repeat=" + std::to_string(repeat.size()) + " missing=" + std::to_string(missing.size()));
      lines++;
      if (suspect >= 2 && StopOnCache)
      {
        cached = true;
        Report("ToMe_GLYPHHIDE cache seq=" + std::to_string(seq) + " missing=" + std::to_string(missing.size()) + " of " + std::to_string(repeat.size()));
      }
      else if (suspect >= 2 && !cacheReported)
      {
        cacheReported = true; // dot mode: reused dot glyphs are acceptable, the compositor is told once per run
        Report("ToMe_GLYPHDOT cache seq=" + std::to_string(seq) + " missing=" + std::to_string(missing.size()) + " of " + std::to_string(repeat.size()));
      }
    }
    for (wchar_t c : hidden)
      oldHidden.insert(c);
    requested.clear();
  }

private:
  std::wstring current, previous;
  std::set<wchar_t> hidden, previousHidden, oldHidden, requested;
  std::set<int> positions;
  uint32_t lineAt = 0, lastHideAt = 0;
  long seq = 0, lines = 0, hits = 0;
  int cursor = 0, suspect = 0, hiddenSize = 0;
  bool reported = false, cached = false, chain = false; // chain: the last draw was hidden (ruby follows it)
  bool cacheReported = false;
  std::map<wchar_t, int> placedAt; // character -> its last placed index in the current line
  Key seeded, leader;
  std::vector<Key> learned;
  std::map<Key, std::pair<int, int>> runs; // key -> (run length, last position)

  // Where c continues the in-order walk through the current line, or -1.
  int Place(wchar_t c)
  {
    int n = (int)current.size();
    if (cursor < n && current[cursor] == c)
      return cursor++;
    if (cursor > 0 && current[cursor - 1] == c)
      return cursor - 1; // the second call of a size-query/bitmap pair
    for (int j = cursor + 1; j < n && j <= cursor + 4; j++)
      if (current[j] == c)
      {
        cursor = j + 1;
        return j;
      }
    if (n && current[0] == c)
    {
      cursor = 1; // the whole line is rasterised again (no glyph cache, or a metrics pass first)
      return 0;
    }
    return -1;
  }
  void Learn(const Key &k, int pos)
  {
    if (k.Empty() || learned.size() >= 2)
      return;
    for (auto &d : learned)
      if (d.Same(k))
        return;
    auto &r = runs[k];
    if (pos == 0 || pos == r.second + 1)
      r.first = pos == 0 ? 1 : r.first + 1;
    else if (pos != r.second)
      r.first = 1;
    r.second = pos;
    if (r.first >= 3)
      Adopt(k);
  }
  void Adopt(const Key &k)
  {
    // A second dialogue key only when it is about the same size as the first (bold/other face), never ruby or menus.
    if (!learned.empty() && (k.size * 10 < learned[0].size * 8 || k.size * 8 > learned[0].size * 10))
      return;
    learned.push_back(k);
    Report("ToMe_GLYPHHIDE key size=" + std::to_string(k.size) + " face=" + Utf8(k.face));
  }
  bool Ruby(const Key &k, uint32_t now) const
  {
    return chain && hiddenSize > 0 && k.size > 0 && k.size * 4 <= hiddenSize * 3 && now - lastHideAt < RubyWindow;
  }
  void Hit(const Key &k, uint32_t now, const char *path)
  {
    lastHideAt = now;
    chain = true;
    if (DialogueKey(k) && k.size > 0)
      hiddenSize = k.size;
    hits++;
    if (!reported)
    {
      reported = true;
      Report(std::string("ToMe_GLYPHHIDE hit path=") + path + " size=" + std::to_string(k.size) + " seq=" + std::to_string(seq));
    }
  }
};
// Does the engine rasterise a character again every time a line uses it, or keep the bitmap (a glyph cache)? Locating
// marks (FontProbe.cpp, MARK on) are only allowed when it rasterises again: a cached marked glyph would come back in
// every later line. Per finished line: the distinct characters of the line that earlier lines already used are the
// chances; those the engine rasterised again during the line are the hits. "Rasterises again" = at least 10 chances and
// at least 90 % hits, and the matcher never saw a cache. Lines in which nothing was rasterised (string engines) do not count.
struct RasterVerdict
{
  std::set<wchar_t> seen, now;
  std::wstring line;
  int chances = 0, hits = 0;
  void Rasterised(wchar_t c) { if (c) now.insert(c); }
  void NextLine(const std::wstring &text)
  {
    if (!line.empty() && !now.empty())
    {
      std::set<wchar_t> repeat;
      for (wchar_t c : line)
        if (!Blank(c) && seen.count(c))
          repeat.insert(c);
      for (wchar_t c : repeat)
      {
        chances++;
        if (now.count(c))
          hits++;
      }
    }
    for (wchar_t c : line)
      if (!Blank(c))
        seen.insert(c);
    if (seen.size() > 8192)
      seen.clear();
    line = text;
    now.clear();
  }
  bool Rerasterises(bool cached) const { return !cached && chances >= 10 && hits * 10 >= chances * 9; }
};
} // namespace GlyphHide
