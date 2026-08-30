/**
 * GET /api/video/search?q= — VIDEO CARD Phase 1 (Pascal 2026-08-29). Recherche de films entiers
 * gratuits + embeddables sur YouTube. Jumeau de /api/music/search.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { searchFilms } from '@/lib/video-hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const films = q ? await searchFilms(q, 30) : [];
  return NextResponse.json({ ok: true, films });
}
