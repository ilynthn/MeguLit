// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 2026-11-13 (user: 不要强制调整胶囊位置 要无极拖动; dragging and zooming still hitched): the wall rests wherever the drag
// or its coast leaves it, never eases to a row gap, and nothing that starts, stops or zooms the wall restyles every cover.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const web = name => fs.readFileSync(path.join(__dirname, '..', 'web', name), 'utf8');
const grimoire = web('grimoire.js');
const frameBody = (() => {
  const start = grimoire.indexOf('function frame(now)');
  assert.ok(start > 0, 'frame() not found');
  return grimoire.slice(start, grimoire.indexOf('const queue=', start));
})();

test('releasing the wall does not snap it to a row', () => {
  // the only writes to state.y in a frame are the coast; no rounding to a row pitch
  assert.doesNotMatch(frameBody, /Math\.round\(\s*\(state\.y/);
  assert.doesNotMatch(frameBody, /state\.y\s*\+=\s*[^;]*gap/);
  const writes = frameBody.match(/state\.y\s*[-+]?=(?!=)/g) || [];
  assert.strictEqual(writes.length, 1, 'state.y is moved only by the coast');
  assert.match(frameBody, /if\(coastEnd\)\{[\s\S]*state\.y-=vy/);
});

test('the coast after release only slows down, it never turns around', () => {
  // replay the coast step from frame(): velocity decays toward zero with its sign kept
  const decay = dt => Math.exp(-dt / 105);
  let vy = 2.4, y = 0, prev = Infinity;
  for (let t = 0; t < 430; t += 16) {
    const k = decay(16);
    y -= vy * 105 * (1 - k);
    vy *= k;
    assert.ok(vy > 0 && vy < prev, 'velocity keeps its direction and shrinks');
    prev = vy;
  }
  assert.ok(Number.isFinite(y));
});

test('rows are not lifted to put the capsule in a gap', () => {
  assert.match(grimoire, /cx=width\/2,cy=podY;/);
  assert.doesNotMatch(grimoire, /cy=podY-\(/);
});

test('zoom tier lives on each cover and switches a few per frame', () => {
  assert.doesNotMatch(grimoire, /host\.dataset\.zoom/);
  assert.match(grimoire, /switched<24/);
  const css = web('e255-polish.css');
  assert.doesNotMatch(css, /\.lib-field\[data-zoom/);
  assert.match(css, /\.field-plane>\[data-zoom=tiny\] \.game-caption/);
});

test('covers move inside classless wrappers', () => {
  assert.match(grimoire, /document\.createElement\('mg-cell'\)/);
  assert.match(web('library-switch-motion.js'), /closest\('mg-cell'\)/);
});

test('no filter is put on the moving wall (each blur step repainted every cover)', () => {
  assert.doesNotMatch(grimoire, /plane\.style\.filter\s*=/);
  assert.doesNotMatch(grimoire, /cell\.node\.style\.filter\s*=/);
});

test('starting or stopping the wall restyles no cover', () => {
  for (const name of ['grimoire.css', 'e255-polish.css', 'unify.css', 'judge-r2.css']) {
    const css = web(name).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /\.field-moving[^{,]*\s[^{,]*\{/, name + ': a .field-moving rule reaches the covers');
    assert.doesNotMatch(css, /\.lib-field\.dragging\s*\{/, name + ': the wall itself changes cursor (inherited by every cover)');  }
});

test('drag motion blur is a stretch of the cover positions, switchable, off with reduced motion', () => {
  assert.match(grimoire, /fxPref\('wallBlur'\)/);
  assert.match(grimoire, /reduceMotion\.matches\?Math\.min/);
  assert.match(grimoire, /dx\*ex/);
  assert.doesNotMatch(grimoire, /style\.filter\s*=/);
  assert.match(web('fx-prefs.js'), /id:'wallBlur'/);
});
