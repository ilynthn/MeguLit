// SPDX-License-Identifier: GPL-3.0-or-later
//! KiriKiri "cx" archive filters (the per-title XP3 encryption of KiriKiri Z releases), ported from
//! services/original-engines/cx-filter.cjs, itself after GARbro ArcFormats/KiriKiri/KiriKiriCx.cs
//! (morkt, MIT; see THIRD-PARTY.md).
//!
//! Each entry is XOR-ed with keys from a tiny generated program, picked by the low 7 bits of the entry's adlr hash
//! and generated from that seed by the title's parameters (prolog / odd / even branch orders and a 4 KiB control
//! block); it runs on hash >> 7 and on its complement. Bytes before (hash & mask) + offset use the hash, later bytes
//! hash ^ (hash >> 16). Nana schemes swap the random generator; Riddle schemes also XOR the first 8 bytes.
//!
//! The parameter table is the repository's one copy, services/original-engines/cx-schemes.json (no second copy).
//! HxCrypt (KiriKiri Z archives with an "Hxv4" index chunk, GARbro HxCrypt.cs) is ported too; its keys come from the
//! same table and services/original-engines/cx-hx-schemes.json. An archive no scheme fits reports cipher "unknown".

use crate::text::base64;
use crate::{Archive, Decrypt, Entry};
use serde::Deserialize;
use std::path::Path;
use std::sync::{Arc, OnceLock};

static SCHEMES_JSON: &str = include_str!("../../../services/original-engines/cx-schemes.json");

#[derive(Debug, Deserialize, Clone)]
pub struct SchemeDef {
    #[serde(default)]
    pub titles: Vec<String>,
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub mask: u32,
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub prolog: Vec<u8>,
    #[serde(default)]
    pub odd: Vec<u8>,
    #[serde(default)]
    pub even: Vec<u8>,
    #[serde(default)]
    pub cb: Option<String>,
    #[serde(default)]
    pub tpm: Option<String>,
    #[serde(default)]
    pub random: Option<f64>,
    #[serde(default)]
    pub riddle: Option<bool>,
    /// HxCrypt: the 64-bit filter key (hex), the random generator variant and the ChaCha keys of the index.
    #[serde(rename = "filterKey", default)]
    pub filter_key: Option<String>,
    #[serde(rename = "randomType", default)]
    pub random_type: Option<u32>,
    #[serde(rename = "indexKeys", default)]
    pub index_keys: Vec<[String; 2]>,
}

impl SchemeDef {
    pub fn is_hx(&self) -> bool {
        self.kind == "HxCrypt"
    }
}

#[derive(Deserialize)]
struct SchemeFile {
    schemes: Vec<SchemeDef>,
}

static HX_SCHEMES_JSON: &str = include_str!("../../../services/original-engines/cx-hx-schemes.json");

/// The cx and HxCrypt schemes (cx-schemes.json, then the local cx-hx-schemes.json), parsed once.
pub fn schemes() -> &'static [SchemeDef] {
    static S: OnceLock<Vec<SchemeDef>> = OnceLock::new();
    S.get_or_init(|| {
        let f: SchemeFile = serde_json::from_str(SCHEMES_JSON).expect("cx-schemes.json parses");
        let local: Vec<SchemeDef> = serde_json::from_str(HX_SCHEMES_JSON).unwrap_or_default();
        f.schemes
            .into_iter()
            .chain(local)
            .filter(|s| s.prolog.len() == 3 && s.odd.len() == 6 && s.even.len() == 8)
            .collect()
    })
}

// Opcodes of the generated program (the values only need to be distinct; IMMED marks a following u32).
const NOP: u32 = 0;
const RETN: u32 = 1;
const MOV_EDI_ARG: u32 = 2;
const PUSH_EBX: u32 = 3;
const POP_EBX: u32 = 4;
const PUSH_ECX: u32 = 5;
const POP_ECX: u32 = 6;
const MOV_EBX_EAX: u32 = 8;
const MOV_ECX_EBX: u32 = 9;
const MOV_EAX_EDI: u32 = 11;
const MOV_EAX_INDIRECT: u32 = 12;
const ADD_EAX_EBX: u32 = 13;
const SUB_EAX_EBX: u32 = 14;
const IMUL_EAX_EBX: u32 = 15;
const AND_ECX_0F: u32 = 16;
const SHR_EBX_1: u32 = 17;
const SHL_EAX_1: u32 = 18;
const SHR_EAX_CL: u32 = 19;
const SHL_EAX_CL: u32 = 20;
const OR_EAX_EBX: u32 = 21;
const NOT_EAX: u32 = 22;
const NEG_EAX: u32 = 23;
const DEC_EAX: u32 = 24;
const INC_EAX: u32 = 25;
const IMMED: u32 = 0x100;
const MOV_EAX_IMMED: u32 = 0x101;
const AND_EBX_IMMED: u32 = 0x102;
const AND_EAX_IMMED: u32 = 0x103;
const XOR_EAX_IMMED: u32 = 0x104;
const ADD_EAX_IMMED: u32 = 0x105;
const SUB_EAX_IMMED: u32 = 0x106;
const LIMIT: usize = 0x80;

enum Rng {
    Lcg(u32),
    Nana(u32, u32),
    /// HxCrypt: SplitMix64 seeding, then one of two 128-bit generators.
    Hx { m0: u64, m1: u64, ty: u32 },
}

const M32: u64 = 0xffff_ffff;

fn hx_rng(seed: u32, ty: u32) -> Rng {
    let s = seed as u64;
    let mut st = s | ((!s & M32) << 32);
    let mut next64 = || {
        st = st.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = st;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^ (z >> 31)
    };
    let m0 = next64();
    let m1 = next64();
    Rng::Hx { m0, m1, ty }
}

impl Rng {
    fn next(&mut self) -> u32 {
        match self {
            Rng::Lcg(s) => {
                let old = *s;
                *s = old.wrapping_mul(1103515245).wrapping_add(12345);
                *s ^ (old << 16) ^ (old >> 16)
            }
            Rng::Hx { m0, m1, ty } => {
                let (a, b) = (*m0, *m1);
                let (a_lo, a_hi, b_lo, b_hi) = (a & M32, a >> 32, b & M32, b >> 32);
                if *ty == 0 {
                    let (c_lo, c_hi) = (a_hi ^ b_hi, a_lo ^ b_lo);
                    let c = c_lo | (c_hi << 32);
                    let e = c_hi | (c_lo << 32);
                    *m0 = (((c_hi << 21) ^ (a >> 15) ^ c_hi) & M32) | (((((a_hi >> 15) | (a_lo << 17)) ^ (e >> 11) ^ c_lo) & M32) << 32);
                    *m1 = ((c >> 4) & M32) | (((e >> 4) & M32) << 32);
                    let d = a.wrapping_add(b);
                    d.rotate_left(17).wrapping_add(a) as u32
                } else {
                    let (c_lo, c_hi) = (a_lo ^ b_lo, a_hi ^ b_hi);
                    let c = c_lo | (c_hi << 32);
                    *m0 = ((((a_lo << 24) | (a_hi >> 8)) ^ (c_lo << 16) ^ c_lo) & M32) | ((((c >> 16) ^ (a >> 8) ^ c_hi) & M32) << 32);
                    *m1 = ((c >> 27) & M32) | ((((c_hi >> 27) | (c_lo << 5)) & M32) << 32);
                    let d = a.wrapping_mul(5);
                    d.rotate_left(7).wrapping_mul(9) as u32
                }
            }
            Rng::Nana(s, r) => {
                let mut x = *s ^ (*s << 17);
                // (x << 18) | (x >> 15), as GARbro's NanaCxCrypt has it: not a rotation
                x ^= (x << 18) | (x >> 15);
                *s = !x;
                let mut y = *r ^ (*r << 13);
                y ^= y >> 17;
                *r = y ^ (y << 5);
                *s ^ *r
            }
        }
    }
}

struct Gen<'a> {
    s: &'a SchemeDef,
    rng: Rng,
    code: Vec<u32>,
    len: usize,
}

impl<'a> Gen<'a> {
    fn nop(&mut self, n: usize) -> bool {
        if self.len + n > LIMIT {
            return false;
        }
        self.len += n;
        true
    }
    fn emit(&mut self, c: u32, n: usize) -> bool {
        if self.len + n > LIMIT {
            return false;
        }
        self.len += n;
        self.code.push(c);
        true
    }
    fn imm(&mut self, x: u32) -> bool {
        if self.len + 4 > LIMIT {
            return false;
        }
        self.len += 4;
        self.code.push(x);
        true
    }
    fn r(&mut self) -> u32 {
        self.rng.next()
    }
    fn prolog(&mut self) -> bool {
        let pick = self.r() % 3;
        match self.s.prolog[pick as usize] {
            2 => self.nop(5) && self.emit(MOV_EAX_IMMED, 2) && { let v = self.r() & 0x3ff; self.imm(v) } && self.emit(MOV_EAX_INDIRECT, 0),
            1 => self.emit(MOV_EAX_EDI, 2),
            _ => self.emit(MOV_EAX_IMMED, 1) && { let v = self.r(); self.imm(v) },
        }
    }
    fn even(&mut self) -> bool {
        let pick = self.r() & 7;
        match self.s.even[pick as usize] {
            0 => self.emit(NOT_EAX, 2),
            1 => self.emit(DEC_EAX, 1),
            2 => self.emit(NEG_EAX, 2),
            3 => self.emit(INC_EAX, 1),
            4 => self.nop(5) && self.emit(AND_EAX_IMMED, 1) && self.imm(0x3ff) && self.emit(MOV_EAX_INDIRECT, 3),
            5 => {
                self.emit(PUSH_EBX, 1)
                    && self.emit(MOV_EBX_EAX, 2)
                    && self.emit(AND_EBX_IMMED, 2)
                    && self.imm(0xaaaaaaaa)
                    && self.emit(AND_EAX_IMMED, 1)
                    && self.imm(0x55555555)
                    && self.emit(SHR_EBX_1, 2)
                    && self.emit(SHL_EAX_1, 2)
                    && self.emit(OR_EAX_EBX, 2)
                    && self.emit(POP_EBX, 1)
            }
            6 => self.emit(XOR_EAX_IMMED, 1) && { let v = self.r(); self.imm(v) },
            _ => {
                let op = if self.r() & 1 != 0 { ADD_EAX_IMMED } else { SUB_EAX_IMMED };
                self.emit(op, 1) && { let v = self.r(); self.imm(v) }
            }
        }
    }
    fn odd(&mut self) -> bool {
        let pick = self.r() % 6;
        match self.s.odd[pick as usize] {
            0 => self.emit(PUSH_ECX, 1) && self.emit(MOV_ECX_EBX, 2) && self.emit(AND_ECX_0F, 3) && self.emit(SHR_EAX_CL, 2) && self.emit(POP_ECX, 1),
            1 => self.emit(PUSH_ECX, 1) && self.emit(MOV_ECX_EBX, 2) && self.emit(AND_ECX_0F, 3) && self.emit(SHL_EAX_CL, 2) && self.emit(POP_ECX, 1),
            2 => self.emit(ADD_EAX_EBX, 2),
            3 => self.emit(NEG_EAX, 2) && self.emit(ADD_EAX_EBX, 2),
            4 => self.emit(IMUL_EAX_EBX, 3),
            _ => self.emit(SUB_EAX_EBX, 2),
        }
    }
    fn branch(&mut self, n: u32) -> bool {
        if self.r() & 1 != 0 {
            self.body(n)
        } else {
            self.body2(n)
        }
    }
    fn body(&mut self, n: u32) -> bool {
        if n == 1 {
            return self.prolog();
        }
        self.emit(PUSH_EBX, 1) && self.branch(n - 1) && self.emit(MOV_EBX_EAX, 2) && self.branch(n - 1) && self.odd() && self.emit(POP_EBX, 1)
    }
    fn body2(&mut self, n: u32) -> bool {
        if n == 1 {
            return self.prolog();
        }
        self.branch(n - 1) && self.even()
    }
}

/// The program for one seed. The generator keeps its state across stages, as GARbro's CxProgram does.
pub fn generate(s: &SchemeDef, seed: u32) -> Option<Vec<u32>> {
    let rng = match s.random {
        _ if s.is_hx() => hx_rng(seed, s.random_type.unwrap_or(0)),
        Some(r) => Rng::Nana(seed, r as u32),
        None => Rng::Lcg(seed),
    };
    let mut g = Gen { s, rng, code: Vec::new(), len: 0 };
    for stage in (1..=5).rev() {
        g.code.clear();
        g.len = 0;
        if g.nop(5) && g.emit(MOV_EDI_ARG, 4) && g.body(stage) && g.nop(5) && g.emit(RETN, 1) {
            return Some(std::mem::take(&mut g.code));
        }
    }
    None
}

pub fn run(code: &[u32], cb: &[u32], arg: u32) -> Option<u32> {
    let (mut eax, mut ebx, mut ecx, mut edi) = (0u32, 0u32, 0u32, 0u32);
    let mut st: Vec<u32> = Vec::with_capacity(16);
    let mut i = 0;
    while i < code.len() {
        let op = code[i];
        let mut imm = 0;
        if op & IMMED != 0 {
            i += 1;
            imm = *code.get(i)?;
        }
        match op {
            MOV_EDI_ARG => edi = arg,
            PUSH_EBX => st.push(ebx),
            POP_EBX => ebx = st.pop()?,
            PUSH_ECX => st.push(ecx),
            POP_ECX => ecx = st.pop()?,
            MOV_EBX_EAX => ebx = eax,
            MOV_EAX_EDI => eax = edi,
            MOV_ECX_EBX => ecx = ebx,
            AND_ECX_0F => ecx &= 15,
            SHR_EBX_1 => ebx >>= 1,
            SHL_EAX_1 => eax <<= 1,
            SHR_EAX_CL => eax >>= ecx & 31,
            SHL_EAX_CL => eax <<= ecx & 31,
            OR_EAX_EBX => eax |= ebx,
            NOT_EAX => eax = !eax,
            NEG_EAX => eax = eax.wrapping_neg(),
            DEC_EAX => eax = eax.wrapping_sub(1),
            INC_EAX => eax = eax.wrapping_add(1),
            ADD_EAX_EBX => eax = eax.wrapping_add(ebx),
            SUB_EAX_EBX => eax = eax.wrapping_sub(ebx),
            IMUL_EAX_EBX => eax = eax.wrapping_mul(ebx),
            ADD_EAX_IMMED => eax = eax.wrapping_add(imm),
            SUB_EAX_IMMED => eax = eax.wrapping_sub(imm),
            AND_EBX_IMMED => ebx &= imm,
            AND_EAX_IMMED => eax &= imm,
            XOR_EAX_IMMED => eax ^= imm,
            MOV_EAX_IMMED => eax = imm,
            MOV_EAX_INDIRECT => eax = !*cb.get(eax as usize)?,
            RETN => return Some(eax),
            NOP | _ => {}
        }
        i += 1;
    }
    None
}

/// One title's cx filter, ready to decrypt.
pub struct CxFilter {
    pub scheme: SchemeDef,
    cb: Vec<u32>,
    programs: Vec<OnceLock<Option<Vec<u32>>>>,
}

impl CxFilter {
    pub fn new(scheme: SchemeDef, cb: Vec<u32>) -> CxFilter {
        CxFilter { scheme, cb, programs: (0..0x80).map(|_| OnceLock::new()).collect() }
    }

    fn xcode(&self, hash: u32) -> Option<(u32, u32)> {
        let seed = hash & 0x7f;
        let code = self.programs[seed as usize].get_or_init(|| generate(&self.scheme, seed)).as_ref()?;
        let h = hash >> 7;
        Some((run(code, &self.cb, h)?, run(code, &self.cb, !h)?))
    }

    fn decode(&self, key: u32, offset: u64, buf: &mut [u8]) {
        let Some((r1, r2)) = self.xcode(key) else { return };
        let k1 = (r2 >> 16) as u64;
        let mut k2 = (r2 & 0xffff) as u64;
        let mut k3 = (r1 & 255) as u8;
        if k1 == k2 {
            k2 += 1;
        }
        if k3 == 0 {
            k3 = 1;
        }
        let count = buf.len() as u64;
        if k2 >= offset && k2 < offset + count {
            buf[(k2 - offset) as usize] ^= (r1 >> 16) as u8;
        }
        if k1 >= offset && k1 < offset + count {
            buf[(k1 - offset) as usize] ^= (r1 >> 8) as u8;
        }
        for b in buf.iter_mut() {
            *b ^= k3;
        }
    }

    fn riddle(hash: u32, offset: u64, buf: &mut [u8]) {
        if offset >= 8 || buf.is_empty() {
            return;
        }
        let lo = hash ^ 0x55555555;
        let mut hi = (hash << 13) ^ hash;
        hi ^= hi >> 17;
        hi ^= (hi << 5) ^ 0xAAAAAAAA;
        let mut key = (((hi as u64) << 32) | lo as u64) >> (offset * 8);
        let n = buf.len().min(8 - offset as usize);
        for b in buf.iter_mut().take(n) {
            *b ^= key as u8;
            key >>= 8;
        }
    }
}

impl Decrypt for CxFilter {
    fn name(&self) -> String {
        format!("cx:{}", self.scheme.titles.first().cloned().unwrap_or_default())
    }

    fn decrypt(&self, entry: &Entry, offset: u64, buf: &mut [u8]) {
        let hash = entry.key;
        if self.scheme.riddle == Some(true) {
            Self::riddle(hash, offset, buf);
        }
        let base = (hash & self.scheme.mask) as u64 + self.scheme.offset as u64;
        let mut at = 0usize;
        let mut off = offset;
        if off < base {
            let n = ((base - off) as usize).min(buf.len());
            self.decode(hash, off, &mut buf[..n]);
            off += n as u64;
            at = n;
        }
        if at < buf.len() {
            self.decode((hash >> 16) ^ hash, off, &mut buf[at..]);
        }
    }
}

/// KiriKiri 2 keyless filters: the whole key comes from the adlr hash. hash^k: each byte XOR (hash ^ k) & 0xff;
/// rot31: the hash as a 31-bit ring, byte at offset o XOR key[o % 31].
pub enum Keyless {
    HashXor(u32),
    Rot31,
}

fn rot31_key(hash: u32) -> [u8; 31] {
    let mut h = hash & 0x7fffffff;
    h |= h << 31;
    let mut k = [0u8; 31];
    for b in k.iter_mut() {
        *b = h as u8;
        h = (h >> 8) | ((h & 0xfffffffe) << 23);
    }
    k
}

impl Decrypt for Keyless {
    fn name(&self) -> String {
        match self {
            Keyless::HashXor(k) => format!("hash^{}", k),
            Keyless::Rot31 => "rot31".into(),
        }
    }
    fn decrypt(&self, entry: &Entry, offset: u64, buf: &mut [u8]) {
        match self {
            Keyless::HashXor(k) => {
                let x = ((entry.key ^ k) & 0xff) as u8;
                buf.iter_mut().for_each(|b| *b ^= x);
            }
            Keyless::Rot31 => {
                let key = rot31_key(entry.key);
                let mut o = (offset % 31) as usize;
                for b in buf.iter_mut() {
                    *b ^= key[o];
                    o = if o == 30 { 0 } else { o + 1 };
                }
            }
        }
    }
}

// ---- HxCrypt (KiriKiri Z "Hxv4" archives; GARbro HxCrypt.cs, MIT, via cx-filter.cjs) -----------------------------
// The archive's Hxv4 chunk is a ChaCha20-encrypted, zlib-packed index giving each entry (named by a 14-bit-per-char
// code of its id) a 64-bit key; each entry is XOR-ed with a 16-byte head key and two span keys from the cx program.

fn hex(s: &str) -> Option<Vec<u8>> {
    (s.len() % 2 == 0).then(|| (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect::<Option<Vec<u8>>>()).flatten()
}

/// ChaCha20 (counter starting at 1) over `data`, key 32 bytes, nonce the first 8 bytes of `nonce`.
pub fn chacha(key: &[u8], nonce: &[u8], data: &[u8]) -> Vec<u8> {
    let mut st = [0u32; 16];
    let c = b"expand 32-byte k";
    for i in 0..4 {
        st[i] = u32::from_le_bytes(c[i * 4..i * 4 + 4].try_into().unwrap());
    }
    for i in 0..8 {
        st[4 + i] = u32::from_le_bytes(key[i * 4..i * 4 + 4].try_into().unwrap());
    }
    st[12] = 1;
    st[13] = 0;
    st[14] = u32::from_le_bytes(nonce[0..4].try_into().unwrap());
    st[15] = u32::from_le_bytes(nonce[4..8].try_into().unwrap());
    let mut out = Vec::with_capacity(data.len());
    for chunk in data.chunks(64) {
        let mut z = st;
        let q = |z: &mut [u32; 16], a: usize, b: usize, c: usize, d: usize| {
            z[a] = z[a].wrapping_add(z[b]);
            z[d] = (z[d] ^ z[a]).rotate_left(16);
            z[c] = z[c].wrapping_add(z[d]);
            z[b] = (z[b] ^ z[c]).rotate_left(12);
            z[a] = z[a].wrapping_add(z[b]);
            z[d] = (z[d] ^ z[a]).rotate_left(8);
            z[c] = z[c].wrapping_add(z[d]);
            z[b] = (z[b] ^ z[c]).rotate_left(7);
        };
        for _ in 0..10 {
            q(&mut z, 0, 4, 8, 12);
            q(&mut z, 1, 5, 9, 13);
            q(&mut z, 2, 6, 10, 14);
            q(&mut z, 3, 7, 11, 15);
            q(&mut z, 0, 5, 10, 15);
            q(&mut z, 1, 6, 11, 12);
            q(&mut z, 2, 7, 8, 13);
            q(&mut z, 3, 4, 9, 14);
        }
        let mut blk = [0u8; 64];
        for i in 0..16 {
            blk[i * 4..i * 4 + 4].copy_from_slice(&st[i].wrapping_add(z[i]).to_le_bytes());
        }
        out.extend(chunk.iter().zip(blk.iter()).map(|(a, b)| a ^ b));
        let ctr = ((st[13] as u64) << 32 | st[12] as u64).wrapping_add(1);
        st[12] = ctr as u32;
        st[13] = (ctr >> 32) as u32;
    }
    out
}

/// Entry name (as stored in the archive) -> (id, key) from the decrypted Hxv4 index.
pub fn hx_index(raw: &[u8], k1: &str, k2: &str) -> Option<std::collections::HashMap<String, (u64, u64)>> {
    if raw.len() <= 20 {
        return None;
    }
    let (key, nonce) = (hex(k1)?, hex(k2)?);
    if key.len() < 32 || nonce.len() < 8 {
        return None;
    }
    let head = chacha(&key, &nonce, &raw[16..raw.len().min(80)]);
    let z = &head[4..];
    if z.len() < 2 || z[0] & 0x0f != 8 || z[0] >> 4 > 7 || ((z[0] as u32) << 8 | z[1] as u32) % 31 != 0 {
        return None;
    }
    let plain = crate::text::inflate(&chacha(&key, &nonce, &raw[16..])[4..])?;
    enum V {
        Null,
        Int(i64),
        List(Vec<V>),
        Other,
    }
    fn read(b: &[u8], p: &mut usize, depth: u32) -> Option<V> {
        if depth > 16 {
            return None;
        }
        let t = *b.get(*p)?;
        *p += 1;
        let n32 = |p: &mut usize| -> Option<usize> {
            let v = i32::from_be_bytes(b.get(*p..*p + 4)?.try_into().ok()?);
            *p += 4;
            usize::try_from(v).ok()
        };
        Some(match t {
            0 | 1 => V::Null,
            2 => {
                let n = n32(p)?;
                *p += n * 2;
                V::Other
            }
            3 => {
                let n = n32(p)?;
                *p += n;
                V::Other
            }
            4 | 5 => {
                let v = i64::from_be_bytes(b.get(*p..*p + 8)?.try_into().ok()?);
                *p += 8;
                V::Int(v)
            }
            0x81 => {
                let n = n32(p)?;
                let mut a = Vec::with_capacity(n.min(1 << 16));
                for _ in 0..n {
                    a.push(read(b, p, depth + 1)?);
                }
                V::List(a)
            }
            0xc1 => {
                let n = n32(p)?;
                for _ in 0..n {
                    read(b, p, depth + 1)?;
                    read(b, p, depth + 1)?;
                }
                V::Other
            }
            _ => return None,
        })
    }
    let mut p = 0;
    let V::List(root) = read(&plain, &mut p, 0)? else { return None };
    let mut map = std::collections::HashMap::new();
    for dir in root.iter().skip(1).step_by(2) {
        let V::List(dir) = dir else { continue };
        for info in dir.iter().skip(1).step_by(2) {
            let V::List(info) = info else { continue };
            let (Some(V::Int(id)), Some(V::Int(key))) = (info.first(), info.get(1)) else { continue };
            if *id < 0 {
                continue;
            }
            let mut h = (*id as u64 & M32) as u32;
            let mut name = String::new();
            loop {
                name.push(char::from_u32((h & 0x3fff) + 0x5000).unwrap_or('?'));
                h >>= 14;
                if h == 0 {
                    break;
                }
            }
            map.insert(name, (*id as u64, *key as u64));
        }
    }
    let _ = V::Null;
    Some(map)
}

pub struct HxFilter {
    cx: CxFilter,
    filter_key: u64,
    map: std::collections::HashMap<String, (u64, u64)>,
}

impl HxFilter {
    pub fn new(scheme: SchemeDef, cb: Vec<u32>, map: std::collections::HashMap<String, (u64, u64)>) -> Option<HxFilter> {
        let filter_key = u64::from_str_radix(scheme.filter_key.as_deref()?, 16).ok()?;
        Some(HxFilter { cx: CxFilter::new(scheme, cb), filter_key, map })
    }

    fn exec64(&self, h: u32) -> Option<u64> {
        let (a, b) = self.cx.xcode(h)?;
        Some(a as u64 | (b as u64) << 32)
    }

    fn span(k: u64, off: u64, buf: &mut [u8]) {
        if buf.is_empty() {
            return;
        }
        let fk0 = match k as u8 {
            0 => 0xa5,
            x => x,
        };
        let (d1, d2) = ((k >> 8) as u8, (k >> 16) as u8);
        let s0 = (k >> 48) & 0xffff;
        let mut s1 = (k >> 32) & 0xffff;
        if s0 == s1 {
            s1 += 1;
        }
        buf.iter_mut().for_each(|b| *b ^= fk0);
        let n = buf.len() as u64;
        if d1 != 0 && s0 >= off && s0 < off + n {
            buf[(s0 - off) as usize] ^= d1;
        }
        if d2 != 0 && s1 >= off && s1 < off + n {
            buf[(s1 - off) as usize] ^= d2;
        }
    }
}

impl Decrypt for HxFilter {
    fn name(&self) -> String {
        format!("hx:{}", self.cx.scheme.titles.first().cloned().unwrap_or_default())
    }

    fn decrypt(&self, entry: &Entry, offset: u64, buf: &mut [u8]) {
        let Some(&(id, key)) = self.map.get(&entry.name) else { return };
        let mut ek = key;
        if id & 0x1_0000_0000 == 0 {
            ek ^= self.filter_key;
        }
        let (Some(k0), Some(k1)) = (self.exec64(ek as u32), self.exec64((ek >> 32) as u32)) else { return };
        let split = (self.cx.scheme.offset as u64 + ((ek >> 16) & self.cx.scheme.mask as u64)) & M32;
        let mut hk = [0u8; 16];
        let Some(r3) = self.exec64(!ek as u32) else { return };
        let v5 = !r3;
        hk[..8].copy_from_slice(&v5.to_be_bytes());
        let Some(r4) = self.exec64(v5 as u32) else { return };
        hk[8..].copy_from_slice(&(!r4).to_be_bytes());
        if offset < 16 {
            let n = buf.len().min(16 - offset as usize);
            for i in 0..n {
                buf[i] ^= hk[offset as usize + i];
            }
        }
        let mut at = 0usize;
        let mut off = offset;
        if off < split {
            let n = ((split - off) as usize).min(buf.len());
            Self::span(k0, off, &mut buf[..n]);
            off += n as u64;
            at = n;
        }
        if at < buf.len() {
            Self::span(k1, off, &mut buf[at..]);
        }
    }
}

const RIDDLE_PSB_V3: [u8; 12] = [0x15, 0x92, 0x58, 0xf0, 0xd2, 0x66, 0xfd, 0xec, 0x2c, 0x00, 0x00, 0x00];

/// A head that only a correctly decrypted file has: multi-byte magics only (a one-byte guess matches noise).
/// Unlike the JS reader, the "XOR-ed PSB" pattern is not counted: an encrypted scene file has it before decryption,
/// which made the right scheme tie with "leave it encrypted" and sent 千恋＊万花's scn.xp3 to the slow keyless path.
pub fn strict_head(b: &[u8]) -> bool {
    const MAGICS: &[&[u8]] = &[
        b"\xff\xfe", b"\xef\xbb\xbf", b"TJS2", b"PSB\0", b"mdf\0", b"TLG0", b"TLG5", b"\x89PNG", b"OggS", b"RIFF", b"TVP ",
        b"OTTO", b"\x00\x01\x00\x00", b"ttcf",
    ];
    if MAGICS.iter().any(|m| b.starts_with(m)) {
        return true;
    }
    if b.len() >= 4 && &b[..3] == b"AMV" && b[3].is_ascii_digit() {
        return true;
    }
    if b.len() >= 4 && b[0] == 0xfe && b[1] == 0xfe && b[2] <= 2 && b[3] == 0xff {
        return true;
    }
    if b.len() >= 10 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff && (&b[6..10] == b"JFIF" || &b[6..10] == b"Exif") {
        return true;
    }
    b.starts_with(&RIDDLE_PSB_V3)
}

/// The control block of a scheme kept in a plug-in (TPM / DLL): after " Encryption control block", inverted.
pub fn control_block_in(file: &Path) -> Option<Vec<u32>> {
    let b = std::fs::read(file).ok()?;
    let sig = b" Encryption control block";
    let mut from = 0;
    while let Some(p) = b[from..].windows(sig.len()).position(|w| w == sig) {
        let at = from + p;
        if at % 4 == 0 && at + 0x1000 <= b.len() {
            return Some((0..0x400).map(|i| !u32::from_le_bytes(b[at + i * 4..at + i * 4 + 4].try_into().unwrap())).collect());
        }
        from = at + 1;
    }
    None
}

fn cb_of(s: &SchemeDef, game_dir: &Path) -> Option<Vec<u32>> {
    if let Some(cb) = &s.cb {
        let b = base64(cb)?;
        if b.len() < 0x1000 {
            return None;
        }
        return Some(b[..0x1000].chunks_exact(4).map(|c| u32::from_le_bytes(c.try_into().unwrap())).collect());
    }
    let tpm = s.tpm.as_ref()?.replace('\\', "/");
    control_block_in(&game_dir.join(&tpm)).or_else(|| control_block_in(&game_dir.join("plugin").join(Path::new(&tpm).file_name()?)))
}

/// The outcome of choosing a cipher for one archive.
pub enum Choice {
    /// Entries are stored as they are (or flagged but plain).
    Plain,
    Filter(Arc<dyn Decrypt>),
    /// Encrypted, and no known cipher yields known heads: the old flow (JS keyless / capture DLL) takes over.
    Unknown,
}

/// The cipher of one archive: the known scheme that turns most sampled encrypted entries into strict heads (at
/// least two, and more than reading them as stored), else a keyless filter, else plain or unknown.
pub fn choose(archive: &dyn Archive, game_dir: &Path, hx_raw: Option<&[u8]>) -> Choice {
    let enc: Vec<&Entry> = archive.entries().iter().filter(|e| e.encrypted && e.size >= 16).collect();
    if enc.is_empty() {
        return Choice::Plain;
    }
    let want = 32usize;
    let picked: Vec<&Entry> = if enc.len() > want { (0..want).map(|i| enc[i * enc.len() / want]).collect() } else { enc };
    let sample: Vec<(&Entry, Vec<u8>)> = picked
        .into_iter()
        .filter_map(|e| archive.read_raw(e).ok().map(|b| (e, b[..b.len().min(32)].to_vec())))
        .collect();
    if sample.is_empty() {
        return Choice::Unknown;
    }
    let raw_hits = sample.iter().filter(|(_, b)| strict_head(b) || crate::text::has_text_head(b)).count();
    if raw_hits * 2 >= sample.len() {
        return Choice::Plain;
    }
    let need = 2.min(sample.len()).max(raw_hits + 1);
    let hits_of = |d: &dyn Decrypt| {
        sample
            .iter()
            .filter(|(e, r)| {
                let mut b = r.clone();
                d.decrypt(e, 0, &mut b);
                strict_head(&b)
            })
            .count()
    };
    let mut best: Option<(usize, Arc<dyn Decrypt>)> = None;
    if let Some(raw) = hx_raw {
        let mut maps: std::collections::HashMap<(String, String), Option<std::collections::HashMap<String, (u64, u64)>>> = Default::default();
        for s in schemes().iter().filter(|s| s.is_hx() && s.filter_key.is_some()) {
            let Some(cb) = cb_of(s, game_dir) else { continue };
            let map = s.index_keys.iter().find_map(|[k1, k2]| {
                maps.entry((k1.clone(), k2.clone())).or_insert_with(|| hx_index(raw, k1, k2)).clone().filter(|m| !m.is_empty())
            });
            let Some(map) = map else { continue };
            let Some(f) = HxFilter::new(s.clone(), cb, map) else { continue };
            let hits = hits_of(&f);
            if hits >= need && best.as_ref().map_or(true, |(h, _)| hits > *h) {
                best = Some((hits, Arc::new(f)));
            }
        }
    }
    for s in schemes().iter().filter(|s| !s.is_hx()) {
        if best.as_ref().map_or(false, |(h, _)| *h == sample.len()) {
            break;
        }
        let Some(cb) = cb_of(s, game_dir) else { continue };
        let f = CxFilter::new(s.clone(), cb);
        let hits = hits_of(&f);
        if hits >= need && best.as_ref().map_or(true, |(h, _)| hits > *h) {
            best = Some((hits, Arc::new(f)));
            if hits == sample.len() {
                break;
            }
        }
    }
    if best.is_none() {
        let mut cands: Vec<Keyless> = vec![Keyless::Rot31];
        cands.extend((0..256).map(Keyless::HashXor));
        for k in cands {
            let hits = hits_of(&k);
            if hits >= need && best.as_ref().map_or(true, |(h, _)| hits > *h) {
                best = Some((hits, Arc::new(k)));
            }
        }
    }
    match best {
        Some((_, f)) => Choice::Filter(f),
        None => Choice::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schemes_load_and_programs_generate() {
        let all = schemes();
        assert!(all.len() > 50, "cx-schemes.json should hold the GARbro table");
        let s = all.iter().find(|s| s.cb.is_some()).unwrap();
        for seed in 0..0x80 {
            let code = generate(s, seed).expect("program fits");
            assert_eq!(code.last(), Some(&RETN));
        }
    }

    #[test]
    fn decrypt_is_an_involution_and_split_matches_whole() {
        let s = schemes().iter().find(|s| s.cb.is_some()).unwrap().clone();
        let cb = cb_of(&s, Path::new(".")).unwrap();
        let f = CxFilter::new(s, cb);
        let e = Entry { name: "a".into(), size: 4096, encrypted: true, key: 0x1234_5678 };
        let plain: Vec<u8> = (0..4096u32).map(|i| (i * 7) as u8).collect();
        let mut whole = plain.clone();
        f.decrypt(&e, 0, &mut whole);
        assert_ne!(whole, plain);
        // decrypting in two pieces at any split gives the same bytes as one pass
        let mut parts = plain.clone();
        let (a, b) = parts.split_at_mut(1000);
        f.decrypt(&e, 0, a);
        f.decrypt(&e, 1000, b);
        assert_eq!(parts, whole);
        f.decrypt(&e, 0, &mut whole);
        assert_eq!(whole, plain);
    }

    #[test]
    fn strict_head_does_not_take_an_encrypted_psb() {
        assert!(strict_head(b"PSB\0\x03\0\0\0"));
        // "PSB\0" XOR 0x01 with the 0x53/0x42 relation the JS check accepted
        assert!(!strict_head(&[0xa4, 0x52, 0x43, 0x01, 0x02, 0x01, 0x01, 0x01]));
    }

    fn hexs(b: &[u8]) -> String {
        b.iter().map(|x| format!("{:02x}", x)).collect()
    }

    fn scheme(title: &str, hx: bool) -> (SchemeDef, Vec<u32>) {
        let s = schemes().iter().find(|s| s.is_hx() == hx && s.titles.iter().any(|t| t == title)).unwrap().clone();
        let cb = cb_of(&s, Path::new(".")).unwrap();
        (s, cb)
    }

    // Expected bytes come from the JS reader (services/original-engines/cx-filter.cjs) on the same inputs, so the
    // port stays byte-identical to the reader that is verified on the real games.
    #[test]
    fn same_bytes_as_the_js_reader() {
        let e = |key| Entry { name: "x".into(), size: 64, encrypted: true, key };
        let (s, cb) = scheme("11eyes -Resona Forma-", false);
        let mut b = vec![0u8; 64];
        CxFilter::new(s, cb).decrypt(&e(0xdeadbeef), 0, &mut b);
        assert_eq!(hexs(&b), "6a".repeat(64));
        let (s, cb) = scheme("Café Stella to Shinigami no Chou", false);
        let mut b = vec![0u8; 64];
        CxFilter::new(s, cb).decrypt(&e(0x12345678), 0, &mut b);
        assert_eq!(hexs(&b), format!("2c0260460ef1332c{}", "01".repeat(56)));
        let (s, cb) = scheme("Sabbat of the Witch [Steam]", true);
        for (id, key, want) in [
            (0x1_2345_6789u64, 0xfedc_ba98_7654_3210u64, format!("ea19b58fea19b58f0e95614f191bc8c6{}", "40".repeat(64))),
            (0x2345_6789u64, 0x0123_4567_89ab_cdefu64, format!("e826143275d8dc7f8707ae8b9e94065b{}", "79".repeat(64))),
        ] {
            let map = [("x".to_string(), (id, key))].into_iter().collect();
            let f = HxFilter::new(s.clone(), cb.clone(), map).unwrap();
            let mut b = vec![0u8; 80];
            f.decrypt(&e(0), 0, &mut b);
            assert_eq!(hexs(&b), want);
        }
    }

    #[test]
    fn chacha_matches_the_rfc_vector() {
        // RFC 7539 A.1 test vector #2: zero key and nonce, counter 1
        let k = chacha(&[0; 32], &[0; 8], &[0; 64]);
        assert_eq!(hexs(&k[..16]), "9f07e7be5551387a98ba977c732d080d");
    }

    #[test]
    fn rot31_key_cycles() {
        let e = Entry { name: "x".into(), size: 64, encrypted: true, key: 0xdead_beef };
        let mut a = vec![0u8; 62];
        Keyless::Rot31.decrypt(&e, 0, &mut a);
        assert_eq!(a[..31], a[31..]);
    }
}
