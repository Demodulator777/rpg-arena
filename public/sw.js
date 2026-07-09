const CACHE = 'rpg-arena-v3';
const STATIC_EXT = /\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$/;

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (STATIC_EXT.test(url.pathname)) {
    e.respondWith(staleWhileRevalidate(e.request));
  }
});

async function staleWhileRevalidate(req) {
  const key = req.url;
  const cached = await caches.match(key);
  const fetchPromise = fetch(req).then(res => {
    if (res.ok) {
      const clone = res.clone();
      caches.open(CACHE).then(cache => cache.put(key, clone));
    }
    return res;
  });
  // Return cached immediately if available, otherwise wait for network
  if (cached) return cached;
  return fetchPromise;
}
