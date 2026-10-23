// sw.js - Holy Fitness service worker.
// Deliberately tiny and safe: it only shows a friendly offline page when a page can't load.
// Everything else (scripts, styles, plans, the API) always goes straight to the network, so
// people can never get stuck on an old version of the app or see stale health data.
const CACHE = 'hf-offline-v1';
const OFFLINE = ['/offline.html', '/assets/logo-reversed.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (new URL(req.url).pathname === '/assets/logo-reversed.svg') {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});
