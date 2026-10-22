// NCT Rental service worker.
// It exists only for push notifications. It deliberately does NOT cache the
// app: every visit loads the latest deployed version straight from the server,
// so phones never get stuck on an old build. Older versions of this worker
// cached the site; activating this one clears those caches.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', event => {
  let data = { title: 'NCT Rental', body: 'You have a new notification.' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(data.title || 'NCT Rental', {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) if ('focus' in client) return client.focus();
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
