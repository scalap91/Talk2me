/**
 * Talk2Me — OTP par téléphone (Pascal 2026-06-24). Même esprit que le magic-link email :
 * on génère un code 6 chiffres, TTL 10 min, one-shot, max 5 tentatives. Module isolé.
 */
import { randomInt } from 'node:crypto';
import { getDb } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

const OTP_TTL_MS = 5 * 60 * 1000; // code valable 5 min (fenêtre courte = plus sûr)
const MAX_ATTEMPTS = 5;

// Compte de DÉMO REVIEWERS (Google Play / App Store) — Pascal 2026-07-06, révisé 2026-09-05.
// Numéro + code FIXES, SANS SMS : les reviewers ne peuvent pas recevoir de SMS. Tout est CÔTÉ
// SERVEUR et configurable par env (activation/désactivation sans toucher l'app, aucun secret
// embarqué côté client). Scopé au(x) seul(s) numéro(s) fictif(s) → jamais un compte ordinaire,
// aucun bypass global.
//   REVIEWER_DEMO_ENABLED=0          → coupe complètement le bypass
//   REVIEWER_DEMO_PHONE=+261...,+... → numéro(s) fictif(s) acceptés (défaut : +261000000000 pour
//                                      Apple, +261340000000 conservé pour l'existant Google Play)
//   REVIEWER_DEMO_CODE=000000        → code fixe
//   REVIEWER_DEMO_NOTIFY_EMAIL       → boîte notifiée à chaque connexion reviewer (supervision)
const REVIEWER_DEMO_ENABLED = (process.env.REVIEWER_DEMO_ENABLED ?? '1') !== '0';
const REVIEWER_DEMO_PHONES: string[] = (process.env.REVIEWER_DEMO_PHONE || '+261000000000,+261340000000')
  .split(',')
  .map((p) => normalizePhone(p.trim()))
  .filter((p): p is string => !!p);
export const REVIEWER_DEMO_CODE = (process.env.REVIEWER_DEMO_CODE || '000000').trim();
export const REVIEWER_DEMO_NOTIFY_EMAIL = (process.env.REVIEWER_DEMO_NOTIFY_EMAIL || 'pascal.repir@gmail.com').trim();
// Rétro-compat : 1er numéro (usages qui importaient REVIEWER_DEMO_PHONE).
export const REVIEWER_DEMO_PHONE = REVIEWER_DEMO_PHONES[0] || null;
/** true si ce numéro est un numéro de démo reviewer ET que le bypass est activé côté serveur. */
export function isReviewerDemoPhone(phone: string): boolean {
  return REVIEWER_DEMO_ENABLED && REVIEWER_DEMO_PHONES.includes(phone);
}
/** true si (numéro reviewer + code fixe). Jamais un compte ordinaire, jamais de bypass global. */
export function isReviewerDemo(phone: string, code: string): boolean {
  return isReviewerDemoPhone(phone) && (code || '').trim() === REVIEWER_DEMO_CODE;
}

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
  if (!row) { console.log('[otp-verify] echec=aucun_code_valide (expire/deja_utilise/annule_par_un_plus_recent)'); return false; }
  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare('UPDATE phone_otp SET used_at = ? WHERE id = ?').run(now, row.id);
    console.log('[otp-verify] echec=trop_de_tentatives (5 max) -> ce code est verrouille, redemande-en un neuf');
    return false;
  }
  if (row.code !== (code || '').trim()) {
    db.prepare('UPDATE phone_otp SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    console.log(`[otp-verify] echec=code_ne_correspond_pas (tentative ${row.attempts + 1}/${MAX_ATTEMPTS})`);
    return false;
  }
  db.prepare('UPDATE phone_otp SET used_at = ? WHERE id = ?').run(now, row.id);
  console.log('[otp-verify] OK');
  return true;
}
