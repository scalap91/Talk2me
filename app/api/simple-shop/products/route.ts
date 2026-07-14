/**
 * GET /api/simple-shop/products
 * Talk2Me (Pascal 2026-07-14) — « on doit trouver TOUS les articles de TOUTES les boutiques ».
 * Catalogue global des produits (toutes boutiques confondues) pour le sélecteur « Article » du
 * composer : l'user attache 1..n articles → items .card (lecteur unique).
 *
 * Query : ?q=recherche (optionnel), ?limit=200
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listAllShopProducts } from '@/lib/db-commerce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(sp.get('limit') || '200'), 1), 500);

  const rows = listAllShopProducts();
  const items = rows.map((r) => {
    let title = '';
    let price_label = '';
    let image_url = '';
    try {
      const p = r.attached_product_json ? (JSON.parse(r.attached_product_json) as Record<string, unknown>) : {};
      title = (p.title as string) || '';
      price_label = (p.price_label as string) || (p.price ? String(p.price) : '');
      image_url = (p.image_url as string) || (Array.isArray(p.images) ? (p.images[0] as string) : '') || '';
    } catch { /* json cassé → fallbacks */ }
    if (!title) title = (r.caption || '').split('\n')[0].slice(0, 60) || 'Article';
    if (!image_url) image_url = r.media_url || '';
    return { id: r.id, title, price_label, image_url, category: r.category || '' };
  });

  const filtered = q
    ? items.filter((it) => it.title.toLowerCase().includes(q) || it.category.toLowerCase().includes(q))
    : items;

  return NextResponse.json({ ok: true, products: filtered.slice(0, limit) });
}
