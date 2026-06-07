/**
 * Talk2Me — Proxy /api/music/trending → music-hub /v1/trending
 * (Pascal #422, 2026-06-06).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getTrending } from '@/lib/music-hub-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 50;
  const out = await getTrending(limit);
  return NextResponse.json(out);
}
