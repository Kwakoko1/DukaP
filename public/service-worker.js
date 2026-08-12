const CACHE_NAME = 'dukapos-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Skip dev server API calls, websocket connections, and chrome-extension schemes
  if (event.request.url.includes('/socket.io/') || event.request.url.includes('chrome-extension')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // If offline and request is page navigation, return index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        })
    })
  );
});

// Native Background Sync API Event Handler
self.addEventListener('sync', (event) => {
  if (event.tag === 'dukapos-sync-queue') {
    event.waitUntil(
      fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Background-Sync': 'true' },
        body: JSON.stringify({ trigger: 'sw-background-sync', timestamp: Date.now() })
      }).then(() => {
        console.info('[ServiceWorker] Background sync queue flush completed successfully.');
      }).catch((err) => {
        console.warn('[ServiceWorker] Background sync queue flush postponed:', err);
      })
    );
  }
});
