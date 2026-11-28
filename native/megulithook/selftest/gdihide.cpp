// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test for ..\MeguLitGdiHide.h outside a game: LunaHook's types are stubbed, the GDI side is a real memory DC.
// Replays the BRUNS flow seen in ダストマニア・グロテスク (libscr.dll builds the line with std::wstring::push_back, one
// UTF-16 character per hook call, then draws it with TextOutW into a DIB) and checks what may and may not be drawn.
// Build and run: run.cmd (prints PASS/FAIL per case, exit code = failures).
#include <windows.h>
#include <atomic>
#include <string>
#include <algorithm>
#include <cstdio>
#include <cstdint>
struct ThreadParam
{
  bool operator==(ThreadParam o) const { return processId == o.processId && addr == o.addr && ctx == o.ctx && ctx2 == o.ctx2; }
  DWORD processId;
  uint64_t addr, ctx, ctx2;
};
enum : uint64_t { CODEC_UTF16 = 1, CODEC_UTF32 = 2, CODEC_UTF8 = 4, EMBED_ABLE = 8 };
enum : uintptr_t { F_TextOutA = 1, F_TextOutW = 2, F_ExtTextOutA = 4, F_ExtTextOutW = 8, F_DrawTextA = 16, F_DrawTextW = 32, F_DrawTextExA = 64, F_DrawTextExW = 128 };
struct HookParam { uint64_t type; UINT codepage; };
struct TextBuffer { BYTE data[4096]; size_t size; };
struct CommonSharedMem { UINT codepage; };
CommonSharedMem shared{932}, *commonsharedmem = &shared;
static bool selected = true;
static int logs = 0, attached = 0;
bool check_embed_able(const ThreadParam &) { return selected; }
namespace Msg { void Log(const char *f, ...) { logs++; } }
void attachFunction(uintptr_t flags) { attached++; }
#include "../MeguLitGdiHide.h"

static int failures = 0;
static void Check(bool ok, const char *name)
{
  printf("%s %s\n", ok ? "PASS" : "FAIL", name);
  if (!ok)
    failures++;
}
static void FeedChars(const ThreadParam &tp, const wchar_t *s)
{
  HookParam hp{CODEC_UTF16, 0};
  for (; *s; s++)
  {
    TextBuffer b{};
    *(wchar_t *)b.data = *s;
    b.size = 2;
    MeguLitGdiHide::Feed(tp, hp, b);
  }
}
static HDC FontDC(int height)
{
  HDC dc = CreateCompatibleDC(nullptr);
  SelectObject(dc, CreateFontW(height, 0, 0, 0, 400, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, 0, 0, L"MS Gothic"));
  return dc;
}
static bool SkipW(HDC dc, const wchar_t *s) { return MeguLitGdiHide::Skip(dc, s, (int)wcslen(s), "TextOutW"); }
static std::string Sjis(const wchar_t *s, int n)
{
  char out[256];
  int m = WideCharToMultiByte(932, 0, s, n, out, sizeof out, nullptr, nullptr);
  return std::string(out, m > 0 ? m : 0);
}
// A hook that hands over the whole line at once in Shift-JIS (LunaHook's Ciel hook).
static void FeedSjis(const ThreadParam &tp, const wchar_t *s)
{
  HookParam hp{0, 932};
  std::string a = Sjis(s, (int)wcslen(s));
  TextBuffer b{};
  memcpy(b.data, a.data(), a.size());
  b.size = a.size();
  MeguLitGdiHide::Feed(tp, hp, b);
}
// One character per TextOutA call, as Ciel draws its text window and its name plate.
static bool CharA(HDC dc, wchar_t c)
{
  std::string a = Sjis(&c, 1);
  return MeguLitGdiHide::SkipA(dc, a.data(), (int)a.size(), "TextOutA");
}

int main()
{
  ThreadParam dialogue{1, 0x7000, 0x1011d000, 0};
  HDC body = FontDC(26), ruby = FontDC(12);
  Check(!SkipW(body, L"そう思って"), "nothing is hidden before the selected stream delivered text");
  FeedChars(dialogue, L"そう思って、耳を澄まそうとする。");
  Check(attached == 1, "GDI functions attached on the first delivered text");
  Check(SkipW(body, L"そう思って、耳を澄まそうとする。"), "the whole line drawn by TextOutW is hidden");
  Check(SkipW(body, L"耳を澄まそうとする。"), "a wrapped second row of the line is hidden");
  Check(SkipW(body, L"  そう思って、\x3000"), "padding blanks around the drawn text are ignored");
  Check(logs >= 2, "the first hidden string of the line is reported (armed + hit)");
  Check(SkipW(ruby, L"みみ"), "ruby (kana only, smaller font) right after the line is hidden");
  Check(!SkipW(body, L"みみ"), "kana in the body font that is not in the line stays");
  Check(!SkipW(body, L"セーブ"), "menu text that is not in the line stays");
  Check(!SkipW(body, L"   "), "blank strings pass through");
  Check(MeguLitGdiHide::SkipA(body, "\x82\xbb\x82\xa4\x8e\x76\x82\xc1\x82\xc4", -1, "TextOutA"), "Shift-JIS TextOutA of the line is hidden");
  Sleep(450);
  FeedChars(dialogue, L"次の行だ。");
  Check(SkipW(body, L"次の行だ。"), "the next line is hidden");
  Check(SkipW(body, L"そう思って、耳を澄まそうとする。"), "the previous line (still on the page) stays hidden");
  Sleep(450);
  FeedChars(dialogue, L"よく聴き知っている類たぐいの音だ。");
  Check(SkipW(body, L"よく聴き知っている類の音だ。"), "a line drawn without the inline ruby reading the stream carries is hidden");
  Check(SkipW(body, L"類"), "a ruby base drawn on its own is hidden");
  Check(SkipW(ruby, L"たぐい"), "its reading in the ruby font is hidden");
  Check(!SkipW(body, L"よく知らない音だ。"), "a different line with the same kana stays");
  selected = false;
  Check(!SkipW(body, L"次の行だ。"), "nothing is hidden once the host switches the stream off");
  selected = true;
  // E578 character blanking: the engine gets a same-width blank for every drawn character; markup and controls stay
  Check(MeguLitGdiHide::BlankChar(L'\x985e') == 0x3000, "a kanji becomes an ideographic space");
  Check(MeguLitGdiHide::BlankChar(L'\x3042') == 0x3000 && MeguLitGdiHide::BlankChar(L'\x3001') == 0x3000, "kana and punctuation become ideographic spaces");
  Check(MeguLitGdiHide::BlankChar(L'\xff71') == L' ', "a half-width katakana becomes a half-width space");
  Check(MeguLitGdiHide::BlankChar(L'&') == L'&' && MeguLitGdiHide::BlankChar(L'R') == L'R' && MeguLitGdiHide::BlankChar(L'\n') == L'\n', "ASCII script markup and line breaks stay");
  Sleep(450);
  FeedChars(dialogue, L"\x3042");
  int before = logs;
  MeguLitGdiHide::BlankChar(L'\x3042');
  MeguLitGdiHide::BlankChar(L'\x3044');
  Check(logs == before + 1, "the first blanked character of a new line is reported once");

  // 2026-11-29 名字框被一起隐藏 (群友, Ciel; 很多游戏都这样): the name plate is drawn through the same GDI calls in its own
  // font, and the name is often in the line (美咲ちゃんの…) or a single character of the line.
  // Whole-string engine (TextOutW per row, as BRUNS): name plate in a 20 px font, dialogue in 26 px.
  ThreadParam whole{1, 0x7100, 0x2000, 0};
  HDC plate = FontDC(20);
  Sleep(450);
  FeedChars(whole, L"「美咲も鷹也も、もう帰ろうよ」");
  Check(SkipW(body, L"「美咲も鷹也も、もう帰ろうよ」"), "whole strings: the line is hidden");
  Check(!SkipW(plate, L"美咲"), "whole strings: the name plate naming someone the line mentions keeps its name");
  Check(!SkipW(plate, L"鷹也"), "whole strings: another name of the line in the name plate font stays");
  Check(SkipW(body, L"美咲"), "whole strings: the same short piece in the dialogue font is hidden (a wrapped row)");
  Check(SkipW(plate, L"もう帰ろうよ」"), "whole strings: four or more characters of the line are hidden in any font");

  // Per-character engine (Ciel: the hook hands over the whole line in Shift-JIS, the engine draws one character per
  // TextOutA call): name plate 40 px, dialogue 48 px. The dialogue height is learned from the line walked in order.
  ThreadParam ciel{1, 0x43d1f7, 0, 0};
  HDC text48 = FontDC(48), name40 = FontDC(40);
  Sleep(450);
  FeedSjis(ciel, L"「そうそう、美咲ちゃんの言うとおりだよ」");
  const wchar_t *first = L"「そうそう、美咲ちゃんの言うとおりだよ」";
  CharA(name40, L'千'); // the speaker, not in the line
  CharA(name40, L'尋');
  bool all = true;
  for (const wchar_t *p = first; *p; p++)
    all = CharA(text48, *p) && all;
  Check(all, "one character per call: every character of the line is hidden");
  Sleep(450);
  FeedSjis(ciel, L"「美咲も鷹也も、もう帰ろうよ」");
  Check(!CharA(name40, L'美') && !CharA(name40, L'咲'), "one character per call: the name plate 美咲 stays although the line says 美咲");
  Check(!CharA(name40, L'鷹') && !CharA(name40, L'也'), "one character per call: the name plate 鷹也 stays");
  all = true;
  for (const wchar_t *p = L"「美咲も鷹也も、もう帰ろうよ」"; *p; p++)
    all = CharA(text48, *p) && all;
  Check(all, "one character per call: the next line is hidden, its names included");
  Check(CharA(text48, L'言'), "one character per call: the previous line (still on the page) stays hidden");
  printf("%d failure(s)\n", failures);
  return failures;
}
