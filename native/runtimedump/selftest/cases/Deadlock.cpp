// Core lock vs MinHook (2026-11-14, found by mem-voice-api): a module hooking from a game thread makes MinHook freeze
// every other thread and then call CloseHandle on this one. If a frozen thread holds the core's Gate, a CloseHandle hook
// that waits for Gate never returns. Here one thread holds Gate (through the DLL's self-test export) while another hooks
// a function through DumpHook, and while a third closes a handle; both must finish well before the lock is released.
#include "../fakegame.h"

typedef int(__cdecl *SelfTestFn)(int, DWORD);
static SelfTestFn SelfTest;
static DWORD WINAPI HoldGate(void *) { return (DWORD)SelfTest(1, 4000); }
static DWORD WINAPI HookNow(void *) { return (DWORD)SelfTest(2, 0); }
static HANDLE Opened[20];
static DWORD WINAPI OpenClose(void *) { for (HANDLE h : Opened) CloseHandle(h); return 0; } // files tracked before the lock was taken

int CaseDeadlock(FakeGame &) {
 HMODULE dll = GetModuleHandleA(sizeof(void *) == 8 ? "MeguLitDump64.dll" : "MeguLitDump32.dll");
 SelfTest = dll ? (SelfTestFn)GetProcAddress(dll, "MeguLitDumpSelfTest") : NULL;
 if (!SelfTest) { printf("FAIL deadlock: MeguLitDumpSelfTest export missing\n"); return 1; }
 SetEnvironmentVariableA("MEGULIT_DUMP_SELFTEST", "1");
 int fail = 0;
 for (HANDLE &h : Opened) h = CreateFileA("exists.cfg", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_ALWAYS, 0, NULL);
 HANDLE holder = CreateThread(NULL, 0, HoldGate, NULL, 0, NULL);
 Sleep(200); // the holder now sits on Gate for 4 s
 DWORD t0 = GetTickCount();
 HANDLE closer = CreateThread(NULL, 0, OpenClose, NULL, 0, NULL);
 if (WaitForSingleObject(closer, 2000) != WAIT_OBJECT_0) { printf("FAIL deadlock: CloseHandle waited for the core lock held by another thread\n"); fail++; }
 HANDLE hooker = CreateThread(NULL, 0, HookNow, NULL, 0, NULL);
 if (WaitForSingleObject(hooker, 2500) != WAIT_OBJECT_0) { printf("FAIL deadlock: hooking from a game thread hung while another thread held the core lock\n"); fail++; }
 else { DWORD code = 1; GetExitCodeThread(hooker, &code); if (code != 0) { printf("FAIL deadlock: DumpHook from a game thread did not work (%ld)\n", (long)code); fail++; } }
 if (!fail && GetTickCount() - t0 > 3500) { printf("FAIL deadlock: finished only after the lock was released\n"); fail++; }
 WaitForSingleObject(holder, 10000);
 CloseHandle(holder); CloseHandle(closer); CloseHandle(hooker);
 SetEnvironmentVariableA("MEGULIT_DUMP_SELFTEST", NULL);
 return fail;
}
