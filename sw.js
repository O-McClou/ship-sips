/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Getränke-Tracker PWA
   Strategie: Cache-First mit Hintergrund-Update (Stale-While-Revalidate)
   ─────────────────────────────────────────────────────────────────────
   • Erste Installation: alle Assets in den Cache laden (einmalig online)
   • Danach: sofortiger Start aus dem Cache – offline, immer
   • Update: neue Version im Hintergrund laden → beim nächsten Start aktiv
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
        // Einzelne fehlende Icons etc. dürfen den SW nicht blockieren
        console.warn('[SW] Cache-Fehler beim Install (ggf. Icons fehlen):', err);
        return self.skipWaiting();
      })
  );
});

/* ── Activate: alte Cache-Versionen löschen ─────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: Cache-First mit Netz-Fallback ─────────────────────── */
self.addEventListener('fetch', event => {
  // Nur GET-Anfragen; API-Calls, POST etc. durchlassen
  if (event.request.method !== 'GET') return;

  // chrome-extension:// und andere Schemata ignorieren
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Immer zuerst den Cache liefern (sofortiger Start)
      const networkFetch = fetch(event.request)
        .then(response => {
          // Erfolgreiche Netz-Antwort → Cache aktualisieren
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => null);

      // Wenn im Cache: sofort zurück + Hintergrund-Update
      if (cached) {
        // Hintergrund-Update starten (kein await – fire-and-forget)
        networkFetch.then(freshResponse => {
          if (freshResponse) {
            // Dem Client mitteilen dass ein Update verfügbar ist
            self.clients.matchAll().then(clients => {
              clients.forEach(client => client.postMessage({ type: 'SW_UPDATE_AVAILABLE' }));
            });
          }
        });
        return cached;
      }

      // Nicht im Cache: Netz versuchen
      return networkFetch.then(r => r || new Response('Offline – bitte App neu starten', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }));
    })
  );
});

/* ── Message-Handler: Client kann SW-Update erzwingen ────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
