// SPDX-License-Identifier: GPL-3.0-or-later
//! Current-line sync: which extracted line is on screen.
//!
//! The preferred source is a pointer the game itself keeps (KiriKiri Z: the scene player's current text
//! index, read by a small hook; see docs/megulit-engine.md). Text matching is the fallback every backend
//! gets for free: the hook text MeguLit already captures is looked up among the extracted lines, preferring
//! the candidate right after the line matched last, so repeated lines ("……", "「はい」") follow the story.

use crate::model::Line;
use crate::text::norm;
use std::collections::HashMap;

/// A line position: index into the extraction's active line sequence.
pub type Position = usize;

pub trait LineSync {
    /// The line shown now, given what the hook observed (text, or a pointer value encoded as text).
    fn locate(&mut self, observed: &str) -> Option<Position>;
}

/// Text-match sync over the active lines: exact normalized match first, then the longest line that
/// contains the observed text (a hook that sees only part of a page), nearest after the last position.
pub struct TextMatchSync {
    keys: Vec<String>,
    index: HashMap<String, Vec<Position>>,
    last: Option<Position>,
}

impl TextMatchSync {
    pub fn new<'a>(lines: impl IntoIterator<Item = &'a Line>) -> Self {
        let keys: Vec<String> = lines.into_iter().map(|l| norm(&l.text)).collect();
        let mut index: HashMap<String, Vec<Position>> = HashMap::new();
        for (i, k) in keys.iter().enumerate() {
            if !k.is_empty() {
                index.entry(k.clone()).or_default().push(i);
            }
        }
        TextMatchSync { keys, index, last: None }
    }

    fn nearest(&self, candidates: &[Position]) -> Position {
        match self.last {
            Some(last) => *candidates.iter().find(|&&p| p > last).unwrap_or(&candidates[0]),
            None => candidates[0],
        }
    }
}

impl LineSync for TextMatchSync {
    fn locate(&mut self, observed: &str) -> Option<Position> {
        let key = norm(observed);
        if key.is_empty() {
            return None;
        }
        let found = if let Some(c) = self.index.get(&key) {
            Some(self.nearest(c))
        } else if key.chars().count() >= 4 {
            // Partial text: search forward from the last position first, then from the start.
            let start = self.last.map(|p| p + 1).unwrap_or(0);
            let n = self.keys.len();
            (0..n).map(|k| (start + k) % n.max(1)).find(|&i| self.keys[i].contains(&key))
        } else {
            None
        };
        if found.is_some() {
            self.last = found;
        }
        found
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(t: &str) -> Line {
        Line { text: t.into(), ..Default::default() }
    }

    #[test]
    fn repeated_lines_follow_the_story() {
        let lines = vec![line("「はい」"), line("今日は晴れ。"), line("「はい」"), line("明日は雨。")];
        let mut s = TextMatchSync::new(&lines);
        assert_eq!(s.locate("「はい」"), Some(0));
        assert_eq!(s.locate("今日は 晴れ。"), Some(1));
        assert_eq!(s.locate("「はい」"), Some(2));
        assert_eq!(s.locate("明日は"), None); // too short and not exact: no guess
        assert_eq!(s.locate("明日は雨"), Some(3)); // part of a line
    }
}
