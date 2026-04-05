const CACHE_NAME = 'station-ziz-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/konnach.html',
  '/style.css',
  '/app.js',
  '/konnach.js',
  '/security.js',
  '/manifest.json'
];

// Install: Cache files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Serve from cache, then network
self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Don't cache API calls - they have their own fallback in app.js
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        // Option: cache new successful requests for later (optional)
        return networkResponse;
      });
    })
  );
});
