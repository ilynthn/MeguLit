// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Builds the offline dictionary the user centre (megulit.com/me/) looks words up in: the app's jmdict.json cut into 2048 small
   files by the first two characters of every spelling and reading, so a tap downloads one file (tens of KB) and the page can
   cache it. Run before a site deploy; the output (site/public/dict/) is not committed.

     node site/tools/build-web-dict.cjs <jmdict.json> [out folder]       default out: site/public/dict/v1

   Entry format, one array per entry: [id, spellings, readings, definitions (at most 6), parts of speech (at most 3), frequency rank].
   An entry is written to the file of every distinct form-prefix of its spellings and readings, so a lookup of any form
   finds it in one file. Files nobody maps to are written as [] (the page treats a 404 as
   "dictionary not installed"). Keep SHARDS in step with assets/js/me-core.mjs.
   Source: JMdict, (c) the Electronic Dictionary Research and Development Group, CC BY-SA 4.0 (https://www.edrdg.org/). */
const fs = require('node:fs'), path = require('node:path');
const SHARDS = 2048, MAX_DEFS = 6, MAX_DEF_CHARS = 240, MAX_POS = 3;

const shardOf = form => { const [a, b] = [...String(form)]; return (b === undefined ? a.codePointAt(0) : a.codePointAt(0) * 31 + b.codePointAt(0)) % SHARDS; };
const clip = text => { const s = String(text).trim(); return [...s].length > MAX_DEF_CHARS ? [...s].slice(0, MAX_DEF_CHARS).join('') + '…' : s; };
function compact(e) {
  return [e.id, (e.spellings || []).map(String), (e.readings || []).map(String), (e.definitions || []).map(clip).filter(Boolean).slice(0, MAX_DEFS), (e.pos || []).map(String).slice(0, MAX_POS), Number(e.freq_rank) > 0 ? Number(e.freq_rank) : 0];
}
function build(entries) {
  const shards = Array.from({ length: SHARDS }, () => []);
  let count = 0;
  for (const e of entries) {
    if (!e || !Number.isSafeInteger(e.id)) continue;
    const row = compact(e);
    if (!row[3].length) continue;
    const forms = [...row[1], ...row[2]].filter(Boolean), seen = new Set();
    for (const form of forms) { const n = shardOf(form); if (!seen.has(n)) { seen.add(n); shards[n].push(row); } }
    count++;
  }
  return { shards, count };
}
function write(entries, outDir) {
  const { shards, count } = build(entries);
  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  shards.forEach((rows, n) => { const text = JSON.stringify(rows); bytes += text.length; fs.writeFileSync(path.join(outDir, n + '.json'), text); });
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ version: 1, shards: SHARDS, entries: count, source: 'JMdict (EDRDG, CC BY-SA 4.0)' }));
  return { entries: count, bytes };
}
module.exports = { build, write, shardOf, compact, SHARDS };

if (require.main === module) {
  const [source, out] = process.argv.slice(2);
  if (!source) { console.error('usage: node site/tools/build-web-dict.cjs <jmdict.json> [out folder]'); process.exit(2); }
  const dest = out || path.join(__dirname, '..', 'public', 'dict', 'v1');
  const entries = JSON.parse(fs.readFileSync(source, 'utf8'));
  const result = write(entries, dest);
  console.log(`${result.entries} entries, ${SHARDS} files, ${(result.bytes / 1e6).toFixed(1)} MB written to ${dest}`);
}
