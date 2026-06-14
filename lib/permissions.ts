'use server-only';

/**
 * Talk2Me — DROITS / RÔLES (Pascal 2026-06-10). Le super-admin (env
 * AI_OPS_ADMIN_*) a TOUS les droits et peut en DONNER à des collaborateurs,
 * de façon GRANULAIRE (ex : « remplir la boutique » sans tout le reste).
 * Stocké dans user_permissions. hasPermission = super-admin OU droit accordé.
 */

import { getDb } from '@/lib/db';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';

// Droits accordables (extensible).
export const PERMISSIONS: { key: string; label: string }[] = [
  { key: 'curation_regardeur', label: 'Regardeur — propose des fiches (curation)' },
  { key: 'curation_validateur', label: 'Validateur — valide les fiches proposées' },
  { key: 'boutique', label: 'Remplir la boutique (curation produits)' },
  { key: 'eat', label: 'Gérer les fiches Eat' },
];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      granted_by TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, permission)
    );
  `);
  ensured = true;
}

/** Droits explicitement accordés à un user (hors super-admin). */
export function grantedPermissions(userId: string): string[] {
  ensure();
  return (getDb().prepare('SELECT permission FROM user_permissions WHERE user_id = ?').all(userId) as { permission: string }[]).map((r) => r.permission);
}

/** Tous les droits effectifs (super-admin = tout). */
export function effectivePermissions(userId: string, email: string | null | undefined): string[] {
  if (isAiOpsAdmin(userId, email)) return [...PERMISSION_KEYS];
  return grantedPermissions(userId);
}

export function hasPermission(userId: string, email: string | null | undefined, perm: string): boolean {
  if (isAiOpsAdmin(userId, email)) return true;
  return grantedPermissions(userId).includes(perm);
}

/** Peut accéder à un espace admin (a au moins un droit). */
export function isAdminCapable(userId: string, email: string | null | undefined): boolean {
  return isAiOpsAdmin(userId, email) || grantedPermissions(userId).length > 0;
}

/** Super-admin only — accorde/révoque un droit à un user. */
export function setPermission(targetUserId: string, perm: string, grant: boolean, byUserId: string): boolean {
  ensure();
  if (!PERMISSION_KEYS.includes(perm)) return false;
  if (grant) {
    getDb().prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission, granted_by, created_at) VALUES (?, ?, ?, ?)').run(targetUserId, perm, byUserId, Date.now());
  } else {
    getDb().prepare('DELETE FROM user_permissions WHERE user_id = ? AND permission = ?').run(targetUserId, perm);
  }
  return true;
}

/** Liste des collaborateurs (users avec ≥ 1 droit). */
export function listCollaborators(): { user_id: string; permissions: string[] }[] {
  ensure();
  const rows = getDb().prepare('SELECT user_id, permission FROM user_permissions ORDER BY created_at DESC').all() as { user_id: string; permission: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows) { const a = map.get(r.user_id) || []; a.push(r.permission); map.set(r.user_id, a); }
  return [...map.entries()].map(([user_id, permissions]) => ({ user_id, permissions }));
}
