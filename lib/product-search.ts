/**
 * Product scraper — pipeline en cascade tolérant aux blocs anti-bot.
 *
 * Doctrine `talktome-embeds-only` / `content-grounding` :
 *  - JAMAIS d'invention. Tout titre/prix/image vient d'une source réelle.
 *  - Si TOUS les tiers échouent → on retourne []. Front silencieux.
 *  - Prix retranscrit brut (doctrine `retranscrire-api`).
 *  - Pas de checkout / panier / affiliation visible (doctrine `card-vivante` MVP).
 *
 * Pipeline :
 *  1. AliExpress FR search (cookie aep_usuc_f forcé). Souvent bloqué quand
 *     l'IP serveur est flagée. Quand ça passe, c'est la source la plus riche.
 *  2. Bing Shopping (`bing.com/shop?q=...&mkt=fr-FR`). Plus tolérant aux IP
 *     serveur. On extrait titre (img alt), image (thfvnext.bing.com), prix
 *     ("XX,XX €" texte brut), offerId Bing comme id stable.
 *
 * Cache mémoire 1h par query (comme recipe-search). Cache même les [] pour
 * éviter de hammer la source pendant un block.
 */
import { aliexpressApiAvailable } from '@/lib/aliexpress-affiliate';

export interface ProductCardData {
  /** ID stable (AliExpress productId ou Bing offerId préfixé). */
  id: string;
  /** Titre produit (truncate côté UI). */
  title: string;
  /** URL image absolue https. null si absente. */
  image_url: string | null;
  /** Label prix BRUT depuis la source ("€ 114,21" / "49,90 €"). null si absent. */
  price_label: string | null;
  /** Code monnaie ISO si détectable (best effort). */
  currency: string | null;
  /** Source (interne — l'user ne la voit pas forcément, T2M choisit la meilleure offre). */
  source: 'AliExpress' | 'Bing Shopping' | 'CJ' | 'SHEIN' | 'TEMU' | 'Banggood' | 'BigBuy';
  /** URL produit cliquable (réelle, pas inventée). */
  source_url: string;
  /** "neuf" / null. */
  condition: 'neuf' | null;
  // ─── Champs de COMPARAISON (best effort, pour ranking « meilleure offre ») ───
  /** Prix numérique en plus petite unité (pour comparer entre marketplaces). */
  price_minor?: number | null;
  /** Code devise ISO du price_minor. */
  currency_code?: string | null;
  /** Délai de livraison estimé (jours). */
  delivery_days?: number | null;
  /** Note vendeur/produit (0–5). */
  rating?: number | null;
  /** Pays livrables (codes ISO, ex ['MG','FR']). null = inconnu. */
  ships_to?: string[] | null;
  /** Chemin de catégorie AliExpress "top,...,leaf" (pour ranger en Boutique). */
  ae_cat_path?: string | null;
}

interface CacheEntry {
  products: ProductCardData[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1h (cache même les [] pour éviter de hammer)
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Cookie qui force AliExpress en site=fra, devise EUR, region FR, locale fr_FR.
// Sans ça, la détection IP serveur peut renvoyer la version DE / EN.
const ALI_COOKIE = 'aep_usuc_f=site=fra&c_tp=EUR&region=FR&b_locale=fr_FR';

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
        'Cookie': ALI_COOKIE,
      },
    });
    if (!res.ok) {
      console.error('[product/ali] HTTP', res.status, 'for', url);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error('[product/ali] fetch error:', (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Parse AliExpress search HTML. La page embarque les items dans un gros JSON
 * `window._dida_config_._init_data_` mais le parsing JSON complet est trop
 * fragile (HTML mélangé). On utilise des regex sur les blocs productId / title
 * / image / price. Chaque champ est indépendant — si un manque, on skip OU on
 * met null sans tout casser.
 */
function parseAliexpress(html: string): ProductCardData[] {
  // Map productId → champs
  type Partial = {
    id: string;
    title?: string;
    image_url?: string;
    price_label?: string;
  };
  const byId = new Map<string, Partial>();
  const ensure = (id: string): Partial => {
    let p = byId.get(id);
    if (!p) { p = { id }; byId.set(id, p); }
    return p;
  };

  // Titre
  const reTitle =
    /"productId":"(\d+)",[\s\S]{0,3500}?"title":\{"displayTitle":"([^"]+)"\}/g;
  let m: RegExpExecArray | null;
  while ((m = reTitle.exec(html))) {
    ensure(m[1]).title = decodeJsonString(m[2]);
  }

  // Image
  const reImg = /"productId":"(\d+)"[\s\S]{0,500}?"imgUrl":"([^"]+)"/g;
  while ((m = reImg.exec(html))) {
    let url = m[2];
    if (url.startsWith('//')) url = 'https:' + url;
    ensure(m[1]).image_url = url;
  }

  // Prix : on cible "salePrice" puis "formattedPrice"
  const rePrice =
    /"productId":"(\d+)"[\s\S]{0,5000}?"prices":\{[\s\S]{0,1500}?"salePrice":\{[\s\S]{0,500}?"formattedPrice":"([^"]+)"/g;
  while ((m = rePrice.exec(html))) {
    ensure(m[1]).price_label = decodeJsonString(m[2]);
  }

  const out: ProductCardData[] = [];
  for (const [id, p] of byId) {
    // On exige au minimum un titre + une image. Sans ça, pas une vraie card.
    if (!p.title || !p.image_url) continue;
    out.push({
      id,
      title: p.title.length > 110 ? p.title.slice(0, 107) + '…' : p.title,
      image_url: p.image_url,
      price_label: p.price_label || null,
      currency: detectCurrency(p.price_label),
      source: 'AliExpress',
      source_url: `https://fr.aliexpress.com/item/${id}.html`,
      condition: 'neuf',
    });
  }
  return out;
}

function decodeJsonString(s: string): string {
  try {
    return JSON.parse('"' + s + '"');
  } catch {
    return s;
  }
}

function detectCurrency(label: string | null | undefined): string | null {
  if (!label) return null;
  if (label.includes('€')) return 'EUR';
  if (label.includes('$')) return 'USD';
  if (label.includes('£')) return 'GBP';
  return null;
}

// ============================================================================
//  TIER 2 : Bing Shopping (fallback quand AliExpress bloque)
// ============================================================================

const BING_BASE = 'https://www.bing.com';

/** Décode l'URL réelle derrière un redirector Bing `/ck/a?...&u=a1<base64url>`. */
function decodeBingRedirect(rawHref: string): string | null {
  try {
    const url = new URL(rawHref, BING_BASE);
    const u = url.searchParams.get('u');
    if (!u) return null;
    // Bing préfixe le base64 avec un marqueur type ("a1", "a2"...).
    const b64 = u.length > 2 && /^[a-z]\d/.test(u) ? u.slice(2) : u;
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    // decoded est souvent un path relatif Bing (`/shop/productpage?...`) →
    // on renvoie une URL absolue Bing pour pouvoir la cliquer.
    if (decoded.startsWith('/')) return BING_BASE + decoded;
    if (/^https?:\/\//i.test(decoded)) return decoded;
    return null;
  } catch {
    return null;
  }
}

/**
 * Bing utilise un fetch HTML simple, sans cookie spécial. L'IP serveur passe
 * dans la grande majorité des cas (testé OK 2026-06-03).
 */
async function fetchBingHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      },
    });
    if (!res.ok) {
      console.error('[product/bing] HTTP', res.status, 'for', url);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error('[product/bing] fetch error:', (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Parse Bing Shopping HTML. Items dans `<li class="br-item ...">`. Chaque item
 * contient :
 *   - data-offerId="<id>"           → id stable Bing
 *   - <img alt="<titre>" src="...">  → titre + image
 *   - du texte "XX,XX €" qq part    → prix brut
 *   - <a href="https://www.bing.com/ck/a?...u=<b64>"> → URL redirector décodable
 */
function parseBingShop(html: string): ProductCardData[] {
  const items: ProductCardData[] = [];
  const itemRe = /<li[^>]*class="br-item[^"]*"[\s\S]*?<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(html))) {
    const block = m[0];

    const offerM = block.match(/data-offerId="([^"]+)"/);
    if (!offerM) continue;
    const offerId = offerM[1];

    // Title via img alt (le plus fiable)
    const titleM = block.match(/<img[^>]+alt="([^"]+)"/);
    if (!titleM) continue;
    const titleRaw = decodeHtmlEntities(titleM[1]).trim();
    if (titleRaw.length < 3) continue;
    const title =
      titleRaw.length > 110 ? titleRaw.slice(0, 107) + '…' : titleRaw;

    // Image src (preserve & decode)
    let image_url: string | null = null;
    const imgM = block.match(/<img[^>]+src="([^"]+)"/);
    if (imgM) {
      image_url = decodeHtmlEntities(imgM[1]);
      if (image_url.startsWith('//')) image_url = 'https:' + image_url;
    }

    // Prix : chasse motif "XX,XX €" ou "XX.XX €" ou "€ XX.XX"
    let price_label: string | null = null;
    const priceM = block.match(
      /(?:€\s*\d[\d.,\s]*|\d[\d.,\s]*\s*€|\d[\d.,\s]*\s*EUR)/,
    );
    if (priceM) {
      price_label = priceM[0].replace(/\s+/g, ' ').trim();
    }

    // URL réelle : décodage du redirector Bing
    let source_url = `${BING_BASE}/shop/productpage?offerId=${encodeURIComponent(offerId)}`;
    const linkM = block.match(/href="(\/ck\/a\?[^"]+)"/);
    if (linkM) {
      const decodedHref = decodeBingRedirect(decodeHtmlEntities(linkM[1]));
      if (decodedHref) source_url = decodedHref;
    }

    items.push({
      id: `bing-${offerId}`,
      title,
      image_url,
      price_label,
      currency: detectCurrency(price_label),
      source: 'Bing Shopping',
      source_url,
      condition: null,
    });
  }
  return items;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ============================================================================
//  PUBLIC : searchProducts — cascade tier-1 (AliExpress) → tier-2 (Bing)
// ============================================================================

/**
 * Recherche produits avec fallback en cascade.
 * Retourne [] uniquement si tous les tiers ont échoué OU rien trouvé.
 * (doctrine no-excuses : pas d'invention, le front affiche rien plutôt que mock).
 *
 * @param query texte libre (ex "robe mariage", "compact fridge")
 * @param limit nombre max de produits (1..10, défaut 5)
 */
/** Classe les offres « meilleure d'abord » : prix croissant (connu d'abord),
 *  puis meilleure note, puis livraison la plus rapide. */
function rankOffers(offers: ProductCardData[]): ProductCardData[] {
  return [...offers].sort((a, b) => {
    const pa = a.price_minor ?? Number.POSITIVE_INFINITY, pb = b.price_minor ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    const ra = a.rating ?? -1, rb = b.rating ?? -1;
    if (ra !== rb) return rb - ra;
    const da = a.delivery_days ?? Number.POSITIVE_INFINITY, db = b.delivery_days ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}

export async function searchProducts(
  query: string,
  limit = 5,
  opts?: { shipsTo?: string },
): Promise<ProductCardData[]> {
  if (!query || query.trim().length < 2) return [];
  const cleanQuery = query.trim().slice(0, 120);
  const cap = Math.max(1, Math.min(10, limit));
  const cacheKey = cleanQuery.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.products.slice(0, cap);
  }

  let products: ProductCardData[] = [];

  // TIER 0a : AliExpress DROPSHIPPING (API ds.*, compte officiel T2M). Source la plus
  // fiable — produits réels, prix EUR livraison FR. Inerte sans jeton OAuth (→ []).
  try {
    const { aliexpressDsAvailable, aliexpressDsSearch } = await import('@/lib/aliexpress-ds');
    if (aliexpressDsAvailable()) {
      products = await aliexpressDsSearch(cleanQuery, cap, opts);
      if (products.length > 0) {
        console.log(`[product] AliExpress DS: ${products.length} items for "${cleanQuery}"`);
      }
    }
  } catch (e) {
    console.error('[product] AliExpress DS step failed', (e as Error).message);
  }

  // HUB MARKETPLACES (MVP : SHEIN + TEMU). Interrogées EN PARALLÈLE quand configurées,
  // fusionnées et classées « meilleure offre » (prix/note/délai). Inertes sans clés
  // (renvoient [] → on retombe sur la cascade AliExpress/Bing). Doctrine : zéro invention.
  try {
    const [{ sheinSearch }, { temuSearch }] = await Promise.all([import('@/lib/shein'), import('@/lib/temu')]);
    const mk = (await Promise.all([
      sheinSearch(cleanQuery, cap, opts).catch(() => []),
      temuSearch(cleanQuery, cap, opts).catch(() => []),
    ])).flat();
    if (mk.length > 0) {
      products = rankOffers(mk).slice(0, cap);
      console.log(`[product] marketplaces (SHEIN+TEMU): ${mk.length} → top ${products.length} for "${cleanQuery}"`);
    }
  } catch (e) {
    console.error('[product] marketplace step failed', (e as Error).message);
  }

  // TIER 0 : API OFFICIELLE AliExpress Affiliate (fallback si pas de marketplace partenaire).
  // Importée en dynamique pour éviter un cycle d'import (ce module exporte le type).
  if (products.length === 0 && aliexpressApiAvailable()) {
    try {
      const { aliexpressSearch } = await import('@/lib/aliexpress-affiliate');
      products = await aliexpressSearch(cleanQuery, cap);
      if (products.length > 0) {
        console.log(`[product] AliExpress API hit: ${products.length} items for "${cleanQuery}"`);
      }
    } catch (e) {
      console.error('[product] AliExpress API failed', (e as Error).message);
    }
  }

  // TIER 1 : AliExpress FR (scrape, si l'API n'a rien donné)
  if (products.length === 0) {
  const aliUrl = `https://fr.aliexpress.com/wholesale?SearchText=${encodeURIComponent(cleanQuery)}`;
  const aliHtml = await fetchHtml(aliUrl);
  if (aliHtml) {
    products = parseAliexpress(aliHtml);
    if (products.length > 0) {
      console.log(`[product] AliExpress hit: ${products.length} items for "${cleanQuery}"`);
    } else {
      console.log(`[product] AliExpress empty/blocked for "${cleanQuery}" (html=${aliHtml.length}b)`);
    }
  }
  }

  // TIER 2 : Bing Shopping (fallback)
  if (products.length === 0) {
    const bingUrl = `${BING_BASE}/shop?q=${encodeURIComponent(cleanQuery)}&mkt=fr-FR`;
    const bingHtml = await fetchBingHtml(bingUrl);
    if (bingHtml) {
      products = parseBingShop(bingHtml);
      console.log(
        `[product] Bing fallback: ${products.length} items for "${cleanQuery}"`,
      );
    }
  }

  cache.set(cacheKey, { products, fetchedAt: Date.now() });
  return products.slice(0, cap);
}
