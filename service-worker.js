'use strict';
/* Caches only static app files (same-origin GET). Personal data lives in IndexedDB and never passes through here.
   To ship an update: change CACHE below; old caches are deleted on activate. */
const CACHE = 'tracker-v13';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'db.js', 'extra.js', 'extra2.js', 'extra3.js', 'extra4.js', 'extra5.js', 'manifest.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/alt-sunset.png', 'icons/alt-graphite.png', 'icons/alt-mint.png', 'icons/alt-notes.png', 'icons/alt-calc.png', 'icons/icon-512.png', 'vendor/chart.umd.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Stale-while-revalidate; offline navigation falls back to the cached shell.
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    return hit || net;
  }));
});
