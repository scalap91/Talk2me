/**
 * Talk2Me — NOTE LECTEUR d'une page-entité (M3, Pascal 2026-07-08).
 * GET  /api/cards/{id}/rate  (public) → résumé fiabilité { fiable, douteux, score, myVote, reports, flagged }.
 * POST /api/cards/{id}/rate  (auth)   body { value: 1 | -1 | 0 } → vote (0 = retire) → résumé à jour.
 * Clé = entityRef (le vote porte sur l'ENTITÉ, partagée par tous les partages).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { entityRefFromCardId } from '@/lib/cards/engine/resolve-ref';
import { rateEntity, getRatingSummary } from '@/lib/cards/engine/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Params) {
  const { id } = await ctx.params;
  const me = getCurrentUserFromRequest(req);
  const ref = entityRefFromCardId(id);
  return NextResponse.json(getRatingSummary(ref, me?.id));
}

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const raw = Number(body?.value);
  const value: 1 | -1 | 0 = raw === 1 ? 1 : raw === -1 ? -1 : 0;
  const ref = entityRefFromCardId(id);
  rateEntity(ref, me.id, value);
  return NextResponse.json(getRatingSummary(ref, me.id));
}
