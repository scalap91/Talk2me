'use server-only';

/**
 * Talk2Me — APERÇU des médias d'un user (Pascal 2026-06-09).
 * « C'est un aperçu qu'il faut, tu ne copies RIEN. »
 *
 * VUE EN LECTURE SEULE, calculée à la volée à partir des médias DÉJÀ présents
 * (cards directes, médias de messages de sa conv solo, articles de boutique).
 * AUCUNE table de copie, AUCUNE écriture, AUCUNE duplication. On lit, on dédoublonne,
 * on renvoie la liste pour la piocher (ex : créer une story).
 */

import { getDb } from '@/lib/db';

export interface MediaPreview { url: string; kind: string; label: string | null; created_at: number }

/** Liste (aperçu) des médias existants de l'user — read-only, à la volée. */
export function listUserMediaView(userId: string, opts?: { q?: string; kind?: string; limit?: number }): MediaPreview[] {
  if (!userId) return [];
  const db = getDb();
  const seen = new Map<string, MediaPreview>();
  const push = (url: string | null | undefined, kind: string, label: string | null, ts: number) => {
    if (!url || !/^\/uploads\//.test(url)) return;
    if (!seen.has(url)) seen.set(url, { url, kind: kind || 'image', label: label || null, created_at: ts || 0 });
  };

  // 1) Cards directes de l'user (photos/vidéos).
  try {
    for (const c of db.prepare("SELECT media_url, type, caption, created_at FROM direct_cards WHERE user_id = ? AND media_url LIKE '/uploads/%' AND deleted_at IS NULL ORDER BY created_at DESC").all(userId) as { media_url: string; type: string; caption: string | null; created_at: number }[]) {
      push(c.media_url, c.type === 'video' ? 'video' : 'image', c.caption, c.created_at);
    }
  } catch { /* */ }

  // 2) Médias des messages de SA conversation solo.
  try {
    for (const m of db.prepare('SELECT m.media, m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.media IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.created_at DESC').all(userId) as { media: string; created_at: number }[]) {
      try { const md = JSON.parse(m.media); if (md?.url) push(md.url, md.type || 'image', md.filename || null, m.created_at); } catch { /* */ }
    }
  } catch { /* */ }

  // 3) Articles de SES petites boutiques.
  try {
    for (const it of db.prepare("SELECT i.image_url, i.label, i.created_at FROM simple_shop_items i JOIN simple_shops s ON s.id = i.shop_id WHERE s.owner_id = ? AND i.image_url LIKE '/uploads/%' ORDER BY i.created_at DESC").all(userId) as { image_url: string; label: string | null; created_at: number }[]) {
      push(it.image_url, 'image', it.label, it.created_at);
    }
  } catch { /* */ }

  let list = Array.from(seen.values()).sort((a, b) => b.created_at - a.created_at);
  if (opts?.kind) list = list.filter((m) => m.kind === opts.kind);
  if (opts?.q && opts.q.trim()) {
    const q = opts.q.trim().toLowerCase();
    list = list.filter((m) => (m.label || '').toLowerCase().includes(q));
  }
  const limit = Math.min(Math.max(opts?.limit ?? 300, 1), 500);
  return list.slice(0, limit);
}
