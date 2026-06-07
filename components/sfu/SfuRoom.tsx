'use client';

/**
 * <SfuRoom> — Composant React orchestrant la session SFU mediasoup d'un user
 * dans une Watch Together activity (groupe).
 *
 * Talk2Me #403 (Pascal 2026-06-05) — "DEMAIN JE CREE UN GROUPE TALK2ME ET ON
 * REGARDE TOUS LE FILM BRO".
 *
 * Responsabilités :
 *   1. getUserMedia avec anti-écho (doctrine [[talk2me-audio-anti-echo]])
 *   2. sfuJoin → device.load → create send+recv transports
 *   3. produce audio + video → expose track local pour preview
 *   4. consume tous les producers existants + ceux qui arrivent via SSE
 *   5. Grille jusqu'à 10 participants (MVP)
 *
 * Doctrine [[talk2me-watch-together-passthrough]] : on ne capture QUE
 * mic + cam, jamais display/tab/yt iframe.
 *
 * SSE : on écoute le canal conv:{convId} existant, on filtre les events
 * activity_state qui contiennent sfu_new_producer / sfu_peer_left.
 *
 * Limites MVP honnêtes :
 *   - pas de simulcast (toujours 1 layer VP8)
 *   - pas de bandwidth adaptive
 *   - pas de mute UI buttons (Pascal validera après E2E)
 *   - max 10 participants visuels (mosaïque 2x5 mobile)
 *   - pas de reconnect si transport DTLS down (page reload pour récupérer)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Device, Producer } from '@/lib/sfu/client';
import {
  sfuJoin,
  sfuCreateTransport,
  sfuConnectTransport,
  sfuProduce,
  sfuConsume,
  sfuResumeConsumer,
  sfuLeave,
  sfuListProducers,
  createDevice,
  getMicCamStream,
} from '@/lib/sfu/client';
import type { Transport, Consumer } from 'mediasoup-client/types';

interface SfuRoomProps {
  activityId: string;
  convId: string;
  /** id de l'user courant (pour skip ses propres producers). */
  meId: string;
  /** false = audio only call ; true = audio + cam. Défaut true. */
  withVideo?: boolean;
  /** Appelé quand la session est cleanly fermée (leave / unmount). */
  onClose?: () => void;
}

interface RemoteTrack {
  consumerId: string;
  producerId: string;
  userId: string;
  kind: 'audio' | 'video';
  stream: MediaStream;
}

export function SfuRoom({
  activityId,
  convId,
  meId,
  withVideo = true,
  onClose,
}: SfuRoomProps) {
  const [status, setStatus] = useState<'idle' | 'joining' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Refs pour survivre aux re-renders sans relancer l'init
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const videoProducerRef = useRef<Producer | null>(null);
  const consumersRef = useRef<Map<string, Consumer>>(new Map());
  const closedRef = useRef(false);

  // ────────────────────────────────────────────────────────────────────
  // Consume un producer remote (avec resume après attach)
  // ────────────────────────────────────────────────────────────────────
  const consumeProducer = useCallback(
    async (producerId: string, userId: string) => {
      if (closedRef.current) return;
      if (userId === meId) return; // skip self
      const device = deviceRef.current;
      const recvTransport = recvTransportRef.current;
      if (!device || !recvTransport) return;

      // dédup : si déjà un consumer pour ce producer, skip
      for (const c of consumersRef.current.values()) {
        if (c.producerId === producerId) return;
      }

      try {
        const consumerParams = await sfuConsume(
          activityId,
          recvTransport.id,
          producerId,
          device.rtpCapabilities
        );
        const consumer = await recvTransport.consume({
          id: consumerParams.id,
          producerId: consumerParams.producerId,
          kind: consumerParams.kind,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rtpParameters: consumerParams.rtpParameters as any,
        });
        consumersRef.current.set(consumer.id, consumer);

        const stream = new MediaStream([consumer.track]);
        const remote: RemoteTrack = {
          consumerId: consumer.id,
          producerId: consumer.producerId,
          userId,
          kind: consumer.kind as 'audio' | 'video',
          stream,
        };
        setRemoteTracks((prev) => [...prev, remote]);

        // resume côté serveur (consumer créé paused)
        await sfuResumeConsumer(activityId, consumer.id);

        consumer.on('trackended', () => {
          consumersRef.current.delete(consumer.id);
          setRemoteTracks((prev) => prev.filter((r) => r.consumerId !== consumer.id));
        });
      } catch (e) {
        console.error('[sfu] consumeProducer failed', producerId, e);
      }
    },
    [activityId, meId]
  );

  // ────────────────────────────────────────────────────────────────────
  // Init complet : getUM → join → device → transports → produce → consume
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    closedRef.current = false;

    (async () => {
      try {
        setStatus('joining');

        // 1. join + récupère routerRtpCapabilities + existing producers
        const joinRes = await sfuJoin(activityId);
        if (cancelled) return;

        // 2. device
        const device = await createDevice(joinRes.routerRtpCapabilities);
        if (cancelled) return;
        deviceRef.current = device;

        // 3. send transport
        const sendParams = await sfuCreateTransport(activityId, 'send');
        const sendTransport = device.createSendTransport({
          id: sendParams.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iceParameters: sendParams.iceParameters as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iceCandidates: sendParams.iceCandidates as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dtlsParameters: sendParams.dtlsParameters as any,
        });
        sendTransportRef.current = sendTransport;

        sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          sfuConnectTransport(activityId, sendTransport.id, dtlsParameters)
            .then(callback)
            .catch(errback);
        });
        sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
          sfuProduce(activityId, sendTransport.id, kind as 'audio' | 'video', rtpParameters)
            .then((id) => callback({ id }))
            .catch(errback);
        });

        // 4. recv transport
        const recvParams = await sfuCreateTransport(activityId, 'recv');
        const recvTransport = device.createRecvTransport({
          id: recvParams.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iceParameters: recvParams.iceParameters as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iceCandidates: recvParams.iceCandidates as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dtlsParameters: recvParams.dtlsParameters as any,
        });
        recvTransportRef.current = recvTransport;

        recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          sfuConnectTransport(activityId, recvTransport.id, dtlsParameters)
            .then(callback)
            .catch(errback);
        });

        // 5. getUserMedia + produce
        const stream = await getMicCamStream({ video: withVideo });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current && withVideo) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true; // anti-écho local OBLIGATOIRE
          localVideoRef.current.play().catch(() => {});
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && device.canProduce('audio')) {
          audioProducerRef.current = await sendTransport.produce({ track: audioTrack });
        }
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && withVideo && device.canProduce('video')) {
          videoProducerRef.current = await sendTransport.produce({ track: videoTrack });
        }

        // 6. consume tous les existing producers
        for (const p of joinRes.existingProducers) {
          await consumeProducer(p.producerId, p.userId);
        }

        if (!cancelled) setStatus('connected');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[sfu] init failed', e);
        setErrorMsg(msg);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      closedRef.current = true;
      // cleanup
      try {
        audioProducerRef.current?.close();
        videoProducerRef.current?.close();
        sendTransportRef.current?.close();
        recvTransportRef.current?.close();
        for (const c of consumersRef.current.values()) {
          try {
            c.close();
          } catch {
            /* ignore */
          }
        }
        consumersRef.current.clear();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      } catch (e) {
        console.warn('[sfu] cleanup error', e);
      }
      void sfuLeave(activityId);
      onClose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  // ────────────────────────────────────────────────────────────────────
  // SSE listener : nouveaux producers + departs
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!convId) return;
    const es = new EventSource(`/api/conversations/${convId}/events`);
    es.addEventListener('activity_state', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        // Nouveau producer arrivé
        const np = data?.sfu_new_producer;
        if (np && np.user_id !== meId && data.activity_id === activityId) {
          void consumeProducer(np.producer_id, np.user_id);
        }
        // Peer parti → retirer ses tracks
        const left = data?.sfu_peer_left;
        if (left && data.activity_id === activityId) {
          setRemoteTracks((prev) => prev.filter((r) => r.userId !== left.user_id));
        }
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('activity_end', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data?.activity_id === activityId) {
          // session terminée upstream — onClose nettoiera
          onClose?.();
        }
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      // reconnect auto par EventSource ; on tente un re-list au reconnect
      sfuListProducers(activityId)
        .then((list) => {
          for (const p of list) {
            if (p.userId !== meId) void consumeProducer(p.producerId, p.userId);
          }
        })
        .catch(() => {});
    };
    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, activityId, meId]);

  // ────────────────────────────────────────────────────────────────────
  // UI : grille mosaïque (mobile-first)
  // ────────────────────────────────────────────────────────────────────
  const videoTracks = remoteTracks.filter((r) => r.kind === 'video');
  const audioTracks = remoteTracks.filter((r) => r.kind === 'audio');

  return (
    <div className="w-full h-full flex flex-col bg-black text-white">
      {status === 'error' && (
        <div className="p-3 bg-red-900 text-sm">SFU error : {errorMsg}</div>
      )}
      {status === 'joining' && (
        <div className="p-3 bg-gray-800 text-sm">Connexion à la salle…</div>
      )}

      {/* Audio: invisible, autoplay forcé. Crée 1 <audio> par track audio remote. */}
      {audioTracks.map((t) => (
        <audio
          key={t.consumerId}
          ref={(el) => {
            if (el && el.srcObject !== t.stream) {
              el.srcObject = t.stream;
              el.autoplay = true;
              el.play().catch(() => {});
            }
          }}
        />
      ))}

      {/* Vidéo : grille 2 colonnes mobile (jusqu'à 10 peers MVP) */}
      <div className="flex-1 grid grid-cols-2 gap-1 p-1 overflow-auto">
        {/* Local */}
        {withVideo && (
          <div className="relative aspect-video bg-gray-900 rounded overflow-hidden">
            <video
              ref={localVideoRef}
              muted
              playsInline
              autoPlay
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1 left-1 text-xs px-2 py-0.5 bg-black/60 rounded">
              Moi
            </div>
          </div>
        )}
        {videoTracks.slice(0, 9).map((t) => (
          <div
            key={t.consumerId}
            className="relative aspect-video bg-gray-900 rounded overflow-hidden"
          >
            <video
              ref={(el) => {
                if (el && el.srcObject !== t.stream) {
                  el.srcObject = t.stream;
                  el.autoplay = true;
                  el.playsInline = true;
                  el.play().catch(() => {});
                }
              }}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1 left-1 text-xs px-2 py-0.5 bg-black/60 rounded">
              {t.userId.slice(0, 6)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
