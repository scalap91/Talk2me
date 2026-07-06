/**
 * Connecteur BIGBUY (préparé d'avance, Pascal 2026-06-29). BigBuy = grossiste
 * européen au catalogue CURÉ → produits/photos les plus PROPRES (photos pro,
 * variantes carrées, stock temps réel). Coût : Pack Ecommerce 89 €/mois (API/CSV).
 *
 * Auth (doc officielle) : header `Authorization: Bearer <BIGBUY_API_KEY>`.
 * Base : prod `https://api.bigbuy.eu`, sandbox `https://api.sandbox.bigbuy.eu`.
 * Doc REST : https://api.bigbuy.eu/rest/doc
 *
 * Le catalogue BigBuy est éclaté en plusieurs endpoints (products = prix/stock/ids,
 * productinformation = noms/descriptions par langue, productimages = photos). On
 * mappe de façon tolérante. Gété par clé → [] sans clé (doctrine content-grounding).
 */
import type { ProductCardData } from '@/lib/product-search';

const BASE = process.env.BIGBUY_BASE || 'https://api.sandbox.bigbuy.eu';

export function bigbuyConfigured(): boolean {
  return !!process.env.BIGBUY_API_KEY;
}

async function bbGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  if (!bigbuyConfigured()) return null;
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  try {
    const r = await fetch(`${BASE}${path}${qs}`, {
      headers: { Authorization: `Bearer ${process.env.BIGBUY_API_KEY}`, Accept: 'application/json' },
    });
    if (!r.ok) { console.error(`[bigbuy] ${path} HTTP ${r.status}`); return null; }
    return await r.json().catch(() => null);
  } catch (e) {
    console.error(`[bigbuy] ${path} échec`, (e as Error).message);
    return null;
  }
}

// ─── Catégories ──────────────────────────────────────────────────────────────
export interface BbCategory { id: string; name: string; parent: string | null }
export async function bigbuyCategories(isoCode = 'fr'): Promise<BbCategory[]> {
  const data = await bbGet('/rest/catalog/categories.json', { isoCode });
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .map((c) => ({ id: String(c.id ?? ''), name: String(c.name ?? '').trim(), parent: c.parentCategory != null ? String(c.parentCategory) : (c.parent != null ? String(c.parent) : null) }))
    .filter((c) => c.id && c.name);
}

// ─── Produits ────────────────────────────────────────────────────────────────
export interface BbProduct { pid: string; name: string; image: string | null; price: number | null }

function num(v: unknown): number | null { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : null; }

/** Une page de produits (id + prix). Noms/images via productinformation/images. */
export async function bigbuyProducts(page = 1, pageSize = 50): Promise<Record<string, unknown>[]> {
  const data = await bbGet('/rest/catalog/products.json', { page: String(page), pageSize: String(pageSize) });
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/** Infos (nom/description) d'un produit dans une langue. */
export async function bigbuyProductInfo(id: string, isoCode = 'fr'): Promise<Record<string, unknown> | null> {
  const data = await bbGet(`/rest/catalog/productinformation/${encodeURIComponent(id)}.json`, { isoCode });
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

/** Photos d'un produit. */
export async function bigbuyProductImages(id: string): Promise<string[]> {
  const data = await bbGet(`/rest/catalog/productimages/${encodeURIComponent(id)}.json`);
  if (!data || typeof data !== 'object') return [];
  const imgs = (data as { images?: { url?: string }[] }).images || [];
  return imgs.map((i) => i.url).filter((u): u is string => !!u);
}

/** Détail complet (assemble products + info + images). */
export async function bigbuyDetail(id: string, isoCode = 'fr'): Promise<(BbProduct & { images: string[]; description: string | null }) | null> {
  const [info, images] = await Promise.all([bigbuyProductInfo(id, isoCode), bigbuyProductImages(id)]);
  const single = await bbGet(`/rest/catalog/products/${encodeURIComponent(id)}.json`) as Record<string, unknown> | null;
  const name = String(info?.name ?? single?.name ?? '').trim();
  const price = num(single?.retailPrice ?? single?.wholesalePrice ?? single?.price);
  const image = images[0] || null;
  if (!name) return null;
  const descRaw = String(info?.description ?? '');
  return { pid: String(id), name, image, price, images, description: descRaw ? descRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) : null };
}

export function bbToCard(p: BbProduct): ProductCardData {
  return {
    id: `bb-${p.pid}`,
    title: p.name.length > 110 ? p.name.slice(0, 107) + '…' : p.name,
    image_url: p.image,
    price_label: p.price != null ? `${p.price.toFixed(2)} €` : null,
    currency: 'EUR',
    source: 'BigBuy' as ProductCardData['source'],
    source_url: `https://www.bigbuy.eu/`,
    condition: 'neuf',
    price_minor: p.price != null ? Math.round(p.price * 100) : null,
    currency_code: 'EUR',
    ships_to: ['FR'],
  };
}
