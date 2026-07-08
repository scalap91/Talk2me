'use client';

/**
 * ActivityPicker — bottom-sheet modal pour lancer une activité synchronisée.
 *
 * Phase 5 multi-user temps réel : pendant un appel actif, un user peut tap "+"
 * dans le CallModal pour ouvrir ce sheet. Activités disponibles :
 *  - Vidéo YouTube (sync) — opt-in côté peer via WatchInviteBanner
 *  - Échecs (chess.js + Stockfish si Léa) — Talk2Me #408 Pascal 2026-06-05
 *  - Dames internationales 10x10 — Talk2Me #408 Pascal 2026-06-05
 *
 * Doctrine [[talktome-produit-abouti]] : pas un MVP, tout marche.
 */

import { useState } from 'react';
import VideoPicker, { type YTSearchResult } from './VideoPicker';
import type { ActivityKind, VideoSyncState } from '@/lib/activity-types';
import { X, Film, Music, Crown, Palette, Squircle } from '@/lib/icons';

interface ActivityPickerProps {
  convId: string;
  meId: string;
  /** ID du peer P2P (pour lancer un jeu vs lui). */
  peerId?: string;
  onClose: () => void;
  /**
   * Appelé après création réussie de l'activité côté serveur. Le parent peut
   * setter son state local pour render l'activité (les autres participants la
   * recevront via SSE activity_start).
   */
  onActivityStarted: (activity: {
    id: string;
    kind: ActivityKind;
    state: unknown;
    started_by: string;
    started_at: number;
    conv_id: string;
  }) => void;
  /**
   * Talk2Me #408 (Pascal 2026-06-05) — Appelé après création réussie d'une
   * partie d'échecs ou de dames. game_id à utiliser pour ouvrir le board.
   */
  onGameStarted?: (game_kind: 'chess' | 'dame', game_id: string) => void;
}

interface ActivityOption {
  kind: ActivityKind;
  label: string;
  available: boolean;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  tagline: string;
}

const OPTIONS: ActivityOption[] = [
  {
    kind: 'video',
    label: 'Regarder une vidéo',
    available: true,
    Icon: Film,
    tagline: 'YouTube en lecture synchronisée',
  },
  {
    kind: 'chess',
    label: 'Jouer aux échecs',
    available: true,
    Icon: Crown,
    tagline: 'Plateau interactif synchronisé',
  },
  {
    kind: 'dame',
    label: 'Jouer aux dames',
    available: true,
    Icon: Squircle,
    tagline: 'Dames internationales 10x10',
  },
  {
    kind: 'music',
    label: 'Écouter une musique',
    available: false,
    Icon: Music,
    tagline: 'Bientôt',
  },
  {
    kind: 'whiteboard',
    label: 'Tableau blanc',
    available: false,
    Icon: Palette,
    tagline: 'Bientôt',
  },
];

export default function ActivityPicker({
  convId,
  meId,
  peerId,
  onClose,
  onActivityStarted,
  onGameStarted,
}: ActivityPickerProps) {
  const [view, setView] = useState<'menu' | 'video'>('menu');
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Talk2Me #408 — Lance une partie chess ou dame contre le peer P2P
  async function startGame(kind: 'chess' | 'dame') {
    if (starting) return;
    if (!peerId) {
      setErr('Aucun adversaire dans cette conversation');
      return;
    }
    setStarting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/${kind}/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conv_id: convId,
          opponent_user_id: peerId,
          my_color: 'random',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error || 'Erreur de démarrage');
        return;
      }
      const data = await res.json();
      if (data?.game?.id) {
        onGameStarted?.(kind, data.game.id);
        onClose();
      }
    } catch {
      setErr('Erreur réseau');
    } finally {
      setStarting(false);
    }
  }

  async function startVideoActivity(video: YTSearchResult) {
    if (starting) return;
    setStarting(true);
    setErr(null);
    try {
      const state: VideoSyncState = {
        video_id: video.video_id,
        title: video.title || `Vidéo ${video.video_id}`,
        current_time_s: 0,
        is_playing: true,
        updated_at: Date.now(),
        leader_id: meId,
      };
      const res = await fetch('/api/activities/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conv_id: convId, kind: 'video', state }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error || 'Erreur de démarrage');
        return;
      }
      const data = await res.json();
      if (data?.activity) {
        onActivityStarted(data.activity);
        onClose();
      }
    } catch {
      setErr('Erreur réseau');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 backdrop-blur-sm">
      {/* Click backdrop → close */}
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-[var(--t2m-paper)] rounded-t-3xl border-t border-[var(--t2m-line)] shadow-[0_-12px_40px_rgba(47,52,58,0.15)] flex flex-col max-h-[80vh]">
        {/* Grabber handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--t2m-line)]" />
        </div>

        {view === 'menu' ? (
          <>
            <div className="flex items-center justify-between px-4 pt-1 pb-3">
              <div className="text-[15px] font-medium text-[var(--t2m-ink)]">Activité partagée</div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 -mr-1.5 text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)]"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-2 pb-6 overflow-y-auto">
              <ul className="space-y-1">
                {OPTIONS.map((opt) => {
                  const { Icon } = opt;
                  return (
                    <li key={opt.kind}>
                      <button
                        type="button"
                        disabled={!opt.available || starting}
                        onClick={() => {
                          if (opt.kind === 'video') setView('video');
                          else if (opt.kind === 'chess') void startGame('chess');
                          else if (opt.kind === 'dame') void startGame('dame');
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-colors ${
                          opt.available
                            ? 'hover:bg-[var(--t2m-wash)] active:bg-[var(--t2m-line)]'
                            : 'opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            opt.available
                              ? 'bg-red-500/15 text-red-500 border border-red-400/20'
                              : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink-3)] border border-[var(--t2m-line)]'
                          }`}
                        >
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium text-[var(--t2m-ink)]">
                            {opt.label}
                          </div>
                          <div className="text-[11.5px] text-[var(--t2m-ink-3)] mt-0.5">
                            {opt.tagline}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {err && (
                <div className="mt-3 px-3 text-[12px] text-rose-500">{err}</div>
              )}
            </div>
          </>
        ) : (
          <div className="h-[60vh]">
            <VideoPicker onBack={() => setView('menu')} onSelect={startVideoActivity} />
          </div>
        )}
      </div>
    </div>
  );
}
