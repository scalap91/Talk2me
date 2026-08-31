/**
 * Cards d'un profil (Pascal 2026-08-30) — brique granulaire du Discovery natif. Renvoie les cards publiées
 * de l'utilisateur, CLASSÉES par engagement et facettées {music, works, publications} (mêmes fonctions
 * serveur que la page web /u/). Réutilisable ailleurs (« feed d'un profil »). GET /api/users/<pseudo>/cards
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getUserByUsername } from '@/lib/db-users';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { userCardsItems } from '@/lib/discovery-pieces';
import { deriveCover } from '@/lib/discovery-cover';
import { filterByHidden } from '@/lib/discovery-prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Renvoie les ITEMS de feed COMPLETS {music, works, publications} (rendus par le lecteur unique) + les
// COVERS légères {musicCov, worksCov, publicationsCov} pour les lignes/rails du magazine (rythme, pas un
// feed sans fin). Rendu identique web (AlignedPostCard) / natif (ImmersiveFeedCard).
export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const u = getUserByUsername(decodeURIComponent(username));
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const me = getCurrentUserFromRequest(req);
  const it = userCardsItems(u.id, me?.id);
  const idOf = (x: unknown) => (x as { id?: string })?.id;
  const music = filterByHidden(u.id, it.music, idOf);
  const works = filterByHidden(u.id, it.works, idOf);
  const publications = filterByHidden(u.id, it.publications, idOf);
  return NextResponse.json({
    music, works, publications,
    musicCov: music.map(deriveCover),
    worksCov: works.map(deriveCover),
    publicationsCov: publications.map(deriveCover),
  });
}
