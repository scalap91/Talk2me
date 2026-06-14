/** Talk2Me — Détail produit COMPLET (#25). On extrait TOUT (pas juste desc+photo) :
 *  variantes, couleurs, tailles, styles, prix/image par variante, toutes les
 *  images, poids, catégorie, matériau, code HS, popularité. Lazy + persisté sur
 *  la card au 1er clic (→ plus aucun appel CJ ensuite). Garde le titre/desc FR
 *  écrits par l'Agent Marchand. Public (vitrine publique). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getRawCardProduct, patchCardProduct } from '@/lib/db';
import { cjConfigured, cjProductFull, cjStock, cjFreight } from '@/lib/cj-dropshipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cardId = req.nextUrl.searchParams.get('card') || '';

  // Mode PREVIEW (sélecteur) : ?pid=<cj_pid> → fiche complète sans card, sans persist.
  const pidPreview = req.nextUrl.searchParams.get('pid') || '';
  if (pidPreview && !cardId) {
    if (!cjConfigured()) return NextResponse.json({ ok: true, title: '', images: [], colors: [], sizes: [], styles: [], variants: [] });
    try {
      const full = await cjProductFull(pidPreview);
      // Délais d'acheminement vers le pays demandé (défaut FR). Pays réglable.
      const country = (req.nextUrl.searchParams.get('country') || 'FR').toUpperCase().slice(0, 2);
      const firstVid = full.variants.find((v) => v.vid)?.vid || '';
      const shipping = firstVid ? await cjFreight(firstVid, country, 1) : [];
      return NextResponse.json({
        ok: true,
        title: full.name,
        price_label: '',
        description: full.description,
        description_html: full.descriptionHtml,
        images: full.images, // TOUTES les images (plus de slice)
        colors: full.colors,
        sizes: full.sizes,
        styles: full.styles,
        // TOUS les champs de chaque variante (plus seulement values/cost/image/sku)
        variants: full.variants.map((v) => ({ values: v.values, cost: v.cost, suggest: v.suggest, image: v.image, sku: v.sku, vid: v.vid, weight: v.weight, key: v.key })),
        weight: full.weight,
        category: full.categoryName,
        sku: full.sku,
        hs_code: full.hsCode,
        material: full.material,
        packaging: full.packaging,
        popularity: full.popularity,
        price_min: full.priceMin,
        price_max: full.priceMax,
        axes: full.axes,
        // Délais d'acheminement (options logistiques CJ → France).
        shipping,
        // BRUT COMPLET de l'API CJ — pour tout voir avant d'envoyer.
        raw: full.raw,
      });
    } catch {
      return NextResponse.json({ ok: true, title: '', images: [], colors: [], sizes: [], styles: [], variants: [] });
    }
  }

  const raw = getRawCardProduct(cardId);
  if (!raw || !raw.product) return NextResponse.json({ error: 'no_product' }, { status: 404 });
  const p = raw.product as Record<string, unknown>;

  // Titre/description FR de l'Agent Marchand (prioritaires sur le brut CJ).
  const frTitle = (p.title as string) || '';
  const frDesc = (p.description as string) || '';
  const priceLabel = (p.price_label as string) || '';

  // Déjà tout extrait → on sert le cache.
  if (p.full_extracted === true) {
    return NextResponse.json({
      ok: true,
      title: frTitle,
      price_label: priceLabel,
      description: frDesc || (p.cj_description as string) || null,
      images: (p.images as string[]) || [p.image_url].filter(Boolean),
      colors: (p.colors as string[]) || [],
      sizes: (p.sizes_list as string[]) || [],
      styles: (p.styles as string[]) || [],
      variants: (p.variants as unknown[]) || [],
      weight: (p.weight as string) || null,
      category: (p.category_name as string) || null,
      stock_total: (p.stock_total as number) ?? null,
      warehouse: (p.warehouse as string) ?? null,
    });
  }

  const pid = p.cj_pid as string | undefined;
  if (!pid || !cjConfigured()) {
    return NextResponse.json({
      ok: true,
      title: frTitle,
      price_label: priceLabel,
      description: frDesc || null,
      images: [p.image_url].filter(Boolean),
      colors: [],
      sizes: [],
      styles: [],
      variants: [],
      weight: null,
      category: null,
    });
  }

  try {
    const full = await cjProductFull(pid);
    // Variantes allégées (ce dont la fiche a besoin pour couleur+taille→prix/image).
    const slimVariants = full.variants.slice(0, 120).map((v) => ({
      values: v.values,
      cost: v.cost,
      image: v.image,
      sku: v.sku,
    }));
    // Stock + entrepôt via la 1re variante (signal de dispo + délai de livraison).
    const stock = full.variants[0]?.vid ? await cjStock(full.variants[0].vid) : null;
    // On PERSISTE tout sur la card (extraction unique). On garde le FR de l'agent.
    patchCardProduct(cardId, {
      full_extracted: true,
      cj_description: full.description ?? '',
      images: full.images.slice(0, 12),
      colors: full.colors,
      sizes_list: full.sizes,
      styles: full.styles,
      variants: slimVariants,
      weight: full.weight,
      category_name: full.categoryName,
      hs_code: full.hsCode,
      material: full.material,
      packaging: full.packaging,
      popularity: full.popularity,
      stock_total: stock?.total ?? null,
      warehouse: stock?.warehouse ?? null,
      warehouse_country: stock?.country ?? null,
    });
    return NextResponse.json({
      ok: true,
      title: frTitle || full.name,
      price_label: priceLabel,
      description: frDesc || full.description || null,
      images: full.images.slice(0, 12),
      colors: full.colors,
      sizes: full.sizes,
      styles: full.styles,
      variants: slimVariants,
      weight: full.weight,
      category: full.categoryName,
      stock_total: stock?.total ?? null,
      warehouse: stock?.warehouse ?? null,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      title: frTitle,
      price_label: priceLabel,
      description: frDesc || null,
      images: [p.image_url].filter(Boolean),
      colors: [],
      sizes: [],
      styles: [],
      variants: [],
      weight: null,
      category: null,
    });
  }
}
