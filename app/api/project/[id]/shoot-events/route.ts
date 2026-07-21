/**
 * GET /api/project/[id]/shoot-events?shot=<shotId>  (Server-Sent Events)
 *
 * Canal temps réel de la SALLE DE TOURNAGE multicaméra (VS4b) : `shoot:<projet>:<plan>`.
 * Diffuse les signaux du réalisateur (action / cut / join / leave) à toutes les cams connectées.
 * ISOLÉ : canal dédié, ne touche PAS la SSE des conversations/appels. Le QR/id = le droit d'accès
 * (tout user authentifié + flag). Aucune PII (les events ne portent que des ids opaques).
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { subscribe, type WatchEvent } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

export async function GET(request: NextRequest, ctx: Params) {
  if (flagOff()) return new Response('disabled', { status: 404 });
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });
  const { id } = await ctx.params;
  const shot = request.nextUrl.searchParams.get('shot') || '';
  if (!shot) return new Response('shot_required', { status: 400 });

  const encoder = new TextEncoder();
  const channel = `shoot:${id}:${shot}`;

  const stream = new ReadableStream({
    start(controller) {
      const send = (evt: WatchEvent) => {
        try { controller.enqueue(encoder.encode(`event: ${evt.kind}\ndata: ${JSON.stringify(evt.data)}\n\n`)); } catch { /* fermé */ }
      };
      controller.enqueue(encoder.encode(`event: hello\ndata: ${JSON.stringify({ room: channel })}\n\n`));
      const unsub = subscribe(channel, send);
      const ping = setInterval(() => { try { controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)); } catch { /* */ } }, 25000);
      const abort = () => { clearInterval(ping); unsub(); try { controller.close(); } catch { /* */ } };
      request.signal.addEventListener('abort', abort);
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
