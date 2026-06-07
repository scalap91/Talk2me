'use client';

/**
 * <IncomingCallScreen> — Calls v2 tonalité honnête (Talk2Me #418).
 *
 * Pascal 2026-06-05. Affiché plein écran quand le user reçoit un
 * 'call:incoming' via SSE user:{id}. Doctrine [[talk2me-calls-architecture]].
 *
 * RESPONSABILITÉ CLÉ : à chaque cycle d'affichage de sonnerie, envoyer un
 * POST /api/calls/[id]/ring_beat → relayé en SSE 'call:ring_beat' à l'appelant
 * qui joue UN dring local. C'est ça la "tonalité honnête" : ça ne sonne chez
 * l'appelant QUE si ça sonne réellement chez l'appelé.
 *
 * Aussi : sonnerie locale audible (dring dring) pour alerter l'utilisateur.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { startRingingLoop, playHangupBeep, stopAll } from '@/lib/calls/sounds';

export interface IncomingCallPayload {
  call_id: string;
  kind: 'audio' | 'video';
  conv_id: string | null;
  started_at: number;
  caller: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url?: string | null;
  };
}

interface Props {
  call: IncomingCallPayload;
  /** Appelé après accept réussi → parent monte <CallInProgress>. */
  onAccepted: (callId: string) => void;
  /** Appelé après decline OU réception 'call:hangup' OU fermeture forcée. */
  onClosed: (callId: string) => void;
}

const RING_BEAT_INTERVAL_MS = 1200; // 1 cycle / 1.2s comme demandé Pascal

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

export default function IncomingCallScreen({ call, onAccepted, onClosed }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const beatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localRingStopRef = useRef<(() => void) | null>(null);
  const closedRef = useRef(false);

  const caller = call.caller;
  const callerLabel = caller.display_name || `@${caller.username}`;
  const gradient = gradientFromSeed(caller.id);

  // 1) Démarre la boucle ring_beat dès le mount.
  // 2) Démarre la sonnerie LOCALE (l'utilisateur entend dring dring chez lui).
  useEffect(() => {
    closedRef.current = false;

    const sendBeat = async () => {
      if (closedRef.current) return;
      try {
        const res = await fetch(`/api/calls/${encodeURIComponent(call.call_id)}/ring_beat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          // Si l'appel n'est plus 'ringing' (déjà accepté/refusé/hangup),
          // on arrête la boucle proprement.
          if (res.status === 409 || res.status === 404) {
            stopBeat();
          }
        }
      } catch {
        /* réseau down — on retentera au prochain tick */
      }
    };

    const stopBeat = () => {
      if (beatTimerRef.current) {
        clearInterval(beatTimerRef.current);
        beatTimerRef.current = null;
      }
    };

    // 1er beat immédiat puis répétition
    void sendBeat();
    beatTimerRef.current = setInterval(sendBeat, RING_BEAT_INTERVAL_MS);

    // Sonnerie locale (best-effort, peut échouer si pas d'interaction user
    // récente : c'est OK, le beat continue de tourner).
    try {
      localRingStopRef.current = startRingingLoop();
    } catch {
      /* ignore */
    }

    return () => {
      closedRef.current = true;
      stopBeat();
      if (localRingStopRef.current) {
        localRingStopRef.current();
        localRingStopRef.current = null;
      }
      stopAll();
    };
  }, [call.call_id]);

  const handleAccept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(call.call_id)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(j?.error || 'accept_failed');
        setBusy(false);
        return;
      }
      // Stop sonnerie immédiatement. Parent montera <CallInProgress>.
      if (localRingStopRef.current) {
        localRingStopRef.current();
        localRingStopRef.current = null;
      }
      stopAll();
      onAccepted(call.call_id);
    } catch (e) {
      console.error('[call] accept', e);
      setErr('network');
      setBusy(false);
    }
  }, [busy, call.call_id, onAccepted]);

  const handleDecline = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/calls/${encodeURIComponent(call.call_id)}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
    } finally {
      playHangupBeep();
      stopAll();
      onClosed(call.call_id);
    }
  }, [busy, call.call_id, onClosed]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-[#0a0a0d] text-white flex flex-col"
      data-testid="incoming-call-screen"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a22] via-[#0e0e12] to-[#0a0a0d]" />

      <div className="relative z-10 flex-1 flex flex-col items-center pt-20 px-6">
        {caller.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={caller.avatar_url}
            alt=""
            className="w-36 h-36 rounded-full object-cover shadow-[0_8px_32px_rgba(0,0,0,0.5)] mb-6"
          />
        ) : (
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center text-white text-5xl font-medium shadow-[0_8px_32px_rgba(0,0,0,0.5)] mb-6"
            style={{ background: gradient }}
            aria-hidden="true"
          >
            {initialsOf(caller.display_name, caller.username)}
          </div>
        )}
        <div className="text-center">
          <div className="text-[26px] font-medium tracking-tight">{callerLabel}</div>
          <div className="text-[14px] text-white/60 mt-1">
            {call.kind === 'video' ? 'Appel vidéo entrant' : 'Appel entrant'}
          </div>
          {err && (
            <div className="text-[12px] text-rose-300 mt-3" role="alert">
              Erreur : {err}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 pb-12 pt-4 px-6">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleDecline}
              disabled={busy}
              aria-label="Refuser l'appel"
              data-testid="incoming-decline"
              className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-400 disabled:opacity-60 text-white shadow-[0_4px_16px_rgba(244,63,94,0.4)] flex items-center justify-center active:scale-95 transition-transform"
            >
              <PhoneOff size={26} />
            </button>
            <span className="text-[11px] text-white/55">Refuser</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleAccept}
              disabled={busy}
              aria-label="Accepter l'appel"
              data-testid="incoming-accept"
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white shadow-[0_4px_16px_rgba(16,185,129,0.4)] flex items-center justify-center active:scale-95 transition-transform"
            >
              <Phone size={26} />
            </button>
            <span className="text-[11px] text-white/55">Accepter</span>
          </div>
        </div>
      </div>
    </div>
  );
}
