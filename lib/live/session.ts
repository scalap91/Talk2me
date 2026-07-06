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
import { getDb } from '@/lib/db';
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
  `);
  ensured = true;
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
  title?: string | null
): { liveId: string; sessionId: string; isNew: boolean } {
  ensure();
  markRoomLive(hostUserId);
  const existing = getOpenSession(hostUserId);
  if (existing) {
    return { liveId: hostUserId, sessionId: existing.id, isNew: false };
  }
  const id = randomUUID();
  getDb()
    .prepare(
      'INSERT INTO live_sessions (id, host_user_id, title, started_at, ended_at) VALUES (?, ?, ?, ?, NULL)'
    )
    .run(id, hostUserId, title?.trim() || null, Date.now());
  return { liveId: hostUserId, sessionId: id, isNew: true };
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
