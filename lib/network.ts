import 'server-only';

/**
 * Talk2Me — Couche service RÉSEAU DE CONTRIBUTEURS (Pascal 2026-06-20).
 * Le « cerveau » bottom-up : devenir contributeur, tracer une contribution (scores +
 * commission perso), remonter l'OVERRIDE à la chaîne de parrains (downline), et
 * PROMOUVOIR automatiquement selon les échelons dynamiques. Données : network.db.
 */
import { randomUUID } from 'crypto';
import { getNetworkDb } from '@/lib/network-db';

export interface Contributor {
  user_id: string; status: string; sponsor_id: string | null; level_rank: number;
  country: string | null; region: string | null; city: string | null; quartier: string | null;
  personal_score: number; network_score: number; recruits_count: number; joined_at: number;
}
type Territory = { country?: string | null; region?: string | null; city?: string | null; quartier?: string | null };

export function getContributor(userId: string): Contributor | null {
  return (getNetworkDb().prepare('SELECT * FROM contributors WHERE user_id = ?').get(userId) as Contributor) || null;
}

/** Un user devient contributeur (self-serve). sponsorId = celui dont le lien l'a amené. */
export function becomeContributor(userId: string, sponsorId?: string | null, territory?: Territory): Contributor {
  const db = getNetworkDb();
  const existing = getContributor(userId);
  if (existing) return existing;
  // Anti-boucle : un sponsor valide, contributeur, et ≠ soi.
  const sponsor = sponsorId && sponsorId !== userId ? getContributor(sponsorId) : null;
  db.prepare(
    `INSERT INTO contributors (user_id, status, sponsor_id, level_rank, country, region, city, quartier, joined_at)
     VALUES (?, 'active', ?, 1, ?, ?, ?, ?, ?)`
  ).run(userId, sponsor ? sponsor.user_id : null,
    territory?.country ?? null, territory?.region ?? null, territory?.city ?? null, territory?.quartier ?? null, Date.now());
  if (sponsor) {
    db.prepare('UPDATE contributors SET recruits_count = recruits_count + 1 WHERE user_id = ?').run(sponsor.user_id);
    // Le recrutement d'un contributeur est lui-même une contribution du parrain.
    logContribution(sponsor.user_id, 'contributor_recruit', { targetId: userId, targetLabel: 'Nouveau contributeur' });
  }
  return getContributor(userId)!;
}

interface LogOpts { targetId?: string | null; targetLabel?: string | null; valueCents?: number; territory?: Territory; status?: 'pending' | 'confirmed'; }

/** Trace UNE contribution → commission perso + points + override remonté + promotion. */
export function logContribution(contributorId: string, typeCode: string, opts: LogOpts = {}) {
  const db = getNetworkDb();
  const c = getContributor(contributorId);
  if (!c || c.status !== 'active') return null;
  const t = db.prepare('SELECT * FROM contribution_types WHERE code = ? AND active = 1').get(typeCode) as
    { code: string; service: string; family: string; commission_kind: string; commission_value: number; points: number } | undefined;
  if (!t) return null;

  const value = Math.max(0, Math.round(opts.valueCents || 0));
  // Commission perso : fixe (centimes) ou pourcentage (points de base) de la valeur générée.
  const commission = t.commission_kind === 'pct' ? Math.round(value * t.commission_value / 10000) : t.commission_value;
  const now = Date.now();
  const id = randomUUID();
  const terr = opts.territory || {};
  db.prepare(
    `INSERT INTO contributions (id, contributor_id, type_code, service, target_id, target_label, value_cents, commission_cents, country, region, city, quartier, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, contributorId, t.code, t.service, opts.targetId ?? null, opts.targetLabel ?? null, value, commission,
    terr.country ?? c.country, terr.region ?? c.region, terr.city ?? c.city, terr.quartier ?? c.quartier,
    opts.status || 'confirmed', now);

  // Score perso + commission perso (ledger).
  db.prepare('UPDATE contributors SET personal_score = personal_score + ? WHERE user_id = ?').run(t.points, contributorId);
  if (commission > 0) {
    db.prepare('INSERT INTO contributor_commissions (id, contributor_id, source, contribution_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), contributorId, 'personal', id, commission, 'pending', now);
  }

  // OVERRIDE : remonte la chaîne de parrains ; chacun gagne override_pct% de la commission.
  const levels = db.prepare('SELECT rank, override_pct FROM contributor_levels').all() as { rank: number; override_pct: number }[];
  const pctByRank = new Map(levels.map((l) => [l.rank, l.override_pct]));
  let up = c.sponsor_id; const seen = new Set<string>([contributorId]);
  while (up && !seen.has(up)) {
    seen.add(up);
    const anc = getContributor(up);
    if (!anc || anc.status !== 'active') break;
    db.prepare('UPDATE contributors SET network_score = network_score + ? WHERE user_id = ?').run(t.points, anc.user_id);
    const pct = pctByRank.get(anc.level_rank) || 0;
    if (commission > 0 && pct > 0) {
      const ov = Math.round(commission * pct / 100);
      if (ov > 0) db.prepare('INSERT INTO contributor_commissions (id, contributor_id, source, from_contributor_id, contribution_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), anc.user_id, 'override', contributorId, id, ov, 'pending', now);
    }
    evaluatePromotion(anc.user_id);
    up = anc.sponsor_id;
  }
  evaluatePromotion(contributorId);
  return { id, commission_cents: commission };
}

// Le grade N'EST PAS acquis à vie (Pascal 2026-06-20) : il se mérite EN CONTINU sur une
// fenêtre glissante. Si l'activité retombe sous les seuils → RÉTROGRADATION automatique.
export const QUALIF_WINDOW_DAYS = 90;

/** Score d'activité RÉCENTE (fenêtre glissante) — perso + réseau (downline) + recrues actives. */
function rollingScores(userId: string): { perso: number; network: number; recruits: number } {
  const db = getNetworkDb();
  const cutoff = Date.now() - QUALIF_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const pts = (uid: string) => (db.prepare(
    `SELECT COALESCE(SUM(ct.points),0) s FROM contributions c JOIN contribution_types ct ON ct.code = c.type_code
      WHERE c.contributor_id = ? AND c.created_at > ? AND c.status <> 'rejected'`
  ).get(uid, cutoff) as { s: number }).s;
  const perso = pts(userId);
  // Réseau = somme des points récents de toute la downline (BFS, cap de sécurité).
  let network = 0, recruits = 0;
  let frontier = db.prepare('SELECT user_id FROM contributors WHERE sponsor_id = ?').all(userId) as { user_id: string }[];
  recruits = frontier.length;
  const seen = new Set<string>([userId]); let guard = 0;
  while (frontier.length && guard < 20000) {
    const next: { user_id: string }[] = [];
    for (const f of frontier) {
      if (seen.has(f.user_id)) continue; seen.add(f.user_id); guard++;
      network += pts(f.user_id);
      next.push(...(db.prepare('SELECT user_id FROM contributors WHERE sponsor_id = ?').all(f.user_id) as { user_id: string }[]));
    }
    frontier = next;
  }
  return { perso, network, recruits };
}

/** Recalcule l'échelon sur l'activité RÉCENTE. Monte OU rétrograde (pas acquis à vie). */
export function evaluatePromotion(userId: string): number {
  const db = getNetworkDb();
  const c = getContributor(userId);
  if (!c) return 0;
  const r = rollingScores(userId);
  const levels = db.prepare('SELECT * FROM contributor_levels ORDER BY rank ASC').all() as
    { rank: number; min_perso: number; min_network: number; min_recruits: number }[];
  let best = 1;
  for (const l of levels) {
    if (r.perso >= l.min_perso && r.network >= l.min_network && r.recruits >= l.min_recruits) best = l.rank;
  }
  if (best !== c.level_rank) {
    db.prepare('UPDATE contributors SET level_rank = ? WHERE user_id = ?').run(best, userId);
    db.prepare('INSERT INTO contributor_promotions (id, contributor_id, from_rank, to_rank, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), userId, c.level_rank, best,
        best > c.level_rank ? 'auto:montée (activité récente)' : 'auto:rétrogradation (activité retombée)', Date.now());
  }
  return best;
}

/** Recalcul périodique (cron) : rétrograde les contributeurs devenus inactifs. */
export function recomputeAllRanks(): number {
  const db = getNetworkDb();
  const ids = db.prepare("SELECT user_id FROM contributors WHERE status = 'active'").all() as { user_id: string }[];
  for (const { user_id } of ids) evaluatePromotion(user_id);
  return ids.length;
}

export interface ContributorStats {
  contributor: Contributor; level: { rank: number; name: string; override_pct: number; territory_max: string } | null;
  next: { rank: number; name: string; min_perso: number; min_network: number; min_recruits: number } | null;
  active: { perso: number; network: number; recruits: number }; // activité RÉCENTE (fenêtre glissante) = ce qui maintient le rang
  window_days: number;
  earned_cents: number; pending_cents: number; recruits_direct: number; recent: unknown[];
}

/** Données du dashboard « Mon activité ». */
export function getContributorStats(userId: string): ContributorStats | null {
  const db = getNetworkDb();
  const c = getContributor(userId);
  if (!c) return null;
  const level = db.prepare('SELECT rank, name, override_pct, territory_max FROM contributor_levels WHERE rank = ?').get(c.level_rank) as ContributorStats['level'];
  const next = db.prepare('SELECT rank, name, min_perso, min_network, min_recruits FROM contributor_levels WHERE rank = ? ').get(c.level_rank + 1) as ContributorStats['next'];
  const sum = (st: string) => (db.prepare('SELECT COALESCE(SUM(amount_cents),0) s FROM contributor_commissions WHERE contributor_id = ? AND status = ?').get(userId, st) as { s: number }).s;
  const recent = db.prepare('SELECT type_code, service, target_label, commission_cents, created_at FROM contributions WHERE contributor_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
  const recruits = (db.prepare('SELECT COUNT(*) c FROM contributors WHERE sponsor_id = ?').get(userId) as { c: number }).c;
  return { contributor: c, level, next, active: rollingScores(userId), window_days: QUALIF_WINDOW_DAYS, earned_cents: sum('paid'), pending_cents: sum('pending'), recruits_direct: recruits, recent };
}
