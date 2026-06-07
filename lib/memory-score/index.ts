/**
 * Talk2Me #422 — Module Memory Score (Pascal 2026-06-06).
 *
 * Moteur de scoring d'écoute PERSONNEL et PORTABLE. Enregistre chaque écoute
 * d'un son et calcule un score pondéré par la RÉCENCE : les sons écoutés
 * récemment et souvent remontent en haut de la liste de l'utilisateur.
 *
 * Pascal verbatim : "si j'écoute young thug dix fois dans la journée et joé
 * dwet filé 2 fois c'est young thug qui l'emporte... un système de scoring...
 * ça doit être un module à part entière genre memory score".
 *
 * Doctrine PII air-gap : ne stocke QUE des métadonnées publiques de son
 * (titre/artiste/youtube id) + l'id user. Jamais d'email/token/etc.
 * Isolé : table auto-créée à la 1ère utilisation, aucune dépendance aux
 * migrations du core. Réutilisable au-delà de la musique (catégories d'artiste).
 */

import { getDb } from '@/lib/db';

const DAY = 86_400_000;

// Poids de récence (Pascal a validé "récence pondérée") :
//   aujourd'hui ×1.0 · cette semaine ×0.6 · ce mois ×0.3 · plus vieux ×0.1
const W_TODAY = 1.0;
const W_WEEK = 0.6;
const W_MONTH = 0.3;
const W_OLD = 0.1;

// Durée minimale (s) pour qu'une écoute compte — sous ce seuil = scroll-survol,
// ignoré (Pascal 2026-06-06 : "étendre le score à la durée d'écoute").
const MIN_SECONDS = 4;
// Une écoute "pleine" = 30 s ; capée à 90 s (3×). f(sec)=min(sec,90)/30.
const FULL_SECONDS = 30;
const CAP_SECONDS = 90;

let ensured = false;
function ensureTable(): void {
  if (ensured) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_play_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      track_id INTEGER,
      youtube_video_id TEXT NOT NULL,
      title TEXT,
      artist_name TEXT,
      genre TEXT,
      played_at INTEGER NOT NULL,
      seconds_listened INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_mpe_user_time ON music_play_events(user_id, played_at);
    CREATE INDEX IF NOT EXISTS idx_mpe_user_video ON music_play_events(user_id, youtube_video_id);
  `);
  // Migration douce : ajoute la colonne si la table existait sans (tests d'hier).
  try {
    db.exec('ALTER TABLE music_play_events ADD COLUMN seconds_listened INTEGER NOT NULL DEFAULT 0');
  } catch {
    /* colonne déjà présente */
  }
  // Score MANUEL (glisser-déposer) : override persistant par (user, son).
  // Pascal 2026-06-06 : "c'est le bonus qui persiste, pas la position ; la
  // position est de fait par le score attribué." → on stocke un SCORE, le tri
  // s'en occupe.
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_manual_score (
      user_id TEXT NOT NULL,
      youtube_video_id TEXT NOT NULL,
      score REAL NOT NULL,
      title TEXT,
      artist_name TEXT,
      genre TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, youtube_video_id)
    );
  `);
  ensured = true;
}

/** Override de score manuel (glisser-déposer). Upsert. */
export function setManualScore(
  userId: string,
  p: PlayInput & { score: number },
  now: number
): void {
  if (!userId || !p?.youtube_video_id || typeof p.score !== 'number') return;
  ensureTable();
  getDb()
    .prepare(
      `INSERT INTO music_manual_score
         (user_id, youtube_video_id, score, title, artist_name, genre, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, youtube_video_id) DO UPDATE SET
         score = excluded.score,
         title = COALESCE(excluded.title, title),
         artist_name = COALESCE(excluded.artist_name, artist_name),
         genre = COALESCE(excluded.genre, genre),
         updated_at = excluded.updated_at`
    )
    .run(
      userId,
      p.youtube_video_id,
      p.score,
      p.title ?? null,
      p.artist_name ?? null,
      p.genre ?? null,
      now
    );
}

/** Map youtube_video_id → score manuel pour un user. */
function getManualScoreMap(userId: string): Map<string, number> {
  ensureTable();
  const rows = getDb()
    .prepare('SELECT youtube_video_id, score FROM music_manual_score WHERE user_id = ?')
    .all(userId) as any[];
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.youtube_video_id, r.score as number);
  return m;
}

// Expression SQL du poids d'une écoute = récence × durée (capée).
// Réutilisée par tous les agrégats.
function weightExpr(today: number, week: number, month: number): string {
  return `(
    (CASE
       WHEN played_at >= ${today} THEN ${W_TODAY}
       WHEN played_at >= ${week} THEN ${W_WEEK}
       WHEN played_at >= ${month} THEN ${W_MONTH}
       ELSE ${W_OLD}
     END)
    * (MIN(seconds_listened, ${CAP_SECONDS}) * 1.0 / ${FULL_SECONDS})
  )`;
}

export interface PlayInput {
  track_id?: number | null;
  youtube_video_id: string;
  title?: string | null;
  artist_name?: string | null;
  genre?: string | null;
}

export interface ScoredTrack {
  track_id: number | null;
  youtube_video_id: string;
  title: string | null;
  artist_name: string | null;
  genre: string | null;
  play_count: number;
  score: number;
  last_played: number;
  is_manual: boolean;
}

/**
 * Enregistre une écoute avec sa DURÉE. Ignore les survols (< MIN_SECONDS) pour
 * ne pas polluer le score quand on scrolle le feed sans vraiment écouter.
 */
export function logPlay(userId: string, p: PlayInput, now: number, seconds = 0): void {
  if (!userId || !p?.youtube_video_id) return;
  const secs = Math.max(0, Math.round(seconds));
  if (secs < MIN_SECONDS) return; // survol → on ne compte pas
  ensureTable();
  getDb()
    .prepare(
      `INSERT INTO music_play_events
         (user_id, track_id, youtube_video_id, title, artist_name, genre, played_at, seconds_listened)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      p.track_id ?? null,
      p.youtube_video_id,
      p.title ?? null,
      p.artist_name ?? null,
      p.genre ?? null,
      now,
      secs
    );
}

/**
 * Sons de l'utilisateur classés par score de récence DESC.
 * `now` injecté par l'appelant (testable, et évite Date.now() au coeur).
 */
export function getScoredTracks(userId: string, now: number, limit = 40): ScoredTrack[] {
  if (!userId) return [];
  ensureTable();
  const today = now - DAY;
  const week = now - 7 * DAY;
  const month = now - 30 * DAY;
  const rows = getDb()
    .prepare(
      `SELECT
         youtube_video_id,
         MAX(track_id)      AS track_id,
         MAX(title)         AS title,
         MAX(artist_name)   AS artist_name,
         MAX(genre)         AS genre,
         COUNT(*)           AS play_count,
         MAX(played_at)     AS last_played,
         SUM(${weightExpr(today, week, month)}) AS score
       FROM music_play_events
       WHERE user_id = ?
       GROUP BY youtube_video_id
       HAVING score > 0
       ORDER BY score DESC, last_played DESC
       LIMIT ?`
    )
    .all(userId, limit) as any[];

  // Overlay du score MANUEL (glisser-déposer) : effectif = manuel ?? auto.
  // La position est la CONSÉQUENCE du score (Pascal) → on re-trie par effectif.
  const manual = getManualScoreMap(userId);
  const out = rows.map((r) => {
    const auto = Math.round((r.score as number) * 10) / 10;
    const m = manual.get(r.youtube_video_id);
    const eff = m != null ? m : auto;
    return {
      track_id: r.track_id ?? null,
      youtube_video_id: r.youtube_video_id,
      title: r.title ?? null,
      artist_name: r.artist_name ?? null,
      genre: r.genre ?? null,
      play_count: r.play_count as number,
      score: Math.round(eff * 10) / 10,
      last_played: r.last_played as number,
      is_manual: m != null,
    };
  });
  out.sort((a, b) => b.score - a.score || b.last_played - a.last_played);
  return out;
}

export interface GenreScore {
  genre: string;
  play_count: number;
  score: number;
}

/**
 * Score par GENRE écouté (pondéré récence) — Pascal 2026-06-06.
 * Sert à proposer des sons d'une catégorie que l'user écoute souvent
 * (hip-hop, rap-fr, pop…) et à classer les sections "découvertes".
 */
export function getGenreScores(userId: string, now: number, limit = 10): GenreScore[] {
  if (!userId) return [];
  ensureTable();
  const today = now - DAY;
  const week = now - 7 * DAY;
  const month = now - 30 * DAY;
  const rows = getDb()
    .prepare(
      `SELECT genre,
         COUNT(*) AS play_count,
         SUM(${weightExpr(today, week, month)}) AS score
       FROM music_play_events
       WHERE user_id = ? AND genre IS NOT NULL AND genre != ''
       GROUP BY genre
       HAVING score > 0
       ORDER BY score DESC
       LIMIT ?`
    )
    .all(userId, limit) as any[];
  return rows.map((r) => ({
    genre: r.genre as string,
    play_count: r.play_count as number,
    score: Math.round((r.score as number) * 10) / 10,
  }));
}

/** Artiste le plus écouté (pondéré récence) — sert aux "similaires". */
export function getTopArtist(userId: string, now: number): string | null {
  if (!userId) return null;
  ensureTable();
  const today = now - DAY;
  const week = now - 7 * DAY;
  const month = now - 30 * DAY;
  const row = getDb()
    .prepare(
      `SELECT artist_name,
         SUM(${weightExpr(today, week, month)}) AS score
       FROM music_play_events
       WHERE user_id = ? AND artist_name IS NOT NULL AND artist_name != ''
       GROUP BY artist_name
       HAVING score > 0
       ORDER BY score DESC
       LIMIT 1`
    )
    .get(userId) as any;
  return row?.artist_name ?? null;
}
