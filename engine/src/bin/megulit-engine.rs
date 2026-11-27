// SPDX-License-Identifier: GPL-3.0-or-later
//! megulit-engine CLI: read a game folder offline and print its lines as JSON.
//!
//!   megulit-engine dump <game folder> [--out file.json] [--stats] [--only archive.xp3 ...]
//!
//! Exit codes: 0 lines found, 2 folder not recognised, 3 recognised but no lines (the caller falls back to the
//! old flow), 1 usage or I/O error. Output never contains local paths.

use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) != Some("dump") || args.len() < 2 {
        eprintln!("usage: megulit-engine dump <game folder> [--out file.json] [--stats] [--only archive.xp3 ...]");
        return ExitCode::from(1);
    }
    let dir = PathBuf::from(&args[1]);
    let out = args.iter().position(|a| a == "--out").and_then(|i| args.get(i + 1)).map(PathBuf::from);
    let stats_only = args.iter().any(|a| a == "--stats");
    let only: Vec<String> = args.iter().enumerate().filter(|(i, _)| *i > 0 && args[i - 1] == "--only").map(|(_, a)| a.clone()).collect();
    let result = if only.is_empty() {
        megulit_engine::extract(&dir)
    } else {
        use megulit_engine::Backend;
        megulit_engine::kirikiri::KiriKiri { only }.extract(&dir)
    };
    let x = match result {
        Ok(x) => x,
        Err(e) if e.code == "NO_BACKEND" => {
            eprintln!("{}", e);
            return ExitCode::from(2);
        }
        Err(e) => {
            eprintln!("{}", e);
            return ExitCode::from(1);
        }
    };
    let json = if stats_only {
        serde_json::to_string_pretty(&serde_json::json!({"engine": x.engine, "format": x.format, "stats": x.stats, "problems": x.problems}))
    } else {
        serde_json::to_string(&x)
    }
    .expect("serialisable");
    match out {
        Some(p) => {
            if let Err(e) = std::fs::write(&p, json) {
                eprintln!("IO: {}", e);
                return ExitCode::from(1);
            }
            eprintln!("{} scripts, {} lines, {} ms", x.stats.scripts, x.stats.lines, x.stats.ms);
        }
        None => println!("{}", json),
    }
    if x.stats.lines == 0 {
        ExitCode::from(3)
    } else {
        ExitCode::SUCCESS
    }
}
