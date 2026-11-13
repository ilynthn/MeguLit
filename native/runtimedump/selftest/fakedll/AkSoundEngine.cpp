// Stand-in AkSoundEngine.dll (Unity Wwise SWIG layer) for the AudioMore case: two PostEvent overloads, by name and by id.
#define EXPORT extern "C" __declspec(dllexport)
volatile int Touched[4];
EXPORT unsigned __cdecl CSharp_PostEvent__SWIG_0(const char *name, unsigned long long obj, unsigned flags, void *cb, void *cookie) { Touched[0] += (name != 0) + (int)obj + (int)flags + (cb != 0) + (cookie != 0); return 1; }
EXPORT unsigned __cdecl CSharp_PostEvent__SWIG_3(unsigned id, unsigned long long obj) { Touched[1] += (int)id + (int)obj; return 2; }
