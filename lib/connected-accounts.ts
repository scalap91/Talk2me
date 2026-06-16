'use server-only';

/**
 * Talk2Me — COMPTES CONNECTÉS (Pascal 2026-06-10). Stocke les tokens OAuth des
 * réseaux (Facebook Page, Instagram, YouTube) pour le POST DIRECT multi-canal.
 *
 * ⚠️ SÉCURITÉ : les tokens sont CHIFFRÉS au repos (AES-256-GCM) et ne transitent
 * JAMAIS dans les tuyaux IA (doctrine PII air-gap). Clé : env CONNECTED_ACCOUNTS_KEY
 * sinon fichier persistant data/.ca-key (hors git).
 */

import { getDb } from '@/lib/db';
import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS connected_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,          -- 'facebook_page' | 'instagram' | 'youtube'
      external_id TEXT,                -- page_id / ig_user_id / channel_id
      name TEXT,                       -- nom lisible (page, @compte, chaîne)
      token_enc TEXT NOT NULL,         -- access token CHIFFRÉ
      refresh_enc TEXT,                -- refresh token CHIFFRÉ (Google)
      expires_at INTEGER,
      meta_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, provider, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_conacc_user ON connected_accounts(user_id, provider);
  `);
  ensured = true;
}

// ---- Clé de chiffrement (32 bytes) ----
let _key: Buffer | null = null;
function key(): Buffer {
  if (_key) return _key;
  const envk = process.env.CONNECTED_ACCOUNTS_KEY;
  if (envk && envk.length >= 64) { _key = Buffer.from(envk.slice(0, 64), 'hex'); return _key; }
  const path = process.cwd() + '/data/.ca-key';
  try {
    if (existsSync(path)) { _key = Buffer.from(readFileSync(path, 'utf8').trim(), 'hex'); return _key; }
    const k = randomBytes(32);
    writeFileSync(path, k.toString('hex'), { mode: 0o600 });
    _key = k; return _key;
  } catch {
    // dernier recours (process-éphémère) — ne devrait pas arriver
    _key = randomBytes(32); return _key;
  }
}

function enc(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}
function dec(blob: string): string {
  const [iv, tag, ct] = blob.split(':');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

export type Provider = 'facebook_page' | 'instagram' | 'youtube';

export interface ConnectedAccount {
  id: string; user_id: string; provider: Provider; external_id: string | null;
  name: string | null; access_token: string; refresh_token: string | null;
  expires_at: number | null; meta: Record<string, unknown>;
}

export function upsertAccount(userId: string, provider: Provider, a: {
  externalId?: string | null; name?: string | null; accessToken: string;
  refreshToken?: string | null; expiresAt?: number | null; meta?: Record<string, unknown>;
}): void {
  ensure();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO connected_accounts (id, user_id, provider, external_id, name, token_enc, refresh_enc, expires_at, meta_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider, external_id) DO UPDATE SET
      name=excluded.name, token_enc=excluded.token_enc, refresh_enc=COALESCE(excluded.refresh_enc, connected_accounts.refresh_enc),
      expires_at=excluded.expires_at, meta_json=excluded.meta_json, updated_at=excluded.updated_at
  `).run(randomUUID(), userId, provider, a.externalId ?? '', a.name ?? null,
    enc(a.accessToken), a.refreshToken ? enc(a.refreshToken) : null,
    a.expiresAt ?? null, JSON.stringify(a.meta || {}), now, now);
}

/** Statut public (AUCUN token) — pour l'UI « Comptes connectés ». */
export function listConnected(userId: string): { provider: Provider; external_id: string | null; name: string | null }[] {
  ensure();
  return getDb().prepare('SELECT provider, external_id, name FROM connected_accounts WHERE user_id = ?').all(userId) as { provider: Provider; external_id: string | null; name: string | null }[];
}

/** Usage SERVEUR uniquement (publication) — déchiffre le token. Jamais exposé au client/IA. */
export function getAccount(userId: string, provider: Provider): ConnectedAccount | null {
  ensure();
  const r = getDb().prepare('SELECT * FROM connected_accounts WHERE user_id = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1').get(userId, provider) as Record<string, unknown> | undefined;
  if (!r) return null;
  try {
    return {
      id: r.id as string, user_id: r.user_id as string, provider: r.provider as Provider,
      external_id: (r.external_id as string) || null, name: (r.name as string) || null,
      access_token: dec(r.token_enc as string),
      refresh_token: r.refresh_enc ? dec(r.refresh_enc as string) : null,
      expires_at: (r.expires_at as number) ?? null,
      meta: JSON.parse((r.meta_json as string) || '{}'),
    };
  } catch { return null; }
}

export function deleteAccounts(userId: string, provider?: Provider): number {
  ensure();
  return provider
    ? getDb().prepare('DELETE FROM connected_accounts WHERE user_id = ? AND provider = ?').run(userId, provider).changes
    : getDb().prepare('DELETE FROM connected_accounts WHERE user_id = ?').run(userId).changes;
}
