// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test of the glyph trace's per-line colour (GlyphTrace.h: Tint, Draw, LineColor, ToMe_GLYPHCOL). No GPU, no game:
// glyphs are queued, written into a made-up texture and drawn as quads, as the hooks of GpuHide.cpp would feed them.
//   read tint    the engine writes read glyphs yellow into a colour texture: the line reports yellow, the next line white
//   dimming      white texels, vertex colour at half alpha: the line reports a = 80
//   no difference two lines, same colour: both report the same value
//   passes       a dark shadow pass, then the text on top: the text colour wins
//   no colour    an alpha-only texture and no vertex colour: nothing is reported (never a made-up white)
//   budget       the tint reads at most 8 texels a glyph
//   stroke edge  the engine writes a bright pink fill whose stroke edges are blended with its dark outline (and, on another
//                line, with a light highlight): the line reports the fill exactly (アイキス3 sexy, アヤメ #ff5ea8: the mean of
//                edge and fill came out grey-pink); white text with a grey edge still reports white
#include <windows.h>
#include <algorithm>
#include "../GlyphTrace.h"

static std::vector<std::string> Out;
static int Fail(const char *what) { printf("FAIL %s\n", what); return 1; }

struct Tex { int w, h; std::vector<uint32_t> px; bool colour; int reads = 0; };
// edge != NOEDGE: texels at the edge of a stroke (coverage below 200, or a neighbour below 200) carry that colour, as the game's
// own blend of the fill with its outline or anti-aliasing
static const uint32_t NOEDGE = 0xffffffffu;
static void Put(Tex &t, int x, int y, const GtGlyph &g, uint32_t rgb, uint32_t edge = NOEDGE) {
 auto cov = [&](int i, int j) -> int { return i < 0 || j < 0 || i >= g.bw || j >= g.bh ? 0 : g.cov[(size_t)j * g.bw + i]; };
 for (int j = 0; j < g.bh; j++) for (int i = 0; i < g.bw; i++) { uint8_t c = g.cov[(size_t)j * g.bw + i];
  bool rim = edge != NOEDGE && (c < 200 || cov(i - 1, j) < 200 || cov(i + 1, j) < 200 || cov(i, j - 1) < 200 || cov(i, j + 1) < 200);
  t.px[(size_t)(y + j) * t.w + x + i] = ((uint32_t)c << 24) | (c ? (rim ? edge : rgb) : 0); }
}
// one line: every glyph rasterised, written at its slot with `texel`, drawn with `passes` (vertex colours, hasCol)
static std::string Line(GlyphTrace &tr, unsigned seq, Tex &t, const wchar_t *text, uint32_t texel, const std::vector<std::pair<uint32_t, bool>> &passes, unsigned &now, uint32_t edge = NOEDGE) {
 Out.clear(); tr.Line(seq, now); int n = (int)wcslen(text);
 for (int i = 0; i < n; i++) {
  int bw = 12 + i % 3, bh = 14; std::vector<uint8_t> cov((size_t)bw * bh, 0);
  for (int y = 2; y < bh - 2; y++) for (int x = 2; x < bw - 2; x++) cov[(size_t)y * bw + x] = (uint8_t)(((x * 7 + y * 13 + text[i]) % 5) ? 255 : 120);
  tr.Glyph(text[i], bw, bh, 16, cov.data(), now);
  GtGlyph g = tr.pending.back(); int x = 4 + i * 20, y = 4 + (int)(seq % 4) * 20; Put(t, x, y, g, texel, edge);
  auto read = [&](int a, int b) -> int { if (a < 0 || b < 0 || a >= t.w || b >= t.h) return -1; return (int)(t.px[(size_t)b * t.w + a] >> 24); };
  auto rgb = [&](int a, int b) -> int { if (!t.colour || a < 0 || b < 0 || a >= t.w || b >= t.h) return -1; t.reads++; return (int)(t.px[(size_t)b * t.w + a] & 0xffffff); };
  tr.Write(&t, x, y, bw, bh, false, read, rgb, now);
 }
 for (auto &p : passes) { std::vector<GlyphTrace::Q> q;
  for (int i = 0; i < n; i++) { int bw = 12 + i % 3, x = 4 + i * 20, y = 4 + (int)(seq % 4) * 20; GlyphTrace::Q d{ 100.f + i * 30, 500.f, 100.f + i * 30 + bw, 514.f, (float)x / t.w, (float)y / t.h, (float)(x + bw) / t.w, (float)(y + 14) / t.h }; d.col = p.first; d.hasCol = p.second; q.push_back(d); }
  tr.Draw(&t, t.w, t.h, q, [](float *) { return true; }, now); }
 now += 200; tr.Frame(now, 1280, 720); now += 200; tr.Frame(now, 1280, 720);
 for (auto &l : Out) if (l.rfind("ToMe_GLYPHCOL ", 0) == 0) return l;
 return "";
}
static bool Has(const std::string &l, const char *part) { return l.find(part) != std::string::npos; }

int main() {
 GlyphTrace tr; tr.emit = [](const std::string &l) { Out.push_back(l); }; unsigned now = 1000;
 Tex colour{ 256, 128, std::vector<uint32_t>(256 * 128, 0), true }, alpha{ 256, 128, std::vector<uint32_t>(256 * 128, 0), false };
 const std::vector<std::pair<uint32_t, bool>> plain = { { 0xffffffffu, false } }, white = { { 0xffffffffu, true } }, half = { { 0x80ffffffu, true } }, shadowed = { { 0xff101010u, true }, { 0xffffffffu, true } };

 std::string a = Line(tr, 1, colour, L"既読の文章", 0xf7f77b, plain, now);
 if (!Has(a, "line=1 rgb=f7f77b a=ff")) return Fail(("read tint: " + a).c_str());
 std::string b = Line(tr, 2, colour, L"未読の文章", 0xffffff, plain, now);
 if (!Has(b, "line=2 rgb=ffffff a=ff")) return Fail(("unread after read: " + b).c_str());
 if (colour.reads > 10 * 8) return Fail("tint read more than 8 texels a glyph");

 std::string c = Line(tr, 3, colour, L"暗い既読文", 0xffffff, half, now);
 if (!Has(c, "line=3 rgb=ffffff a=80")) return Fail(("dimming: " + c).c_str());
 std::string d = Line(tr, 4, colour, L"明るい未読", 0xffffff, white, now);
 if (!Has(d, "line=4 rgb=ffffff a=ff")) return Fail(("after dimming: " + d).c_str());

 std::string e = Line(tr, 5, colour, L"同じ色の一", 0xe0e0e0, white, now), f = Line(tr, 6, colour, L"同じ色の二", 0xe0e0e0, white, now);
 if (!Has(e, "rgb=e0e0e0 a=ff") || !Has(f, "rgb=e0e0e0 a=ff")) return Fail(("no difference: " + e + " | " + f).c_str());

 std::string g = Line(tr, 7, colour, L"影付きの文", 0xffffff, shadowed, now);
 if (!Has(g, "line=7 rgb=ffffff a=ff")) return Fail(("shadow pass then text: " + g).c_str());

 std::string h = Line(tr, 8, alpha, L"色の無い文", 0xffffff, plain, now);
 if (!h.empty()) return Fail(("alpha-only texture without vertex colour reported a colour: " + h).c_str());
 std::string i = Line(tr, 9, alpha, L"頂点色の文", 0xffffff, { { 0xfff7f77bu, true } }, now);
 if (!Has(i, "line=9 rgb=f7f77b a=ff")) return Fail(("vertex colour over an alpha texture: " + i).c_str());

 std::string j = Line(tr, 10, colour, L"アヤメの台詞", 0xff5ea8, plain, now, 0x5a2a40);
 if (!Has(j, "line=10 rgb=ff5ea8 a=ff")) return Fail(("pink fill with dark-blended stroke edges: " + j).c_str());
 std::string k = Line(tr, 11, colour, L"アヤメの続き", 0xff5ea8, plain, now, 0xffc8e0);
 if (!Has(k, "line=11 rgb=ff5ea8 a=ff")) return Fail(("pink fill with light-blended stroke edges: " + k).c_str());
 std::string m = Line(tr, 12, colour, L"白い地の文章", 0xffffff, plain, now, 0x808080);
 if (!Has(m, "line=12 rgb=ffffff a=ff")) return Fail(("white fill with grey stroke edges: " + m).c_str());
 std::string o = Line(tr, 13, colour, L"灰色の地の文", 0x9d9d9d, plain, now, 0x404040);
 if (!Has(o, "line=13 rgb=9d9d9d a=ff")) return Fail(("grey fill with dark stroke edges: " + o).c_str());
 if (colour.reads > 14 * 8 * 6) return Fail("tint read more than 8 texels a glyph");

 printf("PASS glyph trace colour: read tint, unread after read, dimming by vertex alpha, no difference, shadow pass under the text, no colour without evidence, vertex colour alone, at most 8 texel reads a glyph\n");
 return 0;
}
