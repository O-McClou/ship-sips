/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Getränke-Tracker PWA  (V47)
   ─────────────────────────────────────────────────────────────────
   NOTFALL-FIX:
   Nach einem fehlerhaften Deploy (rekursiver onerror-Handler) war
   der alte Cache blockiert. Die App fror im PWA-Modus sofort ein,
   weil der neue SW nie aktiviert wurde (kein skipWaiting).

   EINMALIGE MASSNAHME – tracker-v47-fix:
   skipWaiting() im Install-Handler sorgt dafür, dass dieser SW
   sofort übernimmt, den alten kaputten Cache löscht und die
   korrigierte index.html ausliefert.

   NORMALE UPDATE-STRATEGIE (nach diesem Fix wiederhergestellt):
   ① install  → index.html cachen + sofort skipWaiting()
   ② activate → alte Caches löschen, clients.claim()
   ③ Fetch    → Cache-First mit Hintergrund-Update
   ④ SKIP_WAITING-Message bleibt als Fallback für künftige Updates
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'tracker-v47-fix';

const ASSETS = [
  './index.html'
];

/* ── Install: cachen + SOFORT übernehmen (Notfall-Bypass) ─────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())   /* ← Notfall: sofort übernehmen */
      .catch(err => {
        console.warn('[SW] Cache-Fehler beim Install:', err);
        self.skipWaiting(); /* auch bei Cache-Fehler übernehmen */
      })
  );
});

/* ── Activate: alle alten Caches löschen, Clients sofort übernehmen */
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

/* ── Fetch: Cache-First, Netz im Hintergrund aktualisieren ─────── */
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

/* ── Message-Handler ────────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
