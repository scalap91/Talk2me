/**
 * Talk2Me — SIGNALEMENT d'une page-entité (M3, Pascal 2026-07-08).
 * POST /api/cards/{id}/report  (auth) body { reason, note? } → enregistre le signalement
 * (file de modération M4) → { ok, flagged }. Clé = entityRef.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { entityRefFromCardId } from '@/lib/cards/engine/resolve-ref';
import { reportEntity, getRatingSummary } from '@/lib/cards/engine/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

const REASONS = new Set(['faux', 'trompeur', 'spam', 'offensant', 'autre']);

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason || 'autre').toLowerCase();
  if (!REASONS.has(reason)) return NextResponse.json({ error: 'bad_reason' }, { status: 400 });
  const note = String(body?.note || '');
  const ref = entityRefFromCardId(id);
  reportEntity(ref, me.id, reason, note);
  const summary = getRatingSummary(ref, me.id);
  return NextResponse.json({ ok: true, flagged: summary.flagged });
}
