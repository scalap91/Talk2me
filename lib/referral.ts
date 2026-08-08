/**
 * Talk2Me — PARRAINAGE (Pascal 2026-06-25). Brique 1 : tracking parrain→filleul.
 * Lien /r/<code> (code = @pseudo ou Talk2Me ID du parrain) → cookie t2m_ref → à
 * l'inscription du filleul, on lie referred_by + on trace la relation. 1 niveau.
 * Module isolé : table auto-créée, colonne users.referred_by ajoutée si absente.
 */
import { randomUUID } from 'node:crypto';
import { getDb, getUserByUsername, getUserByTalk2MeId, type DbUser } from '@/lib/db';

export const REF_COOKIE = 't2m_ref';

let _init = false;
function ensure() {
  if (_init) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      invited_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(invited_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id, created_at DESC);
  `);
  try { db.exec('ALTER TABLE users ADD COLUMN referred_by TEXT'); } catch { /* déjà */ }
  _init = true;
}

/** Code de parrainage d'un user = son @pseudo (lien /r/<username>). */
export function referralCodeFor(user: Pick<DbUser, 'username'>): string {
  return user.username;
}

/** Résout un code de parrainage (pseudo OU talk2me_id) → user parrain. */
export function resolveReferrer(code: string): DbUser | null {
  const c = (code || '').trim().replace(/^@/, '');
  if (!c) return null;
  return getUserByTalk2MeId(c) || getUserByUsername(c.toLowerCase());
}

/** Lie un nouvel inscrit (filleul) à son parrain. À appeler UNE fois, au signup. */
export function linkReferral(newUserId: string, code: string): { ok: boolean; referrerId?: string } {
  ensure();
  const ref = resolveReferrer(code);
  if (!ref || ref.id === newUserId) return { ok: false };
  const db = getDb();
  // déjà un parrain ? on ne réécrit pas.
  const existing = db.prepare('SELECT 1 FROM referrals WHERE invited_user_id = ?').get(newUserId);
  if (existing) return { ok: false };
  try {
    db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(ref.id, newUserId);
    db.prepare('INSERT INTO referrals (id, referrer_id, invited_user_id, created_at) VALUES (?,?,?,?)')
      .run(randomUUID(), ref.id, newUserId, Date.now());
    return { ok: true, referrerId: ref.id };
  } catch { return { ok: false }; }
}

/** Info publique du parrain (pour la page /r/<code>). PII air-gap : pseudo/nom/avatar only. */
export function inviterPublic(code: string): { username: string; display_name: string | null; avatar_url: string | null } | null {
  const u = resolveReferrer(code);
  if (!u) return null;
  return { username: u.username, display_name: u.display_name, avatar_url: u.avatar_url };
}

/** Nombre de filleuls d'un parrain (pour le profil plus tard). */
export function countFilleuls(referrerId: string): number {
  ensure();
  return (getDb().prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrer_id = ?').get(referrerId) as { c: number }).c;
}

/** Les gens à qui J'AI envoyé le lien (referred_by = moi), identité minimale. Sert à les faire
 *  REMONTER EN PREMIER dans « Parrainer un inscrit » (Pascal 2026-08-08). N'importe qui peut envoyer
 *  un lien ; c'est celui qui CONCLUT le parrainage qui gagne le filleul → ceci n'est qu'un tri, pas un verrou. */
export function listReferrals(referrerId: string): { id: string; username: string; display_name: string | null; avatar_url: string | null }[] {
  ensure();
  return (getDb().prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url
    FROM referrals r JOIN users u ON u.id = r.invited_user_id
    WHERE r.referrer_id = ? ORDER BY r.created_at DESC
  `).all(referrerId) as { id: string; username: string; display_name: string | null; avatar_url: string | null }[]);
}
