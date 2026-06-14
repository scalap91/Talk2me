import 'server-only';

/**
 * Talk2Me — Catalogue détouré « intelligence circulaire » (Pascal 2026-06-11).
 *
 * On ne génère pas d'images en l'air : on prend de VRAIES photos produit
 * (AliExpress API + notre Shop), on les DÉTOURE (fond transparent, propre) et on
 * NETTOIE l'API (titres/desc spam multilingues → français factuel, sans invention).
 *
 * Chaque entrée porte les 3 COUCHES que le sélecteur affiche en 3 slides :
 *   1. BRUT            → image source + titre source (spam)
 *   2. TRADUIT/PROPRE  → titre + description nettoyés FR (grounding, zéro invention)
 *   3. PRÊT À ENVOYER  → image détourée transparente + titre propre + variantes
 *
 * Boucle : chaque produit détouré enrichit le catalogue → meilleur matching pour
 * le suivant. Cache en base (product_cutouts) pour ne détourer qu'une fois.
 *
 * Doctrines : `content-grounding` (jamais d'invention), `retranscrire-api` (prix
 * brut), `affiliation-tracking` (source_url = lien affilié).
 */

import { getDb } from '@/lib/db';
import { gpuCutout, gpuLlm, gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';
import type { ProductCardData } from '@/lib/product-search';

export interface ProductVariant {
  color: string;
  image_url?: string | null;
}

export interface ProductCutout {
  src_url: string;          // clé : URL image source
  product_id: string;
  source: string;           // 'AliExpress' | 'shop' | ...
  source_url: string;       // lien produit/affilié
  price_label: string | null;
  // slide 1 — BRUT
  title_raw: string;
  // slide 2 — TRADUIT / PROPRE
  title_clean: string;
  desc_clean: string;
  // slide 3 — PRÊT À ENVOYER
  cutout_url: string | null;  // image détourée (fond transparent) ou null si échec
  variants: ProductVariant[];
  created_at: number;
}

const PUBLIC = '/home/ubuntu/talktome/public';

let _ready = false;
function ensureTable() {
  if (_ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS product_cutouts (
      src_url     TEXT PRIMARY KEY,
      product_id  TEXT,
      source      TEXT,
      source_url  TEXT,
      price_label TEXT,
      title_raw   TEXT,
      title_clean TEXT,
      desc_clean  TEXT,
      cutout_url  TEXT,
      variants_json TEXT,
      created_at  INTEGER
    )
  `);
  _ready = true;
}

interface Row {
  src_url: string; product_id: string; source: string; source_url: string;
  price_label: string | null; title_raw: string; title_clean: string;
  desc_clean: string; cutout_url: string | null; variants_json: string | null; created_at: number;
}

function rowToCutout(r: Row): ProductCutout {
  let variants: ProductVariant[] = [];
  try { variants = r.variants_json ? JSON.parse(r.variants_json) : []; } catch { /* */ }
  return {
    src_url: r.src_url, product_id: r.product_id, source: r.source, source_url: r.source_url,
    price_label: r.price_label, title_raw: r.title_raw, title_clean: r.title_clean,
    desc_clean: r.desc_clean, cutout_url: r.cutout_url, variants, created_at: r.created_at,
  };
}

export function getCachedCutout(srcUrl: string): ProductCutout | null {
  ensureTable();
  const r = getDb().prepare('SELECT * FROM product_cutouts WHERE src_url = ?').get(srcUrl) as Row | undefined;
  return r ? rowToCutout(r) : null;
}

/**
 * Nettoie l'API : titre/desc spam multilingue → français factuel. ZÉRO invention
 * (grounding) : on ne garde que l'info réellement présente dans le titre source.
 */
async function cleanProductText(titleRaw: string, descRaw?: string): Promise<{ title: string; desc: string }> {
  const src = `${titleRaw}${descRaw ? '\n' + descRaw : ''}`.trim().slice(0, 600);
  const fallback = { title: titleRaw.replace(/\s+/g, ' ').trim().slice(0, 60), desc: '' };
  if (!gpuWorkerAvailable() || !src) return fallback;
  const SYS =
    `Tu nettoies des fiches produit e-commerce (souvent du spam SEO multilingue). ` +
    `Donne un JSON {"title": string, "desc": string}. ` +
    `RÈGLES STRICTES : traduis en FRANÇAIS. Garde UNIQUEMENT l'info réellement présente. ` +
    `Supprime mots-clés répétés, emoji, balises promo, années, dimensions inventées. ` +
    `IMPÉRATIF : le title DOIT commencer par le TYPE D'OBJET (ex. "Montre", "Chaussures", ` +
    `"Robe", "Écouteurs", "Sac", "Bracelet"). Ne supprime JAMAIS le type d'objet : c'est ` +
    `le mot le plus important. Si le type est dans le titre source, garde-le en premier. ` +
    `title = "<Type d'objet> <précision courte>", MAX 60 caractères. ` +
    `desc = 1 phrase factuelle tirée du titre, AUCUNE invention (pas de spec/chiffre absent). ` +
    `Réponds UNIQUEMENT le JSON. Exemple : "Montre Strass En Acier Inoxydable Femme" → ` +
    `{"title":"Montre femme en acier strass","desc":"Montre femme en acier inoxydable orné de strass"}.`;
  try {
    const out = await gpuLlm(src, { system: SYS, json: true, temperature: 0.2 });
    if (out) {
      const p = JSON.parse(out) as { title?: string; desc?: string };
      const title = (p.title || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const desc = (p.desc || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      if (title) return { title, desc };
    }
  } catch { /* fallback */ }
  return fallback;
}

/** Convertit un chemin FS public en URL web (/uploads/...). */
function toWebUrl(fsPath: string | null): string | null {
  if (!fsPath) return null;
  if (fsPath.startsWith('/uploads/')) return fsPath;
  if (fsPath.startsWith(PUBLIC)) return fsPath.slice(PUBLIC.length);
  return null;
}

/**
 * Détoure + nettoie UN produit, met en cache, renvoie les 3 couches.
 * Idempotent : si déjà en cache → retour immédiat.
 */
export async function buildProductCutout(p: ProductCardData, opts?: { variants?: ProductVariant[] }): Promise<ProductCutout> {
  ensureTable();
  const srcUrl = p.image_url || '';
  const cached = srcUrl ? getCachedCutout(srcUrl) : null;
  if (cached) return cached;

  // détourage GPU + nettoyage texte en parallèle
  const [cutoutFs, cleaned] = await Promise.all([
    srcUrl ? gpuCutout({ url: srcUrl }) : Promise.resolve(null),
    cleanProductText(p.title),
  ]);
  // gpuCutout écrit dans public/uploads/cutouts → URL web
  const cutoutUrl = toWebUrl(cutoutFs);

  const variants = (opts?.variants || []).filter((v) => v && v.color).slice(0, 12);
  const rec: ProductCutout = {
    src_url: srcUrl,
    product_id: p.id,
    source: p.source,
    source_url: p.source_url,
    price_label: p.price_label,
    title_raw: p.title.replace(/\s+/g, ' ').trim().slice(0, 200),
    title_clean: cleaned.title,
    desc_clean: cleaned.desc,
    cutout_url: cutoutUrl,
    variants,
    created_at: Date.now(),
  };
  if (srcUrl) {
    getDb().prepare(`
      INSERT OR REPLACE INTO product_cutouts
        (src_url, product_id, source, source_url, price_label, title_raw, title_clean, desc_clean, cutout_url, variants_json, created_at)
      VALUES (@src_url, @product_id, @source, @source_url, @price_label, @title_raw, @title_clean, @desc_clean, @cutout_url, @variants_json, @created_at)
    `).run({ ...rec, variants_json: JSON.stringify(rec.variants) });
  }
  return rec;
}

/**
 * Traite une liste de produits avec concurrence LIMITÉE (pour ne pas saturer le
 * GPU pendant que l'user génère ailleurs). Renvoie les entrées enrichies (3 couches).
 */
export async function cutoutProducts(products: ProductCardData[], opts?: { concurrency?: number }): Promise<ProductCutout[]> {
  ensureTable();
  const conc = Math.max(1, Math.min(3, opts?.concurrency ?? 2));
  const out: ProductCutout[] = [];
  for (let i = 0; i < products.length; i += conc) {
    const batch = products.slice(i, i + conc);
    const done = await Promise.all(batch.map((p) => buildProductCutout(p).catch(() => null)));
    for (const r of done) if (r) out.push(r);
  }
  return out;
}
