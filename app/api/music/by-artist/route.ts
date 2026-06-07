/**
 * Talk2Me — Proxy /api/music/by-artist → music-hub /v1/by-artist
 * (Pascal #422, 2026-06-06).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getByArtist } from '@/lib/music-hub-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const artist = req.nextUrl.searchParams.get('artist') ?? '';
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 20;
  const out = await getByArtist(artist, limit);
  return NextResponse.json(out);
}
