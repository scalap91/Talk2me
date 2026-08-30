/**
 * Photos perso d'un profil — LECTURE publique (Pascal 2026-08-30). Brique granulaire du Discovery natif.
 * (L'écriture reste sur /api/users/photos, réservée au propriétaire.) GET /api/users/<pseudo>/photos
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getUserByUsername } from '@/lib/db-users';
import { userPhotosList } from '@/lib/discovery-pieces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const u = getUserByUsername(decodeURIComponent(username));
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ photos: userPhotosList(u.id) });
}
