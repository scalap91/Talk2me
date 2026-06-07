/**
 * SFU mediasoup — Client helpers (browser).
 *
 * Talk2Me #403 — Wrapper haut niveau autour de mediasoup-client + fetch
 * vers les routes /api/sfu/*. Pas de WebSocket : signaling sur HTTP POST,
 * notifications de nouveaux producers via le canal SSE existant
 * (subscribed dans <SfuRoom>).
 *
 * Doctrine [[talk2me-audio-anti-echo]] : echoCancellation + noiseSuppression
 * + autoGainControl OBLIGATOIRES sur tout getUserMedia (helper getMicCamStream).
 *
 * Doctrine [[talk2me-watch-together-passthrough]] : seul l'audio+cam du
 * participant est envoyé au SFU. JAMAIS de capture display/tab/yt iframe.
 */

import * as mediasoupClient from 'mediasoup-client';
import type {
  Device,
  Transport,
  Producer,
  Consumer,
  RtpCapabilities,
} from 'mediasoup-client/types';

// ──────────────────────────────────────────────────────────────────────────
// Signaling — fetch helpers
// ──────────────────────────────────────────────────────────────────────────

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error || j?.detail || '';
    } catch {
      /* ignore */
    }
    throw new Error(`sfu ${url} → ${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

export interface JoinResponse {
  ok: true;
  routerRtpCapabilities: RtpCapabilities;
  peerId: string;
  existingProducers: Array<{ producerId: string; userId: string; kind: 'audio' | 'video' }>;
}

interface TransportParams {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown;
  dtlsParameters: unknown;
}

export async function sfuJoin(activityId: string): Promise<JoinResponse> {
  return postJson<JoinResponse>('/api/sfu/join', { activity_id: activityId });
}

export async function sfuCreateTransport(
  activityId: string,
  direction: 'send' | 'recv'
): Promise<TransportParams> {
  const j = await postJson<{ ok: true; transport: TransportParams }>(
    '/api/sfu/transport/create',
    { activity_id: activityId, direction }
  );
  return j.transport;
}

export async function sfuConnectTransport(
  activityId: string,
  transportId: string,
  dtlsParameters: unknown
): Promise<void> {
  await postJson('/api/sfu/transport/connect', {
    activity_id: activityId,
    transport_id: transportId,
    dtlsParameters,
  });
}

export async function sfuProduce(
  activityId: string,
  transportId: string,
  kind: 'audio' | 'video',
  rtpParameters: unknown
): Promise<string> {
  const j = await postJson<{ ok: true; producer_id: string }>('/api/sfu/produce', {
    activity_id: activityId,
    transport_id: transportId,
    kind,
    rtpParameters,
  });
  return j.producer_id;
}

export interface ConsumeResponse {
  ok: true;
  consumer: {
    id: string;
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: unknown;
  };
}

export async function sfuConsume(
  activityId: string,
  transportId: string,
  producerId: string,
  rtpCapabilities: RtpCapabilities
): Promise<ConsumeResponse['consumer']> {
  const j = await postJson<ConsumeResponse>('/api/sfu/consume', {
    activity_id: activityId,
    transport_id: transportId,
    producer_id: producerId,
    rtpCapabilities,
  });
  return j.consumer;
}

export async function sfuResumeConsumer(activityId: string, consumerId: string): Promise<void> {
  await postJson('/api/sfu/consume/resume', {
    activity_id: activityId,
    consumer_id: consumerId,
  });
}

export async function sfuLeave(activityId: string): Promise<void> {
  // Best-effort — pas de throw si le serveur est down (page closing).
  try {
    await postJson('/api/sfu/leave', { activity_id: activityId });
  } catch {
    /* ignore */
  }
}

export async function sfuListProducers(
  activityId: string
): Promise<Array<{ producerId: string; userId: string; kind: 'audio' | 'video' }>> {
  const res = await fetch(`/api/sfu/producers?activity_id=${encodeURIComponent(activityId)}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { ok: boolean; producers?: Array<{ producerId: string; userId: string; kind: 'audio' | 'video' }> };
  return j.producers || [];
}

// ──────────────────────────────────────────────────────────────────────────
// getUserMedia avec anti-écho FORCÉ
// ──────────────────────────────────────────────────────────────────────────

/**
 * Capture micro + (optionnel) cam avec les contraintes anti-écho.
 * Doctrine [[talk2me-audio-anti-echo]] :
 *   echoCancellation + noiseSuppression + autoGainControl SYSTÉMATIQUES.
 */
export async function getMicCamStream(opts: {
  video: boolean;
  facingMode?: 'user' | 'environment';
}): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('mediaDevices indisponible (HTTPS requis)');
  }
  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: opts.video
      ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: opts.facingMode || 'user',
        }
      : false,
  };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    const name = (e as DOMException | undefined)?.name;
    // Fallback : si facingMode rejeté (desktop), retente sans contrainte vidéo précise.
    if (
      opts.video &&
      (name === 'OverconstrainedError' ||
        name === 'ConstraintNotSatisfiedError' ||
        name === 'NotFoundError')
    ) {
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: true,
      });
    }
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Device wrapper
// ──────────────────────────────────────────────────────────────────────────

/**
 * Crée + load un Device mediasoup-client à partir des routerRtpCapabilities
 * reçues du serveur. Renvoie aussi les transports send + recv prêts à
 * produce/consume.
 *
 * Le caller branche les events 'connect' / 'produce' qui appellent le
 * signaling HTTP pour finaliser le handshake.
 */
export async function createDevice(
  routerRtpCapabilities: RtpCapabilities
): Promise<Device> {
  const device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities });
  return device;
}

export type { Device, Transport, Producer, Consumer };
