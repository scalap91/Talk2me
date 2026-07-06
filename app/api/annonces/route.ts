import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getAnnoncesByCategory, getServiceAnnonces } from '@/lib/annonces';
import { getPublishedAnnonces } from '@/lib/annonces-deposit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — Annonces : articles de boutique + annonces déposées (formulaire) groupés
// par catégorie + services.
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Annonces déposées via formulaire, regroupées par catégorie (même forme que
  // les articles boutique pour un rendu homogène).
  const deposits = getPublishedAnnonces();
  const depMap = new Map<string, { id: string; media_url: string | null; title: string; category: string; price_label: string | null; description: string | null; city: string | null; seller: string | null; shop_key: string | null; shop_name: string | null; rental?: boolean; driver_option?: string | null; photos?: string[] | null; attributes?: Record<string, string> | null; boosted?: boolean; deposit_cents?: number | null; reserved?: boolean; dotcard?: string | null }[]>();
  for (const a of deposits) {
    if (!depMap.has(a.category)) depMap.set(a.category, []);
    depMap.get(a.category)!.push({
      id: a.id, media_url: a.image_url, title: a.title, category: a.category,
      price_label: a.price_label, description: a.description, city: a.city,
      seller: a.seller ? (a.seller.display_name || a.seller.username) : null,
      shop_key: (a as { shop_key?: string | null }).shop_key ?? null,
      shop_name: (a as { shop_name?: string | null }).shop_name ?? null,
      rental: (a as { rental?: boolean }).rental ?? false,
      driver_option: (a as { driver_option?: string | null }).driver_option ?? null,
      photos: (a as { photos?: string[] | null }).photos ?? null,
      attributes: (a as { attributes?: Record<string, string> | null }).attributes ?? null,
      boosted: (a as { boosted?: boolean }).boosted ?? false,
      deposit_cents: (a as { deposit_cents?: number | null }).deposit_cents ?? null,
      reserved: (a as { reserved?: boolean }).reserved ?? false,
      dotcard: (a as { dotcard?: string | null }).dotcard ?? null,
    });
  }
  const depositCategories = Array.from(depMap.entries())
    .map(([category, items]) => ({ category, count: items.length, items }))
    .sort((x, y) => y.count - x.count);

  return NextResponse.json({
    ok: true,
    categories: getAnnoncesByCategory(),
    deposits: depositCategories,
    services: getServiceAnnonces(),
  });
}
