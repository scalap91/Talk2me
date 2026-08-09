/**
 * Talk2Me — Page « Mon parcours » (Pascal 2026-07-30).
 * Lecture seule : l'échelle des niveaux + mon rang réel (pour le rail vertical).
 * Le parrainage se fait via /api/friends/search + /api/network/parrainer.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getContributorStats, listLevels, getPortfolio, getContributor } from '@/lib/network';
import { getNetworkDb } from '@/lib/network-db';
import { getUserById } from '@/lib/db';
import { listAttachedShops } from '@/lib/simple-shop';
import { listReferrals } from '@/lib/referral';
import { listSentToFormation, getFormationAccess, quizPassed, isFieldTrainingDone } from '@/lib/formation-access';
import { hasSignedPresence } from '@/lib/formation-sessions';
import { hasPermission } from '@/lib/permissions';
import { getCasier } from '@/lib/casier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Person { id: string; username: string | null; display_name: string | null; avatar_url: string | null; level_rank: number; level_name: string }

// Fiche personne RELATIONNELLE : identité + rôle SEULEMENT. On n'expose JAMAIS ses gains (Pascal).
function personCard(uid: string, levels: { rank: number; name: string }[]): Person | null {
  const c = getContributor(uid);
  if (!c) return null;
  const u = getUserById(uid) as { username?: string; display_name?: string; avatar_url?: string } | null;
  const lvl = levels.find((l) => l.rank === c.level_rank);
  return { id: uid, username: u?.username || null, display_name: u?.display_name || null, avatar_url: u?.avatar_url || null, level_rank: c.level_rank, level_name: lvl?.name || 'Contributeur' };
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const stats = getContributorStats(me.id); // null si pas encore contributeur
  // Portefeuille RÉEL lu depuis mes cards (par service : nb + gains). 0 → se remplit dès qu'une card vend.
  const portfolio = stats ? getPortfolio(me.id) : {};
  // Fiches ATTACHÉES (référent/apporteur) — visibles même SANS vente, avec le nom du propriétaire.
  const attached = stats ? listAttachedShops(me.id).map((s) => {
    const o = getUserById(s.owner_id) as { display_name?: string; username?: string } | null;
    return { id: s.id, name: s.name, kind: s.kind, owner_name: o?.display_name || o?.username || 'Client' };
  }) : [];
  const levels = listLevels();

  // PARRAINS (au-dessus, chaîne sponsor) + FILLEULS (en dessous, direct). Identité + rôle, jamais les gains.
  let parrains: Person[] = [];
  let filleuls: Person[] = [];
  if (stats) {
    const seen = new Set<string>([me.id]);
    let up = getContributor(me.id)?.sponsor_id || null;
    let guard = 0;
    while (up && !seen.has(up) && guard < 20) {
      seen.add(up);
      const p = personCard(up, levels);
      if (p) parrains.push(p);
      up = getContributor(up)?.sponsor_id || null;
      guard++;
    }
    const rows = getNetworkDb().prepare("SELECT user_id FROM contributors WHERE sponsor_id = ? AND status = 'active' ORDER BY level_rank DESC, personal_score DESC LIMIT 60").all(me.id) as { user_id: string }[];
    filleuls = rows.map((r) => personCard(r.user_id, levels)).filter(Boolean) as Person[];
  }

  // MES INVITÉS (referred_by = moi) → pour les faire REMONTER EN PREMIER dans « Parrainer un inscrit ».
  // C'est un TRI, pas un verrou : n'importe qui peut inviter, c'est celui qui CONCLUT qui gagne le filleul.
  // On retire ceux qui sont déjà mes filleuls (rien à re-parrainer).
  let invites: { id: string; username: string; display_name: string | null; avatar_url: string | null }[] = [];
  if (stats) {
    const filleulIds = new Set(filleuls.map((f) => f.id));
    invites = listReferrals(me.id).filter((r) => !filleulIds.has(r.id));
  }

  // MES RECRUES EN FORMATION (Pascal 2026-08-08) : celles que J'AI envoyées en formation + leur STATUT.
  // Boucle visible : envoyée → en formation (présence/examen) → certifiée → devenue MA filleule.
  let recrues_formation: { id: string; name: string; status: 'envoyee' | 'en_formation' | 'certifiee' | 'filleule'; signed: boolean; quiz: boolean; field_training: boolean }[] = [];
  if (stats) {
    recrues_formation = listSentToFormation(me.id).map((uid) => {
      const u = getUserById(uid) as { display_name?: string; username?: string } | null;
      const acc = getFormationAccess(uid);
      const signed = hasSignedPresence(uid);
      const quiz = quizPassed(uid);
      const mine = getContributor(uid)?.sponsor_id === me.id;
      let status: 'envoyee' | 'en_formation' | 'certifiee' | 'filleule' = 'envoyee';
      if (mine) status = 'filleule';
      else if (acc?.certified_at) status = 'certifiee';
      else if (acc || signed || quiz) status = 'en_formation';
      return { id: uid, name: u?.display_name || u?.username || 'Recrue', status, signed, quiz, field_training: isFieldTrainingDone(uid) };
    });
  }

  return NextResponse.json({
    ok: true,
    is_contributor: !!stats,
    levels,
    parrains, // au-dessus de moi (qui, pas leurs gains)
    filleuls, // en dessous de moi (qui, pas leurs gains)
    invites, // gens à qui J'AI envoyé le lien (referred_by = moi), pas encore mes filleuls
    recrues_formation, // recrues que J'AI envoyées en formation + leur statut (envoyée→…→filleule)
    my_city: stats ? (getContributor(me.id)?.city ?? null) : null, // ma zone (routage formation)
    is_validateur: hasPermission(me.id, me.email || '', 'curation_validateur'), // → décompte du formateur (hasPermission couvre le super-admin)

    me: stats ? { level_rank: stats.contributor.level_rank, level: stats.level, next: stats.next, active: stats.active, window_days: stats.window_days, recruits_direct: stats.recruits_direct, earned_cents: stats.earned_cents, pending_cents: stats.pending_cents, portfolio, attached, status: stats.contributor.status, casier: (() => { const k = getCasier(me.id); return { health: k.health, score: k.score }; })() } : null,
  });
}
