/**
 * Talk2Me — Vidéos à vendre dans une salle live (Pascal 2026-07-15).
 * room = id du DIFFUSEUR (host). L'hôte a marqué certaines vidéos payantes de son salon
 * « à vendre en live » (lib/salon live_sale_videos). Ce GET les liste pour la salle avec
 * leur état de déverrouillage (gratuit VIP / déjà acheté → URL révélée pour regarder).
 * Achat = POST /api/rencontre/[shopId]/unlock (rail content_unlock, escrow + commission).
 * PII air-gap : owner_id jamais exposé ; on renvoie shopId (nécessaire à l'achat) + item.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShopByKey, resolveLiveHost, listItems } from '@/lib/simple-shop';
import { listLiveSaleVideoIds, isVip, hasContentUnlock } from '@/lib/salon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { room } = await ctx.params;
  // La salle est adressée par la CLÉ de l'annonce → on résout la boutique + son owner.
  const shop = getSimpleShopByKey(room);
  const host = shop ? shop.owner_id : resolveLiveHost(room);
  if (!shop) return NextResponse.json({ ok: true, videos: [] });

  const saleIds = new Set(listLiveSaleVideoIds(host));
  if (!saleIds.size) return NextResponse.json({ ok: true, videos: [], shopId: shop.id });

  const mine = host === me.id;
  const vip = !mine && isVip(host, me.id);
  const videos = listItems(shop.id)
    .filter((it) => saleIds.has(it.id) && (it.price_cents || 0) > 0)
    .map((it) => {
      const unlocked = mine || vip || hasContentUnlock(it.id, me.id);
      return {
        id: it.id,
        label: it.label || null,
        priceCents: it.price_cents || 0,
        priceLabel: `${Math.round(it.price_cents).toLocaleString('fr-FR')} Ar`,
        unlocked,
        url: unlocked ? it.image_url : null, // URL révélée seulement après achat
      };
    });

  return NextResponse.json({ ok: true, shopId: shop.id, videos });
}
