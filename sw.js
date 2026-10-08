// Guarda en el dispositivo los mosaicos del mapa ya vistos: la segunda vez cargan al instante y también sin internet.
const NOMBRE = 'lc-mapa-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = e.request.url;
  if (e.request.method !== 'GET' || !/tile.openstreetmap.(org|fr)/.test(u)) return;
  e.respondWith(caches.open(NOMBRE).then(async (c) => {
    const hit = await c.match(e.request); if (hit) return hit;
    try { const r = await fetch(e.request); if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; } catch (err) { return hit || Response.error(); }
  }));
});
