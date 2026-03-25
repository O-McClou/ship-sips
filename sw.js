/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Ship-Sips PWA
   ─────────────────────────────────────────────────────────────────
   Cache-Version ship-sips-v48:
   FIX V48 F7: manifest.json in ASSETS ergänzt (war zuvor nicht
   gecacht – führte im Offline-Betrieb zu fehlender Manifest-Datei).
   FIX V48.5: iOS Share-Bug behoben (title/text entfernt), Word-Export ergänzt, jsPDF CDN-Fallback –
   Alle navigator.share()-Aufrufe nur noch mit files:[] – kein title/text mehr.
   Cache-Name auf v48-4 aktualisiert.
   skipWaiting() bleibt aktiv damit der neue Cache sofort greift.
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'ship-sips-v48-5'; /* V48.3: Cache-Name an APP_VERSION V48.3 angeglichen */

const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './jspdf.umd.min.js'  /* FIX V48 PDF-Offline: lokale jsPDF-Bibliothek cachen */
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

      // [PUNKT-C] Freundliche Offline-Seite (statt plain-text Fallback)
      return cached ? cached : networkFetch.then(r => r || new Response(
        `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline – Ship-Sips</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #06101E;
      color: #e8eaf0;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.5rem;
      text-align: center;
    }
    .icon { font-size: 4rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.4rem; color: #4f9eff; margin-bottom: 1rem; }
    p { font-size: 1rem; line-height: 1.6; max-width: 360px; margin-bottom: 0.5rem; }
    .lang-en { color: #a0aec0; font-size: 0.9rem; margin-bottom: 2rem; }
    button {
      background: #4f9eff;
      color: #06101E;
      border: none;
      border-radius: 0.75rem;
      padding: 0.75rem 2rem;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      margin-top: 0.5rem;
    }
    button:active { opacity: 0.8; }
  </style>
</head>
<body>
  <div class="icon">⚓</div>
  <h1>Keine Verbindung</h1>
  <p>Die App muss einmalig mit Internet geöffnet werden, damit sie offline funktioniert.</p>
  <p class="lang-en">No connection – the app needs to be opened once with internet to work offline.</p>
  <button onclick="location.reload()">🔄 Neu laden</button>
</body>
</html>`,
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
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
