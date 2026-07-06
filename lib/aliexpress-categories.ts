/**
 * Arbre des catégories AliExpress (Pascal 2026-06-28 : « on adopte les catégories
 * AliExpress, on oublie les nôtres »). On charge une fois l'arbre (ds.category.get,
 * 551 catégories FR) et on résout l'ID de catégorie d'un produit → sa CATÉGORIE
 * PRINCIPALE (parmi les 38 racines), pour un rangement fidèle dans la Boutique.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dsCall, rawTextSearch } from '@/lib/aliexpress-ds';

const IMG_FILE = path.join(process.cwd(), 'data', 'ae-cat-images.json');

interface CatNode { name: string; parent: number | null }
let CAT_MAP: Map<number, CatNode> | null = null;
let loading: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (CAT_MAP) return;
  if (!loading) {
    loading = (async () => {
      const data = await dsCall('aliexpress.ds.category.get', { language: 'fr' });
      const result = (data?.aliexpress_ds_category_get_response as { resp_result?: { result?: { categories?: { category?: Array<{ category_id: number; category_name: string; parent_category_id?: number }> } } } } | undefined)?.resp_result?.result;
      const list = result?.categories?.category || [];
      if (list.length) {
        const m = new Map<number, CatNode>();
        for (const c of list) m.set(Number(c.category_id), { name: c.category_name, parent: c.parent_category_id != null ? Number(c.parent_category_id) : null });
        CAT_MAP = m;
      }
    })().catch(() => { /* réseau KO → on réessaiera */ }).finally(() => { loading = null; });
  }
  await loading;
}

/** Liste des catégories PRINCIPALES AliExpress (les 38 racines, FR) pour les bulles
 *  de la Boutique. [] si l'arbre n'a pas pu être chargé. */
export async function listAeTopCategories(): Promise<{ id: number; name: string }[]> {
  await ensureLoaded();
  if (!CAT_MAP) return [];
  const out: { id: number; name: string }[] = [];
  for (const [id, node] of CAT_MAP) if (node.parent == null) out.push({ id, name: node.name });
  return out;
}

// ─── Image représentative par catégorie (pour les bulles de la Boutique) ────
let imgCache: Record<string, string> | null = null;
function readImgCache(): Record<string, string> {
  if (imgCache) return imgCache;
  try { imgCache = JSON.parse(fs.readFileSync(IMG_FILE, 'utf8')); } catch { imgCache = {}; }
  return imgCache!;
}
function writeImgCache(c: Record<string, string>) {
  imgCache = c;
  try { fs.mkdirSync(path.dirname(IMG_FILE), { recursive: true }); fs.writeFileSync(IMG_FILE, JSON.stringify(c, null, 2)); } catch { /* */ }
}

/** Catégories UTILES, ordonnées MODE D'ABORD (Pascal 2026-06-29 : « commencer par
 *  les habits », virer les catégories peu utiles type composants/industriel/virtuel).
 *  Sert d'ordre + filtre pour les bulles, le menu Catégories et le remplissage. */
export const USEFUL_CATEGORIES: string[] = [
  'Vêtements pour femmes', 'Vêtements pour hommes', 'Chaussures', 'Vêtements et accessoires',
  'Sous-vêtements', 'Bijoux et accessoires', 'Montres', 'Baggages et sacs',
  'Beauté et santé', 'Accessoires pour vêtements', 'Extensions de cheveux et perruques',
  'Mère et enfants', 'Téléphones et télécommunications', 'Accessoires pour téléphones et télécommunications',
  'Maison et jardin', 'Appareils ménagers', 'Sports et loisirs',
  'Chaussures, vêtements et accessoires de sport', 'Jouets et loisirs', 'Meubles', 'Outils',
  'Automobiles, pièces et accessoires', 'Lumières et éclairage', 'Mariages et événements',
  'Fournitures bureau et scolaires', 'Sécurité et protection', "Amélioration de l'habitat",
  'Ordinateur et bureautique',
];

/** Les catégories principales AliExpress + une image produit représentative
 *  (cherchée une fois puis mise en cache fichier). Pour les bulles de la Boutique. */
export async function getAeCategoriesWithImages(): Promise<{ id: number; name: string; image: string | null }[]> {
  const all = await listAeTopCategories();
  const byName = new Map(all.map((t) => [t.name, t]));
  // On ne garde QUE les catégories utiles, dans l'ordre mode-d'abord.
  const tops = USEFUL_CATEGORIES.map((n) => byName.get(n)).filter((t): t is { id: number; name: string } => !!t);
  const cache = readImgCache();
  let changed = false;
  for (const t of tops) {
    if (cache[t.name] === undefined) {
      try {
        const items = await rawTextSearch(t.name, 1, 1);
        let img = items[0]?.itemMainPic || '';
        if (img.startsWith('//')) img = 'https:' + img;
        cache[t.name] = img;
      } catch { cache[t.name] = ''; }
      changed = true;
    }
  }
  if (changed) writeImgCache(cache);
  // Toutes les bulles doivent avoir une image : pour celles sans image trouvée,
  // on retombe sur une image existante (par défaut) → jamais d'initiale vide.
  const fallback = Object.values(cache).find((v) => v) || null;
  return tops.map((t) => ({ id: t.id, name: t.name, image: cache[t.name] || fallback }));
}

/** ID de catégorie produit (feuille, ou chemin "a,b,c") → nom de la catégorie
 *  PRINCIPALE AliExpress. null si introuvable. */
export async function resolveAeCategory(categoryId: string | number | null | undefined): Promise<string | null> {
  if (categoryId == null || categoryId === '') return null;
  await ensureLoaded();
  if (!CAT_MAP) return null;

  // base_info.category_id = un seul id (feuille) ; search cateId = chemin "top,...,leaf".
  const parts = String(categoryId).split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
  let node: CatNode | undefined;
  for (const cand of [parts[parts.length - 1], parts[0]]) {
    if (cand != null && CAT_MAP.has(cand)) { node = CAT_MAP.get(cand); break; }
  }
  if (!node) return null;

  // Remonter jusqu'à la racine (catégorie principale).
  let guard = 0;
  while (node.parent != null && CAT_MAP.has(node.parent) && guard++ < 12) {
    node = CAT_MAP.get(node.parent)!;
  }
  return node.name || null;
}
