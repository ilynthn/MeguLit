// SPDX-License-Identifier: GPL-3.0-or-later
// KiriKiri (krkr2 / krkrz) module of MeguLitDump: every file the engine opens through TVPCreateStream comes back
// already decrypted by the game's own xp3 filter (cxdec and friends), so reading that stream once is the whole trick.
// Ported from KrkrDump (crskycode/KrkrDump, GPL-3.0, KrkrDump/dllmain.cpp): the TVPCreateStream signatures for KRKRZ
// (MSVC __fastcall) and KRKR2 (BCB register call, naked thunk), the GetProcAddress("V2Link") hook that waits for the
// engine (packed exes are unpacked by the time plugins link), the stream read with Seek(0) afterwards, and the KAG
// SimpleCrypt decoder (FE FE mode FF FE; mode 0 XOR, 1 bit swap, 2 zlib). KrkrExtract (no licence) was read for ideas
// only. Differences: nothing is written next to the game, the text goes through DumpSave into index.jsonl; zlib is a
// small inflate of our own; names come from the ttstr, media and huge streams are skipped.
// 32-bit only (both signatures are x86); on x64 the module logs and stays idle.
#include <windows.h>
#include <stdio.h>
#include <string>
#include <vector>
#include "dump_api.h"

#ifndef _WIN64
namespace {
typedef unsigned __int64 u64; typedef __int64 i64;
// tTJSBinaryStream (TJS_INTF_METHOD is __cdecl in tp_stub.h)
class Stream {
public:
 virtual u64 __cdecl Seek(i64 offset, int whence) = 0;
 virtual unsigned __cdecl Read(void *buffer, unsigned size) = 0;
 virtual unsigned __cdecl Write(const void *buffer, unsigned size) = 0;
 virtual void __cdecl SetEndOfStorage() = 0;
 virtual u64 __cdecl GetSize() = 0;
 virtual ~Stream() {}
};
// ttstr = pointer to tTJSVariantString_S { RefCount, LongString, ShortString[22], Length, ... }
struct VariantString { int RefCount; wchar_t *LongString; wchar_t ShortString[22]; int Length; };
// Scripts are small; anything bigger is an archive or media the game is about to stream (review 3, item 1).
const unsigned Max = 8u << 20;

// ---- inflate (RFC 1951), enough for SimpleCrypt mode 2 -------------------------------------------------------------
struct Bits { const unsigned char *p, *end; unsigned bit, cnt; bool bad; };
unsigned Need(Bits &b, int n) {
 while (b.cnt < (unsigned)n) { if (b.p >= b.end) { b.bad = true; return 0; } b.bit |= (unsigned)*b.p++ << b.cnt; b.cnt += 8; }
 unsigned v = b.bit & ((1u << n) - 1); b.bit >>= n; b.cnt -= n; return v;
}
struct Huff { short count[16], symbol[320]; };
bool Build(Huff &h, const short *len, int n) {
 short offs[16]; memset(h.count, 0, sizeof h.count);
 for (int i = 0; i < n; i++) h.count[len[i]]++;
 if (h.count[0] == n) return true;
 int left = 1; for (int i = 1; i < 16; i++) { left <<= 1; left -= h.count[i]; if (left < 0) return false; }
 offs[1] = 0; for (int i = 1; i < 15; i++) offs[i + 1] = offs[i] + h.count[i];
 for (int i = 0; i < n; i++) if (len[i]) h.symbol[offs[len[i]]++] = (short)i;
 return true;
}
int Decode(Bits &b, const Huff &h) {
 int code = 0, first = 0, index = 0;
 for (int len = 1; len < 16; len++) {
  code |= (int)Need(b, 1); if (b.bad) return -1;
  int count = h.count[len];
  if (code - count < first) return h.symbol[index + (code - first)];
  index += count; first += count; first <<= 1; code <<= 1;
 }
 return -1;
}
// Fixed Huffman tables, built once in KrkrStart before any hook can run (review 3, item 5: no first-use race).
Huff FixedL, FixedD; bool FixedReady;
void BuildFixed() {
 short l[288]; int i = 0; for (; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8;
 short d[30]; for (i = 0; i < 30; i++) d[i] = 5;
 FixedReady = Build(FixedL, l, 288) && Build(FixedD, d, 30);
}
const short LBase[] = { 3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258 };
const short LExt[] = { 0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0 };
const short DBase[] = { 1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577 };
const short DExt[] = { 0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13 };
bool Codes(Bits &b, std::vector<unsigned char> &out, const Huff &lc, const Huff &dc, size_t cap) {
 for (;;) {
  int sym = Decode(b, lc); if (sym < 0) return false;
  if (sym < 256) { if (out.size() >= cap) return false; out.push_back((unsigned char)sym); continue; }
  if (sym == 256) return true;
  sym -= 257; if (sym >= 29) return false;
  int len = LBase[sym] + (int)Need(b, LExt[sym]);
  int ds = Decode(b, dc); if (ds < 0 || ds >= 30) return false;
  size_t dist = (size_t)DBase[ds] + Need(b, DExt[ds]);
  if (b.bad || dist > out.size() || out.size() + len > cap) return false;
  for (int i = 0; i < len; i++) out.push_back(out[out.size() - dist]);
 }
}
// zlib stream (2-byte header, deflate data); false on anything odd.
bool Inflate(const unsigned char *in, size_t n, std::vector<unsigned char> &out, size_t cap) {
 if (n < 2 || (in[0] & 0x0F) != 8 || ((in[0] << 8) | in[1]) % 31) return false;
 Bits b = { in + 2, in + n, 0, 0, false };
 for (int last = 0; !last; ) {
  last = (int)Need(b, 1); int type = (int)Need(b, 2); if (b.bad) return false;
  if (type == 0) {
   b.bit = 0; b.cnt = 0; if (b.end - b.p < 4) return false;
   unsigned len = b.p[0] | (b.p[1] << 8), nlen = b.p[2] | (b.p[3] << 8); b.p += 4;
   if ((len ^ 0xFFFF) != nlen || (size_t)(b.end - b.p) < len || out.size() + len > cap) return false;
   out.insert(out.end(), b.p, b.p + len); b.p += len;
  } else if (type == 1) {
   if (!FixedReady || !Codes(b, out, FixedL, FixedD, cap)) return false;
  } else if (type == 2) {
   int nlen = (int)Need(b, 5) + 257, ndist = (int)Need(b, 5) + 1, ncode = (int)Need(b, 4) + 4;
   static const short order[19] = { 16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15 };
   short lengths[320] = { 0 }; Huff lencode, distcode;
   if (nlen > 286 || ndist > 30) return false;
   for (int i = 0; i < ncode; i++) lengths[order[i]] = (short)Need(b, 3);
   if (b.bad || !Build(lencode, lengths, 19)) return false;
   for (int i = 0; i < nlen + ndist; ) {
    int sym = Decode(b, lencode); if (sym < 0) return false;
    if (sym < 16) { lengths[i++] = (short)sym; continue; }
    short v = 0; int rep;
    if (sym == 16) { if (!i) return false; v = lengths[i - 1]; rep = 3 + (int)Need(b, 2); }
    else if (sym == 17) rep = 3 + (int)Need(b, 3); else rep = 11 + (int)Need(b, 7);
    if (i + rep > nlen + ndist) return false;
    while (rep--) lengths[i++] = v;
   }
   if (b.bad || !Build(lencode, lengths, nlen) || !Build(distcode, lengths + nlen, ndist)) return false;
   if (!Codes(b, out, lencode, distcode, cap)) return false;
  } else return false;
 }
 return true;
}

// ---- KAG SimpleCrypt (KrkrDump TryDecryptText) -------------------------------------------------------------------
// data starts FE FE <mode> FF FE. Output: UTF-16LE text with its BOM.
bool SimpleCrypt(const unsigned char *d, size_t n, std::vector<unsigned char> &out) {
 if (n < 5 || d[0] != 0xFE || d[1] != 0xFE || d[2] > 2 || d[3] != 0xFF || d[4] != 0xFE) return false;
 int mode = d[2]; out.assign({ 0xFF, 0xFE });
 if (mode == 2) {
  if (n < 21) return false;
  i64 packed, size; memcpy(&packed, d + 5, 8); memcpy(&size, d + 13, 8);
  if (packed <= 0 || size <= 0 || size > Max || (size_t)packed > n - 21) return false;
  // the header's size is only a claim: never reserve more than the packed bytes can expand to (deflate max ~1032:1)
  std::vector<unsigned char> plain; plain.reserve((size_t)min((u64)size, (u64)packed * 1032));
  if (!Inflate(d + 21, (size_t)packed, plain, (size_t)size) || plain.size() != (size_t)size) return false;
  out.insert(out.end(), plain.begin(), plain.end());
  return true;
 }
 for (size_t i = 5; i + 1 < n; i += 2) {
  unsigned short c = (unsigned short)(d[i] | (d[i + 1] << 8));
  if (mode == 0) { if (c >= 0x20) c = (unsigned short)(c ^ (((c & 0xFE) << 8) ^ 1)); }
  else c = (unsigned short)(((c & 0xAAAA) >> 1) | ((c & 0x5555) << 1));
  out.push_back((unsigned char)c); out.push_back((unsigned char)(c >> 8));
 }
 return true;
}

// ---- the stream ----------------------------------------------------------------------------------------------------
std::string Narrow(const wchar_t *w) {
 int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, NULL, 0, NULL, NULL); if (n <= 1) return "";
 std::string r(n - 1, '\0'); WideCharToMultiByte(CP_UTF8, 0, w, -1, &r[0], n, NULL, NULL); return r;
}
// The name, bounded by its stored length (never an unbounded wcslen on game memory).
bool NameOf(void *ttstr, std::wstring &out) {
 if (!ttstr || !DumpReadable(ttstr, sizeof(void *))) return false;
 VariantString *v = *(VariantString **)ttstr;
 if (!v || !DumpReadable(v, sizeof *v)) return false;
 if (v->LongString) {
  if (v->Length <= 0 || v->Length > 4096 || !DumpReadable(v->LongString, (SIZE_T)v->Length * 2)) return false;
  out.assign(v->LongString, (size_t)v->Length);
 } else out.assign(v->ShortString, wcsnlen(v->ShortString, 22));
 return !out.empty();
}
// Only members of an archive (".xp3>..." or archive://) with a script-like extension are read: never the archive itself,
// never media (review 3, item 1).
bool Wanted(const std::wstring &path) {
 if (path.find(L'>') == std::wstring::npos && path.compare(0, 10, L"archive://") != 0) return false;
 size_t dot = path.find_last_of(L'.'), slash = path.find_last_of(L"/\\>");
 if (dot == std::wstring::npos || (slash != std::wstring::npos && dot < slash)) return false;
 std::wstring ext = path.substr(dot + 1); for (auto &c : ext) if (c >= L'A' && c <= L'Z') c = (wchar_t)(c + 32);
 static const wchar_t *ok[] = { L"ks", L"tjs", L"txt", L"csv", L"tsv", L"ini", L"func", L"json", L"xml", L"scn", L"asd" };
 for (auto e : ok) if (ext == e) return true;
 return false;
}
// The game's stream methods may throw (eTJSError, BCB 0x0EEDFADE) or fault: they are called only through these SEH-only
// helpers, so nothing ever leaves the hook (review 3, item 2).
bool SafeSeek(Stream *s, i64 o, int whence, u64 *r) { __try { u64 v = s->Seek(o, whence); if (r) *r = v; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; } }
bool SafeRead(Stream *s, void *b, unsigned n, unsigned *got) { __try { *got = s->Read(b, n); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { *got = 0; return false; } }
// Whatever happens after the stream was touched, the game gets it back at position 0.
struct Rewind { Stream *s; bool touched; ~Rewind() { if (touched) SafeSeek(s, 0, 0, NULL); } };
volatile LONG Streams;
// Reads the whole stream the engine just opened (already decrypted), saves it, and rewinds it for the game.
void Process(Stream *s, void *name, unsigned flags) {
 if (!s || flags != 0 /* TJS_BS_READ */ || !DumpActive("Krkr") || DumpInside()) return;
 DumpScope scope;
 Rewind rewind = { s, false };
 try {
  std::wstring path; if (!NameOf(name, path) || !Wanted(path) || DumpSkipped(path.c_str())) return;
  u64 size = 0; rewind.touched = true;
  if (!SafeSeek(s, 0, 2 /* END */, &size) || !SafeSeek(s, 0, 0 /* SET */, NULL) || !size || size > Max) return;
  std::vector<unsigned char> buf((size_t)size);
  unsigned got = 0;
  if (!SafeRead(s, buf.data(), (unsigned)size, &got) || got != size) return;
  std::string source = Narrow(path.c_str());
  std::vector<unsigned char> text;
  if (SimpleCrypt(buf.data(), buf.size(), text)) DumpSave(source.c_str(), "krkr", text.data(), (DWORD)text.size(), 0, true);
  else DumpSave(source.c_str(), "krkr", buf.data(), (DWORD)buf.size(), 0, false);
  InterlockedIncrement(&Streams);
 } catch (...) {}
}

// KRKRZ (MSVC): Stream *__fastcall TVPCreateStream(ttstr *name, tjs_uint32 flags)
const char SigZ[] = "\x55\x8B\xEC\x6A\xFF\x68\x2A\x2A\x2A\x2A\x64\xA1\x2A\x2A\x2A\x2A\x50\x83\xEC\x5C\x53\x56\x57\xA1\x2A\x2A\x2A\x2A\x33\xC5\x50\x8D\x45\xF4\x64\xA3\x2A\x2A\x2A\x2A\x89\x65\xF0\x89\x4D\xEC\xC7\x45\x2A\x2A\x2A\x2A\x2A\xE8\x2A\x2A\x2A\x2A\x8B\x4D\xF4\x64\x89\x0D\x2A\x2A\x2A\x2A\x59\x5F\x5E\x5B\x8B\xE5\x5D\xC3";
// KRKR2 (BCB): name in eax, flags in edx
const char Sig2[] = "\x55\x8B\xEC\x81\xC4\x2A\x2A\x2A\x2A\x53\x56\x57\x89\x95\x2A\x2A\x2A\x2A\x89\x85\x2A\x2A\x2A\x2A\xB8\x2A\x2A\x2A\x2A\xC7\x85\x2A\x2A\x2A\x2A\x2A\x2A\x2A\x2A\x89\x65\x80\x89\x85\x2A\x2A\x2A\x2A\x66\xC7\x45\x2A\x2A\x2A\x33\xD2\x89\x55\x90\x64\x8B\x0D\x2A\x2A\x2A\x2A\x89\x8D\x2A\x2A\x2A\x2A\x8D\x85\x2A\x2A\x2A\x2A\x64\xA3\x2A\x2A\x2A\x2A\x66\xC7\x45\x2A\x2A\x2A\x8B\x95\x2A\x2A\x2A\x2A\x8B\x85\x2A\x2A\x2A\x2A\xE8\x2A\x2A\x2A\x2A\x8B\x95\x2A\x2A\x2A\x2A\x64\x89\x15\x2A\x2A\x2A\x2A\xE9\x2A\x2A\x2A\x2A\x6A\x23\x8B\x8D\x2A\x2A\x2A\x2A\x83\x39\x00\x74\x20\x8B\x85\x2A\x2A\x2A\x2A\x8B\x00\x85\xC0\x75\x04\x33\xD2";

typedef Stream *(__fastcall *CreateZ)(void *, unsigned);
CreateZ OCreateZ;
Stream *__fastcall HCreateZ(void *name, unsigned flags) {
 Stream *s = OCreateZ(name, flags);
 DWORD e = GetLastError(); Process(s, name, flags); SetLastError(e);
 return s;
}
void *OCreate2;
__declspec(naked) Stream *Call2(void *, unsigned) {
 __asm { mov edx, [esp + 8]
         mov eax, [esp + 4]
         call OCreate2
         ret }
}
Stream *__cdecl HCreate2(void *name, unsigned flags) {
 Stream *s = Call2(name, flags);
 DWORD e = GetLastError(); Process(s, name, flags); SetLastError(e);
 return s;
}
void __declspec(naked) Detour2() {
 __asm { push edx
         push eax
         call HCreate2
         add esp, 8
         ret }
}

// Signature search over the exe's image ('*' = 0x2A is a wildcard, as in KrkrDump's PE::SearchPattern). Packed exes
// often wipe or fake their PE header, and this also runs on a game thread (GetProcAddress hook): headers are checked
// and the whole walk is under SEH (review 3, item 3).
void *SearchRaw(const char *sig, size_t len) {
 unsigned char *base = (unsigned char *)GetModuleHandleW(NULL);
 if (!base || !DumpReadable(base, sizeof(IMAGE_DOS_HEADER))) return NULL;
 IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER *)base;
 if (dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew <= 0 || dos->e_lfanew > 0x10000) return NULL;
 IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew);
 if (!DumpReadable(nt, sizeof *nt) || nt->Signature != IMAGE_NT_SIGNATURE || nt->FileHeader.NumberOfSections > 96) return NULL;
 IMAGE_SECTION_HEADER *sec = IMAGE_FIRST_SECTION(nt);
 if (!DumpReadable(sec, sizeof *sec * nt->FileHeader.NumberOfSections)) return NULL;
 for (int k = 0; k < nt->FileHeader.NumberOfSections; k++) {
  if (!(sec[k].Characteristics & IMAGE_SCN_MEM_EXECUTE)) continue;
  unsigned char *p = base + sec[k].VirtualAddress; size_t n = sec[k].Misc.VirtualSize;
  if (n < len || !DumpReadable(p, n)) continue;
  for (size_t i = 0; i + len <= n; i++) {
   size_t j = 0; while (j < len && ((unsigned char)sig[j] == 0x2A || p[i + j] == (unsigned char)sig[j])) j++;
   if (j == len) return p + i;
  }
 }
 return NULL;
}
void *Search(const char *sig, size_t len) { __try { return SearchRaw(sig, len); } __except (EXCEPTION_EXECUTE_HANDLER) { return NULL; } }
volatile LONG Hooked;
bool HookCreateStream(const char *when) {
 if (Hooked) return true;
 void *z = Search(SigZ, sizeof SigZ - 1);
 if (z && DumpHook(z, (void *)HCreateZ, (void **)&OCreateZ)) { InterlockedExchange(&Hooked, 1); DumpLog((std::string("krkr: TVPCreateStream (krkrz) hooked ") + when).c_str()); return true; }
 void *b = z ? NULL : Search(Sig2, sizeof Sig2 - 1);
 if (b && DumpHook(b, (void *)Detour2, &OCreate2)) { InterlockedExchange(&Hooked, 1); DumpLog((std::string("krkr: TVPCreateStream (krkr2) hooked ") + when).c_str()); return true; }
 return false;
}

// Packed exes only show the engine's code once they run; plugins link (V2Link) after that, so the search is repeated
// when the game asks for "V2Link", and the exporter it passes is noted.
typedef HRESULT(__stdcall *V2LinkFn)(void *);
V2LinkFn OV2Link; void *V2Target;
HRESULT __stdcall HV2Link(void *exporter) {
 if (!Hooked && DumpActive("Krkr") && !DumpInside()) { DumpScope scope; char b[64]; sprintf_s(b, "krkr: V2Link exporter %p", exporter); DumpLog(b); HookCreateStream("at V2Link"); }
 return OV2Link(exporter);
}
typedef FARPROC(WINAPI *GetProcFn)(HMODULE, LPCSTR);
// kernel32!GetProcAddress (what games import; on Windows 10+ a stub into kernelbase!GetProcAddressForCaller) and
// kernelbase!GetProcAddress (direct callers) are both watched.
GetProcFn OGetProc[2]; void *GetProcTarget[2];
void Linked(FARPROC r, LPCSTR name);
FARPROC WINAPI HGetProc0(HMODULE m, LPCSTR name) { FARPROC r = OGetProc[0](m, name); DWORD e = GetLastError(); Linked(r, name); SetLastError(e); return r; }
FARPROC WINAPI HGetProc1(HMODULE m, LPCSTR name) { FARPROC r = OGetProc[1](m, name); DWORD e = GetLastError(); Linked(r, name); SetLastError(e); return r; }
void Linked(FARPROC r, LPCSTR name) {
 if (r && HIWORD(name) && DumpActive("Krkr") && !DumpInside() && !strcmp(name, "V2Link")) {
  DumpScope scope;
  if (HookCreateStream("at GetProcAddress(V2Link)")) {
   // found: neither GetProcAddress nor V2Link (it lives in a plugin that can be unlinked) stays hooked (review 3, item 7)
   DumpUnhook(GetProcTarget[0]); DumpUnhook(GetProcTarget[1]); if (V2Target) DumpUnhook(V2Target);
  } else if (!V2Target && DumpHook((void *)r, (void *)HV2Link, (void **)&OV2Link)) V2Target = (void *)r;
 }
}
}

void KrkrStart(const wchar_t *) {
 BuildFixed();
 if (HookCreateStream("at start")) return;
 // Not (yet) a KiriKiri image: if the game folder has .xp3 archives, wait for the engine's plugins to link. Other games
 // get no GetProcAddress hook at all.
 wchar_t exe[1024]; DWORD n = GetModuleFileNameW(NULL, exe, 1024); if (!n || n >= 1024) return;
 wchar_t *cut = wcsrchr(exe, L'\\'); if (!cut) return; if (_snwprintf_s(cut + 1, 1024 - (cut + 1 - exe), _TRUNCATE, L"*.xp3") < 0) return; // review 3, item 6
 WIN32_FIND_DATAW f; HANDLE h = FindFirstFileW(exe, &f); if (h == INVALID_HANDLE_VALUE) return; FindClose(h);
 HMODULE k32 = GetModuleHandleW(L"kernel32.dll"), kb = GetModuleHandleW(L"kernelbase.dll");
 GetProcTarget[0] = k32 ? (void *)GetProcAddress(k32, "GetProcAddress") : NULL;
 GetProcTarget[1] = kb ? (void *)GetProcAddress(kb, "GetProcAddress") : NULL;
 if (GetProcTarget[1] == GetProcTarget[0]) GetProcTarget[1] = NULL;
 bool any = DumpHook(GetProcTarget[0], (void *)HGetProc0, (void **)&OGetProc[0]);
 any |= DumpHook(GetProcTarget[1], (void *)HGetProc1, (void **)&OGetProc[1]);
 if (any) DumpLog("krkr: waiting for V2Link");
}
void KrkrTick() {}
#else
void KrkrStart(const wchar_t *) {}
void KrkrTick() {}
#endif
