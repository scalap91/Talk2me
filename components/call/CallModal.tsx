'use client';

/**
 * CallModal — Phase 4 Talk2Me.
 *
 * Overlay fullscreen pour appels WebRTC P2P audio/vidéo natifs.
 *
 * Flow signaling (réutilise SSE existant `/api/conversations/[id]/events`,
 * canal `conv:{id}` du realtime-bus) :
 *
 *   Outgoing :
 *     1. getUserMedia → local stream
 *     2. new RTCPeerConnection + addTrack
 *     3. pc.createOffer → POST /api/call/{id}/offer
 *     4. attend event SSE `call_answer` → pc.setRemoteDescription(answer)
 *     5. trickle ICE candidates dans les 2 sens
 *
 *   Incoming :
 *     1. reçoit `call_offer` via SSE (géré dans /app/c/[conv_id]/page)
 *     2. user tap Accepter → getUserMedia + pc.setRemoteDescription(offer)
 *        + pc.createAnswer → POST /api/call/{id}/answer
 *
 *   Hangup (n'importe quand) :
 *     POST /api/call/{id}/end → broadcast call_hangup → ferme pc + stops tracks
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import {
  DEFAULT_ICE_SERVERS,
  getIceServers,
  GetUserMediaError,
  callSignalUrls,
  formatCallDuration,
  getLocalStream,
  postJson,
  startRingtone,
  stopStream,
} from '@/lib/webrtc-helpers';
import {
  AcceptButton,
  CamToggle,
  DeclineButton,
  HangupButton,
  MicToggle,
  SpeakerToggle,
} from './CallButtons';

export type CallKind = 'audio' | 'video';
export type CallMode = 'outgoing' | 'incoming';
type Phase = 'ringing' | 'incoming' | 'connecting' | 'active' | 'ended';

interface Peer {
  id: string;
  display_name?: string | null;
  username: string;
  avatar?: string | null;
}

export interface IncomingOffer {
  sdp_offer: RTCSessionDescriptionInit;
  from_user_id: string;
}

export interface CallSignal {
  /**
   * Source d'événements signaling reçus via SSE. Le parent (page conv) écoute
   * déjà le SSE conv:{id} et propage ici les events call_*. Cela évite
   * d'ouvrir 2 connexions SSE pour la même conv.
   */
  subscribe: (handler: (evt: CallSignalEvent) => void) => () => void;
}

export type CallSignalEvent =
  | { type: 'call_answer'; from_user_id: string; sdp_answer: RTCSessionDescriptionInit }
  | { type: 'ice_candidate'; from_user_id: string; candidate: RTCIceCandidateInit | null }
  | { type: 'call_decline'; from_user_id: string; reason?: string }
  | { type: 'call_hangup'; from_user_id: string }
  // pour le cas où l'incoming repasse en remote-offer (rare : 2e essai)
  | { type: 'call_offer'; from_user_id: string; kind: CallKind; sdp_offer: RTCSessionDescriptionInit };

interface CallModalProps {
  convId: string;
  peer: Peer;
  kind: CallKind;
  mode: CallMode;
  incomingOffer?: IncomingOffer; // requis si mode === 'incoming'
  signal: CallSignal;
  onClose: () => void;
  /**
   * Phase 5 — Slot pour le rendu d'une activité synchronisée greffée à l'appel
   * (ex: ActivityVideoSync). Si défini, le layout passe en split-screen :
   * activité en haut (~70%), contrôles call en bas (~30%).
   */
  activitySlot?: ReactNode;
  /**
   * Phase 5 — Appelé quand l'user tape "+" depuis un appel actif. Le parent
   * ouvre alors ActivityPicker (rendu hors du modal pour éviter z-index nest).
   */
  onOpenActivityPicker?: () => void;
}

function initialsOf(name: string | null | undefined, fallback: string): string {
  const src = (name && name.trim()) || fallback;
  const parts = src.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
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

export default function CallModal({
  convId,
  peer,
  kind,
  mode,
  incomingOffer,
  signal,
  onClose,
  activitySlot,
  onOpenActivityPicker,
}: CallModalProps) {
  const [phase, setPhase] = useState<Phase>(mode === 'incoming' ? 'incoming' : 'ringing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [activeSince, setActiveSince] = useState<number | null>(null);
  const [, setTick] = useState(0); // force re-render pour timer
  // Talk2Me #327 — Minimisation PiP (Picture-in-Picture). Le <video> reste
  // mounted (sinon WebRTC casse) — on resize juste le container.
  const [minimized, setMinimized] = useState(false);
  const [endedNotice, setEndedNotice] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  // ICE réels (STUN+TURN) préchargés au montage ; fallback STUN si /api/turn KO.
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  useEffect(() => { getIceServers().then((s) => { iceServersRef.current = s; }).catch(() => {}); }, []);
  const remoteSetRef = useRef(false);
  const ringtoneStopRef = useRef<(() => void) | null>(null);
  const urls = useMemo(() => callSignalUrls(convId), [convId]);

  const peerLabel = peer.display_name || `@${peer.username}`;
  const peerGradient = useMemo(() => gradientFromSeed(peer.id), [peer.id]);

  // Timer durée appel
  useEffect(() => {
    if (phase !== 'active' || activeSince === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase, activeSince]);

  // Ringtone pour incoming
  useEffect(() => {
    if (phase === 'incoming') {
      ringtoneStopRef.current = startRingtone();
    }
    return () => {
      if (ringtoneStopRef.current) {
        ringtoneStopRef.current();
        ringtoneStopRef.current = null;
      }
    };
  }, [phase]);

  // Subscribe signaling SSE
  useEffect(() => {
    const unsub = signal.subscribe(async (evt) => {
      if (evt.from_user_id === peer.id || evt.type === 'call_answer' || evt.type === 'ice_candidate') {
        // tous les events viennent en théorie du peer ; on filtre quand même.
      }
      const pc = pcRef.current;

      if (evt.type === 'call_answer') {
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(evt.sdp_answer));
          remoteSetRef.current = true;
          // Flush ICE candidates en attente
          await flushPendingIce();
          setPhase('connecting');
        } catch (e) {
          console.error('[call] setRemoteDescription answer', e);
        }
        return;
      }

      if (evt.type === 'ice_candidate') {
        if (!pc) return;
        if (evt.candidate === null) return; // end-of-candidates marker
        try {
          if (remoteSetRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(evt.candidate));
          } else {
            pendingIceRef.current.push(evt.candidate);
          }
        } catch (e) {
          console.error('[call] addIceCandidate', e);
        }
        return;
      }

      if (evt.type === 'call_decline' || evt.type === 'call_hangup') {
        const duration = activeSince
          ? formatCallDuration(Date.now() - activeSince)
          : null;
        const label =
          evt.type === 'call_decline'
            ? 'Appel refusé'
            : duration
              ? `Appel terminé · ${duration}`
              : 'Appel terminé';
        teardown();
        setPhase('ended');
        setEndedNotice(label);
        // Si le call est minimisé, laisse le toast un peu plus longtemps avant cleanup.
        setTimeout(onClose, minimized ? 1600 : 800);
        return;
      }
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal, peer.id]);

  async function flushPendingIce() {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIceRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('[call] flush ice', e);
      }
    }
    pendingIceRef.current = [];
  }

  function attachLocalStream(stream: MediaStream) {
    localStreamRef.current = stream;
    if (kind === 'video' && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  }

  function attachRemoteTrack(track: MediaStreamTrack) {
    if (!remoteStreamRef.current) {
      remoteStreamRef.current = new MediaStream();
    }
    remoteStreamRef.current.addTrack(track);
    if (track.kind === 'video' && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (track.kind === 'audio' && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
    if (!activeSince) {
      setActiveSince(Date.now());
      setPhase('active');
    }
  }

  /**
   * Talk2Me #327 — Bug fix : les <video> sont mounted seulement quand phase
   * devient 'active' (rendu conditionnel `isVideo && showActive`). Du coup,
   * lorsqu'on a déjà reçu le stream local AVANT le mount, le ref est null
   * dans attachLocalStream() et srcObject ne sera jamais branché. Cet effect
   * re-synchronise après chaque mount/re-render.
   */
  useEffect(() => {
    if (kind !== 'video') return;
    if (localVideoRef.current && localStreamRef.current && !localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject = localStreamRef.current;
      console.log('[call] local video re-attached');
    }
    if (
      remoteVideoRef.current &&
      remoteStreamRef.current &&
      !remoteVideoRef.current.srcObject
    ) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      console.log('[call] remote video re-attached');
    }
    if (
      remoteAudioRef.current &&
      remoteStreamRef.current &&
      !remoteAudioRef.current.srcObject
    ) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  });

  function buildPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pc.onicecandidate = (evt) => {
      // trickle ICE (y compris null = end-of-candidates)
      void postJson(urls.ice, { candidate: evt.candidate ? evt.candidate.toJSON() : null });
    };
    pc.ontrack = (evt) => {
      attachRemoteTrack(evt.track);
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'failed' || st === 'disconnected' || st === 'closed') {
        // pas immédiatement raccrocher sur "disconnected" : laisser une chance
        if (st === 'failed') {
          setErrorMsg('Connexion échouée');
          hangup();
        }
      }
      if (st === 'connected') {
        if (!activeSince) {
          setActiveSince(Date.now());
        }
        setPhase('active');
      }
    };
    pcRef.current = pc;
    return pc;
  }

  // Outgoing : démarre offer
  useEffect(() => {
    if (mode !== 'outgoing') return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await getLocalStream(kind);
        if (cancelled) {
          stopStream(stream);
          return;
        }
        attachLocalStream(stream);
        const pc = buildPeerConnection();
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: kind === 'video',
        });
        await pc.setLocalDescription(offer);
        const ok = await postJson(urls.offer, {
          kind,
          sdp_offer: { type: offer.type, sdp: offer.sdp },
        });
        if (!ok) {
          setErrorMsg('Impossible d\'envoyer l\'appel');
          hangup();
        }
      } catch (e) {
        console.error('[call] outgoing start', e);
        const msg =
          e instanceof GetUserMediaError
            ? e.userMessage
            : 'Permission micro/caméra refusée';
        setErrorMsg(msg);
        setPhase('ended');
        // Plus long pour que l'user lise le toast d'erreur.
        setTimeout(onClose, 2500);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, kind]);

  async function acceptIncoming() {
    if (!incomingOffer) return;
    try {
      setPhase('connecting');
      const stream = await getLocalStream(kind);
      attachLocalStream(stream);
      const pc = buildPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer.sdp_offer));
      remoteSetRef.current = true;
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const ok = await postJson(urls.answer, {
        sdp_answer: { type: answer.type, sdp: answer.sdp },
      });
      if (!ok) {
        setErrorMsg('Réponse rejetée');
        hangup();
      }
    } catch (e) {
      console.error('[call] accept', e);
      const msg =
        e instanceof GetUserMediaError
          ? e.userMessage
          : 'Permission micro/caméra refusée';
      setErrorMsg(msg);
      decline();
    }
  }

  function teardown() {
    if (localStreamRef.current) {
      stopStream(localStreamRef.current);
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    if (ringtoneStopRef.current) {
      ringtoneStopRef.current();
      ringtoneStopRef.current = null;
    }
  }

  async function hangup() {
    void postJson(urls.end, { type: 'hangup' });
    teardown();
    setPhase('ended');
    setTimeout(onClose, 400);
  }

  async function decline() {
    void postJson(urls.end, { type: 'decline' });
    teardown();
    setPhase('ended');
    setTimeout(onClose, 200);
  }

  function toggleMic() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micMuted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMicMuted(next);
  }

  function toggleCam() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !camOff;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setCamOff(next);
  }

  function toggleSpeaker() {
    setSpeakerOn((v) => !v);
    // Note : pas de switch d'audio output en web (setSinkId limité), on
    // laisse le toggle visuel pour cohérence UX. Vraie bascule => app native.
  }

  const durationMs = activeSince ? Date.now() - activeSince : 0;

  // --- RENDER ---

  const isVideo = kind === 'video';
  const showActive = phase === 'active' || phase === 'connecting';
  const hasActivity = Boolean(activitySlot) && phase === 'active';
  // Minimisation autorisée seulement quand l'appel est actif / en connexion.
  // (Pas pendant ringing/incoming/ended pour éviter les états incohérents.)
  const canMinimize = phase === 'active' || phase === 'connecting';
  const isPip = minimized && canMinimize;

  // -------- LAYOUT PiP (Picture-in-Picture flottant) ---------
  // Les <video> restent TOUJOURS mounted (sinon WebRTC casse les tracks).
  if (isPip) {
    return (
      <>
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <button
          type="button"
          onClick={() => setMinimized(false)}
          data-testid="call-pip"
          aria-label="Revenir à l'appel plein écran"
          title="Revenir à l'appel"
          className="fixed top-16 right-3 z-[110] w-28 h-40 rounded-2xl overflow-hidden bg-[#0a0a0d] border border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.6)] flex flex-col text-left active:scale-[0.98] transition-transform"
        >
          {/* Vidéo remote en cover si call vidéo, sinon avatar */}
          {isVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover bg-black"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: peerGradient }}
              aria-hidden="true"
            />
          )}
          {/* Toujours rendre la cam locale pour garder le track actif (caché si audio) */}
          {isVideo && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-12 right-1 w-10 h-14 rounded-md object-cover border border-white/15 bg-black z-[1]"
            />
          )}
          {!isVideo && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-2xl font-medium z-[1]">
              {initialsOf(peer.display_name ?? null, peer.username)}
            </div>
          )}
          {/* Hangup mini (top-right) */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              hangup();
            }}
            role="button"
            aria-label="Raccrocher"
            data-testid="call-pip-hangup"
            className="absolute top-1 right-1 w-7 h-7 rounded-full bg-rose-500/95 hover:bg-rose-400 flex items-center justify-center z-[2] shadow"
          >
            <X size={14} className="text-white" />
          </span>
          {/* Bottom bar : nom + durée */}
          <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/85 to-transparent text-white z-[2]">
            <div className="text-[11px] font-medium truncate">{peerLabel}</div>
            <div className="text-[10px] text-white/70 truncate">
              {phase === 'active' ? formatCallDuration(durationMs) : 'Connexion…'}
            </div>
          </div>
        </button>
      </>
    );
  }

  // -------- LAYOUT plein écran (état normal) ---------
  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0d] text-white flex flex-col">
      {/* Audio sink (toujours présent pour les appels audio) */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Bouton "Minimiser" (top-left) — uniquement quand call actif */}
      {canMinimize && (
        <button
          type="button"
          onClick={() => setMinimized(true)}
          data-testid="call-minimize"
          aria-label="Minimiser l'appel"
          title="Minimiser"
          className="absolute top-3 left-3 z-30 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur flex items-center justify-center text-white/90 border border-white/15 active:scale-95 transition-all"
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Toast "Appel terminé · 2:14" (si peer raccroche pendant minimisé puis on revient) */}
      {endedNotice && (
        <div
          data-testid="call-ended-toast"
          className="absolute top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-black/80 backdrop-blur border border-white/15 text-[13px] text-white/95 shadow-lg"
        >
          {endedNotice}
        </div>
      )}

      {hasActivity ? (
        // ============== SPLIT LAYOUT : activité haut + call compact bas ==============
        <div className="relative z-10 flex flex-col h-full">
          {/* Activité : prend la plus grosse part */}
          <div className="flex-1 min-h-0 flex">
            {activitySlot}
          </div>
          {/* PIP cam locale (call vidéo : on garde le retour caméra) */}
          {isVideo && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute top-3 right-3 w-20 h-28 rounded-2xl object-cover border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] bg-black z-20"
            />
          )}
          {/* Remote video (audio invisible — track audio sort via remoteAudioRef) */}
          {isVideo && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute top-3 left-3 w-20 h-28 rounded-2xl object-cover border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] bg-black z-20"
            />
          )}

          {/* Mini call bar bas */}
          <div className="shrink-0 border-t border-white/10 bg-[#0e0e12]/85 backdrop-blur px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-[12px] font-medium"
                style={{ background: peerGradient }}
                aria-hidden="true"
              >
                {initialsOf(peer.display_name ?? null, peer.username)}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-white/95 truncate">{peerLabel}</div>
                <div className="text-[11px] text-white/55 truncate">
                  {phase === 'active' ? formatCallDuration(durationMs) : 'Connexion…'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <MicToggle muted={micMuted} onClick={toggleMic} />
              {isVideo ? (
                <CamToggle off={camOff} onClick={toggleCam} />
              ) : (
                <SpeakerToggle active={speakerOn} onClick={toggleSpeaker} />
              )}
              <HangupButton onClick={hangup} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Background : video fullscreen ou avatar centré */}
          {isVideo && showActive ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover bg-black"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a22] via-[#0e0e12] to-[#0a0a0d]" />
          )}

          {/* PIP cam locale (en haut à droite pendant call vidéo actif) */}
          {isVideo && showActive && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute top-4 right-4 w-28 h-40 sm:w-32 sm:h-44 rounded-2xl object-cover border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] bg-black z-10"
            />
          )}

          {/* Overlay infos peer (au-dessus de la video) */}
          <div className="relative z-10 flex flex-col items-center pt-16 px-6">
            {!showActive || !isVideo ? (
              <div
                className="w-32 h-32 rounded-full flex items-center justify-center text-white text-4xl font-medium shadow-[0_8px_32px_rgba(0,0,0,0.4)] mb-5"
                style={{ background: peerGradient }}
                aria-hidden="true"
              >
                {initialsOf(peer.display_name ?? null, peer.username)}
              </div>
            ) : null}

            <div className="text-center">
              <div className="text-[22px] font-medium tracking-tight text-white/95">{peerLabel}</div>
              <div className="text-[13px] text-white/55 mt-1">
                {phase === 'ringing' && (kind === 'video' ? 'Appel vidéo…' : 'Appel…')}
                {phase === 'incoming' && (kind === 'video' ? 'Appel vidéo entrant' : 'Appel entrant')}
                {phase === 'connecting' && 'Connexion…'}
                {phase === 'active' && formatCallDuration(durationMs)}
                {phase === 'ended' && 'Appel terminé'}
              </div>
              {errorMsg && (
                <div className="mt-2 text-[12px] text-rose-300">{errorMsg}</div>
              )}
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bouton "+" Activité (au-dessus des contrôles call, uniquement
              quand l'appel est actif et qu'on n'a pas déjà d'activité). */}
          {phase === 'active' && onOpenActivityPicker && (
            <div className="relative z-10 flex items-center justify-center pb-2">
              <button
                type="button"
                onClick={onOpenActivityPicker}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white/90 text-[12.5px] font-medium transition-colors active:scale-95"
                aria-label="Lancer une activité partagée"
                title="Activité partagée"
              >
                <Plus size={14} />
                Activité
              </button>
            </div>
          )}

          {/* Action bar bas */}
          <div className="relative z-10 pb-10 pt-4 px-6">
            {phase === 'incoming' && (
              <div className="flex items-center justify-around max-w-md mx-auto">
                <div className="flex flex-col items-center gap-2">
                  <DeclineButton onClick={decline} />
                  <span className="text-[11px] text-white/55">Refuser</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <AcceptButton onClick={acceptIncoming} />
                  <span className="text-[11px] text-white/55">Accepter</span>
                </div>
              </div>
            )}

            {phase === 'ringing' && (
              <div className="flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <HangupButton onClick={hangup} />
                  <span className="text-[11px] text-white/55">Annuler</span>
                </div>
              </div>
            )}

            {(phase === 'connecting' || phase === 'active') && (
              <div className="flex items-center justify-around max-w-sm mx-auto">
                <MicToggle muted={micMuted} onClick={toggleMic} />
                {isVideo ? (
                  <CamToggle off={camOff} onClick={toggleCam} />
                ) : (
                  <SpeakerToggle active={speakerOn} onClick={toggleSpeaker} />
                )}
                <HangupButton onClick={hangup} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
