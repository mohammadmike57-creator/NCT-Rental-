
const CACHE_NAME = 'nct-rental-cache-v5';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^18.2.0',
  'https://aistudiocdn.com/react-dom@^18.2.0/client',
  'https://aistudiocdn.com/firebase@^12.5.0/app',
  'https://aistudiocdn.com/firebase@^12.5.0/auth',
  'https://aistudiocdn.com/firebase@^12.5.0/firestore',
  'https://aistudiocdn.com/jspdf@^3.0.3',
  'https://aistudiocdn.com/jspdf-autotable@^5.0.2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching core assets');
        return cache.addAll(URLS_TO_CACHE);
      })
      .catch(err => {
        console.error('Failed to open cache or add URLs:', err);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  const url = new URL(event.request.url);

  // Use a Network First, falling back to Cache strategy for app shell and scripts.
  // This ensures users get the latest updates when online.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.match(/\.(js|css|tsx|jsx)$/)) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // If the fetch is successful, cache the new response for offline use.
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If the network fails, serve the asset from the cache.
          console.log(`Network fetch failed for ${event.request.url}, serving from cache.`);
          return caches.match(event.request).then(response => {
              return response || caches.match('/'); // Fallback to root if specific page isn't cached
          });
        })
    );
    return;
  }

  // Use a Stale-While-Revalidate strategy for other assets (e.g., CDN scripts, fonts, images).
  // This serves assets from the cache for speed but updates them in the background.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
        // Return cached response if available, otherwise wait for network.
        return response || fetchPromise;
      });
    })
  );
});


// Listener for incoming push notifications from a server
self.addEventListener('push', event => {
  let data = { title: 'NCT Rental', body: 'You have a new notification.' };
  try {
    if (event.data) {
        data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
        data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/images/icons/icon-192.png',
    badge: '/images/icons/icon-192.png',
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Listener for when a user clicks on a notification
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If a window is already open, focus it.
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window.
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
