'use client';

/**
 * Talk2Me #419 (Pascal 2026-06-05) — InlineGameDock.
 *
 * Pascal verbatim : "Le jeu ne s'ouvre pas dans le chat moi+Léa. De plus il
 * faudrait pas que le jeu s'ouvre autre part du chat, il doit s'intégrer dans
 * le chat comme toutes nos cards, sauf que quand j'écris dans le chat le texte
 * se met en haut du jeu, ça permet de toujours discuter avec le gas."
 *
 * Remplace GameBoardModal (modal plein écran, #408) par un dock sticky bottom
 * qui s'intègre DANS la conv :
 *  - Posé juste au-dessus du composer (ChatInput), sous la zone messages
 *  - Les nouveaux messages scrollent au-dessus du dock → on continue à discuter
 *  - Header avec icône kind + titre + statut + boutons (Réduire / Fermer)
 *  - État local `minimized` : true → n'affiche que mini-bar header ; false → header + plateau
 *  - Plateau cappé max-h 50vh (mobile) / 60vh (desktop) pour laisser respirer
 *    messages + composer
 *
 * S'occupe de :
 *  - Fetch initial du game state via GET /api/{kind}/{id}
 *  - Reload sur tick refreshTick (parent reçoit events SSE game_move/pause/resume)
 *  - Délègue tout le reste (move, pause, resume, nouvelle, abandon) aux boards
 *    qui n'ont PAS changé (réutilisation 100%).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Chess } from 'chess.js';
import ChessBoard from './ChessBoard';
import DraughtsBoard from './DraughtsBoard';
import type { ChessGame, DameGame } from '@/lib/games/types';
import { LEA_PLAYER_ID } from '@/lib/games/types';

interface InlineGameDockProps {
  gameKind: 'chess' | 'dame';
  gameId: string;
  meId: string;
  /** Tick incrémenté par le parent à chaque event SSE pour forcer reload. */
  refreshTick?: number;
  /** Label adversaire humain (si conv P2P). Solo Léa → ignoré. */
  peerLabel?: string;
  onClose?: () => void;
  /** Si fourni, le bouton Réduire délègue au parent au lieu d'un état local. */
  onMinimize?: () => void;
}

function turnLabel(
  kind: 'chess' | 'dame',
  game: ChessGame | DameGame | null,
  meId: string,
  opponentIsLea: boolean
): string {
  if (!game) return 'Chargement…';
  if (game.status !== 'in_progress') {
    if (game.status === 'draw') return 'Match nul';
    const wWon = game.status === 'white_won';
    return wWon
      ? game.player_white === meId
        ? 'Tu as gagné'
        : opponentIsLea
          ? 'Léa gagne'
          : 'Adversaire gagne'
      : game.player_black === meId
        ? 'Tu as gagné'
        : opponentIsLea
          ? 'Léa gagne'
          : 'Adversaire gagne';
  }
  if (game.paused_at) return 'En pause';
  let turn: 'w' | 'b' | 'white' | 'black';
  if (kind === 'chess') {
    try {
      const c = new Chess((game as ChessGame).fen);
      turn = c.turn();
    } catch {
      turn = 'w';
    }
  } else {
    turn = (game as DameGame).state.turn;
  }
  const meIsWhite = game.player_white === meId;
  const meIsBlack = game.player_black === meId;
  const meTurn =
    (meIsWhite && (turn === 'w' || turn === 'white')) ||
    (meIsBlack && (turn === 'b' || turn === 'black'));
  if (meTurn) return 'À toi de jouer';
  return opponentIsLea ? 'Léa réfléchit…' : 'Tour adverse';
}

export default function InlineGameDock({
  gameKind,
  gameId,
  meId,
  refreshTick = 0,
  peerLabel,
  onClose,
  onMinimize,
}: InlineGameDockProps) {
  const [chessGame, setChessGame] = useState<ChessGame | null>(null);
  const [dameGame, setDameGame] = useState<DameGame | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  const loadGame = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch(`/api/${gameKind}/${gameId}`, { cache: 'no-store' });
      if (!r.ok) {
        setErr('Partie introuvable');
        return;
      }
      const d = await r.json();
      if (gameKind === 'chess') setChessGame(d.game as ChessGame);
      else setDameGame(d.game as DameGame);
    } catch {
      setErr('Erreur réseau');
    }
  }, [gameKind, gameId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGame();
  }, [loadGame, refreshTick]);

  const currentGame: ChessGame | DameGame | null =
    gameKind === 'chess' ? chessGame : dameGame;

  const opponent = currentGame
    ? currentGame.player_white === meId
      ? currentGame.player_black
      : currentGame.player_white
    : null;
  const opponentIsLea = opponent === LEA_PLAYER_ID;
  const opponentLabel = opponentIsLea ? 'Léa' : peerLabel || 'Adversaire';

  const status = useMemo(
    () => turnLabel(gameKind, currentGame, meId, opponentIsLea),
    [gameKind, currentGame, meId, opponentIsLea]
  );

  const handleMinimize = useCallback(() => {
    if (onMinimize) {
      onMinimize();
      return;
    }
    setMinimized((v) => !v);
  }, [onMinimize]);

  const icon = gameKind === 'chess' ? '♟' : '⚂'; // ♟ / ⚂
  const kindTitle = gameKind === 'chess' ? 'Échecs' : 'Dames';

  return (
    <div
      className="sticky bottom-0 z-30 w-full bg-[#15151c] border-t border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] rounded-t-2xl"
      data-testid="inline-game-dock"
    >
      {/* Header : icône + titre + statut + boutons */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 bg-white/[0.02] rounded-t-2xl">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[16px] leading-none" aria-hidden>
            {icon}
          </span>
          <span className="text-[12.5px] text-white/90 font-medium truncate">
            {kindTitle} vs {opponentLabel}
          </span>
          <span className="text-[11px] text-white/55 truncate">· {status}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleMinimize}
            className="p-1.5 rounded-full text-white/70 hover:text-white/95 hover:bg-white/[0.08]"
            aria-label={minimized ? 'Agrandir le jeu' : 'Réduire le jeu'}
            title={minimized ? 'Agrandir' : 'Réduire'}
          >
            {minimized ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-white/70 hover:text-white/95 hover:bg-white/[0.08]"
              aria-label="Fermer le jeu"
              title="Fermer"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Plateau (caché si minimized) */}
      {!minimized && (
        <div
          className="flex items-center justify-center px-2 pt-2 pb-2 max-h-[50vh] sm:max-h-[60vh] overflow-y-auto"
          data-testid="inline-game-dock-board"
        >
          {err && <div className="text-rose-300 text-[13px] py-6">{err}</div>}
          {!err && gameKind === 'chess' && chessGame && (
            <ChessBoard
              game={chessGame}
              meId={meId}
              peerLabel={peerLabel}
              variant="inline-chat"
              onGameUpdated={(g) => setChessGame(g)}
            />
          )}
          {!err && gameKind === 'dame' && dameGame && (
            <DraughtsBoard
              game={dameGame}
              meId={meId}
              peerLabel={peerLabel}
              variant="inline-chat"
              onGameUpdated={(g) => setDameGame(g)}
            />
          )}
          {!err && !chessGame && !dameGame && (
            <div className="text-white/55 text-[13px] py-6">Chargement…</div>
          )}
        </div>
      )}
    </div>
  );
}
