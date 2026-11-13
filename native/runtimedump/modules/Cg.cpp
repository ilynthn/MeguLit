// SPDX-License-Identifier: GPL-3.0-or-later
// Runtime CG unlock, module Cg of MeguLitDump32/64.dll (modules.h: CgStart/CgTick; plain buffers arrive via DumpSink).
// Engine-independent: whatever the archive cipher, the game must hold a plain PNG/JPEG/BMP/WebP/TLG file image in its
// own memory before it can decode a CG. RuntimeDump hands this module every buffer a tracked file read turns into (in
// place, fresh buffer, decompressor output, loose picture files); each one that starts with an image magic and is at
// least CG-sized becomes a candidate, kept in memory only (total bytes capped, oldest dropped first).
//
// NO SPOILERS: loading is not seeing (games preload the next CG, galleries load tables). A candidate is recorded only when
// the game's own window shows it: about once a second, while a decoded candidate waits, a 32x18 grey signature of the
// window (PrintWindow, so the window may be covered or off screen; skipped while the window hangs) is compared with each
// candidate's signature (decoded with WIC, scaled down first). The upper two thirds must match (the text box covers the
// bottom) on average AND in every cell (a variant CG with another face or outfit differs strongly in a few cells), only
// the closest candidate of a frame counts, it must win two polls in a row, and flat pictures (fades) never count. A CG
// shown in the game's gallery/recollection mode matches the same way. Only then is the plain file image written:
//   <dump>\cg\<crc>_<w>x<h>.<ext> and one JSON line in <dump>\cg.jsonl (services/runtime-cg.cjs reads it). cg.log lists
// candidates (CRC, size, how, source; no pixels) and which were shown, for diagnosis.
// TLG (KiriKiri) is not a WIC format: it is confirmed later by services/runtime-cg.cjs (decoder from cg-decoders.cjs).
// While a TLG candidate is alive its file image waits in cg-wait\<crc>_<w>x<h>_<unix time>.tlg (deleted when the
// candidate is dropped) and each new steady window signature is appended to cg-screens.bin (u32 unix time, u32 0, 576
// grey bytes; rotated to cg-screens.old at 4 MB); MeguLit matches them and turns a TLG that was shown into a png CG.
// Safety: every game-thread entry copies outside the lock, the lock is RAII, nothing throws through it, logging never
// formats a path into a fixed buffer, and a fault in CgTick switches the whole module off (CgSee then returns at once).
// Limits: other formats WIC cannot decode (HG-3, CBG, ...) are never confirmed; a CG drawn scaled, scrolled or under
// heavy effects may not match; images read in pieces (header first, body later) are not seen as one file image.
#include <windows.h>
#include <wincodec.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <set>
#include <memory>
#include <time.h>
#include "modules.h"

namespace cg {
const int SW = 32, SH = 18, TOP = 12;          // signature grid; rows [0, TOP) are compared
const int AvgDiff = 14, CellDiff = 40;         // match: mean |diff| below AvgDiff and no cell above CellDiff
const DWORD MaxBytes = 40u << 20, LifeMs = 10 * 60 * 1000, WaitKeepS = 30 * 60;
const size_t Budget = sizeof(void *) == 8 ? (256u << 20) : (64u << 20); // all candidates' bytes together
struct Cand { std::vector<unsigned char> data; std::string source, how, ext; std::wstring wait; ULONG crc; DWORD w, h, tick; int sig[SW * SH]; bool sigOk, sigTried; int hits; };
typedef std::shared_ptr<Cand> P;
CRITICAL_SECTION Gate; volatile LONG Inited; std::wstring Dir; std::vector<P> Cands; std::set<ULONG> Done; size_t Bytes;
std::vector<std::wstring> Dropped; // wait files of dropped TLG candidates, deleted by CgTick
typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG); Crc32Fn Crc;
IWICImagingFactory *Wic;
struct Hold { Hold() { EnterCriticalSection(&Gate); } ~Hold() { LeaveCriticalSection(&Gate); } };

std::string J(const std::string &s) { std::string r = "\""; for (unsigned char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += (char)c; } else if (c < 0x20) { char b[8]; _snprintf_s(b, _TRUNCATE, "\\u%04x", c); r += b; } else r += (char)c; } return r + "\""; }
std::string Hex(ULONG v) { char b[16]; _snprintf_s(b, _TRUNCATE, "%08lx", v); return b; }
std::string Num(unsigned long long v) { char b[24]; _snprintf_s(b, _TRUNCATE, "%llu", v); return b; }
DWORD Be32(const unsigned char *p) { return (p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]; }
// Format and size from the header; false for anything that is not an image file image.
bool Probe(const unsigned char *p, DWORD n, std::string &ext, DWORD &w, DWORD &h) {
 if (n < 32) return false;
 if (!memcmp(p, "\x89PNG\r\n\x1a\n", 8) && !memcmp(p + 12, "IHDR", 4)) { ext = "png"; w = Be32(p + 16); h = Be32(p + 20); return true; }
 if (p[0] == 'B' && p[1] == 'M' && *(DWORD *)(p + 2) <= n + 16 && *(DWORD *)(p + 2) >= 54) { ext = "bmp"; w = *(DWORD *)(p + 18); LONG hh = *(LONG *)(p + 22); h = hh < 0 ? (DWORD)-hh : (DWORD)hh; return true; }
 if (!memcmp(p, "RIFF", 4) && !memcmp(p + 8, "WEBP", 4)) {
  ext = "webp";
  if (!memcmp(p + 12, "VP8X", 4)) { w = 1 + (p[24] | (p[25] << 8) | (p[26] << 16)); h = 1 + (p[27] | (p[28] << 8) | (p[29] << 16)); return true; }
  if (!memcmp(p + 12, "VP8 ", 4)) { w = (p[26] | (p[27] << 8)) & 0x3fff; h = (p[28] | (p[29] << 8)) & 0x3fff; return true; }
  if (!memcmp(p + 12, "VP8L", 4)) { DWORD b = p[21] | (p[22] << 8) | (p[23] << 16) | (p[24] << 24); w = (b & 0x3fff) + 1; h = ((b >> 14) & 0x3fff) + 1; return true; }
  return false;
 }
 if ((p[0] == 'T' || p[0] == 0xAB) && p[1] == 'L' && p[2] == 'G') { // TLG0 (sds wrapper) / TLG5 / TLG6, plain or AB-LG
  DWORD o = !memcmp(p + 3, "0.0\0sds", 7) ? 15 : 0;
  if (o + 23 > n || (p[o] != 'T' && p[o] != 0xAB) || memcmp(p + o + 1, "LG", 2) || memcmp(p + o + 6, "\0raw\x1a", 5)) return false;
  ext = "tlg";
  if (p[o + 3] == '5') { w = *(DWORD *)(p + o + 12); h = *(DWORD *)(p + o + 16); return true; }
  if (p[o + 3] == '6') { w = *(DWORD *)(p + o + 15); h = *(DWORD *)(p + o + 19); return true; }
  return false;
 }
 if (p[0] == 0xFF && p[1] == 0xD8 && p[2] == 0xFF) { // JPEG: walk segments to the first SOFn
  for (DWORD i = 2; i + 9 < n && i < (1u << 20); ) {
   if (p[i] != 0xFF) return false;
   BYTE m = p[i + 1];
   if (m >= 0xC0 && m <= 0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC) { ext = "jpg"; h = (p[i + 5] << 8) | p[i + 6]; w = (p[i + 7] << 8) | p[i + 8]; return true; }
   i += 2 + ((p[i + 2] << 8) | p[i + 3]);
  }
 }
 return false;
}
// Sprites, icons and UI parts are small; event CGs and backgrounds fill the screen.
bool CgSized(DWORD w, DWORD h) { return w >= 640 && h >= 360 && w <= 16384 && h <= 16384 && w * 10 >= h * 9 && w <= h * 4; }

// Mean grey over cell blocks of a top-down BGRA picture.
void Grid(const unsigned char *px, int w, int h, int stride, int *sig) {
 for (int gy = 0; gy < SH; gy++) for (int gx = 0; gx < SW; gx++) {
  int x0 = gx * w / SW, x1 = (gx + 1) * w / SW, y0 = gy * h / SH, y1 = (gy + 1) * h / SH; long long s = 0; int c = 0;
  int stepX = (x1 - x0) / 8 + 1, stepY = (y1 - y0) / 8 + 1;
  for (int y = y0; y < y1; y += stepY) for (int x = x0; x < x1; x += stepX) { const unsigned char *q = px + (size_t)y * stride + x * 4; s += (q[2] * 77 + q[1] * 150 + q[0] * 29) >> 8; c++; }
  sig[gy * SW + gx] = c ? (int)(s / c) : 0;
 }
}
bool Flat(const int *sig) { int lo = 255, hi = 0; for (int i = 0; i < SW * TOP; i++) { if (sig[i] < lo) lo = sig[i]; if (sig[i] > hi) hi = sig[i]; } return hi - lo < 40; }
// Distance of two signatures over the compared rows, or -1 when they do not match (mean or any single cell too far).
long Dist(const int *a, const int *b) {
 long d = 0; for (int i = 0; i < SW * TOP; i++) { int x = abs(a[i] - b[i]); if (x > CellDiff) return -1; d += x; }
 return d < (long)AvgDiff * SW * TOP ? d : -1;
}
// Decoded straight to 256x144 (WIC scaler): a 4K CG never becomes a full-size pixel buffer in the game's memory.
bool Decode(Cand *c) {
 c->sigTried = true;
 if (!Wic || c->ext == "tlg") return false;
 IWICStream *st = NULL; IWICBitmapDecoder *dec = NULL; IWICBitmapFrameDecode *fr = NULL; IWICBitmapScaler *sc = NULL; IWICFormatConverter *cv = NULL; bool ok = false;
 const UINT w = 256, h = 144;
 if (SUCCEEDED(Wic->CreateStream(&st)) && SUCCEEDED(st->InitializeFromMemory(c->data.data(), (DWORD)c->data.size())) &&
     SUCCEEDED(Wic->CreateDecoderFromStream(st, NULL, WICDecodeMetadataCacheOnDemand, &dec)) && SUCCEEDED(dec->GetFrame(0, &fr)) &&
     SUCCEEDED(Wic->CreateBitmapScaler(&sc)) && SUCCEEDED(sc->Initialize(fr, w, h, WICBitmapInterpolationModeFant)) &&
     SUCCEEDED(Wic->CreateFormatConverter(&cv)) && SUCCEEDED(cv->Initialize(sc, GUID_WICPixelFormat32bppBGRA, WICBitmapDitherTypeNone, NULL, 0, WICBitmapPaletteTypeCustom))) {
  static unsigned char px[256 * 144 * 4];
  if (SUCCEEDED(cv->CopyPixels(NULL, w * 4, sizeof px, px))) { Grid(px, w, h, w * 4, c->sig); ok = !Flat(c->sig); }
 }
 if (cv) cv->Release(); if (sc) sc->Release(); if (fr) fr->Release(); if (dec) dec->Release(); if (st) st->Release();
 return c->sigOk = ok;
}

// The game's main window: the largest visible top-level window of this process.
struct Find { DWORD pid; HWND best; LONG area; };
BOOL CALLBACK Each(HWND w, LPARAM l) {
 Find *f = (Find *)l; DWORD pid = 0; GetWindowThreadProcessId(w, &pid);
 if (pid != f->pid || !IsWindowVisible(w) || GetWindow(w, GW_OWNER)) return TRUE;
 RECT r; if (!GetClientRect(w, &r)) return TRUE;
 LONG a = (r.right - r.left) * (r.bottom - r.top); if (a > f->area) { f->area = a; f->best = w; }
 return TRUE;
}
// The DIB is kept between polls (re-made only when the window size changes).
HDC ShotDc; HBITMAP ShotBmp; void *ShotBits; int ShotW, ShotH;
bool Screen(int *sig) {
 Find f = { GetCurrentProcessId(), NULL, 0 }; EnumWindows(Each, (LPARAM)&f);
 if (!f.best || f.area < 320 * 240 || IsIconic(f.best) || IsHungAppWindow(f.best)) return false;
 RECT r; GetClientRect(f.best, &r); int w = r.right, h = r.bottom;
 if (w > 8192 || h > 8192) return false;
 if (!ShotDc) ShotDc = CreateCompatibleDC(NULL);
 if (!ShotDc) return false;
 if (!ShotBmp || w != ShotW || h != ShotH) {
  if (ShotBmp) { DeleteObject(ShotBmp); ShotBmp = NULL; }
  BITMAPINFO bi = {}; bi.bmiHeader.biSize = sizeof bi.bmiHeader; bi.bmiHeader.biWidth = w; bi.bmiHeader.biHeight = -h; bi.bmiHeader.biPlanes = 1; bi.bmiHeader.biBitCount = 32;
  ShotBmp = CreateDIBSection(ShotDc, &bi, DIB_RGB_COLORS, &ShotBits, NULL, 0); ShotW = w; ShotH = h;
  if (!ShotBmp) return false;
 }
 HGDIOBJ old = SelectObject(ShotDc, ShotBmp);
 bool ok = PrintWindow(f.best, ShotDc, PW_CLIENTONLY | 2 /* PW_RENDERFULLCONTENT */) != 0;
 GdiFlush(); SelectObject(ShotDc, old);
 if (ok) { Grid((const unsigned char *)ShotBits, w, h, w * 4, sig); ok = !Flat(sig); }
 return ok;
}

void Append(const std::wstring &file, const std::string &line) {
 HANDLE h = CreateFileW(file.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 if (GetFileSize(h, NULL) < (4u << 20)) { DWORD wr; WriteFile(h, line.data(), (DWORD)line.size(), &wr, NULL); }
 CloseHandle(h);
}
bool WriteFileAtomic(const std::wstring &path, const std::vector<unsigned char> &data) {
 std::wstring tmp = path + L".tmp";
 HANDLE h = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL); if (h == INVALID_HANDLE_VALUE) return false;
 DWORD wr = 0; BOOL ok = WriteFile(h, data.data(), (DWORD)data.size(), &wr, NULL) && wr == data.size(); CloseHandle(h);
 if (!ok || !MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING)) { DeleteFileW(tmp.c_str()); return false; }
 return true;
}
void Record(const Cand &c) {
 std::string file = Hex(c.crc) + "_" + Num(c.w) + "x" + Num(c.h) + "." + c.ext;
 std::wstring folder = Dir + L"cg\\"; CreateDirectoryW(folder.c_str(), NULL);
 if (!WriteFileAtomic(folder + std::wstring(file.begin(), file.end()), c.data)) return;
 Append(Dir + L"cg.jsonl", "{\"file\":\"cg/" + file + "\",\"source\":" + J(c.source) + ",\"how\":" + J(c.how) + ",\"crc\":\"" + Hex(c.crc) + "\",\"w\":" + Num(c.w) +
  ",\"h\":" + Num(c.h) + ",\"fmt\":\"" + c.ext + "\",\"size\":" + Num(c.data.size()) + ",\"at\":" + Num((unsigned long long)time(NULL)) + "}\n");
}
// Drops the oldest candidates until the byte budget holds (Gate held by the caller).
void Trim() {
 while (!Cands.empty() && Bytes > Budget) {
  P c = Cands.front(); Cands.erase(Cands.begin()); Bytes -= c->data.size();
  if (!c->wait.empty()) Dropped.push_back(c->wait);
 }
}
bool RawCopy(void *dst, const void *src, DWORD n) { __try { memcpy(dst, src, n); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; } }

void See(const char *source, const char *how, const unsigned char *p, DWORD n) {
 if (!Inited || n > MaxBytes || n < 32) return;
 unsigned char head[4096]; DWORD hn = n < sizeof head ? n : (DWORD)sizeof head;
 if (!RawCopy(head, p, hn)) return;
 std::string ext; DWORD w = 0, h = 0;
 // JPEG markers can sit past 4 KB (EXIF thumbnail): look again over up to 64 KB
 if (!Probe(head, hn, ext, w, h)) {
  if (!(head[0] == 0xFF && head[1] == 0xD8 && n > hn)) return;
  std::vector<unsigned char> more(n < 65536 ? n : 65536);
  if (!RawCopy(more.data(), p, (DWORD)more.size()) || !Probe(more.data(), (DWORD)more.size(), ext, w, h)) return;
 }
 if (!CgSized(w, h)) return;
 ULONG crc;
 P c = std::make_shared<Cand>(); // allocated outside the lock
 c->data.resize(n);
 if (!RawCopy(c->data.data(), p, n)) return;
 crc = Crc ? Crc(0, c->data.data(), n) : n;
 { Hold l; bool known = Done.count(crc) > 0; for (auto &x : Cands) if (x->crc == crc) { x->tick = GetTickCount(); known = true; } if (known) return; }
 c->source = source; c->how = how; c->ext = ext; c->crc = crc; c->w = w; c->h = h; c->tick = GetTickCount(); c->sigOk = c->sigTried = false; c->hits = 0;
 if (ext == "tlg") { // see the header: TLG waits on disk for MeguLit to confirm it (written from this thread's own copy)
  std::wstring folder = Dir + L"cg-wait\\"; CreateDirectoryW(folder.c_str(), NULL);
  std::string name = Hex(crc) + "_" + Num(w) + "x" + Num(h) + "_" + Num((unsigned long long)time(NULL)) + ".tlg";
  std::wstring path = folder + std::wstring(name.begin(), name.end());
  if (WriteFileAtomic(path, c->data)) c->wait = path;
 }
 { Hold l; Cands.push_back(c); Bytes += n; Trim(); }
 Append(Dir + L"cg.log", "candidate " + Hex(crc) + " " + Num(w) + "x" + Num(h) + " " + ext + " " + how + " " + source + "\r\n");
}
// Old waiting TLGs from earlier runs (MeguLit deletes them too, but only when it looks).
void SweepWait() {
 WIN32_FIND_DATAW f; HANDLE h = FindFirstFileW((Dir + L"cg-wait\\*").c_str(), &f); if (h == INVALID_HANDLE_VALUE) return;
 ULONGLONG now; GetSystemTimeAsFileTime((FILETIME *)&now);
 do {
  if (f.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue;
  ULONGLONG t = ((ULONGLONG)f.ftLastWriteTime.dwHighDateTime << 32) | f.ftLastWriteTime.dwLowDateTime;
  if (now > t && (now - t) / 10000000ull > WaitKeepS) DeleteFileW((Dir + L"cg-wait\\" + f.cFileName).c_str());
 } while (FindNextFileW(h, &f));
 FindClose(h);
}

void Tick() {
 static unsigned n; if (n++ % 8) return; // about once a second
 static bool com; if (!com) { com = true; CoInitializeEx(NULL, COINIT_MULTITHREADED); CoCreateInstance(CLSID_WICImagingFactory, NULL, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&Wic)); }
 std::vector<P> now; std::vector<std::wstring> gone;
 {
  Hold l; DWORD t = GetTickCount();
  for (size_t i = 0; i < Cands.size(); ) {
   if (t - Cands[i]->tick > LifeMs) { Bytes -= Cands[i]->data.size(); if (!Cands[i]->wait.empty()) Dropped.push_back(Cands[i]->wait); Cands.erase(Cands.begin() + i); }
   else now.push_back(Cands[i++]);
  }
  gone.swap(Dropped);
 }
 for (auto &g : gone) DeleteFileW(g.c_str());
 if (now.empty()) return;
 bool waiting = false, decoded = false;
 for (auto &c : now) { if (!c->sigTried) Decode(c.get()); if (c->sigOk) decoded = true; if (c->ext == "tlg") waiting = true; } // only this thread touches signatures
 if (!decoded && !waiting) return; // nothing to compare: no screenshot
 int screen[SW * SH]; bool shown = Screen(screen);
 // TLG candidates: log steady screens that differ from the last logged one, for MeguLit to match after decoding.
 static int prev[SW * SH], logged[SW * SH]; static bool hasPrev, hasLogged;
 if (waiting && shown && hasPrev && Dist(screen, prev) >= 0 && (!hasLogged || Dist(screen, logged) < 0)) {
  unsigned char rec[8 + SW * SH] = { 0 }; DWORD at = (DWORD)time(NULL); memcpy(rec, &at, 4);
  for (int i = 0; i < SW * SH; i++) rec[8 + i] = (unsigned char)(screen[i] < 0 ? 0 : screen[i] > 255 ? 255 : screen[i]);
  std::wstring file = Dir + L"cg-screens.bin";
  HANDLE f = CreateFileW(file.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_ALWAYS, 0, NULL);
  if (f != INVALID_HANDLE_VALUE) {
   bool full = GetFileSize(f, NULL) >= (4u << 20);
   if (!full) { DWORD wr; WriteFile(f, rec, sizeof rec, &wr, NULL); }
   CloseHandle(f);
   if (full) MoveFileExW(file.c_str(), (Dir + L"cg-screens.old").c_str(), MOVEFILE_REPLACE_EXISTING); // the next record starts a new file
  }
  memcpy(logged, screen, sizeof logged); hasLogged = true;
 }
 if (shown) { memcpy(prev, screen, sizeof prev); hasPrev = true; } else hasPrev = false;
 // Only the closest candidate of this frame counts; it must win two polls in a row.
 Cand *best = NULL; long bestD = -1;
 if (shown) for (auto &c : now) { if (!c->sigOk) continue; long d = Dist(c->sig, screen); if (d >= 0 && (bestD < 0 || d < bestD)) { bestD = d; best = c.get(); } }
 P seen;
 for (auto &c : now) { if (c.get() == best) { if (++c->hits >= 2) seen = c; } else c->hits = 0; }
 if (!seen) return;
 { Hold l; Done.insert(seen->crc); for (size_t i = 0; i < Cands.size(); i++) if (Cands[i] == seen) { Bytes -= seen->data.size(); Cands.erase(Cands.begin() + i); break; } }
 Append(Dir + L"cg.log", "shown " + Hex(seen->crc) + "\r\n");
 Record(*seen);
}
void Stop() { Inited = 0; Hold l; Cands.clear(); Bytes = 0; } // after a fault: CgSee returns at once from now on
int SafeTick() { __try { Tick(); return 0; } __except (EXCEPTION_EXECUTE_HANDLER) { return 1; } }
}

// Called by RuntimeDump (DumpSink, under SEH) with a plain buffer: a copy or the game's own memory.
static void CgSee(const char *source, const char *how, const unsigned char *p, DWORD n) {
 try { cg::See(source ? source : "", how ? how : "", p, n); } catch (...) {}
}
void CgStart(const wchar_t *out) {
 using namespace cg;
 InitializeCriticalSection(&Gate); Dir = out;
 Crc = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
 SweepWait();
 Inited = 1;
 DumpSink(CgSee);
}
// Watcher thread, every poll: decode new candidates, compare with the window, record what the player saw.
void CgTick() {
 using namespace cg;
 if (!Inited) return;
 bool fault = false;
 try { fault = SafeTick() != 0; } catch (...) { fault = true; }
 if (fault) { try { Stop(); Append(Dir + L"cg.log", "module off after a fault\r\n"); } catch (...) {} }
}
