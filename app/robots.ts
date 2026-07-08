/**
 * robots.txt généré par Next 16 (aucun fichier physique). SEO Platform Core — Module.
 * Autorise le contenu PUBLIC (pages-entités, boutiques, profils) ; bloque le privé
 * (conversations, profil perso, admin, panier…) et l'API. Doctrine PII air-gap.
 */
import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://talk2me.fr';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/card/', '/b/', '/u/', '/legal', '/infos'],
        disallow: [
          '/api/',
          '/c/', // conversations privées (jamais indexées)
          '/friends', '/discussions',
          '/profile', '/drafts', '/saved-cards', '/trash', '/notifications',
          '/wallet', '/appareils', '/loyers',
          '/admin', '/schema',
          '/shop/panier', '/shop/adresse', '/shop/messages', '/shop/historique',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
