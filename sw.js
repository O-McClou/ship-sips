/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Getränke-Tracker PWA  (V46 fixed)
   ─────────────────────────────────────────────────────────────────
   • Erste Installation: alle Assets cachen
   • Cache-First: sofortiger Start aus Cache
   • Update-Erkennung: NUR beim activate-Event (neuer SW übernimmt)
     → kein False-Positive mehr bei jedem Fetch
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'tracker-v46';
const ASSETS = [
  './index.html',
  './manifest.json',
  './sw.js',
  './icon-192.png',
  './icon-512.png'
];

/* ── Install: alle Assets cachen ───────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => {
        console.warn('[SW] Cache-Fehler beim Install:', err);
        return self.skipWaiting();
      })
  );
});

/* ── Activate: alte Caches löschen + Clients über Update informieren ─ */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      const oldCaches = keys.filter(k => k !== CACHE_NAME);
      // Wenn alte Caches vorhanden: das ist ein echtes Update (nicht erste Installation)
      const isUpdate = oldCaches.length > 0;
      return Promise.all(oldCaches.map(k => caches.delete(k)))
        .then(() => self.clients.claim())
        .then(() => {
          // Nur bei echtem Update benachrichtigen, nicht bei erster Installation
          if (isUpdate) {
            return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
              clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
            });
          }
        });
    })
  );
});

/* ── Fetch: Cache-First, Netz im Hintergrund aktualisieren ─────── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Cache aktualisieren (still im Hintergrund, kein Update-Toast!)
      const networkFetch = fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => null);

      // Aus Cache bedienen + Netz im Hintergrund
      return cached ? cached : networkFetch.then(r => r || new Response(
        'Offline – bitte App neu starten',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      ));
    })
  );
});

/* ── Message-Handler ────────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
