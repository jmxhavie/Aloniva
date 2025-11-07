const CACHE_NAME = 'aloniva-v8';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/pages/shop.html',
  '/pages/bestsellers.html',
  '/pages/collections.html',
  '/pages/routine-builder.html',
  '/pages/checkout-whatsapp.html',
  '/pages/trust.html',
  '/pages/ingredients.html',
  '/pages/formula-builder.html',
  '/pages/faq.html',
  '/pages/support.html',
  '/pages/offers.html',
  '/styles.css',
  '/script.js',
  '/data/ingredients.js',
  '/data/products.js',
  '/data/blogs.json',
  '/tools/formula-builder.js',
  '/tools/formula-calculators.js',
  '/tools/formula-validators.js',
  '/tools/formula-db.js',
  '/tools/formula-exporters.js',
  '/tools/formula-templates.js',
  '/tools/checkout-whatsapp.js',
  '/tools/routine-builder.js',
  '/tools/routine-rules.js',
  '/tools/cart.js',
  '/tools/search.js',
  '/assets/icon-beaker.svg',
  '/assets/icon-library.svg',
  '/assets/nivera-logo.svg',
  '/404.html',
  '/blog/',
  ];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try { await self.registration.navigationPreload.enable(); } catch {}
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Strategy: network-first for navigations; stale-while-revalidate for static assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Navigations (HTML)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put('/' + (url.pathname.replace(/^\/+/, '') || ''), copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('/404.html') || caches.match('/index.html')))
    );
    return;
  }

  const CDN_HOSTS = [
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com'
  ];

  // Static assets (CSS/JS/images/json)
  const isStatic = url.origin === location.origin && (/\.(?:css|js|png|jpg|jpeg|webp|avif|svg|json)$/i).test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // CDN resources
  if (CDN_HOSTS.some(host => req.url.startsWith(host))) {
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          caches.open(CACHE_NAME).then(c => c.put(req, res.clone())).catch(()=>{});
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Fallback: cache-first
  event.respondWith(caches.match(req).then(r => r || fetch(req)));
});
