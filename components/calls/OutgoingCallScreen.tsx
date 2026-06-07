'use client';

/**
 * <OutgoingCallScreen> — Calls v2 tonalité honnête (Talk2Me #418).
 *
 * Pascal 2026-06-05. Affiché plein écran après POST /api/calls/new réussi.
 * Doctrine [[talk2me-calls-architecture]] — la tonalité est honnête :
 *
 *   - À chaque event SSE 'call:ring_beat' reçu → 1 cycle de dring local.
 *   - Watchdog : si pas de beat depuis >2000ms → bascule en mode busy
 *     (boucle son occupé jusqu'à hangup user).
 *   - Sur 'call:accepted' → parent monte <CallInProgress>.
 *   - Sur 'call:busy' → loop occupé + auto-hangup 8s.
 *   - Sur 'call:hangup' → bip final + fermeture.
 *
 * Pas de fake ringing. Si l'app de l'appelé ne tourne pas, pas de beat, pas
 * de dring → on entend tout de suite "occupé".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneOff } from 'lucide-react';
import {
  playDringDringCycle,
  startBusyLoop,
  playHangupBeep,
  stopAll,
} from '@/lib/calls/sounds';

interface CalleePeer {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
}

interface Props {
  callId: string;
  callee: CalleePeer;
  kind: 'audio' | 'video';
  /** Appelé sur 'call:accepted' SSE. Parent monte alors <CallInProgress>. */
  onAccepted: (callId: string) => void;
  /** Appelé sur fermeture (hangup user, busy, hangup distant). */
  onClosed: (callId: string) => void;
}

// Seuil watchdog : pas de beat depuis BUSY_THRESHOLD_MS → mode busy.
const BUSY_THRESHOLD_MS = 2_000;
// Auto-hangup après busy reçu.
const BUSY_AUTOHANGUP_MS = 8_000;
// Tonalité de "appel partant" reste affichée X ms max avant timeout no_answer.
const NO_ANSWER_TIMEOUT_MS = 45_000;

function initialsOf(name: string | null | undefined, fallback: string): string {
  const src = (name && name.trim()) || fallback;
  return src
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function gradientFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const hue = Math.abs(h) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55% / 0.95), hsl(${(hue + 40) % 360} 70% 50% / 0.95))`;
}

export default function OutgoingCallScreen({
  callId,
  callee,
  kind,
  onAccepted,
  onClosed,
}: Props) {
  const [phase, setPhase] = useState<'ringing' | 'busy' | 'no_answer' | 'ending'>(
    'ringing'
  );
  const [statusLabel, setStatusLabel] = useState<string>('Sonnerie…');

  // ─── Refs ──────────────────────────────────────────────────────────────
  const lastBeatAtRef = useRef<number>(0);
  const beatWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyAutoHangupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyLoopStopRef = useRef<(() => void) | null>(null);
  const closedRef = useRef(false);
  const sseRef = useRef<EventSource | null>(null);

  const gradient = gradientFromSeed(callee.id);
  const calleeLabel = callee.display_name || `@${callee.username}`;

  // ─── Helpers ───────────────────────────────────────────────────────────
  const enterBusy = useCallback((reason: 'no_beat' | 'declined') => {
    if (closedRef.current) return;
    if (busyLoopStopRef.current) return; // déjà en busy
    setPhase(reason === 'declined' ? 'busy' : 'busy');
    setStatusLabel(reason === 'declined' ? 'Occupé' : 'Pas de réponse');
    try {
      busyLoopStopRef.current = startBusyLoop();
    } catch {
      /* ignore */
    }
    if (busyAutoHangupRef.current) clearTimeout(busyAutoHangupRef.current);
    busyAutoHangupRef.current = setTimeout(() => {
      void doHangup('no_answer');
    }, BUSY_AUTOHANGUP_MS);
  }, []);

  const stopBusy = useCallback(() => {
    if (busyLoopStopRef.current) {
      busyLoopStopRef.current();
      busyLoopStopRef.current = null;
    }
    if (busyAutoHangupRef.current) {
      clearTimeout(busyAutoHangupRef.current);
      busyAutoHangupRef.current = null;
    }
  }, []);

  const doHangup = useCallback(
    async (reason?: 'no_answer' | 'caller_hangup' | 'network_error') => {
      if (closedRef.current) return;
      closedRef.current = true;
      stopBusy();
      stopAll();
      playHangupBeep();
      try {
        await fetch(`/api/calls/${encodeURIComponent(callId)}/hangup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reason ? { reason } : {}),
        });
      } catch {
        /* ignore */
      }
      onClosed(callId);
    },
    [callId, onClosed, stopBusy]
  );

  // ─── Watchdog beats ────────────────────────────────────────────────────
  useEffect(() => {
    closedRef.current = false;
    lastBeatAtRef.current = 0;

    // Le watchdog démarre après 2s pour laisser le temps au 1er beat d'arriver
    // (sinon on entrerait immédiatement en busy).
    const watchStart = setTimeout(() => {
      beatWatchdogRef.current = setInterval(() => {
        if (closedRef.current) return;
        if (phase !== 'ringing') return;
        const last = lastBeatAtRef.current;
        if (!last) {
          // Toujours aucun beat reçu après 2s → busy immédiat (app non joignable)
          enterBusy('no_beat');
          return;
        }
        if (Date.now() - last > BUSY_THRESHOLD_MS) {
          enterBusy('no_beat');
        }
      }, 500);
    }, BUSY_THRESHOLD_MS);

    // Timeout no_answer
    noAnswerTimerRef.current = setTimeout(() => {
      void doHangup('no_answer');
    }, NO_ANSWER_TIMEOUT_MS);

    return () => {
      closedRef.current = true;
      clearTimeout(watchStart);
      if (beatWatchdogRef.current) clearInterval(beatWatchdogRef.current);
      if (noAnswerTimerRef.current) clearTimeout(noAnswerTimerRef.current);
      stopBusy();
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── SSE user channel ──────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource('/api/me/events');
    sseRef.current = es;

    es.addEventListener('call:ring_beat', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as { call_id?: string };
        if (data.call_id !== callId) return;
        lastBeatAtRef.current = Date.now();
        // Si on était passé en busy mais qu'un beat retardataire arrive, on
        // ne refait PAS marche arrière (UX : décision déjà prise).
        if (phase === 'ringing') {
          void playDringDringCycle();
        }
      } catch {
        /* ignore */
      }
    });

    es.addEventListener('call:accepted', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as { call_id?: string };
        if (data.call_id !== callId) return;
        if (closedRef.current) return;
        stopBusy();
        stopAll();
        // Pas de bip ici, on bascule directement sur le média.
        closedRef.current = true; // évite double-hangup au unmount
        onAccepted(callId);
      } catch {
        /* ignore */
      }
    });

    es.addEventListener('call:busy', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as { call_id?: string };
        if (data.call_id !== callId) return;
        if (phase === 'ringing') enterBusy('declined');
      } catch {
        /* ignore */
      }
    });

    es.addEventListener('call:hangup', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as { call_id?: string };
        if (data.call_id !== callId) return;
        if (closedRef.current) return;
        closedRef.current = true;
        stopBusy();
        stopAll();
        playHangupBeep();
        setPhase('ending');
        setStatusLabel('Appel terminé');
        // Laisse 600ms pour que l'utilisateur entende le bip.
        setTimeout(() => onClosed(callId), 600);
      } catch {
        /* ignore */
      }
    });

    es.onerror = () => {
      // Reconnexion auto par le navigateur.
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-[#0a0a0d] text-white flex flex-col"
      data-testid="outgoing-call-screen"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a22] via-[#0e0e12] to-[#0a0a0d]" />

      <div className="relative z-10 flex-1 flex flex-col items-center pt-20 px-6">
        {callee.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={callee.avatar_url}
            alt=""
            className="w-36 h-36 rounded-full object-cover shadow-[0_8px_32px_rgba(0,0,0,0.5)] mb-6"
          />
        ) : (
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center text-white text-5xl font-medium shadow-[0_8px_32px_rgba(0,0,0,0.5)] mb-6"
            style={{ background: gradient }}
            aria-hidden="true"
          >
            {initialsOf(callee.display_name, callee.username)}
          </div>
        )}
        <div className="text-center">
          <div className="text-[26px] font-medium tracking-tight">{calleeLabel}</div>
          <div className="text-[14px] text-white/60 mt-1" data-testid="outgoing-status">
            {phase === 'ringing' && (kind === 'video' ? 'Appel vidéo…' : statusLabel)}
            {phase === 'busy' && statusLabel}
            {phase === 'no_answer' && 'Pas de réponse'}
            {phase === 'ending' && statusLabel}
          </div>
          {phase === 'busy' && (
            <div className="text-[12px] text-white/40 mt-2 max-w-xs mx-auto">
              {calleeLabel} n&apos;est pas joignable. Le téléphone ne sonne pas
              chez lui.
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 pb-12 pt-4 px-6">
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => void doHangup('caller_hangup')}
              aria-label="Raccrocher"
              data-testid="outgoing-hangup"
              className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-400 text-white shadow-[0_4px_16px_rgba(244,63,94,0.4)] flex items-center justify-center active:scale-95 transition-transform"
            >
              <PhoneOff size={26} />
            </button>
            <span className="text-[11px] text-white/55">
              {phase === 'busy' ? 'Annuler' : 'Annuler l’appel'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
