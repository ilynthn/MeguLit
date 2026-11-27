// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitWgcShot.exe — one picture of a window's client area with Windows.Graphics.Capture (WGC).
//
// WGC reads the window's own surface from DWM, so the picture is the game's even when other windows cover it, when it is
// in the background or not topmost, and for Direct3D games (where BitBlt and PrintWindow often give black). Tests and
// adaptation runs use it so that a game whose picture is all they need can run without the foreground.
//
// When WGC cannot be used (Windows older than 1903 / no WGC, the window minimised, the capture item or the first frame
// failing) it falls back to the picture MeguLit's cold test takes today: PrintWindow(PW_CLIENTONLY | PW_RENDERFULLCONTENT).
// The result line always says which method gave the picture and why it fell back.
//
// The WGC item creation (with the WS_EX_APPWINDOW retry for windows outside the Alt+Tab list), the D3D11 device for WGC
// and the client box inside the captured frame follow native/compositor/Compositor.cpp, which takes them from Magpie
// v0.13 (https://github.com/Blinue/Magpie, GPL-3.0; see THIRD-PARTY.md).
//
// Usage: MeguLitWgcShot.exe (--hwnd <n|0xhex> | --pid <n>) --out <file.png> [--method auto|wgc|print] [--timeout-ms 3000]
//        MeguLitWgcShot.exe --selftest [--onscreen]
// stdout: one JSON line {"ok":..,"method":"wgc"|"printwindow","fallback":null|"<why>","w":..,"h":..,"blank":..,"mean":[b,g,r]}
// Exit: 0 picture written, 1 no picture, 2 bad arguments, 3 self-test failed.
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dwmapi.h>
#include <d3d11_4.h>
#include <dxgi1_2.h>
#include <wincodec.h>
#include <unknwn.h>
#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Metadata.h>
#include <winrt/Windows.Graphics.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <chrono>
#include <cstdio>
#include <string>
#include <vector>

using winrt::com_ptr;
namespace wgc = winrt::Windows::Graphics::Capture;
namespace wdx = winrt::Windows::Graphics::DirectX;
namespace wd3d = winrt::Windows::Graphics::DirectX::Direct3D11;
static const char Marker[] = "MeguLitWgcShot version=1";

static std::string Utf8(const std::wstring &w) { if (w.empty()) return {}; int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), int(w.size()), nullptr, 0, nullptr, nullptr); std::string s(n, 0); WideCharToMultiByte(CP_UTF8, 0, w.data(), int(w.size()), s.data(), n, nullptr, nullptr); return s; }
static std::string Esc(const std::string &s) { std::string o; for (char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else if (unsigned(c) < 0x20) o += ' '; else o += c; } return o; }

struct Picture { int w = 0, h = 0; std::vector<uint8_t> bgra; };
struct Result { bool ok = false; std::string method, fallback, error; Picture pic; };

// ---------------------------------------------------------------- the picture: stats and PNG
static void Stats(const Picture &p, bool &blank, double mean[3]) {
  double s[3] = { 0, 0, 0 }; size_t n = 0; int bright = 0;
  for (int y = 0; y < p.h; y += 2) for (int x = 0; x < p.w; x += 2) {
    const uint8_t *q = &p.bgra[(size_t(y) * p.w + x) * 4]; s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; ++n;
    if (q[0] > 16 || q[1] > 16 || q[2] > 16) ++bright;
  }
  for (int i = 0; i < 3; ++i) mean[i] = n ? s[i] / n : 0;
  blank = n == 0 || bright * 200 < int(n); // under 0.5 % of the samples not black
}

static bool SavePng(const Picture &p, const std::wstring &path, std::string &err) {
  com_ptr<IWICImagingFactory> f; com_ptr<IWICStream> st; com_ptr<IWICBitmapEncoder> enc; com_ptr<IWICBitmapFrameEncode> fr;
  if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(f.put())))) { err = "WIC"; return false; }
  if (FAILED(f->CreateStream(st.put())) || FAILED(st->InitializeFromFilename(path.c_str(), GENERIC_WRITE))) { err = "cannot write the file"; return false; }
  if (FAILED(f->CreateEncoder(GUID_ContainerFormatPng, nullptr, enc.put())) || FAILED(enc->Initialize(st.get(), WICBitmapEncoderNoCache))) { err = "PNG encoder"; return false; }
  if (FAILED(enc->CreateNewFrame(fr.put(), nullptr)) || FAILED(fr->Initialize(nullptr))) { err = "PNG frame"; return false; }
  fr->SetSize(p.w, p.h); WICPixelFormatGUID fmt = GUID_WICPixelFormat32bppBGRA; fr->SetPixelFormat(&fmt);
  if (fmt != GUID_WICPixelFormat32bppBGRA) { err = "PNG pixel format"; return false; }
  if (FAILED(fr->WritePixels(p.h, UINT(p.w * 4), UINT(p.bgra.size()), const_cast<BYTE *>(p.bgra.data()))) || FAILED(fr->Commit()) || FAILED(enc->Commit())) { err = "PNG write"; return false; }
  return true;
}

// ---------------------------------------------------------------- the window's client box on screen
static bool ClientOnScreen(HWND w, RECT &c) {
  RECT cr; if (!GetClientRect(w, &cr)) return false; POINT o{ 0, 0 }; ClientToScreen(w, &o);
  c = { o.x, o.y, o.x + cr.right, o.y + cr.bottom }; return c.right - c.left >= 1 && c.bottom - c.top >= 1;
}

// ---------------------------------------------------------------- fallback: what the cold test does today
static bool PrintWindowShot(HWND w, Picture &p, std::string &err) {
  RECT c; if (!ClientOnScreen(w, c)) { err = "no client area"; return false; }
  p.w = c.right - c.left; p.h = c.bottom - c.top; p.bgra.assign(size_t(p.w) * p.h * 4, 0);
  BITMAPINFO bi{}; bi.bmiHeader = { sizeof(BITMAPINFOHEADER), p.w, -p.h, 1, 32, BI_RGB };
  void *bits = nullptr; HDC screen = GetDC(nullptr); HDC dc = CreateCompatibleDC(screen);
  HBITMAP bmp = CreateDIBSection(screen, &bi, DIB_RGB_COLORS, &bits, nullptr, 0); ReleaseDC(nullptr, screen);
  if (!bmp) { DeleteDC(dc); err = "CreateDIBSection"; return false; }
  HGDIOBJ old = SelectObject(dc, bmp);
  const BOOL ok = PrintWindow(w, dc, 3 /* PW_CLIENTONLY | PW_RENDERFULLCONTENT */);
  GdiFlush(); memcpy(p.bgra.data(), bits, p.bgra.size());
  SelectObject(dc, old); DeleteObject(bmp); DeleteDC(dc);
  for (size_t i = 3; i < p.bgra.size(); i += 4) p.bgra[i] = 255;
  if (!ok) { err = "PrintWindow failed"; return false; }
  return true;
}

// ---------------------------------------------------------------- WGC
struct Wgc {
  com_ptr<ID3D11Device> dev; com_ptr<ID3D11DeviceContext> ctx; wd3d::IDirect3DDevice wdev{ nullptr };
  bool Device(std::string &err) {
    const D3D_FEATURE_LEVEL levels[] = { D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_10_0 };
    HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 4, D3D11_SDK_VERSION, dev.put(), nullptr, ctx.put());
    if (FAILED(hr)) hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 4, D3D11_SDK_VERSION, dev.put(), nullptr, ctx.put());
    if (FAILED(hr)) { err = "no D3D11 device"; return false; }
    com_ptr<IDXGIDevice> dxgi = dev.as<IDXGIDevice>(); com_ptr<::IInspectable> insp;
    if (FAILED(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(), insp.put()))) { err = "no WinRT D3D device"; return false; }
    wdev = insp.as<wd3d::IDirect3DDevice>(); return true;
  }

  // pump: called while waiting so windows of this thread (the self-test's) keep painting
  bool Shot(HWND w, DWORD timeoutMs, Picture &p, std::string &err, void (*pump)() = nullptr) {
    bool styleChanged = false; LONG_PTR ex = 0;
    wgc::GraphicsCaptureItem item{ nullptr }; wgc::Direct3D11CaptureFramePool pool{ nullptr }; wgc::GraphicsCaptureSession session{ nullptr };
    HANDLE arrived = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    struct Cleanup { HANDLE e; ~Cleanup() { CloseHandle(e); } } cleanup{ arrived };
    try {
      if (!dev && !Device(err)) return false;
      auto interop = winrt::get_activation_factory<wgc::GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
      HRESULT hr = interop->CreateForWindow(w, winrt::guid_of<wgc::GraphicsCaptureItem>(), winrt::put_abi(item));
      if (FAILED(hr)) { // Magpie: a window outside the Alt+Tab list (e.g. owned by a zero-size window) needs WS_EX_APPWINDOW
        ex = GetWindowLongPtrW(w, GWL_EXSTYLE); SetWindowLongPtrW(w, GWL_EXSTYLE, ex | WS_EX_APPWINDOW); styleChanged = true;
        hr = interop->CreateForWindow(w, winrt::guid_of<wgc::GraphicsCaptureItem>(), winrt::put_abi(item));
      }
      auto restore = [&] { if (styleChanged) SetWindowLongPtrW(w, GWL_EXSTYLE, ex); styleChanged = false; };
      if (FAILED(hr)) { restore(); char b[64]; std::snprintf(b, sizeof b, "CreateForWindow 0x%08lx", hr); err = b; return false; }
      const auto size = item.Size();
      pool = wgc::Direct3D11CaptureFramePool::CreateFreeThreaded(wdev, wdx::DirectXPixelFormat::B8G8R8A8UIntNormalized, 1, size);
      pool.FrameArrived([arrived](auto &&, auto &&) { SetEvent(arrived); });
      session = pool.CreateCaptureSession(item);
      using winrt::Windows::Foundation::Metadata::ApiInformation;
      const auto cls = winrt::name_of<wgc::GraphicsCaptureSession>();
      if (ApiInformation::IsPropertyPresent(cls, L"IsCursorCaptureEnabled")) session.IsCursorCaptureEnabled(false);
      if (ApiInformation::IsPropertyPresent(cls, L"IsBorderRequired")) session.IsBorderRequired(false);
      session.StartCapture();
      // FrameArrived is not raised for a window whose picture does not change (a title screen, a dialog, in another
      // process), though its frame is in the pool: the pool is read on every wake-up, not only when the event fires.
      const ULONGLONG end = GetTickCount64() + timeoutMs; wgc::Direct3D11CaptureFrame frame{ nullptr };
      while (!frame) {
        const ULONGLONG now = GetTickCount64(); if (now >= end) break;
        if (pump) pump();
        MsgWaitForMultipleObjects(1, &arrived, FALSE, DWORD(std::min<ULONGLONG>(end - now, 15)), QS_ALLINPUT);
        frame = pool.TryGetNextFrame();
      }
      restore();
      if (!frame) { session.Close(); pool.Close(); err = "no frame within the timeout"; return false; }
      auto access = frame.Surface().as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
      com_ptr<ID3D11Texture2D> tex; winrt::check_hresult(access->GetInterface(IID_PPV_ARGS(tex.put())));
      D3D11_TEXTURE2D_DESC d; tex->GetDesc(&d);
      // Where the client area sits in the frame: the frame is the extended frame bounds (Win10, Win11 24H2+) or the whole
      // window rectangle; whichever has the frame's size is the origin (Magpie CalcWindowCapturedFrameBounds).
      RECT c{}; if (!ClientOnScreen(w, c)) { err = "no client area"; frame.Close(); session.Close(); pool.Close(); return false; }
      RECT fb{}, wr{}; GetWindowRect(w, &wr);
      if (FAILED(DwmGetWindowAttribute(w, DWMWA_EXTENDED_FRAME_BOUNDS, &fb, sizeof fb))) fb = wr;
      RECT origin = fb;
      if (LONG(d.Width) == wr.right - wr.left && LONG(d.Height) == wr.bottom - wr.top && !(LONG(d.Width) == fb.right - fb.left && LONG(d.Height) == fb.bottom - fb.top)) origin = wr;
      int x0 = std::max<LONG>(0, c.left - origin.left), y0 = std::max<LONG>(0, c.top - origin.top);
      int x1 = std::min<LONG>(LONG(d.Width), c.right - origin.left), y1 = std::min<LONG>(LONG(d.Height), c.bottom - origin.top);
      if (x1 - x0 < 1 || y1 - y0 < 1) { x0 = 0; y0 = 0; x1 = int(d.Width); y1 = int(d.Height); }
      D3D11_TEXTURE2D_DESC sd = d; sd.Width = UINT(x1 - x0); sd.Height = UINT(y1 - y0); sd.MipLevels = 1; sd.ArraySize = 1; sd.SampleDesc = { 1, 0 };
      sd.Usage = D3D11_USAGE_STAGING; sd.BindFlags = 0; sd.CPUAccessFlags = D3D11_CPU_ACCESS_READ; sd.MiscFlags = 0;
      com_ptr<ID3D11Texture2D> staging; winrt::check_hresult(dev->CreateTexture2D(&sd, nullptr, staging.put()));
      D3D11_BOX box{ UINT(x0), UINT(y0), 0, UINT(x1), UINT(y1), 1 };
      ctx->CopySubresourceRegion(staging.get(), 0, 0, 0, 0, tex.get(), 0, &box);
      D3D11_MAPPED_SUBRESOURCE m{}; winrt::check_hresult(ctx->Map(staging.get(), 0, D3D11_MAP_READ, 0, &m));
      p.w = int(sd.Width); p.h = int(sd.Height); p.bgra.resize(size_t(p.w) * p.h * 4);
      for (int y = 0; y < p.h; ++y) memcpy(&p.bgra[size_t(y) * p.w * 4], static_cast<uint8_t *>(m.pData) + size_t(y) * m.RowPitch, size_t(p.w) * 4);
      ctx->Unmap(staging.get(), 0);
      for (size_t i = 3; i < p.bgra.size(); i += 4) p.bgra[i] = 255;
      frame.Close(); session.Close(); pool.Close();
      return true;
    } catch (const winrt::hresult_error &e) {
      if (styleChanged) SetWindowLongPtrW(w, GWL_EXSTYLE, ex);
      err = "WGC: " + Utf8(std::wstring(e.message())); if (err.size() <= 5) { char b[32]; std::snprintf(b, sizeof b, "WGC 0x%08lx", e.code().value); err = b; }
      return false;
    }
  }
};

static bool WgcSupported() { try { return wgc::GraphicsCaptureSession::IsSupported(); } catch (...) { return false; } }

// WGC only works for windows on the desktop the user sees: on a hidden desktop (ColdDesk, tools/run-isolated.cjs)
// CreateForWindow fails with E_INVALIDARG, so there the old way is used and the reason says why.
static bool OnInputDesktop() {
  wchar_t mine[256] = L"", input[256] = L""; DWORD n = 0;
  if (!GetUserObjectInformationW(GetThreadDesktop(GetCurrentThreadId()), UOI_NAME, mine, sizeof mine, &n)) return true;
  HDESK in = OpenInputDesktop(0, FALSE, DESKTOP_READOBJECTS); if (!in) return false;
  const BOOL ok = GetUserObjectInformationW(in, UOI_NAME, input, sizeof input, &n); CloseDesktop(in);
  return !ok || _wcsicmp(mine, input) == 0;
}

// auto: WGC first, then PrintWindow with the reason; wgc: WGC only; print: PrintWindow only (the old way).
static Result Capture(HWND w, const std::string &method, DWORD timeoutMs, void (*pump)() = nullptr) {
  Result r; std::string why;
  if (method != "print") {
    if (!IsWindow(w)) { r.error = "no such window"; return r; }
    if (IsIconic(w)) why = "minimized";
    else if (!WgcSupported()) why = "wgc-unsupported";
    else if (!OnInputDesktop()) why = "hidden-desktop";
    else { Wgc g; std::string err; const bool ok = g.Shot(w, timeoutMs, r.pic, err, pump); if (ok) { r.ok = true; r.method = "wgc"; return r; } why = "wgc-failed: " + err; }
    if (method == "wgc") { r.error = why; return r; }
  }
  r.fallback = why; r.method = "printwindow";
  std::string err; r.ok = PrintWindowShot(w, r.pic, err); if (!r.ok) r.error = err;
  return r;
}

static void Print(const Result &r, const std::string &extra = "") {
  bool blank = true; double mean[3] = { 0, 0, 0 }; if (r.ok) Stats(r.pic, blank, mean);
  std::printf("{\"ok\":%s,\"method\":\"%s\",\"fallback\":%s,\"w\":%d,\"h\":%d,\"blank\":%s,\"mean\":[%.0f,%.0f,%.0f]%s%s}\n",
    r.ok ? "true" : "false", r.method.c_str(), r.fallback.empty() ? "null" : ("\"" + Esc(r.fallback) + "\"").c_str(), r.pic.w, r.pic.h, blank ? "true" : "false",
    mean[0], mean[1], mean[2], r.error.empty() ? "" : (",\"error\":\"" + Esc(r.error) + "\"").c_str(), extra.c_str());
  std::fflush(stdout);
}

// ---------------------------------------------------------------- finding the window of a pid
struct Find { DWORD pid; HWND best; LONGLONG area; };
static BOOL CALLBACK EnumBest(HWND w, LPARAM l) {
  auto *f = reinterpret_cast<Find *>(l); DWORD pid = 0; GetWindowThreadProcessId(w, &pid);
  if (pid != f->pid || !IsWindowVisible(w) || GetWindow(w, GW_OWNER) && (GetWindowLongPtrW(w, GWL_EXSTYLE) & WS_EX_TOOLWINDOW)) return TRUE;
  RECT r; GetClientRect(w, &r); const LONGLONG a = LONGLONG(r.right) * r.bottom; if (a > f->area) { f->area = a; f->best = w; }
  return TRUE;
}
static HWND WindowOf(DWORD pid) { Find f{ pid, nullptr, 0 }; EnumWindows(EnumBest, LPARAM(&f)); return f.best; }

// ---------------------------------------------------------------- self-test: a D3D11 window covered by another window
static const float Target[3] = { 0.16f, 0.78f, 0.35f }; // green the target window presents (r, g, b)
static HWND g_target = nullptr; static com_ptr<IDXGISwapChain1> g_swap; static com_ptr<ID3D11Device> g_dev; static com_ptr<ID3D11DeviceContext> g_ctx; static com_ptr<ID3D11RenderTargetView> g_rtv;
static void PumpAndPresent() {
  MSG m; while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); }
  if (g_swap) { const float c[4] = { Target[0], Target[1], Target[2], 1 }; g_ctx->ClearRenderTargetView(g_rtv.get(), c); g_swap->Present(0, 0); }
}
static void PumpOnly() { MSG m; while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); } }
static LRESULT CALLBACK CoverProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (m == WM_PAINT) { PAINTSTRUCT ps; HDC dc = BeginPaint(h, &ps); HBRUSH b = CreateSolidBrush(RGB(220, 30, 30)); FillRect(dc, &ps.rcPaint, b); DeleteObject(b); EndPaint(h, &ps); return 0; }
  if (m == WM_MOUSEACTIVATE) return MA_NOACTIVATE;
  return DefWindowProcW(h, m, w, l);
}
static bool Near(const double mean[3], int r, int g, int b) { return std::abs(mean[2] - r) < 24 && std::abs(mean[1] - g) < 24 && std::abs(mean[0] - b) < 24; }

static std::wstring TempPng() { wchar_t dir[MAX_PATH]; GetTempPathW(MAX_PATH, dir); return std::wstring(dir) + L"megulit-wgcshot-selftest-" + std::to_wstring(GetCurrentProcessId()) + L".png"; }
// runs this exe with args and returns its stdout
static std::string RunSelf(const std::wstring &args) {
  wchar_t self[MAX_PATH]; GetModuleFileNameW(nullptr, self, MAX_PATH);
  std::wstring cmd = L"\"" + std::wstring(self) + L"\" " + args;
  SECURITY_ATTRIBUTES sa{ sizeof sa, nullptr, TRUE }; HANDLE rd = nullptr, wr = nullptr; if (!CreatePipe(&rd, &wr, &sa, 0)) return {};
  SetHandleInformation(rd, HANDLE_FLAG_INHERIT, 0);
  STARTUPINFOW si{ sizeof si }; si.dwFlags = STARTF_USESTDHANDLES; si.hStdOutput = wr; si.hStdError = wr; si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  PROCESS_INFORMATION pi{}; std::string out;
  if (CreateProcessW(nullptr, cmd.data(), nullptr, nullptr, TRUE, CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi)) {
    CloseHandle(wr); wr = nullptr; char buf[1024]; DWORD n = 0; while (ReadFile(rd, buf, sizeof buf, &n, nullptr) && n) out.append(buf, n);
    WaitForSingleObject(pi.hProcess, 10000); CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
  }
  if (wr) CloseHandle(wr); CloseHandle(rd); DeleteFileW(TempPng().c_str());
  const size_t at = out.find("{\"ok\""); if (at == std::string::npos) return out;
  std::string line = out.substr(at); const size_t nl = line.find('\n'); if (nl != std::string::npos) line.resize(nl);
  while (!line.empty() && (line.back() == '\r' || line.back() == '}')) line.pop_back();
  return line + ",\"selftest\":\"covered-still\"}\n";
}

static int SelfTest(bool onscreen) {
  // Placed past the right edge of the virtual screen so nothing shows on the desktop; --onscreen puts both windows at the
  // top left of the primary monitor, where a screen copy sees only the cover.
  const int W = 320, H = 200;
  int x = GetSystemMetrics(SM_XVIRTUALSCREEN) + GetSystemMetrics(SM_CXVIRTUALSCREEN) + 400, y = 100;
  if (onscreen) { x = 60; y = 60; }
  WNDCLASSEXW wc{ sizeof wc }; wc.lpfnWndProc = DefWindowProcW; wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"MeguLitWgcShotTarget"; RegisterClassExW(&wc);
  WNDCLASSEXW cc{ sizeof cc }; cc.lpfnWndProc = CoverProc; cc.hInstance = wc.hInstance; cc.lpszClassName = L"MeguLitWgcShotCover"; RegisterClassExW(&cc);
  RECT r{ 0, 0, W, H }; AdjustWindowRectEx(&r, WS_OVERLAPPEDWINDOW, FALSE, 0);
  g_target = CreateWindowExW(WS_EX_NOACTIVATE, wc.lpszClassName, L"MeguLit WGC target", WS_OVERLAPPEDWINDOW, x, y, r.right - r.left, r.bottom - r.top, nullptr, nullptr, wc.hInstance, nullptr);
  if (!g_target) { std::printf("{\"selftest\":\"fail\",\"why\":\"target window\"}\n"); return 3; }
  ShowWindow(g_target, SW_SHOWNOACTIVATE);
  const D3D_FEATURE_LEVEL levels[] = { D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_0 };
  HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 2, D3D11_SDK_VERSION, g_dev.put(), nullptr, g_ctx.put());
  if (FAILED(hr)) hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 2, D3D11_SDK_VERSION, g_dev.put(), nullptr, g_ctx.put());
  if (FAILED(hr)) { std::printf("{\"selftest\":\"fail\",\"why\":\"no D3D11 device\"}\n"); return 3; }
  com_ptr<IDXGIFactory2> fac; { com_ptr<IDXGIAdapter> ad; g_dev.as<IDXGIDevice>()->GetAdapter(ad.put()); ad->GetParent(IID_PPV_ARGS(fac.put())); }
  DXGI_SWAP_CHAIN_DESC1 sd{}; sd.Width = W; sd.Height = H; sd.Format = DXGI_FORMAT_B8G8R8A8_UNORM; sd.SampleDesc.Count = 1; sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT; sd.BufferCount = 2; sd.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
  if (FAILED(fac->CreateSwapChainForHwnd(g_dev.get(), g_target, &sd, nullptr, nullptr, g_swap.put()))) { std::printf("{\"selftest\":\"fail\",\"why\":\"swap chain\"}\n"); return 3; }
  { com_ptr<ID3D11Texture2D> bb; g_swap->GetBuffer(0, IID_PPV_ARGS(bb.put())); g_dev->CreateRenderTargetView(bb.get(), nullptr, g_rtv.put()); }
  // a window that is drawn once and never changes (a title screen, a dialog), in another process like a game: WGC raises
  // no FrameArrived for it, the frame has to be fetched (see Shot). Run by this exe with --still-window.
  const int SW = r.right - r.left, SH = r.bottom - r.top;
  PROCESS_INFORMATION child{}; HWND still = nullptr;
  {
    wchar_t self[MAX_PATH]; GetModuleFileNameW(nullptr, self, MAX_PATH);
    std::wstring cmd = L"\"" + std::wstring(self) + L"\" --still-window " + std::to_wstring(x + SW + 20) + L" " + std::to_wstring(y) + L" " + std::to_wstring(SW) + L" " + std::to_wstring(SH);
    STARTUPINFOW si{ sizeof si };
    if (CreateProcessW(nullptr, cmd.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &child))
      for (int i = 0; i < 300 && !still; ++i) { Sleep(10); still = WindowOf(child.dwProcessId); }
  }
  RECT c; ClientOnScreen(g_target, c);
  const int coverW = (r.right - r.left) + 20 + SW + 40;
  HWND cover = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, cc.lpszClassName, L"MeguLit WGC cover", WS_POPUP, c.left - 40, c.top - 40, coverW + 40, H + 80, nullptr, nullptr, wc.hInstance, nullptr);
  ShowWindow(cover, SW_SHOWNOACTIVATE);
  for (int i = 0; i < 30; ++i) { PumpAndPresent(); Sleep(16); }
  const int tr = int(Target[0] * 255 + .5), tg = int(Target[1] * 255 + .5), tb = int(Target[2] * 255 + .5);
  int code = 0; std::string verdict;
  if (!WgcSupported() || !OnInputDesktop()) {
    const char *why = !WgcSupported() ? "wgc-unsupported" : "hidden-desktop";
    Result p = Capture(g_target, "auto", 3000, PumpAndPresent); Print(p, std::string(",\"selftest\":\"") + why + "\"");
    verdict = p.ok && p.method == "printwindow" && p.fallback == why ? std::string("skip: ") + why + "; fell back to PrintWindow and said so" : "fail: no fallback";
    if (verdict[0] == 'f') code = 3;
  } else {
    Result w = Capture(g_target, "wgc", 3000, PumpAndPresent);
    bool blank; double mean[3]; Stats(w.pic, blank, mean);
    Print(w, ",\"selftest\":\"covered-d3d\"");
    if (!w.ok) { verdict = "fail: WGC gave no picture"; code = 3; }
    else if (!Near(mean, tr, tg, tb)) { verdict = Near(mean, 220, 30, 30) ? "fail: WGC returned the covering window" : blank ? "fail: WGC returned black" : "fail: WGC returned something else"; code = 3; }
    else verdict = "pass: covered D3D window captured";
    for (int i = 0; i < 20; ++i) { PumpOnly(); Sleep(25); } // nothing on this desktop changes while the still window is read
    // read by a separate capture process, as tools do: the exe's own CLI with --pid of the still window's process
    std::string line = still ? RunSelf(L"--pid " + std::to_wstring(child.dwProcessId) + L" --method wgc --timeout-ms 3000 --out \"" + TempPng() + L"\"") : "";
    std::printf("%s", line.empty() ? "{\"error\":\"the still window did not start\",\"selftest\":\"covered-still\"}\n" : line.c_str());
    if (line.find("\"method\":\"wgc\"") == std::string::npos || line.find("\"ok\":true") == std::string::npos || line.find("\"mean\":[200,60,30]") == std::string::npos) { verdict += "; fail: still window in another process gave no WGC picture"; code = 3; }
    // for the record: what the old way (PrintWindow) gives for the same window
    Result old = Capture(g_target, "print", 0, PumpAndPresent); Print(old, ",\"selftest\":\"old-printwindow\"");
    // the minimised window: WGC is not used, the fallback says so
    ShowWindow(g_target, SW_SHOWMINNOACTIVE); for (int i = 0; i < 5; ++i) { PumpAndPresent(); Sleep(10); }
    Result m = Capture(g_target, "auto", 1000, PumpAndPresent); Print(m, ",\"selftest\":\"minimized\"");
    if (!(m.method == "printwindow" && m.fallback == "minimized")) { verdict += "; fail: minimised window did not fall back"; code = 3; }
  }
  std::printf("{\"selftest\":\"%s\"}\n", Esc(verdict).c_str());
  if (child.hProcess) { TerminateProcess(child.hProcess, 0); WaitForSingleObject(child.hProcess, 3000); CloseHandle(child.hProcess); CloseHandle(child.hThread); }
  DestroyWindow(cover); g_rtv = nullptr; g_swap = nullptr; DestroyWindow(g_target);
  return code;
}

// --still-window x y w h: a layered window (its picture exists even past the edge of the screen, where GDI painting is
// clipped away) drawn once in a solid colour, kept for at most 20 s; the self-test ends it earlier.
static int StillWindow(int x, int y, int w, int h) {
  WNDCLASSEXW sc{ sizeof sc }; sc.lpfnWndProc = DefWindowProcW; sc.hInstance = GetModuleHandleW(nullptr); sc.lpszClassName = L"MeguLitWgcShotStill"; RegisterClassExW(&sc);
  HWND still = CreateWindowExW(WS_EX_LAYERED | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW, sc.lpszClassName, L"MeguLit WGC still", WS_POPUP, x, y, w, h, nullptr, nullptr, sc.hInstance, nullptr);
  if (!still) return 1;
  BITMAPINFO bi{}; bi.bmiHeader = { sizeof(BITMAPINFOHEADER), w, -h, 1, 32, BI_RGB }; void *bits = nullptr;
  HDC screen = GetDC(nullptr), mem = CreateCompatibleDC(screen); HBITMAP bmp = CreateDIBSection(screen, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
  for (int i = 0; i < w * h; ++i) static_cast<uint32_t *>(bits)[i] = 0xFF1E3CC8; // r30 g60 b200
  HGDIOBJ old = SelectObject(mem, bmp); POINT at{ x, y }, zero{ 0, 0 }; SIZE sz{ w, h }; BLENDFUNCTION bf{ AC_SRC_OVER, 0, 255, AC_SRC_ALPHA };
  UpdateLayeredWindow(still, screen, &at, &sz, mem, &zero, 0, &bf, ULW_ALPHA);
  SelectObject(mem, old); DeleteObject(bmp); DeleteDC(mem); ReleaseDC(nullptr, screen);
  ShowWindow(still, SW_SHOWNOACTIVATE);
  const ULONGLONG end = GetTickCount64() + 20000;
  while (GetTickCount64() < end) { PumpOnly(); MsgWaitForMultipleObjects(0, nullptr, FALSE, 100, QS_ALLINPUT); }
  return 0;
}

int wmain(int argc, wchar_t **argv) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  winrt::init_apartment(winrt::apartment_type::multi_threaded);
  HWND w = nullptr; DWORD pid = 0; std::wstring out; std::string method = "auto"; DWORD timeout = 3000; bool self = false, onscreen = false;
  for (int i = 1; i < argc; ++i) {
    std::wstring a = argv[i]; auto next = [&]() -> std::wstring { return i + 1 < argc ? argv[++i] : L""; };
    if (a == L"--hwnd") w = HWND(uintptr_t(wcstoull(next().c_str(), nullptr, 0)));
    else if (a == L"--pid") pid = DWORD(wcstoul(next().c_str(), nullptr, 10));
    else if (a == L"--out") out = next();
    else if (a == L"--method") method = Utf8(next());
    else if (a == L"--timeout-ms") timeout = DWORD(wcstoul(next().c_str(), nullptr, 10));
    else if (a == L"--selftest") self = true;
    else if (a == L"--onscreen") onscreen = true;
    else if (a == L"--still-window" && i + 4 < argc) { const int x = _wtoi(argv[i + 1]), y = _wtoi(argv[i + 2]), sw = _wtoi(argv[i + 3]), sh = _wtoi(argv[i + 4]); return StillWindow(x, y, sw, sh); }
    else if (a == L"--version") { std::printf("%s\n", Marker); return 0; }
    else { std::fprintf(stderr, "unknown argument\n"); return 2; }
  }
  if (self) return SelfTest(onscreen);
  if (!w && pid) w = WindowOf(pid);
  if (!w || out.empty() || (method != "auto" && method != "wgc" && method != "print")) { std::fprintf(stderr, "usage: MeguLitWgcShot.exe (--hwnd n | --pid n) --out file.png [--method auto|wgc|print]\n"); if (!w && pid) { Result r; r.error = "no visible window for the pid"; Print(r); return 1; } return 2; }
  Result r = Capture(w, method, timeout);
  if (r.ok) { std::string err; if (!SavePng(r.pic, out, err)) { r.ok = false; r.error = err; } }
  char hw[64]; std::snprintf(hw, sizeof hw, ",\"hwnd\":%llu", (unsigned long long)uintptr_t(w));
  Print(r, hw);
  return r.ok ? 0 : 1;
}
