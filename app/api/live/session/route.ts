/**
 * Talk2Me — /api/live/session  (Pascal 2026-07-04)
 * Cycle de vie d'une session LIVE, déclenché par le diffuseur quand il passe /
 * sort du mode "En direct" (InlineCamera liveOn, pièce 3D Live toggle).
 *
 *   POST { action: 'start', title? } → ouvre la session (liveId = mon user id),
 *        et si c'est un NOUVEAU passage en direct → avertit mes amis (push + in-app).
 *   POST { action: 'end' }           → ferme la session + prévient les amis (fin).
 *
 * liveId renvoyé = mon user id (convention `live:{room}` partagée avec le WebRTC).
 * Doctrine [[talk2me-pii-air-gap]] : l'auteur ne transporte que username/display_name.
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { startLiveSession, endLiveSession } from '@/lib/live/session';
import { notifyFriendsGoLive, notifyFriendsLiveEnded } from '@/lib/live/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });

  let body: { action?: string; title?: string; entryPriceCents?: number };
  try {
    body = await request.json();
  } catch {
    return new Response('bad_request', { status: 400 });
  }
  const action = body.action;
  const author = { username: me.username, display_name: me.display_name };

  if (action === 'start') {
    const { liveId, isNew } = startLiveSession(me.id, author, body.title ?? null, body.entryPriceCents ?? null);
    // Nouveau passage en direct → on avertit les amis UNE seule fois (non bloquant).
    if (isNew) void notifyFriendsGoLive(me.id, author);
    return Response.json({ ok: true, liveId, isNew });
  }

  if (action === 'end') {
    endLiveSession(me.id);
    notifyFriendsLiveEnded(me.id);
    return Response.json({ ok: true, liveId: me.id });
  }

  return new Response('unknown_action', { status: 400 });
}
