// Service worker Talk2Me — KILL-SWITCH (Pascal 2026-07-05).
//
// HISTORIQUE : les versions précédentes interceptaient la navigation. Un fetch()
// de SW suit les redirections → réponse redirected:true refusée par le navigateur
// pour une navigation → about:blank ; et d'anciens SW servaient une page en cache
// (ex. /live) pour TOUTES les URLs. Ça a coûté des heures.
//
// DÉCISION : plus de service worker du tout. Ce fichier ne fait QUE se
// désenregistrer et purger tous les caches. Résultat : navigation 100% native,
// jamais d'about:blank, jamais de page qui « prend le dessus ». (Un SW propre,
// push-only et qui ne touche JAMAIS aux navigations, pourra être ré-ajouté plus
// tard si besoin — cf. [[feedback_sw_redirect_about_blank]].)
const CACHE_NAME = 'talk2me-v1198'; // bumpé à chaque déploiement → force le navigateur à re-télécharger CE fichier

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k))); // purge TOUT le cache
    } catch (_) { /* noop */ }
    try { await self.registration.unregister(); } catch (_) { /* noop */ } // se désenregistre
    try {
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach((c) => { try { c.navigate(c.url); } catch (_) { /* noop */ } }); // recharge chaque onglet → repart sans SW
    } catch (_) { /* noop */ }
  })());
});

// Aucun handler 'fetch' : le SW ne touche à RIEN. Les navigations et les assets
// passent en direct par le navigateur.
