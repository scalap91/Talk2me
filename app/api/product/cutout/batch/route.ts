/**
 * Talk2Me — POST /api/product/cutout/batch (Pascal 2026-06-11).
 * Body : { products: ProductCardData[] }
 * Détoure + nettoie TOUTE une grille de produits d'un coup (concurrence limitée,
 * caché en base). Renvoie { cutouts: ProductCutout[] }. Sert le sélecteur où
 * chaque produit affiche ses 3 états (brut → traduit → détouré) qui défilent.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cutoutProducts } from '@/lib/product-cutout';
import { gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';
import type { ProductCardData } from '@/lib/product-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!gpuWorkerAvailable()) return NextResponse.json({ ok: false, error: 'gpu_off', cutouts: [] }, { status: 200 });

  let body: { products?: Partial<ProductCardData>[] } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const list = (body.products || []).filter((p) => p && p.image_url && p.title).slice(0, 24);
  if (!list.length) return NextResponse.json({ ok: true, cutouts: [] });

  const products: ProductCardData[] = list.map((p, i) => ({
    id: String(p.id || `pick-${i}`),
    title: String(p.title).slice(0, 240),
    image_url: String(p.image_url),
    price_label: p.price_label ? String(p.price_label).slice(0, 40) : null,
    currency: p.currency ? String(p.currency).slice(0, 8) : null,
    source: (p.source as ProductCardData['source']) || 'CJ',
    source_url: String(p.source_url || p.image_url),
    condition: p.condition === 'neuf' ? 'neuf' : null,
  }));

  try {
    const cutouts = await cutoutProducts(products, { concurrency: 3 });
    return NextResponse.json({ ok: true, cutouts });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'batch_failed', detail: (e as Error).message, cutouts: [] }, { status: 500 });
  }
}
