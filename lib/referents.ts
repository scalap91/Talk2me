/**
 * Talk2Me — RÉFÉRENT d'un commerce (Module 5 « Servir », Pascal 2026-07-27). Phase 1 : le LIEN,
 * ZÉRO argent. Doctrine gouvernance : la fiche appartient à l'OPÉRATEUR (souverain) — c'est LUI qui
 * choisit son référent-contributeur et LUI qui peut le changer/retirer. Deux rôles par fiche :
 *   - APPORTEUR  : qui l'a amenée (immuable, prime one-shot — Phase 2).
 *   - RÉFÉRENT   : qui la sert MAINTENANT (mutable → commission récurrente locale, Phase 2).
 * « Switch = alerte » : tout changement de référent est loggé (referent_events) → signal qualité
 * qui alimentera le CASIER (un contributeur qui perd ses clients en série = drapeau). On ne stocke
 * ICI aucun mouvement d'argent : le routage de commission est la Phase 2, backend-only, à valider.
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_referents (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      referent_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'referent',   -- 'referent' | 'apporteur'
      status TEXT NOT NULL DEFAULT 'active',    -- 'pending' (invité, pas encore accepté) | 'active' | 'ended'
      assigned_by TEXT,                          -- qui a posé le lien (l'opérateur, souverain)
      assigned_at INTEGER NOT NULL,
      ended_at INTEGER,
      reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_shopref_shop   ON shop_referents(shop_id, role, status);
    CREATE INDEX IF NOT EXISTS idx_shopref_ref    ON shop_referents(referent_id, role, status);
    CREATE TABLE IF NOT EXISTS referent_events (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      kind TEXT NOT NULL,                        -- 'assigned' | 'changed' | 'removed'
      old_referent TEXT,
      new_referent TEXT,
      by_user TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_refevt_old ON referent_events(old_referent, created_at);
    CREATE INDEX IF NOT EXISTS idx_refevt_new ON referent_events(new_referent, created_at);
  `);
  return db;
}

export interface ReferentLink { id: string; shop_id: string; referent_id: string; role: string; status: string; assigned_by: string | null; assigned_at: number; }

function logEvent(shopId: string, kind: 'assigned' | 'changed' | 'removed', oldRef: string | null, newRef: string | null, by: string) {
  ensure().prepare('INSERT INTO referent_events (id, shop_id, kind, old_referent, new_referent, by_user, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(randomUUID(), shopId, kind, oldRef, newRef, by, Date.now());
}

/** Le référent ACTUEL d'une fiche (ligne active role='referent'), ou null. */
export function getReferent(shopId: string): ReferentLink | null {
  return (ensure().prepare("SELECT * FROM shop_referents WHERE shop_id=? AND role='referent' AND status='active' LIMIT 1").get(shopId) as ReferentLink) || null;
}

/** L'apporteur d'une fiche (immuable, posé à l'onboarding), ou null. */
export function getApporteur(shopId: string): ReferentLink | null {
  return (ensure().prepare("SELECT * FROM shop_referents WHERE shop_id=? AND role='apporteur' LIMIT 1").get(shopId) as ReferentLink) || null;
}

/** Poser l'APPORTEUR (une seule fois, à l'onboarding par un contributeur). Idempotent. */
export function setApporteur(shopId: string, userId: string): void {
  const db = ensure();
  if (db.prepare("SELECT 1 FROM shop_referents WHERE shop_id=? AND role='apporteur'").get(shopId)) return;
  db.prepare("INSERT INTO shop_referents (id, shop_id, referent_id, role, status, assigned_by, assigned_at) VALUES (?,?,?,'apporteur','active',?,?)")
    .run(randomUUID(), shopId, userId, userId, Date.now());
}

/**
 * L'OPÉRATEUR pose ou CHANGE son référent (souverain). Si aucun → 'assigned'. Si déjà un →
 * 'changed' (= ALERTE : on clôt l'ancien lien, on log l'événement). Refuse le no-op.
 */
export function setReferent(shopId: string, referentId: string, byOwner: string, reason?: string): { ok: boolean; error?: string; changed?: boolean } {
  const db = ensure();
  if (!shopId || !referentId) return { ok: false, error: 'bad_args' };
  const cur = getReferent(shopId);
  if (cur && cur.referent_id === referentId) return { ok: true, changed: false }; // déjà lui
  const now = Date.now();
  if (cur) {
    db.prepare("UPDATE shop_referents SET status='ended', ended_at=?, reason=? WHERE id=?").run(now, reason || 'switch', cur.id);
  }
  db.prepare("INSERT INTO shop_referents (id, shop_id, referent_id, role, status, assigned_by, assigned_at, reason) VALUES (?,?,?,'referent','active',?,?,?)")
    .run(randomUUID(), shopId, referentId, byOwner, now, reason || null);
  logEvent(shopId, cur ? 'changed' : 'assigned', cur?.referent_id || null, referentId, byOwner);
  return { ok: true, changed: !!cur };
}

/** L'OPÉRATEUR retire son référent (la fiche n'a plus de référent → 'removed', loggé). */
export function removeReferent(shopId: string, byOwner: string, reason?: string): { ok: boolean; error?: string } {
  const cur = getReferent(shopId);
  if (!cur) return { ok: true };
  ensure().prepare("UPDATE shop_referents SET status='ended', ended_at=?, reason=? WHERE id=?").run(Date.now(), reason || 'removed', cur.id);
  logEvent(shopId, 'removed', cur.referent_id, null, byOwner);
  return { ok: true };
}

/**
 * INVITATION référent (Pascal 2026-08-30) : l'opérateur PROPOSE un référent → lien 'pending'.
 * Le rôle ne devient actif qu'à l'ACCEPTATION du référent (accepte/décline dans sa notif).
 * N'END PAS le référent actif courant : l'ancien sert jusqu'à ce que le nouveau accepte.
 */
export function inviteReferent(shopId: string, referentId: string, byOwner: string): { ok: boolean; error?: string } {
  const db = ensure();
  if (!shopId || !referentId) return { ok: false, error: 'bad_args' };
  const cur = getReferent(shopId);
  if (cur && cur.referent_id === referentId) return { ok: false, error: 'already_referent' };
  // Une seule invitation en attente à la fois : on clôt une éventuelle invitation précédente.
  db.prepare("UPDATE shop_referents SET status='ended', ended_at=?, reason='reinvite' WHERE shop_id=? AND role='referent' AND status='pending'").run(Date.now(), shopId);
  db.prepare("INSERT INTO shop_referents (id, shop_id, referent_id, role, status, assigned_by, assigned_at, reason) VALUES (?,?,?,'referent','pending',?,?,?)")
    .run(randomUUID(), shopId, referentId, byOwner, Date.now(), 'invite');
  return { ok: true };
}

/** L'invitation EN ATTENTE d'une fiche (proposée, pas encore acceptée), ou null. */
export function getPendingReferent(shopId: string): ReferentLink | null {
  return (ensure().prepare("SELECT * FROM shop_referents WHERE shop_id=? AND role='referent' AND status='pending' ORDER BY assigned_at DESC LIMIT 1").get(shopId) as ReferentLink) || null;
}

/** L'invitation en attente adressée à CE référent sur CETTE fiche (pour vérifier accept/décline). */
export function getPendingInvite(shopId: string, referentId: string): ReferentLink | null {
  return (ensure().prepare("SELECT * FROM shop_referents WHERE shop_id=? AND referent_id=? AND role='referent' AND status='pending' LIMIT 1").get(shopId, referentId) as ReferentLink) || null;
}

/** Le référent ACCEPTE : son lien passe 'active' et clôt l'ancien référent actif (le cas échéant). */
export function acceptReferent(shopId: string, referentId: string): { ok: boolean; error?: string; changed?: boolean } {
  const db = ensure();
  const pend = getPendingInvite(shopId, referentId);
  if (!pend) return { ok: false, error: 'no_invite' };
  const now = Date.now();
  const cur = getReferent(shopId);
  if (cur && cur.id !== pend.id) db.prepare("UPDATE shop_referents SET status='ended', ended_at=?, reason='switch' WHERE id=?").run(now, cur.id);
  db.prepare("UPDATE shop_referents SET status='active', assigned_at=? WHERE id=?").run(now, pend.id);
  logEvent(shopId, cur ? 'changed' : 'assigned', cur?.referent_id || null, referentId, referentId);
  return { ok: true, changed: !!cur };
}

/** Le référent DÉCLINE : l'invitation en attente est close (aucun changement de référent actif). */
export function declineReferent(shopId: string, referentId: string): { ok: boolean; error?: string } {
  const r = ensure().prepare("UPDATE shop_referents SET status='ended', ended_at=?, reason='declined' WHERE shop_id=? AND referent_id=? AND role='referent' AND status='pending'").run(Date.now(), shopId, referentId);
  return r.changes ? { ok: true } : { ok: false, error: 'no_invite' };
}

/** Les fiches que JE sers actuellement (contributeur = référent actif). */
export function listClientsOf(referentId: string): { shop_id: string; assigned_at: number }[] {
  return ensure().prepare("SELECT shop_id, assigned_at FROM shop_referents WHERE referent_id=? AND role='referent' AND status='active' ORDER BY assigned_at DESC")
    .all(referentId) as { shop_id: string; assigned_at: number }[];
}

/** Toutes les fiches que je GÈRE (référent OU apporteur, actives) — pour « fiches attachées » (Pascal 2026-08-05). */
export function listManagedShopIds(userId: string): string[] {
  const rows = ensure().prepare(
    "SELECT DISTINCT shop_id FROM shop_referents WHERE referent_id = ? AND status = 'active' AND role IN ('referent','apporteur') ORDER BY assigned_at DESC"
  ).all(userId) as { shop_id: string }[];
  return rows.map((r) => r.shop_id);
}

/** Combien de clients m'ont QUITTÉ (churn) — signal casier (Phase 8 : à agréger). */
export function churnCountFor(referentId: string, sinceMs = 0): number {
  const r = ensure().prepare("SELECT COUNT(*) c FROM referent_events WHERE old_referent=? AND kind IN ('changed','removed') AND created_at>=?").get(referentId, sinceMs) as { c: number };
  return r?.c || 0;
}
