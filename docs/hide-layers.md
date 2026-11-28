# Hide layers

MeguLit draws the game's dialogue itself (owner, 2026-11-14). For that the game must stop drawing the current line,
without any change to the game's logic or data: WA2 (Leaf) crashed when its whole memory string was blanked, because
the string carries control codes, name variables and voice ids. Each layer below hides at a different place; the hide
orchestrator (`feat/hide-orchestrator`) picks one per game. Every layer switches a stream to hide-only only after the
game side confirmed a hidden draw (a "hit").

| Layer | Where | Code | Hit report |
|-------|-------|------|------------|
| 1 | Write-back embed through LunaHook (blank or translated text written into the engine's buffer) | `native/megulithook`, LunaHook embed hooks | engine embed callback |
| 2 | Engine-specific DLLs (KiriKiri, Ren'Py, ...) | `native/krkrtext`, `native/renpytext`, `native/MeguLitRenpy.py` | `ToMe_CHARS hidden=1` |
| 3 | Windows glyph layer: GDI / GDI+ / Direct2D glyphs and strings (E578, E667) | `native/megulithook/MeguLitGdiHide.h`, `native/fontprobe` | `MeguLit_GDIHIDE hit`, `ToMe_GLYPHHIDE hit` |
| 4 | "Fake GPU": glyph quads of Direct3D 9 / 11 and OpenGL draws and glyph blits of GDI software renderers | `native/gpuhide` (MeguLitGpu32/64.dll), `native/GpuHideLayer.cs` | `ToMe_GPUHIDE hit` |

## Rules for every layer (2026-11-15, 沙耶の唄 report)

- **Never write garbage into a game.** Every string HookBridge hands back to an engine (blank, mark, veil or translation)
  goes through `EmbedTextPolicy.GuardWrite` (`SafeReply` in HookBridge): a hook that reads its string in a multi-byte code
  page (LunaHook types A / B / S; the code page from `HS936#...` or the bridge's `Codepage`) only gets text that survives
  that code page both ways; replacement characters, new control codes, a reply over 4x the original (or +64) or 3+ extra
  rows are refused. A refused reply is written as nothing: the game keeps its own line and MeguLit only reads it
  (`write-guard refused ...` in hook-diagnostics). The front end drops a translation with U+FFFD / control codes / mojibake
  before it asks for a write (`embedTranslateRefused` in reader-host.log). Self-test: `EmbedTextPolicy.GuardSelfTest`, run by
  `HookBridge.exe --self-test` (Build-HookBridge.ps1).
- **Never hide a line no one can read.** `EmbedTextPolicy.Unreadable` (same rule as `core/text-sanity.cjs garbledSource`
  with `controls:false`, minus Shift-JIS-read-as-GBK, which the front end repairs and draws): U+FFFD, half-width katakana
  mixed with kanji, UTF-8 read as Latin-1, and game noise lines (half-width katakana glued to ASCII or kanji plus ASCII
  wedged between wide characters, e.g. 沙耶の唄's monster speech 『二十Aﾅ像ナッテ初y(VQｳッテノハ…』). Such a line turns layers 3
  and 4 off (`GlyphOff`, `unreadable line left to the game`) and goes back unchanged through layer 1. MeguLit has nothing
  to draw for it, so the game must keep drawing it.

## Layer 4: fake GPU (`MeguLitGpu32.dll`, `MeguLitGpu64.dll`)

For engines that rasterise their own text and draw it from a glyph atlas: bitmap font sheets, glyph textures, Unity
non-TMP `UI.Text`, Live2D-style engines, software renderers that copy glyph cells with `BitBlt`. They never ask Windows
for a glyph, so layer 3 sees nothing.

### How it hides

- **Loaded by HookBridge** into the bound game (same loader and `HookInjector` allowlist as the font probe), 32- and
  64-bit. It changes nothing in the game folder.
- **Direct3D 9.** Windows 10/11 give every device its own copy of the interface table, so the functions those tables
  point at (inside `d3d9.dll`, shared by all devices) are hooked in place with MinHook, found through throwaway devices
  created in the game process through the **system** `d3d9.dll` only (a game may ship its own wrapper `d3d9.dll` that keeps
  the device in globals: WHITE ALBUM2 crashed at its first scene when the throwaway devices went through it) (software / hardware / pure / mixed vertex processing, with and without
  `D3DCREATE_MULTITHREADED`). This also covers devices created before the DLL arrived. Hooked: `Present`, `Reset`,
  `SetRenderTarget`, `SetTransform`, `SetViewport`, `SetTexture`, `SetFVF`, `SetVertexDeclaration`, `SetVertexShader`,
  `SetStreamSource`, `SetIndices`, `IDirect3DSwapChain9::Present`, the four `Draw*Primitive*` calls, and `Lock` / `Unlock` of vertex and index buffers
  (read-only shadow copies of what the game wrote, taken at `Unlock`).
- **Direct3D 11.** `D3D11CreateDeviceAndSwapChain` in the game's own `d3d11.dll` (never imported by the DLL, so a
  Direct3D 9 game does not load it) gives the functions behind `ID3D11DeviceContext::Draw` / `DrawIndexed` / `Map` /
  `Unmap` / `UpdateSubresource`, `ID3D11Device::CreateInputLayout` and `IDXGISwapChain::Present`, hooked in place. The
  pipeline state of each draw is read with the context's own getters (so state set before the DLL arrived counts);
  vertex / index data from read-only shadows taken at `Unmap` / `UpdateSubresource`. Position and texture coordinate
  come from the input layout; a layout made before the DLL arrived is guessed (position float2 at offset 0, texture
  coordinate float2 in the last 8 bytes of the stride) and only ever acts through the count match. Shaders decide the
  real transform: positions that all lie in [-1, 1] are read as normalised device coordinates through the viewport,
  others as pixels. Triangle lists and single-quad strips.
- **OpenGL.** `glDrawArrays` / `glDrawElements` (opengl32) and `SwapBuffers` (gdi32) are hooked in place; the DLL never
  imports opengl32.dll (GL 1.1 calls go through pointers from the game's own copy). Buffer functions come from the driver
  (`wglGetProcAddress`), so on the first draw, in the game's render thread, `glBufferData` / `glBufferSubData` /
  `glMapBuffer(Range)` / `glUnmapBuffer` (and ARB names) are resolved and hooked for read-only shadows. Each draw is read
  with GL's getters: with a GLSL program, the active attribute whose name contains "pos" (vec2–vec4) and the one with
  "tex" / "uv" / "coord" (vec2); fixed function, the vertex and texture-coordinate arrays through projection × modelview.
  Texture: `GL_TEXTURE_BINDING_2D` and its level-0 size; target: the bound framebuffer object (0 = the window). GL's y
  axis points up: NDC positions are flipped through the viewport.
- **GDI blits.** `BitBlt`, `StretchBlt`, `GdiTransparentBlt`, `GdiAlphaBlend`, `StretchDIBits`, `SetDIBitsToDevice`. The
  source bitmap (or DIB memory) is the atlas, the destination bitmap the render target; a back-buffer bitmap copied to
  the window maps its glyphs to the screen.
- **State set before the DLL arrived (D3D9).** At every draw the device's own getters (`GetVertexDeclaration`, `GetFVF`,
  `GetVertexShader`, `GetTexture(0)`, `GetStreamSource(0)`, `GetIndices`) refresh the view of the hooked setters, so a
  declaration or buffer bound once at start counts (a pure device refuses getters; then the setters' view stays).
  Direct3D 9Ex devices are covered with their own throwaway devices (`Direct3DCreate9Ex`) and `PresentEx`.
- **Vertex declarations and shaders (D3D9).** The declaration's `POSITION` / `POSITIONT` and `TEXCOORD0` of stream 0 are
  read with `GetDeclaration` when it is set. With a vertex shader the transform is the shader's: positions that all lie in
  [-1, 1] are read as normalised device coordinates through the viewport, others as pixels.
- **Quads.** Every draw is split into quads (triangle lists: two triangles each; strips / fans of two triangles), with
  the screen rectangle (pre-transformed `XYZRHW` / `POSITIONT`, `XYZ` through world × view × projection and the viewport,
  or shader positions as above) and the texture-coordinate rectangle. Unknown layouts are not decoded: nothing is hidden there.
- **Glyph-like quad:** 4–160 px each way, aspect within 1:5, a cell of a sheet (at most half of a texture of at least
  32 × 32, at most 1/24 of a texture bigger than 256 × 256), drawn at 0.4–6 × its texel size.
- **Learning (read-only).** HookBridge pushes each line of the selected stream (`LINE <text>`). Per (render target, atlas)
  the DLL counts distinct glyph positions in the last frame and glyph keys (position + atlas cell) first drawn since the
  line started; offset copies (shadow, outline) closer than 40 % of the glyph height are one character; the largest row
  cluster is kept (names and menus elsewhere fall out). When a count equals the line's non-blank characters, the text
  area (the cluster's box, grown by one glyph height up / left, 8 to the right, 2 down) and the atlases that drew inside
  it are learned. Glyphs of one line drawn from several atlas pages are counted together per render target; offset copies
  are merged only when closer than 40 % of the glyph's own width (adjacent narrow digits stay two characters). Learning
  hides nothing.
- **Hiding.** From the next frame on, while a line is armed (60 s after the last `LINE`, until `OFF` or the control pipe
  closes), glyph-like quads whose centre lies inside the text area are left out when they come from a learned atlas,
  or (engines that build a small glyph sheet for every line, a new texture each line) when they have the learned glyph
  height (±25 %) on a render target of the learned size (effect buffers that draw the line twice): the draw call
  is re-issued for the other quads only (sub-ranges of the same buffers; nothing is written to any game buffer or
  texture), or a blit is simply not made. Menus, names and anything outside the area are never touched. If the DLL is
  unsure (no learned area, undecodable draw), it does not hide.
- **Rectangles for the compositor.** Whenever the glyph count of the current line matches its characters, the DLL sends
  one `ToMe_CHARS engine=gpu` record (`docs/text-architecture.md`, ③ record): one rectangle per non-blank character in
  reading order, in back-buffer pixels, `hidden=1` once the line's glyphs are being left out.
- **CMVS startup.** With `OPT bodyRecheck 1`, the fixed atlas can identify the first drawn row. The learner confirms
  that the whole row was masked before sending `hidden=1`. If the hook text has fewer characters than the game drew,
  the report divides the full row into one box per hook-text code point. A later repaint can extend or move that row
  after another complete mask has been verified.

### Font dots at the source (`native/gpuhide/FontDots.h`)

For engines that keep their font as prebuilt glyph sheets and composite them on the CPU, no draw call carries one glyph.
With `MEGULIT_FONT_DOTS=1` in the game's environment (set when the DLL is injected before the game runs, through
glyph-dots' `MeguLitLaunch<bit>.exe`; the DLL sets `MeguLitFontReady-<pid>` once its hooks are in), the DLL hooks
kernel32's `CreateFileA/W`, `ReadFile`, `SetFilePointer(Ex)`, `GetFileSize(Ex)` and `CloseHandle`. Every file opened for
reading is checked once: after the container of the engine family (BRUNS: `EENC` / `EENZ` = XOR with a key from the header,
zlib for `EENZ`) it must be a 4- or 8-bit grey palette bitmap laid out as a regular grid of glyph cells (the finest grid
whose cell boundaries carry almost no ink). The game is then served, through its own handle, a copy of the same size:
every non-empty cell is cleared and gets a solid square dot at the top-left of the glyph's ink (3 px for a 32 px cell,
scaled with the cell height, 2 px at least) in the sheet's brightest grey; the glyph's ink box is kept by its other three
corners in the faintest grey (BRUNS refuses a font whose glyphs shrink to a dot: "ビットマップフォントの初期化に失敗しました").
`EENZ` is re-wrapped with stored zlib blocks under the same key. Nothing on disk changes. Report:
`ToMe_FONTDOTS ready version=1` and `ToMe_FONTDOTS sheet cells=WxH grid=CxR glyphs=N dot=S path=...`.
Self-test: `selftest/fontdotshost.cpp` (x86 / x64) serves an EENZ and a plain BMP glyph sheet dotted and a non-sheet
picture unchanged, with the sizes reported by `GetFileSizeEx` and the files on disk untouched.

Live (2026-11-14):
- ダストマニア (BRUNS, Chinese-patched install, gameplay.exe): early injection works; at start the engine reads exactly
  `font/ff_00..03.bmp` and all four are served dotted (32 × 32 cells 16 × 180 = 2007 glyphs, 16 × 32 half-width, ...); the
  large `*l.bmp` sheets are never opened. With the ink box kept, the engine reached the title and a scene in one run and
  showed its font-initialisation error in another (not deterministic yet). In the scene that ran, the dialogue was still
  drawn with full glyphs (and mojibake from starting the Chinese patch directly), so in this install the dialogue font is
  not taken from these sheets (the engine also has a system-font renderer; libscr / libchs import TextOutW). Not done.
- サイコロジック・ラブコメディ (YU-RIS): no font data exists in its archives (`*.ypf`: pngs and `ysbin` scripts) nor in
  the Chinese patch's Enigma Virtual Box file (`2030.xp`: pngs and `.ybn`), so there is nothing to dot at the source.

### Glyph trace: where GetGlyphOutline glyphs are drawn (`native/gpuhide/GlyphTrace.h`, 2026-11-15)

CLANNAD (Siglus), ISLAND (CatSystem2) and Under The Moon (AdvHD) rasterise each character with GetGlyphOutline and copy
the bitmap into their own Direct3D texture with their own code, so ① (MeguLitFont) knows the character but not where it is
drawn (records with space `-`). The layer follows the bitmap from GetGlyphOutline into the texture and from the texture to
the screen. Generic, read-only, always on (it costs nothing while no GetGlyphOutline bitmap waits):

1. **Glyph**: the DLL's own GetGlyphOutlineW/A hooks (after the call) queue every returned bitmap (GGO_BITMAP, GRAY2/4/8)
   with its character (A: through the DC's charset; GGO_GLYPH_INDEX: unknown), box and cell height, for 1.5 s.
2. **Write**: texture writes take queued glyphs: `IDirect3DTexture9::LockRect/UnlockRect` (level 0), the level-0
   `IDirect3DSurface9::LockRect/UnlockRect` (also plain off-screen surfaces), `UpdateSurface` / `UpdateTexture` /
   same-size `StretchRect` copies (cells move with the texels), D3D11 `UpdateSubresource` on a 2D texture and
   `CopySubresourceRegion`.
   - A write of one glyph's size (the box at least, the cell + max(8, h/2) at most) takes the oldest queued glyph that
     fits; inside it the bitmap is located by content when it has ink, else the written rectangle is the cell.
   - A bigger write (the whole atlas) is searched for each queued glyph: its strongest pixel as anchor, then the whole
     box compared (mean difference at most 20 of 255, at most 10 % of the ink missing). A blank glyph (MeguLitFont blank
     mode) can be found there only by a **mark pixel** (coverage 1..48 at the box's top-left, empty box after it), and ①
     marks very little (owner consent 2026-11-15: GRAY8 only, the first, second and last character of the two lines a
     game is learned from, never on engines that cache glyphs, e.g. Siglus). So for whole-atlas engines assume blank
     glyphs carry no mark: **the one-glyph upload path above is the one that matters** and needs no mark. The mark search
     is also the fallback for a glyph with ink (the DLL's hook may run inside MeguLitFont's). Places taken earlier in the
     same write are skipped.
   - Texel formats read: A8R8G8B8 / A8B8G8R8 (alpha), X8R8G8B8 / X8B8G8R8 (brightest channel), A8, L8, A8L8, A4R4G4B4;
     D3D11 R8G8B8A8 / B8G8R8A8 / B8G8R8X8 / A8 / R8. Not covered: D3D11 Map/Unmap of textures, OpenGL glTexSubImage2D,
     engines that change the bitmap beyond a linear coverage scale (then only the one-glyph-upload path matches).
3. **Draw**: a textured quad whose texel rectangle is centred on a known cell is that character; its rectangle goes
   through the same render-target to back-buffer mapping as layer 4's glyph rects. After each `LINE`, the characters drawn
   since are reported in draw order, shadow / outline copies (same character within 40 % of its height) once:
   `ToMe_GLYPHPOS line=<seq> sw=<back W> sh=<back H> n=<k> list=<u hex>,<x>,<y>,<w>,<h>;...` (ink boxes in back-buffer
   pixels, at most one record per 120 ms while it changes). Cached glyphs (no new GetGlyphOutline) are reported through
   their cells like new ones. A previous line still drawn after LINE (fading out) is reported too; the join below
   matches in text order.

HookBridge passes it on as `{"type":"hookGlyphPos","line":...}`; `core/hook-native.cjs` keeps the parsed record in
`state.hookGlyphPos`, fills the stored ① table (`state.hookGlyphDots = fillPlaces(...)`, which overlay-placement reads directly) and emits `{type:'hookGlyphPos', line, sw, sh, glyphs:[{ch,x,y,w,h}]}`. After merging with feat/glyph-dots, its `glyphDots()` must also call fillPlaces with the latest `hookGlyphPos` when it stores a new line. `core/gpu-glyph-pos.cjs
fillPlaces(table, pos)` fills ① records (state.hookGlyphDots) whose space is `-`: characters matched in order to the
entries, `at` = (ink left, top of the entry's row) in space `m<sw>x<sh>` (the back buffer, scaled to the client by
`core/glyph-place.cjs` like a GDI memory surface); a character without a ① record (cached glyph) gets one. A character
left unmatched keeps the line unplaced (glyph-place returns null; no guessing).

Self-test `selftest/run-trace.cmd` (also called by `run.cmd`), x86 and x64: `ggohost` rasterises 吾輩は猫である。 with
GetGlyphOutlineW (MS Gothic 24, GRAY8) and uploads it as an engine would: per-glyph rect lock of a managed A8R8G8B8 atlas
(`upload`), one whole lock of an A8 atlas (`whole`), a system-memory texture + UpdateTexture (`sysmem`), level-0 surface
locks (`surface`), MeguLitFont blank mode simulated by its own inner GetGlyphOutlineW hook (`blank`: per-glyph upload, no
ink; `marker`: mark pixel, whole lock). Each draws the line (shadow copy first) and must get all 8 characters in order at
the drawn places (within 3 px); a second line drawn from the same cells without GetGlyphOutline must be reported too. All
12 pass (2026-11-15). Not checked in a real game yet (owner rule 2026-11-15: no game launches; see the owner's checklist).

### Crash canary

Layer 4 must never crash a game. HookBridge keeps `data/gpu-hide/<exe>-<size>.json` per game build (the key of the stream
memory): before the DLL is loaded the file is armed with the game's pid, and a bridge thread waits for the game to end.
An exit by an exception (exit code `0xC0000000` and up: access violation, stack overflow, ...) while the layer was loaded
turns layer 4 **off** for that game (`off`, `reason`); every later launch skips the DLL and emits
`{"type":"hookGpuHide","state":"off","reason":...}`. Any other exit clears the arm. A run whose end the bridge did not see
(MeguLit closed first) is only logged. Turning the layer on again is the user's call: `GpuCanaryReset()`;
`GpuCanaryOff()` returns the reason (empty = allowed).

### Protocol

Report pipe `\\.\pipe\MeguLitGpu-<pid>` (DLL → HookBridge, UTF-8 lines):

```
ToMe_GPUHIDE ready version=1 apis=d3d9,d3d11,opengl,gdi
ToMe_GPUHIDE status gdi hooked=6 | status d3d9 hooked gdi=6 | status d3d11 hooked | status opengl hooked | status no d3d gdi=6
ToMe_GPUHIDE learn seq=N area=x,y,w,h atlas=WxH glyphs=K chars=C atlases=A
ToMe_GPUHIDE hit seq=N quads=Q chars=C
ToMe_CHARS engine=gpu line=N hidden=0|1 sw=W sh=H vx=0 vy=0 vw=W vh=H n=K rects=x,y,w,h;... text=<line without blanks>
```

Control pipe `\\.\pipe\MeguLitGpuCtl-<pid>` (HookBridge → DLL): `LINE <text>`, `OFF`, `MODE read` (learn and report
rectangles, never hide), `MODE hide` (default), `QUIT`.

HookBridge events (stdout JSON): `{"type":"hookGpuHide","state":"ready|learn|hit",...}` and `ToMe_CHARS` passed on as
`{"type":"hookChars","line":"ToMe_CHARS ..."}` (the ③ transport). A hit on the selected stream marks it hide-only through
the same path as the GDI hide (`GdiHideHit`).

### Interface for the orchestrator (`native/GpuHideLayer.cs`, partial class `HookBridge`)

| Member | Meaning |
|--------|---------|
| `string[] GpuCapabilities()` | APIs the DLL can hook (`d3d9`, `d3d11`, `opengl`, `gdi`); empty until the DLL reported `ready`. |
| `void GpuArm(string streamId, string line)` | Hide that line of that stream from now on (60 s, renewed by every call). Learns first; never hides when unsure. |
| `void GpuDisarm()` | Stop hiding at once (`OFF`). |
| `void GpuReadOnly(bool on)` | Learn and report rectangles only. |
| `string GpuCanaryOff()` / `void GpuCanaryReset()` | Why the canary turned the layer off for the bound game (empty = allowed) / turn it on again (user's call). |
| `event Action<string,int,int,int> GpuHit` | First hidden draw of a line: stream, line number, quads left out, characters. |

Today HookBridge arms it by itself for the streams layer 3 serves (selected stream without write-back, replacement on or
probing; `GlyphLine` → `GpuLine`, `GlyphOff` → `GpuDisarm`). The orchestrator can take that over.

### Self-test

`native/gpuhide/selftest/run.cmd [dll folder]`: x86 and x64 hosts render a scene quad, a 3-glyph name and an
8-glyph line from one atlas through Direct3D 9 (`DrawPrimitiveUP`; a dynamic vertex buffer through an orthographic
projection; indexed buffers), Direct3D 11 (NDC positions, `Map` / `Unmap`, an input layout made before the DLL loads),
OpenGL (a GLSL program fed by `glBufferData`; fixed function with client arrays and `glOrtho`, both into a framebuffer
object) and through GDI (`BitBlt` from an atlas DIB into a back-buffer DIB, then to the window),
load the DLL after the device exists, and act as HookBridge over the real pipes. Asserted: learning reports the text
area and 8 rectangles at the drawn places with `hidden=0`; from then on the 8 glyphs are left out (pixels), the name
and the scene unchanged, `hit` and `ToMe_CHARS hidden=1` with the same rectangles for the next line; after `OFF` the
line is drawn again. Built and run by `Build.ps1` and CI through `native/native-builds.json` (marker
`MeguLitGpu version=1`, checked by `tools/native-stale.cjs` and `Release.ps1`).

### GPU learner replay

Set `MEGULIT_GPU_REPLAY` in the target process environment before loading the GPU DLL. Its value is a new
absolute file path on a local fixed drive, with an existing parent directory. An unset variable leaves
recording off. Recording starts with the fresh learner and uses one bounded in-memory buffer. It hands
the buffer to a writer thread after `QUIT`, a control-pipe disconnect, or the capture limit. A completed
file ends with `END complete` or `END prefix`. The latter is the valid prefix before a limit or an event
that could not be captured. Send `QUIT` or disconnect the control pipe before closing the game so the writer
can save the file. An existing file is kept.

D3D9, D3D11, OpenGL and GDI feed the same capture boundary. The file records draw batches, target and texture
dimensions, screen and UV rectangles, compositing, line and frame ticks, and the learner's mode, preset and off
transitions. Glyph trace contributes only its per-glyph ordinal. The file uses local numeric ranks in place of
native handles and group keys, preserving the order used to pick among candidates. The tape preserves call order and the tick values supplied to the learner.

Each captured line becomes per-capture synthetic code units. They keep length, repeated-character equality,
blanks, line separators and the two structural speaker delimiters. The file contains only their numeric tokens.
Texture pixels, glyph bitmaps, original text, paths and native addresses stay out of the file. Take fixtures from
short synthetic layouts whenever possible. Review geometry and timing before sharing a capture.

The native GPU self-test builds `replay.exe` into its test output folder. Run `replay.exe input.replay [expected]`
to write the learner's `ToMe_GPUHIDE`, `ToMe_CHARS` and `ToMe_PAGE` messages and the draw masks. A `MASK` row
starts with the zero-based frame and batch numbers followed by the indices of the omitted quads. The optional
expected file compares the output byte for byte after normalizing CRLF line endings. This boundary uses the already-correlated glyph ordinals.
Hook installation, texture scanning, glyph colours and the retained-bitmap adapters have their own self-tests.

`replay.exe --check replay-fixtures` compares the checked-in samples to direct learner calls and replays each
sample twice. The six samples cover the three nearby-nameplate layouts and the centred, moved and partially
painted Aoitori bubbles. `--generate <directory>` exports the same synthetic cases and their direct output for
review. The checked-in output records the shared learner's current behaviour, including the early Aoitori
placement that the CMVS change addresses.

### Live checks (2026-11-14)

- **STEINS;GATE 0 (MAGES, D3D9, Steam): works** (8- and 18-character lines, rectangles, `hidden=1`). The ring-shaped wait
  cursor is a cell of the font atlas at glyph height, so it is hidden with the line.
- **Aoi Tori (CMVS / Purple software, D3D11, Steam English): works.** It draws a blank glyph quad for every space except
  one where the line wraps; the learner walks the line in reading order and drops the blank positions (21 characters,
  24 quads). Its text box is a 9-slice of 28 × 28 tiles from a UI atlas under the text: the first build learned that atlas
  and hid the frame. Now an atlas is learned only when ≥ 60 % of its quads in the area line up with a glyph, groups are
  per texture (two atlases of the same size never mix), per-line sheets must be new and line-sized (not powers of two),
  and only quads of the learned glyph height (± 20 %) are hidden. Frame, corners, cursor and top bar stay.
- eden* (minori, D3D9): presents through `IDirect3DSwapChain9::Present` (now hooked as a frame tick too); its text is
  inside 256-pixel layer tiles, no glyph draws: not hidden.
- Danganronpa: Trigger Happy Havoc (Steam): imports OpenGL but renders with Direct3D 9Ex (`PresentEx`, now hooked).
  **Corrected 2026-11-14** (diag in dialogue, vertex-shader constants shadowed through a `SetVertexShaderConstantF` hook,
  since its device cannot read them back): the constants are all 0; each glyph is its own `DrawIndexedPrimitive` of 2
  triangles over 4 vertices (`nv = 4`, base vertex per glyph) from a dynamic vertex buffer with pixel positions and UVs into
  a 2048 × 2048 atlas, the line drawn into a 1920 × 1088 target. It only looked undecodable because its index buffer is
  static and was filled before injection (no shadow). Generic fix: a 2-triangle draw over exactly 4 vertices is decoded
  from the vertices alone (the bounding box of the 4 is the quad whatever the indices). Self-test mode `d3d9-quad4`
  (static index buffer filled before the DLL, one draw per glyph): fails with the previous DLL, passes now. Live check in
  the game pending (screen given to the compositor matrix).
- **The Song of Saya / 沙耶の唄 (Nitro+, D3D11, Steam, Chinese text): works.** Same engine family as みにくいモジカの子:
  a page-sized glyph sheet (329 × 360) and one quad per character, drawn twice (a shadow / outline buffer and the page).
  93 glyphs on an NVL page learned 93 = 93 (count-only test: the visible text was partly mojibake, so the pushed line
  was 93 placeholder characters), `hidden=1`, rectangles per character; at first only the white fill was hidden and the
  black outline pass stayed, so a learned atlas now hides on every render target of the learned size. Text box and leaf
  cursor stay. (Launch through Steam: `SteamAPI Initialize failed` when started directly.)
- THE SHELL Part I (Artemis, **64-bit**, D3D11, Steam): the 64-bit DLL loads and hooks D3D11 and the game keeps running
  (no crash); but the game stays black on this machine even fully visible and focused (glyph dots saw the same), with
  only one draw kind (an indexed 4-vertex strip from a static buffer), so its text could not be checked.
- 女装山脈 (YU-RIS, D3D9; needs an English path, tested from a copy on H:): the whole frame is composed on the CPU and
  drawn as one full-screen quad (like BRUNS): not hidden.
- Danganronpa: see the corrected note above (4-vertex quads with pixel positions; no shader-constant layout needed).
- Regression after these changes: STEINS;GATE 0 hides the first line again (`hidden=1`, rectangles) and now keeps the
  ring wait cursor.
- Not run: Summer Pockets REFLECTION BLUE (the 64-bit exe exits; the game is SiglusEngine_Steam.exe, Siglus has other
  paths). No game on E: or in the owned Steam library was found that renders its dialogue through OpenGL glyph quads; the
  OpenGL side is covered by the self-test only.

- **CHAOS;CHILD (MAGES, 32-bit, Direct3D 9, Steam): works.** DXT5 atlas pages of 3072 × 4096 and 3072 × 1536, one
  `DrawPrimitiveUP` triangle fan per character, vertex declaration + vertex shader. With the visible page pushed (32
  characters, half-width digits included): `learn` 32 = 32, `ToMe_CHARS hidden=0` with 32 rectangles
  (`360,326,34,34;392,326,34,34;424,326,26,34;…`), `hit`, `hidden=1`; all text gone, the scene and the wait cursor kept;
  after `OFF` the game draws the page again at once.
- WHITE ALBUM2 (Leaf, 32-bit, Direct3D 9): the first build crashed it at the first scene (throwaway devices made through
  the game's own wrapper `d3d9.dll`); fixed (system `d3d9.dll` only), the game then runs normally with the layer loaded.
  The engine draws each line as 128 × 40 tiles of a pre-rendered line texture (like FVP), so nothing is hidden there.
- ダストマニア (BRUNS) and the "transparent font sheet at load time" idea: not done, because it cannot be generic or safe.
  The sheets are encrypted (`EENZ`), so serving a changed file means decoding an engine format; the decoded sheet in
  memory is the engine's own data, and blanking its cells changes game data (the rule this layer exists to keep), for
  every use of the font at once (names, choices, backlog, menus), for the whole run (no per-line arm / disarm), and which
  cell is which character is engine knowledge. Character rectangles are not observable either: the engine copies glyph
  pixels with plain CPU code into its frame buffer, with no API call per character. It needs an engine-level path.

- **みにくいモジカの子 (Nitro+, 32-bit, Direct3D 11): works.** The engine builds a small glyph sheet for each line
  (e.g. 76 × 88 for 「いたい。」) and draws one quad per character, twice (an effect buffer and the 1280 × 720
  composition target). With the line pushed: `learn` (4 glyphs = 4 characters), `ToMe_CHARS engine=gpu hidden=0`, then
  `hit` and `ToMe_CHARS hidden=1` with `rects=572,310,34,40;606,310,34,40;640,310,34,40;674,310,34,40`; the line is gone
  from the frame, the scene stays, and after `OFF` (or 60 s without a push) the game draws it again at once. Tested on
  the opening lines (centred text); the ADV text window was not reached in this run.

- ダストマニア・グロテスク（BRUNS, 32-bit, Direct3D 9）: the DLL hooks the game's device (all draws seen), but the
  engine composes the whole frame (background, characters, text window, glyphs) on the CPU into one 1024 × 1024 texture
  and draws one full-screen quad per frame. No glyph ever reaches Direct3D or GDI as its own draw, so this layer cannot
  hide it. It needs the engine's own path (the LunaHook BRUNS `push_back` hook, or a hook on the engine's glyph copy).
- いろとりどりのヒカリHD (FVP, 32-bit, Direct3D 9, Chinese patch): hooked, all draws seen (into a 2048 × 2048 render
  target, then composited). FVP rasterises each whole line on the CPU into one image and draws it as 256 × 256 tile
  quads (4 quads for one line, the glow box included), so there are no per-glyph quads either. A "line texture" mode
  (hide the tile quads that appeared with the line in the text band) would be the next step for this family; it is
  not built because it cannot tell text tiles from other new tiles as safely as glyph quads.
- Not covered yet: Direct3D 12, OpenGL vertex array objects bound before the DLL arrived with buffers never written again (same learner, `GlyphQuads.h`, needs the API side), Direct3D 9 vertex shaders /
  declarations, Direct3D 11 instanced / indirect draws, engines that bake the whole text into one texture per line (one quad per line, not per glyph).

### Unarmed page ≠ "the game draws the line" (2026-11-15, E691)

- Report (user group, 1.4.10, 時計仕掛けのレイライン -黄昏時の境界線-, SoftPal `PAL.dll`, Direct3D 9): 「翻译倒是正常显示了，但是
  只有翻译了，要替换的原文没了」. 1.4.10 hid the writable Pal stream by write-back again (glyph pass-through needs proof),
  but layer 4 still reported the text window as a page with `awake=1 armed=0`. The reader treated every unarmed awake
  page as "the game's own text is on screen" (`megulit-place-game-drawn`) and dropped its Japanese, while write-back
  had already blanked the game's line: the box showed the translation alone. The one line the user screenshotted with
  the game's Japanese + MeguLit's Chinese fits the same rule (a line the bridge passed through, e.g. the GDI trial line).
- Fix (all engines, reader layer): `core/gal-native.cjs` passes `hook-native originalReplaced()` to
  `OverlayPlacement.page()`; an unarmed awake page while another path hides the line goes out as `{elsewhere:true}` and
  `web/reader/modules/text-place.js` places the line as without a page (glyph boxes, or its own place without plate).
  And whenever the game still draws the line itself (an unarmed page with nothing else hiding it, a ③ `visible` note)
  the reader is not placed over the game's line but goes back to its own window, bilingual (Japanese on top, clickable
  for lookups; translation under it), never on a plate (2026-11-16: the user rejected any plate behind MeguLit text).
  The "only the translation was left" report is covered by `elsewhere` alone. An armed page and a gone window keep their rules.
- Lesson: a layer's page message is only that layer's word. "Not armed" means "this layer does not hide", not "nothing
  hides"; combine it with the other hide paths before deciding who draws the Japanese.
- Test: `validation/page-elsewhere.test.cjs` (node + headless Edge DOM), `validation/saya-garble.test.cjs` updated to the
  bilingual fallback. Headless before/after on the user's screenshot: before = translation alone, after = both. Not verified in the game: this copy needs the
  DVD (only an unknown no-DVD patch exe in the folder, not run); verify with the reporter's log / next live check.
