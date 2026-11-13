// SPDX-License-Identifier: GPL-3.0-or-later
// Voice files read by the game, a module of MeguLitDump32/64.dll (modules/modules.h; the audio-API side is modules/Voice.cpp).
// Most engines keep their voices as Ogg/Opus/WAV/... inside an archive, encrypted or not; to play a line's voice the game
// reads it (ReadFile) and, if encrypted, decrypts it in place. A read buffer that is, or within 500 ms becomes, a voice
// file by its magic (Ogg Vorbis/Opus, WAV, AT9, BGI bw, CRI HCA incl. masked header, CRI ADX, FSB5, ID3 MP3; table after
// GARbro and vgmstream, facts only) is saved as that file, original quality: <out>\voice\fNNNNN.<fmt>, one line in
// <out>\voice\events.jsonl with the time it was read and its length from its own header (same format as Voice.cpp's
// clips, api "file"). A read that holds more than one file (a big block of a pack) is cut at the end of the first one:
// the Ogg end-of-stream page, or the RIFF size.
// Hooks: kernel32 CreateFileW/A, ReadFile and CloseHandle (the kernel32 entry points; the dump's kernelbase hooks stay).
// Cold tool, no switch. Safety as in Voice.cpp (review 2026-11-13): game memory only through Copy, RAII lock in try/catch,
// copies outside the lock, the disk write on the watcher thread (the game's read returns at once), byte caps; a fault
// switches only this module's hooks off for the run (voice\disabled.txt).
// Not covered: a voice decrypted into a fresh buffer, and a file read in chunks (only the first chunk carries the magic);
// the audio-API side records those as PCM.
#include <windows.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <map>
#include <deque>
#include <memory>
#include "dump_api.h"
#include "../minhook/include/MinHook.h" // MH_Initialize only; hooks go through DumpHook

namespace voicefile {
wchar_t Dir[1024], OutDir[1024];
CRITICAL_SECTION Gate;
DWORD Tls = TLS_OUT_OF_INDEXES;
volatile LONG On, Seq, Faults;
volatile LONGLONG Spent, Budget = 1536ll << 20;
const DWORD MinFile = 2048, MaxFile = 8u << 20, InPlaceMs = 500;
const size_t PendingCap = 32u << 20;

struct Lock { Lock() { EnterCriticalSection(&Gate); } ~Lock() { LeaveCriticalSection(&Gate); } };
ULONGLONG Enter() { DWORD e = GetLastError(); bool was = TlsGetValue(Tls) != NULL; TlsSetValue(Tls, (void *)1); SetLastError(e); return ((ULONGLONG)was << 32) | e; }
void Leave(ULONGLONG w) { if (!(w >> 32)) TlsSetValue(Tls, NULL); SetLastError((DWORD)w); }
bool Busy() { DWORD e = GetLastError(); bool r = Tls == TLS_OUT_OF_INDEXES || TlsGetValue(Tls) != NULL; SetLastError(e); return r; }
bool Live() { return On && !Busy(); }
ULONGLONG NowMs() { FILETIME f; GetSystemTimeAsFileTime(&f); ULARGE_INTEGER u; u.LowPart = f.dwLowDateTime; u.HighPart = f.dwHighDateTime; return u.QuadPart / 10000 - 11644473600000ULL; }
std::string Utf8(const wchar_t *s) {
 int m = WideCharToMultiByte(CP_UTF8, 0, s, -1, NULL, 0, NULL, NULL); if (m <= 1) return "";
 std::string r(m, '\0'); WideCharToMultiByte(CP_UTF8, 0, s, -1, &r[0], m, NULL, NULL); r.resize(m - 1); return r;
}
std::string Json(const std::string &s) {
 std::string r = "\"";
 for (unsigned char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += (char)c; } else if (c < 0x20) { char b[8]; sprintf_s(b, "\\u%04x", c); r += b; } else r += (char)c; }
 return r + "\"";
}
void AppendRaw(const wchar_t *file, const char *line, DWORD n) {
 wchar_t p[1100]; if (_snwprintf_s(p, _TRUNCATE, L"%s%s", Dir, file) < 0) return;
 HANDLE h = CreateFileW(p, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 DWORD w; WriteFile(h, line, n, &w, NULL); CloseHandle(h);
}
bool Put(const wchar_t *name, const void *a, DWORD an) {
 wchar_t p[1100], tmp[1110];
 if (_snwprintf_s(p, _TRUNCATE, L"%s%s", Dir, name) < 0 || _snwprintf_s(tmp, _TRUNCATE, L"%s.tmp", p) < 0) return false;
 HANDLE h = CreateFileW(tmp, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return false;
 DWORD w = 0; BOOL ok = WriteFile(h, a, an, &w, NULL);
 CloseHandle(h);
 if (!ok || !MoveFileExW(tmp, p, MOVEFILE_REPLACE_EXISTING)) { DeleteFileW(tmp); return false; }
 return true;
}
void *Hooked[8]; volatile LONG HookedN;
bool Hk(void *t, void *d, void **o) {
 if (!t || !DumpHook(t, d, o)) return false; // through the core (deadlock guard)
 LONG i = InterlockedIncrement(&HookedN) - 1; if (i < 8) Hooked[i] = t;
 return true;
}
void Fault(const char *where) { // no heap, no lock
 if (InterlockedExchange(&On, 0) == 0) return;
 InterlockedIncrement(&Faults);
 char line[160]; int n = sprintf_s(line, "fault in file %s at %llu\r\n", where, NowMs());
 if (n > 0) AppendRaw(L"disabled.txt", line, (DWORD)n);
 for (LONG i = 0; i < HookedN && i < 8; i++) DumpUnhook(Hooked[i]);
}
bool Readable(const void *p, size_t n) {
 const char *a = (const char *)p, *end = a + n;
 while (a < end) {
  MEMORY_BASIC_INFORMATION m; if (!VirtualQuery(a, &m, sizeof m) || m.State != MEM_COMMIT) return false;
  if (m.Protect & (PAGE_GUARD | PAGE_NOACCESS) || !(m.Protect & (PAGE_READONLY | PAGE_READWRITE | PAGE_WRITECOPY | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY))) return false;
  a = (const char *)m.BaseAddress + m.RegionSize;
 }
 return true;
}
bool CopyTo(void *to, const void *p, size_t n) { DWORD e = GetLastError(); SIZE_T got = 0; bool ok = p && Readable(p, n) && ReadProcessMemory(GetCurrentProcess(), p, to, n, &got) && got == n; SetLastError(e); return ok; }
typedef std::vector<unsigned char> Bytes;
template <class F> void Body(const char *where, F f) { try { f(); } catch (...) { Fault(where); } }
#define GUARD(where, ...) do { ULONGLONG was_ = Enter(); __try { __VA_ARGS__; } __except (EXCEPTION_EXECUTE_HANDLER) { Fault(where); } Leave(was_); } while (0)

// ---- formats ------------------------------------------------------------------------------------------------------
bool At(const unsigned char *p, size_t n, size_t at, const char *s, size_t k) { return n >= at + k && memcmp(p + at, s, k) == 0; }
const char *Sniff(const unsigned char *p, size_t n) {
 if (n < 16) return "";
 if (At(p, n, 0, "OggS", 4) && p[4] == 0) return At(p, n, 0x1C, "OpusHead", 8) ? "opus" : "ogg";
 if (At(p, n, 0, "RIFF", 4) && At(p, n, 8, "WAVE", 4)) {
  if (n >= 0x3C && p[0x14] == 0xFE && p[0x15] == 0xFF && At(p, n, 0x2C, "\xD2\x42\xE1\x47\xBA\x36\x8D\x4D\x88\xFC\x61\x65\x4F\x8C\x83\x6C", 16)) return "at9";
  return "wav";
 }
 if (At(p, n, 4, "bw  ", 4)) return "bw";
 if (At(p, n, 0, "HCA\0", 4) || (p[0] == 0xC8 && p[1] == 0xC3 && p[2] == 0xC1 && p[3] == 0x80)) return "hca";
 if (p[0] == 0x80 && p[1] == 0x00) { size_t o = (p[2] << 8) | p[3]; if (o >= 2 && o < n && At(p, n, o - 2, "(c)CRI", 6)) return "adx"; }
 if (At(p, n, 0, "FSB5", 4)) return "fsb5";
 if (At(p, n, 0, "ID3", 3) && p[3] <= 4) return "mp3";
 return "";
}
// Length of the first file in [p, p+n) and its duration in ms (0 = unknown), from its own header (review item 10).
// Ogg: pages to the end-of-stream flag, duration = last granule / rate. RIFF: the RIFF size, duration = data / byte rate.
size_t FirstFile(const unsigned char *p, size_t n, const char *fmt, DWORD *ms) {
 *ms = 0;
 if (!strcmp(fmt, "ogg") || !strcmp(fmt, "opus")) {
  DWORD rate = !strcmp(fmt, "opus") ? 48000 : (n >= 0x2C ? *(const DWORD *)(p + 0x28) : 0);
  size_t at = 0; unsigned long long granule = 0;
  while (at + 27 <= n && At(p, n, at, "OggS", 4)) {
   unsigned segs = p[at + 26]; if (at + 27 + segs > n) break;
   size_t body = 0; for (unsigned i = 0; i < segs; i++) body += p[at + 27 + i];
   size_t next = at + 27 + segs + body; if (next > n) break;
   unsigned long long g = *(const unsigned long long *)(p + at + 6); if (g != ~0ull) granule = g;
   bool last = (p[at + 5] & 4) != 0; // end-of-stream page
   at = next;
   if (last) break;
  }
  if (rate >= 8000 && rate <= 192000 && granule) *ms = (DWORD)(granule * 1000ull / rate);
  return at ? at : n;
 }
 if (!strcmp(fmt, "wav") || !strcmp(fmt, "at9")) {
  size_t size = 8 + (size_t)*(const DWORD *)(p + 4);
  if (size > n || size < 44) size = n;
  DWORD byteRate = n >= 0x20 ? *(const DWORD *)(p + 0x1C) : 0;
  for (size_t c = 12; c + 8 <= size; ) {
   DWORD len = *(const DWORD *)(p + c + 4);
   if (At(p, size, c, "data", 4)) { if (byteRate) *ms = (DWORD)((unsigned long long)(len < size - c - 8 ? len : size - c - 8) * 1000ull / byteRate); break; }
   c += 8 + len + (len & 1);
  }
  return size;
 }
 return n;
}

// ---- state ----------------------------------------------------------------------------------------------------------
typedef HANDLE(WINAPI *CFWFn)(LPCWSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef HANDLE(WINAPI *CFAFn)(LPCSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
typedef BOOL(WINAPI *ReadFn)(HANDLE, LPVOID, DWORD, LPDWORD, LPOVERLAPPED);
typedef BOOL(WINAPI *CloseFn)(HANDLE);
CFWFn OCFW; CFAFn OCFA; ReadFn ORead; CloseFn OClose;
std::map<HANDLE, std::wstring> Names; // open handle -> path (erased on CloseHandle, review item 11)
struct Read { const unsigned char *p; DWORD n; ULONG head; DWORD born; ULONGLONG at, offset; std::wstring source; };
std::vector<Read> Reads; // read buffers that may be decrypted in place
struct Found { std::shared_ptr<Bytes> data; std::string fmt, how; ULONGLONG at, offset; std::wstring source; };
std::vector<Found> Pending; size_t PendingBytes; // voice files waiting for the watcher thread to write them
struct Heard { std::wstring name; ULONGLONG at; };
std::deque<Heard> Recent; // voice files read lately, by time (names for Voice.cpp's clips)

bool Audioish(const std::wstring &p) {
 size_t dot = p.find_last_of(L'.'); if (dot == std::wstring::npos) return false;
 static const wchar_t *ext[] = { L".ogg", L".opus", L".wav", L".flac", L".mp3", L".m4a", L".at9", L".hca", L".adx", L".vag", L".wma", L".aac" };
 for (auto e : ext) if (!_wcsicmp(p.c_str() + dot, e)) return true;
 return false;
}
bool Ours(const wchar_t *p) {
 wchar_t win[MAX_PATH]; UINT w = GetWindowsDirectoryW(win, MAX_PATH); if (w && w < MAX_PATH && !_wcsnicmp(p, win, w)) return true;
 return wcsstr(p, L"\\runtime-dump\\") || (OutDir[0] && !_wcsnicmp(p, OutDir, wcslen(OutDir))); // never our own output
}
void Opened(HANDLE h, const wchar_t *p) {
 if (Ours(p)) return;
 std::wstring path(p);
 Lock l;
 if (Names.size() > 8192) Names.clear();
 Names[h] = std::move(path);
}
void Closed(HANDLE h) { Lock l; Names.erase(h); }
void Heard_(const std::wstring &name, ULONGLONG at) {
 Lock l;
 if (!Recent.empty() && Recent.back().name == name && at - Recent.back().at < 2000) return; // the same file read in pieces
 Recent.push_back(Heard{ name, at }); while (Recent.size() > 32) Recent.pop_front();
}
void Found_(std::shared_ptr<Bytes> data, const char *fmt, const char *how, ULONGLONG at, ULONGLONG offset, const std::wstring &source) {
 if (Audioish(source)) Heard_(source, at); // a loose voice file names the sound; a pack name would not
 Lock l;
 if (PendingBytes + data->size() > PendingCap || Pending.size() >= 128) return;
 PendingBytes += data->size();
 Pending.push_back(Found{ data, fmt, how, at, offset, source });
}
// The game's read buffer [p, p+n) right after ReadFile: a voice file is copied (only its first file) and queued; anything
// else is watched briefly for an in-place decrypt.
void ReadDone(HANDLE file, const unsigned char *p, DWORD n) {
 std::wstring source;
 { Lock l; auto it = Names.find(file); if (it == Names.end()) return; source = it->second; } // pipes, consoles, files opened before the DLL
 LARGE_INTEGER zero, pos; zero.QuadPart = 0; pos.QuadPart = 0; SetFilePointerEx(file, zero, &pos, FILE_CURRENT);
 ULONGLONG offset = (ULONGLONG)pos.QuadPart - n, at = NowMs();
 unsigned char head[64]; DWORD k = n < 64 ? n : 64;
 if (!CopyTo(head, p, k)) return;
 const char *fmt = Sniff(head, k);
 if (!*fmt) {
  if (n > MaxFile) return;
  ULONG h = 0; for (DWORD i = 0; i < k; i++) h = h * 31 + head[i];
  Lock l; if (Reads.size() < 64) Reads.push_back(Read{ p, n, h, GetTickCount(), at, offset, source });
  return;
 }
 std::shared_ptr<Bytes> d = std::make_shared<Bytes>(n < MaxFile ? n : MaxFile);
 if (!CopyTo(d->data(), p, d->size())) return;
 DWORD ms; d->resize(FirstFile(d->data(), d->size(), fmt, &ms));
 Found_(d, fmt, "plain", at, offset, source);
}
// Each tick: a watched read whose first bytes turned into a voice file's magic within InPlaceMs is saved; older ones are
// dropped (a buffer reused later for another sound must not be dated to this read, review item 9).
void Watch() {
 std::vector<Read> now; { Lock l; now.swap(Reads); }
 std::vector<Read> keep;
 DWORD tick = GetTickCount();
 for (auto &r : now) {
  bool fresh = tick - r.born <= InPlaceMs;
  unsigned char head[64]; DWORD k = r.n < 64 ? r.n : 64;
  if (!fresh || !CopyTo(head, r.p, k)) continue;
  ULONG h = 0; for (DWORD i = 0; i < k; i++) h = h * 31 + head[i];
  if (h == r.head) { keep.push_back(r); continue; }
  const char *fmt = Sniff(head, k);
  if (!*fmt) continue;
  std::shared_ptr<Bytes> d = std::make_shared<Bytes>(r.n);
  if (!CopyTo(d->data(), r.p, r.n)) continue;
  DWORD ms; d->resize(FirstFile(d->data(), d->size(), fmt, &ms));
  Found_(d, fmt, "inplace", r.at, r.offset, r.source);
 }
 Lock l; for (auto &r : keep) if (Reads.size() < 64) Reads.push_back(r);
}

typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG);
Crc32Fn Crc32;
std::map<ULONG, std::string> Saved; // crc -> file
void Write(const Found &f) {
 const Bytes &data = *f.data;
 ULONG crc = Crc32 ? Crc32(0, data.data(), (ULONG)data.size()) : (ULONG)data.size();
 std::string file;
 auto s = Saved.find(crc);
 if (s != Saved.end()) file = s->second;
 else {
  if (Spent + (LONGLONG)data.size() > Budget) return;
  LONG seq = InterlockedIncrement(&Seq);
  char name[64]; wchar_t wname[64]; sprintf_s(name, "f%05ld.%s", seq, f.fmt.c_str()); swprintf_s(wname, L"f%05ld.%hs", seq, f.fmt.c_str());
  if (!Put(wname, data.data(), (DWORD)data.size())) return;
  file = name; Saved[crc] = file; InterlockedExchangeAdd64(&Spent, (LONGLONG)data.size());
 }
 DWORD ms = 0; FirstFile(data.data(), data.size(), f.fmt.c_str(), &ms);
 std::string src = Utf8(f.source.c_str()); if (src.size() > 300) src = src.substr(src.size() - 300);
 char nums[400];
 sprintf_s(nums, ",\"api\":\"file\",\"obj\":\"\",\"start\":%llu,\"ms\":%lu,\"rate\":0,\"ch\":0,\"bits\":0,\"bytes\":%u,\"crc\":\"%08lx\",\"stopped\":false,\"raw\":true,\"fmt\":\"%s\",\"how\":\"%s\",\"offset\":%llu,\"name\":",
  f.at, ms, (unsigned)data.size(), crc, f.fmt.c_str(), f.how.c_str(), f.offset);
 // Same line format as Voice.cpp's clips (api "file", raw: the original file, not PCM; ms from its header).
 std::string line = "{\"file\":" + Json(file) + nums + Json(src) + "}\n";
 AppendRaw(L"events.jsonl", line.data(), (DWORD)line.size());
}
void Tick() {
 Watch();
 std::vector<Found> out; { Lock l; out.swap(Pending); PendingBytes = 0; }
 for (auto &f : out) Write(f);
}

// ---- hooks -------------------------------------------------------------------------------------------------------------
void OpenedSafe(HANDLE h, const wchar_t *n) { Body("CreateFile", [&] { Opened(h, n); }); }
HANDLE WINAPI HCFW(LPCWSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD c, DWORD f, HANDLE t) {
 HANDLE h = OCFW(n, a, s, sa, c, f, t);
 if (h != INVALID_HANDLE_VALUE && n && !(a & GENERIC_WRITE) && Live()) GUARD("CreateFileW", OpenedSafe(h, n));
 return h;
}
void OpenedASafe(HANDLE h, LPCSTR n) { wchar_t w[1024]; if (MultiByteToWideChar(CP_ACP, 0, n, -1, w, 1024)) OpenedSafe(h, w); }
HANDLE WINAPI HCFA(LPCSTR n, DWORD a, DWORD s, LPSECURITY_ATTRIBUTES sa, DWORD c, DWORD f, HANDLE t) {
 HANDLE h = OCFA(n, a, s, sa, c, f, t);
 if (h != INVALID_HANDLE_VALUE && n && !(a & GENERIC_WRITE) && Live()) GUARD("CreateFileA", OpenedASafe(h, n));
 return h;
}
void ReadSafe(HANDLE h, const void *buf, DWORD n) { Body("ReadFile", [&] { ReadDone(h, (const unsigned char *)buf, n); }); }
BOOL WINAPI HRead(HANDLE h, LPVOID buf, DWORD want, LPDWORD got, LPOVERLAPPED ov) {
 BOOL ok = ORead(h, buf, want, got, ov);
 if (ok && !ov && got && Live()) { DWORD n = 0; if (CopyTo(&n, got, sizeof n) && n >= MinFile) GUARD("ReadFile", ReadSafe(h, buf, n)); }
 return ok;
}
void ClosedSafe(HANDLE h) { Body("CloseHandle", [&] { Closed(h); }); }
BOOL WINAPI HClose(HANDLE h) {
 if (Live()) GUARD("CloseHandle", ClosedSafe(h));
 return OClose(h);
}
bool HookExport(const wchar_t *mod, const char *name, void *detour, void **orig) {
 HMODULE m = GetModuleHandleW(mod); void *fn = m ? (void *)GetProcAddress(m, name) : NULL;
 return fn && Hk(fn, detour, orig);
}
void Log(const char *s) { char line[256]; int n = sprintf_s(line, "%llu %s\r\n", NowMs(), s); if (n > 0) AppendRaw(L"voice.log", line, (DWORD)n); }
DWORD Ticks; bool HaveFile;
void Look() {
 if (HaveFile) return;
 HaveFile = HookExport(L"kernel32.dll", "CreateFileW", (void *)HCFW, (void **)&OCFW);
 HookExport(L"kernel32.dll", "CreateFileA", (void *)HCFA, (void **)&OCFA);
 HaveFile = HookExport(L"kernel32.dll", "ReadFile", (void *)HRead, (void **)&ORead) && HaveFile;
 HaveFile = HookExport(L"kernel32.dll", "CloseHandle", (void *)HClose, (void **)&OClose) && HaveFile;
 Log(HaveFile ? "file reads hooked" : "file reads not hooked");
}
void Step() { try { if (++Ticks % 16 == 0 && Ticks < 1000) Look(); Tick(); } catch (...) { Fault("tick"); } }
void SafeStep() { __try { Step(); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("tick"); } }
// The voice file read closest before `start` (a sound starting then), when exactly one was read in the 1.5 s before it
// (or up to 300 ms after): an engine that reads ahead (the next line's voice) gets no name rather than a wrong one.
bool NameFor(ULONGLONG start, std::wstring &name) {
 Lock l; int hits = 0;
 for (auto &h : Recent) { long long d = (long long)start - (long long)h.at; if (d >= -300 && d <= 1500) { hits++; name = h.name; } }
 return hits == 1;
}
bool StartUp(const wchar_t *out) {
 try {
  wchar_t f[1100];
  if (_snwprintf_s(OutDir, _TRUNCATE, L"%s", out) < 0 || _snwprintf_s(Dir, _TRUNCATE, L"%svoice\\", out) < 0 || _snwprintf_s(f, _TRUNCATE, L"%sdisabled.txt", Dir) < 0) return false;
  HANDLE h = CreateFileW(f, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
  if (h != INVALID_HANDLE_VALUE) { char b[4096]; DWORD n = 0; ReadFile(h, b, sizeof b, &n, NULL); CloseHandle(h); int lines = 0; for (DWORD i = 0; i < n; i++) if (b[i] == '\n') lines++; if (lines >= 3) return false; }
  CreateDirectoryW(out, NULL); CreateDirectoryW(Dir, NULL);
  wchar_t pat[1100]; _snwprintf_s(pat, _TRUNCATE, L"%sf*", Dir);
  WIN32_FIND_DATAW fd; HANDLE fh = FindFirstFileW(pat, &fd); LONG top = 0;
  if (fh != INVALID_HANDLE_VALUE) { do { Spent += fd.nFileSizeLow; LONG k = _wtoi(fd.cFileName + 1); if (k > top) top = k; } while (FindNextFileW(fh, &fd)); FindClose(fh); }
  Seq = top;
  InitializeCriticalSection(&Gate);
  Tls = TlsAlloc();
  Crc32 = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
  MH_STATUS s = MH_Initialize();
  return s == MH_OK || s == MH_ERROR_ALREADY_INITIALIZED;
 } catch (...) { return false; }
}
} // namespace voicefile

// For modules/Voice.cpp: the voice file a sound starting at `start` (unix ms) was read from, if unambiguous.
bool VoiceFileNameFor(ULONGLONG start, std::wstring &name) {
 using namespace voicefile;
 if (!On) return false;
 try { return NameFor(start, name); } catch (...) { return false; }
}
void VoiceFileStart(const wchar_t *out) {
 using namespace voicefile;
 if (!StartUp(out)) return;
 On = 1;
 TlsSetValue(Tls, (void *)1);
 SafeStep();
}
void VoiceFileTick() {
 using namespace voicefile;
 if (!On) return;
 TlsSetValue(Tls, (void *)1);
 SafeStep();
}
