/**
 * Talk2Me — Accès formation. Doctrine : le VALIDATEUR ouvre/certifie l'accès lors de ses sessions.
 *  GET               → { has_access, certified }  (statut du DEMANDEUR — pour le gate profil)
 *  GET ?cohort=1     → { cohort }                 (les recrutés que J'AI ouverts — validateur)
 *  POST { user_id, action:'open'|'certify'|'revoke', session? }  (VALIDATEUR uniquement)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { hasFormationAccess, isCertified, openFormationAccess, certifyFormation, revokeFormationAccess, listCohort, quizPassed } from '@/lib/formation-access';
import { hasSignedPresence } from '@/lib/formation-sessions';
// NB : signed_presence + quiz_passed sont exposés au DEMANDEUR pour afficher sa checklist « pour être certifié ».

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidateur(me: { id: string; email?: string | null; is_admin?: boolean }): boolean {
  return !!me.is_admin || hasPermission(me.id, me.email || '', 'curation_validateur');
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (req.nextUrl.searchParams.get('cohort') === '1') {
    if (!isValidateur(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: true, cohort: listCohort(me.id) });
  }
  return NextResponse.json({ ok: true, has_access: hasFormationAccess(me.id), certified: isCertified(me.id), is_validateur: isValidateur(me), signed_presence: hasSignedPresence(me.id), quiz_passed: quizPassed(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isValidateur(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 }); // seul un validateur ouvre l'accès
  let b: { user_id?: string; action?: string; session?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const uid = String(b.user_id || '');
  if (!uid) return NextResponse.json({ error: 'user_id_required' }, { status: 400 });
  const session = b.session ? String(b.session).slice(0, 60) : undefined;
  if (b.action === 'open') openFormationAccess(uid, me.id, session);
  else if (b.action === 'certify') {
    // Garde-fou : on ne certifie que sur PREUVES — registre signé + examen réussi. La parole ne compte pas.
    if (!hasSignedPresence(uid)) return NextResponse.json({ error: 'presence_manquante', message: "Le recruté n'a pas signé le registre d'une session (présence géolocalisée)." }, { status: 400 });
    if (!quizPassed(uid)) return NextResponse.json({ error: 'examen_non_reussi', message: "Le recruté n'a pas réussi l'examen." }, { status: 400 });
    certifyFormation(uid, me.id, session);
  }
  else if (b.action === 'revoke') revokeFormationAccess(uid);
  else return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  return NextResponse.json({ ok: true, cohort: listCohort(me.id) });
}
