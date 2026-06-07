/**
 * POST /api/activities/[id]/accept
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Watch Together consentement.
 *
 * Le destinataire d'une activité 'pending' tap [▶ Synchroniser] dans
 * <WatchInviteBanner /> → cette route flip invite_status à 'accepted' et
 * broadcast 'watch_accepted' aux deux side. Le leader peut alors démarrer
 * le player, le peer aussi.
 *
 * Doctrine [[talk2me-watch-together-passthrough]] : Talk2Me synchronise
 * uniquement les events (play/pause/seek). Aucune vidéo n'est jamais
 * streamée. Chaque side ouvre l'iframe YouTube/etc. en local.
 *
 * Sécurité : participant only.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setActivityInviteStatus, userCanAccessActivity } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const access = userCanAccessActivity(id, me.id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // L'inviteur lui-même n'a pas à "accepter" sa propre activité.
  if (access.activity.started_by === me.id) {
    return NextResponse.json(
      { ok: true, activity: access.activity, note: 'self_invite' },
    );
  }

  if (access.activity.invite_status === 'declined') {
    return NextResponse.json({ error: 'already_declined' }, { status: 409 });
  }
  if (access.activity.invite_status === 'ended') {
    return NextResponse.json({ error: 'activity_ended' }, { status: 410 });
  }

  const updated = setActivityInviteStatus(id, 'accepted');
  if (!updated) {
    return NextResponse.json({ error: 'activity_ended' }, { status: 410 });
  }

  publish(`conv:${access.convId}`, {
    kind: 'watch_accepted',
    data: {
      conversation_id: access.convId,
      activity_id: id,
      activity: updated,
      from_user_id: me.id,
      sent_at: Date.now(),
    },
  });

  return NextResponse.json({ ok: true, activity: updated });
}
