// Stand-in cri_ware_unity.dll for the AudioMore case: the CRI Atom exports AudioMore watches, cdecl, doing nothing.
#define EXPORT extern "C" __declspec(dllexport)
volatile int Touched[8]; int Acb;
EXPORT void *__cdecl criAtomExAcb_LoadAcbFile(void *b, const char *acb, void *ab, const char *awb, void *w, int n) { Touched[0] += n + (b != 0) + (acb != 0) + (ab != 0) + (awb != 0) + (w != 0); return &Acb; }
EXPORT void __cdecl criAtomExPlayer_SetCueName(void *p, void *a, const char *n) { Touched[1] += (p != 0) + (a != 0) + (n != 0); }
EXPORT void __cdecl criAtomExPlayer_SetCueId(void *p, void *a, int id) { Touched[2] += id + (p != 0) + (a != 0); }
EXPORT void __cdecl criAtomExPlayer_SetCueIndex(void *p, void *a, int i) { Touched[3] += i + (p != 0) + (a != 0); }
EXPORT void __cdecl criAtomExPlayer_SetFile(void *p, void *b, const char *f) { Touched[4] += (p != 0) + (b != 0) + (f != 0); }
EXPORT void __cdecl criAtomExPlayer_SetWaveId(void *p, void *a, int id) { Touched[5] += id + (p != 0) + (a != 0); }
EXPORT unsigned __cdecl criAtomExPlayer_Start(void *p) { Touched[6] += (p != 0); return 7; }
