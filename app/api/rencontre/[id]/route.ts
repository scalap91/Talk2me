/**
 * Talk2Me — Salon (profil Rencontre enrichi). GET = modèle de vue du salon.
 * Le profil EST un shop `rencontre` ; ses items = la galerie (photos/vidéos, gratuites ou payantes).
 * PII air-gap : on n'expose JAMAIS owner_id, SAUF `hostId` si la personne est EN LIVE (elle diffuse
 * déjà publiquement) pour permettre d'entrer dans la salle. L'URL d'un contenu PAYANT n'est renvoyée
 * QUE si le visiteur y a accès (gratuit / le sien / VIP / déjà déverrouillé) — sinon tuile 🔒 + prix.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, listItems } from '@/lib/simple-shop';
import { getOpenSession } from '@/lib/live/session';
import { isVip, hasContentUnlock, isLiveSaleVideo } from '@/lib/salon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

function isVideo(attributes?: string | null): boolean {
  if (!attributes) return false;
  try { return JSON.parse(attributes)?.media === 'video'; } catch { return false; }
}

export async function GET(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || (shop.kind || '') !== 'rencontre') return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const mine = shop.owner_id === me.id;
  const vip = !mine && isVip(shop.owner_id, me.id);
  const live = getOpenSession(shop.owner_id);

  const media = listItems(id).map((it) => {
    const video = isVideo(it.attributes);
    const paid = (it.price_cents || 0) > 0;
    const unlocked = !paid || mine || vip || hasContentUnlock(it.id, me.id);
    return {
      id: it.id,
      media: video ? 'video' : 'photo',
      paid,
      priceCents: it.price_cents || 0,
      priceLabel: paid ? `${Math.round(it.price_cents).toLocaleString('fr-FR')} Ar` : null,
      label: it.label || null,
      unlocked,
      url: unlocked ? it.image_url : null, // contenu payant : URL cachée tant que non déverrouillé
      // Proprio : cette vidéo payante est-elle mise en vente pendant le live ? (toggle salon)
      liveSale: mine && video && paid ? isLiveSaleVideo(shop.owner_id, it.id) : undefined,
    };
  });

  return NextResponse.json({
    ok: true,
    salon: {
      id: shop.id,
      name: shop.name,
      description: shop.description || null,
      cover_url: shop.cover_url || null,
      ville: shop.address || null,
      age: shop.service_mode || null,
      public_key: shop.public_key,
      mine,
      vip,
      live: !!live,
      hostId: live ? shop.owner_id : null, // exposé UNIQUEMENT si en live
      media,
    },
  });
}
