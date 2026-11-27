// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitFont32/64.dll: which font does the game really draw its Japanese text with? (user, 2026-11-13: 自动读内存来导入游戏字体)
// Loaded by HookBridge into every bound game (all engines). The probe part is read-only: every hook calls the original.
//  - font creation: CreateFontIndirectA/W, CreateFontA (the A face is decoded as CP932 first, so a Japanese game on a
//    Chinese system does not report a CP936-garbled name), GDI+ GdipCreateFontFamilyFromName;
//  - drawing: ExtTextOutA/W, TextOutA/W, GetGlyphOutlineA/W, GdipDrawString count Japanese characters per font that is
//    selected while they are drawn; the font with the most characters is the one that draws the dialogue;
//  - DirectWrite: IDWriteFactory::CreateTextFormat (family, size, weight) when the game already loaded dwrite.dll;
//  - private fonts: AddFontMemResourceEx and GdipPrivateAddMemoryFont data is copied to
//    <MeguLit>\cache\font-probe\<game key>\mem-<hash>.ttf; AddFontResourceExA/W, GdipPrivateAddFontFile and
//    IDWriteFactory::CreateFontFileReference outside the Windows font folder report the file path.
//  - glyph hide (GlyphMatch.h, user 2026-11-14: 为什么不能不适配就替换): HookBridge pushes the dialogue line its generic
//    text hook just read over \\.\pipe\MeguLitFontCtl-<pid>; while it is current, the game's own drawing of that line is
//    left out at the layer every engine shares: GetGlyphOutlineA/W returns a blank glyph with unchanged metrics (bitmap
//    formats zeroed, outlines collapsed to one point), TextOutA/W and ExtTextOutA/W (glyph-index strings too) skip the
//    string but keep the opaque background and the current position, GdipDrawString / GdipDrawDriverString and
//    ID2D1RenderTarget::DrawText / DrawTextLayout skip it. Nothing is hidden before a line is pushed, nothing once the
//    pushes stop (60 s) or OFF arrives; menus and names (other sizes, other characters) are never touched.
// Lines to HookBridge over \\.\pipe\MeguLitFont-<pid>:
//   ToMe_FONT src=gdi|gdip|dwrite size=<px> weight=<100..900> chars=<n> face=<face>
//   ToMe_FONTFILE kind=mem|file path=<utf-8 path>
//   ToMe_GLYPHHIDE hit path=ggo|text|gdip|d2d size=<px> seq=<n>        first hidden draw of a line
//   ToMe_GLYPHHIDE key size=<px> face=<face> | line seq=.. chars=.. placed=.. hidden=.. requested=.. repeat=.. missing=..
//   ToMe_GLYPHHIDE cache seq=<n> missing=<a> of <b>                    the engine reuses rasterised glyphs: hiding stopped
// Commands from HookBridge, one per line (UTF-8): LINE <text> | FONT <px> <face> | OFF
// Version (exported, checked by Build.ps1 / validation so a stale DLL never ships): MeguLitFontVersion() and the tag string
// MeguLitFontVersionTag "MeguLitFont version=<n>"; 2 = glyph hide, 3 = glyph dots. On each control connection the DLL
// answers "ToMe_GLYPHHIDE ready version=<n> modes=blank,dot" so HookBridge knows the hide side is really there.
//  - glyph dots (version 3, docs/text-architecture.md, "MODE dot" from HookBridge): instead of leaving the line out, every
//    matched glyph is replaced by a dot glyph with unchanged metrics (advance, black box, origin, buffer size), so
//    layout, wrapping and pacing stay the game's own; its only coverage is a DotSide x DotSide full-coverage square at
//    the top-left corner of the glyph's black box (clipped to it). String paths (TextOut/ExtTextOut, GDI+, Direct2D)
//    draw the same squares in the text colour/brush. Every served dot is reported once per line:
//      ToMe_GLYPHDOT line seq=<n> text=<line, blanks removed>
//      ToMe_GLYPHDOT dots seq=<n> path=<ggo|text|gdip|d2d|run> list=<i>:<hex>:<h>:<b>:<a>:<x>:<y>:<s>:<k>;...
//      ToMe_GLYPHDOT cache seq=<n> missing=<a> of <b>   the engine reuses rasterised (dot) glyphs: reported, dots go on
//    "MODE blank" (default) is the version 2 blank glyph, kept as the fallback.
#include <windows.h>
#include <dwrite.h>
#include <d2d1.h>
#include <string>
#include <deque>
#include <vector>
#include <map>
#include <set>
#include <algorithm>
#include "../shared/minhook/include/MinHook.h"
#include "GlyphMatch.h"

#define MEGULIT_FONT_VERSION 3
extern "C" __declspec(dllexport) const char MeguLitFontVersionTag[] = "MeguLitFont version=3";
extern "C" __declspec(dllexport) DWORD __cdecl MeguLitFontVersion() { return MEGULIT_FONT_VERSION; }
namespace {
HMODULE Self; CRITICAL_SECTION Gate; HANDLE Wake; std::deque<std::string> Out; wchar_t Dir[1024];

std::string Utf8(const std::wstring &w) { if (w.empty()) return ""; int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), NULL, 0, NULL, NULL); std::string s(n, 0); WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, NULL, NULL); return s; }
std::wstring Wide(const std::string &s) { if (s.empty()) return L""; int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), NULL, 0); std::wstring w(n > 0 ? n : 0, 0); if (n > 0) MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], n); return w; }
void Send(const std::string &line) { EnterCriticalSection(&Gate); if (Out.size() < 256) Out.push_back(line); LeaveCriticalSection(&Gate); SetEvent(Wake); }
// A game's ANSI face name is in its own code page: Japanese games use 932 whatever the system code page is.
std::wstring Ansi(const char *s, int len = -1) {
 if (!s) return L""; for (UINT cp : {932u, (UINT)CP_ACP}) { int n = MultiByteToWideChar(cp, MB_ERR_INVALID_CHARS, s, len, NULL, 0); if (n <= 0) continue; std::wstring w(n, 0); MultiByteToWideChar(cp, MB_ERR_INVALID_CHARS, s, len, &w[0], n); while (!w.empty() && !w.back()) w.pop_back(); return w; }
 return L"";
}
// The game's own ANSI text (glyph codes carry the lead byte in the high byte): Shift-JIS first, then the system code page.
std::wstring GameText(const char *s, int n) { if (!s || n <= 0 || n > 8192) return L""; for (UINT cp : {932u, (UINT)CP_ACP}) { int m = MultiByteToWideChar(cp, MB_ERR_INVALID_CHARS, s, n, NULL, 0); if (m <= 0) continue; std::wstring w(m, 0); MultiByteToWideChar(cp, MB_ERR_INVALID_CHARS, s, n, &w[0], m); return w; } return L""; }
std::wstring Clean(std::wstring f) { if (!f.empty() && f[0] == L'@') f.erase(0, 1); size_t z = f.find(L'\0'); if (z != std::wstring::npos) f.resize(z); return f; }
bool Japanese(wchar_t c) { return (c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xff01 && c <= 0xff5e) || c == 0x3001 || c == 0x3002 || c == 0x300c || c == 0x300d; }
int CountW(const wchar_t *s, int n) { if (!s || n <= 0 || n > 4096) return 0; int k = 0; for (int i = 0; i < n; i++) if (Japanese(s[i])) k++; return k; }
int CountA(const char *s, int n) { if (!s || n <= 0 || n > 8192) return 0; int k = 0; for (int i = 0; i < n; i++) { unsigned char b = (unsigned char)s[i]; if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)) { k++; i++; } } return k; }

// ---- which font draws ----------------------------------------------------------------------------------------------
struct Face { std::wstring name; int size, weight; };
std::map<HFONT, Face> AnsiFonts; // fonts created through an A function: their decoded name
struct Score { std::string src; Face face; long long chars; };
std::vector<Score> Scores; std::string Reported; DWORD LastReport;
void Count(const char *src, const Face &f, int chars) {
 if (chars <= 0 || f.name.empty() || f.name.size() > 63) return;
 EnterCriticalSection(&Gate);
 bool hit = false; for (auto &s : Scores) if (s.src == src && s.face.name == f.name && s.face.size == f.size && s.face.weight == f.weight) { s.chars += chars; hit = true; break; }
 if (!hit && Scores.size() < 64) Scores.push_back({src, f, chars});
 LeaveCriticalSection(&Gate);
}
Face FaceOf(HDC dc) {
 Face f{L"", 0, 400}; HFONT font = (HFONT)GetCurrentObject(dc, OBJ_FONT); if (!font) return f;
 LOGFONTW lf{}; if (GetObjectW(font, sizeof lf, &lf)) { f.name = Clean(lf.lfFaceName); f.size = lf.lfHeight < 0 ? -lf.lfHeight : lf.lfHeight; f.weight = lf.lfWeight ? lf.lfWeight : 400; }
 EnterCriticalSection(&Gate); auto it = AnsiFonts.find(font); if (it != AnsiFonts.end()) f.name = it->second.name; LeaveCriticalSection(&Gate);
 if (f.name.empty()) { wchar_t real[LF_FACESIZE] = {}; if (GetTextFaceW(dc, LF_FACESIZE, real) > 0) f.name = Clean(real); } // fonts whose LOGFONT carries no face name (seen in AdvHD and YU-RIS)
 if (f.size == 0) { TEXTMETRICW tm{}; if (GetTextMetricsW(dc, &tm)) f.size = tm.tmHeight - tm.tmInternalLeading; }
 return f;
}

// ---- glyph hide state: GlyphMatch.h decides, HideLock guards it (never taken while holding Gate) ------------------------
// DotMode: per-character records are reported (every MODE since spec 3). PaintDots: matched glyphs become dots (MODE dot*);
// otherwise (MODE blank*, alias place*) blank glyphs (same metrics, no coverage) plus records with the cell origin on
// screen, for the reader overlay that draws MeguLit's text where the game's would be (docs/text-architecture.md, "Placement").
SRWLOCK HideLock = SRWLOCK_INIT; GlyphHide::Matcher Hide; GlyphHide::RasterVerdict Raster; volatile LONG MarkArmed = 0; volatile LONG HideOn = 0, DotMode = 0, PaintDots = 0, CtlConnected = 0, MarkOn = 0; long MarkLast = 0;
struct IndexMap { HFONT font = NULL; long seq = -1; std::map<WORD, wchar_t> map; } Indexes;
GlyphHide::Key KeyOf(const Face &f) { GlyphHide::Key k; k.face = f.name; k.size = f.size; return k; }
void AnnounceLine(long seq, const std::wstring &text);
// Extra lines (spec 3, records 4): the name plate (EXTRA n) and the choices on screen (EXTRA o, one per item), pushed by
// HookBridge when the front end asks for them. Only whole-string draws (TextOut/ExtTextOut/DrawText, GDI+, Direct2D)
// are matched against them: those report a position, so the reader overlay can draw what was blanked. A glyph-by-glyph
// engine (GetGlyphOutline) gives no position, so its names and choices are left alone. Ids count from 1 on their own.
// Guarded by HideLock.
struct Extra { long id; char kind; std::wstring text; DWORD at; };
std::vector<Extra> Extras; long ExtraSeq = 0;
std::wstring Stripped(const std::wstring &s) { std::wstring t; for (wchar_t c : s) if (!GlyphHide::Blank(c)) t += c; return t; }
// A drawn string that is an extra line or a part of it (two characters or more, or the whole extra): one Served per
// non-blank character (index into the extra's text, kind n / o); seq = the extra's id.
bool ExtraMatch(const std::wstring &s, std::vector<GlyphHide::Served> *sv, long *seq) {
 std::vector<size_t> at; std::wstring t; for (size_t i = 0; i < s.size(); i++) if (!GlyphHide::Blank(s[i])) { t += s[i]; at.push_back(i); }
 if (t.empty()) return false; DWORD now = GetTickCount();
 for (auto e = Extras.rbegin(); e != Extras.rend(); ++e) {
  if (now - e->at > 60000) continue; size_t f = e->text.find(t); if (f == std::wstring::npos || (t.size() < 2 && t != e->text)) continue;
  if (sv) { sv->assign(s.size(), GlyphHide::Served{}); for (size_t j = 0; j < at.size(); j++) (*sv)[at[j]] = GlyphHide::Served{(int)(f + j), e->kind}; }
  if (seq) *seq = e->id; return true; }
 return false;
}
void Command(std::string l) {
 while (!l.empty() && (l.back() == '\r' || l.back() == '\n')) l.pop_back();
 AcquireSRWLockExclusive(&HideLock);
 long announce = -1; std::wstring text; std::string extra;
 if (l.rfind("LINE ", 0) == 0) { long before = Hide.Sequence(); Hide.SetLine(Wide(l.substr(5)), GetTickCount()); if (Hide.Sequence() != before) Raster.NextLine(Hide.Current()); InterlockedExchange(&HideOn, Hide.Cached() ? 0 : 1); if (DotMode && Hide.Sequence() != before) { announce = Hide.Sequence(); text = Hide.Current(); } }
 else if (l == "OFF") { Hide.Off(); Extras.clear(); InterlockedExchange(&HideOn, 0); }
 else if (l == "MODE dot" || l == "MODE blank" || l == "MODE dot-blind" || l == "MODE blank-blind" || l == "MODE place" || l == "MODE place-blind") {
  bool report = true, paint = l.rfind("MODE dot", 0) == 0;
  Hide.StopOnCache = !report; InterlockedExchange(&PaintDots, paint ? 1 : 0); InterlockedExchange(&DotMode, report ? 1 : 0); }
 else if ((l.rfind("EXTRA n ", 0) == 0 || l.rfind("EXTRA o ", 0) == 0) && l.size() > 8) { char k = l[6]; std::wstring t = Stripped(Wide(l.substr(8)));
  if (!t.empty() && t.size() <= 200) { if (k == 'n') Extras.erase(std::remove_if(Extras.begin(), Extras.end(), [](const Extra &e) { return e.kind == 'n'; }), Extras.end());
   if (Extras.size() >= 16) Extras.erase(Extras.begin()); Extras.push_back(Extra{++ExtraSeq, k, t, GetTickCount()}); extra = "ToMe_GLYPHDOT extra id=" + std::to_string(ExtraSeq) + " kind=" + std::string(1, k) + " text=" + Utf8(t); } }
 else if (l == "MARK on" || l == "MARK off") { InterlockedExchange(&MarkArmed, l == "MARK on" ? 1 : 0); InterlockedExchange(&MarkOn, 0); MarkLast = -1; } // two lines, once the engine is known to rasterise again
 else if (l == "EXTRA-CLEAR n" || l == "EXTRA-CLEAR o") { char k = l[12]; Extras.erase(std::remove_if(Extras.begin(), Extras.end(), [k](const Extra &e) { return e.kind == k; }), Extras.end()); }
 else if (l.rfind("FONT ", 0) == 0) { size_t sp = l.find(' ', 5); if (sp != std::string::npos) { GlyphHide::Key k; k.size = atoi(l.substr(5, sp - 5).c_str()); k.face = Clean(Wide(l.substr(sp + 1))); Hide.Seed(k); } }
 ReleaseSRWLockExclusive(&HideLock);
 if (!extra.empty()) Send(extra);
 if (announce >= 0) AnnounceLine(announce, text); // dot mode: the line (and how many dots to expect) before the game draws it
}
DWORD WINAPI Control(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFontCtl-%lu", GetCurrentProcessId());
 for (;;) {
  HANDLE p = CreateFileW(name, GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL); if (p == INVALID_HANDLE_VALUE) { Sleep(1000); continue; }
  Send("ToMe_GLYPHHIDE ready version=" + std::to_string(MEGULIT_FONT_VERSION) + " modes=blank,dot,place records=4"); InterlockedExchange(&CtlConnected, 1);
  std::string buf; char chunk[4096]; DWORD n = 0;
  while (ReadFile(p, chunk, sizeof chunk, &n, NULL) && n) { buf.append(chunk, n); size_t e; while ((e = buf.find('\n')) != std::string::npos) { Command(buf.substr(0, e)); buf.erase(0, e + 1); } if (buf.size() > 65536) buf.clear(); }
  CloseHandle(p); InterlockedExchange(&CtlConnected, 0); Command("OFF"); Sleep(500); // HookBridge gone: nothing stays hidden
 }
}
// Glyph index -> character of the current or previous line under the font selected in dc. Called under HideLock.
wchar_t FromIndex(HDC dc, UINT g) {
 HFONT font = (HFONT)GetCurrentObject(dc, OBJ_FONT);
 if (font != Indexes.font || Hide.Sequence() != Indexes.seq) {
  Indexes.font = font; Indexes.seq = Hide.Sequence(); Indexes.map.clear();
  std::wstring text = Hide.Current() + Hide.Previous(); std::vector<WORD> out(text.size() + 1);
  if (!text.empty() && GetGlyphIndicesW(dc, text.c_str(), (int)text.size(), out.data(), GGI_MARK_NONEXISTING_GLYPHS) != GDI_ERROR)
   for (size_t i = 0; i < text.size(); i++) if (out[i] != 0xffff) Indexes.map.emplace(out[i], text[i]);
 }
 auto it = Indexes.map.find((WORD)g); return it == Indexes.map.end() ? 0 : it->second;
}
void AfterDecision() { if (Hide.Cached()) InterlockedExchange(&HideOn, 0); }
// Legacy blind-mode spellings are accepted, but every hidden glyph must match the pushed dialogue line.
// One glyph; dc may be NULL when c is already a character. sv/seq/ch (optional): what was served, for the dot report.
bool DotsBlocked();
bool HideGlyph(HDC dc, UINT c, bool index, const Face &f, bool render, GlyphHide::Served *sv = NULL, long *seq = NULL, wchar_t *chOut = NULL) {
 if (DotsBlocked()) return false;
 AcquireSRWLockExclusive(&HideLock);
 wchar_t ch = index ? FromIndex(dc, c) : (wchar_t)c;
 bool r = ch && Hide.Glyph(ch, KeyOf(f), GetTickCount(), render, "ggo", sv); AfterDecision();
 // A font seed or a live pipe cannot identify dialogue: unmatched title/menu glyphs keep their pixels.
 if (seq) *seq = Hide.Sequence(); if (chOut) *chOut = ch;
 ReleaseSRWLockExclusive(&HideLock); return r;
}
bool HideText(const std::wstring &s, const Face &f, const char *path, std::vector<GlyphHide::Served> *sv = NULL, long *seq = NULL) {
 if (s.empty() || DotsBlocked()) return false;
 AcquireSRWLockExclusive(&HideLock); bool r = Hide.Text(s, KeyOf(f), GetTickCount(), path, sv); AfterDecision(); long xid = 0;
 if (!r && DotMode && !Extras.empty() && ExtraMatch(s, sv, &xid)) { if (seq) *seq = xid; ReleaseSRWLockExclusive(&HideLock); return true; }
 if (seq) *seq = Hide.Sequence(); ReleaseSRWLockExclusive(&HideLock); return r;
}
std::wstring FromIndices(HDC dc, const WORD *g, UINT n) {
 std::wstring w; if (!g || !n || n > 4096) return w;
 AcquireSRWLockExclusive(&HideLock); for (UINT i = 0; i < n; i++) { wchar_t c = FromIndex(dc, g[i]); if (!c) { w.clear(); break; } w += c; } ReleaseSRWLockExclusive(&HideLock);
 return w;
}
// Blank glyph with the same metrics: bitmaps zeroed, outlines collapsed onto their start point (zero area).
void Collapse(void *buffer, DWORD size) {
 BYTE *p = (BYTE *)buffer, *end = p + size;
 while (p + sizeof(TTPOLYGONHEADER) <= end) {
  TTPOLYGONHEADER *h = (TTPOLYGONHEADER *)p; if (h->cb < sizeof(TTPOLYGONHEADER) || p + h->cb > end) break;
  POINTFX start = h->pfxStart; BYTE *q = p + sizeof(TTPOLYGONHEADER), *e = p + h->cb;
  while (q + 2 * sizeof(WORD) <= e) { TTPOLYCURVE *c = (TTPOLYCURVE *)q; size_t len = 2 * sizeof(WORD) + sizeof(POINTFX) * c->cpfx; if (q + len > e) break; for (WORD i = 0; i < c->cpfx; i++) c->apfx[i] = start; q += len; }
  p += h->cb;
 }
}
void BlankGlyph(UINT format, void *buffer, DWORD size) {
 if (!buffer || !size) return; UINT kind = format & 0x0f;
 if (kind == GGO_NATIVE || kind == GGO_BEZIER) Collapse(buffer, size);
 else if (kind == GGO_BITMAP || kind == GGO_GRAY2_BITMAP || kind == GGO_GRAY4_BITMAP || kind == GGO_GRAY8_BITMAP) memset(buffer, 0, size);
}

// ---- glyph dots (docs/text-architecture.md) ---------------------------------------------------------------------------
// Dot side in pixels (spec 2): 2 below a 12 px cell, else max(3, round(cell / 10)), clipped to the glyph's black box.
// Grows with the cell so a dot survives engines that rasterise large and scale down (BGI: 136 px drawn at ~28 px).
int DotSide(int cellHeight) { return cellHeight < 12 ? 2 : (std::max)(3, (cellHeight + 5) / 10); }
// Where: the cell's top-left (pen position, top of the line cell) in space sp: "c" = client area of the game's top-level
// window, "m<W>x<H>" = a memory surface of that size (the game blits it later), "g" = GDI+ world units, "t<W>x<H>" =
// a Direct2D target of that pixel size, "-" = not known (GetGlyphOutline).
struct Where { int x = 0, y = 0; char sp[24] = "-"; };
struct Dot { int i; wchar_t ch; int h, b, a, x, y, s; char k; Where at; };
// A device point of dc to Where: window DCs go through the DC origin to the top-level window's client area.
Where PlaceDevice(HDC dc, POINT p) {
 Where w; w.x = p.x; w.y = p.y; HWND win = dc ? WindowFromDC(dc) : NULL; POINT org{};
 if (win && GetDCOrgEx(dc, &org)) { POINT s{org.x + p.x, org.y + p.y}; HWND root = GetAncestor(win, GA_ROOT); if (!root) root = win; if (ScreenToClient(root, &s)) { w.x = s.x; w.y = s.y; strcpy_s(w.sp, "c"); return w; } }
 BITMAP bm{}; HGDIOBJ b = dc ? GetCurrentObject(dc, OBJ_BITMAP) : NULL;
 if (b && GetObjectW(b, sizeof bm, &bm) && bm.bmWidth > 1 && bm.bmHeight > 1) sprintf_s(w.sp, "m%dx%d", (int)bm.bmWidth, (int)bm.bmHeight);
 return w;
}
Where PlaceLogical(HDC dc, int x, int y) { POINT p{x, y}; if (dc) LPtoDP(dc, &p, 1); return PlaceDevice(dc, p); }
SRWLOCK DotLock = SRWLOCK_INIT; long DotSeq = -1, DotAnnounced = -1; std::set<unsigned long long> DotSeen; std::string DotBuf, DotPath; DWORD DotFirst; int DotCount;
std::string XBuf, XPath; long XId = -1; DWORD XFirst; std::set<unsigned long long> XSeen;
void XFlushLocked() { if (!XBuf.empty()) Send("ToMe_GLYPHDOT xdots id=" + std::to_string(XId) + " path=" + XPath + " list=" + XBuf); XBuf.clear(); }
void DotFlushLocked() { if (!DotBuf.empty()) Send("ToMe_GLYPHDOT dots seq=" + std::to_string(DotSeq) + " path=" + DotPath + " list=" + DotBuf); DotBuf.clear(); DotCount = 0; }
// One served dot glyph; reported once per line and (index, kind) (ruby: per character and height). Never called under HideLock.
volatile LONG DotsServedCount;
void ServeDot(long seq, const char *path, const Dot &d) {
 if (!d.k) return;
 InterlockedIncrement(&DotsServedCount);
 AcquireSRWLockExclusive(&DotLock);
 if (d.k == 'n' || d.k == 'o') { // extra line: seq is the extra's id; each (id, index) once
  if (seq != XId || XPath != path) { XFlushLocked(); if (seq != XId && XSeen.size() > 4096) XSeen.clear(); XId = seq; XPath = path; XFirst = GetTickCount(); }
  if (XSeen.insert(((unsigned long long)(unsigned long)seq << 20) | (unsigned)(d.i & 0xfffff)).second) {
   char e[160]; sprintf_s(e, "%s%d:%04x:%d:%d:%d:%d:%d:%d:%c:%d:%d:%s", XBuf.empty() ? "" : ";", d.i, (unsigned)d.ch, d.h, d.b, d.a, d.x, d.y, d.s, d.k, d.at.x, d.at.y, d.at.sp); XBuf += e; }
  ReleaseSRWLockExclusive(&DotLock); return; }
 if (seq != DotSeq) { DotFlushLocked(); DotSeq = seq; DotSeen.clear(); }
 if (seq != DotAnnounced) { std::wstring text; AcquireSRWLockShared(&HideLock); bool same = Hide.Sequence() == seq; if (same) text = Hide.Current(); ReleaseSRWLockShared(&HideLock);
  if (same) { DotAnnounced = seq; Send("ToMe_GLYPHDOT line seq=" + std::to_string(seq) + " text=" + Utf8(text)); } }
 unsigned long long key = ((unsigned long long)(unsigned char)d.k << 48) | (d.i >= 0 ? (unsigned long long)d.i : (0x100000000ull | ((unsigned long long)d.ch << 12) | (unsigned)(d.h & 0xfff)));
 if (DotSeen.size() < 1024 && DotSeen.insert(key).second) {
  if (DotBuf.empty()) { DotFirst = GetTickCount(); DotPath = path; } else if (DotPath != path) { DotFlushLocked(); DotFirst = GetTickCount(); DotPath = path; }
  char e[160]; sprintf_s(e, "%s%d:%04x:%d:%d:%d:%d:%d:%d:%c:%d:%d:%s", DotBuf.empty() ? "" : ";", d.i, (unsigned)d.ch, d.h, d.b, d.a, d.x, d.y, d.s, d.k, d.at.x, d.at.y, d.at.sp); DotBuf += e;
  if (++DotCount >= 48) DotFlushLocked(); }
 ReleaseSRWLockExclusive(&DotLock);
}
// The colour the game hands the text API for the current line (read / unread colours, dimming), reported per line because the
// blank glyphs leave nothing of it on screen: ToMe_GLYPHDOT color seq=<n> rgb=<rrggbb> a=<aa> src=<text|gdip|d2d|run>.
// Taken from the draw call itself (DC text colour, GDI+ / Direct2D solid brush); GetGlyphOutline has no colour (the engine
// tints the bitmap itself: the GPU glyph trace reports those). Sent when it differs from the line's last one, 4 times a line at most.
long ColSeq = -1; unsigned ColVal = 0; bool ColHas = false; int ColSent = 0;
void ServeColor(long seq, const char *path, unsigned rgb, unsigned alpha) {
 unsigned v = (rgb & 0xffffff) | ((alpha & 255) << 24); bool send = false;
 AcquireSRWLockExclusive(&DotLock);
 if (seq != ColSeq) { ColSeq = seq; ColHas = false; ColSent = 0; }
 if ((!ColHas || v != ColVal) && ColSent < 4) { ColHas = true; ColVal = v; ColSent++; send = true; }
 ReleaseSRWLockExclusive(&DotLock);
 if (send) { char e[112]; sprintf_s(e, "ToMe_GLYPHDOT color seq=%ld rgb=%06x a=%02x src=%s", seq, rgb & 0xffffff, alpha & 255, path); Send(e); }
}
void ColorOfDc(long seq, HDC dc) { COLORREF c = GetTextColor(dc); if (c != CLR_INVALID) ServeColor(seq, "text", ((unsigned)GetRValue(c) << 16) | ((unsigned)GetGValue(c) << 8) | GetBValue(c), 255); }
void ColorOfGdipBrush(long seq, const void *brush) {
 typedef int(WINAPI *GBT)(void *, int *); typedef int(WINAPI *GSC)(void *, unsigned *); static GBT type; static GSC solid; static bool tried;
 if (!tried) { tried = true; HMODULE gp = GetModuleHandleW(L"gdiplus.dll"); if (gp) { type = (GBT)GetProcAddress(gp, "GdipGetBrushType"); solid = (GSC)GetProcAddress(gp, "GdipGetSolidFillColor"); } }
 int t = -1; unsigned argb = 0; if (!brush || !type || !solid || type((void *)brush, &t) || t != 0 || solid((void *)brush, &argb)) return;
 ServeColor(seq, "gdip", argb & 0xffffff, argb >> 24);
}
void ColorOfD2DBrush(long seq, const char *path, ID2D1Brush *brush) {
 ID2D1SolidColorBrush *s = NULL; if (!brush || FAILED(brush->QueryInterface(__uuidof(ID2D1SolidColorBrush), (void **)&s)) || !s) return;
 D2D1_COLOR_F c = s->GetColor(); float op = s->GetOpacity(); s->Release();
 auto ch = [](float v) { int n = (int)(v * 255.f + .5f); return (unsigned)(n < 0 ? 0 : n > 255 ? 255 : n); };
 ServeColor(seq, path, (ch(c.r) << 16) | (ch(c.g) << 8) | ch(c.b), ch(c.a * op));
}
void AnnounceLine(long seq, const std::wstring &text) {
 AcquireSRWLockExclusive(&DotLock); if (seq != DotSeq) { DotFlushLocked(); DotSeq = seq; DotSeen.clear(); }
 if (seq != DotAnnounced) { DotAnnounced = seq; Send("ToMe_GLYPHDOT line seq=" + std::to_string(seq) + " text=" + Utf8(text)); }
 ReleaseSRWLockExclusive(&DotLock);
}
DWORD WINAPI DotFlusher(void *) { for (;;) { Sleep(25); AcquireSRWLockExclusive(&DotLock); if (!DotBuf.empty() && GetTickCount() - DotFirst >= 25) DotFlushLocked(); if (!XBuf.empty() && GetTickCount() - XFirst >= 25) XFlushLocked(); ReleaseSRWLockExclusive(&DotLock); } }

// ---- compositor heartbeat (docs/text-architecture.md, "Owner rule: the player never sees marks") ----------------------
// Dots are only served while MeguLit's capture compositor is presenting this game: shared memory
// Local\MeguLitCompositorBeat-<pid> {magic 'MGCB', version 1, compositorPid, presenting, tickMs, frames}. Before any
// heartbeat was seen, a 20 s grace from DLL load (early injection starts before the compositor exists). After one was
// seen: presenting == 1 and now - tickMs <= 1000 ms, checked before every glyph and by a 250 ms watcher. Otherwise real
// glyphs at once; when dots were already served the engine may keep cached dots, so "ToMe_GLYPHDOT status
// needs-relaunch" is sent once per lapse. A heartbeat that comes back only affects glyphs rasterised from then on.
#pragma pack(push, 4)
struct Beat { DWORD magic, version, compositorPid, presenting; unsigned long long tickMs, frames; };
#pragma pack(pop)
const DWORD BeatMagic = 0x4243474D; const ULONGLONG BeatGrace = 20000, BeatFresh = 1000;
ULONGLONG LoadedAt; HANDLE BeatMap; volatile const Beat *BeatView; volatile LONG BeatSeen, BeatLapsed;
bool DotsLive() {
 if (!BeatView) { wchar_t name[64]; swprintf_s(name, L"Local\\MeguLitCompositorBeat-%lu", GetCurrentProcessId()); HANDLE m = OpenFileMappingW(FILE_MAP_READ, FALSE, name);
  if (m) { void *v = MapViewOfFile(m, FILE_MAP_READ, 0, 0, sizeof(Beat)); if (v && InterlockedCompareExchangePointer((PVOID *)&BeatView, v, NULL) == NULL) BeatMap = m; else { if (v) UnmapViewOfFile(v); CloseHandle(m); } } }
 ULONGLONG now = GetTickCount64();
 const volatile Beat *b = BeatView;
 if (b && b->magic == BeatMagic && b->version == 1) {
  if (b->tickMs) InterlockedExchange(&BeatSeen, 1);
  if (BeatSeen) return b->presenting == 1 && b->tickMs && now >= b->tickMs && now - b->tickMs <= BeatFresh;
 }
 if (BeatSeen) return false;      // seen once, now gone or invalid: real glyphs
 return now - LoadedAt <= BeatGrace; // never seen: early-injection grace
}
// Dot mode answers "not matched" while the heartbeat says the player would see the marks.
bool DotsBlocked() { return DotMode && PaintDots && !DotsLive(); }
DWORD WINAPI BeatWatch(void *) {
 for (;;) { Sleep(250); if (!DotMode || !PaintDots) continue; bool live = DotsLive();
  if (!live && !InterlockedExchange(&BeatLapsed, 1)) { if (DotsServedCount) Send("ToMe_GLYPHDOT status needs-relaunch served=" + std::to_string(DotsServedCount)); else Send("ToMe_GLYPHDOT status paused"); }
  if (live && BeatLapsed) { InterlockedExchange(&BeatLapsed, 0); Send("ToMe_GLYPHDOT status live"); } }
}

// The glyph buffer of a dot glyph. Metrics, black box and buffer size stay the original's; the only coverage is a
// side x side square at the black box's top-left. Bitmaps: rows top-down, DWORD-aligned; full coverage is 1 (mono),
// 4/16/64 (GRAY2/4/8). Outlines: one square contour (clockwise, TT_PRIM_LINE) in the same coordinates the original
// used (y up from the baseline, black box top-left = gmptGlyphOrigin), padded with zero-length points so the parsed
// size is the original's; returns the bytes the caller may parse.
DWORD DotGlyph(UINT format, const GLYPHMETRICS &gm, void *buffer, DWORD size, DWORD result, int side) {
 UINT kind = format & 0x0f; if (!buffer || !size || result == GDI_ERROR || !result) return result;
 int bx = (int)gm.gmBlackBoxX, by = (int)gm.gmBlackBoxY, sx = side < bx ? side : bx, sy = side < by ? side : by; DWORD used = result < size ? result : size;
 if (kind == GGO_BITMAP || kind == GGO_GRAY2_BITMAP || kind == GGO_GRAY4_BITMAP || kind == GGO_GRAY8_BITMAP) {
  BYTE *p = (BYTE *)buffer; memset(p, 0, used);
  if (kind == GGO_BITMAP) { DWORD pitch = ((bx + 31) / 32) * 4; for (int y = 0; y < sy; y++) for (int x = 0; x < sx; x++) if (y * pitch + x / 8 < used) p[y * pitch + x / 8] |= (BYTE)(0x80 >> (x % 8)); }
  else { BYTE full = kind == GGO_GRAY2_BITMAP ? 4 : kind == GGO_GRAY4_BITMAP ? 16 : 64; DWORD pitch = (bx + 3) & ~3u; for (int y = 0; y < sy; y++) for (int x = 0; x < sx; x++) if (y * pitch + x < used) p[y * pitch + x] = full; }
  return result;
 }
 if (kind != GGO_NATIVE && kind != GGO_BEZIER) return result;
 const DWORD square = sizeof(TTPOLYGONHEADER) + 4 + 3 * sizeof(POINTFX); if (used < square) { BlankGlyph(format, buffer, used); return result; }
 auto pt = [](int x, int y) { POINTFX p{}; p.x.value = (short)x; p.y.value = (short)y; return p; };
 int x0 = gm.gmptGlyphOrigin.x, y0 = gm.gmptGlyphOrigin.y; POINTFX corner[3] = {pt(x0 + sx, y0), pt(x0 + sx, y0 - sy), pt(x0, y0 - sy)};
 DWORD extra = used - square, total = square; WORD pad1 = 0, pad2 = 0; // zero-length points at the last corner keep the parsed size
 if (extra % 8 == 0 && extra / 8 <= 60000) { pad1 = (WORD)(extra / 8); total = used; }
 else if (extra >= 12 && (extra - 4) % 8 == 0 && (extra - 4) / 8 <= 60000) { pad2 = (WORD)((extra - 4) / 8); total = used; }
 BYTE *p = (BYTE *)buffer; memset(p, 0, used);
 TTPOLYGONHEADER *h = (TTPOLYGONHEADER *)p; h->cb = total; h->dwType = TT_POLYGON_TYPE; h->pfxStart = pt(x0, y0);
 TTPOLYCURVE *c = (TTPOLYCURVE *)(p + sizeof(TTPOLYGONHEADER)); c->wType = TT_PRIM_LINE; c->cpfx = (WORD)(3 + pad1);
 for (int i = 0; i < 3 + pad1; i++) c->apfx[i] = corner[i < 3 ? i : 2];
 if (pad2) { TTPOLYCURVE *d = (TTPOLYCURVE *)((BYTE *)c + 4 + sizeof(POINTFX) * 3); d->wType = TT_PRIM_LINE; d->cpfx = pad2; for (WORD i = 0; i < pad2; i++) d->apfx[i] = corner[2]; }
 return total;
}
// Text metrics of the font selected in dc (cell height and ascent for the dot report).
bool Cell(HDC dc, TEXTMETRICW &tm) { return dc && GetTextMetricsW(dc, &tm); }

// The leader is reported once it has drawn 30 characters and whenever another font overtakes it by a third.
void Report() {
 std::string line; GlyphHide::Key lead; EnterCriticalSection(&Gate);
 const Score *best = NULL; for (auto &s : Scores) if (!best || s.chars > best->chars) best = &s;
 if (best && best->chars >= 30) {
  line = "ToMe_FONT src=" + best->src + " size=" + std::to_string(best->face.size) + " weight=" + std::to_string(best->face.weight) + " chars=" + std::to_string(best->chars) + " face=" + Utf8(best->face.name);
  std::string key = best->src + "|" + Utf8(best->face.name) + "|" + std::to_string(best->face.size) + "|" + std::to_string(best->face.weight);
  if (key == Reported) line.clear(); else Reported = key;
  lead = KeyOf(best->face);
 }
 LeaveCriticalSection(&Gate); if (!line.empty()) Send(line);
 if (!lead.Empty()) { AcquireSRWLockExclusive(&HideLock); Hide.Leader(lead); ReleaseSRWLockExclusive(&HideLock); }
}

// ---- private fonts ---------------------------------------------------------------------------------------------------
std::set<unsigned> Saved;
// The disk write runs on a worker thread: the game's AddFontMemResourceEx / GdipPrivateAddMemoryFont call only hashes
// the font and copies a new one (the caller may free its buffer once the call returns).
struct SaveJob { unsigned h; DWORD size; unsigned char *data; };
DWORD WINAPI SaveWorker(void *arg) {
 SaveJob *j = (SaveJob *)arg; wchar_t path[1200]; swprintf_s(path, L"%smem-%08x.ttf", Dir, j->h); bool ok = true;
 if (GetFileAttributesW(path) == INVALID_FILE_ATTRIBUTES) { HANDLE f = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL); if (f == INVALID_HANDLE_VALUE) ok = false; else { DWORD done = 0; BOOL w = WriteFile(f, j->data, j->size, &done, NULL); CloseHandle(f); if (!w || done != j->size) { DeleteFileW(path); ok = false; } } }
 if (ok) Send("ToMe_FONTFILE kind=mem path=" + Utf8(path));
 HeapFree(GetProcessHeap(), 0, j->data); HeapFree(GetProcessHeap(), 0, j); return 0;
}
void SaveMemory(const void *data, DWORD size) {
 if (!data || size < 1024 || size > 60u * 1024 * 1024 || !Dir[0]) return;
 unsigned h = 2166136261u; const unsigned char *p = (const unsigned char *)data; for (DWORD i = 0; i < size; i += (size > 65536 ? 7 : 1)) h = (h ^ p[i]) * 16777619u; h ^= size;
 EnterCriticalSection(&Gate); bool fresh = Saved.insert(h).second; LeaveCriticalSection(&Gate); if (!fresh) return;
 SaveJob *j = (SaveJob *)HeapAlloc(GetProcessHeap(), 0, sizeof(SaveJob)); unsigned char *copy = j ? (unsigned char *)HeapAlloc(GetProcessHeap(), 0, size) : NULL;
 if (!copy) { if (j) HeapFree(GetProcessHeap(), 0, j); return; }
 memcpy(copy, data, size); j->h = h; j->size = size; j->data = copy;
 HANDLE t = CreateThread(NULL, 0, SaveWorker, j, 0, NULL); if (t) CloseHandle(t); else { HeapFree(GetProcessHeap(), 0, copy); HeapFree(GetProcessHeap(), 0, j); }
}
void ReportFile(const std::wstring &file) {
 if (file.empty() || file.size() > 900) return; wchar_t win[MAX_PATH]; GetWindowsDirectoryW(win, MAX_PATH);
 std::wstring lower = file, w = win; for (auto &c : lower) c = (wchar_t)towlower(c); for (auto &c : w) c = (wchar_t)towlower(c);
 if (lower.find(w) == 0) return;
 size_t dot = lower.rfind(L'.'); std::wstring ext = dot == std::wstring::npos ? L"" : lower.substr(dot);
 if (ext != L".ttf" && ext != L".otf" && ext != L".ttc" && ext != L".otc") return;
 wchar_t full[1024]; if (!GetFullPathNameW(file.c_str(), 1024, full, NULL)) return;
 Send("ToMe_FONTFILE kind=file path=" + Utf8(full));
}

// ---- GDI hooks -------------------------------------------------------------------------------------------------------
typedef HFONT(WINAPI *CFIA)(const LOGFONTA *); CFIA OCreateFontIndirectA;
typedef HFONT(WINAPI *CFA)(int, int, int, int, int, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD, DWORD, LPCSTR); CFA OCreateFontA;
typedef BOOL(WINAPI *ETOW)(HDC, int, int, UINT, const RECT *, LPCWSTR, UINT, const INT *); ETOW OExtTextOutW;
typedef BOOL(WINAPI *ETOA)(HDC, int, int, UINT, const RECT *, LPCSTR, UINT, const INT *); ETOA OExtTextOutA;
typedef BOOL(WINAPI *TOW)(HDC, int, int, LPCWSTR, int); TOW OTextOutW;
typedef BOOL(WINAPI *TOA)(HDC, int, int, LPCSTR, int); TOA OTextOutA;
typedef DWORD(WINAPI *GGOW)(HDC, UINT, UINT, LPGLYPHMETRICS, DWORD, LPVOID, const MAT2 *); GGOW OGetGlyphOutlineW, OGetGlyphOutlineA;
typedef HANDLE(WINAPI *AFMR)(PVOID, DWORD, PVOID, DWORD *); AFMR OAddFontMemResourceEx;
typedef int(WINAPI *AFRW)(LPCWSTR, DWORD, PVOID); AFRW OAddFontResourceExW;
typedef int(WINAPI *AFRA)(LPCSTR, DWORD, PVOID); AFRA OAddFontResourceExA;

void Remember(HFONT h, const char *face, LONG height, LONG weight) { if (!h || !face) return; Face f{Clean(Ansi(face)), height < 0 ? -height : height, weight ? weight : 400}; if (f.name.empty()) return; EnterCriticalSection(&Gate); if (AnsiFonts.size() > 4096) AnsiFonts.clear(); AnsiFonts[h] = f; LeaveCriticalSection(&Gate); }
HFONT WINAPI HCreateFontIndirectA(const LOGFONTA *lf) { HFONT h = OCreateFontIndirectA(lf); if (lf) { char face[LF_FACESIZE + 1] = {}; memcpy(face, lf->lfFaceName, LF_FACESIZE); Remember(h, face, lf->lfHeight, lf->lfWeight); } return h; }
HFONT WINAPI HCreateFontA(int h, int w, int e, int o, int wt, DWORD i, DWORD u, DWORD s, DWORD cs, DWORD op, DWORD cp, DWORD q, DWORD pf, LPCSTR face) { HFONT r = OCreateFontA(h, w, e, o, wt, i, u, s, cs, op, cp, q, pf, face); Remember(r, face, h, wt); return r; }
// A string that is left out: the opaque background is still filled and TA_UPDATECP still moves the current position.
BOOL Skipped(HDC dc, int x, int y, UINT o, const RECT *r, const std::wstring &text, const WORD *glyphs, UINT n) {
 if ((o & ETO_OPAQUE) && r) OExtTextOutW(dc, x, y, ETO_OPAQUE | (o & ETO_CLIPPED), r, L"", 0, NULL);
 if (GetTextAlign(dc) & TA_UPDATECP) { SIZE size{}; if (glyphs) GetTextExtentPointI(dc, (LPWORD)glyphs, (int)n, &size); else GetTextExtentPoint32W(dc, text.c_str(), (int)text.size(), &size); POINT p{}; GetCurrentPositionEx(dc, &p); MoveToEx(dc, p.x + size.cx, p.y, NULL); }
 return TRUE;
}
// lpDx of an ANSI string has one entry per byte (pairs with ETO_PDY); summed per character (Shift-JIS lead bytes).
std::vector<int> WideDx(const char *s, UINT n, const INT *dx, bool pdy, size_t chars) {
 std::vector<int> out; if (!dx || !s) return out; UINT step = pdy ? 2 : 1;
 for (UINT i = 0; i < n;) { UINT len = (i + 1 < n && IsDBCSLeadByteEx(932, (BYTE)s[i])) ? 2 : 1; int a = 0, b = 0; for (UINT k = 0; k < len; k++) { a += dx[(i + k) * step]; if (pdy) b += dx[(i + k) * step + 1]; } out.push_back(a); if (pdy) out.push_back(b); i += len; }
 if (out.size() != chars * step) out.clear(); return out;
}
// Glyph dots for a matched string (TextOut/ExtTextOut, glyph indices too): the opaque background as the game asked,
// then one square per matched character in the text colour at the character's black box top-left (where the game's
// own glyph would start), and the current position moved as by the real call. Vertical or rotated fonts fall back to
// the blank behaviour.
BOOL Dotted(HDC dc, int x, int y, UINT o, const RECT *r, const std::wstring &text, const WORD *glyphs, UINT n, const std::vector<int> &dx, const std::vector<GlyphHide::Served> &sv, long seq) {
 LOGFONTW lf{}; GetObjectW(GetCurrentObject(dc, OBJ_FONT), sizeof lf, &lf); TEXTMETRICW tm{}; UINT count = (UINT)text.size(); bool pdy = (o & ETO_PDY) != 0;
 if (lf.lfEscapement || lf.lfOrientation || lf.lfFaceName[0] == L'@' || !Cell(dc, tm) || !count || sv.size() != count || (glyphs && n != count) || (!dx.empty() && dx.size() != count * (pdy ? 2 : 1)))
  return Skipped(dc, x, y, o, r, text, glyphs, n);
 if ((o & ETO_OPAQUE) && r) OExtTextOutW(dc, x, y, ETO_OPAQUE | (o & ETO_CLIPPED), r, L"", 0, NULL);
 std::vector<int> adv(count);
 if (!dx.empty()) { for (UINT i = 0; i < count; i++) adv[i] = dx[pdy ? 2 * i : i]; }
 else { std::vector<int> part(count); SIZE sz{}; BOOL ok = glyphs ? GetTextExtentExPointI(dc, (LPWORD)glyphs, (int)count, 0, NULL, part.data(), &sz) : GetTextExtentExPointW(dc, text.c_str(), (int)count, 0, NULL, part.data(), &sz);
  if (!ok) return Skipped(dc, x, y, o, r, text, glyphs, n); for (UINT i = 0; i < count; i++) adv[i] = part[i] - (i ? part[i - 1] : 0); }
 int total = 0; for (int a : adv) total += a;
 UINT align = GetTextAlign(dc); bool update = (align & TA_UPDATECP) != 0; if (update) { POINT p{}; GetCurrentPositionEx(dc, &p); x = p.x; y = p.y; }
 int left = x; if ((align & TA_CENTER) == TA_CENTER) left = x - total / 2; else if ((align & TA_CENTER) == TA_RIGHT) left = x - total;
 int top = y; if ((align & TA_BASELINE) == TA_BASELINE) top = y - tm.tmAscent; else if ((align & TA_BASELINE) == TA_BOTTOM) top = y - tm.tmHeight;
 bool paint = PaintDots != 0; int side = paint ? DotSide(tm.tmHeight) : 0; COLORREF old = SetBkColor(dc, GetTextColor(dc)); MAT2 id = {{0, 1}, {0, 0}, {0, 0}, {0, 1}}; int pen = left, rise = 0;
 for (UINT i = 0; i < count; i++) {
  if (sv[i].kind) {
   GLYPHMETRICS gm{}; DWORD g = OGetGlyphOutlineW(dc, glyphs ? glyphs[i] : text[i], GGO_METRICS | (glyphs ? GGO_GLYPH_INDEX : 0), &gm, 0, NULL, &id);
   int ox = 0, oy = 0, bx = adv[i], by = tm.tmHeight; if (g != GDI_ERROR) { ox = gm.gmptGlyphOrigin.x; oy = tm.tmAscent - gm.gmptGlyphOrigin.y; bx = (int)gm.gmBlackBoxX; by = (int)gm.gmBlackBoxY; }
   RECT d = {pen + ox, top - rise + oy, pen + ox + (std::min)(side, bx), top - rise + oy + (std::min)(side, by)};
   if (paint && (!(o & ETO_CLIPPED) || !r || IntersectRect(&d, &d, r))) OExtTextOutW(dc, 0, 0, ETO_OPAQUE, &d, L"", 0, NULL);
   if (sv[i].kind == 'd') ColorOfDc(seq, dc);
   ServeDot(seq, "text", Dot{sv[i].index, text[i], (int)tm.tmHeight, (int)tm.tmAscent, adv[i], ox, oy, side, sv[i].kind, PlaceLogical(dc, pen, top - rise)}); }
  pen += adv[i]; if (pdy) rise += dx[2 * i + 1];
 }
 SetBkColor(dc, old);
 if (update) MoveToEx(dc, x + total, y, NULL);
 return TRUE;
}
// A matched string: dots (MODE dot) or left out (MODE blank).
BOOL Matched(HDC dc, int x, int y, UINT o, const RECT *r, const std::wstring &text, const WORD *glyphs, UINT n, const std::vector<int> &dx, const std::vector<GlyphHide::Served> &sv, long seq) {
 return DotMode ? Dotted(dc, x, y, o, r, text, glyphs, n, dx, sv, seq) : Skipped(dc, x, y, o, r, text, glyphs, n);
}
std::vector<int> DxOf(const INT *dx, UINT n, UINT o) { return dx ? std::vector<int>(dx, dx + n * ((o & ETO_PDY) ? 2 : 1)) : std::vector<int>(); }
BOOL WINAPI HExtTextOutW(HDC dc, int x, int y, UINT o, const RECT *r, LPCWSTR s, UINT n, const INT *dx) {
 if (!(o & ETO_GLYPH_INDEX)) { int k = CountW(s, (int)n); if (k) Count("gdi", FaceOf(dc), k); }
 if (HideOn && s && n && n <= 4096) { const WORD *g = (o & ETO_GLYPH_INDEX) ? (const WORD *)s : NULL; std::wstring text = g ? FromIndices(dc, g, n) : std::wstring(s, n); std::vector<GlyphHide::Served> sv; long seq = 0;
  if (HideText(text, FaceOf(dc), "text", &sv, &seq)) return Matched(dc, x, y, o, r, text, g, n, DxOf(dx, n, o), sv, seq); }
 return OExtTextOutW(dc, x, y, o, r, s, n, dx);
}
BOOL WINAPI HExtTextOutA(HDC dc, int x, int y, UINT o, const RECT *r, LPCSTR s, UINT n, const INT *dx) {
 if (!(o & ETO_GLYPH_INDEX)) { int k = CountA(s, (int)n); if (k) Count("gdi", FaceOf(dc), k); }
 if (HideOn && s && n && n <= 8192) { const WORD *g = (o & ETO_GLYPH_INDEX) ? (const WORD *)s : NULL; std::wstring text = g ? FromIndices(dc, g, n) : GameText(s, (int)n); std::vector<GlyphHide::Served> sv; long seq = 0;
  if (HideText(text, FaceOf(dc), "text", &sv, &seq)) return Matched(dc, x, y, o, r, text, g, n, g ? DxOf(dx, n, o) : WideDx(s, n, dx, (o & ETO_PDY) != 0, text.size()), sv, seq); }
 return OExtTextOutA(dc, x, y, o, r, s, n, dx);
}
BOOL WINAPI HTextOutW(HDC dc, int x, int y, LPCWSTR s, int n) {
 int k = CountW(s, n); if (k) Count("gdi", FaceOf(dc), k);
 if (HideOn && s && n > 0 && n <= 4096) { std::wstring text(s, n); std::vector<GlyphHide::Served> sv; long seq = 0; if (HideText(text, FaceOf(dc), "text", &sv, &seq)) return Matched(dc, x, y, 0, NULL, text, NULL, 0, std::vector<int>(), sv, seq); }
 return OTextOutW(dc, x, y, s, n);
}
BOOL WINAPI HTextOutA(HDC dc, int x, int y, LPCSTR s, int n) {
 int k = CountA(s, n); if (k) Count("gdi", FaceOf(dc), k);
 if (HideOn && s && n > 0 && n <= 8192) { std::wstring text = GameText(s, n); std::vector<GlyphHide::Served> sv; long seq = 0; if (HideText(text, FaceOf(dc), "text", &sv, &seq)) return Matched(dc, x, y, 0, NULL, text, NULL, 0, std::vector<int>(), sv, seq); }
 return OTextOutA(dc, x, y, s, n);
}
// A matched glyph: MODE blank zeroes its pixels (outlines collapse to a point); MODE dot serves the dot glyph and
// reports it. Size queries and GGO_METRICS calls are returned unchanged in both modes.
// Locating marks (MARK on, blank mode, spec 3): GetGlyphOutline gives no position, so the first, second and last
// character of the line keep ONE pixel at their black box's top-left with the weakest coverage there is, 1 of 64
// (GGO_GRAY8_BITMAP only; coarser formats would be visible: GRAY4 1/16, GRAY2 1/4, mono full). The game composites it
// like a glyph pixel: at most 255/64 = 4 levels of 255 between text colour and background, on one pixel. The reader
// finds it by frame difference (core/glyph-locate.cjs) and learns the line origin, scale and wrap width; record s = 1.
// MARK on covers only two lines (owner: marks appear only in the lines a game is learned from), then stops by itself
// even if the reader never sends MARK off. And only on an engine seen to rasterise every repeated character again
// (GlyphHide::RasterVerdict): a glyph cache would bring a marked glyph back in later lines, so such engines get none.
// The two lines start at the first line after MARK on for which the verdict is in.
volatile LONG MarkSaid;
// Called for every GetGlyphOutline glyph served in blank mode; true when this glyph may carry a mark.
bool MarkNow(long seq, wchar_t ch) {
 AcquireSRWLockExclusive(&HideLock); Raster.Rasterised(ch); bool ok = false, cached = Hide.Cached(), again = Raster.Rerasterises(cached); int chances = Raster.chances, hits = Raster.hits;
 if (MarkArmed && again) { if (MarkLast < 0) MarkLast = seq + 1; ok = seq <= MarkLast; if (seq > MarkLast) InterlockedExchange(&MarkArmed, 0); }
 ReleaseSRWLockExclusive(&HideLock);
 if (MarkArmed && !again && chances >= 10 && !InterlockedExchange(&MarkSaid, 1)) Send("ToMe_GLYPHDOT status marks-off cache=" + std::to_string(cached ? 1 : 0) + " hits=" + std::to_string(hits) + "/" + std::to_string(chances));
 return ok;
}
bool MarkIndex(int i) {
 if (i == 0 || i == 1) return true; AcquireSRWLockShared(&HideLock); int n = 0; for (wchar_t c : Hide.Current()) if (!GlyphHide::Blank(c)) n++; ReleaseSRWLockShared(&HideLock);
 return i == n - 1;
}
DWORD ServeGlyph(HDC dc, UINT f, const GLYPHMETRICS *gm, LPVOID b, DWORD n, DWORD r, const GlyphHide::Served &sv, long seq, wchar_t ch) {
 bool markable = sv.kind == 'd' && b && n && (f & 0x0f) != GGO_METRICS && !PaintDots && DotMode && MarkNow(seq, ch);
 if (!DotMode || !gm || !PaintDots) { if (b && n) BlankGlyph(f, b, r < n ? r : n); if (!DotMode || !gm || !b || !n || (f & 0x0f) == GGO_METRICS) return r; }
 if (!b || !n || (f & 0x0f) == GGO_METRICS) return r;
 TEXTMETRICW tm{}; Cell(dc, tm); int side = PaintDots ? DotSide(tm.tmHeight) : 0; DWORD out = PaintDots ? DotGlyph(f, *gm, b, n, r, side) : r;
 if (markable && (f & 0x0f) == GGO_GRAY8_BITMAP && sv.kind == 'd' && gm->gmBlackBoxX && gm->gmBlackBoxY && r != GDI_ERROR && r && MarkIndex(sv.index)) { ((BYTE *)b)[0] = 1; side = 1; }
 ServeDot(seq, "ggo", Dot{sv.index, ch, (int)tm.tmHeight, (int)tm.tmAscent, (int)gm->gmCellIncX, (int)gm->gmptGlyphOrigin.x, (int)tm.tmAscent - (int)gm->gmptGlyphOrigin.y, side, sv.kind});
 return out;
}
// Most visual novel engines rasterise their text one character at a time with GetGlyphOutline. Every call counts one
// character; engines that ask the size first count twice, which ranks every font of that engine alike.
// Matched glyphs keep their GLYPHMETRICS and buffer size (layout and advance unchanged); only the pixels change.
volatile LONG GgoChar, GgoIndex, GgoMetrics, GgoReported, GgoFormat[8]; // which GetGlyphOutline forms the game uses (one status line)
void GgoKind(UINT c, UINT f) { if ((f & 0x0f) < 8) InterlockedIncrement(&GgoFormat[f & 0x0f]); if ((f & 0x0f) == GGO_METRICS) InterlockedIncrement(&GgoMetrics); else if (f & GGO_GLYPH_INDEX) InterlockedIncrement(&GgoIndex); else InterlockedIncrement(&GgoChar); (void)c; }
DWORD WINAPI HGetGlyphOutlineW(HDC dc, UINT c, UINT f, LPGLYPHMETRICS gm, DWORD n, LPVOID b, const MAT2 *m) {
 GgoKind(c, f);
 bool index = (f & GGO_GLYPH_INDEX) != 0; Face face{L"", 0, 400}; bool known = false;
 if (!index && c < 0x10000 && Japanese((wchar_t)c)) { face = FaceOf(dc); known = true; Count("gdi", face, 1); }
 else if (index && (f & 0x0f) != GGO_METRICS) { face = FaceOf(dc); known = true; Count("gdi", face, 1); } // glyph-index engines: every rasterised glyph ranks its font
 GlyphHide::Served sv; long seq = 0; wchar_t ch = 0;
 bool hide = HideOn && c && c < 0x10000 && HideGlyph(dc, c, index, known ? face : FaceOf(dc), (f & 0x0f) != GGO_METRICS, &sv, &seq, &ch);
 DWORD r = OGetGlyphOutlineW(dc, c, f, gm, n, b, m);
 if (hide && r != GDI_ERROR) r = ServeGlyph(dc, f, gm, b, n, r, sv, seq, ch);
 return r;
}
DWORD WINAPI HGetGlyphOutlineA(HDC dc, UINT c, UINT f, LPGLYPHMETRICS gm, DWORD n, LPVOID b, const MAT2 *m) {
 GgoKind(c, f);
 bool index = (f & GGO_GLYPH_INDEX) != 0; if ((!index && c > 0x8100) || (index && (f & 0x0f) != GGO_METRICS)) Count("gdi", FaceOf(dc), 1);
 bool hide = false; GlyphHide::Served sv; long seq = 0; wchar_t ch = 0;
 if (HideOn && c) { UINT code = c; if (!index) { char bytes[2]; int len = 0; if (c > 0xff) bytes[len++] = (char)(c >> 8); bytes[len++] = (char)(c & 0xff); std::wstring w = GameText(bytes, len); code = w.size() == 1 ? w[0] : 0; }
  hide = code && HideGlyph(dc, code, index, FaceOf(dc), (f & 0x0f) != GGO_METRICS, &sv, &seq, &ch); }
 DWORD r = OGetGlyphOutlineA(dc, c, f, gm, n, b, m);
 if (hide && r != GDI_ERROR) r = ServeGlyph(dc, f, gm, b, n, r, sv, seq, ch);
 return r;
}
HANDLE WINAPI HAddFontMemResourceEx(PVOID p, DWORD n, PVOID r, DWORD *k) { HANDLE h = OAddFontMemResourceEx(p, n, r, k); if (h) SaveMemory(p, n); return h; }
int WINAPI HAddFontResourceExW(LPCWSTR f, DWORD fl, PVOID r) { int n = OAddFontResourceExW(f, fl, r); if (n > 0 && f) ReportFile(f); return n; }
int WINAPI HAddFontResourceExA(LPCSTR f, DWORD fl, PVOID r) { int n = OAddFontResourceExA(f, fl, r); if (n > 0 && f) ReportFile(Ansi(f)); return n; }

// ---- GDI+ ------------------------------------------------------------------------------------------------------------
typedef int(WINAPI *GPAM)(void *, const void *, INT); GPAM OGdipPrivateAddMemoryFont;
typedef int(WINAPI *GPAF)(void *, const WCHAR *); GPAF OGdipPrivateAddFontFile;
typedef int(WINAPI *GDS)(void *, const WCHAR *, INT, void *, const void *, const void *, const void *); GDS OGdipDrawString;
typedef int(WINAPI *GDDS)(void *, const UINT16 *, INT, const void *, const void *, const void *, INT, const void *); GDDS OGdipDrawDriverString;
typedef int(WINAPI *GGF)(const void *, void **); GGF GdipGetFamily;
typedef int(WINAPI *GGFN)(void *, WCHAR *, WORD); GGFN GdipGetFamilyName;
typedef int(WINAPI *GGS)(const void *, float *); GGS GdipGetFontSize;
typedef int(WINAPI *GGST)(const void *, INT *); GGST GdipGetFontStyle;
int WINAPI HGdipPrivateAddMemoryFont(void *c, const void *m, INT n) { int r = OGdipPrivateAddMemoryFont(c, m, n); if (r == 0) SaveMemory(m, (DWORD)n); return r; }
int WINAPI HGdipPrivateAddFontFile(void *c, const WCHAR *f) { int r = OGdipPrivateAddFontFile(c, f); if (r == 0 && f) ReportFile(f); return r; }
bool GdipFace(const void *font, Face &out) {
 if (!font || !GdipGetFamily || !GdipGetFamilyName) return false; void *fam = NULL; WCHAR name[LF_FACESIZE] = {}; float size = 0; INT style = 0;
 if (GdipGetFamily(font, &fam) != 0 || GdipGetFamilyName(fam, name, 0) != 0) return false;
 if (GdipGetFontSize) GdipGetFontSize(font, &size); if (GdipGetFontStyle) GdipGetFontStyle(font, &style);
 out = Face{Clean(name), (int)(size + .5f), (style & 1) ? 700 : 400}; return true;
}
// Glyph dots through GDI+: each matched character's layout box (GdipMeasureCharacterRanges, 32 ranges per call, with the
// game's own graphics, font, layout rectangle and string format) gets a square filled with the game's own brush at the
// box's top-left, aliased (SmoothingModeNone) so it stays a crisp square. Report: cell height and ascent from the font
// family's line spacing, advance = box width, dot offset 0,0 (the box top-left).
struct GpRectF { float X, Y, Width, Height; };
struct GpRange { INT First, Length; };
typedef int(WINAPI *GPV)(void *); typedef int(WINAPI *GPVV)(void *, void **); typedef int(WINAPI *GPPP)(void **);
typedef int(WINAPI *GRB)(void *, void *, GpRectF *); typedef int(WINAPI *GMCR)(void *, const WCHAR *, INT, const void *, const GpRectF *, const void *, INT, void **);
typedef int(WINAPI *GSMR)(void *, INT, const GpRange *); typedef int(WINAPI *GFR)(void *, void *, float, float, float, float);
typedef int(WINAPI *GGSM)(void *, int *); typedef int(WINAPI *GSSM)(void *, int); typedef int(WINAPI *GFH)(const void *, const void *, float *);
typedef int(WINAPI *GFM)(const void *, INT, UINT16 *);
struct { GPPP CreateRegion; GPV DeleteRegion; GRB GetRegionBounds; GMCR Measure; GPVV CloneFormat; GPPP GenericDefault; GSMR SetRanges; GPV DeleteFormat; GFR FillRectangle; GGSM GetSmoothing; GSSM SetSmoothing; GFH FontHeight; GFM CellAscent, LineSpacing, CellDescent; bool ok; } Gp;
void GdipDotApis(HMODULE gp) {
 Gp.CreateRegion = (GPPP)GetProcAddress(gp, "GdipCreateRegion"); Gp.DeleteRegion = (GPV)GetProcAddress(gp, "GdipDeleteRegion"); Gp.GetRegionBounds = (GRB)GetProcAddress(gp, "GdipGetRegionBounds");
 Gp.Measure = (GMCR)GetProcAddress(gp, "GdipMeasureCharacterRanges"); Gp.CloneFormat = (GPVV)GetProcAddress(gp, "GdipCloneStringFormat"); Gp.GenericDefault = (GPPP)GetProcAddress(gp, "GdipStringFormatGetGenericDefault");
 Gp.SetRanges = (GSMR)GetProcAddress(gp, "GdipSetStringFormatMeasurableCharacterRanges"); Gp.DeleteFormat = (GPV)GetProcAddress(gp, "GdipDeleteStringFormat"); Gp.FillRectangle = (GFR)GetProcAddress(gp, "GdipFillRectangle");
 Gp.GetSmoothing = (GGSM)GetProcAddress(gp, "GdipGetSmoothingMode"); Gp.SetSmoothing = (GSSM)GetProcAddress(gp, "GdipSetSmoothingMode"); Gp.FontHeight = (GFH)GetProcAddress(gp, "GdipGetFontHeight");
 Gp.CellAscent = (GFM)GetProcAddress(gp, "GdipGetCellAscent"); Gp.CellDescent = (GFM)GetProcAddress(gp, "GdipGetCellDescent"); Gp.LineSpacing = (GFM)GetProcAddress(gp, "GdipGetLineSpacing");
 Gp.ok = Gp.CreateRegion && Gp.DeleteRegion && Gp.GetRegionBounds && Gp.Measure && Gp.CloneFormat && Gp.GenericDefault && Gp.SetRanges && Gp.DeleteFormat && Gp.FillRectangle && Gp.GetSmoothing && Gp.SetSmoothing && Gp.FontHeight && Gp.CellAscent && Gp.CellDescent && Gp.LineSpacing && GdipGetFamily && GdipGetFontStyle;
}
// Cell height and ascent of a GDI+ font in graphics units: line height x (ascent + descent) / line spacing.
void GdipCell(void *g, const void *font, int &h, int &b) {
 h = 0; b = 0; float height = 0; void *fam = NULL; INT style = 0; UINT16 asc = 0, desc = 0, line = 0;
 if (Gp.FontHeight(font, g, &height) || GdipGetFamily(font, &fam) || GdipGetFontStyle(font, &style)) return;
 if (Gp.CellAscent(fam, style, &asc) || Gp.CellDescent(fam, style, &desc) || Gp.LineSpacing(fam, style, &line) || !line) return;
 h = (int)(height * (asc + desc) / line + .5f); b = (int)(height * asc / line + .5f);
}
void GdipDots(void *g, const WCHAR *s, int len, void *font, const GpRectF *rc, const void *fmt, const void *brush, const std::vector<GlyphHide::Served> &sv, long seq) {
 if (!Gp.ok || (int)sv.size() != len) return;
 void *format = NULL; if (fmt) Gp.CloneFormat((void *)fmt, &format); else { void *generic = NULL; if (!Gp.GenericDefault(&generic) && generic) Gp.CloneFormat(generic, &format); }
 if (!format) return;
 GpRectF layout = rc ? *rc : GpRectF{0, 0, 0, 0}; if (layout.Width <= 0) layout.Width = 1e6f; if (layout.Height <= 0) layout.Height = 1e6f;
 bool paint = PaintDots != 0; int h = 0, b = 0; GdipCell(g, font, h, b); int side = paint ? DotSide(h) : 0, smoothing = 0; Gp.GetSmoothing(g, &smoothing); if (paint) Gp.SetSmoothing(g, 3 /* SmoothingModeNone */);
 std::vector<int> which; for (int i = 0; i < len; i++) if (sv[i].kind) which.push_back(i);
 for (size_t at = 0; at < which.size(); at += 32) {
  size_t k = (std::min)((size_t)32, which.size() - at); std::vector<GpRange> ranges(k); std::vector<void *> regions(k, NULL);
  for (size_t j = 0; j < k; j++) { ranges[j] = {which[at + j], 1}; Gp.CreateRegion(&regions[j]); }
  if (!Gp.SetRanges(format, (INT)k, ranges.data()) && !Gp.Measure(g, s, len, font, &layout, format, (INT)k, regions.data()))
   for (size_t j = 0; j < k; j++) { GpRectF box{}; int i = which[at + j]; if (!regions[j] || Gp.GetRegionBounds(regions[j], g, &box) || box.Width <= 0) continue;
    float x = (float)(int)(box.X + .5f), y = (float)(int)(box.Y + .5f); if (paint) Gp.FillRectangle(g, (void *)brush, x, y, (float)side, (float)side);
    Where at; at.x = (int)x; at.y = (int)y; strcpy_s(at.sp, "g");
    if (sv[i].kind == 'd') ColorOfGdipBrush(seq, brush);
    ServeDot(seq, "gdip", Dot{sv[i].index, s[i], h, b, (int)(box.Width + .5f), 0, 0, side, sv[i].kind, at}); }
  for (void *r : regions) if (r) Gp.DeleteRegion(r);
 }
 if (paint) Gp.SetSmoothing(g, smoothing); Gp.DeleteFormat(format);
}
int WINAPI HGdipDrawString(void *g, const WCHAR *s, INT n, void *font, const void *rc, const void *fmt, const void *br) {
 int len = n < 0 && s ? (int)wcsnlen(s, 4096) : n, k = CountW(s, len); Face face; bool known = (k || HideOn) && GdipFace(font, face);
 if (k && known) Count("gdip", face, k);
 std::vector<GlyphHide::Served> sv; long seq = 0;
 if (HideOn && known && s && len > 0 && len <= 4096 && HideText(std::wstring(s, len), face, "gdip", &sv, &seq)) { if (DotMode) GdipDots(g, s, len, font, (const GpRectF *)rc, fmt, br, sv, seq); return 0; }
 return OGdipDrawString(g, s, n, font, rc, fmt, br);
}
// flags & 1 (DriverStringOptionsCmapLookup): text holds characters; otherwise glyph indices, left alone. Dots need one
// position per character (no DriverStringOptionsRealizedAdvance 4, not vertical 8); otherwise the line is left out.
int WINAPI HGdipDrawDriverString(void *g, const UINT16 *s, INT n, const void *font, const void *br, const void *pos, INT flags, const void *m) {
 if (HideOn && s && (flags & 1)) { int len = n < 0 ? (int)wcsnlen((const wchar_t *)s, 4096) : n; Face face; std::vector<GlyphHide::Served> sv; long seq = 0;
  if (len > 0 && len <= 4096 && GdipFace(font, face) && HideText(std::wstring((const wchar_t *)s, len), face, "gdip", &sv, &seq)) {
   if (DotMode && Gp.ok && pos && !(flags & 12) && (int)sv.size() == len) {
    bool paint = PaintDots != 0; const float *p = (const float *)pos; int h = 0, b = 0; GdipCell(g, font, h, b); int side = paint ? DotSide(h) : 0, smoothing = 0; Gp.GetSmoothing(g, &smoothing); if (paint) Gp.SetSmoothing(g, 3);
    for (int i = 0; i < len; i++) if (sv[i].kind) { float x = (float)(int)(p[2 * i] + .5f), y = (float)(int)(p[2 * i + 1] - b + .5f); if (paint) Gp.FillRectangle(g, (void *)br, x, y, (float)side, (float)side);
     Where at; at.x = (int)x; at.y = (int)y; strcpy_s(at.sp, "g");
     if (sv[i].kind == 'd') ColorOfGdipBrush(seq, br);
     ServeDot(seq, "gdip", Dot{sv[i].index, (wchar_t)s[i], h, b, i + 1 < len ? (int)(p[2 * i + 2] - p[2 * i] + .5f) : 0, 0, 0, side, sv[i].kind, at}); }
    if (paint) Gp.SetSmoothing(g, smoothing); }
   return 0; } }
 return OGdipDrawDriverString(g, s, n, font, br, pos, flags, m);
}

// ---- DirectWrite / Direct2D ------------------------------------------------------------------------------------------
typedef HRESULT(STDMETHODCALLTYPE *CTF)(IDWriteFactory *, const WCHAR *, IDWriteFontCollection *, DWRITE_FONT_WEIGHT, DWRITE_FONT_STYLE, DWRITE_FONT_STRETCH, FLOAT, const WCHAR *, IDWriteTextFormat **); CTF OCreateTextFormat;
typedef HRESULT(STDMETHODCALLTYPE *CFFR)(IDWriteFactory *, const WCHAR *, const FILETIME *, IDWriteFontFile **); CFFR OCreateFontFileReference;
typedef HRESULT(STDMETHODCALLTYPE *CTL)(IDWriteFactory *, const WCHAR *, UINT32, IDWriteTextFormat *, FLOAT, FLOAT, IDWriteTextLayout **); CTL OCreateTextLayout;
typedef HRESULT(STDMETHODCALLTYPE *CGTL)(IDWriteFactory *, const WCHAR *, UINT32, IDWriteTextFormat *, FLOAT, FLOAT, FLOAT, const DWRITE_MATRIX *, BOOL, IDWriteTextLayout **); CGTL OCreateGdiCompatibleTextLayout;
typedef void(STDMETHODCALLTYPE *D2DT)(ID2D1RenderTarget *, const WCHAR *, UINT32, IDWriteTextFormat *, const D2D1_RECT_F *, ID2D1Brush *, D2D1_DRAW_TEXT_OPTIONS, DWRITE_MEASURING_MODE); D2DT ODrawText;
typedef void(STDMETHODCALLTYPE *D2DL)(ID2D1RenderTarget *, D2D1_POINT_2F, IDWriteTextLayout *, ID2D1Brush *, D2D1_DRAW_TEXT_OPTIONS); D2DL ODrawTextLayout;
// No characters are known here: each text format counts 8, so a DirectWrite game reports the format it creates most.
HRESULT STDMETHODCALLTYPE HCreateTextFormat(IDWriteFactory *f, const WCHAR *family, IDWriteFontCollection *c, DWRITE_FONT_WEIGHT w, DWRITE_FONT_STYLE s, DWRITE_FONT_STRETCH st, FLOAT size, const WCHAR *loc, IDWriteTextFormat **out) {
 if (family) Count("dwrite", Face{Clean(family), (int)(size + .5f), (int)w}, 8); return OCreateTextFormat(f, family, c, w, s, st, size, loc, out); }
HRESULT STDMETHODCALLTYPE HCreateFontFileReference(IDWriteFactory *f, const WCHAR *p, const FILETIME *t, IDWriteFontFile **out) { HRESULT r = OCreateFontFileReference(f, p, t, out); if (SUCCEEDED(r) && p) ReportFile(p); return r; }
Face FormatFace(IDWriteTextFormat *format) { Face f{L"", 0, 400}; if (!format) return f; WCHAR name[64] = {}; if (SUCCEEDED(format->GetFontFamilyName(name, 64))) f.name = Clean(name); f.size = (int)(format->GetFontSize() + .5f); f.weight = (int)format->GetFontWeight(); return f; }
// A text layout carries no way back to its string: the string and font of every layout with Japanese in it are kept by
// pointer (a reused pointer is overwritten when its new layout is created through the factory).
SRWLOCK LayoutLock = SRWLOCK_INIT; std::map<void *, std::pair<std::wstring, Face>> Layouts;
void KeepLayout(IDWriteTextLayout *layout, const WCHAR *s, UINT32 n, IDWriteTextFormat *format) {
 if (!layout) return; bool keep = s && n > 0 && n <= 2048 && CountW(s, (int)n) > 0; std::pair<std::wstring, Face> v; if (keep) v = {std::wstring(s, n), FormatFace(format)};
 AcquireSRWLockExclusive(&LayoutLock); if (keep) { if (Layouts.size() > 512) Layouts.clear(); Layouts[layout] = v; } else Layouts.erase(layout); ReleaseSRWLockExclusive(&LayoutLock);
}
HRESULT STDMETHODCALLTYPE HCreateTextLayout(IDWriteFactory *f, const WCHAR *s, UINT32 n, IDWriteTextFormat *format, FLOAT w, FLOAT h, IDWriteTextLayout **out) { HRESULT r = OCreateTextLayout(f, s, n, format, w, h, out); if (SUCCEEDED(r) && out) KeepLayout(*out, s, n, format); return r; }
HRESULT STDMETHODCALLTYPE HCreateGdiCompatibleTextLayout(IDWriteFactory *f, const WCHAR *s, UINT32 n, IDWriteTextFormat *format, FLOAT w, FLOAT h, FLOAT dip, const DWRITE_MATRIX *m, BOOL nat, IDWriteTextLayout **out) { HRESULT r = OCreateGdiCompatibleTextLayout(f, s, n, format, w, h, dip, m, nat, out); if (SUCCEEDED(r) && out) KeepLayout(*out, s, n, format); return r; }
// Glyph dots through Direct2D: the matched characters' positions come from DirectWrite hit-testing of the layout the
// game draws (DrawTextLayout) or of the same layout rebuilt from its string, format and rectangle (DrawText); glyph runs
// (DrawGlyphRun) use their own advances. Each dot is filled with the game's brush, aliased, snapped to device pixels.
IDWriteFactory *DotFactory;
IDWriteFactory *Factory() {
 if (DotFactory) return DotFactory; HMODULE dw = GetModuleHandleW(L"dwrite.dll"); if (!dw) return NULL;
 typedef HRESULT(WINAPI *DCF)(DWRITE_FACTORY_TYPE, REFIID, IUnknown **); DCF create = (DCF)GetProcAddress(dw, "DWriteCreateFactory"); IDWriteFactory *f = NULL;
 if (create && SUCCEEDED(create(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), (IUnknown **)&f))) DotFactory = f; return DotFactory;
}
float Snap(float dip, float dpi) { return (float)(int)(dip * dpi / 96.f + .5f) * 96.f / dpi; }
// A point in DIPs drawn on rt to Where: the target's transform and DPI give target pixels; a window render target's
// pixels are its window's client area, mapped to the top-level window's; other targets report "t<W>x<H>".
Where PlaceTarget(ID2D1RenderTarget *rt, float x, float y) {
 Where w; D2D1_MATRIX_3X2_F m; rt->GetTransform(&m); FLOAT dx = 96, dy = 96; rt->GetDpi(&dx, &dy); if (dx <= 0) dx = 96; if (dy <= 0) dy = 96;
 float tx = x * m._11 + y * m._21 + m._31, ty = x * m._12 + y * m._22 + m._32; w.x = (int)floorf(tx * dx / 96.f + .5f); w.y = (int)floorf(ty * dy / 96.f + .5f);
 ID2D1HwndRenderTarget *h = NULL;
 if (SUCCEEDED(rt->QueryInterface(__uuidof(ID2D1HwndRenderTarget), (void **)&h)) && h) {
  HWND win = h->GetHwnd(); h->Release(); HWND root = win ? GetAncestor(win, GA_ROOT) : NULL; POINT p{w.x, w.y};
  if (win && root) { if (root != win) MapWindowPoints(win, root, &p, 1); w.x = p.x; w.y = p.y; strcpy_s(w.sp, "c"); return w; } }
 D2D1_SIZE_U px = rt->GetPixelSize(); sprintf_s(w.sp, "t%ux%u", px.width, px.height); return w;
}
void LayoutDots(ID2D1RenderTarget *rt, D2D1_POINT_2F at, IDWriteTextLayout *layout, ID2D1Brush *brush, const std::wstring &text, const std::vector<GlyphHide::Served> &sv, long seq) {
 if (!layout || sv.size() != text.size()) return;
 FLOAT dx = 96, dy = 96; rt->GetDpi(&dx, &dy); if (dx <= 0) dx = 96; if (dy <= 0) dy = 96;
 UINT32 lines = 0; layout->GetLineMetrics(NULL, 0, &lines); std::vector<DWRITE_LINE_METRICS> lm(lines ? lines : 1); if (lines) layout->GetLineMetrics(lm.data(), lines, &lines);
 D2D1_ANTIALIAS_MODE mode = rt->GetAntialiasMode(); rt->SetAntialiasMode(D2D1_ANTIALIAS_MODE_ALIASED);
 for (UINT32 i = 0; i < (UINT32)text.size(); i++) {
  if (!sv[i].kind) continue; FLOAT px = 0, py = 0; DWRITE_HIT_TEST_METRICS ht{}; if (FAILED(layout->HitTestTextPosition(i, FALSE, &px, &py, &ht))) continue;
  float base = ht.height * .8f, top = 0; for (UINT32 l = 0; l < lines; l++) { if (ht.top < top + lm[l].height - .01f) { base = lm[l].baseline; break; } top += lm[l].height; }
  int h = (int)(ht.height * dy / 96.f + .5f), side = PaintDots ? DotSide(h) : 0; float x = Snap(at.x + ht.left, dx), y = Snap(at.y + ht.top, dy);
  if (side) rt->FillRectangle(D2D1::RectF(x, y, x + side * 96.f / dx, y + side * 96.f / dy), brush);
  if (sv[i].kind == 'd') ColorOfD2DBrush(seq, "d2d", brush);
  ServeDot(seq, "d2d", Dot{sv[i].index, text[i], h, (int)(base * dy / 96.f + .5f), (int)(ht.width * dx / 96.f + .5f), 0, 0, side, sv[i].kind, PlaceTarget(rt, at.x + ht.left, at.y + ht.top)}); }
 rt->SetAntialiasMode(mode);
}
void STDMETHODCALLTYPE HDrawText(ID2D1RenderTarget *rt, const WCHAR *s, UINT32 n, IDWriteTextFormat *format, const D2D1_RECT_F *rc, ID2D1Brush *brush, D2D1_DRAW_TEXT_OPTIONS o, DWRITE_MEASURING_MODE mm) {
 std::vector<GlyphHide::Served> sv; long seq = 0;
 if (HideOn && s && n > 0 && n <= 4096 && HideText(std::wstring(s, n), FormatFace(format), "d2d", &sv, &seq)) {
  IDWriteFactory *f = DotMode && rc ? Factory() : NULL; IDWriteTextLayout *layout = NULL;
  if (f && SUCCEEDED(f->CreateTextLayout(s, n, format, (std::max)(0.f, rc->right - rc->left), (std::max)(0.f, rc->bottom - rc->top), &layout)) && layout) {
   KeepLayout(layout, NULL, 0, NULL); LayoutDots(rt, D2D1::Point2F(rc->left, rc->top), layout, brush, std::wstring(s, n), sv, seq); layout->Release(); }
  return; }
 ODrawText(rt, s, n, format, rc, brush, o, mm);
}
void STDMETHODCALLTYPE HDrawTextLayout(ID2D1RenderTarget *rt, D2D1_POINT_2F at, IDWriteTextLayout *layout, ID2D1Brush *brush, D2D1_DRAW_TEXT_OPTIONS o) {
 if (HideOn && layout) { std::pair<std::wstring, Face> v; bool found = false; AcquireSRWLockShared(&LayoutLock); auto it = Layouts.find(layout); if (it != Layouts.end()) { v = it->second; found = true; } ReleaseSRWLockShared(&LayoutLock);
  std::vector<GlyphHide::Served> sv; long seq = 0;
  if (found && HideText(v.first, v.second, "d2d", &sv, &seq)) { if (DotMode) LayoutDots(rt, at, layout, brush, v.first, sv, seq); return; } }
 ODrawTextLayout(rt, at, layout, brush, o);
}
// Glyph runs carry glyph indices: they are mapped back through the run's font face to the characters of the current
// and previous line (per face and line). Left-to-right, horizontal runs with advances only; others are left out.
struct { IDWriteFontFace *face = NULL; long seq = -1; std::map<UINT16, wchar_t> map; } RunIndexes;
std::wstring RunText(const DWRITE_GLYPH_RUN *run) {
 std::wstring w; AcquireSRWLockExclusive(&HideLock);
 if (run->fontFace != RunIndexes.face || Hide.Sequence() != RunIndexes.seq) {
  RunIndexes.face = run->fontFace; RunIndexes.seq = Hide.Sequence(); RunIndexes.map.clear(); std::wstring text = Hide.Current() + Hide.Previous();
  std::vector<UINT32> cps(text.begin(), text.end()); std::vector<UINT16> out(cps.size());
  if (!cps.empty() && SUCCEEDED(run->fontFace->GetGlyphIndices(cps.data(), (UINT32)cps.size(), out.data()))) for (size_t i = 0; i < cps.size(); i++) if (out[i]) RunIndexes.map.emplace(out[i], text[i]); }
 for (UINT32 i = 0; i < run->glyphCount; i++) { auto it = RunIndexes.map.find(run->glyphIndices[i]); if (it == RunIndexes.map.end()) { w.clear(); break; } w += it->second; }
 ReleaseSRWLockExclusive(&HideLock); return w;
}
typedef void(STDMETHODCALLTYPE *D2DG)(ID2D1RenderTarget *, D2D1_POINT_2F, const DWRITE_GLYPH_RUN *, ID2D1Brush *, DWRITE_MEASURING_MODE); D2DG ODrawGlyphRun;
void STDMETHODCALLTYPE HDrawGlyphRun(ID2D1RenderTarget *rt, D2D1_POINT_2F at, const DWRITE_GLYPH_RUN *run, ID2D1Brush *brush, DWRITE_MEASURING_MODE mm) {
 if (HideOn && run && run->fontFace && run->glyphIndices && run->glyphCount && run->glyphCount <= 4096) {
  std::wstring text = RunText(run); std::vector<GlyphHide::Served> sv; long seq = 0;
  if (!text.empty() && HideText(text, Face{L"", (int)(run->fontEmSize + .5f), 400}, "run", &sv, &seq)) {
   if (DotMode && run->glyphAdvances && !(run->bidiLevel & 1) && !run->isSideways && sv.size() == text.size()) {
    DWRITE_FONT_METRICS fm{}; run->fontFace->GetMetrics(&fm); float em = fm.designUnitsPerEm ? run->fontEmSize / fm.designUnitsPerEm : 0, asc = fm.ascent * em, desc = fm.descent * em;
    FLOAT dx = 96, dy = 96; rt->GetDpi(&dx, &dy); if (dx <= 0) dx = 96; if (dy <= 0) dy = 96; int h = (int)((asc + desc) * dy / 96.f + .5f), side = PaintDots ? DotSide(h) : 0; float pen = at.x;
    D2D1_ANTIALIAS_MODE mode = rt->GetAntialiasMode(); rt->SetAntialiasMode(D2D1_ANTIALIAS_MODE_ALIASED);
    for (UINT32 i = 0; i < run->glyphCount; i++) { if (sv[i].kind) { float ox = run->glyphOffsets ? run->glyphOffsets[i].advanceOffset : 0, oy = run->glyphOffsets ? run->glyphOffsets[i].ascenderOffset : 0;
      float x = Snap(pen + ox, dx), y = Snap(at.y - asc - oy, dy); if (side) rt->FillRectangle(D2D1::RectF(x, y, x + side * 96.f / dx, y + side * 96.f / dy), brush);
      if (sv[i].kind == 'd') ColorOfD2DBrush(seq, "run", brush);
      ServeDot(seq, "run", Dot{sv[i].index, text[i], h, (int)(asc * dy / 96.f + .5f), (int)(run->glyphAdvances[i] * dx / 96.f + .5f), 0, 0, side, sv[i].kind, PlaceTarget(rt, pen + ox, at.y - asc - oy)}); }
     pen += run->glyphAdvances[i]; }
    rt->SetAntialiasMode(mode); }
   return; } }
 ODrawGlyphRun(rt, at, run, brush, mm);
}

// 2026-11-19 (perf/minhook-freeze): hooks are queued and switched on together by Apply, so each batch freezes the game's
// threads once instead of once per hook (MinHook suspends every other thread for each MH_EnableHook).
bool Hook(HMODULE m, const char *name, void *detour, void **orig) { if (!m) return false; void *fn = (void *)GetProcAddress(m, name); if (!fn) return false; if (MH_CreateHook(fn, detour, orig) != MH_OK) return false; return MH_QueueEnableHook(fn) == MH_OK; }
bool HookAt(void *fn, void *detour, void **orig) { MH_STATUS s = MH_CreateHook(fn, detour, orig); if (s == MH_ERROR_ALREADY_CREATED) return true; return s == MH_OK && MH_QueueEnableHook(fn) == MH_OK; }
bool Apply() { return MH_ApplyQueued() == MH_OK; }
bool GdipDone, DwriteDone, D2dDone;
void LateHooks() {
 HMODULE gp = GetModuleHandleW(L"gdiplus.dll");
 if (gp && !GdipDone) { GdipDone = true;
  GdipGetFamily = (GGF)GetProcAddress(gp, "GdipGetFamily"); GdipGetFamilyName = (GGFN)GetProcAddress(gp, "GdipGetFamilyName"); GdipGetFontSize = (GGS)GetProcAddress(gp, "GdipGetFontSize"); GdipGetFontStyle = (GGST)GetProcAddress(gp, "GdipGetFontStyle");
  Hook(gp, "GdipPrivateAddMemoryFont", (void *)&HGdipPrivateAddMemoryFont, (void **)&OGdipPrivateAddMemoryFont);
  Hook(gp, "GdipPrivateAddFontFile", (void *)&HGdipPrivateAddFontFile, (void **)&OGdipPrivateAddFontFile);
  Hook(gp, "GdipDrawString", (void *)&HGdipDrawString, (void **)&OGdipDrawString);
  bool driver = Hook(gp, "GdipDrawDriverString", (void *)&HGdipDrawDriverString, (void **)&OGdipDrawDriverString);
  GdipDotApis(gp); if (!Apply()) driver = false;
  Send(std::string("ToMe_FONT status gdiplus hooked") + (driver ? " driver" : "")); }
 HMODULE dw = GetModuleHandleW(L"dwrite.dll");
 if (dw && !DwriteDone) { DwriteDone = true;
  typedef HRESULT(WINAPI *DCF)(DWRITE_FACTORY_TYPE, REFIID, IUnknown **); DCF create = (DCF)GetProcAddress(dw, "DWriteCreateFactory"); IDWriteFactory *factory = NULL;
  if (create && SUCCEEDED(create(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), (IUnknown **)&factory)) && factory) {
   void **vt = *(void ***)factory; /* IDWriteFactory: 7 CreateFontFileReference, 15 CreateTextFormat, 18 CreateTextLayout, 19 CreateGdiCompatibleTextLayout */
   bool a = HookAt(vt[15], (void *)&HCreateTextFormat, (void **)&OCreateTextFormat);
   bool b = HookAt(vt[7], (void *)&HCreateFontFileReference, (void **)&OCreateFontFileReference);
   bool c = HookAt(vt[18], (void *)&HCreateTextLayout, (void **)&OCreateTextLayout) && HookAt(vt[19], (void *)&HCreateGdiCompatibleTextLayout, (void **)&OCreateGdiCompatibleTextLayout);
   if (!Apply()) a = b = c = false; factory->Release(); Send(std::string("ToMe_FONT status dwrite hooked ") + (a ? "format" : "-") + (b ? " file" : " -") + (c ? " layout" : " -")); } }
 HMODULE d2 = GetModuleHandleW(L"d2d1.dll");
 if (d2 && !D2dDone) { D2dDone = true;
  // ID2D1RenderTarget: 27 DrawText, 28 DrawTextLayout, 29 DrawGlyphRun. d2d1.dll implements them once for its render targets; the
  // vtable is read from a DC render target made here (no window, nothing drawn).
  typedef HRESULT(WINAPI *D2CF)(D2D1_FACTORY_TYPE, REFIID, const D2D1_FACTORY_OPTIONS *, void **); D2CF create = (D2CF)GetProcAddress(d2, "D2D1CreateFactory"); ID2D1Factory *factory = NULL; ID2D1DCRenderTarget *rt = NULL; bool ok = false, run = false;
  if (create && SUCCEEDED(create(D2D1_FACTORY_TYPE_MULTI_THREADED, __uuidof(ID2D1Factory), NULL, (void **)&factory)) && factory) {
   D2D1_RENDER_TARGET_PROPERTIES props = {D2D1_RENDER_TARGET_TYPE_DEFAULT, {DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED}, 0, 0, D2D1_RENDER_TARGET_USAGE_NONE, D2D1_FEATURE_LEVEL_DEFAULT};
   if (SUCCEEDED(factory->CreateDCRenderTarget(&props, &rt)) && rt) { void **vt = *(void ***)rt; ok = HookAt(vt[27], (void *)&HDrawText, (void **)&ODrawText) && HookAt(vt[28], (void *)&HDrawTextLayout, (void **)&ODrawTextLayout); run = HookAt(vt[29], (void *)&HDrawGlyphRun, (void **)&ODrawGlyphRun); rt->Release(); }
   factory->Release(); }
  if (!Apply()) ok = run = false;
  Send(std::string("ToMe_FONT status d2d1 ") + (ok ? "hooked text" : "not hooked") + (run ? " run" : "")); }
}

DWORD WINAPI Writer(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFont-%lu", GetCurrentProcessId());
 HANDLE pipe = INVALID_HANDLE_VALUE; std::vector<std::string> sent; // replayed to a new connection (HookBridge restarts)
 for (;;) {
  WaitForSingleObject(Wake, 1000);
  std::deque<std::string> batch; EnterCriticalSection(&Gate); batch.swap(Out); LeaveCriticalSection(&Gate);
  for (auto &l : batch) if (sent.size() < 128 && l.rfind("ToMe_GLYPHHIDE ", 0) != 0) sent.push_back(l); // hide reports are live only
  bool fresh = false;
  if (pipe == INVALID_HANDLE_VALUE) { pipe = CreateFileW(name, GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL); if (pipe == INVALID_HANDLE_VALUE) continue; fresh = true; }
  const std::vector<std::string> all = fresh ? sent : std::vector<std::string>(batch.begin(), batch.end());
  for (auto &line : all) { std::string data = line + "\n"; DWORD done = 0; if (!WriteFile(pipe, data.data(), (DWORD)data.size(), &done, NULL) || done != data.size()) { CloseHandle(pipe); pipe = INVALID_HANDLE_VALUE; break; } }
 }
}

DWORD WINAPI Run(void *) {
 { wchar_t self[1024], game[1024];
  if (GetModuleFileNameW(Self, self, 1024) && GetModuleFileNameW(NULL, game, 1024)) {
   for (int k = 0; k < 2; k++) { wchar_t *s = wcsrchr(self, L'\\'); if (s) *s = 0; }
   wchar_t *g = wcsrchr(game, L'\\'); if (g) *g = 0;
   unsigned hash = 2166136261u; for (wchar_t *p = game; *p; p++) { wchar_t c = (wchar_t)towlower(*p); hash = (hash ^ (unsigned)c) * 16777619u; }
   swprintf_s(Dir, L"%s\\cache", self); CreateDirectoryW(Dir, NULL); swprintf_s(Dir, L"%s\\cache\\font-probe", self); CreateDirectoryW(Dir, NULL);
   swprintf_s(Dir, L"%s\\cache\\font-probe\\%08x\\", self, hash); if (!CreateDirectoryW(Dir, NULL) && GetLastError() != ERROR_ALREADY_EXISTS) Dir[0] = 0; } }
 Hide.Report = [](const std::string &line) { Send(line); };
 HANDLE w = CreateThread(NULL, 0, Writer, NULL, 0, NULL); if (w) CloseHandle(w);
 HANDLE fl = CreateThread(NULL, 0, DotFlusher, NULL, 0, NULL); if (fl) CloseHandle(fl);
 HANDLE bw = CreateThread(NULL, 0, BeatWatch, NULL, 0, NULL); if (bw) CloseHandle(bw);
 if (MH_Initialize() != MH_OK) { Send("ToMe_FONT status off: minhook"); return 0; }
 HMODULE gdi = GetModuleHandleW(L"gdi32.dll"); if (!gdi) gdi = LoadLibraryW(L"gdi32.dll");
 int n = 0;
 n += Hook(gdi, "CreateFontIndirectA", (void *)&HCreateFontIndirectA, (void **)&OCreateFontIndirectA);
 n += Hook(gdi, "CreateFontA", (void *)&HCreateFontA, (void **)&OCreateFontA);
 n += Hook(gdi, "ExtTextOutW", (void *)&HExtTextOutW, (void **)&OExtTextOutW);
 n += Hook(gdi, "ExtTextOutA", (void *)&HExtTextOutA, (void **)&OExtTextOutA);
 n += Hook(gdi, "TextOutW", (void *)&HTextOutW, (void **)&OTextOutW);
 n += Hook(gdi, "TextOutA", (void *)&HTextOutA, (void **)&OTextOutA);
 n += Hook(gdi, "GetGlyphOutlineW", (void *)&HGetGlyphOutlineW, (void **)&OGetGlyphOutlineW);
 n += Hook(gdi, "GetGlyphOutlineA", (void *)&HGetGlyphOutlineA, (void **)&OGetGlyphOutlineA);
 n += Hook(gdi, "AddFontMemResourceEx", (void *)&HAddFontMemResourceEx, (void **)&OAddFontMemResourceEx);
 n += Hook(gdi, "AddFontResourceExW", (void *)&HAddFontResourceExW, (void **)&OAddFontResourceExW);
 n += Hook(gdi, "AddFontResourceExA", (void *)&HAddFontResourceExA, (void **)&OAddFontResourceExA);
 if (!Apply()) n = 0;
 Send("ToMe_FONT status gdi hooks " + std::to_string(n) + "/11");
 // Early injection (MeguLitLaunch<bit>.exe, docs/text-architecture.md): the starting mode and dialogue font come from the
 // game's environment, since HookBridge connects only later; then the launcher is told the hooks are in place.
 { wchar_t v[128]; if (GetEnvironmentVariableW(L"MEGULIT_GLYPH_MODE", v, 128) && (!wcscmp(v, L"dot") || !wcscmp(v, L"dot-blind") || !wcscmp(v, L"blank") || !wcscmp(v, L"blank-blind") || !wcscmp(v, L"place") || !wcscmp(v, L"place-blind"))) Command(std::string("MODE ") + Utf8(v));
  if (GetEnvironmentVariableW(L"MEGULIT_GLYPH_FONT", v, 128) && v[0]) Command("FONT " + Utf8(v));
  wchar_t ready[64]; swprintf_s(ready, L"MeguLitFontReady-%lu", GetCurrentProcessId()); HANDLE e = OpenEventW(EVENT_MODIFY_STATE, FALSE, ready); if (e) { SetEvent(e); CloseHandle(e); } }
 HANDLE ctl = CreateThread(NULL, 0, Control, NULL, 0, NULL); if (ctl) CloseHandle(ctl); // after the hooks: a pushed line always meets them
 for (;;) { LateHooks(); Report(); if (!GgoReported && GgoChar + GgoIndex + GgoMetrics >= 200) { GgoReported = 1; std::string top; EnterCriticalSection(&Gate); for (auto &sc : Scores) if (top.size() < 300) top += " " + sc.src + ":" + Utf8(sc.face.name) + "/" + std::to_string(sc.face.size) + "=" + std::to_string(sc.chars); LeaveCriticalSection(&Gate); Send("ToMe_FONT status ggo char=" + std::to_string(GgoChar) + " index=" + std::to_string(GgoIndex) + " metrics=" + std::to_string(GgoMetrics) + " mono=" + std::to_string(GgoFormat[GGO_BITMAP]) + " gray2=" + std::to_string(GgoFormat[GGO_GRAY2_BITMAP]) + " gray4=" + std::to_string(GgoFormat[GGO_GRAY4_BITMAP]) + " gray8=" + std::to_string(GgoFormat[GGO_GRAY8_BITMAP]) + " outline=" + std::to_string(GgoFormat[GGO_NATIVE] + GgoFormat[GGO_BEZIER]) + " scores" + top); } Sleep(1000); }
}
} // namespace

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, void *) {
 if (reason == DLL_PROCESS_ATTACH) {
  Self = h; LoadedAt = GetTickCount64(); DisableThreadLibraryCalls(h); InitializeCriticalSection(&Gate); Wake = CreateEventW(NULL, FALSE, FALSE, NULL);
  HMODULE pin; GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN, (LPCWSTR)&DllMain, &pin);
  HANDLE t = CreateThread(NULL, 0, Run, NULL, 0, NULL); if (t) CloseHandle(t);
 }
 return TRUE;
}
