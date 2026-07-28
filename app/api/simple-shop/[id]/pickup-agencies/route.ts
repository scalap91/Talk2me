/**
 * GET /api/simple-shop/[id]/pickup-agencies
 * Points de RETRAIT pour une boutique : le dépôt de la boutique + les dépôts de transporteurs
 * vérifiés proches (Phase 1 : transport_profile.depot_*). Mada-first : repère, pas d'adresse rue.
 * → { ok, agencies: [{ id, name, detail, kind:'shop'|'carrier', lat, lng }] }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSimpleShop } from '@/lib/simple-shop';
import { distanceKm } from '@/lib/commerce-pricing';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const shop = getSimpleShop(id) as (ReturnType<typeof getSimpleShop> & { lat?: number | null; lng?: number | null; address?: string | null }) | null;
  if (!shop) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const agencies: { id: string; name: string; detail: string; kind: 'shop' | 'carrier'; lat: number | null; lng: number | null }[] = [];

  // 1) Dépôt de la boutique elle-même (retrait chez le vendeur).
  agencies.push({
    id: `shop:${shop.id}`,
    name: `Dépôt ${shop.name}`,
    detail: shop.address || 'Chez le vendeur (repère à confirmer)',
    kind: 'shop',
    lat: shop.lat ?? null, lng: shop.lng ?? null,
  });

  // 2) Dépôts de transporteurs VÉRIFIÉS (Phase 1). Triés par proximité de la boutique si géo connue.
  try {
    const rows = getDb().prepare(`
      SELECT u.id AS uid, COALESCE(u.display_name, u.username) AS name,
             tp.depot_lat AS lat, tp.depot_lng AS lng, tp.depot_label AS label
      FROM transport_profile tp JOIN users u ON u.id = tp.user_id
      WHERE tp.cni_status='verified' AND tp.depot_lat IS NOT NULL AND tp.depot_lng IS NOT NULL
      LIMIT 30
    `).all() as { uid: string; name: string | null; lat: number; lng: number; label: string | null }[];
    const withDist = rows.map((r) => ({
      ...r,
      dist: (shop.lat != null && shop.lng != null) ? distanceKm(shop.lat, shop.lng, r.lat, r.lng) : null,
    })).sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9)).slice(0, 5);
    for (const r of withDist) {
      agencies.push({
        id: `carrier:${r.uid}`,
        name: `Agence ${r.name || 'Transporteur'}`,
        detail: [r.label, r.dist != null ? `à ${r.dist.toFixed(1)} km` : null].filter(Boolean).join(' · ') || 'Point relais',
        kind: 'carrier',
        lat: r.lat, lng: r.lng,
      });
    }
  } catch { /* transport_profile absent → juste le dépôt boutique */ }

  return NextResponse.json({ ok: true, agencies });
}
