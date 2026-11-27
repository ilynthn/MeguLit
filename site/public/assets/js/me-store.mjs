// SPDX-License-Identifier: GPL-3.0-or-later
/* megulit.com /me/: the local copy of the synced records, in IndexedDB (database megulit-me).
   meta:    {k, v}                       session token, cursors, last sync, profile
   records: {id: kind + '\0' + key, kind, key, data}   live records only; a tombstone deletes the row
   Everything the page shows comes from here, so it works offline. Signing out empties it. */
const NAME = 'megulit-me', VERSION = 1;
let opening = null;
function open() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' }).createIndex('kind', 'kind');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error); };
  });
  return opening;
}
const done = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
const wrap = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

export async function getMeta(k) { const db = await open(); const row = await wrap(db.transaction('meta').objectStore('meta').get(k)); return row ? row.v : undefined; }
export async function setMeta(k, v) { const db = await open(); const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ k, v }); await done(tx); }
export async function delMeta(k) { const db = await open(); const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').delete(k); await done(tx); }
export async function allData(kind) {
  const db = await open();
  const rows = await wrap(db.transaction('records').objectStore('records').index('kind').getAll(kind));
  return rows.map(r => r.data);
}
export async function allRows(kind) {
  const db = await open();
  return wrap(db.transaction('records').objectStore('records').index('kind').getAll(kind));
}
/* the store shape syncKinds() wants */
export const store = {
  cursor: async kind => Number(await getMeta('cursor:' + kind)) || 0,
  setCursor: (kind, n) => setMeta('cursor:' + kind, n),
  async apply(kind, records) {
    const db = await open(), tx = db.transaction('records', 'readwrite'), os = tx.objectStore('records');
    for (const r of records) {
      const id = kind + '\0' + r.key;
      if (r.deleted || !r.data) os.delete(id); else os.put({ id, kind, key: r.key, data: r.data });
    }
    await done(tx);
  },
  async clear(kind) {
    const db = await open(), tx = db.transaction('records', 'readwrite'), os = tx.objectStore('records');
    const keys = await wrap(os.index('kind').getAllKeys(kind));
    for (const key of keys) os.delete(key);
    await done(tx);
  }
};
export async function wipeAll() {
  const db = await open(), tx = db.transaction(['meta', 'records'], 'readwrite');
  tx.objectStore('meta').clear(); tx.objectStore('records').clear();
  await done(tx);
}
