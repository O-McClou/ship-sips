/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Getränke-Tracker PWA  (V47)
   ─────────────────────────────────────────────────────────────────
   Update-Strategie (professionell / nutzergesteuert):
   ① install  → Assets cachen, KEIN skipWaiting()
                → neuer SW bleibt im "waiting"-Zustand
   ② App-Seite erkennt registration.waiting
                → zeigt persistentes Gold-Banner
   ③ Nutzer klickt "Jetzt laden"
                → sendet SKIP_WAITING → SW übernimmt
   ④ controllerchange-Event → location.reload()
                → App startet sauber aus neuem Cache
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'tracker-v47';
const ASSETS = [
  './index.html',
  './manifest.json',
  './sw.js',
  './icon-192.png',
  './icon-512.png'
];

/* ── Install: alle Assets cachen, dann WARTEN ──────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      /* ↓ KEIN self.skipWaiting() hier!
           Der neue SW wartet, bis der Nutzer das Banner bestätigt.  */
      .catch(err => console.warn('[SW] Cache-Fehler beim Install:', err))
  );
});

/* ── Activate: alte Caches löschen, Clients übernehmen ─────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
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
