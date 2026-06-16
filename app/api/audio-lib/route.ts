/**
 * /api/audio-lib — sert le catalogue de musiques libres de droits.
 *
 * Talk2Me #420. Le client GET /api/audio-lib?category=chill (ou sans param
 * pour tout). Lecture directe de /public/audio-lib/index.json.
 *
 * Lazy-load par catégorie côté client pour éviter de payer 30 entries au
 * boot — utile si on grossit le catalogue.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readFileSync } from 'fs';

const INDEX_PATH = process.cwd() + '/public/audio-lib/index.json';

const VALID_CATEGORIES = new Set([
  'chill',
  'energetic',
  'dramatic',
  'lofi',
  'ambient',
]);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LibEntry {
  id: string;
  name: string;
  category: string;
  duration_sec: number;
  file: string;
  thumbnail?: string;
  source: string;
  license: string;
  bpm?: number;
  mood?: string;
}

function loadIndex(): LibEntry[] {
  try {
    const raw = readFileSync(INDEX_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  const all = loadIndex();
  if (category) {
    if (!VALID_CATEGORIES.has(category)) {
      return NextResponse.json({ tracks: [], categories: [...VALID_CATEGORIES] });
    }
    return NextResponse.json({
      tracks: all.filter((t) => t.category === category),
      categories: [...VALID_CATEGORIES],
    });
  }

  // Sans filtre : on renvoie la liste des catégories + leurs comptes seulement,
  // pour le boot léger. Le client demande ?category=xxx pour les tracks.
  const counts: Record<string, number> = {};
  for (const t of all) {
    counts[t.category] = (counts[t.category] || 0) + 1;
  }

  return NextResponse.json({
    categories: [...VALID_CATEGORIES],
    counts,
    total: all.length,
  });
}
