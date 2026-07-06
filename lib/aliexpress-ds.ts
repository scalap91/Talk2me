/**
 * Connecteur AliExpress DROPSHIPPING (API ds.*) — recherche produits réels.
 *
 * Doctrine `content-grounding` / `retranscrire-api` : on ne renvoie QUE des produits
 * réels venant de l'API (titre/prix/image/lien), prix retranscrit brut. Jamais d'invention.
 *
 * Auth : OAuth2 fait via /api/aliexpress/callback → jeton stocké dans
 * data/aliexpress-token.json (access 24h + refresh). Ce module rafraîchit le jeton
 * tout seul quand il approche de l'expiration (refresh_token, valable ~2j).
 *
 * Deux gateways AliExpress :
 *  - /rest  (IOP)  : auth (token create/refresh). Signature = HMAC-SHA256(apiPath + concat trié), hex MAJ.
 *  - /sync  (TOP)  : APIs business (recherche). Signature = HMAC-SHA256(concat trié), hex MAJ ; session=access_token.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProductCardData } from '@/lib/product-search';

const REST_GATEWAY = 'https://api-sg.aliexpress.com/rest';
const SYNC_GATEWAY = 'https://api-sg.aliexpress.com/sync';
const TOKEN_FILE = path.join(process.cwd(), 'data', 'aliexpress-token.json');
const REFRESH_BUFFER_MS = 10 * 60 * 1000; // rafraîchir 10 min avant expiration

interface TokenRecord {
  access_token?: string;
  refresh_token?: string | null;
  expires_in?: number | null;       // secondes (durée de vie access_token)
  obtained_at?: number;             // ms
  [k: string]: unknown;
}

let memToken: TokenRecord | null = null;

function appKey(): string | undefined { return process.env.ALIEXPRESS_DS_APP_KEY; }
function appSecret(): string | undefined { return process.env.ALIEXPRESS_DS_APP_SECRET; }

function readToken(): TokenRecord | null {
  if (memToken) return memToken;
  try { memToken = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); return memToken; }
  catch { return null; }
}

function writeToken(rec: TokenRecord) {
  memToken = rec;
  try { fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true }); fs.writeFileSync(TOKEN_FILE, JSON.stringify(rec, null, 2)); }
  catch (e) { console.error('[ae-ds] write token failed', (e as Error).message); }
}

/** Le connecteur est utilisable si clés + jeton autorisé présents. */
export function aliexpressDsAvailable(): boolean {
  return !!(appKey() && appSecret() && readToken()?.access_token);
}

// ─── Signatures ──────────────────────────────────────────────────────────────
function signRest(apiPath: string, params: Record<string, string>): string {
  const base = apiPath + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return crypto.createHmac('sha256', appSecret()!).update(base, 'utf8').digest('hex').toUpperCase();
}
function signSync(params: Record<string, string>): string {
  const base = Object.keys(params).sort().map((k) => k + params[k]).join('');
  return crypto.createHmac('sha256', appSecret()!).update(base, 'utf8').digest('hex').toUpperCase();
}

/** timestamp TOP "yyyy-MM-dd HH:mm:ss" en GMT+8. */
function topTimestamp(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

// ─── Rafraîchissement du jeton ──────────────────────────────────────────────
async function refreshToken(rec: TokenRecord): Promise<TokenRecord | null> {
  if (!rec.refresh_token) return null;
  const apiPath = '/auth/token/refresh';
  const params: Record<string, string> = {
    app_key: appKey()!, sign_method: 'sha256', timestamp: String(Date.now()), refresh_token: rec.refresh_token,
  };
  params.sign = signRest(apiPath, params);
  try {
    const r = await fetch(REST_GATEWAY + apiPath + '?' + new URLSearchParams(params).toString(), { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    const token = data.access_token || data.accessToken;
    if (!token) { console.error('[ae-ds] refresh refusé', JSON.stringify(data).slice(0, 200)); return null; }
    const next: TokenRecord = {
      ...rec,
      access_token: token,
      refresh_token: data.refresh_token || data.refreshToken || rec.refresh_token,
      expires_in: data.expires_in || rec.expires_in || 86400,
      obtained_at: Date.now(),
      raw: data,
    };
    writeToken(next);
    console.log('[ae-ds] jeton rafraîchi');
    return next;
  } catch (e) { console.error('[ae-ds] refresh échec', (e as Error).message); return null; }
}

/** Renvoie un access_token valide (rafraîchi si nécessaire), ou null. */
async function validAccessToken(): Promise<string | null> {
  let rec = readToken();
  if (!rec?.access_token) return null;
  const ttl = (rec.expires_in ?? 86400) * 1000;
  const expiresAt = (rec.obtained_at ?? 0) + ttl;
  if (Date.now() > expiresAt - REFRESH_BUFFER_MS) {
    const refreshed = await refreshToken(rec);
    if (refreshed?.access_token) rec = refreshed;
    // si le refresh échoue mais que le token actuel n'est pas encore expiré, on tente quand même
  }
  return rec.access_token ?? null;
}

/** Appel signé générique vers le gateway business /sync (TOP). Renvoie le JSON
 *  parsé, ou null si non configuré / pas de jeton / erreur réseau. Le jeton est
 *  rafraîchi automatiquement si besoin. */
export async function dsCall(method: string, biz: Record<string, string>): Promise<Record<string, unknown> | null> {
  if (!appKey() || !appSecret()) return null;
  const token = await validAccessToken();
  if (!token) return null;
  const params: Record<string, string> = {
    method, app_key: appKey()!, session: token, timestamp: topTimestamp(),
    format: 'json', v: '2.0', sign_method: 'sha256', ...biz,
  };
  params.sign = signSync(params);
  try {
    const r = await fetch(SYNC_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    return (await r.json().catch(() => null)) as Record<string, unknown> | null;
  } catch (e) {
    console.error(`[ae-ds] call ${method} échec`, (e as Error).message);
    return null;
  }
}

// ─── Mapping réponse → ProductCardData ──────────────────────────────────────
interface AeItem {
  itemId?: string | number;
  title?: string;
  itemMainPic?: string;
  targetSalePrice?: string;
  targetSalePriceCurrency?: string;
  salePriceFormat?: string;
  score?: string;
  itemUrl?: string;
  cateId?: string; // chemin de catégorie AliExpress "top,...,leaf"
}

function absUrl(u: string | undefined): string | null {
  if (!u) return null;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('http')) return u;
  return null;
}

function mapItem(it: AeItem): ProductCardData | null {
  const id = it.itemId != null ? String(it.itemId) : '';
  const title = (it.title || '').trim();
  const image_url = absUrl(it.itemMainPic);
  if (!id || !title || !image_url) return null; // pas une vraie card → on jette

  const priceNum = it.targetSalePrice ? parseFloat(it.targetSalePrice) : NaN;
  const currency = it.targetSalePriceCurrency || 'EUR';
  const price_label = it.salePriceFormat || (Number.isFinite(priceNum) ? `${priceNum.toFixed(2)} ${currency}` : null);
  const rating = it.score ? parseFloat(it.score) : null;

  return {
    id: `ae-${id}`,
    title: title.length > 110 ? title.slice(0, 107) + '…' : title,
    image_url,
    price_label,
    currency,
    source: 'AliExpress',
    source_url: absUrl(it.itemUrl) || `https://www.aliexpress.com/item/${id}.html`,
    condition: 'neuf',
    price_minor: Number.isFinite(priceNum) ? Math.round(priceNum * 100) : null,
    currency_code: currency,
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    ships_to: ['FR'],
    ae_cat_path: it.cateId || null,
  };
}

// ─── Recherche produits ─────────────────────────────────────────────────────
/**
 * Recherche par mot-clé via aliexpress.ds.text.search.
 * Renvoie [] si non configuré / erreur (doctrine no-excuses, front silencieux).
 */
export async function aliexpressDsSearch(
  query: string,
  limit = 5,
  _opts?: { shipsTo?: string },
): Promise<ProductCardData[]> {
  if (!query || query.trim().length < 2) return [];
  const cap = Math.max(1, Math.min(20, limit));
  const raw = await rawTextSearch(query, cap, 1);
  const out = raw.map(mapItem).filter((x): x is ProductCardData => x !== null);
  if (out.length > 0) console.log(`[ae-ds] ${out.length} produits pour "${query.trim()}"`);
  return out.slice(0, cap);
}

/** Recherche brute (renvoie les items AeItem) — partagée par le hub conversationnel
 *  ET l'adaptateur dropship (lib/aliexpress-dropship.ts). */
export async function rawTextSearch(query: string, pageSize = 20, pageIndex = 1): Promise<AeItem[]> {
  const data = await dsCall('aliexpress.ds.text.search', {
    keyWord: query.trim().slice(0, 120),
    local: 'fr_FR', countryCode: 'FR', currency: 'EUR',
    pageSize: String(Math.max(1, Math.min(50, pageSize))), pageIndex: String(Math.max(1, pageIndex)),
  });
  const resp = data?.aliexpress_ds_text_search_response as Record<string, unknown> | undefined;
  const list = (resp?.data as { products?: { selection_search_product?: AeItem[] } } | undefined)?.products?.selection_search_product;
  return Array.isArray(list) ? list : [];
}

export type { AeItem };
