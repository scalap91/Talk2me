/**
 * POST /api/chess/new
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Crée une nouvelle partie d'échecs.
 *
 * Body : { conv_id, opponent_user_id, my_color?: 'white'|'black'|'random' }
 *
 * - conv_id : conversation (agent OU p2p)
 * - opponent_user_id : 'lea' (sentinelle Léa) ou un user_id (P2P)
 * - my_color : couleur souhaitée du créateur (default 'random')
 *
 * Si conv P2P + opponent autre user : crée aussi une Activity 'chess' liée
 * pour qu'elle apparaisse dans la liste activité courante.
 *
 * Sécurité : participant de la conv only. Pour opponent_user_id !== 'lea' →
 * vérifie aussi que c'est un participant de la même conv P2P.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Chess } from 'chess.js';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  createChessGame,
  getConversation,
  getUserById,
  startActivity,
} from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { LEA_PLAYER_ID } from '@/lib/games/types';
import { leaPlayNextChess } from '@/lib/games/lea';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { conv_id?: unknown; opponent_user_id?: unknown; my_color?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const convId = typeof body.conv_id === 'string' ? body.conv_id : '';
  const opponent = typeof body.opponent_user_id === 'string' ? body.opponent_user_id : '';
  const colorPref = body.my_color === 'white' || body.my_color === 'black' ? body.my_color : 'random';

  if (!convId) return NextResponse.json({ error: 'conv_id_required' }, { status: 400 });
  if (!opponent) return NextResponse.json({ error: 'opponent_required' }, { status: 400 });

  const conv = getConversation(convId, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isLea = opponent === LEA_PLAYER_ID;
  if (!isLea) {
    // Doit être un participant de la même conv P2P
    if (conv.kind !== 'p2p') {
      return NextResponse.json({ error: 'p2p_required_for_human_opponent' }, { status: 400 });
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

  // Choix couleur
  const myColor: 'white' | 'black' = colorPref === 'random'
    ? (Math.random() < 0.5 ? 'white' : 'black')
    : colorPref;
  const playerWhite = myColor === 'white' ? me.id : opponent;
  const playerBlack = myColor === 'black' ? me.id : opponent;

  // FEN initial standard
  const chess = new Chess();
  const startFen = chess.fen();

  // Crée Activity associée pour les conv P2P uniquement (visibilité activité)
  let activityId: string | null = null;
  if (conv.kind === 'p2p' && !isLea) {
    const activity = startActivity(
      conv.id,
      'chess',
      { game_label: 'Partie d\'échecs', leader_id: me.id },
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

  const game = createChessGame({
    convId: conv.id,
    activityId,
    playerWhite,
    playerBlack,
    startFen,
  });

  // Si Léa joue les blancs, elle doit jouer le 1er coup
  if (isLea && playerWhite === LEA_PLAYER_ID) {
    void leaPlayNextChess(game.id);
  }

  return NextResponse.json({ ok: true, game });
}
