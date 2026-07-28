/**
 * Talk2Me — Circuit de litige (Pascal 2026-07-27). Séparation des pouvoirs :
 *  POST action:'open'     { subject_id, reason, escrow_id? }        → une partie ouvre un litige.
 *  POST action:'instruct' { litige_id, report }                     → LE CHEF (rang≥3 ou gouvernance) instruit (rapport signé).
 *  POST action:'decide'   { litige_id, refund_type, sanction_level?, note } → LE VALIDATEUR décide (neutre). Sanction=record ; remboursement NON exécuté (gaté).
 *  GET → { open:[à instruire si chef], instructed:[à trancher si validateur] } enrichis des noms.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getDb } from '@/lib/db';
import { getContributor } from '@/lib/network';
import { openLitige, instructLitige, decideLitige, listOpen, listInstructed, type Litige, type RefundType } from '@/lib/litige';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidateur(me: { id: string; email?: string | null }): boolean {
  return isAiOpsAdmin(me.id, me.email) || hasPermission(me.id, me.email || '', 'curation_validateur');
}
function isChef(me: { id: string; email?: string | null }): boolean {
  if (isValidateur(me)) return true; // le staff/validateur peut aussi instruire (hors le juge-et-partie, bloqué au moteur)
  try { const c = getContributor(me.id); return !!c && c.level_rank >= 3; } catch { return false; }
}
const nameOf = (id: string | null): string => {
  if (!id) return '—';
  try { const u = getDb().prepare('SELECT display_name, username FROM users WHERE id = ?').get(id) as { display_name?: string; username?: string } | undefined; return (u?.display_name || u?.username || 'Utilisateur'); } catch { return 'Utilisateur'; }
};
const enrich = (l: Litige) => ({ ...l, subject_name: nameOf(l.subject_id), opener_name: nameOf(l.opened_by), chef_name: nameOf(l.chef_id) });

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const chef = isChef(me), val = isValidateur(me);
  if (!chef && !val) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, is_chef: chef, is_validateur: val, open: chef ? listOpen().map(enrich) : [], instructed: val ? listInstructed().map(enrich) : [] });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { action?: string; subject_id?: string; reason?: string; escrow_id?: string | null; litige_id?: string; report?: string; refund_type?: string; sanction_level?: number | null; note?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  if (b.action === 'open') {
    const r = openLitige(me.id, String(b.subject_id || ''), String(b.reason || ''), b.escrow_id ?? null);
    return r.ok ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (b.action === 'instruct') {
    if (!isChef(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const r = instructLitige(String(b.litige_id || ''), me.id, String(b.report || ''));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error, message: r.error === 'juge_et_partie' ? 'Tu ne peux pas instruire un litige qui te vise ou que tu as ouvert.' : undefined }, { status: 400 });
  }
  if (b.action === 'decide') {
    if (!isValidateur(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const rt = (['none', 'partial', 'full'].includes(String(b.refund_type)) ? b.refund_type : 'none') as RefundType;
    const r = decideLitige(String(b.litige_id || ''), me.id, rt, { sanctionLevel: b.sanction_level ?? null, note: b.note });
    return r.ok ? NextResponse.json({ ok: true, note: 'Décision enregistrée + sanction (record). Remboursement NON exécuté — money gaté.' }) : NextResponse.json({ error: r.error, message: r.error === 'juge_et_partie' ? 'Un validateur ne tranche pas un litige qu’il a instruit ou qui le vise.' : undefined }, { status: 400 });
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
