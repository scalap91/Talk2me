import 'server-only';

/**
 * Talk2Me — Sessions LIVE (Pascal 2026-07-04).
 *
 * Registre PERSISTANT (SQLite) des lives + de leurs commentaires. Construit SUR
 * l'infra live existante :
 *   - liveId = id du DIFFUSEUR (même convention que `live:{room}` dans
 *     /api/live/[room] et lib/live/p2p.ts → les spectateurs de /piece
 *     découvrent le live via ?status=1 et le WebRTC via startBroadcast).
 *   - Les commentaires temps réel passent par lib/realtime-bus (canal
 *     `live:{liveId}`), exactement comme le chat/les activités.
 *
 * Deux tables :
 *   - live_sessions  (id, host_user_id, title, started_at, ended_at)
 *   - live_comments  (id, session_id, host_user_id, author_*, text, system, ts)
 *
 * Un seul live OUVERT (ended_at IS NULL) par diffuseur à la fois → sert de
 * verrou de dé-doublonnage : `startLiveSession` renvoie isNew=false si le
 * diffuseur était DÉJÀ en direct (une seule notif "go-live" par passage).
 *
 * Doctrine [[talk2me-pii-air-gap]] : author = { username, display_name } SEULEMENT.
 * Aucun talk2me_id / téléphone / email n'est stocké ni exposé ici.
 */

import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db-core'; // leaf (pas la façade @/lib/db) → évite un cycle payments↔session. Pascal 2026-07-15
import type { SuperCard } from '@/lib/cards/supercard';

export interface LiveAuthor {
  username: string;
  display_name: string | null;
}

/**
 * LIVE SHOPPING — produit ÉPINGLÉ courant d'un live (Pascal 2026-07-05).
 * La card PORTE son bouton Acheter (le paiement voyage avec la card) ; shopId/shopKey
 * = contexte boutique pour la résolution SERVEUR du prix. PII air-gap : aucune donnée
 * d'identité ici (seulement des ids boutique). Éphémère (mémoire) comme le live lui-même.
 */
export interface LivePinnedProduct {
  card: SuperCard;
  shopId: string;
  shopKey: string | null;
  ts: number;
}
function pinnedMap(): Map<string, LivePinnedProduct> {
  const g = globalThis as unknown as { __t2mLivePinned?: Map<string, LivePinnedProduct> };
  if (!g.__t2mLivePinned) g.__t2mLivePinned = new Map();
  return g.__t2mLivePinned;
}
/** Épingle le produit courant du live d'un diffuseur (écrase le précédent). */
export function setPinnedProduct(hostUserId: string, product: LivePinnedProduct): void {
  if (!hostUserId) return;
  pinnedMap().set(hostUserId, product);
}
/** Produit actuellement épinglé (pour un spectateur qui arrive en cours de route), ou null. */
export function getPinnedProduct(hostUserId: string): LivePinnedProduct | null {
  if (!hostUserId) return null;
  return pinnedMap().get(hostUserId) ?? null;
}
function clearPinnedProduct(hostUserId: string): void {
  pinnedMap().delete(hostUserId);
}

export interface LiveComment {
  /** Auteur — username/display_name uniquement (PII air-gap). */
  author: LiveAuthor;
  /** Texte du commentaire (vide pour un message système « a rejoint »). */
  text: string;
  /** true → message système (X a rejoint), pas un vrai commentaire. */
  system?: boolean;
  ts: number;
}

export interface LiveSessionRow {
  id: string;
  host_user_id: string;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  /** Identité EXPOSÉE de la salle : user.id (live USER, public) OU clé d'annonce (live ANNONCE, anonyme). */
  room_id?: string | null;
}

const COMMENT_FETCH_CAP = 50;

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      host_user_id TEXT NOT NULL,
      title TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_live_sess_host ON live_sessions(host_user_id, ended_at);
    CREATE TABLE IF NOT EXISTS live_comments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      host_user_id TEXT NOT NULL,
      author_username TEXT NOT NULL,
      author_display_name TEXT,
      text TEXT NOT NULL,
      system INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_live_comm_sess ON live_comments(session_id, ts);
    CREATE TABLE IF NOT EXISTS live_entries (
      session_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      host_user_id TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      PRIMARY KEY (session_id, viewer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_live_entry_sess ON live_entries(session_id, viewer_id);
    CREATE TABLE IF NOT EXISTS live_preview (
      viewer_id TEXT NOT NULL,
      host_user_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      PRIMARY KEY (viewer_id, host_user_id)
    );
  `);
  // Prix d'entrée dans la salle (MGA, 1:1). NULL/0 = entrée gratuite. Pascal 2026-07-15.
  try { getDb().exec('ALTER TABLE live_sessions ADD COLUMN entry_price_cents INTEGER'); } catch { /* déjà */ }
  // Identité exposée de la salle (user.id ou clé d'annonce). Anti-double-live + anonymat. Pascal 2026-07-15.
  try { getDb().exec('ALTER TABLE live_sessions ADD COLUMN room_id TEXT'); } catch { /* déjà */ }
  // Modération live (Pascal 2026-07-15) : historique de connexion (1 ligne/spectateur, dernière visite) + bans.
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS live_viewers (
      host_user_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      name TEXT,
      ts INTEGER NOT NULL,
      PRIMARY KEY (host_user_id, viewer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_live_viewers_host ON live_viewers(host_user_id, ts);
    CREATE TABLE IF NOT EXISTS live_bans (
      host_user_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      banned_at INTEGER NOT NULL,
      PRIMARY KEY (host_user_id, viewer_id)
    );
  `);
  ensured = true;
}

/** Prix d'entrée + session ouverte d'un diffuseur (pour le paywall). Pascal 2026-07-15. */
export function getLiveEntryInfo(hostUserId: string): { sessionId: string; priceCents: number } | null {
  const s = getOpenSession(hostUserId);
  if (!s) return null;
  const priceCents = Math.max(0, Math.round((s as unknown as { entry_price_cents?: number | null }).entry_price_cents || 0));
  return { sessionId: s.id, priceCents };
}

/** Accès accordé à un spectateur pour la session live d'un hôte (payé ou gratuit). */
export function grantLiveEntry(hostUserId: string, viewerId: string, sessionId: string): void {
  if (!hostUserId || !viewerId || !sessionId) return;
  ensure();
  getDb().prepare('INSERT OR IGNORE INTO live_entries (session_id, viewer_id, host_user_id, granted_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, viewerId, hostUserId, Date.now());
}

/** APERÇU GRATUIT (Pascal 2026-07-15) : 2 min gratuites par (spectateur, hôte), rechargées toutes
 *  les 24h → l'aperçu démarre à la 1re visite, puis paywall « payer pour rester ». Renvoie les
 *  secondes restantes (0 = aperçu épuisé pour les 24h → doit payer). */
const PREVIEW_MS = 2 * 60 * 1000;
const PREVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
export function getPreviewRemainingSec(hostUserId: string, viewerId: string): number {
  if (!hostUserId || !viewerId) return 0;
  ensure();
  const now = Date.now();
  const row = getDb().prepare('SELECT started_at FROM live_preview WHERE viewer_id = ? AND host_user_id = ?').get(viewerId, hostUserId) as { started_at: number } | undefined;
  let startedAt = row?.started_at ?? 0;
  // Pas d'aperçu en cours OU fenêtre 24h dépassée → on (re)démarre 2 min fraîches.
  if (!startedAt || (now - startedAt) > PREVIEW_WINDOW_MS) {
    startedAt = now;
    getDb().prepare('INSERT OR REPLACE INTO live_preview (viewer_id, host_user_id, started_at) VALUES (?,?,?)').run(viewerId, hostUserId, startedAt);
  }
  return Math.max(0, Math.ceil((PREVIEW_MS - (now - startedAt)) / 1000));
}

/** Le spectateur a-t-il déjà accès à la session live EN COURS de l'hôte ? */
export function hasLiveEntry(hostUserId: string, viewerId: string): boolean {
  if (!hostUserId || !viewerId) return false;
  if (hostUserId === viewerId) return true; // l'hôte entre toujours dans sa propre salle
  const s = getOpenSession(hostUserId);
  if (!s) return false;
  const row = getDb().prepare('SELECT 1 FROM live_entries WHERE session_id = ? AND viewer_id = ?').get(s.id, viewerId);
  return !!row;
}

/**
 * Marque une salle EN DIRECT dans le registre mémoire partagé avec
 * /api/live/[room] (globalThis.__t2mLiveRooms) — sert le ?status=1.
 */
function markRoomLive(hostUserId: string): void {
  const g = globalThis as unknown as { __t2mLiveRooms?: Map<string, number> };
  if (!g.__t2mLiveRooms) g.__t2mLiveRooms = new Map();
  g.__t2mLiveRooms.set(hostUserId, Date.now());
}
function unmarkRoomLive(hostUserId: string): void {
  const g = globalThis as unknown as { __t2mLiveRooms?: Map<string, number> };
  g.__t2mLiveRooms?.delete(hostUserId);
}

/** Session OUVERTE (ended_at IS NULL) d'un diffuseur, ou null. */
export function getOpenSession(hostUserId: string): LiveSessionRow | null {
  if (!hostUserId) return null;
  ensure();
  const row = getDb()
    .prepare(
      'SELECT * FROM live_sessions WHERE host_user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(hostUserId) as LiveSessionRow | undefined;
  return row ?? null;
}

/**
 * Ouvre (ou récupère) la session live d'un diffuseur. liveId = hostUserId.
 * isNew=false si le diffuseur était DÉJÀ en direct → évite de re-notifier les
 * amis à chaque appel (une seule notif par passage en direct).
 */
export function startLiveSession(
  hostUserId: string,
  _broadcaster: LiveAuthor,
  title?: string | null,
  entryPriceCents?: number | null,
  roomId?: string | null,
): { liveId: string; sessionId: string; isNew: boolean; conflict?: boolean; currentRoomId?: string } {
  ensure();
  const rid = (roomId && roomId.trim()) || hostUserId; // identité exposée : clé d'annonce ou user.id
  const price = Math.max(0, Math.round(entryPriceCents || 0));
  const existing = getOpenSession(hostUserId);
  if (existing) {
    const curRid = existing.room_id || existing.host_user_id;
    // VERROU ANTI-DOUBLE-LIVE : déjà en direct sous une AUTRE identité (user vs annonce) →
    // refus. 1 seul live à la fois. Sinon corrélation temporelle = désanonymisation. Pascal 2026-07-15.
    if (curRid !== rid) {
      return { liveId: curRid, sessionId: existing.id, isNew: false, conflict: true, currentRoomId: curRid };
    }
    markRoomLive(hostUserId);
    try { getDb().prepare('UPDATE live_sessions SET entry_price_cents = ? WHERE id = ?').run(price, existing.id); } catch { /* */ }
    return { liveId: curRid, sessionId: existing.id, isNew: false };
  }
  markRoomLive(hostUserId);
  const id = randomUUID();
  getDb()
    .prepare(
      'INSERT INTO live_sessions (id, host_user_id, title, started_at, ended_at, entry_price_cents, room_id) VALUES (?, ?, ?, ?, NULL, ?, ?)'
    )
    .run(id, hostUserId, title?.trim() || null, Date.now(), price, rid);
  return { liveId: rid, sessionId: id, isNew: true };
}

/** L'identité exposée de la session ouverte d'un diffuseur (clé annonce ou user.id), ou null. */
export function getOpenRoomId(hostUserId: string): string | null {
  const s = getOpenSession(hostUserId);
  return s ? (s.room_id || s.host_user_id) : null;
}

// ── Modération live (Pascal 2026-07-15) : historique de connexion + éjection/bannissement ──
/** Journalise (ou rafraîchit) la connexion d'un spectateur — pour que l'hôte voie qui entre + puisse bannir. */
export function logViewer(hostUserId: string, viewerId: string, name: string | null): void {
  ensure();
  getDb().prepare('INSERT INTO live_viewers (host_user_id, viewer_id, name, ts) VALUES (?, ?, ?, ?) ON CONFLICT(host_user_id, viewer_id) DO UPDATE SET name = excluded.name, ts = excluded.ts')
    .run(hostUserId, viewerId, name, Date.now());
}
/** Historique de connexion (dernière visite par spectateur) + statut banni. Réservé à l'hôte. */
export function listViewers(hostUserId: string): Array<{ viewer_id: string; name: string | null; ts: number; banned: boolean }> {
  ensure();
  const rows = getDb().prepare('SELECT viewer_id, name, ts FROM live_viewers WHERE host_user_id = ? ORDER BY ts DESC LIMIT 300').all(hostUserId) as Array<{ viewer_id: string; name: string | null; ts: number }>;
  const bans = new Set((getDb().prepare('SELECT viewer_id FROM live_bans WHERE host_user_id = ?').all(hostUserId) as Array<{ viewer_id: string }>).map((b) => b.viewer_id));
  return rows.map((r) => ({ ...r, banned: bans.has(r.viewer_id) }));
}
export function banViewer(hostUserId: string, viewerId: string): void {
  ensure();
  getDb().prepare('INSERT OR IGNORE INTO live_bans (host_user_id, viewer_id, banned_at) VALUES (?, ?, ?)').run(hostUserId, viewerId, Date.now());
}
export function unbanViewer(hostUserId: string, viewerId: string): void {
  ensure();
  getDb().prepare('DELETE FROM live_bans WHERE host_user_id = ? AND viewer_id = ?').run(hostUserId, viewerId);
}
export function isBanned(hostUserId: string, viewerId: string): boolean {
  if (!hostUserId || !viewerId) return false;
  ensure();
  return !!getDb().prepare('SELECT 1 FROM live_bans WHERE host_user_id = ? AND viewer_id = ?').get(hostUserId, viewerId);
}

/** Ferme la session live ouverte d'un diffuseur. */
export function endLiveSession(hostUserId: string): void {
  if (!hostUserId) return;
  ensure();
  unmarkRoomLive(hostUserId);
  clearPinnedProduct(hostUserId); // le produit épinglé ne survit pas à la fin du live
  getDb()
    .prepare('UPDATE live_sessions SET ended_at = ? WHERE host_user_id = ? AND ended_at IS NULL')
    .run(Date.now(), hostUserId);
}

export function isLive(hostUserId: string): boolean {
  return getOpenSession(hostUserId) !== null;
}

/**
 * Ajoute un commentaire (ou message système) à la session live ouverte du
 * diffuseur. Best-effort : si aucune session ouverte, no-op (retourne false).
 */
export function addComment(hostUserId: string, comment: LiveComment): boolean {
  ensure();
  const session = getOpenSession(hostUserId);
  if (!session) return false;
  getDb()
    .prepare(
      `INSERT INTO live_comments
         (id, session_id, host_user_id, author_username, author_display_name, text, system, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      session.id,
      hostUserId,
      comment.author.username,
      comment.author.display_name ?? null,
      comment.text,
      comment.system ? 1 : 0,
      comment.ts
    );
  return true;
}

/**
 * Derniers commentaires de la session OUVERTE d'un diffuseur (pour remplir
 * l'overlay d'un spectateur qui arrive en cours de route). Ordre chronologique.
 */
export function getRecentComments(hostUserId: string, limit = COMMENT_FETCH_CAP): LiveComment[] {
  ensure();
  const session = getOpenSession(hostUserId);
  if (!session) return [];
  const rows = getDb()
    .prepare(
      'SELECT author_username, author_display_name, text, system, ts FROM live_comments WHERE session_id = ? ORDER BY ts DESC LIMIT ?'
    )
    .all(session.id, Math.min(limit, COMMENT_FETCH_CAP)) as Array<{
    author_username: string;
    author_display_name: string | null;
    text: string;
    system: number;
    ts: number;
  }>;
  return rows
    .map((r) => ({
      author: { username: r.author_username, display_name: r.author_display_name },
      text: r.text,
      system: r.system === 1,
      ts: r.ts,
    }))
    .reverse();
}
