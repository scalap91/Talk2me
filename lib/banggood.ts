/**
 * Connecteur BANGGOOD Open Platform (préparé d'avance, Pascal 2026-06-29).
 * Banggood = revendeur (catalogue contrôlé) → produits + photos plus PROPRES qu'AliExpress.
 *
 * Auth (doc officielle) : GET /getAccessToken?app_id=&app_secret= → { code, access_token,
 * expires_in:7200 }. Token valable 2 h, mis en cache. Les appels produit passent l'access_token.
 *
 * Gété par clés (BANGGOOD_APP_ID / BANGGOOD_APP_SECRET) → renvoie [] sans clés (doctrine
 * content-grounding). ⚠️ Les NOMS de champs des endpoints produit (getProductList/Info) ne sont
 * pas tous documentés publiquement : le parseur est TOLÉRANT et à confirmer contre l'API réelle
 * dès qu'on a les clés (même méthode que pour AliExpress : on teste, on ajuste).
 */
import type { ProductCardData } from '@/lib/product-search';

const BASE = process.env.BANGGOOD_BASE || 'https://api.banggood.com';

export function banggoodConfigured(): boolean {
  return !!(process.env.BANGGOOD_APP_ID && process.env.BANGGOOD_APP_SECRET);
}

// ─── Token (cache mémoire 2 h) ───────────────────────────────────────────────
let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!banggoodConfigured()) return null;
  if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  try {
    const url = `${BASE}/getAccessToken?app_id=${encodeURIComponent(process.env.BANGGOOD_APP_ID!)}&app_secret=${encodeURIComponent(process.env.BANGGOOD_APP_SECRET!)}`;
    const r = await fetch(url);
    const d = (await r.json().catch(() => ({}))) as { code?: number; access_token?: string; expires_in?: number };
    if (d.access_token) {
      tokenCache = { token: d.access_token, exp: Date.now() + (d.expires_in || 7200) * 1000 };
      return d.access_token;
    }
    console.error('[banggood] getAccessToken refusé', JSON.stringify(d).slice(0, 200));
    return null;
  } catch (e) {
    console.error('[banggood] getAccessToken échec', (e as Error).message);
    return null;
  }
}

/** Appel générique signé par access_token (en query, défaut le plus courant). */
async function bgGet(path: string, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const qs = new URLSearchParams({ access_token: token, ...params }).toString();
    const r = await fetch(`${BASE}/${path}?${qs}`);
    return (await r.json().catch(() => null)) as Record<string, unknown> | null;
  } catch (e) {
    console.error(`[banggood] ${path} échec`, (e as Error).message);
    return null;
  }
}

// ─── Mapping tolérant (noms de champs à confirmer avec les vraies réponses) ──
function abs(u: unknown): string | null {
  if (typeof u !== 'string' || !u) return null;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('http')) return u;
  return null;
}
function pick<T = unknown>(o: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) if (o[k] != null) return o[k] as T;
  return undefined;
}

/** Forme CJ-compatible (pid/name/image/price) pour brancher comme AliExpress. */
export interface BgProduct { pid: string; name: string; image: string | null; price: number | null }

function mapProduct(o: Record<string, unknown>): BgProduct | null {
  const pid = String(pick(o, ['product_id', 'products_id', 'productsId', 'id']) ?? '');
  const name = String(pick(o, ['product_name', 'products_name', 'productsName', 'title', 'name']) ?? '').trim();
  const image = abs(pick(o, ['img', 'image', 'image_url', 'productImage', 'products_image']));
  const priceRaw = pick(o, ['price', 'sale_price', 'final_price', 'products_price']);
  const price = priceRaw != null ? parseFloat(String(priceRaw).replace(/[^0-9.]/g, '')) : null;
  if (!pid || !name || !image) return null;
  return { pid, name, image, price: Number.isFinite(price as number) ? (price as number) : null };
}

/** Catégorie Banggood (forme brute tolérante). */
export interface BgCategory { id: string; name: string; parent: string | null }

/** Arbre des catégories (getCategoryList). À valider : params (lang) + champs réponse. */
export async function banggoodCategories(): Promise<BgCategory[]> {
  if (!banggoodConfigured()) return [];
  const data = await bgGet('getCategoryList', { lang: 'fr' });
  if (!data) return [];
  const list = findFirstArray(data);
  return list
    .map((o) => ({
      id: String(pick(o, ['cat_id', 'category_id', 'id']) ?? ''),
      name: String(pick(o, ['cat_name', 'category_name', 'name', 'title']) ?? '').trim(),
      parent: (() => { const p = pick(o, ['parent_id', 'parent_cat_id', 'pid']); return p != null ? String(p) : null; })(),
    }))
    .filter((c) => c.id && c.name);
}

/** Liste de produits (getProductList). À valider : nom du endpoint + params (cat/keyword/page). */
export async function banggoodSearch(query: string, page = 1, size = 20): Promise<BgProduct[]> {
  if (!banggoodConfigured() || !query || query.trim().length < 2) return [];
  const data = await bgGet('getProductList', { keyword: query.trim().slice(0, 120), page: String(page), page_size: String(size), lang: 'fr', currency: 'EUR' });
  if (!data) return [];
  // réponse probable : { code, result/data: { product_list: [...] } } — on cherche le 1er tableau d'objets.
  const list = findFirstArray(data);
  return list.map(mapProduct).filter((x): x is BgProduct => x !== null).slice(0, size);
}

/** Détail produit (getProductInfo). À valider contre l'API réelle. */
export async function banggoodDetail(pid: string): Promise<(BgProduct & { images: string[]; description: string | null }) | null> {
  if (!banggoodConfigured()) return null;
  const data = await bgGet('getProductInfo', { product_id: String(pid), lang: 'fr', currency: 'EUR' });
  if (!data) return null;
  const o = (findFirstObject(data) || data) as Record<string, unknown>;
  const base = mapProduct(o);
  if (!base) return null;
  const imgs = pick<unknown[]>(o, ['images', 'image_list', 'product_images']);
  const images = Array.isArray(imgs) ? imgs.map(abs).filter((x): x is string => !!x) : (base.image ? [base.image] : []);
  const description = (pick<string>(o, ['description', 'product_description', 'desc']) || null);
  return { ...base, images, description: description ? String(description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) : null };
}

/** Convertit un BgProduct en ProductCardData (pour la recherche unifiée). */
export function bgToCard(p: BgProduct): ProductCardData {
  return {
    id: `bg-${p.pid}`,
    title: p.name.length > 110 ? p.name.slice(0, 107) + '…' : p.name,
    image_url: p.image,
    price_label: p.price != null ? `${p.price.toFixed(2)} €` : null,
    currency: 'EUR',
    source: 'Banggood' as ProductCardData['source'],
    source_url: `https://www.banggood.com/-p-${p.pid}.html`,
    condition: 'neuf',
    price_minor: p.price != null ? Math.round(p.price * 100) : null,
    currency_code: 'EUR',
    ships_to: ['FR'],
  };
}

// Helpers : trouver le 1er tableau/objet de données dans une réponse imbriquée.
function findFirstArray(o: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || o == null) return [];
  if (Array.isArray(o)) return o.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  if (typeof o === 'object') for (const v of Object.values(o as Record<string, unknown>)) {
    const r = findFirstArray(v, depth + 1);
    if (r.length) return r;
  }
  return [];
}
function findFirstObject(o: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || o == null || typeof o !== 'object') return null;
  const obj = o as Record<string, unknown>;
  if (pick(obj, ['product_id', 'products_id', 'product_name', 'products_name'])) return obj;
  for (const v of Object.values(obj)) { const r = findFirstObject(v, depth + 1); if (r) return r; }
  return null;
}
