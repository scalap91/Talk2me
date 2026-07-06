'use client';

/**
 * WatchInviteBanner — Talk2Me #408 (Pascal 2026-06-05).
 *
 * Overlay banner affiché au peer quand le leader a démarré une activité
 * Watch Together en 'pending'. Doctrine [[talk2me-watch-together-passthrough]] :
 * pas de partage forcé, opt-in explicite.
 *
 * Comportement :
 *  - Preview titre + thumbnail YouTube (img tag direct sur i.ytimg.com)
 *  - [▶ Synchroniser] → POST /api/activities/{id}/accept
 *  - [Refuser] → POST /api/activities/{id}/decline
 *  - Auto-dismiss après 30s = decline implicite (call decline pour cleanup)
 *  - z-index élevé : posé au-dessus du chat ET du CallModal
 */

import { useEffect, useState } from 'react';
import { Film, Play, X } from '@/lib/icons';
import type { Activity, VideoSyncState } from '@/lib/activity-types';
import { isVideoActivity } from '@/lib/activity-types';

const AUTO_DISMISS_MS = 30_000;

interface WatchInviteBannerProps {
  activity: Activity<unknown>;
  inviterLabel: string;
  onAccepted: (activity: Activity<unknown>) => void;
  onDeclined: () => void;
}

export default function WatchInviteBanner({
  activity,
  inviterLabel,
  onAccepted,
  onDeclined,
}: WatchInviteBannerProps) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Auto-dismiss = decline implicite. On call l'API decline pour que le
  // leader le voie aussi et que l'activity soit cleanup. Fail silent OK.
  useEffect(() => {
    const t = setTimeout(() => {
      void fetch(`/api/activities/${activity.id}/decline`, { method: 'POST' })
        .catch(() => {})
        .finally(() => onDeclined());
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [activity.id, onDeclined]);

  async function accept() {
    if (busy) return;
    setBusy('accept');
    setErr(null);
    try {
      const res = await fetch(`/api/activities/${activity.id}/accept`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error || 'Erreur');
        setBusy(null);
        return;
      }
      const data = await res.json();
      if (data?.activity) onAccepted(data.activity as Activity<unknown>);
      else onAccepted(activity);
    } catch {
      setErr('Erreur réseau');
      setBusy(null);
    }
  }

  async function decline() {
    if (busy) return;
    setBusy('decline');
    try {
      await fetch(`/api/activities/${activity.id}/decline`, { method: 'POST' });
    } catch {
      // ignore
    } finally {
      onDeclined();
    }
  }

  const isVideo = isVideoActivity(activity);
  const videoState = isVideo ? (activity.state as VideoSyncState) : null;
  const title = videoState?.title || 'Vidéo partagée';
  const thumbnail = videoState?.video_id
    ? `https://i.ytimg.com/vi/${videoState.video_id}/mqdefault.jpg`
    : null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[140] w-[min(420px,92vw)] animate-in slide-in-from-top-2 duration-200">
      <div className="bg-[#1a1a22]/95 backdrop-blur-lg border border-white/12 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.55)] overflow-hidden">
        <div className="flex gap-3 p-3">
          {/* Thumb */}
          <div className="relative w-24 h-16 shrink-0 rounded-lg overflow-hidden bg-black/60 border border-white/8">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnail}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full text-white/40">
                <Film size={18} />
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <Play size={16} className="text-white drop-shadow-md" fill="currentColor" />
            </div>
          </div>

          {/* Texte */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-red-300/85 font-medium">
              Invitation Watch Together
            </div>
            <div className="text-[13px] text-white/95 font-medium truncate mt-0.5">
              {inviterLabel} t&apos;invite
            </div>
            <div className="text-[12px] text-white/65 truncate">
              {title}
            </div>
          </div>

          <button
            type="button"
            onClick={decline}
            disabled={!!busy}
            aria-label="Refuser"
            className="self-start p-1 text-white/45 hover:text-white/85 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-3 pb-3">
          <button
            type="button"
            onClick={accept}
            disabled={!!busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-medium rounded-xl py-2 bg-red-500/90 hover:bg-red-500 text-white disabled:opacity-50"
          >
            <Play size={14} fill="currentColor" />
            Synchroniser
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={!!busy}
            className="px-4 text-[13px] rounded-xl py-2 bg-white/[0.07] hover:bg-white/[0.12] text-white/85 disabled:opacity-50"
          >
            Refuser
          </button>
        </div>

        {err && (
          <div className="px-3 pb-2 text-[11.5px] text-rose-300">{err}</div>
        )}
      </div>
    </div>
  );
}
