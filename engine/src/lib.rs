// SPDX-License-Identifier: GPL-3.0-or-later
//! megulit-engine: read a galgame's own scripts offline and turn them into one line model.
//!
//! Every engine is a backend (`kirikiri`, later `yuris`, `siglus`, ...) built from four parts:
//! an [`Archive`] lists and reads packed files, a [`Decrypt`] undoes the release's archive cipher,
//! a [`ScriptParser`] turns one script file into [`Script`] lines, and a [`LineSync`] tells which
//! line the running game shows. The game is never started and its files are never written.
//! Design: docs/megulit-engine.md.

pub mod kirikiri;
pub mod model;
pub mod sync;
pub mod text;

pub use model::{Choice, ChoiceOption, Extraction, Line, Script, Stats};
pub use sync::{LineSync, TextMatchSync};

use std::path::Path;

/// Errors carry a short code (stable, for logs and the fallback decision) and a detail.
#[derive(Debug)]
pub struct Error {
    pub code: &'static str,
    pub detail: String,
}

impl Error {
    pub fn new(code: &'static str, detail: impl Into<String>) -> Self {
        Error { code, detail: detail.into() }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::new("IO", e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

/// One packed file as the archive's index describes it.
#[derive(Debug, Clone)]
pub struct Entry {
    pub name: String,
    pub size: u64,
    /// The archive flags this entry as encrypted (KiriKiri: info.flags != 0).
    pub encrypted: bool,
    /// Per-entry key material the cipher works from (KiriKiri: the adlr hash).
    pub key: u32,
}

/// A container of packed files (XP3, YPF, PCK, ...).
pub trait Archive {
    fn entries(&self) -> &[Entry];
    /// The entry's bytes as stored after unpacking, still encrypted when it is.
    fn read_raw(&self, entry: &Entry) -> Result<Vec<u8>>;
}

/// A release's archive cipher. `offset` is the position of `buf[0]` inside the entry.
pub trait Decrypt: Send + Sync {
    fn name(&self) -> String;
    fn decrypt(&self, entry: &Entry, offset: u64, buf: &mut [u8]);
}

/// Turns one script file into lines; `Ok(None)` when the file is not a story script.
pub trait ScriptParser {
    fn parse(&self, name: &str, data: &[u8]) -> Result<Option<Script>>;
}

/// How sure a backend is that a folder holds one of its games.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Confidence {
    No,
    Maybe,
    Yes,
}

/// An engine backend: detects its games and extracts their scripts.
pub trait Backend {
    fn id(&self) -> &'static str;
    fn detect(&self, dir: &Path) -> Confidence;
    fn extract(&self, dir: &Path) -> Result<Extraction>;
}

/// Every backend this build knows, most specific first.
pub fn backends() -> Vec<Box<dyn Backend>> {
    vec![Box::new(kirikiri::KiriKiri::default())]
}

/// Extracts a game folder with the first backend that recognises it.
pub fn extract(dir: &Path) -> Result<Extraction> {
    let all = backends();
    let best = all
        .iter()
        .map(|b| (b.detect(dir), b))
        .filter(|(c, _)| *c > Confidence::No)
        .max_by_key(|(c, _)| *c);
    match best {
        Some((_, b)) => b.extract(dir),
        None => Err(Error::new("NO_BACKEND", "no backend recognises this folder")),
    }
}
