'use client';

/**
 * Talk2Me #408 — ChessBoard interactive (Pascal 2026-06-05).
 *
 * Plateau 8x8 cliquable. Utilise chess.js (browser-compatible) pour calculer
 * les coups légaux côté UI : highlight cases valides quand on tape une pièce.
 * Push POST /api/chess/{id}/move pour appliquer. SSE 'game_move' réinjecte
 * le coup peer/Léa (animation + MAJ FEN).
 *
 * Variants UI :
 *  - 'inline-chat' (default) : carré responsive, max ~360px
 *  - 'fullscreen' : prend toute la hauteur disponible
 *
 * Doctrine [[talktome-produit-abouti]] : pas un MVP, plateau complet (échec,
 * mat, promotion, abandon, status).
 */

import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square, type Move as ChessJsMove } from 'chess.js';
import { Flag, Pause, Play, RefreshCw, RotateCcw } from 'lucide-react';
import type { ChessGame } from '@/lib/games/types';
import { LEA_PLAYER_ID } from '@/lib/games/types';

// Unicode pieces — utf-8 chess glyphs, anti-aliasés par le browser
const PIECE_GLYPHS: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

interface ChessBoardProps {
  game: ChessGame;
  meId: string;
  /** Override : si on veut afficher en mode lecture seule (ex: partie finie) */
  readOnly?: boolean;
  variant?: 'inline-chat' | 'fullscreen';
  /** Callback déclenché après chaque move accepté pour MAJ parent. */
  onGameUpdated?: (game: ChessGame) => void;
  /** Label du peer pour affichage côté top du board. */
  peerLabel?: string;
}

interface SelectedState {
  square: Square;
  legalDestinations: Set<string>;
  /** Mapping destination → coup chess.js complet (utile pour promotion). */
  legalMoves: ChessJsMove[];
}

export default function ChessBoard({
  game,
  meId,
  readOnly = false,
  variant = 'inline-chat',
  onGameUpdated,
  peerLabel,
}: ChessBoardProps) {
  const [currentGame, setCurrentGame] = useState<ChessGame>(game);
  const [selected, setSelected] = useState<SelectedState | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square; to: Square;
  } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [resigning, setResigning] = useState(false);
  // Talk2Me #416 (Pascal 2026-06-05) — pause/resume + nouvelle partie.
  const [busyAction, setBusyAction] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);

  // Sync game prop → state (reset si le parent passe un game différent).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentGame(game);
  }, [game]);

  const chess = useMemo(() => {
    try {
      return new Chess(currentGame.fen);
    } catch {
      return new Chess();
    }
  }, [currentGame.fen]);

  const myColor: 'w' | 'b' | null =
    currentGame.player_white === meId
      ? 'w'
      : currentGame.player_black === meId
        ? 'b'
        : null;
  const turn = chess.turn();
  // Talk2Me #416 (Pascal 2026-06-05) — partie pausée → on bloque l'input.
  const isPaused = !!currentGame.paused_at;
  const isMyTurn = myColor === turn && currentGame.status === 'in_progress' && !isPaused;
  const opponent = myColor === 'w' ? currentGame.player_black : currentGame.player_white;
  const opponentIsLea = opponent === LEA_PLAYER_ID;
  // Talk2Me #416 — Mode arbitre Léa entre 2 humains : on cache le commentary
  // (Léa observe). On affiche un sous-titre "Léa arbitre cette partie".
  const leaIsArbiter =
    currentGame.arbiter === LEA_PLAYER_ID && opponent !== LEA_PLAYER_ID;

  // Flip board if I'm black (pieces face me)
  const flipped = myColor === 'b';

  function squareOf(rowIdx: number, colIdx: number): Square {
    const r = flipped ? rowIdx : 7 - rowIdx; // bottom = row 0
    const c = flipped ? 7 - colIdx : colIdx;
    return `${String.fromCharCode(97 + c)}${r + 1}` as Square;
  }

  function handleSquareClick(sq: Square) {
    if (readOnly || !isMyTurn) return;
    setMoveError(null);
    // 1) Si on a déjà une sélection et la case cliquée est une destination valide
    if (selected && selected.legalDestinations.has(sq)) {
      const matchingMoves = selected.legalMoves.filter((m) => m.to === sq);
      // Promotion ?
      const promotionRequired = matchingMoves.some((m) => m.promotion);
      if (promotionRequired) {
        setPendingPromotion({ from: selected.square, to: sq });
        setSelected(null);
        return;
      }
      void sendMove(selected.square, sq);
      setSelected(null);
      return;
    }
    // 2) Sinon : sélection d'une pièce à moi
    const piece = chess.get(sq);
    if (!piece) {
      setSelected(null);
      return;
    }
    if (piece.color !== myColor) {
      setSelected(null);
      return;
    }
    const legal = chess.moves({ square: sq, verbose: true }) as ChessJsMove[];
    if (legal.length === 0) {
      setSelected(null);
      return;
    }
    setSelected({
      square: sq,
      legalDestinations: new Set(legal.map((m) => m.to)),
      legalMoves: legal,
    });
  }

  async function sendMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n') {
    try {
      const res = await fetch(`/api/chess/${currentGame.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, promotion }),
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
      const res = await fetch(`/api/chess/${currentGame.id}/resign`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data?.game) {
        setCurrentGame(data.game);
        onGameUpdated?.(data.game);
      }
    } finally {
      setResigning(false);
    }
  }

  // Talk2Me #416 (Pascal 2026-06-05) — pause / resume serveur, MAJ état local.
  async function togglePause() {
    if (busyAction || currentGame.status !== 'in_progress') return;
    setBusyAction(true);
    try {
      const action = isPaused ? 'resume' : 'pause';
      const res = await fetch(`/api/chess/${currentGame.id}/${action}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data?.game) {
        setCurrentGame(data.game);
        onGameUpdated?.(data.game);
      }
    } finally {
      setBusyAction(false);
    }
  }

  /**
   * Talk2Me #416 (Pascal 2026-06-05) — "Nouvelle partie" tout en jouant :
   * confirme, abandonne l'actuelle (find-or-create?force_new=true) puis MAJ.
   * Mode déduit : si arbiter='lea' → 'arbiter' avec opponent humain ; sinon
   * 'solo' avec opponent='lea'.
   */
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
      const res = await fetch('/api/chess/find-or-create', {
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

  // King in check highlight
  const kingInCheckSquare: Square | null = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = `${String.fromCharCode(97 + c)}${r + 1}` as Square;
        const piece = chess.get(sq);
        if (piece && piece.type === 'k' && piece.color === turn) return sq;
      }
    }
    return null;
  }, [chess, turn]);

  // Status message
  const statusMsg = useMemo(() => {
    if (currentGame.status !== 'in_progress') {
      if (currentGame.status === 'draw') return 'Match nul';
      const wWon = currentGame.status === 'white_won';
      const winnerLabel = wWon
        ? (currentGame.player_white === meId ? 'Tu as gagné' : (opponentIsLea ? 'Léa gagne' : 'Adversaire gagne'))
        : (currentGame.player_black === meId ? 'Tu as gagné' : (opponentIsLea ? 'Léa gagne' : 'Adversaire gagne'));
      return winnerLabel;
    }
    // Talk2Me #416 (Pascal 2026-06-05) — pause prend la priorité visuelle.
    if (isPaused) return 'Partie en pause';
    if (myColor === turn) return chess.inCheck() ? 'À toi (échec !)' : 'À toi de jouer';
    return opponentIsLea ? 'Léa réfléchit…' : 'Tour adverse';
  }, [currentGame, isPaused, myColor, turn, chess, meId, opponentIsLea]);

  const isFull = variant === 'fullscreen';
  const containerCls = isFull
    ? 'relative flex flex-col w-full h-full bg-[#0e0e12] text-white'
    : 'relative flex flex-col w-full max-w-[420px] mx-auto bg-[#0e0e12] text-white rounded-2xl overflow-hidden border border-white/10';

  return (
    <div className={containerCls}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[11px] uppercase tracking-wide text-red-300/85 font-medium">
            Échecs
          </span>
          <span className="text-[12px] text-white/65 truncate">
            vs {opponentIsLea ? 'Léa' : (peerLabel || 'Adversaire')}
          </span>
          {/* Talk2Me #416 (Pascal 2026-06-05) — sous-titre arbitre */}
          {leaIsArbiter && (
            <span
              className="text-[10px] uppercase tracking-wide text-amber-300/85 font-medium shrink-0"
              title="Léa observe et enregistre la partie, elle ne joue pas"
            >
              · Léa arbitre
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Pause / Resume — Talk2Me #416 */}
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
          {/* Nouvelle partie — Talk2Me #416 */}
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

      {/* Board */}
      <div className={isFull ? 'flex-1 flex items-center justify-center p-3' : 'p-3'}>
        <div
          className="grid grid-cols-8 w-full aspect-square select-none rounded-md overflow-hidden border border-white/10 shadow-inner"
          role="grid"
          aria-label="Plateau échecs"
        >
          {Array.from({ length: 8 }, (_, rIdx) =>
            Array.from({ length: 8 }, (_, cIdx) => {
              const sq = squareOf(rIdx, cIdx);
              const piece = chess.get(sq);
              const isLight = (rIdx + cIdx) % 2 === 0;
              const isSelected = selected?.square === sq;
              const isLegal = selected?.legalDestinations.has(sq) ?? false;
              const isCheck = kingInCheckSquare === sq;
              const baseColor = isLight ? '#edd9b3' : '#9c6c44';
              const bg = isCheck
                ? '#d23f3f'
                : isSelected
                  ? '#f7d77a'
                  : isLegal
                    ? (isLight ? '#cdebb8' : '#76a266')
                    : baseColor;
              const glyphKey = piece ? `${piece.color}${piece.type.toUpperCase()}` : '';
              const glyph = piece ? PIECE_GLYPHS[glyphKey] : '';
              const isMyPiece = piece && piece.color === myColor;
              return (
                <button
                  key={sq}
                  type="button"
                  onClick={() => handleSquareClick(sq)}
                  className="relative flex items-center justify-center text-[clamp(20px,5vw,38px)] leading-none transition-colors"
                  style={{ background: bg }}
                  aria-label={`${sq}${piece ? ' ' + glyphKey : ''}`}
                  disabled={readOnly}
                >
                  <span
                    className="drop-shadow-[0_1px_0_rgba(0,0,0,0.55)]"
                    style={{
                      color: piece?.color === 'w' ? '#fafafa' : '#222',
                      cursor: isMyPiece && isMyTurn ? 'pointer' : 'default',
                    }}
                  >
                    {glyph}
                  </span>
                  {/* Dot pour move target */}
                  {isLegal && !piece && (
                    <span className="absolute w-2.5 h-2.5 rounded-full bg-black/35" />
                  )}
                  {/* Indicateur coordonnée bottom-left */}
                  {cIdx === 0 && (
                    <span className="absolute left-[2px] top-[2px] text-[8.5px] font-medium" style={{ color: isLight ? '#9c6c44' : '#edd9b3' }}>
                      {sq[1]}
                    </span>
                  )}
                  {rIdx === 7 && (
                    <span className="absolute right-[2px] bottom-[2px] text-[8.5px] font-medium" style={{ color: isLight ? '#9c6c44' : '#edd9b3' }}>
                      {sq[0]}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Footer : status + abandon */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/8 bg-white/[0.02] gap-2">
        <div className="text-[11px] text-white/55 truncate flex-1">
          {currentGame.moves.length} coup{currentGame.moves.length > 1 ? 's' : ''} joué{currentGame.moves.length > 1 ? 's' : ''}
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

      {/* Promotion modal */}
      {pendingPromotion && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-[#16161c] border border-white/15 rounded-2xl p-4 max-w-xs w-[300px]">
            <div className="text-[13px] text-white/85 mb-3 text-center">
              Promotion en…
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((p) => {
                const k = `${myColor}${p.toUpperCase()}`;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      const { from, to } = pendingPromotion;
                      setPendingPromotion(null);
                      void sendMove(from, to, p);
                    }}
                    className="aspect-square flex items-center justify-center text-3xl bg-white/[0.05] hover:bg-white/[0.12] rounded-lg"
                    style={{ color: myColor === 'w' ? '#fafafa' : '#222', background: '#edd9b3' }}
                  >
                    {PIECE_GLYPHS[k]}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setPendingPromotion(null)}
              className="mt-3 w-full text-[12px] py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.10] text-white/65 inline-flex items-center justify-center gap-1.5"
            >
              <RotateCcw size={11} /> Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
