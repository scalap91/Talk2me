/**
 * POST /api/activities/[id]/decline
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Watch Together consentement.
 *
 * Le destinataire d'une activité 'pending' tap [Refuser] dans
 * <WatchInviteBanner />. Cette route :
 *  1. invite_status → 'declined'
 *  2. broadcast 'watch_declined' (le leader voit que c'est refusé)
 *  3. setTimeout 5s → endActivity (cleanup automatique pour libérer la conv
 *     pour une prochaine invitation).
 *
 * Pourquoi pas end immédiat : laisser 5s au leader pour voir le statut UI.
 *
 * Sécurité : participant only.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { endActivity, setActivityInviteStatus, userCanAccessActivity } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

const AUTO_END_AFTER_MS = 5_000;

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const access = userCanAccessActivity(id, me.id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (access.activity.invite_status === 'ended') {
    return NextResponse.json({ error: 'activity_ended' }, { status: 410 });
  }
  if (access.activity.invite_status === 'accepted') {
    return NextResponse.json(
      { error: 'already_accepted' },
      { status: 409 },
    );
  }

  const updated = setActivityInviteStatus(id, 'declined');
  if (!updated) {
    return NextResponse.json({ error: 'activity_ended' }, { status: 410 });
  }

  publish(`conv:${access.convId}`, {
    kind: 'watch_declined',
    data: {
      conversation_id: access.convId,
      activity_id: id,
      from_user_id: me.id,
      sent_at: Date.now(),
    },
  });

  // Auto-cleanup après délai : libère la conv pour une prochaine invite.
  // Pas d'await — la réponse HTTP est déjà partie.
  setTimeout(() => {
    try {
      endActivity(id);
      publish(`conv:${access.convId}`, {
        kind: 'activity_end',
        data: {
          conversation_id: access.convId,
          activity_id: id,
          from_user_id: me.id,
          sent_at: Date.now(),
          reason: 'declined',
        },
      });
    } catch (e) {
      console.warn('[watch/decline] auto-end failed', e);
    }
  }, AUTO_END_AFTER_MS);

  return NextResponse.json({ ok: true, activity: updated });
}
