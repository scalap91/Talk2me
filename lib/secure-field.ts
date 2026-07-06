import 'server-only';

/**
 * Talk2Me — chiffrement de champs sensibles (AES-256-GCM). Pascal 2026-06-22.
 * Pour les données type CNI / numéro : on ne stocke JAMAIS en clair en base.
 * Clé : env SECURE_FIELD_KEY (hex 64) sinon fichier data/.field-key (auto-généré, 0600).
 * Même schéma que lib/connected-accounts.ts.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';

let _key: Buffer | null = null;
function key(): Buffer {
  if (_key) return _key;
  const envk = process.env.SECURE_FIELD_KEY;
  if (envk && envk.length >= 64) { _key = Buffer.from(envk.slice(0, 64), 'hex'); return _key; }
  const path = process.cwd() + '/data/.field-key';
  try {
    if (existsSync(path)) { _key = Buffer.from(readFileSync(path, 'utf8').trim(), 'hex'); return _key; }
    const k = randomBytes(32);
    writeFileSync(path, k.toString('hex'), { mode: 0o600 });
    _key = k; return _key;
  } catch {
    _key = randomBytes(32); return _key;
  }
}

/** Chiffre une chaîne → "iv:tag:ct" (base64). */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Déchiffre "iv:tag:ct" → clair. Renvoie '' si invalide. */
export function decryptField(blob: string | null | undefined): string {
  if (!blob) return '';
  try {
    const [iv, tag, ct] = blob.split(':');
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch { return ''; }
}

/** Masque un numéro pour affichage : garde les 4 derniers. */
export function maskTail(value: string | null | undefined, keep = 4): string {
  const v = (value || '').trim();
  if (!v) return '';
  if (v.length <= keep) return v;
  return '•'.repeat(Math.min(6, v.length - keep)) + v.slice(-keep);
}
