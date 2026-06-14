/**
 * Talk2Me — Client API CJdropshipping 2.0 (#dropshipping, Pascal 2026-06-08).
 *
 * Couvre la boucle complète : importer (recherche + détails), vendre (créer la
 * commande → CJ expédie depuis son entrepôt France), suivre (tracking).
 * Asset-light : on ne stocke rien, CJ achemine. Données RÉELLES (grounding).
 *
 * Les secrets sont lus via process.env → donc le KILL-SWITCH ([[lib/api-keys]])
 * s'applique : retire la clé `CJ_DROPSHIPPING_API_KEY` et tout appel coupe net.
 *   - CJ_DROPSHIPPING_EMAIL    : email du compte CJ
 *   - CJ_DROPSHIPPING_API_KEY  : clé API générée dans le portail développeur CJ
 *
 * Doc : https://developers.cjdropshipping.com/
 */

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

export class CjError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.code = code;
  }
}

function creds(): { email: string; apiKey: string } {
  const email = process.env.CJ_DROPSHIPPING_EMAIL || '';
  const apiKey = process.env.CJ_DROPSHIPPING_API_KEY || '';
  if (!email || !apiKey) throw new CjError('no_key', 'Clé/compte CJdropshipping absent');
  return { email, apiKey };
}

/** Le dropshipping CJ est-il configuré (clé présente, kill-switch ON) ? */
export function cjConfigured(): boolean {
  return !!(process.env.CJ_DROPSHIPPING_EMAIL && process.env.CJ_DROPSHIPPING_API_KEY);
}

// ── Token (CJ limite getAccessToken : on cache en mémoire process). ──
let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const { email, apiKey } = creds();
  const res = await fetch(`${BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: apiKey }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    result?: boolean;
    data?: { accessToken?: string; accessTokenExpiryDate?: string };
    message?: string;
  };
  const token = j?.data?.accessToken;
  if (!j?.result || !token) throw new CjError('auth_failed', j?.message || 'CJ auth failed');
  // accessToken CJ valable ~15 jours ; on garde 12h pour rester prudent.
  tokenCache = { token, exp: Date.now() + 12 * 3600_000 };
  return token;
}

async function cjGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const token = await getToken();
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: { 'CJ-Access-Token': token } });
  const j = (await res.json().catch(() => ({}))) as { result?: boolean; data?: T; message?: string };
  if (!j?.result) throw new CjError('cj_error', j?.message || `CJ ${path} failed`);
  return j.data as T;
}

async function cjPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { result?: boolean; data?: T; message?: string };
  if (!j?.result) throw new CjError('cj_error', j?.message || `CJ ${path} failed`);
  return j.data as T;
}

/** CJ renvoie parfois un prix en fourchette ("5.97 -- 7.13") → on prend le 1er nombre. */
function firstPrice(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const m = String(v).match(/[\d]+(\.[\d]+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** CJ renvoie productImage parfois en STRING, parfois en TABLEAU (ou JSON string).
 *  On normalise → une seule URL exploitable par <img src>. */
function firstImage(v: unknown): string | null {
  if (!v) return null;
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(s);
        return Array.isArray(arr) && typeof arr[0] === 'string' ? arr[0] : null;
      } catch {
        return s;
      }
    }
    return s;
  }
  return null;
}

/** Normalise un ensemble d'images CJ (string | tableau | JSON string) → string[]. */
function imageList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        return [s];
      }
    }
    return [s];
  }
  return [];
}

// ─────────────── Types simplifiés (ce qu'on consomme) ───────────────
export interface CjProduct {
  pid: string;
  name: string;
  image: string | null;
  price: number | null; // prix fournisseur (coût), en USD CJ
  sku: string | null;
}

interface CjListRaw {
  list?: {
    pid: string;
    productNameEn?: string;
    productImage?: string;
    sellPrice?: string | number;
    productSku?: string;
  }[];
  total?: number;
}

/** Recherche de produits fournisseur (données réelles, grounded).
 *  Si `categoryId` est fourni → sourcing par CATÉGORIE (fiable, vrais produits
 *  de la catégorie) plutôt que par mot-clé (qui ramène du hors-sujet). */
export async function cjSearchProducts(
  query: string,
  page = 1,
  size = 20,
  categoryId?: string
): Promise<CjProduct[]> {
  const params: Record<string, string | number> = { pageNum: page, pageSize: size };
  if (categoryId) params.categoryId = categoryId;
  else params.productNameEn = query;
  const data = await cjGet<CjListRaw>('/product/list', params);
  return (data.list || []).map((p) => ({
    pid: p.pid,
    name: p.productNameEn || '',
    image: firstImage(p.productImage),
    price: firstPrice(p.sellPrice),
    sku: p.productSku || null,
  }));
}

interface CjVariantRaw {
  variantKey?: string;
  variantNameEn?: string;
  variantSellPrice?: string | number;
}
interface CjDetailRaw {
  pid: string;
  productNameEn?: string;
  productImageSet?: string[];
  productImage?: string;
  sellPrice?: string | number;
  description?: string;
  variants?: CjVariantRaw[];
}

/** Nettoie une description HTML CJ → texte simple (grounding : on retranscrit). */
function cleanDescription(html?: string): string | null {
  if (!html) return null;
  const txt = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return txt ? txt.slice(0, 600) : null;
}

/** Extrait les TAILLES réelles depuis les variantes (S/M/L/XL ou numériques). */
function sizesFromVariants(variants?: CjVariantRaw[]): string[] {
  if (!variants?.length) return [];
  const found = new Set<string>();
  const re = /\b(XXXL|XXL|XL|XS|S|M|L|\d{1,3})\b/gi;
  for (const v of variants) {
    const key = `${v.variantKey || ''} ${v.variantNameEn || ''}`;
    let m: RegExpExecArray | null;
    while ((m = re.exec(key)) !== null) found.add(m[1].toUpperCase());
  }
  // Ordre lisible des tailles lettres ; on limite le bruit.
  const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const letters = order.filter((s) => found.has(s));
  const nums = [...found].filter((s) => /^\d+$/.test(s)).sort((a, b) => +a - +b).slice(0, 8);
  return [...letters, ...nums];
}

/** Détail d'un produit (par pid) : images, description RÉELLE, tailles RÉELLES. */
export async function cjProductDetail(
  pid: string
): Promise<CjProduct & { images: string[]; description: string | null; sizes: string[] }> {
  const d = await cjGet<CjDetailRaw>('/product/query', { pid });
  const imgs = imageList(d.productImageSet).concat(imageList(d.productImage));
  const uniqueImgs = [...new Set(imgs)];
  return {
    pid: d.pid,
    name: d.productNameEn || '',
    image: uniqueImgs[0] || firstImage(d.productImage),
    images: uniqueImgs,
    price: firstPrice(d.sellPrice),
    description: cleanDescription(d.description),
    sizes: sizesFromVariants(d.variants),
    sku: null,
  };
}

// ─────────────── MAPPING COMPLET d'un produit CJ (#25) ───────────────
// On mappe TOUS les champs utiles de l'API : variantes (couleur/taille/style/
// prix/image/sku/stock/poids), images, prix, poids, catégorie, code HS,
// matériau, emballage, popularité. productKeyEn donne les AXES des variantes.

export interface CjVariant {
  vid: string;
  sku: string | null;
  image: string | null;
  cost: number | null; // variantSellPrice (coût fournisseur)
  suggest: number | null; // variantSugSellPrice
  weight: number | null;
  key: string | null; // ex "1 Straight-12INCH-100g"
  values: Record<string, string>; // ex { Color:"1 Straight", Size:"12INCH", style:"100g" }
}
export interface CjProductFull {
  pid: string;
  name: string;
  sku: string | null;
  descriptionHtml: string | null;
  description: string | null; // nettoyée
  images: string[];
  mainImage: string | null;
  priceMin: number | null;
  priceMax: number | null;
  weight: string | null;
  categoryName: string | null;
  hsCode: string | null;
  material: string | null;
  packaging: string | null;
  popularity: number | null; // listedNum
  axes: string[]; // ex ["Color","Size","style"]
  colors: string[];
  sizes: string[];
  styles: string[];
  variants: CjVariant[];
  /** Réponse BRUTE complète de CJ (/product/query) — pour tout voir avant publication. */
  raw: unknown;
}

interface CjFullRaw extends CjDetailRaw {
  productSku?: string;
  bigImage?: string;
  productWeight?: string;
  categoryName?: string;
  entryCode?: string;
  materialNameEn?: string;
  packingNameEn?: string;
  productKeyEn?: string;
  listedNum?: number;
  variants?: (CjVariantRaw & {
    vid?: string;
    variantSku?: string;
    variantImage?: string;
    variantWeight?: number | string;
    variantSugSellPrice?: string | number;
  })[];
}

function cleanList(s?: string): string | null {
  if (!s) return null;
  try {
    if (s.trim().startsWith('[')) {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.join(', ') : s;
    }
  } catch {
    /* ignore */
  }
  return s;
}

/** Mapping COMPLET d'un produit CJ (tous les champs + variantes structurées). */
export async function cjProductFull(pid: string): Promise<CjProductFull> {
  const d = await cjGet<CjFullRaw>('/product/query', { pid });

  const images = [...new Set(imageList(d.productImageSet).concat(imageList(d.productImage)))];
  const axes = (d.productKeyEn || '').split('-').map((a) => a.trim()).filter(Boolean);

  const variants: CjVariant[] = (d.variants || []).map((v) => {
    const parts = (v.variantKey || '').split('-').map((p) => p.trim());
    const values: Record<string, string> = {};
    axes.forEach((ax, idx) => {
      if (parts[idx]) values[ax] = parts[idx];
    });
    return {
      vid: String(v.vid || ''),
      sku: v.variantSku || null,
      image: firstImage(v.variantImage),
      cost: firstPrice(v.variantSellPrice),
      suggest: firstPrice(v.variantSugSellPrice),
      weight: typeof v.variantWeight === 'number' ? v.variantWeight : firstPrice(v.variantWeight),
      key: v.variantKey || null,
      values,
    };
  });

  // Valeurs uniques par axe (couleur/taille/style) à partir des variantes.
  const valuesForAxis = (axisMatch: (a: string) => boolean): string[] => {
    const axis = axes.find((a) => axisMatch(a.toLowerCase()));
    if (!axis) return [];
    return [...new Set(variants.map((v) => v.values[axis]).filter(Boolean))];
  };

  const priceRange = (d.sellPrice ? String(d.sellPrice) : '').split(/[-–]/).map((x) => firstPrice(x));

  return {
    pid: d.pid,
    name: d.productNameEn || '',
    sku: d.productSku || null,
    descriptionHtml: d.description || null,
    description: cleanDescription(d.description),
    images,
    mainImage: images[0] || firstImage(d.bigImage),
    priceMin: priceRange[0] ?? null,
    priceMax: priceRange[1] ?? priceRange[0] ?? null,
    weight: d.productWeight || null,
    categoryName: d.categoryName || null,
    hsCode: d.entryCode || null,
    material: cleanList(d.materialNameEn),
    packaging: cleanList(d.packingNameEn),
    popularity: typeof d.listedNum === 'number' ? d.listedNum : null,
    axes,
    colors: valuesForAxis((a) => a.includes('color') || a.includes('colour')),
    sizes: valuesForAxis((a) => a.includes('size')),
    styles: valuesForAxis((a) => !a.includes('color') && !a.includes('colour') && !a.includes('size')),
    variants,
    raw: d,
  };
}

/** Crée une commande chez CJ (CJ achète + expédie). Renvoie le n° de commande. */
export async function cjCreateOrder(input: {
  orderNumber: string;
  shippingZip: string;
  shippingCountryCode: string;
  shippingCountry: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingCustomerName: string;
  shippingPhone: string;
  products: { vid: string; quantity: number }[];
}): Promise<{ orderId: string }> {
  const data = await cjPost<{ orderId: string }>('/shopping/order/createOrderV2', input);
  return data;
}

/** Suivi colis. */
export async function cjTrack(trackNumber: string): Promise<unknown> {
  return cjGet('/logistic/getTrackInfo', { trackNumber });
}

/** Options d'acheminement + DÉLAIS de livraison (API logistique CJ). */
export interface CjShipOption { name: string; price: number | null; days: string | null }
export async function cjFreight(
  vid: string,
  endCountryCode = 'FR',
  quantity = 1
): Promise<CjShipOption[]> {
  if (!vid) return [];
  try {
    // CJ EXIGE startCountryCode (sans lui → 0 option partout). 'CN' = défaut.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await cjPost<any[]>('/logistic/freightCalculate', {
      startCountryCode: 'CN',
      endCountryCode,
      products: [{ quantity, vid }],
    });
    const arr = Array.isArray(data) ? data : [];
    return arr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((o: any) => ({
        name: o.logisticName || o.logisticServiceName || o.name || '',
        price: firstPrice(o.logisticPrice ?? o.freightFee ?? o.price),
        days: o.logisticAging || o.deliveryTime || o.aging || null, // ex "7-15" (jours)
      }))
      .filter((o: CjShipOption) => o.name);
  } catch {
    return [];
  }
}

interface CjStockRaw {
  areaEn?: string;
  countryCode?: string;
  totalInventoryNum?: number;
  storageNum?: number;
}
/** Stock d'une variante (par vid) : quantité totale + entrepôt principal. */
export async function cjStock(vid: string): Promise<{ total: number; warehouse: string | null; country: string | null } | null> {
  if (!vid) return null;
  try {
    const data = await cjGet<CjStockRaw[]>('/product/stock/queryByVid', { vid });
    if (!Array.isArray(data) || data.length === 0) return null;
    // On somme les entrepôts, et on retient l'entrepôt le mieux fourni.
    let total = 0;
    let best: CjStockRaw | null = null;
    for (const a of data) {
      const n = a.totalInventoryNum ?? a.storageNum ?? 0;
      total += n;
      if (!best || n > (best.totalInventoryNum ?? best.storageNum ?? 0)) best = a;
    }
    return { total, warehouse: best?.areaEn ?? null, country: best?.countryCode ?? null };
  } catch {
    return null;
  }
}
