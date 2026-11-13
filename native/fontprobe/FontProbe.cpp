// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitFont32/64.dll: which font does the game really draw its Japanese text with? (user, 2026-11-13: 自动读内存来导入游戏字体)
// Loaded by HookBridge into every bound game (all engines). Read-only: every hook calls the original unchanged.
//  - font creation: CreateFontIndirectA/W, CreateFontA (the A face is decoded as CP932 first, so a Japanese game on a
//    Chinese system does not report a CP936-garbled name), GDI+ GdipCreateFontFamilyFromName;
//  - drawing: ExtTextOutA/W, TextOutA/W, GetGlyphOutlineA/W, GdipDrawString count Japanese characters per font that is
//    selected while they are drawn; the font with the most characters is the one that draws the dialogue;
//  - DirectWrite: IDWriteFactory::CreateTextFormat (family, size, weight) when the game already loaded dwrite.dll;
//  - private fonts: AddFontMemResourceEx and GdipPrivateAddMemoryFont data is copied to
//    <MeguLit>\cache\font-probe\<game key>\mem-<hash>.ttf; AddFontResourceExA/W, GdipPrivateAddFontFile and
//    IDWriteFactory::CreateFontFileReference outside the Windows font folder report the file path.
// Lines to HookBridge over \\.\pipe\MeguLitFont-<pid>:
//   ToMe_FONT src=gdi|gdip|dwrite size=<px> weight=<100..900> chars=<n> face=<face>
//   ToMe_FONTFILE kind=mem|file path=<utf-8 path>
#include <windows.h>
#include <dwrite.h>
#include <string>
#include <deque>
#include <vector>
#include <map>
#include <set>
#include "../scncapture/minhook/include/MinHook.h"

namespace {
HMODULE Self; CRITICAL_SECTION Gate; HANDLE Wake; std::deque<std::string> Out; wchar_t Dir[1024];

std::string Utf8(const std::wstring &w) { if (w.empty()) return ""; int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), NULL, 0, NULL, NULL); std::string s(n, 0); WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, NULL, NULL); return s; }
void Send(const std::string &line) { EnterCriticalSection(&Gate); if (Out.size() < 256) Out.push_back(line); LeaveCriticalSection(&Gate); SetEvent(Wake); }
// A game's ANSI face name is in its own code page: Japanese games use 932 whatever the system code page is.
std::wstring Ansi(const char *s, int len = -1) {
 if (!s) return L""; for (UINT cp : {932u, (UINT)CP_ACP}) { int n = MultiByteToWideChar(cp, MB_ERR_INVALID_CHARS, s, len, NULL, 0); if (n <= 0) continue; std::wstring w(n, 0); MultiByteToWideChar(cp, MB_ERR_INVALID_CHARS, s, len, &w[0], n); while (!w.empty() && !w.back()) w.pop_back(); return w; }
 return L"";
}
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
// The leader is reported once it has drawn 30 characters and whenever another font overtakes it by a third.
void Report() {
 std::string line; EnterCriticalSection(&Gate);
 const Score *best = NULL; for (auto &s : Scores) if (!best || s.chars > best->chars) best = &s;
 if (best && best->chars >= 30) {
  line = "ToMe_FONT src=" + best->src + " size=" + std::to_string(best->face.size) + " weight=" + std::to_string(best->face.weight) + " chars=" + std::to_string(best->chars) + " face=" + Utf8(best->face.name);
  std::string key = best->src + "|" + Utf8(best->face.name) + "|" + std::to_string(best->face.size) + "|" + std::to_string(best->face.weight);
  if (key == Reported) line.clear(); else Reported = key;
 }
 LeaveCriticalSection(&Gate); if (!line.empty()) Send(line);
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
BOOL WINAPI HExtTextOutW(HDC dc, int x, int y, UINT o, const RECT *r, LPCWSTR s, UINT n, const INT *dx) { if (!(o & ETO_GLYPH_INDEX)) { int k = CountW(s, (int)n); if (k) Count("gdi", FaceOf(dc), k); } return OExtTextOutW(dc, x, y, o, r, s, n, dx); }
BOOL WINAPI HExtTextOutA(HDC dc, int x, int y, UINT o, const RECT *r, LPCSTR s, UINT n, const INT *dx) { if (!(o & ETO_GLYPH_INDEX)) { int k = CountA(s, (int)n); if (k) Count("gdi", FaceOf(dc), k); } return OExtTextOutA(dc, x, y, o, r, s, n, dx); }
BOOL WINAPI HTextOutW(HDC dc, int x, int y, LPCWSTR s, int n) { int k = CountW(s, n); if (k) Count("gdi", FaceOf(dc), k); return OTextOutW(dc, x, y, s, n); }
BOOL WINAPI HTextOutA(HDC dc, int x, int y, LPCSTR s, int n) { int k = CountA(s, n); if (k) Count("gdi", FaceOf(dc), k); return OTextOutA(dc, x, y, s, n); }
// Most visual novel engines rasterise their text one character at a time with GetGlyphOutline. Every call counts one
// character; engines that ask the size first count twice, which ranks every font of that engine alike.
DWORD WINAPI HGetGlyphOutlineW(HDC dc, UINT c, UINT f, LPGLYPHMETRICS gm, DWORD n, LPVOID b, const MAT2 *m) { if (!(f & GGO_GLYPH_INDEX) && c < 0x10000 && Japanese((wchar_t)c)) Count("gdi", FaceOf(dc), 1); return OGetGlyphOutlineW(dc, c, f, gm, n, b, m); }
DWORD WINAPI HGetGlyphOutlineA(HDC dc, UINT c, UINT f, LPGLYPHMETRICS gm, DWORD n, LPVOID b, const MAT2 *m) { if (!(f & GGO_GLYPH_INDEX) && c > 0x8100) Count("gdi", FaceOf(dc), 1); return OGetGlyphOutlineA(dc, c, f, gm, n, b, m); }
HANDLE WINAPI HAddFontMemResourceEx(PVOID p, DWORD n, PVOID r, DWORD *k) { HANDLE h = OAddFontMemResourceEx(p, n, r, k); if (h) SaveMemory(p, n); return h; }
int WINAPI HAddFontResourceExW(LPCWSTR f, DWORD fl, PVOID r) { int n = OAddFontResourceExW(f, fl, r); if (n > 0 && f) ReportFile(f); return n; }
int WINAPI HAddFontResourceExA(LPCSTR f, DWORD fl, PVOID r) { int n = OAddFontResourceExA(f, fl, r); if (n > 0 && f) ReportFile(Ansi(f)); return n; }

// ---- GDI+ ------------------------------------------------------------------------------------------------------------
typedef int(WINAPI *GPAM)(void *, const void *, INT); GPAM OGdipPrivateAddMemoryFont;
typedef int(WINAPI *GPAF)(void *, const WCHAR *); GPAF OGdipPrivateAddFontFile;
typedef int(WINAPI *GDS)(void *, const WCHAR *, INT, void *, const void *, const void *, const void *); GDS OGdipDrawString;
typedef int(WINAPI *GGF)(void *, void **); GGF GdipGetFamily;
typedef int(WINAPI *GGFN)(void *, WCHAR *, WORD); GGFN GdipGetFamilyName;
typedef int(WINAPI *GGS)(void *, float *); GGS GdipGetFontSize;
typedef int(WINAPI *GGST)(void *, INT *); GGST GdipGetFontStyle;
int WINAPI HGdipPrivateAddMemoryFont(void *c, const void *m, INT n) { int r = OGdipPrivateAddMemoryFont(c, m, n); if (r == 0) SaveMemory(m, (DWORD)n); return r; }
int WINAPI HGdipPrivateAddFontFile(void *c, const WCHAR *f) { int r = OGdipPrivateAddFontFile(c, f); if (r == 0 && f) ReportFile(f); return r; }
int WINAPI HGdipDrawString(void *g, const WCHAR *s, INT n, void *font, const void *rc, const void *fmt, const void *br) {
 int len = n < 0 && s ? (int)wcsnlen(s, 4096) : n, k = CountW(s, len);
 if (k && font && GdipGetFamily && GdipGetFamilyName) { void *fam = NULL; WCHAR name[LF_FACESIZE] = {}; float size = 0; INT style = 0;
  if (GdipGetFamily(font, &fam) == 0 && GdipGetFamilyName(fam, name, 0) == 0) { if (GdipGetFontSize) GdipGetFontSize(font, &size); if (GdipGetFontStyle) GdipGetFontStyle(font, &style); Count("gdip", Face{Clean(name), (int)(size + .5f), (style & 1) ? 700 : 400}, k); } }
 return OGdipDrawString(g, s, n, font, rc, fmt, br);
}

// ---- DirectWrite -----------------------------------------------------------------------------------------------------
typedef HRESULT(STDMETHODCALLTYPE *CTF)(IDWriteFactory *, const WCHAR *, IDWriteFontCollection *, DWRITE_FONT_WEIGHT, DWRITE_FONT_STYLE, DWRITE_FONT_STRETCH, FLOAT, const WCHAR *, IDWriteTextFormat **); CTF OCreateTextFormat;
typedef HRESULT(STDMETHODCALLTYPE *CFFR)(IDWriteFactory *, const WCHAR *, const FILETIME *, IDWriteFontFile **); CFFR OCreateFontFileReference;
// No characters are known here: each text format counts 8, so a DirectWrite game reports the format it creates most.
HRESULT STDMETHODCALLTYPE HCreateTextFormat(IDWriteFactory *f, const WCHAR *family, IDWriteFontCollection *c, DWRITE_FONT_WEIGHT w, DWRITE_FONT_STYLE s, DWRITE_FONT_STRETCH st, FLOAT size, const WCHAR *loc, IDWriteTextFormat **out) {
 if (family) Count("dwrite", Face{Clean(family), (int)(size + .5f), (int)w}, 8); return OCreateTextFormat(f, family, c, w, s, st, size, loc, out); }
HRESULT STDMETHODCALLTYPE HCreateFontFileReference(IDWriteFactory *f, const WCHAR *p, const FILETIME *t, IDWriteFontFile **out) { HRESULT r = OCreateFontFileReference(f, p, t, out); if (SUCCEEDED(r) && p) ReportFile(p); return r; }

bool Hook(HMODULE m, const char *name, void *detour, void **orig) { if (!m) return false; void *fn = (void *)GetProcAddress(m, name); if (!fn) return false; if (MH_CreateHook(fn, detour, orig) != MH_OK) return false; return MH_EnableHook(fn) == MH_OK; }
bool GdipDone, DwriteDone;
void LateHooks() {
 HMODULE gp = GetModuleHandleW(L"gdiplus.dll");
 if (gp && !GdipDone) { GdipDone = true;
  GdipGetFamily = (GGF)GetProcAddress(gp, "GdipGetFamily"); GdipGetFamilyName = (GGFN)GetProcAddress(gp, "GdipGetFamilyName"); GdipGetFontSize = (GGS)GetProcAddress(gp, "GdipGetFontSize"); GdipGetFontStyle = (GGST)GetProcAddress(gp, "GdipGetFontStyle");
  Hook(gp, "GdipPrivateAddMemoryFont", (void *)&HGdipPrivateAddMemoryFont, (void **)&OGdipPrivateAddMemoryFont);
  Hook(gp, "GdipPrivateAddFontFile", (void *)&HGdipPrivateAddFontFile, (void **)&OGdipPrivateAddFontFile);
  Hook(gp, "GdipDrawString", (void *)&HGdipDrawString, (void **)&OGdipDrawString);
  Send("ToMe_FONT status gdiplus hooked"); }
 HMODULE dw = GetModuleHandleW(L"dwrite.dll");
 if (dw && !DwriteDone) { DwriteDone = true;
  typedef HRESULT(WINAPI *DCF)(DWRITE_FACTORY_TYPE, REFIID, IUnknown **); DCF create = (DCF)GetProcAddress(dw, "DWriteCreateFactory"); IDWriteFactory *factory = NULL;
  if (create && SUCCEEDED(create(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), (IUnknown **)&factory)) && factory) {
   void **vt = *(void ***)factory; /* IDWriteFactory: 7 CreateFontFileReference, 15 CreateTextFormat */
   bool a = MH_CreateHook(vt[15], (void *)&HCreateTextFormat, (void **)&OCreateTextFormat) == MH_OK && MH_EnableHook(vt[15]) == MH_OK;
   bool b = MH_CreateHook(vt[7], (void *)&HCreateFontFileReference, (void **)&OCreateFontFileReference) == MH_OK && MH_EnableHook(vt[7]) == MH_OK;
   factory->Release(); Send(std::string("ToMe_FONT status dwrite hooked ") + (a ? "format" : "-") + (b ? " file" : " -")); } }
}

DWORD WINAPI Writer(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFont-%lu", GetCurrentProcessId());
 HANDLE pipe = INVALID_HANDLE_VALUE; std::vector<std::string> sent; // replayed to a new connection (HookBridge restarts)
 for (;;) {
  WaitForSingleObject(Wake, 1000);
  std::deque<std::string> batch; EnterCriticalSection(&Gate); batch.swap(Out); LeaveCriticalSection(&Gate);
  for (auto &l : batch) if (sent.size() < 128) sent.push_back(l);
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
 for (;;) { Sleep(1000); LateHooks(); Report(); }
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
