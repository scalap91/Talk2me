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
      status TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'ended'
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

/** Les fiches que JE sers actuellement (contributeur = référent actif). */
export function listClientsOf(referentId: string): { shop_id: string; assigned_at: number }[] {
  return ensure().prepare("SELECT shop_id, assigned_at FROM shop_referents WHERE referent_id=? AND role='referent' AND status='active' ORDER BY assigned_at DESC")
    .all(referentId) as { shop_id: string; assigned_at: number }[];
}

/** Combien de clients m'ont QUITTÉ (churn) — signal casier (Phase 8 : à agréger). */
export function churnCountFor(referentId: string, sinceMs = 0): number {
  const r = ensure().prepare("SELECT COUNT(*) c FROM referent_events WHERE old_referent=? AND kind IN ('changed','removed') AND created_at>=?").get(referentId, sinceMs) as { c: number };
  return r?.c || 0;
}
