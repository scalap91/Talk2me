/**
 * Talk2Me — OTP par téléphone (Pascal 2026-06-24). Même esprit que le magic-link email :
 * on génère un code 6 chiffres, TTL 10 min, one-shot, max 5 tentatives. Module isolé.
 */
import { randomInt } from 'node:crypto';
import { getDb } from '@/lib/db';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

let _init = false;
function ensure() {
  if (_init) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS phone_otp (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_phone_otp_phone ON phone_otp(phone, created_at DESC);
  `);
  _init = true;
}

/** Génère et stocke un OTP pour ce numéro (invalide les précédents). Retourne le code. */
export function createPhoneOtp(phone: string): string {
  ensure();
  const db = getDb();
  const now = Date.now();
  // Invalide les OTP précédents non utilisés de ce numéro.
  db.prepare('UPDATE phone_otp SET used_at = ? WHERE phone = ? AND used_at IS NULL').run(now, phone);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const id = `${now.toString(36)}-${randomInt(0, 1e9).toString(36)}`;
  db.prepare('INSERT INTO phone_otp (id, phone, code, created_at, expires_at) VALUES (?,?,?,?,?)')
    .run(id, phone, code, now, now + OTP_TTL_MS);
  return code;
}

/** Vérifie le code. Retourne true si valide (et consomme l'OTP). */
export function verifyPhoneOtp(phone: string, code: string): boolean {
  ensure();
  const db = getDb();
  const now = Date.now();
  const row = db
    .prepare('SELECT * FROM phone_otp WHERE phone = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
    .get(phone, now) as { id: string; code: string; attempts: number } | undefined;
  if (!row) return false;
  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare('UPDATE phone_otp SET used_at = ? WHERE id = ?').run(now, row.id);
    return false;
  }
  if (row.code !== (code || '').trim()) {
    db.prepare('UPDATE phone_otp SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return false;
  }
  db.prepare('UPDATE phone_otp SET used_at = ? WHERE id = ?').run(now, row.id);
  return true;
}
