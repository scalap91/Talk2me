/**
 * POST /api/dame/[id]/resume
 *
 * Talk2Me #416 (Pascal 2026-06-05) — voir /api/chess/[id]/resume/route.ts.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDameGame, resumeGame, userCanAccessDameGame } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const access = userCanAccessDameGame(id, me.id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (access.game.status !== 'in_progress') {
    return NextResponse.json({ error: 'game_ended' }, { status: 409 });
  }
  resumeGame('dame_games', id);
  const updated = getDameGame(id);
  publish(`conv:${access.convId}`, {
    kind: 'game_resume',
    data: {
      conversation_id: access.convId,
      game_kind: 'dame',
      game_id: id,
      from_user_id: me.id,
    },
  });
  return NextResponse.json({ ok: true, game: updated });
}
