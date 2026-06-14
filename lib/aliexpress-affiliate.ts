/**
 * Talk2Me — Client API OFFICIELLE AliExpress Affiliate (Pascal 2026-06-11).
 *
 * « Il lui faut plus de bibliothèque → on se sert de l'API AliExpress pour qu'il
 *  ait plein d'images. » Le scrape (product-search tier-1) se fait bloquer quand
 *  l'IP serveur est flaggée ; l'API officielle est fiable ET donne les liens
 *  d'affiliation (doctrine `affiliation-tracking` : on route via NOTRE tracking_id,
 *  on reverse une part à l'user).
 *
 * Grounding (`content-grounding`) : on ne renvoie QUE des produits réels avec une
 * vraie image. Aucune invention. Si pas de clé ou échec → [] (front silencieux).
 *
 * Kill-switch ([[lib/api-keys]]) : tout passe par process.env. Retire les clés et
 * l'appel coupe net.
 *   - ALIEXPRESS_APP_KEY      : App Key de l'app créée sur l'Open Platform
 *   - ALIEXPRESS_APP_SECRET   : App Secret
 *   - ALIEXPRESS_TRACKING_ID  : Tracking ID affilié (obligatoire pour promotion_link)
 *
 * Doc : https://openservice.aliexpress.com  (méthode aliexpress.affiliate.product.query)
 */

import { createHmac } from 'crypto';
import type { ProductCardData } from '@/lib/product-search';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';
const FETCH_TIMEOUT_MS = 12_000;

export function aliexpressApiAvailable(): boolean {
  return !!(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET);
}

/** Signature HMAC-SHA256 IOP : clés triées, base = concat(k+v), hex MAJUSCULE. */
function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

interface AliProduct {
  product_id?: string | number;
  product_title?: string;
  product_main_image_url?: string;
  target_sale_price?: string;
  target_sale_price_currency?: string;
  product_detail_url?: string;
  promotion_link?: string;
}

function toCard(p: AliProduct): ProductCardData | null {
  const image = (p.product_main_image_url || '').trim();
  const title = (p.product_title || '').trim();
  if (!image || !title) return null; // grounding : pas d'image réelle → on jette
  const id = String(p.product_id || '').trim();
  // On privilégie le lien d'affiliation (notre tracking_id) si présent.
  const url = (p.promotion_link || p.product_detail_url || '').trim();
  if (!url) return null;
  const price = (p.target_sale_price || '').trim();
  const cur = (p.target_sale_price_currency || '').trim() || null;
  return {
    id: `ali:${id || image.slice(-24)}`,
    title,
    image_url: image.startsWith('//') ? `https:${image}` : image,
    price_label: price ? `${price}${cur === 'EUR' ? ' €' : cur ? ' ' + cur : ''}` : null,
    currency: cur,
    source: 'AliExpress',
    source_url: url.startsWith('//') ? `https:${url}` : url,
    condition: 'neuf',
  };
}

/**
 * Recherche produits via l'API officielle Affiliate. Retourne des cartes prêtes
 * à afficher (image réelle + prix brut + lien affilié). [] si indispo/échec.
 */
export async function aliexpressSearch(query: string, limit = 20): Promise<ProductCardData[]> {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID || 'default';
  if (!appKey || !appSecret) return [];
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const pageSize = Math.max(1, Math.min(50, limit));

  // params système + business, tous string (la signature concatène k+v)
  const params: Record<string, string> = {
    app_key: appKey,
    method: 'aliexpress.affiliate.product.query',
    sign_method: 'sha256',
    timestamp: String(Date.now()),
    keywords: q.slice(0, 120),
    page_no: '1',
    page_size: String(pageSize),
    target_currency: 'EUR',
    target_language: 'FR',
    ship_to_country: 'FR',
    tracking_id: trackingId,
    fields: 'product_id,product_title,product_main_image_url,target_sale_price,target_sale_price_currency,product_detail_url,promotion_link',
  };
  params.sign = sign(params, appSecret);

  const body = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('[aliexpress] HTTP', res.status);
      return [];
    }
    const data = (await res.json()) as Record<string, unknown>;
    // erreur API standard (clé invalide, signature, etc.) → on log et []
    if (data.error_response) {
      console.error('[aliexpress] api error', JSON.stringify(data.error_response).slice(0, 300));
      return [];
    }
    // chemin : aliexpress_affiliate_product_query_response.resp_result.result.products.product[]
    const resp = data.aliexpress_affiliate_product_query_response as Record<string, unknown> | undefined;
    const respResult = (resp?.resp_result || (data as Record<string, unknown>).resp_result) as Record<string, unknown> | undefined;
    const result = respResult?.result as Record<string, unknown> | undefined;
    const productsWrap = result?.products as Record<string, unknown> | undefined;
    const list = (productsWrap?.product || []) as AliProduct[];
    if (!Array.isArray(list) || !list.length) return [];
    return list.map(toCard).filter(Boolean) as ProductCardData[];
  } catch (e) {
    console.error('[aliexpress] fetch failed', (e as Error).message);
    return [];
  } finally {
    clearTimeout(t);
  }
}
