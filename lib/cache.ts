/**
 * Cache UNIFIÉ — seam multi-serveur (Pascal 2026-06-30, prépa « plusieurs millions
 * d'users »). Aujourd'hui : backend MÉMOIRE (Map, par process). Demain multi-serveur :
 * il suffira de brancher REDIS ICI (interface déjà ASYNC) → tous les modules qui
 * passent par ce cache deviennent partagés entre serveurs SANS réécriture.
 *
 * Pourquoi : les caches en `Map` locale ne sont PAS partagés entre réplicas → sur
 * plusieurs serveurs, un hit sur le serveur A est un miss sur le serveur B. Ce
 * module est LE point unique où l'on bascule vers un cache partagé.
 *
 * Migration cible (quand on déploie N serveurs) :
 *   - poser REDIS_URL en env + `CACHE_BACKEND=redis`,
 *   - implémenter le backend redis ci-dessous (get/set/del),
 *   - rien d'autre à changer côté appelants.
 */

type Entry = { v: unknown; exp: number };

const mem = new Map<string, Entry>();
const BACKEND = process.env.CACHE_BACKEND || 'memory';

// Nettoyage paresseux : on purge à la lecture (pas de timer global).
function liveMem(key: string): Entry | null {
  const e = mem.get(key);
  if (!e) return null;
  if (e.exp && Date.now() > e.exp) { mem.delete(key); return null; }
  return e;
}

/** Récupère une valeur typée du cache (ou null si absente/expirée). */
export async function cacheGet<T>(key: string): Promise<T | null> {
  // if (BACKEND === 'redis') { return redisGet<T>(key); }  // ← seam multi-serveur
  const e = liveMem(key);
  return e ? (e.v as T) : null;
}

/** Pose une valeur avec TTL en secondes (0 = pas d'expiration). */
export async function cacheSet(key: string, value: unknown, ttlSec = 0): Promise<void> {
  // if (BACKEND === 'redis') { return redisSet(key, value, ttlSec); }  // ← seam
  mem.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
}

/** Supprime une clé. */
export async function cacheDel(key: string): Promise<void> {
  // if (BACKEND === 'redis') { return redisDel(key); }  // ← seam
  mem.delete(key);
}

/** Helper get-or-compute : renvoie le cache, sinon calcule + met en cache. */
export async function cacheRemember<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const v = await compute();
  await cacheSet(key, v, ttlSec);
  return v;
}

/** Diagnostic (taille du cache mémoire courant). */
export function cacheStats() {
  return { backend: BACKEND, memEntries: mem.size };
}
