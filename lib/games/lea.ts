/**
 * Talk2Me #408 — Léa joue aux échecs/dames (Pascal 2026-06-05).
 *
 * Module : pilote l'IA Léa quand elle est l'adversaire d'un user dans une
 * partie. Coordination :
 *  1. User joue → applyChessMove / applyDameMove
 *  2. Si turn(next) === Léa → leaPlayNextChess() / leaPlayNextDame()
 *  3. Le moteur (Stockfish/minimax) calcule un coup
 *  4. On l'applique en DB
 *  5. On génère un commentary DeepSeek court (`maybeLeaCommentary()`)
 *  6. On persist le commentary en message ai_reply + broadcast SSE
 *  7. On broadcast un event 'game_move' pour MAJ visuel plateau client
 *
 * Doctrine [[talktome-ia-personnelle-integree]] : Léa = IA du OWNER de la
 * partie (= player du côté humain). Le commentary respecte le genre / nom
 * de l'IA configurés par l'user.
 */

import OpenAI from 'openai';
import { Chess } from 'chess.js';
import {
  appendMessage,
  applyChessMove,
  applyDameMove,
  getChessGame,
  getDameGame,
  getUserById,
  type DbUser,
} from '@/lib/db';
import { pickBestChessMoveUci } from './stockfish-engine';

/** Sleep utility — Talk2Me #419 délai humain Léa. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
import { applyMove as dameApplyMove, pickBestMove as dameBestMove } from './dame-engine';
import { LEA_PLAYER_ID } from './types';
import { publish } from '@/lib/realtime-bus';

const COMMENTARY_TIMEOUT_MS = 6000;
const COMMENTARY_MAX_TOKENS = 60;

// ===== CHESS =====

/**
 * À appeler après un coup du humain si le tour passe à Léa. Tourne en
 * background (void). Persiste le coup + push event SSE + push commentary.
 */
export async function leaPlayNextChess(gameId: string): Promise<void> {
  const game = getChessGame(gameId);
  if (!game) return;
  if (game.status !== 'in_progress') return;
  const chess = new Chess(game.fen);
  const turnIsWhite = chess.turn() === 'w';
  const leaPlayerId = turnIsWhite ? game.player_white : game.player_black;
  const humanPlayerId = turnIsWhite ? game.player_black : game.player_white;
  if (leaPlayerId !== LEA_PLAYER_ID) return; // Léa pas au trait

  const human = getUserById(humanPlayerId);
  if (!human) return;

  // Talk2Me #419 (Pascal 2026-06-05) — Délai humain adaptatif.
  // Verbatim Pascal : "si cest plus dificile pour elle elle reflechie plus
  // longtemps". Plus la position est complexe, plus Léa réfléchit.
  // Facteurs :
  //  - Nb coups légaux dispo (beaucoup = plus d'options = plus de pensée)
  //  - Échec en cours (pression = réfléchit)
  //  - Milieu de jeu (move 10-30) plus stratégique que ouverture/finale
  const legalMoves = chess.moves().length;
  const isCheck = chess.isCheck();
  const moveNumber = chess.moveNumber();
  let delayMs = 2500;
  if (legalMoves > 25) delayMs += 3500;
  else if (legalMoves > 15) delayMs += 1500;
  if (isCheck) delayMs += 2000;
  if (moveNumber > 8 && moveNumber < 35) delayMs += 1500;
  delayMs += Math.random() * 1500;
  // Clamp 3-12s pour pas de WTF (trop court → pas humain, trop long → user pense que c'est cassé)
  delayMs = Math.max(3000, Math.min(12000, delayMs));
  await sleep(delayMs);

  let uciMove: string | null = null;
  try {
    uciMove = await pickBestChessMoveUci(game.fen);
  } catch (e) {
    console.error('[lea/chess] stockfish failed', e);
    return;
  }
  if (!uciMove) return;

  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const promotion = uciMove.length > 4 ? uciMove.slice(4, 5) : undefined;
  let appliedSan: string | null = null;
  let chessCapturedPiece: string | null = null;
  try {
    const result = chess.move({ from, to, promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined });
    if (!result) return;
    appliedSan = result.san;
    chessCapturedPiece = result.captured || null;
  } catch (e) {
    console.warn('[lea/chess] move rejected by chess.js', e);
    return;
  }

  // Détermine status post-coup
  let status: 'in_progress' | 'white_won' | 'black_won' | 'draw' = 'in_progress';
  let winner: string | null = null;
  if (chess.isCheckmate()) {
    status = turnIsWhite ? 'white_won' : 'black_won';
    winner = leaPlayerId; // mat infligé par Léa
  } else if (chess.isStalemate() || chess.isDraw()) {
    status = 'draw';
  }

  const moves = [...game.moves, appliedSan];
  const updated = applyChessMove({
    gameId,
    fen: chess.fen(),
    moves,
    status,
    winner,
  });
  if (!updated) return;

  // Broadcast SSE pour MAJ plateau client (l'humain voit Léa jouer)
  publish(`conv:${game.conv_id}`, {
    kind: 'game_move',
    data: {
      conversation_id: game.conv_id,
      game_kind: 'chess',
      game_id: gameId,
      move: { from, to, promotion, san: appliedSan },
      fen_or_state: chess.fen(),
      status,
      winner,
      from_user_id: LEA_PLAYER_ID,
    },
  });

  // Commentary async (fail soft) — Talk2Me #419 : passe contexte chambrage.
  void maybeLeaCommentary({
    convId: game.conv_id,
    owner: human,
    kind: 'chess',
    move: appliedSan,
    status,
    leaIsWinner: winner === LEA_PLAYER_ID,
    inCheck: chess.inCheck(),
    capturedCount: chessCapturedPiece ? 1 : 0,
    capturedPiece: chessCapturedPiece,
  });

  if (status === 'in_progress' && status === 'in_progress') {
    // Si le coup d'après est encore à Léa (jamais en chess mais ceinture+bretelles)
    const nextChess = new Chess(chess.fen());
    const nextLeader = nextChess.turn() === 'w' ? updated.player_white : updated.player_black;
    if (nextLeader === LEA_PLAYER_ID) {
      // Léa n'enchaîne pas — c'est toujours alterné en chess. No-op.
    }
  }
}

// ===== DAMES =====

export async function leaPlayNextDame(gameId: string): Promise<void> {
  const game = getDameGame(gameId);
  if (!game) return;
  if (game.status !== 'in_progress') return;
  const turn = game.state.turn;
  const leaPlayerId = turn === 'white' ? game.player_white : game.player_black;
  const humanPlayerId = turn === 'white' ? game.player_black : game.player_white;
  if (leaPlayerId !== LEA_PLAYER_ID) return;

  const human = getUserById(humanPlayerId);
  if (!human) return;

  // Talk2Me #419 — Délai humain adaptatif (cf leaPlayNextChess).
  // Pour les dames : nb coups dispo + capture obligatoire (rafle = moins de réflexion car forcé).
  let delayMs = 2500;
  try {
    const { generateLegalMoves } = await import('./dame-engine');
    const moves = generateLegalMoves(game.state);
    const hasMandatoryCapture = moves.some(
      (m) => Array.isArray((m as { captures?: unknown[] }).captures) && (m as { captures: unknown[] }).captures.length > 0
    );
    if (moves.length > 20) delayMs += 3000;
    else if (moves.length > 10) delayMs += 1500;
    if (hasMandatoryCapture) delayMs = Math.max(2000, delayMs - 1500); // forcé = vite
  } catch {
    // fallback : délai fixe
  }
  delayMs += Math.random() * 1500;
  delayMs = Math.max(3000, Math.min(12000, delayMs));
  await sleep(delayMs);

  const depth = clampInt(process.env.DAME_AI_DEPTH, 2, 6, 4);
  const best = dameBestMove(game.state, depth);
  if (!best.move) return;

  let nextState;
  let status: 'in_progress' | 'white_won' | 'black_won' | 'draw' = 'in_progress';
  try {
    const result = dameApplyMove(game.state, best.move);
    nextState = result.state;
    status = result.status;
  } catch (e) {
    console.error('[lea/dame] illegal move', e);
    return;
  }

  let winner: string | null = null;
  if (status === 'white_won') winner = game.player_white;
  else if (status === 'black_won') winner = game.player_black;

  const moves = [...game.moves, best.move];
  const updated = applyDameMove({
    gameId,
    state: nextState,
    moves,
    status,
    winner,
  });
  if (!updated) return;

  publish(`conv:${game.conv_id}`, {
    kind: 'game_move',
    data: {
      conversation_id: game.conv_id,
      game_kind: 'dame',
      game_id: gameId,
      move: best.move,
      fen_or_state: nextState,
      status,
      winner,
      from_user_id: LEA_PLAYER_ID,
    },
  });

  // Talk2Me #419 — passe le nombre de captures pour chambrage Léa.
  void maybeLeaCommentary({
    convId: game.conv_id,
    owner: human,
    kind: 'dame',
    move: `${posToNotation(best.move.from)}-${posToNotation(best.move.to)}${
      best.move.captures && best.move.captures.length > 0
        ? ` (x${best.move.captures.length})`
        : ''
    }`,
    status,
    leaIsWinner: winner === LEA_PLAYER_ID,
    inCheck: false,
    capturedCount: best.move.captures?.length ?? 0,
  });
}

function posToNotation([r, c]: [number, number]): string {
  // Notation lecture : a1..j10 (row 0 = haut → "10", row 9 = bas → "1")
  const colLetter = String.fromCharCode('a'.charCodeAt(0) + c);
  return `${colLetter}${10 - r}`;
}

function clampInt(v: string | undefined, min: number, max: number, def: number): number {
  if (!v) return def;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// ===== Commentary DeepSeek =====

interface CommentaryArgs {
  convId: string;
  owner: DbUser;
  kind: 'chess' | 'dame';
  move: string;
  status: 'in_progress' | 'white_won' | 'black_won' | 'draw';
  leaIsWinner: boolean;
  inCheck: boolean;
  /**
   * Talk2Me #419 — Contexte de chambrage. Permet à Léa de réagir selon
   * l'ampleur du coup.
   *  - capturedCount : nb de pièces prises sur ce coup (rafle = 2+)
   *  - capturedPiece : nature pour échecs (q/r/b/n/p) si pertinent
   *  - gainedMaterial : true si Léa a gagné du matériel sur ce coup
   */
  capturedCount?: number;
  capturedPiece?: string | null;
}

/**
 * Fail soft : si DeepSeek absent ou erreur, on persiste un commentary fallback
 * (varié) au lieu de rien. Doctrine [[talktome-no-excuses]].
 */
export async function maybeLeaCommentary(args: CommentaryArgs): Promise<void> {
  let text = await tryDeepSeekCommentary(args);
  if (!text) text = fallbackCommentary(args);
  if (!text) return;

  const aiName =
    args.owner.ai_name ||
    `T2M de ${args.owner.display_name || args.owner.username}`;

  try {
    const msg = appendMessage(
      args.convId,
      'agent',
      text,
      [],
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      {
        kind: 'ai_reply',
        aiForUserId: args.owner.id,
        aiName,
        aiAvatarUrl: args.owner.ai_avatar_url || null,
        senderId: null,
      }
    );
    publish(`conv:${args.convId}`, {
      kind: 'chat',
      data: {
        id: msg.id,
        conversation_id: args.convId,
        sender_id: null,
        ai_for_user_id: args.owner.id,
        ai_name: aiName,
        ai_avatar_url: args.owner.ai_avatar_url || null,
        kind: 'ai_reply',
        text: msg.text,
        created_at: msg.created_at,
      },
    });
  } catch (e) {
    console.error('[lea/commentary] persist failed', e);
  }
}

async function tryDeepSeekCommentary(args: CommentaryArgs): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const gameLabel = args.kind === 'chess' ? "d'échecs" : 'de dames';
  const ownerName = args.owner.display_name || args.owner.username;
  const aiName = args.owner.ai_name || 'IA';
  const endLine = args.status === 'in_progress'
    ? ''
    : args.status === 'draw'
      ? 'La partie est nulle.'
      : args.leaIsWinner
        ? `Tu as gagné contre ${ownerName}.`
        : `${ownerName} t'a battue.`;
  const checkLine = args.inCheck ? `${ownerName} est en échec.` : '';

  const capturedCount = args.capturedCount ?? 0;
  const pieceMap: Record<string, string> = { q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion' };
  const capturedPieceLabel =
    args.capturedPiece && pieceMap[args.capturedPiece] ? pieceMap[args.capturedPiece] : null;

  let chambrageHint = '';
  if (capturedCount >= 3) {
    chambrageHint = `\nTu viens de capturer ${capturedCount} pions D'UN COUP (rafle multiple). CHAMBRE l'adversaire avec humour : "miam le buffet !", "merci pour le service !", "c'est cadeau !", "bon appétit à moi", "tu m'invites au resto ?". Reste taquin mais pas méchant.`;
  } else if (capturedCount === 2) {
    chambrageHint = `\nTu viens de prendre 2 pions d'un coup (double rafle). Petit chambrage : "double ration !", "deux pour le prix d'un", "joli combo pour moi".`;
  } else if (capturedPieceLabel === 'dame' || capturedPieceLabel === 'tour') {
    chambrageHint = `\nTu viens de prendre la ${capturedPieceLabel} de ${ownerName} ! Chambrage : "merci pour la ${capturedPieceLabel} 😋", "j'avoue ça pique pour toi".`;
  } else if (capturedPieceLabel && capturedPieceLabel !== 'pion') {
    chambrageHint = `\nTu viens de prendre ${ownerName} ${capturedPieceLabel === 'cavalier' ? 'son' : 'son'} ${capturedPieceLabel}. Petit clin d'œil possible.`;
  }

  const system = `Tu es ${aiName}, IA personnelle de ${ownerName}. Tu joues une partie ${gameLabel} amicale avec ${ownerName} dans la conversation. Tu viens de jouer le coup : ${args.move}. ${checkLine} ${endLine}${chambrageHint}

Génère UN court message naturel en français (max 14 mots), comme un ami qui commente sa propre partie :
- Ton : amical, fairplay, parfois taquin, parfois CHAMBREUR si tu fais un gros coup
- PAS de notation technique (sauf si tu cites le coup spécifique)
- Varie les formules : "joli", "attention à ton fou", "ça pique", "miam je prends ça", "respect"...
- JAMAIS de markdown, JAMAIS de "Je suis là pour vous aider"
- Si tu viens de gagner : modeste, encourageant ("Belle partie !", "On en refait une ?")
- Si tu viens de perdre : beau joueur ("Bien joué", "Tu progresses !")

RÉPONDS UNIQUEMENT le message, rien d'autre.`;

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: COMMENTARY_TIMEOUT_MS,
      maxRetries: 0,
    });
    const completion = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Ton commentaire :' },
      ],
      temperature: 0.85,
      max_tokens: COMMENTARY_MAX_TOKENS,
    });
    const raw = (completion.choices[0]?.message?.content || '').trim();
    // strip markdown éventuel
    return raw
      .replace(/^["'`*_]+|["'`*_]+$/g, '')
      .replace(/[*_`]/g, '')
      .slice(0, 140)
      .trim() || null;
  } catch (e) {
    console.warn('[lea/commentary] deepseek error', e);
    return null;
  }
}

function fallbackCommentary(args: CommentaryArgs): string {
  if (args.status === 'draw') return 'Match nul, belle défense !';
  if (args.status !== 'in_progress') {
    if (args.leaIsWinner) {
      const arr = ['Belle partie ! On en refait une ?', 'Mat ! Merci pour la partie.', 'Bien joué quand même !'];
      return arr[Math.floor(Math.random() * arr.length)];
    } else {
      const arr = ['Tu m\'as eue, respect.', 'Bien joué, je te bats la prochaine fois !', 'GG, belle partie.'];
      return arr[Math.floor(Math.random() * arr.length)];
    }
  }
  if (args.inCheck) {
    const arr = ['Échec.', 'Attention au roi !', 'Échec, ton roi est en danger.'];
    return arr[Math.floor(Math.random() * arr.length)];
  }
  const arr = ['À toi !', 'Ton tour.', 'Voyons ce que tu fais.', 'Hmm…', 'Joli plateau.'];
  return arr[Math.floor(Math.random() * arr.length)];
}
