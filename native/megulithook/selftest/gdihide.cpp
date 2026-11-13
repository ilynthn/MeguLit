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
  printf("%d failure(s)\n", failures);
  return failures;
}
