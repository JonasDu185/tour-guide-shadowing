/* Service worker — 离线缓存 + 自动更新 */

const CACHE = 'tour-guide-v3';

// 安装后立即激活，不等待旧 SW 释放
self.addEventListener('install', event => {
  self.skipWaiting();
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

// 激活时清空旧缓存，夺取所有客户端
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API 请求走网络优先
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // JS / CSS 走网络优先（确保不卡在旧缓存），失败时 fallback
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 其他静态资源走缓存优先
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request)
    )
  );
});
