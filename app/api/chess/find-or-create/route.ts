/**
 * POST /api/chess/find-or-create
 *
 * Talk2Me #416 (Pascal 2026-06-05) — Détecte une partie d'échecs `in_progress`
 * existante OU crée une nouvelle. Pour deux cas :
 *
 *  1) Solo vs Léa (mode='solo', opponent='lea') :
 *     Cherche une game `in_progress` (peut être pausée) entre l'user courant
 *     et Léa, dans la conv fournie. Si trouvée → return existing. Sinon →
 *     créée et 1er coup éventuel Léa déclenché.
 *
 *  2) P2P avec arbitre Léa (mode='arbiter', opponent=<user_id>) :
 *     Conv P2P obligatoire. Cherche une game `in_progress` entre l'user et
 *     l'opponent dans cette conv. Sinon → créée avec `arbiter='lea'`.
 *
 * Body :
 *   {
 *     conv_id: string,
 *     opponent: 'lea' | <user_id>,
 *     mode: 'solo' | 'arbiter',
 *     my_color?: 'white' | 'black' | 'random',
 *     force_new?: boolean  // si true, abandonne la game in_progress avant création
 *   }
 *
 * Réponse :
 *   { ok: true, game, existing: boolean }
 *
 * Doctrine [[talktome-produit-abouti]] : pas un MVP, gestion complète des
 * cas existant/nouveau/force_new. Pascal verbatim : "On peut aussi reprendre
 * une partie fraîche."
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Chess } from 'chess.js';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  abandonChessGame,
  createChessGame,
  getInProgressGameBetween,
  getInProgressGameForUser,
  getConversation,
  getUserById,
  startActivity,
  type ChessGame,
} from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { LEA_PLAYER_ID } from '@/lib/games/types';
import { leaPlayNextChess } from '@/lib/games/lea';

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

  // ---- Validation contextuelle ----
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

  // ---- Lookup existing ----
  let existing: ChessGame | null = null;
  if (mode === 'solo') {
    existing = getInProgressGameForUser('chess_games', me.id, convId) as ChessGame | null;
  } else {
    existing = getInProgressGameBetween('chess_games', me.id, opponent, convId) as ChessGame | null;
  }

  if (existing && !forceNew) {
    return NextResponse.json({ ok: true, game: existing, existing: true });
  }
  if (existing && forceNew) {
    abandonChessGame(existing.id);
    // Broadcast end pour fermer la partie côté clients ouverts
    publish(`conv:${convId}`, {
      kind: 'game_end',
      data: {
        conversation_id: convId,
        game_id: existing.id,
        game_kind: 'chess',
        winner: null,
        status: 'draw',
        reason: 'abandoned_for_new',
        from_user_id: me.id,
      },
    });
  }

  // ---- Création ----
  const myColor: 'white' | 'black' =
    colorPref === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorPref;
  const playerWhite = myColor === 'white' ? me.id : opponent;
  const playerBlack = myColor === 'black' ? me.id : opponent;

  const chess = new Chess();
  const startFen = chess.fen();

  // Activity pour conv p2p uniquement (mode arbitre). Solo Léa : pas d'activity.
  let activityId: string | null = null;
  if (mode === 'arbiter' && conv.kind === 'p2p') {
    const activity = startActivity(
      conv.id,
      'chess',
      { game_label: "Partie d'échecs (l’IA arbitre)", leader_id: me.id },
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
    arbiter: mode === 'arbiter' ? LEA_PLAYER_ID : null,
  });

  // Si Léa joue les blancs en solo, elle joue le 1er coup
  if (mode === 'solo' && isLea && playerWhite === LEA_PLAYER_ID) {
    void leaPlayNextChess(game.id);
  }

  return NextResponse.json({ ok: true, game, existing: false });
}
