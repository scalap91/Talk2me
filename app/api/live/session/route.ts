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
import { getSimpleShopByKey } from '@/lib/simple-shop';
import { notifyFriendsGoLive, notifyFriendsLiveEnded } from '@/lib/live/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });

  let body: { action?: string; title?: string; entryPriceCents?: number; roomKey?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('bad_request', { status: 400 });
  }
  const action = body.action;

  // DEUX types de live (Pascal 2026-07-15) :
  //  - LIVE ANNONCE (anonyme) : body.roomKey = clé publique d'une annonce M'APPARTENANT.
  //    identité EXPOSÉE = la clé (le user.id ne circule pas) ; auteur = PSEUDO de l'annonce.
  //  - LIVE USER (public, défaut) : identité = user.id ; auteur = nom de compte.
  let roomId = me.id;
  let author: { username: string; display_name: string | null } = { username: me.username, display_name: me.display_name };
  if (body.roomKey) {
    const shop = getSimpleShopByKey(body.roomKey.trim());
    if (!shop || shop.owner_id !== me.id) return Response.json({ ok: false, error: 'not_owner' }, { status: 403 });
    roomId = shop.public_key;
    author = { username: shop.name, display_name: shop.name }; // pseudo de l'annonce, jamais le compte
  }

  if (action === 'start') {
    const res = startLiveSession(me.id, author, body.title ?? null, body.entryPriceCents ?? null, roomId);
    // VERROU : déjà en direct sous l'AUTRE identité → refus. 1 seul live à la fois (anti-corrélation).
    if (res.conflict) {
      const currentKind = res.currentRoomId === me.id ? 'user' : 'annonce';
      return Response.json({ ok: false, conflict: true, currentKind, error: 'already_live' }, { status: 409 });
    }
    if (res.isNew) void notifyFriendsGoLive(me.id, author);
    return Response.json({ ok: true, liveId: res.liveId, isNew: res.isNew });
  }

  if (action === 'end') {
    endLiveSession(me.id);
    notifyFriendsLiveEnded(me.id);
    return Response.json({ ok: true, liveId: roomId });
  }

  return new Response('unknown_action', { status: 400 });
}
