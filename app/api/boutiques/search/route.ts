/**
 * GET /api/boutiques/search?q=&browse=1
 * Recherche de boutiques sur les DEUX tables réelles (Pascal 2026-07-03) :
 *   - `boutiques`        (riche / dropship, talktome.db) → /boutique/[slug]
 *   - `boutiques_perso`  (légère / perso, boutiques.db)  → /b/[public_key]
 * Avant : la Recherche cherchait dans les posts « shop » → les vraies boutiques
 * n'apparaissaient jamais. Ici on interroge les tables directement.
 * browse=1 (ou q vide) → liste toutes les boutiques (« vide = tout »).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { commerceDb } from '@/lib/commerce-dbs';
import { isShopSectionEnabled } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BoutiqueHit { id: string; name: string; subtitle: string | null; href: string; source: 'rich' | 'light'; }

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // « Section OFF → coupé PARTOUT » (Pascal 2026-08-13) : la Recherche doit être cohérente avec
  // les interrupteurs. Boutique désactivée → la Recherche ne remonte AUCUNE boutique.
  if (!isShopSectionEnabled('boutique')) return NextResponse.json({ boutiques: [] });

  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  const browse = request.nextUrl.searchParams.get('browse');
  if (!q && !browse) return NextResponse.json({ boutiques: [] });
  const like = `%${q.toLowerCase()}%`;
  const hits: BoutiqueHit[] = [];

  // Le multi-boutiques (table `boutiques`) a été supprimé (Pascal 2026-07-03 : un seul
  // Shop Shein, pas de mini-boutiques dropship). La recherche = boutiques LÉGÈRES seules.
  // Boutiques LÉGÈRES (boutiques.db), kind = boutique.
  try {
    const db = commerceDb('boutique');
    const rows = (q
      ? db.prepare(`SELECT id, name, description, category, public_key FROM boutiques_perso WHERE kind = 'boutique' AND lower(name) LIKE ? ORDER BY created_at DESC LIMIT 30`).all(like)
      : db.prepare(`SELECT id, name, description, category, public_key FROM boutiques_perso WHERE kind = 'boutique' ORDER BY created_at DESC LIMIT 30`).all()
    ) as { id: string; name: string; description: string | null; category: string | null; public_key: string | null }[];
    for (const r of rows) hits.push({ id: r.id, name: r.name, subtitle: r.description || r.category, href: r.public_key ? `/b/${r.public_key}` : `/ma-boutique/${r.id}`, source: 'light' });
  } catch { /* base absente → on ignore */ }

  return NextResponse.json({ boutiques: hits });
}
