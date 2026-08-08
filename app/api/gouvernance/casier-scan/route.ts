/**
 * Talk2Me — SCAN « l'échelle qui descend » (Pascal 2026-08-08). Staff-only.
 * GET            → PREVIEW (dry-run) : ce que les seuils du casier FERAIENT (rouge→gel, orange→avert, vert→rétablit).
 * POST {apply:true} → APPLIQUE réellement (gel/dégel auto, signé « système »). Réservé staff.
 * Montre les seuils AVANT d'activer (demande de Pascal). Réutilise applyCasierConsequence.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listContributorsForAdmin } from '@/lib/contributor-rights';
import { applyCasierConsequence, listAutoFrozenIds, type CasierOutcome } from '@/lib/casier-enforce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function scan(dryRun: boolean): CasierOutcome[] {
  const rows = listContributorsForAdmin() as { user_id: string; display_name: string | null; username: string }[];
  const byId = new Map(rows.map((r) => [r.user_id, r.display_name || r.username]));
  // Contributeurs actifs + ceux déjà gelés auto (pour pouvoir les dégeler quand ils repassent au vert).
  const ids = new Set<string>([...rows.map((r) => r.user_id), ...listAutoFrozenIds()]);
  return [...ids]
    .map((uid) => ({ ...applyCasierConsequence(uid, { dryRun }), name: byId.get(uid) || uid }))
    .filter((o) => o.action !== 'none')
    .sort((a, b) => b.score - a.score);
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const preview = scan(true);
  return NextResponse.json({ ok: true, dry_run: true, thresholds: { orange: 4, red: 10 }, outcomes: preview });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { apply?: boolean } = {};
  try { b = await req.json(); } catch { /* vide */ }
  if (!b.apply) return NextResponse.json({ ok: false, reason: 'apply_manquant' });
  const applied = scan(false); // AGIT réellement
  return NextResponse.json({ ok: true, dry_run: false, applied });
}
