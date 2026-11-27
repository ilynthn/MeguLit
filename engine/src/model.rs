// SPDX-License-Identifier: GPL-3.0-or-later
//! The one line model every backend produces (serialised as the engine's JSON output).

use serde::Serialize;
use std::collections::BTreeMap;

/// One shown line. `id` is stable for a given release: `<script>#<index>`.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Line {
    pub id: String,
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    /// Original text as the game shows it, markup removed, "\n" where the game breaks the line.
    pub text: String,
    /// The game's own readings: [base, reading] pairs in reading order.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub ruby: Vec<[String; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
    /// Text colour the script sets for this line, "#rrggbb".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// The release's own translations of this line, by BCP 47 tag ("en", "zh-Hans", "zh-Hant").
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub langs: BTreeMap<String, String>,
    /// Starts a new page (the text window is cleared before it).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub page: bool,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct ChoiceOption {
    pub text: String,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub langs: BTreeMap<String, String>,
    /// Where the option leads (label, storage or tag), when the script says.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

/// A choice shown after line `after` (-1: before the first line).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Choice {
    pub id: String,
    pub after: i64,
    pub options: Vec<ChoiceOption>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Script {
    pub name: String,
    /// Archive file name the script came from (no folder: output never carries local paths).
    pub archive: String,
    /// False when a later archive (patch.xp3 over scn.xp3) replaces this copy.
    pub active: bool,
    pub lines: Vec<Line>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<Choice>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ArchiveStats {
    pub name: String,
    pub entries: usize,
    pub encrypted: usize,
    /// The cipher used, "plain", or "unknown" when no known one fits (then the old flow takes over).
    pub cipher: String,
    pub scripts: usize,
    pub lines: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Stats {
    pub archives: Vec<ArchiveStats>,
    pub scripts: usize,
    pub lines: usize,
    pub choices: usize,
    pub ms: u128,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Extraction {
    pub schema: u32,
    pub engine: String,
    /// "scn" (KiriKiri Z scene files) or "ks" (KAG scenario text).
    pub format: String,
    pub scripts: Vec<Script>,
    pub stats: Stats,
    /// Why parts could not be read; empty when everything was. A non-empty list with no lines means: fall back.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub problems: Vec<String>,
}

impl Extraction {
    /// Active lines in script order, the sequence a game plays through.
    pub fn active_lines(&self) -> impl Iterator<Item = &Line> {
        self.scripts.iter().filter(|s| s.active).flat_map(|s| s.lines.iter())
    }
}
