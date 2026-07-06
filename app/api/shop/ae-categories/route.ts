/**
 * Talk2Me — Catégories AliExpress pour les bulles de la Boutique (Pascal 2026-06-28).
 * GET → { ok, categories: [{ id, name, image }] } (38 catégories principales + image
 * produit représentative, mise en cache). PUBLIC (affiché à tous dans le Shop).
 */
import { NextResponse } from 'next/server';
import { getAeCategoriesWithImages } from '@/lib/aliexpress-categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const categories = await getAeCategoriesWithImages();
    return NextResponse.json({ ok: true, categories });
  } catch {
    return NextResponse.json({ ok: true, categories: [] });
  }
}
