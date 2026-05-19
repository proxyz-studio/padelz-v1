const BUILD_ID = '__BUILD_ID__';
const CACHE = `padelz-v${BUILD_ID}`;
const APP_SHELL = ['/', '/leaderboard', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  // skipWaiting must be inside waitUntil so the new worker doesn't activate
  // until the app shell is cached. Otherwise on slow networks the worker
  // can promote with an empty cache, the activate handler then deletes the
  // old cache, and the user is left with nothing.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('/api/') || req.url.includes('/_next/')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    })
  );
});
