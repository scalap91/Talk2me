'use client';

/**
 * ActivityVideoSync — Phase 5 activité 'video' (VideoCard YouTube sync).
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Watch Together event-passthrough.
 * Doctrine [[talk2me-watch-together-passthrough]] : Talk2Me NE STREAME PAS le
 * média ; chaque side ouvre l'iframe officielle YouTube en local. On
 * synchronise uniquement play/pause/seek/rate via POST /api/activities/{id}/sync
 * (low-latency event passthrough) + un POST /state moins fréquent pour les
 * late-joiners.
 *
 * Modèle leader-follower :
 *   - Le LEADER émet ses events player (play/pause/seek) vers /sync (immédiat)
 *     et /state (snapshot toutes les ~4s).
 *   - Le FOLLOWER applique chaque watch_sync reçu. Drift > 1.5s = snap seek ;
 *     drift léger 0.3-1.5s = time-stretch via playbackRate ±5%.
 *
 * Doctrine [[talk2me-audio-anti-echo]] : ce composant ne capte AUCUN audio
 * micro (pas d'appel getUserMedia ici). C'est le CallModal qui gère le micro
 * avec echoCancellation/noiseSuppression/autoGainControl.
 */

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Activity, VideoSyncState } from '@/lib/activity-types';

interface ActivityVideoSyncProps {
  activity: Activity<VideoSyncState>;
  isLeader: boolean;
  /** state remote propagé par SSE (activity_state). Si null = pas encore reçu. */
  remoteState: VideoSyncState | null;
  meId: string;
  peerLabel?: string | null;
  onEnd: () => void;
  /**
   * Talk2Me #408 — Event sync précis (watch_sync). Réinjecté par le parent
   * pour application immédiate côté follower (latence < heartbeat /state).
   * undefined = pas d'event nouveau.
   */
  syncEvent?: {
    action: 'play' | 'pause' | 'seek' | 'rate';
    time: number;
    rate?: number | null;
    client_ts: number;
    from_user_id: string;
  } | null;
}

// ===== YouTube IFrame Player API global loader =====

let ytApiPromise: Promise<void> | null = null;

function loadYtApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-yt-iframe-api]');
    const prevReady = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        if (typeof prevReady === 'function') prevReady();
      } catch {
        // ignore
      }
      resolve();
    };
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.dataset.ytIframeApi = '1';
      tag.onerror = () => reject(new Error('yt api load failed'));
      document.head.appendChild(tag);
    }
    // Si déjà chargé entre-temps
    setTimeout(() => {
      if (w.YT && w.YT.Player) resolve();
    }, 100);
  });
  return ytApiPromise;
}

const SYNC_THRESHOLD_S = 1.5;
const TIME_STRETCH_THRESHOLD_S = 0.3;
const LEADER_PUSH_THROTTLE_MS = 1200;

export default function ActivityVideoSync({
  activity,
  isLeader,
  remoteState,
  meId,
  peerLabel,
  onEnd,
  syncEvent,
}: ActivityVideoSyncProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const lastPushRef = useRef(0);
  const initialState = activity.state;
  const initialVideoId = initialState.video_id;
  const [ready, setReady] = useState(false);
  const [ending, setEnding] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const remoteAppliedAtRef = useRef(0);

  // === Mount player ===
  useEffect(() => {
    let cancelled = false;
    let playerEl: HTMLDivElement | null = null;

    (async () => {
      try {
        await loadYtApi();
        if (cancelled) return;
        if (!containerRef.current) return;
        playerEl = document.createElement('div');
        playerEl.id = `yt-player-${activity.id}`;
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(playerEl);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const player = new w.YT.Player(playerEl.id, {
          videoId: initialVideoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: initialState.is_playing ? 1 : 0,
            start: Math.max(0, Math.floor(initialState.current_time_s || 0)),
            playsinline: 1,
            controls: isLeader ? 1 : 0,
            disablekb: isLeader ? 0 : 1,
            modestbranding: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
              try {
                if (initialState.current_time_s > 0) {
                  player.seekTo(initialState.current_time_s, true);
                }
                if (initialState.is_playing) {
                  player.playVideo();
                } else {
                  player.pauseVideo();
                }
              } catch {
                // ignore
              }
            },
            onStateChange: (evt: { data: number }) => {
              // YT.PlayerState : -1 unstarted, 0 ended, 1 playing, 2 paused,
              // 3 buffering, 5 cued
              if (!isLeader) return;
              if (evt.data === 1 || evt.data === 2 || evt.data === 0) {
                pushLeaderState();
                // Talk2Me #408 — Event sync immédiat pour low-latency
                pushSyncAction(evt.data === 1 ? 'play' : 'pause');
              }
              if (evt.data === 0) {
                // Vidéo terminée → on garde l'activité ouverte (le leader peut
                // choisir de relancer). Pas de auto-end (à raffiner plus tard).
              }
            },
            onError: () => {
              setErrMsg('Lecture impossible (vidéo restreinte ?)');
            },
          },
        });
        playerRef.current = player;
      } catch (e) {
        console.error('[yt sync] init', e);
        setErrMsg('Impossible de charger YouTube');
      }
    })();

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id]);

  // === Leader : push event sync immédiat (low-latency, < 100ms typique) ===
  // Talk2Me #408 — passthrough event uniquement (play/pause/seek/rate).
  // Doctrine [[talk2me-watch-together-passthrough]] : pas de média transporté.
  async function pushSyncAction(
    action: 'play' | 'pause' | 'seek' | 'rate',
    overrides?: { time?: number; rate?: number }
  ) {
    if (!isLeader || !playerRef.current) return;
    try {
      const player = playerRef.current;
      const time =
        typeof overrides?.time === 'number'
          ? overrides.time
          : Number(player.getCurrentTime?.() ?? 0);
      const rate =
        typeof overrides?.rate === 'number'
          ? overrides.rate
          : Number(player.getPlaybackRate?.() ?? 1);
      await fetch(`/api/activities/${activity.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          time,
          rate,
          client_ts: Date.now(),
        }),
      });
    } catch (e) {
      console.warn('[yt sync] push sync action', action, e);
    }
  }

  // === Leader : push state au serveur ===
  async function pushLeaderState() {
    if (!isLeader || !playerRef.current || !ready) return;
    const now = Date.now();
    if (now - lastPushRef.current < LEADER_PUSH_THROTTLE_MS) return;
    lastPushRef.current = now;
    try {
      const player = playerRef.current;
      const t = Number(player.getCurrentTime?.() ?? 0);
      const playerState: number = player.getPlayerState?.() ?? -1;
      const is_playing = playerState === 1;
      const state: VideoSyncState = {
        video_id: initialVideoId,
        title: activity.state.title,
        current_time_s: t,
        is_playing,
        updated_at: now,
        leader_id: meId,
      };
      await fetch(`/api/activities/${activity.id}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
    } catch (e) {
      console.warn('[yt sync] push state', e);
    }
  }

  // === Leader : heartbeat pour propager les seeks "muets" et tenir les followers ===
  useEffect(() => {
    if (!isLeader || !ready) return;
    const id = setInterval(() => {
      pushLeaderState();
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader, ready]);

  // === Follower : applique watch_sync event (Talk2Me #408) ===
  // Latence cible < 200ms. Le state /state (heartbeat) reste un filet de sécurité.
  const lastSyncTsRef = useRef(0);
  useEffect(() => {
    if (isLeader || !ready || !syncEvent || !playerRef.current) return;
    if (syncEvent.from_user_id === meId) return;
    if (syncEvent.client_ts <= lastSyncTsRef.current) return;
    lastSyncTsRef.current = syncEvent.client_ts;
    try {
      const player = playerRef.current;
      // Time-stretch léger pour compenser drift réseau : si on est dans la
      // fenêtre [TIME_STRETCH..SYNC_THRESHOLD], on ajuste playbackRate ±5%
      // au lieu de snap-seek (plus naturel à l'oreille).
      const localT = Number(player.getCurrentTime?.() ?? 0);
      const drift = localT - syncEvent.time;
      switch (syncEvent.action) {
        case 'play':
          if (Math.abs(drift) > SYNC_THRESHOLD_S) {
            player.seekTo(syncEvent.time, true);
            player.setPlaybackRate?.(1);
          } else if (Math.abs(drift) > TIME_STRETCH_THRESHOLD_S) {
            // En retard (drift négatif) → accélère ; en avance → ralenti.
            const rate = drift < 0 ? 1.05 : 0.95;
            player.setPlaybackRate?.(rate);
            // Retour à 1.0 après ~3s — laisse le temps au drift de se résorber
            setTimeout(() => {
              try { player.setPlaybackRate?.(1); } catch { /* ignore */ }
            }, 3000);
          }
          player.playVideo();
          break;
        case 'pause':
          if (Math.abs(drift) > SYNC_THRESHOLD_S) {
            player.seekTo(syncEvent.time, true);
          }
          player.pauseVideo();
          break;
        case 'seek':
          player.seekTo(syncEvent.time, true);
          player.setPlaybackRate?.(1);
          break;
        case 'rate':
          if (typeof syncEvent.rate === 'number') {
            player.setPlaybackRate?.(syncEvent.rate);
          }
          break;
      }
    } catch (e) {
      console.warn('[yt sync] apply syncEvent', e);
    }
  }, [syncEvent, ready, isLeader, meId]);

  // === Follower : applique le state remote ===
  useEffect(() => {
    if (isLeader || !ready || !remoteState || !playerRef.current) return;
    if (remoteState.updated_at <= remoteAppliedAtRef.current) return;
    remoteAppliedAtRef.current = remoteState.updated_at;
    try {
      const player = playerRef.current;
      const localT = Number(player.getCurrentTime?.() ?? 0);
      // snap seek si désync notable
      if (Math.abs(localT - remoteState.current_time_s) > SYNC_THRESHOLD_S) {
        player.seekTo(remoteState.current_time_s, true);
      }
      const playerState: number = player.getPlayerState?.() ?? -1;
      const localPlaying = playerState === 1;
      if (remoteState.is_playing && !localPlaying) {
        player.playVideo();
      } else if (!remoteState.is_playing && localPlaying) {
        player.pauseVideo();
      }
    } catch (e) {
      console.warn('[yt sync] apply remote', e);
    }
  }, [isLeader, ready, remoteState]);

  async function handleEnd() {
    if (ending) return;
    setEnding(true);
    try {
      await fetch(`/api/activities/${activity.id}/end`, { method: 'POST' });
    } catch {
      // ignore
    } finally {
      onEnd();
    }
  }

  const headerLabel = peerLabel ? `Vidéo partagée · ${peerLabel} & toi` : 'Vidéo partagée';

  return (
    <div className="relative flex flex-col w-full h-full bg-black">
      {/* Header mini */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e0e12]/85 backdrop-blur border-b border-white/8">
        <div className="text-[12px] text-white/70 truncate flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-red-300/80 font-medium bg-red-500/15 px-2 py-0.5 rounded-full border border-red-400/15">
            {isLeader ? 'Vous menez' : 'En suivi'}
          </span>
          <span className="truncate">{headerLabel}</span>
        </div>
        <button
          type="button"
          onClick={handleEnd}
          disabled={ending}
          className="text-[12px] text-white/70 hover:text-white px-2 py-1 rounded-full bg-white/8 border border-white/10 disabled:opacity-50"
          aria-label="Terminer la vidéo"
        >
          <span className="inline-flex items-center gap-1">
            <X size={12} />
            Fin
          </span>
        </button>
      </div>

      {/* Player container */}
      <div className="relative flex-1 bg-black">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && !errMsg && (
          <div className="absolute inset-0 flex items-center justify-center text-white/55 text-[13px]">
            Chargement…
          </div>
        )}
        {errMsg && (
          <div className="absolute inset-0 flex items-center justify-center text-rose-300 text-[13px] px-4 text-center">
            {errMsg}
          </div>
        )}
      </div>

      {/* Title bar */}
      <div className="px-3 py-2 bg-[#0e0e12]/85 backdrop-blur border-t border-white/8">
        <div className="text-[12.5px] font-medium text-white/90 truncate">
          {activity.state.title || initialVideoId}
        </div>
      </div>
    </div>
  );
}
