/**
 * Talk2Me — Docs légaux/infos servis en DONNÉES (Pascal 2026-08-13 : « les légales en .card,
 * pour l'appeler où on veut — natif, PAS de WebView »). Source UNIQUE = lib/legal/content.ts.
 * Le natif rend chaque doc comme une card article. Public (contenu non sensible).
 */
import { NextResponse } from 'next/server';
import { LEGAL_DOCS, INFO_DOCS, LEGAL_UPDATED } from '@/lib/legal/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Chaque doc = une card article minimale (id stable = 'legal-<slug>'), rendable par un lecteur.
  const toCard = (d: { slug: string; title: string; body: string }, kind: 'legal' | 'info') => ({
    id: `${kind}-${d.slug}`,
    slug: d.slug,
    types: ['article'],
    title: d.title,
    text: { body: d.body },
    updated: LEGAL_UPDATED,
  });
  return NextResponse.json({
    ok: true,
    updated: LEGAL_UPDATED,
    legal: LEGAL_DOCS.map((d) => toCard(d, 'legal')),
    info: INFO_DOCS.map((d) => toCard(d, 'info')),
  });
}
