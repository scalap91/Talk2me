/**
 * POST /api/simple-shop/[id]/publish (Pascal 2026-06-14)
 * Publie/rafraîchit la carte VITRINE d'un shop dans le feed.
 * - boutique  → vitrine publique (category null) → visible dans le Hub.
 * - plat_maison → category 'plat_maison' → visible UNIQUEMENT dans le feed Amis
 *   (la mama vend à ses voisins, pas au public).
 * Idempotent : 1 seule carte vitrine par shop (on met à jour si elle existe).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, listItems } from '@/lib/simple-shop';
import { createDirectCard, getDb } from '@/lib/db';
import { createStatus } from '@/lib/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const items = listItems(id);
  const media = shop.cover_url || items.find((it) => it.image_url)?.image_url || null;
  if (!media) return NextResponse.json({ error: 'no_media' }, { status: 400 });

  const category = shop.kind === 'plat_maison' ? 'plat_maison' : null;
  const caption = `${shop.name} [VITRINE:${id}]`;
  const db = getDb();

  // Plat maison → diffusé AUSSI en Story (statut kind 'shop', visible 24h par les amis)
  if (shop.kind === 'plat_maison') {
    try { createStatus(me.id, { kind: 'shop', shop_id: id, media_url: media, caption: shop.name }); } catch { /* best-effort */ }
  }

  // déjà une vitrine pour ce shop ? → on met juste à jour le média
  const existing = db.prepare(
    "SELECT id FROM direct_cards WHERE user_id = ? AND caption LIKE ? AND deleted_at IS NULL LIMIT 1"
  ).get(me.id, `%[VITRINE:${id}]%`) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE direct_cards SET media_url = ?, caption = ?, category = ? WHERE id = ?')
      .run(media, caption, category, existing.id);
    return NextResponse.json({ ok: true, card_id: existing.id, updated: true });
  }

  const card = createDirectCard(me.id, { type: 'image', media_url: media, caption, category });
  return NextResponse.json({ ok: true, card_id: card.id, updated: false });
}
