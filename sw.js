/* ═══════════════════════════════════════════════════════════════════
   sw.js – Service Worker für Getränke-Tracker PWA  (V52)
   ─────────────────────────────────────────────────────────────────
   ENDGÜLTIGE ROOT-CAUSE-ANALYSE:

   Problem A – Der _swUpdateRequested-Guard war falsch:
   ─────────────────────────────────────────────────────
   Wir hatten in index.html:
     controllerchange → if(_swUpdateRequested) reload()
   Das sollte eine Reload-Schleife verhindern. ABER:
   - Neuer SW aktiviert sich (skipWaiting) → controllerchange
   - _swUpdateRequested ist false → KEIN Reload
   - Alte kaputte index.html bleibt geladen
   - Neuer SW läuft, aber mit alter Seite → app bleibt eingefroren
   - Nächstes Öffnen: alter SW cached HTML wird serviert → Banner wieder da

   Eine Reload-Schleife entsteht gar nicht, weil:
   Gleiche sw.js-Bytes → kein neues Install-Event → kein skipWaiting
   → kein controllerchange → kein erneuter Reload. ✓
   Der Guard war also unnötig UND schädlich.

   Problem B – cache.addAll() cached ggf. stale HTML von GitHub CDN:
   ──────────────────────────────────────────────────────────────────
   Wenn GitHub Pages noch alte index.html ausliefert, landet diese
   im SW-Cache. Auch nach Reload serviert der SW dann alte HTML.

   LÖSUNG V52:
   ① index.html wird NICHT in install gecacht (kein cache.addAll)
   ② Fetch-Handler: Network-First für HTML mit 8s-Timeout
      → immer aktuell, Fallback auf Cache wenn offline
   ③ controllerchange in index.html: KEIN Guard mehr
      → Reload passiert genau einmal nach SW-Update, dann nie wieder
   ④ Alle anderen Assets: Cache-First (wie bisher)
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'tracker-v52';

/* ── Install: nur SW registrieren, KEIN HTML-Cachen ─────────────── */
/* index.html wird beim ersten Fetch gecacht (Network-First),        */
/* damit immer die aktuelle Version von GitHub geladen wird.         */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

/* ── Activate: alte Caches löschen ──────────────────────────────── */
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

/* ── Hilfsfunktionen ─────────────────────────────────────────────── */
function isHtmlRequest(request) {
  const url = request.url;
  return url.endsWith('/') || url.endsWith('.html') ||
         url.endsWith('/index.html') ||
         (!url.includes('.') && !url.includes('?'));
}

function fetchWithTimeout(request, ms) {
  return Promise.race([
    fetch(request.clone ? request.clone() : request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SW fetch timeout')), ms)
    )
  ]);
}

function offlinePage() {
  return new Response(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Tracker – Offline</title>
<style>
  body{font-family:Georgia,serif;background:#06101E;color:#EDE4CC;
       display:flex;flex-direction:column;align-items:center;
       justify-content:center;min-height:100vh;margin:0;text-align:center;
       padding:20px;box-sizing:border-box}
  h1{color:#C9A84C;font-size:22px;margin-bottom:10px}
  p{color:#8DAFC8;font-size:14px;line-height:1.6;margin-bottom:24px}
  button{background:#C9A84C;color:#06101E;border:none;padding:14px 28px;
         border-radius:10px;font-family:Georgia,serif;font-size:16px;
         font-weight:bold;cursor:pointer;touch-action:manipulation}
</style>
</head>
<body>
  <h1>⚓ Keine Verbindung</h1>
  <p>Der Tracker konnte nicht geladen werden.<br>
  Bitte stelle eine Internetverbindung her<br>und tippe auf Neu laden.</p>
  <button onclick="location.reload()">↺ Neu laden</button>
</body>
</html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/* ── Fetch ────────────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith((async () => {
    try {
      /* ── HTML: Network-First ──────────────────────────────────────
         Immer aktuellste index.html von GitHub holen.
         Nur bei Netz-Fehler/Timeout → Cache-Fallback. */
      if (isHtmlRequest(event.request)) {
        try {
          const networkResponse = await fetchWithTimeout(event.request, 8000);
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, clone);
          }
          return networkResponse;
        } catch (_) {
          /* Netz-Timeout oder offline → Cache-Fallback */
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return offlinePage();
        }
      }

      /* ── Alles andere: Cache-First ────────────────────────────── */
      const cached = await caches.match(event.request);
      if (cached) {
        /* Hintergrund-Update */
        event.waitUntil(
          fetchWithTimeout(event.request, 8000)
            .then(resp => {
              if (resp && resp.status === 200 && resp.type === 'basic')
                caches.open(CACHE_NAME).then(c => c.put(event.request, resp));
            })
            .catch(() => {})
        );
        return cached;
      }

      /* Nicht gecacht → Netz */
      try {
        const resp = await fetchWithTimeout(event.request, 8000);
        if (resp && resp.status === 200 && resp.type === 'basic') {
          caches.open(CACHE_NAME).then(c => c.put(event.request, resp.clone()));
        }
        return resp;
      } catch (_) {
        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

    } catch (err) {
      /* Absoluter Fallback – respondWith() darf NIE rejecten (WebKit-Bug) */
      console.warn('[SW] Fetch-Fehler:', err);
      return offlinePage();
    }
  })());
});

/* ── Message-Handler ─────────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
