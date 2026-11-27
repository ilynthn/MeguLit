// SPDX-License-Identifier: GPL-3.0-or-later
//! KiriKiri XP3 archives: index (optionally zlib), File chunks with info / segm / adlr, segments optionally zlib.
//! Yuzusoft-style archives name entries by a hash and keep the real names in a zlib table a top-level chunk
//! ("sen:", "yuz:", "cbg:") points to (GARbro ArcXP3.cs, morkt, MIT); plain tables are read here, the
//! encrypted "yuz:" / "dls:" tables are left to the JS reader for now.

use crate::text::inflate;
use crate::{Archive, Entry, Error, Result};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const MAGIC: [u8; 11] = [0x58, 0x50, 0x33, 0x0d, 0x0a, 0x20, 0x0a, 0x1a, 0x8b, 0x67, 0x01];

#[derive(Debug, Clone)]
struct Segment {
    zlib: bool,
    offset: u64,
    size: u64,
    packed: u64,
}

pub struct Xp3 {
    path: PathBuf,
    file: Mutex<File>,
    entries: Vec<Entry>,
    segments: Vec<Vec<Segment>>,
    /// Top-level chunk tags of the index ("File", "Hxv4", "sen:" ...).
    pub tags: Vec<String>,
    hx: Option<(u64, usize)>,
}

fn u16le(b: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([b[at], b[at + 1]])
}
fn u32le(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes(b[at..at + 4].try_into().unwrap())
}
fn u64le(b: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(b[at..at + 8].try_into().unwrap())
}

struct Chunk {
    tag: [u8; 4],
    start: usize,
    end: usize,
}

fn chunks(b: &[u8], from: usize, to: usize) -> Vec<Chunk> {
    let mut out = Vec::new();
    let mut p = from;
    while p + 12 <= to {
        let len = u64le(b, p + 4) as usize;
        let end = (p + 12).saturating_add(len);
        if end > to {
            break;
        }
        out.push(Chunk { tag: b[p..p + 4].try_into().unwrap(), start: p + 12, end });
        p = end;
    }
    out
}

fn read_at(f: &mut File, at: u64, n: usize) -> Result<Vec<u8>> {
    let mut b = vec![0u8; n];
    f.seek(SeekFrom::Start(at))?;
    f.read_exact(&mut b)?;
    Ok(b)
}

/// Is this file an XP3 archive (by magic)?
pub fn is_xp3(path: &Path) -> bool {
    let mut head = [0u8; 11];
    File::open(path).and_then(|mut f| f.read_exact(&mut head)).is_ok() && head == MAGIC
}

fn read_index(f: &mut File) -> Result<Vec<u8>> {
    let head = read_at(f, 0, 32)?;
    if head[..11] != MAGIC {
        return Err(Error::new("XP3_MAGIC", "not an XP3 archive"));
    }
    let mut at = u64le(&head, 11);
    if at == 0x17 {
        let b = read_at(f, at, 17)?;
        if b[0] != 0x80 {
            return Err(Error::new("XP3_HEADER", "bad version 2 header"));
        }
        at = u64le(&b, 9);
    }
    let flag = read_at(f, at, 9)?;
    if flag[0] & 1 != 0 {
        let b = read_at(f, at, 17)?;
        let packed = u64le(&b, 1) as usize;
        let plain = u64le(&b, 9) as usize;
        let data = read_at(f, at + 17, packed)?;
        let out = inflate(&data).ok_or_else(|| Error::new("XP3_INDEX_ZLIB", "index does not inflate"))?;
        if out.len() != plain {
            return Err(Error::new("XP3_INDEX_SIZE", "index size mismatch"));
        }
        Ok(out)
    } else {
        let n = u64le(&flag, 1) as usize;
        read_at(f, at + 9, n)
    }
}

impl Xp3 {
    pub fn open(path: &Path) -> Result<Xp3> {
        let mut f = File::open(path)?;
        let index = read_index(&mut f)?;
        let mut entries = Vec::new();
        let mut segments = Vec::new();
        let top = chunks(&index, 0, index.len());
        let tags = top.iter().map(|c| String::from_utf8_lossy(&c.tag).into_owned()).collect();
        for c in &top {
            if &c.tag != b"File" {
                continue;
            }
            let mut e = Entry { name: String::new(), size: 0, encrypted: false, key: 0 };
            let mut segs = Vec::new();
            for s in chunks(&index, c.start, c.end) {
                match &s.tag {
                    b"info" if s.end - s.start >= 22 => {
                        e.encrypted = u32le(&index, s.start) != 0;
                        e.size = u64le(&index, s.start + 4);
                        let len = u16le(&index, s.start + 20) as usize;
                        let from = s.start + 22;
                        let to = (from + len * 2).min(s.end);
                        let units: Vec<u16> = index[from..to].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
                        e.name = String::from_utf16_lossy(&units);
                    }
                    b"adlr" if s.end - s.start >= 4 => e.key = u32le(&index, s.start),
                    b"segm" => {
                        let mut p = s.start;
                        while p + 28 <= s.end {
                            segs.push(Segment {
                                zlib: u32le(&index, p) & 7 == 1,
                                offset: u64le(&index, p + 4),
                                size: u64le(&index, p + 12),
                                packed: u64le(&index, p + 20),
                            });
                            p += 28;
                        }
                    }
                    _ => {}
                }
            }
            if !e.name.is_empty() {
                entries.push(e);
                segments.push(segs);
            }
        }
        let hx = top.iter().find(|c| &c.tag == b"Hxv4" && c.end - c.start >= 14).and_then(|c| {
            let offset = u64le(&index, c.start);
            let size = u32le(&index, c.start + 8) as usize;
            ((offset as i64) >= 0 && size > 20 && size <= (64 << 20)).then_some((offset, size))
        });
        let mut x = Xp3 { path: path.to_path_buf(), file: Mutex::new(f), entries, segments, tags, hx };
        x.resolve_hashed_names(&index, &top);
        Ok(x)
    }

    /// The raw HxCrypt index chunk ("Hxv4"), when the archive has a usable one.
    pub fn hx_chunk(&self) -> Option<Vec<u8>> {
        let (offset, size) = self.hx?;
        let mut f = self.file.lock().unwrap();
        read_at(&mut f, offset, size).ok()
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Yuzusoft name tables: entry names are hex MD5 of the lower-case real name (or match its hash).
    fn resolve_hashed_names(&mut self, index: &[u8], top: &[Chunk]) {
        let Some(c) = top.iter().find(|c| matches!(&c.tag, b"sen:" | b"yuz:" | b"cbg:" | b"dls:")) else { return };
        if c.end - c.start < 16 {
            return;
        }
        let offset = u64le(index, c.start);
        let size = u32le(index, c.start + 12) as usize;
        if offset == 0 || size == 0 || size > (64 << 20) {
            return;
        }
        let raw = {
            let mut f = self.file.lock().unwrap();
            match read_at(&mut f, offset, size) {
                Ok(b) => b,
                Err(_) => return,
            }
        };
        let Some(t) = inflate(&raw) else { return };
        let mut by_hash = std::collections::HashMap::new();
        let mut by_md5 = std::collections::HashMap::new();
        let mut p = 0usize;
        while p + 12 <= t.len() {
            let sz = u64le(&t, p + 4) as i64;
            if sz < 0 {
                break;
            }
            let at = p + 12;
            p = at + sz as usize;
            if at + 6 > t.len() {
                break;
            }
            let h = u32le(&t, at);
            let n = u16le(&t, at + 4) as i16;
            if n > 0 && at + 6 + n as usize * 2 <= t.len() {
                let units: Vec<u16> = t[at + 6..at + 6 + n as usize * 2].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
                let name = String::from_utf16_lossy(&units);
                by_hash.entry(h).or_insert_with(|| name.clone());
                let lower: Vec<u8> = name.to_lowercase().encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
                by_md5.insert(md5_hex(&lower), name);
            }
        }
        for e in &mut self.entries {
            if let Some(real) = by_md5.get(&e.name.to_lowercase()).or_else(|| by_hash.get(&e.key)) {
                e.name = real.clone();
            }
        }
    }
}

impl Archive for Xp3 {
    fn entries(&self) -> &[Entry] {
        &self.entries
    }

    fn read_raw(&self, entry: &Entry) -> Result<Vec<u8>> {
        let i = self
            .entries
            .iter()
            .position(|e| std::ptr::eq(e, entry) || (e.name == entry.name && e.key == entry.key))
            .ok_or_else(|| Error::new("XP3_ENTRY", entry.name.clone()))?;
        let mut out = Vec::with_capacity(entry.size as usize);
        let mut f = self.file.lock().unwrap();
        for s in &self.segments[i] {
            let b = read_at(&mut f, s.offset, s.packed as usize)?;
            if s.zlib {
                let o = inflate(&b).ok_or_else(|| Error::new("XP3_SEGMENT_ZLIB", entry.name.clone()))?;
                out.extend_from_slice(&o);
            } else {
                out.extend_from_slice(&b);
            }
            let _ = s.size;
        }
        Ok(out)
    }
}

/// MD5 (RFC 1321), hex: only for matching hashed XP3 entry names.
pub fn md5_hex(data: &[u8]) -> String {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
        11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    let k: Vec<u32> = (0..64).map(|i| ((i as f64 + 1.0).sin().abs() * 4294967296.0) as u32).collect();
    let (mut a0, mut b0, mut c0, mut d0) = (0x67452301u32, 0xefcdab89u32, 0x98badcfeu32, 0x10325476u32);
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&((data.len() as u64).wrapping_mul(8)).to_le_bytes());
    for block in msg.chunks_exact(64) {
        let m: Vec<u32> = block.chunks_exact(4).map(|c| u32::from_le_bytes(c.try_into().unwrap())).collect();
        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
        for i in 0..64 {
            let (f, g) = match i / 16 {
                0 => ((b & c) | (!b & d), i),
                1 => ((d & b) | (!d & c), (5 * i + 1) % 16),
                2 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | !d), (7 * i) % 16),
            };
            let f2 = f.wrapping_add(a).wrapping_add(k[i]).wrapping_add(m[g]);
            a = d;
            d = c;
            c = b;
            b = b.wrapping_add(f2.rotate_left(S[i]));
        }
        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }
    [a0, b0, c0, d0].iter().flat_map(|v| v.to_le_bytes()).map(|x| format!("{:02x}", x)).collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn md5_known() {
        assert_eq!(super::md5_hex(b""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(super::md5_hex(b"abc"), "900150983cd24fb0d6963f7d28e17f72");
    }
}
