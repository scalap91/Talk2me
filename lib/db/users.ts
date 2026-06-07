// /lib/db/users.ts — User table CRUD (auth, profile, AI settings).
//
// Inclut createUser (avec setup T2M Officiel par défaut), getUserBy*,
// updateAi*/updateUserAvatar, slug helpers, generateTalk2MeId.
// Le createUser doit aussi initialiser la conversation 'agent' du user, on
// ré-importe getOrCreateUserConversation de conversations.ts (pas de cycle :
// conversations.ts n'importe pas users.ts).

import { randomUUID, randomBytes } from 'crypto';
import { getDb } from './_core';

// ===================== Types =====================

export type AiGender = 'feminin' | 'masculin' | 'neutre';

export const AI_GENDER_VALUES: AiGender[] = ['feminin', 'masculin', 'neutre'];

export function normalizeAiGender(value: unknown): AiGender {
  if (value === 'feminin' || value === 'masculin' || value === 'neutre') {
    return value;
  }
  return 'neutre';
}

export interface DbUser {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  ai_name: string | null;
  ai_avatar_url: string | null;
  ai_gender: AiGender;
  created_at: number;
  last_seen: number | null;
}

export interface CreateUserInput {
  email: string;
  displayName?: string | null;
  username?: string | null;
}

// ===================== Row parser =====================

export function parseUserRow(row: any): DbUser {
  // Talk2Me #324 v2 — Si ai_name absent (legacy / signup pre-migration),
  // fallback = "T2M de <display_name>" (ou username). JAMAIS "Léa".
  const displayName =
    typeof row.display_name === 'string' && row.display_name.trim() !== ''
      ? row.display_name.trim()
      : row.username;
  const defaultAiName = `T2M de ${displayName}`;
  return {
    id: row.id,
    talk2me_id: row.talk2me_id,
    username: row.username,
    display_name: row.display_name ?? null,
    email: typeof row.email === 'string' ? row.email : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    ai_name:
      typeof row.ai_name === 'string' && row.ai_name.trim() !== ''
        ? row.ai_name
        : defaultAiName,
    ai_avatar_url:
      typeof row.ai_avatar_url === 'string' ? row.ai_avatar_url : null,
    ai_gender: normalizeAiGender(row.ai_gender),
    created_at: row.created_at,
    last_seen: typeof row.last_seen === 'number' ? row.last_seen : null,
  };
}

// ===================== AI profile mutations =====================

/**
 * Talk2Me #325 — Met à jour le genre de l'IA personnelle d'un user.
 * Valeur strictement whitelistée : 'feminin' | 'masculin' | 'neutre'.
 * Throw sur valeur invalide.
 */
export function updateAiGender(userId: string, gender: unknown): boolean {
  if (!userId) return false;
  if (gender !== 'feminin' && gender !== 'masculin' && gender !== 'neutre') {
    throw new Error('ai_gender_invalid');
  }
  const db = getDb();
  const r = db
    .prepare('UPDATE users SET ai_gender = ? WHERE id = ?')
    .run(gender, userId);
  return r.changes > 0;
}

/**
 * Talk2Me #324 — Met à jour le nom de l'IA personnelle d'un user.
 * Accepte 1-40 chars, lettres/chiffres/accents/espaces/_-, sinon throw.
 * Le pattern par défaut "T2M de Pascal" passe (espaces autorisés).
 */
export function updateAiName(userId: string, aiName: string): boolean {
  if (!userId) return false;
  const clean = (aiName || '').trim();
  if (!clean) throw new Error('ai_name_required');
  if (clean.length > 40) throw new Error('ai_name_too_long');
  if (!/^[\p{L}\p{N} _-]{1,40}$/u.test(clean)) {
    throw new Error('ai_name_invalid');
  }
  const db = getDb();
  const r = db.prepare('UPDATE users SET ai_name = ? WHERE id = ?').run(clean, userId);
  return r.changes > 0;
}

/**
 * Talk2Me #324 — Met à jour l'avatar URL de l'IA personnelle d'un user.
 * Passer null pour retirer.
 */
export function updateAiAvatar(userId: string, avatarUrl: string | null): boolean {
  if (!userId) return false;
  const db = getDb();
  const r = db
    .prepare('UPDATE users SET ai_avatar_url = ? WHERE id = ?')
    .run(avatarUrl, userId);
  return r.changes > 0;
}

/**
 * Met à jour l'avatar_url d'un user (chemin public sous /uploads/avatars/...).
 * Passer null pour retirer l'avatar.
 */
export function updateUserAvatar(userId: string, avatarUrl: string | null): boolean {
  if (!userId) return false;
  const db = getDb();
  const r = db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
  return r.changes > 0;
}

// ===================== Lookups =====================

/**
 * Génère un Talk2Me ID unique 6 chiffres (100000–999999).
 * Retry jusqu'à 50 fois en cas de collision (improbable au début).
 */
export function generateTalk2MeId(): string {
  const db = getDb();
  const stmt = db.prepare('SELECT 1 FROM users WHERE talk2me_id = ? LIMIT 1');
  for (let i = 0; i < 50; i++) {
    const n = 100000 + Math.floor(Math.random() * 900000);
    const candidate = String(n);
    const exists = stmt.get(candidate);
    if (!exists) return candidate;
  }
  throw new Error('Could not generate unique Talk2Me ID after 50 attempts');
}

export function getUserByUsername(username: string): DbUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  return row ? parseUserRow(row) : null;
}

export function getUserById(id: string): DbUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  return row ? parseUserRow(row) : null;
}

export function getUserByEmail(email: string): DbUser | null {
  if (!email) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(email.trim()) as any;
  return row ? parseUserRow(row) : null;
}

/** Récupère un user par Talk2Me ID 6 chiffres exact. */
export function getUserByTalk2MeId(talk2meId: string): DbUser | null {
  if (!talk2meId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE talk2me_id = ?').get(talk2meId.trim()) as any;
  return row ? parseUserRow(row) : null;
}

/**
 * Recherche d'users : par username partiel (LIKE) OU par Talk2Me ID exact
 * (si query = 6 chiffres). Exclut l'user courant. Limite 20 résultats.
 */
export function searchUsers(query: string, excludeUserId?: string | null): DbUser[] {
  const q = (query || '').trim();
  if (!q) return [];
  const db = getDb();
  const cleanQ = q.replace(/^@/, '').toLowerCase();

  // Talk2Me ID exact (6 chiffres) → match prioritaire
  if (/^\d{6}$/.test(cleanQ)) {
    const exact = getUserByTalk2MeId(cleanQ);
    if (exact && exact.id !== excludeUserId) return [exact];
    return [];
  }

  // Sinon : recherche LIKE sur username + display_name
  const like = `%${cleanQ}%`;
  const rows = db
    .prepare(
      `SELECT * FROM users
       WHERE (LOWER(username) LIKE ? OR LOWER(COALESCE(display_name, '')) LIKE ?)
         AND id != ?
       ORDER BY
         CASE WHEN LOWER(username) = ? THEN 0
              WHEN LOWER(username) LIKE ? THEN 1
              ELSE 2 END,
         username ASC
       LIMIT 20`
    )
    .all(like, like, excludeUserId || '', cleanQ, `${cleanQ}%`) as any[];
  return rows.map(parseUserRow);
}

// ===================== Username slug helpers =====================

/**
 * Extrait un slug username depuis l'email : partie locale (avant @),
 * minuscules, [a-z0-9_] seulement, tronqué à 17 chars (laisse 3 chars
 * de marge pour un suffixe collision). Padding "user" si trop court.
 */
export function slugFromEmail(email: string): string {
  const local = (email.split('@')[0] || '').toLowerCase();
  const cleaned = local.replace(/[^a-z0-9_]/g, '');
  const base = cleaned.length >= 3 ? cleaned : 'user' + cleaned;
  return base.slice(0, 17);
}

/**
 * Garantit un username disponible : essaie `base`, puis `base_xyz` avec xyz
 * = 3 chars hex random. 50 tentatives max.
 */
export function generateUniqueUsername(base: string): string {
  if (!getUserByUsername(base)) return base;
  for (let i = 0; i < 50; i++) {
    const suffix = randomBytes(2).toString('hex').slice(0, 3);
    const candidate = `${base}_${suffix}`.slice(0, 20);
    if (!getUserByUsername(candidate)) return candidate;
  }
  throw new Error('Could not generate unique username after 50 attempts');
}

// ===================== createUser =====================
//
// Lazy import getOrCreateUserConversation depuis conversations.ts pour
// éviter le cycle d'import statique (conversations.ts dépend de _core et
// pas de users.ts en static, mais on garde la prudence).

/**
 * Crée un compte PASSWORDLESS (auth = magic link email).
 * - email : obligatoire, format basique validé, unique
 * - displayName : optionnel ; défaut = partie locale de l'email capitalisée
 * - username : optionnel ; défaut = slugFromEmail + dédoublonnage auto
 * Le Talk2Me ID 6 chiffres reste généré automatiquement.
 */
export function createUser(input: CreateUserInput): DbUser {
  const db = getDb();
  const cleanEmail = typeof input.email === 'string' ? input.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('invalid_email');
  }
  if (getUserByEmail(cleanEmail)) {
    throw new Error('email_taken');
  }

  let finalUsername: string;
  if (typeof input.username === 'string' && input.username.trim() !== '') {
    const cleanUsername = input.username.replace(/^@/, '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      throw new Error('invalid_username');
    }
    if (getUserByUsername(cleanUsername)) {
      throw new Error('username_taken');
    }
    finalUsername = cleanUsername;
  } else {
    finalUsername = generateUniqueUsername(slugFromEmail(cleanEmail));
  }

  const rawLocal = (cleanEmail.split('@')[0] || finalUsername).trim();
  const autoDisplay = rawLocal
    ? rawLocal.charAt(0).toUpperCase() + rawLocal.slice(1)
    : finalUsername;
  const cleanDisplay =
    typeof input.displayName === 'string' && input.displayName.trim() !== ''
      ? input.displayName.trim()
      : autoDisplay;

  const id = randomUUID();
  const talk2meId = generateTalk2MeId();
  const now = Date.now();
  // Talk2Me #324 v2 — ai_name par défaut "T2M de <display_name>" (Pascal 2026-06-04)
  const defaultAiName = `T2M de ${cleanDisplay}`;
  db.prepare(
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, created_at, last_seen, ai_name)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).run(id, talk2meId, finalUsername, cleanDisplay, cleanEmail, now, now, defaultAiName);

  // Crée d'office la conversation 1-to-1 de l'user avec Talk2Me.
  // Import dynamique pour éviter tout risque de cycle au moment du module load.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getOrCreateUserConversation } = require('./conversations') as typeof import('./conversations');
  getOrCreateUserConversation(id);

  // Talk2Me #388 (Pascal 2026-06-05) — Ajoute T2M Officiel comme ami par défaut.
  // T2M Officiel est le compte système (community manager) accessible à tous.
  // L'env var permet d'override l'ID; fallback sur l'UUID seedé en #378.
  const T2M_OFFICIEL_ID =
    process.env.T2M_OFFICIEL_USER_ID || '8f508701-fbdb-460f-bd95-e826873f79e1';
  try {
    if (T2M_OFFICIEL_ID && T2M_OFFICIEL_ID !== id) {
      const officielExists = db
        .prepare('SELECT 1 FROM users WHERE id = ?')
        .get(T2M_OFFICIEL_ID);
      if (officielExists) {
        // Friendship
        const [userA, userB] =
          id < T2M_OFFICIEL_ID ? [id, T2M_OFFICIEL_ID] : [T2M_OFFICIEL_ID, id];
        db.prepare(
          `INSERT OR IGNORE INTO friendships (id, user_a, user_b, status, created_at)
           VALUES (?, ?, ?, 'accepted', ?)`,
        ).run(randomUUID(), userA, userB, now);

        // Conversation P2P (pour que T2M Officiel apparaisse dans /friends)
        const p2pConvId = randomUUID();
        db.prepare(
          `INSERT INTO conversations (id, kind, created_at) VALUES (?, 'p2p', ?)`,
        ).run(p2pConvId, now);
        db.prepare(
          `INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`,
        ).run(p2pConvId, id, now);
        db.prepare(
          `INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`,
        ).run(p2pConvId, T2M_OFFICIEL_ID, now);
      }
    }
  } catch (e) {
    // Silent — ne pas bloquer la création d'user si la friendship/conv échoue
    console.warn('[createUser] T2M Officiel default setup failed:', e);
  }

  return {
    id,
    talk2me_id: talk2meId,
    username: finalUsername,
    display_name: cleanDisplay,
    email: cleanEmail,
    avatar_url: null,
    ai_name: defaultAiName,
    ai_avatar_url: null,
    ai_gender: 'neutre',
    created_at: now,
    last_seen: now,
  };
}
