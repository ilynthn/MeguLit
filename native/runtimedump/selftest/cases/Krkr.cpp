// KiriKiri module case (modules/Krkr.cpp): the stand-in exe carries a TVPCreateStream that matches KrkrDump's KRKRZ
// (MSVC) signature byte for byte and really runs (SEH frame, cookie, call into the engine's opener), at first broken
// like a packed exe; it "unpacks", a plugin asks for V2Link, then the game opens scripts the way krkrz does: plain, KAG
// SimpleCrypt modes 0/1/2 (mode 2 deflated by node zlib), an image, and a stream opened for writing. Every script must be
// saved decrypted (UTF-16LE with BOM), the image and the write stream not, and each stream must reach the game whole and
// rewound. x86 only, like the signatures.
#include "../fakegame.h"
#ifndef _WIN64
#pragma comment(linker, "/EXPORT:V2Link=_V2Link@4")
extern "C" __declspec(dllexport) HRESULT __stdcall V2Link(void *exporter) { return exporter ? S_OK : E_POINTER; }

namespace {
// 2840 bytes UTF-16LE -> 256 bytes zlib (node zlib, level 9: dynamic Huffman)
const unsigned char Packed[] = {0x78,0xda,0x9d,0xd5,0x4f,0x4a,0x42,0x61,0x1c,0x85,0xe1,0x5f,0xd3,0xe8,0x42,0xad,0x42,0x90,0x88,0x73,0xbf,0xff,0xdf,0x1a,0x6c,0x1a,0xd,0x42,0x24,0xe2,0x82,0x38,0x10,0xc1,0xa1,0x16,0x94,0x13,0xd1,0x66,0x41,0x8b,0x8,0x1a,0xbb,0x7,0xd7,0xd0,0xa,0x5c,0x45,0xe8,0xc8,0xe1,0xe1,0x2c,0xe0,0x3c,0xb3,0x97,0xd3,0xb7,0xb9,0xbd,0x58,0x67,0x53,0xeb,0xc,0xb6,0xb4,0xc6,0x2e,0xed,0x1a,0xaf,0xdf,0x7f,0xab,0x1b,0x5c,0xa1,0xf7,0x78,0xf7,0xf6,0x80,0x4f,0x8c,0xb0,0xc3,0x1e,0x7,0xfc,0xe0,0x2,0xb7,0xb,0xd8,0xfd,0xfa,0x3,0xcf,0x58,0xe1,0xb,0x63,0xfc,0x6e,0xde,0xb1,0xc5,0x0,0x13,0x34,0x38,0xae,0x9f,0x6c,0x66,0xc3,0x93,0xd3,0x3f,0xb3,0x5b,0xd2,0x6e,0x5,0xdb,0x91,0xb6,0x13,0x6c,0x4f,0xda,0x5e,0xb0,0x3,0x69,0x7,0xc1,0x8e,0xa4,0x1d,0x5,0x3b,0x91,0x76,0x12,0xec,0x4c,0xda,0x59,0xb0,0xb,0x69,0x17,0xc1,0xae,0xa4,0x5d,0xa5,0x76,0x40,0xd7,0xa3,0xb5,0xc9,0xd7,0xd9,0x4a,0xbe,0xa3,0x7d,0x27,0xf9,0x9e,0xf6,0xbd,0xe4,0x7,0xda,0xf,0x92,0x1f,0x69,0x3f,0x4a,0x7e,0xa2,0xfd,0x24,0xf9,0x99,0xf6,0xb3,0xe4,0x17,0xda,0x2f,0x92,0x5f,0x69,0xbf,0x4a,0xff,0x4,0xfa,0xa1,0x20,0xf9,0x2d,0xed,0x6b,0xff,0xca,0x3f,0xac,0x93,0x7c,0x4f,0xfb,0x5e,0xf2,0x3,0xed,0x7,0xc9,0x8f,0xb4,0x1f,0x25,0x3f,0xd1,0x7e,0x92,0xfc,0x4c,0xfb,0x59,0xf2,0xb,0xed,0x17,0xc9,0xaf,0xb4,0xcf,0xf6,0xfb,0xf,0x99,0x58,0xc8,0x27};
const unsigned PlainSize = 2840;

typedef unsigned __int64 u64; typedef __int64 i64;
class Stream {
public:
 virtual u64 __cdecl Seek(i64 offset, int whence) = 0;
 virtual unsigned __cdecl Read(void *buffer, unsigned size) = 0;
 virtual unsigned __cdecl Write(const void *buffer, unsigned size) = 0;
 virtual void __cdecl SetEndOfStorage() = 0;
 virtual u64 __cdecl GetSize() = 0;
 virtual ~Stream() {}
};
// The bytes the engine's xp3 filter hands out (already decrypted from the archive)
class MemStream : public Stream {
public:
 std::string d; size_t pos = 0;
 u64 __cdecl Seek(i64 o, int w) override { i64 b = w == 0 ? 0 : w == 1 ? (i64)pos : (i64)d.size(); i64 p = b + o; if (p < 0) p = 0; if (p > (i64)d.size()) p = (i64)d.size(); pos = (size_t)p; return pos; }
 unsigned __cdecl Read(void *b, unsigned n) override { size_t k = d.size() - pos < n ? d.size() - pos : n; memcpy(b, d.data() + pos, k); pos += k; return (unsigned)k; }
 unsigned __cdecl Write(const void *, unsigned) override { return 0; }
 void __cdecl SetEndOfStorage() override {}
 u64 __cdecl GetSize() override { return d.size(); }
};
// A protection plugin's stream that refuses the first whole read with a Borland exception (0x0EEDFADE), as krkr2
// builds raise them; the game's own later reads work.
class GuardedStream : public MemStream {
public:
 bool refused = false;
 unsigned __cdecl Read(void *b, unsigned n) override { if (!refused) { refused = true; pos = d.size() / 2; RaiseException(0x0EEDFADE, 0, 0, NULL); } return MemStream::Read(b, n); }
};
struct VariantString { int RefCount; wchar_t *LongString; wchar_t ShortString[22]; int Length; };
std::map<std::wstring, std::string> Archive;
Stream *__fastcall Open(void **name, unsigned flags) {
 VariantString *v = (VariantString *)*name; std::wstring n = v->LongString ? v->LongString : v->ShortString;
 MemStream *s = n.find(L"guarded") != std::wstring::npos ? new GuardedStream() : new MemStream(); s->d = Archive[n]; (void)flags; return s;
}
EXCEPTION_DISPOSITION __cdecl Pass(EXCEPTION_RECORD *, void *, CONTEXT *, void *) { return ExceptionContinueSearch; }
DWORD Cookie = 0xBB40E64E;

#pragma section(".krkr", read, write, execute)
// KRKRZ TVPCreateStream as krkrz's MSVC build compiles it; wildcards of the signature filled in at run time.
__declspec(allocate(".krkr")) unsigned char Stub[] = {
 0xCC, 0x8B, 0xEC, 0x6A, 0xFF, 0x68, 0, 0, 0, 0, 0x64, 0xA1, 0, 0, 0, 0, 0x50, 0x83, 0xEC, 0x5C, 0x53, 0x56, 0x57, 0xA1, 0, 0, 0, 0,
 0x33, 0xC5, 0x50, 0x8D, 0x45, 0xF4, 0x64, 0xA3, 0, 0, 0, 0, 0x89, 0x65, 0xF0, 0x89, 0x4D, 0xEC, 0xC7, 0x45, 0xFC, 0, 0, 0, 0,
 0xE8, 0, 0, 0, 0, 0x8B, 0x4D, 0xF4, 0x64, 0x89, 0x0D, 0, 0, 0, 0, 0x59, 0x5F, 0x5E, 0x5B, 0x8B, 0xE5, 0x5D, 0xC3 };
typedef Stream *(__fastcall *CreateFn)(void **, unsigned);

std::string Utf16(const std::wstring &w) { return std::string((const char *)w.data(), w.size() * 2); }
std::string Crypt(const std::wstring &text, int mode) { // KAG SimpleCrypt modes 0 and 1 are their own inverse
 std::string r = "\xFE\xFE"; r += (char)mode; r += "\xFF\xFE";
 for (wchar_t c : text) { unsigned short x = c; if (mode == 0) { if (x >= 0x20) x = (unsigned short)(x ^ (((x & 0xFE) << 8) ^ 1)); } else x = (unsigned short)(((x & 0xAAAA) >> 1) | ((x & 0x5555) << 1)); r.append((const char *)&x, 2); }
 return r;
}
std::wstring Lines(const wchar_t *what, int count) { std::wstring r; wchar_t b[200]; for (int i = 0; i < count; i++) { swprintf_s(b, L"*scene%d|\r\n【陽菜】「%s、第%d行もちゃんと読めるかな」\r\n[p]\r\n", i, what, i); r += b; } return r; }
}

int CaseKrkr(FakeGame &g) {
 int fail = 0;
 // the exe "unpacks": the real first byte, the SEH handler, the cookie and the call into the opener
 DWORD old; VirtualProtect(Stub, sizeof Stub, PAGE_EXECUTE_READWRITE, &old);
 Stub[0] = 0x55; *(void **)(Stub + 6) = (void *)Pass; *(DWORD **)(Stub + 24) = &Cookie;
 *(LONG *)(Stub + 54) = (LONG)((unsigned char *)Open - (Stub + 58));
 FlushInstructionCache(GetCurrentProcess(), Stub, sizeof Stub);
 // a plugin links
 typedef HRESULT(__stdcall *V2)(void *); void *exporter[4] = { 0 };
 V2 link = (V2)GetProcAddress(GetModuleHandleA(NULL), "V2Link");
 if (!link || link(exporter) != S_OK) { printf("FAIL krkr: V2Link not reachable\n"); fail++; }

 std::wstring plainKs = Lines(L"そのままのシナリオ", 30), m0 = Lines(L"排他的論理和のシナリオ", 30), m1 = Lines(L"ビット入れ替えのシナリオ", 30), m2 = Lines(L"圧縮されたシナリオ", 30);
 std::string bom = "\xFF\xFE";
 std::string packed = "\xFE\xFE\x02\xFF\xFE"; i64 c = sizeof Packed, u = PlainSize; packed.append((const char *)&c, 8); packed.append((const char *)&u, 8); packed.append((const char *)Packed, sizeof Packed);
 if (Utf16(m2).size() != PlainSize) { printf("FAIL krkr: test data out of step with packed.inc\n"); fail++; }
 Archive[L"file://./data.xp3>scenario/plain.ks"] = bom + Utf16(plainKs);
 Archive[L"file://./data.xp3>scenario/xor.ks"] = Crypt(m0, 0);
 Archive[L"file://./data.xp3>scenario/swap.ks"] = Crypt(m1, 1);
 Archive[L"file://./data.xp3>scenario/packed.ks"] = packed;
 Archive[L"file://./data.xp3>image/bg01.png"] = bom + Utf16(Lines(L"画像に見える文字列", 30));
 Archive[L"file://./savedata/datasc.ksd"] = bom + Utf16(Lines(L"書き込み用のストリーム", 30));
 // review 3: the archive itself, an oversized member and a stream that throws must not be read whole / must come back rewound
 Archive[L"file://./data.xp3"] = bom + Utf16(Lines(L"アーカイブそのもの", 30));
 Archive[L"file://./data.xp3>scenario/huge.ks"] = bom + Utf16(Lines(L"大きすぎるシナリオ", 30)) + std::string(9u << 20, ' ');
 Archive[L"file://./data.xp3>scenario/guarded.ks"] = bom + Utf16(Lines(L"守られたシナリオ", 30));

 CreateFn create = (CreateFn)(void *)Stub;
 for (auto &e : Archive) {
  VariantString v = { 0, (wchar_t *)e.first.c_str(), { 0 }, (int)e.first.size() }; void *ttstr = &v;
  unsigned flags = e.first.find(L"savedata") != std::wstring::npos ? 1 : 0;
  Stream *s = create(&ttstr, flags);
  std::string back(e.second.size() + 8, '\0');
  unsigned got = s ? s->Read(&back[0], (unsigned)back.size()) : 0;
  if (!s || got != e.second.size() || memcmp(back.data(), e.second.data(), got)) { printf("FAIL krkr: the game got a changed or unrewound stream\n"); fail++; }
  delete s;
 }
 Sleep(300);
 if (!Saved(g.dir, bom + Utf16(plainKs), "krkr")) { printf("FAIL krkr: plain .ks not saved\n"); fail++; }
 if (!Saved(g.dir, bom + Utf16(m0), "krkr")) { printf("FAIL krkr: SimpleCrypt mode 0 not saved decrypted\n"); fail++; }
 if (!Saved(g.dir, bom + Utf16(m1), "krkr")) { printf("FAIL krkr: SimpleCrypt mode 1 not saved decrypted\n"); fail++; }
 if (!Saved(g.dir, bom + Utf16(m2), "krkr")) { printf("FAIL krkr: SimpleCrypt mode 2 (zlib) not saved decrypted\n"); fail++; }
 if (Contains(g.dir, Utf16(L"画像に見える文字列"), NULL)) { printf("FAIL krkr: image stream saved\n"); fail++; }
 if (Contains(g.dir, Utf16(L"書き込み用のストリーム"), NULL)) { printf("FAIL krkr: write stream saved\n"); fail++; }
 if (Contains(g.dir, Utf16(L"アーカイブそのもの"), NULL)) { printf("FAIL krkr: the archive itself was read whole\n"); fail++; }
 if (Contains(g.dir, Utf16(L"大きすぎるシナリオ"), NULL)) { printf("FAIL krkr: a member over 8 MB was read whole\n"); fail++; }
 return fail;
}
#else
int CaseKrkr(FakeGame &) { return 0; } // the krkr signatures are x86; 64-bit games skip the module
#endif
