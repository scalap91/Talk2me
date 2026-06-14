/**
 * Talk2Me — POST /api/product/cutout (Pascal 2026-06-11, « intelligence circulaire »).
 * Body : { product: ProductCardData }
 * Renvoie les 3 COUCHES du produit pour le sélecteur (3 slides) :
 *   brut (image source + titre source) → propre (titre/desc nettoyés FR)
 *   → prêt (image DÉTOURÉE transparente + variantes).
 * Détourage GPU (rembg) + nettoyage API (GPU LLM, zéro invention). Caché en base.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { buildProductCutout } from '@/lib/product-cutout';
import { gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';
import type { ProductCardData } from '@/lib/product-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!gpuWorkerAvailable()) return NextResponse.json({ ok: false, error: 'gpu_off' }, { status: 503 });

  let body: { product?: Partial<ProductCardData> } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const p = body.product;
  if (!p || !p.image_url || !p.title) return NextResponse.json({ error: 'product_required' }, { status: 400 });

  // reconstruit une ProductCardData propre (on ne fait pas confiance au client)
  const product: ProductCardData = {
    id: String(p.id || `pick-${Date.now()}`),
    title: String(p.title).slice(0, 240),
    image_url: String(p.image_url),
    price_label: p.price_label ? String(p.price_label).slice(0, 40) : null,
    currency: p.currency ? String(p.currency).slice(0, 8) : null,
    source: (p.source as ProductCardData['source']) || 'AliExpress',
    source_url: String(p.source_url || p.image_url),
    condition: p.condition === 'neuf' ? 'neuf' : null,
  };

  try {
    const cutout = await buildProductCutout(product);
    return NextResponse.json({ ok: true, cutout });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'cutout_failed', detail: (e as Error).message }, { status: 500 });
  }
}
