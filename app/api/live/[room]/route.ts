/**
 * Talk2Me — /api/live/[room]  (Pascal 2026-06-14)
 * Signalisation WebRTC P2P pour le LIVE dans la pièce 3D (1 diffuseur → N spectateurs).
 * room = id du USER propriétaire de la salle. Canal bus = `live:<room>`.
 *
 *  - GET                 → SSE : reçoit les messages de signalisation (offer/answer/ice/join/end)
 *  - GET ?status=1       → { live: bool } (un diffuseur est-il en direct dans cette salle ?)
 *  - POST {kind,data,to,from} → publie un message de signalisation sur le canal
 *      kind 'announce' → marque la salle EN DIRECT ; 'end' → arrête.
 *
 * MVP P2P (STUN public, pas de TURN → peut échouer sur NAT symétrique). Mémoire only.
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { subscribe, publish, type WatchEvent } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function liveSet(): Map<string, number> {
  const g = globalThis as unknown as { __t2mLiveRooms?: Map<string, number> };
  if (!g.__t2mLiveRooms) g.__t2mLiveRooms = new Map();
  return g.__t2mLiveRooms;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });
  const { room } = await ctx.params;

  if (new URL(request.url).searchParams.get('status') === '1') {
    return Response.json({ live: liveSet().has(room) });
  }

  const encoder = new TextEncoder();
  const channel = `live:${room}`;
  const stream = new ReadableStream({
    start(controller) {
      const send = (evt: WatchEvent) => {
        try { controller.enqueue(encoder.encode(`event: ${evt.kind}\ndata: ${JSON.stringify(evt.data)}\n\n`)); } catch { /* */ }
      };
      controller.enqueue(encoder.encode(`event: hello\ndata: ${JSON.stringify({ room, live: liveSet().has(room) })}\n\n`));
      const unsub = subscribe(channel, send);
      const ping = setInterval(() => { try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { /* */ } }, 25000);
      const close = () => { clearInterval(ping); unsub(); try { controller.close(); } catch { /* */ } };
      request.signal.addEventListener('abort', close);
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });
  const { room } = await ctx.params;
  let body: { kind?: string; data?: unknown };
  try { body = await request.json(); } catch { return new Response('bad', { status: 400 }); }
  const kind = body.kind || '';
  if (kind === 'announce') liveSet().set(room, Date.now());
  else if (kind === 'end') liveSet().delete(room);
  // relai brut : tous les abonnés du canal reçoivent ; le client filtre par `to`
  publish(`live:${room}`, { kind: 'call:webrtc', data: { sig: kind, ...(body.data as object || {}) } });
  return Response.json({ ok: true });
}
