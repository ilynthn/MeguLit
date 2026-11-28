// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLit: hide the game's own dialogue when the game draws it through GDI and the stream MeguLit reads cannot write
// back (a per-character or read-only hook, e.g. one on std::wstring::push_back while the engine renders the built line
// with TextOutW into a DIB). Engine-agnostic: the host switches the selected dialogue stream on
// (Luna_UseEmbed) even when the hook is not EMBED_ABLE; every text that stream delivers is kept here as the current
// and previous line, and any TextOut/ExtTextOut/DrawText call whose string is part of those lines is not drawn.
// Short kana-only strings in a clearly smaller font right after a hidden line (ruby) are dropped with it.
// Names (2026-11-29, a Ciel game drawing one character per TextOutA call; 群友: 人名也会被隐藏, 很多游戏都这样): the
// name box is drawn through the same GDI calls, and a name the line mentions (美咲ちゃんの…) or a single character of it is
// "part of the line". The dialogue font height is learned (a hidden string of four or more characters, or three
// characters drawn one per call in line order under one height); once known, a string shorter than four characters is
// hidden only under that height, so the name plate (its own font) keeps the game's name. Same rule as the glyph hide
// (native/fontprobe/GlyphMatch.h: "a short string in another font: a menu item or a name that happens to be in the line").
// The first hidden string of each line is reported as "MeguLit_GDIHIDE" so the host can mark the stream hide-only.
#pragma once
void attachFunction(uintptr_t _hook_font_flag);
namespace MeguLitGdiHide
{
  inline SRWLOCK Lock = SRWLOCK_INIT;
  inline std::wstring Current, Previous;
  inline ThreadParam Tp{};
  inline DWORD LastFeed = 0, LastHide = 0;
  inline long Line = 0, Reported = -1, HiddenHeight = 0;
  // The dialogue font height (tmHeight) of the selected stream, 0 = not known yet; Runs: per height, the in-order walk of
  // single characters through the current line that teaches it.
  inline long DialogueHeight = 0;
  struct Run { long height = 0, line = -1, pos = -1; int len = 0; };
  inline Run Runs[4];
  constexpr int LearnRun = 3, RelearnRun = 8;
  inline std::atomic<bool> Attached = false;
  // Set by solvefont: an EMBED_ABLE hook asked for the font hijack, so the GDI functions also switch fonts.
  inline bool FontWanted = false;
  // The first strings seen after arming are logged (fn, length, first character, decision), so a game whose text never matches can be diagnosed from the log.
  inline std::atomic<long> Seen = 0;
  constexpr DWORD NewLineGap = 400, ArmedFor = 60000, SingleCharWindow = 3000, RubyWindow = 3000;
  constexpr size_t MaxLine = 2048;

  inline std::wstring Decode(const HookParam &hp, const TextBuffer &buff)
  {
    if (hp.type & CODEC_UTF16)
      return std::wstring((const wchar_t *)buff.data, buff.size / 2);
    if (hp.type & CODEC_UTF32)
    {
      std::wstring out;
      for (size_t i = 0; i + 4 <= buff.size; i += 4)
      {
        char32_t c = *(const char32_t *)(buff.data + i);
        if (c >= 0x10000)
        {
          c -= 0x10000;
          out += (wchar_t)(0xd800 + (c >> 10));
          out += (wchar_t)(0xdc00 + (c & 0x3ff));
        }
        else
          out += (wchar_t)c;
      }
      return out;
    }
    UINT cp = (hp.type & CODEC_UTF8) ? CP_UTF8 : (hp.codepage ? hp.codepage : (commonsharedmem && commonsharedmem->codepage ? commonsharedmem->codepage : 932));
    int n = MultiByteToWideChar(cp, 0, (LPCSTR)buff.data, (int)buff.size, nullptr, 0);
    std::wstring out(n > 0 ? n : 0, L'\0');
    if (n > 0)
      MultiByteToWideChar(cp, 0, (LPCSTR)buff.data, (int)buff.size, &out[0], n);
    return out;
  }

  // Called by TextHook::Send for a hook that is not EMBED_ABLE, only when the host switched its thread on.
  inline void Feed(const ThreadParam &tp, const HookParam &hp, const TextBuffer &buff)
  {
    std::wstring text = Decode(hp, buff);
    if (text.empty())
      return;
    DWORD now = GetTickCount();
    AcquireSRWLockExclusive(&Lock);
    if (!(Tp == tp))
    {
      DialogueHeight = 0; // another stream, maybe another text window and font
      for (auto &r : Runs)
        r = Run{};
    }
    if (!(Tp == tp) || now - LastFeed > NewLineGap)
    {
      Previous = Current;
      Current.clear();
      Line++;
    }
    Tp = tp;
    LastFeed = now;
    Current += text;
    if (Current.size() > MaxLine)
      Current.erase(0, Current.size() - MaxLine);
    ReleaseSRWLockExclusive(&Lock);
    if (!Attached.exchange(true))
    {
      attachFunction(F_TextOutA | F_TextOutW | F_ExtTextOutA | F_ExtTextOutW | F_DrawTextA | F_DrawTextW | F_DrawTextExA | F_DrawTextExW);
      Msg::Log("MeguLit_GDIHIDE armed version=2"); // version marker: tools/native-stale.cjs checks both hook DLLs carry it
    }
  }

  inline bool Blank(wchar_t c) { return c <= 0x20 || c == 0x3000 || c == 0x200b; }
  inline bool Kana(wchar_t c) { return (c >= 0x3041 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff); }

  // The drawn string is part of the line; ruby readings the stream carries inline (類たぐい for 類 with the reading
  // たぐい) may be left out of the drawn string, so short kana runs of the line may be skipped between characters.
  inline bool PartOf(const std::wstring &line, const std::wstring &drawn)
  {
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
        {
          j++;
          k++;
          gap = 0;
        }
        else if (Kana(line[k]) && gap < 12)
        {
          gap++;
          k++;
        }
        else
          break;
      }
      if (j == drawn.size())
        return true;
    }
    return false;
  }

  inline bool NearHeight(long a, long b) { return a > 0 && b > 0 && a - b <= 1 && b - a <= 1; }
  // One character drawn on its own under `height` (Lock held exclusive): walks the current line in order for that height;
  // three in a row teach the dialogue height (eight correct a height a name plate taught first).
  inline void Walk(wchar_t c, long height, long line)
  {
    if (height <= 0 || Current.empty())
      return;
    Run *r = nullptr;
    for (auto &x : Runs)
      if (x.height == height)
        r = &x;
    if (!r)
    {
      r = &Runs[0];
      for (auto &x : Runs)
        if (x.len < r->len)
          r = &x;
      *r = Run{height};
    }
    size_t next = std::wstring::npos;
    if (r->line == line && r->pos >= 0)
      for (size_t k = (size_t)r->pos + 1, skipped = 0; k < Current.size() && skipped <= 3; k++, skipped++)
        if (Current[k] == c)
        {
          next = k;
          break;
        }
    if (next != std::wstring::npos)
      r->len++;
    else
    {
      next = Current.find(c);
      r->len = next == std::wstring::npos ? 0 : 1;
    }
    r->line = line;
    r->pos = next == std::wstring::npos ? -1 : (long)next;
    if (DialogueHeight == 0 ? r->len >= LearnRun : (!NearHeight(height, DialogueHeight) && r->len >= RelearnRun))
      DialogueHeight = height;
  }

  // True when the string drawn now belongs to the selected dialogue line and must not be drawn.
  inline bool Skip(HDC hdc, const wchar_t *s, int n, const char *fn)
  {
    if (!Attached || !s || n <= 0)
      return false;
    int b = 0, e = n;
    while (b < e && Blank(s[b]))
      b++;
    while (e > b && Blank(s[e - 1]))
      e--;
    if (b >= e)
      return false;
    std::wstring drawn(s + b, e - b);
    DWORD now = GetTickCount();
    ThreadParam tp;
    bool hit = false, ruby = false;
    long line, height = 0;
    TEXTMETRICW tm;
    if (hdc && GetTextMetricsW(hdc, &tm))
      height = tm.tmHeight;
    AcquireSRWLockExclusive(&Lock);
    tp = Tp;
    line = Line;
    bool armed = now - LastFeed < ArmedFor;
    if (armed)
    {
      hit = (drawn.size() > 1 || now - LastFeed < SingleCharWindow) &&
            (PartOf(Current, drawn) || PartOf(Previous, drawn));
      if (drawn.size() == 1 && check_embed_able(tp))
        Walk(drawn[0], height, line);
      if (hit && drawn.size() >= 4 && DialogueHeight == 0 && height > 0)
        DialogueHeight = height;
      if (hit && drawn.size() < 4 && DialogueHeight > 0 && height > 0 && !NearHeight(height, DialogueHeight))
        hit = false; // a short string in another font: the name plate (or a menu item) naming someone the line mentions
      if (!hit && drawn.size() <= 10 && now - LastHide < RubyWindow && HiddenHeight > 0 &&
          std::all_of(drawn.begin(), drawn.end(), Kana))
        ruby = true;
    }
    ReleaseSRWLockExclusive(&Lock);
    if (Seen < 12 && now - LastFeed < ArmedFor)
    {
      Seen++;
      Msg::Log("MeguLit_GDIHIDE seen fn=%s n=%d first=%04x hit=%d ruby=%d on=%d", fn, (int)drawn.size(), (unsigned)drawn[0], (int)hit, (int)ruby, (int)check_embed_able(tp));
    }
    if (!armed || !(hit || ruby) || !check_embed_able(tp))
      return false;
    if (ruby && !(height > 0 && height * 10 < HiddenHeight * 7))
      return false;
    bool report = false;
    AcquireSRWLockExclusive(&Lock);
    LastHide = now;
    if (hit && height > 0)
      HiddenHeight = height;
    if (hit && Reported != line)
    {
      Reported = line;
      report = true;
    }
    ReleaseSRWLockExclusive(&Lock);
    if (report)
      Msg::Log("MeguLit_GDIHIDE hit fn=%s size=%ld n=%d", fn, height, (int)drawn.size());
    return true;
  }

  // Character blanking (E578 live: an engine that draws its dialogue from bitmap font atlases makes no GDI text call).
  // A per-character hook that reads its UTF-16 character straight from a stack argument hands the engine that very
  // character; when the host switched that stream on, the engine gets a blank of the same width instead, so it lays
  // the line out unchanged and draws nothing. ASCII stays (script markup such as ruby tags), controls stay.
  inline long BlankLine = -1;
  inline wchar_t BlankFor(wchar_t c)
  {
    if (c < 0x80 || c == 0x3000 || (c >= 0xd800 && c <= 0xdfff) || (c >= 0xfe00 && c <= 0xfe0f))
      return c;
    if (c >= 0xff61 && c <= 0xffdc)
      return L' ';
    return 0x3000;
  }
  // Called after Feed for the same character; returns the character to hand back to the engine.
  inline wchar_t BlankChar(wchar_t c)
  {
    wchar_t b = BlankFor(c);
    if (b == c)
      return c;
    bool report = false;
    AcquireSRWLockExclusive(&Lock);
    if (BlankLine != Line)
    {
      BlankLine = Line;
      report = Reported != Line;
      Reported = Line;
    }
    ReleaseSRWLockExclusive(&Lock);
    if (report)
      Msg::Log("MeguLit_GDIHIDE hit fn=charblank size=0 n=1");
    return b;
  }

  inline bool SkipA(HDC hdc, const char *s, int n, const char *fn)
  {
    if (!Attached || !s)
      return false;
    if (n < 0)
      n = (int)strlen(s);
    if (n <= 0)
      return false;
    UINT cp = commonsharedmem && commonsharedmem->codepage ? commonsharedmem->codepage : 932;
    int m = MultiByteToWideChar(cp, 0, s, n, nullptr, 0);
    if (m <= 0)
      return false;
    std::wstring w(m, L'\0');
    MultiByteToWideChar(cp, 0, s, n, &w[0], m);
    return Skip(hdc, w.c_str(), m, fn);
  }
}
