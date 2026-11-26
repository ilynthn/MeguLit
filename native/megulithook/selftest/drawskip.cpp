// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test for ..\MeguLitDrawSkip.h outside a game: LunaHook's hook_context and Msg are stubbed; the "engine" is the KiriKiri
// layer DrawText shape of KiriKiri.cpp (eax = the layer, the ttstr text at stack[9], an empty ttstr draws nothing).
// Replays オルフレール: the message layer draws its lines at y 2 / 0x68 / 0x90 (one hook stream per y), the name box and a
// menu on other layers. Build and run: run.cmd (prints PASS/FAIL per case, exit code = failures).
#include <windows.h>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <string>
struct hook_context
{
#ifndef _WIN64
  uintptr_t _eflags, edi, esi, ebp, esp, ebx, edx, ecx, eax;
#else
  uintptr_t r15, r14, r13, r12, r11, r10, r9, r8, rdi, rsi, rbp, rsp, rdx, rcx, rbx, rax;
#endif
  uintptr_t eflags;
  union
  {
    uintptr_t stack[1];
    uintptr_t retaddr;
  };
};
static std::string LastLog;
static int Logs = 0;
namespace Msg
{
  void Log(const char *f, ...)
  {
    char b[512];
    va_list a;
    va_start(a, f);
    vsnprintf(b, sizeof b, f, a);
    va_end(a);
    LastLog = b;
    Logs++;
  }
}
#include "../MeguLitDrawSkip.h"

struct VariantString
{
  int RefCount;
  wchar_t *LongString;
  wchar_t ShortString[22];
  int Length;
  uint32_t HeapFlag, Hint;
};
struct Ttstr
{
  VariantString *Ptr;
};
static Ttstr EmptyText = {};
#ifndef _WIN64
static uintptr_t Self(hook_context *c) { return c->eax; }
#else
static uintptr_t Self(hook_context *c) { return c->rax; }
#endif
static int Empty(hook_context *, uintptr_t *stack)
{
  auto text = (Ttstr *)stack[9];
  if (!text || text == &EmptyText || !text->Ptr || text->Ptr->Length <= 0 || text->Ptr->Length > 4096)
    return 0;
  int n = text->Ptr->Length;
  stack[9] = (uintptr_t)&EmptyText;
  return n;
}

static int failures = 0;
static void Check(bool ok, const char *name)
{
  printf("%s %s\n", ok ? "PASS" : "FAIL", name);
  if (!ok)
    failures++;
}

// An inline hook's frame: the context sits on the stack right below the return address and the arguments.
struct Frame
{
  hook_context head;
  uintptr_t args[16];
};
static const uintptr_t DrawAt = 0x538f14, MessageLayer = 0x1000, NameLayer = 0x2000, MenuLayer = 0x3000;
static VariantString Char1 = {0, nullptr, L"私", 1}, Line = {0, nullptr, L"昇り始めた陽の光", 8};
static Ttstr TextChar = {&Char1}, TextLine = {&Line};

// One call of the hooked DrawText; true when the game is left with an empty text.
static bool Call(uintptr_t layer, Ttstr *text, bool on, uintptr_t address = DrawAt)
{
  static Frame f;
  memset(&f, 0, sizeof f);
#ifndef _WIN64
  f.head.eax = layer;
  f.head.esp = (uintptr_t)&f.head.eflags;
#else
  f.head.rax = layer;
  f.head.rsp = (uintptr_t)&f.head.eflags;
#endif
  f.head.stack[9] = (uintptr_t)text;
  MeguLitDrawSkip::Run(address, &f.head, on);
  return f.head.stack[9] == (uintptr_t)&EmptyText;
}

int main()
{
  Check(!Call(MessageLayer, &TextChar, true), "no registered site: a switched-on stream draws as before");
  MeguLitDrawSkip::Register(DrawAt, Self, Empty);
  Check(LastLog.find("MeguLit_DRAWSKIP ready addr=538f14") == 0, "the registered draw call is announced to the host");
  int logs = Logs;
  MeguLitDrawSkip::Register(DrawAt, Self, Empty);
  Check(Logs == logs && MeguLitDrawSkip::Count == 1, "a second registration of the same address changes nothing");

  Check(!Call(MessageLayer, &TextChar, false), "nothing switched on yet: the message layer draws");
  Check(Call(MessageLayer, &TextChar, true), "the switched-on line (y 0x90) draws nothing");
  Check(LastLog.find("MeguLit_DRAWSKIP hit n=1 ") == 0, "the first character not drawn is reported at once");
  Check(Call(MessageLayer, &TextLine, false), "another line of the locked message layer (y 2, not switched on) draws nothing");
  Check(MeguLitDrawSkip::Skipped == 9, "every character not drawn is counted (1 + 8)");
  Check(!Call(NameLayer, &TextChar, false), "the name box (another layer) still draws");
  Check(!Call(MenuLayer, &TextLine, false), "a menu or choice layer still draws");
  Check(!Call(MessageLayer, &TextChar, false, DrawAt + 0x10), "a call at another hook address is never touched");
  Call(MessageLayer, &EmptyText, true);
  Check(MeguLitDrawSkip::Skipped == 9, "an empty text is left alone and not counted");

  DWORD now = GetTickCount();
  Check(MeguLitDrawSkip::Decide(MessageLayer, false, now + 1000), "the lock holds within LockFor of the last switched-on call");
  Check(!MeguLitDrawSkip::Decide(MessageLayer, false, now + MeguLitDrawSkip::LockFor + 2000), "the lock lapses LockFor after the host stopped switching the stream on");
  Check(!MeguLitDrawSkip::Decide(0, false, now), "a call without a drawing object is never locked");

  {
    static Frame copy;
    static uintptr_t real[16];
    memset(&copy, 0, sizeof copy);
#ifndef _WIN64
    copy.head.esp = (uintptr_t)real;
#else
    copy.head.rsp = (uintptr_t)real;
#endif
    Check(MeguLitDrawSkip::RealStack(&copy.head) == real, "a breakpoint context (a copy) works on the real stack");
    Frame f;
#ifndef _WIN64
    f.head.esp = (uintptr_t)&f.head.eflags;
#else
    f.head.rsp = (uintptr_t)&f.head.eflags;
#endif
    Check(MeguLitDrawSkip::RealStack(&f.head) == &f.head.retaddr, "an inline hook context is the stack itself");
  }
  printf("%d failure(s)\n", failures);
  return failures;
}
