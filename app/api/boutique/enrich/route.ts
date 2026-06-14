/**
 * Boutique — POST /api/boutique/enrich (Pascal 2026-06-11).
 * Body : { imageUrl, title, description?, inStock?, colors?, lang?, cleanBg? }
 * Réponse : { slides:[brut, brut_trad, final], originalUrl, cleanedUrl }.
 * L'originale n'est JAMAIS écrasée.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { enrichProduct } from '@/lib/boutique/enrich';
import { cleanProductPhoto, photoCleanAvailable } from '@/lib/boutique/photo-clean';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { imageUrl?: string; title?: string; description?: string; inStock?: boolean; colors?: string[]; lang?: string; cleanBg?: 'white' | 'soft' | 'none' | 'enhance'; cleanOnly?: boolean } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!body.imageUrl) return NextResponse.json({ error: 'image_required' }, { status: 400 });

  // mode rapide : juste nettoyer la photo (garde l'originale)
  if (body.cleanOnly) {
    if (!photoCleanAvailable()) return NextResponse.json({ error: 'clean_unavailable' }, { status: 503 });
    const cleanedUrl = await cleanProductPhoto(body.imageUrl, body.cleanBg || 'white');
    if (!cleanedUrl) return NextResponse.json({ error: 'clean_failed' }, { status: 500 });
    return NextResponse.json({ ok: true, originalUrl: body.imageUrl, cleanedUrl });
  }

  const out = await enrichProduct({
    imageUrl: body.imageUrl, title: body.title || '', description: body.description,
    inStock: body.inStock, colors: body.colors, lang: body.lang, cleanBg: body.cleanBg,
  });
  return NextResponse.json({ ok: true, ...out });
}
