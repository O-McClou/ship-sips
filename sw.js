/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Getränke-Tracker PWA  (V49)
   ─────────────────────────────────────────────────────────────────
   WURZELPROBLEM (rückwirkend analysiert):
   V47 hatte eine Endlos-Reload-Schleife:
     Install → skipWaiting() → controllerchange → location.reload() → …

   V48-FIX WAR FALSCH:
   skipWaiting() nur wenn clients.length === 0 → auf einem iPhone läuft
   IMMER ein Client → skipWaiting() feuerte NIE → alter kaputter SW blieb
   für immer in Kontrolle → alte kaputte index.html wurde ewig serviert.

   RICHTIGER FIX V49:
   ① skipWaiting() IMMER in install (wie V47) – damit der neue SW die
      Kontrolle übernimmt und seine frische, korrekte index.html serviert.
   ② Der einmalige Reload durch controllerchange (aus alter index.html)
      ist gewollt – er lädt die neue index.html.
   ③ Die neue index.html (V49) hat den Guard:
        if(window._swUpdateRequested) window.location.reload();
      → controllerchange in der neuen index.html löst KEINEN Reload aus.
      → Schleife ist dauerhaft gebrochen.

   UPDATE-STRATEGIE (stabil ab V49):
   ① install  → index.html cachen + skipWaiting() sofort
   ② activate → alte Caches löschen, clients.claim() (mit 200ms Delay)
   ③ fetch    → Cache-First mit Netz-Hintergrund-Update
   ④ SKIP_WAITING-Message für künftige Updates via Update-Banner
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'tracker-v50';

const ASSETS = [
  './',
  './index.html'
];

/* ── Install: cachen + sofort übernehmen ───────────────────────── */
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

/* ── Activate: alte Caches löschen, dann claim() ──────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Lösche alten Cache:', k);
          return caches.delete(k);
        })
      ))
      /* 200ms Delay vor claim(): gibt iOS Zeit, IndexedDB-Verbindungen
         zu stabilisieren bevor der SW die Kontrolle übernimmt. */
      .then(() => new Promise(resolve => setTimeout(resolve, 200)))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: Cache-First, Netz im Hintergrund aktualisieren ─────── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  /* FIX V50: URL normalisieren – iOS PWA startet mit "/" (Verzeichnis),
     nicht mit "/index.html". Ohne diese Normalisierung findet caches.match()
     keinen Eintrag → networkFetch → bei Offline friert die App ein. */
  let requestUrl = event.request.url;
  if (requestUrl.endsWith('/')) {
    requestUrl += 'index.html';
  }

  event.respondWith(
    caches.match(requestUrl).then(cached => {
      const networkFetch = fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(requestUrl, clone));
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
