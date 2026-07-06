import 'server-only';
/**
 * Talk2Me — Connecteur TEMU Open Platform (https://partner.temu.com).
 * Marketplace #2 du hub commerce T2M. GATÉ PAR CLÉS : sans TEMU_APP_KEY/SECRET → [].
 * On n'invente JAMAIS de produit (doctrine [[feedback-content-grounding]]).
 *
 * API « ROUTER » (un seul endpoint, POST uniquement, l'API se choisit par `type`) :
 *   EU (France/DE/IT/ES/UK) : https://openapi-b-eu.temu.com/openapi/router
 *   US                      : https://openapi-b-us.temu.com/openapi/router
 *   Global (MX/JP…)         : https://openapi-b-global.temu.com/openapi/router
 * Signature famille PDD/Temu = MD5( secret + concat(params triés clé+valeur) + secret ), MAJUSCULES.
 *
 * Env :
 *   TEMU_APP_KEY, TEMU_APP_SECRET, TEMU_ACCESS_TOKEN (OAuth boutique),
 *   TEMU_BASE (déf. openapi-b-eu), TEMU_SEARCH_TYPE (= nom de la méthode `type` de
 *   recherche produit, À RENSEIGNER depuis la doc « search »).
 */
import crypto from 'crypto';
import type { ProductCardData } from '@/lib/product-search';
import { extractOffers } from '@/lib/marketplace-util';

export function temuConfigured(): boolean {
  return !!(process.env.TEMU_APP_KEY && process.env.TEMU_APP_SECRET && process.env.TEMU_SEARCH_TYPE);
}

/** Signature router PDD/Temu : MD5( secret + (clé+valeur triés) + secret ) en MAJUSCULES. */
function sign(params: Record<string, string>, secret: string): string {
  const concat = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHash('md5').update(secret + concat + secret).digest('hex').toUpperCase();
}

export async function temuSearch(query: string, limit = 5, opts?: { shipsTo?: string }): Promise<ProductCardData[]> {
  if (!temuConfigured()) return [];
  const key = process.env.TEMU_APP_KEY!;
  const secret = process.env.TEMU_APP_SECRET!;
  const base = (process.env.TEMU_BASE || 'https://openapi-b-eu.temu.com').replace(/\/$/, '');
  const router = `${base}/openapi/router`;
  try {
    // Params communs + business. Le détail des params business (nom du mot-clé, pagination,
    // région) vient de la doc « search » → ajustables ici une fois connus.
    const params: Record<string, string> = {
      type: process.env.TEMU_SEARCH_TYPE!,
      app_key: key,
      timestamp: String(Math.floor(Date.now() / 1000)),
      data_type: 'JSON',
      ...(process.env.TEMU_ACCESS_TOKEN ? { access_token: process.env.TEMU_ACCESS_TOKEN } : {}),
      keyword: query.slice(0, 120),
      page_size: String(Math.max(1, Math.min(20, limit))),
      ...(opts?.shipsTo ? { region: opts.shipsTo } : {}),
    };
    params.sign = sign(params, secret);
    const res = await fetch(router, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params), signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return extractOffers(data, 'TEMU', limit);
  } catch (e) {
    console.error('[temu] search failed', (e as Error).message);
    return [];
  }
}
