// SPDX-License-Identifier: GPL-3.0-or-later
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::Path,
    sync::{Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

struct Journal {
    file: fs::File,
    counts: HashMap<&'static str, u8>,
    start: Instant,
}

static JOURNAL: OnceLock<Mutex<Journal>> = OnceLock::new();

fn session_file(path: &Path) -> bool {
    if path.extension().and_then(|ext| ext.to_str()) != Some("log") {
        return false;
    }
    let stem = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("");
    stem.split_once('-').is_some_and(|(time, pid)| {
        time.len() == 13 && time.parse::<u64>().is_ok() && pid.parse::<u32>().is_ok()
    })
}

pub fn begin(root: &Path) {
    let dir = root.join("logs/yui");
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let session = format!("{now}-{}", std::process::id());
    let Ok(file) = fs::OpenOptions::new().create_new(true).append(true)
        .open(dir.join(format!("{session}.log"))) else { return };
    let _ = JOURNAL.set(Mutex::new(Journal { file, counts: HashMap::new(), start: Instant::now() }));
    std::env::set_var("MEGULIT_YUI_SESSION", session);
    /* the service and its game bridges append their own stages to the same file (core/yui-journal.cjs); append mode keeps both */
    std::env::set_var("MEGULIT_YUI_DIR", &dir);
    mark("native-entry");

    if let Ok(entries) = fs::read_dir(dir) {
        let mut old: Vec<_> = entries.flatten().map(|e| e.path()).filter(|p| session_file(p)).collect();
        old.sort();
        let excess = old.len().saturating_sub(12);
        for path in old.into_iter().take(excess) {
            let _ = fs::remove_file(path);
        }
    }
}

pub fn mark(stage: &'static str) {
    let Some(lock) = JOURNAL.get() else { return };
    let Ok(mut journal) = lock.lock() else { return };
    let count = journal.counts.entry(stage).or_default();
    if *count >= 8 {
        return;
    }
    *count += 1;
    let ms = journal.start.elapsed().as_millis();
    let _ = writeln!(journal.file, "{ms} {stage}");
}

#[tauri::command]
pub fn yui_stage(window: tauri::WebviewWindow, stage: String) {
    if window.label() != "main" {
        return;
    }
    for allowed in [
        "document", "route-failed", "frontend-error", "frontend-rejection", "frontend-rejection-service",
        "frontend-rejection-abort", "startup-failed",
        "content-painted", "notice-open", "notice-painted", "notice-closed",
    ] {
        if stage == allowed {
            mark(allowed);
            break;
        }
    }
}

/// Seen at least once in this session's journal.
pub fn seen(stage: &str) -> bool {
    let Some(lock) = JOURNAL.get() else { return false };
    let Ok(journal) = lock.lock() else { return false };
    journal.counts.contains_key(stage)
}

/// 2026-11-26 a stage that must come: when `stage` is still missing `after` the call, `fault` is recorded (a page that never
/// loaded, a window never shown). The check runs once on its own thread; it never stops the app.
pub fn expect(stage: &'static str, after: std::time::Duration, fault: &'static str) {
    if JOURNAL.get().is_none() {
        return;
    }
    let _ = std::thread::Builder::new().name("yui-expect".into()).spawn(move || {
        std::thread::sleep(after);
        if !seen(stage) && !seen("closed") {
            mark(fault);
        }
    });
}

/// 2026-11-26 the local cause of a frontend error or rejection: its kind and the first script location, for this PC's own
/// diagnostics only. A line "<ms> ~<stage> <detail>" is not a stage line, so services/yui.cjs never sends it.
#[tauri::command]
pub fn yui_detail(window: tauri::WebviewWindow, stage: String, detail: String) {
    if window.label() != "main" {
        return;
    }
    let stage: &'static str = match stage.as_str() {
        "frontend-error" => "~frontend-error",
        "frontend-rejection" => "~frontend-rejection",
        "frontend-rejection-service" => "~frontend-rejection-service",
        "frontend-rejection-abort" => "~frontend-rejection-abort",
        _ => return,
    };
    let clean: String = detail
        .chars()
        .filter(|c| !c.is_control())
        .take(240)
        .collect();
    let Some(lock) = JOURNAL.get() else { return };
    let Ok(mut journal) = lock.lock() else { return };
    let count = journal.counts.entry(stage).or_default();
    if *count >= 8 {
        return;
    }
    *count += 1;
    let ms = journal.start.elapsed().as_millis();
    let _ = writeln!(journal.file, "{ms} {stage} {clean}");
}
