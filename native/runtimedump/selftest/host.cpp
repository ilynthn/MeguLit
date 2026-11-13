// SPDX-License-Identifier: GPL-3.0-or-later
// Built-in cases of the stand-in game (fakegame.h): decrypt in place, into a fresh buffer, through RtlDecompressBuffer,
// a script decrypted by the game's own loader and found from one shown line (seed expansion); noise, media and cipher
// text must not be saved. Module cases from cases/cases.h run after them. No game is involved.
#include "fakegame.h"

#include "cases/cases.h"
#define CASE(Name) int Case##Name(FakeGame &g);
MEGULIT_SELFTEST_CASES
#undef CASE

int main(int argc, char **argv) {
 if (argc < 3) return 2;
 // A KiriKiri-looking folder (an .xp3 next to the exe), so the krkr module waits for V2Link (cases/Krkr.cpp).
 Put("data.xp3", "XP3 archive stand-in");
 FakeGame g; if (int e = g.Start(argv[1], argv[2])) return e;
 std::string dir = g.dir;
 std::string ja = Repeat(Encode(L"【めぐみん】「我が名はめぐみん！紅魔族随一の魔法の使い手にして、爆裂魔法を操りし者！」\r\n", 932), 6);
 std::string ja2 = Repeat(Encode(L"今日はいい天気ですね。散歩にでも行きましょうか。\r\n", 932), 8);
 std::string zh = Repeat(Encode(L"「吾名惠惠！红魔族第一的魔法师，操纵爆裂魔法之人！」\r\n", 65001), 6);
 std::string noise(4096, '\0'); for (auto &c : noise) c = (char)(rand() & 0xFF);
 std::string a = ja, b = ja2; Xor(a); Xor(b);
 Put("scene.dat", a); Put("trans.chs", b); Put("noise.bin", noise);
 std::string media = ja; Put("face.png", media);

 // 1. in place
 DWORD n = 0; char *buf = ReadAll("scene.dat", &n);
 { std::string s(buf, n); Xor(s); memcpy(buf, s.data(), n); }
 // 2. into a fresh buffer
 DWORD m = 0; char *enc = ReadAll("trans.chs", &m);
 char *plain = (char *)malloc(m);
 for (DWORD i = 0; i < m; i++) plain[i] = (char)(enc[i] ^ (0x5A + (i % 7)));
 // 3. decompression
 HMODULE nt = GetModuleHandleA("ntdll.dll");
 CompressFn compress = (CompressFn)GetProcAddress(nt, "RtlCompressBuffer");
 DecompressFn decompress = (DecompressFn)GetProcAddress(nt, "RtlDecompressBuffer");
 WorkSizeFn work = (WorkSizeFn)GetProcAddress(nt, "RtlGetCompressionWorkSpaceSize");
 ULONG ws = 0, fs = 0; work(2, &ws, &fs);
 std::vector<unsigned char> space(ws), packed(zh.size() * 2), unpacked(zh.size() + 64);
 ULONG packedSize = 0, outSize = 0;
 compress(2, (PUCHAR)zh.data(), (ULONG)zh.size(), packed.data(), (ULONG)packed.size(), 4096, &packedSize, space.data());
 decompress(2, unpacked.data(), (ULONG)unpacked.size(), packed.data(), packedSize, &outSize);
 // 4. noise and media
 DWORD k = 0; char *nb = ReadAll("noise.bin", &k); free(nb);
 DWORD q = 0; char *mb = ReadAll("face.png", &q); free(mb);
 // 5. seed expansion: a script decrypted by the game's own loader from a blob in the exe (no file read, no decompressor);
 //    MeguLit's hook saw one line of it and wrote it to seeds.txt.
 std::string sj = Script(932, 400), w16 = Script(1200, 400);
 std::string sjEnc = sj, wEnc = w16; Xor(sjEnc); Xor(wEnc);
 char *vm1 = (char *)VirtualAlloc(NULL, sj.size() + 4096, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
 char *vm2 = (char *)HeapAlloc(GetProcessHeap(), 0, w16.size());
 memcpy(vm1 + 1000, sjEnc.data(), sjEnc.size()); { std::string t(vm1 + 1000, sj.size()); Xor(t); memcpy(vm1 + 1000, t.data(), t.size()); }
 memcpy(vm2, wEnc.data(), wEnc.size()); { std::string t(vm2, w16.size()); Xor(t); memcpy(vm2, t.data(), t.size()); }
 Seed(dir, L"【陽菜】「傘、持ってくればよかったね」第37話");
 Seed(dir, L"時計の針の音だけが、静かに響いている。第203話");
 Sleep(3500);

 int fail = 0;
 if (!Contains(dir, sj.substr(6, 400), "seed") || !Contains(dir, sj.substr(sj.size() - 400), "seed")) { printf("FAIL Shift-JIS script around a seed not saved whole\n"); fail++; }
 if (!Contains(dir, w16.substr(6, 400), "seed") || !Contains(dir, w16.substr(w16.size() - 400), "seed")) { printf("FAIL UTF-16 script around a seed not saved whole\n"); fail++; }
 if (!Saved(dir, ja, "inplace")) { printf("FAIL in-place decrypt not saved\n"); fail++; }
 if (!Saved(dir, ja2, "alloc")) { printf("FAIL fresh-buffer decrypt not saved\n"); fail++; }
 if (!Saved(dir, zh, "rtl")) { printf("FAIL RtlDecompressBuffer output not saved\n"); fail++; }
 if (Saved(dir, noise, NULL)) { printf("FAIL noise saved\n"); fail++; }
 if (Saved(dir, ja, "plain")) { printf("FAIL media file read as plain text\n"); fail++; }
 if (Saved(dir, a, NULL) || Saved(dir, b, NULL)) { printf("FAIL cipher text saved\n"); fail++; }
 #define CASE(Name) fail += Case##Name(g);
 MEGULIT_SELFTEST_CASES
 #undef CASE
 printf("%s: %d saved, %d failures\n", sizeof(void *) == 8 ? "x64" : "x86", Count(dir), fail);
 free(buf); free(enc); free(plain); VirtualFree(vm1, 0, MEM_RELEASE); HeapFree(GetProcessHeap(), 0, vm2);
 return fail ? 1 : 0;
}
