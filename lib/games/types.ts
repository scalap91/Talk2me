/**
 * Talk2Me #408 — Jeux interactifs (Pascal 2026-06-05).
 *
 * Types partagés pour les jeux jouables dans une conversation (chess + dames).
 * Doctrine [[talktome-produit-abouti]] : pas un MVP, plateaux complets.
 *
 * Sentinel `LEA_PLAYER_ID` : valeur stockée dans player_white / player_black
 * quand l'adversaire est Léa (IA personnelle du créateur de la partie). On
 * route le moveBlack/White vers le moteur (Stockfish/minimax) au lieu d'un
 * autre user. Voir lib/games/lea.ts.
 */

export const LEA_PLAYER_ID = 'lea';

export type GameStatus =
  | 'in_progress'
  | 'white_won'
  | 'black_won'
  | 'draw';

export type GameKind = 'chess' | 'dame';

export interface ChessGame {
  id: string;
  conv_id: string;
  activity_id: string | null;
  player_white: string;
  player_black: string;
  fen: string;
  moves: string[];         // SAN moves
  status: GameStatus;
  winner: string | null;   // user_id ou null si pat/draw
  started_at: number;
  ended_at: number | null;
  /**
   * Talk2Me #416 (Pascal 2026-06-05) — Si défini ('lea'), une IA arbitre la
   * partie : elle valide le coup et enregistre l'état mais NE JOUE PAS. Les
   * deux player_* sont alors deux humains. Si null, mode classique (l'opponent
   * de player_white ou player_black peut être 'lea' qui joue).
   */
  arbiter: string | null;
  /**
   * Talk2Me #416 (Pascal 2026-06-05) — Timestamp de pause manuelle. Si défini,
   * la partie est "in_progress" mais pausée : aucun coup ne peut être joué
   * tant que `resumeGame` n'est pas appelé. Pascal verbatim : "si on a pas
   * fini je lui dis 'on finit notre partie de dame'".
   */
  paused_at: number | null;
}

export interface DameGameState {
  /**
   * Plateau 10x10. board[row][col] ∈ {0, 1 (pion blanc), 2 (pion noir),
   * 3 (dame blanche), 4 (dame noire)}. row 0 en haut (noirs), row 9 en bas
   * (blancs). Seules les cases sombres (row+col impair) sont jouées.
   */
  board: number[][];
  turn: 'white' | 'black';
}

export interface DameMove {
  /** Couple [row, col] de la case de départ. */
  from: [number, number];
  /** Couple [row, col] de la case d'arrivée. */
  to: [number, number];
  /** Captures intermédiaires (pour rafle multiple). */
  captures?: Array<[number, number]>;
  /** Devient dame en arrivant ? */
  promoted?: boolean;
}

export interface DameGame {
  id: string;
  conv_id: string;
  activity_id: string | null;
  player_white: string;
  player_black: string;
  state: DameGameState;
  moves: DameMove[];
  status: GameStatus;
  winner: string | null;
  started_at: number;
  ended_at: number | null;
  /** Voir ChessGame.arbiter. */
  arbiter: string | null;
  /** Voir ChessGame.paused_at. */
  paused_at: number | null;
}

export function isLeaPlayer(playerId: string): boolean {
  return playerId === LEA_PLAYER_ID;
}
