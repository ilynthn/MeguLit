// Voice module case (modules/Voice.cpp): a short silent "scenario" in the stand-in game. Every line is shown (written to
// voice/lines.jsonl the way MeguLit records hooked lines) and its voice reaches the game one of the ways engines do it:
//  - file reads: a loose voice\NNN.ogg read whole, an encrypted archive entry decrypted in place (Pack::ReadInPlace);
//  - audio APIs: DirectSound static buffer, DirectSound streaming ring buffer (KiriKiri style), waveOut, XAudio2;
//  - both: the voice file is read, then its PCM is played (the module should keep the file);
// with the start jittered around the line, a click sound on every advance, looping music, unvoiced lines, one line
// skipped mid-voice and one backlog replay. All output is silent (volume at minimum).
// Each voice carries its id: sample 1 of the PCM, int16 at 0x30 of a voice file. The case checks every voice was saved;
// validation/voice-harvest.test.cjs then checks line -> voice from this output (voice-truth.json in the game folder).
#include "../fakegame.h"
#include <mmsystem.h>
#include <dsound.h>
#include <xaudio2.h>
#include <math.h>
#pragma comment(lib, "dsound.lib")
#pragma comment(lib, "winmm.lib")
#pragma comment(lib, "xaudio2.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")

namespace {
const DWORD Rate = 22050;
typedef std::vector<short> Clip;
Clip Tone(int id, DWORD ms, double hz) {
 Clip c(Rate * ms / 1000);
 for (size_t i = 0; i < c.size(); i++) c[i] = (short)((short)(9000 * sin(6.283185 * hz * i / Rate)) | 0x200);
 c[0] = 0x7000; c[1] = (short)id; return c;
}
// A stand-in Ogg Vorbis file with real page structure: an identification page (rate 22050, id in the nominal bitrate
// field at 0x30), data pages of filler, and an end-of-stream page whose granule gives `ms`. About `size` bytes.
std::string OggPage(unsigned char type, unsigned long long granule, const std::string &body) {
 std::string p = "OggS"; p += '\0'; p += (char)type; p.append((const char *)&granule, 8); p.append(12, '\0');
 std::string lace; size_t left = body.size(); do { unsigned char k = (unsigned char)(left > 255 ? 255 : left); lace += (char)k; left -= k; if (k < 255) break; } while (true);
 p += (char)lace.size(); p += lace; return p + body;
}
std::string FakeOgg(int id, DWORD size, DWORD ms = 1000) {
 std::string idp = "\x01vorbis"; idp.append(4, '\0'); idp += (char)1; DWORD rate = 22050, nominal = (DWORD)(short)id; idp.append((const char *)&rate, 4);
 idp.append(4, '\0'); idp.append((const char *)&nominal, 4); idp.append(4, '\0'); idp += (char)0xB8; idp += (char)1;
 std::string f = OggPage(2, 0, idp);
 for (int k = 0; f.size() + 300 < size; k++) { std::string body(size - f.size() - 300 > 4000 ? 4000 : size - f.size() - 300, '\0'); for (size_t i = 0; i < body.size(); i++) body[i] = (char)((i * 7 + id + k) & 0xFF); f += OggPage(0, (unsigned long long)rate * ms / 1000 / 2, body); }
 f += OggPage(4, (unsigned long long)rate * ms / 1000, std::string(200, (char)id));
 return f;
}
ULONGLONG NowMs() { FILETIME f; GetSystemTimeAsFileTime(&f); ULARGE_INTEGER u; u.LowPart = f.dwLowDateTime; u.HighPart = f.dwHighDateTime; return u.QuadPart / 10000 - 11644473600000ULL; }
void AppendFile(const std::string &path, const std::string &s) {
 HANDLE h = CreateFileA(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS, 0, NULL);
 DWORD w; WriteFile(h, s.data(), (DWORD)s.size(), &w, NULL); CloseHandle(h);
}

IDirectSound8 *Ds; IXAudio2 *Xa; IXAudio2MasteringVoice *Master;
WAVEFORMATEX Wf = { WAVE_FORMAT_PCM, 1, Rate, Rate * 2, 2, 16, 0 };
IDirectSoundBuffer *DsBuffer(DWORD bytes) {
 DSBUFFERDESC d = { sizeof d, DSBCAPS_CTRLVOLUME | DSBCAPS_GLOBALFOCUS, bytes, 0, &Wf };
 IDirectSoundBuffer *b = NULL; if (FAILED(Ds->CreateSoundBuffer(&d, &b, NULL))) return NULL;
 b->SetVolume(DSBVOLUME_MIN); return b;
}
void Fill(IDirectSoundBuffer *b, DWORD at, const void *p, DWORD n) {
 void *a1, *a2; DWORD n1, n2;
 if (FAILED(b->Lock(at, n, &a1, &n1, &a2, &n2, 0))) return;
 memcpy(a1, p, n1); if (a2) memcpy(a2, (const char *)p + n1, n2);
 b->Unlock(a1, n1, a2, n2);
}
struct Streamer {
 IDirectSoundBuffer *b; DWORD ring, pos; std::vector<short> queue; size_t at; bool on; int silence;
 void Begin(const Clip &c) { queue = c; at = 0; silence = 0; pos = 0; b->SetCurrentPosition(0); std::vector<short> z(ring / 2); Fill(b, 0, z.data(), ring); Pump(); b->Play(0, 0, DSBPLAY_LOOPING); on = true; }
 void Pump() {
  DWORD chunk = Rate / 10 * 2; std::vector<short> buf(chunk / 2);
  size_t left = queue.size() - at, take = left < buf.size() ? left : buf.size();
  if (take) memcpy(buf.data(), &queue[at], take * 2); at += take; if (!take) silence++;
  Fill(b, pos, buf.data(), chunk); pos = (pos + chunk) % ring;
 }
 void Tick() { if (!on) return; Pump(); if (silence > 12) { b->Stop(); on = false; } }
 void Cut() { if (on) { b->Stop(); on = false; } }
};
struct WaveOut {
 HWAVEOUT h; WAVEHDR hdr; std::vector<short> data;
 bool Open() { if (waveOutOpen(&h, WAVE_MAPPER, &Wf, 0, 0, CALLBACK_NULL) != MMSYSERR_NOERROR) { h = NULL; return false; } waveOutSetVolume(h, 0); memset(&hdr, 0, sizeof hdr); return true; }
 void Play(const Clip &c) { // a device per sound, as many engines do
  if (h) { waveOutReset(h); if (hdr.dwFlags & WHDR_PREPARED) waveOutUnprepareHeader(h, &hdr, sizeof hdr); waveOutClose(h); h = NULL; }
  if (!Open()) return;
  data = c; memset(&hdr, 0, sizeof hdr); hdr.lpData = (LPSTR)data.data(); hdr.dwBufferLength = (DWORD)data.size() * 2;
  waveOutPrepareHeader(h, &hdr, sizeof hdr); waveOutWrite(h, &hdr, sizeof hdr);
 }
};
IXAudio2SourceVoice *XPlay(const Clip &clip) {
 IXAudio2SourceVoice *v = NULL; if (FAILED(Xa->CreateSourceVoice(&v, &Wf))) return NULL;
 v->SetVolume(0);
 const Clip &c = *new Clip(clip); // XAudio2 reads the samples while it plays: kept to the end of the run
 XAUDIO2_BUFFER b = {}; b.Flags = XAUDIO2_END_OF_STREAM; b.AudioBytes = (UINT32)c.size() * 2; b.pAudioData = (const BYTE *)c.data();
 v->SubmitSourceBuffer(&b); v->Start(0); return v;
}
std::string Utf8(const wchar_t *s) { int n = WideCharToMultiByte(CP_UTF8, 0, s, -1, NULL, 0, NULL, NULL); std::string r(n, 0); WideCharToMultiByte(CP_UTF8, 0, s, -1, &r[0], n, NULL, NULL); r.resize(n - 1); return r; }
int Found(const std::string &voiceDir, int id) { // 1 if a saved clip or file carries this id
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((voiceDir + "*.*").c_str(), &f); if (h == INVALID_HANDLE_VALUE) return 0;
 int hit = 0;
 do {
  DWORD n = 0; char *b = ReadAll(voiceDir + f.cFileName, &n); if (!b) continue;
  if (n > 0x40 && !memcmp(b, "OggS", 4) && *(short *)(b + 0x30) == id) hit = 1;
  if (n > 48 && !memcmp(b, "RIFF", 4) && *(short *)(b + 44 + 2) == id) hit = 1;
  free(b);
 } while (!hit && FindNextFileA(h, &f));
 FindClose(h); return hit;
}
}

// A crash in the game is reported with the faulting module and offset before the process dies (first chance, so access
// violations the DLL itself catches show up too; only the last line before a crash matters).
LONG CALLBACK Report(EXCEPTION_POINTERS *e) {
 if (e->ExceptionRecord->ExceptionCode != EXCEPTION_ACCESS_VIOLATION) return EXCEPTION_CONTINUE_SEARCH;
 HMODULE m = NULL; char name[MAX_PATH] = "?"; void *at = e->ExceptionRecord->ExceptionAddress;
 if (GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCSTR)at, &m)) GetModuleFileNameA(m, name, MAX_PATH);
 fprintf(stderr, "access violation at %s+0x%Ix (reading %p)\n", strrchr(name, '\\') ? strrchr(name, '\\') + 1 : name, (ULONG_PTR)at - (ULONG_PTR)m, (void *)e->ExceptionRecord->ExceptionInformation[1]);
 fflush(stderr);
 return EXCEPTION_CONTINUE_SEARCH;
}
int CaseVoice(FakeGame &g) {
 setvbuf(stdout, NULL, _IONBF, 0);
 AddVectoredExceptionHandler(1, Report);
 CoInitializeEx(NULL, COINIT_MULTITHREADED);
 std::string vdir = g.dir + "voice\\";
 bool haveDs = SUCCEEDED(DirectSoundCreate8(NULL, &Ds, NULL)) && SUCCEEDED(Ds->SetCooperativeLevel(GetDesktopWindow(), DSSCL_PRIORITY));
 bool haveXa = SUCCEEDED(XAudio2Create(&Xa, 0, XAUDIO2_DEFAULT_PROCESSOR)) && SUCCEEDED(Xa->CreateMasteringVoice(&Master));
 WaveOut wo = {}; bool haveWo = wo.Open(); if (haveWo) { waveOutClose(wo.h); wo.h = NULL; }
 // The module hooks audio libraries it finds loaded; give it a couple of ticks to see these.
 for (int i = 0; i < 40; i++) { Sleep(100); DWORD n = 0; char *b = ReadAll(vdir + "voice.log", &n); bool ok = b && (!haveDs || strstr(std::string(b, n).c_str(), "dsound")); free(b); if (ok) break; }

 // Voice files: loose voice\NNN.ogg, and an encrypted archive.
 CreateDirectoryA("voice", NULL);
 std::vector<std::pair<std::string, std::string>> entries;
 for (int i = 0; i < 6; i++) { char n[32]; sprintf_s(n, "v%03d.ogg", 300 + i); entries.push_back({ n, FakeOgg(300 + i, 6000 + i * 911) }); }
 Pack pak; pak.Write("voice.fpk", entries);
 for (int i = 0; i < 6; i++) { char n[32]; sprintf_s(n, "voice\\v%03d.ogg", 400 + i); Put(n, FakeOgg(400 + i, 5000 + i * 733)); }

 Clip click = Tone(-2, 450, 1800);
 IDirectSoundBuffer *se = haveDs ? DsBuffer((DWORD)click.size() * 2) : NULL; if (se) Fill(se, 0, click.data(), (DWORD)click.size() * 2);
 Streamer music = { haveDs ? DsBuffer(Rate * 2) : NULL, Rate * 2, 0, {}, 0, false, 0 };
 Clip bgm = Tone(-3, 60000, 110); if (music.b) music.Begin(bgm);
 Streamer stream = { haveDs ? DsBuffer(Rate * 2) : NULL, Rate * 2, 0, {}, 0, false, 0 };
 IDirectSoundBuffer *staticBuf = haveDs ? DsBuffer(Rate * 2 * 2) : NULL;
 IXAudio2SourceVoice *xv = NULL;

 const char *ways[] = { "file", "dsound-static", "pack", "dsound-stream", "file+dsound", "waveout", "xaudio2" };
 std::string truth = "[", lines = vdir + "lines.jsonl";
 std::vector<int> want;
 int fileAt = 0, packAt = 0, pcmAt = 0; unsigned seed = 11;
 auto rnd = [&]() { seed = seed * 1664525 + 1013904223; return seed >> 8; };
 auto wait = [&](DWORD ms) { for (DWORD t = 0; t < ms; t += 100) { Sleep(100); if (music.b) music.Tick(); if (stream.b) stream.Tick(); } };
 for (int line = 0; line < 20; line++) {
  wchar_t text[128]; swprintf_s(text, L"めぐみん「声のテスト、%d番目の台詞です」", line);
  const char *way = ways[line % 7];
  bool voiced = line % 6 != 5;
  if (!haveDs && strstr(way, "dsound")) way = "file";
  if ((!strcmp(way, "waveout") && !haveWo) || (!strcmp(way, "xaudio2") && !haveXa)) way = "pack";
  if (!strcmp(way, "file") && fileAt >= 6) way = "pack";
  if (!strcmp(way, "pack") && packAt >= 6) way = "dsound-static";
  int id = -1, lead = (int)(rnd() % 600) - 250;
  if (se) { se->SetCurrentPosition(0); se->Play(0, 0, 0); }
  auto show = [&]() { char l[256]; sprintf_s(l, "{\"t\":%llu,\"text\":\"%s\"}\n", NowMs(), Utf8(text).c_str()); AppendFile(lines, l); };
  auto play = [&]() {
   if (!strcmp(way, "file") || !strcmp(way, "file+dsound")) {
    char n[32]; sprintf_s(n, "voice\\v%03d.ogg", 400 + fileAt); id = 400 + fileAt++;
    DWORD k = 0; char *b = ReadAll(n, &k); g.Hold(b);
    if (!strcmp(way, "file+dsound")) { Clip c = Tone(id, 700, 500); Fill(staticBuf, 0, c.data(), (DWORD)c.size() * 2); staticBuf->SetCurrentPosition(0); staticBuf->Play(0, 0, 0); }
   } else if (!strcmp(way, "pack")) {
    char n[32]; sprintf_s(n, "v%03d.ogg", 300 + packAt); id = 300 + packAt++;
    DWORD k = 0; char *b = pak.ReadInPlace(n, &k); g.Hold(b);
   } else {
    id = 100 + pcmAt++; Clip c = Tone(id, 500 + (id * 137) % 700, 300 + id);
    if (!strcmp(way, "dsound-static")) { staticBuf->Stop(); Fill(staticBuf, 0, c.data(), (DWORD)c.size() * 2); staticBuf->SetCurrentPosition(0); staticBuf->Play(0, 0, 0); }
    else if (!strcmp(way, "dsound-stream")) stream.Begin(c);
    else if (!strcmp(way, "waveout")) wo.Play(c);
    else { if (xv) xv->DestroyVoice(); xv = XPlay(c); }
   }
  };
  if (!voiced) show();
  else if (lead < 0) { play(); Sleep(-lead); show(); }
  else { show(); Sleep(lead); play(); }
  char t[300]; sprintf_s(t, "%s{\"text\":\"%s\",\"id\":%d,\"way\":\"%s\",\"skip\":%s}", line ? "," : "", Utf8(text).c_str(), voiced ? id : -1, voiced ? way : "", line == 3 ? "true" : "false");
  truth += t; if (voiced) want.push_back(id);
  if (line == 3) { wait(250); stream.Cut(); wait(400); } // skipped while its (streamed) voice plays
  else wait(1700);
  if (line == 8 && staticBuf) { staticBuf->SetCurrentPosition(0); staticBuf->Play(0, 0, 0); wait(900); } // backlog replay
 }
 if (music.b) music.Cut();
 truth += "]";
 Put(g.game + "\\voice-truth.json", truth);
 wait(2000); // the module writes the last clips
 int fail = 0;
 for (int id : want) if (!Found(vdir, id)) { printf("FAIL voice %d not saved\n", id); fail++; }
 printf("voice case: dsound=%d xaudio2=%d waveout=%d, %d voices\n", haveDs, haveXa, haveWo, (int)want.size());
 return fail;
}

// Regression cases from the voice module review (port-notes/review3-voice.md), one block per item. Runs after CaseVoice
// (which set up DirectSound / XAudio2).
#include <psapi.h>
#pragma comment(lib, "psapi.lib")
namespace {
SIZE_T Private() { PROCESS_MEMORY_COUNTERS_EX m = {}; m.cb = sizeof m; GetProcessMemoryInfo(GetCurrentProcess(), (PROCESS_MEMORY_COUNTERS *)&m, sizeof m); return m.PrivateUsage; }
std::string Events(const std::string &vdir) { DWORD n = 0; char *b = ReadAll(vdir + "events.jsonl", &n); std::string s = b ? std::string(b, n) : ""; free(b); return s; }
std::string SavedFile(const std::string &vdir, int id) { // name of a saved file carrying this id, or ""
 WIN32_FIND_DATAA f; HANDLE h = FindFirstFileA((vdir + "*.*").c_str(), &f); if (h == INVALID_HANDLE_VALUE) return "";
 std::string hit;
 do {
  DWORD n = 0; char *b = ReadAll(vdir + f.cFileName, &n); if (!b) continue;
  if ((n > 0x40 && !memcmp(b, "OggS", 4) && *(short *)(b + 0x30) == id) || (n > 48 && !memcmp(b, "RIFF", 4) && *(short *)(b + 44 + 2) == id)) hit = f.cFileName;
  free(b);
 } while (hit.empty() && FindNextFileA(h, &f));
 FindClose(h); return hit;
}
DWORD FileSize(const std::string &path) { WIN32_FILE_ATTRIBUTE_DATA a; return GetFileAttributesExA(path.c_str(), GetFileExInfoStandard, &a) ? a.nFileSizeLow : 0; }
IDirectSoundBuffer *StaticBuf() { static IDirectSoundBuffer *b = Ds ? DsBuffer(Rate * 4) : NULL; return b; }
void PlayStatic(const Clip &c) { IDirectSoundBuffer *b = StaticBuf(); if (!b) return; b->Stop(); Fill(b, 0, c.data(), (DWORD)c.size() * 2); b->SetCurrentPosition(0); b->Play(0, 0, 0); }
}

int CaseVoiceSafety(FakeGame &g) {
 std::string vdir = g.dir + "voice\\";
 int fail = 0;
 std::vector<short> loud(512 * 1024); for (size_t i = 0; i < loud.size(); i++) loud[i] = (short)(((i * 37) % 2000) + 500);

 // 1. Format unknown (a device the DLL never saw opened): writes must not pile up.
 { SIZE_T before = Private(); WAVEHDR h = {}; h.lpData = (LPSTR)loud.data(); h.dwBufferLength = (DWORD)loud.size() * 2;
   for (int i = 0; i < 64; i++) waveOutWrite((HWAVEOUT)(UINT_PTR)0x5A5A0, &h, sizeof h);
   SIZE_T grew = Private() > before ? Private() - before : 0; if (grew > (24u << 20)) { printf("FAIL item 1: unknown-format writes grew memory by %u MB\n", (unsigned)(grew >> 20)); fail++; } }
 // 1b. Known format, a loud stream that never ends: capped per clip.
 if (Xa) { IXAudio2SourceVoice *v = NULL;
   if (SUCCEEDED(Xa->CreateSourceVoice(&v, &Wf))) { v->SetVolume(0); SIZE_T before = Private();
     XAUDIO2_BUFFER b = {}; b.AudioBytes = (UINT32)loud.size() * 2; b.pAudioData = (const BYTE *)loud.data();
     for (int i = 0; i < 40; i++) { v->SubmitSourceBuffer(&b); if (i % 8 == 7) { v->FlushSourceBuffers(); Sleep(20); } }
     SIZE_T grew = Private() > before ? Private() - before : 0; if (grew > (40u << 20)) { printf("FAIL item 1: endless stream grew memory by %u MB\n", (unsigned)(grew >> 20)); fail++; }
     v->DestroyVoice(); } }

 // 7. Read-ahead: two voice files read close together, then a sound plays: it must carry neither name. One read, one
 //    sound: it carries that file's name.
 Put("voice\\amb1.ogg", FakeOgg(701, 4000)); Put("voice\\amb2.ogg", FakeOgg(702, 4000)); Put("voice\\solo.ogg", FakeOgg(703, 4000));
 { DWORD k; char *a = ReadAll("voice\\amb1.ogg", &k); free(a); a = ReadAll("voice\\amb2.ogg", &k); free(a); Sleep(200); PlayStatic(Tone(704, 600, 640)); }
 Sleep(2500);
 { DWORD k; char *a = ReadAll("voice\\solo.ogg", &k); free(a); Sleep(100); PlayStatic(Tone(705, 600, 660)); }

 // 8. DirectSound format asked on every play: a 44.1 kHz buffer after 22.05 kHz ones.
 if (Ds) { WAVEFORMATEX w44 = { WAVE_FORMAT_PCM, 1, 44100, 88200, 2, 16, 0 }; DSBUFFERDESC d = { sizeof d, DSBCAPS_CTRLVOLUME | DSBCAPS_GLOBALFOCUS, 44100 * 2, 0, &w44 };
   IDirectSoundBuffer *b = NULL;
   if (SUCCEEDED(Ds->CreateSoundBuffer(&d, &b, NULL))) { b->SetVolume(DSBVOLUME_MIN); std::vector<short> c(44100 / 2); for (size_t i = 0; i < c.size(); i++) c[i] = (short)(3000 + (i % 100)); c[0] = 0x7000; c[1] = 801;
     Fill(b, 0, c.data(), (DWORD)c.size() * 2); b->Play(0, 0, 0); Sleep(1500); b->Release(); } }

 // 12. A looping ring buffer refilled 500 ms after Play is still one sound.
 if (Ds) { IDirectSoundBuffer *b = DsBuffer(Rate * 2); Clip c = Tone(901, 1400, 700);
   if (b) { DWORD half = Rate; Fill(b, 0, c.data(), half); b->Play(0, 0, DSBPLAY_LOOPING); Sleep(500);
     Fill(b, half, (const char *)c.data() + half, (DWORD)c.size() * 2 - half);
     std::vector<short> z(Rate); for (int i = 0; i < 12; i++) { Sleep(100); Fill(b, 0, z.data(), Rate / 5); }
     b->Stop(); b->Release(); } }

 // 9. A read buffer that turns into a voice file 1.2 s after the read (reused memory) is not dated to the read.
 std::string late = FakeOgg(906, 5000), lateEnc = late; Xor(lateEnc); Put("late.bin", lateEnc);
 { DWORD k = 0; char *b = ReadAll("late.bin", &k); Sleep(1200); for (DWORD i = 0; i < k; i++) b[i] = (char)(b[i] ^ (0x5A + (i % 7))); g.Hold(b); }

 // 10. A big read block holding two voice files and more is cut at the end of the first.
 std::string first = FakeOgg(907, 6000), second = FakeOgg(908, 5000), block = first + second + std::string(50000, 'x');
 Put("bigblock.pak", block); { DWORD k; char *b = ReadAll("bigblock.pak", &k); g.Hold(b); }

 // 11. A handle closed and its value reused by a file opened without the hooked call: no stale name.
 Put("voice\\closed.ogg", FakeOgg(909, 3000)); Put("voice\\reused.ogg", FakeOgg(910, 4000));
 { HANDLE a = CreateFileA("voice\\closed.ogg", GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL); CloseHandle(a);
   HANDLE b = CreateFile2(L"voice\\reused.ogg", GENERIC_READ, FILE_SHARE_READ, OPEN_EXISTING, NULL);
   if (b != INVALID_HANDLE_VALUE) { std::vector<char> buf(4096); DWORD got = 0; ReadFile(b, buf.data(), (DWORD)buf.size(), &got, NULL); CloseHandle(b); } }

 Sleep(3000);
 std::string ev = Events(vdir);
 auto lineOf = [&](const std::string &file) { if (file.empty()) return std::string(); size_t at = ev.find("\"file\":\"" + file + "\""); if (at == std::string::npos) return std::string();
  size_t s = ev.rfind('\n', at); s = s == std::string::npos ? 0 : s + 1; size_t e = ev.find('\n', at); return ev.substr(s, e - s); };
 { std::string l = lineOf(SavedFile(vdir, 704));
   if (l.empty()) { printf("FAIL item 7: read-ahead clip not saved\n"); fail++; } else if (l.find("amb1") != std::string::npos || l.find("amb2") != std::string::npos) { printf("FAIL item 7: clip named after a read-ahead file: %s\n", l.c_str()); fail++; } }
 { std::string l = lineOf(SavedFile(vdir, 705));
   if (l.find("solo.ogg") == std::string::npos) { printf("FAIL item 7: a clip after one read is not named after it: %s\n", l.c_str()); fail++; } }
 if (Ds) { std::string f = SavedFile(vdir, 801); DWORD n = 0; char *b = f.empty() ? NULL : ReadAll(vdir + f, &n);
   DWORD rate = b ? *(DWORD *)(b + 24) : 0; if (rate != 44100) { printf("FAIL item 8: 44.1 kHz buffer saved with rate %lu\n", rate); fail++; } free(b); }
 if (Ds) { std::string l = lineOf(SavedFile(vdir, 901)); size_t m = l.find("\"ms\":"); int ms = m == std::string::npos ? 0 : atoi(l.c_str() + m + 5);
   if (ms < 1300) { printf("FAIL item 12: late-refilled ring buffer cut (%d ms of 1400)\n", ms); fail++; } }
 if (!SavedFile(vdir, 906).empty()) { printf("FAIL item 9: buffer changed 1.2 s after its read was saved\n"); fail++; }
 { std::string f = SavedFile(vdir, 907);
   if (f.empty()) { printf("FAIL item 10: first file of a block not saved\n"); fail++; }
   else if (FileSize(vdir + f) != first.size()) { printf("FAIL item 10: block saved as %lu bytes, first file is %u\n", FileSize(vdir + f), (unsigned)first.size()); fail++; } }
 if (ev.find("closed.ogg") != std::string::npos) { printf("FAIL item 11: a closed handle's name was used\n"); fail++; }
 return fail;
}
