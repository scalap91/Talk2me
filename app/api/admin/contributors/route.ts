/**
 * Talk2Me — Super-Admin : PONT vers les contributeurs (Pascal 2026-06-21).
 * GET  → liste des contributeurs + échelon auto + droits ouverts/attendus.
 * POST { user_id, action: 'open' | 'close' | 'nominate_validateur' | 'revoke_validateur' }
 *   → ouvre/ferme les droits du rang ; nomme/retire le droit NEUTRE `curation_validateur`.
 * Super-admin only (nomination gouvernance = staff-only, anti-capture).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listContributorsForAdmin, openRankRights, closeAllRights } from '@/lib/contributor-rights';
import { setPermission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, contributors: listContributorsForAdmin() });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { user_id?: string; action?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.user_id) return NextResponse.json({ error: 'user_id_required' }, { status: 400 });
  // Nomination / retrait du droit NEUTRE `curation_validateur` (staff-only, signé au nom de l'admin).
  if (b.action === 'nominate_validateur' || b.action === 'revoke_validateur') {
    const grant = b.action === 'nominate_validateur';
    if (!setPermission(b.user_id, 'curation_validateur', grant, me.id)) return NextResponse.json({ error: 'bad_permission' }, { status: 400 });
    return NextResponse.json({ ok: true, validateur: grant });
  }
  const res = b.action === 'close' ? closeAllRights(b.user_id) : openRankRights(b.user_id, me.id);
  if (!res.ok) return NextResponse.json({ error: 'not_contributor' }, { status: 404 });
  return NextResponse.json({ ok: true, granted: res.granted });
}
