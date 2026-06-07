/**
 * Talk2Me — Proxy /api/music/artists → music-hub /v1/artists
 * (Pascal #422, 2026-06-06).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getArtists } from '@/lib/music-hub-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const letter = req.nextUrl.searchParams.get('letter') ?? '';
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 100;
  const out = await getArtists(letter, limit);
  return NextResponse.json(out);
}
