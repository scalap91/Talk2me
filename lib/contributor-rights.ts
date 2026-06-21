import 'server-only';

/**
 * Talk2Me — PONT admin ↔ contributeur (Pascal 2026-06-21).
 * L'échelon se gagne AUTOMATIQUEMENT au mérite (network.db). C'est l'admin qui
 * OUVRE ensuite les droits correspondant au rang (couche accès = user_permissions).
 * Ici : la correspondance rang→droits + les helpers que l'espace admin consomme.
 */
import { getNetworkDb } from '@/lib/network-db';
import { getContributor } from '@/lib/network';
import { getUserById } from '@/lib/db';
import { grantedPermissions, setPermission, PERMISSION_KEYS } from '@/lib/permissions';

// Correspondance ÉCHELON → droits ouverts (validée Pascal 2026-06-21).
// Cumulatif : un rang inclut les droits des rangs inférieurs.
export const RANK_RIGHTS: Record<number, string[]> = {
  1: [], // Contributeur : aucun droit spécial (il contribue sur le terrain)
  2: ['eat', 'transport', 'annonces'], // Délégué : gérer les fiches des 3 services
  3: ['eat', 'transport', 'annonces', 'curation_validateur'], // Chef de zone : + valider
  4: ['eat', 'transport', 'annonces', 'curation_validateur', 'curation_regardeur'], // Chef régional : + proposer
  5: [...PERMISSION_KEYS], // Chef national : tous les droits
};

export function rightsForRank(rank: number): string[] {
  return RANK_RIGHTS[rank] || [];
}

export interface AdminContributorRow {
  user_id: string;
  username: string;
  display_name: string | null;
  level_rank: number;
  level_name: string;
  granted: string[];        // droits actuellement ouverts
  expected: string[];       // droits prévus pour son rang
  rights_open: boolean;     // tous les droits du rang sont-ils ouverts ?
}

/** Liste des contributeurs (network.db) enrichie pour l'espace admin. */
export function listContributorsForAdmin(): AdminContributorRow[] {
  const ndb = getNetworkDb();
  const rows = ndb.prepare(
    `SELECT c.user_id, c.level_rank, l.name AS level_name
       FROM contributors c LEFT JOIN contributor_levels l ON l.rank = c.level_rank
      WHERE c.status = 'active'
      ORDER BY c.level_rank DESC, c.personal_score DESC`
  ).all() as { user_id: string; level_rank: number; level_name: string | null }[];

  return rows.map((r) => {
    const u = getUserById(r.user_id);
    const granted = grantedPermissions(r.user_id);
    const expected = rightsForRank(r.level_rank);
    const rights_open = expected.every((p) => granted.includes(p));
    return {
      user_id: r.user_id,
      username: u?.username || '?',
      display_name: u?.display_name || null,
      level_rank: r.level_rank,
      level_name: r.level_name || 'Contributeur',
      granted,
      expected,
      rights_open,
    };
  });
}

/** Ouvre (accorde) les droits correspondant au rang ACTUEL du contributeur. */
export function openRankRights(userId: string, byUserId: string): { ok: boolean; granted: string[] } {
  const c = getContributor(userId);
  if (!c) return { ok: false, granted: [] };
  for (const perm of rightsForRank(c.level_rank)) setPermission(userId, perm, true, byUserId);
  return { ok: true, granted: grantedPermissions(userId) };
}

/** Ferme (révoque) TOUS les droits du contributeur (retour à simple contributeur). */
export function closeAllRights(userId: string): { ok: boolean; granted: string[] } {
  for (const perm of PERMISSION_KEYS) setPermission(userId, perm, false, userId);
  return { ok: true, granted: grantedPermissions(userId) };
}
