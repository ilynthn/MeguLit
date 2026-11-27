// SPDX-License-Identifier: GPL-3.0-or-later
//! Text decoding shared by the backends.

use flate2::read::ZlibDecoder;
use std::io::Read;

pub fn inflate(data: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    ZlibDecoder::new(data).read_to_end(&mut out).ok()?;
    Some(out)
}

fn utf16le(b: &[u8]) -> String {
    let units: Vec<u16> = b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    String::from_utf16_lossy(&units)
}

/// KiriKiri's own scrambled text files: FE FE <mode 0..2> FF FE, then UTF-16 (modes 0, 1) or zlib (mode 2).
pub fn krkr_scrambled(b: &[u8]) -> Option<String> {
    if b.len() < 5 || b[0] != 0xfe || b[1] != 0xfe || b[2] > 2 {
        return None;
    }
    let mode = b[2];
    if mode == 2 {
        for i in 5..b.len().min(64) {
            if b[i] == 0x78 {
                if let Some(o) = inflate(&b[i..]) {
                    let body = if o.len() >= 2 && o[0] == 0xff && o[1] == 0xfe { &o[2..] } else { &o[..] };
                    return Some(utf16le(body));
                }
            }
        }
        return None;
    }
    if b[3] != 0xff || b[4] != 0xfe {
        return None;
    }
    let units: Vec<u16> = b[5..]
        .chunks_exact(2)
        .map(|c| {
            let mut c = u16::from_le_bytes([c[0], c[1]]);
            if mode == 1 {
                c = ((c & 0xaaaa) >> 1) | ((c & 0x5555) << 1);
            } else if c >= 0x20 {
                c ^= ((c & 0xfe) << 8) ^ 1;
            }
            c
        })
        .collect();
    Some(String::from_utf16_lossy(&units))
}

/// Script text: KiriKiri scrambled, BOM (UTF-16 LE / BE, UTF-8), strict UTF-8, else Shift-JIS.
pub fn decode(b: &[u8]) -> String {
    if let Some(s) = krkr_scrambled(b) {
        return s;
    }
    if b.len() >= 2 && b[0] == 0xff && b[1] == 0xfe {
        return utf16le(&b[2..]);
    }
    if b.len() >= 2 && b[0] == 0xfe && b[1] == 0xff {
        let units: Vec<u16> = b[2..].chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        return String::from_utf16_lossy(&units);
    }
    if b.len() >= 3 && b[0] == 0xef && b[1] == 0xbb && b[2] == 0xbf {
        return String::from_utf8_lossy(&b[3..]).into_owned();
    }
    if let Ok(s) = std::str::from_utf8(b) {
        return s.to_string();
    }
    encoding_rs::SHIFT_JIS.decode(b).0.into_owned()
}

/// Does a buffer start like a text file a script reader can decode (BOM or KiriKiri scrambled)?
pub fn has_text_head(b: &[u8]) -> bool {
    (b.len() >= 2 && ((b[0] == 0xff && b[1] == 0xfe) || (b[0] == 0xfe && b[1] == 0xff)))
        || (b.len() >= 3 && b[0] == 0xef && b[1] == 0xbb && b[2] == 0xbf)
        || (b.len() >= 5 && b[0] == 0xfe && b[1] == 0xfe && b[2] <= 2 && (b[2] == 2 || (b[3] == 0xff && b[4] == 0xfe)))
}

/// Comparison key of a line: no whitespace (ASCII or ideographic), no line breaks.
pub fn norm(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace() && *c != '\u{3000}').collect()
}

pub fn base64(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for ch in s.bytes() {
        let v = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'a'..=b'z' => ch - b'a' + 26,
            b'0'..=b'9' => ch - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' | b'\n' | b'\r' | b' ' => continue,
            _ => return None,
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrambled_mode1_swaps_bit_pairs() {
        // "あ" (U+3042) in mode 1: bit pairs swapped.
        let c: u16 = 0x3042;
        let s = ((c & 0xaaaa) >> 1) | ((c & 0x5555) << 1);
        let mut b = vec![0xfe, 0xfe, 1, 0xff, 0xfe];
        b.extend_from_slice(&s.to_le_bytes());
        assert_eq!(krkr_scrambled(&b).as_deref(), Some("あ"));
    }

    #[test]
    fn decode_sjis_and_bom() {
        let (sj, _, _) = encoding_rs::SHIFT_JIS.encode("こんにちは");
        assert_eq!(decode(&sj), "こんにちは");
        let mut u = vec![0xff, 0xfe];
        for c in "テスト".encode_utf16() {
            u.extend_from_slice(&c.to_le_bytes());
        }
        assert_eq!(decode(&u), "テスト");
    }

    #[test]
    fn base64_roundtrip() {
        assert_eq!(base64("TWVndUxpdA==").unwrap(), b"MeguLit");
    }
}
