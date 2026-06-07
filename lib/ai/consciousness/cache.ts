/**
 * Cache in-memory du bloc consciousness (Pascal 2026-06-04).
 *
 * TTL 60s par clé `${userId}::${mode}`. Évite de relire memories+habits+friends
 * en DB à chaque tour de chat tout en restant frais (un nouveau memory ajouté
 * est visible dans la minute).
 *
 * Pas de Redis : process unique (PM2 fork), Map suffit. Le cache se vide
 * naturellement au restart.
 */

import type { ConsciousnessMode } from './types';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const TTL_MS = 60_000;
const store: Map<string, CacheEntry> = new Map();

function makeKey(userId: string, mode: ConsciousnessMode): string {
  return `${userId}::${mode}`;
}

export function getCached(userId: string, mode: ConsciousnessMode): string | null {
  const key = makeKey(userId, mode);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(
  userId: string,
  mode: ConsciousnessMode,
  value: string,
): void {
  const key = makeKey(userId, mode);
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/** Invalide explicitement le cache d'un user (ex : memory ajoutée). */
export function invalidateUser(userId: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(`${userId}::`)) {
      store.delete(key);
    }
  }
}

/** Debug : retourne taille courante (utile dans logs). */
export function cacheSize(): number {
  return store.size;
}
