/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Getränke-Tracker PWA  (V47)
   ─────────────────────────────────────────────────────────────────
   Cache-Version tracker-v47-fix3:
   Erzwingt erneuten Cache-Bust nach Entfernung des fehlerhaften
   window.onerror-Handlers, der die App einfrieren ließ.
   skipWaiting() bleibt aktiv damit der neue Cache sofort greift.
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'tracker-v47-fix3';

const ASSETS = [
  './index.html'
];

/* ── Install: cachen + sofort übernehmen ──────────────────────── */
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

/* ── Activate: alle alten Caches löschen ──────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Lösche alten Cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: Cache-First, Netz im Hintergrund ──────────────────── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => null);

      return cached ? cached : networkFetch.then(r => r || new Response(
        'Offline – bitte App neu starten',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      ));
    })
  );
});

/* ── Message-Handler ──────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
