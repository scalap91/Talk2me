/**
 * GET /api/presence/events  (SSE)
 *
 * Pour chaque ami de l'user courant, on subscribe au canal `presence:{friendId}`.
 * Quand cet ami POST heartbeat, on relaie l'event au client.
 *
 * En plus : on envoie un snapshot initial des amis online (last_seen < 5min)
 * pour rendu immédiat des dots verts.
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listFriends, getOnlineFriends, getPresences } from '@/lib/db';
import { subscribe, type WatchEvent } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });

  const friends = listFriends(me.id);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (kind: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // closed
        }
      };
      // Snapshot initial
      const online = getOnlineFriends(me.id);
      const presences = getPresences(friends.map((f) => f.id));
      send('snapshot', {
        friends: friends.map((f) => ({
          id: f.id,
          username: f.username,
          display_name: f.display_name,
          presence: presences[f.id] || null,
        })),
        online_ids: online.map((o) => o.id),
      });

      // Subscribe au canal de chaque ami
      const unsubs: Array<() => void> = [];
      for (const friend of friends) {
        const channel = `presence:${friend.id}`;
        const unsub = subscribe(channel, (evt: WatchEvent) => {
          send('presence', evt.data);
        });
        unsubs.push(unsub);
      }

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          // ignore
        }
      }, 25000);

      const abort = () => {
        clearInterval(ping);
        for (const u of unsubs) u();
        try {
          controller.close();
        } catch {
          // already closed
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
