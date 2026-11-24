// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Splits validation/*.test.cjs into CI shards of similar duration. tools/test-timings.json holds each file's
   recorded milliseconds (from tools/test-file-times.mjs); a file without a record counts as the median. Files go,
   longest first, to the shard with the least total so far, so every file lands in exactly one shard.
   Usage: node tools/test-shards.cjs <shard> <count>          prints that shard's files, one per line
          node tools/test-shards.cjs --update <times.json>...  replaces the timings with the recorded ones */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const timingsFile = path.join(root, 'tools', 'test-timings.json');

function testFiles() {
  return fs.readdirSync(path.join(root, 'validation')).filter(n => n.endsWith('.test.cjs')).sort().map(n => 'validation/' + n);
}

function readTimings(file = timingsFile) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}

function median(values) {
  if (!values.length) return 1;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function shards(files, timings, count) {
  const fallback = median(files.map(f => timings[f]).filter(Number.isFinite));
  const cost = f => (Number.isFinite(timings[f]) ? timings[f] : fallback);
  const order = [...files].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : a > b ? 1 : 0));
  const out = Array.from({ length: count }, () => ({ total: 0, files: [] }));
  for (const f of order) {
    let best = out[0];
    for (const s of out) if (s.total < best.total) best = s;
    best.files.push(f); best.total += cost(f);
  }
  return out.map(s => ({ total: s.total, files: s.files.sort() }));
}

module.exports = { shards, testFiles, readTimings, median };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--update') {
    const merged = {};
    for (const f of args.slice(1)) Object.assign(merged, readTimings(path.resolve(f)));
    const current = new Set(testFiles());
    const kept = Object.fromEntries(Object.entries(merged).filter(([f, ms]) => current.has(f) && Number.isFinite(ms)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    fs.writeFileSync(timingsFile, JSON.stringify(kept, null, 1) + '\n');
    console.log('recorded ' + Object.keys(kept).length + ' of ' + current.size + ' test files');
  } else {
    const index = Number(args[0]), count = Number(args[1]);
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 1 || index > count) {
      console.error('usage: node tools/test-shards.cjs <shard 1..count> <count>'); process.exit(2);
    }
    for (const f of shards(testFiles(), readTimings(), count)[index - 1].files) console.log(f);
  }
}
