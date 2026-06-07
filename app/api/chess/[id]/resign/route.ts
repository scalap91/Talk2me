/**
 * POST /api/chess/[id]/resign
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Abandon. L'adversaire gagne.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { applyChessMove, userCanAccessChessGame } from '@/lib/db';
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
  const { game, convId } = access;
  if (game.status !== 'in_progress') {
    return NextResponse.json({ error: 'game_ended' }, { status: 409 });
  }
  const opponent = me.id === game.player_white ? game.player_black : game.player_white;
  const status = me.id === game.player_white ? 'black_won' : 'white_won';
  const updated = applyChessMove({
    gameId: id,
    fen: game.fen,
    moves: game.moves,
    status,
    winner: opponent,
  });
  if (!updated) return NextResponse.json({ error: 'apply_failed' }, { status: 500 });
  publish(`conv:${convId}`, {
    kind: 'game_end',
    data: {
      conversation_id: convId,
      game_id: id,
      game_kind: 'chess',
      winner: opponent,
      status,
      reason: 'resign',
      from_user_id: me.id,
    },
  });
  return NextResponse.json({ ok: true, game: updated });
}
