/* Nocturna · service worker: app offline + caché de teselas */
const V = 'nocturna-v2';
const SHELL = ['./', 'index.html', 'app.js', 'astro.js', 'astronomy.browser.min.js', 'leaflet.js', 'leaflet.css', 'satellite.min.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const TILES = 'nocturna-tiles', MAX_TILES = 3000;
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim())));
const isTile = u => /ign\.es\/wmts|opentopomap|arcgisonline|tile\.openstreetmap/.test(u);
const isFont = u => /fonts\.(googleapis|gstatic)\.com/.test(u);
self.addEventListener('fetch', e => {
  const u = e.request.url;
  if (e.request.method !== 'GET') return;
  if (isTile(u) || isFont(u)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const r = await fetch(e.request);
        if (r.ok || r.type === 'opaque') { c.put(e.request, r.clone()); trim(c); }
        return r;
      } catch { return hit || Response.error(); }
    }));
    return;
  }
  if (new URL(u).origin === location.origin) {
    // red primero para recoger actualizaciones; caché si no hay conexión
    e.respondWith(fetch(e.request).then(r => { const cl = r.clone(); caches.open(V).then(c => c.put(e.request, cl)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  const keys = await c.keys();
  if (keys.length > MAX_TILES) for (const k of keys.slice(0, keys.length - MAX_TILES)) await c.delete(k);
  trimming = false;
}
