/**
 * POST /api/activities/start
 *
 * Phase 5 — Démarre une activité synchronisée dans une conversation.
 * MVP : une seule activité active par conv à la fois (les anciennes sont
 * automatiquement marquées ended_at par startActivity).
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Consentement Watch Together.
 *  - body.kind === 'video' → invite_status = 'pending' par défaut (peer doit
 *    accepter via POST /accept) + broadcast 'watch_invite' au lieu de
 *    'activity_start' direct, pour afficher l'overlay WatchInviteBanner chez
 *    le peer.
 *  - body.kind === 'chess'|'dame' → invite_status = 'accepted' (le jeu se
 *    matérialise immédiatement comme une card jouable, pas d'opt-in).
 *
 * Doctrine [[talk2me-watch-together-passthrough]] : Talk2Me synchronise
 * uniquement (play/pause/seek), aucun stream vidéo n'est jamais transporté.
 *
 * Body : { conv_id: string, kind: ActivityKind, state: unknown }
 *
 * Sécurité : participant de la conv only ; conv kind doit être 'p2p'.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getConversation, startActivity } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import type { ActivityKind } from '@/lib/activity-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KINDS: ActivityKind[] = ['video', 'music', 'whiteboard', 'chess', 'dame'];

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { conv_id?: unknown; kind?: unknown; state?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const convId = typeof body.conv_id === 'string' ? body.conv_id : '';
  const kind = body.kind as ActivityKind;
  const state = body.state;

  if (!convId) return NextResponse.json({ error: 'conv_id_required' }, { status: 400 });
  if (!ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  // Talk2Me #408 — kinds runtime supportés. Les jeux (chess/dame) ne s'appuient
  // PAS sur le pipeline activity_state : leur état vit dans chess_games /
  // dame_games. L'activité ici est un marqueur "il y a une partie en cours
  // dans cette conv".
  if (kind !== 'video' && kind !== 'chess' && kind !== 'dame') {
    return NextResponse.json({ error: 'kind_not_yet_supported' }, { status: 400 });
  }
  if (typeof state !== 'object' || state === null) {
    return NextResponse.json({ error: 'state_required' }, { status: 400 });
  }

  const conv = getConversation(convId, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (conv.kind !== 'p2p') {
    return NextResponse.json({ error: 'activity_p2p_only' }, { status: 400 });
  }

  // Talk2Me #408 — Vidéo = consentement requis (pending). Jeux = direct (accepted).
  const initialStatus: 'pending' | 'accepted' = kind === 'video' ? 'pending' : 'accepted';
  const activity = startActivity(convId, kind, state, me.id, initialStatus);

  // Broadcast :
  //  - vidéo pending → 'watch_invite' (peer voit overlay banner)
  //  - autres / accepted → 'activity_start' classique (legacy)
  if (kind === 'video' && initialStatus === 'pending') {
    publish(`conv:${convId}`, {
      kind: 'watch_invite',
      data: {
        conversation_id: convId,
        activity,
        from_user_id: me.id,
        sent_at: Date.now(),
      },
    });
  } else {
    publish(`conv:${convId}`, {
      kind: 'activity_start',
      data: {
        conversation_id: convId,
        activity,
        from_user_id: me.id,
        sent_at: Date.now(),
      },
    });
  }

  return NextResponse.json({ ok: true, activity });
}
