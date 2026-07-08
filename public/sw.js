const CACHE = 'rpg-arena-v2';
const STATIC_EXT = /\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$/;

const ASSETS = [
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
  // Only cache static assets — never intercept navigation (HTML) requests
  if (STATIC_EXT.test(url.pathname)) {
    e.respondWith(cacheFirst(e.request));
  }
  // Navigation (/ , /index.html, etc.) passes through normally — no SW delay
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
