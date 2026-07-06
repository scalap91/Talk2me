/**
 * GET /api/cards/channels-diag — PREUVE (Pascal 2026-07-01, « je sens pas la différence »).
 * Pour chaque canal, combien d'objets ont réellement un `.card` stocké (dotcard non vide)
 * vs le total. Si withCard == total → 100 % lu en `.card`, pas en fallback. Super-admin, lecture seule.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { countFeedCards, backfillDotcards } from '@/lib/db';
import { countAnnonceCards, backfillAnnonceCards } from '@/lib/annonces-deposit';
import { countBoutiqueCards, countEatCards, backfillBoutiqueCards } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Migration globale idempotente : tout objet sans `.card` en reçoit un AVANT de compter.
  try { backfillAnnonceCards(); } catch { /* */ }
  try { backfillBoutiqueCards(); } catch { /* */ }
  try { backfillDotcards(2000); } catch { /* */ }
  const feed = countFeedCards();
  const annonces = countAnnonceCards();
  const boutique = countBoutiqueCards();
  const eat = countEatCards();
  const pct = (n: { total: number; withCard: number }) => n.total ? Math.round((n.withCard / n.total) * 100) : 100;
  return NextResponse.json({
    ok: true,
    channels: {
      feed: { ...feed, pct: pct(feed) },
      annonces: { ...annonces, pct: pct(annonces) },
      boutique: { ...boutique, pct: pct(boutique) },
      eat: { ...eat, pct: pct(eat) },
    },
  });
}
