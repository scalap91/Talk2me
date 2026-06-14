/** Talk2Me — Sélecteur : parcourir les produits fournisseur (CJ).
 *  GET ?categoryId=&q=&page= → { products:[{pid,name,image,price}] }
 *  GET (sans param) → renvoie aussi la liste des catégories navigables.
 *  Auth requise (outil de curation interne). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cjConfigured, cjSearchProducts, CjError } from '@/lib/cj-dropshipping';
import { BOUTIQUE_THEMES, suggestedPrice } from '@/lib/boutique-oneclick';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Catégories navigables = tous les rayons de tous les thèmes (dédupliqués).
function browseCategories() {
  const seen = new Set<string>();
  const out: { label: string; theme: string; emoji: string; categoryId?: string; query: string }[] = [];
  for (const t of BOUTIQUE_THEMES) {
    for (const r of t.rows) {
      const key = (r.categoryId || r.query).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label: `${t.emoji} ${r.name}`, theme: t.name, emoji: t.emoji, categoryId: r.categoryId, query: r.query });
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const categoryId = sp.get('categoryId') || undefined;
  const q = (sp.get('q') || '').trim();
  const page = parseInt(sp.get('page') || '1', 10) || 1;
  const size = Math.min(100, Math.max(12, parseInt(sp.get('size') || '48', 10) || 48));

  if (!cjConfigured()) return NextResponse.json({ ok: true, configured: false, categories: browseCategories(), products: [] });
  if (!categoryId && !q) return NextResponse.json({ ok: true, configured: true, categories: browseCategories(), products: [] });

  try {
    const products = await cjSearchProducts(q, page, size, categoryId);
    const mapped = products
      .filter((p) => p.image && p.name)
      .map((p) => ({ pid: p.pid, name: p.name, image: p.image, cost: p.price, suggested: suggestedPrice(p.price) }));
    return NextResponse.json({
      ok: true,
      configured: true,
      categories: browseCategories(),
      products: mapped,
      page,
      hasMore: products.length >= size, // une page pleine → probablement d'autres
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof CjError ? e.code : 'error' }, { status: 502 });
  }
}
