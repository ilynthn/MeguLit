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
// MeguLitFontVersionTag "MeguLitFont version=<n>"; 2 = glyph hide. On each control connection the DLL answers
// "ToMe_GLYPHHIDE ready version=<n>" so HookBridge knows the hide side is really there.
#include <windows.h>
#include <dwrite.h>
#include <d2d1.h>
#include <string>
#include <deque>
#include <vector>
#include <map>
#include <set>
#include "../scncapture/minhook/include/MinHook.h"
#include "GlyphMatch.h"

#define MEGULIT_FONT_VERSION 2
extern "C" __declspec(dllexport) const char MeguLitFontVersionTag[] = "MeguLitFont version=2";
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
 if (f.size == 0) { TEXTMETRICW tm{}; if (GetTextMetricsW(dc, &tm)) f.size = tm.tmHeight - tm.tmInternalLeading; }
 return f;
}

// ---- glyph hide state: GlyphMatch.h decides, HideLock guards it (never taken while holding Gate) ------------------------
SRWLOCK HideLock = SRWLOCK_INIT; GlyphHide::Matcher Hide; volatile LONG HideOn = 0;
struct IndexMap { HFONT font = NULL; long seq = -1; std::map<WORD, wchar_t> map; } Indexes;
GlyphHide::Key KeyOf(const Face &f) { GlyphHide::Key k; k.face = f.name; k.size = f.size; return k; }
void Command(std::string l) {
 while (!l.empty() && (l.back() == '\r' || l.back() == '\n')) l.pop_back();
 AcquireSRWLockExclusive(&HideLock);
 if (l.rfind("LINE ", 0) == 0) { Hide.SetLine(Wide(l.substr(5)), GetTickCount()); InterlockedExchange(&HideOn, Hide.Cached() ? 0 : 1); }
 else if (l == "OFF") { Hide.Off(); InterlockedExchange(&HideOn, 0); }
 else if (l.rfind("FONT ", 0) == 0) { size_t sp = l.find(' ', 5); if (sp != std::string::npos) { GlyphHide::Key k; k.size = atoi(l.substr(5, sp - 5).c_str()); k.face = Clean(Wide(l.substr(sp + 1))); Hide.Seed(k); } }
 ReleaseSRWLockExclusive(&HideLock);
}
DWORD WINAPI Control(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFontCtl-%lu", GetCurrentProcessId());
 for (;;) {
  HANDLE p = CreateFileW(name, GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL); if (p == INVALID_HANDLE_VALUE) { Sleep(1000); continue; }
  Send("ToMe_GLYPHHIDE ready version=" + std::to_string(MEGULIT_FONT_VERSION));
  std::string buf; char chunk[4096]; DWORD n = 0;
  while (ReadFile(p, chunk, sizeof chunk, &n, NULL) && n) { buf.append(chunk, n); size_t e; while ((e = buf.find('\n')) != std::string::npos) { Command(buf.substr(0, e)); buf.erase(0, e + 1); } if (buf.size() > 65536) buf.clear(); }
  CloseHandle(p); Command("OFF"); Sleep(500); // HookBridge gone: nothing stays hidden
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
// One glyph; dc may be NULL when c is already a character.
bool HideGlyph(HDC dc, UINT c, bool index, const Face &f, bool render) {
 AcquireSRWLockExclusive(&HideLock);
 wchar_t ch = index ? FromIndex(dc, c) : (wchar_t)c;
 bool r = ch && Hide.Glyph(ch, KeyOf(f), GetTickCount(), render, "ggo"); AfterDecision();
 ReleaseSRWLockExclusive(&HideLock); return r;
}
bool HideText(const std::wstring &s, const Face &f, const char *path) {
 if (s.empty()) return false;
 AcquireSRWLockExclusive(&HideLock); bool r = Hide.Text(s, KeyOf(f), GetTickCount(), path); AfterDecision(); ReleaseSRWLockExclusive(&HideLock); return r;
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
void SaveMemory(const void *data, DWORD size) {
 if (!data || size < 1024 || size > 60u * 1024 * 1024 || !Dir[0]) return;
 unsigned h = 2166136261u; const unsigned char *p = (const unsigned char *)data; for (DWORD i = 0; i < size; i += (size > 65536 ? 7 : 1)) h = (h ^ p[i]) * 16777619u; h ^= size;
 EnterCriticalSection(&Gate); bool fresh = Saved.insert(h).second; LeaveCriticalSection(&Gate); if (!fresh) return;
 wchar_t path[1200]; swprintf_s(path, L"%smem-%08x.ttf", Dir, h);
 if (GetFileAttributesW(path) == INVALID_FILE_ATTRIBUTES) { HANDLE f = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL); if (f == INVALID_HANDLE_VALUE) return; DWORD done = 0; BOOL ok = WriteFile(f, data, size, &done, NULL); CloseHandle(f); if (!ok || done != size) { DeleteFileW(path); return; } }
 Send("ToMe_FONTFILE kind=mem path=" + Utf8(path));
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
BOOL WINAPI HExtTextOutW(HDC dc, int x, int y, UINT o, const RECT *r, LPCWSTR s, UINT n, const INT *dx) {
 if (!(o & ETO_GLYPH_INDEX)) { int k = CountW(s, (int)n); if (k) Count("gdi", FaceOf(dc), k); }
 if (HideOn && s && n && n <= 4096) { const WORD *g = (o & ETO_GLYPH_INDEX) ? (const WORD *)s : NULL; std::wstring text = g ? FromIndices(dc, g, n) : std::wstring(s, n); if (HideText(text, FaceOf(dc), "text")) return Skipped(dc, x, y, o, r, text, g, n); }
 return OExtTextOutW(dc, x, y, o, r, s, n, dx);
}
BOOL WINAPI HExtTextOutA(HDC dc, int x, int y, UINT o, const RECT *r, LPCSTR s, UINT n, const INT *dx) {
 if (!(o & ETO_GLYPH_INDEX)) { int k = CountA(s, (int)n); if (k) Count("gdi", FaceOf(dc), k); }
 if (HideOn && s && n && n <= 8192) { const WORD *g = (o & ETO_GLYPH_INDEX) ? (const WORD *)s : NULL; std::wstring text = g ? FromIndices(dc, g, n) : GameText(s, (int)n); if (HideText(text, FaceOf(dc), "text")) return Skipped(dc, x, y, o, r, text, g, n); }
 return OExtTextOutA(dc, x, y, o, r, s, n, dx);
}
BOOL WINAPI HTextOutW(HDC dc, int x, int y, LPCWSTR s, int n) {
 int k = CountW(s, n); if (k) Count("gdi", FaceOf(dc), k);
 if (HideOn && s && n > 0 && n <= 4096) { std::wstring text(s, n); if (HideText(text, FaceOf(dc), "text")) return Skipped(dc, x, y, 0, NULL, text, NULL, 0); }
 return OTextOutW(dc, x, y, s, n);
}
BOOL WINAPI HTextOutA(HDC dc, int x, int y, LPCSTR s, int n) {
 int k = CountA(s, n); if (k) Count("gdi", FaceOf(dc), k);
 if (HideOn && s && n > 0 && n <= 8192) { std::wstring text = GameText(s, n); if (HideText(text, FaceOf(dc), "text")) return Skipped(dc, x, y, 0, NULL, text, NULL, 0); }
 return OTextOutA(dc, x, y, s, n);
}
// Most visual novel engines rasterise their text one character at a time with GetGlyphOutline. Every call counts one
// character; engines that ask the size first count twice, which ranks every font of that engine alike.
// Hidden glyphs keep their GLYPHMETRICS and return value (layout and advance unchanged); only the pixels are blank.
DWORD WINAPI HGetGlyphOutlineW(HDC dc, UINT c, UINT f, LPGLYPHMETRICS gm, DWORD n, LPVOID b, const MAT2 *m) {
 bool index = (f & GGO_GLYPH_INDEX) != 0; Face face{L"", 0, 400}; bool known = false;
 if (!index && c < 0x10000 && Japanese((wchar_t)c)) { face = FaceOf(dc); known = true; Count("gdi", face, 1); }
 bool hide = HideOn && c && c < 0x10000 && HideGlyph(dc, c, index, known ? face : FaceOf(dc), (f & 0x0f) != GGO_METRICS);
 DWORD r = OGetGlyphOutlineW(dc, c, f, gm, n, b, m);
 if (hide && r != GDI_ERROR && b && n) BlankGlyph(f, b, r < n ? r : n);
 return r;
}
DWORD WINAPI HGetGlyphOutlineA(HDC dc, UINT c, UINT f, LPGLYPHMETRICS gm, DWORD n, LPVOID b, const MAT2 *m) {
 bool index = (f & GGO_GLYPH_INDEX) != 0; if (!index && c > 0x8100) Count("gdi", FaceOf(dc), 1);
 bool hide = false;
 if (HideOn && c) { UINT ch = c; if (!index) { char bytes[2]; int len = 0; if (c > 0xff) bytes[len++] = (char)(c >> 8); bytes[len++] = (char)(c & 0xff); std::wstring w = GameText(bytes, len); ch = w.size() == 1 ? w[0] : 0; }
  hide = ch && HideGlyph(dc, ch, index, FaceOf(dc), (f & 0x0f) != GGO_METRICS); }
 DWORD r = OGetGlyphOutlineA(dc, c, f, gm, n, b, m);
 if (hide && r != GDI_ERROR && b && n) BlankGlyph(f, b, r < n ? r : n);
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
int WINAPI HGdipDrawString(void *g, const WCHAR *s, INT n, void *font, const void *rc, const void *fmt, const void *br) {
 int len = n < 0 && s ? (int)wcsnlen(s, 4096) : n, k = CountW(s, len); Face face; bool known = (k || HideOn) && GdipFace(font, face);
 if (k && known) Count("gdip", face, k);
 if (HideOn && known && s && len > 0 && len <= 4096 && HideText(std::wstring(s, len), face, "gdip")) return 0;
 return OGdipDrawString(g, s, n, font, rc, fmt, br);
}
// flags & 1 (DriverStringOptionsCmapLookup): text holds characters; otherwise glyph indices, left alone.
int WINAPI HGdipDrawDriverString(void *g, const UINT16 *s, INT n, const void *font, const void *br, const void *pos, INT flags, const void *m) {
 if (HideOn && s && (flags & 1)) { int len = n < 0 ? (int)wcsnlen((const wchar_t *)s, 4096) : n; Face face; if (len > 0 && len <= 4096 && GdipFace(font, face) && HideText(std::wstring((const wchar_t *)s, len), face, "gdip")) return 0; }
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
void STDMETHODCALLTYPE HDrawText(ID2D1RenderTarget *rt, const WCHAR *s, UINT32 n, IDWriteTextFormat *format, const D2D1_RECT_F *rc, ID2D1Brush *brush, D2D1_DRAW_TEXT_OPTIONS o, DWRITE_MEASURING_MODE mm) {
 if (HideOn && s && n > 0 && n <= 4096 && HideText(std::wstring(s, n), FormatFace(format), "d2d")) return;
 ODrawText(rt, s, n, format, rc, brush, o, mm);
}
void STDMETHODCALLTYPE HDrawTextLayout(ID2D1RenderTarget *rt, D2D1_POINT_2F at, IDWriteTextLayout *layout, ID2D1Brush *brush, D2D1_DRAW_TEXT_OPTIONS o) {
 if (HideOn && layout) { std::pair<std::wstring, Face> v; bool found = false; AcquireSRWLockShared(&LayoutLock); auto it = Layouts.find(layout); if (it != Layouts.end()) { v = it->second; found = true; } ReleaseSRWLockShared(&LayoutLock);
  if (found && HideText(v.first, v.second, "d2d")) return; }
 ODrawTextLayout(rt, at, layout, brush, o);
}

bool Hook(HMODULE m, const char *name, void *detour, void **orig) { if (!m) return false; void *fn = (void *)GetProcAddress(m, name); if (!fn) return false; if (MH_CreateHook(fn, detour, orig) != MH_OK) return false; return MH_EnableHook(fn) == MH_OK; }
bool HookAt(void *fn, void *detour, void **orig) { MH_STATUS s = MH_CreateHook(fn, detour, orig); if (s == MH_ERROR_ALREADY_CREATED) return true; return s == MH_OK && MH_EnableHook(fn) == MH_OK; }
bool GdipDone, DwriteDone, D2dDone;
void LateHooks() {
 HMODULE gp = GetModuleHandleW(L"gdiplus.dll");
 if (gp && !GdipDone) { GdipDone = true;
  GdipGetFamily = (GGF)GetProcAddress(gp, "GdipGetFamily"); GdipGetFamilyName = (GGFN)GetProcAddress(gp, "GdipGetFamilyName"); GdipGetFontSize = (GGS)GetProcAddress(gp, "GdipGetFontSize"); GdipGetFontStyle = (GGST)GetProcAddress(gp, "GdipGetFontStyle");
  Hook(gp, "GdipPrivateAddMemoryFont", (void *)&HGdipPrivateAddMemoryFont, (void **)&OGdipPrivateAddMemoryFont);
  Hook(gp, "GdipPrivateAddFontFile", (void *)&HGdipPrivateAddFontFile, (void **)&OGdipPrivateAddFontFile);
  Hook(gp, "GdipDrawString", (void *)&HGdipDrawString, (void **)&OGdipDrawString);
  bool driver = Hook(gp, "GdipDrawDriverString", (void *)&HGdipDrawDriverString, (void **)&OGdipDrawDriverString);
  Send(std::string("ToMe_FONT status gdiplus hooked") + (driver ? " driver" : "")); }
 HMODULE dw = GetModuleHandleW(L"dwrite.dll");
 if (dw && !DwriteDone) { DwriteDone = true;
  typedef HRESULT(WINAPI *DCF)(DWRITE_FACTORY_TYPE, REFIID, IUnknown **); DCF create = (DCF)GetProcAddress(dw, "DWriteCreateFactory"); IDWriteFactory *factory = NULL;
  if (create && SUCCEEDED(create(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), (IUnknown **)&factory)) && factory) {
   void **vt = *(void ***)factory; /* IDWriteFactory: 7 CreateFontFileReference, 15 CreateTextFormat, 18 CreateTextLayout, 19 CreateGdiCompatibleTextLayout */
   bool a = HookAt(vt[15], (void *)&HCreateTextFormat, (void **)&OCreateTextFormat);
   bool b = HookAt(vt[7], (void *)&HCreateFontFileReference, (void **)&OCreateFontFileReference);
   bool c = HookAt(vt[18], (void *)&HCreateTextLayout, (void **)&OCreateTextLayout) && HookAt(vt[19], (void *)&HCreateGdiCompatibleTextLayout, (void **)&OCreateGdiCompatibleTextLayout);
   factory->Release(); Send(std::string("ToMe_FONT status dwrite hooked ") + (a ? "format" : "-") + (b ? " file" : " -") + (c ? " layout" : " -")); } }
 HMODULE d2 = GetModuleHandleW(L"d2d1.dll");
 if (d2 && !D2dDone) { D2dDone = true;
  // ID2D1RenderTarget: 27 DrawText, 28 DrawTextLayout. d2d1.dll implements them once for its render targets; the
  // vtable is read from a DC render target made here (no window, nothing drawn).
  typedef HRESULT(WINAPI *D2CF)(D2D1_FACTORY_TYPE, REFIID, const D2D1_FACTORY_OPTIONS *, void **); D2CF create = (D2CF)GetProcAddress(d2, "D2D1CreateFactory"); ID2D1Factory *factory = NULL; ID2D1DCRenderTarget *rt = NULL; bool ok = false;
  if (create && SUCCEEDED(create(D2D1_FACTORY_TYPE_MULTI_THREADED, __uuidof(ID2D1Factory), NULL, (void **)&factory)) && factory) {
   D2D1_RENDER_TARGET_PROPERTIES props = {D2D1_RENDER_TARGET_TYPE_DEFAULT, {DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED}, 0, 0, D2D1_RENDER_TARGET_USAGE_NONE, D2D1_FEATURE_LEVEL_DEFAULT};
   if (SUCCEEDED(factory->CreateDCRenderTarget(&props, &rt)) && rt) { void **vt = *(void ***)rt; ok = HookAt(vt[27], (void *)&HDrawText, (void **)&ODrawText) && HookAt(vt[28], (void *)&HDrawTextLayout, (void **)&ODrawTextLayout); rt->Release(); }
   factory->Release(); }
  Send(std::string("ToMe_FONT status d2d1 ") + (ok ? "hooked text" : "not hooked")); }
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
 Send("ToMe_FONT status gdi hooks " + std::to_string(n) + "/11");
 HANDLE ctl = CreateThread(NULL, 0, Control, NULL, 0, NULL); if (ctl) CloseHandle(ctl); // after the hooks: a pushed line always meets them
 for (;;) { LateHooks(); Report(); Sleep(1000); }
}
} // namespace

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, void *) {
 if (reason == DLL_PROCESS_ATTACH) {
  Self = h; DisableThreadLibraryCalls(h); InitializeCriticalSection(&Gate); Wake = CreateEventW(NULL, FALSE, FALSE, NULL);
  HMODULE pin; GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN, (LPCWSTR)&DllMain, &pin);
  HANDLE t = CreateThread(NULL, 0, Run, NULL, 0, NULL); if (t) CloseHandle(t);
 }
 return TRUE;
}
