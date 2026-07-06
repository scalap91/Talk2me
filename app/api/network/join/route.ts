/**
 * Talk2Me — Devenir contributeur (Pascal 2026-06-20).
 * POST /api/network/join { ref?, country?, region?, city?, quartier? }
 *   ref = id du parrain (celui dont le lien a amené l'user) → downline.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { becomeContributor, getContributorStats } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { ref?: string; country?: string; region?: string; city?: string; quartier?: string } = {};
  try { body = await req.json(); } catch { /* corps vide ok */ }
  const ref = typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim() : null;
  becomeContributor(me.id, ref, {
    country: body.country || null, region: body.region || null, city: body.city || null, quartier: body.quartier || null,
  });
  return NextResponse.json({ ok: true, stats: getContributorStats(me.id) });
}
