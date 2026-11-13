// What RuntimeDump.cpp offers to feature modules (docs/runtime-dump-pack.md). All of it is safe to call from a hook on a
// game thread: nothing throws, and the game's last error is kept.
#pragma once
#include <windows.h>

// Saves a buffer to the game's dump folder as one index.jsonl entry when it reads as text (Shift-JIS, GBK, UTF-8,
// UTF-16LE), or always when force is set (a module that knows the bytes are a script). Same bytes are saved once.
void DumpSave(const char *source, const char *how, const unsigned char *data, DWORD n, ULONGLONG offset, bool force = false);
void DumpLog(const char *line);
// False once the process is shutting down, the dump is off, or the module named here was switched off after a fault:
// a hook that gets false must only call through.
bool DumpActive(const char *module);
// True while this thread is already inside MeguLit's own code (then a hook must only call through).
bool DumpInside();
// Marks this thread as inside MeguLit's code for its lifetime (nested use is fine) and keeps the last error.
struct DumpScope { bool was; DWORD e; DumpScope(); ~DumpScope(); };
// True when a file name is media, a system file or our own output (not worth saving).
bool DumpSkipped(const wchar_t *path);
// MinHook wrappers: create + enable / disable a hook.
bool DumpHook(void *target, void *detour, void **original);
void DumpUnhook(void *target);
// Does [p, p+n) lie in committed readable memory right now?
bool DumpReadable(const void *p, SIZE_T n);
