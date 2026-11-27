// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #1128, second way to one sentence with two translations. Live 2026-11-27, 死に逝く君、館に芽吹く憎悪（濒死之君、馆中萌芽的憎恶） 汉化硬盘版,
   skip (>>) on: Krkr2wcs sent one 55-character frame 「……焼き過ぎたか」「……焼き過ぎたか」消し炭に…つぶやいた。 (the quoted line drawn twice,
   then the next line). The quote splits at its 「…」 into 「「……」 + 「焼き過ぎたか」」; the first piece has no letters, so the 3-letter rule
   kept the pair, and the whole frame is no plain repeat because the next line follows. The reader showed the sentence twice and the
   translation held it twice (「“我是不是煮过头了？”“……我是不是煮过头了？”」). A group of sentences drawn twice in a row inside a frame
   is now one copy, under the same 3-letter rule; a short line the script really says twice (「はい」「はい」) stays. */
const hookBridgeChild = require('./helpers/hook-bridge-child.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const L = require('../core/line-once.js');
const { HookNative } = require('../core/hook-native.cjs');

const X = '「……焼き過ぎたか」', Y = '消し炭になってしまった人間の腕を見て、その男は溜息混じりにつぶやいた。';

function fixture(t) {
  let now = 1e6; const shown = [];
  const hook = new HookNative({ native: __dirname, hook: __dirname, logs: 'Z:/no-skip-doubled-log' }, m => { if (typeof m?.hookSource === 'string') shown.push(m.hookSource); }, () => {}, () => now);
  hook.trace = () => {}; hook.artLocate = () => {}; hook.process = hookBridgeChild(); t.after(() => hook.stop());
  return { shown, line(text, ms = 300) { hook.source({ text, sourceName: 'Krkr2wcs', sourceCode: 'EXHQXN8@17527C:bug02_yakata.exe', origin: 'live' }, ''); now += ms; } };
}

test('#1128 skip: a quote drawn twice before the next line is shown once', t => {
  const f = fixture(t);
  f.line('背丈の低い草むらに男が立っていた。');
  f.line(X + X + Y);
  assert.equal(f.shown.at(-1), X + Y, 'the sentence once: ' + JSON.stringify(f.shown.at(-1)));
});

test('#1128 skip: every sentence of a skip frame drawn twice, with the game\'s blanks, is shown once each', t => {
  const f = fixture(t);
  f.line('背丈の低い草むらに男が立っていた。');
  f.line(X + '\u3000' + X + '\u3000\u3000' + Y + '\u3000' + Y + '\u3000');
  assert.equal(f.shown.at(-1).replace(/[\s\u3000]/g, ''), (X + Y).replace(/[\s\u3000]/g, ''), JSON.stringify(f.shown.at(-1)));
});

test('#1128 line-once: a doubled group inside a frame folds; the reader copy is the same module', () => {
  assert.equal(L.collapse(X + X + Y).text, X + Y);
  assert.equal(L.collapse('前の文。' + X + X + Y).text, '前の文。' + X + Y, 'also after another sentence');
  const root = path.join(__dirname, '..');
  assert.equal(fs.readFileSync(path.join(root, 'core/line-once.js'), 'utf8'), fs.readFileSync(path.join(root, 'web/reader/modules/line-once.js'), 'utf8'));
});

test('#1128 control: short real repeats and different neighbours stay as they were', () => {
  assert.equal(L.collapse('「はい」「はい」' + Y).text, '「はい」「はい」' + Y, 'two letters: a line the script may really say twice');
  assert.equal(L.collapse(X + Y).text, X + Y, 'nothing doubled, nothing changed');
  assert.equal(L.collapse('「待って……」「行かないで……」' + Y).text, '「待って……」「行かないで……」' + Y, 'two different quotes stay');
  assert.equal(L.collapse('そうだ。そうだ。').text, 'そうだ。', 'a whole frame drawn twice folded before too');
});

/* live 2026-11-27, same session after the fix above: 「んっ……？」「んっ……？」男の視線が、… was still shown twice. Two letters are under the
   3-letter rule, which is there for a line the script really says twice. On a stream that has been drawing its lines twice (E408 evidence,
   core/double-line.cjs) a doubled group is a redraw whatever its length; a stream that never drew twice keeps 「はい」「はい」. */
const twice = s => s + '\u3000' + s + '\u3000';
test('#1128 skip: a short quote drawn twice on a stream that draws lines twice is shown once', t => {
  const f = fixture(t);
  for (const s of ['背丈の低い草むらに男が立っていた。', '彼の全身は血に濡れ、異様な雰囲気を纏っていた。', 'すぐには、状況が理解できなかった。']) f.line(twice(s));
  const Z = '男の視線が、美亜に向けられた。';
  f.line('「んっ…？」　「んっ…？」　　' + twice(Z)); /* the frame as Krkr2wcs drew it while skipping */
  assert.equal(f.shown.at(-1).replace(/[\s　]/g, ''), '「んっ…？」' + Z, JSON.stringify(f.shown.at(-1)));
});
test('#1128 control: a stream that never drew twice keeps a short line said twice', t => {
  const f = fixture(t);
  for (const s of ['背丈の低い草むらに男が立っていた。', '彼の全身は血に濡れ、異様な雰囲気を纏っていた。', 'すぐには、状況が理解できなかった。']) f.line(s);
  f.line('「はい」「はい」男は頷いた。');
  assert.equal(f.shown.at(-1), '「はい」「はい」男は頷いた。');
});

/* live 2026-11-27, skip again: 228-character frames such as 「んっ……？」「んっ……？」男の視線が、美亜に向けられた。男の視線が、美亜に向けられた。…
   and 「……………………」「……………………」男の身体にぶつかるように… still showed the short quote twice: while skipping the stream sends merged
   frames, never a plain X+X, so its "draws twice" evidence ran out. A frame that itself holds a sentence of 3+ letters drawn twice in a row
   is a redraw frame: its short doubled groups (also 「……」 with no letters) are redraws too, and the stream keeps its evidence. */
test('#1128 skip: in a frame with a long sentence drawn twice, a short doubled quote is a redraw too', () => {
  const Z = '男の視線が、美亜に向けられた。';
  assert.equal(L.collapse('「んっ……？」「んっ……？」' + Z + Z).text, '「んっ……？」' + Z);
  assert.equal(L.collapse('「……………………」「……………………」' + Z + Z).text, '「……………………」' + Z);
  assert.equal(L.collapse('「はい」「はい」' + Z).text, '「はい」「はい」' + Z, 'nothing long drawn twice: kept');
});
test('#1128 skip: a stream folded inside its frames keeps its evidence for the next short pair', t => {
  const f = fixture(t);
  const Z = '男の視線が、美亜に向けられた。', W = '男の身体にぶつかるようにして、美亜はナイフを前に突き出した。';
  for (const s of ['背丈の低い草むらに男が立っていた。', '彼の全身は血に濡れ、異様な雰囲気を纏っていた。']) f.line(s);
  for (const s of ['窃盗だった。器物破損だった。', '強姦だった。そして殺人だった。']) f.line(s + s.split('。')[0] + '。'); /* merged skip frames, no plain X+X */
  for (let i = 0; i < 8; i++) f.line('「んっ……？」「んっ……？」' + Z + Z);
  f.line('「……………………」「……………………」' + W);
  assert.equal(f.shown.at(-1), '「……………………」' + W, JSON.stringify(f.shown.at(-1)));
});
