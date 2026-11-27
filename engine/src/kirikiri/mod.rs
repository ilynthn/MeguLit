// SPDX-License-Identifier: GPL-3.0-or-later
//! KiriKiri / KiriKiri Z backend.
//!
//! Story text lives either in scene files (.scn PSB, KiriKiri Z: every line, speaker, voice and the release's other
//! languages) or in KAG scenario scripts (.ks). Archives are XP3, often encrypted per title (cx.rs). Later archives
//! override earlier ones as the engine loads them (data < patch < patch2 ...).

pub mod cx;
pub mod ks;
pub mod psb;
pub mod scn;
pub mod xp3;

use crate::model::{ArchiveStats, Extraction, Script, Stats};
use crate::text::decode;
use crate::{Archive, Backend, Confidence, Decrypt, Entry, Result};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use xp3::Xp3;

#[derive(Default)]
pub struct KiriKiri {
    /// Read only these archives (file names, case-insensitive); empty: all. For per-archive timing and debugging.
    pub only: Vec<String>,
}

/// Archives that hold only media (never scripts): skipped without opening their entries.
fn is_media_archive(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    let stem = n.trim_end_matches(".xp3");
    let media = ["bgimage", "fgimage", "evimage", "sdimage", "image", "bgm", "voice", "sound", "se", "movie", "video", "thum", "emote", "font", "sysse"];
    media.iter().any(|m| stem.starts_with(m)) || stem.contains("_evimage") || stem.contains("_video")
}

const NON_SCRIPT_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "bmp", "gif", "webp", "tlg", "tlg5", "tlg6", "psd", "pimg", "mstand", "stage", "ogg", "wav", "mp3", "opus", "flac", "wma",
    "sli", "wmv", "mp4", "avi", "mpg", "mpeg", "mkv", "amv", "ttf", "otf", "ttc", "tft", "fon", "tjs", "ini", "xml", "json", "cfg", "dll", "exe", "zip",
    "csv", "txt", "asd", "func", "map", "sig",
];

fn ext(name: &str) -> String {
    name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default()
}

fn is_ks(name: &str) -> bool {
    let n = name.replace('\\', "/").to_ascii_lowercase();
    n.ends_with(".ks") || (n.contains("scenario/") && n.ends_with(".txt") && !n.rsplit('/').next().unwrap_or("").starts_with('!'))
}

/// Patch archives load after the base ones: patch.xp3 = 1, patch2.xp3 = 2 ...
fn rank(name: &str) -> u32 {
    let n = name.to_ascii_lowercase();
    match n.strip_prefix("patch").and_then(|r| r.strip_suffix(".xp3")) {
        Some("") => 1,
        Some(d) if d.chars().all(|c| c.is_ascii_digit()) => 1 + d.parse::<u32>().unwrap_or(0),
        _ => 0,
    }
}

/// Language of a per-language archive (data_jp.xp3, data_zh.xp3 ...), if it is one.
fn archive_lang(name: &str) -> Option<&'static str> {
    let stem = name.to_ascii_lowercase();
    let stem = stem.trim_end_matches(".xp3");
    let suffix = stem.rsplit_once('_').map(|(_, s)| s)?;
    Some(match suffix {
        "jp" | "ja" | "jpn" | "japanese" => "ja",
        "zh" | "cn" | "chs" | "sc" | "zhs" | "schinese" => "zh-Hans",
        "tw" | "zt" | "cht" | "tc" | "tchinese" => "zh-Hant",
        "en" | "eng" | "english" => "en",
        _ => return None,
    })
}

fn archives_in(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for d in [dir.join("arc"), dir.to_path_buf()] {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        let mut v: Vec<PathBuf> = rd
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().map_or(false, |e| e.eq_ignore_ascii_case("xp3")) && p.is_file())
            .collect();
        v.sort_by(|a, b| {
            let (na, nb) = (file_name(a), file_name(b));
            rank(&na).cmp(&rank(&nb)).then(na.to_lowercase().cmp(&nb.to_lowercase()))
        });
        out.extend(v);
    }
    out
}

fn file_name(p: &Path) -> String {
    p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
}

struct Opened {
    name: String,
    xp3: Xp3,
    filter: Option<Arc<dyn Decrypt>>,
    stats: ArchiveStats,
}

fn read(o: &Opened, e: &Entry) -> Result<Vec<u8>> {
    let mut b = o.xp3.read_raw(e)?;
    if e.encrypted {
        if let Some(f) = &o.filter {
            f.decrypt(e, 0, &mut b);
        }
    }
    Ok(b)
}

/// Runs `f` over items on all cores, keeping order.
fn par_map<T: Sync, R: Send>(items: &[T], f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let n = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(16).max(1);
    if items.len() < 2 || n == 1 {
        return items.iter().map(&f).collect();
    }
    let chunk = items.len().div_ceil(n);
    std::thread::scope(|s| {
        let hs: Vec<_> = items.chunks(chunk).map(|c| s.spawn(|| c.iter().map(&f).collect::<Vec<R>>())).collect();
        hs.into_iter().flat_map(|h| h.join().unwrap()).collect()
    })
}

impl KiriKiri {
    fn open_archives(&self, dir: &Path, problems: &mut Vec<String>) -> Vec<Opened> {
        let mut out = Vec::new();
        for p in archives_in(dir) {
            let name = file_name(&p);
            if is_media_archive(&name) || !xp3::is_xp3(&p) || (!self.only.is_empty() && !self.only.iter().any(|o| o.eq_ignore_ascii_case(&name))) {
                continue;
            }
            let x = match Xp3::open(&p) {
                Ok(x) => x,
                Err(e) => {
                    problems.push(format!("{}: {}", name, e));
                    continue;
                }
            };
            let entries = x.entries();
            let scripty = entries.iter().any(|e| {
                let x = ext(&e.name);
                x == "scn" || is_ks(&e.name) || x.is_empty() || !NON_SCRIPT_EXT.contains(&x.as_str())
            });
            if !scripty {
                continue;
            }
            let mut stats = ArchiveStats { name: name.clone(), entries: entries.len(), encrypted: entries.iter().filter(|e| e.encrypted).count(), ..Default::default() };
            let hx_raw = x.hx_chunk();
            let has_hx = hx_raw.is_some();
            let filter = match cx::choose(&x, dir, hx_raw.as_deref()) {
                cx::Choice::Plain => {
                    stats.cipher = "plain".into();
                    None
                }
                cx::Choice::Filter(f) => {
                    stats.cipher = f.name();
                    Some(f)
                }
                cx::Choice::Unknown => {
                    stats.cipher = if has_hx { "unknown (HxCrypt)".into() } else { "unknown".into() };
                    problems.push(format!("{}: no known cipher fits its encrypted entries", name));
                    None
                }
            };
            out.push(Opened { name, xp3: x, filter, stats });
        }
        out
    }

    fn scn_scripts(&self, archives: &[Opened]) -> Vec<(usize, Script)> {
        let mut out = Vec::new();
        for (ai, o) in archives.iter().enumerate() {
            if o.stats.cipher.starts_with("unknown") {
                continue;
            }
            let named_scn = o.xp3.entries().iter().any(|e| ext(&e.name) == "scn");
            let cands: Vec<&Entry> = o
                .xp3
                .entries()
                .iter()
                .filter(|e| {
                    let x = ext(&e.name);
                    if named_scn {
                        x == "scn"
                    } else {
                        e.size >= 0x40 && (x.is_empty() || x.len() > 5 || !(NON_SCRIPT_EXT.contains(&x.as_str()) || x == "ks"))
                    }
                })
                .collect();
            let parsed = par_map(&cands, |e| {
                let b = read(o, e).ok()?;
                if !psb::is_psb(&b) {
                    return None;
                }
                let doc = psb::parse(&b).ok()?;
                scn::ScnParser::from_doc(&e.name, &doc.root)
            });
            for s in parsed.into_iter().flatten() {
                out.push((ai, s));
            }
        }
        out
    }

    fn ks_scripts(&self, dir: &Path, archives: &[Opened]) -> Vec<(usize, Script)> {
        // texts per archive: (archive index, entry name, text)
        let mut texts: Vec<(usize, String, String)> = Vec::new();
        for (ai, o) in archives.iter().enumerate() {
            if o.stats.cipher.starts_with("unknown") {
                continue;
            }
            let cands: Vec<&Entry> = o.xp3.entries().iter().filter(|e| is_ks(&e.name) && e.size > 0).collect();
            let got = par_map(&cands, |e| read(o, e).ok().map(|b| (e.name.replace('\\', "/"), decode(&b))));
            for (n, t) in got.into_iter().flatten() {
                texts.push((ai, n, t));
            }
        }
        // loose scripts next to the game (depth 2)
        let loose_idx = archives.len();
        let mut stack = vec![(dir.to_path_buf(), 0)];
        while let Some((d, depth)) = stack.pop() {
            let Ok(rd) = std::fs::read_dir(&d) else { continue };
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() && depth < 2 {
                    stack.push((p, depth + 1));
                } else if p.is_file() && is_ks(&file_name(&p)) {
                    if let Ok(b) = std::fs::read(&p) {
                        texts.push((loose_idx, file_name(&p), decode(&b)));
                    }
                }
            }
        }
        let langs: Vec<Option<&str>> = archives.iter().map(|o| archive_lang(&o.name)).collect();
        let has_ja_archive = langs.iter().any(|l| *l == Some("ja"));
        let is_primary = |ai: usize| ai == loose_idx || if has_ja_archive { langs[ai] == Some("ja") || langs[ai].is_none() } else { true };
        let mut macros = HashMap::new();
        for (ai, _, t) in &texts {
            if is_primary(*ai) {
                ks::collect_macros(t, &mut macros);
            }
        }
        let parser = ks::KsParser { macros: &macros };
        // translations: per language, by lower-case script name
        let mut others: HashMap<(&str, String), (Script, Vec<ks::Block>)> = HashMap::new();
        if has_ja_archive {
            for (ai, n, t) in &texts {
                if let Some(l) = langs.get(*ai).copied().flatten().filter(|l| *l != "ja") {
                    others.insert((l, n.to_lowercase()), parser.parse_text(n, t));
                }
            }
        }
        let mut out = Vec::new();
        for (ai, n, t) in &texts {
            if !is_primary(*ai) {
                continue;
            }
            let (mut s, blocks) = parser.parse_text(n, t);
            for l in ["zh-Hans", "zh-Hant", "en"] {
                if let Some((o, ob)) = others.get(&(l, n.to_lowercase())) {
                    ks::pair(&mut s, &blocks, o, ob, l);
                }
            }
            if !s.lines.is_empty() || !s.choices.is_empty() {
                out.push((*ai, s));
            }
        }
        out
    }
}

impl Backend for KiriKiri {
    fn id(&self) -> &'static str {
        "kirikiri"
    }

    fn detect(&self, dir: &Path) -> Confidence {
        if archives_in(dir).iter().any(|p| xp3::is_xp3(p)) {
            Confidence::Yes
        } else if std::fs::read_dir(dir).map_or(false, |rd| rd.flatten().any(|e| is_ks(&e.file_name().to_string_lossy()))) {
            Confidence::Maybe
        } else {
            Confidence::No
        }
    }

    fn extract(&self, dir: &Path) -> Result<Extraction> {
        let t0 = Instant::now();
        let mut problems = Vec::new();
        let mut archives = self.open_archives(dir, &mut problems);
        let mut found = self.scn_scripts(&archives);
        let format = if found.iter().any(|(_, s)| !s.lines.is_empty()) {
            "scn"
        } else {
            found = self.ks_scripts(dir, &archives);
            "ks"
        };
        // the copy the engine uses: highest rank, first archive on a tie
        let mut winner: HashMap<String, (u32, usize)> = HashMap::new();
        for (k, (ai, s)) in found.iter().enumerate() {
            let r = archives.get(*ai).map_or(u32::MAX, |o| rank(&o.name));
            let key = s.name.to_lowercase();
            match winner.get(&key) {
                Some((wr, _)) if *wr >= r => {}
                _ => {
                    winner.insert(key, (r, k));
                }
            }
        }
        let mut scripts = Vec::new();
        for (k, (ai, mut s)) in found.into_iter().enumerate() {
            s.archive = archives.get(ai).map_or_else(|| "(loose)".to_string(), |o| o.name.clone());
            s.active = winner.get(&s.name.to_lowercase()).map_or(false, |(_, w)| *w == k);
            if let Some(o) = archives.get_mut(ai) {
                o.stats.scripts += 1;
                o.stats.lines += s.lines.len();
            }
            scripts.push(s);
        }
        let active: Vec<&Script> = scripts.iter().filter(|s| s.active).collect();
        let stats = Stats {
            archives: archives.iter().map(|o| o.stats.clone()).collect(),
            scripts: active.len(),
            lines: active.iter().map(|s| s.lines.len()).sum(),
            choices: active.iter().map(|s| s.choices.len()).sum(),
            ms: t0.elapsed().as_millis(),
        };
        if stats.lines == 0 && problems.is_empty() {
            problems.push("no story text found".into());
        }
        Ok(Extraction { schema: 1, engine: "kirikiri".into(), format: format.into(), scripts, stats, problems })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archive_order_and_kinds() {
        assert_eq!(rank("patch.xp3"), 1);
        assert_eq!(rank("patch2.xp3"), 3);
        assert_eq!(rank("patch_extra.xp3"), 0);
        assert!(is_media_archive("voice.xp3") && is_media_archive("bgimage.xp3") && !is_media_archive("scn.xp3"));
        assert_eq!(archive_lang("data_jp.xp3"), Some("ja"));
        assert_eq!(archive_lang("data_zh.xp3"), Some("zh-Hans"));
        assert_eq!(archive_lang("data.xp3"), None);
        assert!(is_ks("scenario/a.ks") && is_ks("scenario/r1/b.txt") && !is_ks("scenario/!list.txt"));
    }
}

#[cfg(test)]
mod extract_tests {
    //! End to end: synthetic XP3 archives (one cx-encrypted with scene files, one plain with KAG scripts) in a temp
    //! folder, read back through `extract`. No game data is involved.
    use super::*;
    use crate::model::Extraction;
    use serde_json::json;

    fn xp3(entries: &[(&str, Vec<u8>, u32, bool)]) -> Vec<u8> {
        let mut out = xp3::MAGIC.to_vec();
        out.extend(0u64.to_le_bytes()); // index offset, patched below
        let mut index = Vec::new();
        for (name, data, hash, encrypted) in entries {
            let at = out.len() as u64;
            out.extend(data);
            let units: Vec<u8> = name.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
            let mut info = Vec::new();
            info.extend((*encrypted as u32).to_le_bytes());
            info.extend((data.len() as u64).to_le_bytes());
            info.extend((data.len() as u64).to_le_bytes());
            info.extend((name.encode_utf16().count() as u16).to_le_bytes());
            info.extend(units);
            let mut segm = Vec::new();
            segm.extend(0u32.to_le_bytes());
            segm.extend(at.to_le_bytes());
            segm.extend((data.len() as u64).to_le_bytes());
            segm.extend((data.len() as u64).to_le_bytes());
            let mut file = Vec::new();
            for (tag, body) in [(b"info", info), (b"segm", segm), (b"adlr", hash.to_le_bytes().to_vec())] {
                file.extend(tag);
                file.extend((body.len() as u64).to_le_bytes());
                file.extend(body);
            }
            index.extend(b"File");
            index.extend((file.len() as u64).to_le_bytes());
            index.extend(file);
        }
        let at = out.len() as u64;
        out[11..19].copy_from_slice(&at.to_le_bytes());
        out.push(0);
        out.extend((index.len() as u64).to_le_bytes());
        out.extend(index);
        out
    }

    fn utf16(s: &str) -> Vec<u8> {
        let mut b = vec![0xff, 0xfe];
        b.extend(s.encode_utf16().flat_map(|u| u.to_le_bytes()));
        b
    }

    fn scene(name: &str, line: &str, zh: &str) -> Vec<u8> {
        psb::build::psb(&json!({
            "name": name,
            "scenes": [{"texts": [["a", "A", [["主人公", line, 4], ["主人公", zh, 2]], [{"voice": "v001"}]]]}]
        }))
    }

    fn extract_dir(files: &[(&str, Vec<u8>)]) -> Extraction {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("megulit-engine-test-{}-{}", std::process::id(), n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for (n, b) in files {
            std::fs::write(dir.join(n), b).unwrap();
        }
        let x = KiriKiri::default().extract(&dir).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
        x
    }

    #[test]
    fn encrypted_scene_archive_with_a_patch_over_it() {
        let s = cx::schemes().iter().find(|s| !s.is_hx() && s.cb.is_some() && s.riddle != Some(true)).unwrap().clone();
        let cb: Vec<u32> = crate::text::base64(s.cb.as_ref().unwrap()).unwrap()[..0x1000].chunks_exact(4).map(|c| u32::from_le_bytes(c.try_into().unwrap())).collect();
        let f = cx::CxFilter::new(s, cb);
        let enc = |name: &str, plain: Vec<u8>, hash: u32| {
            let mut b = plain;
            f.decrypt(&Entry { name: name.into(), size: b.len() as u64, encrypted: true, key: hash }, 0, &mut b);
            (name.to_string(), b, hash)
        };
        let base: Vec<(String, Vec<u8>, u32)> = vec![
            enc("s01.ks.scn", scene("s01.ks", "「おはよう」", "「早上好」"), 0x1111_2222),
            enc("s02.ks.scn", scene("s02.ks", "古い行。", "旧的。"), 0x3333_4444),
            enc("s03.ks.scn", scene("s03.ks", "三つ目。", "第三。"), 0x5555_6666),
        ];
        let patch = vec![enc("s02.ks.scn", scene("s02.ks", "新しい行。", "新的。"), 0x7777_8888), enc("x.tjs", utf16("var a;"), 0x9999_aaaa)];
        fn as_entries(v: &[(String, Vec<u8>, u32)]) -> Vec<(&str, Vec<u8>, u32, bool)> {
            v.iter().map(|(n, b, h)| (n.as_str(), b.clone(), *h, true)).collect()
        }
        let x = extract_dir(&[("scn.xp3", xp3(&as_entries(&base))), ("patch.xp3", xp3(&as_entries(&patch)))]);
        assert_eq!(x.format, "scn");
        assert!(x.stats.archives.iter().all(|a| a.cipher.starts_with("cx:")), "{:?}", x.stats.archives);
        let active: Vec<&str> = x.active_lines().map(|l| l.text.as_str()).collect();
        assert_eq!(active, vec!["「おはよう」", "三つ目。", "新しい行。"]);
        assert!(active.contains(&"新しい行。") && !active.contains(&"古い行。"), "patch.xp3 replaces scn.xp3: {:?}", active);
        let first = x.active_lines().find(|l| l.text == "「おはよう」").unwrap();
        assert_eq!(first.speaker.as_deref(), Some("主人公"));
        assert_eq!(first.voice.as_deref(), Some("v001"));
        assert_eq!(first.langs.get("en").or(first.langs.get("zh-Hans")).map(String::as_str), Some("「早上好」"));
    }

    #[test]
    fn plain_kag_archive_with_a_translation_archive() {
        let ja = "[macro name=hero][hisout txt=\"- 勇者 -\"][endmacro]\n*a\n[hero]行くぞ。[l]待って。[p]\n*s_1|\n[cm]\n";
        let zh = "*a\n[hero]走吧。[l]等等。[p]\n*s_1|\n[cm]\n";
        let x = extract_dir(&[
            ("data_jp.xp3", xp3(&[("scenario/a.ks", utf16(ja), 1, false), ("scenario/b.ks", utf16("[cm]二本目。[p]\n"), 2, false)])),
            ("data_zh.xp3", xp3(&[("scenario/a.ks", utf16(zh), 3, false)])),
        ]);
        assert_eq!(x.format, "ks");
        let lines: Vec<(&str, Option<&str>, Option<&str>)> =
            x.active_lines().map(|l| (l.text.as_str(), l.speaker.as_deref(), l.langs.get("zh-Hans").map(String::as_str))).collect();
        assert_eq!(lines, vec![("行くぞ。", Some("勇者"), Some("走吧。")), ("待って。", Some("勇者"), Some("等等。")), ("二本目。", None, None)]);
        assert!(x.problems.is_empty(), "{:?}", x.problems);
    }

    #[test]
    fn unknown_cipher_reports_a_fallback() {
        // entries flagged encrypted whose bytes match no scheme: no lines, a problem, cipher "unknown"
        let noise: Vec<(&str, Vec<u8>, u32, bool)> =
            (0..4).map(|i| (["a.scn", "b.scn", "c.scn", "d.scn"][i], (0..256u32).map(|k| (k * 31 + i as u32 * 7) as u8).collect(), i as u32 * 77, true)).collect();
        let x = extract_dir(&[("scn.xp3", xp3(&noise))]);
        assert_eq!(x.stats.lines, 0);
        assert!(x.stats.archives[0].cipher.starts_with("unknown"));
        assert!(!x.problems.is_empty());
    }
}
