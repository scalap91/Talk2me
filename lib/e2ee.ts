import 'server-only';

/**
 * E2EE Phase 0 (Pascal 2026-07-09) — REGISTRE DES CLÉS PUBLIQUES.
 * Chaque user publie sa clé PUBLIQUE (ECDH P-256, JWK). La clé PRIVÉE ne quitte JAMAIS
 * son appareil (IndexedDB, cf lib/e2ee-client). Le serveur ne stocke que du public → il
 * ne peut PAS déchiffrer les messages amis↔amis (c'est le but).
 * Modèle : conv amis↔amis chiffrée ; Léa ne lit QUE les messages qu'on lui tague (le tag = l'autorisation).
 */
import { getDb } from '@/lib/db';

let _e = false;
function ensure(): void {
  if (_e) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS user_keys (
    user_id    TEXT PRIMARY KEY,
    public_jwk TEXT NOT NULL,
    alg        TEXT NOT NULL DEFAULT 'ECDH-P256',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  _e = true;
}

/** Publie/actualise la clé publique de l'user (JWK sérialisé). */
export function setUserPublicKey(userId: string, publicJwk: string): void {
  ensure();
  const now = Date.now();
  getDb().prepare(
    `INSERT INTO user_keys (user_id, public_jwk, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET public_jwk = excluded.public_jwk, updated_at = excluded.updated_at`,
  ).run(userId, publicJwk, now, now);
}

/** Clé publique (JWK sérialisé) d'un user, ou null s'il n'en a pas encore. */
export function getUserPublicKey(userId: string): string | null {
  ensure();
  const r = getDb().prepare('SELECT public_jwk FROM user_keys WHERE user_id = ?').get(userId) as { public_jwk: string } | undefined;
  return r?.public_jwk ?? null;
}

/** L'user a-t-il déjà publié une clé ? (le client décide de (re)générer sinon). */
export function hasUserPublicKey(userId: string): boolean {
  return !!getUserPublicKey(userId);
}

// ─────────── MULTI-APPAREIL (Pascal 2026-09-01) — clés PAR APPAREIL ───────────
// Une clé publique par (user, device). On chiffre un message vers TOUS les appareils du
// destinataire ET les siens (relecture partout). Auto-réparation : chaque appareil republie
// sa clé au démarrage. La table user_keys (1/user) reste pour la rétro-compat des vieux clients.
let _ed = false;
function ensureDev(): void {
  if (_ed) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS user_device_keys (
    user_id    TEXT NOT NULL,
    device_id  TEXT NOT NULL,
    public_jwk TEXT NOT NULL,
    alg        TEXT NOT NULL DEFAULT 'ECDH-P256',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, device_id)
  )`);
  _ed = true;
}

/** Publie/actualise la clé publique d'UN appareil de l'user. */
export function setUserDeviceKey(userId: string, deviceId: string, publicJwk: string): void {
  ensureDev();
  const now = Date.now();
  getDb().prepare(
    `INSERT INTO user_device_keys (user_id, device_id, public_jwk, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, device_id) DO UPDATE SET public_jwk = excluded.public_jwk, updated_at = excluded.updated_at`,
  ).run(userId, deviceId, publicJwk, now, now);
}

/** Toutes les clés publiques (appareils) d'un user. */
export function getUserDeviceKeys(userId: string): { device_id: string; public_jwk: string }[] {
  ensureDev();
  return getDb().prepare('SELECT device_id, public_jwk FROM user_device_keys WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as { device_id: string; public_jwk: string }[];
}

