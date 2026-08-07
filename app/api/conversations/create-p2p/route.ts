/**
 * POST /api/conversations/create-p2p { friend_id }
 * Crée (ou récupère) la conversation P2P avec un ami.
 *
 * Sécurité : friend_id doit correspondre à un User existant ET à un ami
 * accepté de l'user courant (pas d'ouverture de conv avec n'importe qui).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createP2PConversation, getUserById, isFriend } from '@/lib/db';
import { getContributor } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { friend_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const friendId = typeof body.friend_id === 'string' ? body.friend_id.trim() : '';
  if (!friendId) return NextResponse.json({ error: 'friend_id_required' }, { status: 400 });
  if (friendId === me.id) {
    return NextResponse.json({ error: 'cannot_p2p_self' }, { status: 400 });
  }
  const friend = getUserById(friendId);
  if (!friend) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  // Autorise si AMIS, ou si LIEN RÉSEAU direct (parrain ↔ filleul) — pour le relationnel/SAV de Mon Parcours.
  let allowed = isFriend(me.id, friendId);
  if (!allowed) {
    try {
      const a = getContributor(me.id);
      const b = getContributor(friendId);
      allowed = (!!a && a.sponsor_id === friendId) || (!!b && b.sponsor_id === me.id);
    } catch { /* pas contributeur */ }
  }
  if (!allowed) {
    return NextResponse.json({ error: 'not_friend' }, { status: 403 });
  }

  try {
    const conv = createP2PConversation(me.id, friendId);
    return NextResponse.json({
      ok: true,
      conversation: {
        id: conv.id,
        kind: conv.kind,
        created_at: conv.created_at,
        peer: {
          id: friend.id,
          talk2me_id: friend.talk2me_id,
          username: friend.username,
          display_name: friend.display_name,
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'create_failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
