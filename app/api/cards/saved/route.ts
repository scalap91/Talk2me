/**
 * GET /api/cards/saved
 * Talk2Me #331 (Pascal 2026-06-04) — Liste paginée des cards bookmarkées du
 * user courant (newest first).
 *
 * Query : ?limit=50&offset=0
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSavedCards } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const limit = Number(sp.get('limit') || '50');
  const offset = Number(sp.get('offset') || '0');

  const cards = getSavedCards(
    me.id,
    Number.isFinite(limit) ? limit : 50,
    Number.isFinite(offset) ? offset : 0
  );
  return NextResponse.json({ ok: true, cards });
}
