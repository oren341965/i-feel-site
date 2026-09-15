const CACHE = 'ifeel-mcohome-v1';
const APP_SHELL = [
  './mcohome-offline.html',
  './mcohome-app.js',
  './mcohome-manifest.webmanifest',
  './mcohome-icon.svg',
  './portal.css',
  './portal.js',
  '/assets/ifeel-logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && url.pathname.endsWith('/staff-expenses/mcohome.php')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('./mcohome-offline.html'))
    );
    return;
  }

  if (url.pathname.indexOf('/staff-expenses/') !== -1 || url.pathname.indexOf('/assets/ifeel-logo.png') !== -1) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});
