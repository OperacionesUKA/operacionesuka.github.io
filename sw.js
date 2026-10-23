// Guarda la pantalla de inicio y el ícono para que la app abra rápido y se pueda instalar.
// También recibe los avisos de Firebase cuando la app está cerrada.
const VERSION = 'uka-v10';
// Lo indispensable para abrir sin conexión; las animaciones se guardan aparte (si una falla, no detiene lo demás).
const BASICOS = ['./', 'index.html', 'offline.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const ESPERA_RED = 3000;
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest', 'firebase-config.js', 'offline.js', 'icon-192.png', 'icon-512.png', 'carga-40.svg', 'carga-familia.svg', 'carga-papas.svg', 'carga-papa-hijo.svg', 'carga-mama-hija.svg', 'carga-v1-familia.svg', 'carga-v1-papas.svg', 'carga-v1-papa-hijo.svg', 'carga-v1-mama-hija.svg'];

try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js', 'firebase-config.js');
  if (self.UKA_FIREBASE && String(self.UKA_FIREBASE.apiKey).indexOf('PEGA_AQUI') < 0) {
    firebase.initializeApp(self.UKA_FIREBASE);
    firebase.messaging();
  }
} catch (e) { }

// Se guarda archivo por archivo: si uno no se puede descargar, los demás sí quedan guardados.
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(ARCHIVOS.map(function (a) { return c.add(a).catch(function () { }); }));
  }).then(function () { return self.skipWaiting(); }));
});

// Al activar, solo se borran las versiones anteriores si la nueva ya tiene la portada (si no, se conservan como respaldo).
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(BASICOS.map(function (a) { return c.match(a); }));
  }).then(function (r) {
    const completa = r.every(function (x) { return !!x; });
    return caches.keys().then(function (ks) {
      if (!completa) return null;
      return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    });
  }).then(function () { return self.clients.claim(); }));
});

function deGuardado(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (r) {
    if (r || req.mode !== 'navigate') return r;
    return caches.match('./').then(function (x) { return x || caches.match('index.html', { ignoreSearch: true }); });
  });
}

// Primero intenta con internet. Si no hay red, o la red tarda más de 3 segundos y el archivo ya está guardado, usa lo guardado
// (la descarga sigue y actualiza lo guardado para la siguiente vez).
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  const req = e.request;
  const red = fetch(req).then(function (r) {
    if (r && r.ok) { const copia = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); }
    return r;
  });
  e.respondWith(new Promise(function (listo) {
    let hecho = false;
    const dar = function (r) { if (!hecho && r) { hecho = true; listo(r); } };
    const reloj = setTimeout(function () { deGuardado(req).then(dar); }, ESPERA_RED);
    red.then(function (r) { clearTimeout(reloj); dar(r); }).catch(function () {
      clearTimeout(reloj);
      deGuardado(req).then(function (r) { if (r) dar(r); else if (!hecho) { hecho = true; listo(Response.error()); } });
    });
  }));
  e.waitUntil(red.catch(function () { }));
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
