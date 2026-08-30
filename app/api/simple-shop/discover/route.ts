/**
 * GET /api/simple-shop/discover?q=&lat=&lng= — élargissement de la Recherche (/decouvrir) aux
 * familles commerce hors index cards : ANNONCES + EAT (restos + plats maison). Pascal 2026-08-30.
 *
 * RENDU MINI-FEED : chaque hit joint `preview_item` (l'item feed de sa card vitrine) pour être rendu
 * par le LECTEUR UNIQUE (FeedMini→AlignedPostCard), comme le feed. `card_id` sert au clic → focus feed.
 * GÉO : restos visibles à ≤ 3 km (géoloc) ou par mot-clé ; plats maison EN DIFFUSION à ≤ 500 m OU
 * dont l'auteur est un AMI. PII air-gap : on n'expose pas l'owner_id (le filtre ami est côté serveur).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isShopSectionEnabled } from '@/lib/app-settings';
import { getPublishedAnnonces } from '@/lib/annonces-deposit';
import { listAllShopsByKind, listShopsNearby, listPlatMaisonNearby, listPlatMaisonByOwnersOnline, type SimpleShop, getShopVitrinePostId } from '@/lib/simple-shop';
import { getCardFeedItem } from '@/lib/cards/feed-from-cards';
import { listFriendIds } from '@/lib/db-friendships';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Hit { id: string; title: string; subtitle: string | null; image: string | null; href: string | null; card_id: string | null; preview_item: unknown }

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const meId = me.id;
  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng);
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  // Fiche shop → hit mini-feed (item de la card vitrine, rendu par le lecteur unique).
  const ficheHit = (shop: SimpleShop, subtitle: string | null): Hit => {
    const cardId = getShopVitrinePostId(shop.id);
    let preview: unknown = null;
    if (cardId) { try { preview = getCardFeedItem(cardId, meId); } catch { /* */ } }
    return { id: shop.id, title: shop.name, subtitle, image: shop.cover_url ?? null, href: shop.public_key ? `/b/${shop.public_key}` : null, card_id: cardId, preview_item: preview };
  };

  // ── ANNONCES (déposées + articles boutique badgés annonce) ──
  let annonces: Hit[] = [];
  if (isShopSectionEnabled('annonces')) {
    try {
      annonces = getPublishedAnnonces()
        .filter((a) => match(`${a.title} ${a.category} ${a.city || ''}`))
        .slice(0, 24)
        .map((a) => {
          let preview: unknown = null;
          try { preview = getCardFeedItem(a.id, meId); } catch { /* annonce sans card → ligne */ }
          return { id: a.id, title: a.title, subtitle: [a.category, a.city, a.price_label].filter(Boolean).join(' · ') || null, image: a.image_url, href: a.shop_key ? `/b/${a.shop_key}` : '/annonces', card_id: preview ? a.id : null, preview_item: preview };
        });
    } catch { annonces = []; }
  }

  // ── EAT = restos (≤ 3 km géoloc, sinon mot-clé) + plats maison (≤ 500 m OU ami, en diffusion) ──
  let eat: Hit[] = [];
  if (isShopSectionEnabled('eat')) {
    try {
      // Restos
      const restos = (hasPos ? listShopsNearby('eat', lat, lng, 3000) : listAllShopsByKind('eat'))
        .filter((s) => match(`${s.name} ${s.description || ''} ${s.category || ''}`))
        .slice(0, 20)
        .map((s) => ficheHit(s, [(s as { dist_m?: number }).dist_m != null ? `${Math.round((s as { dist_m?: number }).dist_m!)} m` : null, 'Restaurant'].filter(Boolean).join(' · ') || null));
      // Plats maison : 500 m (géoloc) ∪ amis-en-diffusion
      const friendIds = listFriendIds(meId);
      const platMap = new Map<string, SimpleShop>();
      if (hasPos) for (const s of listPlatMaisonNearby(lat, lng, 500)) platMap.set(s.id, s);
      for (const s of listPlatMaisonByOwnersOnline(friendIds)) platMap.set(s.id, s);
      const plats = [...platMap.values()]
        .filter((s) => match(`${s.name} ${s.description || ''} ${s.category || ''}`))
        .slice(0, 20)
        .map((s) => ficheHit(s, 'Plat maison'));
      eat = [...restos, ...plats].slice(0, 30);
    } catch { eat = []; }
  }

  return NextResponse.json({ ok: true, annonces, eat });
}
