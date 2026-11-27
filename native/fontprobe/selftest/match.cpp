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
  {
    // A remembered seed (name box size) loses to the probe's live leader (dialogue size); without a leader the seed counts.
    Matcher m;
    const Key Name{L"MS Gothic", 17}, Dialogue{L"MS Gothic", 20};
    m.Seed(Name);
    Check(m.DialogueKey(Name) && !m.DialogueKey(Dialogue), "seed only: the seeded size is the dialogue key");
    m.Leader(Dialogue);
    Check(m.DialogueKey(Dialogue) && !m.DialogueKey(Name), "probe leader known: it replaces a stale seed");
    Matcher n;
    n.Report = [](const std::string &) {};
    n.Seed(Name);
    n.SetLine(L"アーシェ", 0);
    for (wchar_t c : std::wstring(L"アーシェ")) n.Glyph(c, Name, 10, true, "ggo"); // the name box is learned first
    n.Leader(Dialogue);
    Check(n.BlindKey(Dialogue) && n.BlindKey(Name), "blind: a learned name size does not keep the leading dialogue size out");
  }
  {
    // Glyph dots: every matched draw says which line character it is (index into the line without blanks).
    Matcher m;
    m.Seed(D);
    m.StopOnCache = false;
    std::vector<std::string> got;
    m.Report = [&](const std::string &r) { got.push_back(r); };
    m.SetLine(L"吾輩は 猫である。", 0);
    bool order = true;
    const std::wstring line = L"吾輩は猫である。";
    for (int i = 0; i < (int)line.size(); i++)
    {
      Served s;
      order = order && m.Glyph(line[i], D, 10, true, "ggo", &s) && s.index == i && s.kind == 'd';
      Served again; // the bitmap call after the size query: same character, same index
      order = order && m.Glyph(line[i], D, 11, true, "ggo", &again) && again.index == i && again.kind == 'd';
    }
    Check(order, "dots: per-glyph walk serves index i, kind d, for both calls of a size-query/bitmap pair");
    Served menu;
    Check(!m.Glyph(L'猫', Ui, 20, true, "ggo", &menu) && menu.kind == 0, "dots: the same character in a menu size is not served");
    std::vector<Served> sv;
    Check(m.Text(L"猫である", D, 30, "text", &sv) && sv.size() == 4 && sv[0].index == 3 && sv[3].index == 6 && sv[1].kind == 'd', "dots: a whole string maps each character to its index in the line");
    Check(m.Text(L"は　猫で", D, 31, "text", &sv) && sv.size() == 4 && sv[0].index == 2 && sv[1].kind == 0 && sv[2].index == 3, "dots: blanks inside a drawn string are not served");
    m.SetLine(L"名前はまだ無い。", 100);
    Check(m.Text(L"猫である", D, 110, "text", &sv) && sv[0].kind == 'p' && sv[0].index == 3, "dots: the previous line drawn just after the next was read: kind p, index into the previous line");
    // a cached engine: reported as ToMe_GLYPHDOT cache, and dots go on
    Matcher c;
    c.Seed(D);
    c.StopOnCache = false;
    bool dotCache = false, hideCache = false;
    c.Report = [&](const std::string &r) { dotCache = dotCache || r.rfind("ToMe_GLYPHDOT cache", 0) == 0; hideCache = hideCache || r.rfind("ToMe_GLYPHHIDE cache", 0) == 0; };
    c.SetLine(L"あいうえおかきくけこ", 0);
    Walk(c, L"あいうえおかきくけこ", D, 10);
    c.SetLine(L"あいうえおさしすせそ", 100);
    Walk(c, L"さしすせそ", D, 110);
    c.SetLine(L"かきくけこたちつてと", 200);
    Walk(c, L"たちつてと", D, 210);
    c.SetLine(L"なにぬねの", 300);
    Check(dotCache && !hideCache && !c.Cached() && c.Glyph(L'な', D, 310, true, "ggo"), "dots: a glyph cache is reported (ToMe_GLYPHDOT cache) and dots go on");
  }
  // Raster verdict (locating marks only on engines that rasterise a repeated character again)
  {
    const wchar_t *lines[] = {L"あいうえおかきくけこ", L"かきくけこさしすせそ", L"さしすせそあいうえお", L"あかさたなはまやらわ", L"いきしちにひみりをん"};
    RasterVerdict again, cache, half;
    std::set<wchar_t> had;
    int n = 0;
    for (const wchar_t *l : lines)
    {
      again.NextLine(l); cache.NextLine(l); half.NextLine(l);
      for (const wchar_t *p = l; *p; p++)
      {
        again.Rasterised(*p);
        if (had.insert(*p).second) { cache.Rasterised(*p); half.Rasterised(*p); }
        else if (n++ % 2) half.Rasterised(*p);
      }
    }
    again.NextLine(L"終"); cache.NextLine(L"終"); half.NextLine(L"終");
    Check(again.Rerasterises(false), "raster verdict: an engine that rasterises every line in full allows marks");
    Check(!again.Rerasterises(true), "raster verdict: never once the matcher saw a cache");
    Check(!cache.Rerasterises(false) && cache.chances >= 10 && cache.hits == 0, "raster verdict: an engine that rasterises a character once (glyph cache) gets no marks");
    Check(!half.Rerasterises(false), "raster verdict: a small cache that keeps half of the repeats gets no marks");
    RasterVerdict text;
    for (const wchar_t *l : lines) text.NextLine(l);
    text.NextLine(L"終");
    Check(!text.Rerasterises(false) && text.chances == 0, "raster verdict: lines drawn as strings (nothing rasterised) do not count");
  }
  {
    // 2026-11-27 アイキス3 sexy (NeXAS, GetGlyphOutline, ＭＳ ゴシック 30 px): the two options come in the dialogue font right after
    // the line that names them; the old rule blanked every option character the line had hidden
    const Key G{L"ＭＳ ゴシック", 30};
    const std::wstring line = L"「そうじゃない、ちょっと教えて欲しいというなら１を。当然分かってるし、忘れる訳がないというなら２を選ぶのです……」";
    const std::wstring o1 = L"１・ちょっと教えて欲しい", o2 = L"２・当然みんなの事はちゃんと知ってる";
    for (int strict = 0; strict < 2; strict++)
    {
      Matcher m;
      m.AfterLineNew = strict == 1;
      m.SetLine(line, 1000);
      Walk(m, line, G, 1100);
      int a = Walk(m, o1, G, 1200), b = Walk(m, o2, G, 1200);
      if (strict)
      {
        Check(a == 1 && b == 0, "after-line: options drawn (as a burst) after the whole line are not hidden, but the burst's first glyph");
        Check(Walk(m, line, G, 1300) == (int)line.size(), "after-line: the engine rasterising the line again still hides all of it");
        Check(m.Glyph(L'」', G, 1350, false, "ggo") && m.Glyph(L'」', G, 1350, true, "ggo"), "after-line: the size query + bitmap pair of the last character is hidden");
        Matcher half;
        half.AfterLineNew = true;
        half.SetLine(line, 2000);
        Walk(half, line.substr(0, 20), G, 2100);
        Check(half.Glyph(L'ち', G, 2200, true, "ggo"), "after-line: a hidden character out of order before the line is done is still hidden");
        // the walk misses the line's last characters (an engine that rasterises a character once per page): 90 % placed and
        // quiet for 0.8 s also counts as drawn; right after the last placed glyph it does not
        Matcher most;
        most.AfterLineNew = true;
        most.SetLine(line, 3000);
        Walk(most, line.substr(0, line.size() - 3), G, 3100);
        Check(most.Glyph(L'ち', G, 3300, true, "ggo"), "after-line: 0.2 s after the last placed glyph, a hidden character is still hidden");
        Check(Walk(most, o1, G, 4000) == 1, "after-line: 90 % placed and quiet for 0.8 s, the options are drawn (but the burst's first glyph)");
        // the next line typed before its text arrived (one glyph per 31 ms): characters the line hid stay hidden
        Matcher typing;
        typing.AfterLineNew = true;
        typing.SetLine(line, 20000);
        Walk(typing, line, G, 20100);
        Check(typing.Glyph(L'ち', G, 22000, true, "ggo") && typing.Glyph(L'と', G, 22031, true, "ggo"), "after-line: the next line typing before its text keeps the old rule");
        Check(typing.Glyph(L'と', G, 22031, true, "ggo"), "after-line: the second call of a pair takes the first call's decision");
        // the next line's 「 is rasterised before its text reaches the hide: after a finished line an opening bracket in the
        // dialogue font starts the next line
        Matcher next;
        next.AfterLineNew = true;
        next.SetLine(L"何か杏センパイの呼び方がおかしかった気がする。", 5000);
        Walk(next, L"何か杏センパイの呼び方がおかしかった気がする。", G, 5100);
        Check(Walk(next, L"アヤメちゃん", G, 6000) == 0, "after-line: the next speaker's name (not in the line) is drawn");
        Check(next.Glyph(L'「', G, 6010, true, "ggo"), "after-line: the next line's opening bracket is hidden");
        // the options are reported as text once they go quiet (the reader's choice candidates)
        std::vector<std::string> got;
        Matcher opt;
        opt.AfterLineNew = true;
        opt.Report = [&](const std::string &r) { if (r.rfind("ToMe_GLYPHHIDE afterline text ", 0) == 0) got.push_back(r.substr(30)); };
        opt.SetLine(line, 7000);
        Walk(opt, line, G, 7100);
        Walk(opt, o1 + o2, G, 9000);
        opt.Tick(9100);
        Check(got.empty(), "after-line text: not reported while the glyphs may still be coming");
        opt.Tick(9400);
        Check(got.size() == 1 && got[0] == Utf8(o1 + o2), "after-line text: the options reported once, as drawn");
        // NeXAS asks for every glyph twice (size query + bitmap): once the line walk saw that, the report has each character once,
        // and a character really doubled in the text (……) stays doubled
        auto twice = [](const std::wstring &s) { std::wstring t; for (wchar_t c : s) t += std::wstring(2, c); return t; };
        std::vector<std::string> got2;
        Matcher pairs;
        pairs.AfterLineNew = true;
        pairs.Report = [&](const std::string &r) { if (r.rfind("ToMe_GLYPHHIDE afterline text ", 0) == 0) got2.push_back(r.substr(30)); };
        pairs.SetLine(line, 10000);
        Walk(pairs, twice(line), G, 10100);
        pairs.SetLine(L"もう一度……いいか？", 11000);
        Walk(pairs, twice(L"もう一度……いいか？"), G, 11100);
        Walk(pairs, twice(o1 + L"……"), G, 13000);
        pairs.Tick(13400);
        Check(got2.size() == 1 && got2[0] == Utf8(o1 + L"……"), "after-line text: paired calls reported once per character, a real …… kept");
      }
      else
        Check(a + b > 10, "kernel rule (off): option characters the line hid are hidden (the old behaviour, kept by default)");
    }
  }
  printf(Failed ? "FAIL %d\n" : "PASS\n", Failed);
  return Failed ? 1 : 0;
}
