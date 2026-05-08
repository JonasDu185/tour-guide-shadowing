/* Minimal service worker for PWA offline caching */

const CACHE = 'tour-guide-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        '/',
        '/css/style.css',
        '/js/common.js',
        '/js/home.js',
        '/js/reading.js',
        '/js/shadowing.js',
        '/scenic.html',
        '/manifest.json',
      ])
    )
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API 请求走网络优先，失败时 fallback 到缓存
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 静态资源走缓存优先
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request)
    )
  );
});
