/**
 * Talk2Me — Proxy /api/music/search → music-hub /v1/search
 * (Pascal #422, 2026-06-06).
 * Session user obligatoire pour proxy. L'API key reste côté serveur.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { searchMusic } from '@/lib/music-hub-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 20;
  const out = await searchMusic(q, limit);
  return NextResponse.json(out);
}
