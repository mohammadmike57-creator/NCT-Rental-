// Retired. An earlier build registered this worker and served the site from a
// cache that never expired. This version removes itself and its caches so the
// browser goes back to loading the live site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window' });
    windows.forEach(w => w.navigate(w.url));
  })());
});
