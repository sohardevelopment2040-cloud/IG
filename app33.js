/* Service Worker — منظومة متابعة المبادرات */
const VERSION = 'initiatives-mobile-v3';
const CORE = [
  './',
  './index.html',
  './app.js',
  './storage.js',
  './manifest.json',
];
// مكتبات خارجية يعتمد عليها البرنامج — تُخزَّن لتعمل المنظومة بدون إنترنت
const CDN = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    // فشل أي مكتبة خارجية (مثلاً بلا إنترنت) لا يمنع التثبيت
    await Promise.all(CDN.map(async url => {
      try {
        const res = await fetch(new Request(url, { mode: 'no-cors' }));
        await cache.put(url, res);
      } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // طلبات البيانات إلى السيرفر لا تُخزَّن أبداً
  if (url.origin === self.location.origin && url.pathname.includes('/api/')) return;

  // الصفحات: الشبكة أولاً ثم النسخة المخزنة
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match(req, { ignoreSearch: true })) ||
               (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // بقية الملفات (محلية وخارجية): من المخزن فوراً مع تحديثه في الخلفية
  if (url.protocol.startsWith('http')) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })());
  }
});
