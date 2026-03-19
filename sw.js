/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Getränke-Tracker PWA  (V48)
   ─────────────────────────────────────────────────────────────────
   FIX V48:
   V47 hatte eine Endlos-Reload-Schleife:
     Install → skipWaiting() → controllerchange → location.reload()
     → Install → skipWaiting() → controllerchange → reload → …
   Das ließ die App im PWA-Modus sofort einfrieren.

   LÖSUNG:
   ① skipWaiting() beim Install bleibt für den Erststart (Cache-Aufbau).
   ② In index.html reagiert controllerchange nur noch auf Reload wenn
      window._swUpdateRequested === true (gesetzt nur durch swUpdateApply()).
   ③ So startet ein normaler App-Start KEINE Reload-Schleife mehr.

   NORMALE UPDATE-STRATEGIE:
   ① install  → index.html cachen + skipWaiting() (nur beim Erststart harmlos)
   ② activate → alte Caches löschen, clients.claim()
   ③ Fetch    → Cache-First mit Hintergrund-Update
   ④ SKIP_WAITING-Message für künftige Updates via Update-Banner
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'tracker-v48';

const ASSETS = [
  './index.html'
];

/* ── Install: cachen + SOFORT übernehmen (nur beim Erststart) ─ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => {
        /* FIX V48: skipWaiting() nur wenn noch kein Client läuft.
           Bei laufender App würde ein sofortiges skipWaiting() den
           iOS-IndexedDB-Zugriff unterbrechen und die App einfrieren.
           Beim echten Erststart (keine Clients) ist es sicher. */
        return self.clients.matchAll({type:'window'}).then(clients => {
          if(clients.length === 0){
            return self.skipWaiting();
          }
          // Sonst wartet der SW auf explizites SKIP_WAITING vom Update-Banner
        });
      })
      .catch(err => {
        console.warn('[SW] Cache-Fehler beim Install:', err);
        // Beim Erststart (kein Client) trotzdem übernehmen
        return self.clients.matchAll({type:'window'}).then(clients => {
          if(clients.length === 0) return self.skipWaiting();
        });
      })
  );
});

/* ── Activate: alte Caches löschen; claim() verzögert damit
      iOS-IndexedDB-Initialisierung nicht unterbrochen wird ─────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Lösche alten Cache:', k);
          return caches.delete(k);
        })
      ))
      /* FIX V48: clients.claim() erst nach kurzem Delay.
         Sofortiges claim() auf iOS kann einen laufenden IndexedDB-
         Öffnungs-Request der App abwürgen → App friert ein. */
      .then(() => new Promise(resolve => setTimeout(resolve, 200)))
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
