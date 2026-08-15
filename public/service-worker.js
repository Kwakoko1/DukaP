const ASSET_CACHE_NAME = 'kwakopos-assets-v2.1.0';
const DATA_CACHE_NAME = 'kwakopos-product-payloads'; // CRITICAL: NEVER DROP THIS

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons.svg',
  '/kwakopos-logo.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // CRITICAL FIX: Only target old structural asset caches, bypass data caches completely
          if (
            cache !== ASSET_CACHE_NAME &&
            cache !== DATA_CACHE_NAME &&
            (cache.startsWith('kwakopos-assets-') || cache.startsWith('dukapos-cache-') || cache.startsWith('kwakopos-cache-'))
          ) {
            console.log('[ServiceWorker] Clearing deprecated system asset layout:', cache);
            return caches.delete(cache);
          }
          return Promise.resolve(false);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip websockets, chrome extensions, socket.io, and backend admin maintenance endpoints
  if (
    url.pathname.includes('/socket.io/') ||
    url.protocol === 'chrome-extension:' ||
    url.pathname.startsWith('/api/admin/')
  ) {
    return;
  }

  // 1. API Product & Sync Data Caching Strategy (Network First -> Stale While Revalidate in DATA_CACHE_NAME)
  if (
    url.pathname.startsWith('/api/products') ||
    url.pathname.startsWith('/api/sync/') ||
    url.pathname.startsWith('/api/categories') ||
    url.pathname.startsWith('/api/brands')
  ) {
    event.respondWith(
      fetch(request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(DATA_CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            }).catch(() => {});
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ success: false, offline: true, error: 'Offline - data unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // 2. Static Assets Strategy (Cache First -> Network Fallback)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Background revalidation
        fetch(request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(ASSET_CACHE_NAME).then((cache) => {
              cache.put(request, networkRes);
            }).catch(() => {});
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(ASSET_CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          }).catch(() => {});
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

// Native Background Sync API Event Handler with Web Locks Isolation
self.addEventListener('sync', (event) => {
  if (event.tag === 'dukapos-sync-queue') {
    event.waitUntil(
      navigator.locks && navigator.locks.request
        ? navigator.locks.request('sw_background_sync_lock', async () => {
            console.info('[ServiceWorker] Background Sync Lock Acquired (sw_background_sync_lock).');
            try {
              const res = await fetch('/api/sync/push', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json', 
                  'X-Background-Sync': 'true',
                  'X-Bypass-Replica': 'true'
                },
                body: JSON.stringify({ trigger: 'sw-background-sync', timestamp: Date.now() })
              });
              if (res.ok) {
                console.info('[ServiceWorker] Background sync queue flush completed successfully.');
              }
            } catch (err) {
              console.warn('[ServiceWorker] Background sync queue flush postponed:', err);
            }
          })
        : fetch('/api/sync/push', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'X-Background-Sync': 'true',
              'X-Bypass-Replica': 'true'
            },
            body: JSON.stringify({ trigger: 'sw-background-sync', timestamp: Date.now() })
          }).then(() => {
            console.info('[ServiceWorker] Background sync queue flush completed successfully.');
          }).catch((err) => {
            console.warn('[ServiceWorker] Background sync queue flush postponed:', err);
          })
    );
  }
});
