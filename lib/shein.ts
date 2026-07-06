import 'server-only';
/**
 * Talk2Me — Connecteur SHEIN Open Platform (https://open.sheincorp.com).
 * Marketplace #1 du hub commerce T2M. GATÉ PAR CLÉS : sans SHEIN_APP_KEY/SECRET,
 * renvoie [] (on n'invente JAMAIS de produit — doctrine [[feedback-content-grounding]]).
 *
 * ⚠️ SHEIN Open = programme PARTENAIRE (compte + app + approbation). L'endpoint exact
 * et le schéma de signature se valident avec les identifiants sandbox. Tout est
 * paramétrable par env pour finaliser sans redéploiement de logique :
 *   SHEIN_APP_KEY, SHEIN_APP_SECRET, SHEIN_OPEN_BASE (déf. https://open.sheincorp.com),
 *   SHEIN_SEARCH_PATH (déf. /open-api/goods/search).
 */
import crypto from 'crypto';
import type { ProductCardData } from '@/lib/product-search';
import { extractOffers } from '@/lib/marketplace-util';

export function sheinConfigured(): boolean {
  return !!(process.env.SHEIN_APP_KEY && process.env.SHEIN_APP_SECRET);
}

/** Signature HMAC-SHA256 sur les params triés (schéma courant open-platform ; à confirmer sandbox). */
function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(base).digest('hex');
}

export async function sheinSearch(query: string, limit = 5, opts?: { shipsTo?: string }): Promise<ProductCardData[]> {
  if (!sheinConfigured()) return [];
  const key = process.env.SHEIN_APP_KEY!;
  const secret = process.env.SHEIN_APP_SECRET!;
  const base = (process.env.SHEIN_OPEN_BASE || 'https://open.sheincorp.com').replace(/\/$/, '');
  const path = process.env.SHEIN_SEARCH_PATH || '/open-api/goods/search';
  try {
    const params: Record<string, string> = {
      appKey: key, timestamp: String(Date.now()), keyword: query.slice(0, 120),
      pageSize: String(Math.max(1, Math.min(20, limit))),
      ...(opts?.shipsTo ? { country: opts.shipsTo } : {}),
    };
    params.sign = sign(params, secret);
    const ctrl = AbortSignal.timeout(8000);
    const res = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-key': key },
      body: JSON.stringify(params), signal: ctrl,
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return extractOffers(data, 'SHEIN', limit);
  } catch (e) {
    console.error('[shein] search failed', (e as Error).message);
    return [];
  }
}
