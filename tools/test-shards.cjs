// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Splits validation/*.test.cjs into CI shards of similar duration. tools/test-timings.json holds each file's
   recorded milliseconds (from tools/test-file-times.mjs); a file without a record counts as the median. Files go,
   longest first, to the shard with the least total so far, so every file lands in exactly one shard.
   Usage: node tools/test-shards.cjs <shard> <count> [parallelism]  prints that shard's files, one per line
          node tools/test-shards.cjs --plan <shard> <count> [parallelism]  prints JSON lanes {replay,browser,standard}
          node tools/test-shards.cjs --update <times.json>...  replaces the timings with the recorded ones */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const timingsFile = path.join(root, 'tools', 'test-timings.json');
const REPLAY_TEST = 'validation/games-regression.test.cjs';
const BROWSER_TEST_RE = /\bstartEdge\s*\(|require\([^)\r\n(]*cardinal\/cdp|--headless=new/;
const NON_BROWSER_MOCKS = new Set([
  REPLAY_TEST,
  'validation/layout-browser-stop.test.cjs',
  'validation/test-windows-hidden.test.cjs',
]);

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

function isBrowserTest(file, repoRoot = root) {
  if (NON_BROWSER_MOCKS.has(file)) return false;
  try {
    const src = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    return BROWSER_TEST_RE.test(src);
  } catch {
    return false;
  }
}

function detectBrowserFiles(files, repoRoot = root) {
  return new Set(files.filter(f => isBrowserTest(f, repoRoot)));
}

function shardPlan(files, timings, count, parallelism = 1, { browserFiles } = {}) {
  const browsers = browserFiles ? new Set(browserFiles) : detectBrowserFiles(files);
  const allKnown = files.map(f => timings[f]).filter(Number.isFinite);
  const fallback = median(allKnown);
  const browserKnown = files.filter(f => browsers.has(f)).map(f => timings[f]).filter(Number.isFinite);
  const browserFallback = browserKnown.length ? median(browserKnown) : fallback;
  const dur = f => (Number.isFinite(timings[f]) ? timings[f] : (browsers.has(f) ? browserFallback : fallback));

  if (parallelism <= 1 || browsers.size === 0) {
    // CI runs the real-time replay alone. Each millisecond reserves every test slot on that runner.
    const cost = f => dur(f) * (f === REPLAY_TEST ? parallelism : 1);
    const order = [...files].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : a > b ? 1 : 0));
    const out = Array.from({ length: count }, () => ({ total: 0, files: [], replay: [], browser: [], standard: [] }));
    for (const f of order) {
      let best = out[0];
      for (const s of out) if (s.total < best.total) best = s;
      best.files.push(f);
      if (f === REPLAY_TEST) best.replay.push(f);
      else if (browsers.has(f)) best.browser.push(f);
      else best.standard.push(f);
      best.total += cost(f);
    }
    return out.map(s => ({
      total: s.total,
      files: s.files.sort(),
      replay: s.replay.sort(),
      browser: s.browser.sort(),
      standard: s.standard.sort(),
    }));
  }

  // Two-lane balancing: replay runs alone; browser tests run one at a time in parallel with standard tests.
  const stdSlots = Math.max(1, parallelism - 1);
  const out = Array.from({ length: count }, () => ({ solo: 0, browserMs: 0, standardMs: 0, replay: [], browser: [], standard: [] }));
  const wallOf = (s, addBrowser = 0, addStandard = 0) => {
    const b = s.browserMs + addBrowser;
    const st = s.standardMs + addStandard;
    const slots = (b > 0 || s.browser.length > 0) ? stdSlots : parallelism;
    return s.solo + Math.max(b, st / slots);
  };

  if (files.includes(REPLAY_TEST)) {
    out[0].solo += dur(REPLAY_TEST);
    out[0].replay.push(REPLAY_TEST);
  }
  const browserOrder = files.filter(f => f !== REPLAY_TEST && browsers.has(f))
    .sort((a, b) => dur(b) - dur(a) || (a < b ? -1 : a > b ? 1 : 0));
  for (const f of browserOrder) {
    const t = dur(f);
    let best = out[0], bestW = wallOf(out[0], t, 0);
    for (const s of out) {
      const w = wallOf(s, t, 0);
      if (w < bestW || (w === bestW && s.browserMs < best.browserMs)) { best = s; bestW = w; }
    }
    best.browserMs += t;
    best.browser.push(f);
  }
  const standardOrder = files.filter(f => f !== REPLAY_TEST && !browsers.has(f))
    .sort((a, b) => dur(b) - dur(a) || (a < b ? -1 : a > b ? 1 : 0));
  const FILE_OVERHEAD_MS = 200;
  for (const f of standardOrder) {
    const t = dur(f) + FILE_OVERHEAD_MS;
    let best = out[0], bestLoad = Infinity;
    for (const s of out) {
      const slots = s.browser.length > 0 ? stdSlots : parallelism;
      const load = s.solo + (s.standardMs + t) / slots;
      if (load < bestLoad || (load === bestLoad && s.standard.length < best.standard.length)) {
        best = s;
        bestLoad = load;
      }
    }
    best.standardMs += t;
    best.standard.push(f);
  }

  return out.map(s => {
    const replay = s.replay.sort(), browser = s.browser.sort(), standard = s.standard.sort();
    return {
      total: Math.round(wallOf(s) * parallelism),
      files: [...replay, ...browser, ...standard].sort(),
      replay,
      browser,
      standard,
    };
  });
}

function shards(files, timings, count, parallelism = 1, options) {
  return shardPlan(files, timings, count, parallelism, options).map(({ total, files: list }) => ({ total, files: list }));
}

module.exports = { shards, shardPlan, testFiles, readTimings, median, isBrowserTest, detectBrowserFiles };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--update') {
    const merged = {};
    for (const f of args.slice(1)) Object.assign(merged, readTimings(path.resolve(f)));
    const current = new Set(testFiles());
    const kept = Object.fromEntries(Object.entries(merged).filter(([f, ms]) => current.has(f) && Number.isFinite(ms)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    fs.writeFileSync(timingsFile, JSON.stringify(kept, null, 1) + '\n');
    console.log('recorded ' + Object.keys(kept).length + ' of ' + current.size + ' test files');
  } else if (args[0] === '--plan') {
    const index = Number(args[1]), count = Number(args[2]), parallelism = Number(args[3] ?? 1);
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 1 || index > count ||
        !Number.isSafeInteger(parallelism) || parallelism < 1) {
      console.error('usage: node tools/test-shards.cjs --plan <shard 1..count> <count> [parallelism]'); process.exit(2);
    }
    const s = shardPlan(testFiles(), readTimings(), count, parallelism)[index - 1];
    console.log(JSON.stringify({ replay: s.replay, browser: s.browser, standard: s.standard }));
  } else {
    const index = Number(args[0]), count = Number(args[1]), parallelism = Number(args[2] ?? 1);
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 1 || index > count ||
        !Number.isSafeInteger(parallelism) || parallelism < 1) {
      console.error('usage: node tools/test-shards.cjs <shard 1..count> <count> [parallelism]'); process.exit(2);
    }
    for (const f of shards(testFiles(), readTimings(), count, parallelism)[index - 1].files) console.log(f);
  }
}
