/* SPDX-License-Identifier: GPL-3.0-or-later */
/* megulit.com /me/ service worker. It keeps the page shell so /me/ opens instantly and offline; the synced data lives in
   IndexedDB (assets/js/me-store.mjs) and the dictionary shards in their own cache (assets/js/me-dict.mjs, never touched here).
   API calls go to api.megulit.com / cn-api.megulit.com, other origins, so they are never intercepted.
   Bump VERSION with every change to a precached file: the new worker precaches the new set and the old cache is dropped. */
const VERSION = 'me-v1';
const PRECACHE = [
  '/me/', '/me/manifest.webmanifest',
  '/assets/css/site.css', '/assets/css/me.css',
  '/assets/js/me-boot.js', '/assets/js/me.js', '/assets/js/me-core.mjs', '/assets/js/me-store.mjs', '/assets/js/me-api.mjs', '/assets/js/me-dict.mjs', '/assets/js/me-i18n.mjs',
  '/assets/img/logo-360.webp', '/assets/img/me-192.png', '/assets/img/me-512.png', '/favicon-32.png', '/apple-touch-icon.png',
  '/assets/fonts/cormorant-italic.woff2?v=1ea903835d', '/assets/fonts/plex-mono.woff2?v=a586e0a3f4', '/assets/fonts/han-serif-hero.woff2?v=dfe4d6db28', '/assets/fonts/megulit-serif.woff2?v=3e722a376f'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => Promise.all(PRECACHE.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('me-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  /* the page: network first so a new version shows up, the cached copy when offline */
  if (request.mode === 'navigate' && url.pathname.startsWith('/me/')) {
    event.respondWith(fetch(request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(c => c.put('/me/', copy)); } return response; }).catch(() => caches.match('/me/')));
    return;
  }
  /* the shell: from the cache, which holds one consistent set (modules of different versions never mix) */
  if (url.pathname.startsWith('/assets/') || url.pathname === '/me/manifest.webmanifest' || url.pathname === '/favicon-32.png' || url.pathname === '/apple-touch-icon.png') {
    event.respondWith(caches.match(request, { ignoreSearch: false }).then(hit => hit || caches.match(url.pathname).then(byPath => byPath || fetch(request))));
  }
});
