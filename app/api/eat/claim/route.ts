/**
 * Talk2Me — EAT : REVENDIQUER une fiche. Le proprio clique « Revendiquer votre
 * fiche » → on crée une VRAIE fiche Eat préremplie (nom + cuisine + adresse +
 * devanture Mapillary en couverture + position) et on lie la fiche OSM.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getListing, markClaimed } from '@/lib/eat-listings';
import { createSimpleShop } from '@/lib/simple-shop';
import { logContribution } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { osm_id?: string; shop_id?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.osm_id) return NextResponse.json({ error: 'osm_id_required' }, { status: 400 });
  const l = getListing(b.osm_id);
  if (!l) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (l.status === 'claimed') return NextResponse.json({ error: 'already_claimed' }, { status: 409 });

  // Mode « LIER » : la fiche resto a déjà été créée via AddRestaurantSheet (même modèle
  // que « Ajouter »). On marque juste le lieu OSM comme revendiqué → il quitte la liste.
  if (b.shop_id) {
    markClaimed(l.osm_id, me.id, b.shop_id);
    try { logContribution(me.id, 'resto_claim', { targetId: b.shop_id, targetLabel: l.name }); } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, shop_id: b.shop_id, linked: true });
  }

  const desc = [l.cuisine ? `Cuisine ${l.cuisine.replace(/_/g, ' ').replace(/;/g, ', ')}` : null, l.address].filter(Boolean).join(' · ') || null;
  const shop = createSimpleShop(me.id, l.name, desc || undefined, 'Restaurant', 'eat', {
    lat: l.lat, lng: l.lng, coverUrl: l.photo_url, prepMin: 15,
  });
  markClaimed(l.osm_id, me.id, shop.id);
  // Organisation interne : si l'auteur est contributeur, on crédite la contribution
  // (no-op silencieux sinon). Prime à la création + future % au résultat. Pascal 2026-06-20.
  try { logContribution(me.id, 'resto_claim', { targetId: shop.id, targetLabel: l.name }); } catch { /* best-effort */ }
  return NextResponse.json({ ok: true, shop_id: shop.id, public_key: shop.public_key });
}
