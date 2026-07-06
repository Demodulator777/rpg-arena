const CACHE = 'rpg-arena-v1';
const STATIC_EXT = /\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$/;

const ASSETS = [
  '/',
  '/index.html',
  '/tournaments.html',
  '/admin/panel.html',
  '/css/style.css',
  '/css/dungeon.css',
  '/css/tournaments.css',
  '/css/brokentournaments.css',
  '/js/app.js',
  '/js/dungeon.js',
  '/js/skills-tree.js',
  '/js/tournaments.js',
  '/js/brokentournaments.js',
  '/admin/panel.js',
  '/admin/banner.js',
  '/admin/rewards.js',
  '/admin/oldpanel.js',
  '/images/logo/logo.png',
];

function cacheKey(url) {
  const u = new URL(url);
  return u.origin + u.pathname;
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(ASSETS.map(a => {
        const req = new Request(a, { credentials: 'same-origin' });
        return fetch(req).then(res => {
          if (res.ok) return cache.put(cacheKey(req.url), res);
        }).catch(() => {});
      }))
    )
  );
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

  const path = url.pathname;

  if (STATIC_EXT.test(path)) {
    e.respondWith(cacheFirst(e.request));
  } else if (path === '/' || path === '/index.html' || path === '/tournaments.html') {
    e.respondWith(networkFirst(e.request));
  }
});

async function cacheFirst(req) {
  const key = cacheKey(req.url);
  const cached = await caches.match(key);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const clone = res.clone();
      const cache = await caches.open(CACHE);
      cache.put(key, clone);
    }
    return res;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(req) {
  const key = cacheKey(req.url);
  try {
    const res = await fetch(req);
    if (res.ok) {
      const clone = res.clone();
      const cache = await caches.open(CACHE);
      cache.put(key, clone);
    }
    return res;
  } catch {
    const cached = await caches.match(key);
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}
