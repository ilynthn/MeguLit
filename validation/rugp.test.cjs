// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const registry = require('../services/original-engines/registry.cjs');
const rugp = require('../services/original-engines/rugp.cjs');
const { probeGame } = require('../services/adapter-probe-core.cjs');
const ot = require('../services/original-text.cjs');

const ICI_SIG = 0x673ce92a, RIO_SIG = 0x596e32cd, ENC_SIG = 0x1edb927c;
const ICI_KEY = 0xb29d5a0c, RIO_KEY = 0x7e6b8ce2;
const POOL_MARKER = Buffer.from('6aea81f9ffffffff00000000', 'hex');
const MSG3_DEF = Buffer.from('ffff1500056ada317dff', 'hex');
const ADD_SEL = Buffer.from('OM_AddSelecter', 'latin1');

function writeEncrypted(plain, key) {
 const out = Buffer.allocUnsafe(8 + plain.length + Math.floor(plain.length / 0x20) * 2);
 out.writeUInt32LE((~plain.length ^ 0xc92e568b) >>> 0, 0);
 out.writeUInt32LE((((plain.length << 3) >>> 0) ^ 0xc92e568f) >>> 0, 4);
 let src = 0, dst = 8;
 while (src < plain.length) {
  let checksum = 0;
  const portion = Math.min(0x20, plain.length - src);
  for (let i = portion; i > 0; --i) {
   const b = plain[src++];
   out[dst++] = (b ^ (key & 0xff)) & 0xff;
   checksum = (checksum + b * i) & 0xffff;
   const bit = (key >>> 15) & 1;
   key = (~(bit + Math.imul(key, 2) + 0xa3b376c9)) >>> 0;
  }
  if (portion === 0x20) { out.writeUInt16LE(checksum, dst); dst += 2; }
 }
 return out.subarray(0, dst);
}

function encryptIci(plain) {
 const len = plain.length;
 // Inverse of 3-way deinterleave + XOR [0x18, 0x3f, 0xe2]
 const b = Buffer.allocUnsafe(len);
 let src = 0, dst = 0, tail = len % 3, chunk = Math.floor(len / 3);
 for (let n = 0; n < chunk; n++) {
  b[dst + n] = plain[src++] ^ 0x18;
  b[dst + chunk + n] = plain[src++] ^ 0x3f;
  b[dst + chunk * 2 + n] = plain[src++] ^ 0xe2;
 }
 if (tail > 0) plain.copy(b, len - tail, len - tail, len);

 // Inverse of backward accumulation (b[i] = (b[i] - acc) & 0xff; acc += b[i])
 let acc = 0;
 for (let i = len - 1; i >= 0; i--) {
  const decrypted = b[i];
  b[i] = (decrypted + acc) & 0xff;
  acc = (acc + decrypted) & 0xff;
 }

 // Inverse of 5-way deinterleave
 const a = Buffer.allocUnsafe(len);
 src = 0; tail = len % 5; chunk = Math.floor(len / 5);
 for (let n = 0; n < chunk; n++) {
  a[n] = b[src++]; a[chunk + n] = b[src++]; a[chunk * 2 + n] = b[src++];
  a[chunk * 3 + n] = b[src++]; a[chunk * 4 + n] = b[src++];
 }
 if (tail > 0) b.copy(a, len - tail, len - tail, len);

 // Inverse of forward accumulation + XOR 0xa5
 acc = 0;
 for (let i = 0; i < len; i++) {
  const afterSub = a[i] ^ 0xa5;
  a[i] = (afterSub + acc) & 0xff;
  acc = (acc + afterSub) & 0xff;
 }

 // Inverse of 6-way deinterleave
 const out = Buffer.allocUnsafe(len);
 src = 0; tail = len % 6; chunk = Math.floor(len / 6);
 for (let n = 0; n < chunk; n++) {
  out[n] = a[src++]; out[chunk + n] = a[src++]; out[chunk * 2 + n] = a[src++];
  out[chunk * 3 + n] = a[src++]; out[chunk * 4 + n] = a[src++]; out[chunk * 5 + n] = a[src++];
 }
 if (tail > 0) a.copy(out, len - tail, len - tail, len);
 return out;
}

const encodeOffset = (off, shift) => ((Math.floor(off / (shift ? 2 : 1)) + 0xa2fb6ad1) >>> 0);
function encodeSize(sz) {
 const hi = sz >>> 19, lo = sz & 0x7ffff;
 const aLow13 = (hi + (lo & 0xfff)) & 0x1fff;
 const a = ((lo << 13) | aLow13) >>> 0;
 return (a + 0xe7b5d9f8) >>> 0;
}

function buildIci(tocOff, tocSize) {
 const raw = Buffer.alloc(96, 0);
 let p = 0;
 raw.writeUInt32LE(ICI_SIG, p); p += 4;
 raw.writeUInt16LE(0x0011, p); p += 2;
 raw.writeUInt16LE(0, p); p += 2; // skipped for ver >= 0x11
 raw.writeUInt16LE(0, p); p += 2;
 raw.writeUInt16LE(0, p); p += 2;
 const name = Buffer.from('CObjectArcMan', 'ascii');
 raw.writeUInt16LE(name.length, p); p += 2;
 name.copy(raw, p); p += name.length;
 raw.writeUInt16LE(1, p); p += 2; // count
 raw.writeInt32LE(10, p); p += 4; // arcVer >= 10
 raw.writeInt32LE(0, p); p += 4;
 raw[p++] = 0; raw[p++] = 0;
 raw.writeInt32LE(0, p); p += 4; raw.writeInt32LE(0, p); p += 4; // arcVer >= 10
 raw.writeInt32LE(0, p); p += 4; raw.writeInt32LE(0, p); p += 4; raw.writeInt32LE(0, p); p += 4;
 raw.writeUInt32LE(tocOff, p); p += 4;
 raw.writeUInt32LE(tocSize, p); p += 4;
 raw.writeInt32LE(0, p); p += 4;
 return writeEncrypted(encryptIci(raw.subarray(0, p)), ICI_KEY);
}

function buildCrsaBlock(messages, choices = [], lc = 3) {
 const poolParts = [Buffer.from([0, 0])];
 let curChars = 1;
 const addStr = s => {
  if (s == null) return 0;
  const start = curChars;
  const b = Buffer.from(s + '\0', 'utf16le');
  poolParts.push(b);
  curChars += b.length / 2;
  return start;
 };

 const entries = messages.map(m => ({
  jpOff: addStr(m.jp),
  enOff: lc >= 2 ? addStr(m.en ?? null) : 0,
  trOff: lc >= 3 ? addStr(m.tr ?? null) : (lc === 2 ? addStr(m.tr ?? m.en ?? null) : 0),
 }));
 // Wait: when lc === 2, enOff and trOff point to the same slot (lc - 1 = 1); reuse enOff if trOff already allocated
 const bodyChunks = [];
 for (const ch of choices) {
  bodyChunks.push(ADD_SEL, Buffer.from([0, 0]));
  for (const txt of [ch.jp, ch.tr || ch.en].filter(Boolean)) {
   const ub = Buffer.from(txt, 'utf16le');
   bodyChunks.push(Buffer.from([0xff, 0xfe, 0xff, ub.length / 2]), ub);
  }
  bodyChunks.push(Buffer.alloc(8, 0));
 }

 bodyChunks.push(MSG3_DEF, Buffer.alloc(10, 0)); // MSG3_DEF (10 bytes) + 10 => total 20 bytes to header
 entries.forEach((e, idx) => {
  if (idx > 0) {
   const pad = Buffer.alloc(12, 0);
   pad.writeUInt16LE(0x8002, 0);
   bodyChunks.push(pad);
  }
  const slotCount = lc;
  const rec = Buffer.alloc(4 + slotCount * 12, 0);
  rec.writeUInt32LE(e.jpOff, 0 + 0); // header offset later: wait, p is at rec!
  // Store 4-byte [0, 0, lc, 1] first:
  rec[0] = 0; rec[1] = 0; rec[2] = lc; rec[3] = 1;
  rec.writeUInt32LE(e.jpOff, 4);
  if (lc >= 2) rec.writeUInt32LE(lc === 2 ? (e.trOff || e.enOff) : e.enOff, 4 + 12);
  if (lc >= 3) rec.writeUInt32LE(e.trOff, 4 + (lc - 1) * 12);
  bodyChunks.push(rec);
 });
 // Trailing padding so decIdx + 28 rule checks safely
 bodyChunks.push(Buffer.alloc(32, 0));
 const countBuf = Buffer.alloc(4);
 countBuf.writeUInt32LE(curChars, 0);
 const dec = Buffer.concat([...bodyChunks, POOL_MARKER, countBuf, ...poolParts]);
 const hdr = Buffer.from([0x00, 0x05, 0x6e, 0, 0, 0, 0, 0, 0, 0, 0]);
 return Buffer.concat([hdr, writeEncrypted(dec, RIO_KEY)]);
}

function buildToc(items, { encrypted, shift }) {
 const parts = [];
 const hdr = Buffer.alloc(6);
 hdr.writeUInt32LE(encrypted ? ENC_SIG : RIO_SIG, 0);
 hdr.writeUInt16LE(0x0011, 4);
 parts.push(hdr);
 parts.push(Buffer.from([0x00, 0x00])); // flags4C high word (encrypted bit comes from `encrypted`)
 // rootCls: wTag = 0xffff, schema = 1, len = 1, 1 zero byte -> decodeClassName stops cleanly
 parts.push(Buffer.from([0xff, 0xff, 0x01, 0x00, 0x01, 0x00]));
 const cnt = Buffer.alloc(2);
 cnt.writeUInt16LE(items.length, 0);
 parts.push(cnt);
 for (const it of items) {
  if (it.hasChildrenFlagCase) {
   // Item with flags&7 === 0, NO 0x0200 fNoChildren, NO extent, followed by empty child list (count=0)
   parts.push(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
   continue;
  }
  const node = Buffer.alloc(14);
  node.writeUInt16LE(0x0208, 0); // flags&7===0, bit3=extent, bit9=fNoChildren
  node.writeUInt16LE(0, 2);
  node.writeUInt16LE(0, 4); // wTag=0 -> readClass returns null
  node.writeUInt32LE(encrypted ? encodeOffset(it.off, shift) : it.off, 6);
  node.writeUInt32LE(encrypted ? encodeSize(it.sz) : it.sz, 10);
  parts.push(node);
 }
 return Buffer.concat(parts);
}

function twoVolumes(line) {
 const first = Buffer.alloc(0x100), off = first.length;
 const block = buildCrsaBlock([{ jp: line }]);
 const tocOff = (off + block.length + 17) & ~1;
 const toc = buildToc([{ off, sz: block.length }], { encrypted: true, shift: 1 });
 const second = Buffer.alloc(tocOff - off + toc.length);
 block.copy(second);
 toc.copy(second, tocOff - off);
 return { first, second, ici: buildIci(tocOff / 2, toc.length) };
}

describe('rUGP (age) engine reader', () => {
 it('detects encrypted (.rio.ici / Ages3ResT.dll) and unencrypted (RioSignature) installs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rugp-reg-'));
  try {
   const dEnc = path.join(tmp, 'enc');
   fs.mkdirSync(dEnc);
   fs.writeFileSync(path.join(dEnc, 'muvluv16.exe'), Buffer.alloc(4));
   fs.writeFileSync(path.join(dEnc, 'Ages3ResT.dll'), Buffer.alloc(4));
   fs.writeFileSync(path.join(dEnc, 'muvluv16.rio'), Buffer.alloc(16));
   fs.writeFileSync(path.join(dEnc, 'muvluv16.rio.ici'), Buffer.alloc(16));
   assert.equal(registry.engineOf(dEnc, ['muvluv16.exe', 'Ages3ResT.dll', 'muvluv16.rio', 'muvluv16.rio.ici'])?.name, 'rUGP (age)');

   const dRaw = path.join(tmp, 'raw');
   fs.mkdirSync(dRaw);
   const rawRio = Buffer.alloc(16);
   rawRio.writeUInt32LE(RIO_SIG, 0);
   fs.writeFileSync(path.join(dRaw, 'game.exe'), Buffer.alloc(4));
   fs.writeFileSync(path.join(dRaw, 'data.rio'), rawRio);
   assert.equal(registry.engineOf(dRaw, ['game.exe', 'data.rio'])?.name, 'rUGP (age)');

   const dNoise = path.join(tmp, 'noise');
   fs.mkdirSync(dNoise);
   fs.writeFileSync(path.join(dNoise, 'game.exe'), Buffer.alloc(4));
   fs.writeFileSync(path.join(dNoise, 'unrelated.rio'), Buffer.from('NOT_A_RUGP_FILE!'));
   assert.equal(registry.engineOf(dNoise, ['game.exe', 'unrelated.rio']), null);
  } finally {
   fs.rmSync(tmp, { recursive: true, force: true });
  }
 });

 it('reads encrypted multi-volume .rio + .rio.002 with fNoChildren, preserves blank slots, strips controls, and provides zh/en foreign maps', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rugp-enc-'));
  try {
   const shift = 1;
   const block1 = buildCrsaBlock([
    { jp: '「おはようございます」\x05\r', en: 'Good morning.', tr: '「早上好」' },
    { jp: '（……静かだ）', en: '', tr: '' }, // empty translation must NOT shift next row!
    { jp: '【話者】「テストの行です」', en: 'This is a test line.', tr: '【说话人】「这是测试台词」' },
   ], [{ jp: '右へ進む', tr: '向右前进', en: 'Go right' }], 3);
   const block2 = buildCrsaBlock([
    { jp: '「二番目のシーンです」', en: 'Second scene.', tr: '「第二个场景」' },
   ], [], 3);

   const off1 = 0x100; // aligned to 2 bytes (shift=1); splitAt=256 cuts inside block1!
   const splitAt = 256 + 128;
   const off2 = (off1 + block1.length + 16 + 1) & ~1;
   const tocOff = (off2 + block2.length + 32) & ~1;
   const toc = buildToc([
    { off: off1, sz: block1.length },
    { hasChildrenFlagCase: true },
    { off: off2, sz: block2.length },
   ], { encrypted: true, shift });
   const totalSize = tocOff + toc.length;
   const arc = Buffer.alloc(totalSize, 0);
   block1.copy(arc, off1);
   block2.copy(arc, off2);
   toc.copy(arc, tocOff);

   // Write split into muvluv16_chn.rio (256 bytes, cutting block1!) + muvluv16_chn.rio.002
   fs.writeFileSync(path.join(tmp, 'muvluv16.exe'), Buffer.alloc(64));
   fs.writeFileSync(path.join(tmp, 'Ages3ResT.dll'), Buffer.alloc(64));
   fs.writeFileSync(path.join(tmp, 'muvluv16_chn.rio'), arc.subarray(0, splitAt));
   fs.writeFileSync(path.join(tmp, 'muvluv16_chn.rio.002'), arc.subarray(splitAt));
   fs.writeFileSync(path.join(tmp, 'muvluv16_chn.rio.ici'), buildIci(tocOff / 2, toc.length));

   // Also add sibling English archive muvluv16.rio (lc=2 JP+EN, plus one accidental kanji token that must NOT trigger hasZh)
   const engBlock = buildCrsaBlock([
    { jp: '「おはようございます」', tr: 'Good morning.' },
    { jp: '「漢」', tr: 'Kanji' },
    { jp: '「英語専用」', tr: 'English line two.' },
   ], [], 2);
   const engOff = 0x80;
   const engTocOff = (engOff + engBlock.length + 16) & ~1;
   const engToc = buildToc([{ off: engOff, sz: engBlock.length }], { encrypted: true, shift });
   const engArc = Buffer.alloc(engTocOff + engToc.length, 0);
   engBlock.copy(engArc, engOff);
   engToc.copy(engArc, engTocOff);
   fs.writeFileSync(path.join(tmp, 'muvluv16.rio'), engArc);
   fs.writeFileSync(path.join(tmp, 'muvluv16.rio.ici'), buildIci(engTocOff / 2, engToc.length));

   const res = probeGame({ dir: tmp, executable: path.join(tmp, 'muvluv16.exe'), title: 'Synthetic rUGP' });
   assert.equal(res.step, 'ok');
   assert.equal(res.detected, 'rugp');
   assert.equal(res.lines, 5);
   assert.equal(res.japaneseLines, 5);

   const base = rugp.scenes(tmp).map(s => rugp.parse(s.read()));
   assert.deepEqual(base[0].lines, ['「おはようございます」', '（……静かだ）', '【話者】「テストの行です」', '右へ進む']);
   assert.deepEqual(base[0].zh, ['「早上好」', '', '【说话人】「这是测试台词」', '向右前进']);
   assert.deepEqual(base[1].lines, ['「二番目のシーンです」']);

   const patched = rugp.patchLines(base);
   assert.ok(patched);
   assert.deepEqual(patched[0].lines, ['「早上好」', '（……静かだ）', '【说话人】「这是测试台词」', '向右前进']);

   const fmap = rugp.foreign(tmp);
   assert.ok(fmap);
   assert.equal(fmap.get(ot.foreignKey('【说话人】「这是测试台词」')), '【話者】「テストの行です」');
   assert.equal(fmap.get(ot.foreignKey('English line two.')), '「英語専用」');
   assert.ok(Array.isArray(fmap.seq) && fmap.seq.length >= 5);
  } finally {
   fs.rmSync(tmp, { recursive: true, force: true });
  }
 });

 it('reads unencrypted RioSignature archives and avoids treating predominantly English lc=2 archives as zh patches', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rugp-raw-'));
  try {
   const blk = buildCrsaBlock([
    { jp: '「テスト開始」', tr: 'Start test.' },
    { jp: '【漢字名】「……」', tr: '漢字' }, // 1 kanji-only translation in an English scene
    { jp: '「三行目です」', tr: 'Third line here.' },
   ], [], 2);
   const itemsPlaceholderOff = 256;
   const toc = buildToc([{ off: itemsPlaceholderOff, sz: blk.length }], { encrypted: false, shift: 0 });
   assert.ok(toc.length < itemsPlaceholderOff);
   const rawArc = Buffer.alloc(itemsPlaceholderOff + blk.length, 0);
   toc.copy(rawArc, 0);
   blk.copy(rawArc, itemsPlaceholderOff);

   fs.writeFileSync(path.join(tmp, 'game.exe'), Buffer.alloc(16));
   fs.writeFileSync(path.join(tmp, 'game.rio'), rawArc);

   const base = rugp.scenes(tmp).map(s => rugp.parse(s.read()));
   assert.equal(base.length, 1);
   assert.deepEqual(base[0].lines, ['「テスト開始」', '【漢字名】「……」', '「三行目です」']);
   assert.equal(rugp.patchLines(base), null);

   const fmap = rugp.foreign(tmp);
   assert.equal(fmap.get(ot.foreignKey('Third line here.')), '「三行目です」');
  } finally {
   fs.rmSync(tmp, { recursive: true, force: true });
  }
 });

 it('pairs each translated choice with its own Japanese label', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rugp-choices-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const block = buildCrsaBlock([{ jp: '次はどうしよう。', tr: '接下来怎么办？' }], [
   { jp: '廊下へ行く' },
   { jp: '教室に残る', tr: '留在教室' },
  ]);
  const off = 0x100;
  const toc = buildToc([{ off, sz: block.length }], { encrypted: false, shift: 0 });
  const arc = Buffer.alloc(off + block.length);
  toc.copy(arc);
  block.copy(arc, off);
  fs.writeFileSync(path.join(tmp, 'game.rio'), arc);

  const base = rugp.scenes(tmp).map(s => rugp.parse(s.read()));
  const patched = rugp.patchLines(base);
  const foreign = rugp.foreign(tmp);
  assert.deepEqual({ original: base[0].lines, translated: patched[0].lines, reverse: foreign.get(ot.foreignKey('留在教室')) }, {
   original: ['次はどうしよう。', '廊下へ行く', '教室に残る'],
   translated: ['接下来怎么办？', '廊下へ行く', '留在教室'],
   reverse: '教室に残る',
  });
 });

 it('reopens the archive when its selected ICI file is added or replaced', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rugp-ici-cache-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'game.rio'), ici = path.join(dir, 'game.ici');
  const line = 'あしたは晴れですね。', pack = twoVolumes(line);
  fs.writeFileSync(file, pack.first);
  fs.writeFileSync(file + '.002', pack.second);
  let opens = 0;
  const open = fs.openSync;
  t.mock.method(fs, 'openSync', (f, ...args) => {
   if (f === file) opens++;
   return open(f, ...args);
  });
  const lines = () => rugp.scenes(dir).flatMap(s => rugp.parse(s.read()).lines);
  assert.deepEqual(lines(), []);
  const cold = opens;
  assert.ok(cold > 0);
  assert.deepEqual(lines(), []);
  assert.equal(opens, cold);

  const time = new Date('2020-01-01T00:00:00Z');
  fs.writeFileSync(ici, pack.ici);
  fs.utimesSync(ici, time, time);
  assert.deepEqual(lines(), [line]);
  const added = opens;
  assert.ok(added > cold);
  assert.deepEqual(lines(), [line]);
  assert.equal(opens, added);

  const later = new Date('2020-01-01T00:00:02Z');
  fs.writeFileSync(ici, Buffer.alloc(pack.ici.length));
  fs.utimesSync(ici, later, later);
  assert.deepEqual(lines(), []);
  assert.ok(opens > added);
 });

 it('reopens the archive after a same-size rewrite of .rio.002', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rugp-volume-cache-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'game.rio'), part = file + '.002';
  const firstLine = 'あしたは晴れですね。', secondLine = 'あしたは曇りですね。';
  const old = twoVolumes(firstLine), next = twoVolumes(secondLine);
  assert.equal(old.second.length, next.second.length);
  assert.deepEqual(old.ici, next.ici);
  fs.writeFileSync(file, old.first);
  fs.writeFileSync(file + '.ici', old.ici);
  fs.writeFileSync(part, old.second);
  const time = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(part, time, time);
  let opens = 0;
  const open = fs.openSync;
  t.mock.method(fs, 'openSync', (f, ...args) => {
   if (f === file) opens++;
   return open(f, ...args);
  });
  const lines = () => rugp.scenes(dir).flatMap(s => rugp.parse(s.read()).lines);
  assert.deepEqual(lines(), [firstLine]);
  const cold = opens;
  assert.ok(cold > 0);
  assert.deepEqual(lines(), [firstLine]);
  assert.equal(opens, cold);

  const later = new Date('2020-01-01T00:00:02Z');
  fs.writeFileSync(part, next.second);
  fs.utimesSync(part, later, later);
  assert.deepEqual(lines(), [secondLine]);
  const replaced = opens;
  assert.ok(replaced > cold);
  assert.deepEqual(lines(), [secondLine]);
  assert.equal(opens, replaced);
 });

 it('reads 3-volume trilingual .rio/.rio.002/.rio.003 (.rio.ici) builds like Muv-Luv Alternative', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rugp-3vol-'));
  try {
   const shift = 1;
   const block1 = buildCrsaBlock([
    { jp: '「第一区域へ突入する」', en: 'Entering sector one.', tr: '「突入第一区域」' },
    { jp: '「通信応答なし」', en: 'No response on comms.', tr: '「通讯无应答」' },
   ], [], 3);
   const block2 = buildCrsaBlock([
    { jp: '「第三巻データ確認」', en: 'Checking part three data.', tr: '「确认第三卷数据」' },
   ], [], 3);

   const off1 = 0x100;
   const off2 = (off1 + block1.length + 32 + 1) & ~1;
   const tocOff = (off2 + block2.length + 32 + 1) & ~1;
   const toc = buildToc([
    { off: off1, sz: block1.length },
    { off: off2, sz: block2.length },
   ], { encrypted: true, shift });
   const arc = Buffer.alloc(tocOff + toc.length, 0);
   block1.copy(arc, off1);
   block2.copy(arc, off2);
   toc.copy(arc, tocOff);

   // Split across 3 volumes so block1 spans .rio/.rio.002, block2 sits in .rio.002/.rio.003, TOC in .rio.003
   const s1 = off1 + 24, s2 = off2 + 16;
   fs.writeFileSync(path.join(tmp, 'Muv-Luv_Alternative16.exe'), Buffer.alloc(32));
   fs.writeFileSync(path.join(tmp, 'Ages3ResT.dll'), Buffer.alloc(32));
   fs.writeFileSync(path.join(tmp, 'alternative16.rio'), arc.subarray(0, s1));
   fs.writeFileSync(path.join(tmp, 'alternative16.rio.002'), arc.subarray(s1, s2));
   fs.writeFileSync(path.join(tmp, 'alternative16.rio.003'), arc.subarray(s2));
   fs.writeFileSync(path.join(tmp, 'alternative16.rio.ici'), buildIci(tocOff / 2, toc.length));

   const res = probeGame({ dir: tmp, executable: path.join(tmp, 'Muv-Luv_Alternative16.exe'), title: 'Alternative Synth' });
   assert.equal(res.step, 'ok');
   assert.equal(res.detected, 'rugp');
   assert.equal(res.lines, 3);
   assert.equal(res.japaneseLines, 3);

   const base = rugp.scenes(tmp).map(s => rugp.parse(s.read()));
   const patched = rugp.patchLines(base);
   assert.ok(patched);
   assert.deepEqual(patched[1].lines, ['「确认第三卷数据」']);

   const fmap = rugp.foreign(tmp);
   assert.equal(fmap.get(ot.foreignKey('「突入第一区域」')), '「第一区域へ突入する」');
   assert.equal(fmap.get(ot.foreignKey('Checking part three data.')), '「第三巻データ確認」');
  } finally {
   fs.rmSync(tmp, { recursive: true, force: true });
  }
 });
});
