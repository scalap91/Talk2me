'use server-only';

/**
 * Talk2Me — Messagerie ENTREPRISE (Pascal 2026-06-09).
 * Un user crée une "messagerie entreprise" aussi vite qu'un groupe → ça génère
 * un widget iframe à coller sur son site. Chaque VISITEUR du site = une
 * conversation P2P (guest ↔ propriétaire) qui tombe dans la messagerie T2M du
 * propriétaire. Il répond normalement ; s'il tag son IA, elle répond (Module 2 :
 * base documentaire).
 *
 * Doctrine : module isolé, on réutilise les conversations + l'IA T2M existantes
 * (pas de nouvel inbox). Le visiteur anonyme = un pseudo-user "guest-xxx"
 * (password_hash NULL) — jamais ami de personne, donc invisible des recherches
 * (scope amis, cf [[feedback_talk2me_pii_security]]).
 */

import { randomUUID, randomBytes } from 'crypto';
import { getDb, createP2PConversation } from '@/lib/db';

let ensured = false;
function ensure() {
  if (ensured) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_inboxes (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      public_key TEXT UNIQUE NOT NULL,
      greeting TEXT,
      accent TEXT,
      bot_enabled INTEGER DEFAULT 0,
      knowledge TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_biz_owner ON business_inboxes(owner_id);
    CREATE TABLE IF NOT EXISTS business_guests (
      inbox_id TEXT NOT NULL,
      visitor_token TEXT NOT NULL,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (inbox_id, visitor_token)
    );
    CREATE INDEX IF NOT EXISTS idx_biz_guest_conv ON business_guests(conversation_id);
  `);
  // Talk2Me #Annonces (Pascal 2026-06-10) — catégorie + description du service.
  try { db.exec('ALTER TABLE business_inboxes ADD COLUMN description TEXT'); } catch { /* déjà */ }
  try { db.exec('ALTER TABLE business_inboxes ADD COLUMN category TEXT'); } catch { /* déjà */ }
  ensured = true;
}

export interface BusinessInbox {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  greeting: string | null;
  accent: string | null;
  bot_enabled: number;
  knowledge: string | null;
  description: string | null;
  category: string | null;
  created_at: number;
}

export function createBusinessInbox(ownerId: string, name: string, description?: string, category?: string): BusinessInbox {
  ensure();
  const db = getDb();
  const id = randomUUID();
  const key = randomBytes(9).toString('hex'); // 18 chars, public, non devinable
  const now = Date.now();
  const clean = (name || '').trim().slice(0, 80) || 'Mon entreprise';
  db.prepare(
    `INSERT INTO business_inboxes (id, owner_id, name, public_key, greeting, accent, bot_enabled, knowledge, description, category, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`
  ).run(id, ownerId, clean, key, `Bonjour 👋 Une question ? Écrivez-nous, on vous répond.`, '#dc2626', (description || '').trim().slice(0, 300) || null, (category || '').trim().slice(0, 40) || null, now);
  return getBusinessInbox(id)!;
}

export function getBusinessInbox(id: string): BusinessInbox | null {
  ensure();
  return (getDb().prepare('SELECT * FROM business_inboxes WHERE id = ?').get(id) as BusinessInbox) || null;
}

export function getBusinessInboxByKey(key: string): BusinessInbox | null {
  ensure();
  if (!key) return null;
  return (getDb().prepare('SELECT * FROM business_inboxes WHERE public_key = ?').get(key) as BusinessInbox) || null;
}

export function listBusinessInboxes(ownerId: string): BusinessInbox[] {
  ensure();
  return getDb()
    .prepare('SELECT * FROM business_inboxes WHERE owner_id = ? ORDER BY created_at DESC')
    .all(ownerId) as BusinessInbox[];
}

export function updateBusinessInbox(
  id: string,
  ownerId: string,
  patch: Partial<Pick<BusinessInbox, 'name' | 'greeting' | 'accent' | 'bot_enabled' | 'knowledge'>>
): BusinessInbox | null {
  ensure();
  const db = getDb();
  const row = getBusinessInbox(id);
  if (!row || row.owner_id !== ownerId) return null;
  const next = {
    name: patch.name !== undefined ? (patch.name || '').trim().slice(0, 80) || row.name : row.name,
    greeting: patch.greeting !== undefined ? (patch.greeting || '').slice(0, 400) : row.greeting,
    accent: patch.accent !== undefined ? (patch.accent || '').slice(0, 16) : row.accent,
    bot_enabled: patch.bot_enabled !== undefined ? (patch.bot_enabled ? 1 : 0) : row.bot_enabled,
    knowledge: patch.knowledge !== undefined ? (patch.knowledge || '').slice(0, 60000) : row.knowledge,
  };
  db.prepare(
    'UPDATE business_inboxes SET name=?, greeting=?, accent=?, bot_enabled=?, knowledge=? WHERE id=?'
  ).run(next.name, next.greeting, next.accent, next.bot_enabled, next.knowledge, id);
  return getBusinessInbox(id);
}

/** Supprime une messagerie entreprise (owner only). Détache aussi ses invités.
 * On NE touche PAS aux conversations/messages existants (le client garde son historique
 * côté sa propre liste) — on retire juste l'inbox et ses liens invités. */
export function deleteBusinessInbox(id: string, ownerId: string): boolean {
  ensure();
  const db = getDb();
  const row = getBusinessInbox(id);
  if (!row || row.owner_id !== ownerId) return false;
  try { db.prepare('DELETE FROM business_guests WHERE inbox_id = ?').run(id); } catch { /* table peut manquer */ }
  db.prepare('DELETE FROM business_inboxes WHERE id = ? AND owner_id = ?').run(id, ownerId);
  return true;
}

/** Supprime UN fil visiteur d'une messagerie entreprise (owner only) : le lien invité
 * + la conversation P2P (participants + messages). L'inbox elle-même reste. */
export function deleteInboxThread(inboxId: string, conversationId: string, ownerId: string): boolean {
  ensure();
  const db = getDb();
  const inbox = getBusinessInbox(inboxId);
  if (!inbox || inbox.owner_id !== ownerId) return false;
  // Le fil doit bien appartenir à CETTE messagerie (sinon on ne touche à rien).
  const link = db.prepare('SELECT conversation_id FROM business_guests WHERE inbox_id = ? AND conversation_id = ?').get(inboxId, conversationId) as { conversation_id: string } | undefined;
  if (!link) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM business_guests WHERE inbox_id = ? AND conversation_id = ?').run(inboxId, conversationId);
    try { db.prepare('DELETE FROM posts WHERE conversation_id = ?').run(conversationId); } catch { /* table peut manquer */ }
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
    db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ?').run(conversationId);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
  });
  tx();
  return true;
}

export interface GuestConv { user_id: string; conversation_id: string; created: boolean }

/**
 * Récupère (ou crée) la conversation d'un visiteur pour cette messagerie.
 * Crée un pseudo-user "guest-xxx" sans mot de passe puis une P2P guest↔owner.
 */
export function getOrStartGuestConversation(
  inbox: BusinessInbox,
  visitorToken: string,
  visitorName?: string | null
): GuestConv {
  ensure();
  const db = getDb();
  const existing = db
    .prepare('SELECT user_id, conversation_id FROM business_guests WHERE inbox_id = ? AND visitor_token = ?')
    .get(inbox.id, visitorToken) as { user_id: string; conversation_id: string } | undefined;
  if (existing) return { ...existing, created: false };

  const now = Date.now();
  const guestId = randomUUID();
  const shortKey = inbox.public_key.slice(0, 4);
  const username = `guest-${shortKey}-${randomBytes(4).toString('hex')}`;
  const talk2meId = 'g' + randomBytes(5).toString('hex');
  const displayName = (visitorName || '').trim().slice(0, 40) || 'Visiteur';
  db.prepare(
    'INSERT INTO users (id, talk2me_id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, NULL, ?)'
  ).run(guestId, talk2meId, username, displayName, now);

  // P2P : owner = créateur (la conv apparaît dans SA messagerie), guest = pair.
  const conv = createP2PConversation(inbox.owner_id, guestId);
  db.prepare(
    'INSERT INTO business_guests (inbox_id, visitor_token, user_id, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(inbox.id, visitorToken, guestId, conv.id, now);
  return { user_id: guestId, conversation_id: conv.id, created: true };
}

/** Le visiteur appartient-il bien à cette messagerie/cette conv ? (sécurité) */
export function guestOwnsConversation(inboxId: string, visitorToken: string, convId: string): { user_id: string } | null {
  ensure();
  const row = getDb()
    .prepare('SELECT user_id FROM business_guests WHERE inbox_id = ? AND visitor_token = ? AND conversation_id = ?')
    .get(inboxId, visitorToken, convId) as { user_id: string } | undefined;
  return row || null;
}

/** IDs des conversations VISITEUR (tous inbox du propriétaire) → à EXCLURE de la
 *  liste de messages principale (elles vivent DANS la messagerie entreprise). */
export function getGuestConversationIds(ownerId: string): Set<string> {
  ensure();
  const rows = getDb()
    .prepare(
      `SELECT bg.conversation_id AS c
         FROM business_guests bg JOIN business_inboxes bi ON bi.id = bg.inbox_id
        WHERE bi.owner_id = ?`
    )
    .all(ownerId) as { c: string }[];
  return new Set(rows.map((r) => r.c));
}

/** Fils clients d'une messagerie entreprise (pour la vue "1 ligne, clients dedans"). */
export interface GuestThread { conversation_id: string; user_id: string; created_at: number; display_name: string | null; last_text: string | null; last_at: number | null }
export function listInboxThreads(inboxId: string): GuestThread[] {
  ensure();
  const db = getDb();
  const rows = db
    .prepare('SELECT user_id, conversation_id, created_at FROM business_guests WHERE inbox_id = ? ORDER BY created_at DESC')
    .all(inboxId) as { user_id: string; conversation_id: string; created_at: number }[];
  return rows.map((r) => {
    const u = db.prepare('SELECT display_name FROM users WHERE id = ?').get(r.user_id) as { display_name: string | null } | undefined;
    const last = db.prepare('SELECT text, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(r.conversation_id) as { text: string | null; created_at: number } | undefined;
    return {
      conversation_id: r.conversation_id,
      user_id: r.user_id,
      created_at: r.created_at,
      display_name: u?.display_name ?? 'Visiteur',
      last_text: last?.text ?? null,
      last_at: last?.created_at ?? null,
    };
  });
}

/** Messages d'une conv après un timestamp (pour le polling du widget). */
export interface BizMsg { id: string; sender_id: string | null; role: string; kind: string | null; text: string | null; created_at: number; ai_name: string | null }
export function getMessagesAfter(convId: string, afterTs: number): BizMsg[] {
  ensure();
  return getDb()
    .prepare(
      `SELECT id, sender_id, role, kind, text, created_at, ai_name
         FROM messages WHERE conversation_id = ? AND created_at > ?
         ORDER BY created_at ASC LIMIT 200`
    )
    .all(convId, afterTs) as BizMsg[];
}
