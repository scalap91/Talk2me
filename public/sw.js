// Service worker Talk2Me — PWA NETWORK-FIRST SÛR (Pascal 2026-07-28).
//
// But : rendre l'app installable sur Chrome/Edge (leur bouton « Installer » exige un SW
// avec handler `fetch`) + un secours hors-ligne, SANS jamais reservir de HTML périmé.
//
// GARDE-FOUS (leçon des anciens SW qui cassaient la nav — cf feedback_sw_redirect_about_blank) :
//  1. NAVIGATIONS = NETWORK-FIRST. On va TOUJOURS chercher le réseau ; on ne sert le secours
//     hors-ligne QUE si le réseau échoue. → jamais de bundle périmé, jamais de page qui « prend le dessus ».
//  2. Une réponse `redirected:true` est REFUSÉE par le navigateur pour une navigation (→ about:blank).
//     On la reconstruit en Response propre.
//  3. Statique IMMUABLE (URLs hashées : /_next/static, /icons, /brand, /fonts) = cache-first (jamais
//     périmé par construction) → vrai shell hors-ligne + vitesse. Tout le reste (API…) = passthrough natif.
//  4. CACHE_NAME bumpé à CHAQUE déploiement (script) → l'`activate` purge l'ancien cache.
const CACHE_NAME = 'talk2me-v1874';
const PRECACHE = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
const STATIC_RE = /\/(?:_next\/static|icons|brand|fonts)\//;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(PRECACHE.map((u) => cache.add(u))); // un échec ne bloque pas l'install
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT… → jamais touchés
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiers → natif

  // 1) NAVIGATIONS : network-first, secours hors-ligne, redirections reconstruites.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.redirected) {
          // Reconstruit pour effacer le flag `redirected` (sinon about:blank sur une navigation).
          return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
        }
        return res;
      } catch (_) {
        const off = await caches.match('/offline');
        return off || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) STATIQUE IMMUABLE : cache-first (URLs hashées → jamais périmé).
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) { const c = await caches.open(CACHE_NAME); c.put(req, res.clone()); }
        return res;
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  // 3) Le reste (API, etc.) : passthrough natif, le SW ne s'en mêle pas.
});
