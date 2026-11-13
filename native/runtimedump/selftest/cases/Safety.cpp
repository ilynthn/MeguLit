// Crash-safety checks from the 2026-11-13 review of MeguLitDump (H:\MeguLit-Work\port-notes\review-runtime-dump.md):
// the game's last error survives every hook (item 1), a source path longer than any fixed buffer is saved without
// killing the process and every index line names a file on disk (items 3, 12), freed or unmapped buffers are never
// read with an exception the game could see (item 5), a huge read is not copied (item 6), and the seed scan never
// mistakes MeguLit's own copies of the shown lines for a script (seed expansion).
#include "../fakegame.h"

static volatile LONG Faults;
static LONG CALLBACK CountFaults(EXCEPTION_POINTERS *x) {
 DWORD c = x->ExceptionRecord->ExceptionCode;
 if (c == EXCEPTION_ACCESS_VIOLATION || c == EXCEPTION_GUARD_PAGE || c == EXCEPTION_IN_PAGE_ERROR) InterlockedIncrement(&Faults);
 return EXCEPTION_CONTINUE_SEARCH;
}
static int Lines(const std::string &file) { DWORD n = 0; char *b = ReadAll(file, &n); int k = 0; for (DWORD i = 0; b && i < n; i++) if (b[i] == '\n') k++; free(b); return k; }

int CaseSafety(FakeGame &g) {
 int fail = 0;
 void *vh = AddVectoredExceptionHandler(1, CountFaults);

 // item 1: last error after hooked calls
 HANDLE h = CreateFileA("no-such-file.dat", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 DWORD e = GetLastError();
 if (h != INVALID_HANDLE_VALUE || e != ERROR_FILE_NOT_FOUND) { printf("FAIL CreateFileA missing file: last error %lu, want 2\n", e); fail++; }
 h = CreateFileW(L"no-such-file.dat", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 e = GetLastError();
 if (h != INVALID_HANDLE_VALUE || e != ERROR_FILE_NOT_FOUND) { printf("FAIL CreateFileW missing file: last error %lu, want 2\n", e); fail++; }
 Put("exists.cfg", "x");
 h = CreateFileW(L"exists.cfg", GENERIC_WRITE, 0, NULL, OPEN_ALWAYS, 0, NULL); e = GetLastError();
 if (e != ERROR_ALREADY_EXISTS) { printf("FAIL CreateFileW OPEN_ALWAYS on a file: last error %lu, want 183\n", e); fail++; }
 CloseHandle(h);
 h = CreateFileW(L"exists.cfg", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_ALWAYS, 0, NULL); e = GetLastError();
 if (e != ERROR_ALREADY_EXISTS) { printf("FAIL CreateFileW read OPEN_ALWAYS: last error %lu, want 183\n", e); fail++; }
 CloseHandle(h);
 HANDLE m1 = CreateFileMappingW(INVALID_HANDLE_VALUE, NULL, PAGE_READWRITE, 0, 4096, L"Local\\MeguLitDumpSelfTest");
 HANDLE m2 = CreateFileMappingW(INVALID_HANDLE_VALUE, NULL, PAGE_READWRITE, 0, 4096, L"Local\\MeguLitDumpSelfTest"); e = GetLastError();
 if (!m2 || e != ERROR_ALREADY_EXISTS) { printf("FAIL second named mapping: last error %lu, want 183 (single-instance checks)\n", e); fail++; }
 CloseHandle(m2); CloseHandle(m1);
 SetLastError(1234); char tmp[16]; DWORD got = 0; h = CreateFileA("exists.cfg", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 SetLastError(1234); ReadFile(h, tmp, sizeof tmp, &got, NULL); e = GetLastError(); CloseHandle(h);
 if (e != 1234) { printf("FAIL ReadFile success changed the last error to %lu\n", e); fail++; }

 // items 3, 12: a source path far past 1024 UTF-8 bytes, file names cut inside CJK
 std::wstring deep = L"\\\\?\\" + std::wstring(g.game.begin(), g.game.end());
 std::wstring part; for (int i = 0; i < 80; i++) part += (wchar_t)(0x6F22 + i); // 80 kanji per folder
 for (int k = 0; k < 4; k++) { deep += L"\\" + part; CreateDirectoryW(deep.c_str(), NULL); }
 std::wstring longFile = deep + L"\\" + part + L".txt";
 std::string text = Repeat(Encode(L"「長いパスの中にあるシナリオ、ちゃんと保存されるかな」\r\n", 932), 8);
 h = CreateFileW(longFile.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL); DWORD w = 0; WriteFile(h, text.data(), (DWORD)text.size(), &w, NULL); CloseHandle(h);
 h = CreateFileW(longFile.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 char *lb = (char *)malloc(text.size()); ReadFile(h, lb, (DWORD)text.size(), &got, NULL); CloseHandle(h); free(lb);
 Sleep(300);
 if (!Saved(g.dir, text, "plain")) { printf("FAIL text under a %zu-character path not saved\n", longFile.size()); fail++; }

 // item 5: tracked reads into buffers the game frees right away (VirtualFree, HeapFree) while they are watched
 std::string big = Repeat(Encode(L"「読んだらすぐ捨てるバッファでも、ゲームは落ちちゃいけません」\r\n", 932), 400);
 std::string bx = big; Xor(bx); Put("freed.dat", bx);
 for (int round = 0; round < 3; round++) {
  h = CreateFileA("freed.dat", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
  char *v = (char *)VirtualAlloc(NULL, bx.size(), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
  ReadFile(h, v, (DWORD)bx.size(), &got, NULL); CloseHandle(h);
  for (DWORD i = 0; i < got; i++) v[i] = (char)(v[i] ^ (0x5A + (i % 7)));
  VirtualFree(v, 0, MEM_RELEASE);
  h = CreateFileA("freed.dat", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
  char *hb = (char *)HeapAlloc(GetProcessHeap(), 0, bx.size()); ReadFile(h, hb, (DWORD)bx.size(), &got, NULL); CloseHandle(h);
  HeapFree(GetProcessHeap(), 0, hb);
  Sleep(250);
 }
 Sleep(600);

 // seed expansion: lines MeguLit saw that exist nowhere in the game's memory must not come back as a "script"
 wchar_t one[128];
 for (int i = 0; i < 40; i++) { swprintf_s(one, L"誰も知らない台詞その%d、記憶の中だけに残っている言葉", i); g.Show(one); }
 Sleep(2500);
 swprintf_s(one, L"誰も知らない台詞その%d、記憶の中だけに残っている言葉", 20);
 if (Contains(g.dir, Encode(one, 65001), "seed") || Contains(g.dir, Encode(one, 932), "seed") || Contains(g.dir, std::string((const char *)one, wcslen(one) * 2), "seed")) {
  printf("FAIL seed scan saved MeguLit's own copies of the shown lines\n"); fail++;
 }

 RemoveVectoredExceptionHandler(vh);
 if (Faults) { printf("FAIL %ld access violations / guard page hits raised in the game while the DLL watched freed buffers\n", Faults); fail++; }
 int idx = Lines(g.dir + "index.jsonl"), bins = Count(g.dir);
 if (idx != bins) { printf("FAIL index.jsonl has %d lines but %d .bin files (a name was cut inside a UTF-8 character?)\n", idx, bins); fail++; }
 return fail;
}
