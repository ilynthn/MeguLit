// SPDX-License-Identifier: GPL-3.0-or-later
//! PSB documents (E-mote / M2 binary JSON), the format of KiriKiri Z scene files (.scn), sometimes inside an "mdf"
//! zlib wrapper. Ported from services/original-engines/psb.cjs (layout after FreeMote's documentation): a header of
//! offsets, a name trie, a string table and typed values. Values become serde_json values.

use crate::text::inflate;
use crate::{Error, Result};
use serde_json::{Map, Number, Value};

const RIDDLE_PSB_V3: [u8; 12] = [0x15, 0x92, 0x58, 0xf0, 0xd2, 0x66, 0xfd, 0xec, 0x2c, 0x00, 0x00, 0x00];

pub fn is_psb(b: &[u8]) -> bool {
    b.starts_with(b"PSB\0") || b.starts_with(b"mdf\0") || b.starts_with(&RIDDLE_PSB_V3)
}

pub struct Doc {
    pub version: u16,
    pub root: Value,
    /// Values that could not be read (tolerant parsing keeps the rest).
    pub damaged: usize,
}

struct Reader<'a> {
    b: &'a [u8],
    names: Vec<String>,
    str_offsets: Vec<u64>,
    strings_data: usize,
    damaged: usize,
}

fn bad(code: &'static str, at: usize) -> Error {
    Error::new(code, format!("at {}", at))
}

impl<'a> Reader<'a> {
    fn uint(&self, at: usize, n: usize) -> Result<u64> {
        if at + n > self.b.len() {
            return Err(bad("PSB_EOF", at));
        }
        let mut v = 0u64;
        for i in (0..n).rev() {
            v = (v << 8) | self.b[at + i] as u64;
        }
        Ok(v)
    }

    fn sint(&self, at: usize, n: usize) -> Result<i64> {
        if n == 0 {
            return Ok(0);
        }
        let v = self.uint(at, n)?;
        let bits = 8 * n as u32;
        Ok(if bits < 64 && v >= 1u64 << (bits - 1) { v as i64 - (1i64 << bits) } else { v as i64 })
    }

    fn array(&self, at: usize) -> Result<(Vec<u64>, usize)> {
        let t = *self.b.get(at).ok_or_else(|| bad("PSB_EOF", at))?;
        if !(0x0d..=0x14).contains(&t) {
            return Err(bad("PSB_ARRAY", at));
        }
        let cn = (t - 0x0c) as usize;
        let count = self.uint(at + 1, cn)? as usize;
        let et = *self.b.get(at + 1 + cn).ok_or_else(|| bad("PSB_EOF", at))?;
        if !(0x0d..=0x14).contains(&et) {
            return Err(bad("PSB_ARRAY", at + 1 + cn));
        }
        let w = (et - 0x0c) as usize;
        let start = at + 2 + cn;
        if start + count * w > self.b.len() {
            return Err(bad("PSB_ARRAY_SIZE", at));
        }
        let mut out = Vec::with_capacity(count);
        for i in 0..count {
            out.push(self.uint(start + i * w, w)?);
        }
        Ok((out, start + count * w))
    }

    fn string(&self, i: usize, at: usize) -> Result<String> {
        let off = *self.str_offsets.get(i).ok_or_else(|| bad("PSB_STRING", at))? as usize;
        let s = self.strings_data + off;
        if s > self.b.len() {
            return Err(bad("PSB_STRING", at));
        }
        let end = self.b[s..].iter().position(|&c| c == 0).map(|p| s + p).unwrap_or(self.b.len());
        Ok(String::from_utf8_lossy(&self.b[s..end]).into_owned())
    }

    fn child(&mut self, at: usize, depth: u32) -> Value {
        match self.value(at, depth) {
            Ok(v) => v,
            Err(_) => {
                self.damaged += 1;
                Value::Null
            }
        }
    }

    fn value(&mut self, at: usize, depth: u32) -> Result<Value> {
        if depth > 200 {
            return Err(bad("PSB_DEPTH", at));
        }
        let t = *self.b.get(at).ok_or_else(|| bad("PSB_EOF", at))?;
        Ok(match t {
            0 | 1 => Value::Null,
            2 => Value::Bool(false),
            3 => Value::Bool(true),
            0x04..=0x0c => Value::from(self.sint(at + 1, (t - 0x04) as usize)?),
            0x0d..=0x14 => Value::Array(self.array(at)?.0.into_iter().map(Value::from).collect()),
            0x15..=0x18 => {
                let i = self.uint(at + 1, (t - 0x14) as usize)? as usize;
                Value::String(self.string(i, at)?)
            }
            0x19..=0x1c => {
                let mut m = Map::new();
                m.insert("resource".into(), Value::from(self.uint(at + 1, (t - 0x18) as usize)?));
                Value::Object(m)
            }
            0x1d => Value::from(0),
            0x1e => {
                let v = f32::from_bits(self.uint(at + 1, 4)? as u32) as f64;
                Number::from_f64(v).map(Value::Number).unwrap_or(Value::Null)
            }
            0x1f => {
                let v = f64::from_bits(self.uint(at + 1, 8)?);
                Number::from_f64(v).map(Value::Number).unwrap_or(Value::Null)
            }
            0x20 => {
                let (offs, base) = self.array(at + 1)?;
                if offs.iter().any(|&o| base + o as usize >= self.b.len()) {
                    return Err(bad("PSB_OFFSET", at));
                }
                Value::Array(offs.into_iter().map(|o| self.child(base + o as usize, depth + 1)).collect())
            }
            0x21 => {
                let (keys, end) = self.array(at + 1)?;
                let (offs, base) = self.array(end)?;
                if keys.len() != offs.len() {
                    return Err(bad("PSB_OBJECT", at));
                }
                if offs.iter().any(|&o| base + o as usize >= self.b.len()) {
                    return Err(bad("PSB_OFFSET", at));
                }
                let mut m = Map::new();
                for (k, o) in keys.into_iter().zip(offs) {
                    let name = self.names.get(k as usize).cloned().ok_or_else(|| bad("PSB_NAME", at))?;
                    let v = self.child(base + o as usize, depth + 1);
                    m.insert(name, v);
                }
                Value::Object(m)
            }
            0x22..=0x25 => {
                let mut m = Map::new();
                m.insert("extra".into(), Value::from(self.uint(at + 1, (t - 0x21) as usize)?));
                Value::Object(m)
            }
            _ => return Err(bad("PSB_TYPE", at)),
        })
    }
}

/// Parses a PSB (plain, mdf-wrapped or Riddle-tagged). Damaged values become null.
pub fn parse(input: &[u8]) -> Result<Doc> {
    let owned;
    let b: &[u8] = if input.starts_with(b"mdf\0") {
        owned = inflate(&input[8.min(input.len())..]).ok_or_else(|| Error::new("PSB_MDF", "mdf does not inflate"))?;
        &owned
    } else {
        input
    };
    let riddle = b.starts_with(&RIDDLE_PSB_V3);
    if !riddle && !b.starts_with(b"PSB\0") {
        return Err(bad("PSB_MAGIC", 0));
    }
    if b.len() < 40 {
        return Err(bad("PSB_HEADER", 0));
    }
    let version = if riddle { 3 } else { u16::from_le_bytes([b[4], b[5]]) };
    if !riddle && u16::from_le_bytes([b[6], b[7]]) & 1 != 0 {
        return Err(Error::new("PSB_HEADER_ENCRYPTED", ""));
    }
    let u = |o: usize| u32::from_le_bytes(b[o..o + 4].try_into().unwrap()) as usize;
    let (off_names, off_strings, off_strings_data, off_entries) = (u(12), u(16), u(20), u(36));
    if off_names >= b.len() || off_entries >= b.len() || off_strings >= b.len() || off_strings_data >= b.len() {
        return Err(bad("PSB_HEADER", 12));
    }
    let mut r = Reader { b, names: Vec::new(), str_offsets: Vec::new(), strings_data: off_strings_data, damaged: 0 };
    let (charset, e1) = r.array(off_names)?;
    let (names_data, e2) = r.array(e1)?;
    let (name_indexes, _) = r.array(e2)?;
    r.names = name_indexes
        .iter()
        .map(|&index| {
            let mut chars = Vec::new();
            let mut chr = names_data.get(index as usize).copied().unwrap_or(0);
            let mut n = 0;
            while chr != 0 && n < 256 {
                n += 1;
                let Some(&code) = names_data.get(chr as usize) else { break };
                let Some(&d) = charset.get(code as usize) else { break };
                chars.push(chr.wrapping_sub(d) as u8);
                chr = code;
            }
            chars.reverse();
            String::from_utf8_lossy(&chars).into_owned()
        })
        .collect();
    r.str_offsets = r.array(off_strings)?.0;
    let root = r.value(off_entries, 0)?;
    Ok(Doc { version, root, damaged: r.damaged })
}

#[cfg(test)]
pub(crate) mod build {
    //! A tiny PSB writer for tests: enough of the format (objects, arrays, strings, ints, null) to build a scene.
    use serde_json::Value;

    fn uint_bytes(v: u64) -> Vec<u8> {
        let mut n = 1;
        while n < 8 && v >= 1u64 << (8 * n) {
            n += 1;
        }
        (0..n).map(|i| (v >> (8 * i)) as u8).collect()
    }

    fn packed(values: &[u64]) -> Vec<u8> {
        let count = uint_bytes(values.len() as u64);
        let w = values.iter().map(|&v| uint_bytes(v).len()).max().unwrap_or(1);
        let mut out = vec![0x0c + count.len() as u8];
        out.extend(&count);
        out.push(0x0c + w as u8);
        for &v in values {
            let mut b = uint_bytes(v);
            b.resize(w, 0);
            out.extend(b);
        }
        out
    }

    struct W {
        names: Vec<String>,
        strings: Vec<String>,
    }

    impl W {
        fn collect(&mut self, v: &Value) {
            match v {
                Value::Object(m) => {
                    for (k, x) in m {
                        if !self.names.contains(k) {
                            self.names.push(k.clone());
                        }
                        self.collect(x);
                    }
                }
                Value::Array(a) => a.iter().for_each(|x| self.collect(x)),
                Value::String(s) => {
                    if !self.strings.contains(s) {
                        self.strings.push(s.clone());
                    }
                }
                _ => {}
            }
        }
        fn value(&self, v: &Value) -> Vec<u8> {
            match v {
                Value::Null => vec![1],
                Value::Bool(b) => vec![if *b { 3 } else { 2 }],
                Value::Number(n) => {
                    let x = n.as_i64().unwrap();
                    let b = (x as u64).to_le_bytes();
                    let mut out = vec![0x04 + 8];
                    out.extend(b);
                    out
                }
                Value::String(s) => {
                    let i = self.strings.iter().position(|x| x == s).unwrap() as u64;
                    let b = uint_bytes(i);
                    let mut out = vec![0x14 + b.len() as u8];
                    out.extend(b);
                    out
                }
                Value::Array(a) => {
                    let parts: Vec<Vec<u8>> = a.iter().map(|x| self.value(x)).collect();
                    let mut offs = Vec::new();
                    let mut at = 0u64;
                    for p in &parts {
                        offs.push(at);
                        at += p.len() as u64;
                    }
                    let mut out = vec![0x20];
                    out.extend(packed(&offs));
                    parts.into_iter().for_each(|p| out.extend(p));
                    out
                }
                Value::Object(m) => {
                    let mut keys = Vec::new();
                    let mut parts = Vec::new();
                    for (k, x) in m {
                        keys.push(self.names.iter().position(|n| n == k).unwrap() as u64);
                        parts.push(self.value(x));
                    }
                    let mut offs = Vec::new();
                    let mut at = 0u64;
                    for p in &parts {
                        offs.push(at);
                        at += p.len() as u64;
                    }
                    let mut out = vec![0x21];
                    out.extend(packed(&keys));
                    out.extend(packed(&offs));
                    parts.into_iter().for_each(|p| out.extend(p));
                    out
                }
            }
        }
    }

    /// The name table is a double-array trie: node `n` has parent `names_data[n]` and carries the byte
    /// `n - charset[parent]`; a name's index slot is a byte-0 child of its last node.
    fn trie(names: &[String]) -> (Vec<u64>, Vec<u64>, Vec<u64>) {
        use std::collections::BTreeMap;
        let mut kids: Vec<BTreeMap<u8, usize>> = vec![BTreeMap::new()];
        let mut ends = Vec::new();
        for n in names {
            let mut at = 0;
            for &c in n.as_bytes().iter().chain(std::iter::once(&0u8)) {
                let next = kids.len();
                at = *kids[at].entry(c).or_insert(next);
                if at == next {
                    kids.push(BTreeMap::new());
                }
            }
            ends.push(at);
        }
        let mut slot = vec![0usize; kids.len()];
        let mut used = vec![true];
        let mut charset = vec![0u64; 1];
        let mut queue = std::collections::VecDeque::from([0usize]);
        while let Some(t) = queue.pop_front() {
            if kids[t].is_empty() {
                continue;
            }
            let mut base = 1usize;
            while kids[t].keys().any(|&c| used.get(base + c as usize).copied().unwrap_or(false)) {
                base += 1;
            }
            let p = slot[t];
            if charset.len() <= p {
                charset.resize(p + 1, 0);
            }
            charset[p] = base as u64;
            for (&c, &k) in &kids[t] {
                let n = base + c as usize;
                if used.len() <= n {
                    used.resize(n + 1, false);
                }
                used[n] = true;
                slot[k] = n;
                queue.push_back(k);
            }
        }
        let mut names_data = vec![0u64; used.len()];
        for (t, ks) in kids.iter().enumerate() {
            for &k in ks.values() {
                names_data[slot[k]] = slot[t] as u64;
            }
        }
        charset.resize(names_data.len(), 0);
        (charset, names_data, ends.iter().map(|&e| slot[e] as u64).collect())
    }

    pub fn psb(root: &Value) -> Vec<u8> {
        let mut w = W { names: Vec::new(), strings: Vec::new() };
        w.collect(root);
        w.names.sort();
        let (charset, names_data, indexes) = trie(&w.names);
        let mut out = vec![0u8; 40];
        out[..4].copy_from_slice(b"PSB\0");
        out[4] = 2;
        let names_at = out.len();
        out.extend(packed(&charset));
        out.extend(packed(&names_data));
        out.extend(packed(&indexes));
        let entries_at = out.len();
        let body = w.value(root);
        out.extend(body);
        let strings_at = out.len();
        let mut offs = Vec::new();
        let mut data = Vec::new();
        for s in &w.strings {
            offs.push(data.len() as u64);
            data.extend(s.as_bytes());
            data.push(0);
        }
        out.extend(packed(&offs));
        let strings_data_at = out.len();
        out.extend(data);
        for (o, v) in [(12, names_at), (16, strings_at), (20, strings_data_at), (24, strings_data_at), (36, entries_at)] {
            out[o..o + 4].copy_from_slice(&(v as u32).to_le_bytes());
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn roundtrip_through_the_test_writer() {
        let v = json!({"name": "s01", "scenes": [{"label": "*a", "texts": [[null, [[null, "あいう", 3]], null]]}], "n": -5});
        let b = build::psb(&v);
        let d = parse(&b).unwrap();
        assert_eq!(d.root, v);
        assert_eq!(d.damaged, 0);
    }

    #[test]
    fn mdf_wrapper_inflates() {
        use flate2::write::ZlibEncoder;
        use std::io::Write;
        let v = json!({"name": "x"});
        let b = build::psb(&v);
        let mut z = ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        z.write_all(&b).unwrap();
        let mut m = b"mdf\0".to_vec();
        m.extend((b.len() as u32).to_le_bytes());
        m.extend(z.finish().unwrap());
        assert_eq!(parse(&m).unwrap().root, v);
    }
}
