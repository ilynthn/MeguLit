// AudioMore module case (modules/AudioMore.cpp). The stand-in game:
//  - plays one clip through XAudio2 2.7 (the real DirectX SDK runtime, if registered; skipped otherwise). Nothing is
//    heard: samples are -1/0/+1 and the mastering and source voices are at volume 0;
//  - plays a whole buffer and a two-buffer queue through OpenAL, a cue by name and one by id through CRI, and two Wwise
//    events, all through stand-in DLLs (selftest\fakedll, built by run.ps1) that have no device at all.
// Then voice\events.jsonl must hold one line per sound, with the exact PCM in the .wav for XAudio2/OpenAL and the
// acb|cue or event name for CRI/Wwise (Wwise on x64 only).
#include "../fakegame.h"
#include <objbase.h>
#pragma comment(lib, "ole32.lib")

namespace audiomore_case {
std::string Samples(int count, int seed) {
 std::string r(count * 2, '\0');
 for (int i = 0; i < count; i++) { short v = (short)(((i * seed + seed) % 3) - 1); memcpy(&r[i * 2], &v, 2); }
 return r;
}
std::string Slurp(const std::string &path) {
 HANDLE h = CreateFileA(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
 if (h == INVALID_HANDLE_VALUE) return "";
 DWORD n = GetFileSize(h, NULL), got = 0; std::string r(n, '\0');
 ReadFile(h, &r[0], n, &got, NULL); CloseHandle(h); r.resize(got); return r;
}
std::string Field(const std::string &line, const char *key) {
 std::string k = std::string("\"") + key + "\":";
 size_t p = line.find(k); if (p == std::string::npos) return "";
 p += k.size();
 if (line[p] == '"') { size_t e = line.find('"', p + 1); return line.substr(p + 1, e - p - 1); }
 size_t e = line.find_first_of(",}", p); return line.substr(p, e - p);
}
std::vector<std::string> Lines(const std::string &text, const char *api) {
 std::vector<std::string> r; size_t at = 0;
 while (at < text.size()) {
  size_t e = text.find('\n', at); if (e == std::string::npos) e = text.size();
  std::string line = text.substr(at, e - at); at = e + 1;
  if (Field(line, "api") == api) r.push_back(line);
 }
 return r;
}
bool HasWav(const std::string &voice, const std::vector<std::string> &lines, const std::string &pcm) {
 for (auto &l : lines) { std::string w = Slurp(voice + Field(l, "file")); if (w.size() == 44 + pcm.size() && !w.compare(44, std::string::npos, pcm) && Field(l, "start") != "0") return true; }
 return false;
}
bool HasName(const std::vector<std::string> &lines, const char *name) {
 for (auto &l : lines) if (Field(l, "name") == name) return true;
 return false;
}

// XAudio2 2.7 through raw vtables (no DirectX SDK headers needed). False if the runtime is not registered.
bool XAudio27(const std::string &pcm) {
 const GUID cls = {0x5a508685, 0xa254, 0x4fba, {0x9b, 0x82, 0x9a, 0x24, 0xb0, 0x03, 0x06, 0xaf}};
 const GUID iid = {0x8bcf1f58, 0x9fe7, 0x4583, {0x8a, 0xc6, 0xe2, 0xad, 0xc4, 0x65, 0xc8, 0xbb}};
 void *x = NULL;
 if (FAILED(CoCreateInstance(cls, NULL, CLSCTX_INPROC_SERVER, iid, &x)) || !x) { printf("SKIP audiomore xaudio2_7: not registered\n"); return false; }
 void **vt = *(void ***)x;
 typedef HRESULT(WINAPI *InitFn)(void *, UINT32, UINT32);
 typedef HRESULT(WINAPI *MasterFn)(void *, void **, UINT32, UINT32, UINT32, UINT32, const void *);
 typedef HRESULT(WINAPI *SourceFn)(void *, void **, const WAVEFORMATEX *, UINT32, float, void *, const void *, const void *);
 typedef ULONG(WINAPI *ReleaseFn)(void *);
 void *master = NULL, *voice = NULL;
 bool ok = SUCCEEDED(((InitFn)vt[5])(x, 0, 0xFFFFFFFF)) && SUCCEEDED(((MasterFn)vt[10])(x, &master, 0, 0, 0, 0, NULL)) && master;
 if (!ok) { ((ReleaseFn)vt[2])(x); printf("SKIP audiomore xaudio2_7: no device\n"); return false; }
 typedef HRESULT(WINAPI *VolFn)(void *, float, UINT32);
 typedef void(WINAPI *DestroyFn)(void *);
 ((VolFn)(*(void ***)master)[12])(master, 0.0f, 0);
 WAVEFORMATEX w = {WAVE_FORMAT_PCM, 1, 22050, 44100, 2, 16, 0};
 if (FAILED(((SourceFn)vt[8])(x, &voice, &w, 0, 2.0f, NULL, NULL, NULL)) || !voice) { ((DestroyFn)(*(void ***)master)[18])(master); ((ReleaseFn)vt[2])(x); printf("SKIP audiomore xaudio2_7: no voice\n"); return false; }
 void **vv = *(void ***)voice;
 ((VolFn)vv[12])(voice, 0.0f, 0);
 struct { UINT32 Flags, AudioBytes; const BYTE *p; UINT32 a, b, c, d, e; void *ctx; } buf = {0x40, (UINT32)pcm.size(), (const BYTE *)pcm.data()};
 typedef HRESULT(WINAPI *SubmitFn)(void *, const void *, const void *);
 typedef HRESULT(WINAPI *StartFn)(void *, UINT32, UINT32);
 ((SubmitFn)vv[21])(voice, &buf, NULL); ((StartFn)vv[19])(voice, 0, 0); Sleep(300); ((StartFn)vv[20])(voice, 0, 0);
 ((DestroyFn)vv[18])(voice); ((DestroyFn)(*(void ***)master)[18])(master); ((ReleaseFn)vt[2])(x);
 return true;
}
}

int CaseAudioMore(FakeGame &g) {
 using namespace audiomore_case;
 CoInitializeEx(NULL, COINIT_MULTITHREADED);
 std::string x27 = Samples(4400, 5), whole = Samples(3300, 7), q1 = Samples(1500, 4), q2 = Samples(1700, 8);
 bool ranX = XAudio27(x27);

 HMODULE al = LoadLibraryA("OpenAL32.dll"), cri = LoadLibraryA("cri_ware_unity.dll"), ak = LoadLibraryA("AkSoundEngine.dll");
 if (!al || !cri || !ak) { printf("FAIL audiomore: stand-in DLLs missing (run.ps1 builds selftest\\fakedll)\n"); return 1; }
 typedef void(__cdecl *BufferData)(unsigned, int, const void *, int, int);
 typedef void(__cdecl *Sourcei)(unsigned, int, int);
 typedef void(__cdecl *Source)(unsigned);
 typedef void(__cdecl *Queue)(unsigned, int, const unsigned *);
 BufferData data = (BufferData)GetProcAddress(al, "alBufferData");
 Sourcei sourcei = (Sourcei)GetProcAddress(al, "alSourcei");
 Source play = (Source)GetProcAddress(al, "alSourcePlay"), stop = (Source)GetProcAddress(al, "alSourceStop");
 Queue queue = (Queue)GetProcAddress(al, "alSourceQueueBuffers");
 data(1, 0x1101, whole.data(), (int)whole.size(), 22050);   // AL_FORMAT_MONO16
 sourcei(10, 0x1009, 1); play(10);                          // AL_BUFFER: one whole buffer
 data(2, 0x1101, q1.data(), (int)q1.size(), 22050); data(3, 0x1101, q2.data(), (int)q2.size(), 22050);
 unsigned two[2] = {2, 3}; queue(11, 2, two); play(11); Sleep(200); stop(11);

 typedef void *(__cdecl *LoadAcb)(void *, const char *, void *, const char *, void *, int);
 typedef void(__cdecl *CueName)(void *, void *, const char *);
 typedef void(__cdecl *CueId)(void *, void *, int);
 typedef unsigned(__cdecl *StartFn)(void *);
 void *acb = ((LoadAcb)GetProcAddress(cri, "criAtomExAcb_LoadAcbFile"))(NULL, "voice/ch01.acb", NULL, "voice/ch01.awb", NULL, 0);
 int player = 0;
 ((CueName)GetProcAddress(cri, "criAtomExPlayer_SetCueName"))(&player, acb, "line_0001");
 ((StartFn)GetProcAddress(cri, "criAtomExPlayer_Start"))(&player);
 ((CueId)GetProcAddress(cri, "criAtomExPlayer_SetCueId"))(&player, acb, 42);
 ((StartFn)GetProcAddress(cri, "criAtomExPlayer_Start"))(&player);

 typedef unsigned(__cdecl *PostName)(const char *, unsigned long long, unsigned, void *, void *);
 typedef unsigned(__cdecl *PostId)(unsigned, unsigned long long);
 ((PostName)GetProcAddress(ak, "CSharp_PostEvent__SWIG_0"))("Play_VO_0001", 5, 0, NULL, NULL);
 ((PostId)GetProcAddress(ak, "CSharp_PostEvent__SWIG_3"))(12345, 5);
 Sleep(2000);

 std::string voice = g.dir + "voice\\", events = Slurp(voice + "events.jsonl");
 int fail = 0;
 if (ranX && !HasWav(voice, Lines(events, "xaudio2_7"), x27)) { printf("FAIL audiomore: XAudio2 2.7 clip not saved exactly\n"); fail++; }
 auto oal = Lines(events, "openal");
 if (!HasWav(voice, oal, whole)) { printf("FAIL audiomore: OpenAL whole-buffer clip not saved exactly\n"); fail++; }
 if (!HasWav(voice, oal, q1 + q2)) { printf("FAIL audiomore: OpenAL queued clip not saved exactly\n"); fail++; }
 auto cue = Lines(events, "cri");
 if (!HasName(cue, "voice/ch01.acb|line_0001") || !HasName(cue, "voice/ch01.acb|id:42")) { printf("FAIL audiomore: CRI cues not recorded (%zu lines)\n", cue.size()); fail++; }
 auto ww = Lines(events, "wwise");
 if (sizeof(void *) == 8 && (!HasName(ww, "Play_VO_0001") || !HasName(ww, "id:12345"))) { printf("FAIL audiomore: Wwise events not recorded (%zu lines)\n", ww.size()); fail++; }
 if (sizeof(void *) == 4 && !ww.empty()) { printf("FAIL audiomore: Wwise hooked on x86\n"); fail++; }
 printf("audiomore: xaudio2_7 %s, openal %zu, cri %zu, wwise %zu lines, %d failures\n", ranX ? "ran" : "skipped", oal.size(), cue.size(), ww.size(), fail);
 return fail;
}
