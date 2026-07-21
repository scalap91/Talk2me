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
import { addComment, isLive, isBanned, logViewer } from '@/lib/live/session';
import { publish } from '@/lib/realtime-bus';
import { getRencontreProfile, resolveLiveHost } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });
  const { room } = await ctx.params;
  const host = resolveLiveHost(room); // clé annonce → owner (état session côté owner)

  // L'hôte ne s'annonce pas dans sa propre salle.
  if (host === me.id) return Response.json({ ok: true, self: true });
  if (!isLive(host)) return Response.json({ ok: true, live: false });
  // BANNI par l'hôte → on ne le laisse pas rejoindre (ni log, ni annonce).
  if (isBanned(host, me.id)) return Response.json({ ok: false, banned: true }, { status: 403 });

  const prof = getRencontreProfile(me.id); // Rencontre : « X a rejoint » avec le pseudo, pas le nom de compte.
  const author = prof ? { username: prof.name, display_name: prof.name } : { username: me.username, display_name: me.display_name };
  const ts = Date.now();
  // Historique de connexion (réservé à l'hôte : viewer_id + pseudo affiché) → permet d'éjecter/bannir.
  logViewer(host, me.id, (author.display_name && author.display_name.trim()) || author.username);
  // Message système bufferisé (state côté owner) + diffusion sur le canal de la salle (clé).
  addComment(host, { author, text: '', system: true, ts });
  publish(`live:${room}`, { kind: 'live_join', data: { author, ts } });
  return Response.json({ ok: true });
}
