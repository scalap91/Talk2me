/**
 * GET /api/me/events — SSE stream USER-SCOPED (Talk2Me #418).
 *
 * Canal `user:{userId}` du realtime-bus. Reçoit tous les events ciblés sur
 * l'utilisateur courant. Aujourd'hui : Calls v2 (call:incoming/ring_beat/
 * accepted/busy/hangup/webrtc). Demain : notifs friend requests, etc.
 *
 * Séparé du SSE conv-scoped (/api/conversations/[id]/events) parce qu'un
 * call:incoming peut survenir SANS conv ouverte (user sur Home/Messages).
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { subscribe, type WatchEvent } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) {
    return new Response('unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  const channel = `user:${me.id}`;

  const stream = new ReadableStream({
    start(controller) {
      const send = (evt: WatchEvent) => {
        try {
          const payload = `event: ${evt.kind}\ndata: ${JSON.stringify(evt.data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          /* stream fermé */
        }
      };
      controller.enqueue(
        encoder.encode(`event: hello\ndata: ${JSON.stringify({ user: me.id })}\n\n`)
      );
      const unsub = subscribe(channel, send);

      // Heartbeat 25s pour proxys.
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          /* ignore */
        }
      }, 25000);

      const abort = () => {
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener('abort', abort);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
