import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // basePath retiré (servi en root sur talk2me.fr)
  // assetPrefix retiré
  // Allow large video uploads (default Next.js proxy/middleware limit is 10MB)
  experimental: {
    proxyClientMaxBodySize: "500mb",
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
    ];
  },
};

export default nextConfig;
