import 'server-only';
/**
 * Préférences d'édition du Discovery par SON propriétaire (Pascal 2026-08-31) : le Discovery est SA page,
 * modifiable. PAR DÉFAUT TOUT s'affiche ; le propriétaire RETIRE les ÉLÉMENTS qu'il ne veut pas (un post,
 * un like, un morceau, un produit…) → leurs IDs vont dans hidden_items (masqués pour TOUS). Il peut aussi
 * REMPLACER ou EFFACER le texte de l'IA (portrait_override, prime sur l'IA). Table légère, séparée de
 * discovery_ai (cache IA). hidden_items vide = tout visible.
 */
import { getDb } from '@/lib/db';

let _ensured = false;
function ensure(): void {
  if (_ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS discovery_prefs (
      user_id TEXT PRIMARY KEY,
      portrait_override TEXT,
      hidden_items TEXT,
      updated_at INTEGER
    );
  `);
  _ensured = true;
}

export interface DiscoveryPrefs { portraitOverride: string | null; hidden: string[] }

export function getDiscoveryPrefs(userId: string): DiscoveryPrefs {
  if (!userId) return { portraitOverride: null, hidden: [] };
  ensure();
  const row = getDb().prepare('SELECT portrait_override, hidden_items FROM discovery_prefs WHERE user_id = ?').get(userId) as { portrait_override: string | null; hidden_items: string | null } | undefined;
  let hidden: string[] = [];
  try { hidden = row?.hidden_items ? (JSON.parse(row.hidden_items) as string[]) : []; } catch { hidden = []; }
  const po = (row?.portrait_override ?? '').trim();
  return { portraitOverride: po ? po : null, hidden: Array.isArray(hidden) ? hidden : [] };
}

/** Ensemble des IDs masqués (pour filtrer un facet). */
export function getHiddenSet(userId: string): Set<string> {
  return new Set(getDiscoveryPrefs(userId).hidden);
}

/** Met à jour (partiellement) les préférences. Ne touche qu'aux champs fournis. hidden = liste COMPLÈTE. */
export function setDiscoveryPrefs(userId: string, patch: { portraitOverride?: string | null; hidden?: string[] }): DiscoveryPrefs {
  ensure();
  const cur = getDiscoveryPrefs(userId);
  const next: DiscoveryPrefs = {
    portraitOverride: patch.portraitOverride !== undefined ? ((patch.portraitOverride ?? '').trim() || null) : cur.portraitOverride,
    hidden: patch.hidden !== undefined ? Array.from(new Set(patch.hidden.filter((s) => typeof s === 'string' && s))).slice(0, 500) : cur.hidden,
  };
  getDb().prepare(
    'INSERT INTO discovery_prefs (user_id, portrait_override, hidden_items, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET portrait_override=excluded.portrait_override, hidden_items=excluded.hidden_items, updated_at=excluded.updated_at'
  ).run(userId, next.portraitOverride, JSON.stringify(next.hidden), Date.now());
  return next;
}
