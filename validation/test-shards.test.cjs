// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { shards, shardPlan, testFiles, readTimings, detectBrowserFiles } = require('../tools/test-shards.cjs');

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

test('the real-time replay consumes all test slots while it runs alone', () => {
  const replay = 'validation/games-regression.test.cjs';
  const files = [replay, 'a', 'b', 'c', 'd'];
  const timings = { [replay]: 100, a: 90, b: 90, c: 90, d: 90 };
  const assigned = shards(files, timings, 2, 3);
  assert.deepEqual(assigned, [
    { total: 300, files: [replay] },
    { total: 360, files: ['a', 'b', 'c', 'd'] },
  ]);
});

test('the split is the same on every runner', () => {
  const files = testFiles(), timings = readTimings();
  assert.deepEqual(shards(files, timings, 3, 3), shards([...files].reverse(), timings, 3, 3));
});

test('shardPlan partitions every file into replay, browser, or standard lanes without overlap or omission', () => {
  const files = testFiles(), timings = readTimings();
  const browsers = detectBrowserFiles(files);
  assert.ok(browsers.has('validation/altt-panel-contrast.test.cjs'));
  assert.ok(browsers.has('validation/reader-log-panel.test.cjs'));
  assert.ok(!browsers.has('validation/games-regression.test.cjs'));
  assert.ok(!browsers.has('validation/layout-browser-stop.test.cjs'));
  assert.ok(!browsers.has('validation/test-windows-hidden.test.cjs'));

  const plan = shardPlan(files, timings, 3, 3);
  assert.deepEqual(plan, shardPlan([...files].reverse(), timings, 3, 3));
  const seen = [];
  for (const s of plan) {
    const laneFiles = [...s.replay, ...s.browser, ...s.standard];
    assert.deepEqual([...laneFiles].sort(), s.files);
    assert.ok(s.browser.length > 0, 'each shard receives browser tests');
    assert.ok(s.standard.length > 0 && s.standard.length < files.length * 0.5, 'standard files stay balanced across shards');
    seen.push(...laneFiles);
  }
  assert.equal(seen.length, files.length);
  assert.deepEqual([...seen].sort(), files);
});

test('unrecorded browser tests fall back to the browser median rather than the fast unit-test median', () => {
  const files = ['b1', 'b2', 'b_new', 's1', 's2', 's3', 's4'];
  const timings = { b1: 30000, b2: 20000, s1: 100, s2: 100, s3: 100, s4: 100 };
  const plan = shardPlan(files, timings, 2, 3, { browserFiles: ['b1', 'b2', 'b_new'] });
  // b1 (30s) goes to shard 0, b_new (browser median 30s) goes to shard 1, b2 (20s) goes to shard 0 or 1.
  // Crucially b1 and b_new are separated instead of treating b_new as 100 ms.
  assert.notEqual(plan[0].browser.includes('b1'), plan[0].browser.includes('b_new'));

  // When no browser file has a timing record yet, browser fallback drops back to the overall median.
  const noBrowserTimings = shardPlan(['b_new', 's1', 's2', 's3'], { s1: 1000, s2: 1000, s3: 1000 }, 2, 3, { browserFiles: ['b_new'] });
  assert.equal(noBrowserTimings[0].browser.length + noBrowserTimings[1].browser.length, 1);
  assert.equal(noBrowserTimings[0].standard.length + noBrowserTimings[1].standard.length, 3);
  // Shard without browser tests keeps all 3 slots and receives more standard work than the 2-slot browser shard.
  const withBrowser = noBrowserTimings.find(s => s.browser.length === 1);
  const withoutBrowser = noBrowserTimings.find(s => s.browser.length === 0);
  assert.ok(withoutBrowser.standard.length >= withBrowser.standard.length);
});

test('CLI --plan prints shard JSON lanes and exits 2 on invalid arguments', () => {
  const script = path.join(__dirname, '..', 'tools', 'test-shards.cjs');
  const raw = execFileSync(process.execPath, [script, '--plan', '1', '3', '3'], { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed.replay) && Array.isArray(parsed.browser) && Array.isArray(parsed.standard));
  assert.ok(parsed.browser.length > 0 && parsed.standard.length > 0);
  assert.throws(
    () => execFileSync(process.execPath, [script, '--plan', '4', '3', '3'], { stdio: 'pipe' }),
    err => err.status === 2
  );
});
