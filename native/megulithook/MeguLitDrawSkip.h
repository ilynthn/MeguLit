// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLit "source no-draw" (2026-11-26, KiriKiri without KAG3: オルフレール's own message system calls Layer.drawText once per
// character; the stream MeguLit reads cannot write back and the game draws its glyphs itself, so neither the GDI hide nor the
// GPU hide layer could keep the original off the screen).
// An engine hook on the engine's own text draw call registers here how to find the drawing object (the layer) and how to
// hand the call an empty text. When the host switches such a stream on (check_embed_able), that call draws nothing and its
// drawing object becomes a locked dialogue surface: the other lines of the same message layer (other split values the host
// has not switched on yet) draw nothing either while the lock is fresh (LockFor after the last switched-on call). Menus,
// buttons, the name entry and choices are drawn on other objects and stay. Engine-agnostic: the engine file decides the
// argument layout; nothing happens for a hook that did not register, or while the host switches nothing on.
// "MeguLit_DRAWSKIP ready addr=" tells the host which hook address can skip; "MeguLit_DRAWSKIP hit n=" is the running count of
// characters not drawn (first hit at once, then at most every ReportGap ms).
#pragma once
#include <atomic>
namespace MeguLitDrawSkip
{
  using SelfFn = uintptr_t (*)(hook_context *context);
  using EmptyFn = int (*)(hook_context *context, uintptr_t *stack);
  struct Site
  {
    uintptr_t address;
    SelfFn self;
    EmptyFn empty;
  };
  constexpr int MaxSites = 4, MaxLocked = 4;
  constexpr DWORD LockFor = 15000, ReportGap = 1000;
  inline Site Sites[MaxSites] = {};
  inline std::atomic<int> Count = 0;
  inline SRWLOCK Lock = SRWLOCK_INIT;
  inline uintptr_t Locked[MaxLocked] = {};
  inline int LockedNext = 0;
  inline DWORD LastOn = 0, LastReport = 0;
  inline long Skipped = 0, Reported = 0;

  inline void Register(uintptr_t address, SelfFn self, EmptyFn empty)
  {
    if (!address || !self || !empty)
      return;
    AcquireSRWLockExclusive(&Lock);
    int n = Count.load();
    bool known = false;
    for (int i = 0; i < n; i++)
      known |= Sites[i].address == address;
    if (!known && n < MaxSites)
    {
      Sites[n] = Site{address, self, empty};
      Count.store(n + 1);
    }
    ReleaseSRWLockExclusive(&Lock);
    if (!known && n < MaxSites)
      Msg::Log("MeguLit_DRAWSKIP ready addr=%llx", (unsigned long long)address);
  }

  // The real stack of the hooked call: an inline hook's context lies on it (its saved esp is the slot right below the return
  // address); a breakpoint hook's context is a copy, whose esp is the real stack pointer at the call.
  inline uintptr_t *RealStack(hook_context *context)
  {
#ifndef _WIN64
    if (context->esp + sizeof(uintptr_t) == (uintptr_t)&context->retaddr || context->esp == (uintptr_t)&context->retaddr - sizeof(uintptr_t))
      return &context->retaddr;
    return (uintptr_t *)context->esp;
#else
    if (context->rsp == (uintptr_t)&context->retaddr || context->rsp + sizeof(uintptr_t) == (uintptr_t)&context->retaddr)
      return &context->retaddr;
    return (uintptr_t *)context->rsp;
#endif
  }

  // Decision only (no game memory touched): whether a call on `self` is to draw nothing. `on` = the host switched this call's
  // stream on. Exposed for the self-test.
  inline bool Decide(uintptr_t self, bool on, DWORD now)
  {
    bool skip = false;
    AcquireSRWLockExclusive(&Lock);
    if (on)
    {
      LastOn = now;
      skip = true;
      bool known = false;
      for (auto l : Locked)
        known |= self && l == self;
      if (self && !known)
      {
        Locked[LockedNext] = self;
        LockedNext = (LockedNext + 1) % MaxLocked;
      }
    }
    else if (self && LastOn && now - LastOn < LockFor)
      for (auto l : Locked)
        skip |= l == self;
    ReleaseSRWLockExclusive(&Lock);
    return skip;
  }

  // Count `n` characters not drawn; true when the host is to be told now.
  inline bool Count_(int n, DWORD now, long *total)
  {
    bool report = false;
    AcquireSRWLockExclusive(&Lock);
    Skipped += n;
    *total = Skipped;
    if (Reported == 0 || (Skipped != Reported && now - LastReport >= ReportGap))
    {
      Reported = Skipped;
      LastReport = now;
      report = true;
    }
    ReleaseSRWLockExclusive(&Lock);
    return report;
  }

  // Called by TextHook::Send for every hook that is not EMBED_ABLE, after the text went out.
  inline void Run(uintptr_t address, hook_context *context, bool on)
  {
    int n = Count.load();
    if (!n)
      return;
    const Site *site = nullptr;
    for (int i = 0; i < n; i++)
      if (Sites[i].address == address)
        site = &Sites[i];
    if (!site)
      return;
    uintptr_t self = 0;
    __try
    {
      self = site->self(context);
    }
    __except (EXCEPTION_EXECUTE_HANDLER)
    {
      self = 0;
    }
    DWORD now = GetTickCount();
    if (!Decide(self, on, now))
      return;
    int emptied = 0;
    __try
    {
      emptied = site->empty(context, RealStack(context));
    }
    __except (EXCEPTION_EXECUTE_HANDLER)
    {
      emptied = 0;
    }
    long total = 0;
    if (emptied > 0 && Count_(emptied, now, &total))
      Msg::Log("MeguLit_DRAWSKIP hit n=%ld self=%llx on=%d", total, (unsigned long long)self, (int)on);
  }
}
