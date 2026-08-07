import 'server-only';

/**
 * Talk2Me — Couche service RÉSEAU DE CONTRIBUTEURS (Pascal 2026-06-20).
 * Le « cerveau » bottom-up : devenir contributeur, tracer une contribution (scores +
 * commission perso), remonter l'OVERRIDE à la chaîne de parrains (downline), et
 * PROMOUVOIR automatiquement selon les échelons dynamiques. Données : network.db.
 */
import { randomUUID } from 'crypto';
import { getNetworkDb } from '@/lib/network-db';
import { sendPushToUser } from '@/lib/push';
import { getCommissionRate } from '@/lib/app-settings';

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
  // MODÈLE ARGENT (Pascal 2026-07-30) : seules les transactions réelles (family 'generate') paient.
  // Sur NOS 3% de commission plateforme, on redistribue 1% dans la chaîne — % DE LA VENTE, réglables
  // admin (app-settings : field_*_rate). recruit/enrich = 0 cash (points seuls).
  const isSale = t.family === 'generate' && value > 0;
  // GARDE-FOU DUR anti-perte : le total versé au terrain ne dépasse JAMAIS notre commission plateforme.
  const platformCut = Math.round(value * getCommissionRate('platform_commission_rate'));
  let commission = isSale ? Math.round(value * getCommissionRate('field_contributor_rate')) : 0;
  if (commission > platformCut) commission = platformCut;
  let paidField = commission; // cumul déjà distribué (contributeur + override)
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

  // OVERRIDE ARGENT — 2 CRANS puis STOP (Pascal : « faut bien s'arrêter, on ne monte pas jusqu'à ») :
  // parrain (niveau +1) puis grand-parrain (niveau +2), chacun un % de la VENTE (réglable admin).
  // Les POINTS, eux, continuent de remonter toute la chaîne (qualification de rang, inchangé).
  const ovrRates = isSale ? [getCommissionRate('field_parrain_rate'), getCommissionRate('field_grandparrain_rate')] : [];
  let up = c.sponsor_id; const seen = new Set<string>([contributorId]); let depth = 0;
  while (up && !seen.has(up)) {
    seen.add(up);
    const anc = getContributor(up);
    if (!anc || anc.status !== 'active') break;
    db.prepare('UPDATE contributors SET network_score = network_score + ? WHERE user_id = ?').run(t.points, anc.user_id);
    const rate = depth < ovrRates.length ? ovrRates[depth] : 0;
    if (rate > 0) {
      let ov = Math.round(value * rate);
      if (paidField + ov > platformCut) ov = Math.max(0, platformCut - paidField); // ceinture anti-perte
      if (ov > 0) {
        db.prepare('INSERT INTO contributor_commissions (id, contributor_id, source, from_contributor_id, contribution_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(randomUUID(), anc.user_id, 'override', contributorId, id, ov, 'pending', now);
        paidField += ov;
      }
    }
    evaluatePromotion(anc.user_id);
    depth++;
    up = anc.sponsor_id;
  }
  evaluatePromotion(contributorId);
  return { id, commission_cents: commission };
}

/**
 * ANNULE une contribution (remboursement / litige tranché par la gouvernance). Symétrique de
 * logContribution — la ceinture ET les bretelles anti-perte (Pascal 2026-07-30 : « si on reverse
 * plus qu'on a donné par erreur, il faut pouvoir récupérer ») :
 *   - lignes de commission encore 'pending' → 'reversed' : jamais versées, RIEN à récupérer ;
 *   - lignes déjà 'paid' → ligne NÉGATIVE 'reversal' (clawback) reliée à la contribution : nette le
 *     solde du bénéficiaire ; s'il a déjà retiré, son solde passe en dette épongée sur ses gains
 *     futurs (on ne court jamais après du cash) ;
 *   - la contribution sort des scores & du portefeuille (status='reversed') → rangs recalculés.
 * Idempotent. Appelée par le flux refund/escrow (refundEscrow) ou la gouvernance colis.
 */
export function reverseContribution(contributionId: string, reason = 'refund'): { ok: boolean; voided_cents: number; clawback_cents: number } {
  const db = getNetworkDb();
  const contrib = db.prepare('SELECT id, contributor_id, status FROM contributions WHERE id = ?').get(contributionId) as
    { id: string; contributor_id: string; status: string } | undefined;
  if (!contrib) return { ok: false, voided_cents: 0, clawback_cents: 0 };
  if (contrib.status === 'reversed') return { ok: true, voided_cents: 0, clawback_cents: 0 }; // idempotent
  const now = Date.now();
  const lines = db.prepare('SELECT id, contributor_id, from_contributor_id, amount_cents, status FROM contributor_commissions WHERE contribution_id = ?').all(contributionId) as
    { id: string; contributor_id: string; from_contributor_id: string | null; amount_cents: number; status: string }[];
  const affected = new Set<string>([contrib.contributor_id]);
  let voided = 0, clawback = 0;
  for (const l of lines) {
    affected.add(l.contributor_id);
    if (l.status === 'pending') {
      db.prepare("UPDATE contributor_commissions SET status = 'reversed' WHERE id = ?").run(l.id);
      voided += l.amount_cents;
    } else if (l.status === 'paid' && l.amount_cents > 0) {
      // clawback : ligne négative 'paid' → nette earned_cents (dette si solde déjà retiré)
      db.prepare("INSERT INTO contributor_commissions (id, contributor_id, source, from_contributor_id, contribution_id, amount_cents, status, created_at) VALUES (?, ?, 'reversal', ?, ?, ?, 'paid', ?)")
        .run(randomUUID(), l.contributor_id, l.from_contributor_id ?? null, contributionId, -l.amount_cents, now);
      clawback += l.amount_cents;
    }
  }
  db.prepare("UPDATE contributions SET status = 'reversed' WHERE id = ?").run(contributionId);
  for (const uid of affected) evaluatePromotion(uid); // un rang peut retomber après annulation
  return { ok: true, voided_cents: voided, clawback_cents: clawback };
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
      WHERE c.contributor_id = ? AND c.created_at > ? AND c.status NOT IN ('rejected', 'reversed')`
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
    // CHALLENGE : on notifie la montée d'échelon (motivation). Fire-and-forget.
    if (best > c.level_rank) {
      const lvl = db.prepare('SELECT name FROM contributor_levels WHERE rank = ?').get(best) as { name: string } | undefined;
      sendPushToUser(userId, { title: '🏆 Promotion !', body: `Tu passes ${lvl?.name || 'au niveau supérieur'} ! Continue, ton réseau grandit.`, url: '/parcours' }).catch(() => {});
    }
  }
  return best;
}

// ── MOTIVATION : classement + meilleur du mois (challenge) ──────────────────
function monthStart(): number { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }

export interface LeaderRow { contributor_id: string; points: number; commission_cents: number; rank: number }
/** Classement des contributeurs sur la période (défaut : mois courant). */
export function getLeaderboard(limit = 20, sinceMs?: number): LeaderRow[] {
  const db = getNetworkDb();
  const since = sinceMs ?? monthStart();
  const rows = db.prepare(
    `SELECT c.contributor_id,
            COALESCE(SUM(ct.points),0) AS points,
            COALESCE(SUM(c.commission_cents),0) AS commission_cents
       FROM contributions c JOIN contribution_types ct ON ct.code = c.type_code
      WHERE c.created_at >= ? AND c.status NOT IN ('rejected', 'reversed')
      GROUP BY c.contributor_id
      ORDER BY points DESC, commission_cents DESC
      LIMIT ?`
  ).all(since, limit) as { contributor_id: string; points: number; commission_cents: number }[];
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Ma position au classement du mois (pour le « challenge » du dashboard). */
export function getMyRank(userId: string, sinceMs?: number): { rank: number; total: number } {
  const board = getLeaderboard(10000, sinceMs);
  const idx = board.findIndex((r) => r.contributor_id === userId);
  return { rank: idx >= 0 ? idx + 1 : 0, total: board.length };
}

/** Meilleur contributeur du mois (à notifier en fin de mois via cron). */
export function bestOfMonth(): LeaderRow | null { return getLeaderboard(1)[0] || null; }

/** Cron mensuel : félicite le meilleur + relance les autres (challenge). */
export function notifyMonthlyChallenge(): number {
  const board = getLeaderboard(50);
  if (!board.length) return 0;
  board.forEach((r, i) => {
    const p = i === 0
      ? { title: '👑 Meilleur contributeur du mois !', body: 'Bravo, tu es n°1 ce mois-ci. Tiendras-tu ta place ?', url: '/parcours' }
      : { title: `Tu es n°${i + 1} ce mois`, body: `Plus que ${Math.max(1, board[0].points - r.points)} pts pour viser la 1ʳᵉ place 🔥`, url: '/parcours' };
    sendPushToUser(r.contributor_id, p).catch(() => {});
  });
  return board.length;
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
  month_rank: number; month_total: number; // position au classement du mois (challenge)
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
  const mr = getMyRank(userId);
  return { contributor: c, level, next, active: rollingScores(userId), window_days: QUALIF_WINDOW_DAYS, month_rank: mr.rank, month_total: mr.total, earned_cents: sum('paid'), pending_cents: sum('pending'), recruits_direct: recruits, recent };
}

/** Page « Mon parcours » : l'échelle COMPLÈTE des niveaux (rail vertical). */
export function listLevels(): Array<{ rank: number; name: string; min_perso: number; min_network: number; min_recruits: number; override_pct: number; territory_max: string }> {
  return getNetworkDb().prepare('SELECT rank, name, min_perso, min_network, min_recruits, override_pct, territory_max FROM contributor_levels ORDER BY rank ASC').all() as never;
}

/** Calculateur câblé au RÉEL : mes commerces (cards) par service = nb + gains générés.
 *  Lit les contributions ; 0 aujourd'hui → se remplit tout seul dès qu'une card existe et vend. */
export function getPortfolio(userId: string): Record<string, { n: number; cents: number }> {
  const rows = getNetworkDb().prepare(
    "SELECT service, COUNT(DISTINCT target_label) n, COALESCE(SUM(commission_cents),0) cents FROM contributions WHERE contributor_id = ? AND target_label IS NOT NULL AND target_label != '' AND status NOT IN ('rejected', 'reversed') GROUP BY service"
  ).all(userId) as { service: string; n: number; cents: number }[];
  const out: Record<string, { n: number; cents: number }> = {};
  for (const r of rows) out[r.service] = { n: r.n, cents: r.cents };
  return out;
}
