/**
 * Talk2Me #422 — GET /api/music/for-me
 * Liste musicale PERSONNALISÉE via Memory Score :
 *  - mine     : tes sons classés par score de récence (score affiché)
 *  - genres   : ton score par genre écouté (hip-hop, rap-fr…)
 *  - similar  : plus de sons de ton artiste #1 (pas encore dans ton top)
 *  - discover : tendances pour compléter (hors de ton top)
 * Auth user obligatoire.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getScoredTracks, getGenreScores, getTopArtist } from '@/lib/memory-score';
import { getTrending, getByArtist } from '@/lib/music-hub-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = Date.now();
  const mine = getScoredTracks(me.id, now, 40);
  const genres = getGenreScores(me.id, now, 8);
  const topArtist = getTopArtist(me.id, now);

  const seen = new Set<string>(mine.map((t) => t.youtube_video_id));

  // "Artistes similaires" MVP = plus de sons de ton artiste #1 (grounded :
  // vrai catalogue music-hub, pas d'invention).
  let similar: any[] = [];
  if (topArtist) {
    try {
      const r = await getByArtist(topArtist, 15);
      similar = (r.tracks || []).filter((t: any) => !seen.has(t.youtube_video_id));
    } catch {
      similar = [];
    }
  }
  similar.forEach((t) => seen.add(t.youtube_video_id));

  // Découvertes : tendances hors top + similar.
  let discover: any[] = [];
  try {
    const r = await getTrending(30);
    discover = (r.tracks || []).filter((t: any) => !seen.has(t.youtube_video_id));
  } catch {
    discover = [];
  }

  return NextResponse.json({
    mine,
    genres,
    top_artist: topArtist,
    similar,
    discover,
  });
}
