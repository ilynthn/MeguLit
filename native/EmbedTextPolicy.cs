// SPDX-License-Identifier: GPL-3.0-or-later
// Which hooked strings may be written back, for every engine (E215, 2026-11-06).
// LunaHook engine adapters report a stream's role in the thread's split value (ctx2): 1 scenario, 2 name, 3 other
// (choices, history and a script VM's general strings). CLANNAD HD crashed because the selected EmbedSiglus2 stream had
// role 3: it is the VM's general string constructor, so blanking it rewrote name flags and commands ("名前フラグ名が
// 短すぎます", "コマンドが不正です", "string too long"). Name/other streams are therefore never written to, and strings
// that still carry script syntax, resource names or control codes are left to the engine unchanged.
using System;
using System.Text;
using System.Text.RegularExpressions;

internal static class EmbedTextPolicy {
    // Script VM syntax: variable references (【＄名前】, ＄朋也), command letters (％Ａ, ＊Ｂ; not "50％OFF"), markup, escapes
    // and control/private-use characters.
    static readonly Regex Script = new Regex(@"[【《\[][\$＄@＠]|[%％*＊][A-ZＡ-Ｚ](?![A-Za-zＡ-Ｚａ-ｚ])|[\$＄][\p{L}\p{N}_＿]|</?[A-Za-z][^>\r\n]*>|\\[nrt](?![A-Za-z])|[\x00-\x08\x0b\x0c\x0e-\x1f-]");
    static readonly Regex Resource = new Regex(@"[\\/]|\.[A-Za-z0-9]{2,5}(\b|$)|^[\x20-\x7e]*,|^[\p{L}\p{N}_.:-]*[_:]\w*$");
    static readonly Regex Dialogue = new Regex(@"[ぁ-ゖァ-ヺ「-』、。…！？]|(?:\p{L}{2,}[ \t]+){1,}\p{L}{2,}|\p{L}{2,}(?:[.!?]+|…)[""”’')]*$");
    static readonly Regex Prose = new Regex(@"^[^\\/\r\n]*\p{L}{2,}[,;]?[ \t]+\p{L}{2,}[,;]?[ \t]+\p{L}{2,}[^\\/\r\n]*$");
    static readonly Regex Glyph = new Regex(@"[\p{L}\p{N}\p{P}\p{S}]");

    // Role an embed-capable stream declares; 0 when unknown or when the split value is not a role (read-only hooks).
    public static int Role(bool embed, ulong ctx2) { return embed && ctx2 >= 1 && ctx2 <= 3 ? (int)ctx2 : 0; }
    // Only scenario (or undeclared) streams carry the displayed dialogue and may be written back.
    public static bool Writable(int role) { return role == 0 || role == 1; }

    // Whole script constructs, kept byte for byte when a dialogue line is blanked (E215.2): a variable reference with its
    // closing bracket, a command letter, a tag, an escape or a run of control/private-use characters.
    static readonly Regex RichTag = new Regex(@"</?(?:size|color|b|i|u|s|font|align|line-height|cspace|mspace|voffset|alpha|mark|sup|sub|indent|margin|nobr|style|link|material|pos|space|width|lowercase|uppercase|smallcaps)(?:=[^<>\r\n]*)?>", RegexOptions.IgnoreCase);
    static readonly Regex Construct = new Regex(@"[【《\[][\$＄@＠][^】》\]\r\n]{0,64}[】》\]]|[%％*＊][A-ZＡ-Ｚ](?![A-Za-zＡ-Ｚａ-ｚ])|[\$＄][\p{L}\p{N}_＿]+|</?[A-Za-z][^>\r\n]*>|\\[nrt](?![A-Za-z])|[\x00-\x08\x0b\x0c\x0e-\x1f-]+");

    // Multilingual containers (E243, Maitetsu Pure Station): every language of a line in one string, split by the engine
    // through separators the hook decodes as ？？？ / U+FFFD / private-use runs, or written inline as %l<ja>;<zh>%l.
    // Rewriting one breaks the engine's own split, so all tracks were drawn; such strings are never written back.
    static readonly Regex TrackSeparator = new Regex(@"\S{2,}[?？�-￰-￿]{3,}\s*\S{2,}");
    static readonly Regex InlineTrack = new Regex(@"%l[^%\r\n]*;[^%\r\n]*%l|%l\S");
    public static bool Container(string value) { return value != null && (TrackSeparator.IsMatch(value) || InlineTrack.IsMatch(value)); }

    // Bumped when the rules change, so a stream remembered as unsafe under older rules gets one more try (E320).
    public const int Version = 3; // 3: E465 labels and file names are never written back (ファタモルガーナの館 unsafe under 2)

    // E320 HuneX ruby (魔法使いの夜: <rふ>触</r>): the closing tag's "/" read as a path and each ruby counted as two
    // constructs, so every line with furigana went back unchanged and its original stayed under MeguLit's text. A ruby
    // group is now blanked whole (reading and base) with its tag letters kept; any other construct in such a line still
    // leaves the line to the engine.
    static readonly Regex Ruby = new Regex(@"<r([^<>\r\n]{1,32})>([^<>\r\n]{1,32})</r>");
    static string HideRuby(string value) {
        string plain = Ruby.Replace(value, m => m.Groups[2].Value);
        if (Resource.IsMatch(plain) || Container(plain) || Construct.IsMatch(plain) || !Dialogue.IsMatch(plain)) return "";
        var output = new System.Text.StringBuilder(value.Length);
        int at = 0;
        foreach (Match m in Ruby.Matches(value)) {
            output.Append(Blank(value.Substring(at, m.Index - at))).Append("<r").Append(Blank(m.Groups[1].Value)).Append('>').Append(Blank(m.Groups[2].Value)).Append("</r>");
            at = m.Index + m.Length;
        }
        return output.Append(Blank(value.Substring(at))).ToString();
    }

    /* E465 (user 2026-11-12, ファタモルガーナの館: "first.ks 行 78 タグ image ... dtjp.xp3>" at start, every game must be safe).
       A generic string stream (Krkr2wcs) also carries the engine's storage names, and KAG names its images in Japanese
       ("注意書き"); blanking one emptied the image tag's file name. A short string with no sentence punctuation, no space
       and no line break is a name, a label or a button, never written back; a very short spoken line may show its
       original for a moment, which is far better than an engine error. */
    /* 2026-11-12 (user, 沙耶の唄 2003: the subtitles showed "E:\GAL\[031226][Nitro+] ...\data.pakE:\GAL\...\image.pak"): a generic
       stream such as lstrlenA also carries the file paths the game opens. A full path (drive or UNC, \ / or the yen sign a
       Japanese font draws for it, ending in a file extension) is never text to read; a frame that is only paths is dropped. */
    static readonly Regex FilePath = new Regex(@"(?:[A-Za-z]:|\\\\)[\\/¥￥](?:[^\\/¥￥\r\n:*?""<>|]+[\\/¥￥])*[^\\/¥￥\r\n:*?""<>|]*?\.[A-Za-z0-9]{1,4}?(?=$|[^A-Za-z0-9]|[A-Za-z]:[\\/¥￥])");
    public static string StripPaths(string value) {
        if (string.IsNullOrEmpty(value) || value.IndexOf(':') < 0 && value.IndexOf(@"\\", StringComparison.Ordinal) < 0) return value ?? "";
        return FilePath.IsMatch(value) ? FilePath.Replace(value, "").Trim() : value;
    }
    /* E500 (live test 2026-11-13, DDLC Plus: "\"Clubs...\"" was a label, so it was neither shown nor hidden): an ASCII ellipsis,
       quotes, or a word that ends with a full stop are sentence punctuation too. A short line that opens with a block or
       marker symbol and has no sentence punctuation (千恋＊万花 「■自動車（車内／走行）」, a sound-effect caption) is a label. */
    static readonly Regex Sentence = new Regex(@"[、。，．！？!?…‥「」『』（）()―—\s""“”]|\.\.|\p{L}\.$");
    static readonly Regex Caption = new Regex(@"^[■□◆◇▼▽★☆※◎●○][^、。「」『』！？!?\r\n]{1,29}$");
    public static bool Label(string value) {
        string plain = Ruby.Replace(Construct.Replace(value ?? "", ""), m => m.Groups[2].Value).Trim();
        return plain.Length > 0 && (Caption.IsMatch(plain) || plain.Length <= 12 && !Sentence.IsMatch(plain));
    }
    /* E500 auxiliary text (choices) that is never shown: a typewriter frame where several characters repeat in place
       (千恋＊万花 「『『『『おお客客…」), script constructs (CLANNAD 「＊Ａ＊Ｂタイトルメニュー」), a caption, or the game window's own
       title (CLANNAD 「タイトルメニュー」). */
    public static bool Stuttered(string value) {
        string t = Regex.Replace(value ?? "", @"\s+", "");
        if (t.Length < 8) return false;
        int n = 0; var kinds = new System.Collections.Generic.HashSet<char>();
        for (int i = 1; i < t.Length; i++) if (t[i] == t[i - 1] && "ー…‥―・～—-.。！？!?".IndexOf(t[i]) < 0) { n++; kinds.Add(t[i]); }
        return kinds.Count >= 3 && n * 4 >= t.Length;
    }
    public static bool AuxNoise(string value, string caption) {
        string t = (value ?? "").Trim();
        if (t.Length == 0 || Script.IsMatch(t) || Stuttered(t) || Caption.IsMatch(t)) return true;
        return !String.IsNullOrEmpty(caption) && caption.IndexOf(t, StringComparison.Ordinal) >= 0;
    }
    /* E560 (月に寄りそう乙女の作法 closed with a Mono crash: its typewriter reads Text.text back and appends the next character,
       so blanked glyphs were read back, piled up and broke the coroutine). A Unity rich-text setter keeps every character:
       the whole text is wrapped in one fully transparent colour (our own marker, removed again when the game hands the
       wrapped text back), so what the game reads back is its own text and only the drawing is hidden. */
    static readonly Regex InnerColor = new Regex(@"<color=#([0-9A-Fa-f]{6})(?:[0-9A-Fa-f]{2})?>");
    public static bool HasInnerColor(string value) { return InnerColor.IsMatch(Unveil(value)); }
    public const string UnityVeilOpen = "<color=#01010100>", UnityVeilClose = "</color>";
    public static string UnityVeil(string value) {
        string v = Unveil(value);
        if (Hide(v).Length == 0) return "";
        /* inner colours win over the outer one: a game that fades each character in with its own <color=#FFFFFF89> cannot be
           veiled, and rewriting its alphas froze it (its fade waits for the alpha it reads back), so such text is left alone */
        if (HasInnerColor(v)) return "";
        return UnityVeilOpen + v + UnityVeilClose;
    }
    public static string Unveil(string value) {
        string v = value ?? "";
        while (v.StartsWith(UnityVeilOpen, StringComparison.Ordinal)) {
            v = v.Substring(UnityVeilOpen.Length);
            int close = v.LastIndexOf(UnityVeilClose, StringComparison.Ordinal);
            if (close >= 0) v = v.Remove(close, UnityVeilClose.Length);
        }
        return v.Replace(UnityVeilOpen, "");
    }
    // Text marks (docs/text-architecture.md, "Marks"): the same rules as Hide, but every visible character becomes a mark
    // the game draws itself, 「・」 (U+30FB) for a full-width character and 「･」 (U+FF65) for a half-width one, so the count,
    // the constructs, blanks and line breaks stay exactly as they were. The capture compositor finds the marks.
    [ThreadStatic] static bool Marking;
    public static string Mark(string value) { Marking = true; try { return Hide(value); } finally { Marking = false; } }
    /* 2026-11-19 a short all-hiragana piece (「なるほど」, BGI 「たばこと」) is a label to Hide but a line to the reader; the reader
       shows it, so the game's copy is blanked too (the bridge uses this one rule for both sides). */
    public static bool ShortSpoken(string value) { return Regex.IsMatch((value ?? "").Trim(), "^[ぁ-ゖー～っ]+$"); }
    /* a short piece of a quotation the game builds up in steps (BGI 「たばこと」「屋上と」 after an open 「): kana or kanji, no ASCII,
       not a caption; the bridge decides whether a quotation is open */
    public static bool QuotedPiece(string value) { string t = (value ?? "").Trim(); return t.Length > 0 && t.Length <= 12 && Regex.IsMatch(t, "^[぀-ヿ一-鿿々ー～…‥、。！？]+$") && !Caption.IsMatch(t); }
    public static string HideSpoken(string value) { return String.IsNullOrWhiteSpace(value) ? "" : Blank(value); }
    public static string Hide(string value) {
        // An empty reply tells LunaHook to skip writeback entirely, including its own re-encoding.
        // E560 (月に寄りそう乙女の作法, Unity UI.Text): rich-text tags (<size=36>…</size>, small-size ruby) are layout, not script
        // constructs or length: a whole NVL page with a tag per paragraph is still one dialogue text, blanked with its tags kept.
        string visible = RichTag.Replace(value ?? "", "");
        if (String.IsNullOrWhiteSpace(value) || visible.Length > 600 || Label(visible)) return "";
        if (Ruby.IsMatch(value)) return HideRuby(value);
        // 2026-11-13 (DDLC Plus in English: every line with a comma, "Meanwhile, I've always walked...", stayed visible): the
        // "ASCII up to a comma" and "dot + extension" resource rules are for tables and file names; a line of prose (three
        // spaced words, no slash) is dialogue even when it has a comma or a dot.
        if ((Resource.IsMatch(visible) && !Prose.IsMatch(visible)) || Container(visible)) return "";
        // A dialogue line that carries a few script constructs used to be skipped whole, so its original stayed under
        // MeguLit's text (CLANNAD HD overlap, user 2026-11-06). Now only the visible text is blanked and every construct
        // stays intact for the engine. Strings dense with constructs (name/variable tables) are still left alone.
        MatchCollection constructs = Construct.Matches(value);
        int scriptConstructs = 0; foreach (Match c in constructs) if (!RichTag.IsMatch(c.Value) || RichTag.Match(c.Value).Length != c.Value.Length) scriptConstructs++;
        if (scriptConstructs > 2 || !Dialogue.IsMatch(Construct.Replace(value, ""))) return "";
        var output = new System.Text.StringBuilder(value.Length);
        int at = 0;
        foreach (Match m in constructs) { output.Append(Blank(value.Substring(at, m.Index - at))).Append(m.Value); at = m.Index + m.Length; }
        return output.Append(Blank(value.Substring(at))).ToString();
    }
    static string Blank(string text) { if (Marking) return Glyph.Replace(text, m => m.Value[0] <= 0x7f || (m.Value[0] >= 0xFF61 && m.Value[0] <= 0xFF9F) ? "\uFF65" : "\u30FB"); return Glyph.Replace(text, m => m.Value[0] <= 0x7f ? " " : "　"); }

    // E352 (user: "perfect original-style embed, solved for every game"): the game draws the translation itself, so it
    // lands in the game's own layout, font and effects. The written-back string keeps what the engine needs from the
    // original line: its paragraph indent (WoH starts a new row only for an indented line) and the engine constructs
    // it ends with (wait codes, control characters, tags); and the translation loses anything an engine could read as a
    // command (control characters, tags, %A/$x/@x/^ prefixes). Ruby is dropped: the translation has no ruby of its own.
    static readonly Regex Trailing = new Regex("(?:" + Construct.ToString() + ")+$");
    public static string Writeback(string original, string translation) {
        if (String.IsNullOrWhiteSpace(translation) || Label(original)) return "";
        string t = translation.Replace("\r\n", "\n").Replace('\r', '\n');
        t = Regex.Replace(t, @"[\x00-\x08\x0b\x0c\x0e-\x1f]", "");
        t = t.Replace("<", "〈").Replace(">", "〉");
        t = Regex.Replace(t, @"[%％*＊$＄@＠\^](?=[A-Za-zＡ-Ｚａ-ｚ])", "");
        t = t.Trim();
        if (t.Length == 0) return "";
        string o = original ?? "";
        string lead = Regex.Match(o, @"^[\u3000 ]+").Value;
        string tail = Trailing.Match(Ruby.Replace(o, "")).Value;
        return lead + t + tail;
    }

    /* 2026-11-15 (user: 沙耶の唄 showed 「『ネェネェ、今度ノす娃t擬。ｸl擬D雑年ハ…』」 and asked that garbage never reaches a game):
       every string MeguLit hands back to a game passes this gate. A string the engine reads in a multi-byte code page
       (hook types A/B/S, LunaHook "HS932#..." or the bridge's code page) must survive that code page both ways, else the
       engine would draw '?' or the wrong characters; replacement characters, new control codes and runaway replies never go
       in. A refused reply is not written (the game keeps its own line, MeguLit stays read-only for it). Generic: hook code
       and text only, never a game name. */
    static readonly Regex HookType = new Regex(@"^H([A-Z])[A-Z]*?(?:(\d{3,5})#)?");
    public static int WriteCodepage(string code, int fallback) {
        Match m = HookType.Match(code ?? "");
        if (!m.Success) return 0;
        char kind = m.Groups[1].Value[0];
        if (kind != 'A' && kind != 'B' && kind != 'S') return 0; /* W/Q/U wide, V UTF-8, others: the engine takes UTF-16/UTF-8 */
        int cp; if (m.Groups[2].Success && Int32.TryParse(m.Groups[2].Value, out cp) && cp > 0) return cp;
        return fallback > 0 ? fallback : 932;
    }
    /* 2026-11-15 (沙耶の唄, user: 「这乱码是原文」): a hook that hands over the engine's own UTF-16 / UTF-8 string (LunaHook types W, Q, U,
       V) cannot produce code-page mojibake: whatever it delivers is the text the game draws, noise included. */
    public static bool EngineText(string code) { return System.Text.RegularExpressions.Regex.IsMatch(code ?? "", "^H[WQUV]"); }
    public static bool RoundTrips(string text, int codepage) {
        if (codepage <= 0 || codepage == 1200 || codepage == 65001 || String.IsNullOrEmpty(text)) return true;
        try {
            Encoding enc = Encoding.GetEncoding(codepage, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
            return enc.GetString(enc.GetBytes(text)) == text;
        } catch { return false; }
    }
    static readonly Regex Controls = new Regex(@"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]");
    public static string GuardWrite(string code, int fallbackCodepage, string original, string reply, out string reason) {
        reason = "";
        if (String.IsNullOrEmpty(reply) || reply == original) return reply ?? "";
        string o = original ?? "";
        if (reply.IndexOf('\uFFFD') >= 0) { reason = "replacement character"; return ""; }
        foreach (Match c in Controls.Matches(reply)) if (o.IndexOf(c.Value, StringComparison.Ordinal) < 0) { reason = "new control code U+" + ((int)c.Value[0]).ToString("X4"); return ""; }
        int cp = WriteCodepage(code, fallbackCodepage);
        if (!RoundTrips(reply, cp)) { reason = "not representable in code page " + cp; return ""; }
        if (reply.Length > Math.Max(o.Length * 4, o.Length + 64)) { reason = "reply " + reply.Length + " chars for " + o.Length; return ""; }
        int on = o.Split('\n').Length, rn = reply.Split('\n').Length;
        if (rn > on + 2) { reason = "reply has " + rn + " rows for " + on; return ""; }
        return reply;
    }

    /* E477 (player: embed replacement never hid the original of a newly added game). A stream learned unsafe was keyed by the
       process name alone, and many engines ship the same executable name (SiglusEngine, BGI, AdvHD, game, start...): an error
       in one game switched writeback off for every other game with that name. The key now carries the game's folder too, so
       each game gets its own try; the error guard still turns writeback off at the first engine error. */
    public static string UnsafeKey(string process, string exe, string name, int role) {
        string scope = "";
        try {
            string dir = String.IsNullOrEmpty(exe) ? "" : System.IO.Path.GetDirectoryName(exe);
            if (!String.IsNullOrEmpty(dir)) { uint h = 2166136261; foreach (char c in dir.ToLowerInvariant().TrimEnd('\\', '/')) { h ^= c; h *= 16777619; } scope = h.ToString("x8") + "|"; }
        } catch { }
        return (process ?? "").ToLowerInvariant() + "|" + scope + name + "|" + role;
    }

    /* 2026-11-15 (沙耶の唄: the game itself draws its monsters' speech as noise, 『二十Aﾅ像ナッテ初y(VQｳッテノハ…』). A line no one can
       read is never hidden: MeguLit has nothing to draw in its place, so the game keeps drawing it. Same rules as
       core/text-sanity.cjs garbledSource (controls:false) minus the Shift-JIS-read-as-GBK case, which the front end turns back
       into Japanese and draws. */
    static readonly Regex HalfKana = new Regex(@"[\uFF61-\uFF9F]");
    static readonly Regex Kanji = new Regex(@"[\u4E00-\u9FFF]");
    static readonly Regex Utf8AsLatin = new Regex(@"[\u00C2-\u00EF][\u0080-\u00BF\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]");
    static readonly Regex GluedAscii = new Regex(@"(?<=[^\x00-\x7F\s])[\x21-\x7E]+(?=[^\x00-\x7F\s])");
    static readonly Regex Kana = new Regex(@"[\u3041-\u309F\u30A1-\u30FA]");
    /* half-width katakana glued to ASCII or kanji: noise; a half-width word (\uFF71\uFF8A\uFF8A) sits between kana and punctuation */
    static readonly Regex HalfTouch = new Regex(@"[\uFF61-\uFF9F](?=[\x21-\x7E\u4E00-\u9FFF])|(?<=[\x21-\x7E\u4E00-\u9FFF])[\uFF61-\uFF9F]");
    /* たいせつなきみのために、ぼくにできるいちばんのこと: the game logs through user32 wvsprintfA, and the hook on it hands over the
       format templates themselves ("%s%s%s%s%s%snone%s%s", "ReadScript [%s]...読込現在読み込み中のファイル[%s]"). Two printf
       conversions in one string are a template, never a line on screen (core/text-sanity.cjs printfTemplate, same rule). */
    static readonly Regex PrintfSpec = new Regex(@"%(?:[-0]?\d{1,2})?(?:ll|l|h)?[sdxXuc](?![A-Za-z])|%S(?![A-Za-z])");
    public static bool PrintfTemplate(string text) { return PrintfSpec.Matches(text ?? "").Count >= 2; }

    public static bool Unreadable(string text) {
        string t = text ?? "";
        if (t.Trim().Length == 0) return false;
        if (PrintfTemplate(t)) return true;
        int bad = 0; foreach (char c in t) if (c == '\uFFFD') bad++;
        if (bad >= 2 || (bad > 0 && bad * 10 >= t.Length)) return true;
        int half = HalfKana.Matches(t).Count, kanji = Kanji.Matches(t).Count;
        if (half >= 3 && kanji >= 4) return true;
        if (Utf8AsLatin.Matches(t).Count >= 2) return true;
        return half >= 1 && kanji >= 2 && Kana.IsMatch(t) && GluedAscii.Matches(t).Count >= 2 && HalfTouch.Matches(t).Count >= 2;
    }

    public static bool GuardSelfTest() {
        string why;
        return WriteCodepage("HW8@61210:Saya_Steam.exe", 932) == 0 && WriteCodepage("HSXF4@CEB50:Saya_Steam.exe", 932) == 932 &&
            WriteCodepage("HS936#-8@4A1B2:game.exe", 932) == 936 && WriteCodepage("HVXN0@3F10:x.exe", 932) == 0 && WriteCodepage("EmbedToMeCS2_DrawPreserve", 932) == 0 &&
            RoundTrips("「またね」", 932) && !RoundTrips("这次暑假要不要去游泳", 932) && RoundTrips("这次暑假要不要去游泳", 936) &&
            GuardWrite("HSXF4@CEB50:a.exe", 932, "『ネェネェ、今度ノ夏休ミハ』", "『对了对了，这次暑假』", out why) == "" && why.StartsWith("not representable") &&
            GuardWrite("HW8@61210:a.exe", 932, "『ネェネェ、今度ノ夏休ミハ』", "『对了对了，这次暑假』", out why) == "『对了对了，这次暑假』" && why == "" &&
            GuardWrite("HSXF4@CEB50:a.exe", 932, "「またね」", "　　　　　", out why) == "　　　　　" &&
            GuardWrite("HW8@0:a.exe", 932, "「またね」", "「再�见」", out why) == "" &&
            GuardWrite("HW8@0:a.exe", 932, "「またね」", "「再见」", out why) == "" && GuardWrite("HW8@0:a.exe", 932, "「またね」", "「再见」", out why) == "「再见」" &&
            GuardWrite("HW8@0:a.exe", 932, "あ", new string('译', 200), out why) == "" &&
            GuardWrite("HSXF4@0:a.exe", 932, "「またね」", "", out why) == "" &&
            Unreadable("『二十Aﾅ像ナッテ初y(VQｳッテノハ、今日日ソウソウイ梗WfA繙ャナイカナ？』") &&
            Unreadable("%s%s%s%s%s%snone%s%s") && Unreadable("ReadScript [%s]%s%s【Read】%s 読込現在読み込み中のファイル[%s]") &&
            !Unreadable("全品50%OFFだって！　100%の確率で、%sって書いてある") && Unreadable("『ネェネェ、今度ノすﾀfｾｾf劔。ｩI撥D錐年ハ、ドッカ渙ｨtーとモ遊ベﾋ坥ｿ牴xLナイ？』") &&
            !Unreadable("　ぶよぶよと蠢く肉塊が、暗く粘ついた声でそう言った。") && !Unreadable("全品50％OFFだって！PCのUSBメモリ") && !Unreadable("ｱﾊﾊ、そうだね。今日はAとBの日") && !Unreadable("「PS2版とPC版の違い？」");
    }
    public static bool SelfTest() {
        const string mixed = "そう、雪だ。♪【$名前＿渚】【$名前＿渚】%A";
        return Role(true, 3) == 3 && Role(true, 1) == 1 && Role(false, 3) == 0 && Role(true, 0xe9a0f05) == 0 &&
            !Writable(2) && !Writable(3) && Writable(1) && Writable(0) &&
            Hide(mixed) == "" && Hide("そう、雪だ。♪【＄名前＿渚】％Ａ") == "　　　　　　　【＄名前＿渚】％Ａ" &&
            Hide("％Ａ《渚の名前》％Ｂ《秋生の名前》％Ｃ《＊Ｂから渚への呼称》プロローグ") == "" &&
            Hide("＊Ａ崎岡岡崎") == "" && Hide("全品50％OFFだって！").Length == "全品50％OFFだって！".Length &&
            StripPaths(@"E:\GAL\[031226][Nitro+] ﾉｳﾒｮ､ﾎ・\data.pakE:\GAL\[031226][Nitro+] ﾉｳﾒｮ､ﾎ・\image.pak") == "" && StripPaths("E:¥GAL¥a b¥script.pak") == "" && StripPaths(@"「ここは：C:\Windows\a.txt」") == "「ここは：」" && StripPaths("「時刻は10:30だ」") == "「時刻は10:30だ」" && Hide("grp.pak") == "" && Hide("注意書き") == "" && Hide("タイトル画面") == "" && Writeback("注意書き", "注意") == "" && Hide("grp,bg001") == "" && Hide(@"data\grp\背景.tga") == "" &&
            Hide("トーンカーブ.dat") == "" && Hide("「またね」<wait>") == "　　　　　<wait>" &&
            Hide("名前%Q") == "" && Hide("「またね」\u0001") == "　　　　　\u0001" &&
            Hide("「やっと来たね」\r\nそうですね……") == "　　　　　　　　\r\n　　　　　　　" &&
            Hide("Good evening!") == "             " &&
            Hide("Meanwhile, I've always walked to school alone.").Trim() == "" && Hide("Meanwhile, I've always walked to school alone.").Length == 46 && Hide("ui,menu,select") == "" && Hide("bgm01.ogg") == "" &&
            Hide("「ついてないわね」「ついてないわね」？？？？？？「真够不走运的」") == "" &&
            Hide("「確認開始%l砂撒き;放沙%l;。」") == "" &&
            Hide("「えっ？？？」").Length == "「えっ？？？」".Length &&
            Hide("　彼女がはじめて命に<rふ>触</r>れた、<rしず>厳</r>かな朝の出来事だ。") == "　　　　　　　　　　<r　>　</r>　　　<r　　>　</r>　　　　　　　　　" &&
            Hide("　車の窓は<rしも>霜</r>だらけで、\n　走りだせない。") == "　　　　　<r　　>　</r>　　　　　\n　　　　　　　　" &&
            Writeback("　彼女がはじめて命に<rふ>触</r>れた。", "她第一次触碰到生命。") == "　她第一次触碰到生命。" &&
            Writeback("「またね」<wait>", "「再见」") == "「再见」<wait>" && Writeback("「またね」\u0001", "「再见」") == "「再见」\u0001" &&
            Writeback("あ。", "<b>%A$x译文\u0002") == "〈b〉A x译文".Replace(" ", "") && Writeback("あ。", "  ") == "" &&
            Hide("<rふ>触</r>【＄名前】") == "" && Hide(@"<rx>data\a</r>") == "" &&
            UnsafeKey("SiglusEngine", @"D:\Games\A\SiglusEngine.exe", "EmbedSiglus", 1) != UnsafeKey("SiglusEngine", @"D:\Games\B\SiglusEngine.exe", "EmbedSiglus", 1) &&
            UnsafeKey("SiglusEngine", @"D:\Games\A\SiglusEngine.exe", "EmbedSiglus", 1) == UnsafeKey("siglusengine", @"d:\games\a\SiglusEngine.exe", "EmbedSiglus", 1) &&
            UnsafeKey("game", "", "Embed", 1) == "game|Embed|1" &&
            Label("■自動車（車内／走行）") && !Label("\"Clubs...\"") && Hide("\"Clubs...\"").Trim() == "" && Hide("\"Clubs...\"").Length == 10 &&
            Label("注意書き") && AuxNoise("『『『『『『『『おお『お『『おお客客『お客『『おお客客ささ", "") && !AuxNoise("『お客さん』", "") &&
            AuxNoise("＊Ａ＊Ｂタイトルメニュー", "") && AuxNoise("タイトルメニュー", "CLANNAD タイトルメニュー") && !AuxNoise("学校へ行く", "CLANNAD");
    }
}
