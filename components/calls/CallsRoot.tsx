'use client';

/**
 * <CallsRoot> — Orchestrateur global Calls v2 (Talk2Me #418).
 *
 * Pascal 2026-06-05. Monté DANS LE LAYOUT root (au-dessus de toutes les
 * pages), il écoute :
 *   - SSE /api/me/events 'call:incoming' → ouvre <IncomingCallScreen>
 *   - CustomEvent 'ttm:call:start' depuis <CallButton> → ouvre <OutgoingCallScreen>
 *
 * Une fois l'appel accepté (par moi ou par l'autre), il monte <CallInProgress>
 * et démonte le screen ringing/incoming.
 *
 * Un seul appel actif à la fois : si un 2e incoming arrive pendant qu'un autre
 * est ouvert, on l'ignore (le serveur a déjà filtré via 'callee_busy' côté
 * API new, mais ceinture+bretelles).
 *
 * Skipped silencieusement si l'utilisateur n'est pas connecté (pas de cookie
 * session) — le SSE répondra 401 et on n'affiche rien.
 */
import { useCallback, useEffect, useState } from 'react';
import IncomingCallScreen, {
  type IncomingCallPayload,
} from './IncomingCallScreen';
import OutgoingCallScreen from './OutgoingCallScreen';
import CallInProgress from './CallInProgress';

interface CalleeBrief {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
}

type ActiveCall =
  | { phase: 'incoming'; data: IncomingCallPayload }
  | {
      phase: 'outgoing';
      callId: string;
      kind: 'audio' | 'video';
      callee: CalleeBrief;
    }
  | {
      phase: 'in_progress';
      callId: string;
      kind: 'audio' | 'video';
      myRole: 'caller' | 'callee';
      peer: CalleeBrief;
    };

interface MeDto {
  id: string;
  username: string;
}

export default function CallsRoot() {
  const [me, setMe] = useState<MeDto | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);

  // Charge l'identité de l'user courant (pour décider d'ouvrir le SSE).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        if (j?.user?.id) setMe({ id: j.user.id, username: j.user.username });
      } catch {
        /* user pas connecté : on ne fait rien */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // SSE user:{id} pour 'call:incoming'. Reste ouvert tant qu'aucun appel n'est
  // 'in_progress' (sinon les child screens ouvrent leurs propres EventSource).
  useEffect(() => {
    if (!me) return;
    const es = new EventSource('/api/me/events');

    es.addEventListener('call:incoming', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as IncomingCallPayload;
        if (!data?.call_id) return;
        // Si déjà un appel actif, ignore (le serveur aurait dû renvoyer 409
        // côté caller, mais on protège l'UI).
        setActive((prev) => {
          if (prev) return prev;
          return { phase: 'incoming', data };
        });
      } catch (e) {
        console.error('[CallsRoot] parse call:incoming', e);
      }
    });

    return () => {
      es.close();
    };
  }, [me]);

  // CustomEvent depuis <CallButton>.
  useEffect(() => {
    const handler = (evt: Event) => {
      const ce = evt as CustomEvent<{
        call_id: string;
        kind: 'audio' | 'video';
        callee: CalleeBrief;
      }>;
      const d = ce.detail;
      if (!d?.call_id || !d.callee) return;
      setActive((prev) => {
        if (prev) return prev; // un seul appel à la fois
        return {
          phase: 'outgoing',
          callId: d.call_id,
          kind: d.kind,
          callee: d.callee,
        };
      });
    };
    window.addEventListener('ttm:call:start', handler as EventListener);
    return () => {
      window.removeEventListener('ttm:call:start', handler as EventListener);
    };
  }, []);

  // ─── Callbacks transition ───────────────────────────────────────────────
  const onIncomingAccepted = useCallback(
    (callId: string) => {
      setActive((prev) => {
        if (!prev || prev.phase !== 'incoming') return prev;
        return {
          phase: 'in_progress',
          callId,
          kind: prev.data.kind,
          myRole: 'callee',
          peer: prev.data.caller,
        };
      });
    },
    []
  );

  const onOutgoingAccepted = useCallback(
    (callId: string) => {
      setActive((prev) => {
        if (!prev || prev.phase !== 'outgoing') return prev;
        return {
          phase: 'in_progress',
          callId,
          kind: prev.kind,
          myRole: 'caller',
          peer: prev.callee,
        };
      });
    },
    []
  );

  const closeAll = useCallback(() => setActive(null), []);

  if (!me || !active) return null;

  if (active.phase === 'incoming') {
    return (
      <IncomingCallScreen
        call={active.data}
        onAccepted={onIncomingAccepted}
        onClosed={closeAll}
      />
    );
  }
  if (active.phase === 'outgoing') {
    return (
      <OutgoingCallScreen
        callId={active.callId}
        callee={active.callee}
        kind={active.kind}
        onAccepted={onOutgoingAccepted}
        onClosed={closeAll}
      />
    );
  }
  return (
    <CallInProgress
      callId={active.callId}
      peer={active.peer}
      kind={active.kind}
      myRole={active.myRole}
      onClosed={closeAll}
    />
  );
}
