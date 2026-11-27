// SPDX-License-Identifier: GPL-3.0-or-later
//! KAG scenario scripts (.ks): text between tags, with speakers, colours, ruby and choices.
//! Follows services/original-engines/scenes.cjs (parseKs) and krkr-lang.cjs (blocks / parseRow).
//!
//! - A physical line is a row; `[l]` inside it splits sentences, each one a line here. `[cm]` / `[er]` / `[ct]` /
//!   `@cm` clear the window: the next line starts a page.
//! - Speakers: a `【name】` line, `[nm t=…]` / `@nm`, `[ns]name[nse]`, or a macro whose body names one
//!   (`[hisout txt="- name -"]`, `[name text=…]`): macros are read from every script of the game first.
//! - Colour: `[font color=0xRRGGBB]` until `[resetfont]` or the next page, also from macros.
//! - Ruby: `[ruby text="よみ"]漢`, and `[漢字'よみ]` macros; a tag named in Japanese prints its name.
//! - Choices: `[link …]text[endlink]` and `[seladd text=…]`, grouped until `[s]`.
//! - TJS between `[iscript]` and `[endscript]`, macro bodies and comments are not text.

use crate::model::{Choice, ChoiceOption, Line, Script};
use crate::text::decode;
use crate::{Result, ScriptParser};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Default)]
pub struct MacroInfo {
    pub speaker: Option<String>,
    pub color: Option<String>,
    /// The macro only marks narration (sets a speaker slot but shows no name).
    pub narration: bool,
}

/// One tag: name and attributes (values unquoted).
#[derive(Debug, Clone, Default)]
pub struct Tag {
    pub name: String,
    pub attrs: HashMap<String, String>,
}

pub fn parse_tag(body: &str) -> Tag {
    let mut it = body.trim().char_indices().peekable();
    let s = body.trim();
    let mut name = String::new();
    while let Some(&(_, c)) = it.peek() {
        if c.is_whitespace() {
            break;
        }
        name.push(c);
        it.next();
    }
    let mut attrs = HashMap::new();
    let rest: Vec<char> = s[name.len()..].chars().collect();
    let mut i = 0;
    while i < rest.len() {
        while i < rest.len() && rest[i].is_whitespace() {
            i += 1;
        }
        let mut key = String::new();
        while i < rest.len() && !rest[i].is_whitespace() && rest[i] != '=' {
            key.push(rest[i]);
            i += 1;
        }
        while i < rest.len() && rest[i].is_whitespace() {
            i += 1;
        }
        let mut value = String::new();
        if i < rest.len() && rest[i] == '=' {
            i += 1;
            while i < rest.len() && rest[i].is_whitespace() {
                i += 1;
            }
            if i < rest.len() && (rest[i] == '"' || rest[i] == '\'') {
                let q = rest[i];
                i += 1;
                while i < rest.len() && rest[i] != q {
                    value.push(rest[i]);
                    i += 1;
                }
                i += 1;
            } else {
                while i < rest.len() && !rest[i].is_whitespace() {
                    value.push(rest[i]);
                    i += 1;
                }
            }
        }
        if !key.is_empty() {
            attrs.insert(key.to_ascii_lowercase(), value);
        }
    }
    Tag { name, attrs }
}

/// "0x9D9D9D", "#9d9d9d", "9D9D9D" -> "#9d9d9d".
pub fn color_of(v: &str) -> Option<String> {
    let h = v.trim().trim_start_matches("0x").trim_start_matches("0X").trim_start_matches('#');
    let h = if h.len() == 8 { &h[2..] } else { h };
    (h.len() == 6 && h.chars().all(|c| c.is_ascii_hexdigit())).then(|| format!("#{}", h.to_ascii_lowercase()))
}

fn is_japanese(c: char) -> bool {
    ('\u{3040}'..='\u{30ff}').contains(&c) || ('\u{4e00}'..='\u{9fff}').contains(&c) || c == '々' || c == 'ー'
}

/// Tags of a script text in order: (byte start, byte end, body). `[[` is a literal bracket, not a tag.
fn tags_in(s: &str) -> Vec<(usize, usize, &str)> {
    let b = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'[' {
            if i + 1 < b.len() && b[i + 1] == b'[' {
                i += 2;
                continue;
            }
            let mut j = i + 1;
            let mut q = 0u8;
            while j < b.len() {
                if q != 0 {
                    if b[j] == q {
                        q = 0;
                    }
                } else if b[j] == b'"' || b[j] == b'\'' && j > i + 1 && b[j - 1] == b'=' {
                    q = b[j];
                } else if b[j] == b']' {
                    break;
                }
                j += 1;
            }
            if j >= b.len() {
                break;
            }
            out.push((i, j + 1, &s[i + 1..j]));
            i = j + 1;
        } else {
            i += 1;
        }
    }
    out
}

/// Macro definitions of a script: `[macro name=x] … [endmacro]`, possibly over several lines.
pub fn collect_macros(text: &str, into: &mut HashMap<String, MacroInfo>) {
    let mut cur: Option<(String, MacroInfo)> = None;
    for (_, _, body) in tags_in(text) {
        let t = parse_tag(body);
        let n = t.name.to_ascii_lowercase();
        if n == "macro" {
            if let Some(name) = t.attrs.get("name") {
                cur = Some((name.to_ascii_lowercase(), MacroInfo::default()));
            }
            continue;
        }
        if n == "endmacro" {
            if let Some((name, info)) = cur.take() {
                into.insert(name, info);
            }
            continue;
        }
        let Some((_, info)) = cur.as_mut() else { continue };
        match n.as_str() {
            "hisout" => {
                if let Some(txt) = t.attrs.get("txt").or_else(|| t.attrs.get("text")) {
                    let name = txt.trim().trim_matches(|c: char| c == '-' || c == '－' || c.is_whitespace() || c == '\u{3000}');
                    if !name.is_empty() {
                        info.speaker = Some(name.to_string());
                    }
                }
            }
            "name" | "nm" | "chara_ptext" => {
                if let Some(v) = t.attrs.get("text").or_else(|| t.attrs.get("t")).or_else(|| t.attrs.get("name")) {
                    if !v.is_empty() && !v.starts_with('%') && !v.starts_with('&') {
                        info.speaker = Some(v.clone());
                    }
                }
            }
            "font" => {
                if let Some(c) = t.attrs.get("color").and_then(|v| color_of(v)) {
                    info.color = Some(c);
                }
            }
            "ctrlspeakingperson" => info.narration = true,
            _ => {}
        }
    }
}

/// Inline alternatives: `[if exp=…]A[endif][if exp=…]B[endif]` (a name the player sees one of) keeps A.
fn first_inline_branch(line: &str) -> String {
    let tags = tags_in(line);
    let mut out = String::new();
    let mut at = 0;
    let mut k = 0;
    while k < tags.len() {
        let (s, e, body) = tags[k];
        let is_if = |b: &str| parse_tag(b).name.eq_ignore_ascii_case("if");
        let is_endif = |b: &str| parse_tag(b).name.eq_ignore_ascii_case("endif");
        if is_if(body) && k + 1 < tags.len() && is_endif(tags[k + 1].2) && !line[e..tags[k + 1].0].contains('[') {
            // a run of two or more adjacent if-groups
            let mut groups = vec![(s, tags[k + 1].1, &line[e..tags[k + 1].0])];
            let mut j = k + 2;
            while j + 1 < tags.len() && tags[j].0 == groups.last().unwrap().1 && is_if(tags[j].2) && is_endif(tags[j + 1].2) {
                groups.push((tags[j].0, tags[j + 1].1, &line[tags[j].1..tags[j + 1].0]));
                j += 2;
            }
            if groups.len() >= 2 {
                out.push_str(&line[at..s]);
                out.push_str(groups[0].2);
                at = groups.last().unwrap().1;
                k = j;
                continue;
            }
        }
        k += 1;
    }
    out.push_str(&line[at..]);
    out
}

pub struct KsParser<'a> {
    pub macros: &'a HashMap<String, MacroInfo>,
}

/// A parsed block (text between two window clears) for pairing translations by label.
#[derive(Debug, Default)]
pub struct Block {
    pub key: Option<String>,
    pub lines: Vec<usize>,
}

struct State<'m> {
    macros: &'m HashMap<String, MacroInfo>,
    name: String,
    lines: Vec<Line>,
    choices: Vec<Choice>,
    blocks: Vec<Block>,
    cur_block: Vec<usize>,
    speaker: Option<String>,
    color: Option<String>,
    page: bool,
    pending_options: Vec<ChoiceOption>,
    link: Option<(String, Option<String>)>,
    ns: Option<String>,
}

impl<'m> State<'m> {
    fn push_line(&mut self, text: &str, ruby: Vec<[String; 2]>, color: Option<String>) {
        let t = text.trim_matches(|c: char| c.is_whitespace() || c == '\u{3000}');
        if t.is_empty() {
            return;
        }
        // a 【name】 line names the speaker of what follows
        if t.starts_with('【') && t.ends_with('】') && t.chars().count() >= 3 && !t[3..t.len() - 3].contains('【') {
            self.speaker = Some(t[3..t.len() - 3].to_string());
            return;
        }
        let index = self.lines.len() as u32;
        let line = Line {
            id: format!("{}#{}", self.name, index),
            index,
            speaker: self.speaker.clone(),
            text: t.to_string(),
            ruby,
            color,
            page: std::mem::replace(&mut self.page, false),
            ..Default::default()
        };
        self.cur_block.push(self.lines.len());
        self.lines.push(line);
    }

    fn clear(&mut self, key: Option<String>) {
        self.flush_choice();
        if !self.cur_block.is_empty() {
            self.blocks.push(Block { key, lines: std::mem::take(&mut self.cur_block) });
        }
        self.page = true;
        self.speaker = None;
        self.color = None;
    }

    fn flush_choice(&mut self) {
        if !self.pending_options.is_empty() {
            let id = format!("{}@{}", self.name, self.choices.len());
            self.choices.push(Choice { id, after: self.lines.len() as i64 - 1, options: std::mem::take(&mut self.pending_options) });
        }
    }

    /// One physical line of text with inline tags.
    fn row(&mut self, raw: &str) {
        let line = first_inline_branch(raw);
        let mut text = String::new();
        let mut ruby: Vec<[String; 2]> = Vec::new();
        let mut pending_reading: Option<String> = None;
        let mut color_at_start: Option<Option<String>> = None;
        let mut at = 0;
        let tags = tags_in(&line);
        let emit_text = |s: &str, st: &mut State, text: &mut String, ruby: &mut Vec<[String; 2]>, pending: &mut Option<String>, cstart: &mut Option<Option<String>>| {
            let s = s.replace("[[", "[");
            if s.trim().is_empty() && text.is_empty() {
                return;
            }
            if let Some((ref mut t, _)) = st.link {
                t.push_str(&s);
                return;
            }
            if let Some(ref mut n) = st.ns {
                n.push_str(&s);
                return;
            }
            if cstart.is_none() {
                *cstart = Some(st.color.clone());
            }
            let mut chars = s.chars();
            if let Some(r) = pending.take() {
                if let Some(c) = chars.next() {
                    ruby.push([c.to_string(), r]);
                    text.push(c);
                }
            }
            text.extend(chars);
        };
        for (s, e, body) in tags {
            emit_text(&line[at..s], self, &mut text, &mut ruby, &mut pending_reading, &mut color_at_start);
            at = e;
            let tag = parse_tag(body);
            let n = tag.name.to_ascii_lowercase();
            match n.as_str() {
                "l" => {
                    let c = color_at_start.take().flatten();
                    self.push_line(&std::mem::take(&mut text), std::mem::take(&mut ruby), c);
                }
                "cm" | "er" | "ct" => {
                    let c = color_at_start.take().flatten();
                    self.push_line(&std::mem::take(&mut text), std::mem::take(&mut ruby), c);
                    self.clear(None);
                }
                "c" => {
                    if let Some(t) = tag.attrs.get("text") {
                        emit_text(t, self, &mut text, &mut ruby, &mut pending_reading, &mut color_at_start);
                    }
                }
                "ruby" => pending_reading = tag.attrs.get("text").cloned(),
                "font" => {
                    if let Some(c) = tag.attrs.get("color").and_then(|v| color_of(v)) {
                        self.color = Some(c);
                    }
                }
                "resetfont" => self.color = None,
                "nm" | "name" => {
                    if let Some(v) = tag.attrs.get("t").or_else(|| tag.attrs.get("text")).or_else(|| tag.attrs.get("name")) {
                        self.speaker = Some(v.clone());
                    }
                }
                "ns" => self.ns = Some(String::new()),
                "nse" => {
                    if let Some(n) = self.ns.take() {
                        let n = n.trim().to_string();
                        if !n.is_empty() {
                            self.speaker = Some(n);
                        }
                    }
                }
                "link" => {
                    let target = [tag.attrs.get("storage"), tag.attrs.get("target")].iter().flatten().map(|s| s.as_str()).collect::<Vec<_>>().join("");
                    self.link = Some((String::new(), (!target.is_empty()).then_some(target)));
                }
                "endlink" => {
                    if let Some((t, target)) = self.link.take() {
                        let t = t.trim().to_string();
                        if !t.is_empty() {
                            self.pending_options.push(ChoiceOption { text: t, langs: BTreeMap::new(), target });
                        }
                    }
                }
                "seladd" | "selbutton" | "choice" | "button" | "glink" => {
                    let target = [tag.attrs.get("storage"), tag.attrs.get("target")].iter().flatten().map(|s| s.as_str()).collect::<Vec<_>>().join("");
                    // a graphic button names its option only through the label it jumps to (*手を伸ばした)
                    let label = tag.attrs.get("target").map(|t| t.trim_start_matches('*')).filter(|t| t.chars().any(is_japanese));
                    if let Some(t) = tag.attrs.get("text").map(String::as_str).or(label) {
                        self.pending_options.push(ChoiceOption { text: t.to_string(), langs: BTreeMap::new(), target: (!target.is_empty()).then_some(target) });
                    }
                }
                "s" => self.flush_choice(),
                _ => {
                    if let Some(info) = self.macros.get(&n) {
                        if info.speaker.is_some() || info.narration {
                            self.speaker = info.speaker.clone();
                        }
                        if info.color.is_some() {
                            self.color = info.color.clone();
                        }
                    } else if tag.attrs.is_empty() && tag.name.chars().next().map_or(false, is_japanese) {
                        // only a bare Japanese tag prints (a sprite command such as [女中 storage=…] does not)
                        // [輝夜] prints the word; [漢字'よみ] prints 漢字 with its reading
                        let (word, reading) = match tag.name.split_once('\'') {
                            Some((w, r)) => (w.to_string(), Some(r.to_string())),
                            None => (tag.name.trim_end_matches("ruby").to_string(), None),
                        };
                        if tag.name.chars().all(|c| is_japanese(c) || c == '\'' || c.is_ascii_alphabetic()) {
                            if let Some(r) = reading {
                                ruby.push([word.clone(), r]);
                            }
                            emit_text(&word, self, &mut text, &mut ruby, &mut pending_reading, &mut color_at_start);
                        }
                    }
                }
            }
        }
        emit_text(&line[at..], self, &mut text, &mut ruby, &mut pending_reading, &mut color_at_start);
        let c = color_at_start.take().flatten();
        self.push_line(&text, ruby, c);
    }
}

impl<'a> KsParser<'a> {
    /// Lines, choices and blocks (for pairing a translation of the same script).
    pub fn parse_text(&self, name: &str, text: &str) -> (Script, Vec<Block>) {
        let mut st = State {
            macros: self.macros,
            name: name.to_string(),
            lines: Vec::new(),
            choices: Vec::new(),
            blocks: Vec::new(),
            cur_block: Vec::new(),
            speaker: None,
            color: None,
            page: true,
            pending_options: Vec::new(),
            link: None,
            ns: None,
        };
        let (mut script, mut in_macro, mut cont) = (false, false, false);
        for raw in text.split('\n') {
            let t = raw.trim_matches(|c: char| c == '\r' || c == ' ' || c == '\t');
            if t.is_empty() || t.starts_with(';') {
                continue;
            }
            let lower = t.to_ascii_lowercase();
            if lower.starts_with("@iscript") || lower.starts_with("[iscript") {
                script = true;
                continue;
            }
            if script {
                if lower.starts_with("@endscript") || lower.starts_with("[endscript") {
                    script = false;
                }
                continue;
            }
            if cont {
                cont = t.ends_with('\\');
                continue;
            }
            if (t.starts_with('@') || t.starts_with('[')) && t.ends_with('\\') {
                cont = true;
                continue;
            }
            // macro bodies are read by collect_macros, not shown
            if lower.starts_with("[macro") || lower.starts_with("@macro") {
                in_macro = !(lower.contains("[endmacro]") || lower.contains("@endmacro"));
                continue;
            }
            if in_macro {
                if lower.contains("endmacro") {
                    in_macro = false;
                }
                continue;
            }
            if let Some(label) = t.strip_prefix('*') {
                let key = label.contains('|').then(|| t.to_string());
                if !st.cur_block.is_empty() {
                    st.clear(key);
                }
                continue;
            }
            if let Some(cmd) = t.strip_prefix('@') {
                let tag = parse_tag(cmd);
                match tag.name.to_ascii_lowercase().as_str() {
                    "cm" | "er" | "ct" => st.clear(None),
                    "s" => st.flush_choice(),
                    _ => {
                        // a command line behaves like the same tag inline
                        st.row(&format!("[{}]", cmd));
                    }
                }
                continue;
            }
            st.row(t);
        }
        st.clear(None);
        let lines = st.lines;
        let choices = st.choices;
        (Script { name: name.to_string(), archive: String::new(), active: true, lines, choices }, st.blocks)
    }
}

impl<'a> ScriptParser for KsParser<'a> {
    fn parse(&self, name: &str, data: &[u8]) -> Result<Option<Script>> {
        let (s, _) = self.parse_text(name, &decode(data));
        Ok((!s.lines.is_empty() || !s.choices.is_empty()).then_some(s))
    }
}

/// Puts a translation of the same script on each line: blocks pair by label, else in order between shared labels;
/// a block with as many lines gets them one by one, else the first line gets the whole translated block.
pub fn pair(primary: &mut Script, blocks: &[Block], other: &Script, other_blocks: &[Block], tag: &str) {
    let by_key: HashMap<&str, &Block> = other_blocks.iter().filter_map(|b| b.key.as_deref().map(|k| (k, b))).collect();
    let mut next_unkeyed = other_blocks.iter().filter(|b| b.key.is_none() || !blocks.iter().any(|x| x.key == b.key)).peekable();
    for b in blocks {
        let z = match b.key.as_deref().and_then(|k| by_key.get(k)) {
            Some(z) => Some(*z),
            None => next_unkeyed.next(),
        };
        let Some(z) = z else { continue };
        if z.lines.len() == b.lines.len() {
            for (&i, &j) in b.lines.iter().zip(&z.lines) {
                primary.lines[i].langs.insert(tag.to_string(), other.lines[j].text.clone());
            }
        } else if let Some(&first) = b.lines.first() {
            let joined: Vec<&str> = z.lines.iter().map(|&j| other.lines[j].text.as_str()).collect();
            primary.lines[first].langs.insert(tag.to_string(), joined.join("\n"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(text: &str, macros: &HashMap<String, MacroInfo>) -> Script {
        KsParser { macros }.parse_text("t.ks", text).0
    }

    #[test]
    fn speakers_colours_ruby_and_pages() {
        let mut m = HashMap::new();
        collect_macros(
            "[macro name=michel][ctrlSpeakingPerson speaker=\"michel\"][hisout txt=\"- ミシェル -\"][r][endmacro]\n\
             [macro name=jinobun][ctrlSpeakingPerson speaker=\"jinobun\"][font color=\"0x9D9D9D\"][endmacro]",
            &mut m,
        );
        let s = parse(
            "*start\n[michel]「おはよう」[l]「元気？」[p]\n*scenario_1|\n[cm]\n[jinobun]朝の[ruby text=\"ひかり\"]光が差す。[p][cm]\n【薫】\n「[漢字'かんじ]だ」[p][cm]\n",
            &m,
        );
        let t: Vec<&str> = s.lines.iter().map(|l| l.text.as_str()).collect();
        assert_eq!(t, vec!["「おはよう」", "「元気？」", "朝の光が差す。", "「漢字だ」"]);
        assert_eq!(s.lines[0].speaker.as_deref(), Some("ミシェル"));
        assert_eq!(s.lines[1].speaker.as_deref(), Some("ミシェル"));
        assert!(s.lines[0].page && !s.lines[1].page && s.lines[2].page);
        assert_eq!(s.lines[2].speaker, None);
        assert_eq!(s.lines[2].color.as_deref(), Some("#9d9d9d"));
        assert_eq!(s.lines[2].ruby, vec![["光".to_string(), "ひかり".to_string()]]);
        assert_eq!(s.lines[3].speaker.as_deref(), Some("薫"));
        assert_eq!(s.lines[3].ruby, vec![["漢字".to_string(), "かんじ".to_string()]]);
    }

    #[test]
    fn choices_code_and_inline_branches() {
        let m = HashMap::new();
        let s = parse(
            "[iscript]\nvar a = \"文字\";\n[endscript]\n[if exp=\"f.a\"]アリス[endif][if exp=\"!f.a\"]ボブ[endif]は来た。[p][cm]\n\
             [link target=*a]右へ行く[endlink][r]\n[link storage=\"b.ks\"]左へ行く[endlink][s]\n\
             [女中 storage=\"体\" posx=\"right\"]\n[button graphic=\"line\" target=*手を伸ばした][button graphic=\"x\" target=*back][s]\n",
            &m,
        );
        assert_eq!(s.choices[1].options.len(), 1);
        assert_eq!(s.choices[1].options[0].text, "手を伸ばした");
        assert_eq!(s.lines.len(), 1);
        assert_eq!(s.lines[0].text, "アリスは来た。");
        assert_eq!(s.choices.len(), 2);
        assert_eq!(s.choices[0].after, 0);
        let o: Vec<(&str, Option<&str>)> = s.choices[0].options.iter().map(|o| (o.text.as_str(), o.target.as_deref())).collect();
        assert_eq!(o, vec![("右へ行く", Some("*a")), ("左へ行く", Some("b.ks"))]);
    }

    #[test]
    fn translation_pairs_by_label() {
        let m = HashMap::new();
        let p = KsParser { macros: &m };
        let (mut ja, jb) = p.parse_text("a.ks", "一つ目。[l]二つ目。[p]\n*s_1|\n[cm]\n三つ目。[p]\n*s_2|\n[cm]\n");
        let (zh, zb) = p.parse_text("a.ks", "第三句。[p]\n*s_2|\n[cm]\n第一句。[l]第二句。[p]\n*s_1|\n[cm]\n");
        pair(&mut ja, &jb, &zh, &zb, "zh-Hans");
        let z: Vec<&str> = ja.lines.iter().map(|l| l.langs["zh-Hans"].as_str()).collect();
        assert_eq!(z, vec!["第一句。", "第二句。", "第三句。"]);
    }
}
