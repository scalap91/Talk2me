/**
 * POST /api/activities/[id]/state
 *
 * Phase 5 — Met à jour le state d'une activité synchronisée et broadcast
 * l'événement sur le canal SSE conv:{convId}. C'est appelé par le LEADER après
 * play/pause/seek (pour kind='video') pour propager aux followers.
 *
 * Body : { state: unknown }
 *
 * Sécurité : user doit être participant de la conv de l'activité.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateActivityState, userCanAccessActivity } from '@/lib/db';
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

  let body: { state?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const state = body.state;
  if (typeof state !== 'object' || state === null) {
    return NextResponse.json({ error: 'state_required' }, { status: 400 });
  }

  const updated = updateActivityState(id, state);
  if (!updated) {
    return NextResponse.json({ error: 'activity_ended' }, { status: 410 });
  }

  publish(`conv:${access.convId}`, {
    kind: 'activity_state',
    data: {
      conversation_id: access.convId,
      activity_id: id,
      state: updated.state,
      from_user_id: me.id,
      sent_at: Date.now(),
    },
  });

  return NextResponse.json({ ok: true, activity: updated });
}
