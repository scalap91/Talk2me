/**
 * Talk2Me — Annonces publiques Service / Emploi (listing + action chat).
 * GET ?kind=service|emploi → liste des annonces (le shop EST l'annonce). PII air-gap :
 * aucun owner_id/tel/email exposé, seulement les champs de l'annonce + public_key
 * (clé opaque pour ouvrir la conversation P2P via /api/simple-shop/contact).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listListings } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const kindParam = new URL(req.url).searchParams.get('kind');
  const kind = kindParam === 'emploi' ? 'emploi' : kindParam === 'service' ? 'service' : null;
  if (!kind) return NextResponse.json({ error: 'bad_kind' }, { status: 400 });
  return NextResponse.json({ ok: true, listings: listListings(kind) });
}
