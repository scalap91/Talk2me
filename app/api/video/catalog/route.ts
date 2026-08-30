/**
 * GET /api/video/catalog — VIDEO CARD Phase 1 (Pascal 2026-08-29). Catalogue de films entiers
 * gratuits de YouTube (embed, 0 octet). ?genre=<Genre> → un genre ; sinon « Tendances ».
 * Jumeau vidéo de /api/music/*. Que du contenu EMBEDDABLE (cf. lib/video-hub, aucun resell).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getFilmsByGenre, getFilmsCatalog, FILM_GENRES } from '@/lib/video-hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const genre = (req.nextUrl.searchParams.get('genre') || '').trim();
  const films = genre ? await getFilmsByGenre(genre) : await getFilmsCatalog();
  return NextResponse.json({ ok: true, films, genres: FILM_GENRES });
}
