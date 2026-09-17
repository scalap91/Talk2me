/**
 * Talk2Me — API indisponibilité / négligence (Pascal 2026-09-16, Phase 2). Voir [[project_talk2me_petition_anticapture]].
 *  GET  → { ok, mine:{on_leave,until_at}, negligence:[mes marques], leaves:[staff seulement] }
 *  POST { action:'declare', until_at, reason? }  → je me déclare indisponible (effet immédiat).
 *  POST { action:'end' }                         → je reviens.
 *  POST { action:'lift_negligence', id }         → STAFF : retirer une marque (absence justifiée reconnue).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { declareLeave, endLeave, onLeave, listLeaves, listNegligenceFor, liftNegligence } from '@/lib/governance-sla';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const staff = isAiOpsAdmin(me.id, me.email);
  return NextResponse.json({
    ok: true,
    mine: { on_leave: onLeave(me.id) },
    negligence: listNegligenceFor(me.id),
    leaves: staff ? listLeaves() : [],
  });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { action?: string; until_at?: number; reason?: string; id?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  if (b.action === 'declare') {
    const until = Number(b.until_at) || 0;
    if (until <= Date.now()) return NextResponse.json({ error: 'bad_date', message: 'Choisis une date de fin dans le futur.' }, { status: 400 });
    declareLeave(me.id, String(b.reason || ''), until);
    return NextResponse.json({ ok: true, message: 'Indisponibilité enregistrée. Tu ne prendras aucune marque de négligence pendant cette période (le staff contrôle après coup).' });
  }
  if (b.action === 'end') { endLeave(me.id); return NextResponse.json({ ok: true, message: 'Te revoilà disponible.' }); }
  if (b.action === 'lift_negligence') {
    if (!isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden', message: 'Réservé au staff.' }, { status: 403 });
    const ok = liftNegligence(String(b.id || ''), me.id);
    return NextResponse.json({ ok, message: ok ? 'Marque retirée.' : 'Introuvable ou déjà retirée.' });
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
