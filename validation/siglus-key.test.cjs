// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* SiglusEngine second-layer key (exe_el): synthetic encrypted Scene.pck built to the format spec (no real script text) */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const kit = require('../services/original-engines/kit.cjs');
const sk = require('../services/original-engines/siglus-key.cjs');
const pck = require('../services/original-engines/siglus-pck.cjs');
const scenes = require('../services/original-engines/scenes.cjs');
const core = require('../services/adapter-probe-core.cjs');
const jr = require('../core/japanese-restore.cjs');

const EASY = pck._internal.EASY_ANGOU_CODE;

/* greedy Siglus LZSS: flag byte LSB first, 1 = literal, 0 = u16 (distance << 4 | length - 2), distance <= 4095, length 2..17 */
function lzssPack(raw) {
 const body = [];
 let i = 0;
 while (i < raw.length) {
  const flagAt = body.length; body.push(0);
  let flag = 0;
  for (let b = 0; b < 8 && i < raw.length; b++) {
   let best = 0, dist = 0;
   for (let d = 1; d <= Math.min(4095, i); d++) {
    let l = 0;
    while (l < 17 && i + l < raw.length && raw[i + l] === raw[i - d + l]) l++;
    if (l > best) { best = l; dist = d; if (l === 17) break; }
   }
   if (best >= 2) { const t = (dist << 4) | (best - 2); body.push(t & 255, t >> 8); i += best; }
   else { flag |= 1 << b; body.push(raw[i++]); }
  }
  body[flagAt] = flag;
 }
 const out = Buffer.alloc(8 + body.length);
 out.writeUInt32LE(out.length, 0); out.writeUInt32LE(raw.length, 4); Buffer.from(body).copy(out, 8);
 return out;
}

/* compiled scene dat with every section in compiler order (SiglusSceneScriptUtility BS.py) */
function buildDat(items, { zCount = 1000, labels = 3 } = {}) {
 const strs = items.map(x => x.text);
 const hdr = Buffer.alloc(132), parts = [];
 let len = 132;
 const sec = (ofsField, cntField, buf, cnt) => { hdr.writeUInt32LE(len, ofsField * 4); hdr.writeUInt32LE(cnt, cntField * 4); parts.push(buf); len += buf.length; };
 hdr.writeUInt32LE(132, 0);
 const idx = Buffer.alloc(strs.length * 8);
 let ch = 0;
 strs.forEach((s, i) => { idx.writeUInt32LE(ch, i * 8); idx.writeUInt32LE(s.length, i * 8 + 4); ch += s.length; });
 sec(3, 4, idx, strs.length);
 sec(5, 6, Buffer.concat(strs.map((s, si) => { const b = Buffer.from(s, 'utf16le'), k = (0x7087 * si) & 0xffff; for (let i = 0; i < b.length; i += 2) b.writeUInt16LE(b.readUInt16LE(i) ^ k, i); return b; })), strs.length);
 const ops = [];
 items.forEach((it, si) => {
  const push = Buffer.alloc(9); push[0] = 2; push.writeInt32LE(20, 1); push.writeInt32LE(si, 5); ops.push(push);
  if (it.kind === 'name') ops.push(Buffer.from([50]));
  else { const t = Buffer.alloc(5); t[0] = 49; t.writeInt32LE(si, 1); ops.push(t); }
 });
 const scn = Buffer.concat(ops);
 sec(1, 2, scn, scn.length);
 sec(7, 8, Buffer.alloc(4 * labels), labels);
 sec(9, 10, Buffer.alloc(4 * zCount), zCount);
 sec(11, 12, Buffer.alloc(8), 1);
 sec(13, 14, Buffer.alloc(0), 0);
 sec(15, 16, Buffer.alloc(0), 0);
 sec(17, 18, Buffer.alloc(0), 0);
 sec(19, 20, Buffer.alloc(8), 2);
 const cmdNames = ['main', 'sub'].map(s => Buffer.from(s, 'utf16le'));
 const cmdIdx = Buffer.alloc(16); cmdIdx.writeUInt32LE(0, 0); cmdIdx.writeUInt32LE(4, 4); cmdIdx.writeUInt32LE(4, 8); cmdIdx.writeUInt32LE(3, 12);
 sec(21, 22, cmdIdx, 2);
 sec(23, 24, Buffer.concat(cmdNames), 2);
 sec(25, 26, Buffer.alloc(0), 0);
 sec(27, 28, Buffer.alloc(0), 0);
 sec(29, 30, Buffer.alloc(4), 1);
 sec(31, 32, Buffer.alloc(4 * items.length), items.length);
 return Buffer.concat([hdr, ...parts]);
}

function buildPck(blobs, exeAngouMod) {
 const n = blobs.length, names = blobs.map((_, i) => 's' + String(i).padStart(4, '0'));
 const nameIdx = Buffer.alloc(n * 8), dataIdx = Buffer.alloc(n * 8);
 let c = 0, d = 0;
 names.forEach((s, i) => { nameIdx.writeUInt32LE(c, i * 8); nameIdx.writeUInt32LE(s.length, i * 8 + 4); c += s.length; });
 blobs.forEach((b, i) => { dataIdx.writeInt32LE(d, i * 8); dataIdx.writeInt32LE(b.length, i * 8 + 4); d += b.length; });
 const namePool = Buffer.from(names.join(''), 'utf16le');
 const hdr = Buffer.alloc(92), nio = 92, nso = nio + nameIdx.length, dio = nso + namePool.length, dof = dio + dataIdx.length;
 hdr.writeUInt32LE(92, 0);
 [[13, nio], [14, n], [15, nso], [16, n], [17, dio], [18, n], [19, dof], [20, n], [21, exeAngouMod]].forEach(([f, v]) => hdr.writeUInt32LE(v, f * 4));
 return Buffer.concat([hdr, nameIdx, namePool, dataIdx, ...blobs]);
}

const KEY = Buffer.from('5be1077d93c42a0ef16b88d24e3790ac', 'hex');
function sceneItems(seed) {
 const out = [];
 for (let i = 0; i < 6 + seed * 3; i++) {
  if (i % 3 === 0) out.push({ kind: 'name', text: ['ことり', '静流', '朱音', '小鳥'][(i + seed) % 4] });
  out.push({ kind: 'text', text: '「テスト用の合成台詞です' + seed + '-' + i + '。」' + 'あいうえお'.slice(0, (i * 7 + seed) % 5) });
 }
 return out;
}
function encryptedPck(key, { zCount } = {}) {
 const dats = [0, 1, 2, 3, 4, 5].map(s => buildDat(sceneItems(s), { zCount, labels: 2 + s }));
 return { dats, buf: buildPck(dats.map(d => kit.xor(kit.xor(lzssPack(d), key), EASY)), 1) };
}

/* minimal PE32 with SiglusEngine's decrypt loop: C6 45 d imm stores, then 8A 44 0D d / 8D 52 01 30 42 FF 41 */
function fakeExe(key) {
 const code = [];
 for (let i = 0; i < 16; i++) code.push(0xc6, 0x45, (0xe0 + i) & 255, key[i]);
 code.push(0x90, 0x8a, 0x44, 0x0d, 0xe0, 0x8d, 0x52, 0x01, 0x30, 0x42, 0xff, 0x41, 0xc3);
 const text = Buffer.alloc(0x200); Buffer.from(code).copy(text);
 const head = Buffer.alloc(0x200);
 head.write('MZ', 0); head.writeUInt32LE(0x40, 0x3c); head.write('PE\0\0', 0x40, 'latin1');
 head.writeUInt16LE(0x14c, 0x44); head.writeUInt16LE(1, 0x46); head.writeUInt16LE(0xe0, 0x54);
 const opt = 0x58; head.writeUInt16LE(0x10b, opt); head.writeUInt32LE(0x400000, opt + 28);
 const sh = opt + 0xe0; head.write('.text', sh, 'latin1');
 head.writeUInt32LE(0x200, sh + 8); head.writeUInt32LE(0x1000, sh + 12); head.writeUInt32LE(0x200, sh + 16); head.writeUInt32LE(0x200, sh + 20); head.writeUInt32LE(0x60000020, sh + 36);
 return Buffer.concat([head, text, Buffer.alloc(512 << 10)]);
}

function withDir(fn) {
 const d = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-siglus-key-'));
 try { return fn(d); } finally { fs.rmSync(d, { recursive: true, force: true }); }
}
const easyBlobs = buf => { const h = pck.parseHeader(buf), out = []; for (let i = 0; i < h.scnDataCnt; i++) { const a = buf.readInt32LE(h.scnDataIdxOfs + i * 8), s = buf.readInt32LE(h.scnDataIdxOfs + i * 8 + 4); out.push(kit.xor(buf.subarray(h.scnDataOfs + a, h.scnDataOfs + a + s), EASY)); } return out; };

test('greedy encoder round-trips through the reader lzss', () => {
 const d = buildDat(sceneItems(2));
 assert.ok(lzssPack(d).length < d.length);
 assert.deepEqual(sk._internal.lzssUnpack(lzssPack(d)), d);
});

test('solveKey recovers exe_el from the scenes alone (known plaintext)', () => {
 for (const zCount of [1000, 100]) {
  const { buf } = encryptedPck(KEY, { zCount });
  const k = sk.solveKey(easyBlobs(buf), { check: pck.isSiglusDat });
  assert.ok(k, 'z=' + zCount);
  assert.equal(k.toString('hex'), KEY.toString('hex'));
 }
});

test('exeKey reads exe_el from the decrypt loop in the engine exe', () => {
 assert.equal(sk.exeKey(fakeExe(KEY)).toString('hex'), KEY.toString('hex'));
 assert.equal(sk.exeKey(Buffer.from('MZ')), null);
});

test('angouDatKey folds the 暗号.dat line into EXE_ORG', () => {
 const line = Buffer.from('ABCDEFGHIJKLMNOPQRS');
 const k = sk.angouDatKey(Buffer.concat([line, Buffer.from('\r\nrest')]));
 const want = Buffer.from(sk._internal.EXE_ORG);
 for (let i = 0; i < 19; i++) want[i % 16] ^= line[i];
 assert.deepEqual(k, want);
 assert.equal(sk.angouDatKey(Buffer.from('short')), null);
});

test('siglus-pck reads exe-keyed scenes: key from the exe, from 暗号.dat, or from the scenes', () => {
 const angou = Buffer.from('MeguLitSyntheticAngou');
 const angouKey = sk.angouDatKey(angou);
 for (const mode of ['exe', 'angou', 'plaintext']) withDir(dir => {
  const key = mode === 'angou' ? angouKey : KEY;
  const { dats, buf } = encryptedPck(key);
  fs.writeFileSync(path.join(dir, 'Scene.pck'), buf);
  fs.writeFileSync(path.join(dir, 'SiglusEngine.exe'), mode === 'exe' ? fakeExe(key) : Buffer.from('MZ'));
  if (mode === 'angou') fs.writeFileSync(path.join(dir, '暗号.dat'), angou);
  const e = scenes.ENGINES['siglus-pck'];
  const sc = e.scenes(dir);
  assert.equal(sc.length, dats.length, mode);
  assert.deepEqual(sc[0].read(), dats[0]);
  const p = e.parse(sc[1].read());
  assert.equal(p.lines[0], '「テスト用の合成台詞です1-0。」あ');
  assert.equal(p.speakers[0], '静流');
  assert.equal(e.unsupported(dir), '');
  const r = core.probeGame({ dir });
  assert.equal(r.step, 'ok', mode + ' ' + r.step + ' ' + r.detail);
  assert.equal(r.detected, 'siglus-pck');
 });
});

test('Gameexe.dat with exe angou decrypts with the scene key', () => withDir(dir => {
 const { buf } = encryptedPck(KEY);
 fs.writeFileSync(path.join(dir, 'Scene.pck'), buf);
 const ini = Buffer.from('#GAMENAME = "Synthetic"\r\n#SCREEN_SIZE = 1280,720\r\n#NAMAE = "静流",\t\t"しずる",\t1,000,-1\r\n', 'utf16le');
 const head = Buffer.alloc(8); head.writeInt32LE(1, 4);
 fs.writeFileSync(path.join(dir, 'Gameexe.dat'), Buffer.concat([head, kit.xor(kit.xor(lzssPack(ini), KEY), sk._internal.GAMEEXE_ANGOU_CODE)]));
 assert.match(scenes.ENGINES['siglus-pck'].gameexe(dir), /#GAMENAME = "Synthetic"/);
 assert.equal(sk.gameexeText(fs.readFileSync(path.join(dir, 'Gameexe.dat')), null), '');
 const e = scenes.ENGINES['siglus-pck'], sc = e.scenes(dir);
 assert.equal(e.parse(sc[1].read()).speakers[0], 'しずる');
 assert.equal(e.parse(sc[0].read()).speakers[0], 'ことり');
 const install = path.join(dir, 'game');
 fs.mkdirSync(install);
 fs.writeFileSync(path.join(dir, 'SiglusEngine.exe'), 'MZ');
 for (const name of ['Scene.pck','Gameexe.dat']) fs.renameSync(path.join(dir,name),path.join(install,name));
 assert.match(e.gameexe(dir), /#GAMENAME = "Synthetic"/);
}));

test('siglus-pck caches Gameexe speaker mappings until the selected file changes', t => withDir(dir => {
 const file = path.join(dir, 'Scene.pck'), fallback = path.join(dir, 'Gameexe_alt.dat'), canonical = path.join(dir, 'Gameexe.dat');
 const dat = buildDat([{ kind: 'name', text: 'TAG1' }, { kind: 'text', text: 'ここから始めましょう。' }]);
 fs.writeFileSync(file, buildPck([kit.xor(lzssPack(dat), EASY)], 0));
 const gameexe = name => Buffer.concat([Buffer.alloc(8), kit.xor(lzssPack(Buffer.from('#NAMAE = "TAG1","' + name + '"\r\n', 'utf16le')), sk._internal.GAMEEXE_ANGOU_CODE)]);
 const originalRead = fs.readFileSync;
 let reads = 0;
 t.mock.method(fs, 'readFileSync', (f, ...args) => {
  if (f === file || f === fallback || f === canonical) reads++;
  return originalRead(f, ...args);
 });
 const engine = scenes.ENGINES['siglus-pck'];
 const readSpeaker = () => engine.parse(engine.scenes(dir)[0].read()).speakers[0];
 assert.equal(readSpeaker(), 'TAG1');
 const cold = reads;
 assert.ok(cold > 0);
 assert.equal(readSpeaker(), 'TAG1');
 assert.equal(reads, cold);

 const first = gameexe('小鳥'), second = gameexe('静流'), third = gameexe('朱音');
 assert.equal(first.length, second.length);
 assert.equal(second.length, third.length);
 const time = new Date('2020-01-01T00:00:00Z');
 fs.writeFileSync(fallback, first);
 fs.utimesSync(fallback, time, time);
 assert.equal(readSpeaker(), '小鳥');
 const withFallback = reads;
 assert.ok(withFallback > cold);
 assert.equal(readSpeaker(), '小鳥');
 assert.equal(reads, withFallback);

 fs.writeFileSync(canonical, second);
 fs.utimesSync(canonical, time, time);
 assert.equal(readSpeaker(), '静流');
 const withCanonical = reads;
 assert.ok(withCanonical > withFallback);
 const later = new Date('2020-01-01T00:00:02Z');
 fs.writeFileSync(canonical, third);
 fs.utimesSync(canonical, later, later);
 assert.equal(readSpeaker(), '朱音');
 const replaced = reads;
 assert.ok(replaced > withCanonical);
 assert.equal(readSpeaker(), '朱音');
 assert.equal(reads, replaced);
}));

test('siglus-pck retries an encrypted pack when a same-size 暗号.dat is replaced', t => withDir(dir => {
 const file = path.join(dir, 'Scene.pck'), angou = path.join(dir, '暗号.DAT');
 const correct = Buffer.from('MeguLitSyntheticAngou'), wrong = Buffer.from(correct);
 wrong[0] ^= 1;
 const { buf, dats } = encryptedPck(sk.angouDatKey(correct));
 fs.writeFileSync(file, buf);
 fs.writeFileSync(angou, wrong);
 const time = new Date('2020-01-01T00:00:00Z');
 fs.utimesSync(angou, time, time);
 t.mock.method(sk, 'solveKey', () => null);
 const originalRead = fs.readFileSync;
 let reads = 0;
 t.mock.method(fs, 'readFileSync', (f, ...args) => {
  if (f === file || f === angou) reads++;
  return originalRead(f, ...args);
 });
 const engine = scenes.ENGINES['siglus-pck'];
 assert.deepEqual(engine.scenes(dir), []);
 const cold = reads;
 assert.ok(cold > 0);
 assert.deepEqual(engine.scenes(dir), []);
 assert.equal(reads, cold);

 fs.writeFileSync(angou, correct);
 const later = new Date('2020-01-01T00:00:02Z');
 fs.utimesSync(angou, later, later);
 const reopened = engine.scenes(dir);
 assert.equal(reopened.length, dats.length);
 assert.deepEqual(reopened[0].read(), dats[0]);
 const replaced = reads;
 assert.ok(replaced > cold);
 assert.equal(engine.scenes(dir), reopened);
 assert.equal(reads, replaced);
}));

test('a partial Scene.pck (zeroed scenes) still reports SIGLUS_EXE_KEY instead of hanging', () => withDir(dir => {
 const { buf } = encryptedPck(KEY);
 const h = pck.parseHeader(buf);
 buf.fill(0, h.scnDataOfs);
 fs.writeFileSync(path.join(dir, 'Scene.pck'), buf);
 fs.writeFileSync(path.join(dir, 'SiglusEngine.exe'), 'MZ');
 const r = core.probeGame({ dir });
 assert.equal(r.step, 'decrypt-failed');
 assert.equal(r.detail, 'siglus-pck:SIGLUS_EXE_KEY');
}));

test('dbs: only whole dwords are XORed, a 1-3 byte tail stays plain (as the engine reads it)', () => {
 for (const extra of [0, 1, 2, 3]) {
  const raw = Buffer.alloc(64 + extra * 4);
  raw.writeUInt32LE(raw.length, 0);
  for (let i = 4; i < raw.length; i++) raw[i] = (i * 37) & 255;
  const enc = jr._internal.encrypt(1, raw), body = enc.subarray(4), n = body.length & ~3;
  const plain = Buffer.from(body); for (let i = 0; i < n; i++) plain[i] ^= [0x2d, 0x62, 0xf4, 0x89][i & 3];
  assert.equal(plain.readUInt32LE(0), body.length);
  assert.deepEqual(jr._internal.lzss(plain).length, plain.readUInt32LE(4));
  assert.deepEqual(jr._internal.decrypt(enc).raw.subarray(0, raw.length), raw);
 }
});
