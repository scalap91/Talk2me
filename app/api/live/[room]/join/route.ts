/**
 * Talk2Me — /api/live/[room]/join  (Pascal 2026-07-04)
 * Un spectateur rejoint un live → message système « X a rejoint » diffusé en
 * temps réel dans le flux (canal bus `live:{room}`), et bufferisé (live_comments,
 * system=1) pour les arrivées suivantes. room = liveId = id du diffuseur.
 *
 * Le diffuseur qui « rejoint » sa propre salle n'émet rien (pas de « X a rejoint »
 * pour l'hôte lui-même).
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { addComment, isLive } from '@/lib/live/session';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });
  const { room } = await ctx.params;

  // L'hôte ne s'annonce pas dans sa propre salle.
  if (room === me.id) return Response.json({ ok: true, self: true });
  if (!isLive(room)) return Response.json({ ok: true, live: false });

  const author = { username: me.username, display_name: me.display_name };
  const ts = Date.now();
  // Message système bufferisé (text vide, system=true) + diffusion live_join.
  addComment(room, { author, text: '', system: true, ts });
  publish(`live:${room}`, { kind: 'live_join', data: { author, ts } });
  return Response.json({ ok: true });
}
