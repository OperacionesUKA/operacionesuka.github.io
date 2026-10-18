// Guarda la pantalla de inicio y el ícono para que la app abra rápido y se pueda instalar.
// También recibe los avisos de Firebase cuando la app está cerrada.
const VERSION = 'uka-v9';
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest', 'firebase-config.js', 'offline.js', 'icon-192.png', 'icon-512.png', 'carga-40.svg', 'carga-familia.svg', 'carga-papas.svg', 'carga-papa-hijo.svg', 'carga-mama-hija.svg', 'carga-v1-familia.svg', 'carga-v1-papas.svg', 'carga-v1-papa-hijo.svg', 'carga-v1-mama-hija.svg'];

try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js', 'firebase-config.js');
  if (self.UKA_FIREBASE && String(self.UKA_FIREBASE.apiKey).indexOf('PEGA_AQUI') < 0) {
    firebase.initializeApp(self.UKA_FIREBASE);
    firebase.messaging();
  }
} catch (e) { }

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Primero intenta con internet; si no hay, usa lo guardado.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    const copia = r.clone();
    caches.open(VERSION).then(function (c) { c.put(e.request, copia); });
    return r;
  }).catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('index.html'); }); }));
});

// Al tocar un aviso mostrado con la app abierta, abre (o enfoca) la app. Los de Firebase los abre Firebase.
self.addEventListener('notificationclick', function (e) {
  const d = e.notification.data || {};
  if (d.FCM_MSG) return;
  e.notification.close();
  const liga = d.liga || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ws) {
    for (let i = 0; i < ws.length; i++) { if ('focus' in ws[i]) return ws[i].focus(); }
    return self.clients.openWindow(liga);
  }));
});
