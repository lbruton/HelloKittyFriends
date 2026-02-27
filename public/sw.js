const CACHE_NAME = 'melody-v2.2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/images/melody-avatar.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

// Install — pre-cache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — network-only for API/data, stale-while-revalidate for static
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-only for API calls and user data
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) {
    return;
  }

  // Stale-while-revalidate for static assets
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response.ok) {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    )
  );
});
