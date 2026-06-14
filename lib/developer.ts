'use server-only';

/**
 * Talk2Me Developer (Pascal 2026-06-10). Foundation : des apps externes (Onyx…)
 * reçoivent une CLÉ API et publient des cards sur LEUR compte T2M lié — comme une
 * app Facebook qui poste sur sa page. Source réelle uniquement ([[content_grounding]]).
 */

import { randomUUID, randomBytes } from 'crypto';
import { getDb, createDirectCard } from '@/lib/db';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS developer_apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_user_id TEXT NOT NULL,   -- compte T2M sur lequel l'app publie
      api_key TEXT UNIQUE NOT NULL,
      category TEXT,                   -- catégorie par défaut des cards publiées
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_devapp_key ON developer_apps(api_key);
  `);
  ensured = true;
}

export interface DeveloperApp { id: string; name: string; account_user_id: string; api_key: string; category: string | null; created_at: number }

/** Crée une app dev liée à un compte T2M. Retourne l'app (avec sa clé). */
export function createDeveloperApp(name: string, accountUserId: string, category?: string): DeveloperApp {
  ensure();
  const id = randomUUID();
  const apiKey = 't2m_' + randomBytes(24).toString('hex');
  const now = Date.now();
  getDb().prepare('INSERT INTO developer_apps (id, name, account_user_id, api_key, category, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, accountUserId, apiKey, category || null, now);
  return getDb().prepare('SELECT * FROM developer_apps WHERE id = ?').get(id) as DeveloperApp;
}

export function getAppByKey(apiKey: string): DeveloperApp | null {
  ensure();
  if (!apiKey) return null;
  return (getDb().prepare('SELECT * FROM developer_apps WHERE api_key = ?').get(apiKey) as DeveloperApp) || null;
}

// ===== LECTURE (read) — via app/clé, OU lecture publique par API =====
export interface DevCard { id: string; type: string; media_url: string | null; caption: string | null; text: string | null; category: string | null; author_username: string | null; author_name: string | null; created_at: number }

/** Lit le flux public récent (cards). Optionnel : filtrer par catégorie / par compte. */
export function readPublicCards(opts?: { limit?: number; category?: string; account_user_id?: string }): DevCard[] {
  ensure();
  const db = getDb();
  const where: string[] = ['d.deleted_at IS NULL', 'd.archived_at IS NULL'];
  const args: unknown[] = [];
  if (opts?.category) { where.push('d.category = ?'); args.push(opts.category); }
  if (opts?.account_user_id) { where.push('d.user_id = ?'); args.push(opts.account_user_id); }
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
  try {
    return db.prepare(
      `SELECT d.id, d.type, d.media_url, d.caption, d.text, d.category, u.username AS author_username, u.display_name AS author_name, d.created_at
         FROM direct_cards d LEFT JOIN users u ON u.id = d.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY d.created_at DESC LIMIT ${limit}`
    ).all(...args) as DevCard[];
  } catch { return []; }
}

/**
 * Publie un ARTICLE en card sur le compte de l'app. type image si image fournie,
 * sinon texte. caption = titre + résumé (+ lien). Retourne l'id de la card.
 */
export function publishArticleForApp(app: DeveloperApp, a: { title: string; image_url?: string | null; link?: string | null; summary?: string | null }): string {
  const title = (a.title || '').trim().slice(0, 200);
  const summary = (a.summary || '').trim();
  const link = (a.link || '').trim();
  // DOCTRINE T2M : on n'affiche JAMAIS d'URL brute. Le texte = titre + résumé.
  // Le lien est porté par une CTA cliquable « Lire sur <source> » (kind=article).
  const caption = [title, summary].filter(Boolean).join('\n\n').slice(0, 600);
  const article = link ? JSON.stringify({ kind: 'article', source: app.name, title, source_url: link, image_url: a.image_url || null }) : null;
  const card = createDirectCard(app.account_user_id, {
    type: a.image_url ? 'image' : 'texte',
    media_url: a.image_url ? a.image_url : null,
    caption: a.image_url ? caption : null,
    text: a.image_url ? null : caption,
    bg_variant: a.image_url ? null : 'neutral',
    attached_audio_json: null,
    attached_product_json: article,
    boutique_id: null,
    category: app.category || 'Actualités',
  });
  return card.id;
}
