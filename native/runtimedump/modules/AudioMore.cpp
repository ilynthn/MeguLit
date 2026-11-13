// SPDX-License-Identifier: GPL-3.0-or-later
// AudioMore module of MeguLitDump32/64.dll (modules.h): the audio paths the Voice harvest (Voice.cpp: DirectSound,
// XAudio2 2.8/2.9, waveOut, FMOD) does not cover. It writes the same <out>\voice\events.jsonl lines, so
// services/voice-harvest.cjs reads both without knowing which module saw a sound. It never plays, mixes or changes audio:
// every detour notes what it needs and calls the original.
//
//  - XAudio2 2.4-2.7 (DirectX SDK, COM): CoCreateInstance of an object whose code lives in xaudio2_N.dll / xaudiod2_N.dll
//    and that answers IID_IXAudio2 (the same DLLs also serve the reverb/meter XAPOs, whose slot 8 is something else).
//    IXAudio2::CreateSourceVoice is slot 8; the source voice's Start/Stop/SubmitSourceBuffer are 19/20/21. 2.0-2.3 are
//    left alone: their method signatures were not checked against real DLLs, and a wrong one corrupts an x86 stack.
//  - OpenAL (OpenAL32.dll, soft_oal.dll, wrap_oal.dll): alBufferData keeps each buffer's PCM (a capped store, freed by
//    alDeleteBuffers); alSourcei(AL_BUFFER) + alSourcePlay(v) is one clip, cut on the dump thread from the buffer id;
//    alSourceQueueBuffers streams into the source's clip until alSourceStop or silence.
//  - CRI ADX2/Atom in Unity (cri_ware_unity.dll exports): no PCM (CRI mixes in its own output), but which cue starts:
//    criAtomExAcb_LoadAcbFile names the ACB, criAtomExPlayer_SetCueName/Id/Index, SetFile and SetWaveId pick the sound,
//    criAtomExPlayer_Start is the start. Event name "<acb>|<cue>"; the cue can be cut from the ACB/AWB later (vgmstream).
//  - Wwise in Unity (AkSoundEngine.dll / AkUnitySoundEngine.dll, SWIG exports containing "PostEvent"): the event name
//    (or 32-bit id) posted, x64 only (x86 SWIG exports are stdcall with per-overload argument sizes).
// Lines (one per clip or cue), same fields as Voice.cpp:
//   {"file" (relative to voice\, "" for cue-only events),"api","obj","start" (unix ms),"ms","rate","ch","bits","bytes",
//    "crc","stopped","raw":false,"name"}
// Clips are written by the dump thread (AudioMoreTick) as voice\NNNNN_<api>.wav, numbered on from the files already there.
//
// Safety (review2-audiomore): every detour checks Off first and then only calls the original (set when RuntimeDump
// switches the module off, DumpOnStop, and at process exit); the recording part of a detour is wrapped in try/catch and
// keeps the thread's last error; game pointers are read with VirtualQuery + ReadProcessMemory, never dereferenced;
// one write is capped (MaxClip), the OpenAL store (KeepMax), the write queue and the log queue are capped; the loader
// callback only tries the hook lock.
#include <windows.h>
#include <mmsystem.h>
#include <mmreg.h>
#include <unknwn.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <map>
#include "modules.h"
#include "dump_api.h"

void AudioMoreStart(const wchar_t *out);
void AudioMoreTick();

namespace audiomore {
#ifdef _WIN64
const size_t KeepMax = 256u << 20, QueueMax = 256u << 20;
#else
const size_t KeepMax = 48u << 20, QueueMax = 64u << 20; // x86 games have little address space to spare
#endif
const DWORD IdleMs = 1200, MaxClip = 32u << 20, MinBytes = 512;
const size_t QueueCount = 256, NoteCount = 256;
const LONGLONG Budget = 1024ll << 20;
std::wstring Dir; // <out>\voice\ (trailing backslash)
CRITICAL_SECTION Lock, HookLock;
volatile LONG Started, Seq, Off;
LONGLONG Spent;
size_t Queued;

// Every helper a detour calls keeps the thread's last-error value, so the game sees the original API's error.
struct KeepError { DWORD e; KeepError() : e(GetLastError()) {} ~KeepError() { SetLastError(e); } };
struct Held { CRITICAL_SECTION *c; Held(CRITICAL_SECTION *x) : c(x) { EnterCriticalSection(c); } ~Held() { LeaveCriticalSection(c); } };
bool Live() { return Started && !Off; }
ULONGLONG UnixMs() { FILETIME f; GetSystemTimeAsFileTime(&f); return ((((ULONGLONG)f.dwHighDateTime) << 32 | f.dwLowDateTime) - 116444736000000000ull) / 10000; }

// Reads [src, src+n) of game memory: the range is checked with VirtualQuery and copied with ReadProcessMemory, which fails
// quietly instead of raising an access violation (a game's vectored handler would see one) and never touches a guard page.
bool Peek(void *dst, const void *src, size_t n) {
 if (!src || !n) return false;
 for (ULONG_PTR a = (ULONG_PTR)src, end = a + n; a < end; ) {
  if (end < a) return false;
  MEMORY_BASIC_INFORMATION mi;
  if (!VirtualQuery((void *)a, &mi, sizeof mi) || mi.State != MEM_COMMIT || (mi.Protect & (PAGE_GUARD | PAGE_NOACCESS))) return false;
  DWORD p = mi.Protect & 0xFF;
  if (p != PAGE_READONLY && p != PAGE_READWRITE && p != PAGE_WRITECOPY && p != PAGE_EXECUTE_READ && p != PAGE_EXECUTE_READWRITE && p != PAGE_EXECUTE_WRITECOPY) return false;
  a = (ULONG_PTR)mi.BaseAddress + mi.RegionSize;
 }
 SIZE_T got = 0;
 return ReadProcessMemory(GetCurrentProcess(), src, dst, n, &got) && got == n;
}
// A C string (or, wide, a UTF-16 one kept as ASCII with '?' for the rest) the game passed; empty if unreadable.
std::string CStr(const void *p, size_t max = 512, bool wide = false) {
 std::string r; size_t unit = wide ? 2 : 1;
 for (size_t i = 0; p && i < max; ) {
  ULONG_PTR a = (ULONG_PTR)p + i * unit, page = 4096 - (a & 4095);
  size_t k = page / unit; if (k > 64) k = 64; if (k > max - i) k = max - i; if (!k) k = 1;
  unsigned char buf[128];
  if (!Peek(buf, (void *)a, k * unit)) break;
  for (size_t j = 0; j < k; j++, i++) {
   unsigned c = wide ? (unsigned)(buf[2 * j] | buf[2 * j + 1] << 8) : buf[j];
   if (!c) return r;
   r += c < 128 ? (char)c : (wide ? '?' : (char)c);
  }
 }
 return r;
}
std::string Json(const std::string &s) {
 std::string r = "\"";
 for (unsigned char c : s) { if (c == '"' || c == '\\') { r += '\\'; r += (char)c; } else if (c < 0x20) { char b[8]; sprintf_s(b, "\\u%04x", c); r += b; } else r += (char)c; }
 return r + "\"";
}

struct Fmt { unsigned tag = 0, ch = 0, rate = 0, bits = 0; };
Fmt FromWave(const WAVEFORMATEX *w) {
 Fmt f; WAVEFORMATEX h;
 if (w && Peek(&h, w, sizeof h)) { f.tag = h.wFormatTag; f.ch = h.nChannels; f.rate = h.nSamplesPerSec; f.bits = h.wBitsPerSample; }
 return f;
}
// One clip per audio object. Kind keeps OpenAL ids apart from COM pointers.
typedef std::pair<int, ULONG_PTR> Key;
enum { KVoice = 1, KAlSource = 2 };
struct Clip { std::string api; Fmt fmt; std::vector<unsigned char> data; ULONGLONG start = 0; DWORD last = 0; bool playing = false, done = false, stopped = false; ULONG_PTR obj = 0; };
std::map<Key, Clip> Clips;
struct Ready { std::string api, name; Fmt fmt; std::vector<unsigned char> data; ULONGLONG start; bool stopped; ULONG_PTR obj; };
std::vector<Ready> Queue;
std::vector<std::string> Notes;

void Note(const std::string &s) {
 KeepError keep;
 try {
  SYSTEMTIME t; GetLocalTime(&t);
  char stamp[40]; sprintf_s(stamp, "%02d:%02d:%02d.%03d audiomore: ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds);
  Held h(&Lock); if (Notes.size() < NoteCount) Notes.push_back(stamp + s + "\r\n");
 } catch (...) {}
}
// Caller holds Lock. A full queue (the dump thread is behind or gone) drops the clip.
void Enqueue(Ready &&r) {
 if (Queue.size() >= QueueCount || Queued + r.data.size() > QueueMax) return;
 Queued += r.data.size(); Queue.push_back(std::move(r));
}
void Close(Clip &c) {
 if (c.data.size() >= MinBytes) Enqueue({c.api, "", c.fmt, std::move(c.data), c.start, c.stopped, c.obj});
 std::vector<unsigned char>().swap(c.data); c.playing = c.done = c.stopped = false; c.start = 0;
}
void Open(Key k, const char *api, Fmt f) {
 KeepError keep;
 try { Held h(&Lock); Clip &c = Clips[k]; if (!c.data.empty()) Close(c); c = Clip(); c.api = api; c.fmt = f; c.obj = k.second; } catch (...) {}
}
// Appends n bytes of game memory to the clip of k. One write over MaxClip (a whole decoded track) is not kept.
void Feed(Key k, const char *api, const void *p, size_t n, Fmt *f = NULL) {
 if (!p || !n || n > MaxClip) return;
 KeepError keep;
 try {
  Held h(&Lock);
  Clip &c = Clips[k];
  if (c.api.empty()) { c.api = api; c.obj = k.second; }
  if (f) c.fmt = *f;
  if (c.data.size() + n > MaxClip) Close(c);
  size_t at = c.data.size(); c.data.resize(at + n);
  if (!Peek(&c.data[at], p, n)) c.data.resize(at);
  c.last = GetTickCount();
 } catch (...) {}
}
void Start(Key k) {
 KeepError keep;
 try { Held h(&Lock); Clip &c = Clips[k]; if (!c.start) c.start = UnixMs(); c.playing = true; c.last = GetTickCount(); } catch (...) {}
}
void Stop(Key k, bool stopped) {
 KeepError keep;
 try { Held h(&Lock); auto it = Clips.find(k); if (it != Clips.end()) { it->second.done = true; it->second.stopped = stopped; } } catch (...) {}
}
// A cue-only event (CRI, Wwise): no PCM, just what started and when.
void Cue(const char *api, const void *obj, const std::string &name) {
 KeepError keep;
 try { Held h(&Lock); Enqueue({api, name, Fmt(), {}, UnixMs(), false, (ULONG_PTR)obj}); } catch (...) {}
}

// ---- COM method hooks: one detour per method, any number of implementations (target code addresses) -------------------
struct Slot { void *target, *tramp; };
Slot Slots[128]; volatile LONG Used;
void *SlotOf(void *obj, int index) { void **vt = NULL, *t = NULL; if (Peek(&vt, obj, sizeof vt) && vt) Peek(&t, vt + index, sizeof t); return t; }
void *Original(void *obj, int index) {
 void *t = (*(void ***)obj)[index]; // the game is calling this very method, so its vtable is good
 for (LONG i = 0; i < Used; i++) if (Slots[i].target == t) return Slots[i].tramp;
 return t; // not hooked: calling it directly is safe
}
void HookMethod(void *obj, int index, void *detour) {
 if (!obj || Off) return;
 KeepError keep;
 void *t = SlotOf(obj, index);
 if (!t) return;
 DumpQuiet quiet; // MinHook freezes the other threads: RuntimeDump's CloseHandle hook must not wait on them
 try {
  Held h(&HookLock);
  for (LONG i = 0; i < Used; i++) if (Slots[i].target == t) return;
  if (Used < 128) {
   // The slot is published before the hook goes live (the detour looks its trampoline up by target); DumpHook (core
   // deadlock guard) writes the trampoline into it before enabling.
   LONG k = Used; Slots[k].target = t; Slots[k].tramp = NULL;
   MemoryBarrier(); InterlockedIncrement(&Used);
   bool on = DumpHook(t, detour, &Slots[k].tramp);
   char line[96]; sprintf_s(line, "%s method %d at %p", on ? "hooked" : "could not enable", index, t); Note(line);
  }
 } catch (...) {}
}
#define CALL(obj, index, type) ((type)Original(obj, index))

// ---- XAudio2 2.4-2.7 ----------------------------------------------------------------------------------------------------
// The XAudio2 version whose DLL holds this object's code: 0-7, or -1 for anything else.
int XVersion(void *obj) {
 void *fn = SlotOf(obj, 0);
 HMODULE m = NULL;
 if (!fn || !GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCWSTR)fn, &m)) return -1;
 wchar_t path[MAX_PATH]; if (!GetModuleFileNameW(m, path, MAX_PATH)) return -1;
 const wchar_t *base = wcsrchr(path, L'\\'); base = base ? base + 1 : path;
 wchar_t low[64] = {0}; for (int i = 0; i < 63 && base[i]; i++) low[i] = (wchar_t)towlower(base[i]);
 int n = -1;
 if (swscanf_s(low, L"xaudio2_%d.dll", &n) != 1 && swscanf_s(low, L"xaudiod2_%d.dll", &n) != 1) return -1;
 return n >= 0 && n <= 7 ? n : -1;
}
// IID_IXAudio2 of the DirectX SDK (2.0-2.7). An object in an XAudio2 DLL that does not answer it is an XAPO.
const GUID IidXAudio2 = {0x8bcf1f58, 0x9fe7, 0x4583, {0x8a, 0xc6, 0xe2, 0xad, 0xc4, 0x65, 0xc8, 0xbb}};
bool IsXAudio2(void *obj, REFIID asked) {
 if (IsEqualGUID(asked, IidXAudio2)) return true;
 IUnknown *u = (IUnknown *)obj, *q = NULL;
 if (FAILED(u->QueryInterface(IidXAudio2, (void **)&q)) || !q) return false;
 q->Release();
 return true;
}
struct XBuffer { UINT32 Flags, AudioBytes; const BYTE *pAudioData; UINT32 PlayBegin, PlayLength, LoopBegin, LoopLength, LoopCount; void *pContext; };
typedef HRESULT(WINAPI *XCreateVoiceFn)(void *, void **, const WAVEFORMATEX *, UINT32, float, void *, const void *, const void *);
typedef HRESULT(WINAPI *XSubmitFn)(void *, const XBuffer *, const void *);
typedef HRESULT(WINAPI *XStartFn)(void *, UINT32, UINT32);
const int XCreateVoice = 8, XStart = 19, XStop = 20, XSubmit = 21;
const UINT32 XEndOfStream = 0x40;
const char *XApi[8] = {"xaudio2_0", "xaudio2_1", "xaudio2_2", "xaudio2_3", "xaudio2_4", "xaudio2_5", "xaudio2_6", "xaudio2_7"};
std::map<void *, int> VoiceVersion; // under Lock

const char *ApiOf(void *v) { Held h(&Lock); auto it = VoiceVersion.find(v); return XApi[it == VoiceVersion.end() ? 7 : it->second]; }
HRESULT WINAPI HXStart(void *v, UINT32 f, UINT32 s) { if (Live()) Start(Key(KVoice, (ULONG_PTR)v)); return CALL(v, XStart, XStartFn)(v, f, s); }
HRESULT WINAPI HXStop(void *v, UINT32 f, UINT32 s) { HRESULT hr = CALL(v, XStop, XStartFn)(v, f, s); if (Live()) Stop(Key(KVoice, (ULONG_PTR)v), true); return hr; }
HRESULT WINAPI HXSubmit(void *v, const XBuffer *b, const void *wma) {
 if (Live()) {
  KeepError keep; XBuffer copy;
  try { if (b && Peek(&copy, b, sizeof copy)) { Feed(Key(KVoice, (ULONG_PTR)v), ApiOf(v), copy.pAudioData, copy.AudioBytes); if (copy.Flags & XEndOfStream) Stop(Key(KVoice, (ULONG_PTR)v), false); } } catch (...) {}
 }
 return CALL(v, XSubmit, XSubmitFn)(v, b, wma);
}
HRESULT WINAPI HXCreateVoice(void *x, void **out, const WAVEFORMATEX *f, UINT32 fl, float r, void *cb, const void *s, const void *e) {
 HRESULT hr = CALL(x, XCreateVoice, XCreateVoiceFn)(x, out, f, fl, r, cb, s, e);
 void *v = NULL;
 if (Live() && SUCCEEDED(hr) && out && Peek(&v, out, sizeof v) && v) {
  KeepError keep;
  try {
   int n = XVersion(x); if (n < 4) n = 7;
   { Held h(&Lock); VoiceVersion[v] = n; }
   Open(Key(KVoice, (ULONG_PTR)v), XApi[n], FromWave(f));
   HookMethod(v, XStart, (void *)HXStart); HookMethod(v, XStop, (void *)HXStop); HookMethod(v, XSubmit, (void *)HXSubmit);
  } catch (...) {}
 }
 return hr;
}
typedef HRESULT(WINAPI *CoCreateFn)(REFCLSID, void *, DWORD, REFIID, void **);
CoCreateFn OCoCreateCombase, OCoCreateOle32; // each hooked export keeps its own original (review2-merge item 10)
void CoCreated(HRESULT hr, REFIID iid, void **out) {
 void *obj = NULL;
 if (!Live() || FAILED(hr) || !out || !Peek(&obj, out, sizeof obj) || !obj) return;
 KeepError keep;
 try {
  int n = XVersion(obj);
  if (n < 0) return;
  if (n < 4) { Note("xaudio2_" + std::to_string(n) + " not hooked (2.0-2.3 signatures unchecked)"); return; }
  if (IsXAudio2(obj, iid)) HookMethod(obj, XCreateVoice, (void *)HXCreateVoice);
 } catch (...) {}
}
HRESULT WINAPI HCoCreateCombase(REFCLSID c, void *outer, DWORD ctx, REFIID iid, void **out) { HRESULT hr = OCoCreateCombase(c, outer, ctx, iid, out); CoCreated(hr, iid, out); return hr; }
HRESULT WINAPI HCoCreateOle32(REFCLSID c, void *outer, DWORD ctx, REFIID iid, void **out) { HRESULT hr = OCoCreateOle32(c, outer, ctx, iid, out); CoCreated(hr, iid, out); return hr; }

// ---- OpenAL -------------------------------------------------------------------------------------------------------------
typedef void(__cdecl *AlBufferDataFn)(unsigned, int, const void *, int, int);
typedef void(__cdecl *AlSourceiFn)(unsigned, int, int);
typedef void(__cdecl *AlSourceFn)(unsigned);
typedef void(__cdecl *AlSourcevFn)(int, const unsigned *);
typedef void(__cdecl *AlQueueFn)(unsigned, int, const unsigned *);
typedef void(__cdecl *AlDeleteFn)(int, const unsigned *);
struct AlFns { AlBufferDataFn data; AlSourceiFn sourcei; AlSourceFn play, stop; AlSourcevFn playv; AlQueueFn queue; AlDeleteFn del; } Al;
struct AlBuf { Fmt fmt; std::vector<unsigned char> pcm; };
std::map<unsigned, AlBuf> AlBuffers;   // under Lock
std::map<unsigned, unsigned> AlStatic; // source -> buffer set with AL_BUFFER
struct AlPlay { unsigned src, buf; ULONGLONG start; };
std::vector<AlPlay> AlPlays;           // static plays, cut by the dump thread
size_t AlKept;
Fmt AlFormat(int format, int freq) {
 Fmt f; f.rate = (unsigned)freq; f.tag = 1;
 switch (format) {
 case 0x1100: f.ch = 1; f.bits = 8; break; case 0x1101: f.ch = 1; f.bits = 16; break;
 case 0x1102: f.ch = 2; f.bits = 8; break; case 0x1103: f.ch = 2; f.bits = 16; break;
 case 0x10010: f.ch = 1; f.bits = 32; f.tag = 3; break; case 0x10011: f.ch = 2; f.bits = 32; f.tag = 3; break; // AL_EXT_float32
 default: f.tag = 0; f.ch = 0; f.bits = 0; // compressed or multichannel: kept raw, rate known
 }
 return f;
}
void AlForget(AlBuf &b) { AlKept -= b.pcm.size(); std::vector<unsigned char>().swap(b.pcm); }
void __cdecl HAlBufferData(unsigned buf, int format, const void *data, int size, int freq) {
 if (Live() && data && size > 0 && (size_t)size <= MaxClip) {
  KeepError keep;
  try {
   Held h(&Lock);
   AlBuf &b = AlBuffers[buf];
   AlForget(b);
   b.fmt = AlFormat(format, freq);
   if (AlKept + size <= KeepMax) { b.pcm.resize(size); if (Peek(b.pcm.data(), data, size)) AlKept += size; else std::vector<unsigned char>().swap(b.pcm); }
  } catch (...) {}
 }
 Al.data(buf, format, data, size, freq);
}
void __cdecl HAlDelete(int n, const unsigned *bufs) {
 if (Live()) {
  KeepError keep;
  try {
   Held h(&Lock);
   for (int i = 0; i < n && i < 4096; i++) { unsigned id; if (!Peek(&id, bufs + i, sizeof id)) break; auto it = AlBuffers.find(id); if (it != AlBuffers.end()) { AlForget(it->second); AlBuffers.erase(it); } }
  } catch (...) {}
 }
 Al.del(n, bufs);
}
void __cdecl HAlSourcei(unsigned src, int param, int value) {
 if (Live() && param == 0x1009) { KeepError keep; try { Held h(&Lock); if (value) AlStatic[src] = (unsigned)value; else AlStatic.erase(src); } catch (...) {} } // AL_BUFFER
 Al.sourcei(src, param, value);
}
// A play: a source with one static buffer is cut later on the dump thread (no copy here); a queued source just starts.
void AlPlayed(unsigned src) {
 KeepError keep;
 try {
  bool single = false;
  {
   Held h(&Lock);
   auto s = AlStatic.find(src);
   if (s != AlStatic.end() && AlPlays.size() < QueueCount) { AlPlays.push_back({src, s->second, UnixMs()}); single = true; }
  }
  if (!single) Start(Key(KAlSource, src));
 } catch (...) {}
}
void __cdecl HAlPlay(unsigned src) { if (Live()) AlPlayed(src); Al.play(src); }
void __cdecl HAlPlayv(int n, const unsigned *srcs) {
 if (Live()) for (int i = 0; i < n && i < 256; i++) { unsigned s; if (Peek(&s, srcs + i, sizeof s)) AlPlayed(s); }
 Al.playv(n, srcs);
}
void __cdecl HAlStop(unsigned src) { Al.stop(src); if (Live()) Stop(Key(KAlSource, src), true); }
// Queued buffers go straight from the store into the source's clip (one copy; the game refills them right after).
void __cdecl HAlQueue(unsigned src, int n, const unsigned *bufs) {
 if (Live()) {
  KeepError keep;
  try {
   Held h(&Lock);
   AlStatic.erase(src);
   for (int i = 0; i < n && i < 256; i++) {
    unsigned id; if (!Peek(&id, bufs + i, sizeof id)) break;
    auto b = AlBuffers.find(id); if (b == AlBuffers.end() || b->second.pcm.empty()) continue;
    Clip &c = Clips[Key(KAlSource, src)];
    if (c.api.empty()) { c.api = "openal"; c.obj = src; }
    c.fmt = b->second.fmt;
    if (c.data.size() + b->second.pcm.size() > MaxClip) Close(c);
    c.data.insert(c.data.end(), b->second.pcm.begin(), b->second.pcm.end());
    c.last = GetTickCount();
   }
  } catch (...) {}
 }
 Al.queue(src, n, bufs);
}

// ---- CRI ADX2 (Unity plugin exports, cdecl) -------------------------------------------------------------------------------
typedef void *(__cdecl *CriLoadAcbFn)(void *, const char *, void *, const char *, void *, int);
typedef void(__cdecl *CriSetNameFn)(void *, void *, const char *);
typedef void(__cdecl *CriSetIdFn)(void *, void *, int);
typedef unsigned(__cdecl *CriStartFn)(void *);
struct CriFns { CriLoadAcbFn loadAcb; CriSetNameFn cueName, file; CriSetIdFn cueId, cueIndex, waveId; CriStartFn start; } Cri;
std::map<void *, std::string> CriAcb, CriCue; // acb -> path; player -> "<acb>|<cue>" (under Lock)
void *__cdecl HCriLoadAcb(void *binder, const char *acb, void *awbBinder, const char *awb, void *work, int size) {
 void *h = Cri.loadAcb(binder, acb, awbBinder, awb, work, size);
 if (Live() && h) { KeepError keep; try { std::string a = CStr(acb); Held l(&Lock); if (CriAcb.size() < 4096) CriAcb[h] = a; } catch (...) {} }
 return h;
}
void CriPick(void *player, void *acb, const std::string &cue) {
 KeepError keep;
 try { Held l(&Lock); auto it = CriAcb.find(acb); if (CriCue.size() < 4096 || CriCue.count(player)) CriCue[player] = (it == CriAcb.end() ? "" : it->second) + "|" + cue; } catch (...) {}
}
void __cdecl HCriCueName(void *p, void *acb, const char *name) { if (Live()) { try { CriPick(p, acb, CStr(name)); } catch (...) {} } Cri.cueName(p, acb, name); }
void __cdecl HCriCueId(void *p, void *acb, int id) { if (Live()) { try { CriPick(p, acb, "id:" + std::to_string(id)); } catch (...) {} } Cri.cueId(p, acb, id); }
void __cdecl HCriCueIndex(void *p, void *acb, int i) { if (Live()) { try { CriPick(p, acb, "index:" + std::to_string(i)); } catch (...) {} } Cri.cueIndex(p, acb, i); }
void __cdecl HCriFile(void *p, void *binder, const char *path) {
 if (Live()) { KeepError keep; try { std::string f = CStr(path); Held l(&Lock); if (CriCue.size() < 4096 || CriCue.count(p)) CriCue[p] = f; } catch (...) {} }
 Cri.file(p, binder, path);
}
void __cdecl HCriWaveId(void *p, void *awb, int id) { if (Live()) { try { CriPick(p, NULL, "wave:" + std::to_string(id)); } catch (...) {} } Cri.waveId(p, awb, id); }
unsigned __cdecl HCriStart(void *p) {
 unsigned id = Cri.start(p);
 if (Live()) {
  KeepError keep;
  try { std::string cue; { Held l(&Lock); auto it = CriCue.find(p); if (it != CriCue.end()) cue = it->second; } Cue("cri", p, cue); } catch (...) {}
 }
 return id;
}

// ---- Wwise (Unity SWIG exports, x64) ---------------------------------------------------------------------------------------
// The first argument of a PostEvent overload is the event: a name (char* or wchar_t*) or its 32-bit id. Which overload
// takes which is not in the export name (SWIG numbers them), so: an argument that points at readable text is a name
// (checked with VirtualQuery, never dereferenced), anything else is an id.
std::string EventName(ULONG_PTR a) {
 unsigned char head[4];
 if (a > 0xFFFF && Peek(head, (void *)a, 2)) {
  std::string r = head[0] && !head[1] ? CStr((void *)a, 128, true) : CStr((void *)a, 128);
  bool text = r.size() >= 2; for (unsigned char c : r) if (c < 0x20 || c == 0x7F) text = false;
  if (text) return r;
 }
 char id[24]; sprintf_s(id, "id:%lu", (unsigned long)(a & 0xFFFFFFFF)); return id;
}
typedef ULONG_PTR(__cdecl *PostFn)(ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR, ULONG_PTR);
PostFn OPost[8];
template <int K> ULONG_PTR __cdecl HPost(ULONG_PTR a, ULONG_PTR b, ULONG_PTR c, ULONG_PTR d, ULONG_PTR e, ULONG_PTR f, ULONG_PTR g, ULONG_PTR h) {
 ULONG_PTR r = OPost[K](a, b, c, d, e, f, g, h);
 if (Live()) { KeepError keep; try { Cue("wwise", (void *)b, EventName(a)); } catch (...) {} }
 return r;
}
void *PostHooks[8] = {(void *)HPost<0>, (void *)HPost<1>, (void *)HPost<2>, (void *)HPost<3>, (void *)HPost<4>, (void *)HPost<5>, (void *)HPost<6>, (void *)HPost<7>};
int PostUsed;
std::map<HMODULE, bool> WwiseSeen;
void HookWwise(HMODULE m) {
 if (sizeof(void *) == 4) { Note("wwise: x86 SWIG exports are stdcall, not hooked"); return; }
 BYTE *base = (BYTE *)m;
 IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS *)(base + ((IMAGE_DOS_HEADER *)base)->e_lfanew);
 IMAGE_DATA_DIRECTORY dir = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT];
 if (!dir.VirtualAddress) return;
 IMAGE_EXPORT_DIRECTORY *ex = (IMAGE_EXPORT_DIRECTORY *)(base + dir.VirtualAddress);
 DWORD *names = (DWORD *)(base + ex->AddressOfNames); WORD *ords = (WORD *)(base + ex->AddressOfNameOrdinals); DWORD *fns = (DWORD *)(base + ex->AddressOfFunctions);
 for (DWORD i = 0; i < ex->NumberOfNames && PostUsed < 8; i++) {
  const char *n = (const char *)(base + names[i]);
  if (!strstr(n, "PostEvent") || strstr(n, "PostEventCallback") || strstr(n, "PostEventOn")) continue;
  void *fn = base + fns[ords[i]];
  bool ok = DumpHook(fn, (void *)PostHooks[PostUsed], (void **)&OPost[PostUsed]);
  if (ok) PostUsed++;
  Note(std::string(ok ? "hooked " : "could not hook ") + n);
 }
}

// ---- export hooks, retried until the module shows up ------------------------------------------------------------------
struct Export { const wchar_t *module; const char *name; void *detour; void **original; };
Export Exports[] = {
 {L"combase.dll", "CoCreateInstance", (void *)HCoCreateCombase, (void **)&OCoCreateCombase},
 {L"ole32.dll", "CoCreateInstance", (void *)HCoCreateOle32, (void **)&OCoCreateOle32},
 {L"cri_ware_unity.dll", "criAtomExAcb_LoadAcbFile", (void *)HCriLoadAcb, (void **)&Cri.loadAcb},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetCueName", (void *)HCriCueName, (void **)&Cri.cueName},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetCueId", (void *)HCriCueId, (void **)&Cri.cueId},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetCueIndex", (void *)HCriCueIndex, (void **)&Cri.cueIndex},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetFile", (void *)HCriFile, (void **)&Cri.file},
 {L"cri_ware_unity.dll", "criAtomExPlayer_SetWaveId", (void *)HCriWaveId, (void **)&Cri.waveId},
 {L"cri_ware_unity.dll", "criAtomExPlayer_Start", (void *)HCriStart, (void **)&Cri.start},
};
const wchar_t *AlModules[] = {L"OpenAL32.dll", L"soft_oal.dll", L"wrap_oal.dll"};
const wchar_t *WwiseModules[] = {L"AkSoundEngine.dll", L"AkUnitySoundEngine.dll"};
bool ExportDone[sizeof Exports / sizeof Exports[0]];
std::vector<void *> HookedTargets; // export addresses already hooked (ole32 forwards to combase: same code, hook once)
HMODULE AlHooked;
bool HookOne(HMODULE m, const char *name, void *detour, void **original) {
 void *fn = (void *)GetProcAddress(m, name);
 if (!fn) return false;
 for (void *t : HookedTargets) if (t == fn) { Note(std::string("already hooked ") + name); return false; }
 bool ok = DumpHook(fn, detour, original);
 if (ok) HookedTargets.push_back(fn);
 Note(std::string(ok ? "hooked " : "could not hook ") + name);
 return ok;
}
// All hooks need every one of an OpenAL set (a half-hooked set would call a NULL original): resolve first, then hook.
void HookOpenAl(HMODULE m) {
 const char *names[] = {"alBufferData", "alSourcei", "alSourcePlay", "alSourcePlayv", "alSourceStop", "alSourceQueueBuffers", "alDeleteBuffers"};
 for (auto n : names) if (!GetProcAddress(m, n)) { Note(std::string("openal without ") + n + ", not hooked"); return; }
 HookOne(m, "alBufferData", (void *)HAlBufferData, (void **)&Al.data);
 HookOne(m, "alSourcei", (void *)HAlSourcei, (void **)&Al.sourcei);
 HookOne(m, "alSourcePlay", (void *)HAlPlay, (void **)&Al.play);
 HookOne(m, "alSourcePlayv", (void *)HAlPlayv, (void **)&Al.playv);
 HookOne(m, "alSourceStop", (void *)HAlStop, (void **)&Al.stop);
 HookOne(m, "alSourceQueueBuffers", (void *)HAlQueue, (void **)&Al.queue);
 HookOne(m, "alDeleteBuffers", (void *)HAlDelete, (void **)&Al.del);
}
// tryOnly: from the loader callback, where waiting for HookLock could deadlock with the dump thread (it may hold the
// lock while GetModuleHandle waits for the loader lock this thread holds); the next Tick catches up instead.
void HookExports(bool tryOnly) {
 if (Off) return;
 KeepError keep;
 DumpQuiet quiet; // may run on a game thread (loader callback): see HookMethod
 if (tryOnly) { if (!TryEnterCriticalSection(&HookLock)) return; } else EnterCriticalSection(&HookLock);
 try {
  for (size_t i = 0; i < sizeof Exports / sizeof Exports[0]; i++) {
   if (ExportDone[i]) continue;
   HMODULE m = GetModuleHandleW(Exports[i].module);
   if (!m || !GetProcAddress(m, Exports[i].name)) continue;
   ExportDone[i] = true;
   HookOne(m, Exports[i].name, Exports[i].detour, Exports[i].original);
  }
  if (!AlHooked) for (auto name : AlModules) {
   HMODULE m = GetModuleHandleW(name);
   if (!m || !GetProcAddress(m, "alBufferData")) continue;
   AlHooked = m; // one OpenAL per process; a router (OpenAL32) forwards to its driver, so hook the first one found
   HookOpenAl(m);
   break;
  }
  for (auto name : WwiseModules) {
   HMODULE m = GetModuleHandleW(name);
   if (m && !WwiseSeen[m]) { WwiseSeen[m] = true; HookWwise(m); }
  }
 } catch (...) {}
 LeaveCriticalSection(&HookLock);
}
// Audio DLLs are often loaded right before first use: hook them as soon as the loader returns.
typedef LONG(NTAPI *LdrLoadFn)(PWSTR, PULONG, void *, PVOID *);
LdrLoadFn OLdrLoad;
LONG NTAPI HLdrLoad(PWSTR path, PULONG flags, void *name, PVOID *handle) {
 LONG st = OLdrLoad(path, flags, name, handle);
 if (st >= 0 && Live()) HookExports(true);
 return st;
}

// ---- writer (dump thread only) ------------------------------------------------------------------------------------------
typedef ULONG(NTAPI *Crc32Fn)(ULONG, const void *, ULONG);
Crc32Fn Crc32;
std::map<ULONG, std::string> Written; // crc -> file
void Append(const std::wstring &path, const std::string &line) {
 HANDLE h = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return;
 DWORD w; WriteFile(h, line.data(), (DWORD)line.size(), &w, NULL); CloseHandle(h);
}
bool WriteWav(const std::wstring &path, const Fmt &f, const std::vector<unsigned char> &data) {
 struct { char riff[4]; DWORD size; char wave[4], fmt[4]; DWORD fsize; WORD tag, ch; DWORD rate, bps; WORD align, bits; char dat[4]; DWORD dsize; } h;
 memcpy(h.riff, "RIFF", 4); memcpy(h.wave, "WAVE", 4); memcpy(h.fmt, "fmt ", 4); memcpy(h.dat, "data", 4);
 h.fsize = 16; h.tag = (WORD)(f.tag == 0xFFFE ? (f.bits == 32 ? 3 : 1) : f.tag); h.ch = (WORD)f.ch; h.rate = f.rate; h.bits = (WORD)f.bits;
 h.align = (WORD)(f.ch * f.bits / 8); h.bps = h.rate * h.align; h.dsize = (DWORD)data.size(); h.size = 36 + h.dsize;
 std::wstring tmp = path + L".tmp";
 HANDLE fh = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 if (fh == INVALID_HANDLE_VALUE) return false;
 DWORD w1 = 0, w2 = 0;
 bool ok = WriteFile(fh, &h, sizeof h, &w1, NULL) && WriteFile(fh, data.data(), (DWORD)data.size(), &w2, NULL) && w1 == sizeof h && w2 == data.size();
 CloseHandle(fh);
 // Never replaces a file: names only grow (Seq starts after the highest one already there), so old events stay right.
 if (!ok || !MoveFileExW(tmp.c_str(), path.c_str(), 0)) { DeleteFileW(tmp.c_str()); return false; }
 return true;
}
void Write(Ready &r) {
 std::string file; ULONG crc = 0; unsigned ms = 0;
 if (!r.data.empty()) {
  crc = Crc32 ? Crc32(0, r.data.data(), (ULONG)r.data.size()) : (ULONG)r.data.size();
  auto w = Written.find(crc);
  if (w != Written.end()) file = w->second;
  else {
   if (Spent + (LONGLONG)r.data.size() > Budget) return;
   char name[64]; sprintf_s(name, "%05ld_%s.wav", InterlockedIncrement(&Seq), r.api.c_str());
   std::wstring wname(name, name + strlen(name));
   CreateDirectoryW(Dir.c_str(), NULL);
   if (!WriteWav(Dir + wname, r.fmt, r.data)) return;
   file = name; Written[crc] = file; Spent += (LONGLONG)r.data.size();
  }
  unsigned align = r.fmt.ch * r.fmt.bits / 8;
  if (align && r.fmt.rate) ms = (unsigned)(r.data.size() / align * 1000ull / r.fmt.rate);
 }
 char obj[32]; sprintf_s(obj, "%p", (void *)r.obj);
 std::string line = "{\"file\":" + Json(file) + ",\"api\":\"" + r.api + "\",\"obj\":\"" + obj + "\",\"start\":" + std::to_string(r.start) +
  ",\"ms\":" + std::to_string(ms) + ",\"rate\":" + std::to_string(r.fmt.rate) + ",\"ch\":" + std::to_string(r.fmt.ch) + ",\"bits\":" + std::to_string(r.fmt.bits) +
  ",\"bytes\":" + std::to_string(r.data.size());
 char c[16]; sprintf_s(c, "%08lx", crc);
 line += std::string(",\"crc\":\"") + c + "\",\"stopped\":" + (r.stopped ? "true" : "false") + ",\"raw\":false,\"name\":" + Json(r.name.size() > 300 ? r.name.substr(r.name.size() - 300) : r.name) + "}\n";
 Append(Dir + L"events.jsonl", line);
}
// Highest NNNNN of NNNNN_*.wav already in the folder (earlier sessions), so new clips never take an old name.
LONG LastSeq() {
 LONG best = 0; WIN32_FIND_DATAW f;
 HANDLE h = FindFirstFileW((Dir + L"*_*.wav").c_str(), &f);
 if (h == INVALID_HANDLE_VALUE) return 0;
 do { LONG n = wcstol(f.cFileName, NULL, 10); if (n > best) best = n; } while (FindNextFileW(h, &f));
 FindClose(h);
 return best;
}
void StandDown() { InterlockedExchange(&Off, 1); }
}
using namespace audiomore;

void AudioMoreStart(const wchar_t *out) {
 if (InterlockedExchange(&Started, 1)) return;
 InitializeCriticalSection(&Lock); InitializeCriticalSection(&HookLock);
 DumpOnStop("AudioMore", StandDown);
 Dir = std::wstring(out) + L"voice\\";
 CreateDirectoryW(Dir.c_str(), NULL);
 Seq = LastSeq();
 Crc32 = (Crc32Fn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlComputeCrc32");
 HookExports(false);
 void *ldr = (void *)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "LdrLoadDll");
 if (ldr) DumpHook(ldr, (void *)HLdrLoad, (void **)&OLdrLoad);
}
// Every ~120 ms on the dump thread: hooks modules loaded since, cuts static OpenAL plays, closes quiet clips, writes them.
void AudioMoreTick() {
 if (!Started || Off) return;
 HookExports(false);
 std::vector<Ready> ready; std::vector<std::string> notes;
 {
  Held h(&Lock);
  for (auto &p : AlPlays) {
   auto b = AlBuffers.find(p.buf);
   if (b != AlBuffers.end() && b->second.pcm.size() >= MinBytes) ready.push_back({"openal", "", b->second.fmt, b->second.pcm, p.start, false, p.src});
  }
  AlPlays.clear();
  DWORD now = GetTickCount();
  for (auto it = Clips.begin(); it != Clips.end(); ) {
   Clip &c = it->second;
   if (!c.data.empty()) {
    if (c.done || (c.playing && now - c.last > IdleMs)) Close(c);
    else if (!c.playing && now - c.last > 30000) std::vector<unsigned char>().swap(c.data); // queued but never played
   }
   // Objects the game stopped using (voices destroyed, sources deleted) leave empty entries: drop them after a minute.
   if (c.data.empty() && now - c.last > 60000) { if (it->first.first == KVoice) VoiceVersion.erase((void *)it->first.second); it = Clips.erase(it); }
   else ++it;
  }
  for (auto &r : Queue) ready.push_back(std::move(r));
  Queue.clear(); Queued = 0; notes.swap(Notes);
 }
 std::wstring log = Dir.substr(0, Dir.size() - 6) + L"dump.log"; // <out>\dump.log
 for (auto &n : notes) Append(log, n);
 for (auto &r : ready) Write(r);
}
