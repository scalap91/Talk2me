'use client';

/**
 * <CallInProgress> — Calls v2 média WebRTC P2P (Talk2Me #418).
 *
 * Pascal 2026-06-05. Affiché après 'call:accepted'. Doctrine
 * [[talk2me-calls-architecture]] : 1-to-1 = WebRTC P2P direct.
 *
 * Le rôle de l'appelant : génère l'offer.
 * Le rôle de l'appelé : attend l'offer puis génère l'answer.
 * SDP/ICE transitent via POST /api/calls/[id]/webrtc → SSE 'call:webrtc'.
 *
 * Doctrine [[talk2me-audio-anti-echo]] : echoCancellation+noiseSuppression+
 * autoGainControl OBLIGATOIRES sur getUserMedia.
 *
 * Pas de SFU mediasoup ici (1-to-1 → P2P direct, plus simple, moins de
 * latence, pas de coût serveur). SFU réservé aux groupes (#403).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2 } from 'lucide-react';
import { DEFAULT_ICE_SERVERS, getIceServers, formatCallDuration } from '@/lib/webrtc-helpers';
import { playHangupBeep, stopAll } from '@/lib/calls/sounds';

interface Peer {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
}

interface Props {
  callId: string;
  peer: Peer;
  kind: 'audio' | 'video';
  /** 'caller' = je dois envoyer l'offer ; 'callee' = j'attends l'offer. */
  myRole: 'caller' | 'callee';
  /** Appelé quand l'appel se termine (raccrochage local ou distant). */
  onClosed: (callId: string) => void;
}

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

export default function CallInProgress({ callId, peer, kind, myRole, onClosed }: Props) {
  const [phase, setPhase] = useState<'connecting' | 'active' | 'ending'>('connecting');
  const [activeSince, setActiveSince] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteSetRef = useRef(false);
  // ICE réels (STUN+TURN) préchargés au montage ; fallback STUN si /api/turn KO.
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  useEffect(() => { getIceServers().then((s) => { iceServersRef.current = s; }).catch(() => {}); }, []);
  const closedRef = useRef(false);
  const sseRef = useRef<EventSource | null>(null);

  const peerLabel = peer.display_name || `@${peer.username}`;
  const gradient = gradientFromSeed(peer.id);
  const isVideo = kind === 'video';

  // ───── Timer affichage durée ─────
  useEffect(() => {
    if (phase !== 'active' || activeSince === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase, activeSince]);

  // ───── Helpers signaling ─────
  const post = useCallback(
    async (type: 'offer' | 'answer' | 'ice' | 'end_of_candidates', payload: unknown) => {
      try {
        await fetch(`/api/calls/${encodeURIComponent(callId)}/webrtc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, payload }),
        });
      } catch (e) {
        console.error('[call] post webrtc', type, e);
      }
    },
    [callId]
  );

  const flushPendingIce = useCallback(async () => {
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
  }, []);

  const teardown = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    stopAll();
  }, []);

  const doHangup = useCallback(async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    teardown();
    playHangupBeep();
    setPhase('ending');
    try {
      await fetch(`/api/calls/${encodeURIComponent(callId)}/hangup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {
      /* ignore */
    }
    setTimeout(() => onClosed(callId), 400);
  }, [callId, onClosed, teardown]);

  // ───── Build PC + getUserMedia + offer/answer ─────
  useEffect(() => {
    closedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        // Anti-écho : doctrine [[talk2me-audio-anti-echo]] obligatoire.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: isVideo ? { facingMode: 'user' } : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (isVideo && localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
        pcRef.current = pc;

        pc.onicecandidate = (evt) => {
          if (evt.candidate) {
            void post('ice', evt.candidate.toJSON());
          } else {
            void post('end_of_candidates', null);
          }
        };
        pc.ontrack = (evt) => {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          remoteStreamRef.current.addTrack(evt.track);
          if (evt.track.kind === 'video' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamRef.current;
          }
          if (evt.track.kind === 'audio' && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStreamRef.current;
          }
          if (!activeSince) {
            setActiveSince(Date.now());
            setPhase('active');
          }
        };
        pc.onconnectionstatechange = () => {
          const st = pc.connectionState;
          if (st === 'connected') {
            if (!activeSince) setActiveSince(Date.now());
            setPhase('active');
          }
          if (st === 'failed') {
            setErr('Connexion échouée');
            void doHangup();
          }
        };

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        if (myRole === 'caller') {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: isVideo,
          });
          await pc.setLocalDescription(offer);
          await post('offer', { type: offer.type, sdp: offer.sdp });
        }
        // myRole === 'callee' : on attend 'offer' via SSE.
      } catch (e) {
        console.error('[call] init', e);
        setErr("Permission micro/caméra refusée");
        void doHangup();
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, kind, myRole]);

  // ───── Re-sync vidéos après re-render ─────
  useEffect(() => {
    if (!isVideo) return;
    if (localVideoRef.current && localStreamRef.current && !localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (
      remoteVideoRef.current &&
      remoteStreamRef.current &&
      !remoteVideoRef.current.srcObject
    ) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (
      remoteAudioRef.current &&
      remoteStreamRef.current &&
      !remoteAudioRef.current.srcObject
    ) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  });

  // ───── SSE listener pour les events webrtc + hangup distant ─────
  useEffect(() => {
    const es = new EventSource('/api/me/events');
    sseRef.current = es;

    es.addEventListener('call:webrtc', async (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as {
          call_id?: string;
          type?: string;
          payload?: unknown;
        };
        if (data.call_id !== callId) return;
        const pc = pcRef.current;
        if (!pc) return;

        if (data.type === 'offer' && myRole === 'callee') {
          const offer = data.payload as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          remoteSetRef.current = true;
          await flushPendingIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await post('answer', { type: answer.type, sdp: answer.sdp });
          return;
        }
        if (data.type === 'answer' && myRole === 'caller') {
          const answer = data.payload as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          remoteSetRef.current = true;
          await flushPendingIce();
          return;
        }
        if (data.type === 'ice') {
          const c = data.payload as RTCIceCandidateInit | null;
          if (!c) return;
          if (remoteSetRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (e) {
              console.warn('[call] addIceCandidate', e);
            }
          } else {
            pendingIceRef.current.push(c);
          }
        }
      } catch (e) {
        console.error('[call] webrtc evt', e);
      }
    });

    es.addEventListener('call:hangup', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as { call_id?: string };
        if (data.call_id !== callId) return;
        if (closedRef.current) return;
        closedRef.current = true;
        teardown();
        playHangupBeep();
        setPhase('ending');
        setTimeout(() => onClosed(callId), 400);
      } catch {
        /* ignore */
      }
    });

    return () => {
      es.close();
      sseRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, myRole]);

  // ───── Toggles ─────
  const toggleMic = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !micMuted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMicMuted(next);
  };
  const toggleCam = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camOff;
    s.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCamOff(next);
  };

  const durationMs = activeSince ? Date.now() - activeSince : 0;

  return (
    <div
      className="fixed inset-0 z-[200] bg-[#0a0a0d] text-white flex flex-col"
      data-testid="call-in-progress"
    >
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {isVideo && phase === 'active' ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a22] via-[#0e0e12] to-[#0a0a0d]" />
      )}

      {isVideo && phase === 'active' && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-4 right-4 w-28 h-40 sm:w-32 sm:h-44 rounded-2xl object-cover border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] bg-black z-10"
        />
      )}

      <div className="relative z-10 flex flex-col items-center pt-16 px-6">
        {(!isVideo || phase !== 'active') &&
          (peer.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={peer.avatar_url}
              alt=""
              className="w-32 h-32 rounded-full object-cover shadow-[0_8px_32px_rgba(0,0,0,0.4)] mb-5"
            />
          ) : (
            <div
              className="w-32 h-32 rounded-full flex items-center justify-center text-white text-4xl font-medium shadow-[0_8px_32px_rgba(0,0,0,0.4)] mb-5"
              style={{ background: gradient }}
              aria-hidden="true"
            >
              {initialsOf(peer.display_name, peer.username)}
            </div>
          ))}
        <div className="text-center">
          <div className="text-[22px] font-medium tracking-tight">{peerLabel}</div>
          <div className="text-[13px] text-white/60 mt-1">
            {phase === 'connecting' && 'Connexion…'}
            {phase === 'active' && formatCallDuration(durationMs)}
            {phase === 'ending' && 'Appel terminé'}
          </div>
          {err && <div className="mt-2 text-[12px] text-rose-300">{err}</div>}
        </div>
      </div>

      <div className="flex-1" />

      <div className="relative z-10 pb-10 pt-4 px-6">
        <div className="flex items-center justify-around max-w-sm mx-auto">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={micMuted ? 'Activer micro' : 'Couper micro'}
            data-testid="call-toggle-mic"
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${micMuted ? 'bg-white/90 text-black hover:bg-white' : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'}`}
          >
            {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          {isVideo ? (
            <button
              type="button"
              onClick={toggleCam}
              aria-label={camOff ? 'Activer caméra' : 'Couper caméra'}
              data-testid="call-toggle-cam"
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${camOff ? 'bg-white/90 text-black hover:bg-white' : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'}`}
            >
              {camOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSpeakerOn((v) => !v)}
              aria-label={speakerOn ? 'Désactiver haut-parleur' : 'Activer haut-parleur'}
              data-testid="call-toggle-speaker"
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${speakerOn ? 'bg-white/90 text-black hover:bg-white' : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'}`}
            >
              <Volume2 size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={() => void doHangup()}
            aria-label="Raccrocher"
            data-testid="call-hangup"
            className="w-14 h-14 rounded-full bg-rose-500 hover:bg-rose-400 text-white shadow-[0_4px_16px_rgba(244,63,94,0.35)] flex items-center justify-center active:scale-95 transition-transform"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
