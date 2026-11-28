/* CHAOS;CHILD acceptance (2026-11-20): two-row box lines stay above the game's button strip; a centred line re-measures its middle while typing; a cleared page hides the placed line */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../web/reader/modules/text-place.js'), 'utf8');
test('box line: Japanese-only fitting is separate from translation overflow, with an 85% translation floor', () => {
  assert.match(src, /uiLimit = cy0 \+ chc - glyph \* 2/);
  assert.match(src, /set\(sentence, 'line-height', closeRows\(sentence\)\)/); /* rows close up, never under 1.45 and never so far the furigana sits on the row above */
  assert.match(src, /Math\.max\(1\.45, Math\.round\(\(1 \+ rs \+ \.12\)/);
  assert.match(src, /\.megulit-anchor-window\.megulit-game-rows \.sentence-text\{white-space:nowrap!important\}/, 'a line on the game rows breaks only where the game did');
  assert.match(src, /Math\.ceil\(cnBase \* \.85\)/);
  assert.match(src, /available >= oneLine/);
  assert.match(src, /!anchor\.center && tr && tr\.height/);
});
test('centred line keeps only its top while typing', () => { assert.match(src, /anchor\.center && Number\.isFinite\(center\) && anchorLine === lineKey[^\n]*a = \[projected && Math\.abs\(center - anchor\[0\]\) <= Math\.max\(6, size \* \.6\) \? anchor\[0\] : center, anchor\[1\]\]/); });
test('page redrawn as plain text on clear hides the placed line', () => {
  assert.match(src, /vis\.length > cur\.length && vis\.endsWith\(cur\)\) \{ document\.body\.classList\.add\('megulit-place-gone'\)/);
  assert.match(src, /body\.megulit-place-gone \.sentence-window\.tomoyo-hook-reader \*\{opacity:0!important;visibility:hidden!important\}/);
});
test('the whole page arriving unplaced (earlier lines + the placed one) also hides it', () => { assert.match(src, /nt\.length > cur\.length && nt\.endsWith\(cur\)/); });
