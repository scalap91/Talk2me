/**
 * Talk2Me Developer — GET /api/dev/feed (Pascal 2026-06-10). LECTURE.
 * Auth par CLÉ API (Bearer). Lit le flux public récent (cards). Filtres :
 * ?limit=&category=&account=. Permet de lire « en créant une app ou par API ».
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAppByKey, readPublicCards } from '@/lib/developer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const key = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!getAppByKey(key)) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '30', 10);
  const category = url.searchParams.get('category') || undefined;
  const account = url.searchParams.get('account') || undefined;
  return NextResponse.json({ ok: true, cards: readPublicCards({ limit, category, account_user_id: account }) });
}
