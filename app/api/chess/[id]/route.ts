/**
 * GET /api/chess/[id]
 *
 * Talk2Me #408 (Pascal 2026-06-05) — État complet d'une partie. Lecture
 * autorisée à tout participant de la conv qui l'héberge.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { userCanAccessChessGame } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const access = userCanAccessChessGame(id, me.id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, game: access.game });
}
