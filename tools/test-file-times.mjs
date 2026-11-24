// SPDX-License-Identifier: GPL-3.0-or-later
// node --test reporter: writes { "validation/x.test.cjs": milliseconds } for every test file that finished, so CI shards
// can be balanced by duration (tools/test-shards.cjs, tools/test-timings.json).
// Usage: node --test --test-reporter=./tools/test-file-times.mjs --test-reporter-destination=times.json ...
import path from 'node:path';

export default async function* fileTimes(source) {
  const started = new Map(), times = {};
  for await (const { type, data } of source) {
    // The runner reports each file as a top-level test named by the path it was given.
    if (!data?.file || data.nesting !== 0 || typeof data.name !== 'string' || path.resolve(data.name) !== path.resolve(data.file)) continue;
    if (type === 'test:dequeue') started.set(data.file, performance.now());
    else if (type === 'test:complete') {
      const ms = data.details?.duration_ms ?? performance.now() - (started.get(data.file) ?? performance.now());
      times[path.relative(process.cwd(), data.file).split(path.sep).join('/')] = Math.round(ms);
    }
  }
  yield JSON.stringify(Object.fromEntries(Object.entries(times).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 1) + '\n';
}
