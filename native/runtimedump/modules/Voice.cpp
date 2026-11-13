// SPDX-License-Identifier: GPL-3.0-or-later
// Voice harvest, a module of MeguLitDump32/64.dll (modules/modules.h): records the game's own voice clips as the game plays
// them, so MeguLit can replay a line's original CV later (backlog, Anki card audio, replay) whatever archive format or
// cipher the voice pack uses. The game must hand plain PCM to an audio API before anything is heard; each sound it submits
// is saved as one WAV clip with the wall-clock time it started. Which clip belongs to which line is decided afterwards in
// node (services/voice-harvest.cjs), from these start times and the times hooked lines were shown. Voice files the game
// reads are saved by modules/VoiceFile.cpp into the same voice/events.jsonl.
//
// Watched (MinHook):
//  - DirectSound: IDirectSoundBuffer Unlock/Play/Stop/Release (static buffers filled before Play, and looping streaming
//    ring buffers); the format is asked from the buffer on every Play/Unlock, never cached by address;
//  - XAudio2 2.8/2.9: IXAudio2::CreateSourceVoice (format), IXAudio2SourceVoice SubmitSourceBuffer/Start/Stop/DestroyVoice;
//  - waveOut: waveOutOpen (format), waveOutWrite, waveOutReset/Close;
//  - FMOD (C and C++ API exports): sounds created from memory (FMOD_OPENMEMORY) are saved as the decrypted file itself,
//    and playSound marks when one starts.
// A sound whose format is unknown (a voice or device created before the DLL arrived) is never recorded.
// A clip ("stream") is what one buffer/voice/device receives from Play/Start (or its first write) until it stops, goes
// quiet, or nothing more arrives for a while.
//
// Safety (review 2026-11-13, port-notes/review3-voice.md): game memory is only read through Copy (VirtualQuery +
// ReadProcessMemory) or as fields copied in the SEH wrapper of each hook; state is touched only under an RAII Lock inside
// C++ try/catch, big copies happen outside the lock; every buffer has a byte cap (16 MB per clip, 64 MB pending, 16 MB of
// kept static buffers, 32 MB of FMOD sounds, 8 MB per sound). Any fault switches this module off for the run (its own
// hooks only; Fault allocates nothing) and adds a line to voice\disabled.txt; three of those and it no longer starts for
// that game. The module also guards its own Tick, so the host never has to switch it off with hooks still live.
#include <windows.h>
#include <mmsystem.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <map>
#include <list>
#include <memory>
#include "dump_api.h"
#include "../minhook/include/MinHook.h" // MH_Initialize only; hooks go through DumpHook

bool VoiceFileNameFor(ULONGLONG start, std::wstring &name); // modules/VoiceFile.cpp

namespace voice {
wchar_t Dir[1024], OutDir[1024];
CRITICAL_SECTION Gate;
DWORD Tls = TLS_OUT_OF_INDEXES;
volatile LONG On, Seq, Faults;
volatile LONGLONG Spent, Budget = 1536ll << 20;
const DWORD IdleMs = 1200, MinClipBytes = 2048;
const size_t ClipCap = 16u << 20, PendingCap = 64u << 20, KeptCap = 16u << 20, FmodCap = 32u << 20, FmodOne = 8u << 20;

struct Lock { Lock() { EnterCriticalSection(&Gate); } ~Lock() { LeaveCriticalSection(&Gate); } };
// Marks this thread as inside a hook; all three keep the game's last error (TlsGetValue clears it).
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
// Appends to <Dir><file> with no heap use (Fault calls it).
void AppendRaw(const wchar_t *file, const char *line, DWORD n) {
 wchar_t p[1100]; if (_snwprintf_s(p, _TRUNCATE, L"%s%s", Dir, file) < 0) return;
 HANDLE h = CreateFileW(p, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 DWORD w; WriteFile(h, line, n, &w, NULL); CloseHandle(h);
}
bool Put(const wchar_t *name, const void *a, DWORD an, const void *b, DWORD bn) {
 wchar_t p[1100], tmp[1110];
 if (_snwprintf_s(p, _TRUNCATE, L"%s%s", Dir, name) < 0 || _snwprintf_s(tmp, _TRUNCATE, L"%s.tmp", p) < 0) return false;
 HANDLE h = CreateFileW(tmp, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return false;
 DWORD w1 = 0, w2 = 0; BOOL ok = WriteFile(h, a, an, &w1, NULL) && (!bn || WriteFile(h, b, bn, &w2, NULL));
 CloseHandle(h);
 if (!ok || !MoveFileExW(tmp, p, MOVEFILE_REPLACE_EXISTING)) { DeleteFileW(tmp); return false; }
 return true;
}
void *Hooked[48]; volatile LONG HookedN;
bool Hk(void *t, void *d, void **o) {
 if (!t || !DumpHook(t, d, o)) return false; // through the core: threads are marked inside while MinHook freezes them
 LONG i = InterlockedIncrement(&HookedN) - 1; if (i < 48) Hooked[i] = t;
 return true;
}
// Switches this module off for the run: no heap, no lock.
void Fault(const char *where) {
 if (InterlockedExchange(&On, 0) == 0) return;
 InterlockedIncrement(&Faults);
 char line[160]; int n = sprintf_s(line, "fault in %s at %llu\r\n", where, NowMs());
 if (n > 0) AppendRaw(L"disabled.txt", line, (DWORD)n);
 for (LONG i = 0; i < HookedN && i < 48; i++) DumpUnhook(Hooked[i]);
}
// Copies game memory without ever faulting in the game: committed, readable, no guard page, through ReadProcessMemory.
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
typedef std::shared_ptr<const Bytes> Shared;
// A copy of [p, p+n) as its own block (outside any lock), or null.
std::shared_ptr<Bytes> Grab(const void *p, size_t n) {
 if (!p || !n) return nullptr;
 std::shared_ptr<Bytes> b = std::make_shared<Bytes>(n);
 return CopyTo(b->data(), p, n) ? b : nullptr;
}

// ---- streams ------------------------------------------------------------------------------------------------------
struct Fmt { WORD tag, ch, bits; DWORD rate; };
DWORD BytesPerSec(const Fmt &f) { DWORD b = f.rate * f.ch * (f.bits / 8); return b ? b : 1; }
bool Pcm(const Fmt &f) { return (f.tag == WAVE_FORMAT_PCM || f.tag == 3 || f.tag == 0xFFFE) && f.ch && f.ch <= 8 && f.rate >= 4000 && f.rate <= 192000 && (f.bits == 8 || f.bits == 16 || f.bits == 24 || f.bits == 32); }
bool Same(const Fmt &a, const Fmt &b) { return a.tag == b.tag && a.ch == b.ch && a.bits == b.bits && a.rate == b.rate; }
// Silent PCM (zero samples, or 0x80 for 8-bit), checked on our own copy.
bool Quiet(const Fmt &f, const unsigned char *p, size_t n) {
 if (f.bits == 16) { const short *w = (const short *)p; for (size_t i = 0; i < n / 2; i += 3) if (w[i] > 64 || w[i] < -64) return false; return true; }
 if (f.bits == 8) { for (size_t i = 0; i < n; i += 3) if (p[i] > 0x82 || p[i] < 0x7E) return false; return true; }
 if (f.bits == 32 && f.tag == 3) { const float *x = (const float *)p; for (size_t i = 0; i < n / 4; i += 3) if (x[i] > 0.002f || x[i] < -0.002f) return false; return true; }
 return false;
}
struct Stream {
 const char *api = ""; Fmt fmt = {}; Bytes pcm; ULONGLONG start = 0; DWORD last = 0, playTick = 0, quietBytes = 0, writesAfterPlay = 0;
 bool playing = false, looping = false, dropped = false;
};
struct Done { std::string api, name, ext; Fmt fmt = {}; Shared data; ULONGLONG start = 0; DWORD ms = 0; bool stopped = false, raw = false; const void *obj = nullptr; };
std::map<const void *, Stream> Streams;
std::map<const void *, Fmt> Formats; // XAudio2 voices and waveOut devices (erased with them)
std::vector<Done> Queue; size_t Pending; // bytes in Streams + Queue
// Static buffers (filled once, played again later without a new fill: a click, a backlog replay) keep their last sound
// with its format; kept until the buffer is released, KeptCap bytes in all (oldest out first).
struct KeptSound { Shared pcm; Fmt fmt; };
std::map<const void *, KeptSound> Kept; std::list<const void *> KeptOrder; size_t KeptBytes;
void Unkeep(const void *obj) { auto k = Kept.find(obj); if (k == Kept.end()) return; KeptBytes -= k->second.pcm->size(); Kept.erase(k); KeptOrder.remove(obj); }
void Keep(const void *obj, const Bytes &pcm, const Fmt &f) {
 Unkeep(obj);
 if (pcm.size() > KeptCap / 4) return;
 while (KeptBytes + pcm.size() > KeptCap && !KeptOrder.empty()) Unkeep(KeptOrder.front());
 Kept[obj] = KeptSound{ std::make_shared<Bytes>(pcm), f }; KeptOrder.push_back(obj); KeptBytes += pcm.size();
}

// Ends the stream for obj (under the lock): its PCM goes to the writer queue when clip-sized.
void Close(const void *obj, bool stopped) {
 auto it = Streams.find(obj); if (it == Streams.end()) return;
 Stream &s = it->second;
 Pending -= s.pcm.size();
 if (s.playing && !s.writesAfterPlay && !s.dropped && !s.looping) Keep(obj, s.pcm, s.fmt);
 if (!s.dropped && s.pcm.size() >= MinClipBytes && Pcm(s.fmt) && Pending + s.pcm.size() <= PendingCap && Queue.size() < 256) {
  Done d; d.api = s.api; d.fmt = s.fmt; d.start = s.start; d.obj = obj;
  d.ms = (DWORD)(s.pcm.size() * 1000ull / BytesPerSec(s.fmt));
  // "stopped" = cut off (the user clicked on): a streamed sound stopped with no silence at its tail; a sound written
  // whole, stopped before it could have played out.
  d.stopped = stopped && (s.writesAfterPlay >= 2 ? s.quietBytes == 0 : s.playTick && GetTickCount() - s.playTick + 150 < d.ms);
  Pending += s.pcm.size();
  d.data = std::make_shared<const Bytes>(std::move(s.pcm));
  Queue.push_back(std::move(d));
 }
 Streams.erase(it);
}
// New PCM for obj (already copied). fmt: the format now (DirectSound asks every time), or null for the remembered one.
void Feed(const char *api, const void *obj, const Bytes &data, const Fmt *fmt, bool startNow) {
 Lock l;
 Fmt f = fmt ? *fmt : (Formats.count(obj) ? Formats[obj] : Fmt{});
 if (!f.rate || !Pcm(f)) return; // format unknown: never recorded (review item 1)
 auto it = Streams.find(obj);
 // A static (not looping) buffer filled, played, and filled again with no write in between holds the next sound. A
 // looping ring buffer may refill late; that is still the same sound (review item 12).
 if (it != Streams.end() && it->second.playing && !it->second.looping && !it->second.writesAfterPlay && GetTickCount() - it->second.last > 300) { Close(obj, false); it = Streams.end(); }
 if (it != Streams.end() && !Same(it->second.fmt, f)) { Close(obj, false); it = Streams.end(); }
 bool quiet = Quiet(f, data.data(), data.size());
 if (it == Streams.end()) {
  if (quiet) return; // nothing to hear yet
  Unkeep(obj);
  Stream s; s.api = api; s.fmt = f; s.start = NowMs(); s.last = GetTickCount(); s.playing = startNow; if (startNow) s.playTick = s.last;
  it = Streams.emplace(obj, std::move(s)).first;
 }
 Stream &s = it->second;
 if (s.playing) s.writesAfterPlay++;
 s.last = GetTickCount();
 if (s.dropped) return;
 if (s.pcm.size() + data.size() > ClipCap || Pending + data.size() > PendingCap) { s.dropped = true; Pending -= s.pcm.size(); Bytes().swap(s.pcm); return; }
 if (quiet) s.quietBytes += (DWORD)data.size(); else s.quietBytes = 0;
 s.pcm.insert(s.pcm.end(), data.begin(), data.end()); Pending += data.size();
 // 0.8 s of silence after sound: the clip has ended even if the player keeps streaming.
 if (s.quietBytes * 1000ull / BytesPerSec(s.fmt) > 800) {
  size_t keep = s.pcm.size() - s.quietBytes; DWORD align = s.fmt.ch * (s.fmt.bits / 8); if (align) keep -= keep % align;
  Pending -= s.pcm.size() - keep; s.pcm.resize(keep);
  Close(obj, false);
 }
}
void Start(const char *api, const void *obj, const Fmt *fmt, bool looping) {
 Lock l;
 Fmt f = fmt ? *fmt : (Formats.count(obj) ? Formats[obj] : Fmt{});
 auto it = Streams.find(obj);
 if (it != Streams.end() && it->second.playing) { Close(obj, true); it = Streams.end(); } // restarted: the previous sound ends here
 if (it == Streams.end()) {
  if (!f.rate || !Pcm(f)) return;
  Stream s; s.api = api; s.fmt = f;
  auto k = Kept.find(obj);
  if (k != Kept.end() && Same(k->second.fmt, f) && Pending + k->second.pcm->size() <= PendingCap) { s.pcm = *k->second.pcm; Pending += s.pcm.size(); }
  it = Streams.emplace(obj, std::move(s)).first;
 }
 Stream &s = it->second;
 s.writesAfterPlay = 0; s.playing = true; s.playTick = GetTickCount(); s.looping = looping; s.start = NowMs(); s.last = s.playTick;
}
void Stop(const void *obj) { Lock l; auto it = Streams.find(obj); if (it != Streams.end() && it->second.playing) Close(obj, true); }
// obj is gone (released, destroyed, closed): whatever it was playing ends; nothing about it is kept.
void Gone(const void *obj) {
 Lock l; auto it = Streams.find(obj);
 if (it != Streams.end()) { if (it->second.playing) Close(obj, false); else { Pending -= it->second.pcm.size(); Streams.erase(it); } }
 Formats.erase(obj); Unkeep(obj);
}
void SetFormat(const void *obj, const Fmt &f) { Lock l; Formats[obj] = f; }

// ---- writer (watcher thread) ----------------------------------------------------------------------------------------
typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG);
Crc32Fn Crc32;
std::map<ULONG, std::string> Written; // crc -> file: a clip heard again (backlog replay) points at the same file
void Write(const Done &d) {
 const Bytes &data = *d.data;
 ULONG crc = Crc32 ? Crc32(0, data.data(), (ULONG)data.size()) : (ULONG)data.size();
 std::string file;
 auto w = Written.find(crc);
 if (w != Written.end()) file = w->second;
 else {
  if (Spent + (LONGLONG)data.size() > Budget) return;
  LONG seq = InterlockedIncrement(&Seq);
  wchar_t wname[64]; char name[64];
  if (d.raw) {
   sprintf_s(name, "%05ld.%s", seq, d.ext.c_str()); swprintf_s(wname, L"%05ld.%hs", seq, d.ext.c_str());
   if (!Put(wname, data.data(), (DWORD)data.size(), NULL, 0)) return;
  } else {
   sprintf_s(name, "%05ld.wav", seq); swprintf_s(wname, L"%05ld.wav", seq);
   struct { char riff[4]; DWORD size; char wave[4], fmt[4]; DWORD fsize; WORD tag, ch; DWORD rate, bps; WORD align, bits; char data[4]; DWORD dsize; } h;
   memcpy(h.riff, "RIFF", 4); memcpy(h.wave, "WAVE", 4); memcpy(h.fmt, "fmt ", 4); memcpy(h.data, "data", 4);
   h.fsize = 16; h.tag = d.fmt.tag == 0xFFFE ? (d.fmt.bits == 32 ? 3 : 1) : d.fmt.tag; h.ch = d.fmt.ch; h.rate = d.fmt.rate; h.bits = d.fmt.bits;
   h.align = (WORD)(d.fmt.ch * d.fmt.bits / 8); h.bps = h.rate * h.align; h.dsize = (DWORD)data.size(); h.size = 36 + h.dsize;
   if (!Put(wname, &h, sizeof h, data.data(), (DWORD)data.size())) return;
  }
  file = name; Written[crc] = file; InterlockedExchangeAdd64(&Spent, (LONGLONG)data.size());
 }
 std::wstring wn; std::string nm = VoiceFileNameFor(d.start, wn) ? Utf8(wn.c_str()) : "";
 if (nm.size() > 300) nm = nm.substr(nm.size() - 300);
 char obj[32]; sprintf_s(obj, "%p", d.obj);
 std::string line = "{\"file\":" + Json(file) + ",\"api\":\"" + d.api + "\",\"obj\":\"" + obj + "\"";
 char nums[400];
 sprintf_s(nums, ",\"start\":%llu,\"ms\":%lu,\"rate\":%lu,\"ch\":%u,\"bits\":%u,\"bytes\":%u,\"crc\":\"%08lx\",\"stopped\":%s,\"raw\":%s,\"fmt\":\"%s\",\"name\":",
  d.start, d.ms, d.fmt.rate, d.fmt.ch, d.fmt.bits, (unsigned)data.size(), crc, d.stopped ? "true" : "false", d.raw ? "true" : "false", d.raw ? d.ext.c_str() : "wav");
 line += nums + Json(nm) + "}\n";
 AppendRaw(L"events.jsonl", line.data(), (DWORD)line.size());
}
// Every tick: streams that went quiet end; finished clips are written.
void Tick() {
 std::vector<Done> out;
 {
  Lock l;
  DWORD now = GetTickCount();
  std::vector<const void *> idle;
  for (auto &kv : Streams) { DWORD since = now - kv.second.last; if ((kv.second.playing && since > IdleMs) || (!kv.second.playing && since > 20000)) idle.push_back(kv.first); }
  for (auto o : idle) { auto it = Streams.find(o); if (it->second.playing) Close(o, false); else { Pending -= it->second.pcm.size(); Streams.erase(it); } }
  out.swap(Queue);
  for (auto &d : out) if (!d.raw) Pending -= d.data->size();
 }
 for (auto &d : out) Write(d);
}

// ---- hook bodies (C++: RAII lock, try/catch) and their SEH wrappers (copy game fields, catch faults) ------------------
template <class F> void Body(const char *where, F f) { try { f(); } catch (...) { Fault(where); } }
#define GUARD(where, ...) do { ULONGLONG was_ = Enter(); __try { __VA_ARGS__; } __except (EXCEPTION_EXECUTE_HANDLER) { Fault(where); } Leave(was_); } while (0)

// ---- DirectSound -----------------------------------------------------------------------------------------------------
typedef HRESULT(WINAPI *DsCreateFn)(LPCGUID, void **, void *);
typedef HRESULT(STDMETHODCALLTYPE *UnlockFn)(void *, void *, DWORD, void *, DWORD);
typedef HRESULT(STDMETHODCALLTYPE *PlayFn)(void *, DWORD, DWORD, DWORD);
typedef HRESULT(STDMETHODCALLTYPE *StopFn)(void *);
typedef ULONG(STDMETHODCALLTYPE *ReleaseFn)(void *);
typedef HRESULT(STDMETHODCALLTYPE *GetFormatFn)(void *, WAVEFORMATEX *, DWORD, DWORD *);
UnlockFn OUnlock; PlayFn OPlay; StopFn OStop; ReleaseFn ORelease; GetFormatFn GetFmt;
bool DsFormat(void *b, Fmt &f) { // asked every time: a buffer address may be reused by a new buffer (review item 8)
 WAVEFORMATEX w[4] = {}; DWORD got = 0;
 if (!GetFmt || FAILED(GetFmt(b, w, sizeof w, &got))) return false;
 f = Fmt{ w[0].wFormatTag, w[0].nChannels, w[0].wBitsPerSample, w[0].nSamplesPerSec };
 return true;
}
void DsUnlocked(void *b, void *p1, DWORD n1, void *p2, DWORD n2, const Fmt &f) {
 // Copies first, outside the lock (review item 2).
 std::shared_ptr<Bytes> a = n1 && n1 <= ClipCap ? Grab(p1, n1) : nullptr, c = n2 && n2 <= ClipCap ? Grab(p2, n2) : nullptr;
 if (a) Feed("dsound", b, *a, &f, false);
 if (c) Feed("dsound", b, *c, &f, false);
}
void DsUnlockSafe(void *b, void *p1, DWORD n1, void *p2, DWORD n2) { Fmt f; if (DsFormat(b, f)) Body("dsound unlock", [&] { DsUnlocked(b, p1, n1, p2, n2, f); }); }
HRESULT STDMETHODCALLTYPE HUnlock(void *b, void *p1, DWORD n1, void *p2, DWORD n2) {
 if (Live()) GUARD("dsound unlock", DsUnlockSafe(b, p1, n1, p2, n2));
 return OUnlock(b, p1, n1, p2, n2);
}
void DsPlaySafe(void *b, DWORD flags) { Fmt f; if (DsFormat(b, f)) Body("dsound play", [&] { Start("dsound", b, &f, (flags & 1) != 0); }); }
HRESULT STDMETHODCALLTYPE HPlay(void *b, DWORD r, DWORD prio, DWORD flags) {
 if (Live()) GUARD("dsound play", DsPlaySafe(b, flags));
 return OPlay(b, r, prio, flags);
}
void StopSafe(const char *where, const void *o) { Body(where, [&] { Stop(o); }); }
void GoneSafe(const char *where, const void *o) { Body(where, [&] { Gone(o); }); }
HRESULT STDMETHODCALLTYPE HStop(void *b) {
 if (Live()) GUARD("dsound stop", StopSafe("dsound stop", b));
 return OStop(b);
}
ULONG STDMETHODCALLTYPE HRelease(void *b) {
 ULONG r = ORelease(b);
 if (r == 0 && Live()) GUARD("dsound release", GoneSafe("dsound release", b));
 return r;
}
// The buffer methods live in dsound.dll and are shared by every secondary buffer: a throwaway buffer shows where.
bool HookDsound() {
 HMODULE m = GetModuleHandleW(L"dsound.dll"); if (!m) return false;
 DsCreateFn create = (DsCreateFn)GetProcAddress(m, "DirectSoundCreate8"); if (!create) create = (DsCreateFn)GetProcAddress(m, "DirectSoundCreate");
 if (!create) return false;
 void *ds = NULL; if (FAILED(create(NULL, &ds, NULL)) || !ds) return false;
 void **dv = *(void ***)ds;
 typedef HRESULT(STDMETHODCALLTYPE *CoopFn)(void *, HWND, DWORD);
 typedef HRESULT(STDMETHODCALLTYPE *CreateBufFn)(void *, const void *, void **, void *);
 ((CoopFn)dv[6])(ds, GetDesktopWindow(), 2);
 WAVEFORMATEX w = { WAVE_FORMAT_PCM, 1, 22050, 44100, 2, 16, 0 };
 struct { DWORD size, flags, bytes, reserved; WAVEFORMATEX *fmt; GUID algo; } desc = { sizeof desc, 0, 4410, 0, &w, {} };
 void *buf = NULL; bool ok = false;
 if (SUCCEEDED(((CreateBufFn)dv[3])(ds, &desc, &buf, NULL)) && buf) {
  void **bv = *(void ***)buf;
  GetFmt = (GetFormatFn)bv[5];
  void *release = bv[2];
  ((ReleaseFn)release)(buf); // released before the hook, so it never reaches the tables
  ok = Hk(bv[19], (void *)HUnlock, (void **)&OUnlock);
  ok = ok && Hk(bv[12], (void *)HPlay, (void **)&OPlay);
  ok = ok && Hk(bv[18], (void *)HStop, (void **)&OStop);
  // Release (IUnknown, slot 2) is shared with other dsound objects; only a count of 0 matters, for any address.
  ok = ok && Hk(release, (void *)HRelease, (void **)&ORelease);
 }
 ((ReleaseFn)dv[2])(ds);
 return ok;
}

// ---- XAudio2 2.8 / 2.9 -----------------------------------------------------------------------------------------------
typedef HRESULT(WINAPI *XCreateFn)(void **, UINT32, UINT32);
typedef HRESULT(STDMETHODCALLTYPE *CreateSourceFn)(void *, void **, const WAVEFORMATEX *, UINT32, float, void *, const void *, const void *);
typedef HRESULT(STDMETHODCALLTYPE *SubmitFn)(void *, const void *, const void *);
typedef HRESULT(STDMETHODCALLTYPE *XStartFn)(void *, UINT32, UINT32);
typedef HRESULT(STDMETHODCALLTYPE *XStopFn)(void *, UINT32, UINT32);
typedef void(STDMETHODCALLTYPE *DestroyFn)(void *);
CreateSourceFn OCreateSource; SubmitFn OSubmit; XStartFn OXStart; XStopFn OXStop; DestroyFn ODestroy;
struct XBuffer { UINT32 flags, bytes; const BYTE *data; UINT32 playBegin, playLength, loopBegin, loopLength, loopCount; void *context; };
void SetFormatSafe(const char *where, const void *o, Fmt f) { Body(where, [&] { SetFormat(o, f); }); }
void XCreatedSafe(void **v, const WAVEFORMATEX *w) {
 WAVEFORMATEX c; void *voice = NULL;
 if (!CopyTo(&voice, v, sizeof voice) || !voice || !CopyTo(&c, w, sizeof c)) return;
 SetFormatSafe("xaudio2 create", voice, Fmt{ c.wFormatTag, c.nChannels, c.wBitsPerSample, c.nSamplesPerSec });
}
HRESULT STDMETHODCALLTYPE HCreateSource(void *x, void **v, const WAVEFORMATEX *w, UINT32 f, float r, void *cb, const void *s, const void *e) {
 HRESULT hr = OCreateSource(x, v, w, f, r, cb, s, e);
 if (SUCCEEDED(hr) && v && w && Live()) GUARD("xaudio2 create", XCreatedSafe(v, w));
 return hr;
}
void XSubmitSafe(void *v, const void *b) {
 XBuffer x; if (!CopyTo(&x, b, sizeof x)) return;
 if (x.loopCount == 255) { StopSafe("xaudio2 submit", v); return; } // endless loop: music
 if (!x.bytes || x.bytes > ClipCap) return;
 Body("xaudio2 submit", [&] { std::shared_ptr<Bytes> d = Grab(x.data, x.bytes); if (d) Feed("xaudio2", v, *d, nullptr, false); });
}
HRESULT STDMETHODCALLTYPE HSubmit(void *v, const void *b, const void *wma) {
 if (Live() && b && !wma) GUARD("xaudio2 submit", XSubmitSafe(v, b));
 return OSubmit(v, b, wma);
}
void STDMETHODCALLTYPE HDestroy(void *v) {
 if (Live()) GUARD("xaudio2 destroy", GoneSafe("xaudio2 destroy", v));
 ODestroy(v);
}
void XStarted(void *v) { bool fresh; { Lock l; auto it = Streams.find(v); fresh = it == Streams.end() || !it->second.playing; } if (fresh) Start("xaudio2", v, nullptr, false); }
void XStartSafe(void *v) { Body("xaudio2 start", [&] { XStarted(v); }); }
HRESULT STDMETHODCALLTYPE HXStart(void *v, UINT32 f, UINT32 o) {
 if (Live()) GUARD("xaudio2 start", XStartSafe(v));
 return OXStart(v, f, o);
}
HRESULT STDMETHODCALLTYPE HXStop(void *v, UINT32 f, UINT32 o) {
 if (Live()) GUARD("xaudio2 stop", StopSafe("xaudio2 stop", v));
 return OXStop(v, f, o);
}
bool HookXAudio2() {
 HMODULE m = GetModuleHandleW(L"xaudio2_9.dll"); if (!m) m = GetModuleHandleW(L"xaudio2_9redist.dll"); if (!m) m = GetModuleHandleW(L"xaudio2_8.dll");
 if (!m) return false;
 XCreateFn create = (XCreateFn)GetProcAddress(m, "XAudio2Create"); if (!create) return false;
 void *x = NULL; if (FAILED(create(&x, 0, 1)) || !x) return false;
 void **xv = *(void ***)x;
 bool ok = false;
 typedef HRESULT(STDMETHODCALLTYPE *MasterFn)(void *, void **, UINT32, UINT32, UINT32, LPCWSTR, const void *, int);
 void *master = NULL;
 if (SUCCEEDED(((MasterFn)xv[7])(x, &master, 0, 0, 0, NULL, NULL, 6)) && master) {
  WAVEFORMATEX w = { WAVE_FORMAT_PCM, 1, 22050, 44100, 2, 16, 0 };
  void *src = NULL;
  if (SUCCEEDED(((CreateSourceFn)xv[5])(x, &src, &w, 0, 2.0f, NULL, NULL, NULL)) && src) {
   void **sv = *(void ***)src;
   void *destroy = sv[18];
   ((DestroyFn)destroy)(src); // the throwaway voice goes before the hooks
   ok = Hk(xv[5], (void *)HCreateSource, (void **)&OCreateSource);
   ok = ok && Hk(sv[21], (void *)HSubmit, (void **)&OSubmit);
   ok = ok && Hk(sv[19], (void *)HXStart, (void **)&OXStart);
   ok = ok && Hk(sv[20], (void *)HXStop, (void **)&OXStop);
   ok = ok && Hk(destroy, (void *)HDestroy, (void **)&ODestroy);
  }
  ((DestroyFn)(*(void ***)master)[18])(master);
 }
 typedef ULONG(STDMETHODCALLTYPE *XReleaseFn)(void *);
 ((XReleaseFn)xv[2])(x);
 return ok;
}

// ---- waveOut ----------------------------------------------------------------------------------------------------------
typedef MMRESULT(WINAPI *WOpenFn)(LPHWAVEOUT, UINT_PTR, LPCWAVEFORMATEX, DWORD_PTR, DWORD_PTR, DWORD);
typedef MMRESULT(WINAPI *WWriteFn)(HWAVEOUT, LPWAVEHDR, UINT);
typedef MMRESULT(WINAPI *WResetFn)(HWAVEOUT);
WOpenFn OWOpen; WWriteFn OWWrite; WResetFn OWReset, OWClose;
void WOpenSafe(LPHWAVEOUT h, LPCWAVEFORMATEX w) {
 HWAVEOUT dev = NULL; WAVEFORMATEX c;
 if (!CopyTo(&dev, h, sizeof dev) || !dev || !CopyTo(&c, w, sizeof c)) return;
 SetFormatSafe("waveOutOpen", dev, Fmt{ c.wFormatTag, c.nChannels, c.wBitsPerSample, c.nSamplesPerSec });
}
MMRESULT WINAPI HWOpen(LPHWAVEOUT h, UINT_PTR d, LPCWAVEFORMATEX w, DWORD_PTR cb, DWORD_PTR inst, DWORD f) {
 MMRESULT r = OWOpen(h, d, w, cb, inst, f);
 if (r == MMSYSERR_NOERROR && h && w && Live() && !(f & WAVE_FORMAT_QUERY)) GUARD("waveOutOpen", WOpenSafe(h, w));
 return r;
}
void WWriteSafe(HWAVEOUT h, LPWAVEHDR hdr) {
 WAVEHDR c; if (!CopyTo(&c, hdr, sizeof c) || !c.dwBufferLength || c.dwBufferLength > ClipCap) return;
 Body("waveOutWrite", [&] {
  { Lock l; if (!Formats.count(h)) return; } // a device opened before the DLL arrived: format unknown, skipped
  std::shared_ptr<Bytes> d = Grab(c.lpData, c.dwBufferLength); if (d) Feed("waveout", h, *d, nullptr, true);
 });
}
MMRESULT WINAPI HWWrite(HWAVEOUT h, LPWAVEHDR hdr, UINT n) {
 if (Live() && hdr) GUARD("waveOutWrite", WWriteSafe(h, hdr));
 return OWWrite(h, hdr, n);
}
MMRESULT WINAPI HWClose(HWAVEOUT h) {
 if (Live()) GUARD("waveOutClose", GoneSafe("waveOutClose", h));
 return OWClose(h);
}
MMRESULT WINAPI HWReset(HWAVEOUT h) {
 if (Live()) GUARD("waveOutReset", StopSafe("waveOutReset", h));
 return OWReset(h);
}

// ---- FMOD -------------------------------------------------------------------------------------------------------------
// C API and C++ member exports share one shape (system/this first; stdcall on x86, where a C++ member is hooked only when
// its decoration says __stdcall, "QAG").
typedef int(__stdcall *FCreateFn)(void *, const char *, unsigned, void *, void **);
typedef int(__stdcall *FPlayFn)(void *, void *, void *, void *, void *);
const int FSlots = 8;
FCreateFn FCreate[FSlots]; FPlayFn FPlay[FSlots];
struct FSound { Shared data; std::string ext; };
std::map<void *, FSound> FSounds; std::list<void *> FOrder; size_t FBytes; // sound -> its decrypted file
const char *Magic(const unsigned char *p, size_t n) {
 if (n < 12) return NULL;
 if (!memcmp(p, "OggS", 4)) return "ogg"; if (!memcmp(p, "RIFF", 4) && !memcmp(p + 8, "WAVE", 4)) return "wav"; if (!memcmp(p, "fLaC", 4)) return "flac";
 if (!memcmp(p, "FSB5", 4)) return "fsb"; if (!memcmp(p, "ID3", 3)) return "mp3"; return NULL;
}
void FForget(void *s) { auto it = FSounds.find(s); if (it == FSounds.end()) return; FBytes -= it->second.data->size(); FSounds.erase(it); FOrder.remove(s); }
void FCreated(const void *data, unsigned len, void *sound) {
 std::shared_ptr<Bytes> d = Grab(data, len); if (!d) return; // copied outside the lock
 const char *kind = Magic(d->data(), d->size()); if (!kind) return;
 Lock l;
 FForget(sound);
 while (FBytes + d->size() > FmodCap && !FOrder.empty()) FForget(FOrder.front());
 FSounds[sound] = FSound{ d, kind }; FOrder.push_back(sound); FBytes += d->size();
}
void FCreateSafe(const char *data, void *ex, void **sound) {
 unsigned head[2]; void *s = NULL;
 if (!CopyTo(head, ex, sizeof head) || !CopyTo(&s, sound, sizeof s) || !s) return;
 unsigned len = head[1];
 if (len < MinClipBytes || len > FmodOne) return;
 Body("fmod create", [&] { FCreated(data, len, s); });
}
void FPlayed(void *a, void *b) {
 Lock l;
 void *args[2] = { a, b }; // Studio low level: (sound, group, ...); FMOD Ex: (channelindex, sound, ...)
 for (void *s : args) {
  auto it = FSounds.find(s); if (it == FSounds.end()) continue;
  if (Queue.size() >= 256) break;
  Done d; d.api = "fmod"; d.raw = true; d.ext = it->second.ext; d.data = it->second.data; d.start = NowMs(); d.obj = s; // shares the bytes, no copy
  Queue.push_back(std::move(d)); break;
 }
}
template <int K> int __stdcall HFCreate(void *sys, const char *data, unsigned mode, void *ex, void **sound) {
 int r = FCreate[K](sys, data, mode, ex, sound);
 if (r == 0 && (mode & 0x800) && ex && sound && Live()) GUARD("fmod create", FCreateSafe(data, ex, sound)); // FMOD_OPENMEMORY
 return r;
}
void FPlaySafe(void *a, void *b) { Body("fmod play", [&] { FPlayed(a, b); }); }
template <int K> int __stdcall HFPlay(void *sys, void *a, void *b, void *c, void *d) {
 if (Live()) GUARD("fmod play", FPlaySafe(a, b));
 return FPlay[K](sys, a, b, c, d);
}
FCreateFn FCreateHooks[FSlots] = { HFCreate<0>, HFCreate<1>, HFCreate<2>, HFCreate<3>, HFCreate<4>, HFCreate<5>, HFCreate<6>, HFCreate<7> };
FPlayFn FPlayHooks[FSlots] = { HFPlay<0>, HFPlay<1>, HFPlay<2>, HFPlay<3>, HFPlay<4>, HFPlay<5>, HFPlay<6>, HFPlay<7> };
int FUsedCreate, FUsedPlay;
void *FDone[64]; int FDoneN;
bool Cpp(const char *n, const char *prefix) {
 if (strncmp(n, prefix, strlen(prefix))) return false;
#ifdef _WIN64
 return true;
#else
 return strstr(n, "@@QAG") != NULL; // __stdcall member; a __thiscall one would break the stack
#endif
}
void HookFmodModule(HMODULE m) {
 BYTE *base = (BYTE *)m;
 __try {
  IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER *)base; IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew);
  DWORD rva = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress; if (!rva) return;
  IMAGE_EXPORT_DIRECTORY *ed = (IMAGE_EXPORT_DIRECTORY *)(base + rva);
  DWORD *names = (DWORD *)(base + ed->AddressOfNames); WORD *ords = (WORD *)(base + ed->AddressOfNameOrdinals); DWORD *funcs = (DWORD *)(base + ed->AddressOfFunctions);
  for (DWORD i = 0; i < ed->NumberOfNames; i++) {
   const char *n = (const char *)(base + names[i]);
   if (n[0] == '_') n++; // x86 C decoration: _FMOD_System_CreateSound@20
   bool create = !strncmp(n, "FMOD_System_CreateSound", 23) || !strncmp(n, "FMOD_System_CreateStream", 24) || !strncmp(n, "FMOD5_System_CreateSound", 24) || !strncmp(n, "FMOD5_System_CreateStream", 25)
    || Cpp(n, "?createSound@System@FMOD@@") || Cpp(n, "?createStream@System@FMOD@@");
   bool play = !strncmp(n, "FMOD_System_PlaySound", 21) || !strncmp(n, "FMOD5_System_PlaySound", 22) || Cpp(n, "?playSound@System@FMOD@@");
   if (!create && !play) continue;
   void *fn = base + funcs[ords[i]];
   bool seen = false; for (int k = 0; k < FDoneN; k++) if (FDone[k] == fn) seen = true;
   if (seen || FDoneN >= 64) continue; FDone[FDoneN++] = fn;
   if (create && FUsedCreate < FSlots) { int k = FUsedCreate++; Hk(fn, (void *)FCreateHooks[k], (void **)&FCreate[k]); }
   if (play && FUsedPlay < FSlots) { int k = FUsedPlay++; Hk(fn, (void *)FPlayHooks[k], (void **)&FPlay[k]); }
  }
 } __except (EXCEPTION_EXECUTE_HANDLER) {}
}

bool HookExport(const wchar_t *mod, const char *name, void *detour, void **orig) {
 HMODULE m = GetModuleHandleW(mod); void *fn = m ? (void *)GetProcAddress(m, name) : NULL;
 return fn && Hk(fn, detour, orig);
}
void Log(const char *s) { char line[256]; int n = sprintf_s(line, "%llu %s\r\n", NowMs(), s); if (n > 0) AppendRaw(L"voice.log", line, (DWORD)n); }

DWORD Ticks; bool HaveDs, HaveXa, HaveWo; HMODULE FmodSeen[8]; int FmodSeenN;
// Audio libraries are often loaded late (first sound, or after the title screen): looked for again for two minutes.
void Look() {
 if (!HaveDs && GetModuleHandleW(L"dsound.dll")) { HaveDs = HookDsound(); Log(HaveDs ? "dsound hooked" : "dsound not hooked"); }
 if (!HaveXa && (GetModuleHandleW(L"xaudio2_9.dll") || GetModuleHandleW(L"xaudio2_8.dll") || GetModuleHandleW(L"xaudio2_9redist.dll"))) { HaveXa = HookXAudio2(); Log(HaveXa ? "xaudio2 hooked" : "xaudio2 not hooked"); }
 if (!HaveWo && GetModuleHandleW(L"winmm.dll")) {
  HaveWo = HookExport(L"winmm.dll", "waveOutOpen", (void *)HWOpen, (void **)&OWOpen);
  HaveWo = HookExport(L"winmm.dll", "waveOutWrite", (void *)HWWrite, (void **)&OWWrite) && HaveWo;
  HookExport(L"winmm.dll", "waveOutReset", (void *)HWReset, (void **)&OWReset);
  HookExport(L"winmm.dll", "waveOutClose", (void *)HWClose, (void **)&OWClose);
  Log(HaveWo ? "waveout hooked" : "waveout not hooked");
 }
 const wchar_t *fm[] = { L"fmod.dll", L"fmod64.dll", L"fmodex.dll", L"fmodex64.dll", L"fmodL.dll", L"fmodstudio.dll" };
 for (auto f : fm) {
  HMODULE h = GetModuleHandleW(f); if (!h || FmodSeenN >= 8) continue;
  bool seen = false; for (int k = 0; k < FmodSeenN; k++) if (FmodSeen[k] == h) seen = true;
  if (!seen) { FmodSeen[FmodSeenN++] = h; HookFmodModule(h); Log("fmod hooked"); }
 }
}
void Step() { try { if (++Ticks % 16 == 0 && Ticks < 1000) Look(); Tick(); } catch (...) { Fault("tick"); } }
void SafeStep() { __try { Step(); } __except (EXCEPTION_EXECUTE_HANDLER) { Fault("tick"); } }
bool StartUp(const wchar_t *out) {
 try {
  wchar_t f[1100];
  if (_snwprintf_s(OutDir, _TRUNCATE, L"%s", out) < 0 || _snwprintf_s(Dir, _TRUNCATE, L"%svoice\\", out) < 0 || _snwprintf_s(f, _TRUNCATE, L"%sdisabled.txt", Dir) < 0) return false;
  // A cold tool: no switch. It stays off only for a game where it has faulted three times.
  HANDLE h = CreateFileW(f, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
  if (h != INVALID_HANDLE_VALUE) { char b[4096]; DWORD n = 0; ReadFile(h, b, sizeof b, &n, NULL); CloseHandle(h); int lines = 0; for (DWORD i = 0; i < n; i++) if (b[i] == '\n') lines++; if (lines >= 3) return false; }
  CreateDirectoryW(out, NULL); CreateDirectoryW(Dir, NULL);
  { // game.txt names the game folder (services/runtime-dump.cjs finds the folder by it)
   wchar_t game[1024]; DWORD n = GetModuleFileNameW(NULL, game, 1024); wchar_t *g = n && n < 1024 ? wcsrchr(game, L'\\') : NULL;
   wchar_t txt[1100];
   if (g && _snwprintf_s(txt, _TRUNCATE, L"%sgame.txt", out) >= 0 && GetFileAttributesW(txt) == INVALID_FILE_ATTRIBUTES) {
    *g = 0; std::string u = Utf8(game);
    HANDLE t = CreateFileW(txt, GENERIC_WRITE, 0, NULL, CREATE_NEW, 0, NULL); if (t != INVALID_HANDLE_VALUE) { DWORD w; WriteFile(t, u.data(), (DWORD)u.size(), &w, NULL); CloseHandle(t); }
   }
  }
  // Disk already used by earlier runs counts against the budget; clips are numbered on.
  wchar_t pat[1100]; _snwprintf_s(pat, _TRUNCATE, L"%s*", Dir);
  WIN32_FIND_DATAW fd; HANDLE fh = FindFirstFileW(pat, &fd); LONG top = 0;
  if (fh != INVALID_HANDLE_VALUE) { do { Spent += fd.nFileSizeLow; LONG k = _wtoi(fd.cFileName); if (k > top) top = k; } while (FindNextFileW(fh, &fd)); FindClose(fh); }
  Seq = top;
  InitializeCriticalSection(&Gate);
  Tls = TlsAlloc();
  Crc32 = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
  MH_STATUS s = MH_Initialize();
  if (s != MH_OK && s != MH_ERROR_ALREADY_INITIALIZED) return false;
  return true;
 } catch (...) { return false; }
}
} // namespace voice

// Module entry points (modules/modules.h): Start once with the game's dump folder (ends in '\'), Tick about every 120 ms
// on the DLL's watcher thread. Both guard themselves: a fault switches this module off with its hooks.
void VoiceStart(const wchar_t *out) {
 using namespace voice;
 if (!StartUp(out)) return;
 On = 1;
 TlsSetValue(Tls, (void *)1); // the watcher thread's own calls are never watched
 SafeStep();
}
void VoiceTick() {
 using namespace voice;
 if (!On) return;
 TlsSetValue(Tls, (void *)1);
 SafeStep();
}
