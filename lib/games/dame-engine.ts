/**
 * Talk2Me #408 — Moteur de Dames internationales 10×10 (Pascal 2026-06-05).
 *
 * Doctrine [[talktome-produit-abouti]] : règles complètes, pas un MVP.
 *
 * Règles implémentées :
 *  - Plateau 10×10. Seules les cases sombres (row+col impair) sont jouées.
 *  - 20 pions chaque côté. Blancs en bas (rows 6-9), noirs en haut (rows 0-3).
 *  - Pion : se déplace d'une case en diagonale vers l'avant.
 *  - Capture (pion ou dame) obligatoire si possible. La rafle la plus longue
 *    est elle aussi obligatoire (règle de la majorité — variante FMJD).
 *  - Capture en arrière autorisée pour les pions (variante internationale).
 *  - Promotion en dame quand un pion atteint la rangée adverse (row 0 pour
 *    les blancs, row 9 pour les noirs).
 *  - Dame : se déplace de plusieurs cases en diagonale (long move).
 *  - Capture par dame : peut atterrir n'importe où après la pièce capturée.
 *  - Fin de partie : un joueur sans pion ou sans coup légal perd.
 *
 * Représentation board :
 *   0 = case vide
 *   1 = pion blanc
 *   2 = pion noir
 *   3 = dame blanche
 *   4 = dame noire
 *
 * Coordonnées : [row, col]. row 0 = haut (côté noirs).
 */

import type { DameGameState, DameMove } from './types';

export type Cell = 0 | 1 | 2 | 3 | 4;
export type Player = 'white' | 'black';

const EMPTY: Cell = 0;
const WP: Cell = 1;
const BP: Cell = 2;
const WK: Cell = 3;
const BK: Cell = 4;

export const BOARD_SIZE = 10;

// ===== Setup =====

export function initialDameState(): DameGameState {
  const board: number[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const dark = (r + c) % 2 === 1;
      if (!dark) {
        row.push(EMPTY);
        continue;
      }
      if (r < 4) {
        row.push(BP);
      } else if (r > 5) {
        row.push(WP);
      } else {
        row.push(EMPTY);
      }
    }
    board.push(row);
  }
  return { board, turn: 'white' };
}

// ===== Helpers =====

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function pieceOwner(cell: Cell | number): Player | null {
  if (cell === WP || cell === WK) return 'white';
  if (cell === BP || cell === BK) return 'black';
  return null;
}

function isKing(cell: Cell | number): boolean {
  return cell === WK || cell === BK;
}

function clone(board: number[][]): number[][] {
  return board.map((row) => row.slice());
}

const DIAGS: Array<[number, number]> = [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

// ===== Génération de mouvements =====

/**
 * Trouve toutes les rafles de capture possibles depuis (sr, sc) pour la pièce
 * cell. Retourne la liste exhaustive (longueur = nb de captures dans la rafle).
 */
function findCaptures(
  board: number[][],
  sr: number,
  sc: number,
  cell: number,
  player: Player
): DameMove[] {
  const captures: DameMove[] = [];
  const isK = isKing(cell);

  function recurse(
    r: number,
    c: number,
    captured: Array<[number, number]>,
    path: Array<[number, number]>,
    workBoard: number[][]
  ) {
    let anyCapture = false;
    for (const [dr, dc] of DIAGS) {
      if (isK) {
        // Dame : balaye la diagonale, trouve la 1ère pièce adverse, vérifie
        // qu'il y a au moins une case vide derrière, puis pour chaque case
        // d'atterrissage valide on récursive.
        let nr = r + dr;
        let nc = c + dc;
        // Avance jusqu'à 1ère pièce
        while (inBounds(nr, nc) && workBoard[nr][nc] === EMPTY) {
          nr += dr; nc += dc;
        }
        if (!inBounds(nr, nc)) continue;
        const target = workBoard[nr][nc];
        const targetOwner = pieceOwner(target);
        if (targetOwner === null || targetOwner === player) continue;
        // Ne pas re-capturer une pièce déjà dans captured
        if (captured.some(([cr, cc]) => cr === nr && cc === nc)) continue;
        // Cases d'atterrissage : juste après nr,nc
        let lr = nr + dr;
        let lc = nc + dc;
        while (inBounds(lr, lc) && workBoard[lr][lc] === EMPTY) {
          // récurse depuis chaque case d'atterrissage possible
          const newBoard = clone(workBoard);
          newBoard[r][c] = EMPTY;
          // On NE retire PAS la pièce capturée du board pendant la rafle
          // (règle FMJD : la pièce reste jusqu'à fin de rafle pour empêcher
          // de re-passer dessus). On la marque via captured[].
          newBoard[lr][lc] = cell;
          recurse(
            lr,
            lc,
            [...captured, [nr, nc]],
            [...path, [lr, lc]],
            newBoard
          );
          anyCapture = true;
          lr += dr; lc += dc;
        }
      } else {
        // Pion : saut diagonal exact (+/-2) si pièce adverse entre les deux
        const mr = r + dr;
        const mc = c + dc;
        const lr = r + 2 * dr;
        const lc = c + 2 * dc;
        if (!inBounds(lr, lc)) continue;
        if (workBoard[lr][lc] !== EMPTY) continue;
        const target = workBoard[mr][mc];
        const targetOwner = pieceOwner(target);
        if (targetOwner === null || targetOwner === player) continue;
        if (captured.some(([cr, cc]) => cr === mr && cc === mc)) continue;
        const newBoard = clone(workBoard);
        newBoard[r][c] = EMPTY;
        newBoard[lr][lc] = cell;
        recurse(
          lr,
          lc,
          [...captured, [mr, mc]],
          [...path, [lr, lc]],
          newBoard
        );
        anyCapture = true;
      }
    }
    if (!anyCapture && path.length > 0) {
      // Fin d'une rafle : on enregistre
      const finalCell = path[path.length - 1];
      // Promotion ? Pour les pions uniquement
      let promoted = false;
      if (!isK) {
        if ((player === 'white' && finalCell[0] === 0) ||
            (player === 'black' && finalCell[0] === BOARD_SIZE - 1)) {
          promoted = true;
        }
      }
      captures.push({
        from: [sr, sc],
        to: finalCell,
        captures: captured,
        promoted,
      });
    }
  }

  recurse(sr, sc, [], [], board);
  return captures;
}

/**
 * Génère TOUS les coups légaux pour le joueur courant.
 * Règle de la majorité : si une capture est possible, seules les rafles
 * MAXIMALES (plus grand nombre de pièces capturées) sont légales.
 */
export function generateLegalMoves(state: DameGameState): DameMove[] {
  const { board, turn } = state;
  const allCaptures: DameMove[] = [];
  const allQuiet: DameMove[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (pieceOwner(cell) !== turn) continue;
      const caps = findCaptures(board, r, c, cell, turn);
      if (caps.length > 0) {
        allCaptures.push(...caps);
        continue;
      }
      // Quiets uniquement si pas de capture
      const isK = isKing(cell);
      const dirs: Array<[number, number]> = [];
      if (isK) {
        dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      } else if (turn === 'white') {
        dirs.push([-1, -1], [-1, 1]); // pions blancs vont vers le haut (row diminue)
      } else {
        dirs.push([1, -1], [1, 1]);
      }
      for (const [dr, dc] of dirs) {
        if (isK) {
          let nr = r + dr;
          let nc = c + dc;
          while (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
            allQuiet.push({ from: [r, c], to: [nr, nc] });
            nr += dr; nc += dc;
          }
        } else {
          const nr = r + dr;
          const nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          if (board[nr][nc] !== EMPTY) continue;
          // Promotion ?
          let promoted = false;
          if ((turn === 'white' && nr === 0) ||
              (turn === 'black' && nr === BOARD_SIZE - 1)) {
            promoted = true;
          }
          allQuiet.push({ from: [r, c], to: [nr, nc], promoted });
        }
      }
    }
  }

  if (allCaptures.length > 0) {
    // Règle FMJD : on garde uniquement les rafles maximales
    const maxLen = Math.max(...allCaptures.map((m) => m.captures?.length || 0));
    return allCaptures.filter((m) => (m.captures?.length || 0) === maxLen);
  }
  return allQuiet;
}

// ===== Application d'un coup =====

export interface ApplyResult {
  state: DameGameState;
  status: 'in_progress' | 'white_won' | 'black_won' | 'draw';
}

/**
 * Vérifie qu'un coup donné fait partie des coups légaux puis l'applique.
 * Retourne le nouveau state + status. Throw si coup illégal.
 */
export function applyMove(state: DameGameState, move: DameMove): ApplyResult {
  const legal = generateLegalMoves(state);
  const found = legal.find(
    (m) =>
      m.from[0] === move.from[0] &&
      m.from[1] === move.from[1] &&
      m.to[0] === move.to[0] &&
      m.to[1] === move.to[1] &&
      (m.captures?.length || 0) === (move.captures?.length || 0)
  );
  if (!found) {
    throw new Error('illegal_move');
  }
  const board = clone(state.board);
  const cell = board[found.from[0]][found.from[1]];
  board[found.from[0]][found.from[1]] = EMPTY;
  // Retire toutes les pièces capturées
  if (found.captures) {
    for (const [cr, cc] of found.captures) {
      board[cr][cc] = EMPTY;
    }
  }
  // Place la pièce à destination (avec promotion éventuelle)
  let finalCell: Cell = cell as Cell;
  if (found.promoted) {
    finalCell = state.turn === 'white' ? WK : BK;
  }
  board[found.to[0]][found.to[1]] = finalCell;

  const nextTurn: Player = state.turn === 'white' ? 'black' : 'white';
  const nextState: DameGameState = { board, turn: nextTurn };

  // Status check : l'adversaire a-t-il un coup ?
  const opponentLegal = generateLegalMoves(nextState);
  if (opponentLegal.length === 0) {
    // Pas de coup → perd
    return {
      state: nextState,
      status: state.turn === 'white' ? 'white_won' : 'black_won',
    };
  }
  return { state: nextState, status: 'in_progress' };
}

// ===== Évaluation pour minimax =====

function evaluate(state: DameGameState, perspective: Player): number {
  let score = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = state.board[r][c];
      if (cell === EMPTY) continue;
      const owner = pieceOwner(cell);
      const king = isKing(cell);
      const base = king ? 3 : 1;
      // bonus centre (cases 4-5 sur lignes 4-5)
      const centerBonus = (r >= 3 && r <= 6 && c >= 3 && c <= 6) ? 0.2 : 0;
      // bonus avancement pour pions (proche promotion)
      let advance = 0;
      if (!king) {
        if (owner === 'white') advance = (BOARD_SIZE - 1 - r) * 0.05;
        else advance = r * 0.05;
      }
      const v = base + centerBonus + advance;
      score += owner === perspective ? v : -v;
    }
  }
  return score;
}

// ===== Minimax avec alpha-beta pour l'IA =====

export interface BestMoveResult {
  move: DameMove | null;
  score: number;
}

function applyForSearch(state: DameGameState, move: DameMove): DameGameState {
  try {
    return applyMove(state, move).state;
  } catch {
    return state;
  }
}

function minimax(
  state: DameGameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  perspective: Player
): number {
  if (depth === 0) return evaluate(state, perspective);
  const moves = generateLegalMoves(state);
  if (moves.length === 0) {
    // L'adversaire au trait n'a pas de coup → perspective gagne si c'était
    // au tour de l'opposé
    return state.turn === perspective ? -1000 : 1000;
  }
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const next = applyForSearch(state, m);
      const score = minimax(next, depth - 1, alpha, beta, false, perspective);
      if (score > best) best = score;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const next = applyForSearch(state, m);
      const score = minimax(next, depth - 1, alpha, beta, true, perspective);
      if (score < best) best = score;
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/**
 * Choisit le meilleur coup pour le joueur courant. Profondeur 3-4 = niveau
 * amateur honnête. Profondeur 5 = ralenti significatif (≥1s).
 */
export function pickBestMove(state: DameGameState, depth = 4): BestMoveResult {
  const moves = generateLegalMoves(state);
  if (moves.length === 0) return { move: null, score: 0 };
  const perspective = state.turn;
  let bestScore = -Infinity;
  let bestMove: DameMove | null = moves[0];
  // shuffle léger pour éviter mêmes parties contre Léa
  const ordered = moves.slice().sort(() => Math.random() - 0.5);
  for (const m of ordered) {
    const next = applyForSearch(state, m);
    const score = minimax(next, depth - 1, -Infinity, Infinity, false, perspective);
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return { move: bestMove, score: bestScore };
}
