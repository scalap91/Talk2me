/**
 * Meilleures ventes d'un profil (Pascal 2026-08-30) — brique granulaire du Discovery natif (colonne sold).
 * GET /api/users/<pseudo>/best-sellers
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getUserByUsername } from '@/lib/db-users';
import { userBestSellersCovers } from '@/lib/discovery-pieces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const u = getUserByUsername(decodeURIComponent(username));
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ bestSellers: userBestSellersCovers(u.id) });
}
