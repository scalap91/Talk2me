/**
 * GET /api/cards/feed-diag — DIAGNOSTIC (Pascal 2026-06-30, "preuve pas blabla").
 * Prend les VRAIS items du feed (getMixedFeedRankedPage, le chemin du Hub) et vérifie,
 * un par un, s'ils existent dans les tables que `wipeFeed` supprime. Compteurs bruts en plus.
 * Super-admin only. Lecture seule.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getMixedFeedRankedPage, getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const db = getDb();
  const c = (sql: string) => { try { return (db.prepare(sql).get() as { c: number }).c; } catch { return -1; } };

  const counts = {
    posts: c('SELECT COUNT(*) c FROM posts'),
    direct_cards_total: c('SELECT COUNT(*) c FROM direct_cards'),
    direct_cards_feed: c('SELECT COUNT(*) c FROM direct_cards WHERE boutique_id IS NULL'),
    direct_cards_boutique: c('SELECT COUNT(*) c FROM direct_cards WHERE boutique_id IS NOT NULL'),
    unified_post: c("SELECT COUNT(*) c FROM unified_posts WHERE source='post'"),
    unified_direct_card: c("SELECT COUNT(*) c FROM unified_posts WHERE source='direct_card'"),
  };

  // Les vrais items que le Hub affiche, puis cross-check d'existence.
  const feed = getMixedFeedRankedPage(30, 0) as Array<{ kind: string; data: { id: string } }>;
  const postIds = new Set((db.prepare('SELECT id FROM posts').all() as Array<{ id: string }>).map((r) => r.id));
  const dcRows = db.prepare('SELECT id, boutique_id FROM direct_cards').all() as Array<{ id: string; boutique_id: string | null }>;
  const dc = new Map(dcRows.map((r) => [r.id, r.boutique_id]));

  const sample = feed.map((m) => {
    const id = m.data.id;
    const inPosts = postIds.has(id);
    const inDc = dc.has(id);
    const boutique = inDc ? dc.get(id) ?? null : null;
    const wouldDelete = (m.kind === 'post' && inPosts) || (m.kind === 'direct_card' && inDc && boutique == null);
    return { kind: m.kind, id, inPosts, inDirectCards: inDc, boutique, wouldDelete };
  });
  const covered = sample.filter((s) => s.wouldDelete).length;
  const orphans = sample.filter((s) => !s.inPosts && !s.inDirectCards).map((s) => ({ kind: s.kind, id: s.id }));

  return NextResponse.json({
    ok: true,
    db_path: process.env.TALKTOME_DB_PATH || 'cwd/data/talktome.db',
    counts,
    feed_items: sample.length,
    feed_covered_by_wipe: covered,
    feed_orphans: orphans, // items du feed introuvables dans posts NI direct_cards (= 2e source ?)
    sample: sample.slice(0, 12),
  });
}
