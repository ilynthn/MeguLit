// Stand-in OpenAL32.dll for the AudioMore case: same export names and cdecl signatures, no device, no sound.
// Each body touches its own global so the linker never folds two exports into one address (MinHook needs distinct ones).
#define EXPORT extern "C" __declspec(dllexport)
volatile int Touched[8];
EXPORT void __cdecl alBufferData(unsigned b, int f, const void *d, int n, int r) { Touched[0] += (int)b + f + n + r + (d != 0); }
EXPORT void __cdecl alSourcei(unsigned s, int p, int v) { Touched[1] += (int)s + p + v; }
EXPORT void __cdecl alSourcePlay(unsigned s) { Touched[2] += (int)s; }
EXPORT void __cdecl alSourcePlayv(int n, const unsigned *s) { Touched[3] += n + (s != 0); }
EXPORT void __cdecl alSourceStop(unsigned s) { Touched[4] += (int)s; }
EXPORT void __cdecl alSourceQueueBuffers(unsigned s, int n, const unsigned *b) { Touched[5] += (int)s + n + (b != 0); }
EXPORT void __cdecl alDeleteBuffers(int n, const unsigned *b) { Touched[6] += n + (b != 0); }
