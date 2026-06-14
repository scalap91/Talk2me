'use server-only';

/**
 * Clés IA par utilisateur (BYOK — Pascal 2026-06-11 : « chaque user met SA clé,
 * chacun a droit à ses crédits »). Le Studio Vidéo utilise la clé de l'user si
 * présente, sinon la clé plateforme (démo). Clés CHIFFRÉES AES-256-GCM, JAMAIS
 * exposées en clair ni passées dans les tuyaux IA ([[talk2me-pii-air-gap]]).
 * Même clé de chiffrement que connected-accounts (CONNECTED_ACCOUNTS_KEY / data/.ca-key).
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getDb } from '@/lib/db';

export type AiProvider = 'elevenlabs' | 'pexels' | 'huggingface';
export const AI_PROVIDERS: AiProvider[] = ['elevenlabs', 'pexels', 'huggingface'];

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS user_ai_keys (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      enc_key TEXT NOT NULL,      -- clé API chiffrée
      hint TEXT,                  -- 4 derniers caractères (affichage masqué)
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider)
    );
  `);
  ensured = true;
}

let _key: Buffer | null = null;
function key(): Buffer {
  if (_key) return _key;
  const envk = process.env.CONNECTED_ACCOUNTS_KEY;
  if (envk && envk.length >= 64) { _key = Buffer.from(envk.slice(0, 64), 'hex'); return _key; }
  const path = '/home/ubuntu/talktome/data/.ca-key';
  try {
    if (existsSync(path)) { _key = Buffer.from(readFileSync(path, 'utf8').trim(), 'hex'); return _key; }
    const k = randomBytes(32);
    writeFileSync(path, k.toString('hex'), { mode: 0o600 });
    _key = k; return _key;
  } catch { _key = randomBytes(32); return _key; }
}
function enc(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}
function dec(blob: string): string {
  const [iv, tag, ct] = blob.split(':');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

/** Enregistre/maj une clé API pour un user (chiffrée). */
export function setAiKey(userId: string, provider: AiProvider, apiKey: string): void {
  ensure();
  const k = (apiKey || '').trim();
  if (!k) return;
  const hint = k.length >= 4 ? k.slice(-4) : '••';
  getDb().prepare(
    `INSERT INTO user_ai_keys (user_id, provider, enc_key, hint, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT(user_id, provider) DO UPDATE SET enc_key=excluded.enc_key, hint=excluded.hint, created_at=excluded.created_at`
  ).run(userId, provider, enc(k), hint, Date.now());
}

/** Récupère la clé EN CLAIR pour usage serveur uniquement (jamais renvoyée au client). */
export function getAiKey(userId: string, provider: AiProvider): string | null {
  ensure();
  const row = getDb().prepare('SELECT enc_key FROM user_ai_keys WHERE user_id=? AND provider=?').get(userId, provider) as { enc_key: string } | undefined;
  if (!row) return null;
  try { return dec(row.enc_key); } catch { return null; }
}

/** Statut masqué pour l'UI : présence + hint (4 derniers car.), JAMAIS la clé. */
export function listAiKeyStatus(userId: string): Record<AiProvider, { set: boolean; hint: string | null }> {
  ensure();
  const rows = getDb().prepare('SELECT provider, hint FROM user_ai_keys WHERE user_id=?').all(userId) as { provider: AiProvider; hint: string | null }[];
  const out = { elevenlabs: { set: false, hint: null }, pexels: { set: false, hint: null }, huggingface: { set: false, hint: null } } as Record<AiProvider, { set: boolean; hint: string | null }>;
  for (const r of rows) if (out[r.provider]) out[r.provider] = { set: true, hint: r.hint };
  return out;
}

export function deleteAiKey(userId: string, provider: AiProvider): void {
  ensure();
  getDb().prepare('DELETE FROM user_ai_keys WHERE user_id=? AND provider=?').run(userId, provider);
}
