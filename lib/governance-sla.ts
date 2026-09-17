import 'server-only';
/**
 * Talk2Me — GOUVERNANCE SLA (Pascal 2026-09-16, Phase 2). Deux briques :
 *  1. NÉGLIGENCE : un gardien qui laisse pourrir un dossier > 7j reçoit une marque à son casier
 *     (nourrit sa descente auto). Marque RETIRABLE (staff) si l'absence était justifiée.
 *  2. INDISPO (congé/médical) : auto-déclarée, contrôlée après par le staff. Pendant l'absence,
 *     AUCUNE marque négligence ne tombe (on ne punit pas un absent justifié).
 * Voir [[project_talk2me_petition_anticapture]]. Aucun argent (records de gouvernance).
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

let _ready = false;
function ensure() {
  const db = getDb();
  if (_ready) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS governance_negligence (
      id TEXT PRIMARY KEY,
      gardien_id TEXT NOT NULL,
      kind TEXT NOT NULL,          -- 'petition' | 'litige'
      ref_id TEXT NOT NULL,
      reason TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      lifted_at INTEGER, lifted_by TEXT,
      UNIQUE(gardien_id, kind, ref_id)
    );
    CREATE INDEX IF NOT EXISTS idx_negl_gardien ON governance_negligence(gardien_id, active, created_at);
    CREATE TABLE IF NOT EXISTS governance_leave (
      user_id TEXT PRIMARY KEY,
      reason TEXT,
      until_at INTEGER NOT NULL,
      declared_at INTEGER NOT NULL
    );
  `);
  _ready = true;
  return db;
}

// ── INDISPO (congé / médical) ────────────────────────────────────────────────
/** Auto-déclaration d'indisponibilité (effet immédiat ; le staff contrôle après coup). */
const MAX_LEAVE_MS = 30 * 24 * 3600 * 1000; // plafond indispo : 30 jours (au-delà = staff décide de la suite du rôle)
export function declareLeave(userId: string, reason: string, untilAt: number): void {
  if (!userId || !untilAt) return;
  const until = Math.min(untilAt, Date.now() + MAX_LEAVE_MS); // ne peut pas se déclarer absent plus de 30 jours d'un coup
  ensure().prepare('INSERT OR REPLACE INTO governance_leave (user_id, reason, until_at, declared_at) VALUES (?,?,?,?)')
    .run(userId, (reason || '').slice(0, 200), until, Date.now());
}
export function endLeave(userId: string): void {
  ensure().prepare('DELETE FROM governance_leave WHERE user_id = ?').run(userId);
}
/** Le gardien est-il en indispo justifiée en cours ? */
export function onLeave(userId: string): boolean {
  if (!userId) return false;
  const r = ensure().prepare('SELECT until_at FROM governance_leave WHERE user_id = ?').get(userId) as { until_at: number } | undefined;
  return !!r && r.until_at > Date.now();
}
export function listLeaves(): { user_id: string; reason: string | null; until_at: number; declared_at: number }[] {
  return ensure().prepare('SELECT * FROM governance_leave WHERE until_at > ? ORDER BY declared_at DESC').all(Date.now()) as { user_id: string; reason: string | null; until_at: number; declared_at: number }[];
}

// ── NÉGLIGENCE ───────────────────────────────────────────────────────────────
/** Marque un gardien négligent (sauf s'il est en indispo justifiée). Idempotent par dossier. */
export function markNegligence(gardienId: string, kind: 'petition' | 'litige', refId: string, reason: string): void {
  if (!gardienId || onLeave(gardienId)) return; // absent justifié → pas de marque
  ensure().prepare('INSERT OR IGNORE INTO governance_negligence (id, gardien_id, kind, ref_id, reason, active, created_at) VALUES (?,?,?,?,?,1,?)')
    .run(randomUUID(), gardienId, kind, refId, (reason || '').slice(0, 300), Date.now());
}
/** Nombre de négligences actives d'un gardien depuis `sinceMs` (nourrit le casier). */
export function countNegligence(userId: string, sinceMs: number): number {
  if (!userId) return 0;
  return (ensure().prepare('SELECT COUNT(*) c FROM governance_negligence WHERE gardien_id = ? AND active = 1 AND created_at >= ?').get(userId, sinceMs) as { c: number }).c;
}
/** Retirer une marque de négligence (staff — ex. absence justifiée reconnue après coup). */
export function liftNegligence(id: string, byUser: string): boolean {
  const r = ensure().prepare("UPDATE governance_negligence SET active = 0, lifted_at = ?, lifted_by = ? WHERE id = ? AND active = 1").run(Date.now(), byUser, id);
  return r.changes > 0;
}
export function listNegligenceFor(userId: string): { id: string; kind: string; ref_id: string; reason: string | null; created_at: number }[] {
  return ensure().prepare('SELECT id, kind, ref_id, reason, created_at FROM governance_negligence WHERE gardien_id = ? AND active = 1 ORDER BY created_at DESC').all(userId) as { id: string; kind: string; ref_id: string; reason: string | null; created_at: number }[];
}
