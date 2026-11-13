// SPDX-License-Identifier: GPL-3.0-or-later
// Stand-in game for MeguLitDump32/64.dll tests (shared by every module: script harvest, voice, CG, first line, ...).
// It behaves like a game the DLL is injected into, without being one: it writes its own "data files", reads them back
// with the Win32 calls real engines use and turns them into plain bytes in memory the ways real engines do. Nothing is
// shown, nothing makes a sound, no window is created. Usage (selftest/run.ps1 builds and runs it, 32 and 64 bit):
//   host.exe <MeguLitDump.dll> <dump root>     run from an empty "game folder"; exit code = number of failures
// Writing a case for a new module: add selftest/cases/<Name>.cpp with
//   int Case<Name>(FakeGame &g)   returns its number of failures, prints "FAIL ..." for each
// and a CASE(<Name>) line in selftest/cases/cases.h (one line, its own commit). Cases run after the built-in ones, in
// the same process, with the DLL loaded and ready; use the helpers below (Pack/Entry for an encrypted archive,
// Script for a compiled scenario, Seed for a line the text hook saw, Saved/Contains/Count to check the dump folder).
#pragma once
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string>
#include <vector>
#include <map>

typedef LONG(NTAPI *CompressFn)(USHORT, PUCHAR, ULONG, PUCHAR, ULONG, ULONG, PULONG, PVOID);
typedef LONG(NTAPI *DecompressFn)(USHORT, PUCHAR, ULONG, PUCHAR, ULONG, PULONG);
typedef LONG(NTAPI *WorkSizeFn)(USHORT, PULONG, PULONG);

inline std::string Encode(const wchar_t *text, UINT cp) {
 int n = WideCharToMultiByte(cp, 0, text, -1, NULL, 0, NULL, NULL);
 std::string r(n, '\0'); WideCharToMultiByte(cp, 0, text, -1, &r[0], n, NULL, NULL); r.resize(n - 1); return r;
}
inline std::string Repeat(const std::string &s, int k) { std::string r; for (int i = 0; i < k; i++) r += s; return r; }
inline void Xor(std::string &s) { for (size_t i = 0; i < s.size(); i++) s[i] = (char)(s[i] ^ (0x5A + (i % 7))); }
inline void Put(const std::string &path, const std::string &data) {
 HANDLE h = CreateFileA(path.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
 DWORD w; WriteFile(h, data.data(), (DWORD)data.size(), &w, NULL); CloseHandle(h);
}
inline char *ReadAll(const std::string &path, DWORD *n) {
 HANDLE h = CreateFileA(path.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return NULL;
 *n = GetFileSize(h, NULL);
 char *buf = (char *)malloc(*n);
 ReadFile(h, buf, *n, n, NULL); CloseHandle(h);
 return buf;
}
// Is there a saved .bin whose bytes are exactly `want`?
inline bool Saved(const std::string &dir, const std::string &want, const char *how) {
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((dir + "*.bin").c_str(), &f);
 if (h == INVALID_HANDLE_VALUE) return false;
 bool found = false;
 do {
  if (how && !strstr(f.cFileName, how)) continue;
  DWORD n = 0; char *b = ReadAll(dir + f.cFileName, &n);
  if (b && n == want.size() && !memcmp(b, want.data(), n)) found = true;
  free(b);
 } while (!found && FindNextFileA(h, &f));
 FindClose(h);
 return found;
}
inline int Count(const std::string &dir) {
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((dir + "*.bin").c_str(), &f); int n = 0;
 if (h == INVALID_HANDLE_VALUE) return 0;
 do n++; while (FindNextFileA(h, &f)); FindClose(h); return n;
}

// Is there a saved .bin (of kind `how`) that contains `want`?
inline bool Contains(const std::string &dir, const std::string &want, const char *how) {
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((dir + "*.bin").c_str(), &f);
 if (h == INVALID_HANDLE_VALUE) return false;
 bool found = false;
 do {
  if (how && !strstr(f.cFileName, how)) continue;
  DWORD n = 0; char *b = ReadAll(dir + f.cFileName, &n);
  if (b && std::string(b, n).find(want) != std::string::npos) found = true;
  free(b);
 } while (!found && FindNextFileA(h, &f));
 FindClose(h);
 return found;
}
// A compiled script the way a VM engine keeps it after its own loader decrypted it: opcodes, then a string, per line.
inline std::string Script(UINT cp, int lines) {
 static const wchar_t *say[] = { L"今日は朝から雨が降っていた。", L"「傘、持ってくればよかったね」", L"窓の外を眺めながら、彼女は小さく笑った。",
  L"「でも、こういう日も嫌いじゃないよ」", L"教室には僕たち二人しか残っていない。", L"時計の針の音だけが、静かに響いている。" };
 std::string r;
 for (int i = 0; i < lines; i++) {
  wchar_t line[128]; swprintf_s(line, L"%s第%d話", say[i % 6], i);
  std::string t = cp == 1200 ? std::string((const char *)line, wcslen(line) * 2) : Encode(line, cp);
  unsigned char op[6] = { 0x10, (unsigned char)(i & 0xFF), 0x00, 0x00, (unsigned char)t.size(), 0x00 };
  r.append((const char *)op, 6); r += t; r.append(cp == 1200 ? 2 : 1, '\0');
 }
 return r;
}
inline void Seed(const std::string &dir, const wchar_t *line) {
 // MeguLit writes these from its own process; the stand-in does it inside the game's process, so its copy is wiped
 // right away, or the seed scan would find this copy instead of the game's.
 std::string u = Encode(line, 65001);
 HANDLE h = CreateFileA((dir + "seeds.txt").c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 DWORD w; WriteFile(h, u.data(), (DWORD)u.size(), &w, NULL); WriteFile(h, "\n", 1, &w, NULL); CloseHandle(h);
 SecureZeroMemory(&u[0], u.size());
}


// ---- the game ----------------------------------------------------------------------------------------------------
// A toy archive like most engines use: header "FPK1", entry count, then per entry name[32] / offset / size, then the
// data, each entry XORed with Xor(). Write() puts it on disk; Read*() fetch one entry the way an engine would.
struct Pack {
 std::string file; std::map<std::string, std::pair<DWORD, DWORD>> at;
 void Write(const std::string &path, const std::vector<std::pair<std::string, std::string>> &entries) {
  file = path; std::string head = "FPK1"; DWORD n = (DWORD)entries.size(); head.append((const char *)&n, 4);
  DWORD off = (DWORD)(8 + entries.size() * 40); std::string body;
  for (auto &e : entries) {
   char name[32] = { 0 }; strncpy_s(name, e.first.c_str(), 31); head.append(name, 32);
   DWORD size = (DWORD)e.second.size(); head.append((const char *)&off, 4); head.append((const char *)&size, 4);
   at[e.first] = { off, size }; std::string x = e.second; Xor(x); body += x; off += size;
  }
  Put(path, head + body);
 }
 // ReadFile at the entry's offset into a fresh buffer, then decrypt it in place (how="inplace").
 char *ReadInPlace(const std::string &name, DWORD *n) {
  auto e = at[name]; HANDLE h = CreateFileA(file.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
  if (h == INVALID_HANDLE_VALUE) return NULL;
  SetFilePointer(h, (LONG)e.first, NULL, FILE_BEGIN); char *buf = (char *)malloc(e.second); DWORD got = 0;
  ReadFile(h, buf, e.second, &got, NULL); CloseHandle(h);
  for (DWORD i = 0; i < got; i++) buf[i] = (char)(buf[i] ^ (0x5A + (i % 7)));
  *n = got; return buf;
 }
 // ReadFile, then decrypt into a second buffer of the same size (how="alloc").
 char *ReadFresh(const std::string &name, DWORD *n) {
  auto e = at[name]; HANDLE h = CreateFileA(file.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
  if (h == INVALID_HANDLE_VALUE) return NULL;
  SetFilePointer(h, (LONG)e.first, NULL, FILE_BEGIN); char *enc = (char *)malloc(e.second); DWORD got = 0;
  ReadFile(h, enc, e.second, &got, NULL); CloseHandle(h);
  char *plain = (char *)malloc(got); for (DWORD i = 0; i < got; i++) plain[i] = (char)(enc[i] ^ (0x5A + (i % 7)));
  free(enc); *n = got; return plain;
 }
};

struct FakeGame {
 std::string game;   // the game folder (current directory)
 std::string dir;    // the DLL's output folder for this game, ends in '\'
 std::vector<void *> keep; // buffers the game holds until exit
 // Sets the dump root, loads the DLL and waits for ready.txt. 0 on success.
 int Start(const char *dll, const char *root) {
  char cwd[MAX_PATH]; GetCurrentDirectoryA(MAX_PATH, cwd); game = cwd;
  unsigned hash = 2166136261u;
  for (char *p = cwd; *p; p++) { unsigned char c = (unsigned char)*p; if (c >= 'A' && c <= 'Z') c += 32; hash = (hash ^ c) * 16777619u; }
  char key[16]; sprintf_s(key, "%08x", hash); dir = std::string(root) + "\\" + key + "\\";
  SetEnvironmentVariableA("MEGULIT_RUNTIME_DUMP", root); SetEnvironmentVariableA("MEGULIT_RUNTIME_DUMP_ON", "1");
  if (!LoadLibraryA(dll)) { printf("load failed %lu\n", GetLastError()); return 3; }
  for (int i = 0; i < 100 && !Ready(); i++) Sleep(50);
  if (!Ready()) { printf("dll never ready\n"); return 4; }
  return 0;
 }
 bool Ready() { return GetFileAttributesA((dir + "ready.txt").c_str()) != INVALID_FILE_ATTRIBUTES; }
 // A line shown in the text box: MeguLit's text hook would append it to seeds.txt.
 void Show(const wchar_t *line) { Seed(dir, line); }
 void Hold(void *p) { keep.push_back(p); }
};
