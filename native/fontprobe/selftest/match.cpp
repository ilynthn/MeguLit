// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test for the glyph hide decisions (GlyphMatch.h), no game and no DLL. Build and run: selftest\run-match.cmd
#include "../GlyphMatch.h"
#include <stdio.h>
using namespace GlyphHide;
static int Failed = 0;
static void Check(bool ok, const char *what)
{
  printf("%s %s\n", ok ? "ok  " : "FAIL", what);
  if (!ok)
    Failed++;
}
static int Walk(Matcher &m, const std::wstring &s, const Key &k, uint32_t now, bool render = true)
{
  int n = 0;
  for (wchar_t c : s)
    n += m.Glyph(c, k, now, render, "ggo");
  return n;
}
int main()
{
  const Key D{L"ＭＳ 明朝", 28}, Ui{L"ＭＳ 明朝", 16}, Other{L"ＭＳ ゴシック", 28}, Ruby{L"ＭＳ 明朝", 14};
  std::vector<std::string> reports;
  {
    Matcher m;
    m.Report = [&](const std::string &r) { reports.push_back(r); };
    Check(!m.Glyph(L'吾', D, 1000, true, "ggo"), "nothing is hidden before a line was pushed");
    const std::wstring line = L"吾輩は猫である。名前はまだ無い。";
    m.SetLine(L"吾輩は 猫である。\n名前はまだ無い。", 1000);
    Check(Walk(m, line, D, 1100) == (int)line.size() - 2, "first pass: hidden from the third in-order glyph on (dialogue font learned)");
    Check(Walk(m, line, D, 1200) == (int)line.size(), "second pass (engine rasterises the line again): every glyph hidden");
    Check(Walk(m, line, Ui, 1300) == 0, "same characters in a menu size: never hidden");
    Check(Walk(m, L"セーブロード", D, 1400) == 0, "characters not in the line, dialogue font: never hidden");
    Check(m.Glyph(L'猫', D, 1500, false, "ggo") && m.Glyph(L'猫', D, 1500, true, "ggo"), "size query + bitmap pair: both hidden");
    Check(m.Text(L"吾輩は猫である。", D, 1600, "text"), "string draw that is part of the line: hidden");
    Check(!m.Text(L"猫", Ui, 1600, "text"), "a one-character string in a menu font: drawn");
    Check(!m.Text(L"名前", Other, 1600, "text"), "a short string of the line in another font once the dialogue font is known: drawn");
    Check(m.Text(L"名前はまだ無い", Other, 1600, "text"), "four or more characters of the line: hidden whatever the font");
    Check(!m.Text(L"ロード", D, 1600, "text"), "menu string not in the line: drawn");
    m.Glyph(L'猫', D, 1700, true, "ggo");
    Check(m.Glyph(L'は', Ruby, 1700, true, "ggo"), "ruby (kana of the line, half size, right after a hidden glyph): hidden");
    Check(!m.Glyph(L'セ', Ui, 1710, true, "ggo") && !m.Glyph(L'は', Ui, 1710, true, "ggo"), "menu kana after a menu glyph that was drawn: drawn");
    m.Glyph(L'猫', D, 1720, true, "ggo");
    Check(!m.Glyph(L'は', Ruby, 9000, true, "ggo"), "ruby long after the last hidden glyph: drawn");
    Check(!m.Glyph(L'吾', D, 1000 + 61000, true, "ggo"), "the line expires after 60 s without a new push");
    bool hit = false;
    for (auto &r : reports)
      hit = hit || r.rfind("ToMe_GLYPHHIDE hit path=ggo size=28", 0) == 0;
    Check(hit, "first hidden glyph reported as ToMe_GLYPHHIDE hit");
  }
  {
    Matcher m;
    m.Seed(D);
    m.SetLine(L"どこで生れたかとんと見当がつかぬ。", 0);
    Check(m.Glyph(L'ど', D, 10, true, "ggo"), "seeded dialogue font: the very first glyph is hidden");
    Check(!m.Glyph(L'ど', Other, 10, true, "ggo"), "seeded font: another face is not");
    m.SetLine(L"何でも薄暗いじめじめした所で", 100);
    Check(m.Glyph(L'ど', D, 200, true, "ggo"), "previous line's glyph shortly after the next line was read: hidden");
    Check(!m.Glyph(L'ど', D, 5000, true, "ggo"), "previous line's glyph later: drawn (not in the current line)");
    m.Off();
    Check(!m.Glyph(L'何', D, 5100, true, "ggo"), "OFF: nothing hidden");
  }
  {
    Matcher m;
    m.Seed(D);
    bool cache = false;
    m.Report = [&](const std::string &r) { cache = cache || r.rfind("ToMe_GLYPHHIDE cache", 0) == 0; };
    m.SetLine(L"あいうえおかきくけこ", 0);
    Walk(m, L"あいうえおかきくけこ", D, 10);
    m.SetLine(L"あいうえおさしすせそ", 100); // a cached engine only rasterises the new characters
    Walk(m, L"さしすせそ", D, 110);
    m.SetLine(L"かきくけこたちつてと", 200);
    Walk(m, L"たちつてと", D, 210);
    m.SetLine(L"なにぬねの", 300);
    Check(cache && m.Cached(), "glyph cache: two lines leaving out already hidden characters -> cache report");
    Check(!m.Glyph(L'な', D, 310, true, "ggo"), "after the cache report nothing more is hidden");
  }
  {
    Matcher m;
    m.Seed(D);
    bool cache = false;
    m.Report = [&](const std::string &r) { cache = cache || r.rfind("ToMe_GLYPHHIDE cache", 0) == 0; };
    const wchar_t *lines[] = {L"あいうえおかきくけこ", L"あいうえおさしすせそ", L"かきくけこたちつてと", L"あいうえおなにぬねの", L"おわり"};
    uint32_t t = 0;
    for (auto l : lines)
    {
      m.SetLine(l, t);
      Walk(m, l, D, t + 5);
      t += 100;
    }
    Check(!cache && !m.Cached(), "no glyph cache: every line rasterised in full -> no cache report");
  }
  Check(PartOf(L"類たぐいまれな", L"類まれな"), "inline ruby reading skipped in a drawn string");
  printf(Failed ? "FAIL %d\n" : "PASS\n", Failed);
  return Failed ? 1 : 0;
}
