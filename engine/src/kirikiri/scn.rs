// SPDX-License-Identifier: GPL-3.0-or-later
//! KiriKiri Z scene files (.scn PSB): every line with its speaker, voice and, in multilingual Steam releases, every
//! language of the release. Follows services/original-engines/cx-worker.cjs (textsOf / rubyOf).
//!
//! A text entry is `[name, display, [[speaker, text, length, plain, plain] per language], voices, ...]` in the
//! multilingual releases, or `[name, [[speaker, text, ...]], voices, ...]` in single-language ones. Ruby is written
//! `[reading]kanji`; a reading padded with full-width spaces spans several kanji. `\n` is a line break.

use super::psb;
use crate::model::{Choice, ChoiceOption, Line, Script};
use crate::{Result, ScriptParser};
use serde_json::Value;
use std::collections::BTreeMap;

pub struct ScnParser;

fn is_slots(v: &Value) -> bool {
    v.as_array().map_or(false, |a| a.iter().any(|s| s.as_array().map_or(false, |s| s.get(1).map_or(false, Value::is_string))))
}

/// Ruby markup removed, `\n` as a real line break.
pub fn clean(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '[' => {
                for d in chars.by_ref() {
                    if d == ']' {
                        break;
                    }
                }
            }
            '\\' if chars.peek() == Some(&'n') => {
                chars.next();
                out.push('\n');
            }
            _ => out.push(c),
        }
    }
    out
}

fn padded(r: &str) -> bool {
    let f = |c: char| c.is_whitespace() || c == '\u{3000}';
    r.starts_with(f) || r.ends_with(f)
}

fn has_kana(s: &str) -> bool {
    s.chars().any(|c| ('\u{3041}'..='\u{30ff}').contains(&c))
}

/// The game's own readings: `[し]志[な]那[つ]都荘` -> 志那都 / しなつ (neighbouring marks make one word).
pub fn ruby_of(s: &str) -> Vec<[String; 2]> {
    struct Mark {
        at: usize,
        end: usize,
        reading: String,
        base: char,
    }
    let chars: Vec<char> = s.chars().collect();
    let mut marks = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '[' {
            if let Some(close) = chars[i + 1..].iter().position(|&c| c == ']').map(|p| i + 1 + p) {
                if close + 1 < chars.len() {
                    marks.push(Mark { at: i, end: close + 2, reading: chars[i + 1..close].iter().collect(), base: chars[close + 1] });
                    i = close + 2;
                    continue;
                }
            }
        }
        i += 1;
    }
    let mut out = Vec::new();
    let mut k = 0;
    while k < marks.len() {
        let pad = padded(&marks[k].reading);
        let mut base = marks[k].base.to_string();
        let mut reading = marks[k].reading.clone();
        let mut j = k;
        while j + 1 < marks.len() && marks[j + 1].at == marks[j].end && padded(&marks[j + 1].reading) == pad {
            j += 1;
            base.push(marks[j].base);
            reading.push_str(&marks[j].reading);
        }
        if pad {
            reading.retain(|c| !(c.is_whitespace() || c == '\u{3000}'));
        }
        if has_kana(&reading) {
            out.push([base, reading]);
        }
        k = j + 1;
    }
    out
}

fn voice_of(t: &[Value]) -> Option<String> {
    for k in [3, 2] {
        if let Some(a) = t.get(k).and_then(Value::as_array) {
            if let Some(v) = a.iter().find_map(|x| x.get("voice").and_then(Value::as_str)) {
                return Some(v.to_string());
            }
        }
    }
    None
}

/// BCP 47 tags of the language slots: the document's own `languages` list, else by slot count.
fn lang_tags(root: &Value, slots: usize) -> Vec<String> {
    let norm = |s: &str| -> String {
        let l = s.to_ascii_lowercase().replace('-', "_");
        match l.as_str() {
            "ja" | "jp" | "jpn" | "japanese" => "ja",
            "en" | "eng" | "english" => "en",
            "cn" | "chs" | "sc" | "zh" | "zh_cn" | "zh_hans" | "schinese" => "zh-Hans",
            "tw" | "cht" | "tc" | "zh_tw" | "zh_hant" | "tchinese" => "zh-Hant",
            _ => return s.to_string(),
        }
        .to_string()
    };
    if let Some(list) = root.get("languages").and_then(Value::as_array) {
        let tags: Vec<String> = list.iter().filter_map(|v| v.as_str().map(norm).or_else(|| v.get("name").and_then(Value::as_str).map(norm))).collect();
        if tags.len() >= slots && slots > 0 {
            return tags;
        }
    }
    match slots {
        4 => vec!["ja", "en", "zh-Hans", "zh-Hant"],
        3 => vec!["ja", "zh-Hans", "zh-Hant"],
        2 => vec!["ja", "en"],
        _ => vec!["ja"],
    }
    .into_iter()
    .map(String::from)
    .collect()
}

fn string_at(v: &Value, i: usize) -> Option<String> {
    v.get(i).and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from)
}

fn str_in(a: &[Value], i: usize) -> Option<String> {
    a.get(i).and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from)
}

impl ScnParser {
    pub fn from_doc(entry: &str, root: &Value) -> Option<Script> {
        let scenes = root.get("scenes")?.as_array()?;
        let name = root.get("name").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or(entry).to_string();
        let mut lines: Vec<Line> = Vec::new();
        let mut choices = Vec::new();
        let mut tags: Option<Vec<String>> = None;
        for scene in scenes {
            for t in scene.get("texts").and_then(Value::as_array).into_iter().flatten() {
                let Some(t) = t.as_array() else { continue };
                let slots = if t.get(2).map_or(false, is_slots) {
                    t.get(2)
                } else if t.get(1).map_or(false, is_slots) {
                    t.get(1)
                } else {
                    None
                };
                let mut line = Line::default();
                if let Some(slots) = slots.and_then(Value::as_array) {
                    let tags = tags.get_or_insert_with(|| lang_tags(root, slots.len()));
                    let first = &slots[0];
                    let raw = first.get(1).and_then(Value::as_str).unwrap_or("");
                    line.text = clean(raw);
                    line.ruby = ruby_of(raw);
                    // the speaker as shown: the slot's own name, else the entry's display name, else its name
                    let display = if t.get(2).map_or(false, is_slots) { str_in(t, 1) } else { None };
                    line.speaker = string_at(first, 0).or(display).or_else(|| str_in(t, 0));
                    for (k, s) in slots.iter().enumerate().skip(1) {
                        if let Some(txt) = s.get(1).and_then(Value::as_str) {
                            if !txt.is_empty() {
                                line.langs.insert(tags.get(k).cloned().unwrap_or_else(|| format!("slot{}", k)), clean(txt));
                            }
                        }
                    }
                } else if let Some(s) = t.get(2).and_then(Value::as_str) {
                    line.text = clean(s);
                    line.ruby = ruby_of(s);
                    line.speaker = str_in(t, 0);
                } else {
                    continue;
                }
                line.voice = voice_of(t);
                line.page = true;
                line.index = lines.len() as u32;
                line.id = format!("{}#{}", name, line.index);
                lines.push(line);
            }
            if let Some(sel) = scene.get("selects").and_then(Value::as_array) {
                let options: Vec<ChoiceOption> = sel
                    .iter()
                    .filter_map(|o| {
                        let text = o.get("text").and_then(Value::as_str)?;
                        let mut langs = BTreeMap::new();
                        if let Some(ls) = o.get("language").and_then(Value::as_array) {
                            let tags = lang_tags(root, ls.len());
                            for (k, l) in ls.iter().enumerate().skip(1) {
                                if let Some(x) = l.get("text").and_then(Value::as_str) {
                                    langs.insert(tags.get(k).cloned().unwrap_or_else(|| format!("slot{}", k)), clean(x));
                                }
                            }
                        }
                        Some(ChoiceOption { text: clean(text), langs, target: o.get("tag").and_then(Value::as_str).map(String::from) })
                    })
                    .collect();
                if !options.is_empty() {
                    choices.push(Choice { id: format!("{}@{}", name, choices.len()), after: lines.len() as i64 - 1, options });
                }
            }
        }
        if lines.is_empty() && choices.is_empty() {
            return None;
        }
        Some(Script { name, archive: String::new(), active: true, lines, choices })
    }
}

impl ScriptParser for ScnParser {
    fn parse(&self, name: &str, data: &[u8]) -> Result<Option<Script>> {
        if !psb::is_psb(data) {
            return Ok(None);
        }
        let doc = psb::parse(data)?;
        Ok(Self::from_doc(name, &doc.root))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn ruby_words_and_padding() {
        assert_eq!(ruby_of("[し]志[な]那[つ]都荘"), vec![["志那都".to_string(), "しなつ".to_string()]]);
        assert_eq!(ruby_of("[　げんじ　]玄[　ゅう]十"), vec![["玄十".to_string(), "げんじゅう".to_string()]]);
        assert_eq!(clean("[し]志那\\nです"), "志那\nです");
    }

    #[test]
    fn multilingual_scene_with_speaker_voice_and_choice() {
        let root = json!({
            "name": "s01",
            "languages": ["ja", "zh_cn"],
            "scenes": [{
                "texts": [
                    ["kaoru", "薫", [["薫", "「[か]火[じ]事だ！」", 5], ["薫", "「着火了！」", 5]], [{"voice": "kao_001"}]],
                    [null, null, [[null, "静かな夜。", 5], [null, "安静的夜晚。", 5]], null]
                ],
                "selects": [{"text": "逃げる", "tag": "run", "language": [null, {"text": "逃跑"}]}]
            }]
        });
        let s = ScnParser::from_doc("e.scn", &root).unwrap();
        assert_eq!(s.lines.len(), 2);
        assert_eq!(s.lines[0].speaker.as_deref(), Some("薫"));
        assert_eq!(s.lines[0].text, "「火事だ！」");
        assert_eq!(s.lines[0].ruby, vec![["火事".to_string(), "かじ".to_string()]]);
        assert_eq!(s.lines[0].voice.as_deref(), Some("kao_001"));
        assert_eq!(s.lines[0].langs.get("zh-Hans").map(String::as_str), Some("「着火了！」"));
        assert_eq!(s.lines[1].speaker, None);
        assert_eq!(s.choices[0].after, 1);
        assert_eq!(s.choices[0].options[0].langs.get("zh-Hans").map(String::as_str), Some("逃跑"));
        assert_eq!(s.choices[0].options[0].target.as_deref(), Some("run"));
    }
}
