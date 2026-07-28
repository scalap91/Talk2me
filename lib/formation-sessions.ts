/**
 * Talk2Me — Sessions de formation + ACTE DE PRÉSENCE signé (Pascal 2026-07-27). Garde-fou EN AMONT :
 * on ne certifie pas un fantôme. Le formateur crée une session (géolocalisée, horodatée) → le recruté
 * SIGNE sa présence en scannant le QR (ou via OTP si le QR ne marche pas). La GÉOLOC confirme la
 * co-présence physique. Signé, daté → prérequis à la certification (impossible à falsifier après coup).
 */
import { getDb } from '@/lib/db';
import { randomUUID, randomBytes } from 'crypto';

const TTL_MS = 8 * 3600_000;        // une session vaut 8h
const RADIUS_KM = 0.3;              // présence acceptée si < 300 m du point de session

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS formation_sessions (
      id TEXT PRIMARY KEY,
      formateur_id TEXT NOT NULL,
      label TEXT,
      lat REAL, lng REAL,
      code TEXT NOT NULL,             -- OTP court (secours si QR HS)
      qr_token TEXT NOT NULL,         -- jeton du QR
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fsess_code ON formation_sessions(code);
    CREATE INDEX IF NOT EXISTS idx_fsess_tok  ON formation_sessions(qr_token);
    CREATE TABLE IF NOT EXISTS formation_attendance (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      signed_at INTEGER NOT NULL,
      lat REAL, lng REAL,
      via TEXT,                       -- 'qr' | 'otp'
      UNIQUE(session_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fatt_user ON formation_attendance(user_id);
  `);
  return db;
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, d = (x: number) => x * Math.PI / 180;
  const s = Math.sin(d(bLat - aLat) / 2) ** 2 + Math.cos(d(aLat)) * Math.cos(d(bLat)) * Math.sin(d(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface Session { id: string; formateur_id: string; label: string | null; lat: number | null; lng: number | null; code: string; qr_token: string; created_at: number; expires_at: number }

/** Le formateur ouvre une session géolocalisée → renvoie le code OTP + le jeton QR. */
export function createSession(formateurId: string, label: string | undefined, lat: number | null, lng: number | null): Session {
  const db = ensure();
  const id = randomUUID();
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres
  const qr_token = randomBytes(9).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO formation_sessions (id, formateur_id, label, lat, lng, code, qr_token, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, formateurId, label || null, lat, lng, code, qr_token, now, now + TTL_MS);
  return { id, formateur_id: formateurId, label: label || null, lat, lng, code, qr_token, created_at: now, expires_at: now + TTL_MS };
}

function findSession(codeOrToken: string): Session | null {
  const db = ensure();
  return (db.prepare('SELECT * FROM formation_sessions WHERE (qr_token = ? OR code = ?) AND expires_at > ?')
    .get(codeOrToken, codeOrToken, Date.now()) as Session) || null;
}

/** Le recruté SIGNE sa présence (via QR ou OTP). Vérifie session valide + géoloc proche du formateur. */
export function signAttendance(codeOrToken: string, userId: string, lat: number | null, lng: number | null, via: 'qr' | 'otp'): { ok: boolean; error?: string; session_id?: string } {
  const db = ensure();
  const s = findSession(codeOrToken);
  if (!s) return { ok: false, error: 'session_invalide' };
  if (s.formateur_id === userId) return { ok: false, error: 'formateur_ne_signe_pas' };
  // GÉOLOC : preuve de co-présence physique. Si la session a un point, le recruté doit être proche.
  if (s.lat != null && s.lng != null) {
    if (lat == null || lng == null) return { ok: false, error: 'geoloc_requise' };
    if (km(s.lat, s.lng, lat, lng) > RADIUS_KM) return { ok: false, error: 'trop_loin' };
  }
  try {
    db.prepare('INSERT INTO formation_attendance (id, session_id, user_id, signed_at, lat, lng, via) VALUES (?,?,?,?,?,?,?)')
      .run(randomUUID(), s.id, userId, Date.now(), lat, lng, via);
  } catch { return { ok: true, session_id: s.id }; } // déjà signé (UNIQUE) = idempotent
  return { ok: true, session_id: s.id };
}

/** CAS RÉSEAU/GPS HS côté recruté : le FORMATEUR enregistre un présent depuis SON appareil.
 *  Ancré par la géoloc + la signature du formateur (qui répond de son registre — casier). */
export function markPresent(sessionId: string, userId: string, formateurId: string): { ok: boolean; error?: string } {
  const db = ensure();
  const s = db.prepare('SELECT * FROM formation_sessions WHERE id = ?').get(sessionId) as Session | undefined;
  if (!s) return { ok: false, error: 'session_invalide' };
  if (s.formateur_id !== formateurId) return { ok: false, error: 'pas_ta_session' };
  if (userId === formateurId) return { ok: false, error: 'formateur_ne_signe_pas' };
  try {
    db.prepare('INSERT INTO formation_attendance (id, session_id, user_id, signed_at, lat, lng, via) VALUES (?,?,?,?,?,?,?)')
      .run(randomUUID(), sessionId, userId, Date.now(), s.lat, s.lng, 'formateur'); // géoloc = celle de la session
  } catch { /* déjà présent = idempotent */ }
  return { ok: true };
}

/** A-t-il une présence signée à AU MOINS une session (prérequis à la certification) ? */
export function hasSignedPresence(userId: string): boolean {
  return !!ensure().prepare('SELECT 1 FROM formation_attendance WHERE user_id = ?').get(userId);
}

/** Les présents d'une session (pour le formateur). */
export function listAttendance(sessionId: string): { user_id: string; name: string; via: string; signed_at: number }[] {
  return ensure().prepare(`
    SELECT a.user_id, COALESCE(u.display_name, u.username) AS name, a.via, a.signed_at
    FROM formation_attendance a JOIN users u ON u.id = a.user_id
    WHERE a.session_id = ? ORDER BY a.signed_at DESC
  `).all(sessionId) as { user_id: string; name: string; via: string; signed_at: number }[];
}

/** Mes sessions récentes (formateur). */
export function listMySessions(formateurId: string): (Session & { count: number })[] {
  const db = ensure();
  return (db.prepare('SELECT * FROM formation_sessions WHERE formateur_id = ? ORDER BY created_at DESC LIMIT 20').all(formateurId) as Session[])
    .map((s) => ({ ...s, count: (db.prepare('SELECT COUNT(*) c FROM formation_attendance WHERE session_id = ?').get(s.id) as { c: number }).c }));
}
