/**
 * Talk2Me — Déverrouillage WEB par QR (Pascal 2026-06-26), façon WhatsApp Web.
 *
 * Le desktop (non connecté) affiche un QR. Le mobile DÉJÀ connecté le scanne →
 * ouvre /link?t=<token> → approuve → on crée une session pour SON user et on la
 * range dans la ligne du token. Le desktop, qui poll /api/auth/qr/status, reçoit
 * alors le cookie de session et entre dans l'app. Aucun mot de passe sur le PC.
 *
 * Sécurité : token aléatoire 32 octets, durée de vie courte (2 min), USAGE UNIQUE
 * (consommé à la livraison du cookie). Le token n'est PAS une PII. L'approbation
 * exige une session mobile valide (getCurrentUserFromRequest côté route).
 */
import { randomBytes } from 'crypto';
import { getDb, createSession } from '@/lib/db';
import { markSessionWeb } from '@/lib/web-sessions';

const TTL_MS = 2 * 60 * 1000; // 2 minutes

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS web_link_tokens (
      token TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | consumed
      approved_user_id TEXT,
      session_token TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  // IP + navigateur de l'ORDINATEUR (capturés au /start) → transférés à la session web.
  for (const sql of ["ALTER TABLE web_link_tokens ADD COLUMN desktop_ip TEXT", "ALTER TABLE web_link_tokens ADD COLUMN desktop_ua TEXT"]) {
    try { db.exec(sql); } catch { /* déjà */ }
  }
  return db;
}

export interface LinkRow {
  token: string;
  status: 'pending' | 'approved' | 'consumed';
  approved_user_id: string | null;
  session_token: string | null;
  created_at: number;
  expires_at: number;
}

/** Desktop : crée un token d'appairage en attente (avec IP + navigateur du PC). */
export function createLinkToken(desktopIp?: string | null, desktopUa?: string | null): { token: string; expires_at: number } {
  const db = ensure();
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expires = now + TTL_MS;
  db.prepare('INSERT INTO web_link_tokens (token, status, created_at, expires_at, desktop_ip, desktop_ua) VALUES (?, \'pending\', ?, ?, ?, ?)').run(token, now, expires, desktopIp ?? null, desktopUa ?? null);
  // Ménage opportuniste des vieux tokens.
  db.prepare('DELETE FROM web_link_tokens WHERE expires_at <= ?').run(now);
  return { token, expires_at: expires };
}

/** Lecture brute (statut + validité). */
export function getLinkToken(token: string): LinkRow | null {
  if (!token) return null;
  const db = ensure();
  const r = db.prepare('SELECT * FROM web_link_tokens WHERE token = ?').get(token) as LinkRow | undefined;
  if (!r) return null;
  if (r.expires_at <= Date.now() && r.status === 'pending') return { ...r, status: 'pending' }; // expiré = traité côté appelant
  return r;
}

/** Mobile connecté : approuve l'appairage → crée une session pour SON user. */
export function approveLinkToken(token: string, userId: string): { ok: boolean; error?: string } {
  const db = ensure();
  const r = db.prepare('SELECT * FROM web_link_tokens WHERE token = ?').get(token) as LinkRow | undefined;
  if (!r) return { ok: false, error: 'not_found' };
  if (r.expires_at <= Date.now()) return { ok: false, error: 'expired' };
  if (r.status !== 'pending') return { ok: false, error: 'already_used' };
  const session = createSession(userId);
  // Session WEB : on y attache l'IP/navigateur du PC + on applique « une seule session web ».
  const rr = r as LinkRow & { desktop_ip?: string | null; desktop_ua?: string | null };
  try { markSessionWeb(session.token, rr.desktop_ip ?? null, rr.desktop_ua ?? null); } catch { /* */ }
  db.prepare('UPDATE web_link_tokens SET status = \'approved\', approved_user_id = ?, session_token = ? WHERE token = ?')
    .run(userId, session.token, token);
  return { ok: true };
}

/**
 * Desktop (poll) : si approuvé, livre le token de session UNE SEULE FOIS puis
 * marque le token consommé. Retourne null tant que ce n'est pas approuvé.
 */
export function consumeApprovedSession(token: string): string | null {
  const db = ensure();
  const r = db.prepare('SELECT * FROM web_link_tokens WHERE token = ?').get(token) as LinkRow | undefined;
  if (!r || r.status !== 'approved' || !r.session_token) return null;
  db.prepare('UPDATE web_link_tokens SET status = \'consumed\' WHERE token = ?').run(token);
  return r.session_token;
}
