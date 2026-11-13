// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test for MeguLitFont<bit>.dll without a game: listens on the probe's pipe, loads the DLL, creates a font through
// CreateFontA with a Shift-JIS face name, draws Japanese with GetGlyphOutlineW / ExtTextOutW, loads a private font from
// memory, and checks the reported lines. Usage: host.exe <path to MeguLitFont dll> <a .ttf/.ttc to load from memory>
#include <windows.h>
#include <stdio.h>
#include <string>
static std::string Got;
DWORD WINAPI Listen(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitFont-%lu", GetCurrentProcessId());
 HANDLE p = CreateNamedPipeW(name, PIPE_ACCESS_INBOUND, PIPE_TYPE_BYTE, 1, 0, 65536, 0, NULL);
 if (p == INVALID_HANDLE_VALUE || !ConnectNamedPipe(p, NULL) && GetLastError() != ERROR_PIPE_CONNECTED) return 1;
 char buf[4096]; DWORD n; while (ReadFile(p, buf, sizeof buf, &n, NULL) && n) Got.append(buf, n);
 return 0;
}
int wmain(int argc, wchar_t **argv) {
 if (argc < 3) return 2;
 CreateThread(NULL, 0, Listen, NULL, 0, NULL); Sleep(200);
 if (!LoadLibraryW(argv[1])) { printf("load failed\n"); return 3; }
 Sleep(800);
 HANDLE f = CreateFileW(argv[2], GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); DWORD size = GetFileSize(f, NULL), got = 0;
 char *data = (char *)malloc(size); ReadFile(f, data, size, &got, NULL); CloseHandle(f); DWORD count = 0;
 HANDLE mem = AddFontMemResourceEx(data, size, NULL, &count);
 // "ＭＳ 明朝" in Shift-JIS: a Chinese-locale system would read these bytes as CP936 garbage
 const char face[] = "\x82\x6c\x82\x72\x20\x96\xbe\x92\xa9";
 HFONT font = CreateFontA(-28, 0, 0, 0, 700, 0, 0, 0, SHIFTJIS_CHARSET, 0, 0, 0, 0, face);
 HDC dc = CreateCompatibleDC(NULL); SelectObject(dc, font);
 const wchar_t *text = L"吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。";
 MAT2 m = {{0, 1}, {0, 0}, {0, 0}, {0, 1}}; GLYPHMETRICS gm;
 for (const wchar_t *c = text; *c; c++) GetGlyphOutlineW(dc, *c, GGO_GRAY8_BITMAP, &gm, 0, NULL, &m);
 HBITMAP bmp = CreateCompatibleBitmap(GetDC(NULL), 800, 60); SelectObject(dc, bmp); ExtTextOutW(dc, 0, 0, 0, NULL, text, (UINT)wcslen(text), NULL);
 Sleep(3500);
 printf("%s", Got.c_str());
 bool ok = Got.find("ToMe_FONT src=gdi size=28 weight=700") != std::string::npos && Got.find("face=\xef\xbc\xad\xef\xbc\xb3 \xe6\x98\x8e\xe6\x9c\x9d") != std::string::npos && Got.find("ToMe_FONTFILE kind=mem path=") != std::string::npos && mem;
 printf(ok ? "PASS\n" : "FAIL\n"); return ok ? 0 : 1;
}
