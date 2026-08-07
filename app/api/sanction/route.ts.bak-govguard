/**
 * Talk2Me — Sanctions (Pascal 2026-07-27). GOUVERNANCE NEUTRE uniquement (staff/validateur).
 *  GET  ?user_id=   → l'échelle + l'historique des sanctions de la personne.
 *  POST { user_id, action:'apply', level, reason, expires_at? } → pose une sanction SIGNÉE (records only).
 *  POST { sanction_id, action:'lift' }                          → lève (réversible en bas seulement).
 * ENFORCEMENT câblé (feu vert Pascal, niveau par niveau) : L1 notifie · L2 restriction (boost/commission,
 *    lu en direct) · L3 suspension (status=paused + rétrograde, réversible). L4-L5 encore gatés. AUCUN
 *    argent n'est JAMAIS déplacé ici — on gèle des droits, on n'encaisse/ne rembourse rien.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { SANCTION_SCALE, applySanction, liftSanction, listSanctions, levelInfo, reconcileExpiredSuspensions } from '@/lib/sanctions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isGov(me: { id: string; email?: string | null }): boolean {
  return isAiOpsAdmin(me.id, me.email) || hasPermission(me.id, me.email || '', 'curation_validateur');
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isGov(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  reconcileExpiredSuspensions(); // dégèle les L3 dont la durée est écoulée (« gelé X jours »)
  const uid = req.nextUrl.searchParams.get('user_id') || '';
  return NextResponse.json({ ok: true, scale: SANCTION_SCALE, sanctions: uid ? listSanctions(uid) : [] });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isGov(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { user_id?: string; sanction_id?: string; action?: string; level?: number; reason?: string; expires_at?: number | null } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  if (b.action === 'lift') {
    if (!b.sanction_id) return NextResponse.json({ error: 'sanction_id_required' }, { status: 400 });
    const r = liftSanction(String(b.sanction_id), me.id);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  // apply
  const uid = String(b.user_id || '');
  const level = Number(b.level);
  if (!uid) return NextResponse.json({ error: 'user_id_required' }, { status: 400 });
  const info = levelInfo(level);
  if (!info) return NextResponse.json({ error: 'bad_level' }, { status: 400 });
  if (uid === me.id) return NextResponse.json({ error: 'self' }, { status: 400 }); // on ne se sanctionne pas soi-même
  const r = applySanction(uid, level, String(b.reason || ''), me.id, { expiresAt: b.expires_at ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.error === 'reason_required' ? 'Un motif écrit est obligatoire (droit de recours).' : undefined }, { status: 400 });
  // Enforcement effectif sur toute l'échelle (L1→L5). AUCUN argent déplacé — on gèle/ferme des droits.
  const note = level <= 3
    ? 'Enregistrée, signée et APPLIQUÉE (droits gelés — aucun argent déplacé).'
    : level === 4
      ? 'Enregistrée, signée et APPLIQUÉE — rôle retiré (statut banni, rang remis à 1, tous droits révoqués). Irréversible. Aucun argent déplacé.'
      : 'Enregistrée, signée et APPLIQUÉE — compte banni (rôle retiré + session invalidée partout). Irréversible. Aucun argent déplacé.';
  return NextResponse.json({ ok: true, sanction: r.sanction, note });
}
