/**
 * Pages enregistrées d'un profil (Pascal 2026-08-30) — brique granulaire du Discovery natif.
 * Parité 1:1 avec le web (getProfileDiscovery.saved = userSavedList). GET /api/users/<pseudo>/saved
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getUserByUsername } from '@/lib/db-users';
import { userSavedList } from '@/lib/discovery-pieces';
import { filterByHidden } from '@/lib/discovery-prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const u = getUserByUsername(decodeURIComponent(username));
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ saved: filterByHidden(u.id, userSavedList(u.id), (s) => s.id) });
}
