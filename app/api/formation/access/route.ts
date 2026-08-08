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
import { hasFormationAccess, isCertified, openFormationAccess, certifyFormation, revokeFormationAccess, listCohort, quizPassed, getFormationSender, listFormationInbox } from '@/lib/formation-access';
import { hasSignedPresence } from '@/lib/formation-sessions';
import { becomeContributor, getContributor } from '@/lib/network';
import { getUserById } from '@/lib/db';
import { createNotif } from '@/lib/notifs';

const nameOf = (id: string) => {
  const u = getUserById(id) as { display_name?: string; username?: string } | null;
  return u?.display_name || u?.username || 'quelqu’un';
};
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
  // FILE D'ARRIVÉE (routage par zone) : les recrues envoyées en formation dans MA ville, pas encore prises.
  if (req.nextUrl.searchParams.get('inbox') === '1') {
    if (!isValidateur(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const myCity = getContributor(me.id)?.city ?? null;
    const inbox = listFormationInbox(myCity).map((r) => {
      const u = getUserById(r.recrue_id) as { display_name?: string; username?: string } | null;
      const s = getUserById(r.sent_by) as { display_name?: string; username?: string } | null;
      return { user_id: r.recrue_id, name: u?.display_name || u?.username || 'Recrue', username: u?.username || null, sent_by_name: s?.display_name || s?.username || 'un contributeur', city: r.city, created_at: r.created_at };
    });
    return NextResponse.json({ ok: true, inbox, city: myCity });
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
  if (b.action === 'open') {
    openFormationAccess(uid, me.id, session);
    // B) INVITATION : le validateur convoque la recrue à sa formation.
    createNotif(uid, 'formation', '🎓 Convoqué en formation', `${nameOf(me.id)} (validateur) t'a ouvert la formation. Rejoins sa session pour signer ta présence, puis passe l'examen.`);
    // C) Le contributeur qui l'a envoyée sait qu'elle est ENTRÉE en formation.
    const s = getFormationSender(uid);
    if (s && s !== uid) createNotif(s, 'formation', 'Ta recrue est en formation', `${nameOf(uid)} est entrée en formation chez ${nameOf(me.id)}.`);
  }
  else if (b.action === 'certify') {
    // Garde-fou : on ne certifie que sur PREUVES — registre signé + examen réussi. La parole ne compte pas.
    if (!hasSignedPresence(uid)) return NextResponse.json({ error: 'presence_manquante', message: "Le recruté n'a pas signé le registre d'une session (présence géolocalisée)." }, { status: 400 });
    if (!quizPassed(uid)) return NextResponse.json({ error: 'examen_non_reussi', message: "Le recruté n'a pas réussi l'examen." }, { status: 400 });
    certifyFormation(uid, me.id, session);
    // BOUCLE FERMÉE (Pascal 2026-08-08) : « c'est l'acte de faire la formation qui rend éligible au
    // parrainage ». La recrue certifiée revient au CONTRIBUTEUR qui l'a ENVOYÉE en formation → elle
    // devient son filleul. Sur PREUVE uniquement (présence + examen). On ne vole personne : si elle a
    // déjà un parrain, on n'écrase pas (premier arrivé garde).
    const sender = getFormationSender(uid);
    if (sender && sender !== uid && getContributor(sender) && !getContributor(uid)) {
      becomeContributor(uid, sender);
    }
    // La recrue sait qu'elle est certifiée.
    createNotif(uid, 'formation', '✅ Formation validée', 'Tu es certifié — tu connais le taf. Ton parrain va te faire la formation terrain.');
    // C) Le contributeur qui l'a envoyée sait qu'elle a RÉUSSI → à lui de faire la formation TERRAIN.
    if (sender && sender !== uid) createNotif(sender, 'formation', '✅ Recrue certifiée', `${nameOf(uid)} a réussi la formation. À toi de faire la formation terrain — elle rejoint ton équipe.`);
  }
  else if (b.action === 'revoke') revokeFormationAccess(uid);
  else return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  return NextResponse.json({ ok: true, cohort: listCohort(me.id) });
}
