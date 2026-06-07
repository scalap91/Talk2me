import { NextRequest, NextResponse } from 'next/server';
import { searchProducts } from '@/lib/product-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/search/product?query=robe%20de%20mariage&limit=5
 *
 * Réponse :
 *   {products: ProductCardData[]}    // peut être []
 *
 * Doctrine :
 *  - JAMAIS d'invention. Si scraping échoue → products:[]
 *  - Pas de monétisation visible (objet conversationnel, pas commercial)
 *  - Cache 1h en mémoire (géré par searchProducts)
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');
  const limitRaw = request.nextUrl.searchParams.get('limit');
  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { products: [], error: 'bad_query' },
      { status: 400 },
    );
  }
  let limit = 5;
  if (limitRaw) {
    const n = parseInt(limitRaw, 10);
    if (Number.isFinite(n) && n > 0) limit = Math.min(10, n);
  }
  const products = await searchProducts(query, limit);
  return NextResponse.json({ products });
}
