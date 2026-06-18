const CACHE = 'masama-v8';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js',
  '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Network-first para archivos principales: siempre descarga la versión más nueva
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ||
      url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first para el resto (CDN libs, etc.)
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() =>
    caches.match('/index.html')
  )));
});

// ──────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS — recibe payloads del servidor y los muestra
// ──────────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'MAS AMA', body: 'Tienes una nueva notificación', extra: {} };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) { /* texto plano */ }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'masama-default',
    data: data.extra || {},
    requireInteraction: data.requireInteraction || false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Si la app ya está abierta, focusearla
      for (const client of list) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.postMessage({ type: 'notification-click', url: targetUrl });
          return client.focus();
        }
      }
      // Si no, abrirla
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
