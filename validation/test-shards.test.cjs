// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { shards, testFiles, readTimings } = require('../tools/test-shards.cjs');

test('every test file lands in exactly one shard, whatever the timings', () => {
  const files = testFiles(), timings = readTimings();
  for (const count of [1, 2, 3, 5]) {
    const all = shards(files, timings, count).flatMap(s => s.files);
    assert.equal(all.length, files.length, count + ' shards');
    assert.deepEqual([...all].sort(), files, count + ' shards');
  }
});

test('long files are spread out and files without a record count as the median', () => {
  // e has no record: it counts as the median 90, so b and e share a shard and the two short files join a.
  const s = shards(['a', 'b', 'c', 'd', 'e'], { a: 100, b: 90, c: 10, d: 10 }, 2);
  assert.deepEqual(s.map(x => x.files), [['a', 'c', 'd'], ['b', 'e']]);
  assert.deepEqual(s.map(x => x.total), [120, 180]);
});

test('the split is the same on every runner', () => {
  const files = testFiles(), timings = readTimings();
  assert.deepEqual(shards(files, timings, 3), shards([...files].reverse(), timings, 3));
});
