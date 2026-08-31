/**
 * Coups de cœur d'un profil (Pascal 2026-08-30) — brique granulaire du Discovery natif. GET /api/users/<pseudo>/likes
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getUserByUsername } from '@/lib/db-users';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { userLikesCovers } from '@/lib/discovery-pieces';
import { filterByHidden } from '@/lib/discovery-prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const u = getUserByUsername(decodeURIComponent(username));
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const me = getCurrentUserFromRequest(req);
  return NextResponse.json({ likes: filterByHidden(u.id, userLikesCovers(u.id, me?.id), (c) => c.id) });
}
