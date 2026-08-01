const CACHE_NAME = 'stockop-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install Event
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate Event (clears old caches)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// Fetch Event (Network First, fallback to cache for HTML, cache first for assets)
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    // For page navigations (HTML), try network first to always get the latest version!
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    // For other assets, try cache first
    e.respondWith(
      caches.match(e.request).then((response) => response || fetch(e.request))
    );
  }
});
