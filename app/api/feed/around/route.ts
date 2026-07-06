/**
 * Talk2Me — Filtre « Autour » (Pascal 2026-07-05). Le contenu géolocalisé le PLUS PROCHE
 * de l'utilisateur : GET ?lat=&lng=&radius= (radius en km) → annonces publiées dans le rayon,
 * triées du plus proche au plus loin. Source = les annonces déposées (getAnnoncesNear), avec
 * leur `.card` stocké (dotcard) que le lecteur SuperCard rendra. Public en lecture.
 * Sans lat/lng → { ok:true, items:[] } : on ne montre RIEN sans position (grounding géo).
 * PII air-gap : jamais owner_id/tel, seul le vendeur username/display_name est exposé.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAnnoncesNear } from '@/lib/annonces-deposit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: true, items: [] });
  }
  const radiusRaw = parseFloat(req.nextUrl.searchParams.get('radius') || '');
  const radiusKm = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, 100) : 1;
  const near = getAnnoncesNear({ lat, lng, radiusKm });
  const items = near.map((a) => ({
    id: a.id,
    dotcard: a.dotcard,
    distance_km: a.distance_km,
    image_url: a.image_url,
    title: a.title,
    category: a.category,
    price_label: a.price_label,
    city: a.city,
    seller: a.seller,
  }));
  return NextResponse.json({ ok: true, items });
}
