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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Renvoie les ITEMS de feed COMPLETS {music, works, publications} → le natif les rend par le lecteur
// unique (ImmersiveFeedCard), identique à AlignedPostCard côté web.
export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const u = getUserByUsername(decodeURIComponent(username));
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const me = getCurrentUserFromRequest(req);
  return NextResponse.json(userCardsItems(u.id, me?.id));
}
