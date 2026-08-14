/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/db-users — domaine « users » (comptes, profils, recherche) extrait du monolithe
 * lib/db.ts (decoupage #53/db-core, Pascal 2026-06-30). Primitives du socle via
 * @/lib/db-core ; appels cross-domaine via la facade @/lib/db (lazy). lib/db.ts
 * re-exporte -> ~199 appelants inchanges.
 */
import { randomUUID, randomBytes } from 'crypto';
import { getDb, parseUserRow } from '@/lib/db-core';
import type { DbUser, CreateUserInput } from '@/lib/db-core';
import { getOrCreateUserConversation, mirrorDirectCardToUnified } from '@/lib/db';

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
/** Renomme le NOM AFFICHÉ de l'utilisateur (display_name). Pascal 2026-06-16. */
export function updateDisplayName(userId: string, name: string): boolean {
  if (!userId) return false;
  const clean = (name || '').trim();
  if (!clean) throw new Error('name_required');
  if (clean.length > 40) throw new Error('name_too_long');
  getDb().prepare('UPDATE users SET display_name = ? WHERE id = ?').run(clean, userId);
  return true;
}

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
 * Talk2Me Avatar Streamoji (Pascal 2026-06-17) — Enregistre le CORPS 3D réaliste
 * de l'IA perso : le chemin du GLB plein-corps + l'id Streamoji (pour re-générer).
 * Passer null/null pour retirer le corps.
 */
export function updateAiAvatarBody(
  userId: string,
  bodyUrl: string | null,
  streamojiAvatarId: string | null
): boolean {
  if (!userId) return false;
  const db = getDb();
  const r = db
    .prepare('UPDATE users SET ai_avatar_body_url = ?, streamoji_avatar_id = ? WHERE id = ?')
    .run(bodyUrl, streamojiAvatarId, userId);
  return r.changes > 0;
}

/**
 * Talk2Me Studio créatif (Pascal 2026-06-18) — vidéo photoréaliste de l'avatar IA
 * (HunyuanVideo I2V généré sur notre GPU). Chemin public sous /uploads/avatar-videos/.
 */
export function updateAiAvatarVideo(userId: string, videoUrl: string | null): boolean {
  if (!userId) return false;
  const db = getDb();
  const r = db
    .prepare('UPDATE users SET ai_avatar_video_url = ? WHERE id = ?')
    .run(videoUrl, userId);
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

/** Photo + mot d'accroche de la salle 3D du user (carte d'invitation + déco pièce). */
export function updateRoomPhoto(userId: string, photo: string | null, tagline?: string | null): boolean {
  if (!userId) return false;
  const db = getDb();
  if (tagline !== undefined) {
    db.prepare('UPDATE users SET room_photo = ?, room_tagline = ? WHERE id = ?').run(photo, tagline, userId);
  } else {
    db.prepare('UPDATE users SET room_photo = ? WHERE id = ?').run(photo, userId);
  }
  try { ensureRoomPost(userId); } catch { /* */ }
  return true;
}

/**
 * Crée ou met à jour LE post-salle [PIECE3D] d'un user (sa carte d'invitation dans
 * le feed). Photo = room_photo (sinon son dernier média, sinon poster par défaut).
 */
export function ensureRoomPost(userId: string): string | null {
  if (!userId) return null;
  const db = getDb();
  const u = getUserById(userId); if (!u) return null;
  let media = u.room_photo || '';
  if (!media) {
    const last = db.prepare("SELECT media_url FROM direct_cards WHERE user_id = ? AND media_url IS NOT NULL AND deleted_at IS NULL AND caption NOT LIKE '%[PIECE3D]%' ORDER BY CAST(created_at AS INTEGER) DESC LIMIT 1").get(userId) as { media_url?: string } | undefined;
    media = last?.media_url || '/uploads/piece-poster.png';
  }
  const tagline = (u.room_tagline && u.room_tagline.trim()) || 'Visite ma salle 3D';
  const caption = `${tagline} [PIECE3D]`;
  const existing = db.prepare("SELECT id FROM direct_cards WHERE user_id = ? AND caption LIKE '%[PIECE3D]%' AND deleted_at IS NULL LIMIT 1").get(userId) as { id?: string } | undefined;
  if (existing?.id) {
    db.prepare('UPDATE direct_cards SET media_url = ?, caption = ? WHERE id = ?').run(media, caption, existing.id);
    try { mirrorDirectCardToUnified(db.prepare('SELECT * FROM direct_cards WHERE id = ?').get(existing.id) as Record<string, unknown>); } catch { /* */ }
    return existing.id;
  }
  const id = randomUUID();
  db.prepare('INSERT INTO direct_cards(id,user_id,type,media_url,caption,created_at,likes,views,share_count,save_count,comment_count) VALUES(?,?,?,?,?,?,0,0,0,0,0)')
    .run(id, userId, 'image', media, caption, Date.now());
  try { mirrorDirectCardToUnified(db.prepare('SELECT * FROM direct_cards WHERE id = ?').get(id) as Record<string, unknown>); } catch { /* */ }
  return id;
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

/** Récupère un user par numéro de téléphone (normalisé E.164). Pour l'auth téléphone. */
export function getUserByPhone(phone: string): DbUser | null {
  if (!phone) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone.trim()) as any;
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
  const cleanPhone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const hasEmail = cleanEmail !== '';
  // Talk2Me #38 (Pascal 2026-06-24) — inscription par EMAIL OU TÉLÉPHONE (Mada-first :
  // le téléphone est universel, l'email rare). Le numéro doit déjà être normalisé (E.164).
  if (hasEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('invalid_email');
    }
    if (getUserByEmail(cleanEmail)) {
      throw new Error('email_taken');
    }
  } else if (cleanPhone) {
    if (!/^\+?\d{8,15}$/.test(cleanPhone)) {
      throw new Error('invalid_phone');
    }
    if (getUserByPhone(cleanPhone)) {
      throw new Error('phone_taken');
    }
  } else {
    throw new Error('email_or_phone_required');
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
    const base = hasEmail ? slugFromEmail(cleanEmail) : `u${cleanPhone.replace(/\D/g, '').slice(-8)}`;
    finalUsername = generateUniqueUsername(base);
  }

  const rawLocal = hasEmail ? (cleanEmail.split('@')[0] || finalUsername).trim() : '';
  const autoDisplay = rawLocal
    ? rawLocal.charAt(0).toUpperCase() + rawLocal.slice(1)
    : 'Membre';
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
    `INSERT INTO users (id, talk2me_id, username, display_name, password_hash, email, phone, created_at, last_seen, ai_name)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  ).run(id, talk2meId, finalUsername, cleanDisplay, hasEmail ? cleanEmail : null, cleanPhone || null, now, now, defaultAiName);

  // Crée d'office la conversation 1-to-1 de l'user avec Talk2Me.
  // Tout est dans ce fichier monolithique, plus de require dynamique.
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
    email: hasEmail ? cleanEmail : null,
    phone: cleanPhone || null,
    avatar_url: null,
    ai_name: defaultAiName,
    ai_avatar_url: null,
    ai_avatar_body_url: null,
    ai_avatar_video_url: null,
    streamoji_avatar_id: null,
    ai_gender: 'neutre',
    room_photo: null,
    room_tagline: null,
    created_at: now,
    last_seen: now,
  };
}

/** Pays d'inscription (ANONYME). On ne stocke QUE le pays, jamais l'IP. */
export function setUserCountry(userId: string, country: string | null): void {
  if (!userId) return;
  const c = (country || '').trim().slice(0, 60) || null;
  if (!c) return;
  try {
    getDb().prepare('UPDATE users SET country = ? WHERE id = ? AND (country IS NULL OR country = "")').run(c, userId);
  } catch {
    /* colonne absente sur vieux schéma — best-effort */
  }
}

/** Agrégat anonyme : nb d'inscrits par pays (pour le dashboard "combien & où"). */
export function getSignupsByCountry(): { country: string; count: number }[] {
  try {
    return getDb()
      .prepare(
        `SELECT COALESCE(NULLIF(TRIM(country), ''), 'Inconnu') AS country, COUNT(*) AS count
         FROM users GROUP BY country ORDER BY count DESC`
      )
      .all() as { country: string; count: number }[];
  } catch {
    return [];
  }
}

