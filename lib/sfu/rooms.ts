/**
 * SFU mediasoup — Rooms (sessions par activity_id).
 *
 * Une Room = un Router mediasoup + une map de Peers (un Peer = un user
 * connecté avec ses transports/producers/consumers). Stockée en mémoire
 * serveur, indexée par activity_id. Cleanup auto quand l'activity termine
 * ou quand tous les peers partent.
 *
 * Doctrine [[modular-no-scattered-patches]] : tout le state SFU vit ici,
 * les routes API n'ont qu'à appeler les helpers exportés.
 */
import 'server-only';

import type {
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  RtpParameters,
  MediaKind,
  DtlsParameters,
} from 'mediasoup/types';
import { createRouter, WEBRTC_TRANSPORT_OPTIONS } from './worker';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface SfuPeer {
  userId: string;
  /** Joined-at ts ms — utile pour debug + timeout idle futur. */
  joinedAt: number;
  /** transports indexés par id. */
  transports: Map<string, WebRtcTransport>;
  /** producers indexés par id (audio + video du peer). */
  producers: Map<string, Producer>;
  /** consumers indexés par id (1 consumer = 1 producer remote consommé). */
  consumers: Map<string, Consumer>;
}

interface SfuRoom {
  activityId: string;
  router: Router;
  peers: Map<string, SfuPeer>;
  createdAt: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Singleton store (globalThis pour HMR + multi-import)
// ──────────────────────────────────────────────────────────────────────────

interface SfuRoomsGlobal {
  __t2m_sfu_rooms?: Map<string, SfuRoom>;
  __t2m_sfu_room_promises?: Map<string, Promise<SfuRoom>>;
}

function g(): SfuRoomsGlobal {
  return globalThis as unknown as SfuRoomsGlobal;
}

function getStore(): Map<string, SfuRoom> {
  const gl = g();
  if (!gl.__t2m_sfu_rooms) gl.__t2m_sfu_rooms = new Map();
  return gl.__t2m_sfu_rooms;
}

function getPromiseStore(): Map<string, Promise<SfuRoom>> {
  const gl = g();
  if (!gl.__t2m_sfu_room_promises) gl.__t2m_sfu_room_promises = new Map();
  return gl.__t2m_sfu_room_promises;
}

// ──────────────────────────────────────────────────────────────────────────
// Rooms lifecycle
// ──────────────────────────────────────────────────────────────────────────

/**
 * Récupère ou crée la Room pour une activity_id donnée. Idempotent.
 * Protégé contre les races (deux sfu_join concurrents → un seul Router).
 */
export async function getOrCreateRoom(activityId: string): Promise<SfuRoom> {
  const store = getStore();
  const existing = store.get(activityId);
  if (existing) return existing;

  const promises = getPromiseStore();
  const pending = promises.get(activityId);
  if (pending) return pending;

  const p = (async () => {
    const router = await createRouter();
    const room: SfuRoom = {
      activityId,
      router,
      peers: new Map(),
      createdAt: Date.now(),
    };
    store.set(activityId, room);
    promises.delete(activityId);
    console.log(`[sfu] room created activity=${activityId}`);
    return room;
  })();
  promises.set(activityId, p);
  return p;
}

export function getRoom(activityId: string): SfuRoom | null {
  return getStore().get(activityId) ?? null;
}

/**
 * Ferme une Room complètement (router + tous transports). Appelé quand
 * l'activity se termine (endActivity côté route) ou par cleanup interne
 * quand 0 peer restant.
 */
export function closeRoom(activityId: string): void {
  const store = getStore();
  const room = store.get(activityId);
  if (!room) return;
  try {
    room.router.close();
  } catch (e) {
    console.error('[sfu] router.close error', e);
  }
  store.delete(activityId);
  console.log(`[sfu] room closed activity=${activityId}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Peers
// ──────────────────────────────────────────────────────────────────────────

/** Récupère ou crée un Peer dans une Room. */
export function getOrCreatePeer(room: SfuRoom, userId: string): SfuPeer {
  const existing = room.peers.get(userId);
  if (existing) return existing;
  const peer: SfuPeer = {
    userId,
    joinedAt: Date.now(),
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  };
  room.peers.set(userId, peer);
  return peer;
}

/** Retire un peer de la room + close tous ses transports. */
export function removePeer(activityId: string, userId: string): void {
  const room = getRoom(activityId);
  if (!room) return;
  const peer = room.peers.get(userId);
  if (!peer) return;
  for (const t of peer.transports.values()) {
    try {
      t.close();
    } catch {
      /* ignore */
    }
  }
  room.peers.delete(userId);
  console.log(`[sfu] peer left activity=${activityId} user=${userId} (${room.peers.size} remain)`);
  // Cleanup room si plus personne
  if (room.peers.size === 0) {
    closeRoom(activityId);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Transports / Producers / Consumers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Crée un WebRtcTransport pour un peer.
 * direction = 'send' ou 'recv' (juste pour log/debug, mediasoup n'en a pas
 * besoin techniquement, c'est l'usage via produce/consume qui détermine).
 */
export async function createWebRtcTransport(
  room: SfuRoom,
  peer: SfuPeer,
  direction: 'send' | 'recv'
): Promise<{
  id: string;
  iceParameters: WebRtcTransport['iceParameters'];
  iceCandidates: WebRtcTransport['iceCandidates'];
  dtlsParameters: WebRtcTransport['dtlsParameters'];
}> {
  const transport = await room.router.createWebRtcTransport(WEBRTC_TRANSPORT_OPTIONS);
  peer.transports.set(transport.id, transport);

  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed') {
      peer.transports.delete(transport.id);
    }
  });
  transport.on('@close', () => {
    peer.transports.delete(transport.id);
  });

  console.log(
    `[sfu] transport created room=${room.activityId} user=${peer.userId} dir=${direction} id=${transport.id}`
  );

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

export async function connectTransport(
  peer: SfuPeer,
  transportId: string,
  dtlsParameters: DtlsParameters
): Promise<void> {
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error('transport_not_found');
  await transport.connect({ dtlsParameters });
}

export async function produce(
  room: SfuRoom,
  peer: SfuPeer,
  transportId: string,
  kind: MediaKind,
  rtpParameters: RtpParameters
): Promise<Producer> {
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error('transport_not_found');
  const producer = await transport.produce({ kind, rtpParameters });
  peer.producers.set(producer.id, producer);
  producer.on('@close', () => {
    peer.producers.delete(producer.id);
  });
  console.log(
    `[sfu] produce room=${room.activityId} user=${peer.userId} kind=${kind} producer=${producer.id}`
  );
  return producer;
}

export async function consume(
  room: SfuRoom,
  peer: SfuPeer,
  transportId: string,
  producerId: string,
  rtpCapabilities: RtpCapabilities
): Promise<{
  id: string;
  producerId: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
}> {
  const transport = peer.transports.get(transportId);
  if (!transport) throw new Error('transport_not_found');
  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error('cannot_consume');
  }
  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: true, // resume manuel client après recv attach
  });
  peer.consumers.set(consumer.id, consumer);
  consumer.on('@close', () => {
    peer.consumers.delete(consumer.id);
  });
  consumer.on('producerclose', () => {
    peer.consumers.delete(consumer.id);
  });
  return {
    id: consumer.id,
    producerId: consumer.producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

export async function resumeConsumer(peer: SfuPeer, consumerId: string): Promise<void> {
  const consumer = peer.consumers.get(consumerId);
  if (!consumer) throw new Error('consumer_not_found');
  await consumer.resume();
}

/**
 * Liste tous les producers existants dans la room (sauf ceux du peer demandeur).
 * Le client appelle ça après sfu_join pour consume tout ce qui est déjà en cours.
 */
export function listRemoteProducers(
  room: SfuRoom,
  excludeUserId: string
): Array<{ producerId: string; userId: string; kind: MediaKind }> {
  const out: Array<{ producerId: string; userId: string; kind: MediaKind }> = [];
  for (const [uid, peer] of room.peers) {
    if (uid === excludeUserId) continue;
    for (const producer of peer.producers.values()) {
      out.push({ producerId: producer.id, userId: uid, kind: producer.kind });
    }
  }
  return out;
}
