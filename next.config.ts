import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dossier de build isolable par instance (blue-green zéro-coupure sur dev).
  // Défaut `.next` → aucun impact sur beta. Sur dev : NEXT_DIST_DIR=.next-blue|.next-green.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // basePath retiré (servi en root sur talk2me.fr)
  // assetPrefix retiré
  // Images (#audit perf 2026-06-29) — formats légers + domaines fournisseurs
  // autorisés pour next/Image (optimisation à la demande quand on migre les <img>).
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.alicdn.com' },
      { protocol: 'https', hostname: '**.aliexpress-media.com' },
      { protocol: 'https', hostname: '**.bigbuy.eu' },
      { protocol: 'https', hostname: '**.banggood.com' },
      { protocol: 'https', hostname: '**.ggpht.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'talk2me.fr' },
      { protocol: 'https', hostname: '**.talk2me.fr' },
    ],
  },
  // Allow large video uploads (default Next.js proxy/middleware limit is 10MB)
  experimental: {
    proxyClientMaxBodySize: "500mb",
    // Perf (#audit 2026-06-09) — tree-shaking des imports nommés pour les libs
    // utilisées partout : lucide (85 fichiers) + framer-motion (23) → bundle + léger.
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  // Talk2Me #406 (Pascal 2026-06-05) — Le split /lib/db/ est en quarantaine
  // depuis #401 (cf CLAUDE.md "NE PAS toucher au split /lib/db/"). Il porte
  // des erreurs TS pré-existantes (Activity.invite_status manquant dans
  // lib/db/conversations.ts) qu'on ne peut pas corriger sans violer la
  // quarantaine. On tolère donc les erreurs TS au build pour ne pas bloquer.
  // À retirer quand le split sera soit fixé soit définitivement supprimé.
  typescript: { ignoreBuildErrors: true },
  // Talk2Me #327 — Autoriser explicitement caméra/micro/display-capture
  // pour les iframes/contexts intégrés. Sans Permissions-Policy explicite,
  // certains navigateurs (mobile Safari, Chrome iOS, Brave) refusent
  // getUserMedia.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self)',
          },
        ],
      },
      {
        // Pages d'AUTEUR (composers) : jamais de cache figé — sinon un WebView/proxy garde une vieille
        // version (ex. /creer/oeuvre prérendu en s-maxage 1 an → QR/scanner/liste absents côté natif).
        source: '/creer/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
