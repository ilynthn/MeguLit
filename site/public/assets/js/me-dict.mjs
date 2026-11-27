// SPDX-License-Identifier: GPL-3.0-or-later
/* megulit.com /me/: the JMdict shards (/dict/v1/<n>.json, built by site/tools/build-web-dict.cjs). One file per first
   character bucket, fetched when a word is tapped and kept in the Cache API, so every word looked up once works offline.
   loadShard(n) → array, or null when the dictionary is not installed / not reachable and not cached. */
import { SHARDS } from './me-core.mjs';
export const DICT_CACHE = 'megulit-dict-v1', DICT_URL = '/dict/v1/';
const memory = new Map(), MAX_MEMORY = 16;
async function cached() { try { return await caches.open(DICT_CACHE); } catch { return null; } }
export async function loadShard(n) {
  if (memory.has(n)) { const v = memory.get(n); memory.delete(n); memory.set(n, v); return v; }
  const url = DICT_URL + n + '.json', cache = await cached();
  let response = cache ? await cache.match(url) : null;
  if (!response) {
    try { response = await fetch(url); } catch { return null; }
    if (!response.ok) return null;
    if (cache) try { await cache.put(url, response.clone()); } catch { /* quota */ }
  }
  let shard; try { shard = await response.json(); } catch { return null; }
  if (!Array.isArray(shard)) return null;
  memory.set(n, shard); while (memory.size > MAX_MEMORY) memory.delete(memory.keys().next().value);
  return shard;
}
/* 「下载完整离线词典」: every shard into the cache, a few at a time; onProgress(done,total) */
export async function downloadAll(onProgress = () => {}, signal) {
  const cache = await cached(); if (!cache) throw new Error('NO_CACHE');
  let done = 0; const queue = Array.from({ length: SHARDS }, (_, i) => i);
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const n = queue.shift(), url = DICT_URL + n + '.json';
      if (!await cache.match(url)) { const r = await fetch(url, { signal }); if (r.ok) await cache.put(url, r); }
      onProgress(++done, SHARDS);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
export async function cachedCount() { const cache = await cached(); return cache ? (await cache.keys()).length : 0; }
export async function clearDict() { memory.clear(); try { await caches.delete(DICT_CACHE); } catch { /* none */ } }
