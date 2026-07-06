/**
 * lib/schema/access — BINDING des rôles cockpit sur l'AUTH RÉELLE (Pascal 2026-06-30).
 * - Super-admin (isAiOpsAdmin, env AI_OPS_ADMIN_* → pascal.repir@gmail.com par défaut)
 *   = rôle cockpit 'admin' INCONDITIONNEL (jamais de lockout, pas de « claim » à faire).
 * - Collaborateurs : rôle cockpit explicitement assigné par un admin, stocké en base
 *   (table cockpit_access). Sinon : aucun accès cockpit.
 * Le rôle vient donc de l'utilisateur AUTHENTIFIÉ, pas d'un ?role= choisi librement.
 * Doctrine PII : on ne manipule que user_id/role, jamais d'autre donnée perso.
 */
import { getDb } from '@/lib/db-core';
import { getCurrentUser } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getRole } from '@/lib/schema/registry';

/** Minimal user shape needed ici (évite de coupler au type DbUser complet). */
export interface DbUserLike { id: string; email?: string | null }

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS cockpit_access (
      user_id    TEXT PRIMARY KEY,
      role       TEXT NOT NULL,
      granted_by TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  ensured = true;
}

/** Rôle cockpit EFFECTIF d'un user authentifié (ou null = pas d'accès). */
export function effectiveCockpitRole(user: DbUserLike | null | undefined): string | null {
  if (!user) return null;
  if (isAiOpsAdmin(user.id, user.email)) return 'admin'; // super-admin = admin inconditionnel
  ensure();
  const row = getDb().prepare('SELECT role FROM cockpit_access WHERE user_id = ?').get(user.id) as { role: string } | undefined;
  if (row && getRole(row.role)) return row.role;
  return null;
}

export interface CockpitGrant { user_id: string; role: string; granted_by: string | null; created_at: number }

export function listCockpitAccess(): CockpitGrant[] {
  ensure();
  return getDb().prepare('SELECT user_id, role, granted_by, created_at FROM cockpit_access ORDER BY created_at DESC').all() as CockpitGrant[];
}

/** Assigne (ou met à jour) un rôle cockpit à un user. Admin only (vérifié par l'appelant). */
export function setCockpitRole(targetUserId: string, role: string, byUserId: string): boolean {
  if (!targetUserId || !getRole(role)) return false;
  ensure();
  getDb().prepare(
    `INSERT INTO cockpit_access (user_id, role, granted_by, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, created_at = excluded.created_at`
  ).run(targetUserId, role, byUserId, Date.now());
  return true;
}

export function revokeCockpitRole(targetUserId: string): boolean {
  ensure();
  const r = getDb().prepare('DELETE FROM cockpit_access WHERE user_id = ?').run(targetUserId);
  return r.changes > 0;
}

export interface CockpitContext {
  user: DbUserLike | null;
  role: string | null;       // rôle effectif (null = pas d'accès)
  isSuperAdmin: boolean;     // peut donner des rôles
}

/** Contexte cockpit côté Server Component (lit la session réelle via cookie). */
export async function cockpitContext(): Promise<CockpitContext> {
  const user = (await getCurrentUser()) as DbUserLike | null;
  const role = effectiveCockpitRole(user);
  const isSuperAdmin = !!user && isAiOpsAdmin(user.id, user.email);
  return { user, role, isSuperAdmin };
}
