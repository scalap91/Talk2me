/**
 * Talk2Me — Proxy /api/music/alphabet → music-hub /v1/alphabet
 * (Pascal #422, 2026-06-06).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getAlphabet } from '@/lib/music-hub-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const letter = req.nextUrl.searchParams.get('letter') ?? '';
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 20;
  const out = await getAlphabet(letter, limit);
  return NextResponse.json(out);
}
