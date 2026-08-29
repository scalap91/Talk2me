/**
 * GET /api/cards/saved
 * Talk2Me #331 (Pascal 2026-06-04) — Liste paginée des cards bookmarkées du
 * user courant (newest first).
 *
 * Query : ?limit=50&offset=0
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSavedCards } from '@/lib/db';
import { getCardFeedItem } from '@/lib/cards/feed-from-cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const limit = Number(sp.get('limit') || '50');
  const offset = Number(sp.get('offset') || '0');

  const cards = getSavedCards(
    me.id,
    Number.isFinite(limit) ? limit : 50,
    Number.isFinite(offset) ? offset : 0
  );
  // MÊME APERÇU que les autres onglets (Pascal 2026-08-29) : quand la card enregistrée RÉFÉRENCE
  // un post du feed (card_data = {id, kind:direct_card|post}), on joint `preview_item` = le vrai
  // rendu feed (getCardFeedItem) → FeedMini côté client, identique à Publiées/Likées.
  const enriched = cards.map((c) => {
    let preview_item: unknown = null;
    const d = c.card_data as { id?: unknown; kind?: unknown } | null;
    if (d && typeof d === 'object' && typeof d.id === 'string' && (d.kind === 'direct_card' || d.kind === 'post')) {
      try { preview_item = getCardFeedItem(d.id, me.id); } catch { /* best-effort */ }
    }
    return { ...c, preview_item };
  });
  return NextResponse.json({ ok: true, cards: enriched });
}
