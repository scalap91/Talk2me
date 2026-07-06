import 'server-only';
/**
 * Talk2Me — util commun marketplaces (SHEIN/TEMU). Mappe une réponse JSON RÉELLE
 * vers ProductCardData, de façon tolérante (les noms de champs varient selon l'API).
 * NE FABRIQUE RIEN : un item sans titre OU sans URL OU sans image est ignoré.
 */
import type { ProductCardData } from '@/lib/product-search';

type Source = 'SHEIN' | 'TEMU';
type AnyObj = Record<string, unknown>;

/** Première valeur string non vide parmi plusieurs clés candidates. */
function pick(o: AnyObj, keys: string[]): string | null {
  for (const k of keys) { const v = o[k]; if (typeof v === 'string' && v.trim()) return v.trim(); if (typeof v === 'number') return String(v); }
  return null;
}
function pickNum(o: AnyObj, keys: string[]): number | null {
  for (const k of keys) { const v = o[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v); }
  return null;
}

/** Trouve le tableau d'items dans une réponse (emplacements courants). */
function findItems(data: unknown): AnyObj[] {
  if (Array.isArray(data)) return data as AnyObj[];
  const d = (data || {}) as AnyObj;
  const candidates = [d.items, d.list, d.goods, d.products, d.data,
    (d.data as AnyObj)?.list, (d.data as AnyObj)?.items, (d.data as AnyObj)?.goods,
    (d.result as AnyObj)?.list, (d.result as AnyObj)?.goods, (d.result as AnyObj)?.items];
  for (const c of candidates) if (Array.isArray(c)) return c as AnyObj[];
  return [];
}

export function extractOffers(data: unknown, source: Source, limit: number): ProductCardData[] {
  const items = findItems(data);
  const out: ProductCardData[] = [];
  for (const raw of items) {
    const it = raw as AnyObj;
    const title = pick(it, ['title', 'name', 'goods_name', 'goodsName', 'productName', 'subject']);
    const url = pick(it, ['url', 'link', 'detail_url', 'detailUrl', 'goods_url', 'productUrl', 'pc_url']);
    const image = pick(it, ['image', 'img', 'image_url', 'imageUrl', 'goods_img', 'goodsImg', 'thumb', 'main_image', 'pic']);
    if (!title || !url || !image) continue; // jamais d'item incomplet
    const priceMinor = pickNum(it, ['price_minor', 'salePriceMinor', 'price_cents']);
    const priceLabel = pick(it, ['price_label', 'salePrice', 'price', 'salePriceFormatted', 'formattedPrice', 'min_price']);
    out.push({
      id: `${source.toLowerCase()}:${pick(it, ['id', 'goods_id', 'goodsId', 'productId', 'sku', 'spu']) || out.length}`,
      title, image_url: image.startsWith('//') ? `https:${image}` : image,
      price_label: priceLabel, currency: null,
      source, source_url: url.startsWith('//') ? `https:${url}` : url, condition: 'neuf',
      price_minor: priceMinor, currency_code: pick(it, ['currency', 'currency_code', 'currencyCode']),
      delivery_days: pickNum(it, ['delivery_days', 'deliveryDays', 'shipping_days', 'eta_days']),
      rating: pickNum(it, ['rating', 'score', 'star', 'goods_score']),
      ships_to: Array.isArray(it.ships_to) ? (it.ships_to as string[]) : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}
