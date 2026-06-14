/**
 * Talk2Me #428 — GET /api/boutiques/[id]
 * Retourne la boutique + ses produits groupés par catégorie (ordre : catégorie
 * d'apparition ; produits boostés d'abord dans chaque catégorie).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBoutiqueById, getBoutiqueBySlug, getBoutiqueProducts } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Résout par id (uuid) OU par slug public (talk2me.fr/<slug>).
  const boutique = getBoutiqueById(id) ?? getBoutiqueBySlug(id);
  if (!boutique) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const products = getBoutiqueProducts(boutique.id);
  // Groupe par catégorie (texte libre ; vide → "Autres").
  const order: string[] = [];
  const byCat = new Map<string, unknown[]>();
  for (const c of products) {
    const cat = (c.category && c.category.trim()) || 'Autres';
    if (!byCat.has(cat)) {
      byCat.set(cat, []);
      order.push(cat);
    }
    let product = null;
    try {
      product = c.attached_product_json ? JSON.parse(c.attached_product_json) : null;
    } catch {
      product = null;
    }
    byCat.get(cat)!.push({
      id: c.id,
      media_url: c.media_url,
      caption: c.caption,
      product,
      boosted: typeof c.boosted_until === 'number' && c.boosted_until > Date.now(),
    });
  }
  const categories = order.map((cat) => ({ category: cat, products: byCat.get(cat) }));

  return NextResponse.json({ ok: true, boutique, categories });
}
