/**
 * Talk2Me — Sessions WEB (desktop liées par QR). Pascal 2026-06-26, sécurité.
 *
 * On marque les sessions créées par appairage QR comme `kind='web'` avec l'IP et
 * le navigateur de l'ORDINATEUR. Règles :
 *  - UNE SEULE session web ouverte à la fois par user (une nouvelle révoque les
 *    autres) → « jusqu'à une connexion ouverte, pas plus ».
 *  - Visible/gérable par l'user (IP, date) + déconnexion à distance.
 *  - Sert aussi de base au step-up paiement desktop (tout paiement desktop exige
 *    une validation mobile). Doctrine [[project_talk2me_qr_web_login]].
 *
 * La session NATIVE (APK/SMS) reste `kind=NULL` → jamais impactée par ces règles.
 */
import { randomBytes } from 'crypto';
import { getDb } from '@/lib/db';

function ensure() {
  const db = getDb();
  for (const sql of [
    "ALTER TABLE sessions ADD COLUMN kind TEXT",
    "ALTER TABLE sessions ADD COLUMN ip TEXT",
    "ALTER TABLE sessions ADD COLUMN user_agent TEXT",
    "ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER",
    "ALTER TABLE sessions ADD COLUMN pub_id TEXT",
  ]) { try { db.exec(sql); } catch { /* colonne déjà là */ } }
  return db;
}

export interface WebSession {
  pub_id: string; ip: string | null; user_agent: string | null;
  created_at: number; last_seen_at: number | null; current: boolean;
}

/** Marque une session comme WEB (desktop) + applique la règle « une seule ». */
export function markSessionWeb(token: string, ip: string | null, userAgent: string | null): string {
  const db = ensure();
  const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as { user_id?: string } | undefined;
  const pubId = randomBytes(8).toString('hex');
  const now = Date.now();
  db.prepare('UPDATE sessions SET kind = \'web\', ip = ?, user_agent = ?, last_seen_at = ?, pub_id = ? WHERE token = ?')
    .run(ip, userAgent, now, pubId, token);
  // UNE SEULE session web : on révoque toutes les autres sessions web de cet user.
  if (row?.user_id) {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND kind = 'web' AND token != ?").run(row.user_id, token);
  }
  return pubId;
}

/** Vrai si la session courante est une session WEB (desktop) → step-up paiement. */
export function isWebSession(token: string): boolean {
  if (!token) return false;
  const db = ensure();
  const r = db.prepare('SELECT kind FROM sessions WHERE token = ?').get(token) as { kind?: string | null } | undefined;
  return r?.kind === 'web';
}

/** Rafraîchit l'IP / dernière activité d'une session web (au poll desktop). */
export function touchWebSession(token: string, ip: string | null): void {
  if (!token) return;
  const db = ensure();
  db.prepare("UPDATE sessions SET last_seen_at = ?, ip = COALESCE(?, ip) WHERE token = ? AND kind = 'web'")
    .run(Date.now(), ip, token);
}

/** Liste les ordinateurs connectés (sessions web) de l'user. */
export function listWebSessions(userId: string, currentToken: string): WebSession[] {
  const db = ensure();
  const rows = db.prepare(
    "SELECT token, pub_id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ? AND kind = 'web' ORDER BY last_seen_at DESC, created_at DESC"
  ).all(userId) as Array<{ token: string; pub_id: string | null; ip: string | null; user_agent: string | null; created_at: number; last_seen_at: number | null }>;
  return rows.map((r) => ({
    pub_id: r.pub_id || '', ip: r.ip, user_agent: r.user_agent,
    created_at: r.created_at, last_seen_at: r.last_seen_at, current: r.token === currentToken,
  }));
}

/** Déconnecte un ordinateur (révoque sa session web) par identifiant public. */
export function revokeWebSession(userId: string, pubId: string): boolean {
  const db = ensure();
  const r = db.prepare("DELETE FROM sessions WHERE user_id = ? AND kind = 'web' AND pub_id = ?").run(userId, pubId);
  return r.changes > 0;
}
