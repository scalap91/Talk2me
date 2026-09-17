/**
 * Talk2Me — API pétition de gouvernance (Pascal 2026-09-16). Voir [[project_talk2me_petition_anticapture]].
 *  GET ?target_id=…  → état de MA pétition contre cette personne (UI de signature).
 *  GET               → file des pétitions escaladées que JE peux trancher (validateur/staff).
 *  POST {action:'sign', target_id, motif}                          → signer (seuil 1/3, fenêtre 30j).
 *  POST {action:'decide', petition_id, verdict, sanction_level?, note?} → trancher (avéré / calomnie).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { signPetition, decidePetition, listEscalatedFor, myPetitionState, reconcilePetitionSLA } from '@/lib/petition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const emailOf = (id: string): string | null => {
  try { const u = getDb().prepare('SELECT email FROM users WHERE id = ?').get(id) as { email?: string } | undefined; return u?.email ?? null; } catch { return null; }
};

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  reconcilePetitionSLA(); // SLA 7j : escalade auto + marque négligence (Phase 2)
  const target = req.nextUrl.searchParams.get('target_id');
  if (target) {
    return NextResponse.json({ ok: true, state: myPetitionState(me.id, target, emailOf(target)) });
  }
  return NextResponse.json({ ok: true, petitions: listEscalatedFor(me.id, me.email) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { action?: string; target_id?: string; motif?: string; petition_id?: string; verdict?: string; sanction_level?: number; note?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  if (b.action === 'sign') {
    const target = String(b.target_id || '');
    const r = signPetition(me.id, target, String(b.motif || ''), emailOf(target));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ...r, message: r.escalated ? 'Pétition transmise au niveau supérieur (seuil atteint).' : `Signé. ${r.count}/${r.threshold} pour déclencher.` });
  }
  if (b.action === 'decide') {
    const verdict = b.verdict === 'founded' ? 'founded' : 'dismissed';
    const r = decidePetition(me.id, me.email, String(b.petition_id || ''), verdict, Number(b.sanction_level) || 0, b.note);
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.error === 'forbidden' ? 'Réservé au niveau au-dessus du mis en cause.' : 'Échec.' }, { status: r.error === 'forbidden' ? 403 : 400 });
    return NextResponse.json({ ...r, message: verdict === 'founded' ? 'Pétition fondée — mesure appliquée au mis en cause.' : `Calomnie — mesure commune appliquée à ${r.sanctioned} signataire(s).` });
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
