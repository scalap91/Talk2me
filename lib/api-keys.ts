/**
 * Talk2Me — Magasin de clés API avec KILL SWITCH (Pascal 2026-06-08).
 *
 * Doctrine : "je retire la clé → le jus se coupe, point barre." Les clés sont
 * gérées en DB et OVERRIDENT process.env EN DIRECT. Comme toutes les
 * intégrations lisent process.env[X] au moment de l'appel, couper une clé
 * éteint la capacité au prochain appel — sans toucher au code des intégrations.
 *
 * - Pas d'override en DB → on garde la valeur .env d'origine.
 * - Override activé + valeur → on utilise la valeur DB (sinon le .env d'origine).
 * - Override désactivé (enabled=0) → process.env[X] = '' → COUPÉ (même si .env a une clé).
 *
 * Le snapshot des valeurs .env d'origine est capturé au 1er import (avant tout
 * override), pour pouvoir réactiver sans reposer la clé.
 */

import type DatabaseType from 'better-sqlite3';

export interface ApiProvider {
  provider: string;
  env: string;
  label: string;
  critical?: boolean;
}

export const API_PROVIDERS: ApiProvider[] = [
  { provider: 'deepseek', env: 'DEEPSEEK_API_KEY', label: 'DeepSeek — IA L2 (cœur)', critical: true },
  { provider: 'brave', env: 'BRAVE_SEARCH_API_KEY', label: 'Brave Search — recherche web' },
  { provider: 'youtube', env: 'YOUTUBE_API_KEY', label: 'YouTube — vidéos' },
  { provider: 'brevo', env: 'BREVO_API_KEY', label: 'Brevo — emails (liens magiques)' },
  { provider: 'unsplash', env: 'UNSPLASH_ACCESS_KEY', label: 'Unsplash — images' },
  { provider: 'music_hub', env: 'MUSIC_HUB_API_KEY', label: 'Music Hub — musique' },
  { provider: 'cjdropshipping', env: 'CJ_DROPSHIPPING_API_KEY', label: 'CJdropshipping — dropshipping (import + commandes)' },
  { provider: 'vision', env: 'VISION_API_KEY', label: 'Vision IA — sélection des belles photos cohérentes (boutiques)' },
];

// Snapshot .env d'origine (capturé 1 fois, AVANT tout override).
const ORIGINAL_ENV: Record<string, string> = {};
for (const p of API_PROVIDERS) ORIGINAL_ENV[p.provider] = process.env[p.env] || '';

export function ensureApiKeysTable(db: DatabaseType.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS api_keys (
       provider TEXT PRIMARY KEY,
       value TEXT,
       enabled INTEGER NOT NULL DEFAULT 1,
       updated_at INTEGER NOT NULL
     )`
  );
}

/** Applique le magasin DB sur process.env (effet immédiat sur les intégrations). */
export function applyApiKeysToEnv(db: DatabaseType.Database): void {
  ensureApiKeysTable(db);
  const rows = db
    .prepare('SELECT provider, value, enabled FROM api_keys')
    .all() as { provider: string; value: string | null; enabled: number }[];
  const map = new Map(rows.map((r) => [r.provider, r]));
  for (const p of API_PROVIDERS) {
    const row = map.get(p.provider);
    if (!row) {
      process.env[p.env] = ORIGINAL_ENV[p.provider]; // pas d'override → .env d'origine
    } else if (!row.enabled) {
      process.env[p.env] = ''; // COUPÉ
    } else {
      process.env[p.env] = row.value && row.value.trim() ? row.value.trim() : ORIGINAL_ENV[p.provider];
    }
  }
}

/** Modifie/coupe une clé puis ré-applique. */
export function setApiKey(
  db: DatabaseType.Database,
  provider: string,
  opts: { value?: string | null; enabled?: boolean }
): void {
  if (!API_PROVIDERS.some((p) => p.provider === provider)) throw new Error('unknown_provider');
  ensureApiKeysTable(db);
  const existing = db
    .prepare('SELECT value, enabled FROM api_keys WHERE provider = ?')
    .get(provider) as { value: string | null; enabled: number } | undefined;
  const value = opts.value !== undefined ? opts.value ?? '' : existing?.value ?? '';
  const enabled = opts.enabled !== undefined ? (opts.enabled ? 1 : 0) : existing?.enabled ?? 1;
  db.prepare(
    `INSERT INTO api_keys (provider, value, enabled, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET value = excluded.value, enabled = excluded.enabled, updated_at = excluded.updated_at`
  ).run(provider, value, enabled, Date.now());
  applyApiKeysToEnv(db);
}

/** Supprime l'override → revient à la valeur .env d'origine. */
export function deleteApiKeyOverride(db: DatabaseType.Database, provider: string): void {
  ensureApiKeysTable(db);
  db.prepare('DELETE FROM api_keys WHERE provider = ?').run(provider);
  applyApiKeysToEnv(db);
}

/** État de chaque clé pour l'UI admin (valeur masquée, jamais en clair). */
export function listApiKeyStatus(db: DatabaseType.Database) {
  ensureApiKeysTable(db);
  const rows = db
    .prepare('SELECT provider, value, enabled, updated_at FROM api_keys')
    .all() as { provider: string; value: string | null; enabled: number; updated_at: number }[];
  const map = new Map(rows.map((r) => [r.provider, r]));
  return API_PROVIDERS.map((p) => {
    const row = map.get(p.provider);
    const effective = process.env[p.env] || '';
    const enabled = row ? !!row.enabled : ORIGINAL_ENV[p.provider] !== '';
    return {
      provider: p.provider,
      label: p.label,
      env: p.env,
      critical: !!p.critical,
      active: effective.length > 0 && enabled, // le jus coule ?
      enabled,
      overridden: !!row,
      source: row ? (row.value ? 'db' : 'env') : ORIGINAL_ENV[p.provider] ? 'env' : 'none',
      masked: effective ? `••••${effective.slice(-4)}` : null,
      updated_at: row?.updated_at ?? null,
    };
  });
}
