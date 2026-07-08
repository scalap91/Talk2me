/**
 * sitemap.xml dynamique (Next 16). SEO Platform Core — Module.
 * GROUNDED : n'expose que du VRAI contenu public (cards publiées non supprimées).
 * Rien d'inventé, rien de privé. Cap MVP à 5000 URLs (un sitemap = 50k max).
 */
import type { MetadataRoute } from 'next';
import { getDb } from '@/lib/db-core';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://talk2me.fr';
const MAX = 5000;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/legal`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  let cards: MetadataRoute.Sitemap = [];
  try {
    const rows = getDb()
      .prepare(
        `SELECT id, created_at FROM direct_cards
           WHERE deleted_at IS NULL AND archived_at IS NULL
           ORDER BY created_at DESC LIMIT ?`,
      )
      .all(MAX) as { id: string; created_at: number }[];
    cards = rows.map((c) => ({
      url: `${BASE}/card/${c.id}`,
      lastModified: new Date(c.created_at || Date.now()),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch {
    /* DB indispo au build → sitemap statique seul */
  }

  return [...staticPages, ...cards];
}
