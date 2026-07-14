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
import { listArticleItems } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(sp.get('limit') || '200'), 1), 500);

  // Articles = produits de TOUTES les boutiques + les annonces (simple-shop). Pascal 2026-07-14.
  const rows = listArticleItems();
  const items = rows.map((r) => {
    const title = (r.label || (r.description || '').split('\n')[0] || 'Article').slice(0, 60);
    const price_label = r.price_cents ? `${(r.price_cents / 100).toLocaleString('fr-FR')} Ar` : '';
    let image_url = r.image_url || '';
    if (!image_url && r.photos) { try { const ph = JSON.parse(r.photos) as string[]; image_url = Array.isArray(ph) ? ph[0] || '' : ''; } catch { /* */ } }
    return { id: r.id, title, price_label, image_url, category: r.category || '' };
  });

  const filtered = q
    ? items.filter((it) => it.title.toLowerCase().includes(q) || it.category.toLowerCase().includes(q))
    : items;

  return NextResponse.json({ ok: true, products: filtered.slice(0, limit) });
}
