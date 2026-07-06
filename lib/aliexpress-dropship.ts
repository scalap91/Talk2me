/**
 * Adaptateur DROPSHIPPING AliExpress — REMPLACE CJ (Pascal 2026-06-28 : « vire CJ »).
 * Expose la MÊME interface que lib/cj-dropshipping.ts (aeDropConfigured / aeDropSearch /
 * aeDropDetail / AeDropError) pour que les routes dropship basculent sans réécriture.
 *
 * Source = API officielle AliExpress Dropshipping (ds.*), compte T2M. Prix EUR, livraison FR.
 * Doctrine content-grounding : on ne renvoie que des produits réels (titre/prix/image/poids).
 */
import { aliexpressDsAvailable, rawTextSearch, dsCall, type AeItem } from '@/lib/aliexpress-ds';
import { resolveAeCategory } from '@/lib/aliexpress-categories';

export class AeDropError extends Error {
  code: string;
  constructor(code: string, message?: string) { super(message || code); this.code = code; this.name = 'AeDropError'; }
}

/** Produit fournisseur (même forme que CjProduct : pid/name/image/price). */
export interface AeDropProduct {
  pid: string;
  name: string;
  image: string | null;
  price: number | null; // prix EUR (retail AliExpress)
}

export function aeDropConfigured(): boolean {
  return aliexpressDsAvailable();
}

function absUrl(u: string | undefined | null): string | null {
  if (!u) return null;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('http')) return u;
  return null;
}

/** Recherche produits (page/size comme CJ ; categoryId ignoré côté AE text.search). */
export async function aeDropSearch(query: string, page = 1, size = 20, _categoryId?: string): Promise<AeDropProduct[]> {
  if (!aeDropConfigured()) throw new AeDropError('ae_not_configured');
  if (!query || query.trim().length < 2) return [];
  const items: AeItem[] = await rawTextSearch(query, size, page);
  return items
    .map((it) => ({
      pid: it.itemId != null ? String(it.itemId) : '',
      name: (it.title || '').trim(),
      image: absUrl(it.itemMainPic),
      price: it.targetSalePrice ? parseFloat(it.targetSalePrice) : null,
    }))
    .filter((p) => p.pid && p.name && p.image);
}

// ─── Détail produit (aliexpress.ds.product.get) ─────────────────────────────
interface AeSkuProp { sku_property_name?: string; sku_property_value?: string; property_value_definition_name?: string; sku_image?: string }
interface AeSku {
  sku_id?: string; offer_sale_price?: string; sku_price?: string; currency_code?: string;
  ae_sku_property_dtos?: { ae_sku_property_d_t_o?: AeSkuProp[] };
}

export interface AeVariant { values: Record<string, string>; cost: number | null; image: string | null; sku: string | null }

export interface AeDropDetailResult extends AeDropProduct {
  images: string[];
  description: string | null;
  colors: string[];
  sizes: string[];
  variants: AeVariant[];
  weightKg: number | null;
  deliveryDays: number | null;
  category: string | null; // catégorie PRINCIPALE AliExpress (rangement Boutique)
}

function strip(html: string | null | undefined): string | null {
  if (!html) return null;
  const txt = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return txt ? txt.slice(0, 2000) : null;
}

/** Détail réel : images, prix mini, couleurs, tailles, variantes, poids, délai. */
export async function aeDropDetail(pid: string): Promise<AeDropDetailResult> {
  if (!aeDropConfigured()) throw new AeDropError('ae_not_configured');
  const data = await dsCall('aliexpress.ds.product.get', {
    product_id: String(pid), ship_to_country: 'FR', target_currency: 'EUR', target_language: 'fr', local: 'fr_FR',
  });
  const result = (data?.aliexpress_ds_product_get_response as { result?: Record<string, unknown> } | undefined)?.result;
  if (!result) throw new AeDropError('not_found');

  const base = result.ae_item_base_info_dto as { subject?: string; detail?: string; category_id?: number | string } | undefined;
  const name = (base?.subject || '').trim();
  const category = await resolveAeCategory(base?.category_id);

  const imgStr = (result.ae_multimedia_info_dto as { image_urls?: string } | undefined)?.image_urls || '';
  const images = imgStr.split(';').map((s) => absUrl(s.trim())).filter((x): x is string => !!x);

  const skus = (result.ae_item_sku_info_dtos as { ae_item_sku_info_d_t_o?: AeSku[] } | undefined)?.ae_item_sku_info_d_t_o || [];
  let price: number | null = null;
  const colorSet = new Set<string>();
  const sizeSet = new Set<string>();
  const variants: AeVariant[] = [];

  for (const s of skus) {
    const p = s.offer_sale_price ? parseFloat(s.offer_sale_price) : NaN;
    if (Number.isFinite(p)) price = price == null ? p : Math.min(price, p);

    const values: Record<string, string> = {};
    let img: string | null = null;
    for (const prop of s.ae_sku_property_dtos?.ae_sku_property_d_t_o || []) {
      const nm = (prop.sku_property_name || '').trim();
      const val = (prop.sku_property_value || prop.property_value_definition_name || '').trim();
      if (!nm || !val) continue;
      values[nm] = val;
      if (!img && prop.sku_image) img = absUrl(prop.sku_image);
      if (/couleur|color/i.test(nm)) colorSet.add(val);
      if (/taille|size|pointure/i.test(nm)) sizeSet.add(val);
    }
    variants.push({ values, cost: Number.isFinite(p) ? p : null, image: img, sku: s.sku_id || null });
  }

  const pkg = result.package_info_dto as { gross_weight?: string } | undefined;
  const weightKg = pkg?.gross_weight ? parseFloat(pkg.gross_weight) : null;
  const logi = result.logistics_info_dto as { delivery_time?: number } | undefined;

  return {
    pid: String(pid),
    name,
    image: images[0] || null,
    price,
    images,
    description: strip(base?.detail),
    colors: [...colorSet],
    sizes: [...sizeSet],
    variants,
    weightKg: weightKg != null && Number.isFinite(weightKg) ? weightKg : null,
    deliveryDays: logi?.delivery_time ?? null,
    category,
  };
}
