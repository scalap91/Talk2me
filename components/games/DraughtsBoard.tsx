'use client';

/**
 * Talk2Me #408 — DraughtsBoard interactive 10x10 (Pascal 2026-06-05).
 *
 * Dames internationales (FMJD) avec capture obligatoire (rafle maximale).
 * Calcule les coups légaux en local via lib/games/dame-engine, push
 * POST /api/dame/{id}/move pour appliquer. SSE 'game_move' réinjecte
 * le coup peer/Léa.
 *
 * UX :
 *  - Tap pion → highlight cases d'arrivée valides (verts pour quiet, rouges
 *    pour capture)
 *  - Tap destination → envoie le coup. Si la rafle maximale s'arrête à un
 *    point intermédiaire, on déclenche tout en bloc (UI envoie le coup
 *    final, le serveur calcule les captures).
 *  - Pas de drag&drop pour MVP, tap-tap suffit.
 */

import { useEffect, useMemo, useState } from 'react';
import { Flag, Pause, Play, RefreshCw } from '@/lib/icons';
import type { DameGame, DameGameState, DameMove } from '@/lib/games/types';
import { LEA_PLAYER_ID } from '@/lib/games/types';
import { generateLegalMoves } from '@/lib/games/dame-engine';

const BOARD = 10;

function cellGlyph(v: number, w: number): React.JSX.Element | null {
  if (v === 0) return null;
  const isWhitePiece = v === 1 || v === 3;
  const isKing = v === 3 || v === 4;
  const size = Math.max(14, w * 0.75);
  return (
    <span
      className="rounded-full block flex items-center justify-center shadow-md font-bold"
      style={{
        width: size,
        height: size,
        background: isWhitePiece
          ? 'radial-gradient(circle at 35% 30%, #fafafa, #d1d1d1 70%, #999 100%)'
          : 'radial-gradient(circle at 35% 30%, #4a4a4a, #1a1a1a 70%, #050505 100%)',
        color: isWhitePiece ? '#444' : '#fafafa',
        border: '1.5px solid rgba(0,0,0,0.45)',
        fontSize: Math.max(10, size * 0.5),
      }}
    >
      {isKing ? '♔' : ''}
    </span>
  );
}

interface DraughtsBoardProps {
  game: DameGame;
  meId: string;
  readOnly?: boolean;
  variant?: 'inline-chat' | 'fullscreen';
  onGameUpdated?: (game: DameGame) => void;
  peerLabel?: string;
}

interface SelectedState {
  from: [number, number];
  /** Map "row,col" → DameMove[] (peut y avoir plusieurs rafles vers la même case). */
  destinations: Map<string, DameMove[]>;
}

export default function DraughtsBoard({
  game,
  meId,
  readOnly = false,
  variant = 'inline-chat',
  onGameUpdated,
  peerLabel,
}: DraughtsBoardProps) {
  const [currentGame, setCurrentGame] = useState<DameGame>(game);
  const [selected, setSelected] = useState<SelectedState | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [resigning, setResigning] = useState(false);
  const [cellWidth, setCellWidth] = useState(40);
  // Talk2Me #416 (Pascal 2026-06-05) — pause/resume + nouvelle partie.
  const [busyAction, setBusyAction] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentGame(game);
  }, [game]);

  const state: DameGameState = currentGame.state;
  const myColor: 'white' | 'black' | null =
    currentGame.player_white === meId ? 'white'
      : currentGame.player_black === meId ? 'black'
        : null;
  const flipped = myColor === 'black';
  const turn = state.turn;
  // Talk2Me #416 (Pascal 2026-06-05) — pause / arbitre.
  const isPaused = !!currentGame.paused_at;
  const isMyTurn = myColor === turn && currentGame.status === 'in_progress' && !isPaused;
  const opponent = myColor === 'white' ? currentGame.player_black : currentGame.player_white;
  const opponentIsLea = opponent === LEA_PLAYER_ID;
  const leaIsArbiter =
    currentGame.arbiter === LEA_PLAYER_ID && opponent !== LEA_PLAYER_ID;

  const legalMoves = useMemo(() => {
    if (!isMyTurn) return [];
    return generateLegalMoves(state);
  }, [state, isMyTurn]);

  function clickCell(r: number, c: number) {
    if (readOnly || !isMyTurn) return;
    setMoveError(null);
    const isDark = (r + c) % 2 === 1;
    if (!isDark) return;
    // Si on a une sélection et la case est une destination valide
    if (selected) {
      const key = `${r},${c}`;
      const matchingMoves = selected.destinations.get(key);
      if (matchingMoves && matchingMoves.length > 0) {
        const move = matchingMoves[0]; // si multiples rafles, on prend la 1ère (rare)
        setSelected(null);
        void sendMove(move);
        return;
      }
    }
    // Sélection d'un pion à moi
    const cell = state.board[r][c];
    if (cell === 0) {
      setSelected(null);
      return;
    }
    const isWhite = cell === 1 || cell === 3;
    if ((myColor === 'white') !== isWhite) {
      setSelected(null);
      return;
    }
    const fromMoves = legalMoves.filter(
      (m) => m.from[0] === r && m.from[1] === c
    );
    if (fromMoves.length === 0) {
      setSelected(null);
      // Si capture obligatoire ailleurs, signaler
      if (legalMoves.length > 0 && legalMoves.some((m) => (m.captures?.length || 0) > 0)) {
        setMoveError('Capture obligatoire ailleurs');
      }
      return;
    }
    const map = new Map<string, DameMove[]>();
    for (const m of fromMoves) {
      const k = `${m.to[0]},${m.to[1]}`;
      const arr = map.get(k) || [];
      arr.push(m);
      map.set(k, arr);
    }
    setSelected({ from: [r, c], destinations: map });
  }

  async function sendMove(move: DameMove) {
    try {
      const res = await fetch(`/api/dame/${currentGame.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: move.from,
          to: move.to,
          captures: move.captures || [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMoveError(data?.error || 'Coup refusé');
        return;
      }
      if (data?.game) {
        setCurrentGame(data.game);
        onGameUpdated?.(data.game);
      }
    } catch {
      setMoveError('Erreur réseau');
    }
  }

  async function resign() {
    if (resigning) return;
    if (!confirm('Abandonner la partie ?')) return;
    setResigning(true);
    try {
      const res = await fetch(`/api/dame/${currentGame.id}/resign`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data?.game) {
        setCurrentGame(data.game);
        onGameUpdated?.(data.game);
      }
    } finally {
      setResigning(false);
    }
  }

  // Talk2Me #416 (Pascal 2026-06-05) — pause / resume.
  async function togglePause() {
    if (busyAction || currentGame.status !== 'in_progress') return;
    setBusyAction(true);
    try {
      const action = isPaused ? 'resume' : 'pause';
      const res = await fetch(`/api/dame/${currentGame.id}/${action}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data?.game) {
        setCurrentGame(data.game);
        onGameUpdated?.(data.game);
      }
    } finally {
      setBusyAction(false);
    }
  }

  /** Voir ChessBoard.tsx — Talk2Me #416. */
  async function startNewGame() {
    if (busyAction) return;
    setBusyAction(true);
    setConfirmNewOpen(false);
    try {
      const isArbiterMode =
        currentGame.arbiter === LEA_PLAYER_ID && opponent !== LEA_PLAYER_ID;
      const body = isArbiterMode
        ? { conv_id: currentGame.conv_id, opponent, mode: 'arbiter', force_new: true }
        : { conv_id: currentGame.conv_id, opponent: 'lea', mode: 'solo', force_new: true };
      const res = await fetch('/api/dame/find-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.game) {
        setCurrentGame(data.game);
        onGameUpdated?.(data.game);
      }
    } finally {
      setBusyAction(false);
    }
  }

  const statusMsg = (() => {
    if (currentGame.status !== 'in_progress') {
      if (currentGame.status === 'draw') return 'Match nul';
      const wWon = currentGame.status === 'white_won';
      const winnerLabel = wWon
        ? (currentGame.player_white === meId ? 'Tu as gagné' : (opponentIsLea ? 'l’IA gagne' : 'Adversaire gagne'))
        : (currentGame.player_black === meId ? 'Tu as gagné' : (opponentIsLea ? 'l’IA gagne' : 'Adversaire gagne'));
      return winnerLabel;
    }
    // Talk2Me #416 (Pascal 2026-06-05) — pause prend la priorité visuelle.
    if (isPaused) return 'Partie en pause';
    if (myColor === turn) return 'À toi de jouer';
    return opponentIsLea ? 'l’IA réfléchit…' : 'Tour adverse';
  })();

  const isFull = variant === 'fullscreen';
  const containerCls = isFull
    ? 'relative flex flex-col w-full h-full bg-[#0e0e12] text-white'
    : 'relative flex flex-col w-full max-w-[440px] mx-auto bg-[#0e0e12] text-white rounded-2xl overflow-hidden border border-white/10';

  return (
    <div className={containerCls}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[11px] uppercase tracking-wide text-red-300/85 font-medium">
            Dames
          </span>
          <span className="text-[12px] text-white/65 truncate">
            vs {opponentIsLea ? 'l’IA' : (peerLabel || 'Adversaire')}
          </span>
          {leaIsArbiter && (
            <span
              className="text-[10px] uppercase tracking-wide text-amber-300/85 font-medium shrink-0"
              title="l’IA observe et enregistre la partie, elle ne joue pas"
            >
              · l’IA arbitre
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!readOnly && currentGame.status === 'in_progress' && (
            <button
              type="button"
              onClick={togglePause}
              disabled={busyAction}
              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-white/75 disabled:opacity-50"
              aria-label={isPaused ? 'Reprendre la partie' : 'Mettre en pause'}
              title={isPaused ? 'Reprendre' : 'Pause'}
            >
              {isPaused ? <Play size={11} /> : <Pause size={11} />}
              <span className="hidden sm:inline">{isPaused ? 'Reprendre' : 'Pause'}</span>
            </button>
          )}
          {!readOnly && currentGame.status === 'in_progress' && (
            <button
              type="button"
              onClick={() => setConfirmNewOpen(true)}
              disabled={busyAction}
              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-white/75 disabled:opacity-50"
              aria-label="Nouvelle partie"
              title="Nouvelle partie"
            >
              <RefreshCw size={11} />
              <span className="hidden sm:inline">Nouvelle</span>
            </button>
          )}
          <div className="text-[11.5px] text-white/65 ml-1">{statusMsg}</div>
        </div>
      </div>

      <div className={isFull ? 'flex-1 flex items-center justify-center p-3' : 'p-3'}>
        <div
          className="grid w-full aspect-square select-none rounded-md overflow-hidden border border-white/10 shadow-inner"
          style={{ gridTemplateColumns: `repeat(${BOARD}, 1fr)` }}
          ref={(el) => {
            if (el) setCellWidth(el.clientWidth / BOARD);
          }}
        >
          {Array.from({ length: BOARD }, (_, vRow) => {
            const rIdx = flipped ? BOARD - 1 - vRow : vRow;
            return Array.from({ length: BOARD }, (_, vCol) => {
              const cIdx = flipped ? BOARD - 1 - vCol : vCol;
              const isDark = (rIdx + cIdx) % 2 === 1;
              const cell = state.board[rIdx][cIdx];
              const isSelected = selected?.from[0] === rIdx && selected?.from[1] === cIdx;
              const isLegal = selected?.destinations.has(`${rIdx},${cIdx}`) ?? false;
              const isCapture = isLegal && (() => {
                const moves = selected!.destinations.get(`${rIdx},${cIdx}`);
                return moves && moves[0]?.captures && moves[0].captures.length > 0;
              })();
              const baseBg = isDark ? '#3a2f24' : '#dccfb9';
              const bg = isSelected
                ? '#f7d77a'
                : isCapture
                  ? (isDark ? '#7a3a3a' : '#e6a3a3')
                  : isLegal
                    ? (isDark ? '#3d6b3d' : '#b9d8a8')
                    : baseBg;
              return (
                <button
                  key={`${vRow}-${vCol}`}
                  type="button"
                  onClick={() => clickCell(rIdx, cIdx)}
                  className="relative flex items-center justify-center transition-colors"
                  style={{ background: bg, aspectRatio: '1 / 1' }}
                  aria-label={`r${rIdx} c${cIdx}`}
                  disabled={readOnly || !isDark}
                >
                  {cell !== 0 && cellGlyph(cell, cellWidth)}
                  {isLegal && cell === 0 && (
                    <span className="absolute w-2.5 h-2.5 rounded-full bg-black/35" />
                  )}
                </button>
              );
            });
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-white/8 bg-white/[0.02] gap-2">
        <div className="text-[11px] text-white/55 truncate flex-1">
          {currentGame.moves.length} coup{currentGame.moves.length > 1 ? 's' : ''}
        </div>
        {moveError && (
          <div className="text-[11px] text-rose-300 truncate">{moveError}</div>
        )}
        {currentGame.status === 'in_progress' && !readOnly && (
          <button
            type="button"
            onClick={resign}
            disabled={resigning}
            className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-white/75 disabled:opacity-50"
            aria-label="Abandonner"
          >
            <Flag size={11} /> Abandon
          </button>
        )}
      </div>

      {/* Pause overlay — Talk2Me #416 (Pascal 2026-06-05) */}
      {isPaused && currentGame.status === 'in_progress' && (
        <div className="absolute inset-0 z-[20] flex items-center justify-center bg-black/55 backdrop-blur-[1.5px] pointer-events-none">
          <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl bg-[#16161c]/90 border border-white/15 pointer-events-auto">
            <Pause size={22} className="text-amber-300/85" />
            <div className="text-[12.5px] text-white/85 font-medium">Partie en pause</div>
            {!readOnly && (
              <button
                type="button"
                onClick={togglePause}
                disabled={busyAction}
                className="mt-1 text-[12px] inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600/85 hover:bg-emerald-600 text-white disabled:opacity-50"
              >
                <Play size={12} /> Reprendre
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirm "Nouvelle partie" — Talk2Me #416 */}
      {confirmNewOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-[#16161c] border border-white/15 rounded-2xl p-4 max-w-xs w-[320px]">
            <div className="text-[14px] text-white/95 font-medium mb-1.5">
              Nouvelle partie ?
            </div>
            <div className="text-[12.5px] text-white/65 mb-4">
              La partie en cours sera abandonnée.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmNewOpen(false)}
                className="flex-1 text-[12.5px] py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/80"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void startNewGame()}
                disabled={busyAction}
                className="flex-1 text-[12.5px] py-2 rounded-lg bg-red-600/90 hover:bg-red-600 text-white disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
