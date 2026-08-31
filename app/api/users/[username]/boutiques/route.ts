/**
 * Boutiques d'un profil (Pascal 2026-08-30) — brique granulaire du Discovery natif, réutilisable partout.
 * GET /api/users/<pseudo>/boutiques
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getUserByUsername } from '@/lib/db-users';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { userShopsWithPreview } from '@/lib/discovery-pieces';
import { filterByHidden } from '@/lib/discovery-prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Boutiques AVEC l'item de vitrine (preview_item) → le natif rend la boutique par le lecteur unique
// (ImmersiveFeedCard), identique au web (getProfileDiscovery.boutiques).
export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const u = getUserByUsername(decodeURIComponent(username));
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const me = getCurrentUserFromRequest(req);
  return NextResponse.json({ boutiques: filterByHidden(u.id, userShopsWithPreview(u.id, me?.id), (b) => b.card_id || b.id) });
}
