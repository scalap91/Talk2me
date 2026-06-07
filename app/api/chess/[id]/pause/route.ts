/**
 * POST /api/chess/[id]/pause
 *
 * Talk2Me #416 (Pascal 2026-06-05) — Pause manuelle d'une partie d'échecs.
 * Idempotent : si déjà pausée, no-op. Broadcast 'game_pause' SSE pour MAJ
 * UI des deux côtés.
 *
 * Sécurité : participant only.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getChessGame, pauseGame, userCanAccessChessGame } from '@/lib/db';
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
  const access = userCanAccessChessGame(id, me.id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (access.game.status !== 'in_progress') {
    return NextResponse.json({ error: 'game_ended' }, { status: 409 });
  }
  pauseGame('chess_games', id);
  const updated = getChessGame(id);
  publish(`conv:${access.convId}`, {
    kind: 'game_pause',
    data: {
      conversation_id: access.convId,
      game_kind: 'chess',
      game_id: id,
      paused_at: updated?.paused_at || Date.now(),
      from_user_id: me.id,
    },
  });
  return NextResponse.json({ ok: true, game: updated });
}
