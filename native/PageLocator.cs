// SPDX-License-Identifier: GPL-3.0-or-later
// E306 (user 2026-11-10: "make it the best hook": every engine should place each sentence of a full-screen page where
// the game drew it, not only ISLAND, KiriKiri and Ren'Py). Engines without their own position source (BGI, Siglus,
// Artemis, CatSystem2, anything LunaHook reads) are located on the picture instead: when a new hook line arrives,
// MeguLit sends it here (pageLocate); the bound game's client area is read (GameCapture, never MeguLit's own windows)
// and passed through the system's Japanese OCR, and the hook line is aligned to the OCR rows. The rows it covers give
// the sentence's box and the game's own line breaks (the hook text, split where the game wrapped it: OCR only finds
// where, the characters always come from the hook). The result goes out as the same hookEngineLine as the native
// page engines (engine "ocr"): nvl=1 when the sentence sits in the upper half (a full-screen page), same=1 while the
// sentence before it is still on screen. ADV games report nvl=0 and keep the usual single-line reader; after a run of
// ADV lines only every fourth line is read, so an ADV game pays almost nothing. C# 5 (the .NET Framework csc).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

public sealed class PageLocator : IDisposable {
 [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
 [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }

 public sealed class Row { public string Text; public Rectangle Box; public string Color, Glow, Alt; public Row(string text, Rectangle box) { Text = text; Box = box; } }
 public sealed class Found { public int First, Last; public List<string> Parts = new List<string>(); public double Coverage; }

 readonly Action<object> Emit;
 readonly object Gate = new object();
 readonly AutoResetEvent Wake = new AutoResetEvent(false);
 Thread Worker;
 volatile bool Disposed;
 IntPtr Target; string Text; DateTime At; int Serial; bool Art;
 string PreviousText; bool PreviousNvl; long Line; int AdvRun, Skipped;
 OcrEngine Engine; bool EngineTried;

 public PageLocator(Action<object> emit) { Emit = emit; }

 /* 2026-11-12 (user: art text, opening titles and credits, must be readable too, with MeguLit drawing over it): art=true
    locates a line that is not in the text window. The game keeps drawing it; MeguLit lays an invisible, selectable copy
    and the translation over it (artText), and hides them when the picture no longer shows the line. */
 public void Request(IntPtr target, string text) { Request(target, text, false); }
 public void Request(IntPtr target, string text, bool art) {
  if (target == IntPtr.Zero || String.IsNullOrWhiteSpace(text) || text.Length > 600) return;
  lock (Gate) {
   if (art) { Target = target; Text = text; At = DateTime.UtcNow; Serial++; Art = true; if (Worker == null) { Worker = new Thread(Run) { IsBackground = true, Name = "MeguLit page locator" }; Worker.Start(); } Wake.Set(); return; }
   Art = false;
   // After 12 ADV lines in a row only every fourth line is read; a page found again restores every line.
   if (AdvRun >= 12 && ++Skipped % 4 != 0) return;
   Target = target; Text = text; At = DateTime.UtcNow; Serial++;
   if (Worker == null) { Worker = new Thread(Run) { IsBackground = true, Name = "MeguLit page locator" }; Worker.Start(); }
  }
  Wake.Set();
 }

 void Run() {
  int done = 0;
  while (!Disposed) {
   Wake.WaitOne(1000);
   IntPtr target; string text; DateTime at; int serial; bool art;
   lock (Gate) { target = Target; text = Text; at = At; serial = Serial; art = Art; }
   if (serial == done || text == null) continue;
   done = serial;
   try { if (art) LocateArt(target, text, at, serial); else Locate(target, text, at, serial); } catch (Exception e) { Emit(new { type = "pageLocateStatus", status = "error " + e.Message }); }
  }
 }

 bool Stale(int serial) { lock (Gate) return serial != Serial || Disposed; }

 // The line types out: read at 0.4 s, then again while the game is still drawing it, up to 3.5 s.
 void Locate(IntPtr target, string text, DateTime at, int serial) {
  if (!EngineTried) { EngineTried = true; try { Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { Engine = null; } if (Engine == null) Emit(new { type = "pageLocateStatus", status = "no Japanese OCR" }); }
  if (Engine == null) return;
  foreach (int ms in new[] { 400, 1000, 2000, 3500 }) {
   int wait = (int)(at.AddMilliseconds(ms) - DateTime.UtcNow).TotalMilliseconds;
   if (wait > 0) Thread.Sleep(wait);
   if (Stale(serial)) return;
   RECT rect; if (!GetClientRect(target, out rect) || rect.Right < 64 || rect.Bottom < 64 || rect.Right > 7680 || rect.Bottom > 4320) return;
   int w = rect.Right, h = rect.Bottom;
   List<Row> rows;
   using (var image = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
    if (!GameCapture.Into(target, image, 3)) return;
    lock (OcrLock) rows = Read(image, w, h);
   }
   if (Stale(serial)) return;
   var found = Find(rows, text);
   if (found == null) continue;
   Report(found, rows, text, w, h);
   return;
  }
  Emit(new { type = "pageLocateStatus", status = "miss chars=" + text.Length });
  lock (Gate) { if (AdvRun < 12) AdvRun++; }
 }

 bool Capture(IntPtr target, out List<Row> rows, out int w, out int h) {
  rows = null; w = h = 0;
  RECT rect; if (!GetClientRect(target, out rect) || rect.Right < 64 || rect.Bottom < 64 || rect.Right > 7680 || rect.Bottom > 4320) return false;
  w = rect.Right; h = rect.Bottom;
  using (var image = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
   if (!GameCapture.Into(target, image, 3)) return false;
   lock (OcrLock) rows = Read(image, w, h);
  }
  return true;
 }
 // Art text: found within 3 s of the hook line, then followed every 0.7 s for up to 30 s; hidden when the picture lost it.
 void LocateArt(IntPtr target, string text, DateTime at, int serial) {
  if (!EngineTried) { EngineTried = true; try { Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { Engine = null; } }
  if (Engine == null) return;
  Found found = null; List<Row> rows = null; int w = 0, h = 0;
  foreach (int ms in new[] { 250, 800, 1600, 3000 }) {
   int wait = (int)(at.AddMilliseconds(ms) - DateTime.UtcNow).TotalMilliseconds;
   if (wait > 0) Thread.Sleep(wait);
   if (Stale(serial)) return;
   if (!Capture(target, out rows, out w, out h)) return;
   found = Find(rows, text);
   if (found != null) break;
  }
  if (found == null) { Emit(new { type = "pageLocateStatus", status = "art miss chars=" + text.Length }); return; }
  lock (Gate) ArtActive = text;
  ArtEmit(serial, text, found, rows, w, h, true);
  int misses = 0;
  for (int i = 0; i < 43 && !Stale(serial); i++) {
   Thread.Sleep(700);
   if (Stale(serial)) break;
   List<Row> again; int w2, h2;
   if (!Capture(target, out again, out w2, out h2)) break;
   var f2 = Find(again, text);
   if (f2 == null) { if (++misses >= 2) break; continue; }
   misses = 0;
  }
  lock (Gate) if (ArtActive == text) ArtActive = null;
  ArtEmit(serial, text, null, null, w, h, false);
 }
 void ArtEmit(int id, string text, Found f, List<Row> rows, int w, int h, bool visible) {
  var parts = new List<object>();
  if (f != null) for (int i = f.First; i <= f.Last; i++) { var b = rows[i].Box; string t = i - f.First < f.Parts.Count ? f.Parts[i - f.First] : rows[i].Text; parts.Add(new { text = t, x = b.Left, y = b.Top, w = b.Width, h = b.Height }); }
  Emit(new { type = "artText", id = id, text = text, visible = visible, rows = parts, sw = w, sh = h, at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
 }

 // ---- art scan: the OCR read path (2026-11-12) ----------------------------------------------------------------------
 /* User: opening titles, credits and chapter cards must be bilingual in every game, also when no hook stream carries them
    (ファタモルガーナの館: 館がある / 寝起きざまのように are pictures, no drawText at all). While MeguLit asks for it (the engine
    says its text window is hidden, or no hook line arrived for 2 s) the bound game's client area is read every 0.7 s; only
    when the picture changed (a 64x36 grey thumbnail differs) does the system's Japanese OCR run. Japanese rows that are not
    the current dialogue line, its name or the text-box band go out as artText with the recognised text; the game keeps
    drawing them (OCR reads, never covers: MeguLit lays only its invisible readable copy and the translation). A group is
    shown once two reads agree and hidden after two reads without it. Nothing is ever written to the game. */
 public sealed class ScanItem { public int Id; public string Text; public List<Row> Rows; public int Seen, Misses; public bool Shown, Foreign; public DateTime Since; }
 volatile bool ScanOn; string ScanSeen; IntPtr ScanTarget; string ScanDialog, ScanSpeaker; bool ScanBand, ScanForeign; Thread Scanner; string ArtActive;
 OcrEngine ForeignEngine; bool ForeignTried;
 readonly List<ScanItem> ScanItems = new List<ScanItem>(); int ScanId = 1000000;
 public void Scan(IntPtr target, bool on, string dialog, string speaker, bool band) { Scan(target, on, dialog, speaker, band, false); }
 /* foreign (2026-11-13): MeguLit knows the game's script in other languages (a localized build drawing its opening as pictures
    of the translated text, Summer Pockets Steam Chinese); rows in Chinese are then read again with the Chinese OCR and sent as
    foreign groups, which MeguLit maps back to the Japanese line or drops. */
 public void Scan(IntPtr target, bool on, string dialog, string speaker, bool band, bool foreign) {
  lock (Gate) { ScanTarget = target; ScanDialog = String.IsNullOrWhiteSpace(dialog) ? null : dialog; ScanSpeaker = String.IsNullOrWhiteSpace(speaker) ? null : speaker; ScanBand = band; ScanForeign = foreign; }
  bool was = ScanOn; ScanOn = on && target != IntPtr.Zero; if (was != ScanOn) { ScanSeen = null; Emit(new { type = "pageLocateStatus", status = "art scan " + (ScanOn ? "on" : "off") }); }
  if (ScanOn && Scanner == null) { Scanner = new Thread(ScanRun) { IsBackground = true, Name = "MeguLit art scan", Priority = ThreadPriority.BelowNormal }; Scanner.Start(); }
 }
 void ScanRun() {
  byte[] last = null; int idle = 0; DateTime lastOcr = DateTime.MinValue;
  while (!Disposed) {
   /* 2026-11-13 openings fade a line in and out within 3 s: read faster while something is shown or being settled */
   bool busy = false; foreach (var it in ScanItems) if (it.Shown || it.Seen > 0) busy = true;
   Thread.Sleep(busy ? 400 : 700);
   if (!ScanOn) { ScanClear(); last = null; continue; }
   try {
    IntPtr target; string dialog, speaker; bool band, foreign;
    lock (Gate) { target = ScanTarget; dialog = ScanDialog; speaker = ScanSpeaker; band = ScanBand; foreign = ScanForeign; }
    if (!EngineTried) { EngineTried = true; try { Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { Engine = null; } }
    if (Engine == null || GameCapture.Busy(target)) continue;
    RECT rect; if (!GetClientRect(target, out rect) || rect.Right < 64 || rect.Bottom < 64 || rect.Right > 7680 || rect.Bottom > 4320) continue;
    int w = rect.Right, h = rect.Bottom; List<List<Row>> groups, foreignGroups = new List<List<Row>>(); byte[] thumb;
    string active; lock (Gate) active = ArtActive;
    using (var image = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
     if (!GameCapture.Into(target, image, 3)) continue;
     thumb = Thumb(image);
     bool pending = false; foreach (var it in ScanItems) if (!it.Shown || it.Misses > 0) pending = true;
     // The same picture: what is shown stays; a candidate seen once (or missed once) is read again to settle it.
     if (last != null && !Changed(last, thumb) && !pending) continue;
     // A picture that keeps moving with no Japanese on it (video, particles) is read every 2.1 s instead of 0.7 s.
     if (idle >= 4 && (DateTime.UtcNow - lastOcr).TotalMilliseconds < 2000) continue;
     last = thumb; lastOcr = DateTime.UtcNow;
     List<Row> rows; lock (OcrLock) rows = Read(image, w, h);
     groups = ScanGroups(rows, w, h, dialog, speaker, band, active);
     if (foreign) {
      if (!ForeignTried) { ForeignTried = true; try { ForeignEngine = OcrEngine.TryCreateFromLanguage(new Language("zh-Hans-CN")); } catch { ForeignEngine = null; } }
      if (ForeignEngine != null) lock (OcrLock) foreignGroups = SplitForeign(this, image, w, h, rows, groups, dialog, speaker, band, active, ForeignEngine);
     }
     foreach (var g in groups) foreach (var r in g) Paint(image, r);
     foreach (var g in foreignGroups) foreach (var r in g) Paint(image, r);
    }
    if (!ScanOn) continue;
    /* E540: one log line when what the scan reads changes, so a silent opening can be told from an unread one */
    string seen = groups.Count + "/" + foreignGroups.Count + (groups.Count > 0 ? " " + GroupText(groups[0]) : foreignGroups.Count > 0 ? " " + GroupText(foreignGroups[0]) : "");
    if (seen != ScanSeen) { ScanSeen = seen; Emit(new { type = "pageLocateStatus", status = "art scan " + (seen.Length > 60 ? seen.Substring(0, 60) : seen) }); }
    idle = groups.Count + foreignGroups.Count == 0 ? Math.Min(idle + 1, 8) : 0;
    ScanReconcile(groups, foreignGroups, w, h);
   } catch (Exception e) { Emit(new { type = "pageLocateStatus", status = "art scan error " + e.Message }); Thread.Sleep(2000); }
  }
 }
 /* Groups the Japanese OCR read with almost no kana (Chinese drawn by a localized build, read by the Japanese OCR as kanji
    soup or a short "kanji card") are read again with the Chinese OCR; the Chinese groups over them leave the Japanese list
    and go out as foreign groups, each row keeping the Japanese reading (Alt) so a real kanji card can still be shown. */
 static List<List<Row>> SplitForeign(PageLocator self, Bitmap image, int w, int h, List<Row> rows, List<List<Row>> groups, string dialog, string speaker, bool band, string active, OcrEngine zhEngine) {
  var outList = new List<List<Row>>();
  bool any = groups.Exists(g => KanaShare(GroupText(g)) < 0.4) || (groups.Count == 0 && rows.Exists(r => ForeignLike(r.Text)));
  if (!any) return outList;
  var zh = ScanGroups(self.Read(image, w, h, zhEngine), w, h, dialog, speaker, band, active, ForeignLike);
  foreach (var z in zh) {
   Rectangle u = z[0].Box; foreach (var r in z) u = Rectangle.Union(u, r.Box);
   string alt = null; bool real = false;
   for (int i = groups.Count - 1; i >= 0; i--) { var g = groups[i]; Rectangle v = g[0].Box; foreach (var r in g) v = Rectangle.Union(v, r.Box); if (!u.IntersectsWith(v)) continue; if (KanaShare(GroupText(g)) >= 0.25 && !Simplified(GroupText(z))) { real = true; break; } alt = GroupText(g); groups.RemoveAt(i); }
   if (real) continue; foreach (var r in z) r.Alt = alt; outList.Add(z);
  }
  return outList;
 }
 /* Simplified-only characters (common ones): two of them in the Chinese read and the Japanese read's kana are OCR noise */
 const string SimplifiedOnly = "们这说过时为对会来个还么样让从见现发经开关头问话车长门马鸟东气书学习认识题实与专亲几岁总选择应该刚爷阳广边飞脑间记忆种续钟钱给将无论没虽觉帘许达这里";
 public static bool Simplified(string s) { int n = 0; foreach (char c in s ?? "") if (SimplifiedOnly.IndexOf(c) >= 0 && ++n >= 2) return true; return false; }
 static double KanaShare(string s) { int k = 0, n = 0; foreach (char c in Tidy(s)) { if (Kana(c)) k++; if (Char.IsLetterOrDigit(c)) n++; } return n == 0 ? 0 : (double)k / n; }
 /* Chinese a localized build draws (no kana, four or more Han characters, mostly CJK) */
 public static bool ForeignLike(string text) {
  string t = Tidy(text); int kana = 0, kanji = 0, letters = 0;
  foreach (char c in t) { if (Kana(c)) kana++; else if (Kanji(c)) kanji++; if (Char.IsLetterOrDigit(c)) letters++; }
  return kana == 0 && kanji >= 4 && kanji >= letters * 0.7;
 }
 /* 2026-11-13 (user: the translation looks like the original): the row's ink and glow colours, read from the picture. The
    background is the box edge; the ink is the tenth of pixels farthest from it; the glow is the band between them when it
    differs from both (a soft blue halo, a dark outline). */
 static void Paint(Bitmap image, Row r) {
  try {
   var b = Rectangle.Intersect(new Rectangle(r.Box.Left - 4, r.Box.Top - 4, r.Box.Width + 8, r.Box.Height + 8), new Rectangle(0, 0, image.Width, image.Height));
   if (b.Width < 6 || b.Height < 6) return;
   int step = Math.Max(1, Math.Min(b.Width, b.Height) / 40);
   long er = 0, eg = 0, eb = 0, en = 0;
   for (int x = b.Left; x < b.Right; x += step) foreach (int y in new[] { b.Top, b.Bottom - 1 }) { var c = image.GetPixel(x, y); er += c.R; eg += c.G; eb += c.B; en++; }
   for (int y = b.Top; y < b.Bottom; y += step) foreach (int x in new[] { b.Left, b.Right - 1 }) { var c = image.GetPixel(x, y); er += c.R; eg += c.G; eb += c.B; en++; }
   if (en == 0) return; double br = er / (double)en, bg = eg / (double)en, bb = eb / (double)en;
   var px = new List<KeyValuePair<double, Color>>();
   for (int y = r.Box.Top; y < r.Box.Bottom && y < image.Height; y += step) for (int x = r.Box.Left; x < r.Box.Right && x < image.Width; x += step) { if (x < 0 || y < 0) continue; var c = image.GetPixel(x, y); double d = Math.Abs(c.R - br) + Math.Abs(c.G - bg) + Math.Abs(c.B - bb); px.Add(new KeyValuePair<double, Color>(d, c)); }
   if (px.Count < 20) return; px.Sort((p, q) => q.Key.CompareTo(p.Key));
   if (px[0].Key < 40) return;
   Func<int, int, string> mean = (from, to) => { long R = 0, G = 0, B = 0; int n = 0; for (int i = from; i < to && i < px.Count; i++) { R += px[i].Value.R; G += px[i].Value.G; B += px[i].Value.B; n++; } return n == 0 ? null : String.Format("#{0:x2}{1:x2}{2:x2}", R / n, G / n, B / n); };
   int ink = Math.Max(3, px.Count / 10); r.Color = mean(0, ink);
   if (px[Math.Min(px.Count - 1, px.Count / 4)].Key > 30) r.Glow = mean(px.Count / 6, px.Count / 3);
  } catch { }
 }
 static byte[] Thumb(Bitmap image) {
  using (var small = new Bitmap(64, 36, PixelFormat.Format24bppRgb)) {
   using (var g = Graphics.FromImage(small)) { g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear; g.DrawImage(image, 0, 0, 64, 36); }
   var o = new byte[64 * 36];
   for (int y = 0; y < 36; y++) for (int x = 0; x < 64; x++) { var c = small.GetPixel(x, y); o[y * 64 + x] = (byte)((c.R * 3 + c.G * 6 + c.B) / 10); }
   return o;
  }
 }
 /* E540 (WHITE ALBUM2 opening, live 2026-11-13): one thin white line on a dark screen replacing another moves the 64x36
    thumbnail by only 0.6-0.8 on average, under the 1.2 the scan used, so no card after the first was read. A change is also
    eight cells moving by 16 or more (a new line: 14-68 cells; drifting snow and sparkles: 0-4). */
 public static bool Changed(byte[] a, byte[] b) {
  if (Differ(a, b) >= 1.2) return true;
  int cells = 0; for (int i = 0; i < a.Length; i++) if (Math.Abs(a[i] - b[i]) >= 16 && ++cells >= 8) return true;
  return false;
 }
 public static double Differ(byte[] a, byte[] b) { if (a == null || b == null || a.Length != b.Length) return 255; long s = 0; for (int i = 0; i < a.Length; i++) s += Math.Abs(a[i] - b[i]); return (double)s / a.Length; }

 // OCR puts spaces between Japanese characters; they are dropped next to CJK characters.
 public static string Tidy(string s) {
  var o = new StringBuilder(); s = (s ?? "").Trim();
  for (int i = 0; i < s.Length; i++) {
   if (Char.IsWhiteSpace(s[i])) { int j = i; while (j < s.Length && Char.IsWhiteSpace(s[j])) j++; bool cjk = o.Length > 0 && j < s.Length && (Cjk(o[o.Length - 1]) || Cjk(s[j])); if (!cjk) o.Append(' '); i = j - 1; continue; }
   o.Append(s[i]);
  }
  return o.ToString();
 }
 static bool Cjk(char c) { return (c >= '　' && c <= 'ヿ') || (c >= '㐀' && c <= '鿿') || (c >= '＀' && c <= '￯'); }
 static bool Kana(char c) { return (c >= 'ぁ' && c <= 'ゟ') || (c >= 'ァ' && c <= 'ヺ'); }
 static bool Kanji(char c) { return (c >= '㐀' && c <= '鿿'); }
 // Japanese a reader would want: kana in it (Chinese text, a translation the game draws, has none), or a short kanji card
 // (第一章, 序幕); mostly Japanese characters; at least two of them.
 public static bool Japanese(string text) {
  string t = Tidy(text); int kana = 0, kanji = 0, letters = 0;
  foreach (char c in t) { if (Kana(c)) kana++; else if (Kanji(c)) kanji++; if (Char.IsLetterOrDigit(c)) letters++; }
  int jp = kana + kanji;
  if (jp < 2 || jp < letters * 0.6) return false;
  return kana >= 1 || (kanji >= 2 && kanji <= 8);
 }
 // Rows to groups: Japanese rows outside the dialogue, then neighbours (gap under 1.3 rows, similar height, overlapping
 // or sharing a centre line) joined into one item, a poem's lines read as one.
 public static List<List<Row>> ScanGroups(List<Row> rows, int w, int h, string dialog, string speaker, bool band, string active) { return ScanGroups(rows, w, h, dialog, speaker, band, active, Japanese); }
 public static List<List<Row>> ScanGroups(List<Row> rows, int w, int h, string dialog, string speaker, bool band, string active, Func<string, bool> accept) {
  var skip = new bool[rows.Count];
  foreach (string known in new[] { dialog, active }) {
   if (known == null) continue; var f = Find(rows, known); if (f == null) continue;
   int top = rows[f.First].Box.Top, bottom = rows[f.Last].Box.Bottom, size = Math.Max(8, rows[f.First].Box.Height);
   for (int i = 0; i < rows.Count; i++) { var b = rows[i].Box; if (i >= f.First && i <= f.Last) skip[i] = true; else if (known == dialog && b.Bottom > top - size * 3 && b.Top < bottom + size) skip[i] = true; }
  }
  if (speaker != null) { string sp = Plain(speaker, null); for (int i = 0; i < rows.Count; i++) { string p = Plain(rows[i].Text, null); if (p.Length > 0 && p.Length <= sp.Length + 2 && Lcs(p, sp) >= Math.Max(1, p.Length - 1)) skip[i] = true; } }
  var keep = new List<Row>();
  for (int i = 0; i < rows.Count; i++) {
   if (skip[i]) continue; var b = rows[i].Box;
   if (band && b.Top + b.Height / 2 > h * 0.6) continue;
   if (b.Height < Math.Max(6, h / 90) || !accept(rows[i].Text)) continue;
   keep.Add(new Row(Tidy(rows[i].Text), b));
  }
  keep.Sort((a, c) => a.Box.Top.CompareTo(c.Box.Top));
  /* one line the OCR split at a wide gap (a comma, a centred phrase): same baseline, similar height, gap under two characters */
  keep.Sort((a, c) => Math.Abs(a.Box.Top - c.Box.Top) > Math.Min(a.Box.Height, c.Box.Height) / 2 ? a.Box.Top.CompareTo(c.Box.Top) : a.Box.Left.CompareTo(c.Box.Left));
  for (int i = keep.Count - 1; i > 0; i--) { var p = keep[i - 1].Box; var q = keep[i].Box; int hh = Math.Max(p.Height, q.Height);
   if (Math.Abs(p.Top - q.Top) <= hh / 3 && Math.Min(p.Height, q.Height) >= hh * 0.7 && q.Left >= p.Left && q.Left - p.Right < hh * 2) { keep[i - 1] = new Row(keep[i - 1].Text + keep[i].Text, Rectangle.Union(p, q)); keep.RemoveAt(i); } }
  var groups = new List<List<Row>>();
  foreach (var r in keep) {
   List<Row> into = null;
   foreach (var g in groups) {
    var p = g[g.Count - 1].Box; var q = r.Box;
    double hh = Math.Max(p.Height, q.Height), gap = q.Top - p.Bottom;
    bool near = gap < hh * 1.3 && gap > -hh * 0.5 && Math.Min(p.Height, q.Height) >= hh * 0.6;
    bool aligned = Math.Min(p.Right, q.Right) > Math.Max(p.Left, q.Left) || Math.Abs((p.Left + p.Right) - (q.Left + q.Right)) / 2 < hh * 2;
    if (near && aligned) { into = g; break; }
   }
   if (into == null) { into = new List<Row>(); groups.Add(into); }
   into.Add(r);
  }
  return groups;
 }
 public static string GroupText(List<Row> g) { var s = new StringBuilder(); foreach (var r in g) s.Append(r.Text); return s.ToString(); }
 static bool Same(string a, string b) { string p = Plain(a, null), q = Plain(b, null); if (p.Length == 0 || q.Length == 0) return false; return Lcs(p, q) >= Math.Max(p.Length, q.Length) * 0.6; }
 static bool Overlap(List<Row> a, List<Row> b) {
  Rectangle u = a[0].Box, v = b[0].Box; foreach (var r in a) u = Rectangle.Union(u, r.Box); foreach (var r in b) v = Rectangle.Union(v, r.Box);
  return u.IntersectsWith(v);
 }
 void ScanReconcile(List<List<Row>> groups, int w, int h) { ScanReconcile(groups, new List<List<Row>>(), w, h); }
 void ScanReconcile(List<List<Row>> groups, List<List<Row>> foreignGroups, int w, int h) {
  var matched = new HashSet<ScanItem>(); var all = new List<List<Row>>(groups); all.AddRange(foreignGroups);
  foreach (var g in all) { bool isForeign = foreignGroups.Contains(g);
   string text = GroupText(g); ScanItem it = null;
   foreach (var x in ScanItems) if (!matched.Contains(x) && (Same(x.Text, text) || (Overlap(x.Rows, g) && (text.Contains(x.Text) || x.Text.Contains(text))))) { it = x; break; }
   if (it == null) { it = new ScanItem { Id = ++ScanId, Text = text, Rows = g, Since = DateTime.UtcNow, Foreign = isForeign }; ScanItems.Add(it); }
   matched.Add(it); it.Misses = 0; it.Seen++;
   bool changed = it.Text != text || it.Rows.Count != g.Count || Math.Abs(it.Rows[0].Box.Top - g[0].Box.Top) > g[0].Box.Height / 2 || Math.Abs(it.Rows[0].Box.Left - g[0].Box.Left) > g[0].Box.Height;
   it.Text = text; it.Rows = g;
   if ((it.Seen >= 2 || it.Foreign) && (!it.Shown || changed)) { it.Shown = true; ScanEmit(it, w, h, true); }
  }
  for (int i = ScanItems.Count - 1; i >= 0; i--) {
   var x = ScanItems[i]; if (matched.Contains(x)) continue;
   if (++x.Misses >= 2 || !x.Shown) { if (x.Shown) ScanEmit(x, w, h, false); ScanItems.RemoveAt(i); }
  }
 }
 void ScanEmit(ScanItem it, int w, int h, bool visible) {
  var parts = new List<object>();
  if (visible) foreach (var r in it.Rows) parts.Add(new { text = r.Text, x = r.Box.Left, y = r.Box.Top, w = r.Box.Width, h = r.Box.Height, color = r.Color, glow = r.Glow });
  string alt = null; if (it.Foreign) foreach (var r in it.Rows) if (r.Alt != null) { alt = r.Alt; break; }
  Emit(new { type = "artText", id = it.Id, text = it.Text, visible = visible, source = "ocr", foreign = it.Foreign, alt = alt, rows = parts, sw = w, sh = h, at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
 }
 void ScanClear() { foreach (var x in ScanItems) if (x.Shown) ScanEmit(x, 0, 0, false); ScanItems.Clear(); }

 /* diagnostics: the art scan on a saved picture (--art-scan-file <png>): groups, foreign groups and their sampled colours */
 public static string ScanFile(string file) {
  var o = new StringBuilder(); var locator = new PageLocator(m => { });
  try { locator.Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { } if (locator.Engine == null) return "no Japanese OCR";
  OcrEngine zhEngine = null; try { zhEngine = OcrEngine.TryCreateFromLanguage(new Language("zh-Hans-CN")); } catch { }
  using (var src = new Bitmap(file)) using (var image = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb)) {
   using (var g = Graphics.FromImage(image)) g.DrawImage(src, 0, 0, src.Width, src.Height);
   var rows = locator.Read(image, image.Width, image.Height); var groups = ScanGroups(rows, image.Width, image.Height, null, null, false, null);
   var fgs = zhEngine != null ? SplitForeign(locator, image, image.Width, image.Height, rows, groups, null, null, false, null, zhEngine) : new List<List<Row>>();
   foreach (var gr in groups) foreach (var r in gr) { Paint(image, r); o.AppendLine("ja " + r.Text + " " + r.Box + " " + r.Color + " " + r.Glow); }
   foreach (var gr in fgs) foreach (var r in gr) { Paint(image, r); o.AppendLine("foreign " + r.Text + " alt=" + r.Alt + " " + r.Box + " " + r.Color + " " + r.Glow); }
   if (o.Length == 0) foreach (var r in rows) o.AppendLine("raw " + r.Text + " " + r.Box);
  }
  return o.ToString();
 }
 public static string ScanSelfTest() {
  Func<string, int, int, int, Row> row = (t, x, y, hh) => new Row(t, new Rectangle(x, y, 40 * t.Length, hh));
  { var dark = new byte[64 * 36]; var line = (byte[])dark.Clone(); for (int x = 14; x < 46; x++) line[18 * 64 + x] = 60; var snow = (byte[])dark.Clone(); for (int i = 0; i < 4; i++) snow[i * 300] = 90;
    if (Differ(dark, line) >= 1.2 || !Changed(dark, line) || Changed(dark, snow)) return "changed"; }
  if (Tidy("館 が あ る") != "館がある" || Tidy("Save  Load") != "Save Load") return "tidy";
  if (!Japanese("館がある") || !Japanese("第一章") || Japanese("这是中文翻译文本内容") || Japanese("SAVE") || Japanese("あ")) return "japanese";
  // A centred two-line card, the dialogue line with its name above it in the box, and a menu row: only the card is art.
  var rows = new List<Row> { row("館がある", 560, 300, 40), row("寝起きざまのように", 460, 352, 40), row("メル", 120, 560, 28), row("「おはようございます」と彼女は言った。", 120, 600, 32), row("セーブ ロード", 900, 690, 20) };
  var g = ScanGroups(rows, 1280, 720, "「おはようございます」と彼女は言った。", "メル", true, null);
  if (g.Count != 1 || GroupText(g[0]) != "館がある寝起きざまのように" || g[0].Count != 2) return "groups " + g.Count;
  // No dialogue (an opening): rows far apart are separate items.
  var o = ScanGroups(new List<Row> { row("館がある", 560, 120, 40), row("寝起きざまのように", 460, 500, 40) }, 1280, 720, null, null, false, null);
  if (o.Count != 2) return "separate " + o.Count;
  // A line the hook already placed (art mode) is not read twice.
  var a = ScanGroups(new List<Row> { row("館がある", 560, 300, 40) }, 1280, 720, null, null, false, "館がある");
  if (a.Count != 0) return "active";
  // Reconcile: shown once two reads agree, kept while seen, hidden after two reads without it.
  var sent = new List<string>(); var loc = new PageLocator(m => { var t = m.GetType(); sent.Add(t.GetProperty("visible").GetValue(m, null) + ":" + t.GetProperty("text").GetValue(m, null)); });
  var card = new List<List<Row>> { new List<Row> { row("館がある", 560, 300, 40) } }; var none = new List<List<Row>>();
  loc.ScanReconcile(card, 1280, 720); if (sent.Count != 0) return "shown too early";
  loc.ScanReconcile(card, 1280, 720); if (sent.Count != 1 || sent[0] != "True:館がある") return "not shown " + String.Join(",", sent.ToArray());
  loc.ScanReconcile(card, 1280, 720); if (sent.Count != 1) return "re-sent";
  loc.ScanReconcile(none, 1280, 720); if (sent.Count != 1) return "hidden after one miss";
  loc.ScanReconcile(none, 1280, 720); if (sent.Count != 2 || sent[1] != "False:館がある") return "not hidden";
  if (Differ(new byte[] { 1, 2 }, new byte[] { 1, 2 }) != 0) return "differ";
  return "0";
 }

 void Report(Found f, List<Row> rows, string text, int w, int h) {
  int x0 = int.MaxValue, x1 = 0, size = 0;
  for (int i = f.First; i <= f.Last; i++) { var b = rows[i].Box; x0 = Math.Min(x0, b.Left); size += b.Height; }
  size = Math.Max(6, size / (f.Last - f.First + 1));
  for (int i = f.First; i <= f.Last; i++) x1 = Math.Max(x1, rows[i].Box.Right - size);
  if (x1 < x0) x1 = x0;
  int y0 = rows[f.First].Box.Top, y1 = rows[f.Last].Box.Top;
  bool nvl = y0 < h * 0.5;
  bool same = nvl && PreviousNvl && PreviousText != null && Find(rows, PreviousText) != null;
  lock (Gate) { AdvRun = nvl ? 0 : Math.Min(12, AdvRun + 1); if (nvl) Skipped = 0; }
  PreviousText = text; PreviousNvl = nvl;
  long line = ++Line;
  string drawn = String.Join("\n", f.Parts.ToArray());
  int count = 0; foreach (char c in drawn) if (c != '\n') count++;
  long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
  Emit(new { type = "hookEngineLine", engine = "ocr", phase = "begin", line = line, same = same, nvl = nvl, x0 = x0, y0 = y0, x1 = x1, y1 = y1, size = size, sw = w, sh = h, count = 0, text = "", at = now });
  Emit(new { type = "hookEngineLine", engine = "ocr", phase = "end", line = line, same = same, nvl = nvl, x0 = x0, y0 = y0, x1 = x1, y1 = y1, size = size, sw = w, sh = h, count = count, text = drawn, at = now });
 }


 // ---- choices (E407) -----------------------------------------------------------------------------------------------
 // Choice texts come from the hook's other streams (read-only). Each is looked up on its own in the OCR rows; only the
 // ones drawn as a row of their own come back, with their pixel boxes, so the reader can draw over the buttons.
 readonly object OcrLock = new object();
 int ChoiceSerial;
 public void RequestChoices(IntPtr target, List<string> options) {
  if (target == IntPtr.Zero || options == null || options.Count == 0 || options.Count > 12) return;
  int serial = Interlocked.Increment(ref ChoiceSerial);
  ThreadPool.QueueUserWorkItem(_ => { try { LocateChoices(target, options, serial); } catch (Exception e) { Emit(new { type = "pageLocateStatus", status = "choice error " + e.Message }); } });
 }
 void LocateChoices(IntPtr target, List<string> options, int serial) {
  if (!EngineTried) { EngineTried = true; try { Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { Engine = null; } }
  if (Engine == null) { Emit(new { type = "hookChoiceBoxes", serial = serial, items = new object[0], missed = options.ToArray(), rows = new string[0], status = "no Japanese OCR" }); return; }
  foreach (int ms in new[] { 250, 700, 1500 }) {
   Thread.Sleep(ms == 250 ? 250 : ms == 700 ? 450 : 800);
   if (serial != ChoiceSerial || Disposed) return;
   RECT rect; if (!GetClientRect(target, out rect) || rect.Right < 64 || rect.Bottom < 64 || rect.Right > 7680 || rect.Bottom > 4320) return;
   int w = rect.Right, h = rect.Bottom;
   List<Row> rows;
   using (var image = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
    if (!GameCapture.Into(target, image, 3)) return;
    lock (OcrLock) rows = Read(image, w, h);
   }
   var items = new List<object>(); var missed = new List<string>();
   foreach (var option in options) {
    var f = Find(rows, option);
    if (f == null || f.Last - f.First > 1) { missed.Add(option); continue; }
    int x0 = int.MaxValue, y0 = int.MaxValue, x1 = 0, y1 = 0;
    for (int i = f.First; i <= f.Last; i++) { var q = rows[i].Box; x0 = Math.Min(x0, q.Left); y0 = Math.Min(y0, q.Top); x1 = Math.Max(x1, q.Right); y1 = Math.Max(y1, q.Bottom); }
    items.Add(new { text = option, x0 = x0, y0 = y0, x1 = x1, y1 = y1 });
   }
   if (items.Count >= 2 || ms == 1500) {
    var seen = new List<string>(); foreach (var r in rows) { if (seen.Count >= 24) break; seen.Add(r.Text.Length > 40 ? r.Text.Substring(0, 40) : r.Text); }
    Emit(new { type = "hookChoiceBoxes", serial = serial, sw = w, sh = h, items = items.ToArray(), missed = missed.ToArray(), rows = seen.ToArray(), status = items.Count >= 2 ? "found" : "miss" });
    return;
   }
  }
 }

 // ---- OCR ----------------------------------------------------------------------------------------------------------
 // Small text reads badly: pictures under 1400 px wide are read at twice their size (boxes are scaled back).
 List<Row> Read(Bitmap image, int w, int h) { return Read(image, w, h, Engine); }
 List<Row> Read(Bitmap image, int w, int h, OcrEngine engine) {
  double scale = w < 1400 ? 2 : 1;
  Bitmap input = image;
  if (scale != 1) { input = new Bitmap((int)(w * scale), (int)(h * scale), PixelFormat.Format24bppRgb); using (var g = Graphics.FromImage(input)) { g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; g.DrawImage(image, 0, 0, input.Width, input.Height); } }
  try {
   using (var memory = new MemoryStream()) {
    input.Save(memory, ImageFormat.Png);
    using (var random = new InMemoryRandomAccessStream()) {
     using (var writer = new DataWriter(random.GetOutputStreamAt(0))) { writer.WriteBytes(memory.ToArray()); Await(writer.StoreAsync()); Await(writer.FlushAsync()); writer.DetachStream(); }
     random.Seek(0);
     var decoder = Await(BitmapDecoder.CreateAsync(random));
     using (var software = Await(decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied))) {
      var result = Await(engine.RecognizeAsync(software));
      var rows = new List<Row>();
      if (result.TextAngle.HasValue && Math.Abs(result.TextAngle.Value) > 10) return rows; // vertical / rotated text: not handled
      foreach (var line in result.Lines) {
       double l = double.MaxValue, t = double.MaxValue, r = 0, b = 0;
       foreach (var word in line.Words) { var q = word.BoundingRect; l = Math.Min(l, q.X); t = Math.Min(t, q.Y); r = Math.Max(r, q.X + q.Width); b = Math.Max(b, q.Y + q.Height); }
       if (r <= l || b <= t) continue;
       rows.Add(new Row(line.Text, Rectangle.FromLTRB((int)(l / scale), (int)(t / scale), (int)Math.Ceiling(r / scale), (int)Math.Ceiling(b / scale))));
      }
      rows.Sort((a, c) => Math.Abs(a.Box.Top - c.Box.Top) > Math.Min(a.Box.Height, c.Box.Height) / 2 ? a.Box.Top.CompareTo(c.Box.Top) : a.Box.Left.CompareTo(c.Box.Left));
      return rows;
     }
    }
   }
  } finally { if (!ReferenceEquals(input, image)) input.Dispose(); }
 }
 static T Await<T>(Windows.Foundation.IAsyncOperation<T> operation) {
  var until = DateTime.UtcNow.AddSeconds(8);
  try { while (operation.Status == Windows.Foundation.AsyncStatus.Started) { if (DateTime.UtcNow > until) { operation.Cancel(); throw new InvalidOperationException("OCR timed out"); } Thread.Sleep(10); } return operation.GetResults(); } finally { operation.Close(); }
 }

 // ---- alignment (pure; see SelfTest) -------------------------------------------------------------------------------
 // Letters and digits only (NFKC), each remembering the source index it came from.
 static string Plain(string s, List<int> map) {
  var o = new StringBuilder();
  for (int i = 0; i < s.Length; i++) {
   string n = s[i].ToString().Normalize(NormalizationForm.FormKC);
   foreach (char c in n) if (Char.IsLetterOrDigit(c)) { o.Append(c); if (map != null) map.Add(i); }
  }
  return o.ToString();
 }
 static int Lcs(string a, string b) {
  if (a.Length == 0 || b.Length == 0) return 0;
  int[] p = new int[b.Length + 1], c = new int[b.Length + 1];
  for (int i = 0; i < a.Length; i++) { for (int j = 0; j < b.Length; j++) c[j + 1] = a[i] == b[j] ? p[j] + 1 : Math.Max(p[j + 1], c[j]); var t = p; p = c; c = t; Array.Clear(c, 0, c.Length); }
  return p[b.Length];
 }
 const string Closing = "、。，．,.!！?？」』）)】〉》…‥ー～〜♪";
 const string Opening = "「『（(【〈《“‘";

 // The run of consecutive OCR rows that holds the sentence: every row mostly made of the sentence's characters (in
 // order), together covering at least 60 % of it. The hook text is then split at the rows' ends.
 public static Found Find(List<Row> rows, string source) {
  var map = new List<int>();
  string s = Plain(source, map);
  if (s.Length < 2 || rows.Count == 0) return null;
  if (s.Length > 600) return null;
  var plain = new string[rows.Count]; var fits = new bool[rows.Count];
  for (int i = 0; i < rows.Count; i++) { plain[i] = Plain(rows[i].Text, null); int n = plain[i].Length; fits[i] = n >= 1 && Lcs(plain[i], s) >= Math.Max(1, Math.Ceiling(n * 0.6)); }
  Found best = null;
  for (int i = 0; i < rows.Count; i++) {
   if (!fits[i]) continue;
   var joined = new StringBuilder();
   for (int j = i; j < rows.Count && j < i + 40 && fits[j]; j++) {
    joined.Append(plain[j]);
    string c = joined.ToString();
    int l = Lcs(c, s);
    double coverage = (double)l / s.Length, precision = (double)l / Math.Max(1, c.Length);
    if (coverage >= 0.6 && precision >= 0.6 && (best == null || coverage > best.Coverage + 1e-9)) best = new Found { First = i, Last = j, Coverage = coverage };
   }
  }
  if (best == null) return null;
  // Align the run to the sentence and cut the sentence where each row ends.
  var lens = new List<int>(); var run = new StringBuilder();
  for (int i = best.First; i <= best.Last; i++) { run.Append(plain[i]); lens.Add(run.Length); }
  string a = run.ToString();
  int[,] d = new int[a.Length + 1, s.Length + 1];
  for (int i = a.Length - 1; i >= 0; i--) for (int j = s.Length - 1; j >= 0; j--) d[i, j] = a[i] == s[j] ? d[i + 1, j + 1] + 1 : Math.Max(d[i + 1, j], d[i, j + 1]);
  var matchedAt = new int[a.Length]; for (int k = 0; k < a.Length; k++) matchedAt[k] = -1;
  { int i = 0, j = 0; while (i < a.Length && j < s.Length) { if (a[i] == s[j] && d[i, j] == d[i + 1, j + 1] + 1) { matchedAt[i] = j; i++; j++; } else if (d[i + 1, j] >= d[i, j + 1]) i++; else j++; } }
  // A row ends after its last matched character and the next starts at its first one. Closing punctuation after the
  // end stays on the row, opening punctuation before the next start moves down; characters OCR missed in between go
  // to the row with more misread characters (its unmatched OCR characters stand for them), the upper one on a tie.
  var firstOf = new int[lens.Count]; var lastOf = new int[lens.Count]; var misses = new int[lens.Count];
  for (int r = 0; r < lens.Count; r++) {
   int from0 = r == 0 ? 0 : lens[r - 1]; firstOf[r] = -1; lastOf[r] = -1;
   for (int k = from0; k < lens[r]; k++) { if (matchedAt[k] < 0) { misses[r]++; continue; } if (firstOf[r] < 0) firstOf[r] = matchedAt[k]; lastOf[r] = matchedAt[k]; }
  }
  var cuts = new List<int>(); int last = 0, prev = -1;
  for (int r = 0; r < lens.Count; r++) {
   if (firstOf[r] < 0) continue;
   if (prev >= 0) {
    int p = map[lastOf[prev]] + 1, q = map[firstOf[r]];
    while (p < q && (Char.IsWhiteSpace(source[p]) || Closing.IndexOf(source[p]) >= 0)) p++;
    int k = q; while (k > p && Opening.IndexOf(source[k - 1]) >= 0) k--;
    int cut = misses[prev] >= misses[r] ? k : p;
    if (cut > last && cut < source.Length) { cuts.Add(cut); last = cut; }
   }
   prev = r;
  }
  int from = 0;
  foreach (int cut in cuts) { best.Parts.Add(source.Substring(from, cut - from).Trim()); from = cut; }
  best.Parts.Add(source.Substring(from).Trim());
  best.Parts.RemoveAll(p => p.Length == 0);
  return best;
 }

 public static bool SelfTest() {
  Func<string, int, Row> row = (t, y) => new Row(t, new Rectangle(120, y, 900, 30));
  var rows = new List<Row> { row("第一章", 20), row("春の風が吹いていた。窓の外では", 96), row("桜が散り始めている。", 136), row("「おはよう」と彼女は言った。", 176), row("セーブ ロード オート", 680) };
  var a = Find(rows, "春の風が吹いていた。窓の外では桜が散り始めている。");
  if (a == null || a.First != 1 || a.Last != 2 || a.Parts.Count != 2 || a.Parts[0] != "春の風が吹いていた。窓の外では" || a.Parts[1] != "桜が散り始めている。") return false;
  // OCR mistakes (ぃ for い, a dropped character) still align; the text kept is the hook's.
  var noisy = new List<Row> { row("春の風が吹いてぃた。窓の外で", 96), row("桜が散り始めている", 136) };
  var b = Find(noisy, "春の風が吹いていた。窓の外では桜が散り始めている。");
  if (b == null || b.Parts.Count != 2 || b.Parts[0] != "春の風が吹いていた。窓の外では" || b.Parts[1] != "桜が散り始めている。") return false;
  var c = Find(rows, "「おはよう」と彼女は言った。");
  if (c == null || c.First != 3 || c.Last != 3 || c.Parts.Count != 1) return false;
  if (Find(rows, "どこにも描かれていない台詞です") != null) return false;
  // Opening quote moves to the next row, closing punctuation stays on the row it ends.
  var q = Find(new List<Row> { row("彼は言った。", 96), row("「待って」", 136) }, "彼は言った。「待って」");
  if (q == null || q.Parts.Count != 2 || q.Parts[0] != "彼は言った。" || q.Parts[1] != "「待って」") return false;
  return true;
 }

 // Real OCR on a drawn page (no game): three paragraphs wrapped at their own widths over a striped background, read by
 // the system's Japanese OCR and aligned. Returns 0, or the step that failed; "skip" when no Japanese OCR is installed.
 public static string OcrSelfTest(string save) {
  var locator = new PageLocator(o => { });
  try { locator.Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { }
  if (locator.Engine == null) return "skip no Japanese OCR";
  string[] paragraphs = { "春の風が吹いていた。窓の外では桜が散り始めている。", "「おはよう」と彼女は言った。少し眠そうな声だった。", "僕は返事をしないまま、ぼんやりと空を見上げていた。" };
  int[][] breaks = { new[] { 15 }, new[] { 14 }, new[] { 13 } };
  using (var image = new Bitmap(1280, 720, PixelFormat.Format24bppRgb)) {
   using (var g = Graphics.FromImage(image))
   using (var font = new Font("MS Gothic", 30, FontStyle.Regular, GraphicsUnit.Pixel)) {
    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
    for (int y = 0; y < 720; y += 8) g.FillRectangle(new SolidBrush(Color.FromArgb(30 + y / 12, 40, 70 + (y / 8 % 2) * 12)), 0, y, 1280, 8);
    int top = 90;
    for (int p = 0; p < paragraphs.Length; p++) {
     int at = 0; var cuts = new List<int>(breaks[p]); cuts.Add(paragraphs[p].Length);
     foreach (int cut in cuts) { g.DrawString(paragraphs[p].Substring(at, cut - at), font, Brushes.White, 120, top); top += 44; at = cut; }
     top += 20;
    }
   }
   if (!String.IsNullOrEmpty(save)) image.Save(save, ImageFormat.Png);
   var rows = locator.Read(image, 1280, 720);
   for (int p = 0; p < paragraphs.Length; p++) {
    var f = Find(rows, paragraphs[p]);
    if (f == null) return "miss paragraph " + p + " rows=" + rows.Count + " [" + String.Join(" | ", rows.ConvertAll(r => r.Text).ToArray()) + "]";
    string want = paragraphs[p].Substring(0, breaks[p][0]) + "\n" + paragraphs[p].Substring(breaks[p][0]);
    string got = String.Join("\n", f.Parts.ToArray());
    if (got != want) return "breaks paragraph " + p + ": " + got.Replace("\n", "/");
    if (rows[f.First].Box.Left < 100 || rows[f.First].Box.Left > 160) return "box paragraph " + p + " left=" + rows[f.First].Box.Left;
   }
  }
  return "0";
 }

 // Real OCR on a drawn opening (no game): two centred mincho lines on a dark gradient (fata's 館がある / 寝起きざまのように)
 // and a text box with a name and the current dialogue line at the bottom. The scan must give the two art lines and
 // nothing from the box. Returns "0", the failing step, or "skip" without Japanese OCR.
 public static string ScanOcrSelfTest(string save) {
  var locator = new PageLocator(o => { });
  try { locator.Engine = OcrEngine.TryCreateFromLanguage(new Language("ja")); } catch { }
  if (locator.Engine == null) return "skip no Japanese OCR";
  string dialog = "「おはようございます」と彼女は静かに言った。";
  using (var image = new Bitmap(1280, 720, PixelFormat.Format24bppRgb)) {
   using (var g = Graphics.FromImage(image))
   using (var big = new Font("MS Mincho", 40, FontStyle.Regular, GraphicsUnit.Pixel))
   using (var small = new Font("MS Gothic", 28, FontStyle.Regular, GraphicsUnit.Pixel)) {
    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
    for (int y = 0; y < 720; y += 4) g.FillRectangle(new SolidBrush(Color.FromArgb(10 + y / 30, 12 + y / 40, 25 + y / 20)), 0, y, 1280, 4);
    var centre = new StringFormat { Alignment = StringAlignment.Center };
    g.DrawString("館がある", big, new SolidBrush(Color.FromArgb(225, 220, 205)), new RectangleF(0, 150, 1280, 60), centre);
    g.DrawString("寝起きざまのように", big, new SolidBrush(Color.FromArgb(225, 220, 205)), new RectangleF(0, 330, 1280, 60), centre);
    g.FillRectangle(new SolidBrush(Color.FromArgb(20, 20, 30)), 40, 520, 1200, 180);
    g.DrawString("メル", small, Brushes.White, 80, 535);
    g.DrawString(dialog, small, Brushes.White, 80, 590);
   }
   if (!String.IsNullOrEmpty(save)) image.Save(save, ImageFormat.Png);
   var rows = locator.Read(image, 1280, 720);
   string seen = String.Join(" | ", rows.ConvertAll(r => r.Text).ToArray());
   var open = ScanGroups(rows, 1280, 720, null, null, false, null);
   bool a = false, b = false; foreach (var gr in open) { string t = GroupText(gr); if (Same(t, "館がある")) a = true; if (Same(t, "寝起きざまのように")) b = true; }
   if (!a || !b) return "opening lines not found [" + seen + "]";
   var play = ScanGroups(rows, 1280, 720, dialog, "メル", true, null);
   if (play.Count != 2) return "with dialogue: " + play.Count + " groups [" + String.Join(" | ", play.ConvertAll(GroupText).ToArray()) + "]";
   foreach (var gr in play) { var box = gr[0].Box; if (Math.Abs(box.Left + box.Width / 2 - 640) > 40) return "not centred " + GroupText(gr) + " x=" + box.Left; }
  }
  return "0";
 }

 public void Dispose() { Disposed = true; Wake.Set(); }
}
