/** Talk2Me — LA boutique unique (type Shein). Catalogue groupé par catégorie.
 *  GET → { categories:[{category, products:[{id,title,image,price_label}]}] }
 *  Public. Sert l'onglet Shop pleine page. */
import { NextResponse } from 'next/server';
import { getStoreCatalog } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  // 12 produits max par catégorie dans le store (aperçu) ; tout reste accessible.
  const categories = getStoreCatalog(12).filter((c) => c.products.length > 0);
  return NextResponse.json({ ok: true, categories });
}
