/**
 * AVIS — module GÉNÉRIQUE de T2M (Pascal 2026-09-05). Réutilisable PARTOUT : location (locat:<id>),
 * boutique (shop:<id>), un utilisateur (user:<id>), une card Discovery (card:<id>)…
 * Force de T2M : chaque avis est ADOSSÉ À L'IDENTITÉ (auteur = compte CIN vérifiée, traçable,
 * sanctionnable s'il diffame) → plus fiable que Google/anonyme. Anti-faux-avis : optionnellement
 * lié à une transaction réelle (context_ref, ex. une réservation) → pas d'avis sans avoir loué.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';

let _init = false;
function db() {
  const d = getDb();
  if (!_init) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        target_ref TEXT NOT NULL,   -- 'locat:<id>' | 'shop:<id>' | 'user:<id>' | 'card:<id>' …
        author_id TEXT NOT NULL,    -- auteur (CIN vérifiée) : traçable + responsable
        stars INTEGER NOT NULL,     -- 1..5
        comment TEXT,
        context_ref TEXT,           -- preuve de transaction (ex: booking id) — anti faux-avis
        created_at INTEGER NOT NULL,
        hidden_at INTEGER,          -- modération (masqué)
        UNIQUE(target_ref, author_id, context_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_ref, created_at DESC);
    `);
    _init = true;
  }
  return d;
}

export interface Review { id: string; author_id: string; author_name: string; author_avatar: string | null; stars: number; comment: string | null; created_at: number }

/** Poser (ou mettre à jour) un avis. 1 avis par (cible, auteur, transaction). stars 1..5. */
export function addReview(input: { targetRef: string; authorId: string; stars: number; comment?: string | null; contextRef?: string | null }): { ok: boolean; id?: string; error?: string } {
  const stars = Math.max(1, Math.min(5, Math.round(input.stars)));
  const target = String(input.targetRef || '').slice(0, 120);
  if (!target || !input.authorId) return { ok: false, error: 'bad_request' };
  const comment = (input.comment || '').trim().slice(0, 1000) || null;
  const ctx = input.contextRef || null;
  const now = Date.now();
  // upsert : réécrit l'avis de cet auteur pour cette cible+transaction.
  const existing = db().prepare('SELECT id FROM reviews WHERE target_ref = ? AND author_id = ? AND (context_ref IS ? OR context_ref = ?)').get(target, input.authorId, ctx, ctx) as { id: string } | undefined;
  if (existing) {
    db().prepare('UPDATE reviews SET stars = ?, comment = ?, created_at = ?, hidden_at = NULL WHERE id = ?').run(stars, comment, now, existing.id);
    return { ok: true, id: existing.id };
  }
  const id = randomUUID();
  db().prepare('INSERT INTO reviews (id, target_ref, author_id, stars, comment, context_ref, created_at) VALUES (?,?,?,?,?,?,?)').run(id, target, input.authorId, stars, comment, ctx, now);
  return { ok: true, id };
}

/** Liste les avis visibles d'une cible (auteur résolu depuis users pour l'affichage). */
export function listReviews(targetRef: string, limit = 30): Review[] {
  return db().prepare(
    `SELECT r.id, r.author_id, r.stars, r.comment, r.created_at,
            COALESCE(u.display_name, u.username) AS author_name, u.avatar_url AS author_avatar
       FROM reviews r LEFT JOIN users u ON u.id = r.author_id
      WHERE r.target_ref = ? AND r.hidden_at IS NULL
      ORDER BY r.created_at DESC LIMIT ?`
  ).all(targetRef, limit).map((r) => {
    const x = r as { id: string; author_id: string; stars: number; comment: string | null; created_at: number; author_name: string | null; author_avatar: string | null };
    return { id: x.id, author_id: x.author_id, stars: x.stars, comment: x.comment, created_at: x.created_at, author_name: x.author_name || 'Membre', author_avatar: x.author_avatar };
  });
}

/** Résumé : moyenne + nombre (pour la pastille ⭐ 4,5 · 12 avis). */
export function reviewSummary(targetRef: string): { avg: number; count: number } {
  const r = db().prepare('SELECT COUNT(*) AS n, AVG(stars) AS a FROM reviews WHERE target_ref = ? AND hidden_at IS NULL').get(targetRef) as { n: number; a: number | null };
  return { avg: r.a ? Math.round(r.a * 10) / 10 : 0, count: r.n || 0 };
}

/** L'avis de CE user sur cette cible (pour pré-remplir le formulaire). */
export function myReview(targetRef: string, authorId: string, contextRef?: string | null): { stars: number; comment: string | null } | null {
  const ctx = contextRef || null;
  const r = db().prepare('SELECT stars, comment FROM reviews WHERE target_ref = ? AND author_id = ? AND (context_ref IS ? OR context_ref = ?)').get(targetRef, authorId, ctx, ctx) as { stars: number; comment: string | null } | undefined;
  return r || null;
}
