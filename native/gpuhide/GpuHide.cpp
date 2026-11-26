// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitGpu32/64.dll: hide layer 4, the "fake GPU" (docs/hide-layers.md, owner 2026-11-14: MeguLit draws all game text).
// For engines that draw their dialogue from bitmap font atlases through Direct3D 9 (glyph textures, prerendered font
// sheets such as BRUNS' font\ff_*.bmp) and never ask Windows for a glyph. Loaded by HookBridge into the bound game.
//
//  - The device and buffer interface tables are found with throwaway devices created inside the game's own d3d9.dll,
//    and only their entries are swapped (vtable patch); every hook calls the game's original function. No game memory,
//    file, buffer or texture is ever written: hiding a glyph means the draw call is issued for the other quads only.
//  - Glyph quads: textured quads, small on screen and a small sub-rectangle of a larger texture (an atlas), laid out in
//    rows. Vertex data comes from DrawPrimitiveUP / DrawIndexedPrimitiveUP or from shadows of the game's own vertex and
//    index buffers taken at Unlock (read-only copies).
//  - Lines: HookBridge pushes the dialogue line its text hook read (LINE <text>) over \\.\pipe\MeguLitGpuCtl-<pid>.
//    The DLL learns where the line is drawn (the text area: a row cluster of glyph quads from one atlas whose count
//    matches the line's characters) without hiding anything; only after that it hides glyph quads of the learned atlas
//    inside the learned text area while a line is armed (60 s after the last LINE, until OFF). Menus, names and
//    anything outside the text area are never touched. Unsure (no match yet, shaders, unknown vertex layout) = no hide.
//  - Reports over \\.\pipe\MeguLitGpu-<pid> (UTF-8 lines):
//      ToMe_GPUHIDE ready version=1 apis=d3d9,d3d11,opengl,gdi
//      ToMe_GPUHIDE learn seq=N area=x,y,w,h atlas=WxH glyphs=K chars=C        (text area learned, read-only)
//      ToMe_GPUHIDE hit seq=N quads=Q chars=C                                   (first hidden draw of a line)
//      ToMe_CHARS engine=gpu line=N hidden=0|1 sw=W sh=H vx=0 vy=0 vw=W vh=H n=K rects=x,y,w,h;... text=<line>
//    Rectangles are in back-buffer pixels, one per non-blank character of the line in reading order (rows top to bottom,
//    left to right), only when the number of glyph positions equals the number of characters.
//  - Control lines: LINE <text>, OFF, MODE hide|read (read = learn and report rectangles, never hide), QUIT.
//  - Diagnostics: a file MeguLitGpu.diag next to the DLL whose first line is a log path turns on a draw log.
#include <windows.h>
#include <d3d9.h>
#include <stdio.h>
#include <share.h>
#include <stdarg.h>
#include <string>
#include <vector>
#include <deque>
#include <map>
#include <memory>
#include <set>
#include <algorithm>
#include <cmath>
#include "GlyphQuads.h"
#include "GlyphTrace.h"
#include "../shared/minhook/include/MinHook.h"

static CRITICAL_SECTION Lock;
struct Guard { Guard() { EnterCriticalSection(&Lock); } ~Guard() { LeaveCriticalSection(&Lock); } };
static FILE *Diag; static long DiagBytes;
static std::deque<std::string> Outbox; static HANDLE OutEvent;
static volatile bool Quit;

static void Log(const char *fmt, ...) {
 if (!Diag) return; char b[2048]; va_list a; va_start(a, fmt); int n = _vsnprintf_s(b, sizeof b, _TRUNCATE, fmt, a); va_end(a);
 if (n < 0) n = (int)strlen(b); if (DiagBytes > 40 * 1024 * 1024) return; DiagBytes += n + 1; fputs(b, Diag); fputc('\n', Diag); fflush(Diag);
}
static void Send(const std::string &line) { { Guard g; if (Outbox.size() < 512) Outbox.push_back(line); } Log("SEND %s", line.c_str()); SetEvent(OutEvent); }
static std::string Utf8(const std::wstring &w) { if (w.empty()) return ""; int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), NULL, 0, NULL, NULL); std::string s(n, 0); WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, NULL, NULL); return s; }

// --------------------------------------------------------------------------------------------------------------- hooks
// Windows 10/11 d3d9 gives every device its own copy of the interface table (on the heap), so patching a throwaway
// device's table would miss the game's device. The functions those tables point at live in d3d9.dll and are shared by
// every device, so they are hooked in place (MinHook). One thunk per (slot, target): the multithreaded device classes
// use their own wrappers for a few methods. The thunk hands the hook its own trampoline (CurOrig) before anything else.
static __declspec(thread) void *CurOrig;
#define ORIG(T, self, slot) ((T)CurOrig)
template <int S, int K, typename F> struct Thunk;
template <int S, int K, typename R, typename... A> struct Thunk<S, K, R(WINAPI *)(A...)> {
 static void *tramp; static R(WINAPI *hook)(A...);
 static R WINAPI Run(A... a) { CurOrig = tramp; return hook(a...); }
};
template <int S, int K, typename R, typename... A> void *Thunk<S, K, R(WINAPI *)(A...)>::tramp;
template <int S, int K, typename R, typename... A> R(WINAPI *Thunk<S, K, R(WINAPI *)(A...)>::hook)(A...);
static std::map<int, std::vector<void *>> Hooked; static int HookCount;
// 2026-11-19 (perf/minhook-freeze): every install queues its hooks and switches them on with Apply, one freeze of the game's
// threads per batch instead of one per hook (MinHook suspends every other thread for each MH_EnableHook).
static bool Apply() { return MH_ApplyQueued() == MH_OK; }
template <int S, int K, typename F> static bool Inst(void *target, F hook) {
 typedef Thunk<S, K, F> T; T::hook = hook; if (MH_CreateHook(target, (void *)&T::Run, &T::tramp) != MH_OK) return false; if (MH_QueueEnableHook(target) != MH_OK) return false; HookCount++; return true;
}
template <int S, typename F> static void Hook(void *target, F hook) {
 if (!target) return; auto &v = Hooked[S]; for (void *t : v) if (t == target) return; if (v.size() >= 8) { Log("hook slot %d full", S); return; }
 bool ok = false; switch (v.size()) { case 0: ok = Inst<S, 0>(target, hook); break; case 1: ok = Inst<S, 1>(target, hook); break; case 2: ok = Inst<S, 2>(target, hook); break; case 3: ok = Inst<S, 3>(target, hook); break; case 4: ok = Inst<S, 4>(target, hook); break; case 5: ok = Inst<S, 5>(target, hook); break; case 6: ok = Inst<S, 6>(target, hook); break; default: ok = Inst<S, 7>(target, hook); }
 if (ok) v.push_back(target);
}
// ----------------------------------------------------------------------------------------------------------- device state
struct Shadow { std::vector<unsigned char> data; unsigned stride; bool i32; };
static std::map<void *, Shadow> Buffers; // vertex and index buffer shadows (read-only copies taken at Unlock)
struct PendingLock { void *buf; UINT off, size; void *ptr; };
static std::vector<PendingLock> Pending;
struct TexInfo { UINT w, h; D3DFORMAT fmt; bool rt; };
static std::map<void *, TexInfo> Textures;
struct Dev {
 IDirect3DDevice9 *d; void *tex0; void *rtTex; UINT rtW, rtH; void *vb; UINT vbOff, vbStride; void *ib; DWORD fvf; bool decl, vs; void *declPtr;
 D3DMATRIX m[3]; bool mSet[3]; D3DVIEWPORT9 vp; UINT bbW, bbH; bool rtIsBack;
 float vsc[32 * 4]; unsigned vscSet; // vertex-shader constants c0..c31 as the game set them (pure devices cannot be read back)
};
static Dev Devs[4]; static int DevCount;
static Dev *DevOf(IDirect3DDevice9 *d) {
 for (int i = 0; i < DevCount; i++) if (Devs[i].d == d) return &Devs[i];
 int i = DevCount < 4 ? DevCount++ : 3; Dev &v = Devs[i]; memset(&v, 0, sizeof v); v.d = d; v.rtIsBack = true;
 for (int k = 0; k < 3; k++) { memset(&v.m[k], 0, sizeof(D3DMATRIX)); v.m[k]._11 = v.m[k]._22 = v.m[k]._33 = v.m[k]._44 = 1; }
 IDirect3DSurface9 *bb = NULL; if (SUCCEEDED(d->GetBackBuffer(0, 0, D3DBACKBUFFER_TYPE_MONO, &bb)) && bb) {
  D3DSURFACE_DESC sd; if (SUCCEEDED(bb->GetDesc(&sd))) { v.bbW = v.rtW = sd.Width; v.bbH = v.rtH = sd.Height; v.vp.Width = sd.Width; v.vp.Height = sd.Height; v.vp.MaxZ = 1; } bb->Release(); }
 return &v;
}

// ------------------------------------------------------------------------------------------------------------ line state
static GlyphLearner Learner;
static GlyphTrace Trace; // GetGlyphOutline glyphs followed into textures and onto the screen (GlyphTrace.h)
static unsigned Frame, LastPresent;
/* Test rigs only: MEGULIT_GPU_FPS_CAP=<fps> sleeps before each present so a background test game does not take the GPU from
   the player's own game. Unset in MeguLit (no cap). */
static void FramesTick(unsigned now, unsigned w, unsigned h) { Learner.Frame(now, w, h); Trace.Frame(now, w, h); }
static void FpsCap() {
 static int cap = -1; static LARGE_INTEGER f, last; if (cap < 0) { wchar_t v[8] = {}; cap = GetEnvironmentVariableW(L"MEGULIT_GPU_FPS_CAP", v, 8) ? _wtoi(v) : 0; QueryPerformanceFrequency(&f); }
 if (cap <= 0) return; LARGE_INTEGER now; QueryPerformanceCounter(&now); double want = 1.0 / cap, got = last.QuadPart ? (double)(now.QuadPart - last.QuadPart) / f.QuadPart : want;
 if (got < want) Sleep((DWORD)((want - got) * 1000)); QueryPerformanceCounter(&last);
}

// --------------------------------------------------------------------------------------------------------- vertex decode
static bool PosLayout(DWORD fvf, unsigned &posSize, bool &rhw, unsigned &uvOff, unsigned &stride) {
 DWORD pos = fvf & D3DFVF_POSITION_MASK; if (pos == D3DFVF_XYZRHW) { posSize = 16; rhw = true; } else if (pos == D3DFVF_XYZ) { posSize = 12; rhw = false; } else return false;
 unsigned o = posSize; if (fvf & D3DFVF_NORMAL) o += 12; if (fvf & D3DFVF_PSIZE) o += 4; if (fvf & D3DFVF_DIFFUSE) o += 4; if (fvf & D3DFVF_SPECULAR) o += 4;
 unsigned tc = (fvf & D3DFVF_TEXCOUNT_MASK) >> D3DFVF_TEXCOUNT_SHIFT; if (tc < 1) return false; uvOff = o;
 unsigned s = o; for (unsigned i = 0; i < tc; i++) { unsigned f = (fvf >> (16 + i * 2)) & 3; s += f == 0 ? 8 : f == 1 ? 12 : f == 2 ? 16 : 4; }
 if (((fvf >> 16) & 3) == 3) return false; // 1D texture coordinates
 stride = s; return true;
}
static void Project(Dev &v, const float *p, bool rhw, float &sx, float &sy) {
 if (rhw) { sx = p[0]; sy = p[1]; return; }
 float in[4] = { p[0], p[1], p[2], 1 }, t[4];
 for (int k = 0; k < 3; k++) { const float *m = &v.m[k]._11; for (int c = 0; c < 4; c++) t[c] = in[0] * m[c] + in[1] * m[4 + c] + in[2] * m[8 + c] + in[3] * m[12 + c]; memcpy(in, t, sizeof t); }
 float w = in[3] != 0 ? in[3] : 1; sx = v.vp.X + (in[0] / w + 1) * 0.5f * v.vp.Width; sy = v.vp.Y + (1 - in[1] / w) * 0.5f * v.vp.Height;
}
// Where position and texture coordinate 0 sit in a vertex. mode 0: untransformed (fixed-function world x view x
// projection), 1: pixels (XYZRHW / POSITIONT), 2: decided per draw (a vertex shader does the transform: NDC when every
// corner lies within [-1, 1], else pixels).
struct Layout9 { unsigned pos = 0, uv = 0, stride = 0; int mode = 0; unsigned col1 = 0; }; // col1: offset of the D3DCOLOR diffuse + 1 (0 = none)
struct DeclInfo { bool ok; unsigned pos, uv, stride; bool posT; unsigned col1; };
static std::map<void *, DeclInfo> Decls; // vertex declaration -> layout (read with GetDeclaration when it is set)
static DeclInfo ParseDecl(IDirect3DVertexDeclaration9 *x) {
 DeclInfo d = { false, 0, 0, 0, false, 0 }; D3DVERTEXELEMENT9 e[MAXD3DDECLLENGTH + 1]; UINT n = MAXD3DDECLLENGTH + 1; if (FAILED(x->GetDeclaration(e, &n))) return d;
 bool pos = false, uv = false;
 for (UINT i = 0; i < n && e[i].Stream != 0xFF; i++) {
  if (e[i].Stream != 0) continue; unsigned sz = e[i].Type == D3DDECLTYPE_FLOAT1 ? 4 : e[i].Type == D3DDECLTYPE_FLOAT2 ? 8 : e[i].Type == D3DDECLTYPE_FLOAT3 ? 12 : e[i].Type == D3DDECLTYPE_FLOAT4 ? 16 : 4;
  d.stride = (std::max)(d.stride, (unsigned)e[i].Offset + sz);
  bool f2 = e[i].Type == D3DDECLTYPE_FLOAT2 || e[i].Type == D3DDECLTYPE_FLOAT3 || e[i].Type == D3DDECLTYPE_FLOAT4;
  if (!pos && f2 && e[i].UsageIndex == 0 && (e[i].Usage == D3DDECLUSAGE_POSITION || e[i].Usage == D3DDECLUSAGE_POSITIONT)) { pos = true; d.pos = e[i].Offset; d.posT = e[i].Usage == D3DDECLUSAGE_POSITIONT; }
  if (!uv && e[i].Type == D3DDECLTYPE_FLOAT2 && e[i].Usage == D3DDECLUSAGE_TEXCOORD && e[i].UsageIndex == 0) { uv = true; d.uv = e[i].Offset; }
  if (!d.col1 && e[i].Type == D3DDECLTYPE_D3DCOLOR && e[i].Usage == D3DDECLUSAGE_COLOR && e[i].UsageIndex == 0) d.col1 = e[i].Offset + 1;
 }
 d.ok = pos && uv; return d;
}
static bool LayoutOf(Dev &v, Layout9 &L) {
 if (v.decl) { auto it = Decls.find(v.declPtr); if (it == Decls.end() || !it->second.ok) return false; const DeclInfo &d = it->second; L.pos = d.pos; L.uv = d.uv; L.stride = d.stride; L.col1 = d.col1; L.mode = d.posT ? 1 : v.vs ? 2 : 0; return true; }
 unsigned posSize; bool rhw; if (!PosLayout(v.fvf, posSize, rhw, L.uv, L.stride)) return false; L.pos = 0; L.mode = rhw ? 1 : v.vs ? 2 : 0;
 if (v.fvf & D3DFVF_DIFFUSE) L.col1 = posSize + ((v.fvf & D3DFVF_NORMAL) ? 12 : 0) + ((v.fvf & D3DFVF_PSIZE) ? 4 : 0) + 1;
 return true;
}
// Turns one draw into quads (two triangles each). Vertex fetch: vtx(i) -> pointer to vertex i of the draw.
template <class F> static bool Quads(Dev &v, D3DPRIMITIVETYPE pt, UINT prims, F vtx, std::vector<Quad> &out) {
 Layout9 L; if (!LayoutOf(v, L)) return false;
 if (L.mode == 0 && !v.mSet[2]) return false; // transforms set before we arrived: positions unknown
 UINT n; if (pt == D3DPT_TRIANGLELIST) { if (prims % 2) return false; n = prims * 3; } else if ((pt == D3DPT_TRIANGLESTRIP || pt == D3DPT_TRIANGLEFAN) && prims == 2) n = 4; else return false;
 std::vector<float> c(n * 4); std::vector<unsigned> vc(L.col1 ? n : 0); bool ndc = true;
 for (UINT i = 0; i < n; i++) { const unsigned char *p = vtx(i); if (!p) return false; const float *ps = (const float *)(p + L.pos), *uv = (const float *)(p + L.uv);
  float x, y; if (L.mode == 0) Project(v, ps, false, x, y); else { x = ps[0]; y = ps[1]; } if (L.col1) memcpy(&vc[i], p + L.col1 - 1, 4);
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(uv[0]) || !std::isfinite(uv[1])) return false;
  if (std::fabs(x) > 1.01f || std::fabs(y) > 1.01f) ndc = false; c[i * 4] = x; c[i * 4 + 1] = y; c[i * 4 + 2] = uv[0]; c[i * 4 + 3] = uv[1]; }
 if (L.mode == 2 && ndc) for (UINT i = 0; i < n; i++) { c[i * 4] = v.vp.X + (c[i * 4] + 1) * 0.5f * v.vp.Width; c[i * 4 + 1] = v.vp.Y + (1 - c[i * 4 + 1]) * 0.5f * v.vp.Height; }
 auto quad = [&](UINT a, UINT k, UINT first) { Quad q; q.x0 = q.y0 = q.u0 = q.v0 = 1e30f; q.x1 = q.y1 = q.u1 = q.v1 = -1e30f; q.first = first;
  for (UINT i = a; i < a + k; i++) { q.x0 = (std::min)(q.x0, c[i * 4]); q.y0 = (std::min)(q.y0, c[i * 4 + 1]); q.x1 = (std::max)(q.x1, c[i * 4]); q.y1 = (std::max)(q.y1, c[i * 4 + 1]); q.u0 = (std::min)(q.u0, c[i * 4 + 2]); q.v0 = (std::min)(q.v0, c[i * 4 + 3]); q.u1 = (std::max)(q.u1, c[i * 4 + 2]); q.v1 = (std::max)(q.v1, c[i * 4 + 3]); }
  if (L.col1) { q.col = vc[a]; q.hasCol = true; } out.push_back(q); };
 if (pt == D3DPT_TRIANGLELIST) { for (UINT t = 0; t < prims; t += 2) quad(t * 3, 6, t); } else quad(0, 4, 0);
 return true;
}

// ----------------------------------------------------------------------------------------------------------- draw hooks
typedef HRESULT(WINAPI *DrawP)(IDirect3DDevice9 *, D3DPRIMITIVETYPE, UINT, UINT);
typedef HRESULT(WINAPI *DrawIP)(IDirect3DDevice9 *, D3DPRIMITIVETYPE, INT, UINT, UINT, UINT, UINT);
typedef HRESULT(WINAPI *DrawUP)(IDirect3DDevice9 *, D3DPRIMITIVETYPE, UINT, const void *, UINT);
typedef HRESULT(WINAPI *DrawIUP)(IDirect3DDevice9 *, D3DPRIMITIVETYPE, UINT, UINT, UINT, const void *, D3DFORMAT, const void *, UINT);

static TexInfo TexOf(void *t) { auto it = Textures.find(t); if (it != Textures.end()) return it->second; TexInfo i = { 0, 0, D3DFMT_UNKNOWN, false }; return i; }
static void DiagDraw(Dev &v, const char *kind, D3DPRIMITIVETYPE pt, UINT prims, const std::vector<Quad> &q, bool decoded) {
 if (!Diag) return; bool full = Frame % 300 == 0; int glyphs = 0; TexInfo ti = TexOf(v.tex0);
 for (auto &x : q) if (GlyphLike(x, ti.w, ti.h)) glyphs++;
 if (!full && (glyphs == 0 || Frame % 10)) return;
 char b[1600]; int n = _snprintf_s(b, sizeof b, _TRUNCATE, "F%u %s rt=%p(%ux%u%s) tex=%p(%ux%u f%d%s) pt=%d n=%u fvf=%lx%s%s q=%u g=%d", Frame, kind, v.rtTex, v.rtW, v.rtH, v.rtIsBack ? " back" : "", v.tex0, ti.w, ti.h, (int)ti.fmt, ti.rt ? " rt" : "", (int)pt, prims, v.fvf, v.decl ? " decl" : "", v.vs ? " vs" : "", (unsigned)q.size(), glyphs);
 if (!decoded) n += _snprintf_s(b + n, sizeof b - n, _TRUNCATE, " undecoded");
 for (size_t i = 0; i < q.size() && i < 8 && n < 1400; i++) n += _snprintf_s(b + n, sizeof b - n, _TRUNCATE, " [%.0f,%.0f %.0fx%.0f uv %.3f,%.3f %.3fx%.3f]", q[i].x0, q[i].y0, q[i].x1 - q[i].x0, q[i].y1 - q[i].y0, q[i].u0, q[i].v0, q[i].u1 - q[i].u0, q[i].v1 - q[i].v0);
 Log("%s", b);
}
// Decides per quad; returns the quads to leave out (indices into q). Empty = draw as is.
// Glyph trace (GlyphTrace.h): quads from a texture that holds traced GetGlyphOutline cells give those characters' places.
static void TraceDraw(void *tex, unsigned tw, unsigned th, void *rt, unsigned rtW, unsigned rtH, std::vector<Quad> &q) {
 if (!Trace.seq || !Trace.Known(tex)) return; std::vector<GlyphTrace::Q> t; t.reserve(q.size());
 for (auto &x : q) { GlyphTrace::Q g{ x.x0, x.y0, x.x1, x.y1, x.u0, x.v0, x.u1, x.v1 }; g.col = x.col; g.hasCol = x.hasCol; t.push_back(g); }
 Trace.Draw(tex, tw, th, t, [&](float *r) { GlyphLearner::Rect rr{ r[0], r[1], r[2], r[3] }; if (!Learner.ToScreen(rt, rtW, rtH, rr)) return false; r[0] = rr.x0; r[1] = rr.y0; r[2] = rr.x1; r[3] = rr.y1; return true; }, GetTickCount());
 for (size_t i = 0; i < q.size(); i++) q[i].glyph = t[i].glyph;
}
static std::vector<int> Decide(Dev &v, std::vector<Quad> &q) {
 TexInfo ti = TexOf(v.tex0); std::vector<int> drop;
 if (!v.tex0 || ti.w == 0) return drop;
 if (v.rtIsBack && ti.rt) { Learner.Composite(v.tex0, q); return drop; }
 TraceDraw(v.tex0, ti.w, ti.h, v.rtIsBack ? NULL : v.rtTex, v.rtW, v.rtH, q);
 Learner.texRt = ti.rt;
 return Learner.Draw(v.tex0, ti.w, ti.h, v.rtIsBack ? NULL : v.rtTex, v.rtW, v.rtH, v.bbW, v.bbH, q, GetTickCount());
}
// The device's own getters at every draw: state the game set before the DLL arrived (a declaration set once at start,
// DR1) counts too. A pure device refuses Get* calls; then the hooked setters' view stays.
static TexInfo ProbeTexture(void *t); static void StoreTexture(void *t, const TexInfo &i);
static void Refresh9(IDirect3DDevice9 *d) {
 IDirect3DVertexDeclaration9 *x = NULL; DWORD fvf = 0; IDirect3DVertexShader9 *vs = NULL; IDirect3DBaseTexture9 *t = NULL; IDirect3DVertexBuffer9 *vb = NULL; UINT off = 0, st = 0; IDirect3DIndexBuffer9 *ib = NULL;
 bool hx = SUCCEEDED(d->GetVertexDeclaration(&x)), hf = SUCCEEDED(d->GetFVF(&fvf)), hv = SUCCEEDED(d->GetVertexShader(&vs)), ht = SUCCEEDED(d->GetTexture(0, &t)), hs = SUCCEEDED(d->GetStreamSource(0, &vb, &off, &st)), hi = SUCCEEDED(d->GetIndices(&ib));
 bool known = true, texKnown = true; { Guard g; if (x) known = Decls.count(x) > 0; if (t) texKnown = Textures.count(t) > 0; } DeclInfo info = {}; if (x && !known) info = ParseDecl(x);
 TexInfo tinfo = {}; if (t && !texKnown) tinfo = ProbeTexture(t);
 { Guard g; Dev &v = *DevOf(d);
  if (x && !known) { if (Decls.size() > 4096) Decls.clear(); Decls[x] = info; }
  if (hx) { v.decl = x != NULL; v.declPtr = x; } if (hf && !x) v.fvf = fvf; if (hv) v.vs = vs != NULL;
  if (ht && t != v.tex0) { v.tex0 = t; if (t && !texKnown && !Textures.count(t)) StoreTexture(t, tinfo); }
  if (hs) { v.vb = vb; v.vbOff = off; v.vbStride = st; } if (hi) v.ib = ib; }
 if (x) x->Release(); if (vs) vs->Release(); if (t) t->Release(); if (vb) vb->Release(); if (ib) ib->Release();
}
// Diagnostics only (MeguLitGpu.diag present): an undecoded indexed draw of one quad from a static buffer (sprites placed by
// shader constants: Danganronpa, Artemis). Logs the buffer's first vertices (read-only lock) and the first vertex-shader
// constants, so a constant layout can be studied. Never runs without the diag file.
static void DiagSprite(IDirect3DDevice9 *d, Dev &v, UINT prims) {
 static unsigned lastFrame, inFrame; if (!Diag || prims != 2 || Frame % 60) return; if (Frame != lastFrame) { lastFrame = Frame; inFrame = 0; } if (++inFrame > 400) return;
 TexInfo ti = TexOf(v.tex0); char b[1800]; int n = _snprintf_s(b, sizeof b, _TRUNCATE, "SPRITE F%u tex=%p(%ux%u f%d) rt=%ux%u stride=%u off=%u vscSet=%08x", Frame, v.tex0, ti.w, ti.h, (int)ti.fmt, v.rtW, v.rtH, v.vbStride, v.vbOff, v.vscSet);
 auto it = Buffers.find(v.vb); if (it != Buffers.end() && v.vbStride) { const Shadow &sh = it->second; n += _snprintf_s(b + n, sizeof b - n, _TRUNCATE, " vb:"); for (size_t i = 0; i < 4 * (size_t)v.vbStride / 4 && i < 32; i++) { size_t at = v.vbOff + i * 4; if (at + 4 > sh.data.size()) break; n += _snprintf_s(b + n, sizeof b - n, _TRUNCATE, " %.3g", *(const float *)&sh.data[at]); } }
 else n += _snprintf_s(b + n, sizeof b - n, _TRUNCATE, " vb:none");
 n += _snprintf_s(b + n, sizeof b - n, _TRUNCATE, " c:"); for (int i = 0; i < 48 && n < 1700; i++) n += _snprintf_s(b + n, sizeof b - n, _TRUNCATE, "%s%.5g", i % 4 ? "," : " |", v.vsc[i]);
 Log("%s", b);
}
static HRESULT WINAPI HDrawPrimitive(IDirect3DDevice9 *d, D3DPRIMITIVETYPE pt, UINT start, UINT prims) {
 DrawP o = ORIG(DrawP, d, 81); Refresh9(d); std::vector<int> drop; std::vector<Quad> q;
 { Guard g; Dev &v = *DevOf(d); auto it = Buffers.find(v.vb); bool ok = false;
  if (it != Buffers.end() && v.vbStride) { const Shadow &s = it->second; ok = Quads(v, pt, prims, [&](UINT i) -> const unsigned char * { size_t at = v.vbOff + (size_t)(start + i) * v.vbStride; return at + v.vbStride <= s.data.size() ? &s.data[at] : NULL; }, q); }
  if (Diag) DiagDraw(v, "DP", pt, prims, q, ok); if (ok) drop = Decide(v, q); }
 if (drop.empty()) return o(d, pt, start, prims);
 // Issue the kept quads as runs of the original draw (triangle lists only: 2 primitives = 6 vertices per quad).
 HRESULT hr = D3D_OK; size_t k = 0; UINT qn = (UINT)q.size(); UINT i = 0;
 while (i < qn) { if (k < drop.size() && (UINT)drop[k] == i) { k++; i++; continue; } UINT j = i; while (j < qn && !(k < drop.size() && (UINT)drop[k] == j)) j++; hr = o(d, pt, start + i * 6, (j - i) * 2); i = j; }
 return hr;
}
static HRESULT WINAPI HDrawIndexedPrimitive(IDirect3DDevice9 *d, D3DPRIMITIVETYPE pt, INT base, UINT minIdx, UINT nv, UINT startIdx, UINT prims) {
 DrawIP o = ORIG(DrawIP, d, 82); Refresh9(d); std::vector<int> drop; std::vector<Quad> q;
 { Guard g; Dev &v = *DevOf(d); auto vb = Buffers.find(v.vb), ib = Buffers.find(v.ib); bool ok = false;
  if (vb != Buffers.end() && ib != Buffers.end() && v.vbStride) { const Shadow &s = vb->second, &x = ib->second;
   ok = Quads(v, pt, prims, [&](UINT i) -> const unsigned char * { size_t ia = (size_t)(startIdx + i) * (x.i32 ? 4 : 2); if (ia + (x.i32 ? 4 : 2) > x.data.size()) return NULL; UINT idx = x.i32 ? *(const UINT *)&x.data[ia] : *(const USHORT *)&x.data[ia]; size_t at = v.vbOff + ((size_t)base + idx) * v.vbStride; return at + v.vbStride <= s.data.size() ? &s.data[at] : NULL; }, q); }
  /* One quad over exactly four vertices (2 triangles, nv == 4): the four vertices are the quad whatever the indices say,
     so a static index buffer filled before we arrived does not matter (Danganronpa: every glyph is such a draw from a
     dynamic vertex buffer, positions in pixels). Quads() takes the bounding box of the vertices it is given. */
  if (!ok && vb != Buffers.end() && ib == Buffers.end() && v.vbStride && pt == D3DPT_TRIANGLELIST && prims == 2 && nv == 4) { const Shadow &s = vb->second;
   ok = Quads(v, pt, prims, [&](UINT i) -> const unsigned char * { size_t at = v.vbOff + ((size_t)base + minIdx + i % 4) * v.vbStride; return at + v.vbStride <= s.data.size() ? &s.data[at] : NULL; }, q); }
  if (Diag) DiagDraw(v, "DIP", pt, prims, q, ok); if (!ok && Diag) DiagSprite(d, v, prims); if (ok) drop = Decide(v, q); }
 if (drop.empty()) return o(d, pt, base, minIdx, nv, startIdx, prims);
 HRESULT hr = D3D_OK; size_t k = 0; UINT qn = (UINT)q.size(); UINT i = 0;
 while (i < qn) { if (k < drop.size() && (UINT)drop[k] == i) { k++; i++; continue; } UINT j = i; while (j < qn && !(k < drop.size() && (UINT)drop[k] == j)) j++; hr = o(d, pt, base, minIdx, nv, startIdx + i * 6, (j - i) * 2); i = j; }
 return hr;
}
static HRESULT WINAPI HDrawPrimitiveUP(IDirect3DDevice9 *d, D3DPRIMITIVETYPE pt, UINT prims, const void *data, UINT stride) {
 DrawUP o = ORIG(DrawUP, d, 83); Refresh9(d); std::vector<int> drop; std::vector<Quad> q; const unsigned char *b = (const unsigned char *)data;
 { Guard g; Dev &v = *DevOf(d); UINT verts = pt == D3DPT_TRIANGLELIST ? prims * 3 : prims + 2; bool ok = false;
  if (data && stride) { Layout9 L; if (LayoutOf(v, L) && L.stride <= stride) ok = Quads(v, pt, prims, [&](UINT i) -> const unsigned char * { return i < verts ? b + (size_t)i * stride : NULL; }, q); }
  if (Diag) DiagDraw(v, "UP", pt, prims, q, ok); if (ok) drop = Decide(v, q); }
 if (drop.empty()) return o(d, pt, prims, data, stride);
 if (pt != D3DPT_TRIANGLELIST) return D3D_OK; // the single quad of a strip / fan is the dropped one
 HRESULT hr = D3D_OK; size_t k = 0; UINT qn = (UINT)q.size(); UINT i = 0;
 while (i < qn) { if (k < drop.size() && (UINT)drop[k] == i) { k++; i++; continue; } UINT j = i; while (j < qn && !(k < drop.size() && (UINT)drop[k] == j)) j++; hr = o(d, pt, (j - i) * 2, b + (size_t)i * 6 * stride, stride); i = j; }
 return hr;
}
static HRESULT WINAPI HDrawIndexedPrimitiveUP(IDirect3DDevice9 *d, D3DPRIMITIVETYPE pt, UINT minIdx, UINT nv, UINT prims, const void *idx, D3DFORMAT fmt, const void *data, UINT stride) {
 DrawIUP o = ORIG(DrawIUP, d, 84); Refresh9(d); std::vector<int> drop; std::vector<Quad> q; const unsigned char *b = (const unsigned char *)data; bool i32 = fmt == D3DFMT_INDEX32;
 { Guard g; Dev &v = *DevOf(d); UINT n = pt == D3DPT_TRIANGLELIST ? prims * 3 : prims + 2; bool ok = false;
  if (data && idx && stride) { Layout9 L; if (LayoutOf(v, L) && L.stride <= stride) ok = Quads(v, pt, prims, [&](UINT i) -> const unsigned char * { if (i >= n) return NULL; UINT k = i32 ? ((const UINT *)idx)[i] : ((const USHORT *)idx)[i]; return k < minIdx + nv ? b + (size_t)k * stride : NULL; }, q); }
  if (Diag) DiagDraw(v, "IUP", pt, prims, q, ok); if (ok) drop = Decide(v, q); }
 if (drop.empty()) return o(d, pt, minIdx, nv, prims, idx, fmt, data, stride);
 if (pt != D3DPT_TRIANGLELIST) return D3D_OK;
 HRESULT hr = D3D_OK; size_t k = 0; UINT qn = (UINT)q.size(); UINT i = 0; unsigned isz = i32 ? 4 : 2;
 while (i < qn) { if (k < drop.size() && (UINT)drop[k] == i) { k++; i++; continue; } UINT j = i; while (j < qn && !(k < drop.size() && (UINT)drop[k] == j)) j++; hr = o(d, pt, minIdx, nv, (j - i) * 2, (const unsigned char *)idx + (size_t)i * 6 * isz, fmt, data, stride); i = j; }
 return hr;
}

// ---------------------------------------------------------------------------------------------------------- state hooks
// 2026-11-20 (CHAOS;CHILD froze while skipping; dump: the main thread held Lock inside our hook and waited for the d3d9 device
// lock, a second game thread held the device lock inside d3d9 and waited for Lock). Rule: no D3D/COM call is ever made while
// Lock is held. ProbeTexture asks the texture (no lock), StoreTexture files the answer (caller holds Lock).
static TexInfo ProbeTexture(void *t) {
 TexInfo i = { 0, 0, D3DFMT_UNKNOWN, false }; if (!t) return i; IDirect3DBaseTexture9 *b = (IDirect3DBaseTexture9 *)t;
 if (b->GetType() == D3DRTYPE_TEXTURE) { D3DSURFACE_DESC sd; if (SUCCEEDED(((IDirect3DTexture9 *)t)->GetLevelDesc(0, &sd))) { i.w = sd.Width; i.h = sd.Height; i.fmt = sd.Format; i.rt = (sd.Usage & D3DUSAGE_RENDERTARGET) != 0; } }
 return i;
}
static void StoreTexture(void *t, const TexInfo &i) { if (!t) return; Textures[t] = i; if (Textures.size() > 8192) Textures.clear(); }
static HRESULT WINAPI HSetTexture(IDirect3DDevice9 *d, DWORD stage, IDirect3DBaseTexture9 *t) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, DWORD, IDirect3DBaseTexture9 *), d, 65)(d, stage, t);
 if (stage == 0 && SUCCEEDED(hr)) { TexInfo ti = ProbeTexture(t); Guard g; DevOf(d)->tex0 = t; StoreTexture(t, ti); } return hr;
}
static HRESULT WINAPI HSetRenderTarget(IDirect3DDevice9 *d, DWORD index, IDirect3DSurface9 *s) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, DWORD, IDirect3DSurface9 *), d, 37)(d, index, s);
 if (index == 0 && SUCCEEDED(hr) && s) { D3DSURFACE_DESC sd; bool desc = SUCCEEDED(s->GetDesc(&sd)); void *tex = NULL;
  IDirect3DTexture9 *t = NULL; if (SUCCEEDED(s->GetContainer(__uuidof(IDirect3DTexture9), (void **)&t)) && t) { tex = t; t->Release(); }
  TexInfo ti = {}; if (tex) ti = ProbeTexture(tex);
  Guard g; Dev &v = *DevOf(d);
  if (desc) { v.rtW = sd.Width; v.rtH = sd.Height; v.vp.X = v.vp.Y = 0; v.vp.Width = sd.Width; v.vp.Height = sd.Height; v.vp.MinZ = 0; v.vp.MaxZ = 1; }
  v.rtTex = tex; v.rtIsBack = tex == NULL; if (tex) StoreTexture(tex, ti); }
 return hr;
}
static HRESULT WINAPI HSetStreamSource(IDirect3DDevice9 *d, UINT n, IDirect3DVertexBuffer9 *vb, UINT off, UINT stride) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, UINT, IDirect3DVertexBuffer9 *, UINT, UINT), d, 100)(d, n, vb, off, stride);
 if (n == 0 && SUCCEEDED(hr)) { Guard g; Dev &v = *DevOf(d); v.vb = vb; v.vbOff = off; v.vbStride = stride; } return hr;
}
static HRESULT WINAPI HSetIndices(IDirect3DDevice9 *d, IDirect3DIndexBuffer9 *ib) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, IDirect3DIndexBuffer9 *), d, 104)(d, ib); if (SUCCEEDED(hr)) { Guard g; DevOf(d)->ib = ib; } return hr;
}
static HRESULT WINAPI HSetFVF(IDirect3DDevice9 *d, DWORD fvf) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, DWORD), d, 89)(d, fvf); if (SUCCEEDED(hr)) { Guard g; Dev &v = *DevOf(d); v.fvf = fvf; v.decl = false; } return hr;
}
static HRESULT WINAPI HSetVertexDeclaration(IDirect3DDevice9 *d, IDirect3DVertexDeclaration9 *x) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, IDirect3DVertexDeclaration9 *), d, 87)(d, x);
 if (SUCCEEDED(hr)) { bool known; { Guard g; known = !x || Decls.count(x); } DeclInfo info = {}; if (!known) info = ParseDecl(x); Guard g; if (!known) { if (Decls.size() > 4096) Decls.clear(); Decls[x] = info; } Dev &v = *DevOf(d); v.decl = x != NULL; v.declPtr = x; } return hr;
}
static HRESULT WINAPI HSetVertexShader(IDirect3DDevice9 *d, IDirect3DVertexShader9 *x) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, IDirect3DVertexShader9 *), d, 92)(d, x); if (SUCCEEDED(hr)) { Guard g; DevOf(d)->vs = x != NULL; } return hr;
}
static HRESULT WINAPI HSetVSConstF(IDirect3DDevice9 *d, UINT start, const float *c, UINT n) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, UINT, const float *, UINT), d, 94)(d, start, c, n);
 if (SUCCEEDED(hr) && c && start < 32) { Guard g; Dev &v = *DevOf(d); UINT k = (std::min)(n, 32 - start); memcpy(&v.vsc[start * 4], c, k * 16); for (UINT i = start; i < start + k; i++) v.vscSet |= 1u << i; } return hr;
}
static HRESULT WINAPI HSetTransform(IDirect3DDevice9 *d, D3DTRANSFORMSTATETYPE s, const D3DMATRIX *m) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, D3DTRANSFORMSTATETYPE, const D3DMATRIX *), d, 44)(d, s, m);
 if (SUCCEEDED(hr) && m) { int k = s == D3DTS_WORLD ? 0 : s == D3DTS_VIEW ? 1 : s == D3DTS_PROJECTION ? 2 : -1; if (k >= 0) { Guard g; Dev &v = *DevOf(d); v.m[k] = *m; v.mSet[k] = true; } } return hr;
}
static HRESULT WINAPI HSetViewport(IDirect3DDevice9 *d, const D3DVIEWPORT9 *p) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, const D3DVIEWPORT9 *), d, 47)(d, p); if (SUCCEEDED(hr) && p) { Guard g; DevOf(d)->vp = *p; } return hr;
}
static HRESULT WINAPI HPresent(IDirect3DDevice9 *d, const RECT *a, const RECT *b, HWND w, const RGNDATA *r) {
 auto o = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, const RECT *, const RECT *, HWND, const RGNDATA *), d, 17);
 FpsCap(); { Guard g; Frame++; LastPresent = GetTickCount(); Dev &v = *DevOf(d); FramesTick(LastPresent, v.bbW, v.bbH); }
 return o(d, a, b, w, r);
}
// Engines that present through an IDirect3DSwapChain9 (minori's eden*) never call the device's Present: same frame tick.
static HRESULT WINAPI HSwapPresent(IDirect3DSwapChain9 *sc, const RECT *a, const RECT *b, HWND w, const RGNDATA *r, DWORD f) {
 auto o = (HRESULT(WINAPI *)(IDirect3DSwapChain9 *, const RECT *, const RECT *, HWND, const RGNDATA *, DWORD))CurOrig;
 IDirect3DDevice9 *d = NULL; if (SUCCEEDED(sc->GetDevice(&d)) && d) { FpsCap(); { Guard g; Frame++; LastPresent = GetTickCount(); Dev &v = *DevOf(d); FramesTick(LastPresent, v.bbW, v.bbH); } d->Release(); }
 return o(sc, a, b, w, r, f);
}
// Direct3D 9Ex devices (DR1) present through PresentEx.
static HRESULT WINAPI HPresentEx(IDirect3DDevice9Ex *d, const RECT *a, const RECT *b, HWND w, const RGNDATA *r, DWORD f) {
 auto o = (HRESULT(WINAPI *)(IDirect3DDevice9Ex *, const RECT *, const RECT *, HWND, const RGNDATA *, DWORD))CurOrig;
 FpsCap(); { Guard g; Frame++; LastPresent = GetTickCount(); Dev &v = *DevOf(d); FramesTick(LastPresent, v.bbW, v.bbH); }
 return o(d, a, b, w, r, f);
}
static HRESULT WINAPI HReset(IDirect3DDevice9 *d, D3DPRESENT_PARAMETERS *p) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, D3DPRESENT_PARAMETERS *), d, 16)(d, p);
 if (SUCCEEDED(hr) && p) { Guard g; Dev &v = *DevOf(d); v.bbW = v.rtW = p->BackBufferWidth; v.bbH = v.rtH = p->BackBufferHeight; v.rtTex = NULL; v.rtIsBack = true; v.vp.X = v.vp.Y = 0; v.vp.Width = v.bbW; v.vp.Height = v.bbH; v.vp.MaxZ = 1; Buffers.clear(); Textures.clear(); }
 return hr;
}
// Buffers: Lock records where the game writes, Unlock copies what it wrote into the shadow.
// ------------------------------------------------------------------------------------------------ glyph trace: textures
// A texture level 0 locked for writing while GetGlyphOutline glyphs wait (GlyphTrace.h). Surfaces of a texture count as
// the texture (level 0 only); other surfaces as themselves.
struct TexLock { void *tex; UINT level; void *ptr; int pitch, x, y, w, h, fmt; bool whole; };
static std::vector<TexLock> TexLocks;
static void *SurfOwner(IDirect3DSurface9 *s, UINT &level) {
 level = 0; IDirect3DTexture9 *t = NULL; if (SUCCEEDED(s->GetContainer(__uuidof(IDirect3DTexture9), (void **)&t)) && t) { IDirect3DSurface9 *s0 = NULL; void *owner = t; if (SUCCEEDED(t->GetSurfaceLevel(0, &s0)) && s0) { if (s0 != s) level = 1; s0->Release(); } t->Release(); return owner; }
 return s;
}
static void TexLocked(void *tex, UINT level, const D3DLOCKED_RECT *lr, const RECT *r, UINT w, UINT h, D3DFORMAT fmt) {
 if (level || !lr || !lr->pBits) return; Guard g; if (!Trace.Waiting()) return;
 TexLock k{ tex, level, lr->pBits, lr->Pitch, r ? (int)r->left : 0, r ? (int)r->top : 0, r ? (int)(r->right - r->left) : (int)w, r ? (int)(r->bottom - r->top) : (int)h, (int)fmt, !r };
 if (k.w <= 0 || k.h <= 0) return; for (auto &x : TexLocks) if (x.tex == tex && x.level == level) { x = k; return; } if (TexLocks.size() < 64) TexLocks.push_back(k);
}
static void TexUnlocking(void *tex, UINT level) {
 Guard g; for (size_t i = 0; i < TexLocks.size(); i++) if (TexLocks[i].tex == tex && TexLocks[i].level == level) {
  TexLock k = TexLocks[i]; TexLocks.erase(TexLocks.begin() + i); if (GtTexel((const unsigned char *)k.ptr, 0, k.fmt) < 0) return;
  // pBits points at the locked rectangle's top-left: texel (x, y) of the texture is at (x - k.x, y - k.y) from it
  auto read = [&](int x, int y) -> int { int lx = x - k.x, ly = y - k.y; if (lx < 0 || ly < 0 || lx >= k.w || ly >= k.h) return -1; return GtTexel((const unsigned char *)k.ptr + (size_t)ly * k.pitch, lx, k.fmt); };
  auto rgb = [&](int x, int y) -> int { int lx = x - k.x, ly = y - k.y; if (lx < 0 || ly < 0 || lx >= k.w || ly >= k.h) return -1; return GtTexelRgb((const unsigned char *)k.ptr + (size_t)ly * k.pitch, lx, k.fmt); };
  Trace.Write(tex, k.x, k.y, k.w, k.h, k.whole, read, rgb, GetTickCount()); return; }
}
static HRESULT WINAPI HTexLock(IDirect3DTexture9 *t, UINT level, D3DLOCKED_RECT *lr, const RECT *r, DWORD f) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DTexture9 *, UINT, D3DLOCKED_RECT *, const RECT *, DWORD), t, 19)(t, level, lr, r, f);
 if (SUCCEEDED(hr) && !(f & D3DLOCK_READONLY) && !level) { D3DSURFACE_DESC d; if (SUCCEEDED(t->GetLevelDesc(0, &d))) TexLocked(t, level, lr, r, d.Width, d.Height, d.Format); }
 return hr;
}
static HRESULT WINAPI HTexUnlock(IDirect3DTexture9 *t, UINT level) { TexUnlocking(t, level); return ORIG(HRESULT(WINAPI *)(IDirect3DTexture9 *, UINT), t, 20)(t, level); }
static HRESULT WINAPI HSurfLock(IDirect3DSurface9 *s, D3DLOCKED_RECT *lr, const RECT *r, DWORD f) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DSurface9 *, D3DLOCKED_RECT *, const RECT *, DWORD), s, 13)(s, lr, r, f);
 if (SUCCEEDED(hr) && !(f & D3DLOCK_READONLY)) { bool wait; { Guard g; wait = Trace.Waiting(); } if (wait) { UINT level; void *owner = SurfOwner(s, level); D3DSURFACE_DESC d; if (SUCCEEDED(s->GetDesc(&d))) TexLocked(owner, level, lr, r, d.Width, d.Height, d.Format); } }
 return hr;
}
static HRESULT WINAPI HSurfUnlock(IDirect3DSurface9 *s) { bool any; { Guard g; any = !TexLocks.empty(); } if (any) { UINT level; void *owner = SurfOwner(s, level); TexUnlocking(owner, level); } return ORIG(HRESULT(WINAPI *)(IDirect3DSurface9 *), s, 14)(s); }
static HRESULT WINAPI HUpdateSurface(IDirect3DDevice9 *d, IDirect3DSurface9 *src, const RECT *sr, IDirect3DSurface9 *dst, const POINT *dp) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, IDirect3DSurface9 *, const RECT *, IDirect3DSurface9 *, const POINT *), d, 30)(d, src, sr, dst, dp);
 if (SUCCEEDED(hr) && src && dst) { bool known; { Guard g; known = !Trace.cells.empty(); } if (known) { UINT l1, l2; void *a = SurfOwner(src, l1), *b = SurfOwner(dst, l2); D3DSURFACE_DESC sd; if (!l1 && !l2 && SUCCEEDED(src->GetDesc(&sd))) { RECT r = sr ? *sr : RECT{ 0, 0, (LONG)sd.Width, (LONG)sd.Height }; Guard g; Trace.Copy(a, b, r.left, r.top, r.right - r.left, r.bottom - r.top, dp ? dp->x : r.left, dp ? dp->y : r.top); } } }
 return hr;
}
static HRESULT WINAPI HUpdateTexture(IDirect3DDevice9 *d, IDirect3DBaseTexture9 *src, IDirect3DBaseTexture9 *dst) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, IDirect3DBaseTexture9 *, IDirect3DBaseTexture9 *), d, 31)(d, src, dst);
 if (SUCCEEDED(hr) && src && dst) { Guard g; Trace.Copy(src, dst, 0, 0, 1 << 15, 1 << 15, 0, 0); }
 return hr;
}
static HRESULT WINAPI HStretchRect(IDirect3DDevice9 *d, IDirect3DSurface9 *src, const RECT *sr, IDirect3DSurface9 *dst, const RECT *dr, D3DTEXTUREFILTERTYPE f) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(IDirect3DDevice9 *, IDirect3DSurface9 *, const RECT *, IDirect3DSurface9 *, const RECT *, D3DTEXTUREFILTERTYPE), d, 34)(d, src, sr, dst, dr, f);
 if (SUCCEEDED(hr) && src && dst) { bool known; { Guard g; known = !Trace.cells.empty(); } if (known) { UINT l1, l2; void *a = SurfOwner(src, l1), *b = SurfOwner(dst, l2); D3DSURFACE_DESC sd; if (!l1 && !l2 && SUCCEEDED(src->GetDesc(&sd))) { RECT r = sr ? *sr : RECT{ 0, 0, (LONG)sd.Width, (LONG)sd.Height }, o = dr ? *dr : r; if (o.right - o.left == r.right - r.left && o.bottom - o.top == r.bottom - r.top) { Guard g; Trace.Copy(a, b, r.left, r.top, r.right - r.left, r.bottom - r.top, o.left, o.top); } } } }
 return hr;
}
// ------------------------------------------------------------------------------------------ glyph trace: GetGlyphOutline
typedef DWORD(WINAPI *GgoF)(HDC, UINT, UINT, LPGLYPHMETRICS, DWORD, LPVOID, const MAT2 *);
static GgoF OGgoW, OGgoA;
static void GgoSeen(HDC dc, uint32_t u, UINT fmt, const GLYPHMETRICS *gm, DWORD cb, const void *buf, DWORD r) {
 if (r == GDI_ERROR || !r || !cb || !buf || !gm) return; UINT f = fmt & 0x0F; if (f != GGO_BITMAP && f != GGO_GRAY2_BITMAP && f != GGO_GRAY4_BITMAP && f != GGO_GRAY8_BITMAP) return;
 if (fmt & GGO_GLYPH_INDEX) u = 0; std::vector<uint8_t> cov; if (!GtCoverage(f, (const unsigned char *)buf, (std::min)((unsigned)cb, (unsigned)r), (int)gm->gmBlackBoxX, (int)gm->gmBlackBoxY, cov)) return;
 TEXTMETRICW tm = {}; GetTextMetricsW(dc, &tm); Guard g; Trace.Glyph(u, (int)gm->gmBlackBoxX, (int)gm->gmBlackBoxY, (int)(std::max)(tm.tmHeight, (LONG)gm->gmCellIncX), cov.data(), GetTickCount());
}
static DWORD WINAPI HGgoW(HDC dc, UINT ch, UINT fmt, LPGLYPHMETRICS gm, DWORD cb, LPVOID buf, const MAT2 *m) { DWORD r = OGgoW(dc, ch, fmt, gm, cb, buf, m); GgoSeen(dc, ch, fmt, gm, cb, buf, r); return r; }
static DWORD WINAPI HGgoA(HDC dc, UINT ch, UINT fmt, LPGLYPHMETRICS gm, DWORD cb, LPVOID buf, const MAT2 *m) {
 DWORD r = OGgoA(dc, ch, fmt, gm, cb, buf, m); if (r == GDI_ERROR || !cb || !buf) return r;
 uint32_t u = ch; if (!(fmt & GGO_GLYPH_INDEX) && ch > 0x7F) { char mb[2]; int n = 0; if (ch > 0xFF) mb[n++] = (char)(ch >> 8); mb[n++] = (char)ch; CHARSETINFO ci = {}; UINT cp = TranslateCharsetInfo((DWORD *)(UINT_PTR)GetTextCharset(dc), &ci, TCI_SRCCHARSET) ? ci.ciACP : CP_ACP; wchar_t w[2] = {}; if (MultiByteToWideChar(cp, 0, mb, n, w, 2) == 1) u = w[0]; }
 GgoSeen(dc, u, fmt, gm, cb, buf, r); return r;
}
static HRESULT WINAPI HBufLock(void *buf, UINT off, UINT size, void **pp, DWORD flags) {
 HRESULT hr = ORIG(HRESULT(WINAPI *)(void *, UINT, UINT, void **, DWORD), buf, 11)(buf, off, size, pp, flags);
 if (SUCCEEDED(hr) && pp && *pp && !(flags & D3DLOCK_READONLY)) { Guard g; for (auto &p : Pending) if (p.buf == buf) { p = PendingLock{ buf, off, size, *pp }; return hr; } if (Pending.size() < 64) Pending.push_back(PendingLock{ buf, off, size, *pp }); }
 return hr;
}
static bool SafeCopy(void *to, const void *from, size_t n) { __try { memcpy(to, from, n); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; } }
static void Unlocked(void *buf, bool index) {
 /* the buffer's description is asked before Lock is taken (no D3D call under Lock, see ProbeTexture) */
 bool pending = false; { Guard g; for (auto &x : Pending) if (x.buf == buf) { pending = true; break; } } if (!pending) return;
 UINT total = 0; bool i32 = false;
 if (index) { D3DINDEXBUFFER_DESC dd; if (FAILED(((IDirect3DIndexBuffer9 *)buf)->GetDesc(&dd))) return; total = dd.Size; i32 = dd.Format == D3DFMT_INDEX32; }
 else { D3DVERTEXBUFFER_DESC dd; if (FAILED(((IDirect3DVertexBuffer9 *)buf)->GetDesc(&dd))) return; total = dd.Size; }
 Guard g; for (size_t i = 0; i < Pending.size(); i++) if (Pending[i].buf == buf) {
  PendingLock p = Pending[i]; Pending.erase(Pending.begin() + i);
  if (total == 0 || total > 8 * 1024 * 1024) return; UINT size = p.size ? p.size : total - p.off; if (p.off >= total) return; if (p.off + size > total) size = total - p.off;
  Shadow &s = Buffers[buf]; if (s.data.size() != total) s.data.assign(total, 0); s.i32 = i32;
  if (!SafeCopy(&s.data[p.off], p.ptr, size)) Buffers.erase(buf);
  if (Buffers.size() > 4096) Buffers.clear(); return; }
}
static HRESULT WINAPI HVbUnlock(void *buf) { auto o = ORIG(HRESULT(WINAPI *)(void *), buf, 12); Unlocked(buf, false); return o(buf); }
static HRESULT WINAPI HIbUnlock(void *buf) { auto o = ORIG(HRESULT(WINAPI *)(void *), buf, 12); Unlocked(buf, true); return o(buf); }

#include "LittlecheeseGdi.h"
#include "Sact2Draw.h"

// ------------------------------------------------------------------------------------------------------------- GDI blits
// Software engines that keep their font sheet in a bitmap and copy one glyph cell per character into a back-buffer
// bitmap (or straight into the window): BitBlt / StretchBlt / TransparentBlt / AlphaBlend from a memory DC, or
// StretchDIBits / SetDIBitsToDevice from a DIB in memory. The source bitmap is the "texture", the destination bitmap
// the "render target" (the window = the back buffer); a back-buffer bitmap copied to the window maps its glyphs to the
// screen. A dropped blit is simply not made (the call reports success).
static volatile LONG GdiSeen; static unsigned GdiW, GdiH;
static bool BitmapOf(HDC dc, void *&key, unsigned &w, unsigned &h) {
 HGDIOBJ b = GetCurrentObject(dc, OBJ_BITMAP); BITMAP bm; if (!b || GetObjectW(b, sizeof bm, &bm) != sizeof bm) return false; key = b; w = bm.bmWidth; h = bm.bmHeight < 0 ? -bm.bmHeight : bm.bmHeight; return w > 1 && h > 1;
}
static void *TargetOf(HDC dc, unsigned &w, unsigned &h) {
 HWND win = WindowFromDC(dc); if (win) { RECT r; GetClientRect(win, &r); w = r.right; h = r.bottom; GdiW = w; GdiH = h; return NULL; }
 void *k; if (!BitmapOf(dc, k, w, h)) { w = h = 0; return (void *)-1; } return k;
}
// One blit as a quad; returns true when it should be left out.
static bool GdiBlit(HDC dst, int x, int y, int w, int h, void *src, unsigned sw, unsigned sh, int sx, int sy, int sW, int sH) {
 if (w <= 0 || h <= 0 || !src || sw < 64 || sh < 64) return false;
 unsigned tw, th; void *rt = TargetOf(dst, tw, th); if (rt == (void *)-1) return false;
 POINT o = { 0, 0 }; if (!rt) GetViewportOrgEx(dst, &o);
 std::vector<Quad> q(1); Quad &x0 = q[0]; x0.x0 = (float)x + o.x; x0.y0 = (float)y + o.y; x0.x1 = x0.x0 + w; x0.y1 = x0.y0 + h; x0.u0 = (float)sx / sw; x0.v0 = (float)sy / sh; x0.u1 = (float)(sx + sW) / sw; x0.v1 = (float)(sy + sH) / sh; x0.first = 0;
 InterlockedExchange(&GdiSeen, 1);
 Guard g;
 if (!rt) { auto it = Textures.find(src); if (it != Textures.end() && it->second.rt) { Learner.Composite(src, q); return false; } }
 if (rt) { TexInfo ti = { tw, th, D3DFMT_UNKNOWN, true }; Textures[rt] = ti; }
 if (Diag && GlyphLike(x0, sw, sh)) Log("GDI blit dst=%p(%ux%u) src=%p(%ux%u) [%d,%d %dx%d from %d,%d %dx%d]", rt, tw, th, src, sw, sh, x, y, w, h, sx, sy, sW, sH);
#ifdef _M_IX86
 if (LittlecheeseMode) return false; // dialogue pixels are already handled before the bitmap is blitted
#endif
 std::vector<int> drop = Learner.Draw(src, sw, sh, rt, tw, th, rt ? GdiW : tw, rt ? GdiH : th, q, GetTickCount());
 return !drop.empty();
}
typedef BOOL(WINAPI *BitBltF)(HDC, int, int, int, int, HDC, int, int, DWORD);
typedef BOOL(WINAPI *StretchBltF)(HDC, int, int, int, int, HDC, int, int, int, int, DWORD);
typedef BOOL(WINAPI *TransparentBltF)(HDC, int, int, int, int, HDC, int, int, int, int, UINT);
typedef BOOL(WINAPI *AlphaBlendF)(HDC, int, int, int, int, HDC, int, int, int, int, BLENDFUNCTION);
typedef int(WINAPI *StretchDIBitsF)(HDC, int, int, int, int, int, int, int, int, const void *, const BITMAPINFO *, UINT, DWORD);
typedef int(WINAPI *SetDIBitsToDeviceF)(HDC, int, int, DWORD, DWORD, int, int, UINT, UINT, const void *, const BITMAPINFO *, UINT);
static BitBltF OBitBlt; static StretchBltF OStretchBlt; static TransparentBltF OTransparentBlt; static AlphaBlendF OAlphaBlend; static StretchDIBitsF OStretchDIBits; static SetDIBitsToDeviceF OSetDIBitsToDevice;
static bool SrcBlit(HDC dst, int x, int y, int w, int h, HDC src, int sx, int sy, int sW, int sH) { void *k; unsigned sw, sh; if (!src || !BitmapOf(src, k, sw, sh)) return false; return GdiBlit(dst, x, y, w, h, k, sw, sh, sx, sy, sW, sH); }
static bool SrcRop(DWORD rop) { return rop == SRCCOPY || rop == SRCPAINT || rop == SRCAND || rop == SRCINVERT; }
static BOOL WINAPI HBitBlt(HDC d, int x, int y, int w, int h, HDC s, int sx, int sy, DWORD rop) { if (SrcRop(rop) && SrcBlit(d, x, y, w, h, s, sx, sy, w, h)) return TRUE; return OBitBlt(d, x, y, w, h, s, sx, sy, rop); }
static BOOL WINAPI HStretchBlt(HDC d, int x, int y, int w, int h, HDC s, int sx, int sy, int sw, int sh, DWORD rop) { if (SrcRop(rop) && SrcBlit(d, x, y, w, h, s, sx, sy, sw, sh)) return TRUE; return OStretchBlt(d, x, y, w, h, s, sx, sy, sw, sh, rop); }
static BOOL WINAPI HTransparentBlt(HDC d, int x, int y, int w, int h, HDC s, int sx, int sy, int sw, int sh, UINT key) { if (SrcBlit(d, x, y, w, h, s, sx, sy, sw, sh)) return TRUE; return OTransparentBlt(d, x, y, w, h, s, sx, sy, sw, sh, key); }
static BOOL WINAPI HAlphaBlend(HDC d, int x, int y, int w, int h, HDC s, int sx, int sy, int sw, int sh, BLENDFUNCTION f) { if (SrcBlit(d, x, y, w, h, s, sx, sy, sw, sh)) return TRUE; return OAlphaBlend(d, x, y, w, h, s, sx, sy, sw, sh, f); }
static unsigned DibH(const BITMAPINFO *b) { return b ? (unsigned)(b->bmiHeader.biHeight < 0 ? -b->bmiHeader.biHeight : b->bmiHeader.biHeight) : 0; }
static int WINAPI HStretchDIBits(HDC d, int x, int y, int w, int h, int sx, int sy, int sw, int sh, const void *bits, const BITMAPINFO *b, UINT u, DWORD rop) {
 if (b && bits && SrcRop(rop)) { unsigned bh = DibH(b); int top = b->bmiHeader.biHeight > 0 ? (int)bh - sy - sh : sy; if (GdiBlit(d, x, y, w, h, (void *)bits, (unsigned)b->bmiHeader.biWidth, bh, sx, top, sw, sh)) return sh; }
 return OStretchDIBits(d, x, y, w, h, sx, sy, sw, sh, bits, b, u, rop);
}
static int WINAPI HSetDIBitsToDevice(HDC d, int x, int y, DWORD w, DWORD h, int sx, int sy, UINT start, UINT lines, const void *bits, const BITMAPINFO *b, UINT u) {
 if (b && bits && start == 0 && lines >= DibH(b)) { unsigned bh = DibH(b); int top = b->bmiHeader.biHeight > 0 ? (int)bh - sy - (int)h : sy; if (GdiBlit(d, x, y, (int)w, (int)h, (void *)bits, (unsigned)b->bmiHeader.biWidth, bh, sx, top, (int)w, (int)h)) return (int)lines; }
 return OSetDIBitsToDevice(d, x, y, w, h, sx, sy, start, lines, bits, b, u);
}
static int InstallGdi() {
 int n = 0; HMODULE g = GetModuleHandleW(L"gdi32.dll"); if (!g) return 0;
 auto h = [&](const char *name, void *hook, void **orig) { void *t = GetProcAddress(g, name); if (t && MH_CreateHook(t, hook, orig) == MH_OK && MH_QueueEnableHook(t) == MH_OK) n++; };
 h("BitBlt", (void *)HBitBlt, (void **)&OBitBlt); h("StretchBlt", (void *)HStretchBlt, (void **)&OStretchBlt); h("GdiTransparentBlt", (void *)HTransparentBlt, (void **)&OTransparentBlt); h("GdiAlphaBlend", (void *)HAlphaBlend, (void **)&OAlphaBlend);
 h("StretchDIBits", (void *)HStretchDIBits, (void **)&OStretchDIBits); h("SetDIBitsToDevice", (void *)HSetDIBitsToDevice, (void **)&OSetDIBitsToDevice);
 { int before = n; h("GetGlyphOutlineW", (void *)HGgoW, (void **)&OGgoW); h("GetGlyphOutlineA", (void *)HGgoA, (void **)&OGgoA); Log("glyph trace: GetGlyphOutline hooks=%d", n - before); n = before; }
 return Apply() ? n : 0;
}
// GDI engines have no Present: a frame is whatever was drawn in the last 33 ms.
static DWORD WINAPI GdiTicker(void *) { while (!Quit) { Sleep(33); if (!GdiSeen) continue; unsigned now = GetTickCount(); Guard g; if (now - LastPresent > 300) FramesTick(now, GdiW, GdiH); } return 0; }
// ------------------------------------------------------------------------------------------------------------- install
static void HookDevice(IDirect3DDevice9 *dev) {
   void **vt = *(void ***)dev;
   Hook<16>(vt[16], HReset); Hook<17>(vt[17], HPresent); Hook<37>(vt[37], HSetRenderTarget); Hook<44>(vt[44], HSetTransform); Hook<47>(vt[47], HSetViewport);
   Hook<65>(vt[65], HSetTexture); Hook<81>(vt[81], HDrawPrimitive); Hook<82>(vt[82], HDrawIndexedPrimitive); Hook<83>(vt[83], HDrawPrimitiveUP); Hook<84>(vt[84], HDrawIndexedPrimitiveUP);
   { IDirect3DSwapChain9 *sc = NULL; if (SUCCEEDED(dev->GetSwapChain(0, &sc)) && sc) { Hook<703>((*(void ***)sc)[3], HSwapPresent); sc->Release(); } }
   Hook<87>(vt[87], HSetVertexDeclaration); Hook<89>(vt[89], HSetFVF); Hook<92>(vt[92], HSetVertexShader); Hook<94>(vt[94], HSetVSConstF); Hook<100>(vt[100], HSetStreamSource); Hook<104>(vt[104], HSetIndices);
   Hook<30>(vt[30], HUpdateSurface); Hook<31>(vt[31], HUpdateTexture); Hook<34>(vt[34], HStretchRect);
   { struct { UINT usage; D3DPOOL pool; D3DFORMAT fmt; } tk[] = { { 0, D3DPOOL_MANAGED, D3DFMT_A8R8G8B8 }, { 0, D3DPOOL_SYSTEMMEM, D3DFMT_A8R8G8B8 }, { D3DUSAGE_DYNAMIC, D3DPOOL_DEFAULT, D3DFMT_A8R8G8B8 }, { 0, D3DPOOL_MANAGED, D3DFMT_A8 } };
     for (auto &k : tk) { IDirect3DTexture9 *t = NULL; if (SUCCEEDED(dev->CreateTexture(16, 16, 1, k.usage, k.fmt, k.pool, &t, NULL)) && t) { void **tv = *(void ***)t; Hook<519>(tv[19], HTexLock); Hook<520>(tv[20], HTexUnlock);
      IDirect3DSurface9 *sf = NULL; if (SUCCEEDED(t->GetSurfaceLevel(0, &sf)) && sf) { void **sv = *(void ***)sf; Hook<613>(sv[13], HSurfLock); Hook<614>(sv[14], HSurfUnlock); sf->Release(); } t->Release(); } }
     IDirect3DSurface9 *op = NULL; if (SUCCEEDED(dev->CreateOffscreenPlainSurface(16, 16, D3DFMT_A8R8G8B8, D3DPOOL_SYSTEMMEM, &op, NULL)) && op) { void **sv = *(void ***)op; Hook<613>(sv[13], HSurfLock); Hook<614>(sv[14], HSurfUnlock); op->Release(); } }
   struct { UINT usage; D3DPOOL pool; } kinds[] = { { D3DUSAGE_DYNAMIC | D3DUSAGE_WRITEONLY, D3DPOOL_DEFAULT }, { D3DUSAGE_WRITEONLY, D3DPOOL_DEFAULT }, { 0, D3DPOOL_MANAGED }, { 0, D3DPOOL_SYSTEMMEM }, { D3DUSAGE_DYNAMIC, D3DPOOL_DEFAULT } };
   for (auto &k : kinds) {
    IDirect3DVertexBuffer9 *vb = NULL; if (SUCCEEDED(dev->CreateVertexBuffer(96, k.usage, D3DFVF_XYZRHW | D3DFVF_TEX1, k.pool, &vb, NULL)) && vb) { void **bt = *(void ***)vb; Hook<211>(bt[11], HBufLock); Hook<212>(bt[12], HVbUnlock); vb->Release(); }
    IDirect3DIndexBuffer9 *ib = NULL; if (SUCCEEDED(dev->CreateIndexBuffer(96, k.usage, D3DFMT_INDEX16, k.pool, &ib, NULL)) && ib) { void **bt = *(void ***)ib; Hook<311>(bt[11], HBufLock); Hook<312>(bt[12], HIbUnlock); ib->Release(); }
   }
}
static LRESULT CALLBACK DummyProc(HWND h, UINT m, WPARAM w, LPARAM l) { return DefWindowProcW(h, m, w, l); }
static int Install(HMODULE d3d9) {
 typedef IDirect3D9 *(WINAPI *Create9)(UINT); Create9 create = (Create9)GetProcAddress(d3d9, "Direct3DCreate9"); if (!create) return 0;
 WNDCLASSW wc = {}; wc.lpfnWndProc = DummyProc; wc.hInstance = GetModuleHandleW(NULL); wc.lpszClassName = L"MeguLitGpuDummy"; RegisterClassW(&wc);
 HWND w = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, wc.lpszClassName, L"", WS_POPUP, -32000, -32000, 8, 8, NULL, NULL, wc.hInstance, NULL); if (!w) return 0;
 IDirect3D9 *d = create(D3D_SDK_VERSION); int devices = 0;
 if (d) {
  // Software, hardware, pure and mixed vertex processing, each with and without D3DCREATE_MULTITHREADED, use their own
  // device classes (the multithreaded ones wrap every call in a lock).
  DWORD flagsList[] = { D3DCREATE_SOFTWARE_VERTEXPROCESSING, D3DCREATE_HARDWARE_VERTEXPROCESSING, D3DCREATE_HARDWARE_VERTEXPROCESSING | D3DCREATE_PUREDEVICE, D3DCREATE_MIXED_VERTEXPROCESSING };
  for (int mt = 0; mt < 2; mt++) for (DWORD flags : flagsList) {
   D3DPRESENT_PARAMETERS pp = {}; pp.Windowed = TRUE; pp.SwapEffect = D3DSWAPEFFECT_DISCARD; pp.hDeviceWindow = w; pp.BackBufferWidth = 8; pp.BackBufferHeight = 8; pp.BackBufferFormat = D3DFMT_UNKNOWN;
   IDirect3DDevice9 *dev = NULL; if (FAILED(d->CreateDevice(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, w, flags | (mt ? D3DCREATE_MULTITHREADED : 0), &pp, &dev)) || !dev) continue;
   devices++; HookDevice(dev);
   dev->Release();
  }
  d->Release();
 }
 // Direct3D 9Ex: its own device classes (and PresentEx)
 typedef HRESULT(WINAPI *Create9Ex)(UINT, IDirect3D9Ex **); Create9Ex createEx = (Create9Ex)GetProcAddress(d3d9, "Direct3DCreate9Ex"); IDirect3D9Ex *dx = NULL;
 if (createEx && SUCCEEDED(createEx(D3D_SDK_VERSION, &dx)) && dx) {
  for (int mt = 0; mt < 2; mt++) for (DWORD flags : { (DWORD)D3DCREATE_HARDWARE_VERTEXPROCESSING, (DWORD)D3DCREATE_SOFTWARE_VERTEXPROCESSING }) {
   D3DPRESENT_PARAMETERS pp = {}; pp.Windowed = TRUE; pp.SwapEffect = D3DSWAPEFFECT_DISCARD; pp.hDeviceWindow = w; pp.BackBufferWidth = 8; pp.BackBufferHeight = 8; pp.BackBufferFormat = D3DFMT_UNKNOWN;
   IDirect3DDevice9Ex *dev = NULL; if (FAILED(dx->CreateDeviceEx(D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, w, flags | (mt ? D3DCREATE_MULTITHREADED : 0), &pp, NULL, &dev)) || !dev) continue;
   devices++; HookDevice(dev); Hook<121>((*(void ***)dev)[121], HPresentEx); dev->Release();
  }
  dx->Release();
 }
 DestroyWindow(w); UnregisterClassW(wc.lpszClassName, wc.hInstance);
 if (!Apply()) HookCount = 0;
 return devices;
}

#include "GpuHide11.h"
#include "GpuHideGL.h"

// --------------------------------------------------------------------------------------------------------------- pipes
static DWORD WINAPI Sender(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitGpu-%lu", GetCurrentProcessId()); HANDLE pipe = INVALID_HANDLE_VALUE;
 while (!Quit) {
  WaitForSingleObject(OutEvent, 1000);
  if (pipe == INVALID_HANDLE_VALUE) {
   pipe = CreateFileW(name, GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
   if (pipe == INVALID_HANDLE_VALUE) continue;
   Send("ToMe_GPUHIDE ready version=1 apis=d3d9,d3d11,opengl,gdi");
#ifdef _M_IX86
   if (InterlockedCompareExchange(&Sact2Installed, 0, 0)) Send("ToMe_GPUHIDE status sact2 dialogue");
#endif
  }
  for (;;) { std::string s; { Guard g; if (Outbox.empty()) break; s = Outbox.front(); Outbox.pop_front(); } s += "\n"; DWORD done; if (!WriteFile(pipe, s.data(), (DWORD)s.size(), &done, NULL)) { CloseHandle(pipe); pipe = INVALID_HANDLE_VALUE; break; } }
 }
 return 0;
}
static void Command(const std::string &line) {
 Log("CTL %s", line.c_str());
#ifdef _M_IX86
 if (line.size() == 7 && line.compare(0, 6, "LCGDI ") == 0 && line[6] >= '0' && line[6] <= '2') { Guard g; LittlecheeseSetMode(line[6] - '0'); return; }
 if (line.size() == 7 && line.compare(0, 6, "SACT2 ") == 0 && line[6] >= '0' && line[6] <= '3') {
  Guard g;
  if (!Sact2Installed) return;
  InterlockedIncrement(&Sact2Epoch);
  InterlockedExchange(&Sact2Mode, line[6] - '0');
  Learner.Off(); Trace.Off();
  return;
 }
#endif
 if (line.compare(0, 5, "LINE ") == 0) {
  int n = MultiByteToWideChar(CP_UTF8, 0, line.data() + 5, (int)line.size() - 5, NULL, 0);
  if (n <= 0) return;
  std::wstring w(n, 0);
  MultiByteToWideChar(CP_UTF8, 0, line.data() + 5, (int)line.size() - 5, &w[0], n);
  Guard g; unsigned now = GetTickCount();
#ifdef _M_IX86
  if (LittlecheeseLine(w, now)) return;
  if (Sact2Mode) return;
#endif
  Learner.Line(w, now); Trace.Line(Learner.seq, now);
 }
 else if (line == "OFF") {
  Guard g;
#ifdef _M_IX86
  if (LittlecheeseMode == 2) { LittlecheeseSetMode(1); return; }
#endif
  Learner.Off(); Trace.Off();
 }
 else if (line.compare(0, 7, "PRESET ") == 0) { float gh = 0; unsigned w = 0, h = 0; if (sscanf_s(line.c_str() + 7, "%f %u %u", &gh, &w, &h) == 3) { Guard g; Learner.Preset(gh, w, h); if (line.size() > 2 && line.compare(line.size() - 2, 2, " b") == 0) Learner.pageBlankQuads = true; } }
 else if (line == "MODE read") { Guard g; Learner.readOnly = true; } else if (line == "MODE hide") { Guard g; Learner.readOnly = false; }
}
static DWORD WINAPI Control(void *) {
 wchar_t name[64]; swprintf_s(name, L"\\\\.\\pipe\\MeguLitGpuCtl-%lu", GetCurrentProcessId());
 while (!Quit) {
  HANDLE p = CreateFileW(name, GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL); if (p == INVALID_HANDLE_VALUE) { Sleep(1000); continue; }
  std::string buf; char b[4096]; DWORD got;
  while (ReadFile(p, b, sizeof b, &got, NULL) && got) { buf.append(b, got); size_t at; while ((at = buf.find('\n')) != std::string::npos) { std::string l = buf.substr(0, at); buf.erase(0, at + 1); if (!l.empty() && l.back() == '\r') l.pop_back(); if (l == "QUIT") { Command("LCGDI 0"); Command("SACT2 0"); CloseHandle(p); return 0; } Command(l); } }
  CloseHandle(p);
  { Guard g; Learner.Off(); Trace.Off();
#ifdef _M_IX86
   LittlecheeseSetMode(0);
   InterlockedExchange(&Sact2Mode, 0);
#endif
  } // MeguLit gone: stop hiding at once
 }
 return 0;
}
static void Emit(const std::string &s) { Send(s); }
// The system copy of a DLL only. A game may ship its own d3d9.dll (a wrapper next to the program that keeps the game's
// device in globals); creating throwaway devices through it corrupted that state (WHITE ALBUM2 crashed at the first
// scene). The wrapper ends in the system DLL, so hooking the system functions still sees every draw.
static HMODULE SystemModule(const wchar_t *name) { wchar_t path[MAX_PATH]; UINT n = GetSystemDirectoryW(path, MAX_PATH); if (!n || n > MAX_PATH - 20) return NULL; swprintf_s(path + n, MAX_PATH - n, L"\\%s", name); return GetModuleHandleW(path); }
#include "FontDots.h"

static DWORD WINAPI Start(void *module) {
 wchar_t path[MAX_PATH]; GetModuleFileNameW((HMODULE)module, path, MAX_PATH); wchar_t *slash = wcsrchr(path, L'\\'); if (slash) wcscpy_s(slash + 1, MAX_PATH - (slash + 1 - path), L"MeguLitGpu.diag");
 FILE *f = NULL; if (_wfopen_s(&f, path, L"r, ccs=UTF-8") == 0 && f) { wchar_t log[MAX_PATH] = {}; if (fgetws(log, MAX_PATH, f)) { size_t n = wcslen(log); while (n && (log[n - 1] == L'\n' || log[n - 1] == L'\r' || log[n - 1] == L' ')) log[--n] = 0; wchar_t full[MAX_PATH]; swprintf_s(full, L"%s.%lu.log", log, GetCurrentProcessId()); Diag = _wfsopen(full, L"w", _SH_DENYNO); } fclose(f); }
 Learner.emit = Emit; Learner.log = Diag ? Log : NULL; Trace.emit = Emit; Trace.log = Diag ? Log : NULL;
 CreateThread(NULL, 0, Sender, NULL, 0, NULL); CreateThread(NULL, 0, Control, NULL, 0, NULL);
 MH_Initialize();
 // Font dots at the source (FontDots.h): only with MEGULIT_FONT_DOTS=1 from the launcher that injects this DLL before the
 // game's main thread runs; the launcher resumes the game once MeguLitFontReady-<pid> is set.
 { wchar_t v[8] = {}; if (GetEnvironmentVariableW(L"MEGULIT_FONT_DOTS", v, 8) && v[0] == L'1') { int n = InstallFontDots(); FontDotsOn = n == 8; Log("installed font dots hooks=%d", n); Send(FontDotsOn ? "ToMe_FONTDOTS ready version=1" : "ToMe_FONTDOTS status hooks failed"); }
   wchar_t ev[64]; swprintf_s(ev, L"MeguLitFontReady-%lu", GetCurrentProcessId()); HANDLE e = OpenEventW(EVENT_MODIFY_STATE, FALSE, ev); if (e) { SetEvent(e); CloseHandle(e); } }
#ifdef _M_IX86
 const bool littlecheese = InstallLittlecheeseDraw();
 const bool sact2 = InstallSact2Draw();
#endif
 int gdi = InstallGdi();
#ifdef _M_IX86
 if (littlecheese && gdi) Send("ToMe_GPUHIDE status littlecheese dialogue");
 if (sact2 && gdi) { InterlockedExchange(&Sact2Installed, 1); Send("ToMe_GPUHIDE status sact2 dialogue"); }
#endif
 CreateThread(NULL, 0, GdiTicker, NULL, 0, NULL); Log("installed gdi hooks=%d", gdi); Send("ToMe_GPUHIDE status gdi hooked=" + std::to_string(gdi));
 // Wait for the system's d3d9.dll / d3d11.dll (games often load them after their first window), then hook each once.
 bool d9 = false, d11 = false, ogl = false;
 for (int i = 0; i < 600 && !Quit && !(d9 && d11 && ogl); i++) {
  HMODULE o = SystemModule(L"opengl32.dll"); if (o && !ogl) { ogl = true; int n = InstallGL(o); Log("installed opengl hooks=%d", n); Send(n >= 3 ? "ToMe_GPUHIDE status opengl hooked" : "ToMe_GPUHIDE status opengl no hooks"); }
  HMODULE d = SystemModule(L"d3d9.dll"); if (d && !d9) { d9 = true; int n = Install(d); n = n && HookCount >= 15 ? n : 0; Log("installed d3d9 devices=%d hooks=%d", n, HookCount); Send(std::string(n ? "ToMe_GPUHIDE status d3d9 hooked gdi=" : "ToMe_GPUHIDE status d3d9 no device gdi=") + std::to_string(gdi)); }
  HMODULE e = SystemModule(L"d3d11.dll"); if (e && !d11) { d11 = true; int before = HookCount, n = Install11(e); Log("installed d3d11 devices=%d hooks=%d", n, HookCount - before); Send(n && HookCount - before >= 7 ? "ToMe_GPUHIDE status d3d11 hooked" : "ToMe_GPUHIDE status d3d11 no device"); }
  Sleep(500); }
 if (!d9 && !d11 && !ogl) Send("ToMe_GPUHIDE status no d3d gdi=" + std::to_string(gdi));
 return 0;
}
BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, void *) {
 if (reason == DLL_PROCESS_ATTACH) {
  DisableThreadLibraryCalls(h); HMODULE pin; GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN, (LPCWSTR)&DllMain, &pin);
  InitializeCriticalSection(&Lock); OutEvent = CreateEventW(NULL, FALSE, FALSE, NULL); CreateThread(NULL, 0, Start, h, 0, NULL);
 }
 return TRUE;
}
// Marker for tools/native-stale.cjs: MeguLitGpu version=1 (font dots: ToMe_FONTDOTS)
extern "C" __declspec(dllexport) const char *MeguLitGpuVersion() { return "MeguLitGpu version=1"; }
