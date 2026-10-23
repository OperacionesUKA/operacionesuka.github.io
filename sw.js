/* Pídele · Service worker: guarda la app para abrir rápido y muestra las notificaciones con la app cerrada. */
const VERSION = 'pidele-v2.7.0';
const COMPARTIDO = 'pidele-compartido'; // comprobante que llega desde "Compartir" de otra app
const BASE = ['./', './index.html', './manifest.json', './firebase-config.js', './icons/icon-192.png', './icons/icon-512.png'];

/* ---------- Notificaciones (Firebase Cloud Messaging) ---------- */
try {
  importScripts('./firebase-config.js');
  if (self.FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey) {
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp(FIREBASE_CONFIG);
    firebase.messaging().onBackgroundMessage(p => mostrar(p.data || {}));
  }
} catch (e) { /* sin Firebase: la app sigue funcionando con actualizaciones al abrirla */ }

function mostrar(d) {
  return self.registration.showNotification(d.titulo || 'Pídele', {
    body: d.cuerpo || '', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    tag: d.tag || undefined, renotify: !!d.tag, vibrate: [200, 100, 200], data: { url: d.url || './' }
  });
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    const abierta = l.find(c => c.url.startsWith(self.registration.scope));
    if (abierta) { abierta.postMessage({ abrir: url }); return abierta.focus(); }
    return clients.openWindow(url);
  }));
});

/* ---------- Caché de la app ---------- */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== COMPARTIDO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/*
 * - Archivos de la app: se responden AL INSTANTE desde la caché y se actualizan por detrás
 *   (antes se esperaba a la red, lo que hacía lenta la apertura con mala señal).
 * - Librerías con versión fija (mapas, Firebase): caché primero, nunca cambian.
 * - Servidor, mapas (teselas), imágenes de Drive: siempre a la red.
 */
self.addEventListener('fetch', e => {
  // "Compartir" desde la app del banco (Android con Pídele instalada): se guarda el archivo y se abre la app
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/compartir')) {
    e.respondWith((async () => {
      try {
        const f = await e.request.formData();
        const a = f.getAll('archivo').find(x => x && x.size) || null;
        if (a) {
          const c = await caches.open(COMPARTIDO);
          await c.put('./compartido-archivo', new Response(a, { headers: { 'Content-Type': a.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(a.name || 'comprobante') } }));
        }
      } catch (err) { /* sin archivo: la app avisa */ }
      return Response.redirect(new URL('./?compartido=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  const propio = u.origin === self.location.origin;
  const libreria = u.hostname === 'cdnjs.cloudflare.com' || (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/'));
  if (libreria) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
      return res;
    })));
    return;
  }
  if (!propio) return;
  const red = fetch(e.request).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
    return res;
  });
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true })
      .then(r => r || red)
      .catch(() => caches.match('./index.html'))
  );
  e.waitUntil(red.catch(() => { }));
});
