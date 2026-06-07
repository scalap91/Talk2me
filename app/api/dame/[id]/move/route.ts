/**
 * POST /api/dame/[id]/move
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Joue un coup de dames.
 *
 * Body : { from: [row, col], to: [row, col], captures?: [[row,col],...] }
 *
 * Validation : via lib/games/dame-engine (règle FMJD majorité). Si l'opponent
 * est Léa et que c'est son tour après, déclenche `leaPlayNextDame` en bg.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { applyDameMove, userCanAccessDameGame } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { LEA_PLAYER_ID } from '@/lib/games/types';
import { applyMove as engineApply } from '@/lib/games/dame-engine';
import { leaPlayNextDame } from '@/lib/games/lea';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

function isPos(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    v[0] >= 0 && v[0] < 10 && v[1] >= 0 && v[1] < 10
  );
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const access = userCanAccessDameGame(id, me.id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { game, convId } = access;
  if (game.status !== 'in_progress') {
    return NextResponse.json({ error: 'game_ended', status: game.status }, { status: 409 });
  }
  // Talk2Me #416 (Pascal 2026-06-05) — partie pausée : refuse les coups.
  if (game.paused_at) {
    return NextResponse.json({ error: 'game_paused', paused_at: game.paused_at }, { status: 409 });
  }

  let body: { from?: unknown; to?: unknown; captures?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!isPos(body.from) || !isPos(body.to)) {
    return NextResponse.json({ error: 'invalid_positions' }, { status: 400 });
  }
  const captures: Array<[number, number]> = Array.isArray(body.captures)
    ? body.captures.filter(isPos)
    : [];

  // Au trait ?
  const turn = game.state.turn;
  const playerAtTurn = turn === 'white' ? game.player_white : game.player_black;
  if (playerAtTurn !== me.id) {
    return NextResponse.json({ error: 'not_your_turn', expected_player: playerAtTurn }, { status: 409 });
  }

  let nextState;
  let status: 'in_progress' | 'white_won' | 'black_won' | 'draw' = 'in_progress';
  try {
    const result = engineApply(game.state, {
      from: body.from,
      to: body.to,
      captures: captures.length > 0 ? captures : undefined,
    });
    nextState = result.state;
    status = result.status;
  } catch {
    return NextResponse.json({ error: 'illegal_move' }, { status: 400 });
  }

  let winner: string | null = null;
  if (status === 'white_won') winner = game.player_white;
  else if (status === 'black_won') winner = game.player_black;

  const moveRecord = {
    from: body.from,
    to: body.to,
    captures: captures.length > 0 ? captures : undefined,
  };
  const moves = [...game.moves, moveRecord];
  const updated = applyDameMove({ gameId: id, state: nextState, moves, status, winner });
  if (!updated) return NextResponse.json({ error: 'apply_failed' }, { status: 500 });

  publish(`conv:${convId}`, {
    kind: 'game_move',
    data: {
      conversation_id: convId,
      game_kind: 'dame',
      game_id: id,
      move: moveRecord,
      fen_or_state: nextState,
      status,
      winner,
      from_user_id: me.id,
    },
  });

  // Talk2Me #416 (Pascal 2026-06-05) — Mode arbitre Léa : si arbiter='lea'
  // et 2 humains, Léa N'enregistre QUE, ne joue pas.
  const opponent = turn === 'white' ? game.player_black : game.player_white;
  const isArbiterMode = game.arbiter === LEA_PLAYER_ID && opponent !== LEA_PLAYER_ID;
  if (status === 'in_progress' && opponent === LEA_PLAYER_ID && !isArbiterMode) {
    void leaPlayNextDame(id);
  }

  return NextResponse.json({ ok: true, game: updated });
}
