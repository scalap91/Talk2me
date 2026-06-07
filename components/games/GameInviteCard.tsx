'use client';

/**
 * Talk2Me #416 (Pascal 2026-06-05) — GameInviteCard.
 *
 * Overlay affichée quand une partie 'in_progress' existante est détectée
 * (via /api/{kind}/find-or-create avec existing=true). Propose à l'user :
 *  - "Reprendre" → ouvre le board sur la partie existante (telle quelle)
 *  - "Nouvelle"  → confirmation modal → force_new=true → nouvelle game
 *
 * Pascal verbatim : "Comme ça on a pas fini, on reprend là où on s'est
 * arrêté. On peut aussi reprendre une partie fraîche."
 */

import { useMemo, useState } from 'react';
import { Play, RefreshCw, X } from 'lucide-react';
import type { ChessGame, DameGame } from '@/lib/games/types';

type AnyGame = ChessGame | DameGame;

interface GameInviteCardProps {
  game: AnyGame;
  gameKind: 'chess' | 'dame';
  peerLabel: string;
  /** Mode joué : 'solo' (vs Léa) ou 'arbiter' (vs humain, Léa arbitre). */
  mode: 'solo' | 'arbiter';
  /** Tap "Reprendre" → ouvre le board existant. */
  onResume: () => void;
  /**
   * Tap "Nouvelle" → après confirmation, callback déclenche la création.
   * Reçoit force_new=true pour que le parent appelle /find-or-create.
   */
  onNew: () => void;
  onClose: () => void;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'à l\'instant';
  if (diff < 3600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `il y a ${Math.floor(diff / 3600_000)} h`;
  return `il y a ${Math.floor(diff / 86400_000)} j`;
}

export default function GameInviteCard({
  game,
  gameKind,
  peerLabel,
  mode,
  onResume,
  onNew,
  onClose,
}: GameInviteCardProps) {
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);

  const turnLabel = useMemo(() => {
    if (gameKind === 'chess') {
      const g = game as ChessGame;
      // FEN parsing trivial : champ 2 = 'w' ou 'b'
      const parts = g.fen.split(' ');
      const turnChar = parts[1] || 'w';
      const turnIsWhite = turnChar === 'w';
      const player = turnIsWhite ? g.player_white : g.player_black;
      if (player === 'lea') return 'Léa';
      return player === peerLabel ? peerLabel : 'Toi';
    }
    const g = game as DameGame;
    const player = g.state.turn === 'white' ? g.player_white : g.player_black;
    if (player === 'lea') return 'Léa';
    return player === peerLabel ? peerLabel : 'Toi';
  }, [game, gameKind, peerLabel]);

  const movesCount = Array.isArray((game as { moves?: unknown[] }).moves)
    ? (game as { moves: unknown[] }).moves.length
    : 0;
  const lastTs = game.paused_at || game.started_at;
  const subtitle =
    movesCount > 0
      ? `Dernier coup ${formatTimeAgo(lastTs)}`
      : `Démarrée ${formatTimeAgo(game.started_at)}`;

  const titleVs = mode === 'arbiter' ? `avec ${peerLabel}` : 'avec Léa';
  const kindLabel = gameKind === 'chess' ? "d'échecs" : 'de dames';

  return (
    <div className="fixed inset-0 z-[155] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm bg-[#16161c] border border-white/15 rounded-2xl p-5 shadow-2xl shadow-black/50">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 p-2 rounded-full text-white/55 hover:text-white/85 hover:bg-white/[0.08]"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>

        <div className="text-[11px] uppercase tracking-wide text-red-300/85 font-medium mb-1">
          Partie {kindLabel} en cours
        </div>
        <div className="text-[14.5px] text-white/95 font-medium mb-1">
          {titleVs}
        </div>
        <div className="text-[12px] text-white/55 mb-3">
          {subtitle}
        </div>
        <div className="text-[12.5px] text-white/75 mb-4">
          Trait à : <span className="text-white/95 font-medium">{turnLabel}</span>
          {' · '}
          <span className="text-white/55">{movesCount} coup{movesCount > 1 ? 's' : ''}</span>
        </div>
        {!!game.paused_at && (
          <div className="text-[11.5px] text-amber-300/85 mb-3">
            Cette partie est en pause.
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white text-[13px] font-medium"
            data-testid="game-invite-resume"
          >
            <Play size={14} /> Reprendre
          </button>
          <button
            type="button"
            onClick={() => setConfirmNewOpen(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white/85 text-[13px] font-medium"
            data-testid="game-invite-new"
          >
            <RefreshCw size={14} /> Nouvelle
          </button>
        </div>
      </div>

      {confirmNewOpen && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="bg-[#16161c] border border-white/15 rounded-2xl p-4 max-w-xs w-[320px]">
            <div className="text-[14px] text-white/95 font-medium mb-1.5">
              Vraiment commencer une nouvelle partie ?
            </div>
            <div className="text-[12.5px] text-white/65 mb-4">
              L&apos;actuelle sera abandonnée.
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
                onClick={() => {
                  setConfirmNewOpen(false);
                  onNew();
                }}
                className="flex-1 text-[12.5px] py-2 rounded-lg bg-red-600/90 hover:bg-red-600 text-white"
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
