/**
 * POST /api/chess/[id]/move
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Joue un coup d'échecs.
 *
 * Body : { from: 'e2', to: 'e4', promotion?: 'q'|'r'|'b'|'n' }
 *
 * Validation : via chess.js. Le coup est validé sur le FEN courant. Si mat,
 * pat ou nul, status est MAJ. Broadcast 'game_move' SSE. Si l'opponent est
 * Léa et que c'est son tour, déclenche `leaPlayNextChess` en background.
 *
 * Sécurité : participant only ; doit être au trait (couleur courante).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Chess } from 'chess.js';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { applyChessMove, userCanAccessChessGame } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { LEA_PLAYER_ID } from '@/lib/games/types';
import { leaPlayNextChess } from '@/lib/games/lea';

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
    return NextResponse.json({ error: 'game_ended', status: game.status }, { status: 409 });
  }
  // Talk2Me #416 (Pascal 2026-06-05) — partie pausée : refuse les coups
  // jusqu'à resume. Pascal verbatim : "si on a pas fini je lui dis 'on finit
  // notre partie de dame'". L'UI doit afficher "Reprendre" avant de permettre
  // un coup.
  if (game.paused_at) {
    return NextResponse.json({ error: 'game_paused', paused_at: game.paused_at }, { status: 409 });
  }

  let body: { from?: unknown; to?: unknown; promotion?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';
  const promotion =
    body.promotion === 'q' || body.promotion === 'r' ||
    body.promotion === 'b' || body.promotion === 'n'
      ? body.promotion
      : undefined;
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
    return NextResponse.json({ error: 'invalid_squares' }, { status: 400 });
  }

  // Au trait ?
  const chess = new Chess(game.fen);
  const turnIsWhite = chess.turn() === 'w';
  const playerAtTurn = turnIsWhite ? game.player_white : game.player_black;
  if (playerAtTurn !== me.id) {
    return NextResponse.json({ error: 'not_your_turn', expected_player: playerAtTurn }, { status: 409 });
  }

  let san: string;
  try {
    const res = chess.move({ from, to, promotion });
    if (!res) return NextResponse.json({ error: 'illegal_move' }, { status: 400 });
    san = res.san;
  } catch {
    return NextResponse.json({ error: 'illegal_move' }, { status: 400 });
  }

  let status: 'in_progress' | 'white_won' | 'black_won' | 'draw' = 'in_progress';
  let winner: string | null = null;
  if (chess.isCheckmate()) {
    status = turnIsWhite ? 'white_won' : 'black_won';
    winner = me.id;
  } else if (chess.isStalemate() || chess.isDraw()) {
    status = 'draw';
  }
  const moves = [...game.moves, san];
  const updated = applyChessMove({ gameId: id, fen: chess.fen(), moves, status, winner });
  if (!updated) return NextResponse.json({ error: 'apply_failed' }, { status: 500 });

  publish(`conv:${convId}`, {
    kind: 'game_move',
    data: {
      conversation_id: convId,
      game_kind: 'chess',
      game_id: id,
      move: { from, to, promotion, san },
      fen_or_state: chess.fen(),
      status,
      winner,
      from_user_id: me.id,
    },
  });

  // Talk2Me #416 (Pascal 2026-06-05) — Mode arbitre Léa : si arbiter='lea'
  // et que les 2 joueurs sont humains (player_black !== 'lea'), Léa NE JOUE
  // PAS, elle ne fait qu'enregistrer. Pas de leaPlayNext appel.
  // Pascal verbatim : "Léa N'A PAS LE DROIT DE JOUER, elle enregistre juste
  // le jeu, et l'IA de mon pote aussi enregistre."
  const opponent = turnIsWhite ? game.player_black : game.player_white;
  const isArbiterMode = game.arbiter === LEA_PLAYER_ID && opponent !== LEA_PLAYER_ID;
  if (status === 'in_progress' && opponent === LEA_PLAYER_ID && !isArbiterMode) {
    void leaPlayNextChess(id);
  }

  return NextResponse.json({ ok: true, game: updated });
}
