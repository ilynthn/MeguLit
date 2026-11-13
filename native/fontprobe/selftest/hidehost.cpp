// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test for the glyph hide in MeguLitFont<bit>.dll without a game and without a window: plays HookBridge (serves
// both pipes, pushes a line), then draws that line and some menu text through every covered path into an off-screen
// DIB and checks which pixels appear. Usage: hidehost.exe <path to MeguLitFont dll>
// The DLL must export MeguLitFontVersion() >= 2 (glyph hide). A machine without any Japanese font (CI runners) only
// gets the version check and prints SKIP for the drawing part.
#include <windows.h>
#include <gdiplus.h>
#include <d2d1.h>
#include <dwrite.h>
#include <stdio.h>
#include <string>
#include <vector>
static std::string Got;
static HANDLE Ctl = INVALID_HANDLE_VALUE;
static int Failed = 0;
static void Check(bool ok, const char *what) { printf("%s %s\n", ok ? "ok  " : "FAIL", what); if (!ok) Failed++; }
DWORD WINAPI Listen(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFont-%lu", GetCurrentProcessId());
 HANDLE p = CreateNamedPipeW(name, PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE, 1, 0, 65536, 0, NULL);
 if (p == INVALID_HANDLE_VALUE || !ConnectNamedPipe(p, NULL) && GetLastError() != ERROR_PIPE_CONNECTED) return 1;
 char buf[4096]; DWORD n; while (ReadFile(p, buf, sizeof buf, &n, NULL) && n) Got.append(buf, n);
 return 0;
}
static void Push(const char *utf8) { std::string l = std::string(utf8) + "\n"; DWORD done = 0; WriteFile(Ctl, l.data(), (DWORD)l.size(), &done, NULL); Sleep(150); }
static const int W = 1000, H = 80;
static HDC Dc; static DWORD *Bits; static HBITMAP Bmp; static const wchar_t *Face = L"MS Gothic";
static void Clear() { for (int i = 0; i < W * H; i++) Bits[i] = 0xffffffff; GdiFlush(); }
static int Ink() { GdiFlush(); int n = 0; for (int i = 0; i < W * H; i++) if ((Bits[i] & 0xff) < 128) n++; return n; }
static bool AnyBits(const std::vector<BYTE> &b) { for (BYTE x : b) if (x) return true; return false; }
static std::vector<BYTE> Glyph(wchar_t c, UINT format, GLYPHMETRICS *out = NULL) {
 MAT2 m = {{0, 1}, {0, 0}, {0, 0}, {0, 1}}; GLYPHMETRICS gm{}; DWORD n = GetGlyphOutlineW(Dc, c, format, &gm, 0, NULL, &m);
 std::vector<BYTE> b(n == GDI_ERROR || !n ? 0 : n); if (!b.empty()) GetGlyphOutlineW(Dc, c, format, &gm, n, b.data(), &m); if (out) *out = gm; return b;
}
static bool SameMetrics(const GLYPHMETRICS &a, const GLYPHMETRICS &b) { return a.gmBlackBoxX == b.gmBlackBoxX && a.gmBlackBoxY == b.gmBlackBoxY && a.gmptGlyphOrigin.x == b.gmptGlyphOrigin.x && a.gmptGlyphOrigin.y == b.gmptGlyphOrigin.y && a.gmCellIncX == b.gmCellIncX; }
static bool Collapsed(const std::vector<BYTE> &b) {
 const BYTE *p = b.data(), *end = p + b.size(); bool any = false;
 while (p + sizeof(TTPOLYGONHEADER) <= end) { auto *h = (const TTPOLYGONHEADER *)p; if (h->cb < sizeof(TTPOLYGONHEADER) || p + h->cb > end) return false; const BYTE *q = p + sizeof(TTPOLYGONHEADER), *e = p + h->cb;
  while (q + 4 <= e) { auto *c = (const TTPOLYCURVE *)q; for (WORD i = 0; i < c->cpfx; i++) { any = true; if (memcmp(&c->apfx[i], &h->pfxStart, sizeof(POINTFX))) return false; } q += 4 + sizeof(POINTFX) * c->cpfx; }
  p += h->cb; }
 return any;
}
int wmain(int argc, wchar_t **argv) {
 if (argc < 2) return 2;
 // gdiplus, dwrite and d2d1 are loaded first, as in a game that uses them: the probe hooks them on its next pass.
 ULONG_PTR token; Gdiplus::GdiplusStartupInput in; Gdiplus::GdiplusStartup(&token, &in, NULL);
 ID2D1Factory *d2 = NULL; D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &d2); IDWriteFactory *dw = NULL; DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), (IUnknown **)&dw);
 CreateThread(NULL, 0, Listen, NULL, 0, NULL);
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFontCtl-%lu", GetCurrentProcessId());
 Ctl = CreateNamedPipeW(name, PIPE_ACCESS_OUTBOUND, PIPE_TYPE_BYTE, 1, 65536, 0, 0, NULL);
 Sleep(100);
 HMODULE dll = LoadLibraryW(argv[1]); if (!dll) { printf("load failed\n"); return 3; }
 typedef DWORD(__cdecl * VER)(); VER ver = (VER)GetProcAddress(dll, "MeguLitFontVersion"); DWORD version = ver ? ver() : 0;
 Check(version >= 2 && GetProcAddress(dll, "MeguLitFontVersionTag"), "exports MeguLitFontVersion >= 2 (glyph hide)"); printf("version %lu\n", version);
 if (!version) { printf("FAIL old DLL\n"); return 5; }
 if (!ConnectNamedPipe(Ctl, NULL) && GetLastError() != ERROR_PIPE_CONNECTED) { printf("control pipe not connected\n"); return 4; }
 Sleep(1500); // late hooks (GDI+, DirectWrite, Direct2D) run once a second
 BITMAPINFO bi{}; bi.bmiHeader = {sizeof(BITMAPINFOHEADER), W, -H, 1, 32, BI_RGB};
 Dc = CreateCompatibleDC(NULL); Bmp = CreateDIBSection(Dc, &bi, DIB_RGB_COLORS, (void **)&Bits, NULL, 0); SelectObject(Dc, Bmp);
 bool japanese = false;
 for (const wchar_t *f : {L"MS Gothic", L"Yu Gothic", L"Meiryo", L"MS Mincho"}) {
  HFONT probe = CreateFontW(-28, 0, 0, 0, 400, 0, 0, 0, DEFAULT_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, f); HGDIOBJ old = SelectObject(Dc, probe); wchar_t got[64] = {}; GetTextFaceW(Dc, 64, got); WORD gi = 0xffff; GetGlyphIndicesW(Dc, L"猫", 1, &gi, GGI_MARK_NONEXISTING_GLYPHS); SelectObject(Dc, old); DeleteObject(probe);
  if (!_wcsicmp(got, f) && gi != 0xffff) { Face = f; japanese = true; break; } }
 if (!japanese) { printf("SKIP drawing checks: no Japanese font on this machine\n"); printf(Failed ? "FAIL %d\n" : "PASS\n", Failed); return Failed ? 1 : 0; }
 printf("font %ls\n", Face);
 HFONT dialogue = CreateFontW(-28, 0, 0, 0, 400, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, Face);
 HFONT menu = CreateFontW(-16, 0, 0, 0, 400, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, ANTIALIASED_QUALITY, 0, Face);
 SetBkMode(Dc, TRANSPARENT); SetTextColor(Dc, 0);
 const wchar_t *line = L"吾輩は猫である。名前はまだ無い。";
 SelectObject(Dc, dialogue);
 GLYPHMETRICS ref{}; std::vector<BYTE> before = Glyph(L'猫', GGO_GRAY8_BITMAP, &ref);
 Check(AnyBits(before), "before any line: the glyph has pixels");

 Push("LINE 吾輩は猫である。名前はまだ無い。");
 for (const wchar_t *c = line; *c; c++) Glyph(*c, GGO_GRAY8_BITMAP); // first pass learns the dialogue font
 bool blank = true; GLYPHMETRICS gm{};
 for (const wchar_t *c = line; *c; c++) { GLYPHMETRICS g{}; auto b = Glyph(*c, GGO_GRAY8_BITMAP, &g); if (*c == L'猫') gm = g; blank = blank && !AnyBits(b); }
 Check(blank, "GetGlyphOutlineW, dialogue font, the line again: every glyph blank");
 Check(SameMetrics(ref, gm), "blank glyph keeps its metrics (black box, origin, advance)");
 Check(Collapsed(Glyph(L'猫', GGO_NATIVE)), "GGO_NATIVE outline collapsed to a point");
 Check(AnyBits(Glyph(L'セ', GGO_GRAY8_BITMAP)), "a character not in the line, dialogue font: drawn");
 SelectObject(Dc, menu);
 Check(AnyBits(Glyph(L'猫', GGO_GRAY8_BITMAP)), "the same character in the menu size: drawn");
 SelectObject(Dc, dialogue);
 { std::vector<WORD> gi(32); GetGlyphIndicesW(Dc, L"猫", 1, gi.data(), 0); MAT2 m = {{0, 1}, {0, 0}, {0, 0}, {0, 1}}; GLYPHMETRICS g{};
  DWORD n = GetGlyphOutlineW(Dc, gi[0], GGO_GRAY8_BITMAP | GGO_GLYPH_INDEX, &g, 0, NULL, &m); std::vector<BYTE> b(n); GetGlyphOutlineW(Dc, gi[0], GGO_GRAY8_BITMAP | GGO_GLYPH_INDEX, &g, n, b.data(), &m);
  Check(n && !AnyBits(b), "GGO_GLYPH_INDEX of a line character: blank"); }

 Clear(); ExtTextOutW(Dc, 0, 10, 0, NULL, line, (UINT)wcslen(line), NULL); Check(Ink() == 0, "ExtTextOutW of the line: not drawn");
 Clear(); ExtTextOutW(Dc, 0, 10, 0, NULL, L"セーブ　ロード", 7, NULL); Check(Ink() > 50, "ExtTextOutW of a menu string: drawn");
 Clear(); { RECT r = {0, 0, 300, 60}; SetBkColor(Dc, RGB(0, 0, 0)); ExtTextOutW(Dc, 0, 10, ETO_OPAQUE, &r, line, (UINT)wcslen(line), NULL); SetBkColor(Dc, RGB(255, 255, 255)); Check(Ink() == 300 * 60, "ETO_OPAQUE: background still filled, text left out"); }
 Clear(); { std::vector<WORD> gi(wcslen(line)); GetGlyphIndicesW(Dc, line, (int)gi.size(), gi.data(), 0); ExtTextOutW(Dc, 0, 10, ETO_GLYPH_INDEX, NULL, (LPCWSTR)gi.data(), (UINT)gi.size(), NULL); Check(Ink() == 0, "ExtTextOutW with ETO_GLYPH_INDEX: not drawn"); }
 Clear(); { const char sj[] = "\x8c\xe1\x94\x79\x82\xcd\x94\x4c\x82\xc5\x82\xa0\x82\xe9\x81\x42"; TextOutA(Dc, 0, 10, sj, (int)strlen(sj)); Check(Ink() == 0, "TextOutA (Shift-JIS) of part of the line: not drawn"); }
 Clear(); for (int i = 0; line[i]; i++) TextOutW(Dc, i * 28, 10, line + i, 1); Check(Ink() == 0, "TextOutW one character at a time: not drawn");
 SelectObject(Dc, menu); Clear(); TextOutW(Dc, 0, 10, L"猫", 1); Check(Ink() > 10, "TextOutW of one line character in the menu font: drawn"); SelectObject(Dc, dialogue);

 { using namespace Gdiplus; GpGraphics *g = NULL; DllExports::GdipCreateFromHDC(Dc, &g); GpFontFamily *fam = NULL; DllExports::GdipCreateFontFamilyFromName(Face, NULL, &fam); GpFont *font = NULL; DllExports::GdipCreateFont(fam, 28, FontStyleRegular, UnitPixel, &font); GpSolidFill *brush = NULL; DllExports::GdipCreateSolidFill(0xff000000, &brush); RectF rc(0, 0, (REAL)W, (REAL)H);
  Clear(); DllExports::GdipDrawString(g, line, -1, font, &rc, NULL, brush); DllExports::GdipFlush(g, FlushIntentionSync); Check(Ink() == 0, "GdipDrawString of the line: not drawn");
  Clear(); DllExports::GdipDrawString(g, L"セーブ　ロード", -1, font, &rc, NULL, brush); DllExports::GdipFlush(g, FlushIntentionSync); Check(Ink() > 50, "GdipDrawString of a menu string: drawn");
  DllExports::GdipDeleteBrush(brush); DllExports::GdipDeleteFont(font); DllExports::GdipDeleteFontFamily(fam); DllExports::GdipDeleteGraphics(g); }

 { D2D1_RENDER_TARGET_PROPERTIES props = D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_DEFAULT, D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE));
  ID2D1DCRenderTarget *rt = NULL; d2->CreateDCRenderTarget(&props, &rt); RECT r = {0, 0, W, H}; IDWriteTextFormat *format = NULL; dw->CreateTextFormat(Face, NULL, DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL, 28, L"ja-jp", &format);
  ID2D1SolidColorBrush *brush = NULL; D2D1_RECT_F box = D2D1::RectF(0, 0, (FLOAT)W, (FLOAT)H);
  auto draw = [&](const wchar_t *text, bool layout) { Clear(); rt->BindDC(Dc, &r); rt->BeginDraw(); if (!brush) rt->CreateSolidColorBrush(D2D1::ColorF(0, 0, 0), &brush);
   if (layout) { IDWriteTextLayout *l = NULL; dw->CreateTextLayout(text, (UINT32)wcslen(text), format, (FLOAT)W, (FLOAT)H, &l); rt->DrawTextLayout(D2D1::Point2F(0, 0), l, brush); rt->EndDraw(); l->Release(); }
   else { rt->DrawText(text, (UINT32)wcslen(text), format, box, brush); rt->EndDraw(); } return Ink(); };
  Check(draw(line, false) == 0, "ID2D1RenderTarget::DrawText of the line: not drawn");
  Check(draw(L"セーブ　ロード", false) > 50, "ID2D1RenderTarget::DrawText of a menu string: drawn");
  Check(draw(line, true) == 0, "ID2D1RenderTarget::DrawTextLayout of the line: not drawn");
  Check(draw(L"セーブ　ロード", true) > 50, "ID2D1RenderTarget::DrawTextLayout of a menu string: drawn");
  if (brush) brush->Release(); format->Release(); rt->Release(); }

 Push("OFF");
 Check(AnyBits(Glyph(L'猫', GGO_GRAY8_BITMAP)), "after OFF: the line's glyph is drawn again");
 Clear(); ExtTextOutW(Dc, 0, 10, 0, NULL, line, (UINT)wcslen(line), NULL); Check(Ink() > 50, "after OFF: ExtTextOutW of the line drawn again");
 Push("LINE どこで生れたかとんと見当がつかぬ。");
 { char seed[96]; sprintf_s(seed, "FONT 28 %ls", Face); Push(seed); }
 Push("LINE 何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。");
 Check(!AnyBits(Glyph(L'何', GGO_GRAY8_BITMAP)), "FONT seed: the very first glyph of a line is blank");
 Sleep(1500);
 printf("%s", Got.c_str());
 Check(Got.find("ToMe_GLYPHHIDE hit path=ggo size=28") != std::string::npos, "first hidden glyph reported");
 Check(Got.find("ToMe_GLYPHHIDE ready version=2") != std::string::npos, "control connection answered with the version");
 Check(Got.find("ToMe_FONT status d2d1 hooked text") != std::string::npos && Got.find("layout") != std::string::npos, "Direct2D and DirectWrite layout hooks installed");
 printf(Failed ? "FAIL %d\n" : "PASS\n", Failed); return Failed ? 1 : 0;
}
