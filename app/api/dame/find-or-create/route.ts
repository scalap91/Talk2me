/**
 * POST /api/dame/find-or-create
 *
 * Talk2Me #416 (Pascal 2026-06-05) — Voir /api/chess/find-or-create pour la
 * sémantique complète. Strictement symétrique côté dames (FMJD 10x10).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  abandonDameGame,
  createDameGame,
  getInProgressGameBetween,
  getInProgressGameForUser,
  getConversation,
  getUserById,
  startActivity,
  type DameGame,
} from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { LEA_PLAYER_ID } from '@/lib/games/types';
import { initialDameState } from '@/lib/games/dame-engine';
import { leaPlayNextDame } from '@/lib/games/lea';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    conv_id?: unknown;
    opponent?: unknown;
    mode?: unknown;
    my_color?: unknown;
    force_new?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const convId = typeof body.conv_id === 'string' ? body.conv_id : '';
  const opponent = typeof body.opponent === 'string' ? body.opponent : '';
  const mode = body.mode === 'arbiter' ? 'arbiter' : 'solo';
  const colorPref =
    body.my_color === 'white' || body.my_color === 'black' ? body.my_color : 'random';
  const forceNew = body.force_new === true;

  if (!convId) return NextResponse.json({ error: 'conv_id_required' }, { status: 400 });
  if (!opponent) return NextResponse.json({ error: 'opponent_required' }, { status: 400 });

  const conv = getConversation(convId, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isLea = opponent === LEA_PLAYER_ID;

  if (mode === 'solo' && !isLea) {
    return NextResponse.json({ error: 'solo_requires_lea' }, { status: 400 });
  }
  if (mode === 'arbiter') {
    if (isLea) {
      return NextResponse.json({ error: 'arbiter_requires_human_opponent' }, { status: 400 });
    }
    if (conv.kind !== 'p2p') {
      return NextResponse.json({ error: 'p2p_required_for_arbiter' }, { status: 400 });
    }
    if (opponent === me.id) {
      return NextResponse.json({ error: 'cannot_play_self' }, { status: 400 });
    }
    if (!conv.participants.some((p) => p.id === opponent)) {
      return NextResponse.json({ error: 'opponent_not_in_conv' }, { status: 400 });
    }
    const opp = getUserById(opponent);
    if (!opp) return NextResponse.json({ error: 'opponent_not_found' }, { status: 404 });
  }

  let existing: DameGame | null = null;
  if (mode === 'solo') {
    existing = getInProgressGameForUser('dame_games', me.id, convId) as DameGame | null;
  } else {
    existing = getInProgressGameBetween('dame_games', me.id, opponent, convId) as DameGame | null;
  }

  if (existing && !forceNew) {
    return NextResponse.json({ ok: true, game: existing, existing: true });
  }
  if (existing && forceNew) {
    abandonDameGame(existing.id);
    publish(`conv:${convId}`, {
      kind: 'game_end',
      data: {
        conversation_id: convId,
        game_id: existing.id,
        game_kind: 'dame',
        winner: null,
        status: 'draw',
        reason: 'abandoned_for_new',
        from_user_id: me.id,
      },
    });
  }

  const myColor: 'white' | 'black' =
    colorPref === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorPref;
  const playerWhite = myColor === 'white' ? me.id : opponent;
  const playerBlack = myColor === 'black' ? me.id : opponent;

  let activityId: string | null = null;
  if (mode === 'arbiter' && conv.kind === 'p2p') {
    const activity = startActivity(
      conv.id,
      'dame',
      { game_label: 'Partie de dames (Léa arbitre)', leader_id: me.id },
      me.id,
      'accepted'
    );
    activityId = activity.id;
    publish(`conv:${conv.id}`, {
      kind: 'activity_start',
      data: {
        conversation_id: conv.id,
        activity,
        from_user_id: me.id,
        sent_at: Date.now(),
      },
    });
  }

  const game = createDameGame({
    convId: conv.id,
    activityId,
    playerWhite,
    playerBlack,
    initialState: initialDameState(),
    arbiter: mode === 'arbiter' ? LEA_PLAYER_ID : null,
  });

  if (mode === 'solo' && isLea && playerWhite === LEA_PLAYER_ID) {
    void leaPlayNextDame(game.id);
  }

  return NextResponse.json({ ok: true, game, existing: false });
}
