'use server-only';

/**
 * Enrichissement produit en 3 slides (Pascal 2026-06-11) :
 *  1. BRUT           : photo + texte d'origine (l'originale est TOUJOURS gardée)
 *  2. BRUT + TRAD    : photo d'origine + texte traduit
 *  3. RENDU FINAL    : photo nettoyée + texte traduit + fiche (stock, couleurs)
 * Grounding : on traduit/nettoie du RÉEL, on n'invente pas de produit.
 */

import { translateMany } from '@/lib/translate';
import { cleanProductPhoto } from '@/lib/boutique/photo-clean';

export interface ProductInput {
  imageUrl: string;            // /uploads/... (originale, jamais écrasée)
  title: string;
  description?: string;
  inStock?: boolean;           // en stock / épuisé
  colors?: string[];           // variantes couleur
  lang?: string;               // langue cible (défaut fr)
  cleanBg?: 'white' | 'soft' | 'none' | 'enhance';
}

export interface ProductSlide {
  stage: 'brut' | 'brut_trad' | 'final';
  label: string;
  imageUrl: string;
  title: string;
  description: string;
  stockLabel?: string;
  colors?: string[];
}

export async function enrichProduct(input: ProductInput): Promise<{ slides: ProductSlide[]; originalUrl: string; cleanedUrl: string | null }> {
  const lang = input.lang || 'fr';
  const original = input.imageUrl;
  const title = (input.title || '').trim();
  const desc = (input.description || '').trim();

  // 1) traduction (texte réel uniquement)
  let trTitle = title, trDesc = desc;
  try {
    const [a, b] = await translateMany([title, desc], lang);
    trTitle = (a || title).trim();
    trDesc = (b || desc).trim();
  } catch { /* garde l'original si trad indispo */ }

  // 2) nettoyage image (l'originale reste intacte)
  const cleanedUrl = await cleanProductPhoto(original, input.cleanBg || 'white');

  const stockLabel = input.inStock === false ? 'Épuisé' : 'En stock';
  const colors = (input.colors || []).filter(Boolean);

  const slides: ProductSlide[] = [
    { stage: 'brut', label: 'Brut (original)', imageUrl: original, title, description: desc, colors },
    { stage: 'brut_trad', label: 'Brut + traduction', imageUrl: original, title: trTitle, description: trDesc, colors },
    { stage: 'final', label: 'Rendu fiche', imageUrl: cleanedUrl || original, title: trTitle, description: trDesc, stockLabel, colors },
  ];

  return { slides, originalUrl: original, cleanedUrl };
}
