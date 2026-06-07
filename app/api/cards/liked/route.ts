/**
 * /api/cards/liked (GET)
 *
 * Talk2Me #411 (Pascal 2026-06-05) — Liste des cards likées par le user
 * courant, pour l'onglet "Likées" de /drafts.
 *
 * Pascal verbatim : "les card likées devraient apparaître sur la page Card".
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUserLikedCards } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const limitRaw = Number(sp.get('limit') || '50');
  const offsetRaw = Number(sp.get('offset') || '0');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;

  const cards = getUserLikedCards(me.id, limit, offset);
  return NextResponse.json({ ok: true, cards });
}
